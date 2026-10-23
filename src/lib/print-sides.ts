/**
 * 🔄 ด้านหน้า/ด้านหลังของไฟล์ทีละหน้าจากจอออกแบบ (เจ้าของร้านแจ้ง 23 ต.ค. 69 OD-261023-1997)
 *
 * โปสการ์ดพิมพ์ 2 ด้าน 8 ใบ = ไฟล์ 16 หน้าเรียง หน้า1 → หลัง1 → หน้า2 → หลัง2 …
 * เดิมใช้กติกาปฏิทิน "หน้าแรก = ปก · หน้า 2 เป็นต้นไป = ด้านหลัง" → ออเดอร์ติดป้ายหน้า 1 ไฟล์ หลัง 15 ไฟล์ ฝ่ายผลิตดูไม่ออก
 * ชื่อหน้าอยู่ในสเปคอยู่แล้ว (" · 16 ไฟล์: 1.ใบที่ 1 · ด้านหน้า 2.ใบที่ 1 · ด้านหลัง …") → แยกด้านจากชื่อหน้าแทน
 * ชื่อหน้าไม่บอกด้าน (ปฏิทินรายเดือน "ปก/มกราคม…") = ใช้กติกาเดิม
 */

/** คีย์สเปคตำแหน่งลาย — ค่าเดียวกับ PLACEMENT_SPEC_LABEL ใน design-templates.ts (ไฟล์นี้ไม่ import อะไรเลย ให้ products.ts ใช้ได้) */
export const SPEC_LABEL = "ตำแหน่งลาย (ทีมผลิต)";

export type PrintSide = "front" | "back";

/** ด้านของหน้าจากชื่อหน้า (ไม่บอก = null) */
export function pageSideOf(name: string): PrintSide | null {
  if (/ด้านหลัง|\bback\b/i.test(name)) return "back";
  if (/ด้านหน้า|\bfront\b/i.test(name)) return "front";
  return null;
}

/**
 * ชื่อหน้าทั้งหมดของแบบ 1 ลายจากสเปค (" · N ไฟล์: 1.… 2.… ") · ไม่มีรายการ/แกะไม่ครบ = null
 * ชื่อหน้ามี " · " ข้างในได้ ("ใบที่ 1 · ด้านหน้า") → ตัดที่ " <เลขถัดไป>." แทน · หน้าสุดท้ายจบที่หัวข้อถัดไปของสเปค
 */
export function specPageNames(spec: string): string[] | null {
  const m = / (\d+) ไฟล์: 1\./.exec(spec);
  if (!m) return null;
  const n = Number(m[1]);
  let pos = m.index + m[0].length;
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    let end: number;
    if (i < n) {
      end = spec.indexOf(` ${i + 1}.`, pos);
      if (end < 0) return null;
    } else {
      const ends = [" · ชุดละ ", " (", " · รูป ", " · กรอบ"].map((t) => spec.indexOf(t, pos)).filter((x) => x >= 0);
      end = ends.length ? Math.min(...ends) : spec.length;
    }
    out.push(spec.slice(pos, end).trim());
    pos = end + ` ${i + 1}.`.length;
  }
  return out;
}

/** แยกสเปคหลายลาย (คั่น " | ") */
function specsOf(raw: string | undefined): string[] {
  return String(raw ?? "")
    .split(" | ")
    .filter(Boolean);
}

/** ชื่อหน้าของทุกลาย (ทุกหน้าต้องบอกด้านได้) · ไม่ครบ = null */
function sideListsOf(specRaw: string | undefined): PrintSide[][] | null {
  const specs = specsOf(specRaw);
  if (!specs.length) return null;
  const lists = specs.map(specPageNames);
  if (lists.some((l) => !l?.length)) return null;
  const sides = lists.map((l) => l!.map(pageSideOf));
  return sides.every((l) => l.every(Boolean)) ? (sides as PrintSide[][]) : null;
}

/**
 * จัดไฟล์ของแบบจากจอออกแบบใหม่ตามด้านจริง — รับได้ 2 รูปแบบ
 *  ก) `front` = หน้าแรกของแต่ละลาย · `back` = หน้า 2 เป็นต้นไปของทุกลายต่อกัน (แบบที่ตะกร้า/จอส่งมา)
 *  ข) `front` = ด้านหน้าทุกหน้า · `back` = ด้านหลังทุกหน้า (แยกกองแล้ว แต่ลำดับไม่ตรงหน้าในไฟล์)
 * คืน urls เรียงตามหน้าในไฟล์ PDF ของแต่ละลาย + back = เฉพาะหน้าที่เป็นด้านหลังจริง
 * จำนวนไม่ตรงกับสเปค / ชื่อหน้าไม่บอกด้าน / เรียงถูกอยู่แล้ว = null (ใช้ตามที่ส่งมา)
 */
