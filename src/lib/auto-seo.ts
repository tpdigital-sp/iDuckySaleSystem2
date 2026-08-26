import { CATEGORIES, type Product } from "@/lib/products";

/**
 * เขียน SEO/AEO อัตโนมัติจากข้อมูลสินค้า (ชื่อ/หมวด/ราคา/ตัวเลือก/จุดเด่น)
 * ใช้ 2 ที่: หน้าแก้ไขสินค้า (เติมช่องให้) และหน้าสินค้าจริง (fallback เมื่อแอดมินยังไม่เขียนเอง
 * — ทุกสินค้าจึงมี meta + FAQ ครบโดยไม่ต้องไล่แก้ทีละตัว)
 */

export interface AutoSeoInput {
  name: string;
  price?: number;
  categoryId?: string;
  options?: { label: string; choices: { name: string }[] }[];
  highlights?: string[];
}

export interface AutoSeo {
  title: string;
  description: string;
  keywords: string[];
  faqs: { q: string; a: string }[];
}

/** ตัดที่ขอบคำ — ไม่ให้คำท้ายขาดกลางคำ */
function cut(t: string, n: number): string {
  return t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, "");
}

/**
 * คำบริการที่ลูกค้าใช้ค้นหางานสั่งทำ ("รับทำ…", "รับสกรีน…") เลือกตามหมวด
 * — ร้านเป็นงานสั่งทำ คนค้นด้วยคำพวกนี้มากกว่าชื่อสินค้าเฉย ๆ
 */
const SERVICE_VERBS: Record<string, string[]> = {
  apparel: ["รับสกรีน", "รับปัก", "รับทำ"],
  fabric: ["รับสกรีน", "รับทำ", "รับผลิต"],
  home: ["รับสกรีน", "รับทำ", "รับผลิต"],
  bag: ["รับสกรีน", "รับทำ", "รับผลิต"],
  "sticker-paper": ["รับพิมพ์", "รับทำ", "รับผลิต"],
  "card-photo": ["รับพิมพ์", "รับทำ", "รับผลิต"],
  banner: ["รับพิมพ์", "รับทำ", "รับผลิต"],
  "calendar-frame": ["รับพิมพ์", "รับทำ", "รับผลิต"],
  gifts: ["รับปัก", "รับทำ", "รับผลิต"],
};
const DEFAULT_VERBS = ["รับทำ", "รับผลิต", "รับสกรีน"];

/**
 * variant = จำนวนครั้งที่กดปุ่ม "✨ เขียนให้อัตโนมัติ" — เลื่อนไปใช้สำนวน/คำค้น/คำถามชุดถัดไป
 * (variant 0 = ชุดมาตรฐาน ซึ่งหน้าเว็บจริงใช้เป็น fallback จึงต้องคงข้อความเดิมไว้เสมอ)
 */
