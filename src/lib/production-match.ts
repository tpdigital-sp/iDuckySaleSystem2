import type { Order } from "@/lib/admin-data";
import type { TPGraphicCard } from "@/lib/server/tp-report"; // type-only (ไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ ใช้ได้ทั้งสองฝั่ง)

/**
 * 🏭 จับคู่ "ชื่อโฟลเดอร์งานที่เข้าผลิต" (โยนจากคิวปริ้น) กับออเดอร์ในระบบ
 *
 * โฟลเดอร์ผลิตตั้งชื่อตามการ์ดกราฟฟิก TP เช่น "- (เร่งส่ง11)(ids)ญาณิศา มุกดาพิทักษ์ - card pvc 21 ชิ้น"
 *   · คำนำหน้าในวงเล็บเปลี่ยนได้ตลอด ((เร่งขึ้นตย)/(ขึ้นตยแล้ว)/(ids)/(Detail)) · ขีดนำหน้า · เลขลำดับ "7."
 *   · "(ids)" = งานจากเว็บ iDucky Store (บอร์ดกราฟฟิกใส่ให้) แต่ไม่มีเลข OD ในชื่อ
 * ลำดับการจับคู่ (ตรวจข้อมูลจริง 11 ก.ย. 69: โฟลเดอร์ (ids) 28 ใบ จับได้ 27):
 *   1. ชื่อโฟลเดอร์ (ตัดวงเล็บ/ขีด/เลขลำดับ/ช่องว่าง) ตรงกับ folderName ของการ์ดกราฟฟิก iducky-<OD> → ชัวร์
 *   2. ส่วนชื่อลูกค้า (ก่อน " - ") ตรงกับชื่อลูกค้าในออเดอร์แบบเป๊ะ → ชัวร์ถ้ามีออเดอร์เดียวที่ยังไม่เข้าผลิต · หลายใบ = คลุมเครือ ให้คนเลือก
 *   3. ชื่อลูกค้าซ้อนกัน (ลูกค้าเปลี่ยนชื่อ/ชื่อยาว) เฉพาะโฟลเดอร์ที่มี (ids) → คลุมเครือเสมอ
 * โฟลเดอร์ที่ไม่มี (ids) และไม่ตรงชื่อใคร = งานหน้าร้าน/LINE ที่ไม่ได้อยู่ในระบบนี้ → ข้ามเงียบ
 */

export interface FolderMatch {
  folder: string;
  orderId: string;
  customer: string;
  how: "card" | "name";
}
export interface FolderAmbiguous {
  folder: string;
  candidates: { orderId: string; customer: string; status: string }[];
}
export interface FolderMatchResult {
  matched: FolderMatch[];
  ambiguous: FolderAmbiguous[];
  /** โฟลเดอร์ที่ติดป้าย (ids) แต่หาออเดอร์ไม่เจอ — ต้องไปติ๊กเองที่หน้าออเดอร์ */
  unmatchedIds: string[];
  /** โฟลเดอร์ทั่วไป (งานหน้าร้าน) ที่ไม่ตรงใคร — แค่จำนวน ไม่ใช่ปัญหา */
  skipped: number;
  /** ชื่อโฟลเดอร์ที่ข้าม (ไม่เกิน 60 ชื่อ) — ให้คนดูว่าโยนถูกชุดไหม / ทำไมไม่จับ */
  skippedNames: string[];
  /** จำนวนโฟลเดอร์งาน (ชื่อแบบ "ลูกค้า - สินค้า") ที่อ่านเจอทั้งหมด */
  scanned: number;
}

/** ตัดสิ่งที่เปลี่ยนได้ออกจากชื่อ: ขีด/ช่องว่างนำหน้า · วงเล็บทุกก้อน · เลขลำดับ "7." · ช่องว่างทั้งหมด · พิมพ์เล็ก */
export function normFolder(s: string): string {
  return String(s || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/^[-+\s]+/, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/^\d+\./, "")
    .replace(/\s+/g, "")
    .trim();
}

/** ส่วนชื่อลูกค้าของโฟลเดอร์ = ข้อความก่อน " - " ตัวแรก (หลังตัดวงเล็บ) */
export function folderCustomer(s: string): string {
  const body = String(s || "").normalize("NFC").replace(/^[-+\s]+/, "").replace(/\([^)]*\)/g, "").replace(/^\d+\./, "");
  // ขีดคั่นชื่อกับสินค้า: " - " ปกติ · บางทีพิมพ์ติดชื่อ "สริตา- carabiner" หรือ "สริตา -carabiner"
  const i = body.search(/\s-|-\s/);
  return normFolder(i >= 0 ? body.slice(0, i) : body);
}

const isIdsFolder = (s: string) => /\(ids\)/i.test(s);

