/**
 * 🖼 เติมภาพให้ SKU ที่ผูกกับคลังตัวเลือกกลาง จากภาพของตัวเลือกนั้น (เจ้าของร้าน 1 ต.ค. 69: SKU ตะขอ 227 ตัวสร้างก่อนมีภาพ → หยิบภาพสินค้ามาแทน)
 *   npx tsx scripts/sku-images-from-preset-links.mts <presetId> [--apply] [--force]
 * · ตัวเลือกที่มี stockItemId → SKU ได้ภาพตัวเลือก (imageSrc)
 * · stockLinks มีเงื่อนไข {label: [b]} → หา b ในกลุ่มชื่อ label (คลังกลางหรือกลุ่มของสินค้าที่ใช้คลังนี้) → choiceImage(b, {ชื่อคลัง: a}) → ไม่มีก็ภาพของ a
 * · เติมเฉพาะ SKU ที่ยังไม่มีภาพ (ใส่ --force = ทับ)
 */
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";
import { choiceImage, type Product, type ProductOptionChoice } from "../src/lib/products";
import type { OptionPreset } from "../src/lib/option-presets";

const presetId = process.argv[2];
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
if (!presetId) throw new Error("ใส่ presetId เช่น preset-3");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64!, "base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data: prRow } = await sb.from("products").select("data").eq("id", `__preset_${presetId}`).maybeSingle();
const preset = prRow?.data as OptionPreset | undefined;
if (!preset) throw new Error("ไม่พบคลัง " + presetId);
const { data: presetRows } = await sb.from("products").select("id,data").eq("category", "__presets__");
const presets = (presetRows ?? []).map((r) => r.data as OptionPreset);
const { data: prodRows } = await sb.from("products").select("id,data").neq("category", "__presets__");
const users = (prodRows ?? []).map((r) => r.data as Product).filter((p) => p.options?.some((o) => o.presetId === presetId));

/** ตัวเลือก b ของกลุ่มชื่อ label — คลังกลางก่อน แล้วค่อยกลุ่มของสินค้าที่ใช้คลังนี้ */
function findChoice(label: string, b: string): ProductOptionChoice | undefined {
  for (const ps of presets) if (ps.label === label) { const c = ps.choices.find((x) => x.name === b); if (c) return c; }
  for (const p of users) for (const o of p.options ?? []) if (!o.presetId && o.label === label) { const c = o.choices.find((x) => x.name === b); if (c) return c; }
  return undefined;
}

const plan: { id: string; url: string; why: string }[] = [];
for (const a of preset.choices) {
  if (a.stockItemId && a.imageSrc) plan.push({ id: a.stockItemId, url: a.imageSrc, why: a.name });
  for (const l of a.stockLinks ?? []) {
    const w = (l.when ?? [])[0];
    const b = w?.choices?.[0];
    const bc = w && b ? findChoice(w.label, b) : undefined;
    const url = (bc ? choiceImage(bc, { [preset.label]: a.name }) : undefined) ?? a.imageSrc;
    if (url) plan.push({ id: l.stockItemId, url, why: `${a.name} · ${b ?? "?"}` });
  }
}
const snaps = await Promise.all(plan.map((p) => db.collection("stockItems").doc(p.id).get()));
let n = 0, skip = 0;
for (const [i, p] of plan.entries()) {
  const it = snaps[i].data() as { name?: string; imageUrl?: string; active?: boolean } | undefined;
  if (!it || it.active === false) continue;
  if (it.imageUrl && !FORCE) { skip++; continue; }
  n++;
  if (n <= 8) console.log(`→ ${it.name} ← ${p.why}`);
  if (APPLY) await db.collection("stockItems").doc(p.id).update({ imageUrl: p.url, updatedAt: new Date().toISOString() });
}
console.log(`${APPLY ? "เขียนแล้ว" : "จะเขียน"} ${n} SKU · ข้าม (มีภาพแล้ว) ${skip} · ลิงก์ทั้งหมด ${plan.length}${APPLY ? "" : " — ใส่ --apply"}`);
process.exit(0);
