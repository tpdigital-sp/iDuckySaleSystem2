/**
 * 📱 เคสมือถือ: เปลี่ยนชื่อรุ่น "iPhone 17 Pro" → "iPhone 17 Pro / 18 Pro" และ "iPhone 17 Pro Max" → "iPhone 17 Pro Max / 18 Pro Max"
 *   (เคส 17 Pro ใช้กับ 18 Pro ได้ตัวเดียวกัน — เจ้าของร้านส่งรูปจากซัพพลายเออร์ 8 ต.ค. 69)
 *   สินค้า: case-frame-card · case-magsafe · case-premium-clear (3 ตัวที่มีรุ่น 17 Pro)
 *   ลากตาม: กฎกรองรุ่น (rules.limit.allow) · ช่องราคา · showWhen ฯลฯ ผ่าน renameChoiceInProduct + ข้อความ "รองรับ…" ทุกช่อง
 *   SKU สต๊อก (Firestore stockItems) ผูกด้วย stockItemId อยู่แล้ว — เปลี่ยนแค่ชื่อแสดง + เก็บชื่อเดิมใน aliases
 *   npx tsx scripts/case-iphone18-rename.mts            # ดูแผน
 *   npx tsx scripts/case-iphone18-rename.mts --write    # เขียนจริง (สำรอง JSON เดิมที่ $TMPDIR/case-iphone18-backup) · รันซ้ำได้
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { renameChoiceInProduct } from "../src/lib/option-rename";
import type { Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const IDS = ["case-frame-card", "case-magsafe", "case-premium-clear"];
const PAIRS: [string, string][] = [
  ["iPhone 17 Pro Max", "iPhone 17 Pro Max / 18 Pro Max"],
  ["iPhone 17 Pro", "iPhone 17 Pro / 18 Pro"],
];
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const svc = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64!, "base64").toString("utf8"));
const db = getFirestore(initializeApp({ credential: cert(svc) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const backupDir = `${process.env.TMPDIR ?? "/tmp"}/case-iphone18-backup`;
mkdirSync(backupDir, { recursive: true });

/** ข้อความอิสระ (desc/FAQ/แท็บ/SEO) — ไม่แตะชื่อที่เปลี่ยนแล้ว (idempotent) */
const fixText = (s: string) =>
  s.replace(/iPhone 17 Pro Max(?! \/ 18)/g, "iPhone 17 Pro Max / 18 Pro Max").replace(/iPhone 17 Pro(?! Max)(?! \/ 18)/g, "iPhone 17 Pro / 18 Pro");
const walk = (v: unknown): unknown =>
  typeof v === "string" ? fixText(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v;

const skuIds = new Set<string>();
for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  if (error || !row) throw new Error(`${id}: ${error?.message ?? "ไม่พบ"}`);
  const p0 = row.data as Product;
  let p = p0;
  const notes: string[] = [];
  (p0.options ?? []).forEach((g, gi) => {
    for (const [a, b] of PAIRS) {
      const c = g.choices.find((c) => c.name.trim() === a);
      if (!c) continue;
      if (g.presetId) throw new Error(`${id}: กลุ่ม "${g.label}" ลิงก์คลังกลาง ${g.presetId} — ต้องเปลี่ยนที่ /admin/options`);
      p = renameChoiceInProduct(p, gi, a, b);
      notes.push(`[${g.label}] ${a} → ${b}${c.stockItemId ? ` (SKU ${c.stockItemId})` : ""}`);
      if (c.stockItemId) skuIds.add(c.stockItemId);
    }
  });
  const before = JSON.stringify(p0);
  p = walk(p) as Product;
  const after = JSON.stringify(p);
  const textHits = (before.match(/iPhone 17 Pro[^"]*/g) ?? []).filter((s) => !PAIRS.some(([a]) => s === a));
  const leftover = after.match(/iPhone 17 Pro(?! Max \/ 18)(?! \/ 18)[^"]{0,30}/g) ?? [];
  console.log(`\n## ${id} (${p0.name})`);
  for (const n of notes) console.log("   " + n);
  for (const t of [...new Set(textHits)]) console.log(`   ข้อความ: …${t.slice(0, 80)}`);
  if (leftover.length) console.log(`   ⚠️ ยังเหลือ: ${[...new Set(leftover)].join(" | ")}`);
  if (before === after) { console.log("   (ไม่มีอะไรเปลี่ยน)"); continue; }
  if (WRITE) {
    writeFileSync(`${backupDir}/${id}.json`, before);
    const { error: e2 } = await sb.from("products").update({ data: { ...p, savedAt: new Date().toISOString() } }).eq("id", id);
    if (e2) throw new Error(`${id}: ${e2.message}`);
    console.log("   ✓ เขียนแล้ว");
  }
}

console.log("\n## SKU สต๊อก (Firestore stockItems)");
for (const sid of skuIds) {
  const ref = db.collection("stockItems").doc(sid);
  const snap = await ref.get();
  if (!snap.exists) { console.log(`   ${sid}: ⚠️ ไม่พบ`); continue; }
  const it = snap.data() as { name: string; code?: string; aliases?: string[] };
  const newName = fixText(it.name);
  if (newName === it.name) { console.log(`   ${sid} ${it.code ?? ""} "${it.name}" (คงเดิม)`); continue; }
  const aliases = [...new Set([...(it.aliases ?? []), it.name])];
  console.log(`   ${sid} ${it.code ?? ""} "${it.name}" → "${newName}"`);
  if (WRITE) { await ref.update({ name: newName, aliases, updatedAt: new Date().toISOString() }); console.log("      ✓ เขียนแล้ว"); }
}
console.log(WRITE ? "\nเสร็จ (สำรองที่ " + backupDir + ")" : "\nแผนเท่านั้น — ใส่ --write เพื่อเขียนจริง");
process.exit(0);
