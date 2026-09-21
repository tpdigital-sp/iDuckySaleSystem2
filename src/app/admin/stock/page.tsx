"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import ImageLightbox from "@/components/ImageLightbox";
import { shrinkImageFile } from "@/lib/shrink-image";
import { useCan } from "@/lib/perm-context";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import type { StockSuggest, StockUsage } from "@/lib/stock-match";
import {
  badge,
  btnNeutral,
  btnPrimary,
  btnSmGhost,
  btnSmNeutral,
  card,
  code as codeCls,
  drawerPanel,
  drawerScrim,
  fieldLabel,
  h1,
  input as inputCls,
  label as labelCls,
  metric,
  subtle,
  TONE,
  type Tone,
} from "@/lib/admin-ui";
// ⚠️ หน้านี้มี <Banner> ของตัวเองอยู่แล้ว — import ของชุดกลางจึงตั้งชื่อใหม่กันชน
import { Btn, CopyChip, Empty, FChip, FilterCard, HeroStat, ListHead, PageHead, PageShell, SearchBox, Stat, Stats, TabRow, Tag } from "@/components/admin/ui";

/**
 * คลังสต๊อกวัสดุ — ยอดคงเหลือมาจาก ledger (stockMoves) เท่านั้น แก้ตัวเลขลอย ๆ ไม่ได้
 * ฝั่งผลิตเบิกจากหน้า TP-Leader (เบิกวัสดุผลิต) — คลังเดียวกัน เห็นในแท็บประวัติที่นี่ด้วย
 *
 * แบ่ง 4 แท็บให้ตรงกับงานจริง (โครงเดียวกับระบบรับของ/เบิกของฝั่ง TP):
 *   รายการสินค้า = ตารางดูยอด · รับเข้า / เบิกของ = ฟอร์มทำงาน · ประวัติ = ledger เต็ม
 */

interface Item {
  id: string;
  name: string;
  code?: string;
  aliases?: string[];
  family?: string;
  unit: string;
  category?: string;
  balance: number;
  reorderPoint?: number;
  leadTimeDays?: number;
  /** ทุนต่อหน่วย (บาท) — ใส่ไว้แล้วหน้ารายงานถึงคิดกำไรของออเดอร์ที่ใช้วัสดุตัวนี้ได้ */
  unitCost?: number;
  productIds?: string[];
  /** รูปที่ตั้งเอง (URL) — ว่าง = ระบบเดาจากตัวเลือก/สินค้าที่ผูก */
  imageUrl?: string;
  /** ชนิดของ ("กรอบรูป" / "แผ่นจิ๊กซอว์") — แบ่งกลุ่มย่อยในสินค้า รับเข้า/เบิก/สั่งของเป็นชุด */
  part?: string;
  /** 🔩 วัสดุแฝง { productId: จำนวนต่อสินค้า 1 ชิ้น } — ขาตั้ง/หมุดที่ไม่มีในตัวเลือก */
  bomFor?: Record<string, number>;
  /** 🚫 ไม่ต้องมีสต๊อก — ไม่เตือน ไม่นับมูลค่า ไม่ตัดยอดตอนขาย (อยู่ในชิป "ไม่ต้องมี stock" กู้กลับได้) */
  noStock?: boolean;
  needsReview?: boolean;
  autoCreated?: boolean;
  maybeDuplicateOf?: string;
}
interface Move {
  id: string;
  itemId: string;
  itemName: string;
  qty: number;
  reason: string;
  note?: string;
  refOrderId?: string;
  by: string;
  source: string;
  at: string;
  balanceAfter: number;
}
interface Stat {
  perDay: number;
  daysLeft: number | null;
  suggest: number | null;
  point: number | null;
  level: Tone;
}

/**
 * ตัวขยายรูป — รูปย่อทุกจุดในหน้านี้ (แถว/หัวกลุ่ม/ลิ้นชัก/โมดัล) กดแล้วเปิด ImageLightbox ตัวเดียวกันทั้งเว็บ
 * ส่งผ่าน context เพราะ <Thumb> ถูกใช้ลึกหลายชั้น ไม่อยากส่ง prop ไล่ลงไปทุกที่
 */
const ZoomCtx = createContext<((src: string, alt: string) => void) | null>(null);

/**
 * จำผลโหลดล่าสุดไว้ในแท็บ (sessionStorage) — เปิดหน้าซ้ำเห็นรายการทันที แล้วค่อยอัปเดตจากเซิร์ฟเวอร์เบื้องหลัง
 * (ยอด + การเชื่อมสินค้า โหลดจริง ~1–2 วิ · ของเก่าไม่เกิน 10 นาที และถูกทับทันทีที่ของใหม่มา)
 */
const WARM_TTL = 10 * 60_000;
function warmRead<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { at, v } = JSON.parse(raw) as { at: number; v: T };
    return Date.now() - at < WARM_TTL ? v : null;
  } catch {
    return null;
  }
}
function warmWrite(key: string, v: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), v }));
  } catch {}
}

/** ช่องเลือกในแถบเครื่องมือ — inputCls มี w-full ติดมา ต้องถอดก่อนไม่งั้นกินเต็มบรรทัด */
const selectCls = `${inputCls.replace("w-full ", "")} w-auto max-w-[14rem]`;
/** ช่องเลือกในการ์ดตัวกรองของแท็บรายการ — ทรงแคปซูลสูง 44px เข้าชุดกับ SearchBox (กดด้วยนิ้วโป้งได้) */
const dkSelect =
  "min-h-[44px] max-w-[13rem] flex-1 basis-[9rem] rounded-full border border-white/90 bg-white/75 px-4 text-[0.85rem] text-[color:var(--dk-navy)] outline-none focus:border-[color:var(--dk-blue)] sm:flex-none";

const fmtN = (n: number) => n.toLocaleString("th-TH");
const fmtAt = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const REASON_TONE: Record<string, Tone> = {
  นำเข้า: "ok",
  ขาย: "neutral",
  "คืน-ยกเลิก": "neutral",
  เบิกผลิต: "review",
  เบิกทำเสีย: "danger",
  ปรับยอดนับจริง: "warn",
};
const MOVE_FILTERS = ["ทั้งหมด", "นำเข้า", "ขาย", "เบิกผลิต", "เบิกทำเสีย", "ปรับยอดนับจริง"] as const;
const TABS = ["รายการสินค้า", "รับเข้า", "เบิกของ", "ประวัติ"] as const;
type Tab = (typeof TABS)[number];
type Filter = "ทั้งหมด" | "ต้องสั่ง" | "ใกล้หมด" | "รอตรวจ" | "ยังไม่ผูก" | "ไม่ต้องมีสต๊อก";
/** สินค้าให้เลือกผูกในฟอร์มแก้ไข SKU */
interface ProductLite {
  id: string;
  name: string;
  img?: string;
  draft?: boolean;
}
type SortKey = "urgency" | "name" | "balance" | "daysLeft";
/**
 * ของที่ "ห้อย" อยู่ใต้ SKU หนึ่งตัวในตาราง — extra = ผูกแบบมีเงื่อนไขกับตัวเลือกเดียวกัน · bom = วัสดุแฝงของสินค้า
 * target มีเฉพาะ extra (ชี้ตัวเลือกที่เก็บลิงก์ไว้ ใช้ตอนถอด) — bom ขอบเขตเป็นทั้งสินค้า ถอดจากตรงนี้ไม่ได้
 */
type HangRow = {
  id: string;
  name: string;
  img?: string;
  cond?: string;
  kind: "extra" | "bom";
  per?: number;
  target?: { productId: string; label: string; optionIndex: number; choice: string };
};

/** ติ๊ก "จัดแล้ว" ของกลุ่มหนึ่ง — ใครติ๊กและติ๊กเมื่อไหร่ */
type GroupDone = { at: string; by: string };
/**
 * แถว "วัสดุแฝง" ที่ห้อยอยู่ใต้ SKU ตัวเลือก — ระยะเยื้อง (px) และตำแหน่งเส้นก้าน
 * เส้นก้านตั้งอยู่กลางรูปย่อของแถวแม่พอดี: .dkb-row เว้นซ้าย 10 + รูป 44 → กึ่งกลาง 32
 */
const NEST_PAD = 78;
const NEST_RAIL = 32;
type DoneFilter = "ทั้งหมด" | "ยังไม่จัด" | "จัดแล้ว";

