#!/usr/bin/env node
/**
 * ภาพประกอบกลุ่ม "ขนาด" ของ Brooch Badge / เข็มกลัดพลาสติก
 * (broochbadge-th · /products/Brooch-Badge-เข็มกลัดพลาสติก)
 *
 *   node scripts/brooch-badge-size-art.mjs           (วาดภาพ + ครอปกลางลง .cache/broochbadge-th/upload)
 *   node scripts/brooch-badge-size-art.mjs --write   (+ อัปโหลด storage + ตั้ง imageSrc/desc + display cards + อ่านกลับเทียบ)
 *
 * 5 ตัวเลือกจาก DB (ห้ามแก้ชื่อ — เป็นแกนตารางราคา driverLabels ["ขนาด","ชนิดเคลือบ"]):
 *   ทรงกลม 25 / 32 / 44 / 58 mm และทรงหัวใจ 57x53 mm
 *
 * ดีไซน์: ทุกใบ "สเกลเดียวกัน" (1 มม. = 6.6 px) → วางเทียบกันแล้วเห็นว่าใหญ่ต่างกันจริง
 *   ⚠️ ปุ่มตัวเลือกครอปกลางภาพ 62×62 (พิกัด 300–600) → ต้องมีป้ายเลขขนาดตัวใหญ่ที่ y≈565
 *      และวางตัวเข็มกลัดคร่อมกลางกรอบ (ใบเล็กเหลือขอบขาวเยอะ / ใบใหญ่เต็มกรอบ = อ่านขนาดออกทันที)
 *   แถบเทียบขนาด 5 แบบด้านล่าง + ลูกศรวัดเส้นผ่านศูนย์กลาง = เห็นเต็ม ๆ ตอนกางเป็นการ์ด
 *
 * อ้างรูปงานจริงในแกลเลอรีสินค้า: กระดุมพลาสติกขอบขาว ลายพิมพ์เต็มหน้า หลังมีเข็มกลัดนิรภัย
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 520);

const PRODUCT_ID = "broochbadge-th";
const SIZE_GROUP = "ขนาด";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/broochbadge-th/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** สเกลจริงของทุกใบ — 1 มม. = 6.6 px (58 มม. = 383 px) */
const MM = 6.6;
/** จุดกึ่งกลางตัวเข็มกลัด — ดันขึ้นจากกลางภาพเล็กน้อยให้เว้นที่ป้ายเลขขนาด */
const CX = W / 2;
const CY = 398;
/** ป้ายเลขขนาด — y คงที่ทุกใบ ให้ตกในกรอบครอป 300–600 เสมอ */
const TAG_Y = 566;
/** ลูกศรวัด — y คงที่ ใต้ชิ้นงานใบใหญ่สุด (58 มม. ก้นอยู่ที่ 590) */
const DIM_Y = 646;

