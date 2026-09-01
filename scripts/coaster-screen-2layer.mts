/**
 * Acrylic Coaster (/products/acrylic-coaster) — เพิ่มงาน "สกรีน 2 เลเยอร์" (ผู้ใช้สั่ง 1 ก.ย. 69)
 *
 *   npx tsx scripts/coaster-screen-2layer.mts           # ดูผล + ตรวจ (ไม่เขียนฐานข้อมูล/ไม่อัปรูป)
 *   npx tsx scripts/coaster-screen-2layer.mts --write   # อัปรูป + บันทึกจริง (รันซ้ำได้)
 *
 * 2 เลเยอร์ = พิมพ์ลาย 2 ชั้นบนแผ่นเดียว ชั้นหนึ่งสกรีนใต้ (มีรองขาว) อีกชั้นสกรีนทับบนผิว
 * ผู้ใช้ย้ำเอง: "2 เลเยอร์ (บน-ใต้ ลายหันฝั่งเดียวกัน)" — ทั้งสองชั้นดูจากหน้าเดียวกัน
 * ระยะห่างของสองชั้นคือความหนาอะคริลิค ลายเลยดูมีมิติ
 * ⚠️ คนละตัวกับ "สกรีน 2 ด้าน (หน้าใต้-หลังบน)" ที่มีอยู่แล้ว — อันนั้นคนละลาย มองจากคนละฝั่ง
 *    ตัวเลือกเดิมยังอยู่ครบ สคริปต์นี้แค่แก้คำอธิบายให้เลิกพูดว่า "พิมพ์ซ้อน 2 ชั้น" (ไปชนกับตัวใหม่)
 *
 * ราคา: บวกอันละ ฿25 เท่ากับ "สกรีน 2 ด้าน" ของสินค้าตัวนี้ (ผู้ใช้เคาะ 1 ก.ย. 69 — งานพิมพ์ 2 เที่ยวเท่ากัน)
 *
 * เนื้อที่เลือกได้: เฉพาะกลุ่มเนื้อโปร่ง (กลุ่มเดียวกับที่สกรีนใต้ได้) — ลายชั้นล่างต้องมองทะลุเนื้อขึ้นมา
 * ⚠️ ชื่อตัวเลือกกลุ่มนี้ถูกอ้างใน rules.limit.allow ทุกข้อ — ตัวเลือกใหม่ที่ไม่ได้เติมเข้า allow
 *    จะถูกกฎกรองทิ้งเงียบ ๆ ทันทีที่ลูกค้าเลือกสี (กฎครอบทุกสีในสินค้าตัวนี้ ดู memory iducky-rule-allow-new-choice)
 *
 * ภาพจำลองการ์ด: วาดเองด้วย scripts/coaster-screen-2layer-art.py (แผ่น HOW TO PRINT ของร้านไม่มีช่อง 2 เลเยอร์)
 *   ไฟล์ต้นทางอยู่ใน repo ที่ scripts/assets/acrylic-coaster/ · สคริปต์นี้อัปขึ้นคลังของสินค้าให้ตอน --write
 *   ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขยับ REV
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "acrylic-coaster";
const EXPECT_NAME = "Acrylic Coaster";

const COLOR = "สีอะคริลิค";
const SCREEN = "เทคนิคสกรีน";
const TOP = "สกรีน 1 ด้าน (บน)";
const UNDER = "สกรีน 1 ด้าน (ใต้)";
const TWO_SIDE = "สกรีน 2 ด้าน (หน้าใต้-หลังบน)";
/**
 * ผู้ใช้เคาะชื่อเต็ม 1 ก.ย. 69 (รอบ 2): ให้เขียน "ลายหันฝั่งเดียวกัน" ไว้ในชื่อตัวเลือกเลย
 * ไม่ใช่ปล่อยให้อยู่แค่ในคำอธิบายใต้การ์ด — ของเดิมชื่อสั้น ๆ ว่า "สกรีน 2 เลเยอร์ (บน-ใต้)"
 * ⚠️ เปลี่ยนชื่อ = ต้องไล่แทนใน rules.limit.allow ด้วย ไม่งั้นกฎกรองตัวเลือกใหม่ทิ้งทันทีที่เลือกสี
 */
const TWO_LAYER = "สกรีน 2 เลเยอร์ (บน-ใต้ลายหันฝั่งเดียวกัน)";
const OLD_NAMES = ["สกรีน 2 เลเยอร์ (บน-ใต้)"];
const EXTRA = 25;

const REV = "v1";
const ART_FILE = fileURLToPath(new URL("./assets/acrylic-coaster/screen-2layer.jpg", import.meta.url));
const ART_PATH = `products/${ID}/screen-2layer-${REV}.jpg`;

