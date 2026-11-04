import { SCHEMA_VERSION, stores, type Schema } from "./db";

export interface DataExport {
  schema_version: number;
  exported_at: string;
  stores: { [K in keyof Schema]: Schema[K][] };
}

/** Reads every store into one object. Local only: nothing is sent anywhere. */
export async function exportData(db: IDBDatabase, now = new Date()): Promise<DataExport> {
  const s = stores(db);
  const entries = await Promise.all(
    Object.entries(s).map(async ([name, st]) => [name, await st.getAll()] as const),
  );
  return {
    schema_version: SCHEMA_VERSION,
    exported_at: now.toISOString(),
    stores: Object.fromEntries(entries) as DataExport["stores"],
  };
}

/** Saves the export as a JSON file through the browser's download. */
export function downloadJson(data: DataExport): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `study-planner-export-${data.exported_at.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
