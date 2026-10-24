/**
 * 🪪 โฟโต้การ์ด PVC (photocard-pvc-uv): แทนไฟล์ชุด "Card PVC" ด้วย .ai จาก NAS + ผูกสินค้า + ออกแบบบนเว็บ + รองขาวบัตรใส
 * (เจ้าของร้านสั่ง 24 ต.ค. 69 "เพิ่มไฟล์ Card PVC.ai ลงเทมเพลต · เพิ่มการออกแบบบนเว็บ · เพิ่มรองขาว")
 *
 *   npx tsx scripts/photocard-pvc-template-link.mts            # ดูผล + สกิน/ไฟล์แนวนอนใน $TMPDIR/photocard-pvc/
 *   npx tsx scripts/photocard-pvc-template-link.mts --write    # อัป + บันทึก + ล้างแคชเว็บจริง (รันซ้ำได้ ไฟล์เดิมทุกไบต์ = ไม่อัปใหม่)
 *
 * ไฟล์ NAS: 24 Card Holder - Card PVC/Card PVC.ai · อาร์ตบอร์ด 54.9×86.6 · เลเยอร์ "ลบ" = พื้นเทาทั้งแผ่น
 *   "งานจริงอยู่เส้นนี้" = เส้นแดงมุมมน R3 53.91×85.6 @0.5 (= เส้นตัด · red-outer-cut.py อ่านได้ตรง)
 * ชุดเดิม tpl-l9vbfl2j9 (หมวด Photocard · ไฟล์ 1.1 MB เวอร์ชันเก่า 12 ส.ค.) → ไฟล์เก่าเก็บใน retiredPaths
 * 4 ไฟล์ ผูกกลุ่ม "ชนิดบัตร PVC":
 *   PVC สีขาว / PVC สีใส (whiteUnder) × แนวตั้ง (.ai NAS) / แนวนอน (.pdf หมุน 90° · when แนวการวางลาย=แนวนอน)
 * finishedMm = บัตร 54×85.6 (หัวจอออกแบบไม่ขึ้นขนาดรวมตัดตก 5.5×8.7)
 * สกิน = เฉพาะเส้นแดง (ปิดพื้นเทา — จอวางสกินแบบ multiply พื้นเทาทำลายหม่น)
 * สินค้า: templateIds + calendarStudio formats tpl2 เมื่อ สกรีน 2 ด้าน · ถอด studioOff
 */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { filesForSelections, templateFrame, type DesignTemplate, type TemplateCurve, type TemplateFile } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const PRODUCT = "photocard-pvc-uv";