export default function StockPage() {
  const can = useCan();
  const mayEdit = can("orders.edit");
  const [tab, setTab] = useState<Tab>("รายการสินค้า");
  const [items, setItems] = useState<Item[]>([]);
  /** รูป + การเชื่อมกับสินค้าของแต่ละ SKU — โหลดแยกครั้งเดียว ไม่ตามรอบรีเฟรชยอด 20 วิ */
  const [images, setImages] = useState<Record<string, string>>({});
  const [usage, setUsage] = useState<Record<string, StockUsage[]>>({});
  const [suggest, setSuggest] = useState<Record<string, StockSuggest[]>>({});
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [linksReady, setLinksReady] = useState(false);
  const [moves, setMoves] = useState<Move[]>([]);
  const { confirm, dialog } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("ทุกหมวด");
  const [fam, setFam] = useState("ทุกตระกูล");
  const [filter, setFilter] = useState<Filter>("ทั้งหมด");
  const [sort, setSort] = useState<SortKey>("urgency");
  /** ตาราง 2 มุมมอง: แยกกลุ่มตามชื่อสินค้า (ค่าเริ่มต้น) / รายการรวมแบบเดิม */
  const [view, setView] = useState<"group" | "flat">("group");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  /**
   * ✅ กลุ่มที่ติ๊กว่า "จัดแล้ว" — ไล่จัดวัสดุ 140 กลุ่มใช้เวลาหลายวัน ปิดหน้าไปต้องกลับมาทำต่อถูกที่
   * เก็บที่เซิร์ฟเวอร์ (ไม่ใช่ในเครื่อง) ทีมที่ช่วยกันจัดจะได้เห็นตรงกันว่าถึงไหนแล้ว
   */
  const [doneGroups, setDoneGroups] = useState<Record<string, GroupDone>>({});
  /** กรองกลุ่มตามติ๊ก "จัดแล้ว" — ไล่จัดต่อจากเดิมให้เลือก "ยังไม่จัด" จะเหลือแต่ของที่ต้องทำ · จำไว้ข้ามวัน (งานนี้ทำหลายวัน) */
  const [doneFilter, setDoneFilter] = useState<DoneFilter>("ทั้งหมด");
  useEffect(() => {
    try {
      const v = localStorage.getItem("stock-done-filter");
      if (v === "ยังไม่จัด" || v === "จัดแล้ว") setDoneFilter(v);
    } catch {}
  }, []);
  const pickDoneFilter = (v: DoneFilter) => {
    setDoneFilter(v);
    try {
      localStorage.setItem("stock-done-filter", v);
    } catch {}
  };
  useEffect(() => {
    try {
      if (localStorage.getItem("stock-view") === "flat") setView("flat");
    } catch {}
  }, []);
  const pickView = (v: "group" | "flat") => {
    setView(v);
    try {
      localStorage.setItem("stock-view", v);
    } catch {}
  };
  const [openId, setOpenId] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<Item | null>(null);
  const [countFor, setCountFor] = useState<Item | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  /** สินค้าที่กำลังแยกสต๊อกตามตัวเลือก */
  const [splitFor, setSplitFor] = useState<{ id: string; name: string } | null>(null);
  /** สินค้าที่กำลังจัดวัสดุแฝง */
  const [bomFor, setBomFor] = useState<{ id: string; name: string } | null>(null);
  /** เลือกสินค้าก่อนเปิดวัสดุแฝง (ปุ่มบนหัวหน้า — สินค้าที่ยังไม่มีกลุ่มในคลังก็ตั้งได้) */
  const [bomPick, setBomPick] = useState(false);
  /** รับเข้า/เบิกทั้งชุด (กลุ่มย่อยตามชนิดของ) */
  const [bulkFor, setBulkFor] = useState<{ items: Item[]; title: string; mode: "in" | "out" } | null>(null);
  /** รูปที่กำลังขยายดู */
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const openZoom = useCallback((src: string, alt: string) => setZoom({ src, alt }), []);
  const [moveFilter, setMoveFilter] = useState<(typeof MOVE_FILTERS)[number]>("ทั้งหมด");
  const [logQ, setLogQ] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/stock");
    const j = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "โหลดข้อมูลไม่สำเร็จ");
      return;
    }
    setItems(j.items);
    setMoves(j.moves);
    warmWrite("stock:list", { items: j.items, moves: j.moves });
  }, []);
  // เปิดหน้า: โชว์ของที่จำไว้ก่อน (ถ้ามี) ระหว่างรอของจริง
  useEffect(() => {
    const w = warmRead<{ items: Item[]; moves: Move[] }>("stock:list");
    if (w) {
      setItems(w.items);
      setMoves(w.moves);
      setLoading(false);
    }
  }, []);
  const loadImages = useCallback(async (fresh = false) => {
    // fresh = เพิ่งแก้ข้อมูลไป ต้องข้ามแคช 60 วิ ของเซิร์ฟเวอร์
    const res = await fetch(fresh ? "/api/admin/stock/links?fresh=1" : "/api/admin/stock/links");
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) return;
    setImages(j.images ?? {});
    setUsage(j.usage ?? {});
    setSuggest(j.suggest ?? {});
    setProducts(j.products ?? []);
    setLinksReady(true);
    warmWrite("stock:links", { images: j.images, usage: j.usage, suggest: j.suggest, products: j.products });
  }, []);
  useEffect(() => {
    const w = warmRead<{ images: Record<string, string>; usage: Record<string, StockUsage[]>; suggest: Record<string, StockSuggest[]>; products: ProductLite[] }>("stock:links");
    if (w) {
      setImages(w.images ?? {});
      setUsage(w.usage ?? {});
      setSuggest(w.suggest ?? {});
      setProducts(w.products ?? []);
      setLinksReady(true);
    }
    void loadImages();
  }, [loadImages]);
  useEffect(() => {
    const w = warmRead<Record<string, GroupDone>>("stock:done");
    if (w) setDoneGroups(w);
    void (async () => {
      const res = await fetch("/api/admin/stock/group-done");
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) return; // ดูสต๊อกไม่ได้/เน็ตหลุด — ของที่จำไว้ในแท็บยังใช้ต่อได้
      setDoneGroups(j.done ?? {});
      warmWrite("stock:done", j.done ?? {});
    })();
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(load, 20_000); // การเดินสต๊อกจริง atomic ที่เซิร์ฟเวอร์ — ตรงนี้แค่รีเฟรชจอ
    return () => clearInterval(t);
  }, [load]);

  /** สถิติจาก ledger: ความเร็วใช้ (ขาย+เบิกผลิต) 30 วันหลัง → วันหมด + จุดสั่งแนะนำ + ระดับ */
  const stats = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400_000;
    const usage = new Map<string, number>();
    for (const m of moves) {
      if (m.qty >= 0) continue;
      if (m.reason !== "ขาย" && m.reason !== "เบิกผลิต") continue;
      if (new Date(m.at).getTime() < cutoff) continue;
      usage.set(m.itemId, (usage.get(m.itemId) ?? 0) + Math.abs(m.qty));
    }
    const out = new Map<string, Stat>();
    for (const it of items) {
      const perDay = (usage.get(it.id) ?? 0) / 30;
      const daysLeft = perDay > 0 ? Math.floor(Math.max(0, it.balance) / perDay) : null;
      const suggest = perDay > 0 && it.leadTimeDays ? Math.ceil(perDay * it.leadTimeDays * 1.2) : null; // +20% กันชน
      const point = it.reorderPoint ?? suggest;
      const level: Tone =
        point == null ? "neutral" : it.balance <= point ? "danger" : it.balance <= point * 1.5 ? "warn" : "ok";
      out.set(it.id, { perDay, daysLeft, suggest, point, level });
    }
    return out;
  }, [items, moves]);

  /** ของที่นับสต๊อกจริง — ตัวเลขสรุป/ชิป/เตือน คิดจากชุดนี้ · ของ "ไม่ต้องมี stock" แยกไปอยู่ชิปของตัวเอง */
  const tracked = useMemo(() => items.filter((i) => !i.noStock), [items]);
  const untracked = useMemo(() => items.filter((i) => i.noStock), [items]);
  const needOrder = useMemo(() => tracked.filter((i) => stats.get(i.id)?.level === "danger"), [tracked, stats]);
  /** 💰 มูลค่าของที่ค้างอยู่ในคลัง — นับเฉพาะ SKU ที่ใส่ทุนไว้ (บอกด้วยว่าใส่ไปกี่ตัวจากทั้งหมด) */
  const stockValue = useMemo(() => {
    let value = 0;
    let priced = 0;
    for (const i of tracked) {
      if (!i.unitCost || i.unitCost <= 0) continue;
      priced += 1;
      value += Math.max(0, i.balance) * i.unitCost;
    }
    return { value, priced };
  }, [tracked]);
  const nearLow = useMemo(() => tracked.filter((i) => stats.get(i.id)?.level === "warn"), [tracked, stats]);
  const toReview = useMemo(() => tracked.filter((i) => i.needsReview), [tracked]);
  const allParts = useMemo(() => [...new Set(items.map((i) => i.part).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "th")), [items]);
  /** การเชื่อมที่ "ใช้ได้จริง" — ตัดลิงก์ตายออก (ผูกกับรหัสสินค้าที่ถูกลบ/เปลี่ยนรหัสไปแล้ว ขายยังไงก็ไม่ตัด) */
  const live = useMemo(() => {
    const out: Record<string, StockUsage[]> = {};
    for (const [id, us] of Object.entries(usage)) out[id] = us.filter((u) => !(u.kind === "product" && u.missing));
    return out;
  }, [usage]);
  /**
   * ของที่โดนหักคู่กันต่อสินค้า — กลับด้าน usage (SKU → ตัวเลือก) เป็น (สินค้า → ตัวเลือก → SKU)
   * ใช้เขียนกำกับใต้แถว "ตัดพร้อมกับ…" (กล่องสรุปทั้งสินค้าเอาออกแล้ว — เจ้าของร้านบอกไม่ต้อง 19 ก.ย. 69)
   * ให้เห็นว่าของชิ้นไหนโดนหักคู่กัน (สั่งกรอบ = แผ่นจิ๊กซอว์โดนหักด้วย · เจ้าของร้านขอ 19 ก.ย. 69)
   * ไม่รวมคลังกลาง (ตะขอ/สีไหม ใช้กับหลายสินค้า — มีบอกในแถวของมันเองอยู่แล้ว)
   */
  const recipes = useMemo(() => {
    type Pick = { key: string; label: string; choice: string; optionIndex: number; always: string[]; extra: { id: string; cond?: string }[] };
    const out = new Map<string, { always: { id: string; per: number }[]; picks: Map<string, Pick> }>();
    const of = (pid: string) => out.get(pid) ?? out.set(pid, { always: [], picks: new Map() }).get(pid)!;
    for (const [id, us] of Object.entries(live)) {
      if (!items.some((i) => i.id === id)) continue; // ลบแล้ว/ไม่ต้องมี stock ไม่เอามาพูด
      for (const u of us) {
        if (u.kind === "preset") continue;
        if (u.kind === "product") {
          of(u.productId).always.push({ id, per: u.per ?? 1 });
          continue;
        }
        const r = of(u.productId);
        const key = `${u.optionIndex}|${u.choice}`;
        const pk = r.picks.get(key) ?? r.picks.set(key, { key, label: u.label, choice: u.choice, optionIndex: u.optionIndex, always: [], extra: [] }).get(key)!;
        if (u.extra) pk.extra.push({ id, cond: u.cond });
        else pk.always.push(id);
      }
    }
    return out;
  }, [live, items]);
  const nameOfId = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);
  /** ชื่อสั้นไว้เขียนกำกับ — ตัด "(ชื่อสินค้า)" ท้ายชื่อทิ้ง อ่านง่ายขึ้นในประโยค */
  const shortName = (id: string) => (nameOfId.get(id) ?? "?").replace(/\s*\([^()]*\)\s*$/, "");

  /** ยังไม่เชื่อมกับสินค้า/ตัวเลือกไหนเลย = ขายแล้วสต๊อกตัวนี้ไม่ขยับ */
  const unlinked = useMemo(() => (linksReady ? tracked.filter((i) => !live[i.id]?.length) : []), [tracked, live, linksReady]);

  /** รายการหมวด/ตระกูลที่มีจริงในคลัง — ตระกูลตามหมวดที่เลือกอยู่ ไม่ให้เลือกคู่ที่ไม่มีของ */
  const cats = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "th")),
    [items]
  );
  const fams = useMemo(
    () =>
      [
        ...new Set(
          items
            .filter((i) => cat === "ทุกหมวด" || i.category === cat)
            .map((i) => i.family)
            .filter(Boolean) as string[]
        ),
      ].sort((a, b) => a.localeCompare(b, "th")),
    [items, cat]
  );

  /** ตระกูลทั้งหมด (ไม่กรองตามหมวด) — ใช้เป็นตัวเลือกในฟอร์มแก้ไข */
  const allFams = useMemo(
    () => [...new Set(items.map((i) => i.family).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "th")),
    [items]
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = tracked;
    if (filter === "ไม่ต้องมีสต๊อก") list = untracked;
    else if (filter === "ต้องสั่ง") list = needOrder;
    else if (filter === "ใกล้หมด") list = nearLow;
    else if (filter === "รอตรวจ") list = toReview;
    else if (filter === "ยังไม่ผูก") list = unlinked;
    if (cat !== "ทุกหมวด") list = list.filter((i) => i.category === cat);
    if (fam !== "ทุกตระกูล") list = list.filter((i) => i.family === fam);
    if (needle) list = list.filter((i) => matchItem(i, needle));
    const rank: Record<string, number> = { danger: 0, warn: 1, neutral: 2, ok: 3, review: 4 };
    return [...list].sort((a, b) => {
      const sa = stats.get(a.id);
      const sb = stats.get(b.id);
      if (sort === "name") return a.name.localeCompare(b.name, "th");
      if (sort === "balance") return a.balance - b.balance;
      if (sort === "daysLeft") return (sa?.daysLeft ?? 1e9) - (sb?.daysLeft ?? 1e9);
      return (
        (rank[sa?.level ?? "neutral"] ?? 9) - (rank[sb?.level ?? "neutral"] ?? 9) || a.name.localeCompare(b.name, "th")
      );
    });
  }, [tracked, untracked, q, cat, fam, filter, sort, needOrder, nearLow, toReview, unlinked, stats]);

  async function doMove(itemId: string, qty: number, reason: string, note?: string, refOrderId?: string) {
    setErr("");
    setOk("");
    const res = await fetch("/api/admin/stock/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, qty, reason, note, refOrderId }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "บันทึกไม่สำเร็จ");
      return false;
    }
    await load();
    return true;
  }

  async function saveItem(body: Partial<Item> & { name: string }) {
    setErr("");
    const res = await fetch("/api/admin/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "บันทึกไม่สำเร็จ");
      return false;
    }
    await load();
    void loadImages(true); // ผูกสินค้า/ลิงก์รูปเปลี่ยน → รูปในตารางต้องตาม
    return true;
  }

  /**
   * ของที่ "ห้อย" อยู่ใต้ SKU ตัวนี้ในตาราง — ชุดเดียวกับที่หน้ารายการวาดเป็นแถวลูก
   * ลิ้นชักเคยไม่โชว์เลย เปิดตัวแม่มาแล้วไม่รู้ว่ามีอะไรพ่วงอยู่ (เจ้าของร้านแจ้ง 21 ก.ย. 69)
   *   extra = ของมีเงื่อนไขที่ผูกไว้กับตัวเลือกเดียวกัน — ถอดได้จากตรงนี้ (ขอบเขตชัด: เฉพาะตัวเลือกนี้)
   *   bom   = วัสดุแฝงของสินค้าที่ SKU นี้ผูกอยู่ — โชว์อย่างเดียว เพราะขอบเขตเป็น "ทั้งสินค้า" ไม่ใช่แถวนี้
   */
  function hangsOf(itemId: string): HangRow[] {
    const out: HangRow[] = [];
    const seen = new Set<string>([itemId]);
    const pids = new Set<string>();
    for (const u of live[itemId] ?? []) {
      if (u.kind === "preset") continue;
      pids.add(u.productId);
      if (u.kind !== "choice" || u.extra) continue;
      for (const x of recipes.get(u.productId)?.picks.get(`${u.optionIndex}|${u.choice}`)?.extra ?? []) {
        if (seen.has(x.id)) continue;
        seen.add(x.id);
        out.push({
          id: x.id,
          name: nameOfId.get(x.id) ?? "?",
          img: images[x.id],
          cond: x.cond,
          kind: "extra",
          target: { productId: u.productId, label: u.label, optionIndex: u.optionIndex, choice: u.choice },
        });
      }
    }
    // วัสดุแฝงของสินค้าเดียวกัน — ตัวมันเองไม่นับเป็นลูกของตัวเอง
    for (const [id, us] of Object.entries(live)) {
      if (seen.has(id)) continue;
      const b = us.find((u) => u.kind === "product" && u.bom && pids.has(u.productId));
      if (!b || !items.some((i) => i.id === id)) continue;
      seen.add(id);
      out.push({ id, name: nameOfId.get(id) ?? "?", img: images[id], kind: "bom", per: b.kind === "product" ? b.per : undefined });
    }
    return out;
  }

  /** ถอดของมีเงื่อนไขออกจากตัวเลือก — สั่งจากลิ้นชักของ "ตัวแม่" (ขอบเขต = ตัวเลือกนั้นตัวเดียว) */
  async function unlinkHang(h: HangRow): Promise<boolean> {
    if (!h.target) return false;
    setErr("");
    const res = await fetch("/api/admin/stock/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...h.target, unlinkExtra: h.id }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "ถอดไม่สำเร็จ");
      return false;
    }
    await loadImages(true);
    setOk(`ถอดแล้ว — ${h.target.label} = ${h.target.choice} ไม่ตัด ${h.name} เพิ่มอีก`);
    return true;
  }

  /**
   * ➕ ผูก SKU ตัวนี้เป็น "ของที่ตัดเพิ่มแบบมีเงื่อนไข" ของตัวเลือกหนึ่งในสินค้า
   * เขียนลง choices[ตัวหลัก].stockLinks — คืนข้อความ error ถ้าไม่สำเร็จ (null = สำเร็จ)
   * โหลดลิงก์ใหม่ทั้งชุดหลังผูก เพราะแถวลูกที่ห้อยใต้ตัวหลักต้องคำนวณจาก usage ของอีกตัว
   */
  async function linkExtra(pl: ExtraLinkPayload): Promise<string | null> {
    setErr("");
    const res = await fetch("/api/admin/stock/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: pl.productId,
        label: pl.label,
        optionIndex: pl.optionIndex,
        choice: pl.choice,
        linkExtra: { stockItemId: pl.stockItemId, per: pl.per, when: pl.when },
      }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) return j?.error ?? "ผูกไม่สำเร็จ";
    await loadImages(true);
    setOk(`ผูกแล้ว — ${pl.label} = ${pl.choice} จะตัด ${nameOfId.get(pl.stockItemId) ?? ""} เพิ่มตามเงื่อนไข`);
    return null;
  }

  /**
   * ผูก/ถอด SKU กับตัวเลือกจากลิ้นชัก — ใช้เส้นทางเดียวกับหน้า /admin/stock/link
   * สำเร็จแล้วแก้ในจอเอง ไม่โหลดภาพรวมใหม่ (ต้องลากตาราง products ทั้งก้อน ~6 วิ ต่อการกด 1 ครั้ง)
   */
  async function linkChoice(itemId: string, t: StockSuggest | StockUsage, on: boolean) {
    if (t.kind === "product") {
      if (on || !("bom" in t) || !t.bom) return false;
      // ถอดวัสดุแฝง
      setErr("");
      const res = await fetch("/api/admin/stock/bom", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: t.productId, stockItemId: itemId }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setErr(j?.error ?? "ถอดไม่สำเร็จ");
        return false;
      }
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, bomFor: j.item.bomFor } : i)));
      setUsage((u) => ({ ...u, [itemId]: (u[itemId] ?? []).filter((x) => !(x.kind === "product" && x.bom && x.productId === t.productId)) }));
      return true;
    }
    setErr("");
    const stockItemId = on ? itemId : null;
    const isExtra = !on && t.kind === "choice" && "extra" in t && !!t.extra;
    const body =
      t.kind === "preset"
        ? { presetId: t.presetId, choice: t.choice, stockItemId }
        : isExtra
          ? { productId: t.productId, label: t.label, optionIndex: t.optionIndex, choice: t.choice, unlinkExtra: itemId } // ถอดเฉพาะลิงก์มีเงื่อนไข ไม่แตะลิงก์หลักของตัวเลือก
          : { productId: t.productId, label: t.label, optionIndex: t.optionIndex, choice: t.choice, stockItemId };
    const res = await fetch("/api/admin/stock/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "บันทึกไม่สำเร็จ");
      return false;
    }
    const same = (a: StockSuggest | StockUsage) => {
      if (a.kind === "product" || a.kind !== t.kind || a.choice !== t.choice) return false;
      if (a.kind === "preset") return t.kind === "preset" && a.presetId === t.presetId;
      return (
        t.kind === "choice" &&
        a.productId === t.productId &&
        a.optionIndex === t.optionIndex &&
        !!("extra" in a && a.extra) === !!("extra" in t && t.extra)
      );
    };
    if (on) {
      const added: StockUsage =
        t.kind === "preset"
          ? { kind: "preset", presetId: t.presetId, label: t.label, choice: t.choice, per: 1, img: t.img, usedBy: t.usedBy, usedByNames: [] }
          : { kind: "choice", productId: t.productId, productName: t.productName, img: t.img, label: t.label, optionIndex: t.optionIndex, choice: t.choice, per: 1 };
      setUsage((u) => ({ ...u, [itemId]: [...(u[itemId] ?? []), added] }));
      setSuggest((g) => ({ ...g, [itemId]: (g[itemId] ?? []).filter((x) => !same(x)) }));
      if (t.img) setImages((m) => (m[itemId] ? m : { ...m, [itemId]: t.img! }));
    } else {
      setUsage((u) => ({ ...u, [itemId]: (u[itemId] ?? []).filter((x) => !same(x)) }));
      if (isExtra) return true; // ลิงก์มีเงื่อนไขผูกกลับจากตรงนี้ไม่ได้ (ต้องมีเงื่อนไข) — ไม่คืนเป็นคู่ที่น่าจะใช่
      // ถอดแล้วยังเป็น "คู่ที่น่าจะใช่" อยู่ — คืนกลับไปให้กดผูกใหม่ได้ถ้าถอดผิด
      const back: StockSuggest =
        t.kind === "preset"
          ? { kind: "preset", presetId: t.presetId, label: t.label, choice: t.choice, img: t.img, usedBy: t.usedBy }
          : { kind: "choice", productId: t.productId, productName: t.productName, img: t.img, label: t.label, optionIndex: t.optionIndex, choice: t.choice };
      setSuggest((g) => ({ ...g, [itemId]: [back, ...(g[itemId] ?? [])] }));
    }
    return true;
  }

  /**
   * ติ๊ก/ถอนติ๊ก "จัดแล้ว" ของกลุ่ม — ไม่ถาม ไม่มีผลกับยอดหรือการตัดสต๊อก กดกลับได้ทันที
   * ติ๊กแล้ว: แถบซ้ายเงียบลง หัวกลุ่มจาง และกด "ซ่อนที่จัดแล้ว" ให้เหลือแต่งานค้างได้
   */
  async function toggleGroupDone(key: string, title: string) {
    const on = !doneGroups[key];
    const before = doneGroups;
    setErr("");
    setOk("");
    // ติ๊กแล้วต้องเห็นทันที ไม่ต้องรอเซิร์ฟเวอร์ (ไล่ติ๊กรวดเดียวหลายสิบกลุ่ม)
    setDoneGroups((prev) => {
      const next = { ...prev };
      if (on) next[key] = { at: new Date().toISOString(), by: "กำลังบันทึก…" };
      else delete next[key];
      return next;
    });
    const res = await fetch("/api/admin/stock/group-done", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, on }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setDoneGroups(before); // เขียนไม่ติด (สิทธิ์/เน็ต) — คืนติ๊กเดิม ไม่ปล่อยให้เข้าใจผิดว่าบันทึกแล้ว
      setErr(j?.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    setDoneGroups(j.done ?? {});
    warmWrite("stock:done", j.done ?? {});
    setOk(on ? `ติ๊ก “${title}” ว่าจัดแล้ว` : `เอาติ๊ก “${title}” ออกแล้ว`);
  }

  /**
   * ตั้ง/ปลด "ไม่ต้องมี stock" — ทีละตัว (ลิ้นชัก) หรือทั้งกลุ่มสินค้า (หัวกลุ่ม)
   * ตั้งแล้ว: ย้ายไปชิป "ไม่ต้องมี stock" · ไม่เตือนสั่ง · ไม่นับมูลค่า · ขายแล้วไม่ตัดยอด — กดกลับได้ทุกเมื่อ
   */
  async function markNoStock(list: Item[], on: boolean, label: string) {
    if (!list.length) return;
    if (on) {
      const ok = await confirm({
        icon: "🚫",
        title: list.length === 1 ? `“${label}” ไม่ต้องมี stock ใช่ไหม?` : `${label} — ไม่ต้องมี stock ทั้ง ${fmtN(list.length)} รายการ?`,
        detail: "ย้ายไปอยู่ชิป “ไม่ต้องมี stock” · ไม่เตือนต้องสั่ง ไม่นับมูลค่าคลัง และขายแล้วไม่ตัดยอด\nกดกลับมานับสต๊อกได้ทุกเมื่อ ประวัติเดิมไม่หาย",
        confirmLabel: "ไม่ต้องมี stock",
      });
      if (ok !== true) return;
    }
    setErr("");
    setOk("");
    const res = await fetch("/api/admin/stock/no-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: list.map((i) => i.id), on }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    const ids = new Set(list.map((i) => i.id));
    setItems((prev) => prev.map((i) => (ids.has(i.id) ? { ...i, noStock: on || undefined } : i)));
    setOk(on ? `ตั้ง “${label}” เป็นไม่ต้องมี stock แล้ว (${fmtN(list.length)} รายการ)` : `“${label}” กลับมานับสต๊อกแล้ว (${fmtN(list.length)} รายการ)`);
  }

  /** ปลดป้าย "รอตรวจ" — ทีละตัว หรือทั้งกลุ่มสินค้า · ไม่ต้องถาม เพราะย้อนได้แค่ทางอ้อม (แก้ไขแล้วบันทึกไม่ติดป้ายอีก) และไม่มีผลกับยอด */
  async function markReviewed(list: Item[], label: string) {
    const targets = list.filter((i) => i.needsReview);
    if (!targets.length) return;
    setErr("");
    setOk("");
    const res = await fetch("/api/admin/stock/reviewed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: targets.map((i) => i.id) }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    const ids = new Set(targets.map((i) => i.id));
    setItems((prev) => prev.map((i) => (ids.has(i.id) ? { ...i, needsReview: undefined, maybeDuplicateOf: undefined } : i)));
    setOk(targets.length === 1 ? `ตรวจ “${label}” แล้ว` : `ตรวจ “${label}” แล้ว ${fmtN(targets.length)} รายการ`);
  }

  /** ลบ SKU = ปิดการใช้งาน (ประวัติ/ต้นทุนในรายงานยังอยู่) + ถอดลิงก์จากตัวเลือกสินค้าให้เอง */
  async function deleteItem(it: Item) {
    const bal = it.balance !== 0 ? `\nคงเหลือในระบบ ${fmtN(it.balance)} ${it.unit} — ยอดนี้จะหายจากมูลค่าคลังทันที` : "";
    const ok = await confirm({
      icon: "🗑",
      title: `ลบวัสดุ “${it.name}” ไหม?`,
      detail: `หายจากคลังและไม่ถูกตัดสต๊อกตอนขายอีก · ตัวเลือกสินค้าที่ผูกกับตัวนี้จะถูกถอดลิงก์ให้เอง\nประวัติการเคลื่อนไหวและต้นทุนในรายงานยังอยู่ครบ${bal}`,
      confirmLabel: "ลบวัสดุ",
      danger: true,
    });
    if (ok !== true) return;
    setErr("");
    // เอาออกจากจอทันที — เซิร์ฟเวอร์ต้องไล่ถอดลิงก์ในสินค้าอีกหลายวิ ถ้าแถวค้างอยู่คนจะกดลบซ้ำ (เกิดจริง 18 ก.ย. 69)
    setOpenId(null);
    setItems((prev) => prev.filter((i) => i.id !== it.id));
    setOk(`กำลังลบ ${it.name}…`);
    const res = await fetch(`/api/admin/stock?id=${encodeURIComponent(it.id)}`, { method: "DELETE" });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setOk("");
      setErr(`${j?.error ?? "ลบไม่สำเร็จ"} — ${it.name} ยังอยู่ในคลัง`);
      await load(); // เอาแถวกลับมาตามของจริง
      return;
    }
    setOk(`ลบ ${it.name} แล้ว${j.unlinked ? ` · ถอดลิงก์จากตัวเลือกสินค้า ${j.unlinked} รายการ` : ""}`);
    await load();
  }

  const todayMoves = moves.filter((m) => new Date(m.at).toDateString() === new Date().toDateString()).length;
  const monthDefect = moves
    .filter((m) => m.reason === "เบิกทำเสีย" && Date.now() - new Date(m.at).getTime() < 30 * 86400_000)
    .reduce((s, m) => s + Math.abs(m.qty), 0);
  const openItem = openId ? items.find((i) => i.id === openId) ?? null : null;
  /** กดกล่องสรุป → ไปแท็บรายการ + กรอง (กดซ้ำ = ล้างตัวกรอง) */
  const jump = (f: Filter) => {
    setTab("รายการสินค้า");
    setFilter((cur) => (cur === f && tab === "รายการสินค้า" ? "ทั้งหมด" : f));
  };

  /**
   * จัดแถวเป็นกลุ่มตามชื่อสินค้า
   *   เชื่อมกับสินค้าตัวเดียว            → อยู่ใต้สินค้านั้น
   *   ยังไม่เชื่อม แต่มีคู่ที่น่าจะใช่     → อยู่ใต้สินค้าของคู่นั้น (แถวยังขึ้นป้ายแดง "ยังไม่ผูก")
   *   ใช้กับหลายสินค้า/ผ่านคลังกลาง (ตะขอ สีไหม) → กลุ่ม "ใช้ร่วมหลายสินค้า · <ตระกูล>" ไม่งั้นต้องโชว์ซ้ำทุกสินค้า
   *   ไม่รู้เลยว่าเป็นของสินค้าไหน       → กลุ่มท้ายสุดแยกตามตระกูล
   */
  const groups = useMemo(() => {
    const prodById = new Map(products.map((p) => [p.id, p]));
    type G = { key: string; kind: 0 | 1 | 2 | 3; title: string; sub?: string; img?: string; productId?: string; rows: Item[] };
    const map = new Map<string, G>();
    const put = (g: Omit<G, "rows">, it: Item) => (map.get(g.key) ?? map.set(g.key, { ...g, rows: [] }).get(g.key)!).rows.push(it);
    const ofProduct = (pid: string, name: string, it: Item) =>
      put({ key: `p:${pid}`, kind: 0, title: prodById.get(pid)?.name ?? name, img: prodById.get(pid)?.img, productId: pid }, it);
    for (const it of rows) {
      const us = live[it.id] ?? [];
      const fam = it.family ?? it.category ?? "อื่น ๆ";
      const pids = new Map<string, string>();
      for (const u of us) if (u.kind !== "preset") pids.set(u.productId, u.productName);
      if (us.length) {
        const only = [...pids][0];
        if (pids.size === 1 && !us.some((u) => u.kind === "preset")) ofProduct(only[0], only[1], it);
        else put({ key: `s:${fam}`, kind: 1, title: fam, sub: "ใช้ร่วมหลายสินค้า" }, it);
        continue;
      }
      const sg = suggest[it.id]?.[0];
      if (sg?.kind === "choice") ofProduct(sg.productId, sg.productName, it);
      else if (sg?.kind === "preset") put({ key: `s:${fam}`, kind: 1, title: fam, sub: "ใช้ร่วมหลายสินค้า" }, it);
      else if (usage[it.id]?.length)
        put({ key: "ghost", kind: 2, title: "สินค้าที่ผูกไว้ไม่มีในระบบแล้ว", sub: "สินค้าถูกลบหรือเปลี่ยนรหัส — ขายแล้วไม่ตัดยอด ต้องเปิดแก้ไขแล้วเลือกสินค้าใหม่" }, it);
      else put({ key: `n:${fam}`, kind: 3, title: fam, sub: "ยังไม่รู้ว่าใช้กับสินค้าไหน" }, it);
    }
    return [...map.values()].sort((a, b) => a.kind - b.kind || a.title.localeCompare(b.title, "th"));
  }, [rows, usage, live, suggest, products]);
  const grouped = view === "group" && linksReady;
  /** กำลังค้น/กรองอยู่ = กางทุกกลุ่มให้เห็นผลเลย ไม่ต้องไล่กดเปิด */
  const forceOpen = q.trim() !== "" || filter !== "ทั้งหมด" || cat !== "ทุกหมวด" || fam !== "ทุกตระกูล";
  const allOpen = groups.length > 0 && groups.every((g) => openGroups.has(g.key));
  const doneCount = useMemo(() => groups.filter((g) => doneGroups[g.key]).length, [groups, doneGroups]);
  const shownGroups = useMemo(
    () => (doneFilter === "ทั้งหมด" ? groups : groups.filter((g) => !!doneGroups[g.key] === (doneFilter === "จัดแล้ว"))),
    [groups, doneGroups, doneFilter],
  );

  const logRows = useMemo(() => {
    const needle = logQ.trim().toLowerCase();
    return moves
      .filter((m) => moveFilter === "ทั้งหมด" || m.reason === moveFilter)
      .filter((m) => !needle || `${m.itemName} ${m.note ?? ""} ${m.by} ${m.refOrderId ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 200);
  }, [moves, moveFilter, logQ]);

  return (
    <ZoomCtx.Provider value={openZoom}>
    <PageShell>
      <PageHead
        group="สินค้า"
        title="คลังสต๊อกวัสดุ"
        count={`${fmtN(tracked.length)} รายการ`}
        sub="ขายหน้าเว็บตัดอัตโนมัติ · ฝั่งผลิตเบิกจากระบบเบิกของ · ทุกการเปลี่ยนมีบันทึกใน ledger"
        tools={
          mayEdit ? (
            <>
              <Btn href="/admin/stock/link">ผูกตัวเลือกสินค้า</Btn>
              <Btn onClick={() => setBomPick(true)} title="ของที่ทุกชิ้นใช้แต่ไม่มีในตัวเลือก เช่น ขาตั้ง หมุด ถุง — ใช้ได้กับสินค้าที่ยังไม่มีวัสดุในคลังด้วย">
                ＋ วัสดุแฝง
              </Btn>
              <Btn tone="yolk" onClick={() => setAddOpen(true)}>
                เพิ่มวัสดุ
              </Btn>
            </>
          ) : undefined
        }
      />

      {/* กล่องสรุป = ทางลัดไปงานที่ต้องทำ: กดแล้วสลับมาแท็บรายการ + กรองให้เลย */}
      <Stats cols={stockValue.priced > 0 ? undefined : 4}>
        <HeroStat
          n={fmtN(needOrder.length)}
          label="ถึงจุดต้องสั่ง"
          detail={
            // กล่องเด่นกิน 2 ช่องจาก 5 → เหลือที่ให้อีก 3 ใบ · "ใกล้หมด" จึงมาอยู่ในบรรทัดนี้ (และเป็นชิปกรองด้านล่าง)
            `${needOrder.length ? "สั่งเพิ่มก่อนของหมด" : "ของพอใช้ทุกตัว"} · ใกล้หมดอีก ${fmtN(nearLow.length)} ตัว · วันนี้เคลื่อนไหว ${fmtN(todayMoves)} ครั้ง`
          }
          pct={tracked.length ? (needOrder.length / tracked.length) * 100 : 0}
          onClick={() => jump("ต้องสั่ง")}
          active={tab === "รายการสินค้า" && filter === "ต้องสั่ง"}
        />
        <Stat
          label="ขายแล้วไม่ตัดยอด"
          value={linksReady ? fmtN(unlinked.length) : "…"}
          hint={linksReady ? `จาก ${fmtN(tracked.length)} รายการ — ยังไม่ผูกกับสินค้า` : "กำลังตรวจการเชื่อมกับสินค้า"}
          tone={unlinked.length ? "due" : undefined}
          onClick={() => jump("ยังไม่ผูก")}
          active={tab === "รายการสินค้า" && filter === "ยังไม่ผูก"}
        />
        <Stat
          label="เบิกทำเสีย 30 วัน"
          value={fmtN(monthDefect)}
          hint={monthDefect ? "ชิ้น — ควรดูสาเหตุ" : "ชิ้น"}
          tone={monthDefect ? "due" : undefined}
        />
        {/* ยังไม่ใส่ทุนสักตัว = กล่องนี้มีแต่ขีด — ไม่เอาพื้นที่ครึ่งบนของจอไปให้ของที่ไม่มีข้อมูล (คำชวนใส่ทุนอยู่ในฟอร์มแก้ไขแล้ว) */}
        {stockValue.priced > 0 && (
          <Stat
            wide
            label="มูลค่าของในคลัง"
            value={`฿${fmtN(Math.round(stockValue.value))}`}
            hint={`ใส่ทุนไว้ ${fmtN(stockValue.priced)}/${fmtN(tracked.length)} รายการ`}
          />
        )}
      </Stats>

      {/* ── แท็บ ── */}
      <div className="dkb-g mb-4 mt-4 inline-flex p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              setOk("");
              setErr("");
            }}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              tab === t ? "bg-[color:var(--dk-navy)] text-white" : "text-[color:var(--dk-navy-soft)] hover:bg-white/70"
            }`}
          >
            {t}
            {t === "รายการสินค้า" && needOrder.length > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${tab === t ? "bg-white/20" : `${TONE.danger.bg} ${TONE.danger.text}`}`}>
                {needOrder.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {err && <Banner tone="danger">{err}</Banner>}
      {ok && <Banner tone="ok">{ok}</Banner>}

      {/* ── รายการสินค้า ── */}
      {tab === "รายการสินค้า" && (
        <>
          <FilterCard>
            <TabRow>
              <FChip on={filter === "ทั้งหมด"} onClick={() => setFilter("ทั้งหมด")} label="ทั้งหมด" count={tracked.length} />
              <FChip
                on={filter === "ต้องสั่ง"}
                onClick={() => setFilter("ต้องสั่ง")}
                label="ต้องสั่ง"
                count={needOrder.length}
                style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}
              />
              <FChip
                on={filter === "ใกล้หมด"}
                onClick={() => setFilter("ใกล้หมด")}
                label="ใกล้หมด"
                count={nearLow.length}
                style={{ background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" }}
              />
              <FChip
                on={filter === "ยังไม่ผูก"}
                onClick={() => setFilter("ยังไม่ผูก")}
                label="ยังไม่ผูกสินค้า"
                count={unlinked.length}
                style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}
              />
              <FChip
                on={filter === "รอตรวจ"}
                onClick={() => setFilter("รอตรวจ")}
                label="รอตรวจ"
                count={toReview.length}
                style={{ background: "var(--dk-lilac-wash)", color: "var(--dk-lilac-ink)" }}
              />
              {untracked.length > 0 && (
                <FChip on={filter === "ไม่ต้องมีสต๊อก"} onClick={() => setFilter("ไม่ต้องมีสต๊อก")} label="ไม่ต้องมี stock" count={untracked.length} />
              )}
            </TabRow>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t pt-2.5" style={{ borderColor: "var(--dk-hair)" }}>
              <SearchBox value={q} onChange={setQ} placeholder="ค้นชื่อ รหัส ตระกูล หรือชื่อที่เคยเรียก…" />
              <select
                value={cat}
                onChange={(e) => {
                  setCat(e.target.value);
                  setFam("ทุกตระกูล"); // เปลี่ยนหมวดแล้วตระกูลเดิมอาจไม่มีในหมวดใหม่
                }}
                className={dkSelect}
                aria-label="หมวด"
              >
                <option>ทุกหมวด</option>
                {cats.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select value={fam} onChange={(e) => setFam(e.target.value)} className={dkSelect} aria-label="ตระกูล">
                <option>ทุกตระกูล</option>
                {fams.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={dkSelect} aria-label="เรียงลำดับ">
                <option value="urgency">เรียง: ต้องสั่งก่อน</option>
                <option value="daysLeft">เรียง: จะหมดเร็วสุด</option>
                <option value="balance">เรียง: คงเหลือน้อยสุด</option>
                <option value="name">เรียง: ชื่อ ก-ฮ</option>
              </select>
              {/* ✅ กรองตามติ๊ก "จัดแล้ว" — คนละแกนกับชิปสถานะของข้างบน (นั่นกรองรายการ อันนี้กรองกลุ่ม) กดชิปเดิมซ้ำ = กลับเป็นทั้งหมด */}
              {grouped && (
                <span className="flex items-center gap-1.5 sm:ml-auto" role="group" aria-label="กรองกลุ่มตามการจัดวัสดุ">
                  <FChip
                    on={doneFilter === "ยังไม่จัด"}
                    onClick={() => pickDoneFilter(doneFilter === "ยังไม่จัด" ? "ทั้งหมด" : "ยังไม่จัด")}
                    label="ยังไม่จัด"
                    count={groups.length - doneCount}
                    tone="yolk"
                  />
                  <FChip
                    on={doneFilter === "จัดแล้ว"}
                    onClick={() => pickDoneFilter(doneFilter === "จัดแล้ว" ? "ทั้งหมด" : "จัดแล้ว")}
                    label="จัดแล้ว"
                    count={doneCount}
                    tone="mint"
                  />
                </span>
              )}
            </div>
          </FilterCard>

          <div className="flex flex-wrap items-end justify-between gap-2">
            <ListHead
              title={grouped ? "วัสดุแยกตามสินค้า" : "วัสดุทั้งหมด"}
              note={
                grouped ? (
                  <>
                    {fmtN(groups.length)} กลุ่ม · {fmtN(rows.length)} รายการ ·{" "}
                    <b style={{ color: groups.length && doneCount === groups.length ? "var(--dk-mint-ink)" : "var(--dk-navy)" }}>
                      จัดแล้ว {fmtN(doneCount)}/{fmtN(groups.length)}
                    </b>
                    {doneCount < groups.length ? ` · เหลือ ${fmtN(groups.length - doneCount)}` : ""}
                  </>
                ) : (
                  `${fmtN(rows.length)} รายการ`
                )
              }
            />
            <div className="flex items-center gap-2 px-2 pb-2">
              {grouped && !forceOpen && (
                <button
                  type="button"
                  onClick={() => setOpenGroups(allOpen ? new Set() : new Set(groups.map((g) => g.key)))}
                  className="dkb-btn dkb-btn-ghost dkb-btn-sm"
                >
                  {allOpen ? "ปิดทุกกลุ่ม" : "เปิดทุกกลุ่ม"}
                </button>
              )}
              <div className="dkb-g inline-flex p-1" role="group" aria-label="มุมมองรายการ">
                {(["group", "flat"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => pickView(v)}
                    className={`min-h-[34px] rounded-lg px-3 text-[0.78rem] font-medium transition ${
                      view === v ? "bg-[color:var(--dk-navy)] text-white" : "text-[color:var(--dk-navy-soft)] hover:bg-white/70"
                    }`}
                  >
                    {v === "group" ? "ตามสินค้า" : "รายการรวม"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <Empty title="กำลังโหลด…" body="ดึงยอดคงเหลือกับประวัติจากคลัง" />
          ) : rows.length === 0 ? (
            <div>
              <Empty
                title={items.length === 0 ? "ยังไม่มีวัสดุในคลัง" : "ไม่พบวัสดุที่ตรงกับตัวกรอง"}
                body={items.length === 0 ? "กด “เพิ่มวัสดุ” มุมขวาบนเพื่อเริ่มนับสต๊อกตัวแรก" : "ลองล้างคำค้น หรือกดชิป “ทั้งหมด”"}
              />
            </div>
          ) : (
            (() => {
              /**
               * inProductId = กำลังวาดอยู่ใต้หัวกลุ่มสินค้าตัวไหน (ไม่ส่ง = มุมมองรายการรวม) — ใช้ตัดชื่อสินค้าที่ซ้ำกับหัวกลุ่มทิ้ง
               * nest = แถวนี้ห้อยอยู่ใต้แถวด้านบน → เยื้องเข้า + ลากเส้นก้าน (last = ตัวสุดท้าย เส้นตั้งจบที่ตัวเอง)
               *        why/sub = เหตุผลที่ห้อยอยู่ตรงนี้ ใช้แทนช่อง "ขายอะไรแล้วตัด" ทั้งช่อง (ความสัมพันธ์กับแถวบนสำคัญกว่า)
               *        key ต้องส่งมาเอง เพราะตัวเดียวห้อยซ้ำได้ใต้หลายแถว (SKU เดียวกันโผล่หลายที่)
               * hung = ของที่ห้อยเป็นแถวลูกใต้แถวนี้แล้ว — ไม่ต้องเขียนประโยค "ถ้า…ตัด…เพิ่ม" ซ้ำอีก
               */
              const renderRow = (it: Item, inProductId?: string, nest?: { last: boolean; key: string; why: string; sub?: string }, hung?: Set<string>) => {
                const st = stats.get(it.id);
                const level = st?.level ?? "neutral";
                const dead = (usage[it.id]?.length ?? 0) > (live[it.id]?.length ?? 0);
                return (
                  <li key={nest?.key ?? it.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenId(it.id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpenId(it.id))}
                      className={`dkb-row !rounded-none cursor-pointer flex-wrap px-4 sm:flex-nowrap ${nest ? "relative" : "pl-5"}`}
                      // ⚠️ เยื้องด้วย style ไม่ใช่คลาส — .dkb-row ใน dashboard.css ตั้ง padding ย่อ และไฟล์นั้นไม่ได้อยู่ใน @layer
                      // จึงชนะ utility ของ Tailwind v4 ทุกตัว (px-4/pl-* ข้างบนไม่เคยมีผลเลย · เจอจริง 21 ก.ย. 69)
                      style={nest ? { paddingLeft: NEST_PAD, minHeight: 54 } : undefined}
                    >
                      {/* ก้านเส้นบอกว่าแถวนี้ห้อยอยู่ใต้แถวด้านบน — ตัวสุดท้ายเส้นตั้งจบกลางแถว ไม่ลากเลยไปแถวถัดไป */}
                      {nest && (
                        <span aria-hidden className="pointer-events-none absolute left-0 top-0 h-full" style={{ width: NEST_PAD }}>
                          <span
                            className="absolute top-0 block w-0"
                            style={{ left: NEST_RAIL, height: nest.last ? "50%" : "100%", borderLeft: "2px solid var(--dk-quiet)" }}
                          />
                          <span
                            className="absolute top-1/2 block h-0"
                            style={{ left: NEST_RAIL, width: NEST_PAD - NEST_RAIL - 12, borderTop: "2px solid var(--dk-quiet)" }}
                          />
                        </span>
                      )}
                      <Thumb src={images[it.id]} name={it.name} size={nest ? 32 : 44} />
                      <span className="min-w-0 flex-1 basis-[12rem]">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={nest ? "text-[13px] font-medium" : "text-[14.5px] font-medium"} style={{ color: "var(--dk-navy)" }}>
                            {it.name}
                          </span>
                          {it.needsReview && <Tag tone="lilac">รอตรวจ</Tag>}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]" style={{ color: "var(--dk-faint)" }}>
                          {it.code && <span className="dkb-code">{it.code}</span>}
                          {!grouped && <span>{it.family ?? it.category ?? ""}</span>}
                        </span>
                      </span>
                      <span className={`w-full min-w-0 sm:w-80 sm:pl-0 ${nest ? "pl-[45px]" : "pl-[57px]"}`}>
                        {nest ? (
                          <span className="block break-words leading-snug">
                            <span className="block text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
                              {nest.why}
                            </span>
                            {nest.sub && (
                              <span className="block text-[11px]" style={{ color: "var(--dk-faint)" }}>
                                {nest.sub}
                              </span>
                            )}
                          </span>
                        ) : (
                          <LinkCell ready={linksReady} usage={live[it.id]} dead={dead} hasSuggest={!!suggest[it.id]?.length} inProductId={inProductId} />
                        )}
                        {(() => {
                          // ของที่โดนหักคู่กันในออเดอร์เดียว — มองจากตัวเลือกเดียวกันของสินค้าเดียวกัน + วัสดุแฝงของสินค้านั้น
                          if (nest) return null; // แถวที่ห้อยอยู่แล้วบอกอยู่ในตัวว่าตัดคู่กับแถวบน ไม่ต้องย้ำ
                          const with1: string[] = [];
                          const maybe: { id: string; cond?: string }[] = [];
                          for (const u of live[it.id] ?? []) {
                            if (u.kind === "preset") continue;
                            const r = recipes.get(u.productId);
                            if (!r) continue;
                            r.always.forEach((a) => a.id !== it.id && with1.push(a.id));
                            if (u.kind === "choice") {
                              const pk = r.picks.get(`${u.optionIndex}|${u.choice}`);
                              pk?.always.forEach((x) => x !== it.id && with1.push(x));
                              // ตัวนี้เองเป็นของมีเงื่อนไข → ของหลักของตัวเลือกนั้นโดนหักแน่ ๆ (อยู่ใน with1 แล้ว)
                              // ตัวนี้เป็นของหลัก → ของมีเงื่อนไขจะโดนหักเพิ่ม "ถ้า…"
                              if (!u.extra) pk?.extra.forEach((x) => x.id !== it.id && !hung?.has(x.id) && maybe.push(x));
                            }
                          }
                          const w = [...new Set(with1)];
                          if (!w.length && !maybe.length) return null;
                          return (
                            <span className="mt-1 block space-y-0.5 text-[11.5px] leading-snug" style={{ color: "var(--dk-navy-soft)" }}>
                              {w.length > 0 && (
                                <span className="block">
                                  🔗 ตัดพร้อมกับ <b className="font-semibold">{w.map(shortName).join(", ")}</b>
                                </span>
                              )}
                              {maybe.map((m) => (
                                <span key={m.id} className="block">
                                  ➕ ถ้า{m.cond ? ` ${m.cond}` : "เลือกแบบนั้น"} ตัด <b className="font-semibold">{shortName(m.id)}</b> เพิ่ม
                                </span>
                              ))}
                            </span>
                          );
                        })()}
                      </span>
                      <span className={`ml-auto flex shrink-0 items-center gap-3 sm:pl-0 ${nest ? "pl-[45px]" : "pl-[57px]"}`}>
                        <span className="text-right">
                          <span className="dkb-num block text-[1.15rem]" style={{ color: it.balance < 0 || level === "danger" ? "var(--dk-coral-ink)" : "var(--dk-navy)" }}>
                            {fmtN(it.balance)} <span className="text-[11px] font-normal" style={{ color: "var(--dk-faint)" }}>{it.unit}</span>
                          </span>
                          <span className="mt-1 block text-[11px] tabular-nums" style={{ color: "var(--dk-faint)" }}>
                            {st?.point != null ? `สั่งเมื่อ ≤ ${fmtN(st.point)}${it.reorderPoint == null ? "*" : ""}` : "ยังไม่ตั้งจุดสั่ง"}
                            {st?.daysLeft != null ? ` · หมดใน ~${fmtN(st.daysLeft)} วัน` : ""}
                          </span>
                        </span>
                        {level === "danger" ? <Tag tone="solid">ต้องสั่ง</Tag> : level === "warn" ? <Tag tone="yolk">ใกล้หมด</Tag> : null}
                        {mayEdit && it.needsReview && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void markReviewed([it], it.name);
                            }}
                            className="dkb-btn dkb-btn-ghost dkb-btn-sm !min-h-[44px]"
                            style={{ color: "var(--dk-lilac-ink)" }}
                            title="ยืนยันว่าชื่อ/หน่วย/ตระกูลถูกต้องแล้ว ปลดป้ายรอตรวจ"
                          >
                            ✓ ตรวจแล้ว
                          </button>
                        )}
                        {mayEdit && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCountFor(it);
                            }}
                            className="dkb-btn dkb-btn-ghost dkb-btn-sm !min-h-[44px]"
                          >
                            นับ
                          </button>
                        )}
                        {mayEdit && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteItem(it);
                            }}
                            className="dkb-btn dkb-btn-ghost dkb-btn-sm !min-h-[44px] !px-3"
                            style={{ color: "var(--dk-coral-ink)" }}
                            title="ลบวัสดุนี้ออกจากคลัง"
                            aria-label={`ลบ ${it.name} ออกจากคลัง`}
                          >
                            ลบ
                          </button>
                        )}
                      </span>
                    </div>
                  </li>
                );
              };

              /**
               * ของที่ถูกตัดตามแถวนี้ไปด้วย — เอามาห้อยเยื้องใต้แถว แทนที่จะเขียนเป็นประโยคอ้างชื่อกัน
               * (เจ้าของร้านขอ 21 ก.ย. 69 — อ่านแถวเดียวจบว่า "ขายตัวนี้แล้วตัดอะไรบ้าง" ไม่ต้องไล่หาชื่อที่อ้างถึงข้างล่าง)
               *   1) ของมีเงื่อนไขที่ผูกกับตัวเลือกเดียวกัน  (แผ่นจิ๊กซอว์ A5 → กรอบรูป A5 เมื่อเลือก "กรอบรูป + แผ่นจิ๊กซอว์")
               *   2) วัสดุแฝงของสินค้านี้                     (กริ๊กต๊อก MagSafe ทุกทรง → Griptok ใส)
               * ตัวเดียวห้อยซ้ำได้หลายที่ — ตั้งใจให้ซ้ำ เพราะของจริงมันโดนตัดทุกทางนั้นจริง ๆ
               */
              const kidsOf = (r: Item, bom: Item[], byId: Map<string, Item>, productId: string) => {
                const out: { item: Item; why: string; sub?: string }[] = [];
                const seen = new Set<string>([r.id]);
                const add = (item: Item | undefined, why: string, sub?: string) => {
                  if (!item || seen.has(item.id)) return;
                  seen.add(item.id);
                  out.push({ item, why, sub });
                };
                for (const u of live[r.id] ?? []) {
                  if (u.kind !== "choice" || u.productId !== productId || u.extra) continue;
                  for (const x of recipes.get(productId)?.picks.get(`${u.optionIndex}|${u.choice}`)?.extra ?? [])
                    add(byId.get(x.id), x.cond ? `ตัดเพิ่มถ้า ${x.cond}` : "ตัดเพิ่มเมื่อเลือกตัวเลือกนี้");
                }
                for (const b of bom) {
                  const per = (live[b.id] ?? []).find((u) => u.kind === "product" && u.bom && u.productId === productId)?.per;
                  add(b, `ตัดพร้อมแถวบนเสมอ${per && per !== 1 ? ` ×${per}` : ""}`, "วัสดุแฝง — ไม่มีในตัวเลือก");
                }
                return out;
              };

              /**
               * กลุ่มย่อยตาม "ชนิดของ" — ของในสินค้าเดียวแต่รับเข้า/เบิก/สั่งแยกกัน (กรอบรูปยังมี สั่งแต่แผ่นจิ๊กซอว์)
               * แสดงเมื่อมีตั้งชนิดไว้อย่างน้อย 1 ตัว · ไม่ตั้งเลย = แถวเรียงแบบเดิม
               */
              const renderParts = (list: Item[], groupTitle: string, productId?: string) => {
                // วัสดุแฝงไม่ยืนเป็นแถวของตัวเอง — ไปห้อยใต้ทุกแถวแทน (ตัวเลือกที่มีเงื่อนไขยังยืนแถวของตัวเองด้วย
                // เพราะมันอยู่ในกลุ่มย่อย "ชนิดของ" ที่มีปุ่มรับเข้า/เบิกเป็นชุดของมันเอง)
                const isBom = (r: Item) => {
                  const us = live[r.id] ?? [];
                  return us.length > 0 && us.every((u) => u.kind === "product" && u.bom && u.productId === productId);
                };
                const bom = productId ? list.filter(isBom) : [];
                const byId = new Map(list.map((r) => [r.id, r]));
                const host = bom.length ? list.filter((r) => !bom.includes(r)) : list;
                /** แถวหนึ่งแถว + ลูกที่ห้อยใต้มัน */
                const hang = (l: Item[]) =>
                  l.flatMap((r) => {
                    const kids = productId ? kidsOf(r, bom, byId, productId) : [];
                    return [
                      renderRow(r, productId, undefined, new Set(kids.map((k) => k.item.id))),
                      ...kids.map((k, i) =>
                        renderRow(k.item, productId, { last: i === kids.length - 1, key: `${r.id}/${k.item.id}`, why: k.why, sub: k.sub }),
                      ),
                    ];
                  });
                if (!host.length) return list.map((r) => renderRow(r, productId)); // มีแต่วัสดุแฝง ไม่มีอะไรให้ห้อย
                if (!host.some((r) => r.part)) return hang(host);
                list = host;
                const OTHER = "อื่น ๆ";
                const byPart = new Map<string, Item[]>();
                for (const r of list) {
                  const k = r.part?.trim() || OTHER;
                  (byPart.get(k) ?? byPart.set(k, []).get(k)!).push(r);
                }
                const numeric = (a: Item, b: Item) => a.name.localeCompare(b.name, "th", { numeric: true });
                return [...byPart.entries()]
                  .sort(([a], [b]) => (a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b, "th")))
                  .map(([part, rs]) => {
                    const sorted = [...rs].sort(numeric);
                    const units = [...new Set(sorted.map((r) => r.unit))];
                    const total = sorted.reduce((n, r) => n + r.balance, 0);
                    const nDanger = sorted.filter((r) => stats.get(r.id)?.level === "danger").length;
                    const nWarn = sorted.filter((r) => stats.get(r.id)?.level === "warn").length;
                    const title = `${part} · ${groupTitle}`;
                    const orderText = () =>
                      [
                        `สั่งของ: ${title}`,
                        ...sorted.map((r) => {
                          const st = stats.get(r.id);
                          return `- ${r.name} — เหลือ ${fmtN(r.balance)} ${r.unit}${st?.point != null ? ` (จุดสั่ง ${fmtN(st.point)})` : ""} · สั่ง ____`;
                        }),
                      ].join("\n");
                    return (
                      <Fragment key={`part-${part}`}>
                        <li
                          className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-2.5 pl-5 first:border-t-0"
                          style={{ borderColor: "var(--dk-hair)", background: "var(--dk-sky)" }}
                        >
                          <span className="min-w-0 flex-1 basis-[10rem]">
                            <span className="dkb-h2 block text-[0.95rem]" style={{ color: "var(--dk-navy)" }}>
                              {part}
                            </span>
                            <span className="block text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                              {fmtN(sorted.length)} รายการ · รวม <b className="tabular-nums">{fmtN(total)}</b> {units.length === 1 ? units[0] : "หน่วย"}
                            </span>
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5">
                            {nDanger > 0 && <Tag tone="solid">ต้องสั่ง {nDanger}</Tag>}
                            {nWarn > 0 && <Tag tone="yolk">ใกล้หมด {nWarn}</Tag>}
                          </span>
                          {mayEdit && (
                            <span className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setBulkFor({ items: sorted, title, mode: "in" })}
                                className="dkb-btn dkb-btn-navy dkb-btn-sm"
                              >
                                ＋ รับเข้า{part === OTHER ? "" : part}
                              </button>
                              <button
                                type="button"
                                onClick={() => setBulkFor({ items: sorted, title, mode: "out" })}
                                className="dkb-btn dkb-btn-ghost dkb-btn-sm"
                              >
                                − เบิก
                              </button>
                              <CopyChip label="คัดลอกไปสั่งของ" text={orderText} />
                            </span>
                          )}
                        </li>
                        {hang(sorted)}
                      </Fragment>
                    );
                  });
              };

              if (!grouped)
                return (
                  <section className="dkb-g overflow-hidden">
                    <ul>{rows.map((r) => renderRow(r))}</ul>
                  </section>
                );

              if (!shownGroups.length)
                return doneFilter === "จัดแล้ว" ? (
                  <Empty title="ยังไม่ได้ติ๊กกลุ่มไหนเลย" body="ติ๊กช่องหน้าชื่อกลุ่มเมื่อจัดวัสดุกลุ่มนั้นเสร็จ แล้วกลับมาดูที่นี่ได้ว่าทำอะไรไปแล้วบ้าง" />
                ) : (
                  <Empty title={`จัดครบแล้วทั้ง ${fmtN(groups.length)} กลุ่ม`} body="ไม่มีกลุ่มที่ยังไม่ได้จัด — กดชิป “ยังไม่จัด” อีกครั้งเพื่อกลับไปดูทุกกลุ่ม" />
                );

              return (
                <div className="grid gap-2.5">
                  {shownGroups.map((g) => {
                    const open = forceOpen || openGroups.has(g.key);
                    const done = doneGroups[g.key];
                    const nDanger = g.rows.filter((r) => stats.get(r.id)?.level === "danger").length;
                    const nWarn = g.rows.filter((r) => stats.get(r.id)?.level === "warn").length;
                    const nUnlinked = g.rows.filter((r) => !live[r.id]?.length).length;
                    const nReview = g.rows.filter((r) => r.needsReview).length;
                    // แถบสีซ้าย: งานค้างเด่นกว่ากลุ่มที่เรียบร้อยแล้วเสมอ — ติ๊กว่าจัดแล้วและไม่มีงานค้าง = เงียบที่สุด
                    const tone =
                      nDanger || g.kind === 2
                        ? "var(--dk-coral-deep)"
                        : nWarn || nUnlinked
                          ? "var(--dk-yolk-deep)"
                          : done || g.kind === 3
                            ? "var(--dk-quiet)"
                            : "var(--dk-mint)";
                    const toggle = () =>
                      !forceOpen &&
                      setOpenGroups((prev) => {
                        const next = new Set(prev);
                        if (!next.delete(g.key)) next.add(g.key);
                        return next;
                      });
                    return (
                      <section key={g.key} className="dkb-g relative overflow-hidden" style={{ ["--dk-tone" as string]: tone }}>
                        <span className="absolute inset-y-0 left-0 w-[6px]" style={{ background: "var(--dk-tone)" }} />
                        <header
                          role="button"
                          tabIndex={0}
                          aria-expanded={open}
                          onClick={toggle}
                          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}
                          className={`flex min-h-[60px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 pl-5 ${forceOpen ? "" : "cursor-pointer"}`}
                        >
                          <span className={`w-3 text-[10px] transition ${open ? "rotate-90" : ""}`} style={{ color: "var(--dk-faint)" }} aria-hidden>
                            ▶
                          </span>
                          {/* ✅ ช่องติ๊ก "จัดแล้ว" — สิทธิ์ดูอย่างเดียวเห็นสถานะแต่ไม่มีปุ่มให้กด (กดแล้วเงียบเพราะ 403 คือกับดักเดิม) */}
                          <DoneBox done={done} onToggle={mayEdit ? () => void toggleGroupDone(g.key, g.title) : undefined} />
                          {g.kind === 0 && <Thumb src={g.img} name={g.title} size={44} />}
                          <span className="min-w-0 flex-1 basis-[11rem]">
                            <span className="dkb-display block truncate text-[1rem]" style={{ color: done ? "var(--dk-faint)" : "var(--dk-navy)" }}>
                              {g.title}
                            </span>
                            <span className="block text-[12px]" style={{ color: "var(--dk-faint)" }}>
                              {g.sub ? `${g.sub} · ` : ""}
                              {fmtN(g.rows.length)} รายการ
                              {done ? ` · จัดแล้ว ${done.by === "กำลังบันทึก…" ? done.by : `${done.by} ${fmtAt(done.at)}`}` : ""}
                            </span>
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5">
                            {nDanger > 0 && <Tag tone="solid">ต้องสั่ง {nDanger}</Tag>}
                            {nWarn > 0 && <Tag tone="yolk">ใกล้หมด {nWarn}</Tag>}
                            {nUnlinked > 0 && g.kind < 2 && <Tag tone="coral">ยังไม่ผูก {nUnlinked}</Tag>}
                            {nReview > 0 && <Tag tone="lilac">รอตรวจ {nReview}</Tag>}
                          </span>
                          {/* มือถือ: ปุ่มเครื่องมือโผล่เฉพาะกลุ่มที่กางอยู่ — 141 กลุ่ม × ปุ่ม 3 ปุ่ม ทำให้ต้องเลื่อนยาวเกินเหตุ */}
                          <span className={`${open ? "flex" : "hidden sm:flex"} shrink-0 flex-wrap items-center gap-2`}>
                            {mayEdit && nReview > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void markReviewed(g.rows, g.title);
                                }}
                                className="dkb-btn dkb-btn-ghost dkb-btn-sm"
                                style={{ color: "var(--dk-lilac-ink)" }}
                                title="ปลดป้ายรอตรวจทุกรายการในกลุ่มนี้"
                              >
                                ✓ ตรวจแล้วทั้งกลุ่ม ({nReview})
                              </button>
                            )}
                            {g.productId && mayEdit && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setBomFor({ id: g.productId!, name: g.title });
                                }}
                                className="dkb-btn dkb-btn-ghost dkb-btn-sm"
                                title="ของที่ทุกชิ้นใช้แต่ไม่มีในตัวเลือก เช่น ขาตั้ง หมุด ถุง"
                              >
                                ＋ วัสดุแฝง
                              </button>
                            )}
                            {g.productId && mayEdit && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSplitFor({ id: g.productId!, name: g.title });
                                }}
                                className="dkb-btn dkb-btn-ghost dkb-btn-sm"
                                title="สินค้าที่ลูกค้าเลือกแบบ/ขนาดแล้วได้ของคนละชิ้น — สร้าง SKU แยกให้ทีละตัวเลือก"
                              >
                                แยกตามตัวเลือก
                              </button>
                            )}
                            {g.productId && (
                              <a
                                href={`/admin/products/${encodeURIComponent(g.productId)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="dkb-btn dkb-btn-ghost dkb-btn-sm"
                              >
                                เปิดสินค้า
                              </a>
                            )}
                            {mayEdit && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void markNoStock(g.rows, filter !== "ไม่ต้องมีสต๊อก", g.title);
                                }}
                                className="dkb-btn dkb-btn-ghost dkb-btn-sm"
                              >
                                {filter === "ไม่ต้องมีสต๊อก" ? "กลับมานับสต๊อก" : "ไม่ต้องมี stock"}
                              </button>
                            )}
                          </span>
                        </header>
                        {open && (
                          <ul className="border-t" style={{ borderColor: "var(--dk-hair)" }}>
                            {renderParts(g.rows, g.title, g.productId)}
                          </ul>
                        )}
                      </section>
                    );
                  })}
                </div>
              );
            })()
          )}
          {!loading && rows.length > 0 && (
            <p className="px-2 pt-3 text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
              * จุดสั่งที่ระบบแนะนำจากสถิติการใช้ 30 วัน ยังไม่ได้ตั้งเอง · ยอดรีเฟรชเองทุก 20 วินาที
            </p>
          )}
        </>
      )}

      {/* ── รับเข้า / เบิกของ ── */}
      {(tab === "รับเข้า" || tab === "เบิกของ") && (
        <MovePanel
          key={tab}
          mode={tab === "รับเข้า" ? "in" : "out"}
          items={items}
          moves={moves}
          mayEdit={mayEdit}
          onSubmit={async (itemId, qty, reason, note, refId) => {
            const done = await doMove(itemId, qty, reason, note, refId);
            if (done) {
              const it = items.find((i) => i.id === itemId);
              setOk(`บันทึกแล้ว — ${it?.name ?? ""} ${qty > 0 ? "+" : ""}${fmtN(qty)} ${it?.unit ?? ""}`);
            }
            return done;
          }}
        />
      )}

      {/* ── ประวัติ ── */}
      {tab === "ประวัติ" && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={logQ}
              onChange={(e) => setLogQ(e.target.value)}
              placeholder="ค้นชื่อวัสดุ หมายเหตุ ผู้ทำ หรือเลขออเดอร์…"
              className={`${inputCls} w-full sm:w-72`}
            />
            <div className="flex flex-wrap gap-1.5">
              {MOVE_FILTERS.map((f) => (
                <Chip
                  key={f}
                  active={moveFilter === f}
                  onClick={() => setMoveFilter(f)}
                  count={f === "ทั้งหมด" ? moves.length : moves.filter((m) => m.reason === f).length}
                  tone={f === "ทั้งหมด" ? undefined : REASON_TONE[f]}
                >
                  {f}
                </Chip>
              ))}
            </div>
          </div>
          <MoveTable rows={logRows} showItem />
        </>
      )}

      {openItem && (
        <ItemDrawer
          item={openItem}
          image={images[openItem.id]}
          usage={usage[openItem.id] ?? []}
          suggest={suggest[openItem.id] ?? []}
          linksReady={linksReady}
          products={products}
          skus={items.map((i) => ({ id: i.id, name: i.name, code: i.code, img: images[i.id] }))}
          hangs={linksReady ? hangsOf(openItem.id) : []}
          onLink={(t) => linkChoice(openItem.id, t, true)}
          onUnlink={(t) => linkChoice(openItem.id, t, false)}
          onLinkExtra={linkExtra}
          onUnlinkHang={unlinkHang}
          stat={stats.get(openItem.id)}
          moves={moves.filter((m) => m.itemId === openItem.id)}
          mayEdit={mayEdit}
          onClose={() => setOpenId(null)}
          onEdit={() => setEditFor(openItem)}
          onCount={() => setCountFor(openItem)}
          onDelete={() => deleteItem(openItem)}
          onNoStock={(on) => markNoStock([openItem], on, openItem.name)}
          onReviewed={() => markReviewed([openItem], openItem.name)}
          onRename={(name) => saveItem({ id: openItem.id, name, unit: openItem.unit })}
          onImage={async (url) => {
            const ok = await saveItem({ id: openItem.id, name: openItem.name, unit: openItem.unit, imageUrl: url });
            if (ok) setImages((m) => ({ ...m, [openItem.id]: url }));
            return ok;
          }}
        />
      )}

      {(addOpen || editFor) && (
        <ItemModal
          item={editFor}
          products={products}
          allCats={cats}
          allFams={allFams}
          allParts={allParts}
          onClose={() => {
            setAddOpen(false);
            setEditFor(null);
          }}
          onSave={async (b) => {
            if (await saveItem(b)) {
              setAddOpen(false);
              setEditFor(null);
            }
          }}
        />
      )}

      {bomPick && (
        <Modal title="วัสดุแฝงของสินค้าไหน" subtitle="เลือกสินค้าที่ต้องใช้ขาตั้ง หมุด ถุง ฯลฯ ทุกชิ้น" onClose={() => setBomPick(false)}>
          <ProductPicker
            products={products}
            value={[]}
            onChange={(ids) => {
              const p = products.find((x) => x.id === ids[0]);
              if (!p) return;
              setBomPick(false);
              setBomFor({ id: p.id, name: p.name });
            }}
          />
          {!linksReady && <p className="mt-2 text-[11px] text-slate-400">กำลังโหลดรายชื่อสินค้า…</p>}
        </Modal>
      )}

      {bomFor && (
        <BomModal
          product={bomFor}
          items={items}
          images={images}
          allParts={allParts}
          onClose={() => setBomFor(null)}
          onChanged={(it) => {
            setItems((prev) => (prev.some((i) => i.id === it.id) ? prev.map((i) => (i.id === it.id ? it : i)) : [...prev, it]));
          }}
          onDone={async () => {
            setBomFor(null);
            setOpenGroups((prev) => new Set(prev).add(`p:${bomFor.id}`));
            await Promise.all([load(), loadImages(true)]);
          }}
        />
      )}

      {bulkFor && (
        <BulkMoveModal
          items={bulkFor.items}
          images={images}
          title={bulkFor.title}
          mode={bulkFor.mode}
          onClose={() => setBulkFor(null)}
          onDone={async (msg) => {
            setBulkFor(null);
            setOk(msg);
            await load();
          }}
        />
      )}

      {splitFor && (
        <SplitModal
          product={splitFor}
          onClose={() => setSplitFor(null)}
          onDone={async (msg) => {
            setSplitFor(null);
            setOk(msg);
            setOpenGroups((prev) => new Set(prev).add(`p:${splitFor.id}`));
            await Promise.all([load(), loadImages(true)]);
          }}
        />
      )}

      {countFor && (
        <CountModal
          item={countFor}
          onClose={() => setCountFor(null)}
          onSave={async (diff, note) => {
            if (await doMove(countFor.id, diff, "ปรับยอดนับจริง", note)) {
              setOk(`ปรับยอด ${countFor.name} แล้ว (${diff > 0 ? "+" : ""}${fmtN(diff)})`);
              setCountFor(null);
            }
          }}
        />
      )}
      {dialog}
      {/* z สูงกว่าลิ้นชัก (121) และโมดัล — กดรูปในลิ้นชักแล้วต้องลอยขึ้นมาบนสุด */}
      {zoom && <ImageLightbox src={zoom.src} alt={zoom.alt} caption={zoom.alt} z={200} onClose={() => setZoom(null)} />}
    </PageShell>
    </ZoomCtx.Provider>
  );
}

