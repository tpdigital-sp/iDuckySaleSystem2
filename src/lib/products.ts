export type CategoryId =
  | "acrylic"
  | "acrylic-bending"
  | "standee"
  | "light"
  | "phone-gadget"
  | "mirror-magnet"
  | "sticker-paper"
  | "card-photo"
  | "banner"
  | "calendar-frame"
  | "home"
  | "bag"
  | "apparel"
  | "fabric"
  | "gifts";

export interface Category {
  id: CategoryId;
  name: string;
  nameEn: string;
  emoji: string;
  gradient: string;
  description: string;
}

export interface ProductOptionChoice {
  name: string;
  extra?: number;
}

export interface ProductOption {
  label: string;
  choices: ProductOptionChoice[];
  /**
   * ถ้ามี = กลุ่มนี้ "ลิงก์" กับคลังตัวเลือกกลาง (option preset) ตาม id นี้
   * ตอนอ่านข้อมูลจริง label+choices จะถูกแทนที่ด้วยของในคลัง (ดู resolveOptions)
   * choices ที่เก็บไว้เป็นสำเนาสำรอง (snapshot) เผื่อคลังถูกลบ · ไม่มี = กลุ่มอิสระ (พิมพ์เอง)
   */
  presetId?: string;
  /** รูปแบบแสดงบนหน้าร้าน: 'dropdown' = เมนูเลือก (เหมาะกับตัวเลือกเยอะ) · ไม่ระบุ/'pills' = ปุ่มแยก (ค่าเริ่มต้น) */
  display?: "pills" | "dropdown";
}

export interface ProductImage {
  emoji: string;
  gradient: string;
  label: string;
  /** รูปจริงที่อัปโหลด (data URL) — ถ้ามีจะแสดงแทนอีโมจิ+สีพื้น */
  src?: string;
}

/**
 * ท่อนเนื้อหา "รายละเอียดสินค้า" (body) — หัวข้อ + ข้อความ + รูปประกอบ สลับซ้าย/ขวาได้
 * ขึ้นบรรทัดใหม่ในข้อความได้ และบรรทัดที่ขึ้นต้นด้วย "• " จะแสดงเป็นรายการ
 */
export interface BodySection {
  heading: string;
  text: string;
  /** ไม่ใส่ = ท่อนข้อความอย่างเดียว */
  image?: ProductImage;
  /** ตำแหน่งรูป (ค่าเริ่มต้น: left) */
  align?: "left" | "right";
}

/**
 * กฎเงื่อนไขระหว่างตัวเลือก: เมื่อลูกค้าเลือก `when` แล้ว
 * กลุ่ม `limit.label` จะเหลือเฉพาะตัวเลือกใน `limit.allow`
 * เช่น เลือกกระดาษ Canvas → เคลือบ เหลือแค่ "ไม่เคลือบ"
 * ถ้ากลุ่มไหนเหลือตัวเลือกเดียว หน้าเว็บจะแสดงเป็นข้อความล็อกไว้ ลูกค้าสั่งผิดไม่ได้
 */
export interface OptionRule {
  when: { label: string; choice: string };
  limit: { label: string; allow: string[] };
}

/** ช่วงจำนวน (tier) สำหรับราคาขั้นบันได */
export interface PriceTier {
  /** จำนวนสูงสุดของช่วงนี้ (null = ช่วงสุดท้าย ขึ้นไปไม่จำกัด) */
  upTo: number | null;
  label: string;
}

/**
 * ตารางราคาแบบขั้นบันได (rate card): ราคา/หน่วย ขึ้นกับ (คอลัมน์ตัวเลือก × ช่วงจำนวน)
 * ยิ่งสั่งเยอะ ราคา/หน่วยยิ่งถูก · ถ้าสินค้าไม่มี pricing จะใช้ราคาเดียว (price + option.extra)
 */
export interface PriceMatrix {
  /** หน่วยนับ เช่น "แผ่น A3", "ชิ้น" */
  unit: string;
  /** กลุ่มตัวเลือกที่กำหนดคอลัมน์ (ค่าที่เลือกในกลุ่มเหล่านี้ = key ของคอลัมน์) */
  driverLabels: string[];
  tiers: PriceTier[];
  /** key = ค่าตัวเลือกของ driverLabels ต่อด้วย "│" → ราคา/หน่วยเรียงตาม tiers */
  cells: Record<string, number[]>;
}

export interface Product {
  id: string;
  name: string;
  category: CategoryId;
  price: number;
  oldPrice?: number;
  emoji: string;
  gradient: string;
  /** รูปหลักจริง (data URL) สำหรับการ์ดสินค้า — ถ้ามีจะแสดงแทนอีโมจิ+สีพื้น */
  imageSrc?: string;
  rating: number;
  sold: number;
  badge?: "ขายดี" | "ใหม่" | "ลดราคา";
  featured?: boolean;
  description: string;
  highlights: string[];
  options: ProductOption[];
  /** กฎจำกัดตัวเลือกข้ามกลุ่ม (ไม่มี = ทุกตัวเลือกใช้ร่วมกันได้หมด) */
  rules?: OptionRule[];
  images: ProductImage[];
  /** เนื้อหารายละเอียดสินค้าท้ายหน้า (แก้ได้จากหลังบ้าน) */
  body?: BodySection[];
  /** ตารางราคาขั้นบันได (ไม่มี = ใช้ราคาเดียว price + option.extra) */
  pricing?: PriceMatrix;
  /** ข้อมูล SEO/AEO (ไม่มี = ใช้ค่าจากชื่อ/รายละเอียดอัตโนมัติ) */
  seo?: ProductSeo;
  /** สถานะตรวจสอบหลังบ้าน — มีค่า = ทีมงานเช็คสินค้านี้แล้ว (ใช้กันเช็คซ้ำเมื่อหลายคนช่วยกัน) */
  reviewed?: ProductReview;
  /** ตัวเลือก "กำหนดขนาด/สเปกเอง" (custom) สำหรับงานสั่งทำนอกเหนือขนาดมาตรฐาน */
  custom?: CustomOption;
}

/**
 * ตัวเลือกกำหนดเอง (custom) — ลูกค้าระบุขนาดเอง (กว้าง × ยาว) สำหรับงานสั่งทำ
 * คิดราคาพิเศษนอกเหนือจากตารางราคาปกติ:
 *  - mode "area"  = คิดอัตโนมัติจากพื้นที่ (baseFee + ตร.ม. × ratePerSqm, ไม่ต่ำกว่า minPrice)
 *  - mode "quote" = ไม่คิดอัตโนมัติ ให้แอดมินตีราคา (ลูกค้าเห็น "สอบถามราคา")
 */
export interface CustomOption {
  enabled: boolean;
  /** ป้ายกลุ่ม เช่น "กำหนดขนาดเอง" */
  label: string;
  mode: "area" | "quote";
  /** หน่วยที่ลูกค้ากรอก (area) — ป้ายหน่วย เช่น "ซม." "หลา" (มาจากคลังหน่วย) */
  unit: string;
  /** ตัวแปลง 1 หน่วย → เมตร (area) เก็บติดสินค้าไว้ให้คิดพื้นที่ได้เองแม้คลังเปลี่ยน */
  unitToMeter?: number;
  /** ราคาต่อ 1 ตารางเมตร (area) */
  ratePerSqm?: number;
  /** ค่าธรรมเนียม/ค่าเริ่มต้นคงที่ บวกเพิ่มทุกชิ้น (area) */
  baseFee?: number;
  /** ราคาขั้นต่ำต่อชิ้น (area) */
  minPrice?: number;
  /** คำอธิบาย/เงื่อนไขให้ลูกค้าเห็น */
  note?: string;
}

/** ตัวแปลงหน่วยเดิม (backward-compat กับสินค้าที่บันทึกก่อนมีคลังหน่วย) */
const UNIT_TO_M: Record<string, number> = { cm: 0.01, inch: 0.0254, m: 1, "ซม.": 0.01, "นิ้ว": 0.0254, "เมตร": 1 };

/** ราคา/ชิ้น ของงานกำหนดขนาดเอง (area mode) จากกว้าง×ยาว ตามหน่วยที่ตั้งไว้ · quote คืน 0 */
export function customUnitPrice(c: CustomOption, width: number, height: number): number {
  if (c.mode !== "area" || !(width > 0) || !(height > 0)) return 0;
  const m = c.unitToMeter ?? UNIT_TO_M[c.unit] ?? 0.01;
  const areaSqm = width * m * (height * m);
  const raw = (c.baseFee ?? 0) + areaSqm * (c.ratePerSqm ?? 0);
  return Math.max(c.minPrice ?? 0, Math.round(raw));
}

/** อ่านค่า กว้าง×ยาว จากข้อความที่เก็บใน selections (เช่น "200×150") */
export function parseCustomDims(raw?: string): { w: number; h: number } | null {
  const m = (raw ?? "").match(/(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)/);
  return m ? { w: +m[1], h: +m[2] } : null;
}

/** บันทึกว่าใคร "ตรวจแล้ว" เมื่อไหร่ — โชว์เป็นป้ายในหลังบ้านให้ทีมงานไม่ทำงานซ้ำกัน */
export interface ProductReview {
  /** ชื่อผู้ตรวจล่าสุด (โหมดเดโมที่ไม่มีชื่อ = "ทีมงาน") */
  by: string;
  /** เวลาที่ตรวจ (ISO string) */
  at: string;
}

/** ข้อมูลปรับแต่งการค้นหา — SEO (meta) + AEO (คำถาม-คำตอบให้ AI/answer engine ดึงไปตอบ) */
export interface ProductSeo {
  /** meta/OG title (เว้นว่าง = ใช้ชื่อสินค้า) */
  title?: string;
  /** meta description (เว้นว่าง = ใช้ description) */
  description?: string;
  /** คำค้น (keywords) */
  keywords?: string[];
  /** คำถามพบบ่อย — แสดงหน้าสินค้า + ฝัง FAQPage JSON-LD ให้ answer engine */
  faqs?: { q: string; a: string }[];
}

export const CATEGORIES: Category[] = [
  { id: "acrylic", name: "พวงกุญแจ / อะคริลิค", nameEn: "Acrylic", emoji: "🔑", gradient: "from-sky-200 to-cyan-300", description: "พวงกุญแจอะคริลิค Jibbitz บัคเคิ้ล เขย่า แจกัน กิ๊บ และงานอะคริลิคทั่วไป" },
  { id: "acrylic-bending", name: "Acrylic Bending", nameEn: "Acrylic Bending", emoji: "🪟", gradient: "from-cyan-200 to-sky-300", description: "อะคริลิคดัดง้อ ตั้งโต๊ะ ที่วางมือถือ ตามสั่ง" },
  { id: "standee", name: "สแตนดี้", nameEn: "Standee", emoji: "🧍", gradient: "from-indigo-200 to-blue-300", description: "สแตนดี้อะคริลิคทุกแบบ ตั้งโต๊ะ จิ๋ว ตั้งมือถือ ฐานเพลง โยกเยก หมุน" },
  { id: "light", name: "สแตนดี้ฐานไฟ / LIGHT", nameEn: "Light", emoji: "💡", gradient: "from-blue-200 to-indigo-300", description: "สแตนดี้ฐานไฟ กล่องไฟ แท่งไฟ งานเรืองแสง" },
  { id: "phone-gadget", name: "เคส / มือถือ / แก็ดเจ็ต", nameEn: "Phone & Gadget", emoji: "📱", gradient: "from-slate-200 to-blue-200", description: "เคสมือถือ Airpods สายคล้อง Griptok Magsafe นาฬิกา Power Bank" },
  { id: "mirror-magnet", name: "กระจก / แม่เหล็ก", nameEn: "Mirror & Magnet", emoji: "🪞", gradient: "from-cyan-200 to-teal-200", description: "กระจกอะคริลิค แม่เหล็กติดตู้เย็น เข็มกลัด" },
  { id: "sticker-paper", name: "สติกเกอร์ / กระดาษ", nameEn: "Sticker & Paper", emoji: "🏷️", gradient: "from-sky-200 to-blue-200", description: "สติกเกอร์ Die-Cut งานกระดาษ พิมพ์ตามสั่ง" },
  { id: "card-photo", name: "Photocard / การ์ด / Shikishi", nameEn: "Card & Photo", emoji: "🎴", gradient: "from-pink-200 to-rose-200", description: "โฟโต้การ์ด ชิกิชิ Card Board Name Tag ที่คั่นหนังสือ" },
  { id: "banner", name: "โปสเตอร์ / Banner / ป้าย", nameEn: "Banner & Poster", emoji: "📢", gradient: "from-amber-200 to-yellow-200", description: "โปสเตอร์แขวนผนัง ป้าย Banner ไวนิล ผ้าเชียร์ สโลแกน" },
  { id: "calendar-frame", name: "ปฏิทิน / กรอบรูป", nameEn: "Calendar & Frame", emoji: "🖼️", gradient: "from-orange-200 to-amber-200", description: "ปฏิทิน กรอบรูป Canvas Frame" },
  { id: "home", name: "ของแต่งบ้าน / แก้ว / เมาส์แพด", nameEn: "Home", emoji: "🏠", gradient: "from-teal-200 to-cyan-200", description: "แก้วน้ำ แผ่นรองแก้ว เมาส์แพด พรมเช็ดเท้า ฟองน้ำ" },
  { id: "bag", name: "กระเป๋า", nameEn: "Bag", emoji: "👜", gradient: "from-emerald-200 to-teal-200", description: "กระเป๋าผ้าดิบ กระเป๋าโฮโล Laptop Bag Candybag" },
  { id: "apparel", name: "เสื้อผ้า / หมวก / ร่ม", nameEn: "Apparel", emoji: "👕", gradient: "from-green-200 to-emerald-300", description: "เสื้อสกรีน/ปัก หมวก ร่ม ปลอกคอ/เสื้อสัตว์เลี้ยง" },
  { id: "fabric", name: "ผ้า / หมอน / ผ้าห่ม", nameEn: "Fabric", emoji: "🧶", gradient: "from-emerald-200 to-teal-300", description: "ปลอกหมอน ผ้าห่ม ผ้าขนหนู ยางรัดผม ผ้าหลา" },
  { id: "gifts", name: "ของขวัญ / ปัก / ตุ๊กตา", nameEn: "Gifts", emoji: "🧸", gradient: "from-rose-200 to-pink-300", description: "อาร์มปัก ตุ๊กตาปัก ของขวัญชิ้นเล็ก" },
];

