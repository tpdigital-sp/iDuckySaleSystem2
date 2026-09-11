/**
 * 🧪 ทดสอบกติกาเซ็ต+คละลายของ Magnet Bookmark (magnetbookmark) กับเครื่องคิดราคาจริง
 *   npx tsx scripts/magnet-bookmark-set-mix-test.mts
 * เกณฑ์ (เจ้าของร้าน 11 ก.ย. 69): 1-3 เซ็ต คละอิสระ เพดาน 5 ลาย/เซ็ต ไม่คิดเพิ่ม · 4 เซ็ตขึ้นไป รวม 1 ลาย/เซ็ต เกินลายละ 5
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  activeRate, maxDesignsFor, includedDesigns, designFeeFor, perUnitCapacity, unitPriceFor, orderUnitYield,
  repriceCartGroups, DESIGN_LABEL, type Product,
} from "../src/lib/products";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as [string, string]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: row, error } = await sb.from("products").select("data").eq("id", "magnetbookmark").single();
if (error) throw error;
const p = row.data as Product;
const sel = (designs: number, size = "กว้าง 2.5 cm ยาว 10cm", shape = "SIMPLE SHAPES") => ({ "รูปแบบ": shape, "ขนาดไดคัท": size, [DESIGN_LABEL]: String(designs) });
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? "✓" : "✗"} ${name}: ${got}${ok ? "" : ` (คาด ${want})`}`); };
const rate = activeRate(p, sel(1))!;
const cap = perUnitCapacity(p, sel(1)) ?? 1;
eq("perUnitCapacity", cap, 5);
eq("orderUnitYield per", orderUnitYield(p, sel(1))?.per, 5);
// เพดานลาย
eq("1 เซ็ต เพดานลาย", maxDesignsFor(rate, 1, cap), 5);
eq("3 เซ็ต เพดานลาย", maxDesignsFor(rate, 3, cap), 15);
eq("4 เซ็ต เพดานลาย (คละเกินได้ถึงจำนวนชิ้น)", maxDesignsFor(rate, 4, cap), 20);
// ลายรวมในราคา
eq("3 เซ็ต รวมในราคา", includedDesigns(rate, 3, cap), 15);
eq("4 เซ็ต รวมในราคา", includedDesigns(rate, 4, cap), 4);
eq("10 เซ็ต รวมในราคา", includedDesigns(rate, 10, cap), 10);
// ค่าคละ
eq("1 เซ็ต 5 ลาย ค่าคละ", designFeeFor(p, sel(5), 1), 0);
eq("3 เซ็ต 15 ลาย ค่าคละ", designFeeFor(p, sel(15), 3), 0);
eq("4 เซ็ต 4 ลาย ค่าคละ", designFeeFor(p, sel(4), 4), 0);
eq("4 เซ็ต 5 ลาย ค่าคละ (ตัวอย่างเจ้าของร้าน)", designFeeFor(p, sel(5), 4), 5);
eq("4 เซ็ต 20 ลาย ค่าคละ", designFeeFor(p, sel(20), 4), 80);
eq("10 เซ็ต 12 ลาย ค่าคละ", designFeeFor(p, sel(12), 10), 10);
eq("4 เซ็ต 5 ลาย die cut 5-6 ค่าคละ", designFeeFor(p, sel(5, "กว้าง 5-6cm ยาว 10cm", "CUSTOM (DIE CUT)"), 4), 5);
// ราคาต่อเซ็ตต้องคิดตามจำนวนเซ็ตเดิม ไม่ตกเรท
eq("1 เซ็ต ราคา/เซ็ต", unitPriceFor(p, sel(5), 1), 160);
eq("4 เซ็ต 5 ลาย ราคา/เซ็ต", unitPriceFor(p, sel(5), 4), 130);
eq("11 เซ็ต 15 ลาย ราคา/เซ็ต", unitPriceFor(p, sel(15), 11), 120);
// ตะกร้า (repriceCartGroups) — บรรทัดเดียว 4 เซ็ต 5 ลาย
const lines = repriceCartGroups([{ productId: p.id, product: p, selections: sel(5), qty: 4, unitPrice: 0 } as never], () => p as never) as unknown as Array<{ unitPrice: number; designFee?: number; fee?: number }>;
console.log("ตะกร้า 4 เซ็ต 5 ลาย →", JSON.stringify(lines.map((l) => ({ unitPrice: l.unitPrice, designFee: l.designFee ?? l.fee }))));
console.log(fail ? `\n✗ ไม่ผ่าน ${fail} ข้อ` : "\n✓ ผ่านทุกข้อ");
process.exit(fail ? 1 : 0);
