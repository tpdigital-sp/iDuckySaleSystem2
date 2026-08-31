#!/usr/bin/env node
/**
 * Photo card pvc (photocard-pvc-uv) — บัตร "PVC สีใส" เลือกตำแหน่งสกรีนได้
 *
 *   node scripts/photocard-pvc-clear-screen-side.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/photocard-pvc-clear-screen-side.mjs --write
 *
 * ผู้ใช้สั่ง 31 ส.ค. 69 (2 รอบ):
 *   1. "PVC สีใส สามารถเลือกได้ว่าสกรีนบน หรือ สกรีนใต้ คล้ายๆ พวงกุญแจ"
 *   2. "แบบใส 2 ด้านก็เลือกได้ว่าจะหน้าใต้-หลังบน หรือจะ บน-บน"
 *
 * ทำเป็น "กลุ่มใหม่ 2 กลุ่ม" (1 ด้าน / 2 ด้าน) ที่โผล่ทีละกลุ่มตามที่ลูกค้าเลือก
 * ไม่ไปแก้ชื่อตัวเลือกในกลุ่ม "สกรีนกี่ด้าน"
 * ⚠️ เพราะ "สกรีนกี่ด้าน" เป็นแกนตารางราคา (pricing.driverLabels) — เปลี่ยนชื่อตัวเลือก
 *    = คีย์ใน pricing.cells ไม่ตรง ราคาหล่นกลับไป product.price เงียบ ๆ (ดู memory iducky-price-driver-trap)
 *    ต่างจากพวงกุญแจอะคริลิคที่ฝังฝั่งไว้ในชื่อ ("สกรีน 2 ด้าน (ใต้-บน)") ได้ เพราะที่นั่นเป็นแกนราคาอยู่แล้ว
 *
 * ทั้งสองกลุ่มโผล่เฉพาะบัตรใส (บัตรขาวทึบ มองลายผ่านเนื้อไม่ได้ ไม่มีฝั่งให้เลือก)
 *
 * ภาพประกอบการ์ด: วาดเองด้วย scripts/photocard-pvc-screen-art.py
 *   (ภาพจำลองเลเยอร์เหลื่อมกัน สไตล์เดียวกับแผ่น HOW TO PRINT ของพวงกุญแจอะคริลิค — ผู้ใช้สั่ง 31 ส.ค. 69)
 *   ไฟล์ต้นทางอยู่ใน repo ที่ scripts/assets/photocard-pvc/ · สคริปต์นี้อัปขึ้นคลังของสินค้าให้ตอน --write
 *   ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขยับ REV
 * ไม่คิดเงินเพิ่ม (ผู้ใช้ไม่ได้ระบุค่าเพิ่ม) · รันซ้ำได้ (idempotent)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "photocard-pvc-uv";
const EXPECT_NAME = "Photo card pvc";

const TYPE_LABEL = "ชนิดบัตร PVC";
const CLEAR = "PVC สีใส";
const SIDES_LABEL = "สกรีนกี่ด้าน";
const ONE_SIDE = "สกรีน 1 ด้าน";
const TWO_SIDE = "สกรีน 2 ด้าน";

/** ภาพประกอบการ์ด — ชื่อไฟล์ใน scripts/assets/photocard-pvc/ (ไม่มีสกุล) */
const REV = "v2"; // v1 = ภาพไดอะแกรมแท่งชั้น (เลิกใช้) · v2 = ภาพจำลองสไตล์พวงกุญแจ
const ART_DIR = fileURLToPath(new URL("./assets/photocard-pvc/", import.meta.url));
const ART = [
  "screen-under",
  "screen-top",
  "screen-under-top",
  "screen-top-top",
  "sides-1",
  "sides-2",
  "card-white",
  "card-clear",
];

/** ภาพจำลองชนิดบัตร (กลุ่มเดิมของสินค้า) — ผู้ใช้สั่งเปลี่ยนภาพ 31 ส.ค. 69
 *  ของเดิมเป็นรูปงานจริง pvc-uv-{white,clear}-01.jpg — ยังอยู่ในคลังและในแกลเลอรี ถอยกลับได้ทุกเมื่อ */
const TYPE_ART = { "PVC สีขาว": "card-white", [CLEAR]: "card-clear" };

/** ภาพจำลองหน้า/หลัง ของกลุ่ม "สกรีนกี่ด้าน" (กลุ่มเดิมของสินค้า — เติมแค่ภาพ ไม่แตะชื่อตัวเลือก) */
const SIDE_ART = { [ONE_SIDE]: "sides-1", [TWO_SIDE]: "sides-2" };

/** กลุ่มตำแหน่งสกรีน — โผล่ทีละกลุ่มตามจำนวนด้านที่เลือก (ชื่อกลุ่มต้องไม่ซ้ำกัน) */
const ONE_LABEL = "ตำแหน่งสกรีน (บัตรใส)";
const TWO_LABEL = "ตำแหน่งสกรีน 2 ด้าน (บัตรใส)";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

