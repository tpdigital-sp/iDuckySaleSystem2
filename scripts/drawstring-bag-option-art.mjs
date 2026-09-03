#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "DRAWSTRING BAG / ถุงผ้าหูรูด" (premiumbag-9)
 *
 *   node scripts/drawstring-bag-option-art.mjs            (วาดภาพลง .cache/drawstring-bag/upload)
 *   node scripts/drawstring-bag-option-art.mjs --write    (+ อัปโหลด storage + ตั้ง choice.imageSrc + อ่านกลับเทียบ)
 *
 * ทำไมต้องวาดเอง: รูปงานจริงในแกลเลอรีเป็นภาพถุงสำเร็จ ดูไม่ออกว่าซับลิเมชั่น/DTF ต่างกันตรงไหน
 * และไม่มีรูปเทียบ "พิมพ์ 1 ด้าน / 2 ด้าน" — สไตล์การ์ดยึดตาม blanket-hoodie-art.mjs
 *
 * ได้ 4 ไฟล์ (900x900 — แกลเลอรี/ปุ่มตัวเลือกครอปจัตุรัส):
 *   print-sub.jpg   งานซับลิเมชั่น — หมึกซึมลงเนื้อผ้า ลายเต็มใบชนขอบ
 *   print-dtf.jpg   งาน DTF/DFT — ฟิล์มทรานเฟอร์รีดติดผิวผ้า ลายคมขอบชัด
 *   side-1.jpg      พิมพ์ 1 ด้าน — หน้ามีลาย หลังผ้าพื้น
 *   side-2.jpg      พิมพ์ 2 ด้าน (+฿10/ใบ) — มีลายทั้งสองด้าน
 *
 * ที่มาของตัวเลข: products.premiumbag-9 ใน DB (3 ก.ย. 69)
 *   ซับลิเมชั่น 120→75 · DTF 130→80 ต่อใบ ตามช่วงจำนวน · 2 ด้าน extra 10
 *   terms: ซับลิเมชั่นพิมพ์ได้เฉพาะผ้าสีอ่อน/ผ้าเฉพาะ
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 520);

const PRODUCT_ID = "premiumbag-9";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/drawstring-bag/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
/** สีผ้า: ถุงผ้าดิบสีอ่อน — โทนครีมนวล ๆ ให้ต่างจากพื้นการ์ดขาว */
const CLOTH = "#faf3e3";
const CLOTH_EDGE = "#d9c9a3";
const PLAIN = "#f8fafc";
const PLAIN_EDGE = "#cbd5e1";
const CORD = "#b9a06f";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines
    .filter(Boolean)
    .map(
      (t, i, a) =>
        `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

/** ป้ายชี้ชิ้นส่วน — เส้นบาง ๆ + ข้อความ */
const callout = (x1, y1, x2, y2, text, anchor = "start") => `
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="2"/>
  <circle cx="${x1}" cy="${y1}" r="5" fill="#94a3b8"/>
  <text x="${x2 + (anchor === "end" ? -8 : 8)}" y="${y2 + 6}" font-family="${TH}" font-size="20" text-anchor="${anchor}" fill="${SUB}">${text}</text>`;

/**
 * ทรงถุงผ้าหูรูด (มองด้านหน้า): ตัวถุงโค้งมน + แถบร้อยเชือกด้านบน (รูดจีบ) + เชือกออกสองข้าง
 * คืน geometry ให้วางลาย/ป้ายต่อได้
 */
const bagGeom = (cx, top, w, h) => {
  const channelH = h * 0.13; // แถบร้อยเชือกบนสุด
  return { cx, top, w, h, channelH, x: cx - w / 2, bodyTop: top + channelH, bottom: top + h };
};

const bagShape = (g, { fill, edge, dashed = false, clipId = "" } = {}) => {
  const d = dashed ? ` stroke-dasharray="12 9"` : "";
  const r = Math.min(30, g.w * 0.09);
  // จีบรูด: เส้นสั้น ๆ แนวตั้งบนแถบร้อยเชือก
  const pleats = Array.from({ length: 7 }, (_, i) => {
    const px = g.x + g.w * (0.14 + (i * 0.72) / 6);
    return `<line x1="${px}" y1="${g.top + 6}" x2="${px}" y2="${g.top + g.channelH - 6}" stroke="${edge}" stroke-width="2.5" opacity="0.65"/>`;
  }).join("");
  const bodyRect = `x="${g.x}" y="${g.bodyTop}" width="${g.w}" height="${g.h - g.channelH}"`;
  return `
    ${clipId ? `<clipPath id="${clipId}"><rect ${bodyRect} rx="${r}"/></clipPath>` : ""}
    <rect ${bodyRect} rx="${r}" fill="${fill}" stroke="${edge}" stroke-width="4"${d}/>
    <rect x="${g.x + g.w * 0.05}" y="${g.top}" width="${g.w * 0.9}" height="${g.channelH}" rx="${g.channelH / 2}"
      fill="${fill}" stroke="${edge}" stroke-width="4"${d}/>
    ${pleats}
    <!-- เชือกรูดออกสองข้าง ปลายผูกปม -->
    <path d="M${g.x + g.w * 0.06} ${g.top + g.channelH / 2} C ${g.x - g.w * 0.1} ${g.top + g.channelH} ${g.x - g.w * 0.12} ${g.top + g.h * 0.3} ${g.x - g.w * 0.06} ${g.top + g.h * 0.42}"
      fill="none" stroke="${CORD}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="${g.x - g.w * 0.06}" cy="${g.top + g.h * 0.42}" r="9" fill="${CORD}"/>
    <path d="M${g.x + g.w * 0.94} ${g.top + g.channelH / 2} C ${g.x + g.w * 1.1} ${g.top + g.channelH} ${g.x + g.w * 1.12} ${g.top + g.h * 0.3} ${g.x + g.w * 1.06} ${g.top + g.h * 0.42}"
      fill="none" stroke="${CORD}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="${g.x + g.w * 1.06}" cy="${g.top + g.h * 0.42}" r="9" fill="${CORD}"/>`;
};

