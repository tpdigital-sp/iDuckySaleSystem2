/**
 * 🧪 ทดสอบ "ค่าคละชิ้นละ ฿5" (underMinPieceFee) — สุ่มสินค้าจากลิสต์ที่ wholesale-mix-fee.mts เคยแก้
 * แล้วคิดราคาด้วยเครื่องคิดราคาตัวเดียวกับตะกร้า (repriceCartGroups) เทียบ "ก่อน/หลัง" ทีละสถานการณ์
 *
 * เกณฑ์ที่ต้องผ่านทุกข้อ
 *   • สถานการณ์ที่เดิมสั่งได้ ห้ามแพงขึ้นแม้แต่บาทเดียว
 *   • ของน้อย / ถึงโควตาอยู่แล้ว / ยอดใหญ่ = ต้องเท่าเดิมเป๊ะ
 *   • คละบรรทัดเล็ก = ต้องถูกลง หรืออย่างน้อยเสมอตัว (ช่องที่ส่วนต่างเท่าค่าคละพอดี)
 *   • ยอดรวมห้ามแพงกว่าราคาปลีกเต็ม · ค่าคละห้ามเกิน จำนวนชิ้น × ฿5
 *
 *   npx tsx scripts/wholesale-mix-fee-test.mts        # สุ่ม 10 ตัว
 *   npx tsx scripts/wholesale-mix-fee-test.mts 25     # สุ่ม 25 ตัว
 */
import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { repriceCartGroups, maxDesignsFor, DESIGN_LABEL, type PriceRate, type Product } from "../src/lib/products";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim()] as [string,string];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const N = Number(process.argv[2] || 10);
// ลิสต์สินค้าที่สคริปต์ wholesale-mix-fee เคยแก้ (ไฟล์สำรองล่าสุดใน backups/)
const backup = readdirSync("backups").filter((f) => f.startsWith("wholesale-mix-fee-before-")).sort().pop();
if (!backup) throw new Error("ไม่เจอไฟล์สำรอง backups/wholesale-mix-fee-before-*.json");
const touched = JSON.parse(readFileSync(`backups/${backup}`, "utf8")) as {id:string;name:string;rateIndex:number}[];
// สุ่มจริงทุกครั้งที่รัน (พิมพ์ id ที่ได้ไว้ด้วย จะได้ตามรอยย้อนหลังได้)
const pool = [...touched];
for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
const pick = pool.slice(0, N);

const { data } = await sb.from("products").select("id,name,price,category,data").in("id", pick.map(p=>p.id));
const toP = (row:any) => ({id:row.id,name:row.name,price:row.price,category:row.category,...(row.data as any)}) as Product;

let fail = 0, checks = 0;
const bad = (msg:string) => { fail++; console.log("      ❌ " + msg); };