export function autoSeoOf(p: AutoSeoInput, variant = 0): AutoSeo {
  const name = p.name.trim() || "สินค้า";
  const price = Number(p.price) || 0;
  const cat = CATEGORIES.find((c) => c.id === p.categoryId);
  const opts = (p.options ?? [])
    .map((o) => ({ label: o.label.trim(), names: o.choices.map((c) => c.name.trim()).filter(Boolean) }))
    .filter((o) => o.label && o.names.length > 0);
  // จุดเด่นที่ซ้ำกับชื่อสินค้า (หลายตัว import มาแล้ว highlight = ชื่อ) ไม่เอามาซ้ำใน description
  const hi = (p.highlights ?? []).map((h) => h.trim()).filter((h) => h && !name.includes(h) && !h.includes(name));

  const v = Math.abs(Math.trunc(variant)) || 0;
  /** หยิบสำนวนชุดที่ v (วนกลับต้นเมื่อครบรอบ) */
  const pick = <T>(list: T[]): T => list[v % list.length];

  const verbs = SERVICE_VERBS[p.categoryId ?? ""] ?? DEFAULT_VERBS;
  const verb = verbs[v % verbs.length];
  const verb2 = verbs[(v + 1) % verbs.length];
  // ชื่อสั้นไว้ผสมคำค้น (ตัดวงเล็บออก เช่น "Jibbitz (อะคริลิคติดรองเท้า)" → "Jibbitz")
  const shortName = name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim() || name;
  // คำไทยเขียนติดกัน ("รับทำพวงกุญแจ") ชื่ออังกฤษเว้นวรรค ("รับทำ Jibbitz")
  const compound = (v2: string, w: string) => (/^[A-Za-z0-9]/.test(w) ? `${v2} ${w}` : `${v2}${w}`);
  const suffix = (w: string, s2: string) => (/[A-Za-z0-9]$/.test(w) ? `${w} ${s2}` : `${w}${s2}`);

  const priceTail = price ? ` เริ่มต้น ${price} บาท` : "";
  // ใส่ราคาแล้วยาวเกิน 60 → ตัดท่อนราคาออกทั้งท่อน (กันเหลือคำค้างแบบ "เริ่มต้น" เฉย ๆ)
  const titleShape = pick<(tail: string) => string>([
    (t) => `${verb} ${name} พิมพ์ลายตามสั่ง${t}`,
    (t) => `${name} งานสั่งทำ ใส่ลาย/รูปของคุณเอง${t}`,
    (t) => `${verb} ${name} ตามแบบที่คุณออกแบบ${t}`,
    (t) => `${name} พิมพ์ลายตามสั่ง${t} | iDucky`,
  ]);
  const titleFull = titleShape(priceTail);
  const title = titleFull.length <= 60 ? titleFull : cut(titleShape(""), 60);

  const optTail = opts.length ? ` มี${opts.map((o) => o.label).slice(0, 3).join(" / ")}ให้เลือก` : "";
  const hiTail = hi[0] ? ` · ${hi[0]}` : "";
  const description = cut(
    pick([
      `${verbs.slice(0, 2).join("/")} ${name} งานสั่งทำใส่ลาย/รูปของคุณเอง${optTail}${priceTail}${hiTail}` +
        " · สั่งง่าย ส่งไวทั่วไทย ตรวจแบบก่อนผลิตทุกชิ้น",
      `${name} สั่งทำตามแบบของคุณ ส่งไฟล์ลายมาได้เลย${optTail}${priceTail}${hiTail}` +
        " · ทีมงานจัดแบบให้ตรวจก่อนเริ่มผลิต ส่งทั่วไทย",
      `${verb} ${name} งานสั่งทำเฉพาะคุณ${optTail}${priceTail}${hiTail}` +
        " · งานพิมพ์คมชัด ตรวจแบบก่อนผลิตทุกออเดอร์ ติดตามสถานะได้ตลอด",
      `อยากได้ ${name} เป็นลายของตัวเอง? ${verb2}ตามแบบที่ส่งมา${optTail}${priceTail}${hiTail}` +
        " · สั่งง่ายผ่านหน้าเว็บ ตรวจแบบก่อนผลิต ส่งทั่วไทย",
    ]),
    160
  );

  // คำค้นเสริมชุดหมุน — กดซ้ำแล้วได้คำที่ลูกค้าพิมพ์หาจริงคนละมุม
  const extraKeys = pick([
    [] as string[],
    [compound("สั่งทำ", shortName), suffix(shortName, "ตามสั่ง")],
    [suffix(shortName, "พิมพ์ลาย"), compound("ออกแบบ", shortName)],
    [suffix(shortName, "งานสั่งทำ"), compound("รับผลิต", shortName)],
  ]);
  const keywords = [
    ...new Set(
      [
        compound(verb, shortName),
        ...(cat ? cat.name.split(" / ").map((n) => compound(verb, n.trim())) : []),
        name,
        ...extraKeys,
        ...verbs,
        "งานสั่งทำ",
        ...(cat ? [cat.name, cat.nameEn] : []),
        ...opts.flatMap((o) => o.names.slice(0, 2)),
        "พิมพ์ลายตามสั่ง",
        "ของขวัญ",
        "iDucky",
      ]
        .map((k) => k.trim())
        .filter(Boolean)
    ),
  ].slice(0, 14);

  // คำตอบตั้งใจไม่ระบุตัวเลขวัน/เงื่อนไขที่ระบบไม่รู้จริง — กันสัญญาเกินจริงกับลูกค้า
  const priceFaq = pick([
    {
      q: `${name} ราคาเท่าไหร่?`,
      a: price
        ? `เริ่มต้นชิ้นละ ${price} บาท — ราคาจริงขึ้นกับตัวเลือกและจำนวนที่สั่ง ดูราคาแต่ละแบบได้ในหน้าสินค้า`
        : "ราคาขึ้นกับแบบและจำนวนที่สั่ง ดูรายละเอียดได้ในหน้าสินค้า หรือทักไลน์ร้านได้เลย",
    },
    {
      q: `สั่ง ${name} เริ่มต้นกี่บาท?`,
      a: price
        ? `เริ่มที่ชิ้นละ ${price} บาท เลือกตัวเลือกและใส่จำนวนในหน้าสินค้า ระบบคิดราคาให้ทันทีก่อนสั่ง`
        : "เลือกตัวเลือกและใส่จำนวนในหน้าสินค้า ระบบจะคิดราคาให้ทันที หรือทักไลน์ร้านให้ช่วยตีราคาได้",
    },
    {
      q: `${name} คิดราคายังไง?`,
      a: price
        ? `คิดตามตัวเลือกที่เลือกและจำนวนที่สั่ง เริ่มต้นชิ้นละ ${price} บาท — เลือกครบแล้วราคารวมจะขึ้นให้เห็นก่อนกดสั่ง`
        : "คิดตามตัวเลือกที่เลือกและจำนวนที่สั่ง เลือกครบแล้วราคารวมจะขึ้นให้เห็นก่อนกดสั่ง",
    },
    {
      q: `อยากรู้ราคา ${name} ดูได้ที่ไหน?`,
      a: price
        ? `ดูได้ในหน้าสินค้านี้เลย เริ่มต้นชิ้นละ ${price} บาท และเปลี่ยนตามตัวเลือก/จำนวนที่เลือก`
        : "ดูได้ในหน้าสินค้านี้เลย ราคาจะเปลี่ยนตามตัวเลือกและจำนวนที่เลือก",
    },
  ]);

  const optFaq = opts.length
    ? [
        pick([
          {
            q: `${name} มี${opts[0].label}อะไรให้เลือกบ้าง?`,
            a: opts.map((o) => `${o.label}: ${o.names.slice(0, 6).join(", ")}`).join(" · "),
          },
          {
            q: `${name} เลือกแบบไหนได้บ้าง?`,
            a: opts.map((o) => `${o.label} เลือกได้ ${o.names.slice(0, 6).join(", ")}`).join(" · "),
          },
          {
            q: `${name} มีตัวเลือกอะไรบ้าง?`,
            a: `เลือกได้ทั้ง ${opts.map((o) => o.label).join(" / ")} — ${opts
              .map((o) => `${o.label}: ${o.names.slice(0, 6).join(", ")}`)
              .join(" · ")}`,
          },
          {
            q: `สั่ง ${name} ต้องเลือกอะไรบ้าง?`,
            a: opts.map((o) => `${o.label} (${o.names.slice(0, 6).join(", ")})`).join(" · ") + " เลือกครบแล้วกดใส่ตะกร้าได้เลย",
          },
        ]),
      ]
    : [];

  const artFaq = pick([
    {
      q: `${verb} ${name} เป็นลายของตัวเองได้ไหม?`,
      a: "ได้ครับ ส่งไฟล์ลาย/รูปที่ต้องการมาตอนสั่งซื้อ ทีมงานจัดทำแบบให้ตรวจและอนุมัติก่อนเริ่มผลิตทุกครั้ง",
    },
    {
      q: `${name} ใส่รูป/โลโก้ของเราเองได้หรือเปล่า?`,
      a: "ได้ครับ แนบไฟล์รูปหรือโลโก้มาตอนสั่งซื้อได้เลย ทีมงานจะจัดวางเป็นแบบให้ดูก่อน อนุมัติแล้วค่อยเริ่มผลิต",
    },
    {
      q: "ส่งไฟล์ลายเองได้ไหม ต้องเป็นไฟล์แบบไหน?",
      a: "ส่งเองได้ครับ แนบไฟล์ภาพความละเอียดสูง (PNG/JPG) หรือไฟล์งานออกแบบมาได้ ถ้ายังไม่มีไฟล์พร้อม ทักไลน์ร้านให้ทีมงานช่วยจัดหน้าให้ได้",
    },
    {
      q: `ไม่มีไฟล์ลาย สั่ง ${name} ได้ไหม?`,
      a: "ได้ครับ ส่งไอเดียหรือรูปที่มีมาก่อน ทีมงานช่วยจัดแบบให้ แล้วส่งกลับให้ตรวจก่อนเริ่มผลิตทุกครั้ง",
    },
  ]);

  const shipFaq = pick([
    {
      q: "สั่งแล้วกี่วันได้ของ?",
      a: "หลังยืนยันการชำระเงินและอนุมัติแบบ ทีมงานจะเริ่มผลิตและจัดส่งทั่วไทย ติดตามสถานะได้จากลิงก์ออเดอร์ตลอดเวลา",
    },
    {
      q: "ขั้นตอนหลังสั่งซื้อเป็นยังไง?",
      a: "สั่ง → ชำระเงิน → ทีมงานส่งแบบให้ตรวจ → อนุมัติแล้วเข้าคิวผลิต → จัดส่งทั่วไทย พร้อมเลขพัสดุให้ติดตาม",
    },
    {
      q: "ติดตามสถานะออเดอร์ได้ไหม?",
      a: "ได้ครับ เปิดลิงก์ออเดอร์ดูสถานะได้ทุกขั้น ตั้งแต่ตรวจแบบ เข้าคิวผลิต จนถึงเลขพัสดุตอนจัดส่ง",
    },
    {
      q: "จัดส่งยังไงบ้าง?",
      a: "จัดส่งทั่วไทยหลังงานผลิตเสร็จ พร้อมเลขพัสดุให้ติดตามในลิงก์ออเดอร์ เลือกวิธีจัดส่งได้ตอนสั่งซื้อ",
    },
  ]);

  const faqs: AutoSeo["faqs"] = [priceFaq, ...optFaq, artFaq, shipFaq];

  return { title, description, keywords, faqs };
}

/** สะดวกเรียกจาก Product เต็มตัว (หน้าเว็บจริง) */
export function productAutoSeo(p: Product): AutoSeo {
  return autoSeoOf({ name: p.name, price: p.price, categoryId: p.category, options: p.options, highlights: p.highlights });
}
