import { normalizeUnitWord, proofQtyCheck, proofUnit, type OrderItem, type Proof } from "./admin-data";

/**
 * ตรวจ "ชุดแบบงานที่จะส่งให้ลูกค้า" ก่อนกดส่ง — อ่านจากชื่อไฟล์ที่ลากเข้ามา + สเปคของรายการ
 * ที่มาของกติกา: กราฟฟิกลากไฟล์ทีละหลายสิบรูป ไฟล์เดิมหลุดมาซ้ำ ไฟล์ของงานอื่นปนมา หรือตกลายไปหนึ่งตัว
 * มองด้วยตาไม่ทัน กว่าจะรู้คือลูกค้าอนุมัติไปแล้ว/ฝ่ายแพ็คนับไม่ครบ
 *
 * warn = ต้องแก้ก่อนส่ง · hint = ควรเช็ก (ชื่อไฟล์เขียนอิสระ ระบบไม่ฟันธงแทนคน)
 */
export interface ProofIssue {
  level: "warn" | "hint";
  text: string;
}

/** ชื่อสินค้าทั้งร้านแบบย่อ — ใช้จับ "ไฟล์ของงานอื่นปนมา" */
export interface ProductNameRow {
  id: string;
  name?: string;
  slug?: string;
}

/**
 * "รูปที่ 1–14" · "รูปที่ 1–3 · 7" — ย่อเลขรูปที่ติดกันเป็นช่วง
 * งาน 14 ลายที่ผิดเหมือนกันทุกรูป เคยได้ข้อความยาวครึ่งจนดันรูปแบบงานตกจอ (14 ก.ย. 69)
 */
const nos = (idx: number[]) => {
  const ns = [...new Set(idx)].sort((a, b) => a - b).map((j) => j + 1);
  const parts: string[] = [];
  for (let i = 0; i < ns.length; ) {
    let k = i;
    while (k + 1 < ns.length && ns[k + 1] === ns[k]! + 1) k++;
    parts.push(k > i ? `${ns[i]}–${ns[k]}` : `${ns[i]}`);
    i = k + 1;
  }
  return `รูปที่ ${parts.join(" · ")}`;
};

/** รวมรูปที่ผิดเรื่องเดียวกันเป็นบรรทัดเดียว — คีย์เดียวกัน = ข้อความเดียวกัน ต่างแค่เลขรูป */
function groupBy<T>(rows: { key: string; index: number; data: T }[]): { idx: number[]; data: T }[] {
  const g = new Map<string, { idx: number[]; data: T }>();
  for (const r of rows) {
    const cur = g.get(r.key);
    if (cur) cur.idx.push(r.index);
    else g.set(r.key, { idx: [r.index], data: r.data });
  }
  return [...g.values()];
}
const norm = (s: string) => s.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

/** คลังคำสินค้า: คำ → สินค้าที่เป็นเจ้าของคำนั้น (ไม่เกิน 3 ตัว ไม่งั้นถือว่าเป็นคำกลาง) */
export type ProductWordIndex = Map<string, { ids: string[]; name: string }>;

/** ตัดทุกอย่างที่ไม่ใช่ตัวอักษร/ตัวเลขออก — "Photo card" กับ "photocard" ในชื่อไฟล์ต้องเจอกันให้ได้ */
const compact = (s: string) => norm(s).replace(/[^0-9a-zก-๙]/g, "");

/**
 * คำเฉพาะของสินค้าแต่ละตัว (ชื่อ + ชื่อลิงก์) — ใช้จับ "ไฟล์ของงานอื่นปนมา"
 * เก็บทั้งคำเดี่ยวและคำติดกัน ("photo" + "card" → "photocard") เพราะกราฟฟิกพิมพ์ติดกันบ้างเว้นวรรคบ้าง
 * คำที่มีเจ้าของเกิน 3 สินค้า = คำกลาง ("อะคริลิค" "สติ๊กเกอร์") เดาไม่ได้ ตัดทิ้ง
 */
