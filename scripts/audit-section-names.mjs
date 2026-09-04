#!/usr/bin/env node
/**
 * 🔍 ตรวจ "ชื่อชุดตัวเลือก (ProductOption.section) ตรงกับกลุ่มที่อยู่ในชุดนั้นไหม" ทั้งร้าน
 *   [ผู้ใช้สั่ง 4 ก.ย. 69: "สินค้าตัวอื่น ๆ ชื่อกลุ่มคล้ายกับตัวเลือกไหม ถ้าไม่คล้าย แก้ให้หน่อย"]
 *
 *   node scripts/audit-section-names.mjs           ดูรายการที่ชื่อไม่ตรงเนื้อใน
 *   node scripts/audit-section-names.mjs --all     กางทุกชุดของสินค้าที่มีปัญหา
 *   node scripts/audit-section-names.mjs --write   เปลี่ยนชื่อชุดที่ไม่ตรง + อ่านกลับเทียบ
 *   node scripts/audit-section-names.mjs --write 2-2-2 acrylic-dookdik   เฉพาะบางตัว
 *
 * วิธีตัดสิน (ยึดเกณฑ์เดียวกับ scripts/auto-option-sections.mjs — ใช้ RULES/classify ชุดเดียวกัน)
 *   1) จัดหมวดชื่อกลุ่มทุกกลุ่มในชุด → ได้ "คำหมวด" (facet) เช่น ขนาด · งานพิมพ์ · ตะขอ
 *   2) ชื่อชุดถือว่า **ตรง** ถ้าคำในชื่อชุดไปโผล่ใน facet ของกลุ่มไหนก็ได้ในชุดนั้น
 *      หรือชื่อชุดเป็นชื่อกลุ่มตรง ๆ (ชุดกลุ่มเดียวมักตั้งชื่อแบบนั้น)
 *   3) ไม่ตรงเลยสักคำ = รายงาน + เสนอชื่อใหม่ที่คิดจากเนื้อในจริง
 *
 * ⚠️ แตะแค่ `section` (ชื่อชุด) — ไม่สลับลำดับกลุ่ม ไม่แตะตัวเลือก/ราคา/กฎ/showWhen
 *    (ต่างจาก auto-option-sections.mjs ที่จัดกลุ่มใหม่ทั้งใบ — ตัวนี้ปลอดภัยกว่า ใช้กับสินค้าที่แบ่งชุดไว้แล้ว)
 * รันซ้ำได้: รอบสองไม่เจออะไรให้แก้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ARGV = process.argv.slice(2);
const WRITE = ARGV.includes("--write");
const ALL = ARGV.includes("--all");
const ONLY = ARGV.filter((a) => !a.startsWith("--"));

/* ── หมวดชื่อกลุ่ม — ลอกจาก scripts/auto-option-sections.mjs (ต้องแก้คู่กันเสมอ) ───────── */
const RULES = [
  { piece: true, re: /ชิ้นที่\s*(\d+)/ },
  // ⚠️ (?<!มาตร) กัน "มาตรฐาน" มาแมตช์คำว่า ฐาน — ต้นเหตุที่ผ้าเชียร์เคยได้ชุด "4. ฐาน"
  { cat: "base", facet: "ฐาน", re: /(?<!มาตร)ฐาน|ขาตั้ง|Magsafe coil/i },
  { cat: "hook", facet: "ตัวห้อย", re: /^ตัวห้อย/ },
  { cat: "hook", facet: "ตะขอ", re: /ตะขอ|โซ่|ห้อย|พวงกุญแจ|สายคล้อง|คล้องคอ|ริบบิ้น|เชือก|สปริง|คาราไบเนอร์|จุก|แหวน|ที่ล็อค|กระดิ่ง/ },
  { cat: "hook", facet: "อะไหล่", re: /อะไหล่|แม่เหล็ก|กิ๊บ|หูกระเป๋า|พู่|ตาไก่|เข็มกลัด|ไส้หมอน|ถุงบรรจุ|^ตัวน้อย|Fimo|ช่องกรอบ|วิธีปิด|ประกอบ/i },
  { cat: "print", facet: "ฟอยล์", re: /ฟอยล์|ปั๊มนูน|ปั๊มจม/ },
  { cat: "coat", facet: "เคลือบผิว", re: /เคลือบ|ลามิเนต|ผิวฟิล์ม|ฟิล์มพิเศษ|ผิวงาน|ผิวเนื้อ/ },
  { cat: "print", facet: "งานปัก", re: /ปัก|ไหม|ฟอนต์/ },
  { cat: "print", facet: "งานสกรีน", re: /สกรีน|สรีน/ },
  { cat: "print", facet: "จำนวนด้าน", re: /จำนวนด้าน|กี่ด้าน/ },
  { cat: "print", facet: "งานพิมพ์", re: /พิมพ์|รองขาว|รองพื้นขาว|ซับลิเมชั่น|เทคนิค|ตำแหน่งงาน|UV|DTF|FLEX/i },
  { cat: "addon", facet: "ของเสริม", re: /add[ ._-]?on|อุปกรณ์เสริม|ลูกเล่น|ของแถม|เสริม(?!แรง)/i },
  { cat: "mat", facet: "สี", re: /สีพิเศษ|เฉดสี/ },
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
const classify = (label) => {
  const hit = RULES.find((r) => r.re.test(label));
  if (!hit) return { cat: "etc", facet: label.length <= 14 ? label : "ตัวเลือกอื่น ๆ" };
  if (!hit.piece) return { cat: hit.cat, facet: hit.facet };
  return { cat: `piece${label.match(hit.re)[1]}`, facet: `ชิ้นที่ ${label.match(hit.re)[1]}` };
};

/** ชื่อชุดจาก facet ของกลุ่มในชุด — แม่ขึ้นก่อนลูก ตัดเหลือ 2 คำ (ลอกจาก sectionNames) */
function nameOf(bucket, used) {
  const facets = [...bucket.filter((x) => !x.child), ...bucket.filter((x) => x.child)].map((x) => x.facet);
  let uniq = [...new Set(facets)];
  const fresh = uniq.filter((f) => !used.has(f));
  uniq = fresh.length ? fresh : uniq.slice(0, 1);
  if (uniq.length > 2) uniq = uniq.slice(0, 2);
  uniq.forEach((f) => used.add(f));
  return uniq.join(" + ");
}

/**
 * ชื่อชุดกับชื่อกลุ่ม "คล้ายกัน" ไหม — มีท่อนตัวอักษรยาว ≥ 4 ตัวร่วมกัน
 * ("เนื้อกระดาษ" ↔ "ชนิดกระดาษ" มี กระดาษ ร่วมกัน = คล้าย · ชื่อชุดแบบนี้ดีกว่าคำหมวดกลาง "เนื้อวัสดุ")
 * ⚠️ ต้อง ≥ 4 ตัว — ถ้าเอา 3 คำว่า "ฐาน" จะไปคล้ายกับ "มาตรฐาน" (เคสที่ทำให้ผ้าเชียร์ได้ชุดผิด)
 */
const shares = (a, b, n = 4) => {
  for (let i = 0; i + n <= a.length; i++) if (b.includes(a.slice(i, i + n))) return true;
  return false;
};

/* ── โหลด ──────────────────────────────────────────────────────────────────── */
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.error("✗ " + m); process.exit(1); };

