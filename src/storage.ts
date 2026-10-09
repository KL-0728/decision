import { openDB } from "idb";
import { clone, type Decision } from "./domain";
let connection: ReturnType<typeof openDB> | undefined;
const db = () =>
  (connection ??= openDB("decision-local", 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("decisions"))
        database.createObjectStore("decisions", { keyPath: "id" });
    },
  }).catch((error) => {
    connection = undefined;
    throw error;
  }));
export async function listDecisions(): Promise<Decision[]> {
  const database = await db();
  return database.getAll("decisions");
}
export async function saveDecision(d: Decision): Promise<Decision> {
  const database = await db();
  const tx = database.transaction("decisions", "readwrite");
  const old: Decision | undefined = await tx.store.get(d.id);
  if ((old && old.revision !== d.revision) || (!old && d.revision !== 0)) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error(
      "其他分頁已更新此決策。請重新載入，未保存的輸入仍保留在畫面。",
    );
  }
  const next = clone(d);
  next.revision++;
  next.updatedAt = new Date().toISOString();
  await tx.store.put(next);
  await tx.done;
  return next;
}
export async function deleteDecision(d: Decision) {
  const database = await db();
  const tx = database.transaction("decisions", "readwrite");
  const old = await tx.store.get(d.id);
  if (old?.revision !== d.revision) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("此決策已在其他分頁變更，請重新載入後再刪除");
  }
  await tx.store.delete(d.id);
  await tx.done;
}
export async function insertCopies(copies: Decision[]) {
  const database = await db();
  const tx = database.transaction("decisions", "readwrite");
  try {
    for (const d of copies) await tx.store.add(d);
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw error;
  }
}
