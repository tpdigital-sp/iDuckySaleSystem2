import { isSampleFolderName, proofsOf, type Order, type ShipPlanRound } from "@/lib/admin-data";
import type { TPGraphicCard } from "@/lib/server/tp-report"; // type-only (ไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ ใช้ได้ทั้งสองฝั่ง)

/**
 * 🏭 จับคู่ "ชื่อโฟลเดอร์งานที่เข้าผลิต" (โยนจากคิวปริ้น) กับออเดอร์ในระบบ
 *
 * โฟลเดอร์ผลิตตั้งชื่อตามการ์ดกราฟฟิก TP เช่น "- (เร่งส่ง11)(ids)ญาณิศา มุกดาพิทักษ์ - card pvc 21 ชิ้น"
 *   · คำนำหน้าในวงเล็บเปลี่ยนได้ตลอด ((เร่งขึ้นตย)/(ขึ้นตยแล้ว)/(ids)/(Detail)) · ขีดนำหน้า · เลขลำดับ "7."
 *   · "(ids)" = งานจากเว็บ iDucky Store (บอร์ดกราฟฟิกใส่ให้) แต่ไม่มีเลข OD ในชื่อ
 * ลำดับการจับคู่ (ตรวจข้อมูลจริง 11 ก.ย. 69: โฟลเดอร์ (ids) 28 ใบ จับได้ 27):
 *   0. 🎯 ในโฟลเดอร์งานของเว็บมีไฟล์ "OD-260909-1588.html" (ลิงก์เปิดออเดอร์ที่ระบบสร้างให้กราฟฟิก) — เลข OD ในชื่อไฟล์ = ชัวร์ที่สุด ไม่ต้องเดา
 *      หน้าเว็บส่งพาธไฟล์นั้นมาด้วย (ProductionFolderDrop เก็บเฉพาะไฟล์ที่ชื่อมีเลข OD) → โฟลเดอร์แม่ของไฟล์ = โฟลเดอร์ของใบนั้น
 *   1. ชื่อโฟลเดอร์ (ตัดวงเล็บ/ขีด/เลขลำดับ/ช่องว่าง) ตรงกับ folderName ของการ์ดกราฟฟิก iducky-<OD> → ชัวร์
 *   2. ส่วนชื่อลูกค้า (ก่อน " - ") ตรงกับชื่อลูกค้าในออเดอร์แบบเป๊ะ → ชัวร์ถ้ามีออเดอร์เดียวที่ยังไม่เข้าผลิต · หลายใบ = คลุมเครือ ให้คนเลือก
 *   3. ชื่อลูกค้าซ้อนกัน (ลูกค้าเปลี่ยนชื่อ/ชื่อยาว) เฉพาะโฟลเดอร์ที่มี (ids) → คลุมเครือเสมอ
 * โฟลเดอร์ที่ไม่มี (ids) และไม่ตรงชื่อใคร = งานหน้าร้าน/LINE ที่ไม่ได้อยู่ในระบบนี้ → ข้ามเงียบ
 */

