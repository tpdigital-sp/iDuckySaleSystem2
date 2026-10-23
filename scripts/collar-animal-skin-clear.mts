/**
 * 🧽 ปลอกคอสัตว์เลี้ยง: เอาลายทแยงแดงออกจากสกินจอออกแบบ 15 ชุดหมวด "ปลอกคอสัตว์เลี้ยง"
 * (23 ต.ค. 69 เจ้าของร้านสั่ง "ไม่ต้องมีเส้นขีดๆสีแดงๆ" ชี้จอ Dog S — ขีดแดงอยู่ในรูปสกิน ไม่ใช่ของระบบ)
 *
 *   npx tsx scripts/collar-animal-skin-clear.mts            # ดูผล (สกินใหม่อยู่ใน $TMPDIR/collar-animal-skin-clear/)
 *   npx tsx scripts/collar-animal-skin-clear.mts --write    # อัป + แทน skinUrl
 *
 * ต่อไฟล์: โหลดสกินเดิม → scripts/py/skin-clear-red.py (ขีดแดง + วงขอบขาวที่ต่อกับหน้างาน → โปร่ง · เส้นตัด/เส้นประคงไว้)
 *   → อัปเป็นสกินใหม่ · สกินเก่าเก็บ retiredPaths · สกินที่ไม่มีพิกเซลแดงแล้ว = ข้าม (รันซ้ำได้)
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
const PY_CLEAR = new URL("./py/skin-clear-red.py", import.meta.url).pathname;
const OUT = `${process.env.TMPDIR ?? "/tmp"}/collar-animal-skin-clear/`;
mkdirSync(OUT, { recursive: true });
const pathOf = (u?: string) => (u ? u.split(`/${BUCKET}/`)[1] : undefined);

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
  if (!oldPath) die(`ชุด "${row.data.name}" ไม่มีสกิน`);
  const res = await fetch(f.skinUrl!);
  if (!res.ok) die(`โหลดสกิน ${row.data.name}: ${res.status}`);
  const inPng = `${OUT}${row.data.id}-old.png`;
  const outPng = `${OUT}${row.data.id}-clean.png`;
  writeFileSync(inPng, Buffer.from(await res.arrayBuffer()));
  let info: { px: [number, number]; redPx: number; clearedPx: number };
  try {
    info = JSON.parse(execFileSync(PYTHON, ["-I", PY_CLEAR, inPng, outPng], { encoding: "utf8" }).trim());
  } catch {
    die(`ชุด "${row.data.name}": ล้างสกินไม่ได้ (เส้นตัดรั่ว?)`);
  }
  if (!info!.redPx) {
    console.log(`✓ ${row.data.name}: สกินไม่มีขีดแดงแล้ว — ข้าม`);
    continue;
  }
  console.log(`✎ ${row.data.name} (${row.data.id}) · สกิน ${info!.px.join("×")} · ขีดแดง ${info!.redPx.toLocaleString()} px · ทำโปร่ง ${info!.clearedPx.toLocaleString()} px`);
  if (!WRITE) continue;
  const dir = oldPath!.split("/").slice(0, -1).join("/");
  const stem = (oldPath!.split("/").pop() ?? "skin").replace(/^[0-9a-f]{8}-/, "").replace(/\.png$/i, "");
  const path = `${dir}/${randomUUID().slice(0, 8)}-${stem}-clean.png`;
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
