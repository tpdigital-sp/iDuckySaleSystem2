// ภาพตัวอย่างจำลอง (mockup) ปลอกคอสัตว์เลี้ยง 3 เรท → วาด SVG → JPG →
// อัปโหลด storage `product-images/products/collar-animal/` → ผูก priceRates[i].imageSrc
// รันซ้ำได้ (อัปทับชื่อไฟล์เดิม + เขียน DB เฉพาะเมื่อค่ายังไม่ตรง)
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

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
const die = (msg) => { console.error("✗", msg); process.exit(1); };

const FONT = `'Thonburi','Sukhumvit Set','Noto Sans Thai',sans-serif`;
const TEAL = "#177e8c", TEAL_D = "#0f5d68", INK = "#1d3b41";

// นับความกว้างข้อความไทยโดยตัดสระบน-ล่าง/วรรณยุกต์ออก
const baseLen = (s) => s.replace(/[ัำ-ฺ็-๎]/g, "").length;

const defs = `
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f4fbfd"/><stop offset="1" stop-color="#d9f0f6"/>
  </linearGradient>
  <linearGradient id="fabric" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8fd3dd"/><stop offset="1" stop-color="#5fb7c6"/>
  </linearGradient>
  <linearGradient id="fabricBack" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f8e9c9"/><stop offset="1" stop-color="#eed9ac"/>
  </linearGradient>
  <linearGradient id="strap" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#9aa4ad"/><stop offset="1" stop-color="#6f7b85"/>
  </linearGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0f5d68" flood-opacity="0.18"/>
  </filter>
</defs>`;

const paw = (x, y, s, o = 0.12) => `
<g transform="translate(${x},${y}) scale(${s})" fill="${TEAL}" opacity="${o}">
  <ellipse cx="0" cy="10" rx="16" ry="13"/>
  <circle cx="-16" cy="-8" r="6.5"/><circle cx="-5.5" cy="-14" r="6.5"/>
  <circle cx="5.5" cy="-14" r="6.5"/><circle cx="16" cy="-8" r="6.5"/>
</g>`;

const header = (no, title, sub) => `
<g font-family="${FONT}">
  <rect x="60" y="52" width="76" height="76" rx="22" fill="${TEAL}"/>
  <text x="98" y="104" font-size="42" font-weight="700" fill="#fff" text-anchor="middle">${no}</text>
  <text x="158" y="92" font-size="46" font-weight="700" fill="${INK}">${title}</text>
  <text x="158" y="136" font-size="27" fill="${TEAL_D}">${sub}</text>
  <g>
    <rect x="898" y="58" width="242" height="52" rx="26" fill="#fff" stroke="${TEAL}" stroke-width="2" opacity="0.9"/>
    <text x="1019" y="93" font-size="24" fill="${TEAL_D}" text-anchor="middle">ภาพจำลองตัวอย่าง</text>
  </g>
</g>`;

const chips = (items) => {
  let x = 60;
  const parts = items.map((t) => {
    const w = 44 + baseLen(t) * 19;
    const g = `
  <rect x="${x}" y="796" width="${w}" height="58" rx="29" fill="#fff" stroke="#bfe3ea" stroke-width="2"/>
  <text x="${x + w / 2}" y="835" font-size="25" fill="${TEAL_D}" text-anchor="middle" font-family="${FONT}">${t}</text>`;
    x += w + 18;
    return g;
  });
  return `<g>${parts.join("")}</g>`;
};