const TWO_LAYER_CHOICE = {
  name: TWO_LAYER,
  desc: "พิมพ์ลาย 2 ชั้นบนแผ่นเดียว — ลายหลักสกรีนใต้ อีกลายสกรีนทับบนผิว หันไปฝั่งเดียวกันทั้งคู่ มองด้านหน้าเห็นลายซ้อนกันมีมิติ · เฉพาะเนื้อโปร่ง",
  extra: EXTRA,
};
/** ของเดิมเขียนว่า "พิมพ์ซ้อน 2 ชั้น" — ตรงกับ 2 เลเยอร์ที่เพิ่งเพิ่ม เลยต้องเกลาให้ต่างกันชัด */
const TWO_SIDE_DESC =
  "พิมพ์ 2 หน้า — ลายด้านหน้าสกรีนใต้ อีกลายสกรีนบนผิวด้านหลัง เห็นคนละลายจากคนละฝั่ง · เฉพาะเนื้อโปร่ง";
const NOTE = `สกรีน 1 ด้าน ไม่บวกเพิ่ม — สกรีน 2 ด้าน / 2 เลเยอร์ บวกอันละ ฿${EXTRA}`;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const ART_URL = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${ART_PATH}`;

const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw new Error(`อ่าน ${ID} ไม่สำเร็จ — ${error.message}`);
if (row.name !== EXPECT_NAME) throw new Error(`ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);
const d: any = structuredClone(row.data);

const screen = (d.options ?? []).find((o: any) => o.label === SCREEN);
if (!screen) throw new Error(`ไม่เจอกลุ่ม "${SCREEN}" — โครงสินค้าเปลี่ยน ตรวจก่อน`);
for (const n of [TOP, UNDER, TWO_SIDE])
  if (!screen.choices.some((c: any) => c.name === n)) throw new Error(`กลุ่ม "${SCREEN}" ไม่มีตัวเลือก "${n}" แล้ว — ตรวจก่อน`);

/* ── 1. ตัวเลือกใหม่ ต่อท้ายกลุ่ม (รันซ้ำ = ทับของเดิมด้วยค่าชุดนี้) ── */
// ชื่อรุ่นก่อน ๆ ที่เคยลงไปแล้ว — เปลี่ยนชื่อให้ทั้งในตัวเลือกและในกฎ (ไม่ใช่เพิ่มใบใหม่ทับ)
for (const oldName of OLD_NAMES) {
  const c = screen.choices.find((x: any) => x.name === oldName);
  if (!c) continue;
  c.name = TWO_LAYER;
  for (const r of d.rules ?? [])
    if (r.limit?.label === SCREEN)
      r.limit.allow = (r.limit.allow ?? []).map((n: string) => (n === oldName ? TWO_LAYER : n));
  console.log(`   [เปลี่ยนชื่อ] "${oldName}" → "${TWO_LAYER}" (แก้ในกฎให้ด้วย)`);
}
const at = screen.choices.findIndex((c: any) => c.name === TWO_LAYER);
if (at < 0) {
  screen.choices.push({ ...TWO_LAYER_CHOICE, imageSrc: ART_URL });
  console.log(`   [เพิ่มตัวเลือก] "${TWO_LAYER}" +฿${EXTRA}/อัน`);
} else {
  screen.choices[at] = { ...screen.choices[at], ...TWO_LAYER_CHOICE, imageSrc: ART_URL };
  console.log(`   [อัปเดตตัวเลือก] "${TWO_LAYER}" (มีอยู่แล้ว)`);
}
const twoSide = screen.choices.find((c: any) => c.name === TWO_SIDE);
if (twoSide.desc !== TWO_SIDE_DESC) {
  twoSide.desc = TWO_SIDE_DESC;
  console.log(`   [เกลาคำอธิบาย] "${TWO_SIDE}" — เลิกใช้คำว่า "พิมพ์ซ้อน 2 ชั้น" (ไปชนกับ 2 เลเยอร์)`);
}
if (screen.note !== NOTE) {
  screen.note = NOTE;
  console.log(`   [หมายเหตุกลุ่ม] ${NOTE}`);
}

/* ── 2. กฎ "สี → เทคนิคสกรีน": เนื้อโปร่ง (ข้อที่สกรีนใต้ได้) ได้ 2 เลเยอร์ด้วย · เนื้อทึบไม่ได้ ── */
let patched = 0;
for (const r of d.rules ?? []) {
  if (r.limit?.label !== SCREEN) continue;
  const before: string[] = r.limit.allow ?? [];
  const clear = before.includes(UNDER); // สกรีนใต้ได้ = มองลายผ่านเนื้อได้ = ซ้อนเลเยอร์ได้
  const allow = clear && !before.includes(TWO_LAYER) ? [...before, TWO_LAYER] : before;
  if (allow === before) continue;
  r.limit.allow = allow;
  patched++;
  console.log(
    `   [แก้กฎ] ${r.when.label}="${r.when.choice}" (+${(r.when.choices?.length ?? 1) - 1} สี · เนื้อโปร่ง) → ${SCREEN}: ${allow.join(" | ")}`
  );
}

