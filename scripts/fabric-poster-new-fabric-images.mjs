/**
 * 🖼🧵 ผ้าแขวนผนัง (fabric-poster) — ใส่ภาพ + คำอธิบายให้ผ้า 9 ชนิดที่เพิ่งเพิ่มราคา (23 ก.ย. 69)
 *
 * แหล่งภาพ = รูปสตูดิโอของร้านในไดรฟ์ (ต้อง mount /Volumes/iDuckyShop):
 *   งานผ้าต่างๆ/เนื้อผ้าต่างๆ/<n>.<ชื่อผ้า>.jpg  1970×1970 มีแถบคำอธิบายด้านล่าง → ครอปเหลือ 66% บน
 *   ผ้าไมโครพีชไม่มีรูปเดี่ยว → ครอปจากชาร์ต P-ใบชนิดเนื้อผ้า-New.jpg (5 แถว × 4 คอลัมน์) ช่อง r2c3
 *   ⛔ ผ้า Double Nano ยังไม่มีรูปในไดรฟ์ (ทั้งรูปเดี่ยวและในชาร์ต) — เว้นไว้รอรูปจากร้าน
 * คำอธิบายย่อจากแถบคำอธิบายในรูปเดียวกัน (คำของร้าน) ตัดให้ยาวพอ ๆ กับชนิดผ้าเดิม
 *
 * รัน:  node scripts/fabric-poster-new-fabric-images.mjs           → ทำรูปลง scratchpad_out/ ไม่เขียนอะไร
 *       node scripts/fabric-poster-new-fabric-images.mjs --apply   → อัปรูปขึ้น storage + เขียนสินค้า + อ่านกลับเทียบ
 * รันซ้ำได้ (upsert รูปชื่อเดิม · เขียน imageSrc/desc ทับค่าเดิม)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const APPLY = process.argv.includes("--apply");
const ID = "fabric-poster";
const GROUP = "ชนิดผ้า";
const V = "v1";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.error("❌", m); process.exit(1); };
const url = (file) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

const DRIVE = "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ";
const DIR_FABRIC = `${DRIVE}/เนื้อผ้าต่างๆ`;
const CHART = `${DIR_FABRIC}/P-ใบชนิดเนื้อผ้า-New.jpg`;
const OUT = new URL("../scratchpad_out/fabric-poster-new/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const FABRICS = [
  { name: "ผ้า Satin Indo", file: "fabric-satin-indo", src: { photo: "14.Satin indo.jpg" },
    desc: "ลื่นมันวาว เล่นแสงดี เนื้อหนามีเท็กซ์เจอร์คล้ายเนื้อทราย อยู่ทรง ยืดหยุ่นดี แห้งเร็วไม่ต้องรีด" },
  { name: "ผ้า Satin พรีเมี่ยม", file: "fabric-satin-premium", src: { photo: "12.ซาตินพรีเมี่ยมขาว.jpg" },
    desc: "นุ่มลื่น มันวาว เล่นแสงดี น้ำหนักเบา ทิ้งตัวสวย ยืดหยุ่นดี ซักง่ายแห้งเร็วไม่ต้องรีด" },
  { name: "ผ้า Satin โรม่า", file: "fabric-satin-roma", src: { photo: "13.ซาตินโรม่า.jpg" },
    desc: "มันวาววิบวับกว่าซาตินอื่น เนื้อนิ่มเนียน ลื่นผิว ยืดหยุ่นสูง ทิ้งตัวอยู่ทรง ผ้าไม่ยับ" },
  { name: "ผ้า Satin ไดมอน", file: "fabric-satin-diamond", src: { photo: "8.Satin Diamond.jpg" },
    desc: "เนื้อนิ่มเนียน ลื่นผิว ยืดหยุ่นสูง มีน้ำหนัก ทิ้งตัวอยู่ทรง ผ้าไม่ยับ มันวาวเล่นแสงดี" },
  { name: "ผ้าชีฟอง", file: "fabric-chiffon", src: { photo: "11.ผ้าชีฟอง.jpg" },
    desc: "เนื้อโปร่งแสง บางเบา เนียนลื่นผิว ทิ้งตัวอยู่ทรงดี ผ้าไม่ยับ" },
  { name: "ผ้าไมโครพีช", file: "fabric-micro-peach", src: { chart: { r: 2, c: 3 } },
    desc: "เนื้อนุ่มไม่ระคายเคืองผิว หนาปุยมีสปริง ไม่บางง่าย ไม่เป็นขน พิมพ์ลายคมชัด สีติดทนนาน" },
  { name: "ผ้าไหมอิตาลี", file: "fabric-italian-silk", src: { photo: "10.ผ้าไหมอิตาลี.jpg" },
    desc: "โปร่งแสงปานกลาง ผิวเรียบนุ่มลื่น พริ้วไหว น้ำหนักเบา ทิ้งตัวอยู่ทรง ไม่ระคายเคืองผิว" },
  { name: "ผ้า Olivia Satin", file: "fabric-olivia-satin", src: { photo: "15.Olivia Satin.jpg" },
    desc: "เนื้อนิ่ม ยืดหยุ่นสูง มีน้ำหนัก ทิ้งตัวอยู่ทรง ผ้าไม่ยับ มันวาวเล่นแสงดี" },
];
/** ยังไม่มีรูป/คำอธิบายจากร้าน — แจ้งไว้ท้ายสคริปต์ */
const NO_IMAGE = ["ผ้า Double Nano"];

