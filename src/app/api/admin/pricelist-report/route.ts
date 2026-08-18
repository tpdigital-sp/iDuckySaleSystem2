import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { fetchPricelistHome, PRICELIST_HOME } from "@/lib/server/pricelist-home";
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
}

/** ติ๊กว่า "จัดการชื่อนี้แล้ว" — ทีมงานเห็นตรงกันทุกคน (เก็บในฐานข้อมูล ไม่ใช่ในเครื่อง) */
export interface DoneMark {
  at: string;
  by: string;
}

export type DoneMap = Record<string, DoneMark>;

/** แถวเก็บรายการที่ติ๊กแล้ว (แถวพิเศษในตาราง products แบบเดียวกับตั้งค่าร้าน) */
const DONE_ID = "__pricelist_done__";

export interface PricelistRow {
  /**
   * รหัสประจำบรรทัด สำหรับจำว่าติ๊ก "ทำแล้ว" ไว้หรือยัง
   * = หมวด | ชื่อ | ลำดับที่ซ้ำ (บางหมวดมีชื่อซ้ำกันหลายใบ เช่น Cup Sleeve 2 ใบ)
   */
  key: string;
  /** ติ๊กแล้วโดยใคร เมื่อไหร่ (null = ยังไม่ติ๊ก) */
  done: DoneMark | null;
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

/** อ่านรายการที่ทีมงานติ๊กว่าทำแล้ว */
async function loadDone(sb: Db): Promise<DoneMap> {
  const { data } = await sb.from("products").select("data").eq("id", DONE_ID).maybeSingle();
  return ((data?.data as { done?: DoneMap } | null)?.done ?? {}) as DoneMap;
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
  const [{ data, error }, done] = await Promise.all([
    sb.from("products").select("id,name,category,data"),
    loadDone(sb),
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

  const rows: PricelistRow[] = cards.map((card) => {
    const key = norm(card.name);
    const dup = `${card.category}|${card.name}`;
    const no = (seen.get(dup) ?? 0) + 1;
    seen.set(dup, no);
    const rowKey = `${dup}|${no}`;
    let how: string | null = null;
    let hits = products.filter((p) => p.key === key);
    if (hits.length) how = "ชื่อตรงกัน";

    // ชื่อสั้นมาก (เช่น "PVC") ตัดออกจากรอบหลวม — ไปเจอคำที่ฝังอยู่ในชื่ออื่นเต็มไปหมด
    if (!hits.length && key.length >= 4) {
      hits = products.filter((p) => p.key.length >= 4 && (p.key.includes(key) || key.includes(p.key)));
      if (hits.length) how = "ชื่อครอบคลุมกัน";
    }
    if (!hits.length && key.length >= 5) {
      const scored = products
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
    // เผยแพร่แล้วขึ้นก่อน — เวลาโชว์แค่ 3 ตัวแรกจะได้เห็นตัวที่ขึ้นหน้าร้านจริง
    hits.sort((a, b) => Number(b.published) - Number(a.published) || a.name.localeCompare(b.name, "th"));
    return {
      key: rowKey,
      done: done[rowKey] ?? null,
      name: card.name,
      category: card.category,
      url: card.url,
      status: !hits.length ? "missing" : hits.some((p) => p.published) ? "published" : "draft",
      match: how,
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
    },
    rows,
    extras,
  });
}

/**
 * ติ๊ก/ยกเลิกติ๊ก "ทำแล้ว" ของชื่อบนเว็บ 1 บรรทัด
 * เป็นเช็กลิสต์การทำงานของทีม (ไม่ได้แก้ข้อมูลสินค้า) — ใครเปิดรายงานได้ก็ติ๊กได้
 */
export async function POST(req: Request) {
  const gate = await requirePerm("products.view");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { key?: string; done?: boolean };
  try {
    body = (await req.json()) as { key?: string; done?: boolean };
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const key = String(body.key ?? "").trim();
  if (!key) return NextResponse.json({ error: "ไม่ได้ระบุว่าติ๊กบรรทัดไหน" }, { status: 400 });

  const map = await loadDone(sb);
  const mark: DoneMark | null = body.done
    ? { at: new Date().toISOString(), by: gate.actor.name || gate.actor.username }
    : null;
  if (mark) map[key] = mark;
  else delete map[key];

  const { error } = await sb.from("products").upsert(
    {
      id: DONE_ID,
      name: "(รายงานเทียบเว็บตารางราคา — รายการที่ทำแล้ว)",
      category: "__settings__",
      price: 0,
      data: { done: map },
    },
    { onConflict: "id" }
  );
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true, mark });
}
