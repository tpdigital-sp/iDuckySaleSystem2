import "server-only";
import {
  catalogRefs,
  findDraftProduct,
  fixTypos,
  knowledgeItems,
  lcsLen,
  norm,
  isMinQtyIntent,
  isMixIntent,
  isPriceIntent,
  isSpecIntent,
  parseQty,
  searchInfo,
  budgetAnswer,
  hookAnswer,
  parseBudget,
  ATTR_RE,
  INCLUDE_Q_RE,
  extraInfo,
  EXTRA_ASK_RE,
  searchMinQty,
  searchMix,
  searchPrice,
  searchSpec,
  understand,
  type Pick,
  type PriceAnswer,
  type ProductRef,
  type Understanding,
} from "@/lib/server/price-answer";

/** ข้อความที่อ้างถึง "รูป/ของในรูป" แทนการบอกชื่อสินค้า */
const IMG_REF_RE = /แบบนี้|งานนี้|อันนี้|ตัวนี้|ตามรูป|ในรูป|ตามภาพ|ในภาพ|รูปนี้|ภาพนี้|ลายนี้|รูปที่ส่ง|ภาพที่ส่ง/;
/** รอบล่าสุดของลูกค้าในประวัติ (ที่ LINE ส่งมา) คือการส่งรูป ("[ลูกค้าส่งรูปภาพ: …]" จาก Save Image Note) ภายใน 30 นาที */
function lastUserTurnHasImage(history: unknown): boolean {
  if (!Array.isArray(history)) return false;
  const last = [...(history as { role?: string; text?: string; at?: unknown }[])].reverse().find((t) => t && !/assistant|bot|shop|admin/i.test(String(t.role ?? "")));
  if (!last || !/ส่งรูปภาพ/.test(String(last.text ?? ""))) return false;
  const at = Date.parse(String(last.at ?? ""));
  return !Number.isFinite(at) || Date.now() - at < 30 * 60_000;
}

/** คำถามแบบถามเรื่องเฉพาะ (กี่ / อะไร / ได้ไหม / ใช่ไหม) — คู่กับ specCoversQuery */
const SPECIFIC_Q_RE = /กี่|อะไร|ได้ไหม|ได้มั้ย|ใช่ไหม|ใช่มั้ย|หรือเปล่า|รึเปล่า|ไหม|มั้ย|มั๊ย|ยังไง|อย่างไร|\?/;
/** ถามว่า "มี/รับทำ/ขาย X ไหม" = อยากเห็นว่ามีอะไรให้เลือก → เมนูกลุ่มสินค้าคือคำตอบที่ถูก */
const AVAIL_Q_RE = /มี.{0,30}(ไหม|มั้ย|มั๊ย|\?)|รับ(ทำ|ผลิต|พิมพ์|สกรีน).{0,30}(ไหม|มั้ย|มั๊ย|\?)|ขาย.{0,20}(ไหม|มั้ย|มั๊ย)/;
/** ขอดูรายการตัวเลือกจริง ๆ ("มีขนาดไหนบ้าง" "มีสีอะไรบ้าง" "มีกี่แบบ") = รายการตัวเลือกคือคำตอบที่ถูก */
const LIST_Q_RE = /บ้าง|มีกี่แบบ|กี่แบบ|ตัวเลือก|มีแบบไหน|แบบไหนดี|มีขนาด|มีสี|มีไซส์|ขนาดไหน|ไซส์ไหน/;
/**
 * รายการตัวเลือก ("• ขนาด (1 แบบ): 6×6 ซม. · …") ตอบคำถามนี้ไหม — ชื่อกลุ่มหรือค่าตัวเลือกต้องโผล่ในคำถาม
 * "พิมพ์ 2 ด้านได้ไหม" → มีค่า "พิมพ์ 2 ด้าน" = ตอบ · "ใส่บัตรได้กี่อัน" → ไม่มีกลุ่มไหนเกี่ยว = ไม่ตอบ
 */