export function getCategory(id: CategoryId): Category {
  return CATEGORIES.find((c) => c.id === id)!;
}

// ── ชุดตัวเลือกร่วมของสินค้ากลุ่มกระดาษ (ดึงจาก iduckyprintsstudio.com จริง) ──
const PAPER_TYPES_POSTCARD: ProductOptionChoice[] = [
  { name: "กระดาษอาร์ตเกาหลี 300 แกรม" },
  { name: "Canvas Paper 260 แกรม" },
  { name: "Eggshell Paper 280 แกรม" },
  { name: "100 Pound Paper 300 แกรม" },
  { name: "E-Photo Paper 290 แกรม" },
  { name: "Stardream Crystal Paper 285 แกรม" },
  { name: "Stardream Paper 285 แกรม" },
  { name: "Extra Paper 260 แกรม" },
];
const PAPER_TYPES_POSTER: ProductOptionChoice[] = [
  { name: "กระดาษอาร์ตเกาหลี 130 แกรม" },
  { name: "กระดาษอาร์ตเกาหลี 150 แกรม" },
  { name: "กระดาษอาร์ตเกาหลี 300 แกรม" },
  { name: "กระดาษอาร์ตเกาหลี 400 แกรม" },
  { name: "Canvas Paper 260 แกรม" },
  { name: "Eggshell Paper 280 แกรม" },
  { name: "100 Pound Paper 300 แกรม" },
  { name: "E-Photo Paper 290 แกรม" },
  { name: "Stardream Crystal Paper 285 แกรม" },
  { name: "Stardream Paper 285 แกรม" },
  { name: "Extra Paper 260 แกรม" },
];
const COATINGS: ProductOptionChoice[] = [
  { name: "ไม่เคลือบ" },
  { name: "เคลือบด้าน" },
  { name: "เคลือบเงา" },
  { name: "Dot Hologram" },
  { name: "Crack Glass Hologram" },
  { name: "Rainbow Hologram" },
];
// กระดาษผิวพิเศษ/มีเท็กซ์เจอร์ เคลือบไม่ได้ → ล็อกเป็น "ไม่เคลือบ"
// (ยืนยันจริงกับ Canvas จากเว็บ; ที่เหลือเป็นการอนุมานตามชนิดกระดาษ — ปรับได้จากหลังบ้าน)
const NON_COATABLE_PAPERS = [
  "Canvas Paper 260 แกรม",
  "Eggshell Paper 280 แกรม",
  "Stardream Crystal Paper 285 แกรม",
  "Stardream Paper 285 แกรม",
  "Extra Paper 260 แกรม",
];
const PAPER_COATING_RULES: OptionRule[] = NON_COATABLE_PAPERS.map((paper) => ({
  when: { label: "ชนิดกระดาษ", choice: paper },
  limit: { label: "เคลือบ (เฉพาะด้านหน้า)", allow: ["ไม่เคลือบ"] },
}));

/**
 * สร้างตารางราคาขั้นบันไดของสินค้ากลุ่มกระดาษจาก rate card จริง (per แผ่น A3)
 * คอลัมน์ = ชนิดกระดาษ × เคลือบ · ราคาอิงหมวดเคลือบ (ไม่เคลือบ / เงา-ด้าน / พิเศษ)
 * (ตัวเลขจากเรทจริงกระดาษ 300 แกรม — ปรับต่อชนิดกระดาษได้จากหลังบ้าน)
 */
function makePaperPricing(papers: ProductOptionChoice[], coatings: ProductOptionChoice[]): PriceMatrix {
  const tiers: PriceTier[] = [
    { upTo: 10, label: "1-10 แผ่น A3" },
    { upTo: 49, label: "11-49 แผ่น A3" },
    { upTo: 99, label: "50-99 แผ่น A3" },
    { upTo: 499, label: "100-499 แผ่น A3" },
    { upTo: 1999, label: "500-1999 แผ่น A3" },
    { upTo: 4999, label: "2000-4999 แผ่น A3" },
    { upTo: null, label: "5000 แผ่น A3 ขึ้นไป" },
  ];
  const none = [80, 60, 55, 50, 45, 40, 35];
  const gloss = [90, 70, 65, 60, 55, 50, 45];
  const special = [110, 90, 85, 80, 80, 80, 80];
  const priceOf = (coating: string) =>
    coating === "ไม่เคลือบ"
      ? none
      : /Hologram|โฮโลแกรม|กลิสเตอร์|Stardust|Dust|พิเศษ|Glitter/i.test(coating)
        ? special
        : gloss;
  const cells: Record<string, number[]> = {};
  for (const p of papers) for (const c of coatings) cells[`${p.name}│${c.name}`] = priceOf(c.name);
  return { unit: "แผ่น A3", driverLabels: ["ชนิดกระดาษ", "เคลือบ (เฉพาะด้านหน้า)"], tiers, cells };
}

