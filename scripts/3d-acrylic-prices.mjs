/**
 * ราคา 3D Acrylic — อ่านสดจากเว็บตารางราคาของร้าน (ไม่พิมพ์ตัวเลขทับไว้ในโค้ด)
 *   https://www.iduckyofficial-pricelists.com/otheracrylicproducts  บล็อก "3D Acrylic"
 *
 * หน้านั้นมีสินค้าหลายตัว จึงยึด "หัวคอลัมน์ของตาราง" ไม่ใช่ลำดับ:
 *   ตารางฐาน   หัว = จำนวน | 2cm … 6cm   แถว = ช่วงจำนวน 4 ขั้น (1-10 / 11-30 / 31-50 / 50 ขึ้นไป)
 *   ADD ON     หัว = เพิ่มเติม | 2cm …    แถวชื่อ "(เรทราคาปลีก) อคล.พิเศษ" / "(เรทราคาส่ง) อคล.พิเศษ"
 *                                          และ "สกรีน 2 ด้าน" / "สกรีน 3 เลเยอร์" / "สกรีน 4 เลเยอร์"
 *
 * ⚠️ ตัวเลข ADD ON บนเว็บเป็น "ต่อชิ้น" แต่ 1 ชุดของสินค้านี้ = อะคริลิค 2 ชิ้น
 *    ตอนประกอบราคาต่อชุดจึงต้องคูณ 2 (ดู 3d-acrylic-price-sync.mjs)
 */
const HOST = "https://www.iduckyofficial-pricelists.com";
const PAGE = `${HOST}/otheracrylicproducts`;
const UA = "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)";

const decode = (s) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s) => decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** ทุกตารางในหน้า → แถว × ช่อง (ข้อความล้วน) */
function tablesOf(html) {
  return [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map((t) =>
    [...t[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
      [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
    )
  );
}

/** ตาราง → { [ชื่อแถว]: { "2cm": 120, … } } โดยคอลัมน์แรกของแต่ละแถวคือชื่อแถว */
function byRow(rows) {
  const head = rows[0].slice(1);
  const out = {};
  for (const r of rows.slice(1)) {
    const cells = {};
    head.forEach((h, i) => {
      const n = Number(String(r[i + 1] ?? "").replace(/[^\d.]/g, ""));
      if (Number.isFinite(n) && r[i + 1] !== "") cells[h] = n;
    });
    out[r[0]] = cells;
  }
  return out;
}

/**
 * ดึงราคา 3D Acrylic ทั้งชุด
 * @returns {Promise<{ sizes:string[], tiers:string[], base:Record<string,Record<string,number>>,
 *                     special:{retail:Record<string,number>, wholesale:Record<string,number>},
 *                     screen:Record<string,Record<string,number>> }>}
 */
export async function fetch3dAcrylicPrices() {
  const res = await fetch(PAGE, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`โหลดหน้าตารางราคาไม่ได้ — HTTP ${res.status}`);
  const tables = tablesOf(await res.text());

  // ── ตารางฐาน: หัวคอลัมน์ 2cm-6cm พอดี (ตารางอื่นในหน้าไล่ถึง 15-20cm) ──
  const baseRows = tables.find(
    (rows) => rows[0]?.slice(1).join(",") === "2cm,3cm,4cm,5cm,6cm" && rows.length >= 4
  );
  if (!baseRows) throw new Error("ไม่เจอตารางฐาน 3D Acrylic (หัว 2cm-6cm) — หน้าเว็บเปลี่ยนโครง");
  const tiers = baseRows.slice(1).map((r) => r[0]);
  const perTier = byRow(baseRows); // { "1-10 ชุด": {2cm:120,…}, … }
  const sizes = baseRows[0].slice(1);
  /** base[size] = [ราคาแต่ละช่วงจำนวน] เรียงตาม tiers */
  const base = {};
  for (const s of sizes) base[s] = tiers.map((t) => perTier[t][s]);

  // ── ADD ON: หาแถวตามชื่อ (อยู่คนละตาราง ไล่ขนาดยาวกว่าตารางฐาน) ──
  const findRow = (name) => {
    for (const rows of tables) {
      const hit = byRow(rows)[name];
      if (hit && Object.keys(hit).length) return hit;
    }
    return null;
  };
  const need = (name) => {
    const r = findRow(name);
    if (!r) throw new Error(`ไม่เจอแถว ADD ON "${name}" ในหน้าเว็บ`);
    return r;
  };

  return {
    sizes,
    tiers,
    base,
    special: { retail: need("(เรทราคาปลีก) อคล.พิเศษ"), wholesale: need("(เรทราคาส่ง) อคล.พิเศษ") },
    screen: {
      "สกรีน 2 ด้าน": need("สกรีน 2 ด้าน"),
      "สกรีน 3 เลเยอร์": need("สกรีน 3 เลเยอร์"),
      "สกรีน 4 เลเยอร์": need("สกรีน 4 เลเยอร์"),
    },
  };
}