/** ขนาดจาก DB — key `choice` ต้องตรงชื่อตัวเลือกเป๊ะ ๆ */
const SIZES = [
  {
    choice: "ทรงกลม 25mm (1 เซตได้ 10 ชิ้น)",
    file: "size-round-25",
    shape: "round", w: 25, h: 25, per: 10,
    title: "ทรงกลม 25 มม.", tag: "25 mm", strip: "25",
    desc: "ทรงกลม ⌀ 2.5 ซม. · 1 เซตได้ 10 ชิ้น · ไซซ์เล็กสุด ติดปกเสื้อ/สายกระเป๋าได้เยอะ",
    use: "ไซซ์เล็กสุด — ลายเรียบ ๆ ตัวคาแรกเตอร์เดี่ยวชัดกว่า",
  },
  {
    choice: "ทรงกลม 32mm (1 เซตได้ 10 ชิ้น)",
    file: "size-round-32",
    shape: "round", w: 32, h: 32, per: 10,
    title: "ทรงกลม 32 มม.", tag: "32 mm", strip: "32",
    desc: "ทรงกลม ⌀ 3.2 ซม. · 1 เซตได้ 10 ชิ้น · ไซซ์ยอดนิยม ลายชัดกำลังดีในราคาต่อชิ้นถูก",
    use: "ไซซ์ยอดนิยม — คุ้มที่สุดต่อชิ้น ลายยังชัด",
  },
  {
    choice: "ทรงกลม 44mm (1 เซตได้ 5 ชิ้น)",
    file: "size-round-44",
    shape: "round", w: 44, h: 44, per: 5,
    title: "ทรงกลม 44 มม.", tag: "44 mm", strip: "44",
    desc: "ทรงกลม ⌀ 4.4 ซม. · 1 เซตได้ 5 ชิ้น · เห็นรายละเอียดลายครบ เหมาะกับลายครึ่งตัว",
    use: "เห็นรายละเอียดลายครบ เหมาะลายครึ่งตัว/มีฉากหลัง",
  },
  {
    choice: "ทรงกลม 58mm (1 เซตได้ 5 ชิ้น)",
    file: "size-round-58",
    shape: "round", w: 58, h: 58, per: 5,
    title: "ทรงกลม 58 มม.", tag: "58 mm", strip: "58",
    desc: "ทรงกลม ⌀ 5.8 ซม. · 1 เซตได้ 5 ชิ้น · ไซซ์ใหญ่สุด เด่นบนกระเป๋า/สายสะพาย",
    use: "ไซซ์ใหญ่สุด — เด่นบนกระเป๋า ใส่ตัวหนังสือได้",
  },
  {
    choice: "ทรงหัวใจ 57x53mm (1 เซตได้ 5 ชิ้น)",
    file: "size-heart-57x53",
    shape: "heart", w: 57, h: 53, per: 5,
    title: "ทรงหัวใจ 57 × 53 มม.", tag: "57×53", strip: "หัวใจ",
    desc: "ทรงหัวใจ 5.7 × 5.3 ซม. · 1 เซตได้ 5 ชิ้น · ทรงพิเศษทรงเดียว ขนาดใกล้เคียงกลม 58 มม.",
    use: "ทรงพิเศษ — ขนาดพอ ๆ กับกลม 58 มม.",
  },
];

/** เส้นขอบทรงหัวใจในกรอบ (x,y,w,h) — สัดส่วนเดียวกับกระดุมหัวใจของจริง (ปลายแหลมลง) */
const heartPath = (x, y, w, h) => {
  const px = (u) => x + u * w;
  const py = (v) => y + v * h;
  return [
    `M ${px(0.5)} ${py(1)}`,
    `C ${px(0.5)} ${py(1)} ${px(0.015)} ${py(0.63)} ${px(0.015)} ${py(0.33)}`,
    `C ${px(0.015)} ${py(0.1)} ${px(0.21)} ${py(0.005)} ${px(0.345)} ${py(0.005)}`,
    `C ${px(0.44)} ${py(0.005)} ${px(0.5)} ${py(0.09)} ${px(0.5)} ${py(0.17)}`,
    `C ${px(0.5)} ${py(0.09)} ${px(0.56)} ${py(0.005)} ${px(0.655)} ${py(0.005)}`,
    `C ${px(0.79)} ${py(0.005)} ${px(0.985)} ${py(0.1)} ${px(0.985)} ${py(0.33)}`,
    `C ${px(0.985)} ${py(0.63)} ${px(0.5)} ${py(1)} ${px(0.5)} ${py(1)} Z`,
  ].join(" ");
};

/** ลูกศรวัดแนวนอน — ขีดปลายสองข้าง + ป้ายตัวเลขบนเส้น */
const dimH = (x1, x2, y, label) => {
  const lw = label.length * 13 + 22;
  return `
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${SUB}" stroke-width="2.5"/>
    <line x1="${x1}" y1="${y - 11}" x2="${x1}" y2="${y + 11}" stroke="${SUB}" stroke-width="3"/>
    <line x1="${x2}" y1="${y - 11}" x2="${x2}" y2="${y + 11}" stroke="${SUB}" stroke-width="3"/>
    <rect x="${(x1 + x2) / 2 - lw / 2}" y="${y - 19}" width="${lw}" height="38" rx="9" fill="#ffffff" opacity="0.95"/>
    <text x="${(x1 + x2) / 2}" y="${y + 9}" font-family="${TH}" font-size="25" font-weight="700"
      text-anchor="middle" fill="${SUB}">${label}</text>`;
};

