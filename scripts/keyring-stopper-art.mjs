#!/usr/bin/env node
/**
 * เตรียมภาพของสินค้า "พวงกุญแจ + อะไหล่จุกสีใส"
 *
 *   node scripts/keyring-stopper-art.mjs [--out=<dir>]
 *
 * ⚠️ เขียนลง .cache/keyring-stopper/ (ไม่ใช่ .cache/keyring/) เพราะสคริปต์ standee-keyring-art.mjs
 *    ใช้ชื่อไฟล์ซ้ำกันหลายตัว (hero · clear · screen · size) — ถ้าใช้โฟลเดอร์เดียวกันจะทับกัน
 *
 * ได้ 2 ชุด แล้วให้ scripts/add-keyring-stopper.ts --upload อัปขึ้น Supabase Storage:
 *   1. ภาพงานจริง/แผ่นข้อมูลจากเว็บตารางราคา (iduckyofficial-pricelists.com/keyring · /partskeychain)
 *      photo-1..4    งานจริงพวงกุญแจอะคริลิคของร้าน
 *      parts-board   แผ่นอะไหล่ ตะขอ ทั้งหมด (Z1-BC + เข็มกลัด P1-P7) พร้อมรหัสและราคา
 *      hook-*        ชาร์ตสีตะขอรายตัว (ไว้ดูสีของตะขอแต่ละแบบ)
 *      color-chart   ตารางสีอะคริลิคของร้าน
 *   2. ภาพประกอบตัวเลือก — วาดเป็น SVG แล้วเรนเดอร์ด้วย sharp ให้สไตล์เดียวกันทั้งชุด
 *      hero              ภาพอธิบายสินค้า (ชิ้นงาน + รูเจาะ + จุกสีใส + ห่วง)
 *      stopper-detail    จุกสีใสคืออะไร ใส่ตรงไหน ช่วยอะไร
 *      size-2..size-10   ขนาดชิ้นงาน (สเกลจริง มีเงาชิ้น 10 ซม. ไว้เทียบ · รูเจาะไม่นับรวมขนาด)
 *      screen-1|2|3l|4l  งานสกรีน 1 ด้าน / 2 ด้าน / 3 เลเยอร์ / 4 เลเยอร์
 *      clear-plain       อะคริลิคใส (ตัวเลือกมาตรฐาน · ขาวขุ่น C-02 ใช้สวอตช์จริงจากชาร์ตสีกลาง)
 * ⚠️ อัปทับ "ชื่อไฟล์เดิม" ไม่ได้ — CDN/Next แคชของเก่าไว้ ต้องตั้งชื่อไฟล์ใหม่เสมอ (ขยับ REV ที่สคริปต์ add-)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
// ลายที่ "สกรีน" บนชิ้นงานในภาพประกอบ = มาสคอตเป็ด iDucky ของฝ่าย Content (น่ารักกว่าวาดเอง)
import { mascotDataUri } from "./iducky-assets.mjs";

let MASCOT = null;
/** โหลดมาสคอตครั้งเดียวตอนเริ่มเรนเดอร์ (ไม่ใช้ top-level await — สคริปต์อื่น import ไฟล์นี้ได้) */
const loadMascot = async () => (MASCOT ??= await mascotDataUri("heart", 560));
// สคริปต์นี้รันตรง ๆ อย่างเดียว (ไม่มีไฟล์ไหน import) — ต้องโหลดมาสคอตก่อนสร้าง SVG
// เพราะภาพอย่าง hero/clearArt ประกอบเป็นค่าคงที่ตั้งแต่โหลดไฟล์ ถ้าโหลดทีหลัง MASCOT ยังเป็น null
await loadMascot();

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/keyring-stopper/upload").replace(
  /\/$/,
  ""
);
mkdirSync(OUT, { recursive: true });

