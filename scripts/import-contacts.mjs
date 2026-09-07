/**
 * นำเข้าผู้ติดต่อจากไฟล์ที่ดึงมาจาก backoffice.casedesign2u.com เข้าตาราง contacts ใน Supabase
 *
 * ปกติใช้หน้า หลังบ้าน › ข้อมูลผู้ติดต่อ › นำเข้าจากระบบเดิม ก็พอ — สคริปต์นี้เผื่อรันจาก terminal
 * วิธีใช้ (หลังรัน supabase/contacts.sql ใน SQL Editor แล้ว):
 *   node scripts/import-contacts.mjs ~/Downloads/contacts-casedesign2u.json
 *
 * รับได้ทั้ง JSON array และ NDJSON (บรรทัดละก้อน) — แต่ละรายการ:
 *   { id, name, phone, address, point, rank }
 * ถ้า phone ว่างจะพยายามดึงเบอร์ (0xxxxxxxxx) ออกจากข้อความที่อยู่ให้เอง
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env.local", ".env"]) {
  try {
    const raw = readFileSync(join(root, name), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // ไม่มีไฟล์ก็ข้าม
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("ไม่พบ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ใน .env.local");
  process.exit(1);
}
const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

const file = process.argv[2];
if (!file) {
  console.error("ระบุไฟล์ข้อมูลด้วย: node scripts/import-contacts.mjs <ไฟล์ .json/.ndjson>");
  process.exit(1);
}

const raw = readFileSync(file, "utf8").trim();
/** @type {any[]} */
const rows = raw.startsWith("[")
  ? JSON.parse(raw)
  : raw.split("\n").filter(Boolean).map((l) => JSON.parse(l));

/** เบอร์ไทย 9-10 หลักขึ้นต้น 0 — เผื่อคั่นด้วยขีด/เว้นวรรค เช่น 093-398-1155 */
function phoneFrom(text) {
  const m = String(text || "").replace(/[-\s]/g, (c) => (c === "-" ? "" : " ")).match(/0\d{8,9}/);
  return m ? m[0] : "";
}

const now = new Date().toISOString();
const seen = new Set();
const records = [];
for (const r of rows) {
  const id = String(r.id ?? "").trim();
  if (!id || seen.has(id)) continue; // กันรหัสซ้ำ (ระบบเดิมมีรายการซ้ำอยู่บ้าง)
  seen.add(id);
  const name = String(r.name ?? "").trim();
  const address = String(r.address ?? "").trim();
  const phone = String(r.phone ?? "").trim() || phoneFrom(name + " " + address);
  records.push({
    id,
    data: {
      name,
      phone,
      address,
      point: Number(String(r.point ?? "0").replace(/,/g, "")) || 0,
      rank: String(r.rank ?? "").trim() === "0" ? "" : String(r.rank ?? "").trim(),
      rankStatus: String(r.rankStatus ?? "").trim() === "-" ? "" : String(r.rankStatus ?? "").trim(),
      rankExpiry: String(r.rankExpiry ?? "").trim(),
      source: "casedesign2u-backoffice",
      importedAt: now,
    },
  });
}

console.log(`อ่านไฟล์ได้ ${rows.length} แถว → นำเข้า ${records.length} รายการ (ตัดซ้ำ ${rows.length - records.length})`);

const BATCH = 500;
let done = 0;
for (let i = 0; i < records.length; i += BATCH) {
  const chunk = records.slice(i, i + BATCH);
  const { error } = await sb.from("contacts").upsert(chunk, { onConflict: "id" });
  if (error) {
    console.error(`ชุดที่เริ่ม ${i} ล้มเหลว: ${error.message}`);
    process.exit(1);
  }
  done += chunk.length;
  process.stdout.write(`\rนำเข้าแล้ว ${done}/${records.length}`);
}
console.log("\nเสร็จแล้ว ✅");
