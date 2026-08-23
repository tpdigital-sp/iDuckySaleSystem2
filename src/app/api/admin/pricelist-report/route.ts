import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { fetchPricelistHome, PRICELIST_HOME, type PricelistCard } from "@/lib/server/pricelist-home";
import type { Product } from "@/lib/products";

export const runtime = "nodejs";

/**
 * 🔍 รายงานเทียบ "เว็บตารางราคา ↔ สินค้าในระบบ"
 *
 * ซ้าย  = ชื่อสินค้าทุกใบบนหน้าแรก iduckyofficial-pricelists.com (หน้าเดียว ไม่ไล่เข้าหน้าย่อย)
 * ขวา   = สินค้าในระบบหลังบ้าน ทั้งที่เผยแพร่แล้วและที่ยังเป็นฉบับร่าง
 * ผลลัพธ์ = ใบไหนขึ้นหน้าร้านแล้ว · ใบไหนยังเป็นร่าง · ใบไหนยังไม่มีในระบบ
 *           และมีสินค้าอะไรในระบบที่ไม่ได้อยู่บนเว็บตารางราคา
 *
 * อ่านอย่างเดียว — ไม่แก้ฐานข้อมูล
 */

/** สถานะของชื่อบนเว็บตารางราคา 1 ใบ */
export type PricelistStatus = "published" | "draft" | "missing";

/** สินค้าในระบบที่จับคู่กับชื่อบนเว็บได้ */
export interface MatchedProduct {
  id: string;
  slug: string;
  name: string;
  category: string;
  published: boolean;
  reviewed: boolean;
  hasImage: boolean;
  hasPricing: boolean;
  /** true = ทีมงานจับคู่เอง ไม่ใช่ระบบเดา */
  manual?: boolean;
}

/** ติ๊กว่า "จัดการชื่อนี้แล้ว" — ทีมงานเห็นตรงกันทุกคน (เก็บในฐานข้อมูล ไม่ใช่ในเครื่อง) */
export interface DoneMark {
  at: string;
  by: string;
}

export type DoneMap = Record<string, DoneMark>;

/**
 * การจับคู่ที่ทีมงานสั่งเอง — รหัสสินค้า → รหัสบรรทัดที่ต้องการให้ไปอยู่
 * ค่าว่าง ("") = สั่งว่า "ไม่ใช่สินค้าของบรรทัดไหนเลย" · ไม่มีรหัสในนี้ = ปล่อยให้ระบบเดาเอง
 * เก็บเป็น "สินค้า 1 ตัวอยู่ได้บรรทัดเดียว" — ย้ายไปบรรทัดใหม่ = หลุดจากบรรทัดเดิมอัตโนมัติ
 */
export type AssignMap = Record<string, string>;

/** บรรทัดที่ทีมงานพิมพ์ชื่อเพิ่มเอง (ไม่ได้มาจากหน้าเว็บตารางราคา) */
export interface CustomRow {
  name: string;
  category: string;
  url: string;
  at: string;
  by: string;
}

/** ขึ้นต้นแบบนี้ = บรรทัดที่เพิ่มเอง (รหัสของชื่อบนเว็บเป็น "หมวด|ชื่อ|ลำดับ" จึงไม่ชนกัน) */
const CUSTOM_PREFIX = "__custom__|";
// ไม่ export — ไฟล์ route.ts ของ Next ให้ export ได้เฉพาะชื่อที่กำหนด (GET/POST/runtime/...) ไม่งั้น build ล้ม
const isCustomKey = (key: string) => key.startsWith(CUSTOM_PREFIX);

/** แถวเก็บสถานะของรายงาน (เช็กลิสต์ + การจับคู่เอง) — แถวพิเศษในตาราง products แบบเดียวกับตั้งค่าร้าน */
const STATE_ID = "__pricelist_done__";

