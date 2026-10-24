/**
 * 🪪🔁 ชุด "Card PVC (2ด้าน)" tpl-7rret45rw: แทนไฟล์เก่า (12 ส.ค.) ด้วย .ai จาก NAS
 * (เจ้าของร้านสั่ง 24 ต.ค. 69 "ใส่ไฟล์ Card PVC (สกรีน2ด้าน).ai ในชุด 2 ด้าน ด้วย")
 *
 *   npx tsx scripts/photocard-pvc-2side-replace.mts            # ดูผล
 *   npx tsx scripts/photocard-pvc-2side-replace.mts --write    # อัป + บันทึก (ไฟล์เดิมทุกไบต์ = ข้าม)
 *
 * ไฟล์ NAS 2 อาร์ตบอร์ด 54.9×86.6 (เลเยอร์ หน้า/หลัง) · คง id ชุด/ไฟล์ · ไฟล์เก่าเก็บใน retiredPaths
 * ชุดนี้ไม่ได้ผูกสินค้า (โฟโต้การ์ด PVC ใช้ชุด Card PVC + tpl2 — ดู photocard-pvc-template-link.mts)
 */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { DesignTemplate, TemplateFile } from "../src/lib/design-templates";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const TPL = "tpl-7rret45rw";
const SRC = "/Volumes/iDuckyShop/All Template/24 Card Holder - Card PVC/Card PVC (สกรีน2ด้าน).ai";
const NAME = "Card PVC (สกรีน2ด้าน).ai";
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
const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");
const pathOf = (u?: string) => (u ? u.split(`/${BUCKET}/`)[1] : undefined);

const info = JSON.parse(
  execFileSync(PYTHON, ["-I", "-c", `import fitz,json,sys
d=fitz.open(sys.argv[1]); r=d[0].rect
print(json.dumps({"pages":d.page_count,"w":round(r.width*25.4/72,1),"h":round(r.height*25.4/72,1),"layers":[c["text"] for c in d.layer_ui_configs()]}))`, SRC], { encoding: "utf8" }),
) as { pages: number; w: number; h: number; layers: string[] };
if (info.pages !== 2) die(`คาด 2 อาร์ตบอร์ด (หน้า/หลัง) ได้ ${info.pages}`);

type Row = { id: string; data: DesignTemplate & { retiredPaths?: string[] } };
const { data: row } = await sb.from("products").select("id,data").eq("id", `__template_${TPL}`).single();
const t = ((row as Row | null) ?? die(`ไม่พบชุด ${TPL}`)).data;
if ((t.files?.length ?? 0) !== 1) die(`ชุด "${t.name}" มี ${t.files?.length} ไฟล์`);
const old = t.files![0];
const bytes = readFileSync(SRC);
if (old.fileUrl && md5(Buffer.from(await (await fetch(old.fileUrl)).arrayBuffer())) === md5(bytes)) {
  console.log(`✓ ชุด "${t.name}" ใช้ไฟล์นี้อยู่แล้ว`);
  process.exit(0);
}
console.log(
  `🔁 "${t.name}" (${TPL}) · ${old.fileName} ${old.fileSize?.toLocaleString()} bytes ${old.widthMm}×${old.heightMm}` +
    `\n   → ${NAME} ${bytes.length.toLocaleString()} bytes ${info.w}×${info.h} · ${info.pages} อาร์ตบอร์ด · เลเยอร์ ${info.layers.join(" / ")}`,
);
if (!WRITE) {
  console.log("\n(dry-run — ใส่ --write เพื่ออัปและบันทึก)");
  process.exit(0);
}
const path = `file/${randomUUID().slice(0, 8)}-Card-PVC-2side.ai`;
const { error: ue } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: "application/postscript", upsert: false });
if (ue) die(`อัปไฟล์: ${ue.message}`);
const nf: TemplateFile = { ...old, fileUrl: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, fileName: NAME, fileSize: bytes.length, widthMm: info.w, heightMm: info.h };
const retired = [...new Set([...(t.retiredPaths ?? []), pathOf(old.fileUrl), pathOf(old.previewUrl)].filter(Boolean) as string[])];
const { error } = await sb
  .from("products")
  .update({ data: { ...t, files: [nf], retiredPaths: retired, savedAt: new Date().toISOString() } })
  .eq("id", `__template_${TPL}`);
if (error) die(`บันทึก: ${error.message}`);
console.log(`   ✅ แทนแล้ว → ${path} · retiredPaths ${retired.length}`);
await revalidateLive(env, { templateIds: [TPL] });