export const PRODUCTS: Product[] = [
  // ═══ นำเข้าจาก iduckyprintsstudio.com — ข้อมูลจริง (ชื่อ/ราคา/ตัวเลือกยืนยันจากหน้าเว็บ) ═══
  {
    id: "postcard-th",
    name: "POSTCARD / โปสการ์ด",
    category: "card-photo",
    price: 90,
    emoji: "💌",
    gradient: "from-rose-100 to-pink-200",
    rating: 4.9,
    sold: 958,
    badge: "ใหม่",
    featured: true,
    description:
      "โปสการ์ดพิมพ์ลายคุณภาพสูง เลือกกระดาษได้หลายชนิด พิมพ์ระบบดิจิทัลสีคมชัด เก็บสะสมหรือทำแจกเป็นของขวัญ (กระดาษผิวพิเศษบางชนิดเคลือบไม่ได้ ระบบจะล็อกให้อัตโนมัติ)",
    highlights: ["กระดาษให้เลือก 8 ชนิด", "เคลือบได้หลายแบบ รวมโฮโลแกรม", "พิมพ์ดิจิทัลสีคมชัด", "ผลิต 2-3 วันทำการ"],
    options: [
      {
        label: "ขนาด",
        choices: [
          { name: "4\"x6\" | แนวนอน (8 แผ่น /1A3)" },
          { name: "5\"x7\" | แนวนอน (4 แผ่น /1A3)" },
        ],
      },
      { label: "ชนิดกระดาษ", choices: PAPER_TYPES_POSTCARD },
      { label: "เคลือบ (เฉพาะด้านหน้า)", choices: COATINGS },
      {
        label: "ตัวเลือก",
        choices: [{ name: "ลายเดียว" }, { name: "คละลาย" }],
      },
    ],
    rules: PAPER_COATING_RULES,
    pricing: makePaperPricing(PAPER_TYPES_POSTCARD, COATINGS),
    images: [
      { emoji: "💌", gradient: "from-rose-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "🖋️", gradient: "from-pink-100 to-rose-200", label: "ด้านหลัง" },
      { emoji: "🎁", gradient: "from-amber-100 to-orange-200", label: "แพ็กใส่ซอง" },
    ],
    body: [
      {
        heading: "โปสการ์ด (POSTCARD)",
        text: "โปสการ์ดกำลังเป็นที่นิยมสำหรับเก็บสะสม\nทำเป็นรูปที่ระลึก หรือ ทำแจกเป็นของขวัญในโอกาสสำคัญๆ\nออกแบบได้เองตามต้องการ พิมพ์ด้วยเครื่องพิมพ์คุณภาพสูง",
        image: { emoji: "🖼️", gradient: "from-rose-100 to-pink-200", label: "ตัวอย่างโปสการ์ด" },
        align: "left",
      },
      {
        heading: "ขนาดโปสการ์ด (POSTCARD)",
        text: "• ขนาด 4\"x6\" | แนวนอน (8 แผ่น /1A3)\n• ขนาด 5\"x7\" | แนวนอน (4 แผ่น /1A3)",
        image: { emoji: "📐", gradient: "from-sky-100 to-blue-200", label: "เทียบขนาด" },
        align: "right",
      },
      {
        heading: "วิธีการออกแบบสั่งซื้อ โปสการ์ด",
        text: "สั่งซื้อสินค้าที่คุณชื่นชอบผ่านเว็บไซต์ได้ง่ายๆ ในไม่กี่นาที เพียงดูวิดีโอแนะนำนี้ แล้วทำตามได้เลย!",
        image: { emoji: "▶️", gradient: "from-amber-100 to-yellow-200", label: "วิดีโอแนะนำ" },
        align: "left",
      },
    ],
  },
  {
    id: "poster-th",
    name: "POSTER / โปสเตอร์",
    category: "card-photo",
    price: 40,
    emoji: "🖼️",
    gradient: "from-sky-100 to-blue-200",
    rating: 4.8,
    sold: 512,
    description:
      "โปสเตอร์พิมพ์ลายขนาด A3 เลือกกระดาษได้หลากหลายตั้งแต่อาร์ตบางไปจนถึงกระดาษหนาพิเศษ พิมพ์สีคมชัด ติดผนังแต่งห้องได้สวย",
    highlights: ["ขนาด A3 แนวตั้ง/แนวนอน", "กระดาษให้เลือกถึง 11 ชนิด", "เคลือบ/โฮโลแกรมได้", "พิมพ์ระบบดิจิทัล"],
    options: [
      {
        label: "ขนาด",
        choices: [{ name: "A3 | แนวตั้ง" }, { name: "A3 | แนวนอน" }],
      },
      { label: "ชนิดกระดาษ", choices: PAPER_TYPES_POSTER },
      { label: "เคลือบ (เฉพาะด้านหน้า)", choices: COATINGS },
    ],
    rules: PAPER_COATING_RULES,
    pricing: makePaperPricing(PAPER_TYPES_POSTER, COATINGS),
    images: [
      { emoji: "🖼️", gradient: "from-sky-100 to-blue-200", label: "ด้านหน้า" },
      { emoji: "🧱", gradient: "from-blue-100 to-cyan-200", label: "ติดผนัง" },
    ],
  },
  {
    id: "mug-11oz",
    name: "MUG / แก้วมัค 11 oz",
    category: "home",
    price: 160,
    emoji: "☕",
    gradient: "from-sky-100 to-blue-200",
    rating: 4.9,
    sold: 1284,
    badge: "ขายดี",
    featured: true,
    description:
      "แก้วมัคเซรามิก 11 ออนซ์ พิมพ์ลายรอบใบด้วยระบบซับลิเมชัน สีสดไม่ลอก เข้าไมโครเวฟได้ เลือกเนื้อแก้วได้หลายแบบ",
    highlights: ["เซรามิกเกรดดี 11 oz", "พิมพ์รอบใบ 360°", "เข้าไมโครเวฟได้", "สีไม่ลอก ล้างได้ปกติ"],
    options: [
      {
        label: "ตัวเลือก",
        choices: [{ name: "สีใส" }, { name: "สีขาวเงา" }, { name: "สีขาวขุ่น" }],
      },
    ],
    images: [
      { emoji: "☕", gradient: "from-sky-100 to-blue-200", label: "ด้านหน้า" },
      { emoji: "🍵", gradient: "from-blue-100 to-indigo-200", label: "ด้านข้าง" },
    ],
  },
  {
    id: "tshirt-th",
    name: "T-SHIRT / เสื้อยืด",
    category: "fabric",
    price: 375,
    emoji: "👕",
    gradient: "from-emerald-100 to-teal-200",
    rating: 4.9,
    sold: 2431,
    featured: true,
    description:
      "เสื้อยืดเนื้อผ้าดี พิมพ์ลายคมชัดสีสด ใส่สบายระบายอากาศ มีไซซ์ให้เลือกครบตั้งแต่ S ถึง XXXL",
    highlights: ["เนื้อผ้านุ่มใส่สบาย", "พิมพ์ลายคมชัด ไม่ลอก", "มีไซซ์ S ถึง XXXL", "ซักเครื่องได้"],
    options: [
      {
        label: "ไซส์",
        choices: [{ name: "S" }, { name: "M" }, { name: "L" }, { name: "XL" }, { name: "XXL" }, { name: "XXXL" }],
      },
    ],
    images: [
      { emoji: "👕", gradient: "from-emerald-100 to-teal-200", label: "ด้านหน้า" },
      { emoji: "🧵", gradient: "from-teal-100 to-cyan-200", label: "เนื้อผ้า" },
    ],
  },
  {
    id: "casephone-clear",
    name: "CASE PHONE / เคสใสพรีเมี่ยม",
    category: "phone-gadget",
    price: 350,
    emoji: "📱",
    gradient: "from-violet-100 to-purple-200",
    rating: 4.8,
    sold: 1567,
    badge: "ขายดี",
    featured: true,
    description:
      "เคสใสพรีเมี่ยมพิมพ์ลายคมชัด สีสวยสดไม่ลอก รองรับไอโฟนหลายรุ่นตั้งแต่ iPhone 11 ถึง iPhone 16 Pro Max",
    highlights: ["เคสใสเนื้อพรีเมี่ยม", "รองรับ iPhone 21 รุ่น", "พิมพ์ลายคมชัด ไม่ลอก", "กันกระแทกรอบตัวเครื่อง"],
    options: [
      {
        label: "รุ่นเคสมือถือ",
        choices: [
          { name: "iPhone 11" }, { name: "iPhone 11 Pro" }, { name: "iPhone 12" }, { name: "iPhone 12 Mini" },
          { name: "iPhone 12 Pro Max" }, { name: "iPhone 13" }, { name: "iPhone 13 Mini" }, { name: "iPhone 13 Pro" },
          { name: "iPhone 13 Pro Max" }, { name: "iPhone 14" }, { name: "iPhone 14 Plus" }, { name: "iPhone 14 Pro" },
          { name: "iPhone 14 Pro Max" }, { name: "iPhone 15" }, { name: "iPhone 15 Plus" }, { name: "iPhone 15 Pro" },
          { name: "iPhone 15 Pro Max" }, { name: "iPhone 16" }, { name: "iPhone 16 Pro" }, { name: "iPhone 16 Plus" },
          { name: "iPhone 16 Pro Max" },
        ],
      },
    ],
    images: [
      { emoji: "📱", gradient: "from-violet-100 to-purple-200", label: "ด้านหลัง" },
      { emoji: "🌈", gradient: "from-pink-100 to-violet-200", label: "หลายลาย" },
    ],
  },
  {
    id: "canvasframe-th",
    name: "CANVAS FRAME / กรอบรูปแคนวาส",
    category: "home",
    price: 550,
    emoji: "🖼️",
    gradient: "from-orange-100 to-amber-200",
    rating: 4.9,
    sold: 876,
    featured: true,
    description:
      "กรอบรูปแคนวาสคุณภาพสูง พิมพ์ภาพคมชัด สีสด ไม่ซีดจาง ขึงบนเฟรมไม้อย่างดี แขวนได้ทันที",
    highlights: ["ผ้าใบแคนวาสเกรดแกลเลอรี", "มี 5 ขนาดให้เลือก", "พิมพ์ภาพคมชัดสีสด", "แขวนได้ทันที"],
    options: [
      {
        label: "ขนาด",
        choices: [
          { name: "30x30 | จตุรัส" }, { name: "30x40 | แนวตั้ง" },
          { name: "40x60 | แนวตั้ง" }, { name: "50x70 | แนวตั้ง" }, { name: "60x80 | แนวตั้ง" },
        ],
      },
    ],
    images: [
      { emoji: "🖼️", gradient: "from-orange-100 to-amber-200", label: "ด้านหน้า" },
      { emoji: "🛋️", gradient: "from-amber-100 to-yellow-200", label: "แขวนผนัง" },
    ],
  },
  {
    id: "broochbadge-th",
    name: "Brooch Badge / เข็มกลัดพลาสติก",
    category: "gifts",
    price: 270,
    emoji: "📍",
    gradient: "from-rose-100 to-pink-200",
    rating: 4.8,
    sold: 1876,
    featured: true,
    description:
      "เข็มกลัดพลาสติกพิมพ์ลาย เลือกทรงและการเคลือบได้หลากหลายแบบ รวมโฮโลแกรมและกลิตเตอร์ ขายเป็นชุด",
    highlights: ["ทรงกลม/หัวใจ หลายขนาด", "เคลือบให้เลือกถึง 12 แบบ", "ขายเป็นชุด 5-10 ชิ้น", "เข็มกลัดนิรภัยด้านหลัง"],
    options: [
      {
        label: "ขนาด & จำนวน",
        choices: [
          { name: "ทรงกลม 25 mm - ชุดละ 10 ชิ้น" },
          { name: "ทรงกลม 32 mm - ชุดละ 10 ชิ้น" },
          { name: "ทรงกลม 44 mm - ชุดละ 5 ชิ้น" },
          { name: "ทรงกลม 58 mm - ชุดละ 5 ชิ้น" },
          { name: "หัวใจ 57x53mm - ชุดละ 5 ชิ้น" },
        ],
      },
      {
        label: "การเคลือบ",
        choices: [
          { name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" },
          { name: "กลิสเตอร์" }, { name: "โฮโลแกรมดาว" }, { name: "เคลือบเหลี่ยม" },
          { name: "เคลือบหัวใจ" }, { name: "เคลือบรุ้ง" }, { name: "เคลือบจุด" },
          { name: "เคลือบทราย" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" },
        ],
      },
    ],
    images: [
      { emoji: "📍", gradient: "from-rose-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "🧷", gradient: "from-pink-100 to-fuchsia-200", label: "ด้านหลัง" },
    ],
  },
  {
    id: "tote-canvas",
    name: "TOTE / กระเป๋าผ้าดิบ",
    category: "fabric",
    price: 220,
    emoji: "👜",
    gradient: "from-teal-100 to-emerald-200",
    rating: 4.8,
    sold: 1103,
    featured: true,
    description:
      "กระเป๋าผ้าดิบพิมพ์ลาย มีหลายขนาด ทั้งแบบแบนและแบบมีก้น รับน้ำหนักได้ดี ใช้ซ้ำได้ทุกวัน",
    highlights: ["ผ้าดิบเนื้อหนา", "มี 5 ขนาดให้เลือก", "รองรับภาพไม่เกิน A4", "ซักได้ ใช้ซ้ำได้"],
    options: [
      {
        label: "ขนาด",
        choices: [
          { name: "35x40 cm (ภาพไม่เกิน A4)" },
          { name: "35x40x10 cm (ภาพไม่เกิน A4)" },
          { name: "40x30x10 cm (ภาพไม่เกิน A4)" },
          { name: "45x35x15 cm (ภาพไม่เกิน A4)" },
          { name: "46x37x12 cm (ภาพไม่เกิน A4)" },
        ],
      },
    ],
    images: [
      { emoji: "👜", gradient: "from-teal-100 to-emerald-200", label: "ด้านหน้า" },
      { emoji: "🌿", gradient: "from-emerald-100 to-green-200", label: "ตอนสะพาย" },
    ],
  },
  {
    id: "griptok-th",
    name: "GripTok & Magsafe Griptok",
    category: "phone-gadget",
    price: 80,
    emoji: "💍",
    gradient: "from-purple-100 to-fuchsia-200",
    rating: 4.7,
    sold: 528,
    badge: "ใหม่",
    description:
      "กริ๊บต๊อกติดหลังมือถือพิมพ์ลายของคุณ มีทั้งแบบธรรมดาและแบบ Magsafe ถือมือถนัดขึ้น ตั้งวางดูหนังได้",
    highlights: ["ทั้งแบบธรรมดา/Magsafe", "ถือมือถนัดขึ้น", "ใช้เป็นขาตั้งได้", "พิมพ์ลายคมชัด"],
    options: [
      {
        label: "ตัวเลือก",
        choices: [
          { name: "Griptok ทรงกลม ฐานสีดำ" },
          { name: "Griptok ทรงกลม ฐานสีขาว" },
          { name: "Griptok Magsafe ทรงกลม (A)" },
          { name: "Griptok Magsafe ทรงรี (A)" },
        ],
      },
    ],
    images: [
      { emoji: "💍", gradient: "from-purple-100 to-fuchsia-200", label: "ด้านหน้า" },
      { emoji: "📱", gradient: "from-fuchsia-100 to-pink-200", label: "ติดบนมือถือ" },
    ],
  },
  {
    id: "photocard-paper",
    name: "Photo Card / โฟโต้การ์ด",
    category: "card-photo",
    price: 130,
    emoji: "🎴",
    gradient: "from-pink-100 to-rose-200",
    rating: 4.8,
    sold: 640,
    description:
      "โฟโต้การ์ดกระดาษพิมพ์รูปคมชัด เลือกเคลือบได้หลายแบบรวมโฮโลแกรม พิมพ์ได้ทั้ง 1 และ 2 ด้าน สะสมหรือแลกกันสนุก",
    highlights: ["พิมพ์รูปคมชัดสีสด", "เคลือบได้ 6 แบบ รวมโฮโลแกรม", "พิมพ์ 1 หรือ 2 ด้าน"],
    options: [
      { label: "เคลือบ (เฉพาะด้านหน้า)", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "Dot Hologram" }, { name: "Hologram เหลี่ยม" }, { name: "Rainbow Hologram" }] },
      { label: "ตัวเลือก", choices: [{ name: "พิมพ์ 1 ด้าน" }, { name: "พิมพ์ 2 ด้าน" }] },
    ],
    images: [
      { emoji: "🎴", gradient: "from-pink-100 to-rose-200", label: "ด้านหน้า" },
      { emoji: "🌈", gradient: "from-fuchsia-100 to-pink-200", label: "โฮโลแกรม" },
    ],
  },
  {
    id: "shape-sticker",
    name: "SHAPE STICKER / สติ๊กเกอร์รูปทรง",
    category: "card-photo",
    price: 90,
    emoji: "✨",
    gradient: "from-cyan-100 to-sky-200",
    rating: 4.9,
    sold: 1420,
    badge: "ขายดี",
    description:
      "สติ๊กเกอร์ไดคัทรูปทรงต่างๆ ทั้งกลม หัวใจ ดาว ก้อนเมฆ ดอกไม้ กันน้ำ ติดทน เลือกเคลือบได้หลายแบบ",
    highlights: ["9 รูปทรงให้เลือก", "6 แผ่น/1A3", "เคลือบได้ 6 แบบ"],
    options: [
      { label: "ขนาด", choices: [
        { name: "ทรงกลม 5x5cm (4 ดวง) | 6 แผ่น/1A3" },
        { name: "ทรงกลม 3x3cm (9 ดวง) | 6 แผ่น/1A3" },
        { name: "ก้อนเมฆ 3.5x2.5cm (9 ดวง) | 6 แผ่น/1A3" },
        { name: "ดอกไม้ 5x5cm (4 ดวง) | 6 แผ่น/1A3" },
        { name: "กรอบรูป 3x3cm (9 ดวง) | 6 แผ่น/1A3" },
        { name: "หัวใจ 3.5x3.5cm (9 ดวง) | 6 แผ่น/1A3" },
        { name: "สี่เหลี่ยม 5x5cm (4 ดวง) | 6 แผ่น/1A3" },
        { name: "สี่เหลี่ยม 3x3cm (9 ดวง) | 6 แผ่น/1A3" },
        { name: "ดาว 5x4.78cm (4 ดวง) | 6 แผ่น/1A3" },
      ]},
      { label: "การเคลือบ", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "✨", gradient: "from-cyan-100 to-sky-200", label: "ตัวอย่าง" },
      { emoji: "💻", gradient: "from-slate-100 to-slate-200", label: "ติดใช้งาน" },
    ],
  },
  {
    id: "giveaway-sticker",
    name: "GIVEAWAY STICKER / สติ๊กเกอร์แจก",
    category: "card-photo",
    price: 90,
    emoji: "🎉",
    gradient: "from-sky-100 to-cyan-200",
    rating: 4.7,
    sold: 720,
    description:
      "สติ๊กเกอร์แจกจำนวนเยอะ 35 ดวง/แผ่น เหมาะทำของแถมงานอีเวนต์หรือแฟนคลับ เลือกรูปทรงและเคลือบได้",
    highlights: ["35 ดวง/แผ่น คุ้มมาก", "4 รูปทรงให้เลือก", "เคลือบได้ 6 แบบ"],
    options: [
      { label: "รูปแบบ", choices: [{ name: "ทรงกลม 4x4cm (35 ดวง)" }, { name: "หัวใจ 4x3.5cm (35 ดวง)" }, { name: "สี่เหลี่ยม 4x4cm (35 ดวง)" }, { name: "ดาว 4x4.2cm (35 ดวง)" }] },
      { label: "การเคลือบ", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "🎉", gradient: "from-sky-100 to-cyan-200", label: "ตัวอย่าง" },
      { emoji: "🎁", gradient: "from-cyan-100 to-teal-200", label: "ของแถม" },
    ],
  },
  {
    id: "polaroid-th",
    name: "POLAROID / โพลารอยด์",
    category: "card-photo",
    price: 90,
    emoji: "📷",
    gradient: "from-amber-100 to-yellow-200",
    rating: 4.8,
    sold: 830,
    description:
      "โพลารอยด์พิมพ์รูปสไตล์วินเทจ เลือกกระดาษได้หลายชนิด เคลือบสวยหลายแบบ เก็บความทรงจำน่ารักๆ",
    highlights: ["สไตล์โพลารอยด์วินเทจ", "กระดาษให้เลือก 8 ชนิด", "เคลือบสวยหลายแบบ"],
    options: [
      { label: "ชนิดกระดาษ", choices: PAPER_TYPES_POSTCARD },
      { label: "การเคลือบ", choices: [{ name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "📷", gradient: "from-amber-100 to-yellow-200", label: "ด้านหน้า" },
      { emoji: "🖼️", gradient: "from-yellow-100 to-orange-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "coaster-ceramic",
    name: "Coaster Ceramic / ที่รองแก้วหิน",
    category: "home",
    price: 120,
    emoji: "⭕",
    gradient: "from-stone-100 to-stone-200",
    rating: 4.7,
    sold: 410,
    description:
      "ที่รองแก้วแผ่นแร่หินธรรมชาติ ซึมซับน้ำดี พิมพ์ลายคมชัดสีไม่ซีด เลือกได้ 3 รูปทรง",
    highlights: ["แผ่นแร่หินซึมซับน้ำดี", "พิมพ์ลายคมชัด ไม่ซีด", "มี 3 รูปทรง"],
    options: [
      { label: "รูปทรง", choices: [{ name: "ทรงกลม" }, { name: "ทรงสี่เหลี่ยม" }, { name: "ทรงหกเหลี่ยม" }] },
    ],
    images: [
      { emoji: "⭕", gradient: "from-stone-100 to-stone-200", label: "ด้านหน้า" },
      { emoji: "☕", gradient: "from-amber-100 to-stone-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "blanket-th",
    name: "Blanket / ผ้าห่ม",
    category: "fabric",
    price: 340,
    emoji: "🧸",
    gradient: "from-green-100 to-emerald-200",
    rating: 4.9,
    sold: 507,
    badge: "ขายดี",
    featured: true,
    description:
      "ผ้าห่มพิมพ์ลายเต็มผืน เนื้อนุ่มอุ่นสบาย พิมพ์คมชัดสีติดทนไม่ซีด มีหลายขนาดตั้งแต่ผืนเล็กพกพาถึงขนาดเตียง",
    highlights: ["เนื้อนุ่มอุ่นสบาย", "พิมพ์เต็มผืน สีติดทน", "มี 4 ขนาด", "ซักเครื่องได้"],
    options: [
      { label: "ขนาด", choices: [{ name: "76x100 cm" }, { name: "100x100 cm" }, { name: "150x100 cm" }, { name: "150x200 cm" }] },
    ],
    images: [
      { emoji: "🧸", gradient: "from-green-100 to-emerald-200", label: "เต็มผืน" },
      { emoji: "🛌", gradient: "from-emerald-100 to-teal-200", label: "บนเตียง" },
    ],
  },
  {
    id: "round-mirror",
    name: "Round Mirror / กระจกทรงกลม",
    category: "gifts",
    price: 250,
    emoji: "🪞",
    gradient: "from-fuchsia-100 to-pink-200",
    rating: 4.7,
    sold: 445,
    description:
      "กระจกพกพาทรงกลมพิมพ์ลาย มีทั้งแบบพวงกุญแจและกระจกกลม ขายเป็นชุด เลือกเคลือบได้หลายแบบ",
    highlights: ["แบบพวงกุญแจ/กระจกกลม", "ขายเป็นชุด 5 ชิ้น", "เคลือบได้ 6 แบบ"],
    options: [
      { label: "ขนาด", choices: [{ name: "58mm (พวงกุญแจกระจก) - ชุดละ 5 ชิ้น" }, { name: "58mm (กระจกกลม) - ชุดละ 5 ชิ้น" }, { name: "75mm (กระจกกลม) - ชุดละ 5 ชิ้น" }] },
      { label: "การเคลือบ", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Starduct" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "🪞", gradient: "from-fuchsia-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "💄", gradient: "from-pink-100 to-rose-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "photocard-pet",
    name: "Photo Card PET / โฟโต้การ์ด PET",
    category: "card-photo",
    price: 240,
    emoji: "🎴",
    gradient: "from-cyan-100 to-sky-200",
    rating: 4.8,
    sold: 520,
    description:
      "โฟโต้การ์ดเนื้อพลาสติก PET กันน้ำ ทนทานกว่ากระดาษ เลือกพลาสติกขาว/ใส พิมพ์ได้ 1-2 ด้าน เหมาะทำการ์ดสะสม",
    highlights: ["เนื้อ PET กันน้ำ ทนทาน", "เลือกพลาสติกขาว/ใส", "พิมพ์ 1 หรือ 2 ด้าน"],
    options: [
      { label: "ชนิด PET", choices: [{ name: "พลาสติกขาว" }, { name: "พลาสติกใส" }] },
      { label: "ตัวเลือก", choices: [{ name: "พิมพ์ 1 ด้าน" }, { name: "พิมพ์ 2 ด้าน" }] },
    ],
    images: [
      { emoji: "🎴", gradient: "from-cyan-100 to-sky-200", label: "ด้านหน้า" },
      { emoji: "💧", gradient: "from-sky-100 to-blue-200", label: "กันน้ำ" },
    ],
  },
  {
    id: "photocard-pvc",
    name: "Photocard PVC / บัตรพลาสติก",
    category: "card-photo",
    price: 33,
    emoji: "💳",
    gradient: "from-blue-100 to-indigo-200",
    rating: 4.7,
    sold: 610,
    description:
      "โฟโต้การ์ด PVC เนื้อบัตรพลาสติกแข็งแรง เลือกบัตรขาวหรือใส วางได้ทั้งแนวตั้ง-นอน พิมพ์ 1-2 ด้าน",
    highlights: ["เนื้อบัตร PVC แข็งแรง", "เลือกขาว/ใส", "แนวตั้ง/แนวนอน · พิมพ์ 1-2 ด้าน"],
    options: [
      { label: "ชนิด PVC", choices: [{ name: "บัตรพลาสติกขาว" }, { name: "บัตรพลาสติกใส (สกรีนบน)" }] },
      { label: "ตำแหน่ง", choices: [{ name: "แนวตั้ง" }, { name: "แนวนอน" }] },
      { label: "ตัวเลือก", choices: [{ name: "พิมพ์ 1 ด้าน" }, { name: "พิมพ์ 2 ด้าน" }] },
    ],
    images: [
      { emoji: "💳", gradient: "from-blue-100 to-indigo-200", label: "ด้านหน้า" },
      { emoji: "🪪", gradient: "from-indigo-100 to-violet-200", label: "ด้านหลัง" },
    ],
  },
  {
    id: "photobooth-sticker",
    name: "PHOTO BOOTH (สติ๊กเกอร์)",
    category: "card-photo",
    price: 90,
    emoji: "📸",
    gradient: "from-pink-100 to-rose-200",
    rating: 4.8,
    sold: 480,
    description:
      "โฟโต้บูธสตริปส์แบบสติ๊กเกอร์ พิมพ์ภาพต่อเนื่องสไตล์ตู้ถ่ายรูป เลือกขนาดและเคลือบได้ ติดสะสมน่ารัก",
    highlights: ["สไตล์ตู้โฟโต้บูธ", "2 ขนาดให้เลือก", "เคลือบได้ 6 แบบ"],
    options: [
      { label: "ขนาด", choices: [{ name: "4.2x12cm | 20 ใบ" }, { name: "5x15.2cm | 12 ใบ" }] },
      { label: "การเคลือบ", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "📸", gradient: "from-pink-100 to-rose-200", label: "สติ๊กเกอร์" },
      { emoji: "🎞️", gradient: "from-rose-100 to-pink-200", label: "สตริปส์" },
    ],
  },
  {
    id: "photobooth-paper",
    name: "PHOTO BOOTH (กระดาษ)",
    category: "card-photo",
    price: 90,
    emoji: "📸",
    gradient: "from-amber-100 to-orange-200",
    rating: 4.8,
    sold: 430,
    description:
      "โฟโต้บูธสตริปส์แบบกระดาษ เลือกกระดาษได้หลายชนิด พิมพ์ภาพต่อเนื่องสไตล์ตู้ถ่ายรูป เคลือบสวยหลายแบบ",
    highlights: ["กระดาษให้เลือก 8 ชนิด", "2 ขนาดให้เลือก", "เคลือบสวยหลายแบบ"],
    options: [
      { label: "ขนาด", choices: [{ name: "4.2x12cm | 20 ใบ" }, { name: "5x15.2cm | 12 ใบ" }] },
      { label: "ชนิดกระดาษ", choices: PAPER_TYPES_POSTCARD },
      { label: "การเคลือบ", choices: [{ name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "📸", gradient: "from-amber-100 to-orange-200", label: "กระดาษ" },
      { emoji: "🎞️", gradient: "from-orange-100 to-amber-200", label: "สตริปส์" },
    ],
  },
  {
    id: "card-sticker",
    name: "CARD STICKER / สติ๊กเกอร์ติดบัตร",
    category: "card-photo",
    price: 90,
    emoji: "💳",
    gradient: "from-violet-100 to-purple-200",
    rating: 4.7,
    sold: 560,
    description:
      "สติ๊กเกอร์ติดบัตร (BTS/บัตรประชาชน) พิมพ์ลายคมชัด กันน้ำ เลือกการตัดมุมมน/เหลี่ยม และเคลือบได้หลายแบบ",
    highlights: ["ติดบัตรได้พอดี กันน้ำ", "ตัดมุมมน/มุมเหลี่ยม", "เคลือบได้ 6 แบบ"],
    options: [
      { label: "การตัด", choices: [{ name: "แบบมุมมน" }, { name: "แบบมุมเหลี่ยม" }] },
      { label: "การเคลือบ", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "💳", gradient: "from-violet-100 to-purple-200", label: "ด้านหน้า" },
      { emoji: "🏷️", gradient: "from-purple-100 to-fuchsia-200", label: "ติดบัตร" },
    ],
  },
  {
    id: "banner-th",
    name: "Banner / แบนเนอร์",
    category: "card-photo",
    price: 75,
    emoji: "🚩",
    gradient: "from-orange-100 to-red-100",
    rating: 4.6,
    sold: 240,
    description:
      "แบนเนอร์/สโลแกนพิมพ์กระดาษอาร์ตมัน สีคมชัด เลือกความหนากระดาษและเคลือบได้ เหมาะทำป้ายเชียร์หรือของแฟนคลับ",
    highlights: ["กระดาษอาร์ตมัน 3 ความหนา", "พิมพ์สีคมชัด", "เคลือบ/โฮโลแกรมได้"],
    options: [
      { label: "ชนิดกระดาษ", choices: [{ name: "อาร์ตมัน 157 แกรม" }, { name: "อาร์ตมัน 210 แกรม" }, { name: "อาร์ตมัน 300 แกรม" }] },
      { label: "เคลือบ (เฉพาะด้านหน้า)", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "กลิสเตอร์" }, { name: "โฮโลแกรมดาว" }, { name: "โฮโลแกรมจุด" }] },
    ],
    images: [
      { emoji: "🚩", gradient: "from-orange-100 to-red-100", label: "ด้านหน้า" },
      { emoji: "📣", gradient: "from-amber-100 to-orange-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "packaging-paper",
    name: "PACKAGING PAPER / กระดาษรองหลัง",
    category: "card-photo",
    price: 45,
    emoji: "📦",
    gradient: "from-stone-100 to-stone-200",
    rating: 4.6,
    sold: 190,
    description:
      "แพ็คเกจกระดาษรองหลังพิมพ์ลาย เลือกได้หลายขนาด เหมาะรองหลังการ์ด/สินค้าเพื่อเพิ่มความสวยงามและแบรนด์ดิ้ง",
    highlights: ["มี 7 ขนาดให้เลือก", "พิมพ์ลายคมชัด", "เพิ่มแบรนด์ดิ้งให้แพ็กเกจ"],
    options: [
      { label: "ขนาด", choices: [
        { name: "9x9cm (15 ใบ/1A3)" }, { name: "7x7cm (24 ใบ/1A3)" }, { name: "6.3x10.5cm (14 ใบ/1A3)" },
        { name: "7.5x10cm (12 ใบ/1A3)" }, { name: "9x15cm (6 ใบ/1A3)" }, { name: "10x15cm (5 ใบ/1A3)" },
        { name: "14x20.5cm (4 ใบ/1A3)" },
      ]},
    ],
    images: [
      { emoji: "📦", gradient: "from-stone-100 to-stone-200", label: "ตัวอย่าง" },
      { emoji: "🎀", gradient: "from-rose-100 to-pink-200", label: "รองหลังการ์ด" },
    ],
  },
  {
    id: "calendar-desktop",
    name: "CALENDAR DESKTOP / ปฏิทินตั้งโต๊ะ",
    category: "card-photo",
    price: 220,
    emoji: "📅",
    gradient: "from-sky-100 to-blue-200",
    rating: 4.8,
    sold: 690,
    badge: "ขายดี",
    featured: true,
    description:
      "ปฏิทินตั้งโต๊ะพิมพ์ลายของคุณ 14 หน้า เลือกปีและแนวตั้ง/นอนได้ พิมพ์คมชัด ของพรีเมียมสำหรับแจกหรือใช้เอง",
    highlights: ["14 หน้า 8 แผ่น", "เลือกแนวตั้ง/นอน", "เลือกปี ค.ศ. ได้", "เคลือบได้ 6 แบบ"],
    options: [
      { label: "ขนาด", choices: [{ name: "6x8 นิ้ว (แนวตั้ง) | 14 หน้า" }, { name: "6x8 นิ้ว (แนวนอน) | 14 หน้า" }] },
      { label: "เลือกปี (ค.ศ.)", choices: [{ name: "ปี ค.ศ. 2026" }, { name: "ปี ค.ศ. 2027" }] },
      { label: "การเคลือบ", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "📅", gradient: "from-sky-100 to-blue-200", label: "ตั้งโต๊ะ" },
      { emoji: "🗓️", gradient: "from-blue-100 to-indigo-200", label: "รายเดือน" },
    ],
  },
  {
    id: "calendar-canvas",
    name: "CANVAS CALENDAR / ปฏิทินผ้าแคนวาส",
    category: "card-photo",
    price: 200,
    emoji: "🗓️",
    gradient: "from-emerald-100 to-teal-200",
    rating: 4.7,
    sold: 310,
    description:
      "ปฏิทินผ้าแคนวาสพิมพ์ลาย เลือกระบบพิมพ์ Sublimation หรือ UV เลือกปีได้ถึง 5 ปี ของแต่งบ้านสไตล์พรีเมียม",
    highlights: ["ผ้าแคนวาสเนื้อดี", "พิมพ์ Sublimation/UV", "เลือกปีได้ถึง 5 ปี"],
    options: [
      { label: "การพิมพ์", choices: [{ name: "Sublimation" }, { name: "UV Printing" }] },
      { label: "เลือกปี (ค.ศ.)", choices: [{ name: "2026" }, { name: "2027" }, { name: "2028" }, { name: "2029" }, { name: "2030" }] },
    ],
    images: [
      { emoji: "🗓️", gradient: "from-emerald-100 to-teal-200", label: "ด้านหน้า" },
      { emoji: "🖼️", gradient: "from-teal-100 to-cyan-200", label: "แขวนผนัง" },
    ],
  },
  {
    id: "calendar-acrylic",
    name: "CALENDAR ACRYLIC / ปฏิทินอะคริลิค",
    category: "card-photo",
    price: 190,
    emoji: "📆",
    gradient: "from-violet-100 to-purple-200",
    rating: 4.7,
    sold: 280,
    badge: "ใหม่",
    description:
      "ปฏิทินอะคริลิคใสพรีเมียม เลือกขนาด A6/A5/A4 แนวตั้ง-นอน และปีได้ถึง 5 ปี วางโต๊ะสวยหรู",
    highlights: ["อะคริลิคใสพรีเมียม", "ขนาด A6/A5/A4", "แนวตั้ง/นอน · เลือกปีได้ 5 ปี"],
    options: [
      { label: "เลือกปี (ค.ศ.)", choices: [{ name: "2026" }, { name: "2027" }, { name: "2028" }, { name: "2029" }, { name: "2030" }] },
      { label: "ตำแหน่ง", choices: [{ name: "แนวตั้ง" }, { name: "แนวนอน" }] },
      { label: "ขนาด", choices: [{ name: "A6" }, { name: "A5" }, { name: "A4" }] },
    ],
    images: [
      { emoji: "📆", gradient: "from-violet-100 to-purple-200", label: "ด้านหน้า" },
      { emoji: "🪟", gradient: "from-purple-100 to-fuchsia-200", label: "อะคริลิคใส" },
    ],
  },
  {
    id: "calendar-postcard",
    name: "CALENDAR POSCARD / โปสการ์ดปฏิทิน",
    category: "card-photo",
    price: 90,
    emoji: "📅",
    gradient: "from-rose-100 to-pink-200",
    rating: 4.8,
    sold: 350,
    description:
      "โปสการ์ดปฏิทิน พิมพ์ปฏิทินบนโปสการ์ด เลือกรายปี/รายเดือน กระดาษหลายชนิด เคลือบได้ ทำแจกหรือสะสม",
    highlights: ["รายปี/รายเดือน", "กระดาษให้เลือก 8 ชนิด", "พิมพ์ 1-2 ด้าน · เคลือบได้"],
    options: [
      { label: "ปฏิทิน", choices: [{ name: "ปฏิทินรายปี" }, { name: "ปฏิทินรายเดือน" }] },
      { label: "ขนาด", choices: [{ name: "4\"x6\" | แนวนอน (8 ใบ/ชุด)" }, { name: "4\"x6\" | แนวตั้ง (8 ใบ/ชุด)" }] },
      { label: "เลือกปี (ค.ศ.)", choices: [{ name: "ปี ค.ศ. 2026" }, { name: "ปี ค.ศ. 2027" }] },
      { label: "ชนิดกระดาษ", choices: PAPER_TYPES_POSTCARD },
      { label: "การเคลือบ", choices: [{ name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
      { label: "ตัวเลือก", choices: [{ name: "พิมพ์ 1 ด้าน" }, { name: "พิมพ์ 2 ด้าน" }] },
    ],
    images: [
      { emoji: "📅", gradient: "from-rose-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "🖋️", gradient: "from-pink-100 to-rose-200", label: "ด้านหลัง" },
    ],
  },
  {
    id: "calendar-photocard",
    name: "CALENDAR PHOTOCARD / โฟโต้การ์ดปฏิทิน",
    category: "card-photo",
    price: 140,
    emoji: "🗓️",
    gradient: "from-cyan-100 to-sky-200",
    rating: 4.8,
    sold: 300,
    description:
      "โฟโต้การ์ดปฏิทิน พิมพ์ปฏิทินสไตล์การ์ดสะสม เลือกกระดาษหลายชนิดและเคลือบสวย เลือกปีเริ่มต้นได้",
    highlights: ["สไตล์การ์ดสะสม", "กระดาษให้เลือก 8 ชนิด", "เลือกปีเริ่มต้น · เคลือบได้"],
    options: [
      { label: "เริ่มต้นเดือน", choices: [{ name: "ปี ค.ศ. 2026" }, { name: "ปี ค.ศ. 2027" }] },
      { label: "ชนิดกระดาษ", choices: PAPER_TYPES_POSTCARD },
      { label: "การเคลือบ", choices: [{ name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "🗓️", gradient: "from-cyan-100 to-sky-200", label: "ด้านหน้า" },
      { emoji: "🎴", gradient: "from-sky-100 to-blue-200", label: "การ์ดสะสม" },
    ],
  },
  {
    id: "shikishi",
    name: "Shikishi / ชิกิชิ",
    category: "card-photo",
    price: 80,
    emoji: "🎨",
    gradient: "from-amber-100 to-yellow-200",
    rating: 4.7,
    sold: 340,
    description:
      "ชิกิชิ (การ์ดลายเซ็น/รูปวาด) พิมพ์ลายคุณภาพสูง มีหลายขนาด A7-A3 เลือกเคลือบได้ เหมาะสะสมหรือทำของแฟนคลับ",
    highlights: ["ขนาด A7 ถึง A3", "พิมพ์ลายคมชัด", "เคลือบได้ 6 แบบ"],
    options: [
      { label: "ขนาด", choices: [{ name: "A7" }, { name: "A6" }, { name: "A5" }, { name: "A4" }, { name: "A3" }] },
      { label: "การเคลือบ", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "🎨", gradient: "from-amber-100 to-yellow-200", label: "ด้านหน้า" },
      { emoji: "🖼️", gradient: "from-yellow-100 to-orange-200", label: "ตอนตั้งโชว์" },
    ],
  },
  {
    id: "cup-sleeve",
    name: "Cup Sleeve / ปลอกสวมแก้วกระดาษ",
    category: "card-photo",
    price: 45,
    emoji: "☕",
    gradient: "from-orange-100 to-amber-200",
    rating: 4.6,
    sold: 280,
    description:
      "ปลอกสวมแก้วกระดาษพิมพ์ลาย กันร้อน/เย็น มีหลายขนาด เหมาะทำของแบรนด์ร้านกาแฟหรือของแฟนคลับ",
    highlights: ["กันร้อน/เย็น", "มี 3 ขนาด", "พิมพ์ลายคมชัด ทนทาน"],
    options: [
      { label: "ขนาด", choices: [{ name: "27.7x7.6cm (6 ใบ/1A3)" }, { name: "35.2x7.8cm (4 ใบ/1A3)" }, { name: "42x9.3cm (3 ใบ/1A3)" }] },
    ],
    images: [
      { emoji: "☕", gradient: "from-orange-100 to-amber-200", label: "ตัวอย่าง" },
      { emoji: "🥤", gradient: "from-amber-100 to-yellow-200", label: "ตอนสวมแก้ว" },
    ],
  },
  {
    id: "notebook",
    name: "NOTEBOOK / สมุดโน๊ต",
    category: "card-photo",
    price: 99,
    emoji: "📓",
    gradient: "from-emerald-100 to-teal-200",
    rating: 4.7,
    sold: 410,
    description:
      "สมุดโน๊ตพิมพ์ปกลายของคุณ มีขนาด A5/A6/A7 เลือกเคลือบปกได้ ใช้เองหรือทำของขวัญ ของแจก",
    highlights: ["ขนาด A5/A6/A7", "พิมพ์ปกลายเอง", "เคลือบปกได้ 6 แบบ"],
    options: [
      { label: "ขนาด", choices: [{ name: "Notebook A5" }, { name: "Notebook A6" }, { name: "Notebook A7" }] },
      { label: "การเคลือบ", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "📓", gradient: "from-emerald-100 to-teal-200", label: "ปกหน้า" },
      { emoji: "✏️", gradient: "from-teal-100 to-cyan-200", label: "ด้านใน" },
    ],
  },
  {
    id: "mini-folder",
    name: "MINI FOLDER / แฟ้มจิ๋ว",
    category: "card-photo",
    price: 59,
    emoji: "📁",
    gradient: "from-purple-100 to-fuchsia-200",
    rating: 4.6,
    sold: 260,
    badge: "ใหม่",
    description:
      "แฟ้มจิ๋วพลาสติกใสพิมพ์ลาย น่ารักพกพาสะดวก เก็บการ์ด/สติ๊กเกอร์ เลือกวัสดุใสหรือกลิตเตอร์ใส",
    highlights: ["พลาสติกใส/กลิตเตอร์ใส", "2 ขนาดให้เลือก", "เก็บการ์ด/สติ๊กเกอร์"],
    options: [
      { label: "ขนาด", choices: [{ name: "4.5x4.5x2cm" }, { name: "4.8x6.2x2cm" }] },
      { label: "วัสดุ", choices: [{ name: "พลาสติกใส" }, { name: "พลาสติกกลิสเตอร์ใส" }] },
    ],
    images: [
      { emoji: "📁", gradient: "from-purple-100 to-fuchsia-200", label: "ด้านหน้า" },
      { emoji: "✨", gradient: "from-fuchsia-100 to-pink-200", label: "กลิตเตอร์" },
    ],
  },
  {
    id: "wall-poster-hang",
    name: "Wall Poster Hang / โปสเตอร์แขวนผนัง",
    category: "card-photo",
    price: 300,
    emoji: "🖼️",
    gradient: "from-sky-100 to-blue-200",
    rating: 4.7,
    sold: 190,
    description:
      "โปสเตอร์แขวนผนังพร้อมราวแขวน พิมพ์ภาพคมชัด มีขนาดใหญ่ A3-A0 เลือกผิวเงา/ด้าน แต่งห้องสไตล์คาเฟ่",
    highlights: ["พร้อมราวแขวน", "ขนาด A3 ถึง A0", "ผิวเงา/ด้าน"],
    options: [
      { label: "ขนาด", choices: [{ name: "A3" }, { name: "A2" }, { name: "A1" }, { name: "A0" }] },
      { label: "ผิว", choices: [{ name: "ผิวเงา" }, { name: "ผิวด้าน" }] },
    ],
    images: [
      { emoji: "🖼️", gradient: "from-sky-100 to-blue-200", label: "ด้านหน้า" },
      { emoji: "🧱", gradient: "from-blue-100 to-cyan-200", label: "แขวนผนัง" },
    ],
  },
  {
    id: "folding-mirror",
    name: "Folding Mirror / กระจกพับ",
    category: "gifts",
    price: 100,
    emoji: "🪞",
    gradient: "from-fuchsia-100 to-pink-200",
    rating: 4.7,
    sold: 380,
    description:
      "กระจกพับพกพาพิมพ์ลาย มีทั้งทรงกลม หัวใจ สี่เหลี่ยม พิมพ์ได้ 1-2 ด้าน พกใส่กระเป๋าสะดวก",
    highlights: ["ทรงกลม/หัวใจ/สี่เหลี่ยม", "พิมพ์ 1 หรือ 2 ด้าน", "พกพาสะดวก"],
    options: [
      { label: "ขนาด", choices: [{ name: "70mm (ทรงกลม)" }, { name: "70x70mm (ทรงหัวใจ)" }, { name: "61x95mm (ทรงสี่เหลี่ยม)" }] },
      { label: "รูปแบบการพิมพ์", choices: [{ name: "พิมพ์ 1 ด้าน" }, { name: "พิมพ์ 2 ด้าน" }] },
    ],
    pricing: {
      unit: "ชิ้น",
      driverLabels: ["ขนาด"],
      tiers: [
        { upTo: 10, label: "1-10 ชิ้น" },
        { upTo: 29, label: "11-29 ชิ้น" },
        { upTo: 49, label: "30-49 ชิ้น" },
        { upTo: 99, label: "50-99 ชิ้น" },
        { upTo: 499, label: "100-499 ชิ้น" },
        { upTo: 999, label: "500-999 ชิ้น" },
        { upTo: 4999, label: "1000-4999 ชิ้น" },
        { upTo: null, label: "5000 ชิ้นขึ้นไป" },
      ],
      cells: {
        "70mm (ทรงกลม)": [80, 60, 55, 50, 40, 30, 25, 20],
        "70x70mm (ทรงหัวใจ)": [90, 65, 60, 55, 45, 35, 30, 25],
        "61x95mm (ทรงสี่เหลี่ยม)": [90, 65, 60, 55, 45, 35, 30, 25],
      },
    },
    images: [
      { emoji: "🪞", gradient: "from-fuchsia-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "💄", gradient: "from-pink-100 to-rose-200", label: "เปิดใช้งาน" },
    ],
  },
  {
    id: "handheld-mirror",
    name: "Mirror / กระจกถือ",
    category: "gifts",
    price: 350,
    emoji: "🪞",
    gradient: "from-rose-100 to-pink-200",
    rating: 4.7,
    sold: 210,
    description:
      "กระจกถือด้ามจับพิมพ์ลาย มีทรงสี่เหลี่ยมและหัวใจ งานพรีเมียม เหมาะเป็นของขวัญหรือของสะสม",
    highlights: ["ทรงสี่เหลี่ยม/หัวใจ", "ด้ามจับถือถนัด", "งานพรีเมียม"],
    options: [
      { label: "รูปแบบ", choices: [{ name: "ทรงสี่เหลี่ยม" }, { name: "ทรงหัวใจ" }] },
    ],
    images: [
      { emoji: "🪞", gradient: "from-rose-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "💖", gradient: "from-pink-100 to-fuchsia-200", label: "ด้านหลัง" },
    ],
  },
  {
    id: "door-hanger",
    name: "Door Hanger / ป้ายแขวนประตู",
    category: "gifts",
    price: 250,
    emoji: "🚪",
    gradient: "from-amber-100 to-orange-200",
    rating: 4.6,
    sold: 180,
    description:
      "ป้ายแขวนประตูพิมพ์ลาย เลือกวัสดุอะคริลิค MDF หรือกระดาษอาร์ต แขวนหน้าห้องเพิ่มสไตล์",
    highlights: ["อะคริลิค/MDF/กระดาษ", "พิมพ์ลายคมชัด", "แขวนตกแต่งหน้าห้อง"],
    options: [
      { label: "เลือกวัสดุ", choices: [{ name: "อะคริลิค สไตล์ 1" }, { name: "อะคริลิค สไตล์ 2" }, { name: "MDF" }, { name: "กระดาษอาร์ต 300 แกรม" }] },
    ],
    images: [
      { emoji: "🚪", gradient: "from-amber-100 to-orange-200", label: "ด้านหน้า" },
      { emoji: "🏠", gradient: "from-orange-100 to-amber-200", label: "แขวนประตู" },
    ],
  },
  {
    id: "scrunchy",
    name: "Scrunchy / ยางรัดผมผ้าซาติน",
    category: "gifts",
    price: 90,
    emoji: "💇",
    gradient: "from-pink-100 to-rose-200",
    rating: 4.7,
    sold: 320,
    description:
      "ยางรัดผมผ้าซาตินพิมพ์ลาย เนื้อนุ่มไม่ทำร้ายเส้นผม ของพรีเมียมน่ารัก ทำแจกหรือขายได้",
    highlights: ["ผ้าซาตินเนื้อนุ่ม", "พิมพ์ลายสวย", "ไม่ทำร้ายเส้นผม"],
    options: [],
    images: [
      { emoji: "💇", gradient: "from-pink-100 to-rose-200", label: "ด้านหน้า" },
      { emoji: "🎀", gradient: "from-rose-100 to-pink-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "clip-pouch",
    name: "CLIP POUCH / กระเป๋าต๊อบแต๊บ",
    category: "gifts",
    price: 89,
    emoji: "👝",
    gradient: "from-purple-100 to-fuchsia-200",
    rating: 4.7,
    sold: 410,
    description:
      "กระเป๋าคลิปต๊อบแต๊บพิมพ์ลาย เปิด-ปิดด้วยคลิปสปริง พกพาสะดวก มีหลายขนาด เก็บของจุกจิกน่ารัก",
    highlights: ["คลิปสปริงเปิด-ปิดง่าย", "มี 4 ขนาด", "พิมพ์ลายคมชัด"],
    options: [
      { label: "ขนาด", choices: [{ name: "9.5x9cm" }, { name: "11.5x10cm" }, { name: "14.5x10cm" }, { name: "17.5x14.5cm" }] },
    ],
    images: [
      { emoji: "👝", gradient: "from-purple-100 to-fuchsia-200", label: "ด้านหน้า" },
      { emoji: "✨", gradient: "from-fuchsia-100 to-pink-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "passport-case",
    name: "PASSPORT CASE / ปกพาสปอร์ต",
    category: "gifts",
    price: 150,
    emoji: "🛂",
    gradient: "from-blue-100 to-indigo-200",
    rating: 4.6,
    sold: 240,
    description:
      "ปกพาสปอร์ตพิมพ์ลาย ปกป้องเล่มพาสปอร์ต พกพาไปเที่ยวสวยเก๋ เป็นของขวัญนักเดินทางได้ดี",
    highlights: ["ปกป้องพาสปอร์ต", "พิมพ์ลายคมชัด", "ของขวัญนักเดินทาง"],
    options: [],
    images: [
      { emoji: "🛂", gradient: "from-blue-100 to-indigo-200", label: "ด้านหน้า" },
      { emoji: "✈️", gradient: "from-indigo-100 to-violet-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "sleep-mask",
    name: "SLEEP MASK / ผ้าปิดตา",
    category: "gifts",
    price: 109,
    emoji: "😴",
    gradient: "from-violet-100 to-purple-200",
    rating: 4.7,
    sold: 260,
    description:
      "ผ้าปิดตาพิมพ์ลาย ตัดแสงช่วยให้หลับลึก สัมผัสนุ่มไม่ระคายเคือง ของขวัญน่ารักสำหรับคนรักการนอน",
    highlights: ["ตัดแสง หลับลึก", "สัมผัสนุ่ม ไม่ระคายเคือง", "พิมพ์ลายน่ารัก"],
    options: [],
    images: [
      { emoji: "😴", gradient: "from-violet-100 to-purple-200", label: "ด้านหน้า" },
      { emoji: "🌙", gradient: "from-purple-100 to-indigo-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "drawstring-bag",
    name: "DRAWSTRING BAG / ถุงผ้าหูรูด",
    category: "gifts",
    price: 120,
    emoji: "🎒",
    gradient: "from-teal-100 to-emerald-200",
    rating: 4.7,
    sold: 300,
    description:
      "ถุงผ้าหูรูดพิมพ์ลาย ปิดด้วยเชือกหูรูด ใส่ของสะพายสะดวก ทำของแจกหรือของแฟนคลับได้ดี",
    highlights: ["เชือกหูรูดปิดง่าย", "พิมพ์ลายเต็มใบ", "สะพายสะดวก"],
    options: [],
    images: [
      { emoji: "🎒", gradient: "from-teal-100 to-emerald-200", label: "ด้านหน้า" },
      { emoji: "🎁", gradient: "from-emerald-100 to-green-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "hologram-bag",
    name: "HOLOGRAM BAG / กระเป๋าโฮโลแกรม",
    category: "gifts",
    price: 150,
    emoji: "🌈",
    gradient: "from-fuchsia-100 to-purple-200",
    rating: 4.7,
    sold: 280,
    badge: "ใหม่",
    description:
      "กระเป๋า PVC ใสโฮโลแกรมพิมพ์ลาย วิ้งสะท้อนรุ้งสวย เลือกสีซิปขาว/ดำ ใส่ของจุกจิกหรือเครื่องสำอาง",
    highlights: ["PVC ใสโฮโลแกรมวิ้ง", "เลือกซิปขาว/ดำ", "พิมพ์ลายคมชัด"],
    options: [
      { label: "ตัวเลือก", choices: [{ name: "ซิปสีขาว" }, { name: "ซิปสีดำ" }] },
    ],
    images: [
      { emoji: "🌈", gradient: "from-fuchsia-100 to-purple-200", label: "ด้านหน้า" },
      { emoji: "👛", gradient: "from-purple-100 to-fuchsia-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "phone-hanging",
    name: "Phone Hanging / สายคล้องมือถือ",
    category: "phone-gadget",
    price: 79,
    emoji: "📿",
    gradient: "from-violet-100 to-purple-200",
    rating: 4.7,
    sold: 640,
    description:
      "สายคล้องมือถือพิมพ์ลาย (1 เซ็ต 2 ชิ้น) ติดกับเคสคล้องคอ/สะพายได้ พกมือถือสะดวก มือว่างขึ้น",
    highlights: ["1 เซ็ต = 2 ชิ้น", "คล้องคอ/สะพายได้", "พิมพ์ลายคมชัด"],
    options: [
      { label: "ขนาดสินค้า", choices: [{ name: "4x5.4cm (2 ชิ้น/เซ็ต)" }, { name: "6x12.8cm (2 ชิ้น/เซ็ต)" }] },
    ],
    images: [
      { emoji: "📿", gradient: "from-violet-100 to-purple-200", label: "ด้านหน้า" },
      { emoji: "📱", gradient: "from-purple-100 to-fuchsia-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "cardholder-white",
    name: "CARDHOLDER (White) / การ์ดใส่บัตร (พลาสติกขาว)",
    category: "phone-gadget",
    price: 130,
    emoji: "💳",
    gradient: "from-blue-100 to-indigo-200",
    rating: 4.7,
    sold: 380,
    description:
      "การ์ดใส่บัตรพลาสติกขาวพิมพ์ลาย มีสายคล้อง เลือกสกรีนสายได้ พกบัตรสวยเก๋ ทนทาน",
    highlights: ["พลาสติกขาวทนทาน", "มีสายคล้อง", "เลือกสกรีนสายได้"],
    options: [
      { label: "รูปแบบการพิมพ์", choices: [{ name: "ไม่สกรีนสาย" }, { name: "สกรีนสาย" }] },
    ],
    images: [
      { emoji: "💳", gradient: "from-blue-100 to-indigo-200", label: "ด้านหน้า" },
      { emoji: "🎫", gradient: "from-indigo-100 to-violet-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "cardholder-clear",
    name: "CARD HOLDER / การ์ดโฮลเดอร์ (พลาสติกใส)",
    category: "phone-gadget",
    price: 100,
    emoji: "🪪",
    gradient: "from-cyan-100 to-sky-200",
    rating: 4.7,
    sold: 420,
    description:
      "การ์ดโฮลเดอร์พลาสติกใสพิมพ์ลาย ใสไม่ขุ่นมัว พิมพ์ได้ 1-2 ด้าน เก็บบัตรหรือโฟโต้การ์ดสวยใส",
    highlights: ["พลาสติกใสไม่ขุ่น", "พิมพ์ 1-2 ด้าน", "โชว์การ์ดสวย"],
    options: [
      { label: "รูปแบบการพิมพ์", choices: [{ name: "พิมพ์ 1 ด้าน" }, { name: "พิมพ์ 2 ด้าน" }] },
    ],
    images: [
      { emoji: "🪪", gradient: "from-cyan-100 to-sky-200", label: "ด้านหน้า" },
      { emoji: "🎴", gradient: "from-sky-100 to-blue-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "magsafe-wallet",
    name: "Magsafe Wallet / กระเป๋าใส่การ์ด Magsafe",
    category: "phone-gadget",
    price: 179,
    emoji: "👛",
    gradient: "from-purple-100 to-fuchsia-200",
    rating: 4.8,
    sold: 460,
    badge: "ขายดี",
    featured: true,
    description:
      "กระเป๋าใส่การ์ด Magsafe ติดหลังมือถือพิมพ์ลาย เลือกแบบ Card Holder หรือ Wallet มีขาตั้ง พกบัตรติดมือถือสะดวก",
    highlights: ["ติด Magsafe หลังมือถือ", "แบบมีขาตั้งได้", "พิมพ์ลายคมชัด"],
    options: [
      { label: "ตัวเลือกสินค้า", choices: [{ name: "Magsafe Card Holder" }, { name: "Magsafe Wallet (มีขาตั้ง)" }] },
    ],
    images: [
      { emoji: "👛", gradient: "from-purple-100 to-fuchsia-200", label: "ด้านหน้า" },
      { emoji: "📱", gradient: "from-fuchsia-100 to-pink-200", label: "ติดมือถือ" },
    ],
  },
  {
    id: "x-stand",
    name: "X-STAND / ROLL UP / ป้ายขาตั้ง",
    category: "card-photo",
    price: 529,
    emoji: "🎌",
    gradient: "from-sky-100 to-blue-200",
    rating: 4.6,
    sold: 90,
    description:
      "ป้ายไวนิลตั้งพื้น X-stand / Roll up ขนาด 60x160cm พิมพ์ภาพคมชัด เหมาะออกบูธ งานอีเวนต์ หน้าร้าน",
    highlights: ["X-stand / Roll up", "ขนาด 60x160 cm", "พิมพ์ไวนิลคมชัด"],
    options: [
      { label: "ขนาด", choices: [{ name: "X-stand 60x160 cm" }, { name: "Roll up 60x160 cm" }] },
    ],
    images: [
      { emoji: "🎌", gradient: "from-sky-100 to-blue-200", label: "ด้านหน้า" },
      { emoji: "🏬", gradient: "from-blue-100 to-cyan-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "frame-card",
    name: "FRAME CARD / การ์ดใส",
    category: "home",
    price: 49,
    emoji: "🖼️",
    gradient: "from-cyan-100 to-sky-200",
    rating: 4.7,
    sold: 520,
    description:
      "ซองการ์ดใสพิมพ์ลาย กันน้ำ ไม่ขุ่นมัว เลือกแบบเจาะรู/ไม่เจาะรู เก็บโฟโต้การ์ดหรือทำกรอบการ์ดสวยใส",
    highlights: ["ใสไม่ขุ่นมัว กันน้ำ", "เจาะรู/ไม่เจาะรู", "พิมพ์ลายคมชัด"],
    options: [
      { label: "ตัวเลือก", choices: [{ name: "(เจาะรู) Frame Card" }, { name: "(ไม่เจาะรู) Frame Card" }] },
    ],
    images: [
      { emoji: "🖼️", gradient: "from-cyan-100 to-sky-200", label: "ด้านหน้า" },
      { emoji: "🎴", gradient: "from-sky-100 to-blue-200", label: "ใส่การ์ด" },
    ],
  },
  {
    id: "coasters-glitter",
    name: "COASTERS GLITTER / ที่รองแก้วกลิตเตอร์",
    category: "home",
    price: 200,
    emoji: "✨",
    gradient: "from-fuchsia-100 to-pink-200",
    rating: 4.7,
    sold: 360,
    description:
      "ที่รองแก้วกลิตเตอร์วิ้งสวย พิมพ์ลายคมชัด เลือกได้หลายลวดลาย เพิ่มความหรูให้โต๊ะกาแฟ",
    highlights: ["กลิตเตอร์วิ้งสวย", "หลายลวดลายให้เลือก", "พิมพ์ลายคมชัด"],
    options: [
      { label: "รูปแบบ", choices: [{ name: "สีชมพู" }, { name: "สีทอง" }, { name: "ดอกซากุระ" }, { name: "สีม่วง" }] },
    ],
    images: [
      { emoji: "✨", gradient: "from-fuchsia-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "☕", gradient: "from-pink-100 to-rose-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "placemat",
    name: "PLACEMAT / ผ้ารองจาน",
    category: "home",
    price: 120,
    emoji: "🍽️",
    gradient: "from-amber-100 to-orange-200",
    rating: 4.6,
    sold: 210,
    description:
      "ผ้ารองจานพิมพ์ลาย ผลิตจากผ้าคุณภาพ สวยหรู ทนทาน แต่งโต๊ะอาหารให้ดูดีมีสไตล์",
    highlights: ["ผ้าคุณภาพ สวยหรู", "พิมพ์ลายคมชัด", "ทนทาน ซักได้"],
    options: [],
    images: [
      { emoji: "🍽️", gradient: "from-amber-100 to-orange-200", label: "ด้านหน้า" },
      { emoji: "🍴", gradient: "from-orange-100 to-amber-200", label: "บนโต๊ะ" },
    ],
  },
  {
    id: "doormat",
    name: "DOORMAT / พรมเช็ดเท้า",
    category: "home",
    price: 250,
    emoji: "🚪",
    gradient: "from-stone-100 to-stone-200",
    rating: 4.7,
    sold: 340,
    description:
      "พรมเช็ดเท้าพิมพ์ลาย เลือกทรงสี่เหลี่ยม/กลม หลายขนาด เนื้อหนานุ่ม ซับน้ำดี ต้อนรับหน้าบ้านสไตล์คุณ",
    highlights: ["ทรงสี่เหลี่ยม/กลม", "หลายขนาด", "เนื้อหนานุ่ม ซับน้ำดี"],
    options: [
      { label: "ขนาด", choices: [{ name: "60x40cm (สี่เหลี่ยม)" }, { name: "80x50cm (สี่เหลี่ยม)" }, { name: "60cm (กลม)" }, { name: "80cm (กลม)" }] },
    ],
    images: [
      { emoji: "🚪", gradient: "from-stone-100 to-stone-200", label: "ด้านหน้า" },
      { emoji: "🏠", gradient: "from-amber-100 to-stone-200", label: "หน้าบ้าน" },
    ],
  },
  {
    id: "cushion",
    name: "CUSHION / หมอนอิงยัดใย",
    category: "home",
    price: 245,
    emoji: "🛋️",
    gradient: "from-orange-100 to-amber-200",
    rating: 4.8,
    sold: 480,
    featured: true,
    description:
      "หมอนอิงพิมพ์ลาย เลือกแบบยัดใยพร้อมใช้หรือปลอกหมอนอย่างเดียว หลายขนาด นุ่มสบาย แต่งโซฟาให้น่ารัก",
    highlights: ["ยัดใย/ปลอกหมอน", "ขนาด 12-24 นิ้ว", "นุ่มสบาย ถอดซักได้"],
    options: [
      { label: "ตัวเลือก", choices: [{ name: "หมอนอิงยัดใย" }, { name: "ปลอกหมอนอิง" }] },
      { label: "ขนาด", choices: [{ name: "12 นิ้ว" }, { name: "14 นิ้ว" }, { name: "16 นิ้ว" }, { name: "24 นิ้ว" }] },
    ],
    images: [
      { emoji: "🛋️", gradient: "from-orange-100 to-amber-200", label: "ด้านหน้า" },
      { emoji: "🏡", gradient: "from-amber-100 to-orange-200", label: "บนโซฟา" },
    ],
  },
  {
    id: "pillowcase",
    name: "Pillow Case / ปลอกหมอน",
    category: "home",
    price: 399,
    emoji: "🛏️",
    gradient: "from-amber-100 to-yellow-200",
    rating: 4.7,
    sold: 260,
    description:
      "ปลอกหมอนพิมพ์ลายเต็มผืน เนื้อผ้านุ่มลื่น สีสดไม่ตก ถอดซักได้ แต่งเตียงให้เป็นสไตล์ของคุณ",
    highlights: ["พิมพ์เต็มผืน สีสด", "เนื้อผ้านุ่มลื่น", "ถอดซักได้"],
    options: [],
    images: [
      { emoji: "🛏️", gradient: "from-amber-100 to-yellow-200", label: "ด้านหน้า" },
      { emoji: "😴", gradient: "from-yellow-100 to-orange-200", label: "บนเตียง" },
    ],
  },
  {
    id: "puzzle-mini",
    name: "Puzzle / จิ๊กซอว์อะคริลิค",
    category: "home",
    price: 90,
    emoji: "🧩",
    gradient: "from-indigo-100 to-violet-200",
    rating: 4.7,
    sold: 380,
    description:
      "จิ๊กซอว์อะคริลิคชิ้นเล็กพิมพ์ลาย ต่อสนุก เก็บเป็นของที่ระลึกน่ารัก มีหลายขนาด",
    highlights: ["อะคริลิคพิมพ์ลาย", "ต่อสนุก เก็บสะสม", "มี 3 ขนาด"],
    options: [
      { label: "ขนาด", choices: [{ name: "9x7.5 cm" }, { name: "11x9 cm" }, { name: "13.5x11.5 cm" }] },
    ],
    images: [
      { emoji: "🧩", gradient: "from-indigo-100 to-violet-200", label: "ด้านหน้า" },
      { emoji: "🖼️", gradient: "from-violet-100 to-purple-200", label: "ต่อเสร็จ" },
    ],
  },
  {
    id: "jigsaw-frame",
    name: "JIGSAW & Photo Frame / กรอบรูปจิ๊กซอว์",
    category: "home",
    price: 160,
    emoji: "🧩",
    gradient: "from-violet-100 to-purple-200",
    rating: 4.8,
    sold: 420,
    description:
      "จิ๊กซอว์พร้อมกรอบรูป พิมพ์ภาพคมชัดสีสวยสด ต่อเสร็จใส่กรอบโชว์ได้เลย มีหลายขนาดตั้งแต่ A5 ถึงใหญ่",
    highlights: ["จิ๊กซอว์ + กรอบรูป", "พิมพ์ภาพคมชัด สีสด", "หลายขนาด (Sublimation/UV)"],
    options: [
      { label: "ขนาด", choices: [{ name: "A5 (Sublimation)" }, { name: "15x20cm (UV)" }, { name: "29.7x21cm (UV)" }, { name: "38x26cm (UV)" }, { name: "52x38cm (UV)" }] },
    ],
    images: [
      { emoji: "🧩", gradient: "from-violet-100 to-purple-200", label: "ด้านหน้า" },
      { emoji: "🖼️", gradient: "from-purple-100 to-fuchsia-200", label: "ใส่กรอบ" },
    ],
  },
  {
    id: "mousepad",
    name: "Mouse Pad / แผ่นรองเมาส์",
    category: "home",
    price: 150,
    emoji: "🖱️",
    gradient: "from-blue-100 to-cyan-200",
    rating: 4.7,
    sold: 456,
    description:
      "แผ่นรองเมาส์พิมพ์ลายเต็มแผ่น ผิวผ้าลื่นแม่นยำ ฐานยางกันลื่น มีหลายขนาดตั้งแต่เล็กถึงยาวเต็มโต๊ะ",
    highlights: ["ผิวผ้าลื่นแม่นยำ", "ฐานยางกันลื่น", "มี 6 ขนาด"],
    options: [
      { label: "ขนาด", choices: [{ name: "18x21cm" }, { name: "25x30cm" }, { name: "30x60cm" }, { name: "30x80cm" }, { name: "40x80cm" }, { name: "40x90cm" }] },
    ],
    images: [
      { emoji: "🖱️", gradient: "from-blue-100 to-cyan-200", label: "ด้านบน" },
      { emoji: "⌨️", gradient: "from-cyan-100 to-teal-200", label: "บนโต๊ะ" },
    ],
  },
  {
    id: "hand-fan",
    name: "HAND FAN / พัดพลาสติกใส",
    category: "home",
    price: 59,
    emoji: "🪭",
    gradient: "from-rose-100 to-pink-200",
    rating: 4.6,
    sold: 290,
    description:
      "พัดพลาสติกใสทรงกลมพิมพ์ลาย พิมพ์ได้ 1-2 ด้าน พกพาสะดวก ของแฟนคลับหรือของแจกน่ารัก",
    highlights: ["พลาสติกใสทรงกลม", "พิมพ์ 1-2 ด้าน", "พกพาสะดวก"],
    options: [
      { label: "ขนาด", choices: [{ name: "5 cm" }, { name: "16.4 cm" }] },
      { label: "รูปแบบการพิมพ์", choices: [{ name: "พิมพ์ 1 ด้าน" }, { name: "พิมพ์ 2 ด้าน" }] },
    ],
    images: [
      { emoji: "🪭", gradient: "from-rose-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "🎐", gradient: "from-pink-100 to-fuchsia-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "wall-cloth",
    name: "WALL CLOTH / ผ้าแขวนผนัง",
    category: "home",
    price: 175,
    emoji: "🧵",
    gradient: "from-emerald-100 to-teal-200",
    rating: 4.7,
    sold: 230,
    description:
      "ผ้าแขวนผนังพิมพ์ลายเต็มผืน แต่งห้องสไตล์คาเฟ่/มินิมอล เลือกได้ 2 ขนาด แขวนง่ายเปลี่ยนบรรยากาศห้อง",
    highlights: ["พิมพ์เต็มผืน สีสด", "2 ขนาดให้เลือก", "แต่งห้องสไตล์คาเฟ่"],
    options: [
      { label: "ขนาด", choices: [{ name: "50x50cm" }, { name: "100x100cm" }] },
    ],
    images: [
      { emoji: "🧵", gradient: "from-emerald-100 to-teal-200", label: "ด้านหน้า" },
      { emoji: "🖼️", gradient: "from-teal-100 to-cyan-200", label: "แขวนผนัง" },
    ],
  },
  {
    id: "towel",
    name: "TOWEL / ผ้าขนหนู",
    category: "fabric",
    price: 250,
    emoji: "🏖️",
    gradient: "from-cyan-100 to-teal-200",
    rating: 4.7,
    sold: 380,
    description:
      "ผ้าขนหนูพิมพ์ลายเต็มผืน ซับน้ำดี เนื้อนุ่ม มีหลายขนาดตั้งแต่ผ้าเช็ดหน้าจนถึงผ้าเช็ดตัวใหญ่",
    highlights: ["พิมพ์เต็มผืน สีสด", "ซับน้ำดี เนื้อนุ่ม", "มี 5 ขนาด"],
    options: [
      { label: "ขนาด", choices: [{ name: "30x60cm" }, { name: "38x76cm" }, { name: "50x100cm" }, { name: "70x150cm" }, { name: "78x180cm" }] },
    ],
    images: [
      { emoji: "🏖️", gradient: "from-cyan-100 to-teal-200", label: "เต็มผืน" },
      { emoji: "🌊", gradient: "from-sky-100 to-cyan-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "facecloth",
    name: "FACECLOTH / ผ้าเช็ดหน้า",
    category: "fabric",
    price: 120,
    emoji: "🧻",
    gradient: "from-teal-100 to-emerald-200",
    rating: 4.6,
    sold: 240,
    description:
      "ผ้าเช็ดหน้าพิมพ์ลายเต็มผืน เนื้อนุ่มซับน้ำดี อ่อนโยนต่อผิว ของพรีเมียมทำแจกหรือขายได้",
    highlights: ["เนื้อนุ่มอ่อนโยน", "ซับน้ำดี", "พิมพ์เต็มผืน สีสด"],
    options: [],
    images: [
      { emoji: "🧻", gradient: "from-teal-100 to-emerald-200", label: "ด้านหน้า" },
      { emoji: "🧼", gradient: "from-emerald-100 to-green-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "blanket-hoodie",
    name: "BLANKET HOODIE / ผ้าห่มมีฮู้ด",
    category: "fabric",
    price: 490,
    emoji: "🧥",
    gradient: "from-green-100 to-emerald-200",
    rating: 4.8,
    sold: 260,
    badge: "ใหม่",
    description:
      "ผ้าห่มมีฮู้ดสวมใส่ได้ พิมพ์ลายเต็มผืน อุ่นสบาย เหมาะคลุมกันหนาวในออฟฟิศ พับเก็บพกพาสะดวก",
    highlights: ["ผ้าห่ม + ฮู้ดสวมได้", "พิมพ์เต็มผืน อุ่นสบาย", "พับเก็บพกพาง่าย"],
    options: [
      { label: "ขนาด", choices: [{ name: "85x130cm (รวมฮู้ด)" }, { name: "125x150cm (รวมฮู้ด)" }] },
    ],
    images: [
      { emoji: "🧥", gradient: "from-green-100 to-emerald-200", label: "ด้านหน้า" },
      { emoji: "🛋️", gradient: "from-emerald-100 to-teal-200", label: "ตอนสวมใส่" },
    ],
  },
  {
    id: "scarf",
    name: "SCARF / ผ้าผูกผม",
    category: "fabric",
    price: 120,
    emoji: "🧣",
    gradient: "from-rose-100 to-pink-200",
    rating: 4.7,
    sold: 300,
    description:
      "ผ้าผูกผม/ผ้าพันกระเป๋าพิมพ์ลาย เนื้อผ้าลื่นสวย เพิ่มลุคน่ารักให้ผมหรือกระเป๋า ของแฟชั่นน่าสะสม",
    highlights: ["เนื้อผ้าลื่นสวย", "ผูกผม/พันกระเป๋า", "พิมพ์ลายคมชัด"],
    options: [],
    images: [
      { emoji: "🧣", gradient: "from-rose-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "👜", gradient: "from-pink-100 to-fuchsia-200", label: "พันกระเป๋า" },
    ],
  },
  {
    id: "shawl",
    name: "SHAWL / ผ้าคลุมไหล่",
    category: "fabric",
    price: 250,
    emoji: "🧣",
    gradient: "from-fuchsia-100 to-pink-200",
    rating: 4.7,
    sold: 210,
    description:
      "ผ้าคลุมไหล่พิมพ์ลายเต็มผืน เนื้อผ้าพลิ้วสวย มีหลายขนาด คลุมไหล่หรือพันคอเพิ่มสไตล์ ของพรีเมียม",
    highlights: ["เนื้อผ้าพลิ้วสวย", "มี 3 ขนาด", "พิมพ์เต็มผืน สีสด"],
    options: [
      { label: "ขนาด", choices: [{ name: "70x70 cm" }, { name: "100x100 cm" }, { name: "140x140 cm" }] },
    ],
    images: [
      { emoji: "🧣", gradient: "from-fuchsia-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "🧕", gradient: "from-pink-100 to-rose-200", label: "ตอนคลุม" },
    ],
  },
  {
    id: "collar-animal",
    name: "Collar Animal / ปลอกคอสัตว์เลี้ยง",
    category: "fabric",
    price: 109,
    emoji: "🐾",
    gradient: "from-emerald-100 to-teal-200",
    rating: 4.7,
    sold: 340,
    description:
      "ปลอกคอ/ผ้าพันคอสัตว์เลี้ยงพิมพ์ลาย ใส่สบาย มีไซซ์ XS-XXL เพิ่มความน่ารักให้น้องหมาน้องแมว",
    highlights: ["ไซซ์ XS ถึง XXL", "ใส่สบาย ไม่ระคายเคือง", "พิมพ์ลายคมชัด"],
    options: [
      { label: "ขนาด", choices: [{ name: "XS" }, { name: "S" }, { name: "M" }, { name: "L" }, { name: "XL" }, { name: "XXL" }] },
    ],
    images: [
      { emoji: "🐾", gradient: "from-emerald-100 to-teal-200", label: "ด้านหน้า" },
      { emoji: "🐶", gradient: "from-teal-100 to-cyan-200", label: "ตอนใส่" },
    ],
  },
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function formatPrice(n: number): string {
  return `฿${n.toLocaleString("th-TH")}`;
}

/** ช่วงราคาต่ำสุด–สูงสุดของสินค้า — ถ้ามีตารางราคาขั้นบันไดคิดจากทุกช่อง, ไม่งั้นคิดจากราคาตั้งต้น + option.extra */
export function priceRange(p: Product): { min: number; max: number } {
  if (p.pricing) {
    const all = Object.values(p.pricing.cells).flat();
    if (all.length) return { min: Math.min(...all), max: Math.max(...all) };
  }
  let min = p.price;
  let max = p.price;
  for (const opt of p.options) {
    if (opt.choices.length === 0) continue;
    const extras = opt.choices.map((c) => c.extra ?? 0);
    min += Math.min(...extras);
    max += Math.max(...extras);
  }
  return { min, max };
}

/** index ของ tier ที่จำนวน qty ตกอยู่ */
export function tierIndex(m: PriceMatrix, qty: number): number {
  for (let i = 0; i < m.tiers.length; i++) {
    const up = m.tiers[i].upTo;
    if (up == null || qty <= up) return i;
  }
  return Math.max(0, m.tiers.length - 1);
}

/** key ของคอลัมน์ในตารางราคา จากตัวเลือกที่เลือกอยู่ */
export function priceMatrixKey(m: PriceMatrix, selections: Record<string, string>): string {
  return m.driverLabels.map((l) => selections[l] ?? "").join("│");
}

/** ราคา/หน่วย ตามตัวเลือก + จำนวน — ใช้ตารางราคาถ้ามี, ไม่งั้น price + option.extra */
export function unitPriceFor(
  product: Product,
  selections: Record<string, string>,
  qty: number
): number {
  // งานกำหนดขนาดเอง (custom) มาก่อน — ราคาพิเศษแทนตารางปกติ
  const c = product.custom;
  if (c?.enabled) {
    const dims = parseCustomDims(selections[c.label]);
    if (dims) return c.mode === "quote" ? 0 : customUnitPrice(c, dims.w, dims.h);
  }
  const m = product.pricing;
  if (m) {
    const cells = m.cells[priceMatrixKey(m, selections)];
    if (cells && cells.length) return cells[tierIndex(m, qty)] ?? product.price;
    return product.price;
  }
  let price = product.price;
  for (const opt of product.options) {
    const chosen = opt.choices.find((c) => c.name === selections[opt.label]);
    if (chosen?.extra) price += chosen.extra;
  }
  return price;
}

/** ข้อความราคา: แสดงเป็นช่วง "฿ต่ำสุด – ฿สูงสุด" ถ้าตัวเลือกทำให้ราคาต่างกัน */
export function formatPriceRange(p: Product): string {
  const { min, max } = priceRange(p);
  return max > min ? `${formatPrice(min)} – ${formatPrice(max)}` : formatPrice(min);
}

/**
 * ตัวเลือกที่อนุญาตของกลุ่ม `label` ภายใต้สิ่งที่เลือกอยู่ตอนนี้
 * (ตัดตามกฎทุกข้อที่เงื่อนไข `when` ตรง — ถ้ากฎตัดจนหมดจะคืนทั้งกลุ่มไว้กันหน้าพัง)
 */
export function allowedChoices(
  product: Product,
  selections: Record<string, string>,
  label: string
): string[] {
  const group = product.options.find((o) => o.label === label);
  if (!group) return [];
  let allowed = group.choices.map((c) => c.name);
  for (const rule of product.rules ?? []) {
    if (rule.limit.label !== label) continue;
    if (selections[rule.when.label] === rule.when.choice) {
      allowed = allowed.filter((n) => rule.limit.allow.includes(n));
    }
  }
  return allowed.length > 0 ? allowed : group.choices.map((c) => c.name);
}

/**
 * ปรับสิ่งที่ลูกค้าเลือกให้ถูกกฎเสมอ: ไล่ตามลำดับกลุ่ม
 * ถ้าค่าที่เลือกไว้ใช้ไม่ได้แล้ว (เพราะกลุ่มก่อนหน้าเปลี่ยน) จะสลับเป็นตัวแรกที่อนุญาต
 */
export function resolveSelections(
  product: Product,
  selections: Record<string, string>
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const opt of product.options) {
    const view = { ...selections, ...resolved };
    const allowed = allowedChoices(product, view, opt.label);
    const current = selections[opt.label];
    resolved[opt.label] = current && allowed.includes(current) ? current : allowed[0];
  }
  return resolved;
}

export const FREE_SHIPPING_THRESHOLD = 999;
export const SHIPPING_METHODS = [
  { id: "standard", name: "ส่งธรรมดา (3-5 วัน)", price: 50 },
  { id: "express", name: "ส่งด่วน (1-2 วัน)", price: 90 },
] as const;
