/**
 * สร้าง landing.css ใหม่จากไฟล์ต้นแบบ LADNDING PAGE.html
 *  1) CSS ในต้นแบบ (บรรทัด 12-2114) → ครอบทุก selector ด้วย .dl
 *  2) รูป base64 ใน CSS → ชี้ไฟล์ใน /public/landing (จับคู่ด้วย md5)
 *  3) ตัด widget ทดสอบขนาดจอ (#devSim*) + selector ค้างที่หน้าไม่ได้ใช้ (.cta .ws-bg .promise …)
 *  4) ต่อท้ายด้วยสไตล์เฉพาะเว็บจริง (ดึงจาก landing.css เดิม)
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

import { fileURLToPath } from "url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// ไฟล์ต้นแบบ: ส่งพาธมาเป็นอาร์กิวเมนต์แรก (ค่าเริ่มต้น = ไฟล์ล่าสุดบน Desktop) · อาร์กิวเมนต์ที่ 2 = ไฟล์ปลายทาง
const PROTO = process.argv[2] || "/Users/iduckshop/Desktop/LADNDING PAGE.html";
const CUR = path.join(ROOT, "src/app/(shop)/landing.css");
const OUT = process.argv[3] || path.join(ROOT, "src/app/(shop)/landing.css");

const html = fs.readFileSync(PROTO, "utf8").split("\n");
let css = html.slice(11, 2114).join("\n"); // บรรทัด 12..2114 (1-based)
const cur = fs.readFileSync(CUR, "utf8").split("\n");
const curLine = (a, b) => cur.slice(a - 1, b).join("\n"); // 1-based inclusive

/* ---------- 2) รูป base64 → ไฟล์ ---------- */
const md5map = new Map();
for (const f of fs.readdirSync(path.join(ROOT, "public/landing"))) {
  const buf = fs.readFileSync(path.join(ROOT, "public/landing", f));
  md5map.set(crypto.createHash("md5").update(buf).digest("hex"), f);
}
let imgHits = [];
css = css.replace(/data:image\/([a-z+]+);base64,([A-Za-z0-9+/=]+)/g, (m, type, b64) => {
  const h = crypto.createHash("md5").update(Buffer.from(b64, "base64")).digest("hex");
  const f = md5map.get(h);
  if (!f) throw new Error("ไม่พบไฟล์รูปใน public/landing สำหรับ base64 " + type + " ยาว " + b64.length);
  imgHits.push(f);
  return "/landing/" + f;
});

/* ---------- 1)+3) แปลง selector ---------- */
const DROP = [
  /^html$/, /^body$/, /^:root$/, /^#devSim/, /^\.sim-/, /^\.cta\b/, /^\.ws-bg/, /^\.promise/, /^\.close-band/, /^\.steps\b/,
  /^\.duck-mini/, /^\.logo:hover \.duck-mini/, /^\.rvc-shot span/, /^\.rvc-shot::after/, /^\.logo b\b/, /^\.logo:hover b\b/,
];
function mapSel(sel) {
  sel = sel.trim();
  if (!sel) return null;
  if (DROP.some((r) => r.test(sel))) return null;
  if (sel === ":root") return sel;
  if (sel.startsWith("body.search-open")) return sel.replace(/^body\.search-open\s+/, "body.search-open .dl ");
  if (sel.startsWith(".dl")) return sel;
  return ".dl " + sel;
}
function splitSelectors(s) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}
/** หาตำแหน่ง } ที่ปิดบล็อก เริ่มนับจาก open (index ของ {) — ข้ามสตริง */
function matchClose(s, open) {
  let depth = 0, q = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q && s[i - 1] !== "\\") q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i; }
  }
  throw new Error("บล็อกไม่ปิด ที่ " + open);
}
function transform(src) {
  let out = "", i = 0;
  const n = src.length;
  let dropped = [];
  while (i < n) {
    if (src.startsWith("/*", i)) { const j = src.indexOf("*/", i) + 2; out += src.slice(i, j); i = j; continue; }
    const c = src[i];
    if (c === "}") { out += "}"; i++; continue; }
    if (/\s/.test(c)) { out += c; i++; continue; }
    const open = src.indexOf("{", i);
    if (open < 0) { out += src.slice(i); break; }
    const head = src.slice(i, open).trim();
    if (/^@(keyframes|-webkit-keyframes|property|font-face)/.test(head)) {
      const close = matchClose(src, open);
      out += src.slice(i, close + 1);
      i = close + 1; continue;
    }
    if (head.startsWith("@")) { // @media / @supports → ลูกข้างในเป็น rule ต่อ
      out += head + "{"; i = open + 1; continue;
    }
    const close = matchClose(src, open);
    const body = src.slice(open + 1, close);
    const sels = splitSelectors(head).map(mapSel).filter(Boolean);
    if (sels.length) out += sels.join(",") + "{" + body + "}";
    else dropped.push(head.replace(/\s+/g, " "));
    i = close + 1;
  }
  return { out, dropped };
}
const { out: protoCss, dropped } = transform(css);

