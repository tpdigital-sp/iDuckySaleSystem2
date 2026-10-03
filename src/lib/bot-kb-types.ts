/**
 * 🤖 ทรงข้อมูลของ 3 หน้าบอท (คลังความรู้ / ตารางราคา / ลิงก์ราคา) — ใช้ทั้ง API และหน้าจอ
 * ทรงเดียวกับที่ AdminBuddy เขียนลง Firestore ordersure (ดู lib/server/bot-kb.ts)
 */

export type KbImage = { url: string; storagePath?: string; label?: string };
export type KbItem = {
  id: string;
  title: string;
  content: string;
  type: string;
  source?: string;
  localPath?: string;
  linkedPriceLink?: string;
  linkedPriceLinkUrl?: string;
  images?: KbImage[];
  createdByName?: string;
  updatedByName?: string;
  timestamp: string;
};

export type PricingItem = { id: string; name: string; content: string; updatedAt: string };

/** ภาพของลิงก์ราคา — กลุ่ม = label เอง · kind ภาพราคา/ภาพตัวอย่าง (ของเก่าไม่มี kind = price) */
export type PriceLinkImage = { url: string; storagePath?: string; label?: string; kind?: "price" | "sample"; caption?: string };
export type PriceLink = {
  id: number;
  url: string;
  description: string;
  keywords?: string;
  images?: PriceLinkImage[];
  /** ชื่อกลุ่ม → โฟลเดอร์ในเครื่อง (แสดงอย่างเดียว) · '__unlabeled__' = ภาพที่ไม่มีกลุ่ม */
  localPaths?: Record<string, string>;
  /** ของเก่า: path เดียว */
  localPath?: string;
};

/** ประเภทความรู้ — ป้าย/สี ตามหน้าเดิม (badge) */
export const KB_TYPES: { key: string; label: string; tone: "coral" | "yolk" | "sky" | "mint" | "lilac" | "quiet" }[] = [
  { key: "problem", label: "ปัญหา", tone: "coral" },
  { key: "caution", label: "ระวัง", tone: "yolk" },
  { key: "tip", label: "เทคนิค", tone: "sky" },
  { key: "web-import", label: "จากเว็บ", tone: "mint" },
  { key: "paste-import", label: "วางเนื้อหา", tone: "lilac" },
  { key: "leader-answer", label: "หัวหน้าตอบ", tone: "sky" },
  { key: "pricing", label: "💰 ราคา", tone: "mint" },
  // 3 ต.ค. 69 สรุปจากแชท LINE จริง 579,547 คู่ถาม-ตอบ (ม.ค. 67 – ต.ค. 69) · source "line-chat-261002"
  { key: "chat-experience", label: "📈 จากแชทจริง", tone: "mint" },
  // มีตัวเลขเฉพาะ (ขั้นต่ำ/วัน/จำนวน) จากแชทเก่า อาจไม่ตรงปัจจุบัน — ยังไม่ส่งให้บอท · กดแก้ไข→บันทึก = ส่งเข้าบอท
  { key: "chat-review", label: "🔎 จากแชท·รอตรวจ", tone: "yolk" },
];
