/**
 * เครื่องมือค้นหาสินค้า/หมวดหมู่ที่ใช้ร่วมกันทั้งแถบค้นหาบนนาวบาร์ (เดสก์ท็อป)
 * และหน้าค้นหาเต็มจอ (มือถือ) — พอร์ตจาก IDSearch ในไฟล์ต้นแบบ LADNDING PAGE.html
 *
 * ต้นแบบสร้างดัชนีจาก DOM ที่พิมพ์ตายตัว · ของจริงสร้างจากหมวด + สินค้าในฐานข้อมูล (buildSearchIndex)
 * จัดลำดับ: ขึ้นต้นด้วยคำที่พิมพ์ > มีคำนั้นในชื่อ > เจอจากคำพ้อง/ชื่อหมวด > คำค้น SEO > คำอธิบายสินค้า
 *   > พิมพ์หลายคำแล้วเจอครบทุกคำ (สลับลำดับได้) · คะแนนเท่ากันให้ชื่อสั้นกว่าขึ้นก่อน
 * เทียบแบบไม่สนช่องว่าง ("กรอบรูป แคนวาส" = "กรอบรูปแคนวาส" · "canvasframe" = "Canvas Frame")
 */
import type { SearchExtra } from "@/lib/product-repo";
import type { ShopCategory } from "@/lib/categories";
import { accentOf, CAT_ICON } from "@/lib/cat-groups";
import { formatPrice, priceRange, productPath, type Product } from "@/lib/products";

export interface SearchHit {
  name: string;
  href: string;
  /** อีโมจิสำรองตอนไม่มีรูปไอคอนหมวด */
  icon: string;
  /** รูปไอคอนหมวด (วงกลมหน้าแถว) — ตามต้นแบบใช้ไอคอนหมวด ไม่ใช้รูปถ่ายสินค้า */
  img: string;
  /** รูปถ่ายสินค้าจริง — ใช้ในการ์ดพรีวิวลอย */
  photo: string;
  accent: string;
  price: string;
  /** ป้ายท้ายแถว: "หมวดหมู่" หรือชื่อหมวดของสินค้า */
  type: string;
  kind: "category" | "product";
  /** ข้อความที่เตรียมไว้ค้น (norm: ตัวพิมพ์เล็ก ไม่มีช่องว่าง) — ชื่อ / ชื่อ+หมวด+คำพ้อง / คำค้น SEO / คำอธิบาย */
  _name: string;
  _hay: string;
  _kw: string;
  _desc: string;
}

/** คำพ้อง/คำสะกดอื่นที่ลูกค้ามักพิมพ์ (ชุดเดียวกับต้นแบบ) */
const SYNONYMS: [string, string][] = [
  ["พวงกุญแจ", "keychain key chain คีย์เชน ที่ห้อยกุญแจ"],
  ["อะคริลิค", "acrylic อคริลิค แผ่นใส"],
  ["สแตนดี้", "standee สแตนดี สแตนดี้ ป้ายตั้งโต๊ะ"],
  ["ฐานไฟ", "led light ไฟ ป้ายไฟ โคมไฟ"],
  ["การ์ด", "card การ์ด"],
  ["โปสการ์ด", "postcard โปสการ์ด"],
  ["สติกเกอร์", "sticker สติ๊กเกอร์ สติกเกอร์"],
  ["สติ๊กเกอร์", "sticker สติ๊กเกอร์ สติกเกอร์"],
  ["เสื้อ", "shirt tshirt t-shirt เสื้อยืด เสื้อ"],
  ["หมวก", "cap hat หมวก"],
  ["ร่ม", "umbrella ร่ม"],
  ["หมอน", "pillow cushion หมอน"],
  ["ผ้าห่ม", "blanket ผ้าห่ม"],
  ["ถุงผ้า", "tote bag ถุงผ้า กระเป๋าผ้า"],
  ["ตุ๊กตา", "doll plush ตุ๊กตา"],
  ["เข็มกลัด", "pin badge เข็มกลัด"],
  ["แก้ว", "mug cup แก้ว แก้วน้ำ"],
  ["เมาส์แพด", "mousepad mouse pad แผ่นรองเมาส์"],
  ["กรอบรูป", "frame canvas กรอบรูป"],
  ["canvas", "แคนวาส แคนวัส ผ้าใบ กรอบรูป"],
  ["frame", "เฟรม กรอบ กรอบรูป"],
  ["เคส", "case เคส เคสมือถือ"],
  ["ของขวัญ", "gift ของขวัญ ของฝาก"],
  ["ของพรีเมียม", "premium ของพรีเมียม ของแจก"],
  ["งานกระดาษ", "paper งานกระดาษ"],
  ["ผ้า", "fabric cloth ผ้า"],
];
function synonymsFor(name: string): string {
  let extra = "";
  const n = name.toLowerCase();
  for (const [k, v] of SYNONYMS) if (n.includes(k)) extra += " " + v;
  return extra.toLowerCase();
}

