import { createRoot } from "react-dom/client";
import { App } from "./App";
import { openDb, stores } from "../storage/db";
import { localDay } from "../model/encode";
import { downloadJson, exportData } from "../storage/export";

const root = createRoot(document.getElementById("root")!);
void openDb().then(async (db) => {
  const courseCache = stores(db).course_cache;
  const sessions = stores(db).study_session;
  const meta = stores(db).timer_meta;
  // First save records the first-use day (local); later saves keep it, even if sessions are deleted.
  const putSession: typeof sessions.put = async (x) => {
    await sessions.put(x);
    if (!(await meta.get("default"))) await meta.put({ id: "default", first_use: localDay(x.started_at) });
  };
  root.render(
    <App
      initial={await courseCache.getAll()}
      save={courseCache.put}
      submissions={await stores(db).submission_history.getAll()}
      initialSessions={await sessions.getAll()}
      putSession={putSession}
      removeSession={sessions.delete}
      onExport={async () => downloadJson(await exportData(db))}
    />,
  );
});
