/**
 * สร้างสินค้า "Shake Shake Acrylic (พวงกุญแจเขย่า)" ลงร่างเดิม id: new-mt2rp5i3-9488
 * (ร่างเปล่าที่หลังบ้านสร้างไว้ 21 ส.ค. 69 — คง id เดิมให้ลิงก์ /products/new-mt2rp5i3-9488 ใช้ต่อได้)
 *
 *   npx tsx scripts/shake-shake-build.mts            # ดูข้อมูล + เซฟภาพตัวอย่างลง scratchpad_out/ (ไม่เขียน DB)
 *   npx tsx scripts/shake-shake-build.mts --write    # อัปรูป + เขียนลง Supabase (ฉบับร่าง)
 *
 * ที่มา: iduckyofficial-pricelists.com/otheracrylicproducts หัวข้อ "Shake Shake Acrylic (พวงกุญแจเขย่า)"
 *   สคริปต์อ่านตารางสดทุกครั้ง (ยึดหัวข้อแล้วหา <table> ตัวถัดไป) — ราคาเปลี่ยนเมื่อไหร่รันซ้ำได้
 *   ตาราง: จำนวน | ราคากรอบเขย่า | + | ตัวน้อยเขย่า ขนาด 2-2.5cm
 *     1-10 ชุด 290 + ตัวละ 20 · 11-29 ชุด 200 + ตัวละ 15 · 30-49 = 180 · 50-99 = 160 · 100+ = 150 (ตัวละ 15 ทุกช่วงส่ง)
 *
 * วิธีโมเดลราคา (กลไกที่มีอยู่แล้วทั้งหมด — ไม่แตะ lib):
 *   • กรอบเขย่า = ตารางขั้นบันไดคอลัมน์เดียว (driverLabels []) หน่วย "ชุด"
 *   • ตัวน้อยเขย่า = กลุ่ม multi 1 ตัวเลือก เปิดระบุจำนวน (qty ต่อชุด) + เรทตามช่วงจำนวนชุด:
 *     กลุ่มตั้ง extraFromQty = 11 · ตัวเลือกตั้ง extra 15 (เรทส่ง) / extraBelow 20 (เรทปลีก 1-10 ชุด)
 *     — ชุดเดียวกับค่าฐานสแตนดี้ช่วงปลีก (standy-base-retail-fee.mjs) ระบบคิด/โชว์ป้ายให้เอง
 *   • เพิ่มขนาดกรอบ (เริ่ม 6 ซม. เกินคิด ซม.ละ 20) = multi + qty หน่วย "ซม." แบบ cable-care-cm-unit
 *   • คละลาย: 1-10 ชุด คละอิสระ · 11+ คละลายละ 5 ชุดขึ้นไป → priceRates เรทเดียว
 *     minPerDesign 5 + freeMixBelowQty 11 (แพตเทิร์น add-mobile-hanging-diecut)
 *
 * ภาพ (ตามที่ผู้ใช้สั่ง 25 ส.ค. 69 — ตัวเลือกต้องมีภาพประกอบว่าแต่ละแบบหน้าตายังไง):
 *   แกลเลอรี 5 ใบ: ช็อตรวม 7 แบบจากไดรฟ์ร้าน (Case Web/ลงแล้ว/Shake Shake Acrylic) + รูปงานจริง
 *   จากหน้า pricelists (static.wixstatic.com) — กรอบกลมใส / กรอบไดคัทใหญ่ / กรอบพร้อมตัวน้อย
 *   ภาพตัวเลือก "ตัวน้อยเขย่า" = ครอปโซนตัวน้อย 7 ตัวจากรูปงานจริง (เห็นชิ้นตัวน้อยชัด ๆ)
 *   ภาพตัวเลือก "เพิ่มขนาดกรอบ" = รูปกรอบไดคัทใบใหญ่ (ใช้ไฟล์เดียวกับแกลเลอรี)
 *   ⚠️ ต้อง mount ไดรฟ์ /Volumes/iDuckyShop ก่อนรัน · ห้ามอัปทับชื่อไฟล์เดิม (Next/CDN แคช) — แก้รูปขยับ v2
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { hasQuoteOption, priceRange, type PriceMatrix, type Product, type ProductOption } from "../src/lib/products";

/**
 * ตะขอ/ห่วง (ผู้ใช้สั่ง 25 ส.ค. 69: "เพิ่มในส่วนของตะขอ คล้ายๆกับพวงกุญแจ")
 * — ดึงกลุ่ม "รับตะขอไหม" + "ตะขอ" (ลิงก์คลังกลาง preset-3) + กลุ่ม "สีตะขอ" ทุกกลุ่ม
 *   จากสินค้าพวงกุญแจอะคริลิคหลัก (keyring-copy-copy) มาใส่ทั้งชุด — คลังกลางแก้ที่เดียวอัปเดตตาม
 * — ต่างจากพวงกุญแจตรงเงื่อนไขความหนา: พวงกุญแจผูก Z1/Z2 ฟรี + เหมาปลีกกับ "ความหนาอะคริลิค = 3mm"
 *   ซึ่งสินค้านี้ไม่มีกลุ่มนั้น (กรอบเขย่าประกบ 2 ชิ้น หนากว่า 3 มม. เสมอ) → ตัด `when` ทิ้ง:
 *   Z1/Z2 แถมฟรีตลอด (freeWhen ผูกกับ "รับตะขอไหม = รับตะขอ" ที่จริงเสมอเมื่อกลุ่มโชว์)
 *   และช่วงปลีก 1-10 ชุด เลือกตะขออื่นคิดเหมา 10 บาท/ชุด (smallQtyFee ชุดเดียวกับพวงกุญแจ)
 * — รูปแผ่นอะไหล่ + ชาร์ตสีตะขอ (G/H/I/S/T/U) ก็อปจาก products/keyring-clear-stopper (ฉบับ v3)
 *   ไปไว้ในแท็บ "ตะขอ / ห่วง" — ไม่ใส่รูปที่ตัวเลือก กันชาร์ตทะลักเข้าแกลเลอรี (บทเรียน keyring-stopper)
 */
