#!/usr/bin/env node
/**
 * 🥚 สแตนดี้อะคริลิค (standy) เพิ่ม "ทรงวงรี" ในกลุ่มทรงฐาน (เจ้าของร้านสั่ง 14 ต.ค. 69)
 * "ราคาปลีกไม่มีบวกเพิ่มเหมือนทรงกลมกับสี่เหลี่ยม" → ไม่มี extra + อยู่ใน smallQtyFee.freeChoices
 * ภาพตัวเลือกวาดแบบเดียวกับ baseshape-round/square ของ standee-keyring-art.mjs (มุมเฉียง วงรียาวกว่าวงกลม)
 *
 *   node scripts/standy-base-oval.mjs            # ดูก่อน (เรนเดอร์ภาพไว้ที่ .cache/standy/)
 *   node scripts/standy-base-oval.mjs --write    # อัปภาพ + บันทึกสินค้า
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "standy";
const NAME = "ทรงวงรี";
const IMG_PATH = `products/${ID}/baseshape-oval-v1.jpg`;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/* ── ภาพตัวเลือก (สไตล์เดียวกับ baseshape-round-v6) ─────────────────────── */
const W = 700, H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="72" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="#0f172a">ฐานทรงวงรี</text>
  <text x="${W / 2}" y="112" font-family="${TH}" font-size="24" text-anchor="middle" fill="#64748b">ทรงมาตรฐาน</text>
  <ellipse cx="${W / 2}" cy="350" rx="210" ry="40" fill="rgba(56,189,248,0.20)" stroke="#38bdf8" stroke-width="3"/>
  <rect x="${W / 2 - 78}" y="342" width="156" height="16" rx="8" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/>
  <text x="${W / 2}" y="430" font-family="${TH}" font-size="21" text-anchor="middle" fill="#64748b">มองจากด้านบน</text>
  <text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="21" text-anchor="middle" fill="#64748b">ไม่บวกเพิ่ม</text>
</svg>`;
mkdirSync(".cache/standy", { recursive: true });
const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
writeFileSync(".cache/standy/baseshape-oval.jpg", buf);
const imageSrc = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${IMG_PATH}`;

/* ── แก้สินค้า ────────────────────────────────────────────────────────── */
const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) throw error;
const data = row.data;
const grp = (data.options ?? []).find((g) => String(g.label).trim() === "ทรงฐาน");
if (!grp) throw new Error("หากลุ่ม ทรงฐาน ไม่เจอ");
if (grp.choices.some((c) => c.name === NAME)) {
  console.log(`✓ ${ID} มี "${NAME}" อยู่แล้ว — ไม่ทำซ้ำ`);
  process.exit(0);
}
const at = grp.choices.findIndex((c) => c.name === "ทรงสี่เหลี่ยม");
if (at < 0) throw new Error("หา ทรงสี่เหลี่ยม ไม่เจอ (ไว้วางต่อท้าย)");
grp.choices.splice(at + 1, 0, { name: NAME, imageSrc });
if (grp.smallQtyFee) {
  const free = new Set(grp.smallQtyFee.freeChoices ?? []);
  free.add(NAME);
  grp.smallQtyFee.freeChoices = [...free];
}
console.log(`📦 ${row.id} | ${row.name}`);
console.log("   ทรงฐาน:", grp.choices.map((c) => `${c.name}${c.extra ? ` (+${c.extra})` : ""}`).join(" · "));
console.log("   ปลีกฟรี:", grp.smallQtyFee?.freeChoices?.join(", "));
if (!WRITE) { console.log("\n(ดูก่อน — ใส่ --write เพื่อบันทึก)"); process.exit(0); }

mkdirSync("backups", { recursive: true });
const { data: before } = await sb.from("products").select("id,data").eq("id", ID).single();
writeFileSync(`backups/standy-base-oval-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, JSON.stringify(before));
const up = await sb.storage.from("product-images").upload(IMG_PATH, buf, { contentType: "image/jpeg", upsert: true });
if (up.error) throw up.error;
const w = await sb.from("products").update({ data }).eq("id", ID);
if (w.error) throw w.error;
console.log("✅ บันทึกแล้ว");
