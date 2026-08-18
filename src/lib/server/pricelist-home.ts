import "server-only";

/**
 * 📋 อ่านรายชื่อสินค้าจาก "หน้าแรก" ของเว็บตารางราคา (iduckyofficial-pricelists.com)
 *
 * หน้าแรกเป็นสารบัญรวมทั้งเว็บอยู่แล้ว — แบ่งเป็นหัวข้อ "หมวดหมู่ : …"
 * ใต้หัวข้อเป็นการ์ดสินค้า (รูป + ชื่อ + ลิงก์ไปหน้าตารางราคา)
 * ไฟล์นี้จึงดึงแค่หน้าเดียว ไม่ต้องไล่เข้าไปทีละหน้า
 *
 * โครงหน้าเป็น Wix: การ์ด 1 ใบ = <div role="listitem"> 1 ก้อน
 * ข้อความในการ์ดอยู่ในกล่อง id ลงท้าย __item… ส่วนหัวข้อหมวดไม่มี __item → แยกกันได้
 */

/** สินค้า 1 ใบบนหน้าแรกเว็บตารางราคา */
export interface PricelistCard {
  /** ชื่อใต้รูป (ถ้าขึ้นหลายบรรทัดจะต่อกันด้วยช่องว่าง) */
  name: string;
  /** หัวข้อ "หมวดหมู่ : …" ที่อยู่เหนือการ์ดใบนั้น */
  category: string;
  /** หน้าตารางราคาที่การ์ดใบนั้นลิงก์ไป (ว่าง = การ์ดไม่ได้ใส่ลิงก์ไว้) */
  url: string;
}

export const PRICELIST_HOME = "https://www.iduckyofficial-pricelists.com/";

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&deg;/g, "°")
    .replace(/&times;/g, "×")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

/** ตัดแท็ก + ช่องว่างซ้อน (รวมอักขระล่องหน zero-width/NUL ที่ Wix ชอบแทรกกลางคำ) */
const strip = (s: string) =>
  decode(s.replace(/<[^>]+>/g, " "))
    .replace(/[\u200b\u200c\u200d\ufeff\u0000]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** ข้อความในย่อหน้า/หัวข้อของกล่องข้อความหนึ่งกล่อง */
const linesOf = (segment: string) =>
  [...segment.matchAll(/<(?:p|h[1-6])[^>]*>([\s\S]*?)<\/(?:p|h[1-6])>/g)].map((m) => strip(m[1])).filter(Boolean);

/** แยกสินค้าจาก HTML หน้าแรก (แยกเป็นฟังก์ชันไว้ ทดสอบได้โดยไม่ต้องยิงเน็ต) */
export function parsePricelistHome(html: string): PricelistCard[] {
  // ── หัวข้อหมวด + ตำแหน่งในหน้า (กล่องข้อความที่ไม่ได้อยู่ในการ์ด) ──
  const heads: { at: number; name: string }[] = [];
  for (const m of html.matchAll(/<div id="(comp-[\w-]+)"[^>]*data-testid="richTextElement"/g)) {
    if (m[1].includes("__item")) continue;
    const at = m.index ?? 0;
    const first = linesOf(html.slice(at, at + 4000))[0] ?? "";
    if (first.startsWith("หมวดหมู่")) heads.push({ at, name: first.replace(/^หมวดหมู่\s*:?\s*/, "").trim() });
  }

  // ── การ์ดสินค้า ──
  const starts = [...html.matchAll(/<div role="listitem"/g)].map((m) => m.index ?? 0);
  const cards: PricelistCard[] = [];
  starts.forEach((start, i) => {
    const seg = html.slice(start, starts[i + 1] ?? html.length);
    const texts: string[] = [];
    for (const box of seg.matchAll(
      /<div id="comp-[\w-]+__item[\w-]*"[^>]*data-testid="richTextElement"([\s\S]*?)(?=<div id="comp-|$)/g
    )) {
      texts.push(...linesOf(box[1]));
    }
    if (!texts.length) return; // การ์ดที่มีแต่รูป (แบนเนอร์/ตกแต่ง) — ไม่ใช่รายการสินค้า
    let category = "";
    for (const h of heads) if (h.at < start) category = h.name;
    cards.push({
      name: texts.join(" "),
      category,
      url: seg.match(/<a[^>]+href="(https?:\/\/[^"]+)"/)?.[1] ?? "",
    });
  });
  return cards;
}

/**
 * ดึงหน้าแรกแล้วอ่านรายชื่อสินค้า
 * @param refresh true = ดึงใหม่ทันที (ปกติใช้ของที่แคชไว้ 30 นาที จะได้ไม่ยิงเว็บเขาทุกครั้งที่เปิดหน้า)
 */
export async function fetchPricelistHome(refresh = false): Promise<PricelistCard[]> {
  const r = await fetch(PRICELIST_HOME, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckyAdmin/1.0)" },
    ...(refresh ? { cache: "no-store" as const } : { next: { revalidate: 1800 } }),
  });
  if (!r.ok) throw new Error(`เว็บตารางราคาตอบกลับ HTTP ${r.status}`);
  return parsePricelistHome(await r.text());
}