function specCoversQuery(query: string, answer: string): boolean {
  const q = norm(query);
  for (const line of answer.split("\n")) {
    const m = /^\s*•\s*([^:(]+?)\s*(?:\(\d+\s*แบบ\))?\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const label = norm(m[1]);
    if (label.length >= 2 && q.includes(label)) return true;
    for (const v of m[2].split(/\s*·\s*/)) {
      const nv = norm(v.replace(/….*$/, ""));
      if (nv.length >= 3 && q.includes(nv)) return true;
    }
  }
  return false;
}

/**
 * 💰 แกนของ /api/pricing/search แยกออกมาเป็นฟังก์ชัน (1 ต.ค. 69) — ให้ /api/chat (แชทเว็บ) เรียกตรง ๆ ไม่ต้องยิง HTTP วนกลับมาเอง
 * route.ts เหลือแค่รับ request/กันยิงรัว/CORS แล้วเรียก priceSearch()
 */
export interface PriceSearchResult {
  status: number;
  body: Record<string, unknown>;
}

function pickMode(query: string, forced?: unknown): "price" | "spec" | "minqty" | "mix" {
  if (forced === "spec" || forced === "minqty" || forced === "price" || forced === "mix") return forced;
  if (isMinQtyIntent(query)) return "minqty";
  if (isMixIntent(query) && !/ราคา|บาท|เรท|เท่าไหร่|เท่าไร/.test(query)) return "mix";
  // isSpecIntent ตัดคำเรื่องเงิน (ราคา/บาท/เรท) ออกแล้ว — "ขนาดเท่าไหร่บ้าง" จึงเป็นสเปก ไม่ใช่ราคา
  // (isPriceIntent นับ "เท่าไหร่" เป็นราคา ถ้าเช็คตัวนั้นก่อนจะเทตารางราคาให้คนที่ถามขนาด)
  if (isSpecIntent(query)) return "spec";
  return "price";
}

/**
 * คำถามที่ไม่ได้ถามราคา/สเปก/ขั้นต่ำ/จำนวนเลย — เครื่องคิดราคาต้อง "ไม่ตอบ" ปล่อยให้ agent ที่มีความจำตอบแทน
 * เจอจริง 23 ก.ย. 69 ในไลน์: ลูกค้าคุยเรื่องของติดรถยนต์อยู่แล้วพิมพ์ต่อว่า "เอาแบบกันฝนค่ะ" → เครื่องคิดราคาไม่รู้บริบท
 * จับคำว่า "กันฝน" เป็น "ร่มกอล์ฟ" แล้วเทตารางราคาร่มทับคำตอบของ agent ("ส่งไฟล์ยังไง" ก็เคยได้เมนูพวงกุญแจ)
 * ยกเว้นพิมพ์มาแค่ "ชื่อสินค้า/หมวด" สั้น ๆ ("เคสมือถือ" · agent ส่งชื่อสินค้าโดด ๆ) → ตอบได้
 */
function productQueryAllowed(query: string, qty: number | null): boolean {
  // "ตัวนี้เอา 50 ชิ้น" = อ้างถึงสินค้าที่คุยค้างไว้ — เครื่องคิดราคาไม่มีความจำ ตอบไปก็ผิดตัว ให้ agent ตอบ
  if (/ตัวนี้|อันนี้|แบบนี้|ตัวนั้น|อันนั้น|แบบนั้น|ตัวเดิม|แบบเดิม|อันเดิม|เหมือนเดิม|ตัวเมื่อกี้|อันเมื่อกี้|ที่ว่า|ตัวข้างบน/.test(query))
    return false;
  if (qty || isPriceIntent(query) || isSpecIntent(query) || isMinQtyIntent(query)) return true;
  // ประโยคที่มีคำกริยา/คำลงท้าย = คุยต่อจากบริบท ไม่ใช่ชื่อสินค้า
  return (
    query.length <= 24 &&
    !/ยังไง|อย่างไร|ไหม|มั้ย|ทำไม|ที่ไหน|เมื่อไหร่|กี่วัน|ส่ง|ไฟล์|โอน|ชำระ|เคลม|อยาก|เอา|ขอ|ค่ะ|คะ|ครับ|นะ|หน่อย|ได้|แบบ|ตัวนี้|อันนี้|ตัวนั้น/.test(
      query,
    )
  );
}

export async function priceSearch(body: Record<string, unknown>): Promise<PriceSearchResult> {
  const t0 = Date.now();

  // agent ฝั่ง n8n ส่งชื่อฟิลด์ไม่แน่นอนตามที่ LLM เลือกใส่ — รับให้ครบทุกชื่อที่เจอ
  let query = fixTypos(
    String(body.query ?? body.message ?? body.text ?? body.q ?? "")
      .trim()
      .slice(0, 500),
  );
  if (!query) return { status: 400, body: { error: "ยังไม่ได้ส่งคำค้น" } };
  // ↩️ "ตามนี้เลยค่ะ" (ลูกค้ากดตอบกลับข้อความเดิมของตัวเอง — LINE ไม่ส่งข้อความที่อ้างถึงมา) = ถามข้อความก่อนหน้าซ้ำ (7 ต.ค. 69)
  if (/^(ตามนี้|ตามนั้น|ตามที่ถาม|ตามที่แจ้ง|ตามข้างบน|ตามที่ส่ง|อันนี้|แบบนี้)\s*(เลย|ค่ะ|คะ|ครับ|นะคะ|นะ|จ้า|\s)*$/.test(query) && Array.isArray(body.history)) {
    const prev = [...(body.history as { role?: string; text?: string }[])]
      .reverse()
      .find((t) => t && !/assistant|bot|shop|admin/i.test(String(t.role ?? "")) && String(t.text ?? "").trim() && String(t.text).trim() !== query);
    if (prev && String(prev.text).trim().length >= 6) query = fixTypos(String(prev.text).trim().slice(0, 500));
  }

  const qtyRaw = Number(body.qty ?? body.quantity ?? 0);
  let qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : parseQty(query);

  // 🧠 ข้อความก่อนหน้าของลูกค้า (เก่า→ใหม่) — LINE/AdminBuddy ส่งมาให้ชั้นเข้าใจคำถามใช้แก้ "เอาแบบกันฝน" ให้เป็นสินค้าจริง
  const context = (Array.isArray(body.context) ? body.context : typeof body.context === "string" ? [body.context] : [])
    .map((c) => String(c ?? "").trim())
    .filter(Boolean)
    .slice(-5);
  // 🧠 บทสนทนาทั้งสองฝั่ง [{role, text, at}] (1 ต.ค. 69) — ชั้นเข้าใจคำถามเห็นคำตอบของบอทด้วย + ตัดรอบสนทนาเก่าออกเอง
  // 🧠 profile = ก้อนข้อความโปรไฟล์ลูกค้าจาก /api/bot/customer-profile (ออเดอร์เก่า ระดับสมาชิก สรุปแชท) ถ้าบอทส่งมา
  const profile = typeof body.profile === "string" ? body.profile : "";
  // understandModel = ชื่อโมเดล Gemini ไว้ทดสอบเทียบ (ไม่ส่ง = ค่าเริ่มต้น gemini-2.5-flash ถอยไป flash-lite เมื่อล้มเหลว)
  const understandModel = typeof body.understandModel === "string" && /^gemini-[a-z0-9.-]+$/.test(body.understandModel) ? body.understandModel : undefined;
  const u: Understanding | null = body.mode ? null : await understand(query, context, body.history, profile, understandModel);

  let mode: "price" | "spec" | "minqty" | "mix" = pickMode(query, body.mode);
  let searchQuery = query;
  let pick: Pick | undefined;
  let ans: PriceAnswer | null = null;

  if (IMG_REF_RE.test(query) && lastUserTurnHasImage(body.history)) {
    // 🖼 8 ต.ค. 69 LINE: "รับทำงานแบบนี้ไหมคะ" 4 วิหลังส่งรูปป้าย PP Board — เครื่องคิดราคาไม่เห็นรูป เคยโยงไป "พวงกุญแจอะคริลิค" ที่คุยค้าง
    // แล้วตอบ "รับผลิตค่ะ" ทั้งที่ร้านไม่มีสินค้านั้น → ไม่ตอบ ให้ agent/แอดมินที่เห็นผลวิเคราะห์รูปตอบ
    ans = { answer: "", kind: "skip", source: "refers-to-image", intent: "unknown" };
  } else if (u) {
    // ลูกค้าถามหาของที่ร้านไม่มี → บอกตรง ๆ + เสนอตัวใกล้เคียง (เจอจริง 23 ก.ย. 69: "พวงกุญแจหนังปัก" ได้เมนูพวงกุญแจอะคริลิค/หมอนกลับไป)
    // สินค้าฉบับร่างที่ "ชื่อตรงกับที่ลูกค้าเรียก" ต้องชนะตัวใกล้เคียงที่ AI หยิบมาแทน (พวงกุญแจหนังปัก → ร่าง "พวงกุญแจหนังปักลาย"
    // ไม่ใช่ "กระเป๋าใส่พวงกุญแจ งานปัก") — เทียบว่าชื่อร่างตรงคำลูกค้ามากกว่าชื่อสินค้าที่ AI เลือกไหม
    const draft = ["price", "spec", "minqty", "mix"].includes(u.intent) ? await findDraftProduct(u.requested || query) : null;
    const draftWins =
      !!draft && (u.notInCatalog || !u.products.length || lcsLen(norm(draft.name), norm(query)) > Math.max(...u.products.map((n) => lcsLen(norm(n), norm(query)))));
    if (draft && draftWins) {
      // มีสินค้านี้ในระบบแต่ยังเป็นฉบับร่าง (ไม่มีราคา/รูปบนเว็บ) → บอกว่ารับทำ + ให้แอดมินตีราคา ไม่ใช่ "ร้านไม่มี"
      ans = {
        answer: `มีค่ะ ร้านรับทำ "${draft.name}" แต่ราคายังไม่ขึ้นบนเว็บ รบกวนแจ้งจำนวน ขนาด และลาย/ข้อความที่จะปัก แล้วแอดมินตีราคาให้เลยค่ะ`,
        kind: "info",
        source: "understood:draft-product",
        intent: "draft_product",
      };
    } else if (u.notInCatalog && ["price", "spec", "minqty"].includes(u.intent)) {
      const what = u.requested || query;
      const alts = u.alternatives;
      const lines = alts.map((a) => {
        const pr =
          a.priceMin && a.priceMax && a.priceMax > a.priceMin
            ? ` — ฿${a.priceMin.toLocaleString()}-${a.priceMax.toLocaleString()}`
            : a.priceMin
              ? ` — เริ่ม ฿${a.priceMin.toLocaleString()}`
              : "";
        return `• ${a.name}${pr}\n  ${a.url}`;
      });
      const text = alts.length
        ? `ตอนนี้ร้านยังไม่มี "${what}" ค่ะ ที่ใกล้เคียงกันมี:\n${lines.join("\n")}\nถ้าต้องการ "${what}" โดยเฉพาะ ทักแอดมินให้ตีราคาได้เลยค่ะ`
        : `ตอนนี้ร้านยังไม่มี "${what}" ค่ะ ถ้าต้องการงานลักษณะนี้ ทักแอดมินให้ตีราคาได้เลยค่ะ`;
      ans = { answer: text, kind: "info", source: "understood:not-in-catalog", intent: "not_in_catalog", product: alts[0], products: alts };
    } else if (u.ids.length >= 1 && (qty || u.qty) && parseBudget(query) && ["price", "spec", "other", "followup", "knowledge"].includes(u.intent)) {
      // 💸 บอกงบต่อชิ้น + จำนวน → ได้ไหม + แบบที่อยู่ในงบ (เครื่องคิดเงินเดียวกับตะกร้า)
      ans = await budgetAnswer(u.ids, (qty || u.qty) as number, parseBudget(query) as number, query);
      if (!ans) ans = await searchPrice(searchQuery, { qty: qty || u.qty, allowFallback: body.noFallback !== true, rateHint: query, pick: { ids: u.ids, broad: u.broad } });
    } else if (u.ids.length === 1 && (u.attr || (ATTR_RE.test(query) && INCLUDE_Q_RE.test(query) && !ATTR_RE.test(u.products[0] ?? "")))) {
      // ⚠️ สินค้าที่ "ชื่อเป็นอุปกรณ์เอง" (ตะขอแขวนผนังอะคริลิค) ถามราคา = ราคาสินค้านั้น ไม่ใช่ค่าตะขอเสริม
      // 🔩 อุปกรณ์/ตัวเลือก/รวมไหม ของสินค้าที่คุยอยู่ ("ราคารวมตะขอรึยัง" "ร้านมีตะขอแบบไหนบ้าง เท่าไหร่") → ตอบจากหน้าสินค้า ไม่ว่าจะมีจำนวนค้างในบทสนทนาหรือไม่
      ans = /ตะขอ|ห่วง|โซ่/.test(query) ? await hookAnswer(u.ids[0], query) : null;
      if (!ans || ans.kind === "skip") ans = await searchInfo(query, { ids: u.ids, broad: false });
      if (ans.kind === "skip") ans = await searchSpec(query, { ids: u.ids, broad: false });
    } else if ((u.intent === "price" || u.intent === "spec") && u.ids.length && !u.broad && !(qty || u.qty) && /เคลือบ|ฟอยล์|2 ด้าน|สองด้าน|รองพื้น|เพิ่มเท่าไหร่|บวกเพิ่ม|บวกเท่าไหร่|ค่าเพิ่ม|add.?on|ของเสริม|ได้ไหม|ได้มั้ย|มีไหม|มีมั้ย|ด้วยไหม|ด้วยมั้ย|ใช่ไหม|ใช่มั้ย/i.test(query)) {
      // ถามเรื่อง "ส่วนเสริม/ทำได้ไหม" ของสินค้าที่รู้ตัว (เคลือบฟอยล์ได้ไหม เพิ่มเท่าไหร่ · พิมพ์ 2 ด้านเพิ่มเท่าไหร่)
      // → ตอบจากหน้าสินค้า (มีราคาเพิ่มระบุไว้) แทนการเทตารางราคาหลัก/รายการตัวเลือกทั้งหมด (LLM สลับ price/spec ไม่นิ่ง จึงรับทั้งคู่)
      ans = await searchInfo(u.standalone && u.standalone.length <= 200 ? u.standalone : query, { ids: u.ids, broad: false });
      if (ans.kind === "skip") {
        const pk = { ids: u.ids, broad: u.broad };
        ans = u.intent === "spec" ? await searchSpec(searchQuery, pk) : await searchPrice(searchQuery, { qty, allowFallback: body.noFallback !== true, rateHint: query, pick: pk });
      }
    } else if (u.intent === "knowledge" && u.ids.length) {
      // ถามความรู้เกี่ยวกับสินค้าที่รู้ตัว → อ่านจากหน้าสินค้าจริง (ไม่พอ = ให้ agent ตอบ)
      ans = await searchInfo(u.standalone && u.standalone.length <= 200 ? u.standalone : query, { ids: u.ids, broad: u.broad });
      if (ans.kind === "skip") ans = { answer: "", kind: "skip", source: `understood:${u.intent}`, intent: "unknown" };
    } else if (["chitchat", "other", "followup"].includes(u.intent) && u.ids.length && !u.broad && (u.qty || qty || isPriceIntent(query))) {
      // LLM ตีเป็น other ทั้งที่ระบุสินค้า+จำนวน/คำว่าราคา (ข้อความหลายท่อน "สติ๊กเกอร์ UV 100 ดวง ราคา / ใช้ลายเองได้ไหม" · 29 ก.ย. 69) → คิดราคาตามปกติ
      mode = "price";
      pick = { ids: u.ids, broad: u.broad };
      if (!qty && u.qty) qty = u.qty;
      if (u.standalone && u.standalone.length <= 200) searchQuery = u.standalone;
    } else if (["knowledge", "order", "chitchat", "other", "followup"].includes(u.intent)) {
      ans = { answer: "", kind: "skip", source: `understood:${u.intent}`, intent: "unknown" };
    } else {
      // price/spec/minqty — LLM ชี้สินค้ามาก็ใช้ ไม่ชี้ (แต่เขียนคำถามใหม่ให้ครบแล้ว เช่น "ที่ติดรถยนต์แบบกันฝนมีแบบไหนบ้าง")
      // ก็เอาคำถามฉบับสมบูรณ์ไปค้นต่อตามปกติ — เคยตั้งให้ skip แล้วบอทเงียบทั้งที่ตีความถูก (24 ก.ย. 69)
      mode = u.intent === "spec" ? "spec" : u.intent === "minqty" ? "minqty" : u.intent === "mix" ? "mix" : "price";
      // บอกจำนวนที่จะสั่งมาด้วย ("สีขาวขุ่น 5cm 30 ชิ้น") = ต้องการราคา แม้ LLM จะตีเป็น spec (1 ต.ค. 69)
      if (mode === "spec" && (qty || u.qty) && u.ids.length === 1) mode = "price";
      if (u.ids.length) pick = { ids: u.ids, broad: u.broad };
      if (!qty && u.qty) qty = u.qty;
      // ใช้คำถามฉบับสมบูรณ์ (มีชื่อสินค้าจากบริบท) ไว้เลือกคอลัมน์/จับคู่ — แต่คงจำนวนจากข้อความจริง
      if (u.standalone && u.standalone.length <= 200) searchQuery = u.standalone;
      // ราคาโดยไม่ระบุสินค้าเลย (ถามลอย ๆ ว่า "ราคาเท่าไหร่") → ให้เส้นเดิมลองจับคู่จากข้อความ
    }
  }

  if (!ans) {
    if (!u && mode === "price" && !productQueryAllowed(query, qty)) {
      ans = { answer: "", kind: "skip", source: "not-a-product-question", intent: "unknown" };
    } else if (mode === "minqty") {
      ans = await searchMinQty(searchQuery, pick);
    } else if (mode === "mix") {
      ans = await searchMix(searchQuery, pick);
    } else if (mode === "spec") {
      ans = await searchSpec(searchQuery, pick);
    } else {
      ans = await searchPrice(searchQuery, { qty, allowFallback: body.noFallback !== true, rateHint: query, pick });
    }
    // ขั้นต่ำ/สเปกตอบไม่ได้ → ลองราคาต่อ (คำถามอย่าง "สั่ง 1 ชิ้นได้ไหม ราคาเท่าไหร่" ไม่ควรตอบว่างเปล่า)
    // คำถามคละลายไม่มีข้อมูล = ให้ agent ตอบ อย่าเทตารางราคา
    if (mode !== "price" && mode !== "mix" && ans.kind === "skip") {
      ans = await searchPrice(searchQuery, { qty, allowFallback: body.noFallback !== true, rateHint: query, pick });
    }
  }

  if (!u && /_menu$/.test(ans.intent) && !productQueryAllowed(query, qty)) {
    ans = { answer: "", kind: "skip", source: "not-a-product-question", intent: "unknown" };
  }

  // 🎯 ถามเรื่องเฉพาะที่ "รายการตัวเลือก" ไม่ได้ตอบ → อย่าเทรายการ ให้ agent/คลังความรู้/แอดมินรับต่อ (8 ต.ค. 69 เทียบแชทจริง)
  // "Magsafe Wallet ใส่บัตรได้กี่อัน" "ไม่รับสายลดไหม" "เคลือบอะไรได้คะ" "มีซองแยกชิ้นไหม" เคยได้แค่ "• ขนาด (1 แบบ): …"
  if (ans.intent === "spec" && SPECIFIC_Q_RE.test(query) && !LIST_Q_RE.test(query) && !EXTRA_ASK_RE.test(query) && !specCoversQuery(query, ans.answer)) {
    ans = { answer: "", kind: "skip", source: "spec-not-covering-question", intent: "unknown" };
  }
  // เมนูกลุ่มสินค้าก็เหมือนกัน: "เคลือบได้แค่เคลือบเงาใช่ไหม" "ฐานเปลี่ยนลายได้ไหม" "สีแบบนี้เลยใช่มั้ย" เคยได้เมนูสติ๊กเกอร์/กริ๊บต๊อก/เสื้อ
  // (ยกเว้นถาม "มี/รับทำ X ไหม" ที่อยากเห็นตัวเลือกจริง ๆ · และเรื่องคุณสมบัติที่ extraInfo ด้านล่างตอบแปะหัวให้ เช่น "แบบที่ 2 กันน้ำไหม")
  if (ans.intent === "spec_menu" && SPECIFIC_Q_RE.test(query) && !LIST_Q_RE.test(query) && !AVAIL_Q_RE.test(query) && !EXTRA_ASK_RE.test(query)) {
    ans = { answer: "", kind: "skip", source: "menu-not-covering-question", intent: "unknown" };
  }

  // 🧩 ตอบให้ครบทุกเรื่องที่ลูกค้าถาม (29 ก.ย. 69 "อยากได้ที่ติดรถยนต์ / มีแบบไหนบ้าง / เอาแบบกันฝน" → เดิมได้แต่ตารางราคา)
  // LINE รวมหลายข้อความด้วย " / " · ถ้ามีเรื่องคุณสมบัติ (กันน้ำ/กันฝน/…) หรือถามหลายท่อน และคำตอบหลักเป็นราคา/ตัวเลือกของสินค้าตัวเดียว
  // → ถามหน้าสินค้าอีกรอบเฉพาะส่วนที่เหลือ แล้วแปะไว้หัวคำตอบ (ไม่มีเรื่องอื่น = ไม่แปะ)
  const parts = query.split(/\s*\/\s*|\n+/).map((x) => x.trim()).filter(Boolean);
  if (
    ans.answer &&
    ans.product &&
    !/_menu$/.test(ans.intent) &&
    /^(price|spec|minqty)/.test(ans.intent) &&
    (EXTRA_ASK_RE.test(query) || parts.length >= 2)
  ) {
    const extra = await extraInfo(u?.standalone && u.standalone.length <= 200 && parts.length < 2 ? u.standalone : query, ans.product.id);
    if (extra) ans = { ...ans, answer: `${extra}\n\n${ans.answer}`, source: `${ans.source}+extra-info`, extra };
  }

  // ไม่มีคำตอบและไม่ใช่คำถามราคา → บอก agent ตรง ๆ ว่าเครื่องมือนี้ไม่ใช่ทางของคำถามนี้
  const text =
    ans.answer ||
    (isPriceIntent(query)
      ? "ยังไม่มีราคาของรายการนี้ในระบบ รบกวนถามแอดมินให้ตีราคาให้นะคะ"
      : "คำถามนี้ไม่ใช่คำถามราคา ไม่ต้องใช้ผลจากเครื่องมือนี้");

  const products: ProductRef[] = ans.products?.length ? ans.products : ans.product ? [ans.product] : [];
  const product = ans.product ?? products[0];

  return { status: 200, body: {
    // 4 ชื่อนี้ซ้ำกันโดยตั้งใจ — workflow เดิมอ่านคนละฟิลด์กันแล้วแต่โหนด
    answer: text,
    result: text,
    response: text,
    text,
    kind: ans.kind,
    source: ans.source,
    intent: ans.intent,
    mode,
    // สิ่งที่ชั้นเข้าใจคำถามสรุปได้ — ไว้ดีบัก/ให้บอทปลายทางตัดสินใจ (ไม่มี = ใช้ regex)
    understood: u
      ? {
          intent: u.intent,
          products: u.products,
          qty: u.qty,
          standalone: u.standalone,
          confidence: u.confidence,
          notInCatalog: u.notInCatalog,
          requested: u.requested,
          alternatives: u.alternatives.map((a) => a.name),
          debug: u.debug ?? null,
        }
      : null,
    found: ans.kind !== "skip" && !!ans.answer,
    // ส่วนที่ตอบเพิ่มนอกเหนือราคา/ตัวเลือก (กันน้ำ/ส่วนเสริม/ใช้ลายเอง) — แปะอยู่หัว answer แล้ว ให้ไว้เผื่อบอทปลายทางอยากแยกแสดง
    extra: ans.extra ?? null,
    qty: qty ?? null,
    ...(product ? { product } : {}),
    products,
    // แบน ๆ ให้ Code node / Flex builder หยิบตรง ๆ — ลิงก์และรูปของเว็บจริงเท่านั้น
    links: products.map((p) => p.url),
    images: products.map((p) => p.image).filter((s): s is string => !!s),
    site: "https://iduckystore.com",
    ms: Date.now() - t0,
  } };
}
