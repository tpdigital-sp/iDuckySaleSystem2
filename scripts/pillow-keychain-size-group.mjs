/**
 * 📐 PILLOW KEYCHAIN (pillow-keychain) — เพิ่มกลุ่ม "ขนาด" ให้ออเดอร์แสดงขนาดสินค้า
 * เจ้าของร้านแจ้ง 11 ก.ย. 69: หน้าออเดอร์ OD-260910-1124 ไม่ขึ้นบรรทัดขนาด
 * สาเหตุ: สินค้าไม่มีกลุ่มตัวเลือก "ขนาด" เลย — ขนาด 8×8 ซม. เขียนไว้แค่ในคำอธิบาย
 * มีแต่กลุ่ม "ขนาดมากกว่า 8 ซม" (บวกเซนละ ฿10) ซึ่งติดไปกับออเดอร์เฉพาะตอนลูกค้าเลือกเพิ่ม
 * → (1) แทรกกลุ่ม "ขนาด" การ์ดเดียว "8×8 ซม." ไว้หน้ากลุ่มเพิ่มขนาด (แบบเดียวกับ scarf / cardholder-white / placemat)
 *       foldSizeExtra จะบวกให้เอง: เลือกเซนละ ×2 → "10×10 ซม. (8×8 + เพิ่ม 2)"
 *   (2) เติม "ขนาด: 8×8 ซม." ให้รายการในออเดอร์ที่มีอยู่แล้ว (sel + selections ทั้งคู่) + log
 * รันซ้ำได้ · --dry = แค่โชว์ไม่เขียน · --orders=OD-xxx,OD-yyy (ค่าเริ่มต้น OD-260910-1124)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "pillow-keychain";
const GROUP = "ขนาด";
const SIZE = "8×8 ซม.";
const ADD_GROUP = "ขนาดมากกว่า 8 ซม";
const DRY = process.argv.includes("--dry");
const ordersArg = process.argv.find((a) => a.startsWith("--orders="));
const ORDER_IDS = (ordersArg ? ordersArg.slice(9) : "OD-260910-1124").split(",").map((s) => s.trim()).filter(Boolean);

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (msg) => { console.error("✗ " + msg); process.exit(1); };

/* ---------- (1) สินค้า ---------- */
const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;
const opts = p.options || [];
const has = opts.find((o) => (o.label || "").trim() === GROUP);
if (has) {
  console.log(`สินค้า: มีกลุ่ม "${GROUP}" อยู่แล้ว → ${JSON.stringify(has.choices.map((c) => c.name))}`);
  // กลุ่มตัวเลือกเดียว ป้าย "นิยม" ไม่มีความหมาย (ขึ้นบรรทัดอธิบายป้ายเปล่า ๆ) → ถอดออกถ้าเผลอใส่
  if (has.choices.some((c) => c.popular)) {
    has.choices.forEach((c) => delete c.popular);
    p.savedAt = new Date().toISOString();
    console.log("  ถอดป้าย popular ออกจากตัวเลือกเดียว");
    if (!DRY) {
      const { data: upd, error: e2 } = await sb.from("products").update({ data: p }).eq("id", ID).select("id");
      if (e2 || !upd?.length) die("เขียนสินค้าไม่ลง: " + (e2?.message || "0 แถว"));
      const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
      const g = (back?.data?.options || []).find((o) => o.label === GROUP);
      if (!g || g.choices.some((c) => c.popular) || back.data.savedAt !== p.savedAt) die("อ่านกลับไม่ตรง — รันซ้ำอีกรอบ");
      console.log("  ✓ อ่านกลับตรง savedAt=" + back.data.savedAt);
    }
  } else console.log("  ข้าม");
} else {
  const addIdx = opts.findIndex((o) => (o.label || "").trim() === ADD_GROUP);
  if (addIdx < 0) die(`ไม่พบกลุ่ม "${ADD_GROUP}" ในสินค้า — โครงตัวเลือกเปลี่ยนไป ตรวจก่อน`);
  const group = {
    label: GROUP,
    note: "หมอนจิ๋วขนาดมาตรฐาน 8×8 ซม. รวมในราคาแล้ว — อยากได้ใหญ่กว่านี้เลือก \"ขนาดมากกว่า 8 ซม\" ด้านล่าง (บวกเซนละ 10 บาท)",
    choices: [{ name: SIZE, desc: "ขนาดมาตรฐานขนาดเดียวของร้าน · ไดคัทได้ทั้งสี่เหลี่ยมและตามทรง" }],
    display: "cards",
    section: opts[addIdx].section || "1. รูปทรง + ขนาด",
  };
  opts.splice(addIdx, 0, group);
  p.options = opts;
  p.savedAt = new Date().toISOString();
  console.log(`สินค้า: แทรกกลุ่ม "${GROUP}" [${SIZE}] ที่ตำแหน่ง ${addIdx} (หน้า "${ADD_GROUP}") · ลำดับใหม่: ${opts.map((o) => o.label).join(" → ")}`);
  if (!DRY) {
    const { data: upd, error: e2 } = await sb.from("products").update({ data: p }).eq("id", ID).select("id");
    if (e2 || !upd?.length) die("เขียนสินค้าไม่ลง: " + (e2?.message || "0 แถว"));
    const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
    const g = (back?.data?.options || []).find((o) => o.label === GROUP);
    if (!g || g.choices?.[0]?.name !== SIZE || back.data.savedAt !== p.savedAt) die("อ่านกลับไม่ตรง — รันซ้ำอีกรอบ");
    console.log("  ✓ อ่านกลับตรง savedAt=" + back.data.savedAt);
  }
}