/** ชื่อโฟลเดอร์ชั้นในสุดจากพาธที่หน้าเว็บส่งมา ("Donut 10-09-69/UV/(ids)…" → "(ids)…") */
export function leafName(path: string): string {
  const parts = String(path || "").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

export function matchFoldersToOrders(
  folderPaths: string[],
  orders: Order[],
  cards: Record<string, TPGraphicCard>
): FolderMatchResult {
  const res: FolderMatchResult = { matched: [], ambiguous: [], unmatchedIds: [], skipped: 0, skippedNames: [], scanned: 0 };
  const byCardName = new Map<string, string>();
  for (const [id, c] of Object.entries(cards)) {
    const n = normFolder(c.folderName ?? "");
    if (n) byCardName.set(n, id);
  }
  const orderById = new Map(orders.map((o) => [o.id, o]));
  /** ชื่อลูกค้าตามการ์ดกราฟฟิก (ส่วนก่อน " - ") → ใบ — ออเดอร์ที่ชื่อผู้รับเป็นบริษัท/ชื่อจริง แต่โฟลเดอร์ใช้ชื่อเล่นตามการ์ด (OD-260908-3989 "ZTE Corporation" ↔ โฟลเดอร์ "สริตา") */
  const byCardCustomer = new Map<string, string[]>();
  for (const [id, c] of Object.entries(cards)) {
    const cc = folderCustomer(c.folderName ?? "");
    if (cc.length >= 2 && orderById.has(id)) byCardCustomer.set(cc, [...(byCardCustomer.get(cc) ?? []), id]);
  }
  const taken = new Set<string>();
  const seenFolder = new Set<string>();

  for (const raw of folderPaths) {
    const name = leafName(raw);
    if (!name || seenFolder.has(name)) continue;
    seenFolder.add(name);
    const n = normFolder(name);
    // โฟลเดอร์งานตั้งชื่อ "ลูกค้า - สินค้า" เสมอ — ชั้นหมวด (UV/SUB/งานกระดาษ/- เพิ่มเร่ง) และโฟลเดอร์ย่อยในงาน (file/รองหลัง) ไม่มีขีดคั่น → ข้ามเงียบ ไม่นับ
    if (!n || !/\s-|-\s/.test(name.replace(/^[-+\s]+/, ""))) continue;
    res.scanned++;

    // 1) ตรงกับชื่อการ์ดกราฟฟิก
    const cardHit = byCardName.get(n);
    if (cardHit && orderById.has(cardHit) && !taken.has(cardHit)) {
      taken.add(cardHit);
      res.matched.push({ folder: name, orderId: cardHit, customer: orderById.get(cardHit)!.customer, how: "card" });
      continue;
    }

    // 2) ชื่อลูกค้าตรงเป๊ะ — เทียบทั้งชื่อในออเดอร์และชื่อบนการ์ดกราฟฟิก
    const cust = folderCustomer(name);
    if (cust.length >= 2) {
      const viaCard = (byCardCustomer.get(cust) ?? []).filter((id) => !taken.has(id));
      if (viaCard.length === 1) {
        taken.add(viaCard[0]);
        res.matched.push({ folder: name, orderId: viaCard[0], customer: orderById.get(viaCard[0])!.customer, how: "card" });
        continue;
      }
      // ลูกค้าคนเดียวมีหลายโฟลเดอร์ (แยกตามวัสดุ/จำนวน) แต่ออเดอร์เดียว → ใบนั้นจับคู่ไปแล้วในรอบนี้ ถือว่าโฟลเดอร์นี้เป็นของใบเดิม ไม่ใช่หาไม่เจอ
      if (res.matched.some((m) => taken.has(m.orderId) && (normFolder(m.customer) === cust || folderCustomer(cards[m.orderId]?.folderName ?? "") === cust))) continue;
      const exact = orders.filter((o) => !taken.has(o.id) && normFolder(o.customer) === cust);
      if (exact.length === 1) {
        taken.add(exact[0].id);
        res.matched.push({ folder: name, orderId: exact[0].id, customer: exact[0].customer, how: "name" });
        continue;
      }
      if (exact.length > 1) {
        res.ambiguous.push({ folder: name, candidates: exact.map((o) => ({ orderId: o.id, customer: o.customer, status: o.status })) });
        continue;
      }
      // 3) ชื่อซ้อนกัน — เฉพาะงานที่ติดป้าย (ids)
      if (isIdsFolder(name) && cust.length >= 3) {
        const loose = orders.filter((o) => {
          const oc = normFolder(o.customer);
          return !taken.has(o.id) && oc.length >= 3 && (oc.includes(cust) || cust.includes(oc));
        });
        if (loose.length) {
          res.ambiguous.push({ folder: name, candidates: loose.map((o) => ({ orderId: o.id, customer: o.customer, status: o.status })) });
          continue;
        }
      }
    }

    if (isIdsFolder(name)) res.unmatchedIds.push(name);
    else {
      res.skipped++;
      if (res.skippedNames.length < 60) res.skippedNames.push(name);
    }
  }
  return res;
}
