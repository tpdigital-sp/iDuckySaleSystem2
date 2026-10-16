/**
 * 🔁 เปลี่ยนไฟล์ .ai ของชุดเทมเพลต (ชุดละไฟล์เดียว) เป็นไฟล์ใหม่จากเครื่อง/NAS — อัปไฟล์ + พรีวิว 600 DPI + เส้นไดคัทจริง ในทีเดียว
 * (16 ต.ค. 69 ชุด "(ex) PinnCircle 2.5cm" ถูกอัปไฟล์ 5.8 ซม. ไว้ — ไฟล์ในโฟลเดอร์ "ลงเว็บแล้ว" บน NAS เองก็ผิด
 *  ตัวที่ถูกอยู่ที่ ลงเว็บแล้ว/8.(100)เข็มกลัดพลาสติก/Pic/(ex) PinnCircle 2.5cm.ai · อาร์ตบอร์ด 36 มม. · เส้นตัด 35 มม.)
 *
 *   npx tsx scripts/template-file-replace.mts --set tpl-m2j62qzgy --file "<path>.ai"            # ดูผล (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/template-file-replace.mts --set tpl-m2j62qzgy --file "<path>.ai" --write    # อัป + บันทึก
 *
 * ทำอะไร: ขนาดอาร์ตบอร์ด + พรีวิว PNG (scripts/py/render-ai-preview.py · 600 DPI ≤ 2,000 px) + เส้นไดคัท (scripts/py/template-cut-curves.py)
 *   → อัป .ai + พรีวิวขึ้น storage → แทน fileUrl/fileName/fileSize/widthMm/heightMm/previewUrl/cutCurves ของไฟล์ในชุด
 *   คง id/when/choice ของไฟล์ไว้ (การจับคู่กับตัวเลือกขนาดไม่เปลี่ยน) · ไฟล์ + พรีวิวเก่าเก็บใน retiredPaths (ย้อนกลับได้ ไม่ลบทันที)
 * ด่าน: ชุดต้องมีไฟล์เดียว · ไฟล์ใหม่ต้องอ่านเส้นตัดได้ · ไฟล์เหมือนเดิมทุกไบต์ = ไม่ทำ
 */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { curvesBox, type DesignTemplate, type TemplateCurve, type TemplateFile } from "../src/lib/design-templates";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : "";
};
const SET = arg("--set");
const FILE = arg("--file");
const die = (m: string): never => {
  console.error("✗", m);
  process.exit(1);
};
if (!SET || !FILE) die('ใส่ --set <id ชุด> --file "<ไฟล์ .ai/.pdf>"');
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
const BUCKET = "design-templates";
const PYTHON = new URL("../tools/cutout-py/.venv/bin/python", import.meta.url).pathname;
const PY_PREVIEW = new URL("./py/render-ai-preview.py", import.meta.url).pathname;
const PY_CUT = new URL("./py/template-cut-curves.py", import.meta.url).pathname;
const OUT = `${process.env.TMPDIR ?? "/tmp"}/template-file-replace/`;
mkdirSync(OUT, { recursive: true });

/* ── ชุดเดิม ── */
const { data: row, error: rerr } = await sb.from("products").select("id,data").eq("id", `__template_${SET}`).single();
if (rerr || !row) die(`ไม่เจอชุด ${SET}: ${rerr?.message}`);
const t = row!.data as DesignTemplate & { retiredPaths?: string[] };
const files = t.files ?? [];
if (files.length !== 1) die(`ชุด "${t.name}" มี ${files.length} ไฟล์ — สคริปต์นี้รองรับชุดละไฟล์เดียว`);
const old = files[0];