const KEYRING_ID = "keyring-copy-copy"; // สินค้าพวงกุญแจหลัก (ลิงก์หน้าร้าน /products/keyring)
const HOOK_GATE = "รับตะขอไหม";
const HOOK_GROUP = "ตะขอ";
const HOOK_FREE = ["Z1 ห่วงกลม (สีเงิน)", "Z2 โซ่ไข่ปลา (สีเงิน)"];
const HOOK_RETAIL_FEE = 10; // ช่วงปลีก 1-10 ชุด เลือกตะขอ (นอกจาก Z1/Z2) คิดเหมาชุดละ 10 บาท
const HOOK_CHART_SRC = "products/keyring-clear-stopper"; // โฟลเดอร์รูปอะไหล่ต้นทาง (ฉบับ v3)
const HOOK_CHARTS = ["parts-board", "hook-g", "hook-h", "hook-i", "hook-s", "hook-t", "hook-u"];

const WRITE = process.argv.includes("--write");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const ID = "new-mt2rp5i3-9488"; // ร่างเดิมชื่อ "พวงกุญแจ เขย่า" — เขียนทับตัวนี้ ไม่สร้าง id ใหม่
const OLD_NAME = "พวงกุญแจ เขย่า";
const NAME = "Shake Shake Acrylic (พวงกุญแจเขย่า)";
const CATEGORY = "acrylic";
const V = "v1"; // ⚠️ แก้รูปครั้งหน้าขยับเป็น v2 (กันแคช)
const PAGE = "https://www.iduckyofficial-pricelists.com/otheracrylicproducts";
const UNIT = "ชุด";
const BASE_CM = 6; // กรอบเขย่าเริ่มต้น 6 ซม. (ด้านที่ยาวที่สุด)
const GROUP_CHARM = "ตัวน้อยเขย่า";
const CHARM_CHOICE = "ตัวน้อยเขย่า ขนาด 2-2.5 ซม."; // ⚠️ ห้ามมี " + " ในชื่อ (ชน MULTI_SEP)
const GROUP_SIZE = "ขนาดกรอบเขย่า";
const SIZE_CHOICE = `เพิ่มขนาดกรอบ จาก ${BASE_CM} ซม.`;

/**
 * โครงสร้างกรอบเขย่า — สเปคจากทางร้าน (ผู้ใช้แจ้ง 25 ส.ค. 69):
 * กรอบหน้า · ตัวกลาง 1 มม. · กรอบหลัง 1.5 มม. · ตัวเขย่า 1-1.5 มม.
 */
const STRUCTURE_LINES = [
  "กรอบหน้า — อะคริลิคใสสกรีนลาย ปิดด้านหน้า",
  "ตัวกลาง หนา 1 มม. — ชั้นเว้นช่องตรงกลาง เป็นพื้นที่ให้ตัวน้อยลอยขยับ",
  "กรอบหลัง หนา 1.5 มม. — อะคริลิคใสสกรีนลาย ปิดด้านหลัง",
  "ตัวน้อยเขย่า หนา 1-1.5 มม. ขนาด 2-2.5 ซม. — ลอยอยู่ในช่องตัวกลาง เขย่าแล้วขยับได้",
];

const DRIVE = "/Volumes/iDuckyShop/Case Web/ลงแล้ว/Shake Shake Acrylic";

const OUT = new URL("../scratchpad_out/shake-shake/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = (file: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

/* ── 1. ดึงตารางราคาสดจากเว็บ ───────────────────────────────────── */
const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s: string) => decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const html = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } }).then((r) => {
  if (!r.ok) throw new Error(`ดึงหน้า ${PAGE} ไม่ได้ — HTTP ${r.status}`);
  return r.text();
});