export function productWordIndex(rows: ProductNameRow[]): ProductWordIndex {
  const owners = new Map<string, Set<string>>();
  const names = new Map<string, string>();
  for (const r of rows) {
    names.set(r.id, r.name?.trim() || r.id);
    const words = norm(`${r.name ?? ""} ${r.slug ?? ""}`)
      .split(/[^0-9a-zA-Zก-๙]+/)
      .filter((w) => w.length >= 3 && !/^\d+$/.test(w));
    const add = (w: string) => {
      if (w.length >= 6) owners.set(w, (owners.get(w) ?? new Set()).add(r.id));
    };
    words.forEach(add);
    for (let i = 0; i + 1 < words.length; i++) add(words[i]! + words[i + 1]!); // "photo"+"card" → "photocard"
  }
  const index: ProductWordIndex = new Map();
  for (const [w, ids] of owners)
    if (ids.size <= 3) index.set(w, { ids: [...ids], name: [...ids].map((id) => names.get(id) ?? id).join(" / ") });
  return index;
}

/**
 * คำสเปคที่ร้านใช้บ่อย — ชื่อไฟล์พูดถึงแต่สเปคของรายการนี้ไม่มีเลย = สัญญาณว่าไฟล์มาจากงานอื่น
 * (ไฟล์ชื่อ "Photocard 300g + ฟอยล์โฮโล" ในงานผ้าแขวนผนัง — ผ้าไม่มีทั้งแกรม ทั้งฟอยล์ ทั้งจำนวนด้าน)
 */
const SPEC_WORDS = [
  "ฟอยล์",
  "โฮโล",
  "กลิตเตอร์",
  "เคลือบ",
  "ไดคัท",
  "สกรีน",
  "ปัก",
  "ซับลิเมชั่น",
  "อะคริลิค",
  "กระดาษ",
  "สแตนดี้",
  "พวงกุญแจ",
  "สติ๊กเกอร์",
  "แม่เหล็ก",
  "ผ้า",
];

/** เลขจากสเปค เช่น "4 ลาย" → 4 */
function numIn(text: string | undefined): number {
  const m = (text ?? "").match(/(\d{1,4})/);
  const n = Number(m?.[1]);
  return Number.isFinite(n) ? n : 0;
}

/** ค่าทุกบรรทัดของสเปครายการ (ทั้งแบบมีโครงสร้างและข้อความรวม) */
function specTexts(item: OrderItem): string[] {
  return [...Object.values(item.sel ?? {}), item.selections ?? ""].filter(Boolean);
}

/**
 * ตัวเลขที่สเปคระบุไว้ — "จำนวนลาย: 4 ลาย" · "หมายเหตุ: ลายละ 3 เซต" · "พิมพ์ 2 ด้าน"
 * ทั้งสามอันนี้แอดมิน/ลูกค้าเขียนไว้ตอนสั่งอยู่แล้ว เอามาเทียบกับชุดแบบได้ตรง ๆ ไม่ต้องเดา
 */
export function specCounts(item: OrderItem): { designs: number; backDesigns: number; perDesign: number; perDesignUnit: string; sides: number } {
  const sel = item.sel ?? {};
  const keys = Object.keys(sel);
  const frontKey = keys.find((k) => /จำนวนลาย|กี่ลาย/.test(k) && !/หลัง|back/i.test(k));
  const backKey = keys.find((k) => /จำนวนลาย|กี่ลาย/.test(k) && /หลัง|back/i.test(k));
  const sideKey = keys.find((k) => /กี่ด้าน|จำนวนด้าน/.test(k));
  let perDesign = 0;
  let perDesignUnit = "";
  for (const t of specTexts(item)) {
    const m = t.match(/ลายละ\s*(\d{1,4})\s*(เซ็ต|เซต|ชุด|ชิ้น|ใบ|ดวง|แผ่น|อัน|ตัว)?/);
    if (m) {
      perDesign = Number(m[1]);
      perDesignUnit = m[2] ?? "";
      break;
    }
  }
  return {
    designs: frontKey ? numIn(sel[frontKey]) : 0,
    backDesigns: backKey ? numIn(sel[backKey]) : 0,
    perDesign,
    perDesignUnit,
    sides: sideKey ? numIn(sel[sideKey]) : 0,
  };
}