/** คำค้นยอดฮิต (โชว์ตอนยังไม่พิมพ์) */
export const POPULAR_SEARCHES = ["พวงกุญแจอะคริลิค", "สแตนดี้", "สติ๊กเกอร์", "เสื้อยืด", "แก้วมัค", "ตุ๊กตา"];

/** ราคาเริ่มต้นแบบสั้น ๆ — ไม่มีราคา (งานขอใบเสนอ) = ว่าง */
export function startPriceLabel(p: Product): string {
  const { min, max } = priceRange(p);
  if (!(min > 0)) return "";
  return max > min ? `เริ่ม ${formatPrice(min)}` : formatPrice(min);
}

/**
 * ชื่อหมวดใน DB เป็น "Keychain & Acrylic — พวงกุญแจ / งานอะคริลิค" → main = ส่วนภาษาไทย (อ่านง่ายในเมนูมือถือ) · sub = ส่วน EN
 * ไม่มีขีดคั่น = ใช้ทั้งชื่อเป็น main
 */
export function splitCatName(name: string): { main: string; sub: string } {
  const parts = name.split(/\s*[—–]\s*|\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return { main: name, sub: "" };
  return { main: parts.slice(1).join(" / "), sub: parts[0] };
}

export function categoryIcon(c: ShopCategory): string {
  return c.image || CAT_ICON[c.id] || "";
}

/** ตัวพิมพ์เล็ก + ตัดช่องว่างทั้งหมด — ลูกค้าเว้นวรรคไม่ตรงกับชื่อในร้านบ่อย */
const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "");

/** สร้างดัชนีค้นหา: หมวดทุกหมวด + สินค้าทุกตัว (ไม่นับที่ซ่อน) · extra = คำอธิบาย/คำค้น SEO (โหลดทีหลังได้) */
export function buildSearchIndex(cats: ShopCategory[], products: Product[], extra?: SearchExtra): SearchHit[] {
  const visible = cats.filter((c) => !c.hidden);
  const catIndex = new Map(visible.map((c, i) => [c.id, i] as const));
  const catHits: SearchHit[] = visible.map((c, i) =>
    mk({
      name: c.name,
      href: `/products?category=${c.id}`,
      icon: c.emoji || "🗂️",
      img: categoryIcon(c),
      photo: "",
      accent: accentOf(c.id, i),
      price: "",
      type: "หมวดหมู่",
      kind: "category",
    }, c.description || "")
  );
  const prodHits: SearchHit[] = products
    .filter((p) => !p.hidden)
    .map((p) => {
      const ci = catIndex.get(p.category);
      const cat = ci !== undefined ? visible[ci] : undefined;
      return mk({
        name: p.name,
        href: productPath(p),
        icon: "🛍️",
        img: cat ? categoryIcon(cat) : "",
        photo: p.imageSrc || "",
        accent: accentOf(p.category, ci ?? 0),
        price: startPriceLabel(p),
        type: cat?.name.split(/\s*[—–]\s*/)[0] ?? "สินค้า",
        kind: "product",
      }, extra?.get(p.id)?.desc ?? p.description ?? "", extra?.get(p.id)?.kw ?? (p.seo?.keywords ?? []).join(" "));
    });
  return [...catHits, ...prodHits];
}
function mk(h: Omit<SearchHit, "_name" | "_hay" | "_kw" | "_desc">, desc = "", kw = ""): SearchHit {
  const name = h.name || "";
  return { ...h, _name: norm(name), _hay: norm(name + " " + (h.type || "") + synonymsFor(name)), _kw: norm(kw), _desc: norm(desc) };
}

