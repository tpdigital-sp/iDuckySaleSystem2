#!/usr/bin/env node
/**
 * จัด "ชุดตัวเลือก" (ProductOption.section) ให้สินค้าที่ยังไม่ได้แบ่งกลุ่ม — แบบเดียวกับ POSTER
 *   [ผู้ใช้สั่ง 4 ก.ย. 69: "ปรับให้สินค้าทุกตัวแบ่งกลุ่มเหมือน POSTER · ทำเฉพาะตัวที่ยังไม่ได้แบ่ง"]
 *
 *   node scripts/auto-option-sections.mjs                 # ดูก่อน (ไม่เขียน) ทุกตัวที่เข้าเงื่อนไข
 *   node scripts/auto-option-sections.mjs --list          # ย่อบรรทัดเดียวต่อสินค้า
 *   node scripts/auto-option-sections.mjs --write         # เขียนจริง + อ่านกลับเทียบ
 *   node scripts/auto-option-sections.mjs --write standy  # เฉพาะบางตัว
 *
 * ทำเฉพาะสินค้าที่ยังไม่มี section เลย และมีตั้งแต่ 3 กลุ่มขึ้นไป (น้อยกว่านั้นแบนก็อ่านง่ายอยู่แล้ว)
 *
 * วิธีคิด
 *  1) จัดหมวดแต่ละกลุ่มจากชื่อ (ฐาน · ตะขอ · เคลือบ · งานพิมพ์ · ขนาด · การตัด · วัสดุ · ของเสริม)
 *  2) กลุ่มลูก (showWhen ชี้กลุ่มอื่น) ที่เป็น "คำถามต่อยอด" ของแม่ ใช้หมวดเดียวกับแม่
 *  3) เรียงใหม่: หมวดเรียงตาม "หมวดไหนโผล่ก่อน" · ในหมวดเดียวกันคงลำดับเดิม
 *  4) ตั้งชื่อชุดจากเนื้อในจริง ("2. ขนาด + รูปทรง") · เลขหน้าชื่อ = เลขในวงกลมหน้าหัวชุด
 *
 * ⚠️ ไม่แตะชื่อกลุ่ม/ตัวเลือก/ราคา/กฎ/showWhen — เติม section + สลับลำดับกลุ่มเท่านั้น
 *    (คีย์ตารางราคาเป็น "ชื่อ" · rules/rateAfterOption อ้างด้วย label — ลำดับไม่มีผลกับราคา)
 * รันซ้ำได้ ผลลัพธ์เหมือนเดิม (รอบสองข้ามเพราะมี section แล้ว)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ARGV = process.argv.slice(2);
const WRITE = ARGV.includes("--write");
const LIST = ARGV.includes("--list");
/** --all = ใส่กรอบให้ "ทุกตัวที่มีตัวเลือก" แม้มีกลุ่มเดียว หรือแบ่งเป็นหลายชุดไม่ได้ (กรอบเดียวคลุมหมด)
 *  [ร้านสั่ง 4 ก.ย. 69: "ให้สินค้าทุกตัวแบ่งกลุ่มเหมือน POSTER"] */
const ALL = ARGV.includes("--all");
const ONLY = ARGV.filter((a) => !a.startsWith("--"));

/* ── หมวด (cat = ใช้จัดกรอบ · facet = คำที่เอาไปตั้งชื่อชุด) ───────────────────────────────
   เรียงจากเจาะจงที่สุดลงมา — ตัวแรกที่เข้าเงื่อนไขชนะ */