/**
 * ✅ ช่องติ๊ก "จัดแล้ว" ที่หัวกลุ่มสินค้า — ไล่จัดวัสดุทีละกลุ่มแล้วติ๊กไว้ว่าทำถึงไหน
 * ยังไม่ติ๊ก = กรอบว่างเห็นชัดว่ายังต้องทำ · ติ๊กแล้ว = กล่องทึบมีเครื่องหมายถูก (แยกออกจากกันได้แม้จอสีเพี้ยน)
 * พื้นที่กด 44×44 ตามนิ้วโป้ง · onToggle ว่าง = สิทธิ์ดูอย่างเดียว แสดงสถานะแต่กดไม่ได้
 */
function DoneBox({ done, onToggle }: { done?: GroupDone; onToggle?: () => void }) {
  const box = (
    <span
      className="flex h-[26px] w-[26px] items-center justify-center rounded-[9px] text-[15px] font-bold leading-none"
      style={
        done
          ? { background: "var(--dk-mint-ink)", color: "#fff", boxShadow: "inset 0 0 0 2px var(--dk-mint-ink)" }
          : { background: "#fff", color: "transparent", boxShadow: "inset 0 0 0 2px var(--dk-hair)" }
      }
      aria-hidden
    >
      ✓
    </span>
  );
  const label = done
    ? `จัดแล้ว${done.by === "กำลังบันทึก…" ? "" : ` โดย ${done.by} ${fmtAt(done.at)}`} — กดเพื่อเอาติ๊กออก`
    : "ติ๊กเมื่อจัดวัสดุกลุ่มนี้เสร็จแล้ว";
  if (!onToggle)
    return (
      <span className="flex h-11 w-9 shrink-0 items-center justify-center" title={done ? label.split(" — ")[0] : "ยังไม่ได้จัด"}>
        {box}
      </span>
    );
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!done}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation(); // กดติ๊กต้องไม่กางกลุ่มไปด้วย
        onToggle();
      }}
      className="-my-1 flex h-11 w-9 shrink-0 items-center justify-center"
    >
      {box}
    </button>
  );
}

