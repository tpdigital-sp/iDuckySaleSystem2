/**
 * สติ๊กเกอร์ Digital (sticker-pp) — ผู้ใช้สั่ง 26 ส.ค. 69
 *
 * 1) ขนาดตัด → "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)" ใหญ่สุดเท่าแผ่น A3 = กว้าง 29.7 · สูง 42 ซม.
 *    พร้อมแก้สเปกแผ่นของคู่ช่องกรอกให้เป็นแผ่น A3 เต็ม (42 × 29.7 ไม่เว้นช่องไฟ) —
 *    โหมด "ไดคัท 50%" คือหั่นแผ่นตามขนาด ไม่ใช่ไดคัททีละชิ้น จำนวนที่ได้จึงต้องตรงกับ
 *    ขนาดตายตัวข้าง ๆ (A4=2 · A5=4 · A6=8 · A7=16 ต่อแผ่น A3) ถ้าใช้พื้นที่วางของไดคัท
 *    100% (43.76 × 28.89 ช่องไฟ 0.5) ต่อไป กรอก 29.7 × 42 จะได้ 0 ชิ้น = "ใหญ่เกินแผ่น"
 * 2) ขนาดไดคัท (โหมดไดคัท 100%) — เล็กสุด 2 ซม. ทั้งด้านกว้างและด้านสูง
 * 3) กลุ่ม "ขอบไดคัท" — ตั้งชื่อตัวเลือกให้ตรงกับที่ร้านเรียก (ไดคัทมีขอบ / ไดคัทเข้าเนื้อ)
 *    เรียงมีขอบขึ้นก่อน · แสดงเป็นการ์ดพร้อมคำอธิบาย · ย้ายขึ้นมาอยู่หลังกลุ่มขนาด
 *    (กฎเดิม "เนื้อใสเลือกได้เฉพาะมีขอบ" ตามไปเปลี่ยนชื่อด้วย)
 * 4) จำนวนจุดไดคัทของไดคัท 50% — เขียนกำกับใต้ชื่อกลุ่ม "ขนาดตัด" (โควตาตามขนาดที่เลือกอยู่)
 *    + อัปอินโฟกราฟิก "การนับจุด DICUT" ของร้าน (ผู้ใช้ส่งมาในแชท) เข้าแท็บ "ข้อควรทราบ"
 *    + เติมกติกาเว้นระยะลาย 2 มม. และแก้ชิ้นเล็กสุดของไดคัท 100% ในแท็บ "การเตรียมไฟล์" เป็น 2 ซม.
 *
 * read-modify-write บนแถวจริง · รันซ้ำได้ · ไม่ใส่ --write = ดูอย่างเดียว ไม่บันทึก/ไม่อัปรูป
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "sticker-pp";
const CUT = "ขนาดตัด";
const CUT_W = "ขนาดตัด (กว้าง)";
const CUT_H = "ขนาดตัด (สูง)";
const DIE_W = "ขนาดไดคัท (กว้าง)";
const DIE_H = "ขนาดไดคัท (สูง)";
const EDGE = "ขอบไดคัท";
const RENAME = { "มีขอบ": "ไดคัทมีขอบ", "เข้าเนื้อ": "ไดคัทเข้าเนื้อ" };
const EDGE_CHOICES = [
  {
    name: "ไดคัทมีขอบ",
    desc: "ตัดเว้นขอบรอบลายไว้เล็กน้อย ลายไม่โดนตัดกิน ขอบชิ้นเรียบสวย — แบบมาตรฐานที่สั่งกันบ่อยสุด",
  },
  {
    name: "ไดคัทเข้าเนื้อ",
    desc: "ตัดชิดขอบลายพอดี ไม่เหลือขอบ ได้รูปทรงตามลายเป๊ะ · ตัดเข้าเนื้อสีจะมีฝุ่นหมึกติดที่ขอบงาน เช็ดออกได้",
  },
];
/** โควตาจุดไดคัทต่อ 1 ชิ้นที่ตัด (อินโฟกราฟิก "การนับจุด DICUT" ของร้าน) */
const DOT_QUOTA = { A5: 50, A6: 25, A7: 12 };
const DOT_FEE = "0.50";
const DOT_NOTE =
  `จำนวนจุดไดคัทต่อ 1 ชิ้น: ${Object.entries(DOT_QUOTA).map(([s, n]) => `${s} ไม่เกิน ${n} จุด`).join(" · ")}` +
  ` — เกินโควตาคิดจุดละ ฿${DOT_FEE} (สั่ง 25 แผ่น A3 ขึ้นไปต่อ 1 ลาย ฟรีค่าจุด)` +
  ` · วางลายห่างกันอย่างน้อย 2 มม. ไม่งั้นเส้นไดคัทซ้อนกัน · วิธีนับจุดดูจากรูปตัวอย่าง —`;
