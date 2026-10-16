/**
 * 📱✏️ เปลี่ยนไฟล์+สกินชุดเทมเพลตเคสพรีเมี่ยม iPhone 11–16 (22 ชุด) จาก "ม็อกอัป uv พรีเมี่ยม" เป็น "เส้นไดคัท" (เจ้าของร้านแจ้ง 16 ต.ค. 69
 * "เทมเพลตมันต้องเป็นแบบภาพที่ 1 (เส้นไดคัทใน Illustrator) แต่ตอนนี้แสดงแบบภาพที่ 2 (ภาพเครื่อง+หมายเหตุ)")
 *
 * ต้นตอ: ชุดที่อัปเมื่อ 12 ส.ค. 69 ใช้ไฟล์ "iXX uv พรีเมี่ยม.ai" (2–6 MB มีรูปเครื่องฝัง+หมายเหตุ · ตอนนี้อยู่ในโฟลเดอร์ "- ไม่ใช้")
 * และสกิน "--01.png" ก็ export จากไฟล์นั้น · ไฟล์เทมเพลตจริงคือ "XX พรีเมี่ยม.ai" (~52 KB เส้นไดคัทล้วน) ในโฟลเดอร์ 11–17
 *
 *   tools/cutout-py/.venv/bin/python -I scripts/py/case-dieline-skins.py <PNG_DIR> key=path …   # เรนเดอร์สกิน/พรีวิว + sizes.tsv ก่อน
 *   CASE_PNG=<PNG_DIR> npx tsx scripts/case-dieline-replace.mts            # dry-run
 *   CASE_PNG=<PNG_DIR> npx tsx scripts/case-dieline-replace.mts --write    # อัปไฟล์ใหม่ + เขียนทับ files[0] ของชุด (id ไฟล์เดิม)
 * ขนาดผืน = อาร์ตบอร์ดของไฟล์ (ตามที่เห็นใน Illustrator · เส้นไดคัทอยู่ข้างในมีขอบ) · ค่าเดิมสำรองไว้ที่ <PNG_DIR>/backup-<set>.json
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { DesignTemplate } from "../src/lib/design-templates";

const WRITE = process.argv.includes("--write");
const PNG = process.env.CASE_PNG ?? "";
if (!PNG) { console.error("✗ ตั้ง CASE_PNG=<โฟลเดอร์ที่มี <key>-skin.png / <key>-preview.png / sizes.tsv>"); process.exit(1); }
const B = process.env.CASE_SRC ?? "/Volumes/iDuckyShop/All Template/3. Case เคส/3.0 เคสมือถือ/iPhone/เคสพรีเมี่ยมขอบใส-ขาว-ดำ";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m: string): never => { console.error("✗", m); process.exit(1); };
const BUCKET = "design-templates";

/** key (ชื่อ png) → ชื่อชุดในระบบ + ไฟล์เส้นไดคัทบน NAS */
const MAP: { key: string; set: string; file: string }[] = [
  { key: "i11", set: "iPhone 11", file: "11/11 พรีเมี่ยม.ai" },
  { key: "i11pro", set: "iPhone 11 Pro", file: "11/i11 pro พรีเมี่ยม.ai" },
  { key: "i11promax", set: "iPhone 11 Pro Max", file: "11/i11 pro max พรีเมี่ยม.ai" },
  { key: "i12mini", set: "iPhone 12 mini", file: "12/i12 mini uv พรีเมี่ยม.ai" },
  { key: "i12", set: "iPhone 12 / 12 Pro", file: "12/i12=i12 pro พรีเมี่ยม.ai" },
  { key: "i12promax", set: "iPhone 12 Pro Max", file: "12/i12 pro max พรีเมี่ยม.ai" },
  { key: "i13mini", set: "iPhone 13 mini", file: "13/i13 mini uv พรีเมี่ยม.ai" },
  { key: "i13", set: "iPhone 13", file: "13/13-14 พรีเมี่ยม.ai" },
  { key: "i13pro", set: "iPhone 13 Pro", file: "13/i13 pro พรีเมี่ยม.ai" },
  { key: "i13promax", set: "iPhone 13 Pro Max", file: "13/13 pro max พรีเมี่ยม.ai" },
  { key: "i14", set: "iPhone 14", file: "14/13-14 พรีเมี่ยม.ai" },
  { key: "i14plus", set: "iPhone 14 Plus", file: "14/14+ พรีเมี่ยม.ai" },
  { key: "i14pro", set: "iPhone 14 Pro", file: "14/14pro พรีเมี่ยม.ai" },
  { key: "i14promax", set: "iPhone 14 Pro Max", file: "14/14 pro max พรีเมี่ยม.ai" },
  { key: "i15", set: "iPhone 15", file: "15/15 พรีเมี่ยม.ai" },
  { key: "i15plus", set: "iPhone 15 Plus", file: "15/15+ พรีเมี่ยม.ai" },
  { key: "i15pro", set: "iPhone 15 Pro", file: "15/15pro พรีเมี่ยม.ai" },
  { key: "i15promax", set: "iPhone 15 Pro Max", file: "15/15 pro max พรีเมี่ยม.ai" },
  { key: "i16", set: "iPhone 16", file: "16/16 พรีเมี่ยม.ai" },
  { key: "i16plus", set: "iPhone 16 Plus", file: "16/16+ พรีเมี่ยม.ai" },
  { key: "i16pro", set: "iPhone 16 Pro", file: "16/i16 pro พรีเมี่ยม.ai" },
  { key: "i16promax", set: "iPhone 16 Pro Max", file: "16/i16 pro max  พรีเมี่ยม.ai" },
];
const sizes = new Map(readFileSync(`${PNG}/sizes.tsv`, "utf8").trim().split("\n").map((l) => { const [k, w, h] = l.split("\t"); return [k, { w: +w, h: +h }] as const; }));