/** รูปย่อ SKU ในตาราง — ไม่มีรูป = กรอบว่างสีอ่อน (ไม่ใส่อีโมจิ กันตารางลายตา) */
function Thumb({ src, name, size = 40 }: { src?: string; name: string; size?: number }) {
  const zoom = useContext(ZoomCtx);
  const style = { width: size, height: size, background: "var(--dk-sky)", boxShadow: "inset 0 0 0 1px var(--dk-hair)" };
  if (!src || !zoom)
    return <span className="block shrink-0 overflow-hidden rounded-xl" style={style} aria-hidden={!src}>
      {src && <img src={src} alt={name} loading="lazy" className="h-full w-full object-cover" />}
    </span>;
  // กดรูป = ขยายดู ไม่ใช่เปิดแถว/กางกลุ่ม — ต้องหยุดทั้ง click และ keydown ไม่ให้ไหลไปถึง role=button ที่ครอบอยู่
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        zoom(src, name);
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className="block shrink-0 cursor-zoom-in overflow-hidden rounded-xl transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--dk-blue)]"
      style={style}
      title="กดเพื่อขยายรูป"
      aria-label={`ขยายรูป ${name}`}
    >
      <img src={src} alt={name} loading="lazy" className="h-full w-full object-cover" />
    </button>
  );
}

// ─────────────────────────── ค้นหา ───────────────────────────

/** ค้นด้วยชื่อ/รหัส/ตระกูล/หมวด และ alias — คนเรียกของคนละชื่อกัน alias คือตัวที่ทำให้เจอ */
function matchItem(i: Item, needle: string) {
  return [i.name, i.code, i.family, i.category, ...(i.aliases ?? [])]
    .filter(Boolean)
    .some((s) => String(s).toLowerCase().includes(needle));
}

// ─────────────────────────── ชิ้นส่วนร่วม ───────────────────────────

function Banner({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <p className={`mb-4 rounded-xl px-4 py-2.5 text-sm font-medium ring-1 ${TONE[tone].bg} ${TONE[tone].text} ${TONE[tone].ring}`}>
      {children}
    </p>
  );
}


function Chip({
  children,
  active,
  count,
  tone,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  count: number;
  tone?: Tone;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
        active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span className={!active && tone && count > 0 ? TONE[tone].text : undefined}>{children}</span>
      <span className={`ml-1.5 tabular-nums ${active ? "text-white/60" : "text-slate-400"}`}>{count}</span>
    </button>
  );
}