/**
 * คะแนนความตรงของคำค้น (ยิ่งน้อยยิ่งตรง · -1 = ไม่ตรง)
 * 0 ชื่อขึ้นต้น · 1 อยู่ในชื่อ · 2 คำพ้อง/หมวด · 3 คำค้น SEO · 4 คำอธิบาย · 5 พิมพ์หลายคำ เจอครบทุกคำ
 */
export function matchScore(it: Pick<SearchHit, "_name" | "_hay" | "_kw" | "_desc">, q: string): number {
  const t = norm(q);
  if (!t) return -1;
  if (it._name.startsWith(t)) return 0;
  if (it._name.includes(t)) return 1;
  if (it._hay.includes(t)) return 2;
  if (it._kw.includes(t)) return 3;
  if (it._desc.includes(t)) return 4;
  const words = (q || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const all = it._hay + " " + it._kw + " " + it._desc;
    if (words.every((w) => all.includes(w))) return 5;
  }
  return -1;
}

/** ข้อความค้นหาของสินค้าตัวเดียว (ใช้กรองหน้ารายการสินค้า ?q=) */
export function productSearchFields(p: Product, catName = "", extra?: SearchExtra) {
  return mk(
    { name: p.name, href: "", icon: "", img: "", photo: "", accent: "", price: "", type: catName, kind: "product" },
    extra?.get(p.id)?.desc ?? p.description ?? "",
    extra?.get(p.id)?.kw ?? (p.seo?.keywords ?? []).join(" ")
  );
}

/** ค้นหา — คืนรายการเรียงตามความตรง (ว่าง = ไม่พิมพ์อะไร) */
export function querySearch(index: SearchHit[], q: string): SearchHit[] {
  if (!norm(q)) return [];
  const scored: { it: SearchHit; sc: number }[] = [];
  for (const it of index) {
    const sc = matchScore(it, q);
    if (sc >= 0) scored.push({ it, sc });
  }
  scored.sort((a, b) => a.sc - b.sc || a.it._name.length - b.it._name.length);
  return scored.map((x) => x.it);
}

/** แยกชื่อเป็น [ก่อน, ช่วงที่ตรง, หลัง] เพื่อทำตัวหนาเฉพาะช่วงที่ตรงกับคำที่พิมพ์ */
export function markParts(name: string, term: string): [string, string, string] {
  const t = (term || "").trim().toLowerCase();
  const i = t ? (name || "").toLowerCase().indexOf(t) : -1;
  if (i < 0) return [name, "", ""];
  return [name.slice(0, i), name.slice(i, i + t.length), name.slice(i + t.length)];
}

/* ---------- ค้นหาล่าสุด (sessionStorage — หายเมื่อปิดแท็บ ตามต้นแบบ) ---------- */
const HKEY = "iducky_recent_searches";
let mem: string[] = []; // สำรองในหน่วยความจำ เผื่อเบราว์เซอร์บล็อก sessionStorage
export function recentSearches(): string[] {
  try {
    const v = sessionStorage.getItem(HKEY);
    if (v !== null) return JSON.parse(v) as string[];
  } catch {
    /* ignore */
  }
  return mem;
}
function saveRecent(list: string[]) {
  mem = list;
  try {
    sessionStorage.setItem(HKEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
export function pushRecentSearch(q: string) {
  q = (q || "").trim();
  if (!q) return;
  saveRecent([q, ...recentSearches().filter((x) => x !== q)].slice(0, 6));
}
export function removeRecentSearch(q: string) {
  saveRecent(recentSearches().filter((x) => x !== q));
}
export function clearRecentSearches() {
  saveRecent([]);
}

/** ลิงก์หน้ารายการสินค้าพร้อมคำค้น (ว่าง = ทั้งหมด) */
export const searchHref = (q: string) => (q.trim() ? `/products?q=${encodeURIComponent(q.trim())}` : "/products");