const RULES = [
  // สินค้าหลายชิ้นต่อ 1 หน่วย (3D Acrylic) — กลุ่มหน้าตาซ้ำกันทุกชิ้น ต้องแยกกรอบ "ชิ้นที่ N"
  { piece: true, re: /ชิ้นที่\s*(\d+)/ },
  // ฐานสแตนดี้ทั้งชุด (ขนาดฐาน · ทรงฐาน · สีอะคริลิคฐาน · เลือกสีพิเศษของฐาน …)
  // ⚠️ กัน "มาตรฐาน" มาแมตช์คำว่า ฐาน (กลุ่ม "ผ้ากว้างเกินขนาดมาตรฐาน" เคยไปโผล่ในชุด "ฐาน")
  { cat: "base", facet: "ฐาน", re: /(?<!มาตร)ฐาน|ขาตั้ง|Magsafe coil/i },
  // "ตัวห้อย" = ชิ้นงานที่ห้อยอยู่ (ชิงช้าสวรรค์/โมบาย) ไม่ใช่ตะขอ — ต้องมาก่อนกฎตะขอ ไม่งั้นชุดขึ้นหัวว่า "ตะขอ"
  { cat: "hook", facet: "ตัวห้อย", re: /^ตัวห้อย/ },
  // ตะขอ/สายห้อย — ต้องมาก่อน "สี" ไม่งั้น "สีตะขอ C" ไปกองรวมกับสีชิ้นงาน
  { cat: "hook", facet: "ตะขอ", re: /ตะขอ|โซ่|ห้อย|พวงกุญแจ|สายคล้อง|คล้องคอ|ริบบิ้น|เชือก|สปริง|คาราไบเนอร์|จุก|แหวน|ที่ล็อค|กระดิ่ง/ },
  // อะไหล่/ของที่ประกอบเพิ่ม (แม่เหล็ก · กิ๊บ · หูกระเป๋า · พู่ · ไส้หมอน · ตาไก่ …)
  { cat: "hook", facet: "อะไหล่", re: /อะไหล่|แม่เหล็ก|กิ๊บ|หูกระเป๋า|พู่|ตาไก่|เข็มกลัด|ไส้หมอน|ถุงบรรจุ|^ตัวน้อย|Fimo|ช่องกรอบ|วิธีปิด|ประกอบ/i },
  // งานพิมพ์/สกรีน/ปัก/ฟอยล์ — ก่อน "ขนาด" เพราะ "ขนาดสกรีน ด้านหน้า" คือเรื่องงานสกรีน
  // และก่อน "เคลือบ" เพราะ "เคลือบฟอยล์ (Add On)" เป็นเรื่องฟอยล์ อยู่ชุดเดียวกับ "สีฟอยล์"
  { cat: "print", facet: "ฟอยล์", re: /ฟอยล์|ปั๊มนูน|ปั๊มจม/ },
  { cat: "coat", facet: "เคลือบผิว", re: /เคลือบ|ลามิเนต|ผิวฟิล์ม|ฟิล์มพิเศษ|ผิวงาน|ผิวเนื้อ/ },
  { cat: "print", facet: "งานปัก", re: /ปัก|ไหม|ฟอนต์/ },
  { cat: "print", facet: "งานสกรีน", re: /สกรีน|สรีน/ },
  { cat: "print", facet: "จำนวนด้าน", re: /จำนวนด้าน|กี่ด้าน/ },
  { cat: "print", facet: "งานพิมพ์", re: /พิมพ์|รองขาว|รองพื้นขาว|ซับลิเมชั่น|เทคนิค|ตำแหน่งงาน|UV|DTF|FLEX/i },
  // ของเสริม — ก่อน "วัสดุ" ไม่งั้น "เพิ่มแผ่นอะคริลิค (Add On)" ไปกองกับเนื้อวัสดุ
  { cat: "addon", facet: "ของเสริม", re: /add[ ._-]?on|อุปกรณ์เสริม|ลูกเล่น|ของแถม|เสริม(?!แรง)/i },
  // สีพิเศษ/เฉดสี — ก่อน "ขนาด" เพราะชื่อกลุ่มมีขนาดพ่วงมาด้วย ("เลือกสีพิเศษ (ตัวสแตนดี้ 8 ซม. …)")
  { cat: "mat", facet: "สี", re: /สีพิเศษ|เฉดสี/ },
  // ขนาด/รูปทรง/แนววาง (รวม "ขนาดตัด" · "ขนาดกำหนดเอง (กว้าง)" · ช่องกรอก กว้าง/สูง/ยาว)
  { cat: "size", facet: "แนววาง", re: /แนว/ },
  { cat: "size", facet: "รูปทรง", re: /ทรง|รูปร่าง/ },
  { cat: "size", facet: "ขนาด", re: /ขนาด|ไซซ์|ไซส์|size|^กว้าง$|^สูง$|^ยาว$|\((กว้าง|สูง|ยาว)\)|ความยาว/i },
  { cat: "size", facet: "จำนวน", re: /^จำนวน|จำนวนชิ้น|^เพิ่มจำนวน/ },
  { cat: "cut", facet: "การตัด", re: /การตัด|ไดคัท|ตัดเป็น|เจาะรู|เก็บขอบ|ขอบงาน|มุมมน/ },
  { cat: "mat", facet: "เนื้อวัสดุ", re: /เนื้อ|ชนิด|วัสดุ|ความหนา|กระดาษ|ผ้า|อะคริลิค|กระจก|ไม้|หนัง|สแตนเลส|แคนวาส|PET|PVC/i },
  { cat: "mat", facet: "สี", re: /^สี|สีเสื้อ|สีกระเป๋า/ },
  { cat: "mat", facet: "ชิ้นงาน", re: /^ชิ้นงาน|^ตัวกลาง|^ตัวขนาด/ },
  { cat: "etc", facet: "งานสั่งทำ", re: /สั่งทำ/ },
  { cat: "mat", facet: "รุ่น", re: /^รุ่น/ },
  { cat: "mat", facet: "แบบ", re: /แบบ|รูปแบบ|ประเภท|ลาย|^OPTION$|ดีไซน์|วิธีขาย|ขายแบบ/i },
];
/** ชื่อกลุ่มที่ไม่เข้าหมวดไหนเลย — ใช้ชื่อกลุ่มเองเป็นชื่อชุด ถ้าสั้นพอ ("เลือก" · "ตัวน้อยเขย่า") */
const classify = (label) => {
  const hit = RULES.find((r) => r.re.test(label));
  if (!hit) return { cat: "etc", facet: label.length <= 14 ? label : "ตัวเลือกอื่น ๆ" };
  if (!hit.piece) return { cat: hit.cat, facet: hit.facet };
  const n = label.match(hit.re)[1];
  return { cat: `piece${n}`, facet: `ชิ้นที่ ${n}` };
};

