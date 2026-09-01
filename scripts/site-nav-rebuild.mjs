#!/usr/bin/env node
/**
 * เมนู mega ของหน้าร้าน (__site_nav__) — ซ่อมลิงก์ + ย้ายสินค้าเข้าคอลัมน์ให้ครบ
 * ผู้ใช้สั่ง 31 ส.ค. 69
 *
 *   node scripts/site-nav-rebuild.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/site-nav-rebuild.mjs --write   # บันทึกจริง (สำรองของเดิมลง backups/ ก่อนเสมอ)
 *
 * 1) ทุกรายการในเมนูถูกจับคู่กับสินค้าจริง (id → slug → ชื่อ → เทียบชื่อ)
 *    - จับคู่ได้แต่ลิงก์ไม่ตรง  → เขียน href ใหม่ตาม productPath จริง
 *    - จับคู่ไม่ได้เลย/สินค้าถูกลบ → ตัดรายการนั้นทิ้ง (ลิงก์ตาย)
 *    - สินค้ายังเป็นฉบับร่าง → คงไว้แต่รายงานเตือน (กดเผยแพร่แล้วใช้ได้ทันที)
 * 2) สินค้าที่อยู่ในหมวดของกลุ่มนั้นแต่ยังไม่มีในเมนู → ย้ายเข้าคอลัมน์ที่ตรงเรื่องตาม RULES
 *    ไม่เข้ากติกาข้อไหนเลย → ลง Other products · คอลัมน์ที่ยังไม่มีจะถูกสร้างต่อท้าย
 * 3) เรียงในคอลัมน์: ตัวมีป้าย H (ขายดี) → N (มาใหม่) → ที่เหลือ (คงลำดับเดิมในแต่ละชั้น)
 *    แล้วตัดให้เหลือคอลัมน์ละไม่เกิน MAX_ITEMS รายการ (ผู้ใช้สั่ง 31 ส.ค. 69 — กันแผงยาวเกินจอ)
 *    ตัดใครก่อน: ป้าย H → N → ที่เหลือเรียงตามยอดขาย (sold) มากไปน้อย
 *    คอลัมน์ที่ถูกตัด จะต่อท้ายด้วยลิงก์ "+ อีก n รายการ →" ชี้ไปหน้าหมวดของคอลัมน์นั้น
 *    (ลิงก์นี้ id ลงท้าย -more · รอบถัดไปสร้างใหม่ทุกครั้ง ไม่นับเป็นรายการสินค้า)
 *
 * รันซ้ำได้ — อ่านสินค้าสดทุกครั้ง เพิ่มสินค้าใหม่แล้วรันทับได้เลย
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const NAV_ID = "__site_nav__";
/** จำนวนรายการสูงสุดต่อคอลัมน์ */
const MAX_ITEMS = 8;

/** หมวดที่อยู่ในเมนูแต่ละกลุ่ม (ตกลงกับผู้ใช้ 31 ส.ค. 69) */
const GROUP_CATS = {
  "DIGITAL PRINT": ["sticker-paper", "banner", "cat-msrdpxqn"],
  "SIMPLE GIFTS": ["acrylic", "standee", "gifts"],
  "GADGET PHONE": ["phone-gadget", "cat-mssijpgu"],
  FABRIC: ["cat-mt2bpoyj", "bag"],
  "HOME DECOR": ["fabric", "apparel", "cat-mssnwupp"],
};

/**
 * ย้ายรายการที่อยู่ในเมนูอยู่แล้วไปคอลัมน์อื่น (ผู้ใช้สั่งเป็นรายตัว)
 * ทำหลังจัดคอลัมน์เสร็จ ก่อนตัดให้เหลือ MAX_ITEMS
 */
const MOVES = [
  // 31 ส.ค. 69 — กระดาษแข็ง 2 mm ไม่ใช่งานกระดาษพิมพ์ทั่วไป
  { group: "DIGITAL PRINT", to: "Other products", match: /card\s*broad\s*foam|ultra-?hard\s*cardboard/i },
];

