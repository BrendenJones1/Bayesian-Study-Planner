import { createRoot } from "react-dom/client";
import { App } from "./App";
import { openDb, stores } from "../storage/db";
import { downloadJson, exportData } from "../storage/export";

const root = createRoot(document.getElementById("root")!);
void openDb().then(async (db) => {
  const courseCache = stores(db).course_cache;
  const sessions = stores(db).study_session;
  root.render(
    <App
      initial={await courseCache.getAll()}
      save={courseCache.put}
      submissions={await stores(db).submission_history.getAll()}
      initialSessions={await sessions.getAll()}
      putSession={sessions.put}
      removeSession={sessions.delete}
      onExport={async () => downloadJson(await exportData(db))}
    />,
  );
});
