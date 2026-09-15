/**
 * 🦶 ค่าฐานสแตนดี้ กลับไปใช้กติกาเดิม 2 ขั้น (เจ้าของร้านสั่ง 15 ก.ย. 69 — หลังเห็นหน้าสแตนดี้อะคริลิค)
 *
 * "เรทราคา 1-10 ชิ้น ฐานไม่เกิน 6 ซม. ฟรีค่ะ ตั้งแต่ 7 ซม. เพิ่มเซนละ 5 บาท"
 * → ย้อน scripts/standee-base-fee-flat.mts (commit 2fb7d0a) เฉพาะ "งานสแตนดี้" 7 ตัว
 *   คืน extraFromQty 11 + extraBelow (ปลีก ≤6 ซม. ฟรี · 7 ซม.ขึ้นไป ซม.ละ ฿5) จากไฟล์สำรอง
 *   ⚠️ Photo Frame (photo-fram-acrylic) ไม่แตะ — เจ้าของร้านให้คงปลีก=ส่งไว้ตามที่เคาะตอนใบเสนอราคา
 * พร้อมเขียนโน้ตใต้กลุ่ม "ขนาดฐาน" ใหม่ให้สั้นลง (เจ้าของร้านสั่ง "กระชับข้อความให้หน่อย")
 *
 *   npx tsx scripts/standee-base-fee-retail-free.mts            # ดูก่อน
 *   npx tsx scripts/standee-base-fee-retail-free.mts --write
 *   npx tsx scripts/standee-base-fee-retail-free.mts standy --write
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { unitPriceFor, type Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

/** ค่าเดิมก่อนโดนสคริปต์ปลีก=ส่ง — ใช้เป็นต้นฉบับคืนค่า ไม่คำนวณเอง */
const BACKUP = "backups/standee-base-fee-flat-before-2026-09-15T09-13-46.json";
/** ⛔ Photo Frame อยู่ในไฟล์สำรองคนละใบอยู่แล้ว แต่กันพลาดไว้อีกชั้น */
const SKIP = new Set(["photo-fram-acrylic"]);

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const isBaseSizeGroup = (g: any) => /^ขนาดฐาน/.test(String(g?.label ?? "").trim());

/* ── โน้ตใต้กลุ่มขนาดฐาน — สั้น บรรทัดเดียว ────────────────────────────── */
/** ดึงเลขเซนติเมตรจากชื่อตัวเลือก ("6cm" · "ฐาน 3-5 ซม.") */
const cmSpan = (name: string) => {
  const m = String(name).match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return { lo: +m[1], hi: +m[2] };
  const one = String(name).match(/(\d+)/);
  return one ? { lo: +one[1], hi: +one[1] } : null;
};
function conciseNote(choices: any[]) {
  const paid = choices.filter((c) => (c.extraBelow ?? 0) > 0);
  const free = choices.filter((c) => !((c.extraBelow ?? 0) > 0));
  const extras = choices.map((c) => c.extra ?? 0);
  const table = `11 ชิ้นขึ้นไป คิดตามตารางค่าฐานของร้าน ฿${Math.min(...extras)}-฿${Math.max(...extras)}`;
  if (!paid.length) return `ค่าฐานรวมในราคาแล้ว · ${table}`;
  const step = paid.length > 1 ? (paid[1].extraBelow ?? 0) - (paid[0].extraBelow ?? 0) : paid[0].extraBelow ?? 0;
  const from = cmSpan(paid[0].name)?.lo ?? 7;
  const freeTail = free.length ? `ฐานไม่เกิน ${cmSpan(free[free.length - 1].name)?.hi ?? from - 1} ซม. ฟรี · ` : "";
  return `ค่าฐาน 1-10 ชิ้น: ${freeTail}${from} ซม. ขึ้นไป ซม. ละ ฿${step} · ${table}`;
}

