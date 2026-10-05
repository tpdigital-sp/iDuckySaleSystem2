/**
 * 🪝🔍 ภาพตะขอชุดใหม่ (v2) แทนชุดเบลอ 1 ต.ค. 69 — เจ้าของร้านแจ้ง 5 ต.ค. 69 "ภาพตะขอไม่ชัดเลย"
 *
 *   npx tsx scripts/hook-images-v2.mts .tmpwork/hook-images-v2            # ดูแผน
 *   npx tsx scripts/hook-images-v2.mts .tmpwork/hook-images-v2 --apply    # อัปโหลด + เปลี่ยน URL ทุกที่
 *
 * ต้นตอ: ชุดเดิม (hook-images-from-poster.mts) ครอปจากโปสเตอร์ฉบับย่อ (~1095px กว้าง) → ช่องละ ~90px
 * ขยายเป็น 400×400 = แตกเป็นก้อน + ติดขอบการ์ดสีเขียวฟ้า/ป้าย HOT · หน้าสินค้าโชว์ภาพตัวเลือกในแกลเลอรีใหญ่ ~660px
 * ชุดใหม่: ครอปจากต้นฉบับ P-ตะขอ+อะไหล่-01.jpg 3423×5000 (NAS) ด้วย scripts/hook-images-v2-boxes.py + hook-images-v2-crop.py
 *   ช่องละ ~250–750px → 800×800 · ลบวงรหัสสีเหลือง/ชื่อหัวรูป/ป้าย HOT · BB/BC ใช้รูปถ่าย 1575px จากโฟลเดอร์ ตะขอ/
 * ชื่อไฟล์ใหม่ -v2 (อัปทับชื่อเดิม = CDN/Next image cache ค้างรูปเก่า) → แทน URL เดิมทุกแถว products (คลัง+สินค้า)
 * และ stockItems.imageUrl (Firestore) · ไม่แตะ hook-H-n / hook-AC-n (ครอปจากชีต H 2080px คมอยู่แล้ว)
 */
import { readFileSync, readdirSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";

const dir = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!dir) throw new Error("ใส่โฟลเดอร์ภาพ v2");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const db = getFirestore(
  initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64!, "base64").toString("utf8"))) }),
  env.FIREBASE_DATABASE_ID || "tp-fixflow",
);
const BUCKET = "product-images";
const die = (m: string): never => {
  console.error("✗ " + m);
  process.exit(1);
};

const files = readdirSync(dir).filter((f) => /^hook-[A-Z0-9]+(-\d+)?-v2\.jpg$/.test(f));
if (files.length < 60) die(`ภาพน้อยผิดปกติ ${files.length}`);
const pub = (p: string) => sb.storage.from(BUCKET).getPublicUrl(`presets/hooks/${p}`).data.publicUrl;
/** URL เดิม → URL ใหม่ */
const swap = new Map<string, string>();
for (const f of files) swap.set(pub(f.replace(/-v2\.jpg$/, ".jpg")), pub(f));

if (APPLY) {
  for (const f of files) {
    const { error } = await sb.storage
      .from(BUCKET)
      .upload(`presets/hooks/${f}`, readFileSync(`${dir}/${f}`), { contentType: "image/jpeg", upsert: true });
    if (error) die(`${f}: ${error.message}`);
  }
  // ตรวจว่าไฟล์ขึ้นจริง (ขนาด 800px ≈ 30–150 KB · ของเดิม ~10–20 KB)
  const { data: listed } = await sb.storage.from(BUCKET).list("presets/hooks", { limit: 1000 });
  const sizes = new Map((listed ?? []).map((o) => [o.name, Number(o.metadata?.size ?? 0)]));
  const bad = files.filter((f) => (sizes.get(f) ?? 0) < 25_000);
  if (bad.length) die(`อัปโหลดไม่ครบ/ไฟล์เล็กผิดปกติ: ${bad.join(", ")}`);
}
console.log(`${APPLY ? "อัปโหลดแล้ว" : "จะอัปโหลด"} ${files.length} ไฟล์`);

const replaceAll = (s: string) => {
  let n = 0;
  for (const [o, nw] of swap) {
    const parts = s.split(`"${o}"`);
    if (parts.length > 1) {
      n += parts.length - 1;
      s = parts.join(`"${nw}"`);
    }
  }
  return { s, n };
};

// ── products (แถวคลัง __preset_* + สินค้า) ──
const rows: { id: string; category: string; data: unknown }[] = [];
for (let from = 0; ; from += 200) {
  const { data, error } = await sb.from("products").select("id,category,data").range(from, from + 199);
  if (error) die(error.message);
  if (!data!.length) break;
  rows.push(...data!);
}
let total = 0;
for (const r of rows) {
  const { s, n } = replaceAll(JSON.stringify(r.data));
  if (!n) continue;
  total += n;
  const next = JSON.parse(s) as Record<string, unknown>;
  if (r.category !== "__presets__") next.savedAt = new Date().toISOString(); // หน้าแก้ไขที่เปิดค้างจะโดน 409 ไม่บันทึกทับ
  console.log(`${APPLY ? "✓" : "→"} ${r.id} — ${n} ภาพ`);
  if (!APPLY) continue;
  const { data: back, error } = await sb.from("products").update({ data: next }).eq("id", r.id).select("data");
  if (error) die(`${r.id}: ${error.message}`);
  if (!back?.length) die(`${r.id}: update โดน 0 แถว`);
  const left = replaceAll(JSON.stringify(back[0].data)).n;
  const got = (JSON.stringify(back[0].data).match(/presets\/hooks\/hook-[A-Z0-9-]+-v2\.jpg/g) ?? []).length;
  if (left || got < n) die(`${r.id}: อ่านกลับไม่ตรง (ค้าง URL เดิม ${left} · v2 ${got}/${n})`);
}
console.log(`products: ${total} จุด`);

// ── stockItems.imageUrl (Firestore) ──
const snap = await db.collection("stockItems").get();
let sku = 0;
for (const d of snap.docs) {
  const url = d.get("imageUrl") as string | undefined;
  const nw = url ? swap.get(url) : undefined;
  if (!nw) continue;
  sku++;
  if (APPLY) await d.ref.update({ imageUrl: nw, updatedAt: new Date().toISOString() });
}
console.log(`stockItems: ${APPLY ? "เปลี่ยน" : "จะเปลี่ยน"} ${sku} SKU`);
console.log(APPLY ? "เสร็จ" : "ยังไม่เขียน — ใส่ --apply");
process.exit(0);
