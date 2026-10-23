/**
 * 🖼🪵⬜ กรอบรูปแคนวาส: ตั้งรองขาว + ขนาดหน้างาน ให้ 6 ชุดหมวด "กรอบรูปแคนวาส" ก่อนเปิดออกแบบบนเว็บ
 * (23 ต.ค. 69 เจ้าของร้านสั่ง "เพิ่มการออกแบบบนเว็บ · มีเลเยอร์รองขาวด้วย" — ข้อ "ตำแหน่งงาน: ไม่เน้นตำแหน่ง" ติดมาจากผ้าขนหนู สินค้านี้มีแค่กลุ่ม "ขนาด")
 *
 *   npx tsx scripts/canvas-frame-studio.mts            # ดูผล
 *   npx tsx scripts/canvas-frame-studio.mts --write    # บันทึก (รันซ้ำได้)
 *   แล้วเปิดสตูดิโอด้วย: npx tsx scripts/template-link-by-size.mts --product canvas-frame --category กรอบรูปแคนวาส --studio-on --write
 *
 * ต่อไฟล์ (ชุดละไฟล์เดียว):
 *   cutCurves = สี่เหลี่ยมเต็มอาร์ตบอร์ด (พิมพ์อ้อมขอบทั้งผืน · แบบเดียวกับ roll up ใน xstand-rollup-template-link.mts)
 *   whiteUnder = true → .ai จากจอมีเลเยอร์ "รองขาว (White)" ตามทรงลาย + พื้นจอเริ่มโปร่ง
 *   finishedMm = ขนาดตามชื่อชุด (30x30 → 300×300) → หัวจอ "งานออกแบบ 30×30 ซม." (อาร์ตบอร์ด 418 รวมส่วนอ้อมขอบ)
 * ต่อชุด: bleedMm = 0 (อาร์ตบอร์ดรวมส่วนอ้อมขอบแล้ว · ส่วนต่าง 59 มม. > 25 templateFrame ถอดไม่ได้ จะตกไปตัดตก 3)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { templateFrame, type DesignTemplate, type TemplateCurve, type TemplateFile } from "../src/lib/design-templates";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const CATEGORY = "กรอบรูปแคนวาส";
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

/** สี่เหลี่ยม w×h มม. เป็นเส้นโค้ง (3 ช่วงต่อด้าน · โครงเดียวกับ roll up) */
function rectCurve(w: number, h: number): TemplateCurve {
  const seg = (x0: number, y0: number, x1: number, y1: number): [number, number, number, number, number, number] => [
    x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3, x1, y1,
  ];
  return { s: [0, 0], g: [seg(0, 0, w, 0), seg(w, 0, w, h), seg(w, h, 0, h), seg(0, h, 0, 0)] };
}

type Row = { id: string; data: DesignTemplate };
const { data: rows, error } = await sb.from("products").select("id,data").eq("category", "__templates__").like("id", "__template_tpl-%");
if (error) die(error.message);
const sets = ((rows ?? []) as Row[]).filter((r) => (r.data.category ?? "") === CATEGORY).sort((a, b) => (a.data.sort ?? 0) - (b.data.sort ?? 0));
if (!sets.length) die(`ไม่มีชุดหมวด "${CATEGORY}"`);
const touched: string[] = [];
for (const row of sets) {
  const files = row.data.files ?? [];
  if (files.length !== 1) die(`ชุด "${row.data.name}" มี ${files.length} ไฟล์`);
  const f = files[0];
  if (!f.fileUrl || !f.widthMm || !f.heightMm) die(`ชุด "${row.data.name}" ไม่รู้ขนาดอาร์ตบอร์ด`);
  const m = row.data.name.match(/(\d+)\s*x\s*(\d+)/i);
  if (!m) die(`ชุด "${row.data.name}" ไม่มีขนาด AxB ในชื่อ`);
  const finishedMm = { w: Number(m[1]) * 10, h: Number(m[2]) * 10 };
  const nf: TemplateFile = { ...f, finishedMm, cutCurves: [rectCurve(f.widthMm, f.heightMm)], whiteUnder: true };
  const next: DesignTemplate = { ...row.data, files: [nf], bleedMm: 0 };
  const key = (t: DesignTemplate) => {
    const x = t.files![0];
    return JSON.stringify([x.finishedMm, x.cutCurves, x.whiteUnder ?? false, t.bleedMm]);
  };
  const changed = key(row.data) !== key(next);
  const fr = templateFrame(next, nf, `${m[1]}x${m[2]}cm`);
  if (!fr) die(`${row.data.name}: templateFrame คืน null`);
  console.log(
    `${changed ? "✎" : "✓"} ${row.data.name} (${row.data.id}) · อาร์ตบอร์ด ${f.widthMm}×${f.heightMm} · งานจริง ${finishedMm.w}×${finishedMm.h} · รองขาว+เส้นตัดเต็มผืน · bleed 0` +
      ` → กรอบจอ ผืน ${fr.canvasWMm}×${fr.canvasHMm} ตัด ${fr.trimWMm}×${fr.trimHMm} ตัดตก ${fr.bleedXMm}/${fr.bleedYMm}`,
  );
  if (!changed || !WRITE) continue;
  const { error: uerr } = await sb.from("products").update({ data: { ...next, savedAt: new Date().toISOString() } }).eq("id", row.id);
  if (uerr) die(`บันทึก ${row.data.id}: ${uerr.message}`);
  touched.push(row.data.id);
  console.log(`   ✅ บันทึกแล้ว`);
}
if (!WRITE) console.log("\n(dry-run — ใส่ --write เพื่อบันทึก)");
else if (touched.length) await revalidateLive(env, { templateIds: touched, productIds: ["canvas-frame"] });
