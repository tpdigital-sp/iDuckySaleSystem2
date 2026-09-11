/**
 * 📄 แบ่งแถวใบงานลงกระดาษ A4 ไม่เกิน N หน้า (เจ้าของร้านสั่ง 11 ก.ย. 69: "ปริ้นได้มากสุด 3 หน้า เกินนั้นเขียนแจ้ง")
 *
 * ฟังก์ชันล้วน — หน้าพิมพ์วัดความสูงจริงของแต่ละแถว (px ที่ความกว้าง A4) แล้วส่งมาให้ตัดหน้า
 * ไม่ตัดกลางแถว: แถวไหนไม่พอที่เหลือของหน้า ก็ยกไปขึ้นหน้าใหม่ทั้งแถว (แถวที่สูงกว่าหน้าเดียวยังลงหน้าของมันเอง ให้ overflow hidden ตัด)
 *
 * เมื่อแถวเกินกว่าจะพิมพ์ครบใน maxPages: หน้า 1 เว้นที่ให้กรอบเตือนด้านบน (cutTopPx)
 * และหน้าสุดท้ายเว้นที่ให้กรอบเตือนท้ายหน้า (cutEndPx) แล้วพิมพ์เท่าที่พอดี · แถวที่เหลือ = ดูบนมือถือ
 */

export type PageRange = { start: number; end: number };

export type PaginateOpts = {
  /** ที่ว่างสำหรับแถวบนหน้า 1 (หัก ใบปะหน้า/หัวใบงาน/ท้ายบิล แล้ว) */
  cap1: number;
  /** ที่ว่างสำหรับแถวบนหน้าต่อ ๆ ไป (หัก หัวใบซ้ำ + หัวตาราง แล้ว) */
  capN: number;
  maxPages: number;
  /** ความสูงกรอบเตือนบนหน้า 1 เมื่อพิมพ์ไม่ครบ */
  cutTopPx: number;
  /** ความสูงกรอบเตือน + บรรทัดรวมท้ายหน้าสุดท้าย เมื่อพิมพ์ไม่ครบ */
  cutEndPx: number;
};

/**
 * ยัดแถวลงหน้าแบบเรียงต่อกัน — คืนช่วงต่อหน้า (end = exclusive) · หยุดเมื่อครบ maxPages
 * หน้า 1 มีใบปะหน้า/หัวใบงาน/ท้ายบิลกินที่ — ถ้าแถวแรกไม่พอที่เหลือ (เช่น แถวมีรูป 15 ใบ + มีภาพก่อนปิดกล่อง)
 * ให้หน้า 1 ว่างแถวแล้วเริ่มแถวที่หน้า 2 ดีกว่าปล่อยให้แถวโดนตัดขอบกระดาษ (ทำได้เมื่อมีหน้าให้ไหลต่อ)
 * หน้าอื่นแถวแรกลงเสมอ กันวนไม่รู้จบเมื่อแถวสูงกว่าหน้า
 */
function fill(heights: number[], caps: (page: number) => number, maxPages: number): PageRange[] {
  const pages: PageRange[] = [];
  let i = 0;
  while (i < heights.length && pages.length < maxPages) {
    const cap = caps(pages.length);
    const start = i;
    const mayBeEmpty = pages.length === 0 && maxPages > 1;
    let used = 0;
    while (i < heights.length) {
      const h = heights[i];
      if ((i > start || mayBeEmpty) && used + h > cap) break;
      used += h;
      i++;
    }
    pages.push({ start, end: i });
  }
  return pages;
}

export function paginateRows(heights: number[], o: PaginateOpts): PageRange[] {
  const maxPages = Math.max(1, Math.floor(o.maxPages));
  if (heights.length === 0) return [{ start: 0, end: 0 }];

  // รอบแรก: ไม่เผื่อกรอบเตือน — ถ้าครบทุกแถวก็จบ
  const plain = fill(heights, (p) => (p === 0 ? o.cap1 : o.capN), maxPages);
  if (plain[plain.length - 1].end >= heights.length) return plain;

  // พิมพ์ไม่ครบ: หน้า 1 เว้นที่กรอบเตือนบน · หน้าสุดท้ายเว้นที่กรอบเตือนท้าย (หน้าเดียว = เว้นทั้งคู่)
  const cut = fill(
    heights,
    (p) => {
      const base = p === 0 ? o.cap1 - o.cutTopPx : o.capN;
      return p === maxPages - 1 ? base - o.cutEndPx : base;
    },
    maxPages
  );
  return cut;
}

/** จำนวนแถวที่ได้พิมพ์จริง */
export const printedRowsOf = (pages: PageRange[]) => pages[pages.length - 1]?.end ?? 0;