/** ช่องรูปในชาร์ตเนื้อผ้า — สัดส่วนเดียวกับ scripts/fabric-poster-build.mts (อ้างภาพเรนเดอร์ 920×1508) */
async function chartCell({ r, c }) {
  const m = await sharp(CHART).metadata();
  return sharp(CHART)
    .extract({
      left: Math.round(((45 + c * 215.5) / 920) * m.width),
      top: Math.round(((161 + r * 267) / 1508) * m.height),
      width: Math.round((178 / 920) * m.width),
      height: Math.round((136 / 1508) * m.height),
    })
    .jpeg({ quality: 88 })
    .toBuffer();
}
/** รูปเดี่ยวในไดรฟ์ — ตัดแถบคำอธิบายล่างออก เหลือ 66% บน กว้าง 1200 */
async function fromDrive(photo) {
  const path = `${DIR_FABRIC}/${photo}`;
  const m = await sharp(path).metadata();
  return sharp(path)
    .extract({ left: 0, top: 0, width: m.width, height: Math.round(m.height * 0.66) })
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
}

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) die(error.message);
const d = structuredClone(row.data);
const grp = (d.options ?? []).find((o) => o.label === GROUP) ?? die(`ไม่พบกลุ่ม ${GROUP}`);

for (const f of FABRICS) {
  const buf = f.src.chart ? await chartCell(f.src.chart) : await fromDrive(f.src.photo);
  const meta = await sharp(buf).metadata();
  if (!(meta.width >= 400 && meta.height >= 300)) die(`${f.name}: รูปเล็กผิดปกติ ${meta.width}×${meta.height}`);
  const file = `${f.file}-${V}.jpg`;
  writeFileSync(`${OUT}${file}`, buf); // เก็บตัวอย่างไว้ดูก่อนเขียนจริงเสมอ
  f.url = url(file);
  f.dim = `${meta.width}×${meta.height}`;
  if (APPLY) {
    const up = await sb.storage.from("product-images").upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
    if (up.error) die(`อัป ${file}: ${up.error.message}`);
  }
  const choice = grp.choices.find((c) => c.name === f.name) ?? die(`ไม่พบตัวเลือก ${f.name}`);
  choice.imageSrc = f.url;
  choice.desc = f.desc;
  console.log(`• ${f.name.padEnd(22)} ${f.dim.padEnd(11)} ${file}`);
}

// เติมคำอธิบายในรายการของแท็บ "ชนิดผ้า" (บรรทัดที่ยังมีแต่ชื่อ)
let tabFixed = 0;
const tab = (d.tabs ?? []).find((t) => t.title === GROUP);
if (tab?.text) {
  for (const f of FABRICS) {
    const plain = `• ${f.name}\n`;
    if (tab.text.includes(plain)) {
      tab.text = tab.text.replace(plain, `• ${f.name} — ${f.desc}\n`);
      tabFixed++;
    }
  }
}
d.savedAt = new Date().toISOString();

console.log(`\n• แท็บชนิดผ้า: เติมคำอธิบาย ${tabFixed} บรรทัด`);
console.log("• ยังไม่มีรูป:", NO_IMAGE.join(" · "), "(ไม่มีทั้งรูปเดี่ยวและช่องในชาร์ต)");
console.log("• ตัวอย่างรูปอยู่ที่", OUT);
if (!APPLY) { console.log("\n(dry-run) ใส่ --apply เพื่ออัปรูป + เขียนสินค้า"); process.exit(0); }

const { data: wrote, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (wrote?.length !== 1) die(`เขียนโดน ${wrote?.length} แถว`);

// อ่านกลับ: เช็ครูปร่างค่าจริง + รูปโหลดขึ้นจริง (ไม่ใช่แค่เท่ากับตัวแปรฝั่งเรา)
const { data: back, error: e3 } = await sb.from("products").select("data").eq("id", ID).single();
if (e3) die(e3.message);
const bgrp = back.data.options.find((o) => o.label === GROUP);
for (const f of FABRICS) {
  const c = bgrp.choices.find((x) => x.name === f.name) ?? die(`อ่านกลับ: ไม่มี ${f.name}`);
  if (typeof c.imageSrc !== "string" || !c.imageSrc.startsWith("https://") || c.imageSrc !== f.url)
    die(`อ่านกลับ: imageSrc ${f.name} ไม่ตรง (${c.imageSrc})`);
  if (c.desc !== f.desc) die(`อ่านกลับ: desc ${f.name} ไม่ตรง`);
  const head = await fetch(c.imageSrc, { method: "HEAD" });
  if (!head.ok) die(`รูป ${f.name} โหลดไม่ขึ้น — HTTP ${head.status}`);
}
if (back.data.savedAt !== d.savedAt) die("อ่านกลับ: savedAt ไม่ตรง");
console.log("\n✅ อัปรูป + เขียนแล้ว · อ่านกลับตรงทุกข้อ · รูปทุกใบเปิดได้จาก CDN");
