/**
 * เคสมือถือ 7 ตัว — สั่งคละรุ่นในครั้งเดียว + ปรับค่าคละเป็นชิ้นละ 5 บาท (ผู้ใช้สั่ง 31 ส.ค. 69)
 *
 * กติกาที่ต้องได้ (เลียนแบบ Sticker-uv):
 *   • สั่งคละรุ่นได้ในครั้งเดียว — ตั้งสเปครุ่นที่ 1 → กด "➕ เพิ่มอีกรุ่น" → สั่งรวดเดียว
 *     (ทุกรุ่นอยู่ล็อตเดียวกัน คิดขั้นราคาจากยอดรวม — repriceCartGroups ทำอยู่แล้ว)
 *   • 1-10 ชิ้น (รวมทุกรุ่น) คละรุ่น/คละลายได้อิสระ ไม่มีค่าคละ   → freeMixBelowQty = 11 (มีอยู่แล้ว)
 *   • 11 ชิ้นขึ้นไป 1 รุ่นสั่งขั้นต่ำ 3 ชิ้น ต่อ 1 ลาย            → minPerDesign = 3 (มีอยู่แล้ว)
 *     ชิ้นที่ไม่ถึงเกณฑ์ (คละลาย/รุ่นนั้นสั่งไม่ถึง 3) คิดเพิ่มชิ้นละ 5 บาท → underMinPieceFee 10 → 5
 *
 * ทำอะไร (ต่อสินค้า 1 ตัว):
 *   1. priceRates[0].underMinPieceFee = 5            (เดิม 10)
 *   2. priceRates[0].minQtyScope = "lot"             เปิดโหมด "สั่งหลายสเปคในครั้งเดียว" ที่หน้าสินค้า
 *      ⚠️ เรทนี้ไม่มี minQty → ไม่มีประตูขั้นต่ำอะไรถูกเปิดเพิ่ม เป็นแค่สวิตช์ UI + คงการรวมล็อตเดิม
 *   3. lotItemWord = "รุ่น" · lotItemEmoji = "📱"     คำเรียกรายการในโหมดนั้น (ไม่งั้นขึ้นว่า "แผ่นที่ 2")
 *   4. แก้ข้อความกติกาทุกที่ (rate.desc / tabs / FAQ) ให้ตรงกติกาใหม่
 *   5. เพิ่มการ์ด 🧩 "เนื้อหาข้างแผงสั่งซื้อ" อธิบายวิธีสั่งคละรุ่น (มีอยู่แล้ว = เขียนทับหัวข้อเดิม)
 *
 *   node scripts/case-mix-models-lot.mjs            # ดูก่อน (ไม่เขียน)
 *   node scripts/case-mix-models-lot.mjs --write
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const FEE = 5;
const MIN_PER_DESIGN = 3;
const FREE_MIX_BELOW = 11;
const ITEM_WORD = "รุ่น";
const ITEM_EMOJI = "📱";
const SIDE_HEADING = "📱 สั่งคละรุ่น / คละลาย ยังไง";

const IDS = [
  "case-frame-card",
  "case-premium-clear",
  "case-premium-edge",
  "case-magsafe",
  "case-mirror",
  "case-glass",
  "case-card",
];

/** ข้อความกติกาเก่า → ใหม่ (ทุกจุดที่พบใน rate.desc / tabs / seo.faqs) */
const TEXT_SWAPS = [
  [
    "ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย/คละรุ่นได้ ขั้นต่ำลายละ 3 ชิ้น · ลายไหนไม่ถึง 3 ชิ้น คิดส่วนต่างชิ้นละ 10 บาท",
    "1-10 ชิ้น คละรุ่น/คละลายได้อิสระ · 11 ชิ้นขึ้นไป 1 รุ่นสั่งขั้นต่ำ 3 ชิ้น ต่อ 1 ลาย — ชิ้นที่ไม่ถึงเกณฑ์คิดเพิ่มชิ้นละ 5 บาท",
  ],
  [
    "• ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย/คละรุ่นได้ ขั้นต่ำลายละ 3 ชิ้น — ลายไหนไม่ถึง 3 ชิ้น คิดส่วนต่างชิ้นละ 10 บาท",
    "• ตั้งแต่ 11 ชิ้นขึ้นไป คละรุ่น/คละลายได้ — 1 รุ่นสั่งขั้นต่ำ 3 ชิ้น ต่อ 1 ลาย · ชิ้นที่ไม่ถึงเกณฑ์ (คละลาย หรือรุ่นนั้นสั่งไม่ถึง 3 ชิ้น) คิดเพิ่มชิ้นละ 5 บาท",
  ],
  [
    "• ราคา 1-10 ชิ้น สามารถคละดีเทลได้ไม่จำกัด",
    "• ราคา 1-10 ชิ้น (นับรวมทุกรุ่น) คละรุ่น คละลายได้อิสระ ไม่มีค่าคละ",
  ],
  [
    "ช่วงราคาปลีก 1-10 ชิ้น คละดีเทลได้ไม่จำกัด · ตั้งแต่ 11 ชิ้นขึ้นไป คละลายและคละรุ่นได้ ขั้นต่ำลายละ 3 ชิ้น ลายไหนไม่ถึง 3 ชิ้น คิดส่วนต่างชิ้นละ 10 บาท (เช่น มีลายหนึ่ง 2 ชิ้น = +20 บาท) และสั่งเคสคนละรุ่นก็รวมจำนวนคิดเรทส่งได้",
    "ได้ครับ สั่งคละรุ่นในครั้งเดียวได้เลย · ช่วง 1-10 ชิ้น (นับรวมทุกรุ่น) คละรุ่น คละลายได้อิสระ ไม่มีค่าคละ · ตั้งแต่ 11 ชิ้นขึ้นไป ยังคละได้เหมือนเดิม แต่ 1 รุ่นควรสั่งขั้นต่ำ 3 ชิ้น ต่อ 1 ลาย — ชิ้นที่ไม่ถึงเกณฑ์คิดเพิ่มชิ้นละ 5 บาท (เช่น สั่ง 11 ชิ้นแบ่งเป็น 3+3+3+2 → 2 ชิ้นสุดท้าย +10 บาท) · ทุกรุ่นในออเดอร์รวมยอดกันคิดเรทส่งได้",
  ],
];

