/**
 * ช่องกรอก "จำนวนจุดไดคัท" ของงานไดคัท 50% — ผู้ใช้สั่ง 26 ส.ค. 69
 *
 * ลูกค้านับจุดไดคัทของลายเอง (มีอินโฟกราฟิกวิธีนับในแท็บ) แล้วระบบคิดส่วนเกินโควตาให้:
 *   A4 ฟรี 75 จุด · A5 ฟรี 50 · A6 ฟรี 25 · A7 ฟรี 12 · เล็กกว่า A7 ฟรี 1 จุด
 *   เกินโควตาคิดจุดละ ฿0.50 (ต่อ 1 แผ่น A3 ที่สั่ง — inputFee คิดต่อหน่วยขาย)
 * ขนาดกำหนดเองเทียบพื้นที่ (freeBySize): ≥600 ตร.ซม. ≈ A4 → 75 · ≥300 ≈ A5 → 50
 *   · ≥150 ≈ A6 → 25 · ≥75 ≈ A7 → 12 · เล็กกว่านั้น 1 จุด
 * ใช้กลไกใหม่ InputFee.free / rates[].free / freeBySize (products.ts รอบนี้)
 *
 * สินค้า: sticker-pp (แกน "ขนาดตัด") · sticker-uv (สองเรท → สองกลุ่มจุด ผูกเรทใครเรทมัน)
 * แถม: อัปเดต note/ป้าย/แท็บของ sticker-pp ให้ตรงตารางใหม่ (เพิ่ม A4 75 + เล็กกว่า A7 = 1)
 *   + อัปอินโฟกราฟิกการนับจุดเป็นไฟล์กลาง products/shared/dicut-dots.jpg ให้ตัวอื่นใช้ร่วม
 *
 * read-modify-write บนแถวจริง · รันซ้ำได้ · ไม่ใส่ --write = ดูอย่างเดียว
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const DOT_FEE = 0.5;
const QUOTA = { A4: 75, A5: 50, A6: 25, A7: 12 };
const CUSTOM_FREE = 1; // เล็กกว่า A7 (รวมยังไม่กรอกขนาด) ได้ 1 จุด
/** ขั้นพื้นที่ของขนาดกำหนดเอง (ตร.ซม.) — พื้นที่จริง A4 623.7 · A5 311.9 · A6 155.9 · A7 77.7 */
const TIERS = [
  { minArea: 600, free: QUOTA.A4 },
  { minArea: 300, free: QUOTA.A5 },
  { minArea: 150, free: QUOTA.A6 },
  { minArea: 75, free: QUOTA.A7 },
];
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
/** สินค้าที่ขายทั้งแผ่น A3 (ไม่มีขนาดตัด) — โควตาจุดต่อ 1 แผ่น A3 (ผู้ใช้เลือก 26 ส.ค. 69) */
const SHEET_FREE = 100;
const DOTS_IMG = "dicut-dots.jpg";
const DOTS_SRC = "scripts/assets/sticker-pp-dicut-dots.jpg";

const quotaText = `A4 ฟรี ${QUOTA.A4} จุด · A5 ฟรี ${QUOTA.A5} · A6 ฟรี ${QUOTA.A6} · A7 ฟรี ${QUOTA.A7} · เล็กกว่า A7 ฟรี 1 จุด`;
const SHEET_HINT = "นับจุดรวมทั้งแผ่น A3 (ดูวิธีนับจากรูปในแท็บ)";
const SHEET_NOTE = (free) =>
  `ฟรี ${free} จุดต่อแผ่น A3 — เกินคิดจุดละ ฿${DOT_FEE.toFixed(2)} · สั่ง 25 แผ่นขึ้นไปต่อ 1 ลาย ฟรีค่าจุด`;
const HINT = "นับจุดของลาย 1 ชิ้น (ดูวิธีนับจากรูปในแท็บ)";
const NOTE = `เกินโควตาของขนาดที่เลือก คิดจุดละ ฿${DOT_FEE.toFixed(2)} ต่อแผ่น A3 · สั่ง 25 แผ่นขึ้นไปต่อ 1 ลาย ฟรีค่าจุด`;

