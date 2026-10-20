import "server-only";
import { catalogRefs, type ProductRef } from "@/lib/server/price-answer";

/**
 * 🧾 การ์ดสินค้า LINE (รูปจากเว็บ · ชื่อ · ช่วงราคา · ปุ่ม "ดูราคา / สั่งเลย") — ทรงเดียวกับ productBubble ของ Site Price Flex
 * ใช้ร่วม: แอดมินส่งการ์ดจากหน้าแชท (chats/reply) + ร่างของบอทที่มีลิงก์สินค้า (bot-drafts · upgradeDraftMessages)
 */
const BRAND = "#1F6F78";

export type ProductCardInput = { name?: string; url?: string; image?: string; priceMin?: number; priceMax?: number; priceUnit?: string };

/**
 * 🏷 20 ต.ค. 69 "เริ่ม ฿78 / แผ่น A3" แทน "฿78 – 1,000" — ช่วงเดิมปนหลายหน่วย (แผ่น A3 กับ ตร.ม.) ไม่บอกหน่วย ลูกค้าอ่านว่าแผ่นละพัน
 * ราคาตามจำนวนจริงอยู่ในการ์ดราคาเต็มเมื่อลูกค้าบอกจำนวน · สูตรเดียวกับ priceText ใน n8n Site Price Flex
 */
export function priceText(c: ProductCardInput): string {
  const a = Number(c.priceMin ?? 0);
  const b = Number(c.priceMax ?? 0);
  if (!a) return "ดูราคาบนเว็บ";
  const unit = String(c.priceUnit ?? "").trim();
  return `${b > a ? "เริ่ม " : ""}฿${a.toLocaleString()}${unit ? ` / ${unit}` : ""}`;
}

/** bubble ของสินค้า 1 ตัว (ใช้เดี่ยว หรือรวมเป็น carousel) */
export function productBubble(c: ProductCardInput) {
  const name = String(c.name ?? "").slice(0, 60);
  const url = String(c.url ?? "");
  return {
    type: "bubble",
    size: "kilo",
    hero: c.image
      ? { type: "image", url: c.image, size: "full", aspectRatio: "4:3", aspectMode: "cover", action: { type: "uri", label: "ดูสินค้า", uri: url } }
      : undefined,
    body: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      paddingAll: "12px",
      contents: [
        { type: "text", text: name, weight: "bold", size: "sm", color: "#153B3F", wrap: true },
        { type: "text", text: priceText(c), size: "xs", color: "#A05A00", wrap: true },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "8px",
      contents: [{ type: "button", style: "primary", color: BRAND, height: "sm", action: { type: "uri", label: "ดูราคา / สั่งเลย", uri: url } }],
    },
  };
}

/** ข้อความ flex การ์ดสินค้า — 1 ตัว = bubble · หลายตัว = carousel (ข้อความเดียว ไม่กินช่อง 5 ข้อความของ LINE) */
export function productFlex(cards: ProductCardInput[]) {
  const list = cards.slice(0, 10);
  const alt = list.length === 1 ? `สินค้า: ${list[0].name ?? ""}` : `สินค้า ${list.length} รายการ: ${list.map((c) => c.name).join(", ")}`;
  return {
    type: "flex",
    altText: alt.slice(0, 380),
    contents: list.length === 1 ? productBubble(list[0]) : { type: "carousel", contents: list.map(productBubble) },
  };
}

/** ลิงก์หน้าสินค้าในข้อความ → path ที่เทียบได้ (ถอดรหัส %xx · ตัวเล็ก · ตัดท้าย) */
const pathKey = (url: string): string => {
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/\/+$/, "").toLowerCase();
  } catch {
    return "";
  }
};
const PRODUCT_LINK = /https?:\/\/(?:www\.)?iduckystore\.com\/products\/[^\s)"'<>]+/gi;

/** สินค้าในแคตตาล็อกที่ข้อความลิงก์ไปถึง (เรียงตามที่เจอ · ไม่ซ้ำ) */
export async function productsLinkedIn(texts: string[]): Promise<ProductRef[]> {
  const keys = [...new Set(texts.flatMap((t) => t.match(PRODUCT_LINK) ?? []).map((u) => pathKey(u.replace(/[.,!?]+$/, ""))).filter(Boolean))];
  if (!keys.length) return [];
  const byKey = new Map((await catalogRefs()).map((r) => [pathKey(r.url), r] as const));
  return keys.map((k) => byKey.get(k)).filter((r): r is ProductRef => !!r);
}