// ป้ายคำอธิบาย + เส้นชี้ (tx,ty = ตำแหน่งป้าย / px,py = จุดชี้)
const callout = (tx, ty, px, py, label, anchor = "middle") => {
  const w = 48 + baseLen(label) * 19;
  const rx = anchor === "start" ? tx : anchor === "end" ? tx - w : tx - w / 2;
  const lineFromX = rx + w / 2;
  return `
<g font-family="${FONT}">
  <line x1="${px}" y1="${py}" x2="${lineFromX}" y2="${ty + (ty < py ? 28 : -28)}" stroke="${TEAL_D}" stroke-width="2.5" stroke-dasharray="1 7" stroke-linecap="round"/>
  <circle cx="${px}" cy="${py}" r="6" fill="${TEAL_D}"/>
  <rect x="${rx}" y="${ty - 27}" width="${w}" height="54" rx="27" fill="${TEAL_D}"/>
  <text x="${rx + w / 2}" y="${ty + 9}" font-size="24" fill="#fff" text-anchor="middle">${label}</text>
</g>`;
};

// ลายพิมพ์บนผ้า (โชว์ว่าสกรีนลายได้)
const printPattern = (cx) => `
<g font-family="${FONT}">
  ${[-260, -140, 130, 250].map((d) => paw(cx + d, 455, 0.85, 0.5)).join("")}
  <g fill="#fff" opacity="0.95">
    <circle cx="${cx - 200}" cy="418" r="7"/><circle cx="${cx - 75}" cy="492" r="7"/>
    <circle cx="${cx + 70}" cy="415" r="7"/><circle cx="${cx + 195}" cy="493" r="7"/>
  </g>
  <text x="${cx}" y="472" font-size="44" font-weight="700" fill="#fff" text-anchor="middle" letter-spacing="6">MOCHI</text>
</g>`;

const page = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" width="1200" height="900">
${defs}
<rect width="1200" height="900" fill="url(#bg)"/>
${paw(140, 700, 2.2)}${paw(1060, 230, 1.7)}${paw(990, 720, 1.3)}${paw(240, 240, 1.2)}
${body}
</svg>`;

// ---------- แบบที่ 1: แบบผูก ----------
const band1 = `
<g filter="url(#soft)">
  <path d="M 205 452 C 120 430 90 380 66 330 C 120 372 170 396 225 412 Z" fill="url(#fabric)"/>
  <path d="M 205 470 C 118 490 82 540 60 596 C 118 552 168 528 226 512 Z" fill="url(#fabric)"/>
  <path d="M 995 452 C 1080 430 1110 380 1134 330 C 1080 372 1030 396 975 412 Z" fill="url(#fabric)"/>
  <path d="M 995 470 C 1082 490 1118 540 1140 596 C 1082 552 1032 528 974 512 Z" fill="url(#fabric)"/>
  <path d="M 200 420 Q 600 372 1000 420 L 1000 508 Q 600 556 200 508 Z" fill="url(#fabric)"/>
  <path d="M 214 432 Q 600 385 986 432" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="14 10" stroke-linecap="round" opacity="0.9"/>
  <path d="M 214 496 Q 600 543 986 496" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="14 10" stroke-linecap="round" opacity="0.9"/>