const anchor = html.indexOf("Shake Shake");
if (anchor < 0) throw new Error("หาหัวข้อ Shake Shake บนหน้าเว็บไม่เจอ — โครงหน้าอาจเปลี่ยน");
const t = html.indexOf("<table", anchor);
if (t < 0) throw new Error("หา <table> ถัดจากหัวข้อ Shake Shake ไม่เจอ");
const rows = [...html.slice(t, html.indexOf("</table>", t)).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
  [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
);

const head = rows[0]?.join("|") ?? "";
if (!/จำนวน/.test(head) || !/กรอบเขย่า/.test(head) || !/ตัวน้อยเขย่า/.test(head))
  throw new Error(`หัวตาราง Shake Shake ไม่ตรงคาด: "${head}" — โครงหน้าเว็บอาจเปลี่ยน`);

const body = rows.slice(1);
const tiers = body.map((r, i) => {
  if (!/ชุด/.test(r[0])) throw new Error(`แถวช่วงจำนวนไม่ตรงคาด: "${r[0]}"`);
  const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: i === body.length - 1 ? null : m ? Number(m[2]) : null, label: r[0] };
});
if (tiers.some((tt, i) => i < tiers.length - 1 && !tt.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ");

const framePrices = body.map((r) => {
  const n = Number(String(r[1]).replace(/[^\d]/g, ""));
  if (!n) throw new Error(`แถว "${r[0]}" ราคากรอบอ่านไม่ได้ (${r[1]})`);
  return n;
});
const charmPrices = body.map((r) => {
  const m = (r[3] ?? "").match(/ตัวละ\s*(\d+)/);
  if (!m) throw new Error(`แถว "${r[0]}" ราคาตัวน้อยอ่านไม่ได้ (${r[3]})`);
  return Number(m[1]);
});
const CHARM_RETAIL = charmPrices[0]; // 1-10 ชุด (20)
const CHARM_BULK = charmPrices[1]; // 11 ชุดขึ้นไป (15)
if (charmPrices.slice(1).some((p) => p !== CHARM_BULK))
  throw new Error(`ราคาตัวน้อยช่วงส่งไม่เท่ากันทุกแถว (${charmPrices.join("/")}) — กลไก extra/extraBelow รองรับแค่ 2 เรท ตรวจหน้าเว็บก่อน`);
const BULK_FROM = Number((body[1][0].match(/^(\d+)/) ?? [])[1]);
if (!BULK_FROM) throw new Error(`อ่านจุดเริ่มเรทส่งจากแถว "${body[1][0]}" ไม่ได้`);

// ค่าเพิ่มขนาดกรอบ — ข้อความใต้ตาราง "กรอบเขย่าเริ่มต้นที่ขนาด 6cm เพิ่มขนาดบวกเพิ่ม cm ละ 20 บาท"
// (อยู่ระหว่างตาราง Shake กับตารางถัดไป — ห้าม slice สั้น เพราะ Wix แทรก CSS ยาวคั่นก่อนถึงข้อความ)
const tEnd = html.indexOf("</table>", t);
const nextT = html.indexOf("<table", tEnd);
const sec = html.slice(tEnd, nextT > 0 ? nextT : undefined);
const om = strip(sec).match(/กรอบเขย่าเริ่มต้นที่ขนาด\s*(\d+)\s*cm\s*เพิ่มขนาดบวกเพิ่ม\s*cm\s*ละ\s*(\d+)\s*บาท/i);
if (!om) throw new Error("หาข้อความ 'กรอบเขย่าเริ่มต้นที่ขนาด ..cm เพิ่มขนาดบวกเพิ่ม cm ละ .. บาท' ไม่เจอ — ตรวจหน้าเว็บก่อน");
if (Number(om[1]) !== BASE_CM)
  throw new Error(`ขนาดเริ่มต้นกรอบบนเว็บ (${om[1]} ซม.) ไม่ตรงกับที่สคริปต์ตั้งไว้ (${BASE_CM} ซม.) — อัปเดต BASE_CM ก่อน`);
const OVERSIZE_BAHT = Number(om[2]);

const PRICING: PriceMatrix = {
  unit: UNIT,
  driverLabels: [],
  tiers,
  cells: { "": framePrices },
  // 🏷️ หัวคอลัมน์ราคา (ตารางคอลัมน์เดียวปกติหัวว่าง) — ผู้ใช้สั่ง 25 ส.ค. 69 ให้เขียน "กรอบเขย่า"
  colLabel: "กรอบเขย่า",
  // 📝 คอลัมน์ตัวน้อยเขย่าต่อช่วงจำนวน — ให้ตารางหน้าสินค้าหน้าตาเหมือนตารางบนเว็บ pricelists
  // (ผู้ใช้สั่ง 25 ส.ค. 69) · ราคาต่อตัวของแต่ละแถวอ่านจากเว็บตรง ๆ — บอกทางเฉย ๆ ตัวคิดเงินจริง
  // คือ extra/extraBelow ของกลุ่มตัวน้อยเขย่า (สคริปต์ assert ไว้แล้วว่าค่าชุดเดียวกัน)
  noteCol: {
    label: "ตัวน้อยเขย่า\nขนาด 2-2.5 ซม.",
    values: charmPrices.map((p) => `+ ตัวละ ${p} บาท`),
  },
};

console.log(`📊 ตารางจากเว็บ (${tiers.map((x) => x.label).join(" · ")})`);
console.log(`   กรอบเขย่า: ${framePrices.map((p) => `฿${p}`).join(" / ")}`);
console.log(`   ตัวน้อยเขย่า: 1-${BULK_FROM - 1} ${UNIT} ตัวละ ฿${CHARM_RETAIL} · ${BULK_FROM}+ ${UNIT} ตัวละ ฿${CHARM_BULK}`);
console.log(`   เพิ่มขนาดกรอบ (เริ่ม ${BASE_CM} ซม.): ซม.ละ ฿${OVERSIZE_BAHT}`);

/* ── 2. รูปภาพ ──────────────────────────────────────────────────── */
type ImgSrc =
  | { kind: "drive"; path: string }
  | { kind: "wix"; id: string }
  | { kind: "wixCrop"; id: string; box: { left: number; top: number; width: number; height: number } };

async function fetchWix(wixId: string): Promise<Buffer> {
  // โหลดไฟล์ต้นฉบับเต็ม (ไม่ผ่าน /v1/fill ที่ย่อรูป) — ค่อยย่อเองตอน render
  const res = await fetch(`https://static.wixstatic.com/media/${wixId}`);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function render(src: ImgSrc): Promise<Buffer> {
  if (src.kind === "drive")
    return sharp(src.path).rotate().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  const buf = await fetchWix(src.id);
  let img = sharp(buf).rotate();
  if (src.kind === "wixCrop") {
    const meta = await sharp(buf).rotate().metadata();
    const b = src.box; // สัดส่วน 0-1 ของภาพเต็ม
    img = img.extract({
      left: Math.round(b.left * meta.width!),
      top: Math.round(b.top * meta.height!),
      width: Math.round(b.width * meta.width!),
      height: Math.round(b.height * meta.height!),
    });
  }
  return img.resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
}

async function put(name: string, src: ImgSrc): Promise<string> {
  const file = `${name}-${V}.jpg`;
  const buf = await render(src);
  writeFileSync(`${OUT}${file}`, buf); // เก็บตัวอย่างไว้ดูก่อนเขียนจริงเสมอ
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

const art: Record<string, string> = {};
// ช็อตรวม 7 แบบ (ไดรฟ์ร้าน) = ภาพหลัก · รูปงานจริงจากหน้า pricelists (wixstatic)
art["photo-group"] = await put("photo-group", { kind: "drive", path: `${DRIVE}/DSC06765.jpg` });
art["photo-round"] = await put("photo-round", { kind: "wix", id: "959b83_bcabbdf52ed34d6d8eed2505556d500f~mv2.jpg" });
art["photo-set"] = await put("photo-set", { kind: "wix", id: "959b83_7af1e5fa344444aa937404ed2903ffb4~mv2.jpg" });
art["photo-frames"] = await put("photo-frames", { kind: "wix", id: "959b83_885e1b36ae7f416f98e26443d2471d26~mv2.jpg" });
art["photo-moon"] = await put("photo-moon", { kind: "drive", path: `${DRIVE}/DSC06790.jpg` });
// ภาพตัวเลือก "ตัวน้อยเขย่า" — ครอปโซนตัวน้อย 7 ตัวจาก photo-set (สัดส่วนจากภาพเรนเดอร์ 900×675)
art["opt-charms"] = await put("opt-charms", {
  kind: "wixCrop",
  id: "959b83_7af1e5fa344444aa937404ed2903ffb4~mv2.jpg",
  box: { left: 380 / 900, top: 270 / 675, width: (820 - 380) / 900, height: (620 - 270) / 675 },
});
console.log(`🖼  อัปรูป ${Object.keys(art).length} ไฟล์ — ตัวอย่างอยู่ที่ ${OUT}`);

/* ── 2.5 ตะขอ/ห่วง — ดึงชุดกลุ่มจากสินค้าพวงกุญแจหลัก (ดูหมายเหตุหัวไฟล์) ── */
const { data: keyringRow, error: krErr } = await sb.from("products").select("data").eq("id", KEYRING_ID).single();
if (krErr) throw new Error(`อ่านสินค้าพวงกุญแจ ${KEYRING_ID} ไม่ได้: ${krErr.message}`);
const keyringOpts = (keyringRow.data as Product).options ?? [];

const gateSrc = keyringOpts.find((o) => o.label === HOOK_GATE);
const hookSrc = keyringOpts.find((o) => o.label === HOOK_GROUP);
if (!gateSrc || !hookSrc) throw new Error(`พวงกุญแจไม่มีกลุ่ม "${HOOK_GATE}"/"${HOOK_GROUP}" — โครงสินค้าต้นทางเปลี่ยน ตรวจก่อน`);
if (!hookSrc.presetId) throw new Error(`กลุ่ม "${HOOK_GROUP}" ของพวงกุญแจไม่ได้ลิงก์คลังกลางแล้ว — ตรวจก่อน`);
for (const f of HOOK_FREE)
  if (!hookSrc.choices.some((c) => c.name === f))
    throw new Error(`ไม่พบตัวเลือก "${f}" ในกลุ่มตะขอ — ชื่อในคลังกลางเปลี่ยน ต้องอัปเดต HOOK_FREE`);
// กลุ่มสีตะขอ = ทุกกลุ่มที่โชว์ตามค่าที่เลือกในกลุ่ม "ตะขอ" (ลิงก์คลัง hook-color-* เกือบทั้งหมด)
const hookColorSrc = keyringOpts.filter((o) => o.showWhen?.label === HOOK_GROUP);

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const GATE_ON = gateSrc.choices[0]?.name ?? "รับตะขอ";
const hookOptions: ProductOption[] = [
  {
    ...clone(gateSrc),
    note: `ตะขอ/ห่วงมีให้เลือกกว่า 30 แบบตามแผ่นอะไหล่ของร้าน — **ห่วง Z1 / โซ่ Z2 (สีเงิน) แถมฟรี** แบบอื่นคิดเพิ่มตามชนิด (ดูรูปอะไหล่ทั้งหมดในแท็บ "ตะขอ / ห่วง" ท้ายหน้า)`,
  },
  {
    ...clone(hookSrc),
    showWhen: { label: HOOK_GATE, choices: [GATE_ON] },
    // พวงกุญแจผูกเงื่อนไขพวกนี้กับ "ความหนาอะคริลิค = 3mm" — สินค้านี้ไม่มีกลุ่มนั้น จึงให้มีผลตลอด
    // (freeWhen ต้องมีเงื่อนไข when เสมอ → ผูกกับประตู "รับตะขอ" ซึ่งจริงเสมอเมื่อกลุ่มนี้โชว์)
    smallQtyFee: { fee: HOOK_RETAIL_FEE, upToQty: 10, freeChoices: [...HOOK_FREE] },
    freeWhen: { choices: [...HOOK_FREE], when: { label: HOOK_GATE, choices: [GATE_ON] } },
  },
  ...hookColorSrc.map(clone),
];
console.log(
  `🪝 ตะขอจากพวงกุญแจ: ${hookSrc.choices.length} แบบ (คลัง ${hookSrc.presetId}) + กลุ่มสีตะขอ ${hookColorSrc.length} กลุ่ม · Z1/Z2 ฟรี · ปลีกเหมา ${HOOK_RETAIL_FEE} บาท/${UNIT}`
);

// รูปแผ่นอะไหล่ + ชาร์ตสีตะขอ — ก็อปจากโฟลเดอร์ keyring-clear-stopper มาเก็บใต้สินค้านี้ (คีย์ v1)
const hookImg: Record<string, string> = {};
for (const name of HOOK_CHARTS) {
  const dl = await sb.storage.from("product-images").download(`${HOOK_CHART_SRC}/${name}-v3.jpg`);
  if (dl.error) throw new Error(`โหลดรูปอะไหล่ ${name}-v3.jpg: ${dl.error.message}`);
  const buf = Buffer.from(await dl.data.arrayBuffer());
  const file = `${name}-${V}.jpg`;
  writeFileSync(`${OUT}${file}`, buf);
  if (WRITE) {
    const up = await sb.storage
      .from("product-images")
      .upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
    if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  }
  hookImg[name] = url(file);
}
console.log(`🖼  รูปอะไหล่ตะขอ ${Object.keys(hookImg).length} ไฟล์ (ก็อปจาก ${HOOK_CHART_SRC})`);

/* ── 3. ประกอบสินค้า ─────────────────────────────────────────────── */
const OPTIONS: ProductOption[] = [
  {
    label: GROUP_CHARM,
    display: "multi",
    // เรทตัวน้อยตามช่วงจำนวนชุด: กลุ่มคิด extra ปกติ (15) ตั้งแต่ BULK_FROM ชุด · ต่ำกว่านั้นใช้ extraBelow (20)
    extraFromQty: BULK_FROM,
    note:
      `ตัวน้อยเขย่าขนาด 2-2.5 ซม. หนา 1-1.5 มม. ลอยเขย่าได้ในกรอบ — ระบุจำนวนตัวต่อ 1 ${UNIT} · ` +
      `**สั่ง 1-${BULK_FROM - 1} ${UNIT} ตัวละ ${CHARM_RETAIL} บาท · ${BULK_FROM} ${UNIT}ขึ้นไป ตัวละ ${CHARM_BULK} บาท** (ระบบคิดให้อัตโนมัติตามจำนวนที่สั่ง)`,
    choices: [
      {
        name: CHARM_CHOICE,
        extra: CHARM_BULK,
        extraBelow: CHARM_RETAIL,
        qty: true,
        qtyUnit: "ตัว",
        qtyMax: 30,
        popular: true,
        imageSrc: art["opt-charms"],
      },
    ],
  },
  {
    label: GROUP_SIZE,
    display: "multi",
    note:
      `กรอบเขย่าเริ่มต้นที่ขนาด **${BASE_CM} ซม.** (นับด้านที่ยาวที่สุด ไดคัทตามทรงลายได้) — ` +
      `ต้องการกรอบใหญ่ขึ้น ติ๊กแล้วระบุจำนวน ซม. ที่เพิ่มจาก ${BASE_CM} ซม. (ซม.ละ ${OVERSIZE_BAHT} บาท) เช่น กรอบ 8 ซม. = เพิ่ม 2 ซม.`,
    choices: [
      {
        name: SIZE_CHOICE,
        extra: OVERSIZE_BAHT,
        qty: true,
        qtyUnit: "ซม.",
        qtyMax: 24,
        imageSrc: art["photo-frames"],
      },
    ],
  },
  ...hookOptions,
];

const gallery: Product["images"] = [
  { emoji: "🎐", gradient: "from-sky-200 to-cyan-300", label: "งานจริง — พวงกุญแจเขย่าหลากทรง ไดคัทตามลาย", src: art["photo-group"] },
  { emoji: "🎐", gradient: "from-sky-200 to-cyan-300", label: "กรอบเขย่าอะคริลิคใส + ตัวน้อยลอยเขย่าได้", src: art["photo-round"] },
  { emoji: "🎐", gradient: "from-sky-200 to-cyan-300", label: "กรอบเขย่า พร้อมตัวน้อยเขย่าในกรอบ", src: art["photo-set"] },
  { emoji: "🎐", gradient: "from-sky-200 to-cyan-300", label: "กรอบไดคัทตามทรงลาย — เพิ่มขนาดกรอบได้", src: art["photo-frames"] },
  { emoji: "🎐", gradient: "from-sky-200 to-cyan-300", label: "ตัวอย่างงานจริง ห้อยชาร์มเสริมได้", src: art["photo-moon"] },
];

const product: Product = {
  id: ID,
  name: NAME,
  category: CATEGORY,
  price: framePrices[0],
  emoji: "🎐",
  gradient: "from-sky-200 to-cyan-300",
  imageSrc: gallery[0].src,
  rating: 5,
  sold: 0,
  description:
    `พวงกุญแจเขย่า Shake Shake Acrylic กรอบอะคริลิคใสประกบหน้า-หลัง สกรีนลาย 2 ชิ้น ` +
    `ข้างในใส่ตัวน้อยเขย่าขนาด 2-2.5 ซม. ลอยเขย่าได้ พิมพ์ลายตามสั่งด้วยระบบ UV ` +
    `กรอบเริ่มต้นขนาด ${BASE_CM} ซม. ไดคัทตามทรงลายได้ ไม่มีขั้นต่ำในการสั่งผลิต เริ่ม${UNIT}ละ ${framePrices[0]} บาท`,
  highlights: [
    `ไม่มีขั้นต่ำ · กรอบเขย่าเริ่ม${UNIT}ละ ${framePrices[0]} บาท (สั่งเยอะลดถึง ${framePrices[framePrices.length - 1]} บาท)`,
    `ตัวน้อยเขย่า ตัวละ ${CHARM_RETAIL} บาท (สั่ง ${BULK_FROM} ${UNIT}ขึ้นไป ตัวละ ${CHARM_BULK} บาท) — ใส่กี่ตัวก็ได้`,
    `กรอบใสประกบหน้า-หลัง สกรีน 2 ชิ้น เริ่ม ${BASE_CM} ซม. เพิ่มขนาดได้ ซม.ละ ${OVERSIZE_BAHT} บาท`,
  ],
  options: OPTIONS,
  images: gallery,
  pricing: PRICING,
  priceRates: [
    {
      id: "r1",
      label: NAME,
      desc: `กรอบเขย่าอะคริลิคใส ประกบหน้า-หลัง สกรีน 2 ชิ้น · เริ่มต้นขนาด ${BASE_CM} ซม.`,
      pricing: PRICING,
      minPerDesign: 5, // 11 ชุดขึ้นไป คละลายละ 5 ชุดขึ้นไป
      freeMixBelowQty: BULK_FROM, // 1-10 ชุด คละลายอิสระ
    },
  ],
  terms: [
    `*ไม่มีขั้นต่ำในการสั่งผลิต — ราคาต่อ${UNIT} (1 ${UNIT} = กรอบเขย่า 1 ชิ้น · ตัวน้อยเขย่าเลือกเพิ่มได้ตามต้องการ)`,
    `*จำนวน 1-${BULK_FROM - 1} ${UNIT} คละลายได้อิสระ · ${BULK_FROM} ${UNIT}ขึ้นไป คละลายละ 5 ${UNIT}ขึ้นไป`,
    `*กรอบเขย่าประกบหน้า-หลัง สกรีน 2 ชิ้น — เริ่มต้นที่ขนาด ${BASE_CM} ซม. เพิ่มขนาดบวกเพิ่ม ซม.ละ ${OVERSIZE_BAHT} บาท`,
    "*โครงสร้างกรอบ 3 ชั้นประกบกัน: กรอบหน้า · ตัวกลาง หนา 1 มม. (ช่องให้ตัวน้อยขยับ) · กรอบหลัง หนา 1.5 มม. — ตัวน้อยเขย่าหนา 1-1.5 มม.",
    `*ตัวน้อยเขย่า ขนาด 2-2.5 ซม. — สั่ง 1-${BULK_FROM - 1} ${UNIT} ตัวละ ${CHARM_RETAIL} บาท · ${BULK_FROM} ${UNIT}ขึ้นไป ตัวละ ${CHARM_BULK} บาท`,
    "*ทำเฉพาะอะคริลิคใส เท่านั้น",
    `*ตะขอ/ห่วงเลือกได้กว่า 30 แบบตามแผ่นอะไหล่ของร้าน — ห่วง Z1 / โซ่ Z2 (สีเงิน) แถมฟรี · แบบอื่นช่วง 1-${BULK_FROM - 1} ${UNIT} คิดเหมา ${HOOK_RETAIL_FEE} บาท/${UNIT} · ${BULK_FROM} ${UNIT}ขึ้นไปคิดตามราคาอะไหล่จริง (2-15 บาท)`,
    "*ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดความยาวแนวทแยง)",
    "*ทางร้านใช้สี R G B สีงานสกรีนที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
  ].join("\n"),
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: [
        "• ไม่มีขั้นต่ำในการสั่งผลิต — พิมพ์ลายตามสั่งด้วยระบบ UV",
        `• กรอบเขย่าประกบหน้า-หลัง สกรีน 2 ชิ้น ข้างในโปร่งให้ตัวน้อยลอยเขย่าได้`,
        "",
        "โครงสร้างกรอบเขย่า (3 ชั้นประกบกัน)::",
        ...STRUCTURE_LINES.map((l) => `• ${l}`),
        "",
        `• กรอบเริ่มต้นที่ขนาด ${BASE_CM} ซม. (นับด้านที่ยาวที่สุด) — เพิ่มขนาดบวกเพิ่ม ซม.ละ ${OVERSIZE_BAHT} บาท · ไดคัทตามทรงลายได้`,
        `• ตัวน้อยเขย่า ขนาด 2-2.5 ซม. — สั่ง 1-${BULK_FROM - 1} ${UNIT} ตัวละ ${CHARM_RETAIL} บาท · ${BULK_FROM} ${UNIT}ขึ้นไป ตัวละ ${CHARM_BULK} บาท`,
        "• ทำเฉพาะอะคริลิคใส เท่านั้น",
        "• ตะขอ/ห่วงเลือกได้กว่า 30 แบบตามแผ่นอะไหล่ของร้าน — ห่วง Z1 / โซ่ Z2 แถมฟรี (ดูแท็บ ตะขอ / ห่วง)",
        `• จำนวน 1-${BULK_FROM - 1} ${UNIT} คละลายได้อิสระ · ${BULK_FROM} ${UNIT}ขึ้นไป คละลายละ 5 ${UNIT}ขึ้นไป`,
        "• งานสกรีนอะคริลิค โดยปกติทางร้านจะสกรีนใต้ หากต้องการสกรีนบนต้องแจ้งล่วงหน้า",
      ].join("\n"),
    },
    {
      title: "ตะขอ / ห่วง",
      text: [
        "เลือกตะขอได้จากแผ่นอะไหล่ของร้าน::",
        "• ห่วง Z1 (ห่วงกลมเงิน) และ Z2 (โซ่ไข่ปลาเงิน) แถมฟรี",
        `• ตะขอ/ห่วงแบบอื่น ช่วง 1-${BULK_FROM - 1} ${UNIT} คิดเหมา ${HOOK_RETAIL_FEE} บาท/${UNIT} · สั่ง ${BULK_FROM} ${UNIT}ขึ้นไปคิดตามราคาอะไหล่จริง (ประมาณ 2-15 บาท/ชิ้น) — ระบบบวกให้อัตโนมัติเมื่อเลือก`,
        "• ตะขอบางแบบเลือกสีได้ (ดูชาร์ตสีด้านล่าง) — เลือกได้ในหน้าสินค้าเมื่อเลือกตะขอแบบนั้น",
        "• ตะขอ BB/BC เป็นสีสุ่ม เลือกสีไม่ได้",
        "",
        "ดูรูปอะไหล่ทั้งหมด::",
        "• ภาพแรกคือแผ่นอะไหล่รวมของร้าน มีรหัสกำกับทุกตัว (Z1, Z2, A-V, AA-BC)",
        "• ภาพถัดไปคือชาร์ตสีของตะขอที่มีหลายสี (G · H · I · S · T · U)",
      ].join("\n"),
      images: HOOK_CHARTS.map((n) => hookImg[n]),
      imageSize: "md" as const,
    },
    {
      title: "วิธีสั่งงาน",
      text:
        'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกจำนวนตัวน้อยเขย่า ขนาดกรอบ และจำนวน' +
        UNIT +
        ' แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"\n• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ทรงกรอบที่ต้องการ · ลายตัวน้อยแต่ละตัว · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\nหรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: จำนวน' +
        UNIT +
        " · จำนวนตัวน้อยต่อชุด · ขนาดกรอบ · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน (.AI .PSD .PNG พื้นหลังใส) หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
    },
    {
      title: "การรับประกันสินค้า",
      text: "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• งานผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเสียหายระหว่างการขนส่ง\n\nไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\nระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    },
  ],
  seo: {
    title: `พวงกุญแจเขย่า Shake Shake Acrylic สั่งทำตามลาย เริ่ม${UNIT}ละ ${framePrices[0]} บาท ไม่มีขั้นต่ำ`,
    keywords: [
      "พวงกุญแจเขย่า",
      "Shake Shake Acrylic",
      "พวงกุญแจ shake shake",
      "shaker keychain",
      "พวงกุญแจอะคริลิค",
      "พวงกุญแจอะคริลิคสั่งทำ",
      "รับทำพวงกุญแจเขย่า",
      "อะคริลิคสั่งทำ",
      "iDucky",
    ],
    description: `รับทำพวงกุญแจเขย่า Shake Shake Acrylic กรอบอะคริลิคใสประกบ 2 ชิ้น ใส่ตัวน้อยเขย่าได้ พิมพ์ UV ลายตามสั่ง ไดคัทตามทรงลาย ไม่มีขั้นต่ำ เริ่ม${UNIT}ละ ${framePrices[0]} บาท ตัวน้อยตัวละ ${CHARM_RETAIL} บาท`,
    faqs: [
      {
        q: "พวงกุญแจเขย่า Shake Shake Acrylic ราคาเท่าไหร่?",
        a: `กรอบเขย่าเริ่มต้น${UNIT}ละ ${framePrices[0]} บาท (สั่ง ${BULK_FROM} ${UNIT}ขึ้นไปเริ่ม ${framePrices[1]} บาท ลดหลั่นถึง ${framePrices[framePrices.length - 1]} บาทเมื่อสั่ง 100 ${UNIT}ขึ้นไป) บวกตัวน้อยเขย่าตัวละ ${CHARM_RETAIL} บาท (${BULK_FROM} ${UNIT}ขึ้นไปตัวละ ${CHARM_BULK} บาท) ไม่มีขั้นต่ำในการสั่งผลิต`,
      },
      {
        q: "ตัวน้อยเขย่าคืออะไร ใส่ได้กี่ตัว?",
        a: `ตัวน้อยเขย่าคือชิ้นอะคริลิคเล็กขนาด 2-2.5 ซม. ที่ลอยอยู่ในกรอบ เขย่าแล้วขยับได้ ใส่กี่ตัวก็ได้ตามลายที่ออกแบบ (ระบุจำนวนได้ตอนสั่ง) คิดตัวละ ${CHARM_RETAIL} บาท หรือตัวละ ${CHARM_BULK} บาทเมื่อสั่ง ${BULK_FROM} ${UNIT}ขึ้นไป`,
      },
      {
        q: "กรอบเขย่าขนาดเท่าไหร่ ทำทรงอื่นได้ไหม?",
        a: `กรอบเขย่าเริ่มต้นที่ขนาด ${BASE_CM} ซม. (นับด้านที่ยาวที่สุด) ไดคัทตามทรงลายได้ เช่น ทรงกลม นาฬิกา ขวดโหล รถ — ต้องการกรอบใหญ่ขึ้นบวกเพิ่ม ซม.ละ ${OVERSIZE_BAHT} บาท เลือกได้ในหน้าสินค้า`,
      },
      {
        q: "สั่งหลายลายคละกันได้ไหม?",
        a: `สั่ง 1-${BULK_FROM - 1} ${UNIT} คละลายได้อิสระ · สั่ง ${BULK_FROM} ${UNIT}ขึ้นไป คละลายละ 5 ${UNIT}ขึ้นไป`,
      },
      {
        q: "เลือกตะขอ/ห่วงได้ไหม?",
        a: `ได้ — เลือกได้กว่า 30 แบบตามแผ่นอะไหล่ของร้าน (ห่วงกลม โซ่ไข่ปลา ตะขอสปริง ตะขอรูปหัวใจ/ดาว/แมว ฯลฯ) ห่วง Z1 และโซ่ Z2 สีเงินแถมฟรี แบบอื่นช่วง 1-${BULK_FROM - 1} ${UNIT}คิดเหมา ${HOOK_RETAIL_FEE} บาทต่อ${UNIT} สั่ง ${BULK_FROM} ${UNIT}ขึ้นไปคิดตามราคาอะไหล่จริง ตะขอหลายแบบเลือกสีได้ ดูรูปอะไหล่ทั้งหมดในแท็บ "ตะขอ / ห่วง" บนหน้าสินค้า`,
      },
      {
        q: "ใช้วัสดุอะไร พิมพ์ระบบไหน?",
        a: "กรอบเขย่าทำจากอะคริลิคใสเท่านั้น โครงสร้าง 3 ชั้นประกบกัน — กรอบหน้าสกรีนลาย ตัวกลางหนา 1 มม. เว้นช่องให้ตัวน้อยขยับ และกรอบหลังหนา 1.5 มม. ส่วนตัวน้อยเขย่าหนา 1-1.5 มม. พิมพ์ลายด้วยระบบ UV สีสดติดทน ส่งไฟล์งานนามสกุล .Ai .Psd .Png หรือพื้นหลังใส",
      },
    ],
  },
  hidden: true, // ฉบับร่าง — กดเผยแพร่เองที่ /admin/products
};

const range = priceRange(product);
const saved: Product = {
  ...product,
  priceMin: range.min,
  priceMax: range.max,
  hasQuote: hasQuoteOption(product),
  savedAt: new Date().toISOString(),
};

console.log(`\n📦 ${saved.name} (${ID}) · หมวด ${saved.category}`);
console.log(`   ราคา ฿${range.min}-${range.max}/${UNIT} (เริ่มต้น ฿${saved.price})`);
console.log(`   ตัวเลือก: ${OPTIONS.map((o) => `${o.label} (${o.display})`).join(" · ")}`);
console.log(`   แกลเลอรี ${gallery.length} ภาพ · แท็บ ${saved.tabs!.length} · FAQ ${saved.seo!.faqs!.length} ข้อ · สถานะ: ฉบับร่าง`);
console.log(`   ตัวอย่างราคา: 1 ${UNIT} + ตัวน้อย 5 ตัว = ${framePrices[0]} + ${5 * CHARM_RETAIL} = ฿${framePrices[0] + 5 * CHARM_RETAIL}`);
console.log(`   ตัวอย่างราคา: ${BULK_FROM} ${UNIT} ตัวน้อย 5 ตัว/ชุด = (${framePrices[1]} + ${5 * CHARM_BULK}) × ${BULK_FROM} = ฿${(framePrices[1] + 5 * CHARM_BULK) * BULK_FROM}`);

if (!WRITE) {
  console.log(`\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — เปิดดูรูปที่ ${OUT} แล้วใส่ --write เพื่อบันทึกจริง)`);
  process.exit(0);
}

/* ── 4. เขียนลง Supabase (คอลัมน์กระจก name/category/price ต้องไปด้วย) ── */
const { data: existing, error: exErr } = await sb.from("products").select("id,name").eq("id", ID).maybeSingle();
if (exErr) throw new Error(`เช็คสินค้าเดิมไม่ได้: ${exErr.message}`);
if (existing && existing.name !== OLD_NAME && existing.name !== NAME)
  throw new Error(`id ${ID} เป็นของ "${existing.name}" ไม่ใช่ร่างพวงกุญแจเขย่า — ตรวจก่อน`);
if (!existing) throw new Error(`ไม่พบร่างเดิม id ${ID} — คาดว่ามีอยู่แล้ว ตรวจก่อน`);

const { error } = await sb
  .from("products")
  .update({ name: saved.name, category: saved.category, price: saved.price, data: saved })
  .eq("id", ID);
if (error) throw new Error(`อัปเดตไม่สำเร็จ: ${error.message}`);

/** update คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบก่อนประกาศสำเร็จ */
const { data: check, error: readErr } = await sb.from("products").select("name,category,data").eq("id", ID).single();
if (readErr) throw new Error(`อ่านกลับไม่ได้: ${readErr.message}`);
if (check.name !== NAME || check.category !== CATEGORY || (check.data as Product).savedAt !== saved.savedAt)
  throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");

console.log(`\n✅ อัปรูป + บันทึกแล้ว — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
console.log(`   หน้าสินค้า: http://localhost:3005/products/${ID}`);
console.log(`   หน้าแก้ไข: http://localhost:3005/admin/products/${ID}`);
