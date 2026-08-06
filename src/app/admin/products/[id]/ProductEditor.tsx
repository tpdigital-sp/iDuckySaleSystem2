"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CATEGORIES,
  customUnitPrice,
  formatPrice,
  type CategoryId,
  type BodySection,
  type CustomOption,
  type OptionRule,
  type PriceMatrix,
  type Product,
  type ProductImage,
  type ProductOption,
  type ProductReview,
  type ProductSeo,
} from "@/lib/products";
import { autoSeoOf } from "@/lib/auto-seo";
import { BULK_ASK_DEFAULT } from "@/lib/products";
import { hasOverride, resetOverride } from "@/lib/product-store";
import { deleteProductDb, fetchProductNamesLite, fetchProductRaw, persistProduct } from "@/lib/product-repo";
import { slugifyProductName } from "@/lib/products";
import { getAdminSession } from "@/lib/auth";
import { loadUnits, upsertUnit, removeUnit, unitToMeter, type CustomUnit } from "@/lib/units";
import { fetchPresets } from "@/lib/preset-repo";
import { type OptionPreset } from "@/lib/option-presets";
import { isSupabaseConfigured } from "@/lib/supabase";
import GradientPicker from "@/components/GradientPicker";
import { publicOrigin } from "@/lib/shop-info";
import { fetchShopPayment, shippingOf, DEFAULT_SHIPPING, type ShippingMethod } from "@/lib/shop-settings";

type DraftChoice = { name: string; extra: string };
/** presetId มี = กลุ่มนี้ "ลิงก์" คลังตัวเลือกกลาง (label+choices มาจากคลัง แก้ในกลุ่มไม่ได้จนกว่าจะตัดลิงก์) */
type DraftOption = {
  label: string;
  choices: DraftChoice[];
  presetId?: string;
  display: "pills" | "dropdown";
  /** +฿ ของกลุ่มนี้มีผลเมื่อสั่งตั้งแต่กี่ชิ้นขึ้นไป (ว่าง = ทุกจำนวน) */
  extraFromQty?: string;
};
type DraftImage = { emoji: string; gradient: string; label: string; src?: string };
type DraftBody = {
  heading: string;
  text: string;
  emoji: string; // ว่าง (และไม่มีรูปจริง) = ไม่มีรูป
  gradient: string;
  imgLabel: string;
  /** รูปจริงที่อัปโหลด — มีแล้วใช้แทนอีโมจิ+สีพื้น */
  src: string;
  align: "left" | "right";
};
/** กฎ: เมื่อเลือก [whenLabel = whenChoice] → จำกัดกลุ่ม [limitLabel] เหลือเฉพาะ allow[] */
type DraftRule = { whenLabel: string; whenChoice: string; whenChoices: string[]; limitLabel: string; allow: string[] };
type DraftTier = { upTo: string; label: string };
type DraftPricing = {
  enabled: boolean;
  unit: string;
  driverLabels: string[];
  tiers: DraftTier[];
  /** key คอลัมน์ → ราคาต่อ tier (เป็น string เพื่อกรอกในช่อง) */
  cells: Record<string, string[]>;
  /** คิดเรทตามจำนวนชิ้น "ต่อลาย" — คละ 11 ลายใน 11 ชิ้น = เรทราคาปลีก (กันคละลายเยอะแต่ได้เรทส่ง) */
  tierByDesign: boolean;
};
/** ข้อมูลกำกับเรทราคา (ชื่อ + เงื่อนไขการสั่ง) */
type DraftRateMeta = { label: string; desc: string; minQty: string; minPerDesign: string; extraDesignFee: string; freeMixBelowQty: string };
/** เรทเพิ่มเติม — มีช่วงจำนวน+ตารางราคาของตัวเอง (คอลัมน์/หน่วยใช้ร่วมกับเรทหลัก) */
type DraftExtraRate = DraftRateMeta & { id: string; tiers: DraftTier[]; cells: Record<string, string[]> };
const EMPTY_RATE_META: DraftRateMeta = { label: "", desc: "", minQty: "", minPerDesign: "", extraDesignFee: "", freeMixBelowQty: "" };
/** ชื่อเรทมาตรฐานของร้าน (ตามหน้ารายการราคา) — เลือกจากลิสต์ได้ ไม่ต้องพิมพ์เอง */
const RATE_NAME_PRESETS = [
  "เรทที่ 1 แบบคละดีเทล",
  "เรทที่ 2 แบบไม่คละดีเทล",
  "เรทราคาปลีก",
  "เรทราคาส่ง",
  "เรทตัวแทนจำหน่าย",
];
/** สินค้าที่ scrape มาจาก URL (จาก /api/admin/import) */
type ScrapedProduct = {
  name: string; unit: string; price: number;
  options: ProductOption[]; pricing: PriceMatrix; imageUrl?: string; imageUrls?: string[]; kind: string;
};
type DraftFaq = { q: string; a: string };
type DraftSeo = { title: string; description: string; keywords: string; faqs: DraftFaq[] };
type Draft = {
  name: string;
  /** ลิงก์ตามชื่อ (slug) ของหน้าสินค้า — ว่าง = ใช้ id ตามเดิม */
  slug: string;
  category: CategoryId;
  price: string;
  oldPrice: string;
  emoji: string;
  gradient: string;
  imageSrc?: string;
  /** รูปสินค้าจริง (data URL) สูงสุด 5 รูป — รูปแรกคือรูปหลัก */
  photos: string[];
  options: DraftOption[];
  rules: DraftRule[];
  pricing: DraftPricing;
  /** ชื่อ/เงื่อนไขของเรทหลัก (ตาราง pricing) — ใช้เมื่อสินค้ามีหลายเรทหรือมีเงื่อนไขขั้นต่ำ */
  rateMeta: DraftRateMeta;
  /** เรทราคาเพิ่มเติม (เช่น เรทไม่คละดีเทล) — แต่ละเรทมีช่วงจำนวน+ราคาของตัวเอง */
  extraRates: DraftExtraRate[];
  highlights: string[];
  images: DraftImage[];
  body: DraftBody[];
  /** แท็บข้อมูลสินค้า (รายละเอียดเพิ่มเติม / วิธีสั่งงาน / การรับประกัน ฯลฯ) */
  tabs: { title: string; text: string }[];
  seo: DraftSeo;
  custom: DraftCustom;
  /** ⭐ ขึ้นบล็อก "สินค้าแนะนำ" บนหน้าแรก */
  featured: boolean;
  /** ป้ายบนการ์ดสินค้า ('' = ไม่มี) */
  badge: string;
  /** ยอดขายสะสมตั้งต้น (ระบบบวกต่อให้เองเมื่อมีออเดอร์ชำระแล้ว) */
  soldStr: string;
  /** สั่งกี่ชิ้นขึ้นไปต้องถามสต๊อกก่อน (ว่าง = ใช้ค่ากลาง) */
  bulkAskQty: string;
  /** วิธีจัดส่งขั้นต่ำของสินค้านี้ ('' = ไม่บังคับ) */
  shippingId: string;
  /** ค่าส่งขั้นบันไดตามจำนวนชิ้น (แถวว่าง = ไม่ใช้) */
  shipTiers: { minQty: string; price: string }[];
  /** เกินขั้นสุดท้ายทำยังไง: ใช้ราคาขั้นสุดท้าย / คิดเพิ่มต่อชิ้น / เปลี่ยนวิธีส่ง */
  shipTierMode: "last" | "extra" | "method";
  /** เกินขั้นสุดท้าย คิดเพิ่มชิ้นละ (บาท) */
  shipTierExtra: string;
  /** เกินขั้นสุดท้าย เปลี่ยนเป็นวิธีส่งนี้ (id จากตั้งค่าระบบ) */
  shipTierMethodId: string;
  /** ข้อควรทราบ/เงื่อนไขงาน (แสดงหน้าสินค้า) */
  terms: string;
  /** บังคับแนบลายก่อนสั่ง (ค่าเริ่มต้น = บังคับ) */
  artworkRequired: boolean;
  /** สถานะตรวจสอบหลังบ้าน (มีค่า = ตรวจแล้ว) */
  reviewed?: ProductReview;
};

type DraftCustom = {
  enabled: boolean;
  label: string;
  mode: "area" | "quote";
  unit: string;
  ratePerSqm: string;
  baseFee: string;
  minPrice: string;
  note: string;
  /** กลุ่มตัวเลือกที่ยังให้ลูกค้าเลือกได้ตอนใช้กำหนดขนาดเอง (ไม่ติ๊ก = ปิดกลุ่มนั้น) */
  keepOptions: string[];
};

/** แปลงโค้ดหน่วยเดิม (cm/inch/m) → ป้ายหน่วยในคลัง (backward-compat) */
function unitLabelOf(u?: string): string {
  return ({ cm: "ซม.", inch: "นิ้ว", m: "เมตร" } as Record<string, string>)[u ?? ""] ?? u ?? "ซม.";
}

/** คอลัมน์ทั้งหมด = ผลคูณคาร์ทีเซียนของตัวเลือกในกลุ่ม driverLabels (แต่ละคอลัมน์ = ค่าที่เรียงตาม driverLabels) */
function pricingColumns(options: DraftOption[], driverLabels: string[]): string[][] {
  // ไม่มี driver = ราคาแบบขั้นบันไดล้วน → คอลัมน์ราคาเดียว (key "")
  if (driverLabels.length === 0) return [[]];
  const groups = driverLabels.map((l) => options.find((o) => o.label === l)?.choices.map((c) => c.name.trim()).filter(Boolean) ?? []);
  if (groups.some((g) => g.length === 0)) return [];
  let combos: string[][] = [[]];
  for (const g of groups) combos = combos.flatMap((c) => g.map((v) => [...c, v]));
  return combos;
}
const columnKey = (combo: string[]) => combo.join("│");

const MAX_PHOTOS = 5;

/** ย่อรูปด้วย canvas เป็น data URL ขนาดเล็ก (กว้าง/สูงไม่เกิน max) เพื่อเก็บใน localStorage ได้ */
function fileToDataUrl(file: File, max = 700, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("ไฟล์นี้ไม่ใช่รูปภาพ"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > max) {
          height = Math.round((height * max) / width);
          width = max;
        } else if (height > max) {
          width = Math.round((width * max) / height);
          height = max;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** ย่อรูปด้วย canvas เป็น Blob (JPEG) สำหรับอัปโหลดขึ้น Storage — คุณภาพสูงกว่าเพราะไม่ติดลิมิต localStorage */
function fileToBlob(file: File, max = 1200, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("ไฟล์นี้ไม่ใช่รูปภาพ"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > max) {
          height = Math.round((height * max) / width);
          width = max;
        } else if (height > max) {
          width = Math.round((width * max) / height);
          height = max;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("แปลงรูปไม่สำเร็จ"))), "image/jpeg", quality);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function toDraft(p: Product): Draft {
  return {
    name: p.name,
    slug: p.slug ?? "",
    category: p.category,
    price: String(p.price),
    oldPrice: p.oldPrice ? String(p.oldPrice) : "",
    emoji: p.emoji,
    gradient: p.gradient,
    imageSrc: p.imageSrc,
    photos: [...new Set([p.imageSrc, ...p.images.map((im) => im.src)].filter((s): s is string => !!s))].slice(0, MAX_PHOTOS),
    options: p.options.map((o) => ({
      label: o.label,
      choices: o.choices.map((c) => ({ name: c.name, extra: c.extra ? String(c.extra) : "" })),
      ...(o.presetId ? { presetId: o.presetId } : {}),
      display: o.display ?? "pills",
      ...(o.extraFromQty ? { extraFromQty: String(o.extraFromQty) } : {}),
    })),
    rules: (p.rules ?? []).map((r) => ({
      whenLabel: r.when.label,
      whenChoice: r.when.choice,
      whenChoices: r.when.choices?.length ? [...r.when.choices] : r.when.choice ? [r.when.choice] : [],
      limitLabel: r.limit.label,
      allow: [...r.limit.allow],
    })),
    pricing: p.pricing
      ? {
          enabled: true,
          unit: p.pricing.unit,
          driverLabels: [...p.pricing.driverLabels],
          tiers: p.pricing.tiers.map((t) => ({ upTo: t.upTo == null ? "" : String(t.upTo), label: t.label })),
          cells: Object.fromEntries(
            Object.entries(p.pricing.cells).map(([k, v]) => [k, v.map((n) => String(n))])
          ),
          tierByDesign: !!p.tierByDesign,
        }
      : { enabled: false, unit: "ชิ้น", driverLabels: [], tiers: [], cells: {}, tierByDesign: !!p.tierByDesign },
    rateMeta: p.priceRates?.[0]
      ? {
          label: p.priceRates[0].label,
          desc: p.priceRates[0].desc ?? "",
          minQty: p.priceRates[0].minQty != null ? String(p.priceRates[0].minQty) : "",
          minPerDesign: p.priceRates[0].minPerDesign != null ? String(p.priceRates[0].minPerDesign) : "",
          extraDesignFee: p.priceRates[0].extraDesignFee != null ? String(p.priceRates[0].extraDesignFee) : "",
          freeMixBelowQty: p.priceRates[0].freeMixBelowQty != null ? String(p.priceRates[0].freeMixBelowQty) : "",
        }
      : { ...EMPTY_RATE_META },
    extraRates: (p.priceRates ?? []).slice(1).map((r) => ({
      id: r.id,
      label: r.label,
      desc: r.desc ?? "",
      minQty: r.minQty != null ? String(r.minQty) : "",
      minPerDesign: r.minPerDesign != null ? String(r.minPerDesign) : "",
      extraDesignFee: r.extraDesignFee != null ? String(r.extraDesignFee) : "",
      freeMixBelowQty: r.freeMixBelowQty != null ? String(r.freeMixBelowQty) : "",
      tiers: r.pricing.tiers.map((t) => ({ upTo: t.upTo == null ? "" : String(t.upTo), label: t.label })),
      cells: Object.fromEntries(Object.entries(r.pricing.cells).map(([k, v]) => [k, v.map((n) => String(n))])),
    })),
    highlights: [...p.highlights],
    images: p.images.map((im) => ({ ...im })),
    tabs: (p.tabs ?? []).map((t) => ({ title: t.title, text: t.text })),
    body: (p.body ?? []).map((b) => ({
      heading: b.heading,
      text: b.text,
      emoji: b.image?.emoji ?? "",
      gradient: b.image?.gradient ?? "from-sky-100 to-blue-200",
      imgLabel: b.image?.label ?? "",
      src: b.image?.src ?? "",
      align: b.align ?? "left",
    })),
    seo: {
      title: p.seo?.title ?? "",
      description: p.seo?.description ?? "",
      keywords: (p.seo?.keywords ?? []).join(", "),
      faqs: (p.seo?.faqs ?? []).map((f) => ({ q: f.q, a: f.a })),
    },
    custom: {
      enabled: p.custom?.enabled ?? false,
      label: p.custom?.label ?? "กำหนดขนาดเอง",
      mode: p.custom?.mode ?? "area",
      unit: unitLabelOf(p.custom?.unit),
      ratePerSqm: p.custom?.ratePerSqm != null ? String(p.custom.ratePerSqm) : "",
      baseFee: p.custom?.baseFee != null ? String(p.custom.baseFee) : "",
      minPrice: p.custom?.minPrice != null ? String(p.custom.minPrice) : "",
      note: p.custom?.note ?? "",
      keepOptions: [...(p.custom?.keepOptions ?? [])],
    },
    featured: !!p.featured,
    badge: p.badge ?? "",
    soldStr: String(p.sold ?? 0),
    bulkAskQty: p.bulkAskQty != null && p.bulkAskQty > 0 ? String(p.bulkAskQty) : "",
    shippingId: p.shippingId ?? "",
    shipTiers: (p.shipTiers ?? []).map((t) => ({ minQty: String(t.minQty), price: String(t.price) })),
    shipTierMode: p.shipTierMethodId ? "method" : p.shipTierExtra && p.shipTierExtra > 0 ? "extra" : "last",
    shipTierExtra: p.shipTierExtra != null && p.shipTierExtra > 0 ? String(p.shipTierExtra) : "",
    shipTierMethodId: p.shipTierMethodId ?? "",
    terms: p.terms ?? "",
    artworkRequired: p.artworkRequired !== false,
    reviewed: p.reviewed,
  };
}

/** แปลง draft.seo → ProductSeo (ตัดค่าว่าง) · ทั้งหมดว่าง = undefined */
function buildSeo(s: DraftSeo): ProductSeo | undefined {
  const title = s.title.trim();
  const description = s.description.trim();
  const keywords = s.keywords.split(/[,\n]/).map((k) => k.trim()).filter(Boolean);
  const faqs = s.faqs
    .map((f) => ({ q: f.q.trim(), a: f.a.trim() }))
    .filter((f) => f.q && f.a);
  if (!title && !description && keywords.length === 0 && faqs.length === 0) return undefined;
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(keywords.length ? { keywords } : {}),
    ...(faqs.length ? { faqs } : {}),
  };
}

function fromDraftOptions(draft: DraftOption[]): ProductOption[] {
  return draft
    .map((o) => ({
      label: o.label.trim(),
      choices: o.choices
        .filter((c) => c.name.trim())
        .map((c) => {
          const extra = Number(c.extra);
          return Number.isFinite(extra) && extra > 0
            ? { name: c.name.trim(), extra }
            : { name: c.name.trim() };
        }),
      ...(o.presetId ? { presetId: o.presetId } : {}),
      ...(o.display === "dropdown" ? { display: "dropdown" as const } : {}),
      ...(Number(o.extraFromQty) > 0 ? { extraFromQty: Math.floor(Number(o.extraFromQty)) } : {}),
    }))
    .filter((o) => o.label && o.choices.length > 0);
}

