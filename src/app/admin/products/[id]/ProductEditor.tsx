"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  customUnitPrice,
  formatPrice,
  type CategoryId,
  type BodySection,
  type CustomOption,
  type OptionInput,
  type OptionRule,
  type PriceMatrix,
  type Product,
  type ProductImage,
  type ProductOption,
  type ProductReview,
  type ProductSeo,
  type ShipOptionRule,
  type ShipTier,
} from "@/lib/products";
import RichEditor from "@/components/RichEditor";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { autoSeoOf } from "@/lib/auto-seo";
import { fetchCategories, DEFAULT_CATEGORIES, type ShopCategory } from "@/lib/categories";
import { BULK_ASK_DEFAULT, CONSULT_NOTE_DEFAULT, RATE_LABEL } from "@/lib/products";
import { hasOverride, resetOverride } from "@/lib/product-store";
import { deleteProductDb, fetchProductNamesLite, fetchProductRaw, persistProduct } from "@/lib/product-repo";
import { adminProductPath, shortChoice, slugifyProductName } from "@/lib/products";
import { getAdminSession } from "@/lib/auth";
import { loadUnits, upsertUnit, removeUnit, unitToMeter, type CustomUnit } from "@/lib/units";
import { fetchPresets } from "@/lib/preset-repo";
import { type OptionPreset } from "@/lib/option-presets";
import { isSupabaseConfigured } from "@/lib/supabase";
import GradientPicker from "@/components/GradientPicker";
import { publicOrigin } from "@/lib/shop-info";
import { fetchShopPayment, shippingOf, DEFAULT_SHIPPING, type ShippingMethod } from "@/lib/shop-settings";
import { categoryTone } from "@/lib/admin-ui";
import { fileReady, groupByCategory, NO_CATEGORY, templateFiles, type DesignTemplate } from "@/lib/design-templates";
import { fetchTemplates } from "@/lib/template-repo";

/** qty = ให้ลูกค้าระบุจำนวนของตัวเลือกนี้ (เฉพาะกลุ่มติ๊กหลายอย่าง ที่เปิด perUnitOn) · qtyMax = เพดานจำนวน (ว่าง = 99) */
/** perUnit = ชิ้นที่ได้ต่อ 1 หน่วยสั่งของตัวเลือกนี้ (กางช่องกรอกเมื่อกลุ่มเปิด perUnitOn) */
/**
 * stockItemId/stockQtyPer = ผูกกับ SKU ในคลังวัสดุ (ตั้งจากสคริปต์ link-preset-stock / หน้าคลัง)
 * ⚠️ ต้องพกผ่านดราฟต์ให้ครบ เพราะ fromDraftOptions สร้าง choices ใหม่ทั้งก้อน
 *    ถ้าไม่พกมา แอดมินกดบันทึกสินค้าทีเดียวลิงก์สต๊อกหายหมดแบบเงียบ ๆ
 */
type DraftChoice = {
  name: string;
  extra: string;
  qty?: boolean;
  qtyMax?: string;
  perUnit?: string;
  imageSrc?: string;
  stockItemId?: string;
  stockQtyPer?: number;
  /** 💬 เลือกตัวนี้แล้ว = งานสั่งทำ ให้แอดมินตีราคา (เช่น "แบบที่ 3 กำหนดขนาดเอง") */
  askPrice?: boolean;
};
/** presetId มี = กลุ่มนี้ "ลิงก์" คลังตัวเลือกกลาง (label+choices มาจากคลัง แก้ในกลุ่มไม่ได้จนกว่าจะตัดลิงก์) */
type DraftOption = {
  label: string;
  choices: DraftChoice[];
  presetId?: string;
  /** pills/dropdown = เลือกได้ 1 อย่าง · multi = ติ๊กได้หลายอย่าง · input = ให้ลูกค้ากรอกเอง */
  display: "pills" | "dropdown" | "multi" | "input";
  /** ── กลุ่มชนิด "ช่องกรอก" (display: input) — เก็บเป็น string เพราะกรอกในช่อง ── */
  inKind?: "number" | "text" | "textarea";
  inUnit?: string;
  inMin?: string;
  inMax?: string;
  inPlaceholder?: string;
  inHint?: string;
  /** ไม่ติ๊ก = ไม่บังคับกรอก (ค่าเริ่มต้นคือบังคับ) */
  inOptional?: boolean;
  /** รับเฉพาะจำนวนเต็ม (เฉพาะช่องตัวเลข) */
  inInteger?: boolean;
  /** 💬 ใช้กลุ่มนี้แล้ว = งานสั่งทำ ให้แอดมินตีราคา */
  askPrice?: boolean;
  /** กลุ่มนี้ย้ายไปแก้ที่แผง 📐 งานสั่งทำ (แทนแผง 🎛️ ตัวเลือกสินค้า) */
  madeToOrder?: boolean;
  /** +฿ ของกลุ่มนี้มีผลเมื่อสั่งตั้งแต่กี่ชิ้นขึ้นไป (ว่าง = ทุกจำนวน) */
  extraFromQty?: string;
  /** ค่าธรรมเนียมช่วงสั่งน้อย เช่น ปลีก 1-10 ชิ้น เลือกตะขอ +10/ชิ้น (ยกเว้นบางตัวเลือก) */
  smallFee?: string;
  smallUpTo?: string;
  smallFree?: string[];
  smallWhenLabel?: string;
  smallWhenChoices?: string[];
  /** "ฟรีเมื่อ" — ตัวเลือกที่ไม่คิด +฿ เมื่อกลุ่มอื่นเลือกค่าที่กำหนด */
  freeChoices?: string[];
  freeWhenLabel?: string;
  freeWhenChoices?: string[];
  /** เปิดช่อง "🔢 ระบุจำนวน" ให้ทุกตัวเลือกในกลุ่มนี้ (ค่าจริงติ๊กทีละตัวที่ DraftChoice.qty) */
  qtyOn?: boolean;
  /** "แสดงเมื่อ" — โชว์ทั้งกลุ่มเฉพาะตอนกลุ่มอื่นเลือกค่าที่กำหนด (ว่าง = แสดงตลอด) */
  showWhenLabel?: string;
  showWhenChoices?: string[];
  /** เงื่อนไข "และ" ข้อที่สอง (ว่าง = ใช้เงื่อนไขเดียว) */
  showWhenAlsoLabel?: string;
  showWhenAlsoChoices?: string[];
  /** 🎨 โชว์เป็นตารางสวอตช์สีบนหน้าร้าน (กลุ่ม multi ที่ตัวเลือกเยอะ เช่น สีไหม) */
  swatchGrid?: boolean;
  /** 🔍 รูปตารางสีเต็มของกลุ่มสวอตช์ (เปิดดูขยายจากหน้าร้าน) */
  chartSrc?: string;
  /** 💰 +฿ ของกลุ่มนี้คิดต่อลาย ไม่คูณจำนวนชิ้น */
  extraPerDesign?: boolean;
};
/**
 * กางช่อง "🔢 ระบุจำนวน" ที่แถวตัวเลือกไหม — ติ๊กสวิตช์ที่หัวกลุ่มก่อนถึงโผล่
 * (สินค้าส่วนใหญ่ไม่ได้ใช้ ถ้าโผล่ทุกแถวจะรกจนหาช่องที่ต้องแก้ไม่เจอ)
 */
function choiceQtyVisible(opt: DraftOption): boolean {
  return opt.display === "multi" && !!opt.qtyOn;
}
type DraftImage = { emoji: string; gradient: string; label: string; src?: string };
type DraftBody = {
  heading: string;
  text: string;
  /** เนื้อหาแบบจัดรูปแบบ (HTML) — ไม่ว่าง = ใช้แทน text (ตัวเขียนชุดเดียวกับแท็บ/บทความ) */
  html: string;
  emoji: string; // ว่าง (และไม่มีรูปจริง) = ไม่มีรูป
  gradient: string;
  imgLabel: string;
  /** รูปจริงที่อัปโหลด — มีแล้วใช้แทนอีโมจิ+สีพื้น */
  src: string;
  align: "left" | "right";
  /** โซนที่ไปแสดงในหน้าสินค้า: "side" = ช่องข้างแผงสั่งซื้อ · ไม่ระบุ = ใต้แผงสั่งซื้อเต็มความกว้าง */
  slot?: "side";
};
/**
 * หน่วยนับที่เลือกได้ในเมนู — คัดจากหน่วยที่ร้านใช้จริง เรียงตามความถี่
 * หน่วยที่ไม่อยู่ในลิสต์ (สินค้าเก่า/นำเข้ามาเพี้ยน) ไม่หาย — เมนูจะเด้งไป "อื่น ๆ" แล้วกางช่องพิมพ์ให้แก้
 */
const UNIT_PRESETS = [
  "ชิ้น", "อัน", "ใบ", "ตัว", "แผ่น", "แผ่น A3", "เล่ม", "เส้น",
  "ผืน", "เซ็ต", "ชุด", "คู่", "กล่อง", "จุด", "หลา", "เมตร", "ตร.ม.",
];
/** ค่าพิเศษของ <option> "อื่น ๆ" — ไม่ใช่หน่วยจริง ห้ามบันทึกลง pricing.unit */
const UNIT_OTHER = "__other__";

/** กฎ: เมื่อเลือก [whenLabel = whenChoice] → จำกัดกลุ่ม [limitLabel] เหลือเฉพาะ allow[] */
type DraftRule = { whenLabel: string; whenChoice: string; whenChoices: string[]; limitLabel: string; allow: string[] };
type DraftTier = { upTo: string; label: string };
/** 📐 ตั้งค่าคิดราคาตามพื้นที่ — สองเรทดึงจากคอลัมน์ในตารางราคา จึงเปลี่ยนตามช่วงจำนวนเอง */
type DraftArea = {
  enabled: boolean;
  widthLabel: string;
  heightLabel: string;
  baseColumn: string;
  stepColumn: string;
  baseArea: string;
  round: "ceil" | "round" | "none";
};
const EMPTY_AREA: DraftArea = {
  enabled: false, widthLabel: "", heightLabel: "", baseColumn: "", stepColumn: "", baseArea: "", round: "ceil",
};

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
/** หนึ่งช่วงของตารางค่าคละลาย (กรอกเป็น string) */
type DraftMixTier = { fromQty: string; baseFee: string; includedDesigns: string; extraFee: string; onePerUnit: boolean };
const EMPTY_MIX_TIER: DraftMixTier = { fromQty: "", baseFee: "", includedDesigns: "", extraFee: "", onePerUnit: false };
/** ข้อมูลกำกับเรทราคา (ชื่อ + เงื่อนไขการสั่ง + ภาพประจำเรท) */
type DraftRateMeta = { label: string; desc: string; minQty: string; minPerDesign: string; extraDesignFee: string; freeMixBelowQty: string; imageSrc?: string };
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
  /** ค่าคละลายแบบคิดเป็นเงินต่อหน่วย (mixRule) — ตารางแยกตามช่วงจำนวน (string เพราะกรอกในช่อง) */
  mix: { on: boolean; tiers: DraftMixTier[] };
  highlights: string[];
  images: DraftImage[];
  body: DraftBody[];
  /** แท็บข้อมูลสินค้า (รายละเอียดเพิ่มเติม / วิธีสั่งงาน / การรับประกัน ฯลฯ) */
  tabs: {
    title: string;
    text: string;
    /** เนื้อหาแบบจัดรูปแบบ (HTML) — ไม่ว่าง = ใช้ตัวเขียน rich text แทนช่องข้อความธรรมดา */
    html: string;
    images: string[];
    imagePos: "top" | "bottom";
    /** auto = ให้หน้าสินค้าเลือกเองตามจำนวนรูป (1 รูป = เต็มกว้าง · 2 = 2 คอลัมน์ · 3+ = 3 คอลัมน์) */
    imageSize: "auto" | "sm" | "md" | "lg";
    imageAlign: "left" | "center" | "right";
  }[];
  seo: DraftSeo;
  custom: DraftCustom;
  /** 📐 กางกล่องงานสั่งทำค้างไว้เลย ไม่ต้องให้ลูกค้าติ๊กก่อน (สินค้าที่ไม่มีขนาดมาตรฐาน) */
  mtoAlways: boolean;
  /** 📐 คิดราคาตามพื้นที่ลาย (baseArea เก็บเป็น string เพราะกรอกในช่อง) */
  area: DraftArea;
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
  /** ค่าส่งเฉพาะบางตัวเลือก (ขนาดมีผลกับกล่อง) — ว่าง = ใช้ค่ากลางของสินค้าอย่างเดียว */
  shipRules: DraftShipRule[];
  /** 📐 เทมเพลตไฟล์งานที่ผูกกับสินค้านี้ (id จากคลังเทมเพลต) */
  templateIds: string[];
  /** ข้อควรทราบ/เงื่อนไขงาน (แสดงหน้าสินค้า) */
  terms: string;
  /** บังคับแนบลายก่อนสั่ง (ค่าเริ่มต้น = บังคับ) */
  artworkRequired: boolean;
  /** 💬 ต้องคุยลายกับแอดมินก่อนสั่ง (งานปัก/งานตีลาย) */
  artworkConsult: boolean;
  /** เหตุผล/รายละเอียดที่ลูกค้าเห็นในกล่องคุยลาย (ว่าง = ใช้ข้อความกลาง) */
  artworkConsultNote: string;
  /** true = สั่งไม่ได้จนกว่าลูกค้าจะติ๊กว่าคุยแล้ว · false = แค่แนะนำให้ทัก */
  artworkConsultBlock: boolean;
  /** สถานะตรวจสอบหลังบ้าน (มีค่า = ตรวจแล้ว) */
  reviewed?: ProductReview;
  /** ปิดการมองเห็นบนหน้าร้าน (ตั้งจากหน้ารายการสินค้า) — พกผ่านดราฟต์ไว้ ไม่ให้หายตอนบันทึก */
  hidden?: boolean;
};

/** เงื่อนไขค่าส่งตามตัวเลือก 1 ข้อ — เช่น "ขนาด = A2 → ขั้นต่ำส่งแมส" */
type DraftShipRule = DraftShipTiers & {
  /** ชื่อกลุ่มตัวเลือก เช่น "ขนาด" */
  label: string;
  /** ค่าที่เข้าเงื่อนไข (ติ๊กได้หลายค่า) */
  choices: string[];
  /** วิธีจัดส่งขั้นต่ำเมื่อเข้าเงื่อนไขนี้ ('' = ใช้ของสินค้า) */
  shippingId: string;
};

type DraftCustom = {
  enabled: boolean;
  label: string;
  mode: "area" | "quote" | "size" | "chat";
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
/** รูปประกอบต่อ 1 แท็บข้อมูลสินค้า */
const MAX_TAB_IMAGES = 6;

/**
 * หัวข้อที่ "หุบไว้" ตั้งแต่เปิดหน้า — หน้ายาวมาก กางทุกอันพร้อมกันหาอะไรไม่เจอ
 * เลือกหุบหัวข้อที่นาน ๆ แก้ที (SEO · เนื้อหา · ข้อควรทราบ · กฎ · เทมเพลตไฟล์งาน)
 * ที่กดกางเองจะถูกจำไว้ในเบราว์เซอร์ (admin.product.closedSecs) และชนะค่าเริ่มต้นนี้
 */
const DEFAULT_CLOSED_SECS: Record<string, boolean> = {
  seo: true,
  body: true,
  terms: true,
  rules: true,
  templates: true,
};

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
    mtoAlways: p.mtoAlways === true,
    area: p.areaPricing
      ? {
          enabled: p.areaPricing.enabled,
          widthLabel: p.areaPricing.widthLabel,
          heightLabel: p.areaPricing.heightLabel,
          baseColumn: p.areaPricing.baseColumn,
          stepColumn: p.areaPricing.stepColumn,
          baseArea: String(p.areaPricing.baseArea),
          round: p.areaPricing.round ?? "ceil",
        }
      : EMPTY_AREA,
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
      ...(o.swatchGrid ? { swatchGrid: true } : {}),
      ...(o.chartSrc ? { chartSrc: o.chartSrc } : {}),
      ...(o.extraPerDesign ? { extraPerDesign: true } : {}),
      choices: o.choices.map((c) => ({
        name: c.name,
        extra: c.extra ? String(c.extra) : "",
        // กลุ่มที่เคยเปิด "ระบุจำนวน" ไว้ทั้งกลุ่ม (ของเก่า) → ย้ายมาเป็นรายตัวให้เลย
        ...(c.qty ?? o.qtyPerChoice ? { qty: true } : {}),
        ...(c.qtyMax || o.qtyMax ? { qtyMax: String(c.qtyMax ?? o.qtyMax) } : {}),
        ...(c.perUnit ? { perUnit: String(c.perUnit) } : {}),
        ...(c.imageSrc ? { imageSrc: c.imageSrc } : {}),
        ...(c.stockItemId ? { stockItemId: c.stockItemId } : {}),
        ...(c.stockQtyPer ? { stockQtyPer: c.stockQtyPer } : {}),
        ...(c.askPrice ? { askPrice: true } : {}),
      })),
      ...(o.presetId ? { presetId: o.presetId } : {}),
      // มีตัวไหนเปิด "ระบุจำนวน" ไว้ = กลุ่มนี้เคยเปิดสวิตช์ → เปิดค้างไว้ให้เห็นค่าเดิม
      ...(o.choices.some((c) => c.qty) || o.qtyPerChoice ? { qtyOn: true } : {}),
      display: o.display ?? "pills",
      ...(o.extraFromQty ? { extraFromQty: String(o.extraFromQty) } : {}),
      ...(o.smallQtyFee
        ? {
            smallFee: String(o.smallQtyFee.fee),
            smallUpTo: String(o.smallQtyFee.upToQty),
            smallFree: [...(o.smallQtyFee.freeChoices ?? [])],
            smallWhenLabel: o.smallQtyFee.when?.label ?? "",
            smallWhenChoices: [...(o.smallQtyFee.when?.choices ?? [])],
          }
        : {}),
      ...(o.freeWhen
        ? {
            freeChoices: [...o.freeWhen.choices],
            freeWhenLabel: o.freeWhen.when.label,
            freeWhenChoices: [...o.freeWhen.when.choices],
          }
        : {}),
      ...(o.showWhen
        ? { showWhenLabel: o.showWhen.label, showWhenChoices: [...o.showWhen.choices] }
        : {}),
      ...(o.showWhenAlso
        ? { showWhenAlsoLabel: o.showWhenAlso.label, showWhenAlsoChoices: [...o.showWhenAlso.choices] }
        : {}),
      ...(o.input
        ? {
            inKind: o.input.kind,
            inUnit: o.input.unit ?? "",
            inMin: o.input.min != null ? String(o.input.min) : "",
            inMax: o.input.max != null ? String(o.input.max) : "",
            inPlaceholder: o.input.placeholder ?? "",
            inHint: o.input.hint ?? "",
            ...(o.input.required === false ? { inOptional: true } : {}),
            ...(o.input.integer ? { inInteger: true } : {}),
          }
        : {}),
      ...(o.askPrice ? { askPrice: true } : {}),
      ...(o.madeToOrder ? { madeToOrder: true } : {}),
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
    mix: {
      on: !!p.mixRule,
      // มีตารางแล้วใช้ตาราง · ของเก่าที่ตั้งเป็นค่าเดี่ยว แปลงเป็นตาราง 1-2 แถวให้อัตโนมัติ
      tiers: p.mixRule
        ? p.mixRule.tiers?.length
          ? p.mixRule.tiers.map((t) => ({
              fromQty: String(t.fromQty),
              baseFee: String(t.baseFee),
              includedDesigns: String(t.includedDesigns),
              extraFee: String(t.extraFee),
              onePerUnit: !!t.onePerUnit,
            }))
          : [
              {
                fromQty: "1",
                baseFee: String(p.mixRule.baseFee),
                includedDesigns: String(p.mixRule.includedDesigns),
                extraFee: String(p.mixRule.extraFee),
                onePerUnit: false,
              },
              ...(p.mixRule.onePerUnitFromQty
                ? [
                    {
                      fromQty: String(p.mixRule.onePerUnitFromQty),
                      baseFee: String(p.mixRule.baseFee),
                      includedDesigns: String(p.mixRule.includedDesigns),
                      extraFee: String(p.mixRule.extraFee),
                      onePerUnit: true,
                    },
                  ]
                : []),
            ]
        : [],
    },
    rateMeta: p.priceRates?.[0]
      ? {
          label: p.priceRates[0].label,
          desc: p.priceRates[0].desc ?? "",
          minQty: p.priceRates[0].minQty != null ? String(p.priceRates[0].minQty) : "",
          minPerDesign: p.priceRates[0].minPerDesign != null ? String(p.priceRates[0].minPerDesign) : "",
          extraDesignFee: p.priceRates[0].extraDesignFee != null ? String(p.priceRates[0].extraDesignFee) : "",
          freeMixBelowQty: p.priceRates[0].freeMixBelowQty != null ? String(p.priceRates[0].freeMixBelowQty) : "",
          ...(p.priceRates[0].imageSrc ? { imageSrc: p.priceRates[0].imageSrc } : {}),
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
      ...(r.imageSrc ? { imageSrc: r.imageSrc } : {}),
      tiers: r.pricing.tiers.map((t) => ({ upTo: t.upTo == null ? "" : String(t.upTo), label: t.label })),
      cells: Object.fromEntries(Object.entries(r.pricing.cells).map(([k, v]) => [k, v.map((n) => String(n))])),
    })),
    highlights: [...p.highlights],
    images: p.images.map((im) => ({ ...im })),
    tabs: (p.tabs ?? []).map((t) => ({
      title: t.title,
      text: t.text,
      html: t.html ?? "",
      images: [...(t.images ?? [])],
      imagePos: t.imagePos ?? "bottom",
      imageSize: t.imageSize ?? "auto",
      imageAlign: t.imageAlign ?? "left",
    })),
    body: (p.body ?? []).map((b) => ({
      heading: b.heading,
      text: b.text,
      html: b.html ?? "",
      emoji: b.image?.emoji ?? "",
      gradient: b.image?.gradient ?? "from-sky-100 to-blue-200",
      imgLabel: b.image?.label ?? "",
      src: b.image?.src ?? "",
      align: b.align ?? "left",
      ...(b.slot === "side" ? { slot: "side" as const } : {}),
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
    shipRules: (p.shipRules ?? []).map((r) => ({
      label: r.label ?? "",
      choices: [...(r.choices ?? [])],
      shippingId: r.shippingId ?? "",
      tiers: (r.shipTiers ?? []).map((t) => ({ minQty: String(t.minQty), price: String(t.price) })),
      mode: r.shipTierMethodId ? "method" : r.shipTierExtra && r.shipTierExtra > 0 ? "extra" : "last",
      extra: r.shipTierExtra != null && r.shipTierExtra > 0 ? String(r.shipTierExtra) : "",
      methodId: r.shipTierMethodId ?? "",
    })),
    templateIds: [...(p.templateIds ?? [])],
    terms: p.terms ?? "",
    artworkRequired: p.artworkRequired !== false,
    artworkConsult: !!p.artworkConsult?.enabled,
    artworkConsultNote: p.artworkConsult?.note ?? "",
    artworkConsultBlock: p.artworkConsult?.block !== false,
    reviewed: p.reviewed,
    hidden: p.hidden,
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
      ...(o.swatchGrid ? { swatchGrid: true } : {}),
      ...(o.chartSrc ? { chartSrc: o.chartSrc } : {}),
      ...(o.extraPerDesign ? { extraPerDesign: true } : {}),
      choices: o.choices
        .filter((c) => c.name.trim())
        // ชื่อซ้ำในกลุ่มเดียวกันเหลือตัวแรกตัวเดียว — ตัวที่ซ้ำใช้ช่องราคาคอลัมน์เดียวกัน
        // และหน้าร้าน/ตะกร้า/ใบงานแยกไม่ออกอยู่ดี (หน้าแก้ไขขึ้นป้าย "⚠ ชื่อซ้ำ" เตือนไว้ก่อนบันทึกแล้ว)
        .filter((c, i, arr) => arr.findIndex((x) => x.name.trim() === c.name.trim()) === i)
        .map((c) => {
          const extra = Number(c.extra);
          // ช่องจำนวนใช้ได้เฉพาะกลุ่มติ๊กหลายอย่าง — เปลี่ยนกลับเป็นปุ่มแยกแล้วต้องไม่ค้างไว้
          const qty = o.display === "multi" && o.qtyOn === true && c.qty === true;
          return {
            name: c.name.trim(),
            ...(Number.isFinite(extra) && extra > 0 ? { extra } : {}),
            ...(qty ? { qty: true, ...(Number(c.qtyMax) > 0 ? { qtyMax: Math.floor(Number(c.qtyMax)) } : {}) } : {}),
            // 📐 ชิ้น/หน่วย กรอกในตารางราคา (คอลัมน์แรก) แล้วเก็บกลับมาที่ตัวเลือกตามเดิม
            ...(Number(c.perUnit) > 0 ? { perUnit: Math.floor(Number(c.perUnit)) } : {}),
            ...(c.imageSrc ? { imageSrc: c.imageSrc } : {}),
            // ลิงก์คลังวัสดุ — หน้าแก้ไขไม่มีช่องกรอก แต่ต้องส่งกลับ ไม่งั้นบันทึกแล้วหาย
            ...(c.stockItemId ? { stockItemId: c.stockItemId } : {}),
            ...(c.stockQtyPer ? { stockQtyPer: c.stockQtyPer } : {}),
            ...(c.askPrice ? { askPrice: true as const } : {}),
          };
        }),
      ...(o.presetId ? { presetId: o.presetId } : {}),
      ...(o.display === "dropdown" || o.display === "multi" || o.display === "input"
        ? { display: o.display }
        : {}),
      ...(Number(o.extraFromQty) > 0 ? { extraFromQty: Math.floor(Number(o.extraFromQty)) } : {}),
      ...(Number.isFinite(Number(o.smallFee)) && Number(o.smallFee) !== 0 && String(o.smallFee ?? "").trim() !== "" && Number(o.smallUpTo) > 0
        ? {
            smallQtyFee: {
              fee: Number(o.smallFee),
              upToQty: Math.floor(Number(o.smallUpTo)),
              ...((o.smallFree ?? []).length ? { freeChoices: [...o.smallFree!] } : {}),
              ...(o.smallWhenLabel && (o.smallWhenChoices ?? []).length
                ? { when: { label: o.smallWhenLabel, choices: [...o.smallWhenChoices!] } }
                : {}),
            },
          }
        : {}),
      ...((o.freeChoices ?? []).length && o.freeWhenLabel && (o.freeWhenChoices ?? []).length
        ? { freeWhen: { choices: [...o.freeChoices!], when: { label: o.freeWhenLabel, choices: [...o.freeWhenChoices!] } } }
        : {}),
      ...(o.showWhenLabel && (o.showWhenChoices ?? []).length
        ? { showWhen: { label: o.showWhenLabel, choices: [...o.showWhenChoices!] } }
        : {}),
      ...(o.showWhenAlsoLabel && (o.showWhenAlsoChoices ?? []).length
        ? { showWhenAlso: { label: o.showWhenAlsoLabel, choices: [...o.showWhenAlsoChoices!] } }
        : {}),
      // กลุ่ม "ช่องกรอก" — ไม่มีรายการให้เลือก จึงเก็บสเปกของช่องแทน choices
      ...(o.display === "input"
        ? {
            input: {
              kind: o.inKind ?? "number",
              ...(o.inUnit?.trim() ? { unit: o.inUnit.trim() } : {}),
              ...(Number(o.inMin) > 0 ? { min: Number(o.inMin) } : {}),
              ...(Number(o.inMax) > 0 ? { max: Number(o.inMax) } : {}),
              ...(o.inPlaceholder?.trim() ? { placeholder: o.inPlaceholder.trim() } : {}),
              ...(o.inHint?.trim() ? { hint: o.inHint.trim() } : {}),
              ...(o.inOptional ? { required: false } : {}),
              ...(o.inInteger ? { integer: true } : {}),
            } satisfies OptionInput,
          }
        : {}),
      ...(o.askPrice ? { askPrice: true as const } : {}),
      ...(o.madeToOrder ? { madeToOrder: true as const } : {}),
    }))
    // กลุ่มช่องกรอกไม่มีตัวเลือกให้เลือกโดยธรรมชาติ — ขอแค่มีชื่อกลุ่มก็พอ
    .filter((o) => o.label && (o.choices.length > 0 || o.display === "input"));
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

