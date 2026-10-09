/**
 * 🏷 ป้ายลูกค้า LINE แบบกำหนดเอง (9 ต.ค. 69 17:55 — เจ้าของร้าน: "มีหน้าจัดการแก้ไข tag และติด tag ได้มากกว่า 1 อัน")
 *
 * - รายการป้ายเก็บที่ Firestore ordersure `settings/chat-tags` { items: ChatTag[] } · ไม่มีเอกสาร = ใช้ DEFAULT_TAGS (3 ป้ายเดิมของหน้า ลูกค้า LINE)
 * - ลูกค้าแต่ละคน: `adminTags: string[]` (หลายป้าย) · `adminTag` (ป้ายเดี่ยวของเดิม) ยังเขียนเป็นป้ายแรก ให้หน้า ลูกค้า LINE/ตัวกรองเดิมทำงานต่อได้
 * - สีเลือกจากจานสีของหลังบ้าน (token --dk-*) ไม่ใช่ hex อิสระ · ป้ายต้องมีอีโมจิ+คำ ไม่ใช่สีอย่างเดียว
 */
export type TagColor = "coral" | "yolk" | "mint" | "sky" | "lilac" | "navy" | "quiet";
export type ChatTag = { key: string; label: string; emoji: string; color: TagColor };

export const TAG_PALETTE: Record<TagColor, { wash: string; ink: string; tone: string; name: string }> = {
  coral: { wash: "var(--dk-coral-wash, #FDE8E6)", ink: "var(--dk-coral-ink, #B91C1C)", tone: "var(--dk-coral-deep, #DC2626)", name: "แดง" },
  yolk: { wash: "var(--dk-yolk-wash, #FFF4D6)", ink: "var(--dk-yolk-ink, #8A5A00)", tone: "var(--dk-yolk-deep, #D97706)", name: "เหลือง" },
  mint: { wash: "var(--dk-mint-wash, #E7F8EE)", ink: "var(--dk-mint-ink, #166534)", tone: "var(--dk-mint, #16A34A)", name: "เขียว" },
  sky: { wash: "var(--dk-sky, #E6F1FB)", ink: "var(--dk-blue-deep, #1D4ED8)", tone: "var(--dk-blue, #2563EB)", name: "ฟ้า" },
  lilac: { wash: "var(--dk-lilac-wash, #EFE9FB)", ink: "var(--dk-lilac-ink, #5B21B6)", tone: "var(--dk-lilac, #7C3AED)", name: "ม่วง" },
  navy: { wash: "#E2E8F0", ink: "var(--dk-navy, #173A6B)", tone: "var(--dk-navy, #173A6B)", name: "กรมท่า" },
  quiet: { wash: "#F1F5F9", ink: "#475569", tone: "#64748B", name: "เทา" },
};
export const TAG_COLORS = Object.keys(TAG_PALETTE) as TagColor[];

/** 3 ป้ายเดิม (key ตรงกับ CUSTOMER_TAGS ของหน้า ลูกค้า LINE) */
export const DEFAULT_TAGS: ChatTag[] = [
  { key: "urgent", label: "ด่วนมาก", emoji: "🔴", color: "coral" },
  { key: "rush", label: "เร่งดำเนินการ", emoji: "🟡", color: "yolk" },
  { key: "normal", label: "งานปกติ", emoji: "🟢", color: "mint" },
];

export const MAX_TAGS = 30;

/** ทำความสะอาดรายการป้ายจาก DB/ฟอร์ม — key เป็น slug a-z0-9-_ ไม่ซ้ำ · label ≤ 24 · emoji ≤ 4 ตัวอักษร · สีต้องอยู่ในจาน */
export function sanitizeTags(raw: unknown): ChatTag[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ChatTag[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const key = String(o.key ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
    const label = String(o.label ?? "").trim().slice(0, 24);
    const emoji = String(o.emoji ?? "").trim().slice(0, 4);
    const color = (TAG_COLORS as string[]).includes(String(o.color)) ? (String(o.color) as TagColor) : "quiet";
    if (!key || !label || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label, emoji, color });
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** key ใหม่จากชื่อ (ไทยทั้งหมด → tag-<เวลา>) */
export function keyFromLabel(label: string): string {
  const ascii = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  return ascii || `tag-${Date.now().toString(36)}`;
}
