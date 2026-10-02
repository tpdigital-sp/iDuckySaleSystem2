#!/usr/bin/env node
/**
 * 🏷 กระเป๋าผ้าแคนวาส (flex-print): กลุ่ม "ขนาดลายพิมพ์" ไม่ติ๊ก = "ไม่เกิน A4" ให้ขึ้นเป็นบรรทัดในตะกร้า/ออเดอร์/ใบงาน
 *
 *   node scripts/canvas-bag-none-label.mjs                 (dry-run: โชว์ว่าจะแก้อะไร + สแกนออเดอร์ที่ยังไม่มีบรรทัด)
 *   node scripts/canvas-bag-none-label.mjs --apply         (ตั้ง noneLabel ที่สินค้า + เติมบรรทัดให้ออเดอร์ที่ระบุด้วย --order)
 *   node scripts/canvas-bag-none-label.mjs --apply --order=OD-260929-6855 [--order=…]
 *   node scripts/canvas-bag-none-label.mjs --apply --orders=open   (เติมให้ทุกใบ flex-print ที่ยังไม่เสร็จสิ้น/ยกเลิก)
 *
 * ที่มา: ฝ่ายผลิตถามว่าใบ OD-260929-6855 วางลายได้ไม่เกิน A4 หรือ A3 — ออเดอร์ไม่มีบรรทัดบอก (2 ต.ค. 69)
 * กลไก: ProductOption.noneLabel (src/lib/products.ts) · orderableSelections เขียนค่านี้ตอนลงตะกร้า
 * ออเดอร์เก่า: เติมบรรทัด "ขนาดลายพิมพ์: ไม่เกิน A4" ต่อท้าย "พิมพ์กี่ด้าน" ทั้งใน items[].selections (ข้อความ) และ items[].sel (ถ้ามี)
 * ใบที่ติ๊ก "ใหญ่กว่า A4" ไว้แล้วมีบรรทัดอยู่แล้ว ไม่แตะ
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim()];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const APPLY = process.argv.includes("--apply");
const ORDER_IDS = process.argv.filter((a) => a.startsWith("--order=")).map((a) => a.slice(8));
const ALL_OPEN = process.argv.includes("--orders=open");

const PRODUCT_ID = "flex-print";
const GROUP = "ขนาดลายพิมพ์";
const NONE = "ไม่เกิน A4";
const AFTER = "พิมพ์กี่ด้าน";
const SEP = " · ";
const die = (m) => {
  console.error("✗ " + m);
  process.exit(1);
};

// ── 1) สินค้า ───────────────────────────────────────────────────────────────
const { data: prod, error: pe } = await sb.from("products").select("id,data").eq("id", PRODUCT_ID).maybeSingle();
if (pe || !prod) die(`อ่านสินค้าไม่ได้: ${pe?.message ?? "ไม่พบ"}`);
const opts = prod.data.options ?? [];
const grp = opts.filter((o) => o.label === GROUP);
if (grp.length !== 1) die(`กลุ่ม "${GROUP}" ต้องมี 1 กลุ่ม (เจอ ${grp.length})`);
if (grp[0].display !== "multi") die(`กลุ่ม "${GROUP}" ไม่ใช่ multi (${grp[0].display})`);
console.log(`สินค้า ${PRODUCT_ID} · "${GROUP}" noneLabel: ${JSON.stringify(grp[0].noneLabel)} → "${NONE}"`);
if (APPLY && grp[0].noneLabel !== NONE) {
  const next = {
    ...prod.data,
    options: opts.map((o) => (o.label === GROUP ? { ...o, noneLabel: NONE } : o)),
    savedAt: new Date().toISOString(),
  };
  const { data: w, error: we } = await sb.from("products").update({ data: next }).eq("id", PRODUCT_ID).select("data");
  if (we || !w?.length) die(`เขียนสินค้าไม่ลง: ${we?.message ?? "0 แถว"}`);
  const back = w[0].data.options.find((o) => o.label === GROUP);
  if (typeof back?.noneLabel !== "string" || back.noneLabel !== NONE) die("อ่านกลับแล้ว noneLabel ไม่ตรง");
  console.log(`✓ ตั้ง noneLabel แล้ว (savedAt ${next.savedAt})`);
}

// ── 2) ออเดอร์ ──────────────────────────────────────────────────────────────
const { data: rows, error: oe } = await sb.from("orders").select("id,data");
if (oe) die(oe.message);
const lineRe = new RegExp(`(^|${SEP.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})${GROUP}:`);
const needs = [];
for (const r of rows) {
  const items = r.data?.items ?? [];
  const hit = items.some((it) => it.productId === PRODUCT_ID && !lineRe.test(it.selections ?? "") && !(it.sel && it.sel[GROUP]));
  if (hit) needs.push(r);
}
const openOf = (r) => !/^(done|cancelled|canceled|เสร็จสิ้น|ยกเลิก)$/.test(String(r.data?.status ?? ""));
console.log(`ออเดอร์ flex-print ที่ยังไม่มีบรรทัด "${GROUP}": ${needs.length} ใบ (ยังไม่ปิด ${needs.filter(openOf).length})`);
for (const r of needs) console.log(`  ${r.id} · ${r.data.status} · ${r.data.createdAt ?? r.data.created_at ?? ""}`);

const targets = needs.filter((r) => ORDER_IDS.includes(r.id) || (ALL_OPEN && openOf(r)));
for (const id of ORDER_IDS) if (!needs.some((r) => r.id === id)) console.log(`  (ข้าม ${id}: ไม่ใช่ flex-print หรือมีบรรทัดอยู่แล้ว)`);
if (!APPLY || !targets.length) {
  if (!APPLY) console.log("dry-run — ใส่ --apply ถึงจะเขียน");
  process.exit(0);
}

const insertLine = (text) => {
  const parts = (text ?? "").split(SEP);
  const i = parts.findIndex((p) => p.startsWith(AFTER + ":"));
  const line = `${GROUP}: ${NONE}`;
  if (i >= 0) parts.splice(i + 1, 0, line);
  else parts.push(line);
  return parts.filter(Boolean).join(SEP);
};
const insertSel = (sel) => {
  const out = {};
  let done = false;
  for (const [k, v] of Object.entries(sel)) {
    out[k] = v;
    if (k === AFTER) {
      out[GROUP] = NONE;
      done = true;
    }
  }
  if (!done) out[GROUP] = NONE;
  return out;
};

for (const r of targets) {
  // อ่านสดก่อนเขียน กันทับของที่เพิ่งเปลี่ยน
  const { data: fresh } = await sb.from("orders").select("data").eq("id", r.id).maybeSingle();
  const d = fresh?.data;
  if (!d) die(`อ่าน ${r.id} ไม่ได้`);
  const items = d.items.map((it) => {
    if (it.productId !== PRODUCT_ID) return it;
    if (lineRe.test(it.selections ?? "") || it.sel?.[GROUP]) return it;
    return { ...it, selections: insertLine(it.selections), ...(it.sel ? { sel: insertSel(it.sel) } : {}) };
  });
  const { data: w, error: we } = await sb.from("orders").update({ data: { ...d, items } }).eq("id", r.id).select("data");
  if (we || !w?.length) die(`เขียน ${r.id} ไม่ลง: ${we?.message ?? "0 แถว"}`);
  const ok = w[0].data.items.every((it) => it.productId !== PRODUCT_ID || lineRe.test(it.selections ?? ""));
  if (!ok) die(`อ่านกลับ ${r.id} แล้วยังไม่มีบรรทัด`);
  console.log(`✓ ${r.id}: ${w[0].data.items.filter((it) => it.productId === PRODUCT_ID).map((it) => it.selections).join(" | ")}`);
}