function Th({
  children,
  className = "",
  sortKey,
  sort,
  onSort,
}: {
  children?: React.ReactNode;
  className?: string;
  sortKey?: SortKey;
  sort?: SortKey;
  onSort?: (k: SortKey) => void;
}) {
  const active = sortKey && sort === sortKey;
  return (
    <th className={`px-3 py-2.5 text-left ${labelCls} ${className}`}>
      {sortKey && onSort ? (
        <button type="button" onClick={() => onSort(sortKey)} className={`transition hover:text-slate-600 ${active ? "text-slate-700" : ""}`}>
          {children}
          <span className="ml-1">{active ? "↓" : ""}</span>
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-top ${className}`}>{children}</td>;
}

function MoveTable({ rows, showItem }: { rows: Move[]; showItem?: boolean }) {
  if (rows.length === 0) {
    return <div className={`${card} py-12 text-center text-sm text-slate-400`}>ไม่มีการเคลื่อนไหว</div>;
  }
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70">
              <Th className="w-32">เวลา</Th>
              <Th className="w-32">ประเภท</Th>
              {showItem && <Th className="w-56">วัสดุ</Th>}
              <Th className="w-24 text-right">จำนวน</Th>
              <Th className="w-24 text-right">คงเหลือ</Th>
              <Th>หมายเหตุ</Th>
              <Th className="w-40">โดย</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const tone = REASON_TONE[m.reason] ?? "neutral";
              return (
                <tr key={m.id} className="border-b border-slate-100 last:border-0">
                  <Td className="whitespace-nowrap text-slate-500">{fmtAt(m.at)}</Td>
                  <Td>
                    <span className={`${badge} ${TONE[tone].bg} ${TONE[tone].text}`}>{m.reason}</span>
                  </Td>
                  {showItem && <Td className="font-medium text-slate-800">{m.itemName}</Td>}
                  <Td className={`text-right font-semibold tabular-nums ${m.qty > 0 ? TONE.ok.text : TONE.danger.text}`}>
                    {m.qty > 0 ? `+${fmtN(m.qty)}` : fmtN(m.qty)}
                  </Td>
                  <Td className="text-right tabular-nums text-slate-500">{fmtN(m.balanceAfter)}</Td>
                  <Td className="text-slate-600">
                    {m.note}
                    {m.refOrderId ? <span className={`ml-1 ${codeCls}`}>{m.refOrderId}</span> : null}
                  </Td>
                  <Td className="text-slate-400">{m.by}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────── แท็บ รับเข้า / เบิกของ ───────────────────────────

function MovePanel({
  mode,
  items,
  moves,
  mayEdit,
  onSubmit,
}: {
  mode: "in" | "out";
  items: Item[];
  moves: Move[];
  mayEdit: boolean;
  onSubmit: (itemId: string, qty: number, reason: string, note?: string, refId?: string) => Promise<boolean>;
}) {
  const [sel, setSel] = useState<Item | null>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState(mode === "in" ? "นำเข้า" : "เบิกผลิต");
  const [note, setNote] = useState("");
  const [refId, setRefId] = useState("");
  const [busy, setBusy] = useState(false);

  const n = Number(qty);
  const needNote = mode === "out" && reason === "อื่นๆ";
  const after = sel ? sel.balance + (mode === "in" ? n : -n) : 0;
  const willNegative = mode === "out" && sel != null && qty !== "" && after < 0;
  const invalid = !sel || qty === "" || n <= 0 || (needNote && !note.trim());

  // รายการล่าสุดของฝั่งนี้ ให้เห็นว่าที่เพิ่งกดไปเข้าจริง
  const recent = useMemo(
    () => moves.filter((m) => (mode === "in" ? m.qty > 0 : m.qty < 0)).slice(0, 25),
    [moves, mode]
  );

  async function submit() {
    if (invalid || !sel) return;
    setBusy(true);
    const done = await onSubmit(sel.id, mode === "in" ? n : -n, reason, note || undefined, refId || undefined);
    setBusy(false);
    if (done) {
      setSel(null);
      setQty("");
      setNote("");
      setRefId("");
    }
  }

  if (!mayEdit) {
    return <div className={`${card} py-12 text-center text-sm text-slate-400`}>บัญชีนี้ไม่มีสิทธิ์เดินสต๊อก</div>;
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-5`}>
        <p className="text-sm font-semibold text-slate-800">{mode === "in" ? "รับของเข้าคลัง" : "เบิกของออกจากคลัง"}</p>
        <p className={`mt-0.5 ${subtle}`}>
          {mode === "in"
            ? "ของที่สั่งมาถึงแล้ว บันทึกเข้าคลังที่นี่ · ใบรับของฝั่ง TP ที่ผูก SKU ไว้จะบวกยอดให้เองตอนหัวหน้าอนุมัติ"
            : "เบิกไปใช้ผลิตหรือตัดของเสีย · ตัดยอดทันทีที่กดบันทึก"}
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_9rem_11rem]">
          <div>
            <span className={fieldLabel}>วัสดุ *</span>
            <SkuPicker items={items} value={sel} onChange={setSel} />
          </div>
          <label className="block">
            <span className={fieldLabel}>จำนวน *</span>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="0"
              className={`${inputCls} text-right tabular-nums`}
            />
          </label>
          {mode === "out" ? (
            <label className="block">
              <span className={fieldLabel}>เหตุผล</span>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>
                <option value="เบิกผลิต">เบิกผลิตงาน</option>
                <option value="เบิกทำเสีย">เบิกทำเสีย (ของเสีย/พิมพ์พลาด)</option>
                <option value="อื่นๆ">อื่นๆ (ระบุหมายเหตุ)</option>
              </select>
            </label>
          ) : (
            <div className="flex items-end">
              <p className="w-full rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
                {sel ? (
                  <>
                    คงเหลือหลังรับ <span className="font-semibold tabular-nums text-slate-800">{fmtN(after)}</span> {sel.unit}
                  </>
                ) : (
                  "เลือกวัสดุก่อน"
                )}
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={fieldLabel}>
              {mode === "in" ? "หมายเหตุ (ล็อต / ร้านที่สั่ง)" : `หมายเหตุ${needNote ? " * (บังคับ)" : ""}`}
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={mode === "in" ? "เช่น ล็อต ก.ค. จากร้าน A" : "รายละเอียดเพิ่มเติม"}
              className={inputCls}
            />
          </label>
          {mode === "out" && reason === "เบิกผลิต" && (
            <label className="block">
              <span className={fieldLabel}>เลขออเดอร์ (ถ้ามี)</span>
              <input value={refId} onChange={(e) => setRefId(e.target.value)} placeholder="OD-…" className={inputCls} />
            </label>
          )}
        </div>

        {sel && qty !== "" && mode === "out" && (
          <p className={`mt-3 rounded-xl px-3 py-2 text-xs ${willNegative ? `${TONE.danger.bg} ${TONE.danger.text}` : "bg-slate-50 text-slate-600"}`}>
            {willNegative
              ? `เบิกเกินยอดในระบบ — คงเหลือจะติดลบเป็น ${fmtN(after)} ${sel.unit} (ยังบันทึกได้ แต่ควรนับจริงก่อน)`
              : `คงเหลือหลังเบิก ${fmtN(after)} ${sel.unit}`}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" disabled={invalid || busy} onClick={submit} className={btnPrimary}>
            {busy ? "กำลังบันทึก…" : mode === "in" ? "บันทึกรับเข้า" : "บันทึกเบิกออก"}
          </button>
        </div>
      </div>

      <div>
        <p className={`mb-2 ${labelCls}`}>{mode === "in" ? "รับเข้าล่าสุด" : "เบิกออกล่าสุด"}</p>
        <MoveTable rows={recent} showItem />
      </div>
    </div>
  );
}

/** เลือก SKU ด้วยการค้นหา — 300 SKU ใช้ <select> ไม่ไหว และต้องค้น alias ได้ด้วย */
function SkuPicker({ items, value, onChange }: { items: Item[]; value: Item | null; onChange: (i: Item | null) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.slice(0, 30);
    return items.filter((i) => matchItem(i, needle)).slice(0, 30);
  }, [items, q]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">{value.name}</span>
          <span className="mt-0.5 flex items-center gap-2">
            {value.code && <span className={codeCls}>{value.code}</span>}
            <span className="text-[11px] text-slate-400">
              คงเหลือ {fmtN(value.balance)} {value.unit}
            </span>
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQ("");
          }}
          className={btnSmGhost}
        >
          เปลี่ยน
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="พิมพ์ชื่อ รหัส หรือชื่อที่เคยเรียก…"
        className={inputCls}
      />
      {open && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {hits.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(i);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-900">{i.name}</span>
                  {i.code && <span className={codeCls}>{i.code}</span>}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                  {fmtN(i.balance)} {i.unit}
                </span>
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="px-3 py-3 text-center text-xs text-slate-400">ไม่พบวัสดุที่ค้น</li>}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────── ลิ้นชัก ───────────────────────────

function ItemDrawer({
  item,
  image,
  usage,
  suggest,
  linksReady,
  products,
  skus,
  hangs,
  onLink,
  onUnlink,
  onLinkExtra,
  onUnlinkHang,
  stat,
  moves,
  mayEdit,
  onClose,
  onEdit,
  onCount,
  onDelete,
  onNoStock,
  onReviewed,
  onRename,
  onImage,
}: {
  item: Item;
  image?: string;
  usage: StockUsage[];
  suggest: StockSuggest[];
  linksReady: boolean;
  products: ProductLite[];
  skus: { id: string; name: string; code?: string; img?: string }[];
  hangs: HangRow[];
  onLink: (t: StockSuggest) => Promise<boolean>;
  onUnlink: (t: StockUsage) => Promise<boolean>;
  onLinkExtra: (p: ExtraLinkPayload) => Promise<string | null>;
  onUnlinkHang: (h: HangRow) => Promise<boolean>;
  stat?: Stat;
  moves: Move[];
  mayEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCount: () => void;
  onDelete: () => void;
  onNoStock: (on: boolean) => void;
  onReviewed: () => void;
  onRename: (name: string) => Promise<boolean>;
  onImage: (url: string) => Promise<boolean>;
}) {
  const [editName, setEditName] = useState<string | null>(null);
  const [imgOpen, setImgOpen] = useState(false);
  // ปิดด้วย Esc + ล็อกสกรอลล์พื้นหลัง ไม่งั้นเลื่อนลิ้นชักแล้วหน้าหลังเลื่อนตาม
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const level = stat?.level ?? "neutral";
  return (
    <>
      <div className={drawerScrim} onClick={onClose} />
      <aside className={drawerPanel} role="dialog" aria-label={`รายละเอียด ${item.name}`}>
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <span className="flex shrink-0 flex-col items-center gap-1">
            <Thumb src={image} name={item.name} size={56} />
            {mayEdit && (
              <button type="button" onClick={() => setImgOpen((v) => !v)} className="text-[11px] text-slate-500 underline underline-offset-2 hover:text-slate-800">
                เปลี่ยนรูป
              </button>
            )}
          </span>
          <div className="min-w-0 flex-1">
            {editName !== null ? (
              <form
                className="flex items-center gap-1.5"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const n = editName.trim();
                  if (!n || n === item.name) return setEditName(null);
                  if (await onRename(n)) setEditName(null);
                }}
              >
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setEditName(null))}
                  aria-label="ชื่อวัสดุ"
                  className={`${inputCls} !h-10 text-base font-semibold`}
                />
                <button type="submit" className={btnSmNeutral}>
                  บันทึก
                </button>
              </form>
            ) : (
              <p className="flex items-start gap-1.5 text-base font-semibold text-slate-900">
                <span className="min-w-0 break-words">{item.name}</span>
                {mayEdit && (
                  <button
                    type="button"
                    onClick={() => setEditName(item.name)}
                    className="-mt-0.5 shrink-0 rounded-lg px-1.5 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="แก้ชื่อ — ชื่อเดิมถูกเก็บเป็นชื่อที่เคยเรียก ค้นหาเจอเหมือนเดิม"
                    aria-label="แก้ชื่อ"
                  >
                    ✎
                  </button>
                )}
              </p>
            )}
            <p className="mt-1 flex flex-wrap items-center gap-2">
              {item.code && <span className={codeCls}>{item.code}</span>}
              {item.family && <span className="text-[11px] text-slate-400">{item.family}</span>}
              {item.needsReview && <span className={`${badge} ${TONE.review.bg} ${TONE.review.text}`}>รอตรวจ</span>}
            </p>
          </div>
          <button type="button" onClick={onClose} className={btnSmGhost} aria-label="ปิด">
            ✕
          </button>
        </header>
        {imgOpen && <ImagePanel onSave={async (url) => (await onImage(url)) && setImgOpen(false)} onClose={() => setImgOpen(false)} />}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-end justify-between">
            <p className={`${metric} ${item.balance < 0 ? TONE.danger.text : ""}`}>
              {fmtN(item.balance)} <span className="text-sm font-medium text-slate-400">{item.unit}</span>
            </p>
            {stat?.point != null && (
              <span className={`${badge} ${TONE[level].bg} ${TONE[level].text}`}>
                จุดสั่ง ≤ {fmtN(stat.point)}
                {item.reorderPoint == null ? " (แนะนำ)" : ""}
              </span>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2">
            <Fact k="ใช้เฉลี่ย/วัน" v={stat && stat.perDay > 0 ? stat.perDay.toFixed(1) : "—"} />
            <Fact k="จะหมดใน" v={stat?.daysLeft != null ? `~${fmtN(stat.daysLeft)} วัน` : "—"} />
            <Fact k="รอของ" v={item.leadTimeDays ? `${item.leadTimeDays} วัน` : "—"} />
            <Fact k="ผูกสินค้า" v={`${item.productIds?.length ?? 0} ตัว`} />
            <Fact k="ทุน/หน่วย" v={item.unitCost ? `฿${fmtN(item.unitCost)}` : "—"} />
            <Fact
              k="มูลค่าคงเหลือ"
              v={item.unitCost ? `฿${fmtN(Math.round(Math.max(0, item.balance) * item.unitCost))}` : "—"}
            />
          </dl>

          {item.needsReview && (
            <div className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${TONE.review.bg} ${TONE.review.text}`}>
              <span className="min-w-0 flex-1">
                รอตรวจ — มาจากการนำเข้า ยังไม่มีคนยืนยันชื่อ/หน่วย/ตระกูล
                {item.maybeDuplicateOf && (
                  <>
                    {" "}
                    · อาจซ้ำกับ <span className="font-mono">{item.maybeDuplicateOf}</span>
                  </>
                )}
              </span>
              {mayEdit && (
                <button type="button" onClick={onReviewed} className={btnSmNeutral}>
                  ✓ ตรวจแล้ว
                </button>
              )}
            </div>
          )}

          {item.noStock && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
              <span className="min-w-0 flex-1">🚫 ตั้งเป็น “ไม่ต้องมี stock” — ไม่เตือนสั่ง ไม่นับมูลค่า ขายแล้วไม่ตัดยอด</span>
              {mayEdit && (
                <button type="button" onClick={() => onNoStock(false)} className={btnSmNeutral}>
                  กลับมานับสต๊อก
                </button>
              )}
            </div>
          )}

          <UsagePanel
            item={item}
            usage={usage}
            suggest={suggest}
            ready={linksReady}
            mayEdit={mayEdit}
            products={products}
            skus={skus}
            hangs={hangs}
            onLink={onLink}
            onUnlink={onUnlink}
            onLinkExtra={onLinkExtra}
            onUnlinkHang={onUnlinkHang}
            onEdit={onEdit}
          />

          {(item.aliases?.length ?? 0) > 0 && (
            <div className="mt-4">
              <p className={labelCls}>ชื่อที่เคยเรียก</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {item.aliases!.map((a) => (
                  <span key={a} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5">
            <p className={labelCls}>ประวัติ</p>
            <div className="mt-1.5">
              {moves.slice(0, 40).map((m) => {
                const tone = REASON_TONE[m.reason] ?? "neutral";
                return (
                  <div key={m.id} className="flex items-center gap-2 border-b border-slate-100 py-2 text-xs last:border-0">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[tone].bg} ${TONE[tone].text}`}>
                      {m.reason}
                    </span>
                    <span className={`w-14 shrink-0 text-right font-semibold tabular-nums ${m.qty > 0 ? TONE.ok.text : TONE.danger.text}`}>
                      {m.qty > 0 ? `+${fmtN(m.qty)}` : fmtN(m.qty)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-500">{m.note}</span>
                    <span className="shrink-0 text-slate-400">{fmtAt(m.at)}</span>
                  </div>
                );
              })}
              {moves.length === 0 && <p className="py-4 text-center text-xs text-slate-400">ยังไม่มีการเคลื่อนไหว</p>}
            </div>
          </div>
        </div>

        {mayEdit && (
          <footer className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
            <button type="button" onClick={onCount} className={btnSmNeutral}>
              นับจริง
            </button>
            <button type="button" onClick={onEdit} className={btnSmNeutral}>
              แก้ไข
            </button>
            {!item.noStock && (
              <button type="button" onClick={() => onNoStock(true)} className={btnSmGhost} title="ของสั่งผลิตตามออเดอร์ / ไม่เก็บของไว้ที่ร้าน">
                🚫 ไม่ต้องมี stock
              </button>
            )}
            {/* ลบอยู่ท้ายสุดและเป็นไอคอน — งานนาน ๆ ครั้ง ไม่ให้เผลอกดแทนแก้ไข */}
            <button
              type="button"
              onClick={onDelete}
              className={`${btnSmGhost} ${TONE.danger.text}`}
              title="ลบวัสดุนี้ออกจากคลัง"
              aria-label="ลบวัสดุนี้ออกจากคลัง"
            >
              🗑 ลบ
            </button>
          </footer>
        )}
      </aside>
    </>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{k}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-700">{v}</dd>
    </div>
  );
}

// ─────────────────────────── โมดัล ───────────────────────────