/**
 * ชื่อชุด = facet ของกลุ่มในชุดนั้น ไม่ซ้ำ · เอา "กลุ่มแม่" ขึ้นก่อนกลุ่มลูก แล้วตัดเหลือ 2 คำ
 * (แม่คือเรื่องหลักของชุด · ลูกเป็นคำถามต่อยอด จึงเป็นได้แค่คำต่อท้าย)
 * facet ที่ชุดก่อนหน้าใช้ไปแล้วตัดทิ้ง ไม่งั้นได้ "3. เคลือบผิว" กับ "4. งานพิมพ์ + เคลือบผิว"
 */
function sectionNames(buckets) {
  const used = new Set();
  return buckets.map((b, i) => {
    const facets = [...b.filter((x) => !x.child), ...b.filter((x) => x.child)].map((x) => x.facet);
    let uniq = [...new Set(facets)];
    const fresh = uniq.filter((f) => !used.has(f));
    uniq = fresh.length ? fresh : uniq.slice(0, 1);
    if (uniq.length > 2) uniq = uniq.slice(0, 2);
    uniq.forEach((f) => used.add(f));
    return `${i + 1}. ${uniq.join(" + ")}`;
  });
}

/** กลุ่มนี้ไปอยู่ในกล่อง 📐 งานสั่งทำ (ไม่ได้อยู่ในรายการตัวเลือกปกติ) — ลอกจาก isMadeToOrderOption */
const isInput = (o) => !(o.choices ?? []).length;
const isMTO = (o) => (isInput(o) && o.standardInput !== true) || o.madeToOrder === true;
const mtoFirst = (list) => {
  const a = list.findIndex(isMTO);
  const b = list.findIndex((o) => !isMTO(o));
  return a >= 0 && (b < 0 || a < b);
};

