#!/usr/bin/env node
/**
 * DIGITAL PRINT — แยกคอลัมน์ Sticker เป็น "Sticker Digital" กับ "Sticker UV | Solvent"
 * และย้าย DTF ไป Other products (ผู้ใช้สั่ง 31 ส.ค. 69)
 *
 *   node scripts/site-nav-split-sticker.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/site-nav-split-sticker.mjs --write   # บันทึกจริง (สำรองของเดิมก่อน)
 *
 * แบ่งตามระบบพิมพ์ที่เขียนไว้ในตัวสินค้าเอง:
 *   Digital        → สติ๊กเกอร์ Digital (PP), สติ๊กเกอร์วาชิ
 *   UV | Solvent   → UV, RainBow, NEON, สะท้อนแสง, Gold|Silver|RoseGold, Hologram, สูญญากาศ, Solvent Premium
 *   Other products → DTF ขายเป็นเมตร (ไม่ใช่สติ๊กเกอร์ — รีดติดผ้า)
 * รันซ้ำได้ (รันทับแล้วผลเท่าเดิม)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const NAV_ID = "__site_nav__";
const GROUP = "DIGITAL PRINT";
const SRC_TITLES = ["Sticker", "Sticker Digital", "Sticker UV | Solvent"]; // รวมคอลัมน์เดิม/ที่แยกแล้วเข้าด้วยกันก่อนแบ่งใหม่
const T_DIGITAL = "Sticker Digital";
const T_UV = "Sticker UV | Solvent";

/** id/slug ที่พิมพ์ระบบดิจิตอล · ที่เหลือในคอลัมน์ถือเป็น UV|Solvent */
const DIGITAL = [/sticker-pp/i, /washi/i, /สติ๊กเกอร์-?\s*digital/i, /วาชิ/i];
/** ไม่ใช่สติ๊กเกอร์ — ย้ายออกไป Other products */
const TO_OTHER = [/\bdtf\b/i];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: row, error } = await sb.from("products").select("id,data").eq("id", NAV_ID).single();
if (error) throw error;
const nav = structuredClone(row.data?.nav ?? {});
const g = (nav.mega ?? []).find((x) => x.label === GROUP);
if (!g) throw new Error(`ไม่พบกลุ่ม ${GROUP}`);

const hay = (it) => `${it.label} ${decodeURIComponent(String(it.href ?? ""))}`;
const pool = [];
g.columns = (g.columns ?? []).filter((c) => {
  if (!SRC_TITLES.includes(c.title)) return true;
  pool.push(...(c.items ?? []));
  return false;
});

const other = pool.filter((it) => TO_OTHER.some((re) => re.test(hay(it))));
const rest = pool.filter((it) => !other.includes(it));
const digital = rest.filter((it) => DIGITAL.some((re) => re.test(hay(it))));
const uv = rest.filter((it) => !digital.includes(it));

/** วางคอลัมน์ใหม่ตรงตำแหน่งเดิมของ Sticker (หลัง Photocard ถ้ามี) */
const at = Math.max(0, g.columns.findIndex((c) => c.title === "Photocard") + 1) || g.columns.length;
g.columns.splice(at, 0, { id: "dp-sticker-digital", title: T_DIGITAL, items: digital },
                         { id: "dp-sticker-uv", title: T_UV, items: uv });

let oc = g.columns.find((c) => /other/i.test(c.title));
if (!oc) g.columns.push((oc = { id: "dp-other", title: "Other products", items: [] }));
for (const it of other) if (!oc.items.some((x) => x.href === it.href)) oc.items.push(it);

console.log(`${T_DIGITAL} (${digital.length}): ` + digital.map((i) => i.label).join(", "));
console.log(`${T_UV} (${uv.length}): ` + uv.map((i) => i.label).join(", "));
console.log(`ย้ายไป Other products: ` + (other.map((i) => i.label).join(", ") || "—"));
console.log("\nผัง DIGITAL PRINT: " + g.columns.map((c) => `${c.title} (${c.items.length})`).join(" · "));

if (!WRITE) {
  console.log("\nยังไม่ได้บันทึก — ใส่ --write เพื่อบันทึกจริง");
  process.exit(0);
}
mkdirSync(new URL("../backups/", import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`../backups/site-nav-before-${stamp}.json`, import.meta.url), JSON.stringify(row.data, null, 1));
const { error: e2 } = await sb.from("products").update({ data: { ...row.data, nav } }).eq("id", NAV_ID);
if (e2) throw e2;
console.log(`\nสำรองไว้ที่ backups/site-nav-before-${stamp}.json — บันทึกเรียบร้อย`);
