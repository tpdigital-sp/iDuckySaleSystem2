#!/usr/bin/env node
/**
 * 📁 ดัชนีโฟลเดอร์ "ข้อมูลตอบลูกค้า" บน NAS → หน้า /admin/chatbot โชว์ path ใต้รูปสินค้าในคำตอบ
 * แอดมิน WFH เปิดตาม path ไปหาใบราคา/รูปภาพของสินค้านั้นได้เลย (เฉพาะหน้าหลังบ้านนี้ · แชทลูกค้าไม่เห็น)
 *
 *   node scripts/answer-folders-index.mjs            (dry-run: โชว์ว่าจับคู่สินค้าได้กี่ตัว + โฟลเดอร์ที่จับไม่ได้)
 *   node scripts/answer-folders-index.mjs --apply    (บันทึกดัชนีลงแถว __answer_folders__ ในตาราง products)
 *   node scripts/answer-folders-index.mjs --root="/Volumes/iDuckyShop/- (ทดสอบ) ข้อมูลตอบลูกค้า"
 *
 * ทำไมต้องเป็นสคริปต์: เว็บจริงรันบน Netlify อ่าน /Volumes ไม่ได้ → สแกนจากเครื่องร้านแล้วเก็บดัชนีในฐาน
 * โครงโฟลเดอร์ (00_สารบัญ - อ่านก่อน.txt · 14 ก.ย. 69): <NN_หมวด>/<ชื่อสินค้าบนเว็บเป๊ะ ๆ>/ใบราคา|รูปภาพ
 * ข้าม: _ข้อมูลกลาง / _รอแยก / 99_เก่า / 00_… / "- แก้" · ย้าย/เปลี่ยนชื่อโฟลเดอร์ = รันใหม่ด้วย --apply
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim()];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const APPLY = process.argv.includes("--apply");
const ROOT = (process.argv.find((a) => a.startsWith("--root=")) ?? "").slice(7) || "/Volumes/iDuckyShop/- (ทดสอบ) ข้อมูลตอบลูกค้า";
const ROW_ID = "__answer_folders__";

const skip = (n) => /^(_|\.|-|00_|99_)/.test(n) || n === "Thumbs.db";
const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
/** ชื่อเทียบกัน: ตัดช่องว่าง/เครื่องหมาย ตัวเล็กหมด (ชื่อโฟลเดอร์ห้ามมี / : ชื่อสินค้าบางตัวมี) */
const norm = (s) => String(s).normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

if (!isDir(ROOT)) {
  console.error(`❌ เปิดโฟลเดอร์ไม่ได้: ${ROOT}\n   (ต่อ NAS iDuckyShop ก่อน หรือระบุ --root=)`);
  process.exit(1);
}

// 1) สแกน <หมวด>/<สินค้า>
const folders = [];
for (const cat of readdirSync(ROOT).sort()) {
  if (skip(cat) || !isDir(join(ROOT, cat))) continue;
  for (const prod of readdirSync(join(ROOT, cat)).sort()) {
    if (skip(prod) || !isDir(join(ROOT, cat, prod))) continue;
    folders.push({ rel: `${cat}/${prod}`, name: prod });
  }
}

// 2) สินค้าบนเว็บ
const { data: rows, error } = await sb.from("products").select("id, category, name:data->>name, slug:data->>slug, hidden:data->>hidden");
if (error) throw error;
const products = rows.filter((r) => r.id && r.name && !String(r.id).startsWith("__") && !String(r.category ?? "").startsWith("__"));
const byName = new Map();
for (const p of products) {
  const k = norm(p.name);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(p);
}

