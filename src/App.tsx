import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  actionFromQuestion,
  detectTopic,
  promptsFor,
  suggestedFactor,
  topicNames,
  type Topic,
} from "./prompts";
import {
  clone,
  newDecision,
  newOption,
  newFactor,
  uid,
  factors,
  readiness,
  criticalSignature,
  comparisonSignature,
  reset,
  start,
  rate,
  reveal,
  results,
  parseBackup,
  importCopies,
  type Decision,
  type Snapshot,
  type Mode,
  type Backup,
} from "./domain";
import {
  listDecisions,
  saveDecision,
  deleteDecision,
  insertCopies,
} from "./storage";

type Confirm = (
  title: string,
  message: string,
  label?: string,
) => Promise<boolean>;
const statuses = { draft: "草稿", rating: "評分中", result: "已揭曉" };
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const formatDate = (s: string) =>
  new Date(s).toLocaleDateString("zh-TW", { month: "short", day: "numeric" });
function Field({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          rows={2}
        />
      ) : (
        <input
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
        />
      )}
    </label>
  );
}
function Modal({
  title,
  children,
  onClose,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-body">
        <div className="section-head">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="關閉">
            ×
          </button>
        </div>
        {children}
      </div>
      {footer && <div className="dialog-footer">{footer}</div>}
    </dialog>
  );
}
export default function App() {
  const [decisions, setDecisions] = useState<Decision[]>([]),
    [active, setActive] = useState<string | null>(null),
    [view, setView] = useState<"edit" | "rating" | "result">("edit");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [saveStatus, setSaveStatus] = useState("已保存"),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  const [create, setCreate] = useState(false),
    [help, setHelp] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const [backup, setBackup] = useState<Backup | null>(null),
    [notice, setNotice] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [existingReady, setExistingReady] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<
    | (Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: string }>;
      })
    | null
  >(null);
  const [confirmData, setConfirmData] = useState<{
    title: string;
    message: string;
    label: string;
    resolve: (v: boolean) => void;
  } | null>(null);
  const file = useRef<HTMLInputElement>(null),
    working = useRef(false),
    confirmPending = useRef(false);
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: () =>
      setNotice("離線資源尚未準備完成，請保持連線並重新開啟。"),
  });
  const ready = offlineReady || existingReady;
  useEffect(() => {
    if (!import.meta.env.DEV && "serviceWorker" in navigator)
      void navigator.serviceWorker.ready.then((reg) => {
        if (reg.active) setExistingReady(true);
      });
    const capture = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as NonNullable<typeof installPrompt>);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);
  useEffect(() => {
    listDecisions()
      .then(setDecisions)
      .catch(() =>
        setError(
          "無法讀取裝置資料。請確認瀏覽器允許網站儲存，勿清除既有資料。",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    const heading = document.querySelector<HTMLElement>("main h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }, [active, view, loading]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty || working.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  const confirm: Confirm = (title, message, label = "確認") => {
    if (confirmPending.current) return Promise.resolve(false);
    confirmPending.current = true;
    return new Promise((resolve) =>
      setConfirmData({ title, message, label, resolve }),
    );
  };
  const settle = (value: boolean) => {
    confirmPending.current = false;
    confirmData?.resolve(value);
    setConfirmData(null);
  };
  async function save(d: Decision): Promise<Decision | null> {
    if (working.current) return null;
    working.current = true;
    setBusy(true);
    setSaveStatus("保存中");
    setError("");
    try {
      const saved = await saveDecision(d);
      setDecisions((old) => [saved, ...old.filter((x) => x.id !== saved.id)]);
      setSaveStatus("已保存");
      setDirty(false);
      return saved;
    } catch (e) {
      setError(
        e instanceof DOMException
          ? "裝置無法保存，可能是儲存空間不足或瀏覽器限制。輸入仍保留在畫面，請檢查後重試。"
          : e instanceof Error
            ? e.message
            : "保存失敗，請重試",
      );
      setSaveStatus("保存失敗");
      return null;
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function leave() {
    if (working.current) {
      setNotice("正在保存，請稍候再返回。");
      return;
    }
    if (
      dirty &&
      !(await confirm(
        "還有尚未保存的內容",
        "要離開並放棄目前畫面中尚未保存的輸入嗎？",
        "放棄並返回",
      ))
    )
      return;
    setActive(null);
    setDirty(false);
    setError("");
    setSaveStatus("已保存");
  }
  async function make(mode: Mode) {
    const saved = await save(newDecision(mode));
    if (saved) {
      setCreate(false);
      setActive(saved.id);
      setView("edit");
    }
  }
  async function exportAll() {
    if (dirty || busy) {
      setNotice("請先等候保存完成；保存失敗時請先重試，再匯出。");
      return;
    }
    try {
      const all = await listDecisions();
      const data = {
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        decisions: all,
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `decision-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setNotice("備份已匯出，請妥善保管 JSON 檔案。");
    } catch {
      setError("無法匯出，裝置資料讀取失敗。");
    }
  }
  async function readFile(f: File) {
    try {
      if (f.size > 10 * 1024 * 1024)
        throw new Error("備份超過 10 MB，請選擇較小的檔案");
      setBackup(parseBackup(await f.text()));
    } catch (e) {
      setError(`無法匯入：${e instanceof Error ? e.message : "檔案不正確"}`);
    } finally {
      if (file.current) file.current.value = "";
    }
  }
  async function doImport() {
    if (!backup) return;
    setBusy(true);
    try {
      await insertCopies(importCopies(backup));
      setDecisions(await listDecisions());
      setBackup(null);
      setNotice("已新增備份副本，原本的決策保持不變。");
    } catch {
      setError("匯入失敗，沒有新增任何副本；請確認儲存空間後重試。");
    } finally {
      setBusy(false);
    }
  }
  const d = decisions.find((x) => x.id === active);
  const shown = decisions
    .filter(
      (d) =>
        (filter === "all" || d.status === filter) &&
        `${d.title} ${d.question}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="app-shell">
      <header className="site-header">
        <button
          className="brand"
          onClick={() => void leave()}
          aria-label="decision 決策列表"
        >
          <img src="/icon-192.png" alt="" />
          <span>
            decision<span className="brand-dot">.</span>
          </span>
        </button>
        <div className="header-actions">
          <span className={`connection ${ready ? "ready" : ""}`}>
            <i />
            {ready
              ? online
                ? "可離線使用"
                : "離線使用中"
              : import.meta.env.DEV
                ? "開發預覽"
                : "離線準備中"}
          </span>
          <button
            className="icon-button"
            aria-label="使用與安裝說明"
            onClick={() => setHelp(true)}
          >
            ?
          </button>
        </div>
      </header>
      <main>
        {needRefresh && (
          <div className="notice">
            <span>有新版本。更新會保留裝置上的決策。</span>
            <button
              disabled={dirty || busy || d?.status === "rating"}
              onClick={() => void updateServiceWorker(true)}
            >
              更新網站
            </button>
            {d?.status === "rating" && <small>完成本輪評分後再更新</small>}
          </div>
        )}
        {notice && (
          <div role="status" className="notice">
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label="關閉提示">
              ×
            </button>
          </div>
        )}
        {error && (
          <div role="alert" className="error-box">
            {error}
          </div>
        )}
        {loading ? (
          <div className="empty-state">正在打開你的決策小屋…</div>
        ) : !d ? (
          <>
            <section className={`hero ${decisions.length ? "returning" : ""}`}>
              <div className="hero-copy">
                <span className="eyebrow">給每個選擇，一點思考的空間</span>
                <h1>
                  站在岔路口，
                  <br />
                  也可以慢慢想<span>。</span>
                </h1>
                <p>
                  把心裡的利弊寫下來，一次只想一件事。
                  <br className="desktop-break" />
                  等想法整理好了，再看看答案的方向。
                </p>
                <button className="primary" onClick={() => setCreate(true)}>
                  <span>＋</span> 建立新決策
                </button>
                <div className="hero-caption">
                  <span>01 寫下想法</span>
                  <i>→</i>
                  <span>02 逐項評分</span>
                  <i>→</i>
                  <span>03 看見方向</span>
                </div>
              </div>
              <div className="hero-art">
                <img
                  src="/illustration.webp"
                  alt="背著小背包的旅人，站在左右分岔的小路前"
                />
                <span className="art-note">每一條路，都有自己的風景。</span>
              </div>
            </section>
            <section className="library">
              <div className="section-head">
                <div>
                  <span className="eyebrow">MY DECISIONS</span>
                  <h2>
                    我的決策 <span className="count">{decisions.length}</span>
                  </h2>
                </div>
                <div className="toolbar">
                  <button
                    className="quiet"
                    disabled={busy}
                    onClick={() => file.current?.click()}
                  >
                    匯入備份
                  </button>
                  <button
                    className="quiet"
                    onClick={() => void exportAll()}
                    disabled={busy || !decisions.length}
                  >
                    匯出備份 ↗
                  </button>
                </div>
              </div>
              {decisions.length > 0 && (
                <div className="list-controls">
                  <div className="filters">
                    {[
                      ["all", "全部"],
                      ["draft", "草稿"],
                      ["rating", "評分中"],
                      ["result", "已揭曉"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        className={filter === key ? "selected" : ""}
                        onClick={() => setFilter(key)}
                        aria-pressed={filter === key}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    aria-label="搜尋決策"
                    placeholder="搜尋決策…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              )}
              {!shown.length ? (
                <div className="empty-state">
                  <span className="empty-mark">✿</span>
                  <h3>
                    {decisions.length
                      ? "沒有符合的決策"
                      : "你的第一個選擇，從這裡開始"}
                  </h3>
                  <p>
                    {decisions.length
                      ? "試試其他狀態，或換個關鍵字。"
                      : "不用一次想清楚。先寫下一個正在猶豫的問題就好。"}
                  </p>
                  {!decisions.length && (
                    <button className="quiet" onClick={() => setCreate(true)}>
                      開始整理 →
                    </button>
                  )}
                </div>
              ) : (
                <div className="decision-grid">
                  {shown.map((item) => (
                    <article className="decision-card" key={item.id}>
                      <button
                        className="card-open"
                        onClick={() => {
                          setActive(item.id);
                          setView(
                            item.status === "draft"
                              ? "edit"
                              : item.status === "rating"
                                ? "rating"
                                : "result",
                          );
                          setSaveStatus("已保存");
                          setError("");
                        }}
                      >
                        <div className="card-meta">
                          <span className={`pill ${item.status}`}>
                            {statuses[item.status]}
                          </span>
                          <span>
                            {item.mode === "single" ? "要不要做" : "多選項比較"}
                          </span>
                        </div>
                        <h3>{item.title || "未命名決策"}</h3>
                        <p>{item.question || "還沒寫下問題，隨時可以繼續。"}</p>
                        <div className="card-footer">
                          <span>{formatDate(item.updatedAt)} 更新</span>
                          <span>
                            {item.status === "rating"
                              ? "繼續評分"
                              : item.status === "result"
                                ? "查看結果"
                                : "繼續整理"}{" "}
                            →
                          </span>
                        </div>
                      </button>
                      <button
                        className="card-delete"
                        aria-label={`刪除 ${item.title || "未命名決策"}`}
                        onClick={async () => {
                          if (
                            await confirm(
                              "刪除這個決策？",
                              "此決策與首次快照都會移除。建議先匯出備份。",
                              "刪除決策",
                            )
                          )
                            try {
                              await deleteDecision(item);
                              setDecisions((old) =>
                                old.filter((x) => x.id !== item.id),
                              );
                            } catch (e) {
                              setError((e as Error).message);
                            }
                        }}
                      >
                        刪除
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <div className="privacy-note">
              <span>⌂</span>
              <p>
                這裡是你的私人思考空間。資料只保存在這個裝置與瀏覽器，沒有帳號，也不會雲端同步。
                <br />
                清除網站資料或更換裝置可能遺失紀錄，記得定期匯出備份。
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="workspace-nav">
              <button className="quiet" onClick={() => void leave()}>
                ← 我的決策
              </button>
              <span
                role="status"
                className={saveStatus === "保存失敗" ? "save-error" : ""}
              >
                {dirty && saveStatus === "已保存" ? "尚未保存" : saveStatus}
              </span>
            </div>
            <div className="steps">
              {["整理想法", "逐項評分", "揭曉結果"].map((text, i) => (
                <span
                  className={
                    (view === "edit" ? 0 : view === "rating" ? 1 : 2) === i
                      ? "current"
                      : ""
                  }
                  key={text}
                >
                  <b>{i + 1}</b>
                  {text}
                </span>
              ))}
            </div>
            {view === "edit" ? (
              <Editor
                key={d.id}
                decision={d}
                save={save}
                busy={busy}
                confirm={confirm}
                onDirty={setDirty}
                onStart={async (next) => {
                  const saved = await save(start(next));
                  if (saved) setView("rating");
                }}
                onContinue={(next) =>
                  setView(
                    next.status === "result"
                      ? "result"
                      : next.status === "rating"
                        ? "rating"
                        : "edit",
                  )
                }
              />
            ) : view === "rating" ? (
              <Rating
                decision={d}
                busy={busy}
                save={save}
                onEdit={() => setView("edit")}
                onReveal={async () => {
                  const saved = await save(reveal(d));
                  if (saved) setView("result");
                }}
              />
            ) : (
              <Result
                decision={d}
                busy={busy}
                onEdit={() => setView("edit")}
                onRestart={async () => {
                  if (
                    await confirm(
                      "重新評分？",
                      "將清除本輪全部分數並打亂順序。首次結果會保留，這輪完成後可比較。",
                      "開始重新評分",
                    )
                  ) {
                    const saved = await save(start(d));
                    if (saved) setView("rating");
                  }
                }}
              />
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <span>decision · 每個選擇，慢慢想</span>
        <span>你的判斷，比任何分數更重要。</span>
      </footer>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void readFile(f);
        }}
      />
      {create && (
        <Modal title="這次，想整理哪種選擇？" onClose={() => setCreate(false)}>
          <p className="muted">選一個適合問題的方式，之後隨時可以暫停。</p>
          <button
            disabled={busy}
            className="mode-card"
            onClick={() => void make("single")}
          >
            <span className="mode-symbol">↗</span>
            <div>
              <h3>要不要做</h3>
              <p>例如：要不要換工作、開始一個計畫？</p>
            </div>
            <span>→</span>
          </button>
          <button
            disabled={busy}
            className="mode-card"
            onClick={() => void make("multiple")}
          >
            <span className="mode-symbol">⑂</span>
            <div>
              <h3>多選項比較</h3>
              <p>例如：兩份工作、三個旅行目的地怎麼選？</p>
            </div>
            <span>→</span>
          </button>
          <p className="hint">
            資料只保存在這個裝置／瀏覽器，不會同步。請定期匯出備份。
          </p>
        </Modal>
      )}
      {confirmData && (
        <Modal
          title={confirmData.title}
          onClose={() => settle(false)}
          footer={
            <>
              <button onClick={() => settle(false)}>取消</button>
              <button className="primary" onClick={() => settle(true)}>
                {confirmData.label}
              </button>
            </>
          }
        >
          <p>{confirmData.message}</p>
        </Modal>
      )}
      {backup && (
        <Modal
          title="確認匯入備份"
          onClose={() => setBackup(null)}
          footer={
            <>
              <button disabled={busy} onClick={() => setBackup(null)}>
                取消
              </button>
              <button
                disabled={busy}
                className="primary"
                onClick={() => void doImport()}
              >
                新增 {backup.decisions.length} 個副本
              </button>
            </>
          }
        >
          <p>備份包含 {backup.decisions.length} 個決策：</p>
          <ul>
            {(["draft", "rating", "result"] as const).map((s) => (
              <li key={s}>
                {statuses[s]}：
                {backup.decisions.filter((d) => d.status === s).length} 個
              </li>
            ))}
          </ul>
          <p>不會覆寫原有決策。重複匯入同一份備份會再新增副本。</p>
        </Modal>
      )}
      {help && (
        <Modal title="把 decision 帶在身邊" onClose={() => setHelp(false)}>
          <h3>iPhone 安裝方式</h3>
          <ol>
            <li>使用 Safari 開啟網站的 HTTPS 網址。</li>
            <li>點選分享按鈕，選擇「加入主畫面」。</li>
            <li>從主畫面打開，等候「可離線使用」提示。</li>
          </ol>
          <p>
            第一次需要網路；離線資源準備好後，可離線整理、評分與備份。開發預覽不提供離線快取。
          </p>
          <h3>其他裝置</h3>
          {installPrompt ? (
            <button
              className="primary"
              onClick={async () => {
                try {
                  await installPrompt.prompt();
                  await installPrompt.userChoice;
                  setInstallPrompt(null);
                } catch {
                  setNotice("請從瀏覽器選單選擇安裝或加入主畫面。");
                }
              }}
            >
              安裝到裝置
            </button>
          ) : (
            <p>
              Android
              可從瀏覽器選單選擇「安裝應用程式」或「加入主畫面」。選項依瀏覽器而異。
            </p>
          )}
          <h3>保管你的想法</h3>
          <p>
            資料只在目前裝置／瀏覽器。清除網站資料、移除 App
            或更換裝置可能使資料遺失。瀏覽器與主畫面 App 不保證共用資料，請用
            JSON 備份搬移。
          </p>
          <h3>關於評分</h3>
          <p>
            分數是你當下的判斷，不是成功機率。整理重複理由、使用一致基準，才能讓比較更清楚。
          </p>
        </Modal>
      )}
    </div>
  );
}

function Editor({
  decision,
  save,
  busy,
  confirm,
  onDirty,
  onStart,
  onContinue,
}: {
  decision: Decision;
  save: (d: Decision) => Promise<Decision | null>;
  busy: boolean;
  confirm: Confirm;
  onDirty: (v: boolean) => void;
  onStart: (d: Decision) => Promise<void>;
  onContinue: (d: Decision) => void;
}) {
  const [draft, setDraft] = useState(() => clone(decision)),
    [errors, setErrors] = useState<string[]>([]);
  const [chosenTopic, setChosenTopic] = useState<Topic | null>(null);
  const [showAllPrompts, setShowAllPrompts] = useState(false);
  const [inspiration, setInspiration] = useState<number | null>(null);
  const [suggestion, setSuggestion] = useState<{
    optionIndex: number;
    text: string;
    kind: "pro" | "con";
  } | null>(null);
  const [suggestionText, setSuggestionText] = useState("");
  const [suggestionKnown, setSuggestionKnown] = useState(false);
  const draftRef = useRef(draft),
    savedRef = useRef(decision),
    failed = useRef(false),
    pending = useRef<Promise<Decision | null> | null>(null);
  useEffect(() => {
    savedRef.current = decision;
  }, [decision]);
  function change(fn: (d: Decision) => void) {
    const next = clone(draftRef.current);
    fn(next);
    draftRef.current = next;
    setDraft(next);
    onDirty(true);
  }
  function persist(candidate = draftRef.current): Promise<Decision | null> {
    if (pending.current)
      return pending.current.then(() => persist(draftRef.current));
    const operation = doPersist(candidate);
    pending.current = operation.finally(() => {
      pending.current = null;
    });
    return pending.current;
  }
  async function doPersist(candidate: Decision): Promise<Decision | null> {
    if (JSON.stringify(candidate) === JSON.stringify(savedRef.current)) {
      onDirty(false);
      return savedRef.current;
    }
    let next = clone(candidate);
    next.revision = savedRef.current.revision;
    const critical =
      criticalSignature(next) !== criticalSignature(savedRef.current);
    if (critical && savedRef.current.status !== "draft") {
      if (
        !(await confirm(
          "修改後需要重新評分",
          "問題、基準或理由的變更會清除本輪分數與進度。首次結果仍會保留。",
          "套用並重置",
        ))
      ) {
        const old = clone(savedRef.current);
        draftRef.current = old;
        setDraft(old);
        onDirty(false);
        return null;
      }
      next = reset(next);
    }
    if (next.status !== "draft") {
      const validation = readiness(next);
      if (validation.length) {
        setErrors(validation);
        return null;
      }
    }
    setErrors([]);
    const saved = await save(next);
    failed.current = !saved;
    if (saved) {
      savedRef.current = saved;
      if (JSON.stringify(draftRef.current) === JSON.stringify(candidate)) {
        draftRef.current = saved;
        setDraft(saved);
      } else {
        const newer =
          saved.status === "draft" && candidate.status !== "draft"
            ? reset(draftRef.current)
            : clone(draftRef.current);
        newer.revision = saved.revision;
        draftRef.current = newer;
        setDraft(newer);
        onDirty(true);
      }
    }
    return saved;
  }
  useEffect(() => {
    if (draft.status !== "draft" || busy || failed.current) return;
    const timeout = setTimeout(() => void persist(), 700);
    return () => clearTimeout(timeout);
  }, [draft, busy]);
  const blur = () => {
    void persist();
  };
  const modifyOption = (
    index: number,
    fn: (o: Decision["options"][number]) => void,
  ) => change((d) => fn(d.options[index]));
  async function begin() {
    const check = readiness(draftRef.current);
    setErrors(check);
    if (check.length) return;
    const saved = await persist();
    if (saved) await onStart(saved);
  }
  return (
    <div className="editor workspace">
      <div className="page-intro">
        <span className="eyebrow">先把想法放下來</span>
        <h1>不用急著找到答案。</h1>
        <p>寫下相對於同一個基準的利弊。先不評分，讓想法完整一些。</p>
      </div>
      <section className="panel">
        <h2>先寫一句就好</h2>
        <Field
          label="你正在猶豫什麼？"
          value={draft.question}
          onChange={(s) =>
            change((d) => {
              const previous = d.question;
              if (!d.title || d.title === previous) d.title = s;
              if (
                d.mode === "single" &&
                (!d.options[0].name ||
                  d.options[0].name === actionFromQuestion(previous))
              )
                d.options[0].name = actionFromQuestion(s);
              d.question = s;
            })
          }
          onBlur={blur}
          placeholder={
            draft.mode === "single"
              ? "例如：要不要換工作？"
              : "例如：週末要去哪裡旅行？"
          }
          multiline
        />
        <p className="hint">
          {draft.mode === "single"
            ? "這句話會作為標題與行動的起點。"
            : "這句話會作為決策標題。"}
          預設與「維持現況」比較，需要時再調整。
        </p>
        <details
          className="decision-settings"
          open={
            decision.title !== decision.question ||
            decision.baseline !== "維持現況"
          }
        >
          <summary>
            調整標題、比較基準與其他設定 <span>（選填）</span>
          </summary>
          <div className="form-grid">
            <Field
              label="決策標題"
              value={draft.title}
              onChange={(s) => change((d) => (d.title = s))}
              onBlur={blur}
              placeholder="例如：我的下一份工作"
            />
            <Field
              label={draft.mode === "single" ? "比較基準" : "共同的比較基準"}
              value={draft.baseline}
              onChange={(s) => change((d) => (d.baseline = s))}
              onBlur={blur}
              placeholder="例如：維持目前工作"
            />
          </div>
          <p className="hint">
            所有利弊都以這個基準來比較，避免把同一個差異重複計分。
          </p>
          {draft.mode === "multiple" && (
            <Field
              label="共同考量清單（選填，不計分）"
              value={draft.commonConsiderations}
              onChange={(s) => change((d) => (d.commonConsiderations = s))}
              onBlur={blur}
              placeholder="薪資、工時、通勤、成長空間…"
              multiline
            />
          )}
          {draft.mode === "single" && (
            <Field
              label="行動名稱"
              value={draft.options[0].name}
              onChange={(s) => modifyOption(0, (o) => (o.name = s))}
              onBlur={blur}
              placeholder="例如：換工作"
            />
          )}
        </details>
      </section>
      {draft.options.map((option, oi) => (
        <section className="panel option-panel" key={option.id}>
          <div className="section-head">
            <h2>
              {draft.mode === "single" ? "欲採取的行動" : `選項 ${oi + 1}`}
            </h2>
            {draft.mode === "multiple" && (
              <button
                className="quiet danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    await confirm(
                      "移除這個選項？",
                      "會移除此選項的理由與底線；已開始評分時會重置本輪。",
                      "移除選項",
                    )
                  ) {
                    change((d) => d.options.splice(oi, 1));
                    await persist();
                  }
                }}
              >
                移除選項
              </button>
            )}
          </div>
          {draft.mode === "multiple" && (
            <Field
              label="選項名稱"
              value={option.name}
              onChange={(s) => modifyOption(oi, (o) => (o.name = s))}
              onBlur={blur}
              placeholder="例如：公司 A"
            />
          )}
          <div className="section-head reason-heading">
            <h3>利與弊</h3>
            <span className="muted">每項只寫一個不同的理由</span>
          </div>
          <div className="inspiration-intro">
            <div>
              <strong>不知道從哪裡想？</strong>
              <p>看看考量問題與參考句，再改成適合你的理由。</p>
            </div>
            <button
              disabled={busy}
              onClick={() => setInspiration(inspiration === oi ? null : oi)}
              aria-expanded={inspiration === oi}
            >
              {inspiration === oi ? "收起提示" : "幫我想利弊"} <span>✦</span>
            </button>
          </div>
          {inspiration === oi && (
            <div className="inspiration-panel">
              <div className="section-head">
                <span className="pill">內建思考提示 · 可離線使用</span>
                <label className="topic-picker">
                  考量主題
                  <select
                    aria-label="考量主題"
                    value={chosenTopic ?? detectTopic(draft.question)}
                    onChange={(e) => {
                      setChosenTopic(e.target.value as Topic);
                      setShowAllPrompts(false);
                    }}
                  >
                    {Object.entries(topicNames).map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="hint">
                以下是參考方向，不是針對你的事實判斷。只加入適用的理由，避免重複計分。
              </p>
              {promptsFor(chosenTopic ?? detectTopic(draft.question))
                .slice(0, showAllPrompts ? undefined : 3)
                .map((prompt) => (
                  <div className="thought-card" key={prompt.id}>
                    <span className="eyebrow">{prompt.dimension}</span>
                    <h4>{prompt.question}</h4>
                    <div className="thought-examples">
                      {(["pro", "con"] as const).map((kind) => {
                        const text = suggestedFactor(prompt, kind);
                        const exists = option.factors.some(
                          (f) => f.text.trim() === text,
                        );
                        return (
                          <button
                            key={kind}
                            disabled={busy || exists}
                            onClick={() => {
                              setSuggestion({ optionIndex: oi, text, kind });
                              setSuggestionText(text);
                              setSuggestionKnown(false);
                            }}
                          >
                            <span className={`factor-badge ${kind}`}>
                              {kind === "pro" ? "利" : "弊"}
                            </span>
                            <span>{text}</span>
                            <b>{exists ? "已加入" : "＋"}</b>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              <button
                className="quiet"
                onClick={() => setShowAllPrompts(!showAllPrompts)}
                aria-expanded={showAllPrompts}
              >
                {showAllPrompts ? "收起其他考量" : "更多考量方向 ↓"}
              </button>
            </div>
          )}
          {option.factors.map((factor, fi) => (
            <div className={`factor ${factor.kind}`} key={factor.id}>
              <div className="factor-controls">
                <label className="sr-only" htmlFor={`kind-${factor.id}`}>
                  理由 {fi + 1} 利弊
                </label>
                <select
                  id={`kind-${factor.id}`}
                  value={factor.kind}
                  onChange={(e) => {
                    modifyOption(
                      oi,
                      (o) =>
                        (o.factors[fi].kind = e.target.value as "pro" | "con"),
                    );
                    void persist();
                  }}
                >
                  <option value="pro">＋ 優點</option>
                  <option value="con">− 缺點</option>
                </select>
                <button
                  className="icon-button"
                  aria-label={`移除理由 ${fi + 1}`}
                  disabled={busy}
                  onClick={() => {
                    modifyOption(oi, (o) => o.factors.splice(fi, 1));
                    void persist();
                  }}
                >
                  ×
                </button>
              </div>
              <Field
                label={`理由 ${fi + 1}`}
                value={factor.text}
                onChange={(s) =>
                  modifyOption(oi, (o) => (o.factors[fi].text = s))
                }
                onBlur={blur}
                placeholder={
                  factor.kind === "pro"
                    ? "這個選擇會帶來什麼好處？"
                    : "可能需要付出什麼代價？"
                }
              />
              <details
                className="factor-extra"
                open={!!factor.note || factor.knowledge === "unknown"}
              >
                <summary>
                  備註與資訊狀態
                  {factor.knowledge === "unknown" ? " · 待確認" : ""}
                </summary>
                <label className="knowledge">
                  <input
                    type="checkbox"
                    checked={factor.knowledge === "unknown"}
                    onChange={(e) => {
                      modifyOption(oi, (o) => {
                        o.factors[fi].knowledge = e.target.checked
                          ? "unknown"
                          : "known";
                        o.factors[fi].score = null;
                      });
                      void persist();
                    }}
                  />
                  資訊未知
                </label>
                <Field
                  label={`理由 ${fi + 1} 備註（選填）`}
                  value={factor.note}
                  onChange={(s) =>
                    modifyOption(oi, (o) => (o.factors[fi].note = s))
                  }
                  onBlur={blur}
                  placeholder="補充背景或需要查證的地方"
                />
                {factor.knowledge === "unknown" && (
                  <p className="hint">這項暫不評分，揭曉時會列為待確認資訊。</p>
                )}
              </details>
            </div>
          ))}
          <div className="add-actions">
            <button
              disabled={busy}
              onClick={() => {
                modifyOption(oi, (o) => o.factors.push(newFactor("pro")));
                void persist();
              }}
            >
              ＋ 新增優點
            </button>
            <button
              disabled={busy}
              onClick={() => {
                modifyOption(oi, (o) => o.factors.push(newFactor("con")));
                void persist();
              }}
            >
              ＋ 新增缺點
            </button>
          </div>
          <details
            className="bottom-lines"
            open={option.bottomLines.length > 0}
          >
            <summary>
              不可接受的底線 <span>（選填，獨立於分數）</span>
            </summary>
            <p className="hint">
              例如：需要長期輪夜班。確定違反時，正分也不代表適合採取。
            </p>
            {option.bottomLines.map((b, bi) => (
              <div className="bottom-line" key={b.id}>
                <Field
                  label={`底線 ${bi + 1}`}
                  value={b.text}
                  onChange={(s) =>
                    modifyOption(oi, (o) => (o.bottomLines[bi].text = s))
                  }
                  onBlur={blur}
                  placeholder="什麼條件是你無法接受的？"
                />
                <label className="field">
                  <span>底線 {bi + 1} 狀態</span>
                  <select
                    value={b.state}
                    onChange={(e) => {
                      modifyOption(
                        oi,
                        (o) =>
                          (o.bottomLines[bi].state = e.target
                            .value as typeof b.state),
                      );
                      void persist();
                    }}
                  >
                    <option value="unconfirmed">尚未確認</option>
                    <option value="notViolated">未違反</option>
                    <option value="violated">已違反</option>
                  </select>
                </label>
                <button
                  className="quiet danger"
                  disabled={busy}
                  onClick={() => {
                    modifyOption(oi, (o) => o.bottomLines.splice(bi, 1));
                    void persist();
                  }}
                >
                  移除底線 {bi + 1}
                </button>
              </div>
            ))}
            <button
              disabled={busy}
              onClick={() => {
                modifyOption(oi, (o) =>
                  o.bottomLines.push({
                    id: uid(),
                    text: "",
                    state: "unconfirmed",
                  }),
                );
                void persist();
              }}
            >
              ＋ 新增底線
            </button>
          </details>
        </section>
      ))}
      {draft.mode === "multiple" && (
        <button
          className="wide-add"
          disabled={busy}
          onClick={() => {
            change((d) => d.options.push(newOption()));
            void persist();
          }}
        >
          ＋ 新增另一個選項
        </button>
      )}
      {errors.length > 0 && (
        <div className="error-box" role="alert">
          <strong>再補齊幾個地方就可以開始：</strong>
          <ul>
            {errors.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="preflight">
        <span>☷</span>
        <div>
          <h3>開始之前，快速看一遍</h3>
          <p>
            有重複的理由嗎？有遺漏的考量嗎？各選項使用同一個比較基準嗎？列表長短會影響總分，試著合併相似理由。
          </p>
        </div>
      </div>
      <div className="workspace-actions">
        <button disabled={busy} onClick={() => void persist()}>
          重試保存
        </button>
        {draft.status === "draft" ? (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void begin()}
          >
            開始逐項評分 →
          </button>
        ) : (
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              const saved = await persist();
              if (saved) onContinue(saved);
            }}
          >
            返回{draft.status === "result" ? "結果" : "評分"} →
          </button>
        )}
      </div>
      {suggestion && (
        <Modal
          title="把參考句改成你的理由"
          onClose={() => setSuggestion(null)}
          footer={
            <>
              <button disabled={busy} onClick={() => setSuggestion(null)}>
                取消
              </button>
              <button
                className="primary"
                disabled={
                  busy ||
                  !suggestionText.trim() ||
                  draft.options[suggestion.optionIndex].factors.some(
                    (f) => f.text.trim() === suggestionText.trim(),
                  )
                }
                onClick={async () => {
                  const factor = newFactor(suggestion.kind);
                  factor.text = suggestionText.trim();
                  factor.knowledge = suggestionKnown ? "known" : "unknown";
                  modifyOption(suggestion.optionIndex, (o) =>
                    o.factors.push(factor),
                  );
                  setSuggestion(null);
                  await persist();
                }}
              >
                加入{suggestionKnown ? "已知" : "待確認"}理由
              </button>
            </>
          }
        >
          <p className="hint">
            這是內建參考句，請確認適不適用，再決定是否加入。
          </p>
          <Field
            label="要加入的理由"
            value={suggestionText}
            onChange={setSuggestionText}
            multiline
          />
          <label className="suggestion-check">
            <input
              type="checkbox"
              checked={suggestionKnown}
              onChange={(e) => setSuggestionKnown(e.target.checked)}
            />
            我已確認這個理由符合自己的情況，可以評分
          </label>
          <p className="hint">尚未確認時會加入待確認資訊，這項暫不計分。</p>
        </Modal>
      )}
    </div>
  );
}

function Rating({
  decision: d,
  busy,
  save,
  onEdit,
  onReveal,
}: {
  decision: Decision;
  busy: boolean;
  save: (d: Decision) => Promise<Decision | null>;
  onEdit: () => void;
  onReveal: () => Promise<void>;
}) {
  const item = factors(d).find((f) => f.id === d.session?.currentItemId),
    option = d.options.find((o) => o.factors.some((f) => f.id === item?.id));
  const [selected, setSelected] = useState<number | null>(item?.score ?? null);
  useEffect(() => setSelected(item?.score ?? null), [item?.id, item?.score]);
  const total = d.session!.itemOrder.length,
    completed = factors(d).filter((f) => f.score !== null).length,
    index = d.session!.itemOrder.indexOf(item?.id ?? "");
  const previous = async () => {
    const next = clone(d);
    next.session!.currentItemId =
      next.session!.itemOrder[item ? index - 1 : total - 1];
    await save(next);
  };
  return (
    <div className="rating workspace">
      <div className="page-intro">
        <span className="eyebrow">一次，只想一件事</span>
        <h1>{item ? "這個因素，對你有多大影響？" : "想法都整理好了。"}</h1>
        <p>
          {item
            ? "依照你現在的感受評分，沒有標準答案。"
            : "先深呼吸一下。接下來會看到這輪評分的整理。"}
        </p>
      </div>
      <div className="rating-progress">
        <span>
          已完成 {completed} / {total} 項
        </span>
        <span>評分期間隱藏總分</span>
        <progress value={completed} max={total} />
      </div>
      {item ? (
        <section className="panel rating-card">
          <div className="rating-context">
            <span>{option?.name}</span>
            <span className={`pill ${item.kind}`}>
              {item.kind === "pro" ? "＋ 優點" : "− 缺點"}
            </span>
          </div>
          <h2>{item.text}</h2>
          {item.note && <p className="rating-note">{item.note}</p>}
          <fieldset className="scores">
            <legend>影響程度</legend>
            {["很小", "小", "中等", "大", "很大"].map((label, i) => (
              <label
                key={label}
                className={selected === i + 1 ? "selected" : ""}
              >
                <input
                  type="radio"
                  name="score"
                  value={i + 1}
                  checked={selected === i + 1}
                  onChange={() => setSelected(i + 1)}
                />
                <b>{i + 1}</b>
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <button
            className="primary full"
            disabled={selected === null || busy}
            onClick={() => selected !== null && void save(rate(d, selected))}
          >
            {busy
              ? "保存中…"
              : index === total - 1
                ? "保存最後一項 →"
                : "保存並下一項 →"}
          </button>
          <p className="hint center">
            分數只代表影響大小，利弊方向由項目分類決定。
          </p>
        </section>
      ) : (
        <section className="panel reveal-card">
          <img src="/icon-192.png" alt="" />
          <h2>準備看看方向了嗎？</h2>
          <p>
            結果會包含底線與待確認資訊。
            <br />
            最後的選擇，仍然由你決定。
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void onReveal()}
          >
            揭曉結果
          </button>
        </section>
      )}
      <div className="workspace-actions">
        <button className="quiet" disabled={busy} onClick={onEdit}>
          ← 返回整理
        </button>
        <button
          disabled={busy || (!!item && index <= 0)}
          onClick={() => void previous()}
        >
          上一項
        </button>
      </div>
    </div>
  );
}
function ResultDetails({ data }: { data: Decision | Snapshot }) {
  const r = results(data);
  return (
    <>
      {r.provisional && (
        <div className="provisional">
          <strong>暫定結果</strong>
          <p>
            還有未知理由或尚未確認的底線。以下分數與排名只整理目前已知資訊。
          </p>
        </div>
      )}
      {data.mode === "multiple" && (
        <div className="result-summary">
          <h2>
            {!r.ranked.length
              ? r.rows.some((x) => x.eligibility === "pending")
                ? "底線尚待確認，暫無可推薦選項"
                : "目前沒有符合底線的選項"
              : r.ranked.length === 1
                ? "唯一符合已設定底線的選項"
                : r.gap === 0
                  ? "最高分並列"
                  : "符合條件的目前最高分"}
          </h2>
          {r.ranked.length > 0 && (
            <p>
              {r.ranked
                .filter((x) => x.rank === 1)
                .map((x) => x.option.name)
                .join("、")}
              {r.gap !== null && <span> · 前兩個選項分差 {r.gap} 分</span>}
            </p>
          )}
        </div>
      )}
      {r.rows.map((row) => (
        <section className="panel result-option" key={row.option.id}>
          <div className="section-head">
            <h2>{row.option.name}</h2>
            <span className={`pill ${row.eligibility}`}>
              {row.eligibility === "violated"
                ? "不符合底線"
                : row.eligibility === "pending"
                  ? "底線待確認"
                  : data.mode === "multiple"
                    ? `第 ${row.rank} 名`
                    : "行動評估"}
            </span>
          </div>
          <div className="totals">
            <div>
              <span>利總分</span>
              <strong>{row.p}</strong>
            </div>
            <div>
              <span>弊總分</span>
              <strong>{row.c}</strong>
            </div>
            <div>
              <span>淨分</span>
              <strong>{signed(row.n)}</strong>
            </div>
          </div>
          {data.mode === "single" && (
            <p className="direction">
              {row.eligibility === "violated"
                ? "此行動已違反底線，不因正分而建議採取。"
                : row.eligibility === "pending"
                  ? "底線尚待確認，暫不建議採取行動。"
                  : row.n > 0
                    ? "目前評分偏向採取行動。"
                    : row.n < 0
                      ? "目前評分偏向維持基準。"
                      : "目前同分，沒有明確傾向。"}
            </p>
          )}
          <p className="hint">比較基準：{data.baseline}</p>
          {row.option.bottomLines.length > 0 && (
            <div className="result-bottom">
              <h3>不可接受的底線</h3>
              {row.option.bottomLines.map((b) => (
                <p key={b.id}>
                  <span className={`pill ${b.state}`}>
                    {b.state === "violated"
                      ? "已違反"
                      : b.state === "notViolated"
                        ? "未違反"
                        : "尚未確認"}
                  </span>
                  {b.text}
                </p>
              ))}
            </div>
          )}
          {row.option.factors.some((f) => f.knowledge === "unknown") && (
            <div className="unknown-list">
              <h3>待確認資訊 · 未計分</h3>
              {row.option.factors
                .filter((f) => f.knowledge === "unknown")
                .map((f) => (
                  <div key={f.id}>
                    <p>
                      {f.kind === "pro" ? "優點" : "缺點"}：{f.text}
                    </p>
                    {f.note && <small>{f.note}</small>}
                  </div>
                ))}
            </div>
          )}
          <h3 className="reason-heading">主要影響因素</h3>
          <ul className="result-factors">
            {row.option.factors
              .filter((f) => f.knowledge === "known")
              .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
              .map((f) => (
                <li key={f.id}>
                  <span className={`factor-badge ${f.kind}`}>
                    {f.kind === "pro" ? "利" : "弊"}
                  </span>
                  <div>
                    <strong>{f.text}</strong>
                    {f.note && <p>{f.note}</p>}
                  </div>
                  <b>
                    {f.score}
                    <small> 分</small>
                  </b>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}
function Result({
  decision: d,
  busy,
  onEdit,
  onRestart,
}: {
  decision: Decision;
  busy: boolean;
  onEdit: () => void;
  onRestart: () => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState(false);
  const changed =
    d.firstResultSnapshot &&
    comparisonSignature(d) !== comparisonSignature(d.firstResultSnapshot);
  return (
    <div className="workspace">
      <div className="page-intro">
        <span className="eyebrow">看見你目前的方向</span>
        <h1>{d.title}</h1>
        <p>{d.question}</p>
      </div>
      <p className="result-disclaimer">
        這是你目前評分的整理，最後決定仍由你做。分數不是成功機率，也不保證選擇正確。
      </p>
      <ResultDetails data={d} />
      <details
        className="snapshot"
        open={snapshot}
        onToggle={(e) => setSnapshot(e.currentTarget.open)}
      >
        <summary>
          首次結果 ·{" "}
          {d.firstResultSnapshot &&
            formatDate(d.firstResultSnapshot.revealedAt)}
        </summary>
        {snapshot && d.firstResultSnapshot && (
          <>
            <p>
              {changed
                ? "評估內容已變更，分數差異需搭配理由查看"
                : "評估內容與首次揭曉相同，可對照當時的評分。"}
            </p>
            <h2>{d.firstResultSnapshot.title}</h2>
            <p>{d.firstResultSnapshot.question}</p>
            <ResultDetails data={d.firstResultSnapshot} />
          </>
        )}
      </details>
      <div className="workspace-actions">
        <button disabled={busy} onClick={onEdit}>
          修改整理內容
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={() => void onRestart()}
        >
          重新評分
        </button>
      </div>
    </div>
  );
}
