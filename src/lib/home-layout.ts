/**
 * 🏠 ผังหน้าแรก (Home / Landing Page) — แบบบล็อกเรียงลงมา
 *
 * แอดมินเพิ่ม / ลบ / เลื่อน / ซ่อน บล็อกเองได้จากหลังบ้าน (/admin/nav)
 * เก็บอยู่ใน SiteNav.home (แถวพิเศษ __site_nav__ เหมือนเมนู) — ไม่ต้องมีตารางใหม่
 *
 * ยังไม่เคยจัดผัง = สร้างจากค่าที่ตั้งไว้เดิมให้อัตโนมัติ (หน้าแรกไม่มีวันว่าง/ไม่เปลี่ยนเอง)
 */

export type HomeBlockKind =
  | "image" // ภาพเต็มกว้าง (แบนเนอร์ที่ออกแบบมาแล้ว) + กดไปหน้าที่ตั้ง
  | "hero" // แบนเนอร์ข้อความ + ปุ่ม (ตั้งค่าในแท็บแบนเนอร์ใหญ่)
  | "tiles" // การ์ดนำทาง (ตั้งค่าในแท็บการ์ดนำทาง)
  | "perks" // จุดเด่นร้าน (ตั้งค่าในแท็บจุดเด่นร้าน)
  | "categories" // การ์ดหมวดหมู่สินค้า
  | "products" // แถวสินค้า (ขายดี / แนะนำ / ตามหมวด)
  | "text" // ข้อความอิสระ (หัวข้อ + คำบรรยาย)
  | "imagetext" // รูป + ข้อความ 2 คอลัมน์
  | "gallery" // แกลเลอรีรูป 2-4 คอลัมน์
  | "html" // โค้ด HTML (สำหรับคนที่เขียนเองเป็น — ระบบกรองแท็กอันตรายให้)
  | "video" // วิดีโอ YouTube / Vimeo (วางลิงก์ได้เลย)
  | "cards" // การ์ดรูป+ข้อความ+ปุ่ม 2-4 ใบ (แบบ three column with card)
  | "cta"; // กล่องชวนซื้อท้ายหน้า

/** สัดส่วนกรอบภาพของแกลเลอรี (ค่าที่เลือกได้ — กันค่าเพี้ยนหลุดลง CSS) */
export const GALLERY_RATIOS = ["16/12", "16/9", "21/9", "1/1", "3/4"] as const;
export type GalleryRatio = (typeof GALLERY_RATIOS)[number];

/** การ์ด 1 ใบในบล็อก "cards" */
export interface HomeCard {
  image?: string;
  title: string;
  body?: string;
  btnLabel?: string;
  btnHref?: string;
}

export interface HomeBlock {
  id: string;
  kind: HomeBlockKind;
  /** ซ่อนจากหน้าร้านโดยไม่ต้องลบ */
  hidden?: boolean;

  /** kind "image": รูปเต็มกว้าง + ลิงก์ปลายทาง */
  image?: string;
  href?: string;

  /** kind "products": ดึงสินค้าจากไหน */
  source?: "best" | "featured" | "category";
  /** id หมวด (ใช้เมื่อ source = category) */
  category?: string;
  /** แสดงกี่ชิ้น (ไม่ตั้ง = 4) */
  limit?: number;

  /** หัวข้อของบล็อก (products / text / cta) */
  heading?: string;
  /** ข้อความบรรยาย (text / cta) */
  body?: string;

  /** kind "cta" / "imagetext": ปุ่ม */
  btnLabel?: string;
  btnHref?: string;

  /** kind "imagetext": รูปอยู่ซ้ายหรือขวา */
  align?: "left" | "right";
  /** kind "gallery": รูปหลายใบ (แต่ละใบมีลิงก์ของตัวเองได้) */
  images?: { src: string; href?: string }[];
  /** kind "gallery": กี่คอลัมน์ (2-4) */
  cols?: number;
  /** kind "gallery": grid = ตาราง · slider = สไลด์เลื่อน (แบบ ALL PRODUCT เว็บหลัก) */
  display?: "grid" | "slider";
  /** kind "gallery": การแสดงภาพในกรอบ — cover = ครอปให้เต็มกรอบ (เดิม) · contain = เห็นเต็มภาพไม่ครอป */
  fit?: "cover" | "contain";
  /** kind "gallery": สัดส่วนกรอบภาพ เช่น "16/9" (ไม่ตั้ง = 16/12 แบบเดิม) */
  ratio?: GalleryRatio;
  /** kind "html": โค้ดที่กรองแล้วจากเซิร์ฟเวอร์ */
  html?: string;
  /** kind "video": ลิงก์ YouTube / Vimeo (เก็บลิงก์ที่วางมา — ตอนแสดงแปลงเป็น embed เอง) */
  videoUrl?: string;
  /** kind "cards": การ์ดรูป+ข้อความ+ปุ่ม 2-4 ใบ */
  cards?: HomeCard[];
}