function ItemModal({
  item,
  products,
  allCats,
  allFams,
  allParts,
  onClose,
  onSave,
}: {
  item: Item | null;
  products: ProductLite[];
  allCats: string[];
  allFams: string[];
  allParts: string[];
  onClose: () => void;
  onSave: (b: Partial<Item> & { name: string }) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [codeVal, setCodeVal] = useState(item?.code ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "ชิ้น");
  const [family, setFamily] = useState(item?.family ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [reorderPoint, setReorderPoint] = useState(item?.reorderPoint != null ? String(item.reorderPoint) : "");
  const [leadTimeDays, setLeadTimeDays] = useState(item?.leadTimeDays != null ? String(item.leadTimeDays) : "");
  const [unitCost, setUnitCost] = useState(item?.unitCost ? String(item.unitCost) : "");
  const [aliases, setAliases] = useState((item?.aliases ?? []).join(", "));
  const [productIds, setProductIds] = useState<string[]>(item?.productIds ?? []);
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? "");
  const [part, setPart] = useState(item?.part ?? "");

  return (
    <Modal title={item ? "แก้ไขวัสดุ" : "เพิ่มวัสดุใหม่"} onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className={fieldLabel}>ชื่อวัสดุ *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ไหมเย็บ ขาว (1803)" className={inputCls} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={fieldLabel}>รหัส (ติดป้ายชั้นวาง)</span>
            <input value={codeVal} onChange={(e) => setCodeVal(e.target.value.toUpperCase())} placeholder="เว้นว่าง = ออกรหัสให้เอง" className={inputCls} />
          </label>
          <label className="block">
            <span className={fieldLabel}>หน่วยนับ</span>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="ชิ้น" className={inputCls} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {/* เลือกจากที่มีอยู่ได้ แต่พิมพ์ใหม่ก็ยังได้ — กันหมวดแตกเพราะสะกดต่างกันนิดเดียว */}
          <label className="block">
            <span className={fieldLabel}>ตระกูล</span>
            <input value={family} onChange={(e) => setFamily(e.target.value)} list="stock-families" placeholder="สีไหมเย็บ" className={inputCls} />
            <datalist id="stock-families">
              {allFams.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className={fieldLabel}>หมวด</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} list="stock-categories" placeholder="ด้าย/ไหม" className={inputCls} />
            <datalist id="stock-categories">
              {allCats.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={fieldLabel}>จุดสั่งซื้อ (เหลือ ≤ นี้ = แจ้ง)</span>
            <input value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="20" className={inputCls} />
          </label>
          <label className="block">
            <span className={fieldLabel}>รอของกี่วัน</span>
            <input value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="7" className={inputCls} />
          </label>
        </div>
        <label className="block">
          <span className={fieldLabel}>ทุน/หน่วย (บาท)</span>
          <input
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            placeholder="12.50"
            className={inputCls}
          />
          <span className="mt-1 block text-[11px] text-slate-400">
            ราคาที่ร้านซื้อเข้ามาต่อ 1 {unit || "ชิ้น"} — ใส่ไว้แล้วหน้ารายงานคิดต้นทุน/กำไรของออเดอร์ให้เอง ·
            แก้ทีหลังไม่กระทบของที่ขายไปแล้ว
          </span>
        </label>
        <label className="block">
          <span className={fieldLabel}>ชื่อที่เคยเรียก (คั่นด้วย , ) — ใช้ค้นหาให้เจอ</span>
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Gtดำ, GT ดำ" className={inputCls} />
        </label>
        <div>
          <span className={fieldLabel}>ขายสินค้าตัวไหนแล้วตัดวัสดุนี้ (1 ชิ้น ต่อ 1 ชิ้น)</span>
          <ProductPicker products={products} value={productIds} onChange={setProductIds} />
          <span className="mt-1 block text-[11px] text-slate-400">
            ใช้กับของที่ขาย 1 ชิ้น = ใช้วัสดุนี้ 1 ชิ้นเสมอ · วัสดุที่เปลี่ยนตามตัวเลือกของลูกค้า (สี/ขนาด/ตะขอ) ให้ผูกที่ตัวเลือกแทน
          </span>
        </div>
        <label className="block">
          <span className={fieldLabel}>ชนิดของ (ไม่บังคับ)</span>
          <input value={part} onChange={(e) => setPart(e.target.value)} list="stock-parts" placeholder="เช่น กรอบรูป / แผ่นจิ๊กซอว์" className={inputCls} />
          <datalist id="stock-parts">
            {allParts.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
          <span className="mt-1 block text-[11px] text-slate-400">ใส่ชื่อเดียวกัน = อยู่ชุดเดียวกันในหน้าคลัง รับเข้า/เบิก/สั่งของทีเดียวทั้งชุด</span>
        </label>
        <label className="block">
          <span className={fieldLabel}>ลิงก์รูปวัสดุ (ไม่บังคับ)</span>
          <span className="flex items-center gap-2">
            <Thumb src={imageUrl.trim() || undefined} name={name} size={44} />
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/thread-1803.jpg" className={inputCls} />
          </span>
          <span className="mt-1 block text-[11px] text-slate-400">
            เว้นว่างได้ — ระบบใช้ภาพตัวเลือกที่ผูก SKU นี้ (สีไหม/เคลือบ) หรือรูปแรกของสินค้าที่ผูกให้เอง
          </span>
        </label>
      </div>
      <ModalFooter
        onClose={onClose}
        disabled={!name.trim()}
        onConfirm={() =>
          onSave({
            id: item?.id,
            name,
            code: codeVal.trim() || undefined,
            unit,
            family: family.trim() || undefined,
            category: category || undefined,
            reorderPoint: reorderPoint ? Number(reorderPoint) : undefined,
            leadTimeDays: leadTimeDays ? Number(leadTimeDays) : undefined,
            // ล้างช่อง = ส่ง 0 ไปลบทุนออก (undefined จะกลายเป็น "ไม่แตะ" แล้วค่าเก่าค้าง)
            unitCost: unitCost.trim() === "" ? 0 : Number(unitCost),
            aliases: aliases.split(",").map((x) => x.trim()).filter(Boolean),
            productIds,
            // ล้างช่อง = ส่ง "" ให้เซิร์ฟเวอร์ลบรูปที่ตั้งเองออก
            imageUrl: imageUrl.trim(),
            part: part.trim(), // ว่าง = ล้างชนิดของ
          })
        }
      />
    </Modal>
  );
}

/** นับจริง — กรอกยอดที่นับได้ ระบบคิดส่วนต่างให้ + บังคับเหตุผลเมื่อของขาด */
function CountModal({ item, onClose, onSave }: { item: Item; onClose: () => void; onSave: (diff: number, note?: string) => void }) {
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const n = Number(qty);
  const diff = qty !== "" ? n - item.balance : null;
  const needNote = (diff ?? 0) < 0;

  return (
    <Modal title="นับสต๊อกจริง" subtitle={`${item.name} · คงเหลือในระบบ ${fmtN(item.balance)} ${item.unit}`} onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className={fieldLabel}>จำนวนที่นับได้จริง *</span>
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            autoFocus
            className={`${inputCls} text-right tabular-nums`}
          />
        </label>
        {diff != null && (
          <p className={`rounded-xl px-3 py-2 text-xs font-medium ${diff === 0 ? `${TONE.ok.bg} ${TONE.ok.text}` : `${TONE.danger.bg} ${TONE.danger.text}`}`}>
            {diff === 0
              ? "ยอดตรงกับระบบ — ไม่ต้องปรับ"
              : diff < 0
                ? `ขาดไป ${fmtN(Math.abs(diff))} ${item.unit} — ต้องระบุเหตุผลว่าหายไปไหน`
                : `พบเกิน ${fmtN(diff)} ${item.unit} — ระบบจะปรับเพิ่มให้`}
          </p>
        )}
        {diff != null && diff !== 0 && (
          <label className="block">
            <span className={fieldLabel}>หมายเหตุ{needNote ? " * (บังคับ)" : ""}</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น เบิกทำเสียไม่ได้ลงระบบ 5 ชิ้น"
              className={inputCls}
            />
          </label>
        )}
      </div>
      <ModalFooter
        onClose={onClose}
        disabled={qty === "" || diff === 0 || (needNote && !note.trim())}
        onConfirm={() => diff != null && diff !== 0 && onSave(diff, note || `นับจริงได้ ${n}`)}
      />
    </Modal>
  );
}

function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-semibold text-slate-900">{title}</p>
        {subtitle && <p className={`mt-0.5 ${subtle}`}>{subtitle}</p>}
        <div className="mt-4 text-sm">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ onClose, onConfirm, disabled }: { onClose: () => void; onConfirm: () => void; disabled?: boolean }) {
  return (
    <div className="mt-5 flex gap-2">
      <button type="button" onClick={onClose} className={`${btnNeutral} flex-1`}>
        ยกเลิก
      </button>
      <button type="button" disabled={disabled} onClick={onConfirm} className={`${btnPrimary} flex-1`}>
        บันทึก
      </button>
    </div>
  );
}

/**
 * "ขายอะไรแล้วตัด" ของแต่ละแถว — บอกให้ครบว่าลูกค้าเลือกอะไรถึงตัดตัวนี้ (ไม่ตัดคำ ขึ้นบรรทัดใหม่ได้)
 * มุมมองตามสินค้า: ไม่พูดชื่อสินค้าซ้ำกับหัวกลุ่ม · มุมมองรายการรวม: มีชื่อสินค้านำ
 */
/**
 * "ขายอะไรแล้วตัดตัวนี้" ของหนึ่งแถว
 * inProductId = แถวนี้อยู่ใต้หัวกลุ่มสินค้าตัวไหน — ลิงก์ที่ชี้กลับสินค้าตัวเดียวกับหัวกลุ่มเรียกว่า "สินค้านี้"
 * ไม่พิมพ์ชื่อซ้ำกับที่อ่านอยู่บนหัวกลุ่ม (เจ้าของร้านขอ 21 ก.ย. 69 — อ่าน "ทุกชิ้นของ กริ๊กต๊อก MagSafe" ใต้หัวข้อ
 * "กริ๊กต๊อก MagSafe" แล้วไม่รู้ว่าตกลงมันอยู่ที่สินค้าหรือยัง) · ลิงก์ข้ามไปสินค้าตัวอื่นยังพิมพ์ชื่อเต็มเหมือนเดิม
 */
function LinkCell({
  ready,
  usage,
  dead,
  hasSuggest,
  inProductId,
}: {
  ready: boolean;
  usage?: StockUsage[];
  dead: boolean;
  hasSuggest: boolean;
  inProductId?: string;
}) {
  if (!ready) return <span className="text-[11px]" style={{ color: "var(--dk-quiet)" }}>…</span>;
  if (!usage?.length)
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Tag tone="coral">{dead ? "สินค้าที่ผูกหายไป" : "ยังไม่ผูก"}</Tag>
        {hasSuggest && <span className="text-[11px]" style={{ color: "var(--dk-navy-soft)" }}>มีคู่ที่น่าจะใช่ — กดเพื่อผูก</span>}
      </span>
    );
  const MAX = 3;
  const line = (u: StockUsage) => {
    const here = u.kind !== "preset" && !!inProductId && u.productId === inProductId;
    if (u.kind === "product")
      return u.bom
        ? { main: `${here ? "สินค้านี้ทุกชิ้น" : `ทุกชิ้นของ ${u.productName}`}${u.per && u.per !== 1 ? ` ×${u.per}` : ""}`, sub: "วัสดุแฝง — ไม่มีในตัวเลือก" }
        : { main: here ? "ทุกออเดอร์ของสินค้านี้" : `ทุกออเดอร์ของ ${u.productName}`, sub: "" };
    if (u.kind === "preset") return { main: `${u.label} = ${u.choice}`, sub: `คลังกลาง · ใช้กับ ${u.usedBy} สินค้า` };
    return {
      main: `${here ? "" : `${u.productName} · `}${u.label} = ${u.choice}${u.per !== 1 ? ` (×${u.per})` : ""}`,
      sub: u.cond ? `เฉพาะเมื่อ ${u.cond}` : "",
    };
  };
  return (
    <span className="block min-w-0 space-y-1">
      {usage.slice(0, MAX).map((u, i) => {
        const l = line(u);
        return (
          <span key={i} className="block break-words leading-snug">
            <span className="block text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
              ตัดเมื่อ {l.main}
            </span>
            {l.sub && (
              <span className="block text-[11px]" style={{ color: u.kind === "choice" && u.cond ? "var(--dk-yolk-ink)" : "var(--dk-faint)" }}>
                {l.sub}
              </span>
            )}
          </span>
        );
      })}
      {usage.length > MAX && (
        <span className="block text-[11px]" style={{ color: "var(--dk-faint)" }}>
          +{usage.length - MAX} จุด — กดแถวเพื่อดูทั้งหมด
        </span>
      )}
    </span>
  );
}

