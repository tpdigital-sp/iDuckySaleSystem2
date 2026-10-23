/**
 * 🔁👛 กระเป๋าต๊อบแต๊บ: แทนไฟล์ .ai 4 ชุดหมวด "Clip Pouch" ด้วยไฟล์ใหม่จาก NAS
 * (เจ้าของร้านสั่ง 23 ต.ค. 69 "เทมเพลตตามนี้ นำไปแทนที่ให้หน่อย" — 6. กระเป๋า/11.4 Wallet+Clip pouch/Clip Pouch <ขนาด> cm -.ai)
 *
 *   npx tsx scripts/clip-pouch-template-replace.mts            # ดูผล + สกินใน $TMPDIR/clip-pouch-replace/
 *   npx tsx scripts/clip-pouch-template-replace.mts --write    # อัป + บันทึก (รันซ้ำได้ ไฟล์เดิมทุกไบต์ = ข้าม)
 *   แล้วรัน scripts/clip-pouch-template-link.mts --write (เส้นตัด = ขอบอาร์ตบอร์ดใหม่)
 *   --src <โฟลเดอร์>   ใช้ไฟล์ชื่อเดียวกันจากโฟลเดอร์นี้แทน NAS (ไม่มี = ใช้ไฟล์ NAS)
 *
 * 🧹 ลบเลเยอร์ "ex" ออกจากไฟล์ที่ลูกค้าโหลด (เจ้าของร้านสั่ง 23 ต.ค. 69 · NAS ไม่แตะ): สำเนา 3 ไฟล์ → Illustrator (osascript jsx)
 *   layers["ex"].remove() → saveAs pdfCompatible แล้วรันสคริปต์นี้ --src <สำเนา> --write
 *   ⚠️ เครื่องนี้ไม่มีฟอนต์ TH SarabunPSK — บันทึกจาก Illustrator ตรง ๆ ป้ายไทยในส่วน PDF กลายเป็นกล่อง ☒ (Quick Look/pymupdf)
 *     → ใน jsx เปลี่ยนป้าย 6 อันเป็น Thonburi ขนาด ×0.72 ก่อนบันทึก (ปลดล็อก/เปิดเลเยอร์ชั่วคราว ไม่งั้น Error 8705)
 *
 * ไฟล์ใหม่: อาร์ตบอร์ด = ขอบผ้าทั้งผืน (แถบเทา = ตะเข็บ) ชื่อตรงค่าตัวเลือกแล้ว (9.5x9 / 11.5x10 / 14.5x10 / 17.5x14.5)
 * ⚠️ 3 ไฟล์ (11.5/14.5/17.5) เลเยอร์ "ex" = ลายตัวอย่างเป็ดลายทาง เปิดค้าง · 9.5x9 เลเยอร์ "template" ปิดอยู่
 *   → สกิน = เรนเดอร์เฉพาะ template/print/Layer 5/Layer 9 (ปิด ex/Layer 8) · ไฟล์ .ai ที่ลูกค้าโหลดยังเหมือนบน NAS
 * คง id ชุด/ไฟล์ + when · ไม่มี previewUrl (แบบเดิม) · ไฟล์/สกินเก่าเก็บ retiredPaths
 */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { DesignTemplate, TemplateFile } from "../src/lib/design-templates";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const SRC = process.argv.includes("--src") ? process.argv[process.argv.indexOf("--src") + 1] : "";