/* ── ไฟล์ใหม่ ── */
const bytes = readFileSync(FILE);
const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");
if (old.fileUrl) {
  const res = await fetch(old.fileUrl);
  if (res.ok && md5(Buffer.from(await res.arrayBuffer())) === md5(bytes)) {
    console.log(`✓ ชุด "${t.name}" ใช้ไฟล์นี้อยู่แล้ว (เหมือนกันทุกไบต์) — ไม่ทำอะไร`);
    process.exit(0);
  }
}
const ext = FILE.toLowerCase().endsWith(".pdf") ? "pdf" : "ai";
const fileName = FILE.split("/").pop()!;
const png = `${OUT}${SET}-preview.png`;
const info = JSON.parse(execFileSync(PYTHON, ["-I", PY_PREVIEW, FILE, png, "600", "2000"], { encoding: "utf8" }).trim()) as {
  widthMm: number;
  heightMm: number;
  px: [number, number];
  dpi: number;
};
let cut: TemplateCurve[];
let face: TemplateCurve[] = [];
let via = "";
try {
  const j = JSON.parse(execFileSync(PYTHON, ["-I", PY_CUT, FILE], { encoding: "utf8" }).trim());
  cut = j.cut;
  face = j.face ?? [];
  via = j.via;
} catch (e) {
  die(`อ่านเส้นตัดของไฟล์ใหม่ไม่ได้: ${((e as { stdout?: string }).stdout ?? String(e)).trim()}`);
}
const box = curvesBox(cut!);
const fbox = face.length ? curvesBox(face) : null;
const r1 = (v: number) => Math.round(v * 10) / 10;
console.log(`📐 ชุด "${t.name}" (${SET})`);
console.log(`   เดิม: ${old.fileName} · ${old.fileSize ?? "?"} bytes · อาร์ตบอร์ด ${old.widthMm}×${old.heightMm} มม.`);
console.log(
  `   ใหม่: ${fileName} · ${bytes.length} bytes · อาร์ตบอร์ด ${r1(info.widthMm)}×${r1(info.heightMm)} มม. · พรีวิว ${info.px[0]}×${info.px[1]} px @${info.dpi} DPI · ` +
    `เส้นตัด ${box ? `${box.w.toFixed(1)}×${box.h.toFixed(1)} มม. @(${box.x.toFixed(1)},${box.y.toFixed(1)})` : "-"} (${via})`,
);
console.log(`   คงไว้: id ${old.id} · เงื่อนไข ${JSON.stringify(old.when ?? null)} · ตัวเลือก ${JSON.stringify(old.choice ?? null)}`);
if (!WRITE) {
  console.log(`\n(dry-run — พรีวิวอยู่ที่ ${png} · ใส่ --write เพื่ออัปและบันทึก)`);
  process.exit(0);
}

/* ── อัป + บันทึก ── */
async function upload(local: Buffer, kind: "file" | "preview", stem: string, e: string): Promise<string> {
  const ct = e === "png" ? "image/png" : e === "pdf" ? "application/pdf" : "application/postscript";
  const safe = stem.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 50) || "template";
  const path = `${kind}/${randomUUID().slice(0, 8)}-${safe}.${e}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, local, { contentType: ct, upsert: false });
  if (error) die(`อัป ${kind}: ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
const stem = fileName.replace(/\.[^.]+$/, "");
const fileUrl = await upload(bytes, "file", stem, ext);
const previewUrl = await upload(readFileSync(png), "preview", `${stem}-preview`, "png");
const pathOf = (u?: string) => (u ? u.split(`/${BUCKET}/`)[1] : undefined);
const retired = [...new Set([...(t.retiredPaths ?? []), pathOf(old.fileUrl), pathOf(old.previewUrl)].filter(Boolean) as string[])];
const next: TemplateFile = {
  ...old,
  fileUrl,
  fileName,
  fileSize: bytes.length,
  previewUrl,
  widthMm: r1(info.widthMm),
  heightMm: r1(info.heightMm),
  cutCurves: cut!,
  // 📏 ขนาดหน้างานจริง (วงใน) — หัวจอออกแบบ/สเปคออเดอร์ใช้แทนขนาดอาร์ตบอร์ด
  ...(fbox ? { finishedMm: { w: r1(fbox.w), h: r1(fbox.h) } } : {}),
};
const { error } = await sb
  .from("products")
  .update({ data: { ...t, files: [next], retiredPaths: retired, savedAt: new Date().toISOString() } })
  .eq("id", row!.id);
if (error) die(`บันทึกชุดไม่สำเร็จ: ${error.message}`);
console.log(`   ✅ เปลี่ยนไฟล์แล้ว → ${fileUrl.split("/").pop()} · พรีวิว ${previewUrl.split("/").pop()} · ไฟล์เก่าเก็บใน retiredPaths (${retired.length})`);
// ⏱️ หน้าสินค้าที่ผูกชุดนี้ถือไฟล์เก่าในแคช 1 ชม. (เคยทำให้ .ai ที่โหลดจากเว็บจริงยังเป็นไฟล์เดิม) — ล้างทันที
await revalidateLive(env, { templateIds: [SET] });
