#!/usr/bin/env node
/**
 * ภาพสีอะคริลิค "ชุดกลาง" ของทั้งระบบ — ครอปจากชาร์ตทางการของร้าน
 * ต้นฉบับ: ~/Desktop/AdminBuddy/academy-assets/acrylic/colors.jpg (1522×1600)
 *
 *   node scripts/acrylic-colors.mjs                 # ครอปไว้ดูก่อน (ไม่แตะคลัง/ฐานข้อมูล)
 *   node scripts/acrylic-colors.mjs --upload        # อัปขึ้น Supabase Storage products/acrylic-colors/
 *   node scripts/acrylic-colors.mjs --write         # ใส่ imageSrc ให้ทุกสินค้า + คลังตัวเลือกกลาง
 *
 * ⚠️ กลุ่ม "เคลือบ" ของงานกระดาษมีชื่อซ้ำกับสีอะคริลิค (hologram-รุ้ง / hologram-ดาว …)
 *    แต่เป็นฟิล์มเคลือบคนละอย่าง — จึงแตะเฉพาะกลุ่มที่มีชื่อขึ้นต้น "อะคริลิค" อย่างน้อย 3 ตัว
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ขึ้นรุ่นใหม่ให้ขยับ REV
 */
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const UPLOAD = process.argv.includes("--upload");
const WRITE = process.argv.includes("--write");
/**
 * ต้นฉบับชาร์ต — ไล่จากคมสุดลงมา
 * ตัวบนสุดอยู่ในไดรฟ์ร้าน 5710×6000 (คมกว่าตัวใน academy-assets 3.75 เท่า)
 * ถ้าไดรฟ์ไม่ได้ต่อ ค่อยตกไปใช้ตัวเล็ก — ภาพจะเบลอกว่า
 */
const CHARTS = [
  "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/10_อะคริลิค/พวงกุญแจแผ่นอะคริลิค/P-สีอะคริลิค-01.jpg",
  `${process.env.HOME}/Desktop/AdminBuddy/academy-assets/acrylic/colors.jpg`,
];
const CHART =
  (process.argv.find((a) => a.startsWith("--chart=")) || "").split("=")[1] || CHARTS.find((f) => existsSync(f));