/**
 * คิดแผนจัดชุดของสินค้าหนึ่งตัว
 * mode "kin"   = กลุ่มลูกตามแม่เฉพาะตอนเป็นเรื่องเดียวกัน (หมวดเดียวกัน · ไม่เข้าหมวดไหน · ชื่อมีชื่อแม่)
 *                — กันกรณีกลุ่ม "ขนาด" เป็นแค่ประตูเปิดคำถามคนละเรื่อง (เนื้อผ้า/สีไหม/พิมพ์ลาย)
 * mode "all"   = ลูกตามแม่เสมอ (ใช้ตอน kin แล้วได้ชุดละกลุ่มเดียวหมด แบ่งไปก็ไม่ได้อะไร)
 * คืน null เมื่อแบ่งแล้วไม่ได้ประโยชน์ หรือแบ่งแล้วลูกไปอยู่ก่อนแม่
 */
function buildPlan(opts, mode) {
  const info = opts.map((o) => ({ o, ...classify(o.label) }));
  const byLabel = new Map(opts.map((o, i) => [o.label, i]));
  const parentOf = (i) => {
    const p = info[i].o.showWhen?.label;
    const pi = p != null ? byLabel.get(p) : undefined;
    return pi === undefined || pi === i ? -1 : pi;
  };
  const rootCat = (i, seen = new Set()) => {
    const pi = parentOf(i);
    if (pi < 0 || seen.has(pi)) return info[i].cat;
    const kin = info[i].cat === info[pi].cat || info[i].cat === "etc" || info[i].o.label.includes(info[pi].o.label);
    if (mode === "kin" && !kin) return info[i].cat;
    seen.add(i);
    return rootCat(pi, seen);
  };
  const base = info.map((x) => x.cat);
  info.forEach((x, i) => { x.cat = rootCat(i); x.child = parentOf(i) >= 0; });

  // เรียงหมวดตามที่โผล่ก่อน · ในหมวดคงลำดับเดิม — แล้วดันลูกที่แซงหน้าแม่ให้ไปอยู่ชุดเดียวกับแม่
  const layout = () => {
    const order = [...new Set(info.map((x) => x.cat))];
    return order.flatMap((cat) => info.filter((x) => x.cat === cat));
  };
  for (let round = 0; round < opts.length + 1; round++) {
    const laid = layout();
    const at = new Map(laid.map((x, i) => [x.o, i]));
    const bad = laid.find((x) => { const pi = parentOf(info.indexOf(x)); return pi >= 0 && at.get(info[pi].o) > at.get(x.o); });
    if (!bad) break;
    const pi = parentOf(info.indexOf(bad));
    if (bad.cat === info[pi].cat) return null; // วนแล้วยังแซง = ข้อมูลเดิมเรียงลูกไว้ก่อนแม่ ต้องจัดด้วยมือ
    bad.cat = info[pi].cat;
  }
  const laid = layout();
  const at = new Map(laid.map((x, i) => [x.o, i]));
  if (laid.some((x) => { const pi = parentOf(info.indexOf(x)); return pi >= 0 && at.get(info[pi].o) > at.get(x.o); })) return null;

  const order = [...new Set(laid.map((x) => x.cat))];
  const buckets = order.map((cat) => laid.filter((x) => x.cat === cat));
  if (buckets.length < 2) return null;                       // ได้ชุดเดียว ไม่มีอะไรให้แบ่ง
  if (buckets.every((b) => b.length === 1)) return null;      // ชุดละกลุ่มเดียวหมด แบ่งไปก็รกเปล่า ๆ
  const names = sectionNames(buckets);
  if (new Set(names).size !== names.length) return null;      // ชื่อชุดซ้ำกัน
  const nextOpts = buckets.flatMap((b, i) => b.map((x) => ({ ...x.o, section: names[i] })));
  if (nextOpts.length !== opts.length) return null;
  if (mtoFirst(opts) !== mtoFirst(nextOpts)) return null;     // กล่อง 📐 งานสั่งทำจะย้ายตำแหน่ง
  void base;
  return { buckets, names, nextOpts, moved: opts.map((o) => o.label).join("→") !== nextOpts.map((o) => o.label).join("→") };
}

