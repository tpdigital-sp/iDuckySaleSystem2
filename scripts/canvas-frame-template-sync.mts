/**
 * 🖼🪵 กรอบรูปแคนวาส: ซิงก์โฟลเดอร์ .ai บน NAS (14.CanvasFrame) → ชุดเทมเพลตหมวด "กรอบรูปแคนวาส" จับคู่ตาม "ขนาด AxB" ไม่ใช่ชื่อไฟล์
 * (22 ต.ค. 69 เจ้าของร้านสั่ง "นำเทมเพลตนี้ไปแทนที่และไปเพิ่มไซส์ที่ยังไม่มี" — ชุดเดิมชื่อ "CanvasFrame 40x60" แต่ไฟล์ชื่อ "CanvasFrame40x60 -.ai"
 *  template-folder-sync.mts จับคู่ด้วยชื่อเลยไม่เจอ → ตัวนี้ดึงเลข "กว้างxสูง" มาเทียบแทน · ชุดใหม่ตั้งชื่อ "CanvasFrame 30x40" ให้เข้าชุดเดิม)
 *
 *   npx tsx scripts/canvas-frame-template-sync.mts --dir "/Volumes/iDuckyShop/All Template/14.CanvasFrame"            # ดูผล
 *   npx tsx scripts/canvas-frame-template-sync.mts --dir "..." --write                                                # อัป + บันทึก
 *   --category กรอบรูปแคนวาส   หมวดชุด (ค่าเริ่มต้น)  · --prefix CanvasFrame  ชื่อชุดใหม่ = "<prefix> <กว้าง>x<สูง>"
 *   --hide "ไฟล์=เลเยอร์,เลเยอร์;ไฟล์=…"  เลเยอร์ที่ปิดก่อนเรนเดอร์พรีวิว เฉพาะไฟล์ (ไฟล์ร้านบางตัวมีลายตัวอย่างเปิดค้าง)
 *        ค่าเริ่มต้น "CanvasFrame50x70 -=Layer 4" (ลายแมวตัวอย่าง 16 MB) · ไฟล์อื่นเปิดทุกเลเยอร์ (ชื่อเลเยอร์ไทย "วางให้เต็ม"/"งานจริงอยู่ในกรอบสีแดง")
 *   --skip "ไฟล์;ไฟล์"   ข้ามไฟล์ (ชื่อไม่เอานามสกุล)
 *
 * ⚠️ CanvasFrame30x40 -.ai บน NAS หนัก 76 MB (เลเยอร์ "Ex." ที่ปิดอยู่ฝังรูปตัวอย่าง 36 MB) เกินลิมิต storage 50 MB/ก้อน
 *   → ทำสำเนาแล้วให้ Illustrator ลบเลเยอร์ Ex. (osascript jsx: app.open → layers["Ex."].remove() → saveAs pdfCompatible · เหลือ 352 KB)
 *     เก็บใน <scratch>/slim30x40/CanvasFrame30x40 -.ai แล้วรันสคริปต์นี้ --dir <scratch>/slim30x40 · รอบ NAS ใส่ --skip "CanvasFrame30x40 -"
 *     ไฟล์บน NAS ไม่แตะ (ตั้งใจเก็บลายตัวอย่างไว้ให้ร้านเอง)
 *
 * ทำอะไร: เหมือน template-folder-sync.mts — แทน fileUrl/fileName/fileSize/widthMm/heightMm/previewUrl ของชุดที่ขนาดตรงกัน
 *   คง id ชุด/id ไฟล์/when/choice/skinUrl · ไฟล์+พรีวิวเก่าเก็บ retiredPaths · ไฟล์เหมือนเดิมทุกไบต์ = ข้าม · ขนาดที่ไม่มีชุด → สร้างใหม่ (sort ต่อท้ายหมวด)
 * ด่าน: ชื่อไฟล์ต้องมี "AxB" · ขนาดเดียวห้ามมีหลายชุดในหมวด · ชุดต้องมีไฟล์เดียว
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
const DIR = arg("--dir", "/Volumes/iDuckyShop/All Template/14.CanvasFrame");
const CATEGORY = arg("--category", "กรอบรูปแคนวาส");
const PREFIX = arg("--prefix", "CanvasFrame");
const SKIP = new Set(arg("--skip", "").split(";").map((s) => s.trim()).filter(Boolean));
const HIDE = new Map<string, string[]>();
for (const part of arg("--hide", "CanvasFrame50x70 -=Layer 4").split(";")) {
  const [f, ls] = part.split("=");
  if (f && ls) HIDE.set(f.trim(), ls.split(",").map((s) => s.trim()).filter(Boolean));
}
const die = (m: string): never => {
  console.error("✗", m);
  process.exit(1);
};
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
const PY_LAYERS = `import fitz,json,sys;print(json.dumps([c["text"] for c in fitz.open(sys.argv[1]).layer_ui_configs()]))`;
const OUT = `${process.env.TMPDIR ?? "/tmp"}/canvas-frame-template-sync/`;
mkdirSync(OUT, { recursive: true });

type Row = { id: string; data: DesignTemplate & { retiredPaths?: string[] } };
const { data: rows, error } = await sb.from("products").select("id,data").eq("category", "__templates__").like("id", "__template_tpl-%");
if (error) die(error.message);
const all = (rows ?? []) as Row[];
const inCat = all.filter((r) => (r.data.category ?? "") === CATEGORY);
const sizeOf = (s: string): string | undefined => {
  const m = s.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
  return m ? `${Number(m[1])}x${Number(m[2])}` : undefined;
};
const bySize = new Map<string, Row>();
for (const r of inCat) {
  const k = sizeOf(r.data.name);
  if (!k) continue;
  if (bySize.has(k)) die(`ขนาด ${k} มีหลายชุดในหมวด: "${bySize.get(k)!.data.name}" และ "${r.data.name}"`);
  bySize.set(k, r);
}
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
  if (error) die(`อัป ${kind} (${(local.length / 1e6).toFixed(1)} MB): ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

const files = readdirSync(DIR).filter((f) => /\.(ai|pdf)$/i.test(f) && !f.startsWith(".")).sort((a, b) => a.localeCompare(b, "th"));
if (!files.length) die(`ไม่มีไฟล์ .ai/.pdf ใน ${DIR}`);
console.log(`📁 ${DIR} · ${files.length} ไฟล์ → หมวด "${CATEGORY}" (มี ${inCat.length} ชุด: ${[...bySize.keys()].join(", ") || "-"})`);
const touched: string[] = [];
let added = 0;
for (const fileName of files) {
  const full = `${DIR}/${fileName}`;
  const stem = fileName.replace(/\.[^.]+$/, "");
  if (SKIP.has(stem)) {
    console.log(`⏭ ${fileName}: ข้ามตาม --skip`);
    continue;
  }
  const size = sizeOf(stem);
  if (!size) {
    console.log(`⚠️ ${fileName}: อ่านขนาด AxB จากชื่อไม่ได้ — ข้าม`);
    continue;
  }
  const bytes = readFileSync(full);
  const ext = fileName.toLowerCase().endsWith(".pdf") ? "pdf" : "ai";
  const hit = bySize.get(size);
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
  const layers = JSON.parse(execFileSync(PYTHON, ["-I", "-c", PY_LAYERS, full], { encoding: "utf8" }).trim()) as string[];
  const hide = HIDE.get(stem) ?? [];
  const keep = hide.length ? layers.filter((l) => !hide.includes(l)).join(",") : "";
  const png = `${OUT}${stem.replace(/[^\p{L}\p{N}._-]+/gu, "_")}-preview.png`;
  const info = JSON.parse(execFileSync(PYTHON, ["-I", PY_PREVIEW, full, png, "600", "2000", keep], { encoding: "utf8" }).trim()) as {
    widthMm: number;
    heightMm: number;
    px: [number, number];
    dpi: number;
    hiddenLayers: string[];
  };
  const name = `${PREFIX} ${size}`;
  console.log(hit ? `🔁 แทนไฟล์ในชุด "${hit.data.name}" (${hit.data.id})` : `➕ ชุดใหม่ "${name}"`);
  console.log(
    `   ${fileName} · ${bytes.length.toLocaleString()} bytes · อาร์ตบอร์ด ${r1(info.widthMm)}×${r1(info.heightMm)} มม. · พรีวิว ${info.px[0]}×${info.px[1]} px` +
      ` · เลเยอร์: ${layers.join(", ")}` +
      (info.hiddenLayers.length ? ` · ซ่อนในพรีวิว: ${info.hiddenLayers.join(", ")}` : ""),
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
    const data = { ...hit.data, previewUrl, files: [nextFile], retiredPaths: retired, savedAt: new Date().toISOString() };
    const { error } = await sb.from("products").update({ data }).eq("id", hit.id);
    if (error) die(`บันทึกชุด ${hit.data.id}: ${error.message}`);
    touched.push(hit.data.id);
    console.log(`   ✅ แทนแล้ว → ${fileUrl.split("/").pop()} · ไฟล์เก่าเก็บใน retiredPaths (${retired.length})`);
  } else {
    const t: DesignTemplate = { id: rid("tpl"), name, category: CATEGORY, previewUrl, sort: maxSort + 1 + added++, files: [nextFile], savedAt: new Date().toISOString() };
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