/* ---------- (2) ออเดอร์ที่มีอยู่แล้ว ---------- */
for (const oid of ORDER_IDS) {
  const { data: orow, error: oe } = await sb.from("orders").select("data").eq("id", oid).maybeSingle();
  if (oe || !orow) { console.log(`${oid}: ไม่พบออเดอร์ ข้าม`); continue; }
  const order = orow.data;
  let touched = 0;
  const items = (order.items || []).map((it) => {
    if (it.productId !== ID) return it;
    const sel = it.sel && typeof it.sel === "object" ? it.sel : null;
    if (sel?.[GROUP]) { console.log(`${oid}: ${it.name} มี "${GROUP}: ${sel[GROUP]}" แล้ว ข้าม`); return it; }
    // sel: แทรกหลัง "รูปทรง" (คงลำดับคีย์เดิม)
    const nextSel = {};
    let placed = false;
    for (const [k, v] of Object.entries(sel || {})) {
      nextSel[k] = v;
      if (k === "รูปทรง") { nextSel[GROUP] = SIZE; placed = true; }
    }
    if (!placed) nextSel[GROUP] = SIZE;
    // selections (ข้อความคั่น " · "): แทรกบรรทัดขนาดหลังรูปทรงเช่นกัน
    const line = `${GROUP}: ${SIZE}`;
    let text = String(it.selections || "");
    if (!text.includes(line)) {
      const parts = text ? text.split(" · ") : [];
      const i = parts.findIndex((s) => s.startsWith("รูปทรง:"));
      if (i >= 0) parts.splice(i + 1, 0, line); else parts.unshift(line);
      text = parts.join(" · ");
    }
    touched++;
    console.log(`${oid}: ${it.name} → sel เพิ่ม "${line}" · selections = ${text}`);
    return { ...it, ...(sel ? { sel: nextSel } : {}), selections: text };
  });
  if (!touched) continue;
  const at = new Date().toISOString();
  const next = {
    ...order,
    items,
    savedAt: at,
    log: [...(order.log || []), { at, by: "ระบบ (สคริปต์)", action: "แก้รายละเอียดรายการ", detail: `เติมบรรทัด "${GROUP}: ${SIZE}" — สินค้าเดิมไม่มีกลุ่มขนาด` }],
  };
  if (DRY) { console.log(`${oid}: (dry) ไม่เขียน`); continue; }
  const { data: upd, error: ue } = await sb.from("orders").update({ data: next }).eq("id", oid).select("id");
  if (ue || !upd?.length) die(`${oid}: เขียนไม่ลง ` + (ue?.message || "0 แถว"));
  const { data: back } = await sb.from("orders").select("data").eq("id", oid).maybeSingle();
  const ok = (back?.data?.items || []).filter((it) => it.productId === ID).every((it) => it.sel?.[GROUP] === SIZE && String(it.selections).includes(`${GROUP}: ${SIZE}`));
  if (!ok) die(`${oid}: อ่านกลับไม่ตรง — รันซ้ำอีกรอบ`);
  console.log(`  ✓ ${oid} อ่านกลับตรง`);
}
if (DRY) console.log("(dry) จบ ไม่เขียนอะไร");
