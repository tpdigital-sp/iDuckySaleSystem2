#!/usr/bin/env node
/**
 * 🖼 SHIKISHI (ชิกิชิ) — ภาพตัวอย่างตัวเลือก "ไม่เคลือบฟอยล์" ในกลุ่ม "เคลือบฟอยล์ (Add On)"
 *   [เจ้าของร้านส่งภาพหน้าสินค้า 14 ก.ย. 69: กลุ่มนี้ไม่ขึ้นภาพตัวอย่างเลย]
 *   สาเหตุ: อีก 2 ตัวเลือก (1/2 เลเยอร์) ใช้รูปจริงชุดกลาง foil-real อยู่แล้ว
 *   แต่ "ไม่เคลือบฟอยล์" ไม่มีภาพ — ค่าเริ่มต้นของกลุ่มเป็นตัวนี้ หน้าสินค้าเลยว่าง
 *   (ชุดกลาง foil-real ตั้งใจไม่มีใบ "ไม่ฟอยล์" — ไม่มีฟอยล์ให้ถ่าย ดู [[iducky-coating-foil]])
 *   → วาดการ์ดอธิบายเหมือนที่ ultra-hard-cardboard-2-mm / card-broad-foam-2-mm / photocard-digital ทำไว้
 *     แต่ใช้ลายชิกิชิ (ขอบทอง + ลายตัวอย่าง) ของ scripts/shikishi-art.mjs ให้เข้าชุดกับการ์ดใบอื่นของสินค้านี้
 *
 *   node scripts/shikishi-foil-none-art.mjs           วาดลง .cache/shikishi/foil-none ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/shikishi-foil-none-art.mjs --write   อัปขึ้น storage + เขียน imageSrc ลงตัวเลือก + อ่านกลับเทียบ
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขึ้น VER ใหม่
 * ⚠️ แตะแค่ตัวเลือก "ไม่เคลือบฟอยล์" ของสินค้านี้ — ไม่แตะชุดกลาง foil-real และไม่แตะราคา/กฎ
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { frame, title, foot, board, W, TH, INK, SUB } from "./shikishi-art.mjs";

const ID = "pricelist-shikishi";
const GROUP = "เคลือบฟอยล์ (Add On)";
const CHOICE = "ไม่เคลือบฟอยล์";
const DESC = "งานพิมพ์สีปกติ ไม่มีลายฟอยล์เงา";
const VER = "v1";
const FILE = `foil-none-${VER}.jpg`;
const WRITE = process.argv.includes("--write");
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/shikishi/foil-none").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

/* ── วาดการ์ด ─────────────────────────────────────────────────────── */

const svg = frame(`
  ${title(CHOICE, DESC)}
  ${board(300, 230, 300, 420, "gold", { id: "foil-none" })}
  <text x="${W / 2}" y="706" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">พิมพ์ระบบ Digital สีตามไฟล์งาน</text>
  <text x="${W / 2}" y="748" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ไม่มีค่าบวกเพิ่มจากราคาในตาราง</text>
  ${foot([
    "อยากได้ลายเงาแบบโลหะ เลือกเคลือบฟอยล์ 1 หรือ 2 เลเยอร์",
    "ขอบการ์ดยังเป็นขอบฟอยล์ 4 สีตามที่เลือกไว้ — คนละส่วนกับงานปั๊มฟอยล์บนลาย",
  ])}`);

const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
writeFileSync(`${OUT}/${FILE}`, buf);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB`);

if (!WRITE) {
  console.log("(ดูภาพก่อน — ใส่ --write เพื่ออัปขึ้น storage + เขียนลงตัวเลือก)");
  process.exit(0);
}

/* ── อัป + เขียนลงตัวเลือก ────────────────────────────────────────── */

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const key = `products/${ID}/${FILE}`;
const { error: eUp } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (eUp) throw eUp;
const src = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log(`⬆️  ${src}`);

const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) throw error;
const opts = row.data.options || [];
const g = opts.find((o) => o.label === GROUP);
if (!g) throw new Error(`ไม่พบกลุ่ม "${GROUP}" — ชื่อกลุ่มเปลี่ยนไปแล้ว`);
if (!(g.choices || []).some((c) => c.name === CHOICE)) throw new Error(`ไม่พบตัวเลือก "${CHOICE}"`);

const nextOpts = opts.map((o) =>
  o !== g ? o : { ...o, choices: o.choices.map((c) => (c.name === CHOICE ? { ...c, desc: c.desc || DESC, imageSrc: src } : c)) },
);
const d = { ...row.data, options: nextOpts, savedAt: new Date().toISOString() };
const { error: e1 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e1) throw e1;

const { data: back, error: e2 } = await sb.from("products").select("data").eq("id", ID).single();
if (e2) throw e2;
const c = (back.data.options || []).find((o) => o.label === GROUP)?.choices?.find((x) => x.name === CHOICE);
if (c?.imageSrc !== src) throw new Error(`อ่านกลับไม่ตรง: imageSrc = ${c?.imageSrc}`);
const head = await fetch(src, { method: "HEAD" });
if (!head.ok) throw new Error(`ภาพเปิดไม่ได้ — HTTP ${head.status}`);
console.log(`✓ "${GROUP}: ${CHOICE}" มีภาพแล้ว · เปิดได้ HTTP ${head.status} · savedAt = ${back.data.savedAt}`);
