/**
 * พวงกุญแจอะคริลิค (keyring-copy-copy · /products/พวงกุญแจอะคริลิค-Acrylic-Keyring) — 8 ก.ย. 69
 *
 *   node scripts/keyring-drill-hole-remove-charm.mjs            # ดูผล + ตรวจ (ไม่เขียนฐานข้อมูล)
 *   node scripts/keyring-drill-hole-remove-charm.mjs --write    # บันทึกจริง
 *
 * คำสั่งเจ้าของร้าน (ภาพหน้าจอชุด "4. ตะขอ"):
 *   1) เพิ่มกลุ่ม "เจาะรู" (เจาะรู / ไม่เจาะรู) วางไว้เหนือ "รับตะขอไหม"
 *   2) ลบ "ติ่งห้อย" ทิ้งทั้งกลุ่ม
 *
 * สิ่งที่พ่วงตามข้อ 2 (ไม่งั้นเหลือของค้างชี้ไปกลุ่มที่ไม่มีแล้ว):
 *   - กลุ่ม "รูปแบบการห้อย" (showWhen ติ่งห้อย) — ไม่มีติ่งห้อยก็ไม่มีอะไรให้เลือกวิธีห้อย → ลบ
 *   - artworkConsult ที่ผูก when=รูปแบบการห้อย + whenAlso=ติ่งห้อย → ลบ
 *   - FAQ (seo.faq) ข้อ "ติ่งห้อยเลือกวิธีห้อยได้ไหม?" → ลบ
 *   - แท็บข้อความ 2 บรรทัดที่พูดถึงราคาติ่งห้อย/รูปแบบการห้อย → ตัดออก
 *
 * รันซ้ำได้ (เช็คทีละขั้นว่าทำไปแล้วหรือยัง) · เขียนแล้วอ่านกลับเทียบทุกข้อ (ดู memory iducky-script-write-product)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-copy-copy";

const DRILL = "เจาะรู";
const DRILL_YES = "เจาะรู";
const DRILL_NO = "ไม่เจาะรู";
const HOOK_GATE = "รับตะขอไหม";
const CHARM = "ติ่งห้อย";
const HANG = "รูปแบบการห้อย";

const DRILL_GROUP = {
  label: DRILL,
  section: "4. ตะขอ",
  note: "เจาะรูที่ชิ้นงานสำหรับร้อยตะขอ/ห่วง — ไม่มีค่าเจาะ · ไม่เจาะรู = ชิ้นงานเรียบไม่มีรู (เหมาะเก็บสะสม/ตั้งโชว์)",
  choices: [{ name: DRILL_YES }, { name: DRILL_NO }],
};

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const die = (m) => { console.error(`❌ ${m}`); process.exit(1); };

const { data: row, error } = await sb.from("products").select("id,name,category,price,data").eq("id", ID).single();
if (error || !row) die(`อ่านสินค้าไม่ได้ — ${error?.message}`);
const d = row.data;
if (!Array.isArray(d.options)) die("data.options ไม่ใช่ array");

// ── สำรองก่อนแตะ ──
mkdirSync(new URL("../backups", import.meta.url), { recursive: true });
const bak = new URL(`../backups/${ID}-${Date.now()}.json`, import.meta.url);
writeFileSync(bak, JSON.stringify(row, null, 2));
console.log(`💾 สำรองไว้ที่ ${bak.pathname}`);

const labels = () => d.options.map((o) => o.label);
console.log(`\nก่อน: ${d.options.length} กลุ่ม — ชุด 4. ตะขอ: ${d.options.filter((o) => o.section === "4. ตะขอ").map((o) => o.label).join(" · ")}`);

// ── 1) กลุ่ม "เจาะรู" เหนือ "รับตะขอไหม" ──
const gateIdxs = d.options.map((o, i) => (o.label === HOOK_GATE ? i : -1)).filter((i) => i >= 0);
if (gateIdxs.length !== 1) die(`คาดว่ามีกลุ่ม "${HOOK_GATE}" 1 กลุ่ม แต่เจอ ${gateIdxs.length}`);
if (d.options.filter((o) => o.label === DRILL).length > 1) die(`กลุ่ม "${DRILL}" ซ้ำหลายกลุ่ม`);
const existing = d.options.findIndex((o) => o.label === DRILL);
if (existing === -1) {
  d.options.splice(gateIdxs[0], 0, structuredClone(DRILL_GROUP));
  console.log(`➕ เพิ่มกลุ่ม "${DRILL}" ที่ตำแหน่ง ${gateIdxs[0]} (ก่อน "${HOOK_GATE}")`);
} else {
  d.options[existing] = { ...d.options[existing], ...structuredClone(DRILL_GROUP) };
  if (existing !== gateIdxs[0] - 1 && existing !== gateIdxs[0]) {
    const [g] = d.options.splice(existing, 1);
    const gi = d.options.findIndex((o) => o.label === HOOK_GATE);
    d.options.splice(gi, 0, g);
    console.log(`↕ ย้ายกลุ่ม "${DRILL}" มาไว้ก่อน "${HOOK_GATE}"`);
  } else console.log(`= กลุ่ม "${DRILL}" มีอยู่แล้ว (อัปเดตเนื้อหาให้ตรง)`);
}

// ── 2) ลบ "ติ่งห้อย" + "รูปแบบการห้อย" ──
const before = d.options.length;
d.options = d.options.filter((o) => o.label !== CHARM && o.label !== HANG);
console.log(`🗑 ลบกลุ่ม ${before - d.options.length} กลุ่ม (${CHARM} / ${HANG})`);
// กลุ่มอื่นที่ยังชี้ไปหากลุ่มที่ลบ?
const refs = (o) => [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? []), ...(o.showWhenAny ?? [])].filter(Boolean).map((s) => s.label);
const dangling = d.options.filter((o) => refs(o).some((l) => l === CHARM || l === HANG)).map((o) => o.label);
if (dangling.length) die(`ยังมีกลุ่มชี้ไปหา ${CHARM}/${HANG}: ${dangling.join(", ")}`);
const badRules = (d.rules ?? []).filter((r) => [r.when?.label, r.limit?.label].includes(CHARM) || [r.when?.label, r.limit?.label].includes(HANG));
if (badRules.length) die(`rules ยังอ้าง ${CHARM}/${HANG} ${badRules.length} ข้อ`);

// artworkConsult ผูกกับ 2 กลุ่มที่ลบ
if (d.artworkConsult && (d.artworkConsult.when?.label === HANG || d.artworkConsult.whenAlso?.label === CHARM)) {
  delete d.artworkConsult;
  console.log("🗑 ลบ artworkConsult (ผูกกับรูปแบบการห้อย/ติ่งห้อย)");
}

// FAQ
if (Array.isArray(d.seo?.faqs)) {
  const n = d.seo.faqs.length;
  d.seo.faqs = d.seo.faqs.filter((f) => !/ติ่งห้อย/.test(`${f.q} ${f.a}`));
  if (n !== d.seo.faqs.length) console.log(`🗑 ลบ FAQ ${n - d.seo.faqs.length} ข้อที่พูดถึงติ่งห้อย`);
}

// แท็บข้อความ — ตัดเฉพาะบรรทัด (bullet) ที่พูดถึงติ่งห้อย
if (Array.isArray(d.tabs)) {
  let cut = 0;
  for (const t of d.tabs) {
    if (typeof t.text !== "string" || !/ติ่งห้อย/.test(t.text)) continue;
    const lines = t.text.split("\n");
    const keep = lines.filter((l) => !/ติ่งห้อย/.test(l));
    cut += lines.length - keep.length;
    t.text = keep.join("\n");
  }
  if (cut) console.log(`✂️ ตัดบรรทัดในแท็บที่พูดถึงติ่งห้อย ${cut} บรรทัด`);
}

// ยังเหลือคำว่า "ติ่งห้อย" ที่ไหนอีกไหม (นอกจากที่ตั้งใจ)
const leftovers = [];
JSON.stringify(d, (k, v) => { if (typeof v === "string" && /ติ่งห้อย/.test(v)) leftovers.push(`${k}: ${v.slice(0, 60)}`); return v; });
if (leftovers.length) console.log(`⚠️ ยังมีข้อความพูดถึงติ่งห้อยอีก ${leftovers.length} จุด:\n   ${leftopers_safe(leftovers)}`);
function leftopers_safe(a) { return a.join("\n   "); }

console.log(`\nหลัง: ${d.options.length} กลุ่ม — ชุด 4. ตะขอ: ${d.options.filter((o) => o.section === "4. ตะขอ").map((o) => o.label).join(" · ")}`);
const di = labels().indexOf(DRILL), gi = labels().indexOf(HOOK_GATE);
if (di !== gi - 1) die(`ลำดับผิด: ${DRILL}=${di} ${HOOK_GATE}=${gi}`);

if (!WRITE) { console.log("\n(ยังไม่บันทึก — ใส่ --write)"); process.exit(0); }

d.savedAt = new Date().toISOString();
const save = await sb
  .from("products")
  .update({ data: d, name: d.name, category: d.category, price: d.price })
  .eq("id", ID)
  .select("id");
if (save.error) die(`บันทึกไม่สำเร็จ — ${save.error.message}`);
if (!save.data?.length) die("update โดน 0 แถว");

// ── อ่านกลับเทียบ ──
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back.data;
const bl = b.options.map((o) => o.label);
const checks = [
  ["savedAt ตรง", b.savedAt === d.savedAt],
  [`มีกลุ่ม ${DRILL} 1 กลุ่ม`, bl.filter((l) => l === DRILL).length === 1],
  [`${DRILL} อยู่ก่อน ${HOOK_GATE} ติดกัน`, bl.indexOf(DRILL) === bl.indexOf(HOOK_GATE) - 1],
  [`ตัวเลือก ${DRILL_YES}/${DRILL_NO}`, JSON.stringify(b.options[bl.indexOf(DRILL)].choices.map((c) => c.name)) === JSON.stringify([DRILL_YES, DRILL_NO])],
  [`section 4. ตะขอ`, b.options[bl.indexOf(DRILL)].section === "4. ตะขอ"],
  [`ไม่มีกลุ่ม ${CHARM}`, !bl.includes(CHARM)],
  [`ไม่มีกลุ่ม ${HANG}`, !bl.includes(HANG)],
  ["ไม่มี artworkConsult ค้าง", !b.artworkConsult],
  ["FAQ ไม่มีติ่งห้อย", !(b.seo?.faqs ?? []).some((f) => /ติ่งห้อย/.test(`${f.q} ${f.a}`))],
  ["แท็บไม่มีติ่งห้อย", !(b.tabs ?? []).some((t) => /ติ่งห้อย/.test(t.text ?? ""))],
  ["จำนวนกลุ่มเท่าที่ตั้งใจ", b.options.length === d.options.length],
];
let ok = true;
for (const [name, pass] of checks) { console.log(`${pass ? "✓" : "✗"} ${name}`); ok &&= pass; }
if (!ok) die("อ่านกลับไม่ตรง — รันซ้ำอีกรอบ");
console.log("\n✅ บันทึกแล้ว อ่านกลับตรงทุกข้อ");
