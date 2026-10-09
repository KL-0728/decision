import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  newDecision,
  newFactor,
  newOption,
  start,
  rate,
  reveal,
  results,
  clone,
  reset,
  parseBackup,
  importCopies,
  criticalSignature,
  comparisonSignature,
  type Decision,
} from "../../src/domain";
import { saveDecision, listDecisions, insertCopies } from "../../src/storage";
function fixture(mode: "single" | "multiple" = "single") {
  const d = newDecision(mode);
  d.title = "工作";
  d.question = "是否換工作";
  d.baseline = "維持現況";
  d.options.forEach((o, i) => {
    o.name = `公司 ${i}`;
    const p = newFactor("pro");
    p.text = "成長";
    o.factors.push(p);
  });
  return d;
}
function complete(d: Decision) {
  let next = start(d);
  while (next.session?.currentItemId) next = rate(next, 3);
  return reveal(next);
}
function backup(d: Decision[]) {
  return JSON.stringify({
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    decisions: d,
  });
}
describe("decision rules", () => {
  it("sums 5+3 versus 4 as +4 only after complete rating", () => {
    const d = fixture();
    const p = newFactor("pro");
    p.text = "薪資";
    const c = newFactor("con");
    c.text = "通勤";
    d.options[0].factors.push(p, c);
    let next = start(d);
    const scores = new Map(
      d.options[0].factors.map((f, i) => [f.id, [5, 3, 4][i]]),
    );
    while (next.session?.currentItemId)
      next = rate(next, scores.get(next.session.currentItemId)!);
    next = reveal(next);
    expect(results(next).rows[0]).toMatchObject({ p: 8, c: 4, n: 4 });
  });
  it("does not reveal incomplete ratings or accept illegal scores", () => {
    const d = start(fixture());
    expect(() => reveal(d)).toThrow();
    expect(() => rate(d, 0)).toThrow();
    expect(() => rate(d, 1.5)).toThrow();
    expect(d.options[0].factors[0].score).toBeNull();
  });
  it("keeps unknown items out of the queue and marks results provisional", () => {
    const d = fixture();
    const u = newFactor("con");
    u.text = "待查工時";
    u.knowledge = "unknown";
    d.options[0].factors.push(u);
    const next = complete(d);
    expect(next.session?.itemOrder).toHaveLength(1);
    expect(next.options[0].factors[1].score).toBeNull();
    expect(results(next).provisional).toBe(true);
  });
  it("excludes violations and pending lines from eligible ranking", () => {
    const d = fixture("multiple");
    const third = newOption();
    third.name = "第三";
    third.factors = [{ ...newFactor("pro"), text: "好處" }];
    d.options.push(third);
    d.options[0].bottomLines = [
      { id: crypto.randomUUID(), text: "夜班", state: "violated" },
    ];
    d.options[1].bottomLines = [
      { id: crypto.randomUUID(), text: "工時", state: "unconfirmed" },
    ];
    const r = results(complete(d));
    expect(r.ranked).toHaveLength(1);
    expect(r.ranked[0].option.name).toBe("第三");
    expect(r.gap).toBeNull();
    expect(r.provisional).toBe(true);
  });
  it("uses competition ranking and zero gap for tied leaders", () => {
    const d = fixture("multiple");
    d.options.push({
      ...newOption(),
      name: "第三",
      factors: [{ ...newFactor("pro"), text: "好處" }],
    });
    const next = complete(d);
    next.options[0].factors[0].score = 5;
    next.options[1].factors[0].score = 5;
    expect(results(next).ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(results(next).gap).toBe(0);
  });
  it("preserves the immutable first result when resetting and revealing again", () => {
    const d = complete(fixture());
    const first = clone(d.firstResultSnapshot);
    const next = start(d);
    next.options[0].factors[0].text = "新理由";
    const last = reveal(rate(next, 1));
    expect(last.firstResultSnapshot).toEqual(first);
    expect(reset(last).options[0].factors[0].score).toBeNull();
    expect(reset(last).session).toBeNull();
  });
  it("distinguishes scoring context from metadata and bottom-line changes", () => {
    const d = fixture();
    const next = clone(d);
    next.title = "新標題";
    expect(criticalSignature(next)).toBe(criticalSignature(d));
    next.options[0].bottomLines.push({
      id: crypto.randomUUID(),
      text: "底線",
      state: "unconfirmed",
    });
    expect(criticalSignature(next)).toBe(criticalSignature(d));
    expect(comparisonSignature(next)).not.toBe(comparisonSignature(d));
    next.baseline = "另一基準";
    expect(criticalSignature(next)).not.toBe(criticalSignature(d));
  });
});
describe("backup integrity", () => {
  it("rejects a cursor that skips unrated items", () => {
    const d = fixture();
    d.options[0].factors.push({ ...newFactor("pro"), text: "薪資" });
    const next = start(d);
    next.session!.currentItemId = next.session!.itemOrder[1];
    expect(() => parseBackup(backup([next]))).toThrow("尚未評分");
  });
  it("remaps IDs including deleted historical items without losing progress", () => {
    const d = complete(fixture());
    const historical = d.options[0].factors[0].id;
    let next = reset(d);
    next.options[0].factors = [{ ...newFactor("con"), text: "新理由" }];
    next = start(next);
    const copy = importCopies(parseBackup(backup([next])))[0];
    expect(copy.id).not.toBe(next.id);
    expect(copy.firstResultSnapshot?.id).toBe(copy.id);
    expect(copy.firstResultSnapshot?.options[0].factors[0].id).not.toBe(
      historical,
    );
    expect(copy.session?.itemOrder[0]).toBe(copy.options[0].factors[0].id);
    expect(copy.createdAt).toBe(next.createdAt);
    expect(() => parseBackup(backup([copy]))).not.toThrow();
  });
  it.each(["score", "duplicate", "missing", "unknown", "snapshot", "version"])(
    "rejects corrupted %s data",
    (type) => {
      const d = complete(fixture());
      if (type === "score") d.options[0].factors[0].score = 9;
      if (type === "duplicate")
        d.session!.itemOrder.push(d.session!.itemOrder[0]);
      if (type === "missing") d.session!.itemOrder[0] = "missing";
      if (type === "unknown") d.options[0].factors[0].knowledge = "unknown";
      if (type === "snapshot") d.firstResultSnapshot = null;
      if (type === "version") (d as any).schemaVersion = 99;
      expect(() => parseBackup(backup([d]))).toThrow();
    },
  );
});
describe("atomic storage", () => {
  it("rejects stale writes and keeps the newer contents", async () => {
    const saved = await saveDecision(fixture());
    const changed = clone(saved);
    changed.title = "新標題";
    await saveDecision(changed);
    await expect(saveDecision(saved)).rejects.toThrow("其他分頁");
    expect((await listDecisions()).find((d) => d.id === saved.id)?.title).toBe(
      "新標題",
    );
  });
  it("rolls back every import record when any add fails", async () => {
    const existing = await saveDecision(fixture());
    const copy = fixture();
    await expect(insertCopies([copy, existing])).rejects.toThrow();
    expect((await listDecisions()).some((d) => d.id === copy.id)).toBe(false);
    expect((await listDecisions()).some((d) => d.id === existing.id)).toBe(
      true,
    );
  });
});