async function upload(local: string, kind: "file" | "preview", ext: string, stem: string): Promise<string> {
  const ct = ext === "png" ? "image/png" : "application/postscript";
  const path = `${kind}/${randomUUID().slice(0, 8)}-${stem}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, readFileSync(local), { contentType: ct, upsert: false });
  if (error) die(`อัป ${local}: ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

const { data: rows } = await sb.from("products").select("id,data").eq("category", "__templates__");
const sets = (rows ?? []).map((r) => r.data as DesignTemplate).filter((t) => t.category === "เคสมือถือ");
let n = 0;
for (const m of MAP) {
  const t = sets.find((x) => x.name === m.set) ?? die(`ไม่พบชุด "${m.set}"`);
  const src = `${B}/${m.file}`;
  const size = statSync(src).size;
  const sz = sizes.get(m.key) ?? die(`ไม่มีขนาดของ ${m.key} ใน sizes.tsv`);
  const skin = `${PNG}/${m.key}-skin.png`, prev = `${PNG}/${m.key}-preview.png`;
  statSync(skin); statSync(prev);
  const f0 = t.files?.[0] ?? die(`${m.set} ไม่มีไฟล์`);
  const already = f0.fileName === m.file.split("/").pop() && f0.widthMm === sz.w && f0.heightMm === sz.h;
  console.log(`${already ? "✓" : "→"} ${m.set}: ${f0.fileName} ${f0.widthMm}×${f0.heightMm} (${((f0.fileSize ?? 0) / 1024).toFixed(0)} KB) → ${m.file.split("/").pop()} ${sz.w}×${sz.h} (${(size / 1024).toFixed(0)} KB)${(t.files?.length ?? 0) > 1 ? ` ⚠️ ชุดมี ${t.files!.length} ไฟล์ แตะเฉพาะไฟล์แรก` : ""}`);
  if (already || !WRITE) { if (!already) n++; continue; }
  writeFileSync(`${PNG}/backup-${t.id}.json`, JSON.stringify(t, null, 1));
  const fileUrl = await upload(src, "file", "ai", `${m.key}-dieline`);
  const skinUrl = await upload(skin, "preview", "png", `${m.key}-dieline-skin`);
  const previewUrl = await upload(prev, "preview", "png", `${m.key}-dieline-preview`);
  const files = [{ ...f0, fileName: m.file.split("/").pop()!, fileSize: size, fileUrl, skinUrl, previewUrl, widthMm: sz.w, heightMm: sz.h }, ...t.files!.slice(1)];
  const next: DesignTemplate = { ...t, files, savedAt: new Date().toISOString() };
  const { error } = await sb.from("products").update({ data: next }).eq("id", `__template_${t.id}`);
  if (error) die(error.message);
  n++;
  console.log(`   ✅ ${fileUrl.split("/").pop()}`);
}
console.log(WRITE ? `\nเปลี่ยนแล้ว ${n} ชุด` : `\n(dry-run — จะเปลี่ยน ${n} ชุด · ใส่ --write เพื่อบันทึก)`);
