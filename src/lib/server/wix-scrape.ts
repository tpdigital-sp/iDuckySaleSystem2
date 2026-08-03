import "server-only";
import type { PriceMatrix, ProductOption } from "@/lib/products";

/** สินค้าที่ตรวจพบจากหน้า Wix (ก่อนให้แอดมิน review/แก้) */
export interface DetectedProduct {
  name: string;
  unit: string;
  price: number;
  options: ProductOption[];
  pricing: PriceMatrix;
  imageUrl?: string;
  /** รูปทั้งหมดที่เจอในช่วงของสินค้านี้ (เรียงใหญ่→เล็ก) — ให้แอดมินเลือกตอนนำเข้า */
  imageUrls?: string[];
  /** ชนิดตารางที่ตรวจได้ (ไว้โชว์ให้ผู้ใช้เข้าใจ) */
  kind: "tiers" | "matrix" | "size";
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&deg;/g, "°").replace(/&times;/g, "×")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&gt;/g, ">").replace(/&lt;/g, "<")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&lsquo;|&rsquo;/g, "'").replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const BADNAME = /^\(|^\*|ADD ON|^เพิ่มเติม|บวกเพิ่ม|ทำได้เฉพาะ|^เรทราคา|=|สั่งขั้นต่ำ|มีความหนา|^\d+([.,]\d+)?\s*x\s*\d+|^\d+\s*ชุดจำนวน|^\d+\s*ชิ้น|^\d+\s*หลา/;
const num = (s: string) => Number(String(s).replace(/[^\d.]/g, "").replace(/\.$/, "")) || 0;
const unitFrom = (l: string) => (l || "").replace(/[\d\-\s,]/g, "").replace("ขึ้นไป", "") || "ชิ้น";
const parseRows = (t: string) =>
  [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
    [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
  );

/**
 * โดเมนที่ยอมให้ดึงข้อมูลได้ — กันคนกรอก URL ภายในองค์กร/เครือข่ายส่วนตัว
 * (พนักงานใช้หน้านำเข้าได้ด้วย จึงต้องจำกัดปลายทางไว้)
 */
const ALLOWED_HOSTS = [
  "www.iduckyofficial-pricelists.com",
  "iduckyofficial-pricelists.com",
  "www.iduckyprintsstudio.com",
  "iduckyprintsstudio.com",
];

export function isAllowedScrapeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function getHtml(url: string): Promise<string> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (r.ok) { const h = await r.text(); if (/<table/.test(h) || i === 2) return h; }
    } catch {
      /* retry */
    }
    await new Promise((z) => setTimeout(z, 500));
  }
  return "";
}