// 3) จับคู่ด้วยชื่อ (โฟลเดอร์แบบเดิมที่มี " + " = หลายสินค้าใช้โฟลเดอร์เดียว)
/** key = id และ slug ของสินค้า (ลิงก์ในคำตอบบอทใช้ slug ถ้ามี) → path ต่อจาก root */
const items = {};
const unmatched = [];
let matched = 0;
for (const f of folders) {
  // ชื่อเต็มก่อน ("กล่องซีดี + NFC" อาจเป็นชื่อสินค้าตัวเดียว) · ไม่เจอค่อยแตกตาม " + "
  const whole = byName.get(norm(f.name)) ?? [];
  const hits = whole.length ? whole : f.name.split(/\s\+\s/).flatMap((part) => byName.get(norm(part)) ?? []);
  if (!hits.length) {
    unmatched.push(f.rel);
    continue;
  }
  for (const p of hits) {
    if (items[p.id]) continue; // สินค้าเดียวมีหลายโฟลเดอร์ → เอาอันแรก (เรียงตามหมวด)
    items[p.id] = f.rel;
    if (p.slug?.trim()) items[p.slug.trim()] = f.rel;
    matched++;
  }
}
// 4) รอบสอง: โฟลเดอร์ที่ยังไม่ตรง แต่ "ขึ้นต้นด้วยชื่อสินค้า" ที่ยังไม่มีโฟลเดอร์ (แผ่นอะคริลิค (Acrylic Sheet) → แผ่นอะคริลิค)
//    ต้องเหลือผู้สมัครตัวเดียวเท่านั้น — ชื่อซ้ำ (โฟโต้บูธ 2 ตัว) ปล่อยให้คนแก้ชื่อเอง ไม่เดา
for (const rel of [...unmatched]) {
  const nf = norm(rel.split("/").pop());
  const cands = products.filter((p) => !items[p.id] && norm(p.name).length >= 4 && nf.startsWith(norm(p.name)));
  if (cands.length !== 1) continue;
  const p = cands[0];
  items[p.id] = rel;
  if (p.slug?.trim()) items[p.slug.trim()] = rel;
  matched++;
  unmatched.splice(unmatched.indexOf(rel), 1);
  console.log(`🔎 จับคู่แบบขึ้นต้นชื่อ: ${rel} → ${p.name}`);
}

const noFolder = products.filter((p) => !items[p.id] && p.hidden !== "true");

console.log(`📁 ${ROOT}`);
console.log(`   โฟลเดอร์สินค้า ${folders.length} · จับคู่สินค้าได้ ${matched} ตัว · โฟลเดอร์ที่ไม่ตรงชื่อสินค้าบนเว็บ ${unmatched.length}`);
if (unmatched.length) console.log(`\n⚠️ โฟลเดอร์ที่ไม่ตรงชื่อสินค้า (เปลี่ยนชื่อให้ตรงเว็บแล้วรันใหม่):\n${unmatched.map((u) => `   · ${u}`).join("\n")}`);
console.log(`\nℹ️ สินค้าที่เผยแพร่อยู่แต่ไม่มีโฟลเดอร์: ${noFolder.length} ตัว${noFolder.length ? `\n${noFolder.map((p) => `   · ${p.name}`).join("\n")}` : ""}`);

if (!APPLY) {
  console.log("\n(dry-run — ใส่ --apply เพื่อบันทึก)");
  process.exit(0);
}
/**
 * 🪟 พนักงานใช้ Windows → path แบบ \\เซิร์ฟเวอร์\แชร์\… (วางในช่องที่อยู่ File Explorer)
 * อ่านจาก mount ของ Mac: //user@192.168.1.100/iDuckyShop on /Volumes/iDuckyShop · ระบุเองได้ --win-root=
 */
function winRootOf(root) {
  const given = (process.argv.find((a) => a.startsWith("--win-root=")) ?? "").slice(11);
  if (given) return given.replace(/[\\/]+$/, "");
  try {
    for (const line of execSync("mount", { encoding: "utf8" }).split("\n")) {
      const m = line.match(/^\/\/(?:[^@]+@)?([^/]+)\/(\S+) on (\/Volumes\/[^(]+?) \(/);
      if (m && root.startsWith(m[3])) return `\\\\${m[1]}\\${decodeURIComponent(m[2])}${root.slice(m[3].length).replace(/\//g, "\\")}`;
    }
  } catch {}
  return "";
}
const winRoot = winRootOf(ROOT);
console.log(`🪟 Windows: ${winRoot || "(หาไม่เจอ — ใส่ --win-root=\\\\192.168.1.100\\iDuckyShop\\…)"}`);
const answerFolders = { root: ROOT, winRoot, at: new Date().toISOString(), items, unmatched };
const { error: e2 } = await sb
  .from("products")
  .upsert({ id: ROW_ID, name: "(ตั้งค่าร้าน — โฟลเดอร์ข้อมูลตอบลูกค้า)", category: "__settings__", price: 0, data: { answerFolders } }, { onConflict: "id" });
if (e2) throw e2;
console.log(`\n✅ บันทึกแล้ว → products/${ROW_ID}`);