const { data: rows, error } = await sb.from("products").select("id,name,data").order("id");
if (error) die(`อ่านสินค้าไม่ได้: ${error.message}`);

/* ── ชื่อชุดที่ "ดูแล้วโอเค" — คนตั้งเอง สื่อความหมายดีกว่าคำหมวดอัตโนมัติ (ตรวจมือ 4 ก.ย. 69)
   ใส่ไว้เพื่อให้รันซ้ำแล้วเงียบ + เก็บเหตุผลไว้ให้คนอ่านทีหลัง */
const KEEP = new Map([
  ["2-2-2|4. ขนาดเกินมาตรฐาน", "กลุ่ม 'ผ้ากว้างเกินขนาดมาตรฐาน' — ชื่อตรงแล้ว (คำหมวดอัตโนมัติจับเป็น 'งานสกรีน' เพราะมีคำว่าสกรีนในวงเล็บ)"],
  ["acrylic-ferris-wheel|3. ตกแต่งเพิ่ม (ไม่บังคับ)", "กลุ่มชิ้นส่วน (แกนกลาง/เสาตั้ง/ตัวห้อย/ฐาน) ที่เลือกอัปเกรดสีพิเศษ/สกรีน 2 ด้านได้ — 'ตกแต่งเพิ่ม' ตรงกับสิ่งที่เลือกจริง"],
  ["keyring-multi-charm|ทั้งพวง", "ชื่อที่คนตั้งเอง อ่านง่ายกว่า 'เนื้อวัสดุ + จำนวน'"],
  ["keyring-multi-charm|ตัวหลัก", "ชิ้นหลักของพวง — ชัดกว่า 'ชิ้นที่ 1'"],
  ["new-mt1dwpc1-6773|ทั้งชุด", "กลุ่ม 'จำนวนชิ้นใน 1 ฐาน' = ตั้งค่าทั้งชุด"],
  ["neon|1. วิธีขาย", "กลุ่ม 'ขายแบบ' — วิธีขาย ตรงความหมาย"],
  ["package-backing|3. งานหลังพิมพ์", "เจาะรู + การตัด = งานหลังพิมพ์ (ศัพท์โรงพิมพ์)"],
  ["sticker-rainbow-film|1. เนื้อสติ๊กเกอร์", "กลุ่ม 'ชนิดฟิล์ม' ตัวเลือกคือ สติ๊กเกอร์ฟิล์ม Red/Blue RainBow — เนื้อสติ๊กเกอร์ ตรงแล้ว"],
]);
/** "ติ่งห้อย ชิ้นที่ N" ของพวงกุญแจหลายชิ้น — คนตั้งเอง นับเฉพาะติ่ง ไม่นับตัวหลัก */
const keepRe = [/^ติ่งห้อย ชิ้นที่ \d+$/];
const kept = (id, sec) => KEEP.has(`${id}|${sec}`) || keepRe.some((re) => re.test(sec));

