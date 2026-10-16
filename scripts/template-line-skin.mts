/**
 * 🧩 ทำสกินเทมเพลตใหม่จากเส้นเวกเตอร์ในไฟล์ .ai (เส้นบางคม · ไม่มีเงาฟุ้ง) แล้วตั้งเป็น skinUrl ของไฟล์ในชุด
 * (16 ต.ค. 69 เจ้าของร้านแจ้ง กรอบรูป+จิ๊กซอว์ "ช่วยปรับ skin ให้หน่อย มันทำให้ดูไม่น่าซื้อ"
 *  — สกินเดิมเส้นตัวจิ๊กซอว์มีเงาเทาฟุ้งหนา วางบนรูปลูกค้าแล้วขุ่นทั้งภาพ)
 *
 *   npx tsx scripts/template-line-skin.mts --category "จิ๊กซอว์ SUB"            # เรนเดอร์ลงเครื่อง (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/template-line-skin.mts --category "จิ๊กซอว์ SUB" --write    # อัป + ตั้ง skinUrl + ล้างแคชเว็บจริง
 *
 * เรนเดอร์ด้วย scripts/py/template-line-skin.py (pymupdf · 300 DPI · python ของ tools/cutout-py/.venv)
 * ด่าน: ขนาดสกินต้องเท่าอาร์ตบอร์ดของไฟล์ (±0.2 มม.) · ต้องมีเส้นเทาอย่างน้อย 1 เส้น
 * สกินเดิมเก็บใน retiredPaths (ย้อนกลับได้ ไม่ลบ) · ชุดละไฟล์เดียวเท่านั้น
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { DesignTemplate, TemplateFile } from "../src/lib/design-templates";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const ci = process.argv.indexOf("--category");
const CATEGORY = ci > 0 ? process.argv[ci + 1] : "";
const die = (m: string): never => {
  console.error("✗", m);
  process.exit(1);
};
if (!CATEGORY) die('ใส่ --category "<หมวดชุดเทมเพลต>"');
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
const BUCKET = "design-templates";
const PYTHON = new URL("../tools/cutout-py/.venv/bin/python", import.meta.url).pathname;
const PY = new URL("./py/template-line-skin.py", import.meta.url).pathname;
const OUT = `${process.env.TMPDIR ?? "/tmp"}/template-line-skin/`;
mkdirSync(OUT, { recursive: true });
const pathOf = (u?: string) => (u ? u.split(`/${BUCKET}/`)[1] : undefined);

type Row = { id: string; data: DesignTemplate & { retiredPaths?: string[] } };
const { data: trows } = await sb.from("products").select("id,data").eq("category", "__templates__");
const sets = ((trows ?? []) as Row[]).filter((r) => (r.data.category ?? "").trim() === CATEGORY.trim() && !r.data.hidden);
if (!sets.length) die(`ไม่มีชุดเทมเพลตหมวด "${CATEGORY}"`);

const written: string[] = [];
for (const row of sets) {
  const t = row.data;
  const files = t.files ?? [];
  if (files.length !== 1) {
    console.log(`   ⚠️ ข้าม "${t.name}" — มี ${files.length} ไฟล์ (รองรับชุดละไฟล์เดียว)`);
    continue;
  }
  const f: TemplateFile = files[0];
  if (!f.fileUrl) {
    console.log(`   ⚠️ ข้าม "${t.name}" — ไม่มีไฟล์ .ai`);
    continue;
  }
  const src = `${OUT}${t.id}.ai`;
  const png = `${OUT}${t.id}-skin.png`;
  writeFileSync(src, Buffer.from(await (await fetch(f.fileUrl)).arrayBuffer()));
  const j = JSON.parse(execFileSync(PYTHON, ["-I", PY, src, png, "300"], { encoding: "utf8" }).trim()) as {
    widthMm: number;
    heightMm: number;
    px: [number, number];
    strokes: { gray: number; color: number; hatch: number };
  };
  console.log(
    `🧩 ${t.name} (${t.id}) · ${j.widthMm}×${j.heightMm} มม. · ${j.px[0]}×${j.px[1]} px · เส้น ${j.strokes.gray} · ลายทแยงตัดตก ${j.strokes.hatch} · สกินเดิม ${f.skinUrl ? f.skinUrl.split("/").pop() : "-"}`,
  );
  if (Math.abs(j.widthMm - (f.widthMm ?? 0)) > 0.2 || Math.abs(j.heightMm - (f.heightMm ?? 0)) > 0.2) die(`${t.name}: ขนาดไม่ตรงอาร์ตบอร์ดที่บันทึก ${f.widthMm}×${f.heightMm}`);
  if (!j.strokes.gray) die(`${t.name}: ไม่มีเส้นเทาในไฟล์ — สกินจะว่างเปล่า`);
  if (!WRITE) continue;
  const safe = (f.fileName ?? t.name).replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 40) || "template";
  const path = `preview/${randomUUID().slice(0, 8)}-${safe}-lineskin.png`;
  const { error: ue } = await sb.storage.from(BUCKET).upload(path, readFileSync(png), { contentType: "image/png", upsert: false });
  if (ue) die(`อัปสกิน ${t.name}: ${ue.message}`);
  const skinUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  // อ่านชุดล่าสุดก่อนเขียน — ไฟล์ในชุดถูกเปลี่ยนระหว่างรัน = ข้าม
  const { data: freshRow } = await sb.from("products").select("data").eq("id", row.id).single();
  const fresh = freshRow?.data as (DesignTemplate & { retiredPaths?: string[] }) | undefined;
  const ff = fresh?.files?.[0];
  if (!fresh || !ff || ff.fileUrl !== f.fileUrl) {
    await sb.storage.from(BUCKET).remove([path]);
    console.log("   ⚠️ ไฟล์ในชุดถูกเปลี่ยนระหว่างรัน — ข้าม");
    continue;
  }
  const old = pathOf(ff.skinUrl);
  const next = {
    ...fresh,
    files: [{ ...ff, skinUrl }],
    retiredPaths: [...new Set([...(fresh.retiredPaths ?? []), ...(old ? [old] : [])])].slice(-30),
    savedAt: new Date().toISOString(),
  };
  const { error } = await sb.from("products").update({ data: next }).eq("id", row.id);
  if (error) die(`บันทึกชุด ${t.id}: ${error.message}`);
  written.push(t.id);
  console.log(`   ✅ skinUrl ใหม่ → ${skinUrl.split("/").pop()} (สกินเดิมเก็บไว้ ไม่ลบ)`);
}
if (!WRITE) console.log(`\n(dry-run — PNG อยู่ที่ ${OUT} · ใส่ --write เพื่ออัปและบันทึก)`);
if (written.length) await revalidateLive(env, { templateIds: written });