const OUT = ".cache/acrylic-colors";
const REV = "v2";
/** พิกัดช่องสีด้านล่างอ้างชาร์ตขนาดนี้ — ไฟล์จริงใหญ่กว่าก็คูณสเกลให้เอง */
const REF_W = 1522;
const REF_H = 1600;
/** ด้านกว้างของภาพที่ได้ (ช่องบนชาร์ตคมสุดราว 490-650 px จึงไม่ต้องดันเกินนี้) */
const SIZE = 640;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const IMG = (key) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/acrylic-colors/${key}-${REV}.jpg`;

// ── ตำแหน่งช่องสีบนชาร์ต (พิกัดจริงของ colors.jpg) ────────────────────────
/** แผงซ้าย 4 คอลัมน์ */
const LC = [
  [114, 244],
  [268, 396],
  [421, 551],
  [574, 704],
];
/** แผงซ้ายชุดบน (ฝั่งด้าน–ฝั่งเงา) 3 แถว · ชุดล่าง (เงา 2 ด้าน) 5 แถว */
const LR1 = [
  [350, 468],
  [492, 610],
  [632, 748],
];
const LR2 = [
  [838, 952],
  [970, 1082],
  [1102, 1213],
  [1232, 1345],
  [1363, 1475],
];
/** แผงขวา 3 คอลัมน์ · 4 แถว */
const RC = [
  [837, 1010],
  [1033, 1206],
  [1230, 1403],
];
const RR = [
  [355, 505],
  [645, 798],
  [910, 1063],
  [1105, 1258],
  [1300, 1453],
];

const cell = (cols, rows, c, r) => [cols[c][0], rows[r][0], cols[c][1], rows[r][1]];

/** ชื่อตัวเลือกในระบบ → [ไฟล์, กรอบครอป] */
/** URL ภาพสีอะคริลิคชุดกลาง — สคริปต์สินค้าตัวอื่น import ไปใช้ได้ */
export const acrylicColorImage = (name) => (COLORS[name] ? IMG(COLORS[name][0]) : undefined);

export const COLORS = {
  // แผงซ้ายชุดบน — ฝั่งหนึ่งผิวด้าน ฝั่งหนึ่งผิวเงา (ยกเว้น C-02 เงา 2 ด้าน · ไม่บวกเพิ่ม)
  "อะคริลิคใสขุ่น C-01": ["c01", cell(LC, LR1, 0, 0)],
  // C-02 มีป้าย "ไม่บวกเพิ่ม" ยื่นออกมานอกช่อง — กันกรอบให้กว้างกว่าช่องอื่น
  "อะคริลิคขาวขุ่น C-02": ["c02", [252, 334, 402, 470]],
  "อะคริลิคสีขาว (W)": ["w", cell(LC, LR1, 2, 0)],
  "อะคริลิคสีฟ้า (B)": ["b", cell(LC, LR1, 3, 0)],
  "อะคริลิคสีชมพู (P)": ["p", cell(LC, LR1, 0, 1)],
  "อะคริลิคสีเหลือง (Y)": ["y", cell(LC, LR1, 1, 1)],
  "อะคริลิคสีส้ม (OR)": ["or", cell(LC, LR1, 2, 1)],
  "อะคริลิคสีส้มอ่อน (OR-02)": ["or02", cell(LC, LR1, 3, 1)],
  "อะคริลิคสีเขียว (GR)": ["gr", cell(LC, LR1, 0, 2)],
  "อะคริลิคสีแดง (R)": ["r", cell(LC, LR1, 1, 2)],
  "อะคริลิคสีเทา (G)": ["g", cell(LC, LR1, 2, 2)],
  "อะคริลิคสีดำ (BK)": ["bk", cell(LC, LR1, 3, 2)],
  // แผงซ้ายชุดล่าง — ผิวเงาทั้ง 2 ด้าน (สกรีนบนอะคริลิค)
  "อะคริลิคสีครีม": ["cream", cell(LC, LR2, 0, 0)],
  "อะคริลิคสีเลมอน (603)": ["603", cell(LC, LR2, 1, 0)],
  "อะคริลิคสีไข่แดง (605)": ["605", cell(LC, LR2, 2, 0)],
  "อะคริลิคสีส้มแดง (606)": ["606", cell(LC, LR2, 3, 0)],
  "อะคริลิคสีน้ำตาล (611)": ["611", cell(LC, LR2, 0, 1)],
  "อะคริลิคสีทอง (626)": ["626", cell(LC, LR2, 1, 1)],
  "อะคริลิคสีมัสตาร์ด (235)": ["235", cell(LC, LR2, 2, 1)],
  "อะคริลิคสีเหลืองเข้ม (206)": ["206", cell(LC, LR2, 3, 1)],
  "อะคริลิคสีเทามุก (621)": ["621", cell(LC, LR2, 0, 2)],
  "อะคริลิคสีท้องฟ้า (612)": ["612", cell(LC, LR2, 1, 2)],
  "อะคริลิคสีน้ำเงิน (619)": ["619", cell(LC, LR2, 2, 2)],
  "อะคริลิคสีกุหลาบแดง (601)": ["601", cell(LC, LR2, 3, 2)],
  "อะคริลิคสีหญ้าเขียว (610)": ["610", cell(LC, LR2, 0, 3)],
  "อะคริลิคสีแอปเปิ้ลเขียว (622)": ["622", cell(LC, LR2, 1, 3)],
  "อะคริลิคสีม่วง (137)": ["137", cell(LC, LR2, 2, 3)],
  "อะคริลิคสีกุหลาบชมพู": ["rosepink", cell(LC, LR2, 3, 3)],
  "อะคริลิคสีกากเพชรเงิน": ["g-silver", cell(LC, LR2, 0, 4)],
  "อะคริลิคสีกากเพชรโรสโกลด์": ["g-rosegold", cell(LC, LR2, 1, 4)],
  "อะคริลิคสีกากเพชรสีแดง": ["g-red", cell(LC, LR2, 2, 4)],
  "อะคริลิคสีกากเพชรสีม่วง": ["g-purple", cell(LC, LR2, 3, 4)],
  // แผงขวา — อะคริลิคพิเศษ
  "อะคริลิคกลิตเตอร์-เงิน": ["glitter-silver", cell(RC, RR, 0, 0)],
  "อะคริลิคกลิตเตอร์-ทอง": ["glitter-gold", cell(RC, RR, 1, 0)],
  "อะคริลิคกลิตเตอร์-รุ้ง": ["glitter-rainbow", cell(RC, RR, 2, 0)],
  "hologram-01": ["holo-01", cell(RC, RR, 0, 1)],
  "hologram-02": ["holo-02", cell(RC, RR, 1, 1)],
  "อะคริลิคกระจก": ["mirror", cell(RC, RR, 2, 1)],
  "hologram-รุ้ง": ["holo-rainbow", cell(RC, RR, 0, 2)],
  "hologram-จุด": ["holo-dot", cell(RC, RR, 1, 2)],
  "hologram-หิมะ": ["holo-snow", cell(RC, RR, 2, 2)],
  "hologram-ดาว": ["holo-star", cell(RC, RR, 0, 3)],
  "hologram-Stardust": ["holo-stardust", cell(RC, RR, 1, 3)],
  "hologram-Dust": ["holo-dust", cell(RC, RR, 2, 3)],
  "hologram-หัวใจ": ["holo-heart", cell(RC, RR, 0, 4)],
};

async function crop() {
  mkdirSync(OUT, { recursive: true });
  if (!CHART || !existsSync(CHART)) throw new Error(`ไม่เจอชาร์ตสี — ต่อไดรฟ์ร้านหรือส่ง --chart=<ไฟล์>`);
  const meta = await sharp(CHART, { limitInputPixels: false }).metadata();
  const sx = meta.width / REF_W;
  const sy = meta.height / REF_H;
  console.log(`🖼  ชาร์ต ${meta.width}×${meta.height} (สเกล ${sx.toFixed(2)}× จากพิกัดอ้างอิง) — ${CHART}`);
  for (const [key, box] of Object.values(COLORS)) {
    const [x1, y1, x2, y2] = box;
    await sharp(CHART, { limitInputPixels: false })
      .extract({
        left: Math.round(x1 * sx),
        top: Math.round(y1 * sy),
        width: Math.round((x2 - x1) * sx),
        height: Math.round((y2 - y1) * sy),
      })
      // ครอบทั้งช่อง (มีป้ายชื่อ/รหัสสีติดมาด้วย) แล้วเติมขอบขาวให้เป็นสี่เหลี่ยมจัตุรัส
      .resize(SIZE, SIZE, { fit: "contain", background: "#ffffff", kernel: "lanczos3" })
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toFile(`${OUT}/${key}.jpg`);
  }
  console.log(`🎨 ครอป ${Object.keys(COLORS).length} สี → ${OUT}`);
}

const sb = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function upload() {
  const c = sb();
  let kb = 0;
  for (const [key] of Object.values(COLORS)) {
    const buf = await readFile(`${OUT}/${key}.jpg`);
    const { error } = await c.storage
      .from("product-images")
      .upload(`products/acrylic-colors/${key}-${REV}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`${key}: ${error.message}`);
    kb += buf.length / 1024;
  }
  console.log(`⬆️  อัปโหลด ${Object.keys(COLORS).length} ภาพ (${Math.round(kb)} KB) → products/acrylic-colors/`);
}

