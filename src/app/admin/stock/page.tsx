"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import ImageLightbox from "@/components/ImageLightbox";
import { shrinkImageFile } from "@/lib/shrink-image";
import { useCan, useIsAdministrator } from "@/lib/perm-context";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { BOM_PART, type StockSuggest, type StockUsage } from "@/lib/stock-match";
import { publicRateLabelOf, ruleWhenMatches, type OptionRule } from "@/lib/products";
import {
  badge,
  btnNeutral,
  btnPrimary,
  btnSmDanger,
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
 * โครงหน้า (รื้อใหม่ 30 ก.ย. 69 — เจ้าของร้านขอให้ใช้ง่าย/เข้าใจง่าย):
 *   หัว = ปุ่มงานประจำ รับเข้า/เบิกของ/เพิ่มวัสดุ · ของตั้งค่าอยู่ในเมนู ⋯
 *   "ต้องทำตอนนี้" 4 กล่อง (ติดลบ → ต้องสั่ง → รอตรวจ → ยังไม่ผูก) กดแล้วกรอง · "ตั้งค่าคลังให้ครบ" = แถบ % งานตั้งต้น
 *   แถบเครื่องมือติดขอบบน: คลัง | ประวัติ + ค้นหา + ชิปสถานะ · กลุ่มตามสินค้า (ปุ่มตั้งค่าอยู่ในเมนู ⋯ ของกลุ่ม)
 */

/** แท็บในลิ้นชักวัสดุ: ภาพรวม (ยอด/รับเข้า/ผูก) · แก้ไขข้อมูล (ฟอร์มเต็มในลิ้นชัก) · ประวัติ */
type DrawerTab = "overview" | "edit" | "history";

/** ชื่อกลุ่มตัวเลือกแบบสั้น (ตัดวงเล็บท้าย) — "สีไหม Madeira (รวมในราคา 3 สี)" → "สีไหม Madeira" · สูตรเดียวกับ split route */
const shortOptionLabel = (s: string) => s.replace(/\s*[(（].*$/, "").trim() || s;

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
  /** 📦 งานขายเป็นเซ็ต { productId: ตัดกี่หน่วยต่อ 1 ที่ลูกค้าสั่ง } — 1 ชุด = 2 ชิ้น */
  productQtyPer?: Record<string, number>;
  /** 🚫 ไม่ต้องมีสต๊อก — ไม่เตือน ไม่นับมูลค่า ไม่ตัดยอดตอนขาย (อยู่ในชิป "ไม่ต้องมี stock" กู้กลับได้) */
  noStock?: boolean;
  /** 📦 หน่วยแพ็ค: 1 packUnit = packSize หน่วยฐาน (unit) · ยอดยังเป็นหน่วยฐาน หน้าจอแปลงให้ (ดู packText) */
  packUnit?: string;
  packSize?: number;
  /** 🏭 ของใช้ในโรงงาน เบิกเองอย่างเดียว — ไม่ผูกสินค้า ไม่เตือน "ยังไม่ผูก" */
  manualOnly?: boolean;
  /** 🧩 วัสดุกลางตามตัวเลือก — มุมมองตามสินค้าจัดกลุ่มใต้ชื่อกลุ่มตัวเลือก (ประเภทอะคริลิค) ไม่ใช่ชื่อสินค้า · ยังผูก/ตัดตามตัวเลือกปกติ */
  groupByOption?: boolean;
  /** ⧉ ทำซ้ำมาจาก SKU ไหน — ยังไม่ผูกอะไรก็ให้อยู่กลุ่มเดียวกับต้นแบบไปก่อน (ดู groups) */
  cloneOf?: string;
  /** ↕ ลำดับที่ลากจัดเองในกลุ่ม (เลขน้อยขึ้นก่อน · ไม่มี = ท้ายสุด เรียงชื่อ) */
  sort?: number;
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
/** ของตัวนี้นับเป็นแพ็คได้ไหม (ตั้ง packSize > 1 ไว้) */
const hasPack = (it: { packSize?: number }) => (it.packSize ?? 0) > 1;
/**
 * 📦 แปลงยอดหน่วยฐานเป็น "แพ็ค + เศษ" ไว้แสดง: 340 แผ่น (1 แพ็ค = 100) → "3 แพ็ค + 40 แผ่น" · ติดลบ → "−3 แพ็ค + 40 แผ่น"
 * ไม่ได้ตั้งแพ็ค = null (ไม่ต้องแสดงบรรทัดนี้)
 */
const packText = (it: { unit: string; packUnit?: string; packSize?: number }, n: number): string | null => {
  if (!hasPack(it)) return null;
  const size = it.packSize!;
  const abs = Math.abs(n);
  const packs = Math.floor(abs / size);
  const rest = abs % size;
  const pu = it.packUnit || "แพ็ค";
  const s = packs ? `${fmtN(packs)} ${pu}${rest ? ` + ${fmtN(rest)} ${it.unit}` : ""}` : `${fmtN(rest)} ${it.unit}`;
  return n < 0 ? `−${s}` : s;
};
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
/** 4 มุมมอง: คลัง (รายการ) · รับเข้า · เบิกของ · ประวัติ — รับเข้า/เบิกของเคยเป็นฟอร์มเด้ง (Modal) ในโครงใหม่ 30 ก.ย. 69 แต่เจ้าของร้านขอเป็นหน้าเต็ม (ฟอร์ม+รายการล่าสุดยาว เลื่อนใน popup ไม่สะดวก) */
const TABS = ["รายการสินค้า", "รับเข้า", "เบิกของ", "ประวัติ"] as const;
type Tab = (typeof TABS)[number];
type Filter = "ทั้งหมด" | "ติดลบ" | "ต้องสั่ง" | "ใกล้หมด" | "รอตรวจ" | "ยังไม่ผูก" | "ยังไม่ตั้งจุดสั่ง" | "ไม่ต้องมีสต๊อก";
/** สินค้าให้เลือกผูกในฟอร์มแก้ไข SKU */
interface ProductLite {
  id: string;
  name: string;
  img?: string;
  draft?: boolean;
  /** ลิงก์ตามชื่อของหน้าสินค้า (data.slug) — ใช้จับคู่ตอนวางลิงก์ */
  slug?: string;
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
  /** bom: สินค้าที่แถวแม่ผูกอยู่และวัสดุแฝงตัวนี้ตัดด้วย — ถอดจากลิ้นชักแถวแม่ได้ทีละสินค้า */
  bomFor?: { productId: string; productName: string }[];
};

/** ติ๊ก "จัดแล้ว" ของกลุ่มหนึ่ง — ใครติ๊กและติ๊กเมื่อไหร่ */
type GroupDone = { at: string; by: string };
/**
 * ระยะเยื้อง (px) ของแถวในกลุ่มสินค้า — ทุกแถวเริ่มตรงกับ "รูปหัวกลุ่ม" พอดี ไม่ยื่นออกมาทางซ้าย
 * หัวกลุ่ม: เว้นซ้าย 20 + ลูกศร 12 + gap 12 → รูปเริ่มที่ 44 (เดิม 92 ตอนยังมีช่องติ๊ก 26 + gap 12 อยู่หน้าชื่อ)
 * (เจ้าของร้านขีดเส้นกำกับให้ 22 ก.ย. 69 — เดิมแถวเริ่มที่ 10 เลยยื่นไปซ้ายกว่าทุกอย่างในหัวกลุ่ม)
 */
const ROW_PAD = 44; // โครงใหม่ 30 ก.ย. 69: ไม่มีช่องติ๊กหน้าชื่อแล้ว (ย้ายเป็นป้าย "จัดแล้ว" ฝั่งขวา) → 20 + 12 + 12 = 44
/**
 * ค้นสินค้าจากข้อความที่พิมพ์/วาง — รับได้ทั้งชื่อ รหัสสินค้า และ "ลิงก์หน้าสินค้า" ที่ก๊อปจากเบราว์เซอร์
 * ลิงก์หน้าร้านเป็น /products/<ชื่อคั่นด้วยขีด> และถูก encode มาเป็น %E0%B8%81… วางแล้วค้นไม่เจอทุกที
 * (เจ้าของร้านแจ้ง 23 ก.ย. 69 — วางลิงก์ "กรอบรูปจิ๊กซอร์-อะคริลิค" แล้วขึ้น "ไม่พบสินค้าที่ตรง")
 */
const flatText = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
function matchProductQuery(p: { id: string; name: string; slug?: string }, raw: string): boolean {
  const q = raw.trim();
  if (!q) return false;
  let seg = q;
  if (/\/products\//.test(q)) {
    const last = q.split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop() ?? "";
    try {
      seg = decodeURIComponent(last);
    } catch {
      seg = last; // ลิงก์ที่ encode มาไม่ครบ — ใช้ของดิบไปก่อน ดีกว่าค้นไม่ได้เลย
    }
  }
  const n = seg.toLowerCase();
  // ลิงก์ตามชื่อ (slug) ตรงตัว = สินค้านี้แน่นอน (เจ้าของร้านวางลิงก์ อาร์มปัก แล้วขึ้น "ไม่พบ" 30 ก.ย. 69 — ชื่อมีวงเล็บ slug ไม่มี)
  if (p.slug && (p.slug.toLowerCase() === n || flatText(p.slug) === flatText(seg))) return true;
  if (p.name.toLowerCase().includes(n) || p.id.toLowerCase().includes(n)) return true;
  const f = flatText(seg);
  return !!f && (flatText(p.name).includes(f) || flatText(p.id).includes(f));
}
/** แถว "วัสดุแฝง" ที่ห้อยใต้แถวแม่ — เยื้องจากแถวแม่อีก 46 · ก้านเส้นตั้งอยู่กลางรูปย่อแถวแม่ (รูป 44 → +22) */
const NEST_PAD = ROW_PAD + 46;
const NEST_RAIL = ROW_PAD + 22;
type DoneFilter = "ทั้งหมด" | "ยังไม่จัด" | "จัดแล้ว";

export default function StockPage() {
  const can = useCan();
  const mayEdit = can("orders.edit");
  /** 🧹 รีเซ็ตยอดเป็น 0 ทำได้เฉพาะเจ้าของร้าน (Administrator) — API /stock/reset ตรวจซ้ำฝั่งเซิร์ฟเวอร์ */
  const isOwner = useIsAdministrator();
  const [tab, setTab] = useState<Tab>("รายการสินค้า");
  const [items, setItems] = useState<Item[]>([]);
  /**
   * ↕ ลากจัดลำดับแถวในกลุ่มด้วยเมาส์ (เจ้าของร้านขอ 1 ต.ค. 69 — อะคริลิคใส 10/1.5/1/2/3/5 mm เรียงตามตัวอักษรไม่ตรงความหนา)
   * dragArmed = แถวที่กดมือจับ ⠿ ค้างไว้ (ทั้งแถวถึงจะลากได้ ไม่ให้ลากเผลอตอนกดเปิดลิ้นชัก) · dragId = กำลังลาก · dragOver = แถวที่ชี้อยู่
   * ปล่อย = เรียง ids ของกลุ่มใหม่ → เขียน sort ทันทีในหน้า (optimistic) → POST /api/admin/stock/sort · พลาด = โหลดใหม่
   */
  const [dragArmed, setDragArmed] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  /** ลำดับที่ลากจัด (sort) มาก่อน · ไม่มี sort = ท้ายสุด เรียงชื่อแบบตัวเลข (1 mm, 1.5 mm, 2 mm, 10 mm) */
  const bySort = (a: Item, b: Item) => (a.sort ?? 1e9) - (b.sort ?? 1e9) || a.name.localeCompare(b.name, "th", { numeric: true });
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
  /** แท็บในลิ้นชัก — "แก้ไขข้อมูล" อยู่ในลิ้นชักเดียวกัน ไม่เด้งไปหน้าเต็ม (เจ้าของร้านขอ 1 ต.ค. 69) */
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("overview");
  const openDrawer = (id: string, tab: DrawerTab = "overview") => {
    setDrawerTab(tab);
    setOpenId(id);
  };
  /** ⧉ แถวที่เพิ่งทำซ้ำ — ไฮไลต์ชั่วครู่ให้เห็นว่าโผล่ตรงไหน */
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 4000);
    return () => clearTimeout(t);
  }, [flashId]);
  const [editFor, setEditFor] = useState<Item | null>(null);
  const [countFor, setCountFor] = useState<Item | null>(null);
  /** 🗑↩ โมดัล "ที่ลบไปแล้ว" — กู้คืน SKU ที่ลบผิดตัว (เดิมกู้ได้แค่แก้ Firestore เอง) */
  const [deletedOpen, setDeletedOpen] = useState(false);
  /** 🗂 หน้าต่างจัดการหมวด (เพิ่ม/เปลี่ยนชื่อ/ลบ) + รายชื่อหมวดที่เก็บไว้ (stockMeta/categories) */
  const [catsOpen, setCatsOpen] = useState(false);
  /** 🗂 หน้าต่างย้ายหมวด — รายการที่จะย้าย + ชื่อชุด (ทั้งกลุ่ม หรือตัวเดียวจากลิ้นชัก) */
  const [moveCatFor, setMoveCatFor] = useState<{ items: Item[]; title: string } | null>(null);
  const [catList, setCatList] = useState<string[]>([]);
  const loadCats = useCallback(async () => {
    const res = await fetch("/api/admin/stock/categories");
    const j = await res.json().catch(() => null);
    if (res.ok && j?.ok) setCatList(j.names ?? []);
  }, []);
  useEffect(() => {
    void loadCats();
  }, [loadCats]);
  const [addOpen, setAddOpen] = useState(false);
  /** สินค้าที่กำลังแยกสต๊อกตามตัวเลือก */
  const [splitFor, setSplitFor] = useState<{ id: string; name: string } | null>(null);
  /** สินค้าที่กำลังจัดวัสดุแฝง */
  const [bomFor, setBomFor] = useState<{ id: string; name: string } | null>(null);
  /** เลือกสินค้าก่อนเปิดวัสดุแฝง (ทางเดิม — สินค้าที่ยังไม่มีกลุ่มในคลังก็ตั้งได้) */
  const [bomPick, setBomPick] = useState(false);
  /** 🔩 คลังวัสดุแฝงกลาง (ปุ่มบนหัวหน้า) — สร้างโดยไม่ต้องเลือกสินค้าก่อน แล้วผูกหลายสินค้าทีเดียว */
  const [bomLib, setBomLib] = useState(false);
  /** รับเข้า/เบิกทั้งชุด (กลุ่มย่อยตามชนิดของ) */
  const [bulkFor, setBulkFor] = useState<{ items: Item[]; title: string; mode: "in" | "out" } | null>(null);
  /** 📥 ฟอร์มรับเข้า/เบิกของ (เดิมเป็นแท็บ) — เด้งจากปุ่มหัวหน้า ทำเสร็จกลับมาหน้ารายการเดิม */
  /** เมนู ⋯ ที่กำลังเปิด (หัวหน้า = "head" · กลุ่ม = "g:<key>") เปิดได้ทีละอัน */
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  /** มือถือ: กางช่องเลือกหมวด/ตระกูล/เรียง/มุมมอง (เดสก์ท็อปโชว์เสมอ) */
  const [moreFilters, setMoreFilters] = useState(false);
  /** 🔗 แกนกรองแยก "ผูกกับสินค้าแล้ว / ไม่ผูก" (เจ้าของร้านขอ 30 ก.ย. 69) — ซ้อนกับชิปสถานะได้ (คนละแกน) */
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "unlinked">("all");
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
  /** ⚠️ ยอดติดลบ = ขายตัดไปแล้วแต่ไม่เคยรับเข้า — ตัวเลขเชื่อไม่ได้จนกว่าจะนับจริง (30 ก.ย. 69 มี 37 ตัว) มาก่อนทุกสถานะ */
  const negative = useMemo(() => tracked.filter((i) => i.balance < 0), [tracked]);
  /** ยังไม่ตั้งจุดสั่ง (และไม่มีสถิติให้เดา) = ระบบเตือน "ต้องสั่ง" ให้ไม่ได้ — ต้องบอกให้เห็น ไม่ใช่โชว์ "ต้องสั่ง 0" เฉย ๆ */
  const unsetPoint = useMemo(() => tracked.filter((i) => stats.get(i.id)?.point == null), [tracked, stats]);
  const toReview = useMemo(() => tracked.filter((i) => i.needsReview), [tracked]);
  // "วัสดุแฝง" ต้องมีให้เลือกเสมอ — ตั้งชนิดนี้ = เข้าคลังวัสดุแฝงกลาง ทุกช่องเลือกวัสดุจะเสนอมันก่อน
  const allParts = useMemo(() => [...new Set([BOM_PART, ...(items.map((i) => i.part).filter(Boolean) as string[])])].sort((a, b) => a.localeCompare(b, "th")), [items]);
  /** การเชื่อมที่ "ใช้ได้จริง" — ตัดลิงก์ตายออก (ผูกกับรหัสสินค้าที่ถูกลบ/เปลี่ยนรหัสไปแล้ว ขายยังไงก็ไม่ตัด) */
  const live = useMemo(() => {
    const out: Record<string, StockUsage[]> = {};
    for (const [id, us] of Object.entries(usage)) out[id] = us.filter((u) => !(u.kind === "product" && u.missing));
    return out;
  }, [usage]);
  /**
   * 🔩 อยู่ใน "คลังวัสดุแฝงกลาง" — ติดชนิดของ "วัสดุแฝง" ไว้ · เป็นวัสดุแฝงของสินค้า (bomFor) · หรือของตัวเลือก (stockLinks)
   * ชุดเดียวกับที่ BomLibraryModal แสดง และที่ช่องเลือกวัสดุทุกจุดเสนอก่อน
   */
  const isLib = useCallback(
    (i: Item) => i.part?.trim() === BOM_PART || Object.keys(i.bomFor ?? {}).length > 0 || (live[i.id] ?? []).some((u) => u.kind === "choice" && !!u.extra),
    [live],
  );
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
  const prodNameOf = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  /** ชื่อสั้นไว้เขียนกำกับ — ตัด "(ชื่อสินค้า)" ท้ายชื่อทิ้ง อ่านง่ายขึ้นในประโยค */
  const shortName = (id: string) => (nameOfId.get(id) ?? "?").replace(/\s*\([^()]*\)\s*$/, "");

  /** ยังไม่เชื่อมกับสินค้า/ตัวเลือกไหนเลย = ขายแล้วสต๊อกตัวนี้ไม่ขยับ */
  const unlinked = useMemo(() => (linksReady ? tracked.filter((i) => !i.manualOnly && !live[i.id]?.length) : []), [tracked, live, linksReady]);
  /** ของที่ควรผูกกับสินค้า (ตัดของใช้ในโรงงานที่เบิกเองอย่างเดียวออก) — ตัวหารของขั้น "ผูกวัสดุกับสินค้า" */
  const linkable = useMemo(() => tracked.filter((i) => !i.manualOnly), [tracked]);

  /** รายการหมวด/ตระกูลที่มีจริงในคลัง — ตระกูลตามหมวดที่เลือกอยู่ ไม่ให้เลือกคู่ที่ไม่มีของ */
  // หมวด = รายชื่อที่เก็บไว้ (จัดการได้จากเมนู ⋯ → จัดการหมวด) ∪ หมวดที่พิมพ์ค้างในวัสดุ
  const cats = useMemo(
    () => [...new Set([...catList, ...(items.map((i) => i.category).filter(Boolean) as string[])])].sort((a, b) => a.localeCompare(b, "th")),
    [items, catList]
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
    else if (filter === "ติดลบ") list = negative;
    else if (filter === "ยังไม่ตั้งจุดสั่ง") list = unsetPoint;
    if (linkFilter !== "all" && linksReady) list = list.filter((i) => ((live[i.id]?.length ?? 0) > 0) === (linkFilter === "linked"));
    if (cat !== "ทุกหมวด") list = list.filter((i) => i.category === cat);
    // ค้นชื่อสินค้าที่ใช้วัสดุนี้ได้ด้วย — "ปั๊มนูน" ต้องเจอ "ฐาน Griptok · สีขาว" (ชื่อ SKU ไม่มีคำนั้น · เจ้าของร้านหาไม่เจอ 30 ก.ย. 69)
    if (needle) {
      // ขั้นแรก: ตัว SKU เองตรง → เอาแค่นั้น · ไม่มีเลย → ถอยไปหาผ่านตระกูล/หมวด/ชื่อสินค้าที่ผูก
      const direct = list.filter((i) => matchItemDirect(i, needle));
      list = direct.length
        ? direct
        : list.filter((i) => matchItem(i, needle) || (live[i.id] ?? []).some((u) => u.kind !== "preset" && u.productName.toLowerCase().includes(needle)));
    }
    const rank: Record<string, number> = { danger: 0, warn: 1, neutral: 2, ok: 3, review: 4 };
    return [...list].sort((a, b) => {
      const sa = stats.get(a.id);
      const sb = stats.get(b.id);
      if (sort === "name") return a.name.localeCompare(b.name, "th");
      if (sort === "balance") return a.balance - b.balance;
      if (sort === "daysLeft") return (sa?.daysLeft ?? 1e9) - (sb?.daysLeft ?? 1e9);
      // "มีปัญหาก่อน": ติดลบขึ้นก่อนทุกอย่าง (ยอดเชื่อไม่ได้) แล้วค่อยไล่ตามระดับเตือน
      const na = a.balance < 0 ? 0 : 1;
      const nb = b.balance < 0 ? 0 : 1;
      if (na !== nb) return na - nb;
      return (
        (rank[sa?.level ?? "neutral"] ?? 9) - (rank[sb?.level ?? "neutral"] ?? 9) || a.name.localeCompare(b.name, "th")
      );
    });
  }, [tracked, untracked, q, cat, filter, sort, needOrder, nearLow, negative, unsetPoint, toReview, unlinked, stats, live, linkFilter, linksReady]);

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

  /** id ของ SKU ที่เพิ่งบันทึกล่าสุด — ใช้ตอน "ทำซ้ำ" เปิดลิ้นชักตัวใหม่ให้ต่อทันที (ตัวใหม่ยังไม่ผูกอะไร = ไม่อยู่ในกลุ่มสินค้าไหน หาเองยาก) */
  const lastSavedId = useRef<string | null>(null);
  /**
   * ⧉ ทำซ้ำ — สร้าง SKU ใหม่จากต้นแบบทันที ไม่ต้องกรอกฟอร์ม (เจ้าของร้านสั่ง 1 ต.ค. 69: "เพิ่มปกติมาอีกบรรทัดเลย" เพราะข้อมูลคล้ายต้นแบบ แก้ทีหลังด้วยปุ่มแก้ไข)
   * ก๊อป: หน่วย/ตระกูล/หมวด/แพ็ค/ทุน/จุดสั่ง/รอของ/รูป/ชนิดของ/ธง 🏭🧩 · ไม่ก๊อป: รหัส ชื่อเคยเรียก สินค้าที่ผูก (กันตัด 2 เด้ง) · ยอด 0
   * ชื่อ = "ชื่อเดิม (สำเนา)" / "(สำเนา 2)" … · cloneOf = ต้นแบบ → โผล่ใต้กลุ่มเดียวกันทันทีแม้ยังไม่ผูกอะไร
   */
  async function duplicateItem(src: Item) {
    const taken = new Set(items.map((i) => i.name.trim()));
    let name = `${src.name} (สำเนา)`;
    for (let n = 2; taken.has(name); n += 1) name = `${src.name} (สำเนา ${n})`;
    // รหัสนับต่อจากต้นแบบ: P-ACRYLICMAGNET-1-1 → P-ACRYLICMAGNET-1-2 · รหัสไม่ลงท้ายตัวเลข (3MM) → 3MM-1 (เจ้าของร้านขอ 1 ต.ค. 69)
    const m = /^(.*?)(\d+)$/.exec(src.code ?? "");
    const codePrefix = src.code ? (m ? m[1] : `${src.code}-`) : undefined;
    const ok = await saveItem({
      name,
      codePrefix,
      unit: src.unit,
      family: src.family,
      category: src.category,
      reorderPoint: src.reorderPoint,
      leadTimeDays: src.leadTimeDays,
      unitCost: src.unitCost,
      productIds: [],
      imageUrl: src.imageUrl ?? "",
      part: src.part ?? "",
      packUnit: src.packUnit ?? "",
      packSize: src.packSize ?? 0,
      manualOnly: !!src.manualOnly,
      groupByOption: !!src.groupByOption,
      cloneOf: src.cloneOf || src.id,
    });
    if (!ok) return;
    setOk(`ทำซ้ำ “${src.name}” → “${name}” แล้ว (อยู่กลุ่มเดียวกัน ยอด 0 ยังไม่ผูกสินค้า) — กด “แก้ไข” ที่แถวใหม่เพื่อเปลี่ยนชื่อ/ผูกตัวเลือก`);
    if (lastSavedId.current) setFlashId(lastSavedId.current);
  }
  /** ↕ ย้าย fromId ไปวางที่ตำแหน่งของ toId ภายในกลุ่ม groupRows แล้วบันทึกลำดับทั้งกลุ่ม */
  async function reorderRows(groupRows: Item[], fromId: string, toId: string) {
    if (fromId === toId) return;
    const ordered = [...groupRows].sort(bySort).map((r) => r.id);
    const from = ordered.indexOf(fromId);
    const to = ordered.indexOf(toId);
    if (from < 0 || to < 0) return;
    ordered.splice(from, 1);
    ordered.splice(to, 0, fromId);
    const pos = new Map(ordered.map((id, i) => [id, i * 10]));
    setItems((prev) => prev.map((i) => (pos.has(i.id) ? { ...i, sort: pos.get(i.id) } : i)));
    setErr("");
    const res = await fetch("/api/admin/stock/sort", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ordered }) });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "บันทึกลำดับไม่สำเร็จ");
      await load();
    }
  }

  /** 🏷 แก้ชื่อหัวกลุ่มที่จัดตามตระกูล (m:/s:/n:) = เปลี่ยน family ของทุกแถวในกลุ่มทีเดียว (เจ้าของร้านขอ 1 ต.ค. 69) */
  async function renameFamily(rows: Item[], from: string, to: string) {
    const name = to.trim();
    if (!name || name === from) return false;
    setErr("");
    const res = await fetch("/api/admin/stock/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign-family", ids: rows.map((r) => r.id), name }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "เปลี่ยนชื่อไม่สำเร็จ");
      return false;
    }
    await load();
    setOk(`เปลี่ยนชื่อกลุ่ม “${from}” → “${name}” แล้ว (${fmtN(rows.length)} รายการ)`);
    return true;
  }

  async function saveItem(body: Partial<Item> & { name: string; codePrefix?: string }) {
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
    lastSavedId.current = typeof j.item?.id === "string" ? j.item.id : null;
    await load();
    void loadImages(true); // ผูกสินค้า/ลิงก์รูปเปลี่ยน → รูปในตารางต้องตาม
    return true;
  }

  /**
   * ของที่ "ห้อย" อยู่ใต้ SKU ตัวนี้ในตาราง — ชุดเดียวกับที่หน้ารายการวาดเป็นแถวลูก
   * ลิ้นชักเคยไม่โชว์เลย เปิดตัวแม่มาแล้วไม่รู้ว่ามีอะไรพ่วงอยู่ (เจ้าของร้านแจ้ง 21 ก.ย. 69)
   *   extra = ของมีเงื่อนไขที่ผูกไว้กับตัวเลือกเดียวกัน — ถอดได้จากตรงนี้ (ขอบเขตชัด: เฉพาะตัวเลือกนี้)
   *   bom   = วัสดุแฝงของสินค้าที่ SKU นี้ผูกอยู่ — ถอดได้เหมือนกัน แต่ขอบเขตเป็น "ทั้งสินค้า" จึงถามยืนยันก่อนเสมอ
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
      const bs = us.filter((u) => u.kind === "product" && u.bom && pids.has(u.productId));
      if (!bs.length || !items.some((i) => i.id === id)) continue;
      seen.add(id);
      out.push({
        id,
        name: nameOfId.get(id) ?? "?",
        img: images[id],
        kind: "bom",
        per: bs[0].kind === "product" ? bs[0].per : undefined,
        bomFor: bs.flatMap((u) => (u.kind === "product" ? [{ productId: u.productId, productName: u.productName }] : [])),
      });
    }
    return out;
  }

  /**
   * ถอดของที่ห้อยอยู่ออกจากแถวแม่ — สั่งจากลิ้นชักของ "ตัวแม่"
   *   extra = เฉพาะตัวเลือกนั้นตัวเดียว · bom = ทั้งสินค้า (ทุกชิ้นเลิกตัดวัสดุตัวนี้) จึงถามยืนยันก่อน
   */
  async function unlinkHang(h: HangRow): Promise<boolean> {
    if (h.kind === "bom") return unlinkBom(h);
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
   * ถอดวัสดุแฝงจากลิ้นชักของแถวแม่ — ขอบเขตคือ "สินค้าที่แถวแม่ผูกอยู่" ทั้งตัว ไม่ใช่แค่แถวนี้
   * (เจ้าของร้านหาปุ่มถอดไม่เจอ 22 ก.ย. 69 — เดิมบอกให้ไปถอดที่ลิ้นชักของวัสดุเอง)
   */
  async function unlinkBom(h: HangRow): Promise<boolean> {
    const list = h.bomFor ?? [];
    if (!list.length) return false;
    const names = list.map((x) => `“${x.productName}”`).join(" และ ");
    const ok = await confirm({
      icon: "🔩",
      title: `ถอด “${h.name}” ออกจาก ${names} ไหม?`,
      detail: `ทุกชิ้นของสินค้านี้จะไม่ตัด “${h.name}” อีก · ตัววัสดุกับยอดคงเหลือยังอยู่ครบ ผูกกลับได้ทุกเมื่อ${
        list.length > 1 ? `\nถอดพร้อมกัน ${list.length} สินค้า` : ""
      }`,
      confirmLabel: "ถอดวัสดุแฝง",
      danger: true,
    });
    if (ok !== true) return false;
    setErr("");
    for (const x of list) {
      const res = await fetch("/api/admin/stock/bom", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: x.productId, stockItemId: h.id }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setErr(j?.error ?? "ถอดไม่สำเร็จ");
        return false;
      }
      setItems((prev) => prev.map((i) => (i.id === h.id ? { ...i, bomFor: j.item.bomFor } : i)));
      setUsage((u) => ({ ...u, [h.id]: (u[h.id] ?? []).filter((y) => !(y.kind === "product" && y.bom && y.productId === x.productId)) }));
    }
    setOk(`ถอดแล้ว — ${names} ไม่ตัด ${h.name} อีก`);
    return true;
  }

  /**
   * 📦 งานขายเป็นเซ็ต — ตั้งว่า 1 ที่ลูกค้าสั่งตัดกี่หน่วย (CABLE CARE 1 ชุด = 2 ชิ้น)
   * ใช้กับ SKU ที่ผูกกับ "ตัวสินค้า" ตรง ๆ เท่านั้น (ผูกที่ตัวเลือกตั้งอัตราในหน้าผูกคลัง)
   */
  async function setProductPer(itemId: string, u: StockUsage, per: number): Promise<boolean> {
    if (u.kind !== "product") return false;
    setErr("");
    const res = await fetch("/api/admin/stock/per", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stockItemId: itemId, productId: u.productId, per }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "ตั้งจำนวนต่อชุดไม่สำเร็จ");
      return false;
    }
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, productQtyPer: j.item.productQtyPer } : i)));
    setUsage((m) => ({
      ...m,
      [itemId]: (m[itemId] ?? []).map((x) => (x.kind === "product" && !x.bom && x.productId === u.productId ? { ...x, per: per > 1 ? per : undefined } : x)),
    }));
    setOk(per > 1 ? `ตั้งแล้ว — ขาย ${u.productName} 1 ที่ ตัด ${per} ${items.find((i) => i.id === itemId)?.unit ?? ""}` : "กลับไปตัด 1 ต่อ 1 แล้ว");
    return true;
  }

  /**
   * 📦 งานขายเป็นเซ็ตฝั่ง "ตัวเลือก/คลังกลาง" — เข็มกลัด 1 เซ็ต (ตัวเลือกขนาด) = 10 ชิ้น
   * เขียน choice.stockQtyPer ผ่าน POST /api/admin/stock/link (body มีแค่ stockQtyPer = โหมดตั้งอัตรา · 1 = ลบคีย์)
   * ลิงก์แบบมีเงื่อนไข (extra) ไม่รับที่นี่ — จำนวนของมันอยู่ใน stockLinks[].per ต้องส่ง when กลับไปด้วย แก้ที่ฟอร์ม "ตัดเพิ่ม" แทน
   */
  async function setChoicePer(itemId: string, u: StockUsage, per: number): Promise<boolean> {
    if (u.kind === "product" || ("extra" in u && u.extra)) return false;
    setErr("");
    const body =
      u.kind === "preset"
        ? { presetId: u.presetId, choice: u.choice, stockQtyPer: per }
        : { productId: u.productId, label: u.label, optionIndex: u.optionIndex, choice: u.choice, stockQtyPer: per };
    const res = await fetch("/api/admin/stock/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "ตั้งจำนวนต่อชุดไม่สำเร็จ");
      return false;
    }
    const saved: number = j.stockQtyPer ?? 1;
    setUsage((m) => ({
      ...m,
      [itemId]: (m[itemId] ?? []).map((x) => {
        if (x.kind === "product" || x.kind !== u.kind || x.choice !== u.choice) return x;
        if (x.kind === "preset") return u.kind === "preset" && x.presetId === u.presetId ? { ...x, per: saved } : x;
        return u.kind === "choice" && x.productId === u.productId && x.optionIndex === u.optionIndex && !x.extra ? { ...x, per: saved } : x;
      }),
    }));
    const unit = items.find((i) => i.id === itemId)?.unit ?? "";
    setOk(saved > 1 ? `ตั้งแล้ว — ${u.label} = ${u.choice} สั่ง 1 ที่ ตัด ${saved} ${unit}` : "กลับไปตัด 1 ต่อ 1 แล้ว");
    return true;
  }

  /**
   * ➕ ผูก SKU ตัวนี้เป็น "ของที่ตัดเพิ่มแบบมีเงื่อนไข" ของตัวเลือกหนึ่งในสินค้า
   * เขียนลง choices[ตัวหลัก].stockLinks — คืนข้อความ error ถ้าไม่สำเร็จ (null = สำเร็จ)
   * โหลดลิงก์ใหม่ทั้งชุดหลังผูก เพราะแถวลูกที่ห้อยใต้ตัวหลักต้องคำนวณจาก usage ของอีกตัว
   */
  async function linkExtra(pl: ExtraLinkPayload): Promise<string | null> {
    setErr("");
    // ตัวหลักเป็นตัวสินค้าทั้งตัว (SKU ผูกกับทุกออเดอร์ ไม่มีตัวเลือก) → วัสดุแฝงของสินค้า (bomFor) เส้นทางเดียวกับหน้าต่าง "วัสดุแฝง" ของสินค้า
    if (pl.bom) {
      const res = await fetch("/api/admin/stock/bom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: pl.productId, stockItemId: pl.stockItemId, per: pl.per }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) return j?.error ?? "ผูกไม่สำเร็จ";
      const it = j.item as Item;
      setItems((prev) => (prev.some((i) => i.id === it.id) ? prev.map((i) => (i.id === it.id ? it : i)) : [...prev, it]));
      await loadImages(true);
      setOk(`บันทึกวัสดุแฝงแล้ว — ขาย ${products.find((p) => p.id === pl.productId)?.name ?? pl.productId} ทุกชิ้น จะตัด ${nameOfId.get(pl.stockItemId) ?? it.name} ด้วย`);
      return null;
    }
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
    setOk(`บันทึกวัสดุแฝงแล้ว — เลือก ${pl.label} = ${pl.choice} จะตัด ${nameOfId.get(pl.stockItemId) ?? ""} ด้วย${pl.when.length ? " (ตามเงื่อนไข)" : ""}`);
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

  /**
   * 🧹 รีเซ็ตยอดคงเหลือเป็น 0 — ทีละตัว (ลิ้นชัก) หรือทั้งกลุ่ม (เมนู ⋯) · เจ้าของร้านเท่านั้น (สั่ง 30 ก.ย. 69)
   * ไว้ล้างยอดติดลบตอนตั้งต้นคลัง แล้วค่อยนับจริง/รับเข้าใหม่ · ลงประวัติเป็น "ปรับยอดนับจริง" ย้อนดูได้ ไม่ลบอะไร
   */
  async function resetItems(list: Item[], label: string) {
    const targets = list.filter((i) => i.balance !== 0);
    if (!targets.length) {
      setOk(`${label} — ยอดเป็น 0 อยู่แล้วทุกตัว`);
      return;
    }
    const ok = await confirm({
      icon: "🧹",
      title: targets.length === 1 ? `รีเซ็ตยอด “${label}” เป็น 0 ไหม?` : `${label} — รีเซ็ตยอดเป็น 0 ทั้ง ${fmtN(targets.length)} รายการ?`,
      detail: `ยอดเดิม: ${targets.slice(0, 6).map((i) => `${i.name} ${fmtN(i.balance)}`).join(" · ")}${targets.length > 6 ? ` · และอีก ${fmtN(targets.length - 6)} ตัว` : ""}\nระบบจะลงประวัติเป็น “ปรับยอดนับจริง” ให้ ย้อนดูได้ว่าใครรีเซ็ตเมื่อไหร่ · ตัวที่เป็น 0 อยู่แล้วไม่ถูกแตะ`,
      confirmLabel: "รีเซ็ตเป็น 0",
      danger: true,
    });
    if (ok !== true) return;
    setErr("");
    setOk(`กำลังรีเซ็ต ${fmtN(targets.length)} รายการ…`);
    // ส่งเป็นชุดละ 400 (API รับครั้งละไม่เกิน 500) — "ทุกรายการ" มีหลายร้อยตัว
    let done = 0;
    for (let i = 0; i < targets.length; i += 400) {
      const res = await fetch("/api/admin/stock/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: targets.slice(i, i + 400).map((x) => x.id) }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setOk("");
        setErr(`${j?.error ?? "รีเซ็ตไม่สำเร็จ"}${done ? ` — ทำไปแล้ว ${fmtN(done)} รายการ` : ""}`);
        await load();
        return;
      }
      done += j.reset ?? 0;
    }
    setOk(`รีเซ็ต “${label}” เป็น 0 แล้ว ${fmtN(done)} รายการ`);
    await load();
  }

  /** ลบ SKU = ปิดการใช้งาน (ประวัติ/ต้นทุนในรายงานยังอยู่) + ถอดลิงก์จากตัวเลือกสินค้าให้เอง */
  async function deleteItem(it: Item) {
    const bal = it.balance !== 0 ? `\nคงเหลือในระบบ ${fmtN(it.balance)} ${it.unit} — ยอดนี้จะหายจากมูลค่าคลังทันที` : "";
    const ok = await confirm({
      icon: "🗑",
      title: `ลบวัสดุ “${it.name}” ไหม?`,
      detail: `หายจากคลังและไม่ถูกตัดสต๊อกตอนขายอีก · ตัวเลือกสินค้าที่ผูกกับตัวนี้จะถูกถอดลิงก์ให้เอง\nกู้คืนได้จากปุ่ม “ที่ลบไปแล้ว” (ลิงก์จะกลับมาด้วย) · ประวัติการเคลื่อนไหวและต้นทุนในรายงานยังอยู่ครบ${bal}`,
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

  /** 🗑 ลบทั้งกลุ่ม (เมนู ⋯ หัวกลุ่ม — เจ้าของร้านขอ 1 ต.ค. 69: กลุ่ม "ตะขอ" 165 ตัวที่สร้างผิด) · ลบทีละชุดผ่าน DELETE ?ids= ถอดลิงก์รอบเดียว · กู้คืนได้จาก "ที่ลบไปแล้ว" */
  async function deleteItems(list: Item[], title: string) {
    if (!list.length) return;
    const withBal = list.filter((i) => i.balance !== 0);
    const linked = list.filter((i) => (live[i.id] ?? []).length > 0);
    const ok = await confirm({
      icon: "🗑",
      title: `ลบวัสดุทั้งกลุ่ม “${title}” ${fmtN(list.length)} รายการ?`,
      detail: `หายจากคลังทั้งชุดและไม่ถูกตัดสต๊อกตอนขายอีก${linked.length ? ` · ${fmtN(linked.length)} ตัวผูกกับสินค้า/ตัวเลือกอยู่ จะถูกถอดลิงก์ให้เอง` : ""}${
        withBal.length ? `\n${fmtN(withBal.length)} ตัวมียอดคงเหลือ (เช่น ${withBal.slice(0, 3).map((i) => `${i.name} ${fmtN(i.balance)} ${i.unit}`).join(" · ")}) — ยอดจะหายจากมูลค่าคลัง` : ""
      }\nกู้คืนทีละตัวได้จากเมนู ⋯ → “วัสดุที่ลบไปแล้ว” (ลิงก์กลับมาด้วย) · ประวัติการเคลื่อนไหวยังอยู่ครบ`,
      confirmLabel: `ลบ ${fmtN(list.length)} รายการ`,
      danger: true,
    });
    if (ok !== true) return;
    setErr("");
    setOpenId(null);
    const ids = new Set(list.map((i) => i.id));
    setItems((prev) => prev.filter((i) => !ids.has(i.id))); // เอาออกจากจอทันที กันกดซ้ำระหว่างเซิร์ฟเวอร์ถอดลิงก์
    setOk(`กำลังลบ “${title}” ${fmtN(list.length)} รายการ…`);
    let deleted = 0;
    let unlinked = 0;
    const all = [...ids];
    for (let i = 0; i < all.length; i += 100) {
      const res = await fetch(`/api/admin/stock?ids=${encodeURIComponent(all.slice(i, i + 100).join(","))}`, { method: "DELETE" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setOk("");
        setErr(`${j?.error ?? "ลบไม่สำเร็จ"} — ลบไปแล้ว ${fmtN(deleted)} จาก ${fmtN(all.length)} ที่เหลือยังอยู่ในคลัง`);
        await load();
        return;
      }
      deleted += Number(j.deleted ?? 0);
      unlinked += Number(j.unlinked ?? 0);
    }
    setOk(`ลบ “${title}” แล้ว ${fmtN(deleted)} รายการ${unlinked ? ` · ถอดลิงก์จากสินค้า/ตัวเลือก ${fmtN(unlinked)} รายการ` : ""} — กู้คืนได้จาก “วัสดุที่ลบไปแล้ว”`);
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
   *   เชื่อมกับสินค้าไม่กี่ตัว (≤ SHARED_MAX) → อยู่ใต้ "ทุก" สินค้าที่ใช้มัน (แถวเดียวกันโผล่ซ้ำ) — ไม่งั้นกลุ่มสินค้าหายทั้งกลุ่ม
   *                                       (สแตนดี้เฟรมการ์ดถูกผูกเพิ่มกับสินค้าที่ 2 → กลุ่ม "สแตนดี้เฟรมการ์ด" หายไปอยู่ "ใช้ร่วมหลายสินค้า" เจ้าของร้านหาไม่เจอ 30 ก.ย. 69)
   *   ยังไม่เชื่อม แต่มีคู่ที่น่าจะใช่     → อยู่ใต้สินค้าของคู่นั้น (แถวยังขึ้นป้ายแดง "ยังไม่ผูก")
   *   ใช้กับสินค้าจำนวนมาก/ผ่านคลังกลาง (ตะขอ สีไหม) → กลุ่ม "ใช้ร่วมหลายสินค้า · <ตระกูล>" ไม่งั้นต้องโชว์ซ้ำเป็นสิบ ๆ ที่
   *   ไม่รู้เลยว่าเป็นของสินค้าไหน       → กลุ่มท้ายสุดแยกตามตระกูล
   */
  const groups = useMemo(() => {
    /** SKU ที่ใช้กับสินค้าไม่เกินเท่านี้ = โชว์ใต้ทุกสินค้าที่ใช้ · มากกว่านั้น (ตะขอ/สีไหมผ่านคลังกลาง) ไปกลุ่มรวม */
    const SHARED_MAX = 4;
    const prodById = new Map(products.map((p) => [p.id, p]));
    type G = { key: string; kind: 0 | 1 | 2 | 3; title: string; sub?: string; img?: string; productId?: string; optionLabel?: string; rows: Item[] };
    const map = new Map<string, G>();
    const put = (g: Omit<G, "rows">, it: Item) => (map.get(g.key) ?? map.set(g.key, { ...g, rows: [] }).get(g.key)!).rows.push(it);
    const ofProduct = (pid: string, name: string, it: Item) =>
      put({ key: `p:${pid}`, kind: 0, title: prodById.get(pid)?.name ?? name, img: prodById.get(pid)?.img, productId: pid }, it);
    const rowById = new Map(items.map((r) => [r.id, r]));
    for (const it of rows) {
      let us = live[it.id] ?? [];
      // ⧉ สำเนาที่ยังไม่ผูกอะไร → ยืมลิงก์ของต้นแบบมาจัดกลุ่ม (โผล่ใต้กลุ่มเดียวกันทันที) · ผูกเองเมื่อไหร่ใช้ลิงก์ตัวเองทันที
      if (!us.length && it.cloneOf) {
        const tpl = rowById.get(it.cloneOf);
        if (tpl) us = live[tpl.id] ?? [];
      }
      const fam = it.family ?? it.category ?? "อื่น ๆ";
      const pids = new Map<string, string>();
      for (const u of us) if (u.kind !== "preset") pids.set(u.productId, u.productName);
      if (us.length) {
        // 🔩 วัสดุแฝงยืนเป็นกลุ่มของตัวเอง — สินค้าหลายตัวใช้ตัวเดียวกัน เติมสต๊อกต้องมีที่เดียวจบ
        //    (เจ้าของร้านขอ 23 ก.ย. 69) · ยังห้อยใต้แถวสินค้าที่ใช้มันเหมือนเดิม ดู renderParts
        // 🔩 ของที่ติดป้าย "วัสดุแฝง" (จากคลังกลาง) แล้วผูกตามตัวเลือกกับสินค้าตั้งแต่ 2 ตัวขึ้นไป — กระดาษแข็ง SHIKISHI A7–A3 ที่ Ultra-Hard CardBoard ใช้ด้วย
        //    ก็ไปอยู่กลุ่มวัสดุแฝงที่เดียว ไม่โผล่ซ้ำใต้ทุกสินค้า (เจ้าของร้านขอ "อยากให้เป็นแบบวัสดุแฝง" 30 ก.ย. 69) · ใช้กับสินค้าเดียวยังอยู่ใต้สินค้านั้นตามเดิม
        //    ⚠️ แต่ยังต้องโผล่ใต้สินค้าแต่ละตัวด้วย — ไม่งั้นสินค้าที่มีแต่ฐานร่วม (กริ๊บต๊อก 5 ตัว · SHIKISHI/Ultra-Hard) หายจากรายการทั้งกลุ่ม
        //    เจ้าของร้านค้นชื่อสินค้าแล้วไม่เจอ (30 ก.ย. 69) · แบบเดียวกับวัสดุแฝงจริงที่ห้อยใต้แถวสินค้า
        const sharedPart = it.part?.trim() === BOM_PART && pids.size >= 2;
        if (us.every((u) => u.kind === "product" && u.bom) || sharedPart) {
          put({ key: "bom", kind: 1, title: "วัสดุแฝง", sub: "ของที่ทุกชิ้นใช้แต่ไม่มีในตัวเลือก หรือของที่หลายสินค้าใช้ร่วมกัน — เติมสต๊อกที่นี่ที่เดียว" }, it);
          if (sharedPart) for (const [pid, name] of pids) ofProduct(pid, name, it);
          continue;
        }
        // 🧩 วัสดุกลางตามตัวเลือก (แผ่นอะคริลิคตามสี/ประเภท) — หัวกลุ่ม = ชื่อกลุ่มตัวเลือก ไม่ใช่ชื่อสินค้า
        //    เจ้าของร้านชี้ 1 ต.ค. 69 "ไม่ต้องการให้เป็นชื่อสินค้า ต้องการให้เป็นชื่อตัวเลือก" · ยังผูก/ตัดตามตัวเลือกตามปกติ
        //    SKU เดียวใช้กับหลายสินค้าได้ (พวงกุญแจ/สแตนดี้/กรอบรูปใช้แผ่นเดียวกัน) มาอยู่กลุ่มเดียวกันไม่โผล่ซ้ำใต้ทุกสินค้า
        if (it.groupByOption) {
          const cs = us.filter((u): u is Extract<StockUsage, { kind: "choice" }> => u.kind === "choice");
          // ลิงก์ที่คลังกลางก็เป็น "กลุ่มตัวเลือก" ได้ (ตะขอ) — ไม่งั้น SKU ที่ผูกแค่คลังตกไปกลุ่ม "ใช้ร่วมหลายสินค้า" แทนกลุ่มชื่อตัวเลือก
          const labels = [...new Set([...cs.map((u) => shortOptionLabel(u.label)), ...us.filter((u) => u.kind === "preset").map((u) => shortOptionLabel(u.label))])];
          for (const lb of labels)
            put(
              { key: `o:${lb}`, kind: 1, title: lb, sub: "วัสดุกลางตามตัวเลือก — ใช้ร่วมได้หลายสินค้า", img: us.find((u) => u.kind === "preset" && shortOptionLabel(u.label) === lb && u.img)?.img ?? cs.find((u) => shortOptionLabel(u.label) === lb)?.img, optionLabel: lb },
              it,
            );
          if (labels.length) continue;
        }
        if (pids.size >= 1 && pids.size <= SHARED_MAX && !us.some((u) => u.kind === "preset")) for (const [pid, name] of pids) ofProduct(pid, name, it);
        else put({ key: `s:${fam}`, kind: 1, title: fam, sub: "ใช้ร่วมหลายสินค้า" }, it);
        continue;
      }
      // 🏭 ของใช้ในโรงงาน เบิกเองอย่างเดียว — กลุ่มของตัวเองตามตระกูล ไม่ตกไป "ยังไม่รู้ว่าใช้กับสินค้าไหน" (ซึ่งถูกซ่อน)
      if (it.manualOnly) {
        put({ key: `m:${fam}`, kind: 1, title: fam, sub: "ของใช้ในโรงงาน — เบิกเองอย่างเดียว ไม่ผูกสินค้า" }, it);
        continue;
      }
      // 🔩 สร้างจากคลังกลางแล้วยังไม่ได้ผูกสินค้า — อยู่กลุ่มวัสดุแฝงเลย ไม่ตกไป "ยังไม่รู้ว่าใช้กับสินค้าไหน" (30 ก.ย. 69)
      if (it.part?.trim() === BOM_PART) {
        put({ key: "bom", kind: 1, title: "วัสดุแฝง", sub: "ของที่ทุกชิ้นใช้แต่ไม่มีในตัวเลือก หรือของที่หลายสินค้าใช้ร่วมกัน — เติมสต๊อกที่นี่ที่เดียว" }, it);
        continue;
      }
      const sg = suggest[it.id]?.[0];
      if (sg?.kind === "choice") ofProduct(sg.productId, sg.productName, it);
      else if (sg?.kind === "preset") put({ key: `s:${fam}`, kind: 1, title: fam, sub: "ใช้ร่วมหลายสินค้า" }, it);
      else if (usage[it.id]?.length)
        put({ key: "ghost", kind: 2, title: "สินค้าที่ผูกไว้ไม่มีในระบบแล้ว", sub: "สินค้าถูกลบหรือเปลี่ยนรหัส — ขายแล้วไม่ตัดยอด ต้องเปิดแก้ไขแล้วเลือกสินค้าใหม่" }, it);
      else put({ key: `n:${fam}`, kind: 3, title: fam, sub: "ยังไม่รู้ว่าใช้กับสินค้าไหน" }, it);
    }
    /**
     * 🔍 ตอนค้นหา: แถวที่ติดมาเพราะ "ชื่อสินค้าที่ผูก" ตรงคำค้น (ฐาน Griptok ← กริ๊บต๊อกกระจกอะคริลิคใส) ถูกวางใต้ "ทุกสินค้า" ที่มันผูกอยู่
     * → กลุ่ม "กริ๊บต๊อก" โผล่มาทั้งที่ไม่มีคำว่า อะคริลิคใส เลย (เจ้าของร้านถาม 1 ต.ค. 69)
     * เหลือเฉพาะกลุ่มที่ชื่อกลุ่มตรงคำค้น หรือมีแถวที่ตัวมันเองตรง (ชื่อ/รหัส/ตระกูล/หมวด/ชื่อเดิม)
     */
    const needle = q.trim().toLowerCase();
    const all = [...map.values()].sort((a, b) => a.kind - b.kind || a.title.localeCompare(b.title, "th"));
    if (!needle) return all;
    // ขั้นเดียวกับ rows: มีตัวที่ตรงเอง → กลุ่มต้องมีตัวนั้น · ไม่มี → กลุ่มที่ชื่อตรงหรือมีแถวตรงผ่านตระกูล/หมวด
    const direct = rows.some((r) => matchItemDirect(r, needle));
    return all.filter((g) => (direct ? g.rows.some((r) => matchItemDirect(r, needle)) : g.title.toLowerCase().includes(needle) || g.rows.some((r) => matchItem(r, needle))));
  }, [rows, items, usage, live, suggest, products, q]);
  const grouped = view === "group" && linksReady;
  /** กำลังค้น/กรองอยู่ = กางทุกกลุ่มให้เห็นผลเลย ไม่ต้องไล่กดเปิด */
  const forceOpen = q.trim() !== "" || filter !== "ทั้งหมด" || cat !== "ทุกหมวด" || linkFilter !== "all";
  /** อยู่ในหมวดที่เลือกไหม — ใช้นับตัวเลขบนชิปให้ตรงกับรายการ */
  const inCat = (i: Item) => cat === "ทุกหมวด" || i.category === cat;
  /** ฟอร์มเพิ่ม/แก้ไขวัสดุเปิดเป็น "หน้า" แทน popup (เจ้าของร้านขอ 30 ก.ย. 69) — ตอนเปิดซ่อนแถบเครื่องมือกับรายการไว้ก่อน */
  const formOpen = addOpen || !!editFor;
  const allOpen = groups.length > 0 && groups.every((g) => openGroups.has(g.key));
  const doneCount = useMemo(() => groups.filter((g) => doneGroups[g.key]).length, [groups, doneGroups]);
  /** จำนวน "รายการ" (SKU ไม่ซ้ำ) ในกลุ่มที่จัดแล้ว/ยังไม่จัด — ไว้โชว์บนชิปให้หน่วยเดียวกับชิปสถานะ */
  const doneRows = useMemo(() => {
    const d = new Set<string>();
    const n = new Set<string>();
    for (const g of groups) for (const r of g.rows) (doneGroups[g.key] ? d : n).add(r.id);
    return { done: d.size, notDone: n.size };
  }, [groups, doneGroups]);
  /** ความคืบหน้า "จัดครบทุกสินค้า" ทั้งคลัง ไม่ขึ้นกับตัวกรอง — สินค้า = ตัวที่มี SKU ผูกอยู่จริง (การ์ดตั้งค่าคลัง) */
  const doneProducts = useMemo(() => {
    const pids = new Set<string>();
    for (const it of tracked) {
      if (it.groupByOption) continue; // วัสดุกลางตามตัวเลือกไม่มีกลุ่มสินค้าให้ติ๊ก — ไม่นับเป็นสินค้าที่ต้องจัด ไม่งั้นครบ 109 ไม่ได้
      for (const u of live[it.id] ?? []) if (u.kind !== "preset") pids.add(u.productId);
    }
    let done = 0;
    for (const p of pids) if (doneGroups[`p:${p}`]) done += 1;
    return { done, total: pids.size };
  }, [tracked, live, doneGroups]);
  /**
   * กลุ่ม "ยังไม่รู้ว่าใช้กับสินค้าไหน" (kind 3 — SKU ที่ไม่ผูกอะไรและไม่มีคู่ให้เดา) ไม่โชว์ในมุมมองตามสินค้า
   * (เจ้าของร้านบอก 30 ก.ย. 69 "แบบนี้ไม่ต้องนำมาแสดง") — ยังดูได้จากชิป "ยังไม่ผูกสินค้า" หรือตอนค้นหา และมีบรรทัดท้ายบอกว่าซ่อนไปกี่รายการ
   */
  const showOrphans = filter === "ยังไม่ผูก" || q.trim() !== "";
  const doneFilterActive = doneFilter !== "ทั้งหมด" && q.trim() === "";
  const shownGroups = useMemo(
    () =>
      (!doneFilterActive ? groups : groups.filter((g) => !!doneGroups[g.key] === (doneFilter === "จัดแล้ว"))).filter(
        (g) => showOrphans || g.kind !== 3,
      ),
    [groups, doneGroups, doneFilter, doneFilterActive, showOrphans],
  );
  const hiddenOrphans = useMemo(() => (showOrphans ? 0 : groups.filter((g) => g.kind === 3).reduce((n, g) => n + g.rows.length, 0)), [groups, showOrphans]);

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
          // งานประจำ 3 ปุ่ม (รับ/เบิก/เพิ่ม) · งานตั้งค่า (ผูกตัวเลือก/วัสดุแฝง/ที่ลบแล้ว/ประวัติ) เก็บในเมนู ⋯ ไม่แย่งที่
          <>
            {mayEdit && (
              <>
                <Btn tone="navy" onClick={() => setTab("รับเข้า")}>
                  ＋ รับเข้า
                </Btn>
                <Btn onClick={() => setTab("เบิกของ")}>− เบิกของ</Btn>
                <Btn tone="yolk" onClick={() => setAddOpen(true)}>
                  เพิ่มวัสดุ
                </Btn>
              </>
            )}
            <ActionMenu
              id="head"
              open={menuOpen}
              setOpen={setMenuOpen}
              label="เมนูตั้งค่าคลัง"
              items={[
                { head: "ตั้งค่าคลัง" },
                { icon: "🔗", label: "ผูกตัวเลือกสินค้ากับวัสดุ", href: "/admin/stock/link" },
                { icon: "🏷", label: "พิมพ์ป้าย QR ชั้นวาง ทุกตัว (สแกน = เบิก)", href: "/admin/stock/labels" },
                ...(mayEdit
                  ? [
                      { icon: "🔩", label: "คลังวัสดุแฝง (ขาตั้ง หมุด ถุง)", onClick: () => setBomLib(true) },
                      { icon: "🗑", label: "วัสดุที่ลบไปแล้ว…", onClick: () => setDeletedOpen(true) },
                { icon: "🗂", label: "จัดการหมวด (เพิ่ม/เปลี่ยนชื่อ/ลบ)", onClick: () => setCatsOpen(true) },
                    ]
                  : []),
                { head: "" },
                { icon: "📜", label: "ประวัติทั้งคลัง", onClick: () => setTab("ประวัติ") },
                // 🧹 ล้างยอดทั้งคลังทีเดียว — เจ้าของร้านเท่านั้น (สั่ง 30 ก.ย. 69 ตอนตั้งต้นคลังใหม่) · ถามยืนยันพร้อมจำนวนก่อนเสมอ
                ...(isOwner
                  ? [
                      { head: "" },
                      {
                        icon: "🧹",
                        label: `รีเซ็ตยอดทุกรายการเป็น 0 (${fmtN(tracked.filter((i) => i.balance !== 0).length)} ตัวที่ยอดไม่ใช่ 0)`,
                        danger: true,
                        onClick: () => void resetItems(tracked, "ทุกรายการในคลัง"),
                      },
                    ]
                  : []),
              ]}
            />
          </>
        }
      />

      {/*
       * ── ต้องทำตอนนี้ — 4 กล่อง กดแล้วกรองรายการด้านล่าง (โครงใหม่ 30 ก.ย. 69) ──
       * กล่องเด่นเป็น "ปัญหาหนักสุดที่มีอยู่จริง": มีของติดลบ (ขายตัดไปแต่ไม่เคยรับเข้า) → ติดลบมาก่อน
       * ไม่มีติดลบแล้วค่อยเป็น "ถึงจุดต้องสั่ง" — เดิมโชว์ "ต้องสั่ง 0 · ของพอใช้ทุกตัว" ทั้งที่ยังไม่มีใครตั้งจุดสั่งสักตัว (หลอกตา)
       */}
      <p className="dkb-eyebrow mt-5 px-1" style={{ color: "var(--dk-navy-soft)" }}>
        ต้องทำตอนนี้{" "}
        <span className="font-normal tracking-normal" style={{ color: "var(--dk-faint)" }}>
          · กดกล่องเพื่อดูรายการ
        </span>
      </p>
      <Stats>
        {negative.length > 0 ? (
          <HeroStat
            n={fmtN(negative.length)}
            label={`ติดลบ ${fmtN(negative.length)} รายการ`}
            detail="ขายไปแล้วแต่ยังไม่เคยรับของเข้าระบบ — นับของจริงแล้วบันทึกยอด ตัวเลขถึงจะเชื่อได้"
            pct={tracked.length ? (negative.length / tracked.length) * 100 : 0}
            onClick={() => jump("ติดลบ")}
            active={tab === "รายการสินค้า" && filter === "ติดลบ"}
          />
        ) : (
          <HeroStat
            n={fmtN(needOrder.length)}
            label="ถึงจุดต้องสั่ง"
            detail={
              needOrder.length
                ? `สั่งเพิ่มก่อนของหมด · ใกล้หมดอีก ${fmtN(nearLow.length)} ตัว`
                : unsetPoint.length
                  ? `ตั้งจุดสั่งไว้ ${fmtN(tracked.length - unsetPoint.length)}/${fmtN(tracked.length)} ตัว — ที่ยังไม่ตั้ง ระบบเตือนให้ไม่ได้`
                  : `ของพอใช้ทุกตัว · ใกล้หมดอีก ${fmtN(nearLow.length)} ตัว · วันนี้เคลื่อนไหว ${fmtN(todayMoves)} ครั้ง`
            }
            pct={tracked.length ? (needOrder.length / tracked.length) * 100 : 0}
            onClick={() => jump("ต้องสั่ง")}
            active={tab === "รายการสินค้า" && filter === "ต้องสั่ง"}
          />
        )}
        {negative.length > 0 && (
          <Stat
            label="ถึงจุดต้องสั่ง"
            value={fmtN(needOrder.length)}
            hint={
              unsetPoint.length
                ? `ใกล้หมดอีก ${fmtN(nearLow.length)} · ตั้งจุดสั่งไว้ ${fmtN(tracked.length - unsetPoint.length)}/${fmtN(tracked.length)} ตัว — ที่ยังไม่ตั้ง ระบบเตือนให้ไม่ได้`
                : `ใกล้หมดอีก ${fmtN(nearLow.length)} ตัว`
            }
            tone={needOrder.length ? "due" : undefined}
            onClick={() => jump("ต้องสั่ง")}
            active={tab === "รายการสินค้า" && filter === "ต้องสั่ง"}
          />
        )}
        <Stat
          label="รอตรวจ"
          value={fmtN(toReview.length)}
          hint={toReview.length ? "ระบบสร้างเองจากการนำเข้า ยังไม่มีคนยืนยันชื่อ/หน่วย" : "ตรวจครบทุกตัวแล้ว"}
          onClick={() => jump("รอตรวจ")}
          active={tab === "รายการสินค้า" && filter === "รอตรวจ"}
        />
        <Stat
          label="ขายแล้วไม่ตัดยอด"
          value={linksReady ? fmtN(unlinked.length) : "…"}
          hint={
            linksReady
              ? unlinked.length
                ? "ยังไม่ผูกกับสินค้าไหน — ขายไปสต๊อกก็ไม่ขยับ"
                : `ผูกครบทุกตัว · วันนี้เคลื่อนไหว ${fmtN(todayMoves)} ครั้ง`
              : "กำลังตรวจการเชื่อมกับสินค้า"
          }
          tone={unlinked.length ? "due" : undefined}
          onClick={() => jump("ยังไม่ผูก")}
          active={tab === "รายการสินค้า" && filter === "ยังไม่ผูก"}
        />
        {negative.length === 0 && (
          <Stat label="เบิกทำเสีย 30 วัน" value={fmtN(monthDefect)} hint={monthDefect ? "ชิ้น — ควรดูสาเหตุ" : "ชิ้น"} tone={monthDefect ? "due" : undefined} />
        )}
      </Stats>

      {/* ── ตั้งค่าคลังให้ครบ — งานตั้งต้นที่ทำครั้งเดียว มีแถบ % · ครบ 100% ยุบเหลือบรรทัดเดียว ไม่แย่งที่กับงานประจำ ── */}
      <SetupCard
        steps={[
          {
            label: "ผูกวัสดุกับสินค้า",
            n: linkable.length - unlinked.length,
            of: linkable.length,
            why: "ขายแล้วถึงตัดยอดให้เอง",
            ready: linksReady,
            on: tab === "รายการสินค้า" && filter === "ยังไม่ผูก",
            pick: () => jump("ยังไม่ผูก"),
          },
          {
            label: "ตรวจของที่นำเข้า",
            n: tracked.length - toReview.length,
            of: tracked.length,
            why: "ยืนยันชื่อ/หน่วย/ตระกูล",
            on: tab === "รายการสินค้า" && filter === "รอตรวจ",
            pick: () => jump("รอตรวจ"),
          },
          {
            label: "ตั้งจุดสั่งซื้อ",
            n: tracked.length - unsetPoint.length,
            of: tracked.length,
            why: "ระบบถึงเตือน “ต้องสั่ง” ได้",
            on: tab === "รายการสินค้า" && filter === "ยังไม่ตั้งจุดสั่ง",
            pick: () => jump("ยังไม่ตั้งจุดสั่ง"),
          },
          {
            label: "จัดวัสดุครบทุกสินค้า",
            n: doneProducts.done,
            of: doneProducts.total,
            why: "กด “ยังไม่จัด” ที่หัวกลุ่มเมื่อจัดเสร็จ",
            ready: linksReady,
            on: tab === "รายการสินค้า" && doneFilter === "ยังไม่จัด",
            pick: () => {
              setTab("รายการสินค้า");
              pickDoneFilter(doneFilter === "ยังไม่จัด" ? "ทั้งหมด" : "ยังไม่จัด");
            },
          },
        ]}
        extra={
          stockValue.priced > 0
            ? `มูลค่าของในคลัง ฿${fmtN(Math.round(stockValue.value))} · ใส่ทุนไว้ ${fmtN(stockValue.priced)}/${fmtN(tracked.length)} รายการ`
            : undefined
        }
      />

      {err && <Banner tone="danger">{err}</Banner>}
      {ok && <Banner tone="ok">{ok}</Banner>}

      {/*
       * ── แถบเครื่องมือ — ติดขอบบนตอนเลื่อน: คลัง | ประวัติ · ค้นหา · หมวด/ตระกูล/เรียง · มุมมอง · ชิปสถานะ ──
       * มือถือ: ช่องเลือกซ่อนไว้หลังปุ่ม "กรอง" (ไม่งั้นกิน 3 บรรทัดก่อนถึงรายการ) · ชิปเลื่อนแนวนอน
       */}
      {!formOpen && (
      <div className="sticky top-[62px] z-[40] md:top-2">
        <FilterCard>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex shrink-0 rounded-full p-[3px]" role="tablist" style={{ background: "rgba(23, 58, 107, 0.07)" }}>
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
                  className={`min-h-[36px] rounded-full px-4 text-[0.85rem] font-medium transition ${
                    tab === t ? "bg-[color:var(--dk-navy)] text-white shadow-[0_4px_10px_rgba(23,58,107,0.25)]" : "text-[color:var(--dk-navy-soft)] hover:bg-white/70"
                  }`}
                >
                  {t === "รายการสินค้า" ? "คลัง" : t}
                </button>
              ))}
            </div>
            {tab === "รายการสินค้า" ? (
              <>
                <SearchBox value={q} onChange={setQ} placeholder="ค้นชื่อวัสดุ รหัส หรือชื่อสินค้า…" />
                {/* ⚠️ .dkb-btn ตั้ง display เองใน dashboard.css (โหลดหลัง Tailwind) — sm:hidden บนปุ่มไม่ทำงาน ต้องครอบ span */}
                <span className="sm:hidden">
                  <button type="button" onClick={() => setMoreFilters((v) => !v)} aria-expanded={moreFilters} className="dkb-btn dkb-btn-ghost dkb-btn-sm !min-h-[42px]">
                    กรอง {moreFilters ? "▴" : "▾"}
                  </button>
                </span>
                <div className={`${moreFilters ? "flex" : "hidden"} w-full flex-wrap items-center gap-2 sm:flex sm:w-auto`}>
                  <select
                    value={cat}
                    onChange={(e) => setCat(e.target.value)}
                    className={dkSelect}
                    aria-label="หมวด"
                  >
                    <option>ทุกหมวด</option>
                    {cats.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  {/* เมนูกรอง "ตระกูล" ถอดออก 30 ก.ย. 69 (เจ้าของร้านขอ) — ตระกูลยังใช้จัดกลุ่ม "ใช้ร่วมหลายสินค้า" และเป็นช่องในลิ้นชักแก้ไข SKU ตามเดิม */}
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={dkSelect} aria-label="เรียงลำดับ">
                    <option value="urgency">เรียง: มีปัญหาก่อน</option>
                    <option value="daysLeft">เรียง: จะหมดเร็วสุด</option>
                    <option value="balance">เรียง: คงเหลือน้อยสุด</option>
                    <option value="name">เรียง: ชื่อ ก-ฮ</option>
                  </select>
                  <div className="inline-flex rounded-full p-[3px]" role="group" aria-label="มุมมองรายการ" style={{ background: "rgba(23, 58, 107, 0.07)" }}>
                    {(["group", "flat"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={view === v}
                        onClick={() => pickView(v)}
                        className={`min-h-[36px] rounded-full px-3.5 text-[0.8rem] font-medium transition ${
                          view === v ? "bg-[color:var(--dk-navy)] text-white" : "text-[color:var(--dk-navy-soft)] hover:bg-white/70"
                        }`}
                      >
                        {v === "group" ? "ตามสินค้า" : "รายการ"}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : tab === "ประวัติ" ? (
              <SearchBox value={logQ} onChange={setLogQ} placeholder="ค้นชื่อวัสดุ หมายเหตุ ผู้ทำ หรือเลขออเดอร์…" />
            ) : null}
          </div>
          {/* แท็บรับเข้า/เบิกของ มีฟอร์มของตัวเอง ไม่มีชิปกรอง */}
          {tab !== "รับเข้า" && tab !== "เบิกของ" && (
          <TabRow divider>
            {tab === "รายการสินค้า" ? (
              <>
                {/* ตัวเลขบนชิปนับเฉพาะหมวดที่เลือกอยู่ — ให้ตรงกับจำนวนในรายการ (เจ้าของร้านเห็น 495 กับ 10 ไม่ตรงกัน 30 ก.ย. 69) */}
                <FChip on={filter === "ทั้งหมด"} onClick={() => setFilter("ทั้งหมด")} label="ทั้งหมด" count={tracked.filter(inCat).length} />
                <FChip on={filter === "ติดลบ"} onClick={() => setFilter("ติดลบ")} label="ติดลบ" count={negative.filter(inCat).length} tone="coral" />
                <FChip on={filter === "ต้องสั่ง"} onClick={() => setFilter("ต้องสั่ง")} label="ต้องสั่ง" count={needOrder.filter(inCat).length} tone="coral" />
                <FChip on={filter === "ใกล้หมด"} onClick={() => setFilter("ใกล้หมด")} label="ใกล้หมด" count={nearLow.filter(inCat).length} tone="yolk" />
                <FChip on={filter === "รอตรวจ"} onClick={() => setFilter("รอตรวจ")} label="รอตรวจ" count={toReview.filter(inCat).length} tone="lilac" />
                <FChip on={filter === "ยังไม่ผูก"} onClick={() => setFilter("ยังไม่ผูก")} label="ยังไม่ผูกสินค้า" count={linksReady ? unlinked.filter(inCat).length : undefined} tone="coral" />
                <FChip on={filter === "ยังไม่ตั้งจุดสั่ง"} onClick={() => setFilter("ยังไม่ตั้งจุดสั่ง")} label="ยังไม่ตั้งจุดสั่ง" count={unsetPoint.filter(inCat).length} tone="quiet" />
                {/* ของ "ไม่ต้องมี stock" ไม่ใช่งานประจำ — ชิปโผล่เฉพาะตอนกำลังดูอยู่ (ทางเข้าอยู่บรรทัดท้ายรายการ) */}
                {filter === "ไม่ต้องมีสต๊อก" && <FChip on onClick={() => setFilter("ทั้งหมด")} label="ไม่ต้องมี stock" count={untracked.length} tone="quiet" />}
                {/* 🔗 แกนที่ 2: ผูกสินค้าแล้ว / ไม่ผูก — กดซ้ำ = ยกเลิก · ใช้ร่วมกับชิปสถานะข้างบนได้ */}
                <span className="mx-1 self-center border-l" style={{ borderColor: "var(--dk-hair)", height: 22 }} aria-hidden />
                <FChip
                  on={linkFilter === "linked"}
                  onClick={() => setLinkFilter(linkFilter === "linked" ? "all" : "linked")}
                  label="ผูกสินค้าแล้ว"
                  count={linksReady ? tracked.filter((i) => inCat(i) && (live[i.id]?.length ?? 0) > 0).length : undefined}
                  tone="mint"
                />
                <FChip
                  on={linkFilter === "unlinked"}
                  onClick={() => setLinkFilter(linkFilter === "unlinked" ? "all" : "unlinked")}
                  label="ไม่ผูกสินค้า"
                  count={linksReady ? tracked.filter((i) => inCat(i) && !(live[i.id]?.length ?? 0)).length : undefined}
                  tone="quiet"
                />
              </>
            ) : (
              MOVE_FILTERS.map((f) => (
                <FChip
                  key={f}
                  on={moveFilter === f}
                  onClick={() => setMoveFilter(f)}
                  label={f}
                  count={f === "ทั้งหมด" ? moves.length : moves.filter((m) => m.reason === f).length}
                  tone={f === "ทั้งหมด" ? undefined : CHIP_TONE[REASON_TONE[f] ?? "neutral"]}
                />
              ))
            )}
          </TabRow>
          )}
        </FilterCard>
      </div>
      )}

      {/* ── รายการสินค้า ── */}
      {!formOpen && tab === "รายการสินค้า" && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <ListHead
              title={grouped ? "วัสดุแยกตามสินค้า" : "วัสดุทั้งหมด"}
              note={
                grouped ? (
                  <>
                    {fmtN(shownGroups.length)} กลุ่ม · {fmtN(rows.length)} รายการ ·{" "}
                    <b style={{ color: groups.length && doneCount === groups.length ? "var(--dk-mint-ink)" : "var(--dk-navy)" }}>
                      จัดแล้ว {fmtN(doneCount)}/{fmtN(groups.length)}
                    </b>
                  </>
                ) : (
                  `${fmtN(rows.length)} รายการ`
                )
              }
            />
            <div className="flex items-center gap-2 px-2 pb-2">
              {/* ✅ กรองกลุ่มตามติ๊ก "จัดแล้ว" — เห็นตลอดที่หัวรายการ (เจ้าของร้านถามหา 30 ก.ย. 69 ตอนย้ายไปซ่อนในการ์ดตั้งค่า) · กดชิปเดิมซ้ำ = กลับเป็นทั้งหมด */}
              {grouped && (
                <span className="flex items-center gap-1.5" role="group" aria-label="กรองกลุ่มตามการจัดวัสดุ">
                  {/* ตัวเลขบนชิป = จำนวนรายการ (หน่วยเดียวกับชิปสถานะข้างบน) · จำนวนกลุ่มบอกในชื่อชิป — เจ้าของร้านขอให้ 3 กับ 10 อ่านแล้วเข้าใจตรงกัน (30 ก.ย. 69) */}
                  <FChip
                    on={doneFilter === "ยังไม่จัด"}
                    onClick={() => pickDoneFilter(doneFilter === "ยังไม่จัด" ? "ทั้งหมด" : "ยังไม่จัด")}
                    label={`ยังไม่จัด · ${fmtN(groups.length - doneCount)} กลุ่ม`}
                    count={doneRows.notDone}
                    tone="yolk"
                  />
                  <FChip
                    on={doneFilter === "จัดแล้ว"}
                    onClick={() => pickDoneFilter(doneFilter === "จัดแล้ว" ? "ทั้งหมด" : "จัดแล้ว")}
                    label={`จัดแล้ว · ${fmtN(doneCount)} กลุ่ม`}
                    count={doneRows.done}
                    tone="mint"
                  />
                </span>
              )}
              {grouped && !forceOpen && (
                <button
                  type="button"
                  onClick={() => setOpenGroups(allOpen ? new Set() : new Set(groups.map((g) => g.key)))}
                  className="dkb-btn dkb-btn-ghost dkb-btn-sm"
                >
                  {allOpen ? "ปิดทุกกลุ่ม" : "เปิดทุกกลุ่ม"}
                </button>
              )}
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
                // ชื่อในกลุ่มสินค้า: ตัดชื่อสินค้าที่ซ้ำกับหัวกลุ่มทิ้ง ("กระเป๋าผ้าแคนวาส · สีดำ · 40x30" → "สีดำ · 40x30") อ่านง่ายขึ้นในแถวแคบ
                const pname = inProductId ? prodNameOf.get(inProductId) ?? "" : "";
                const shown = pname && it.name.startsWith(pname) ? it.name.slice(pname.length).replace(/^\s*[·\-–]\s*/, "") || it.name : it.name;
                /**
                 * ป้ายสถานะแถว — ติดลบมาก่อนทุกอย่าง (ยอดเชื่อไม่ได้) · ยังไม่ตั้งจุดสั่ง = ระบบเตือนไม่ได้ ต้องบอกให้เห็น
                 * แยกกันด้วยพื้น/น้ำหนัก ไม่ใช่สีอย่างเดียว: ติดลบ = ทึบขาว · ต้องสั่ง = คอรัลอ่อน · พอใช้ = มินต์ · ยังไม่ตั้ง = โปร่ง
                 */
                const pill =
                  it.balance < 0 ? (
                    <Tag tone="solid">ติดลบ</Tag>
                  ) : level === "danger" ? (
                    <Tag tone="coral">ต้องสั่ง</Tag>
                  ) : level === "warn" ? (
                    <Tag tone="yolk">ใกล้หมด</Tag>
                  ) : st?.point == null ? (
                    <Tag tone="quiet" title="ตั้งจุดสั่งในแก้ไขข้อมูล — ระบบจะเตือน “ต้องสั่ง” ให้เอง">
                      ยังไม่ตั้งจุดสั่ง
                    </Tag>
                  ) : (
                    <Tag tone="mint">พอใช้</Tag>
                  );
                const canDrag = mayEdit && !nest;
                /** กลุ่มที่แถวนี้กับแถวที่ลากมาอยู่ด้วยกัน — ไว้เรียงลำดับเฉพาะในกลุ่มนั้น */
                const dropGroup = dragId && dragId !== it.id ? groups.find((g) => g.rows.some((r) => r.id === it.id) && g.rows.some((r) => r.id === dragId)) : undefined;
                return (
                  <li key={nest?.key ?? it.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => openDrawer(it.id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openDrawer(it.id))}
                      draggable={canDrag && dragArmed === it.id}
                      onDragStart={(e) => {
                        if (!canDrag || dragArmed !== it.id) return e.preventDefault();
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", it.id);
                        setDragId(it.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOver(null);
                        setDragArmed(null);
                      }}
                      onDragOver={(e) => {
                        if (!dropGroup) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOver !== it.id) setDragOver(it.id);
                      }}
                      onDragLeave={() => dragOver === it.id && setDragOver(null)}
                      onDrop={(e) => {
                        if (!dropGroup || !dragId) return;
                        e.preventDefault();
                        void reorderRows(dropGroup.rows, dragId, it.id);
                        setDragId(null);
                        setDragOver(null);
                        setDragArmed(null);
                      }}
                      className={`dkb-row group !rounded-none cursor-pointer flex-wrap px-4 sm:flex-nowrap ${nest ? "relative" : "pl-5"}${flashId === it.id ? " ring-2 ring-inset ring-amber-400 bg-amber-50/70" : ""}${
                        dragId === it.id ? " opacity-40" : ""
                      }${dragOver === it.id && dropGroup ? " shadow-[inset_0_3px_0_var(--dk-blue-deep)]" : ""}`}
                      // ⚠️ เยื้องด้วย style ไม่ใช่คลาส — .dkb-row ใน dashboard.css ตั้ง padding ย่อ และไฟล์นั้นไม่ได้อยู่ใน @layer
                      // จึงชนะ utility ของ Tailwind v4 ทุกตัว (px-4/pl-* ข้างบนไม่เคยมีผลเลย · เจอจริง 21 ก.ย. 69)
                      style={nest ? { paddingLeft: NEST_PAD, minHeight: 54 } : grouped ? { paddingLeft: ROW_PAD } : undefined}
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
                      {/* ⠿ มือจับลาก — กดค้างแล้วลากทั้งแถวขึ้น/ลงในกลุ่ม · โผล่ชัดตอนชี้แถว */}
                      {canDrag && (
                        <span
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragArmed(it.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="-ml-3 mr-0.5 shrink-0 cursor-grab select-none px-1 text-[16px] leading-none text-slate-300 opacity-60 transition hover:text-slate-500 group-hover:opacity-100 active:cursor-grabbing"
                          title="ลากเพื่อจัดลำดับในกลุ่ม"
                          aria-hidden
                        >
                          ⠿
                        </span>
                      )}
                      <Thumb src={images[it.id]} name={it.name} size={nest ? 32 : 40} />
                      <span className="min-w-0 flex-1 basis-[12rem]">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={nest ? "text-[13px] font-medium" : "text-[14.5px] font-medium"} style={{ color: "var(--dk-navy)" }}>
                            {shown}
                          </span>
                          {it.needsReview && <Tag tone="lilac">รอตรวจ</Tag>}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]" style={{ color: "var(--dk-faint)" }}>
                          {it.code && <span className="dkb-code">{it.code}</span>}
                          {!grouped && <span>{it.family ?? it.category ?? ""}</span>}
                        </span>
                      </span>
                      {/* มือถือ: บรรทัด "ตัดเมื่อ…" เหลือไม่เกิน 2 บรรทัด (รายละเอียดเต็มอยู่ในลิ้นชัก) ไม่งั้นแถวเดียวสูงเกือบเต็มจอ */}
                      <span className={`w-full min-w-0 max-sm:line-clamp-2 max-sm:text-[12px] sm:w-72 sm:pl-0 ${nest ? "pl-[41px]" : "pl-[53px]"}`}>
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
                          <LinkCell ready={linksReady} usage={live[it.id]} dead={dead} hasSuggest={!!suggest[it.id]?.length} inProductId={inProductId} manual={!!it.manualOnly} />
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
                      {/* ขวาสุด = ตัวเลขที่ต้องอ่านจากระยะแขน: คงเหลือ (ใหญ่ · Prompt tabular) + ป้ายสถานะ · ปุ่มลัด ＋ − นับ โผล่ตอนชี้ (เดสก์ท็อป) มือถือใช้ในลิ้นชัก */}
                      <span className={`ml-auto flex shrink-0 items-center gap-2 sm:pl-0 ${nest ? "pl-[41px]" : "pl-[53px]"}`}>
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="text-[10px] leading-none" style={{ color: "var(--dk-faint)" }}>
                            คงเหลือ
                          </span>
                          <span
                            className="dkb-num text-[1.25rem]"
                            style={{ color: it.balance < 0 ? "var(--dk-coral-ink)" : it.balance === 0 ? "var(--dk-faint)" : "var(--dk-navy)" }}
                          >
                            {fmtN(it.balance)}{" "}
                            <span className="text-[11px] font-normal" style={{ color: "var(--dk-navy-soft)" }}>
                              {it.unit}
                            </span>
                          </span>
                          {/* 📦 ของที่นับเป็นแพ็ค: บอกใต้ตัวเลขว่าเท่ากับกี่แพ็ค + เศษกี่แผ่น */}
                          {packText(it, it.balance) && (
                            <span className="text-[11px] tabular-nums" style={{ color: "var(--dk-navy-soft)" }}>
                              = {packText(it, it.balance)}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            {pill}
                            {st?.daysLeft != null && (
                              <span className="text-[11px] tabular-nums" style={{ color: "var(--dk-faint)" }}>
                                หมดใน ~{fmtN(st.daysLeft)} วัน
                              </span>
                            )}
                          </span>
                        </span>
                        {mayEdit && it.needsReview && (
                          <RowBtn title="ยืนยันว่าชื่อ/หน่วย/ตระกูลถูกต้องแล้ว ปลดป้ายรอตรวจ" onClick={() => void markReviewed([it], it.name)} small lilac>
                            ✓ ตรวจแล้ว
                          </RowBtn>
                        )}
                        {mayEdit && (
                          <span className="hidden items-center gap-1 sm:flex sm:opacity-0 sm:transition sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                            {!it.noStock && (
                              <>
                                <RowBtn title="รับเข้า" onClick={() => setBulkFor({ items: [it], title: it.name, mode: "in" })}>
                                  ＋
                                </RowBtn>
                                <RowBtn title="เบิกออก" onClick={() => setBulkFor({ items: [it], title: it.name, mode: "out" })}>
                                  −
                                </RowBtn>
                                <RowBtn title="นับจริง" onClick={() => setCountFor(it)} small>
                                  นับ
                                </RowBtn>
                              </>
                            )}
                            {/* ✏️ แก้ไขจากแถว — คู่กับทำซ้ำ: สำเนาข้อมูลคล้ายต้นแบบ แก้แค่ชื่อ/ขนาด (เจ้าของร้านขอ 1 ต.ค. 69) */}
                            <RowBtn title={`แก้ไขข้อมูล ${it.name}`} onClick={() => openDrawer(it.id, "edit")} small>
                              แก้ไข
                            </RowBtn>
                            {/* ⧉ ทำซ้ำจากแถว — สร้างทันทีเป็นอีกบรรทัดในกลุ่มเดียวกัน ไม่ต้องกรอกฟอร์ม */}
                            <RowBtn title={`ทำซ้ำ ${it.name} — เพิ่มอีกบรรทัดทันที ข้อมูลเหมือนต้นแบบ (ยอด 0 ไม่ผูกสินค้า)`} onClick={() => void duplicateItem(it)} small>
                              ⧉ ทำซ้ำ
                            </RowBtn>
                            {/* ลบจากแถวได้เลย ไม่ต้องเปิดลิ้นชัก (เจ้าของร้านขอ 30 ก.ย. 69) — ถามยืนยันก่อนเสมอ กู้คืนได้จาก "ที่ลบไปแล้ว" */}
                            <RowBtn title={`ลบ ${it.name} ออกจากคลัง`} onClick={() => void deleteItem(it)} small danger>
                              ลบ
                            </RowBtn>
                          </span>
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
                    add(byId.get(x.id), x.cond ? `วัสดุแฝงของตัวเลือก · ตัดเมื่อ ${x.cond}` : "วัสดุแฝงของตัวเลือก · ตัดทุกครั้งที่เลือกค่านี้");
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
              const renderParts = (list0: Item[], groupTitle: string, productId?: string, optionLabel?: string) => {
                // ↕ ลำดับที่ลากจัดมาก่อน (sort) · ที่เหลือเรียงชื่อแบบตัวเลข — ใช้กับทุกทางในกลุ่ม
                let list = [...list0].sort(bySort);
                // 🧩 กลุ่มวัสดุกลางตามตัวเลือก: แถวแม่ = ค่าตัวเลือก (สีพิเศษ) → ห้อย SKU ที่ตัดเมื่อเงื่อนไขตรง (สีอะคริลิค = C-01)
                //    ค่าเดียว → SKU เดียวไม่มีเงื่อนไข = วาดแถว SKU ตรง ๆ ไม่ต้องมีแม่ซ้ำชื่อ · ไม่ใช่ "วัสดุแฝง" (ตัวนี้คือแผ่นหลักของแบบนั้นเอง)
                if (optionLabel) {
                  type Kid = { item: Item; why: string; cond: boolean };
                  type Host = { choice: string; img?: string; products: Set<string>; kids: Kid[] };
                  const byChoice = new Map<string, Host>();
                  const plain: Item[] = [];
                  for (const r of list) {
                    const us = (live[r.id] ?? []).filter((u): u is Extract<StockUsage, { kind: "choice" }> => u.kind === "choice" && shortOptionLabel(u.label) === optionLabel);
                    // ลิงก์ที่คลังกลาง (ตะขอ) — ตัวเลือกเดียวกัน ใช้กับหลายสินค้า · ภาพตัวเลือกจากคลังมาก่อน (ลิงก์ในสินค้ากลุ่ม B ให้รูปปกสินค้า = "เป็นตะขอ" ผิดรูป 1 ต.ค. 69)
                    const pus = (live[r.id] ?? []).filter((u): u is Extract<StockUsage, { kind: "preset" }> => u.kind === "preset" && shortOptionLabel(u.label) === optionLabel);
                    if (!us.length && !pus.length) {
                      plain.push(r);
                      continue;
                    }
                    const u = (us[0] ?? pus[0])!;
                    const img = pus.find((x) => x.img)?.img ?? us.find((x) => x.img)?.img;
                    const h = byChoice.get(u.choice) ?? byChoice.set(u.choice, { choice: u.choice, img, products: new Set(), kids: [] }).get(u.choice)!;
                    if (!h.img && img) h.img = img;
                    for (const x of us) h.products.add(x.productName);
                    for (const x of pus) for (const nm of x.usedByNames ?? []) h.products.add(nm);
                    const all = [...pus, ...us];
                    const conds = [...new Set(all.map((x) => x.cond).filter((c): c is string => !!c))];
                    const per = all.find((x) => x.per && x.per !== 1)?.per;
                    const times = per ? ` (×${per})` : "";
                    h.kids.push({ item: r, cond: conds.length > 0, why: conds.length ? `ตัดเมื่อ ${conds.join(" · ")}${times}` : `ตัดทุกครั้งที่เลือก ${u.choice}${times}` });
                  }
                  const cmp = (a: string, b: string) => a.localeCompare(b, "th", { numeric: true });
                  return [
                    ...[...byChoice.values()]
                      .sort((a, b) => cmp(a.choice, b.choice))
                      .flatMap((h) => {
                        const kids = [...h.kids].sort((a, b) => cmp(a.item.name, b.item.name));
                        if (kids.length === 1 && !kids[0].cond) return [renderRow(kids[0].item)];
                        return [
                          <li key={`oc/${h.choice}`}>
                            <div className="dkb-row !rounded-none flex-wrap px-4 sm:flex-nowrap" style={{ paddingLeft: ROW_PAD, background: "transparent" }}>
                              <Thumb src={h.img} name={h.choice} size={40} />
                              <span className="min-w-0 flex-1 basis-[12rem]">
                                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="text-[14.5px] font-medium" style={{ color: "var(--dk-navy)" }}>
                                    {h.choice}
                                  </span>
                                  <Tag tone="sky">{optionLabel}</Tag>
                                </span>
                                <span className="mt-0.5 block text-[12px]" style={{ color: "var(--dk-faint)" }}>
                                  ตัวเลือก {optionLabel} · ใช้กับ {fmtN(h.products.size)} สินค้า{h.products.size ? `: ${[...h.products].slice(0, 4).join(", ")}${h.products.size > 4 ? ` +${h.products.size - 4}` : ""}` : ""} — แยกสต๊อกตามค่าที่ลูกค้าเลือก ดูด้านล่าง
                                </span>
                              </span>
                            </div>
                          </li>,
                          ...kids.map((k, i) => renderRow(k.item, undefined, { last: i === kids.length - 1, key: `oc/${h.choice}/${k.item.id}`, why: k.why })),
                        ];
                      }),
                    ...plain.map((r) => renderRow(r)),
                  ];
                }
                // วัสดุแฝงมีกลุ่ม "วัสดุแฝง" ของตัวเองแล้ว (เติมสต๊อกที่เดียวจบ) — ในกลุ่มสินค้าจึงเหลือแค่ห้อยใต้แถวที่ใช้มัน
                // ต้องหาจากคลังทั้งก้อน ไม่ใช่จากแถวในกลุ่มนี้ เพราะตัวมันไม่ได้อยู่ในกลุ่มสินค้าแล้ว
                const bom = productId ? items.filter((r) => (live[r.id] ?? []).some((u) => u.kind === "product" && u.bom && u.productId === productId)) : [];
                const byId = new Map(items.map((r) => [r.id, r]));
                // แถวที่ "ห้อย" ใต้แถวอื่นในกลุ่มนี้อยู่แล้ว (วัสดุแฝงของตัวเลือก: ฐาน Griptok · สีใส ใต้ กริ๊บต๊อกกระจก · สีใส)
                // ไม่วาดซ้ำเป็นแถวหลักอีกใบ — SKU เดียวโผล่ 2 ที่ในกลุ่มเดียว เจ้าของร้านเห็นเป็น "ซ้อนกัน" (30 ก.ย. 69)
                const hung = new Set<string>();
                if (productId) for (const r of list) for (const k of kidsOf(r, bom, byId, productId)) if (k.item.id !== r.id) hung.add(k.item.id);
                const host = list.filter((r) => !bom.includes(r) && !hung.has(r.id));
                /**
                 * 🔩 วัสดุแฝงของตัวเลือกที่ "ไม่มีวัสดุหลัก" ให้ห้อย (กระดาษแข็ง A3–A7 ของ SHIKISHI/Ultra-Hard — ตัวเลือกขนาดมีแต่ลิงก์แบบแฝง)
                 * เดิมวาดเป็นแถวปกติ เจ้าของร้านถาม "ยังไม่เห็นห้อยเป็นวัสดุแฝง" (30 ก.ย. 69) → ห้อยใต้หัวข้อชนิดของ/กลุ่มแทน พร้อมก้านเส้น
                 */
                const extraOnly = (r: Item): { why: string; sub?: string } | null => {
                  if (!productId) return null;
                  const us = (live[r.id] ?? []).filter((u) => u.kind !== "preset" && u.productId === productId);
                  if (!us.length || !us.every((u) => u.kind === "choice" && u.extra)) return null;
                  const cs = us.filter((u): u is Extract<StockUsage, { kind: "choice" }> => u.kind === "choice");
                  return {
                    why: `วัสดุแฝงของตัวเลือก · ตัดเมื่อ ${cs.map((u) => `${u.label} = ${u.choice}${u.per && u.per !== 1 ? ` (×${u.per})` : ""}`).join(" · ")}`,
                    sub: cs.map((u) => u.cond).filter(Boolean).length ? `เฉพาะเมื่อ ${cs.map((u) => u.cond).filter(Boolean).join(" · ")}` : "ไม่มีในตัวเลือก — ตัดเพิ่มเมื่อลูกค้าเลือกค่านี้",
                  };
                };
                /** แถวหนึ่งแถว + ลูกที่ห้อยใต้มัน · ท้ายชุด = วัสดุแฝงของตัวเลือกที่ไม่มีตัวหลักให้ห้อย (ห้อยใต้หัวข้อชุดแทน) */
                const hang = (l: Item[]) => {
                  const loose = l.filter((r) => extraOnly(r));
                  const mains = l.filter((r) => !extraOnly(r));
                  return [
                    ...mains.flatMap((r) => {
                      const kids = productId ? kidsOf(r, bom, byId, productId) : [];
                      return [
                        renderRow(r, productId, undefined, new Set(kids.map((k) => k.item.id))),
                        ...kids.map((k, i) =>
                          renderRow(k.item, productId, { last: i === kids.length - 1, key: `${r.id}/${k.item.id}`, why: k.why, sub: k.sub }),
                        ),
                      ];
                    }),
                    // แถวแม่ = "ตัวเลือก" ที่ของแฝงเกาะอยู่ (ขนาด A5 พร้อมรูปตัวเลือก) แล้วห้อยของแฝงใต้มัน — ให้อ่านออกเหมือน แผ่นจิ๊กซอว์ → กรอบรูป
                    // (เจ้าของร้านเทียบภาพ 30 ก.ย. 69: ก้านเส้นลอยจากหัวข้อเฉย ๆ "ไม่เหมือนกัน")
                    ...(() => {
                      type Host = { label: string; choice: string; img?: string; kids: Item[] };
                      const byChoice = new Map<string, Host>();
                      for (const r of loose) {
                        const u = (live[r.id] ?? []).find((x): x is Extract<StockUsage, { kind: "choice" }> => x.kind === "choice" && x.productId === productId);
                        if (!u) continue;
                        const k = `${u.label}|${u.choice}`;
                        (byChoice.get(k) ?? byChoice.set(k, { label: u.label, choice: u.choice, img: u.img, kids: [] }).get(k)!).kids.push(r);
                      }
                      return [...byChoice.entries()].flatMap(([k, h]) => [
                        <li key={`c/${k}`}>
                          <div className="dkb-row !rounded-none flex-wrap px-4 sm:flex-nowrap" style={{ paddingLeft: ROW_PAD, background: "transparent" }}>
                            <Thumb src={h.img} name={h.choice} size={40} />
                            <span className="min-w-0 flex-1 basis-[12rem]">
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-[14.5px] font-medium" style={{ color: "var(--dk-navy)" }}>
                                  {h.choice}
                                </span>
                                <Tag tone="sky">{h.label}</Tag>
                              </span>
                              <span className="mt-0.5 block text-[12px]" style={{ color: "var(--dk-faint)" }}>
                                ตัวเลือกของ {groupTitle} — ไม่มีวัสดุหลักของตัวเอง ใช้วัสดุแฝงด้านล่าง
                              </span>
                            </span>
                          </div>
                        </li>,
                        ...h.kids.map((r, i) => {
                          const x = extraOnly(r)!;
                          return renderRow(r, productId, { last: i === h.kids.length - 1, key: `x/${k}/${r.id}`, why: x.why, sub: x.sub });
                        }),
                      ]);
                    })(),
                  ];
                };
                if (!host.length) return list.map((r) => renderRow(r, productId)); // มีแต่วัสดุแฝง ไม่มีอะไรให้ห้อย
                if (!host.some((r) => r.part)) return hang(host);
                list = host;
                const OTHER = "อื่น ๆ";
                const byPart = new Map<string, Item[]>();
                for (const r of list) {
                  const k = r.part?.trim() || OTHER;
                  (byPart.get(k) ?? byPart.set(k, []).get(k)!).push(r);
                }
                const numeric = bySort;
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
                          className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-2.5 first:border-t-0"
                          style={{ borderColor: "var(--dk-hair)", background: "var(--dk-sky)", paddingLeft: ROW_PAD }}
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
                return (
                  <div>
                    {doneFilter === "จัดแล้ว" ? (
                      <Empty title={`กำลังดูเฉพาะกลุ่มที่ติ๊ก “จัดแล้ว” — ตอนนี้ยังไม่มี`} body={`มี ${fmtN(groups.length)} กลุ่มที่ยังไม่ได้ติ๊ก ถูกซ่อนอยู่ · กดปุ่มด้านล่างเพื่อดูทุกกลุ่ม`} />
                    ) : (
                      <Empty title={`จัดครบแล้วทั้ง ${fmtN(groups.length)} กลุ่ม`} body="ไม่มีกลุ่มที่ยังไม่ได้จัด — กดปุ่มด้านล่างเพื่อดูทุกกลุ่ม" />
                    )}
                    <div className="mt-2 text-center">
                      <button type="button" onClick={() => pickDoneFilter("ทั้งหมด")} className="dkb-btn dkb-btn-navy dkb-btn-sm">
                        ดูทุกกลุ่ม (ยกเลิกตัวกรอง “{doneFilter}”)
                      </button>
                    </div>
                  </div>
                );

              return (
                <div className="grid gap-2.5">
                  {shownGroups.map((g) => {
                    const done = doneGroups[g.key];
                    const nNeg = g.rows.filter((r) => r.balance < 0).length;
                    const nDanger = g.rows.filter((r) => stats.get(r.id)?.level === "danger").length;
                    const nWarn = g.rows.filter((r) => stats.get(r.id)?.level === "warn").length;
                    const nUnlinked = g.rows.filter((r) => !r.manualOnly && !live[r.id]?.length).length;
                    const nReview = g.rows.filter((r) => r.needsReview).length;
                    /**
                     * ทุกกลุ่มหุบไว้ก่อนเสมอ กดหัวกลุ่มถึงกาง (เจ้าของร้านขอ 30 ก.ย. 69 — เดิมกลุ่มติดลบ/ต้องสั่งกางเองทำให้หน้ายาว)
                     * ปัญหาในกลุ่มยังเห็นจากป้ายบนหัวกลุ่ม (ติดลบ/ต้องสั่ง) และแถบสีซ้าย · ค้นหา/กรองอยู่ = กางทั้งหมด (forceOpen)
                     */
                    const open = forceOpen || openGroups.has(g.key);
                    // แถบสีซ้าย: งานค้างเด่นกว่ากลุ่มที่เรียบร้อยแล้วเสมอ — ติ๊กว่าจัดแล้วและไม่มีงานค้าง = เงียบที่สุด
                    const tone =
                      nNeg || nDanger || g.kind === 2
                        ? "var(--dk-coral-deep)"
                        : nWarn || nUnlinked
                          ? "var(--dk-yolk-deep)"
                          : nReview
                            ? "var(--dk-lilac-ink)"
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
                    /**
                     * เมนู ⋯ ของกลุ่ม — เดิมเป็นปุ่มเม็ด 4–5 ปุ่มซ้ำทุกกลุ่ม (109 กลุ่ม) งานประจำกับงานตั้งค่าปนกันจนหาไม่เจอ
                     * บน = ทำบ่อย (รับเข้า/เบิก/ตรวจทั้งกลุ่ม) · ล่าง = ตั้งค่า (วัสดุแฝง/แยกตัวเลือก/เปิดสินค้า/ไม่ต้องมี stock)
                     */
                    const untrackedView = filter === "ไม่ต้องมีสต๊อก";
                    const menu: MenuItem[] = [];
                    if (mayEdit && !untrackedView) {
                      menu.push({ head: "งานประจำ" });
                      menu.push({ icon: "＋", label: `รับเข้าทั้งกลุ่ม (${fmtN(g.rows.length)})`, onClick: () => setBulkFor({ items: g.rows, title: g.title, mode: "in" }) });
                      menu.push({ icon: "−", label: "เบิกออกทั้งกลุ่ม", onClick: () => setBulkFor({ items: g.rows, title: g.title, mode: "out" }) });
                      if (nReview > 0) menu.push({ icon: "✓", label: `ตรวจแล้วทั้งกลุ่ม (${nReview})`, onClick: () => void markReviewed(g.rows, g.title) });
                    }
                    if (mayEdit && (g.productId || g.key === "bom")) {
                      menu.push({ head: "ตั้งค่า" });
                      if (g.productId) {
                        menu.push({ icon: "🔩", label: "เพิ่มวัสดุแฝง (ขาตั้ง หมุด ถุง)", onClick: () => setBomFor({ id: g.productId!, name: g.title }) });
                        menu.push({ icon: "✂️", label: "แยกสต๊อกตามตัวเลือก", onClick: () => setSplitFor({ id: g.productId!, name: g.title }) });
                      }
                      if (g.key === "bom") menu.push({ icon: "🔩", label: "จัดการคลังวัสดุแฝง", onClick: () => setBomLib(true) });
                    }
                    if (g.productId) menu.push({ icon: "↗", label: "เปิดหน้าสินค้า", href: `/admin/products/${encodeURIComponent(g.productId)}` });
                    // 🏷 ป้าย QR ทั้งกลุ่ม — พิมพ์ทีเดียวติดชั้นทั้งแถว (ไม่รวมตัวที่ไม่ต้องมี stock)
                    if (!untrackedView && g.rows.some((r) => !r.noStock))
                      menu.push({ icon: "🏷", label: `พิมพ์ป้าย QR ชั้นวางทั้งกลุ่ม (${fmtN(g.rows.filter((r) => !r.noStock).length)})`, href: `/admin/stock/labels?ids=${g.rows.filter((r) => !r.noStock).map((r) => encodeURIComponent(r.id)).join(",")}` });
                    if (mayEdit) menu.push({ icon: "🗂", label: `ย้ายหมวดทั้งกลุ่ม (${fmtN(g.rows.length)})…`, onClick: () => setMoveCatFor({ items: g.rows, title: g.title }) });
                    if (isOwner && !untrackedView)
                      menu.push({ icon: "🧹", label: "รีเซ็ตยอดทั้งกลุ่มเป็น 0 (เจ้าของร้าน)", danger: true, onClick: () => void resetItems(g.rows, g.title) });
                    if (mayEdit) {
                      menu.push({ head: "" });
                      menu.push(
                        untrackedView
                          ? { icon: "↩", label: "กลับมานับสต๊อกทั้งกลุ่ม", onClick: () => void markNoStock(g.rows, false, g.title) }
                          : { icon: "🚫", label: "ไม่ต้องมี stock ทั้งกลุ่ม", danger: true, onClick: () => void markNoStock(g.rows, true, g.title) },
                      );
                      // 🗑 ลบทั้งกลุ่ม — ล่างสุด แยกเส้นจากอันอื่น ถามยืนยันพร้อมจำนวน/ยอด/ลิงก์ก่อนเสมอ (กู้คืนได้จาก "ที่ลบไปแล้ว")
                      menu.push({ head: "" });
                      menu.push({ icon: "🗑", label: `ลบวัสดุทั้งกลุ่ม (${fmtN(g.rows.length)})…`, danger: true, onClick: () => void deleteItems(g.rows, g.title) });
                    }
                    // min-w-0: เดิมพึ่ง overflow-hidden ให้การ์ดไม่กว้างเกินคอลัมน์ — เอาออกเพื่อให้เมนู ⋯ โผล่พ้นกรอบได้ จึงต้องตั้ง min-width เอง
                    // การ์ดกระจก (backdrop-filter) เป็น stacking context ของตัวเอง — เมนู ⋯ ที่เปิดอยู่จะโดนการ์ดถัดไปทับ ต้องยกการ์ดใบนั้นขึ้นด้วย z-index
                    /** 📦 คงเหลือรวมของกลุ่ม แยกตามหน่วย — พนักงานดู "มีของเหลือเท่าไหร่" ได้จากหัวกลุ่มโดยไม่ต้องกาง (เจ้าของร้านแจ้ง 30 ก.ย. 69) */
                    const totals = [...g.rows.reduce((m, r) => m.set(r.unit, (m.get(r.unit) ?? 0) + r.balance), new Map<string, number>())];
                    return (
                      <section key={g.key} className={`dkb-g relative min-w-0 ${menuOpen === `g:${g.key}` ? "z-[70]" : ""}`} style={{ ["--dk-tone" as string]: tone }}>
                        <span className="absolute inset-y-0 left-0 w-[6px]" style={{ background: "var(--dk-tone)", borderRadius: "24px 0 0 24px" }} />
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
                          {g.kind === 0 || g.img ? (
                            <Thumb src={g.img} name={g.title} size={44} />
                          ) : (
                            <span
                              className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-[12px] text-[16px]"
                              style={{ background: "var(--dk-sky)", color: "var(--dk-navy-soft)" }}
                              aria-hidden
                            >
                              {g.kind === 3 ? "?" : g.key === "bom" ? "🔩" : "▫"}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 basis-[11rem]">
                            {/* 🏷 กลุ่มที่จัดตามตระกูล (เบิกเอง/ใช้ร่วม/ยังไม่รู้) แก้ชื่อได้ตรงหัวกลุ่ม — กลุ่มสินค้า/วัสดุแฝง/ตัวเลือก ชื่อมาจากที่อื่น */}
                            <GroupTitle
                              title={g.title}
                              color={done && !(nNeg || nDanger || g.kind === 2) ? "var(--dk-faint)" : "var(--dk-navy)"}
                              canRename={mayEdit && /^[msn]:/.test(g.key)}
                              onRename={(to) => renameFamily(g.rows, g.title, to)}
                            />
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]" style={{ color: "var(--dk-faint)" }}>
                              <span>
                                {fmtN(g.rows.length)} รายการ{g.sub ? ` · ${g.sub}` : ""}
                              </span>
                              {nNeg > 0 && <Tag tone="solid">ติดลบ {nNeg}</Tag>}
                              {nDanger > 0 && <Tag tone="coral">ต้องสั่ง {nDanger}</Tag>}
                              {nWarn > 0 && <Tag tone="yolk">ใกล้หมด {nWarn}</Tag>}
                              {nUnlinked > 0 && g.kind < 2 && <Tag tone="coral">ยังไม่ผูก {nUnlinked}</Tag>}
                              {nReview > 0 && <Tag tone="lilac">รอตรวจ {nReview}</Tag>}
                              {!nNeg && !nDanger && !nWarn && !nUnlinked && !nReview && g.kind < 2 && <Tag tone="mint">✓ ไม่มีปัญหา</Tag>}
                            </span>
                          </span>
                          {g.kind < 2 && (
                            <span className="ml-auto shrink-0 text-right sm:ml-0">
                              <span className="block text-[10px] leading-none" style={{ color: "var(--dk-faint)" }}>
                                คงเหลือรวม
                              </span>
                              <span className="dkb-num mt-1 block text-[1.05rem]" style={{ color: nNeg ? "var(--dk-coral-ink)" : "var(--dk-navy)" }}>
                                {totals.map(([u, n]) => `${fmtN(n)} ${u}`).join(" · ")}
                              </span>
                            </span>
                          )}
                          <span className="ml-auto flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {/* ✅ "จัดแล้ว" — สิทธิ์ดูอย่างเดียวเห็นสถานะแต่ไม่มีปุ่มให้กด (กดแล้วเงียบเพราะ 403 คือกับดักเดิม) */}
                            {g.kind === 0 && <DonePill done={done} onToggle={mayEdit ? () => void toggleGroupDone(g.key, g.title) : undefined} />}
                            {menu.length > 0 && <ActionMenu id={`g:${g.key}`} open={menuOpen} setOpen={setMenuOpen} label={`เมนู ${g.title}`} items={menu} />}
                          </span>
                        </header>
                        {open && (
                          <ul className="border-t" style={{ borderColor: "var(--dk-hair)" }}>
                            {renderParts(g.rows, g.title, g.productId, g.optionLabel)}
                          </ul>
                        )}
                      </section>
                    );
                  })}
                  {hiddenOrphans > 0 && (
                    <p className="px-1 pt-1 text-[12.5px] text-slate-500">
                      ซ่อน {fmtN(hiddenOrphans)} รายการที่ยังไม่รู้ว่าใช้กับสินค้าไหน —{" "}
                      <button type="button" onClick={() => setFilter("ยังไม่ผูก")} className="underline underline-offset-2 hover:text-slate-800">
                        ดูที่ชิป “ยังไม่ผูกสินค้า”
                      </button>
                    </p>
                  )}
                </div>
              );
            })()
          )}
          {!loading && rows.length > 0 && (
            <p className="px-2 pt-3 text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
              ยอดรีเฟรชเองทุก 20 วินาที · จุดสั่งที่ยังไม่ได้ตั้งเอง ระบบเดาจากสถิติการใช้ 30 วัน
              {untracked.length > 0 && (
                <>
                  {" "}
                  · ของที่ตั้งว่า “ไม่ต้องมีสต๊อก” อีก <b>{fmtN(untracked.length)}</b> รายการไม่แสดงที่นี่ —{" "}
                  <button
                    type="button"
                    onClick={() => setFilter(filter === "ไม่ต้องมีสต๊อก" ? "ทั้งหมด" : "ไม่ต้องมีสต๊อก")}
                    className="underline underline-offset-2 hover:text-slate-800"
                  >
                    {filter === "ไม่ต้องมีสต๊อก" ? "กลับไปดูคลัง" : "ดูรายการ"}
                  </button>
                </>
              )}
            </p>
          )}
        </>
      )}

      {/* ── รับเข้า / เบิกของ — หน้าเต็มในแท็บ (ปุ่มหัวหน้าก็พามาแท็บนี้) ── */}
      {!formOpen && (tab === "รับเข้า" || tab === "เบิกของ") && (
        <div className="mt-4">
          {/* เสนอเฉพาะของที่นับสต๊อกจริง — รายการ "ไม่ต้องมีสต๊อก" (เช่น PL-PREMIUMBAG-* ที่นำเข้าจากไฟล์ราคา) เคยโผล่ให้เลือกแล้วเจ้าของร้านแยกไม่ออก (30 ก.ย. 69) */}
            <MovePanel
              key={tab}
              mode={tab === "รับเข้า" ? "in" : "out"}
              items={tracked}
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
        </div>
      )}

      {/* ── ประวัติ ── */}
      {!formOpen && tab === "ประวัติ" && (
        <div className="mt-4">
          <MoveTable rows={logRows} showItem />
        </div>
      )}

      {openItem && (
        <ItemDrawer
          item={openItem}
          image={images[openItem.id]}
          usage={usage[openItem.id] ?? []}
          suggest={suggest[openItem.id] ?? []}
          linksReady={linksReady}
          products={products}
          skus={items.map((i) => ({ id: i.id, name: i.name, code: i.code, img: images[i.id], lib: isLib(i) }))}
          hangs={linksReady ? hangsOf(openItem.id) : []}
          onLink={(t) => linkChoice(openItem.id, t, true)}
          onUnlink={(t) => linkChoice(openItem.id, t, false)}
          onProductPer={(u, n) => setProductPer(openItem.id, u, n)}
          onChoicePer={(u, n) => setChoicePer(openItem.id, u, n)}
          onLinkExtra={linkExtra}
          onUnlinkHang={unlinkHang}
          stat={stats.get(openItem.id)}
          moves={moves.filter((m) => m.itemId === openItem.id)}
          mayEdit={mayEdit}
          onClose={() => setOpenId(null)}
          onEdit={() => setDrawerTab("edit")}
          tab={drawerTab}
          onTab={setDrawerTab}
          allCats={cats}
          allFams={allFams}
          allParts={allParts}
          onSaveEdit={saveItem}
          onDuplicate={() => void duplicateItem(openItem)}
          onCount={() => setCountFor(openItem)}
          onMove={(mode) => setBulkFor({ items: [openItem], title: openItem.name, mode })}
          onDelete={() => deleteItem(openItem)}
          onNoStock={(on) => markNoStock([openItem], on, openItem.name)}
          onReset={isOwner ? () => void resetItems([openItem], openItem.name) : undefined}
          onMoveCategory={mayEdit ? () => setMoveCatFor({ items: [openItem], title: openItem.name }) : undefined}
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
          onSaveMany={async (list) => {
            let n = 0;
            for (const b of list) {
              if (!(await saveItem(b))) break; // saveItem โชว์ error ไว้แล้ว — หยุดตรงตัวที่พัง ไม่สร้างซ้ำ
              n++;
            }
            if (n === list.length) setAddOpen(false);
            if (n) setOk(`เพิ่มวัสดุแล้ว ${fmtN(n)} ตัว${n < list.length ? ` (จาก ${fmtN(list.length)} — ที่เหลือยังไม่ได้สร้าง)` : ""}`);
          }}
          onSplitProduct={(p) => {
            setAddOpen(false);
            setSplitFor(p); // หน้าต่าง "แยกสต๊อกตามตัวเลือก" — ติ๊กเลือกตัวเลือกที่จะทำเป็นวัสดุ แล้วสร้าง+ผูกให้ทีเดียว
          }}
        />
      )}

      {bomLib && (
        <BomLibraryModal
          items={items}
          images={images}
          live={live}
          products={products}
          allParts={allParts}
          isLib={isLib}
          onClose={() => setBomLib(false)}
          onChanged={(it) => {
            setItems((prev) => (prev.some((i) => i.id === it.id) ? prev.map((i) => (i.id === it.id ? it : i)) : [...prev, it]));
          }}
          onRemoved={(id) => {
            if (openId === id) setOpenId(null);
            setItems((prev) => prev.filter((i) => i.id !== id));
          }}
          onDone={async () => {
            setBomLib(false);
            setOpenGroups((prev) => new Set(prev).add("bom"));
            await Promise.all([load(), loadImages(true)]);
          }}
          onPickProduct={() => {
            setBomLib(false);
            setBomPick(true);
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
          isLib={isLib}
          onClose={() => setBomFor(null)}
          onChanged={(it) => {
            setItems((prev) => (prev.some((i) => i.id === it.id) ? prev.map((i) => (i.id === it.id ? it : i)) : [...prev, it]));
          }}
          onDone={async () => {
            setBomFor(null);
            setOpenGroups((prev) => new Set(prev).add(`p:${bomFor.id}`));
            await Promise.all([load(), loadImages(true)]);
          }}
          onOpenLibrary={() => {
            setBomFor(null);
            setBomLib(true);
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
          allCats={cats}
          // 🧩 ชื่อกลุ่มตัวเลือกที่มีวัสดุกลางตามตัวเลือกอยู่แล้ว — แยกกลุ่มชื่อเดียวกันในสินค้าอื่น (สแตนดี้ก็มี "ประเภทอะคริลิค") ติ๊ก 🧩 ให้เอง ไม่กลับไปเป็นชื่อสินค้าอีก
          optionGroupLabels={new Set(items.flatMap((i) => (i.groupByOption ? (live[i.id] ?? []).flatMap((u) => (u.kind === "choice" ? [shortOptionLabel(u.label)] : [])) : [])))}
          onClose={() => setSplitFor(null)}
          onDone={async (msg) => {
            setSplitFor(null);
            setOk(msg);
            setOpenGroups((prev) => new Set(prev).add(`p:${splitFor.id}`));
            await Promise.all([load(), loadImages(true)]);
          }}
        />
      )}

      {moveCatFor && (
        <MoveCategoryModal
          items={moveCatFor.items}
          title={moveCatFor.title}
          allCats={cats}
          onClose={() => setMoveCatFor(null)}
          onDone={async (msg) => {
            setMoveCatFor(null);
            setOk(msg);
            await Promise.all([loadCats(), load()]);
          }}
        />
      )}
      {catsOpen && (
        <CategoriesModal
          names={cats}
          // นับแยก "นับสต๊อก" กับ "ไม่ต้องมีสต๊อก" — ตัวกรองหมวดในรายการเห็นเฉพาะที่นับสต๊อก เจ้าของร้านเลือกหมวดแล้วว่างเพราะทั้งหมวดเป็นของนำเข้าที่ไม่นับ (30 ก.ย. 69)
          counts={tracked.reduce<Record<string, number>>((m, i) => {
            if (i.category?.trim()) m[i.category.trim()] = (m[i.category.trim()] ?? 0) + 1;
            return m;
          }, {})}
          countsOff={untracked.reduce<Record<string, number>>((m, i) => {
            if (i.category?.trim()) m[i.category.trim()] = (m[i.category.trim()] ?? 0) + 1;
            return m;
          }, {})}
          uncategorized={tracked.filter((i) => !i.category?.trim()).length}
          onClose={() => setCatsOpen(false)}
          onChanged={async (msg) => {
            setOk(msg);
            await Promise.all([loadCats(), load()]);
          }}
        />
      )}
      {deletedOpen && (
        <DeletedModal
          onClose={() => setDeletedOpen(false)}
          onRestored={async (name, relinked, skipped) => {
            setErr("");
            setOk(`กู้คืน ${name} แล้ว${relinked ? ` · ผูกกลับตัวเลือกสินค้า ${fmtN(relinked)} รายการ` : ""}${skipped.length ? ` · ข้าม ${skipped.join(", ")}` : ""}`);
            await load();
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

/** โทนชิปกรอง (FChip) ต่อโทนสถานะของ admin-ui — ใช้กับชิปประเภทการเคลื่อนไหวในแท็บประวัติ */
const CHIP_TONE: Record<Tone, "coral" | "lilac" | "mint" | "yolk" | "sky" | "quiet"> = {
  ok: "mint",
  warn: "yolk",
  danger: "coral",
  review: "lilac",
  neutral: "quiet",
};

/**
 * 🧭 การ์ด "ตั้งค่าคลังให้ครบ" — งานตั้งต้นที่ทำครั้งเดียว (ผูกสินค้า · ตรวจของ · ตั้งจุดสั่ง · จัดครบ) มีแถบ % ต่อขั้น
 * กดขั้นไหน = กรองรายการให้เหลือแต่ของที่ยังไม่เสร็จของขั้นนั้น · ครบทุกขั้นแล้วยุบเองเหลือบรรทัดเดียว (กางเองได้)
 * ทำไมต้องมี: 30 ก.ย. 69 คลังมี 382 SKU ตั้งจุดสั่ง 0 ตัว — กล่อง "ต้องสั่ง 0" เลยเขียวทั้งที่ระบบยังเตือนอะไรไม่ได้
 */
type SetupStep = { label: string; n: number; of: number; why: string; on?: boolean; pick: () => void; /** false = ตัวเลขยังโหลดอยู่ */ ready?: boolean };
function SetupCard({ steps, extra }: { steps: SetupStep[]; extra?: string }) {
  const left = steps.filter((s) => s.n < s.of).length;
  const pct = Math.round((steps.reduce((sum, s) => sum + (s.of ? Math.min(1, s.n / s.of) : 1), 0) / steps.length) * 100);
  // ผู้ใช้กด/หุบเองแล้วจำไว้ในรอบนี้ · ยังไม่กด = กางเมื่อยังไม่ครบ
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? left > 0;
  return (
    <details className="dkb-g mt-3 px-4 py-3" open={open} onToggle={(e) => setManual(e.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
        <span className="dkb-h2 shrink-0 whitespace-nowrap text-[0.98rem]">ตั้งค่าคลังให้ครบ</span>
        <span className="h-[7px] min-w-[48px] flex-1 overflow-hidden rounded-full sm:max-w-[200px]" style={{ background: "rgba(23, 58, 107, 0.08)" }}>
          <i className="block h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--dk-blue), var(--dk-blue-deep))" }} />
        </span>
        <span className="whitespace-nowrap text-[12px] tabular-nums" style={{ color: "var(--dk-navy-soft)" }}>
          {pct}% {left ? `· เหลือ ${left} ขั้น` : "· ครบแล้ว"}
        </span>
        <span className={`ml-auto text-[10px] transition ${open ? "rotate-180" : ""}`} style={{ color: "var(--dk-faint)" }} aria-hidden>
          ▼
        </span>
      </summary>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((s, i) => {
          const done = s.n >= s.of;
          const p = s.of ? Math.round((Math.min(s.n, s.of) / s.of) * 100) : 100;
          return (
            <button
              key={s.label}
              type="button"
              onClick={s.pick}
              aria-pressed={!!s.on}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2.5 gap-y-1 rounded-[14px] border px-3 py-2.5 text-left transition hover:bg-white"
              style={{ borderColor: s.on ? "var(--dk-navy)" : "rgba(255, 255, 255, 0.9)", background: s.on ? "#fff" : "rgba(255, 255, 255, 0.65)" }}
            >
              <span
                className="row-span-2 grid h-[30px] w-[30px] place-items-center rounded-full text-[12px] font-semibold"
                style={done ? { background: "var(--dk-mint-wash)", color: "var(--dk-mint-ink)" } : { background: "var(--dk-sky)", color: "var(--dk-blue-deep)" }}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className="text-[13px] font-medium" style={{ color: "var(--dk-navy)" }}>
                {s.label}
              </span>
              <span className="dkb-num-sm text-[13px]">
                <b style={{ color: done ? "var(--dk-mint-ink)" : "var(--dk-blue-deep)" }}>{s.ready === false ? "…" : fmtN(s.n)}</b>
                <span style={{ color: "var(--dk-navy-soft)" }}>/{fmtN(s.of)}</span>
              </span>
              <span className="col-span-2 h-[5px] overflow-hidden rounded-full" style={{ background: "rgba(23, 58, 107, 0.08)" }}>
                <i className="block h-full rounded-full" style={{ width: `${p}%`, background: done ? "var(--dk-mint)" : "var(--dk-blue-deep)" }} />
              </span>
              <span className="col-span-2 text-[11px]" style={{ color: "var(--dk-faint)" }}>
                {s.why}
              </span>
            </button>
          );
        })}
      </div>
      {extra && (
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--dk-navy-soft)" }}>
          {extra}
        </p>
      )}
    </details>
  );
}

/** รายการในเมนู ⋯ — head = หัวข้อคั่น (ว่าง = เส้นคั่น) · href = ลิงก์ · danger = สีอันตราย */
type MenuItem = { label?: string; icon?: string; onClick?: () => void; href?: string; danger?: boolean; head?: string };
/**
 * เมนู ⋯ แบบเด้งลง — ใช้ที่หัวหน้า (ตั้งค่าคลัง) และหัวกลุ่มสินค้า
 * เปิดได้ทีละอัน (id เดียวกับ state ของหน้า) · ปิดเมื่อกดที่อื่น/Esc/เลือกรายการ
 */
function ActionMenu({ id, open, setOpen, label, items, up }: { id: string; open: string | null; setOpen: (v: string | null) => void; label: string; items: MenuItem[]; /** เด้งขึ้นบน — ใช้เมื่อปุ่มอยู่ติดขอบล่างจอ (แถบท้ายลิ้นชัก) */ up?: boolean }) {
  const isOpen = open === id;
  useEffect(() => {
    if (!isOpen) return;
    const off = () => setOpen(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("click", off);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", off);
      document.removeEventListener("keydown", key);
    };
  }, [isOpen, setOpen]);
  const itemCls = "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13px] transition hover:bg-[color:var(--dk-sky)]";
  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(isOpen ? null : id);
        }}
        className="grid h-[40px] w-[40px] place-items-center rounded-full text-[18px] leading-none transition hover:bg-white"
        style={{ background: "rgba(255, 255, 255, 0.6)", color: "var(--dk-navy-soft)" }}
      >
        ⋯
      </button>
      {isOpen && (
        <div
          role="menu"
          className={`absolute right-0 z-[60] min-w-[240px] rounded-2xl bg-white p-1.5 text-left shadow-[0_16px_40px_rgba(23,58,107,0.22)] ${up ? "bottom-[44px]" : "top-[44px]"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((m, i) =>
            m.head !== undefined ? (
              m.head ? (
                <p key={i} className="px-3 pb-0.5 pt-2 text-[10.5px] font-semibold tracking-[0.08em]" style={{ color: "var(--dk-faint)" }}>
                  {m.head}
                </p>
              ) : (
                <hr key={i} className="mx-2 my-1 border-0 border-t" style={{ borderColor: "var(--dk-hair)" }} />
              )
            ) : m.href ? (
              <a key={i} href={m.href} role="menuitem" className={itemCls} style={{ color: "var(--dk-navy)" }}>
                <span className="w-5 text-center" aria-hidden>
                  {m.icon}
                </span>
                {m.label}
              </a>
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(null);
                  m.onClick?.();
                }}
                className={itemCls}
                style={{ color: m.danger ? "var(--dk-coral-ink)" : "var(--dk-navy)" }}
              >
                <span className="w-5 text-center" aria-hidden>
                  {m.icon}
                </span>
                {m.label}
              </button>
            ),
          )}
        </div>
      )}
    </span>
  );
}

/**
 * ✅ ป้าย "จัดแล้ว / ยังไม่จัด" ที่หัวกลุ่มสินค้า — ไล่จัดวัสดุทีละกลุ่มแล้วกดไว้ว่าทำถึงไหน
 * ยังไม่จัด = พื้นเหลืองเห็นชัดว่ายังต้องทำ · จัดแล้ว = โปร่งมีขอบมินต์ (เงียบกว่า — งานที่จบแล้วต้องไม่แย่งตา)
 * onToggle ว่าง = สิทธิ์ดูอย่างเดียว แสดงสถานะแต่กดไม่ได้
 */
function DonePill({ done, onToggle }: { done?: GroupDone; onToggle?: () => void }) {
  const on = !!done;
  const cls = "inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] font-semibold";
  const style = on
    ? { color: "var(--dk-mint-ink)", boxShadow: "inset 0 0 0 1px rgba(13, 107, 81, 0.3)" }
    : { background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" };
  const text = on ? "✓ จัดแล้ว" : "ยังไม่จัด";
  const title = done ? `จัดแล้ว · ${done.by === "กำลังบันทึก…" ? done.by : `${done.by} ${fmtAt(done.at)}`} · กดเพื่อเอาออก` : "กดเมื่อจัดวัสดุกลุ่มนี้เสร็จ";
  if (!onToggle)
    return (
      <span className={cls} style={style} title={title}>
        {text}
      </span>
    );
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`${cls} transition hover:brightness-95`}
      style={style}
      title={title}
    >
      {text}
    </button>
  );
}

/** ปุ่มลัดในแถว (＋ รับเข้า · − เบิก · นับ · ✓ ตรวจแล้ว · ลบ) — กลม 36px หยุดการกดไม่ให้เปิดลิ้นชัก · danger = ลบ (สีแดง กันเผลอกด) */
function RowBtn({ title, onClick, small, lilac, danger, children }: { title: string; onClick: () => void; small?: boolean; lilac?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`grid h-[36px] min-w-[36px] place-items-center whitespace-nowrap rounded-full font-semibold transition hover:!text-white ${
        danger ? "hover:!bg-[color:var(--dk-coral-deep)]" : "hover:!bg-[color:var(--dk-navy)]"
      } ${small ? "px-2.5 text-[11.5px]" : "text-[15px]"}`}
      style={{ background: "rgba(255, 255, 255, 0.85)", color: danger ? "var(--dk-coral-deep)" : lilac ? "var(--dk-lilac-ink)" : "var(--dk-navy)", boxShadow: "0 2px 6px rgba(44, 129, 196, 0.15)" }}
    >
      {children}
    </button>
  );
}

/** หน่วยที่ร้านใช้บ่อย — เป็นตัวเลือกให้กดในฟอร์มเพิ่ม/แก้ไขวัสดุ (พิมพ์เองก็ยังได้ · เจ้าของร้านขอ 30 ก.ย. 69) */
// ชุดเดียวกันทั้ง "หน่วยนับเล็กสุด" และ "หน่วยแพ็ค" — เจ้าของร้านขอให้สองช่องมีตัวเลือกตรงกัน (30 ก.ย. 69)
const UNIT_OPTIONS = ["ชิ้น", "แผ่น", "ใบ", "ตัว", "อัน", "เส้น", "คู่", "ชุด", "แพ็ค", "รีม", "กล่อง", "ลัง", "ถุง", "โหล", "ม้วน", "ขวด", "แกลลอน", "เมตร", "กิโลกรัม"];
const BASE_UNITS = UNIT_OPTIONS;
const PACK_UNITS = UNIT_OPTIONS;
/**
 * ช่องเลือกหน่วยแบบ dropdown (เจ้าของร้านขอ 30 ก.ย. 69 — ชิปแล้วรก) · เลือก "กำหนดเอง…" ถึงจะได้ช่องพิมพ์
 * ค่าที่ไม่อยู่ในรายการ (ของเก่า/พิมพ์เอง) ถือเป็นกำหนดเองให้อัตโนมัติ
 */
function UnitSelect({ options, value, onChange, emptyLabel, placeholder }: { options: string[]; value: string; onChange: (v: string) => void; emptyLabel: string; placeholder: string }) {
  const custom = value.trim() !== "" && !options.includes(value.trim());
  const [free, setFree] = useState(custom);
  const isFree = free || custom;
  return (
    <span className="flex gap-2">
      <select
        value={isFree ? "__custom" : value}
        onChange={(e) => {
          if (e.target.value === "__custom") {
            setFree(true);
            onChange("");
          } else {
            setFree(false);
            onChange(e.target.value);
          }
        }}
        className={`${inputCls} ${isFree ? "w-40 shrink-0" : ""}`}
      >
        <option value="">{emptyLabel}</option>
        {options.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
        <option value="__custom">กำหนดเอง…</option>
      </select>
      {isFree && <input autoFocus value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />}
    </span>
  );
}

/** 📦 สวิตช์หน่วยในฟอร์มรับ/เบิก: [แผ่น | แพ็ค] — ของที่ตั้ง packSize ไว้เท่านั้น */
function UnitSwitch({ unit, packUnit, inPack, onChange }: { unit: string; packUnit: string; inPack: boolean; onChange: (v: boolean) => void }) {
  const cls = (on: boolean) => `min-h-[26px] rounded-full px-2.5 text-[11px] font-semibold transition ${on ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`;
  return (
    <span className="inline-flex rounded-full border border-slate-200 bg-white p-0.5" role="group" aria-label="หน่วยที่กรอก">
      <button type="button" aria-pressed={!inPack} onClick={() => onChange(false)} className={cls(!inPack)}>
        {unit}
      </button>
      <button type="button" aria-pressed={inPack} onClick={() => onChange(true)} className={cls(inPack)}>
        {packUnit}
      </button>
    </span>
  );
}

/**
 * ชื่อที่พิมพ์แก้ได้เลย (ชื่อตัวเลือกในหน้าต่างแยกสต๊อก) — ไม่ต้องกดดินสอ (เจ้าของร้านขอ 1 ต.ค. 69)
 * ช่องดูเหมือนข้อความ ชี้เมาส์/โฟกัสถึงเห็นกรอบ · ออกจากช่องหรือ Enter = บันทึกถ้าเปลี่ยน · Esc = คืนค่าเดิม
 * บันทึกไม่ผ่าน = คงค่าที่พิมพ์ไว้ให้แก้ต่อ (ข้อผิดพลาดขึ้นที่แถบของหน้าต่าง)
 */
function InlineName({ text, canEdit, onSave, onReject }: { text: string; canEdit: boolean; onSave: (to: string) => Promise<boolean>; /** ลบจนว่าง = บอกเหตุผลว่าทำไมไม่บันทึก (ชื่อตัวเลือกว่างไม่ได้) */ onReject?: (msg: string) => void }) {
  const [val, setVal] = useState(text);
  const [busy, setBusy] = useState(false);
  // ชื่อจากเซิร์ฟเวอร์เปลี่ยน (หลังบันทึก/โหลดใหม่) → ตามให้
  useEffect(() => setVal(text), [text]);
  if (!canEdit) return <span className="min-w-0 truncate">{text}</span>;
  const commit = async () => {
    const nu = val.trim();
    if (busy) return;
    if (!nu) {
      // ลบจนว่างแล้วออกจากช่อง — เดิมคืนค่าเดิมเงียบ ๆ เจ้าของร้านคิดว่าระบบไม่ลบให้ (1 ต.ค. 69)
      onReject?.(`ชื่อตัวเลือก “${text}” ว่างไม่ได้ — ชื่อนี้คือตัวเลือกที่ลูกค้าเห็นหน้าร้าน ถ้าต้องการเอาตัวเลือกนี้ออกจากสินค้า ให้ลบที่หน้าสินค้า (ตารางราคา/กฎจะถูกเก็บกวาดให้ที่นั่น)`);
      return setVal(text);
    }
    if (nu === text) return setVal(text);
    setBusy(true);
    const ok = await onSave(nu);
    setBusy(false);
    if (ok) setVal(nu);
  };
  return (
    <span className="relative inline-grid max-w-full">
      {/* ตัวเงาไว้วัดความกว้างให้ช่องพอดีข้อความ (หน่วย ch คลาดกับอักษรไทย ทำให้เว้นช่องว่างกว้าง) */}
      <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre px-1.5 py-0.5 text-[13px] font-medium">
        {val || text}
      </span>
    <input
      value={val}
      disabled={busy}
      onChange={(e) => setVal(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setVal(text);
          (e.target as HTMLInputElement).blur();
        }
      }}
      aria-label={`ชื่อตัวเลือก ${text}`}
      title="พิมพ์แก้ชื่อตัวเลือกได้เลย — ออกจากช่องแล้วบันทึกให้ (ราคา/กฎ/เงื่อนไขย้ายตาม)"
      className={`col-start-1 row-start-1 w-full min-w-[3rem] rounded-md border px-1.5 py-0.5 text-[13px] font-medium text-slate-900 transition focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-100 disabled:opacity-50 ${
        val.trim() !== text ? "border-amber-300 bg-amber-50/40" : "border-transparent bg-transparent hover:border-slate-300 hover:bg-white"
      }`}
    />
    </span>
  );
}

/**
 * ชื่อหัวกลุ่ม + ✎ แก้ชื่อในที่ (เฉพาะกลุ่มตามตระกูล) — หัวกลุ่มเป็น role=button กาง/หุบ จึงต้องหยุด click/keydown ไม่ให้ไหลขึ้นไป
 */
function GroupTitle({ title, color, canRename, onRename }: { title: string; color: string; canRename: boolean; onRename: (to: string) => Promise<boolean> }) {
  const [val, setVal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  if (val !== null)
    return (
      <form
        className="flex items-center gap-1.5"
        onClick={stop}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") setVal(null);
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          const ok = await onRename(val);
          setBusy(false);
          if (ok || val.trim() === title) setVal(null);
        }}
      >
        <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} aria-label="ชื่อกลุ่ม" className={`${inputCls} !h-9 max-w-[16rem] text-[0.95rem] font-medium`} />
        <button type="submit" disabled={busy || !val.trim()} className={btnSmNeutral}>
          {busy ? "…" : "บันทึก"}
        </button>
        <button type="button" onClick={() => setVal(null)} className={btnSmGhost}>
          ยกเลิก
        </button>
      </form>
    );
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="dkb-display block truncate text-[1rem]" style={{ color }}>
        {title}
      </span>
      {canRename && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setVal(title);
          }}
          onKeyDown={stop}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[13px] text-slate-400 hover:bg-white hover:text-slate-700"
          title="แก้ชื่อกลุ่ม — เปลี่ยนตระกูลของทุกรายการในกลุ่มนี้"
          aria-label={`แก้ชื่อกลุ่ม ${title}`}
        >
          ✎
        </button>
      )}
    </span>
  );
}

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
/**
 * 🔍 ตรงที่ "ตัว SKU เอง" (ชื่อ/รหัส/ชื่อที่เคยเรียก) — ขั้นแรกของการค้น
 * ถ้ามีตัวที่ตรงแบบนี้ ให้โชว์เฉพาะพวกนี้ · ไม่มีเลยค่อยถอยไปหาผ่านตระกูล/หมวด/ชื่อสินค้าที่ผูก (matchItem + ชื่อสินค้า)
 * เจ้าของร้านค้น "อะคริลิคใส" แล้วเจอฐาน Griptok ติดมา (ผูกกับ "กริ๊บต๊อกกระจกอะคริลิคใส") 1 ต.ค. 69 · แต่ "ปั๊มนูน" ยังต้องเจอฐาน Griptok (30 ก.ย. 69)
 */
function matchItemDirect(i: Item, needle: string) {
  // ⚠️ ไม่รวม "ชื่อที่เคยเรียก" — เปลี่ยนชื่อ SKU แล้วชื่อเดิมถูกเก็บเป็น alias ซึ่งมักมีชื่อสินค้าแม่ติดมา
  //    (ฐาน Griptok เคยชื่อ "กริ๊บต๊อกกระจกอะคริลิคใส · ฐาน…") → ค้น "อะคริลิคใส" แล้วติดมาทั้งที่ชื่อปัจจุบันไม่มี · alias ยังค้นเจอในขั้นสอง
  return [i.name, i.code].filter(Boolean).some((s) => String(s).toLowerCase().includes(needle));
}
/**
 * ผลค้นในช่องเลือกวัสดุ (วัสดุแฝงของสินค้า / ของตัวเลือก) — ของในคลังวัสดุแฝงกลางขึ้นก่อนเสมอ แล้วค่อยตามด้วยของอื่นตามลำดับเดิม
 * เดิมตัดไว้ 8 ตัวแรกตามลำดับตาราง: คำกว้าง ๆ อย่าง "A3" ชนกรอบรูป/ขนาดสกรีน/ตะขอ AA3 เต็ม 8 ก่อน
 * "SHIKISHI · A3" ที่เพิ่งสร้างเข้าคลังเลยไม่โผล่ ทั้งที่คลังกลางค้นเจอ (เจ้าของร้านแจ้ง 30 ก.ย. 69)
 */
const PICK_LIMIT = 30;
function rankLibFirst<T>(list: T[], isLib: (t: T) => boolean): T[] {
  return [...list.filter(isLib), ...list.filter((t) => !isLib(t))].slice(0, PICK_LIMIT);
}

// ─────────────────────────── ชิ้นส่วนร่วม ───────────────────────────

function Banner({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <p className={`mb-4 rounded-xl px-4 py-2.5 text-sm font-medium ring-1 ${TONE[tone].bg} ${TONE[tone].text} ${TONE[tone].ring}`}>
      {children}
    </p>
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
  // 📦 กรอกเป็นแพ็ค (เฉพาะของที่ตั้ง packSize) — ระบบคูณเป็นหน่วยฐานให้ก่อนบันทึก
  const [inPack, setInPack] = useState(false);
  const packOn = !!sel && hasPack(sel) && inPack;

  const raw = Number(qty);
  const n = packOn ? raw * (sel?.packSize ?? 1) : raw;
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
    // จดในหมายเหตุว่ากรอกมาเป็นกี่แพ็ค — ประวัติอ่านย้อนได้ว่า "เบิก 2 แพ็ค" ไม่ใช่แค่ -200
    const packNote = packOn ? `${fmtN(raw)} ${sel.packUnit || "แพ็ค"}` : "";
    const fullNote = [note.trim(), packNote ? `(${packNote})` : ""].filter(Boolean).join(" ");
    const done = await onSubmit(sel.id, mode === "in" ? n : -n, reason, fullNote || undefined, refId || undefined);
    setBusy(false);
    if (done) {
      setSel(null);
      setInPack(false);
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
            <SkuPicker
              items={items}
              value={sel}
              onChange={(i) => {
                setSel(i);
                setInPack(false);
              }}
            />
          </div>
          <label className="block">
            <span className={fieldLabel}>จำนวน *{packOn ? ` (${sel?.packUnit || "แพ็ค"})` : sel ? ` (${sel.unit})` : ""}</span>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="0"
              className={`${inputCls} text-right tabular-nums`}
            />
            {/* 📦 สลับหน่วย: ของที่ตั้งแพ็คไว้กรอกเป็นแพ็คหรือหน่วยย่อยก็ได้ */}
            {sel && hasPack(sel) && (
              <span className="mt-1.5 flex items-center gap-1 text-[11px]">
                <UnitSwitch unit={sel.unit} packUnit={sel.packUnit || "แพ็ค"} inPack={inPack} onChange={setInPack} />
                {qty !== "" && packOn && (
                  <span className="text-slate-500">
                    = {fmtN(n)} {sel.unit}
                  </span>
                )}
              </span>
            )}
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
                    {packText(sel, after) ? ` (${packText(sel, after)})` : ""}
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
              : `คงเหลือหลังเบิก ${fmtN(after)} ${sel.unit}${packText(sel, after) ? ` (${packText(sel, after)})` : ""}`}
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
  onProductPer,
  onChoicePer,
  onLinkExtra,
  onUnlinkHang,
  stat,
  moves,
  mayEdit,
  onClose,
  onEdit,
  tab,
  onTab,
  allCats,
  allFams,
  allParts,
  onSaveEdit,
  onDuplicate,
  onCount,
  onMove,
  onDelete,
  onNoStock,
  onReviewed,
  onReset,
  onMoveCategory,
  onRename,
  onImage,
}: {
  item: Item;
  image?: string;
  usage: StockUsage[];
  suggest: StockSuggest[];
  linksReady: boolean;
  products: ProductLite[];
  skus: { id: string; name: string; code?: string; img?: string; /** อยู่ในคลังวัสดุแฝงกลาง — เสนอก่อนในช่องเลือก */ lib?: boolean }[];
  hangs: HangRow[];
  onLink: (t: StockSuggest) => Promise<boolean>;
  onUnlink: (t: StockUsage) => Promise<boolean>;
  /** 📦 งานขายเป็นเซ็ต — ตั้งว่า 1 ที่ลูกค้าสั่งตัดกี่หน่วย (เฉพาะลิงก์กับตัวสินค้า) */
  onProductPer: (u: StockUsage, per: number) => Promise<boolean>;
  /** 📦 อย่างเดียวกันแต่ฝั่งลิงก์กับตัวเลือก/คลังกลาง (choice.stockQtyPer) — ไม่รวมลิงก์มีเงื่อนไข */
  onChoicePer: (u: StockUsage, per: number) => Promise<boolean>;
  onLinkExtra: (p: ExtraLinkPayload) => Promise<string | null>;
  onUnlinkHang: (h: HangRow) => Promise<boolean>;
  stat?: Stat;
  moves: Move[];
  mayEdit: boolean;
  onClose: () => void;
  /** ไปแท็บ "แก้ไขข้อมูล" (ปุ่มตั้งจุดสั่ง/ผูกสินค้าเรียกใช้) */
  onEdit: () => void;
  tab: DrawerTab;
  onTab: (t: DrawerTab) => void;
  allCats: string[];
  allFams: string[];
  allParts: string[];
  /** บันทึกฟอร์มแก้ไขในแท็บ — ทางเดียวกับหน้าเพิ่มวัสดุ (POST /api/admin/stock) */
  onSaveEdit: (b: Partial<Item> & { name: string }) => Promise<boolean>;
  /** ⧉ ทำซ้ำ — เพิ่มอีกบรรทัดทันทีในกลุ่มเดียวกัน ข้อมูลเหมือนตัวนี้ (ยอด 0 ไม่ก๊อปลิงก์) */
  onDuplicate: () => void;
  onCount: () => void;
  /** 📥 รับเข้า / เบิก ของ SKU ตัวเดียวจากลิ้นชัก — เดิมทำได้แค่ที่หัวกลุ่ม "ชนิดของ" ซึ่งวัสดุแฝงไม่มี (เจ้าของร้านถาม 23 ก.ย. 69) */
  onMove: (mode: "in" | "out") => void;
  onDelete: () => void;
  onNoStock: (on: boolean) => void;
  onReviewed: () => void;
  /** 🧹 รีเซ็ตยอดเป็น 0 — ส่งมาเฉพาะเจ้าของร้าน (ไม่ส่ง = ไม่มีปุ่ม) */
  onReset?: () => void;
  /** 🗂 ย้ายหมวดของตัวนี้ (ไม่ต้องเปิดฟอร์มแก้ไขทั้งใบ) */
  onMoveCategory?: () => void;
  onRename: (name: string) => Promise<boolean>;
  onImage: (url: string) => Promise<boolean>;
}) {
  const [editName, setEditName] = useState<string | null>(null);
  const [imgOpen, setImgOpen] = useState(false);
  /** เมนู ⋯ ท้ายลิ้นชัก (ไม่ต้องมี stock / รีเซ็ต) — ปุ่มแถวเดียวเคยล้นจอมือถือจน "ลบ" โดนตัด (1 ต.ค. 69) */
  const [moreOpen, setMoreOpen] = useState<string | null>(null);
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
            <Thumb src={image} name={item.name} size={60} />
            {mayEdit && (
              <button type="button" onClick={() => setImgOpen((v) => !v)} className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                {imgOpen ? "ปิด" : "เปลี่ยนรูป"}
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
              {item.category && item.category !== item.family && <span className="text-[11px] text-slate-400">· {item.category}</span>}
              {item.needsReview && <span className={`${badge} ${TONE.review.bg} ${TONE.review.text}`}>รอตรวจ</span>}
              {item.manualOnly && (
                <span className={`${badge} ${TONE.neutral.bg} ${TONE.neutral.text}`} title="ของใช้ในโรงงาน — พนักงานเบิกเอง ไม่ผูกกับสินค้า">
                  🏭 เบิกเองอย่างเดียว
                </span>
              )}
            </p>
          </div>
          <button type="button" onClick={onClose} className={btnSmGhost} aria-label="ปิด">
            ✕
          </button>
        </header>
        {imgOpen && <ImagePanel onSave={async (url) => (await onImage(url)) && setImgOpen(false)} onClose={() => setImgOpen(false)} />}

        {/* แท็บ: งานประจำอยู่ "ภาพรวม" · แก้ไขข้อมูลอยู่ในลิ้นชักเดียวกัน (เดิมเด้งไปหน้าเต็ม เจ้าของร้านขอรวม 1 ต.ค. 69) · ประวัติแยกออกมาจะได้ไม่ต้องเลื่อนผ่าน */}
        <nav className="flex gap-1 border-b border-slate-100 px-5" role="tablist" aria-label="ส่วนของลิ้นชัก">
          {(
            [
              { id: "overview" as const, label: "ภาพรวม" },
              ...(mayEdit ? [{ id: "edit" as const, label: "แก้ไขข้อมูล" }] : []),
              { id: "history" as const, label: `ประวัติ${moves.length ? ` (${fmtN(moves.length)})` : ""}` },
            ] as { id: DrawerTab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTab(t.id)}
              className={`-mb-px min-h-[42px] border-b-2 px-3 text-[13px] font-medium transition ${
                tab === t.id ? "border-amber-500 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "edit" && mayEdit && (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* key = id → สลับวัสดุแล้วฟอร์มเริ่มใหม่จากค่าของตัวนั้น ไม่ค้างของตัวก่อน */}
            <ItemModal
              key={item.id}
              embedded
              item={item}
              products={products}
              allCats={allCats}
              allFams={allFams}
              allParts={allParts}
              onClose={() => onTab("overview")}
              onSave={async (b) => {
                if (await onSaveEdit(b)) onTab("overview");
              }}
            />
          </div>
        )}

        {tab === "history" && (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <p className={labelCls}>ประวัติการเคลื่อนไหว</p>
            <div className="mt-1.5">
              {moves.slice(0, 80).map((m) => {
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
              {moves.length === 0 && <p className="py-6 text-center text-xs text-slate-400">ยังไม่มีการเคลื่อนไหว</p>}
            </div>
          </div>
        )}

        <div className={`flex-1 overflow-y-auto px-5 py-4${tab === "overview" || (tab === "edit" && !mayEdit) ? "" : " hidden"}`}>
          {/*
           * โครงลิ้นชัก (รื้อ 1 ต.ค. 69): ① ยอด+ตัวเทียบ ② ปุ่มงานประจำ ③ รายการต้องจัดการ ④ สถิติ ⑤ ผูกสินค้า
           * เดิมยอดลอยเดี่ยว ป้ายซ้ำกับกล่องเตือน การ์ดสถิติ 6 ใบส่วนใหญ่เป็น "—" กินครึ่งจอ ปุ่ม 3 สี ปุ่มท้ายล้นจอมือถือ
           */}
          {(() => {
            const neg = item.balance < 0;
            const pt = !neg && !item.noStock ? (stat?.point ?? null) : null;
            // แถบเทียบ: เต็มหลอด = 2 เท่าของจุดสั่ง · ขีดกลาง = จุดสั่ง → ยอดอยู่ซ้ายขีด = ต้องสั่ง
            const pct = pt != null && pt > 0 ? Math.min(100, Math.round((item.balance / (pt * 2)) * 100)) : null;
            const tone: Tone = neg ? "danger" : pt != null ? level : "neutral";
            const line = neg
              ? `ติดลบ — ขายไป ${fmtN(-item.balance)} ${item.unit} ก่อนเคยรับเข้า`
              : item.noStock
                ? "ไม่ต้องมี stock — ไม่เตือนสั่ง ไม่นับมูลค่า"
                : pt != null
                  ? `จุดสั่ง ≤ ${fmtN(pt)}${item.reorderPoint == null ? " (แนะนำ)" : ""}${
                      level === "danger" ? " · ถึงจุดต้องสั่ง" : level === "warn" ? " · ใกล้ถึงจุดสั่ง" : stat?.daysLeft != null ? ` · หมดใน ~${fmtN(stat.daysLeft)} วัน` : ""
                    }`
                  : "ยังไม่ตั้งจุดสั่ง — ระบบยังเตือนให้ไม่ได้";
            const pack = packText(item, item.balance);
            return (
              <div>
                <p className={`flex flex-wrap items-baseline gap-x-2 ${metric} ${neg ? TONE.danger.text : ""}`}>
                  <span>
                    {fmtN(item.balance)} <span className="text-sm font-medium text-slate-400">{item.unit}</span>
                  </span>
                  {pack && <span className="text-sm font-medium tabular-nums text-slate-500">= {pack}</span>}
                </p>
                {pct != null && (
                  <div className="relative mt-2.5 h-1.5 rounded-full bg-slate-100" aria-hidden>
                    <span className={`absolute inset-y-0 left-0 rounded-full ${TONE[tone].bar}`} style={{ width: `${pct}%` }} />
                    <span className="absolute -inset-y-0.5 left-1/2 w-0.5 rounded-full bg-slate-500" title={`จุดสั่ง ${fmtN(pt!)}`} />
                  </div>
                )}
                <p className={`mt-1.5 text-xs font-medium ${TONE[tone].text}`}>{line}</p>
              </div>
            );
          })()}

          {/* งานประจำ 3 ปุ่ม ชุดเดียวกัน (เดิมดำ/ขาว/ฟ้า 3 สี) — รับเข้าเป็นปุ่มหลัก · สูง 48 กดด้วยนิ้วโป้ง */}
          {mayEdit && (
            <div className={`mt-4 grid gap-2 ${item.noStock ? "grid-cols-1" : "grid-cols-3"}`}>
              {!item.noStock && (
                <>
                  <button
                    type="button"
                    onClick={() => onMove("in")}
                    className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold bg-amber-500 text-white shadow-sm transition hover:bg-amber-600"
                  >
                    <span className="text-base leading-none" aria-hidden>＋</span>รับเข้า
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove("out")}
                    className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                  >
                    <span className="text-base leading-none" aria-hidden>−</span>เบิกออก
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onCount}
                className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                <span className="text-base leading-none" aria-hidden>≡</span>นับจริง
              </button>
            </div>
          )}

          {/* 🏷 ป้าย QR ชั้นวาง — ลิงก์เห็นชัดใต้ปุ่มงานประจำ (เดิมอยู่แค่ในเมนู ⋯ ท้ายลิ้นชัก เจ้าของร้านหาไม่เจอ 1 ต.ค. 69) */}
          {mayEdit && !item.noStock && (
            <a
              href={`/admin/stock/labels?ids=${encodeURIComponent(item.id)}`}
              className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              title="พิมพ์ป้ายติดชั้นวาง — พนักงานสแกนด้วยกล้องมือถือแล้วเปิดหน้าเบิกของตัวนี้ทันที"
            >
              <span aria-hidden>🏷</span> พิมพ์ป้าย QR ชั้นวาง (สแกน = เบิก)
            </a>
          )}

          {/* รายการ "ต้องจัดการ" ของตัวนี้ — ทุกแถวมีปุ่มทำให้จบตรงนั้น · จุดสี+ตัวหนาแยกชนิดกัน ไม่พึ่งสีอย่างเดียว */}
          {(() => {
            type Todo = { key: string; tone: Tone; title: string; desc: string; action?: { label: string; onClick: () => void } };
            const todo: Todo[] = [];
            if (item.balance < 0)
              todo.push({
                key: "neg",
                tone: "danger",
                title: "นับของจริงก่อน",
                desc: `ขายไป ${fmtN(-item.balance)} ${item.unit} ก่อนเคยรับเข้า ตัวเลขยังเชื่อไม่ได้`,
                action: mayEdit ? { label: "นับจริง", onClick: onCount } : undefined,
              });
            else if (!item.noStock && stat?.point != null && (level === "danger" || level === "warn"))
              todo.push({
                key: "order",
                tone: level,
                title: level === "danger" ? "ถึงจุดต้องสั่ง" : "ใกล้ถึงจุดสั่ง",
                desc: `เหลือ ${fmtN(item.balance)} ${item.unit} · จุดสั่ง ${fmtN(stat.point)}${item.leadTimeDays ? ` · รอของ ${item.leadTimeDays} วัน` : ""}`,
                action: mayEdit ? { label: "รับเข้า", onClick: () => onMove("in") } : undefined,
              });
            else if (!item.noStock && stat?.point == null)
              todo.push({
                key: "point",
                tone: "neutral",
                title: "ตั้งจุดสั่ง",
                desc: `ใส่ตัวเลขไว้ ระบบจะเตือน “ต้องสั่ง” ให้เองเมื่อของเหลือถึงจุดนั้น${stat && stat.perDay > 0 ? ` (ตอนนี้ใช้เฉลี่ย ${stat.perDay.toFixed(1)} ${item.unit}/วัน)` : ""}`,
                action: mayEdit ? { label: "ตั้งจุดสั่ง", onClick: onEdit } : undefined,
              });
            if (item.needsReview)
              todo.push({
                key: "review",
                tone: "review",
                title: "รอตรวจ",
                desc: `มาจากการนำเข้า ยังไม่มีคนยืนยันชื่อ/หน่วย/ตระกูล${item.maybeDuplicateOf ? ` · อาจซ้ำกับ ${item.maybeDuplicateOf}` : ""}`,
                action: mayEdit ? { label: "✓ ตรวจแล้ว", onClick: onReviewed } : undefined,
              });
            if (item.noStock)
              todo.push({
                key: "nostock",
                tone: "neutral",
                title: "ไม่ต้องมี stock",
                desc: "ไม่เตือนสั่ง ไม่นับมูลค่า ขายแล้วไม่ตัดยอด",
                action: mayEdit ? { label: "กลับมานับสต๊อก", onClick: () => onNoStock(false) } : undefined,
              });
            if (!todo.length) return null;
            return (
              <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {todo.map((t) => (
                  <li key={t.key} className="flex items-center gap-3 px-3 py-2.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${TONE[t.tone].bar}`} aria-hidden />
                    <span className="min-w-0 flex-1 text-xs leading-snug">
                      <span className={`font-semibold ${TONE[t.tone].text}`}>{t.title}</span>
                      <span className="text-slate-500"> — {t.desc}</span>
                    </span>
                    {t.action && (
                      <button type="button" onClick={t.action.onClick} className={`${btnSmNeutral} shrink-0`}>
                        {t.action.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            );
          })()}

          {/* สถิติ — แถวบาง ๆ เฉพาะที่มีค่า (เดิมการ์ด 6 ใบส่วนใหญ่ "—") · "ผูกสินค้า N ตัว" ย้ายไปอยู่หัวส่วนผูกสินค้า */}
          {(() => {
            const rows = (
              [
                ["ใช้เฉลี่ย/วัน", stat && stat.perDay > 0 ? `${stat.perDay.toFixed(1)} ${item.unit}` : null],
                ["จะหมดใน", stat?.daysLeft != null ? `~${fmtN(stat.daysLeft)} วัน` : null],
                ["รอของ", item.leadTimeDays ? `${item.leadTimeDays} วัน` : null],
                ["ทุน/หน่วย", item.unitCost ? `฿${fmtN(item.unitCost)}` : null],
                ["มูลค่าคงเหลือ", item.unitCost ? `฿${fmtN(Math.round(Math.max(0, item.balance) * item.unitCost))}` : null],
              ] as [string, string | null][]
            ).filter((r): r is [string, string] => !!r[1]);
            return rows.length ? (
              <dl className="mt-4 grid grid-cols-2 gap-x-5">
                {rows.map(([k, v]) => (
                  <Fact key={k} k={k} v={v} />
                ))}
              </dl>
            ) : (
              <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
                ยังไม่มีสถิติการใช้ — ระบบคำนวณให้เองหลังมีการขาย/เบิก · ทุน/หน่วยกับเวลารอของใส่ได้ที่ “แก้ไขข้อมูล”
              </p>
            );
          })()}

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
            onProductPer={onProductPer}
            onChoicePer={onChoicePer}
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

          {moves.length > 0 && (
            <button type="button" onClick={() => onTab("history")} className="mt-5 text-[12px] text-slate-500 underline underline-offset-2 hover:text-slate-800">
              ดูประวัติ {fmtN(moves.length)} รายการ →
            </button>
          )}
        </div>

        {mayEdit && tab !== "edit" && (
          /*
           * แถบท้ายลิ้นชัก = งานนาน ๆ ครั้ง · เห็น 2 ปุ่ม (ทำซ้ำ · ย้ายหมวด) + เมนู ⋯ (ไม่ต้องมี stock · รีเซ็ต) + ลบขวาสุด
           * เดิมเรียง 5 ปุ่มแถวเดียวล้นจอมือถือ "ลบ" โดนตัด (1 ต.ค. 69) · ลบยังแยกขวาสุด ไม่ให้เผลอกดแทนปุ่มอื่น
           */
          <footer className="flex items-center gap-1 border-t border-slate-100 bg-slate-50/60 px-3 py-2">
            <button type="button" onClick={onDuplicate} className={`${btnSmGhost} min-h-[40px] whitespace-nowrap`} title="เพิ่มอีกบรรทัดทันทีในกลุ่มเดียวกัน ข้อมูลเหมือนตัวนี้ (ยอด 0 ไม่ก๊อปลิงก์สินค้า) แล้วค่อยกดแก้ไขที่แถวใหม่">
              ⧉ ทำซ้ำ
            </button>
            {onMoveCategory && (
              <button type="button" onClick={onMoveCategory} className={`${btnSmGhost} min-h-[40px] whitespace-nowrap`} title="ย้ายไปหมวดอื่น">
                ย้ายหมวด
              </button>
            )}
            <span className="ml-auto flex items-center gap-1">
              {(() => {
                const more: MenuItem[] = [];
                // 🏷 ป้าย QR ชั้นวาง → สแกนแล้วเปิดหน้าเบิก /admin/stock/take/<id> (ของเบิกเองลืมกดเบิก = ยอดค้าง · 1 ต.ค. 69)
                if (!item.noStock) more.push({ icon: "🏷", label: "พิมพ์ป้าย QR ชั้นวาง (สแกน = เบิก)", href: `/admin/stock/labels?ids=${encodeURIComponent(item.id)}` });
                if (!item.noStock) more.push({ icon: "🚫", label: "ไม่ต้องมี stock", onClick: () => onNoStock(true) });
                else more.push({ icon: "↩", label: "กลับมานับสต๊อก", onClick: () => onNoStock(false) });
                // ขึ้นเสมอสำหรับเจ้าของร้าน (ซ่อนตอนยอด 0 แล้วหาไม่เจอ 30 ก.ย. 69) — ยอด 0 อยู่แล้วกดได้แต่ระบบบอกว่าไม่มีอะไรต้องล้าง
                if (onReset) more.push({ icon: "🧹", label: "รีเซ็ตยอดเป็น 0 (เจ้าของร้าน)", danger: true, onClick: onReset });
                return <ActionMenu id="drawer-more" open={moreOpen} setOpen={setMoreOpen} label="เพิ่มเติม" items={more} up />;
              })()}
              <button
                type="button"
                onClick={onDelete}
                className={`${btnSmGhost} min-h-[40px] whitespace-nowrap ${TONE.danger.text}`}
                title="ลบวัสดุนี้ออกจากคลัง"
                aria-label="ลบวัสดุนี้ออกจากคลัง"
              >
                ลบ
              </button>
            </span>
          </footer>
        )}
      </aside>
    </>
  );
}

/** แถวสถิติในลิ้นชัก — ชื่อซ้าย ค่าขวา คั่นเส้นบาง (การ์ดใบละตัวเลขเปลืองพื้นที่) */
function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 py-1.5">
      <dt className="text-[11px] text-slate-500">{k}</dt>
      <dd className="text-[13px] font-semibold tabular-nums text-slate-800">{v}</dd>
    </div>
  );
}

// ─────────────────────────── โมดัล ───────────────────────────

function ItemModal({
  item,
  embedded = false,
  products,
  allCats,
  allFams,
  allParts,
  onClose,
  onSave,
  onSaveMany,
  onSplitProduct,
}: {
  item: Item | null;
  /** ฝังในลิ้นชัก (แท็บแก้ไขข้อมูล): คอลัมน์เดียว ไม่มีแผงสรุปข้าง ปุ่มบันทึกติดล่าง */
  embedded?: boolean;
  products: ProductLite[];
  allCats: string[];
  allFams: string[];
  allParts: string[];
  onClose: () => void;
  onSave: (b: Partial<Item> & { name: string }) => void;
  /** 🧬 เพิ่มหลายตัวทีเดียว (ต่างกันแค่สี/ขนาด/ความยาว) — เจ้าของร้านขอ 30 ก.ย. 69 */
  onSaveMany?: (list: (Partial<Item> & { name: string })[]) => void;
  /** 🔗 วางลิงก์/ชื่อสินค้า → ไปหน้าต่าง "แยกสต๊อกตามตัวเลือก" เลือกตัวเลือกที่จะทำเป็นวัสดุ (เจ้าของร้านขอ 30 ก.ย. 69) */
  onSplitProduct?: (p: { id: string; name: string }) => void;
}) {
  const base: Item | null = item;
  /**
   * ➕ เพิ่มทีละหลายรายการ (เจ้าของร้านขอ 1 ต.ค. 69): ของใหม่พิมพ์ชื่อได้หลายบรรทัด แต่ละบรรทัด = วัสดุ 1 ตัว
   * ตั้งค่าอื่น (หน่วย/แพ็ค/หมวด/ตัดสต๊อก/จุดสั่ง) ใช้ร่วมกันทั้งชุด · วางข้อความหลายบรรทัดลงช่องเดียวแตกเป็นหลายบรรทัดให้เอง
   * ตอนแก้ไขมีบรรทัดเดียวเสมอ (name = names[0])
   */
  const [names, setNames] = useState<string[]>([item?.name ?? ""]);
  const name = names[0] ?? "";
  const setName = (v: string) => setNames((ns) => [v, ...ns.slice(1)]);
  const nameList = useMemo(() => [...new Set(names.map((x) => x.trim()).filter(Boolean))], [names]);
  const setNameAt = (i: number, v: string) =>
    setNames((ns) => {
      // วางหลายบรรทัดลงช่องเดียว → แตกเป็นบรรทัดละตัว
      const parts = v.split(/\r?\n/);
      if (parts.length <= 1) return ns.map((x, k) => (k === i ? v : x));
      return [...ns.slice(0, i), ...parts.map((x) => x.trim()).filter(Boolean), ...ns.slice(i + 1)];
    });
  const removeNameAt = (i: number) => setNames((ns) => (ns.length > 1 ? ns.filter((_, k) => k !== i) : [""]));
  /** รายการที่ต่างกัน (สี/ขนาด) คั่นด้วย , หรือขึ้นบรรทัดใหม่ → สร้าง "ชื่อ · ค่า" ทีละตัว ตั้งค่าอื่นเหมือนกันหมด */
  const [variants, setVariants] = useState("");
  const variantList = useMemo(() => [...new Set(variants.split(/[,\n]/).map((x) => x.trim()).filter(Boolean))], [variants]);
  /** ค้นสินค้าจากลิงก์/ชื่อ เพื่อดึงตัวเลือกทั้งหมดมาเลือกทำเป็นวัสดุ */
  const [prodQ, setProdQ] = useState("");
  const prodHits = useMemo(() => (prodQ.trim() ? products.filter((p) => matchProductQuery(p, prodQ)).slice(0, 6) : []), [products, prodQ]);
  const [codeVal, setCodeVal] = useState(item?.code ?? "");
  /** รหัส: ค่าเริ่มต้นให้ระบบตั้งจากชื่อ (เจ้าของร้านขอ 30 ก.ย. 69) · กด "แก้เอง" ถึงพิมพ์ได้ · ของเดิมที่มีรหัสแล้ว = แก้เองตลอด */
  const [codeManual, setCodeManual] = useState(!!item?.code);
  /** ตัวอย่างรหัสที่ระบบจะตั้ง — สูตรเดียวกับ codeSlug ฝั่งเซิร์ฟเวอร์ (ชื่อไทยล้วน → M-xxxx ตอนบันทึก) */
  const codePreview = name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase().slice(0, 24);
  const [unit, setUnit] = useState(base?.unit ?? "ชิ้น");
  const [family, setFamily] = useState(base?.family ?? "");
  const [category, setCategory] = useState(base?.category ?? "");
  const [reorderPoint, setReorderPoint] = useState(base?.reorderPoint != null ? String(base.reorderPoint) : "");
  const [leadTimeDays, setLeadTimeDays] = useState(base?.leadTimeDays != null ? String(base.leadTimeDays) : "");
  const [unitCost, setUnitCost] = useState(base?.unitCost ? String(base.unitCost) : "");
  const [aliases, setAliases] = useState((item?.aliases ?? []).join(", "));
  const [productIds, setProductIds] = useState<string[]>(item?.productIds ?? []);
  const [imageUrl, setImageUrl] = useState(base?.imageUrl ?? "");
  const [part, setPart] = useState(base?.part ?? "");
  // 📦 หน่วยแพ็ค + 🏭 เบิกเองอย่างเดียว (เจ้าของร้านสั่ง 30 ก.ย. 69 — กระดาษ/อะคริลิคซื้อเป็นแพ็ค ใช้เป็นแผ่น)
  const [packUnit, setPackUnit] = useState(base?.packUnit ?? "");
  const [packSize, setPackSize] = useState(base?.packSize && base.packSize > 1 ? String(base.packSize) : "");
  const [manualOnly, setManualOnly] = useState(!!base?.manualOnly);
  // 🧩 วัสดุกลางตามตัวเลือก — หัวกลุ่มหน้าคลังเป็นชื่อกลุ่มตัวเลือก ไม่ใช่ชื่อสินค้า (เจ้าของร้านสั่ง 1 ต.ค. 69)
  const [groupByOption, setGroupByOption] = useState(!!base?.groupByOption);

  const u = unit.trim() || "ชิ้น";
  const pu = packUnit.trim() || "แพ็ค";
  const hasPack = !!packUnit.trim() && Number(packSize) > 1;
  const canSave = item ? !!name.trim() : nameList.length > 0;
  const payload = (nm: string, alias?: string): Partial<Item> & { name: string } => ({
      id: item?.id,
      name: nm,
      // อัตโนมัติ = ไม่ส่ง ให้เซิร์ฟเวอร์ตั้งจากชื่อ (กันซ้ำที่นั่น) · เพิ่มหลายตัวทีเดียวห้ามใช้รหัสเดียวกันทั้งชุด → ปล่อยให้ระบบตั้ง
      code: codeManual && nameList.length <= 1 && !variantList.length ? codeVal.trim() || undefined : undefined,
      unit,
      family: family.trim() || undefined,
      category: category || undefined,
      reorderPoint: reorderPoint ? Number(reorderPoint) : undefined,
      leadTimeDays: leadTimeDays ? Number(leadTimeDays) : undefined,
      // ล้างช่อง = ส่ง 0 ไปลบทุนออก (undefined จะกลายเป็น "ไม่แตะ" แล้วค่าเก่าค้าง)
      unitCost: unitCost.trim() === "" ? 0 : Number(unitCost),
      aliases: [...aliases.split(",").map((x) => x.trim()).filter(Boolean), ...(alias ? [alias] : [])],
      productIds: manualOnly ? [] : productIds,
      // ล้างช่อง = ส่ง "" ให้เซิร์ฟเวอร์ลบรูปที่ตั้งเองออก
      imageUrl: imageUrl.trim(),
      part: part.trim(), // ว่าง = ล้างชนิดของ
      packUnit: packUnit.trim(),
      packSize: packSize ? Number(packSize) : 0, // 0 = ล้างหน่วยแพ็ค
      manualOnly,
      groupByOption: manualOnly ? false : groupByOption,
    });
  // ของใหม่ + ใส่รายการสี/ขนาดไว้ = สร้างทีละตัว "ชื่อ · ค่า" (ค่าเป็นชื่อที่เคยเรียกด้วย ค้น "ขาว" เจอ) · ไม่งั้นบันทึกตัวเดียวตามเดิม
  /** รายการที่จะสร้างจริง (ของใหม่): ทุกชื่อ × ทุกค่าสี/ขนาด (ถ้าใส่) · ไม่มีสี/ขนาด = ชื่อละตัว */
  const batch = useMemo(
    () => (item ? [] : nameList.flatMap((nm) => (variantList.length ? variantList.map((v) => ({ nm: `${nm} · ${v}`, alias: v })) : [{ nm, alias: undefined as string | undefined }]))),
    [item, nameList, variantList],
  );
  const save = () => (!item && batch.length > 1 && onSaveMany ? onSaveMany(batch.map((b) => payload(b.nm, b.alias))) : onSave(payload(batch[0]?.nm ?? name, batch[0]?.alias)));
  const hint = "mt-1 block text-[11.5px]";
  const hintStyle = { color: "var(--dk-faint)" } as const;
  /** บรรทัดสรุปในแผงขวา — ให้คนเห็นผลของที่กรอกเป็นภาษาคน ไม่ต้องไล่อ่านทุกช่อง */
  const summary: { k: string; v: string; warn?: boolean }[] = [
    { k: "รหัส", v: codeVal.trim() || "ออกให้เองตอนบันทึก" },
    { k: "นับเป็น", v: hasPack ? `${u} · 1 ${pu} = ${fmtN(Number(packSize))} ${u}` : u },
    manualOnly
      ? { k: "ตัดตอนขาย", v: "ไม่ตัด — ของใช้ในโรงงาน เบิกเอง" }
      : productIds.length
        ? { k: "ตัดตอนขาย", v: `${fmtN(productIds.length)} สินค้า · ขาย 1 ชิ้นตัด 1 ${u}` }
        : { k: "ตัดตอนขาย", v: "ยังไม่ผูกสินค้า", warn: true },
    reorderPoint
      ? { k: "เตือนสั่ง", v: `เหลือ ≤ ${fmtN(Number(reorderPoint))} ${u}${leadTimeDays ? ` · รอของ ${leadTimeDays} วัน` : ""}` }
      : { k: "เตือนสั่ง", v: "ยังไม่ตั้ง — ระบบเดาจากสถิติให้ทีหลัง", warn: true },
    { k: "ทุน", v: unitCost.trim() ? `฿${unitCost}/${u}` : "ยังไม่ใส่ — รายงานกำไรจะไม่นับตัวนี้" },
  ];

  // ในลิ้นชักกว้างแค่ ~26rem — breakpoint sm วัดจากจอ ไม่ใช่จากลิ้นชัก จึงกำหนดคอลัมน์ตรง ๆ (ช่องตัวเลขสั้น ๆ วาง 2–3 ช่องต่อแถวได้)
  const g2 = embedded ? "grid grid-cols-2 gap-3" : "grid gap-3 sm:grid-cols-2";
  const g3 = embedded ? "grid grid-cols-3 gap-2" : "grid gap-3 sm:grid-cols-3";
  const sec = { plain: embedded };
  /** ช่องใน "เพิ่มเติม" ที่มีค่าอยู่ — เปิดกลุ่มไว้ให้เห็นถ้ามีของ ไม่งั้นพับ (รหัส/ตระกูล/ชนิด/ชื่อเดิม/รูป ใช้ไม่บ่อย) */
  const extraFilled = [codeManual ? codeVal : "", family, part, aliases, imageUrl].filter((x) => x.trim()).length;
  /** การ์ดเลือก "ตัดตอนขาย / เบิกเอง" — ปุ่มเลือก 2 ใบแทนช่องติ๊ก ให้เห็นทั้งสองทางแล้วเลือก ไม่ต้องตีความว่าติ๊กแปลว่าอะไร */
  const choiceCard = (on: boolean) =>
    `flex min-h-[64px] cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
      on ? "border-amber-500 bg-amber-500 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    }`;
  /*
   * ── ฟอร์มเรียงตามคำถามที่คนกรอกคิดจริง (รื้อ 1 ต.ค. 69) ──
   * ① ชื่อ·หน่วย·หมวด ② นับยังไง (แพ็ค) ③ ตัดสต๊อกตอนขายไหม (เลือก 2 ทาง) ④ เตือนสั่ง+ทุน ⑤ เพิ่มเติม (พับ: รหัส/ตระกูล/ชนิด/ชื่อเดิม/รูป)
   * เดิมหมวด 1 มี 8 ช่องรวมของที่นาน ๆ ใช้ (รหัส ชนิด ตระกูล ชื่อเดิม URL รูป) คนกรอกต้องไล่อ่านทุกช่องกว่าจะถึงของสำคัญ
   */
  const form = (
        <div className={embedded ? "min-w-0 flex-1 space-y-5" : "min-w-0 flex-1 space-y-4"}>
          <FormSection {...sec} n={1} title={item ? "ชื่อและหน่วย" : "ของชิ้นนี้คืออะไร"} hint="ชื่อกับหน่วยคือของบังคับ ที่เหลือใส่ทีหลังได้">
            {!item && onSplitProduct && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-3">
                <span className={fieldLabel}>🔗 มีสินค้าอยู่แล้ว? วางลิงก์หรือพิมพ์ชื่อสินค้า — ระบบดึงตัวเลือกทั้งหมดมาให้เลือกทำเป็นวัสดุทีเดียว</span>
                <input
                  value={prodQ}
                  onChange={(e) => setProdQ(e.target.value)}
                  placeholder="วางลิงก์หน้าสินค้า หรือพิมพ์ชื่อ เช่น กรอบรูปอะคริลิค"
                  className={inputCls}
                />
                {prodHits.length > 0 && (
                  <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {prodHits.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => onSplitProduct(p)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
                          <Thumb src={p.img} name={p.name} size={28} />
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                          <span className="shrink-0 text-[11px] text-slate-400">เลือกตัวเลือก →</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {prodQ.trim() !== "" && !prodHits.length && <span className={`mt-1 block text-[11px] text-slate-400`}>ไม่พบสินค้าที่ตรง</span>}
              </div>
            )}
            {item ? (
              <label className="block">
                <span className={fieldLabel}>ชื่อวัสดุ *</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ไหมเย็บ ขาว (1803)" className={`${inputCls} !h-12 text-base font-semibold`} />
              </label>
            ) : (
              <div>
                <span className={`${fieldLabel} flex items-center justify-between`}>
                  <span>ชื่อวัสดุ * {names.length > 1 ? <span className="font-normal text-slate-400">— {fmtN(names.length)} บรรทัด = {fmtN(names.length)} ตัว</span> : null}</span>
                  <span className="font-normal text-slate-400">Enter = บรรทัดถัดไป · วางหลายบรรทัดได้</span>
                </span>
                <div className="space-y-1.5">
                  {names.map((v, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{i + 1}</span>
                      <textarea
                        autoFocus={i === 0 || i === names.length - 1}
                        value={v}
                        rows={1}
                        onChange={(e) => setNameAt(i, e.target.value)}
                        onKeyDown={(e) => {
                          // Enter = เพิ่มบรรทัดใหม่ต่อท้ายบรรทัดนี้ (ไม่ขึ้นบรรทัดในช่อง) · Backspace ช่องว่าง = ลบบรรทัด
                          if (e.key === "Enter") {
                            e.preventDefault();
                            setNames((ns) => [...ns.slice(0, i + 1), "", ...ns.slice(i + 1)]);
                          } else if (e.key === "Backspace" && !v && names.length > 1) {
                            e.preventDefault();
                            removeNameAt(i);
                          }
                        }}
                        placeholder={i === 0 ? "เช่น ไหมเย็บ ขาว (1803)" : "ชื่อวัสดุตัวถัดไป"}
                        className={`${inputCls} !h-12 min-w-0 flex-1 resize-none py-3 text-base font-semibold`}
                      />
                      <button
                        type="button"
                        onClick={() => removeNameAt(i)}
                        disabled={names.length === 1 && !v}
                        className="h-10 w-10 shrink-0 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        aria-label={`ลบบรรทัดที่ ${i + 1}`}
                        title="ลบบรรทัดนี้"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setNames((ns) => [...ns, ""])} className={`${btnSmNeutral} mt-2`}>
                  ＋ เพิ่มอีกบรรทัด
                </button>
              </div>
            )}
            {!item && onSaveMany && (
              <label className="block">
                <span className={fieldLabel}>🧬 แตกตามสี/ขนาด/ความยาว (ไม่บังคับ) — ใส่แล้วทุกชื่อข้างบนจะได้ตัวละ 1 ค่า เช่น “ไหมเย็บ · ขาว” (คั่นด้วย , หรือขึ้นบรรทัดใหม่)</span>
                <textarea
                  value={variants}
                  onChange={(e) => setVariants(e.target.value)}
                  rows={2}
                  placeholder="เช่น ขาว, ดำ, แดง  หรือ  1 เมตร, 2 เมตร, 5 เมตร"
                  className={`${inputCls} !h-auto py-2`}
                />
                {batch.length > 1 && (
                  <span className="mt-1 block text-[11.5px] text-slate-500">
                    จะสร้าง <b>{fmtN(batch.length)}</b> ตัว: {batch.slice(0, 5).map((b) => b.nm).join(", ")}
                    {batch.length > 5 ? ` … และอีก ${fmtN(batch.length - 5)}` : ""} — หน่วย/แพ็ค/หมวด/สินค้าที่ผูก/จุดสั่ง ใช้ค่าเดียวกันทั้งชุด
                  </span>
                )}
              </label>
            )}
            <div className={g2}>
              <label className="block">
                <span className={fieldLabel}>หน่วยนับ (เล็กสุด) *</span>
                <UnitSelect options={BASE_UNITS} value={unit} onChange={setUnit} emptyLabel="— เลือกหน่วย —" placeholder="พิมพ์หน่วยเอง" />
              </label>
              <label className="block">
                <span className={fieldLabel}>หมวด</span>
                <UnitSelect options={allCats} value={category} onChange={setCategory} emptyLabel="— เลือกหมวด —" placeholder="พิมพ์หมวดใหม่" />
              </label>
            </div>
          </FormSection>

          <FormSection {...sec} n={2} title="นับยังไง" hint="ยอดคงเหลือนับเป็นหน่วยเล็กสุดเสมอ ตั้งแพ็คไว้จะได้กรอกเร็วตอนรับเข้า/เบิก">
            <div className={g2}>
              <label className="block">
                <span className={fieldLabel}>ชื่อหน่วยแพ็ค (ไม่บังคับ)</span>
                <UnitSelect options={PACK_UNITS} value={packUnit} onChange={setPackUnit} emptyLabel="— ไม่ตั้งแพ็ค —" placeholder="พิมพ์ชื่อแพ็คเอง" />
              </label>
              <label className="block">
                <span className={fieldLabel}>
                  1 {pu} = กี่{u}
                </span>
                <input value={packSize} onChange={(e) => setPackSize(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="100" className={`${inputCls} text-right tabular-nums`} />
              </label>
            </div>
            <span className={hint} style={hintStyle}>
              {hasPack ? `หน้าจอจะบอกเป็น “3 ${pu} + 40 ${u}” และตอนรับเข้า/เบิกเลือกกรอกเป็น${pu}ได้` : "ยังไม่ตั้งแพ็ค — กรอกและแสดงเป็น" + u + "อย่างเดียว"}
            </span>
          </FormSection>

          <FormSection {...sec} n={3} title="ตัดสต๊อกตอนขายไหม" hint="เลือกทางเดียว — เปลี่ยนทีหลังได้ ยอดและประวัติไม่หาย">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ตัดสต๊อกตอนขายไหม">
              <button type="button" role="radio" aria-checked={!manualOnly} onClick={() => setManualOnly(false)} className={choiceCard(!manualOnly)}>
                <span className="mt-0.5 text-sm leading-none" aria-hidden>{!manualOnly ? "●" : "○"}</span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">ตัดตามการขาย</span>
                  <span className={`block text-[11px] leading-snug ${!manualOnly ? "text-white/80" : "text-slate-400"}`}>ลูกค้าสั่งสินค้าที่ผูกไว้ ยอดตัวนี้ลดเอง</span>
                </span>
              </button>
              <button type="button" role="radio" aria-checked={manualOnly} onClick={() => setManualOnly(true)} className={choiceCard(manualOnly)}>
                <span className="mt-0.5 text-sm leading-none" aria-hidden>{manualOnly ? "●" : "○"}</span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">เบิกเองอย่างเดียว</span>
                  <span className={`block text-[11px] leading-snug ${manualOnly ? "text-white/80" : "text-slate-400"}`}>ของใช้ในโรงงาน ยอดขยับเฉพาะรับเข้า/เบิก/นับจริง</span>
                </span>
              </button>
            </div>
            {!manualOnly && (
              <>
                <div>
                  <span className={fieldLabel}>ขายสินค้าตัวไหนแล้วตัดตัวนี้</span>
                  <ProductPicker products={products} value={productIds} onChange={setProductIds} />
                  <span className={hint} style={hintStyle}>
                    ใช้กับของที่ขาย 1 ชิ้น = ใช้วัสดุนี้ 1 ชิ้นเสมอ · ของที่เปลี่ยนตามตัวเลือกลูกค้า (สี/ขนาด/ตะขอ) ให้ผูกที่ตัวเลือกจากหน้าผูกคลังแทน
                  </span>
                </div>
                <label className="flex cursor-pointer items-start gap-2.5 text-[12px] text-slate-600">
                  <input type="checkbox" checked={groupByOption} onChange={(e) => setGroupByOption(e.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-500" />
                  <span>
                    <span className="font-medium text-slate-700">วัสดุกลางตามตัวเลือก</span> — หัวกลุ่มในหน้าคลังเป็นชื่อกลุ่มตัวเลือก ไม่ใช่ชื่อสินค้า (ของที่หลายสินค้าใช้ร่วมกัน เช่น แผ่นอะคริลิคตามสี)
                  </span>
                </label>
              </>
            )}
          </FormSection>

          <FormSection {...sec} n={4} title="เตือนสั่งซื้อและทุน" hint="ตั้งไว้แล้วระบบเตือน “ต้องสั่ง” และส่ง LINE ให้เอง · ทุนใช้คิดกำไรในรายงาน">
            <div className={g3}>
              <label className="block">
                <span className={fieldLabel}>จุดสั่ง ({u})</span>
                <input value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="20" className={`${inputCls} text-right tabular-nums`} />
              </label>
              <label className="block">
                <span className={fieldLabel}>รอของ (วัน)</span>
                <input value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="7" className={`${inputCls} text-right tabular-nums`} />
              </label>
              <label className="block">
                <span className={fieldLabel}>ทุน/{u} (฿)</span>
                <input value={unitCost} onChange={(e) => setUnitCost(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="12.50" className={`${inputCls} text-right tabular-nums`} />
              </label>
            </div>
            <span className={hint} style={hintStyle}>
              {reorderPoint ? `เหลือ ≤ ${fmtN(Number(reorderPoint))} ${u} = ขึ้น “ต้องสั่ง”` : "ยังไม่ตั้งจุดสั่ง — เมื่อมีสถิติการใช้ 30 วัน ระบบจะเดาให้"} · แก้ทุนทีหลังไม่กระทบของที่ขายไปแล้ว
            </span>
          </FormSection>

          {/* ของที่นาน ๆ แก้ที — พับไว้ เปิดเองถ้ามีค่าอยู่ (จะได้ไม่งงว่ารหัส/ตระกูลหายไปไหน) */}
          <details open={extraFilled > 0} className={embedded ? "group" : "dkb-g group p-4 sm:p-5"}>
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
              <span className="shrink-0 text-[10px] text-slate-400 transition group-open:rotate-90" aria-hidden>▶</span>
              <span className="shrink-0 whitespace-nowrap">เพิ่มเติม</span>
              <span className="min-w-0 font-normal leading-snug text-slate-400">— รหัส · ตระกูล · ชนิด · ชื่อที่เคยเรียก · รูป{extraFilled ? ` (ใส่แล้ว ${fmtN(extraFilled)})` : ""}</span>
            </summary>
            <div className="mt-3 space-y-3">
              <div className={g2}>
                <label className="block">
                  <span className={`${fieldLabel} flex items-center justify-between`}>
                    <span>รหัส (ติดป้ายชั้นวาง)</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCodeManual((v) => !v);
                        setCodeVal(codeManual ? "" : codePreview);
                      }}
                      className="text-[11px] font-medium text-slate-500 underline underline-offset-2 hover:text-slate-800"
                    >
                      {codeManual ? "ให้ระบบตั้งให้" : "แก้เอง"}
                    </button>
                  </span>
                  {codeManual ? (
                    <input value={codeVal} onChange={(e) => setCodeVal(e.target.value.toUpperCase())} placeholder="เช่น PAPER-A4" className={`${inputCls} font-mono`} />
                  ) : (
                    <span className={`${inputCls} flex items-center font-mono text-slate-500`} title="ระบบตั้งจากชื่อให้อัตโนมัติตอนบันทึก">
                      {codePreview || (name.trim() ? "M-xxxx (ออกเลขให้ตอนบันทึก)" : "ตั้งให้อัตโนมัติจากชื่อ")}
                    </span>
                  )}
                </label>
                {/* เลือกจากที่มีอยู่ได้ แต่พิมพ์ใหม่ก็ยังได้ — กันตระกูลแตกเพราะสะกดต่างกันนิดเดียว */}
                <label className="block">
                  <span className={fieldLabel}>ตระกูล</span>
                  <input value={family} onChange={(e) => setFamily(e.target.value)} list="stock-families" placeholder="สีไหมเย็บ" className={inputCls} />
                  <datalist id="stock-families">
                    {allFams.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </label>
              </div>
              <div className={g2}>
                <label className="block">
                  <span className={fieldLabel}>ชนิดของ</span>
                  <input value={part} onChange={(e) => setPart(e.target.value)} list="stock-parts" placeholder="กรอบรูป / วัสดุแฝง" className={inputCls} />
                  <datalist id="stock-parts">
                    {allParts.map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                </label>
                <label className="block">
                  <span className={fieldLabel}>ชื่อที่เคยเรียก (คั่นด้วย , )</span>
                  <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Gtดำ, GT ดำ" className={inputCls} />
                </label>
              </div>
              <label className="block">
                <span className={fieldLabel}>รูป (ลิงก์)</span>
                <span className="flex items-center gap-2.5">
                  <Thumb src={imageUrl.trim() || undefined} name={name} size={44} />
                  <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/thread-1803.jpg (เว้นว่างได้)" className={inputCls} />
                </span>
                <span className={hint} style={hintStyle}>เว้นว่าง = ใช้ภาพตัวเลือกที่ผูก SKU นี้ หรือรูปแรกของสินค้าที่ผูกให้เอง · ชื่อที่เคยเรียกใส่ไว้ให้ค้นเจอทุกชื่อ</span>
              </label>
            </div>
          </details>
        </div>
  );
  if (embedded)
    return (
      <div className="space-y-4">
        {form}
        {/* ปุ่มบันทึกติดล่างของลิ้นชัก — เลื่อนฟอร์มยาวแล้วยังกดได้ */}
        <div className="sticky -bottom-4 -mx-5 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50">
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={save}
              className="inline-flex min-h-[48px] flex-[2] items-center justify-center rounded-xl text-[13px] font-semibold bg-amber-500 text-white shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              บันทึกการแก้ไข
            </button>
          </div>
          {!canSave && (
            <span className="mt-1 block text-center text-[11.5px]" style={hintStyle}>
              ใส่ชื่อวัสดุก่อนถึงบันทึกได้
            </span>
          )}
        </div>
      </div>
    );
  return (
    <div className="mt-4">
      <button type="button" onClick={onClose} className="dkb-btn dkb-btn-ghost dkb-btn-sm mb-3">
        ← กลับไปคลัง
      </button>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {form}

        {/* ── แผงสรุป + ปุ่มบันทึก ติดจอ (มือถือไปอยู่ล่างสุด) ── */}
        <aside className="dkb-g w-full shrink-0 p-4 lg:sticky lg:top-4 lg:w-72">
          <div className="flex items-center gap-3">
            <Thumb src={imageUrl.trim() || undefined} name={name || "วัสดุใหม่"} size={48} />
            <span className="min-w-0">
              <span className="dkb-h2 block truncate text-[1.05rem]" style={{ color: name.trim() ? "var(--dk-navy)" : "var(--dk-faint)" }}>
                {name.trim() || "ยังไม่ได้ตั้งชื่อ"}
              </span>
              <span className="block text-[11.5px]" style={hintStyle}>
                {[part.trim(), family.trim()].filter(Boolean).join(" · ") || "ไม่มีชนิด/ตระกูล"}
              </span>
            </span>
          </div>
          <dl className="mt-4 space-y-2 text-[12.5px]">
            {summary.map((row) => (
              <div key={row.k} className="flex gap-2">
                <dt className="w-16 shrink-0" style={hintStyle}>
                  {row.k}
                </dt>
                <dd className="min-w-0 flex-1 font-medium" style={{ color: row.warn ? "var(--dk-yolk-deep)" : "var(--dk-navy)" }}>
                  {row.v}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 grid gap-2">
            <button type="button" disabled={!canSave} onClick={save} className="dkb-btn dkb-btn-navy min-h-[48px] w-full disabled:opacity-40 disabled:shadow-none">
              {item ? "บันทึกการแก้ไข" : batch.length > 1 ? `บันทึก ${fmtN(batch.length)} ตัวเข้าคลัง` : "บันทึกเข้าคลัง"}
            </button>
            <button type="button" onClick={onClose} className="dkb-btn dkb-btn-ghost min-h-[44px] w-full">
              ยกเลิก
            </button>
            {!canSave && (
              <span className="text-center text-[11.5px]" style={hintStyle}>
                ใส่ชื่อวัสดุก่อนถึงบันทึกได้
              </span>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** นับจริง — กรอกยอดที่นับได้ ระบบคิดส่วนต่างให้ + บังคับเหตุผลเมื่อของขาด */
function CountModal({ item, onClose, onSave }: { item: Item; onClose: () => void; onSave: (diff: number, note?: string) => void }) {
  const [qty, setQty] = useState("");
  // 📦 ของที่นับเป็นแพ็ค: กรอก "กี่แพ็ค" + "เศษกี่แผ่น" แยกช่อง ตรงกับที่นับบนชั้นจริง
  const [packs, setPacks] = useState("");
  const [note, setNote] = useState("");
  const packed = hasPack(item);
  const filled = packed ? qty !== "" || packs !== "" : qty !== "";
  const n = packed ? Number(packs || 0) * item.packSize! + Number(qty || 0) : Number(qty);
  const diff = filled ? n - item.balance : null;
  const needNote = (diff ?? 0) < 0;

  return (
    <Modal
      title="นับสต๊อกจริง"
      subtitle={`${item.name} · คงเหลือในระบบ ${fmtN(item.balance)} ${item.unit}${packText(item, item.balance) ? ` (${packText(item, item.balance)})` : ""}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        {packed ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={fieldLabel}>นับได้กี่{item.packUnit || "แพ็ค"} (เต็ม)</span>
              <input
                value={packs}
                onChange={(e) => setPacks(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                autoFocus
                placeholder="0"
                className={`${inputCls} text-right tabular-nums`}
              />
            </label>
            <label className="block">
              <span className={fieldLabel}>เศษอีกกี่{item.unit}</span>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                placeholder="0"
                className={`${inputCls} text-right tabular-nums`}
              />
            </label>
            <span className="col-span-2 text-[11px] text-slate-500">
              1 {item.packUnit || "แพ็ค"} = {fmtN(item.packSize!)} {item.unit} → รวม <b className="tabular-nums">{fmtN(n)}</b> {item.unit}
            </span>
          </div>
        ) : (
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
        )}
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
        disabled={!filled || diff === 0 || (needNote && !note.trim())}
        onConfirm={() => diff != null && diff !== 0 && onSave(diff, note || `นับจริงได้ ${n}${packed ? ` (${packText(item, n)})` : ""}`)}
      />
    </Modal>
  );
}

/**
 * 🗑↩ รายการ SKU ที่ลบไปแล้ว + ปุ่มกู้คืน (GET/POST /api/admin/stock/restore)
 * เกิดจาก 30 ก.ย. 69: ลบ "ฐาน Griptok · สีดำ" ผิดตัว → ตัวเลือกสีดำของ 3 สินค้าเลิกตัดสต๊อกเงียบ ๆ และไม่มีทางเอากลับจากหน้าจอ
 * กู้คืน = เปิดกลับ + ผูกกลับตัวเลือกที่เคยชี้มา (ค่าที่ไปผูกตัวอื่นแทนแล้วจะไม่ทับ)
 */
/**
 * 🗂 จัดการหมวดวัสดุ — เพิ่ม / เปลี่ยนชื่อ (วัสดุทุกตัวในหมวดย้ายตาม) / ลบ (เลือกหมวดปลายทางให้วัสดุที่ค้างก่อน)
 * (เจ้าของร้านขอ 30 ก.ย. 69 — เดิมหมวดเป็นแค่ข้อความในแต่ละวัสดุ แก้ชื่อทีต้องไล่แก้ทีละตัว)
 */
function CategoriesModal({
  names,
  counts,
  countsOff,
  uncategorized,
  onClose,
  onChanged,
}: {
  names: string[];
  /** จำนวนวัสดุที่นับสต๊อกในหมวด (= ที่เห็นในรายการเมื่อกรองหมวด) */
  counts: Record<string, number>;
  /** จำนวนที่ตั้ง "ไม่ต้องมีสต๊อก" — ไม่โผล่ในรายการปกติ */
  countsOff: Record<string, number>;
  /** วัสดุที่นับสต๊อกแต่ยังไม่ระบุหมวดเลย */
  uncategorized: number;
  onClose: () => void;
  onChanged: (msg: string) => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const call = async (body: Record<string, unknown>, msg: (j: { moved?: number }) => string) => {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/stock/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok || !j?.ok) return setErr(j?.error ?? "บันทึกไม่สำเร็จ");
    setEditing(null);
    setDeleting(null);
    setNewName("");
    await onChanged(msg(j));
  };
  return (
    <Modal title="จัดการหมวดวัสดุ" subtitle="เปลี่ยนชื่อ = วัสดุทุกตัวในหมวดย้ายตาม · ลบ = ต้องเลือกก่อนว่าจะย้ายวัสดุไปหมวดไหน" onClose={onClose}>
      {err && <p className={`mb-3 rounded-xl px-3 py-2 text-xs ${TONE.danger.bg} ${TONE.danger.text}`}>{err}</p>}
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = newName.trim();
          if (!n) return;
          if (names.includes(n)) return setErr("มีหมวดนี้อยู่แล้ว");
          void call({ action: "add", name: n }, () => `เพิ่มหมวด “${n}” แล้ว`);
        }}
      >
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ชื่อหมวดใหม่ เช่น อะไหล่ตะขอ" className={inputCls} />
        <button type="submit" disabled={busy || !newName.trim()} className={`${btnPrimary} shrink-0`}>
          ＋ เพิ่ม
        </button>
      </form>
      {uncategorized > 0 && (
        <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          วัสดุที่นับสต๊อกอีก <b>{fmtN(uncategorized)}</b> ตัวยังไม่ระบุหมวด — เปิดแก้ไขข้อมูลรายตัว หรือใช้ “แก้รายละเอียดทั้งกลุ่ม” เพื่อจัดหมวด
        </p>
      )}
      <p className="mb-1 px-1 text-[11px] text-slate-400">ตัวเลข = วัสดุที่นับสต๊อก (ที่เห็นในรายการ) · ในวงเล็บ = ของที่ตั้ง “ไม่ต้องมีสต๊อก” ซึ่งไม่แสดงในรายการ</p>
      <ul className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
        {names.map((n) => (
          <li key={n} className="px-3 py-2">
            {editing === n ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const to = editVal.trim();
                  if (!to || to === n) return setEditing(null);
                  if (names.includes(to)) return setErr(`มีหมวด “${to}” อยู่แล้ว — ถ้าต้องการรวม ให้ลบหมวดนี้แล้วเลือกย้ายไป “${to}”`);
                  void call({ action: "rename", name: n, to }, (j) => `เปลี่ยนชื่อหมวด “${n}” → “${to}” แล้ว (ย้ายวัสดุ ${fmtN(j.moved ?? 0)} ตัว)`);
                }}
              >
                <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)} className={inputCls} aria-label="ชื่อหมวดใหม่" />
                <button type="submit" disabled={busy} className={btnSmNeutral}>
                  บันทึก
                </button>
                <button type="button" onClick={() => setEditing(null)} className={btnSmGhost}>
                  ยกเลิก
                </button>
              </form>
            ) : deleting === n ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  ลบ “{n}” — วัสดุ {fmtN((counts[n] ?? 0) + (countsOff[n] ?? 0))} ตัวในหมวดนี้ย้ายไป
                </span>
                <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className={`${inputCls} w-auto`} aria-label="หมวดปลายทาง">
                  <option value="">ยังไม่จัดหมวด</option>
                  {names.filter((x) => x !== n).map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={busy} onClick={() => void call({ action: "delete", name: n, moveTo: moveTo || undefined }, (j) => `ลบหมวด “${n}” แล้ว (ย้ายวัสดุ ${fmtN(j.moved ?? 0)} ตัวไป ${moveTo || "ยังไม่จัดหมวด"})`)} className={btnSmDanger}>
                  ยืนยันลบ
                </button>
                <button type="button" onClick={() => setDeleting(null)} className={btnSmGhost}>
                  ยกเลิก
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{n}</span>
                <span className={`text-[11px] tabular-nums ${counts[n] ? "text-slate-600" : "text-slate-400"}`} title="นับสต๊อก (ในวงเล็บ = ไม่ต้องมีสต๊อก)">
                  {fmtN(counts[n] ?? 0)} ตัว{countsOff[n] ? ` (+${fmtN(countsOff[n])} ไม่นับ)` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(n);
                    setEditVal(n);
                    setDeleting(null);
                  }}
                  className={btnSmGhost}
                >
                  ✎ เปลี่ยนชื่อ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleting(n);
                    setMoveTo("");
                    setEditing(null);
                  }}
                  className={btnSmDanger}
                >
                  ลบ
                </button>
              </div>
            )}
          </li>
        ))}
        {!names.length && <li className="px-3 py-6 text-center text-sm text-slate-400">ยังไม่มีหมวด — เพิ่มด้านบน</li>}
      </ul>
      <div className="mt-4">
        <button type="button" onClick={onClose} className={`${btnNeutral} w-full`}>
          ปิด
        </button>
      </div>
    </Modal>
  );
}

/** 🗂 ย้ายหมวด — เลือกหมวดปลายทาง (จากรายชื่อ หรือพิมพ์ใหม่) ให้วัสดุชุดนี้ทั้งชุด · POST categories action=assign */
function MoveCategoryModal({ items, title, allCats, onClose, onDone }: { items: Item[]; title: string; allCats: string[]; onClose: () => void; onDone: (msg: string) => Promise<void> }) {
  const cur = [...new Set(items.map((i) => i.category?.trim() || ""))];
  const [cat, setCat] = useState(cur.length === 1 ? cur[0] : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/stock/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", ids: items.map((i) => i.id), name: cat.trim() }),
    });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok || !j?.ok) return setErr(j?.error ?? "ย้ายไม่สำเร็จ");
    await onDone(`ย้าย ${title} ${fmtN(j.moved ?? items.length)} รายการ ไปหมวด “${cat.trim() || "ยังไม่จัดหมวด"}” แล้ว`);
  };
  return (
    <Modal title="ย้ายหมวด" subtitle={`${title} · ${fmtN(items.length)} รายการ${cur.length === 1 && cur[0] ? ` · ตอนนี้อยู่หมวด “${cur[0]}”` : cur.length > 1 ? " · ตอนนี้อยู่คนละหมวดกัน" : ""}`} onClose={onClose}>
      {err && <p className={`mb-3 rounded-xl px-3 py-2 text-xs ${TONE.danger.bg} ${TONE.danger.text}`}>{err}</p>}
      <label className="block">
        <span className={fieldLabel}>ย้ายไปหมวด</span>
        <UnitSelect options={allCats} value={cat} onChange={setCat} emptyLabel="— ยังไม่จัดหมวด —" placeholder="พิมพ์หมวดใหม่" />
        <span className="mt-1 block text-[11px] text-slate-400">พิมพ์หมวดใหม่ได้ ระบบจะเพิ่มเข้ารายชื่อหมวดให้เอง · เลือก “ยังไม่จัดหมวด” = ถอดหมวดออก</span>
      </label>
      <ul className="mt-3 max-h-[30vh] overflow-y-auto rounded-xl border border-slate-200 text-[12px] text-slate-600">
        {items.slice(0, 30).map((i) => (
          <li key={i.id} className="truncate border-b border-slate-100 px-3 py-1.5 last:border-0">
            {i.name}
          </li>
        ))}
        {items.length > 30 && <li className="px-3 py-1.5 text-slate-400">… และอีก {fmtN(items.length - 30)} รายการ</li>}
      </ul>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onClose} className={`${btnNeutral} flex-1`}>
          ยกเลิก
        </button>
        <button type="button" disabled={busy} onClick={submit} className={`${btnPrimary} flex-1`}>
          {busy ? "กำลังย้าย…" : `ย้าย ${fmtN(items.length)} รายการ`}
        </button>
      </div>
    </Modal>
  );
}

type DeletedRow = { id: string; code?: string; name: string; unit: string; family?: string; imageUrl?: string; deletedAt?: string; deletedBy?: string; links: number };
function DeletedModal({ onClose, onRestored }: { onClose: () => void; onRestored: (name: string, relinked: number, skipped: string[]) => Promise<void> }) {
  const [rows, setRows] = useState<DeletedRow[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/stock/restore");
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "อ่านรายการที่ลบไม่ได้");
      setRows([]);
      return;
    }
    setRows(j.items ?? []);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const restore = async (r: DeletedRow) => {
    setBusy(r.id);
    setErr("");
    const res = await fetch("/api/admin/stock/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id }) });
    const j = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "กู้คืนไม่สำเร็จ");
      return;
    }
    setRows((rs) => (rs ?? []).filter((x) => x.id !== r.id));
    await onRestored(r.name, j.relinked ?? 0, j.skipped ?? []);
  };

  const n = q.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => !n || r.name.toLowerCase().includes(n) || (r.code ?? "").toLowerCase().includes(n));
  return (
    <Modal title="ที่ลบไปแล้ว" subtitle="กู้คืนได้ทุกตัว — ลิงก์กับตัวเลือกสินค้าที่เคยผูกจะกลับมาด้วย" onClose={onClose}>
      {rows && rows.length > 6 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อ/รหัส…" className={`${inputCls} mb-2`} />}
      {err && <p className={`mb-2 rounded-lg px-2 py-1.5 text-[12px] ${TONE.danger.bg} ${TONE.danger.text}`}>{err}</p>}
      {!rows ? (
        <p className="py-6 text-center text-xs text-slate-400">กำลังโหลด…</p>
      ) : !shown.length ? (
        <p className="py-6 text-center text-xs text-slate-400">{rows.length ? "ไม่มีรายการที่ตรงกับคำค้น" : "ไม่มีวัสดุที่ถูกลบ"}</p>
      ) : (
        <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {shown.map((r) => (
            <li key={r.id} className="flex items-center gap-2.5 px-2.5 py-2">
              <Thumb src={r.imageUrl} name={r.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-slate-900">{r.name}</span>
                <span className="block truncate text-[11px] text-slate-400">
                  {r.code ? `${r.code} · ` : ""}
                  {r.deletedAt ? `ลบเมื่อ ${fmtAt(r.deletedAt)}` : "ลบแล้ว"}
                  {r.deletedBy ? ` โดย ${r.deletedBy}` : ""}
                  {r.links ? ` · เคยผูก ${fmtN(r.links)} ตัวเลือก` : ""}
                </span>
              </span>
              <button type="button" disabled={busy === r.id} onClick={() => void restore(r)} className={`${btnSmNeutral} whitespace-nowrap`}>
                {busy === r.id ? "กำลังกู้…" : "กู้คืน"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** หมวดของฟอร์มเพิ่ม/แก้ไขวัสดุ — เลขลำดับ + หัวข้อเป็นคำถาม + คำอธิบายสั้น (โครงเดียวกับการ์ด "ตั้งค่าคลังให้ครบ") */
function FormSection({ n, title, hint, children, plain }: { n: number; title: string; hint?: string; children: React.ReactNode; /** ในลิ้นชัก: หัวข้อ+เส้นคั่น ไม่มีเลข ไม่มีการ์ด (ลิ้นชักแคบ การ์ดซ้อนการ์ดบนพื้นฟ้าอ่านยาก) */ plain?: boolean }) {
  if (plain)
    return (
      <section className="border-b border-slate-100 pb-5 last:border-0">
        <header className="mb-3">
          <span className="block text-[13px] font-semibold text-slate-800">{title}</span>
          {hint && <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-400">{hint}</span>}
        </header>
        <div className="space-y-3">{children}</div>
      </section>
    );
  return (
    <section className="dkb-g p-4 sm:p-5">
      <header className="mb-3 flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "var(--dk-sky)", color: "var(--dk-navy)" }}>
          {n}
        </span>
        <span className="min-w-0">
          <span className="dkb-h2 block text-[1rem]" style={{ color: "var(--dk-navy)" }}>
            {title}
          </span>
          {hint && (
            <span className="block text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
              {hint}
            </span>
          )}
        </span>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  /** กว้างขึ้น (คลังวัสดุแฝง — มีรายการ+ชิปสินค้าต่อแถว) */
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-2xl border border-slate-200 bg-white p-5 shadow-xl`} onClick={(e) => e.stopPropagation()}>
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
  manual,
}: {
  ready: boolean;
  usage?: StockUsage[];
  dead: boolean;
  hasSuggest: boolean;
  inProductId?: string;
  /** 🏭 เบิกเองอย่างเดียว — ไม่ผูกสินค้าโดยตั้งใจ ไม่ต้องขึ้นป้ายแดง "ยังไม่ผูก" */
  manual?: boolean;
}) {
  if (!ready) return <span className="text-[11px]" style={{ color: "var(--dk-quiet)" }}>…</span>;
  if (!usage?.length && manual)
    return (
      <span className="text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
        🏭 ของใช้ในโรงงาน — พนักงานเบิกเอง ไม่ตัดตามการขาย
      </span>
    );
  if (!usage?.length)
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Tag tone="coral">{dead ? "สินค้าที่ผูกหายไป" : "ยังไม่ผูก"}</Tag>
        {hasSuggest && <span className="text-[11px]" style={{ color: "var(--dk-navy-soft)" }}>มีคู่ที่น่าจะใช่ — กดเพื่อผูก</span>}
      </span>
    );
  /**
   * รวมลิงก์ที่ "เงื่อนไขเดียวกัน" เป็นบรรทัดเดียว แล้วไล่ชื่อสินค้าชุดเดียว (เจ้าของร้าน 1 ต.ค. 69: ลิงก์คลังกลาง + ลิงก์ในสินค้า 6 ตัว
   * ขึ้นคนละบรรทัด ชื่อสินค้าไม่เหมือนกัน "งง") — คลังกลางกับลิงก์ในสินค้าตัดด้วยเงื่อนไขเดียวกัน จึงเป็นเรื่องเดียวกันสำหรับคนดู
   * ผลิตภัณฑ์ที่กำลังดูอยู่ (inProductId) เรียกว่า "สินค้านี้" และขึ้นก่อน
   */
  type Line = { key: string; main: string; cond?: string; products: Set<string>; preset: boolean; kind: "cond" | "all" | "bom" };
  const lines = new Map<string, Line>();
  const add = (key: string, init: Omit<Line, "products" | "key">, names: string[], preset = false) => {
    const l = lines.get(key) ?? lines.set(key, { key, ...init, products: new Set() }).get(key)!;
    for (const n of names) l.products.add(n);
    if (preset) l.preset = true;
  };
  for (const u of usage) {
    if (u.kind === "product") {
      const per = u.per && u.per !== 1 ? ` ×${u.per}` : "";
      add(u.bom ? `bom${per}` : `all${per}`, { main: u.bom ? `ทุกชิ้น${per}` : `ทุกออเดอร์${per}`, preset: false, kind: u.bom ? "bom" : "all" }, [u.productName]);
    } else if (u.kind === "preset") {
      add(`${u.label}=${u.choice}|${u.cond ?? ""}`, { main: `${u.label} = ${u.choice}${u.per !== 1 ? ` (×${u.per})` : ""}`, cond: u.cond, preset: true, kind: "cond" }, u.usedByNames ?? [], true);
    } else {
      add(`${u.label}=${u.choice}|${u.cond ?? ""}`, { main: `${u.label} = ${u.choice}${u.per !== 1 ? ` (×${u.per})` : ""}`, cond: u.cond, preset: false, kind: "cond" }, [u.productName]);
    }
  }
  const hereName = inProductId ? usage.find((u): u is Extract<StockUsage, { kind: "choice" | "product" }> => u.kind !== "preset" && u.productId === inProductId)?.productName : undefined;
  const nameList = (set: Set<string>, max = 5) => {
    const arr = [...set].sort((a, b) => (a === hereName ? -1 : b === hereName ? 1 : a.localeCompare(b, "th"))).map((n) => (n === hereName ? "สินค้านี้" : n));
    return arr.length <= max ? arr.join(", ") : `${arr.slice(0, max).join(", ")} +${arr.length - max}`;
  };
  const list = [...lines.values()];
  const MAX = 3;
  return (
    <span className="block min-w-0 space-y-1">
      {list.slice(0, MAX).map((l) => (
        <span key={l.key} className="block break-words leading-snug">
          <span className="block text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
            {l.kind === "cond" ? `ตัดเมื่อ ${l.main}` : l.kind === "bom" ? `วัสดุแฝง — ตัด${l.main}ของ ${nameList(l.products)}` : `ตัด${l.main}ของ ${nameList(l.products)}`}
          </span>
          {l.cond && (
            <span className="block text-[11px]" style={{ color: "var(--dk-yolk-ink)" }}>
              เฉพาะเมื่อ {l.cond}
            </span>
          )}
          {l.kind === "cond" && (
            <span className="block text-[11px]" style={{ color: "var(--dk-faint)" }}>
              ใช้กับ {fmtN(l.products.size)} สินค้า{l.products.size ? `: ${nameList(l.products)}` : ""}
              {l.preset ? " · ผ่านคลังกลาง" : ""}
            </span>
          )}
        </span>
      ))}
      {list.length > MAX && (
        <span className="block text-[11px]" style={{ color: "var(--dk-faint)" }}>
          +{list.length - MAX} เงื่อนไข — กดแถวเพื่อดูทั้งหมด
        </span>
      )}
    </span>
  );
}

/** ลิ้นชัก: ขายอะไรแล้วตัด SKU ตัวนี้ + คู่ที่น่าจะใช่ (กดผูกได้เลย) */
/**
 * ช่อง "ตัด __ หน่วย" ของแถวลิงก์ในลิ้นชัก — บันทึกตอนออกจากช่อง/Enter (ไม่ยิงทุกตัวอักษร) · ว่าง/1 = 1 ต่อ 1
 * ใช้ทั้งลิงก์กับตัวสินค้า (productQtyPer) และลิงก์กับตัวเลือก/คลังกลาง (choice.stockQtyPer)
 */
function PerField({ per, unit, ariaLabel, onSave }: { per?: number; unit: string; ariaLabel: string; onSave: (n: number) => void }) {
  const cur = per && per > 1 ? String(per) : "";
  return (
    <label className="flex shrink-0 items-center gap-1 text-[12px] text-slate-500" title="ตัดสต๊อก = จำนวนที่ลูกค้าสั่ง × ค่านี้ (งานขายเป็นเซ็ต)">
      ตัด
      <input
        key={cur}
        defaultValue={cur}
        placeholder="1"
        inputMode="decimal"
        aria-label={ariaLabel}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        onBlur={(e) => {
          const t = e.target.value.trim();
          const n = t === "" ? 1 : Number(t);
          if (!Number.isFinite(n) || n <= 0) {
            e.target.value = cur;
            return;
          }
          if (n !== (per ?? 1)) onSave(n);
        }}
        className={`${inputCls.replace("w-full ", "")} !h-9 w-14 text-right tabular-nums`}
      />
      {unit}
    </label>
  );
}

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
  onProductPer,
  onChoicePer,
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
  skus: { id: string; name: string; code?: string; img?: string; /** อยู่ในคลังวัสดุแฝงกลาง — เสนอก่อนในช่องเลือก */ lib?: boolean }[];
  hangs: HangRow[];
  onLink: (t: StockSuggest) => Promise<boolean>;
  onUnlink: (t: StockUsage) => Promise<boolean>;
  /** 📦 งานขายเป็นเซ็ต — ตั้งว่า 1 ที่ลูกค้าสั่งตัดกี่หน่วย (เฉพาะลิงก์กับตัวสินค้า) */
  onProductPer: (u: StockUsage, per: number) => Promise<boolean>;
  /** 📦 อย่างเดียวกันแต่ฝั่งลิงก์กับตัวเลือก/คลังกลาง (choice.stockQtyPer) — ไม่รวมลิงก์มีเงื่อนไข */
  onChoicePer: (u: StockUsage, per: number) => Promise<boolean>;
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
      ? `คลังกลาง “${t.label}” · ${t.usedBy} สินค้า${"usedByNames" in t && t.usedByNames?.length ? `: ${t.usedByNames.slice(0, 6).join(", ")}${t.usedByNames.length > 6 ? ` +${t.usedByNames.length - 6}` : ""}` : ""}${"cond" in t && t.cond ? ` · เฉพาะเมื่อ ${t.cond}` : ""}`
      : t.kind === "choice"
        ? `${t.productName} · ${t.label}${"cond" in t && t.cond ? ` · เฉพาะเมื่อ ${t.cond}` : ""}`
        : "";

  return (
    <div className="mt-5">
      <p className="flex items-baseline justify-between gap-2">
        <span className={labelCls}>ขายอะไรแล้วตัดตัวนี้</span>
        {ready && usage.length > 0 && <span className="text-[11px] tabular-nums text-slate-400">{fmtN(usage.length)} จุด</span>}
      </p>
      {!ready ? (
        <p className="py-3 text-xs text-slate-400">กำลังโหลด…</p>
      ) : usage.length === 0 ? (
        // ยังไม่ผูก = ยังตั้งไม่เสร็จ (โทนเตือน) ไม่ใช่ของพัง (แดง) · ของใช้ในโรงงานตั้งใจไม่ผูก = เทา
        item.manualOnly ? (
          <p className={`mt-1.5 rounded-xl px-3 py-2.5 text-xs ${TONE.neutral.bg} ${TONE.neutral.text}`}>ของใช้ในโรงงาน — พนักงานเบิกเอง ไม่ตัดตามการขาย</p>
        ) : (
          <p className={`mt-1.5 rounded-xl px-3 py-2.5 text-xs leading-relaxed ${TONE.warn.bg} ${TONE.warn.text}`}>
            <span className="font-semibold">ยังไม่ผูกกับสินค้าหรือตัวเลือกไหน</span> — ขายแล้วยอดตัวนี้ไม่ขยับ ต้องเบิกเอง
          </p>
        )
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
                          : u.per && u.per > 1
                            ? `ทุกออเดอร์ของสินค้านี้ · ขาย 1 ที่ ตัด ${u.per} ${item.unit} (งานเป็นเซ็ต)`
                            : "ทุกออเดอร์ของสินค้านี้ · 1 ต่อ 1"
                      : where(u)}
                    {u.kind !== "preset" && u.draft ? " · ร่าง" : ""}
                  </span>
                </span>
                {mayEdit &&
                  (u.kind === "product" && !u.bom ? (
                    <>
                      {/* งานขายเป็นเซ็ต: 1 ที่ลูกค้าสั่ง = หลายหน่วยในคลัง — ว่าง/1 = 1 ต่อ 1 */}
                      <PerField
                        per={u.per}
                        unit={item.unit}
                        ariaLabel={`ตัดกี่ ${item.unit} ต่อ 1 ที่ลูกค้าสั่ง ${u.productName}`}
                        onSave={(n) => run(k, () => onProductPer(u, n))}
                      />
                      <button type="button" onClick={onEdit} className={btnSmGhost}>
                        แก้
                      </button>
                    </>
                  ) : (
                    <>
                      {/* ลิงก์กับตัวเลือก/คลังกลางก็ขายเป็นเซ็ตได้ (เข็มกลัด 1 เซ็ต = 10 ชิ้น) — ลิงก์มีเงื่อนไขแก้จำนวนที่ฟอร์ม "ตัดเพิ่ม" */}
                      {u.kind !== "product" && !("extra" in u && u.extra) && (
                        <PerField
                          per={u.per}
                          unit={item.unit}
                          ariaLabel={`ตัดกี่ ${item.unit} ต่อ 1 ที่ลูกค้าสั่ง ${u.label} = ${u.choice}`}
                          onSave={(n) => run(k, () => onChoicePer(u, n))}
                        />
                      )}
                      <button type="button" disabled={busy === k} onClick={() => run(k, () => onUnlink(u))} className={btnSmGhost}>
                        {busy === k ? "…" : "ถอด"}
                      </button>
                    </>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      {/* ของเบิกเองอย่างเดียว = ตั้งใจไม่ผูก — ไม่เสนอคู่ที่น่าจะใช่/ปุ่มผูก (เคยโผล่ขัดกับป้าย 1 ต.ค. 69) เหลือทางเดียวคือสลับโหมดในแก้ไขข้อมูล */}
      {ready && mayEdit && item.manualOnly && usage.length === 0 && (
        <button type="button" onClick={onEdit} className={`${btnSmGhost} mt-1.5`}>
          เปลี่ยนเป็นตัดตามการขาย →
        </button>
      )}
      {ready && !item.manualOnly && suggest.length > 0 && (
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
                        ? `วัสดุแฝง · ตัดทุกชิ้น${h.per && h.per !== 1 ? ` ×${h.per}` : ""}${
                            h.bomFor?.length ? ` ของ ${h.bomFor.map((x) => x.productName).join(" · ")}` : ""
                          }`
                        : h.cond
                          ? `วัสดุแฝงของตัวเลือก · ตัดเมื่อ ${h.cond}`
                          : "วัสดุแฝงของตัวเลือก · ตัดทุกครั้งที่เลือกค่านี้"}
                    </span>
                  </span>
                  {mayEdit && (h.kind === "extra" || !!h.bomFor?.length) && (
                    <button
                      type="button"
                      disabled={busy === k}
                      onClick={() => run(k, () => onUnlinkHang(h))}
                      className={btnSmGhost}
                      title={h.kind === "bom" ? "เลิกตัดวัสดุตัวนี้ทุกชิ้นของสินค้านี้ (ถามยืนยันก่อน)" : undefined}
                    >
                      {busy === k ? "…" : "ถอด"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {ready && mayEdit && addExtra && (
        <ExtraLinkForm
          item={item}
          products={products}
          skus={skus}
          // ตัวเลือกที่ SKU นี้ผูกอยู่ = "ตอนขายตัวนี้ในฐานะอะไร" (ของมีเงื่อนไขเองพ่วงต่อไม่ได้)
          hosts={usage.flatMap<ExtraHost>((u) =>
            u.kind === "choice" && !u.extra
              ? [{ kind: "choice", productId: u.productId, productName: u.productName, label: u.label, optionIndex: u.optionIndex, choice: u.choice }]
              : u.kind === "product" && !u.bom && !u.missing
                ? [{ kind: "product", productId: u.productId, productName: u.productName }]
                : [],
          )}
          onSubmit={onLinkExtra}
          onClose={() => setAddExtra(false)}
        />
      )}

      {/* ทางผูก 3 ทางเป็นปุ่มชุดเดียวกัน (เดิมปุ่ม 1 + ลิงก์ขีดเส้นใต้ 2 น้ำหนักไม่เท่ากัน) · ตอนยังไม่ผูก ผูกกับสินค้า/ตัวเลือกขึ้นก่อน */}
      {ready && mayEdit && !addExtra && !(item.manualOnly && usage.length === 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {usage.length === 0 ? (
            <>
              <button type="button" onClick={onEdit} className={btnSmNeutral}>
                ผูกกับตัวสินค้า
              </button>
              <a href={`/admin/stock/link?q=${encodeURIComponent(item.family ?? item.name)}`} className={btnSmNeutral}>
                ผูกกับตัวเลือก ↗
              </a>
            </>
          ) : null}
          <button type="button" onClick={() => setAddExtra(true)} className={btnSmNeutral} title="ของที่ต้องตัดเพิ่มทุกครั้งที่ลูกค้าเลือกค่านี้ (หรือต่อเมื่อกลุ่มอื่นตรงเงื่อนไขด้วย)">
            ＋ วัสดุแฝงของตัวเลือกนี้
          </button>
          {usage.length > 0 ? (
            <>
              <button type="button" onClick={onEdit} className={btnSmGhost}>
                ผูกกับตัวสินค้า
              </button>
              <a href={`/admin/stock/link?q=${encodeURIComponent(item.family ?? item.name)}`} className={btnSmGhost}>
                ผูกกับตัวเลือก ↗
              </a>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** ตัวหลักของฟอร์มวัสดุแฝง (โหมด down) — ตัวเลือกที่ SKU ผูกอยู่ หรือตัวสินค้าทั้งตัว */
type ExtraHost =
  | { kind: "choice"; productId: string; productName: string; label: string; optionIndex: number; choice: string }
  | { kind: "product"; productId: string; productName: string };

/** กลุ่มตัวเลือกของสินค้าหนึ่งตัว (อ่านจาก /api/admin/stock/link?options=<id>) */
type OptGroup = { label: string; optionIndex: number; fromPreset: boolean; choices: string[] };
type ExtraLinkPayload = {
  productId: string;
  label: string;
  optionIndex: number;
  choice: string;
  /** true = ตัวหลักคือ "ตัวสินค้า" (SKU ที่ผูกกับทุกออเดอร์ของสินค้า ไม่ใช่ตัวเลือก) → เขียนเป็นวัสดุแฝงของสินค้า (bomFor) แทน stockLinks · label/choice ว่าง */
  bom?: boolean;
  /** SKU ที่จะถูกตัดเพิ่ม (ตัวห้อย) — ไม่จำเป็นต้องเป็น SKU ที่เปิดลิ้นชักอยู่ */
  stockItemId: string;
  per: number;
  /** ว่าง = ตัดทุกครั้งที่เลือกค่านี้ (วัสดุแฝงของตัวเลือก) · มีรายการ = ต่อเมื่อกลุ่มอื่นตรงเงื่อนไขทุกข้อ */
  when: { label: string; choices: string[] }[];
};

/**
 * ➕ ผูก "ของที่ตัดเพิ่มตามตัวเลือก" 2 แบบ (เขียนลง choices[ตัวหลัก].stockLinks เหมือนกัน ต่างกันที่ when):
 *   - วัสดุแฝงของตัวเลือก: when ว่าง = ตัดทุกครั้งที่ลูกค้าเลือกค่านี้ (ฐาน Griptok = สีดำ → ตัดฐานสีดำ · เจ้าของร้านขอ 30 ก.ย. 69)
 *     ต้องมีทางนี้เพราะตัวเลือกมี stockItemId หลักได้ตัวเดียว และวัสดุแฝงระดับสินค้า (bomFor) เลือกตามค่าที่กดไม่ได้
 *   - มีเงื่อนไข: ตัดก็ต่อเมื่อลูกค้าเลือกครบหลายกลุ่มพร้อมกัน (ขาย แผ่นจิ๊กซอว์ A5 แล้วตัด กรอบรูป A5 เพิ่ม เมื่อ ตัวเลือก = กรอบรูป + แผ่นจิ๊กซอว์)
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
  skus: { id: string; name: string; code?: string; img?: string; /** อยู่ในคลังวัสดุแฝงกลาง — เสนอก่อนในช่องเลือก */ lib?: boolean }[];
  /**
   * "ตัวหลัก" ในโหมด down = ตอนขายตัวนี้ในฐานะอะไร
   *   choice  = SKU นี้ผูกกับตัวเลือก → เขียน choices[].stockLinks
   *   product = SKU นี้ผูกกับตัวสินค้าทั้งตัว (ทุกออเดอร์) → เขียน bomFor ของตัวห้อย
   * (30 ก.ย. 69: พัดกระดาษไดคัท ผูกกับตัวสินค้าอย่างเดียว ไม่มีตัวเลือก → hosts ว่าง → ฟอร์มตกไปโหมด up ที่ค้นได้แต่ "สินค้า"
   *  พิมพ์ "ด้าม" หา ด้ามพัดพลาสติก จากคลังวัสดุแฝงเลยขึ้น "ไม่พบสินค้าที่ตรง" ทั้งที่ของมีอยู่)
   */
  hosts: ExtraHost[];
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
  /** true = วัสดุแฝงของตัวเลือก (ตัดทุกครั้งที่เลือกค่านี้ ไม่ดูกลุ่มอื่น) · false = ต้องตรงเงื่อนไขกลุ่มอื่นด้วย */
  const [always, setAlways] = useState(true);
  const [per, setPer] = useState("1");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const host = dir === "down" ? hosts[Number(hostKey)] : undefined;
  /** ตัวหลักคือตัวสินค้าทั้งตัว (ไม่มีกลุ่ม/ค่า ไม่มีเงื่อนไข) → บันทึกเป็น bomFor */
  const hostIsProduct = host?.kind === "product";
  const pid = dir === "down" ? host?.productId ?? "" : productId;
  const product = products.find((p) => p.id === pid);
  const kid = skus.find((k) => k.id === kidId);

  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    return products.filter((p) => matchProductQuery(p, q)).slice(0, 8);
  }, [products, q]);
  const kidHits = useMemo(() => {
    const n = kidQ.trim().toLowerCase();
    if (!n) return [];
    return rankLibFirst(
      skus.filter((k) => k.id !== item.id && (k.name.toLowerCase().includes(n) || (k.code ?? "").toLowerCase().includes(n))),
      (k) => !!k.lib,
    );
  }, [skus, kidQ, item.id]);
  /**
   * โหมด up ค้นได้แต่ "สินค้า" — ถ้าที่พิมพ์ตรงกับชื่อวัสดุในคลังแทน (พิมพ์ "ด้าม" หา ด้ามพัดพลาสติก) ต้องบอกให้รู้
   * ว่าเดินผิดด้าน ไม่ใช่ขึ้น "ไม่พบสินค้าที่ตรง" เฉย ๆ แล้วปล่อยให้คิดว่าของที่เพิ่งสร้างหายไป
   */
  const skuHitsUp = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    return rankLibFirst(
      skus.filter((k) => k.id !== item.id && (k.name.toLowerCase().includes(n) || (k.code ?? "").toLowerCase().includes(n))),
      (k) => !!k.lib,
    ).slice(0, 3);
  }, [skus, q, item.id]);
  /** ยังไม่พิมพ์ค้น = เสนอของในคลังวัสดุแฝงกลางก่อน (ฐาน Griptok / หมุด / ถุง ที่สร้างไว้แล้วจากคลัง) — ไม่ต้องเดาชื่อ */
  const libKids = useMemo(() => skus.filter((k) => k.lib && k.id !== item.id).sort((a, b) => a.name.localeCompare(b.name, "th")).slice(0, 10), [skus, item.id]);

  // เปลี่ยนสินค้า/ตัวหลัก = ล้างทุกช่องที่อ้างกลุ่มของสินค้าเดิม ไม่งั้นส่งชื่อกลุ่มที่ไม่มีจริงไป
  useEffect(() => {
    setGroups(null);
    setLoadErr("");
    setUpKey("");
    setUpChoice("");
    setConds([{ label: "", choices: [] }]);
    if (!pid || hostIsProduct) return; // ตัวหลักเป็นตัวสินค้า = ไม่ต้องอ่านกลุ่มตัวเลือก
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
  }, [pid, hostIsProduct]);

  const upHost = groups?.find((g) => `${g.optionIndex}` === upKey);
  const mainLabel = dir === "down" ? (host?.kind === "choice" ? host.label : "") : upHost?.label ?? "";
  const mainChoice = dir === "down" ? (host?.kind === "choice" ? host.choice : "") : upChoice;
  const mainIndex = dir === "down" ? (host?.kind === "choice" ? host.optionIndex : -1) : upHost?.optionIndex ?? -1;
  const condGroup = (label: string) => groups?.find((g) => g.label === label);
  const setCond = (i: number, next: { label: string; choices: string[] }) => setConds((cs) => cs.map((c, j) => (j === i ? next : c)));

  const target = dir === "down" ? kidId : item.id;
  const activeConds = always ? [] : conds.filter((c) => c.label && c.choices.length);
  const ready =
    !!pid && !!target && Number(per) > 0 && (hostIsProduct || (!!mainLabel && !!mainChoice && mainIndex >= 0 && (always || activeConds.length > 0)));
  const kidName = dir === "down" ? kid?.name ?? "" : item.name;
  const unitWord = dir === "up" ? item.unit : "หน่วย";
  // สรุปเป็นประโยคเดียว — โชว์เมื่อครบทั้ง "เลือกอะไร" และ "ตัดอะไร" (ก่อนหน้านี้ขึ้น "ตัด … ทุกครั้ง" ตั้งแต่ยังไม่เลือก ทำให้งง)
  const preview =
    hostIsProduct && host && kidName
      ? `ขาย ${host.productName} ทุกชิ้น → ตัด ${kidName} เพิ่ม ${per || "1"} ${unitWord}`
      : mainLabel && mainChoice && kidName
        ? `ลูกค้าเลือก ${mainLabel} = ${mainChoice}${activeConds.map((c) => ` และ ${c.label} = ${c.choices.join(" / ")}`).join("")} → ตัด ${kidName} เพิ่ม ${per || "1"} ${unitWord}`
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
      when: activeConds,
      bom: hostIsProduct,
    });
    setBusy(false);
    if (msg) setErr(msg);
    else onClose();
  };

  const selectCls = `${inputCls} !py-1.5 text-[13px]`;
  const linkCls = "text-[11.5px] text-slate-500 underline underline-offset-2 hover:text-slate-800";
  /*
   * แถวในลิสต์เลือกวัสดุ — สูง ≥44px กดด้วยนิ้วโป้งได้ (เดิม 40px + รูป 28 ดูเป็นตัวอักษรเบียดกัน)
   * ⚠️ รูป (Thumb) เป็นปุ่มขยายอยู่แล้ว ต้องวางข้างปุ่มเลือก ไม่ใช่ข้างใน — <button> ซ้อน <button> = hydration error
   */
  const pickRow = (k: { id: string; name: string; code?: string; img?: string; lib?: boolean }, onPick: () => void) => (
    <li key={k.id} className="flex items-center gap-2.5 pl-2.5 hover:bg-slate-50">
      <Thumb src={k.img} name={k.name} size={32} />
      <button type="button" onClick={onPick} className="flex min-h-[44px] min-w-0 flex-1 flex-col justify-center py-1.5 pr-2.5 text-left">
        <span className="block w-full truncate text-[13px] text-slate-800">{k.name}</span>
        {k.code && <span className={codeCls}>{k.code}</span>}
      </button>
      {k.lib && <span className="mr-2.5 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] text-slate-500">คลัง</span>}
    </li>
  );
  /* การ์ด "ของที่เลือกแล้ว" — ชื่อ/รหัส + ปุ่มเปลี่ยน (ไม่มีปุ่ม = ล็อกไว้ เช่น ตัวที่เปิดลิ้นชักอยู่) */
  const pickedCard = (k: { name: string; code?: string; img?: string }, onChange?: () => void, sub?: string) => (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <Thumb src={k.img} name={k.name} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-slate-900">{k.name}</span>
        {(k.code || sub) && <span className="block truncate text-[11px] text-slate-400">{sub ?? k.code}</span>}
      </span>
      {onChange && (
        <button type="button" onClick={onChange} className={btnSmGhost}>
          เปลี่ยน
        </button>
      )}
    </div>
  );

  /* ช่องเลือก "ของที่จะตัดเพิ่ม" (โหมด down) — ยังไม่เลือก = ช่องค้น + ลิสต์คลังกลางเต็มความกว้าง · เลือกแล้ว = การ์ด */
  const kidPicker = kid ? (
    pickedCard(kid, () => (setKidId(""), setKidQ("")))
  ) : (
    <>
      <input value={kidQ} onChange={(e) => setKidQ(e.target.value)} placeholder="พิมพ์ชื่อวัสดุ เช่น ฐาน Griptok…" className={inputCls} autoFocus />
      {!kidQ.trim() && libKids.length > 0 && (
        <div className="mt-1.5 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <p className="border-b border-slate-100 px-2.5 py-1.5 text-[11px] text-slate-400">ในคลังวัสดุแฝงกลาง — กดเลือกได้เลย</p>
          <ul className="max-h-56 overflow-y-auto">
            {libKids.map((k) => pickRow(k, () => setKidId(k.id)))}
          </ul>
        </div>
      )}
      {kidQ.trim() && (
        <ul className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {kidHits.map((k) => pickRow(k, () => setKidId(k.id)))}
          {!kidHits.length && <li className="px-2.5 py-2.5 text-[12px] text-slate-400">ไม่พบวัสดุที่ตรง — ถ้าเพิ่งลบไป กู้ได้จากปุ่ม “ที่ลบไปแล้ว…”</li>}
        </ul>
      )}
    </>
  );

  /* ขั้นสูง: ตัดเฉพาะเมื่อกลุ่มอื่นตรงเงื่อนไข — นาน ๆ ใช้ (กรอบรูปตามขนาด) จึงพับไว้ใต้ขั้น "ลูกค้าเลือก" เพราะเป็นส่วนหนึ่งของเงื่อนไข */
  const condBlock =
    groups && mainLabel && mainChoice ? (
      always ? (
        <button type="button" onClick={() => setAlways(false)} className={`${linkCls} mt-2 block`}>
          ＋ และกลุ่มอื่นต้องเป็น… (ตัดเฉพาะเมื่อตรงเงื่อนไขด้วย)
        </button>
      ) : (
        <div className="mt-2 rounded-lg border border-dashed border-slate-300 p-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-slate-600">และเมื่อกลุ่มอื่นเป็น</span>
            <button type="button" onClick={() => setAlways(true)} className={linkCls}>
              เอาเงื่อนไขออก
            </button>
          </div>
          {conds.map((c, i) => {
            const g = condGroup(c.label);
            return (
              <div key={i} className="mt-1.5 rounded-lg border border-slate-200 bg-white p-2">
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
                          className={`rounded-full px-2.5 py-1.5 text-[11.5px] ${on ? "bg-slate-800 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
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
        </div>
      )
    ) : null;

  /* จำนวน — อยู่ติดกับของที่จะตัด (เดิมเป็นแถวแยกไกลจากการ์ด ต้องไล่สายตากลับขึ้นไปว่า "1 อะไร") */
  const qtyRow = (
    <div className="mt-2 flex items-center gap-2 pl-1">
      <span className="text-[12px] text-slate-500">ครั้งละ</span>
      <input
        value={per}
        onChange={(e) => setPer(e.target.value.replace(/[^\d.]/g, ""))}
        inputMode="decimal"
        aria-label="ใช้กี่หน่วยต่อสินค้า 1 ชิ้น"
        className={`${inputCls.replace("w-full ", "")} !h-10 w-16 text-center text-[15px] tabular-nums`}
      />
      <span className="text-[12px] text-slate-500">
        {unitWord} <span className="text-slate-400">ต่อสินค้า 1 ชิ้น</span>
      </span>
    </div>
  );

  const hostProduct = host ? products.find((p) => p.id === host.productId) : undefined;

  /*
   * โครงใหม่ (30 ก.ย. 69): เลิกคอลัมน์ป้ายซ้าย 96px ที่บีบช่องบนมือถือ → วางเป็น "ราง" 3 ขั้นเต็มความกว้าง
   * ① ลูกค้าเลือก → ② ตัดเพิ่ม (ของ + จำนวน) → ③ ได้กฎ (ประโยคสรุป) แล้วค่อยปุ่มบันทึก
   * ของที่นาน ๆ ใช้ (เงื่อนไขกลุ่มอื่น · กลับด้าน) ยังซ่อนหลังลิงก์เหมือนเดิม
   */
  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[13px] font-semibold text-slate-800">
        {dir === "down" ? (hostIsProduct ? "วัสดุแฝงของสินค้านี้" : "วัสดุแฝงของตัวเลือกนี้") : "ตัวนี้เป็นวัสดุแฝงของตัวเลือกอื่น"}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
        {dir === "down"
          ? hostIsProduct
            ? "ขายสินค้านี้ทีไร ให้ตัดของอีกชิ้นเพิ่มด้วย (ทุกชิ้น ไม่ดูตัวเลือก)"
            : "ลูกค้าเลือกค่านี้ทีไร ให้ตัดของอีกชิ้นเพิ่มด้วย"
          : "ลูกค้าเลือกค่าที่ระบุทีไร ให้ตัดตัวนี้เพิ่มด้วย"}
      </p>

      <ol className="mt-4">
        <RuleStep n="1" title="ลูกค้าเลือก">
          {dir === "down" ? (
            !hosts.length ? (
              <p className={`rounded-lg px-2.5 py-2 text-[12px] leading-snug ${TONE.review.bg} ${TONE.review.text}`}>
                SKU นี้ยังไม่ได้ผูกกับสินค้าหรือตัวเลือกไหน — กด “ผูกกับตัวสินค้า” หรือผูกกับตัวเลือกก่อน ถึงจะตั้งของที่ตัดพ่วงได้
              </p>
            ) : hosts.length === 1 && host ? (
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <Thumb src={hostProduct?.img} name={host.productName} size={36} />
                <span className="min-w-0 flex-1">
                  {host.kind === "choice" ? (
                    <>
                      <span className="block text-[13px] leading-snug text-slate-900">
                        <span className="text-slate-500">{host.label} = </span>
                        <span className="font-semibold">{host.choice}</span>
                      </span>
                      <span className="block truncate text-[11px] text-slate-400">{host.productName}</span>
                    </>
                  ) : (
                    <>
                      <span className="block truncate text-[13px] font-semibold leading-snug text-slate-900">{host.productName}</span>
                      <span className="block truncate text-[11px] text-slate-400">ทุกออเดอร์ของสินค้านี้ · ไม่ดูตัวเลือก</span>
                    </>
                  )}
                </span>
              </div>
            ) : (
              <select value={hostKey} onChange={(e) => setHostKey(e.target.value)} className={selectCls} aria-label="ตัวเลือกที่เป็นตัวหลัก">
                <option value="">— เลือกตัวเลือกที่ขาย —</option>
                {hosts.map((h, i) => (
                  <option key={i} value={`${i}`}>
                    {h.kind === "choice" ? `${h.productName} · ${h.label} = ${h.choice}` : `${h.productName} · ทุกออเดอร์ของสินค้านี้`}
                  </option>
                ))}
              </select>
            )
          ) : (
            <>
              {product ? (
                pickedCard(product, () => (setProductId(""), setQ("")), "สินค้า")
              ) : (
                <>
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อสินค้า หรือวางลิงก์หน้าสินค้า…" className={inputCls} autoFocus />
                  {q.trim() && (
                    <ul className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                      {hits.map((p) => pickRow(p, () => setProductId(p.id)))}
                      {!hits.length && <li className="px-2.5 py-2.5 text-[12px] text-slate-400">ไม่พบสินค้าที่ตรง</li>}
                    </ul>
                  )}
                  {q.trim() && !hits.length && skuHitsUp.length > 0 && (
                    <div className={`mt-1.5 rounded-lg px-2.5 py-2 text-[12px] leading-snug ${TONE.review.bg} ${TONE.review.text}`}>
                      <p>
                        “{skuHitsUp[0].name}” เป็นวัสดุในคลัง ไม่ใช่สินค้า — ช่องนี้ค้นสินค้าที่ลูกค้าสั่ง
                        {hosts.length ? ` · ถ้าต้องการให้ขาย ${item.name} แล้วตัด ${skuHitsUp[0].name} เพิ่ม ให้สลับด้าน` : ` · ${item.name} ยังไม่ได้ผูกกับสินค้าไหน ต้องกด “ผูกกับตัวสินค้า” ก่อน ถึงจะตั้งให้ตัด ${skuHitsUp[0].name} พ่วงได้`}
                      </p>
                      {hosts.length > 0 && (
                        <button
                          type="button"
                          onClick={() => (setDir("down"), setKidId(skuHitsUp[0].id), setKidQ(""), setQ(""))}
                          className="mt-1.5 text-[12px] font-semibold underline underline-offset-2"
                        >
                          ขาย {item.name} แล้วตัด {skuHitsUp[0].name} →
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
              {groups && (
                <div className="mt-2 grid grid-cols-2 gap-1.5">
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
                  {groups.some((g) => g.fromPreset) && <p className="col-span-2 text-[11px] text-slate-400">กลุ่มจากคลังตัวเลือกกลางตั้งตรงนี้ไม่ได้ — ต้องไปแก้ที่คลังกลาง</p>}
                </div>
              )}
            </>
          )}
          {loadErr && <p className={`mt-2 rounded-lg px-2.5 py-2 text-[12px] ${TONE.danger.bg} ${TONE.danger.text}`}>{loadErr}</p>}
          {pid && !hostIsProduct && !groups && !loadErr && <p className="mt-2 text-[12px] text-slate-400">กำลังอ่านตัวเลือก…</p>}
          {condBlock}
        </RuleStep>

        <RuleStep n="2" title="ให้ตัดเพิ่ม">
          {dir === "down" ? (
            <>
              {kidPicker}
              {kid && qtyRow}
            </>
          ) : (
            <>
              {pickedCard({ name: item.name, code: item.code, img: item.imageUrl }, undefined, "ตัวที่เปิดอยู่ — ตัดยอดตัวนี้")}
              {qtyRow}
            </>
          )}
        </RuleStep>

        <RuleStep n="→" title="กฎที่จะได้" last result>
          {preview ? (
            <p className="rounded-lg border-l-[3px] border-amber-500 bg-white px-2.5 py-2 text-[12.5px] leading-snug text-slate-800">{preview}</p>
          ) : (
            <p className="text-[12px] text-slate-400">{dir === "up" ? "เลือกสินค้าและตัวเลือกในขั้น 1 ก่อน" : mainChoice ? "เลือกของที่จะตัดในขั้น 2 ก่อน" : "เลือกให้ครบขั้น 1 และ 2 ก่อน"}</p>
          )}
        </RuleStep>
      </ol>

      {err && <p className={`mt-2 rounded-lg px-2.5 py-2 text-[12px] ${TONE.danger.bg} ${TONE.danger.text}`}>{err}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button type="button" disabled={!ready || busy} onClick={() => void submit()} className={`${btnPrimary} flex-1 sm:flex-none disabled:opacity-40`}>
          {busy ? "กำลังบันทึก…" : "บันทึกวัสดุแฝง"}
        </button>
        <button type="button" onClick={onClose} className={`${btnNeutral}`}>
          ยกเลิก
        </button>
      </div>
      {/* กลับด้าน — นาน ๆ ใช้ (เปิดลิ้นชักของ "วัสดุแฝง" เองแล้วอยากผูกขึ้นไปหาตัวเลือก) — บรรทัดของตัวเอง ไม่เบียดปุ่ม */}
      <button type="button" onClick={() => setDir(dir === "down" ? "up" : "down")} className={`${linkCls} mt-2.5 block`}>
        {dir === "down" ? "ตัวนี้เป็นวัสดุแฝงของตัวอื่น? สลับด้าน" : "กลับไปแบบ: ขายตัวนี้แล้วตัดตัวอื่น"}
      </button>
    </div>
  );
}

/**
 * ขั้นหนึ่งในราง "ลูกค้าเลือก → ตัดเพิ่ม → ได้กฎ" ของ ExtraLinkForm — เลขวงกลมซ้าย + เส้นเชื่อมลงขั้นถัดไป
 * result = วงกลมสีแบรนด์ (จุดเดียวในฟอร์มที่ใช้สี ให้สายตาตกที่ผลลัพธ์) · ต้องเป็นคอมโพเนนต์ระดับไฟล์ ไม่งั้น input ข้างในหลุดโฟกัสทุกครั้งที่พิมพ์
 */
function RuleStep({ n, title, last, result, children }: { n: string; title: string; last?: boolean; result?: boolean; children: React.ReactNode }) {
  return (
    <li className={`relative pl-9 ${last ? "" : "pb-4"}`}>
      {!last && <span aria-hidden className="absolute bottom-0 left-[11px] top-6 w-px bg-slate-200" />}
      <span
        aria-hidden
        className={`absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-white ${result ? "bg-amber-500" : "bg-slate-800"}`}
      >
        {n}
      </span>
      <p className="text-[12px] font-semibold leading-6 text-slate-700">{title}</p>
      <div className="mt-1.5">{children}</div>
    </li>
  );
}

/** เลือกสินค้าด้วยชื่อ+รูป แทนการพิมพ์รหัสเอง (พิมพ์ผิดตัวเดียว = ไม่ตัดสต๊อกแบบเงียบ ๆ) */
function ProductPicker({ products, value, onChange }: { products: ProductLite[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    return products.filter((p) => !value.includes(p.id) && matchProductQuery(p, q)).slice(0, 8);
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
function SplitModal({
  product,
  allCats,
  optionGroupLabels,
  onClose,
  onDone,
}: {
  product: { id: string; name: string };
  /** รายชื่อหมวดให้เลือก (จัดการได้จากเมนู ⋯ → จัดการหมวด) */
  allCats: string[];
  /** 🧩 ชื่อกลุ่มตัวเลือก (แบบสั้น) ที่มีวัสดุกลางตามตัวเลือกอยู่แล้ว — เลือกกลุ่มชื่อนี้ = ติ๊ก 🧩 ให้เองเป็นค่าเริ่มต้น */
  optionGroupLabels: Set<string>;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  type Link = { stockItemId: string; name: string | null; when: { label: string; choices: string[] }[] };
  type Choice = { name: string; img?: string; /** 🖼 ภาพสลับตามกลุ่มอื่น (สีตะขอตามตะขอที่เลือก) */ imageWhen?: { when: Cond[]; imageSrc: string }[]; stockItemId: string | null; skuName: string | null; extras?: string[]; links?: Link[] };
  /** rate = กลุ่มเสมือน "เรทราคา" (optionIndex -1) — สินค้าที่ของบนชั้นต่างกันตามเรท เช่น การ์ดสเปรย์ 20 ml / 40 ml */
  type Cond = { label: string; choices: string[] };
  /** show = เงื่อนไข "และ" ที่กลุ่มนี้จะโชว์ (showWhen/Also/All) · showAny = เงื่อนไข "หรือ" */
  type Group = { optionIndex: number; label: string; choices: Choice[]; rate?: boolean; show?: Cond[]; showAny?: Cond[]; /** 🔗 ลิงก์คลังตัวเลือกกลาง — แยกแล้วผูกที่คลัง มีผลทุกสินค้าที่ใช้ชุดนี้ · จับคู่/ของชิ้นที่ 2/แก้ชื่อ ไม่ได้ */ preset?: boolean; presetId?: string; usedBy?: number };
  type Old = { id: string; name: string; code?: string; balance: number; unit: string; shared: boolean };
  const SEP = "\u0001";
  /** ชื่อกลุ่มแบบสั้น (ตัดวงเล็บท้าย) — ใช้เป็นชื่อฐานของ SKU ที่จะสร้าง สูตรเดียวกับฝั่งเซิร์ฟเวอร์ */
  const shortLabel = (s: string) => s.replace(/\s*[(（].*$/, "").trim() || s;
  /** ✏️ ชื่อ SKU ที่ผู้ใช้แก้เองรายแถว (คีย์ = key ของแถว) — แก้แล้วจำทันที ไม่ต้องกดบันทึก ใช้ตอนกดสร้าง (เจ้าของร้านขอ 30 ก.ย. 69) */
  const [names, setNames] = useState<Record<string, string>>({});
  /** 📍 จุดสั่งซื้อ / รอของ (วัน) รายแถว — แต่ละสีไม่เท่ากัน (เจ้าของร้านขอ 30 ก.ย. 69) · ว่าง = ไม่ตั้ง */
  const [rowMeta, setRowMeta] = useState<Record<string, { reorder?: string; lead?: string }>>({});
  /** 🏭 ใช้ตัวเลือกเป็นแค่ "รายชื่อ" — สร้างเป็นของใช้ในโรงงาน เบิกเอง ไม่ผูกสินค้า (เจ้าของร้านสั่ง 30 ก.ย. 69) */
  const [manualOnly, setManualOnly] = useState(false);
  /** 🧩 วัสดุกลางตามตัวเลือก — หน้าคลังจัดกลุ่มใต้ชื่อกลุ่มตัวเลือก ไม่ใช่ชื่อสินค้า (เจ้าของร้านสั่ง 1 ต.ค. 69 เคสแผ่นอะคริลิค) */
  const [groupByOption, setGroupByOption] = useState(false);
  /** ผู้ใช้แตะช่อง 🧩 เองแล้ว — เลิกตั้งค่าเริ่มต้นให้ตอนสลับกลุ่ม */
  const [groupByOptionTouched, setGroupByOptionTouched] = useState(false);
  const setMeta = (key: string, patch: { reorder?: string; lead?: string }) => setRowMeta((m) => ({ ...m, [key]: { ...m[key], ...patch } }));
  const [groups, setGroups] = useState<Group[] | null>(null);
  /** กฎตัวเลือกขึ้นต่อกันของสินค้า (เลือก A แล้วกลุ่ม B เหลือเฉพาะ …) — ใช้ตัดคู่ที่เป็นไปไม่ได้ในโหมด 2 กลุ่ม */
  const [rules, setRules] = useState<OptionRule[]>([]);
  const [old, setOld] = useState<Old[]>([]);
  /** กลุ่มที่เลือก ตามลำดับที่กด (สูงสุด 2) — ตัวแรก = กลุ่มที่ถือลิงก์ */
  const [sel, setSel] = useState<number[]>([]);
  /** ตัวเลือกที่ผู้ใช้ติ๊กออกไว้ — จำข้ามการสลับกลุ่ม (ติ๊กออกตอนกลุ่มเดียว ต้องไม่กลับมาเองตอนเลือกกลุ่มที่ 2) */
  const [off, setOff] = useState<Set<string>>(new Set());
  const [removeOld, setRemoveOld] = useState(true);
  const [partName, setPartName] = useState("");
  /** 📝 รายละเอียดของวัสดุที่จะสร้าง — กรอกก่อนสร้าง ไม่ใช่ได้ "ชิ้น"/ค่าว่างแล้วไล่แก้ 129 ตัว (เจ้าของร้านเจอ 30 ก.ย. 69) · ว่าง = ยืมจาก SKU รวมเดิม */
  const [dUnit, setDUnit] = useState("");
  const [dPackUnit, setDPackUnit] = useState("");
  const [dPackSize, setDPackSize] = useState("");
  const [dFamily, setDFamily] = useState("");
  const [dCategory, setDCategory] = useState("");
  const [dCost, setDCost] = useState("");

  const [extraOn, setExtraOn] = useState(false);
  const [extraName, setExtraName] = useState("");
  const [condGroup, setCondGroup] = useState(-1);
  const [condChoices, setCondChoices] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /** นับรอบโหลดใหม่ — เปลี่ยนชื่อตัวเลือกในหน้าต่างนี้แล้วดึงชื่อใหม่มาโดยไม่ต้องปิดเปิด */
  const [reloadTick, setReloadTick] = useState(0);
  const [ok, setOk] = useState("");

  /**
   * ✏️ เปลี่ยนชื่อตัวเลือกของสินค้าตรงนี้ (เจ้าของร้านขอ 1 ต.ค. 69 — เดิมต้องเด้งไปหน้าสินค้า)
   * ฝั่งเซิร์ฟเวอร์ลากราคา/กฎ/เงื่อนไขตามให้ (lib/option-rename) · ชื่อ SKU ที่พิมพ์ไว้ในแถวไม่เปลี่ยนตาม (คนละชื่อกัน)
   */
  async function renameChoice(g: Group, oldName: string, newName: string): Promise<boolean> {
    const nu = newName.trim();
    if (!nu || nu === oldName) return false;
    setErr("");
    const res = await fetch("/api/admin/stock/split/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, optionIndex: g.optionIndex, oldName, newName: nu }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "เปลี่ยนชื่อไม่สำเร็จ");
      return false;
    }
    setOk(`เปลี่ยนชื่อตัวเลือก “${oldName}” → “${nu}” แล้ว (ราคา/กฎ/เงื่อนไขย้ายตาม)`);
    setReloadTick((n) => n + 1);
    return true;
  }

  useEffect(() => {
    let dead = false;
    const load = async (first: boolean) => {
      const res = await fetch(`/api/admin/stock/split?productId=${encodeURIComponent(product.id)}`);
      const j = await res.json().catch(() => null);
      if (dead) return;
      if (!res.ok || !j?.ok) return setErr(j?.error ?? "โหลดตัวเลือกของสินค้าไม่สำเร็จ");
      setGroups(j.groups);
      setOld(j.old);
      setRules(Array.isArray(j.rules) ? j.rules : []);
      if (first && j.groups?.length) setSel([0]);
    };
    void load(true);
    // ✏️ ไปแก้ชื่อตัวเลือกที่หน้าสินค้า (แท็บใหม่) แล้วกลับมา → โหลดชื่อใหม่ให้เอง ไม่ต้องปิดหน้าต่างเปิดใหม่ (เจ้าของร้านขอ 1 ต.ค. 69)
    const onFocus = () => void load(false);
    window.addEventListener("focus", onFocus);
    return () => {
      dead = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [product.id, reloadTick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const gA = groups?.[sel[0] ?? -1];
  // 🧩 กลุ่มชื่อเดียวกับที่เคยทำเป็นวัสดุกลางตามตัวเลือกไว้ (ประเภทอะคริลิค) → ติ๊ก 🧩 ให้เอง จะได้ไม่เป็นปัญหา "หัวกลุ่มเป็นชื่อสินค้า" ซ้ำ (1 ต.ค. 69)
  const gALabel = gA ? shortLabel(gA.label) : "";
  useEffect(() => {
    if (!groupByOptionTouched) setGroupByOption(!!gALabel && optionGroupLabels.has(gALabel));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gALabel]);
  const gB = sel.length > 1 ? groups?.[sel[1]] : undefined;
  const pairMode = !!(gA && gB);

  /** คู่ (a,b) มี SKU แล้วหรือยัง — ดูจากลิงก์มีเงื่อนไขบนค่าของกลุ่มแรก */
  const pairSku = (a: Choice, b: string) =>
    a.links?.find((l) => l.when.length === 1 && gB && l.when[0].label === gB.label && l.when[0].choices.length === 1 && l.when[0].choices[0] === b);

  /**
   * คู่ (a ของกลุ่ม A, b ของกลุ่ม B) ลูกค้าเลือกได้จริงไหม — ตามกฎเดียวกับหน้าสินค้า (allowedChoices/optionVisible)
   *   1) OptionRule: เลือก a แล้วกลุ่ม B เหลือเฉพาะ allow → b ต้องอยู่ใน allow (และกลับด้าน)
   *   2) showWhen ของกลุ่ม B ที่ชี้มากลุ่ม A → ต้องมี a (และกลับด้าน) · เงื่อนไขที่ชี้กลุ่มอื่นที่ไม่ได้เลือก ไม่นับ
   * เดิมสร้างครบทุกคู่ (2 × 20 = 40) ทั้งที่เคสธรรมดาไม่มี iPhone 17 — เจ้าของร้านเจอ 30 ก.ย. 69
   */
  const pairOk = (a: Choice, b: Choice): boolean => {
    if (!gA || !gB) return true;
    const sel: Record<string, string> = { [gA.label]: a.name, [gB.label]: b.name };
    const has = (choices: string[], v: string) => choices.includes(v) || choices.includes(publicRateLabelOf(v));
    for (const r of rules) {
      if (!ruleWhenMatches(r, sel)) continue;
      if (r.when.label === gA.label && r.limit.label === gB.label && r.limit.allow.length && !has(r.limit.allow, b.name)) return false;
      if (r.when.label === gB.label && r.limit.label === gA.label && r.limit.allow.length && !has(r.limit.allow, a.name)) return false;
    }
    const visible = (g: Group, otherLabel: string, otherVal: string) => {
      const and = (g.show ?? []).filter((c) => c.label === otherLabel);
      if (and.some((c) => !has(c.choices, otherVal))) return false;
      const any = (g.showAny ?? []).filter((c) => c.label === otherLabel);
      return !any.length || any.some((c) => has(c.choices, otherVal));
    };
    return visible(gB, gA.label, a.name) && visible(gA, gB.label, b.name);
  };

  /** dep = แถวลูกจากกลุ่มย่อยที่ขึ้นกับค่า a (สีตะขอ โลหะ ใต้ K ตะขอแมว) — b คือค่าของกลุ่มย่อยนั้น */
  type Row = { key: string; a: Choice; b?: Choice; done: string | null; dep?: Group };
  /**
   * 🌳 กลุ่มย่อยที่ "แสดงเมื่อ" กลุ่มหลักเลือกค่า a (showWhen ชี้มาที่กลุ่มหลักและมี a) — หน้าสินค้าเลือกตะขอแล้วถึงโผล่ "สีตะขอ"
   * เจ้าของร้านขอ 1 ต.ค. 69: รายการต้องเป็นแบบหน้าสินค้า (ตะขอ 31 แบบ สีแตกใต้ตะขอ) ไม่ใช่ไล่เลือก "สีตะขอ X" ทีละกลุ่ม
   */
  const depsOf = (a: Choice): Group[] =>
    !gA || gB
      ? []
      : (groups ?? []).filter(
          (x) =>
            x !== gA &&
            !x.rate &&
            x.choices.length > 0 &&
            [...(x.show ?? []), ...(x.showAny ?? [])].some((c) => c.label === gA.label && (c.choices.includes(a.name) || c.choices.includes(publicRateLabelOf(a.name)))),
        );
  const hasDeps = !!gA && !gB && gA.choices.some((a) => depsOf(a).length > 0);
  /**
   * กลุ่มย่อยของกลุ่มไหน — "สีตะขอ · โลหะ (F/J/K/L/M/N/O)" แสดงเมื่อ ตะขอ ∈ {F…O} = สีชุดเดียวที่ตะขอ 7 แบบใช้ร่วม
   * แยกสต๊อกจากกลุ่มนี้ตรง ๆ จะได้ SKU "สีเงิน" ตัวเดียวที่ตะขอ 7 แบบตัดร่วมกัน (ผิด) — ต้องแยกจาก "ตะขอ" แล้วให้สีแตกใต้ตะขอ
   * (เจ้าของร้านชี้ 1 ต.ค. 69 ว่าหน้าสินค้า D กับ X แยกกัน แต่ชิปรวมเป็น "เงิน/ทอง (D/X)")
   */
  const parentOf = (x: Group): Group | undefined => {
    // เงื่อนไขที่อ้างค่ามากสุด = กลุ่มแม่ตัวจริง (ตะขอ ∈ {F…O} 7 ค่า ชนะ เจาะรู = เจาะรู 1 ค่า) — เดิมเจอ "เจาะรู" ก่อนตามลำดับ (บั๊ก 1 ต.ค. 69)
    let best: { g: Group; n: number } | undefined;
    for (const c of [...(x.show ?? []), ...(x.showAny ?? [])]) {
      const g = (groups ?? []).find((g) => g !== x && !g.rate && g.label === c.label);
      if (g && (!best || c.choices.length > best.n)) best = { g, n: c.choices.length };
    }
    return best?.g;
  };
  /**
   * 🎯 กดชิปกลุ่มย่อย (สีตะขอ · โลหะ) = เปิดกลุ่มแม่ (ตะขอ) แล้วโชว์เฉพาะตัวที่ใช้กลุ่มย่อยนั้น (F/J/K/L/M/N/O) แต่ละตัวแตกสีใต้ตัวเอง
   * เจ้าของร้านกดชิปสีซ้ำ 3 รอบและบอก "ยังเป็นแบบเดิม" (1 ต.ค. 69) — การเตือนให้ไปกดชิปอื่นไม่พอ ต้องพาไปเลย
   */
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const focusGroup = focusIdx != null ? groups?.[focusIdx] : undefined;
  const [treeOn, setTreeOn] = useState(true);
  /**
   * 🧩 ชื่อ SKU ประกอบจากส่วนไหนบ้าง (เจ้าของร้านขอ 1 ต.ค. 69 — คู่ "สีอะคริลิค × ชนิด" ไม่อยากให้ "อะคริลิคพิเศษ" ติดทุกชื่อ)
   * head = ชื่อชิ้น/ชื่อกลุ่ม · b = ค่าของกลุ่มที่ 2 · a = ค่าของกลุ่มที่ 1 · product = ชื่อสินค้าต่อท้าย (โหมดเดี่ยวที่ตั้งชื่อชิ้น)
   * ปิดหมด = เหลือค่ากลุ่มที่ 1 เสมอ (ชื่อว่างไม่ได้) · ชื่อที่พิมพ์แก้เองรายแถวไม่ถูกแตะ
   */
  const [nameParts, setNameParts] = useState({ head: true, b: true, a: true, product: true });
  /** ชื่อเริ่มต้นของ SKU ที่จะสร้าง — สูตรเดียวกับฝั่งเซิร์ฟเวอร์ (nameFor) ตอนเปิดทุกส่วน · ใส่ "ของชิ้นนี้เรียกว่าอะไร" = ใช้ชื่อนั้นนำ */
  const defName = (r: Row): string => {
    const part = partName.trim();
    if (!gA) return r.a.name;
    const a = nameParts.a ? r.a.name : "";
    if (r.dep && r.b) {
      const segs = [nameParts.head ? part || shortLabel(gA.label) : "", a, nameParts.b ? r.b.name : ""].filter(Boolean);
      return segs.length ? segs.join(" · ") : r.a.name;
    }
    if (r.b) {
      const segs = [nameParts.head ? part || shortLabel(gA.label) : "", nameParts.b ? r.b.name : "", a].filter(Boolean);
      return segs.length ? segs.join(" · ") : r.a.name;
    }
    if (part) {
      const main = [nameParts.head ? part : "", a].filter(Boolean).join(" ") || r.a.name;
      return nameParts.product ? `${main} (${product.name})` : main;
    }
    const segs = [nameParts.head ? shortLabel(gA.label) : "", a].filter(Boolean);
    return segs.length ? segs.join(" · ") : r.a.name;
  };
  const customNames = Object.keys(names).length;
  const { rows, hiddenPairs } = useMemo((): { rows: Row[]; hiddenPairs: number } => {
    if (!gA) return { rows: [], hiddenPairs: 0 };
    // โหมดเบิกเอง: ลิงก์เดิมไม่เกี่ยว — เลือกได้ทุกค่า
    if (!gB)
      return {
        rows: gA.choices.flatMap((c): Row[] => {
          // 🎯 โฟกัสกลุ่มย่อย: เอาเฉพาะตัวที่กลุ่มย่อยนั้นแสดงให้ (ตะขอ F…O ของ "สีตะขอ · โลหะ")
          if (focusGroup && !depsOf(c).includes(focusGroup)) return [];
          const dep = treeOn ? depsOf(c)[0] : undefined;
          if (!dep) return [{ key: c.name, a: c, done: c.stockItemId && !extraOn && !manualOnly ? c.skuName ?? c.stockItemId : null }];
          // แตกตามกลุ่มย่อย: SKU ต่อ (ตะขอ, สี) — มีแล้ว = ลิงก์มีเงื่อนไขบนค่าหลักที่ชี้สีนั้น
          return dep.choices.map((b) => {
            const ex = manualOnly ? undefined : c.links?.find((l) => l.when.length === 1 && l.when[0].label === dep.label && l.when[0].choices.length === 1 && l.when[0].choices[0] === b.name);
            return { key: `${c.name}${SEP}${b.name}`, a: c, b, dep, done: ex ? ex.name ?? ex.stockItemId : null };
          });
        }),
        hiddenPairs: 0,
      };
    let hidden = 0;
    const out = gB.choices.flatMap((b) =>
      gA.choices.flatMap((a): Row[] => {
        if (!pairOk(a, b)) {
          hidden += 1;
          return [];
        }
        const ex = manualOnly ? undefined : pairSku(a, b.name);
        return [{ key: `${a.name}${SEP}${b.name}`, a, b, done: ex ? ex.name ?? ex.stockItemId : null }];
      })
    );
    return { rows: out, hiddenPairs: hidden };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gA, gB, extraOn, rules, manualOnly, treeOn, groups, focusGroup]);

  // ค่าเริ่มต้น = ติ๊กทุกแถวที่ยังไม่มี SKU (งานส่วนใหญ่คือแยกครบ) แล้วหักเฉพาะที่ผู้ใช้ติ๊กออก
  const nameOff = (label: string, name: string) => `${label}${SEP}${name}`;
  const rowOff = (r: Row) => `#${r.key}`;
  const isOff = (set: Set<string>, r: Row) =>
    set.has(rowOff(r)) || (!!gA && set.has(nameOff(gA.label, r.a.name))) || (!!gB && !!r.b && set.has(nameOff(gB.label, r.b.name)));
  const picked = useMemo(
    () => new Set(rows.filter((r) => !r.done && !isOff(off, r)).map((r) => r.key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, off]
  );

  /** ติ๊ก/ติ๊กออกทีละแถว — โหมดกลุ่มเดียวจำเป็น "ชื่อตัวเลือก" เพื่อให้ยังติ๊กออกอยู่เมื่อเพิ่มกลุ่มที่ 2 */
  /** ติ๊ก/เอาออกทีละแถวบนชุด off (ใช้ซ้ำกับ "ทั้งตะขอ" และ "ทั้งหมด") · แถวลูกโหมดแตกกลุ่มย่อยปิดเฉพาะตัวเอง ไม่ปิดทั้งตะขอ */
  const applyRowOn = (next: Set<string>, r: Row, on: boolean) => {
    if (!on) {
      next.add(rowOff(r));
      if (gA && !gB && !r.dep) next.add(nameOff(gA.label, r.a.name));
      return;
    }
    const names = [...(gA && !r.dep ? [nameOff(gA.label, r.a.name)] : []), ...(gB && r.b ? [nameOff(gB.label, r.b.name)] : [])].filter((k) => next.has(k));
    if (names.length) {
      for (const o of rows) if (o.key !== r.key && !o.done && isOff(next, o)) next.add(rowOff(o));
      for (const k of names) next.delete(k);
    }
    next.delete(rowOff(r));
  };
  const setRowOn = (r: Row, on: boolean) =>
    setOff((cur) => {
      const next = new Set(cur);
      applyRowOn(next, r, on);
      return next;
    });
  /** ☑ ติ๊ก/เอาออกหลายแถวทีเดียว (ทั้งตะขอ C = ทุกสีของ C) */
  const setManyOn = (list: Row[], on: boolean) =>
    setOff((cur) => {
      const next = new Set(cur);
      for (const r of list) if (!r.done) applyRowOn(next, r, on);
      return next;
    });

  const setAllOn = (on: boolean) =>
    setOff(() => {
      if (on) return new Set<string>();
      const next = new Set<string>();
      for (const r of rows) {
        next.add(rowOff(r));
        if (gA && !gB) next.add(nameOff(gA.label, r.a.name));
      }
      return next;
    });

  const toggleGroup = (i: number) => {
    setErr("");
    const x = groups?.[i];
    const parent = x ? parentOf(x) : undefined;
    const pIdx = parent ? (groups ?? []).indexOf(parent) : -1;
    if (x && parent && pIdx >= 0) {
      // 🎯 กลุ่มย่อย → เปิดกลุ่มแม่แล้วโฟกัสเฉพาะตัวที่ใช้กลุ่มย่อยนี้ · กดซ้ำ = เลิกโฟกัส (เห็นกลุ่มแม่ทั้งหมด)
      if (focusIdx === i) setFocusIdx(null);
      else {
        setSel([pIdx]);
        setFocusIdx(i);
      }
      setCondGroup(-1);
      setCondChoices(new Set());
      return;
    }
    setFocusIdx(null);
    // 🔗 กลุ่มคลังกลางจับคู่กับกลุ่มอื่นไม่ได้ (ลิงก์อยู่ที่คลัง ไม่ใช่ที่สินค้า) → เลือกแล้วเป็นกลุ่มเดียว
    setSel((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : groups?.[i]?.preset || cur.some((x) => groups?.[x]?.preset) ? [i] : [...cur, i].slice(-2)));
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
  const label = (r: Row) => (r.dep && r.b ? `${r.a.name} · ${r.b.name}` : r.b ? `${r.b.name} · ${r.a.name}` : r.a.name);
  /** ภาพของแถว: แถวลูก (ตะขอ × สี) ใช้ภาพสีที่ตั้ง imageWhen ไว้กับตะขอตัวนั้นก่อน → ภาพสีทั่วไป → ภาพตะขอ */
  const rowImg = (r: Row): string | undefined => {
    if (r.dep && r.b && gA) {
      const alt = (r.b.imageWhen ?? []).find((w) => w.when.some((c) => c.label === gA.label && c.choices.includes(r.a.name)));
      return alt?.imageSrc ?? r.b.img ?? r.a.img;
    }
    return r.a.img ?? r.b?.img;
  };

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
        choices: [...new Set(chosen.filter((r) => !r.dep).map((r) => r.a.name))],
        // 🌳 แถวลูกจากกลุ่มย่อย (ตะขอ × สี) — คีย์ "a\u0001b" ใน names/perRow
        tree: chosen.filter((r) => r.dep && r.b && !r.done).map((r) => [r.a.name, r.dep!.label, r.b!.name]),
        removeOld: !manualOnly && removeOld && canRemove,
        manualOnly,
        groupByOption: !manualOnly && groupByOption,
        partName: partName.trim() || undefined,
        // ชื่อ SKU รายแถว (ที่ผู้ใช้แก้หรือค่าเริ่มต้น) — คีย์ = ชื่อตัวเลือก (โหมดเดียว) หรือ "a\u0001b" (โหมดคู่)
        names: Object.fromEntries(chosen.filter((r) => !r.done).map((r) => [r.key, (names[r.key] ?? defName(r)).trim()])),
        perRow: Object.fromEntries(
          chosen
            .filter((r) => !r.done && (rowMeta[r.key]?.reorder || rowMeta[r.key]?.lead))
            .map((r) => [r.key, { reorderPoint: rowMeta[r.key]?.reorder ? Number(rowMeta[r.key]!.reorder) : undefined, leadTimeDays: rowMeta[r.key]?.lead ? Number(rowMeta[r.key]!.lead) : undefined }]),
        ),
        defaults: {
          unit: dUnit.trim() || undefined,
          packUnit: dPackUnit.trim() || undefined,
          packSize: dPackSize ? Number(dPackSize) : undefined,
          family: dFamily.trim() || undefined,
          category: dCategory.trim() || undefined,
          unitCost: dCost ? Number(dCost) : undefined,
        },
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
      manualOnly
        ? `สร้างวัสดุ “${shortLabel(gA.label)}” แบบเบิกเอง ${j.created.length} ตัว (ไม่ผูกกับ ${product.name}) — อยู่กลุ่ม “ของใช้ในโรงงาน” · ยอดเริ่มที่ 0 กด “รับเข้า” ใส่ยอดจริง`
        : `แยกสต๊อก ${product.name} ตาม “${pairMode ? `${gB!.label} × ${gA.label}` : gA.label}” แล้ว ${j.created.length} ตัว${reused ? ` (ใช้ของนำเข้าเดิม ${reused} ตัว)` : ""}${groupByOption ? ` — อยู่กลุ่ม “${shortLabel(gA.label)}” (วัสดุกลางตามตัวเลือก)` : ""} — ยอดเริ่มที่ 0 กด “นับ” หรือ “รับเข้า” ใส่ยอดจริง`
    );
  }

  const chip = (on: boolean) =>
    `min-h-[40px] rounded-xl border px-3 text-[13px] font-medium transition ${
      on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    }`;

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl"
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
          {ok && !err && <p className={`rounded-xl px-3 py-2 text-xs ${TONE.ok.bg} ${TONE.ok.text}`}>{ok}</p>}
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
                    const parent = parentOf(x);
                    return (
                      <button
                        key={`${x.optionIndex}-${x.label}`}
                        type="button"
                        aria-pressed={at >= 0}
                        onClick={() => toggleGroup(i)}
                        className={`${chip(at >= 0 || focusIdx === i)}${parent && at < 0 && focusIdx !== i ? " !border-dashed !text-slate-500" : ""}`}
                        title={parent ? `กลุ่มย่อยของ “${parent.label}” — กดแล้วแสดง ${parent.label} เฉพาะตัวที่ใช้กลุ่มนี้ แต่ละตัวแตกค่าของกลุ่มนี้ใต้ตัวเอง` : undefined}
                      >
                        {at >= 0 && sel.length > 1 ? `${at + 1}. ` : ""}
                        {parent ? "↳ " : ""}
                        {x.rate ? "🏷 " : x.preset ? "🔗 " : ""}
                        {x.label} <span className={at >= 0 ? "text-white/60" : "text-slate-400"}>{x.choices.length}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {pairMode
                    ? `สร้างตามคู่ที่ลูกค้าเลือกได้จริง ${gB!.label} × ${gA!.label} = ${rows.length} แบบ${hiddenPairs ? ` (ตัดคู่ที่กฎตัวเลือกไม่อนุญาตออก ${hiddenPairs} คู่)` : ""} — ใช้เมื่อของต่างกันทั้ง 2 อย่าง เช่น กระจกทรงหัวใจสีดำ`
                    : gA?.rate
                      ? "ของบนชั้นต่างกันตามเรทที่ลูกค้าเลือก (เช่น ขวด 20 ml กับ 40 ml) · เรทตัวแทนใช้ของชิ้นเดียวกับเรทปกติให้เอง"
                      : focusGroup && gA
                      ? `🎯 แสดง “${gA.label}” เฉพาะตัวที่ใช้ “${focusGroup.label}” (${fmtN(rows.length)} แถว) — แต่ละตัวแตก${shortLabel(focusGroup.label)}ใต้ตัวเอง เป็น SKU คนละตัว · กดชิปซ้ำเพื่อดู ${gA.label} ทั้งหมด`
                      : gA && parentOf(gA)
                      ? `⚠️ “${gA.label}” เป็นกลุ่มย่อยของ “${parentOf(gA)!.label}” (โชว์เฉพาะตอนเลือกค่าบางตัว) — แยกตรงนี้จะได้ SKU ต่อสีที่หลายตัวใช้ร่วมกัน ให้เลือก “${parentOf(gA)!.label}” แทน แล้วระบบแตกสีใต้แต่ละตัวให้เอง`
                      : gA?.preset
                        ? `🔗 ชุดตัวเลือกจากคลังกลาง ใช้ร่วม ${fmtN(gA.usedBy ?? 0)} สินค้า — แยกแล้วผูกที่คลัง ทุกสินค้าที่ใช้ชุดนี้ตัดสต๊อกตามทันที · ชื่อตัวเลือกแก้ที่ /admin/options · จับคู่กับกลุ่มอื่นไม่ได้`
                        : "เลือกกลุ่มที่ 2 ด้วย ถ้าของต่างกันทั้ง 2 อย่าง (เช่น ทรง และ สี)"}
                </p>
              </div>

              {hasDeps && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 px-3 py-2 text-[13px] text-slate-800">
                  <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] accent-amber-500" checked={treeOn} onChange={(e) => setTreeOn(e.target.checked)} />
                  <span>
                    <span className="font-medium">แตกตามกลุ่มย่อยที่ขึ้นกับค่าที่เลือก (เหมือนหน้าสินค้า)</span>
                    <span className="block text-[11px] text-slate-400">
                      เช่น เลือก “K ตะขอแมว” แล้วหน้าสินค้าถามสี → ได้ SKU ตะขอแมว × สีเงิน/ทอง/โรสโกลด์/รุ้ง · ตะขอที่ไม่มีสีได้ SKU เดียว · ปิด = SKU ต่อตะขออย่างเดียว
                    </span>
                  </span>
                </label>
              )}

              {gA && (
                <div className="rounded-xl border border-slate-200">
                  {/* ☑ ช่องติ๊กทั้งหมดอยู่ตำแหน่งเดียวกับช่องติ๊กของแถว (เจ้าของร้านขอ 1 ต.ค. 69 — เดิมเป็นลิงก์ข้อความมุมขวา หาไม่เจอ) · ติ๊กบางส่วน = ขีด */}
                  {(() => {
                    const todoRows = rows.filter((r) => !r.done);
                    const nOn = todoRows.filter((r) => picked.has(r.key)).length;
                    const all = todoRows.length > 0 && nOn === todoRows.length;
                    return (
                      <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 border-b border-slate-100 px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          className="h-[18px] w-[18px] shrink-0 accent-amber-500"
                          checked={all}
                          ref={(el) => {
                            if (el) el.indeterminate = nOn > 0 && !all;
                          }}
                          onChange={(e) => setAllOn(e.target.checked)}
                          aria-label={all ? "ไม่เลือกเลย" : "เลือกทั้งหมด"}
                        />
                        <span className="font-medium text-slate-800">{all ? "ไม่เลือกเลย" : "เลือกทั้งหมด"}</span>
                        <span className="ml-auto tabular-nums">
                          เลือกแล้ว {fmtN(nOn)} / {fmtN(todoRows.length)}
                        </span>
                      </label>
                    );
                  })()}
                  {/* ส่วนประกอบของชื่อ SKU — ติ๊กออกได้ (เช่น ไม่เอา "อะคริลิคพิเศษ" ที่ซ้ำทุกแถว) · ตัวอย่างชื่อแถวแรกอัปเดตทันที */}
                  <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-2 text-[12px] text-slate-500">
                    <span className="mr-1 shrink-0">ชื่อ SKU ประกอบจาก</span>
                    {(
                      [
                        ["head", partName.trim() ? `ชื่อชิ้น “${partName.trim()}”` : `ชื่อกลุ่ม “${shortLabel(gA.label)}”`, true],
                        ["b", gB ? `ค่า ${shortLabel(gB.label)}` : hasDeps && treeOn ? "ค่ากลุ่มย่อย (สี)" : "", !!gB || (hasDeps && treeOn)],
                        ["a", `ค่า ${shortLabel(gA.label)}`, true],
                        ["product", `ชื่อสินค้า (${product.name})`, !gB && !!partName.trim()],
                      ] as [keyof typeof nameParts, string, boolean][]
                    )
                      .filter(([, , show]) => show)
                      .map(([k, lb]) => {
                        const on = nameParts[k];
                        return (
                          <button
                            key={k}
                            type="button"
                            role="switch"
                            aria-checked={on}
                            onClick={() => setNameParts((p) => ({ ...p, [k]: !p[k] }))}
                            className={`inline-flex min-h-[30px] items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium transition ${
                              on ? "border-amber-500 bg-amber-500 text-white" : "border-slate-200 bg-white text-slate-500 line-through decoration-slate-300 hover:bg-slate-50"
                            }`}
                            title={on ? "กดเพื่อตัดส่วนนี้ออกจากชื่อ" : "กดเพื่อใส่ส่วนนี้กลับเข้าชื่อ"}
                          >
                            <span aria-hidden>{on ? "✓" : "✕"}</span>
                            {lb}
                          </button>
                        );
                      })}
                    {customNames > 0 && (
                      <button
                        type="button"
                        onClick={() => setNames({})}
                        className="ml-auto underline underline-offset-2 hover:text-slate-800"
                        title="แถวที่พิมพ์ชื่อเองไว้จะไม่เปลี่ยนตามตัวเลือกข้างบน — กดเพื่อล้างแล้วใช้ชื่อตามสูตรทุกแถว"
                      >
                        ล้างชื่อที่แก้เอง ({fmtN(customNames)})
                      </button>
                    )}
                  </div>
                  <ul className="max-h-[38dvh] divide-y divide-slate-100 overflow-y-auto">
                    {rows.map((r, idx) => {
                      const on = !!r.done || picked.has(r.key);
                      const part = partName.trim();
                      // 🌳 แถวแรกของแต่ละตะขอในโหมดแตกกลุ่มย่อย → หัวตะขอพร้อมช่องติ๊ก "ทั้งตะขอนี้" (ทุกสี)
                      const firstOfParent = !!r.dep && (idx === 0 || rows[idx - 1].a !== r.a);
                      const siblings = r.dep ? rows.filter((o) => o.a === r.a && o.dep) : [];
                      const sibTodo = siblings.filter((o) => !o.done);
                      const sibOn = sibTodo.filter((o) => picked.has(o.key)).length;
                      return (
                        <li key={r.key}>
                          {firstOfParent && (
                            <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 bg-slate-50/70 px-3 py-1 text-[13px] hover:bg-slate-100/70">
                              <input
                                type="checkbox"
                                className="h-[18px] w-[18px] shrink-0 accent-amber-500"
                                checked={sibTodo.length > 0 && sibOn === sibTodo.length}
                                disabled={!sibTodo.length}
                                ref={(el) => {
                                  if (el) el.indeterminate = sibOn > 0 && sibOn < sibTodo.length;
                                }}
                                onChange={(e) => setManyOn(siblings, e.target.checked)}
                                aria-label={`เลือกทุกสีของ ${r.a.name}`}
                              />
                              <Thumb src={r.a.img} name={r.a.name} size={26} />
                              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{r.a.name}</span>
                              <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                                {fmtN(sibOn)} / {fmtN(siblings.length)} {shortLabel(r.dep!.label)}
                              </span>
                            </label>
                          )}
                          <label className={`flex min-h-[44px] items-center gap-2.5 px-3 py-1.5 ${r.dep ? "pl-9" : ""} ${r.done ? "" : "cursor-pointer hover:bg-slate-50"}`}>
                            <input
                              type="checkbox"
                              className="h-[18px] w-[18px] shrink-0 accent-slate-900"
                              disabled={!!r.done}
                              checked={on}
                              onChange={(e) => setRowOn(r, e.target.checked)}
                            />
                            <Thumb src={rowImg(r)} name={label(r)} size={r.dep ? 40 : 30} />
                            <span className="min-w-0 flex-1">
                              {/* ชื่อตัวเลือกของสินค้า (ลูกค้าเห็นหน้าร้าน) — ✎ แก้ตรงนี้ได้ เซิร์ฟเวอร์ลากราคา/กฎ/เงื่อนไขตาม · โหมดคู่แก้ได้ทั้งสองส่วน · กลุ่ม "เรทราคา" แก้ที่หน้าสินค้า */}
                              <span className="flex min-w-0 flex-wrap items-center gap-x-1 text-[13px] font-medium text-slate-900" onClick={(e) => e.stopPropagation()}>
                                {r.b && gB && (
                                  <>
                                    <InlineName text={r.b.name} canEdit={!gB.rate && !gB.preset && !r.done} onSave={(v) => renameChoice(gB, r.b!.name, v)} onReject={setErr} />
                                    <span className="text-slate-400">·</span>
                                  </>
                                )}
                                {gA && <InlineName text={r.a.name} canEdit={!gA.rate && !gA.preset && !r.done} onSave={(v) => renameChoice(gA, r.a.name, v)} onReject={setErr} />}
                                {r.dep && r.b && (
                                  <>
                                    <span className="text-slate-400">·</span>
                                    <span className="text-slate-700">{r.b.name}</span>
                                    <span className="rounded-full bg-slate-100 px-1.5 text-[10.5px] font-normal text-slate-500">{shortLabel(r.dep.label)}</span>
                                  </>
                                )}
                              </span>
                              {r.done ? (
                                <span className="block truncate text-[11px] text-slate-400">มี SKU แล้ว: {r.done}</span>
                              ) : (
                                <label className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400" onClick={(e) => e.stopPropagation()}>
                                  <span className="shrink-0">ชื่อ SKU:</span>
                                  {/*
                                   * ช่องแก้ชื่อต้องดูเป็นช่อง (เดิมโปร่งใสเหมือนข้อความ + ปิดเมื่อยังไม่ติ๊ก → เจ้าของร้านกดแล้วไม่เกิดอะไร 1 ต.ค. 69)
                                   * โฟกัส = ติ๊กแถวให้เอง · ✎ อยู่ใน label กดแล้วโฟกัสช่อง · ค่าเริ่มต้น "ชื่อกลุ่ม · ตัวเลือก" · ล้างช่อง = กลับเป็นค่าเริ่มต้น
                                   */}
                                  <input
                                    value={names[r.key] ?? defName(r)}
                                    onChange={(e) => setNames((m) => ({ ...m, [r.key]: e.target.value }))}
                                    onFocus={() => !on && setRowOn(r, true)}
                                    onBlur={(e) => !e.target.value.trim() && setNames((m) => { const n = { ...m }; delete n[r.key]; return n; })}
                                    aria-label={`ชื่อ SKU ของ ${label(r)}`}
                                    className={`min-w-0 flex-1 rounded-md border bg-white px-2 py-1 text-[12px] text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 ${on ? "border-slate-200" : "border-dashed border-slate-200 text-slate-500"}`}
                                  />
                                  <span className="shrink-0 cursor-text rounded-md px-1 text-[13px] text-slate-400 hover:bg-slate-100 hover:text-slate-800" title="แก้ชื่อ SKU ที่จะสร้าง" aria-hidden>
                                    ✎
                                  </span>
                                  {!pairMode && extraOn && extraName.trim() && picked.has(r.key) && <span className="shrink-0">+ “{extraName.trim()} {r.a.name}”</span>}
                                </label>
                              )}
                            </span>
                            {!r.done && (
                              <span className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <input
                                  value={rowMeta[r.key]?.reorder ?? ""}
                                  onChange={(e) => setMeta(r.key, { reorder: e.target.value.replace(/\D/g, "") })}
                                  disabled={!on}
                                  inputMode="numeric"
                                  placeholder="จุดสั่ง"
                                  title="จุดสั่งซื้อ (เหลือ ≤ นี้ = แจ้ง)"
                                  aria-label={`จุดสั่งซื้อ ${label(r)}`}
                                  className={`${inputCls.replace("w-full ", "")} !h-9 w-[4.5rem] text-right text-[12px] tabular-nums disabled:opacity-40`}
                                />
                                <input
                                  value={rowMeta[r.key]?.lead ?? ""}
                                  onChange={(e) => setMeta(r.key, { lead: e.target.value.replace(/\D/g, "") })}
                                  disabled={!on}
                                  inputMode="numeric"
                                  placeholder="รอ(วัน)"
                                  title="รอของกี่วัน"
                                  aria-label={`รอของกี่วัน ${label(r)}`}
                                  className={`${inputCls.replace("w-full ", "")} !h-9 w-[4.5rem] text-right text-[12px] tabular-nums disabled:opacity-40`}
                                />
                              </span>
                            )}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <label className="block">
                <span className={fieldLabel}>ของชิ้นนี้เรียกว่าอะไร (ไม่บังคับ)</span>
                <input value={partName} onChange={(e) => setPartName(e.target.value)} placeholder={`เช่น กระจก / แผ่นจิ๊กซอว์ — เว้นว่าง = ใช้ชื่อกลุ่มตัวเลือก (${gA ? shortLabel(gA.label) : "…"})`} className={inputCls} />
              </label>

              <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 ${manualOnly ? "border-amber-300 bg-amber-50/60" : "border-slate-200"}`}>
                <input type="checkbox" checked={manualOnly} onChange={(e) => setManualOnly(e.target.checked)} className="mt-0.5 h-[18px] w-[18px] accent-slate-900" />
                <span>
                  <span className="block text-[13px] font-semibold text-slate-800">🏭 ไม่ผูกกับสินค้า — ใช้ตัวเลือกเป็นแค่รายชื่อ พนักงานเบิกเอง</span>
                  <span className="block text-[11px] text-slate-500">
                    ได้วัสดุชื่อตามตัวเลือก (เช่น สีผ้าสักหลาด · ขาว) ไปอยู่กลุ่ม “ของใช้ในโรงงาน” · ขายสินค้าแล้วไม่ตัด ยอดขยับเฉพาะตอนรับเข้า/เบิก/นับจริง
                  </span>
                </span>
              </label>

              {!manualOnly && (
                <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 ${groupByOption ? "border-sky-300 bg-sky-50/60" : "border-slate-200"}`}>
                  <input
                    type="checkbox"
                    checked={groupByOption}
                    onChange={(e) => {
                      setGroupByOptionTouched(true);
                      setGroupByOption(e.target.checked);
                    }}
                    className="mt-0.5 h-[18px] w-[18px] accent-slate-900"
                  />
                  <span>
                    <span className="block text-[13px] font-semibold text-slate-800">
                      🧩 วัสดุกลางตามตัวเลือก — หัวกลุ่มในหน้าคลังเป็น “{gA ? shortLabel(gA.label) : "ชื่อกลุ่มตัวเลือก"}” ไม่ใช่ “{product.name}”
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      ของที่หลายสินค้าใช้ร่วมกันตามตัวเลือก (แผ่นอะคริลิคตามสี/ประเภท) · ยังผูกกับตัวเลือกและตัดตอนขายตามเดิม · ตระกูลไม่กรอก = ชื่อกลุ่มตัวเลือก
                      {!!gALabel && optionGroupLabels.has(gALabel) && ` · ติ๊กให้เองเพราะกลุ่ม “${gALabel}” มีวัสดุกลางอยู่แล้ว`}
                    </span>
                  </span>
                </label>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-[13px] font-semibold text-slate-800">📝 รายละเอียดวัสดุที่จะสร้าง (ใช้ค่าเดียวกันทุกตัว)</p>
                <p className="mb-2 text-[11px] text-slate-400">หน่วยคือของบังคับ ที่เหลือใส่ทีหลังได้ · เว้นว่าง = ยืมค่าจากวัสดุรวมเดิมของสินค้านี้ (ถ้ามี)</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className={fieldLabel}>หน่วยนับ (เล็กสุด) *</span>
                    <UnitSelect options={BASE_UNITS} value={dUnit} onChange={setDUnit} emptyLabel="— เลือกหน่วย —" placeholder="พิมพ์หน่วยเอง" />
                  </label>
                  <div className="grid grid-cols-[1fr_8rem] gap-2">
                    <label className="block">
                      <span className={fieldLabel}>📦 หน่วยแพ็ค</span>
                      <UnitSelect options={PACK_UNITS} value={dPackUnit} onChange={setDPackUnit} emptyLabel="— ไม่ตั้งแพ็ค —" placeholder="ชื่อแพ็ค" />
                    </label>
                    <label className="block">
                      {/* ป้ายตามหน่วยที่เลือกจริง — "1 แพ็ค =" ค้างทั้งที่เลือก ม้วน (เจ้าของร้านชี้ 30 ก.ย. 69) */}
                      <span className={`${fieldLabel} whitespace-nowrap`}>
                        1 {dPackUnit.trim() || "แพ็ค"} = กี่{dUnit.trim() || "หน่วย"}
                      </span>
                      <input value={dPackSize} onChange={(e) => setDPackSize(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="100" className={`${inputCls} text-right tabular-nums`} />
                    </label>
                  </div>
                  <label className="block">
                    <span className={fieldLabel}>ตระกูล</span>
                    <input value={dFamily} onChange={(e) => setDFamily(e.target.value)} placeholder="เช่น สีไหมเย็บ" className={inputCls} />
                  </label>
                  <label className="block">
                    <span className={fieldLabel}>หมวด</span>
                    {/* หมวดเป็น dropdown จากรายชื่อหมวดที่มี (เจ้าของร้านขอ 30 ก.ย. 69) · "กำหนดเอง…" = พิมพ์หมวดใหม่ */}
                    <UnitSelect options={allCats} value={dCategory} onChange={setDCategory} emptyLabel="— เลือกหมวด —" placeholder="พิมพ์หมวดใหม่" />
                  </label>
                  <label className="block">
                    <span className={fieldLabel}>ทุน/หน่วย (บาท)</span>
                    <input value={dCost} onChange={(e) => setDCost(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="12.50" className={`${inputCls} text-right tabular-nums`} />
                  </label>
                </div>
                {/* จุดสั่งซื้อ/รอของ ไม่อยู่ในนี้ — แต่ละสี/ขนาดไม่เท่ากัน ตั้งทีหลังรายตัวในลิ้นชัก (เจ้าของร้านสั่ง 30 ก.ย. 69) */}
                <p className="mt-2 text-[11px] text-slate-400">จุดสั่งซื้อและรอของกี่วัน ไม่ตั้งตรงนี้ — แต่ละตัวไม่เท่ากัน เปิดลิ้นชักของแต่ละตัวแล้วตั้งทีหลัง</p>
              </div>

              {!pairMode && !manualOnly && !gA?.preset && condGroups.length > 0 && (
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
  // 📦 แถวไหนกรอกเป็นแพ็ค (เฉพาะของที่ตั้ง packSize) — คูณเป็นหน่วยฐานก่อนบันทึก + จดหมายเหตุ "(2 แพ็ค)"
  const [packOn, setPackOn] = useState<Record<string, boolean>>({});
  const baseOf = (i: Item) => {
    const raw = Math.trunc(Number(qty[i.id] || 0));
    return packOn[i.id] && hasPack(i) ? { raw, n: raw * i.packSize! } : { raw, n: raw };
  };
  const lines = items.map((i) => ({ i, ...baseOf(i) })).filter((x) => x.n > 0);
  const needNote = mode === "out" && reason === "อื่นๆ";
  const over = mode === "out" ? lines.filter((x) => x.n > x.i.balance) : [];

  async function submit() {
    setBusy(true);
    setErr("");
    let done = 0;
    for (const { i, n, raw } of lines) {
      const packNote = packOn[i.id] && hasPack(i) ? `(${fmtN(raw)} ${i.packUnit || "แพ็ค"})` : "";
      const lineNote = [note.trim(), packNote].filter(Boolean).join(" ");
      const res = await fetch("/api/admin/stock/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: i.id, qty: mode === "in" ? n : -n, reason, note: lineNote || undefined }),
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
          const { n } = baseOf(i);
          const after = mode === "in" ? i.balance + n : i.balance - n;
          return (
            <li key={i.id} className="flex min-h-[56px] items-center gap-3 px-3 py-2">
              <Thumb src={images[i.id]} name={i.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{i.name}</span>
                <span className="block text-[11px] tabular-nums text-slate-400">
                  มี {fmtN(i.balance)} {i.unit}
                  {packText(i, i.balance) ? ` (${packText(i, i.balance)})` : ""}
                  {n > 0 && (
                    <span className={after < 0 ? TONE.danger.text : "text-slate-600"}>
                      {" "}
                      → {fmtN(after)}
                    </span>
                  )}
                </span>
                {hasPack(i) && (
                  <span className="mt-1 block">
                    <UnitSwitch unit={i.unit} packUnit={i.packUnit || "แพ็ค"} inPack={!!packOn[i.id]} onChange={(v) => setPackOn((p) => ({ ...p, [i.id]: v }))} />
                  </span>
                )}
              </span>
              <input
                value={qty[i.id] ?? ""}
                onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value.replace(/\D/g, "") }))}
                inputMode="numeric"
                placeholder="0"
                aria-label={`จำนวน ${i.name}${packOn[i.id] && hasPack(i) ? ` (${i.packUnit || "แพ็ค"})` : ""}`}
                title={packOn[i.id] && hasPack(i) ? `กรอกเป็น${i.packUnit || "แพ็ค"}` : undefined}
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
 * 🔩 คลังวัสดุแฝงกลาง — ที่เดียวสำหรับ "สร้าง" วัสดุแฝง (ขาตั้ง หมุด ถุง ฐาน) โดยยังไม่ต้องเลือกสินค้าก่อน
 * แล้วค่อยกด "ใช้กับสินค้า…" ผูกได้หลายตัวทีเดียว · ของในคลังนี้โผล่ให้เลือกก่อนในทุกช่อง (วัสดุแฝงของสินค้า / วัสดุแฝงของตัวเลือก)
 * (เจ้าของร้านขอ 30 ก.ย. 69 — เดิมสร้างได้เฉพาะจากสินค้าทีละตัว ของที่ทำไว้กับสินค้า A ไม่โผล่ให้เลือกตอนทำสินค้า B)
 * สมาชิกคลัง = ชนิดของ "วัสดุแฝง" · หรือเป็นวัสดุแฝงของสินค้า/ตัวเลือกอยู่แล้ว (isLib)
 * SKU อื่นค้นแล้วกด "ใช้กับสินค้า…" ผูกได้เลย — ผูกแล้วเป็นสมาชิกคลังเอง (ไม่มีปุ่ม "นำเข้าคลัง" แยกอีก:
 * เดิมมันแค่ติดป้ายชนิดของ ไม่ผูกสินค้า = ไม่ตัดสต๊อก เจ้าของร้านสับสน 30 ก.ย. 69)
 */
function BomLibraryModal({
  items,
  images,
  live,
  products,
  allParts,
  isLib,
  onClose,
  onChanged,
  onRemoved,
  onDone,
  onPickProduct,
}: {
  items: Item[];
  images: Record<string, string>;
  live: Record<string, StockUsage[]>;
  products: ProductLite[];
  allParts: string[];
  isLib: (i: Item) => boolean;
  onClose: () => void;
  onChanged: (it: Item) => void;
  /** ลบ SKU ออกจากคลังแล้ว (soft delete) — เอาแถวออกจากจอแม่ทันที */
  onRemoved: (id: string) => void;
  onDone: () => void;
  /** ทางเดิม: เลือกสินค้าก่อนแล้วจัดวัสดุแฝงของสินค้านั้นทีละตัว */
  onPickProduct: () => void;
}) {
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("ชิ้น");
  const [newPart, setNewPart] = useState(BOM_PART);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [changed, setChanged] = useState(false);
  /** แถวที่กำลังกางช่อง "ใช้กับสินค้า…" */
  const [attachFor, setAttachFor] = useState<string | null>(null);
  const [attachIds, setAttachIds] = useState<string[]>([]);
  const [attachPer, setAttachPer] = useState("1");
  /** แถวที่กำลังกางแถบยืนยันลบ — ยืนยันในแถวเอง เพราะกล่องยืนยันกลาง (z-120) อยู่หลังโมดัลนี้ (z-130) */
  const [delFor, setDelFor] = useState<string | null>(null);
  /** ✎ แก้ชื่อในแถว (เจ้าของร้านขอ 30 ก.ย. 69 — เดิมต้องปิดโมดัลไปเปิดลิ้นชัก) · ชื่อเดิมถูกเก็บเป็นชื่อที่เคยเรียกฝั่งเซิร์ฟเวอร์ ค้นหาเจอเหมือนเดิม */
  const [editFor, setEditFor] = useState<{ id: string; name: string } | null>(null);
  const [ok, setOk] = useState("");
  const prodName = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);

  /** เปลี่ยนชื่อ SKU — ทางเดียวกับลิ้นชัก (POST /api/admin/stock) ส่ง unit เดิมไปด้วยเพราะ route บังคับ */
  async function rename(i: Item, name: string): Promise<boolean> {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: i.id, name, unit: i.unit }) });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "เปลี่ยนชื่อไม่สำเร็จ");
      return false;
    }
    onChanged(j.item as Item);
    setChanged(true);
    setOk(`เปลี่ยนชื่อเป็น “${name}” แล้ว`);
    return true;
  }

  const needle = q.trim().toLowerCase();
  const lib = useMemo(
    () =>
      items
        // แถวที่กำลังกางช่องผูกจากรายการ "SKU อื่น" ให้ขึ้นมาอยู่ในลิสต์นี้ชั่วคราว จะได้ใช้ช่องผูกชุดเดียวกัน
        .filter((i) => isLib(i) || i.id === attachFor)
        .filter((i) => !needle || matchItem(i, needle) || i.id === attachFor)
        .sort((a, b) => Object.keys(b.bomFor ?? {}).length - Object.keys(a.bomFor ?? {}).length || a.name.localeCompare(b.name, "th")),
    [items, isLib, needle, attachFor],
  );
  /** SKU นอกคลังที่ชื่อตรงคำค้น (ของเก่าที่เคยสร้างเป็นวัสดุธรรมดา เช่น ตะขอ/สายคล้อง) — กด "ใช้กับสินค้า…" ผูกได้เลย */
  const outside = useMemo(
    () => (needle ? items.filter((i) => !isLib(i) && !i.noStock && i.id !== attachFor && matchItem(i, needle)).slice(0, 6) : []),
    [items, isLib, needle, attachFor],
  );

  async function call(method: "POST" | "DELETE", body: object): Promise<Item | null> {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/stock/bom", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "บันทึกไม่สำเร็จ");
      return null;
    }
    onChanged(j.item);
    setChanged(true);
    return j.item as Item;
  }

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const it = await call("POST", { create: { name, unit: newUnit.trim() || "ชิ้น", part: newPart.trim() || BOM_PART } });
    if (it) {
      setNewName("");
      setQ("");
      setAttachFor(it.id); // สร้างเสร็จกางช่องผูกสินค้าให้เลย — ส่วนใหญ่สร้างเพราะกำลังจะเอาไปใช้
      setAttachIds([]);
      setAttachPer("1");
    }
  };
  const attach = async (it: Item) => {
    const per = Number(attachPer);
    if (!attachIds.length || !(per > 0)) return;
    const ok = await call("POST", { stockItemId: it.id, productIds: attachIds, per });
    if (ok) {
      setAttachFor(null);
      setAttachIds([]);
      setAttachPer("1");
    }
  };

  /** ลบ SKU = ปิดการใช้งาน (เหมือนปุ่มลบในลิ้นชัก SKU) — เซิร์ฟเวอร์ถอดลิงก์ตัวเลือกให้ · กู้คืนได้จาก "ที่ลบไปแล้ว" */
  const remove = async (it: Item) => {
    setBusy(true);
    setErr("");
    setOk("");
    const res = await fetch(`/api/admin/stock?id=${encodeURIComponent(it.id)}`, { method: "DELETE" });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok || !j?.ok) {
      setErr(`${j?.error ?? "ลบไม่สำเร็จ"} — ${it.name} ยังอยู่ในคลัง`);
      return;
    }
    setDelFor(null);
    if (attachFor === it.id) setAttachFor(null);
    setChanged(true);
    onRemoved(it.id);
    setOk(`ลบ ${it.name} แล้ว${j.unlinked ? ` · ถอดลิงก์จากตัวเลือกสินค้า ${fmtN(j.unlinked)} รายการ` : ""} — กู้คืนได้จากปุ่ม “ที่ลบไปแล้ว”`);
  };

  const bomOf = (i: Item) => Object.entries(i.bomFor ?? {}).filter(([, n]) => n > 0);
  const extraCount = (i: Item) => (live[i.id] ?? []).filter((u) => u.kind === "choice" && u.extra).length;

  return (
    <Modal
      title="คลังวัสดุแฝง"
      subtitle="ของที่ทุกชิ้นใช้แต่ลูกค้าไม่ได้เลือก (ขาตั้ง หมุด ถุง ฐาน) — สร้างที่นี่ที่เดียว แล้วเลือกใช้ได้ทุกสินค้า ทุกตัวเลือก"
      onClose={changed ? onDone : onClose}
      wide
    >
      {err && <p className={`mb-3 rounded-xl px-3 py-2 text-xs ${TONE.danger.bg} ${TONE.danger.text}`}>{err}</p>}
      {ok && !err && <p className={`mb-3 rounded-xl px-3 py-2 text-xs ${TONE.ok.bg} ${TONE.ok.text}`}>{ok}</p>}

      {/* สร้างใหม่ — อยู่บนสุดเพราะเป็นเหตุผลหลักที่เปิดหน้านี้ · ไม่ต้องเลือกสินค้าก่อน */}
      <div className="rounded-xl border border-slate-200 p-3">
        <p className={labelCls}>สร้างวัสดุแฝงใหม่เข้าคลัง</p>
        <div className="mt-1.5 grid grid-cols-[1fr_5.5rem] gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void create()}
            placeholder="ชื่อ เช่น ขาตั้งกรอบอะคริลิค / หมุด / ถุงซิป"
            className={inputCls}
            autoFocus
          />
          <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="หน่วย" className={inputCls} aria-label="หน่วย" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input value={newPart} onChange={(e) => setNewPart(e.target.value)} list="stock-parts-lib" placeholder="ชนิดของ" className={`${inputCls} min-w-0 flex-1`} aria-label="ชนิดของ" />
          <datalist id="stock-parts-lib">
            {allParts.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
          <button type="button" disabled={busy || !newName.trim()} onClick={() => void create()} className={`${btnPrimary} shrink-0`}>
            {busy ? "กำลังบันทึก…" : "เพิ่มเข้าคลัง"}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">ยังไม่ต้องเลือกสินค้า — สร้างเสร็จค่อยกด “ใช้กับสินค้า…” ผูกได้หลายตัวทีเดียว หรือไปเลือกจากช่องวัสดุแฝงของสินค้า/ตัวเลือกก็เจอ</p>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <p className={`${labelCls} shrink-0`}>ในคลัง {fmtN(lib.length)} รายการ</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นในคลัง หรือค้น SKU อื่นเพื่อผูกกับสินค้า…" className={`${inputCls} !h-10 min-w-0 flex-1`} aria-label="ค้นวัสดุแฝง" />
      </div>

      <div className="mt-2 max-h-[52vh] overflow-y-auto rounded-xl border border-slate-200">
        {lib.length === 0 && !outside.length && (
          <p className="px-3 py-6 text-center text-xs text-slate-400">{needle ? "ไม่พบในคลัง — กรอกเป็นวัสดุใหม่ด้านบน" : "ยังไม่มีวัสดุแฝงในคลัง — สร้างตัวแรกด้านบน"}</p>
        )}
        <ul className="divide-y divide-slate-100">
          {lib.map((i) => {
            const bom = bomOf(i);
            const extras = extraCount(i);
            const opening = attachFor === i.id;
            const deleting = delFor === i.id;
            return (
              <li key={i.id} className="px-3 py-2.5">
                <div className="flex min-h-[44px] items-center gap-2.5">
                  <Thumb src={images[i.id]} name={i.name} size={36} />
                  <span className="min-w-0 flex-1">
                    {editFor?.id === i.id ? (
                      <form
                        className="flex items-center gap-1.5"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const n = editFor.name.trim();
                          if (!n || n === i.name) return setEditFor(null);
                          if (await rename(i, n)) setEditFor(null);
                        }}
                      >
                        <input
                          autoFocus
                          value={editFor.name}
                          disabled={busy}
                          onChange={(e) => setEditFor({ id: i.id, name: e.target.value })}
                          onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setEditFor(null))}
                          aria-label="ชื่อวัสดุ"
                          className={`${inputCls} !h-9 text-sm font-medium`}
                        />
                        <button type="submit" disabled={busy} className={`${btnSmNeutral} shrink-0`}>
                          บันทึก
                        </button>
                        <button type="button" disabled={busy} onClick={() => setEditFor(null)} className={`${btnSmGhost} shrink-0`}>
                          ยกเลิก
                        </button>
                      </form>
                    ) : (
                      <span className="flex items-center gap-1">
                        <span className="min-w-0 truncate text-sm font-medium text-slate-900">{i.name}</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setEditFor({ id: i.id, name: i.name })}
                          className="shrink-0 rounded-lg px-1.5 py-0.5 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="แก้ชื่อ — ชื่อเดิมถูกเก็บเป็นชื่อที่เคยเรียก ค้นหาเจอเหมือนเดิม"
                          aria-label={`แก้ชื่อ ${i.name}`}
                        >
                          ✎
                        </button>
                      </span>
                    )}
                    <span className="block text-[11px] text-slate-400">
                      {i.code ? `${i.code} · ` : ""}คงเหลือ <span className="tabular-nums">{fmtN(i.balance)}</span> {i.unit}
                      {i.part?.trim() && i.part.trim() !== BOM_PART ? ` · ${i.part}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setAttachFor(opening ? null : i.id);
                      setAttachIds([]);
                      setAttachPer("1");
                    }}
                    className={`${btnSmNeutral} shrink-0`}
                  >
                    {opening ? "ปิด" : "＋ ใช้กับสินค้า…"}
                  </button>
                  {/* ลบแยกจากปุ่มผูก — งานนาน ๆ ครั้ง ไม่ให้เผลอกดแทน */}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDelFor(deleting ? null : i.id)}
                    className={`${btnSmGhost} min-h-[44px] shrink-0 !px-2 ${TONE.danger.text}`}
                    title="ลบวัสดุนี้ออกจากคลัง"
                    aria-label={`ลบ ${i.name} ออกจากคลัง`}
                  >
                    ลบ
                  </button>
                </div>

                {deleting && (
                  <div className={`mt-2 rounded-lg p-2.5 ring-1 ring-inset ${TONE.danger.bg} ${TONE.danger.ring}`}>
                    <p className="text-[13px] font-semibold text-slate-900">ลบวัสดุ “{i.name}” ไหม?</p>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      หายจากคลังและไม่ถูกตัดสต๊อกตอนขายอีก · สินค้า/ตัวเลือกที่ผูกกับตัวนี้จะถูกถอดลิงก์ให้เอง · กู้คืนได้จากปุ่ม “ที่ลบไปแล้ว” (ลิงก์จะกลับมาด้วย)
                      {i.balance !== 0 && (
                        <>
                          {" "}· คงเหลือในระบบ <span className="tabular-nums">{fmtN(i.balance)}</span> {i.unit} — ยอดนี้จะหายจากมูลค่าคลังทันที
                        </>
                      )}
                    </p>
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button type="button" disabled={busy} onClick={() => setDelFor(null)} className={`${btnSmNeutral} min-h-[44px]`}>
                        ยกเลิก
                      </button>
                      <button type="button" disabled={busy} onClick={() => void remove(i)} className={`${btnSmNeutral} min-h-[44px] !border-rose-200 !bg-rose-600 !text-white hover:!bg-rose-700`}>
                        {busy ? "กำลังลบ…" : "ลบวัสดุ"}
                      </button>
                    </div>
                  </div>
                )}

                {/* สินค้าที่ตัดวัสดุตัวนี้อยู่ — ชิปละสินค้า ถอดได้ตรงนี้ */}
                {(bom.length > 0 || extras > 0) && (
                  <div className="mt-1.5 flex flex-wrap gap-1 pl-[46px]">
                    {bom.map(([pid, n]) => (
                      <span key={pid} className={`${badge} inline-flex items-center gap-1 bg-slate-100 text-slate-700`}>
                        <span className="max-w-[12rem] truncate">{prodName.get(pid) ?? pid}</span>
                        {n !== 1 && <span className="tabular-nums">×{n}</span>}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void call("DELETE", { productId: pid, stockItemId: i.id })}
                          className="ml-0.5 text-slate-400 hover:text-red-600"
                          aria-label={`เลิกใช้กับ ${prodName.get(pid) ?? pid}`}
                          title="เลิกตัดวัสดุนี้เมื่อขายสินค้านี้"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    {extras > 0 && <span className={`${badge} bg-slate-50 text-slate-500`}>วัสดุแฝงของตัวเลือก {fmtN(extras)} จุด</span>}
                  </div>
                )}
                {bom.length === 0 && extras === 0 && !opening && <p className="mt-1 pl-[46px] text-[11px] text-slate-400">ยังไม่ได้ใช้กับสินค้าไหน — กด “ใช้กับสินค้า…”</p>}

                {opening && (
                  <div className="mt-2 rounded-lg bg-slate-50 p-2.5">
                    <p className="text-[12px] font-semibold text-slate-700">ขายสินค้าไหนแล้วตัด {i.name}</p>
                    <div className="mt-1.5">
                      <ProductPicker products={products.filter((p) => !((i.bomFor?.[p.id] ?? 0) > 0))} value={attachIds} onChange={setAttachIds} />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[13px] text-slate-600">ใช้ต่อสินค้า 1 ชิ้น</span>
                      <input
                        value={attachPer}
                        onChange={(e) => setAttachPer(e.target.value.replace(/[^\d.]/g, ""))}
                        inputMode="decimal"
                        className={`${inputCls.replace("w-full ", "")} !h-11 w-20 text-right tabular-nums`}
                        aria-label="จำนวนต่อสินค้า 1 ชิ้น"
                      />
                      <span className="text-[13px] text-slate-500">{i.unit}</span>
                      <button type="button" disabled={busy || !attachIds.length || !(Number(attachPer) > 0)} onClick={() => void attach(i)} className={`${btnPrimary} ml-auto`}>
                        {busy ? "กำลังบันทึก…" : attachIds.length > 1 ? `ผูก ${fmtN(attachIds.length)} สินค้า` : "ผูก"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {outside.length > 0 && (
          <div className="border-t border-slate-200 bg-slate-50/60 px-3 py-2">
            <p className="text-[11px] text-slate-500">SKU อื่นที่ชื่อตรง — ยังไม่ได้เป็นวัสดุแฝง กด “ใช้กับสินค้า…” ผูกแล้วระบบจะตัดให้ทุกออเดอร์</p>
            <ul className="mt-1 space-y-1">
              {outside.map((i) => (
                <li key={i.id} className="flex min-h-[40px] items-center gap-2">
                  <Thumb src={images[i.id]} name={i.name} size={28} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800">{i.name}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setAttachFor(i.id);
                      setAttachIds([]);
                      setAttachPer("1");
                    }}
                    className={btnSmNeutral}
                  >
                    ＋ ใช้กับสินค้า…
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={onPickProduct} className={`${btnSmGhost} text-slate-500`} title="เลือกสินค้าก่อน แล้วจัดวัสดุแฝงของสินค้านั้นทีละตัว">
          ตั้งทีละสินค้าแทน
        </button>
        <button type="button" disabled={busy} onClick={changed ? onDone : onClose} className={`${btnNeutral} ml-auto min-w-[8rem]`}>
          เสร็จ
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
  isLib,
  onClose,
  onChanged,
  onDone,
  onOpenLibrary,
}: {
  product: { id: string; name: string };
  items: Item[];
  images: Record<string, string>;
  /** สมาชิกคลังวัสดุแฝงกลาง — ผลค้นเอาขึ้นก่อน (ชุดเดียวกับ BomLibraryModal) */
  isLib?: (i: Item) => boolean;
  allParts: string[];
  onClose: () => void;
  onChanged: (it: Item) => void;
  onDone: () => void;
  /** ไปคลังวัสดุแฝงกลาง (สร้างโดยไม่ผูกสินค้า / ผูกหลายสินค้าทีเดียว) */
  onOpenLibrary?: () => void;
}) {
  const current = items.filter((i) => (i.bomFor?.[product.id] ?? 0) > 0);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Item | null>(null);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("ชิ้น");
  const [newPart, setNewPart] = useState(BOM_PART);
  const [per, setPer] = useState("1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [changed, setChanged] = useState(false);

  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    return rankLibFirst(
      items.filter((i) => !current.some((c) => c.id === i.id) && matchItem(i, n)),
      (i) => (isLib ? isLib(i) : i.part?.trim() === BOM_PART || Object.keys(i.bomFor ?? {}).length > 0),
    );
  }, [items, q, current, isLib]);

  /**
   * ยังไม่พิมพ์ค้นหา = ต้องมีตัวเลือกให้กดเลย (เจ้าของร้านแจ้ง 23 ก.ย. 69 — เดิมต้องเดาชื่อแล้วพิมพ์เองก่อนถึงเห็นอะไร)
   * เรียงจาก "ของที่เป็นวัสดุแฝงของสินค้าอื่นอยู่แล้ว" (ใช้ร่วมกันได้เลย) → ของที่ตั้งชนิดเป็นวัสดุแฝงไว้
   */
  const picked = new Set(current.map((c) => c.id));
  const bomCount = (i: Item) => Object.keys(i.bomFor ?? {}).length;
  const isBomKind = (i: Item) => bomCount(i) > 0 || i.part?.trim() === BOM_PART;
  const suggested = [
    ...items.filter((i) => !picked.has(i.id) && isBomKind(i)).sort((a, b) => bomCount(b) - bomCount(a) || a.name.localeCompare(b.name, "th")),
    // ของที่ยังไม่ได้ผูกกับสินค้าไหนเลย = ผู้ต้องสงสัยลำดับถัดมา (ตะขอ/หมุด/สายคล้องที่ยังลอยอยู่)
    // ข้ามตัวที่ตั้ง "ไม่ต้องมี stock" — ผูกไปก็ไม่ถูกตัดยอด กลายเป็นลิงก์หลอกตา
    ...items
      .filter((i) => !picked.has(i.id) && !isBomKind(i) && !i.noStock && !(i.productIds ?? []).length)
      .sort((a, b) => a.name.localeCompare(b.name, "th")),
  ].slice(0, 12);

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
            {!q.trim() && suggested.length > 0 && (
              <>
                <p className="mt-2 text-[11px] text-slate-400">กดเลือกได้เลย — ของในคลังวัสดุแฝงกลาง และของที่ยังไม่ได้ผูกกับสินค้าไหน</p>
                <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                  {suggested.map((i) => (
                    <li key={i.id}>
                      <button type="button" onClick={() => setPick(i)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50">
                        <Thumb src={images[i.id]} name={i.name} size={28} />
                        <span className="min-w-0 flex-1 truncate text-[13px]">{i.name}</span>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {bomCount(i) > 0 ? `ใช้กับ ${bomCount(i)} สินค้า` : (i.productIds ?? []).length ? i.unit : `ยังไม่ผูก · ${i.unit}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {q.trim() && (
              <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                {hits.map((i) => (
                  <li key={i.id}>
                    <button type="button" onClick={() => setPick(i)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50">
                      <Thumb src={images[i.id]} name={i.name} size={28} />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{i.name}</span>
                      {isLib?.(i) && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] text-slate-500">คลัง</span>}
                      <span className="text-[11px] text-slate-400">{i.unit}</span>
                    </button>
                  </li>
                ))}
                {hits.length === 0 && <li className="px-3 py-2.5 text-center text-xs text-slate-400">ไม่พบ — กรอกเป็นวัสดุใหม่ด้านล่าง</li>}
              </ul>
            )}
            <p className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-400">
              <span>หรือสร้างวัสดุใหม่ (ผูกกับสินค้านี้ทันที)</span>
              {onOpenLibrary && (
                <button type="button" onClick={onOpenLibrary} className="ml-auto underline underline-offset-2 hover:text-slate-700">
                  เปิดคลังวัสดุแฝงกลาง
                </button>
              )}
            </p>
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
