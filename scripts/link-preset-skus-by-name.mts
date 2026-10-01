/**
 * 🔗 ผูก SKU ที่มีอยู่แล้วเข้าคลังตัวเลือกกลางด้วย "ชื่อ/ชื่อที่เคยเรียก" (เจ้าของร้าน 1 ต.ค. 69: แยกสต๊อกตะขอแบบ "เบิกเอง" ไว้ 242 ตัว
 * แล้วอยากให้ตัดตามการขายของทุกสินค้าที่ใช้ชุดตะขอเดียวกัน)
 *   npx tsx scripts/link-preset-skus-by-name.mts <presetId> [--apply]
 * กติกาจับคู่ (เหมือนที่หน้าต่างแยกสต๊อกสร้างให้):
 *   · ตัวเลือก a ของคลัง → SKU ที่ชื่อหรือ alias = a.name → a.stockItemId
 *   · กลุ่มย่อยที่ "แสดงเมื่อ <คลัง> = a" (คลังสี หรือกลุ่มของสินค้าที่ใช้คลังนี้) ค่า b → SKU ที่ alias = "a · b" → a.stockLinks += {when:[{กลุ่มย่อย:[b]}]}
 * SKU ที่ผูกได้: ปลด manualOnly · ตั้ง groupByOption · เติมภาพถ้ายังไม่มี · ไม่ทับลิงก์ที่มีอยู่แล้ว
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";
import { choiceImage, type Product, type ProductOption, type ProductOptionChoice } from "../src/lib/products";
import type { OptionPreset } from "../src/lib/option-presets";

const presetId = process.argv[2];
const APPLY = process.argv.includes("--apply");
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

type Sku = { id: string; name: string; aliases?: string[]; manualOnly?: boolean; groupByOption?: boolean; imageUrl?: string; active?: boolean };
const skus = (await db.collection("stockItems").get()).docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Sku, "id">) })).filter((s) => s.active !== false);
const byKey = new Map<string, Sku[]>();
for (const s of skus) for (const k of new Set([s.name.trim(), ...(s.aliases ?? []).map((a) => a.trim())])) (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(s);
const find = (key: string): Sku | undefined => {
  const hits = byKey.get(key.trim()) ?? [];
  if (hits.length > 1) console.log(`   ⚠️ “${key}” ตรงหลาย SKU (${hits.map((h) => h.name).join(" / ")}) — ข้าม`);
  return hits.length === 1 ? hits[0] : undefined;
};

const { data: prRow } = await sb.from("products").select("data").eq("id", `__preset_${presetId}`).maybeSingle();
const preset = prRow?.data as OptionPreset | undefined;
if (!preset) throw new Error("ไม่พบคลัง " + presetId);
const { data: presetRows } = await sb.from("products").select("data").eq("category", "__presets__");
const presets = (presetRows ?? []).map((r) => r.data as OptionPreset);
const { data: prodRows } = await sb.from("products").select("id,data").neq("category", "__presets__");
const users = (prodRows ?? []).map((r) => r.data as Product).filter((p) => p.options?.some((o) => o.presetId === presetId));
/** กลุ่มย่อยที่แสดงเมื่อคลังนี้ = a (ไม่ซ้ำ label) — คลังสีก่อน แล้วกลุ่มของสินค้าที่ใช้คลังนี้ */
function depsOf(a: string): { label: string; choices: ProductOptionChoice[] }[] {
  const out = new Map<string, ProductOptionChoice[]>();
  for (const p of users)
    for (const o of p.options ?? []) {
      const conds = [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? []), ...(o.showWhenAny ?? [])].filter((c): c is { label: string; choices: string[] } => !!c?.label);
      if (!conds.some((c) => c.label === preset.label && c.choices.includes(a))) continue;
      const live = o.presetId ? presets.find((ps) => ps.id === o.presetId) : undefined;
      const label = live?.label ?? o.label;
      if (!out.has(label)) out.set(label, (live?.choices ?? o.choices ?? []) as ProductOptionChoice[]);
    }
  return [...out].map(([label, choices]) => ({ label, choices }));
}