/* ── ตรวจทีละสินค้า ─────────────────────────────────────────────────────────── */
const report = [];
for (const row of rows) {
  if (ONLY.length && !ONLY.includes(row.id)) continue;
  const opts = row.data?.options ?? [];
  if (!opts.some((o) => o.section)) continue;                 // ยังไม่ได้แบ่งชุด — ไม่ใช่เรื่องของสคริปต์นี้
  const info = new Map(opts.map((o) => [o, { ...classify(o.label), child: !!o.showWhen?.label }]));

  /* (ก) กลุ่มที่ไม่มีชุดเลย ทั้งที่สินค้าตัวนี้แบ่งชุดแล้ว — หน้าร้านจะโผล่นอกกรอบหัวข้อ
     ตั้งชุดให้ตามเพื่อนบ้าน: หน้า/หลังเป็นชุดเดียวกัน = ใช้ชุดนั้น · ชุดถัดไปมีคำหมวดนี้อยู่แล้ว = รวมเข้าไป
     · นอกนั้นเปิดชุดใหม่หน้าชุดถัดไป (เลข = เลขชุดถัดไป − 1) */
  const orphans = [];
  opts.forEach((o, i) => {
    if (o.section) return;
    const prev = [...opts.slice(0, i)].reverse().find((x) => x.section)?.section ?? null;
    const next = opts.slice(i + 1).find((x) => x.section)?.section ?? null;
    const facet = info.get(o).facet;
    let want;
    if (prev && next && prev === next) want = prev;
    else if (next && next.replace(/^\s*\d+\.\s*/, "").includes(facet)) want = next;
    else if (prev && prev.replace(/^\s*\d+\.\s*/, "").includes(facet)) want = prev;
    else if (next) want = `${Math.max(1, (parseInt(next, 10) || 2) - 1)}. ${facet}`;
    else want = prev ?? `1. ${facet}`;
    orphans.push({ o, want, facet });
  });

  /* (ข) ชื่อชุดไม่มีคำร่วมกับกลุ่มข้างในเลย — รายงานให้คนตัดสิน ไม่แก้อัตโนมัติ
     (ชื่อที่คนตั้งเองมักสื่อความหมายดีกว่าคำหมวด — ตัวที่ตรวจแล้วโอเคอยู่ใน KEEP) */
  const order = [...new Set(opts.filter((o) => o.section).map((o) => o.section))];
  const used = new Set();
  const naming = [];
  order.forEach((sec, i) => {
    const bucket = opts.filter((o) => o.section === sec);
    const want = nameOf(bucket.map((o) => info.get(o)), used);
    const cur = sec.replace(/^\s*\d+\.\s*/, "").trim();
    const facets = new Set(bucket.map((o) => info.get(o).facet));
    const labels = bucket.map((o) => o.label);
    const words = cur.split(/\s*\+\s*/).map((w) => w.trim()).filter(Boolean);
    const ok = words.some((w) =>
      [...facets].some((f) => f.includes(w) || w.includes(f)) ||
      labels.some((l) => l.includes(w) || w.includes(l) || shares(w, l))
    );
    if (!ok && !kept(row.id, sec)) naming.push({ sec, want: `${i + 1}. ${want}`, labels });
  });

  if (orphans.length || naming.length) report.push({ row, opts, info, orphans, naming });
}