/* ── ข้อความในแท็บ: กลับไปเป็นสำนวนเดิม (ย้อน TEXT_FIXES ของสคริปต์ปลีก=ส่ง) ── */
const TEXT_BACK: Record<string, [string, string][]> = {
  standy: [
    [
      "• ราคาในตารางรวมแล้ว: ตัวสแตนดี้ + Add-on สกรีน 2 ด้าน / 3 เลเยอร์ + อะคริลิคสีพิเศษ — ค่าฐานบวกเพิ่มตามขนาดฐานที่เลือก",
      "• ราคาในตารางรวมแล้ว: ตัวสแตนดี้ + ฐาน (สกรีน/ไม่สกรีน) + Add-on สกรีน 2 ด้าน / 3 เลเยอร์ + อะคริลิคสีพิเศษ",
    ],
    [
      "• ค่าฐานคิดเท่ากันทั้งราคาปลีกและราคาส่ง ตามตารางค่าฐานสแตนดี้ของร้าน (3-5 ซม. 10 · 6-7 ซม. 15 · 8 ซม. 20 … 20 ซม. 80 บาท/ชิ้น · ระบบคิดให้แล้ว)",
      "• ช่วงปลีก 1-10 ชิ้น: ฐานไม่เกิน 6 ซม. รวมในราคาแล้ว · ตั้งแต่ 7 ซม. ขึ้นไป คิดเพิ่ม ซม. ละ 5 บาท (ระบบคิดให้แล้ว)",
    ],
  ],
  "new-mt1k6h3q-6601": [
    [
      "• ราคาต่อชิ้นรวมค่าจุกใสแล้ว (ปกติชุดละ 10 บาท) · ค่าฐานคิดเท่ากันทั้งราคาปลีกและราคาส่ง ตามตารางค่าฐานสแตนดี้ของร้าน (3-5 ซม. 10 · 6-7 ซม. 15 · 8 ซม. 20 · 20 ซม. 80 บาท/ชิ้น)",
      "• ราคาต่อชิ้นรวมค่าจุกใสแล้ว (ปกติชุดละ 10 บาท) · ค่าฐาน 1-10 ชิ้น ฐานไม่เกิน 6 ซม. ฟรี · 7 ซม.ขึ้นไปเพิ่ม ซม.ละ 5 บาท · ตั้งแต่ 11 ชิ้น คิดตามตาราง (3-5 ซม. 10 · 6-7 ซม. 15 · 8 ซม. 20 · 20 ซม. 80 บาท/ชิ้น)",
    ],
    [
      "• ขนาดฐาน 2-20 ซม. — ค่าฐานคิดเท่ากันทั้งราคาปลีกและราคาส่ง ไม่มีช่วงไหนฟรี",
      "• ขนาดฐาน 2-20 ซม. — ช่วงปลีก 1-10 ชิ้น ฐานไม่เกิน 6 ซม. ฟรี · 7 ซม.ขึ้นไปเพิ่ม ซม.ละ 5 บาท (7 ซม. +5 · 8 ซม. +10 · ไปจนถึง 20 ซม. +70)",
    ],
    [
      "• คิดตามตารางค่าฐานสแตนดี้ของร้าน: 3-5 ซม. 10 · 6-7 ซม. 15 · 8 ซม. 20 · 20 ซม. 80 บาท/ชิ้น",
      "• ตั้งแต่ 11 ชิ้นขึ้นไป ค่าฐานคิดตามตารางของร้าน: 3-5 ซม. 10 · 6-7 ซม. 15 · 8 ซม. 20 · 20 ซม. 80 บาท/ชิ้น",
    ],
  ],
  "standee-clip": [
    [
      "• ราคาต่อชิ้นในตารางรวม: ตัวสแตนดี้ + คลิปหนีบ (ค่าคลิปปกติ 10 บาท/ชิ้น) — ค่าฐานบวกเพิ่มตามขนาดฐานที่เลือก",
      "• ราคาต่อชิ้นรวมครบแล้ว: ตัวสแตนดี้ + ฐาน + คลิปหนีบ (ค่าคลิปปกติ 10 บาท/ชิ้น)",
    ],
    [
      "• ค่าฐานคิดเท่ากันทั้งราคาปลีกและราคาส่ง (ระบบบวกให้เมื่อเลือกขนาดฐาน) · สกรีนลายฐานเพิ่มอีก 10 บาท/ชิ้น",
      "• ช่วง 1-10 ชิ้น ราคาในตารางรวมฐานถึง 6 ซม. มาแล้ว — ฐาน 7 ซม. ขึ้นไป เพิ่ม ซม. ละ 5 บาท (ระบบบวกให้เมื่อเลือกขนาดฐาน) · สกรีนลายฐานเพิ่ม 10 บาท/ชิ้น (ระบบคิดให้ในตารางแล้ว)",
    ],
    [
      "• ตารางค่าฐานสแตนดี้ของร้าน: 3-5 ซม. 10 · 6-7 ซม. 15 · 8 ซม. 20 · 9 ซม. 25 · 10 ซม. 30 · 11 ซม. 35 · 12 ซม. 40 บาท/ชิ้น (สกรีนลายฐานบวกอีก 10)",
      "• ตั้งแต่ 11 ชิ้นขึ้นไป คิดค่าฐานตามขนาด — ไม่สกรีนฐาน 10-40 บาท · สกรีนลายฐาน 20-50 บาท (ระบบบวกให้เมื่อเลือกขนาดฐาน)",
    ],
  ],
  "standee-frame-card": [
    [
      "• ค่าฐาน: คิดเท่ากันทั้งราคาปลีกและราคาส่ง ตามตารางค่าฐานสแตนดี้ของร้าน 7 ซม. 15 บาท ถึง 20 ซม. 80 บาท/ชิ้น",
      "• ค่าฐาน: ปลีก 1-10 ชิ้น คิด ซม.ละ 5 บาท (7 ซม. +5 ถึง 20 ซม. +70) · 11 ชิ้นขึ้นไป คิดตามตารางร้าน 7 ซม. 15 บาท ถึง 20 ซม. 80 บาท/ชิ้น",
    ],
    [
      "• ค่าฐานบวกเพิ่มจากราคาในตาราง — คิดเท่ากันทั้งราคาปลีกและราคาส่ง",
      "• ช่วง 1-10 ชิ้น ราคาในตารางรวมค่าฐานมาแล้ว (เลือกขนาดฐาน/สกรีนฐานได้โดยไม่บวกเพิ่ม)",
    ],
    [
      "• ตารางค่าฐานสแตนดี้ของร้าน: 7 ซม. 15 บาท ถึง 20 ซม. 80 บาท/ชิ้น · สกรีนลายฐานบวกอีก 10 บาท/ชิ้น (ระบบบวกให้เมื่อเลือกขนาดฐาน)",
      "• ตั้งแต่ 11 ชิ้นขึ้นไป คิดค่าฐานตามขนาด — ไม่สกรีนฐาน 15-40 บาท · สกรีนลายฐาน 25-50 บาท (ระบบรวมให้ในตารางแล้ว)",
    ],
  ],
  "acrylic-prakob": [
    [
      "• สแตนดี้เลือกฐานได้ 2 แบบ (ฐานไม่สกรีน / ฐานสกรีนลาย) — ค่าฐานบวกเพิ่มตามขนาดฐาน คิดเท่ากันทั้งปลีกและส่ง",
      "• สแตนดี้เลือกฐานได้ 2 แบบ (ฐานไม่สกรีน / ฐานสกรีนลาย) — ราคารวมฐานให้แล้ว",
    ],
  ],
  "new-mt1dwpc1-6773": [
    [
      "• ค่าฐานคิดครั้งเดียวต่อชุด — คิดเท่ากันทั้งราคาปลีกและราคาส่ง ตามตารางค่าฐานสแตนดี้ของร้าน",
      "• ค่าฐานคิดครั้งเดียวต่อชุด — ช่วงปลีก 1-10 ชุด ฐานไม่เกิน 6 ซม. รวมในราคาแล้ว",
    ],
    [
      "• 1 ชุด (2 ชิ้นใน 1 ฐาน) — ชิ้นหน้า 6 ซม. 140 + ชิ้นหลัง 10 ซม. 100 + ฐาน 7 ซม. 15 = 255 บาท/ชุด",
      "• 1 ชุด (2 ชิ้นใน 1 ฐาน) — ชิ้นหน้า 6 ซม. 140 + ชิ้นหลัง 10 ซม. 100 + ฐาน 7 ซม. 5 = 245 บาท/ชุด",
    ],
    ["ค่าฐานคิดครั้งเดียวต่อชุด — บวกเพิ่มจากราคาในตาราง::", "ฐานรวมอยู่ในราคาแล้ว — คิดครั้งเดียวต่อชุด::"],
    [
      "• ขนาดฐาน 2-20 ซม. — ค่าฐานคิดเท่ากันทั้งราคาปลีกและราคาส่ง ไม่มีช่วงไหนฟรี",
      "• ขนาดฐาน 2-20 ซม. — ช่วงราคาปลีก 1-10 ชุด ฐานไม่เกิน 6 ซม. รวมในราคาแล้ว",
    ],
    [
      "• ตารางค่าฐานสแตนดี้ของร้าน: 3-5 ซม. +10 · 8 ซม. +20 · 20 ซม. +80 บาท/ชุด",
      "• ตั้งแต่ 11 ชุดขึ้นไป ค่าฐานคิดตามตารางของร้าน: 3-5 ซม. +10 · 8 ซม. +20 · 20 ซม. +80 บาท/ชุด",
    ],
  ],
  "3d-acrylic": [],
};