const linked = new Set<string>();
let mainN = 0, condN = 0, skip = 0;
const nextChoices = preset.choices.map((a) => {
  const c = { ...a, stockLinks: [...(a.stockLinks ?? [])] } as ProductOptionChoice & { stockLinks: NonNullable<ProductOptionChoice["stockLinks"]> };
  const deps = depsOf(a.name);
  if (!deps.length) {
    if (c.stockItemId) skip++;
    else {
      const s = find(a.name);
      if (s) { c.stockItemId = s.id; linked.add(s.id); mainN++; console.log(`→ ${a.name} ← ${s.name}`); }
    }
  }
  for (const d of deps)
    for (const b of d.choices) {
      const when = [{ label: d.label, choices: [b.name] }];
      if (c.stockLinks.some((l) => JSON.stringify(l.when ?? []) === JSON.stringify(when))) { skip++; continue; }
      const s = find(`${a.name} · ${b.name}`);
      if (!s) continue;
      c.stockLinks.push({ stockItemId: s.id, when });
      linked.add(s.id); condN++;
      if (condN <= 5) console.log(`→ ${a.name} × ${b.name} ← ${s.name}`);
    }
  if (!c.stockLinks.length) delete (c as Partial<typeof c>).stockLinks;
  return c;
});
console.log(`ผูกหลัก ${mainN} · ผูกตามกลุ่มย่อย ${condN} · มีอยู่แล้ว ${skip} · SKU ที่จะปลดเบิกเอง ${linked.size}`);
const unmatched = skus.filter((s) => s.manualOnly && !linked.has(s.id) && (s.aliases ?? []).some((al) => preset.choices.some((a) => al.startsWith(a.name))));
if (unmatched.length) console.log(`⚠️ SKU ชื่อตะขอที่ยังจับคู่ไม่ได้ ${unmatched.length}: ${unmatched.slice(0, 8).map((s) => s.name).join(", ")}${unmatched.length > 8 ? " …" : ""}`);

if (APPLY) {
  const backupDir = `${process.env.TMPDIR ?? "/tmp"}/link-preset-backup`;
  mkdirSync(backupDir, { recursive: true });
  writeFileSync(`${backupDir}/__preset_${presetId}.json`, JSON.stringify(preset));
  const { error } = await sb.from("products").update({ data: { ...preset, choices: nextChoices } }).eq("id", `__preset_${presetId}`);
  if (error) throw new Error(error.message);
  let n = 0;
  for (const a of nextChoices) {
    const ids = [a.stockItemId, ...(a.stockLinks ?? []).map((l) => l.stockItemId)].filter((x): x is string => !!x && linked.has(x));
    for (const id of ids) {
      const s = skus.find((x) => x.id === id)!;
      const img = s.imageUrl ? undefined : (a.stockLinks?.some((l) => l.stockItemId === id) ? (() => { const l = a.stockLinks!.find((x) => x.stockItemId === id)!; const d = depsOf(a.name).find((x) => x.label === l.when![0].label); const b = d?.choices.find((x) => x.name === l.when![0].choices[0]); return (b ? choiceImage(b, { [preset.label]: a.name }) : undefined) ?? a.imageSrc; })() : a.imageSrc);
      await db.collection("stockItems").doc(id).update({ manualOnly: false, groupByOption: true, ...(img ? { imageUrl: img } : {}), updatedAt: new Date().toISOString() });
      n++;
    }
  }
  console.log(`เสร็จ — เขียนคลัง + ปรับ SKU ${n} ตัว (สำรองคลังเดิมที่ ${backupDir})`);
} else console.log("ยังไม่เขียน — ใส่ --apply");
process.exit(0);