/**
 * แปลงลิงก์วิดีโอที่คนวางมา (YouTube ทุกทรง / Vimeo) → ลิงก์ embed ที่ปลอดภัย
 * ลิงก์เจ้าอื่น/ลิงก์เพี้ยน = null (บล็อกจะไม่แสดง + ตอนบันทึกถูกตัดทิ้ง)
 */
export function videoEmbedUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.replace(/^(www|m)\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return /^[\w-]{6,}$/.test(id) ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/)?.[1] ?? "";
      return /^[\w-]{6,}$/.test(id) ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = u.pathname.match(/(\d{6,})/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** ชื่อ + คำอธิบายของแต่ละชนิดบล็อก (ใช้ทั้งในลิสต์และหน้าจอเลือกบล็อก) */
export const BLOCK_META: Record<HomeBlockKind, { icon: string; label: string; desc: string; settingsTab?: string }> = {
  image: { icon: "🖼", label: "ภาพเต็มกว้าง", desc: "แบนเนอร์ที่ออกแบบมาแล้ว · กดที่ภาพไปหน้าที่ตั้งไว้" },
  hero: { icon: "🎉", label: "แบนเนอร์ข้อความ", desc: "ป้ายโปร + หัวข้อ + คำโปรย + ปุ่ม", settingsTab: "hero" },
  tiles: { icon: "🧱", label: "การ์ดนำทาง", desc: "How To Order · All Product · Review …", settingsTab: "tiles" },
  perks: { icon: "⭐", label: "จุดเด่นร้าน", desc: "แถวการ์ดเล็ก (ลายของคุณเอง · ส่งไวทั่วไทย)", settingsTab: "perks" },
  categories: { icon: "🗂️", label: "หมวดหมู่สินค้า", desc: "การ์ดหมวด — แก้รูป/ชื่อที่ตั้งค่าระบบ" },
  products: { icon: "🔥", label: "แถวสินค้า", desc: "ขายดี / แนะนำ / ตามหมวด" },
  text: { icon: "📝", label: "ข้อความ", desc: "หัวข้อ + คำบรรยาย (ประกาศร้าน ฯลฯ)" },
  imagetext: { icon: "🖼️", label: "รูป + ข้อความ", desc: "2 คอลัมน์ รูปซ้ายหรือขวา + หัวข้อ/ข้อความ/ปุ่ม" },
  gallery: { icon: "🧩", label: "แกลเลอรีรูป / สไลด์", desc: "รูปหลายใบ เลื่อนเป็นสไลด์อัตโนมัติ หรือเรียงตาราง · กดแต่ละใบไปลิงก์ได้" },
  html: { icon: "🧑‍💻", label: "โค้ด HTML", desc: "วางโค้ดเอง (ระบบกรองแท็กอันตรายให้)" },
  video: { icon: "🎬", label: "วิดีโอ", desc: "ฝัง YouTube / Vimeo — วางลิงก์ได้เลย" },
  cards: { icon: "🃏", label: "การ์ดรูป + ข้อความ", desc: "การ์ด 2-4 ใบ · รูป หัวข้อ คำอธิบาย ปุ่ม" },
  cta: { icon: "📣", label: "กล่องชวนซื้อ", desc: "กล่องสีท้ายหน้า + ปุ่ม" },
};

/* ── จานเลือกบล็อกแบบมีหมวด (แนว Shopware: Block category + Favourites) ── */

/** หมวดในจานเลือกบล็อก */
export type BlockCat = "text" | "images" | "video" | "textimage" | "commerce" | "misc";

export const BLOCK_CATS: { id: BlockCat; label: string }[] = [
  { id: "text", label: "📝 ข้อความ" },
  { id: "images", label: "🖼 รูปภาพ" },
  { id: "video", label: "🎬 วิดีโอ" },
  { id: "textimage", label: "🖼️ รูป + ข้อความ" },
  { id: "commerce", label: "🛍 สินค้า & ร้านค้า" },
  { id: "misc", label: "🧑‍💻 อื่น ๆ" },
];

/**
 * 1 ตัวเลือกในจานเลือกบล็อก — หลายตัวเลือกอาจเป็นบล็อกชนิดเดียวกันแต่ตั้งค่ามาต่างกัน
 * (เช่น แกลเลอรี 2/3/4 คอลัมน์ · สไลด์ · แบนเนอร์สไลด์เต็มกว้าง ล้วนเป็น kind "gallery")
 */
export interface BlockVariant {
  /** id คงที่ — ใช้จำรายการโปรด (Favourites) ใน localStorage */
  id: string;
  kind: HomeBlockKind;
  cat: BlockCat;
  icon: string;
  label: string;
  desc: string;
  /** ค่าตั้งต้นที่ทับลงบน makeBlock(kind) */
  preset?: Partial<HomeBlock>;
}

export const BLOCK_LIBRARY: BlockVariant[] = [
  // ── ข้อความ ──
  { id: "text", kind: "text", cat: "text", icon: "📝", label: "ข้อความ", desc: "หัวข้อ + คำบรรยาย (ประกาศร้าน ฯลฯ)" },
  { id: "hero", kind: "hero", cat: "text", icon: "🎉", label: "แบนเนอร์ข้อความ", desc: "ป้ายโปร + หัวข้อ + คำโปรย + ปุ่ม" },
  { id: "cta", kind: "cta", cat: "text", icon: "📣", label: "กล่องชวนซื้อ", desc: "กล่องสีท้ายหน้า + ปุ่ม" },
  // ── รูปภาพ ──
  { id: "image", kind: "image", cat: "images", icon: "🖼", label: "ภาพเต็มกว้าง", desc: "แบนเนอร์ที่ออกแบบมาแล้ว · กดที่ภาพไปลิงก์ที่ตั้ง" },
  { id: "gallery-banner", kind: "gallery", cat: "images", icon: "🎠", label: "สไลด์แบนเนอร์เต็มกว้าง", desc: "แบนเนอร์หลายใบ เลื่อนทีละใบเต็มความกว้าง", preset: { display: "slider", cols: 1, heading: "" } },
  { id: "gallery-slider", kind: "gallery", cat: "images", icon: "🧩", label: "สไลด์รูปหลายใบ", desc: "เลื่อนอัตโนมัติ เห็นพร้อมกัน 2-4 ใบ (แบบ ALL PRODUCT)", preset: { display: "slider", cols: 3 } },
  { id: "gallery-grid-2", kind: "gallery", cat: "images", icon: "▦", label: "รูป 2 คอลัมน์", desc: "ตารางรูปนิ่ง 2 ใบต่อแถว · กดแต่ละใบไปลิงก์ได้", preset: { display: "grid", cols: 2, heading: "" } },
  { id: "gallery-grid-3", kind: "gallery", cat: "images", icon: "▦", label: "รูป 3 คอลัมน์", desc: "ตารางรูปนิ่ง 3 ใบต่อแถว · กดแต่ละใบไปลิงก์ได้", preset: { display: "grid", cols: 3, heading: "" } },
  { id: "gallery-grid-4", kind: "gallery", cat: "images", icon: "▦", label: "รูป 4 คอลัมน์", desc: "ตารางรูปนิ่ง 4 ใบต่อแถว · กดแต่ละใบไปลิงก์ได้", preset: { display: "grid", cols: 4, heading: "" } },
  // ── วิดีโอ ──
  { id: "video", kind: "video", cat: "video", icon: "🎬", label: "วิดีโอ YouTube / Vimeo", desc: "วางลิงก์วิดีโอได้เลย ระบบฝังให้เอง" },
  // ── รูป + ข้อความ ──
  { id: "imagetext-left", kind: "imagetext", cat: "textimage", icon: "🖼️", label: "รูปซ้าย + ข้อความ", desc: "2 คอลัมน์ รูปอยู่ซ้าย · หัวข้อ/ข้อความ/ปุ่มอยู่ขวา", preset: { align: "left" } },
  { id: "imagetext-right", kind: "imagetext", cat: "textimage", icon: "🖼️", label: "ข้อความ + รูปขวา", desc: "2 คอลัมน์ รูปอยู่ขวา · หัวข้อ/ข้อความ/ปุ่มอยู่ซ้าย", preset: { align: "right" } },
  { id: "cards", kind: "cards", cat: "textimage", icon: "🃏", label: "การ์ด 3 ใบ", desc: "รูป + หัวข้อ + คำอธิบาย + ปุ่ม ต่อใบ (เพิ่ม/ลดเหลือ 2-4 ใบได้)" },
  // ── สินค้า & ร้านค้า ──
  { id: "products-best", kind: "products", cat: "commerce", icon: "🔥", label: "แถวสินค้า — ขายดี", desc: "ดึงตามยอดขายจริงอัตโนมัติ", preset: { source: "best", heading: "🔥 สินค้าขายดี" } },
  { id: "products-featured", kind: "products", cat: "commerce", icon: "💛", label: "แถวสินค้า — แนะนำ", desc: "สินค้าที่ติ๊ก \"แนะนำ\" ไว้ในหลังบ้าน", preset: { source: "featured", heading: "💛 สินค้าแนะนำ" } },
  { id: "products-category", kind: "products", cat: "commerce", icon: "🗂️", label: "แถวสินค้า — ตามหมวด", desc: "เลือกหมวดแล้วดึงสินค้าหมวดนั้นมาโชว์", preset: { source: "category", heading: "" } },
  { id: "categories", kind: "categories", cat: "commerce", icon: "🗂️", label: "หมวดหมู่สินค้า", desc: "การ์ดหมวด — แก้รูป/ชื่อที่ตั้งค่าระบบ" },
  { id: "tiles", kind: "tiles", cat: "commerce", icon: "🧱", label: "การ์ดนำทาง", desc: "How To Order · All Product · Review …" },
  { id: "perks", kind: "perks", cat: "commerce", icon: "⭐", label: "จุดเด่นร้าน", desc: "แถวการ์ดเล็ก (ลายของคุณเอง · ส่งไวทั่วไทย)" },
  // ── อื่น ๆ ──
  { id: "html", kind: "html", cat: "misc", icon: "🧑‍💻", label: "โค้ด HTML", desc: "วางโค้ดเอง (ระบบกรองแท็กอันตรายให้)" },
];

let seq = 0;
export const newBlockId = (kind: HomeBlockKind) => `b-${kind}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** บล็อกใหม่พร้อมค่าเริ่มต้นตามชนิด */
export function makeBlock(kind: HomeBlockKind): HomeBlock {
  const base: HomeBlock = { id: newBlockId(kind), kind };
  switch (kind) {
    case "image":
      return { ...base, href: "/products" };
    case "products":
      return { ...base, source: "best", limit: 4, heading: "🔥 สินค้าขายดี" };
    case "text":
      return { ...base, heading: "หัวข้อ", body: "ข้อความที่อยากบอกลูกค้า" };
    case "imagetext":
      return { ...base, align: "left", heading: "หัวข้อ", body: "ข้อความประกอบรูป", btnLabel: "", btnHref: "/products" };
    case "gallery":
      return { ...base, cols: 3, images: [], display: "slider", heading: "ALL PRODUCT" };
    case "html":
      return { ...base, html: "<div style=\"text-align:center;padding:24px\">\n  <h2>เขียน HTML ตรงนี้</h2>\n</div>" };
    case "video":
      return { ...base, heading: "" };
    case "cards":
      return {
        ...base,
        heading: "",
        cards: Array.from({ length: 3 }, (_, i) => ({ title: `หัวข้อการ์ด ${i + 1}`, body: "คำอธิบายสั้น ๆ", btnLabel: "", btnHref: "/products" })),
      };
    case "cta":
      return {
        ...base,
        heading: "มีลายในใจแล้วใช่ไหม? มาเริ่มกันเลย!",
        body: "เลือกสินค้าที่ชอบ แล้วอัปโหลดลายของคุณ เดี๋ยวเราจัดการที่เหลือให้เอง",
        btnLabel: "เริ่มออกแบบสินค้าของฉัน →",
        btnHref: "/products",
      };
    default:
      return base;
  }
}

/**
 * ผังเริ่มต้น — สร้างจากค่าที่ตั้งไว้เดิม เพื่อให้หน้าแรกเหมือนก่อนมีระบบผังทุกประการ
 * tilesPos บอกว่าการ์ดนำทางเคยอยู่ตรงไหน (บน / ใต้แบนเนอร์ / ใต้จุดเด่น)
 */
export function defaultHomeBlocks(tilesPos: "top" | "hero" | "features" = "hero"): HomeBlock[] {
  const b = (kind: HomeBlockKind, extra: Partial<HomeBlock> = {}): HomeBlock => ({ ...makeBlock(kind), ...extra });
  const tiles = b("tiles");
  return [
    ...(tilesPos === "top" ? [tiles] : []),
    b("hero"),
    ...(tilesPos === "hero" ? [tiles] : []),
    b("perks"),
    ...(tilesPos === "features" ? [tiles] : []),
    b("categories", { heading: "เลือกตามหมวดหมู่" }),
    b("products", { source: "best", limit: 4, heading: "🔥 สินค้าขายดี" }),
    b("products", { source: "featured", limit: 4, heading: "💛 สินค้าแนะนำ" }),
    b("cta"),
  ];
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const KINDS = Object.keys(BLOCK_META) as HomeBlockKind[];

/** ทำความสะอาดผังที่อ่านจากฐานข้อมูล (ข้อมูลเสีย = ตัดทิ้งทีละบล็อก ไม่พังทั้งหน้า) */
export function homeBlocksOf(raw: unknown): HomeBlock[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .map((r, i): HomeBlock | null => {
      const o = r as Partial<HomeBlock>;
      if (!o || !KINDS.includes(o.kind as HomeBlockKind)) return null;
      const kind = o.kind as HomeBlockKind;
      const url = (v: unknown) => (/^(\/|https?:\/\/)/.test(str(v).trim()) ? str(v).trim() : undefined);
      return {
        id: str(o.id) || `b-${kind}-${i}`,
        kind,
        ...(o.hidden ? { hidden: true } : {}),
        ...(url(o.image) ? { image: url(o.image) } : {}),
        ...(url(o.href) ? { href: url(o.href) } : {}),
        ...(o.source === "best" || o.source === "featured" || o.source === "category" ? { source: o.source } : {}),
        ...(str(o.category) ? { category: str(o.category) } : {}),
        ...(Number(o.limit) > 0 ? { limit: Math.min(12, Math.floor(Number(o.limit))) } : {}),
        ...(str(o.heading) ? { heading: str(o.heading).slice(0, 200) } : {}),
        ...(str(o.body) ? { body: str(o.body).slice(0, 1000) } : {}),
        ...(str(o.btnLabel) ? { btnLabel: str(o.btnLabel).slice(0, 100) } : {}),
        ...(url(o.btnHref) ? { btnHref: url(o.btnHref) } : {}),
        ...(o.align === "right" ? { align: "right" as const } : o.align === "left" ? { align: "left" as const } : {}),
        ...(Array.isArray(o.images)
          ? {
              images: o.images
                .map((im) => ({ src: url((im as { src?: string })?.src) ?? "", href: url((im as { href?: string })?.href) }))
                .filter((im) => im.src)
                .slice(0, 12)
                .map((im) => ({ src: im.src, ...(im.href ? { href: im.href } : {}) })),
            }
          : {}),
        ...(Number(o.cols) >= 1 && Number(o.cols) <= 4 ? { cols: Math.floor(Number(o.cols)) } : {}),
        ...(o.display === "slider" || o.display === "grid" ? { display: o.display } : {}),
        ...(o.fit === "cover" || o.fit === "contain" ? { fit: o.fit } : {}),
        ...(GALLERY_RATIOS.includes(o.ratio as GalleryRatio) ? { ratio: o.ratio as GalleryRatio } : {}),
        ...(str(o.html) ? { html: str(o.html).slice(0, 100000) } : {}),
        // ลิงก์วิดีโอเก็บเฉพาะที่แปลงเป็น embed ได้จริง (YouTube / Vimeo เท่านั้น)
        ...(videoEmbedUrl(str(o.videoUrl)) ? { videoUrl: str(o.videoUrl).trim() } : {}),
        ...(Array.isArray(o.cards)
          ? {
              cards: o.cards
                .map((c): HomeCard => {
                  const cd = c as Partial<HomeCard>;
                  return {
                    title: str(cd?.title).trim().slice(0, 100),
                    ...(url(cd?.image) ? { image: url(cd?.image) } : {}),
                    ...(str(cd?.body).trim() ? { body: str(cd?.body).trim().slice(0, 300) } : {}),
                    ...(str(cd?.btnLabel).trim() ? { btnLabel: str(cd?.btnLabel).trim().slice(0, 60) } : {}),
                    ...(url(cd?.btnHref) ? { btnHref: url(cd?.btnHref) } : {}),
                  };
                })
                .filter((cd) => cd.title || cd.image)
                .slice(0, 4),
            }
          : {}),
      };
    })
    .filter((x): x is HomeBlock => !!x);
  return out.length ? out : undefined;
}

/** เฉพาะบล็อกที่ลูกค้าเห็น */
export const visibleBlocks = (blocks: HomeBlock[]) => blocks.filter((b) => !b.hidden);