interface ReportState {
  done: DoneMap;
  /** สั่งให้พี่ปุ๋ยทำราคาของชื่อนี้ (คนละช่องกับ "ทำแล้ว") */
  price: DoneMap;
  /** พี่ปุ๋ยเริ่มลงมือทำราคาของชื่อนี้แล้ว (ต้องมีคำสั่งงานใน price ก่อน) */
  priceWip: DoneMap;
  /** พี่ปุ๋ยทำราคาของชื่อนี้เสร็จแล้ว (ต้องมีคำสั่งงานใน price ก่อน) */
  priceDone: DoneMap;
  /** ลบออกจากรายงาน — ชื่อที่ไม่ใช่สินค้าจริง (หัวข้อย่อย/คำอธิบายบนเว็บ) เก็บไว้กู้คืนได้ */
  hidden: DoneMap;
  assign: AssignMap;
  /** ชื่อที่ทีมงานเพิ่มเอง — รหัสบรรทัด → รายละเอียด */
  custom: Record<string, CustomRow>;
  /** แก้ชื่อของบรรทัดที่มาจากหน้าเว็บ — รหัสบรรทัด → ชื่อใหม่ (รหัสยังยึดชื่อเดิม ติ๊กเดิมจึงไม่หาย) */
  rename: Record<string, string>;
  /** เลขรุ่นของเอกสารสถานะ — เพิ่มทีละ 1 ทุกครั้งที่บันทึก ใช้กันคำสั่งที่ยิงพร้อมกันเขียนทับกัน */
  rev?: number;
}

/** บรรทัดที่ถูกลบออกจากรายงาน (ไว้โชว์ในถังลบ ให้กู้คืนได้) */
export interface HiddenRow {
  key: string;
  name: string;
  category: string;
  url: string;
  at: string;
  by: string;
  /** true = บรรทัดที่ทีมงานเพิ่มเอง (ลบถาวรได้) */
  custom?: boolean;
}

export interface PricelistRow {
  /**
   * รหัสประจำบรรทัด สำหรับจำว่าติ๊ก "ทำแล้ว" ไว้หรือยัง
   * = หมวด | ชื่อ | ลำดับที่ซ้ำ (บางหมวดมีชื่อซ้ำกันหลายใบ เช่น Cup Sleeve 2 ใบ)
   */
  key: string;
  /** ติ๊กแล้วโดยใคร เมื่อไหร่ (null = ยังไม่ติ๊ก) */
  done: DoneMark | null;
  /** ติ๊กว่า "ให้พี่ปุ๋ยทำราคา" โดยใคร เมื่อไหร่ (null = ยังไม่ติ๊ก) */
  priceTask: DoneMark | null;
  /** พี่ปุ๋ยกดว่าเริ่มลงมือทำราคาแล้ว โดยใคร เมื่อไหร่ (null = ยังไม่เริ่ม) */
  priceWip: DoneMark | null;
  /** พี่ปุ๋ยกดว่าทำราคาเสร็จแล้ว โดยใคร เมื่อไหร่ (null = ยังไม่เสร็จ) */
  priceDone: DoneMark | null;
  name: string;
  category: string;
  url: string;
  status: PricelistStatus;
  /** จับคู่ด้วยวิธีไหน (null = ไม่เจอในระบบ) */
  match: string | null;
  /**
   * สินค้าในระบบที่ตรงกับชื่อนี้ — มีได้หลายตัว เพราะการ์ดบนหน้าแรกเป็นชื่อรวม
   * (เช่น "พวงกุญแจ" ในระบบแตกเป็นพวงกุญแจหลายแบบตามตารางราคา)
   */
  products: MatchedProduct[];
  /** true = บรรทัดที่ทีมงานพิมพ์เพิ่มเอง ไม่ได้มาจากหน้าเว็บ */
  custom: boolean;
  /** ชื่อเดิมบนหน้าเว็บ ถ้าทีมงานแก้ชื่อไว้ (null = ยังใช้ชื่อเดิม) */
  webName: string | null;
}