</g>
${printPattern(600)}`;

const svg1 = page(`
${header(1, "ปลอกคอ แบบผูก", "สกรีน 1 ด้าน · ผ้า 1 ชิ้น · เย็บม้วนริมขอบ")}
${band1}
${callout(620, 245, 700, 398, "สกรีนลายด้านหน้า 1 ด้าน")}
${callout(90, 690, 150, 545, "สายผ้าผูกโบว์ ปรับกระชับได้", "start")}
${callout(1110, 660, 900, 508, "เย็บม้วนริมขอบ เก็บงานเรียบ", "end")}
${chips(["ผ้า 1 ชิ้น", "สกรีน 1 ด้าน", "คละลายขั้นต่ำ 3 ชิ้น/ลาย"])}
`);

// ---------- แบบที่ 2: แบบติดกระดุม ----------
// เส้นโค้งขอบบน-ล่างของชิ้นหน้า
const yTop2 = (x) => { const u = (x - 165) / 870; return 414 - 96 * u * (1 - u); };
const yBot2 = (x) => { const u = (x - 165) / 870; return 506 + 96 * u * (1 - u); };
const zig = (x0, x1, yFn, off) => {
  let d = "";
  let i = 0;
  for (let x = x0; x <= x1; x += 24, i++) {
    const y = yFn(x) + off + (i % 2 ? -9 : 9);
    d += (i ? "L" : "M") + ` ${x} ${y.toFixed(1)} `;
  }
  return `<path d="${d}" fill="none" stroke="#fff" stroke-width="3.5" opacity="0.95" stroke-linejoin="round"/>`;
};

const band2 = `
<g filter="url(#soft)">
  <path d="M 178 436 Q 600 390 1022 436 L 1022 532 Q 600 578 178 532 Z" fill="url(#fabricBack)"/>
  <path d="M 165 414 Q 600 366 1035 414 L 1035 506 Q 600 554 165 506 Z" fill="url(#fabric)"/>
  ${zig(280, 928, yTop2, 22)}
  ${zig(280, 928, yBot2, -22)}
  <g>
    <circle cx="232" cy="462" r="26" fill="#e9f6f8" stroke="#b7ccd1" stroke-width="3"/>
    <circle cx="232" cy="462" r="11" fill="#8fa6ac"/>
    <circle cx="968" cy="462" r="26" fill="#e9f6f8" stroke="#b7ccd1" stroke-width="3"/>
    <circle cx="968" cy="462" r="15" fill="none" stroke="#8fa6ac" stroke-width="5"/>
  </g>
</g>
${printPattern(600)}`;

const svg2 = page(`
${header(2, "ปลอกคอ แบบติดกระดุม", "สกรีน 2 ด้าน · ผ้า 2 ชิ้น เย็บประกบ · เย็บขอบแบบโพ้ง")}
${band2}
${callout(90, 245, 450, 396, "สกรีนลายได้ทั้ง 2 ด้าน", "start")}
${callout(1110, 245, 1010, 545, "ผ้า 2 ชิ้นเย็บประกบ", "end")}
${callout(90, 690, 232, 495, "กระดุมแป๊กติดแน่น", "start")}
${callout(1110, 690, 880, 545, "เย็บขอบแบบโพ้ง", "end")}
${chips(["ผ้า 2 ชิ้น", "สกรีน 2 ด้าน", "เย็บขอบโพ้ง", "คละลายขั้นต่ำ 3 ชิ้น/ลาย"])}
`);

// ---------- แบบที่ 3: แบบใส่กับสาย ----------
const band3 = `
<g filter="url(#soft)">
  <path d="M 60 448 L 1140 448 L 1140 486 L 60 486 Z" fill="url(#strap)"/>
  <line x1="60" y1="456" x2="1140" y2="456" stroke="#fff" stroke-width="2" opacity="0.35"/>
  <line x1="60" y1="478" x2="1140" y2="478" stroke="#333" stroke-width="2" opacity="0.2"/>
  <g>
    <rect x="1058" y="430" width="86" height="74" rx="16" fill="#4b565f"/>
    <rect x="1074" y="446" width="54" height="42" rx="10" fill="#d9f0f6"/>
  </g>
  <rect x="56" y="436" width="34" height="62" rx="8" fill="#4b565f"/>
  <path d="M 268 424 Q 600 388 932 424 L 932 528 Q 600 564 268 528 Z" fill="url(#fabricBack)"/>
  <path d="M 255 402 Q 600 366 945 402 L 945 512 Q 600 548 255 512 Z" fill="url(#fabric)"/>
  <path d="M 270 414 Q 600 380 930 414" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="14 10" stroke-linecap="round" opacity="0.9"/>
  <path d="M 270 500 Q 600 534 930 500" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="14 10" stroke-linecap="round" opacity="0.9"/>
  <path d="M 255 402 L 255 512 M 945 402 L 945 512" stroke="${TEAL_D}" stroke-width="5" stroke-linecap="round" opacity="0.55"/>
