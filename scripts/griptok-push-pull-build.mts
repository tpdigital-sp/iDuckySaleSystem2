/**
 * สร้างสินค้า "GRIPTOK PUSH-PULL" (griptok-push-pull) จากหน้า pricelists /griptok
 *
 *   npx tsx scripts/griptok-push-pull-build.mts            # ดูข้อมูลที่จะบันทึก (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/griptok-push-pull-build.mts --write    # อัปรูป/คลิป + เขียนลง Supabase (ฉบับร่าง)
 *
 * ที่มา: iduckyofficial-pricelists.com/griptok บล็อกหัวข้อ "GRIPTOK  PUSH-PULL"
 *   สคริปต์อ่านตารางสดทุกครั้ง — คำว่า PUSH-PULL โผล่ในหน้าหลายที่ (เมนูบน/warmup JSON)
 *   จึงไล่ทุกตำแหน่งแล้วเอาตำแหน่งที่มี <table> หัว จำนวน|ราคา ตามหลังใกล้ ๆ เท่านั้น
 *   • ตารางเดียว UV Printing 8 ช่วงจำนวน: 1-10=130 ... 5000++=50 บาท/ชิ้น
 *   • ขนาด 7.4×3.5 ซม. · วัสดุพลาสติก · สี ขาว | ใส
 *   • 1-10 ชิ้น คละลายได้ · 11 ชิ้นขึ้นไป คละลาย ขั้นต่ำลายละ 5 ชิ้น
 *
 * ตัวเลือกมีภาพประกอบ (ผู้ใช้สั่ง 25 ส.ค. 69 — อยากให้เห็นว่าแต่ละแบบหน้าตาเป็นแบบไหน):
 *   กลุ่ม "สีตัวเรือน" display cards 2 แบบ ขาว/ใส ฟรีทั้งคู่ — ภาพงานจริงจากแกลเลอรี PUSH-PULL
 *   บนหน้า /griptok (wixstatic) + แกลเลอรีสินค้าแนบคลิปงานจริง 2 ตัว (ตัวขาว/ตัวใส)
 *
 * ⚠️ คลิปห้ามเป็นช่องแรกของแกลเลอรี (รูปแรกถูกใช้เป็นหน้าปกสินค้า) — ดู iducky-gallery-video
 * ⚠️ อัปรูปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { hasQuoteOption, priceRange, type PriceMatrix, type PriceTier, type Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const ID = "griptok-push-pull";
const NAME = "GRIPTOK PUSH-PULL";
const V = "v1";
const PAGE = "https://www.iduckyofficial-pricelists.com/griptok";
const ANCHOR = "PUSH-PULL";
const UNIT = "ชิ้น";

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = (file: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

/* ── 1. ดึงตารางราคาจากเว็บ ─────────────────────────────────────── */
const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s: string) => decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const html = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } }).then((r) => {
  if (!r.ok) throw new Error(`ดึงหน้า ${PAGE} ไม่ได้ — HTTP ${r.status}`);
  return r.text();
});

function pushPullTable(): string[][] {
  for (let a = html.indexOf(ANCHOR); a >= 0; a = html.indexOf(ANCHOR, a + 1)) {
    const t = html.indexOf("<table", a);
    if (t < 0 || t - a > 10000) continue;
    const rows = [...html.slice(t, html.indexOf("</table>", t)).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
      [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
    );
    // ตาราง PUSH-PULL = หัว จำนวน|ราคา แถวข้อมูลแรก 1-10 ชิ้น (ตาราง จำนวน|ราคา มีหลายตัวในหน้า
    // เช่น กระจกพับ/Glitter — แต่ตัวพวกนั้นไม่ได้ตามหลังคำว่า PUSH-PULL ในระยะใกล้)
    if (rows.length >= 3 && rows[0][0] === "จำนวน" && rows[0][1] === "ราคา" && /^1\s*-\s*10/.test(rows[1][0])) return rows;
  }
  throw new Error(`ไม่เจอตาราง จำนวน|ราคา ใกล้หัวข้อ "${ANCHOR}" — โครงหน้าเว็บอาจเปลี่ยน`);
}

const rows = pushPullTable();
const tiers: PriceTier[] = rows.slice(1).map((r) => {
  const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: r[0] };
});
tiers[tiers.length - 1].upTo = null; // แถวท้าย "5000 ชิ้นขึ้นไป" = ขั้นเปิดปลาย
const prices = rows.slice(1).map((r) => {
  const n = Number(String(r[1]).replace(/[^\d]/g, ""));
  if (!n) throw new Error(`ช่องราคาแถว "${r[0]}" อ่านไม่ออก ("${r[1]}")`);
  return n;
});
if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ — ตรวจก่อน");
// กันหยิบตารางผิดตัว: PUSH-PULL ราคาเรียงลง ช่วงแรกหลักร้อยต้น ๆ และมี 8 ช่วง
if (prices.length < 6 || prices[0] > 300 || prices.some((p, i) => i > 0 && p >= prices[i - 1]))
  throw new Error(`ราคาที่อ่านได้ผิดคาด (${prices.join(", ")}) — ตรวจหน้าเว็บก่อน`);

