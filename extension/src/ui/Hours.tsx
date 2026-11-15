import { useState } from "react";
import type { Availability } from "../storage/db";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Study hours" form: hours free on each weekday, saved as weekly_defaults in minutes. */
export function Hours({ availability, onSave }: { availability: Availability; onSave: (a: Availability) => Promise<void> }) {
  const [vals, setVals] = useState(() =>
    DAYS.map((_, d) => {
      const m = availability.weekly_defaults.find((x) => x.day === d)?.minutes;
      return m === undefined ? "" : String(m / 60);
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const hours = vals.map((v) => (v.trim() === "" ? 0 : Number(v)));
    if (hours.some((h) => !(h >= 0 && h <= 24))) return setError("Hours must be between 0 and 24.");
    setError(null);
    onSave({ ...availability, weekly_defaults: hours.map((h, day) => ({ day, minutes: Math.round(h * 60) })) }).catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  };
  return (
    <form id="study-hours" onSubmit={submit}>
      <h2>Study hours</h2>
      {DAYS.map((name, d) => (
        <label key={name}>
          {name}{" "}
          <input type="number" step="any" aria-label={name} value={vals[d]} onChange={(e) => setVals(vals.map((v, i) => (i === d ? e.target.value : v)))} />
        </label>
      ))}
      {error && <p role="alert">{error}</p>}
      <button type="submit">Save hours</button>
    </form>
  );
}
