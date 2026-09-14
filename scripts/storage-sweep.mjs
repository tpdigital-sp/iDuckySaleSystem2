/**
 * 🧹 กวาดไฟล์ "ไม่มีใครอ้างถึง" ออกจาก Supabase Storage
 *
 * ทำไม: 14 ก.ย. 69 Supabase ระงับโปรเจกต์เพราะเกินโควตาที่เก็บ ตรวจแล้วพบว่าเกินครึ่งของพื้นที่
 * เป็นไฟล์ที่ "ไม่มีแถวไหนในฐานข้อมูลอ้างถึงแล้ว" — ลายที่ลูกค้าอัปในตะกร้าแล้วไม่ได้สั่ง ·
 * แบบงาน/ภาพแพ็คที่ถูกลบออกจากออเดอร์ (ลบ URL ออกแต่ไฟล์ยังค้างใน bucket) · เทมเพลตที่อัปทับ
 *
 * วิธีทำงาน (ปลอดภัยไว้ก่อน):
 *  1) ไล่อ่าน "ทุกตาราง" ในฐานข้อมูล แล้วเก็บทุก URL/พาธของ Storage ที่เจอ — ไม่ได้ดูแค่ช่องที่รู้จัก
 *     (artworkUrls · proofs · packPhotos · slipPath · ใบเสนอราคา · ลิงก์ราคา · เทมเพลตสินค้า ฯลฯ)
 *  2) ไล่รายชื่อไฟล์จริงในแต่ละ bucket
 *  3) ไฟล์ที่ไม่อยู่ในชุดข้อ 1 = ไม่มีใครอ้างถึง → เข้าคิวลบ
 *  4) กันพลาด: ไฟล์ที่ใหม่กว่า --days วัน (ค่าเริ่ม 14) ไม่ลบ — ตะกร้าที่ลูกค้าค้างไว้ยังไม่ได้กดสั่ง
 *     เก็บ URL ไว้ในเครื่องตัวเอง (localStorage) ซึ่งสแกนจากฐานข้อมูลไม่เห็น
 *
 * ⚠️ ลบแล้วกู้คืนไม่ได้ · ค่าเริ่มต้นเป็นโหมดลองดู ต้องใส่ --apply ถึงจะลบจริง
 * ⚠️ ไม่แตะ bucket สลิป (payment-slips*) — หลักฐานการเงิน ดูโน้ต iducky-supabase-quota-lock
 * ⚠️ ไม่แตะคลังเทมเพลตร้าน (design-templates = หน้า /admin/templates) เว้นแต่ใส่ --include-templates
 *    ไฟล์ .ai ทุกไฟล์ในระบบอยู่ในถังนี้ถังเดียว — ลูกค้าแนบ .ai ไม่ได้ (รับแค่ PNG/JPG/WEBP)
 *
 * ใช้:
 *   node scripts/storage-sweep.mjs                   ดูว่าจะลบอะไรบ้าง (ไม่ลบ)
 *   node scripts/storage-sweep.mjs --apply           ลบจริง
 *   node scripts/storage-sweep.mjs --days=7 --apply  ผ่อนด่านกันพลาดเหลือ 7 วัน (ลบได้มากขึ้น)
 *   node scripts/storage-sweep.mjs --bucket=customer-artwork --apply   เจาะ bucket เดียว
 *   node scripts/storage-sweep.mjs --include-templates               รวมคลังเทมเพลตร้านด้วย (ดูคำเตือนข้างบน)
 */
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error("✗ ไม่พบ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ใน .env.local");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "content-type": "application/json" };

const APPLY = process.argv.includes("--apply");
const DAYS = Number((process.argv.find((a) => a.startsWith("--days=")) || "").slice(7)) || 14;
const ONLY = (process.argv.find((a) => a.startsWith("--bucket=")) || "").slice(9);
/** กวาดคลังเทมเพลตร้านด้วย (ลบเฉพาะไฟล์ที่ไม่มีสินค้าตัวไหนอ้างถึง — ของที่โชว์ในหน้า /admin/templates ไม่โดน) */
const WITH_TPL = process.argv.includes("--include-templates");

/**
 * bucket ที่กวาดได้ — เฉพาะไฟล์ฝั่งออเดอร์ลูกค้า
 * ไม่มี bucket สลิป (หลักฐานการเงิน) และไม่มี design-templates (คลังเทมเพลตหน้า /admin/templates
 * — เจ้าของร้านสั่ง 14 ก.ย. 69 ว่าห้ามแตะ) · ต้องใส่ --include-templates ถึงจะกวาดคลังเทมเพลตด้วย
 */
const SWEEPABLE = ["order-proofs", "customer-artwork", "artwork", "proofs", "pack-photos"];
const TEMPLATES_BUCKET = "design-templates";
const MB = (n) => `${(n / 1e6).toFixed(1)} MB`;

// ── 1) ทุก URL/พาธที่ฐานข้อมูลอ้างถึง ──
async function allTables() {
  const spec = await fetch(`${URL_BASE}/rest/v1/`, { headers: H }).then((r) => r.json());
  return Object.keys(spec.definitions ?? {});
}

