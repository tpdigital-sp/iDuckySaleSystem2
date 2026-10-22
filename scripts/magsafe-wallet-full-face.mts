/**
 * 👛🖼 Magsafe Wallet (`magsafe-wallet` · ชุดเทมเพลต tpl-l92f8d85x "magsafe Wallet") — ช่องรูปเต็มชิ้นงาน + เส้นไดคัททรงมุมมน
 * (เจ้าของร้านแจ้ง 22 ต.ค. 69 จากภาพจอออกแบบ "จริงๆมันสามารถวางภาพได้เต็มชิ้นงาน" — ตอนช่องรูปยังว่าง จอเจาะหน้างานจากสกิน (guideFx.over)
 *  ไล่สีจากกลางสกินหยุดที่เส้นช่องใส่บัตร → เห็นช่องรูปแค่วงใน ทั้งที่ช่องรูปของ tpl@ เต็มผืนอยู่แล้ว)
 *
 *   npx tsx scripts/magsafe-wallet-full-face.mts            # ดูผล
 *   npx tsx scripts/magsafe-wallet-full-face.mts --write    # บันทึก + ล้างแคชเว็บจริง
 *
 * ตั้งให้ไฟล์เดียวในชุด:
 *   · cutCurves = เส้นมุมมน 8 ท่อนจากไฟล์ .ai (เส้นเทา Layer 5 · 66.2×97.3 มม. @1.5,1.5 — อาร์ตบอร์ด 69.3×100.3 เผื่อตัดตก 1.5 มม.)
 *     ⚠️ template-cut-curves.mts เลือกผิด (ได้สี่เหลี่ยม clip เท่าอาร์ตบอร์ด 4 ท่อน) และ --category Magsafe จะทับเส้นของ Card Holder ด้วย → สคริปต์นี้แตะชุดเดียว
 *   · fullFace = true (ไม่เจาะหน้างาน · โค้ด CalendarStudio guideFx) · cutLineOff = true (สกินแสดงขอบอยู่แล้ว เหมือน Card Holder)
 *   · finishedMm = 65×95 ตามชื่อตัวเลือก "สูง 9.5 × กว้าง 6.5 ซม." (หัวจอบอกขนาดที่เลือก · วงในไฟล์ 64.3×95.5)
 * วัสดุ PU Leather ทึบ → ไม่ตั้ง whiteUnder
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { curvesBox, type DesignTemplate, type TemplateCurve } from "../src/lib/design-templates";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const TPL = "tpl-l92f8d85x";
const PRODUCT = "magsafe-wallet";
const FINISHED = { w: 65, h: 95 };
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
const PYTHON = new URL("../tools/cutout-py/.venv/bin/python", import.meta.url).pathname;
const OUT = `${process.env.TMPDIR ?? "/tmp"}/magsafe-wallet-cut/`;
mkdirSync(OUT, { recursive: true });

const { data: row, error } = await sb.from("products").select("id,data").eq("id", `__template_${TPL}`).single();
if (error || !row) die(`อ่านชุด ${TPL} ไม่ได้: ${error?.message}`);
const t = row!.data as DesignTemplate;
const files = t.files ?? [];
if (files.length !== 1 || !files[0].fileUrl) die(`ชุด "${t.name}" ต้องมีไฟล์ .ai เดียว (มี ${files.length})`);
const f = files[0];
const local = `${OUT}${f.id}.ai`;
const res = await fetch(f.fileUrl!);
if (!res.ok) die(`โหลด .ai ไม่ได้ (${res.status})`);
writeFileSync(local, Buffer.from(await res.arrayBuffer()));

/* เส้นมุมมน: วาดเส้นเทากลาง · เส้นย่อย 8 ท่อน (l/c สลับ) ปิดวง · ใหญ่สุด (ไม่นับ re = สี่เหลี่ยม clip) */
const PY = `
import fitz, json, sys
MM = 25.4 / 72
pg = fitz.open(sys.argv[1])[0]
def gray(c): return c and len(c) == 3 and max(c) - min(c) < 0.06 and 0.55 <= sum(c) / 3 <= 0.85
def subpaths(items):
    out, cur, last = [], None, None
    for it in items:
        k = it[0]
        if k == "re": cur, last = None, None; continue
        if k == "l": a, b = it[1], it[2]; seg = (a, a, b, b)
        elif k == "c": a, c1, c2, b = it[1], it[2], it[3], it[4]; seg = (a, c1, c2, b)
        else: continue
        if cur is None or last is None or abs(last.x - seg[0].x) > 0.05 or abs(last.y - seg[0].y) > 0.05:
            cur = (seg[0], []); out.append(cur)
        cur[1].append(seg); last = seg[3]
    return out
best, area = None, 0
for d in pg.get_drawings():
    if not gray(d.get("color")): continue
    for s, segs in subpaths(d["items"]):
        if len(segs) != 8 or abs(segs[-1][3].x - s.x) > 0.2 or abs(segs[-1][3].y - s.y) > 0.2: continue
        xs = [s.x] + [g[3].x for g in segs]; ys = [s.y] + [g[3].y for g in segs]
        a = (max(xs) - min(xs)) * (max(ys) - min(ys))
        if a > area: best, area = (s, segs), a
if not best: print(json.dumps({"error": "no rounded gray path"})); sys.exit(2)
p = lambda v: [round(v.x * MM, 4), round(v.y * MM, 4)]
s, segs = best
print(json.dumps({"widthMm": round(pg.rect.width * MM, 2), "heightMm": round(pg.rect.height * MM, 2), "cut": [{"s": p(s), "g": [p(g[1]) + p(g[2]) + p(g[3]) for g in segs]}]}))
`;
const j = JSON.parse(execFileSync(PYTHON, ["-I", "-c", PY, local], { encoding: "utf8" }).trim()) as { widthMm: number; heightMm: number; cut: TemplateCurve[]; error?: string };
if (j.error) die(j.error);
if (Math.abs(j.widthMm - (f.widthMm ?? 0)) > 0.2 || Math.abs(j.heightMm - (f.heightMm ?? 0)) > 0.2) die(`อาร์ตบอร์ด ${j.widthMm}×${j.heightMm} ไม่ตรงที่บันทึก ${f.widthMm}×${f.heightMm}`);
const box = curvesBox(j.cut)!;
console.log(`👛 ${t.name} (${TPL}) · ${f.fileName} · อาร์ตบอร์ด ${j.widthMm}×${j.heightMm} · เส้นตัด ${j.cut[0].g.length} ท่อน กรอบ ${box.w.toFixed(1)}×${box.h.toFixed(1)} @(${box.x.toFixed(1)},${box.y.toFixed(1)}) · finished ${FINISHED.w}×${FINISHED.h}`);
const canon = (cs?: TemplateCurve[]) => JSON.stringify((cs ?? []).map((c) => [c.s, c.g, !!c.open]));
const next = { ...f, cutCurves: j.cut, cutLineOff: true, fullFace: true, finishedMm: FINISHED };
const same = canon(f.cutCurves) === canon(j.cut) && f.cutLineOff === true && f.fullFace === true && JSON.stringify(f.finishedMm) === JSON.stringify(FINISHED);
console.log(`   เดิม: cutCurves ${f.cutCurves?.length ?? 0} เส้น · cutLineOff ${f.cutLineOff ?? "-"} · fullFace ${f.fullFace ?? "-"} · finishedMm ${JSON.stringify(f.finishedMm ?? null)}${same ? " → ✅ ตรงแล้ว" : " → ✎"}`);
if (same) process.exit(0);
if (!WRITE) {
  console.log("\n(dry-run — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
const { error: werr } = await sb.from("products").update({ data: { ...t, files: [next], savedAt: new Date().toISOString() } }).eq("id", row!.id);
if (werr) die(`บันทึก: ${werr.message}`);
console.log(`   ✅ บันทึกชุด ${TPL}`);
await revalidateLive(env, { templateIds: [TPL], productIds: [PRODUCT] });
