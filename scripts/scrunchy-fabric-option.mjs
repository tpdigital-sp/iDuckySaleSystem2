#!/usr/bin/env node
/**
 * ยางรัดผมผ้าซาติน (scrunchy) — เพิ่มกลุ่มตัวเลือก "เนื้อผ้า" (ผ้าซาตินอินโด) + เติมให้ออเดอร์เก่าที่สั่งไปแล้ว
 *
 *   node scripts/scrunchy-fabric-option.mjs           (ดูภาพ/แผนก่อน ไม่เขียน DB)
 *   node scripts/scrunchy-fabric-option.mjs --write   (อัปโหลดภาพ + เขียนกลุ่ม + เติม sel ให้ออเดอร์เก่า + อ่านกลับเทียบ)
 *   node scripts/scrunchy-fabric-option.mjs --write --skip-orders   (แตะเฉพาะสินค้า)
 *
 * ที่มา (เจ้าของร้านแจ้ง 14 ก.ย. 69 จาก OD-260911-5197 "เนื้อผ้าหาย"):
 *   สินค้าตัวนี้ไม่เคยมีกลุ่ม "เนื้อผ้า" เลย (ตรวจ backup 28 ส.ค. → 4 ก.ย. มีแค่ ขนาด + สีไหมเย็บชิ้นงาน)
 *   ออเดอร์จึงไม่มีบรรทัดเนื้อผ้าให้ทีมผลิตอ่าน — กราฟฟิกต้องพิมพ์เอาเองในหมายเหตุแบบงาน ("ยางมัดผม ซาตินอินโด")
 *   สินค้างานผ้าตัวอื่นของร้าน (clip-pouch · pillow-keychain · scented-stone · shawl …) มีกลุ่มนี้กันหมด
 *
 * ใบสเปคร้าน 40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/35_หนังยาง ผ้าคลุมไหล่ ผ้าผูก/P-nitemยางพันไหล่-01.jpg:
 *   ยางรัดผม = "ผ้าซาติน อินโด" ชนิดเดียว (กว้าง 5 x ยาว 45 cm · เริ่ม 90.-)
 *   → กลุ่มนี้จึงมีตัวเลือกเดียว ทำหน้าที่ "บอกเนื้อผ้าให้ติดไปกับออเดอร์" ไม่ใช่ให้ลูกค้าเลือก
 *     (อยากขายเนื้อผ้าอื่นเมื่อไหร่ เติม choice เพิ่มในหน้าแก้ไขสินค้าได้เลย)
 *
 * ⚠️ ตารางราคาตัวนี้เป็นคอลัมน์เดียว (cells [""] · driverLabels []) — ห้ามให้กลุ่มนี้กลายเป็นแกนราคา
 *    (ดู [[iducky-price-driver-trap]]) · สคริปต์ตรวจให้หลังเขียนทุกครั้ง
 * รันซ้ำได้: เจอกลุ่ม "เนื้อผ้า" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ · ออเดอร์ที่มีบรรทัดแล้วข้าม
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const ARGV = process.argv.slice(2);
const WRITE = ARGV.includes("--write");
const SKIP_ORDERS = ARGV.includes("--skip-orders");

const PRODUCT_ID = "scrunchy";
const VER = "v1";
const FILE = `fabric-satin-indo-${VER}.jpg`;
const OUT = ".cache/scrunchy/upload";

const GROUP = "เนื้อผ้า";
const CHOICE = "ผ้าซาตินอินโด";
const CHOICE_DESC =
  "เนื้อลื่น มันวาว เล่นแสงได้ดี มี texture เนื้อทรายเล็กน้อย เนื้อผ้าอยู่ทรง ยืดหยุ่นได้ดี ซักง่าย แห้งเร็วไม่ต้องรีด";
const GROUP_NOTE = "ยางรัดผมของร้านใช้ **ผ้าซาตินอินโด** ชนิดเดียว (ตามใบสเปคร้าน) — เนื้อผ้าที่เหมาะกับงานหนังยางมัดผมที่สุด";
/** ชุดตัวเลือกเดิมของสินค้ามีกรอบเดียว — ใส่กรอบเดียวกันไว้ ไม่ต้องแบ่งใหม่ */
const SECTION = "1. ขนาด + งานปัก";

/* ── ภาพตัวอย่างเนื้อผ้า: ครอปรูปสวอตช์จากใบผ้าจริงของร้าน ───────────────────────────
   /Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/เนื้อผ้าต่างๆ/14.Satin indo.jpg
   (1969×1970 · ครึ่งบนเป็นรูปผ้า ครึ่งล่างเป็นข้อความ — เอาเฉพาะรูป)
   ไดรฟ์ไม่ได้ mount = ข้ามภาพ เขียนกลุ่มแบบไม่มีรูป (ตัวเลือกยังติดไปกับออเดอร์ได้เหมือนกัน) */
const SWATCH = "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/เนื้อผ้าต่างๆ/14.Satin indo.jpg";
const SWATCH_CROP = { left: 105, top: 115, width: 1770, height: 1160 };

let buf = null;
try {
  buf = await sharp(readFileSync(SWATCH)).extract(SWATCH_CROP).resize(900).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${FILE}`, buf);
  console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — สวอตช์ผ้าซาตินอินโดจากใบผ้าร้าน`);
} catch (e) {
  console.warn("⚠️ ครอปรูปผ้าไม่ได้ (ไดรฟ์ร้านไม่ได้ต่อ?) — จะเขียนกลุ่มแบบไม่มีรูป:", e.message);
}