const DOT_IMG = "dicut-dots.jpg";
const DOT_SRC = "scripts/assets/sticker-pp-dicut-dots.jpg";

const WRITE = process.argv.includes("--write");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const publicUrl = (file) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) throw new Error(error?.message || `ไม่พบสินค้า ${ID}`);
const p = row.data;
const opts = p.options || [];
const at = (label) => opts.find((o) => o.label === label);
const log = [];

/* ── 1. ขนาดตัด (กำหนดเอง) ใหญ่สุด = แผ่น A3 ─────────────────────── */
const cutW = at(CUT_W);
const cutH = at(CUT_H);
if (!cutW || !cutH) throw new Error("ไม่พบช่องกรอกขนาดตัด");
cutW.input = {
  ...cutW.input,
  min: 1,
  max: 29.7,
  hint: "ขนาดชิ้นงานหลังตัด ใหญ่สุดเท่าแผ่น A3 (29.7 × 42 ซม.) — งานแนวนอนกรอกด้านยาวลงช่อง “สูง” ได้",
};
cutH.input = { ...cutH.input, min: 1, max: 42 };
cutH.sheetYield = {
  ...cutH.sheetYield,
  pairLabel: CUT_W,
  sheetW: 42,
  sheetH: 29.7,
  gap: 0,
  sheetName: "แผ่น A3",
};
log.push("ขนาดตัด: กว้าง ≤ 29.7 · สูง ≤ 42 · แผ่น 42×29.7 ไม่เว้นช่องไฟ");

/* ── 2. ไดคัท 100% เล็กสุด 2 ซม. ─────────────────────────────────── */
const dieW = at(DIE_W);
const dieH = at(DIE_H);
if (!dieW || !dieH) throw new Error("ไม่พบช่องกรอกขนาดไดคัท");
dieW.input = {
  ...dieW.input,
  min: 2,
  hint: "ขนาดชิ้นงานหลังไดคัท วัดด้านที่กว้างที่สุด — ไดคัท 100% รับเล็กสุด 2 ซม.",
};
dieH.input = { ...dieH.input, min: 2 };
log.push("ขนาดไดคัท: เล็กสุด 2 ซม. ทั้งกว้างและสูง");

/* ── 3. ขอบไดคัท — ชื่อใหม่ + การ์ด + ย้ายตำแหน่ง ─────────────────── */
const edge = at(EDGE) || { label: EDGE, choices: [] };
const keep = new Map((edge.choices || []).map((c) => [RENAME[c.name] || c.name, c]));
edge.choices = EDGE_CHOICES.map((spec) => ({ ...(keep.get(spec.name) || {}), ...spec }));
edge.display = "cards";

// กฎ limit ที่อ้างชื่อตัวเลือกเดิม (เนื้อใส = เลือกได้เฉพาะมีขอบ)
for (const r of p.rules || []) {
  if (r?.limit?.label !== EDGE) continue;
  r.limit.allow = (r.limit.allow || []).map((n) => RENAME[n] || n);
}

// เรียงใหม่: ...กลุ่มขนาด → ขอบไดคัท → ที่เหลือ
const rest = opts.filter((o) => o.label !== EDGE);
const lastSize = Math.max(...[DIE_H, DIE_W, CUT_H, CUT_W].map((l) => rest.findIndex((o) => o.label === l)));
p.options = [...rest.slice(0, lastSize + 1), edge, ...rest.slice(lastSize + 1)];
log.push(`ขอบไดคัท: ${edge.choices.map((c) => c.name).join(" / ")} (การ์ด) · แทรกหลัง "${rest[lastSize].label}"`);