/* ── รายงาน ────────────────────────────────────────────────────────────────── */
for (const r of report) {
  console.log(`\n### ${r.row.id} — ${r.row.name}${r.row.data.hidden ? " [ร่าง]" : ""}`);
  if (ALL) for (const o of r.opts) console.log(`  │ ${(o.section ?? "‼️ ไม่มีชุด").padEnd(26)} | ${o.label}  (${r.info.get(o).facet})`);
  for (const x of r.orphans) console.log(`  ‼️  "${x.o.label}" ไม่มีชุด (โผล่นอกกรอบหัวข้อ)  →  ใส่ "${x.want}"`);
  for (const b of r.naming) {
    console.log(`  ⚠️  ชื่อชุด "${b.sec}" ไม่มีคำร่วมกับกลุ่มข้างใน  →  เสนอ "${b.want}"`);
    console.log(`      กลุ่มในชุดนี้: ${b.labels.join(" · ")}`);
  }
}
const nOrphan = report.reduce((n, r) => n + r.orphans.length, 0);
const nName = report.reduce((n, r) => n + r.naming.length, 0);
console.log(`\nกลุ่มที่ไม่มีชุด ${nOrphan} กลุ่ม (แก้อัตโนมัติได้) · ชื่อชุดที่ต้องคนดู ${nName} ชุด`);
if (!WRITE) { console.log("(ดูอย่างเดียว — ใส่ --write เพื่อเขียนจริง · --write แก้เฉพาะกลุ่มที่ไม่มีชุด)"); process.exit(0); }

/* ── เขียน — ใส่ชุดให้กลุ่มที่ไม่มีชุดเท่านั้น (แตะแค่ section ไม่ย้ายลำดับ) ─────── */
let wrote = 0;
for (const r of report) {
  if (!r.orphans.length) continue;
  const want = new Map(r.orphans.map((x) => [x.o, x.want]));
  const nextOpts = r.opts.map((o) => (want.has(o) ? { ...o, section: want.get(o) } : o));
  const d = { ...r.row.data, options: nextOpts, savedAt: new Date().toISOString() };
  const { data: upd, error: e1 } = await sb.from("products").update({ data: d }).eq("id", r.row.id).select("id");
  if (e1 || !upd?.length) die(`${r.row.id}: update พัง/0 แถว ${e1?.message ?? ""}`);
  // อ่านกลับเทียบ — เนื้อในต้องเท่าเดิมเป๊ะ เปลี่ยนแค่ชื่อชุด
  const { data: back, error: e2 } = await sb.from("products").select("data").eq("id", r.row.id).single();
  if (e2) die(`${r.row.id}: อ่านกลับไม่ได้ ${e2.message}`);
  const key = (list) => list.map((o) => `${o.section ?? "-"}|${o.label}`).join("→");
  if (key(back.data.options) !== key(nextOpts)) die(`${r.row.id}: อ่านกลับชื่อชุดไม่ตรง`);
  const bag = (list) => JSON.stringify(list.map((o) => JSON.stringify({ ...o, section: undefined })).sort());
  if (bag(r.row.data.options) !== bag(back.data.options)) die(`${r.row.id}: เนื้อในกลุ่มเปลี่ยนไป!`);
  if (JSON.stringify(back.data.priceRates ?? []) !== JSON.stringify(r.row.data.priceRates ?? [])) die(`${r.row.id}: เรทราคาเปลี่ยน!`);
  if (JSON.stringify(back.data.pricing ?? null) !== JSON.stringify(r.row.data.pricing ?? null)) die(`${r.row.id}: ตารางราคาเปลี่ยน!`);
  if ((back.data.rules ?? []).length !== (r.row.data.rules ?? []).length) die(`${r.row.id}: จำนวนกฎเปลี่ยน!`);
  wrote++;
  console.log(`✓ ${r.row.id} — ${r.orphans.map((x) => `"${x.o.label}" → "${x.want}"`).join(" · ")}`);
}
console.log(`\n✅ ใส่ชุดให้กลุ่มที่ตกหล่นแล้ว ${wrote} สินค้า`);
