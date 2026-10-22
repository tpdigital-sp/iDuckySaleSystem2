/**
 * 🌈 กระเป๋าโฮโลแกรม (hologram-bag): แทนเทมเพลต ZipLock ด้วยไฟล์ใหม่ (เจ้าของร้านส่ง ~/Desktop/ZipLock.ai 22 ต.ค. 69 "นำเทมเพลตนี้ แทนของเดิมให้หน่อย" + รูปงานจริงพิมพ์เต็มถุง)
 *
 *   npx tsx scripts/hologram-ziplock-replace.mts [--file <ZipLock.ai>]            # ดูผล (เรนเดอร์ในเครื่อง)
 *   npx tsx scripts/hologram-ziplock-replace.mts [--file <ZipLock.ai>] --write    # อัป + บันทึก + ล้างแคชเว็บจริง
 *
 * ไฟล์ใหม่ 210×153 เท่าเดิม · เลเยอร์ "Layer 3" = ขอบถุงมุมมนเส้นดำ 204×147 @3 · "สกรีน" = ลายตัวอย่างคลุมเต็มถุง · "เอาออก" = พื้นโฮโลแกรมตัวอย่าง
 *   → พิมพ์ได้เต็มตัวถุงในขอบมุมมน (เทมเพลตเดิมมีช่องกลาง 163×106 + กรอบโฮโลทึบ — เลิกใช้)
 * ชุด tpl-ewsr369y6 (คง id ชุด/ไฟล์): fileUrl/fileName/fileSize · skinUrl = เลเยอร์ Layer 3 อย่างเดียวพื้นโปร่ง (ไม่ย้อมลายลูกค้าด้วยโฮโลแกรม)
 *   · ไม่มี previewUrl (เอาภาพออกจากการ์ดตามสั่ง 22 ต.ค. 69) · cutCurves = ขอบถุง · whiteUnder · ถอด skinOpaque · ไฟล์/สกิน/พรีวิวเก่าเก็บ retiredPaths
 * 🤐❌ ไม่มีแถบซิปบนจอออกแบบ (เจ้าของร้านสั่ง 22 ต.ค. 69 "เอาออกไปเลย" หลังลองทั้งวาดในผืนและวางเหนือกรอบงาน) — ชุดเหลือไฟล์เดียว ไม่มี optionLabel
 *    ซิปขาว/ดำ เห็นได้ในพรีวิว 3D (components/Bag3D) แทน
 * ⚠️ hologram-bag ถอดออกจาก knickknack-bag-template-link.mts แล้ว (สคริปต์นั้นรับชุดไฟล์เดียว) — สคริปต์นี้ดูแลชุด ZipLock คนเดียว
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { DesignTemplate, TemplateCurve, TemplateFile } from "../src/lib/design-templates";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const fi = process.argv.indexOf("--file");
const FILE = fi > 0 ? process.argv[fi + 1] : "/Users/iduckshop/Desktop/ZipLock.ai";
const SET = "tpl-ewsr369y6";
const PRODUCT = "hologram-bag";
const BUCKET = "design-templates";
const die = (m: string): never => {
  console.error("✗", m);
  process.exit(1);
};
statSync(FILE);
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
const PY = new URL("./py/artboard-skin-cut.py", import.meta.url).pathname;
const PYTHON = new URL("../tools/cutout-py/.venv/bin/python", import.meta.url).pathname;
const OUT = `${process.env.TMPDIR ?? "/tmp"}/ziplock-replace`;
mkdirSync(OUT, { recursive: true });

const r = JSON.parse(execFileSync(PYTHON, ["-I", PY, FILE, "0", OUT, "ziplock", "--skin-layers", "Layer 3", "--any-color"], { encoding: "utf8" })) as {
  error?: string; widthMm: number; heightMm: number; skin: string; preview: string; curves: TemplateCurve[]; box: number[];
};
if (r.error) die(r.error);
if (Math.abs(r.widthMm - 210) > 0.5 || Math.abs(r.heightMm - 153) > 0.5) die(`อาร์ตบอร์ด ${r.widthMm}×${r.heightMm} ไม่ใช่ 210×153`);
if (r.box[2] < 190 || r.box[3] < 135) die(`ขอบถุงเล็กผิดปกติ ${r.box.join(",")}`);
console.log(`🌈 ${FILE.split("/").pop()} · ${r.widthMm}×${r.heightMm} · ขอบถุง (${r.box[0]},${r.box[1]}) ${r.box[2]}×${r.box[3]} มม.`);

type Row = { id: string; data: DesignTemplate & { retiredPaths?: string[] } };
const { data: row } = await sb.from("products").select("id,data").eq("id", `__template_${SET}`).single();
const t = (row as Row | null)?.data ?? die(`ไม่พบชุด ${SET}`);
const old = (t.files ?? [])[0] ?? die("ชุดไม่มีไฟล์");
console.log(`   เดิม: ${t.files?.length} ไฟล์ · ${old.fileName} ${old.fileSize} bytes · optionLabel ${t.optionLabel ?? "-"} · แถบซิป ${old.aboveUrl ? "มี" : "-"} · เส้นตัด ${old.cutCurves?.length ?? 0}`);
if (!WRITE) {
  console.log(`\n(dry-run — สกิน/พรีวิวอยู่ที่ ${OUT} · ใส่ --write เพื่ออัปและบันทึก)`);
  process.exit(0);
}
async function upload(buf: Buffer, kind: "file" | "preview", stem: string, e: string) {
  const path = `${kind}/${randomUUID().slice(0, 8)}-${stem}.${e}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: e === "png" ? "image/png" : "application/postscript", upsert: false });
  if (error) die(`อัป ${kind}: ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
const pathOf = (u?: string) => (u ? u.split(`/${BUCKET}/`)[1] : undefined);
const bytes = readFileSync(FILE);
// .ai ตัวเดิมขนาดเท่ากัน = ไม่อัปซ้ำ
const sameAi = old.fileName === "ZipLock.ai" && old.fileSize === bytes.length && !!old.fileUrl;
const fileUrl = sameAi ? old.fileUrl! : await upload(bytes, "file", "ZipLock", "ai");
// 🙈 ไม่ใส่ภาพพรีวิว (เจ้าของร้านสั่ง 22 ต.ค. 69 "เอาภาพออกให้หน่อย" — การ์ดเทมเพลตหน้าสินค้าเป็นไอคอน 📐 แทนภาพลายตัวอย่าง)
const { skinOpaque: _so, fullFace: _ff, choice: _c, choices: _cs, previewUrl: _pv, aboveUrl: _au, aboveMm: _am, ...base } = old;
// สกิน = ขอบถุงอย่างเดียว · ไม่ใส่ภาพเหนือกรอบงาน (แถบซิป) · ไฟล์เดียว
const skinUrl = await upload(readFileSync(r.skin), "preview", "ZipLock-F-01", "png");
const next: TemplateFile[] = [
  { ...base, fileUrl, fileName: "ZipLock.ai", fileSize: bytes.length, widthMm: r.widthMm, heightMm: r.heightMm, skinUrl, cutCurves: r.curves, whiteUnder: true },
];
const keep = new Set(next.flatMap((f) => [pathOf(f.fileUrl), pathOf(f.skinUrl)]));
const oldPaths = [...(t.files ?? []).flatMap((f) => [pathOf(f.fileUrl), pathOf(f.skinUrl), pathOf(f.previewUrl), pathOf(f.aboveUrl)]), pathOf(t.previewUrl)].filter((p) => p && !keep.has(p));
const { previewUrl: _tpv, optionLabel: _ol, ...tBase } = t;
const retired = [...new Set([...(t.retiredPaths ?? []), ...oldPaths].filter(Boolean) as string[])];
const { error } = await sb.from("products").update({ data: { ...tBase, files: next, retiredPaths: retired, savedAt: new Date().toISOString() } }).eq("id", `__template_${SET}`);
if (error) die(`บันทึก: ${error.message}`);
console.log(`   ✅ ${SET} ← ZipLock.ai${sameAi ? " (ไฟล์เดิม)" : " ใหม่"} · ไฟล์เดียว ไม่มีแถบซิปบนจอ · เส้นตัด = ขอบถุง · retiredPaths ${retired.length}`);
await revalidateLive(env, { productIds: [PRODUCT], templateIds: [SET] });
