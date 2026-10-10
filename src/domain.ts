export type Mode = "single" | "multiple";
export type Status = "draft" | "rating" | "result";
export interface Factor {
  id: string;
  text: string;
  note: string;
  kind: "pro" | "con";
  knowledge: "known" | "unknown";
  score: number | null;
}
export interface BottomLine {
  id: string;
  text: string;
  state: "notViolated" | "violated" | "unconfirmed";
}
export interface Option {
  id: string;
  name: string;
  factors: Factor[];
  bottomLines: BottomLine[];
}
export interface Session {
  itemOrder: string[];
  currentItemId: string | null;
}
export interface Decision {
  id: string;
  schemaVersion: 1;
  revision: number;
  title: string;
  question: string;
  mode: Mode;
  baseline: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  options: Option[];
  commonConsiderations: string;
  session: Session | null;
  firstResultSnapshot: Snapshot | null;
}
export type Snapshot = Omit<Decision, "firstResultSnapshot"> & {
  revealedAt: string;
};
export const uid = () => crypto.randomUUID();
export const clone = <T>(x: T): T => structuredClone(x);
export const factors = (d: Decision | Snapshot) =>
  d.options.flatMap((o) => o.factors);
export const newOption = (): Option => ({
  id: uid(),
  name: "",
  factors: [],
  bottomLines: [],
});
export const newFactor = (kind: Factor["kind"]): Factor => ({
  id: uid(),
  text: "",
  note: "",
  kind,
  knowledge: "known",
  score: null,
});
export function newDecision(mode: Mode): Decision {
  const now = new Date().toISOString();
  return {
    id: uid(),
    schemaVersion: 1,
    revision: 0,
    title: "",
    question: "",
    mode,
    baseline: "維持現況",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    options: Array.from({ length: mode === "single" ? 1 : 2 }, newOption),
    commonConsiderations: "",
    session: null,
    firstResultSnapshot: null,
  };
}
export function readiness(d: Decision | Snapshot): string[] {
  const errors: string[] = [];
  if (!d.title.trim()) errors.push("請填寫決策標題");
  if (!d.question.trim()) errors.push("請填寫想回答的問題");
  if (!d.baseline.trim()) errors.push("請填寫比較基準");
  if (d.options.length < (d.mode === "single" ? 1 : 2))
    errors.push("至少需要兩個選項");
  const names = d.options.map((o) => o.name.trim());
  if (new Set(names).size !== names.length) errors.push("選項名稱不能重複");
  d.options.forEach((o, i) => {
    const label = o.name.trim() || `選項 ${i + 1}`;
    if (!o.name.trim())
      errors.push(
        `請填寫${d.mode === "single" ? "行動" : `選項 ${i + 1}`}名稱`,
      );
    if (!o.factors.some((f) => f.knowledge === "known" && f.text.trim()))
      errors.push(`${label}至少需要一項已知理由`);
    if (o.factors.some((f) => !f.text.trim()))
      errors.push(`${label}有空白理由，請填寫或移除`);
    if (o.bottomLines.some((b) => !b.text.trim()))
      errors.push(`${label}有空白底線，請填寫或移除`);
  });
  return errors;
}
export function criticalSignature(d: Decision | Snapshot) {
  return JSON.stringify([
    d.question,
    d.baseline,
    d.options.map((o) => [
      o.id,
      o.name,
      o.factors.map((f) => [f.id, f.text, f.note, f.kind, f.knowledge]),
    ]),
  ]);
}
export function comparisonSignature(d: Decision | Snapshot) {
  return JSON.stringify([
    criticalSignature(d),
    d.options.map((o) => o.bottomLines),
  ]);
}
export function reset(d: Decision): Decision {
  const next = clone(d);
  factors(next).forEach((f) => (f.score = null));
  next.session = null;
  next.status = "draft";
  return next;
}
export function start(d: Decision): Decision {
  const errors = readiness(d);
  if (errors.length) throw new Error(errors.join("；"));
  const next = reset(d);
  const order = factors(next)
    .filter((f) => f.knowledge === "known")
    .map((f) => f.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  next.session = { itemOrder: order, currentItemId: order[0] };
  next.status = "rating";
  return next;
}
export function rate(d: Decision, score: number): Decision {
  if (
    d.status !== "rating" ||
    !d.session?.currentItemId ||
    !Number.isInteger(score) ||
    score < 1 ||
    score > 5
  )
    throw new Error("評分狀態或分數不正確");
  const next = clone(d);
  const f = factors(next).find((f) => f.id === next.session!.currentItemId)!;
  f.score = score;
  const index = next.session!.itemOrder.indexOf(f.id);
  next.session!.currentItemId = next.session!.itemOrder[index + 1] ?? null;
  return next;
}
export function reveal(d: Decision): Decision {
  if (
    d.status !== "rating" ||
    factors(d).some((f) => f.knowledge === "known" && f.score === null)
  )
    throw new Error("請先完成所有評分");
  const next = clone(d);
  next.status = "result";
  next.session!.currentItemId = null;
  if (!next.firstResultSnapshot) {
    const { firstResultSnapshot: _, ...data } = clone(next);
    next.firstResultSnapshot = {
      ...data,
      revealedAt: new Date().toISOString(),
    };
  }
  return next;
}
export function eligibility(o: Option): "eligible" | "violated" | "pending" {
  return o.bottomLines.some((b) => b.state === "violated")
    ? "violated"
    : o.bottomLines.some((b) => b.state === "unconfirmed")
      ? "pending"
      : "eligible";
}
export function results(d: Decision | Snapshot) {
  const rows = d.options.map((o, index) => {
    const known = o.factors.filter((f) => f.knowledge === "known");
    const p = known
      .filter((f) => f.kind === "pro")
      .reduce((sum, f) => sum + (f.score ?? 0), 0);
    const c = known
      .filter((f) => f.kind === "con")
      .reduce((sum, f) => sum + (f.score ?? 0), 0);
    return {
      option: o,
      index,
      p,
      c,
      n: p - c,
      eligibility: eligibility(o),
      rank: 0,
    };
  });
  const ranked = rows
    .filter((r) => r.eligibility === "eligible")
    .sort((a, b) => b.n - a.n || a.index - b.index);
  ranked.forEach(
    (r, i) =>
      (r.rank = i > 0 && r.n === ranked[i - 1].n ? ranked[i - 1].rank : i + 1),
  );
  return {
    rows: [...ranked, ...rows.filter((r) => r.eligibility !== "eligible")],
    ranked,
    provisional: rows.some(
      (r) =>
        r.option.factors.some((f) => f.knowledge === "unknown") ||
        r.option.bottomLines.some((b) => b.state === "unconfirmed"),
    ),
    gap: ranked.length > 1 ? ranked[0].n - ranked[1].n : null,
  };
}

// Validate a backup before a single write is attempted; snapshots are checked independently.
function object(x: unknown): asserts x is Record<string, any> {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw new Error("備份結構不正確");
}
function text(x: unknown): asserts x is string {
  if (typeof x !== "string") throw new Error("備份文字欄位不正確");
}
function date(x: unknown) {
  text(x);
  if (!/^\d{4}-\d\d-\d\dT/.test(x) || !Number.isFinite(Date.parse(x)))
    throw new Error("備份日期不正確");
}
function array(x: unknown): asserts x is any[] {
  if (!Array.isArray(x)) throw new Error("備份清單不正確");
}
function one(x: unknown, values: unknown[]) {
  if (!values.includes(x)) throw new Error("備份狀態不正確");
}
function validateDecision(x: unknown, snapshot = false): asserts x is Decision {
  object(x);
  for (const key of [
    "id",
    "title",
    "question",
    "baseline",
    "commonConsiderations",
  ])
    text(x[key]);
  if (
    !x.id ||
    x.schemaVersion !== 1 ||
    !Number.isInteger(x.revision) ||
    x.revision < 0
  )
    throw new Error("不支援的資料版本或 ID");
  date(x.createdAt);
  date(x.updatedAt);
  one(x.mode, ["single", "multiple"]);
  one(x.status, ["draft", "rating", "result"]);
  array(x.options);
  if (x.mode === "single" && x.options.length !== 1)
    throw new Error("單一行動只能有一個選項");
  const ids = new Set([x.id]);
  const addId = (id: unknown) => {
    text(id);
    if (!id || ids.has(id)) throw new Error("備份包含重複或空白 ID");
    ids.add(id);
  };
  for (const o of x.options) {
    object(o);
    addId(o.id);
    text(o.name);
    array(o.factors);
    array(o.bottomLines);
    for (const f of o.factors) {
      object(f);
      addId(f.id);
      text(f.text);
      text(f.note);
      one(f.kind, ["pro", "con"]);
      one(f.knowledge, ["known", "unknown"]);
      if (
        f.score !== null &&
        (!Number.isInteger(f.score) || f.score < 1 || f.score > 5)
      )
        throw new Error("分數必須為 1～5 整數");
      if (f.knowledge === "unknown" && f.score !== null)
        throw new Error("未知理由不能有分數");
    }
    for (const b of o.bottomLines) {
      object(b);
      addId(b.id);
      text(b.text);
      one(b.state, ["notViolated", "violated", "unconfirmed"]);
    }
  }
  const all = factors(x as Decision);
  const known = all.filter((f) => f.knowledge === "known");
  if (x.status === "draft") {
    if (x.session !== null || all.some((f) => f.score !== null))
      throw new Error("草稿不能含評分進度");
  } else {
    if (readiness(x as Decision).length)
      throw new Error("評分或結果資料不完整");
    object(x.session);
    array(x.session.itemOrder);
    const order = x.session.itemOrder;
    if (
      order.length !== known.length ||
      new Set(order).size !== order.length ||
      order.some((id) => !known.some((f) => f.id === id))
    )
      throw new Error("評分順序有遺失引用或重複項目");
    if (
      x.session.currentItemId !== null &&
      !order.includes(x.session.currentItemId)
    )
      throw new Error("評分位置不正確");
    const cursor =
      x.session.currentItemId === null
        ? order.length
        : order.indexOf(x.session.currentItemId);
    if (
      order
        .slice(0, cursor)
        .some((id) => known.find((f) => f.id === id)?.score === null)
    )
      throw new Error("評分位置之前存在尚未評分的項目");
    if (x.session.currentItemId === null && known.some((f) => f.score === null))
      throw new Error("進度與分數不一致");
    if (
      x.status === "result" &&
      (known.some((f) => f.score === null) || x.session.currentItemId !== null)
    )
      throw new Error("結果尚未評分完成");
  }
  if (snapshot) {
    if ("firstResultSnapshot" in x || x.status !== "result")
      throw new Error("快照不可嵌套且必須為結果");
    date(x.revealedAt);
  } else {
    if (x.firstResultSnapshot !== null) {
      validateDecision(x.firstResultSnapshot, true);
      if (
        x.firstResultSnapshot.id !== x.id ||
        x.firstResultSnapshot.mode !== x.mode
      )
        throw new Error("快照不屬於此決策");
    } else if (x.status === "result") throw new Error("結果缺少首次快照");
  }
}
export interface Backup {
  formatVersion: 1;
  exportedAt: string;
  decisions: Decision[];
}
export function parseBackup(raw: string): Backup {
  const x: unknown = JSON.parse(raw);
  object(x);
  if (x.formatVersion !== 1) throw new Error("不支援的備份版本");
  date(x.exportedAt);
  array(x.decisions);
  const used = new Set<string>();
  x.decisions.forEach((d: unknown) => {
    validateDecision(d);
    const ids = [
      d.id,
      ...d.options.flatMap((o) => [
        o.id,
        ...o.factors.map((f) => f.id),
        ...o.bottomLines.map((b) => b.id),
      ]),
    ];
    ids.forEach((id) => {
      if (used.has(id)) throw new Error("決策之間存在重複 ID");
      used.add(id);
    });
  });
  return x as unknown as Backup;
}
export function importCopies(backup: Backup): Decision[] {
  return backup.decisions.map((original) => {
    const d = clone(original);
    const map = new Map<string, string>();
    const replace = (id: string) => {
      if (!map.has(id)) map.set(id, uid());
      return map.get(id)!;
    };
    const remap = (data: Decision | Snapshot) => {
      data.id = replace(data.id);
      data.options.forEach((o) => {
        o.id = replace(o.id);
        o.factors.forEach((f) => (f.id = replace(f.id)));
        o.bottomLines.forEach((b) => (b.id = replace(b.id)));
      });
      if (data.session) {
        data.session.itemOrder = data.session.itemOrder.map(replace);
        data.session.currentItemId =
          data.session.currentItemId === null
            ? null
            : replace(data.session.currentItemId);
      }
    };
    remap(d);
    if (d.firstResultSnapshot) remap(d.firstResultSnapshot);
    d.revision = 0;
    return d;
  });
}