export interface FolderMatch {
  folder: string;
  orderId: string;
  customer: string;
  how: "file" | "card" | "name";
  /**
   * โฟลเดอร์อื่นในกองเดียวกันที่เป็นของใบนี้เหมือนกัน (ลูกค้าคนเดียวมีทั้งโฟลเดอร์ขึ้นตัวอย่างและงานจริง)
   * ⚠️ เดิมกลืนเงียบ — แอดมินเลยไม่รู้ว่าโฟลเดอร์งานจริงเข้ามาด้วยหรือยัง (15 ก.ย. 69 OD-260909-6151)
   */
  alsoFolders?: string[];
  /** 🎁 โฟลเดอร์ (…ตย) ของใบนี้มีไฟล์ jpg ที่อ่านจำนวนตัวอย่างได้ → เสนอตั้งแผนแบ่งส่งรอบตัวอย่างให้ (เซิร์ฟเวอร์เติม) */
  sample?: { folder: string; qty: number; designs: number; unmatchedFiles: string[]; replacesPlan: boolean; lines: string[] };
  /**
   * ⛔ แบบงานยังไม่ครบทุกรายการ (ลูกค้าสั่งเพิ่มทีหลัง/ยังรอลูกค้าตรวจ) — เซิร์ฟเวอร์เติม (ดู printBlockers)
   * หน้าโยนโฟลเดอร์ติ๊กออกให้ก่อน + ขึ้นกล่องแดงบอกรายการที่ค้าง · ติ๊กกลับได้เฉพาะคนมีสิทธิ์แก้ออเดอร์ (18 ก.ย. 69 OD-260916-4693)
   */
  proofHold?: string[];
  /**
   * 📞📍 เบอร์โทร/ที่อยู่ไม่ผ่านด่าน (contact-validate) — เซิร์ฟเวอร์เติม
   * ใบแบบนี้พิมพ์เอกสารไม่ได้เลยสักใบ (กติกา 18 ก.ย. 69) จึงไม่ควรถูกดันเข้าไลน์ผลิตตั้งแต่แรก
   * ⚠️ ติ๊กกลับเข้าไม่ได้ ต่างจาก proofHold — ต้องไปแก้เบอร์/ที่อยู่ในหน้าออเดอร์ก่อนแล้วโยนใหม่
   */
  contactHold?: string[];
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

const OD_RE = /OD-\d{6}-\d{3,}/i;

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
  /** โฟลเดอร์นี้เป็นของใบที่จับไปแล้วในรอบนี้ → ต่อท้ายแถวเดิมให้คนเห็น (คืน true ถ้าเก็บได้) */
  const addAlso = (orderId: string, folder: string): boolean => {
    const row = res.matched.find((m) => m.orderId === orderId);
    if (!row) return false;
    row.alsoFolders = [...(row.alsoFolders ?? []), folder];
    return true;
  };

  // 0) ไฟล์ OD-xxx.html ในโฟลเดอร์งาน → เลข OD ของโฟลเดอร์แม่ (พาธที่ชี้ไฟล์ = ชั้นในสุดชื่อมีเลข OD และมีนามสกุล)
  const odByFolder = new Map<string, string>();
  const folderPathsOnly: string[] = [];
  for (const raw of folderPaths) {
    const parts = String(raw || "").split("/").filter(Boolean);
    const leaf = parts[parts.length - 1] ?? "";
    const m = leaf.match(OD_RE);
    if (m && /\.[a-z0-9]{2,5}$/i.test(leaf) && parts.length >= 2) {
      odByFolder.set(parts[parts.length - 2], m[0].toUpperCase());
      continue;
    }
    folderPathsOnly.push(raw);
  }