/* ── อ่านค่าเดิมจากไฟล์สำรอง + ของจริงในฐาน ──────────────────────────── */
/** โฟลเดอร์ backups/ ไม่เข้า git — ถ้าไฟล์สำรองหาย ประกอบกติกาขึ้นใหม่จากสินค้าในฐาน
 *  (ฐาน ≤6 ซม. ไม่คิด · 7 ซม.ขึ้นไป (ซม.-6)×฿5 · extraFromQty 11) ซึ่งให้ค่าเท่ากับไฟล์สำรองทุกตัว */
function ruleFromLive(rows: any[]) {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    options: (r.data.options ?? []).map((g: any) => {
      if (!isBaseSizeGroup(g)) return g;
      return {
        ...g,
        extraFromQty: 11,
        choices: (g.choices ?? []).map((c: any) => {
          const cm = cmSpan(c.name)?.hi ?? 0;
          return cm >= 7 ? { ...c, extraBelow: (cm - 6) * 5 } : { ...c, extraBelow: undefined };
        }),
      };
    }),
  }));
}
let saved: any[] = [];
try {
  saved = JSON.parse(readFileSync(new URL(`../${BACKUP}`, import.meta.url), "utf8"));
} catch {
  console.log(`⚠️  ไม่มีไฟล์สำรอง ${BACKUP} — ประกอบกติกาเองจากสินค้าในฐาน`);
}
const FALLBACK_IDS = ["new-mt1k6h3q-6601", "standy", "standee-frame-card", "standee-clip", "3d-acrylic", "new-mt1dwpc1-6773", "acrylic-prakob"];
const wantIds = (saved.length ? saved.map((s) => s.id) : FALLBACK_IDS).filter((id) => !SKIP.has(id) && (!only.length || only.includes(id)));
if (only.length) for (const id of only) if (!wantIds.includes(id)) throw new Error(`${id} ไม่อยู่ในรายชื่องานสแตนดี้ที่สคริปต์นี้ดูแล`);

