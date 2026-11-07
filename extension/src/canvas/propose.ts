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
const MON = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?";
const MD = new RegExp(`\\b${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "i");
const DM = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON}(?:,?\\s+(\\d{4}))?\\b`, "i");
const ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const RANGE = /\bmodules?\s+(\d+)\s*(?:-|–|—|to|through)\s*(\d+)\b/i;

const pad = (n: number) => String(n).padStart(2, "0");
function findDate(s: string, defaultYear: number): string | null {
  const iso = ISO.exec(s);
  if (iso) return iso[0];
  const md = MD.exec(s);
  const dm = md ? null : DM.exec(s);
  const [mon, day, yr] = md ? [md[1], md[2], md[3]] : dm ? [dm[2], dm[1], dm[3]] : [];
  if (!mon) return null;
  const m = MONTHS.indexOf(mon.toLowerCase()) + 1;
  const d = Number(day);
  return d >= 1 && d <= 31 ? `${yr ?? defaultYear}-${pad(m)}-${pad(d)}` : null;
}

/**
 * Pure text search (no network, no model). Items with a Canvas due date, or named by a calendar
 * event, are skipped: those sources take precedence over text matches.
 * shortcut: a keyword matching several items (e.g. two midterms) is split by the number in the sentence; if still ambiguous, no proposal.
 */
export function proposeFromText(course: CourseCache, now: Date = new Date()): Proposal[] {
  const texts: { source: Proposal["source"]; text: string; year: number }[] = [];
  if (course.syllabus) texts.push({ source: "syllabus", text: course.syllabus, year: now.getFullYear() });
  for (const a of course.announcements ?? []) {
    const y = a.posted_at ? new Date(a.posted_at).getFullYear() : now.getFullYear();
    texts.push({ source: "announcement", text: `${a.title}. ${a.message}`, year: y });
  }
  const eventTitles = (course.events ?? []).filter((e) => e.start_at).map((e) => e.title.toLowerCase());
  const out: Proposal[] = [];
  for (const { source, text, year } of texts) {
    for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z])|\n/).map((s) => s.trim()).filter(Boolean)) {
      const kw = KEYWORDS.find(([k]) => k.test(sentence));
      if (!kw) continue;
      let cands = course.items.filter((i) => kw[1].test(i.name));
      const num = /\b(?:midterm|exam|quiz)\s*#?(\d)\b/i.exec(sentence)?.[1];
      if (cands.length > 1 && num) cands = cands.filter((i) => new RegExp(`\\b${num}\\b`).test(i.name));
      const item = cands.length === 1 ? cands[0] : null;
      const range = RANGE.exec(sentence);
      if (range) {
        const [a, b] = [Number(range[1]), Number(range[2])];
        const modules = Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => a + k);
        if (modules.length) out.push({ provisional: true, source, sentence, kind: "coverage", item_id: item?.item_id ?? null, modules });
      }
      const date = findDate(sentence, year);
      if (date && item && !item.due_at && !eventTitles.some((t) => t.includes(item.name.toLowerCase()))) {
        out.push({ provisional: true, source, sentence, kind: "date", item_id: item.item_id, date });
      }
    }
  }
  return out;
}
