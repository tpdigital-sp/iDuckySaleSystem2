/**
 * กลุ่ม "ชนิดกระดาษ" ของ โปสการ์ด / โพลารอยด์ / โฟโต้บูธ (กระดาษ)
 * → ใส่รูปประจำกระดาษแต่ละชนิด แบบเดียวกับสินค้า "กระดาษ Texture Paper"
 *   (รูปมีป้ายชื่อเนื้อกระดาษในตัว ใช้ URL ร่วมกับ texture-paper ไม่ก๊อปไฟล์ใหม่)
 *   กระดาษอาร์ตมัน 300/350/400 + PET ไม่มีในหน้า texture → ยืมจาก paper-foil / paper-art-pet
 *   เฉพาะช่องที่ยังว่าง (ไม่ทับรูปที่ตั้งไว้แล้ว)
 * ไม่แตะ display ของกลุ่ม (โปสการ์ด = dropdown, อีก 2 ตัว = cards)
 * รันซ้ำได้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products`;

/** รูปจากหน้า "กระดาษ Texture Paper" — ทับของเดิมเสมอ (นี่คือชุดที่ผู้ใช้สั่ง) */
const TEXTURE = {
  "100 Pound Paper (หนา 300gsm)": "texture-paper/22-tex-100pond.jpg",
  "E-Photo Paper 290 แกรม": "texture-paper/24-tex-ephoto.jpg",
  "Canvas Paper 260 แกรม": "texture-paper/20-tex-canvas.jpg",
  "Stardream Paper 285 แกรม": "texture-paper/28-stardream.jpg",
  "Stardream Crystal Paper 285 แกรม": "texture-paper/29-stardream-crystal.jpg",
  "Extra Paper 260 แกรม": "texture-paper/23-tex-extra.jpg",
};
/** กระดาษที่หน้า texture ไม่มี — เติมเฉพาะช่องที่ยังไม่มีรูป */
const FALLBACK = {
  "กระดาษอาร์ตมัน 300 แกรม": "paper-foil/gram-300.jpg",
  "กระดาษอาร์ตมัน 350 แกรม": "paper-foil/gram-350.jpg",
  "กระดาษอาร์ตมัน 400 แกรม": "paper-foil/gram-400.jpg",
  "พลาสติก PET 250 แกรม": "paper-art-pet/paper-pet.jpg",
};

const IDS = ["postcard-th", "new-mti1wu6o-1002", "new-mti1x6y4-5967"];
const LABEL = "ชนิดกระดาษ";

for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", id).single();
  if (error) throw error;
  const d = row.data;
  const group = (d.options || []).find((o) => o.label === LABEL);
  if (!group) throw new Error(`${id}: ไม่มีกลุ่ม "${LABEL}"`);

  const changed = [];
  for (const c of group.choices || []) {
    const want = TEXTURE[c.name] ? `${BASE}/${TEXTURE[c.name]}` : c.imageSrc || (FALLBACK[c.name] ? `${BASE}/${FALLBACK[c.name]}` : undefined);
    if (!want) { console.log(`  ⚠️ ${id}: ไม่มีรูปให้ "${c.name}"`); continue; }
    if (c.imageSrc === want) continue;
    c.imageSrc = want;
    changed.push(c.name);
  }

  const missing = (group.choices || []).filter((c) => !c.imageSrc).map((c) => c.name);
  if (missing.length) console.log(`  ⚠️ ${id}: ยังไม่มีรูป — ${missing.join(", ")}`);

  if (!changed.length) { console.log("—", id, row.name, "(รูปตรงอยู่แล้ว)"); continue; }
  const { error: upErr } = await sb.from("products").update({ data: d }).eq("id", id);
  if (upErr) throw upErr;
  console.log("✓", id, row.name, `— ตั้งรูป ${changed.length} ชนิด:`, changed.join(", "));
}
