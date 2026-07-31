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

export function autoSeoOf(p: AutoSeoInput): AutoSeo {
  const name = p.name.trim() || "สินค้า";
  const price = Number(p.price) || 0;
  const cat = CATEGORIES.find((c) => c.id === p.categoryId);
  const opts = (p.options ?? [])
    .map((o) => ({ label: o.label.trim(), names: o.choices.map((c) => c.name.trim()).filter(Boolean) }))
    .filter((o) => o.label && o.names.length > 0);
  const hi = (p.highlights ?? []).map((h) => h.trim()).filter(Boolean);

  const title = cut(`${name} พิมพ์ลายตามสั่ง${price ? ` เริ่มต้น ${price} บาท` : ""}`, 60);
  const description = cut(
    `${name} สั่งทำลายของคุณเอง` +
      (opts.length ? ` มี${opts.map((o) => o.label).slice(0, 3).join(" / ")}ให้เลือก` : "") +
      (price ? ` เริ่มต้น ${price} บาท` : "") +
      (hi[0] ? ` · ${hi[0]}` : "") +
      " · สั่งง่าย ส่งไวทั่วไทย ตรวจแบบก่อนผลิตทุกชิ้น",
    160
  );
  const keywords = [
    ...new Set(
      [name, ...(cat ? [cat.name, cat.nameEn] : []), ...opts.flatMap((o) => o.names.slice(0, 3)), "พิมพ์ลาย", "สั่งทำ", "ตามสั่ง", "ของขวัญ", "iDucky"]
        .map((k) => k.trim())
        .filter(Boolean)
    ),
  ].slice(0, 12);

  // คำตอบตั้งใจไม่ระบุตัวเลขวัน/เงื่อนไขที่ระบบไม่รู้จริง — กันสัญญาเกินจริงกับลูกค้า
  const faqs: AutoSeo["faqs"] = [
    {
      q: `${name} ราคาเท่าไหร่?`,
      a: price
        ? `เริ่มต้นชิ้นละ ${price} บาท — ราคาจริงขึ้นกับตัวเลือกและจำนวนที่สั่ง ดูราคาแต่ละแบบได้ในหน้าสินค้า`
        : "ราคาขึ้นกับแบบและจำนวนที่สั่ง ดูรายละเอียดได้ในหน้าสินค้า หรือทักไลน์ร้านได้เลย",
    },
    ...(opts.length
      ? [
          {
            q: `${name} มี${opts[0].label}อะไรให้เลือกบ้าง?`,
            a: opts.map((o) => `${o.label}: ${o.names.slice(0, 6).join(", ")}`).join(" · "),
          },
        ]
      : []),
    {
      q: `สั่ง ${name} เป็นลายของตัวเองได้ไหม?`,
      a: "ได้ครับ ส่งไฟล์ลาย/รูปที่ต้องการมาตอนสั่งซื้อ ทีมงานจัดทำแบบให้ตรวจและอนุมัติก่อนเริ่มผลิตทุกครั้ง",
    },
    {
      q: "สั่งแล้วกี่วันได้ของ?",
      a: "หลังยืนยันการชำระเงินและอนุมัติแบบ ทีมงานจะเริ่มผลิตและจัดส่งทั่วไทย ติดตามสถานะได้จากลิงก์ออเดอร์ตลอดเวลา",
    },
  ];

  return { title, description, keywords, faqs };
}

/** สะดวกเรียกจาก Product เต็มตัว (หน้าเว็บจริง) */
export function productAutoSeo(p: Product): AutoSeo {
  return autoSeoOf({ name: p.name, price: p.price, categoryId: p.category, options: p.options, highlights: p.highlights });
}
