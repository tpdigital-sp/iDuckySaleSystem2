// สำรองฐานข้อมูล Supabase ทั้งก้อนออกมาเป็นไฟล์ JSON
//
//   node scripts/backup-db.mjs                 → ดัมป์ทุกตาราง + รายการไฟล์ใน Storage
//   node scripts/backup-db.mjs --files         → โหลดไฟล์รูปใน Storage ลงเครื่องด้วย (ใหญ่/ช้า)
//   node scripts/backup-db.mjs --out /Volumes/…/idk-backup   → เลือกที่เก็บเอง
//   node scripts/backup-db.mjs --keep 10       → เก็บชุดล่าสุดกี่ชุด (ค่าเริ่มต้น 20)
//
// ได้โฟลเดอร์ backups/<วันเวลา>/ ข้างใน: ตารางละ 1 ไฟล์ .json + _manifest.json บอกจำนวนแถว
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("❌ .env.local ไม่มี NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const sb = createClient(URL_, KEY, { auth: { persistSession: false } });

const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const WITH_FILES = argv.includes("--files");
const KEEP = Number(arg("--keep", 20));
const ROOT = arg("--out", "backups");

// ตารางที่ใช้จริงในระบบ (ตัวไหนยังไม่ได้สร้างใน Supabase จะข้ามให้เอง ไม่พัง)
const TABLES = ["products", "orders", "profiles", "coupons", "quotes", "ratings", "reviews", "product_claims", "option_presets", "product_revisions"];
const BUCKETS = ["product-images"];
const PAGE = 500;

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dir = join(ROOT, stamp);
mkdirSync(dir, { recursive: true });

const manifest = { at: new Date().toISOString(), project: URL_, tables: {}, storage: {} };
const mb = n => (n / 1048576).toFixed(1) + " MB";

for (const table of TABLES) {
  const rows = [];
  let from = 0, failed = null;
  for (;;) {
    const { data, error } = await sb.from(table).select("*").range(from, from + PAGE - 1);
    if (error) { failed = error.message; break; }
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
    process.stdout.write(`\r  ${table}: ${rows.length} แถว…`);
  }
  if (failed) {
    // ตารางยังไม่มีในโปรเจกต์ = ข้าม ไม่ใช่ความผิดพลาด
    const missing = /does not exist|schema cache|relation/i.test(failed);
    manifest.tables[table] = { rows: null, [missing ? "skipped" : "error"]: failed };
    console.log(`\r  ${(missing ? "–" : "❌")} ${table.padEnd(18)} ${missing ? "ยังไม่มีตารางนี้ — ข้าม" : failed}`);
    continue;
  }
  const file = join(dir, `${table}.json`);
  writeFileSync(file, JSON.stringify(rows, null, 2));
  const size = statSync(file).size;
  manifest.tables[table] = { rows: rows.length, bytes: size };
  console.log(`\r  ✓ ${table.padEnd(18)} ${String(rows.length).padStart(6)} แถว  ${mb(size).padStart(9)}`);
}

// Storage: เก็บรายการไฟล์เสมอ (ชื่อ/ขนาด/URL) — ตัวไฟล์จริงโหลดเมื่อสั่ง --files
for (const bucket of BUCKETS) {
  const walk = async (path = "") => {
    const { data, error } = await sb.storage.from(bucket).list(path, { limit: 1000, sortBy: { column: "name", order: "asc" } });
    if (error) return [];
    const out = [];
    for (const e of data) {
      const full = path ? `${path}/${e.name}` : e.name;
      if (e.id) out.push({ path: full, size: e.metadata?.size ?? null, updated: e.updated_at ?? null, url: sb.storage.from(bucket).getPublicUrl(full).data.publicUrl });
      else out.push(...await walk(full));
    }
    return out;
  };
  const files = await walk();
  writeFileSync(join(dir, `storage-${bucket}.json`), JSON.stringify(files, null, 2));
  const total = files.reduce((s, f) => s + (f.size || 0), 0);
  manifest.storage[bucket] = { files: files.length, bytes: total, downloaded: WITH_FILES };
  console.log(`  ✓ storage/${bucket}  ${files.length} ไฟล์  รวม ${mb(total)}${WITH_FILES ? " — กำลังโหลดลงเครื่อง…" : " (รายการอย่างเดียว · ใส่ --files ถ้าอยากโหลดไฟล์จริง)"}`);

  if (WITH_FILES) {
    let done = 0, failed = 0;
    for (const f of files) {
      const dest = join(dir, "storage", bucket, f.path);
      mkdirSync(dirname(dest), { recursive: true });
      const { data, error } = await sb.storage.from(bucket).download(f.path);
      if (error) { failed++; continue; }
      writeFileSync(dest, Buffer.from(await data.arrayBuffer()));
      if (++done % 25 === 0) process.stdout.write(`\r    โหลดแล้ว ${done}/${files.length}`);
    }
    manifest.storage[bucket].downloadedFiles = done;
    manifest.storage[bucket].downloadFailed = failed;
    console.log(`\r    โหลดไฟล์เสร็จ ${done}/${files.length}${failed ? ` · พลาด ${failed}` : ""}`);
  }
}

writeFileSync(join(dir, "_manifest.json"), JSON.stringify(manifest, null, 2));

// ลบชุดเก่าที่เกิน --keep
const sets = readdirSync(ROOT).filter(n => /^\d{4}-\d{2}-\d{2}T/.test(n)).sort();
for (const old of sets.slice(0, Math.max(0, sets.length - KEEP))) {
  rmSync(join(ROOT, old), { recursive: true, force: true });
  console.log(`  🗑  ลบชุดเก่า ${old}`);
}

const totalBytes = readdirSync(dir).reduce((s, n) => { try { return s + statSync(join(dir, n)).size; } catch { return s; } }, 0);
console.log(`\n📦 สำรองเสร็จ → ${dir}  (${mb(totalBytes)} · เก็บไว้ ${Math.min(sets.length, KEEP)} ชุด)`);
