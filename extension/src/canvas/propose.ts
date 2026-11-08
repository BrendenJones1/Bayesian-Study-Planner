import type { CourseCache } from "./load";

/** A provisional guess from syllabus/announcement text. Never applied automatically; the student confirms. */
export type Proposal = {
  provisional: true;
  source: "syllabus" | "announcement";
  /** The sentence the guess came from, shown for confirmation. */
  sentence: string;
} & (
  | { kind: "date"; item_id: string; date: string } // date is YYYY-MM-DD, the form confirmDueAt takes
  | { kind: "coverage"; item_id: string | null; modules: number[] } // module numbers as written in the text
);

const KEYWORDS: [RegExp, RegExp][] = [
  [/midterm/i, /midterm/i],
  [/\bfinal\b|\bexam/i, /final|exam/i], // item names for "final" and "exam" overlap
  [/quiz/i, /quiz/i],
];
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
// Full names or standard abbreviations, whole words only ("Marching", "Mayor" do not match).
const MON = "(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\\b\\.?";
const MD = new RegExp(`\\b${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "i");
const DM = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON}(?:,?\\s+(\\d{4}))?\\b`, "i");
const ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const RANGE = /\bmodules?\s+(\d+)\s*(?:-|–|—|to|through)\s*(\d+)\b/i;

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
const pad = (n: number) => String(n).padStart(2, "0");
const SLACK = 14 * 86400000;
type Found = { m: number; d: number; yr?: string; start: number; end: number };
function findDate(s: string): Found | null {
  const iso = ISO.exec(s);
  if (iso) return { yr: iso[1], m: Number(iso[2]), d: Number(iso[3]), start: iso.index, end: iso.index + iso[0].length };
  const md = MD.exec(s);
  const dm = md ? null : DM.exec(s);
  const x = md ?? dm;
  if (!x) return null;
  const [mon, day, yr] = md ? [md[1], md[2], md[3]] : [dm![2], dm![1], dm![3]];
  const d = Number(day);
  if (d < 1 || d > 31) return null;
  return { m: MONTHS.indexOf(mon.slice(0, 3).toLowerCase()) + 1, d, yr, start: x.index, end: x.index + x[0].length };
}

/** YYYY-MM-DD, or null for an impossible date such as Feb 31. */
function fmt(y: number, m: number, d: number): string | null {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Yearless dates take the year that lands in the course window (±14 days); none fits -> null. No window: the default year. */
function toIso(f: Found, defaultYear: number, win: [number, number] | null): string | null {
  if (f.yr) return fmt(Number(f.yr), f.m, f.d);
  if (!win) return fmt(defaultYear, f.m, f.d);
  const years = [new Date(win[0]).getUTCFullYear(), new Date(win[1]).getUTCFullYear()];
  const y = years.find((y) => {
    const t = Date.UTC(y, f.m - 1, f.d);
    return fmt(y, f.m, f.d) !== null && t >= win[0] - SLACK && t <= win[1] + SLACK;
  });
  return y === undefined ? null : fmt(y, f.m, f.d);
}

/** The keyword match closest in characters to the span [from, to]; ties go to the earlier one. */
function nearestKeyword(s: string, from: number, to: number) {
  let best: { kw: (typeof KEYWORDS)[number]; end: number; dist: number } | null = null;
  for (const kw of KEYWORDS) {
    for (const m of s.matchAll(new RegExp(kw[0], "gi"))) {
      const dist = Math.max(m.index - to, from - (m.index + m[0].length), 0);
      if (!best || dist < best.dist) best = { kw, end: m.index + m[0].length, dist };
    }
  }
  return best;
}

/**
 * Pure text search (no network, no model). Items with a Canvas due date, or named by a calendar
 * event, are skipped: those sources take precedence over text matches.
 * Known simplification: a keyword matching several items (e.g. two midterms) is split by the number after it; if still ambiguous, no proposal.
 */
export function proposeFromText(course: CourseCache, now: Date = new Date()): Proposal[] {
  const texts: { source: Proposal["source"]; text: string; year: number }[] = [];
  if (course.syllabus) texts.push({ source: "syllabus", text: course.syllabus, year: now.getFullYear() });
  for (const a of course.announcements ?? []) {
    const y = a.posted_at ? new Date(a.posted_at).getFullYear() : now.getFullYear();
    texts.push({ source: "announcement", text: `${a.title}. ${a.message}`, year: y });
  }
  const win: [number, number] | null =
    course.start_at && course.end_at ? [Date.parse(course.start_at), Date.parse(course.end_at)] : null;
  const eventTitles = (course.events ?? []).filter((e) => e.start_at).map((e) => norm(e.title));
  const out: Proposal[] = [];
  for (const { source, text, year } of texts) {
    for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z])|\n/).map((s) => s.trim()).filter(Boolean)) {
      const found = findDate(sentence);
      const range = RANGE.exec(sentence);
      const anchor = found ?? (range && { start: range.index, end: range.index + range[0].length });
      const near = nearestKeyword(sentence, anchor?.start ?? 0, anchor?.end ?? 0);
      if (!near) continue;
      let cands = course.items.filter((i) => near.kw[1].test(i.name));
      const num = /^\w*\s*#?(\d)\b/.exec(sentence.slice(near.end))?.[1];
      if (cands.length > 1 && num) cands = cands.filter((i) => new RegExp(`\\b${num}\\b`).test(i.name));
      const item = cands.length === 1 ? cands[0] : null;
      if (range) {
        const [a, b] = [Number(range[1]), Number(range[2])];
        const modules = Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => a + k);
        if (modules.length) out.push({ provisional: true, source, sentence, kind: "coverage", item_id: item?.item_id ?? null, modules });
      }
      const date = found && toIso(found, year, win);
      if (date && item && !item.due_at && !eventTitles.some((t) => t === norm(item.name))) {
        out.push({ provisional: true, source, sentence, kind: "date", item_id: item.item_id, date });
      }
    }
  }
  return out;
}
