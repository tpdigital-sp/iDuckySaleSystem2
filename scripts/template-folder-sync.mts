/**
 * 📁 ซิงก์โฟลเดอร์ .ai บน NAS → ชุดเทมเพลตในหมวดเดียวกัน (ชุดละไฟล์เดียว · ชื่อชุด = ชื่อไฟล์ไม่เอานามสกุล)
 * (21 ต.ค. 69 เจ้าของร้านสั่งอัปเดตผ้าหนึบ: S/M/L มีชุดอยู่แล้ว → แทนไฟล์ · XL/XXL ยังไม่มี → สร้างชุดใหม่)
 *
 *   npx tsx scripts/template-folder-sync.mts --dir "/Volumes/.../ผ้าหนึบ" --category ผ้าหนึบ            # ดูผล
 *   npx tsx scripts/template-folder-sync.mts --dir "..." --category ผ้าหนึบ --write                     # อัป + บันทึก
 *   --keep-layers Print,Details   เลเยอร์ที่ให้เห็นในพรีวิว (ไฟล์ร้านมักมีเลเยอร์ตัวอย่างลายเปิดค้าง) · ค่าเริ่มต้น Print,Details
 *
 * จับคู่ชุดเดิมจากชื่อ (ตัดช่องว่างท้าย/นามสกุล) ในหมวดนั้น → แทน fileUrl/fileName/fileSize/widthMm/heightMm/previewUrl
 *   คง id ชุด/id ไฟล์/when/choice/skinUrl · ไฟล์+พรีวิวเก่าเก็บใน retiredPaths (ไม่ลบทันที) · ไฟล์เหมือนเดิมทุกไบต์ = ข้าม
 * ไม่เจอชุด → สร้างใหม่ในหมวด (sort ต่อท้าย) · ไม่แตะ cutCurves (ผ้าไม่มีเส้นไดคัท — ชุดที่ต้องการเส้นตัดใช้ template-file-replace.mts)
 */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { DesignTemplate, TemplateFile } from "../src/lib/design-templates";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const arg = (k: string, d = "") => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const DIR = arg("--dir");
const CATEGORY = arg("--category");
const KEEP = arg("--keep-layers", "Print,Details");
const die = (m: string): never => {
  console.error("✗", m);
  process.exit(1);
};
if (!DIR || !CATEGORY) die('ใส่ --dir "<โฟลเดอร์>" --category <หมวด>');
statSync(DIR);
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
const OUT = `${process.env.TMPDIR ?? "/tmp"}/template-folder-sync/`;
mkdirSync(OUT, { recursive: true });