const WRITE = process.argv.includes("--write");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const dotsUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/shared/${DOTS_IMG}`;

if (WRITE) {
  const buf = fs.readFileSync(DOTS_SRC);
  const up = await sb.storage.from("product-images").upload(`products/shared/${DOTS_IMG}`, buf, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (up.error) throw new Error(`อัป ${DOTS_IMG}: ${up.error.message}`);
  console.log(`อัป products/shared/${DOTS_IMG} (${(buf.length / 1024).toFixed(0)} KB)`);
}

/**
 * สร้างกลุ่มช่องกรอกจำนวนจุด 1 กลุ่ม ผูกกับกลุ่มขนาดตัด 1 กลุ่ม (เรทใครเรทมัน)
 * เงื่อนไขแสดงผลก๊อปจากกลุ่มขนาดนั้นตรง ๆ — โผล่พร้อมกันเสมอ
 */
function dotsGroup(label, sizeGroup, pairW, pairH) {
  return {
    label,
    choices: [],
    display: "input",
    standardInput: true,
    showWhen: sizeGroup.showWhen,
    ...(sizeGroup.showWhenAlso ? { showWhenAlso: sizeGroup.showWhenAlso } : {}),
    ...(sizeGroup.showWhenAll ? { showWhenAll: sizeGroup.showWhenAll } : {}),
    note: NOTE,
    input: { kind: "number", integer: true, unit: "จุด", min: 1, max: 500, placeholder: "เช่น 15", hint: HINT },
    inputFee: {
      perUnit: DOT_FEE,
      free: CUSTOM_FREE,
      rates: Object.entries(QUOTA).map(([size, free]) => ({
        when: { label: sizeGroup.label, choices: [size] },
        free,
      })),
      freeBySize: { widthLabel: pairW, heightLabel: pairH, tiers: TIERS },
    },
  };
}

/** กลุ่มจุดของสินค้าขายทั้งแผ่น A3 — โควตาเหมาต่อแผ่น โผล่เมื่อเลือกไดคัท 50% */
function sheetDotsGroup(label, showWhen) {
  return {
    label,
    choices: [],
    display: "input",
    standardInput: true,
    ...(showWhen ? { showWhen } : {}),
    note: SHEET_NOTE(SHEET_FREE),
    input: { kind: "number", integer: true, unit: "จุด", min: 1, max: 1000, placeholder: "เช่น 40", hint: SHEET_HINT },
    inputFee: { perUnit: DOT_FEE, free: SHEET_FREE },
  };
}

/** เติมป้ายโควตาจุดท้ายป้ายเดิมของตัวเลือกขนาด (รันซ้ำ: ตัดท่อน "· ไม่เกิน/ฟรี ... จุด" เดิมก่อน) */
function badgeQuota(group) {
  for (const c of group.choices || []) {
    const q = QUOTA[c.name];
    const base = (c.badge || "").split(" · ").filter((s) => !/จุด$/.test(s)).join(" · ");
    if (q) c.badge = base ? `${base} · ฟรี ${q} จุด` : `ฟรี ${q} จุด`;
    else if (base !== (c.badge || "")) c.badge = base || undefined;
  }
}

/**
 * สินค้าเป้าหมาย — "แผน" ต่อสินค้าอ่านสดจากแถวตอนรัน ไม่ฟิกไว้ในสคริปต์:
 * มีกลุ่มขนาดตัด (A4-A7 + กำหนดเอง) → โควตาตามขนาด + พื้นที่ที่กรอก · ไม่มี → โควตาเหมาต่อแผ่น A3
 * (26 ส.ค. 69 มีงานอีกสายกำลังทยอยเพิ่มกลุ่มขนาดตัดให้ตัวที่ขายทั้งแผ่น — อ่านสดจะได้ไม่ทับ/ไม่หลงโหมด
 *  และรันซ้ำหลังสินค้าเปลี่ยนโหมดแล้วสเปกจุดจะตามไปเอง)
 */
const IDS = [
  "sticker-pp",
  "sticker-uv",
  "neon",
  "sticker-rainbow-film",
  "reflective-sticker",
  "sticker-gold-silver-rosegold",
  "sticker-hologram",
  "sticker-solvent",
];

/** แผนของสินค้าตัวนี้จากกลุ่มที่มีจริงในแถว */
function plansOf(p) {
  const sized = (p.options || []).filter(
    (o) =>
      /^ขนาดตัด(\s*\([^)]*\))?$/.test(o.label) &&
      (o.choices || []).some((c) => QUOTA[c.name]) &&
      (o.choices || []).some((c) => c.name === CUSTOM)
  );
  if (!sized.length) return [{ sheet: true, dots: "จำนวนจุดไดคัท", after: "แบบไดคัท" }];
  return sized.map((g) => {
    // "ขนาดตัด" → คู่ "ขนาดตัด (กว้าง/สูง)" · "ขนาดตัด (ตร.ม.)" → "ขนาดตัด ตร.ม. (กว้าง/สูง)"
    const base = g.label.replace(/\s*\(([^)]*)\)\s*$/, (_m, x) => ` ${x}`).trim();
    const suffix = g.label === base ? "" : g.label.slice(base.length - g.label.length) ;
    const tag = /\(([^)]*)\)\s*$/.exec(g.label)?.[1];
    return {
      size: g.label,
      dots: tag ? `จำนวนจุดไดคัท (${tag})` : "จำนวนจุดไดคัท",
      w: `${base} (กว้าง)`,
      h: `${base} (สูง)`,
    };
  });
}

for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  if (error || !row) {
    console.log(`\n=== ${id} — ❌ ${error?.message || "ไม่พบสินค้า"}`);
    continue;
  }
  const p = row.data;
  const plans = plansOf(p);
  const log = [];

  const sheetMode = plans.some((pl) => pl.sheet);
  for (const plan of plans) {
    if (plan.sheet) {
      // หา "ไดคัท 50%" ของสินค้านี้ (ชื่อเต็มต่างกันได้ เช่น มีวงเล็บอธิบายต่อท้าย)
      const cutGroup = (p.options || []).find((o) => o.label === "แบบไดคัท");
      const c50 = (cutGroup?.choices || []).find((c) => /^ไดคัท 50%/.test(c.name));
      // ไม่มีกลุ่มแบบไดคัท = สินค้าขายไดคัท 50% อย่างเดียว → ช่องจุดโชว์ตลอด
      const g = sheetDotsGroup(plan.dots, c50 ? { label: "แบบไดคัท", choices: [c50.name] } : undefined);
      const at = (p.options || []).findIndex((o) => o.label === plan.dots);
      if (at >= 0) {
        p.options[at] = { ...p.options[at], ...g };
        log.push(`อัปเดตกลุ่ม "${plan.dots}" (มีอยู่แล้ว)`);
      } else {
        const i = p.options.findIndex((o) => o.label === plan.after);
        p.options.splice((i >= 0 ? i : p.options.length - 1) + 1, 0, g);
        log.push(`เพิ่มกลุ่ม "${plan.dots}" หลัง "${plan.after}" (โควตาเหมา ${SHEET_FREE} จุด/แผ่น A3)`);
      }
      continue;
    }
    const sizeGroup = (p.options || []).find((o) => o.label === plan.size);
    const pairH = (p.options || []).find((o) => o.label === plan.h);
    if (!sizeGroup || !pairH) {
      log.push(`⚠️ ไม่พบกลุ่ม "${plan.size}" หรือช่องกรอก "${plan.h}" — ข้าม`);
      continue;
    }
    if (!(sizeGroup.choices || []).some((c) => c.name === CUSTOM)) log.push(`⚠️ "${plan.size}" ไม่มีตัวเลือกกำหนดขนาดเอง`);
    badgeQuota(sizeGroup);

    const g = dotsGroup(plan.dots, sizeGroup, plan.w, plan.h);
    const at = (p.options || []).findIndex((o) => o.label === plan.dots);
    if (at >= 0) {
      p.options[at] = { ...p.options[at], ...g }; // รันซ้ำ — ทับสเปกล่าสุด
      log.push(`อัปเดตกลุ่ม "${plan.dots}" (มีอยู่แล้ว)`);
    } else {
      // แทรกถัดจากช่องกรอกด้านสูงของขนาดกำหนดเอง — จุดอยู่ท้ายเรื่องขนาดพอดี
      const i = p.options.findIndex((o) => o.label === plan.h);
      p.options.splice(i + 1, 0, g);
      log.push(`เพิ่มกลุ่ม "${plan.dots}" หลัง "${plan.h}"`);
    }
    log.push(`   โควตา: ${Object.entries(QUOTA).map(([s, q]) => `${s}=${q}`).join(" ")} · กำหนดเองตามพื้นที่ (ต่ำสุด ${CUSTOM_FREE})`);
  }

  // note เดิมของกลุ่มขนาดตัด (เขียนรอบก่อน) — อัปเดตให้ตรงตารางใหม่ (A4 75 + เล็กกว่า A7 = 1)
  for (const plan of plans) {
    if (plan.sheet) continue;
    const sizeGroup = (p.options || []).find((o) => o.label === plan.size);
    if (!sizeGroup) continue;
    sizeGroup.note = "วางลายห่างกันอย่างน้อย 2 มม. · จุดไดคัทเกินโควตาของขนาด คิดจุดละ ฿0.50 (กรอกช่องด้านล่าง)";
  }

  // ข้อความเดิมที่ยังใช้ตารางเก่า (A5/A6/A7 ไม่มี A4) — เก็บกวาดใน terms/แท็บทุกใบ
  const OLD_TABLE = /A5\s*(ไม่เกิน|≤)\s*50\s*จุด\s*\/\s*A6\s*(ไม่เกิน|≤)?\s*25\s*จุด\s*\/\s*A7\s*(ไม่เกิน|≤)?\s*12\s*จุด/;
  const NEW_TABLE = sheetMode
    ? `ทั้งแผ่น A3 ฟรี ${SHEET_FREE} จุด`
    : `A4 ≤ ${QUOTA.A4} จุด / A5 ≤ ${QUOTA.A5} / A6 ≤ ${QUOTA.A6} / A7 ≤ ${QUOTA.A7} / เล็กกว่า A7 = 1 จุด`;
  const sweep = (text) => (text || "").split("\n").map((l) => (OLD_TABLE.test(l) ? l.replace(OLD_TABLE, NEW_TABLE) : l)).join("\n");
  if (OLD_TABLE.test(p.terms || "")) { p.terms = sweep(p.terms); log.push("terms: อัปเดตตารางโควตาเก่า"); }
  for (const t of p.tabs || []) {
    if (!OLD_TABLE.test(t.text || "")) continue;
    // บรรทัดเก่าที่ซ้ำกับบรรทัดใหม่ในแท็บเดียวกัน — ถอดทิ้ง ไม่งั้นบอกสองรอบ
    t.text = t.text
      .split("\n")
      .filter((l) => !(/^• จุดไดคัท \(ไดคัท 50%\)/.test(l) && /• จำนวนจุดไดคัท \(ไดคัท 50%\)/.test(t.text)))
      .map((l) => (OLD_TABLE.test(l) ? l.replace(OLD_TABLE, NEW_TABLE) : l))
      .join("\n");
    log.push(`แท็บ "${t.title}": อัปเดตตารางโควตาเก่า`);
  }

  // แท็บ: อัปเดตบรรทัดจำนวนจุด + แนบอินโฟกราฟิกวิธีนับ (ใช้ไฟล์กลาง)
  const tab = (p.tabs || []).find((t) => /ข้อควรทราบ|รายละเอียดเพิ่มเติม/.test(t.title)) || (p.tabs || [])[0];
  if (tab) {
    const dotLine = sheetMode
      ? `• จำนวนจุดไดคัท (ไดคัท 50%): ฟรี ${SHEET_FREE} จุดต่อ 1 แผ่น A3 — เกินกำหนดคิดจุดละ ${DOT_FEE.toFixed(2)} บาท (ดูวิธีนับจุดจากรูป)`
      : `• จำนวนจุดไดคัท (ไดคัท 50%): A4 ไม่เกิน ${QUOTA.A4} จุด / A5 ${QUOTA.A5} / A6 ${QUOTA.A6} / A7 ${QUOTA.A7} / เล็กกว่า A7 ได้ 1 จุด — เกินกำหนดคิดจุดละ ${DOT_FEE.toFixed(2)} บาท (ดูวิธีนับจุดจากรูป)`;
    if (/• จำนวนจุดไดคัท[^\n]*/.test(tab.text || "")) tab.text = tab.text.replace(/• จำนวนจุดไดคัท[^\n]*/, dotLine);
    else tab.text = `${(tab.text || "").trim()}\n${dotLine}`.trim();
    tab.images = [...new Set([...(tab.images || []), dotsUrl])];
    log.push(`แท็บ "${tab.title}": อัปเดตบรรทัดจุดไดคัท + รูปวิธีนับ`);
  }

  console.log(`\n=== ${id} — ${p.name || ""}`);
  log.forEach((l) => console.log("   •", l));
  const dotsGroups = (p.options || []).filter((o) => /^จำนวนจุดไดคัท/.test(o.label));
  for (const g of dotsGroups)
    console.log(`   [${g.label}] showWhen=${JSON.stringify(g.showWhen)} also=${JSON.stringify(g.showWhenAlso || null)} ` +
      (g.inputFee.rates ? `rates=${g.inputFee.rates.length} ข้อ` : `free เหมา=${g.inputFee.free}`));

  if (!WRITE) continue;
  const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", id);
  console.log(upErr ? "   ❌ " + upErr.message : "   ✅ saved");
}

if (!WRITE) console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