const pricing: PriceMatrix = { unit: UNIT, driverLabels: [], tiers, cells: { "": prices } };
console.log(`📊 ตาราง "GRIPTOK PUSH-PULL (UV Printing)" จากเว็บ`);
console.log(`   ${tiers.map((t, i) => `${t.label}=฿${prices[i]}`).join(" · ")} (ต่อ ${UNIT})`);

/* ── 2. รูป/คลิปงานจริงจากแกลเลอรี PUSH-PULL บนหน้า /griptok ─────── */
/**
 * คัดจากแกลเลอรีใต้หัวข้อ GRIPTOK PUSH-PULL (25 ส.ค. 69):
 * ภาพนิ่ง 3 (ตัวขาวบนมือถือ / ตัวใสบนมือถือ / มาโครกลไกพับตัวใส) + คลิปงานจริง 2 (ตัวขาว/ตัวใส)
 */
const WIX_IMG = {
  white: "959b83_956916b1548b43fcbf48c9fa8907081d~mv2.jpg", // ตัวขาว ลายหมา-กระต่าย บนหลังมือถือ
  clear: "959b83_d00c90f9d853498587fcb2389eab4a53~mv2.jpg", // ตัวใส กางขาตั้งบนเคสใส
  clearMacro: "959b83_c46ab617b0a04438809ef4122690a571~mv2.jpg", // มาโครกลไกพับ ตัวใส
  posterWhite: "959b83_1b01bba66de44b44b2e5ec673e80a3b0f003.jpg", // เฟรมโปสเตอร์คลิปตัวขาว
  posterClear: "959b83_f666dbcb30894b0f9adc07bec726b1c5f003.jpg", // เฟรมโปสเตอร์คลิปตัวใส
};
/** คลิปตัวใสมีแค่ 480p (720p ตอบ 403) — เช็คแล้ว 25 ส.ค. 69 */
const WIX_VID = {
  clipWhite: "https://video.wixstatic.com/video/959b83_1b01bba66de44b44b2e5ec673e80a3b0/720p/mp4/file.mp4",
  clipClear: "https://video.wixstatic.com/video/959b83_f666dbcb30894b0f9adc07bec726b1c5/480p/mp4/file.mp4",
};

