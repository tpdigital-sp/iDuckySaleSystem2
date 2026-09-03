#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกกลุ่ม OPTION ของ "WALL TIDY (กระเป๋าแขวนผนัง)" — wall-tidy
 *
 *   node scripts/wall-tidy-option-art.mjs            (วาดภาพลง .cache/wall-tidy/upload ดูก่อน)
 *   node scripts/wall-tidy-option-art.mjs --write    (+ อัปโหลด storage + เขียน DB + อ่านกลับเทียบ)
 *
 * กลุ่ม OPTION (display multi) มี 2 ตัวเลือก ทั้งคู่ยังไม่มีภาพ:
 *   เพิ่มกระเป๋า          +฿20  qtyMax 1  → เย็บ "ช่องใส่ของ" เพิ่มจากมาตรฐาน 7 ช่อง
 *   เพิ่มสาย+ตะขอเกี่ยว   +฿15  qtyMax 2  → สายผ้าพิมพ์ลาย ปลายตะขอก้ามปู เย็บหน้าแผง
 *
 * ทำไมต้องวาดเอง: รูปถ่ายในแกลเลอรีเป็นภาพใบสำเร็จแขวนอยู่บนผนัง ไม่มีรูปไหนชี้ว่า
 * "ช่องที่เย็บเพิ่ม" ไปอยู่ตรงไหน และมองไม่ออกว่าสายเกี่ยวปลายเป็นตะขอแบบใด (ต้องซูมถึงเห็น)
 *
 * ที่มาของตัวเลข: products.wall-tidy ใน DB (3 ก.ย. 69)
 *   terms: ผ้าแคนวาส 14oz · 55×33 ซม. · 7 ช่องใส่ของ | สายเกี่ยว 2 เส้น (รวมในราคาต่อชิ้นแล้ว)
 *
 * โครงแผงใช้ร่วมกับการ์ดกลุ่ม "ขนาด" — ดู scripts/wall-tidy-panel.mjs
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import {
  W, H, TH, INK, SUB, OK, PINK,
  frame, title, foot, pill, callout, panel, hangStrap, claspSvg,
} from "./wall-tidy-panel.mjs";

const PRODUCT_ID = "wall-tidy";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

// ── การ์ดที่ 1: เพิ่มกระเป๋า (= เย็บช่องใส่ของเพิ่ม) ──────────────────
/**
 * ใส่เลข 1-7 บนช่องมาตรฐาน แล้ววางช่องที่ 8 เป็นเส้นประบนพื้นที่ว่างหัวแผง
 * ลูกค้าจะเห็นทันทีว่า "7 ช่องที่รวมในราคา" คือช่องไหน และช่องที่จ่ายเพิ่มไปอยู่ตรงไหน
 */
function pocketArt() {
  const g = panel(408, 178, 296, 470, { extraPocket: true });
  const nums = g.pockets
    .map((p, i) => `
      <circle cx="${p.x + p.w / 2}" cy="${p.y + p.h / 2}" r="15" fill="#ffffff" opacity="0.9"/>
      <text x="${p.x + p.w / 2}" y="${p.y + p.h / 2 + 7}" font-family="${TH}" font-size="20" font-weight="700" text-anchor="middle" fill="${INK}">${i + 1}</text>`)
    .join("");
  const ep = g.extraPocket;
  const body = `
    ${title("เพิ่มกระเป๋า (ช่องใส่ของ)", "เย็บช่องเพิ่มจากมาตรฐาน — แจ้งตำแหน่งที่อยากได้กับแอดมิน")}
    ${g.svg}
    ${nums}
    ${callout(ep.x + ep.w, ep.y + ep.h / 2, 700, ep.y - 30, "ช่องที่เย็บเพิ่ม", "ok")}
    ${(() => {
      const ly = g.rowsTop + g.rowH * 1.25; // เสมอแถวกลาง — ป้ายอยู่นอกผืนผ้าฝั่งซ้าย ไม่ทับช่อง
      return `
      <rect x="52" y="${ly}" width="178" height="40" rx="20" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
      <text x="141" y="${ly + 27}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${SUB}">7 ช่องมีให้อยู่แล้ว</text>
      <line x1="230" y1="${ly + 20}" x2="${g.x0 - 4}" y2="${ly + 20}" stroke="#cbd5e1" stroke-width="2.5"/>`;
    })()}
    ${pill(W / 2, g.bottom + 34, "ช่องละ ฿20 · เพิ่มได้ 1 ช่อง")}
    ${foot(["ช่องใส่ของ 7 ช่อง (เรียง 2-3-2) รวมในราคาต่อชิ้นอยู่แล้ว", "อยากได้ช่องใหญ่/เล็กหรือตำแหน่งไหนเป็นพิเศษ พิมพ์บอกในหมายเหตุถึงร้านได้เลย"])}`;
  return frame(body);
}