/**
 * ตัวเข็มกลัด 1 ชิ้น (มองจากหน้า) — ขอบพลาสติกขาวโดยรอบ + ลายพิมพ์เต็มหน้า
 * s = ข้อมูลขนาด, id = คีย์กัน defs ชนกันเวลาวาดหลายชิ้นในภาพเดียว
 */
const badge = (s, cx, cy, mmPx, id, art = true) => {
  const bw = s.w * mmPx;
  const bh = s.h * mmPx;
  const x = cx - bw / 2;
  const y = cy - bh / 2;
  /* ขอบพลาสติกขาว ~1.6 มม. → ช่องลายพิมพ์เล็กกว่าตัวชิ้นเล็กน้อย */
  const inset = Math.max(mmPx * 1.6, 3);
  const aw = bw - inset * 2;
  const ah = bh - inset * 2;
  const ax = x + inset;
  const ay = y + inset;
  const r = MASCOT.ratio;
  const mh = ah * (s.shape === "heart" ? 0.56 : 0.66);
  const mw = mh * r;

  const outline = s.shape === "heart" ? heartPath(x, y, bw, bh) : "";
  const artline = s.shape === "heart" ? heartPath(ax, ay, aw, ah) : "";
  const body =
    s.shape === "heart"
      ? `<path d="${outline}" fill="url(#shell${id})" stroke="#d8dee7" stroke-width="2"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${bw / 2}" fill="url(#shell${id})" stroke="#d8dee7" stroke-width="2"/>`;
  const clip =
    s.shape === "heart"
      ? `<clipPath id="art${id}"><path d="${artline}"/></clipPath>`
      : `<clipPath id="art${id}"><circle cx="${cx}" cy="${cy}" r="${aw / 2}"/></clipPath>`;

  return `
  <defs>
    <radialGradient id="shell${id}" cx="0.34" cy="0.28" r="0.85">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.72" stop-color="#f7f8fa"/>
      <stop offset="1" stop-color="#e6eaf0"/>
    </radialGradient>
    ${clip}
  </defs>
  <!-- เงาชิ้นงาน -->
  ${
    s.shape === "heart"
      ? `<path d="${heartPath(x + 4, y + 9, bw, bh)}" fill="#0f172a" opacity="0.10"/>`
      : `<circle cx="${cx + 4}" cy="${cy + 9}" r="${bw / 2}" fill="#0f172a" opacity="0.10"/>`
  }
  ${body}
  <!-- ช่องลายพิมพ์ -->
  <g clip-path="url(#art${id})">
    <rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" fill="#fbe3ea"/>
    <rect x="${ax}" y="${ay + ah * 0.58}" width="${aw}" height="${ah * 0.42}" fill="#f7cdda"/>
    ${
      art
        ? `<image href="${MASCOT.uri}" x="${cx - mw / 2}" y="${cy - mh / 2 + (s.shape === "heart" ? -ah * 0.04 : 0)}"
             width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>`
        : ""
    }
  </g>
  <!-- ไฮไลต์ผิวพลาสติกเงา -->
  ${
    s.shape === "heart"
      ? `<path d="${artline}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.7"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${aw / 2}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.7"/>`
  }
  <ellipse cx="${cx - bw * 0.17}" cy="${cy - bh * 0.26}" rx="${bw * 0.2}" ry="${bh * 0.12}"
    fill="#ffffff" opacity="0.3" transform="rotate(-24 ${cx - bw * 0.17} ${cy - bh * 0.26})"/>`;
};

/** ด้านหลัง + เข็มกลัดนิรภัย — ภาพเล็กมุมขวาบน บอกว่าเป็นเข็มกลัดจริง (ไม่ใช่แม่เหล็ก) */
const backView = (cx, cy, d) => {
  const r = d / 2;
  return `
  <circle cx="${cx}" cy="${cy + 3}" r="${r}" fill="#0f172a" opacity="0.08"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#f4f6f9" stroke="#d8dee7" stroke-width="2"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.84}" fill="none" stroke="#e2e8f0" stroke-width="2"/>
  <!-- เข็มกลัดนิรภัย -->
  <rect x="${cx - r * 0.62}" y="${cy - 4}" width="${r * 1.24}" height="7" rx="3.5" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1.4"/>
  <rect x="${cx - r * 0.7}" y="${cy - 9}" width="${r * 0.2}" height="17" rx="4" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.4"/>
  <circle cx="${cx + r * 0.6}" cy="${cy}" r="${r * 0.13}" fill="none" stroke="#94a3b8" stroke-width="2.4"/>
  <text x="${cx}" y="${cy + r + 26}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">ด้านหลัง</text>`;
};

/** แถบเทียบขนาดทั้ง 5 แบบ — สเกลย่อร่วมกัน ไฮไลต์ตัวที่เลือกอยู่ */
const compareStrip = (cur) => {
  const MM2 = 1.6;
  const gap = 34;
  const total = SIZES.reduce((a, s) => a + s.w * MM2, 0) + gap * (SIZES.length - 1);
  let x = CX - total / 2;
  /* วางชิ้นเล็ก-ใหญ่ให้ "ก้นเสมอกัน" บนเส้นเดียว — เทียบความสูงด้วยตาได้ทันที */
  const footY = 800;
  const parts = SIZES.map((s) => {
    const bw = s.w * MM2;
    const bh = s.h * MM2;
    const cx = x + bw / 2;
    const on = s.choice === cur.choice;
    const fill = on ? "#cffafe" : "#eef2f7";
    const stroke = on ? OK : "#cbd5e1";
    const shape =
      s.shape === "heart"
        ? `<path d="${heartPath(cx - bw / 2, footY - bh, bw, bh)}" fill="${fill}" stroke="${stroke}" stroke-width="${on ? 3 : 2}"/>`
        : `<circle cx="${cx}" cy="${footY - bh / 2}" r="${bw / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${on ? 3 : 2}"/>`;
    const out = `${shape}
      <text x="${cx}" y="${footY + 28}" font-family="${TH}" font-size="19" font-weight="${on ? 700 : 400}"
        text-anchor="middle" fill="${on ? OK : SUB}">${s.strip}</text>`;
    x += bw + gap;
    return out;
  });
  return `<line x1="${CX - total / 2 - 14}" y1="${footY}" x2="${CX + total / 2 + 14}" y2="${footY}" stroke="#e2e8f0" stroke-width="2"/>
    ${parts.join("")}
    <text x="${CX}" y="${692}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">เทียบขนาดจริงทั้ง 5 แบบ</text>`;
};

/** การ์ด 1 ใบ */
function card(s) {
  const bw = s.w * MM;
  const tagW = s.tag.length * 26 + 44;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>

  <text x="${CX}" y="88" font-family="${TH}" font-size="41" font-weight="700" text-anchor="middle" fill="${INK}">${s.title}</text>
  <text x="${CX}" y="128" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${s.use}</text>

  <!-- ป้ายจำนวนต่อเซต -->
  <rect x="${CX - 118}" y="${150}" width="236" height="42" rx="21" fill="#ecfeff" stroke="#a5f3fc" stroke-width="2"/>
  <text x="${CX}" y="${179}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${OK}">1 เซต = ${s.per} ชิ้น</text>

  ${backView(770, 236, 96)}
  ${badge(s, CX, CY, MM, "main")}
  ${dimH(CX - bw / 2, CX + bw / 2, DIM_Y, s.shape === "heart" ? `${s.w} มม.` : `⌀ ${s.w} มม.`)}

  <!-- ป้ายเลขขนาด — ตัวใหญ่กลางกรอบครอป 62px ของปุ่มตัวเลือก -->
  <rect x="${CX - tagW / 2}" y="${TAG_Y - 30}" width="${tagW}" height="62" rx="16" fill="#0f172a" opacity="0.10"/>
  <rect x="${CX - tagW / 2}" y="${TAG_Y - 33}" width="${tagW}" height="62" rx="16" fill="#ffffff" opacity="0.97" stroke="#a5f3fc" stroke-width="2.5"/>
  <text x="${CX}" y="${TAG_Y + 11}" font-family="${TH}" font-size="42" font-weight="800" text-anchor="middle" fill="${INK}">${s.tag}</text>

  ${compareStrip(s)}
  <text x="${CX}" y="${H - 36}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ทุกภาพสเกลเดียวกัน · พิมพ์ลายเต็มหน้า หลังเป็นเข็มกลัดนิรภัย</text>
</svg>`;
}