/** ซิงก์กลุ่มที่ลิงก์คลังในดราฟต์ให้ตรงกับคลังปัจจุบัน (label+choices เป็นค่าล่าสุด) */
function syncLinkedDraft(options: DraftOption[], presets: OptionPreset[]): DraftOption[] {
  return options.map((o) => {
    if (!o.presetId) return o;
    const preset = presets.find((p) => p.id === o.presetId);
    if (!preset) return o; // คลังหาย → คงสำเนาสำรองไว้
    return {
      ...o,
      label: preset.label,
      choices: preset.choices.map((c) => ({ name: c.name, extra: c.extra ? String(c.extra) : "" })),
    };
  });
}

const NAV_TONE: Record<string, string> = {
  basic: "bg-sky-100 text-sky-700 hover:bg-sky-200",
  photos: "bg-violet-100 text-violet-700 hover:bg-violet-200",
  terms: "bg-rose-100 text-rose-700 hover:bg-rose-200",
  highlights: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
  options: "bg-orange-100 text-orange-700 hover:bg-orange-200",
  bulk: "bg-lime-100 text-lime-700 hover:bg-lime-200",
  rules: "bg-cyan-100 text-cyan-700 hover:bg-cyan-200",
  pricing: "bg-teal-100 text-teal-700 hover:bg-teal-200",
  custom: "bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-200",
  body: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200",
  seo: "bg-purple-100 text-purple-700 hover:bg-purple-200",
};