async function fetchBin(u: string): Promise<Buffer> {
  const res = await fetch(u);
  if (!res.ok) throw new Error(`โหลด ${u} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
const fetchWix = (wixId: string, size: string) =>
  fetchBin(`https://static.wixstatic.com/media/${wixId}/v1/fill/${size},al_c,q_88/file.jpg`);

async function put(file: string, buf: Buffer): Promise<string> {
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${file}`, buf, { contentType: file.endsWith(".mp4") ? "video/mp4" : "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

const art: Record<keyof typeof WIX_IMG, string> = {} as never;
for (const [name, wixId] of Object.entries(WIX_IMG) as [keyof typeof WIX_IMG, string][]) {
  // ภาพต้นทางเป็นแนวตั้ง 3:4 — เก็บสัดส่วนเดิม (fill กลางภาพ) ให้ตัวสินค้าไม่โดนครอปหาย
  const file = `pp-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}-${V}.jpg`;
  art[name] = await put(file, await fetchWix(wixId, "w_900,h_1200"));
}
const clips: Record<keyof typeof WIX_VID, string> = {} as never;
for (const [name, u] of Object.entries(WIX_VID) as [keyof typeof WIX_VID, string][]) {
  const file = `pp-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}-${V}.mp4`;
  clips[name] = await put(file, await fetchBin(u));
}
console.log(`🖼  สื่อจากหน้า /griptok — รูป ${Object.keys(art).length} + คลิป ${Object.keys(clips).length}`);

/* ── 3. ประกอบข้อมูลสินค้า ──────────────────────────────────────── */
const product: Product = {
  id: ID,
  slug: ID,
  name: NAME,
  category: "phone-gadget",
  price: prices[prices.length - 1],
  emoji: "🤳",
  gradient: "from-slate-100 to-blue-100",
  imageSrc: art.white,
  rating: 5,
  sold: 0,
  badge: "ใหม่",
  description:
    "Griptok Push-Pull ที่จับหลังมือถือแบบสไลด์ push-pull กดดัน-ดึงกางเป็นขาตั้งได้ในตัว " +
    "พิมพ์ลายตามสั่งด้วยระบบ UV Printing สีสวยคมชัด ขนาด 7.4×3.5 ซม. ตัวเรือนพลาสติกเลือกได้ " +
    "สีขาว/สีใส ไม่มีขั้นต่ำในการสั่งผลิต ยิ่งสั่งเยอะยิ่งถูก",
  highlights: [
    "สไลด์ push-pull กางเป็นขาตั้งมือถือได้ในตัว",
    "ขนาด 7.4×3.5 ซม. · วัสดุพลาสติก",
    "ตัวเรือนเลือกได้ 2 สี — ขาว | ใส",
    "1-10 ชิ้น คละลายได้ · 11 ชิ้นขึ้นไป คละลาย ขั้นต่ำลายละ 5 ชิ้น",
    `ยิ่งสั่งเยอะยิ่งถูก — เริ่มต้น ${prices[prices.length - 1]} บาท/ชิ้น`,
  ],
  // แกลเลอรีจำกัด 5 ช่อง (MAX_PHOTOS) — คลิปงานจริง 2 ตัวอยู่ช่อง 3/5 (ห้ามเป็นช่องแรก)
  images: [
    { emoji: "🤳", gradient: "from-slate-100 to-blue-100", label: "ตัวเรือนสีขาว พิมพ์ลาย UV", src: art.white },
    { emoji: "🫧", gradient: "from-sky-100 to-blue-200", label: "ตัวเรือนสีใส กางขาตั้งในตัว", src: art.clear },
    {
      emoji: "🎬",
      gradient: "from-violet-100 to-indigo-200",
      // ปุ่มรูปย่ออ่านออกเสียงว่า "ดูคลิป" + ชื่อนี้ต่อกัน — ตั้งชื่อให้ต่อแล้วเป็นประโยค
      label: "งานจริง — ตัวเรือนสีขาว พิมพ์ลายเต็มแผ่น",
      src: art.posterWhite,
      videoSrc: clips.clipWhite,
    },
    { emoji: "🔍", gradient: "from-slate-100 to-zinc-200", label: "กลไกสไลด์-พับ ขาตั้ง Push-Pull", src: art.clearMacro },
    {
      emoji: "🎬",
      gradient: "from-violet-100 to-indigo-200",
      label: "งานจริง — ตัวเรือนสีใส บนเคสมือถือ",
      src: art.posterClear,
      videoSrc: clips.clipClear,
    },
  ],
  pricing,
  options: [
    {
      label: "สีตัวเรือน",
      display: "cards",
      note: "ตัวเรือนพลาสติก เลือกได้ 2 สี — **สีขาว** ขับลายพิมพ์ให้สดชัด · **สีใส** ดูโปร่งเบา เข้ากับเคสใส",
      choices: [
        {
          name: "สีขาว",
          popular: true,
          imageSrc: art.white,
          desc: "ตัวเรือนสีขาวทึบ — พื้นขาวช่วยขับให้ลายพิมพ์สีสดคมชัด เหมาะกับลายการ์ตูน/โลโก้ทุกแบบ",
        },
        {
          name: "สีใส",
          imageSrc: art.clear,
          desc: "ตัวเรือนพลาสติกใสมองทะลุได้ — งานดูโปร่งเบา เข้ากับเคสใส เห็นกลไกสไลด์ด้านใน",
        },
      ],
    },
  ],
  terms: [
    "1-10 ชิ้น สามารถคละลายได้ · ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย ขั้นต่ำลายละ 5 ชิ้น",
    "ขนาดชิ้นงาน 7.4×3.5 ซม. · วัสดุพลาสติก · เลือกตัวเรือนได้ทั้งสีขาวและสีใส",
    "พิมพ์ลายด้วยระบบ UV Printing — ไฟล์นามสกุล .Ai .Psd .Png หรือพื้นหลังใส",
    "สั่งตั้งแต่ 24 ชิ้นขึ้นไป ฟรีแพ็คเกจ (คละลาย/ขั้นต่ำ 24 30 36 42 ... บวกเพิ่มทีละ 6 ชิ้น ไม่รับเศษที่หาร 6 ไม่ลงตัว)",
    "ทางร้านใช้สีระบบ RGB สีงานที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
  ].join("\n"),
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: [
        "• Griptok Push-Pull — ที่จับหลังมือถือแบบสไลด์ กดดัน-ดึงกางเป็นขาตั้งได้ในตัว · พิมพ์ระบบ UV Printing",
        "• ขนาดชิ้นงาน 7.4×3.5 ซม. · วัสดุพลาสติก",
        "• ตัวเรือนเลือกได้ 2 สี — สีขาว | สีใส",
        `• ราคาเริ่มต้น ${prices[prices.length - 1]} บาท/ชิ้น (สั่ง 5,000 ชิ้นขึ้นไป) · สั่งน้อยสุด 1 ชิ้นก็ได้ที่ ${prices[0]} บาท`,
        "• 1-10 ชิ้น คละลายได้ · 11 ชิ้นขึ้นไป คละลาย ขั้นต่ำลายละ 5 ชิ้น",
        "• สั่ง 24 ชิ้นขึ้นไป ฟรีแพ็คเกจ (คละลาย/ขั้นต่ำ 24 30 36 42 ... บวกเพิ่มทีละ 6 ชิ้น)",
      ].join("\n"),
    },
    {
      title: "วิธีสั่งงาน",
      text: "1. เลือกสีตัวเรือน (ขาว/ใส) และจำนวนที่ต้องการ\n2. แนบไฟล์ลายที่ต้องการพิมพ์ (.Ai .Psd .Png หรือพื้นหลังใส)\n3. ชำระเงินและรอทางร้านส่งแบบให้ยืนยันก่อนผลิต\n4. ตรวจสอบรายละเอียดงานให้ครบถ้วนก่อนแจ้งยืนยันผลิต",
    },
    {
      title: "การเตรียมไฟล์",
      text: "• ไฟล์นามสกุล .Ai .Psd .Png หรือไฟล์พื้นหลังใส\n• ทางร้านใช้สีระบบ RGB — สีงานสกรีนที่ได้อาจสว่างกว่าหรือดรอปลง ±5% ถึง ±15% ตามไฟล์งาน\n• ทางร้านมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องต่างกันประมาณ 5-10% หากผลิตคนละรอบ/คนละเครื่อง",
    },
    {
      title: "การรับประกันสินค้า",
      text: "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• สีหรืออะไหล่ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\nไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\nระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    },
  ],
  seo: {
    title: `รับทำ Griptok Push-Pull พิมพ์ลายตามสั่ง เริ่มต้น ${prices[prices.length - 1]} บาท ไม่มีขั้นต่ำ`,
    keywords: [
      "griptok push pull",
      "กริ๊บต๊อก push-pull",
      "รับทำ griptok",
      "griptok สั่งทำ",
      "ที่จับหลังมือถือ",
      "griptok ขาตั้งมือถือ",
      "griptok พิมพ์ลาย",
      "iDucky",
    ],
    description:
      `รับทำ Griptok Push-Pull ที่จับหลังมือถือแบบสไลด์ กางเป็นขาตั้งได้ในตัว พิมพ์ลายตามสั่งระบบ UV Printing ` +
      `ขนาด 7.4×3.5 ซม. ตัวเรือนสีขาว/สีใส เริ่มต้น ${prices[prices.length - 1]} บาท/ชิ้น ไม่มีขั้นต่ำ สั่ง 1 ชิ้นก็ทำได้`,
    faqs: [
      {
        q: "Griptok Push-Pull ราคาเท่าไหร่?",
        a: `สั่ง 1-10 ชิ้น ราคาชิ้นละ ${prices[0]} บาท ยิ่งสั่งเยอะยิ่งถูกลงตามขั้น จนถึง 5,000 ชิ้นขึ้นไปเหลือชิ้นละ ${prices[prices.length - 1]} บาท — ไม่มีขั้นต่ำในการสั่งผลิต`,
      },
      {
        q: "Griptok Push-Pull ต่างจาก Griptok ปกติยังไง?",
        a: "เป็นที่จับหลังมือถือทรงแคปซูลแบบสไลด์ (push-pull) กดดัน-ดึงออกกางเป็นขาตั้งมือถือได้ในตัว ขนาด 7.4×3.5 ซม. วัสดุพลาสติก ต่างจาก Griptok แบบกลมที่เป็นปุ่มกดยืด-หด",
      },
      {
        q: "เลือกสีตัวเรือนได้ไหม?",
        a: "เลือกได้ 2 สี — ตัวเรือนสีขาว (พื้นขาว ลายสีสดคมชัด) และตัวเรือนสีใส (มองทะลุได้ เข้ากับเคสใส) ราคาเท่ากันทั้งสองสี",
      },
      {
        q: "สั่งหลายลายรวมกันได้ไหม?",
        a: "จำนวน 1-10 ชิ้น คละลายได้อิสระ · ตั้งแต่ 11 ชิ้นขึ้นไป คละลายได้โดยสั่งขั้นต่ำลายละ 5 ชิ้น · สั่ง 24 ชิ้นขึ้นไปรับฟรีแพ็คเกจ",
      },
    ],
  },
  hidden: true,
};

const range = priceRange(product);
const saved: Product = {
  ...product,
  ...(hasQuoteOption(product) ? { quoteOption: true } : {}),
  priceMin: range.min,
  priceMax: range.max,
  savedAt: new Date().toISOString(),
};

console.log(`\n📦 ${saved.name} (${ID}) · สถานะ: ${saved.hidden ? "ฉบับร่าง" : "เผยแพร่"}`);
console.log(`   ราคา ฿${range.min}-${range.max}/${UNIT}`);
console.log(`   ตัวเลือก: ${saved.options.map((o) => `${o.label} ${o.choices.length} แบบ (การ์ดมีรูป)`).join(" · ")}`);
console.log(`   แกลเลอรี ${saved.images!.length} ช่อง (คลิป ${saved.images!.filter((i) => i.videoSrc).length}) · แท็บ ${saved.tabs!.length} · FAQ ${saved.seo!.faqs!.length} ข้อ`);

if (!WRITE) {
  console.log("\n(ยังไม่อัปสื่อ ไม่เขียนฐานข้อมูล — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}

/* ── 4. เขียนลง Supabase (คอลัมน์กระจก name/category/price ต้องไปด้วย) ── */
// กันเผลอทับสินค้าอื่นที่บังเอิญใช้ id เดียวกัน
const { data: row } = await sb.from("products").select("id,name,sort").eq("id", ID).maybeSingle();
if (row && row.name !== saved.name) throw new Error(`id ${ID} ถูกใช้โดยสินค้าอื่นอยู่: "${row.name}" — หยุดไว้ก่อน`);
const { data: maxRow } = await sb.from("products").select("sort").order("sort", { ascending: false }).limit(1);
const sort = (row?.sort as number | undefined) ?? ((maxRow?.[0]?.sort as number | undefined) ?? 0) + 1;

const { error } = await sb.from("products").upsert(
  {
    id: saved.id,
    name: saved.name,
    category: saved.category,
    price: saved.price,
    sold: saved.sold,
    featured: false,
    badge: saved.badge ?? null,
    sort,
    data: saved,
  },
  { onConflict: "id" }
);
if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);

/** update คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบก่อนประกาศสำเร็จ */
const { data: check, error: readErr } = await sb.from("products").select("data").eq("id", ID).single();
if (readErr) throw new Error(`อ่านกลับไม่ได้: ${readErr.message}`);
if ((check.data as Product).savedAt !== saved.savedAt) throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");

console.log(`\n✅ อัปสื่อ + บันทึกแล้ว — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
console.log(`   หน้าสินค้า: http://localhost:3005/products/${ID}`);
console.log(`   หน้าแก้ไข: http://localhost:3005/admin/products/${ID}`);