/** ชื่อในรูปที่เทียบกันได้ — ตัดเว้นวรรค เครื่องหมาย และวรรณยุกต์/การันต์ไทยออก */
const norm = (s: string) =>
  String(s)
    .toLowerCase()
    .replace(/[\s​]+/g, "")
    .replace(/[()（）[\]{}|/\\,.·•:;'"“”‘’\-–—_+*#!?]/g, "")
    .replace(/[์็่้๊๋ํ]/g, "");

/** ชุดตัวอักษรคู่ (bigram) ไว้วัดความคล้าย */
const grams = (s: string) => {
  const g = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
  return g;
};

/** ความคล้ายของสองชื่อ 0–1 (Dice coefficient) */
const dice = (a: string, b: string) => {
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit++;
  return (2 * hit) / (A.size + B.size);
};

/** คล้ายกันเกินเท่านี้ถือว่าเป็นตัวเดียวกัน (ค่าเดิมจาก scripts/pricelist-audit.mjs) */
const SIMILAR_ENOUGH = 0.72;

type Db = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * อ่านสถานะรายงาน (ติ๊กว่าทำแล้ว + การจับคู่เอง)
 * คืน rev มาด้วย — สถานะทั้งหน้าอยู่ในเอกสารก้อนเดียว ตอนบันทึกต้องเช็คว่าไม่มีใครเขียนแทรก
 */
async function loadState(sb: Db): Promise<{ state: ReportState; rev: number | null; exists: boolean }> {
  const { data } = await sb.from("products").select("data").eq("id", STATE_ID).maybeSingle();
  const d = (data?.data ?? {}) as Partial<ReportState>;
  return {
    state: {
      done: d.done ?? {},
      price: d.price ?? {},
      priceWip: d.priceWip ?? {},
      priceDone: d.priceDone ?? {},
      hidden: d.hidden ?? {},
      assign: d.assign ?? {},
      custom: d.custom ?? {},
      rename: d.rename ?? {},
      rev: d.rev,
    },
    rev: typeof d.rev === "number" ? d.rev : null,
    exists: !!data,
  };
}

const STATE_NAME = "(รายงานเทียบเว็บตารางราคา — เช็กลิสต์ + งานพี่ปุ๋ย + การจับคู่เอง)";

/**
 * บันทึกสถานะกลับลงแถวเดิมแบบ "เช็คก่อนเขียน" (compare-and-swap)
 * เขียนสำเร็จเฉพาะตอนที่ rev ในฐานข้อมูลยังเป็นตัวเดียวกับที่อ่านมา — ถ้ามีใครบันทึกแทรกไปก่อน
 * จะได้ 0 แถว แล้วให้ผู้เรียกวนไปอ่านใหม่ทำซ้ำ
 *
 * ⚠️ เคยเป็นบั๊ก: เดิมใช้ upsert ทับทั้งก้อน — กดติ๊ก/จับคู่รัว ๆ หลายบรรทัด คำสั่งที่ยิงพร้อมกัน
 *    ต่างคนต่างอ่านสถานะเดิมมาแล้วเขียนทับกัน ตัวที่เขียนก่อนหายเงียบ ๆ ทั้งที่หน้าจอขึ้นว่าบันทึกแล้ว
 */
async function saveState(
  sb: Db,
  state: ReportState,
  rev: number | null,
  exists: boolean
): Promise<{ ok?: true; conflict?: true; error?: string }> {
  const next: ReportState = { ...state, rev: (rev ?? 0) + 1 };
  if (!exists) {
    const { error } = await sb
      .from("products")
      .insert({ id: STATE_ID, name: STATE_NAME, category: "__settings__", price: 0, data: next });
    // ชนกับคนที่เพิ่งสร้างแถวนี้พร้อมกัน = ให้ไปอ่านใหม่แล้วทำซ้ำ
    return error ? { conflict: true } : { ok: true };
  }
  const base = sb.from("products").update({ data: next }).eq("id", STATE_ID);
  const { data, error } = await (rev === null
    ? base.is("data->>rev", null)
    : base.eq("data->>rev", String(rev))
  ).select("id");
  if (error) return { error: error.message };
  return data?.length ? { ok: true } : { conflict: true };
}

/**
 * อ่าน–แก้–บันทึก แบบวนซ้ำจนกว่าจะเขียนติด (กันคำสั่งที่ยิงพร้อมกันเขียนทับกัน)
 * apply ต้องเป็นฟังก์ชันที่รันซ้ำได้ — ทุกครั้งจะได้สถานะล่าสุดมาใหม่เสมอ
 * คืน NextResponse ออกมาจาก apply = จบทันที (เช่นข้อมูลไม่ครบ) ไม่ต้องบันทึก
 */
async function updateState(
  sb: Db,
  apply: (state: ReportState) => NextResponse | Record<string, unknown>
): Promise<NextResponse> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const { state, rev, exists } = await loadState(sb);
    const out = apply(state);
    if (out instanceof NextResponse) return out;
    const saved = await saveState(sb, state, rev, exists);
    if (saved.ok) return NextResponse.json({ ok: true, ...out });
    if (saved.error) return NextResponse.json({ error: saved.error }, { status: 500 });
    // ชนกัน — ถอยแป๊บนึงแล้วอ่านใหม่ · หน่วงเพิ่มทีละรอบ + สุ่มนิดหน่อย
    // (ถ้าทุกคนถอยเท่ากันเป๊ะ จะกลับมาชนพร้อมกันที่เดิมไม่จบสักที)
    await new Promise((r) => setTimeout(r, 30 * (attempt + 1) + Math.random() * 90));
  }
  return NextResponse.json(
    { error: "มีการบันทึกพร้อมกันหลายรายการ ลองอีกครั้ง" },
    { status: 409 }
  );
}

