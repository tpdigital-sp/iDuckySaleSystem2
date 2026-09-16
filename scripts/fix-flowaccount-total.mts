/**
 * 📄 ดึงยอดออเดอร์ที่ผูกกับใบ FlowAccount ให้กลับมาตรงบิลทุกบาท (แล้วปิดยอดถ้าลูกค้าโอนตามใบครบแล้ว)
 *
 *   npx tsx --tsconfig tsconfig.json scripts/fix-flowaccount-total.mts --scan                    (ไล่ดูทุกใบว่าใบไหนยอดไม่ตรง)
 *   npx tsx --tsconfig tsconfig.json scripts/fix-flowaccount-total.mts OD-260911-5435            (ดูเฉย ๆ)
 *   npx tsx --tsconfig tsconfig.json scripts/fix-flowaccount-total.mts OD-260911-5435 --apply    (เขียนจริง)
 *
 * ทำไมต้องมี (OD-260911-5435 · 11 ก.ย. 69): ออเดอร์สร้างจากลิงก์มาตรงบิล 4,823.56 แล้วมีการเปลี่ยนวิธีส่ง
 * เป็น "มารับเอง" → ค่าส่ง ฿100 ที่อยู่ในใบหายไป (แล้วไล่แก้ส่วนลด/VAT/หัก ณ ที่จ่ายตามยอดใหม่ที่ผิด)
 * ยอดในระบบเหลือ 4,718.70 แต่บิลจริงที่ลูกค้าถือยัง 4,823.56 · ลูกค้าโอนสุทธิตามใบ 4,688.32 มาครบแล้ว
 * SlipOK เทียบกับยอดในระบบเลยหาว่า "โอนขาด ฿30.38" + ส่งไลน์ทวงลูกค้าที่จ่ายครบ
 *
 * สคริปต์นี้อ่านเอกสารจากลิงก์แชร์อีกรอบ แล้วเขียนยอดตามใบกลับลงออเดอร์:
 *   รายการ (qty/ราคา ตามชื่อ) · ค่าส่ง (ป้าย "มารับเอง" คงไว้ เอาแต่ตัวเลข) · ส่วนลด · VAT · หัก ณ ที่จ่าย
 * แล้วถ้าสลิปในระบบมียอดตรงกับ "ยอดสุทธิตามใบ" → ปิดเป็นชำระครบ (ส่วนต่าง = หัก ณ ที่จ่าย รอใบ 50 ทวิ)
 * พร้อมยิงผลข้างเคียงชุดเดียวกับตอนแอดมินกดยืนยันเงินเข้า (msVerify · ตัดสต๊อก · ยอดขาย · แต้ม)
 * ⚠️ ไม่ส่งไลน์หาลูกค้า — ให้เจ้าของร้านแจ้งเองว่าที่ทวงไป ฿30.38 นั้นระบบคิดผิด
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { fetchFlowAccountDoc } from "../src/lib/server/flowaccount";
import { isPickupOrder, normalizeShipLabel } from "../src/lib/ship-label";
import { flowAccountGap, orderTotal, withLog, type Order } from "../src/lib/admin-data";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v as string;

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const fs2 = getFirestore(
  initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))) }),
  env.FIREBASE_DATABASE_ID || "tp-fixflow"
);
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const ids = args.filter((a) => a.startsWith("OD-"));
const BY = "แก้ยอดตามใบ FlowAccount (สคริปต์)";
const SHIP_RE = /ค่าจัดส่ง|ค่าส่ง|ค่าขนส่ง|shipping|delivery/i;
const r2 = (n: number) => Math.round(n * 100) / 100;
const thb = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

// 🔎 โหมดไล่ดู: ใบไหนบ้างที่ยอดในระบบไม่ตรงกับยอดที่เก็บไว้ตอนอ่านเอกสาร (ไม่ยิงเน็ตหา FlowAccount)
if (args.includes("--scan")) {
  const { data } = await sb.from("orders").select("id,data").not("data->flowAccount", "is", null);
  const rows = ((data ?? []) as { id: string; data: Order }[]).sort((a, b) => (a.id < b.id ? 1 : -1));
  let bad = 0;
  for (const r of rows) {
    const o = r.data;
    const gap = flowAccountGap(o);
    if (!gap) continue;
    bad++;
    console.log(
      `${r.id} · ${o.flowAccount?.docNo} · ${o.status} · ตามใบ ${thb(o.flowAccount?.grandTotal ?? 0)} · ในระบบ ${thb(orderTotal(o))} · ต่าง ${thb(gap)}`
    );
  }
  console.log(`\nผูกกับ FlowAccount ${rows.length} ใบ · ยอดไม่ตรงใบ ${bad} ใบ`);
  process.exit(0);
}

if (!ids.length) {
  console.error("ใส่เลขออเดอร์ เช่น OD-260911-5435 [--apply] หรือ --scan");
  process.exit(1);
}

for (const id of ids) {
  const { data: row } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
  if (!row) {
    console.log(`❌ ${id} — ไม่พบออเดอร์`);
    continue;
  }
  const order = row.data as Order;
  const fa = order.flowAccount;
  if (!fa?.url) {
    console.log(`⏭️  ${id} — ไม่ได้ผูกกับเอกสาร FlowAccount`);
    continue;
  }
  const doc = await fetchFlowAccountDoc(fa.url);
  const shipLines = doc.items.filter((it) => SHIP_RE.test(it.name));
  const work = doc.items.filter((it) => !SHIP_RE.test(it.name));
  const docShip = r2(shipLines.reduce((s, it) => s + it.amount, 0));

  // รายการ: จับคู่ตามชื่อ (ชื่อซ้ำจับตามลำดับ) แล้วเอา qty/ราคาต่อหน่วยตามใบ
  const used = new Set<number>();
  const items = order.items.map((it) => ({ ...it }));
  const unmatched: string[] = [];
  for (const w of work) {
    const idx = items.findIndex((it, i) => !used.has(i) && norm(it.name) === norm(w.name));
    if (idx < 0) {
      unmatched.push(`${w.name} ×${w.qty}`);
      continue;
    }
    used.add(idx);
    items[idx] = { ...items[idx], qty: w.qty, unitPrice: w.unitPrice };
  }

  // ป้ายวิธีส่ง: ใบที่ลูกค้ามารับเองคงป้าย "มารับเอง" ไว้ เอาแต่ตัวเลขค่าส่งตามใบ
  const shipLabel = shipLines.length
    ? isPickupOrder(order)
      ? order.shippingLabel
      : normalizeShipLabel(shipLines[0].name, docShip, [
          { id: "standard", name: "EMS (50)", price: 50 },
          { id: "express", name: "EMS (100)", price: 100 },
        ]) || shipLines[0].name
    : order.shippingLabel;

  let next: Order = {
    ...order,
    items,
    shippingCost: shipLines.length ? docShip : order.shippingCost,
    ...(shipLabel ? { shippingLabel: shipLabel } : {}),
  };
  if ((doc.discount ?? 0) > 0) next.adminDiscount = { label: `ส่วนลดตามใบ ${doc.docNo}`, amount: r2(doc.discount!) };
  else if (next.adminDiscount?.label?.startsWith("ส่วนลดตามใบ")) delete next.adminDiscount;
  if ((doc.vat ?? 0) > 0) next.vat = { rate: doc.vatRate ?? 7, amount: r2(doc.vat!) };
  else delete next.vat;
  if ((doc.wht ?? 0) > 0) next.wht = { rate: doc.whtRate ?? 3, amount: r2(doc.wht!) };
  /**
   * 📄 ยอดสรุปที่เก็บไว้ต้องเป็นฉบับเดียวกับที่เพิ่งอ่านมา — ไม่งั้นระบบถือสองภาพของเอกสารเดียวกัน
   * (รายการฉบับใหม่ · ยอดสรุปฉบับเก่า) แล้ว flowAccountGap/ด่านตรวจสลิป เทียบกับภาพที่ผิด
   * ใบมัดจำไม่แตะ — ยอดในช่องนั้นเป็น "มูลค่างานเต็ม" ที่รวมมาจาก 2 เอกสาร
   */
  if (!fa.deposit && (doc.grandTotal ?? 0) > 0)
    next.flowAccount = {
      ...fa,
      ...(doc.date ? { date: doc.date } : {}),
      subtotal: doc.subtotal,
      vat: r2(doc.vat ?? 0),
      grandTotal: r2(doc.grandTotal!),
      wht: r2(doc.wht ?? 0),
      net: r2(doc.net ?? doc.grandTotal! - (doc.wht ?? 0)),
      fetchedAt: new Date().toISOString(),
    };

  const before = orderTotal(order);
  const after = orderTotal(next);
  const docTotal = r2(doc.grandTotal ?? 0);
  const docNet = r2(doc.net ?? docTotal - r2(doc.wht ?? 0));

  console.log(`\n📄 ${id} · ${doc.docTypeLabel} ${doc.docNo}`);
  console.log(`   ยอดเดิมในระบบ ${thb(before)} → ตามใบ ${thb(after)} (ใบบอก ${thb(docTotal)})`);
  console.log(`   ค่าส่ง ${thb(order.shippingCost ?? 0)} → ${thb(next.shippingCost ?? 0)} · ส่วนลด ${thb(order.adminDiscount?.amount ?? 0)} → ${thb(next.adminDiscount?.amount ?? 0)}`);
  console.log(`   VAT ${thb(order.vat?.amount ?? 0)} → ${thb(next.vat?.amount ?? 0)} · หัก ณ ที่จ่าย ${thb(order.wht?.amount ?? 0)} → ${thb(next.wht?.amount ?? 0)}`);
  if (unmatched.length) console.log(`   ⚠️ รายการในใบที่จับคู่ไม่ได้: ${unmatched.join(" · ")}`);
  if (Math.abs(after - docTotal) >= 0.01) {
    console.log(`   ❌ คิดแล้วยังไม่เท่าใบ (${thb(after)} ≠ ${thb(docTotal)}) — ไม่แตะออเดอร์นี้ ต้องดูด้วยตา`);
    continue;
  }

  // ตัวเลขเงินเปลี่ยนจริงไหม — รันซ้ำบนใบที่ตรงอยู่แล้วต้องไม่ลง log/บันทึกซ้ำ (แต่ยังไปเช็คเรคอร์ด msVerify ต่อ)
  const moneyChanged =
    Math.abs(after - before) >= 0.01 ||
    (next.shippingCost ?? 0) !== (order.shippingCost ?? 0) ||
    (next.adminDiscount?.amount ?? 0) !== (order.adminDiscount?.amount ?? 0) ||
    (next.vat?.amount ?? 0) !== (order.vat?.amount ?? 0) ||
    (next.wht?.amount ?? 0) !== (order.wht?.amount ?? 0) ||
    (next.flowAccount?.grandTotal ?? 0) !== (fa.grandTotal ?? 0) ||
    next.items.some((it, i) => it.qty !== order.items[i]?.qty || it.unitPrice !== order.items[i]?.unitPrice);
  if (moneyChanged)
    next = withLog(
    next,
    BY,
    "แก้ยอดให้ตรงใบ FlowAccount",
    `${doc.docTypeLabel} ${doc.docNo} · ${thb(before)} → ${thb(after)} บาท` +
      ` (ค่าส่ง ${thb(next.shippingCost ?? 0)} · ส่วนลด ${thb(next.adminDiscount?.amount ?? 0)} · VAT ${thb(next.vat?.amount ?? 0)} · หัก ณ ที่จ่าย ${thb(next.wht?.amount ?? 0)})`
  );

  // ── สลิปที่แนบไว้ตรงกับ "ยอดสุทธิตามใบ" แล้วหรือยัง → ปิดยอดให้ (ส่วนต่าง = หัก ณ ที่จ่าย รอใบ 50 ทวิ) ──
  const slip = next.slipVerify;
  const slipAmt = slip?.amount ?? 0;
  /**
   * ปิดยอดเมื่อ: สลิปในระบบ = ยอดสุทธิตามใบ (ส่วนต่างคือหัก ณ ที่จ่าย) และใบยังโชว์ค้างอยู่
   * ครอบทั้งใบที่ยังรอตรวจสอบ และใบที่แอดมินกด "ชำระแล้ว" ไปแล้วแต่ paidTotal ยังเป็นยอดที่ระบบนับบางส่วนไว้
   * (ค้างผีเท่าหัก ณ ที่จ่าย → orderFullyPaid ไม่ผ่าน ยิงเลขพัสดุ/พิมพ์ใบงานไม่ได้)
   */
  const wasWaiting = next.status === "รอตรวจสอบ" || next.status === "รอชำระเงิน";
  const settle = slipAmt > 0 && Math.abs(slipAmt - docNet) <= 1 && !next.deposit && next.status !== "ยกเลิก" && (wasWaiting || (next.paidTotal ?? 0) + 0.5 < after);
  if (settle) {
    const whtAmt = r2(after - slipAmt);
    next = {
      ...next,
      paidTotal: after,
      slipVerify: {
        ...slip!,
        status: "pass",
        credited: undefined,
        detail: `ยอดในสลิป ${thb(slipAmt)} บาท ตรงกับยอดสุทธิตามใบ ${doc.docNo} (รวมทั้งสิ้น ${thb(after)} − หัก ณ ที่จ่าย ${thb(whtAmt)})`,
        deduction: { kind: "wht", rate: next.wht?.rate ?? 3, amount: whtAmt, label: `หัก ณ ที่จ่าย ${next.wht?.rate ?? 3}% (ตามใบ ${doc.docNo})` },
      },
    };
    next = withLog(
      next,
      BY,
      "ยืนยันเงินเข้าครบ (แก้ที่ระบบนับผิด)",
      `ลูกค้าโอน ${thb(slipAmt)} บาท ตรงยอดสุทธิตามใบ ${doc.docNo} มาตั้งแต่แรก — ระบบเคยนับเป็น "รับบางส่วน ค้าง ${thb(r2(before - slipAmt))}" เพราะยอดในระบบไม่ตรงใบ · รอใบ 50 ทวิ ${thb(next.wht?.amount ?? 0)} บาท`
    );
    console.log(`   💰 ปิดยอด: สลิป ${thb(slipAmt)} = สุทธิตามใบ → paidTotal ${thb(after)} (ส่วนต่าง ${thb(whtAmt)} = หัก ณ ที่จ่าย รอใบ 50 ทวิ)`);
    if (wasWaiting)
      console.log(`   👉 ใบนี้ยังเป็น "${next.status}" — ระบบจะปิดใบเป็นชำระแล้วให้เอง (ทันทีที่มีคนเปิดหน้าออเดอร์ หรือ cron settle-credited ภายใน 15 นาที) พร้อม msVerify/ตัดสต๊อก/ยอดขาย/แต้ม`);
  } else {
    console.log(`   ℹ️ ไม่ปิดยอดให้ (สลิป ${thb(slipAmt)} · สุทธิตามใบ ${thb(docNet)} · สถานะ ${next.status})`);
  }
  console.log(`   ตรวจซ้ำ: ยอดในระบบ ${thb(orderTotal(next))} · ต่างจากใบ ${flowAccountGap(next)}`);

  if (!apply) {
    console.log("   (dry-run — ใส่ --apply เพื่อเขียนจริง)");
    continue;
  }
  if (moneyChanged || settle) {
    next = { ...next, savedAt: new Date().toISOString() };
    const { error } = await sb.from("orders").update({ data: next }).eq("id", id);
    if (error) {
      console.log(`   ❌ บันทึกไม่สำเร็จ: ${error.message}`);
      continue;
    }
    console.log("   ✅ บันทึกแล้ว");
  } else {
    console.log("   ℹ️ ยอดตรงใบอยู่แล้ว — ไม่แตะออเดอร์");
  }

  /**
   * 🔗 เรคอร์ดสะพานไป msVerify/บอร์ด WIP (iduckyPaidOrders) — ตอนระบบนับเป็น "รับบางส่วน" มันติดธง partial ไว้
   * (บอร์ด WIP ข้ามการ์ดที่ partial · ตารางบัญชีขึ้นยอดของงวดนั้นไม่ใช่ยอดบิล) พอยอดตรงใบและรับครบแล้วต้องปลดธง
   * เขียนตรงเข้า Firestore เหมือน scripts/backfill-tp-*.mjs — import ตัว tp-report.ts ตรง ๆ ไม่ได้ (server-only)
   */
  if (!next.deposit && (next.paidTotal ?? 0) + 0.5 >= orderTotal(next)) {
    const ref = fs2.collection("iduckyPaidOrders").doc(id);
    const snap = await ref.get();
    const cur = snap.exists ? (snap.data() as Record<string, unknown>) : null;
    if (!cur) console.log("   ℹ️ ไม่มีเรคอร์ด msVerify ของใบนี้ — ข้าม");
    else if (cur.partial !== true && Math.abs(Number(cur.orderTotal ?? 0) - orderTotal(next)) < 0.01) console.log("   ℹ️ เรคอร์ด msVerify ถูกต้องอยู่แล้ว");
    else {
      const patch = {
        partial: false,
        paymentStatus: "ชำระแล้ว",
        orderTotal: orderTotal(next),
        note: `ยอดตามใบ ${doc.docNo} (แก้ยอดที่ระบบนับผิด) · ${next.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}`.slice(0, 120),
        noteText: `ยอดตามใบ ${doc.docNo} (แก้ยอดที่ระบบนับผิด)`,
        paidCompleteAt: new Date().toISOString(),
        paidCompleteBy: BY,
      };
      console.log(`   🔗 msVerify: partial ${cur.partial} → false · orderTotal ${thb(Number(cur.orderTotal ?? 0))} → ${thb(orderTotal(next))}`);
      await ref.set(patch, { merge: true });
      console.log("   ✅ ปลดธงรับบางส่วนในบอร์ด/ตารางบัญชีแล้ว");
    }
  }
}
