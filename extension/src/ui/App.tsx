import { useState } from "react";
import type { CourseCache } from "../canvas/load";
import { confirmDueAt } from "../canvas/undated";
import { Undated } from "./Undated";

export function App({
  initial = [],
  save,
}: {
  initial?: CourseCache[];
  save: (c: CourseCache) => Promise<void>;
}) {
  const [courses, setCourses] = useState(initial);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <h1>Bayesian Study Planner</h1>
      {failed && <p role="alert">Could not save the date.</p>}
      <Undated
        courses={courses}
        onSet={(c, i, d) =>
          confirmDueAt(courses, c, i, d, save).then(
            (next) => {
              setFailed(false);
              setCourses(next);
            },
            () => setFailed(true),
          )
        }
      />
    </>
  );
}