export async function GET(req: Request) {
  const gate = await requirePerm("products.view");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const refresh = new URL(req.url).searchParams.get("refresh") === "1";

  // ── 1. ชื่อสินค้าบนหน้าแรกเว็บตารางราคา ──
  let cards;
  try {
    cards = await fetchPricelistHome(refresh);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `ดึงหน้าเว็บตารางราคาไม่สำเร็จ — ${msg}` }, { status: 502 });
  }

  // ── 2. สินค้าในระบบ (เอาทั้งที่เผยแพร่แล้วและฉบับร่าง) + รายการที่ติ๊กว่าทำแล้ว ──
  const [{ data, error }, { state }] = await Promise.all([
    sb.from("products").select("id,name,category,data"),
    loadState(sb),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const products = (data ?? [])
    .filter((r) => !String(r.id).startsWith("__") && r.category !== "__presets__")
    .map((r) => {
      const d = (r.data ?? {}) as Product;
      return {
        id: String(r.id),
        slug: String(d.slug ?? ""),
        name: String(d.name ?? r.name ?? ""),
        category: String(r.category ?? ""),
        published: !d.hidden,
        reviewed: !!d.reviewed,
        hasImage: !!(d.imageSrc || d.images?.some?.((i) => i.src)),
        hasPricing: !!(d.pricing || d.priceRates?.length),
        used: false,
        key: norm(String(d.name ?? r.name ?? "")),
      };
    })
    .filter((p) => p.name);

  /**
   * ── 3. จับคู่ชื่อ ──
   * การ์ดบนหน้าแรกมักเป็น "ชื่อรวม" ของสินค้าหลายตัวในระบบ (การ์ด "พวงกุญแจ" 1 ใบ
   * = พวงกุญแจหลายแบบตามตารางราคา) จึงจับคู่แบบ 1 ชื่อ → ได้หลายสินค้า
   * ไล่จากแม่นสุดไปหลวมสุด แล้วหยุดที่รอบแรกที่เจอ:
   *   1. ชื่อตรงกัน  2. ชื่อหนึ่งอยู่ในอีกชื่อ  3. ชื่อคล้ายกัน ≥ 72%
   */
  /** นับชื่อซ้ำในหมวดเดียวกัน เพื่อให้รหัสบรรทัด (key) ไม่ชนกัน */
  const seen = new Map<string, number>();

  /** สินค้าที่ทีมงานสั่งไว้เอง — ระบบจะไม่เดาให้อีก (กันไปโผล่ซ้ำอีกบรรทัด) */
  const pinned = new Set(Object.keys(state.assign));
  const guessable = products.filter((p) => !pinned.has(p.id));

  /** ให้รหัสบรรทัดก่อน แล้วค่อยคัดบรรทัดที่ถูกลบออก (รหัสจะได้ไม่เลื่อนตามการลบ) */
  const keyed = cards.map((card) => {
    const dup = `${card.category}|${card.name}`;
    const no = (seen.get(dup) ?? 0) + 1;
    seen.set(dup, no);
    const rowKey = `${dup}|${no}`;
    // ทีมงานแก้ชื่อไว้ = ใช้ชื่อใหม่ทั้งตอนโชว์และตอนจับคู่ (รหัสบรรทัดยังยึดชื่อเดิม ติ๊กที่ทำไว้จึงไม่หาย)
    const renamed = state.rename[rowKey]?.trim();
    return {
      rowKey,
      card: renamed ? { ...card, name: renamed } : card,
      webName: renamed ? card.name : null,
      custom: false,
    };
  });

  /** บรรทัดที่ทีมงานพิมพ์เพิ่มเอง — ต่อท้ายชื่อจากหน้าเว็บ (หมวดเดียวกันไปรวมกลุ่มเดียวกันเอง) */
  const customKeyed = Object.entries(state.custom).map(([rowKey, c]) => ({
    rowKey,
    card: { name: c.name, category: c.category, url: c.url } as PricelistCard,
    webName: null as string | null,
    custom: true,
  }));

  const allKeyed = [...keyed, ...customKeyed];

  const hiddenRows: HiddenRow[] = allKeyed
    .filter((x) => state.hidden[x.rowKey])
    .map((x) => ({
      key: x.rowKey,
      name: x.card.name,
      category: x.card.category,
      url: x.card.url,
      at: state.hidden[x.rowKey].at,
      by: state.hidden[x.rowKey].by,
      custom: x.custom,
    }));

  const rows: PricelistRow[] = allKeyed
    .filter((x) => !state.hidden[x.rowKey])
    .map(({ card, rowKey, webName, custom }) => {
    const key = norm(card.name);
    let how: string | null = null;
    let hits = guessable.filter((p) => p.key === key);
    if (hits.length) how = "ชื่อตรงกัน";

    // ชื่อสั้นมาก (เช่น "PVC") ตัดออกจากรอบหลวม — ไปเจอคำที่ฝังอยู่ในชื่ออื่นเต็มไปหมด
    if (!hits.length && key.length >= 4) {
      hits = guessable.filter((p) => p.key.length >= 4 && (p.key.includes(key) || key.includes(p.key)));
      if (hits.length) how = "ชื่อครอบคลุมกัน";
    }
    if (!hits.length && key.length >= 5) {
      const scored = guessable
        .filter((p) => p.key.length >= 5)
        .map((p) => ({ p, s: dice(key, p.key) }))
        .filter((x) => x.s >= SIMILAR_ENOUGH)
        .sort((a, b) => b.s - a.s);
      if (scored.length) {
        hits = scored.map((x) => x.p);
        how = `ชื่อคล้ายกัน ${Math.round(scored[0].s * 100)}%`;
      }
    }

    for (const p of hits) p.used = true;
    return {
      key: rowKey,
      done: state.done[rowKey] ?? null,
      priceTask: state.price[rowKey] ?? null,
      priceWip: state.priceWip[rowKey] ?? null,
      priceDone: state.priceDone[rowKey] ?? null,
      name: card.name,
      category: card.category,
      url: card.url,
      status: "missing", // คำนวณจริงหลังใส่ของที่จับคู่เองแล้ว
      match: how,
      custom,
      webName,
      products: hits.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        category: p.category,
        published: p.published,
        reviewed: p.reviewed,
        hasImage: p.hasImage,
        hasPricing: p.hasPricing,
      })),
    };
    });

  // ── 4. ใส่สินค้าที่ทีมงานจับคู่เองลงบรรทัดที่สั่งไว้ (ค่าว่าง = สั่งว่าไม่ใช่ของบรรทัดไหน) ──
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const [productId, rowKey] of Object.entries(state.assign)) {
    const p = byId.get(productId);
    const row = rowKey ? byKey.get(rowKey) : undefined;
    if (!p || !row) continue; // สินค้าถูกลบไปแล้ว หรือชื่อบนเว็บหายไป → ข้าม (ปล่อยไปอยู่ในกลุ่ม "ไม่เจอบนเว็บ")
    p.used = true;
    row.products.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: p.category,
      published: p.published,
      reviewed: p.reviewed,
      hasImage: p.hasImage,
      hasPricing: p.hasPricing,
      manual: true,
    });
  }

  for (const row of rows) {
    // เผยแพร่แล้วขึ้นก่อน — เวลาโชว์แค่ 3 ตัวแรกจะได้เห็นตัวที่ขึ้นหน้าร้านจริง
    row.products.sort((a, b) => Number(b.published) - Number(a.published) || a.name.localeCompare(b.name, "th"));
    row.status = !row.products.length ? "missing" : row.products.some((p) => p.published) ? "published" : "draft";
    if (row.products.some((p) => p.manual)) row.match = row.match ? `${row.match} + จับคู่เอง` : "จับคู่เอง";
  }

  /** สินค้าในระบบที่ไม่ได้อยู่บนหน้าแรกเว็บตารางราคา */
  const extras = products
    .filter((p) => !p.used)
    .map((p) => ({ id: p.id, slug: p.slug, name: p.name, category: p.category, published: p.published }));

  return NextResponse.json({
    source: PRICELIST_HOME,
    fetchedAt: new Date().toISOString(),
    sum: {
      cards: rows.length,
      categories: new Set(rows.map((r) => r.category)).size,
      published: rows.filter((r) => r.status === "published").length,
      draft: rows.filter((r) => r.status === "draft").length,
      missing: rows.filter((r) => r.status === "missing").length,
      adminTotal: products.length,
      adminPublished: products.filter((p) => p.published).length,
      adminDraft: products.filter((p) => !p.published).length,
      matched: products.filter((p) => p.used).length,
      extras: extras.length,
      done: rows.filter((r) => r.done).length,
      priceTasks: rows.filter((r) => r.priceTask).length,
      priceWip: rows.filter((r) => r.priceWip && !r.priceDone).length,
      priceDone: rows.filter((r) => r.priceDone).length,
      hidden: hiddenRows.length,
      custom: rows.filter((r) => r.custom).length,
    },
    rows,
    hiddenRows,
    extras,
  });
}

