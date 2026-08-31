#!/usr/bin/env node
/**
 * Case Frame Card — เปลี่ยนท่อน "สั่งคละรุ่น / คละลาย ยังไง" จากรายการหัวข้อยาว ๆ เป็นภาพอธิบาย
 *
 *   node scripts/case-frame-mix-infographic.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/case-frame-mix-infographic.mjs --write
 *
 * ทำไมทำเป็น HTML+SVG ฝังใน body.html แทนไฟล์รูป:
 *   • คมทุกความละเอียด ย่อ-ขยายไม่แตก · ตัวหนังสือยังเป็นข้อความจริง (ค้นเจอ/ก๊อปได้/Google อ่านได้)
 *   • ใช้ฟอนต์ไทยของเว็บเอง ไม่ต้องแปลงเป็นภาพให้ฟอนต์เพี้ยน · ไม่ต้องอัปไฟล์ ไม่ต้อง deploy
 *   • ตัวกรอง HTML ฝั่งเซิร์ฟเวอร์ (lib/server/sanitize-html.ts) ตัดแค่ script/style/iframe/form/on-handler
 *     → <svg> กับ style="..." รอด แม้แอดมินจะกดบันทึกสินค้าซ้ำภายหลัง
 *
 * ⚠️ กล่องเนื้อหาฝั่งหน้าเว็บกว้างสุด max-w-lg (512px) — ออกแบบมาให้อยู่ในกรอบนั้นและย่อลงมือถือได้
 * ⚠️ ใช้ inline style ล้วน (คลาส Tailwind ใช้ไม่ได้ในเนื้อหาที่มาจากหลังบ้าน)
 * เก็บ body.text เดิมไว้ไม่แตะ — เป็นข้อความสำรองถ้าวันหลังลบ html ทิ้ง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "case-frame-card";
const EXPECT_NAME = "Case Frame Card";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));
const die = (m) => (console.error("✗ " + m), process.exit(1));

// ── โทนสีจาก landing.css (หน้าแรก) ────────────────────────────────
const NAVY = "#173A6B", SOFT = "#4A6A96", DEEP = "#2C81C4";
const SKY1 = "#E2F3FE", SKY2 = "#C6E8FB", SKY0 = "#F2FAFF";
const OK_FILL = "#C6E8FB", OK_LINE = "#2C81C4";
const FEE_FILL = "#FFF0BC", FEE_LINE = "#E0A116", FEE_INK = "#8A6413";

/** กล่องชิ้นงาน 1 ชิ้น */
const piece = (x, y, ok) =>
  `<rect x="${x}" y="${y}" width="20" height="28" rx="4" fill="${ok ? OK_FILL : FEE_FILL}" stroke="${ok ? OK_LINE : FEE_LINE}" stroke-width="1.6"/>`;

/** 1 กลุ่มลาย = ชิ้นเรียงกัน + ป้ายชื่อลายด้านบน */
function group(x, n, ok, label) {
  const w = n * 20 + (n - 1) * 4;
  let s = `<text x="${x + w / 2}" y="12" text-anchor="middle" font-size="10.5" font-weight="700" fill="${ok ? SOFT : FEE_INK}">${label}</text>`;
  for (let i = 0; i < n; i++) s += piece(x + i * 24, 20, ok);
  if (!ok)
    s +=
      `<text x="${x + w / 2}" y="64" text-anchor="middle" font-size="10.5" font-weight="800" fill="${FEE_INK}">+5฿ ต่อชิ้น</text>`;
  return s;
}

// สั่ง 11 ชิ้น → 3+3+3+2 · กลุ่มสุดท้ายไม่ถึง 3 ชิ้น จึงคิดเพิ่มเฉพาะ 2 ชิ้นนั้น
const G = [3, 3, 3, 2];
let x = 4;
const groups = G.map((n, i) => {
  const s = group(x, n, n >= 3, `ลายที่ ${i + 1}`);
  x += n * 20 + (n - 1) * 4 + 14;
  return s;
}).join("");

const diagram =
  `<svg viewBox="0 0 ${Math.ceil(x)} 72" width="100%" role="img" ` +
  `aria-label="ตัวอย่าง สั่ง 11 ชิ้น แบ่งเป็นลายละ 3 ชิ้น 3 ลาย และลายสุดท้าย 2 ชิ้น ซึ่งไม่ถึงขั้นต่ำ จึงคิดเพิ่มชิ้นละ 5 บาท รวม 10 บาท" ` +
  // ⚠️ ห้ามใส่ min-width ให้ svg — เคยลอง 320px แล้วกล่องเนื้อหาดันกว้างเกินจอ ทำให้ทั้งหน้าเลื่อนซ้าย-ขวาบนมือถือ
  `style="max-width:100%;height:auto;display:block">${groups}</svg>`;

const step = (n, title, desc) =>
  `<li style="display:flex;gap:10px;align-items:flex-start;margin:0 0 8px">` +
  `<span style="flex:0 0 auto;width:22px;height:22px;border-radius:999px;background:${DEEP};color:#fff;font-size:12px;font-weight:800;line-height:22px;text-align:center">${n}</span>` +
  `<span style="min-width:0"><b style="color:${NAVY}">${title}</b><br><span style="color:${SOFT}">${desc}</span></span></li>`;