const urlOf = (name) =>
  `${pick("NEXT_PUBLIC_SUPABASE_URL")}/storage/v1/object/public/product-images/products/${ID}/${name}-${REV}.jpg`;
const art = Object.fromEntries(ART.map((n) => [n, urlOf(n)]));
const artBuf = Object.fromEntries(ART.map((n) => [n, readFileSync(`${ART_DIR}${n}.jpg`)]));

const { data: rows, error } = await sb.from("products").select("name,data").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า id=${ID}`);
if (row.name !== EXPECT_NAME) die(`ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);
const d = structuredClone(row.data);

/* ── ตรวจว่ากลุ่มต้นทางยังหน้าตาเดิม ─────────────────────────────────── */

const typeAt = (d.options ?? []).findIndex((o) => o.label === TYPE_LABEL);
if (typeAt < 0) die(`ไม่เจอกลุ่ม "${TYPE_LABEL}" — โครงตัวเลือกเปลี่ยน มาดูเองก่อน`);
if (!d.options[typeAt].choices.some((c) => c.name === CLEAR)) die(`กลุ่ม "${TYPE_LABEL}" ไม่มีตัวเลือก "${CLEAR}"`);

const sidesAt = d.options.findIndex((o) => o.label === SIDES_LABEL);
if (sidesAt < 0) die(`ไม่เจอกลุ่ม "${SIDES_LABEL}"`);
for (const n of [ONE_SIDE, TWO_SIDE])
  if (!d.options[sidesAt].choices.some((c) => c.name === n)) die(`กลุ่ม "${SIDES_LABEL}" ไม่มีตัวเลือก "${n}"`);

/* ── ภาพจำลองให้กลุ่มเดิม "ชนิดบัตร PVC" / "สกรีนกี่ด้าน" (เติมเฉพาะ imageSrc) ── */

for (const [name, file] of Object.entries(TYPE_ART)) {
  const c = d.options[typeAt].choices.find((x) => x.name === name);
  if (!c) die(`ไม่เจอตัวเลือก "${name}" ในกลุ่ม "${TYPE_LABEL}"`);
  c.imageSrc = art[file];
  console.log(`ภาพจำลองของ "${name}" → ${file}-${REV}.jpg`);
}

for (const [name, file] of Object.entries(SIDE_ART)) {
  const c = d.options[sidesAt].choices.find((x) => x.name === name);
  c.imageSrc = art[file];
  console.log(`ภาพจำลองของ "${name}" → ${file}-${REV}.jpg`);
}

/* ── กลุ่มใหม่ วางต่อจาก "สกรีนกี่ด้าน" ───────────────────────────────── */

const GROUPS = [
  {
    label: ONE_LABEL,
    display: "cards",
    showWhen: { label: TYPE_LABEL, choices: [CLEAR] },
    showWhenAlso: { label: SIDES_LABEL, choices: [ONE_SIDE] },
    note: `เฉพาะ**${CLEAR}** — เนื้อบัตรมองทะลุได้ เลยเลือกได้ว่าจะพิมพ์ลายไว้ฝั่งไหนของแผ่น`,
    choices: [
      {
        name: "สกรีนใต้",
        desc: "พิมพ์ใต้แผ่น มองลายผ่านเนื้อใส ผิวหน้าเรียบเงา ลายไม่ถลอก",
        imageSrc: art["screen-under"],
      },
      { name: "สกรีนบน", desc: "พิมพ์บนผิวหน้า ลายคมชัด สัมผัสเนื้อลายได้", imageSrc: art["screen-top"] },
    ],
  },
  {
    label: TWO_LABEL,
    display: "cards",
    showWhen: { label: TYPE_LABEL, choices: [CLEAR] },
    showWhenAlso: { label: SIDES_LABEL, choices: [TWO_SIDE] },
    note: `เฉพาะ**${CLEAR}** — พิมพ์สองหน้า เลือกได้ว่าลายด้านหน้าจะอยู่ใต้แผ่นหรือบนผิว`,
    choices: [
      {
        name: "หน้าใต้ - หลังบน",
        desc: "ด้านหน้าพิมพ์ใต้แผ่น มองลายผ่านเนื้อใส ผิวเรียบเงา · ด้านหลังพิมพ์บนผิว",
        imageSrc: art["screen-under-top"],
      },
      { name: "บน-บน", desc: "พิมพ์บนผิวทั้งสองหน้า ลายคมชัดทั้งคู่", imageSrc: art["screen-top-top"] },
    ],
  },
];