/** normalize URL — รับได้ทั้ง full URL, //host/path, หรือ /path (เติมโดเมน iduckyofficial) */
export function normalizeWixUrl(input: string): string {
  const s = input.trim();
  if (/^https?:\/\//.test(s)) return s;
  const path = s.startsWith("/") ? s : "/" + s;
  return "https://www.iduckyofficial-pricelists.com" + path;
}

/** ดึง+แปลงสินค้าจากหน้า Wix (ตารางราคา + ชื่อ + รูป) */
export async function scrapeWixPage(inputUrl: string): Promise<{ products: DetectedProduct[]; skipped: number }> {
  const url = normalizeWixUrl(inputUrl);
  if (!isAllowedScrapeUrl(url)) {
    throw new Error(`นำเข้าได้เฉพาะจากเว็บของร้านเท่านั้น (${ALLOWED_HOSTS[0]})`);
  }
  const html = await getHtml(url);
  if (!html) return { products: [], skipped: 0 };

  // รูป/ไอคอนขยะที่ไม่ใช่รูปสินค้า: ddb95188/d18e3f8f/e2a0c467 = ตัวคั่น/แบนเนอร์ · 551cc5af = โลโก้ "uc" (โผล่ก่อนตารางแรกทุกหน้า)
  const imgs = [...html.matchAll(/<img[^>]+src="(https:\/\/static\.wixstatic\.com\/media\/959b83_[0-9a-f]+~mv2\.(?:jpg|png)[^"]*)"/g)]
    .map((m) => ({ pos: m.index!, id: (m[1].match(/media\/(959b83_[0-9a-f]+~mv2\.(?:jpg|png))/) || [])[1], w: +((m[1].match(/w_(\d+)/) || [])[1] || 0) }))
    .filter((x) => x.id && !/ddb95188|d18e3f8f|e2a0c467|551cc5af/.test(x.id) && x.w >= 90 && x.w <= 900);

  // เก็บตำแหน่งตารางทั้งหมดไว้ก่อน เพื่อให้รู้ขอบเขต "ตารางถัดไป" (ใช้จับรูปที่อยู่หลังตารางของสินค้านี้)
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/g)];
  const products: DetectedProduct[] = [];
  let skipped = 0;
  for (let ti = 0; ti < tables.length; ti++) {
    const mt = tables[ti];
    const idx = mt.index!;
    const end = idx + mt[0].length;
    const nextStart = ti + 1 < tables.length ? tables[ti + 1].index! : html.length;
    const before = html.slice(Math.max(0, idx - 1400), idx);
    const labels = [...before.matchAll(/wixui-rich-text__text[^>]*>([\s\S]*?)<\/(?:p|span|div|h[1-6])>/g)].map((m) => strip(m[1])).filter((t) => t && t.length < 70);
    const name = [...labels].reverse().find((t) => t.length >= 3 && !BADNAME.test(t)) || "";
    const rows = parseRows(mt[0]).filter((r) => r.length);
    const head = rows[0] || [];
    const body = rows.slice(1).filter((r) => r[0]);
    const bad = !name || rows.length < 2 || /ADD ON|เพิ่มเติม/.test(name) || /เพิ่มเติม/.test(head[0] || "");

    let detected: DetectedProduct | null = null;
    if (!bad) {
      const tiers = body.map((r, i) => ({ upTo: i === body.length - 1 ? null : num((r[0].match(/-(\d+)|(\d+)\D*$/) || [])[0] || ""), label: r[0] }));
      const unit = unitFrom(body[0]?.[0]);
      if (/จำนวน/.test(head[0] || "") && head.length === 2) {
        const cells = body.map((r) => num(r[1]));
        detected = { name, unit, price: cells[0] || 0, options: [], pricing: { unit, driverLabels: [], tiers, cells: { "": cells } }, kind: "tiers" };
      } else if (/จำนวน/.test(head[0] || "") && head.length > 2) {
        const sizes = head.slice(1).map((h) => h.trim()).filter(Boolean);
        if (sizes.length) {
          const cells: Record<string, number[]> = {};
          sizes.forEach((s, ci) => { cells[s] = body.map((r) => num(r[ci + 1])); });
          detected = { name, unit, price: cells[sizes[0]]?.[0] || 0, options: [{ label: "ขนาด", choices: sizes.map((s) => ({ name: s })) }], pricing: { unit, driverLabels: ["ขนาด"], tiers, cells }, kind: "matrix" };
        }
      } else if (/ขนาด|size/i.test(head[0] || "") && head.length === 2 && /ราคา/.test(head[1] || "")) {
        const sizes = body.map((r) => r[0]).filter(Boolean);
        const cells: Record<string, number[]> = {};
        body.forEach((r) => { cells[r[0]] = [num(r[1])]; });
        detected = { name, unit: "ชิ้น", price: num(body[0]?.[1]), options: [{ label: "ขนาด", choices: sizes.map((s) => ({ name: s })) }], pricing: { unit: "ชิ้น", driverLabels: ["ขนาด"], tiers: [{ upTo: null, label: "ราคา/ขนาด" }], cells }, kind: "size" };
      }
    }

    if (detected) {
      // โครง Wix: ชื่อ → ตารางราคา → แกลเลอรีรูป · รูปสินค้าจึงอยู่ "หลัง" ตารางของสินค้านี้ จนถึงตารางถัดไป
      // (เดิมจับจากช่วงก่อนตาราง ทำให้สินค้าตัวแรกได้โลโก้ และตัวถัดๆ ได้รูปของสินค้าก่อนหน้า — เพี้ยนทั้งหมด)
      const cands = imgs.filter((im) => im.pos > end && im.pos < nextStart);
      if (cands.length) {
        // เก็บทุกรูปในช่วงนี้ (ไม่ซ้ำ, เรียงใหญ่→เล็ก, สูงสุด 8) ให้แอดมินเลือกตอนนำเข้า
        const seen = new Set<string>();
        const urls = cands
          .sort((a, b) => b.w - a.w)
          .filter((im) => (seen.has(im.id) ? false : (seen.add(im.id), true)))
          .slice(0, 8)
          .map((im) => `https://static.wixstatic.com/media/${im.id}/v1/fill/w_900,h_675,al_c,q_85/file.jpg`);
        detected.imageUrls = urls;
        detected.imageUrl = urls[0];
      }
      products.push(detected);
    } else {
      skipped++;
    }
  }
  return { products, skipped };
}
