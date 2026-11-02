import { useState } from "react";
import type { CourseCache } from "../canvas/load";
import { setDueAt } from "../canvas/undated";
import { Undated } from "./Undated";

// shortcut: courses come in as a prop; wiring to the IndexedDB course_cache and persisting confirmed dates across reloads is a later issue.
export function App({ initial = [] }: { initial?: CourseCache[] }) {
  const [courses, setCourses] = useState(initial);
  return (
    <>
      <h1>Bayesian Study Planner</h1>
      <Undated courses={courses} onSet={(c, i, d) => setCourses(setDueAt(courses, c, i, d))} />
    </>
  );
}