let at = sidesAt;
for (const g of GROUPS) {
  const had = d.options.findIndex((o) => o.label === g.label);
  if (had >= 0) {
    d.options[had] = g;
    at = had;
    console.log(`กลุ่ม "${g.label}" มีอยู่แล้ว — เขียนทับด้วยค่าล่าสุด (ลำดับที่ ${had + 1})`);
  } else {
    d.options.splice(++at, 0, g);
    console.log(`เพิ่มกลุ่ม "${g.label}"`);
  }
  console.log(`   แสดงเมื่อ ${TYPE_LABEL} = ${CLEAR} และ ${SIDES_LABEL} = ${g.showWhenAlso.choices[0]}`);
  console.log(`   ตัวเลือก: ${g.choices.map((c) => c.name).join(" · ")} (ไม่คิดเงินเพิ่ม · มีภาพประกอบครบ)`);
}
console.log(`   ลำดับกลุ่มตอนนี้: ${d.options.map((o) => o.label).join(" → ")}`);

/* ── เติมรายละเอียดในแท็บให้ตรงกัน (แทนบรรทัดเดิมทิ้ง = รันซ้ำไม่ซ้ำบรรทัด) ── */

const tabOf = (title) => (d.tabs ?? []).find((t) => t.title === title) ?? die(`ไม่เจอแท็บ "${title}"`);

/** แทนที่ทั้งบรรทัดที่ขึ้นต้นด้วย anchor · ไม่เจอ = หยุด (ข้อความในแท็บถูกแก้มือมาแล้ว) */
const replaceLine = (title, anchor, line) => {
  const tab = tabOf(title);
  const lines = tab.text.split("\n");
  const i = lines.findIndex((l) => l.startsWith(anchor));
  if (i < 0) die(`ไม่เจอบรรทัดที่ขึ้นต้นด้วย "${anchor}" ในแท็บ "${title}" — ข้อความเปลี่ยน มาดูเองก่อน`);
  if (lines[i] === line) return console.log(`แท็บ "${title}" ตรงอยู่แล้ว`);
  lines[i] = line;
  tab.text = lines.join("\n");
  console.log(`แท็บ "${title}" — อัปเดตบรรทัด "${anchor}…"`);
};

/** ลบบรรทัดเก่าของฟีเจอร์นี้ทิ้ง แล้วแทรกชุดใหม่ต่อจาก anchor */
const resetLines = (title, drop, anchor, add) => {
  const tab = tabOf(title);
  const lines = tab.text.split("\n").filter((l) => !drop.test(l));
  const i = lines.findIndex((l) => l.startsWith(anchor));
  if (i < 0) die(`ไม่เจอบรรทัดที่ขึ้นต้นด้วย "${anchor}" ในแท็บ "${title}" — ข้อความเปลี่ยน มาดูเองก่อน`);
  lines.splice(i + 1, 0, ...add);
  const next = lines.join("\n");
  if (next === tab.text) return console.log(`แท็บ "${title}" ตรงอยู่แล้ว`);
  tab.text = next;
  console.log(`แท็บ "${title}" — เขียนบรรทัดตำแหน่งสกรีนใหม่ (${add.length} บรรทัด)`);
};

replaceLine(
  "วิธีสั่งงาน",
  "• ระบุรายละเอียด: ชนิดบัตร (ขาว/ใส)",
  "• ระบุรายละเอียด: ชนิดบัตร (ขาว/ใส) · สกรีน 1 ด้าน/2 ด้าน · บัตรใสระบุตำแหน่งสกรีนด้วย " +
    "(1 ด้าน: สกรีนใต้/สกรีนบน · 2 ด้าน: หน้าใต้-หลังบน / บน-บน) · จำนวน · วันที่ใช้งาน (ถ้ามี)"
);
resetLines(
  "การเตรียมไฟล์",
  /^• บัตรใส(สกรีน \d+ ด้าน|เลือกตำแหน่ง)/,
  "• งานบัตรใส ลายที่เว้นพื้นหลังใส",
  [
    "• บัตรใสเลือกตำแหน่งสกรีนได้ — สกรีนใต้ มองลายผ่านเนื้อใส ผิวหน้าเรียบเงาลายไม่ถลอก · สกรีนบน ลายคมชัดอยู่บนผิว",
    "• บัตรใสสกรีน 2 ด้าน เลือกได้ว่าจะ หน้าใต้-หลังบน (ด้านหน้าอยู่ใต้แผ่น) หรือ บน-บน (พิมพ์บนผิวทั้งสองหน้า)",
  ]
);

if (!WRITE) {
  console.log("\n(ยังไม่เขียนฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}
for (const n of ART) {
  const path = `products/${ID}/${n}-${REV}.jpg`;
  const { error: upErr } = await sb.storage
    .from("product-images")
    .upload(path, artBuf[n], { contentType: "image/jpeg", upsert: false });
  if (upErr && !/already exists|Duplicate/i.test(upErr.message)) die(upErr.message);
  console.log(`⬆️  ${n}-${REV}.jpg ${upErr ? "(มีอยู่แล้ว ใช้ของเดิม)" : "อัปแล้ว"}`);
}

const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) die(saveErr.message);
console.log("\n✅ บันทึกแล้ว");