type Row = { id: string; data: DesignTemplate & { retiredPaths?: string[] } };
const { data: rows, error } = await sb.from("products").select("id,data").eq("category", "__templates__").like("id", "__template_tpl-%");
if (error) die(error.message);
const all = (rows ?? []) as Row[];
const inCat = all.filter((r) => (r.data.category ?? "") === CATEGORY);
const norm = (s: string) => s.normalize("NFC").replace(/\.[^.]+$/, "").replace(/\s+/g, " ").trim();
const maxSort = Math.max(-1, ...all.map((r) => r.data.sort ?? -1));
const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");
const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 11)}`;
const r1 = (v: number) => Math.round(v * 10) / 10;
const pathOf = (u?: string) => (u ? u.split(`/${BUCKET}/`)[1] : undefined);

async function upload(local: Buffer, kind: "file" | "preview", stem: string, ext: string): Promise<string> {
  const ct = ext === "png" ? "image/png" : ext === "pdf" ? "application/pdf" : "application/postscript";
  const safe = stem.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 50) || "template";
  const path = `${kind}/${randomUUID().slice(0, 8)}-${safe}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, local, { contentType: ct, upsert: false });
  if (error) die(`อัป ${kind}: ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

const files = readdirSync(DIR).filter((f) => /\.(ai|pdf)$/i.test(f) && !f.startsWith(".")).sort((a, b) => a.localeCompare(b, "th"));
if (!files.length) die(`ไม่มีไฟล์ .ai/.pdf ใน ${DIR}`);
console.log(`📁 ${DIR} · ${files.length} ไฟล์ → หมวด "${CATEGORY}" (มี ${inCat.length} ชุด)`);
const touched: string[] = [];
let added = 0;
for (const fileName of files) {
  const full = `${DIR}/${fileName}`;
  const bytes = readFileSync(full);
  const ext = fileName.toLowerCase().endsWith(".pdf") ? "pdf" : "ai";
  const stem = norm(fileName);
  const hit = inCat.find((r) => norm(r.data.name) === stem);
  const old = hit?.data.files?.[0];
  if (hit && (hit.data.files?.length ?? 0) !== 1) {
    console.log(`⚠️ ${fileName}: ชุด "${hit.data.name}" มี ${hit.data.files?.length} ไฟล์ — ข้าม (รองรับชุดละไฟล์เดียว)`);
    continue;
  }
  if (old?.fileUrl) {
    const res = await fetch(old.fileUrl);
    if (res.ok && md5(Buffer.from(await res.arrayBuffer())) === md5(bytes)) {
      console.log(`✓ ${fileName}: ชุด "${hit!.data.name}" ใช้ไฟล์นี้อยู่แล้ว — ข้าม`);
      continue;
    }
  }
  const png = `${OUT}${stem.replace(/[^\p{L}\p{N}._-]+/gu, "_")}-preview.png`;
  const info = JSON.parse(execFileSync(PYTHON, ["-I", PY_PREVIEW, full, png, "600", "2000", KEEP], { encoding: "utf8" }).trim()) as {
    widthMm: number;
    heightMm: number;
    px: [number, number];
    dpi: number;
    hiddenLayers: string[];
  };
  const tag = hit ? `🔁 แทนไฟล์ในชุด "${hit.data.name}" (${hit.data.id})` : `➕ ชุดใหม่ "${stem}"`;
  console.log(`${tag}`);
  console.log(
    `   ${fileName} · ${bytes.length.toLocaleString()} bytes · อาร์ตบอร์ด ${r1(info.widthMm)}×${r1(info.heightMm)} มม. · พรีวิว ${info.px[0]}×${info.px[1]} px` +
      (info.hiddenLayers.length ? ` · ซ่อนเลเยอร์ในพรีวิว: ${info.hiddenLayers.join(", ")}` : ""),
  );
  if (old) console.log(`   เดิม: ${old.fileName} · ${old.fileSize?.toLocaleString() ?? "?"} bytes · ${old.widthMm}×${old.heightMm} มม.${old.skinUrl ? " · คงสกินเดิม" : ""}`);
  if (!WRITE) continue;

  const fileUrl = await upload(bytes, "file", stem, ext);
  const previewUrl = await upload(readFileSync(png), "preview", `${stem}-preview`, "png");
  const nextFile: TemplateFile = {
    ...(old ?? { id: rid("f") }),
    fileUrl,
    fileName,
    fileSize: bytes.length,
    previewUrl,
    widthMm: r1(info.widthMm),
    heightMm: r1(info.heightMm),
  };
  if (hit) {
    const retired = [...new Set([...(hit.data.retiredPaths ?? []), pathOf(old?.fileUrl), pathOf(old?.previewUrl)].filter(Boolean) as string[])];
    const data = { ...hit.data, files: [nextFile], retiredPaths: retired, savedAt: new Date().toISOString() };
    const { error } = await sb.from("products").update({ data }).eq("id", hit.id);
    if (error) die(`บันทึกชุด ${hit.data.id}: ${error.message}`);
    touched.push(hit.data.id);
    console.log(`   ✅ แทนแล้ว → ${fileUrl.split("/").pop()} · ไฟล์เก่าเก็บใน retiredPaths (${retired.length})`);
  } else {
    const t: DesignTemplate = { id: rid("tpl"), name: stem, category: CATEGORY, previewUrl, sort: maxSort + 1 + added++, files: [nextFile], savedAt: new Date().toISOString() };
    const { error } = await sb.from("products").upsert(
      { id: `__template_${t.id}`, name: `(เทมเพลต) ${t.name}`.slice(0, 120), category: "__templates__", price: 0, data: t },
      { onConflict: "id" },
    );
    if (error) die(`สร้างชุด ${t.name}: ${error.message}`);
    touched.push(t.id);
    console.log(`   ✅ สร้างชุด ${t.id} (sort ${t.sort})`);
  }
}
if (!WRITE) console.log(`\n(dry-run — พรีวิวอยู่ที่ ${OUT} · ใส่ --write เพื่ออัปและบันทึก)`);
else if (touched.length) await revalidateLive(env, { templateIds: touched });