/** ลิ้นชัก: ขายอะไรแล้วตัด SKU ตัวนี้ + คู่ที่น่าจะใช่ (กดผูกได้เลย) */
function UsagePanel({
  item,
  usage,
  suggest,
  ready,
  mayEdit,
  products,
  skus,
  hangs,
  onLink,
  onUnlink,
  onLinkExtra,
  onUnlinkHang,
  onEdit,
}: {
  item: Item;
  usage: StockUsage[];
  suggest: StockSuggest[];
  ready: boolean;
  mayEdit: boolean;
  products: ProductLite[];
  skus: { id: string; name: string; code?: string; img?: string }[];
  hangs: HangRow[];
  onLink: (t: StockSuggest) => Promise<boolean>;
  onUnlink: (t: StockUsage) => Promise<boolean>;
  onLinkExtra: (p: ExtraLinkPayload) => Promise<string | null>;
  onUnlinkHang: (h: HangRow) => Promise<boolean>;
  onEdit: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [addExtra, setAddExtra] = useState(false);
  const run = async (k: string, fn: () => Promise<boolean>) => {
    setBusy(k);
    await fn();
    setBusy(null);
  };
  const where = (t: StockUsage | StockSuggest) =>
    t.kind === "preset"
      ? `คลังกลาง “${t.label}” · ${t.usedBy} สินค้า`
      : t.kind === "choice"
        ? `${t.productName} · ${t.label}${"cond" in t && t.cond ? ` · เฉพาะเมื่อ ${t.cond}` : ""}`
        : "";

  return (
    <div className="mt-5">
      <p className={labelCls}>ขายอะไรแล้วตัดตัวนี้</p>
      {!ready ? (
        <p className="py-3 text-xs text-slate-400">กำลังโหลด…</p>
      ) : usage.length === 0 ? (
        <p className={`mt-1.5 rounded-xl px-3 py-2 text-xs ${TONE.danger.bg} ${TONE.danger.text}`}>
          ยังไม่เชื่อมกับสินค้าหรือตัวเลือกไหนเลย — ขายแล้วยอดตัวนี้ไม่ขยับ ต้องเบิกเอง
        </p>
      ) : (
        <ul className="mt-1.5 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {usage.map((u, i) => {
            const k = `u${i}`;
            return (
              <li key={k} className="flex items-center gap-2.5 px-2.5 py-2">
                <Thumb src={u.img} name={u.kind === "preset" ? u.choice : u.productName} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-slate-900">
                    {u.kind === "product" ? u.productName : u.choice}
                    {u.kind !== "product" && u.per !== 1 && <span className="ml-1 font-normal text-slate-400">× {u.per} {item.unit}</span>}
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {u.kind === "product"
                      ? u.missing
                        ? "ไม่มีสินค้ารหัสนี้แล้ว — ลิงก์นี้ไม่ตัดยอด กด “แก้” เพื่อเลือกสินค้าใหม่"
                        : u.bom
                          ? `วัสดุแฝง · ทุกชิ้น ×${u.per ?? 1} ${item.unit}`
                          : "ทุกออเดอร์ของสินค้านี้ · 1 ต่อ 1"
                      : where(u)}
                    {u.kind !== "preset" && u.draft ? " · ร่าง" : ""}
                  </span>
                </span>
                {mayEdit &&
                  (u.kind === "product" && !u.bom ? (
                    <button type="button" onClick={onEdit} className={btnSmGhost}>
                      แก้
                    </button>
                  ) : (
                    <button type="button" disabled={busy === k} onClick={() => run(k, () => onUnlink(u))} className={btnSmGhost}>
                      {busy === k ? "…" : "ถอด"}
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      {ready && suggest.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-slate-500">ตัวเลือกที่ชื่อตรงกัน — น่าจะเป็นตัวนี้</p>
          <ul className="mt-1.5 divide-y divide-slate-100 rounded-xl border border-dashed border-slate-300">
            {suggest.map((t, i) => {
              const k = `s${i}`;
              return (
                <li key={k} className="flex items-center gap-2.5 px-2.5 py-2">
                  <Thumb src={t.img} name={t.choice} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-slate-900">{t.choice}</span>
                    <span className="block truncate text-[11px] text-slate-400">{where(t)}</span>
                  </span>
                  {mayEdit && (
                    <button type="button" disabled={busy === k} onClick={() => run(k, () => onLink(t))} className={btnSmNeutral}>
                      {busy === k ? "กำลังผูก…" : "ผูก"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ของที่ห้อยใต้ตัวนี้ — ชุดเดียวกับแถวลูกในตาราง เปิดลิ้นชักตัวแม่ต้องเห็นว่ามีอะไรพ่วงอยู่ */}
      {ready && hangs.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-slate-500">ขายตัวนี้แล้วตัดอะไรเพิ่มอีก</p>
          <ul className="mt-1.5 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {hangs.map((h) => {
              const k = `h${h.id}`;
              return (
                <li key={k} className="flex items-center gap-2.5 px-2.5 py-2">
                  <span className="w-3 text-center text-[13px] leading-none text-slate-300" aria-hidden>
                    └
                  </span>
                  <Thumb src={h.img} name={h.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-slate-900">{h.name}</span>
                    <span className="block truncate text-[11px] text-slate-400">
                      {h.kind === "bom"
                        ? `วัสดุแฝงของสินค้า · ทุกชิ้น${h.per && h.per !== 1 ? ` ×${h.per}` : ""} — ถอดที่ลิ้นชักของตัวมันเอง`
                        : h.cond
                          ? `ตัดเพิ่มถ้า ${h.cond}`
                          : "ตัดเพิ่มเมื่อเลือกตัวเลือกนี้"}
                    </span>
                  </span>
                  {mayEdit && h.kind === "extra" && (
                    <button type="button" disabled={busy === k} onClick={() => run(k, () => onUnlinkHang(h))} className={btnSmGhost}>
                      {busy === k ? "…" : "ถอด"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {ready && mayEdit && (addExtra ? (
        <ExtraLinkForm
          item={item}
          products={products}
          skus={skus}
          // ตัวเลือกที่ SKU นี้ผูกอยู่ = "ตอนขายตัวนี้ในฐานะอะไร" (ของมีเงื่อนไขเองพ่วงต่อไม่ได้)
          hosts={usage.flatMap((u) => (u.kind === "choice" && !u.extra ? [{ productId: u.productId, productName: u.productName, label: u.label, optionIndex: u.optionIndex, choice: u.choice }] : []))}
          onSubmit={onLinkExtra}
          onClose={() => setAddExtra(false)}
        />
      ) : (
        <button type="button" onClick={() => setAddExtra(true)} className={`${btnSmNeutral} mt-2`}>
          ＋ ตัดเพิ่มแบบมีเงื่อนไข
        </button>
      ))}

      {ready && mayEdit && (
        <p className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-slate-400">
          <button type="button" onClick={onEdit} className="underline underline-offset-2 hover:text-slate-600">
            ผูกกับตัวสินค้า
          </button>
          <a href={`/admin/stock/link?q=${encodeURIComponent(item.family ?? item.name)}`} className="underline underline-offset-2 hover:text-slate-600">
            ผูกกับตัวเลือก (หน้าผูกคลัง)
          </a>
        </p>
      )}
    </div>
  );
}

/** กลุ่มตัวเลือกของสินค้าหนึ่งตัว (อ่านจาก /api/admin/stock/link?options=<id>) */
type OptGroup = { label: string; optionIndex: number; fromPreset: boolean; choices: string[] };
type ExtraLinkPayload = {
  productId: string;
  label: string;
  optionIndex: number;
  choice: string;
  /** SKU ที่จะถูกตัดเพิ่ม (ตัวห้อย) — ไม่จำเป็นต้องเป็น SKU ที่เปิดลิ้นชักอยู่ */
  stockItemId: string;
  per: number;
  when: { label: string; choices: string[] }[];
};

/**
 * ➕ ผูก "ของที่ตัดเพิ่มแบบมีเงื่อนไข" — ของที่โดนตัดก็ต่อเมื่อลูกค้าเลือกครบหลายกลุ่มพร้อมกัน
 * (ขาย แผ่นจิ๊กซอว์ A5 แล้วตัด กรอบรูป A5 เพิ่ม เมื่อ ตัวเลือก = กรอบรูป + แผ่นจิ๊กซอว์)
 * ก่อนหน้านี้ตั้งได้จากสคริปต์อย่างเดียว ถอดได้แต่ผูกกลับไม่ได้ (เจ้าของร้านขอ 21 ก.ย. 69)
 *
 * ผูกได้ 2 ทิศ เพราะคนคิดมาทั้งสองแบบ:
 *   down = ขาย "ตัวที่เปิดอยู่" แล้วตัดตัวอื่นเพิ่ม   → ตัวหลักคือตัวที่เปิดอยู่ เลือกแค่ว่าจะพ่วงอะไร
 *   up   = ขายตัวอื่นแล้วตัด "ตัวที่เปิดอยู่" เพิ่ม   → เลือกสินค้า+ตัวเลือกที่จะไปเกาะเอง
 * ทั้งคู่เขียนลงที่เดียวกัน: choices[ตัวหลัก].stockLinks ของสินค้า
 */
function ExtraLinkForm({
  item,
  products,
  skus,
  hosts,
  onSubmit,
  onClose,
}: {
  item: Item;
  products: ProductLite[];
  /** SKU ทั้งคลังไว้เลือกเป็นตัวห้อย (โหมด down) */
  skus: { id: string; name: string; code?: string; img?: string }[];
  /** ตัวเลือกที่ SKU นี้ผูกอยู่ — ใช้เป็น "ตัวหลัก" ในโหมด down */
  hosts: { productId: string; productName: string; label: string; optionIndex: number; choice: string }[];
  onSubmit: (p: ExtraLinkPayload) => Promise<string | null>;
  onClose: () => void;
}) {
  const [dir, setDir] = useState<"down" | "up">(hosts.length ? "down" : "up");
  // โหมด down: ตัวหลัก = ตัวเลือกที่ SKU นี้ผูกอยู่ · โหมด up: เลือกสินค้า+ตัวเลือกเอง
  const [hostKey, setHostKey] = useState(hosts.length === 1 ? "0" : "");
  const [kidId, setKidId] = useState("");
  const [kidQ, setKidQ] = useState("");
  const [productId, setProductId] = useState("");
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<OptGroup[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [upKey, setUpKey] = useState("");
  const [upChoice, setUpChoice] = useState("");
  const [conds, setConds] = useState<{ label: string; choices: string[] }[]>([{ label: "", choices: [] }]);
  const [per, setPer] = useState("1");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const host = dir === "down" ? hosts[Number(hostKey)] : undefined;
  const pid = dir === "down" ? host?.productId ?? "" : productId;
  const product = products.find((p) => p.id === pid);
  const kid = skus.find((k) => k.id === kidId);

  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    return products.filter((p) => p.name.toLowerCase().includes(n) || p.id.toLowerCase().includes(n)).slice(0, 8);
  }, [products, q]);
  const kidHits = useMemo(() => {
    const n = kidQ.trim().toLowerCase();
    if (!n) return [];
    return skus.filter((k) => k.id !== item.id && (k.name.toLowerCase().includes(n) || (k.code ?? "").toLowerCase().includes(n))).slice(0, 8);
  }, [skus, kidQ, item.id]);

  // เปลี่ยนสินค้า/ตัวหลัก = ล้างทุกช่องที่อ้างกลุ่มของสินค้าเดิม ไม่งั้นส่งชื่อกลุ่มที่ไม่มีจริงไป
  useEffect(() => {
    setGroups(null);
    setLoadErr("");
    setUpKey("");
    setUpChoice("");
    setConds([{ label: "", choices: [] }]);
    if (!pid) return;
    let dead = false;
    void (async () => {
      const res = await fetch(`/api/admin/stock/link?options=${encodeURIComponent(pid)}`);
      const j = await res.json().catch(() => null);
      if (dead) return;
      if (!res.ok || !j?.ok) setLoadErr(j?.error ?? "อ่านตัวเลือกของสินค้านี้ไม่ได้");
      else setGroups(j.options ?? []);
    })();
    return () => {
      dead = true;
    };
  }, [pid]);

  const upHost = groups?.find((g) => `${g.optionIndex}` === upKey);
  const mainLabel = dir === "down" ? host?.label ?? "" : upHost?.label ?? "";
  const mainChoice = dir === "down" ? host?.choice ?? "" : upChoice;
  const mainIndex = dir === "down" ? host?.optionIndex ?? -1 : upHost?.optionIndex ?? -1;
  const condGroup = (label: string) => groups?.find((g) => g.label === label);
  const setCond = (i: number, next: { label: string; choices: string[] }) => setConds((cs) => cs.map((c, j) => (j === i ? next : c)));

  const target = dir === "down" ? kidId : item.id;
  const ready = !!pid && !!mainLabel && !!mainChoice && mainIndex >= 0 && !!target && conds.some((c) => c.label && c.choices.length) && Number(per) > 0;
  const kidName = dir === "down" ? kid?.name ?? "…" : item.name;
  const preview = mainLabel
    ? `ตัด ${kidName}${Number(per) !== 1 ? ` ×${per}` : ""} เพิ่ม เมื่อ ${mainLabel} = ${mainChoice || "…"}` +
      conds.filter((c) => c.label && c.choices.length).map((c) => ` และ ${c.label} = ${c.choices.join(" / ")}`).join("")
    : "";

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setErr("");
    const msg = await onSubmit({
      productId: pid,
      label: mainLabel,
      optionIndex: mainIndex,
      choice: mainChoice,
      stockItemId: target,
      per: Number(per),
      when: conds.filter((c) => c.label && c.choices.length),
    });
    setBusy(false);
    if (msg) setErr(msg);
    else onClose();
  };

  const selectCls = `${inputCls} !py-1.5 text-[13px]`;
  const dirBtn = (v: "down" | "up", text: string) => (
    <button
      type="button"
      onClick={() => setDir(v)}
      aria-pressed={dir === v}
      className={`flex-1 rounded-lg px-2 py-1.5 text-[11.5px] leading-snug ${dir === v ? "bg-slate-800 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
    >
      {text}
    </button>
  );

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[12px] font-semibold text-slate-700">ตัดเพิ่มแบบมีเงื่อนไข</p>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
        ใช้กับของที่ตัดก็ต่อเมื่อลูกค้าเลือกครบหลายกลุ่มพร้อมกัน — ถ้าตัดทุกครั้งอยู่แล้ว ให้ผูกแบบปกติ หรือตั้งเป็นวัสดุแฝงแทน
      </p>

      <div className="mt-2.5 flex gap-1.5">
        {dirBtn("down", "ขายตัวนี้ แล้วตัดตัวอื่นเพิ่ม")}
        {dirBtn("up", "ขายตัวอื่น แล้วตัดตัวนี้เพิ่ม")}
      </div>

      {dir === "down" ? (
        <>
          {!hosts.length ? (
            <p className={`mt-2 rounded-lg px-2 py-1.5 text-[12px] ${TONE.review.bg} ${TONE.review.text}`}>
              SKU นี้ยังไม่ได้ผูกกับตัวเลือกไหน — ผูกก่อน ถึงจะพ่วงของตัดเพิ่มได้ (หรือสลับไปโหมดอีกอันได้)
            </p>
          ) : (
            <>
              <label className={`${fieldLabel} mt-2.5 block`}>ตอนขายตัวนี้ในฐานะ</label>
              <select value={hostKey} onChange={(e) => setHostKey(e.target.value)} className={`${selectCls} mt-1`} aria-label="ตัวเลือกที่เป็นตัวหลัก">
                <option value="">— เลือก —</option>
                {hosts.map((h, i) => (
                  <option key={i} value={`${i}`}>
                    {h.productName} · {h.label} = {h.choice}
                  </option>
                ))}
              </select>

              <label className={`${fieldLabel} mt-3 block`}>ให้ตัดวัสดุนี้เพิ่ม</label>
              {kid ? (
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                  <Thumb src={kid.img} name={kid.name} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-slate-900">{kid.name}</span>
                    {kid.code && <span className={codeCls}>{kid.code}</span>}
                  </span>
                  <button type="button" onClick={() => (setKidId(""), setKidQ(""))} className={btnSmGhost}>
                    เปลี่ยน
                  </button>
                </div>
              ) : (
                <>
                  <input value={kidQ} onChange={(e) => setKidQ(e.target.value)} placeholder="ค้นชื่อ/รหัสวัสดุ…" className={`${inputCls} mt-1`} />
                  {kidQ.trim() && (
                    <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                      {kidHits.map((k) => (
                        <li key={k.id}>
                          <button type="button" onClick={() => setKidId(k.id)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50">
                            <Thumb src={k.img} name={k.name} size={28} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] text-slate-800">{k.name}</span>
                              {k.code && <span className={codeCls}>{k.code}</span>}
                            </span>
                          </button>
                        </li>
                      ))}
                      {!kidHits.length && <li className="px-2 py-2 text-[12px] text-slate-400">ไม่พบวัสดุที่ตรง</li>}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <label className={`${fieldLabel} mt-2.5 block`}>สินค้า</label>
          {product ? (
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
              <Thumb src={product.img} name={product.name} size={28} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-slate-900">{product.name}</span>
              <button type="button" onClick={() => (setProductId(""), setQ(""))} className={btnSmGhost}>
                เปลี่ยน
              </button>
            </div>
          ) : (
            <>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อสินค้า…" className={`${inputCls} mt-1`} />
              {q.trim() && (
                <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                  {hits.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setProductId(p.id)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50">
                        <Thumb src={p.img} name={p.name} size={28} />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800">{p.name}</span>
                      </button>
                    </li>
                  ))}
                  {!hits.length && <li className="px-2 py-2 text-[12px] text-slate-400">ไม่พบสินค้าที่ตรง</li>}
                </ul>
              )}
            </>
          )}

          {groups && (
            <>
              <label className={`${fieldLabel} mt-3 block`}>ตัดเพิ่มเมื่อลูกค้าเลือก</label>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                <select value={upKey} onChange={(e) => (setUpKey(e.target.value), setUpChoice(""))} className={selectCls} aria-label="กลุ่มตัวเลือกหลัก">
                  <option value="">— กลุ่ม —</option>
                  {groups.filter((g) => !g.fromPreset).map((g) => (
                    <option key={g.optionIndex} value={`${g.optionIndex}`}>
                      {g.label}
                    </option>
                  ))}
                </select>
                <select value={upChoice} onChange={(e) => setUpChoice(e.target.value)} className={selectCls} aria-label="ค่าที่เลือก" disabled={!upHost}>
                  <option value="">— ค่า —</option>
                  {(upHost?.choices ?? []).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              {groups.some((g) => g.fromPreset) && (
                <p className="mt-1 text-[11px] text-slate-400">กลุ่มที่มาจากคลังตัวเลือกกลางตั้งตรงนี้ไม่ได้ — ต้องไปแก้ที่คลังกลาง</p>
              )}
            </>
          )}
        </>
      )}

      {loadErr && <p className={`mt-2 rounded-lg px-2 py-1.5 text-[12px] ${TONE.danger.bg} ${TONE.danger.text}`}>{loadErr}</p>}
      {pid && !groups && !loadErr && <p className="mt-2 text-[12px] text-slate-400">กำลังอ่านตัวเลือก…</p>}

      {groups && mainLabel && (
        <>
          {/* เงื่อนไข — กลุ่มอื่นต้องตรงด้วย */}
          <label className={`${fieldLabel} mt-3 block`}>และเมื่อกลุ่มอื่นเป็น</label>
          {conds.map((c, i) => {
            const g = condGroup(c.label);
            return (
              <div key={i} className="mt-1 rounded-lg border border-slate-200 bg-white p-2">
                <div className="flex items-center gap-1.5">
                  <select
                    value={c.label}
                    onChange={(e) => setCond(i, { label: e.target.value, choices: [] })}
                    className={`${selectCls} min-w-0 flex-1`}
                    aria-label={`กลุ่มเงื่อนไขที่ ${i + 1}`}
                  >
                    <option value="">— กลุ่ม —</option>
                    {groups.filter((x) => x.label !== mainLabel).map((x) => (
                      <option key={x.optionIndex} value={x.label}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                  {conds.length > 1 && (
                    <button type="button" onClick={() => setConds((cs) => cs.filter((_, j) => j !== i))} className={btnSmGhost} aria-label="เอาเงื่อนไขนี้ออก">
                      ✕
                    </button>
                  )}
                </div>
                {g && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {g.choices.map((name) => {
                      const on = c.choices.includes(name);
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setCond(i, { label: c.label, choices: on ? c.choices.filter((x) => x !== name) : [...c.choices, name] })}
                          className={`rounded-full px-2 py-1 text-[11.5px] ${on ? "bg-slate-800 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                          aria-pressed={on}
                        >
                          {name}
                        </button>
                      );
                    })}
                    {c.choices.length > 1 && <span className="self-center text-[11px] text-slate-400">เลือกค่าไหนก็เข้าเงื่อนไข</span>}
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" onClick={() => setConds((cs) => [...cs, { label: "", choices: [] }])} className={`${btnSmGhost} mt-1`}>
            ＋ เพิ่มเงื่อนไข
          </button>

          <label className={`${fieldLabel} mt-3 block`}>ใช้กี่หน่วยต่อสินค้า 1 ชิ้น</label>
          <input value={per} onChange={(e) => setPer(e.target.value)} inputMode="decimal" className={`${inputCls} mt-1 w-28`} />

          {preview && <p className="mt-2.5 rounded-lg bg-white px-2 py-1.5 text-[12px] leading-snug text-slate-600">{preview}</p>}
        </>
      )}

      {err && <p className={`mt-2 rounded-lg px-2 py-1.5 text-[12px] ${TONE.danger.bg} ${TONE.danger.text}`}>{err}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" disabled={!ready || busy} onClick={() => void submit()} className={`${btnSmNeutral} disabled:opacity-40`}>
          {busy ? "กำลังผูก…" : "ผูก"}
        </button>
        <button type="button" onClick={onClose} className={btnSmGhost}>
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

/** เลือกสินค้าด้วยชื่อ+รูป แทนการพิมพ์รหัสเอง (พิมพ์ผิดตัวเดียว = ไม่ตัดสต๊อกแบบเงียบ ๆ) */
function ProductPicker({ products, value, onChange }: { products: ProductLite[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    return products.filter((p) => !value.includes(p.id) && (p.name.toLowerCase().includes(n) || p.id.toLowerCase().includes(n))).slice(0, 8);
  }, [products, q, value]);

  return (
    <div>
      {value.length > 0 && (
        <ul className="mb-2 space-y-1">
          {value.map((id) => {
            const p = byId.get(id);
            return (
              <li key={id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                <Thumb src={p?.img} name={p?.name ?? id} size={32} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13px] ${p ? "text-slate-900" : TONE.danger.text}`}>{p?.name ?? "ไม่พบสินค้านี้ในระบบ"}</span>
                  <span className={codeCls}>{id}</span>
                </span>
                <button type="button" onClick={() => onChange(value.filter((x) => x !== id))} className={btnSmGhost} aria-label={`เอา ${p?.name ?? id} ออก`}>
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อสินค้าเพื่อเพิ่ม…" className={inputCls} />
      {q.trim() && (
        <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {hits.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onChange([...value, p.id]);
                  setQ("");
                }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50"
              >
                <Thumb src={p.img} name={p.name} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-slate-900">
                    {p.name}
                    {p.draft && <span className="ml-1 text-[11px] text-slate-400">(ร่าง)</span>}
                  </span>
                  <span className={codeCls}>{p.id}</span>
                </span>
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="px-3 py-3 text-center text-xs text-slate-400">ไม่พบสินค้า</li>}
        </ul>
      )}
    </div>
  );
}

/**
 * แยกสต๊อกของสินค้าตามตัวเลือก
 *   เลือก 1 กลุ่ม  → SKU ละ 1 ค่า (ขนาด 7×12 / 6.8×10.5) · มี "ของอีกชิ้นแบบมีเงื่อนไข" ได้ (กรอบตามขนาด)
 *   เลือก 2 กลุ่ม → SKU ทุกคู่ (กระจกถือ ทรง 2 × สี 6 = 12) ผูกเป็นลิงก์มีเงื่อนไขบนค่าของกลุ่มแรก
 * SKU รวมเดิมที่ผูกกับตัวสินค้าจะถูกถอดออกเสมอ ไม่งั้นขาย 1 ชิ้นตัด 2 ต่อ
 * หน้าต่าง: หัว/ท้ายตรึง เนื้อหาเลื่อนในตัว สูงไม่เกินจอ (เดิมยาวจนปุ่มสร้างตกขอบจอ · 19 ก.ย. 69)
 */
function SplitModal({ product, onClose, onDone }: { product: { id: string; name: string }; onClose: () => void; onDone: (msg: string) => void }) {
  type Link = { stockItemId: string; name: string | null; when: { label: string; choices: string[] }[] };
  type Choice = { name: string; img?: string; stockItemId: string | null; skuName: string | null; extras?: string[]; links?: Link[] };
  type Group = { optionIndex: number; label: string; choices: Choice[] };
  type Old = { id: string; name: string; code?: string; balance: number; unit: string; shared: boolean };
  const SEP = "\u0001";
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [old, setOld] = useState<Old[]>([]);
  /** กลุ่มที่เลือก ตามลำดับที่กด (สูงสุด 2) — ตัวแรก = กลุ่มที่ถือลิงก์ */
  const [sel, setSel] = useState<number[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [removeOld, setRemoveOld] = useState(true);
  const [partName, setPartName] = useState("");
  const [extraOn, setExtraOn] = useState(false);
  const [extraName, setExtraName] = useState("");
  const [condGroup, setCondGroup] = useState(-1);
  const [condChoices, setCondChoices] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let dead = false;
    (async () => {
      const res = await fetch(`/api/admin/stock/split?productId=${encodeURIComponent(product.id)}`);
      const j = await res.json().catch(() => null);
      if (dead) return;
      if (!res.ok || !j?.ok) return setErr(j?.error ?? "โหลดตัวเลือกของสินค้าไม่สำเร็จ");
      setGroups(j.groups);
      setOld(j.old);
      if (j.groups?.length) setSel([0]);
    })();
    return () => {
      dead = true;
    };
  }, [product.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const gA = groups?.[sel[0] ?? -1];
  const gB = sel.length > 1 ? groups?.[sel[1]] : undefined;
  const pairMode = !!(gA && gB);

  /** คู่ (a,b) มี SKU แล้วหรือยัง — ดูจากลิงก์มีเงื่อนไขบนค่าของกลุ่มแรก */
  const pairSku = (a: Choice, b: string) =>
    a.links?.find((l) => l.when.length === 1 && gB && l.when[0].label === gB.label && l.when[0].choices.length === 1 && l.when[0].choices[0] === b);

  type Row = { key: string; a: Choice; b?: Choice; done: string | null };
  const rows = useMemo((): Row[] => {
    if (!gA) return [];
    if (!gB) return gA.choices.map((c) => ({ key: c.name, a: c, done: c.stockItemId && !extraOn ? c.skuName ?? c.stockItemId : null }));
    return gB.choices.flatMap((b) =>
      gA.choices.map((a) => {
        const ex = pairSku(a, b.name);
        return { key: `${a.name}${SEP}${b.name}`, a, b, done: ex ? ex.name ?? ex.stockItemId : null };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gA, gB, extraOn]);

  // เปลี่ยนกลุ่ม → ติ๊กทุกแถวที่ยังไม่มี SKU ให้ก่อน (งานส่วนใหญ่คือแยกครบ)
  useEffect(() => {
    setPicked(new Set(rows.filter((r) => !r.done).map((r) => r.key)));
  }, [rows]);

  const toggleGroup = (i: number) => {
    setErr("");
    setSel((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].slice(-2)));
    setCondGroup(-1);
    setCondChoices(new Set());
  };

  const canRemove = old.length > 0 && old.every((o) => o.balance === 0 && !o.shared);
  const condGroups = (groups ?? []).map((x, i) => ({ x, i })).filter(({ i }) => i !== sel[0]);
  const cond = condGroup >= 0 && condGroup !== sel[0] ? groups?.[condGroup] : undefined;
  const extraReady = pairMode || !extraOn || (extraName.trim() !== "" && !!cond && condChoices.size > 0);
  const todo = rows.filter((r) => picked.has(r.key) && !r.done).length + (!pairMode && extraOn ? rows.filter((r) => picked.has(r.key)).length : 0);
  /** กลุ่มอื่นของสินค้านี้ที่ผูก SKU ไว้แล้ว — แยกซ้ำอีกกลุ่ม = ออเดอร์เดียวตัด 2 ตัว */
  const alreadySplit = (groups ?? [])
    .filter((x, i) => !sel.includes(i) && x.choices.some((c) => c.stockItemId || c.links?.length))
    .map((x) => x.label);
  const label = (r: Row) => (r.b ? `${r.b.name} · ${r.a.name}` : r.a.name);

  async function submit() {
    if (!gA) return;
    setBusy(true);
    setErr("");
    const chosen = rows.filter((r) => picked.has(r.key));
    const res = await fetch("/api/admin/stock/split", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        optionIndex: gA.optionIndex,
        label: gA.label,
        choices: [...new Set(chosen.map((r) => r.a.name))],
        removeOld: removeOld && canRemove,
        partName: partName.trim() || undefined,
        ...(pairMode
          ? { pair: { optionIndex: gB!.optionIndex, label: gB!.label }, combos: chosen.filter((r) => !r.done).map((r) => [r.a.name, r.b!.name]) }
          : { extra: extraOn && cond ? { name: extraName.trim(), when: { label: cond.label, choices: [...condChoices] } } : undefined }),
      }),
    });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok || !j?.ok) return setErr(j?.error ?? "แยกสต๊อกไม่สำเร็จ");
    const reused = (j.created as { reused?: boolean }[]).filter((x) => x.reused).length;
    onDone(
      `แยกสต๊อก ${product.name} ตาม “${pairMode ? `${gB!.label} × ${gA.label}` : gA.label}” แล้ว ${j.created.length} ตัว${reused ? ` (ใช้ของนำเข้าเดิม ${reused} ตัว)` : ""} — ยอดเริ่มที่ 0 กด “นับ” หรือ “รับเข้า” ใส่ยอดจริง`
    );
  }

  const chip = (on: boolean) =>
    `min-h-[40px] rounded-xl border px-3 text-[13px] font-medium transition ${
      on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    }`;

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="แยกสต๊อกตามตัวเลือก"
      >
        <header className="flex items-start gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-slate-900">แยกสต๊อกตามตัวเลือก</p>
            <p className={`truncate ${subtle}`}>{product.name}</p>
          </div>
          <button type="button" onClick={onClose} className={btnSmGhost} aria-label="ปิด">
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
          {err && <p className={`rounded-xl px-3 py-2 text-xs ${TONE.danger.bg} ${TONE.danger.text}`}>{err}</p>}
          {!groups ? (
            !err && <p className="py-8 text-center text-slate-400">กำลังโหลดตัวเลือกของสินค้า…</p>
          ) : groups.length === 0 ? (
            <p className="py-6 text-center text-slate-500">
              สินค้านี้ไม่มีกลุ่มตัวเลือกของตัวเองให้แยก — ถ้าใช้ตัวเลือกจากคลังกลาง (ตะขอ สีไหม) ให้ผูกที่หน้า “ผูกตัวเลือกสินค้า”
            </p>
          ) : (
            <>
              <div>
                <p className={fieldLabel}>ของบนชั้นต่างกันตามกลุ่มไหน (เลือกได้ 2 กลุ่ม)</p>
                <div className="flex flex-wrap gap-1.5">
                  {groups.map((x, i) => {
                    const at = sel.indexOf(i);
                    return (
                      <button key={`${x.optionIndex}-${x.label}`} type="button" aria-pressed={at >= 0} onClick={() => toggleGroup(i)} className={chip(at >= 0)}>
                        {at >= 0 && sel.length > 1 ? `${at + 1}. ` : ""}
                        {x.label} <span className={at >= 0 ? "text-white/60" : "text-slate-400"}>{x.choices.length}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {pairMode
                    ? `สร้างครบทุกคู่ ${gB!.label} × ${gA!.label} = ${gB!.choices.length * gA!.choices.length} แบบ — ใช้เมื่อของต่างกันทั้ง 2 อย่าง เช่น กระจกทรงหัวใจสีดำ`
                    : "เลือกกลุ่มที่ 2 ด้วย ถ้าของต่างกันทั้ง 2 อย่าง (เช่น ทรง และ สี)"}
                </p>
              </div>

              {gA && (
                <div className="rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-[12px] text-slate-500">
                    <span>
                      เลือกแล้ว {rows.filter((r) => picked.has(r.key) && !r.done).length} / {rows.filter((r) => !r.done).length}
                    </span>
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-slate-800"
                      onClick={() =>
                        setPicked((cur) => (rows.every((r) => r.done || cur.has(r.key)) ? new Set() : new Set(rows.filter((r) => !r.done).map((r) => r.key))))
                      }
                    >
                      {rows.every((r) => r.done || picked.has(r.key)) ? "ไม่เลือกเลย" : "เลือกทั้งหมด"}
                    </button>
                  </div>
                  <ul className="max-h-[38dvh] divide-y divide-slate-100 overflow-y-auto">
                    {rows.map((r) => {
                      const on = !!r.done || picked.has(r.key);
                      const part = partName.trim();
                      return (
                        <li key={r.key}>
                          <label className={`flex min-h-[44px] items-center gap-2.5 px-3 py-1.5 ${r.done ? "" : "cursor-pointer hover:bg-slate-50"}`}>
                            <input
                              type="checkbox"
                              className="h-[18px] w-[18px] shrink-0 accent-slate-900"
                              disabled={!!r.done}
                              checked={on}
                              onChange={(e) =>
                                setPicked((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(r.key);
                                  else next.delete(r.key);
                                  return next;
                                })
                              }
                            />
                            <Thumb src={r.a.img ?? r.b?.img} name={label(r)} size={30} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium text-slate-900">{label(r)}</span>
                              <span className="block truncate text-[11px] text-slate-400">
                                {r.done
                                  ? `มี SKU แล้ว: ${r.done}`
                                  : pairMode
                                    ? `จะสร้าง “${part || product.name} · ${label(r)}”`
                                    : `จะสร้าง “${part ? `${part} ${r.a.name}` : `${product.name} · ${r.a.name}`}”`}
                                {!pairMode && extraOn && extraName.trim() && picked.has(r.key) ? ` + “${extraName.trim()} ${r.a.name}”` : ""}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <label className="block">
                <span className={fieldLabel}>ของชิ้นนี้เรียกว่าอะไร (ไม่บังคับ)</span>
                <input value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="เช่น กระจก / แผ่นจิ๊กซอว์ — เว้นว่าง = ใช้ชื่อสินค้า" className={inputCls} />
              </label>

              {!pairMode && condGroups.length > 0 && (
                <div className="rounded-xl border border-slate-200 px-3 py-2">
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-slate-800">
                    <input type="checkbox" className="h-[18px] w-[18px] accent-slate-900" checked={extraOn} onChange={(e) => setExtraOn(e.target.checked)} />
                    มีของอีกชิ้นที่หยิบเพิ่ม เฉพาะบางแบบ
                  </label>
                  <p className="mt-0.5 text-[11px] text-slate-400">เช่น กรอบรูปตามขนาด หยิบเฉพาะตอนลูกค้าเลือก “กรอบรูป + แผ่นจิ๊กซอว์”</p>
                  {extraOn && (
                    <div className="mt-2 space-y-2">
                      <input value={extraName} onChange={(e) => setExtraName(e.target.value)} placeholder="ชื่อของชิ้นที่ 2 เช่น กรอบรูป" className={inputCls} />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[12px] text-slate-500">หยิบเพิ่มเมื่อ</span>
                        {condGroups.map(({ x, i }) => (
                          <button
                            key={`${x.optionIndex}-${x.label}`}
                            type="button"
                            aria-pressed={condGroup === i}
                            onClick={() => {
                              setCondGroup(i);
                              setCondChoices(new Set());
                            }}
                            className={chip(condGroup === i)}
                          >
                            {x.label}
                          </button>
                        ))}
                      </div>
                      {cond && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[12px] text-slate-500">เป็น</span>
                          {cond.choices.map((c) => {
                            const on = condChoices.has(c.name);
                            return (
                              <button
                                key={c.name}
                                type="button"
                                aria-pressed={on}
                                onClick={() =>
                                  setCondChoices((prev) => {
                                    const next = new Set(prev);
                                    if (!next.delete(c.name)) next.add(c.name);
                                    return next;
                                  })
                                }
                                className={chip(on)}
                              >
                                {on ? "✓ " : ""}
                                {c.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {alreadySplit.length > 0 && picked.size > 0 && !extraOn && (
                <p className={`rounded-xl px-3 py-2 text-xs font-medium ${TONE.danger.bg} ${TONE.danger.text}`}>
                  สินค้านี้แยกสต๊อกตาม “{alreadySplit.join("”, “")}” ไว้แล้ว — แยกเพิ่มอีก ขาย 1 ชิ้นจะตัด 2 ตัว (ลบชุดเดิมก่อน ถ้าจะเปลี่ยนวิธีแยก)
                </p>
              )}

              {old.length > 0 && (
                <div className={`rounded-xl px-3 py-2 text-xs ${TONE.warn.bg} ${TONE.warn.text}`}>
                  <p className="font-semibold">SKU รวมเดิมจะเลิกผูกกับสินค้านี้ (กันตัดยอดซ้ำ 2 ต่อ)</p>
                  <ul className="mt-1 space-y-0.5">
                    {old.map((o) => (
                      <li key={o.id}>
                        {o.name} · คงเหลือ {fmtN(o.balance)} {o.unit}
                        {o.shared ? " · ยังใช้กับสินค้าอื่นอยู่" : ""}
                      </li>
                    ))}
                  </ul>
                  {canRemove ? (
                    <label className="mt-1.5 flex cursor-pointer items-center gap-2">
                      <input type="checkbox" className="h-4 w-4 accent-slate-900" checked={removeOld} onChange={(e) => setRemoveOld(e.target.checked)} />
                      ลบ SKU รวมเดิมออกจากคลังด้วย (ยอดเป็น 0 อยู่แล้ว)
                    </label>
                  ) : (
                    <p className="mt-1">ยังมียอดค้างหรือใช้กับสินค้าอื่น — ระบบเก็บไว้ให้ ย้ายยอดไป SKU ใหม่ด้วยปุ่ม “นับ” แล้วค่อยลบเอง</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex gap-2 border-t border-slate-100 bg-white px-4 py-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <button type="button" onClick={onClose} className={`${btnNeutral} flex-1`}>
            ยกเลิก
          </button>
          <button type="button" disabled={busy || todo === 0 || !extraReady || !gA} onClick={submit} className={`${btnPrimary} flex-[2]`}>
            {busy ? "กำลังสร้าง…" : todo ? `สร้าง ${fmtN(todo)} SKU แล้วผูกให้` : "เลือกอย่างน้อย 1 แบบ"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * รับเข้า / เบิกทั้งชุด — กรอกจำนวนหลายขนาดในหน้าเดียว (ของมาเป็นล็อตเดียวกันจากซัพพลายเออร์)
 * บันทึกทีละรายการผ่าน /api/admin/stock/move ตัวเดิม (ledger เดิม atomic ต่อรายการ) · ช่องว่าง/0 = ข้าม
 */
function BulkMoveModal({
  items,
  images,
  title,
  mode,
  onClose,
  onDone,
}: {
  items: Item[];
  images: Record<string, string>;
  title: string;
  mode: "in" | "out";
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState(mode === "in" ? "นำเข้า" : "เบิกผลิต");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const lines = items.map((i) => ({ i, n: Math.trunc(Number(qty[i.id] || 0)) })).filter((x) => x.n > 0);
  const needNote = mode === "out" && reason === "อื่นๆ";
  const over = mode === "out" ? lines.filter((x) => x.n > x.i.balance) : [];

  async function submit() {
    setBusy(true);
    setErr("");
    let done = 0;
    for (const { i, n } of lines) {
      const res = await fetch("/api/admin/stock/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: i.id, qty: mode === "in" ? n : -n, reason, note: note.trim() || undefined }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setBusy(false);
        // บันทึกไปแล้วบางตัว — บอกให้ชัดว่าตัวไหนค้าง จะได้ไม่กดซ้ำทั้งชุดแล้วยอดเบิ้ล
        setErr(`${i.name}: ${j?.error ?? "บันทึกไม่สำเร็จ"}${done ? ` — บันทึกไปแล้ว ${done} รายการก่อนหน้า ห้ามกดซ้ำทั้งชุด ให้ลบตัวที่บันทึกแล้วออกก่อน` : ""}`);
        return;
      }
      done++;
      setQty((q) => ({ ...q, [i.id]: "" }));
    }
    setBusy(false);
    const sum = lines.reduce((n, x) => n + x.n, 0);
    onDone(`${mode === "in" ? "รับเข้า" : "เบิก"} ${title} แล้ว ${fmtN(done)} รายการ รวม ${fmtN(sum)} ${items[0]?.unit ?? "หน่วย"}`);
  }

  return (
    <Modal title={mode === "in" ? "รับเข้าทั้งชุด" : "เบิกทั้งชุด"} subtitle={title} onClose={onClose}>
      {err && <p className={`mb-3 rounded-xl px-3 py-2 text-xs ${TONE.danger.bg} ${TONE.danger.text}`}>{err}</p>}
      <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
        {items.map((i) => {
          const n = Math.trunc(Number(qty[i.id] || 0));
          const after = mode === "in" ? i.balance + n : i.balance - n;
          return (
            <li key={i.id} className="flex min-h-[56px] items-center gap-3 px-3 py-2">
              <Thumb src={images[i.id]} name={i.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{i.name}</span>
                <span className="block text-[11px] tabular-nums text-slate-400">
                  มี {fmtN(i.balance)} {i.unit}
                  {n > 0 && (
                    <span className={after < 0 ? TONE.danger.text : "text-slate-600"}>
                      {" "}
                      → {fmtN(after)}
                    </span>
                  )}
                </span>
              </span>
              <input
                value={qty[i.id] ?? ""}
                onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value.replace(/\D/g, "") }))}
                inputMode="numeric"
                placeholder="0"
                aria-label={`จำนวน ${i.name}`}
                className={`${inputCls.replace("w-full ", "")} !h-11 w-20 text-right tabular-nums`}
              />
            </li>
          );
        })}
      </ul>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {mode === "out" && (
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} aria-label="เหตุผล">
            <option value="เบิกผลิต">เบิกผลิต</option>
            <option value="เบิกทำเสีย">เบิกทำเสีย</option>
            <option value="อื่นๆ">อื่นๆ</option>
          </select>
        )}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={mode === "in" ? "หมายเหตุ เช่น ร้านที่ซื้อ / เลขบิล" : needNote ? "หมายเหตุ (จำเป็น)" : "หมายเหตุ (ไม่บังคับ)"}
          className={`${inputCls} ${mode === "in" ? "sm:col-span-2" : ""}`}
        />
      </div>
      {over.length > 0 && (
        <p className={`mt-2 rounded-xl px-3 py-2 text-xs ${TONE.warn.bg} ${TONE.warn.text}`}>
          เบิกเกินยอดในระบบ {over.length} รายการ — ยอดจะติดลบ (ยังบันทึกได้ แต่ควรนับจริงก่อน)
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onClose} className={`${btnNeutral} flex-1`}>
          ยกเลิก
        </button>
        <button type="button" disabled={busy || !lines.length || (needNote && !note.trim())} onClick={submit} className={`${btnPrimary} flex-1`}>
          {busy ? "กำลังบันทึก…" : `${mode === "in" ? "รับเข้า" : "เบิก"} ${fmtN(lines.length)} รายการ`}
        </button>
      </div>
    </Modal>
  );
}

/**
 * วัสดุแฝงของสินค้า — ของที่ทุกชิ้นใช้แต่ลูกค้าไม่ได้เลือก (กรอบรูปจิ๊กซอร์ อะคริลิค: ขาตั้ง 1 + หมุด 4)
 * ผูก SKU เดิม (หมุดตัวเดียวใช้หลายสินค้าได้) หรือสร้างใหม่ · ตั้งจำนวนต่อสินค้า 1 ชิ้น
 */
function BomModal({
  product,
  items,
  images,
  allParts,
  onClose,
  onChanged,
  onDone,
}: {
  product: { id: string; name: string };
  items: Item[];
  images: Record<string, string>;
  allParts: string[];
  onClose: () => void;
  onChanged: (it: Item) => void;
  onDone: () => void;
}) {
  const current = items.filter((i) => (i.bomFor?.[product.id] ?? 0) > 0);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Item | null>(null);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("ชิ้น");
  const [newPart, setNewPart] = useState("วัสดุแฝง");
  const [per, setPer] = useState("1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [changed, setChanged] = useState(false);

  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    return items.filter((i) => !current.some((c) => c.id === i.id) && matchItem(i, n)).slice(0, 8);
  }, [items, q, current]);

  async function call(method: "POST" | "DELETE", body: object) {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/stock/bom", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id, ...body }) });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "บันทึกไม่สำเร็จ");
      return false;
    }
    onChanged(j.item);
    setChanged(true);
    return true;
  }

  async function addNow() {
    const n = Number(per);
    const ok = pick
      ? await call("POST", { stockItemId: pick.id, per: n })
      : await call("POST", { per: n, create: { name: newName.trim(), unit: newUnit.trim() || "ชิ้น", part: newPart.trim() || undefined } });
    if (ok) {
      setPick(null);
      setQ("");
      setNewName("");
      setPer("1");
    }
    return ok;
  }
  const add = () => void addNow();

  const perOk = Number(per) > 0;
  const canAdd = perOk && (pick || newName.trim());

  return (
    <Modal title="วัสดุแฝง" subtitle={`${product.name} — ของที่ทุกชิ้นใช้ แต่ไม่มีในตัวเลือกให้ลูกค้าเลือก`} onClose={changed ? onDone : onClose}>
      {err && <p className={`mb-3 rounded-xl px-3 py-2 text-xs ${TONE.danger.bg} ${TONE.danger.text}`}>{err}</p>}

      <p className={labelCls}>ตัดทุกครั้งที่ขายสินค้านี้ 1 ชิ้น</p>
      {current.length === 0 ? (
        <p className="mt-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-400">ยังไม่มี — เพิ่มด้านล่าง เช่น ขาตั้ง 1 ชิ้น, หมุด 4 ชิ้น</p>
      ) : (
        <ul className="mt-1.5 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {current.map((i) => (
            <li key={i.id} className="flex min-h-[52px] items-center gap-2.5 px-3 py-2">
              <Thumb src={images[i.id]} name={i.name} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{i.name}</span>
                <span className="block text-[11px] text-slate-400">
                  คงเหลือ {fmtN(i.balance)} {i.unit}
                  {Object.keys(i.bomFor ?? {}).length > 1 ? ` · ใช้ร่วม ${Object.keys(i.bomFor ?? {}).length} สินค้า` : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-[12px] text-slate-500">
                ×
                <input
                  defaultValue={String(i.bomFor?.[product.id] ?? 1)}
                  inputMode="decimal"
                  aria-label={`จำนวน ${i.name} ต่อชิ้น`}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (n > 0 && n !== i.bomFor?.[product.id]) void call("POST", { stockItemId: i.id, per: n });
                  }}
                  className={`${inputCls.replace("w-full ", "")} !h-10 w-16 text-right tabular-nums`}
                />
                {i.unit}
              </span>
              <button type="button" disabled={busy} onClick={() => void call("DELETE", { stockItemId: i.id })} className={`${btnSmGhost} ${TONE.danger.text}`}>
                ถอด
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 rounded-xl border border-slate-200 p-3">
        <p className={labelCls}>เพิ่มวัสดุ</p>
        {pick ? (
          <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
            <Thumb src={images[pick.id]} name={pick.name} size={32} />
            <span className="min-w-0 flex-1 truncate text-sm">{pick.name}</span>
            <button type="button" onClick={() => setPick(null)} className={btnSmGhost}>
              เปลี่ยน
            </button>
          </div>
        ) : (
          <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นวัสดุที่มีอยู่แล้ว เช่น หมุด ขาตั้ง…" className={`${inputCls} mt-1.5`} />
            {q.trim() && (
              <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                {hits.map((i) => (
                  <li key={i.id}>
                    <button type="button" onClick={() => setPick(i)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50">
                      <Thumb src={images[i.id]} name={i.name} size={28} />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{i.name}</span>
                      <span className="text-[11px] text-slate-400">{i.unit}</span>
                    </button>
                  </li>
                ))}
                {hits.length === 0 && <li className="px-3 py-2.5 text-center text-xs text-slate-400">ไม่พบ — กรอกเป็นวัสดุใหม่ด้านล่าง</li>}
              </ul>
            )}
            <p className="mt-2.5 text-[11px] text-slate-400">หรือสร้างวัสดุใหม่</p>
            <div className="mt-1 grid grid-cols-[1fr_5.5rem] gap-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ชื่อ เช่น ขาตั้งกรอบอะคริลิค" className={inputCls} />
              <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="หน่วย" className={inputCls} aria-label="หน่วย" />
            </div>
            <input value={newPart} onChange={(e) => setNewPart(e.target.value)} list="stock-parts-bom" placeholder="ชนิดของ" className={`${inputCls} mt-2`} aria-label="ชนิดของ" />
            <datalist id="stock-parts-bom">
              {allParts.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </>
        )}
        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-sm text-slate-600">ใช้ต่อสินค้า 1 ชิ้น</span>
          <input
            value={per}
            onChange={(e) => setPer(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            className={`${inputCls.replace("w-full ", "")} !h-11 w-20 text-right tabular-nums`}
            aria-label="จำนวนต่อสินค้า 1 ชิ้น"
          />
          <span className="text-sm text-slate-500">{pick?.unit ?? (newUnit || "ชิ้น")}</span>
          <button type="button" disabled={busy || !canAdd} onClick={add} className={`${btnPrimary} ml-auto`}>
            {busy ? "กำลังบันทึก…" : "เพิ่ม"}
          </button>
        </div>
      </div>

      {canAdd && (
        <p className={`mt-3 rounded-xl px-3 py-2 text-xs ${TONE.warn.bg} ${TONE.warn.text}`}>
          ยังไม่ได้กด “เพิ่ม” — กด “บันทึกแล้วปิด” ระบบจะเพิ่มให้ก่อนปิด
        </p>
      )}
      <div className="mt-4">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            // กรอกค้างไว้แล้วกดปิด = ตั้งใจจะเพิ่ม (เคยเกิด: กรอกครบกด "เสร็จ" แล้วของไม่ถูกเพิ่ม)
            if (canAdd && !(await addNow())) return;
            if (changed || canAdd) onDone();
            else onClose();
          }}
          className={`${btnNeutral} w-full`}
        >
          {canAdd ? "บันทึกแล้วปิด" : "เสร็จ"}
        </button>
      </div>
    </Modal>
  );
}

/**
 * เปลี่ยนรูปวัสดุ 3 ทาง: วางรูปที่คัดลอกมา (คลิกขวารูปในเว็บซัพพลายเออร์ → คัดลอกรูปภาพ → Ctrl/⌘+V) · วางลิงก์รูป · เลือกไฟล์
 * ดึงรูปจาก Shopee ให้เองไม่ได้ — Shopee บังคับหน้ายืนยันตัวตนกับเครื่องที่ไม่ใช่คน (ลอง 19 ก.ย. 69)
 * อัปโหลดผ่าน /api/admin/upload ตัวเดิม (ย่อรูปก่อนส่ง · ต้องมีสิทธิ์จัดการสินค้า/ตั้งค่า)
 */
function ImagePanel({ onSave, onClose }: { onSave: (url: string) => Promise<unknown>; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  /** ลิงก์หน้าสินค้า (ไม่ใช่ลิงก์รูป) — ใส่ไปก็ไม่ขึ้นรูป ต้องบอกให้ชัด */
  const isPageLink = (u: string) => /shp\.ee|shopee\.co\.th\/(product|[^/]+-i\.)|lazada\.co\.th\/products|tiktok\.com/i.test(u);
  const isHttp = (u: string) => /^https?:\/\//i.test(u.trim());

  async function upload(f: Blob, name = "paste.png") {
    setBusy(true);
    setErr("");
    setNote("กำลังอัปโหลดรูป…");
    try {
      const file = f instanceof File ? f : new File([f], name, { type: f.type || "image/png" });
      const small = await shrinkImageFile(file, { maxEdge: 800, minBytes: 150 * 1024 });
      const form = new FormData();
      form.append("file", small);
      form.append("productId", "stock");
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.url) {
        setNote("");
        setErr(res.status === 403 ? "บัญชีนี้อัปโหลดรูปไม่ได้ — คลิกขวาที่รูป → คัดลอกที่อยู่รูปภาพ แล้ววางลิงก์แทน" : j?.error ?? "อัปโหลดไม่สำเร็จ");
        return;
      }
      await onSave(j.url);
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  async function useLink(u: string) {
    const v = u.trim();
    if (isPageLink(v)) {
      setErr("นี่คือลิงก์หน้าสินค้า ไม่ใช่ลิงก์รูป — เปิดหน้านั้น คลิกขวาที่รูป → “คัดลอกรูปภาพ” หรือ “คัดลอกที่อยู่รูปภาพ” แล้ววางใหม่");
      return;
    }
    if (!isHttp(v)) {
      setErr("ลิงก์รูปต้องขึ้นต้นด้วย https://");
      return;
    }
    setBusy(true);
    setErr("");
    await onSave(v);
    setBusy(false);
  }

  /**
   * อ่านรูปจากสิ่งที่วาง/ลากมา — รองรับทุกทางที่เบราว์เซอร์ส่งมา:
   *  files (Chrome คัดลอกรูป) · items getAsFile (Safari) · HTML ที่มี <img src> (คัดลอกทั้งส่วนของหน้าเว็บ) · ข้อความที่เป็นลิงก์
   * ⚠️ เดิมอ่านแค่ files → Safari วางแล้วเงียบ ไม่มีอะไรเกิดขึ้น (19 ก.ย. 69)
   */
  async function takeFrom(dt: DataTransfer | null) {
    if (!dt) return false;
    const file =
      [...dt.files].find((x) => x.type.startsWith("image/")) ??
      [...dt.items].find((it) => it.kind === "file" && it.type.startsWith("image/"))?.getAsFile() ??
      null;
    if (file) {
      await upload(file, file.name || "paste.png");
      return true;
    }
    const html = dt.getData("text/html");
    const src = html && /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1];
    if (src && isHttp(src)) {
      setUrl(src);
      await useLink(src);
      return true;
    }
    const text = (dt.getData("text/uri-list") || dt.getData("text/plain")).trim().split(/\s+/)[0] ?? "";
    if (text && isHttp(text)) {
      setUrl(text);
      await useLink(text);
      return true;
    }
    return false;
  }

  /** ปุ่ม "วางจากคลิปบอร์ด" — ใช้ตอนวางด้วยแป้นแล้วไม่ติด (ต้องกดอนุญาตครั้งแรก) */
  async function readClipboard() {
    setErr("");
    try {
      const entries = await navigator.clipboard.read();
      for (const it of entries) {
        const t = it.types.find((x) => x.startsWith("image/"));
        if (t) return void (await upload(await it.getType(t)));
      }
      for (const it of entries) {
        if (it.types.includes("text/plain")) {
          const txt = (await (await it.getType("text/plain")).text()).trim();
          if (txt) {
            setUrl(txt);
            return void (await useLink(txt));
          }
        }
      }
      setErr("คลิปบอร์ดไม่มีรูป — คลิกขวาที่รูปในหน้าเว็บ → “คัดลอกรูปภาพ” ก่อน");
    } catch {
      setErr("เบราว์เซอร์ไม่ให้อ่านคลิปบอร์ด — กด ⌘V ในช่องด้านล่างแทน หรือเลือกไฟล์รูป");
    }
  }

  return (
    <div
      className="border-b border-slate-100 bg-slate-50/70 px-5 py-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={async (e) => {
        e.preventDefault();
        if (!(await takeFrom(e.dataTransfer))) setErr("ลากมาแล้วไม่เจอรูป — ลองลากตัวรูปจากหน้าเว็บ หรือไฟล์รูปจากเครื่อง");
      }}
    >
      <p className="text-xs font-semibold text-slate-600">เปลี่ยนรูป</p>
      <p className="mt-0.5 text-[11px] text-slate-400">
        คลิกขวารูปในหน้าเว็บ → “คัดลอกรูปภาพ” แล้วกด ⌘V ในช่องด้านล่าง · หรือลากรูปมาวางตรงนี้ · หรือวางลิงก์รูป
      </p>
      <div className="mt-2 flex gap-2">
        <input
          autoFocus
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setErr("");
          }}
          onPaste={async (e) => {
            const dt = e.clipboardData;
            const hasImage = [...dt.items].some((it) => it.kind === "file") || /<img/i.test(dt.getData("text/html"));
            if (!hasImage) return; // ข้อความธรรมดา → ปล่อยให้ลงช่องตามปกติ แล้วกด "ใช้ลิงก์"
            e.preventDefault();
            if (!(await takeFrom(dt))) setErr("วางแล้วไม่เจอรูป — ลองกด “วางจากคลิปบอร์ด” หรือเลือกไฟล์รูป");
          }}
          onKeyDown={(e) => e.key === "Enter" && url.trim() && void useLink(url)}
          placeholder="⌘V วางรูป หรือลิงก์รูป https://…"
          className={inputCls}
          aria-label="วางรูปหรือลิงก์รูป"
        />
        <button type="button" disabled={busy || !url.trim()} onClick={() => void useLink(url)} className={btnSmNeutral}>
          ใช้ลิงก์
        </button>
      </div>
      {err && <p className={`mt-2 rounded-lg px-2.5 py-1.5 text-[11px] ${TONE.danger.bg} ${TONE.danger.text}`}>{err}</p>}
      {note && !err && <p className="mt-2 text-[11px] text-slate-500">{note}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => void readClipboard()} className={btnSmNeutral}>
          วางจากคลิปบอร์ด
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f, f.name);
          }}
        />
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={btnSmNeutral}>
          {busy ? "กำลังบันทึก…" : "เลือกไฟล์รูป"}
        </button>
        <button type="button" onClick={onClose} className={`${btnSmGhost} ml-auto`}>
          ปิด
        </button>
      </div>
    </div>
  );
}