// ── การ์ดที่ 2: เพิ่มสาย+ตะขอเกี่ยว ──────────────────────────────────
/**
 * แผงวาดสายจริง 2 เส้น (ที่รวมในราคา) + สายเส้นประอีก 2 เส้น (ส่วนที่จ่ายเพิ่ม)
 * แล้วซูมวงกลมให้เห็นว่าปลายสายเป็นตะขอก้ามปูเปิด-ปิดได้ ไม่ใช่ห่วงเย็บตาย
 */
function strapArt() {
  // ปิดมาสคอตบนหัวแผง — โซนนั้นต้องว่างให้เส้นโยงป้ายกับเส้นซูมพาดผ่านโดยไม่ทับลาย
  const g = panel(286, 178, 288, 456, { straps: 2, art: false });
  const zx = 690;
  const zy = 434;
  // ไม่ลากเส้นโยงจากแผงมาวงซูม — เส้นไหนก็ต้องพาดทับปากช่องแถวแรก อ่านแล้วรก
  const zoom = `
    <circle cx="${zx}" cy="${zy}" r="160" fill="#f8fafc" stroke="#e2e8f0" stroke-width="3"/>
    ${hangStrap(zx, zy - 150, 132, 48, 0.9)}
    <text x="${zx}" y="${zy + 198}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${INK}">สายผ้าพิมพ์ลาย + ตะขอก้ามปู</text>`;
  const body = `
    ${title("เพิ่มสาย + ตะขอเกี่ยว", "สายผ้าพิมพ์ลายเข้าชุดชิ้นงาน ปลายเป็นตะขอก้ามปูไว้เกี่ยวของ")}
    ${g.svg}
    ${zoom}
    ${callout(g.strap.x2 + g.strap.w / 2, g.strap.y + 14, 462, 188, "จุดที่เย็บสายเกี่ยว", "ok")}
    ${pill(W / 2, g.bottom + 32, "เส้นละ ฿15 · เพิ่มได้สูงสุด 2 เส้น")}
    ${foot(["สายเกี่ยว 2 เส้น รวมในราคาต่อชิ้นอยู่แล้ว — เส้นที่ 3-4 คือส่วนที่คิดเพิ่ม", "ไว้ห้อยพวงกุญแจ ชาร์ม สายคล้อง หรือของชิ้นเล็กที่หยิบใช้บ่อย"])}`;
  return frame(body);
}

// ── เรนเดอร์ ─────────────────────────────────────────────────────────
const ART = {
  "opt-pocket": { svg: pocketArt(), group: "OPTION", choice: "เพิ่มกระเป๋า", note: "เพิ่มช่องใส่ของ ฿20" },
  "opt-strap": { svg: strapArt(), group: "OPTION", choice: "เพิ่มสาย+ตะขอเกี่ยว", note: "เพิ่มสาย+ตะขอ ฿15" },
};

const files = [];
for (const [name, art] of Object.entries(ART)) {
  const buf = await sharp(Buffer.from(art.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const file = `${name}-${VER}.jpg`;
  writeFileSync(`${OUT}/${file}`, buf);
  files.push({ ...art, name, file, path: `${OUT}/${file}` });
  console.log(`🖼  ${OUT}/${file}  ${Math.round(buf.length / 1024)} KB — ${art.note}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน DB + อ่านกลับเทียบ ───────────────────────
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const f of files) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, readFileSync(f.path), { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  f.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", f.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
for (const f of files) {
  const grp = (data.options ?? []).find((o) => o.label === f.group);
  if (!grp) { console.error(`ไม่เจอกลุ่ม "${f.group}"`); process.exit(1); }
  const c = grp.choices?.find((c) => c.name === f.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${f.choice}" ในกลุ่ม "${f.group}"`); process.exit(1); }
  c.imageSrc = f.url;
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const f of files) {
  const got = back.data.options.find((o) => o.label === f.group)?.choices?.find((c) => c.name === f.choice)?.imageSrc;
  if (got !== f.url) { console.error("อ่านกลับไม่ตรง", f.choice, got); process.exit(1); }
}
console.log(`✓ ตั้งภาพครบ ${files.length} ตัวเลือก อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