/* ---------- header + :root ---------- */
const rootStart = cur.findIndex((l) => l.startsWith(":root{")) + 1;
let rootEnd = rootStart;
while (!cur[rootEnd - 1].trim().endsWith("}")) rootEnd++;
const header = `/*
 * ดีไซน์หน้าแรก + หัว/ท้ายเว็บ (โทนฟ้า-เหลืองเป็ด) — พอร์ตจากไฟล์ต้นแบบของทีม Content
 * "LADNDING PAGE.html" (9 ก.ย. 69) — สร้างด้วยสคริปต์ scripts/landing-css-from-proto.mjs
 * ทุก selector ถูกครอบด้วย .dl เพื่อไม่ให้ชนกับ Tailwind ของหน้าอื่น
 * ใช้คู่กับ: <div className="dl dl-contents"> ครอบ Navbar/Footer/overlay และ <div className="dl dl-page"> ครอบหน้าแรก
 * รูปประกอบทั้งหมดอยู่ที่ /public/landing (แตกจาก base64 ในไฟล์ต้นแบบ)
 *
 * ⚠️ ส่วนบน (ถึงเส้นคั่น "เพิ่มเติมสำหรับเว็บจริง") คือ CSS ต้นแบบแบบครอบ .dl แทบไม่แก้ —
 *    ถ้าทีม Content ส่งต้นแบบใหม่ ให้รันสคริปต์สร้างทับ แล้วแก้เฉพาะส่วนท้าย
 */

${curLine(rootStart, rootEnd)}
.dl{font-family:var(--body);color:var(--navy);background:#fff;-webkit-font-smoothing:antialiased;line-height:1.7}
/* กันหน้าเว็บเลื่อนซ้าย-ขวาบนมือถือ — ต้องใช้ clip ไม่ใช่ hidden
   เพราะ overflow-x:hidden จะบังคับให้แกนตั้งกลายเป็นกล่องสกรอลล์ แล้วตัดพื้นหลังฟ้า
   ที่ .top-stack ดึงขึ้นไปไว้หลังแถบเมนูทิ้ง (หัวเว็บจะกลายเป็นพื้นขาว) */
.dl-page{overflow-x:clip;overflow-y:visible}
/* ตัวครอบ Navbar/Footer/overlay ที่ Portal ไป body: display:contents เพื่อไม่ให้กลายเป็นกล่อง
   (position:sticky ของแถบเมนู และ position:fixed ของ overlay ยังอ้างอิง viewport ตามเดิม) */
.dl-contents{display:contents}
`;

