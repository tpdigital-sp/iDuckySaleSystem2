/**
 * 🪧📐 เพิ่มกลุ่มตัวเลือก "ขนาด" ให้ป้ายขาตั้ง X-Stand (`x-stand`) + Roll UP (`roll-up`) และผูกเทมเพลตตามขนาด
 * (22 ต.ค. 69 เจ้าของร้านสั่ง "ช่วยเพิ่มตัวเลือกขนาดให้หน่อย" — ร้านมีขนาดเดียว 60×160 ซม. (ไฟล์ NAS 30. xStand+RollUp + x-stand&roll up.txt)
 *  จึงเริ่มด้วยค่าเดียว "60 × 160 ซม." แบบเดียวกับผ้าเช็ดหน้า · ขนาดอื่น+ราคาต้องให้เจ้าของร้านบอก แล้วเพิ่มใน SIZES ด้านล่าง หรือหลังบ้าน)
 *
 *   npx tsx scripts/xstand-rollup-size-option.mts            # ดูผล (ไม่เขียน)
 *   npx tsx scripts/xstand-rollup-size-option.mts --write    # บันทึก + ล้างแคชเว็บจริง
 *
 * ทำอะไร: product.options เพิ่มกลุ่ม "ขนาด" (display pills · section "1. ขนาด" · ไม่ใช่แกนราคา — ราคาเดิมตามจำนวนล้วน ไม่แตะ pricing/priceRates)
 *   + ชุดเทมเพลต (tpl-pk12k9rd3 / tpl-7579x2fgb): optionLabel "ขนาด" · optionProductId · file.choice "60 × 160 ซม." (ไฟล์โผล่ตามขนาดที่เลือก · เพิ่มขนาดใหม่ = นำเข้าไฟล์ + ตั้ง choice)
 *   · กลุ่มมีอยู่แล้ว = เติมเฉพาะค่าที่ยังไม่มี · 3D (banner-mock) อ่านค่า "ขนาด" ไปเป็นป้ายบนหน้าต่างเอง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { filesForSelections, type DesignTemplate } from "../src/lib/design-templates";
import type { Product, ProductOption } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const LABEL = "ขนาด";
type SizeDef = { name: string; desc: string; tpl?: string; popular?: boolean };
const SIZES: Record<string, { note: string; sizes: SizeDef[] }> = {
  "x-stand": {
    note: "ป้ายขาตั้ง X-Stand มีขนาดเดียว 60 × 160 ซม. · ขนาดป้ายเป็นขนาดที่กำหนดไว้ ปรับกว้าง/สูงตามต้องการไม่ได้",
    sizes: [{ name: "60 × 160 ซม.", desc: "ไวนิลหนา 400 แกรม พิมพ์ UV เจาะตาไก่ 4 มุม · โครงขาตั้งคาร์บอนไฟเบอร์ น้ำหนักรวม 0.9 กก. — รวมในราคาแล้ว", tpl: "tpl-pk12k9rd3", popular: true }],
  },
  "roll-up": {
    note: "ป้ายขาตั้ง Roll UP มีขนาดเดียว 60 × 160 ซม. · ขนาดป้ายเป็นขนาดที่กำหนดไว้ ปรับกว้าง/สูงตามต้องการไม่ได้",
    sizes: [{ name: "60 × 160 ซม.", desc: "ไวนิลหนา 400 แกรม พิมพ์ UV · ฐานอลูมิเนียมม้วนเก็บป้ายได้ในตัว น้ำหนัก 1.8 กก. — รวมในราคาแล้ว", tpl: "tpl-7579x2fgb", popular: true }],
  },
};
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

type TRow = { id: string; data: DesignTemplate };
const tplIds = [...new Set(Object.values(SIZES).flatMap((v) => v.sizes.map((s) => s.tpl).filter(Boolean) as string[]))];
const { data: trows } = await sb.from("products").select("id,data").in("id", tplIds.map((id) => `__template_${id}`));
const tpls = new Map(((trows ?? []) as TRow[]).map((r) => [r.data.id, r]));

let changes = 0;
const writes: (() => Promise<void>)[] = [];
for (const [pid, def] of Object.entries(SIZES)) {
  const { data: prow, error } = await sb.from("products").select("data").eq("id", pid).single();
  if (error || !prow) die(`อ่านสินค้า ${pid} ไม่ได้: ${error?.message}`);
  const product = prow!.data as Product;
  const options = [...(product.options ?? [])];
  let grp = options.find((o) => o.label === LABEL);
  const addNames: string[] = [];
  if (!grp) {
    grp = { label: LABEL, section: `1. ${LABEL}`, display: "pills", note: def.note, choices: [] } as ProductOption;
    options.unshift(grp);
  } else grp = { ...grp, choices: [...grp.choices] };
  for (const s of def.sizes) {
    if (grp.choices.some((c) => c.name === s.name)) continue;
    grp.choices.push({ name: s.name, desc: s.desc, ...(s.popular ? { popular: true } : {}) });
    addNames.push(s.name);
  }
  const idx = options.findIndex((o) => o.label === LABEL);
  options[idx] = grp;
  console.log(`🪧 ${product.name} (${pid}) · กลุ่ม "${LABEL}": ${grp.choices.map((c) => c.name).join(" · ")}${addNames.length ? ` (เพิ่ม ${addNames.length})` : " (มีครบแล้ว)"} · แกนราคา ${JSON.stringify(product.pricing?.driverLabels ?? [])} ไม่แตะ`);
  if (addNames.length) {
    changes++;
    const next: Product = { ...product, options, savedAt: new Date().toISOString() };
    writes.push(async () => {
      const { error: e } = await sb.from("products").update({ data: next }).eq("id", pid);
      if (e) die(`บันทึก ${pid}: ${e.message}`);
      console.log(`   ✅ ${product.name}: เพิ่มค่า ${addNames.join(" · ")}`);
    });
  }
  // ชุดเทมเพลตผูกตามขนาด
  for (const s of def.sizes) {
    if (!s.tpl) continue;
    const row = tpls.get(s.tpl) ?? die(`ไม่พบชุดเทมเพลต ${s.tpl}`);
    const t = row.data;
    const files = t.files ?? [];
    if (files.length !== 1) die(`ชุด ${t.name} มี ${files.length} ไฟล์`);
    const nf = { ...files[0], choice: s.name };
    const nt: DesignTemplate = { ...t, optionLabel: LABEL, optionProductId: pid, files: [nf] };
    const same = t.optionLabel === LABEL && t.optionProductId === pid && files[0].choice === s.name;
    if (filesForSelections(nt, { [LABEL]: s.name }).length !== 1) die(`${t.name}: ตั้ง choice แล้วไม่ได้ไฟล์`);
    console.log(`   ${same ? "✓" : "✎"} ชุด "${t.name}" (${t.id}) optionLabel ${LABEL} · choice "${s.name}"`);
    if (!same) {
      changes++;
      writes.push(async () => {
        const { error: e } = await sb.from("products").update({ data: { ...nt, savedAt: new Date().toISOString() } }).eq("id", row.id);
        if (e) die(`บันทึกชุด ${t.id}: ${e.message}`);
        console.log(`   ✅ ชุด "${t.name}" ผูกตามขนาด`);
      });
    }
  }
}
if (!changes) {
  console.log("✅ ครบแล้ว — ไม่มีอะไรต้องเขียน");
  process.exit(0);
}
if (!WRITE) {
  console.log(`\n(dry-run — จะแก้ ${changes} รายการ · ใส่ --write เพื่อบันทึก)`);
  process.exit(0);
}
for (const w of writes) await w();
await revalidateLive(env, { productIds: Object.keys(SIZES), templateIds: tplIds });