async function collectRefs(tables) {
  const urls = new Set(); // "bucket/path"
  const bare = new Set(); // พาธเปล่า ๆ เช่น slipPath ("OD-xxxx/uuid.jpg")
  for (const t of tables) {
    let from = 0;
    for (;;) {
      const r = await fetch(`${URL_BASE}/rest/v1/${t}?select=*`, { headers: { ...H, Range: `${from}-${from + 499}` } });
      if (!r.ok) break; // ตารางที่อ่านไม่ได้ก็ข้าม (ไม่ถือว่าพัง)
      const rows = await r.json();
      if (!Array.isArray(rows) || !rows.length) break;
      const text = JSON.stringify(rows);
      for (const m of text.matchAll(/\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([A-Za-z0-9_-]+)\/([^"'\\?\s]+)/g))
        urls.add(`${m[1]}/${decodeURIComponent(m[2])}`);
      for (const m of text.matchAll(/"([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+)"/g)) bare.add(m[1]);
      if (rows.length < 500) break;
      from += 500;
    }
    process.stdout.write(".");
  }
  return { urls, bare };
}

// ── 2) ไฟล์จริงในแต่ละ bucket ──
async function listAll(bucket, prefix = "") {
  const out = [];
  let offset = 0;
  for (;;) {
    const r = await fetch(`${URL_BASE}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    const rows = await r.json();
    if (!Array.isArray(rows)) break;
    for (const x of rows) {
      const path = (prefix ? `${prefix}/` : "") + x.name;
      if (x.id === null) out.push(...(await listAll(bucket, path)));
      else out.push({ path, size: x.metadata?.size ?? 0, at: x.updated_at });
    }
    if (rows.length < 1000) break;
    offset += 1000;
  }
  return out;
}

console.log(`🧹 กวาดไฟล์ไม่มีใครอ้างถึง · ด่านกันพลาด ${DAYS} วัน · โหมด ${APPLY ? "ลบจริง" : "ลองดู (ไม่ลบ)"}`);
process.stdout.write("อ่านฐานข้อมูล ");
const tables = await allTables();
const { urls, bare } = await collectRefs(tables);
console.log(`\n  ${tables.length} ตาราง · พบการอ้างอิง ${urls.size} URL + ${bare.size} พาธ`);

const buckets = await fetch(`${URL_BASE}/storage/v1/bucket`, { headers: H }).then((r) => r.json());
const allowed = WITH_TPL ? [...SWEEPABLE, TEMPLATES_BUCKET] : SWEEPABLE;
const names = buckets.map((b) => b.name).filter((n) => allowed.includes(n) && (!ONLY || n === ONLY));
const guard = Date.now() - DAYS * 86400_000;

const plan = {};
const manifest = {};
let totalN = 0;
let totalS = 0;
for (const b of names) {
  const files = await listAll(b);
  if (!files.length) continue;
  const dead = files.filter((x) => !urls.has(`${b}/${x.path}`) && !bare.has(x.path));
  const ripe = dead.filter((x) => new Date(x.at ?? 0).getTime() < guard);
  const young = dead.filter((x) => new Date(x.at ?? 0).getTime() >= guard);
  const size = (a) => a.reduce((s, x) => s + x.size, 0);
  console.log(
    `\n== ${b}: ทั้งหมด ${files.length} ไฟล์ ${MB(size(files))}` +
      `\n   ใช้งานอยู่ ${files.length - dead.length} ไฟล์` +
      `\n   🗑️ ลบได้ ${ripe.length} ไฟล์ ${MB(size(ripe))}` +
      `\n   ⏳ กันไว้ (ใหม่กว่า ${DAYS} วัน) ${young.length} ไฟล์ ${MB(size(young))}`
  );
  if (!ripe.length) continue;
  plan[b] = ripe.map((x) => x.path);
  manifest[b] = ripe;
  totalN += ripe.length;
  totalS += size(ripe);
}

console.log(`\nรวมที่จะลบ ${totalN} ไฟล์ ${MB(totalS)}`);
if (!totalN) process.exit(0);

// จดรายการไว้เสมอ — ลบแล้วกู้ไฟล์ไม่ได้ แต่ต้องรู้ว่าลบอะไรไป
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
fs.mkdirSync("backups", { recursive: true });
const log = `backups/storage-sweep-${APPLY ? "deleted" : "dry"}-${stamp}.json`;
fs.writeFileSync(log, JSON.stringify({ days: DAYS, applied: APPLY, files: manifest }, null, 1));
console.log(`📝 รายการไฟล์: ${log}`);

if (!APPLY) {
  console.log("\nยังไม่ได้ลบอะไร — ใส่ --apply เมื่อพร้อมลบจริง");
  process.exit(0);
}

for (const [bucket, paths] of Object.entries(plan)) {
  let done = 0;
  const failed = [];
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const r = await fetch(`${URL_BASE}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: H,
      body: JSON.stringify({ prefixes: chunk }),
    });
    if (r.ok) done += chunk.length;
    else failed.push(`${r.status} ${(await r.text()).slice(0, 100)}`);
  }
  console.log(`${bucket}: ลบแล้ว ${done}/${paths.length}${failed.length ? ` · ผิดพลาด ${failed[0]}` : ""}`);
}
console.log("✓ เสร็จแล้ว");