/**
 * บันทึกสถานะรายงาน 2 อย่าง (เป็นบันทึกการทำงานของทีม ไม่ได้แก้ข้อมูลสินค้า
 * — ใครเปิดรายงานได้ก็บันทึกได้):
 *
 *   { key, done }          ติ๊ก/ยกเลิกติ๊ก "ทำแล้ว" ของชื่อบนเว็บ 1 บรรทัด
 *   { key, price }         ติ๊ก/ยกเลิกติ๊ก "ให้พี่ปุ๋ยทำราคา" ของชื่อบนเว็บ 1 บรรทัด
 *   { key, priceStage }    เปลี่ยนขั้นงานทำราคาของ 1 บรรทัด: "todo" | "wip" | "done"
 *                          (ส่งค่าเดียวจบ — ไม่ต้องยิงสองรอบตอนข้ามขั้น)
 *   { key, hidden }        ลบบรรทัดออกจากรายงาน / กู้คืน (ไม่ได้ลบข้อมูลอะไรจริง)
 *   { add: {name,…} }      เพิ่มบรรทัดชื่อเอง (ชื่อที่ยังไม่มีบนเว็บตารางราคา)
 *   { key, edit: {name,…} } แก้ชื่อบนเว็บตารางราคาของบรรทัดนั้น (ชื่อว่าง = คืนชื่อเดิมจากเว็บ)
 *   { key, remove: true }  ลบบรรทัดที่เพิ่มเองทิ้งถาวร (ใช้ได้เฉพาะบรรทัดที่เพิ่มเอง)
 *   { productId, key }     ย้ายสินค้าในระบบไปอยู่บรรทัดชื่อที่ต้องการ
 *                          key = ""   → เอาออก (สั่งว่าไม่ใช่ของบรรทัดไหนเลย)
 *                          key = null → ล้างคำสั่ง กลับไปใช้การจับคู่อัตโนมัติ
 */