/** การ์ดข้างแผงสั่งซื้อ — อธิบายวิธีสั่งคละรุ่นให้ลูกค้าเห็นตั้งแต่ก่อนกดสั่ง */
const SIDE_BLOCK = {
  heading: SIDE_HEADING,
  text: [
    "• สั่งหลายรุ่นในครั้งเดียวได้ — ตั้งค่ารุ่นที่ 1 (รุ่นมือถือ · จำนวน · แนบลาย) แล้วกดปุ่ม “➕ เพิ่มอีกรุ่น (คนละแบบ)” เพื่อตั้งค่ารุ่นถัดไป แล้วค่อยกดสั่งทีเดียว",
    "• ทุกรุ่นในออเดอร์นับยอดรวมกันเพื่อหาช่วงราคา — ยิ่งรวมกันได้เยอะ ยิ่งได้ราคาต่อชิ้นถูกลง",
    "• 1-10 ชิ้น (นับรวมทุกรุ่น) คละรุ่น คละลายได้อิสระ ไม่มีค่าคละเพิ่ม",
    "• 11 ชิ้นขึ้นไป: 1 รุ่น สั่งขั้นต่ำ 3 ชิ้น ต่อ 1 ลาย",
    "• ถ้าคละลาย หรือรุ่นนั้นสั่งไม่ถึง 3 ชิ้น — คิดเพิ่มเฉพาะชิ้นที่ไม่ถึงเกณฑ์ ชิ้นละ 5 บาท",
    "   ตัวอย่าง: สั่ง 11 ชิ้น แบ่งเป็น 3+3+3+2 → มี 2 ชิ้นที่ไม่ถึงเกณฑ์ = +10 บาท",
    "• แต่ละรุ่นแนบลายของตัวเองได้ (แนบกี่รูป = กี่ลาย) — กด ➕ แล้วช่องแนบลายจะว่างให้แนบของรุ่นถัดไป",
  ].join("\n"),
  html: "",
  emoji: "",
  gradient: "from-sky-100 to-blue-200",
  align: "left",
  slot: "side",
};