  for (const raw of folderPathsOnly) {
    const name = leafName(raw);
    if (!name || seenFolder.has(name)) continue;
    seenFolder.add(name);

    // 0) มีไฟล์ OD ในโฟลเดอร์ → ใช้เลขนั้นเลย (ใบไม่อยู่ในกองผู้ท้าชิง = ส่งไปแล้ว/ยังไม่ชำระ → ข้ามเงียบ ไม่เดาชื่อต่อ)
    const odFile = odByFolder.get(name);
    if (odFile) {
      res.scanned++;
      const o = orderById.get(odFile);
      if (o && !taken.has(odFile)) {
        taken.add(odFile);
        res.matched.push({ folder: name, orderId: odFile, customer: o.customer, how: "file" });
      } else if (o) {
        addAlso(odFile, name);
      } else if (!o) {
        res.skipped++;
        if (res.skippedNames.length < 60) res.skippedNames.push(`${name} (${odFile} ไม่อยู่ในคิวรอผลิต)`);
      }
      continue;
    }

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
      // ลูกค้าคนเดียวมีหลายโฟลเดอร์ (ขึ้นตัวอย่าง/งานจริง/แยกวัสดุ) แต่ออเดอร์เดียว → ใบนั้นจับคู่ไปแล้วในรอบนี้
      // ไม่ใช่ "หาไม่เจอ" แต่ก็ห้ามกลืนเงียบ — ต่อท้ายแถวเดิมให้แอดมินเห็นและเลือกได้ว่าอันไหนคืองานจริง
      const sameOrder = res.matched.find(
        (m) => taken.has(m.orderId) && (normFolder(m.customer) === cust || folderCustomer(cards[m.orderId]?.folderName ?? "") === cust)
      );
      if (sameOrder) {
        addAlso(sameOrder.orderId, name);
        continue;
      }
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

/* ────────────────────────────────────────────────────────────────────────────
 * 🎁 โฟลเดอร์ตัวอย่าง "(…ตย)" → แผนแบ่งส่งรอบตัวอย่าง (16 ก.ย. 69 — เจ้าของร้านสั่ง "โยน folder ได้ และให้ระบบจับจำนวนตามไฟล์ jpg")
 * ไฟล์ในโฟลเดอร์ตั้งชื่อโดยกราฟฟิก:  "(1)Photocard PET ใส(รองขาวเฉพาะ)+เจาะรู_2 ชิ้น-1.jpg"
 *   (1) = รายการที่ 1 ในออเดอร์ · "_2 ชิ้น" = จำนวนชิ้นตัวอย่างของลายนี้ · "-1" = ลายที่ 1 (ตรงกับรูปแบบงานรูปที่ 1)
 * รูปแบบงานในระบบเก็บชื่อไฟล์ต้นทางไว้ใน proof.note ("1)Photocard PET ใส(รองขาวเฉพาะ)+เจาะรู -1") → จับคู่ด้วยชื่อก่อน (ชัวร์) ตำแหน่งทีหลัง
 * ──────────────────────────────────────────────────────────────────────────── */

export const SAMPLE_FILE_RE = /\.(jpe?g|png)$/i;

/** แยกส่วนจากชื่อไฟล์ตัวอย่าง — null = ไม่ใช่รูปแบบ "…_<จำนวน> <หน่วย>-<ลาย>.jpg" */
export function parseSampleFileName(fileName: string): { item?: number; base: string; qty: number; unit: string; design: number } | null {
  const name = String(fileName || "").normalize("NFC").replace(SAMPLE_FILE_RE, "");
  const m = name.match(/^(?:\((\d+)\))?(.*?)_(\d+)\s*([^\s_\-\d]*)\s*-\s*(\d+)$/u);
  if (!m) return null;
  const qty = Number(m[3]);
  const design = Number(m[5]);
  if (!(qty > 0) || !(design > 0)) return null;
  return { ...(m[1] ? { item: Number(m[1]) } : {}), base: m[2].trim(), qty, unit: m[4] || "ชิ้น", design };
}

/** ชื่อไฟล์/หมายเหตุรูป ตัดเครื่องหมายทั้งหมดเหลือแต่ตัวอักษร-ตัวเลข ไว้เทียบกัน ("(1)Photocard…-1" ↔ "1)Photocard… -1") */
const bareName = (s: string) => String(s || "").normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export interface SamplePlanBuild {
  round: ShipPlanRound;
  /** จำนวนชิ้นรวมของรอบตัวอย่าง */
  qty: number;
  /** จำนวนลาย (รูป) ที่จับคู่ได้ */
  designs: number;
  /** ชื่อไฟล์ที่อ่านได้แต่หารูปแบบงานไม่เจอ / ชื่อไม่เข้ารูปแบบ — ให้คนดู */
  unmatchedFiles: string[];
}

/**
 * สร้างรอบตัวอย่างจากชื่อไฟล์ jpg ในโฟลเดอร์ (…ตย) ของใบนี้ · null = ไม่มีไฟล์ที่อ่านจำนวนได้เลย
 * จำนวนต่อรูปไม่เกินจำนวนเต็มบนรูป (ตัวอย่างมากกว่าที่สั่งไม่มีจริง)
 */
export function sampleRoundFromFiles(order: Order, folder: string, fileNames: string[], by: string, at: string): SamplePlanBuild | null {
  if (!isSampleFolderName(folder)) return null;
  const proofs: ShipPlanRound["proofs"] = [];
  const unmatchedFiles: string[] = [];
  const used = new Set<string>();
  const files = [...new Set(fileNames.map((f) => leafName(f)).filter((f) => SAMPLE_FILE_RE.test(f)))];
  for (const f of files) {
    const parsed = parseSampleFileName(f);
    if (!parsed) {
      unmatchedFiles.push(f);
      continue;
    }
    // 1) ชื่อไฟล์ (ตัดจำนวนออก) ตรงกับ proof.note ที่กราฟฟิกอัปไว้
    const want = bareName(`${parsed.item ? `(${parsed.item})` : ""}${parsed.base}-${parsed.design}`);
    let hit: { i: number; j: number } | null = null;
    order.items.forEach((it, i) =>
      proofsOf(it).forEach((p, j) => {
        if (hit || !p.note) return;
        if (bareName(p.note) === want) hit = { i, j };
      })
    );
    // 2) ตำแหน่ง: (N) = รายการที่ N · -M = รูปที่ M — ไม่มี (N) ให้ใช้รายการเดียวที่มีรูปที่ M
    if (!hit) {
      const cands = order.items
        .map((it, i) => ({ i, n: proofsOf(it).length }))
        .filter(({ i, n }) => (parsed.item ? i === parsed.item - 1 : true) && parsed.design <= n);
      if (cands.length === 1) hit = { i: cands[0].i, j: parsed.design - 1 };
    }
    if (!hit) {
      unmatchedFiles.push(f);
      continue;
    }
    const { i, j } = hit as { i: number; j: number };
    const key = `${i}:${j}`;
    if (used.has(key)) continue; // ไฟล์ซ้ำลายเดิม (เช่น มีทั้ง jpg และ png) นับครั้งเดียว
    used.add(key);
    const it = order.items[i];
    const p = proofsOf(it)[j];
    const full = Math.floor(p.qty ?? 0);
    const go = full > 0 ? Math.min(parsed.qty, full) : parsed.qty;
    proofs.push({
      item: i,
      proof: j,
      url: p.url,
      qty: go,
      ...(full > 0 ? { ofQty: full } : {}),
      unit: p.unit || parsed.unit,
      itemName: it.name,
    });
  }
  if (!proofs.length) return null;
  proofs.sort((a, b) => a.item - b.item || a.proof - b.proof);
  const qty = proofs.reduce((s, p) => s + (p.qty ?? 0), 0);
  const round: ShipPlanRound = {
    proofs,
    sampleFolder: folder,
    note: `🎁 ตัวอย่าง ${qty} ชิ้น (${proofs.length} ลาย) — จำนวนตามชื่อไฟล์ในโฟลเดอร์ ${folder}`,
    by,
    at,
  };
  return { round, qty, designs: proofs.length, unmatchedFiles };
}

/** จัดกลุ่มพาธไฟล์ตัวอย่างที่หน้าเว็บส่งมา → โฟลเดอร์ชั้นในสุด → ชื่อไฟล์ */
export function groupSampleFiles(paths: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const raw of paths) {
    const parts = String(raw || "").split("/").filter(Boolean);
    if (parts.length < 2) continue;
    const file = parts[parts.length - 1];
    const folder = parts[parts.length - 2];
    if (!SAMPLE_FILE_RE.test(file) || !isSampleFolderName(folder)) continue;
    out.set(folder, [...(out.get(folder) ?? []), file]);
  }
  return out;
}
