/**
 * 🖼📌 พรีวิวเทมเพลตเข็มกลัดพลาสติก 5 ชุด เรนเดอร์ใหม่ที่ความละเอียดจริง (เจ้าของร้านแจ้ง 16 ต.ค. 69 "ปรับขนาดให้เท่าของจริง ตัวเทมเพลตจะได้ไม่เบลอ")
 *
 *   npx tsx scripts/brooch-badge-template-previews.mts            # ดาวน์โหลด .ai + เรนเดอร์ลง scratch (ไม่อัป ไม่เขียน DB)
 *   npx tsx scripts/brooch-badge-template-previews.mts --write    # อัปพรีวิวใหม่ + ชี้ previewUrl ของไฟล์ในชุด (เก็บพาธเก่าใน retiredPaths)
 *
 * ต้นตอ: พรีวิวที่อัปจากหลังบ้านเรนเดอร์ในเบราว์เซอร์ (lib/ai-thumbnail) ขยายได้ไม่เกิน 2 เท่าของ 72pt = ~144 DPI
 *   (หัวใจ 69.9×63.7 มม. ได้ 396×361 px) → จอออกแบบวางเป็นไกด์เต็มผืนบนจอ retina (~1,170 px) เลยเบลอ
 * ที่นี่เรนเดอร์จากไฟล์ .ai ตัวจริงใน storage ด้วย pymupdf 600 DPI (ด้านยาวไม่เกิน 2,000 px · จอ retina ทาบ ~1,200 px ยังไม่ต้องขยาย · ลายทแยงบีบ PNG ได้ดี ไฟล์ ~100 KB) ผ่าน scripts/py/render-ai-preview.py
 * ไม่แตะไฟล์ .ai / when / ขนาด — ถ้าขนาดอาร์ตบอร์ดที่อ่านได้ต่างจาก widthMm/heightMm เดิมเกิน 0.2 มม. จะหยุดถาม
 * รันซ้ำได้ (ลบพรีวิวเก่าเฉพาะที่เลิกใช้ 2 รอบก่อน — แท็บที่เปิดค้างยังโหลดรูปรอบก่อนได้)
 * 🛡 (16 ต.ค. 69 รอบ 2) พรีวิวใหม่เหมือนเดิมทุกไบต์ = ข้าม (เดิมอัปซ้ำทุกรอบ) · อ่านชุดใหม่ก่อนเขียน — ไฟล์ .ai ในชุดถูกเปลี่ยนระหว่างรัน
 *   (template-file-replace) = ข้าม ไม่เขียนข้อมูลเก่าทับ · ลบได้เฉพาะ "preview/…" ใน retiredPaths — ไฟล์ .ai เก่าที่เก็บไว้ย้อนกลับห้ามลบ
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { DesignTemplate, TemplateFile } from "../src/lib/design-templates";

const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m: string): never => {
  console.error("✗", m);
  process.exit(1);
};
const CATEGORY = "เข็มกลัดพลาสติก";
const BUCKET = "design-templates";
const PY = new URL("./py/render-ai-preview.py", import.meta.url).pathname;
// python ของ tools/cutout-py (.venv มี pymupdf) · -I = โหมดแยก ไม่อ่าน site/PYTHONPATH ของผู้ใช้ (python3 ระบบมองไม่เห็น fitz ใต้ -I)
const PYTHON = new URL("../tools/cutout-py/.venv/bin/python", import.meta.url).pathname;
const OUT = `${process.env.TMPDIR ?? "/tmp"}/brooch-previews/`;
mkdirSync(OUT, { recursive: true });

type Row = { id: string; data: DesignTemplate & { retiredPaths?: string[] } };
const { data: trows } = await sb.from("products").select("id,data").eq("category", "__templates__");
const sets = ((trows ?? []) as Row[]).filter((r) => (r.data.category ?? "").trim() === CATEGORY && !r.data.hidden);
if (!sets.length) die(`ไม่มีชุดเทมเพลตหมวด "${CATEGORY}"`);
const pathOf = (u?: string) => (u ? u.split(`/${BUCKET}/`)[1] : undefined);

async function download(url: string, to: string) {
  const res = await fetch(url);
  if (!res.ok) die(`โหลด ${url}: ${res.status}`);
  writeFileSync(to, Buffer.from(await res.arrayBuffer()));
}
async function upload(local: string, stem: string): Promise<string> {
  const safe = stem.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 50) || "template";
  const path = `preview/${randomUUID().slice(0, 8)}-${safe}-preview.png`;
  const { error } = await sb.storage.from(BUCKET).upload(path, readFileSync(local), { contentType: "image/png", upsert: false });
  if (error) die(`อัป ${local}: ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

for (const row of sets) {
  const t = row.data;
  const f: TemplateFile | undefined = (t.files ?? [])[0];
  if (!f?.fileUrl) die(`ชุด "${t.name}" ไม่มีไฟล์ .ai`);
  const ext = (f.fileName ?? "").split(".").pop()?.toLowerCase() === "pdf" ? "pdf" : "ai";
  const src = `${OUT}${t.id}.${ext}`;
  const png = `${OUT}${t.id}.png`;
  await download(f.fileUrl, src);
  const info = JSON.parse(execFileSync(PYTHON, ["-I", PY, src, png, "600", "2000"], { encoding: "utf8" }).trim()) as {
    widthMm: number;
    heightMm: number;
    px: [number, number];
    dpi: number;
  };
  const kb = Math.round(readFileSync(png).length / 1024);
  const dw = Math.abs(info.widthMm - (f.widthMm ?? 0));
  const dh = Math.abs(info.heightMm - (f.heightMm ?? 0));
  console.log(`📐 ${t.name} (${t.id}) · อาร์ตบอร์ด ${info.widthMm}×${info.heightMm} มม. (ในชุด ${f.widthMm}×${f.heightMm}) · พรีวิวใหม่ ${info.px[0]}×${info.px[1]} px @${info.dpi} DPI · ${kb} KB`);
  if (dw > 0.2 || dh > 0.2) die(`${t.name}: ขนาดอาร์ตบอร์ดไม่ตรงกับที่บันทึกไว้ในชุด — ตรวจไฟล์ก่อน`);
  // พรีวิวเดิมเหมือนที่เพิ่งเรนเดอร์ทุกไบต์ = ไม่ต้องอัปซ้ำ
  const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");
  if (f.previewUrl) {
    const cur = await fetch(f.previewUrl).catch(() => null);
    if (cur?.ok && md5(Buffer.from(await cur.arrayBuffer())) === md5(readFileSync(png))) {
      console.log("   ✓ พรีวิวเดิมเหมือนกันแล้ว — ข้าม");
      continue;
    }
  }
  if (!WRITE) continue;
  const previewUrl = await upload(png, (f.fileName ?? t.name).replace(/\.[^.]+$/, ""));
  // 🛡 อ่านชุดล่าสุดก่อนเขียน — ไฟล์ .ai ถูกเปลี่ยนระหว่างรัน = ข้าม (ไม่เขียนข้อมูลที่อ่านไว้ตอนเริ่มทับ)
  const { data: freshRow } = await sb.from("products").select("data").eq("id", row.id).single();
  const fresh = freshRow?.data as (DesignTemplate & { retiredPaths?: string[] }) | undefined;
  const ff = fresh?.files?.[0];
  if (!fresh || !ff || ff.fileUrl !== f.fileUrl) {
    await sb.storage.from(BUCKET).remove([pathOf(previewUrl)!]);
    console.log("   ⚠️ ไฟล์ในชุดถูกเปลี่ยนระหว่างรัน — ข้าม (รันใหม่อีกรอบ)");
    continue;
  }
  const prevPath = pathOf(ff.previewUrl);
  const old = (fresh.retiredPaths ?? []).filter((p) => p !== prevPath);
  // เก็บพรีวิวรอบก่อนไว้ 1 รอบ · พรีวิวที่เลิกใช้ตั้งแต่ 2 รอบก่อนค่อยลบ · ไฟล์อื่น (เช่น .ai เก่าจาก template-file-replace) เก็บไว้ ห้ามลบ
  const drop = old.filter((p) => p.startsWith("preview/"));
  const keep = old.filter((p) => !p.startsWith("preview/"));
  const next = { ...fresh, files: [{ ...ff, previewUrl }], retiredPaths: [...keep, ...(prevPath ? [prevPath] : [])], savedAt: new Date().toISOString() };
  const { error } = await sb.from("products").update({ data: next }).eq("id", row.id);
  if (error) die(`บันทึกชุด ${t.id}: ${error.message}`);
  if (drop.length) await sb.storage.from(BUCKET).remove(drop);
  console.log(`   ✅ previewUrl ใหม่ → ${previewUrl.split("/").pop()}${drop.length ? ` · ลบพรีวิวเก่า ${drop.length} ไฟล์` : ""}${keep.length ? ` · เก็บไฟล์เก่า ${keep.length} ไฟล์` : ""}`);
}
if (!WRITE) console.log(`\n(dry-run — PNG อยู่ที่ ${OUT} · ใส่ --write เพื่ออัปและบันทึก)`);