const TPL = "tpl-l9vbfl2j9";
const SRC = "/Volumes/iDuckyShop/All Template/24 Card Holder - Card PVC/Card PVC.ai";
const MAT = "ชนิดบัตร PVC";
const ORIENT = "แนวการวางลาย";
const SIDES = "สกรีนกี่ด้าน";
const WHITE = "PVC สีขาว";
const CLEAR = "PVC สีใส";
const FORMATS = [{ format: "tpl2", when: [{ label: SIDES, choices: ["สกรีน 2 ด้าน"] }] }];
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
const PY_CUT = new URL("./py/red-outer-cut.py", import.meta.url).pathname;
const OUT = `${process.env.TMPDIR ?? "/tmp"}/photocard-pvc/`;
mkdirSync(OUT, { recursive: true });
const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");
const pathOf = (u?: string) => (u ? u.split(`/${BUCKET}/`)[1] : undefined);
const rid = () => `f-${Math.random().toString(36).slice(2, 11)}`;
async function upload(buf: Buffer, kind: "file" | "preview", stem: string, e: string) {
  const ct = e === "png" ? "image/png" : e === "pdf" ? "application/pdf" : "application/postscript";
  const path = `${kind}/${randomUUID().slice(0, 8)}-${stem}.${e}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: ct, upsert: false });
  if (error) die(`อัป ${path}: ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// 1) สกินแนวตั้ง/แนวนอน (เฉพาะเลเยอร์เส้นแดง) + .pdf แนวนอน (หมุนหน้าเดิม 90° ตามเข็ม)
const py = `
import fitz, json, sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
d = fitz.open(src); names = []
for c in d.layer_ui_configs():
    names.append(c["text"]); d.set_layer_ui_config(c["number"], action=0 if c["text"] == "งานจริงอยู่เส้นนี้" else 2)
p = d[0]; p.get_pixmap(matrix=fitz.Matrix(300 / 72, 300 / 72), alpha=False).save(out + "skin.png")
Image.open(out + "skin.png").rotate(-90, expand=True).save(out + "skin-land.png")
r = fitz.open(); s = fitz.open(src); w, h = s[0].rect.width, s[0].rect.height
pg = r.new_page(width=h, height=w); pg.show_pdf_page(pg.rect, s, 0, rotate=-90)
r.save(out + "land.pdf", garbage=3, deflate=True)
print(json.dumps({"layers": names, "w": round(w * 25.4 / 72, 2), "h": round(h * 25.4 / 72, 2)}))`;
const info = JSON.parse(execFileSync(PYTHON, ["-I", "-c", py, SRC, OUT], { encoding: "utf8" })) as { layers: string[]; w: number; h: number };
if (!info.layers.includes("งานจริงอยู่เส้นนี้")) die(`ไม่มีเลเยอร์ "งานจริงอยู่เส้นนี้" (${info.layers.join(", ")})`);
const cut = JSON.parse(execFileSync(PYTHON, ["-I", PY_CUT, SRC], { encoding: "utf8" })) as { error?: string; w: number; h: number; curves: TemplateCurve[]; box: number[] };
if (cut.error) die(cut.error);
if (Math.abs(cut.box[2] - 53.91) > 0.3 || Math.abs(cut.box[3] - 85.6) > 0.3) die(`เส้นตัด ${cut.box} ไม่ใช่การ์ด 54×85.6 — ไฟล์เปลี่ยน ตรวจก่อน`);
const W = info.w, H = info.h;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
// หมุนตามเข็ม: (x, y) บนแนวตั้ง W×H → (H − y, x) บนแนวนอน H×W
const rot = (x: number, y: number): [number, number] => [r3(H - y), r3(x)];
const landCurves: TemplateCurve[] = cut.curves.map((c) => ({
  s: rot(c.s[0], c.s[1]),
  g: c.g.map((g) => [...rot(g[0], g[1]), ...rot(g[2], g[3]), ...rot(g[4], g[5])] as TemplateCurve["g"][number]),
}));
console.log(`🪪 Card PVC.ai ${W}×${H} มม. · เส้นตัด (${cut.box.join(", ")}) · เลเยอร์ ${info.layers.join(" / ")}`);
console.log(`   สกิน ${OUT}skin.png · ${OUT}skin-land.png · แนวนอน ${OUT}land.pdf`);

// 2) ชุดเดิม → 4 ไฟล์
type Row = { id: string; data: DesignTemplate & { retiredPaths?: string[] } };
const { data: trow } = await sb.from("products").select("id,data").eq("id", `__template_${TPL}`).single();
const t = ((trow as Row | null) ?? die(`ไม่พบชุด ${TPL}`)).data;
const old = t.files ?? [];
const bytes = readFileSync(SRC);
const portraitOld = old.find((f) => !f.when);
const same = portraitOld?.fileUrl ? md5(Buffer.from(await (await fetch(portraitOld.fileUrl)).arrayBuffer())) === md5(bytes) : false;
console.log(`   ชุด "${t.name}" (${TPL}) มี ${old.length} ไฟล์ · .ai ${same ? "ตรง NAS แล้ว" : `เปลี่ยน ${portraitOld?.fileSize?.toLocaleString()} → ${bytes.length.toLocaleString()} bytes`}`);

const prow = (await sb.from("products").select("data").eq("id", PRODUCT).single()).data ?? die(`ไม่พบสินค้า ${PRODUCT}`);
const product = prow.data as Product;
for (const [label, cs] of [[MAT, [WHITE, CLEAR]], [ORIENT, ["แนวตั้ง", "แนวนอน"]], [SIDES, ["สกรีน 2 ด้าน"]]] as const) {
  const g = product.options.find((o) => o.label === label) ?? die(`${PRODUCT} ไม่มีกลุ่ม "${label}"`);
  for (const c of cs) if (!g.choices.some((x) => x.name === c)) die(`กลุ่ม "${label}" ไม่มีค่า "${c}"`);
}
if (product.calendarStudio?.formats?.some((f) => f.format !== "tpl2")) die(`${PRODUCT} ตั้ง calendarStudio.formats ไว้เอง — ไม่แตะ`);
console.log(`📦 ${product.name} · templateIds ${JSON.stringify(product.templateIds ?? [])} → ["${TPL}"] · studioOff ${product.studioOff ?? "-"} → ถอด · 2 ด้าน = tpl2`);
if (!WRITE) {
  console.log("\n(dry-run — ใส่ --write เพื่ออัปและบันทึก)");
  process.exit(0);
}

const fileUrl = same ? portraitOld!.fileUrl! : await upload(bytes, "file", "Card-PVC", "ai");
const landBytes = readFileSync(`${OUT}land.pdf`);
const landUrl = await upload(landBytes, "file", "Card-PVC-landscape", "pdf");
const skinUrl = await upload(readFileSync(`${OUT}skin.png`), "preview", "Card-PVC-skin", "png");
const skinLand = await upload(readFileSync(`${OUT}skin-land.png`), "preview", "Card-PVC-skin-landscape", "png");
const LAND = { label: ORIENT, choices: ["แนวนอน"] };
const prev = (mat: string, land: boolean) => old.find((f) => (f.choices ?? [f.choice]).includes(mat) && !!f.when === land);
const port = (mat: string, white: boolean): TemplateFile => ({
  id: prev(mat, false)?.id ?? (mat === WHITE ? portraitOld?.id : undefined) ?? rid(),
  choices: [mat],
  fileUrl,
  fileName: "Card PVC.ai",
  fileSize: bytes.length,
  widthMm: W,
  heightMm: H,
  skinUrl,
  cutCurves: cut.curves,
  finishedMm: { w: 54, h: 85.6 },
  ...(white ? { whiteUnder: true } : {}),
});
const land = (mat: string, white: boolean): TemplateFile => ({
  id: prev(mat, true)?.id ?? rid(),
  choices: [mat],
  when: LAND,
  fileUrl: landUrl,
  fileName: "Card PVC (แนวนอน).pdf",
  fileSize: landBytes.length,
  widthMm: H,
  heightMm: W,
  skinUrl: skinLand,
  cutCurves: landCurves,
  finishedMm: { w: 85.6, h: 54 },
  ...(white ? { whiteUnder: true } : {}),
});
const files = [port(WHITE, false), port(CLEAR, true), land(WHITE, false), land(CLEAR, true)];
const keep = new Set(files.flatMap((f) => [pathOf(f.fileUrl), pathOf(f.skinUrl)]));
const retired = [
  ...new Set([...(t.retiredPaths ?? []), ...old.flatMap((f) => [pathOf(f.fileUrl), pathOf(f.skinUrl), pathOf(f.previewUrl)])].filter((x) => x && !keep.has(x)) as string[]),
];
const nt: DesignTemplate & { retiredPaths?: string[] } = { ...t, optionLabel: MAT, optionProductId: PRODUCT, files, retiredPaths: retired, savedAt: new Date().toISOString() };
for (const [sel, n] of [
  [{ [MAT]: WHITE, [ORIENT]: "แนวตั้ง" }, "Card PVC.ai"],
  [{ [MAT]: CLEAR, [ORIENT]: "แนวนอน" }, "Card PVC (แนวนอน).pdf"],
] as const) {
  const hit = filesForSelections(nt, sel);
  if (hit.length !== 1 || hit[0].fileName !== n || !templateFrame(nt, hit[0])) die(`จับไฟล์ ${JSON.stringify(sel)} ได้ ${hit.map((f) => f.fileName).join(", ") || "-"}`);
}
const { error: te } = await sb.from("products").update({ data: nt }).eq("id", `__template_${TPL}`);
if (te) die(`บันทึกชุด: ${te.message}`);
console.log(`   ✅ ชุด "${t.name}" 4 ไฟล์ (ขาว/ใส × ตั้ง/นอน · ใส = รองขาว) · retiredPaths ${retired.length}`);

// 3) สินค้า — อ่านล่าสุดก่อนเขียน แตะเฉพาะ templateIds / calendarStudio / studioOff
const cur = ((await sb.from("products").select("data").eq("id", PRODUCT).single()).data?.data ?? product) as Product;
const next: Product = {
  ...cur,
  templateIds: [TPL],
  calendarStudio: { ...(cur.calendarStudio ?? {}), yearLabel: cur.calendarStudio?.yearLabel ?? "", formats: FORMATS },
  savedAt: new Date().toISOString(),
};
delete next.studioOff;
const { error: pe } = await sb.from("products").update({ data: next }).eq("id", PRODUCT);
if (pe) die(`บันทึกสินค้า: ${pe.message}`);
console.log(`   ✅ ${cur.name}: ผูกชุด + ออกแบบบนเว็บ (2 ด้าน = tpl2)`);
await revalidateLive(env, { productIds: [PRODUCT], templateIds: [TPL] });