export default function ProductEditor({ product }: { product: Product }) {
  const router = useRouter();
  const productId = product.id;
  const original = product;
  const [draft, setDraft] = useState<Draft>(() => toDraft(original));
  const [deleting, setDeleting] = useState(false);
  const [overridden, setOverridden] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  /** savedAt ของข้อมูลที่โหลดมา — ส่งกลับตอนบันทึกเพื่อให้เซิร์ฟเวอร์กันแท็บเก่าเขียนทับ */
  const [baseSavedAt, setBaseSavedAt] = useState<string>("");
  // รูปแบบจัดส่งที่ร้านตั้งไว้ — ใช้เป็นตัวเลือก "ค่าส่งขั้นต่ำของสินค้านี้"
  const [shipMethods, setShipMethods] = useState<ShippingMethod[]>(DEFAULT_SHIPPING);
  useEffect(() => {
    void fetchShopPayment().then((p) => setShipMethods(shippingOf(p)));
  }, []);
  const [saveError, setSaveError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const dragPhotoRef = useRef<number | null>(null); // รูปที่กำลังลาก (ref — อ่านได้ทันทีตอน drop)
  const [dragPhoto, setDragPhoto] = useState<number | null>(null); // ไว้ทำ visual feedback
  // ── ยุบ/ขยายแต่ละหัวข้อ (จำไว้ในเบราว์เซอร์) — หน้ายาวมาก เปิดทุกอันพร้อมกันหาอะไรไม่เจอ ──
  const [closedSecs, setClosedSecs] = useState<Record<string, boolean>>({ seo: true, body: true, terms: true, rules: true });
  useEffect(() => {
    try {
      const saved = localStorage.getItem("admin.product.closedSecs");
      if (saved) setClosedSecs(JSON.parse(saved));
    } catch {}
  }, []);
  function toggleSec(id: string) {
    setClosedSecs((cur) => {
      const next = { ...cur, [id]: !cur[id] };
      try {
        localStorage.setItem("admin.product.closedSecs", JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  /** คลาสของ section + ปุ่มยุบ — ซ่อนเนื้อหาด้วย CSS (ดู .sec-collapsed ใน globals.css) */
  const secCls = (id: string) => (closedSecs[id] ? " sec-collapsed" : "");
  const SecToggle = ({ id }: { id: string }) => (
    <button
      type="button"
      onClick={() => toggleSec(id)}
      aria-label={closedSecs[id] ? "ขยายหัวข้อนี้" : "ยุบหัวข้อนี้"}
      title={closedSecs[id] ? "ขยายหัวข้อนี้" : "ยุบหัวข้อนี้"}
      // ลอยคร่อมขอบบนของการ์ด — กันไปทับปุ่ม/ข้อความในแถวหัวข้อ (เช่น ＋ เพิ่มท่อนเนื้อหา)
      className="sec-toggle absolute -top-3 right-5 z-10 grid h-6 w-10 place-items-center rounded-full bg-white text-slate-500 shadow-sm ring-1 ring-slate-300 transition hover:bg-slate-50 hover:text-slate-900 hover:ring-slate-400"
    >
      <span className={`text-xs font-bold leading-none transition ${closedSecs[id] ? "" : "rotate-180"}`}>▾</span>
    </button>
  );

  const [pricingOpen, setPricingOpen] = useState(false);
  /** ท่อนเนื้อหาที่กำลังลากรูปค้างอยู่ (ไฮไลต์กรอบ) */
  const [bodyDragOver, setBodyDragOver] = useState<number | null>(null);
  /** ท่อนเนื้อหาที่พับอยู่ (เนื้อหายาว ๆ พับเก็บให้หน้าโล่ง) */
  const [bodyFolded, setBodyFolded] = useState<Record<number, boolean>>({});

  /** อัปโหลดรูปเข้าท่อนเนื้อหา — ใช้ทั้งปุ่มเลือกไฟล์และลากมาวาง */
  async function uploadBodyImage(i: number, f: File) {
    if (!f.type.startsWith("image/")) return;
    try {
      const blob = await fileToBlob(f);
      const fd = new FormData();
      fd.append("file", blob, "body.jpg");
      fd.append("productId", productId);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      // โหมดเดโมยังไม่ตั้ง Supabase → เก็บ base64 แทน (เหมือนรูปสินค้า)
      const src =
        res.status === 503
          ? await fileToDataUrl(f)
          : ((await res.json().catch(() => ({}))) as { url?: string }).url;
      if (src) setDraft((d) => ({ ...d, body: d.body.map((x, j) => (j === i ? { ...x, src } : x)) }));
      else setSaveError("อัปโหลดรูปไม่สำเร็จ");
    } catch {
      setSaveError("อัปโหลดรูปไม่สำเร็จ");
    }
  }

  /**
   * เปลี่ยนชื่อ "กลุ่มตัวเลือก" — ราคาขั้นบันได (driverLabels) และกฎเงื่อนไขอ้างชื่อกลุ่มด้วย
   * ต้องเปลี่ยนตามพร้อมกัน ไม่งั้นตอนบันทึกระบบหากลุ่มไม่เจอแล้วทิ้งตารางราคาทั้งตาราง
   */
  function renameOptionGroup(gi: number, newLabel: string) {
    setDraft((d) => {
      const oldLabel = d.options[gi]?.label ?? "";
      return {
        ...d,
        options: d.options.map((op, i) => (i === gi ? { ...op, label: newLabel } : op)),
        pricing: {
          ...d.pricing,
          driverLabels: d.pricing.driverLabels.map((l) => (l === oldLabel ? newLabel : l)),
        },
        rules: d.rules.map((r) => ({
          ...r,
          whenLabel: r.whenLabel === oldLabel ? newLabel : r.whenLabel,
          limitLabel: r.limitLabel === oldLabel ? newLabel : r.limitLabel,
        })),
      };
    });
  }

  /**
   * เปลี่ยนชื่อ "ตัวเลือกในกลุ่ม" — ช่องราคาขั้นบันไดใช้ชื่อตัวเลือกเป็นคีย์ (คั่นด้วย │)
   * ต้องย้ายค่าราคาไปคีย์ใหม่ด้วย ไม่งั้นราคาที่กรอกไว้กลายเป็น 0 หมด · กฎเงื่อนไขก็อ้างชื่อนี้
   */
  function renameOptionChoice(gi: number, ci: number, newName: string) {
    setDraft((d) => {
      const group = d.options[gi];
      if (!group) return d;
      const oldName = group.choices[ci]?.name ?? "";
      const di = d.pricing.driverLabels.indexOf(group.label); // กลุ่มนี้เป็นแกนของตารางราคาไหม
      // ย้ายคีย์ราคาไปชื่อใหม่ — ทั้งตารางเรทหลักและทุกเรทเพิ่มเติม (ใช้คีย์คอลัมน์ร่วมกัน)
      const remap = (cells: Record<string, string[]>): Record<string, string[]> => {
        if (di < 0 || !oldName || oldName === newName) return cells;
        return Object.fromEntries(
          Object.entries(cells).map(([key, v]) => {
            const parts = key.split("│");
            if (parts[di] === oldName) parts[di] = newName;
            return [parts.join("│"), v];
          })
        );
      };
      return {
        ...d,
        options: d.options.map((op, i) =>
          i === gi ? { ...op, choices: op.choices.map((c, j) => (j === ci ? { ...c, name: newName } : c)) } : op
        ),
        pricing: { ...d.pricing, cells: remap(d.pricing.cells) },
        extraRates: d.extraRates.map((r) => ({ ...r, cells: remap(r.cells) })),
        rules: d.rules.map((r) => ({
          ...r,
          whenChoice: r.whenLabel === group.label && r.whenChoice === oldName ? newName : r.whenChoice,
          whenChoices:
            r.whenLabel === group.label ? r.whenChoices.map((a) => (a === oldName ? newName : a)) : r.whenChoices,
          allow: r.limitLabel === group.label ? r.allow.map((a) => (a === oldName ? newName : a)) : r.allow,
        })),
      };
    });
  }
  // ── ดึงข้อมูลจาก URL มาเติม/แก้สินค้านี้ ──
  const [impOpen, setImpOpen] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [impUrl, setImpUrl] = useState("");
  const [impLoading, setImpLoading] = useState(false);
  const [impErr, setImpErr] = useState("");
  const [impList, setImpList] = useState<ScrapedProduct[]>([]);
  /** รูปที่เลือกจะนำเข้า — คีย์ = ลำดับสินค้าในผลลัพธ์ (ค่าเริ่มต้น: เลือกทุกรูปเท่าที่ใส่ได้) */
  const [impPick, setImpPick] = useState<Record<number, string[]>>({});
  const [uploading, setUploading] = useState(false);
  // คลังหน่วยขนาด (ส่วนกลาง) + โมดัลจัดการหน่วย
  const [units, setUnits] = useState<CustomUnit[]>([]);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [newUnitLabel, setNewUnitLabel] = useState("");
  const [newUnitToM, setNewUnitToM] = useState("");
  useEffect(() => setUnits(loadUnits()), []);
  function refreshUnits() { setUnits(loadUnits()); }

  // ชื่อผู้ตรวจ (คนที่ล็อกอิน) — โหมดเดโมที่ไม่มีชื่อใช้ "ทีมงาน"
  const [reviewer, setReviewer] = useState("ทีมงาน");
  useEffect(() => {
    getAdminSession().then((s) => s.name && setReviewer(s.name));
  }, []);

  /** สลับสถานะ "ตรวจแล้ว" ในหน้าแก้ไข (จะบันทึกจริงเมื่อกด 💾 บันทึก) */
  function toggleReviewed() {
    setDraft((d) => ({
      ...d,
      reviewed: d.reviewed ? undefined : { by: reviewer, at: new Date().toISOString() },
    }));
  }

  async function addPhotos(files?: FileList | File[] | null) {
    if (!files) return;
    const room = MAX_PHOTOS - draft.photos.length;
    if (room <= 0) {
      setSaveError(`ใส่รูปได้สูงสุด ${MAX_PHOTOS} รูป`);
      return;
    }
    const picked = [...files].filter((f) => f.type.startsWith("image/")).slice(0, room);
    if (!picked.length) return;
    setSaveError("");
    setUploading(true);
    const urls: string[] = [];
    for (const f of picked) {
      try {
        // ย่อรูป → อัปโหลดขึ้น Supabase Storage → เก็บแค่ URL
        const blob = await fileToBlob(f);
        const fd = new FormData();
        fd.append("file", blob, "photo.jpg");
        fd.append("productId", productId);
        const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
        if (res.status === 503) {
          // โหมดเดโม (ยังไม่ตั้งค่า Supabase) → เก็บ base64 แทน
          urls.push(await fileToDataUrl(f));
        } else {
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.url) urls.push(data.url as string);
          else setSaveError(data.error ?? "อัปโหลดรูปไม่สำเร็จ");
        }
      } catch {
        // ข้ามไฟล์ที่อ่านไม่ได้
      }
    }
    setUploading(false);
    if (urls.length) {
      setDraft((d) => ({ ...d, photos: [...d.photos, ...urls].slice(0, MAX_PHOTOS) }));
    }
  }

  /** สลับตำแหน่งรูป (ลากวาง หรือปุ่มลูกศร) — รูปแรกเสมอคือรูปหลักบนการ์ด */
  function movePhoto(from: number, to: number) {
    if (from === to || to < 0 || to >= draft.photos.length) return;
    const next = [...draft.photos];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    patch({ photos: next });
  }

  function removePhoto(i: number) {
    setDraft((d) => ({ ...d, photos: d.photos.filter((_, j) => j !== i) }));
  }

  // คลังตัวเลือกกลาง (สำหรับปุ่ม "แทรกจากคลัง" + ซิงก์กลุ่มที่ลิงก์)
  const [presets, setPresets] = useState<OptionPreset[]>([]);

  // SEO ยังว่าง → ระบบเขียนให้เลยอัตโนมัติ (ไม่ต้องกดปุ่ม) — แอดมินแก้ต่อได้ก่อนบันทึก
  function withAutoSeo(d: Draft): Draft {
    const empty = !d.seo.title && !d.seo.description && !d.seo.keywords && d.seo.faqs.length === 0;
    if (!empty || !d.name.trim()) return d;
    const auto = autoSeoOf({ name: d.name, price: Number(d.price) || 0, categoryId: d.category, options: d.options, highlights: d.highlights });
    return { ...d, seo: { title: auto.title, description: auto.description, keywords: auto.keywords.join(", "), faqs: auto.faqs } };
  }

  // โหลดข้อมูลล่าสุด (Supabase หรือ localStorage) + คลังตัวเลือก หลัง mount
  useEffect(() => {
    let active = true;
    Promise.all([fetchProductRaw(productId), fetchPresets()]).then(([p, ps]) => {
      if (!active) return;
      setPresets(ps);
      if (p) {
        const d = toDraft(p);
        setBaseSavedAt(p.savedAt ?? "");
        setDraft(withAutoSeo({ ...d, options: syncLinkedDraft(d.options, ps) }));
      } else {
        setDraft((cur) => withAutoSeo(cur));
      }
    });
    setOverridden(!isSupabaseConfigured && hasOverride(productId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // ลิงก์ตามที่ตั้งในดราฟต์ — slug ภาษาไทยโชว์ตรง ๆ อ่านรู้เรื่อง (เบราว์เซอร์ encode ให้เองตอนเปิด)
  const draftSlug = slugifyProductName(draft.slug);
  const productUrl = `/products/${draftSlug || productId}`;
  // เติมโดเมนหลัง mount เพื่อให้ HTML ฝั่งเซิร์ฟเวอร์/เบราว์เซอร์ตรงกัน
  const [fullUrl, setFullUrl] = useState(productUrl);
  useEffect(() => {
    setFullUrl(`${publicOrigin()}${productUrl}`);
  }, [productUrl]);

  function patch(patchObj: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patchObj }));
  }

  function patchPricing(pt: Partial<DraftPricing>) {
    setDraft((d) => ({ ...d, pricing: { ...d.pricing, ...pt } }));
  }

  function patchCustom(pt: Partial<DraftCustom>) {
    setDraft((d) => ({ ...d, custom: { ...d.custom, ...pt } }));
  }

  function toggleDriver(label: string) {
    setDraft((d) => {
      const has = d.pricing.driverLabels.includes(label);
      const driverLabels = has
        ? d.pricing.driverLabels.filter((l) => l !== label)
        : [...d.pricing.driverLabels, label];
      return { ...d, pricing: { ...d.pricing, driverLabels } };
    });
  }

  function setCell(key: string, ti: number, val: string) {
    setDraft((d) => {
      const cells = { ...d.pricing.cells };
      const arr = [...(cells[key] ?? [])];
      arr[ti] = val;
      cells[key] = arr;
      return { ...d, pricing: { ...d.pricing, cells } };
    });
  }

  // ── หลายเรทราคาในโมดัล: rateIdx 0 = เรทหลัก (ตาราง pricing), 1..n = extraRates[n-1] ──
  const [rateIdx, setRateIdx] = useState(0);
  // ยุบ/กางกลุ่มตัวเลือกสินค้า (คีย์ = ลำดับกลุ่ม · ไม่เคยแตะ = ยุบไว้ก่อน)
  const [optFolded, setOptFolded] = useState<Record<number, boolean>>({});
  const isOptFolded = (gi: number) => optFolded[gi] ?? true;
  const toggleOptFold = (gi: number) => setOptFolded((f) => ({ ...f, [gi]: !(f[gi] ?? true) }));
  const activeExtra = rateIdx > 0 ? draft.extraRates[rateIdx - 1] : undefined;
  const activeTiers = rateIdx === 0 ? draft.pricing.tiers : (activeExtra?.tiers ?? []);
  const activeCells = rateIdx === 0 ? draft.pricing.cells : (activeExtra?.cells ?? {});
  const activeMeta: DraftRateMeta = rateIdx === 0 ? draft.rateMeta : (activeExtra ?? EMPTY_RATE_META);

  function patchActiveTiers(tiers: DraftTier[]) {
    if (rateIdx === 0) patchPricing({ tiers });
    else setDraft((d) => ({ ...d, extraRates: d.extraRates.map((r, i) => (i === rateIdx - 1 ? { ...r, tiers } : r)) }));
  }
  function setActiveCell(key: string, ti: number, val: string) {
    if (rateIdx === 0) {
      setCell(key, ti, val);
      return;
    }
    setDraft((d) => ({
      ...d,
      extraRates: d.extraRates.map((r, i) => {
        if (i !== rateIdx - 1) return r;
        const arr = [...(r.cells[key] ?? [])];
        arr[ti] = val;
        return { ...r, cells: { ...r.cells, [key]: arr } };
      }),
    }));
  }
  /** ล้างราคาทั้งแถวของเรทที่แก้อยู่ — แถวว่าง = ไม่ขายคู่ตัวเลือกนี้ในเรทนี้ (หน้าร้านซ่อนให้) */
  function clearActiveRow(key: string) {
    const empty = activeTiers.map(() => "");
    if (rateIdx === 0) {
      setDraft((d) => ({ ...d, pricing: { ...d.pricing, cells: { ...d.pricing.cells, [key]: empty } } }));
    } else {
      setDraft((d) => ({
        ...d,
        extraRates: d.extraRates.map((r, i) => (i === rateIdx - 1 ? { ...r, cells: { ...r.cells, [key]: empty } } : r)),
      }));
    }
  }
  function patchActiveMeta(pt: Partial<DraftRateMeta>) {
    if (rateIdx === 0) setDraft((d) => ({ ...d, rateMeta: { ...d.rateMeta, ...pt } }));
    else setDraft((d) => ({ ...d, extraRates: d.extraRates.map((r, i) => (i === rateIdx - 1 ? { ...r, ...pt } : r)) }));
  }
  function addRate() {
    setDraft((d) => ({
      ...d,
      extraRates: [
        ...d.extraRates,
        {
          id: `r${d.extraRates.length + 2}-${Math.random().toString(36).slice(2, 7)}`,
          label: "",
          desc: "",
          minQty: "",
          minPerDesign: "",
          extraDesignFee: "",
          freeMixBelowQty: "",
          // เริ่มด้วยช่วงจำนวนชุดเดียวกับเรทหลัก (แก้ทีหลังได้) — ราคาให้กรอกใหม่
          tiers: d.pricing.tiers.map((t) => ({ ...t })),
          cells: {},
        },
      ],
    }));
    setRateIdx(draft.extraRates.length + 1);
  }
  function removeRate(extraIdx: number) {
    if (!window.confirm("ลบเรทนี้ทั้งตาราง?")) return;
    setDraft((d) => ({ ...d, extraRates: d.extraRates.filter((_, i) => i !== extraIdx) }));
    setRateIdx(0);
  }

  async function save() {
    const price = Number(draft.price);
    const oldPrice = draft.oldPrice ? Number(draft.oldPrice) : undefined;
    if (!draft.name.trim() || !Number.isFinite(price) || price <= 0) return;

    // ลิงก์ตามชื่อ (slug) — กันชนกับสินค้าตัวอื่น (ทั้ง id และ slug ของเขา) ก่อนบันทึก
    const slug = slugifyProductName(draft.slug);
    if (slug && slug !== productId) {
      const all = await fetchProductNamesLite();
      const dup = all.find((p) => p.id !== productId && (p.id === slug || (p.slug ?? "") === slug));
      if (dup) {
        setSaveError(`ลิงก์ "${slug}" ถูกใช้กับสินค้า "${dup.name}" อยู่แล้ว — ตั้งเป็นอย่างอื่น`);
        return;
      }
    }

    const emoji = draft.emoji.trim() || "🦆";
    const photos = draft.photos.filter(Boolean).slice(0, MAX_PHOTOS);
    let images: ProductImage[];
    let imageSrc: string | undefined;
    if (photos.length > 0) {
      // มีรูปจริง → รูปแรกเป็นรูปหลัก, ที่เหลือเป็นรูปมุมอื่น (ไม่มีชื่อ/สีพื้น)
      images = photos.map((src) => ({ emoji, gradient: draft.gradient, label: "", src }));
      imageSrc = photos[0];
    } else {
      // ยังไม่มีรูปจริง → คงภาพ placeholder อีโมจิเดิมไว้
      images = draft.images
        .map((im) => ({ emoji: im.emoji.trim() || "🖼️", gradient: im.gradient, label: im.label.trim() }))
        .filter((im) => im.emoji);
      if (images.length === 0) images = [{ emoji, gradient: draft.gradient, label: "ด้านหน้า" }];
      imageSrc = undefined;
    }

    const body: BodySection[] = draft.body
      .filter((b) => b.heading.trim() || b.text.trim())
      .map((b) => ({
        heading: b.heading.trim(),
        text: b.text.trim(),
        align: b.align,
        ...(b.emoji.trim() || b.src
          ? {
              image: {
                emoji: b.emoji.trim() || "🖼",
                gradient: b.gradient,
                // คำบรรยายรูปเฉพาะที่พิมพ์เอง — เดิม fallback เป็นชื่อหัวข้อ ทำให้ขึ้นซ้ำใต้รูปโดยไม่ตั้งใจ
                label: b.imgLabel.trim(),
                ...(b.src ? { src: b.src } : {}),
              },
            }
          : {}),
      }));

    // เก็บเฉพาะกฎที่กรอกครบและตัวเลือกที่อนุญาตมีอย่างน้อย 1
    const rules: OptionRule[] = draft.rules
      .filter((r) => r.whenLabel && (r.whenChoices.length > 0 || r.whenChoice) && r.limitLabel && r.allow.length > 0)
      .map((r) => {
        const whenChoices = r.whenChoices.length ? [...r.whenChoices] : [r.whenChoice];
        return {
          // choice ตัวแรกคงไว้เพื่อ backward-compat · choices = เงื่อนไขจริง (หลายตัวในกฎเดียว)
          when: { label: r.whenLabel, choice: whenChoices[0], choices: whenChoices },
          limit: { label: r.limitLabel, allow: [...r.allow] },
        };
      });

    // สร้างตารางราคาขั้นบันได (ถ้าเปิดใช้) — รองรับทั้งแบบมี driver และแบบตามจำนวนล้วน (driverLabels ว่าง)
    let pricing: PriceMatrix | undefined;
    if (draft.pricing.enabled && draft.pricing.tiers.length > 0) {
      const cols = pricingColumns(draft.options, draft.pricing.driverLabels);
      const tiers = draft.pricing.tiers.map((t) => ({
        upTo: t.upTo.trim() === "" ? null : Number(t.upTo),
        label: t.label.trim() || `≤ ${t.upTo}`,
      }));
      const cells: Record<string, number[]> = {};
      for (const combo of cols) {
        const key = columnKey(combo);
        const raw = draft.pricing.cells[key] ?? [];
        // แถวที่ล้างราคาไว้ทั้งแถว = ไม่ขายคู่ตัวเลือกนี้ในเรทนี้ → ไม่เก็บคีย์ (หน้าร้านซ่อนให้)
        if (tiers.every((_, ti) => !String(raw[ti] ?? "").trim())) continue;
        cells[key] = tiers.map((_, ti) => {
          const n = Number(raw[ti]);
          return Number.isFinite(n) && n >= 0 ? n : 0;
        });
      }
      if (Object.keys(cells).length > 0) {
        pricing = {
          unit: draft.pricing.unit.trim() || "ชิ้น",
          driverLabels: [...draft.pricing.driverLabels],
          tiers,
          cells,
        };
      } else {
        // กันเหนียว: แกนตารางชี้กลุ่มที่หาไม่เจอ (เช่นลบกลุ่มไป) — เก็บช่องราคาที่กรอกไว้ตามเดิม
        // ดีกว่าลบเงียบ ๆ แล้วราคาที่กรอกไว้หายทั้งตาราง (ค่อยกลับมาแก้แกนทีหลังได้)
        const kept = Object.fromEntries(
          Object.entries(draft.pricing.cells).map(([k, v]) => [
            k,
            tiers.map((_, ti) => {
              const n = Number(v[ti]);
              return Number.isFinite(n) && n >= 0 ? n : 0;
            }),
          ])
        );
        if (Object.keys(kept).length > 0) {
          pricing = {
            unit: draft.pricing.unit.trim() || "ชิ้น",
            driverLabels: [...draft.pricing.driverLabels],
            tiers,
            cells: kept,
          };
        }
      }
    }

    // หลายเรทราคา — เรทหลัก = ตาราง pricing ข้างบน + เรทเพิ่มเติมแต่ละอันสร้างตารางของตัวเอง
    let priceRates: Product["priceRates"];
    const metaHasValue =
      draft.rateMeta.label.trim() || Number(draft.rateMeta.minQty) > 0 || Number(draft.rateMeta.minPerDesign) > 0;
    if (pricing && (draft.extraRates.length > 0 || metaHasValue)) {
      const buildRateMatrix = (tiersDraft: DraftTier[], cellsDraft: Record<string, string[]>): PriceMatrix | undefined => {
        if (!tiersDraft.length) return undefined;
        const tiers = tiersDraft.map((t) => ({
          upTo: t.upTo.trim() === "" ? null : Number(t.upTo),
          label: t.label.trim() || `≤ ${t.upTo}`,
        }));
        const cols = pricingColumns(draft.options, draft.pricing.driverLabels);
        const cells: Record<string, number[]> = {};
        for (const combo of cols) {
          const key = columnKey(combo);
          const raw = cellsDraft[key] ?? [];
          // แถวว่างทั้งแถว = ไม่ขายคู่ตัวเลือกนี้ในเรทนี้
          if (tiers.every((_, ti) => !String(raw[ti] ?? "").trim())) continue;
          cells[key] = tiers.map((_, ti) => {
            const n = Number(raw[ti]);
            return Number.isFinite(n) && n >= 0 ? n : 0;
          });
        }
        if (!Object.keys(cells).length) return undefined;
        return { unit: pricing!.unit, driverLabels: [...pricing!.driverLabels], tiers, cells };
      };
      const metaOf = (m: DraftRateMeta, fallbackLabel: string) => ({
        label: m.label.trim() || fallbackLabel,
        ...(m.desc.trim() ? { desc: m.desc.trim() } : {}),
        ...(Number(m.minQty) > 0 ? { minQty: Math.floor(Number(m.minQty)) } : {}),
        ...(Number(m.minPerDesign) > 0 ? { minPerDesign: Math.floor(Number(m.minPerDesign)) } : {}),
        ...(Number(m.extraDesignFee) > 0 ? { extraDesignFee: Number(m.extraDesignFee) } : {}),
        ...(Number(m.freeMixBelowQty) > 0 ? { freeMixBelowQty: Math.floor(Number(m.freeMixBelowQty)) } : {}),
      });
      const list: NonNullable<Product["priceRates"]> = [
        { id: "r1", ...metaOf(draft.rateMeta, "เรทที่ 1"), pricing },
      ];
      draft.extraRates.forEach((r, i) => {
        const m = buildRateMatrix(r.tiers, r.cells);
        if (m) list.push({ id: r.id, ...metaOf(r, `เรทที่ ${i + 2}`), pricing: m });
      });
      // เรทเดียวและไม่มีเงื่อนไขอะไรเลย = ไม่ต้องเก็บเป็นหลายเรท
      priceRates = list.length > 1 || metaHasValue ? list : undefined;
    }

    // งานกำหนดขนาดเอง (custom)
    let custom: CustomOption | undefined;
    if (draft.custom.enabled && draft.custom.label.trim()) {
      custom = {
        enabled: true,
        label: draft.custom.label.trim(),
        mode: draft.custom.mode,
        unit: draft.custom.unit,
        ...(draft.custom.mode === "area"
          ? {
              unitToMeter: unitToMeter(draft.custom.unit),
              ratePerSqm: Number(draft.custom.ratePerSqm) || 0,
              baseFee: Number(draft.custom.baseFee) || 0,
              minPrice: Number(draft.custom.minPrice) || 0,
            }
          : {}),
        ...(draft.custom.note.trim() ? { note: draft.custom.note.trim() } : {}),
        // เก็บเฉพาะกลุ่มที่ยังมีอยู่จริง (กันชื่อกลุ่มถูกลบ/เปลี่ยนแล้วค้าง)
        ...(() => {
          const keep = draft.custom.keepOptions.filter((l) => draft.options.some((o) => o.label === l));
          return keep.length ? { keepOptions: keep } : {};
        })(),
      };
    }

    const updated: Product = {
      ...original,
      name: draft.name.trim(),
      slug: slug && slug !== productId ? slug : undefined,
      category: draft.category,
      featured: draft.featured,
      badge: (draft.badge || undefined) as Product["badge"],
      sold: Math.max(0, Math.floor(Number(draft.soldStr)) || 0),
      price,
      oldPrice,
      emoji,
      gradient: draft.gradient,
      ...(imageSrc ? { imageSrc } : {}),
      options: fromDraftOptions(draft.options),
      ...(rules.length > 0 ? { rules } : { rules: undefined }),
      pricing,
      priceRates,
      // คิดเรทตามชิ้นต่อลาย — มีผลเฉพาะเมื่อเปิดตารางราคาขั้นบันไดอยู่
      tierByDesign: pricing && draft.pricing.tierByDesign ? true : undefined,
      highlights: draft.highlights.map((h) => h.trim()).filter(Boolean),
      images,
      body,
      tabs: (() => {
        const list = draft.tabs
          .map((t) => ({ title: t.title.trim(), text: t.text.trim() }))
          .filter((t) => t.title && t.text);
        return list.length ? list : undefined;
      })(),
      seo: buildSeo(draft.seo),
      custom,
      bulkAskQty: Number(draft.bulkAskQty) > 0 ? Math.floor(Number(draft.bulkAskQty)) : undefined,
      shippingId: draft.shippingId || undefined,
      shipTiers: (() => {
        const rows = draft.shipTiers
          .map((t) => ({ minQty: Math.floor(Number(t.minQty)), price: Number(t.price) }))
          .filter((t) => t.minQty > 0 && t.price >= 0)
          .sort((a, b) => a.minQty - b.minQty);
        return rows.length ? rows : undefined;
      })(),
      shipTierExtra:
        draft.shipTierMode === "extra" &&
        Number(draft.shipTierExtra) > 0 &&
        draft.shipTiers.some((t) => Number(t.minQty) > 0)
          ? Number(draft.shipTierExtra)
          : undefined,
      shipTierMethodId:
        draft.shipTierMode === "method" && draft.shipTierMethodId && draft.shipTiers.some((t) => Number(t.minQty) > 0)
          ? draft.shipTierMethodId
          : undefined,
      terms: draft.terms.trim() || undefined,
      artworkRequired: draft.artworkRequired ? undefined : false, // undefined = บังคับ (ค่าเริ่มต้น)
      reviewed: draft.reviewed,
    };
    const res = await persistProduct(updated, baseSavedAt);
    if (!res.ok) {
      setSaveError(
        res.error === "storage-full"
          ? "บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม (รูปที่อัปโหลดรวมกันใหญ่เกินไป) ลองลดจำนวนรูปหรือใช้รูปเล็กลง"
          : `บันทึกไม่สำเร็จ: ${res.error ?? "เกิดข้อผิดพลาด"}`
      );
      return;
    }
    // บันทึกผ่าน → ข้อมูลในมือกลายเป็นเวอร์ชันล่าสุด (บันทึกซ้ำได้โดยไม่ติดกันทับ)
    if (res.savedAt) setBaseSavedAt(res.savedAt);
    setSaveError("");
    setOverridden(true);
    setSavedAt(true);
    setTimeout(() => setSavedAt(false), 2000);
  }

  function resetToDefault() {
    resetOverride(productId);
    setDraft(toDraft(original));
    setOverridden(false);
  }

  /** ลบสินค้านี้ถาวร (ยืนยันก่อน) แล้วกลับหน้ารายการ */
  async function removeProduct() {
    if (!window.confirm(`ลบสินค้า “${draft.name || productId}” ถาวร?\nการลบนี้ย้อนกลับไม่ได้`)) return;
    setDeleting(true);
    const ok = await deleteProductDb(productId);
    if (ok) {
      router.push("/admin/products");
    } else {
      setDeleting(false);
      setSaveError("ลบสินค้าไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  }

  // ── ดึงข้อมูลจาก URL (เว็บ Wix) → เลือกสินค้ามาเติมช่องแก้ไข ──
  async function importScrape() {
    setImpErr(""); setImpList([]); setImpLoading(true);
    try {
      const res = await fetch("/api/admin/import?action=scrape", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: impUrl }),
      });
      const d = await res.json();
      if (!res.ok) { setImpErr(d.error ?? "ดึงไม่สำเร็จ"); return; }
      setImpList(d.products ?? []);
      if (!d.products?.length) setImpErr("ไม่พบตารางสินค้าในหน้านี้ (อาจเป็นหน้ารูปล้วน/URL ไม่ถูก)");
    } catch {
      setImpErr("เชื่อมต่อไม่ได้");
    } finally {
      setImpLoading(false);
    }
  }
  // เติมข้อมูลจากสินค้าที่ scrape มาลง draft (ราคา/ตัวเลือก/ราคาขั้นบันได/รูป)
  function importFill(p: ScrapedProduct, index?: number) {
    // รูปที่แอดมินติ๊กไว้ (ถ้าไม่ระบุ = ทุกรูปที่เจอ) จำกัดตามช่องรูปที่เหลือ
    const all = p.imageUrls?.length ? p.imageUrls : p.imageUrl ? [p.imageUrl] : [];
    const picked = index != null && impPick[index] ? impPick[index] : all;
    const photos = picked.slice(0, MAX_PHOTOS);
    patch({
      name: p.name,
      price: String(p.price),
      options: (p.options ?? []).map((o) => ({
        label: o.label,
        choices: o.choices.map((c) => ({ name: c.name, extra: c.extra ? String(c.extra) : "" })),
        display: "pills" as const,
      })),
      pricing: {
        enabled: true,
        unit: p.pricing.unit,
        driverLabels: [...p.pricing.driverLabels],
        tiers: p.pricing.tiers.map((t) => ({ upTo: t.upTo == null ? "" : String(t.upTo), label: t.label })),
        cells: Object.fromEntries(Object.entries(p.pricing.cells).map(([k, v]) => [k, v.map(String)])),
        tierByDesign: draft.pricing.tierByDesign,
      },
      ...(photos.length ? { photos } : {}),
    });
    setImpOpen(false); setImpList([]); setImpUrl(""); setImpPick({});
  }

  // เคลียร์ป้าย "บันทึกแล้ว" ทันทีที่มีการแก้ไขใหม่ (ให้รู้ว่ายังไม่ได้เซฟ)
  useEffect(() => {
    setSavedAt(false);
  }, [draft]);

  const cat = CATEGORIES.find((c) => c.id === draft.category);

  /** ✨ เขียน SEO/AEO อัตโนมัติจากข้อมูลสินค้า (ชื่อ/หมวด/ราคา/ตัวเลือก/จุดเด่น) — เขียนแล้วแก้ต่อได้ */
  function applyAutoSeo() {
    const auto = autoSeoOf({
      name: draft.name,
      price: Number(draft.price) || 0,
      categoryId: draft.category,
      options: draft.options,
      highlights: draft.highlights,
    });
    patch({ seo: { title: auto.title, description: auto.description, keywords: auto.keywords.join(", "), faqs: auto.faqs } });
  }

  function autoFillSeo() {
    const hasOld = draft.seo.title || draft.seo.description || draft.seo.keywords || draft.seo.faqs.length > 0;
    if (hasOld && !window.confirm("เขียนทับ SEO/AEO ที่มีอยู่ด้วยข้อความอัตโนมัติ?")) return;
    applyAutoSeo();
  }

  const categoryLabel = cat?.name ?? draft.category;
  const thumbEmoji = draft.emoji || cat?.emoji || "📦";
  const thumbGradient = draft.gradient || cat?.gradient || "from-amber-100 to-amber-200";
  const NAV_SECTIONS = [
    { id: "sec-basic", label: "ข้อมูลหลัก" },
    { id: "sec-photos", label: "รูป" },
    { id: "sec-terms", label: "ข้อควรทราบ" },
    { id: "sec-highlights", label: "จุดเด่น" },
    { id: "sec-options", label: "ตัวเลือก" },
    { id: "sec-rules", label: "กติกา" },
    { id: "sec-bulk", label: "สั่งเยอะ" },
    { id: "sec-pricing", label: "ราคา" },
    { id: "sec-custom", label: "กำหนดเอง" },
    { id: "sec-body", label: "เนื้อหา" },
    { id: "sec-seo", label: "SEO" },
  ];

  const inputCls =
    "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
  const smallInputCls =
    "rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-slate-200";

  return (
    <div className="w-full pb-24">
      {/* ── แถบบนติดหนึบ: ระบุสินค้า + ปุ่มบันทึก + เมนูลัด ── */}
      <div className="sticky top-14 z-30 -mx-4 mb-4 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur-sm md:top-0 md:-mx-8 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              href="/admin/products"
              aria-label="กลับรายการสินค้า"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 font-bold text-slate-600 transition hover:bg-slate-200"
            >
              ←
            </Link>
            <div className={`grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br text-xl ${thumbGradient}`}>
              {draft.photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.photos[0]} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{thumbEmoji}</span>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold leading-tight text-slate-900">
                {draft.name || "แก้ไขสินค้า"}
              </h1>
              <p className="truncate text-[11px] text-slate-400">
                {categoryLabel} · {productId}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              👁 <span className="hidden sm:inline">ดูหน้าจริง</span>
            </a>
            <button
              type="button"
              onClick={save}
              className={`rounded-full px-6 py-2 text-sm font-bold text-white shadow-sm transition ${
                savedAt ? "bg-emerald-600" : "bg-emerald-500 hover:bg-emerald-600"
              }`}
            >
              💾 {savedAt ? "บันทึกแล้ว" : "บันทึก"}<span className="hidden sm:inline">{savedAt ? "!" : "การแก้ไข"}</span>
            </button>
          </div>
        </div>
        {/* เมนูลัดไปแต่ละส่วน */}
        <nav className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {NAV_SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                const key = s.id.replace("sec-", "");
                if (closedSecs[key]) toggleSec(key); // ยุบอยู่ → เปิดให้เลย ไม่ต้องกดสองที
                document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                history.replaceState(null, "", `#${s.id}`);
              }}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition ${NAV_TONE[s.id.replace("sec-", "")] ?? "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
            >
              {s.label}
            </a>
          ))}
        </nav>
      </div>

      {/*
        ── ลิงก์หน้าร้านของสินค้านี้ ──
        แยกจากปุ่มนำเข้าคนละแถว เพราะเดิมสองปุ่มติดกันแล้วสับสน:
        "คัดลอก" ทำกับลิงก์ที่โชว์อยู่ · "ดึงจาก URL" ให้ไปวางลิงก์อีกอันคนละเว็บ
      */}
      <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-xs font-bold text-slate-500">🔗 ลิงก์หน้าร้านของสินค้านี้</span>
          <code className="min-w-40 flex-1 truncate rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">{fullUrl}</code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(fullUrl);
              setUrlCopied(true);
              setTimeout(() => setUrlCopied(false), 1500);
            }}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              urlCopied ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {urlCopied ? "คัดลอกแล้ว ✓" : "📋 คัดลอกลิงก์"}
          </button>
          <a
            href={fullUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-full bg-slate-100 px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
          >
            ↗ เปิดดูหน้าร้าน
          </a>
        </div>
        {/* ── ตั้งลิงก์เอง (slug) — ให้ URL อ่านรู้เรื่องตามชื่อสินค้า แทนรหัสอย่าง /products/2cm ── */}
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-dashed border-slate-200 pt-2">
          <span className="shrink-0 text-xs font-semibold text-slate-500">✏️ ตั้งลิงก์เอง</span>
          <input
            value={draft.slug}
            onChange={(e) => patch({ slug: e.target.value })}
            onBlur={() => patch({ slug: slugifyProductName(draft.slug) })}
            placeholder={`ว่าง = ใช้รหัสเดิม (${productId})`}
            className="min-w-40 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 focus:border-sky-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => patch({ slug: slugifyProductName(draft.name) })}
            className="shrink-0 rounded-full bg-sky-100 px-3.5 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-200"
            title="สร้างลิงก์จากชื่อสินค้าให้อัตโนมัติ"
          >
            ✨ ตั้งตามชื่อสินค้า
          </button>
          {draft.slug && (
            <button
              type="button"
              onClick={() => patch({ slug: "" })}
              className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-200"
              title="กลับไปใช้รหัสเดิม"
            >
              ✕ ล้าง
            </button>
          )}
          <span className="w-full text-[11px] text-slate-400">
            มีผลหลังกดบันทึก · ลิงก์เดิม /products/{productId} ยังเปิดได้ตามปกติ (ไม่ตายจากที่แชร์ไปแล้ว)
          </span>
        </div>
      </div>

      {/* ── นำเข้าข้อมูลจากเว็บราคา (คนละเรื่องกับลิงก์ด้านบน) ── */}
      <button
        type="button"
        onClick={() => setImpOpen((v) => !v)}
        className={`mt-2 flex w-full flex-wrap items-center gap-2 rounded-2xl border-2 border-dashed p-3 text-left transition ${
          impOpen ? "border-amber-400 bg-amber-50" : "border-amber-200 bg-amber-50/40 hover:bg-amber-50"
        }`}
      >
        <span className="text-base">📥</span>
        <span className="min-w-40 flex-1">
          <span className="block text-xs font-bold text-amber-800">ดึงราคา/ตัวเลือกจากเว็บรายการราคา (Wix) มาเติมสินค้านี้</span>
          <span className="block text-[11px] text-slate-500">
            คนละลิงก์กับด้านบน — ใช้ลิงก์หน้ารายการราคา แล้วระบบเติม ชื่อ/ราคา/ตัวเลือก/ตารางราคา/รูป ให้
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-white">
          {impOpen ? "ปิด ▴" : "เปิด ▾"}
        </span>
      </button>

      {/* ── พาเนล: ดึงข้อมูลจาก URL มาเติมสินค้านี้ ── */}
      {impOpen && (
        <div className="mt-2 rounded-2xl border-2 border-t-0 border-dashed border-amber-400 bg-amber-50/40 p-3">
          <p className="mb-2 text-xs font-bold text-slate-600">
            <span className="mr-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">1</span>
            วางลิงก์<span className="text-amber-800">หน้ารายการราคา</span> แล้วกดดึง
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={impUrl}
              onChange={(e) => setImpUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !impLoading && impUrl.trim() && importScrape()}
              placeholder="วางลิงก์หน้ารายการราคา เช่น /pin หรือ https://…/keyring"
              className="min-w-56 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            />
            <button
              type="button"
              onClick={importScrape}
              disabled={impLoading || !impUrl.trim()}
              className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-40"
            >
              {impLoading ? "กำลังดึง…" : "🔍 ดึง"}
            </button>
          </div>
          {impErr && <p className="mt-2 text-xs font-medium text-rose-600">{impErr}</p>}
          {impList.length > 0 && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white">
              <p className="border-b border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
                <span className="mr-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">2</span>
                พบ {impList.length} สินค้าในหน้านี้ — เลือกรูป แล้วกด “ใช้ตัวนี้” ·{" "}
                <span className="font-bold text-rose-600">จะเขียนทับ ชื่อ/ราคา/ตัวเลือก/รูป ของสินค้านี้ทั้งชุด</span>{" "}
                (ยังไม่กด 💾 บันทึก = ยังเปลี่ยนใจได้)
              </p>
              <ul className="divide-y divide-slate-100">
                {impList.map((p, i) => (
                  <li key={i} className="p-2.5">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{p.name}</p>
                        <p className="truncate text-[11px] text-slate-400">
                          ฿{p.price} / {p.unit} · {p.pricing.tiers.length} ช่วง
                          {p.pricing.driverLabels.length ? ` × ${Object.keys(p.pricing.cells).length} ตัวเลือก` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => importFill(p, i)}
                        className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        ใช้ตัวนี้ →
                      </button>
                    </div>

                    {/* รูปที่เจอในหน้านี้ — ติ๊กเลือกได้ (ค่าเริ่มต้นเลือกทุกรูปเท่าที่ใส่ได้) */}
                    {(p.imageUrls?.length ?? 0) > 0 && (() => {
                      const all = p.imageUrls ?? [];
                      const picked = impPick[i] ?? all.slice(0, MAX_PHOTOS);
                      const toggle = (u: string) =>
                        setImpPick((cur) => {
                          const now = cur[i] ?? all.slice(0, MAX_PHOTOS);
                          const next = now.includes(u) ? now.filter((x) => x !== u) : [...now, u].slice(0, MAX_PHOTOS);
                          return { ...cur, [i]: next };
                        });
                      return (
                        <div className="mt-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {all.map((u) => {
                              const on = picked.includes(u);
                              const order = picked.indexOf(u) + 1;
                              return (
                                <button
                                  key={u}
                                  type="button"
                                  onClick={() => toggle(u)}
                                  title={on ? `เลือกไว้ (รูปที่ ${order})` : "กดเพื่อเลือกรูปนี้"}
                                  className={`relative h-12 w-12 overflow-hidden rounded-lg ring-2 transition ${on ? "ring-emerald-500" : "opacity-50 ring-transparent hover:opacity-100"}`}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={u} alt="" className="h-12 w-12 object-cover" />
                                  {on && (
                                    <span className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">
                                      {order}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          <p className="mt-1 text-[10px] text-slate-400">
                            พบ {all.length} รูป · เลือกไว้ {picked.length}/{MAX_PHOTOS} (รูปแรกที่เลือก = รูปหลัก) — กดรูปเพื่อเลือก/ยกเลิก
                          </p>
                        </div>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {overridden && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-xs text-slate-700 ring-1 ring-slate-200">
          <span>💾 สินค้านี้มีการแก้ไขที่บันทึกไว้ในเบราว์เซอร์นี้ (หน้าร้านแสดงตามที่แก้)</span>
          <button
            type="button"
            onClick={resetToDefault}
            className="rounded-full bg-white px-3.5 py-1.5 font-bold text-rose-500 ring-1 ring-rose-200 hover:bg-rose-50"
          >
            ↩ คืนค่าเริ่มต้น
          </button>
        </div>
      )}

      {/* ── โครงสร้าง 2 คอลัมน์: เนื้อหา (ซ้าย) + แถบตั้งค่า sticky (ขวา) ── */}
      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,20rem)]">
        {/* คอลัมน์หลัก (เนื้อหา) */}
        <div className="min-w-0 space-y-4">

      {/* ข้อมูลหลัก */}
      <section id="sec-basic" className={`relative border-l-4 border-l-sky-400 scroll-mt-32 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]${secCls("basic")}`}>
        <SecToggle id="basic" />
        <h2 className="mb-3 text-sm font-semibold text-slate-800">📝 ข้อมูลหลัก</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            className={`min-w-52 flex-1 font-semibold ${inputCls}`}
            aria-label="ชื่อสินค้า"
          />
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            ราคา ฿
            <input
              value={draft.price}
              onChange={(e) => patch({ price: e.target.value })}
              inputMode="numeric"
              className={`w-24 ${inputCls}`}
              aria-label="ราคา (บาท)"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            ก่อนลด ฿
            <input
              value={draft.oldPrice}
              onChange={(e) => patch({ oldPrice: e.target.value })}
              inputMode="numeric"
              placeholder="—"
              className={`w-24 ${inputCls}`}
              aria-label="ราคาก่อนลด (ถ้ามี)"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            หมวด
            <select
              value={draft.category}
              onChange={(e) => patch({ category: e.target.value as CategoryId })}
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              aria-label="หมวดหมู่"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* รูปสินค้า — ลากวางได้ สูงสุด 5 รูป */}
      <section
        id="sec-photos"
        // relative เพื่อวางปุ่มยุบมุมขวาบน
        className={`relative mt-4 scroll-mt-32 rounded-2xl border border-l-4 border-l-violet-400 border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]${secCls("photos")}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addPhotos(e.dataTransfer.files);
        }}
      >
        <SecToggle id="photos" />
        <h2 className="text-sm font-bold text-violet-800">
          🖼️ รูปสินค้า ({draft.photos.length}/{MAX_PHOTOS})
        </h2>
        <p className="mb-3 mt-0.5 text-[11px] text-slate-400">
          ลากไฟล์รูปมาวางที่นี่ หรือกดช่อง + เพื่อเลือก · <strong>ลากรูปสลับตำแหน่งได้</strong> (หรือกดปุ่ม ‹ ›) · รูปแรกคือรูปหลักบนการ์ด · สูงสุด {MAX_PHOTOS} รูป · ย่อ + อัปโหลดขึ้นคลาวด์ (Supabase Storage) ให้อัตโนมัติ
        </p>

        <div
          className={`flex flex-wrap gap-3 rounded-2xl p-3 transition ${
            dragOver ? "bg-emerald-50 ring-2 ring-emerald-300" : "bg-slate-50 ring-1 ring-slate-100"
          }`}
        >
          {draft.photos.map((src, i) => (
            <div
              key={i}
              draggable
              onDragStart={(e) => {
                dragPhotoRef.current = i;
                setDragPhoto(i);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(i)); // บาง browser ต้องมี data ถึงจะเริ่มลาก
              }}
              onDragEnd={() => {
                dragPhotoRef.current = null;
                setDragPhoto(null);
              }}
              onDragOver={(e) => {
                if (dragPhotoRef.current === null) return; // ลากไฟล์จากเครื่อง = ปล่อยให้กล่องใหญ่รับไปอัปโหลด
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                const from = dragPhotoRef.current;
                if (from === null) return;
                e.preventDefault();
                e.stopPropagation();
                movePhoto(from, i);
                dragPhotoRef.current = null;
                setDragPhoto(null);
              }}
              className={`group relative h-34 w-34 shrink-0 cursor-grab overflow-hidden rounded-xl bg-white ring-1 transition active:cursor-grabbing ${
                dragPhoto === i ? "opacity-40 ring-2 ring-emerald-400" : "ring-slate-200 hover:ring-amber-300"
              }`}
              style={{ height: "8.5rem", width: "8.5rem" }}
              title="ลากเพื่อสลับตำแหน่ง"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`รูปสินค้า ${i + 1}`} className="h-full w-full object-contain p-1" draggable={false} />
              {i === 0 && (
                <span className="absolute left-1 top-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  รูปหลัก
                </span>
              )}
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-xs font-bold text-rose-500 shadow hover:bg-rose-50"
                aria-label={`ลบรูปที่ ${i + 1}`}
              >
                ✕
              </button>

              {/* ปุ่มเลื่อนลำดับ (มือถือ/คนที่ไม่ถนัดลาก) — โชว์เมื่อชี้เมาส์หรือบนจอสัมผัส */}
              <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1 opacity-0 transition group-hover:opacity-100 max-sm:opacity-100">
                <button
                  type="button"
                  onClick={() => movePhoto(i, i - 1)}
                  disabled={i === 0}
                  className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-xs font-bold text-slate-600 shadow transition hover:bg-white disabled:opacity-30"
                  aria-label="เลื่อนไปข้างหน้า"
                >
                  ‹
                </button>
                <span className="rounded-full bg-slate-900/70 px-1.5 text-[10px] font-bold text-white">{i + 1}</span>
                <button
                  type="button"
                  onClick={() => movePhoto(i, i + 1)}
                  disabled={i === draft.photos.length - 1}
                  className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-xs font-bold text-slate-600 shadow transition hover:bg-white disabled:opacity-30"
                  aria-label="เลื่อนไปข้างหลัง"
                >
                  ›
                </button>
              </div>
            </div>
          ))}
          {draft.photos.length < MAX_PHOTOS && (
            <label
              style={{ height: "8.5rem", width: "8.5rem" }}
              className={`flex shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-center transition ${
                uploading
                  ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                  : "border-amber-300 text-amber-500 hover:bg-amber-50"
              }`}
            >
              <span className={`text-2xl leading-none ${uploading ? "animate-pulse" : ""}`}>{uploading ? "⏳" : "＋"}</span>
              <span className="px-1 text-[11px] font-semibold leading-tight">
                {uploading ? "กำลังอัปโหลด…" : "ลากวาง / เลือกรูป"}
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={uploading}
                className="hidden"
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          )}
        </div>

        {draft.photos.length === 0 && (
          <p className="mt-2 text-[11px] text-slate-400">
            ยังไม่มีรูปจริง — สินค้าจะแสดงเป็นไอคอน placeholder จนกว่าจะเพิ่มรูป
          </p>
        )}
        {saveError && (
          <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 ring-1 ring-rose-200">
            ⚠️ {saveError}
          </p>
        )}
      </section>

      {/* จุดเด่น */}
      {/* ── ข้อควรทราบ / เงื่อนไขงาน — โชว์หน้าสินค้าให้ลูกค้าอ่านก่อนสั่ง ── */}
      <section id="sec-terms" className={`relative border-l-4 border-l-rose-400 mt-4 scroll-mt-32 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]${secCls("terms")}`}>
        <SecToggle id="terms" />
        <h2 className="text-sm font-bold text-rose-800">⚠️ ข้อควรทราบ / เงื่อนไขงาน</h2>
        <p className="mt-1 text-xs text-slate-500">
          เขียนสิ่งที่ลูกค้าต้องรู้ก่อนสั่ง — จะแสดงเป็นกล่องเตือนในหน้าสินค้า (กันเข้าใจผิด/เคลมทีหลัง) · ขึ้นบรรทัดใหม่ได้ตามต้องการ
        </p>
        <textarea
          value={draft.terms}
          onChange={(e) => patch({ terms: e.target.value })}
          rows={6}
          placeholder={"เช่น\n* ขนาดยึดตามด้านที่ยาวที่สุดของอะคริลิค หากต้องการระบุด้านกรุณาแจ้ง\n* ระยะสกรีนอาจคลาดเคลื่อน ±3–7 มม. เนื่องจากผ้าแต่ละผืนขนาดไม่เท่ากัน\n* งานผ้าอาจมีจุดจากฝุ่นและรอยยับเล็กน้อย ไม่กระทบการใช้งาน"}
          className={`${inputCls} mt-3 w-full resize-y whitespace-pre-wrap font-mono text-[13px] leading-relaxed`}
        />
        <p className="mt-1.5 text-[11px] text-slate-400">
          {draft.terms.trim() ? `${draft.terms.trim().split("\n").filter(Boolean).length} บรรทัด · จะขึ้นในหน้าสินค้า` : "เว้นว่าง = ไม่แสดงกล่องนี้ในหน้าสินค้า"}
        </p>
      </section>

      <section id="sec-highlights" className={`relative border-l-4 border-l-emerald-400 mt-4 scroll-mt-32 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]${secCls("highlights")}`}>
        <SecToggle id="highlights" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-emerald-800">✔ จุดเด่นสินค้า ({draft.highlights.length})</h2>
          <button
            type="button"
            onClick={() => patch({ highlights: [...draft.highlights, ""] })}
            className="rounded-full bg-slate-100 px-3.5 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100"
          >
            ＋ เพิ่มจุดเด่น
          </button>
        </div>
        <div className="space-y-1.5">
          {draft.highlights.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-amber-500">✔</span>
              <input
                value={h}
                onChange={(e) =>
                  patch({ highlights: draft.highlights.map((x, j) => (j === i ? e.target.value : x)) })
                }
                className={`flex-1 ${smallInputCls}`}
                aria-label={`จุดเด่นข้อที่ ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => patch({ highlights: draft.highlights.filter((_, j) => j !== i) })}
                className="shrink-0 rounded-full px-2 py-1 text-xs font-bold text-rose-400 hover:bg-rose-50"
                aria-label={`ลบจุดเด่นข้อที่ ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ตัวเลือกสินค้า */}
      <section id="sec-options" className={`relative border-l-4 border-l-orange-400 mt-4 scroll-mt-32 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]${secCls("options")}`}>
        <SecToggle id="options" />
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-orange-800">🎛️ ตัวเลือกสินค้า ({draft.options.length} กลุ่ม)</h2>
          <div className="flex items-center gap-2">
            {presets.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const preset = presets.find((p) => p.id === e.target.value);
                  if (!preset) return;
                  patch({
                    options: [
                      ...draft.options,
                      {
                        label: preset.label,
                        choices: preset.choices.map((c) => ({
                          name: c.name,
                          extra: c.extra ? String(c.extra) : "",
                        })),
                        presetId: preset.id,
                        display: "pills",
                      },
                    ],
                  });
                }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="แทรกกลุ่มตัวเลือกจากคลัง"
              >
                <option value="">🔗 แทรกจากคลัง…</option>
                {presets.map((p) => {
                  const linked = draft.options.some((o) => o.presetId === p.id);
                  return (
                    <option key={p.id} value={p.id} disabled={linked}>
                      {p.label} ({p.choices.length}){linked ? " · ลิงก์แล้ว" : ""}
                    </option>
                  );
                })}
              </select>
            )}
            <button
              type="button"
              onClick={() =>
                patch({ options: [...draft.options, { label: "", choices: [{ name: "", extra: "" }], display: "pills" }] })
              }
              className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
            >
              ＋ เพิ่มกลุ่มตัวเลือก
            </button>
          </div>
        </div>
        <div className="space-y-3">
          {draft.options.map((opt, gi) =>
            opt.presetId ? (
              <div key={gi} className="rounded-2xl bg-sky-50/60 p-3 ring-1 ring-sky-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                      🔗 ลิงก์คลัง
                    </span>
                    <span className="text-sm font-bold text-slate-800">{opt.label}</span>
                    <span className="text-xs text-slate-400">{opt.choices.length} ตัวเลือก</span>
                    {!presets.some((p) => p.id === opt.presetId) && (
                      <span className="text-xs font-semibold text-rose-500">คลังถูกลบ — ใช้สำเนาสำรอง</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleOptFold(gi)}
                      className="rounded-full bg-white px-2.5 py-1.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
                      aria-expanded={!isOptFolded(gi)}
                      title={isOptFolded(gi) ? "กางกลุ่มนี้" : "ยุบกลุ่มนี้"}
                    >
                      {isOptFolded(gi) ? "▸ กาง" : "▾ ยุบ"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        patch({
                          options: draft.options.map((o, i) =>
                            i === gi ? { label: o.label, choices: o.choices, display: o.display } : o
                          ),
                        })
                      }
                      className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                      title="ตัดลิงก์คลัง แล้วแก้ตัวเลือกเฉพาะสินค้านี้ได้อิสระ"
                    >
                      ✎ ปรับเฉพาะตัว
                    </button>
                    <button
                      type="button"
                      onClick={() => patch({ options: draft.options.filter((_, i) => i !== gi) })}
                      className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-100"
                    >
                      🗑 ลบกลุ่ม
                    </button>
                  </div>
                </div>
                {!isOptFolded(gi) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {opt.choices.map((c, ci) => (
                    <span
                      key={ci}
                      className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600 ring-1 ring-slate-200"
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
                )}
                {!isOptFolded(gi) && (
                <>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-400">แสดงหน้าร้าน:</span>
                  <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-200 bg-white">
                    {(["pills", "dropdown"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          patch({ options: draft.options.map((o, i) => (i === gi ? { ...o, display: mode } : o)) })
                        }
                        className={`px-2.5 py-1 text-[11px] font-semibold transition ${
                          opt.display === mode ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {mode === "pills" ? "▭ ปุ่มแยก" : "▾ dropdown"}
                      </button>
                    ))}
                  </div>
                  <label
                    className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-slate-400"
                    title="ต่ำกว่าเกณฑ์นี้ ราคาถือว่ารวมตัวเลือกกลุ่มนี้แล้ว (ไม่บวก +฿) เช่น อะไหล่ตะขอ ใส่ 11 = ปลีก 1-10 ชิ้นรวมอะไหล่แล้ว"
                  >
                    +฿ มีผลเมื่อสั่งครบ
                    <input
                      value={opt.extraFromQty ?? ""}
                      onChange={(e) =>
                        patch({ options: draft.options.map((o, i) => (i === gi ? { ...o, extraFromQty: e.target.value } : o)) })
                      }
                      inputMode="numeric"
                      placeholder="ทุกจำนวน"
                      className="w-16 rounded-lg bg-slate-50 px-1.5 py-1 text-center text-[11px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                      aria-label={`เกณฑ์จำนวนที่ +฿ มีผล ของกลุ่ม ${opt.label || gi + 1}`}
                    />
                    ชิ้นขึ้นไป
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-sky-600">
                  แก้ตัวเลือกกลุ่มนี้ได้ที่{" "}
                  <Link href="/admin/options" className="font-semibold underline">คลังตัวเลือก</Link>{" "}
                  — เปลี่ยนที่เดียว สินค้าที่ลิงก์อัปเดตหมด
                </p>
                </>
                )}
              </div>
            ) : (
            <div key={gi} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
              <div className="flex items-center gap-2">
                <input
                  value={opt.label}
                  onChange={(e) => renameOptionGroup(gi, e.target.value)}
                  placeholder="ชื่อกลุ่ม เช่น ขนาด, สี, วัสดุ"
                  className={`flex-1 font-bold ${inputCls}`}
                  aria-label={`ชื่อกลุ่มตัวเลือกที่ ${gi + 1}`}
                />
                <button
                  type="button"
                  onClick={() => toggleOptFold(gi)}
                  className="shrink-0 rounded-full bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
                  aria-expanded={!isOptFolded(gi)}
                  title={isOptFolded(gi) ? "กางกลุ่มนี้" : "ยุบกลุ่มนี้"}
                >
                  {isOptFolded(gi) ? "▸ กาง" : "▾ ยุบ"}
                </button>
                <button
                  type="button"
                  onClick={() => patch({ options: draft.options.filter((_, i) => i !== gi) })}
                  className="shrink-0 rounded-full bg-rose-50 px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-100"
                >
                  🗑 ลบกลุ่ม
                </button>
              </div>
              {isOptFolded(gi) && (
                <p className="mt-2 truncate text-xs text-slate-400">
                  {opt.choices.length} ตัวเลือก · {opt.choices.slice(0, 6).map((c) => c.name).filter(Boolean).join(" · ")}
                  {opt.choices.length > 6 ? " …" : ""}
                </p>
              )}
              {!isOptFolded(gi) && (
              <>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-400">แสดงหน้าร้าน:</span>
                <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-200">
                  {(["pills", "dropdown"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() =>
                        patch({ options: draft.options.map((o, i) => (i === gi ? { ...o, display: mode } : o)) })
                      }
                      className={`px-2.5 py-1 text-[11px] font-semibold transition ${
                        opt.display === mode ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {mode === "pills" ? "▭ ปุ่มแยก" : "▾ dropdown"}
                    </button>
                  ))}
                </div>
                <label
                  className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-slate-400"
                  title="ต่ำกว่าเกณฑ์นี้ ราคาถือว่ารวมตัวเลือกกลุ่มนี้แล้ว (ไม่บวก +฿) เช่น อะไหล่ตะขอ ใส่ 11 = ปลีก 1-10 ชิ้นรวมอะไหล่แล้ว"
                >
                  +฿ มีผลเมื่อสั่งครบ
                  <input
                    value={opt.extraFromQty ?? ""}
                    onChange={(e) =>
                      patch({ options: draft.options.map((o, i) => (i === gi ? { ...o, extraFromQty: e.target.value } : o)) })
                    }
                    inputMode="numeric"
                    placeholder="ทุกจำนวน"
                    className="w-16 rounded-lg bg-slate-50 px-1.5 py-1 text-center text-[11px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    aria-label={`เกณฑ์จำนวนที่ +฿ มีผล ของกลุ่ม ${opt.label || gi + 1}`}
                  />
                  ชิ้นขึ้นไป
                </label>
              </div>
              <div className="mt-2 space-y-1.5">
                {opt.choices.map((ch, ci) => (
                  <div key={ci} className="flex items-center gap-2">
                    <span className="w-4 text-center text-xs text-slate-300">{ci + 1}</span>
                    <input
                      value={ch.name}
                      onChange={(e) => renameOptionChoice(gi, ci, e.target.value)}
                      placeholder="ชื่อตัวเลือก"
                      className={`flex-1 ${smallInputCls}`}
                      aria-label={`ตัวเลือกที่ ${ci + 1} ของกลุ่ม ${opt.label || gi + 1}`}
                    />
                    {/* บวกเพิ่มต่อหน่วยเมื่อเลือกตัวนี้ — ใช้กับกลุ่มที่ไม่ใช่แกนตารางราคา (เช่น อะไหล่พิเศษ) */}
                    <label
                      className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-slate-400"
                      title="บวกเพิ่มต่อหน่วยเมื่อลูกค้าเลือกตัวเลือกนี้ (ใช้กับกลุ่มที่ไม่ได้เป็นคอลัมน์ของตารางราคา)"
                    >
                      +฿
                      <input
                        value={ch.extra}
                        onChange={(e) =>
                          patch({
                            options: draft.options.map((o, i) =>
                              i === gi
                                ? { ...o, choices: o.choices.map((c, j) => (j === ci ? { ...c, extra: e.target.value } : c)) }
                                : o
                            ),
                          })
                        }
                        inputMode="numeric"
                        placeholder="0"
                        className="w-14 rounded-lg bg-slate-50 px-2 py-1.5 text-center text-xs ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                        aria-label={`ราคาบวกเพิ่มของตัวเลือกที่ ${ci + 1}`}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        patch({
                          options: draft.options.map((o, i) =>
                            i === gi ? { ...o, choices: o.choices.filter((_, j) => j !== ci) } : o
                          ),
                        })
                      }
                      className="shrink-0 rounded-full px-2 py-1 text-xs font-bold text-rose-400 hover:bg-rose-50"
                      aria-label={`ลบตัวเลือกที่ ${ci + 1}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  patch({
                    options: draft.options.map((o, i) =>
                      i === gi ? { ...o, choices: [...o.choices, { name: "", extra: "" }] } : o
                    ),
                  })
                }
                className="mt-2 rounded-full bg-slate-100 px-3.5 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100"
              >
                ＋ เพิ่มตัวเลือก
              </button>
              </>
              )}
            </div>
            )
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          💡 ตัวเลือกแรกของแต่ละกลุ่มคือค่าเริ่มต้น · ราคาคุมด้วยราคาขั้นบันได · กลุ่ม 🔗 ลิงก์คลัง แก้รวมได้ที่หน้าคลังตัวเลือก
        </p>
      </section>



      {/* ราคาขั้นบันได (rate card) — สรุปย่อ กด "แก้ตารางราคา" เพื่อกางเต็มกว้าง */}
      <section id="sec-pricing" className={`relative border-l-4 border-l-teal-400 mt-4 scroll-mt-32 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]${secCls("pricing")}`}>
        <SecToggle id="pricing" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-teal-800">💰 ราคาขั้นบันได (ตามจำนวน × ตัวเลือก)</h2>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={draft.pricing.enabled}
              onChange={(e) => patchPricing({ enabled: e.target.checked })}
              className="h-4 w-4 accent-amber-500"
            />
            ใช้ตารางราคาตามจำนวน
          </label>
        </div>

        {draft.pricing.enabled ? (
          <div className="mt-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
            {/* เงื่อนไขคละลาย: เรทราคาคิดจากจำนวนชิ้นต่อลาย ไม่ใช่ยอดรวม */}
            <label className="mb-2.5 flex cursor-pointer items-start gap-2 rounded-xl bg-teal-50 px-3 py-2.5 ring-1 ring-teal-100">
              <input
                type="checkbox"
                checked={draft.pricing.tierByDesign}
                onChange={(e) => patchPricing({ tierByDesign: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-teal-600"
              />
              <span className="text-xs leading-relaxed text-teal-900">
                <span className="font-bold">🎨 คิดเรทราคาตามจำนวนชิ้น &ldquo;ต่อลาย&rdquo;</span> — ลูกค้าคละลายแล้วเรทคิดจาก
                ⌊จำนวน ÷ ลาย⌋ เช่น สั่ง 11 ชิ้นคละ 11 ลาย = ลายละ 1 ชิ้น → ได้เรทราคาปลีก ไม่ใช่เรท 11 ชิ้น
                (หน้าสินค้าจะมีช่อง &ldquo;คละกี่ลาย&rdquo; ให้ลูกค้าเลือก และนับอัตโนมัติตามรูปลายที่แนบ)
              </span>
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-600">
                <span className="font-bold text-slate-700">เปิดใช้</span> · หน่วย {draft.pricing.unit || "—"} ·{" "}
                {draft.pricing.tiers.length} ช่วง × {pricingColumns(draft.options, draft.pricing.driverLabels).length} คู่ตัวเลือก
                {draft.extraRates.length > 0 && (
                  <span className="ml-1 rounded-full bg-teal-100 px-2 py-0.5 font-bold text-teal-700">
                    {draft.extraRates.length + 1} เรทราคา
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPricingOpen(true)}
                className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
              >
                ✎ แก้ตารางราคา
              </button>
            </div>

            {/* ตัวอย่างราคา (อ่านอย่างเดียว) — เห็นบางส่วนโดยไม่ต้องกดแก้ */}
            {(() => {
              const cols = pricingColumns(draft.options, draft.pricing.driverLabels);
              const tiers = draft.pricing.tiers;
              if (!tiers.length || !cols.length) return null;
              const MAX_T = 5, MAX_C = 4;
              const shownTiers = tiers.slice(0, MAX_T);
              const shownCols = cols.slice(0, MAX_C);
              const tierHead = (t: { upTo: string; label: string }) =>
                t.label.trim() || (t.upTo.trim() ? `≤ ${t.upTo}` : "ขึ้นไป");
              const fmtCell = (v?: string) => {
                if (v == null || v.trim() === "") return "—";
                const n = Number(v);
                return Number.isFinite(n) ? `฿${n.toLocaleString("th-TH")}` : "—";
              };
              return (
                <div className="mt-2.5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full min-w-max border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400">
                        <th className="px-2.5 py-1.5 text-left font-semibold">ตัวเลือก \ จำนวน</th>
                        {shownTiers.map((t, i) => (
                          <th key={i} className="whitespace-nowrap px-2.5 py-1.5 text-right font-semibold">
                            {tierHead(t)}
                          </th>
                        ))}
                        {tiers.length > MAX_T && <th className="px-2 py-1.5 text-right text-slate-300">…</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {shownCols.map((combo, ci) => {
                        const vals = draft.pricing.cells[columnKey(combo)] ?? [];
                        return (
                          <tr key={ci} className="border-t border-slate-100">
                            <td className="whitespace-nowrap px-2.5 py-1.5 font-medium text-slate-600">
                              {combo.length ? combo.join(" · ") : "ราคา / หน่วย"}
                            </td>
                            {shownTiers.map((_, ti) => (
                              <td key={ti} className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">
                                {fmtCell(vals[ti])}
                              </td>
                            ))}
                            {tiers.length > MAX_T && <td className="px-2 py-1.5 text-right text-slate-300">…</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {cols.length > MAX_C && (
                    <p className="border-t border-slate-100 px-2.5 py-1 text-[10px] text-slate-400">
                      …และอีก {cols.length - MAX_C} คู่ตัวเลือก · กด “แก้ตารางราคา” เพื่อดู/แก้ทั้งหมด
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-center text-[11px] text-slate-500">
            ใช้ราคาเดียว {formatPrice(Number(draft.price) || 0)} · เปิดสวิตช์เพื่อตั้งราคาที่ถูกลงเมื่อสั่งเยอะ (เหมือน rate card)
          </p>
        )}
      </section>

      {/* ตัวเลือกกำหนดเอง (custom) — งานสั่งทำนอกเหนือขนาดมาตรฐาน */}
      <section id="sec-custom" className={`relative border-l-4 border-l-fuchsia-400 mt-4 scroll-mt-32 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]${secCls("custom")}`}>
        <SecToggle id="custom" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-fuchsia-800">📐 ตัวเลือกกำหนดเอง (งานสั่งทำ)</h2>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={draft.custom.enabled}
              onChange={(e) => patchCustom({ enabled: e.target.checked })}
              className="h-4 w-4 accent-amber-500"
            />
            เปิดให้ลูกค้ากำหนดขนาดเอง
          </label>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          ให้ลูกค้าระบุขนาดเอง (นอกเหนือตารางราคาปกติ) เช่น ผ้าห่มขนาดพิเศษ · คิดราคาอัตโนมัติตามพื้นที่ หรือให้แอดมินตีราคาเอง
        </p>

        {draft.custom.enabled && (
          <div className="mt-3 space-y-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="flex flex-wrap gap-3">
              <label className="flex-1 text-xs font-semibold text-slate-500">
                ชื่อตัวเลือก
                <input
                  value={draft.custom.label}
                  onChange={(e) => patchCustom({ label: e.target.value })}
                  placeholder="กำหนดขนาดเอง"
                  className="mt-1 block w-full rounded-xl bg-white px-3 py-1.5 text-sm text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                วิธีคิดราคา
                <select
                  value={draft.custom.mode}
                  onChange={(e) => patchCustom({ mode: e.target.value as DraftCustom["mode"] })}
                  className="mt-1 block rounded-xl bg-white px-3 py-1.5 text-sm text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                >
                  <option value="area">คิดตามพื้นที่ (อัตโนมัติ)</option>
                  <option value="quote">ให้แอดมินตีราคา (สอบถาม)</option>
                </select>
              </label>
              <div className="text-xs font-semibold text-slate-500">
                หน่วยขนาด
                <div className="mt-1 flex items-center gap-1.5">
                  <select
                    value={draft.custom.unit}
                    onChange={(e) => patchCustom({ unit: e.target.value })}
                    className="block rounded-xl bg-white px-3 py-1.5 text-sm text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    {units.map((u) => (
                      <option key={u.label} value={u.label}>{u.label}</option>
                    ))}
                    {/* หน่วยเดิมของสินค้าที่ไม่มีในคลังแล้ว (กันหลุด) */}
                    {!units.some((u) => u.label === draft.custom.unit) && (
                      <option value={draft.custom.unit}>{draft.custom.unit}</option>
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => setUnitsOpen(true)}
                    title="เพิ่ม/ลบหน่วยในคลังส่วนกลาง"
                    className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
                  >
                    ⚙︎ จัดการหน่วย
                  </button>
                </div>
              </div>
            </div>

            {draft.custom.mode === "area" ? (
              <>
                <div className="flex flex-wrap gap-3">
                  <label className="text-xs font-semibold text-slate-500">
                    ราคา / ตร.ม. (บาท)
                    <input
                      value={draft.custom.ratePerSqm}
                      onChange={(e) => patchCustom({ ratePerSqm: e.target.value.replace(/[^\d.]/g, "") })}
                      inputMode="decimal"
                      placeholder="เช่น 900"
                      className="mt-1 block w-32 rounded-xl bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-500">
                    ค่าเริ่มต้น + (บาท)
                    <input
                      value={draft.custom.baseFee}
                      onChange={(e) => patchCustom({ baseFee: e.target.value.replace(/[^\d.]/g, "") })}
                      inputMode="decimal"
                      placeholder="0"
                      className="mt-1 block w-28 rounded-xl bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-500">
                    ราคาขั้นต่ำ (บาท)
                    <input
                      value={draft.custom.minPrice}
                      onChange={(e) => patchCustom({ minPrice: e.target.value.replace(/[^\d.]/g, "") })}
                      inputMode="decimal"
                      placeholder="0"
                      className="mt-1 block w-28 rounded-xl bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    />
                  </label>
                </div>
                {(() => {
                  const toM = unitToMeter(draft.custom.unit);
                  const c: CustomOption = {
                    enabled: true, label: draft.custom.label, mode: "area", unit: draft.custom.unit, unitToMeter: toM,
                    ratePerSqm: Number(draft.custom.ratePerSqm) || 0,
                    baseFee: Number(draft.custom.baseFee) || 0,
                    minPrice: Number(draft.custom.minPrice) || 0,
                  };
                  const u = draft.custom.unit;
                  // ตัวอย่างขนาด: เลือกให้ราวๆ 1×0.75 เมตร ตามหน่วย
                  const base = Math.max(1, Math.round(1 / toM));
                  const ex = [base, Math.round(base * 0.75)];
                  return (
                    <p className="rounded-xl bg-white px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
                      💡 ตัวอย่าง: ขนาด <strong>{ex[0]}×{ex[1]} {u}</strong> → ราคา/ชิ้น{" "}
                      <strong className="text-amber-600">{formatPrice(customUnitPrice(c, ex[0], ex[1]))}</strong>
                    </p>
                  );
                })()}
              </>
            ) : (
              <p className="rounded-xl bg-white px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
                ลูกค้ากรอกขนาดที่ต้องการ → ระบบไม่คิดราคาอัตโนมัติ แสดง “สอบถามราคา” และเพิ่มลงตะกร้าแบบ “รอตีราคา” ให้แอดมินตีราคาในคำสั่งซื้อ
              </p>
            )}

            <label className="block text-xs font-semibold text-slate-500">
              หมายเหตุถึงลูกค้า (ไม่บังคับ)
              <input
                value={draft.custom.note}
                onChange={(e) => patchCustom({ note: e.target.value })}
                placeholder="เช่น ขั้นต่ำ 100×100 ซม. · ราคานี้ยังไม่รวมค่าส่ง"
                className="mt-1 block w-full rounded-xl bg-white px-3 py-1.5 text-sm text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </label>

            {/* กลุ่มตัวเลือกไหนยังให้เลือกได้ ตอนลูกค้าติ๊กกำหนดขนาดเอง */}
            {draft.options.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-slate-500">
                  กลุ่มตัวเลือกที่ &ldquo;ยังให้ลูกค้าเลือกได้&rdquo; ตอนใช้กำหนดขนาดเอง
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                  ไม่ติ๊ก = กลุ่มนั้นถูกปิด (จาง กดไม่ได้) ระหว่างใช้ขนาดกำหนดเอง — เช่น ปิด &ldquo;ขนาด&rdquo; เพราะแทนด้วยขนาดที่กรอก
                  แต่เปิด &ldquo;สี&rdquo; ให้เลือกต่อได้ · ตัวเลือกที่เปิดไว้จะติดไปกับออเดอร์ด้วย
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {draft.options.map((o) => {
                    const on = draft.custom.keepOptions.includes(o.label);
                    return (
                      <button
                        key={o.label}
                        type="button"
                        onClick={() =>
                          patchCustom({
                            keepOptions: on
                              ? draft.custom.keepOptions.filter((x) => x !== o.label)
                              : [...draft.custom.keepOptions, o.label],
                          })
                        }
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                          on
                            ? "bg-emerald-100 text-emerald-700 ring-emerald-300"
                            : "bg-white text-slate-400 ring-slate-200 hover:text-slate-600"
                        }`}
                      >
                        {on ? "✓ เลือกได้ · " : "🔒 ปิด · "}
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Modal: จัดการคลังหน่วยขนาด (ส่วนกลาง — ใช้ร่วมทุกสินค้า) */}
      {unitsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={() => setUnitsOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="จัดการหน่วยขนาด"
        >
          <div className="my-12 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">📐 คลังหน่วยขนาด (ส่วนกลาง)</h2>
              <button type="button" onClick={() => setUnitsOpen(false)} className="rounded-full bg-slate-100 px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">✕ ปิด</button>
            </div>
            <p className="mb-3 text-[11px] text-slate-400">หน่วยที่เพิ่มที่นี่จะใช้ได้กับทุกสินค้า · &quot;1 หน่วย = กี่เมตร&quot; ใช้คิดพื้นที่ (เช่น 1 หลา = 0.9144)</p>

            <ul className="mb-3 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
              {units.map((u) => (
                <li key={u.label} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-sm font-medium text-slate-700">
                    {u.label} <span className="text-[11px] text-slate-400">= {u.toMeter} ม.{u.builtin ? " · ตั้งต้น" : ""}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => { removeUnit(u.label); refreshUnits(); }}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    title={u.builtin ? "ซ่อนหน่วยตั้งต้นนี้" : "ลบหน่วยนี้"}
                  >
                    {u.builtin ? "ซ่อน" : "ลบ"}
                  </button>
                </li>
              ))}
            </ul>

            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="mb-2 text-xs font-semibold text-slate-500">＋ เพิ่มหน่วยใหม่</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-[11px] font-semibold text-slate-500">
                  ชื่อหน่วย
                  <input
                    value={newUnitLabel}
                    onChange={(e) => setNewUnitLabel(e.target.value)}
                    placeholder="เช่น หลา"
                    className="mt-1 block w-28 rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </label>
                <label className="text-[11px] font-semibold text-slate-500">
                  1 หน่วย = ? เมตร
                  <input
                    value={newUnitToM}
                    onChange={(e) => setNewUnitToM(e.target.value.replace(/[^\d.]/g, ""))}
                    inputMode="decimal"
                    placeholder="0.9144"
                    className="mt-1 block w-28 rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const v = Number(newUnitToM);
                    if (!newUnitLabel.trim() || !(v > 0)) return;
                    upsertUnit(newUnitLabel.trim(), v);
                    setNewUnitLabel(""); setNewUnitToM(""); refreshUnits();
                  }}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  เพิ่ม
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: ตารางราคาเต็มกว้าง */}
      {draft.pricing.enabled && pricingOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={() => setPricingOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="แก้ตารางราคาขั้นบันได"
        >
          <div
            className="my-8 w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">💰 ราคาขั้นบันได (ตามจำนวน × ตัวเลือก)</h2>
              <button
                type="button"
                onClick={() => setPricingOpen(false)}
                className="rounded-full bg-slate-100 px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
              >
                ✕ ปิด
              </button>
            </div>
            {(() => {
            const cols = pricingColumns(draft.options, draft.pricing.driverLabels);
            return (
              <div className="mt-3 space-y-4">
                {/* แท็บเรทราคา — สินค้าบางตัวมีหลายเรท (เช่น พิน: คละดีเทล / ไม่คละดีเทล) */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[draft.rateMeta, ...draft.extraRates].map((m, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setRateIdx(i)}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                        rateIdx === i ? "bg-teal-600 text-white shadow" : "bg-slate-100 text-slate-500 hover:bg-teal-50"
                      }`}
                    >
                      {m.label.trim() || `เรทที่ ${i + 1}`}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={addRate}
                    className="rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-teal-700 ring-1 ring-teal-300 hover:bg-teal-50"
                  >
                    ＋ เพิ่มเรทราคา
                  </button>
                  {rateIdx > 0 && (
                    <button
                      type="button"
                      onClick={() => removeRate(rateIdx - 1)}
                      className="rounded-full px-3 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-50"
                    >
                      🗑 ลบเรทนี้
                    </button>
                  )}
                </div>

                {/* ชื่อ + เงื่อนไขของเรทที่แก้อยู่ (สินค้าเรทเดียวเว้นว่างได้) */}
                <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-teal-50/60 p-3 ring-1 ring-teal-100">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                    ชื่อเรท (ลูกค้าเห็น)
                    <select
                      value={activeMeta.label}
                      onChange={(e) => patchActiveMeta({ label: e.target.value })}
                      className="w-52 rounded-xl bg-white px-2 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-300"
                      aria-label="เลือกชื่อเรท"
                    >
                      <option value="">— เลือกชื่อเรท —</option>
                      {/* ชื่อเดิมที่ไม่อยู่ในลิสต์มาตรฐาน (ตั้งไว้ก่อนหน้า) คงไว้ให้เลือกต่อได้ */}
                      {activeMeta.label && !RATE_NAME_PRESETS.includes(activeMeta.label) && (
                        <option value={activeMeta.label}>{activeMeta.label}</option>
                      )}
                      {RATE_NAME_PRESETS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                    คำอธิบายสั้น ๆ
                    <input
                      value={activeMeta.desc}
                      onChange={(e) => patchActiveMeta({ desc: e.target.value })}
                      placeholder="เช่น คละลาย อะคริลิคใส / ขาวขุ่น C-02"
                      className="w-64 rounded-xl bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-300"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                    สั่งรวมขั้นต่ำ ({draft.pricing.unit || "ชิ้น"})
                    <input
                      value={activeMeta.minQty}
                      onChange={(e) => patchActiveMeta({ minQty: e.target.value })}
                      inputMode="numeric"
                      placeholder="เช่น 50"
                      className="w-24 rounded-xl bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-300"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                    คละลายขั้นต่ำลายละ
                    <input
                      value={activeMeta.minPerDesign}
                      onChange={(e) => patchActiveMeta({ minPerDesign: e.target.value })}
                      inputMode="numeric"
                      placeholder="เช่น 25"
                      className="w-24 rounded-xl bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-300"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                    คละเกินโควตา ลายละ +฿
                    <input
                      value={activeMeta.extraDesignFee}
                      onChange={(e) => patchActiveMeta({ extraDesignFee: e.target.value })}
                      inputMode="numeric"
                      placeholder="เช่น 10"
                      className="w-24 rounded-xl bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-300"
                    />
                  </label>
                  <label
                    className="flex flex-col gap-1 text-xs font-semibold text-slate-500"
                    title="ช่วงราคาปลีก คละลายได้ทุกชิ้นไม่ติดขั้นต่ำต่อลาย เช่น ใส่ 11 = สั่ง 1-10 ชิ้นคละอิสระ"
                  >
                    คละอิสระเมื่อต่ำกว่า (ชิ้น)
                    <input
                      value={activeMeta.freeMixBelowQty}
                      onChange={(e) => patchActiveMeta({ freeMixBelowQty: e.target.value })}
                      inputMode="numeric"
                      placeholder="เช่น 11"
                      className="w-24 rounded-xl bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-300"
                    />
                  </label>
                  <p className="w-full text-[11px] text-slate-400">
                    💡 เช่น เรท 2 สั่งรวม 50 ขึ้นไป + ลายละ 25 → สั่ง 50 ชิ้นคละได้ 2 ลายในราคา ·
                    ใส่ &quot;คละเกินโควตา ลายละ +฿&quot; (เช่น 10) = ลูกค้าเพิ่มลายเกินโควตาได้ โดยจ่ายเพิ่มลายละ 10 บาท · เว้นว่าง = คละเกินไม่ได้ · ทุกเรทใช้คอลัมน์ตัวเลือกชุดเดียวกัน
                  </p>
                </div>

                {rateIdx === 0 ? (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                    หน่วยนับ
                    <input
                      value={draft.pricing.unit}
                      onChange={(e) => patchPricing({ unit: e.target.value })}
                      placeholder="ชิ้น"
                      className="w-24 rounded-xl bg-slate-50 px-3 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                      aria-label="หน่วยนับ"
                    />
                  </label>
                  <div>
                    <span className="text-xs font-semibold text-slate-500">คอลัมน์อิงตามกลุ่ม:</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {draft.options.length === 0 && (
                        <span className="text-[11px] text-slate-400">ต้องมีกลุ่มตัวเลือกก่อน</span>
                      )}
                      {draft.options.map((o) => {
                        const on = draft.pricing.driverLabels.includes(o.label);
                        return (
                          <button
                            key={o.label}
                            type="button"
                            onClick={() => toggleDriver(o.label)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                              on ? "bg-amber-500 text-white shadow" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-amber-50"
                            }`}
                          >
                            {on ? "✓ " : ""}
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    หน่วยนับและคอลัมน์ตัวเลือกใช้ร่วมกับเรทหลัก — เรทนี้ตั้งได้เฉพาะช่วงจำนวน + ราคาของตัวเอง
                  </p>
                )}

                {/* ช่วงจำนวน (tiers) — ของเรทที่แก้อยู่ */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-600">ช่วงจำนวน ({activeTiers.length})</h3>
                    <button
                      type="button"
                      onClick={() => patchActiveTiers([...activeTiers, { upTo: "", label: "" }])}
                      className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100"
                    >
                      ＋ เพิ่มช่วง
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {activeTiers.map((t, ti) => (
                      <div key={ti} className="flex flex-wrap items-center gap-2">
                        <span className="w-4 text-center text-xs text-slate-300">{ti + 1}</span>
                        <input
                          value={t.label}
                          onChange={(e) =>
                            patchActiveTiers(activeTiers.map((x, j) => (j === ti ? { ...x, label: e.target.value } : x)))
                          }
                          placeholder="ชื่อช่วง เช่น 1-10 ชิ้น"
                          className="min-w-40 flex-1 rounded-xl bg-slate-50 px-3 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                          aria-label={`ชื่อช่วงที่ ${ti + 1}`}
                        />
                        <label className="flex items-center gap-1 text-xs text-slate-500">
                          สูงสุด ≤
                          <input
                            value={t.upTo}
                            onChange={(e) =>
                              patchActiveTiers(activeTiers.map((x, j) => (j === ti ? { ...x, upTo: e.target.value } : x)))
                            }
                            inputMode="numeric"
                            placeholder="∞"
                            className="w-20 rounded-xl bg-slate-50 px-2 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                            aria-label={`จำนวนสูงสุดของช่วงที่ ${ti + 1}`}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => patchActiveTiers(activeTiers.filter((_, j) => j !== ti))}
                          className="shrink-0 rounded-full px-2 py-1 text-xs font-bold text-rose-400 hover:bg-rose-50"
                          aria-label={`ลบช่วงที่ ${ti + 1}`}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">💡 ช่องสุดท้ายเว้น &quot;สูงสุด&quot; ว่างไว้ = ขึ้นไปไม่จำกัด</p>
                </div>

                {/* ตารางราคา — แถว = คู่ตัวเลือก (เลื่อนลง), คอลัมน์ = ช่วงจำนวน (พอดีจอ), ตรึงชื่อตัวเลือกไว้ซ้าย */}
                {cols.length > 0 && activeTiers.length > 0 ? (
                  <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-800">
                          <th className="sticky left-0 z-10 bg-slate-100 px-3 py-2 text-left font-bold">
                            ตัวเลือก <span className="font-normal text-slate-400">({cols.length})</span>
                          </th>
                          {activeTiers.map((t, ti) => (
                            <th key={ti} className="whitespace-nowrap px-2 py-2 text-center font-bold">
                              {t.label || `ช่วง ${ti + 1}`}
                            </th>
                          ))}
                          <th className="px-1 py-2" aria-label="ล้างแถว" />
                        </tr>
                      </thead>
                      <tbody>
                        {cols.map((combo, ci) => {
                          const key = columnKey(combo);
                          const rowBg = ci % 2 ? "bg-slate-50" : "bg-white";
                          return (
                            <tr key={key} className="border-t border-slate-100">
                              <td
                                className={`sticky left-0 z-10 max-w-[220px] px-3 py-2 align-middle font-medium leading-snug text-slate-700 ${rowBg}`}
                                title={combo.length ? combo.join(" · ") : "ทุกจำนวน"}
                              >
                                {combo.length ? combo.join(" · ") : `ราคา / ${draft.pricing.unit || "หน่วย"}`}
                              </td>
                              {activeTiers.map((t, ti) => (
                                <td key={ti} className={`px-2 py-2 text-center ${rowBg}`}>
                                  <input
                                    value={activeCells[key]?.[ti] ?? ""}
                                    onChange={(e) => setActiveCell(key, ti, e.target.value)}
                                    inputMode="numeric"
                                    placeholder="—"
                                    className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                                    aria-label={`ราคา ${combo.join(" ")} ${t.label || `ช่วง ${ti + 1}`}`}
                                  />
                                </td>
                              ))}
                              <td className={`px-1 py-2 text-center ${rowBg}`}>
                                <button
                                  type="button"
                                  onClick={() => clearActiveRow(key)}
                                  className="rounded-full px-1.5 py-0.5 text-xs font-bold text-rose-300 transition hover:bg-rose-50 hover:text-rose-500"
                                  title="ล้างราคาแถวนี้ทั้งแถว — แถวว่าง = ไม่ขายตัวเลือกนี้ในเรทนี้ (หน้าร้านซ่อนให้)"
                                  aria-label={`ล้างราคาแถว ${combo.join(" ")}`}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="rounded-2xl bg-slate-50 p-3 text-center text-[11px] text-slate-400">
                    เลือก &quot;คอลัมน์อิงตามกลุ่ม&quot; อย่างน้อย 1 กลุ่ม และเพิ่มช่วงจำนวน เพื่อกรอกราคาในตาราง
                  </p>
                )}
                <p className="text-[11px] text-slate-400">
                  💡 แต่ละ<strong className="font-semibold text-slate-500">แถว</strong>คือคู่ตัวเลือก (เลื่อนลงดูได้) · แต่ละ<strong className="font-semibold text-slate-500">คอลัมน์</strong>คือช่วงจำนวน · ตัวเลข = ราคาต่อ 1 {draft.pricing.unit || "หน่วย"} · ยิ่งสั่งเยอะควรใส่ราคาน้อยลง
                </p>
              </div>
            );
          })()}
          </div>
        </div>
      )}

      {/* แท็บข้อมูลสินค้า — แสดงเป็นแถบแท็บท้ายหน้าสินค้า (แบบหน้ารายการราคาเว็บเดิม) */}
      <section className="relative mt-4 rounded-2xl border border-l-4 border-slate-200/70 border-l-sky-400 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-sky-800">📑 แท็บข้อมูลสินค้า ({draft.tabs.length} แท็บ)</h2>
          <button
            type="button"
            onClick={() => patch({ tabs: [...draft.tabs, { title: "", text: "" }] })}
            className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
          >
            ＋ เพิ่มแท็บ
          </button>
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
          แสดงเป็นแถบแท็บท้ายหน้าสินค้า เช่น รายละเอียดเพิ่มเติม · วิธีสั่งงาน · การรับประกันสินค้า —
          ขึ้นต้นบรรทัดด้วย &ldquo;•&rdquo; = รายการมีจุดนำ · ลงท้ายบรรทัดด้วย &ldquo;::&rdquo; = หัวข้อย่อยตัวหนา
        </p>
        {draft.tabs.length === 0 && (
          <p className="rounded-2xl bg-slate-50 p-4 text-center text-xs text-slate-400">
            ยังไม่มีแท็บ — กด &ldquo;เพิ่มแท็บ&rdquo; เพื่อใส่ เช่น รายละเอียดเพิ่มเติม / วิธีสั่งงาน / การรับประกันสินค้า
          </p>
        )}
        <div className="space-y-3">
          {draft.tabs.map((t, i) => (
            <div key={i} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs font-bold text-slate-400">แท็บ {i + 1}</span>
                <input
                  value={t.title}
                  onChange={(e) => patch({ tabs: draft.tabs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
                  placeholder="ชื่อแท็บ เช่น รายละเอียดเพิ่มเติม"
                  className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-sm font-bold ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => {
                    const c = [...draft.tabs];
                    [c[i - 1], c[i]] = [c[i], c[i - 1]];
                    patch({ tabs: c });
                  }}
                  className="rounded-full px-2.5 py-1 text-xs text-slate-500 ring-1 ring-slate-200 hover:bg-white disabled:opacity-30"
                  aria-label="เลื่อนแท็บไปก่อนหน้า"
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={i === draft.tabs.length - 1}
                  onClick={() => {
                    const c = [...draft.tabs];
                    [c[i + 1], c[i]] = [c[i], c[i + 1]];
                    patch({ tabs: c });
                  }}
                  className="rounded-full px-2.5 py-1 text-xs text-slate-500 ring-1 ring-slate-200 hover:bg-white disabled:opacity-30"
                  aria-label="เลื่อนแท็บไปถัดไป"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => patch({ tabs: draft.tabs.filter((_, j) => j !== i) })}
                  className="rounded-full px-2.5 py-1 text-xs font-bold text-rose-500 ring-1 ring-rose-200 hover:bg-rose-50"
                >
                  ลบ
                </button>
              </div>
              <textarea
                value={t.text}
                onChange={(e) => patch({ tabs: draft.tabs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                rows={7}
                placeholder={"• ข้อแรก\n• ข้อสอง\n\nหัวข้อย่อย::\nข้อความอธิบาย"}
                className="mt-2 w-full resize-y rounded-xl bg-white px-3 py-2 text-sm leading-relaxed ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
          ))}
        </div>
      </section>

      {/* เนื้อหารายละเอียดสินค้า (body) */}
      <section id="sec-body" className={`relative border-l-4 border-l-indigo-400 mt-4 scroll-mt-32 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]${secCls("body")}`}>
        <SecToggle id="body" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-indigo-800">📄 เนื้อหารายละเอียดสินค้า ({draft.body.length} ท่อน)</h2>
          <button
            type="button"
            onClick={() =>
              patch({
                body: [
                  ...draft.body,
                  { heading: "", text: "", emoji: "", gradient: "from-sky-100 to-blue-200", imgLabel: "", src: "", align: draft.body.length % 2 === 0 ? "left" : "right" },
                ],
              })
            }
            className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
          >
            ＋ เพิ่มท่อนเนื้อหา
          </button>
        </div>
        {draft.body.length === 0 && (
          <p className="rounded-2xl bg-slate-50 p-4 text-center text-xs text-slate-400">
            ยังไม่มีเนื้อหา — เพิ่มท่อนเนื้อหาเพื่อเล่ารายละเอียดสินค้า เช่น จุดขาย ขนาด วิธีสั่งซื้อ
          </p>
        )}
        <div className="space-y-3">
          {draft.body.map((b, i) => (
            <div
              key={i}
              onDragOver={(e) => {
                e.preventDefault();
                setBodyDragOver(i);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setBodyDragOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setBodyDragOver(null);
                const f = e.dataTransfer.files?.[0];
                if (f) void uploadBodyImage(i, f);
              }}
              className={`rounded-2xl bg-white p-3 transition ${
                bodyDragOver === i ? "ring-2 ring-amber-400 bg-amber-50/50" : "ring-1 ring-slate-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBodyFolded((m) => ({ ...m, [i]: !m[i] }))}
                  aria-expanded={!bodyFolded[i]}
                  title={bodyFolded[i] ? "กางท่อนนี้" : "พับท่อนนี้"}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-0.5 text-left transition hover:bg-slate-50"
                >
                  <span className={`text-[10px] text-slate-400 transition ${bodyFolded[i] ? "-rotate-90" : ""}`}>▼</span>
                  <span className="shrink-0 text-xs font-bold text-slate-400">ท่อนที่ {i + 1}</span>
                  {bodyFolded[i] && (
                    <span className="min-w-0 truncate text-xs font-semibold text-slate-600">
                      {b.src && "🖼 "}
                      {b.heading.trim() || b.text.trim().slice(0, 60) || "(ยังไม่มีเนื้อหา)"}
                    </span>
                  )}
                </button>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {!bodyFolded[i] && (
                  <select
                    value={b.align}
                    onChange={(e) =>
                      patch({ body: draft.body.map((x, j) => (j === i ? { ...x, align: e.target.value as "left" | "right" } : x)) })
                    }
                    className="rounded-xl bg-white px-2 py-1.5 text-xs ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    aria-label={`ตำแหน่งรูปท่อนที่ ${i + 1}`}
                  >
                    <option value="left">รูปอยู่ซ้าย</option>
                    <option value="right">รูปอยู่ขวา</option>
                  </select>
                  )}
                  <button
                    type="button"
                    onClick={() => patch({ body: draft.body.filter((_, j) => j !== i) })}
                    className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-100"
                  >
                    🗑 ลบท่อน
                  </button>
                </div>
              </div>
              {!bodyFolded[i] && (
              <>
              <input
                value={b.heading}
                onChange={(e) => patch({ body: draft.body.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)) })}
                placeholder="หัวข้อ เช่น โปสการ์ด (POSTCARD)"
                className={`mt-2 w-full font-bold ${inputCls}`}
                aria-label={`หัวข้อท่อนที่ ${i + 1}`}
              />
              <textarea
                value={b.text}
                onChange={(e) => patch({ body: draft.body.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                placeholder={"เนื้อหา… ขึ้นบรรทัดใหม่ได้\nบรรทัดที่ขึ้นต้นด้วย • จะเป็นรายการ"}
                rows={4}
                className={`mt-2 w-full resize-y ${inputCls}`}
                aria-label={`เนื้อหาท่อนที่ ${i + 1}`}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">รูปประกอบ: <span className="font-normal text-slate-400">(ลากรูปมาวางที่ท่อนนี้ได้เลย)</span></span>
                {b.src && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={b.src} alt="" className="h-10 w-14 rounded-lg object-cover ring-1 ring-slate-200" />
                )}
                <label className="cursor-pointer rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200">
                  {b.src ? "🖼 เปลี่ยนรูป" : "🖼 อัปโหลดรูป"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void uploadBodyImage(i, f);
                    }}
                  />
                </label>
                {b.src && (
                  <button
                    type="button"
                    onClick={() => patch({ body: draft.body.map((x, j) => (j === i ? { ...x, src: "" } : x)) })}
                    className="rounded-full px-2 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-50"
                  >
                    เอารูปออก
                  </button>
                )}
                <input
                  value={b.emoji}
                  onChange={(e) => patch({ body: draft.body.map((x, j) => (j === i ? { ...x, emoji: e.target.value } : x)) })}
                  placeholder={b.src ? "อีโมจิ (ไม่ใช้แล้ว)" : "หรืออีโมจิ"}
                  title="ไม่มีรูปจริง ใช้อีโมจิ+สีพื้นแทนได้"
                  className="w-24 rounded-xl bg-slate-50 px-2 py-1.5 text-center text-base ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label={`อีโมจิรูปท่อนที่ ${i + 1}`}
                />
                {(b.emoji.trim() || b.src) && (
                  <>
                    <GradientPicker
                      value={b.gradient}
                      emoji={b.emoji}
                      onChange={(v) => patch({ body: draft.body.map((x, j) => (j === i ? { ...x, gradient: v } : x)) })}
                      ariaLabel={`สีพื้นรูปท่อนที่ ${i + 1}`}
                    />
                    <input
                      value={b.imgLabel}
                      onChange={(e) =>
                        patch({ body: draft.body.map((x, j) => (j === i ? { ...x, imgLabel: e.target.value } : x)) })
                      }
                      placeholder="คำบรรยายรูป"
                      className={`min-w-28 flex-1 ${smallInputCls}`}
                      aria-label={`คำบรรยายรูปท่อนที่ ${i + 1}`}
                    />
                  </>
                )}
              </div>
              </>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* SEO / AEO */}
      <section id="sec-seo" className={`relative border-l-4 border-l-purple-400 scroll-mt-32 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]${secCls("seo")}`}>
        <SecToggle id="seo" />
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-purple-800">🔎 SEO / AEO (ค้นหา + ให้ AI ตอบ)</h2>
          <button
            type="button"
            onClick={autoFillSeo}
            className="rounded-full bg-violet-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-violet-600"
          >
            ✨ เขียนให้อัตโนมัติ
          </button>
        </div>
        <p className="mb-3 text-[11px] text-slate-400">
          ปรับข้อความที่ Google/AI ใช้ตอนค้นหาและสรุปคำตอบ · เว้นว่าง = ใช้ชื่อ/รายละเอียดอัตโนมัติ
        </p>

        <label className="block">
          <span className="text-xs font-semibold text-slate-500">
            Meta title <span className="font-normal text-slate-400">({draft.seo.title.length}/60)</span>
          </span>
          <input
            value={draft.seo.title}
            onChange={(e) => patch({ seo: { ...draft.seo, title: e.target.value } })}
            placeholder={draft.name || "ชื่อที่จะโชว์บนผลค้นหา"}
            maxLength={70}
            className={`mt-1 w-full ${inputCls}`}
          />
        </label>

        <label className="mt-3 block">
          <span className="text-xs font-semibold text-slate-500">
            Meta description <span className="font-normal text-slate-400">({draft.seo.description.length}/160)</span>
          </span>
          <textarea
            value={draft.seo.description}
            onChange={(e) => patch({ seo: { ...draft.seo, description: e.target.value } })}
            rows={2}
            placeholder="คำอธิบายสั้น ๆ ที่โชว์ใต้ชื่อบน Google"
            className="mt-1 w-full resize-y rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-xs font-semibold text-slate-500">คำค้น (keywords · คั่นด้วย ,)</span>
          <input
            value={draft.seo.keywords}
            onChange={(e) => patch({ seo: { ...draft.seo, keywords: e.target.value } })}
            placeholder="โปสการ์ด, พิมพ์การ์ด, การ์ดสะสม"
            className={`mt-1 w-full ${inputCls}`}
          />
        </label>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-600">❓ คำถามพบบ่อย (AEO) — {draft.seo.faqs.length}</h3>
            <button
              type="button"
              onClick={() => patch({ seo: { ...draft.seo, faqs: [...draft.seo.faqs, { q: "", a: "" }] } })}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-200"
            >
              ＋ เพิ่มคำถาม
            </button>
          </div>
          <p className="mb-2 text-[11px] text-slate-400">
            คู่ถาม-ตอบ ช่วยให้ Google/ChatGPT ดึงไปตอบลูกค้าตรง ๆ (ฝัง FAQ schema ให้อัตโนมัติ)
          </p>
          <div className="space-y-2">
            {draft.seo.faqs.map((f, fi) => (
              <div key={fi} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">ถาม</span>
                  <input
                    value={f.q}
                    onChange={(e) =>
                      patch({ seo: { ...draft.seo, faqs: draft.seo.faqs.map((x, j) => (j === fi ? { ...x, q: e.target.value } : x)) } })
                    }
                    placeholder="เช่น ใช้เวลาผลิตกี่วัน?"
                    className="flex-1 rounded-xl bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    aria-label={`คำถามที่ ${fi + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => patch({ seo: { ...draft.seo, faqs: draft.seo.faqs.filter((_, j) => j !== fi) } })}
                    className="shrink-0 rounded-full px-2 py-1 text-xs font-bold text-rose-400 hover:bg-rose-50"
                    aria-label={`ลบคำถามที่ ${fi + 1}`}
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-1.5 flex items-start gap-2">
                  <span className="mt-1.5 text-xs font-bold text-slate-400">ตอบ</span>
                  <textarea
                    value={f.a}
                    onChange={(e) =>
                      patch({ seo: { ...draft.seo, faqs: draft.seo.faqs.map((x, j) => (j === fi ? { ...x, a: e.target.value } : x)) } })
                    }
                    rows={2}
                    placeholder="เช่น ผลิต 2-3 วันทำการ แล้วจัดส่งทันที"
                    className="flex-1 resize-y rounded-xl bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    aria-label={`คำตอบที่ ${fi + 1}`}
                  />
                </div>
              </div>
            ))}
            {draft.seo.faqs.length === 0 && (
              <p className="rounded-2xl bg-slate-50 p-3 text-center text-[11px] text-slate-400">
                ยังไม่มีคำถาม — เพิ่มเพื่อช่วยให้ค้นเจอและ AI ตอบลูกค้าได้
              </p>
            )}
          </div>
        </div>
      </section>

        </div>
        {/* คอลัมน์ข้าง (ตั้งค่า · sticky) */}
        <aside className="space-y-4 lg:sticky lg:top-16">
          {/* สถานะตรวจสอบ — ให้ทีมงานทำเครื่องหมายว่าเช็คสินค้านี้แล้ว (กันเช็คซ้ำ) */}
          <div className={`rounded-2xl border p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${draft.reviewed ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white"}`}>
            <p className="mb-1 text-xs font-semibold text-slate-500">✅ สถานะตรวจสอบ</p>
            {draft.reviewed ? (
              <p className="mb-2.5 text-xs text-emerald-700">
                ตรวจแล้วโดย <strong>{draft.reviewed.by}</strong>
                <span className="text-emerald-600/70">
                  {" · "}
                  {(() => {
                    const d = new Date(draft.reviewed.at);
                    return isNaN(d.getTime()) ? "" : d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
                  })()}
                </span>
              </p>
            ) : (
              <p className="mb-2.5 text-xs text-slate-400">ยังไม่มีใครทำเครื่องหมายว่าตรวจสินค้านี้</p>
            )}
            <button
              type="button"
              onClick={toggleReviewed}
              className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                draft.reviewed
                  ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              {draft.reviewed ? "ยกเลิกเครื่องหมายตรวจแล้ว" : "✓ ทำเครื่องหมายว่าตรวจแล้ว"}
            </button>
            <p className="mt-2 text-center text-[11px] text-slate-400">มีผลเมื่อกด 💾 บันทึก</p>
          </div>

          {/* กติกาเงื่อนไข (ย้ายมาไว้แถบข้าง) */}
          {/* กฎเงื่อนไขตัวเลือก */}
      {/* ── สั่งจำนวนมาก: ต้องเช็คสต๊อกก่อน ── */}
      <section id="sec-bulk" className={`relative border-l-4 border-l-lime-400 mt-4 scroll-mt-32 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]${secCls("bulk")}`}>
        <SecToggle id="bulk" />
        <h2 className="text-sm font-bold text-lime-800">📦 สั่งจำนวนมาก — เช็คสต๊อกก่อน</h2>
        <p className="mt-1 text-xs text-slate-500">
          ลูกค้าสั่งถึงจำนวนนี้ หน้าสินค้าจะขึ้นเตือนให้ทักแอดมินเช็คสต๊อก/คิวผลิตก่อน (สั่งได้ตามปกติ แต่ออเดอร์จะติดธง &ldquo;รอเช็คสต๊อก&rdquo; ให้ทีมยืนยันจำนวน)
        </p>
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <input
            type="checkbox"
            checked={draft.artworkRequired}
            onChange={(e) => patch({ artworkRequired: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-rose-500"
          />
          <span className="text-xs">
            <span className="block font-bold text-slate-700">🎨 บังคับแนบลายก่อนกดสั่ง</span>
            <span className="block text-slate-500">
              ลูกค้าต้องอัปโหลดรูป หรือใส่ลิงก์ไฟล์/อีเมล อย่างน้อย 1 อย่าง ถึงจะกดเพิ่มลงตะกร้าได้ —
              เอาติ๊กออกสำหรับของเปล่า/วัสดุที่ไม่ต้องใช้ลาย
            </span>
          </span>
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">สั่งตั้งแต่</label>
          <input
            value={draft.bulkAskQty}
            onChange={(e) => patch({ bulkAskQty: e.target.value.replace(/\D/g, "") })}
            inputMode="numeric"
            placeholder={String(BULK_ASK_DEFAULT)}
            className="w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          <span className="text-xs font-semibold text-slate-600">ชิ้นขึ้นไป</span>
          <span className="text-[11px] text-slate-400">
            {Number(draft.bulkAskQty) > 0 ? `· ตอนนี้ใช้ ${Number(draft.bulkAskQty).toLocaleString("th-TH")} ชิ้น` : `· เว้นว่าง = ใช้ค่ากลาง ${BULK_ASK_DEFAULT} ชิ้น`}
          </span>
        </div>

        {/* 🚚 ของชิ้นใหญ่ที่ยังไงก็ต้องกล่องใหญ่ — มีในตะกร้าเมื่อไหร่ ระบบยกระดับค่าส่งให้เอง */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">🚚 ค่าส่งขั้นต่ำของสินค้านี้</label>
          <select
            value={draft.shippingId}
            onChange={(e) => patch({ shippingId: e.target.value })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            <option value="">— ไม่บังคับ (คิดตามจำนวน/ยอดตามปกติ) —</option>
            {shipMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.price} บาท
              </option>
            ))}
          </select>
          <span className="text-[11px] text-slate-400">
            เลือกไว้ = มีสินค้านี้ในตะกร้าเมื่อไหร่ ระบบจะไม่ให้ลูกค้าเลือกค่าส่งที่ถูกกว่านี้
          </span>
        </div>

        {/* 📦 ของหนักที่ค่าส่งขึ้นกับจำนวน (เช่น แผ่นหินรองแก้ว) — ตั้งเป็นขั้นบันได */}
        <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-600">📦 ค่าส่งตามจำนวนชิ้น (ของหนัก)</label>
            <button
              type="button"
              onClick={() => patch({ shipTiers: [...draft.shipTiers, { minQty: "", price: "" }] })}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600 hover:border-amber-300"
            >
              ＋ เพิ่มขั้น
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            เช่น แผ่นหินรองแก้ว: สั่ง 1 แผ่น = 50 บาท · ตั้งแต่ 5 แผ่น = 90 บาท — ระบบคิดจากจำนวนที่ลูกค้าสั่งเอง
            แล้วใช้<strong className="text-slate-500">ค่าที่แพงกว่า</strong>ระหว่างวิธีส่งที่เลือกกับค่าตามจำนวนนี้ ·
            ไม่ตั้ง = คิดตามวิธีส่งปกติ
          </p>

          {draft.shipTiers.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {draft.shipTiers.map((t, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-xs text-slate-500">สั่งตั้งแต่</span>
                  <input
                    value={t.minQty}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "");
                      patch({ shipTiers: draft.shipTiers.map((x, xi) => (xi === i ? { ...x, minQty: v } : x)) });
                    }}
                    inputMode="numeric"
                    placeholder="1"
                    className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-amber-400 focus:outline-none"
                  />
                  <span className="text-xs text-slate-500">ชิ้น → ค่าส่ง</span>
                  <input
                    value={t.price}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d.]/g, "");
                      patch({ shipTiers: draft.shipTiers.map((x, xi) => (xi === i ? { ...x, price: v } : x)) });
                    }}
                    inputMode="decimal"
                    placeholder="50"
                    className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-amber-400 focus:outline-none"
                  />
                  <span className="text-xs text-slate-500">บาท</span>
                  <button
                    type="button"
                    onClick={() => patch({ shipTiers: draft.shipTiers.filter((_, xi) => xi !== i) })}
                    className="rounded-lg px-2 py-1 text-xs font-bold text-rose-500 hover:bg-rose-50"
                    aria-label="ลบขั้นนี้"
                  >
                    ลบ
                  </button>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2 text-sm">
                <span className="text-xs text-slate-500">เกินขั้นสุดท้ายแล้ว</span>
                <select
                  value={draft.shipTierMode}
                  onChange={(e) => patch({ shipTierMode: e.target.value as "last" | "extra" | "method" })}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-amber-400 focus:outline-none"
                >
                  <option value="last">ใช้ราคาขั้นสุดท้ายไปเรื่อย ๆ</option>
                  <option value="extra">คิดเพิ่มต่อชิ้น (ระบุราคา)</option>
                  <option value="method">เปลี่ยนเป็นวิธีส่งอื่น (เช่น ส่งแมส)</option>
                </select>

                {draft.shipTierMode === "extra" && (
                  <>
                    <span className="text-xs text-slate-500">ชิ้นละ</span>
                    <input
                      value={draft.shipTierExtra}
                      onChange={(e) => patch({ shipTierExtra: e.target.value.replace(/[^\d.]/g, "") })}
                      inputMode="decimal"
                      placeholder="10"
                      className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-amber-400 focus:outline-none"
                    />
                    <span className="text-xs text-slate-500">บาท</span>
                  </>
                )}

                {draft.shipTierMode === "method" && (
                  <>
                    <select
                      value={draft.shipTierMethodId}
                      onChange={(e) => patch({ shipTierMethodId: e.target.value })}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-amber-400 focus:outline-none"
                    >
                      <option value="">— เลือกวิธีส่ง —</option>
                      {shipMethods.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} · {m.price} บาท
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-slate-400">
                      สั่งเกินขั้นสุดท้ายเมื่อไหร่ ระบบบังคับวิธีส่งนี้ให้เลย (ไม่คิดตามตาราง) ·
                      ยังไม่มีวิธีส่งแมส? ไปเพิ่มที่ ตั้งค่าระบบ → การจัดส่ง ก่อน
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section id="sec-rules" className={`relative border-l-4 border-l-cyan-400 mt-4 scroll-mt-32 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]${secCls("rules")}`}>
        <SecToggle id="rules" />
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-bold text-cyan-800">🔗 กฎเงื่อนไขตัวเลือก ({draft.rules.length})</h2>
          <button
            type="button"
            onClick={() =>
              patch({ rules: [...draft.rules, { whenLabel: "", whenChoice: "", whenChoices: [], limitLabel: "", allow: [] }] })
            }
            className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
          >
            ＋ เพิ่มกฎ
          </button>
        </div>
        <p className="mb-3 text-[11px] text-slate-400">
          กันลูกค้าสั่งผิด เช่น &quot;เมื่อเลือกชนิดกระดาษ = Canvas → จำกัดกลุ่มเคลือบ เหลือเฉพาะ ไม่เคลือบ&quot; ·
          กลุ่มที่เหลือตัวเลือกเดียวจะแสดงเป็นข้อความล็อก 🔒 บนหน้าสินค้า
        </p>

        {draft.rules.length === 0 && (
          <p className="rounded-2xl bg-slate-50 p-4 text-center text-xs text-slate-400">
            ยังไม่มีกฎ — กด &quot;เพิ่มกฎ&quot; เพื่อกำหนดเงื่อนไข (ต้องมีตัวเลือกอย่างน้อย 2 กลุ่มก่อน)
          </p>
        )}

        <div className="space-y-3">
          {draft.rules.map((rule, ri) => {
            const whenGroup = draft.options.find((o) => o.label === rule.whenLabel);
            const limitGroup = draft.options.find((o) => o.label === rule.limitLabel);
            const setRule = (patchObj: Partial<DraftRule>) =>
              patch({ rules: draft.rules.map((x, j) => (j === ri ? { ...x, ...patchObj } : x)) });
            return (
              <div key={ri} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-500">กฎที่ {ri + 1}</span>
                  <button
                    type="button"
                    onClick={() => patch({ rules: draft.rules.filter((_, j) => j !== ri) })}
                    className="shrink-0 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-500 hover:bg-rose-100"
                  >
                    🗑 ลบ
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span className="font-semibold">เมื่อเลือก</span>
                  <select
                    value={rule.whenLabel}
                    onChange={(e) => setRule({ whenLabel: e.target.value, whenChoice: "", whenChoices: [] })}
                    className="min-w-0 max-w-full rounded-xl bg-white px-2 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    aria-label={`กลุ่มเงื่อนไขของกฎที่ ${ri + 1}`}
                  >
                    <option value="">— เลือกกลุ่ม —</option>
                    {draft.options.map((o) => (
                      <option key={o.label} value={o.label}>{o.label}</option>
                    ))}
                  </select>
                  <span className="font-semibold">= ตัวไหนก็ได้ใน:</span>
                  {whenGroup && (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setRule({ whenChoices: whenGroup.choices.map((c) => c.name).filter(Boolean) })}
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-200"
                      >
                        ทั้งหมด
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setRule({
                            whenChoices: whenGroup.choices
                              .map((c) => c.name)
                              .filter((nm) => nm && !rule.whenChoices.includes(nm)),
                          })
                        }
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-200"
                        title="สลับ: ตัวที่ติ๊กอยู่เอาออก ตัวที่ไม่ได้ติ๊กใส่แทน — สะดวกกับ 'ทุกตัวยกเว้น…'"
                      >
                        กลับด้าน
                      </button>
                      <button
                        type="button"
                        onClick={() => setRule({ whenChoices: [] })}
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-200"
                      >
                        ล้าง
                      </button>
                      <span className="text-[11px] text-slate-400">ติ๊กแล้ว {rule.whenChoices.length}</span>
                    </span>
                  )}
                </div>
                {whenGroup && (
                  <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-xl bg-slate-50 p-2 ring-1 ring-slate-100">
                    {whenGroup.choices.map((c) => {
                      const checked = rule.whenChoices.includes(c.name);
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() =>
                            setRule({
                              whenChoices: checked
                                ? rule.whenChoices.filter((n) => n !== c.name)
                                : [...rule.whenChoices, c.name],
                            })
                          }
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                            checked
                              ? "bg-teal-600 text-white shadow"
                              : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-teal-50"
                          }`}
                        >
                          {checked ? "✓ " : ""}
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span className="font-semibold">→ จำกัดกลุ่ม</span>
                  <select
                    value={rule.limitLabel}
                    onChange={(e) => setRule({ limitLabel: e.target.value, allow: [] })}
                    className="min-w-0 max-w-full rounded-xl bg-white px-2 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    aria-label={`กลุ่มที่ถูกจำกัดของกฎที่ ${ri + 1}`}
                  >
                    <option value="">— เลือกกลุ่ม —</option>
                    {draft.options
                      .filter((o) => o.label !== rule.whenLabel)
                      .map((o) => (
                        <option key={o.label} value={o.label}>{o.label}</option>
                      ))}
                  </select>
                  <span className="font-semibold">เหลือเฉพาะ:</span>
                </div>

                {limitGroup && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {limitGroup.choices.map((c) => {
                      const checked = rule.allow.includes(c.name);
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() =>
                            setRule({
                              allow: checked
                                ? rule.allow.filter((n) => n !== c.name)
                                : [...rule.allow, c.name],
                            })
                          }
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                            checked
                              ? "bg-amber-500 text-white shadow"
                              : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-amber-50"
                          }`}
                        >
                          {checked ? "✓ " : ""}
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

          {/* สรุป + การแสดงบนหน้าแรก */}
          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <p className="mb-2 text-xs font-semibold text-slate-500">🏠 การแสดงบนหน้าร้าน</p>

            <label className="flex cursor-pointer items-center justify-between gap-2 text-xs text-slate-600">
              <span>💛 ขึ้นบล็อก "สินค้าแนะนำ" หน้าแรก</span>
              <input
                type="checkbox"
                checked={draft.featured}
                onChange={(e) => patch({ featured: e.target.checked })}
                className="h-4 w-4 accent-amber-500"
              />
            </label>

            <label className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600">
              <span>ป้ายบนการ์ด</span>
              <select
                value={draft.badge}
                onChange={(e) => patch({ badge: e.target.value })}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-amber-300 focus:outline-none"
              >
                <option value="">ไม่มี</option>
                <option value="ใหม่">🔵 ใหม่</option>
                <option value="ขายดี">🔴 ขายดี</option>
                <option value="ลดราคา">🟠 ลดราคา</option>
              </select>
            </label>

            <label className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600">
              <span>ยอดขายสะสม (ขายแล้ว)</span>
              <input
                value={draft.soldStr}
                onChange={(e) => patch({ soldStr: e.target.value.replace(/\D/g, "") })}
                inputMode="numeric"
                className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-xs text-slate-800 focus:border-amber-300 focus:outline-none"
                aria-label="ยอดขายสะสม"
              />
            </label>
            <p className="mt-1 text-[10px] leading-snug text-slate-400">
              🔥 "สินค้าขายดี" หน้าแรกเรียงจากยอดนี้ 4 อันดับแรก — ระบบ<strong>บวกต่อให้เอง</strong>ทุกครั้งที่ออเดอร์ชำระเงินแล้ว
              (ยกเลิกออเดอร์ = ถอนคืน) · ตั้งยอดตั้งต้นได้ตรงนี้
            </p>

            <div className="mt-3 flex justify-between border-t border-slate-100 pt-2 text-xs text-slate-600">
              <span>⭐ เรตติ้ง</span>
              <span className="font-semibold text-slate-800">{original.rating}</span>
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-slate-600">
              <span>หมวดหมู่</span>
              <span className="font-semibold text-slate-800">{categoryLabel}</span>
            </div>
          </div>

          {/* โซนอันตราย: ลบสินค้าถาวร */}
          <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4">
            <p className="mb-1 text-xs font-semibold text-rose-600">⚠️ โซนอันตราย</p>
            <p className="mb-2.5 text-[11px] text-rose-500/80">ลบสินค้านี้ออกจากระบบถาวร — ย้อนกลับไม่ได้</p>
            <button
              type="button"
              onClick={removeProduct}
              disabled={deleting}
              className="w-full rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "กำลังลบ…" : "🗑 ลบสินค้านี้"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