/**
 * รายการจุดที่ต้องดูของชุดแบบนี้ — ว่างเปล่า = ผ่านหมด
 * catalog = ชื่อสินค้าทั้งร้าน (ไม่ส่งมาก็ได้ แค่ข้ามการจับไฟล์ข้ามงาน)
 */
export function proofIssues(item: OrderItem, proofs: Proof[], catalog?: ProductWordIndex): ProofIssue[] {
  const list: ProofIssue[] = [];
  if (proofs.length === 0) return list;
  const qc = proofQtyCheck(item, proofs);

  // ── 1) ไฟล์เดียวกันโผล่สองกรอบ = ลากซ้ำแน่นอน (ลูกค้าเห็นแบบเดียวกันสองรูป ยอดรวมเกิน) ──
  const byUrl = new Map<string, number[]>();
  proofs.forEach((p, j) => byUrl.set(p.url, [...(byUrl.get(p.url) ?? []), j]));
  byUrl.forEach((idx) => {
    if (idx.length > 1) list.push({ level: "warn", text: `ไฟล์เดียวกันซ้ำ (${nos(idx)}) — น่าจะลากไฟล์เดิมมาสองรอบ` });
  });

  // ── 2) ชื่อไฟล์ซ้ำแต่คนละไฟล์ = ลายเดียวกันคนละเวอร์ชันปนมา ──
  const byNote = new Map<string, number[]>();
  proofs.forEach((p, j) => {
    const key = norm(p.note ?? "");
    if (key) byNote.set(key, [...(byNote.get(key) ?? []), j]);
  });
  byNote.forEach((idx) => {
    if (idx.length > 1 && new Set(idx.map((j) => proofs[j]?.url)).size > 1)
      list.push({ level: "warn", text: `ชื่อไฟล์ซ้ำกัน “${proofs[idx[0] ?? 0]?.note}” (${nos(idx)}) — เช็กว่าคนละลายจริงไหม` });
  });

  // ── 3) ไฟล์ของงานอื่นปนมา — ชื่อไฟล์มีคำเฉพาะของสินค้าตัวอื่น ("Photocard" ในงานผ้าแขวนผนัง) ──
  const specText = norm(specTexts(item).join(" "));
  const specCompact = compact(`${item.name} ${specTexts(item).join(" ")}`);
  if (catalog?.size) {
    const hits: { key: string; index: number; data: { word: string; owner: string } }[] = [];
    for (const [j, p] of proofs.entries()) {
      const note = compact(p.note ?? "");
      if (!note) continue;
      for (const [word, owner] of catalog) {
        if (owner.ids.includes(item.productId) || !note.includes(word) || specCompact.includes(word)) continue;
        hits.push({ key: `${word}|${owner.name}`, index: j, data: { word, owner: owner.name } });
        break;
      }
    }
    groupBy(hits).forEach(({ idx, data }) =>
      list.push({
        level: "warn",
        text: `${nos(idx)} ชื่อไฟล์มีคำว่า “${data.word}” ของสินค้าคนละตัว (${data.owner}) — เช็กว่าลากไฟล์ข้ามงานมารึเปล่า`,
      })
    );
  }

  // ── 3.1) คำสเปคในชื่อไฟล์ที่รายการนี้ไม่มีเลย (ผ้าแขวนผนังไม่มีทั้งแกรม ฟอยล์ จำนวนด้าน) ──
  const oddRows: { key: string; index: number; data: string[] }[] = [];
  for (const [j, p] of proofs.entries()) {
    const note = norm(p.note ?? "");
    if (!note) continue;
    const odd = SPEC_WORDS.filter((w) => note.includes(w) && !specText.includes(w));
    if (/(\d{2,3})\s*(g|gsm|แกรม)/.test(note) && !/(\d{2,3})\s*(g|gsm|แกรม)/.test(specText)) odd.push("แกรมกระดาษ");
    if (/\d\s*ด้าน/.test(note) && !/\d\s*ด้าน/.test(specText)) odd.push("จำนวนด้าน");
    if (odd.length) oddRows.push({ key: odd.join("|"), index: j, data: odd });
  }
  groupBy(oddRows).forEach(({ idx, data }) =>
    list.push({
      // พูดถึงของที่รายการนี้ไม่มีตั้ง 3 อย่างขึ้นไป = แทบแน่ใจว่าไฟล์ผิดงาน ไม่ใช่แค่ตั้งชื่อหลวม ๆ
      level: data.length >= 3 ? "warn" : "hint",
      text: `${nos(idx)} ชื่อไฟล์พูดถึง “${data.join(" · ")}” แต่สเปคของ “${item.name}” ไม่มีเรื่องพวกนี้เลย`,
    })
  );

  // ── 4) จำนวนลายในสเปค เทียบกับจำนวนรูปที่ส่ง ──
  const spec = specCounts(item);
  if (spec.designs > 0 && proofs.length !== spec.designs) {
    // งาน 2 ด้านที่แยกไฟล์หน้า/หลัง = ได้ 2 เท่าของจำนวนลาย ถือว่าปกติ
    const twoSided = spec.sides === 2 && proofs.length === spec.designs * 2;
    if (!twoSided)
      list.push(
        proofs.length < spec.designs
          ? { level: "warn", text: `สเปคบอก ${spec.designs} ลาย แต่ส่งแบบมา ${proofs.length} รูป — ขาดอีก ${spec.designs - proofs.length} ลาย` }
          : { level: "hint", text: `สเปคบอก ${spec.designs} ลาย แต่ส่งแบบมา ${proofs.length} รูป — เกินมา ${proofs.length - spec.designs} รูป` }
      );
  }

  // ── 5) "ลายละ N เซต" เทียบกับจำนวนที่กรอกไว้บนแต่ละรูป ──
  if (spec.perDesign > 0 && qc.unit) {
    // ลายละ 3 เซต ของงานที่ 1 เซ็ต = 20 ใบ → รูปละ 60 · ลายละ 3 ชิ้น → รูปละ 3
    // "เซต" กับ "เซ็ต" คือหน่วยเดียวกัน — เทียบสตริงดิบจะกลายเป็นคนละหน่วยแล้วคูณไม่ขึ้น
    const sameUnit = normalizeUnitWord(spec.perDesignUnit) === normalizeUnitWord(qc.saleUnit);
    const perProof = spec.perDesignUnit && sameUnit ? spec.perDesign * qc.per : spec.perDesign;
    const off = proofs.map((p, j) => (p.qty && p.qty !== perProof ? j : -1)).filter((j) => j >= 0);
    if (off.length && proofs.some((p) => p.qty)) {
      // กรอกเลขเดียวกันทุกรูป = บอกเลขเดียวพอ (14 ลาย × "160" เคยยาวเป็นย่อหน้า)
      const vals = [...new Set(off.map((j) => proofs[j]?.qty))];
      const got = vals.length === 1 ? `${vals[0]}` : vals.length <= 6 ? off.map((j) => proofs[j]?.qty).join(" · ") : `${vals.slice(0, 6).join(" · ")} …`;
      list.push({
        level: "warn",
        text:
          `สเปคบอก “ลายละ ${spec.perDesign} ${spec.perDesignUnit || "ชิ้น"}” = รูปละ ${perProof} ${qc.unit} ` +
          `แต่ ${nos(off)} กรอกไว้ ${got}`,
      });
    }
  }

  // ── 6) ยังไม่ระบุจำนวน = เทียบยอดกับที่ลูกค้าสั่งไม่ได้ ฝ่ายแพ็คก็ไม่รู้ว่าต้องนับกี่ชิ้น ──
  const noQty = proofs.map((p, j) => (p.qty ? -1 : j)).filter((j) => j >= 0);
  if (noQty.length)
    list.push({ level: "hint", text: `ยังไม่ระบุจำนวน (${nos(noQty)}) — ใส่ “x3” หรือ “3 ชิ้น” ไว้ในชื่อไฟล์ ระบบเติมให้เอง` });

  // ── 7) ยอดรวมเทียบกับที่ลูกค้าสั่ง (คูณ "กี่ชิ้นต่อหน่วย" ให้แล้ว) ──
  if (!noQty.length) {
    if (!qc.comparable && qc.total > 0)
      list.push({
        level: "hint",
        text: `แบบนับเป็น “${qc.unit || "คนละหน่วยกัน"}” รวม ${qc.total} ${qc.unit} (ลูกค้าสั่ง ${qc.orderedText}) — ระบบเทียบให้ไม่ได้ ต้องเช็กเอง`,
      });
    else if (qc.comparable && !qc.ok && qc.packUnit)
      list.push({
        level: "hint",
        text: `งานนี้ขายเป็น “${qc.saleUnit}” — สั่ง ${item.qty} ${qc.saleUnit} แต่แบบรวม ${qc.total} ${qc.unit} ระบบยังไม่รู้ว่า 1 ${qc.saleUnit} เท่ากับกี่ชิ้น`,
      });
    else if (qc.comparable && !qc.ok)
      list.push({
        level: "warn",
        text: `รวมจากแบบ ${qc.total} ${qc.unit} แต่ลูกค้าสั่ง ${qc.orderedText} — ${
          qc.total < qc.target ? `ขาดอีก ${qc.target - qc.total}` : `เกินมา ${qc.total - qc.target}`
        } ${qc.unit}`,
      });
  }

  // ── 8) งาน 2 ด้าน แต่ไม่มีชื่อไฟล์ไหนพูดถึงด้านหลังเลย ──
  const notes = proofs.map((p) => norm(p.note ?? "")).filter(Boolean);
  const hasBackWord = notes.some((n) => /หลัง|back|2 ?ด้าน|สองด้าน/.test(n));
  if ((spec.sides === 2 || spec.backDesigns > 0) && notes.length === proofs.length && notes.length > 0 && !hasBackWord)
    list.push({
      level: "hint",
      text: `สเปคเป็นงาน 2 ด้าน${spec.backDesigns ? ` (ด้านหลัง ${spec.backDesigns} ลาย)` : ""} แต่ไม่มีชื่อไฟล์ไหนบอกว่าเป็นด้านหลัง — เช็กว่าส่งแบบด้านหลังครบไหม`,
    });

  // ── 9) โทเคนขนาด/ด้าน ในชื่อไฟล์ที่ขัดกับสเปค (เตือนเบา ๆ ชื่อไฟล์เขียนอิสระ) ──
  const sizeRows: { key: string; index: number; data: string }[] = [];
  const backRows: { key: string; index: number; data: null }[] = [];
  for (const [j, p] of proofs.entries()) {
    const n = norm(p.note ?? "");
    if (!n) continue;
    const size = n.match(/\ba([3-7])\b/);
    if (size && !new RegExp(`\\ba${size[1]}\\b`).test(specText)) {
      sizeRows.push({ key: size[1]!, index: j, data: size[1]! });
      continue;
    }
    if (spec.sides === 1 && /หลัง|back/.test(n)) backRows.push({ key: "back", index: j, data: null });
  }
  groupBy(sizeRows).forEach(({ idx, data }) =>
    list.push({ level: "hint", text: `${nos(idx)} ชื่อไฟล์บอกขนาด “A${data}” แต่สเปคของรายการนี้ไม่มี A${data} — เช็กขนาดก่อน` })
  );
  groupBy(backRows).forEach(({ idx }) => list.push({ level: "hint", text: `${nos(idx)} ชื่อไฟล์บอก “ด้านหลัง” แต่สเปคสั่งพิมพ์ด้านเดียว` }));

  return list;
}

/** หน่วยของแบบทั้งชุด (ว่าง = คละหน่วย) — เผื่อหน้าจออื่นอยากใช้ซ้ำ */
export function proofUnitOf(proofs: Proof[]): string {
  const units = [...new Set(proofs.filter((p) => p.qty).map((p) => proofUnit(p)))];
  return units.length === 1 ? units[0]! : "";
}