const { data: live, error } = await sb.from("products").select("id,name,data").in("id", wantIds);
if (error) throw error;
if (!saved.length) saved = ruleFromLive(live as any[]);
const targets = saved.filter((s) => wantIds.includes(s.id));

const plan: { row: any; data: any; group: string }[] = [];
for (const t of targets) {
  const row = (live as any[]).find((r) => r.id === t.id);
  if (!row) throw new Error(`ไม่เจอสินค้า ${t.id} ในฐานข้อมูล`);
  const data = JSON.parse(JSON.stringify(row.data));
  const wasGrp = (t.options ?? []).find(isBaseSizeGroup);
  const grp = (data.options ?? []).find(isBaseSizeGroup);
  if (!wasGrp || !grp) throw new Error(`${t.id}: หากลุ่ม "ขนาดฐาน" ไม่เจอ`);

  console.log(`\n📦 ${row.id} | ${row.name} → กลุ่ม "${grp.label}"`);
  if (grp.extraFromQty === wasGrp.extraFromQty && !(grp.choices ?? []).some((c: any) => c.extraBelow != null)) {
    // ยังไม่โดนย้อน — คืนค่าเดิมทีละช่อง (ไม่ทับทั้งกลุ่ม เผื่อมีคนแก้ภาพ/ลำดับทีหลัง)
  }
  grp.extraFromQty = wasGrp.extraFromQty;
  for (const c of grp.choices ?? []) {
    const was = (wasGrp.choices ?? []).find((w: any) => w.name === c.name);
    if (!was) { console.log(`   ⚠️  ตัวเลือกใหม่ ไม่มีในไฟล์สำรอง: ${c.name} — ข้ามไว้`); continue; }
    if (was.extraBelow != null) c.extraBelow = was.extraBelow; else delete c.extraBelow;
    if (was.desc != null) c.desc = was.desc; else delete c.desc;
    if ((c.extra ?? 0) !== (was.extra ?? 0)) console.log(`   ⚠️  ค่าส่งเปลี่ยนไปจากไฟล์สำรอง ${c.name}: ฿${was.extra ?? 0} → ฿${c.extra ?? 0} (คงค่าปัจจุบันไว้)`);
  }
  console.log(`   คืน extraFromQty=${grp.extraFromQty} · extraBelow ${(grp.choices ?? []).filter((c: any) => c.extraBelow).map((c: any) => `${c.name}:${c.extraBelow}`).join(", ") || "-"}`);
  grp.note = conciseNote(grp.choices ?? []);
  console.log(`   📝 โน้ตใหม่: ${grp.note}`);

  for (const [oldLine, newLine] of TEXT_BACK[row.id] ?? []) {
    let hit = 0;
    for (const tab of data.tabs ?? []) {
      if (typeof tab.text !== "string" || !tab.text.includes(oldLine)) continue;
      tab.text = tab.text.split(oldLine).join(newLine);
      hit++;
      console.log(`   📄 แท็บ "${tab.title}" → ${newLine.slice(0, 80)}…`);
    }
    if (!hit) console.log(`   ⚠️  หาบรรทัดเดิมไม่เจอ (อาจแก้ไปแล้ว): ${oldLine.slice(0, 60)}…`);
  }
  for (const tab of data.tabs ?? [])
    for (const l of String(tab.text ?? "").split("\n"))
      if (/ฐาน/.test(l) && /ปลีกและราคาส่ง|ปลีกหรือส่ง|ไม่มีช่วงไหนฟรี/.test(l))
        console.log(`   🔎 ยังมีข้อความ "ปลีก=ส่ง" ค้าง แท็บ "${tab.title}": ${l.trim()}`);

  plan.push({ row, data, group: grp.label });
}