const DIR = "/Volumes/iDuckyShop/All Template/6. กระเป๋า/11.4 Wallet+Clip pouch";
const PAIRS = [
  { tpl: "tpl-9y3ijde49", file: "Clip Pouch 9.5x9 cm -.ai", name: "Clip Pouch 9.5x9" },
  { tpl: "tpl-cr356eoli", file: "Clip Pouch 11.5x10 cm -.ai", name: "Clip Pouch 11.5x10" },
  { tpl: "tpl-557hwfobs", file: "Clip Pouch 14.5x10 cm -.ai", name: "Clip Pouch 14.5x10" },
  { tpl: "tpl-vk1t9fnp3", file: "Clip Pouch 17.5x14.5 cm -.ai", name: "Clip Pouch 17.5x14.5" },
];
const SKIN_LAYERS = ["template", "print", "Layer 5", "Layer 9"];
const die = (m: string): never => {
  console.error("✗", m);
  process.exit(1);
};
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
const OUT = `${process.env.TMPDIR ?? "/tmp"}/clip-pouch-replace/`;
mkdirSync(OUT, { recursive: true });
const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");
const pathOf = (u?: string) => (u ? u.split(`/${BUCKET}/`)[1] : undefined);
async function upload(buf: Buffer, kind: "file" | "preview", stem: string, e: string) {
  const path = `${kind}/${randomUUID().slice(0, 8)}-${stem.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")}.${e}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: e === "png" ? "image/png" : "application/postscript", upsert: false });
  if (error) die(`อัป ${path}: ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
/** สกิน 300 dpi เฉพาะเลเยอร์ไกด์ (ปิดลายตัวอย่าง) → { widthMm, heightMm } */
function renderSkin(src: string, out: string): { widthMm: number; heightMm: number } {
  const py = `
import fitz, json, sys
d = fitz.open(sys.argv[1]); keep = set(sys.argv[3].split("|")); names = []
for c in d.layer_ui_configs():
    names.append(c["text"]); d.set_layer_ui_config(c["number"], action=0 if c["text"] in keep else 2)
p = d[0]; p.get_pixmap(matrix=fitz.Matrix(300 / 72, 300 / 72), alpha=False).save(sys.argv[2])
print(json.dumps({"widthMm": round(p.rect.width * 25.4 / 72, 2), "heightMm": round(p.rect.height * 25.4 / 72, 2), "layers": names}))`;
  const r = JSON.parse(execFileSync(PYTHON, ["-I", "-c", py, src, out, SKIN_LAYERS.join("|")], { encoding: "utf8" })) as { widthMm: number; heightMm: number; layers: string[] };
  if (!r.layers.includes("template")) die(`${src}: ไม่มีเลเยอร์ template (${r.layers.join(", ")})`);
  return r;
}

type Row = { id: string; data: DesignTemplate & { retiredPaths?: string[] } };
for (const p of PAIRS) {
  const { data: row } = await sb.from("products").select("id,data").eq("id", `__template_${p.tpl}`).single();
  const t = ((row as Row | null) ?? die(`ไม่พบชุด ${p.tpl}`)).data;
  const files = t.files ?? [];
  if (files.length !== 1) die(`ชุด "${t.name}" มี ${files.length} ไฟล์`);
  const old = files[0];
  const src = SRC && existsSync(`${SRC}/${p.file}`) ? `${SRC}/${p.file}` : `${DIR}/${p.file}`;
  const bytes = readFileSync(src);
  const same = old.fileUrl ? md5(Buffer.from(await (await fetch(old.fileUrl)).arrayBuffer())) === md5(bytes) : false;
  if (same && t.name === p.name) {
    console.log(`   ✓ ${t.name} ใช้ไฟล์นี้อยู่แล้ว`);
    continue;
  }
  const skin = `${OUT}${p.tpl}-skin.png`;
  const r = renderSkin(src, skin);
  console.log(`   ✎ "${t.name}" → "${p.name}"${src.startsWith(DIR) ? "" : " (สำเนาลบ ex)"} · ${old.fileName} ${old.widthMm}×${old.heightMm} → ${p.file} ${r.widthMm}×${r.heightMm} มม. · สกิน ${skin}`);
  if (!WRITE) continue;
  const fileUrl = same ? old.fileUrl! : await upload(bytes, "file", p.name, "ai");
  const skinUrl = await upload(readFileSync(skin), "preview", `${p.name}-skin`, "png");
  const { cutCurves: _c, previewUrl: _p, finishedMm: _f, ...base } = old;
  const nf: TemplateFile = { ...base, fileUrl, fileName: p.file, fileSize: bytes.length, widthMm: r.widthMm, heightMm: r.heightMm, skinUrl };
  const retired = [...new Set([...(t.retiredPaths ?? []), pathOf(old.fileUrl), pathOf(old.skinUrl), pathOf(old.previewUrl)].filter((x) => x && x !== pathOf(fileUrl)) as string[])];
  const { error } = await sb
    .from("products")
    .update({ data: { ...t, name: p.name, files: [nf], retiredPaths: retired, savedAt: new Date().toISOString() } })
    .eq("id", `__template_${p.tpl}`);
  if (error) die(`บันทึก ${p.tpl}: ${error.message}`);
  console.log(`     ✅ บันทึกแล้ว · retiredPaths ${retired.length}`);
}
if (!WRITE) console.log("\n(dry-run — ใส่ --write เพื่ออัปและบันทึก)");
else await revalidateLive(env, { productIds: ["clip-pouch"], templateIds: PAIRS.map((p) => p.tpl) });