</g>
${printPattern(600)}
<g font-family="${FONT}">
  <path d="M 962 402 L 988 402 M 975 402 L 975 560 M 962 512 L 988 512" fill="none" stroke="${TEAL_D}" stroke-width="3"/>
  <text x="975" y="596" font-size="24" fill="${TEAL_D}" text-anchor="middle">รูใส่สาย ~3 cm</text>
</g>`;

const svg3 = page(`
${header(3, "ปลอกคอ แบบใส่กับสาย", "สกรีน 2 ด้าน · ผ้า 2 ชิ้น เย็บประกบ · รูใส่สาย ~3cm")}
${band3}
${callout(90, 245, 145, 440, "สอดกับสายเดิม (ไม่รวมสาย)", "start")}
${callout(880, 245, 700, 388, "สกรีนลายได้ทั้ง 2 ด้าน")}
${callout(90, 690, 300, 528, "ผ้า 2 ชิ้นเย็บประกบเป็นปลอกสวม", "start")}
${chips(["ผ้า 2 ชิ้น", "สกรีน 2 ด้าน", "ไม่รวมสาย", "คละลายขั้นต่ำ 3 ชิ้น/ลาย"])}
`);

// ---------- อัปโหลด + ผูกเข้าเรท ----------
const PRODUCT_ID = "collar-animal";
const BUCKET = "product-images";
const DIR = `products/${PRODUCT_ID}`;
// จับคู่ด้วย label เรทจริงใน DB → ชื่อไฟล์ตามเนื้อหาภาพ (ไม่ใช่ลำดับ)
const jobs = [
  { rateLabel: "ปลอกคอ แบบผูก", file: "rate-tie-mock-v1.jpg", svg: svg1 },
  { rateLabel: "ปลอกคอ แบบติดกระดุม", file: "rate-button-mock-v1.jpg", svg: svg2 },
  { rateLabel: "ปลอกคอ แบบใส่กับสาย", file: "rate-strap-mock-v1.jpg", svg: svg3 },
];

const urls = {};
for (const j of jobs) {
  const jpg = await sharp(Buffer.from(j.svg), { density: 96 }).jpeg({ quality: 88 }).toBuffer();
  const { error } = await sb.storage.from(BUCKET).upload(`${DIR}/${j.file}`, jpg, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) die(`อัปโหลด ${j.file} ไม่ผ่าน: ${error.message}`);
  urls[j.rateLabel] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${DIR}/${j.file}`;
  console.log("✓ อัปโหลด", j.file);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) die(readErr.message);
const data = row.data;
if (!Array.isArray(data.priceRates) || data.priceRates.length !== 3) die(`priceRates ไม่ใช่ 3 เรทตามคาด (${data.priceRates?.length})`);

let changed = false;
for (const r of data.priceRates) {
  const url = urls[r.label];
  if (!url) die(`ไม่รู้จักเรท "${r.label}" — label ใน DB เปลี่ยนไปจากที่สคริปต์รู้จัก`);
  if (r.imageSrc !== url) { r.imageSrc = url; changed = true; }
}

if (!changed) {
  console.log("• imageSrc ตรงอยู่แล้วทั้ง 3 เรท ไม่ต้องเขียน DB");
} else {
  data.savedAt = new Date().toISOString();
  const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
  if (updErr) die(updErr.message);
  if (!upd?.length) die("update โดน 0 แถว");
}

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const j of jobs) {
  const r = (back.data.priceRates || []).find((x) => x.label === j.rateLabel);
  if (r?.imageSrc !== urls[j.rateLabel]) die(`อ่านกลับไม่ตรง: ${j.rateLabel} → ${r?.imageSrc}`);
  console.log("✓ ผูกแล้ว", j.rateLabel, "→", urls[j.rateLabel]);
}
console.log("เสร็จ — หน้าสินค้าแคช 5 นาที เปิดด้วย ?v=<เลขใหม่> เพื่อดูผลทันที");