/**
 * กรอบเดียวคลุมทุกกลุ่ม — ใช้ตอนแบ่งเป็นหลายชุดไม่ได้ (มีกลุ่มเดียว · ทุกกลุ่มเรื่องเดียวกัน ·
 * หรือแบ่งแล้วได้ชุดละกลุ่มเดียวหมด) แต่ร้านยังอยากได้กรอบหัวข้อเหมือนหน้าอื่น
 * ⚠️ ไม่สลับลำดับกลุ่มเลย (ของเดิมเรียงไว้ยังไงก็อย่างนั้น) — ปลอดภัยที่สุด
 * ชื่อชุด: กลุ่มเดียวชื่อสั้น → ใช้ชื่อกลุ่มตรง ๆ ("1. รุ่นมือถือ") · นอกนั้นใช้คำหมวดไม่เกิน 2 คำ
 */
function singleFrame(opts) {
  const info = opts.map((o) => ({ o, ...classify(o.label), child: !!o.showWhen?.label }));
  const name =
    opts.length === 1 && opts[0].label.length <= 14
      ? `1. ${opts[0].label}`
      : sectionNames([info])[0];
  return {
    buckets: [info],
    names: [name],
    nextOpts: opts.map((o) => ({ ...o, section: name })),
    moved: false,
    single: true,
  };
}

/* ── โหลดสินค้า ─────────────────────────────────────────────────────────────── */
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.error("✗ " + m); process.exit(1); };

const { data: rows, error } = await sb.from("products").select("id,name,data").order("id");
if (error) die(`อ่านสินค้าไม่ได้: ${error.message}`);

const plans = [];
const skipped = [];
for (const row of rows) {
  if (ONLY.length && !ONLY.includes(row.id)) continue;
  const opts = row.data?.options ?? [];
  if (opts.some((o) => o.section)) { skipped.push([row, "แบ่งกลุ่มไว้แล้ว"]); continue; }
  if (opts.length < (ALL ? 1 : 3)) { skipped.push([row, `มีแค่ ${opts.length} กลุ่ม`]); continue; }
  const plan = buildPlan(opts, "kin") ?? buildPlan(opts, "all") ?? (ALL ? singleFrame(opts) : null);
  if (!plan) { skipped.push([row, "ไม่มีอะไรให้แบ่ง (ทุกกลุ่มเป็นเรื่องเดียวกัน หรือเป็นคนละเรื่องหมด)"]); continue; }
  plans.push({ row, ...plan });
}

/* ── รายงาน ─────────────────────────────────────────────────────────────────── */
for (const p of plans) {
  if (LIST) { console.log(`${p.row.id}\t${p.names.join(" · ")}`); continue; }
  console.log(`\n### ${p.row.id} — ${p.row.name}${p.row.data.hidden ? " [ร่าง]" : ""}${p.moved ? "  (สลับลำดับกลุ่ม)" : ""}`);
  let last = "";
  for (const o of p.nextOpts) {
    if (o.section !== last) { console.log(`  ┌ ${o.section}`); last = o.section; }
    const when = o.showWhen ? `  ← แสดงเมื่อ ${o.showWhen.label}` : "";
    console.log(`  │ ${o.label}${isMTO(o) ? "  [เข้ากล่อง 📐]" : ""}${when}`);
  }
}