/* ---------- 4) ส่วนเพิ่มเติมของเว็บจริง (จากไฟล์เดิม) ---------- */
function between(startRe, endRe, opts = {}) {
  const s = cur.findIndex((l) => startRe.test(l));
  if (s < 0) throw new Error("ไม่พบ " + startRe);
  let e = s;
  while (e < cur.length && !endRe.test(cur[e])) e++;
  if (e >= cur.length) throw new Error("ไม่พบจุดจบ " + endRe);
  if (opts.exclusiveEnd) e--;
  return cur.slice(s, e + 1).join("\n");
}
const extrasLine = cur.findIndex((l) => l.includes("เพิ่มเติมสำหรับเว็บจริง"));
if (extrasLine < 0) throw new Error("ไม่พบเส้นคั่นเพิ่มเติมสำหรับเว็บจริง");
/** ไฟล์ปัจจุบันเคยสร้างด้วยสคริปต์นี้แล้ว → ส่วนท้ายทั้งหมด (ตั้งแต่ "ส่วนที่ 1") ยกไปต่อท้ายตามเดิม ไม่ต้องคัดใหม่ */
const genLine = cur.findIndex((l) => l.includes("เพิ่มเติมสำหรับเว็บจริง (ไม่มีในไฟล์ต้นแบบ) — ส่วนที่ 1"));