/** ลายที่สกรีน — มาสคอตเป็ดของฝ่าย Content (แทนลายลูกค้า) */
const artwork = (cx, cy, box, opacity = 1) => {
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
    preserveAspectRatio="xMidYMid meet" opacity="${opacity}"/>`;
};

/** ลายพื้นเต็มใบของงานซับลิเมชั่น — หัวใจ/จุดโทนฟ้าจาง กระจายชนขอบ (อยู่ใต้ clip ของตัวถุง) */
const fullPattern = (g) => {
  const dots = [];
  const cols = 5, rows = 6;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const px = g.x + g.w * ((c + (r % 2 ? 0.5 : 0)) / (cols - 0.5));
      const py = g.bodyTop + (g.h - g.channelH) * ((r + 0.4) / rows);
      dots.push(
        r % 2 === c % 2
          ? `<circle cx="${px}" cy="${py}" r="11" fill="#7dd3fc" opacity="0.55"/>`
          : `<path d="M${px} ${py + 8} c -10 -9 -16 -16 -8 -23 c 5 -4 8 -1 8 2 c 0 -3 3 -6 8 -2 c 8 7 2 14 -8 23 z" fill="#f9a8d4" opacity="0.6"/>`
      );
    }
  return dots.join("");
};

// ── ภาพ "ระบบพิมพ์ลาย" ──────────────────────────────────────────────
function printArt(kind) {
  const sub = kind === "sub";
  const g = bagGeom(W / 2, 200, 430, 520);
  const clip = "bagclip";
  const inner = sub
    ? // ซับลิเมชั่น: หมึกซึมเป็นเนื้อเดียวกับผ้า — ลายจางเต็มใบชนขอบ + มาสคอตกลาง
      `<g clip-path="url(#${clip})">
         <rect x="${g.x}" y="${g.bodyTop}" width="${g.w}" height="${g.h}" fill="#eaf6fd"/>
         ${fullPattern(g)}
         ${artwork(g.cx, g.bodyTop + (g.h - g.channelH) * 0.52, g.w * 0.52, 0.92)}
       </g>`
    : // DTF: แผ่นฟิล์มมุมมนรอบลาย วางบนผิวผ้า — ขอบขาวคม + เงาบาง ๆ ให้ดู "นูนบนผ้า"
      (() => {
        const cy = g.bodyTop + (g.h - g.channelH) * 0.52;
        const fw = g.w * 0.56, fh = g.w * 0.62;
        return `<g clip-path="url(#${clip})">
         <rect x="${g.cx - fw / 2 + 7}" y="${cy - fh / 2 + 9}" width="${fw}" height="${fh}" rx="26" fill="#000" opacity="0.08"/>
         <rect x="${g.cx - fw / 2}" y="${cy - fh / 2}" width="${fw}" height="${fh}" rx="26" fill="#ffffff" stroke="#e2e8f0" stroke-width="3"/>
         ${artwork(g.cx, cy, g.w * 0.5)}
       </g>`;
      })();
  const body = `
    ${title(sub ? "งานซับลิเมชั่น" : "งาน DTF/DFT", sub ? "หมึกซึมลงเนื้อผ้าด้วยความร้อน — พิมพ์เต็มใบชนขอบได้" : "พิมพ์ลงฟิล์มแล้วรีดติดผิวผ้า — สีสด ขอบลายคมชัด")}
    ${bagShape(g, { fill: CLOTH, edge: CLOTH_EDGE, clipId: clip })}
    ${inner}
    ${
      sub
        ? callout(g.x + g.w * 0.82, g.bodyTop + 40, W - 56, 190, "ลายซึมเป็นเนื้อเดียวกับผ้า", "end")
        : callout(g.cx + g.w * 0.28, g.bodyTop + (g.h - g.channelH) * 0.28, W - 56, 190, "ฟิล์มไดคัทตามลาย", "end")
    }
    ${foot(
      sub
        ? ["เริ่มต้น ฿120/ใบ (1-10 ใบ) — ยิ่งสั่งมากยิ่งถูกลง", "สัมผัสเรียบ ลายไม่หนาตัว · พิมพ์ได้เฉพาะผ้าสีอ่อน/ผ้าเฉพาะ"]
        : ["เริ่มต้น ฿130/ใบ (1-10 ใบ) — ยิ่งสั่งมากยิ่งถูกลง", "สีสดคมชัด ลายติดบนผิวผ้า"]
    )}`;
  return frame(body);
}

// ── ภาพ "พิมพ์กี่ด้าน" — วางด้านหน้า/ด้านหลังคู่กัน ──────────────────
function sideArt(sides) {
  const two = sides === 2;
  const w = 300, h = 400, top = 300, gap = 92;
  const left = bagGeom(W / 2 - w / 2 - gap / 2, top, w, h);
  const right = bagGeom(W / 2 + w / 2 + gap / 2, top, w, h);

  const panel = (g, label, printed, clipId) => `
    ${bagShape(g, { fill: printed ? CLOTH : PLAIN, edge: printed ? CLOTH_EDGE : PLAIN_EDGE, clipId })}
    ${printed ? artwork(g.cx, g.bodyTop + (g.h - g.channelH) * 0.5, g.w * 0.5) : ""}
    ${
      !printed
        ? `<text x="${g.cx}" y="${g.bodyTop + (g.h - g.channelH) * 0.52}" font-family="${TH}" font-size="23" text-anchor="middle" fill="#94a3b8">ผ้าพื้น ไม่พิมพ์ลาย</text>`
        : ""
    }
    <text x="${g.cx}" y="${g.bottom + 44}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>`;

  const body = `
    ${title(two ? "พิมพ์ 2 ด้าน" : "พิมพ์ 1 ด้าน", two ? "มีลายทั้งด้านหน้าและด้านหลัง" : "มีลายด้านหน้า · ด้านหลังเป็นผ้าพื้น")}
    ${panel(left, "ด้านหน้า", true, "sideL")}
    ${panel(right, "ด้านหลัง", two, "sideR")}
    ${foot(two ? ["คิดเพิ่ม +฿10 ต่อใบ", "เลือกได้ทั้งงานซับลิเมชั่นและงาน DTF/DFT"] : ["ราคาปกติตามตารางราคา", "ด้านหลังเป็นเนื้อผ้าพื้นตามผ้าตั้งต้น"])}`;
  return frame(body);
}