/* ── เขียน ───────────────────────────────────────────────────────────────────── */
let wrote = 0;
if (WRITE) {
  for (const p of plans) {
    const { row, nextOpts } = p;
    const d = { ...row.data, options: nextOpts, savedAt: new Date().toISOString() };
    const { data: upd, error: e1 } = await sb.from("products").update({ data: d }).eq("id", row.id).select("id");
    if (e1 || !upd?.length) die(`${row.id}: update พัง/0 แถว ${e1?.message ?? ""}`);
    // อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
    const { data: back, error: e2 } = await sb.from("products").select("data").eq("id", row.id).single();
    if (e2) die(`${row.id}: อ่านกลับไม่ได้ ${e2.message}`);
    const key = (list) => list.map((o) => `${o.section ?? "-"}|${o.label}`).join("→");
    if (key(back.data.options) !== key(nextOpts)) die(`${row.id}: อ่านกลับไม่ตรง`);
    // ตัวเลือก/เงื่อนไขต้องเท่าเดิมทุกกลุ่ม — เทียบ "ทีละตำแหน่ง" กับแผน (สินค้าบางตัวมีกลุ่มชื่อซ้ำ
    // เช่น clipboard-acrylic มีกลุ่มชื่อ "สกรีน" 3 กลุ่ม หาด้วยชื่อจะได้ตัวแรกเสมอ)
    back.data.options.forEach((after, i) => {
      const want = nextOpts[i];
      for (const k of ["choices", "showWhen", "display", "multi", "collapsible", "madeToOrder", "standardInput"])
        if (JSON.stringify(want[k] ?? null) !== JSON.stringify(after[k] ?? null))
          die(`${row.id}: "${want.label}" ฟิลด์ ${k} เปลี่ยนไป`);
    });
    // และของเดิมต้องอยู่ครบ ไม่มีกลุ่มไหนหาย/งอก (นับเป็นถุง กันชื่อซ้ำ)
    const bag = (list) => JSON.stringify(list.map((o) => JSON.stringify({ ...o, section: undefined })).sort());
    if (bag(row.data.options) !== bag(back.data.options)) die(`${row.id}: เนื้อในกลุ่มไม่ตรงของเดิม`);
    const cells = (x) => Object.keys(x?.pricing?.cells ?? {}).length;
    if (cells(back.data) !== cells(row.data)) die(`${row.id}: คีย์ตารางราคาเปลี่ยน!`);
    if (JSON.stringify(back.data.priceRates ?? []) !== JSON.stringify(row.data.priceRates ?? [])) die(`${row.id}: เรทราคาเปลี่ยน!`);
    if ((back.data.rules ?? []).length !== (row.data.rules ?? []).length) die(`${row.id}: จำนวนกฎเปลี่ยน!`);
    wrote++;
    console.log(`✓ ${row.id} — ${p.names.length} ชุด`);
  }
}

const why = new Map();
for (const [, r] of skipped) why.set(r, (why.get(r) ?? 0) + 1);
console.log(`\nจัดชุดได้ ${plans.length} สินค้า${WRITE ? ` — เขียนแล้ว ${wrote} ✅` : " (ดูอย่างเดียว — ใส่ --write เพื่อเขียนจริง)"}`);
console.log("ข้าม: " + [...why].map(([r, n]) => `${r} ${n}`).join(" · "));
if (!LIST) {
  const notable = skipped.filter(([row, r]) => r !== "แบ่งกลุ่มไว้แล้ว" && (row.data?.options ?? []).length >= 3);
  if (notable.length) console.log("\nข้ามทั้งที่มี ≥3 กลุ่ม:\n" + notable.map(([row, r]) => `  ${row.id}\t${row.name} — ${r}`).join("\n"));
}