/* ── ตรวจราคาก่อน/หลัง ─────────────────────────────────────────────────── */
console.log("\n🧮 ราคาต่อชิ้น ก่อน → หลัง (ตัวเลือกค่าเริ่มต้น · แบบสแตนดี้)");
for (const { row, data } of plan) {
  const before = { id: row.id, name: row.name, price: row.data.price ?? 0, ...row.data } as unknown as Product;
  const after = { id: row.id, name: row.name, price: row.data.price ?? 0, ...data } as unknown as Product;
  const grp = (row.data.options ?? []).find(isBaseSizeGroup);
  const sel: Record<string, string> = {};
  for (const g of row.data.options ?? []) {
    const first = (g.choices ?? [])[0];
    if (first) sel[g.label] = first.name;
  }
  const formGroup = (row.data.options ?? []).find((g: any) => (g.choices ?? []).some((c: any) => /สแตนดี้/.test(c.name)));
  if (formGroup) sel[formGroup.label] = (formGroup.choices ?? []).find((c: any) => /สแตนดี้/.test(c.name)).name;
  for (const c of grp.choices ?? []) {
    const s = { ...sel, [grp.label]: c.name };
    const line = [1, 10, 11, 30].map((q) => {
      const b = unitPriceFor(before, s, q);
      const a = unitPriceFor(after, s, q);
      return `${q}:${b === a ? `฿${a}` : `฿${b}→฿${a}`}`;
    });
    console.log(`   ${row.id} ${String(c.name).padEnd(14)} ${line.join("  ")}`);
  }
}

if (!WRITE) { console.log("\n👀 dry-run — เติม --write เพื่อเขียนจริง"); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
mkdirSync("backups", { recursive: true });
const backupPath = `backups/standee-base-retail-free-before-${stamp}.json`;
writeFileSync(backupPath, JSON.stringify(plan.map(({ row }) => ({ id: row.id, name: row.name, options: row.data.options, tabs: row.data.tabs })), null, 1));
console.log(`\n💾 สำรองค่าเดิมไว้ที่ ${backupPath}`);

for (const { row, data, group } of plan) {
  data.savedAt = new Date().toISOString();
  const { error: e } = await sb.from("products").update({ data }).eq("id", row.id);
  if (e) throw new Error(`${row.id}: เขียนไม่ผ่าน — ${e.message}`);
  const { data: back } = await sb.from("products").select("data").eq("id", row.id);
  const grp = (back?.[0]?.data?.options ?? []).find(isBaseSizeGroup);
  if (!grp?.extraFromQty) throw new Error(`${row.id}: เขียนแล้วแต่อ่านกลับยังไม่มี extraFromQty`);
  console.log(`✅ ${row.id} — เขียนแล้ว (${group}) · อ่านกลับยืนยันแล้ว`);
}