export function calSideSplit(specRaw: string | undefined, front: string[], back: string[]): { urls: string[]; back: string[] } | null {
  const lists = sideListsOf(specRaw);
  if (!lists) return null;
  const nFront = lists.reduce((a, l) => a + l.filter((x) => x === "front").length, 0);
  const nBack = lists.reduce((a, l) => a + l.filter((x) => x === "back").length, 0);
  const total = nFront + nBack;
  const urls: string[] = [];
  const backs: string[] = [];
  if (front.length === lists.length && front.length + back.length === total) {
    // ก) หน้าแรกของลาย + หน้าที่เหลือต่อกัน
    let off = 0;
    lists.forEach((sides, k) => {
      const pages = [front[k], ...back.slice(off, off + sides.length - 1)];
      off += sides.length - 1;
      pages.forEach((u, j) => {
        urls.push(u);
        if (sides[j] === "back") backs.push(u);
      });
    });
  } else if (front.length === nFront && back.length === nBack) {
    // ข) แยกกองหน้า/หลังแล้ว — สลับกลับตามลำดับหน้า
    let f = 0;
    let b = 0;
    for (const sides of lists)
      for (const side of sides) {
        const u = side === "back" ? back[b++] : front[f++];
        urls.push(u);
        if (side === "back") backs.push(u);
      }
  } else return null;
  const same = urls.length === front.length + back.length && backs.length === back.length && backs.every((u, i) => u === back[i]);
  const inOrder = same && urls.every((u, i) => u === [...front, ...back][i]);
  return inOrder ? null : { urls, back: backs };
}

/** ซ่อมรายการในออเดอร์ที่บันทึกแบบเดิม (หน้าแรกของแต่ละลายก่อน · หน้า 2+ ต่อท้ายเป็น "ด้านหลัง") — ไม่ต้องซ่อม = null */
export function fixItemSides(it: { artworkUrls?: string[]; artworkBackUrls?: string[]; sel?: Record<string, string> }) {
  const urls = it.artworkUrls ?? [];
  const back = (it.artworkBackUrls ?? []).filter((u) => urls.includes(u));
  if (!back.length) return null;
  const front = urls.filter((u) => !back.includes(u));
  const r = calSideSplit(it.sel?.[SPEC_LABEL], front, back);
  // เรียงตามหน้าอยู่แล้ว (หน้า/หลังถูก) = ไม่ต้องซ่อม
  if (!r || (r.urls.every((u, i) => u === urls[i]) && r.back.length === back.length && r.back.every((u) => back.includes(u)))) return null;
  return r;
}

export interface SideCard {
  /** ป้ายใบ ("ใบที่ 1") · ว่าง = ใบเดียว/ชื่อหน้าไม่บอกใบ */
  label: string;
  front?: { url: string; page: number };
  back?: { url: string; page: number };
}
export interface SideDesign {
  /** ลายที่ N (เริ่ม 1) */
  no: number;
  cards: SideCard[];
  /** "ชุดละ 8 ใบ: ใบที่ 1 พิมพ์ 1 ใบ · แยกแบบ …" จากสเปค */
  repeat?: string;
  pages: number;
}

/**
 * 📮 ใบสรุปหน้า-หลัง: จับคู่ไฟล์ทีละหน้าเป็น "ใบ" (ด้านหน้า + ด้านหลัง) จากชื่อหน้าในสเปค
 * ด้านหน้า = ไฟล์ที่ไม่ใช่ด้านหลังตามลำดับ · ด้านหลัง = artworkBackUrls ตามลำดับ (ไม่ขึ้นกับว่าเรียงสลับหรือแยกกอง)
 * จำนวนหน้า/หลังไม่ตรงชื่อหน้า (ออเดอร์เก่าก่อนแก้ 23 ต.ค. 69 ที่ยังไม่ซ่อม) / ไม่มีด้านหลัง = null
 */
