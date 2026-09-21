/**
 * 📣 ลงป้ายประชาสัมพันธ์ชุด 2 (4 ใบ) เข้าระบบป้ายหน้าแรก (/admin/banners) — เจ้าของร้านสั่ง 19 ก.ย. 69
 *   ⚡ early-pay     โอนภายใน 1 ชม. ลดเพิ่มสูงสุด ฿10     → /products
 *   🏅 member-tier   สมาชิกสะสมยอด ลดสูงสุด 10%          → /account
 *   🤝 dealer        รับสมัครตัวแทนจำหน่าย               → /dealer
 *   💬 line-consult  ปรึกษาแอดมินฟรีทาง LINE             → /line
 *
 * v4 (21 ก.ย. 69): ใช้ "ภาพที่เจ้าของร้านทำเอง" เป็นป้ายเต็มใบ — โฟลเดอร์ ~/Desktop/ป้ายประชาสัมพันธ์-iDucky-ชุด2/ภาพจากเจ้าของร้าน
 * ชิ้นลูกเล่นเป็นของลอยทับ (ดาว/หัวใจ/วงแหวนเรียกกดที่ปุ่ม) จาก /public/landing — ตำแหน่งอยู่ใน promo-banners-set2.layers.json
 * ⚠️ ป้ายตัวแทนยังไม่มีไฟล์มือถือ — ไม่ใส่ imageMobile (หน้าร้านจะย่อรูปจอคอมให้)
 * ต่อท้ายแถว __promo_banners__ ไม่ทับใบอื่น · รันซ้ำ = อัปเดตใบเดิมตาม id · เปลี่ยนเนื้อรูปต้องขยับ VER (กันแคช CDN)
 *
 * รัน: node --env-file=.env.local scripts/promo-banners-set2.mjs [--dry] [id ...]
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const DIR = path.join(os.homedir(), "Desktop", "ป้ายประชาสัมพันธ์-iDucky-ชุด2", "ภาพจากเจ้าของร้าน");
const ROW_ID = "__promo_banners__";
const BUCKET = "product-images";
const VER = "v5"; // v5 (21 ก.ย. 69): ขยายเป็น 2320×810 เท่ากันทุกใบ (กันขอบขาว) + เร่งความคม · มือถือ 1800px
const DRY = process.argv.includes("--dry");
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const BANNERS = [
  // v8 (21 ก.ย. 69): ภาพจอคอมชุดล่าสุดของเจ้าของร้าน (2000×698 = 2.865:1 พอดีสัดส่วนป้าย ขยายเป็น 2320×810 ตรง ๆ ไม่ต้องครอป)
  //       มือถือยังเป็นไฟล์เดิม v7 → ต้องคัดลอกเป็นชื่อ v8 ด้วย (สคริปต์ใช้เลขรุ่นเดียวต่อป้าย)
  { id: "web-order-24h", title: "สั่งเองผ่านเว็บ ได้ตลอด 24 ชม.", href: "/products", ver: "v8", hidden: false },
  // v6 = ตัดนาฬิกา/คูปองออกมาเป็นชิ้นขยับ (ดู scratchpad cut.py) ฐานจึงเป็นภาพที่ซ่อมรูแล้ว
  { id: "early-pay", title: "โอนภายใน 1 ชม. ลดเพิ่มสูงสุด ฿10", href: "/products", ver: "v6" },
  { id: "member-tier", title: "สมาชิกสะสมยอด ลดสูงสุด 10%", href: "/account" },
  { id: "dealer", title: "รับสมัครตัวแทนจำหน่าย", href: "/dealer" },
  { id: "line-consult", title: "ปรึกษาแอดมินฟรีทาง LINE", href: "/line" },
].filter((b) => !ONLY.length || ONLY.includes(b.id));

const FX = JSON.parse(await readFile(new URL("./promo-banners-set2.layers.json", import.meta.url), "utf8"));
const PARTS = "ชิ้นส่วนขยับ"; // ชิ้นที่ "ตัดออกมาจากภาพป้าย" (นาฬิกา/คูปอง) ไว้ทำเป็นของขยับ — src ในไฟล์ตำแหน่งขึ้นต้นด้วย @

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function upload(file) {
  const bytes = await readFile(path.join(DIR, file)).catch(() => null);
  if (!bytes) return null; // ไม่มีไฟล์ (เช่น ป้ายที่ยังไม่มีเวอร์ชันมือถือ) = ข้ามไป
  const dest = `products/banners/${file.split("/").pop()}`;
  if (DRY) return `(dry) ${dest} ${Math.round(bytes.length / 1024)}KB`;
  const { error } = await sb.storage.from(BUCKET).upload(dest, bytes, { contentType: "image/webp", upsert: true });
  if (error) throw new Error(`อัปโหลด ${file} ไม่สำเร็จ: ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(dest).data.publicUrl;
}

/** src "@ชื่อไฟล์" = ชิ้นในโฟลเดอร์ ชิ้นส่วนขยับ → อัปขึ้น Storage แล้วแทนด้วย URL จริง (รันซ้ำ = ทับไฟล์เดิม) */
const uploaded = new Map();
async function resolvePieces(list) {
  for (const l of list ?? []) {
    if (!l.src?.startsWith("@")) continue;
    const name = l.src.slice(1);
    if (!uploaded.has(name)) {
      const url = await upload(`${PARTS}/${name}`);
      if (!url) throw new Error(`ไม่มีไฟล์ชิ้นส่วน ${name}`);
      uploaded.set(name, url);
    }
    l.src = uploaded.get(name);
  }
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", ROW_ID).maybeSingle();
if (readErr) throw new Error(`อ่านแถวป้ายไม่สำเร็จ: ${readErr.message}`);
const cur = row?.data?.banners ?? { on: true, seconds: 6, items: [] };
let items = [...(cur.items ?? [])];

for (const b of BANNERS) {
  const fx = FX[b.id];
  if (!fx) throw new Error(`ไม่มีตำแหน่งชิ้นลูกเล่นของ ${b.id} ใน layers.json`);
  const ver = b.ver ?? VER; // บางใบมีรุ่นไฟล์ของตัวเอง
  const image = await upload(`${b.id}-d-${ver}.webp`);
  if (!image) throw new Error(`ไม่มีรูปจอคอมของ ${b.id}`);
  const imageMobile = await upload(`${b.id}-m-${ver}.webp`);
  await resolvePieces(fx.layers);
  await resolvePieces(fx.layersMobile);
  const banner = {
    ...b,
    ver: undefined,
    image,
    imageMobile: imageMobile ?? undefined,
    shine: true,
    layers: fx.layers,
    layersMobile: imageMobile ? fx.layersMobile : undefined,
  };
  items = items.some((x) => x.id === b.id) ? items.map((x) => (x.id === b.id ? { ...x, ...banner } : x)) : [...items, banner];
  console.log(`• ${b.id} — ${banner.image}${imageMobile ? "" : " (ไม่มีรูปมือถือ)"}`);
}

if (DRY) {
  console.log(`(dry) หลังรันจะมีป้าย ${items.length} ใบ: ${items.map((x) => x.id).join(", ")}`);
  process.exit(0);
}

const { error } = await sb
  .from("products")
  .upsert(
    { id: ROW_ID, name: "(ตั้งค่าร้าน — ป้ายประชาสัมพันธ์)", category: "__settings__", price: 0, data: { ...(row?.data ?? {}), banners: { ...cur, items } } },
    { onConflict: "id" }
  );
if (error) throw new Error(`บันทึกแถวป้ายไม่สำเร็จ: ${error.message}`);

const { data: back } = await sb.from("products").select("data").eq("id", ROW_ID).maybeSingle();
console.log(`✅ ป้ายในระบบ ${back?.data?.banners?.items?.length} ใบ: ${back?.data?.banners?.items?.map((x) => x.id).join(", ")}`);
