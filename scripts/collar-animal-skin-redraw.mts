/**
 * ✏️ ปลอกคอสัตว์เลี้ยง: วาดสกินจอออกแบบ 15 ชุดใหม่จากเส้นเวกเตอร์ในไฟล์ .ai — เส้นประชัด ไม่ขาดช่วง
 * (23 ต.ค. 69 เจ้าของร้านแจ้ง "เส้นปะมันควรชัด" ชี้จอ Dog S — สกินที่ล้างขีดแดง (collar-animal-skin-clear.mts) เส้นประจางและขาดช่วง)
 *
 *   npx tsx scripts/collar-animal-skin-redraw.mts            # ดูผล (สกินใหม่อยู่ใน $TMPDIR/collar-animal-skin-redraw/)
 *   npx tsx scripts/collar-animal-skin-redraw.mts --write    # อัป + แทน skinUrl
 *
 * ต่อไฟล์: โหลด .ai ของชุด + อ่านขนาดพิกเซลสกินเดิม → scripts/py/skin-from-strokes.py (นอกเส้นตัดขาว · ในโปร่ง · เส้นหนา/เข้ม)
 *   → อัปสกินใหม่ขนาดเท่าเดิม · สกินเก่าเก็บ retiredPaths · รันซ้ำ = วาดใหม่ทุกครั้ง
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { DesignTemplate, TemplateFile } from "../src/lib/design-templates";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const CATEGORY = "ปลอกคอสัตว์เลี้ยง";
const PRODUCT = "collar-animal";
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
const PY_SKIN = new URL("./py/skin-from-strokes.py", import.meta.url).pathname;
const OUT = `${process.env.TMPDIR ?? "/tmp"}/collar-animal-skin-redraw/`;
mkdirSync(OUT, { recursive: true });
const pathOf = (u?: string) => (u ? u.split(`/${BUCKET}/`)[1] : undefined);
const fetchBuf = async (u: string) => {
  const res = await fetch(u);
  if (!res.ok) die(`โหลด ${u}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};

type Row = { id: string; data: DesignTemplate & { retiredPaths?: string[] } };
const { data: rows, error } = await sb.from("products").select("id,data").eq("category", "__templates__").like("id", "__template_tpl-%");
if (error) die(error.message);
const sets = ((rows ?? []) as Row[]).filter((r) => (r.data.category ?? "") === CATEGORY).sort((a, b) => (a.data.sort ?? 0) - (b.data.sort ?? 0));
if (!sets.length) die(`ไม่มีชุดหมวด "${CATEGORY}"`);
const touched: string[] = [];
for (const row of sets) {
  const files = row.data.files ?? [];
  if (files.length !== 1) die(`ชุด "${row.data.name}" มี ${files.length} ไฟล์`);
  const f = files[0];
  const oldPath = pathOf(f.skinUrl);
  if (!oldPath || !f.fileUrl) die(`ชุด "${row.data.name}" ไม่มีสกิน/ไฟล์`);
  const skin = await fetchBuf(f.skinUrl!);
  if (skin.toString("ascii", 12, 16) !== "IHDR") die(`สกิน ${row.data.name} ไม่ใช่ PNG`);
  const [w, h] = [skin.readUInt32BE(16), skin.readUInt32BE(20)];
  const ai = `${OUT}${row.data.id}.ai`;
  const outPng = `${OUT}${row.data.id}-skin.png`;
  writeFileSync(ai, await fetchBuf(f.fileUrl!));
  let info: { px: [number, number]; lineMm: number; strokes: number; dots: number };
  try {
    info = JSON.parse(execFileSync(PYTHON, ["-I", PY_SKIN, ai, outPng, String(w), String(h)], { encoding: "utf8" }).trim());
  } catch {
    die(`ชุด "${row.data.name}": วาดสกินไม่ได้`);
  }
  console.log(`✎ ${row.data.name} (${row.data.id}) · สกิน ${w}×${h} · เส้นหนา ${info!.lineMm} มม. · ${info!.strokes} เส้น · จุด ${info!.dots}`);
  if (!WRITE) continue;
  const dir = oldPath!.split("/").slice(0, -1).join("/");
  const stem = (oldPath!.split("/").pop() ?? "skin").replace(/^[0-9a-f]{8}-/, "").replace(/(-clean)?\.png$/i, "");
  const path = `${dir}/${randomUUID().slice(0, 8)}-${stem}-line.png`;
  const { error: uerr } = await sb.storage.from(BUCKET).upload(path, readFileSync(outPng), { contentType: "image/png", upsert: false });
  if (uerr) die(`อัปสกิน ${row.data.name}: ${uerr.message}`);
  const nf: TemplateFile = { ...f, skinUrl: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
  const retired = [...new Set([...(row.data.retiredPaths ?? []), oldPath!])];
  const { error: werr } = await sb
    .from("products")
    .update({ data: { ...row.data, files: [nf], retiredPaths: retired, savedAt: new Date().toISOString() } })
    .eq("id", row.id);
  if (werr) die(`บันทึก ${row.data.id}: ${werr.message}`);
  touched.push(row.data.id);
  console.log(`   ✅ ${path}`);
}
if (!WRITE) console.log(`\n(dry-run — สกินใหม่อยู่ที่ ${OUT} · ใส่ --write เพื่ออัปและบันทึก)`);
else if (touched.length) await revalidateLive(env, { productIds: [PRODUCT], templateIds: touched });