const ART = {
  "print-sub": { svg: printArt("sub"), choice: "งานซับลิเมชั่น", group: "ระบบพิมพ์ลาย", note: "ซับลิเมชั่น — ลายซึมเต็มใบ" },
  "print-dtf": { svg: printArt("dtf"), choice: "งาน DTF/DFT", group: "ระบบพิมพ์ลาย", note: "DTF/DFT — ฟิล์มติดผิวผ้า" },
  "side-1": { svg: sideArt(1), choice: "1 ด้าน", group: "พิมพ์กี่ด้าน", note: "1 ด้าน — หลังผ้าพื้น" },
  "side-2": { svg: sideArt(2), choice: "2 ด้าน", group: "พิมพ์กี่ด้าน", note: "2 ด้าน — หน้า+หลัง (+฿10)" },
};

const files = [];
for (const [name, art] of Object.entries(ART)) {
  const buf = await sharp(Buffer.from(art.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const file = `${name}-${VER}.jpg`;
  writeFileSync(`${OUT}/${file}`, buf);
  files.push({ ...art, name, file, path: `${OUT}/${file}` });
  console.log(`🖼  ${file}  ${Math.round(buf.length / 1024)} KB — ${art.note}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + ตั้ง choice.imageSrc (แบบ pet-shirt-size-art.mjs) ──
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
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
  const c = grp?.choices?.find((c) => c.name === f.choice);
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
  if (got !== f.url) { console.error("อ่านกลับไม่ตรง!", f.choice, got); process.exit(1); }
}
console.log("✓ ตั้ง imageSrc ครบ 4 ตัวเลือก อ่านกลับตรงทุกตัว · savedAt =", back.data.savedAt);