const W = 700;
const H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const LINE = "#94a3b8";
const CYAN = "#0891b2";
const GLASS = "rgba(56,189,248,0.20)";
const GLASS_EDGE = "#38bdf8";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="72" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="112" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines
    .map(
      (t, i) =>
        `<text x="${W / 2}" y="${H - 40 - (lines.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

/** เส้นบอกขนาดแนวตั้ง ป้ายอยู่ขวาเส้น */
const dimV = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y1}" x2="${x + 11}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y2}" x2="${x + 11}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x + 16}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="27" font-weight="700" fill="${CYAN}">${label}</text>`;

/** ลายสกรีนจำลองบนชิ้นงาน */
/**
 * ลายที่สกรีนบนชิ้นงาน — ใช้มาสคอตเป็ด iDucky (ไฟล์จริงจากฝ่าย Content)
 * วางให้พอดีกรอบ (w × h) โดยคงสัดส่วนภาพไว้ · faded = ชั้นที่อยู่ลึกลงไป (งานหลายเลเยอร์)
 */
const artwork = (cx, cy, w, h, faded = false) => {
  const box = Math.min(w, h * 0.98);
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
    preserveAspectRatio="xMidYMid meet" opacity="${faded ? 0.4 : 1}"/>`;
};


/**
 * จุกสีใส (จุกยาง/ซิลิโคนใส) ที่ใส่ในรูเจาะ — วาดเป็นวงแหวนใสซ้อนในรู
 * ช่วยกันรูสึก/แตก และทำให้ชิ้นงานหมุนได้ลื่นเวลาห้อย
 */
const stopper = (cx, cy, r) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(226,232,240,0.55)" stroke="#94a3b8" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.52}" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <path d="M${cx - r * 0.75} ${cy - r * 0.3} a${r} ${r} 0 0 1 ${r * 0.7} -${r * 0.62}" stroke="#ffffff" stroke-width="3" fill="none" opacity="0.9"/>`;

/** ห่วงกลม/ตะขอแบบง่าย ๆ ที่คล้องผ่านรู */
const ring = (cx, cy, r) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#94a3b8" stroke-width="5"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="2"/>`;

// ── 1. ขนาดชิ้นงาน 2-10 ซม. (สเกลจริง เทียบกันได้ทั้งชุด) ──────────────────
const SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const PX_PER_CM = 38; // 10cm = 380px
const BOTTOM = 560;
/** สัดส่วนกว้าง:ยาว ของชิ้นงานตัวอย่าง */
const RATIO = 0.78;

/** ชิ้นงานพวงกุญแจ 1 ชิ้น (ลาย + รูเจาะ + จุกใส + ห่วง) */
function piece(cx, bottom, long, withRing = true) {
  const h = long;
  const w = long * RATIO;
  const top = bottom - h;
  const holeR = Math.max(7, Math.min(16, long * 0.055));
  const holeCy = top + holeR + Math.max(6, long * 0.045);
  return `
    <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="${Math.min(26, h * 0.16)}"
      fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(cx, top + h * 0.6, w * 0.8, h * 0.55)}
    ${stopper(cx, holeCy, holeR)}
    ${withRing ? ring(cx, holeCy - holeR * 1.5, holeR * 1.35) : ""}`;
}

function sizeArt(cm) {
  const long = cm * PX_PER_CM;
  const ghost = 10 * PX_PER_CM;
  const cx = 300;
  return frame(`
    ${title(`ขนาด ${cm} ซม.`, "วัดจากด้านที่ยาวที่สุด — ไม่นับรวมรูตะขอ")}
    ${
      cm < 10
        ? `<rect x="${cx - (ghost * RATIO) / 2}" y="${BOTTOM - ghost}" width="${ghost * RATIO}" height="${ghost}" rx="26"
      fill="none" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="8 8"/>`
        : ""
    }
    ${piece(cx, BOTTOM, long)}
    ${dimV(cx + (ghost * RATIO) / 2 + 26, BOTTOM - long, BOTTOM, `${cm} ซม.`)}
    ${foot([
      "จุกสีใสอยู่ในรูเจาะ (รวมในราคาแล้ว) · เลือกตะขอ/ห่วงได้",
      cm < 10 ? "เส้นประ = ขนาดใหญ่สุด 10 ซม. ในเรทนี้ (ไว้เทียบขนาด)" : "ขนาดใหญ่สุดของเรทที่ 1 ตามตารางเว็บ",
    ])}`);
}

// ── 2. ภาพอธิบายสินค้า ────────────────────────────────────────────────────
const hero = (() => {
  const long = 250;
  const lx = 210;
  const rx = 498;
  return frame(`
    ${title("พวงกุญแจ + อะไหล่จุกสีใส", "จุกใสใส่ในรูเจาะ — กันรูสึก ห้อยแล้วหมุนลื่น")}
    ${piece(lx, 470, long)}
    <text x="${lx}" y="530" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${CYAN}">งานจริงเวลาห้อย</text>
    <!-- ซูมจุดที่ใส่จุก (วงกลมซูม + ขอบชิ้นงานโผล่ครึ่งล่าง) -->
    <defs>
      <clipPath id="zoom"><circle cx="${rx}" cy="330" r="130"/></clipPath>
    </defs>
    <circle cx="${rx}" cy="330" r="130" fill="#f8fafc" stroke="#e2e8f0" stroke-width="3"/>
    <g clip-path="url(#zoom)">
      <rect x="${rx - 104}" y="352" width="208" height="180" rx="22" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
      ${stopper(rx, 352, 42)}
      ${ring(rx, 286, 46)}
    </g>
    <path d="M${rx + 52} 352 h74" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>
    <text x="${rx + 60}" y="340" font-family="${TH}" font-size="20" fill="${SUB}">จุกสีใส</text>
    <text x="${rx}" y="530" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${CYAN}">ซูมดูจุกสีใส</text>
    ${foot([
      "จุกสีใส (จุกยางใส) ชุดละ 10 บาท — รวมอยู่ในราคาที่แสดงแล้ว",
      "ราคาตามตารางเรทที่ 1 (สั่งแบบคละดีเทล) ของหน้าพวงกุญแจ",
    ])}`);
})();

// ── 3. จุกสีใส (อธิบายว่าคืออะไร) ─────────────────────────────────────────
const stopperDetail = frame(`
  ${title("อะไหล่จุกสีใส", "จุกยางใสสวมในรูเจาะของชิ้นงาน")}
  <rect x="196" y="250" width="308" height="250" rx="26" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
  ${artwork(350, 420, 240, 150)}
  ${stopper(350, 300, 44)}
  ${ring(350, 226, 52)}
  <path d="M402 300 h84" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>
  <text x="412" y="288" font-family="${TH}" font-size="21" fill="${SUB}">จุกสีใส (ในรูเจาะ)</text>
  <path d="M410 226 h76" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>
  <text x="420" y="214" font-family="${TH}" font-size="21" fill="${SUB}">ตะขอ / ห่วง</text>
  ${foot([
    "กันรูเจาะสึก/บิ่นจากการเสียดสีกับห่วงเหล็ก",
    "ห้อยแล้วชิ้นงานหมุนได้ลื่น · ชุดละ 10 บาท (รวมในราคาแล้ว)",
  ])}`);

// ── 4. งานสกรีน ───────────────────────────────────────────────────────────
const SCREENS = {
  "screen-1": {
    t: "สกรีน 1 ด้าน",
    s: "พิมพ์ลายด้านหน้าด้านเดียว",
    back: (cx, cy) => `<text x="${cx}" y="${cy}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${LINE}">ใสไม่มีลาย</text>`,
    foot: ["ราคามาตรฐานตามตาราง (ค่าจุกสีใสรวมแล้ว)", "อะคริลิคหนา 3 มม. พิมพ์ระบบ UV"],
  },
  "screen-2": {
    t: "สกรีน 2 ด้าน",
    s: "พิมพ์ลายทั้งด้านหน้าและด้านหลัง",
    back: (cx, cy) => artwork(cx, cy, 150, 150),
    foot: ["บวกเพิ่มตามขนาด · 2-5 ซม. +10 · 6-7 ซม. +15", "8-10 ซม. +25 บาท/ชิ้น (ระบบรวมให้ในตารางแล้ว)"],
  },
  "screen-3l": {
    t: "สกรีน 3 เลเยอร์",
    s: "พิมพ์ซ้อนชั้น ให้ลายมีมิติ (ขาว-สี-ขาว)",
    back: (cx, cy) => artwork(cx, cy, 150, 150, true),
    layers: 3,
    foot: ["บวกเพิ่มตามขนาด · 2-5 ซม. +20 · 6-7 ซม. +30", "8-10 ซม. +50 บาท/ชิ้น (ระบบรวมให้ในตารางแล้ว)"],
  },
  "screen-4l": {
    t: "สกรีน 4 เลเยอร์",
    s: "พิมพ์ซ้อน 4 ชั้น ลายคมทั้งสองด้าน",
    back: (cx, cy) => artwork(cx, cy, 150, 150),
    layers: 4,
    foot: ["บวกเพิ่มตามขนาด · 2-5 ซม. +35 · 6-7 ซม. +45", "8-10 ซม. +75 บาท/ชิ้น (ระบบรวมให้ในตารางแล้ว)"],
  },
};

function screenArt(s) {
  const lx = 208;
  const rx = 492;
  const w = 160;
  const h = 205;
  const top = 220;
  const stack = s.layers
    ? Array.from({ length: s.layers }, (_, i) => i)
        .map(
          (i) =>
            `<rect x="${rx - w / 2 + 14 - i * 9}" y="${top + 16 - i * 9}" width="${w}" height="${h}" rx="20"
               fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="3" opacity="${0.35 + i * 0.15}"/>`
        )
        .join("")
    : "";
  return frame(`
    ${title(s.t, s.s)}
    <text x="${lx}" y="188" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${CYAN}">ด้านหน้า</text>
    <rect x="${lx - w / 2}" y="${top}" width="${w}" height="${h}" rx="20" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(lx, top + h * 0.58, w * 0.86, h * 0.6)}
    ${stopper(lx, top + 26, 13)}
    <text x="${rx}" y="188" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${CYAN}">${s.layers ? "ชั้นที่ซ้อนกัน" : "ด้านหลัง"}</text>
    ${stack}
    <rect x="${rx - w / 2}" y="${top}" width="${w}" height="${h}" rx="20" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${s.back(rx, top + h * 0.58)}
    ${stopper(rx, top + 26, 13)}
    ${foot(s.foot)}`);
}

// ── 5. อะคริลิคใส (ตัวเลือกสีมาตรฐาน) ────────────────────────────────────
const clearArt = frame(`
  ${title("อะคริลิคใส", "ชนิดมาตรฐาน หนาประมาณ 3 มม. · เนื้อใสมองทะลุ")}
  <rect x="222" y="206" width="256" height="300" rx="26" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
  <path d="M242 478 L458 232" stroke="#ffffff" stroke-width="24" opacity="0.55"/>
  <path d="M272 494 L478 258" stroke="#ffffff" stroke-width="11" opacity="0.4"/>
  ${artwork(350, 380, 256, 260)}
  ${stopper(350, 236, 17)}
  ${foot([
    "อะคริลิคหนา 3 มม. พิมพ์ระบบ UV · ตัดตกด้านละ 3 มม.",
    "ราคาตามตารางคือชนิดนี้ ไม่บวกเพิ่ม (เท่ากับขาวขุ่น C-02)",
    "อยากได้สี/กลิตเตอร์/โฮโลแกรม เลือกอะคริลิคพิเศษได้ (คิดเพิ่มตามขนาด)",
  ])}`);

// ── เขียนไฟล์ ────────────────────────────────────────────────────────────
async function render(name, svg) {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`🎨 ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
}

/** ภาพจากเว็บตารางราคา (id ของ static.wixstatic.com) */
const PHOTOS = {
  "photo-1": { id: "959b83_5981671c43e04964aaed5dc183168275~mv2" },
  "photo-2": { id: "959b83_f109195c752d407aa7952b8869779f5d~mv2" },
  "photo-3": { id: "959b83_02dea66c3edf4e79a4841de36d7d8bc7~mv2" },
  "photo-4": { id: "959b83_bead28d92b3b4a27864db86529e0bea1~mv2" },
  // แผ่นอะไหล่ ตะขอ ทั้งหมด (หน้า /partskeychain) — ภาพใหญ่ ให้ลูกค้าเลื่อนดูรหัสตะขอได้
  "parts-board": { id: "959b83_0674be7630284ffe8e65facbacca83fe~mv2", wide: true },
  // ชาร์ตสีของตะขอที่มีหลายสี
  "hook-g": { id: "959b83_3c578955eee9427d97f9de5afbb06bf3~mv2" },
  "hook-h": { id: "959b83_44f87a38028f452b8420727df4a3e101~mv2" },
  "hook-i": { id: "959b83_56c9b01b46b04622aadfc3ec6576f452~mv2" },
  "hook-t": { id: "959b83_3aa53d73bab442cfaae2795834c87e78~mv2" },
  "hook-u": { id: "959b83_b81081e12de440878ce2b558f849b1c7~mv2" },
  "hook-s": { id: "959b83_9cecebf8dccf47c4bd6e27843258d9fb~mv2" },
  "color-chart": { id: "959b83_ece384645d784b25ab624c67f2cbd4d8~mv2" },
};

async function photos() {
  for (const [name, spec] of Object.entries(PHOTOS)) {
    const res = await fetch(`https://static.wixstatic.com/media/${spec.id}.jpg`, {
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const buf = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(spec.wide ? 2000 : 1400, spec.wide ? 2400 : 1400, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: spec.wide ? 82 : 88 })
      .toBuffer();
    writeFileSync(`${OUT}/${name}.jpg`, buf);
    console.log(`📷 ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
  }
}

await photos();
await render("hero", hero);
await render("stopper-detail", stopperDetail);
for (const cm of SIZES) await render(`size-${cm}`, sizeArt(cm));
for (const [name, s] of Object.entries(SCREENS)) await render(name, screenArt(s));
await render("clear-plain", clearArt);
console.log(`\n✅ ไฟล์ทั้งหมดอยู่ที่ ${OUT}`);