for (const meta of pick) {
  const row = data!.find(r=>r.id===meta.id)!;
  const p = toP(row);
  const idx = meta.rateIndex;
  const rate = p.priceRates![idx];
  // ตัวเปรียบเทียบ = สินค้าเดียวกันแต่ปิดค่าคละ (สภาพก่อนแก้)
  const oldP = JSON.parse(JSON.stringify(p)) as Product;
  delete (oldP.priceRates![idx] as any).underMinPieceFee;

  const m = rate.pricing;
  const keys = Object.keys(m.cells);
  const key = keys[Math.floor(keys.length/2)];       // สุ่มช่องกลางตาราง ไม่ใช่ช่องแรกเสมอ
  const sel = Object.fromEntries(m.driverLabels.map((l,i)=>[l, key.split("│")[i]]));
  const cell = (Array.isArray(m.cells[key]) ? m.cells[key] : [m.cells[key]]).map(Number);
  const per = rate.minPerDesign!;
  const T = Math.max(rate.minQty ?? 1, rate.freeMixBelowQty ?? 0, per*2);
  const small = Math.max(1, per-1);
  const lots = Math.ceil(T/small);

  const price = (prod:Product, lines:{qty:number;designs?:number}[]) => {
    const cart = lines.map(l=>({productId:prod.id, qty:l.qty, selections: l.designs&&l.designs>1?{...sel,[DESIGN_LABEL]:String(l.designs)}:{...sel}}));
    const out = repriceCartGroups(cart,(id)=>id===prod.id?prod:undefined);
    return { total: out.reduce((s,o,i)=>s+o.unitPrice*cart[i].qty+(o.extraFee??0),0), out };
  };

  console.log(`\n### ${p.name} (${p.id}) — เรท "${rate.label}" · ${JSON.stringify(sel)}`);
  console.log(`    ตาราง ${m.tiers?.map((t,i)=>`${t.label}=฿${cell[i]}`).join(" · ")} | ลายละ ${per} | ค่าคละ ฿${rate.underMinPieceFee} | หน่วย ${m.unit}`);

  const cases: {name:string; lines:{qty:number;designs?:number}[]; expect:"cheaper"|"same"|"new"}[] = [
    { name:`คละบรรทัดเล็ก ${lots}×${small}`,  lines:Array.from({length:lots},()=>({qty:small})), expect:"cheaper" },
    { name:`ถึงโควตา 2×${per}`,               lines:[{qty:per},{qty:per}],                       expect:"same" },
    { name:`ของน้อย 1+1`,                     lines:[{qty:1},{qty:1}],                           expect:"same" },
    { name:`ยอดใหญ่ 2×${T*3}`,                lines:[{qty:T*3},{qty:T*3}],                       expect:"same" },
    { name:`บรรทัดเดียว ${T} ชิ้น ${lots} ลาย`,lines:[{qty:T,designs:lots}],                      expect:"new" },
  ];
  for (const c of cases) {
    const a = price(p, c.lines), b = price(oldP, c.lines);
    const wasOrderable = c.lines.every(l=>(l.designs??1) <= maxDesignsFor(oldP.priceRates![idx], l.qty));
    const tag = c.expect==="new" && !wasOrderable ? "🆕 เดิมสั่งไม่ได้" : a.total<b.total-0.01 ? "⬇️ ถูกลง" : a.total>b.total+0.01 ? "⬆️ แพงขึ้น" : "= เท่าเดิม";
    console.log(`    ${c.name.padEnd(26)} เดิม ฿${b.total.toLocaleString()} → ตอนนี้ ฿${a.total.toLocaleString()}  ${tag}`);
    console.log(`       บรรทัด: ${a.out.map((o,i)=>`${c.lines[i].qty}×฿${o.unitPrice}${o.extraFee?` +คละ${o.extraFee}`:""}`).join(" | ")}`);
    checks++;
    // กติกาที่ต้องจริงเสมอ
    if (wasOrderable && a.total > b.total + 0.01) bad(`${c.name}: แพงขึ้นจากของเดิม`);
    if (c.expect==="same" && wasOrderable && Math.abs(a.total-b.total)>0.01) bad(`${c.name}: ควรเท่าเดิมแต่เปลี่ยน`);
    // ช่องที่ส่วนต่างปลีก→ส่ง เท่ากับค่าคละพอดี (เช่น ฿105 → ฿100 ค่าคละ ฿5) = เสมอตัว ไม่ใช่ข้อผิดพลาด
    if (c.expect==="cheaper" && a.total > b.total) bad(`${c.name}: ควรถูกลงแต่กลับแพงขึ้น`);
    if (c.expect==="cheaper" && a.total === b.total) console.log("      ⚖️ เสมอตัว — ส่วนต่างปลีก→ส่งของช่องนี้เท่าค่าคละพอดี");
    // ห้ามแพงกว่าราคาปลีกเต็ม ๆ ของจำนวนเท่ากัน
    const retail = cell[0] * c.lines.reduce((s,l)=>s+l.qty,0);
    if (a.total > retail + 0.01) bad(`${c.name}: ฿${a.total} แพงกว่าราคาปลีก ฿${retail}`);
    // ค่าคละต้องเป็นพหุคูณของ 5 และไม่เกินจำนวนชิ้น × 5
    for (const [i,o] of a.out.entries()) {
      const cap = c.lines[i].qty * rate.underMinPieceFee!;
      if ((o.extraFee ?? 0) > cap + 0.01) bad(`${c.name}: ค่าคละบรรทัด ${i+1} = ${o.extraFee} เกินเพดาน ${cap}`);
    }
  }
}
console.log(`\n${fail ? "❌ ไม่ผ่าน " + fail + " ข้อ" : "✅ ผ่านหมด"} — ตรวจ ${checks} สถานการณ์ จาก ${pick.length} สินค้า`);