if (!WRITE) {
  console.log(`\nแผน: สินค้า ${PRODUCT_ID} + กลุ่ม "${GROUP}" → "${CHOICE}" (การ์ด · ไม่บวกราคา) แทรกต่อจากกลุ่ม "ขนาด"`);
  console.log(`      ออเดอร์เก่าที่มี ${PRODUCT_ID}: เติม sel["${GROUP}"] = "${CHOICE}" ให้ทีมผลิตเห็นบรรทัดเนื้อผ้า`);
  console.log("\n(ยังไม่เขียน DB — รันด้วย --write)");
  process.exit(0);
}

// ── ต่อ Supabase ───────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── 1) อัปโหลดภาพ + เขียนกลุ่มลงสินค้า ──────────────────────────────
let imageSrc = "";
if (buf) {
  const key = `products/${PRODUCT_ID}/${FILE}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  imageSrc = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", imageSrc);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

const group = {
  label: GROUP,
  display: "cards",
  note: GROUP_NOTE,
  section: options.find((o) => o.label === "ขนาด")?.section ?? SECTION,
  choices: [{ name: CHOICE, desc: CHOICE_DESC, ...(imageSrc ? { imageSrc } : {}) }],
};
const at = options.findIndex((o) => o.label === GROUP);
if (at >= 0) options[at] = { ...options[at], ...group };
else {
  const afterSize = options.findIndex((o) => o.label === "ขนาด");
  options.splice(afterSize >= 0 ? afterSize + 1 : 0, 0, group);
}

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("id");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === GROUP);
if (g?.display !== "cards" || g?.choices?.[0]?.name !== CHOICE || (imageSrc && g.choices[0].imageSrc !== imageSrc)) {
  console.error("อ่านกลับกลุ่มเนื้อผ้าไม่ตรง!", g); process.exit(1);
}
/* กันเผลอ: กลุ่มนี้ต้องไม่กลายเป็นแกนตารางราคา (ราคาเป็นคอลัมน์เดียว คีย์ "") */
for (const p of [back.data.pricing, ...(back.data.priceRates ?? []).map((rr) => rr.pricing)]) {
  if ((p?.driverLabels ?? []).includes(GROUP) || !p?.cells?.[""]) { console.error("ตารางราคาเพี้ยน!", p?.driverLabels, Object.keys(p?.cells ?? {})); process.exit(1); }
}
console.log(`✓ สินค้า: กลุ่ม "${GROUP}" → "${CHOICE}" · ลำดับกลุ่ม = ${back.data.options.map((o) => o.label).join(" → ")}`);

if (SKIP_ORDERS) process.exit(0);

// ── 2) ออเดอร์ที่สั่งไปแล้ว — เติมบรรทัดเนื้อผ้าให้ทีมผลิตอ่าน ────────────
/* ใบที่สั่งก่อนมีกลุ่มนี้ไม่มีทางระบุเนื้อผ้าอื่นได้ (ร้านมีชนิดเดียว) — เติมค่าเดียวกันได้ปลอดภัย
   เขียนทั้ง sel และ selections ให้ตรงกันเสมอ ([[iducky-edit-selections-sel-first]])
   ⚠️ selections แทรกต่อท้ายท่อน "ขนาด: …" ไม่สร้างใหม่จาก sel — ลำดับเดิมในข้อความจะได้ไม่สลับ */
const { data: orders, error: ordErr } = await sb.from("orders").select("id,data").order("created_at", { ascending: false });
if (ordErr) { console.error(ordErr); process.exit(1); }

const touched = [];
const backup = [];
for (const o of orders) {
  const items = o.data?.items ?? [];
  const beforeItems = JSON.stringify(items); // สำรองสภาพเดิมก่อนแก้ (ต้องก๊อปก่อน ไม่งั้นได้ของที่แก้แล้ว)
  let changed = false;
  for (const it of items) {
    if (it.productId !== PRODUCT_ID) continue;
    if (!it.sel || it.sel[GROUP]) continue; // ใบข้อความล้วน/มีแล้ว → ไม่แตะ
    const sel = {};
    for (const [k, v] of Object.entries(it.sel)) {
      sel[k] = v;
      if (k === "ขนาด") sel[GROUP] = CHOICE;
    }
    if (!sel[GROUP]) sel[GROUP] = CHOICE; // ไม่มีบรรทัดขนาด → ต่อท้าย
    it.sel = sel;
    const line = `${GROUP}: ${CHOICE}`;
    const text = (it.selections ?? "").trim();
    const SIZE_PART = /(^|\s·\s)(ขนาด:\s*[^·]*?)(?=\s·\s|$)/;
    if (!text) it.selections = line;
    else if (SIZE_PART.test(text)) it.selections = text.replace(SIZE_PART, `$1$2 · ${line}`);
    else it.selections = `${text} · ${line}`;
    changed = true;
  }
  if (!changed) continue;
  backup.push({ id: o.id, items: JSON.parse(beforeItems) });
  o.data.savedAt = new Date().toISOString();
  const { error: uErr } = await sb.from("orders").update({ data: o.data }).eq("id", o.id);
  if (uErr) { console.error("อัปเดตออเดอร์พัง", o.id, uErr); process.exit(1); }
  touched.push(o.id);
}

if (touched.length) {
  mkdirSync("backups", { recursive: true });
  const path = `backups/scrunchy-fabric-before-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  writeFileSync(path, JSON.stringify(backup, null, 2));
  console.log(`✓ ออเดอร์เติมบรรทัดเนื้อผ้า ${touched.length} ใบ: ${touched.join(", ")} · สำรองไว้ที่ ${path}`);
} else {
  console.log("• ออเดอร์: ไม่มีใบไหนต้องเติม (มีบรรทัดเนื้อผ้าครบแล้ว)");
}