/** กลุ่มนี้เป็น "สีอะคริลิค" จริงไหม — กันไปชนกลุ่มเคลือบของงานกระดาษที่ชื่อ hologram-* ซ้ำกัน */
const isAcrylicGroup = (choices) => choices.filter((c) => (c.name ?? "").startsWith("อะคริลิค")).length >= 3;

async function write() {
  const c = sb();
  const { data, error } = await c.from("products").select("id,data");
  if (error) throw new Error(error.message);
  const rows = [];
  for (const r of data ?? []) {
    const isPreset = r.data?.category === "__presets__" || String(r.id).startsWith("__preset_");
    const groups = isPreset ? [r.data] : r.data?.options ?? [];
    let hit = 0;
    for (const g of groups) {
      const choices = g?.choices ?? [];
      if (!isAcrylicGroup(choices)) continue;
      for (const ch of choices) {
        const m = COLORS[ch.name];
        if (!m) continue;
        const url = IMG(m[0]);
        if (ch.imageSrc === url) continue;
        ch.imageSrc = url;
        hit++;
      }
    }
    if (hit) rows.push({ id: r.id, label: r.data?.name ?? r.data?.label ?? r.id, hit, data: r.data });
  }
  console.log(`\nกลุ่มสีอะคริลิคที่จะใส่ภาพ — ${rows.length} รายการ`);
  for (const x of rows) console.log(`   ${String(x.id).padEnd(26)} ${String(x.hit).padStart(3)} สี   ${x.label}`);
  if (!WRITE) {
    console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
    return;
  }
  for (const x of rows) {
    const { error: e } = await c.from("products").update({ data: x.data }).eq("id", x.id);
    if (e) throw new Error(`${x.id}: ${e.message}`);
  }
  console.log(`\n✅ อัปเดตแล้ว ${rows.length} รายการ · รวม ${rows.reduce((s, x) => s + x.hit, 0)} ตัวเลือก`);
}

// รันตรง ๆ เท่านั้นถึงจะทำงาน — สคริปต์อื่น import COLORS/acrylicColorImage ไปใช้ได้โดยไม่โดนรัน
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  (async () => {
    await crop();
    if (UPLOAD) await upload();
    await write();
  })().catch((e) => {
    console.error("❌", e.message);
    process.exit(1);
  });
}
