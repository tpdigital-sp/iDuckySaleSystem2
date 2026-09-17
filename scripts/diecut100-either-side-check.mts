#!/usr/bin/env npx tsx
/**
 * 📏 ด่านตรวจ "ไดคัท 100% กรอกช่องไหนก็ได้ช่องเดียว" (พนักงานแจ้ง 17 ก.ย. 69 — ไฟล์ทรงสูงกรอกช่อง "สูง" แล้วสั่งไม่ได้)
 *   npx tsx scripts/diecut100-either-side-check.mts      # อ่านสินค้าจริงจากฐาน ไม่เขียนอะไร
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { inputError, longestOnlyPair, sheetYieldCount, unitYieldOf, type Product } from "../src/lib/products";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k: string) => (envText.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL")!, pick("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const { data: rows, error } = await sb.from("products").select("id,data");
if (error) throw error;

let fail = 0;
const ok = (name: string, pass: boolean, extra = "") => {
  if (!pass) fail++;
  console.log(`${pass ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`);
};
const W = "ขนาดไดคัท (กว้าง)";
const H = "ขนาดไดคัท (สูง)";
let n = 0;
for (const r of rows ?? []) {
  if (String(r.id).startsWith("__") || (r.data as any)?.choices) continue;
  const product = { id: r.id, ...(r.data as any) } as Product;
  const h = (product.options ?? []).find((o) => o.sheetYield?.longestOnly);
  if (!h) continue;
  n++;
  const pair = longestOnlyPair(product, h)!;
  const w = pair.longest;
  ok(`${r.id}: จับคู่ได้ทั้งสองทาง`, w.label === W && h.label === H && longestOnlyPair(product, w)?.other === h);
  const errs = (sel: Record<string, string>) => [inputError(w, sel[W], sel, product), inputError(h, sel[H], sel, product)];
  let [ew, eh] = errs({});
  ok(`${r.id}: ว่างทั้งคู่ = บล็อก บอกว่าช่องไหนก็ได้`, !!ew && ew.startsWith("กรอก") && ew.includes("ช่องใดช่องหนึ่ง") && !eh, ew ?? "");
  [ew, eh] = errs({ [W]: "4 ซม." });
  ok(`${r.id}: กรอกกว้างช่องเดียว = ผ่าน (เหมือนเดิม)`, !ew && !eh);
  [ew, eh] = errs({ [H]: "4 ซม." });
  ok(`${r.id}: กรอกสูงช่องเดียว = ผ่าน (เคสที่แจ้ง)`, !ew && !eh, ew ?? "");
  [ew, eh] = errs({ [H]: "35 ซม." });
  ok(`${r.id}: สูง 35 ช่องเดียว (เกินเพดานด้านยาวสุด 30) = ยังต้องกรอกกว้าง`, !!ew && !eh, ew ?? "");
  [ew, eh] = errs({ [H]: "1 ซม." });
  ok(`${r.id}: สูง 1 (ต่ำกว่าขั้นต่ำ) = ช่องสูงฟ้องเอง`, !!eh, eh ?? "");
  [ew, eh] = errs({ [W]: "4 ซม.", [H]: "6 ซม." });
  ok(`${r.id}: กรอกครบ = ผ่าน`, !ew && !eh);
  const base = { [w.showWhen!.label]: w.showWhen!.choices[0], ...(w.showWhenAlso ? { [(w.showWhenAlso as any).label]: (w.showWhenAlso as any).choices[0] } : {}) };
  const a = sheetYieldCount(product, h, { ...base, [W]: "4 ซม." });
  const b = sheetYieldCount(product, h, { ...base, [H]: "4 ซม." });
  ok(`${r.id}: 4 ซม. ช่องไหนก็ได้ชิ้น/แผ่นเท่ากัน`, a === 60 && b === 60, `กว้าง ${a} · สูง ${b}`);
  const uy = unitYieldOf(product, { ...base, [H]: "4 ซม." });
  if (uy) ok(`${r.id}: สรุปขนาดอ่านเป็นยาวสุด`, uy.size === "ยาวสุด 4 ซม.", uy.size);
}
ok(`เจอสินค้า longestOnly ${n} ตัว`, n === 10);
// กลุ่มช่องกรอกทั่วไป (ไม่ใช่คู่นี้) ต้องเหมือนเดิม
const plain: any = { label: "ขนาด", display: "input", choices: [], input: { kind: "number", unit: "ซม." } };
ok("ช่องกรอกทั่วไป: ว่าง = บล็อกข้อความเดิม", inputError(plain, "", {}, { options: [plain] } as any) === "กรอก “ขนาด” ด้วยนะครับ");
console.log(fail ? `\n✗ ไม่ผ่าน ${fail} ข้อ` : "\n✓ ผ่านทุกข้อ");
process.exit(fail ? 1 : 0);