// ── วาดภาพ ─────────────────────────────────────────────────────────
const built = [];
for (const s of SIZES) {
  const file = `${s.file}-${VER}.jpg`;
  const buf = await sharp(Buffer.from(card(s))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${file}`, buf);
  /* ครอปกลาง 300–600 = สิ่งที่เห็นจริงบนปุ่มตัวเลือก 62×62 */
  await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/_thumb-${file}`);
  built.push({ ...s, file, buf });
  console.log(`🖼  ${OUT}/${file}  ${Math.round(buf.length / 1024)} KB — ${s.title}`);
}
/* แผ่นรวมครอปกลาง 5 ใบ เรียงเทียบกัน ตรวจว่าปุ่มแยกออกจากกันจริง */
await sharp({ create: { width: 300 * built.length, height: 300, channels: 3, background: "#ffffff" } })
  .composite(built.map((b, i) => ({ input: `${OUT}/_thumb-${b.file}`, left: i * 300, top: 0 })))
  .jpeg({ quality: 88 })
  .toFile(`${OUT}/_thumbs-all.jpg`);
console.log(`🔎 ${OUT}/_thumbs-all.jpg — ครอปกลาง 5 ใบเรียงเทียบ`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const url = {};
for (const b of built) {
  const key = `products/${PRODUCT_ID}/${b.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, b.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  url[b.choice] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", key);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const group = (data.options ?? []).find((o) => o.label === SIZE_GROUP);
if (!group) { console.error(`ไม่เจอกลุ่ม "${SIZE_GROUP}" — หยุดก่อน`); process.exit(1); }

/* ห้ามแตะชื่อกลุ่ม/ชื่อตัวเลือก (แกนตารางราคา) — เติมแค่ imageSrc + desc แล้วเปลี่ยนโหมดเป็นการ์ด */
group.display = "cards";
for (const c of group.choices ?? []) {
  const s = SIZES.find((x) => x.choice === c.name);
  if (!s) { console.error("ตัวเลือกใน DB ไม่มีในสคริปต์:", c.name); process.exit(1); }
  c.imageSrc = url[c.name];
  c.desc = s.desc;
}
data.savedAt = new Date().toISOString();

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === SIZE_GROUP);
if (g?.display !== "cards") { console.error("display ไม่ใช่ cards", g?.display); process.exit(1); }
for (const s of SIZES) {
  const c = g.choices.find((x) => x.name === s.choice);
  if (c?.imageSrc !== url[s.choice] || c?.desc !== s.desc) { console.error("อ่านกลับไม่ตรง:", s.choice, c); process.exit(1); }
}
console.log(`✓ กลุ่ม "${SIZE_GROUP}" การ์ด + ภาพครบ ${SIZES.length} ตัวเลือก อ่านกลับตรง · savedAt =`, back.data.savedAt);
