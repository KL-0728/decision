import type { Factor } from "./domain";
export interface ThoughtPrompt {
  id: string;
  dimension: string;
  question: string;
  pro: string;
  con: string;
}
const general: ThoughtPrompt[] = [
  {
    id: "time",
    dimension: "時間",
    question: "這個選擇會讓日常時間更充裕，還是更緊湊？",
    pro: "能把更多時間留給重要的事情",
    con: "需要投入更多時間，壓縮其他安排",
  },
  {
    id: "cost",
    dimension: "花費",
    question: "需要花多少錢？後續還有持續的支出嗎？",
    pro: "能減少長期支出",
    con: "需要額外支出，增加預算壓力",
  },
  {
    id: "growth",
    dimension: "成長",
    question: "會帶來什麼新的體驗、能力或機會？",
    pro: "有機會學到新能力或接觸新事物",
    con: "需要花力氣適應陌生的事物",
  },
  {
    id: "energy",
    dimension: "心情與精力",
    question: "想到這個選擇時，你期待什麼、擔心什麼？",
    pro: "更符合自己的喜好，可能增加滿足感",
    con: "可能增加壓力或疲憊",
  },
  {
    id: "flexibility",
    dimension: "彈性",
    question: "如果後來改變心意，調整或退出容易嗎？",
    pro: "保留調整計畫的彈性",
    con: "一旦開始，改變或退出的代價較高",
  },
];
const work: ThoughtPrompt[] = [
  {
    id: "income",
    dimension: "收入",
    question: "收入與福利會怎麼變？哪些條件已經確認？",
    pro: "薪資或福利比現在更符合需求",
    con: "收入或福利可能不如目前穩定",
  },
  {
    id: "commute",
    dimension: "通勤",
    question: "通勤時間、交通花費與工作地點適合你嗎？",
    pro: "通勤更方便，能省下時間",
    con: "通勤更久，增加交通負擔",
  },
  {
    id: "work-growth",
    dimension: "工作成長",
    question: "工作內容能讓你學到想學的東西嗎？",
    pro: "工作內容提供想要的成長機會",
    con: "工作內容可能與長期方向不符",
  },
  {
    id: "hours",
    dimension: "工時與團隊",
    question: "工時、團隊文化與生活安排相容嗎？",
    pro: "工時安排更符合生活需求",
    con: "需要重新適應團隊或工作節奏",
  },
];
const travel: ThoughtPrompt[] = [
  {
    id: "trip-experience",
    dimension: "旅行體驗",
    question: "這個地方有哪些你真正期待的體驗？",
    pro: "能體驗期待的風景或活動",
    con: "行程可能不符合同行者的喜好",
  },
  {
    id: "trip-transport",
    dimension: "交通與安排",
    question: "交通、住宿與行程安排是否方便？",
    pro: "交通與住宿安排方便",
    con: "交通轉乘或行程規劃較費力",
  },
  {
    id: "trip-weather",
    dimension: "不確定性",
    question: "天氣、預訂與當地條件，哪些還需要查證？",
    pro: "有較多備用行程可以調整",
    con: "天氣或預訂變動可能影響行程",
  },
];
const purchase: ThoughtPrompt[] = [
  {
    id: "need",
    dimension: "實際需要",
    question: "你會多常使用？它解決了什麼困擾？",
    pro: "能改善經常遇到的使用問題",
    con: "實際使用頻率可能不高",
  },
  {
    id: "upkeep",
    dimension: "後續成本",
    question: "除了購買價格，還有維修、耗材或訂閱嗎？",
    pro: "長期使用成本較容易負擔",
    con: "後續維護或耗材增加支出",
  },
  {
    id: "space",
    dimension: "空間與替代方案",
    question: "有地方放嗎？現有物品或借用能滿足需求嗎？",
    pro: "能取代現有物品，讓使用更方便",
    con: "需要額外空間或處理舊物",
  },
];
export const topicNames = {
  general: "一般生活",
  work: "工作與職涯",
  travel: "旅行與活動",
  purchase: "購買與用品",
};
export type Topic = keyof typeof topicNames;
export function detectTopic(question: string): Topic {
  if (/工作|職涯|轉職|公司|薪資|offer/i.test(question)) return "work";
  if (/旅行|旅遊|出遊|度假|海邊|景點/.test(question)) return "travel";
  if (/買|購|手機|電腦|用品|商品/.test(question)) return "purchase";
  return "general";
}
export function promptsFor(topic: Topic) {
  return topic === "work"
    ? [...work, ...general.slice(3)]
    : topic === "travel"
      ? [...travel, ...general.slice(0, 2)]
      : topic === "purchase"
        ? [...purchase, ...general.slice(3)]
        : general;
}
export function actionFromQuestion(question: string) {
  return (
    question
      .trim()
      .replace(
        /^(請問)?(我)?(到底)?(要不要|該不該|是否要|是否|要不要去|該不該去)/,
        "",
      )
      .replace(/[？?。！!]+$/, "")
      .trim() || "採取這個行動"
  );
}
export function suggestedFactor(
  prompt: ThoughtPrompt,
  kind: Factor["kind"],
): string {
  return kind === "pro" ? prompt.pro : prompt.con;
}