/** กติกาย้ายสินค้าเข้าคอลัมน์ — ไล่จากบนลงล่าง เจอก่อนชนะ */
const RULES = {
  "DIGITAL PRINT": [
    ["Calendar", /ปฏิทิน|ปฎิทิน|calendar/i],
    ["Photocard", /photo\s*card|photocard|โฟโต้การ์ด/i],
    ["Other products", /\bdtf\b|card\s*broad\s*foam|ultra-?hard\s*cardboard/i],
    ["Sticker Digital", /วาชิ|washi|สติ๊กเกอร์\s*digital/i],
    ["Sticker UV | Solvent", /สติ๊กเกอร์|sticker|solvent|hologram/i],
    ["Poster & Banner", /ป้าย|โปสเตอร์|poster|banner|ผ้าเชียร์|x-stand|roll\s*up|ไวนิล/i],
    ["Paper Product", /กระดาษ|paper|foil|cardboard|card\s*broad|โปสการ์ด|polaroid/i],
    ["Stationery", /สมุด|ปากกา|ดินสอ|คลิป|clipboard|ที่คั่น|bookmark|แจกัน|นาฬิกา|mouse\s*pad|wall\s*tidy|แม่เหล็ก|magnet/i],
  ],
  "SIMPLE GIFTS": [
    ["Photo Frame", /กรอบรูป|frame/i],
    ["Standee", /สแตนดี้|standee|stand\s*up|แท่งไฟ|light\s*(stick|box|bon)|ferris|swinger|dream\s*world|pirate|bending|โยกเยก|ไม้กระดก|rotating/i],
    ["Keyring & Acrylic", /พวงกุญแจ|keyring|acrylic|อะคริลิค|carabiner|jibbitz|gibbitz|3d/i],
    ["Drinkware", /แก้ว|mug/i],
    ["Knickknack Bag", /กระเป๋า|bag|ถุง|passport/i],
    ["Doll & Gift", /ตุ๊กตา|doll|ปัก|patch|หมอน|pillow|หอม|สเปรย์|ยาดม|พัด|fan|จิ๊กซอว์|puzzle|แผ่นหิน/i],
  ],
  "GADGET PHONE": [
    ["Griptok", /griptok/i],
    ["Case Phone", /case|เคส/i],
    ["Phone Stand", /stand|ตั้งโทรศัพท์/i],
    ["Holder Phone", /holder|wallet|ซองใส่บัตร|frame\s*card|magsafe/i],
    ["Strap & Lanyard", /สายคล้อง|สายห้อย|lanyard|strap|hanging|แขวน|clip|บัคเคิ้ล/i],
  ],
  FABRIC: [
    ["Shirt", /เสื้อ|shirt|crop|over\s*size|unisex|yuedpao|awesome/i],
    ["Tote Bag", /กระเป๋าผ้า|ถุงผ้า|tote|shopping\s*bag|candy\s*bag/i],
    ["Bag & Wallet", /กระเป๋า|bag|wallet|folder/i],
    ["Women Product", /ยางรัดผม|scrunchy|ผ้าพัน|คลุมไหล่/i],
    ["General Products", /หมวก|กางเกง|pants|cap|bucket|pouch|ผ้าหนึบ/i],
  ],
  "HOME DECOR": [
    ["Pillow Case / ปลอกหมอน", /หมอน|pillow/i],
    ["PET", /สัตว์เลี้ยง|ปลอกคอ|pet\b/i],
    ["Sign & Display", /ป้าย|โปสเตอร์|x-stand|roll\s*up|ผ้าแขวน|stand/i],
    ["Kitchenware", /แก้ว|mug|coaster|รองแก้ว|ที่เปิดขวด|ผ้ากันเปื้อน|ฟองน้ำ|รองจาน|สแตนเลส/i],
    ["Home Decor", /ผ้าห่ม|blanket|ขนหนู|พรม|ตะขอ|ปลั๊ก|ไฟแช็ค|lighter|ร่ม|umbrella|กระจก|mirror|comb|ผ้าปิดตา|sleep\s*mask|sticky|ผ้าเช็ดหน้า/i],
  ],
};

// ── เชื่อม Supabase ──────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const norm = (s) => String(s ?? "").toLowerCase().replace(/[\s\-_/|().,"'’]/g, "");
const pathOf = (p) => `/products/${encodeURIComponent((p.slug || "").trim() || p.id)}`;
const keyOf = (p) => (p.slug || "").trim() || p.id;