export async function POST(req: Request) {
  const gate = await requirePerm("products.view");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  /** ชื่อ/หมวด/ลิงก์ ของบรรทัดที่เพิ่มเองหรือที่แก้ชื่อ */
  interface RowInput {
    name?: string;
    category?: string;
    url?: string;
  }
  let body: {
    key?: string | null;
    done?: boolean;
    price?: boolean;
    priceStage?: "todo" | "wip" | "done";
    hidden?: boolean;
    productId?: string;
    add?: RowInput;
    edit?: RowInput;
    remove?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const who = gate.actor.name || gate.actor.username;

  // ทุกคำสั่งแก้เอกสารสถานะก้อนเดียวกัน — ส่งผ่าน updateState เสมอ (อ่านใหม่+ทำซ้ำถ้าชนกัน)
  return updateState(sb, (state) => {
    // ── เพิ่มบรรทัดชื่อเอง (ชื่อที่ยังไม่มีบนหน้าเว็บตารางราคา) ──
    if (body.add) {
      const name = String(body.add.name ?? "").trim();
      if (!name) return NextResponse.json({ error: "ยังไม่ได้ใส่ชื่อ" }, { status: 400 });
      let key = "";
      do {
        key = `${CUSTOM_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      } while (state.custom[key]);
      state.custom[key] = {
        name,
        category: String(body.add.category ?? "").trim() || "เพิ่มเอง",
        url: String(body.add.url ?? "").trim(),
        at: new Date().toISOString(),
        by: who,
      };
      return { key };
    }

    // ── ย้าย/เอาออก/คืนค่าอัตโนมัติ ของสินค้า 1 ตัว ──
    if (body.productId) {
      const productId = String(body.productId).trim();
      if (body.key === null || body.key === undefined) delete state.assign[productId];
      else state.assign[productId] = String(body.key);
      return { assign: state.assign[productId] ?? null };
    }

    const key = String(body.key ?? "").trim();
    if (!key) return NextResponse.json({ error: "ไม่ได้ระบุว่าติ๊กบรรทัดไหน" }, { status: 400 });

    // ── แก้ชื่อบรรทัด (เพิ่มเอง = แก้ชื่อ/หมวด/ลิงก์ได้หมด · จากเว็บ = แก้ได้เฉพาะชื่อ ชื่อว่าง = คืนชื่อเดิม) ──
    if (body.edit) {
      const name = String(body.edit.name ?? "").trim();
      if (isCustomKey(key)) {
        const cur = state.custom[key];
        if (!cur) return NextResponse.json({ error: "ไม่พบบรรทัดนี้" }, { status: 404 });
        if (!name) return NextResponse.json({ error: "ยังไม่ได้ใส่ชื่อ" }, { status: 400 });
        state.custom[key] = {
          ...cur,
          name,
          category: body.edit.category === undefined ? cur.category : String(body.edit.category).trim() || "เพิ่มเอง",
          url: body.edit.url === undefined ? cur.url : String(body.edit.url).trim(),
        };
      } else if (name) state.rename[key] = name;
      else delete state.rename[key];
      return {};
    }

    // ── ลบบรรทัดที่เพิ่มเองทิ้งถาวร (พร้อมติ๊ก/คำสั่งงาน/การจับคู่ที่ผูกกับบรรทัดนั้น) ──
    if (body.remove) {
      if (!isCustomKey(key)) return NextResponse.json({ error: "ลบถาวรได้เฉพาะบรรทัดที่เพิ่มเอง" }, { status: 400 });
      delete state.custom[key];
      delete state.done[key];
      delete state.price[key];
      delete state.priceWip[key];
      delete state.priceDone[key];
      delete state.hidden[key];
      for (const [productId, at] of Object.entries(state.assign)) if (at === key) delete state.assign[productId];
      return {};
    }

    // ── เปลี่ยนขั้นงานพี่ปุ๋ยทำราคา (รอ → กำลังทำ → เสร็จ) ──
    // จบในคำสั่งเดียว เพราะสองแมปต้องสอดคล้องกันเสมอ ถ้าให้ฝั่งหน้าเว็บยิงทีละช่อง
    // แล้วมีคำสั่งหลุดกลางทาง จะได้บรรทัดที่ "เสร็จแล้ว" ทั้งที่ยังไม่เคยเริ่ม
    if (body.priceStage) {
      const now = () => ({ at: new Date().toISOString(), by: who });
      if (body.priceStage === "todo") {
        delete state.priceWip[key];
        delete state.priceDone[key];
      } else if (body.priceStage === "wip") {
        state.priceWip[key] = state.priceWip[key] ?? now();
        delete state.priceDone[key];
      } else {
        // กดข้ามจาก "รอ" ไป "เสร็จ" ได้เลย — บันทึกเวลาเริ่มให้ด้วย จะได้ไม่มีงานที่เสร็จโดยไม่เคยเริ่ม
        state.priceWip[key] = state.priceWip[key] ?? now();
        state.priceDone[key] = now();
      }
      return { mark: state.priceDone[key] ?? state.priceWip[key] ?? null };
    }

    // ── ติ๊กช่องของ 1 บรรทัด ("ทำแล้ว" หรือ "ให้พี่ปุ๋ยทำราคา") ──
    const field = body.hidden !== undefined ? "hidden" : body.price !== undefined ? "price" : "done";
    const map = state[field];
    const mark: DoneMark | null = body[field] ? { at: new Date().toISOString(), by: who } : null;
    if (mark) map[key] = mark;
    else delete map[key];
    // ยกเลิกคำสั่งงานทำราคา = ล้างทั้ง "กำลังทำ" และ "เสร็จแล้ว" ของบรรทัดนั้น
    // จะได้ไม่ค้างเป็นงานที่ไม่มีอยู่จริง
    if (field === "price" && !mark) {
      delete state.priceWip[key];
      delete state.priceDone[key];
    }
    return { mark };
  });
}
