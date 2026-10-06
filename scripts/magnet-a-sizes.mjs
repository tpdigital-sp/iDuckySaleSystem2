/**
 * แม่เหล็ก 2 ตัว (acrylicmagnet-3 ติดตู้เย็น · acrylicmagnet-4 ติดรถยนต์) — เพิ่มปุ่มขนาดสำเร็จ A4 / A5 / A6
 * (เจ้าของร้านขอ 6 ต.ค. 69) · เดิมมีแต่ช่องกรอก กว้าง×สูง
 * · กลุ่มใหม่ "ขนาดชิ้นงาน" ไว้บนสุดของหัวข้อ 1 — ตัวเลือกแรก = 📐 กำหนดขนาดเอง (ลูกค้าเดิมเห็นเหมือนเดิม)
 * · ช่องกรอก กว้าง/สูง โชว์เฉพาะตอนเลือก 📐 กำหนดขนาดเอง (showWhen)
 * · ปุ่ม A4/A5/A6 ใช้ piecesPerUnit 2/4/8 + ภาพชุดกลาง shared/cut-size (ชุดเดียวกับ paper-art-pet)
 * read-modify-write บนแถวจริง รันซ้ำได้ · ไม่ใส่ --write = ดูอย่างเดียว
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const IDS = ["acrylicmagnet-3", "acrylicmagnet-4"];
const GROUP = "ขนาดชิ้นงาน";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const W = "ขนาดชิ้นงาน (กว้าง)";
const H = "ขนาดชิ้นงาน (สูง)";
const IMG = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/shared/cut-size/";
const CHOICES = [
  { name: CUSTOM, imageSrc: `${IMG}custom-a3-v1.jpg` },
  { name: "A4", badge: "ได้ 2 ชิ้น / แผ่น A3", imageSrc: `${IMG}a4-2-a3-v1.jpg`, piecesPerUnit: 2, desc: "21 × 29.7 ซม." },
  { name: "A5", badge: "ได้ 4 ชิ้น / แผ่น A3", imageSrc: `${IMG}a5-4-a3-v1.jpg`, piecesPerUnit: 4, desc: "14.8 × 21 ซม." },
  { name: "A6", badge: "ได้ 8 ชิ้น / แผ่น A3", imageSrc: `${IMG}a6-8-a3-v1.jpg`, piecesPerUnit: 8, desc: "10.5 × 14.8 ซม." },
];

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const WRITE = process.argv.includes("--write");
const die = (m) => { console.error("✗", m); process.exit(1); };

for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).single();
  if (error) die(`${id}: ${error.message}`);
  const d = row.data;
  const wi = d.options.findIndex((o) => o.label === W);
  const hi = d.options.findIndex((o) => o.label === H);
  if (wi < 0 || hi < 0) die(`${id}: ไม่พบช่องกรอก กว้าง/สูง`);
  let changed = 0;
  let g = d.options.find((o) => o.label === GROUP);
  if (!g) {
    g = { label: GROUP, choices: [], section: d.options[wi].section };
    d.options.splice(wi, 0, g);
    changed++;
  }
  // ตัวเลือกตามลำดับ CHOICES — คงฟิลด์อื่นที่แอดมินแก้ไว้ (เช่น stockLinks) แต่ทับฟิลด์ที่สคริปต์ดูแล
  const next = CHOICES.map((c) => ({ ...(g.choices.find((x) => x.name === c.name) ?? {}), ...c }));
  const extra = g.choices.filter((x) => !CHOICES.some((c) => c.name === x.name));
  if (JSON.stringify(g.choices) !== JSON.stringify([...next, ...extra])) { g.choices = [...next, ...extra]; changed++; }
  // หมายเหตุหัวข้อที่เคยห้อยกับช่องกว้าง (ตู้เย็น: เริ่ม 3×3 · SET-KIT คละขนาด) → ย้ายขึ้นกลุ่มใหม่ ไม่งั้นหายตอนเลือก A4-A6
  const wo = d.options.find((x) => x.label === W);
  if (wo.note && !g.note) { g.note = wo.note; delete wo.note; changed++; }
  for (const lbl of [W, H]) {
    const o = d.options.find((x) => x.label === lbl);
    if (o.showWhen?.label !== GROUP || o.showWhen.choices?.[0] !== CUSTOM || o.showWhen.choices.length !== 1) {
      o.showWhen = { label: GROUP, choices: [CUSTOM] };
      changed++;
    }
  }
  console.log(`${id}: เปลี่ยน ${changed} จุด · ลำดับกลุ่ม ${d.options.map((o) => o.label).join(" › ")}`);
  if (!changed || !WRITE) continue;
  d.savedAt = new Date().toISOString();
  const { data: upd, error: e2 } = await sb.from("products").update({ data: d }).eq("id", id).select("id");
  if (e2) die(e2.message);
  if (upd?.length !== 1) die(`${id}: ไม่โดนแถว`);
  const { data: back } = await sb.from("products").select("data").eq("id", id).single();
  const bg = back.data.options.find((o) => o.label === GROUP);
  const ok =
    bg?.choices.map((c) => c.name).join("|") === CHOICES.map((c) => c.name).join("|") &&
    [W, H].every((l) => back.data.options.find((o) => o.label === l)?.showWhen?.choices?.[0] === CUSTOM);
  if (!ok) die(`${id}: อ่านกลับไม่ตรง`);
  console.log(`✓ ${id} เขียนแล้ว อ่านกลับตรง`);
}