/**
 * สถานะ "ยุบ/กาง" ผูกกับลำดับรายการ — ลบหรือสลับที่แล้วต้องขยับตาม ไม่งั้นการ์ดอื่นจะยุบ/กางแทนกัน
 */
function foldAfterRemove(rec: Record<number, boolean>, removed: number, total: number): Record<number, boolean> {
  const arr = Array.from({ length: total }, (_, i) => rec[i] ?? true);
  arr.splice(removed, 1);
  return Object.fromEntries(arr.map((v, i) => [i, v]));
}
function foldAfterSwap(rec: Record<number, boolean>, a: number, b: number, total: number): Record<number, boolean> {
  const arr = Array.from({ length: total }, (_, i) => rec[i] ?? true);
  [arr[a], arr[b]] = [arr[b], arr[a]];
  return Object.fromEntries(arr.map((v, i) => [i, v]));
}

/** ปุ่มยุบ/กางของการ์ดย่อย (กฎ / แท็บ) — หน้าตาเดียวกับปุ่มของกลุ่มตัวเลือก */
function FoldBtn({ folded, onClick, what }: { folded: boolean; onClick: () => void; what: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={!folded}
      title={folded ? `กาง${what}นี้` : `ยุบ${what}นี้`}
      className="shrink-0 rounded-full bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
    >
      {folded ? "▸ กาง" : "▾ ยุบ"}
    </button>
  );
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** HTML ที่ลบเนื้อหาจนหมดแล้ว (เหลือแต่ <p><br></p>) = ถือว่าว่าง ไม่ต้องเก็บ */
function isEmptyHtml(h: string): boolean {
  if (/<(img|iframe|table|hr)\b/i.test(h)) return false;
  return !h.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

/** ข้อความสั้น ๆ จาก HTML ไว้โชว์ตอนพับท่อนเนื้อหา (ตัดแท็กออก เหลือแต่ตัวอักษร) */
function htmlSummary(h: string): string {
  if (!h.trim() || isEmptyHtml(h)) return "";
  const txt = h
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return txt.slice(0, 60) || (/<(img|iframe|table)\b/i.test(h) ? "🖼 เนื้อหาจัดรูปแบบไว้" : "");
}

/**
 * แปลงเนื้อหาแท็บแบบข้อความธรรมดา (• = รายการ · ::หัวข้อ:: = ตัวหนา) เป็น HTML ตั้งต้น
 * ใช้ตอนกด "จัดรูปแบบ" — ของเดิมที่พิมพ์ไว้จะไม่หาย แค่ย้ายเข้าไปอยู่ในตัวเขียน
 */
function tabTextToHtml(text: string): string {
  const out: string[] = [];
  let ul: string[] = [];
  const flush = () => {
    if (ul.length) out.push(`<ul>${ul.join("")}</ul>`);
    ul = [];
  };
  for (const raw of text.split("\n")) {
    const t = raw.trim();
    if (!t) {
      flush();
      continue;
    }
    if (t.startsWith("•")) {
      ul.push(`<li>${escHtml(t.replace(/^•\s*/, ""))}</li>`);
      continue;
    }
    flush();
    if (/^::.*::$|::$/.test(t)) out.push(`<p><strong>${escHtml(t.replace(/^::|::$/g, "").trim())}</strong></p>`);
    else out.push(`<p>${escHtml(t)}</p>`);
  }
  flush();
  return out.join("") || "<p><br></p>";
}

/** แถวปุ่มเลือกค่าเดียวจากไม่กี่ตัว (ชิปกดเลือก) — เช่น ตำแหน่ง/ขนาดรูปในแท็บ */
function PickRow<T extends string>({
  value,
  options,
  onPick,
}: {
  value: T;
  /** disabled = กดไม่ได้ (โชว์จาง ๆ พร้อม title บอกเหตุผล) */
  options: { v: T; label: string; disabled?: boolean; title?: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={value === o.v}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onPick(o.v)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
            value === o.v
              ? "bg-sky-500 text-white shadow-sm"
              : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** ปุ่มเลื่อนลำดับ ขึ้น/ลง — ใช้ทั้งกับกลุ่มตัวเลือกและตัวเลือกในกลุ่ม */
function MoveBtns({
  onUp,
  onDown,
  upDisabled,
  downDisabled,
  what,
  size = "sm",
}: {
  onUp: () => void;
  onDown: () => void;
  upDisabled: boolean;
  downDisabled: boolean;
  what: string;
  size?: "sm" | "xs";
}) {
  const cls =
    size === "xs"
      ? "h-4 w-5 text-[9px] leading-none"
      : "h-4 w-6 text-[10px] leading-none";
  const base = `grid place-items-center rounded bg-slate-100 font-bold text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-slate-100 ${cls}`;
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      <button type="button" onClick={onUp} disabled={upDisabled} className={base} title={`เลื่อน${what}ขึ้น`} aria-label={`เลื่อน${what}ขึ้น`}>
        ▲
      </button>
      <button type="button" onClick={onDown} disabled={downDisabled} className={base} title={`เลื่อน${what}ลง`} aria-label={`เลื่อน${what}ลง`}>
        ▼
      </button>
    </div>
  );
}

/** ค่าตารางค่าส่งตามจำนวน 1 ชุด (ใช้ทั้งของสินค้าและของเงื่อนไขตามตัวเลือก) */
type DraftShipTiers = {
  tiers: { minQty: string; price: string }[];
  /** เกินขั้นสุดท้ายทำยังไง: ใช้ราคาขั้นสุดท้าย / คิดเพิ่มต่อชิ้น / เปลี่ยนวิธีส่ง */
  mode: "last" | "extra" | "method";
  extra: string;
  methodId: string;
};

const EMPTY_SHIP_TIERS: DraftShipTiers = { tiers: [], mode: "last", extra: "", methodId: "" };

/** DraftShipTiers → ฟิลด์ค่าส่งของ Product (ตัดแถวว่าง + ค่าที่โหมดปัจจุบันไม่ได้ใช้ทิ้ง) */
function buildShipTiers(v: DraftShipTiers): {
  shipTiers?: ShipTier[];
  shipTierExtra?: number;
  shipTierMethodId?: string;
} {
  const rows = v.tiers
    .map((t) => ({ minQty: Math.floor(Number(t.minQty)), price: Number(t.price) }))
    .filter((t) => t.minQty > 0 && t.price >= 0)
    .sort((a, b) => a.minQty - b.minQty);
  if (!rows.length) return {};
  return {
    shipTiers: rows,
    shipTierExtra: v.mode === "extra" && Number(v.extra) > 0 ? Number(v.extra) : undefined,
    shipTierMethodId: v.mode === "method" && v.methodId ? v.methodId : undefined,
  };
}

/** ตัวแก้ตารางค่าส่งตามจำนวนชิ้น — ใช้ซ้ำได้ทั้งระดับสินค้าและระดับตัวเลือก */
function ShipTierBox({
  title,
  hint,
  value,
  onChange,
  methods,
}: {
  title: string;
  hint: ReactNode;
  value: DraftShipTiers;
  onChange: (v: DraftShipTiers) => void;
  methods: ShippingMethod[];
}) {
  const set = (p: Partial<DraftShipTiers>) => onChange({ ...value, ...p });
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs font-semibold text-slate-600">{title}</label>
        <button
          type="button"
          onClick={() => set({ tiers: [...value.tiers, { minQty: "", price: "" }] })}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600 hover:border-amber-300"
        >
          ＋ เพิ่มขั้น
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{hint}</p>

      {value.tiers.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {value.tiers.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs text-slate-500">สั่งตั้งแต่</span>
              <input
                value={t.minQty}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  set({ tiers: value.tiers.map((x, xi) => (xi === i ? { ...x, minQty: v } : x)) });
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
                  set({ tiers: value.tiers.map((x, xi) => (xi === i ? { ...x, price: v } : x)) });
                }}
                inputMode="decimal"
                placeholder="50"
                className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-amber-400 focus:outline-none"
              />
              <span className="text-xs text-slate-500">บาท</span>
              <button
                type="button"
                onClick={() => set({ tiers: value.tiers.filter((_, xi) => xi !== i) })}
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
              value={value.mode}
              onChange={(e) => set({ mode: e.target.value as DraftShipTiers["mode"] })}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-amber-400 focus:outline-none"
            >
              <option value="last">ใช้ราคาขั้นสุดท้ายไปเรื่อย ๆ</option>
              <option value="extra">คิดเพิ่มต่อชิ้น (ระบุราคา)</option>
              <option value="method">เปลี่ยนเป็นวิธีส่งอื่น (เช่น ส่งแมส)</option>
            </select>

            {value.mode === "extra" && (
              <>
                <span className="text-xs text-slate-500">ชิ้นละ</span>
                <input
                  value={value.extra}
                  onChange={(e) => set({ extra: e.target.value.replace(/[^\d.]/g, "") })}
                  inputMode="decimal"
                  placeholder="10"
                  className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-amber-400 focus:outline-none"
                />
                <span className="text-xs text-slate-500">บาท</span>
              </>
            )}

            {value.mode === "method" && (
              <>
                <select
                  value={value.methodId}
                  onChange={(e) => set({ methodId: e.target.value })}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-amber-400 focus:outline-none"
                >
                  <option value="">— เลือกวิธีส่ง —</option>
                  {/* วิธีที่ราคา 0 (มารับเอง/ส่งฟรี) เลือกไม่ได้ — ตั้งแล้วสั่งเยอะจะกลายเป็นส่งฟรี */}
                  {methods
                    .filter((m) => m.price > 0)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {m.price} บาท
                      </option>
                    ))}
                </select>
                <span className="text-[11px] text-slate-400">
                  สั่งเกินขั้นสุดท้ายเมื่อไหร่ ระบบบังคับวิธีส่งนี้ให้เลย (ไม่คิดตามตาราง) ·
                  ยังไม่มีวิธีส่งแมส? ไปเพิ่มที่ ตั้งค่าระบบ → การจัดส่ง ก่อน
                  <strong className="block text-amber-600">
                    ⚠️ &ldquo;มารับเอง&rdquo; ใช้ตรงนี้ไม่ได้ (ค่าส่ง 0 = สั่งเยอะแล้วกลายเป็นส่งฟรี)
                  </strong>
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
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
  /** กล่องยืนยันของระบบ (แทน confirm() ของเบราว์เซอร์) — วาง {confirmBox} ไว้ท้ายหน้า */
  const { confirm: ask, dialog: confirmBox } = useConfirm();
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
  // 📐 คลังเทมเพลตไฟล์งาน — ให้ติ๊กเลือกว่าสินค้านี้ใช้เทมเพลตไหนบ้าง
  const [templates, setTemplates] = useState<DesignTemplate[]>([]);
  useEffect(() => {
    void fetchTemplates().then(setTemplates);
  }, []);
  /**
   * เทมเพลตที่ "ผูกไว้กับสินค้านี้" เท่านั้น — คลังมีเป็นร้อยชุด โชว์ทั้งคลังตรงนี้เลื่อนหาไม่ไหว
   * จะผูกเพิ่มทำที่หน้าคลังเทมเพลต (ปุ่ม 🔗 ผูกสินค้า) · ตรงนี้เหลือไว้ดู/ปลดออก
   */
  const linkedTemplates = templates.filter((t) => draft.templateIds.includes(t.id));
  /**
   * กลุ่มที่กำหนด "📐 ชิ้น/หน่วย" ตอนกลุ่มนั้นไม่ได้เป็นคอลัมน์ของตารางราคา
   * (เช่น Super Sticker — ราคาคิดต่อแผ่น A3 เท่ากันทุกขนาด แต่ขนาดเป็นตัวบอกว่าได้กี่ดวงต่อแผ่น)
   * null = ยังไม่ได้เลือกเอง → เดาจากข้อมูลที่มีอยู่
   */
  const [perUnitPick, setPerUnitPick] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  /** กำลังยิงบันทึกอยู่ — กันกดซ้ำระหว่างรอ (เคยกดรัวเพราะไม่มีอะไรตอบสนอง) */
  const [saving, setSaving] = useState(false);
  /** บันทึกไม่ผ่านเพราะข้อมูลถูกแก้จากที่อื่น (409) — โชว์ปุ่มโหลดใหม่/บันทึกทับข้างปุ่มบันทึก */
  const [conflict, setConflict] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragPhotoRef = useRef<number | null>(null); // รูปที่กำลังลาก (ref — อ่านได้ทันทีตอน drop)
  const [dragPhoto, setDragPhoto] = useState<number | null>(null); // ไว้ทำ visual feedback
  // ── ยุบ/ขยายแต่ละหัวข้อ (จำไว้ในเบราว์เซอร์) — หน้ายาวมาก เปิดทุกอันพร้อมกันหาอะไรไม่เจอ ──
  const [closedSecs, setClosedSecs] = useState<Record<string, boolean>>(DEFAULT_CLOSED_SECS);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("admin.product.closedSecs");
      // ทับค่าเริ่มต้นด้วยของที่เคยกดไว้ (ไม่ใช่แทนทั้งก้อน) — หัวข้อที่เพิ่งตั้งให้หุบจะได้หุบจริงกับคนที่เคยใช้อยู่แล้ว
      if (saved) setClosedSecs({ ...DEFAULT_CLOSED_SECS, ...JSON.parse(saved) });
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
  /**
   * กดเลือก "อื่น ๆ" ในหน่วยนับ = กางช่องพิมพ์เอง
   * (หน่วยที่ไม่ได้อยู่ในลิสต์อยู่แล้วจะกางให้เองโดยไม่ต้องพึ่ง state ตัวนี้ — ดู showUnitText)
   */
  const [unitOther, setUnitOther] = useState(false);
  /** กางช่องพิมพ์เอง = กดเลือก "อื่น ๆ" หรือหน่วยปัจจุบันไม่มีในลิสต์ (ค่าเดิมต้องแก้ได้เสมอ) */
  const showUnitText =
    unitOther || (!!draft.pricing.unit && !UNIT_PRESETS.includes(draft.pricing.unit));
  /** ท่อนเนื้อหาที่กำลังลากรูปค้างอยู่ (ไฮไลต์กรอบ) */
  const [bodyDragOver, setBodyDragOver] = useState<number | null>(null);
  /** ท่อนเนื้อหาที่พับอยู่ (เนื้อหายาว ๆ พับเก็บให้หน้าโล่ง) */
  const [bodyFolded, setBodyFolded] = useState<Record<number, boolean>>({});
  /** รอบการ remount ตัวเขียนของท่อนเนื้อหา — บวกทุกครั้งที่ลบ/ย้ายท่อน (ตัวเขียนอ่าน initialHtml ครั้งเดียวตอน mount) */
  const [bodyRev, setBodyRev] = useState(0);

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

  /** แท็บที่กำลังลากรูปค้างอยู่ (ไฮไลต์กรอบ) */
  const [tabDragOver, setTabDragOver] = useState<number | null>(null);
  /** แท็บที่กำลังอัปโหลดรูปอยู่ (กันกดซ้ำ + โชว์สถานะ) */
  const [tabUploading, setTabUploading] = useState<number | null>(null);

  /** อัปโหลดรูปเข้าแท็บข้อมูลสินค้า — ใช้ทั้งปุ่มเลือกไฟล์และลากมาวาง (ทีละหลายรูปได้) */
  async function uploadTabImages(i: number, files?: FileList | File[] | null) {
    if (!files) return;
    const room = MAX_TAB_IMAGES - (draft.tabs[i]?.images.length ?? 0);
    if (room <= 0) {
      setSaveError(`แท็บหนึ่งใส่รูปได้สูงสุด ${MAX_TAB_IMAGES} รูป`);
      return;
    }
    const picked = [...files].filter((f) => f.type.startsWith("image/")).slice(0, room);
    if (!picked.length) return;
    setSaveError("");
    setTabUploading(i);
    const urls: string[] = [];
    for (const f of picked) {
      try {
        const blob = await fileToBlob(f);
        const fd = new FormData();
        fd.append("file", blob, "tab.jpg");
        fd.append("productId", productId);
        const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
        // โหมดเดโมยังไม่ตั้ง Supabase → เก็บ base64 แทน (เหมือนรูปสินค้า)
        if (res.status === 503) {
          urls.push(await fileToDataUrl(f));
        } else {
          const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
          if (res.ok && data.url) urls.push(data.url);
          else setSaveError(data.error ?? "อัปโหลดรูปไม่สำเร็จ");
        }
      } catch {
        setSaveError("อัปโหลดรูปไม่สำเร็จ");
      }
    }
    setTabUploading(null);
    if (urls.length) {
      setDraft((d) => ({
        ...d,
        tabs: d.tabs.map((x, j) =>
          j === i ? { ...x, images: [...x.images, ...urls].slice(0, MAX_TAB_IMAGES) } : x,
        ),
      }));
      // ลากวางตอนแท็บพับอยู่ → กางให้เห็นรูปที่เพิ่งเพิ่ม
      setTabFolded((f) => ({ ...f, [i]: false }));
    }
  }

  /** ย้ายรูปในแท็บไปตำแหน่งใหม่ (ปุ่ม ‹ › และลากวาง) */
  function moveTabImage(i: number, from: number, to: number) {
    setDraft((d) => ({
      ...d,
      tabs: d.tabs.map((x, j) => {
        if (j !== i || from === to || to < 0 || to >= x.images.length) return x;
        const images = [...x.images];
        const [moved] = images.splice(from, 1);
        images.splice(to, 0, moved);
        return { ...x, images };
      }),
    }));
  }

  /**
   * รูปในแท็บที่กำลังลากสลับตำแหน่งอยู่ — ref อ่านได้ทันทีตอน drop · state ไว้ทำไฮไลต์
   * (ต้องแยกจากการลากไฟล์เข้ามาใหม่ ไม่งั้นการ์ดแท็บจะไฮไลต์ว่ากำลังจะอัปโหลด)
   */
  const dragTabImgRef = useRef<{ tab: number; idx: number } | null>(null);
  const [dragTabImg, setDragTabImg] = useState<{ tab: number; idx: number } | null>(null);

  /**
   * 🖼 อัปโหลดภาพประจำตัวเลือก/เรทราคา → คืน URL (โหมดเดโมยังไม่ตั้ง Supabase → เก็บ base64)
   * ใช้กับสินค้าที่มีหลายแบบ — ลูกค้าเห็นหน้าตาแต่ละแบบตั้งแต่ตอนเลือก
   */
  async function uploadChoiceImage(f: File): Promise<string | undefined> {
    if (!f.type.startsWith("image/")) return undefined;
    try {
      const blob = await fileToBlob(f);
      const fd = new FormData();
      fd.append("file", blob, "choice.jpg");
      fd.append("productId", productId);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const src =
        res.status === 503
          ? await fileToDataUrl(f)
          : ((await res.json().catch(() => ({}))) as { url?: string }).url;
      if (!src) setSaveError("อัปโหลดรูปไม่สำเร็จ");
      return src;
    } catch {
      setSaveError("อัปโหลดรูปไม่สำเร็จ");
      return undefined;
    }
  }

  /**
   * การ์ดแก้ "เนื้อหารายละเอียดสินค้า" — แยกตามโซนที่จะไปโผล่ในหน้าสินค้า
   * side = ช่องข้างแผงสั่งซื้อ (คอลัมน์ซ้าย) · wide = ใต้แผงสั่งซื้อเต็มความกว้าง
   * ทั้งสองการ์ดแก้ draft.body ก้อนเดียวกัน (i = ตำแหน่งจริงในอาร์เรย์) แค่กรองคนละโซน
   */
  function bodyCard(zone: "side" | "wide") {
    const side = zone === "side";
    const secId = side ? "body" : "bodyWide";
    const items = draft.body.map((b, i) => ({ b, i })).filter(({ b }) => (b.slot ?? "wide") === zone);
    return (
        <section id={side ? "sec-body" : "sec-body-wide"} className={`relative border-l-4 ${side ? "border-l-teal-400" : "border-l-indigo-400"} mt-4 scroll-mt-32 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]${secCls(secId)}`}>
          <SecToggle id={secId} />
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className={`text-sm font-bold ${side ? "text-teal-800" : "text-indigo-800"}`}>
                {side ? "🧩 เนื้อหาข้างแผงสั่งซื้อ" : "📄 เนื้อหารายละเอียดสินค้า (ด้านล่าง)"} ({items.length} ท่อน)
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {side
                  ? "แสดงในหน้าสินค้าตรงช่องข้าง ๆ แผงสั่งซื้อ (คอลัมน์ซ้าย) — เหมาะกับรูป/ข้อความสั้น"
                  : "แสดงใต้แผงสั่งซื้อ เต็มความกว้างหน้าจอ — เหมาะกับรูปใหญ่/เนื้อหายาว"}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                patch({
                  body: [
                    ...draft.body,
                    {
                      heading: "",
                      text: "",
                      html: "",
                      emoji: "",
                      gradient: "from-sky-100 to-blue-200",
                      imgLabel: "",
                      src: "",
                      align: items.length % 2 === 0 ? "left" : "right",
                      ...(side ? { slot: "side" as const } : {}),
                    },
                  ],
                })
              }
              className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
            >
              ＋ เพิ่มท่อนเนื้อหา
            </button>
          </div>
          {items.length === 0 && (
            <p className="rounded-2xl bg-slate-50 p-4 text-center text-xs text-slate-400">
              {side
                ? "ยังไม่มีเนื้อหาโซนนี้ — เพิ่มท่อน หรือกด ⇄ ย้ายท่อนจากโซนด้านล่างขึ้นมา"
                : "ยังไม่มีเนื้อหา — เพิ่มท่อนเนื้อหาเพื่อเล่ารายละเอียดสินค้า เช่น จุดขาย ขนาด วิธีสั่งซื้อ"}
            </p>
          )}
          <div className="space-y-3">
            {items.map(({ b, i }, n) => (
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
                    <span className="shrink-0 text-xs font-bold text-slate-400">ท่อนที่ {n + 1}</span>
                    {bodyFolded[i] && (
                      <span className="min-w-0 truncate text-xs font-semibold text-slate-600">
                        {b.src && "🖼 "}
                        {b.heading.trim() || htmlSummary(b.html) || b.text.trim().slice(0, 60) || "(ยังไม่มีเนื้อหา)"}
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
                      aria-label={`ตำแหน่งรูปท่อนที่ ${n + 1}`}
                    >
                      <option value="left">รูปอยู่ซ้าย</option>
                      <option value="right">รูปอยู่ขวา</option>
                    </select>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setBodyRev((r) => r + 1);
                        patch({
                          body: draft.body.map((x, j) =>
                            j === i ? { ...x, slot: side ? undefined : ("side" as const) } : x
                          ),
                        });
                      }}
                      title={side ? "ย้ายท่อนนี้ไปโซนด้านล่าง (เต็มความกว้าง)" : "ย้ายท่อนนี้ไปโซนข้างแผงสั่งซื้อ"}
                      className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
                    >
                      ⇄ {side ? "ย้ายลงล่าง" : "ย้ายไปข้างแผงสั่งซื้อ"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBodyRev((r) => r + 1);
                        patch({ body: draft.body.filter((_, j) => j !== i) });
                      }}
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
                  aria-label={`หัวข้อท่อนที่ ${n + 1}`}
                />
                {/* ตัวเขียนจัดรูปแบบ — ชุดเดียวกับแท็บ/บทความ (ข้อความเดิมแบบ • / ::หัวข้อ:: แปลงให้อัตโนมัติ)
                    key มี bodyRev เพื่อให้ตัวเขียนโหลดค่าใหม่หลังลบ/ย้ายท่อน (ไม่งั้นค้างเนื้อหาของท่อนเดิม) */}
                <div className="mt-2">
                  <RichEditor
                    key={`body-${i}-${bodyRev}`}
                    initialHtml={b.html || tabTextToHtml(b.text)}
                    onChange={(html) => patch({ body: draft.body.map((x, j) => (j === i ? { ...x, html } : x)) })}
                  />
                </div>
                <div className="mt-2 flex items-center gap-2">
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
                    aria-label={`อีโมจิรูปท่อนที่ ${n + 1}`}
                  />
                  {(b.emoji.trim() || b.src) && (
                    <>
                      <GradientPicker
                        value={b.gradient}
                        emoji={b.emoji}
                        onChange={(v) => patch({ body: draft.body.map((x, j) => (j === i ? { ...x, gradient: v } : x)) })}
                        ariaLabel={`สีพื้นรูปท่อนที่ ${n + 1}`}
                      />
                      <input
                        value={b.imgLabel}
                        onChange={(e) =>
                          patch({ body: draft.body.map((x, j) => (j === i ? { ...x, imgLabel: e.target.value } : x)) })
                        }
                        placeholder="คำบรรยายรูป"
                        className={`min-w-28 flex-1 ${smallInputCls}`}
                        aria-label={`คำบรรยายรูปท่อนที่ ${n + 1}`}
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
    );
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
  /** รูปทั้งหมดที่เจอในหน้าที่ดึงมา (ไม่ผูกกับสินค้าตัวไหน) + รูปที่แอดมินติ๊กไว้จากกองนี้ */
  const [impPageImgs, setImpPageImgs] = useState<string[]>([]);
  const [impPagePick, setImpPagePick] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  // คลังหน่วยขนาด (ส่วนกลาง) + โมดัลจัดการหน่วย
  const [units, setUnits] = useState<CustomUnit[]>([]);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [newUnitLabel, setNewUnitLabel] = useState("");
  const [newUnitToM, setNewUnitToM] = useState("");
  useEffect(() => setUnits(loadUnits()), []);
  /** หมวดหมู่ที่แอดมินแก้ไว้ในตั้งค่าระบบ (ยังไม่โหลดเสร็จ = ค่าเริ่มต้นจากโค้ด) */
  const [cats, setCats] = useState<ShopCategory[]>(DEFAULT_CATEGORIES);
  useEffect(() => {
    fetchCategories({ fresh: true }).then(setCats);
  }, []);
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

  /**
   * ตัวเลือกนี้ยังไม่ได้ใส่ราคาในเรทไหนบ้าง — คืนชื่อเรทที่แถวราคายังว่างทั้งแถว
   * แถวว่าง = ตอนบันทึกไม่เก็บคีย์นั้น แล้วหน้าร้าน "ซ่อน" ตัวเลือกนั้นทิ้ง
   * (เพิ่มชื่อขนาดใหม่ไว้แต่ลืมกรอกราคา = ลูกค้าไม่เห็นขนาดนั้นเลย — บั๊กที่หาสาเหตุยากที่สุด)
   * คืน [] = มีราคาแล้ว หรือกลุ่มนี้ไม่ใช่คอลัมน์ของตารางราคา
   */
  function ratesMissingPrice(optLabel: string, choiceName: string): string[] {
    const name = choiceName.trim();
    const di = draft.pricing.driverLabels.indexOf(optLabel);
    if (!draft.pricing.enabled || di < 0 || !name) return [];
    const cols = pricingColumns(draft.options, draft.pricing.driverLabels).filter((c) => c[di] === name);
    if (!cols.length) return [];
    const tables = [
      { label: draft.rateMeta.label.trim() || "เรทที่ 1", tiers: draft.pricing.tiers, cells: draft.pricing.cells },
      ...draft.extraRates.map((r, i) => ({
        label: r.label.trim() || `เรทที่ ${i + 2}`,
        tiers: r.tiers,
        cells: r.cells,
      })),
    ];
    return tables
      .filter((t) => t.tiers.length > 0)
      .filter((t) => !cols.some((c) => (t.cells[columnKey(c)] ?? []).some((v) => String(v ?? "").trim())))
      .map((t) => t.label);
  }

  /** จำนวนตัวเลือกในกลุ่มที่ยังไม่มีราคาสักเรท — ใช้ขึ้นป้ายเตือนตอนกลุ่มถูกพับไว้ */
  function pricelessCount(opt: DraftOption): number {
    return opt.choices.filter((c) => ratesMissingPrice(opt.label, c.name).length > 0).length;
  }

  /**
   * ปุ่มเลือก "ราคาของกลุ่มนี้มาจากไหน" — สลับได้ทุกกลุ่ม ไม่ต้องเข้าไปงมในโมดัลตารางราคา
   *   📊 ในตารางราคา = กลุ่มเป็นคอลัมน์ ราคาต่างกันตามช่วงจำนวน (ต้องกรอกให้ครบทุกตัวเลือก)
   *   +฿ ที่ตัวเลือกเอง = ราคาบวกเพิ่มต่อตัวเลือก ไม่ต้องมีในตาราง (กลุ่มส่วนใหญ่เป็นแบบนี้)
   */
  function priceSourceRow(gi: number, opt: DraftOption) {
    const isDriver = draft.pricing.driverLabels.includes(opt.label);
    const multi = opt.display === "multi";
    // ช่องกรอก = ลูกค้าพิมพ์ค่าเอง ไม่มีรายการให้ตั้งราคา เหลือทางเดียวคือให้แอดมินตีราคา
    const isInput = opt.display === "input";
    // ติ๊กหลายอย่าง + เป็นคอลัมน์ตาราง อยู่ด้วยกันไม่ได้ — ราคาต่อคอลัมน์อิงตัวเลือกเดียวเท่านั้น
    const tableBlocked = (multi || isInput) && !isDriver;
    const askOn = !!opt.askPrice;
    const setOpt = (patchObj: Partial<DraftOption>) =>
      patch({ options: draft.options.map((o, i) => (i === gi ? { ...o, ...patchObj } : o)) });
    return (
      <>
        <div className="inline-flex overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
          {!isInput && (
          <>
          <button
            type="button"
            disabled={tableBlocked}
            title={
              tableBlocked
                ? "กลุ่มนี้ตั้งเป็น ☑ ติ๊กหลายอย่าง — เป็นคอลัมน์ตารางราคาไม่ได้ (เปลี่ยนเป็นปุ่มแยก/dropdown ก่อน)"
                : "ราคาของกลุ่มนี้อยู่ในตารางราคา — ทุกตัวเลือกต้องมีราคาในตาราง ไม่งั้นหน้าร้านซ่อนตัวนั้น"
            }
            onClick={() => {
              if (isDriver) return;
              setOpt({ askPrice: false });
              toggleDriver(opt.label);
            }}
            className={`px-2.5 py-1 text-[11px] font-semibold transition ${
              isDriver && !askOn
                ? "bg-amber-500 text-white"
                : tableBlocked
                  ? "bg-white text-slate-300"
                  : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            📊 ในตารางราคา
          </button>
          <button
            type="button"
            title="ราคาบวกเพิ่มต่อตัวเลือก กรอกที่ช่อง +฿ ของแต่ละตัวเลือก — ไม่ต้องมีในตารางราคา"
            onClick={() => {
              setOpt({ askPrice: false });
              if (isDriver) void confirmDropDriver(opt.label, "ย้ายไปคิดราคาที่ช่อง +฿ ของแต่ละตัวเลือกแทน");
            }}
            className={`px-2.5 py-1 text-[11px] font-semibold transition ${
              !isDriver && !askOn ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            +฿ ที่ตัวเลือกเอง
          </button>
          </>
          )}
          {/*
            💬 งานสั่งทำ — ราคาไม่มีในตารางและตั้งล่วงหน้าไม่ได้ ต้องให้แอดมินตีให้หลังเห็นสเปก
            เลือกอันนี้แล้วหน้าร้านขึ้น "รอแอดมินตีราคา" แต่ลูกค้ายังกดสั่งไว้ก่อนได้ตามปกติ
          */}
          <button
            type="button"
            title="ใช้กลุ่มนี้แล้ว = งานสั่งทำ ราคาต้องให้แอดมินตีให้ — หน้าร้านขึ้น “รอแอดมินตีราคา” ลูกค้ากดสั่งไว้ก่อนแล้วคุยกันทางแชท"
            onClick={async () => {
              if (askOn) return setOpt({ askPrice: false });
              // เป็นคอลัมน์ตารางราคาอยู่ = ต้องถอดออกก่อน ไม่งั้นตารางเหลือคอลัมน์ที่ไม่มีวันถูกใช้
              if (isDriver && !(await confirmDropDriver(opt.label, "ราคากลุ่มนี้ให้แอดมินตีทีหลัง ไม่ได้อยู่ในตาราง"))) return;
              setOpt({ askPrice: true });
            }}
            className={`px-2.5 py-1 text-[11px] font-semibold transition ${
              askOn ? "bg-emerald-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            💬 ให้แอดมินตีราคา
          </button>
        </div>
        {askOn && (
          <span className="text-[11px] font-semibold text-emerald-700">
            หน้าร้านขึ้น &ldquo;รอแอดมินตีราคา&rdquo; · ลูกค้ากดสั่งไว้ก่อนได้ แล้วคุยกันทางแชท
          </span>
        )}
        {driverUndo?.label === opt.label && (
          <button
            type="button"
            onClick={undoDropDriver}
            className="rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
          >
            ↩︎ เลิกทำ — คืนตารางราคาเดิม
          </button>
        )}
      </>
    );
  }

  /**
   * ปุ่มเลือก "แสดงหน้าร้าน" ของกลุ่มตัวเลือก — ปุ่มแยก / dropdown (เลือกได้ 1 อย่าง) · ☑ ติ๊กหลายอย่าง
   * กลุ่มที่เป็นแกนตารางราคา (คอลัมน์) ติ๊กหลายอย่างไม่ได้ — กดแล้วถามก่อนถอดออกจากตารางให้
   */
  function displayModeRow(gi: number, opt: DraftOption) {
    const isDriver = draft.pricing.driverLabels.includes(opt.label);
    const MODES = [
      { id: "pills", text: "▭ ปุ่มแยก", tip: "ปุ่มเรียงกัน เลือกได้ 1 อย่าง" },
      { id: "dropdown", text: "▾ dropdown", tip: "เมนูเลื่อน เลือกได้ 1 อย่าง (เหมาะกับตัวเลือกเยอะ)" },
      {
        id: "multi",
        text: "☑ ติ๊กหลายอย่าง",
        tip: isDriver
          ? "ลูกค้าติ๊กได้หลายอย่างพร้อมกัน · กลุ่มนี้เป็นคอลัมน์ตารางราคาอยู่ — กดแล้วระบบจะถามก่อนเอาออกจากตาราง (ราคาย้ายไปกรอกที่ +฿ ของแต่ละตัวเลือก)"
          : "ลูกค้าติ๊กได้หลายอย่างพร้อมกัน (หรือไม่ติ๊กเลย) · +฿ บวกรวมทุกตัวที่ติ๊ก",
      },
      {
        id: "input",
        text: "✍️ ช่องกรอก",
        tip: "ไม่มีรายการให้เลือก — ลูกค้าพิมพ์ค่าเอง (เช่น ขนาดงานสั่งทำ) · ไม่มีราคาในตัว ใช้คู่กับ 💬 ให้แอดมินตีราคา",
      },
    ] as const;
    const setOpt = (patchObj: Partial<DraftOption>) =>
      patch({ options: draft.options.map((o, i) => (i === gi ? { ...o, ...patchObj } : o)) });
    return (
      <>
        <div className="inline-flex overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              title={mode.tip}
              onClick={async () => {
                // ติ๊กหลายอย่างกับคอลัมน์ตารางราคาอยู่ด้วยกันไม่ได้ (ราคาต่อคอลัมน์อิงตัวเลือกเดียว)
                // — ไม่ปิดปุ่มทิ้งไว้ให้งง แต่ถามแล้วถอดแกนให้เลย
                if (
                  mode.id === "multi" &&
                  isDriver &&
                  !(await confirmDropDriver(opt.label, "ติ๊กหลายอย่างพร้อมกันแล้วตารางหาราคาต่อคอลัมน์ไม่เจอ"))
                )
                  return;
                setOpt({ display: mode.id });
              }}
              className={`px-2.5 py-1 text-[11px] font-semibold transition ${
                opt.display === mode.id ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {mode.text}
            </button>
          ))}
        </div>
        {/* ช่อง "ระบุจำนวน" ตั้งรายตัวที่แถวตัวเลือกด้านล่าง — บรรทัดนี้แค่บอกทาง */}
        {opt.display === "multi" && (
          <span className="text-[11px] font-semibold text-slate-400">
            {choiceQtyVisible(opt)
              ? "🔢 ให้ลูกค้าระบุจำนวน — ติ๊กที่ตัวเลือกทีละตัวด้านล่าง"
              : "🔢 อยากให้ลูกค้าระบุจำนวน — ติ๊กสวิตช์ 🔢 ด้านล่างก่อน"}
          </span>
        )}

      </>
    );
  }

  /**
   * แถวตั้งค่าช่องกรอก (กลุ่ม display: 'input') — ชนิดค่า/หน่วย/ช่วงที่ยอมรับ/ข้อความช่วย
   * เขียนเป็นฟังก์ชันคืน JSX (ไม่ใช่คอมโพเนนต์ย่อย) เพื่อไม่ให้ช่องกรอกถูก remount ทุกครั้งที่พิมพ์
   */
  function inputSpecRow(gi: number, opt: DraftOption) {
    const setOpt = (patchObj: Partial<DraftOption>) =>
      patch({ options: draft.options.map((o, i) => (i === gi ? { ...o, ...patchObj } : o)) });
    const kind = opt.inKind ?? "number";
    const KINDS = [
      { id: "number", text: "123 ตัวเลข", tip: "รับเฉพาะตัวเลข ตรวจช่วงต่ำสุด/สูงสุดได้ (เช่น ขนาดเป็นเซนติเมตร)" },
      { id: "text", text: "Aa ข้อความสั้น", tip: "ข้อความบรรทัดเดียว เช่น ข้อความที่ต้องการสลัก" },
      { id: "textarea", text: "¶ ข้อความยาว", tip: "หลายบรรทัด เช่น รายละเอียดงานที่อยากให้ทำ" },
    ] as const;
    return (
      <div className="mt-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-600">✍️ ช่องกรอก</span>
          <div className="inline-flex overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                title={k.tip}
                onClick={() => setOpt({ inKind: k.id })}
                className={`px-2.5 py-1 text-[11px] font-semibold transition ${
                  kind === k.id ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {k.text}
              </button>
            ))}
          </div>
          <label
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-500"
            title="ไม่ติ๊ก = ลูกค้าไม่กรอกก็กดสั่งได้"
          >
            <input
              type="checkbox"
              checked={!opt.inOptional}
              onChange={(e) => setOpt({ inOptional: !e.target.checked })}
              className="h-3.5 w-3.5 accent-slate-700"
            />
            บังคับกรอก
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          {kind === "number" && (
            <>
              <label className="text-[11px] font-semibold text-slate-500">
                หน่วย
                <select
                  value={opt.inUnit ?? ""}
                  onChange={(e) => setOpt({ inUnit: e.target.value })}
                  className="mt-1 block w-28 rounded-lg bg-white px-2 py-1.5 text-xs ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  aria-label={`หน่วยของช่องกรอก ${opt.label || gi + 1}`}
                >
                  <option value="">— ไม่มี —</option>
                  {units.map((u) => (
                    <option key={u.label} value={u.label}>{u.label}</option>
                  ))}
                  {/* หน่วยที่ตั้งไว้แต่ไม่มีในคลังแล้ว ต้องไม่หายจากเมนู */}
                  {(opt.inUnit ?? "") !== "" && !units.some((u) => u.label === opt.inUnit) && (
                    <option value={opt.inUnit}>{opt.inUnit}</option>
                  )}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-slate-500">
                ต่ำสุด
                <input
                  value={opt.inMin ?? ""}
                  onChange={(e) => setOpt({ inMin: e.target.value.replace(/[^\d.]/g, "") })}
                  inputMode="decimal"
                  placeholder="—"
                  className="mt-1 block w-20 rounded-lg bg-white px-2 py-1.5 text-center text-xs ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  aria-label={`ค่าต่ำสุดของช่องกรอก ${opt.label || gi + 1}`}
                />
              </label>
              <label className="text-[11px] font-semibold text-slate-500">
                สูงสุด
                <input
                  value={opt.inMax ?? ""}
                  onChange={(e) => setOpt({ inMax: e.target.value.replace(/[^\d.]/g, "") })}
                  inputMode="decimal"
                  placeholder="—"
                  className="mt-1 block w-20 rounded-lg bg-white px-2 py-1.5 text-center text-xs ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  aria-label={`ค่าสูงสุดของช่องกรอก ${opt.label || gi + 1}`}
                />
              </label>
            </>
          )}
          <label className="text-[11px] font-semibold text-slate-500">
            ตัวอย่างในช่อง
            <input
              value={opt.inPlaceholder ?? ""}
              onChange={(e) => setOpt({ inPlaceholder: e.target.value })}
              placeholder={kind === "number" ? "2.5" : "เช่น ข้อความที่ต้องการ"}
              className="mt-1 block w-32 rounded-lg bg-white px-2 py-1.5 text-xs ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
              aria-label={`ข้อความตัวอย่างของช่องกรอก ${opt.label || gi + 1}`}
            />
          </label>
          <label className="min-w-[12rem] flex-1 text-[11px] font-semibold text-slate-500">
            คำอธิบายใต้ช่อง (ลูกค้าเห็น)
            <input
              value={opt.inHint ?? ""}
              onChange={(e) => setOpt({ inHint: e.target.value })}
              placeholder="เช่น วัดจากขอบล่างถึงปลายบนสุด"
              className="mt-1 block w-full rounded-lg bg-white px-2 py-1.5 text-xs ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
              aria-label={`คำอธิบายของช่องกรอก ${opt.label || gi + 1}`}
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          ลูกค้าเห็นเป็นช่องให้พิมพ์ค่าเอง · ค่าที่กรอกติดไปกับตะกร้า → ออเดอร์ → ใบงาน เหมือนตัวเลือกกลุ่มอื่น
          {kind === "number" && (opt.inUnit ?? "") && <> (เก็บเป็น &ldquo;{opt.inPlaceholder || "2.5"} {opt.inUnit}&rdquo;)</>}
        </p>
      </div>
    );
  }

  /**
   * แถวตั้ง "ค่าธรรมเนียมช่วงสั่งน้อย" ของกลุ่มตัวเลือก (เช่น ปลีก 1-10 ชิ้น เลือกตะขอ +10/ชิ้น)
   * เขียนเป็นฟังก์ชันคืน JSX (ไม่ใช่คอมโพเนนต์ย่อย) เพื่อไม่ให้ช่องกรอกถูก remount ทุกครั้งที่พิมพ์
   */
  /**
   * แถวเงื่อนไข "แสดงเมื่อ" ของกลุ่มตัวเลือก — โชว์กลุ่มนี้เฉพาะตอนกลุ่มอื่น/เรทราคาเลือกค่าที่กำหนด
   * แยกออกมาเป็นฟังก์ชันของตัวเอง เพราะใช้ทั้งในแผงตัวเลือกสินค้าและแผงช่องกรอก (งานสั่งทำ)
   */
  function showWhenBlock(gi: number, opt: DraftOption) {
    const setOpt = (patchObj: Partial<DraftOption>) =>
      patch({ options: draft.options.map((o, i) => (i === gi ? { ...o, ...patchObj } : o)) });
    // "เรทราคา" ใช้เป็นเงื่อนไขได้เหมือนกลุ่มตัวเลือกทั่วไป — ค่าที่เลือกคือชื่อเรท
    const rateLabels =
      draft.extraRates.length > 0 || draft.rateMeta.label.trim()
        ? [draft.rateMeta, ...draft.extraRates].map((m, i) => m.label.trim() || `เรทที่ ${i + 1}`)
        : [];
    const choiceNamesOf = (label?: string) =>
      label === RATE_LABEL
        ? rateLabels
        : (draft.options.find((o) => o.label === label)?.choices ?? []).map((c) => c.name).filter((n) => n.trim());
    /** 1 แถวเงื่อนไข — ใช้ทั้งข้อแรกและข้อ "และ" (ต้องตรงพร้อมกันถึงจะแสดง) */
    const row = (which: "" | "Also") => {
      const labelKey = `showWhen${which}Label` as "showWhenLabel" | "showWhenAlsoLabel";
      const choicesKey = `showWhen${which}Choices` as "showWhenChoices" | "showWhenAlsoChoices";
      const curLabel = opt[labelKey];
      const picked = opt[choicesKey] ?? [];
      return (
        <div className="flex flex-wrap items-center gap-1">
          <span
            className="text-[11px] font-bold text-slate-500"
            title={which ? "เงื่อนไขข้อที่สอง — ต้องตรงพร้อมกันข้อแรกถึงจะแสดง" : "ซ่อนทั้งกลุ่มไว้ จนกว่ากลุ่มอื่นจะเลือกค่าที่กำหนด"}
          >
            {which ? "และ" : "👁 แสดงเมื่อ"}
          </span>
          <select
            value={curLabel ?? ""}
            onChange={(e) => setOpt({ [labelKey]: e.target.value, [choicesKey]: [] })}
            className="rounded-lg bg-white px-2 py-1 text-[11px] ring-1 ring-slate-200 focus:outline-none"
            aria-label={which ? "กลุ่มเงื่อนไขข้อที่สอง" : "กลุ่มเงื่อนไขที่ทำให้กลุ่มนี้แสดง"}
          >
            <option value="">{which ? "— ไม่ใช้เงื่อนไขที่สอง —" : "— แสดงตลอด —"}</option>
            {rateLabels.length > 0 && <option value={RATE_LABEL}>{RATE_LABEL}</option>}
            {draft.options
              // กลุ่มช่องกรอกใช้เป็นเงื่อนไขไม่ได้ — ค่าที่ลูกค้าพิมพ์เองไม่มีรายการให้ติ๊กเทียบ
              .filter((o) => o.label && o.label !== opt.label && o.display !== "input")
              .map((o) => (
                <option key={o.label} value={o.label}>{o.label}</option>
              ))}
          </select>
          {choiceNamesOf(curLabel).map((name) => {
            const sel = picked.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() =>
                  setOpt({ [choicesKey]: sel ? picked.filter((n) => n !== name) : [...picked, name] })
                }
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                  sel ? "bg-indigo-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
                }`}
              >
                {sel ? "✓ " : ""}
                {name.length > 22 ? name.slice(0, 22) + "…" : name}
              </button>
            );
          })}
        </div>
      );
    };
    return (
      <>
        {row("")}
        {/* เงื่อนไขข้อสองโผล่เมื่อตั้งข้อแรกแล้ว (หรือเคยตั้งค้างไว้) — ไม่งั้นรกเปล่า ๆ */}
        {(opt.showWhenLabel || opt.showWhenAlsoLabel) && <div className="mt-1">{row("Also")}</div>}
        {opt.showWhenLabel && (
          <p className="mt-1 rounded-lg bg-white/70 px-2 py-1.5 text-[10px] leading-relaxed text-slate-500 ring-1 ring-slate-200">
            📖 อ่านว่า: “กลุ่ม <b className="font-bold text-indigo-700">{opt.label}</b> จะโผล่ให้ลูกค้าเลือก
            <b className="font-bold"> เฉพาะเมื่อ {opt.showWhenLabel} = ค่าที่ติ๊กไว้</b>
            {opt.showWhenAlsoLabel && (opt.showWhenAlsoChoices ?? []).length > 0 && (
              <b className="font-bold"> และ {opt.showWhenAlsoLabel} = ค่าที่ติ๊กไว้</b>
            )}
            ”
          </p>
        )}
      </>
    );
  }

  /**
   * การ์ดแก้ไข "กลุ่มตัวเลือก" 1 กลุ่ม — ใช้ทั้งแผง 🎛️ ตัวเลือกสินค้า และแผง 📐 งานสั่งทำ
   * (กลุ่มเดียวกันโผล่แค่แผงเดียวเสมอ ตัดสินด้วย DraftOption.madeToOrder — ดู isMadeToOrder)
   */
  function optionGroupCard(opt: DraftOption, gi: number) {
    return opt.presetId ? (
              <div
                key={gi}
                onDragOver={(e) => {
                  if (dragOptRef.current !== null) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragOptRef.current !== null) moveOptionGroup(dragOptRef.current, gi);
                  dragOptRef.current = null;
                  setDragOpt(null);
                }}
                className={`rounded-2xl bg-sky-50/60 p-3 ring-1 ring-sky-200 ${dragOpt === gi ? "opacity-50" : ""}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      draggable
                      onDragStart={() => {
                        dragOptRef.current = gi;
                        setDragOpt(gi);
                      }}
                      onDragEnd={() => {
                        dragOptRef.current = null;
                        setDragOpt(null);
                      }}
                      className="cursor-grab select-none px-1 text-sm text-slate-300 active:cursor-grabbing"
                      title="ลากเพื่อสลับลำดับกลุ่ม"
                      aria-hidden
                    >
                      ⠿
                    </span>
                    <MoveBtns
                      what="กลุ่ม"
                      onUp={() => moveOptionGroup(gi, gi - 1)}
                      onDown={() => moveOptionGroup(gi, gi + 1)}
                      upDisabled={gi === 0}
                      downDisabled={gi === draft.options.length - 1}
                    />
                    {/* กดที่ป้าย = เปิดคลังตัวเลือกอันที่ลิงก์อยู่ (จะได้รู้ว่าลิงก์กับอะไร แก้ที่ไหน) */}
                    <Link
                      href={`/admin/options?id=${encodeURIComponent(opt.presetId ?? "")}`}
                      target="_blank"
                      title={`ลิงก์กับคลัง “${presets.find((p) => p.id === opt.presetId)?.label ?? opt.label}” (รหัส ${opt.presetId}) — กดเพื่อเปิดดู/แก้`}
                      className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700 transition hover:bg-sky-200"
                    >
                      🔗 ลิงก์คลัง ↗
                    </Link>
                    <span className="text-sm font-bold text-slate-800">{opt.label}</span>
                    {/* คลังถูกปิดใช้งาน = กลุ่มนี้ไม่โผล่บนหน้าร้านแล้ว (ลิงก์ยังอยู่ เปิดกลับได้ที่หน้าคลัง) */}
                    {presets.find((p) => p.id === opt.presetId)?.hidden && (
                      <span
                        className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600 ring-1 ring-rose-200"
                        title="คลังนี้ถูกปิดใช้งานที่หน้าคลังตัวเลือก — กลุ่มนี้จึงไม่แสดงบนหน้าร้าน (เปิดกลับได้ที่ /admin/options)"
                      >
                        ⛔ คลังปิดอยู่ · ไม่โชว์หน้าร้าน
                      </span>
                    )}
                    {/* เปลี่ยนไปลิงก์คลังอื่นได้เลย ไม่ต้องลบกลุ่มแล้วแทรกใหม่ */}
                    <select
                      value=""
                      onChange={(e) => {
                        const id = e.target.value;
                        e.target.value = "";
                        if (id) void relinkPreset(gi, id);
                      }}
                      title="เปลี่ยนไปลิงก์กับคลังตัวเลือกอันอื่น"
                      aria-label={`เปลี่ยนคลังของกลุ่ม ${opt.label}`}
                      className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    >
                      <option value="">🔄 เปลี่ยนคลัง…</option>
                      {presets
                        .filter((p) => !p.hidden || p.id === opt.presetId)
                        .map((p) => {
                          const usedElsewhere = draft.options.some((o, i) => i !== gi && o.presetId === p.id);
                          return (
                            <option key={p.id} value={p.id} disabled={usedElsewhere || p.id === opt.presetId}>
                              {p.label} ({p.choices.length})
                              {p.id === opt.presetId ? " · ใช้อยู่" : usedElsewhere ? " · ลิงก์แล้วในกลุ่มอื่น" : ""}
                            </option>
                          );
                        })}
                    </select>
                    <span className="text-xs text-slate-400">
                      {opt.choices.length} ตัวเลือก
                      {/* บอกว่าตัวเลือกในกลุ่มนี้มีอะไรบ้าง (ตัวอย่าง 4 ตัวแรก) โดยไม่ต้องกางกลุ่ม */}
                      {opt.choices.length > 0 && (
                        <span className="ml-1 text-slate-300">
                          · {opt.choices.slice(0, 4).map((c) => c.name).filter(Boolean).join(" · ")}
                          {opt.choices.length > 4 ? " …" : ""}
                        </span>
                      )}
                    </span>
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
                            i === gi
                              ? { label: o.label, choices: o.choices, display: o.display }
                              : o
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
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-400">แสดงหน้าร้าน:</span>
                  {displayModeRow(gi, opt)}
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
                {smallFeeRow(gi, opt)}
                <p className="mt-2 text-[11px] text-sky-600">
                  แก้ตัวเลือกกลุ่มนี้ได้ที่{" "}
                  <Link href="/admin/options" className="font-semibold underline">คลังตัวเลือก</Link>{" "}
                  — เปลี่ยนที่เดียว สินค้าที่ลิงก์อัปเดตหมด
                </p>
                </>
                )}
              </div>
            ) : (
            <div
              key={gi}
              onDragOver={(e) => {
                if (dragOptRef.current !== null) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragOptRef.current !== null) moveOptionGroup(dragOptRef.current, gi);
                dragOptRef.current = null;
                setDragOpt(null);
              }}
              className={`rounded-2xl bg-white p-3 ring-1 ring-slate-200 ${dragOpt === gi ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span
                  draggable
                  onDragStart={() => {
                    dragOptRef.current = gi;
                    setDragOpt(gi);
                  }}
                  onDragEnd={() => {
                    dragOptRef.current = null;
                    setDragOpt(null);
                  }}
                  className="cursor-grab select-none px-1 text-sm text-slate-300 active:cursor-grabbing"
                  title="ลากเพื่อสลับลำดับกลุ่ม"
                  aria-hidden
                >
                  ⠿
                </span>
                <MoveBtns
                  what="กลุ่ม"
                  onUp={() => moveOptionGroup(gi, gi - 1)}
                  onDown={() => moveOptionGroup(gi, gi + 1)}
                  upDisabled={gi === 0}
                  downDisabled={gi === draft.options.length - 1}
                />
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
              {/* พับกลุ่มไว้ก็ยังต้องเห็นว่ามีตัวเลือกที่หน้าร้านซ่อนอยู่ ไม่ต้องกางทีละกลุ่มหา */}
              {pricelessCount(opt) > 0 && (
                <div className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-rose-700 ring-1 ring-rose-200">
                  ⚠ {pricelessCount(opt)} ตัวเลือกในกลุ่มนี้ยังไม่ได้ใส่ราคาในตารางราคา →
                  หน้าร้านจะไม่แสดงตัวเลือกนั้น
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPricingOpen(true)}
                      className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
                    >
                      เปิดตารางราคาไปกรอก
                    </button>
                    {/* กลุ่มที่ราคาไม่ได้อยู่ในตาราง (คิดเป็น +฿ ต่อตัวเลือก) — ไม่ควรเป็นคอลัมน์ตารางตั้งแต่แรก */}
                    <button
                      type="button"
                      onClick={() => {
                        void confirmDropDriver(opt.label, "ถ้าราคาของกลุ่มนี้ไม่ได้อยู่ในตาราง ก็ไม่ต้องเป็นคอลัมน์");
                      }}
                      className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                    >
                      ราคาอยู่ที่ตัวเลือกเอง — เอาออกจากตารางราคา
                    </button>
                  </div>
                </div>
              )}
              {!isOptFolded(gi) && (
              <>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-400">ราคา:</span>
                {priceSourceRow(gi, opt)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-400">แสดงหน้าร้าน:</span>
                {displayModeRow(gi, opt)}
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
              {smallFeeRow(gi, opt)}
              <div className="mt-2 space-y-1.5">
                {opt.choices.map((ch, ci) => (
                  <div key={ci} className="flex items-center gap-2">
                    <span className="w-4 text-center text-xs text-slate-300">{ci + 1}</span>
                    <MoveBtns
                      size="xs"
                      what="ตัวเลือก"
                      onUp={() => moveOptionChoice(gi, ci, ci - 1)}
                      onDown={() => moveOptionChoice(gi, ci, ci + 1)}
                      upDisabled={ci === 0}
                      downDisabled={ci === opt.choices.length - 1}
                    />
                    <input
                      value={ch.name}
                      onChange={(e) => renameOptionChoice(gi, ci, e.target.value)}
                      placeholder="ชื่อตัวเลือก"
                      className={`flex-1 ${smallInputCls}`}
                      aria-label={`ตัวเลือกที่ ${ci + 1} ของกลุ่ม ${opt.label || gi + 1}`}
                    />
                    {/* ชื่อซ้ำกับตัวอื่นในกลุ่ม = ใช้ช่องราคาคอลัมน์เดียวกัน หน้าร้านก็ขึ้นซ้ำสองบรรทัด */}
                    {ch.name.trim() &&
                      opt.choices.some((o, j) => j !== ci && o.name.trim() === ch.name.trim()) && (
                        <span
                          className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200"
                          title="ชื่อซ้ำกับตัวเลือกอื่นในกลุ่มนี้ — ใช้ช่องราคาคอลัมน์เดียวกัน แยกกันไม่ออก · กดบันทึกแล้วระบบจะเก็บไว้ตัวเดียว (ถ้าตั้งใจให้เป็นคนละแบบ ต้องตั้งชื่อให้ต่างกัน)"
                        >
                          ⚠ ชื่อซ้ำ
                        </span>
                      )}
                    {/* ยังไม่กรอกราคา = หน้าร้านซ่อนตัวเลือกนี้ (สาเหตุยอดฮิตของ "เพิ่มขนาดแล้วหน้าบ้านไม่ขึ้น") */}
                    {(() => {
                      const missing = ratesMissingPrice(opt.label, ch.name);
                      if (!missing.length) return null;
                      const allRates = 1 + draft.extraRates.length;
                      return (
                        <button
                          type="button"
                          onClick={() => setPricingOpen(true)}
                          title={`ตัวเลือกนี้ยังไม่มีราคาใน ${missing.join(" · ")} — หน้าร้านจะไม่แสดงจนกว่าจะกรอกราคา (กดเพื่อเปิดตารางราคา)`}
                          className="shrink-0 rounded-full bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100"
                        >
                          ⚠ ยังไม่ใส่ราคา{allRates > 1 ? ` (${missing.join(", ")})` : ""} · หน้าร้านซ่อน
                        </button>
                      );
                    })()}
                    {/* 🖼 ภาพประจำตัวเลือก — โชว์บนปุ่มหน้าร้าน + กดเลือกแล้วแกลเลอรีสลับไปภาพนี้ */}
                    <label
                      className="shrink-0 cursor-pointer"
                      title="ภาพประจำตัวเลือกนี้ — โชว์เป็นภาพย่อบนปุ่มหน้าร้าน ให้ลูกค้าเห็นหน้าตาแบบนี้ก่อนเลือก"
                    >
                      {ch.imageSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ch.imageSrc}
                          alt={`ภาพของ ${ch.name || `ตัวเลือกที่ ${ci + 1}`}`}
                          className="h-8 w-8 rounded-lg object-cover ring-1 ring-slate-200 hover:ring-amber-300"
                        />
                      ) : (
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-50 text-[13px] text-slate-300 ring-1 ring-slate-200 hover:text-amber-500 hover:ring-amber-300">
                          🖼
                        </span>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        aria-label={`อัปโหลดภาพของตัวเลือกที่ ${ci + 1}`}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (!f) return;
                          const src = await uploadChoiceImage(f);
                          if (src)
                            patch({
                              options: draft.options.map((o, i) =>
                                i === gi
                                  ? { ...o, choices: o.choices.map((c, j) => (j === ci ? { ...c, imageSrc: src } : c)) }
                                  : o
                              ),
                            });
                        }}
                      />
                    </label>
                    {ch.imageSrc && (
                      <button
                        type="button"
                        onClick={() =>
                          patch({
                            options: draft.options.map((o, i) =>
                              i === gi
                                ? { ...o, choices: o.choices.map((c, j) => (j === ci ? { ...c, imageSrc: undefined } : c)) }
                                : o
                            ),
                          })
                        }
                        title="เอาภาพของตัวเลือกนี้ออก"
                        className="shrink-0 rounded-full px-1 text-[11px] font-bold text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                      >
                        ✕
                      </button>
                    )}
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
                    {/*
                      💬 ตัวเลือกนี้ = งานสั่งทำ ให้แอดมินตีราคา (เช่น "แบบที่ 3" ที่ลูกค้าระบุขนาดเอง)
                      ต่างจาก 💬 ระดับกลุ่มตรงที่กลุ่มยังเป็นคอลัมน์ตารางราคาได้ — แบบอื่นในกลุ่มคิดราคาปกติ
                    */}
                    <button
                      type="button"
                      onClick={() =>
                        patch({
                          options: draft.options.map((o, i) =>
                            i === gi
                              ? {
                                  ...o,
                                  choices: o.choices.map((c, j) =>
                                    j === ci ? { ...c, askPrice: !c.askPrice } : c
                                  ),
                                }
                              : o
                          ),
                        })
                      }
                      title="เลือกตัวนี้แล้ว = งานสั่งทำ ราคาให้แอดมินตีให้ (หน้าร้านขึ้น “รอแอดมินตีราคา” · ลูกค้ากดสั่งไว้ก่อนได้)"
                      aria-pressed={!!ch.askPrice}
                      className={`shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-semibold ring-1 transition ${
                        ch.askPrice
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : "bg-white text-slate-300 ring-slate-200 hover:text-emerald-600 hover:ring-emerald-200"
                      }`}
                    >
                      💬 ตีราคา
                    </button>
                    {/*
                      ให้ลูกค้าระบุจำนวนของตัวเลือกนี้ (เช่น เพิ่มสาย 2 เส้น = +฿ ของสาย × 2) — เฉพาะกลุ่มติ๊กหลายอย่าง
                      ต้องติ๊ก 📐 ที่หัวกลุ่มก่อนถึงกางช่องนี้ (ดู choiceQtyVisible)
                    */}
                    {choiceQtyVisible(opt) && (
                      <label
                        className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold ring-1 ${
                          ch.qty ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-white text-slate-400 ring-slate-200"
                        }`}
                        title="ลูกค้าติ๊กตัวนี้แล้วระบุจำนวนได้ เช่น เพิ่มสาย 2 เส้น → +฿ ของตัวนี้คูณ 2 (ในตะกร้า/ใบงานขึ้นเป็น “ชื่อตัวเลือก ×2”)"
                      >
                        <input
                          type="checkbox"
                          checked={!!ch.qty}
                          onChange={(e) =>
                            patch({
                              options: draft.options.map((o, i) =>
                                i === gi
                                  ? {
                                      ...o,
                                      choices: o.choices.map((c, j) =>
                                        j === ci
                                          ? { ...c, qty: e.target.checked, ...(e.target.checked ? {} : { qtyMax: "" }) }
                                          : c
                                      ),
                                    }
                                  : o
                              ),
                            })
                          }
                          className="h-3.5 w-3.5 accent-amber-500"
                        />
                        🔢 ระบุจำนวน
                        {ch.qty && (
                          <>
                            <span className="text-slate-400">· สูงสุด</span>
                            <input
                              value={ch.qtyMax ?? ""}
                              onChange={(e) =>
                                patch({
                                  options: draft.options.map((o, i) =>
                                    i === gi
                                      ? {
                                          ...o,
                                          choices: o.choices.map((c, j) =>
                                            j === ci ? { ...c, qtyMax: e.target.value } : c
                                          ),
                                        }
                                      : o
                                  ),
                                })
                              }
                              inputMode="numeric"
                              placeholder="99"
                              className="w-11 rounded-lg bg-white px-1 py-0.5 text-center text-[11px] text-slate-600 ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                              aria-label={`จำนวนสูงสุดของตัวเลือกที่ ${ci + 1}`}
                            />
                          </>
                        )}
                      </label>
                    )}
                    {/* ชิ้นที่ได้ต่อ 1 หน่วยสั่ง (📐 ชิ้น/หน่วย) ย้ายไปกรอกในตารางราคาแล้ว — คอลัมน์แรกข้างชื่อตัวเลือก */}
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
    );
  }

  /**
   * 📐 แผงงานสั่งทำ — รวมทุกอย่างที่เกี่ยวกับ "งานที่ลูกค้ากำหนดเอง" ไว้ที่เดียว
   *
   * มีได้ 2 ชนิด: ✍️ ช่องกรอก (ลูกค้าพิมพ์ค่าเอง) และกลุ่มตัวเลือกปกติที่ย้ายเข้ามา
   * (เช่น "สีอะคริลิค" ที่ลิงก์คลัง — เป็นตัวเลือกของงานสั่งทำ ไม่ใช่ตัวเลือกมาตรฐาน)
   * ทั้งคู่เก็บใน draft.options เหมือนกลุ่มอื่น ค่าที่ลูกค้าเลือก/กรอกจึงติดไปกับตะกร้า→ออเดอร์→ใบงานเอง
   */
  /**
   * สีประจำหัวข้อในแผงงานสั่งทำ — หัวข้อที่ 1/2/3 ได้คนละสี (แบบที่ 3 ฟ้า · แบบที่ 4 เขียว ฯลฯ)
   * ทั้งแผงเป็นสีเดียวกันหมดแล้วกวาดตาไม่ออกว่าการ์ดไหนของแบบไหน — สีคือสิ่งที่บอกกลุ่ม
   * ⚠️ ห้ามใส่ amber ในชุดนี้ — ramp amber ถูกรีแมปเป็นฟ้าแบรนด์ใน globals.css จะกลายเป็นสีเดียวกับ sky
   */
  const MTO_COLORS = [
    { chip: "bg-sky-600", bar: "border-l-sky-400", count: "text-sky-700" },
    { chip: "bg-rose-500", bar: "border-l-rose-400", count: "text-rose-700" },
    { chip: "bg-emerald-600", bar: "border-l-emerald-400", count: "text-emerald-700" },
    { chip: "bg-orange-500", bar: "border-l-orange-400", count: "text-orange-700" },
    { chip: "bg-indigo-600", bar: "border-l-indigo-400", count: "text-indigo-700" },
    { chip: "bg-teal-600", bar: "border-l-teal-400", count: "text-teal-700" },
  ] as const;

  function madeToOrderPanel() {
    // เก็บ index จริงใน draft.options ไว้ด้วย — ปุ่มแก้/ลบ/สลับลำดับต้องอ้างตำแหน่งจริง
    const items = draft.options.map((o, gi) => ({ o, gi })).filter(({ o }) => isMadeToOrder(o));
    const setOpt = (gi: number, patchObj: Partial<DraftOption>) =>
      patch({ options: draft.options.map((o, i) => (i === gi ? { ...o, ...patchObj } : o)) });
    /** สลับลำดับกับรายการข้าง ๆ "ในหัวข้อเดียวกัน" — ลูกค้าเห็นเรียงตามนี้ (ตัวหน้า → ตัวหลัง → ฐาน) */
    const swap = (a: { gi: number }, b: { gi: number } | undefined) => {
      if (!b) return;
      const next = [...draft.options];
      [next[a.gi], next[b.gi]] = [next[b.gi], next[a.gi]];
      patch({ options: next });
    };
    /**
     * แยกหัวข้อตาม "แสดงเมื่อ" — ของแบบที่ 3 กับแบบที่ 4 จะได้ไม่กองรวมกันจนหาไม่เจอ
     * รายการที่ไม่ได้ตั้งเงื่อนไข = โผล่ทุกแบบ ไปอยู่หัวข้อแยกท้ายสุด
     */
    const condKey = (o: DraftOption) =>
      `${o.showWhenLabel ?? ""}|${(o.showWhenChoices ?? []).join("+")}|${o.showWhenAlsoLabel ?? ""}|${(o.showWhenAlsoChoices ?? []).join("+")}`;
    // ชื่อเรทมักขึ้นต้นด้วยชื่อสินค้า ("สแตนดี้ตั้งโทรศัพท์ แบบที่ 3") — ตัดออกให้หัวข้อสั้น อ่านง่าย
    const trimName = (v: string) => {
      const n = draft.name.trim();
      return n && v.startsWith(n) ? v.slice(n.length).trim() || v : v;
    };
    const condTitle = (o: DraftOption) => {
      const picked = (o.showWhenChoices ?? []).map(trimName);
      if (!o.showWhenLabel || !picked.length) return "แสดงทุกแบบ (ไม่ได้ตั้งเงื่อนไข)";
      const head = o.showWhenLabel === RATE_LABEL ? picked.join(" + ") : `${o.showWhenLabel} = ${picked.join(" / ")}`;
      const also = (o.showWhenAlsoChoices ?? []).map(trimName);
      return o.showWhenAlsoLabel && also.length ? `${head} · และ ${o.showWhenAlsoLabel} = ${also.join(" / ")}` : head;
    };
    const groups: { key: string; title: string; entries: typeof items }[] = [];
    for (const it of items) {
      const key = condKey(it.o);
      const g = groups.find((x) => x.key === key);
      if (g) g.entries.push(it);
      else groups.push({ key, title: condTitle(it.o), entries: [it] });
    }
    // หัวข้อ "แสดงทุกแบบ" ไว้ท้ายสุดเสมอ — ของเฉพาะแบบสำคัญกว่า ควรเห็นก่อน
    groups.sort((a, b) => Number(a.key.startsWith("|")) - Number(b.key.startsWith("|")));
    const movable = draft.options.filter((o) => !isMadeToOrder(o) && o.label.trim());
    return (
      <div className="mt-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-[14rem] flex-1">
            <h3 className="text-xs font-bold text-slate-700">✍️ ตัวเลือก/ช่องกรอกของงานสั่งทำ</h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              ช่องกรอกเพิ่มได้ไม่จำกัด ตั้งชื่อเองได้ทุกช่อง (เช่น “(ตัวหน้า) ขนาด”, “ฐาน”) ·
              ย้ายกลุ่มตัวเลือกปกติเข้ามาได้ด้วย (เช่น สีอะคริลิคที่ลิงก์คลัง) ·
              ตั้ง 👁 แสดงเมื่อ ให้โผล่เฉพาะแบบ/เรทที่ต้องการ
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {/* ย้ายกลุ่มที่ตั้งไว้แล้วในแผง 🎛️ เข้ามา — ไม่ต้องลบแล้วสร้างใหม่ให้เสียของ */}
            {movable.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const label = e.target.value;
                  e.target.value = "";
                  const gi = draft.options.findIndex((o) => o.label === label);
                  if (gi >= 0) setOpt(gi, { madeToOrder: true });
                }}
                title="ย้ายกลุ่มตัวเลือกที่มีอยู่แล้วเข้ามาอยู่ในงานสั่งทำ (ตัวเลือก/ราคา/เงื่อนไขเดิมไม่หาย)"
                aria-label="ย้ายกลุ่มตัวเลือกเข้ามาที่งานสั่งทำ"
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-fuchsia-300"
              >
                <option value="">📥 ย้ายกลุ่มจาก 🎛️ เข้ามา…</option>
                {movable.map((o) => (
                  <option key={o.label} value={o.label}>
                    {o.label} ({o.choices.length})
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() =>
                patch({
                  options: [
                    ...draft.options,
                    { label: "", choices: [], display: "input", inKind: "number", askPrice: true },
                  ],
                })
              }
              className="rounded-full bg-fuchsia-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-fuchsia-700"
            >
              ＋ เพิ่มช่องกรอก
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="mt-2.5 rounded-xl bg-white/70 px-3 py-2.5 text-[11px] leading-relaxed text-slate-500 ring-1 ring-slate-200">
            ยังไม่มีอะไรในงานสั่งทำ — กด <b className="font-bold text-fuchsia-700">＋ เพิ่มช่องกรอก</b> เพื่อให้ลูกค้าระบุขนาด/รายละเอียดเอง
            แล้วให้แอดมินตีราคาให้ทีหลัง
          </p>
        ) : (
          <div className="mt-2.5 space-y-4">
            {groups.map((g, gk) => {
              const c = MTO_COLORS[gk % MTO_COLORS.length];
              return (
              <div key={g.key}>
                {/* หัวข้อบอกว่ากลุ่มด้านล่างนี้เป็นของแบบไหน — คนละสีกัน กวาดตาแล้วแยกออกทันที */}
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-[11px] font-bold text-white ${c.chip}`}>
                    🎯 {g.title}
                  </span>
                  <span className={`text-[11px] font-semibold ${c.count}`}>{g.entries.length} รายการ</span>
                </div>
                <div className="space-y-2.5">
            {g.entries.map(({ o, gi }, k) => (
              // แถบสีซ้ายการ์ด = สีของหัวข้อ เลื่อนดูยาว ๆ ก็ยังรู้ว่ากำลังอยู่ในแบบไหน
              <div key={gi} className={`rounded-2xl border-l-4 bg-white p-3 ring-1 ring-slate-200 ${c.bar}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="w-4 text-center text-xs font-bold text-slate-300">{k + 1}</span>
                  <MoveBtns
                    size="xs"
                    what="รายการ"
                    onUp={() => swap(g.entries[k], g.entries[k - 1])}
                    onDown={() => swap(g.entries[k], g.entries[k + 1])}
                    upDisabled={k === 0}
                    downDisabled={k === g.entries.length - 1}
                  />
                  {o.display === "input" ? (
                    <>
                      <input
                        value={o.label}
                        onChange={(e) => renameOptionGroup(gi, e.target.value)}
                        placeholder="ชื่อช่อง เช่น (ตัวหน้า) ขนาด, ฐาน, ข้อความที่ต้องการสลัก"
                        className={`flex-1 font-bold ${inputCls}`}
                        aria-label={`ชื่อช่องกรอกที่ ${k + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => patch({ options: draft.options.filter((_, i) => i !== gi) })}
                        className="shrink-0 rounded-full bg-rose-50 px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-100"
                      >
                        🗑 ลบ
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 truncate text-xs font-bold text-slate-500">
                        🎛️ กลุ่มตัวเลือกที่ย้ายมา
                      </span>
                      {/* ย้ายกลับได้ ไม่ใช่ทางเดียว — กดผิดแล้วไม่ต้องมานั่งตั้งใหม่ */}
                      <button
                        type="button"
                        onClick={() => setOpt(gi, { madeToOrder: false })}
                        title="ย้ายกลุ่มนี้กลับไปอยู่ในแผง 🎛️ ตัวเลือกสินค้า (ข้อมูลไม่หาย)"
                        className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
                      >
                        ↩︎ ย้ายกลับ 🎛️
                      </button>
                    </>
                  )}
                </div>
                {o.display === "input" ? (
                  <>
                    {!o.label.trim() && (
                      <p className="mb-1.5 text-[11px] font-bold text-amber-600">
                        ⚠ ยังไม่ได้ตั้งชื่อช่อง — ช่องที่ไม่มีชื่อจะไม่ถูกบันทึก
                      </p>
                    )}
                    {inputSpecRow(gi, o)}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-400">ราคา:</span>
                      {priceSourceRow(gi, o)}
                    </div>
                    <div className="mt-2 rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
                      {showWhenBlock(gi, o)}
                    </div>
                  </>
                ) : (
                  // กลุ่มตัวเลือกปกติ — ใช้การ์ดตัวเดียวกับแผง 🎛️ จะได้แก้ได้ครบเหมือนกันทุกอย่าง
                  optionGroupCard(o, gi)
                )}
              </div>
            ))}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  /** กลุ่มนี้เป็นของ "งานสั่งทำ" ไหม — ช่องกรอกเป็นเสมอ · กลุ่มตัวเลือกปกติต้องกดย้ายเข้ามาเอง */
  function isMadeToOrder(o: DraftOption): boolean {
    return o.display === "input" || o.madeToOrder === true;
  }

  function smallFeeRow(gi: number, opt: DraftOption) {
    const feeNum = Number(opt.smallFee);
    // ติดลบ = ลดให้ต่อชิ้นในช่วงนั้น (คำอธิบาย/ป้ายในแถวนี้พลิกตามเครื่องหมาย)
    const minus = Number.isFinite(feeNum) && feeNum < 0;
    const on = (Number.isFinite(feeNum) && feeNum !== 0) || Number(opt.smallUpTo) > 0;
    const setOpt = (patchObj: Partial<DraftOption>) =>
      patch({ options: draft.options.map((o, i) => (i === gi ? { ...o, ...patchObj } : o)) });
    const whenGroup = draft.options.find((o) => o.label === opt.smallWhenLabel);
    // "เรทราคา" ใช้เป็นเงื่อนไข "แสดงเมื่อ" ได้เหมือนกลุ่มตัวเลือกทั่วไป — ค่าที่เลือกคือชื่อเรท
    // (ผ้าเชียร์: ค่ากว้างเกินขนาดคนละราคาระหว่างเรท 1 ด้าน กับ 2 ด้าน)
    const rateLabels =
      draft.extraRates.length > 0 || draft.rateMeta.label.trim()
        ? [draft.rateMeta, ...draft.extraRates].map((m, i) => m.label.trim() || `เรทที่ ${i + 1}`)
        : [];
    const choiceNamesOf = (label?: string) =>
      label === RATE_LABEL
        ? rateLabels
        : (draft.options.find((o) => o.label === label)?.choices ?? []).map((c) => c.name).filter((n) => n.trim());
    return (
      <div className="mt-2 rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
        <label className="flex cursor-pointer items-center gap-2 text-[11px] font-bold text-slate-600">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) =>
              setOpt(
                e.target.checked
                  ? { smallFee: "10", smallUpTo: "10", smallFree: [], smallWhenLabel: "", smallWhenChoices: [] }
                  : { smallFee: "", smallUpTo: "", smallFree: [], smallWhenLabel: "", smallWhenChoices: [] }
              )
            }
            className="h-3.5 w-3.5 accent-amber-500"
          />
          💰 ค่าธรรมเนียมช่วงสั่งน้อย (เช่น ปลีกเลือกตะขอ บวกชิ้นละ 10 · ใส่ติดลบ = ลดให้)
        </label>
        {on && (
          <div className="mt-1.5 space-y-1.5">
            <p className="rounded-lg bg-white/70 px-2 py-1.5 text-[10px] leading-relaxed text-slate-500 ring-1 ring-slate-200">
              📖 <b className="font-bold text-slate-600">อ่านเป็นประโยคเดียว:</b> “ถ้า
              <span className="font-bold text-teal-700"> [เฉพาะเมื่อ] </span>ตรง และลูกค้าสั่ง
              <span className="font-bold"> ไม่เกิน N ชิ้น</span> → ตัวเลือกในกลุ่มนี้
              <span className="font-bold">{minus ? " ลดให้ชิ้นละ X บาท" : " คิดเหมาชิ้นละ X บาท"}</span> ยกเว้นตัวที่
              <span className="font-bold text-emerald-600"> ติ๊กเขียว</span>”
              <br />
              ตัวอย่างที่ใช้จริง: หนา 3mm · สั่ง 1-10 ชิ้น · เลือกตะขอคิดเหมาชิ้นละ 10 บาท (Z1/Z2 ติ๊กเขียว = ไม่คิด)
              <br />
              💡 คิด<b>แทน</b>ราคาตัวเลือกในกลุ่มนี้ <b>ไม่บวกซ้ำ</b> — ตะขอ C (+฿3) ช่วงปลีกก็คิด ฿10 ไม่ใช่ ฿13 ·
              ตัวที่ติ๊กเขียวไม่โดนค่าธรรมเนียม จึงคิดราคาตัวเลือกตามปกติ · สั่งเกิน N ชิ้นเมื่อไหร่ ค่าธรรมเนียมนี้หายไปเอง
              <br />
              ➖ <b className="font-bold text-slate-600">ใส่ตัวเลขติดลบได้</b> (เช่น −10) = ช่วงนั้น
              <b>ลดให้</b>ชิ้นละ 10 บาท (แบบลบนี้ยัง<b>คิดราคาตัวเลือกตามปกติ</b>แล้วค่อยลด) · ราคาสุทธิไม่ต่ำกว่า 0
            </p>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              สั่งไม่เกิน
              <input
                value={opt.smallUpTo ?? ""}
                onChange={(e) => setOpt({ smallUpTo: e.target.value.replace(/\D/g, "") })}
                inputMode="numeric"
                className="w-14 rounded-lg bg-white px-1.5 py-1 text-center ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="คิดค่าธรรมเนียมเมื่อสั่งไม่เกินกี่ชิ้น"
              />
              ชิ้น · {minus ? "ลดชิ้นละ" : "บวกชิ้นละ"}
              <input
                value={opt.smallFee ?? ""}
                /* ยอมให้ใส่ − นำหน้า (ลดให้) — ขีดกลาง/ลบยาวที่คีย์บอร์ดไทยพิมพ์มาก็แปลงเป็น - ให้ */
                onChange={(e) =>
                  setOpt({
                    smallFee: e.target.value
                      .replace(/[–—−]/g, "-")
                      .replace(/[^\d.-]/g, "")
                      .replace(/(?!^)-/g, ""),
                  })
                }
                inputMode="text"
                placeholder="10"
                title="ใส่ติดลบได้ เช่น -10 = ลดให้ชิ้นละ 10 บาทในช่วงนี้"
                className={`w-16 rounded-lg bg-white px-1.5 py-1 text-center ring-1 focus:outline-none focus:ring-2 focus:ring-amber-300 ${
                  minus ? "font-bold text-emerald-700 ring-emerald-300" : "ring-slate-200"
                }`}
                aria-label="ค่าธรรมเนียมต่อชิ้น (ติดลบ = ลดให้)"
              />
              บาท
              {minus && <span className="font-bold text-emerald-600">(ลดให้)</span>}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-slate-400" title="ติ๊กเขียว = ตัวเลือกนั้นไม่ต้องจ่ายค่าธรรมเนียมนี้">
                🟢 ติ๊ก = <b className="font-bold text-emerald-600">ไม่คิด</b>ค่าธรรมเนียม ·{" "}
                <span className="text-slate-300">ไม่ติ๊ก = คิดตามที่ตั้งไว้</span>
              </span>
              {opt.choices.filter((c) => c.name.trim()).map((c) => {
                const off = (opt.smallFree ?? []).includes(c.name);
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() =>
                      setOpt({
                        smallFree: off
                          ? (opt.smallFree ?? []).filter((n) => n !== c.name)
                          : [...(opt.smallFree ?? []), c.name],
                      })
                    }
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                      off ? "bg-emerald-500 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {off ? "✓ " : ""}
                    {c.name.length > 22 ? c.name.slice(0, 22) + "…" : c.name}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-slate-400">เฉพาะเมื่อ:</span>
              <select
                value={opt.smallWhenLabel ?? ""}
                onChange={(e) => setOpt({ smallWhenLabel: e.target.value, smallWhenChoices: [] })}
                className="rounded-lg bg-white px-2 py-1 text-[11px] ring-1 ring-slate-200 focus:outline-none"
                aria-label="จำกัดค่าธรรมเนียมเฉพาะเมื่อกลุ่มนี้ถูกเลือก"
              >
                <option value="">— ทุกกรณี —</option>
                {draft.options
                  .filter((o) => o.label && o.label !== opt.label && o.display !== "input")
                  .map((o) => (
                    <option key={o.label} value={o.label}>{o.label}</option>
                  ))}
              </select>
              {whenGroup?.choices.filter((c) => c.name.trim()).map((c) => {
                const sel = (opt.smallWhenChoices ?? []).includes(c.name);
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() =>
                      setOpt({
                        smallWhenChoices: sel
                          ? (opt.smallWhenChoices ?? []).filter((n) => n !== c.name)
                          : [...(opt.smallWhenChoices ?? []), c.name],
                      })
                    }
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                      sel ? "bg-teal-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {sel ? "✓ " : ""}
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* ── ฟรีเมื่อ: ตัวเลือกไหนไม่คิด +฿ เมื่อกลุ่มอื่นเลือกค่านี้ (เช่น ห่วงฟรีเฉพาะหนา 3mm) ── */}
        <div className="mt-1.5 border-t border-dashed border-slate-200 pt-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] font-bold text-slate-500" title="ยกเว้นราคา +฿ ของตัวเลือกบางตัว เมื่อกลุ่มอื่นเลือกค่าที่กำหนด">
              🎁 ฟรีเมื่อ
            </span>
            <select
              value={opt.freeWhenLabel ?? ""}
              onChange={(e) => setOpt({ freeWhenLabel: e.target.value, freeWhenChoices: [] })}
              className="rounded-lg bg-white px-2 py-1 text-[11px] ring-1 ring-slate-200 focus:outline-none"
              aria-label="กลุ่มเงื่อนไขของตัวเลือกที่ได้ฟรี"
            >
              <option value="">— ไม่ใช้ —</option>
              {draft.options
                .filter((o) => o.label && o.label !== opt.label && o.display !== "input")
                .map((o) => (
                  <option key={o.label} value={o.label}>{o.label}</option>
                ))}
            </select>
            {draft.options.find((o) => o.label === opt.freeWhenLabel)?.choices.filter((c) => c.name.trim()).map((c) => {
              const sel = (opt.freeWhenChoices ?? []).includes(c.name);
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() =>
                    setOpt({
                      freeWhenChoices: sel
                        ? (opt.freeWhenChoices ?? []).filter((n) => n !== c.name)
                        : [...(opt.freeWhenChoices ?? []), c.name],
                    })
                  }
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                    sel ? "bg-teal-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {sel ? "✓ " : ""}
                  {c.name}
                </button>
              );
            })}
          </div>
          {opt.freeWhenLabel && (
            <p className="mt-1 rounded-lg bg-white/70 px-2 py-1.5 text-[10px] leading-relaxed text-slate-500 ring-1 ring-slate-200">
              📖 อ่านว่า: “เมื่อ <b className="font-bold text-teal-700">{opt.freeWhenLabel}</b> = ค่าที่ติ๊กไว้ด้านบน →
              ตัวเลือกที่ <b className="font-bold text-emerald-600">ติ๊กเขียว</b> ข้างล่างนี้
              <b className="font-bold"> ไม่คิดราคา +฿</b> (กรณีอื่นคิดตามปกติ)”
              <br />
              ตัวอย่างที่ใช้จริง: ห่วง Z1/Z2 ราคา +฿2 แต่ฟรีเมื่อหนา 3mm · หนา 2mm/1mm ยังคิด +฿2 ตามเดิม
            </p>
          )}
          {opt.freeWhenLabel && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-slate-400" title="ติ๊กเขียว = ตัวเลือกนั้นไม่คิด +฿ เมื่อเข้าเงื่อนไขด้านบน">
                🟢 ติ๊ก = ตัวเลือกที่<b className="font-bold text-emerald-600">ได้ฟรี</b> (ไม่คิด +฿)
              </span>
              {opt.choices.filter((c) => c.name.trim()).map((c) => {
                const sel = (opt.freeChoices ?? []).includes(c.name);
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() =>
                      setOpt({
                        freeChoices: sel
                          ? (opt.freeChoices ?? []).filter((n) => n !== c.name)
                          : [...(opt.freeChoices ?? []), c.name],
                      })
                    }
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                      sel ? "bg-emerald-500 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {sel ? "✓ " : ""}
                    {c.name.length > 22 ? c.name.slice(0, 22) + "…" : c.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {/* ── ให้ลูกค้าระบุจำนวน: เปิดทั้งกลุ่มทีเดียว แล้วค่อยติ๊กทีละตัวเลือกด้านล่าง (กลุ่มติ๊กหลายอย่างเท่านั้น) ── */}
        {opt.display === "multi" && (
          <div className="mt-1.5 border-t border-dashed border-slate-200 pt-1.5">
            <label className="flex cursor-pointer items-start gap-2 text-[11px] font-bold text-slate-600">
              <input
                type="checkbox"
                checked={!!opt.qtyOn}
                // ปิดสวิตช์ = ล้างที่ติ๊กไว้ทีละตัวด้วย ไม่งั้นจำนวนยังมีผลกับราคาทั้งที่ช่องหายไปจากจอ
                onChange={(e) =>
                  setOpt({
                    qtyOn: e.target.checked,
                    ...(e.target.checked
                      ? {}
                      : { choices: opt.choices.map((c) => ({ ...c, qty: false, qtyMax: "" })) }),
                  })
                }
                className="mt-0.5 h-3.5 w-3.5 accent-amber-500"
              />
              <span>
                🔢 ตัวเลือกกลุ่มนี้ให้ลูกค้า &ldquo;ระบุจำนวน&rdquo; ได้
                <span className="ml-1 font-normal text-slate-400">
                  (เช่น เพิ่มสาย 2 เส้น → +฿ ของตัวนั้นคูณ 2 — ติ๊กแล้วเลือกทีละตัวได้ด้านล่าง)
                </span>
              </span>
            </label>
          </div>
        )}
        {/* ── แสดงเมื่อ: โชว์ทั้งกลุ่มเฉพาะตอนกลุ่มอื่นเลือกค่านี้ (เช่น สีตะขอ C โผล่เฉพาะตอนเลือกตะขอ C) ── */}
        <div className="mt-1.5 border-t border-dashed border-slate-200 pt-1.5">
          {showWhenBlock(gi, opt)}
        </div>
      </div>
    );
  }


  /**
   * เปลี่ยน "คลังตัวเลือก" ที่กลุ่มนี้ลิงก์อยู่ (เช่น จาก สีตะขอ → สีตะขอ G)
   * ชื่อกลุ่มเปลี่ยนตามคลังใหม่ → ต้องลากชื่อในแกนตารางราคาและในกฎไปด้วย (ใช้ renameOptionGroup)
   * ⚠️ ตัวเลือกในกลุ่มเปลี่ยนชุด — ถ้ากลุ่มนี้เป็นแกนตารางราคา ราคาที่กรอกไว้ของคู่เดิมจะไม่ตรงกับตัวเลือกใหม่
   */
  async function relinkPreset(gi: number, presetId: string) {
    const preset = presets.find((p) => p.id === presetId);
    const cur = draft.options[gi];
    if (!preset || !cur || preset.id === cur.presetId) return;
    const isDriver = draft.pricing.driverLabels.includes(cur.label);
    if (
      isDriver &&
      !(await ask({
        icon: "📊",
        title: `เปลี่ยนคลังของกลุ่ม “${cur.label}”?`,
        detail:
          `กลุ่มนี้เป็นแกนของตารางราคา — เปลี่ยนไปใช้คลัง “${preset.label}” แล้ว\n` +
          "ราคาที่กรอกไว้จะไม่ตรงกับตัวเลือกชุดใหม่ ต้องกรอกราคาใหม่",
        confirmLabel: "เปลี่ยนคลัง",
        danger: true,
      }))
    )
      return;
    // ทำทีเดียวจบ: สลับคลัง + ลากชื่อกลุ่มเดิมที่ค้างอยู่ในแกนตารางราคา/กฎ ไปเป็นชื่อใหม่
    // (แยกเป็นสอง setDraft ไม่ได้ — รอบสองจะอ่าน label ใหม่ไปแล้ว หาชื่อเดิมไม่เจอ กฎเลยไม่ถูกแก้)
    const oldLabel = cur.label;
    const newLabel = preset.label;
    setDraft((d) => ({
      ...d,
      options: d.options.map((o, i) =>
        i === gi
          ? {
              ...o,
              presetId: preset.id,
              label: newLabel,
              choices: preset.choices.map((c) => ({ name: c.name, extra: c.extra ? String(c.extra) : "" })),
            }
          : o
      ),
      pricing: {
        ...d.pricing,
        driverLabels: d.pricing.driverLabels.map((l) => (l === oldLabel ? newLabel : l)),
      },
      rules: d.rules.map((r) => ({
        ...r,
        whenLabel: r.whenLabel === oldLabel ? newLabel : r.whenLabel,
        limitLabel: r.limitLabel === oldLabel ? newLabel : r.limitLabel,
      })),
    }));
  }

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

  /**
   * 📐 ชิ้น/หน่วย ของแถวตารางราคา — "1 หน่วยที่สั่ง ได้ของกี่ชิ้น" (เช่น เซ็ตละ 5 ชิ้น / สติกเกอร์ 45 ดวงต่อแผ่น)
   * ใช้เป็นเพดานจำนวนลายที่ลูกค้าคละได้: คละ 1 ลายใช้อย่างน้อย 1 ชิ้น → คละได้ไม่เกิน ชิ้น/หน่วย × จำนวนที่สั่ง
   * เก็บที่ตัวเลือกของ "กลุ่มแรก" ในแกนตาราง (เช่นกลุ่ม ขนาด) — ตารางที่มีหลายแกน แถวที่ขึ้นต้นด้วย
   * ตัวเลือกเดียวกันจึงใช้ค่าร่วมกัน (แก้แถวเดียว = เปลี่ยนทุกแถวของขนาดนั้น ซึ่งตรงกับความจริงของสินค้า)
   */
  function perUnitOfCombo(combo: string[]): string {
    const label = draft.pricing.driverLabels[0];
    const name = (combo[0] ?? "").trim();
    if (!label || !name) return "";
    const group = draft.options.find((o) => o.label === label);
    return group?.choices.find((c) => c.name.trim() === name)?.perUnit ?? "";
  }

  /**
   * กลุ่มที่ใช้กรอก 📐 ชิ้น/หน่วย แบบ "ไม่ได้อยู่ในตาราง" — กลุ่มเลือกได้ทีละอย่างที่ไม่ใช่คอลัมน์ของตารางราคา
   * (กลุ่มที่เป็นคอลัมน์กรอกในตารางได้เลย · กลุ่มติ๊กหลายอย่างใช้ไม่ได้ เพราะ 1 หน่วยต้องได้จำนวนชิ้นเดียว)
   */
  const perUnitInTable = draft.pricing.driverLabels.length === 1;
  const perUnitCandidates = draft.options.filter(
    (o) =>
      o.display !== "multi" &&
      o.choices.length > 0 &&
      !(perUnitInTable && o.label === draft.pricing.driverLabels[0])
  );
  const perUnitGroup =
    perUnitPick === ""
      ? undefined
      : perUnitCandidates.find((o) => o.label === perUnitPick) ??
        (perUnitPick === null
          ? perUnitCandidates.find((o) => o.choices.some((c) => Number(c.perUnit) > 0))
          : undefined);

  function setPerUnitOfChoice(label: string, ci: number, value: string) {
    const perUnit = value.replace(/[^\d]/g, "");
    patch({
      options: draft.options.map((o) =>
        o.label === label ? { ...o, choices: o.choices.map((c, j) => (j === ci ? { ...c, perUnit } : c)) } : o
      ),
    });
  }

  function setPerUnitOfCombo(combo: string[], value: string) {
    const label = draft.pricing.driverLabels[0];
    const name = (combo[0] ?? "").trim();
    if (!label || !name) return;
    const perUnit = value.replace(/[^\d]/g, "");
    patch({
      options: draft.options.map((o) =>
        o.label === label
          ? { ...o, choices: o.choices.map((c) => (c.name.trim() === name ? { ...c, perUnit } : c)) }
          : o
      ),
    });
  }

  function toggleDriver(label: string) {
    setDraft((d) => {
      const has = d.pricing.driverLabels.includes(label);
      if (has) return dropDriverIn(d, label);
      return { ...d, pricing: { ...d.pricing, driverLabels: [...d.pricing.driverLabels, label] } };
    });
  }

  /**
   * เอากลุ่มออกจาก "คอลัมน์ตารางราคา" — กลุ่มที่ราคาไปกรอกที่ +฿ ของแต่ละตัวเลือกเอง
   *
   * ⚠️ ตารางเก็บราคาแยกตามตัวเลือกของแกนนี้อยู่ — ถอดแกนแล้วช่องพวกนั้นไม่มีที่อยู่
   * ห้ามทิ้งเงียบ ๆ (ราคาที่กรอกมาทั้งหน้าหายหมด) → ย้ายตัวเลขออกมาแทน:
   *   • ตารางเหลือแถวของตัวเลือก "ถูกสุด" เป็นราคาฐาน
   *   • ตัวเลือกที่เหลือ ส่วนต่างจากฐานไปลงช่อง +฿ ของตัวเอง (เฉพาะช่องที่ยังว่าง ไม่ทับของเดิม)
   * ราคารวมของตัวเลือกที่ช่วงราคาแรกจึงเท่าเดิม · ช่วงอื่นเป็นค่าประมาณ (+฿ มีตัวเดียวต่อตัวเลือก)
   * ถอดพลาดกดคืนได้จาก driverUndo
   */
  function dropDriverIn(d: Draft, label: string): Draft {
    const di = d.pricing.driverLabels.indexOf(label);
    if (di < 0) return d;
    const width = d.pricing.driverLabels.length;
    const num = (v?: string) => {
      const n = Number(String(v ?? "").trim());
      return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null;
    };
    // ราคาตัวแทนของตัวเลือกหนึ่ง = ราคาช่วงแรกของคอลัมน์แรกที่ตัวเลือกนั้นถืออยู่
    const priceOf = (name: string): number | null => {
      for (const [key, v] of Object.entries(d.pricing.cells)) {
        const parts = key.split("│");
        if (parts.length === width && parts[di] === name) {
          const n = num(v[0]);
          if (n !== null) return n;
        }
      }
      return null;
    };
    const group = d.options.find((o) => o.label === label);
    const priced = (group?.choices ?? [])
      .map((c) => ({ name: c.name.trim(), price: priceOf(c.name.trim()) }))
      .filter((c): c is { name: string; price: number } => !!c.name && c.price !== null);
    // ตัวเลือกที่ถูกสุด = ราคาฐานที่ค้างไว้ในตาราง (ตัวอื่นบวกส่วนต่างเอา ไม่ต้องมี +฿ ติดลบ)
    const baseName = priced.length ? priced.reduce((a, b) => (b.price < a.price ? b : a)).name : "";
    const basePrice = priced.find((c) => c.name === baseName)?.price ?? 0;

    const filled = (arr?: string[]) => (arr ?? []).some((v) => String(v ?? "").trim());
    const collapse = (cells: Record<string, string[]>): Record<string, string[]> => {
      const out: Record<string, string[]> = {};
      const keep: Record<string, boolean> = {}; // คีย์นี้ได้แถวของตัวเลือกฐานไปแล้วหรือยัง
      for (const [key, v] of Object.entries(cells)) {
        const parts = key.split("│");
        if (parts.length !== width) continue; // คีย์ค้างจากแกนชุดเก่า — ยุบไม่ได้ ทิ้งไป
        const nk = parts.filter((_, i) => i !== di).join("│");
        const isBase = parts[di] === baseName;
        if (isBase && !keep[nk]) {
          out[nk] = v;
          keep[nk] = true;
        } else if (!keep[nk] && (!(nk in out) || (!filled(out[nk]) && filled(v)))) {
          out[nk] = v;
        }
      }
      return out;
    };
    return {
      ...d,
      // ย้ายส่วนต่างราคาลง +฿ ของแต่ละตัวเลือก — ตัวที่แอดมินกรอก +฿ ไว้เองแล้วไม่ยุ่ง
      options: d.options.map((o) =>
        o.label !== label
          ? o
          : {
              ...o,
              choices: o.choices.map((c) => {
                if (String(c.extra ?? "").trim()) return c;
                const p = priced.find((x) => x.name === c.name.trim());
                if (!p || p.price === basePrice) return c;
                return { ...c, extra: String(p.price - basePrice) };
              }),
            }
      ),
      pricing: {
        ...d.pricing,
        driverLabels: d.pricing.driverLabels.filter((_, i) => i !== di),
        cells: collapse(d.pricing.cells),
      },
      extraRates: d.extraRates.map((r) => ({ ...r, cells: collapse(r.cells) })),
    };
  }

  /** ตารางราคา + กลุ่มตัวเลือก ก่อนถอดแกนล่าสุด — กดคืนได้ถ้าถอดผิดตัว */
  const [driverUndo, setDriverUndo] = useState<{ label: string; before: Draft } | null>(null);

  /** ถามก่อนถอดแกน แล้วถอด — ใช้จากแถวกลุ่มตัวเลือก (ป้ายเตือน + ปุ่มติ๊กหลายอย่าง) */
  async function confirmDropDriver(label: string, why: string): Promise<boolean> {
    const inTable = draft.pricing.driverLabels.length === 1 ? "ตารางราคาจะเหลือราคาเดียวตามจำนวน" : "ตารางราคาจะลดไปหนึ่งคอลัมน์";
    if (
      !(await ask({
        icon: "📊",
        title: `เอากลุ่ม “${label}” ออกจากคอลัมน์ตารางราคา?`,
        detail:
          `${why}\n` +
          `• ${inTable} (ใช้ราคาของตัวเลือกที่ถูกที่สุดเป็นราคาฐาน)\n` +
          "• ส่วนต่างของตัวเลือกอื่นย้ายไปลงช่อง +฿ ของตัวเองให้อัตโนมัติ — ตรวจแล้วแก้ได้\n" +
          "• กดผิดกด “↩︎ เลิกทำ” คืนตารางเดิมได้",
        confirmLabel: "เอาออกจากตาราง",
      }))
    )
      return false;
    setDraft((d) => {
      setDriverUndo({ label, before: d });
      return dropDriverIn(d, label);
    });
    return true;
  }

  /** คืนตารางราคา/ตัวเลือกกลับก่อนถอดแกน */
  function undoDropDriver() {
    if (!driverUndo) return;
    setDraft(driverUndo.before);
    setDriverUndo(null);
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
  // ยุบ/กางรายกฎ และรายแท็บ (ค่าเริ่มต้น = ยุบ · หน้ายาวมากถ้ากางหมดพร้อมกันหาอะไรไม่เจอ)
  const [ruleFolded, setRuleFolded] = useState<Record<number, boolean>>({});
  const isRuleFolded = (i: number) => ruleFolded[i] ?? true;
  const toggleRuleFold = (i: number) => setRuleFolded((f) => ({ ...f, [i]: !(f[i] ?? true) }));
  const [tabFolded, setTabFolded] = useState<Record<number, boolean>>({});
  const isTabFolded = (i: number) => tabFolded[i] ?? true;
  const toggleTabFold = (i: number) => setTabFolded((f) => ({ ...f, [i]: !(f[i] ?? true) }));

  /** กลุ่มที่กำลังลากอยู่ (ref อ่านได้ทันทีตอน drop · state ไว้ทำไฮไลต์) */
  const dragOptRef = useRef<number | null>(null);
  const [dragOpt, setDragOpt] = useState<number | null>(null);

  /**
   * ย้ายลำดับกลุ่มตัวเลือก — ลำดับนี้คือลำดับที่ลูกค้าเห็นบนหน้าสินค้า
   * สถานะยุบ/กางผูกกับ "ลำดับ" จึงต้องสลับตามไปด้วย ไม่งั้นกลุ่มที่กางอยู่จะสลับที่กันเอง
   * (ตารางราคาไม่กระทบ — คีย์ช่องราคาอ้างชื่อตัวเลือก ไม่ได้อ้างลำดับกลุ่ม)
   */
  function moveOptionGroup(from: number, to: number) {
    if (from === to || to < 0 || to >= draft.options.length) return;
    const next = [...draft.options];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    patch({ options: next });
    setOptFolded((f) => {
      const arr = draft.options.map((_, i) => f[i] ?? true);
      const [m] = arr.splice(from, 1);
      arr.splice(to, 0, m);
      return Object.fromEntries(arr.map((v, i) => [i, v]));
    });
  }

  /** ย้ายลำดับตัวเลือกภายในกลุ่ม (ตัวแรก = ค่าเริ่มต้นบนหน้าสินค้า) */
  function moveOptionChoice(gi: number, from: number, to: number) {
    const opt = draft.options[gi];
    if (!opt || from === to || to < 0 || to >= opt.choices.length) return;
    const choices = [...opt.choices];
    const [moved] = choices.splice(from, 1);
    choices.splice(to, 0, moved);
    patch({ options: draft.options.map((o, i) => (i === gi ? { ...o, choices } : o)) });
  }
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
  async function removeRate(extraIdx: number) {
    if (
      !(await ask({
        icon: "🗑",
        title: "ลบเรทนี้ทั้งตาราง?",
        detail: "ราคาทุกช่องในเรทนี้จะหายไปด้วย — เรทอื่นไม่กระทบ",
        confirmLabel: "ลบเรทนี้",
        danger: true,
      }))
    )
      return;
    setDraft((d) => ({ ...d, extraRates: d.extraRates.filter((_, i) => i !== extraIdx) }));
    setRateIdx(0);
  }

  /**
   * บันทึก — รับ force=true เมื่อผู้ใช้ยืนยัน "บันทึกทับ" หลังชนกับการแก้จากที่อื่น (409)
   * กันกดซ้ำระหว่างรอด้วย saving (เมื่อก่อนไม่มีอะไรตอบสนอง เลยกดรัวกันหลายที)
   */
  async function save(force = false) {
    if (saving) return;
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
      .filter((b) => b.heading.trim() || b.text.trim() || (b.html.trim() && !isEmptyHtml(b.html)))
      .map((b) => ({
        heading: b.heading.trim(),
        text: b.text.trim(),
        // เนื้อหาแบบจัดรูปแบบ — เซิร์ฟเวอร์กรองแท็กอันตรายให้อีกชั้นตอนบันทึก
        ...(b.html.trim() && !isEmptyHtml(b.html) ? { html: b.html.trim() } : {}),
        align: b.align,
        ...(b.slot === "side" ? { slot: "side" as const } : {}),
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
        ...(m.imageSrc ? { imageSrc: m.imageSrc } : {}),
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
          // เทียบแบบตัดช่องว่างหัว-ท้าย แล้วเก็บชื่อกลุ่มปัจจุบันแทน — ชื่อเก่าที่มีเว้นวรรคติดมาจะได้ไม่หลุดทิ้ง
          const keep = draft.options
            .filter((o) => draft.custom.keepOptions.some((l) => l.trim() === o.label.trim()))
            .map((o) => o.label);
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
      mtoAlways: draft.mtoAlways ? true : undefined,
      areaPricing: (() => {
        const a = draft.area;
        // ตั้งไม่ครบ = ไม่บันทึก (ไม่งั้นหน้าร้านคิดราคาเพี้ยนเงียบ ๆ)
        if (!a.enabled || !a.widthLabel || !a.heightLabel || !a.baseColumn || !a.stepColumn) return undefined;
        const baseArea = Number(a.baseArea);
        if (!Number.isFinite(baseArea) || baseArea < 0) return undefined;
        return {
          enabled: true,
          widthLabel: a.widthLabel,
          heightLabel: a.heightLabel,
          baseColumn: a.baseColumn,
          stepColumn: a.stepColumn,
          baseArea,
          round: a.round,
        };
      })(),
      ...(rules.length > 0 ? { rules } : { rules: undefined }),
      pricing,
      priceRates,
      // คิดเรทตามชิ้นต่อลาย — มีผลเฉพาะเมื่อเปิดตารางราคาขั้นบันไดอยู่
      tierByDesign: pricing && draft.pricing.tierByDesign ? true : undefined,
      // ค่าคละลายแบบคิดต่อหน่วย — ต้องมีค่าคละเหมาถึงจะถือว่าตั้งจริง (ไม่งั้นเปิดสวิตช์เปล่า ๆ ก็ไม่มีผล)
      mixRule: (() => {
        if (!draft.mix.on) return undefined;
        const n = (s: string, dflt = 0) => {
          const v = Number(String(s).trim());
          return Number.isFinite(v) && v >= 0 ? v : dflt;
        };
        const tiers = draft.mix.tiers
          .filter((t) => String(t.fromQty).trim() !== "") // แถวที่ยังไม่ใส่ "ตั้งแต่" = ยังกรอกไม่เสร็จ ข้ามไป
          .map((t) => ({
            fromQty: Math.max(1, n(t.fromQty, 1)),
            baseFee: n(t.baseFee),
            includedDesigns: Math.max(1, n(t.includedDesigns, 1)),
            extraFee: n(t.extraFee),
            ...(t.onePerUnit ? { onePerUnit: true } : {}),
          }))
          .sort((a, b) => a.fromQty - b.fromQty);
        if (!tiers.length) return undefined;
        // baseFee/includedDesigns/extraFee ระดับบนสุด = แถวแรก (ไว้ให้โค้ดเก่า/ที่อื่นอ่านได้โดยไม่ต้องรู้จักตาราง)
        const first = tiers[0];
        return { baseFee: first.baseFee, includedDesigns: first.includedDesigns, extraFee: first.extraFee, tiers };
      })(),
      highlights: draft.highlights.map((h) => h.trim()).filter(Boolean),
      images,
      body,
      tabs: (() => {
        const list = draft.tabs
          .map((t) => {
            const images = t.images.map((s) => s.trim()).filter(Boolean);
            const html = t.html.trim();
            return {
              title: t.title.trim(),
              text: t.text.trim(),
              // เนื้อหาแบบจัดรูปแบบ (ถ้าใช้ตัวเขียน) — เซิร์ฟเวอร์กรองแท็กอันตรายให้อีกชั้นตอนบันทึก
              ...(html && !isEmptyHtml(html) ? { html } : {}),
              // ตำแหน่ง/ขนาดรูปเก็บเฉพาะตอนไม่ใช่ค่าเริ่มต้น (ใต้ข้อความ · ขนาดอัตโนมัติ · ชิดซ้าย)
              ...(images.length
                ? {
                    images,
                    ...(t.imagePos === "top" ? { imagePos: "top" as const } : {}),
                    ...(t.imageSize !== "auto" ? { imageSize: t.imageSize } : {}),
                    ...(t.imageAlign !== "left" ? { imageAlign: t.imageAlign } : {}),
                  }
                : {}),
            };
          })
          // แท็บที่มีแต่รูป (ไม่มีข้อความ) ก็เก็บ — บางแท็บเป็นตารางรูปล้วน
          .filter((t) => t.title && (t.text || t.html || t.images?.length));
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
      // 🎛️ ค่าส่งเฉพาะบางตัวเลือก — เก็บเฉพาะข้อที่เลือกกลุ่ม+ค่า และตั้งค่าส่งไว้จริง
      shipRules: (() => {
        const list: ShipOptionRule[] = draft.shipRules
          .filter((r) => r.label.trim() && r.choices.length > 0)
          .map((r) => ({
            label: r.label.trim(),
            choices: [...r.choices],
            shippingId: r.shippingId || undefined,
            ...buildShipTiers(r),
          }))
          .filter((r) => r.shippingId || r.shipTiers?.length);
        return list.length ? list : undefined;
      })(),
      templateIds: draft.templateIds.length ? [...draft.templateIds] : undefined,
      terms: draft.terms.trim() || undefined,
      artworkRequired: draft.artworkRequired ? undefined : false, // undefined = บังคับ (ค่าเริ่มต้น)
      // 💬 คุยลายกับแอดมินก่อน — ปิดอยู่ = ไม่เก็บฟิลด์เลย (undefined = สั่งได้เลยตามปกติ)
      artworkConsult: draft.artworkConsult
        ? {
            enabled: true,
            note: draft.artworkConsultNote.trim() || undefined,
            block: draft.artworkConsultBlock ? undefined : false, // undefined = บล็อก (ค่าเริ่มต้น)
          }
        : undefined,
      reviewed: draft.reviewed,
      hidden: draft.hidden,
    };
    setSaving(true);
    // force = ยอมทับของใหม่กว่า → ใช้ savedAt ล่าสุดจากฐานข้อมูลเป็นฐาน ด่านกันชนจะปล่อยผ่าน
    const base = force ? ((await fetchProductRaw(productId))?.savedAt ?? "") : baseSavedAt;
    const res = await persistProduct(updated, base);
    setSaving(false);
    if (!res.ok) {
      const clash = /บันทึกสินค้านี้จากที่อื่น/.test(res.error ?? "");
      setConflict(clash);
      setSaveError(
        res.error === "storage-full"
          ? "บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม (รูปที่อัปโหลดรวมกันใหญ่เกินไป) ลองลดจำนวนรูปหรือใช้รูปเล็กลง"
          : `บันทึกไม่สำเร็จ: ${res.error ?? "เกิดข้อผิดพลาด"}`
      );
      return;
    }
    // บันทึกผ่าน → ข้อมูลในมือกลายเป็นเวอร์ชันล่าสุด (บันทึกซ้ำได้โดยไม่ติดกันทับ)
    if (res.savedAt) setBaseSavedAt(res.savedAt);
    // ลิงก์บนแถบที่อยู่เปลี่ยนเป็นชื่อเดียวกับหน้าร้านทันที (ไม่โหลดหน้าใหม่ ของที่กรอกค้างไว้ไม่หาย)
    const nextPath = adminProductPath(updated);
    if (window.location.pathname !== nextPath) window.history.replaceState(null, "", nextPath);
    setSaveError("");
    setConflict(false);
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
    if (
      !(await ask({
        icon: "🗑",
        title: `ลบสินค้า “${draft.name || productId}” ถาวร?`,
        detail: "ลบออกจากระบบทันทีและย้อนกลับไม่ได้ — ถ้าแค่ไม่อยากให้ลูกค้าเห็น ให้กด “เก็บเป็นฉบับร่าง” แทน",
        confirmLabel: "ลบถาวร",
        danger: true,
      }))
    )
      return;
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
    setImpErr(""); setImpList([]); setImpPick({}); setImpPageImgs([]); setImpPagePick([]); setImpLoading(true);
    try {
      const res = await fetch("/api/admin/import?action=scrape", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: impUrl }),
      });
      const d = await res.json();
      if (!res.ok) { setImpErr(d.error ?? "ดึงไม่สำเร็จ"); return; }
      setImpList(d.products ?? []);
      setImpPageImgs(d.pageImages ?? []);
      // ไม่เจอตาราง แต่มีรูป = ยังใช้ประโยชน์ได้ (เลือกรูปจากกองด้านล่างได้เลย) — ไม่ต้องขึ้นเป็นข้อผิดพลาด
      if (!d.products?.length && !d.pageImages?.length) {
        setImpErr("ไม่พบตารางสินค้าและรูปในหน้านี้ (URL อาจไม่ถูก)");
      }
    } catch {
      setImpErr("เชื่อมต่อไม่ได้");
    } finally {
      setImpLoading(false);
    }
  }
  /** รูปที่แอดมินติ๊กไว้ในรายการที่ scrape มา (ไม่ติ๊ก = ทุกรูปที่เจอ) จำกัดตามช่องรูปที่ใส่ได้ */
  function importedPhotos(p: ScrapedProduct, index?: number): string[] {
    const all = p.imageUrls?.length ? p.imageUrls : p.imageUrl ? [p.imageUrl] : [];
    const picked = index != null && impPick[index] ? impPick[index] : all;
    return picked.slice(0, MAX_PHOTOS);
  }

  /**
   * เอาเฉพาะรูปมาใส่ ไม่แตะข้อมูลอื่น — กรณีราคา/ตัวเลือกในระบบถูกอยู่แล้ว ขาดแค่รูป
   * รูปที่มีอยู่เดิมยังอยู่ รูปใหม่ต่อท้าย (ตัดรูปซ้ำ) จนเต็มโควตา
   */
  function importPhotosOnly(p: ScrapedProduct, index?: number) {
    addImportedPhotos(importedPhotos(p, index));
  }

  /** ใส่รูปที่เลือกไว้จาก "รูปทั้งหน้า" (กองรวมทุกรูปในหน้าที่ดึงมา) */
  function importPagePhotos() {
    addImportedPhotos(impPagePick);
  }

  /** รูปใหม่ต่อท้ายของเดิม (ตัดซ้ำ) แล้วปิดพาเนลนำเข้า */
  function addImportedPhotos(incoming: string[]) {
    if (!incoming.length) return;
    patch({ photos: [...new Set([...draft.photos, ...incoming])].slice(0, MAX_PHOTOS) });
    closeImport();
  }

  /** ปิดพาเนลนำเข้า + ล้างผลที่ดึงมาทั้งหมด */
  function closeImport() {
    setImpOpen(false); setImpList([]); setImpUrl(""); setImpPick({});
    setImpPageImgs([]); setImpPagePick([]);
  }

  // เติมข้อมูลจากสินค้าที่ scrape มาลง draft (ราคา/ตัวเลือก/ราคาขั้นบันได/รูป)
  function importFill(p: ScrapedProduct, index?: number) {
    const photos = importedPhotos(p, index);
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
    closeImport();
  }

  // เคลียร์ป้าย "บันทึกแล้ว" ทันทีที่มีการแก้ไขใหม่ (ให้รู้ว่ายังไม่ได้เซฟ)
  useEffect(() => {
    setSavedAt(false);
  }, [draft]);

  const cat = cats.find((c) => c.id === draft.category);

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

  async function autoFillSeo() {
    const hasOld = draft.seo.title || draft.seo.description || draft.seo.keywords || draft.seo.faqs.length > 0;
    if (
      hasOld &&
      !(await ask({
        icon: "✨",
        title: "เขียนทับ SEO/AEO ที่มีอยู่?",
        detail: "หัวข้อ · คำอธิบาย · คีย์เวิร์ด · คำถามที่พบบ่อย ที่พิมพ์ไว้จะถูกแทนด้วยข้อความอัตโนมัติ",
        confirmLabel: "เขียนทับ",
        danger: true,
      }))
    )
      return;
    applyAutoSeo();
  }

  const categoryLabel = cat?.name ?? draft.category;
  const thumbEmoji = draft.emoji || cat?.emoji || "📦";
  const thumbGradient = draft.gradient || cat?.gradient || "from-amber-100 to-amber-200";
  const NAV_SECTIONS = [
    { id: "sec-basic", label: "ข้อมูลหลัก" },
    { id: "sec-photos", label: "รูป" },
    { id: "sec-terms", label: "ข้อควรทราบ" },
    { id: "sec-templates", label: "เทมเพลต" },
    { id: "sec-highlights", label: "จุดเด่น" },
    { id: "sec-options", label: "ตัวเลือก" },
    { id: "sec-rules", label: "กติกา" },
    { id: "sec-bulk", label: "สั่งเยอะ & ค่าส่ง" },
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
              onClick={() => save()}
              disabled={saving}
              className={`rounded-full px-6 py-2 text-sm font-bold text-white shadow-sm transition ${
                saving
                  ? "cursor-wait bg-slate-400"
                  : savedAt
                    ? "bg-emerald-600"
                    : "bg-emerald-500 hover:bg-emerald-600"
              }`}
            >
              {saving ? (
                <>⏳ กำลังบันทึก…</>
              ) : (
                <>
                  💾 {savedAt ? "บันทึกแล้ว" : "บันทึก"}
                  <span className="hidden sm:inline">{savedAt ? "!" : "การแก้ไข"}</span>
                </>
              )}
            </button>
          </div>
        </div>
        {/* ผลการบันทึก — ต้องอยู่ติดปุ่ม ไม่งั้นกดแล้วเหมือนไม่มีอะไรเกิดขึ้น */}
        {saveError && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
            <span>⚠️ {saveError}</span>
            {conflict && (
              <>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-full bg-white px-3 py-1 font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                  title="โหลดข้อมูลล่าสุดจากฐานข้อมูล (สิ่งที่แก้ค้างไว้ในหน้านี้จะหาย)"
                >
                  🔄 โหลดข้อมูลล่าสุด
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await ask({
                      icon: "⚠️",
                      title: "บันทึกทับด้วยข้อมูลในหน้านี้?",
                      detail: "สิ่งที่คนอื่นแก้ไว้หลังจากคุณเปิดหน้านี้จะหายไป — ถ้าไม่แน่ใจ กด “โหลดข้อมูลล่าสุด” ก่อน",
                      confirmLabel: "บันทึกทับ",
                      danger: true,
                    });
                    if (ok) void save(true);
                  }}
                  className="rounded-full bg-rose-600 px-3 py-1 font-bold text-white hover:bg-rose-700"
                  title="ยืนยันว่าจะใช้ข้อมูลในหน้านี้ทับของในฐานข้อมูล"
                >
                  บันทึกทับเลย
                </button>
              </>
            )}
          </div>
        )}
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
            <br />
            หน้าแก้ไขในหลังบ้านใช้ชื่อเดียวกัน:{" "}
            <b className="font-bold text-slate-500">/admin/products/{draftSlug || productId}</b> (ลิงก์รหัสเดิมก็ยังเปิดได้)
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
                พบ {impList.length} สินค้าในหน้านี้ — ติ๊กเลือกรูปก่อน แล้วเลือกว่าจะเอาอะไร ·{" "}
                <span className="font-bold text-sky-700">🖼 เอาแค่รูป</span> = ใส่เฉพาะรูป ข้อมูลเดิมไม่ถูกแตะ ·{" "}
                <span className="font-bold text-rose-600">ใช้ทั้งชุด = เขียนทับ ชื่อ/ราคา/ตัวเลือก/รูป</span>{" "}
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
                      <div className="flex shrink-0 items-center gap-1.5">
                        {/* ข้อมูลถูกอยู่แล้ว ขาดแค่รูป → เอาเฉพาะรูป ไม่เขียนทับอย่างอื่น */}
                        <button
                          type="button"
                          onClick={() => importPhotosOnly(p, i)}
                          disabled={(p.imageUrls?.length ?? (p.imageUrl ? 1 : 0)) === 0}
                          title="ใส่เฉพาะรูปที่เลือก — ชื่อ/ราคา/ตัวเลือก/ตารางราคา คงเดิมทั้งหมด"
                          className="rounded-lg bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-200 disabled:opacity-40"
                        >
                          🖼 เอาแค่รูป
                        </button>
                        <button
                          type="button"
                          onClick={() => importFill(p, i)}
                          title="เขียนทับ ชื่อ/ราคา/ตัวเลือก/ตารางราคา/รูป ด้วยข้อมูลจากหน้านี้"
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          ใช้ทั้งชุด →
                        </button>
                      </div>
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

          {/* ── รูปทั้งหน้า — ทุกรูปในหน้าที่ดึงมา ไม่ผูกกับสินค้าตัวไหน (เลือกเองได้) ── */}
          {impPageImgs.length > 0 && (() => {
            const room = Math.max(0, MAX_PHOTOS - draft.photos.length);
            const toggle = (u: string) =>
              setImpPagePick((cur) =>
                cur.includes(u) ? cur.filter((x) => x !== u) : [...cur, u].slice(0, MAX_PHOTOS)
              );
            return (
              <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-500">
                    <span className="mr-1.5 rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold text-white">3</span>
                    <span className="font-bold text-sky-700">🖼 รูปทั้งหน้านี้ {impPageImgs.length} รูป</span> — กดเลือกรูปที่ต้องการ
                    แล้วกดใส่ (ข้อมูลอื่นไม่ถูกแตะ · รูปเดิมยังอยู่ ต่อท้ายให้)
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {impPagePick.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setImpPagePick([])}
                        className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                      >
                        ล้างที่เลือก
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={importPagePhotos}
                      disabled={!impPagePick.length}
                      title="ใส่เฉพาะรูปที่เลือก — ชื่อ/ราคา/ตัวเลือก/ตารางราคา คงเดิมทั้งหมด"
                      className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-40"
                    >
                      🖼 ใส่รูปที่เลือก ({impPagePick.length})
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex max-h-56 flex-wrap items-center gap-1.5 overflow-y-auto">
                  {impPageImgs.map((u) => {
                    const on = impPagePick.includes(u);
                    const order = impPagePick.indexOf(u) + 1;
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => toggle(u)}
                        title={on ? `เลือกไว้ (รูปที่ ${order})` : "กดเพื่อเลือกรูปนี้"}
                        className={`relative h-16 w-16 overflow-hidden rounded-lg ring-2 transition ${on ? "ring-sky-500" : "opacity-60 ring-transparent hover:opacity-100"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" loading="lazy" className="h-16 w-16 object-cover" />
                        {on && (
                          <span className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-sky-500 text-[9px] font-bold text-white">
                            {order}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  เลือกไว้ {impPagePick.length} รูป · ตอนนี้สินค้ามี {draft.photos.length}/{MAX_PHOTOS} รูป
                  {room === 0
                    ? " — เต็มแล้ว ต้องลบรูปเดิมออกก่อนถึงจะใส่เพิ่มได้"
                    : ` — ใส่เพิ่มได้อีก ${room} รูป (เกินจากนี้จะถูกตัดทิ้ง)`}
                </p>
              </div>
            );
          })()}
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
              {/* หมวดที่ซ่อนจากหน้าร้านยังเลือกได้ (สินค้าเดิมยังอยู่ในหมวดนั้น) — แค่บอกให้รู้ */}
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}{c.hidden ? " (ซ่อนอยู่)" : ""}</option>
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

      {/* ── 📐 เทมเพลตไฟล์งาน — ติ๊กเลือกจากคลังกลาง ลูกค้าโหลดได้จากหน้าสินค้า ── */}
      <section id="sec-templates" className={`relative border-l-4 border-l-blue-400 mt-4 scroll-mt-32 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]${secCls("templates")}`}>
        <SecToggle id="templates" />
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-blue-800">📐 เทมเพลตไฟล์งาน ({draft.templateIds.length})</h2>
          <a
            href="/admin/templates"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600 hover:border-blue-300"
          >
            🗂 จัดการคลังเทมเพลต
          </a>
        </div>
        <p className="mb-3 text-[11px] text-slate-400">
          แสดงเฉพาะเทมเพลตที่ผูกกับสินค้านี้ — หน้าสินค้าจะขึ้นปุ่มให้ลูกค้าโหลดไฟล์ .ai ไปวางลาย ·
          จะผูกเพิ่มให้ไปที่{" "}
          <a href="/admin/templates" target="_blank" rel="noopener noreferrer" className="font-bold text-blue-600 underline">
            คลังเทมเพลตไฟล์งาน
          </a>{" "}
          แล้วกด 🔗 ผูกสินค้า (เอาติ๊กออกตรงนี้ = ปลดออกจากสินค้านี้)
        </p>
        {linkedTemplates.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 p-4 text-center text-xs text-slate-400">
            {templates.length === 0 ? "ยังไม่มีเทมเพลตในคลัง — ไปเพิ่มที่ " : "ยังไม่ได้ผูกเทมเพลตกับสินค้านี้ — ไปผูกที่ "}
            <a href="/admin/templates" target="_blank" rel="noopener noreferrer" className="font-bold text-blue-600 underline">
              คลังเทมเพลตไฟล์งาน
            </a>
          </p>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {groupByCategory(linkedTemplates).map((grp) => (
              <div key={grp.category} className="space-y-1.5">
                {/* หัวหมวด — คลังโตขึ้นแล้วหาง่ายกว่าเลื่อนยาว ๆ */}
                <p className="flex items-center gap-2 pt-1 text-[11px] font-bold text-slate-400">
                  <span>{grp.category === NO_CATEGORY ? "📂" : "🗂"} {grp.category}</span>
                  <span className="h-px flex-1 bg-slate-100" />
                </p>
            {grp.items.map((t) => {
              const on = draft.templateIds.includes(t.id);
              return (
                <label
                  key={t.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl p-2.5 ring-1 transition ${
                    on ? "bg-blue-50 ring-blue-300" : "bg-white ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      patch({
                        templateIds: on
                          ? draft.templateIds.filter((x) => x !== t.id)
                          : [...draft.templateIds, t.id],
                      })
                    }
                    className="h-4 w-4 accent-blue-600"
                  />
                  {/* ไอคอนสีตามหมวด — งานไดคัทเป็นเส้นบาง ย่อเป็นรูปเล็กแล้วมองไม่เห็น */}
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-lg"
                    style={{ backgroundColor: `${categoryTone(t.category?.trim() ?? "")}24` }}
                  >
                    📐
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{t.name}</span>
                    <span className="block truncate text-[11px] text-slate-400">
                      {(() => {
                        const fs = templateFiles(t).filter(fileReady);
                        if (!fs.length) return "⚠️ ยังไม่มีไฟล์";
                        const opt = t.optionLabel?.trim();
                        // ชุดที่แยกตามตัวเลือก บอกว่าครอบคลุมกี่ค่า (เช่น "12 ไฟล์ · แยกตามรุ่น")
                        return `${fs.length} ไฟล์${opt ? ` · แยกตาม${opt}` : ""}`;
                      })()}
                      {t.hidden ? " · 🚫 ซ่อนอยู่" : ""}
                    </span>
                  </span>
                </label>
              );
            })}
              </div>
            ))}
          </div>
        )}
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
          {/* นับเฉพาะกลุ่มที่แสดงอยู่ในแผงนี้จริง — ของงานสั่งทำไปอยู่แผง 📐 แล้ว นับรวมมาจะงงว่าทำไมโชว์ไม่ครบ */}
          <h2 className="text-sm font-bold text-orange-800">
            🎛️ ตัวเลือกสินค้า ({draft.options.filter((o) => !isMadeToOrder(o)).length} กลุ่ม)
          </h2>
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
                {presets.filter((p) => !p.hidden).map((p) => {
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
            // กลุ่มของงานสั่งทำ (ช่องกรอก / กลุ่มที่ย้ายไป 📐) ไม่โผล่ที่นี่ — แก้ที่แผง 📐 ที่เดียว
            // ย้ายกลุ่มเข้างานสั่งทำทำที่เมนู "📥 ย้ายกลุ่มจาก 🎛️ เข้ามา…" ในแผง 📐 ที่เดียว
            // (เคยมีปุ่มใต้ทุกกลุ่มตรงนี้ — รกและซ้ำซ้อน เลยเอาออก)
            isMadeToOrder(opt) ? null : <div key={gi}>{optionGroupCard(opt, gi)}</div>
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          💡 ตัวเลือกแรกของแต่ละกลุ่มคือค่าเริ่มต้น · ราคาคุมด้วยราคาขั้นบันได · กลุ่ม 🔗 ลิงก์คลัง แก้รวมได้ที่หน้าคลังตัวเลือก
        </p>
        {/* บอกว่าของงานสั่งทำไปอยู่ไหน — ไม่งั้นเปิดมาแล้วหาไม่เจอว่าที่ตั้งไว้หายไปไหน */}
        {draft.options.some(isMadeToOrder) && (
          <p className="mt-1 text-[11px] font-semibold text-fuchsia-700">
            📐 งานสั่งทำ {draft.options.filter(isMadeToOrder).length} รายการ (
            {draft.options.filter(isMadeToOrder).map((o) => o.label.trim() || "ยังไม่ตั้งชื่อ").join(" · ")}
            ) — ตั้งค่าที่{" "}
            <button
              type="button"
              onClick={() => document.getElementById("sec-custom")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="font-bold underline decoration-dotted underline-offset-2 hover:text-fuchsia-900"
            >
              📐 ตัวเลือกกำหนดเอง (งานสั่งทำ)
            </button>
          </p>
        )}
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

            {/* ── ค่าคละลายแบบคิดเป็นเงินต่อหน่วย ──
                ต่างจากช่องบน: อันบนลด "เรทราคา" ตามจำนวนลาย · อันนี้ราคาเรทเท่าเดิม แต่บวกค่าคละตรง ๆ
                ใช้กับงานที่คละแล้วต้นทุนเพิ่มเป็นค่าจัดอาร์ต ไม่ใช่ค่าผลิตต่อชิ้น (เช่น สติกเกอร์รวมลาย) */}
            <label className="mb-2.5 flex cursor-pointer items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 ring-1 ring-amber-100">
              <input
                type="checkbox"
                checked={draft.mix.on}
                onChange={(e) => setDraft((d) => ({ ...d, mix: { ...d.mix, on: e.target.checked } }))}
                className="mt-0.5 h-4 w-4 accent-amber-600"
              />
              <span className="text-xs leading-relaxed text-amber-900">
                <span className="font-bold">💰 คิดค่าคละลายเป็นเงินต่อหน่วย</span> — ราคาเรทไม่ถูกลดตามจำนวนลาย
                แต่บวกค่าคละแทน (เปิดอันนี้แล้วช่องด้านบนจะไม่มีผล เพื่อไม่ให้ลูกค้าโดนสองเด้ง)
              </span>
            </label>
            {draft.mix.on && (
              <div className="mb-2.5 rounded-xl bg-white p-3 ring-1 ring-amber-200">
                <p className="text-[11px] leading-relaxed text-slate-500">
                  ตั้งได้หลายช่วง — แต่ละช่วงคิดค่าคละคนละแบบ · ระบบเลือกช่วงที่ &ldquo;ตั้งแต่&rdquo; สูงสุดที่ยังไม่เกินจำนวนที่ลูกค้าสั่ง
                </p>
                <div className="mt-2 space-y-2">
                  {draft.mix.tiers.map((t, i) => {
                    const setTier = (p: Partial<DraftMixTier>) =>
                      setDraft((d) => ({
                        ...d,
                        mix: { ...d.mix, tiers: d.mix.tiers.map((x, j) => (j === i ? { ...x, ...p } : x)) },
                      }));
                    const numIn = (k: keyof DraftMixTier, ph: string, w = "w-20") => (
                      <input
                        value={String(t[k])}
                        onChange={(e) => setTier({ [k]: e.target.value.replace(/[^\d]/g, "") } as Partial<DraftMixTier>)}
                        inputMode="numeric"
                        placeholder={ph}
                        className={`${w} rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800 focus:border-amber-400 focus:outline-none`}
                      />
                    );
                    return (
                      <div key={i} className="rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] text-slate-600">
                          <span className="font-bold text-slate-700">สั่งตั้งแต่</span>
                          {numIn("fromQty", "1", "w-16")}
                          <span className="font-bold text-slate-700">หน่วยขึ้นไป · คละแล้วคิด</span>
                          {numIn("baseFee", "20", "w-16")}
                          <span>บาท/หน่วย · รวม</span>
                          {numIn("includedDesigns", "4", "w-14")}
                          <span>ลาย · เกินลายละ</span>
                          {numIn("extraFee", "5", "w-14")}
                          <span>บาท/หน่วย</span>
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((d) => ({ ...d, mix: { ...d.mix, tiers: d.mix.tiers.filter((_, j) => j !== i) } }))
                            }
                            className="ml-auto rounded-full px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50"
                          >
                            ลบช่วง
                          </button>
                        </div>
                        <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-600">
                          <input
                            type="checkbox"
                            checked={t.onePerUnit}
                            onChange={(e) => setTier({ onePerUnit: e.target.checked })}
                            className="h-3.5 w-3.5 accent-amber-600"
                          />
                          ช่วงนี้ต้องมีอย่างน้อย 1 ลาย ต่อ 1 หน่วย (คละได้ไม่เกินจำนวนที่สั่ง)
                        </label>
                        <p className="mt-1 text-[10.5px] text-slate-400">
                          ช่วงนี้: คละ 1 ลาย = ไม่คิด · 2–{t.includedDesigns || "?"} ลาย = {t.baseFee || "0"} บาท/หน่วย
                          {Number(t.extraFee) > 0 ? ` · เกินจากนั้นลายละ ${t.extraFee} บาท/หน่วย` : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, mix: { ...d.mix, tiers: [...d.mix.tiers, { ...EMPTY_MIX_TIER }] } }))}
                  className="mt-2 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-bold text-amber-700 hover:bg-amber-100"
                >
                  ＋ เพิ่มช่วงจำนวน
                </button>
                {draft.mix.tiers.length === 0 && (
                  <p className="mt-2 text-[11px] text-rose-600">ยังไม่มีช่วง — กด &ldquo;เพิ่มช่วงจำนวน&rdquo; อย่างน้อย 1 ช่วง ไม่งั้นค่าคละจะไม่ถูกบันทึก</p>
                )}
              </div>
            )}

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
                            <td
                              className="whitespace-nowrap px-2.5 py-1.5 font-medium text-slate-600"
                              title={combo.length ? combo.join(" · ") : "ทุกจำนวน"}
                            >
                              {combo.length ? combo.map(shortChoice).join(" · ") : "ราคา / หน่วย"}
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
        <h2 className="text-sm font-bold text-fuchsia-800">📐 ตัวเลือกกำหนดเอง (งานสั่งทำ)</h2>
        <p className="mt-1 text-[11px] text-slate-400">
          งานที่ขนาด/รายละเอียดมาจากลูกค้า ไม่ได้อยู่ในตารางราคาปกติ — ให้ลูกค้ากรอกมาก่อน แล้วแอดมินตีราคาให้ทีหลัง
        </p>

        {/* ✍️ ช่องกรอกแบบยืดหยุ่น — กี่ช่องก็ได้ ตั้งชื่อเองได้ทุกช่อง (แทนช่องกว้าง×ยาวชุดเดียวแบบเดิม) */}
        {madeToOrderPanel()}

        {/* สินค้าที่ทุกออเดอร์ต้องระบุขนาดเองอยู่แล้ว — ไม่ควรให้ลูกค้าต้องติ๊กก่อนถึงเห็นช่องกรอก */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-slate-200 pt-3">
          <div>
            <h3 className="text-xs font-bold text-slate-600">📐 ไม่มีขนาดมาตรฐาน — กางช่องกรอกให้เลย</h3>
            <p className="mt-0.5 text-[11px] text-slate-400">
              ปกติลูกค้าต้องติ๊ก &ldquo;ต้องการสั่งทำ&rdquo; ก่อนถึงเห็นช่องกรอก (ไม่ติ๊ก = ใช้ขนาดมาตรฐาน) ·
              ติ๊กข้อนี้สำหรับสินค้าที่ <span className="font-semibold text-slate-500">ไม่มีขนาดมาตรฐานเลย</span>{" "}
              เช่น อาร์มปักที่คิดราคาตาม ตร.ซม. — ช่องกรอกจะกางรอไว้ ลูกค้าไม่ต้องติ๊กอะไรก่อน
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={draft.mtoAlways}
              onChange={(e) => patch({ mtoAlways: e.target.checked })}
              className="h-4 w-4 accent-amber-500"
            />
            กางไว้เลย
          </label>
        </div>

        {/* 📐 คิดราคาตามพื้นที่ — งานที่ราคาผูกกับขนาดลาย (อาร์มปัก ฯลฯ) ระบบคิดให้เอง ไม่ต้องรอแอดมินตีราคา */}
        {(() => {
          const a = draft.area;
          const patchArea = (x: Partial<DraftArea>) => patch({ area: { ...a, ...x } });
          const inputGroups = draft.options.filter((o) => o.display === "input").map((o) => o.label);
          const columns = Object.keys(draft.pricing.cells);
          return (
            <div className="mt-4 border-t border-dashed border-slate-200 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-600">🧮 คิดราคาตามพื้นที่ลาย</h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    ราคา/ชิ้น = <span className="font-semibold text-slate-500">ราคาก้อนแรก + (พื้นที่ที่เกิน × เรทต่อหน่วย)</span> ·
                    ทั้งสองเรทดึงจากคอลัมน์ในตารางราคา จึงลดตามช่วงจำนวนเอง · ลูกค้ากรอกขนาดแล้วเห็นราคาทันที ไม่ต้องให้แอดมินตีราคา
                  </p>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={a.enabled}
                    onChange={(e) => patchArea({ enabled: e.target.checked })}
                    className="h-4 w-4 accent-amber-500"
                  />
                  เปิดใช้
                </label>
              </div>
              {a.enabled && (
                <div className="mt-3 grid gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-2">
                  {(
                    [
                      ["ช่องกรอก “กว้าง”", "widthLabel", inputGroups],
                      ["ช่องกรอก “ยาว”", "heightLabel", inputGroups],
                      ["คอลัมน์ราคาก้อนแรก", "baseColumn", columns],
                      ["คอลัมน์เรทต่อหน่วยที่เกิน", "stepColumn", columns],
                    ] as const
                  ).map(([label, key, list]) => (
                    <label key={key} className="text-xs font-semibold text-slate-500">
                      {label}
                      <select
                        value={a[key]}
                        onChange={(e) => patchArea({ [key]: e.target.value } as Partial<DraftArea>)}
                        className="mt-1 block w-full rounded-xl bg-white px-3 py-1.5 text-sm text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                      >
                        <option value="">— ยังไม่เลือก —</option>
                        {list.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <label className="text-xs font-semibold text-slate-500">
                    พื้นที่ที่รวมในราคาก้อนแรก
                    <input
                      value={a.baseArea}
                      onChange={(e) => patchArea({ baseArea: e.target.value })}
                      inputMode="decimal"
                      placeholder="15"
                      className="mt-1 block w-full rounded-xl bg-white px-3 py-1.5 text-sm text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-500">
                    ปัดเศษราคา/ชิ้น
                    <select
                      value={a.round}
                      onChange={(e) => patchArea({ round: e.target.value as DraftArea["round"] })}
                      className="mt-1 block w-full rounded-xl bg-white px-3 py-1.5 text-sm text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    >
                      <option value="ceil">ปัดขึ้นเป็นบาท</option>
                      <option value="round">ปัดตามหลักคณิต</option>
                      <option value="none">ไม่ปัด (มีเศษสตางค์)</option>
                    </select>
                  </label>
                  {inputGroups.length < 2 && (
                    <p className="text-[11px] font-semibold text-rose-500 sm:col-span-2">
                      ⚠ ต้องมีช่องกรอกอย่างน้อย 2 ช่อง (กว้าง/ยาว) ในแผงนี้ก่อน ถึงจะเลือกได้
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── แบบเดิม: ช่องกว้าง × ยาว ชุดเดียวต่อสินค้า (คงไว้ให้สินค้าที่ตั้งไว้แล้วใช้ต่อได้) ── */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-slate-200 pt-3">
          <div>
            <h3 className="text-xs font-bold text-slate-600">📏 แบบเดิม: ช่องกว้าง × ยาว ชุดเดียว</h3>
            <p className="mt-0.5 text-[11px] text-slate-400">
              ติ๊กแล้วลูกค้าเห็นกล่อง &ldquo;กำหนดขนาดเอง&rdquo; แยกต่างหาก และตัวเลือกกลุ่มอื่นจะถูกปิดไว้ ·
              งานใหม่แนะนำใช้ ✍️ ช่องกรอกด้านบนแทน (ยืดหยุ่นกว่า ไม่ปิดตัวเลือกอื่น)
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={draft.custom.enabled}
              onChange={(e) => patchCustom({ enabled: e.target.checked })}
              className="h-4 w-4 accent-amber-500"
            />
            เปิดใช้แบบเดิม
          </label>
        </div>

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
                  {/* "คิดตามพื้นที่" เลิกใช้แล้ว — โชว์เฉพาะสินค้าเก่าที่ยังตั้งค่านี้ค้างไว้ จะได้เปลี่ยนออกได้ */}
                  {draft.custom.mode === "area" && <option value="area">คิดตามพื้นที่ (อัตโนมัติ · เลิกใช้แล้ว)</option>}
                  <option value="quote">ให้แอดมินตีราคา (สอบถาม)</option>
                  <option value="size">ระบุขนาดตามที่ต้องการ (ราคาตามตารางปกติ)</option>
                  <option value="chat">ทักแชทคุยกับแอดมิน (คุยรายละเอียด)</option>
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
            ) : draft.custom.mode === "size" ? (
              <p className="rounded-xl bg-white px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
                มี<strong className="text-slate-700">ช่องกรอกกว้าง × ยาว</strong>ให้ลูกค้าระบุขนาดที่ต้องการ →
                <strong className="text-slate-700"> ราคายังคิดตามตารางราคาปกติ</strong> (ไม่ใช่ตามพื้นที่ ไม่ต้องรอตีราคา) ·
                ขนาดที่กรอกติดไปกับออเดอร์ให้ทีมผลิตเห็น — เหมาะกับงานที่ราคาเท่ากันแต่ลูกค้าเลือกขนาดเองได้
              </p>
            ) : draft.custom.mode === "chat" ? (
              <p className="rounded-xl bg-white px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
                <strong className="text-slate-700">ไม่มีช่องให้กรอก</strong> — หน้าสินค้าจะขึ้นข้อความชวนคุยรายละเอียด พร้อม
                <strong className="text-emerald-600"> ปุ่มทักไลน์</strong> · ลูกค้าจะทักมาคุยก่อน หรือกดสั่งไว้แบบ “รอตีราคา” ก็ได้ —
                เหมาะกับงานสั่งทำที่ต้องคุยแบบ/สเปกก่อนถึงจะตีราคาได้
              </p>
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
                    const on = draft.custom.keepOptions.some((l) => l.trim() === o.label.trim());
                    return (
                      <button
                        key={o.label}
                        type="button"
                        onClick={() =>
                          patchCustom({
                            keepOptions: on
                              ? draft.custom.keepOptions.filter((x) => x.trim() !== o.label.trim())
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
                    คละลายขั้นต่ำลายละ ({draft.pricing.unit || "ชิ้น"})
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
                    title={`ช่วงราคาปลีก คละลายได้อิสระไม่ติดขั้นต่ำต่อลาย เช่น ใส่ 11 = สั่ง 1-10 ${draft.pricing.unit || "ชิ้น"}คละอิสระ`}
                  >
                    คละอิสระเมื่อต่ำกว่า ({draft.pricing.unit || "ชิ้น"})
                    <input
                      value={activeMeta.freeMixBelowQty}
                      onChange={(e) => patchActiveMeta({ freeMixBelowQty: e.target.value })}
                      inputMode="numeric"
                      placeholder="เช่น 11"
                      className="w-24 rounded-xl bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-300"
                    />
                  </label>
                  {/* 🖼 ภาพประจำเรท — สินค้าที่ใช้เรทเป็น "แบบสินค้า" (เช่น สายคล้องหลายแบบ) ลูกค้าเห็นหน้าตาบนการ์ดเลือกเรท */}
                  <div className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                    ภาพประจำเรท
                    <span className="flex items-center gap-1.5">
                      <label
                        className="cursor-pointer"
                        title="ภาพประจำเรทนี้ — โชว์บนการ์ดเลือกเรทหน้าร้าน และกดเลือกแล้วแกลเลอรีสลับไปภาพนี้"
                      >
                        {activeMeta.imageSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={activeMeta.imageSrc}
                            alt={`ภาพของเรท ${activeMeta.label || rateIdx + 1}`}
                            className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-200 hover:ring-teal-300"
                          />
                        ) : (
                          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-[13px] text-slate-300 ring-1 ring-slate-200 hover:text-teal-500 hover:ring-teal-300">
                            🖼
                          </span>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          aria-label="อัปโหลดภาพประจำเรทนี้"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (!f) return;
                            const src = await uploadChoiceImage(f);
                            if (src) patchActiveMeta({ imageSrc: src });
                          }}
                        />
                      </label>
                      {activeMeta.imageSrc && (
                        <button
                          type="button"
                          onClick={() => patchActiveMeta({ imageSrc: undefined })}
                          title="เอาภาพประจำเรทนี้ออก"
                          className="rounded-full px-1 text-[11px] font-bold text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  </div>
                  <p className="w-full text-[11px] text-slate-400">
                    💡 เช่น เรท 2 สั่งรวม 50 ขึ้นไป + ลายละ 25 → สั่ง 50 {draft.pricing.unit || "ชิ้น"}คละได้ 2 ลายในราคา ·
                    ใส่ &quot;คละเกินโควตา ลายละ +฿&quot; (เช่น 10) = ลูกค้าเพิ่มลายเกินโควตาได้ โดยจ่ายเพิ่มลายละ 10 บาท · เว้นว่าง = คละเกินไม่ได้ · ทุกเรทใช้คอลัมน์ตัวเลือกชุดเดียวกัน
                  </p>
                </div>

                {rateIdx === 0 ? (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                    หน่วยนับ
                    <select
                      value={showUnitText ? UNIT_OTHER : draft.pricing.unit}
                      onChange={(e) => {
                        const v = e.target.value;
                        // "อื่น ๆ" = กางช่องพิมพ์เอง โดยคงค่าเดิมไว้ให้แก้ต่อ (ไม่ล้างทิ้ง)
                        if (v === UNIT_OTHER) return setUnitOther(true);
                        setUnitOther(false);
                        patchPricing({ unit: v });
                      }}
                      className="w-28 rounded-xl bg-slate-50 px-3 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                      aria-label="หน่วยนับ"
                    >
                      <option value="">— เลือกหน่วย —</option>
                      {UNIT_PRESETS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                      <option value={UNIT_OTHER}>อื่น ๆ (พิมพ์เอง)…</option>
                    </select>
                    {/* หน่วยนอกลิสต์ (เช่นที่นำเข้ามาเพี้ยน) ต้องแก้ได้ ไม่งั้นบันทึกทีเดียวค่าเดิมหาย */}
                    {showUnitText && (
                      <input
                        value={draft.pricing.unit}
                        onChange={(e) => patchPricing({ unit: e.target.value })}
                        placeholder="ชิ้น"
                        className="w-24 rounded-xl bg-white px-3 py-1.5 text-sm ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                        aria-label="พิมพ์หน่วยนับเอง"
                      />
                    )}
                  </label>
                  <div>
                    <span className="text-xs font-semibold text-slate-500">คอลัมน์อิงตามกลุ่ม:</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {draft.options.length === 0 && (
                        <span className="text-[11px] text-slate-400">ต้องมีกลุ่มตัวเลือกก่อน</span>
                      )}
                      {/* ช่องกรอกไม่โผล่ในลิสต์คอลัมน์ — ค่าที่ลูกค้าพิมพ์เองไม่มีวันตรงกับคีย์ในตาราง */}
                      {draft.options.filter((o) => o.display !== "input").map((o) => {
                        const on = draft.pricing.driverLabels.includes(o.label);
                        // กลุ่มติ๊กหลายอย่างเป็นคอลัมน์ไม่ได้ — ราคาต่อคอลัมน์อิงตัวเลือกเดียวเท่านั้น
                        const multi = o.display === "multi";
                        return (
                          <button
                            key={o.label}
                            type="button"
                            disabled={multi && !on}
                            title={
                              multi
                                ? "กลุ่มนี้ตั้งเป็น ☑ ติ๊กหลายอย่าง — เป็นคอลัมน์ตารางราคาไม่ได้ (เปลี่ยนเป็นปุ่มแยก/dropdown ก่อน)"
                                : undefined
                            }
                            onClick={() => toggleDriver(o.label)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                              on
                                ? "bg-amber-500 text-white shadow"
                                : multi
                                  ? "bg-white text-slate-300 ring-1 ring-slate-100"
                                  : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-amber-50"
                            }`}
                          >
                            {on ? "✓ " : ""}
                            {o.label}
                            {multi ? " ☑" : ""}
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
                          placeholder={`ชื่อช่วง เช่น 1-10 ${draft.pricing.unit || "ชิ้น"}`}
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
                          {/* ชิ้นที่ได้ต่อ 1 หน่วยสั่ง — ของขายเป็นเซ็ต/เป็นแผ่น กรอกตรงนี้ที่เดียว ใช้ร่วมทุกเรท */}
                          {perUnitInTable && (
                            <th
                              className="whitespace-nowrap px-2 py-2 text-center font-bold text-teal-700"
                              title="1 หน่วยที่ลูกค้าสั่ง ได้ของกี่ชิ้น เช่น เซ็ตละ 5 ชิ้น / สติกเกอร์ 45 ดวงต่อแผ่น — ใช้เป็นเพดานจำนวนลายที่คละได้ (เว้นว่าง = 1 ชิ้นต่อหน่วย)"
                            >
                              📐 ชิ้น/หน่วย
                            </th>
                          )}
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
                          // แถวที่ยังไม่กรอกราคาเลย = หน้าร้านซ่อนตัวเลือกนี้ — ย้อมแถวให้เห็นชัด ๆ
                          const emptyRow = activeTiers.every((_, ti) => !String(activeCells[key]?.[ti] ?? "").trim());
                          const rowBg = emptyRow ? "bg-rose-50/70" : ci % 2 ? "bg-slate-50" : "bg-white";
                          return (
                            // ชื่อตัวเลือกซ้ำกัน = คีย์คอลัมน์ซ้ำ — ต่อ index กัน React ทิ้งแถวซ้ำไปเงียบ ๆ
                            <tr key={`${key}#${ci}`} className="border-t border-slate-100">
                              <td
                                className={`sticky left-0 z-10 max-w-[220px] px-3 py-2 align-middle font-medium leading-tight text-slate-700 ${rowBg}`}
                                title={combo.length ? combo.join(" · ") : "ทุกจำนวน"}
                              >
                                {/* คู่ตัวเลือก 4 กลุ่มยาวเกินคอลัมน์ — แยกบรรทัดละกลุ่ม + ย่อคำในวงเล็บ */}
                                {combo.length ? (
                                  combo.map((part, pi) => (
                                    <span key={pi} className={`block whitespace-nowrap ${pi === 0 ? "" : "text-slate-500"}`}>
                                      <span className="mr-1 text-slate-400">•</span>
                                      {shortChoice(part)}
                                    </span>
                                  ))
                                ) : (
                                  `ราคา / ${draft.pricing.unit || "หน่วย"}`
                                )}
                                {emptyRow && combo.length > 0 && (
                                  <span
                                    className="mt-0.5 inline-block rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600"
                                    title="ยังไม่กรอกราคาแถวนี้ — หน้าร้านจะไม่แสดงตัวเลือกนี้ กรอกราคาแล้วจะขึ้นเอง"
                                  >
                                    หน้าร้านซ่อน
                                  </span>
                                )}
                              </td>
                              {perUnitInTable && (
                                <td className={`px-2 py-2 text-center ${rowBg}`}>
                                  <input
                                    value={perUnitOfCombo(combo)}
                                    onChange={(e) => setPerUnitOfCombo(combo, e.target.value)}
                                    inputMode="numeric"
                                    placeholder="1"
                                    title="1 หน่วยที่สั่ง ได้ของกี่ชิ้น (เว้นว่าง = 1)"
                                    className="w-14 rounded-lg border border-teal-200 bg-teal-50/50 px-2 py-1 text-center text-sm text-teal-800 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200"
                                    aria-label={`ชิ้นต่อหน่วยของ ${combo.join(" ")}`}
                                  />
                                </td>
                              )}
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
                {/*
                  กลุ่มที่บอก "ชิ้น/หน่วย" แต่ไม่ได้เป็นคอลัมน์ของตาราง (ราคาไม่ได้ต่างกันตามกลุ่มนี้)
                  — กรอกที่นี่แทน ตารางข้างบนไม่มีแถวให้กรอก
                */}
                {perUnitCandidates.length > 0 && (
                  <div className="rounded-2xl bg-teal-50/70 p-3 ring-1 ring-teal-100">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-teal-800">📐 ชิ้น/หน่วย</span>
                      <span className="text-[11px] text-teal-700">
                        สั่ง 1 {draft.pricing.unit || "หน่วย"} ได้ของกี่ชิ้น — คิดตามกลุ่ม
                      </span>
                      <select
                        value={perUnitGroup?.label ?? ""}
                        // เปลี่ยนไปกลุ่มอื่น/ปิดใช้ = ล้างตัวเลขของกลุ่มเดิม ไม่งั้นค่าค้างอยู่ในข้อมูลแบบมองไม่เห็น
                        onChange={(e) => {
                          const old = perUnitGroup?.label;
                          if (old && old !== e.target.value)
                            patch({
                              options: draft.options.map((o) =>
                                o.label === old ? { ...o, choices: o.choices.map((c) => ({ ...c, perUnit: "" })) } : o
                              ),
                            });
                          setPerUnitPick(e.target.value);
                        }}
                        className="rounded-lg border border-teal-200 bg-white px-2 py-1 text-[11px] font-semibold text-teal-800 focus:outline-none"
                      >
                        <option value="">— ไม่ใช้ (1 หน่วย = 1 ชิ้น) —</option>
                        {perUnitCandidates.map((o) => (
                          <option key={o.label} value={o.label}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(perUnitGroup?.choices ?? []).map((c, ci) => (
                        <label
                          key={`${c.name}#${ci}`}
                          className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-teal-200"
                        >
                          {shortChoice(c.name) || `ตัวเลือกที่ ${ci + 1}`}
                          <input
                            value={c.perUnit ?? ""}
                            onChange={(e) => setPerUnitOfChoice(perUnitGroup!.label, ci, e.target.value)}
                            inputMode="numeric"
                            placeholder="1"
                            className="w-12 rounded-lg border border-teal-200 bg-teal-50/50 px-1 py-0.5 text-center text-[11px] text-teal-800 focus:border-teal-400 focus:outline-none"
                            aria-label={`ชิ้นต่อหน่วยของ ${c.name}`}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {(perUnitInTable || perUnitCandidates.length > 0) && (
                  <p className="rounded-xl bg-teal-50/70 px-2.5 py-2 text-[11px] leading-relaxed text-teal-800 ring-1 ring-teal-100">
                    📐 <strong className="font-bold">ชิ้น/หน่วย</strong> = สั่ง 1 {draft.pricing.unit || "หน่วย"} ได้ของกี่ชิ้น — ของขายเป็นเซ็ต/เป็นแผ่นใส่ตรงนี้ (เซ็ตละ 5 ชิ้น = 5)
                    <br />
                    คละ 1 ลายใช้อย่างน้อย 1 ชิ้น → ลูกค้าคละลายได้ไม่เกิน{" "}
                    <strong className="font-bold">ชิ้น/หน่วย × จำนวนที่สั่ง</strong> (สั่ง 1 เซ็ต 5 ชิ้น = คละได้ 5 ลาย) · เว้นว่าง = 1 ชิ้นต่อหน่วยตามปกติ
                    {!perUnitInTable && (
                      <>
                        <br />
                        ตารางนี้มีหลายกลุ่มเป็นแกน (หรือไม่มีแกนเลย) — กรอกที่แผง 📐 ด้านบนแทนช่องในตาราง
                      </>
                    )}
                  </p>
                )}
              </div>
            );
          })()}
          </div>
        </div>
      )}

      {/* เนื้อหารายละเอียดสินค้า — 2 โซน: ข้างแผงสั่งซื้อ / ใต้แผงสั่งซื้อเต็มความกว้าง */}
      {bodyCard("side")}
      {bodyCard("wide")}

      {/* แท็บข้อมูลสินค้า — แสดงเป็นแถบแท็บท้ายหน้าสินค้า (แบบหน้ารายการราคาเว็บเดิม) */}
      <section className="relative mt-4 rounded-2xl border border-l-4 border-slate-200/70 border-l-sky-400 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-sky-800">📑 แท็บข้อมูลสินค้า ({draft.tabs.length} แท็บ)</h2>
          <button
            type="button"
            onClick={() =>
              patch({
                tabs: [
                  ...draft.tabs,
                  { title: "", text: "", html: "", images: [], imagePos: "bottom", imageSize: "auto", imageAlign: "left" },
                ],
              })
            }
            className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
          >
            ＋ เพิ่มแท็บ
          </button>
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
          แสดงเป็นแถบแท็บท้ายหน้าสินค้า เช่น รายละเอียดเพิ่มเติม · วิธีสั่งงาน · การรับประกันสินค้า —
          พิมพ์และจัดรูปแบบได้ในตัวเขียนเลย (ตัวหนา · สี · ขนาด · จัดวาง · ตาราง · ลิงก์) ·{" "}
          <strong>ลากรูปมาวางบนแท็บได้เลย</strong> (สูงสุด {MAX_TAB_IMAGES} รูป/แท็บ)
        </p>
        {draft.tabs.length === 0 && (
          <p className="rounded-2xl bg-slate-50 p-4 text-center text-xs text-slate-400">
            ยังไม่มีแท็บ — กด &ldquo;เพิ่มแท็บ&rdquo; เพื่อใส่ เช่น รายละเอียดเพิ่มเติม / วิธีสั่งงาน / การรับประกันสินค้า
          </p>
        )}
        <div className="space-y-3">
          {draft.tabs.map((t, i) => (
            <div
              key={i}
              onDragOver={(e) => {
                e.preventDefault();
                // ลากรูปเดิมสลับตำแหน่งอยู่ = ไม่ใช่การอัปโหลดไฟล์ใหม่ ไม่ต้องไฮไลต์การ์ด
                if (!dragTabImgRef.current) setTabDragOver(i);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setTabDragOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setTabDragOver(null);
                if (dragTabImgRef.current) return;
                void uploadTabImages(i, e.dataTransfer.files);
              }}
              className={`rounded-2xl p-3 transition ${
                tabDragOver === i ? "bg-amber-50 ring-2 ring-amber-400" : "bg-slate-50 ring-1 ring-slate-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs font-bold text-slate-400">แท็บ {i + 1}</span>
                <input
                  value={t.title}
                  onChange={(e) => patch({ tabs: draft.tabs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
                  placeholder="ชื่อแท็บ เช่น รายละเอียดเพิ่มเติม"
                  className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-sm font-bold ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
                <FoldBtn folded={isTabFolded(i)} onClick={() => toggleTabFold(i)} what="แท็บ" />
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => {
                    const c = [...draft.tabs];
                    [c[i - 1], c[i]] = [c[i], c[i - 1]];
                    patch({ tabs: c });
                    setTabFolded((f) => foldAfterSwap(f, i - 1, i, draft.tabs.length));
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
                    setTabFolded((f) => foldAfterSwap(f, i, i + 1, draft.tabs.length));
                  }}
                  className="rounded-full px-2.5 py-1 text-xs text-slate-500 ring-1 ring-slate-200 hover:bg-white disabled:opacity-30"
                  aria-label="เลื่อนแท็บไปถัดไป"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => {
                    patch({ tabs: draft.tabs.filter((_, j) => j !== i) });
                    setTabFolded((f) => foldAfterRemove(f, i, draft.tabs.length));
                  }}
                  className="rounded-full px-2.5 py-1 text-xs font-bold text-rose-500 ring-1 ring-rose-200 hover:bg-rose-50"
                >
                  ลบ
                </button>
              </div>
              {isTabFolded(i) ? (
                <p className="mt-2 truncate text-xs text-slate-400">
                  {t.images.length > 0 && <span className="mr-1 font-semibold text-slate-500">🖼 {t.images.length} รูป ·</span>}
                  {t.html ? (
                    <span className="font-semibold text-sky-600">✍️ จัดรูปแบบไว้ — กด “กาง” เพื่อแก้</span>
                  ) : t.text.trim()
                    ? `${t.text.trim().split("\n").filter(Boolean).length} บรรทัด · ${t.text.trim().split("\n")[0]}`
                    : "ยังไม่มีเนื้อหา — กด “กาง” เพื่อพิมพ์"}
                </p>
              ) : (
                <>
                  {/* ตัวเขียนจัดรูปแบบ — ขึ้นให้เลยทุกแท็บ (ข้อความเดิมแบบ • / ::หัวข้อ:: แปลงให้อัตโนมัติ) */}
                  <div className="mt-2">
                    <RichEditor
                      initialHtml={t.html || tabTextToHtml(t.text)}
                      onChange={(html) => patch({ tabs: draft.tabs.map((x, j) => (j === i ? { ...x, html } : x)) })}
                    />
                  </div>
                  {/* รูปประกอบของแท็บ — ลากไฟล์มาวางที่การ์ดแท็บ หรือกดช่อง ＋ (แสดงใต้ข้อความในหน้าสินค้า) */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">
                      รูปประกอบ ({t.images.length}/{MAX_TAB_IMAGES}):{" "}
                      <span className="font-normal text-slate-400">
                        ลากรูปมาวางที่แท็บนี้ได้เลย{t.images.length > 1 ? " · ลากรูปย่อสลับตำแหน่งได้" : ""}
                      </span>
                    </span>
                    {t.images.map((src, k) => (
                      <div
                        key={`${src}-${k}`}
                        draggable
                        onDragStart={(e) => {
                          dragTabImgRef.current = { tab: i, idx: k };
                          setDragTabImg({ tab: i, idx: k });
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          dragTabImgRef.current = null;
                          setDragTabImg(null);
                        }}
                        onDragOver={(e) => {
                          // รับเฉพาะรูปจากแท็บเดียวกัน (ไฟล์ใหม่ให้การ์ดแท็บจัดการ)
                          if (dragTabImgRef.current?.tab === i) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          const from = dragTabImgRef.current;
                          if (from?.tab !== i) return;
                          e.preventDefault();
                          e.stopPropagation();
                          moveTabImage(i, from.idx, k);
                          dragTabImgRef.current = null;
                          setDragTabImg(null);
                        }}
                        className={`group relative cursor-grab transition active:cursor-grabbing ${
                          dragTabImg?.tab === i && dragTabImg.idx === k ? "opacity-40" : ""
                        }`}
                        title="ลากเพื่อสลับตำแหน่ง"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt=""
                          draggable={false}
                          className="h-16 w-20 rounded-lg bg-white object-cover ring-1 ring-slate-200"
                        />
                        <span className="pointer-events-none absolute left-0.5 top-0.5 rounded-full bg-slate-900/70 px-1.5 text-[10px] font-bold text-white">
                          {k + 1}
                        </span>
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-0.5 pb-0.5 opacity-0 transition group-hover:opacity-100">
                          <button
                            type="button"
                            disabled={k === 0}
                            onClick={() => moveTabImage(i, k, k - 1)}
                            className="grid h-5 w-5 place-items-center rounded-full bg-white/90 text-[11px] font-bold text-slate-600 shadow disabled:opacity-30"
                            aria-label="เลื่อนรูปไปก่อนหน้า"
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              patch({
                                tabs: draft.tabs.map((x, j) =>
                                  j === i ? { ...x, images: x.images.filter((_, m) => m !== k) } : x,
                                ),
                              })
                            }
                            className="grid h-5 w-5 place-items-center rounded-full bg-white/90 text-[11px] font-bold text-rose-500 shadow"
                            aria-label="ลบรูปนี้"
                          >
                            ✕
                          </button>
                          <button
                            type="button"
                            disabled={k === t.images.length - 1}
                            onClick={() => moveTabImage(i, k, k + 1)}
                            className="grid h-5 w-5 place-items-center rounded-full bg-white/90 text-[11px] font-bold text-slate-600 shadow disabled:opacity-30"
                            aria-label="เลื่อนรูปไปถัดไป"
                          >
                            ›
                          </button>
                        </div>
                      </div>
                    ))}
                    {t.images.length < MAX_TAB_IMAGES && (
                      <label
                        className={`grid h-16 w-20 cursor-pointer place-items-center rounded-lg border-2 border-dashed text-center transition ${
                          tabUploading === i
                            ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                            : "border-amber-300 text-amber-500 hover:bg-amber-50"
                        }`}
                      >
                        <span className="px-1 text-[10px] font-bold leading-tight">
                          {tabUploading === i ? "⏳ กำลังอัปโหลด…" : "＋ ลากวาง / เลือกรูป"}
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          multiple
                          disabled={tabUploading === i}
                          className="hidden"
                          onChange={(e) => {
                            const files = e.target.files;
                            void uploadTabImages(i, files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                  {/* วางรูปตรงไหน/ใหญ่แค่ไหนในหน้าสินค้า — มีรูปแล้วค่อยโชว์ */}
                  {t.images.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                      {/* ป้าย+ตัวเลือกจับกลุ่มเป็นก้อนเดียว — ตัดบรรทัดทีเดียวทั้งกลุ่ม ไม่ให้ป้ายค้างอยู่ท้ายบรรทัดก่อน */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-500">ตำแหน่งในหน้าสินค้า:</span>
                        <PickRow
                          value={t.imagePos}
                          options={[
                            { v: "bottom", label: "รูปอยู่ใต้ข้อความ" },
                            { v: "top", label: "รูปอยู่บนข้อความ" },
                          ]}
                          onPick={(v) => patch({ tabs: draft.tabs.map((x, j) => (j === i ? { ...x, imagePos: v } : x)) })}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-500">ขนาด:</span>
                        <PickRow
                          value={t.imageSize}
                          options={[
                            { v: "auto", label: "อัตโนมัติ (1 รูป = เต็มกว้าง)" },
                            { v: "sm", label: "เล็ก (3 รูป/แถว)" },
                            { v: "md", label: "กลาง (2 รูป/แถว)" },
                            { v: "lg", label: "ใหญ่ (เต็มความกว้าง)" },
                          ]}
                          onPick={(v) => patch({ tabs: draft.tabs.map((x, j) => (j === i ? { ...x, imageSize: v } : x)) })}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-500">จัดวาง:</span>
                        <PickRow
                          value={t.imageAlign}
                          options={[
                            { v: "left", label: "⬅ ชิดซ้าย" },
                            { v: "center", label: "⬌ กึ่งกลาง" },
                            { v: "right", label: "➡ ชิดขวา" },
                          ]}
                          onPick={(v) => patch({ tabs: draft.tabs.map((x, j) => (j === i ? { ...x, imageAlign: v } : x)) })}
                        />
                      </div>
                    </div>
                  )}
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
          {/*
            สถานะเผยแพร่ — ตั้งได้ทั้งที่หน้ารายการสินค้าและตรงนี้
            (เก็บใน data.hidden · ยังไม่เผยแพร่ = หน้าร้านซ่อนทุกทาง แม้เปิดลิงก์ตรง)
            อยู่บนสุดของแถบข้าง เพราะเป็นสวิตช์ที่ตัดสินว่า "ลูกค้าเห็นหรือยัง"
          */}
          <div className={`rounded-2xl border p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${draft.hidden ? "border-rose-200 bg-rose-50/50" : "border-sky-200 bg-sky-50/50"}`}>
            <p className="mb-1 text-xs font-semibold text-slate-500">{draft.hidden ? "📝 สถานะ: ยังไม่เผยแพร่" : "🌐 สถานะ: เผยแพร่แล้ว"}</p>
            <p className={`mb-2.5 text-xs leading-relaxed ${draft.hidden ? "text-rose-700" : "text-sky-800"}`}>
              {draft.hidden
                ? "ลูกค้าไม่เห็นสินค้านี้ทั้งในหน้ารายการ หน้าแรก ค้นหา และเปิดลิงก์ตรงก็ไม่เจอ — ทีมงานที่ล็อกอินยังเปิดพรีวิวได้"
                : "ลูกค้าเห็นสินค้านี้บนหน้าร้านแล้ว"}
            </p>
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, hidden: d.hidden ? undefined : true }))}
              className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                draft.hidden
                  ? "bg-sky-600 text-white hover:bg-sky-700"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {draft.hidden ? "🌐 เผยแพร่ขึ้นหน้าร้าน" : "เก็บกลับเป็นฉบับร่าง"}
            </button>
            <p className="mt-2 text-center text-[11px] text-slate-400">มีผลเมื่อกด 💾 บันทึก</p>
          </div>

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
        {/*
          section นี้รวม 3 เรื่องที่คนละประเด็นกัน — เดิมพาดหัวว่า "สั่งจำนวนมาก" อย่างเดียว
          แล้วเอา "บังคับแนบลาย" มาแทรกคั่นระหว่างหัวข้อกับช่องกรอกของตัวเอง
          คนอ่านเลยไม่รู้ว่าเลข 20 เป็นของหัวข้อไหน → แยกเป็นกล่องย่อย หัวข้อกับช่องกรอกอยู่ติดกันเสมอ
        */}
        <h2 className="text-sm font-bold text-lime-800">📦 เงื่อนไขการสั่ง &amp; ค่าจัดส่ง</h2>
        <p className="mt-1 text-xs text-slate-500">กติกาเฉพาะสินค้าตัวนี้ — 3 เรื่องแยกกัน ตั้งเฉพาะข้อที่ต้องใช้</p>

        {/* ① เช็คสต๊อกเมื่อสั่งเยอะ */}
        <div className="mt-3 rounded-xl bg-lime-50/60 p-3 ring-1 ring-lime-200">
          <p className="text-xs font-bold text-lime-900">📦 สั่งจำนวนมาก — เตือนให้เช็คสต๊อกก่อน</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">สั่งตั้งแต่</label>
            <input
              value={draft.bulkAskQty}
              onChange={(e) => patch({ bulkAskQty: e.target.value.replace(/\D/g, "") })}
              inputMode="numeric"
              placeholder={String(BULK_ASK_DEFAULT)}
              className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
            <span className="text-xs font-semibold text-slate-600">ชิ้นขึ้นไป</span>
            <span className="text-[11px] text-slate-400">
              {Number(draft.bulkAskQty) > 0
                ? `· ตอนนี้ใช้ ${Number(draft.bulkAskQty).toLocaleString("th-TH")} ชิ้น`
                : `· เว้นว่าง = ใช้ค่ากลาง ${BULK_ASK_DEFAULT} ชิ้น`}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
            ถึงจำนวนนี้ หน้าสินค้าจะเตือนให้ทักแอดมินเช็คสต๊อก/คิวผลิตก่อน — ลูกค้ายังสั่งได้ตามปกติ
            แต่ออเดอร์จะติดธง &ldquo;รอเช็คสต๊อก&rdquo; ให้ทีมยืนยันจำนวน
          </p>
        </div>

        {/* ② บังคับแนบลาย — คนละเรื่องกับข้อบน จึงแยกกล่อง */}
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

        {/* ②.5 คุยลายกับแอดมินก่อน — งานปัก/งานตีลาย ที่ต้องตกลงแบบกันก่อนเริ่มผลิต */}
        <div
          className={`mt-3 rounded-xl p-3 ring-1 ${
            draft.artworkConsult ? "bg-emerald-50/70 ring-emerald-300" : "bg-slate-50 ring-slate-200"
          }`}
        >
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={draft.artworkConsult}
              onChange={(e) => patch({ artworkConsult: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-emerald-500"
            />
            <span className="text-xs">
              <span className="block font-bold text-slate-700">💬 ต้องคุยลายกับแอดมินก่อนสั่ง</span>
              <span className="block text-slate-500">
                สำหรับงานปัก/งานตีลาย ที่ต้องคุยไฟล์กันก่อน — หน้าสินค้าจะขึ้นกล่องเขียว &ldquo;ทักไลน์ส่งลายให้แอดมินดู&rdquo;
                แล้วให้ลูกค้าติ๊กยืนยันว่าคุยแล้วถึงจะกดสั่งได้ · เปิดข้อนี้แล้ว &ldquo;บังคับแนบลาย&rdquo; ด้านบนจะไม่บังคับ
                (ไฟล์จริงตกลงกันในแชทอยู่แล้ว ลูกค้าแนบภาพตัวอย่างเพิ่มได้ตามสมัครใจ)
              </span>
            </span>
          </label>

          {draft.artworkConsult && (
            <div className="mt-2.5 space-y-2 pl-6">
              <label className="block text-[11px] font-bold text-slate-600">
                ข้อความที่ลูกค้าเห็น (เว้นว่าง = ใช้ข้อความกลางของระบบ)
                <textarea
                  value={draft.artworkConsultNote}
                  onChange={(e) => patch({ artworkConsultNote: e.target.value.slice(0, 400) })}
                  rows={2}
                  placeholder={CONSULT_NOTE_DEFAULT}
                  className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal leading-relaxed text-slate-800 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={draft.artworkConsultBlock}
                  onChange={(e) => patch({ artworkConsultBlock: e.target.checked })}
                  className="mt-0.5 h-4 w-4 accent-rose-500"
                />
                <span className="text-[11px]">
                  <span className="block font-bold text-slate-700">กดสั่งไม่ได้จนกว่าจะติ๊กว่าคุยแล้ว</span>
                  <span className="block text-slate-500">
                    เอาติ๊กออก = แค่แนะนำให้ทักก่อน ลูกค้ากดสั่งได้เลย (ออเดอร์จะติดหมายเหตุว่ายังไม่ได้คุย)
                  </span>
                </span>
              </label>
            </div>
          )}
        </div>

        {/* ③ ค่าจัดส่งเฉพาะสินค้านี้ — 2 ช่องที่เกี่ยวกัน อยู่กล่องเดียวกัน */}
        <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="text-xs font-bold text-slate-700">🚚 ค่าจัดส่งเฉพาะสินค้านี้</p>

        {/* 🚚 ของชิ้นใหญ่ที่ยังไงก็ต้องกล่องใหญ่ — มีในตะกร้าเมื่อไหร่ ระบบยกระดับค่าส่งให้เอง */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">ค่าส่งขั้นต่ำ</label>
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
        <div className="mt-3">
          <ShipTierBox
            title="📦 ค่าส่งตามจำนวนชิ้น (ของหนัก)"
            hint={
              <>
                เช่น แผ่นหินรองแก้ว: สั่ง 1 แผ่น = 50 บาท · ตั้งแต่ 5 แผ่น = 90 บาท — ระบบคิดจากจำนวนที่ลูกค้าสั่งเอง
                แล้วใช้<strong className="text-slate-500">ค่าที่แพงกว่า</strong>ระหว่างวิธีส่งที่เลือกกับค่าตามจำนวนนี้ ·
                ไม่ตั้ง = คิดตามวิธีส่งปกติ
              </>
            }
            value={{
              tiers: draft.shipTiers,
              mode: draft.shipTierMode,
              extra: draft.shipTierExtra,
              methodId: draft.shipTierMethodId,
            }}
            onChange={(v) =>
              patch({ shipTiers: v.tiers, shipTierMode: v.mode, shipTierExtra: v.extra, shipTierMethodId: v.methodId })
            }
            methods={shipMethods}
          />
        </div>

        {/* 🎛️ ขนาด/วัสดุมีผลกับกล่อง — ตั้งค่าส่งแยกตามตัวเลือกที่ลูกค้าเลือกได้ */}
        <div className="mt-3 rounded-xl bg-amber-50/60 p-3 ring-1 ring-amber-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-600">🎛️ ค่าส่งเฉพาะบางตัวเลือก (ขนาดมีผลกับค่าส่ง)</label>
            <button
              type="button"
              onClick={() => patch({ shipRules: [...draft.shipRules, { label: "", choices: [], shippingId: "", ...EMPTY_SHIP_TIERS }] })}
              className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-bold text-amber-700 hover:bg-amber-100"
            >
              ＋ เพิ่มเงื่อนไข
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            สินค้าชิ้นเดียวกันแต่คนละขนาด กล่องคนละใบ — เช่น &ldquo;ขนาด = A2, A1 → ขั้นต่ำ ส่งแมส&rdquo; ·
            ลูกค้าเลือกตัวเลือกที่เข้าเงื่อนไขเมื่อไหร่ ระบบใช้ค่าของข้อนั้นแทนค่ากลางด้านบน ·
            เข้าหลายข้อ = ใช้<strong className="text-slate-600">ข้อบนสุด</strong>
          </p>

          {draft.shipRules.length === 0 ? (
            <p className="mt-2 rounded-xl bg-white/70 p-3 text-center text-[11px] text-slate-400">
              ยังไม่มีเงื่อนไข — ทุกตัวเลือกใช้ค่าส่งกลางด้านบนเหมือนกันหมด
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {draft.shipRules.map((r, ri) => {
                const group = draft.options.find((o) => o.label === r.label);
                const setR = (p: Partial<DraftShipRule>) =>
                  patch({ shipRules: draft.shipRules.map((x, j) => (j === ri ? { ...x, ...p } : x)) });
                return (
                  <div key={ri} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      <span className="text-xs font-bold text-slate-400">ข้อ {ri + 1}</span>
                      <span className="text-xs font-semibold">เมื่อเลือก</span>
                      <select
                        value={r.label}
                        onChange={(e) => setR({ label: e.target.value, choices: [] })}
                        className="min-w-0 max-w-full rounded-xl bg-white px-2 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                        aria-label={`กลุ่มตัวเลือกของเงื่อนไขค่าส่งข้อที่ ${ri + 1}`}
                      >
                        <option value="">— เลือกกลุ่ม —</option>
                        {draft.options
                          .filter((o) => o.display !== "input")
                          .map((o) => (
                            <option key={o.label} value={o.label}>
                              {o.label}
                            </option>
                          ))}
                      </select>
                      {group && (
                        <>
                          <span className="text-xs font-semibold">= ตัวไหนก็ได้ใน:</span>
                          <button
                            type="button"
                            onClick={() => setR({ choices: group.choices.map((c) => c.name).filter(Boolean) })}
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-200"
                          >
                            ทั้งหมด
                          </button>
                          <button
                            type="button"
                            onClick={() => setR({ choices: [] })}
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-200"
                          >
                            ล้าง
                          </button>
                          <span className="text-[11px] text-slate-400">ติ๊กแล้ว {r.choices.length}</span>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => patch({ shipRules: draft.shipRules.filter((_, j) => j !== ri) })}
                        className="ml-auto shrink-0 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-500 hover:bg-rose-100"
                      >
                        🗑 ลบ
                      </button>
                    </div>

                    {group && (
                      <div className="mb-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-xl bg-slate-50 p-2 ring-1 ring-slate-100">
                        {group.choices.map((c) => {
                          const checked = r.choices.includes(c.name);
                          return (
                            <button
                              key={c.name}
                              type="button"
                              onClick={() =>
                                setR({
                                  choices: checked ? r.choices.filter((n) => n !== c.name) : [...r.choices, c.name],
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

                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <label className="text-xs font-semibold text-slate-600">🚚 ค่าส่งขั้นต่ำเมื่อเข้าเงื่อนไขนี้</label>
                      <select
                        value={r.shippingId}
                        onChange={(e) => setR({ shippingId: e.target.value })}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        aria-label={`ค่าส่งขั้นต่ำของเงื่อนไขข้อที่ ${ri + 1}`}
                      >
                        <option value="">— ใช้ค่าของสินค้า —</option>
                        {shipMethods.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} · {m.price} บาท
                          </option>
                        ))}
                      </select>
                    </div>

                    <ShipTierBox
                      title="📦 ค่าส่งตามจำนวนชิ้นของตัวเลือกนี้"
                      hint={
                        <>
                          ไม่ตั้ง = ใช้ตารางกลางด้านบน · ตั้งไว้ = ระบบ<strong className="text-slate-500">นับจำนวนแยก</strong>
                          จากขนาดอื่น แล้วคิดตามตารางนี้ (ขนาดใหญ่กล่องคนละใบ)
                        </>
                      }
                      value={r}
                      onChange={(v) => setR(v)}
                      methods={shipMethods}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
        {/* ↑ ปิดกล่อง ③ ค่าจัดส่งเฉพาะสินค้านี้ */}
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
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-500">
                    กฎที่ {ri + 1}
                    {/* ยุบอยู่ = สรุปกฎให้อ่านรู้เรื่องโดยไม่ต้องกาง */}
                    {isRuleFolded(ri) && (
                      <span className="ml-2 font-medium text-slate-400">
                        {rule.whenLabel || "— ยังไม่ตั้งเงื่อนไข —"}
                        {rule.whenLabel ? ` = ${rule.whenChoices.length} ตัว` : ""}
                        {rule.limitLabel ? ` → จำกัด ${rule.limitLabel} เหลือ ${rule.allow.length} ตัว` : ""}
                      </span>
                    )}
                  </span>
                  <FoldBtn folded={isRuleFolded(ri)} onClick={() => toggleRuleFold(ri)} what="กฎ" />
                  <button
                    type="button"
                    onClick={() => {
                      patch({ rules: draft.rules.filter((_, j) => j !== ri) });
                      setRuleFolded((f) => foldAfterRemove(f, ri, draft.rules.length));
                    }}
                    className="shrink-0 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-500 hover:bg-rose-100"
                  >
                    🗑 ลบ
                  </button>
                </div>
                {!isRuleFolded(ri) && (
                <>
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span className="font-semibold">เมื่อเลือก</span>
                  <select
                    value={rule.whenLabel}
                    onChange={(e) => setRule({ whenLabel: e.target.value, whenChoice: "", whenChoices: [] })}
                    className="min-w-0 max-w-full rounded-xl bg-white px-2 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    aria-label={`กลุ่มเงื่อนไขของกฎที่ ${ri + 1}`}
                  >
                    <option value="">— เลือกกลุ่ม —</option>
                    {/* กฎเงื่อนไขทำงานกับ "รายการตัวเลือก" — กลุ่มช่องกรอกไม่มีให้เทียบ */}
                    {draft.options
                      .filter((o) => o.display !== "input")
                      .map((o) => (
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
                      .filter((o) => o.label !== rule.whenLabel && o.display !== "input")
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
                </>
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

      {/* กล่องยืนยันของระบบ — แทน confirm() ของเบราว์เซอร์ทุกจุดในหน้านี้ */}
      {confirmBox}
    </div>
  );
}