/* ── 4. จำนวนจุดไดคัทของไดคัท 50% ────────────────────────────────── */
const cut = at(CUT);
if (!cut) throw new Error(`ไม่พบกลุ่ม ${CUT}`);
cut.note = DOT_NOTE;
// 👀 ปุ่มท้าย note กดเปิดรูป "การนับจุด DICUT" ดูเต็มจอทันที (รูปเดียวกับที่อยู่ในแท็บข้อควรทราบ)
cut.noteImageSrc = publicUrl(DOT_IMG);
// ป้ายบนตัวเลือกเดิมบอกจำนวนชิ้น/แผ่นอยู่แล้ว — ต่อท้ายด้วยโควตาจุดของขนาดนั้น
for (const c of cut.choices || []) {
  const q = DOT_QUOTA[c.name];
  if (!q) continue;
  c.badge = `${(c.badge || "").split(" · ")[0]} · ไม่เกิน ${q} จุด`;
}
log.push(`ขนาดตัด: note โควตาจุด + ป้าย ${Object.keys(DOT_QUOTA).join("/")}`);

// อินโฟกราฟิกการนับจุด → storage + แท็บ "ข้อควรทราบ"
let dotUrl = publicUrl(DOT_IMG);
if (WRITE) {
  const buf = fs.readFileSync(DOT_SRC);
  const up = await sb.storage.from("product-images").upload(`products/${ID}/${DOT_IMG}`, buf, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (up.error) throw new Error(`อัป ${DOT_IMG}: ${up.error.message}`);
  log.push(`อัปรูป ${DOT_IMG} (${(buf.length / 1024).toFixed(0)} KB)`);
}

const noticeTab = (p.tabs || []).find((t) => t.title === "ข้อควรทราบ");
if (!noticeTab) throw new Error("ไม่พบแท็บ ข้อควรทราบ");
noticeTab.images = [...new Set([...(noticeTab.images || []), dotUrl])];
noticeTab.imageSize = "lg";
noticeTab.text = noticeTab.text
  .replace(
    /• จำนวนจุดไดคัท:.*(\n|$)/,
    `• จำนวนจุดไดคัท (ไดคัท 50%): ${Object.entries(DOT_QUOTA).map(([s, n]) => `${s} ไม่เกิน ${n} จุด`).join(" / ")} — เกินกำหนดคิดจุดละ ${DOT_FEE} บาท (ดูวิธีนับจุดจากรูป)\n`
  )
  .replace(/\n• วางลายให้ห่างกัน[^\n]*/g, "") // รันซ้ำ: ถอดบรรทัดเดิมออกก่อนแทรกใหม่ กันซ้อน
  .replace(/(\n• กรณีไดคัทเข้าเนื้อสี)/, "\n• วางลายให้ห่างกันอย่างน้อย 2 mm — วางชิดเกินไปเส้นไดคัทจะซ้อนทับกัน$1");
if (!/2 mm/.test(noticeTab.text)) throw new Error("แทรกบรรทัดระยะห่าง 2 mm ไม่สำเร็จ");
log.push('แท็บ "ข้อควรทราบ": + รูปการนับจุด · + กติกาเว้นระยะ 2 mm');

const fileTab = (p.tabs || []).find((t) => t.title === "การเตรียมไฟล์");
if (fileTab) {
  fileTab.text = fileTab.text.replace(
    /• งานไดคัท 100% ไม่ควรมีชิ้นเล็กกว่า .*(\n|$)/,
    "• งานไดคัท 100% ชิ้นเล็กสุดที่รับตัดคือ 2 × 2 cm\n"
  );
  log.push('แท็บ "การเตรียมไฟล์": ชิ้นเล็กสุดไดคัท 100% = 2 × 2 cm');
}

/* ── สรุป + บันทึก ───────────────────────────────────────────────── */
console.log(`=== ${ID} — ${p.name || ""}`);
log.forEach((l) => console.log(" •", l));
console.log("   ลำดับกลุ่ม:", p.options.map((o) => o.label).join(" → "));
console.log("   ป้ายขนาดตัด:", (cut.choices || []).map((c) => `${c.name}${c.badge ? ` [${c.badge}]` : ""}`).join(" · "));
for (const r of p.rules || []) {
  if (r?.limit?.label === EDGE) console.log(`   กฎ: ${r.when.choices?.join("/")} → เลือกได้ ${r.limit.allow.join(", ")}`);
}
console.log("   แท็บข้อควรทราบ:\n" + noticeTab.text.split("\n").map((l) => "     " + l).join("\n"));

if (!WRITE) {
  console.log("   (ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
} else {
  const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", ID);
  console.log(upErr ? "   ❌ " + upErr.message : "   ✅ saved");
}