const rule = (bg, ring, ink, head, body) =>
  `<div style="flex:1 1 190px;background:${bg};border:1px solid ${ring};border-radius:14px;padding:10px 12px">` +
  `<div style="font-weight:800;color:${ink};margin-bottom:4px">${head}</div>` +
  `<div style="color:${SOFT}">${body}</div></div>`;

const html =
  `<div style="border:2px solid ${SKY2};border-radius:18px;overflow:hidden;background:#fff;font-size:12.5px;line-height:1.75">` +
    // ── หัว ──
    `<div style="background:linear-gradient(168deg,${SKY2} 0%,${SKY1} 45%,${SKY0} 100%);padding:14px 16px">` +
      `<div style="font-size:15px;font-weight:800;color:${NAVY}">สั่งหลายรุ่นในออเดอร์เดียวได้</div>` +
      `<div style="margin-top:4px;font-weight:600;color:${SOFT}">` +
        `<b style="color:${NAVY}">ทุกรุ่นนับยอดรวมกันเพื่อหาช่วงราคา</b> — ยิ่งรวมกันได้เยอะ ยิ่งถูกต่อชิ้น` +
      `</div>` +
    `</div>` +
    `<div style="padding:14px 16px">` +
      // ── 3 สเต็ป ──
      `<ol style="list-style:none;padding:0;margin:0 0 14px">` +
        step(1, "ตั้งค่ารุ่นที่ 1", "เลือกรุ่นมือถือ · จำนวน · แนบลายของรุ่นนี้") +
        step(2, "กด “➕ เพิ่มอีกรุ่น (คนละแบบ)”", "ระบบเก็บรุ่นที่ 1 ไว้ให้ แล้วเปิดฟอร์มรุ่นถัดไป — ทำซ้ำจนครบ (แต่ละรุ่นแนบลายของตัวเองได้)") +
        step(3, "กดสั่งทีเดียว", "ทุกรุ่นลงตะกร้าพร้อมกัน แยกเป็นคนละรายการตามรุ่น") +
      `</ol>` +
      // ── กติกาคละ 2 ช่วง ──
      `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">` +
        rule("#ECFDF5", "#A7F3D0", "#047857", "1-10 ชิ้น · คละอิสระ", "นับรวมทุกรุ่น — คละรุ่น คละลายได้ตามใจ <b>ไม่มีค่าคละเพิ่ม</b>") +
        rule(SKY0, SKY2, DEEP, "11 ชิ้นขึ้นไป · ลายละ 3", "ขั้นต่ำ <b>3 ชิ้นต่อ 1 ลาย</b> — ลายไหนไม่ถึง คิดเพิ่มเฉพาะชิ้นที่ขาด ชิ้นละ 5฿") +
      `</div>` +
      // ── ตัวอย่างเป็นภาพ ──
      `<div style="background:${SKY0};border:1px solid ${SKY2};border-radius:14px;padding:10px 12px">` +
        `<div style="font-weight:800;color:${NAVY};margin-bottom:6px">ตัวอย่าง — สั่ง 11 ชิ้น แบ่งเป็น 3+3+3+2</div>` +
        // จอแคบ: ให้ภาพเลื่อนในกล่องตัวเองแทนที่จะย่อจนตัวหนังสืออ่านไม่ออก
        `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">${diagram}</div>` +
        `<div style="margin-top:6px;color:${SOFT}">` +
          `ลายที่ 1-3 ครบลายละ 3 ชิ้น <b style="color:#047857">ไม่คิดเพิ่ม</b> · ` +
          `ลายที่ 4 มีแค่ 2 ชิ้น <b style="color:${FEE_INK}">คิดเพิ่ม 2 × 5฿ = 10฿</b>` +
        `</div>` +
      `</div>` +
    `</div>` +
  `</div>`;

// ── เขียนลงฐานข้อมูล ─────────────────────────────────────────────
const { data: rows, error } = await sb.from("products").select("*").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า id=${ID}`);
if (row.name !== EXPECT_NAME) die(`ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);
const d = row.data;

const idx = (d.body ?? []).findIndex((b) => /คละรุ่น|คละลาย/.test((b.heading ?? "") + (b.html ?? "") + (b.text ?? "")));
if (idx < 0) die("ไม่พบท่อน “สั่งคละรุ่น / คละลาย” ใน body");
const sec = d.body[idx];

console.log(`ท่อนที่ ${idx + 1} — heading: "${sec.heading}" · slot: ${sec.slot ?? "(ใต้แผงสั่งซื้อ)"}`);
console.log(`  html เดิม : ${sec.html ? sec.html.length + " ตัวอักษร" : "ไม่มี (ใช้ text ธรรมดา)"}`);
console.log(`  html ใหม่ : ${html.length} ตัวอักษร (กราฟิก HTML+SVG)`);
console.log(`  text เดิม : คงไว้ ${(sec.text ?? "").length} ตัวอักษร (สำรอง)`);

sec.html = html;
d.savedAt = new Date().toISOString();

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}
const { data: wrote, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!wrote?.length) die("update ไม่โดนแถวไหนเลย (0 rows)");
const { data: back } = await sb.from("products").select("data").eq("id", ID);
if (back[0].data.body[idx].html !== html) die("เขียนแล้วแต่ค่าที่อ่านกลับไม่ตรง");
console.log("✓ เสร็จ");