const siteExtras = genLine >= 0 ? "" : `
/* ═══════════════════════════════════════════════════════════════════════════════
   ── เพิ่มเติมสำหรับเว็บจริง (ไม่มีในไฟล์ต้นแบบ) — ส่วนที่ 1: ของที่ผูกกับหน้าแรก/หัวเว็บ ──
   ═══════════════════════════════════════════════════════════════════════════════ */
/* ชื่อหมวดใน DB ยาว ("Keychain & Acrylic — พวงกุญแจ / งานอะคริลิค") ต้องตัดบรรทัดได้ + จองความสูง 2 บรรทัด */
${between(/^\.dl \.nav-mega-col \.nav-mega-label\{/, /^\.dl \.nav-mega-label:focus-visible/)}
${between(/^\.dl \.nav-mega-emoji\{/, /^\.dl \.nav-mega-emoji\{/)}
.dl .nav-mega-tip .tip-img-wrap .tip-emoji{font-size:2.4rem;font-style:normal;line-height:1}
/* รูปโปรไฟล์ไม่มี (สมัครด้วยอีเมล) → วงกลมตัวอักษรแรกของชื่อแทนรูป */
.dl .nav-user-photo.txt{display:grid;place-items:center;font-family:var(--display);font-weight:600;font-size:.9rem;color:#fff;
  background:linear-gradient(150deg,#3E9BD4,var(--navy))}
.dl .nav-user-pic.lg .nav-user-photo.txt{font-size:1.2rem}
/* กระดิ่ง: ตัวเลขจำนวนเรื่องค้าง (ต้นแบบมีแค่จุดแดง — ของจริงรู้จำนวน) + ข้อความตอนไม่มีเรื่องค้าง */
.dl .nav-bell-empty{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:.78rem;color:var(--navy-soft);
  text-align:center;padding:14px 8px 10px;font-family:var(--body)}
.dl .nav-bell-empty span{font-size:1.5rem}
/* ป้ายจำนวนรายการในตะกร้าบนไอคอนแถบเมนู (ต้นแบบไม่มี — ของจริงมีตะกร้า) */
.dl .nav-cart-icon{position:relative}
.dl .nav-cart-count{position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;
  background:#F43F5E;color:#fff;font-size:.66rem;font-weight:700;line-height:18px;text-align:center;
  box-shadow:0 0 0 2px #fff;font-family:var(--display)}
/* เมนูสามขีด: แถวหมวดตอนกำลังโหลดสินค้าย่อย */
.dl .mnav-list a i .mnav-real-ico{pointer-events:none}
/* ปุ่ม LINE ลอย — เดสก์ท็อปยกขึ้น 1 ระดับ ไม่ทับปุ่ม "🔧 แก้ไขในหลังบ้าน" (bottom 20px) ที่ลอยมุมเดียวกันตอนแอดมินล็อกอิน
   (ต้นแบบวางไว้ bottom:22px) · มือถือใช้ตำแหน่งตามต้นแบบ (เหนือแถบเมนูล่าง) */
@media(min-width:1001px){.dl .line-fab{bottom:80px}}
/* การ์ดสินค้า: พื้นฟ้าจางเผื่อสินค้าที่ยังไม่มีรูป (ต้นแบบมีรูปครบทุกใบ) */
.dl .thumb{background:linear-gradient(160deg,var(--sky-100),#fff 72%)}
/* ป้าย "ลดราคา" — ใช้ในหน้ารายการสินค้า (หน้าแรกมีแค่ขายดี/ใหม่) */
${between(/^\.dl \.tag-sale\{/, /^\.dl \.tag-new i\{/, { exclusiveEnd: true })}
/* ===== สินค้ามาใหม่ — แถวเลื่อนแนวนอนคั่นระหว่างแบนเนอร์กับหมวดสินค้า (เพิ่มจากต้นแบบ 3 ก.ย. 69) =====
   ใช้โครงการ์ด .card/.thumb/.card-body ชุดเดียวกับแถวขายดี (ต่างแค่ขนาดกับป้าย NEW)
   จงใจไม่ใช้ .rail เพราะ .rail ซ่อนการ์ดไว้จนกว่าจะได้คลาส .in และเป็นกริด 4 ช่องเต็มแถว */
${between(/^\.dl \.fresh-band\{position:relative/, /^\.dl \.fresh-band\{padding-bottom/)}
/* ── โหมดคุยจริง (HomeChat.tsx) — ต่อ n8n ตัวเดียวกับหน้าแชทแอดมิน ── */
${between(/^\.dl \.chat-cue\{/, /^\.dl \.chat-cue b\{/)}
.dl .qk-lead{font-family:var(--display);font-size:.78rem;color:#7E97B4}
.dl .chat-quick{align-items:center}
.dl .chat-send:hover:not(:disabled){transform:scale(1.08) rotate(-8deg)}
${between(/^\.dl \.chat-reset\{/, /^\.dl \.chat-note a\{/)}
/* ท้ายเว็บใช้ร่วมกับหน้าอื่นด้วย — หน้าอื่นเว้นระยะไว้ แล้วตัดระยะทิ้งเฉพาะหน้าแรก (ต้นแบบ margin-top:0) */
.dl footer{margin-top:72px}
main:has(.dl-page) + .dl footer{margin-top:0}
/* ── เมนูบัญชีลูกค้า (.acct-*) — หน้าบัญชี (/account) ยืมสไตล์แถวชุดนี้ไปใช้ จึงเก็บไว้ ── */
${between(/^\.dl \.acct-pop\{/, /^\.dl \.acct-item\.out \.acct-lb\{/)}
/* ───────── แถบหมวดสินค้า (ใต้แถบเมนู · เดสก์ท็อป) — เมกะเมนูจากหลังบ้าน (/admin/nav) ถ้าแอดมินตั้งไว้ ─────────
   เขียนเป็น CSS ที่นี่ ไม่ใช้คลาส padding/margin ของ Tailwind เพราะ .dl *{margin:0;padding:0} อยู่นอก @layer จึงชนะ utility เสมอ */
${between(/^\.dl \.catbar-row\{/, /^\.dl \.catbar-panel \.mega-badge\{/)}
/* ===== โครงการ์ดตอนกำลังโหลด (CardSkeleton) ===== */
${between(/^\.dl \.card\.sk\{/, /^\.dl \.plist-count\.sk-count\{/)}
`;

const tail = cur.slice(genLine >= 0 ? genLine - 1 : extrasLine).join("\n");

const result = header + "\n" + protoCss + "\n" + siteExtras + "\n" + tail + "\n";
fs.writeFileSync(OUT, result.replace(/\n+$/, "\n"));
console.log("เขียน", OUT, result.split("\n").length, "บรรทัด");
console.log("รูปที่แทน:", imgHits.join(", "));
console.log("rule ที่ตัดทิ้ง (" + dropped.length + "):\n  " + dropped.map((d) => d.slice(0, 70)).join("\n  "));
