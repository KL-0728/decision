import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  newDecision,
  newOption,
  newFactor,
  start,
  rate,
  reveal,
} from "../../src/domain";
async function saved(page: Page) {
  await expect(
    page.getByRole("status").filter({ hasText: /^已保存$/ }),
  ).toBeVisible();
}
test("incomplete result metadata stays unsaved until corrected", async ({
  page,
}) => {
  await create(page);
  await reason(page, "優點", "成長", 1);
  await page.getByRole("button", { name: "開始逐項評分" }).click();
  await rateAll(page, { 成長: 4 });
  await page.getByRole("button", { name: "揭曉結果" }).click();
  await page.getByRole("button", { name: "修改整理內容" }).click();
  await page.getByLabel("決策標題", { exact: true }).fill("");
  await page.getByLabel("決策標題", { exact: true }).press("Tab");
  await expect(page.getByRole("alert")).toContainText("請填寫決策標題");
  await expect(
    page.getByRole("status").filter({ hasText: "尚未保存" }),
  ).toBeVisible();
  await fill(page, "決策標題", "補齊後的標題");
  await page.getByRole("button", { name: "返回結果" }).click();
  await expect(
    page.getByRole("heading", { name: "補齊後的標題" }),
  ).toBeVisible();
  await expect(page.locator(".totals strong").last()).toHaveText("+4");
});
async function fill(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel(label, { exact: true }).press("Tab");
  await saved(page);
}
async function create(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "建立新決策" }).click();
  await page.getByRole("button", { name: /要不要做/ }).click();
  await fill(page, "決策標題", "是否接受新工作");
  await fill(page, "想回答的問題", "這個工作適合我嗎？");
  await fill(page, "比較基準", "維持目前工作");
  await fill(page, "行動名稱", "接受新工作");
}
async function reason(
  page: Page,
  kind: "優點" | "缺點",
  text: string,
  index: number,
) {
  await page.getByRole("button", { name: `新增${kind}` }).click();
  await saved(page);
  await fill(page, `理由 ${index}`, text);
}
async function rateAll(page: Page, scores: Record<string, number>) {
  while (
    await page
      .getByRole("heading", { name: "這個因素，對你有多大影響？" })
      .isVisible()
  ) {
    const text = await page.locator(".rating-card h2").innerText();
    await page
      .locator(`input[name="score"][value="${scores[text] ?? 3}"]`)
      .check();
    await page.getByRole("button", { name: /保存.*項/ }).click();
    await saved(page);
  }
  await expect(page.getByRole("button", { name: "揭曉結果" })).toBeVisible();
}
test("write, rate, reload, reveal, change a bottom line and preserve first result", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await create(page);
  await reason(page, "優點", "成長空間", 1);
  await reason(page, "優點", "薪資增加", 2);
  await reason(page, "缺點", "通勤變長", 3);
  await reason(page, "缺點", "實際工時待查", 4);
  await page.getByLabel("資訊未知").nth(3).check();
  await saved(page);
  await page.screenshot({
    path: `artifacts/qa/${info.project.name}-editor.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "開始逐項評分" }).click();
  await expect(
    page.getByRole("heading", { name: "這個因素，對你有多大影響？" }),
  ).toBeVisible();
  await expect(page.getByText("淨分", { exact: true })).not.toBeVisible();
  const first = await page.locator(".rating-card h2").innerText();
  await page.reload();
  await page
    .locator(".card-open")
    .filter({ hasText: "是否接受新工作" })
    .click();
  await expect(page.locator(".rating-card h2")).toHaveText(first);
  await page.screenshot({
    path: `artifacts/qa/${info.project.name}-rating.png`,
    fullPage: true,
  });
  await rateAll(page, { 成長空間: 5, 薪資增加: 3, 通勤變長: 4 });
  await expect(page.getByText("淨分", { exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "揭曉結果" }).click();
  await expect(page.locator(".totals strong").last()).toHaveText("+4");
  await expect(page.getByText("暫定結果", { exact: true })).toBeVisible();
  await expect(page.getByText("實際工時待查")).toBeVisible();
  await page.screenshot({
    path: `artifacts/qa/${info.project.name}-result.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "修改整理內容" }).click();
  await page.locator("summary").filter({ hasText: "不可接受的底線" }).click();
  await page.getByRole("button", { name: "新增底線" }).click();
  await fill(page, "底線 1", "必須輪夜班");
  await page.getByLabel("底線 1 狀態").selectOption("violated");
  await saved(page);
  await page.getByRole("button", { name: "返回結果" }).click();
  await expect(page.getByText("不符合底線", { exact: true })).toBeVisible();
  await expect(page.locator(".totals strong").last()).toHaveText("+4");
  await page.locator(".snapshot summary").click();
  await expect(
    page.getByText("評估內容已變更，分數差異需搭配理由查看"),
  ).toBeVisible();
  await page.getByRole("button", { name: "重新評分", exact: true }).click();
  await page.getByRole("button", { name: "開始重新評分" }).click();
  await expect(page.locator(".snapshot")).toHaveCount(0);
  await expect(page.getByText("淨分", { exact: true })).not.toBeVisible();
  await rateAll(page, { 成長空間: 1, 薪資增加: 1, 通勤變長: 1 });
  await page.getByRole("button", { name: "揭曉結果" }).click();
  await expect(page.locator(".totals strong").last()).toHaveText("+1");
  await page.locator(".snapshot summary").click();
  await expect(page.locator(".snapshot .totals strong").last()).toHaveText(
    "+4",
  );
  expect(errors).toEqual([]);
});
test("cancel reset preserves contents; confirm reset clears only this round", async ({
  page,
}) => {
  await create(page);
  await reason(page, "優點", "成長", 1);
  await page.getByRole("button", { name: "開始逐項評分" }).click();
  await rateAll(page, { 成長: 5 });
  await page.getByRole("button", { name: "揭曉結果" }).click();
  await page.getByRole("button", { name: "修改整理內容" }).click();
  await page.getByLabel("比較基準", { exact: true }).fill("不同基準");
  await page.getByLabel("比較基準", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByLabel("比較基準", { exact: true })).toHaveValue(
    "維持目前工作",
  );
  await page.getByLabel("比較基準", { exact: true }).fill("另一個基準");
  await page.getByLabel("比較基準", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "套用並重置" }).click();
  await expect(
    page.getByRole("button", { name: "開始逐項評分" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "開始逐項評分" }).click();
  await expect(page.locator('input[name="score"]:checked')).toHaveCount(0);
});
test("backup round trip adds copies and invalid JSON never writes", async ({
  page,
}) => {
  await create(page);
  await reason(page, "優點", "薪資", 1);
  await page.getByRole("button", { name: "← 我的決策", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /匯出備份/ }).click();
  const download = await downloadPromise;
  const raw = await readFile((await download.path())!);
  await page.locator("input[type=file]").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: raw,
  });
  await page.getByRole("button", { name: "新增 1 個副本" }).click();
  await expect(page.locator(".decision-card")).toHaveCount(2);
  await page.locator("input[type=file]").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"formatVersion":999}'),
  });
  await expect(page.getByRole("alert")).toContainText("不支援的備份版本");
  await expect(page.locator(".decision-card")).toHaveCount(2);
});
test("offline launch supports editing, rating and persists after another reload", async ({
  page,
  context,
}, info) => {
  await create(page);
  await reason(page, "優點", "離線理由", 1);
  await expect(page.getByText("可離線使用", { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page
    .locator(".card-open")
    .filter({ hasText: "是否接受新工作" })
    .click();
  await context.setOffline(true);
  await page.reload();
  await page
    .locator(".card-open")
    .filter({ hasText: "是否接受新工作" })
    .click();
  await expect(page.getByText("離線使用中")).toBeVisible();
  await fill(page, "決策標題", "離線決策");
  await page.getByRole("button", { name: "開始逐項評分" }).click();
  await rateAll(page, { 離線理由: 4 });
  await page.getByRole("button", { name: "揭曉結果" }).click();
  await expect(page.locator(".totals strong").last()).toHaveText("+4");
  await page.screenshot({
    path: `artifacts/qa/${info.project.name}-offline.png`,
    fullPage: true,
  });
  await page.reload();
  await page.locator(".card-open").filter({ hasText: "離線決策" }).click();
  await expect(page.locator(".totals strong").last()).toHaveText("+4");
  await context.setOffline(false);
});
test("save failure keeps the current rating and retry advances once", async ({
  page,
}) => {
  await create(page);
  await reason(page, "優點", "成長", 1);
  await page.getByRole("button", { name: "開始逐項評分" }).click();
  await page.locator('input[name=score][value="5"]').check();
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    (window as any).__transaction = original;
    IDBDatabase.prototype.transaction = function (...args: any[]) {
      if (args[1] === "readwrite")
        throw new DOMException("Simulated disk failure", "QuotaExceededError");
      return original.apply(this, args as any);
    };
  });
  await page.getByRole("button", { name: /保存最後一項/ }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".rating-card h2")).toHaveText("成長");
  await expect(page.locator("input[name=score]:checked")).toHaveValue("5");
  await page.evaluate(() => {
    IDBDatabase.prototype.transaction = (window as any).__transaction;
  });
  await page.getByRole("button", { name: /保存最後一項/ }).click();
  await expect(page.getByRole("button", { name: "揭曉結果" })).toBeVisible();
  await expect(page.getByText("已完成 1 / 1 項")).toBeVisible();
});
test("two tabs cannot silently overwrite a newer decision", async ({
  page,
  context,
}) => {
  await create(page);
  await reason(page, "優點", "薪資", 1);
  const second = await context.newPage();
  await second.goto("/");
  await second
    .locator(".card-open")
    .filter({ hasText: "是否接受新工作" })
    .click();
  await fill(page, "決策標題", "第一分頁已修改");
  await second.getByLabel("決策標題", { exact: true }).fill("第二分頁的舊版本");
  await second.getByLabel("決策標題", { exact: true }).press("Tab");
  await expect(second.getByRole("alert")).toContainText("其他分頁已更新");
  await expect(second.getByLabel("決策標題", { exact: true })).toHaveValue(
    "第二分頁的舊版本",
  );
  await page.reload();
  await expect(
    page.locator(".card-open").filter({ hasText: "第一分頁已修改" }),
  ).toBeVisible();
});
test("mobile layout, install help, and validation are usable", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.screenshot({
    path: `artifacts/qa/${info.project.name}-home.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "使用與安裝說明" }).click();
  await expect(
    page.getByRole("heading", { name: "iPhone 安裝方式" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("button", { name: "建立新決策" }).click();
  await page.getByRole("button", { name: /多選項比較/ }).click();
  await page.getByRole("button", { name: "開始逐項評分" }).click();
  await expect(page.getByRole("alert")).toContainText("請填寫比較基準");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("multi-option backup displays ties, pending qualifications, and single eligible option correctly", async ({
  page,
}, info) => {
  const d = newDecision("multiple");
  d.title = "三個旅行選項";
  d.question = "去哪裡旅行？";
  d.baseline = "留在家裡";
  d.options.push(newOption());
  d.options.forEach((o, i) => {
    o.name = ["海邊", "森林", "山上"][i];
    o.factors = [{ ...newFactor("pro"), text: "風景" }];
  });
  let next = start(d);
  while (next.session?.currentItemId)
    next = rate(
      next,
      next.options[2].factors[0].id === next.session.currentItemId ? 3 : 5,
    );
  next = reveal(next);
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "travel.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        decisions: [next],
      }),
    ),
  });
  await page.getByRole("button", { name: "新增 1 個副本" }).click();
  await page.locator(".card-open").filter({ hasText: "三個旅行選項" }).click();
  await expect(page.getByRole("heading", { name: "最高分並列" })).toBeVisible();
  await expect(page.getByText("第 1 名", { exact: true })).toHaveCount(2);
  await expect(page.getByText("第 3 名", { exact: true })).toHaveCount(1);
  await page.screenshot({
    path: `artifacts/qa/${info.project.name}-multiple.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "修改整理內容" }).click();
  for (const i of [0, 1]) {
    const section = page.locator(".option-panel").nth(i);
    await section.locator("summary").click();
    await section.getByRole("button", { name: "新增底線" }).click();
    await section.getByLabel("底線 1", { exact: true }).fill("超出預算");
    await section.getByLabel("底線 1", { exact: true }).press("Tab");
    await saved(page);
    if (i === 1) {
      await section.getByLabel("底線 1 狀態").selectOption("violated");
      await saved(page);
    }
  }
  await page.getByRole("button", { name: "返回結果" }).click();
  await expect(
    page.getByRole("heading", { name: "唯一符合已設定底線的選項" }),
  ).toBeVisible();
  await expect(page.getByText("底線待確認", { exact: true })).toBeVisible();
  await expect(page.getByText("不符合底線", { exact: true })).toBeVisible();
  await expect(page.getByText("暫定結果", { exact: true })).toBeVisible();
  await expect(page.getByText(/前兩個選項分差/)).toHaveCount(0);
});
test("writes typed while saving are eventually preserved", async ({ page }) => {
  await create(page);
  await reason(page, "優點", "想法", 1);
  await page.getByLabel("決策標題", { exact: true }).fill("快速修改一");
  await page.getByLabel("決策標題", { exact: true }).press("Tab");
  await page.getByLabel("想回答的問題", { exact: true }).fill("快速修改二");
  await page.getByLabel("想回答的問題", { exact: true }).press("Tab");
  await saved(page);
  await expect(page.getByLabel("想回答的問題", { exact: true })).toHaveValue(
    "快速修改二",
  );
  await page.waitForTimeout(850);
  await page.reload();
  await page.locator(".card-open").filter({ hasText: "快速修改一" }).click();
  await expect(page.getByLabel("想回答的問題", { exact: true })).toHaveValue(
    "快速修改二",
  );
});