export function sideSheetOf(it: { artworkUrls?: string[]; artworkBackUrls?: string[]; sel?: Record<string, string> }): SideDesign[] | null {
  const specs = specsOf(it.sel?.[SPEC_LABEL]);
  const urls = it.artworkUrls ?? [];
  const backSet = new Set((it.artworkBackUrls ?? []).filter((u) => urls.includes(u)));
  if (!specs.length || !backSet.size) return null;
  const lists = specs.map(specPageNames);
  if (lists.some((l) => !l?.length || !l.every((n) => pageSideOf(n)))) return null;
  const fronts = urls.filter((u) => !backSet.has(u));
  const backs = urls.filter((u) => backSet.has(u));
  const need = (side: PrintSide) => lists.reduce((a, l) => a + l!.filter((n) => pageSideOf(n) === side).length, 0);
  if (fronts.length !== need("front") || backs.length !== need("back")) return null;
  let f = 0;
  let b = 0;
  const out: SideDesign[] = lists.map((names, k) => {
    const cards: SideCard[] = [];
    names!.forEach((name, j) => {
      const side = pageSideOf(name)!;
      const url = side === "back" ? backs[b++] : fronts[f++];
      // ใบเดียว ("ด้านหน้า"/"ด้านหลัง" เฉย ๆ) = ป้ายว่าง → ใบที่ N ตามลำดับตอนแสดง
      const label = name.replace(/\s*·?\s*(ด้านหน้า|ด้านหลัง)[^·]*$/, "").trim();
      let card = cards[cards.length - 1];
      if (!card || card.label !== label || card[side]) {
        card = { label };
        cards.push(card);
      }
      card[side] = { url, page: j + 1 };
    });
    return { no: k + 1, cards, pages: names!.length, repeat: /ชุดละ \d+ ใบ: [^(·]*(?:· แยกแบบ [^(]*)?/.exec(specs[k])?.[0]?.trim() };
  });
  return out;
}

/**
 * ป้ายหน้าภาษาอังกฤษ ("Card01-Front") — ชื่อหน้าใน PDF (PageLabels) / .ai รุ่นเก่าอ่านไทยไม่ได้
 * ชื่อไม่บอกใบ/ด้าน = "P01"
 */
export function printPageTag(name: string, i: number): string {
  const card = /(?:ใบที่|ชิ้นที่|แผ่นที่|card)\s*(\d+)/i.exec(name)?.[1];
  const side = pageSideOf(name);
  const pad = (n: number | string) => String(n).padStart(2, "0");
  if (!side) return card ? `Card${pad(card)}` : `P${pad(i + 1)}`;
  return `${card ? `Card${pad(card)}-` : ""}${side === "front" ? "Front" : "Back"}`;
}

/**
 * 🖼 แบบงาน (proofs) ของงาน 2 ด้านที่ลูกค้าออกแบบเอง → จับคู่เป็นใบ (หน้า | หลัง) จากโน้ต "ใบที่ 1 · ด้านหน้า — ลูกค้าจัดวางเอง…"
 * กล่อง "แบบที่เราส่งให้ตรวจ" เดิมเรียงรูปที่ 1–16 ปนหน้า/หลัง ดูยาก (เจ้าของร้านแจ้ง 23 ต.ค. 69 OD-261023-1997)
 * page = เลขรูป (เริ่ม 1) · ไม่ใช่งานแบบนี้ / โน้ตไม่บอกด้าน = null
 */
export function proofSideDesigns(proofs: { url: string; note?: string }[], spec?: string): SideDesign[] | null {
  if (proofs.length < 2 || !proofs.every((p) => /ลูกค้าจัดวางเองบนเทมเพลต/.test(p.note ?? ""))) return null;
  const heads = proofs.map((p) => (p.note ?? "").split(" — ")[0].trim());
  if (!heads.every((h) => pageSideOf(h)) || !heads.some((h) => pageSideOf(h) === "back")) return null;
  const out: SideDesign[] = [];
  heads.forEach((h, j) => {
    // "ลายที่ 2 · ใบที่ 1 · ด้านหน้า" = หลายลาย
    const no = Number(/^ลายที่ (\d+) · /.exec(h)?.[1] ?? 1);
    let d = out.find((x) => x.no === no);
    if (!d) {
      d = { no, cards: [], pages: 0, repeat: undefined };
      out.push(d);
    }
    const side = pageSideOf(h)!;
    const label = h.replace(/^ลายที่ \d+ · /, "").replace(/\s*·?\s*(ด้านหน้า|ด้านหลัง)[^·]*$/, "").trim();
    let card = d.cards[d.cards.length - 1];
    if (!card || card.label !== label || card[side]) {
      card = { label };
      d.cards.push(card);
    }
    card[side] = { url: proofs[j].url, page: j + 1 };
    d.pages++;
  });
  const specs = specsOf(spec);
  for (const d of out) d.repeat = /ชุดละ \d+ ใบ: [^(·]*(?:· แยกแบบ [^(]*)?/.exec(specs[d.no - 1] ?? "")?.[0]?.trim();
  return out;
}

/** จำนวนหน้ารวมของแบบจากจอออกแบบตามสเปค (สเปคไม่มีรายการหน้า = ลายละ 1) · ไม่มีสเปค = 0 */
export function specPageTotal(spec?: string): number {
  return specsOf(spec).reduce((a, sp) => a + (specPageNames(sp)?.length ?? 1), 0);
}