const { data: rows, error } = await sb.from("products").select("id,name,category,sort,sold,data");
if (error) throw error;

const ALL = rows
  .filter((r) => !String(r.id).startsWith("__"))
  .map((r) => ({
    id: r.id,
    slug: String(r.data?.slug ?? "").trim(),
    name: String(r.data?.name ?? r.name ?? "").trim(),
    cat: r.data?.category ?? r.category ?? "",
    badge: r.data?.badge ?? "",
    sort: r.sort ?? 0,
    sold: Number(r.data?.sold ?? r.sold ?? 0),
    hidden: !!r.data?.hidden,
  }));
const LIVE = ALL.filter((p) => !p.hidden);

const byKey = new Map();
const byName = new Map();
for (const p of ALL) {
  byKey.set(norm(p.id), p);
  if (p.slug) byKey.set(norm(p.slug), p);
  byName.set(norm(p.name), p);
}
/** จับคู่รายการเมนู → สินค้าจริง */
function resolve(href, label) {
  const raw = String(href ?? "").split("?")[0];
  if (!raw.startsWith("/products/")) return null;
  const tail = norm(decodeURIComponent(raw.replace(/^\/products\//, "")));
  if (byKey.has(tail)) return byKey.get(tail);
  if (byName.has(tail)) return byName.get(tail);
  const l = norm(label);
  if (byKey.has(l)) return byKey.get(l);
  if (byName.has(l)) return byName.get(l);
  for (const p of ALL) {
    const n = norm(p.name);
    if (n.length >= 4 && (tail.includes(n) || l.includes(n))) return p;
  }
  return null;
}
const badgeOf = (p) => (p.badge === "ใหม่" ? "N" : p.badge === "ขายดี" ? "H" : "");

const navRow = rows.find((r) => r.id === NAV_ID);
if (!navRow) throw new Error("ไม่พบแถว __site_nav__ ในฐาน");
const nav = structuredClone(navRow.data?.nav ?? {});
const mega = nav.mega ?? [];

const report = { fixed: [], dropped: [], draft: [], moved: 0, newCols: [], trimmed: [], movedByHand: [] };

for (const g of mega) {
  const used = new Set();
  const cols = (g.columns ?? []).map((col) => {
    const items = [];
    for (const it of col.items ?? []) {
      if (String(it.id ?? "").endsWith("-more")) continue;
      const p = resolve(it.href, it.label);
      if (!p) {
        report.dropped.push(`${g.label} · ${col.title} · ${it.label} (${it.href})`);
        continue;
      }
      if (p.hidden) report.draft.push(`${g.label} · ${col.title} · ${it.label} → ${keyOf(p)}`);
      const href = pathOf(p);
      if (decodeURIComponent(href) !== decodeURIComponent(String(it.href)))
        report.fixed.push(`${g.label} · ${it.label}: ${it.href} → ${href}`);
      used.add(keyOf(p));
      items.push({ ...it, href, _sold: p.sold, _cat: p.cat });
    }
    return { ...col, items };
  });

  const idx = new Map(cols.map((c, i) => [c.title, i]));
  const pool = (GROUP_CATS[g.label] ?? [])
    .flatMap((cid) => LIVE.filter((p) => p.cat === cid))
    .filter((p) => !used.has(keyOf(p)))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  for (const p of pool) {
    const hit = (RULES[g.label] ?? []).find(([, re]) => re.test(p.name));
    let i = hit ? idx.get(hit[0]) : cols.findIndex((c) => /other/i.test(c.title));
    if (i === undefined || i < 0) {
      const title = hit ? hit[0] : "Other products";
      i = cols.push({ id: `${g.id}-${norm(title).slice(0, 12)}`, title, items: [] }) - 1;
      idx.set(title, i);
      report.newCols.push(`${g.label} · ${title}`);
    }
    cols[i].items.push({ id: p.id, label: p.name, href: pathOf(p), badge: badgeOf(p), _sold: p.sold, _cat: p.cat });
    report.moved++;
  }
  // ย้ายรายตัวตามที่สั่ง
  for (const mv of MOVES.filter((m) => m.group === g.label)) {
    const picked = [];
    for (const c of cols) {
      if (c.title === mv.to) continue;
      c.items = c.items.filter((it) => (mv.match.test(it.label) ? (picked.push(it), false) : true));
    }
    if (!picked.length) continue;
    let t = cols.find((c) => c.title === mv.to);
    if (!t) cols.push((t = { id: `${g.id}-move`, title: mv.to, items: [] }));
    t.items.push(...picked);
    report.movedByHand.push(`${g.label}: ${picked.map((x) => x.label).join(", ")} → ${mv.to}`);
  }

  // เรียงป้ายขึ้นก่อน แล้วตัดเหลือ MAX_ITEMS
  const rank = (b) => (b === "H" ? 0 : b === "N" ? 1 : 2);
  g.columns = cols.map((c) => {
    const sorted = c.items
      .map((it, i) => ({ it, i }))
      .sort((a, b) => rank(a.it.badge) - rank(b.it.badge) || (b.it._sold ?? 0) - (a.it._sold ?? 0) || a.i - b.i)
      .map((x) => x.it);
    const keep = sorted.slice(0, MAX_ITEMS).map(({ _sold, _cat, ...it }) => it);
    const cut = sorted.slice(MAX_ITEMS);
    if (cut.length) {
      report.trimmed.push(`${g.label} · ${c.title}: ตัด ${cut.length} — ${cut.map((x) => x.label).join(", ")}`);
      // หมวดที่สินค้าในคอลัมน์นี้อยู่มากที่สุด → ปลายทางของ "ดูเพิ่มเติม"
      const tally = {};
      for (const it of sorted) if (it._cat) tally[it._cat] = (tally[it._cat] ?? 0) + 1;
      const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
      keep.push({
        id: `${c.id ?? norm(c.title)}-more`,
        label: `+ อีก ${cut.length} รายการ →`,
        href: top ? `/products?category=${encodeURIComponent(top)}` : "/products",
        badge: "",
      });
    }
    return { ...c, items: keep };
  });
}

console.log(`ลิงก์แก้ให้ตรง ${report.fixed.length} · ตัดทิ้ง (ไม่มีสินค้าแล้ว) ${report.dropped.length} · ย้ายเข้าเมนู ${report.moved} · คอลัมน์ใหม่ ${report.newCols.length}`);
console.log("\n— ลิงก์ที่เขียนใหม่ —");
report.fixed.forEach((s) => console.log("  " + s));
console.log("\n— ตัดทิ้งเพราะไม่มีสินค้าแล้ว —");
report.dropped.forEach((s) => console.log("  " + s));
if (report.draft.length) {
  console.log("\n— ชี้ไปสินค้าที่ยังเป็นฉบับร่าง (คงไว้ ต้องกดเผยแพร่) —");
  report.draft.forEach((s) => console.log("  " + s));
}
console.log("\n— ย้ายรายตัวตามที่สั่ง —");
report.movedByHand.forEach((s) => console.log("  " + s));
console.log(`\n— ตัดออกเพราะเกินคอลัมน์ละ ${MAX_ITEMS} —`);
report.trimmed.forEach((s) => console.log("  " + s));
console.log("\n— คอลัมน์ที่เพิ่มใหม่ —");
report.newCols.forEach((s) => console.log("  " + s));
console.log("\n— ผังหลังแก้ —");
for (const g of mega)
  console.log(`  ${g.label}: ` + g.columns.map((c) => `${c.title} (${c.items.length})`).join(" · "));

if (!WRITE) {
  console.log("\nยังไม่ได้บันทึก — ใส่ --write เพื่อบันทึกจริง");
  process.exit(0);
}

mkdirSync(new URL("../backups/", import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const bak = new URL(`../backups/site-nav-before-${stamp}.json`, import.meta.url);
writeFileSync(bak, JSON.stringify(navRow.data, null, 1));
console.log(`\nสำรองของเดิมไว้ที่ backups/site-nav-before-${stamp}.json`);

const { error: e2 } = await sb.from("products").update({ data: { ...navRow.data, nav } }).eq("id", NAV_ID);
if (e2) throw e2;
console.log("บันทึกลง __site_nav__ เรียบร้อย");
