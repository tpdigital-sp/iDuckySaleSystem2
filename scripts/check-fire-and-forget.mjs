/**
 * 🧊 ด่านกัน "งานหลังตอบหายเงียบ" — โค้ดฝั่งเซิร์ฟเวอร์ห้ามเขียน `void task()` ต้องใช้ inBackground() (src/lib/server/background.ts)
 *
 * ทำไม (พนักงานแจ้ง 25 ก.ย. 69 "แจ้งเตือนไปหาลูกค้าไม่ค่อยไป"):
 * บน Netlify ฟังก์ชันถูกแช่แข็งทันทีที่ส่งคำตอบ งานที่ยิงแบบ `void` (ไลน์/ตัดสต๊อก/แต้ม/ซิงก์ TP) ค้างกลางอากาศ
 * แล้วไปตายตอนตื่นในคำขอถัดไป — ขึ้น "ต่อ LINE ไม่ได้" วันละ 3–7 ใบ หรือหายเงียบไม่มี log
 * inBackground() ใช้ after() ของ Next บอกแพลตฟอร์มให้รอจนงานเสร็จ · ตัวนี้ทำให้ "เผลอเขียนท่าเดิม" กลายเป็น build error
 *
 * ขอบเขต: src/app/api · src/lib/server · ไฟล์ที่มี "use server" (โค้ดที่รันในฟังก์ชันเซิร์ฟเวอร์เท่านั้น — ฝั่ง browser ไม่โดนแช่แข็ง)
 * ยกเว้นเป็นบรรทัด: ต่อท้าย `// fire-and-forget-ok: <เหตุผล>` (เช่นงานที่ตั้งใจให้ทิ้งได้จริง)
 *
 * รันเอง:  node scripts/check-fire-and-forget.mjs
 * รันอัตโนมัติ: npm run build (ผ่าน prebuild)
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOTS = ["src/app/api", "src/lib/server"];
const EXTRA_ROOT = "src"; // หาไฟล์ "use server" นอก 2 โฟลเดอร์หลัก
const ALLOW_FILE = ["src/lib/server/background.ts"];

const files = new Set();
function walk(dir, pick) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, pick);
    else if (/\.tsx?$/.test(e.name) && pick(p)) files.add(p.split(path.sep).join("/"));
  }
}
for (const r of ROOTS) walk(r, () => true);
walk(EXTRA_ROOT, (p) => /^\s*["']use server["']/m.test(fs.readFileSync(p, "utf8").slice(0, 400)));

const bad = [];
for (const f of files) {
  if (ALLOW_FILE.includes(f)) continue;
  const src = fs.readFileSync(f, "utf8");
  if (!/\bvoid\s+[A-Za-z_$]/.test(src)) continue; // เร็ว ๆ ก่อน parse
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (n) => {
    if (ts.isVoidExpression(n) && ts.isCallExpression(n.expression)) {
      const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
      const text = src.split("\n")[line];
      if (!/fire-and-forget-ok:/.test(text)) bad.push(`${f}:${line + 1}  ${text.trim().slice(0, 100)}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

if (bad.length) {
  console.error("\n⛔ โค้ดเซิร์ฟเวอร์ยิงงานแบบ `void task()` — บน Netlify งานจะถูกแช่แข็งแล้วตาย/หายเงียบ\n");
  for (const b of bad) console.error("   " + b);
  console.error(
    "\n   แก้: import { inBackground } from \"@/lib/server/background\" แล้วเขียน inBackground(\"ชื่องาน\", task(...))" +
      "\n   ตั้งใจให้ทิ้งได้จริง: ต่อท้ายบรรทัดด้วย  // fire-and-forget-ok: <เหตุผล>\n"
  );
  process.exit(1);
}
console.log(`✓ fire-and-forget: ไม่มี void task() ในโค้ดเซิร์ฟเวอร์ (ตรวจ ${files.size} ไฟล์)`);