/** เดินทุก string ในก้อน data แล้วแทนข้อความกติกาเก่า — คืน [ก้อนใหม่, จำนวนจุดที่แก้] */
function swapDeep(node) {
  let hits = 0;
  if (typeof node === "string") {
    let s = node;
    for (const [from, to] of TEXT_SWAPS) if (s.includes(from)) { s = s.split(from).join(to); hits++; }
    return [s, hits];
  }
  if (Array.isArray(node)) {
    const out = node.map((v) => { const [nv, h] = swapDeep(v); hits += h; return nv; });
    return [out, hits];
  }
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) { const [nv, h] = swapDeep(v); hits += h; out[k] = nv; }
    return [out, hits];
  }
  return [node, hits];
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: rows, error } = await sb.from("products").select("id,name,data").in("id", IDS);
if (error) throw error;
if (rows.length !== IDS.length)
  console.warn(`⚠️ เจอ ${rows.length}/${IDS.length} ตัว — ขาด: ${IDS.filter((id) => !rows.some((r) => r.id === id)).join(", ")}`);

for (const row of rows) {
  const [data, textHits] = swapDeep(row.data);
  const r1 = data.priceRates?.[0];
  if (!r1) { console.error(`❌ ${row.id}: ไม่มี priceRates — ข้าม`); continue; }

  const before = { fee: r1.underMinPieceFee, scope: r1.minQtyScope, word: data.lotItemWord };
  r1.underMinPieceFee = FEE;
  r1.minQtyScope = "lot";
  // กันเหนียว: กติกาสองข้อนี้เป็นหัวใจของกฎใหม่ ถ้าใครไปแก้หายต้องเติมกลับ
  r1.minPerDesign = MIN_PER_DESIGN;
  r1.freeMixBelowQty = FREE_MIX_BELOW;
  // pricing ระดับสินค้าคือตารางของเรทแรกเสมอ — ต้องไม่หลุดจากกัน
  data.pricing = r1.pricing;
  data.lotItemWord = ITEM_WORD;
  data.lotItemEmoji = ITEM_EMOJI;

  // การ์ดข้างแผงสั่งซื้อ — มีหัวข้อเดิมอยู่แล้วก็เขียนทับ (รันซ้ำได้ ไม่งอก)
  const body = Array.isArray(data.body) ? [...data.body] : [];
  const at = body.findIndex((b) => (b?.heading ?? "").trim() === SIDE_HEADING);
  if (at >= 0) body[at] = { ...body[at], ...SIDE_BLOCK };
  else body.unshift({ ...SIDE_BLOCK });
  data.body = body;
  data.savedAt = new Date().toISOString();

  console.log(
    `${row.id}: ค่าคละ ${before.fee ?? "—"} → ${FEE} · minQtyScope ${before.scope ?? "—"} → lot · ` +
      `คำเรียก ${before.word ?? "—"} → ${ITEM_WORD} · การ์ดข้างแผง ${at >= 0 ? "เขียนทับ" : "เพิ่มใหม่"} · แก้ข้อความ ${textHits} จุด`
  );
  if (textHits < 4) console.warn(`   ⚠️ ข้อความกติกาเก่าเจอแค่ ${textHits} จุด (คาด 4: desc + tabs 2 บรรทัด + FAQ) — เช็คด้วยตา`);

  if (WRITE) {
    const { error: e } = await sb.from("products").update({ data }).eq("id", row.id);
    if (e) throw e;
    // อ่านกลับมายืนยัน — เคยเจอ update ผ่านแต่ค่าไม่ลง
    const { data: back } = await sb.from("products").select("data").eq("id", row.id);
    const b = back?.[0]?.data;
    const ok =
      b?.priceRates?.[0]?.underMinPieceFee === FEE &&
      b?.priceRates?.[0]?.minQtyScope === "lot" &&
      b?.lotItemWord === ITEM_WORD &&
      (b?.body ?? []).some((x) => (x?.heading ?? "").trim() === SIDE_HEADING);
    if (!ok) throw new Error(`${row.id}: เขียนแล้วแต่ค่าที่อ่านกลับไม่ตรง`);
  }
}
console.log(WRITE ? "✅ เขียนเรียบร้อย (อ่านกลับยืนยันแล้วทุกตัว)" : "👀 dry-run — เติม --write เพื่อเขียนจริง");
