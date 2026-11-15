import { createRoot } from "react-dom/client";
import { App } from "./App";
import { openDb, stores } from "../storage/db";
import { localDay } from "../model/encode";
import type { Cpts } from "../priors/cpts";
import bundledCpts from "../../../priors/tables/cpts.json";
import { connectCalendar } from "../calendar/freebusy";
import { loadOnOpen } from "./open";
import { downloadJson, exportData } from "../storage/export";

const root = createRoot(document.getElementById("root")!);
// A failed read shows a message instead of a blank popup.
const fail = (e: unknown) =>
  root.render(<p role="alert">Could not open your saved data: {e instanceof Error ? e.message : String(e)}</p>);
void openDb().then(async (db) => {
  const courseCache = stores(db).course_cache;
  const sessions = stores(db).study_session;
  const meta = stores(db).timer_meta;
  // First save records the first-use day (local); later saves keep it, even if sessions are deleted.
  const putSession: typeof sessions.put = async (x) => {
    await sessions.put(x);
    if (!(await meta.get("default"))) await meta.put({ id: "default", first_use: localDay(x.started_at) });
  };
  const bundled = bundledCpts as unknown as Cpts; // JSON import boundary; priors/ writes it in Cpts' shape
  const cached = (await stores(db).cpts_cache.get("default"))?.data ?? bundled;
  root.render(
    <App
      load={(progress) => loadOnOpen(db, { bundled }, progress)}
      initialCpts={cached}
      availability={await stores(db).availability.get("default")}
      settings={await stores(db).settings.get("default")}
      saveSettings={stores(db).settings.put}
      firstUse={(await meta.get("default"))?.first_use}
      initial={await courseCache.getAll()}
      save={courseCache.put}
      submissions={await stores(db).submission_history.getAll()}
      initialSessions={await sessions.getAll()}
      putSession={putSession}
      removeSession={sessions.delete}
      connect={() => connectCalendar()}
      onExport={async () => downloadJson(await exportData(db))}
    />,
  );
}).catch(fail);