/* ── ตรวจผลก่อนบันทึก (จำลอง allowedChoices ตามกฎจริง) ── */
const ruleHits = (r: any, sel: Record<string, string>) => {
  const cur = sel[r.when.label];
  return !!cur && (r.when.choices?.length ? r.when.choices : [r.when.choice]).includes(cur);
};
const allowedFor = (label: string, sel: Record<string, string>) => {
  const all = ((d.options ?? []).find((o: any) => o.label === label)?.choices ?? []).map((c: any) => c.name);
  let allowed = all;
  for (const r of d.rules ?? []) {
    if (r.limit.label !== label || !ruleHits(r, sel)) continue;
    allowed = allowed.filter((n: string) => r.limit.allow.includes(n));
  }
  return allowed.length ? allowed : all;
};

console.log("\n🔍 ตรวจผล:");
let bad = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) bad++;
  console.log(`   ${ok ? "✅" : "❌"} ${msg}`);
};
for (const [color, want] of [
  ["อะคริลิใส", [TOP, UNDER, TWO_SIDE, TWO_LAYER]],
  ["hologram-รุ้ง", [TOP, UNDER, TWO_SIDE, TWO_LAYER]],
  ["อะคริลิคกลิตเตอร์-ทอง", [TOP, UNDER, TWO_SIDE, TWO_LAYER]],
  ["อะคริลิคขาวขุ่น C-02", [TOP]], // เนื้อทึบ — ลายชั้นล่างมองไม่ทะลุขึ้นมา
  ["อะคริลิคสีดำ (BK)", [TOP]],
  ["hologram-01", [TOP]],
] as [string, string[]][]) {
  const got = allowedFor(SCREEN, { [COLOR]: color });
  check(JSON.stringify(got) === JSON.stringify(want), `สี "${color}" → เลือกได้: ${got.join(" | ")}`);
}
{
  const c = screen.choices.find((x: any) => x.name === TWO_LAYER);
  check(c?.extra === EXTRA, `"${TWO_LAYER}" บวกอันละ ฿${c?.extra}`);
  check(!!c?.desc && !!c?.imageSrc, `การ์ด "${TWO_LAYER}" มีรูป + คำอธิบาย`);
  check(
    screen.choices.filter((x: any) => x.name === TWO_LAYER).length === 1,
    `กลุ่ม "${SCREEN}" มี ${screen.choices.length} ตัวเลือก (${screen.choices.map((x: any) => x.name).join(" | ")})`
  );
  check(patched === 1 || patched === 0, `แก้กฎไป ${patched} ข้อ (รันซ้ำจะเป็น 0 — กฎมีชื่อใหม่อยู่แล้ว)`);
  // ราคาแกนตาราง (ประเภท) ต้องไม่โดนแตะ — ตัวเลือกสกรีนเป็นแค่ค่าบวก ไม่ใช่แกนราคา
  check(
    JSON.stringify(d.pricing?.driverLabels) === JSON.stringify(row.data.pricing?.driverLabels),
    `แกนตารางราคายังเป็น ${JSON.stringify(d.pricing?.driverLabels)} เหมือนเดิม`
  );
}

/* ── รูป: มีในคลังแล้วก็ข้าม ไม่มีก็อัปตอน --write (ตรวจว่าโหลดได้จริงหลังอัป) ── */
const head = await fetch(ART_URL, { method: "HEAD" });
if (head.ok) {
  console.log(`\n🖼  รูปอยู่ในคลังแล้ว — ${ART_PATH}`);
} else if (WRITE) {
  const { error: upErr } = await sb.storage
    .from("product-images")
    .upload(ART_PATH, readFileSync(ART_FILE), { contentType: "image/jpeg", upsert: false });
  if (upErr) throw new Error(`อัปรูปไม่สำเร็จ — ${upErr.message}`);
  const again = await fetch(ART_URL, { method: "HEAD" });
  check(again.ok, `อัปรูปแล้ว ${ART_PATH} — ${again.status}`);
} else {
  console.log(`\n🖼  ยังไม่มีรูปในคลัง — จะอัป ${ART_PATH} ตอน --write (ต้นทาง ${ART_FILE.split("/").pop()})`);
}

if (bad) throw new Error(`ผลตรวจไม่ผ่าน ${bad} ข้อ — ไม่บันทึก`);
if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}
d.savedAt = new Date().toISOString();
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw new Error(`บันทึกไม่สำเร็จ — ${saveErr.message}`);
console.log("\n✅ บันทึกแล้ว");
