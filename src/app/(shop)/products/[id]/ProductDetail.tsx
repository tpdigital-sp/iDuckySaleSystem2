"use client";

import { productAutoSeo } from "@/lib/auto-seo";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  activeMatrix,
  areaPriceBreakdown,
  allowedChoices,
  formatInputValue,
  inputError,
  INPUT_MAX_LEN,
  isInputOption,
  sheetYieldCount,
  sizeInputPlan,
  unitYieldOf,
  isMadeToOrderOption,
  madeToOrderOn,
  optionActive,
  priceDriverLabels,
  MTO_LABEL,
  MTO_ON,
  needsQuote,
  parseInputValue,
  inputFeeOf,
  inputFeeWaived,
  inputFeeQuotaOf,
  inputFeeRateOf,
  inputMaxOf,
  customUnitPrice,
  customSizeError,
  longestSizePlan,
  customKeepsOption,
  productPath,
  DESIGN_LABEL,
  BACK_DESIGN_LABEL,
  backDesignActive,
  designFeeFor,
  feeBreakdown,
  unitAddOnBreakdown,
  formatPrice,
  formatPriceRange,
  getCategory,
  includedDesigns,
  isFreeMix,
  matrixChoiceAvailable,
  isSizeInputChoice,
  maxDesignsFor,
  mixFeePerUnit,
  mixMaxDesigns,
  mixRuleFor,
  mixSpread,
  mixTierFor,
  underMinPieces,
  mixUnitFee,
  choiceImage,
  optionExtraApplies,
  optionVisible,
  perUnitCapacity,
  priceMatrixKey,
  priceRange,
  qtyFromAreaOf,
  PRODUCTS,
  RATE_LABEL,
  resolveSelections,
  choiceBadgeOf,
  choiceExtraAtQty,
  optionFeeQty,
  extraTierBest,
  unitPieceCountOf,
  sizeFeeBreakdownOf,
  sizeFeeMaxPieces,
  shortComboParts,
  smallQtyFeeOf,
  groupAddOf,
  groupExtraOf,
  perSheetOf,
  sheetsPerUnitOf,
  sheetCountOf,
  choiceQtyUnit,
  tierIndex,
  tierQtyFor,
  unitPriceFor,
  lotPreviewFor,
  repriceCartGroups,
  needsStockCheck,
  artworkIsRequired,
  artworkConsultOf,
  consultTriggerLabels,
  CONSULT_LABEL,
  CONSULT_NOTE_DEFAULT,
  isMultiOption,
  exclusiveTag,
  hasChoiceQty,
  anyChoiceQty,
  choiceQtyMax,
  selectedPicks,
  formatMultiPick,
  joinMultiPicks,
  type MultiPick,
  type PriceRate,
  type Product,
  type ProductImage,
  type ProductOption,
  type ProductTab,
} from "@/lib/products";
import { LINE_URL } from "@/components/LineButton";
import { specEntries } from "@/components/SpecLines";
import {
  priceLinkUrl,
  readPriceLink,
  sanitizeSpecSelections,
  type PriceLinkSpec,
} from "@/lib/price-link";
import {
  fileHref,
  filesForSelections,
  formatFileSize,
  isMultiSide,
  previewOf,
  sideName,
  skinOf,
  slotsOf,
  PLACEMENT_LABEL,
  PLACEMENT_SPEC_LABEL,
  templateFrame,
  type DesignTemplate,
  type TemplateFrame,
  type TemplateSlot,
} from "@/lib/design-templates";
import TemplateStudio, { type Placement as StudioPlacement, type StudioResult } from "@/components/TemplateStudio";
import SlotStudio, { type SlotResult, type SlotShot } from "@/components/SlotStudio";
import { useCart } from "@/lib/cart-context";
import GiftPromoBadge from "@/components/GiftPromoBadge";
import { canAccessAdmin } from "@/lib/auth";
import { fetchProduct } from "@/lib/product-repo";
import ProductVisual from "@/components/ProductVisual";
import ProductCard from "@/components/ProductCard";
import ImageLightbox from "@/components/ImageLightbox";
import { uploadArtworkFile, checkArtworkFile } from "@/lib/artwork-upload";

/** จำโหมดสั่งของของพนักงาน (ลูกค้า/แอดมิน) ไว้ในเครื่อง — ค่าเริ่มต้นคือโหมดลูกค้าเสมอ */
const ADMIN_MODE_KEY = "iducky:product-order-mode";

/**
 * แยก "ข้อควรทราบ" เป็นข้อ ๆ — บรรทัดที่ขึ้นต้นด้วย * / ** / *** = ข้อใหม่
 * บรรทัดถัดไปที่ไม่ได้ขึ้นต้นด้วย * ถือเป็นบรรทัดต่อของข้อเดิม (คงการขึ้นบรรทัดไว้)
 */
/**
 * เนื้อหาในแท็บข้อมูลสินค้า — บรรทัดขึ้นต้น "•" = รายการมีจุดนำ ·
 * บรรทัดที่ครอบ/ลงท้ายด้วย "::" = หัวข้อย่อยตัวหนา · บรรทัดว่าง = เว้นช่วง
 */
/** สไตล์เนื้อหาแท็บที่จัดรูปแบบมาจากหลังบ้าน (HTML) — โทนเดียวกับข้อความแท็บแบบธรรมดา */
const TAB_PROSE =
  "[&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mt-1 " +
  "[&_strong]:font-medium [&_strong]:text-[var(--navy)] " +
  "[&_h1]:mt-3 [&_h1]:font-display [&_h1]:text-xl [&_h1]:text-[var(--navy)] " +
  "[&_h2]:mt-3 [&_h2]:font-display [&_h2]:text-lg [&_h2]:text-[var(--navy)] " +
  "[&_h3]:mt-3 [&_h3]:font-display [&_h3]:text-base [&_h3]:text-[var(--navy)] " +
  "[&_a]:font-semibold [&_a]:text-[var(--blue)] [&_a]:underline " +
  "[&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-2xl " +
  "[&_blockquote]:mt-2 [&_blockquote]:border-l-4 [&_blockquote]:border-[var(--blue)] [&_blockquote]:pl-3 " +
  "[&_table]:mt-3 [&_table]:w-full [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 " +
  "[&_iframe]:my-3 [&_iframe]:aspect-video [&_iframe]:w-full";

/**
 * โทนของหัวข้อในแท็บ — เดาจากคำขึ้นต้น/คำสำคัญ
 * เพื่อไม่ให้หัวข้อที่ความหมายตรงข้ามกัน ("รับเคลม" กับ "ไม่รับเคลม") หน้าตาเหมือนกันเป๊ะ
 * ลูกค้ากวาดตาผ่าน ๆ แล้วอ่านสลับลิสต์กันได้ง่ายมาก
 */
type TabTone = "ok" | "no" | "info" | "plain";
function tabTone(title: string): TabTone {
  const t = title.replace(/\s+/g, "");
  // เช็ค "ไม่/ห้าม/ยกเว้น" ก่อนเสมอ — ไม่งั้น "ไม่รับเคลม" จะไปเข้าเงื่อนไข "รับ"
  if (/ไม่รับ|ไม่ได้|ไม่คิด|ไม่มี|ห้าม|ยกเว้น|ข้อจำกัด|ข้อควรระวัง|ข้อยกเว้น/.test(t)) return "no";
  if (/^รับ|ทำได้|สั่งได้|เลือกได้|รวมอยู่|ฟรี|ข้อดี|จุดเด่น/.test(t)) return "ok";
  if (/ระยะเวลา|เวลา|ขั้นตอน|วิธี|หมายเหตุ|เงื่อนไข|ติดต่อ|จัดส่ง|ราคา|ขนาด/.test(t)) return "info";
  return "plain";
}
const TONE_ICON: Record<TabTone, string> = { ok: "✓", no: "✕", info: "!", plain: "•" };
const TONE_BULLET: Record<TabTone, string> = { ok: "✓", no: "✕", info: "•", plain: "•" };

interface TabLine {
  bullet: boolean;
  text: string;
}
interface TabBlock {
  title: string;
  tone: TabTone;
  lines: TabLine[];
}
/** แยกข้อความในแท็บเป็นบล็อกตามหัวข้อ `::หัวข้อ::` — บรรทัดที่ขึ้นต้นด้วย • คือรายการย่อย */
function parseTabText(text: string): TabBlock[] {
  const blocks: TabBlock[] = [];
  let cur: TabBlock = { title: "", tone: "plain", lines: [] };
  for (const raw of text.split("\n")) {
    const t = raw.trim();
    if (!t) continue;
    if (/^::.*::$|::$/.test(t)) {
      if (cur.title || cur.lines.length) blocks.push(cur);
      const title = t.replace(/^::|::$/g, "").trim();
      cur = { title, tone: tabTone(title), lines: [] };
      continue;
    }
    cur.lines.push({ bullet: t.startsWith("•"), text: t.replace(/^•\s*/, "") });
  }
  if (cur.title || cur.lines.length) blocks.push(cur);
  return blocks;
}

function ProductTabText({ tab }: { tab: ProductTab }) {
  const { text, images = [] } = tab;
  /** เนื้อหาแบบจัดรูปแบบ (ตัวเขียนหลังบ้าน) — มีแล้วใช้แทนข้อความธรรมดา */
  const rich = (tab.html ?? "").trim();
  const hasText = rich.length > 0 || text.trim().length > 0;
  // 🔍 รูปในแท็บที่กำลังขยายดู (index ในแท็บนี้) — -1 = ปิด · เลื่อนซ้าย/ขวาได้เฉพาะรูปในแท็บเดียวกัน
  const [zoom, setZoom] = useState(-1);
  const zoomStep = (d: number) => setZoom((z) => (z < 0 ? z : (z + d + images.length) % images.length));
  // ขนาดรูป: ถ้าแอดมินไม่ได้ตั้ง → เลือกให้เองตามจำนวนรูป (1 รูป = เต็มความกว้างแบบหน้า pricelist เดิม ·
  // 2 รูป = 2 คอลัมน์ · 3+ = 3 คอลัมน์) — รูปประกอบเดี่ยวมักเป็นอินโฟกราฟิก/ตัวอย่างวางแบบ ย่อเหลือ 1/3 แล้วอ่านไม่ออก
  // แอดมินเลือกขนาดเอง = ทำตามนั้น · ไม่ได้เลือก (อัตโนมัติ) = ตามจำนวนรูป
  const size = tab.imageSize ?? (images.length === 1 ? "lg" : images.length === 2 ? "md" : "sm");
  const imgW =
    size === "lg"
      ? "w-full"
      : size === "md"
        ? "w-full sm:max-w-[calc((100%-0.75rem)/2)]"
        : "w-full sm:max-w-[calc((100%-0.75rem)/2)] lg:max-w-[calc((100%-1.5rem)/3)]";
  // จัดวางรูปในแถว — ชิดซ้าย / กึ่งกลาง / ชิดขวา
  const align =
    (tab.imageAlign ?? (size === "lg" ? "center" : "left")) === "center"
      ? "justify-center"
      : tab.imageAlign === "right"
        ? "justify-end"
        : "justify-start";
  const gallery = images.length > 0 && (
    // เว้นช่องจากข้อความเฉพาะตอนมีข้อความ — แท็บที่มีแต่รูปจะได้ห่างขอบการ์ดเท่ากันทุกด้าน
    <div className={`flex flex-wrap gap-3 ${align} ${!hasText ? "" : tab.imagePos === "top" ? "pb-3" : "pt-3"}`}>
      {images.map((src, i) => (
        <button
          key={`${src}-${i}`}
          type="button"
          onClick={() => setZoom(i)}
          className={`${imgW} group relative block cursor-zoom-in overflow-hidden rounded-[18px] border-2 border-white bg-[var(--sky-50)] shadow-[0_6px_16px_rgba(44,129,196,.14)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(44,129,196,.18)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)]`}
          aria-label={`ขยายดู ${tab.title} รูปที่ ${i + 1}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`${tab.title} รูปที่ ${i + 1}`} loading="lazy" className="block w-full object-contain" />
          <span className="pointer-events-none absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-sm text-[var(--navy)] opacity-0 shadow transition group-hover:opacity-100">
            ⤢
          </span>
        </button>
      ))}
    </div>
  );
  const lightbox = zoom >= 0 && images[zoom] && (
    <ImageLightbox
      src={images[zoom]}
      alt={`${tab.title} รูปที่ ${zoom + 1}`}
      counter={images.length > 1 ? `${zoom + 1} / ${images.length}` : undefined}
      onPrev={images.length > 1 ? () => zoomStep(-1) : undefined}
      onNext={images.length > 1 ? () => zoomStep(1) : undefined}
      onClose={() => setZoom(-1)}
    />
  );
  return (
    <div className="space-y-2 font-[family-name:var(--font-looped)] text-[.86rem] leading-[1.75] text-[var(--navy-soft)]">
      {tab.imagePos === "top" && gallery}
      {/* HTML ผ่าน sanitize ฝั่งเซิร์ฟเวอร์ตั้งแต่ตอนบันทึกสินค้า (ตัดแท็ก script, on-handler, javascript:) */}
      {rich && <div className={`overflow-x-auto ${TAB_PROSE}`} dangerouslySetInnerHTML={{ __html: rich }} />}
      {!rich &&
        hasText &&
        (() => {
          const blocks = parseTabText(text);
          // หัวข้อกลาง ๆ (ไม่ได้/ได้/ข้อมูล) นับเป็น "ขั้นที่ N" ให้สายตามีตัวยึด
          // แท็บอย่าง "วิธีสั่งงาน" จะกลายเป็นขั้น 1-2-3 ทันที โดยแอดมินไม่ต้องพิมพ์เลขเอง
          let step = 0;
          return (
            <div className="ptab">
              {blocks.map((b, i) => {
                const lines = b.lines.map((l, k) =>
                  l.bullet ? (
                    <p key={k} className="ptab-li">
                      <i aria-hidden="true">{TONE_BULLET[b.tone]}</i>
                      <span>{l.text}</span>
                    </p>
                  ) : (
                    <p key={k} className="ptab-p">
                      {l.text}
                    </p>
                  ),
                );
                // ก้อนแรกที่ยังไม่มีหัวข้อ = ย่อหน้านำ พาดเต็มความกว้าง ไม่ต้องเป็นการ์ด
                if (!b.title) {
                  return (
                    <div key={i} className="ptab-lead">
                      {lines}
                    </div>
                  );
                }
                if (b.tone === "plain") step += 1;
                return (
                  <section key={i} className={`ptab-sec ${b.tone}`}>
                    <div className="ptab-head">
                      <span className="ptab-ico" aria-hidden="true">
                        {b.tone === "plain" ? step : TONE_ICON[b.tone]}
                      </span>
                      <h3 className="ptab-title">{b.title}</h3>
                    </div>
                    <div className="ptab-body">{lines}</div>
                  </section>
                );
              })}
            </div>
          );
        })()}
      {tab.imagePos !== "top" && gallery}
      {lightbox}
    </div>
  );
}

/**
 * กลุ่มการ์ด (display "cards") ที่มีตัวเลือกตั้งแต่กี่ตัวขึ้นไปถึงเรียงเป็น 2 คอลัมน์แบบกระชับ
 * — ลายฟิล์มเคลือบ 10 ลายเรียงเต็มความกว้างทำให้หน้ายาวจนต้องเลื่อนหา (ผู้ใช้ทัก 25 ส.ค. 69 ว่ารก)
 */
const CARDS_DENSE_FROM = 6;

function termLines(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/^[*•]/.test(t)) out.push(t.replace(/^[*•\s]+/, ""));
    else if (out.length) out[out.length - 1] += "\n" + t;
    else out.push(t);
  }
  return out.filter(Boolean);
}

/**
 * note ของกลุ่มตัวเลือกที่มีคำเน้น `**คำ**` — โชว์คำนั้นหนา+สีชมพูบนพื้นไฮไลต์ให้ลูกค้าสะดุดตา
 * (เช่น งานฟอยล์ต้องมีการ**เคลือบด้าน**) · ไม่มีเครื่องหมายก็แสดงเป็นข้อความธรรมดาตามเดิม
 */
function noteEmphasis(note: string) {
  const parts = note.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return note;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="mx-0.5 rounded bg-rose-50 px-1 py-px font-bold text-rose-600 ring-1 ring-rose-200">
        {part}
      </strong>
    ) : (
      part
    )
  );
}

/**
 * ตัวเลือกตั้งต้นตอนเปิดหน้าสินค้า — กลุ่มปกติเริ่มที่ตัวแรก
 * กลุ่ม "ติ๊กได้หลายอย่าง" เริ่มที่ยังไม่ติ๊กอะไรเลย (ของเสริม ไม่ควรบวกเงินให้เอง)
 */
function initialSelections(p: Product): Record<string, string> {
  const base = Object.fromEntries(
    p.options.map((o) => [o.label, isMultiOption(o) ? "" : (o.choices[0]?.name ?? "")])
  );
  // 📐 สินค้าที่ไม่มีขนาดมาตรฐาน (mtoAlways) — ติ๊ก "สั่งทำ" ให้ตั้งแต่แรก ช่องกรอกจะได้กางรอเลย
  return p.mtoAlways ? { ...base, [MTO_LABEL]: MTO_ON } : base;
}

/** ค่าที่เป็นตัวเลขจริงใช้ตามนั้น · Infinity (= ไม่จำกัด) ค่อยใช้ค่าสำรอง */
function finiteOr(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

/**
 * แถบรูปย่อของแกลเลอรี — เลื่อนดู "ทีละชุด" ด้วยปุ่มลูกศรซ้าย/ขวา
 *
 * แกลเลอรีดูดภาพประจำตัวเลือกเข้ามาเองด้วย (ดู galleryImages) สินค้าที่มีตัวเลือกเยอะ ๆ
 * อย่างเคสมือถือจึงมีรูปย่อหลายสิบใบ — เดิมมีแต่ลากสกรอลล์ ลูกค้าจอคอมไม่มีอะไรให้กด
 * และไม่รู้ด้วยซ้ำว่ายังมีรูปต่ออยู่ทางขวา
 *
 *   • ปุ่มโผล่เฉพาะด้านที่ยังเลื่อนต่อได้ · ไล่สีจางขอบก็โชว์ตามด้านนั้น
 *   • 1 ชุด = ความกว้างที่มองเห็นอยู่ หัก 1 ใบไว้ให้เห็นว่าต่อกัน (ไม่งั้นดูเหมือนกระโดดข้าม)
 *   • เปลี่ยนรูปใหญ่ด้วยลูกศร/กดการ์ดตัวเลือก แถบนี้เลื่อนตามให้เอง รูปที่เลือกอยู่จะไม่หลุดจอ
 */
function GalleryThumbs({
  gallery,
  at,
  onPick,
  coverSrc,
}: {
  gallery: { emoji: string; gradient: string; label: string; src?: string; videoSrc?: string }[];
  at: number;
  onPick: (i: number) => void;
  /** รูปปกของสินค้า — ใช้กับช่องแรกที่ยังไม่ได้ตั้ง src เอง (กติกาเดียวกับรูปใหญ่) */
  coverSrc?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // เผื่อ 4px กันเศษทศนิยมของเบราว์เซอร์ทำให้ปุ่มค้างทั้งที่สุดทางแล้ว
    setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    sync();
    // จำนวนรูป/ความกว้างจอเปลี่ยน = ต้องคิดใหม่ว่ายังเลื่อนต่อได้ไหม
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sync, gallery.length]);

  /**
   * รูปใหญ่เปลี่ยน → เลื่อน "แถบรูปย่อ" (แนวนอน) ให้รูปที่เลือกอยู่โผล่ในจอ
   *
   * ⚠️ ห้ามใช้ scrollIntoView ตรงนี้ — แม้จะสั่ง block:"nearest" มันก็เลื่อน **ทั้งหน้า**
   *    ขึ้นไปหาแถบรูปย่อ (ซึ่งอยู่บนสุด) ด้วย · การเลือกตัวเลือกทำให้รูปใหญ่สลับเอง
   *    ลูกค้าที่กำลังเลือกอยู่ท้ายหน้า (เช่นตัวเลือกของ "ชิ้นที่ 2") เลยโดนดีดกลับขึ้นไปข้างบน
   *    ทุกครั้งที่กด — เลื่อนเองในกล่องแถบรูปย่อเท่านั้น หน้าเพจจะได้อยู่นิ่ง
   */
  useEffect(() => {
    const el = ref.current;
    const kid = el?.children[at] as HTMLElement | undefined;
    if (!el || !kid) return;
    const box = el.getBoundingClientRect();
    const thumb = kid.getBoundingClientRect();
    // เลื่อนเท่าที่จำเป็น (เหมือน inline:"nearest") + เผื่อขอบ 8px ให้เห็นว่ายังมีรูปถัดไป
    const delta =
      thumb.left < box.left ? thumb.left - box.left - 8 : thumb.right > box.right ? thumb.right - box.right + 8 : 0;
    if (!delta) return;
    el.scrollBy({ left: delta, behavior: "smooth" });
  }, [at]);

  const page = (d: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: d * Math.max(el.clientWidth - 75, 120), behavior: "smooth" });
  };

  return (
    <div className={`pgal-strip${edge.left ? " has-prev" : ""}${edge.right ? " has-next" : ""}`}>
      <div ref={ref} className="pgal-thumbs" onScroll={sync}>
        {gallery.map((img, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            className={`pgal-thumb${i === at ? " on" : ""}`}
            aria-label={img.videoSrc ? `ดูคลิป${img.label}` : `ดูรูป${img.label}`}
            aria-current={i === at || undefined}
          >
            <ProductVisual
              emoji={img.emoji}
              gradient={img.gradient}
              src={img.src ?? (i === 0 ? coverSrc : undefined)}
              alt={img.label}
              size="text-2xl"
              className="h-full w-full"
            />
            {/* ช่องที่เป็นคลิป — ติดปุ่มเล่นทับรูปย่อ ให้รู้ว่ากดแล้วเป็นวิดีโอ ไม่ใช่รูปนิ่ง */}
            {img.videoSrc && (
              <span className="pgal-play pointer-events-none">
                <span>▶</span>
              </span>
            )}
          </button>
        ))}
      </div>
      {([
        { d: -1, side: "prev", glyph: "‹", label: "ดูรูปย่อชุดก่อนหน้า", on: edge.left },
        { d: 1, side: "next", glyph: "›", label: "ดูรูปย่อชุดถัดไป", on: edge.right },
      ] as const).map((b) =>
        b.on ? (
          <button
            key={b.side}
            type="button"
            onClick={() => page(b.d)}
            aria-label={b.label}
            className={`pgal-snav ${b.side}`}
          >
            {b.glyph}
          </button>
        ) : null
      )}
    </div>
  );
}

export default function ProductDetail({
  product: initialProduct,
  /** 📐 เทมเพลตไฟล์งานที่ลูกค้าโหลดไปวางลายได้ (ดึงมาให้แล้วจากเซิร์ฟเวอร์) */
  templates = [],
  /** เปิดดูสินค้าที่ "ปิดการมองเห็น" อยู่ (เฉพาะทีมงานที่ล็อกอิน) — ขึ้นแถบเตือนไว้กันเข้าใจผิด */
  preview = false,
  /** ⭐ สรุปคะแนนรีวิวจริง (ฝั่งเซิร์ฟเวอร์) — มีเมื่อไหร่ใช้แทน rating ที่ตั้งมือใน JSON-LD */
  reviewStats = null,
  /** 🧩 สินค้าอื่นในหมวดเดียวกัน (ของจริงจากฐานข้อมูล — มีรูปสินค้า) */
  related: relatedFromServer,
}: {
  product: Product;
  templates?: DesignTemplate[];
  preview?: boolean;
  reviewStats?: { avg: number; count: number } | null;
  related?: Product[];
}) {
  const [product, setProduct] = useState<Product>(initialProduct);
  const category = getCategory(product.category);
  const { addItem, removeItem, items: cartItems, productOf } = useCart();
  const router = useRouter();
  const [imageIndex, setImageIndex] = useState(0);
  // แท็บข้อมูลสินค้า (รายละเอียดเพิ่มเติม / วิธีสั่งงาน ฯลฯ)
  const [tabIndex, setTabIndex] = useState(0);
  /**
   * จำนวนตั้งต้น — สินค้าที่บังคับขั้นต่ำต่อลาย (hardMinPerDesign) เปิดหน้ามาก็เริ่มที่ขั้นต่ำเลย
   * (เริ่มที่ 1 แล้วให้ลูกค้าเจอปุ่มล็อก "ขั้นต่ำ 5 ชิ้น" เอง = เสียจังหวะฟรี)
   */
  const initialQty = Math.max(
    initialProduct.hardMinPerDesign ? (initialProduct.priceRates?.[0]?.minPerDesign ?? 1) : 1,
    // ขั้นต่ำต่อออเดอร์ของเรทแรก (hardMinQty) เช่น สติ๊กเกอร์ UV เริ่มขายที่ 3 แผ่น A3
    // — ยกเว้นเรทที่นับขั้นต่ำทั้งล็อต (minQtyScope: "lot") เริ่มที่ 1 แผ่น แล้วบอกขั้นต่ำไว้ข้างช่องจำนวนแทน
    //   (ลูกค้าส่วนใหญ่จะกด ➕ เพิ่มอีกแผ่น ทีละแผ่นอยู่แล้ว เริ่มที่ 3 เลยไม่ตรงกับวิธีสั่งจริง)
    initialProduct.hardMinQty && initialProduct.priceRates?.[0]?.minQtyScope !== "lot"
      ? (initialProduct.priceRates?.[0]?.minQty ?? 1)
      : 1,
    1
  );
  const [qty, setQty] = useState(initialQty);
  /**
   * 📦 "สั่งหลายแผ่นในครั้งเดียว" — สเปคที่พักไว้ก่อนกดสั่งรวดเดียว
   * ใช้กับสินค้าที่ขั้นต่ำนับทั้งล็อต (minQtyScope: "lot") เช่นสติ๊กเกอร์ UV ขั้นต่ำ 3 แผ่น A3
   * ที่คละไดคัท/คละขนาดกันได้ — ลูกค้าตั้งสเปคแผ่นที่ 1 → พักไว้ → ตั้งแผ่นที่ 2 … แล้วกดสั่งทีเดียว
   * (แต่ละแผ่นลงตะกร้าเป็นคนละบรรทัด อยู่ล็อตเดียวกัน ราคาคิดตามยอดรวม)
   */
  const [sheets, setSheets] = useState<{ id: string; selections: Record<string, string>; qty: number }[]>([]);
  /** เพิ่งกด "พักสเปคแผ่นนี้" — โชว์ป้ายยืนยันสั้น ๆ */
  const [staged, setStaged] = useState(false);
  /** ลูกค้าปรับจำนวนเองแล้วหรือยัง — ยังไม่ปรับ = จำนวนเดินตามขั้นต่ำของเรทที่เลือกไปเรื่อย ๆ */
  const [qtyTouched, setQtyTouched] = useState(false);
  // 🔍 รูปที่กำลังเปิดดูขนาดใหญ่ (lightbox) — ว่าง = ปิดอยู่
  const [zoomSrc, setZoomSrc] = useState("");
  /** 🎨 สีที่แตะล่าสุดของแต่ละกลุ่มสวอตช์ (คีย์ = ชื่อกลุ่ม) — โชว์แถบพรีวิวใหญ่ใต้ตาราง */
  const [swatchTap, setSwatchTap] = useState<Record<string, string>>({});
  /**
   * รูปทั้งหมดที่เลื่อนดูใน lightbox ได้ (เรียงตามแกลเลอรี เฉพาะช่องที่มีไฟล์รูปจริง)
   * รูปประกอบในเนื้อหา (section) ไม่อยู่ในลิสต์นี้ — เปิดดูเดี่ยว ๆ ไม่มีลูกศร
   */
  /**
   * รูปในแกลเลอรี = รูปของสินค้า + รูปประจำเรท/ประจำตัวเลือก ที่ไม่ได้อยู่ในแกลเลอรี
   *
   * ถ้าไม่เติมให้ กดเลือกเรท/ตัวเลือกนั้นแล้ว "ภาพไม่เปลี่ยน" เพราะระบบหาภาพในแกลเลอรีไม่เจอ
   * (เจอกับสแตนดี้แบบที่ 4 มาแล้ว — รูปเรทมี แต่ไม่ได้อยู่ในแกลเลอรี เลยเงียบไปเฉย ๆ
   *  และกับสติ๊กเกอร์สูญญากาศที่ภาพประจำขนาดมี 10 ใบ แต่แกลเลอรีเก็บได้แค่ 5 รูป)
   */
  const galleryImages = useMemo(() => {
    const list = [...product.images];
    const srcAt = (im: ProductImage, i: number) => im.src ?? (i === 0 ? product.imageSrc : undefined);
    const add = (raw: string | undefined, label: string, videoSrc?: string) => {
      const src = raw?.trim();
      if (!src) return;
      // ตัวเลือกที่มีคลิป: แกลเลอรีมีช่องคลิปเดียวกันอยู่แล้วก็ไม่เพิ่มซ้ำ (กดเลือกแล้ว jump หาด้วย videoSrc เจอ)
      if (videoSrc && list.some((im) => im.videoSrc === videoSrc)) return;
      if (list.some((im, i) => srcAt(im, i) === src)) return;
      list.push({ emoji: product.emoji, gradient: product.gradient, label, src, ...(videoSrc ? { videoSrc } : {}) });
    };
    for (const r of product.priceRates ?? []) add(r.imageSrc, r.label);
    for (const opt of product.options ?? []) {
      // กลุ่มสวอตช์สี/แถบตัวอย่าง: รูปเป็นชิปเล็กไว้โชว์บนปุ่มเท่านั้น — เข้าแกลเลอรีแล้วขยายเบลอ
      // (แถมทะลัก 80 รูปจากสีไหม / 26 แถบจากฟอนต์) · ดูรูปเต็มได้จาก chartSrc ในกลุ่มนั้นแทน
      if (opt.swatchGrid || opt.sampleGrid) continue;
      for (const c of opt.choices ?? []) {
        add(c.imageSrc, `${opt.label}: ${c.name}`, c.videoSrc);
        // ภาพสำรองที่สลับตามกลุ่มอื่น (ดู choiceImage) — ต้องอยู่ในแกลเลอรีด้วย ไม่งั้นกดเลือกแล้วภาพใหญ่ไม่ตาม
        for (const alt of c.imageWhen ?? []) add(alt.imageSrc, `${opt.label}: ${c.name}`);
      }
    }
    return list;
  }, [product]);
  const zoomList = useMemo(() => {
    // ช่องที่เป็นคลิปไม่เข้าลิสต์ซูม — กดขยายแล้วจะได้ภาพนิ่ง (โปสเตอร์) เฉย ๆ ทั้งที่ตั้งใจดูคลิป
    const srcs = galleryImages.map((img, i) =>
      img.videoSrc ? undefined : img.src ?? (i === 0 ? product.imageSrc : undefined)
    );
    if (!srcs.length && product.imageSrc) srcs.push(product.imageSrc);
    return srcs.filter((s): s is string => !!s);
  }, [galleryImages, product.imageSrc]);
  /**
   * 🖼 ตัวเลือก/เรทที่มีภาพประจำตัว — กดเลือกแล้วสลับแกลเลอรีไปที่ภาพนั้น
   * (ภาพที่ไม่มีในแกลเลอรีเลยก็แค่ไม่สลับ ภาพย่อบนปุ่มยังโชว์ตามปกติ)
   */
  const jumpToImage = (src?: string) => {
    if (!src) return;
    const i = galleryImages.findIndex(
      // จับคู่ได้ทั้งรูปนิ่งและคลิป — ตัวเลือกที่มีคลิปส่ง videoSrc มา จะเด้งไปช่องคลิปนั้นเล่นเลย
      (im, idx) => (im.src ?? (idx === 0 ? product.imageSrc : undefined)) === src || im.videoSrc === src
    );
    if (i >= 0) setImageIndex(i);
  };
  /** เลื่อนรูปใน lightbox แบบวน — ใช้ทั้งปุ่มลูกศรและคีย์บอร์ด (รูปที่เปิดอยู่ไม่อยู่ในลิสต์ = ไม่เลื่อน) */
  const zoomStep = (d: number) =>
    setZoomSrc((s) => {
      const i = zoomList.indexOf(s);
      return i === -1 || zoomList.length < 2 ? s : zoomList[(i + d + zoomList.length) % zoomList.length];
    });
  useEffect(() => {
    if (!zoomSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomSrc("");
      else if (e.key === "ArrowRight") zoomStep(1);
      else if (e.key === "ArrowLeft") zoomStep(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [zoomSrc]);
  // 🎬 คลิปบนการ์ดตัวเลือก: เบราว์เซอร์หยุดคลิปตอนแท็บถูกซ่อน และบางตัวไม่เล่นต่อให้ตอนกลับมา — ปลุกเอง
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState !== "visible") return;
      document.querySelectorAll<HTMLVideoElement>("video[data-card-clip]").forEach((v) => {
        if (v.paused) v.play().catch(() => {});
      });
    };
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  }, []);
  // ข้อความในช่องจำนวนระหว่างพิมพ์ — แยกจาก qty เพื่อให้ลบจนว่างแล้วพิมพ์ใหม่ได้
  const [qtyText, setQtyText] = useState(String(initialQty));
  useEffect(() => {
    // qty เปลี่ยนจากปุ่ม +/− หรือเด้งตามขั้นต่ำเรท → ปรับข้อความตาม (ตอนช่องว่างอยู่ = กำลังพิมพ์ ไม่ทับ)
    setQtyText((t) => (t === "" ? t : String(qty)));
  }, [qty]);
  const [added, setAdded] = useState(false);
  /** ล็อกกันกดปุ่ม "เพิ่มลงตะกร้า" รัว ๆ (แตะสองทีบนมือถือ = ได้สองรายการ) */
  const addLock = useRef(false);
  const [isAdmin, setIsAdmin] = useState(false);
  /**
   * 🧑‍💼 โหมดสั่งแทนลูกค้า — พนักงานหยิบของใส่ตะกร้าโดย "ไม่ต้องวางลายบนเว็บ"
   * (ลายมาทางไลน์/อีเมลอยู่แล้ว กราฟฟิกจัดไฟล์เอง) · จำค่าไว้ข้ามหน้า จะได้ไม่ต้องกดใหม่ทุกสินค้า
   */
  const [adminMode, setAdminMode] = useState(false);
  /** พนักงานเปิดโหมดแอดมินอยู่ไหม — เช็คสิทธิ์ควบเสมอ ลูกค้าทั่วไปจะไม่มีทางเข้าโหมดนี้ */
  const staffOrdering = isAdmin && adminMode;
  /**
   * 🔗 ลิงก์ราคาที่แอดมินส่งให้ลูกค้า (?s=…) — อ่านครั้งเดียวตอนเปิดหน้า
   * อ่านตอน render (ไม่ใช่ useEffect) เพราะต้องรู้ตั้งแต่ก่อนสินค้าโหลดเสร็จว่ามีค่ารออยู่
   * แต่ "ไม่เอาไปวาดอะไร" จนกว่าจะติ๊กค่าให้เสร็จ — ฝั่งเซิร์ฟเวอร์ไม่มี window จะได้ไม่ hydrate ไม่ตรง
   */
  const priceLinkRef = useRef<PriceLinkSpec | null | undefined>(undefined);
  if (priceLinkRef.current === undefined)
    priceLinkRef.current = typeof window === "undefined" ? null : readPriceLink(window.location.search);
  /** ติ๊กค่าจากลิงก์ราคาให้เรียบร้อยแล้ว — โชว์แถบบอกลูกค้าว่าร้านจัดสเปคไว้ให้ */
  const [fromPriceLink, setFromPriceLink] = useState(false);
  /**
   * ✏️ เปิดหน้าจากปุ่ม "แก้ไข" ในตะกร้า (?edit=<คีย์บรรทัด>) — บรรทัดเดิมถูกแทนที่ตอนกดบันทึก
   *
   * ⚠️ อ่านใน effect เท่านั้น ห้ามอ่านตอน render เหมือนลิงก์ราคา — กดมาจากตะกร้าเป็นการเปลี่ยนหน้าฝั่ง
   * ไคลเอนต์ ตอน render แรก window.location ยังเป็น /cart อยู่ (?edit= ยังไม่ขึ้น) จะได้ค่าว่างตลอด
   */
  const editKeyRef = useRef<string | null>(null);
  /** ติ๊กสเปคเดิมจากตะกร้ากลับมาครบแล้ว — เปลี่ยนแถบบอกสถานะ/ป้ายบนปุ่มเป็นโหมดแก้ไข */
  const [editing, setEditing] = useState(false);
  /**
   * ของในบรรทัดเดิมที่ "ประกอบใหม่จากหน้าจอไม่ได้" — ตำแหน่งลายที่วางบนเทมเพลต + ภาพแยกรายด้าน
   * (จอวางลายสร้างค่าพวกนี้ตอนวาง เก็บไว้แค่เป็นข้อความในตะกร้า แกะกลับเป็นสถานะไม่ได้)
   * จึงหิ้วค่าเดิมไปกับรายการที่บันทึกทับ ตราบใดที่ลายที่แนบยังครบเหมือนเดิม
   */
  const editCarryRef = useRef<{ keys: Record<string, string>; arts: string[] } | null>(null);
  /** โหลดสินค้าเวอร์ชันล่าสุดเสร็จหรือยัง — ต้องรอก่อนค่อยติ๊กค่าจากลิงก์ ไม่งั้นโดนทับ */
  const [productReady, setProductReady] = useState(false);
  /** แอดมินเพิ่งกดคัดลอกอะไร ("" = ยังไม่ได้กด · "long" = ตกไปใช้ลิงก์ยาว) */
  const [priceCopied, setPriceCopied] = useState("");
  /** กำลังสร้างลิงก์ราคาอยู่ — กันกดรัวแล้วได้ลิงก์ซ้ำหลายใบ */
  const [priceBusy, setPriceBusy] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>(() =>
    initialSelections(initialProduct)
  );
  /**
   * 🔽 กลุ่ม "ของเสริม" ที่ตั้ง collapsible ไว้ — ปิดอยู่เป็นค่าเริ่มต้น (เก็บชื่อกลุ่มที่ลูกค้ากดเปิด)
   * ปิด = ยังไม่กางตัวเลือก และค่าคงเป็นตัวแรกของกลุ่ม (ตัวที่ไม่คิดเงิน) จึงไม่ต้องรีเซ็ตอะไรตอนเปิด
   */
  const [openAddOns, setOpenAddOns] = useState<Record<string, boolean>>({});
  // งานกำหนดขนาดเอง (custom)
  const [useCustom, setUseCustom] = useState(false);
  const [customW, setCustomW] = useState("");
  const [customH, setCustomH] = useState("");
  // หมายเหตุถึงร้าน (แนบไปกับรายการในตะกร้า)
  const [note, setNote] = useState("");
  // ลิงก์ไฟล์ลาย / อีเมล (ไม่อัปโหลดขึ้นเว็บ — กันไฟล์ถูกบีบอัด)
  const [artLink, setArtLink] = useState("");
  // ภาพลายที่ลูกค้าแนบขึ้นเว็บ (เก็บไฟล์ต้นฉบับ — ใช้เป็นแนวทางให้กราฟฟิก)
  /**
   * ภาพลายที่แนบแล้ว · `preview` = ลิงก์ไฟล์ในเครื่อง (blob) ไว้วาดรูปย่อเท่านั้น
   * ไม่ใช่ค่าที่ส่งไปกับออเดอร์ — ตะกร้า/ใบงานใช้ `url` ที่อัปขึ้นสตอเรจเสมอ
   */
  const [artFiles, setArtFiles] = useState<
    { url: string; name: string; w: number; h: number; hash?: string; preview?: string }[]
  >([]);
  const [artBusy, setArtBusy] = useState(false);
  const [artErr, setArtErr] = useState("");
  const [artDrag, setArtDrag] = useState(false); // ลากไฟล์อยู่เหนือกล่องแนบลาย
  /**
   * 🖼 จอวางลายบนเทมเพลต — เปิดจากการ์ดเทมเพลต (null = ปิดอยู่)
   * ผลลัพธ์: ภาพที่ประกอบแล้วเข้าไปอยู่ในรายการลายที่แนบ + จดตัวเลขตำแหน่งไว้ให้ทีมผลิต
   */
  const [studio, setStudio] = useState<{
    title: string;
    frame: TemplateFrame;
    guideUrl?: string;
    skinUrl?: string;
    tplUrl?: string;
    perSheet?: number;
    /** เทมเพลตแบบมีช่อง (Theme) — มีค่า = เปิดจอวางรูปทีละช่องแทน */
    slots?: TemplateSlot[];
    slotsRequired?: boolean;
    initial?: { file?: File; url?: string; placement: StudioPlacement; swapped?: boolean };
  } | null>(null);
  const [placed, setPlaced] = useState<
    {
      summary: string;
      spec: string;
      sourceUrl?: string;
      /** ภาพที่ประกอบแล้วของลายนี้ — ผูกไว้กับตัวลายเลย ไม่ต้องไปหยิบจาก artFiles ตามลำดับ */
      artUrl: string;
      qty: number;
      /** ส่วนที่ทุกลายเหมือนกัน (ชื่อแบบ + ขนาด) และความคมชัดของลายนี้ */
      head: string;
      dpi: number;
      /** ของที่ใช้เปิดกลับมาแก้ไขให้เหมือนเดิม (ไฟล์ต้นฉบับ + ตำแหน่ง + แนวงาน) */
      sourceFile?: File;
      placement?: StudioPlacement;
      swapped?: boolean;
      /** โหมดช่อง (Theme) — รูปที่ใส่ไว้ทีละช่อง แยกตามด้าน ใช้กดกลับมาแก้ในหน้าเดิม */
      slotShots?: Record<string, (SlotShot | null)[]>;
      /**
       * งานหลายด้าน — ภาพที่ประกอบแล้วของแต่ละด้าน
       * ยังเป็น "ลายเดียว = สินค้า 1 ชิ้น" · ไม่นับเป็นคนละลาย และไม่เข้าไปเพิ่มจำนวนใน artFiles
       */
      sides?: { name: string; artUrl: string; dpi: number }[];
    }[]
  >([]);
  /** กำลังแก้ไขลายที่เท่าไหร่ (null = สร้างลายใหม่) — กัน "แก้ไขแบบ" กลายเป็นเพิ่มลายซ้ำ */
  const [editIndex, setEditIndex] = useState<number | null>(null);
  /** เปิดจอวางรูปแบบมีช่อง (Theme) อยู่ไหม — เทมเพลตที่กำหนดช่องไว้จะใช้จอนี้แทน */
  const [slotStudio, setSlotStudio] = useState(false);
  // กล่อง "แนบลายของคุณ" กางไว้ตั้งแต่แรก — ลูกค้าเห็นช่องอัปโหลดทันที ไม่ต้องเดาว่าต้องกดเปิด
  // (ช่องหมายเหตุถึงร้านไม่ยุบแล้ว — กางไว้ตลอด ลูกค้าใช้บ่อย)
  const [extraOpen, setExtraOpen] = useState<"art" | null>("art");
  // สินค้าที่บังคับแนบลาย → เปิดกล่องค้างไว้จนกว่าลูกค้าจะแตะปิดเอง
  const [artTouched, setArtTouched] = useState(false);
  // 📐 กล่องไฟล์เทมเพลต — สินค้าที่มีเทมเพลตหลายรุ่น (เคสมือถือ 14 รุ่น) ยุบไว้ก่อน ไม่ให้ดันเนื้อหาอื่นตกจอ
  const [tplOpen, setTplOpen] = useState(false);
  /**
   * 💰 ตารางราคาที่มีหลายคอลัมน์ (เช่น ดุ๊กดิ๊ก: พวงกุญแจ / Griptok / แม่เหล็ก)
   * ปกติโชว์เฉพาะคอลัมน์ของตัวเลือกที่เลือกอยู่ — อ่านง่าย ไม่ต้องไล่หาว่าราคาไหนของแบบไหน
   * กดปุ่มเทียบเมื่อไหร่ค่อยกางทุกคอลัมน์
   */
  const [priceAllCols, setPriceAllCols] = useState(false);
  // 💬 งานที่ต้องคุยลายกับแอดมินก่อน (งานปัก/งานตีลาย) — ติ๊กยืนยันว่าคุยแล้ว + ชื่อไลน์ที่ใช้คุย
  const [consultOk, setConsultOk] = useState(false);
  const [consultRef, setConsultRef] = useState("");
  // กดสั่งทั้งที่ยังไม่ติ๊ก → ตีกรอบแดงเตือน
  const [consultWarn, setConsultWarn] = useState(false);
  // แถบซื้อลอยล่างจอ (มือถือ) — โผล่เมื่อกล่องสั่งซื้อหลักเลื่อนพ้นจอ
  const orderBoxRef = useRef<HTMLDivElement>(null);
  const [showBuyBar, setShowBuyBar] = useState(false);

  // โหลดเวอร์ชันล่าสุด (Supabase หรือ localStorage) — ถ้ามีให้ใช้แทนข้อมูลตั้งต้น
  useEffect(() => {
    let active = true;
    fetchProduct(initialProduct.id).then((m) => {
      if (!active) return;
      if (m) {
        setProduct(m);
        setSelections(initialSelections(m));
        setImageIndex(0);
      }
      // ปักธงเสมอ (โหลดไม่ได้ก็ถือว่าจบ) — ลิงก์ราคารออยู่ ต้องได้ติ๊กค่าหลังจากนี้
      setProductReady(true);
    });
    return () => {
      active = false;
    };
  }, [initialProduct]);

  // ── หลายเรทราคา (เช่น พิน: คละดีเทล / ไม่คละดีเทล) ──
  const rates = useMemo(() => product.priceRates ?? [], [product]);
  const [rateLabel, setRateLabel] = useState("");
  // ลูกค้ากดเลือกเรทเอง = หยุดสลับอัตโนมัติ (เช่น ตั้งใจอยู่เรท 1 เพื่อคละดีเทล)
  const [rateTouched, setRateTouched] = useState(false);
  /**
   * เรทที่ลูกค้ากดแล้ว "ยังใช้ไม่ได้" เพราะจำนวนไม่ถึงขั้นต่ำ (null = ไม่มี)
   * เดิมกดแล้วระบบเด้งกลับเรทเดิมเงียบ ๆ ลูกค้าเห็นเป็นปุ่มเสีย — ตอนนี้เปิดป๊อปอัปบอกเหตุผล
   * พร้อมปุ่มปรับจำนวนให้ถึงขั้นต่ำในคลิกเดียว
   */
  const [rateLock, setRateLock] = useState<PriceRate | null>(null);
  // กด Esc ปิดป๊อปอัป "เรทนี้ยังใช้ไม่ได้"
  useEffect(() => {
    if (!rateLock) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRateLock(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rateLock]);
  const rate = rates.length ? (rates.find((r) => r.label === rateLabel) ?? rates[0]) : undefined;

  // ปรับตามกฎเงื่อนไขเสมอ เช่น กระดาษที่เคลือบไม่ได้ → เคลือบถูกบังคับเป็น "ไม่เคลือบ"
  // ส่งเรทที่เลือกอยู่เข้าไปด้วย — ตัวเลือกที่ไม่มีราคาในเรทนี้จะได้ไม่ถูกเลือกค้างไว้
  // (ตัวที่ไม่มีราคาถูกซ่อนจากเมนูด้านล่างอยู่แล้ว หัวข้อกับเมนูต้องตรงกัน)
  const resolved = useMemo(
    () => resolveSelections(product, rate ? { ...selections, [RATE_LABEL]: rate.label } : selections),
    [product, selections, rate]
  );

  // เรทที่เลือกติดไปกับ selections → ตะกร้า/ออเดอร์เห็นเป็น "เรทราคา: …" และคิดราคาตามเรทนั้น
  // (จำนวนลายเติมทีหลังตรง effectiveWithDesigns — ต้องประกาศ designs ก่อน)
  const effective = useMemo(() => {
    const base: Record<string, string> = rate ? { ...resolved, [RATE_LABEL]: rate.label } : { ...resolved };
    // ติ๊ก "สั่งทำ" ไม่ใช่กลุ่มตัวเลือกของสินค้า จึงไม่ผ่าน resolveSelections — พากลับมาเอง
    if (selections[MTO_LABEL]) base[MTO_LABEL] = selections[MTO_LABEL];
    return base;
  }, [resolved, rate, selections]);
  const rateMinQty = rate?.minQty ?? 1;
  /**
   * 📦 เรทนี้นับขั้นต่ำที่ "ยอดรวมทั้งล็อต" ไม่ใช่รายบรรทัด (เช่น สติ๊กเกอร์ UV ขั้นต่ำ 3 แผ่น A3
   * ต่อเนื้อ 1 ชนิด แต่ 3 แผ่นคละไดคัท 50%/100% และคละขนาดกันได้ = คนละบรรทัด บรรทัดละ 1 แผ่น)
   * → หน้าสินค้าไม่ล็อกปุ่มสั่ง ปล่อยให้ทยอยเพิ่มทีละแผ่น แล้วไปเช็คยอดรวมที่ตะกร้า/หน้าชำระเงิน
   */
  const lotMinScope = rate?.minQtyScope === "lot";
  /**
   * 📦 คำเรียก "1 รายการ" ในโหมดสั่งหลายสเปคในครั้งเดียว — สติ๊กเกอร์พูดว่า "แผ่น" (ค่าเริ่มต้น)
   * เคสมือถือตั้ง lotItemWord = "รุ่น" → "➕ เพิ่มอีกรุ่น (คนละแบบ)" · เป็นคำพูดล้วน ไม่กระทบราคา
   */
  const lotWord = product.lotItemWord?.trim() || "แผ่น";
  const lotEmoji = product.lotItemEmoji?.trim() || "📄";
  /**
   * 🛒 โหมด "หย่อนลงตะกร้าทันที" (lotToCart) — กด ➕ แล้ว{lotWord}นั้นลงตะกร้าเลย ไม่พักไว้ในหน้า
   * แล้วไปนับ/แก้จำนวนกันต่อในตะกร้า (ตะกร้ารวมยอดทั้งล็อตให้อยู่แล้วผ่าน repriceCartGroups)
   * เคสมือถือใช้โหมดนี้ — ลูกค้าทยอยใส่ทีละรุ่น ปิดหน้าไปแล้วกลับมาเติมทีหลังก็ยังอยู่
   * ไม่เปิด = โหมดเดิม พักสเปคไว้ในหน้าแล้วกดสั่งรวดเดียว (สติ๊กเกอร์ UV)
   */
  const lotToCart = product.lotToCart === true;
  /** {lotWord}ของสินค้านี้ที่อยู่ในตะกร้าแล้ว — ใช้เดินเลข "รุ่นที่ N" ต่อจากของที่ใส่ไปแล้ว */
  const cartLot = useMemo(() => {
    const mine = cartItems.filter((i) => i.productId === product.id);
    return { lines: mine.length, qty: mine.reduce((n, i) => n + i.qty, 0) };
  }, [cartItems, product.id]);
  /**
   * {lotWord}ที่ "เก็บเรียบร้อยแล้ว" ของรอบนี้ — โหมดหย่อนลงตะกร้านับจากบรรทัดในตะกร้า
   * โหมดเดิมนับจากสเปคที่พักไว้ในหน้า · ใช้เดินเลขหัวฟอร์มกับป้ายบนปุ่มให้พูดตรงกัน
   */
  const lotDone = lotToCart ? cartLot.lines : sheets.length;
  /**
   * เรทที่ตั้งขั้นต่ำแบบนับทั้งล็อต — ใช้เขียนการ์ด "วิธีสั่งสินค้านี้" ฝั่งซ้าย
   * อ่านจากตัวสินค้าไม่ใช่เรทที่เลือกอยู่ ลูกค้าจะได้เห็นกติกาแม้กำลังดูเรทอื่น (เช่น ตร.ม.)
   */
  const lotMinRate = (product.priceRates ?? []).find((r) => r.minQtyScope === "lot" && (r.minQty ?? 1) > 1);
  /**
   * 🔒 จำนวนต่ำสุดที่กดลงได้ — ปกติคือ 1 (ร้านรับสั่งขั้นต่ำ 1 ชิ้นเสมอ)
   * สินค้าที่ตั้ง hardMinQty ใช้ขั้นต่ำของเรทที่เลือกเป็นพื้น เช่น สติ๊กเกอร์ UV เรท A3 = 3 แผ่น
   */
  const qtyFloor = product.hardMinQty && !lotMinScope ? rateMinQty : 1;
  /**
   * จำนวนตั้งต้นของเรทที่เลือกอยู่ — ตราบใดที่ลูกค้ายังไม่ได้ตั้งจำนวนเอง จำนวนเดินตามค่านี้
   * ⚠️ ต่างจาก qtyFloor: เรทที่นับขั้นต่ำทั้งล็อตยัง "เริ่มที่ 3 แผ่น" (เคสปกติ + เรทอัตโนมัติเลือก A3 ถูก)
   * แต่กด − ลงไปถึง 1 ได้ เพื่อไปเลือกสเปคแผ่นถัดไปมาเติมให้ครบ 3
   */
  const qtyStart = product.hardMinQty && !lotMinScope ? rateMinQty : 1;
  /**
   * เปลี่ยนเรทแล้วจำนวนต้องตามขั้นต่ำของเรทใหม่ — ตราบใดที่ลูกค้ายังไม่ได้ตั้งจำนวนเอง
   * ขึ้นก็ได้ลงก็ได้: A3 (3 แผ่น) → ตร.ม. ต้องกลับมา 1 ไม่ใช่ค้างที่ 3 (คนละหน่วยกัน)
   * ลูกค้าปรับจำนวนเองแล้ว = ไม่ยุ่งอีก เหลือแค่กันไม่ให้ต่ำกว่าขั้นต่ำ (ปุ่ม − กับตอนออกจากช่อง)
   */
  useEffect(() => {
    if (!product.hardMinQty || useCustom || qtyTouched) return;
    setQty(qtyStart);
    setQtyText(String(qtyStart));
  }, [qtyStart, product.hardMinQty, useCustom, qtyTouched]);
  /**
   * ร้านรับสั่งขั้นต่ำ 1 ชิ้นเสมอ — ห้ามบล็อกการสั่งเพราะ "เรทที่เลือกไว้" มีขั้นต่ำสูง
   * ลูกค้ากดเลือกเรทส่งเองแล้วลดจำนวนลงต่ำกว่าขั้นต่ำ → สลับลงเรทที่รับจำนวนนั้นได้ (ปกติคือเรทปลีก)
   * ราคาจึงถูกต้องเสมอ และปุ่มสั่งซื้อไม่ตายอีก
   * (สินค้าที่ตั้ง hardMinQty ไม่สลับ — ขั้นต่ำเป็นของจริง ดันจำนวนขึ้นแทน)
   */
  useEffect(() => {
    if (product.hardMinQty || useCustom || rates.length === 0 || qty >= rateMinQty) return;
    const fit = [...rates]
      .filter((r) => (r.minQty ?? 1) <= qty)
      .sort((a, b) => (b.minQty ?? 1) - (a.minQty ?? 1))[0];
    if (fit && fit.label !== rate?.label) setRateLabel(fit.label);
  }, [qty, rateMinQty, useCustom, rates, rate, product.hardMinQty]);

  /**
   * 📐 สินค้าขายเป็นพื้นที่ (qtyFromArea) — จำนวนล็อกตามขนาดที่กรอก ปัดขึ้นเต็มหน่วยขาย
   * กันเคสกรอก 140×200 ซม. (2.8 ตร.ม.) แต่จำนวนค้างที่ 1 แล้วจ่ายแค่เรท 1 ตร.ม.
   * ล็อกจริงทั้งปุ่ม −/+ และช่องพิมพ์ (ไม่ใช่แค่ตั้งค่าเริ่มให้) — ราคาถึงจะตรงเสมอ
   */
  const areaQty = useMemo(() => qtyFromAreaOf(product, effective), [product, effective]);
  useEffect(() => {
    if (areaQty == null) return;
    setQty(areaQty.qty);
    setQtyText(String(areaQty.qty));
  }, [areaQty]);

  // ── จำนวนลายที่คละ (เรทที่กำหนดขั้นต่ำต่อลาย / สินค้าที่คิดเรทตามชิ้นต่อลาย) ──
  const [designs, setDesigns] = useState(1);
  // ลูกค้ากดปรับเองแล้ว = หยุดนับอัตโนมัติ (บางงานลาย 1 แบบแนบรูปหลายมุม)
  const [designsTouched, setDesignsTouched] = useState(false);
  // ข้อความในช่องพิมพ์จำนวนลายระหว่างแก้ (ยอมว่างชั่วคราว — ลบทิ้งแล้วพิมพ์ใหม่ได้) · null = โชว์ค่าจริง
  const [designsDraft, setDesignsDraft] = useState<string | null>(null);
  // กดสั่งโดยยังไม่ระบุจำนวนลาย → ไฮไลต์กล่องเตือน
  const [designsWarn, setDesignsWarn] = useState(false);
  // สินค้าที่ตั้ง "คิดเรทตามชิ้นต่อลาย" — คละกี่ลายก็ได้ แต่เรทราคาคิดจาก ⌊จำนวน ÷ ลาย⌋
  const tierByDesign = !!product.tierByDesign;
  /** 🔒 ห้ามคละเกินโควตาเรท — ช่อง "คละกี่ลาย" ตันที่โควตา แทนที่จะปล่อยให้ราคาตกไปเรทต่อลาย (ดู Product.hardMaxDesigns) */
  const hardMaxDesigns = !!product.hardMaxDesigns;
  /**
   * กติกาคละแบบคิดค่าคละต่อหน่วย (ถ้าสินค้าตั้งไว้) — มาก่อนกติกาเดิมทั้งหมด
   * อ่านตามตัวเลือกที่เลือกอยู่ (mixRuleFor) — ตัวเลือกอย่าง "ไดคัท 50%" ตั้งค่าคละของตัวเองทับกติกากลางได้
   */
  const mixRule = useMemo(() => mixRuleFor(product, effective), [product, effective]);
  /**
   * ชิ้นที่ได้ต่อ 1 หน่วยตามตัวเลือกที่เลือกอยู่ (เช่น สติกเกอร์ 3cm ได้ 45 ชิ้น/แผ่น)
   * คละ 1 ลายต้องใช้อย่างน้อย 1 ชิ้น → คละได้ไม่เกิน ชิ้นต่อหน่วย × จำนวนที่สั่ง
   */
  const unitCap = perUnitCapacity(product, effective);
  const capByPieces = unitCap ? unitCap * Math.max(1, qty) : Infinity;
  /**
   * 📐 งานแบ่งแผ่น/ไดคัทตามขนาด — สั่ง 1 หน่วยได้งานกี่ชิ้น (ดู unitYieldOf)
   * ใช้สรุปให้ลูกค้าว่า "สั่ง 10 แผ่น A3 ขนาดตัด A5 = ได้ 40 ชิ้น" · ไม่เกี่ยวกับราคา
   */
  const unitYield = useMemo(() => unitYieldOf(product, effective), [product, effective]);
  // 🧮 จำนวนที่ใช้เทียบ "เกณฑ์เรท/คละลาย" — ต้องเป็นเลขเดียวกับที่ tierQtyFor ใช้ (= จำนวนหน่วยขาย)
  // ⚠️ สินค้าหลายชิ้นต่อหน่วย (พวงละหลายชิ้น) เคยคูณชิ้นต่อหน่วยตรงนี้ — เลิกแล้ว (1 ก.ย. 69)
  //    หน้าเว็บโชว์เกณฑ์คนละเลขกับที่ระบบคิดเงิน = บอกว่า "คละได้ 6 ลาย" แต่ราคาคิดแบบ 3 ลาย
  const pieceQty = qty;
  // ลายที่รวมในราคาตามจำนวนที่สั่ง · เรทที่เปิด extraDesignFee คละเกินได้ (จ่ายเพิ่มต่อลาย ไม่เกินจำนวนชิ้น)
  // ส่ง unitCap ไปด้วยเสมอ — สินค้าขายเป็นเซ็ต โควตาช่วงคละอิสระต้องนับเป็นชิ้น ไม่ใช่จำนวนเซ็ต
  const included = rate?.minPerDesign ? includedDesigns(rate, pieceQty, unitCap ?? 1) : 0;
  // สินค้าที่คิดเรทตามชิ้นต่อลาย: คละได้ถึงจำนวนชิ้นเสมอ (เกินโควตาเรท = ราคาปรับเป็นเรทต่อลายเอง ไม่บล็อก)
  const maxDesignsRaw = mixRule
    ? // ช่วงที่ยังไม่ถึงเกณฑ์ "1 ลาย/หน่วย" คละได้ไม่จำกัด (หลายลายอยู่บนแผ่นเดียวกันได้)
      // = Infinity → ช่อง +/− ต้องมีเพดานที่จับต้องได้ เลยตั้งเพดานใช้งานจริงไว้ 99 ลาย
      // ส่วนช่วงที่บังคับ 1 ลาย/หน่วย เพดาน = จำนวนที่สั่ง ซึ่งเป็นเลขจริง ห้ามเอา 99 ไปกดทับ
      // (เคยพลาด: สั่ง 100 เซ็ต ควรคละได้ 100 ลาย แต่โดนตัดเหลือ 99)
      Math.max(1, finiteOr(mixMaxDesigns(mixRule, pieceQty), 99))
    : // 🔒 สินค้าที่ล็อกโควตาไว้ (ขั้นต่ำต่อลายเป็นข้อจำกัดการผลิตจริง) — ตันที่โควตาของเรท ไม่ปล่อยให้เลยไปเรทต่อลาย
      hardMaxDesigns && rate?.minPerDesign
      ? maxDesignsFor(rate, pieceQty, unitCap ?? 1)
      : tierByDesign
        ? pieceQty
        : rate?.minPerDesign
          ? maxDesignsFor(rate, pieceQty, unitCap ?? 1)
          : 0;
  // เพดานจากจำนวนชิ้นที่ใส่ได้จริง ทับกติกาอื่นเสมอ — ใส่ไม่ลงแผ่นก็ผลิตไม่ได้
  const maxDesigns = maxDesignsRaw > 0 ? Math.max(1, Math.min(maxDesignsRaw, capByPieces)) : maxDesignsRaw;
  // "ระบุจำนวนลายแล้ว" = แตะ +/− หรือพิมพ์เลขเอง หรือแนบรูปให้ระบบนับ — สินค้าที่มีระบบลายต้องระบุก่อนสั่ง
  // ยกเว้นตอนคละได้แค่ลายเดียว (เช่น สั่ง 1 ชิ้น) — มีทางเลือกเดียวอยู่แล้ว ถือว่าระบุแล้ว ไม่ต้องให้กดยืนยัน
  const designsSet = designsTouched || artFiles.length > 0 || maxDesigns <= 1;
  /** สินค้านี้มีระบบจำนวนลาย → ลูกค้าต้องระบุจำนวนลายก่อนสั่ง */
  const needDesignsChoice = ((rate?.minPerDesign ?? 0) > 0 || tierByDesign || !!mixRule) && maxDesigns >= 1;
  const freeMix = !!rate && rate.minPerDesign != null && isFreeMix(rate, pieceQty);
  useEffect(() => {
    if (maxDesigns > 0) setDesigns((d) => Math.min(Math.max(1, d), maxDesigns));
  }, [maxDesigns]);
  // ✨ แนบรูปมากกว่าจำนวนที่สั่ง (สินค้าคิดเรทต่อลาย) → เพิ่มจำนวนชิ้นให้อัตโนมัติขั้นต่ำลายละ 1 ชิ้น
  // ไม่งั้นเพดานจำนวนลาย (= จำนวนชิ้น) จะกดไว้ ทำให้นับลายตามรูปไม่ได้ (แนบ 2 รูปแต่ค้าง 1 ลาย)
  useEffect(() => {
    if (!tierByDesign || artFiles.length < 1) return;
    setQty((q) => Math.max(q, artFiles.length));
  }, [artFiles.length, tierByDesign]);

  /** จำนวนรูปลายรอบก่อน — ใช้จับว่า "จำนวนรูปเพิ่งเปลี่ยน" (แนบเพิ่ม/ลบออก) ไม่ใช่แค่ re-render */
  const artCountRef = useRef(artFiles.length);
  /**
   * ✨ นับจำนวนลายอัตโนมัติตามรูปลายที่แนบ — ทางร้านนับลายจริงจากไฟล์ ตัวเลขจึงต้องตรงกับรูปเสมอ
   *
   * 🐞 บั๊คที่แก้ (1 ก.ย. 69): พิมพ์จำนวนลายไว้ก่อน แล้วค่อยแนบรูปทีหลัง ตัวเลขไม่ยอมลงมาตามรูป
   *    (โค้ดเดิมดันขึ้นตามรูปอย่างเดียว — พิมพ์ 3 แล้วแนบ 2 รูป ค้างที่ 3 ลูกค้าจ่ายค่าคละเกินจริง)
   *    → ทุกครั้งที่ "จำนวนรูปเปลี่ยน" ให้ซิงก์จำนวนลาย = จำนวนรูป ทั้งขึ้นและลง
   *      (ลบรูปออกหมด = ไม่ยุ่ง ปล่อยค่าที่ระบุไว้ · หลังซิงก์แล้วลูกค้ายังกด +/− ปรับเองต่อได้)
   */
  useEffect(() => {
    if (maxDesigns < 1) return;
    const n = artFiles.length;
    const artChanged = n !== artCountRef.current;
    artCountRef.current = n;
    // ระบุเองแล้วและจำนวนรูปไม่ได้ขยับ = เคารพเลขที่ลูกค้ากดไว้ (แค่ re-render จากตัวเลือก/จำนวน)
    if (designsTouched && (!artChanged || n < 1)) return;
    setDesigns((d) => {
      const next = Math.min(Math.max(1, n), maxDesigns);
      if (next !== d) setDesignsDraft(null); // ค่าเปลี่ยนเพราะนับรูป — ล้างข้อความค้างในช่องให้โชว์ค่าจริง
      return next;
    });
  }, [artFiles.length, maxDesigns, designsTouched]);
  /**
   * 🔄 คละลาย "ด้านหลัง" — งานพิมพ์ 2 ด้านที่สินค้าตั้ง backDesign ไว้ (งานกระดาษ)
   * ใช้กติกาชุดเดียวกับด้านหน้า (เพดาน/ค่าคละเท่ากัน) แค่แยกเป็นอีกช่องแล้วคิดเงินอีกชุด
   * ยังไม่ได้เลือกพิมพ์ 2 ด้าน = ไม่มีช่องนี้ ไม่มีค่าคละด้านหลัง
   */
  const backOn = backDesignActive(product, effective);
  /** กติกาค่าคละของด้านหลังโดยเฉพาะ (งานกระดาษ = ลายละ 5 บาท) — ไม่ตั้ง = ใช้ชุดเดียวกับด้านหน้า */
  const backMix = product.backDesign?.mixRule;
  const [backDesigns, setBackDesigns] = useState(1);
  const [backDesignsDraft, setBackDesignsDraft] = useState<string | null>(null);
  useEffect(() => {
    if (maxDesigns > 0) setBackDesigns((d) => Math.min(Math.max(1, d), maxDesigns));
  }, [maxDesigns]);
  // สลับกลับไปพิมพ์ 1 ด้าน = ล้างค่าที่ค้างไว้ ไม่ให้เงื่อนไขเก่าติดไปกับตะกร้า
  useEffect(() => {
    if (!backOn) {
      setBackDesigns(1);
      setBackDesignsDraft(null);
    }
  }, [backOn]);
  /** จำนวนลายด้านหลังที่จะติดไปกับราคา/ตะกร้า — ไม่ได้พิมพ์ 2 ด้าน = ไม่ใส่เลย */
  const backSel = useMemo<Record<string, string>>(
    () => (backOn ? ({ [BACK_DESIGN_LABEL]: `${backDesigns} ลาย` } as Record<string, string>) : {}),
    [backOn, backDesigns]
  );
  /**
   * 🔗 เปิดหน้าจากลิงก์ราคา — ติ๊กตัวเลือก/จำนวนที่แอดมินตั้งไว้ให้ครบในทีเดียว
   *
   * รอ productReady เสมอ: ตัวโหลดสินค้าเวอร์ชันล่าสุดสั่ง setSelections(initialSelections(m)) อยู่แล้ว
   * ติ๊กก่อนหน้านั้น = โดนทับหมด (ลูกค้าเห็นสเปคผิดจากที่แอดมินส่งมา แต่ราคาดูสมเหตุสมผล = จับไม่ได้)
   */
  const priceLinkDone = useRef(false);
  useEffect(() => {
    const link = priceLinkRef.current;
    if (!productReady || !link || priceLinkDone.current) return;
    priceLinkDone.current = true;

    const sel = sanitizeSpecSelections(product, link.s);
    if (Object.keys(sel).length) {
      setSelections((cur) => ({ ...cur, ...sel }));
      /**
       * 🔽 กลุ่มของเสริมที่ปิดไว้ก่อน (collapsible) ต้องกางให้ด้วยถ้าลิงก์เลือกของเสริมมา
       * ไม่งั้นลูกค้าเห็นสวิตช์ปิดอยู่ แต่ราคารวมมีค่าของเสริมบวกอยู่ = ดูเหมือนคิดเงินเกิน
       */
      const open: Record<string, boolean> = {};
      for (const opt of product.options ?? []) {
        if (!opt.collapsible || isInputOption(opt)) continue;
        const v = sel[opt.label];
        if (v && v !== (opt.choices[0]?.name ?? "")) open[opt.label] = true;
      }
      if (Object.keys(open).length) setOpenAddOns((s) => ({ ...s, ...open }));
    }
    // เรทที่ไม่มีแล้ว (แอดมินลบทิ้ง) = ไม่ยัด ปล่อยให้ระบบเลือกเรทตามจำนวนเองตามปกติ
    if (link.r && (product.priceRates ?? []).some((r) => r.label === link.r)) {
      setRateLabel(link.r);
      setRateTouched(true);
    }
    if (link.c && product.custom?.enabled) {
      setUseCustom(true);
      setCustomW(link.c.w);
      setCustomH(link.c.h);
    }
    if (link.q && link.q > 0) {
      setQty(link.q);
      setQtyText(String(link.q));
      // ถือว่า "ตั้งจำนวนมาแล้ว" — ไม่ให้จำนวนเด้งกลับขั้นต่ำของเรทเองทีหลัง
      setQtyTouched(true);
    }
    if (link.d && link.d > 0) {
      setDesigns(link.d);
      setDesignsTouched(true);
    }
    if (link.b && link.b > 0) setBackDesigns(link.b);
    setFromPriceLink(true);
  }, [productReady, product]);

  /** มาจากลิงก์ราคา = พาไปที่กล่องสั่งซื้อเลย (ลูกค้าเปิดมาเพื่อดูราคา ไม่ใช่มาอ่านหน้าสินค้าใหม่) */
  useEffect(() => {
    if (!fromPriceLink) return;
    const t = setTimeout(() => orderBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 350);
    return () => clearTimeout(t);
  }, [fromPriceLink]);

  /**
   * ✏️ แก้ไขรายการเดิมในตะกร้า (?edit=<คีย์บรรทัด>) — ติ๊กสเปคเดิมกลับมาให้ครบก่อน
   *
   * รอ 2 อย่าง: productReady (ตัวโหลดสินค้าสั่ง setSelections(initialSelections) ทับอยู่ ติ๊กก่อนหน้านั้นหายหมด)
   * และตะกร้าอ่านของเก่าจาก localStorage เสร็จ (cartItems ว่างเปล่าในรอบแรกเสมอ) — หาไม่เจอก็แค่รอรอบถัดไป
   */
  const editLoadDone = useRef(false);
  useEffect(() => {
    if (!productReady || editLoadDone.current) return;
    const key = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("edit");
    if (!key) return;
    editKeyRef.current = key;
    const line = cartItems.find((i) => i.key === key && i.productId === product.id);
    if (!line) return; // ตะกร้ายังไม่ hydrate (หรือบรรทัดถูกลบไปแล้ว) — ยังไม่ปักธง รอรอบหน้า
    editLoadDone.current = true;
    const src = line.selections;

    const sel = sanitizeSpecSelections(product, src);
    if (Object.keys(sel).length) {
      setSelections((cur) => ({ ...cur, ...sel }));
      // ของเสริมที่ปิดไว้ก่อน (collapsible) ต้องกางให้ด้วย ไม่งั้นราคามีค่าของเสริมแต่สวิตช์ดูเหมือนปิดอยู่
      const open: Record<string, boolean> = {};
      for (const opt of product.options ?? []) {
        if (!opt.collapsible || isInputOption(opt)) continue;
        const v = sel[opt.label];
        if (v && v !== (opt.choices[0]?.name ?? "")) open[opt.label] = true;
      }
      if (Object.keys(open).length) setOpenAddOns((s) => ({ ...s, ...open }));
    }
    // เรทที่แอดมินลบทิ้งไปแล้ว = ไม่ยัด ปล่อยให้ระบบเลือกเรทตามจำนวนเองตามปกติ
    const savedRate = src[RATE_LABEL];
    if (savedRate && (product.priceRates ?? []).some((r) => r.label === savedRate)) {
      setRateLabel(savedRate);
      setRateTouched(true);
    }
    // 📐 ขนาดกำหนดเอง — ตะกร้าเก็บเป็นข้อความ "กว้าง×ยาว หน่วย" แกะกลับเป็นช่องกรอกสองช่อง
    const cus = product.custom?.enabled ? product.custom : null;
    const cusVal = cus ? (src[cus.label] ?? "") : "";
    if (cus && cusVal) {
      const m = /^\s*([\d.]+)\s*[×x]\s*([\d.]+)/.exec(cusVal);
      if (m) {
        setUseCustom(true);
        setCustomW(m[1]);
        setCustomH(m[2]);
      } else if (cusVal.includes("คุยรายละเอียด")) {
        setUseCustom(true);
      }
    }
    if (line.qty > 0) {
      setQty(line.qty);
      setQtyText(String(line.qty));
      // ถือว่า "ตั้งจำนวนมาแล้ว" — ไม่ให้จำนวนเด้งกลับขั้นต่ำของเรทเองทีหลัง
      setQtyTouched(true);
    }
    const nDesigns = parseInt(src[DESIGN_LABEL] ?? "", 10);
    if (nDesigns > 0) {
      setDesigns(nDesigns);
      setDesignsTouched(true);
    }
    const nBack = parseInt(src[BACK_DESIGN_LABEL] ?? "", 10);
    if (nBack > 0) setBackDesigns(nBack);
    if (src["หมายเหตุ"]) setNote(src["หมายเหตุ"]);
    if (src["ลิงก์ไฟล์ลาย/อีเมล"]) setArtLink(src["ลิงก์ไฟล์ลาย/อีเมล"]);
    // 🎨 ลายที่แนบไว้เดิม — เอา url กลับมาเลย ลูกค้าไม่ต้องอัปใหม่ (w/h ใช้แค่เตือน "ภาพเล็กไป" จึงปล่อย 0 ได้)
    const arts = (src["ภาพลายที่แนบ"] ?? "")
      .split(" | ")
      .map((u) => u.trim())
      .filter(Boolean);
    if (arts.length)
      setArtFiles(
        arts.map((url) => ({ url, name: decodeURIComponent(url.split("/").pop() ?? "ลายที่แนบ"), w: 0, h: 0 }))
      );
    const consultVal = src[CONSULT_LABEL] ?? "";
    if (consultVal.startsWith("คุยลายกับแอดมินแล้ว")) {
      setConsultOk(true);
      const ref = consultVal.split("·")[1]?.trim();
      if (ref) setConsultRef(ref);
    }
    editCarryRef.current = {
      keys: Object.fromEntries(
        Object.entries(src).filter(([k]) => k === PLACEMENT_LABEL || k === PLACEMENT_SPEC_LABEL || k === "ภาพลายแต่ละด้าน")
      ),
      arts,
    };
    setEditing(true);
  }, [productReady, product, cartItems]);

  /** โหมดแก้ไข = พาไปที่กล่องสั่งซื้อเลย (ลูกค้ามาเพื่อปรับสเปค ไม่ใช่มาอ่านหน้าสินค้าใหม่) */
  useEffect(() => {
    if (!editing) return;
    const t = setTimeout(() => orderBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 350);
    return () => clearTimeout(t);
  }, [editing]);

  const extraDesigns = rate?.extraDesignFee ? Math.max(0, designs - included) : 0;
  /**
   * ค่าคละลาย — ใช้ designFeeFor ตัวเดียวกับที่ตะกร้า/ออเดอร์ใช้
   * (เดิมหน้านี้คำนวณเองเป็น extraDesigns × extraDesignFee ซึ่งไม่รู้จักกติกา mixRule
   *  ลูกค้าจะเห็นราคาหน้าสินค้าไม่ตรงกับตอนจ่ายเงิน)
   */
  const designFee = designFeeFor(product, { ...effective, ...backSel, [DESIGN_LABEL]: `${designs} ลาย` }, qty);
  /** แจกแจงว่าค่าเพิ่มก้อนนั้นมาจากอะไร (ค่าเคลือบต่อแผ่น · ค่าสีต่อลาย · ค่าคละลายหน้า/หลัง) */
  const feeLines = feeBreakdown(product, { ...effective, ...backSel, [DESIGN_LABEL]: `${designs} ลาย` }, qty);
  /**
   * 🔒 ขั้นต่ำต่อลายแบบแข็ง (hardMinPerDesign) — ต่ำกว่าเกณฑ์ = ปุ่มสั่งล็อก
   * เช่น อาร์มปักขั้นต่ำ 5 ชิ้น/ลาย: สั่ง 3 ชิ้นไม่ได้ · สั่ง 8 ชิ้นคละ 2 ลายก็ไม่ได้ (ต้อง 10)
   * งานกำหนดขนาดเอง (useCustom) แอดมินตีราคา/คุยเองอยู่แล้ว — ไม่ล็อก
   */
  const hardMin = product.hardMinPerDesign ? (rate?.minPerDesign ?? 0) : 0;
  const hardMinNeed = hardMin * Math.max(1, designs);
  const belowMin = !useCustom && hardMin > 0 && qty < hardMinNeed;
  /**
   * 🔒 ยอดสั่งขั้นต่ำของเรทแบบแข็ง (hardMinQty) — กันจำนวนที่มาจากทางอื่นหลุดต่ำกว่าเกณฑ์
   * (ช่องจำนวนกันไว้แล้ว แต่จำนวนที่คิดจาก "จัดลายเอง" ไม่ได้ผ่านช่องนั้น)
   */
  const belowMinQty = !useCustom && product.hardMinQty === true && !lotMinScope && qty < rateMinQty;
  // จำนวนลายติดไปกับ selections ตั้งแต่ตอนดูราคา → ราคาสด/ตะกร้า/ออเดอร์คิดเรทตามชิ้นต่อลายตรงกัน
  const effectiveWithDesigns = useMemo(
    () =>
      (rate?.minPerDesign || tierByDesign || mixRule) && designs >= 1
        ? ({ ...effective, ...backSel, [DESIGN_LABEL]: `${designs} ลาย` } as Record<string, string>)
        : ({ ...effective, ...backSel } as Record<string, string>),
    [effective, backSel, rate, tierByDesign, mixRule, designs]
  );

  // ✨ เลือกเรทให้อัตโนมัติจากจำนวน + จำนวนลาย
  // - ยังไม่เคยกดเลือกเรทเอง: เลือกเรทที่ขั้นต่ำสูงสุดที่จำนวนถึง (50 ชิ้น → เรท 2)
  //   และถ้าลายที่แนบเกินที่เรทนั้นคละได้ → เลือกเรทที่คละได้แทน (เช่น เรท 1)
  // - กดเลือกเรทเองแล้ว: เคารพที่เลือก ยกเว้นลายเกินที่เรทนั้นรองรับ (และคละเกินไม่ได้)
  //   → สลับไปเรทที่รองรับให้ พร้อมแจ้งเหตุผล (ค้างเรทเดิมไว้ = สั่งไม่ได้อยู่ดี)
  const [autoRateNote, setAutoRateNote] = useState("");
  useEffect(() => {
    if (rates.length < 2) return;
    // หน่วงสั้น ๆ กันเด้งเรทกลางคันตอนกำลังพิมพ์จำนวน (เช่น จะพิมพ์ 150 แต่ผ่านค่า 1 ก่อน)
    const t = setTimeout(() => {
      const needDesigns = designsTouched ? designs : Math.max(artFiles.length, 1);
      const fitsDesigns = (r: (typeof rates)[number]) => {
        if (!r.minPerDesign) return true;
        return maxDesignsFor(r, pieceQty, unitCap ?? 1) >= needDesigns;
      };
      /**
       * เรทนี้ยังขายตัวเลือกที่ลูกค้าเลือกอยู่ไหม (เช่น เรท 2 ไม่มีตาราง 1mm)
       * ถ้าไม่เช็ค ระบบจะเด้งไปเรทที่ไม่มีของ แล้วตัวเลือกที่เลือกไว้จะหายไปเฉย ๆ
       */
      const fitsSelections = (r: (typeof rates)[number]) =>
        r.pricing.driverLabels.every((label) => {
          const chosen = effective[label];
          // 📐 "กำหนดขนาดเอง" ไม่มีช่องราคาในตารางโดยตั้งใจ — ไม่ถือว่าเรทนี้ไม่มีของ
          const g = product.options.find((o) => o.label === label);
          if (g && chosen && isSizeInputChoice(g, chosen)) return true;
          return !chosen || matrixChoiceAvailable(r.pricing, label, chosen);
        });
      /**
       * ขั้นต่ำที่ใช้ตัดสินว่า "จำนวนนี้เข้าเรทนี้ไหม" — เรทที่นับขั้นต่ำทั้งล็อต (minQtyScope: "lot")
       * ไม่ใช่ประตูรายบรรทัด จึงเข้าเกณฑ์ที่จำนวนเท่าไหร่ก็ได้
       * ⚠️ ไม่กันไว้ = กด − ลงเหลือ 1 แผ่น A3 แล้วระบบเด้งไปเรท "ตารางเมตร" ให้เอง สั่งทีละแผ่นไม่ได้เลย
       */
      const minQtyGate = (r: (typeof rates)[number]) => (r.minQtyScope === "lot" ? 1 : (r.minQty ?? 1));
      const qualified = rates.filter((r) => pieceQty >= minQtyGate(r));
      if (!rateTouched) {
        let best: (typeof rates)[number] | undefined;
        const pick = (list: typeof rates, sorter: (a: (typeof rates)[number], b: (typeof rates)[number]) => number) => {
          // ไล่จากเงื่อนไขครบสุด → ผ่อนลงทีละข้อ (ตัวเลือกที่เลือกไว้สำคัญกว่าการได้เรทถูกสุด)
          const both = list.filter((r) => fitsDesigns(r) && fitsSelections(r));
          const byDesign = list.filter(fitsDesigns);
          return [...(both.length ? both : byDesign.length ? byDesign : list)].sort(sorter)[0];
        };
        if (qualified.length) {
          // จำนวนถึงขั้นต่ำหลายเรท → เอาเรทที่ขั้นต่ำสูงสุด (เรทส่ง ราคาถูกกว่า) ที่ยังขายของที่เลือกอยู่
          best = pick(qualified, (a, b) => (b.minQty ?? 1) - (a.minQty ?? 1));
        } else {
          // จำนวนยังไม่ถึงขั้นต่ำสักเรท (เช่น ใส่ 1 ชิ้น) → เลือกเรทที่ขั้นต่ำต่ำสุด
          // จะได้เห็นเงื่อนไขที่ใกล้เคียงที่สุด ไม่ค้างอยู่เรทที่ต้องสั่ง 50
          best = pick(rates, (a, b) => (a.minQty ?? 1) - (b.minQty ?? 1));
        }
        if (best) setRateLabel((cur) => (cur === best.label ? cur : best.label));
        setAutoRateNote("");
        return;
      }
      if (rate && !fitsDesigns(rate)) {
        const alt = (qualified.length ? qualified : rates)
          .filter(fitsDesigns)
          .sort((a, b) => (b.minQty ?? 1) - (a.minQty ?? 1))[0];
        if (alt && alt.label !== rate.label) {
          setRateLabel(alt.label);
          setAutoRateNote(
            `สลับเป็น “${alt.label}” ให้อัตโนมัติ — ลายที่แนบ ${needDesigns} ลาย เกินที่เรทเดิมคละได้`
          );
          return;
        }
      }
      // ทุกเรทรองรับจำนวนลายแล้ว (เช่น ลบรูปออก) → เหตุผลของป้ายหมดไป เก็บป้ายออก
      if (rate && fitsDesigns(rate) && rates.every(fitsDesigns)) setAutoRateNote("");
    }, 450);
    return () => clearTimeout(t);
  }, [qty, pieceQty, rates, rateTouched, designs, designsTouched, artFiles.length, rate, effective, unitCap]);

  const custom = product.custom?.enabled ? product.custom : null;
  const cW = parseFloat(customW), cH = parseFloat(customH);
  /** โหมด "คุยกับแอดมิน" ไม่ต้องกรอกขนาด — โหมดอื่นต้องกรอกกว้าง×ยาวให้ครบ */
  const customChat = custom?.mode === "chat";
  /** โหมดที่ยังไม่รู้ราคาตอนสั่ง (แอดมินตีให้ทีหลัง) */
  const customAsk = custom?.mode === "quote" || customChat;
  /**
   * 📐 โหมดที่ "ราคายังคิดจากตารางเรทปกติ" — ระบุขนาดเฉย ๆ (size) และอิงด้านที่ยาวที่สุด (longest)
   * ต่างจาก area/quote/chat ที่ราคาไม่อิงตาราง จึงต้องคลุมตาราง/ขึ้นข้อความเตือนคนละแบบ
   */
  const customUsesMatrix = custom?.mode === "size" || custom?.mode === "longest";
  const customValid = useCustom && (customChat || (cW > 0 && cH > 0));
  // ราคา custom: area = คำนวณจากพื้นที่ · quote/chat = ยังไม่รู้ราคา · size/longest = ใช้ราคาตามตารางปกติ
  const customPrice = custom && customValid && custom.mode === "area" ? customUnitPrice(custom, cW, cH) : 0;
  /** ขนาดที่กรอกเกินที่รับผลิตได้ (เช่น ใหญ่กว่า A3) — มีค่า = กดสั่งไม่ได้ */
  const customSizeErr = useCustom && customValid && !customChat ? customSizeError(custom, cW, cH) : null;

  /**
   * 📐 ขนาดที่กรอกต้องติดไปกับ selections ตอนคิดราคาด้วย (โหมด longest)
   * ไม่งั้นหน้าสินค้าจะโชว์ราคาแถวขนาดที่เลือกค้างไว้ ไม่ใช่แถวที่ครอบขนาดจริงที่ลูกค้ากรอก
   */
  const pricingSelections = useMemo(() => {
    if (!useCustom || custom?.mode !== "longest" || !(cW > 0 && cH > 0)) return effectiveWithDesigns;
    return { ...effectiveWithDesigns, [custom.label]: `${cW}×${cH} ${custom.unit}` };
  }, [effectiveWithDesigns, useCustom, custom, cW, cH]);
  const baseUnitPrice = useMemo(
    () => unitPriceFor(product, pricingSelections, qty),
    [product, pricingSelections, qty]
  );
  /** ที่มาของราคาโหมด longest — เอาไว้กางให้ลูกค้าเห็นว่าคิดจากแถวไหน + ส่วนเกินกี่บาท */
  const longestPlan = useMemo(
    () => (useCustom && custom?.mode === "longest" ? longestSizePlan(product, pricingSelections) : null),
    [product, pricingSelections, useCustom, custom]
  );
  // โหมด size/longest ราคายังคิดจากตารางปกติ · โหมดอื่นใช้ราคาของงานกำหนดเอง
  const unitPrice = useCustom && !customUsesMatrix ? customPrice : baseUnitPrice;

  /**
   * 🧮 ในตะกร้ามีสินค้าตัวนี้อยู่แล้วไหม — บอกลูกค้าตั้งแต่หน้าสินค้าว่าจำนวนที่กำลังเลือก
   * จะถูกคิดรวมกับของในตะกร้าเป็นล็อตเดียว (เรทตามยอดรวม) ไม่ต้องเข้าไปดูในตะกร้าก่อน
   */
  const lotPreview = useMemo(
    // โหมดที่ราคายังมาจากตารางเรท (size/longest) เข้าล็อตรวมกับบรรทัดอื่นได้ตามปกติ — โหมดอื่นไม่เข้าล็อต
    () =>
      useCustom && !customUsesMatrix
        ? undefined
        : lotPreviewFor(product, cartItems, pricingSelections, qty, designs),
    [product, cartItems, pricingSelections, qty, designs, useCustom, customUsesMatrix]
  );

  /**
   * 📦 ล็อตนี้ยังขาดอีกกี่หน่วยถึงจะสั่งได้ (เรทที่ตั้ง minQtyScope: "lot")
   * ยอดที่นับ = ที่มีในตะกร้าล็อตเดียวกันอยู่แล้ว + จำนวนที่กำลังเลือกอยู่
   * ⚠️ ตั้งใจ "ไม่บล็อกปุ่มสั่ง" — ขั้นต่ำแบบนี้เป็นของรอบผลิต ลูกค้าต้องทยอยเพิ่มสเปคทีละแผ่นได้
   *    ประตูจริงอยู่ที่ตะกร้า/หน้าชำระเงิน/เซิร์ฟเวอร์ (lotShortfalls)
   */
  /**
   * 🔒 กลุ่มที่ล็อกไว้ทั้งออเดอร์เมื่อมีสเปคพักอยู่ — เปลี่ยนแล้วจะกลายเป็นคนละล็อต สั่งรวมกันไม่ได้
   * (เนื้อสติ๊กเกอร์ = lotKeyOptions · รวมถึงแผงเลือกเรทด้วย เพราะเรทคนละหน่วยสั่ง)
   */
  const lotLockedLabels = useMemo(
    () => (sheets.length && lotMinScope ? (product.lotKeyOptions ?? []) : []),
    [sheets.length, lotMinScope, product.lotKeyOptions]
  );
  /** สรุปสเปคของแผ่นที่พักไว้เป็นข้อความสั้น ๆ (ตัดกลุ่มที่ล็อกร่วมกันทั้งออเดอร์ออก ไม่ต้องซ้ำทุกแถว) */
  const sheetSpecText = useCallback(
    (sel: Record<string, string>) =>
      (product.options ?? [])
        .filter(
          (o) =>
            !(product.lotKeyOptions ?? []).includes(o.label) &&
            // กลุ่มที่ถูกซ่อนตามเงื่อนไข (เช่น "ผิวเนื้อขาว" ตอนเลือกเนื้อใส) ไม่ใช่สเปคของแผ่นนี้
            optionActive(o, sel) &&
            (sel[o.label] ?? "").trim()
        )
        .map((o) => sel[o.label])
        .join(" · "),
    [product.options, product.lotKeyOptions]
  );
  /** ค่าของกลุ่มที่แยกล็อต (เช่น เนื้อสติ๊กเกอร์ที่เลือกอยู่) — ใช้บอกลูกค้าว่านับรวมกับอะไร */
  const lotGroupName = useMemo(
    () =>
      (product.lotKeyOptions ?? [])
        .map((l) => pricingSelections[l]?.trim())
        .filter(Boolean)
        .join(" · "),
    [product.lotKeyOptions, pricingSelections]
  );

  /**
   * 💬 ตัวเลือกที่เลือกอยู่เป็น "งานสั่งทำ" ที่ต้องให้แอดมินตีราคาไหม
   * (กลุ่ม/ตัวเลือกที่แอดมินติ๊ก 💬 ไว้ เช่น แบบที่ระบุขนาดเอง)
   * เข้าเงื่อนไข = ยังไม่มีราคา แต่กดสั่งไว้ก่อนได้ แล้วคุยกันทางแชท
   */
  const askQuote = useMemo(() => needsQuote(product, effective), [product, effective]);
  /**
   * ช่องกรอกที่ยังกรอกไม่ถูก (เฉพาะกลุ่มที่แสดงอยู่) — มีค้างอยู่ = กดสั่งไม่ได้
   * ตรวจด้วยเกณฑ์เดียวกับที่แสดงใต้ช่อง (inputError) จะได้ไม่มีกรณี "ปุ่มตายแต่ไม่บอกว่าเพราะอะไร"
   */
  const inputErrors = useMemo(
    () =>
      product.options
        .filter((o) => isInputOption(o) && optionVisible(o, effective))
        // ช่องกรอกงานสั่งทำ ตรวจเฉพาะตอนติ๊ก "สั่งทำ" (ไม่ติ๊ก = ไม่ต้องกรอก ปุ่มสั่งไม่ควรถูกล็อก)
        // ช่องกรอกของงานปกติ (standardInput เช่น ขนาดไดคัท) แสดงอยู่เมื่อไหร่ต้องกรอกเสมอ
        .filter((o) => o.standardInput === true || madeToOrderOn(effective))
        // เก็บชื่อกลุ่มไว้ด้วย — ปุ่มสั่งจะได้บอกตรง ๆ ว่าติดช่องไหน และพาเลื่อนไปหาช่องนั้นได้
        .map((o) => ({ label: o.label, msg: inputError(o, effective[o.label], effective) }))
        .filter((e): e is { label: string; msg: string } => !!e.msg),
    [product, effective]
  );
  /**
   * ช่องที่ "กรอกแล้วแต่ผิดเกณฑ์" (เช่น จุดไดคัทเกินเพดานของขนาดที่เลือก) — ต่างจากช่องที่ยังไม่ได้กรอก
   * เคสนี้ต้องขึ้นก่อนเหตุผลอื่นบนปุ่ม เพราะลูกค้าพิมพ์ค่าผิดไว้จริง ๆ ถ้าไปบอก "แนบลายก่อน" เฉย ๆ
   * ลูกค้าจะแนบลายเสร็จแล้วมางงต่อว่าทำไมยังกดไม่ได้
   */
  const inputHardError = inputErrors.find((e) => !e.msg.startsWith("กรอก"));
  /** ข้อความบนปุ่มตอนติดช่องกรอก — บอกปัญหาจริงของช่องแรกที่ติด (มีหลายช่องบอกจำนวนที่เหลือต่อท้าย) */
  const inputBlockLabel = () => {
    const first = inputHardError ?? inputErrors[0];
    if (!first) return "";
    const more = inputErrors.length > 1 ? ` · อีก ${inputErrors.length - 1} ช่อง` : "";
    // ข้อความ "กรอก…ด้วยนะครับ" คือยังไม่ได้กรอก · ที่เหลือคือกรอกแล้วแต่ผิดเกณฑ์
    return `${first.msg.startsWith("กรอก") ? "✍️" : "⚠"} ${first.msg}${more}`;
  };
  /** เลื่อนไปที่กลุ่มช่องกรอกที่ติดปัญหา (ไฮไลต์ให้เห็นว่าอยู่ตรงไหน) — ค่าที่ผิดเกณฑ์มาก่อน */
  const jumpToInputError = () => {
    const label = (inputHardError ?? inputErrors[0])?.label;
    setClosedSections({}); // ช่องที่ติดอาจอยู่ในกรอบชุดที่ลูกค้าหุบไว้ — กางให้ก่อน ไม่งั้นเลื่อนไปไม่ถึง
    const el = label ? document.querySelector<HTMLElement>(`[data-opt-group="${CSS.escape(label)}"]`) : null;
    (el ?? document.getElementById("opt-groups"))?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (el) {
      // ⚠️ ใช้ outline ไม่ใช่ ring-* — กลุ่มช่องกรอก/ของเสริมมีกรอบ ring-stone อยู่แล้ว
      // เติมคลาส ring-rose ทับจะไม่ชนะสี (ลำดับใน stylesheet) ได้กรอบเทาหนาขึ้นเฉย ๆ ไม่แดง
      el.style.outline = "2px solid #fb7185";
      el.style.outlineOffset = "2px";
      el.style.borderRadius = "16px";
      window.setTimeout(() => {
        el.style.outline = "";
        el.style.outlineOffset = "";
        el.style.borderRadius = "";
      }, 2000);
    }
  };

  // ตารางราคาที่ใช้อยู่ (ตามเรทที่เลือก — สินค้าเรทเดียวคือ pricing เดิม)
  const matrix = useMemo(() => activeMatrix(product, effective), [product, effective]);
  // หน่วยของ "เกณฑ์ต่อลาย/ขั้นต่ำเรท" — เกณฑ์ทุกตัวนับเป็นหน่วยขาย (พวงละหลายชิ้นก็นับเป็นพวง)
  const pieceUnit = matrix?.unit ?? "ชิ้น";
  /**
   * 📐 จำนวนงานรวมที่ได้จากจำนวนที่สั่งอยู่ตอนนี้ (เช่น 10 แผ่น A3 ตัด A5 = 40 ชิ้น)
   * null = ยังไม่รู้ หรือคูณไม่ได้เพราะหน่วยที่นับไม่ใช่หน่วยขาย
   * (เรทที่ขายเป็น ตร.ม. แต่ตัวเลขนับต่อแผ่น A3 — 1 ตร.ม. ไม่ใช่ 1 แผ่น)
   */
  const yieldTotal =
    unitYield && unitYield.per > 0 && (unitYield.unit == null || unitYield.unit === (matrix?.unit ?? ""))
      ? unitYield.per * qty
      : null;

  // ตัวเลือกที่แอดมินล้างราคาทิ้งในเรทนี้ (ไม่ขาย) → ถ้าลูกค้าค้างอยู่ที่ตัวนั้น สลับให้เป็นตัวแรกที่ขาย
  useEffect(() => {
    if (!matrix) return;
    setSelections((sel) => {
      let changed = false;
      const next = { ...sel };
      for (const opt of product.options) {
        // กลุ่มติ๊กหลายอย่างไม่ใช่แกนตารางราคา (ห้ามไว้ในหลังบ้าน) — ไม่ต้องสลับให้
        if (isMultiOption(opt)) continue;
        const cur = next[opt.label];
        if (cur && !isSizeInputChoice(opt, cur) && !matrixChoiceAvailable(matrix, opt.label, cur)) {
          const alt = opt.choices.map((c) => c.name).find((n) => matrixChoiceAvailable(matrix, opt.label, n));
          if (alt) {
            next[opt.label] = alt;
            changed = true;
          }
        }
      }
      return changed ? next : sel;
    });
  }, [matrix, product]);

  /**
   * 🎯 ค่าเริ่มต้นตามกลุ่มคุม (ProductOption.defaultBy) — ค่ากลุ่มคุมเปลี่ยนเมื่อไหร่ (รวมตอนเปิดหน้า)
   * กลุ่มนี้รีเซ็ตเป็นค่าเริ่มต้นของค่านั้น เช่น เรทราคา "สแตนดี้…" → "รับตะขอไหม" เริ่มที่ "ไม่รับตะขอ"
   * ผูกกับลายเซ็น "ค่าของกลุ่มคุม" เท่านั้น — ลูกค้ากดเลือกในกลุ่มเองแล้วไปแตะตัวเลือกอื่น ไม่โดนรีเซ็ต
   * (จะโดนอีกทีก็ต่อเมื่อค่ากลุ่มคุมเปลี่ยนจริง ๆ เช่น สลับเรทไปแล้วสลับกลับ)
   */
  const defaultBySignature = product.options
    .filter((o) => o.defaultBy)
    .map((o) => JSON.stringify([o.label, effective[o.defaultBy!.label] ?? ""]))
    .join("\n");
  useEffect(() => {
    if (!defaultBySignature) return;
    setSelections((sel) => {
      let changed = false;
      const next = { ...sel };
      for (const part of defaultBySignature.split("\n")) {
        const [label, ctrl] = JSON.parse(part) as [string, string];
        const opt = product.options.find((x) => x.label === label);
        const want = ctrl ? opt?.defaultBy?.map[ctrl] : undefined;
        // ค่าที่ตั้งไว้ต้องมีอยู่จริงในกลุ่ม (กันพิมพ์ชื่อผิด/ตัวเลือกถูกลบทีหลัง) — ไม่ตรงก็ไม่แตะ
        if (!opt || want == null || !opt.choices.some((c) => c.name === want)) continue;
        if (next[label] !== want) {
          next[label] = want;
          changed = true;
        }
      }
      return changed ? next : sel;
    });
    // ตั้งใจผูกแค่ลายเซ็น — ใส่ product เข้า deps แล้วรีเฟรชสินค้า (บันทึกจากหลังบ้าน) จะรีเซ็ตทับที่ลูกค้าเลือกไว้
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultBySignature]);

  /**
   * จำนวนที่ใช้เทียบ "ช่วงราคา" — สินค้าคิดเรทตามชิ้นต่อลายจะเป็น ⌊จำนวน ÷ ลาย⌋
   * ป้าย +฿ และข้อความค่าธรรมเนียมช่วงปลีกต้องอิงตัวเลขเดียวกับที่คิดราคาจริง (ดู unitPriceFor)
   */
  const feeQty = useMemo(
    () => tierQtyFor(product, effectiveWithDesigns, qty),
    [product, effectiveWithDesigns, qty]
  );

  /**
   * 🧮 จำนวนที่ใช้เทียบขั้น +฿ ของกลุ่มหนึ่ง — เท่ากับ feeQty ทุกกลุ่ม
   * ยกเว้นกลุ่มที่ราคาเป็นของ "ชิ้นย่อย" ในหน่วยขาย (extraQtyScope เช่น ติ่งห้อยของพวงกุญแจหลายชิ้น)
   * ป้าย +฿ บนการ์ดต้องใช้เลขเดียวกับที่คิดเงินจริง (ดู unitPriceFor) ไม่งั้นโชว์คนละราคากับที่จ่าย
   */
  const feeQtyOf = (opt: ProductOption) => optionFeeQty(product, opt, effectiveWithDesigns, feeQty);

  /**
   * คำเรียกจำนวนที่ใช้เทียบ "เกณฑ์ราคา" ในบรรทัด 💡 (เกณฑ์เทียบกับ feeQty = หน่วยขาย)
   * ⚠️ กลุ่มที่ขั้น +฿ นับเป็นชิ้นย่อย (extraQtyScope — ติ่งห้อย) ต้องเขียนว่า "ชิ้น" ไม่ใช่ "พวง"
   *    ไม่งั้นขึ้นว่า "ครบ 30 พวง" ทั้งที่เกณฑ์คือ 30 ติ่งห้อย (= 15 พวง พวงละ 2 ชิ้น)
   */
  const tierUnitWord = (perDesign: boolean, opt?: ProductOption) => {
    const base = opt?.extraQtyScope ? (opt.extraQtyWord ?? "ชิ้น") : (matrix?.unit ?? "ชิ้น");
    return perDesign ? `${base}ต่อลาย` : base;
  };

  // tier ปัจจุบันของราคาขั้นบันได (ถ้ามี) — สินค้าคิดเรทตามชิ้นต่อลาย ไฮไลต์เรทของ ⌊จำนวน ÷ ลาย⌋
  const currentTier = useMemo(() => (matrix ? tierIndex(matrix, feeQty) : null), [matrix, feeQty]);

  /**
   * Add on ที่บวกอยู่ใน "ราคาต่อหน่วย" แล้ว (เช่น พิมพ์รองสีขาว +20/แผ่น)
   * ไม่บอกไว้ ลูกค้าเห็นแค่ "฿110 / แผ่น A3" แล้วไม่รู้ว่ามีค่าอะไรรวมอยู่ข้างในบ้าง
   * (คนละก้อนกับ feeLines ที่บวกท้ายบิล — อันนี้แค่กางให้ดู ไม่บวกซ้ำ)
   */
  const unitAddOns = useMemo(
    () => unitAddOnBreakdown(product, effectiveWithDesigns, feeQty),
    [product, effectiveWithDesigns, feeQty]
  );
  const unitAddOnTotal = unitAddOns.reduce((n, f) => n + f.amount, 0);

  /**
   * สินค้าอื่นในหมวดเดียวกัน — ใช้ชุดที่เซิร์ฟเวอร์ดึงจากฐานข้อมูลมาให้ (มี imageSrc จริง)
   * ไม่มี/ว่าง (เช่นเครื่องที่ยังไม่ต่อฐานข้อมูล) ค่อยถอยไปใช้ชุดตัวอย่างในโค้ดเหมือนเดิม
   */
  const related = useMemo(() => {
    if (relatedFromServer?.length) return relatedFromServer.slice(0, 12);
    return PRODUCTS.filter((p) => p.category === product.category && p.id !== product.id && !p.hidden).slice(0, 12);
  }, [relatedFromServer, product.category, product.id]);

  // แสดงปุ่มลัดไปหลังบ้านเฉพาะแอดมิน (โหมดเดโม = เห็นเสมอ, โหมดจริง = ต้องล็อกอิน)
  // ถามตอนเบราว์เซอร์ว่างแล้ว — ปุ่มนี้ไม่เร่งด่วน ลูกค้าทั่วไปไม่ควรต้องรอคำขอนี้ตอนเปิดหน้า
  useEffect(() => {
    const idle = window.requestIdleCallback?.bind(window) ?? ((fn: () => void) => setTimeout(fn, 1200));
    const id = idle(() =>
      void canAccessAdmin().then((ok) => {
        setIsAdmin(ok);
        // คืนค่าโหมดที่เลือกไว้ล่าสุด (เฉพาะพนักงาน — ลูกค้าทั่วไปไม่มีทางเปิดโหมดนี้ได้)
        if (ok && typeof localStorage !== "undefined" && localStorage.getItem(ADMIN_MODE_KEY) === "1") setAdminMode(true);
      }),
    );
    return () => window.cancelIdleCallback?.(id as number);
  }, []);

  /**
   * 🔗 สเปค+ราคาชุดที่กำลังดูอยู่ — ใช้ทั้งทำลิงก์สั้นและข้อความที่ส่งให้ลูกค้า
   * ตัดกลุ่มที่ถูกซ่อนอยู่ (showWhen ไม่ตรง) ออกด้วยเกณฑ์เดียวกับตอนลงตะกร้า (ดู buildLine)
   * ไม่งั้นข้อความที่ส่งให้ลูกค้ามีบรรทัดที่หน้าเว็บไม่ได้โชว์ เช่นลายเคลือบพิเศษที่ค้างไว้ตอนเลือกเคลือบด้าน
   */
  function priceSnapshot() {
    const spec: PriceLinkSpec = {
      v: 1,
      // ส่งค่าดิบที่ติ๊กไว้ (ไม่ใช่ค่าหลังผ่านกฎเงื่อนไข) — ฝั่งลูกค้าเดินกฎเดิมซ้ำเองอยู่แล้ว
      s: selections,
      q: qty,
      ...(rate ? { r: rate.label } : {}),
      ...(needDesignsChoice ? { d: designs } : {}),
      ...(backOn ? { b: backDesigns } : {}),
      ...(useCustom && custom?.enabled && customW.trim() && customH.trim()
        ? { c: { w: customW.trim(), h: customH.trim() } }
        : {}),
    };
    const drivers = priceDriverLabels(product);
    const hiddenLabels = new Set(
      product.options.filter((o) => !optionActive(o, effective) && !drivers.includes(o.label)).map((o) => o.label)
    );
    const lines = specEntries(pricingSelections).filter(([k]) => !hiddenLabels.has(k)) as [string, string][];
    // งานที่แอดมินต้องตีราคาเอง — อย่าโชว์ตัวเลข ฿0 ที่ไหนทั้งนั้น ลูกค้าอ่านว่าฟรี
    const askPrice = askQuote || (useCustom && customAsk);
    return { spec, lines, askPrice };
  }

  /**
   * ลิงก์ที่จะส่งให้ลูกค้า — ลิงก์สั้น /p/XXXXX (แช่ราคา + มีวันหมดอายุ + นับยอดเปิด)
   * ยิงซ้ำด้วยสเปคเดิม = ได้ลิงก์เดิม ไม่สร้างใบใหม่ทุกครั้งที่กดปุ่ม
   * สร้างไม่ได้ (ยังไม่ได้รัน supabase/price-links.sql / เน็ตหลุด) → ตกไปใช้ลิงก์ยาวแบบเดิม ยังส่งงานได้
   */
  const shortLinkRef = useRef<{ key: string; url: string; expiresAt: string } | null>(null);
  async function ensurePriceLink(): Promise<{ url: string; expiresAt?: string; short: boolean }> {
    const { spec, lines, askPrice } = priceSnapshot();
    const key = JSON.stringify(spec);
    const cached = shortLinkRef.current;
    if (cached?.key === key) return { url: cached.url, expiresAt: cached.expiresAt, short: true };

    try {
      const res = await fetch("/api/price-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          productPath: productPath(product),
          productName: product.name,
          // รูปต้องเป็น URL เต็ม — การ์ดราคาในแชทดึงรูปนี้ไปวาด
          imageSrc: product.imageSrc ? new URL(product.imageSrc, window.location.origin).toString() : undefined,
          spec,
          lines,
          qty,
          unit: pieceUnit,
          unitPrice: askPrice ? 0 : unitPrice,
          total: askPrice ? 0 : unitPrice * qty + designFee,
          askPrice,
        }),
      });
      const j = (await res.json()) as { link?: { code: string; expiresAt: string } };
      if (res.ok && j.link?.code) {
        const url = `${window.location.origin}/p/${j.link.code}`;
        shortLinkRef.current = { key, url, expiresAt: j.link.expiresAt };
        return { url, expiresAt: j.link.expiresAt, short: true };
      }
    } catch {
      /* ตกไปใช้ลิงก์ยาวด้านล่าง */
    }
    return { url: priceLinkUrl(window.location.href, spec), short: false };
  }

  /**
   * คัดลอกลิงก์ราคาไปวางในไลน์
   * ไม่ต้องคัดลอกสเปค/ราคาเป็นข้อความไปด้วย — ลิงก์เด้งการ์ดราคาให้เองในแชทอยู่แล้ว
   */
  async function copyPriceLink() {
    if (priceBusy) return;
    setPriceBusy(true);
    try {
      const { url, short } = await ensurePriceLink();
      await navigator.clipboard.writeText(url);
      setPriceCopied(short ? "ok" : "long");
      window.setTimeout(() => setPriceCopied(""), 3000);
    } catch {
      // เบราว์เซอร์ไม่ให้เขียนคลิปบอร์ด (http หรือปิดสิทธิ์ไว้) — บอกตรง ๆ ดีกว่าเงียบแล้วแอดมินไปวางของเก่า
      setPriceCopied("err");
    } finally {
      setPriceBusy(false);
    }
  }

  /** เปลี่ยนโหมดสั่งของ (ลูกค้า ↔ แอดมิน) แล้วจำไว้ให้หน้าสินค้าถัดไป */
  function switchAdminMode(on: boolean) {
    setAdminMode(on);
    try {
      localStorage.setItem(ADMIN_MODE_KEY, on ? "1" : "0");
    } catch {
      /* โหมดส่วนตัว/บล็อกสตอเรจ = ไม่จำก็ได้ ไม่ใช่เรื่องคอขาดบาดตาย */
    }
  }

  // แถบซื้อลอยล่างจอ: โชว์เมื่อกล่องสั่งซื้อหลักหลุดจอไปแล้ว
  useEffect(() => {
    const el = orderBoxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShowBuyBar(!e.isIntersecting), { rootMargin: "-80px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /**
   * ⚠️ ห้ามให้ "โยน/วางรูปลงหน้าเว็บ" ไปแนบลายอัตโนมัติเมื่อ:
   *   ① จอวางลายเปิดอยู่ — รูปที่โยนเข้าจอจะถูกนับซ้ำเป็นลายอีกใบ (บั๊ค 3 ลายกลายเป็น 6 รูป)
   *   ② สินค้าที่ออกแบบบนเว็บได้ — ช่อง "แนบลายของคุณ" ถูกซ่อนไว้ ลายต้องมาจากจอวางลายเท่านั้น
   */
  const noPageDropRef = useRef(false);

  // โยนรูปลงตรงไหนของหน้าก็ได้ → เปิดกล่องแนบลายให้เองแล้วอัปโหลดทันที
  // (ถ้าไม่ใช่รูป ก็แค่กันเบราว์เซอร์เปิดไฟล์นั้นแทนหน้าเว็บ)
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      if (noPageDropRef.current) return;
      const imgs = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!imgs.length) return;
      setExtraOpen("art");
      const dt = new DataTransfer();
      imgs.forEach((f) => dt.items.add(f));
      void uploadArtwork(dt.files);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artFiles.length]);

  // วางรูปจากคลิปบอร์ดได้เลย (ก๊อปจากแชท/โปรแกรมแต่งรูปแล้ว ⌘/Ctrl+V)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (noPageDropRef.current) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      setExtraOpen("art");
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      void uploadArtwork(dt.files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artFiles.length]);

  /**
   * อัปโหลดภาพลาย — ตรวจก่อนขึ้นเซิร์ฟเวอร์ทีละชั้น:
   * ① ชนิดไฟล์ต้องเป็นรูป (JPG/PNG/WEBP) ② ขนาดไม่เกิน 15MB ③ เปิดอ่านได้จริง (ไฟล์ไม่เสีย)
   * ④ ไม่ซ้ำกับรูปที่แนบไปแล้ว (เทียบเนื้อไฟล์จริงด้วย SHA-256 — รูปซ้ำทำให้นับจำนวนลายเพี้ยน)
   * ผ่านครบแล้วค่อยอัปโหลด + อ่านความละเอียดไว้เตือนถ้าภาพเล็ก
   */
  async function uploadArtwork(files: FileList | null) {
    if (!files?.length) return;
    setArtErr("");
    setArtBusy(true);
    const skipped: string[] = [];
    // เนื้อไฟล์ที่มีอยู่แล้ว (รูปเก่าก่อนมีระบบ hash จะไม่มีค่า — ข้ามการเทียบ)
    const seen = new Set(artFiles.map((x) => x.hash).filter(Boolean) as string[]);
    for (const f of Array.from(files)) {
      // ① ชนิดไฟล์ + ② ขนาด (ไฟล์ HEIC จาก iPhone จะบอกวิธีแก้ให้ด้วย)
      const bad = checkArtworkFile(f);
      if (bad) {
        skipped.push(bad);
        continue;
      }
      // ③ เปิดอ่านได้จริง
      const dim = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new window.Image();
        const obj = URL.createObjectURL(f);
        img.onload = () => {
          URL.revokeObjectURL(obj);
          resolve({ w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = () => {
          URL.revokeObjectURL(obj);
          resolve({ w: 0, h: 0 });
        };
        img.src = obj;
      });
      if (!dim.w || !dim.h) {
        skipped.push(`“${f.name}” ไฟล์เสีย เปิดไม่ได้ — ลองบันทึกใหม่แล้วแนบอีกครั้ง`);
        continue;
      }
      // ④ รูปซ้ำ
      let hash = "";
      try {
        const buf = await crypto.subtle.digest("SHA-256", await f.arrayBuffer());
        hash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
      } catch {
        /* เบราว์เซอร์เก่าไม่มี crypto.subtle = ข้ามชั้นนี้ไป */
      }
      if (hash && seen.has(hash)) {
        skipped.push(`“${f.name}” เป็นรูปเดียวกับที่แนบไปแล้ว — ข้ามให้ (กันนับจำนวนลายซ้ำ)`);
        continue;
      }
      try {
        const url = await uploadArtworkFile(f);
        if (hash) seen.add(hash);
        /**
         * 🐞 บั๊กที่แก้: แนบรูปแล้ว "ภาพตัวอย่างขึ้นช้า/ไม่ขึ้นเลย"
         *    รูปย่อ 80px เดิมชี้ไปที่ไฟล์ต้นฉบับบนสตอเรจ = เบราว์เซอร์โหลดไฟล์ทั้งก้อนกลับมาใหม่
         *    ทั้งที่เพิ่งอัปไฟล์เดียวกันขึ้นไปเอง (วัดจริง: ไฟล์ 5.8MB รออีก 1 วิบนเน็ตบ้าน
         *    · เน็ตมือถือรอเป็นสิบวินาที หรือค้างจนรูปไม่ขึ้นเลย)
         *    ใช้ไฟล์ในเครื่องวาดรูปย่อแทน — ขึ้นทันที ไม่กินเน็ตสักไบต์
         */
        const preview = URL.createObjectURL(f);
        // กันซ้ำอีกชั้นตอนบันทึกจริง — เผื่อวางรูปเดิมรัว ๆ ระหว่างไฟล์แรกยังอัปโหลดไม่เสร็จ
        setArtFiles((cur) =>
          hash && cur.some((x) => x.hash === hash)
            ? cur
            : [...cur, { url, name: f.name, ...dim, preview, ...(hash ? { hash } : {}) }]
        );
        // อัปโหลดสำเร็จแล้ว artBlocked เป็น false — ตรึงกล่องให้เปิดค้าง ไม่ให้หุบหนีรูปที่เพิ่งแนบ
        setArtTouched(true);
        setExtraOpen("art");
      } catch (e) {
        // ข้อความจริงจากตัวอัปโหลด (ไฟล์ใหญ่เกิน / เน็ตหลุด / รหัสสถานะ) — ไม่ใช่ "ไม่สำเร็จ" ลอย ๆ
        setArtErr(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
        break;
      }
    }
    if (skipped.length) setArtErr((cur) => [cur, ...skipped].filter(Boolean).join(" · "));
    setArtBusy(false);
  }

  /**
   * 🎨 สินค้าตัวนี้ "ออกแบบบนเว็บได้เลย" ไหม — มีเทมเพลตที่ถอดขนาดงานจริงได้ตามตัวเลือกที่เลือกอยู่
   * ถ้ามี: หน้าสินค้าเปลี่ยนเป็นโหมด "เริ่มสร้าง" (ไม่ต้องให้ลูกค้าแนบไฟล์ลายเอง)
   *
   * แอดมินปิดปุ่มไว้ (studioOff) = ไม่มีโหมดนี้ทั้งฝั่งลูกค้าและฝั่งทีมงาน —
   * แต่กล่อง 📐 ไฟล์เทมเพลตด้านล่างยังขึ้นตามเดิม (คนละส่วนกัน)
   */
  const studioOff = product.studioOff === true;
  const studioTarget = (() => {
    if (studioOff) return null;
    for (const t of templates) {
      const label = t.optionLabel?.trim();
      const chosen = label ? (effective[label] ?? "").trim() : "";
      /**
       * ไฟล์ทั้งหมดของตัวเลือกที่เลือกอยู่
       * งานสกรีนหลายด้านคือ "หลายไฟล์ในตัวเลือกเดียวกัน" — ได้กระดานคนละใบ
       */
      const picked = filesForSelections(t, effective, { includeEmpty: true });
      const usable = picked
        .map((f) => ({ f, fr: templateFrame(t, f, f.choice || chosen) }))
        .filter((x): x is { f: (typeof picked)[number]; fr: NonNullable<typeof x.fr> } => !!x.fr);
      if (!usable.length) continue;

      const multi = isMultiSide(usable.map((x) => x.f));
      // ไฟล์เดียว/คนละตัวเลือกกัน = งานหน้าเดียว ใช้ไฟล์แรกพอ (พฤติกรรมเดิม)
      const chosenFiles = multi ? usable : [usable[0]];
      const first = chosenFiles[0];
      return {
        title: `${t.name}${first.f.choice ? ` · ${first.f.choice}` : ""}`,
        frame: first.fr,
        guideUrl: previewOf(t, first.f),
        skinUrl: skinOf(t, first.f),
        tplUrl: first.f.fileUrl,
        perSheet: t.perSheet,
        slots: slotsOf(t, first.f),
        /**
         * มีหน้าไหนกำหนดช่องไว้บ้างไหม — ใช้ตัดสินว่าจะเปิด "จอวางรูปทีละช่อง"
         * ดูแค่หน้าแรกไม่ได้: งานที่หน้าแรกเป็นลายเต็มใบแต่หน้าหลัง ๆ เป็นช่อง จะตกไปโหมดลายเดียวทั้งชุด
         */
        anySlots: chosenFiles.some(({ f }) => slotsOf(t, f).length > 0),
        slotsRequired: t.slotsRequired,
        sides: chosenFiles.map(({ f, fr }, i) => ({
          key: f.id,
          name: multi ? sideName(f, i, chosenFiles.length) : "",
          frame: fr,
          slots: slotsOf(t, f),
          guideUrl: previewOf(t, f),
          skinUrl: skinOf(t, f),
          tplUrl: f.fileUrl,
        })),
      };
    }
    return null;
  })();
  /**
   * โหมดออกแบบบนเว็บ — ข้ามขั้นตอน "แนบลายของคุณ" ไปเลย
   * โหมดแอดมิน (สั่งแทนลูกค้า) ปิดโหมดนี้: หยิบใส่ตะกร้าได้เลย ไม่ต้องวางลายบนเว็บก่อน
   */
  const studioMode = !!studioTarget && !staffOrdering;
  // (ดูคำอธิบาย noPageDropRef ด้านบน) — อัปเดตค่าให้ตัวรับ drop/paste ระดับหน้าเว็บใช้
  useEffect(() => {
    noPageDropRef.current = !!studio || studioMode;
  }, [studio, studioMode]);
  const designDone = placed.length > 0;

  /**
   * 📐 ไฟล์เทมเพลตทั้งหมดที่โหลดได้ตอนนี้ — คลี่ "ชุดเทมเพลต → ไฟล์" ให้เป็นรายการเดียว
   *
   * สินค้าอย่างเคสมือถือมีเทมเพลตแยกเป็นชุดละรุ่น (14 ชุด) — เรียงเป็นแถวยาว ๆ แล้วดันเนื้อหาอื่นตกจอ
   * จึงคลี่ก่อนแล้วค่อยให้ JSX จัดเป็นตารางการ์ดเล็ก + ยุบไว้เมื่อมีหลายรายการ
   *
   * `picked` = ไฟล์ที่ตรงกับตัวเลือกที่ลูกค้าเลือกอยู่ (ชุดที่ผูก optionLabel ไว้)
   * `matched` = ชุดที่ "ชื่อ" ตรงกับค่าที่ลูกค้าเลือกในกลุ่มไหนก็ได้ (เช่น เลือกรุ่น iPhone 13 Pro
   *   แล้วมีเทมเพลตชื่อ iPhone 13 Pro) — ดันขึ้นก่อนและโชว์ให้เห็นแม้ตอนที่กล่องยังยุบอยู่
   */
  const norm = (s: string) => s.toLowerCase().replace(/[\s._/-]+/g, "");
  const pickedValues = Object.values(effective)
    .map((v) => norm(String(v ?? "")))
    .filter(Boolean);
  /**
   * ชื่อเทมเพลตที่ครอบหลายรุ่นในอันเดียว เช่น "iPhone 13/14/15" — กางเป็นชื่อรายรุ่นด้วย
   * จะได้จับคู่กับค่าที่ลูกค้าเลือก ("iPhone 14") ได้ ไม่ใช่ตรงเฉพาะรุ่นแรก
   */
  const tplAliases = (name: string) => {
    if (!name.includes("/")) return [name];
    const parts = name.split("/").map((s) => s.trim());
    const stem = parts[0].replace(/\S+$/, "").trim(); // "iPhone 13" → "iPhone"
    return [name, parts[0], ...parts.slice(1).map((p) => (stem ? `${stem} ${p}` : p))];
  };
  const tplItems = templates
    .flatMap((t) => {
      const optLabel = t.optionLabel?.trim();
      const chosen = optLabel ? (effective[optLabel] ?? "").trim() : "";
      return filesForSelections(t, effective).flatMap((f) => {
        const href = fileHref(f);
        if (!href) return [];
        return [
          {
            key: f.id,
            href,
            outside: !f.fileUrl,
            name: t.name,
            choice: f.choice ?? "",
            note: t.note ?? "",
            preview: f.previewUrl || t.previewUrl || "",
            fileName: f.fileName ?? "",
            fileSize: f.fileSize ?? 0,
            /** ไม่มีไฟล์ตรงค่าที่เลือก → ที่ให้โหลดเป็นไฟล์กลาง บอกลูกค้าตรง ๆ */
            anyNote: optLabel && chosen && !f.choice ? `ใช้ได้ทุก${optLabel}` : "",
            matched: tplAliases(`${t.name} ${f.choice ?? ""}`.trim()).some((a) =>
              pickedValues.includes(norm(a))
            ),
          },
        ];
      });
    })
    // ชุดที่ตรงกับที่ลูกค้าเลือกอยู่ ขึ้นก่อนเสมอ
    .sort((a, b) => Number(b.matched) - Number(a.matched));
  /** มีไม่กี่ไฟล์ = กางไว้เลย (พฤติกรรมเดิม) · เยอะกว่านั้นค่อยยุบให้กด */
  const tplCollapsible = tplItems.length > 4;
  const tplShown = !tplCollapsible || tplOpen ? tplItems : tplItems.filter((f) => f.matched);

  function openStudio(index: number | null = null) {
    if (!studioTarget) return;
    setEditIndex(index);
    // เทมเพลตกำหนดช่องไว้ (หน้าไหนก็ได้) → ใช้จอวางรูปทีละช่อง (สติกเกอร์หลายดวง · photobooth strip)
    if (studioTarget.anySlots) {
      setSlotStudio(true);
      return;
    }
    const d = index !== null ? placed[index] : null;
    setStudio(
      d?.placement
        ? {
            ...studioTarget,
            initial: { file: d.sourceFile, url: d.sourceUrl, placement: d.placement, swapped: d.swapped },
          }
        : studioTarget,
    );
  }

  /** ลบลายที่สร้างไว้ (ทั้งภาพที่ประกอบแล้วและตัวเลขตำแหน่ง) */
  function removeDesign(index: number) {
    const gone = artFiles[index];
    if (gone?.preview) URL.revokeObjectURL(gone.preview);
    setArtFiles((cur) => cur.filter((_, i) => i !== index));
    setPlaced((cur) => cur.filter((_, i) => i !== index));
  }

  /** จำนวนชิ้นของลายนั้น (อย่างน้อย 1) */
  function setDesignQty(index: number, n: number) {
    setPlaced((cur) => cur.map((p, i) => (i === index ? { ...p, qty: Math.max(1, Math.min(9999, n)) } : p)));
  }

  /**
   * บวก/ลบจำนวนของลายนั้น — อ่านค่าล่าสุดจากใน setState เสมอ
   * (กดรัว ๆ แล้วอ่านค่าจากตัวแปรที่เรนเดอร์ไว้ จะได้ค่าเก่า → กดสิบทีขึ้นแค่ทีเดียว)
   */
  function bumpDesignQty(index: number, delta: number) {
    setPlaced((cur) =>
      cur.map((p, i) => (i === index ? { ...p, qty: Math.max(1, Math.min(9999, p.qty + delta)) } : p)),
    );
  }

  /** จำนวนรวมของทุกลาย = จำนวนที่สั่งจริง */
  const designTotalQty = placed.reduce((n, p) => n + p.qty, 0);

  /**
   * ลูกค้าเลือกงานหลายด้าน/หลายเลเยอร์อยู่ไหม (เช่น "สกรีน 2 ด้าน")
   * — ต้องเตือนให้ชัด เพราะถ้าเข้าใจว่า "เพิ่มลาย = ด้านหลัง" จำนวนที่สั่งจะกลายเป็นสองเท่า
   */
  const multiSide = useMemo(
    () => Object.values(effective).some((v) => /([2-9]|\d\d+)\s?ด้าน|สองด้าน|หลายด้าน|เลเยอร์/.test(String(v ?? ""))),
    [effective],
  );

  // โหมดออกแบบบนเว็บ: จำนวนที่สั่ง = ผลรวมจำนวนของทุกลาย (ลูกค้าปรับที่ลายแต่ละอัน)
  useEffect(() => {
    // (โหมดแอดมินก็นับแบบเดียวกัน ถ้าพนักงานกด "วางลายเอง" ให้ลูกค้า)
    if (placed.length === 0) return;
    setQty(designTotalQty);
  }, [placed.length, designTotalQty]);

  /** อัปโหลดไฟล์เดียวแล้วคืน url (ใช้กับภาพที่ประกอบจากจอวางลาย) */
  async function uploadOne(f: File): Promise<string> {
    return uploadArtworkFile(f);
  }

  /**
   * ลูกค้ากด "ใช้ลายนี้" จากจอวางลาย
   * — ภาพที่ประกอบแล้ว = ลายที่แนบไปกับออเดอร์ (นับเป็น 1 ลาย เท่ากับแนบรูปปกติ)
   * — ไฟล์ต้นฉบับอัปตามไปด้วย แต่ไม่นับเป็นอีกลาย ทีมผลิตเอาไปทำไฟล์พิมพ์ความละเอียดเต็ม
   */
  /**
   * ผลจากจอวางรูปแบบมีช่อง (Theme) — เก็บเข้าลิสต์เดียวกับลายปกติ
   * (ไม่มี "ต้นฉบับ" ไฟล์เดียวเพราะมาจากหลายรูป · เก็บรูปรายช่องไว้ให้กดแก้ต่อในหน้าเดิมได้)
   */
  async function applySlots(r: SlotResult) {
    setArtErr("");
    setArtBusy(true);
    try {
      const url = await uploadOne(r.composite);
      const dim = await new Promise<{ w: number; h: number }>((resolve) => {
        const im = new window.Image();
        const obj = URL.createObjectURL(r.composite);
        im.onload = () => {
          URL.revokeObjectURL(obj);
          resolve({ w: im.naturalWidth, h: im.naturalHeight });
        };
        im.onerror = () => {
          URL.revokeObjectURL(obj);
          resolve({ w: 0, h: 0 });
        };
        im.src = obj;
      });
      const file = { url, name: r.composite.name, ...dim };

      /**
       * งานหลายด้าน — อัปภาพของด้านที่เหลือด้วย
       * ⚠️ ใส่ไว้ใน entry.sides เท่านั้น ไม่ยัดเข้า artFiles
       *    เพราะ artFiles.length คือ "จำนวนลาย" ที่ใช้คิดราคาและจำนวนที่สั่ง
       *    งาน 2 ด้านยังเป็นสินค้าชิ้นเดียว ไม่ใช่สองลาย
       */
      const rest: { name: string; artUrl: string; dpi: number }[] = [];
      for (const sd of r.sides.slice(1)) {
        try {
          rest.push({ name: sd.name, artUrl: await uploadOne(sd.composite), dpi: sd.dpi });
        } catch {
          /* ด้านที่อัปไม่ขึ้นยังมีสเปคบอกตำแหน่งอยู่ ไม่บล็อกการสั่ง */
        }
      }

      const entry = {
        summary: r.summary,
        head: r.head,
        dpi: r.dpi,
        spec: r.spec,
        sourceUrl: "",
        artUrl: url,
        slotShots: Object.fromEntries(r.sides.map((sd) => [sd.key, sd.shots])),
        sides: r.sides.length > 1 ? [{ name: r.sides[0].name, artUrl: url, dpi: r.sides[0].dpi }, ...rest] : undefined,
      };
      if (editIndex !== null) {
        setArtFiles((cur) => cur.map((x, i) => (i === editIndex ? file : x)));
        setPlaced((cur) => cur.map((x, i) => (i === editIndex ? { ...entry, qty: x.qty } : x)));
      } else {
        setArtFiles((cur) => [...cur, file]);
        setPlaced((cur) => [...cur, { ...entry, qty: 1 }]);
      }
      setEditIndex(null);
      setSlotStudio(false);
    } catch (e) {
      setArtErr(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
      throw e;
    } finally {
      setArtBusy(false);
    }
  }

  async function applyStudio(r: StudioResult) {
    setArtErr("");
    setArtBusy(true);
    try {
      const url = await uploadOne(r.composite);
      let sourceUrl = "";
      try {
        sourceUrl = await uploadOne(r.source);
      } catch {
        /* ต้นฉบับอัปไม่ขึ้นก็ยังสั่งได้ — ภาพที่ประกอบแล้วพอผลิตได้ */
      }
      const dim = await new Promise<{ w: number; h: number }>((resolve) => {
        const im = new window.Image();
        const obj = URL.createObjectURL(r.composite);
        im.onload = () => {
          URL.revokeObjectURL(obj);
          resolve({ w: im.naturalWidth, h: im.naturalHeight });
        };
        im.onerror = () => {
          URL.revokeObjectURL(obj);
          resolve({ w: 0, h: 0 });
        };
        im.src = obj;
      });
      const file = { url, name: r.composite.name, ...dim };
      const entry = {
        summary: r.summary,
        head: r.head,
        dpi: r.dpi,
        spec: r.spec,
        sourceUrl,
        artUrl: url,
        sourceFile: r.source,
        placement: r.placement,
        swapped: r.swapped,
      };
      if (editIndex !== null) {
        setArtFiles((cur) => cur.map((x, i) => (i === editIndex ? file : x)));
        setPlaced((cur) => cur.map((x, i) => (i === editIndex ? { ...entry, qty: x.qty } : x)));
      } else {
        setArtFiles((cur) => [...cur, file]);
        setPlaced((cur) => [...cur, { ...entry, qty: 1 }]);
      }
      setEditIndex(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง";
      setArtErr(msg);
      // โยนต่อให้จอวางลายรู้ว่าไม่สำเร็จ — ไม่งั้นจอปิดไปเฉย ๆ ทั้งที่ยังไม่ได้ลาย
      // (ในโหมดออกแบบบนเว็บ ช่อง "แนบลายของคุณ" ถูกซ่อน ข้อความเตือนเลยไม่มีที่โผล่)
      throw new Error(msg);
    } finally {
      setArtBusy(false);
    }
  }

  // สั่งถึงเกณฑ์จำนวนมากไหม (ตั้งต่อสินค้าได้ในหลังบ้าน)
  const bulkAsk = needsStockCheck(product, qty);

  // 💬 งานที่ต้องคุยลายกับแอดมินก่อน (งานปัก ฯลฯ) — ตั้งสวิตช์ + เงื่อนไขไว้ในหลังบ้าน
  // (effective มี "เรทราคา" อยู่แล้ว เงื่อนไขจึงอ้างเรทหรือกลุ่มตัวเลือกไหนก็ได้)
  const consult = artworkConsultOf(product, effective);
  // โหมดออกแบบบนเว็บ/โหมดแอดมินสั่งแทน = คุยกันอยู่แล้ว ไม่ต้องกั้นซ้ำ
  const consultGate = !!consult && consult.block !== false && !studioMode && !staffOrdering;
  const consultBlocked = consultGate && !consultOk;
  /**
   * 💬 กลุ่มที่ "เป็นตัวจุดชนวน" ให้ต้องคุยกับแอดมิน — เอาไปแปะกล่องเตือนใต้กลุ่มนั้นทันที
   * (กล่องยืนยันตัวจริงอยู่ท้ายหน้า ถ้าไม่บอกตรงนี้ ลูกค้าเลือกแล้วไม่เห็นอะไรเปลี่ยนเลย)
   */
  const consultTriggers = consultTriggerLabels(product, effective);

  // 🎨 ต้องแนบลายก่อนสั่งไหม — ต้องมีรูปอัปโหลด หรือ ลิงก์/อีเมล อย่างน้อยหนึ่งอย่าง
  // งานที่ต้องคุยลายก่อน: ไฟล์จริงจะตกลงกันในแชท ไม่บังคับแนบตรงนี้ (แนบเป็นตัวอย่างได้)
  const artRequired = artworkIsRequired(product) && !consult;
  const artProvided = artFiles.length > 0 || artLink.trim().length > 0;
  /**
   * 🎨 โหมดออกแบบบนเว็บ "ยังต้องวางลายอยู่ไหม"
   *
   * ลูกค้าที่ทำไฟล์ลายมาเองเรียบร้อยแล้ว (อัปรูป หรือใส่ลิงก์ไฟล์) ไม่ต้องไปวางลายบนเว็บซ้ำ
   * ⚠️ เดิมโหมดนี้ซ่อนกล่อง "แนบลายของคุณ" ทิ้งทั้งกล่อง — ลูกค้าที่มีไฟล์พร้อมอยู่แล้ว
   *    จึงไม่มีที่ส่งไฟล์เลย (รวมถึงช่องลิงก์ไฟล์และหมายเหตุถึงร้านที่อยู่ในกล่องเดียวกัน)
   */
  const studioNeedsDesign = studioMode && !designDone && !artProvided;
  // โหมดออกแบบบนเว็บ: "แบบที่ลูกค้าวางเอง" คือลายอยู่แล้ว ไม่ต้องมีช่องแนบไฟล์
  // โหมดแอดมิน: ลายมาทางไลน์/อีเมลอยู่แล้ว ไม่ต้องบังคับแนบตรงนี้ (แนบเพิ่มในออเดอร์ทีหลังได้)
  const artBlocked = studioMode || staffOrdering ? false : artRequired && !artProvided;

  /**
   * 🎨 สินค้าที่นับขั้นต่ำทั้งล็อต (และสินค้าโหมดหย่อนลงตะกร้าทันที): **ไม่ถามจำนวนลาย** —
   * นับจากจำนวนรูปที่ลูกค้าอัปโหลดเอา
   * (ระบบนับให้อยู่แล้วผ่าน effect ที่ดัน designs ตาม artFiles.length · ผู้ใช้สั่ง 30 ส.ค. 69)
   * แนบเป็นลิงก์อย่างเดียวก็ผ่าน — ถือเป็น 1 ลายไปก่อน แล้วแอดมินเช็คจากไฟล์จริงอีกที
   * โหมดตะกร้า: 1 บรรทัด = 1 รุ่น/1 ลายอยู่แล้ว จำนวนลายรวมไปนับกันต่อที่ตะกร้า
   *
   * ⚠️ ยึดที่ `lotMinRate` (ตัวสินค้า) ไม่ใช่ `lotMinScope` (เรทที่เลือกอยู่) — ไม่งั้นสินค้าตัวเดียว
   * จะมี 2 มาตรฐาน: เรทแผ่น A3 ไม่ถามจำนวนลาย แต่พอสลับไปเรท ตร.ม. กลับบังคับให้ระบุ
   * แล้วปุ่ม "เพิ่มลงตะกร้า" กดแล้วเงียบ (เด้งไปกล่องจำนวนลายอย่างเดียว ป้ายบนปุ่มไม่บอก) — เจอจริง 31 ส.ค. 69
   */
  const designsOk = designsSet || ((!!lotMinRate || lotToCart) && artProvided);


  /**
   * แผ่นที่กำลังตั้งค่าอยู่ "พร้อมสั่งแล้ว" ไหม — ใช้ตัดสินว่าจะนับรวมในรอบนี้ไหม
   * ⚠️ สำคัญกับโหมดสั่งหลายแผ่น: พอพักสเปคแล้วระบบล้างลาย/หมายเหตุทิ้ง (แผ่นถัดไปแนบของตัวเอง)
   *    แผ่นที่ค้างอยู่จึงยังไม่ครบ — ถ้าไม่แยกเคสนี้ ลูกค้าที่พักครบ 3 แผ่นแล้วจะกดสั่งไม่ได้เลย
   */
  const currentReady =
    !(
      (useCustom && !customValid) ||
      !!customSizeErr ||
      artBlocked ||
      consultBlocked ||
      inputErrors.length > 0 ||
      belowMin ||
      belowMinQty
    ) &&
    !(needDesignsChoice && !designsOk) &&
    !studioNeedsDesign;
  /**
   * 📦 ราคาสุดท้ายของ "สเปคที่พักไว้ (+ แผ่นที่กำลังตั้งค่า ถ้าพร้อมแล้ว)" — คิดผ่านกติกาเดียวกับตะกร้าเป๊ะ
   * (repriceCartGroups: ขั้นราคาจากยอดรวมล็อต · ราคาต่อแผ่นอ่านคอลัมน์ของสเปคตัวเอง · ค่าคละแยกตามกติกา)
   * รวมบรรทัดที่อยู่ในตะกร้าแล้วเข้าไปคิดด้วย แต่ตัดออกจากผลลัพธ์ — ลูกค้าเห็นเฉพาะที่กำลังจะสั่งรอบนี้
   */
  const sheetRoll = useMemo(() => {
    if (!lotMinScope || !sheets.length) return undefined;
    const mine = [
      ...sheets.map((s) => ({ productId: product.id, selections: s.selections, qty: s.qty })),
      ...(currentReady ? [{ productId: product.id, selections: pricingSelections, qty }] : []),
    ];
    const inCart = cartItems.map((i) => ({ productId: i.productId, selections: i.selections, qty: i.qty }));
    // ⚠️ แคตตาล็อกของตะกร้ารู้จักเฉพาะสินค้าที่ "อยู่ในตะกร้าแล้ว" — ตะกร้าว่างจะคืน undefined
    //    แล้วราคาทุกบรรทัดกลายเป็น ฿0 เงียบ ๆ · สินค้าที่เปิดหน้าอยู่ต้องยัดเข้าไปเอง
    const priceOf = (id: string) => (id === product.id ? product : productOf(id));
    const priced = repriceCartGroups([...inCart, ...mine], priceOf).slice(inCart.length);
    return {
      rows: priced,
      /** นับแผ่นที่กำลังตั้งค่าด้วยไหม — false = ยังกรอกไม่ครบ ปุ่มจะสั่งเฉพาะที่พักไว้ */
      withCurrent: currentReady,
      qty: mine.reduce((n, l) => n + l.qty, 0),
      total: priced.reduce((sum, r, i) => sum + r.unitPrice * mine[i].qty + r.extraFee, 0),
    };
  }, [lotMinScope, sheets, product, pricingSelections, qty, cartItems, productOf, currentReady]);
  /** จำนวนที่กำลังจะกดสั่งรอบนี้ (แผ่นที่เก็บไว้ด้วยปุ่ม ➕ + แผ่นที่กำลังตั้งค่า) */
  const lotAddingQty = sheetRoll ? sheetRoll.qty : qty;
  /**
   * ยังขาดอีกกี่หน่วยถึงขั้นต่ำของรอบผลิต — นับ "ที่กำลังจะสั่ง + ที่อยู่ในล็อตเดียวกันในตะกร้าแล้ว"
   *
   * ของในตะกร้านับด้วยเพราะพิมพ์รอบเดียวกันจริง (เนื้อ/เรทเดียวกัน บิลเดียวกัน) การห้ามสั่งเพิ่ม
   * ทีละแผ่นทั้งที่ระบบเองบอกว่า "รวมเป็นล็อตเดียว" คือขัดกันเอง และเสียยอดขายฟรี ๆ
   * ⚠️ แต่ต้อง **บอกบนปุ่มทุกครั้ง** ว่าครบเพราะรวมกับตะกร้า (lotMetWithCart) ไม่งั้นปุ่มปลดล็อก
   * เฉย ๆ แล้วดูเหมือนขั้นต่ำไม่ทำงาน — ซึ่งเป็นสิ่งที่ผู้ใช้แจ้งว่าเป็นบั๊กมาก่อน (30 ส.ค. 69)
   */
  const lotShortNeed = useMemo(() => {
    if (!lotMinScope || useCustom || rateMinQty <= 1) return 0;
    return Math.max(0, rateMinQty - ((lotPreview?.cartQty ?? 0) + lotAddingQty));
  }, [lotMinScope, useCustom, rateMinQty, lotPreview, lotAddingQty]);
  /** ครบขั้นต่ำได้ "เพราะนับรวมของในตะกร้า" — ลำพังที่กดสั่งรอบนี้ยังไม่ถึง */
  const lotMetWithCart =
    lotMinScope && rateMinQty > 1 && lotShortNeed === 0 && lotAddingQty < rateMinQty && (lotPreview?.cartQty ?? 0) > 0;
  /**
   * 📦 ยังไม่ถึงขั้นต่ำของรอบผลิต — **เตือน ไม่ห้าม** (ผู้ใช้สั่ง 31 ส.ค. 69)
   *
   * เพิ่มลงตะกร้าได้ตั้งแต่แผ่นแรก เพราะขั้นต่ำเป็นของ "ทั้งล็อต" ลูกค้าทยอยเก็บของลงตะกร้า
   * แล้วค่อยเติมให้ครบทีหลังได้ · ประตูจริงย้ายไปที่ปุ่ม "✅ ยืนยันการสั่งซื้อ" ในตะกร้า
   * (lotShortfalls → cart/page.tsx · checkout · /api/orders) ซึ่งบล็อกจนกว่าจะครบทุกล็อต
   *
   * ⚠️ ประวัติ: 30 ส.ค. เคยล็อกปุ่มเพิ่มลงตะกร้าไว้ แล้วผู้ใช้ให้เปลี่ยนเป็นเตือนแทน
   */
  const belowLotMin = lotShortNeed > 0;


  /** เลื่อน+ไฮไลต์ไปที่กล่องแนบลาย (กางให้ด้วย) — ใช้จากเช็คลิสต์ "แผ่นนี้ต้องทำอะไรอีก" */
  const jumpToArt = () => {
    setArtTouched(true);
    setExtraOpen("art");
    window.setTimeout(() => {
      const el = document.getElementById("art-box");
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      if (!el) return;
      el.style.outline = "2px solid #10b981";
      el.style.outlineOffset = "3px";
      window.setTimeout(() => {
        el.style.outline = "";
        el.style.outlineOffset = "";
      }, 2000);
    }, 60);
  };

  /**
   * ✅ เช็คลิสต์ "แผ่นนี้ต้องทำอะไรอีก" — โชว์บนหัว 📄 แผ่นที่ N
   * ⚠️ จุดที่ลูกค้างงที่สุดคือ **แต่ละแผ่นต้องแนบลายของตัวเอง** (พอกด ➕ ระบบล้างช่องลายให้
   *    เพื่อให้แผ่นถัดไปแนบไฟล์ใหม่) — ถ้าไม่มีเช็คลิสต์บอก ลูกค้าจะไม่รู้เลยว่าต้องแนบอีกรอบ
   */
  const sheetTodo: { key: string; label: string; cta: string; done: boolean; jump?: () => void }[] = [
    {
      key: "opts",
      // ยกชื่อช่องที่ติดจริงมาเลย ลูกค้าจะได้รู้ว่าต้องไปกรอกตรงไหน (ไม่ใช่ "ตัวเลือกไม่ครบ" ลอย ๆ)
      label: `“${(inputHardError ?? inputErrors[0])?.label ?? "ตัวเลือก"}”`,
      cta: `กรอก “${(inputHardError ?? inputErrors[0])?.label ?? "ตัวเลือก"}” ก่อน`,
      done: inputErrors.length === 0,
      jump: jumpToInputError,
    },
    ...(artRequired && !staffOrdering
      ? [
          {
            key: "art",
            label: `ลายของ${lotWord}นี้`,
            // บอกเป็นคำสั่งที่ทำได้ทันที — "แนบลาย" ลอย ๆ ลูกค้าไม่รู้ว่าต้องทำอะไร
            cta: `อัปโหลดภาพลายของ${lotWord}นี้ก่อน`,
            done: artProvided,
            jump: jumpToArt,
          },
        ]
      : []),
  ];
  const sheetTodoLeft = sheetTodo.filter((t) => !t.done);

  /**
   * ด่านตรวจก่อน "หย่อนลงตะกร้า" หรือ "พักสเปคแผ่นนี้ไว้" — ไม่ผ่าน = เลื่อนจอไปจุดที่ติดให้เอง
   * แยกออกมาจาก handleAdd เพื่อให้ปุ่ม "➕ เพิ่มสเปคแผ่นถัดไป" ใช้ด่านชุดเดียวกันเป๊ะ
   */
  function readyToAdd(): boolean {
    // 🔒 ต่ำกว่าขั้นต่ำต่อลาย — ปุ่มถูกล็อกอยู่แล้ว กันไว้อีกชั้นเผื่อเรียกจากเส้นทางอื่น
    if (belowMin) return false;
    // โหมดออกแบบบนเว็บ: ต้องวางลายให้เสร็จก่อนถึงจะใส่ตะกร้าได้
    if (studioNeedsDesign) {
      openStudio();
      return false;
    }
    // ✍️ ช่องที่ให้ลูกค้ากรอกต้องครบและอยู่ในเกณฑ์ก่อน
    // ⚠️ ต้องตรวจ "ก่อน" แนบลาย — ช่องกรอกอยู่เหนือกล่องแนบลายบนหน้าจอ ไล่จากบนลงล่างถึงจะไม่งง
    //    (เคยตรวจแนบลายก่อน ปุ่มบนฟ้อง "แนบลายก่อน" ส่วนปุ่ม ➕ ฟ้อง "กรอกจำนวนจุดไดคัท" คนละเรื่องกัน)
    if (inputErrors.length) {
      jumpToInputError();
      return false;
    }
    // 💬 งานปัก/งานตีลาย — ต้องคุยลายกับแอดมินให้จบก่อนถึงจะสั่งได้
    if (consultBlocked) {
      setConsultWarn(true);
      document.getElementById("consult-box")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return false;
    }
    if (artBlocked) {
      setArtTouched(false);
      setExtraOpen("art");
      return false;
    }
    // สินค้าที่มีระบบลาย: ต้องระบุจำนวนลายก่อน (แตะ +/− พิมพ์เลข หรือแนบรูปให้นับอัตโนมัติ)
    if (needDesignsChoice && !designsOk) {
      setDesignsWarn(true);
      document.getElementById("designs-box")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return false;
    }
    return true;
  }

  /** ล้างของแนบต่อบรรทัด (ลาย/หมายเหตุ) — แผ่น/รายการถัดไปแนบของตัวเอง */
  function clearLineExtras() {
    setNote("");
    setArtLink("");
    // คืน blob url ของรูปย่อก่อนทิ้ง ไม่งั้นรูปที่แนบไปแล้วค้างในหน่วยความจำจนกว่าจะปิดหน้า
    artFiles.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setArtFiles([]);
    setPlaced([]);
  }

  /**
   * ประกอบ selections ของบรรทัดนี้ (ตัวเลือกที่เลือก + ของแนบ) — null = งานสั่งทำที่กรอกไม่ครบ
   */
  function buildLine(): Record<string, string> | null {
    // แนบข้อมูลเพิ่มไปกับรายการ (ไม่กระทบราคา): ลิงก์ไฟล์ลาย/อีเมล + หมายเหตุ
    const extra: Record<string, string> = {};
    if (artLink.trim()) extra["ลิงก์ไฟล์ลาย/อีเมล"] = artLink.trim();
    if (artFiles.length) extra["ภาพลายที่แนบ"] = artFiles.map((f) => f.url).join(" | ");
    // งานหลายด้าน — ภาพของแต่ละด้าน (ไม่นับเป็นลายเพิ่ม แค่แนบให้กราฟฟิกครบ)
    const sideArts = placed.flatMap((d, i) =>
      (d.sides ?? []).map((sd) => `${placed.length > 1 ? `ลายที่ ${i + 1} ` : ""}${sd.name}: ${sd.artUrl}`),
    );
    if (sideArts.length) extra["ภาพลายแต่ละด้าน"] = sideArts.join(" | ");
    // ลายที่วางบนเทมเพลตผ่านหน้าเว็บ — สรุปให้ลูกค้าอ่าน + ตัวเลขให้ทีมผลิตวางในไฟล์จริง
    if (placed.length) {
      const many = placed.length > 1;
      // ยุบส่วนที่ซ้ำกันทุกลาย (ชื่อแบบ+ขนาด) ไว้ครั้งเดียว — ลูกค้าเห็นบรรทัดสั้น ๆ ในออเดอร์
      extra[PLACEMENT_LABEL] = many
        ? `${placed.length} ลาย · ${placed[0].head} · ` +
          placed.map((p, i) => `ลายที่ ${i + 1} × ${p.qty} ชิ้น (${p.dpi} DPI)`).join(" · ")
        : `${placed[0].head} · ${placed[0].dpi} DPI`;
      extra[PLACEMENT_SPEC_LABEL] = placed
        .map(
          (p, i) =>
            `${many ? `ลายที่ ${i + 1} × ${p.qty} ชิ้น — ` : ""}${p.spec}` +
            (p.sourceUrl ? ` · ต้นฉบับ: ${p.sourceUrl}` : ""),
        )
        .join(" | ");
    }
    // สั่งจำนวนมาก → ติดธงให้ทีมเช็คสต๊อก/คิวผลิตแล้วยืนยันจำนวนกับลูกค้าก่อนเริ่มงาน
    if (bulkAsk) extra["รอเช็คสต๊อก"] = "สั่งจำนวนมาก — รอทีมงานยืนยันจำนวน";
    // งานที่ต้องคุยลายก่อน — ติดไปกับใบงานว่าคุยจบแล้ว/คุยกับใคร (หรือยังไม่คุย ถ้าตั้งไว้แค่แนะนำ)
    if (consult) {
      extra[CONSULT_LABEL] = consultOk
        ? consultRef.trim()
          ? `คุยลายกับแอดมินแล้ว · ${consultRef.trim()}`
          : "คุยลายกับแอดมินแล้ว"
        : "ยังไม่ได้คุย — รอแอดมินทักกลับเรื่องลาย";
    }
    if (note.trim()) extra["หมายเหตุ"] = note.trim();
    // จำนวนลายที่คละ (เรทที่มีระบบลาย / สินค้าคิดเรทตามชิ้นต่อลาย) — เก็บเป็นตัวเลือกให้เห็นในตะกร้า/ออเดอร์
    if ((rate?.minPerDesign || tierByDesign || mixRule) && designs >= 1) extra[DESIGN_LABEL] = `${designs} ลาย`;
    // 🔄 จำนวนลายด้านหลัง (งานพิมพ์ 2 ด้าน) — ค่าคละอีกชุดตามกติกาเดียวกับด้านหน้า
    if (backOn && backDesigns >= 1) extra[BACK_DESIGN_LABEL] = `${backDesigns} ลาย`;
    if (useCustom) {
      if (!custom || !customValid || customSizeErr) return null; // ต้องกรอกขนาดให้ครบ + ไม่เกินที่รับผลิตได้
      // เก็บขนาดที่ระบุลง selections (เป็น key ของตะกร้า + ใช้คิดราคาซ้ำ)
      // + กลุ่มตัวเลือกที่แอดมินเปิดให้เลือกต่อได้ (keepOptions) ติดไปกับออเดอร์ด้วย
      const kept = Object.fromEntries(
        Object.entries(effective).filter(([k]) => customKeepsOption(custom, k))
      );
      const customValue = customChat ? "คุยรายละเอียดกับแอดมิน" : `${cW}×${cH} ${custom.unit}`;
      return { ...kept, [custom.label]: customValue, ...extra };
    }
    // กลุ่มที่ถูกซ่อน (showWhen ไม่ตรง) หรือกลุ่มงานสั่งทำที่ลูกค้าไม่ได้ติ๊ก — ไม่ต้องติดไปกับตะกร้า/ออเดอร์
    // ⚠️ ยกเว้นกลุ่มที่เป็นแกนตารางราคา — ตัดออกแล้วตะกร้าหาช่องราคาไม่เจอ ราคาหล่นไปที่ราคาตั้งต้น
    // (เคยพลาด: พวงกุญแจ "ประเภทอะคริลิค" ถูกซ่อนด้วย showWhen หน้าสินค้า ฿110 แต่ในตะกร้าเหลือ ฿90)
    const drivers = priceDriverLabels(product);
    const hidden = product.options
      .filter((o) => !optionActive(o, effective) && !drivers.includes(o.label))
      .map((o) => o.label);
    // ค่าว่าง = กลุ่มติ๊กหลายอย่างที่ลูกค้าไม่ได้ติ๊กอะไรเลย — ไม่ต้องโชว์เป็นบรรทัดเปล่าในตะกร้า/ออเดอร์
    const shown = Object.fromEntries(
      Object.entries(effectiveWithDesigns).filter(([k, v]) => !hidden.includes(k) && v !== "")
    );
    return { ...shown, ...extra };
  }

  function handleAdd() {
    // 🔒 กันกดรัว/แตะซ้ำบนมือถือ — 1 คลิก = 1 รายการเสมอ
    // (กดครั้งแรกสำเร็จ ระบบเคลียร์ลาย/หมายเหตุทิ้ง ครั้งที่สองจึงกลายเป็น "อีกรายการ" คนละใบงาน)
    // ล็อกเฉพาะตอนที่เพิ่มเข้าตะกร้าได้จริง — โดนเตือนแล้วกดแก้ต่อได้ทันที ไม่ต้องรอ
    if (addLock.current) return;
    /**
     * 📦 มีสเปคพักไว้แล้ว แต่แผ่นที่กำลังตั้งค่ายังไม่พร้อม (พักเสร็จระบบล้างลายทิ้ง)
     * → สั่งเฉพาะที่พักไว้ ไม่ต้องบังคับให้กรอกแผ่นที่ยังไม่ได้ตั้งใจจะสั่งให้ครบก่อน
     */
    const onlyStaged = sheets.length > 0 && !currentReady;
    if (!onlyStaged && !readyToAdd()) return;
    const selections = onlyStaged ? null : buildLine();
    if (!onlyStaged && !selections) return;
    /**
     * ✏️ โหมดแก้ไข — ลบบรรทัดเดิมทิ้ง "ก่อน" ใส่ของใหม่เสมอ
     * ถ้าสเปคใหม่เหมือนเดิมเป๊ะ คีย์จะซ้ำกับของเดิม — ใส่ก่อนจะกลายเป็นบวกจำนวนทับ แล้วลบทีหลังหายทั้งบรรทัด
     */
    const editKey = editing ? editKeyRef.current : null;
    if (editKey) removeItem(editKey);
    // 📦 สเปคแผ่นอื่นที่พักไว้ — หย่อนลงตะกร้าพร้อมกันทีเดียว (คนละบรรทัด อยู่ล็อตเดียวกัน)
    for (const sh of sheets) addItem(product.id, sh.selections, sh.qty, product);
    /**
     * หิ้วตำแหน่งลาย/ภาพรายด้านของบรรทัดเดิมไปด้วย — เฉพาะตอนที่ลายที่แนบยังครบเหมือนเดิม
     * (ลบลายทิ้งไปแล้วยังหิ้วต่อ = ใบงานอ้างถึงรูปที่ไม่ได้แนบมา) · วางลายใหม่เอง ค่าใหม่ทับอยู่แล้ว
     */
    const carry = editKey ? editCarryRef.current : null;
    const artsIntact =
      !!carry && carry.arts.length > 0 && carry.arts.every((u) => artFiles.some((f) => f.url === u));
    const line = selections && carry && artsIntact ? { ...carry.keys, ...selections } : selections;
    if (line) addItem(product.id, line, qty, product);
    setSheets([]);
    // แก้เสร็จแล้วพากลับตะกร้าเลย — ลูกค้ามาจากตะกร้า ไม่ได้ตั้งใจสั่งเพิ่มอีกใบ
    if (editKey) {
      router.push("/cart");
      return;
    }
    // เพิ่มสำเร็จแล้วค่อยล็อก — กันแตะซ้ำภายในไม่กี่ร้อยมิลลิวินาทีกลายเป็นสองใบงาน
    addLock.current = true;
    setTimeout(() => {
      addLock.current = false;
    }, 1200);
    clearLineExtras();
    setAdded(true);
    // โชว์ "✓ เพิ่มลงตะกร้าแล้ว!" ~5 วิ — พอให้ลูกค้าเห็นชัดว่าสั่งสำเร็จ
    // (เดิม 1.8 วิ สั้นไป แล้วป้าย "ต้องแนบลาย" เด้งกลับมาเพราะเพิ่งล้าง artFiles ทิ้ง ดูเหมือนระบบฟ้อง)
    setTimeout(() => setAdded(false), 5000);
  }

  /**
   * ➕ พักสเปคแผ่นนี้ไว้ แล้วให้ลูกค้าตั้งค่าแผ่นถัดไปต่อ (ยังไม่ลงตะกร้า)
   * ผ่านด่านตรวจชุดเดียวกับการเพิ่มลงตะกร้า — ของที่พักไว้จึงพร้อมสั่งเสมอ
   *
   * ⚠️ ใช้เฉพาะสินค้าที่ **ไม่ได้** เปิด lotToCart (สติ๊กเกอร์ UV) — สินค้าที่เปิดไว้ (เคสมือถือ)
   *    ไม่มีปุ่ม ➕ แล้ว เหลือปุ่มเดียวคือ "🛒 เพิ่มลงตะกร้า" ที่หย่อนลงตะกร้าให้ทีละรุ่น
   */
  function stageSheet() {
    if (addLock.current) return;
    // ยังกรอกไม่ครบ — ปุ่มบอกชื่อช่องอยู่แล้ว กดแล้วพาไปที่ช่องนั้นเลย
    if (sheetTodoLeft.length) {
      sheetTodoLeft[0].jump?.();
      return;
    }
    if (!readyToAdd()) return;
    const selections = buildLine();
    if (!selections) return;
    setSheets((cur) => [...cur, { id: `sh${cur.length}-${Math.random().toString(36).slice(2, 8)}`, selections, qty }]);
    clearLineExtras();
    setStaged(true);
    setTimeout(() => setStaged(false), 2500);
    /**
     * เลื่อนไปที่หัว "📄 แผ่นที่ N" (ที่เพิ่งเปลี่ยนเลข) แล้วไฮไลต์เขียวทั้งบล็อกตัวเลือก 2 วิ
     * ⚠️ เดิมเลื่อนไปกลางกลุ่มใดกลุ่มหนึ่ง — ฟอร์มหน้าตาเหมือนเดิมเป๊ะ ลูกค้าเลยไม่รู้ว่าอะไรเปลี่ยน
     *    เลื่อนมาที่หัวเลขแผ่นจะเห็นทันทีว่า "ตอนนี้กำลังตั้งค่าแผ่นที่ 2 แล้ว"
     */
    window.setTimeout(() => {
      const head = document.getElementById("sheet-head");
      const box = document.getElementById("opt-groups");
      (head ?? box)?.scrollIntoView({ block: "start", behavior: "smooth" });
      for (const el of [head, box]) {
        if (!el) continue;
        el.style.outline = "2px solid #10b981";
        el.style.outlineOffset = "3px";
        el.style.borderRadius = "16px";
        window.setTimeout(() => {
          el.style.outline = "";
          el.style.outlineOffset = "";
        }, 2000);
      }
    }, 60);
  }

  // ── SEO/AEO: FAQ + structured data (JSON-LD) ให้ Google/AI ดึงไปตอบ ──
  // ไม่มี FAQ ที่แอดมินเขียนเอง → ใช้ชุดที่ระบบเขียนให้อัตโนมัติ (ทุกสินค้ามี AEO เสมอ)
  const faqs = product.seo?.faqs?.length ? product.seo.faqs : productAutoSeo(product).faqs;
  const jsonLd = useMemo(() => {
    const range = priceRange(product);
    const graph: Record<string, unknown>[] = [
      {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: product.seo?.description || product.description,
        ...(product.imageSrc ? { image: [product.imageSrc] } : {}),
        category: getCategory(product.category).name,
        // ดาวจากรีวิวลูกค้าจริงมาก่อน — ไม่มีค่อยถอยไปใช้ rating ที่แอดมินตั้งมือ
        ...(reviewStats
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: reviewStats.avg,
                reviewCount: reviewStats.count,
              },
            }
          : product.rating
            ? {
                aggregateRating: {
                  "@type": "AggregateRating",
                  ratingValue: product.rating,
                  reviewCount: Math.max(1, product.sold),
                },
              }
            : {}),
        offers: {
          "@type": "Offer",
          priceCurrency: "THB",
          price: range.min,
          availability: "https://schema.org/InStock",
        },
      },
    ];
    if (faqs.length > 0) {
      graph.push({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      });
    }
    return graph;
  }, [product, faqs, reviewStats]);

  /**
   * บล็อก "รายละเอียดสินค้า" — แอดมินเลือกโซนได้ต่อท่อน (ดู BodySection.slot)
   * "side" = ช่องข้าง ๆ แผงสั่งซื้อ (คอลัมน์ซ้าย) · ไม่ระบุ = ใต้แผงสั่งซื้อเต็มความกว้าง
   * หัวข้อ "รายละเอียดสินค้า …" ขึ้นครั้งเดียวที่โซนแรกที่มีเนื้อหา
   */
  const bodyOf = (zone: "side" | "wide") =>
    (product.body ?? []).filter((b) => (b.slot ?? "wide") === zone);
  const detailsSection = (zone: "side" | "wide", mtCls: string) => {
    const sections = bodyOf(zone);
    if (sections.length === 0) return null;
    const withHeading = zone === "side" || bodyOf("side").length === 0;
    return (
      <section className={mtCls}>
        {withHeading && (
          <h2 className="text-center text-2xl font-extrabold text-amber-950">
            รายละเอียดสินค้า {product.name}
          </h2>
        )}
        <div className={`space-y-12 ${withHeading ? "mt-8" : ""}`}>
          {sections.map((sec, i) => (
            <div
              key={`${sec.heading}-${i}`}
              className={`grid items-center gap-6 md:gap-10 ${sec.image ? "md:grid-cols-2" : ""}`}
            >
              {sec.image &&
                (sec.image.src ? (
                  // รูปจริง: โชว์เต็มสัดส่วนไม่ครอป + กดเพื่อดูขนาดใหญ่
                  <button
                    type="button"
                    onClick={() => setZoomSrc(sec.image!.src!)}
                    className={`group relative cursor-zoom-in ${sec.align === "right" ? "md:order-2" : ""}`}
                    aria-label={`ขยายรูป ${sec.image.label || sec.heading || "ประกอบสินค้า"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sec.image.src}
                      alt={sec.image.label || sec.heading}
                      loading="lazy"
                      decoding="async"
                      className="w-full rounded-[2rem] shadow-sm ring-1 ring-amber-100/70 transition group-hover:brightness-95"
                    />
                    <span className="absolute bottom-3 right-3 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-bold text-stone-500 shadow-sm backdrop-blur transition group-hover:bg-white">
                      🔍 กดเพื่อขยาย
                    </span>
                  </button>
                ) : (
                  <ProductVisual
                    emoji={sec.image.emoji}
                    gradient={sec.image.gradient}
                    alt={sec.image.label || sec.heading}
                    size="text-[6rem]"
                    className={`aspect-[4/3] w-full rounded-[2rem] shadow-sm ${
                      sec.align === "right" ? "md:order-2" : ""
                    }`}
                  />
                ))}
              <div className={`text-center ${sec.align === "right" ? "md:order-1" : ""}`}>
                {sec.heading && (
                  <h3 className="text-xl font-extrabold text-amber-600">{sec.heading}</h3>
                )}
                {/* เนื้อหาแบบจัดรูปแบบจากหลังบ้าน (ผ่าน sanitize ฝั่งเซิร์ฟเวอร์ตอนบันทึก) — ไม่มีค่อยใช้ข้อความธรรมดาแบบเดิม
                    เนื้อหา HTML ที่ออกแบบมาเป็นกล่อง/ตาราง กินเต็มความกว้างที่มี (ไม่ตีกรอบ max-w-lg เหมือนข้อความเปล่า)
                    มีรูปประกอบคู่กัน = อยู่ในครึ่งคอลัมน์อยู่แล้ว จึงเต็มแค่ครึ่งนั้น */}
                {sec.html?.trim() ? (
                  <div
                    className={`mt-3 w-full overflow-x-auto text-left text-sm leading-relaxed text-stone-600 ${TAB_PROSE}`}
                    dangerouslySetInnerHTML={{ __html: sec.html }}
                  />
                ) : (
                  <div className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-stone-600">
                    {sec.text.split("\n").map((line, j) =>
                      line.trim().startsWith("•") ? (
                        <p key={j} className="text-left md:pl-10">
                          {line}
                        </p>
                      ) : (
                        <p key={j}>{line}</p>
                      )
                    )}
                  </div>
                )}
                {sec.image?.label && (
                  <p className="mt-2 text-xs text-stone-400">({sec.image.label})</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  /**
   * คำอธิบายป้าย "นิยม" ขึ้นครั้งเดียวต่อหน้า — ที่กลุ่มแรกที่มีป้ายนี้โผล่
   * (เดิมขึ้นซ้ำใต้ทุกกลุ่มที่มีแบบยอดนิยม สินค้าที่ตั้งไว้หลายกลุ่มเลยอ่านเจอบรรทัดเดิม 3-4 รอบ)
   * ตั้งใหม่ทุกครั้งที่ component เรนเดอร์ · optionGroupUI ถูกเรียกตามลำดับ JSX จากบนลงล่าง
   */
  let popularLegendShown = false;

  /**
   * 🧩 ชื่อกลุ่มที่ใช้แสดงเมื่ออยู่ในกรอบ "ชุดตัวเลือก" (ProductOption.section)
   * หัวชุดบอกอยู่แล้วว่าชิ้นไหน จึงตัดชื่อชุดที่ซ้ำอยู่ท้ายชื่อกลุ่มออก ("ขนาดชิ้นที่ 2" → "ขนาด")
   * ตัดแล้วเหลือว่าง (ชื่อกลุ่มเท่ากับชื่อชุดพอดี) = คงชื่อเต็มไว้ ไม่งั้นหัวข้อหาย
   */
  function sectionShortLabel(opt: ProductOption): string {
    // ชื่อชุดที่โชว์อาจไม่ตรงกับท้ายชื่อกลุ่ม (หัวชุด "ติ่งห้อย ชิ้นที่ 1" · ชื่อกลุ่ม "ขนาดชิ้นที่ 2")
    // — sectionTrim บอกว่าให้ตัดส่วนท้ายด้วยคำไหน
    const trim = opt.sectionTrim || opt.section;
    if (!opt.section || !trim || !opt.label.endsWith(trim)) return opt.label;
    return opt.label.slice(0, -trim.length).trim() || opt.label;
  }

  /**
   * กลุ่มตัวเลือก 1 กลุ่มบนหน้าสินค้า — ใช้ทั้งในรายการตัวเลือกปกติ และในกล่อง 📐 งานสั่งทำ
   * (กลุ่มเดียวกันโผล่แค่ที่เดียว ตัดสินด้วย isMadeToOrderOpt)
   */
  function optionGroupUI(opt: ProductOption, framed = true) {
              // ล็อกกลุ่มนี้เพราะใช้ขนาดกำหนดเองอยู่ และแอดมินไม่ได้เปิดให้เลือกต่อ
              const customLocked = useCustom && !customKeepsOption(custom, opt.label);
              /**
               * 🔒 กลุ่มที่ล็อกไว้ทั้งออเดอร์ระหว่าง "สั่งหลายแผ่นในครั้งเดียว" (เช่น เนื้อสติ๊กเกอร์)
               * เปลี่ยนกลางคันแล้วแผ่นที่พักไว้จะกลายเป็นคนละล็อต สั่งรวมกันไม่ได้ — ล้างรายการก่อนถึงจะเปลี่ยนได้
               */
              const lotLocked = lotLockedLabels.includes(opt.label);
              // 🧩 อยู่ในกรอบชุด (opt.section) = หัวชุดบอกอยู่แล้วว่าชิ้นไหน ตัดส่วนท้ายซ้ำออกจากชื่อกลุ่ม
              // ("ขนาดชิ้นที่ 2" → "ขนาด") · ชื่อเต็มยังใช้ที่อื่นทั้งหมด (ตะกร้า/ออเดอร์/ปุ่มพาไปช่องที่ติด)
              const heading = sectionShortLabel(opt);
              const allowedByRules = allowedChoices(product, effective, opt.label);
              // ตัดตัวที่ไม่มีราคาขายในเรทที่เลือกอยู่ (แอดมินล้างแถวทิ้ง) — ตัดหมดแล้วคงชุดเดิมไว้กันหน้าพัง
              const byRate = matrix
                ? allowedByRules.filter((n) => isSizeInputChoice(opt, n) || matrixChoiceAvailable(matrix, opt.label, n))
                : allowedByRules;
              const allowed = byRate.length > 0 ? byRate : allowedByRules;
              const multi = isMultiOption(opt);
              // ✍️ ช่องกรอก — ลูกค้าพิมพ์ค่าเอง (ไม่มีรายการให้เลือก จึงไม่มีการล็อก/ไม่มีป้าย +฿)
              const isInput = isInputOption(opt);
              // กลุ่มติ๊กหลายอย่างไม่ล็อกอัตโนมัติ — เหลือตัวเลือกเดียวก็ยังต้องให้ติ๊ก/ไม่ติ๊กเองได้
              // กลุ่มที่แอดมินตั้งไว้ตัวเลือกเดียวตั้งแต่ต้น ไม่ได้ "ถูกกำหนดอัตโนมัติ" จากตัวเลือกอื่น
              // (เช่น ขนาดตัดที่มีแบบเดียว) — โชว์เป็นปุ่มปกติที่เลือกไว้แล้ว ไม่ใช่ป้ายล็อก 🔒
              const locked = !multi && !isInput && allowed.length === 1 && opt.choices.length > 1;
              const picks: MultiPick[] = multi ? selectedPicks(opt, effective) : [];
              const picked = picks.map((p) => p.name);
              // กลุ่มนี้มีตัวเลือกที่ระบุจำนวนได้ไหม (เช่น เพิ่มสาย 2 เส้น) — +฿ ของตัวนั้นคูณตามจำนวน
              const withQty = anyChoiceQty(opt);
              /** เขียนตัวเลือกที่ติ๊กกลับลง selections — เรียงตามลำดับตัวเลือกในกลุ่มเสมอ */
              const writePicks = (make: (cur: MultiPick[]) => MultiPick[]) =>
                setSelections((s) => ({ ...s, [opt.label]: joinMultiPicks(make(selectedPicks(opt, s))) }));
              /**
               * ติ๊กเปิด/ปิดตัวเลือกหนึ่งในกลุ่ม multi
               * ตัวที่อยู่ "ชุดเลือกได้อย่างเดียว" เดียวกัน (choice.exclusiveWith) จะถูกติ๊กออกให้
               * เช่น กระเป๋าเล็กด้านใน ไม่สกรีน/สกรีน = ของชิ้นเดียวกัน สั่งพร้อมกันไม่ได้
               */
              const togglePick = (name: string, on: boolean) => {
                const tag = exclusiveTag(opt, name);
                writePicks((cur) =>
                  // เก็บตามลำดับตัวเลือกในกลุ่มเสมอ — ติ๊กสลับไปมาแล้วข้อความ (และ key ตะกร้า) ไม่เปลี่ยนตาม
                  opt.choices
                    .filter((x) =>
                      x.name === name
                        ? !on
                        : cur.some((p) => p.name === x.name) && !(!on && tag && exclusiveTag(opt, x.name) === tag)
                    )
                    .map((x) => ({ name: x.name, qty: cur.find((p) => p.name === x.name)?.qty ?? 1 }))
                );
              };
              const setChoiceQty = (name: string, n: number) =>
                writePicks((cur) =>
                  cur.map((p) =>
                    p.name === name ? { ...p, qty: Math.min(choiceQtyMax(opt, name), Math.max(1, n)) } : p
                  )
                );
              /**
               * 🔽 กลุ่มของเสริมที่ปิดไว้ก่อน (collapsible) — ปิดอยู่โชว์แค่แถวสวิตช์บรรทัดเดียว
               * ปิดกลับ = เด้งค่ากลับตัวเลือกแรก (ตัวไม่คิดเงิน) ลูกค้าจะได้ไม่ค้างค่าที่มองไม่เห็น
               * กลุ่มติ๊กหลายอย่าง (multi) ปิดกลับ = ล้างที่ติ๊กทั้งหมด (ไม่ติ๊ก = ไม่คิดเงินอยู่แล้ว)
               */
              const addOn = !!opt.collapsible && !isInput;
              const addOnOpen = !!openAddOns[opt.label];
              const addOnFirst = opt.choices[0]?.name ?? "";
              const toggleAddOn = () =>
                setOpenAddOns((s) => {
                  const next = !s[opt.label];
                  // ปิดสวิตช์ = เด้งกลับตัวเลือกแรก/ล้างที่ติ๊ก กันค่าค้างที่ลูกค้ามองไม่เห็นแล้วโดนคิดเงิน
                  if (!next) setSelections((sel) => ({ ...sel, [opt.label]: multi ? "" : addOnFirst }));
                  return { ...s, [opt.label]: next };
                });
              return (
                <div
                  key={opt.label}
                  data-opt-group={opt.label}
                  className={
                    (customLocked || lotLocked ? "pointer-events-none select-none opacity-40" : "") +
                    // กลุ่มของเสริม: ใส่กรอบให้เห็นว่าเป็นก้อนที่เปิด-ปิดได้ แยกจากตัวเลือกหลักที่ต้องเลือกอยู่แล้ว
                    // ✍️ กลุ่มช่องกรอก: ใส่กรอบด้วย — ใต้ช่องมีทั้ง hint/เกณฑ์ที่รับ/ค่าบริการ/บรรทัดเตือน
                    // เรียงแบนติดกันหลายช่อง (กว้าง+ยาว) ลูกค้าแยกไม่ออกว่าบรรทัดไหนของช่องไหน
                    // framed=false = ผู้เรียกใส่กรอบครอบให้แล้ว (ช่องกรอกที่ต่อกันมาอยู่กรอบเดียวกัน
                    // · กล่อง 📐 งานสั่งทำ) — ใส่ซ้ำจะได้กรอบซ้อนกรอบ
                    (addOn || (isInput && framed) ? " rounded-2xl bg-white/60 p-2.5 ring-1 ring-stone-200" : "")
                  }
                  aria-disabled={customLocked || lotLocked || undefined}
                >
                  {/* 🔒 ล็อกไว้ทั้งออเดอร์ระหว่างสั่งหลายแผ่น — บอกเหตุผลตรงจุด ไม่ให้ลูกค้างงว่ากดไม่ได้ทำไม */}
                  {lotLocked && (
                    <p className="mb-1 text-[11px] font-bold text-amber-700">
                      🔒 ล็อกไว้ทั้งออเดอร์ — ทุก{lotWord}ต้องเป็น{opt.label}เดียวกัน
                    </p>
                  )}
                  {/* 🔽 ของเสริมที่ปิดไว้ก่อน — แถวสวิตช์บรรทัดเดียว กดแล้วค่อยกางตัวเลือกออกมา */}
                  {addOn ? (
                    <button
                      type="button"
                      onClick={toggleAddOn}
                      aria-expanded={addOnOpen}
                      className="flex w-full items-center gap-2.5 py-1 text-left"
                    >
                      <span
                        className={`relative h-6 w-11 shrink-0 rounded-full transition ${addOnOpen ? "bg-amber-400" : "bg-stone-300"}`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${addOnOpen ? "left-[22px]" : "left-0.5"}`}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold text-stone-700">
                          {heading}
                          {addOnOpen && (multi ? picks.length > 0 : effective[opt.label] !== addOnFirst) && (
                            <span className="ml-1.5 font-semibold text-amber-600">
                              {multi
                                ? picks
                                    .map((p) => {
                                      const u = choiceQtyUnit(opt, p.name);
                                      return formatMultiPick(p.name, p.qty) + (u && p.qty > 1 ? ` ${u}` : "");
                                    })
                                    .join(", ")
                                : effective[opt.label]}
                            </span>
                          )}
                        </span>
                        {!addOnOpen && (
                          <span className="mt-0.5 block text-[11px] leading-snug text-stone-500">
                            {/* ปิดอยู่ = ยังไม่คิดเงิน บอกช่วงราคาไว้ให้ตัดสินใจว่าจะเปิดดูไหม
                                คิดด้วย groupAddOf ทีละตัวเลือก = ยอดที่คิดจริงถ้าเลือกตัวนั้นที่จำนวนนี้
                                (ไม่บอกเลขเรทส่งให้คนสั่งช่วงปลีกอ่าน · กลุ่มที่มีค่าเหมาช่วงสั่งน้อยก็ได้เลขเหมา
                                ไม่ใช่เลขเรทที่ยังไม่ถึง) */}
                            {(() => {
                              const fees = opt.choices
                                .map((c) => groupAddOf(opt, { ...effective, [opt.label]: c.name }, feeQtyOf(opt)))
                                .filter((n) => n > 0)
                                .sort((a, b) => a - b);
                              return fees.length
                                ? `ไม่ใช้ก็ข้ามได้ · เปิดแล้วเริ่ม +${formatPrice(fees[0])}`
                                : "ไม่ใช้ก็ข้ามได้ · แตะเพื่อดูตัวเลือก";
                            })()}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 rounded-full bg-stone-100 px-2 py-1 text-[11px] font-bold text-stone-500">
                        {addOnOpen ? "ปิด" : "เปิด"}
                      </span>
                    </button>
                  ) : (
                  <span className="mb-1 block text-[13px] font-bold text-stone-700">
                    {heading}:{" "}
                    <span
                      className={
                        (multi && !picked.length) || (isInput && !effective[opt.label])
                          ? "font-semibold text-stone-400"
                          : "font-semibold text-amber-600"
                      }
                    >
                      {multi
                        ? picks.length
                          ? picks
                              .map((p) => {
                                // ตัวเลือกที่จำนวนคือ "ขนาด" (เช่น เซนละ) ต่อหน่วยให้ด้วย จะได้อ่านออกว่ากี่เซนติเมตร
                                const u = choiceQtyUnit(opt, p.name);
                                return formatMultiPick(p.name, p.qty) + (u && p.qty > 1 ? ` ${u}` : "");
                              })
                              .join(", ")
                          : "ไม่เลือก"
                        : isInput
                          ? effective[opt.label] || "ยังไม่ได้กรอก"
                          : effective[opt.label]}
                    </span>
                    {multi && (
                      <span className="ml-1 rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 ring-1 ring-teal-100">
                        ☑ เลือกได้หลายอย่าง{withQty ? " · ระบุจำนวนได้" : ""}
                      </span>
                    )}
                    {/* 🎁 กลุ่มที่ให้ฟรี N ตัวแรก — บอกยอดที่เหลือสด ๆ ลูกค้าจะได้รู้ว่าอีกกี่ตัวถึงเริ่มคิดเงิน */}
                    {multi && (opt.freeFirstN ?? 0) > 0 && (
                      <span className="ml-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-100">
                        {(() => {
                          const used = picks.reduce((n, p) => n + p.qty, 0);
                          const left = Math.max(0, (opt.freeFirstN ?? 0) - used);
                          return left > 0
                            ? `🎁 เลือกได้อีก ${left} ตัวโดยไม่คิดเพิ่ม`
                            : `🎁 ครบ ${opt.freeFirstN} ตัวที่รวมในราคาแล้ว — ตัวถัดไปคิดเพิ่ม`;
                        })()}
                      </span>
                    )}
                    {isInput && opt.input?.required === false && (
                      <span className="ml-1 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-500">
                        ไม่บังคับ
                      </span>
                    )}
                  </span>
                  )}
                  {/* กลุ่มของเสริมที่ปิดสวิตช์อยู่ — ไม่กางอะไรต่อ (หน้าจะได้สั้น เหลือแค่แถวสวิตช์) */}
                  {(!addOn || addOnOpen) && (
                  <div className={addOn ? "mt-2 border-t border-stone-100 pt-2" : undefined}>
                  {/* 📝 สเปกที่ลูกค้าเลือกไม่ได้ แต่ควรรู้ตอนกำลังเลือก (เช่น ชนิดกระดาษที่ใช้) */}
                  {opt.note && (
                    <span className="mb-1.5 block text-[11px] leading-snug text-stone-500">
                      {noteEmphasis(opt.note)}
                      {/* 👀 รูปตัวอย่างประกอบ note — กดเปิดดูเต็มจอทันที ไม่ต้องไล่หาในแท็บ
                          (กลุ่มช่องกรอกย้ายปุ่มไปไว้ที่ hint ใต้ช่อง — ไม่ขึ้นซ้ำสองที่) */}
                      {opt.noteImageSrc && !isInput && (
                        <button
                          type="button"
                          onClick={() => setZoomSrc(opt.noteImageSrc!)}
                          className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 align-middle text-[10px] font-bold text-sky-700 ring-1 ring-sky-200 transition hover:bg-sky-50"
                        >
                          👀 กดดูรูปตัวอย่าง
                        </button>
                      )}
                    </span>
                  )}
                  {isInput ? (
                    (() => {
                      const cfg = opt.input;
                      const raw = parseInputValue(opt, effective[opt.label]);
                      const err = inputError(opt, effective[opt.label], effective);
                      // เขียนกลับลง selections พร้อมหน่วย ("2.5" + "ซม." → "2.5 ซม.")
                      const write = (v: string) =>
                        setSelections((sel) => ({ ...sel, [opt.label]: formatInputValue(opt, v) }));
                      const clean = (v: string) =>
                        cfg?.kind === "number" ? v.replace(/[^\d.]/g, "") : v.slice(0, cfg?.maxLength ?? INPUT_MAX_LEN);
                      return (
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            {cfg?.kind === "textarea" ? (
                              <textarea
                                value={raw}
                                onChange={(e) => write(clean(e.target.value))}
                                placeholder={cfg.placeholder}
                                rows={3}
                                aria-label={opt.label}
                                className="w-full rounded-xl bg-white px-3 py-2 text-[13px] text-stone-700 ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                              />
                            ) : (
                              <input
                                type="text"
                                inputMode={cfg?.kind === "number" ? "decimal" : "text"}
                                value={raw}
                                onChange={(e) => write(clean(e.target.value))}
                                placeholder={cfg?.placeholder}
                                aria-label={opt.label}
                                className={`rounded-xl bg-white px-3 py-2 text-[13px] font-semibold text-stone-700 ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300 ${
                                  cfg?.kind === "number" ? "w-28" : "w-full"
                                }`}
                              />
                            )}
                            {cfg?.unit && <span className="text-xs font-semibold text-stone-500">{cfg.unit}</span>}
                          </div>
                          {cfg?.hint && (
                            <p className="mt-1 text-[11px] text-stone-500">
                              {cfg.hint}
                              {/* 👀 รูปตัวอย่างของกลุ่มช่องกรอก (เช่น วิธีนับจุดไดคัท) — กดเปิดดูเต็มจอทันที */}
                              {opt.noteImageSrc && (
                                <button
                                  type="button"
                                  onClick={() => setZoomSrc(opt.noteImageSrc!)}
                                  className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 align-middle text-[10px] font-bold text-sky-700 ring-1 ring-sky-200 transition hover:bg-sky-50"
                                >
                                  👀 กดดูรูปตัวอย่าง
                                </button>
                              )}
                            </p>
                          )}
                          {/* 📐 จำนวนชิ้นโดยประมาณต่อแผ่น — คำนวณสดจากกว้าง×สูงที่กรอก (ดู sheetYield) */}
                          {(() => {
                            const n = sheetYieldCount(product, opt, effective);
                            if (n == null) return null;
                            const sheet = opt.sheetYield?.sheetName ?? "แผ่น";
                            const gap = opt.sheetYield?.gap ?? 0;
                            // gap เก็บหน่วยเดียวกับช่องกรอก (ซม.) — บอกลูกค้าเป็น มม. อ่านง่ายกว่า
                            const gapNote = gap > 0 ? ` เว้นระยะระหว่างชิ้น ${Math.round(gap * 10)} มม.` : "";
                            return n >= 1 ? (
                              <p className="mt-1 text-[11px] font-bold text-teal-700">
                                📐 ขนาดนี้ได้ประมาณ {n} ชิ้น ต่อ 1 {sheet}
                                {/*
                                  * คูณจำนวนที่สั่งให้เลย · เรทที่ขายเป็นหน่วยใหญ่กว่าแผ่น (ตร.ม.)
                                  * กางตัวคูณให้เห็นด้วย ไม่งั้นลูกค้าคิดตามไม่ได้ว่าเลขมาจากไหน
                                  */}
                                {yieldTotal != null && (
                                  <>
                                    {unitYield?.via
                                      ? ` = ${unitYield.per.toLocaleString("th-TH")} ชิ้น ต่อ 1 ${
                                          matrix?.unit ?? sheet
                                        } (${unitYield.via.sheets} ${sheet} ต่อ 1 ${matrix?.unit ?? sheet})`
                                      : ""}{" "}
                                    · สั่ง {qty.toLocaleString("th-TH")} {matrix?.unit ?? sheet} ={" "}
                                    <span className="font-extrabold text-teal-900">
                                      ได้ประมาณ {yieldTotal.toLocaleString("th-TH")} ชิ้น
                                    </span>
                                  </>
                                )}{" "}
                                (จัดวางบนพื้นที่พิมพ์จริง{gapNote} — ตัวเลขคร่าว ๆ จำนวนจริงขึ้นกับรูปทรงลาย)
                              </p>
                            ) : (
                              <p className="mt-1 text-[11px] font-bold text-rose-600">
                                ⚠ ขนาดนี้ใหญ่เกิน 1 {sheet} — รบกวนทักแชทเช็คกับแอดมินก่อนนะครับ
                              </p>
                            );
                          })()}
                          {/*
                            * ✂️ ช่อง "จำนวนชิ้นที่ต้องการ" — ค่าตัด/เย็บขอบคิดตามจำนวนนี้ ไม่ใช่เต็มหน่วยขาย
                            * (ผ้าแขวนผนัง: 1 หลาตัดได้ 6 ชิ้น แต่สั่งตัดแค่ 2 = จ่ายค่าตัด/เย็บ 2 ชิ้น)
                            * ดู SizeFee.piecesLabel · ไม่กรอก = คิดเต็มตามที่ตัดได้เหมือนเดิม
                            */}
                          {(() => {
                            const cfg = product.options
                              .flatMap((o) => o.choices)
                              .find((c) => c.sizeFee?.piecesLabel === opt.label && c.sizeFee?.perPiece)?.sizeFee;
                            if (!cfg) return null;
                            const sheet =
                              product.options.find((o) => o.sheetYield)?.sheetYield?.sheetName ??
                              matrix?.unit ??
                              "หน่วย";
                            const max = sizeFeeMaxPieces(cfg, effective);
                            if (max == null)
                              return (
                                <p className="mt-1 text-[11px] text-stone-400">
                                  กรอกขนาดชิ้นงานด้านบนก่อน แล้วระบบจะบอกว่า 1 {sheet} ตัดได้กี่ชิ้น
                                </p>
                              );
                            const typed = Number(parseInputValue(opt, effective[opt.label]));
                            const filled = Number.isFinite(typed) && typed > 0;
                            const used = filled ? Math.min(Math.max(1, Math.floor(typed)), max) : max;
                            const total = used * Math.max(1, qty);
                            return (
                              <p
                                className={`mt-1 text-[11px] font-bold ${
                                  filled && typed > max ? "text-rose-600" : "text-teal-700"
                                }`}
                              >
                                {filled && typed > max
                                  ? `⚠ 1 ${sheet} ตัดได้สูงสุด ${max} ชิ้น — คิดค่าตัด/เย็บขอบที่ ${max} ชิ้น`
                                  : `✂️ คิดค่าตัด/เย็บขอบ ${used} ชิ้น ต่อ 1 ${sheet}${
                                      filled ? "" : ` (ไม่กรอก = ตัดเต็ม ${max} ชิ้น)`
                                    }`}
                                {qty > 1 && (
                                  <span className="font-normal text-stone-500">
                                    {" "}
                                    · สั่ง {qty.toLocaleString("th-TH")} {matrix?.unit ?? sheet} ={" "}
                                    {total.toLocaleString("th-TH")} ชิ้น
                                  </span>
                                )}
                              </p>
                            );
                          })()}
                          {/* 📐 กำหนดขนาดเองในกลุ่มแกนราคา — บอกว่าราคาไปเกาะแถวไหน / ต้องรอแอดมินตีราคา */}
                          {(() => {
                            const owner = product.options.find((o) => o.sizeInput?.heightLabel === opt.label);
                            if (!owner) return null;
                            const plan = sizeInputPlan(product, effective);
                            if (!plan || plan.label !== owner.label || !plan.filled) return null;
                            const u = plan.unit ? ` ${plan.unit}` : "";
                            return plan.quote ? (
                              <p className="mt-1 text-[11px] font-bold text-sky-700">
                                💬 {plan.width}×{plan.height}
                                {u} ใหญ่กว่าตารางราคา — กดสั่งไว้ได้เลย แล้วแอดมินตีราคาให้ทีหลัง
                              </p>
                            ) : (
                              <p className="mt-1 text-[11px] font-bold text-teal-700">
                                📐 {plan.width}×{plan.height}
                                {u} → คิดราคาตามด้านที่ยาวที่สุด เกาะแถว{" "}
                                <span className="font-extrabold text-teal-900">{plan.choice}</span>
                                {/* 📈 ใหญ่กว่าแถวสุดท้าย = ฐานแถวใหญ่สุด + ส่วนเกินต่อหน่วย (กางที่มาให้เห็น) */}
                                {plan.overCm > 0 && (
                                  <>
                                    {" "}
                                    + เกินอีก {plan.overCm}
                                    {u} ={" "}
                                    <span className="font-extrabold text-teal-900">
                                      +฿{plan.overFee.toLocaleString("th-TH")}/ชิ้น
                                    </span>
                                  </>
                                )}
                              </p>
                            );
                          })()}
                          {/* 💰 ค่าบริการที่คิดจากค่าที่กรอก (เช่น เพิ่มขนาดนิ้วละ 15) — กางที่มาให้เห็น ไม่งั้นราคาขยับเงียบ ๆ */}
                          {(() => {
                            if (!opt.inputFee) return null;
                            const n = Number(parseInputValue(opt, effective[opt.label]));
                            // ⚠️ ต้องใช้ effectiveWithDesigns + feeQty ชุดเดียวกับที่คิดราคาจริง (unitPriceFor)
                            // ไม่งั้นบรรทัดนี้จะบอกว่าคิดเงิน ทั้งที่ราคาจริงยกเว้นให้แล้ว (หรือกลับกัน)
                            const fee = inputFeeOf(opt, effectiveWithDesigns, feeQty);
                            const rate = inputFeeRateOf(opt.inputFee, effective);
                            const quota = inputFeeQuotaOf(opt.inputFee, effective);
                            const waived = inputFeeWaived(opt.inputFee, effectiveWithDesigns, feeQty);
                            const freeFrom = opt.inputFee.freeFromQtyPerDesign;
                            const freeFromUnit = opt.inputFee.freeFromQtyUnit ?? matrix?.unit ?? "ชิ้น";
                            // 🎁 ยังไม่ได้กรอก — บอกโควตาของขนาดที่เลือกอยู่ล่วงหน้าเลย (เช่น A7 ฟรี 12 จุด)
                            // ลูกค้าจะได้รู้เพดานก่อนพิมพ์ ไม่ใช่พิมพ์แล้วเพิ่งเห็นว่าโดนคิดเพิ่ม
                            if (!Number.isFinite(n) || n <= 0) {
                              if (!(rate > 0 && quota > 0)) return null;
                              if (waived)
                                return (
                                  <p className="mt-1 text-[11px] font-bold text-emerald-600">
                                    🎁 จำนวนที่สั่งถึงเกณฑ์ {freeFrom?.toLocaleString("th-TH")} {freeFromUnit} ต่อลายแล้ว —{" "}
                                    {cfg?.unit ?? "หน่วย"}ที่เกินโควตาไม่คิดเงิน
                                    {(() => {
                                      const hardMax = inputMaxOf(opt, effective);
                                      return hardMax != null ? (
                                        <span className="font-bold text-rose-600">
                                          {" "}
                                          · รับไม่เกิน {hardMax.toLocaleString("th-TH")} {cfg?.unit ?? ""}
                                        </span>
                                      ) : null;
                                    })()}
                                  </p>
                                );
                              // ชื่อขนาดที่ทำให้ได้โควตานี้ (เช่น "A7") — หาไม่เจอ (ขนาดกำหนดเอง) ก็ไม่ใส่ชื่อ
                              const src = (opt.inputFee.rates ?? []).find(
                                (r) => r.free != null && r.when.choices.includes(effective[r.when.label])
                              );
                              return (
                                <p className="mt-1 text-[11px] font-bold text-emerald-600">
                                  {/* "(รวมในราคา)" ซ้ำกับคำว่า "ฟรี/ได้สูงสุด" · เพดานรับงานมีบรรทัด "รับ 1–N" ใต้ช่องกรอกอยู่แล้ว */}
                                  🎁 {src ? `ขนาด ${effective[src.when.label]} ` : "ขนาดที่เลือก"}ฟรี{" "}
                                  {quota.toLocaleString("th-TH")} {cfg?.unit ?? ""} — เกินจากนั้น
                                  {cfg?.unit ?? "หน่วย"}ละ {formatPrice(rate)} / {matrix?.unit ?? "ชิ้น"}
                                </p>
                              );
                            }
                            // 🎁 มีโควตาฟรีและยังไม่เกิน — บอกให้ชัดว่าไม่คิดเพิ่ม (เงียบไปลูกค้าจะไม่แน่ใจ)
                            if (!fee) {
                              // ฟรีเพราะสั่งถึงเกณฑ์ (ทั้งที่เกินโควตา) — ต้องบอกเหตุผลจริง
                              // ไม่งั้นขึ้นว่า "อยู่ในโควตา" ทั้งที่กรอกเกินโควตาไปแล้ว ลูกค้าจะงง
                              if (waived && n > quota)
                                return (
                                  <p className="mt-1 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold leading-snug text-emerald-700 ring-1 ring-emerald-200">
                                    🎁 เกินโควตา {quota.toLocaleString("th-TH")} {cfg?.unit ?? ""} อยู่{" "}
                                    {(n - quota).toLocaleString("th-TH")} {cfg?.unit ?? ""} — แต่สั่งถึง{" "}
                                    {freeFrom?.toLocaleString("th-TH")} {freeFromUnit} ต่อลายแล้ว{" "}
                                    <span className="font-extrabold text-emerald-800">ฟรีค่า{cfg?.unit ?? "ส่วนเกิน"}</span>
                                  </p>
                                );
                              return quota > 0 ? (
                                <p className="mt-1 text-[11px] font-bold text-emerald-600">
                                  ✓ อยู่ในโควตา {quota.toLocaleString("th-TH")} {cfg?.unit ?? ""}ที่รวมในราคา — ไม่คิดเพิ่ม
                                </p>
                              ) : null;
                            }
                            // ⚠ เกินโควตา = เตือนแดง (คิดเงินเพิ่มจากที่เห็นในตาราง ต้องสะดุดตา ไม่ใช่บรรทัดข้อมูลเฉย ๆ)
                            // กรอกเกินไม่ได้ผิด แค่ต้องรู้ตัวว่ากำลังจ่ายเพิ่ม — ลดจำนวนลงให้อยู่ในโควตาก็หายไปเอง
                            return quota > 0 ? (
                              <p className="mt-1 rounded-xl bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold leading-snug text-rose-700 ring-1 ring-rose-200">
                                ⚠ เกินโควตา {quota.toLocaleString("th-TH")} {cfg?.unit ?? ""}ของขนาดที่เลือก อยู่{" "}
                                {(n - quota).toLocaleString("th-TH")} {cfg?.unit ?? ""} × {formatPrice(rate)} ={" "}
                                <span className="font-extrabold text-rose-800">+{formatPrice(fee)}</span> ต่อ
                                {matrix?.unit ?? "ชิ้น"}
                              </p>
                            ) : (
                              <p className="mt-1 text-[11px] font-bold text-teal-700">
                                💰 {n.toLocaleString("th-TH")} {cfg?.unit ?? ""} × {formatPrice(rate)} ={" "}
                                <span className="font-extrabold text-teal-900">+{formatPrice(fee)}</span> ต่อ
                                {matrix?.unit ?? "ชิ้น"}
                              </p>
                            );
                          })()}
                          {/* เกณฑ์ที่รับได้ — บอกไว้ก่อนพิมพ์ ดีกว่าให้พิมพ์เสร็จแล้วค่อยขึ้นแดง */}
                          {(() => {
                            // เพดานของช่องนี้อาจขึ้นกับตัวเลือกอื่น (จุดไดคัท: A7 รับ 20 จุด · A4 รับ 180)
                            const hardMax = inputMaxOf(opt, effective);
                            return cfg?.kind === "number" && (cfg.min != null || hardMax != null) ? (
                              <p className="mt-0.5 text-[11px] text-stone-400">
                                รับ {cfg.min != null ? cfg.min : "0"}
                                {hardMax != null ? `–${hardMax}` : " ขึ้นไป"} {cfg.unit ?? ""}
                              </p>
                            ) : null;
                          })()}
                          {/*
                           * 📏 ค่าบริการตามขนาดที่กรอก (sizeFee) — กางตรงช่องกรอกเลย
                           * ค่าบริการนี้อ่านจาก "คู่ช่อง กว้าง×ยาว" จึงไม่ใช่ของช่องใดช่องหนึ่ง — โชว์ใต้ช่องท้าย
                           * ของคู่ (heightLabel) ตอนกรอกครบแล้ว · ป้าย +฿ บนการ์ดตัวเลือกอยู่คนละที่กับ
                           * ช่องกรอก ลูกค้าพิมพ์เลขแล้วต้องเลื่อนขึ้นไปดู ไม่งั้นไม่รู้ว่าจ่ายเพิ่มเท่าไหร่
                           */}
                          {(() => {
                            /*
                             * ⚠️ ช่องขนาดช่องเดียวมี sizeFee เกาะได้ "หลายตัว" พร้อมกัน — สแตนดี้หลายชิ้น
                             * (new-mt1dwpc1-6773) ผูกทั้งงานสกรีนและสีอะคริลิคไว้กับ "ขนาดชิ้นที่ 2" ตัวเดียว
                             * ต้องรวมทุกตัวที่เลือกอยู่ ไม่ใช่หยิบตัวแรก ไม่งั้นยอดที่โชว์ต่ำกว่าที่จ่ายจริง
                             */
                            const owners = (product.options ?? [])
                              .flatMap((o) => (o.choices ?? []).map((c) => ({ o, c })))
                              .filter(
                                ({ o, c }) => c.sizeFee?.heightLabel === opt.label && effective[o.label] === c.name
                              );
                            if (!owners.length) return null;
                            const cf = owners[0].c.sizeFee!;
                            const num = (v: string | undefined) => {
                              const n = parseFloat(String(v ?? "").replace(/[^\d.]/g, ""));
                              return Number.isFinite(n) && n > 0 ? n : null;
                            };
                            const w = num(effective[cf.widthLabel]);
                            const h = num(effective[cf.heightLabel]);
                            // ยังกรอกไม่ครบ = บอกเพดานที่รวมในราคาไว้ก่อน (ขั้นสุดท้ายที่ยังฟรี)
                            // ตัวที่เกาะอยู่หลายตัวอาจให้โควตาไม่เท่ากัน — ตรงกันหมดถึงจะกล้าบอกตัวเลข
                            if (w == null || h == null) {
                              const frees = owners.map(({ c }) => [...c.sizeFee!.tiers].filter((t) => !t.fee).pop()?.upTo);
                              const freeUpTo = frees.every((f) => f != null && f === frees[0]) ? frees[0] : null;
                              return freeUpTo != null ? (
                                <p className="mt-1 text-[11px] font-bold text-emerald-600">
                                  🎁 ถึง {freeUpTo} {cfg?.unit ?? ""} รวมในราคาแล้ว — กรอกครบทั้งสองช่องแล้วจะคิดส่วนเกินให้
                                </p>
                              ) : null;
                            }
                            const longest = Math.max(w, h);
                            const parts = owners
                              .map(({ c }) => ({ name: c.name, bd: sizeFeeBreakdownOf(c.sizeFee!, effective) }))
                              .filter((p): p is { name: string; bd: NonNullable<typeof p.bd> } => p.bd != null);
                            const total = parts.reduce((s, p) => s + p.bd.fee, 0);
                            if (!total)
                              return (
                                <p className="mt-1 text-[11px] font-bold text-emerald-600">
                                  ✓ ด้านยาวสุด {longest} {cfg?.unit ?? ""} — รวมในราคาแล้ว ไม่คิดเพิ่ม
                                </p>
                              );
                            const solo = parts.length === 1 ? parts[0].bd : null;
                            return (
                              <p className="mt-1 rounded-xl bg-teal-50 px-2.5 py-1.5 text-[11px] font-bold leading-snug text-teal-700 ring-1 ring-teal-200">
                                💰 ด้านยาวสุด {longest} {cfg?.unit ?? ""} ={" "}
                                <span className="font-extrabold text-teal-900">+{formatPrice(total)}</span> ต่อ
                                {matrix?.unit ?? "ชิ้น"}
                                {solo && solo.pieces > 1 && (
                                  // ที่มาของยอด: ชิ้นละ × จำนวนชิ้นต่อหน่วยขาย (เช่น โพ้งขอบ ฿10 × 8 ชิ้น)
                                  <span className="font-normal text-stone-500">
                                    {" "}
                                    ({formatPrice(solo.perPiece)} × {solo.pieces} ชิ้น)
                                  </span>
                                )}
                                {parts.length > 1 && (
                                  // เกาะหลายตัว = กางว่ามาจากตัวเลือกไหนบ้าง ไม่งั้นลูกค้าไล่ที่มาไม่ถูก
                                  <span className="font-normal text-stone-500">
                                    {" "}
                                    ({parts.map((p) => `${p.name} ${formatPrice(p.bd.fee)}`).join(" · ")})
                                  </span>
                                )}
                              </p>
                            );
                          })()}
                          {/* เตือนเฉพาะตอนพิมพ์ผิด — ยังไม่ได้กรอกไม่ต้องขึ้นแดงใส่หน้าลูกค้าตั้งแต่เปิดหน้า */}
                          {err && (
                            <p
                              className={`mt-1 text-[11px] font-bold ${
                                raw === "" ? "text-amber-600" : "text-rose-600"
                              }`}
                            >
                              {raw === "" ? "✍️" : "⚠"} {err}
                            </p>
                          )}
                        </div>
                      );
                    })()
                  ) : multi && opt.swatchGrid ? (
                    /*
                     * 🎨 ตารางสวอตช์สี — ตัวเลือกเยอะ (เช่น สีไหม 80 เบอร์) ปุ่ม pill ปกติจะยาวทั้งหน้า
                     * วงกลมสี + เลขใต้ เรียง 8 ต่อแถวในกล่องสูงคงที่เลื่อนได้ · กดสลับติ๊กเหมือน multi ปกติ
                     * ไม่เรียก jumpToImage — ชิปไม่อยู่ในแกลเลอรี (ดู galleryImages)
                     * ใต้ตารางมีแถบพรีวิวใหญ่ของสีที่แตะล่าสุด + ปุ่มเปิดตารางสีเต็ม (chartSrc)
                     */
                    <>
                    <div className="grid max-h-72 grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-1 overflow-y-auto rounded-2xl bg-white/70 p-2 ring-1 ring-amber-100">
                      {opt.choices
                        .filter((c) => allowed.includes(c.name))
                        .map((c) => {
                          const on = picked.includes(c.name);
                          const short = c.name.split(" ")[0];
                          return (
                            <button
                              key={c.name}
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              title={c.name}
                              onClick={() => {
                                togglePick(c.name, on);
                                setSwatchTap((m) => ({ ...m, [opt.label]: c.name }));
                              }}
                              className={`flex flex-col items-center gap-0.5 rounded-xl p-1 transition ${
                                on ? "bg-amber-400/90 shadow" : "hover:bg-amber-50"
                              }`}
                            >
                              <span className="relative">
                                {c.imageSrc ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={c.imageSrc}
                                    alt={c.name}
                                    className={`h-9 w-9 rounded-full object-cover ${
                                      on ? "ring-2 ring-white" : "ring-1 ring-black/10"
                                    }`}
                                    loading="lazy"
                                  />
                                ) : (
                                  <span className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-[10px] text-stone-400 ring-1 ring-black/10">
                                    ?
                                  </span>
                                )}
                                {on && (
                                  <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-teal-600 text-[9px] font-black text-white ring-2 ring-white">
                                    ✓
                                  </span>
                                )}
                              </span>
                              <span
                                className={`text-[10px] font-bold leading-none ${on ? "text-white" : "text-stone-500"}`}
                              >
                                {short}
                              </span>
                            </button>
                          );
                        })}
    </div>
                      {/* 🔍 ดูรูปใหญ่: แถบพรีวิวสีที่แตะล่าสุด + ปุ่มเปิดตารางสีเต็มใน lightbox */}
                      {(() => {
                        const tapName = swatchTap[opt.label] ?? picked[picked.length - 1];
                        const tap = opt.choices.find((c) => c.name === tapName);
                        return (
                          <div className="mt-1.5 flex items-center gap-2">
                            {tap?.imageSrc && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={tap.imageSrc}
                                alt={tap.name}
                                className="h-12 min-w-0 flex-1 rounded-xl object-cover ring-1 ring-black/10"
                              />
                            )}
                            {tap && (
                              <span className="shrink-0 text-[12px] font-bold text-stone-600">{tap.name}</span>
                            )}
                            {opt.chartSrc && (
                              <button
                                type="button"
                                onClick={() => setZoomSrc(opt.chartSrc!)}
                                className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200 transition hover:bg-sky-50"
                              >
                                🔍 ดูตารางสีเต็ม
                              </button>
                            )}
                          </div>
                        );
                      })()}
                      {/* 💡 กติกาคิดต่อลาย + แนะนำแยกรายการต่อลาย (โชว์เฉพาะกลุ่มที่ตั้ง extraPerDesign) */}
                      {opt.extraPerDesign && (
                        <p className="mt-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 ring-1 ring-amber-100">
                          💡 สีที่เกินโควตาคิดเพิ่ม <span className="font-bold">ต่อลาย</span> (ไม่คูณจำนวนชิ้น) ·
                          แนะนำ <span className="font-bold">1 ลาย ต่อ 1 รายการสั่งซื้อ</span> — มีหลายลาย
                          กดเพิ่มลงตะกร้าแยกทีละลาย เพื่อเลือกสีไหมของแต่ละลายได้ถูกต้อง
                        </p>
                      )}
                    </>
                  ) : multi ? (
                    <div className="flex flex-wrap gap-1.5">
                      {opt.choices
                        .filter((c) => allowed.includes(c.name))
                        .map((c) => {
                          const on = picked.includes(c.name);
                          const cQty = picks.find((p) => p.name === c.name)?.qty ?? 1;
                          const unitAdd = choiceBadgeOf(opt, effective, c.name, feeQty, product);
                          // ตัวเลือกนี้ระบุจำนวนได้ไหม — ตั้งแยกทีละตัวในหลังบ้าน
                          const cWithQty = hasChoiceQty(opt, c.name);
                          const cQtyMax = choiceQtyMax(opt, c.name);
                          // หน่วยของจำนวน (เช่น "ซม.") — ตัวเลือกที่คิดตามขนาดจะได้ไม่ต้องเดาว่าเลขนี้คืออะไร
                          const cQtyUnit = choiceQtyUnit(opt, c.name);
                          return (
                            <span key={c.name} className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                onClick={() => {
                                  togglePick(c.name, on);
                                  if (!on) jumpToImage(c.imageSrc); // ติ๊กเปิด = โชว์ภาพแบบนั้น (ติ๊กออกไม่ต้อง)
                                }}
                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                                  on
                                    ? "bg-amber-400 text-white shadow"
                                    : "bg-white text-stone-600 ring-1 ring-amber-200 hover:bg-amber-50"
                                }`}
                              >
                                <span
                                  className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] leading-none ${
                                    on ? "border-white bg-white/25 text-white" : "border-stone-300 text-transparent"
                                  }`}
                                  aria-hidden
                                >
                                  ✓
                                </span>
                                {/* ภาพประจำตัวเลือก (ถ้ามี) */}
                                {c.imageSrc && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={c.imageSrc}
                                    alt={c.name}
                                    className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-black/10"
                                    loading="lazy"
                                  />
                                )}
                                {c.name}
                                {unitAdd > 0 ? ` +${formatPrice(unitAdd)}` : ""}
                              </button>
                              {/* ช่องจำนวนของตัวเลือกนี้ (เช่น เพิ่มสาย 2 เส้น) — โผล่เมื่อติ๊กแล้วเท่านั้น */}
                              {cWithQty && on && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-white px-1 py-0.5 ring-1 ring-amber-200">
                                  <button
                                    type="button"
                                    onClick={() => setChoiceQty(c.name, cQty - 1)}
                                    disabled={cQty <= 1}
                                    aria-label={`ลดจำนวน ${c.name}`}
                                    className="grid h-6 w-6 place-items-center rounded-full text-[13px] font-extrabold text-stone-500 hover:bg-amber-50 disabled:text-stone-300 disabled:hover:bg-transparent"
                                  >
                                    −
                                  </button>
                                  <input
                                    value={cQty}
                                    onChange={(e) => {
                                      const n = Number(e.target.value.replace(/\D/g, ""));
                                      if (n >= 1) setChoiceQty(c.name, n);
                                    }}
                                    inputMode="numeric"
                                    aria-label={`จำนวน ${c.name}${cQtyUnit ? ` (${cQtyUnit})` : ""}`}
                                    className="w-8 bg-transparent text-center text-[13px] font-extrabold text-amber-700 outline-none"
                                  />
                                  {cQtyUnit && (
                                    <span className="pr-0.5 text-[11px] font-bold text-amber-700">{cQtyUnit}</span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setChoiceQty(c.name, cQty + 1)}
                                    disabled={cQty >= cQtyMax}
                                    aria-label={`เพิ่มจำนวน ${c.name}`}
                                    className="grid h-6 w-6 place-items-center rounded-full text-[13px] font-extrabold text-stone-500 hover:bg-amber-50 disabled:text-stone-300 disabled:hover:bg-transparent"
                                  >
                                    ＋
                                  </button>
                                </span>
                              )}
                              {/* จำนวนมากกว่า 1 บอกยอดรวมของตัวนี้ไปเลย จะได้ไม่ต้องคูณเอง */}
                              {cWithQty && on && cQty > 1 && unitAdd > 0 && (
                                <span className="text-[11px] font-bold text-amber-700">
                                  {cQtyUnit ? `${cQty} ${cQtyUnit} ` : ""}= +{formatPrice(unitAdd * cQty)}
                                </span>
                              )}
                            </span>
                          );
                        })}
                    </div>
                  ) : locked ? (
                    <div>
                      <span className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1.5 text-[13px] font-semibold text-stone-500 ring-1 ring-stone-200">
                        🔒 {effective[opt.label]}
                      </span>
                      <p className="mt-1.5 text-[11px] text-stone-400">
                        ตัวเลือกนี้ถูกกำหนดอัตโนมัติตามตัวเลือกอื่นที่คุณเลือก เพื่อป้องกันการสั่งผิด
                      </p>
                    </div>
                  ) : opt.sampleGrid ? (
                    /*
                     * ✍️ ตารางแถบตัวอย่าง (เลือกได้อย่างเดียว) — กลุ่มที่ "หน้าตาของตัวอย่าง" คือสาระ
                     * เช่น ฟอนต์ปัก 26 แบบ: เมนูเลื่อนเห็นแค่รหัส E1/T1 ลูกค้าเดาลายมือไม่ออก
                     * รูปประจำตัวเลือก = ทั้งบรรทัดตัวอย่าง (แถบยาว) — ในตารางครอปโชว์ครึ่งซ้าย
                     * (object-left) ให้ตัวโตพอเห็นทรง แล้วโชว์เต็มบรรทัดของแบบที่เลือกใต้ตาราง
                     * ไม่เรียก jumpToImage — แถบตัวอย่างไม่อยู่ในแกลเลอรี (ดู galleryImages)
                     */
                    <>
                      <div className="grid max-h-72 grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-1.5 overflow-y-auto rounded-2xl bg-white/70 p-2 ring-1 ring-amber-100">
                        {opt.choices
                          .filter((c) => allowed.includes(c.name))
                          .map((c) => {
                            const on = effective[opt.label] === c.name;
                            const short = c.name.split(" ")[0];
                            return (
                              <button
                                key={c.name}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                title={c.name}
                                onClick={() => setSelections((s) => ({ ...s, [opt.label]: c.name }))}
                                className={`flex flex-col items-stretch gap-1 rounded-xl p-1 transition ${
                                  on ? "bg-amber-400/90 shadow" : "hover:bg-amber-50"
                                }`}
                              >
                                {c.imageSrc ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={c.imageSrc}
                                    alt={c.name}
                                    className={`h-9 w-full rounded-lg bg-white object-cover object-left ${
                                      on ? "ring-2 ring-white" : "ring-1 ring-black/10"
                                    }`}
                                    loading="lazy"
                                  />
                                ) : (
                                  <span className="grid h-9 w-full place-items-center rounded-lg bg-stone-100 text-[10px] text-stone-400 ring-1 ring-black/10">
                                    ?
                                  </span>
                                )}
                                <span
                                  className={`truncate text-[10px] font-bold leading-none ${on ? "text-white" : "text-stone-500"}`}
                                >
                                  {short}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                      {/* 🔍 แถบเต็มบรรทัดของแบบที่เลือกอยู่ (กดดูเต็มจอได้ — ในแผงแคบตัวเล็ก) + ชาร์ตเต็ม */}
                      {(() => {
                        const sel = opt.choices.find((c) => c.name === effective[opt.label]);
                        return (
                          <div className="mt-1.5 flex items-center gap-2">
                            {sel?.imageSrc && (
                              <button
                                type="button"
                                onClick={() => setZoomSrc(sel.imageSrc!)}
                                title={`ดูตัวอย่าง ${sel.name} เต็มจอ`}
                                className="min-w-0 flex-1"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={sel.imageSrc}
                                  alt={sel.name}
                                  className="h-11 w-full rounded-xl bg-white object-contain p-1 ring-1 ring-black/10"
                                />
                              </button>
                            )}
                            {sel && <span className="shrink-0 text-[12px] font-bold text-stone-600">{sel.name}</span>}
                            {opt.chartSrc && (
                              <button
                                type="button"
                                onClick={() => setZoomSrc(opt.chartSrc!)}
                                className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200 transition hover:bg-sky-50"
                              >
                                🔍 ดูชาร์ตเต็ม
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  ) : opt.display === "dropdown" ? (
                    <div className="flex items-center gap-2">
                      {/* ภาพประจำตัวเลือกที่เลือกอยู่ — เมนูเลื่อนใส่รูปในตัวเลือกไม่ได้ จึงโชว์ไว้ข้าง ๆ
                          (สินค้าอย่างเคสมือถือ 20+ รุ่น ใช้เมนูเลื่อนดีกว่าปุ่ม แต่ยังต้องเห็นหน้าตาแบบที่เลือก) */}
                      {(() => {
                        const selC = opt.choices.find((c) => c.name === effective[opt.label]);
                        return selC ? choiceImage(selC, effective) : undefined;
                      })() && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={choiceImage(opt.choices.find((c) => c.name === effective[opt.label])!, effective)}
                          alt={effective[opt.label]}
                          className="h-11 w-11 shrink-0 rounded-xl bg-white object-cover ring-1 ring-amber-200"
                        />
                      )}
                    <select
                      value={effective[opt.label]}
                      onChange={(e) => {
                        setSelections((s) => ({ ...s, [opt.label]: e.target.value }));
                        {
                          const picked = opt.choices.find((c) => c.name === e.target.value);
                          jumpToImage(picked ? choiceImage(picked, effective) : undefined);
                        }
                      }}
                      className="w-full rounded-xl bg-white px-3 py-2 text-[13px] font-semibold text-stone-700 ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                      aria-label={opt.label}
                    >
                      {opt.choices
                        .filter((c) => allowed.includes(c.name))
                        .map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                            {c.popular ? " (นิยม)" : ""}
                            {c.badge ? ` (${c.badge})` : ""}
                            {choiceBadgeOf(opt, effective, c.name, feeQty, product) > 0
                              ? ` +${formatPrice(choiceBadgeOf(opt, effective, c.name, feeQty, product))}`
                              : ""}
                          </option>
                        ))}
                    </select>
                    </div>
                  ) : opt.display === "cards" ? (
                    /* การ์ดแนวตั้งหน้าตาเดียวกับแผงเลือกเรทราคา — รูปใหญ่ + วิทยุ + ชื่อ + คำอธิบาย
                       รูป 80px (เดิม 48px — ผู้ใช้ทัก 4 ก.ย. 69 ว่าเล็กจนดูไม่ออกว่าเป็นรูปอะไร)
                       ภาพตัวเลือกเป็นจัตุรัส 900×900 ลงกล่องจัตุรัส object-cover จึงเห็นเต็มใบ ไม่ถูกครอป —
                       กล่องใหญ่ขึ้นเท่าไหร่ = เห็นชัดขึ้นเท่านั้น (แผงเรทราคาด้านล่างขยายคู่กันให้หน้าตาเหมือนเดิม)
                       (กลุ่ม "แบบ/ชนิด/เนื้อ" ที่หน้าตาต่างกันชัด ๆ ผู้ใช้สั่งใช้ทรงนี้ 25 ส.ค. 69)
                       กลุ่มที่ตัวเลือกเยอะ (ลายฟิล์ม 10 ลาย) เรียง 2 คอลัมน์แบบกระชับ ไม่งั้นหน้ายาวจนต้องเลื่อนหา */
                    (() => {
                      const cardList = opt.choices.filter((c) => allowed.includes(c.name));
                      const dense = cardList.length >= CARDS_DENSE_FROM;
                      return (
                    <div className={dense ? "grid grid-cols-2 gap-1.5" : "grid gap-1.5"}>
                      {cardList
                        .map((c) => {
                          const on = effective[opt.label] === c.name;
                          const cImg = choiceImage(c, effective);
                          const add = choiceBadgeOf(opt, effective, c.name, feeQty, product);
                          // 📏 กางที่มาของค่าบริการตามขนาด (เช่น โพ้งขอบ ฿10 × 8 ชิ้น = ฿80)
                          // ใช้ view เดียวกับ choiceBadgeOf (สมมติว่าเลือกตัวนี้) ตัวเลขจะได้ตรงกับป้าย +฿ เสมอ
                          const feeBd = c.sizeFee
                            ? sizeFeeBreakdownOf(c.sizeFee, { ...effective, [opt.label]: c.name })
                            : null;
                          return (
                            <button
                              key={c.name}
                              type="button"
                              onClick={() => {
                                setSelections((s) => ({ ...s, [opt.label]: c.name }));
                                jumpToImage(c.videoSrc ?? cImg);
                              }}
                              className={`rounded-xl px-3 py-2 text-left text-[13px] transition ${
                                on
                                  ? "bg-amber-50 font-bold text-amber-900 ring-2 ring-amber-400"
                                  : "bg-white text-stone-600 ring-1 ring-stone-200 hover:ring-amber-300"
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                {c.videoSrc ? (
                                  // 🎬 ตัวเลือกที่มีคลิป — การ์ดเล่นคลิปวนเงียบ ๆ แทนภาพนิ่ง (imageSrc เป็นโปสเตอร์ระหว่างโหลด)
                                  // ref เขี่ยให้เล่นเอง: การ์ดถูก SSR มาตั้งแต่แรก จังหวะ autoplay ของเบราว์เซอร์
                                  // ผ่านไปก่อน hydration เสร็จ (คลิปในแกลเลอรีไม่เจอเพราะ mount ทีหลังตอนกดสลับ)
                                  <video
                                    data-card-clip
                                    src={c.videoSrc}
                                    poster={cImg}
                                    autoPlay
                                    muted
                                    loop
                                    playsInline
                                    ref={(el) => {
                                      if (el && el.paused) {
                                        el.muted = true;
                                        el.play().catch(() => {});
                                      }
                                    }}
                                    className={`${dense ? "h-12 w-12" : "h-20 w-20"} shrink-0 rounded-lg object-cover ring-1 ring-stone-200`}
                                  />
                                ) : cImg ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={cImg}
                                    alt={c.name}
                                    className={`${dense ? "h-12 w-12" : "h-20 w-20"} shrink-0 rounded-lg object-cover ring-1 ring-stone-200`}
                                    loading="lazy"
                                  />
                                ) : null}
                                <span className="min-w-0 flex-1">
                                  <span className={`flex flex-wrap items-center ${dense ? "gap-1" : "gap-2"}`}>
                                    {/* ทรงกระชับ: ตัวที่เลือกอยู่มีวงแหวนเหลืองรอบการ์ดบอกอยู่แล้ว วิทยุจึงตัดทิ้งได้ */}
                                    {!dense && (
                                      <span
                                        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${on ? "border-amber-500" : "border-stone-300"}`}
                                      >
                                        {on && <span className="h-2 w-2 rounded-full bg-amber-500" />}
                                      </span>
                                    )}
                                    {c.name}
                                    {c.popular && (
                                      <span className="rounded-full bg-ducky px-1.5 py-0.5 text-[10px] font-bold text-amber-900 ring-1 ring-ducky-dark">
                                        นิยม
                                      </span>
                                    )}
                                    {c.badge && (
                                      <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white ring-1 ring-emerald-600">
                                        {c.badge}
                                      </span>
                                    )}
                                    {add > 0 && (
                                      <span className="text-[12px] font-bold text-amber-700">
                                        +{formatPrice(add)}
                                        {feeBd && feeBd.pieces > 1 && add === feeBd.fee && (
                                          // ที่มาของยอด: ชิ้นละ × จำนวนชิ้นต่อหลา (โชว์เฉพาะตอนคูณจริง)
                                          <span className="font-normal text-stone-500">
                                            {" "}
                                            (฿{feeBd.perPiece} × {feeBd.pieces} ชิ้น)
                                          </span>
                                        )}
                                      </span>
                                    )}
                                  </span>
                                  {/* pre-line: desc ที่เขียนแยกบรรทัด (เช่น จำนวน A3 ของแต่ละจำนวนแผ่น) จะได้ขึ้นบรรทัดจริง */}
                                  {c.desc && !dense && (
                                    <span className="mt-0.5 block whitespace-pre-line pl-6 text-[11px] font-normal leading-snug text-stone-500">
                                      {c.desc}
                                    </span>
                                  )}
                                  {/* 💬 ข้อความกำกับเฉพาะตอนถูกเลือก — เตือนเงื่อนไขของตัวที่เลือกอยู่ (เช่น ฝุ่นหมึกของไดคัทเข้าเนื้อ) */}
                                  {on && c.selectedNote && (
                                    <span className="mt-1 block rounded-lg bg-amber-100/70 px-2 py-1 text-[11px] font-normal leading-snug text-amber-900 ring-1 ring-amber-200">
                                      {noteEmphasis(c.selectedNote)}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                    </div>
                      );
                    })()
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {opt.choices
                        .filter((c) => allowed.includes(c.name))
                        .map((c) => (
                          <button
                            key={c.name}
                            type="button"
                            onClick={() => {
                              setSelections((s) => ({ ...s, [opt.label]: c.name }));
                              jumpToImage(choiceImage(c, effective));
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-full py-1.5 text-[13px] font-semibold transition ${
                              choiceImage(c, effective) ? "pl-1.5 pr-3" : "px-3"
                            } ${
                              effective[opt.label] === c.name
                                ? "bg-amber-400 text-white shadow"
                                : "bg-white text-stone-600 ring-1 ring-amber-200 hover:bg-amber-50"
                            }`}
                          >
                            {/* ภาพประจำตัวเลือก (ถ้ามี) — เห็นหน้าตาแบบนั้น ๆ ก่อนเลือก */}
                            {choiceImage(c, effective) && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={choiceImage(c, effective)}
                                alt={c.name}
                                className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-black/10"
                                loading="lazy"
                              />
                            )}
                            {c.name}
                            {/* ป้าย "นิยม" — เหลืองเป็ดคู่กับฟ้าแบรนด์ อ่านออกทั้งบนปุ่มที่เลือกอยู่และปุ่มเปล่า */}
                            {c.popular && (
                              <span className="rounded-full bg-ducky px-1.5 py-0.5 text-[10px] font-bold text-amber-900 ring-1 ring-ducky-dark">
                                นิยม
                              </span>
                            )}
                            {/* ป้ายอิสระที่แอดมินพิมพ์เอง เช่น "ฟรี!" — เขียวเพื่อไม่ให้ชนกับป้าย "นิยม" */}
                            {c.badge && (
                              <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white ring-1 ring-emerald-600">
                                {c.badge}
                              </span>
                            )}
                            {choiceBadgeOf(opt, effective, c.name, feeQty, product) > 0
                              ? ` +${formatPrice(choiceBadgeOf(opt, effective, c.name, feeQty, product))}`
                              : ""}
                          </button>
                        ))}
                    </div>
                  )}
                  {/*
                    * 💬 ข้อความกำกับของตัวที่เลือกอยู่ (choice.selectedNote) สำหรับกลุ่มที่ไม่ใช่การ์ด
                    * — การ์ดโชว์ในตัวการ์ดเองแล้ว · pills/dropdown ไม่มีพื้นที่ในปุ่ม/เมนู จึงขึ้นเป็นกล่องใต้กลุ่มแทน
                    */}
                  {!multi &&
                    !isInput &&
                    opt.display !== "cards" &&
                    (() => {
                      const sel = opt.choices.find((c) => c.name === effective[opt.label]);
                      return sel?.selectedNote ? (
                        <p className="mt-1.5 rounded-xl bg-amber-100/70 px-3 py-2 text-[11px] leading-snug text-amber-900 ring-1 ring-amber-200">
                          {noteEmphasis(sel.selectedNote)}
                        </p>
                      ) : null;
                    })()}
                  {/* บอกให้ชัดว่าป้ายนี้แปลว่าอะไร — ขึ้นครั้งเดียวทั้งหน้า ที่กลุ่มแรกที่มีป้าย "นิยม" */}
                  {(() => {
                    if (popularLegendShown) return false;
                    popularLegendShown = opt.choices.some((c) => c.popular && allowed.includes(c.name));
                    return popularLegendShown;
                  })() && (
                    <p className="mt-1 text-[11px] font-semibold text-stone-500">
                      <span className="rounded-full bg-ducky px-1.5 py-0.5 text-[10px] font-bold text-amber-900 ring-1 ring-ducky-dark">
                        นิยม
                      </span>{" "}
                      = แบบที่ลูกค้าสั่งบ่อยที่สุด (ทางร้านแนะนำ)
                    </p>
                  )}
                  {/*
                    * 📐 งานแบ่งแผ่น — เลือกขนาดตัดแล้วสรุปว่าจำนวนที่สั่งอยู่ตอนนี้ได้งานกี่ชิ้น
                    * (ป้ายบนปุ่มบอกแค่ "ต่อ 1 หน่วย" ลูกค้าต้องคูณเอง — คูณให้เลยตรงนี้)
                    */}
                  {unitYield && !unitYield.approx && unitYield.optLabel === opt.label && yieldTotal != null && (
                    <p className="mt-1.5 rounded-xl bg-teal-50 px-3 py-2 text-[11px] leading-relaxed text-teal-800 ring-1 ring-teal-100">
                      {/* สั่ง 1 หน่วย: "ได้ 2 ชิ้น ต่อ 1 แผ่น A3 · สั่ง 1 แผ่น A3 = ได้ 2 ชิ้น" คือประโยคเดียวกันสองรอบ
                          เหลือท่อนเดียวพอ · สั่งหลายหน่วยค่อยกางให้เห็นที่มาของยอดรวม */}
                      📐 {unitYield.label} <span className="font-bold">{unitYield.size}</span>
                      {qty > 1 ? (
                        <>
                          {" "}
                          ได้ <span className="font-bold">{unitYield.per.toLocaleString("th-TH")} ชิ้น</span> ต่อ 1{" "}
                          {matrix?.unit ?? "ชิ้น"} · สั่ง {qty.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"} ={" "}
                        </>
                      ) : (
                        " = "
                      )}
                      <span className="font-extrabold text-teal-900">
                        ได้ {yieldTotal.toLocaleString("th-TH")} ชิ้น
                      </span>
                    </p>
                  )}
                  {/* 📄 ค่าธรรมเนียมที่คิดต่อแผ่นวัสดุ — กางเลขให้เห็นว่าทำไมสั่งเกินโควตาแผ่นแล้วราคาขยับ
                    * โชว์เฉพาะตอนเลือกแบบที่คิดเงินจริง (เคลือบ/ฟอยล์แบบมีค่าวัสดุ) — เลือก "ไม่เคลือบ" ไม่ต้องขึ้น */}
                  {opt.sheetFee && (() => {
                    const fee = groupExtraOf(opt, effective);
                    if (fee <= 0) return null;
                    const per = perSheetOf(product, opt, effective);
                    const sheetsPer = sheetsPerUnitOf(product, opt, effective);
                    const sheets = sheetCountOf(product, opt, effective, qty);
                    const sheetUnit = opt.sheetFee!.unit ?? "แผ่น";
                    const unit = matrix?.unit ?? "ชิ้น";
                    return (
                      <p className="mt-1.5 rounded-xl bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-800 ring-1 ring-sky-100">
                        📄 {opt.label}แบบที่คิดเงิน คิดเป็น<span className="font-bold">ค่าวัสดุต่อ{sheetUnit}</span> ไม่ใช่ต่อ{unit} —
                        {/* งานที่ 1 ชิ้นกินหลายแผ่น (ปฏิทิน 1 เล่ม = 4 A3) พูดกลับด้าน ไม่งั้นอ่านแล้วเหมือนคิดน้อยกว่าจริง */}
                        {sheetsPer > 1 ? (
                          <>
                            {" "}ตอนนี้ 1 {unit} ใช้{" "}
                            <span className="font-bold">{sheetsPer.toLocaleString("th-TH")} {sheetUnit}</span>
                          </>
                        ) : (
                          <>
                            {" "}ตอนนี้ 1 {sheetUnit} ได้{" "}
                            <span className="font-bold">{per.toLocaleString("th-TH")} {unit}</span>
                          </>
                        )}
                        {" "}· สั่ง {qty.toLocaleString("th-TH")} {unit} = {sheets.toLocaleString("th-TH")} {sheetUnit} ={" "}
                        <span className="font-bold text-amber-700">{formatPrice(fee * sheets)}</span>
                        {sheets > 1 ? ` (${sheets}×${formatPrice(fee)})` : ""}
                      </p>
                    );
                  })()}
                  {/* กลุ่มที่ระบุจำนวนได้ — สรุปยอดรวมของทั้งกลุ่มหลังคูณจำนวนแล้ว */}
                  {withQty && picks.length > 0 && groupAddOf(opt, effective, feeQtyOf(opt)) > 0 && (
                    <p className="mt-1 text-[11px] font-semibold text-teal-700">
                      💡 {opt.label}ที่เลือกไว้ รวม +{formatPrice(groupAddOf(opt, effective, feeQtyOf(opt)))} ต่อ
                      {matrix?.unit ?? "ชิ้น"} (คิดตามจำนวนที่ระบุ)
                    </p>
                  )}
                  {/* ค่าธรรมเนียมช่วงสั่งน้อย — บอกทั้งตอนอยู่ในช่วง (คิดเหมา) และตอนพ้นช่วงแล้ว (คิดตามตัวเลือก) */}
                  {opt.smallQtyFee != null && opt.smallQtyFee.upToQty > 0 && (() => {
                    const s = opt.smallQtyFee!;
                    const gQty = feeQtyOf(opt);
                    const fee = smallQtyFeeOf(opt, effective, gQty);
                    const unit = matrix?.unit ?? "ชิ้น";
                    // สินค้าที่คิดเรทตามชิ้นต่อลาย ช่วงราคานับ "ต่อลาย" ไม่ใช่ยอดรวม — ต้องบอกให้ตรง
                    const perDesign = tierByDesign || (rate?.minPerDesign ?? 0) > 0;
                    const unitTxt = tierUnitWord(perDesign, opt);
                    const inRange = gQty <= s.upToQty;
                    const exempt = (s.freeChoices ?? []).join(" / ");
                    // กลุ่มที่มีเรทปลีก/ส่งด้วย (extraFromQty + extraBelow) — พ้นช่วงเหมาแล้ว
                    // ให้บรรทัด 💡 ของเรทเป็นคนบอกราคาแทน จะได้ไม่ขึ้นซ้อนกันสองบรรทัด
                    const tiered = (opt.extraFromQty ?? 0) > 0 && opt.choices.some((c) => c.extraBelow);
                    if (inRange && fee !== 0) {
                      return (
                        <p className={`mt-1 text-[11px] font-semibold ${fee < 0 ? "text-emerald-700" : "text-amber-700"}`}>
                          {fee < 0 ? "🎉" : "💡"} ช่วง 1-{s.upToQty.toLocaleString("th-TH")} {unitTxt} · {opt.label}
                          {fee < 0
                            ? `ลดให้ ${formatPrice(-fee)}/${unit}`
                            : withQty
                              ? // กลุ่มที่ระบุจำนวนได้ — ค่าเหมาคิดต่อชิ้นที่ติ๊ก ไม่ใช่ต่อกลุ่ม (ยอดรวมอยู่บรรทัด 💡 ด้านบน)
                                `คิดเหมาชิ้นละ ${formatPrice(fee)} × จำนวนที่ระบุ`
                              : `คิดเหมา ${formatPrice(fee)}/${unit}`}
                          {exempt ? ` (ยกเว้น ${exempt})` : ""}
                        </p>
                      );
                    }
                    if (inRange) {
                      // อยู่ในช่วงแต่ตัวที่เลือกได้รับยกเว้น (เช่น ห่วงแถม) — คิดราคาตัวเลือกตามปกติ
                      // ตัวที่เลือกไม่มีราคาอยู่แล้ว (เช่น "ไม่เพิ่ม") = ไม่มีอะไรต้องบอก ไม่ขึ้นบรรทัดรก
                      if (groupAddOf(opt, effective, gQty) <= 0) return null;
                      return (
                        <p className="mt-1 text-[11px] font-semibold text-stone-500">
                          💡 {opt.label}ที่เลือกอยู่ไม่คิดค่าเหมาช่วง 1-{s.upToQty.toLocaleString("th-TH")} {unitTxt}
                        </p>
                      );
                    }
                    if (tiered) return null;
                    // พ้นช่วงเหมาแล้ว — บอกราคาที่คิดจริงตอนนี้
                    const now = groupAddOf(opt, effective, gQty);
                    return (
                      <p className="mt-1 text-[11px] font-semibold text-teal-700">
                        💡 สั่งตั้งแต่ {(s.upToQty + 1).toLocaleString("th-TH")} {unitTxt}ขึ้นไปไม่มีค่าเหมา ·{" "}
                        {opt.label}{now > 0 ? ` +${formatPrice(now)}/${unit}` : "ไม่คิดเพิ่ม"}
                      </p>
                    );
                  })()}
                  {/* กลุ่มที่ตั้งเกณฑ์ +฿ ไว้ — บอกทั้งตอนต่ำกว่าเกณฑ์ (รวมในราคาแล้ว) และตอนถึงเกณฑ์ (คิดเพิ่มเท่าไร) */}
                  {!locked &&
                    opt.extraFromQty != null &&
                    opt.extraFromQty > 0 &&
                    opt.choices.some((c) => c.extra) &&
                    (() => {
                      const unit = matrix?.unit ?? "ชิ้น";
                      const gQty = feeQtyOf(opt);
                      const perDesign = tierByDesign || (rate?.minPerDesign ?? 0) > 0;
                      const unitTxt = tierUnitWord(perDesign, opt);
                      const from = opt.extraFromQty!.toLocaleString("th-TH");
                      if (!optionExtraApplies(opt, gQty)) {
                        // ช่วงปลีกบางกลุ่มคิดเพิ่มคนละเรท (extraBelow) — อย่าบอกว่า "รวมแล้ว" ทั้งที่ยังคิดเงิน
                        const below = groupAddOf(opt, effective, gQty);
                        if (opt.choices.some((c) => c.extraBelow)) {
                          // ช่วงเหมาสั่งน้อย (smallQtyFee) มีบรรทัด 💡 ของค่าเหมาบอกราคาอยู่แล้ว — ไม่ขึ้นซ้ำ
                          if (smallQtyFeeOf(opt, effective, gQty) > 0) return null;
                          // ราคาจริงเมื่อสั่งถึงเกณฑ์ — บอกตัวเลขตรง ๆ แทนคำว่า "เรทส่ง"
                          const atFrom = groupAddOf(opt, effective, opt.extraFromQty!);
                          if (below <= 0 && atFrom <= 0) return null;
                          return (
                            <p className="mt-1.5 text-[11px] font-semibold text-teal-700">
                              💡 จำนวนนี้{opt.label} {below > 0 ? `+${formatPrice(below)}/${unit}` : "ไม่คิดเพิ่ม"} · ครบ{" "}
                              {from} {unitTxt}
                              {atFrom > 0
                                ? ` ${atFrom < below ? "เหลือ" : "คิด"} +${formatPrice(atFrom)}/${unit}`
                                : "ไม่คิดเพิ่ม"}
                            </p>
                          );
                        }
                        return (
                          <p className="mt-1.5 text-[11px] text-stone-400">
                            💡 จำนวนนี้ราคารวม{opt.label}แล้ว · สั่งตั้งแต่ {from} {unitTxt}ขึ้นไปคิดเพิ่มตามตัวเลือก
                          </p>
                        );
                      }
                      const now = groupAddOf(opt, effective, gQty);
                      return (
                        <p className="mt-1.5 text-[11px] font-semibold text-teal-700">
                          💡 สั่งครบ {from} {unitTxt}แล้ว · {opt.label}
                          {now > 0 ? ` +${formatPrice(now)}/${unit}` : "ไม่คิดเพิ่ม"}
                        </p>
                      );
                    })()}
                  {/* 💰 กลุ่มที่ +฿ ถูกลงตามจำนวน (extraTiers) — บอกราคาที่คิดจริงตอนนี้ + ขั้นที่ถูกที่สุด
                    * เช่น FLEX ผ้าเชียร์: สั่ง 15 ผืน คิด +฿245/ผืน · สั่งครบ 500 ผืน เหลือ +฿230/ผืน */}
                  {!locked &&
                    (() => {
                      const cur = opt.choices.find(
                        (c) => c.extraTiers?.length && (multi ? picked.includes(c.name) : effective[opt.label] === c.name)
                      );
                      const now = cur ? choiceExtraAtQty(opt, effective, cur.name, feeQtyOf(opt)) : 0;
                      if (!cur || now <= 0) return null;
                      const unit = matrix?.unit ?? "ชิ้น";
                      // ขั้นของตารางเทียบกับ feeQty ตรง ๆ — หารด้วยจำนวนลายเฉพาะสินค้าที่คิดเรทต่อลายเท่านั้น
                      const unitTxt = tierUnitWord(tierByDesign, opt);
                      const best = extraTierBest(cur);
                      return (
                        <p className="mt-1.5 text-[11px] font-semibold text-teal-700">
                          💡 {opt.label}ถูกลงตามจำนวนที่สั่ง · จำนวนนี้คิด +{formatPrice(now)}/{unit}
                          {best && best.extra < now
                            ? ` · สั่งครบ ${best.fromQty.toLocaleString("th-TH")} ${unitTxt}ขึ้นไป เหลือ +${formatPrice(best.extra)}/${unit}`
                            : ""}
                        </p>
                      );
                    })()}
                  </div>
                  )}
                </div>
              );
  }

  /**
   * 💬 กล่องเตือน "ต้องคุยกับแอดมินก่อน" แบบแทรกใต้กลุ่มตัวเลือกที่เป็นตัวจุดชนวน
   * กล่องยืนยันตัวจริง (#consult-box · ติ๊กว่าคุยแล้ว) อยู่ท้ายหน้าเหนือช่องแนบลาย —
   * ลูกค้าที่เพิ่งกดตัวเลือกอยู่บนสุดจะไม่เห็นอะไรเปลี่ยนเลยถ้าไม่บอกตรงนี้
   */
  const consultInlineUI = consult && !studioMode && (
    <div className="mt-2 rounded-2xl bg-emerald-50/70 p-3.5 ring-1 ring-emerald-200">
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-stone-700">
        <span className="text-base leading-none">💬</span>
        แบบนี้ต้องคุยกับแอดมินก่อนสั่ง
        {consultOk ? (
          <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">คุยแล้ว ✓</span>
        ) : consultGate ? (
          <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">ต้องคุยก่อน *</span>
        ) : (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">แนะนำ</span>
        )}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-stone-600">{consult.note?.trim() || CONSULT_NOTE_DEFAULT}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <a
          href={LINE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#06C755] px-4 text-xs font-bold text-white transition hover:brightness-95"
        >
          💬 ทักไลน์ส่งลายให้แอดมินดู
        </a>
        {!consultOk && (
          <button
            type="button"
            onClick={() => document.getElementById("consult-box")?.scrollIntoView({ block: "center", behavior: "smooth" })}
            className="inline-flex min-h-[38px] items-center rounded-full bg-white px-4 text-xs font-bold text-emerald-700 ring-1 ring-emerald-300 transition hover:bg-emerald-50"
          >
            คุยแล้ว — ไปติ๊กยืนยัน ↓
          </button>
        )}
      </div>
    </div>
  );

  /**
   * แผงเลือกเรทราคา — แยกออกมาเป็นตัวแปรเพราะวางได้ 2 ที่:
   * เหนือกลุ่มตัวเลือก (ค่าเริ่มต้น) หรือใต้กลุ่มตัวเลือกเมื่อสินค้าตั้ง rateAfterOptions
   * (สินค้าที่ต้องรู้ "ของอะไร" ก่อนถึงจะเลือก "ขายแบบไหน" ได้ เช่น สติ๊กเกอร์ UV)
   */
  const ratePickerUI =
    rates.length > 1 && rate ? (
      <div className={`mt-5 ${useCustom ? "pointer-events-none select-none opacity-40" : ""}`} aria-disabled={useCustom}>
        <span className="mb-1.5 block text-[13px] font-bold text-stone-700">
          {RATE_LABEL}: <span className="font-semibold text-amber-600">{rate.label}</span>
        </span>
        <div className="grid gap-1.5">
          {rates.map((r) => {
            const on = r.label === rate.label;
            // จำนวนที่สั่งอยู่ยังไม่ถึงขั้นต่ำของเรทนี้ = กดเลือกไม่ได้ (กดแล้วขึ้นป๊อปอัปบอกเหตุผลแทน)
            // สินค้าที่ตั้ง hardMinQty เลือกได้เสมอ — กดแล้วดันจำนวนขึ้นให้ถึงขั้นต่ำของเรทนั้นแทนการล็อก
            const need = r.minQty ?? 1;
            // 🔒 มีสเปคแผ่นพักไว้ = ล็อกเรทด้วย (เรทคนละหน่วยสั่ง เปลี่ยนแล้วแผ่นที่พักไว้กลายเป็นคนละล็อต)
            const locked = (!product.hardMinQty && need > qty) || (sheets.length > 0 && !on);
            return (
              <button
                key={r.id}
                type="button"
                aria-disabled={locked}
                onClick={() => {
                  if (sheets.length > 0) return; // ล็อกระหว่างสั่งหลายแผ่น — ล้างรายการก่อนถึงจะเปลี่ยนเรทได้
                  if (locked) {
                    setRateLock(r);
                    return;
                  }
                  setRateTouched(true);
                  setRateLabel(r.label);
                  setAutoRateNote("");
                  jumpToImage(r.imageSrc);
                  // เรทใหม่ขั้นต่ำสูงกว่าจำนวนที่สั่งอยู่ → ดันขึ้นให้ถึงขั้นต่ำทันที (ช่องตัวเลขต้องตามด้วย)
                  if (product.hardMinQty && need > qty) {
                    setQty(need);
                    setQtyText(String(need));
                  }
                }}
                className={`rounded-xl px-3 py-2 text-left text-[13px] transition ${
                  on
                    ? "bg-amber-50 font-bold text-amber-900 ring-2 ring-amber-400"
                    : locked
                      ? "bg-stone-50 text-stone-400 ring-1 ring-dashed ring-stone-300 hover:ring-stone-400"
                      : "bg-white text-stone-600 ring-1 ring-stone-200 hover:ring-amber-300"
                }`}
              >
                <span className="flex items-center gap-2">
                  {/* ภาพประจำเรท (ถ้ามี) — ให้ลูกค้าเห็นหน้าตาแบบนั้น ๆ ตั้งแต่ตอนเลือก */}
                  {r.imageSrc && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.imageSrc}
                      alt={r.label}
                      className={`h-20 w-20 shrink-0 rounded-lg object-cover ring-1 ring-stone-200 ${locked ? "opacity-50 grayscale" : ""}`}
                      loading="lazy"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${on ? "border-amber-500" : "border-stone-300"}`}>
                        {on && <span className="h-2 w-2 rounded-full bg-amber-500" />}
                      </span>
                      {r.label}
                      {locked && (
                        <span className="rounded-full bg-stone-200/70 px-1.5 py-px text-[10px] font-bold text-stone-500">
                          {sheets.length > 0 ? `🔒 กำลังสั่งหลาย${lotWord}` : `🔒 ต้องสั่ง ${need.toLocaleString("th-TH")}+`}
                        </span>
                      )}
                    </span>
                    {r.desc && <span className="mt-0.5 block pl-6 text-[11px] font-normal leading-snug text-stone-500">{r.desc}</span>}
                    {(r.minQty || r.minPerDesign) && (
                      <span className={`mt-0.5 block pl-6 text-[10px] font-semibold leading-snug ${locked ? "text-stone-400" : "text-teal-700"}`}>
                        {[
                          r.minQty ? `สั่งรวม ${r.minQty.toLocaleString("th-TH")} ${r.pricing.unit}ขึ้นไป` : "",
                          r.minPerDesign ? `คละลายขั้นต่ำลายละ ${r.minPerDesign.toLocaleString("th-TH")} ${r.pricing.unit}` : "",
                          locked ? `ตอนนี้ยังขาดอีก ${(need - qty).toLocaleString("th-TH")} ${r.pricing.unit}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {autoRateNote && (
          <p className="mt-2 rounded-xl bg-teal-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-teal-800 ring-1 ring-teal-100">
            ✨ {autoRateNote}
          </p>
        )}
      </div>
    ) : null;

  /** กลุ่มงานสั่งทำที่เข้าเงื่อนไข "แสดงเมื่อ" ตอนนี้ — ว่าง = ไม่ต้องกางกล่อง 📐 ให้รก */
  const mtoVisible = product.options.filter((o) => isMadeToOrderOption(o) && optionVisible(o, effective));
  /** ลูกค้าติ๊ก "สั่งทำ" ไว้ไหม — ยังไม่ติ๊ก = ราคายังคิดตามตารางปกติ ไม่ต้องกรอกอะไร */
  const mtoOn = madeToOrderOn(effective);

  /**
   * 📐 สินค้าที่คิดราคาตามพื้นที่ — คอลัมน์ในตารางราคา ("15 ตร.ซม. แรก" / "ตร.ซม. ต่อไป")
   * เป็นเรทที่ระบบใช้คิดเอง ไม่ใช่ของให้ลูกค้ากด → ซ่อนปุ่มกลุ่มนั้นจากหน้าร้าน
   * (ตารางราคายังโชว์ตามเดิม ลูกค้าเห็นเรททั้งสองคอลัมน์อยู่แล้ว)
   */
  const areaOn = product.areaPricing?.enabled === true;
  const areaDriver = (opt: ProductOption) =>
    areaOn && (matrix?.driverLabels ?? []).includes(opt.label);
  /** กลุ่มตัวเลือกที่แสดงให้ลูกค้าเลือกอยู่ตอนนี้ (เรียงตามที่ตั้งไว้) */
  /**
   * มุมมองสำหรับ "ตัดสินว่ากลุ่มไหนควรโชว์" — กลุ่มของเสริมแบบติ๊กหลายอย่างที่ "เปิดสวิตช์ไว้"
   * แต่ยังไม่ได้ติ๊กอะไร ถือว่าลูกค้ากำลังใช้กลุ่มนั้นอยู่ กลุ่มที่ขึ้นกับมันจะได้โผล่ตั้งแต่เปิดสวิตช์
   * (เช่น เปิด "ติ่งห้อย" แล้วต้องเห็น "การห้อยติ่งห้อย" เลย ไม่ต้องรอติ๊กขนาดก่อน)
   *
   * ⚠️ ใช้กับการแสดงผลเท่านั้น — ราคาและสิ่งที่ติดไปกับตะกร้า/ออเดอร์ยังยึด effective ตามเดิม
   * (ไม่ติ๊ก = ไม่ได้ของ ไม่คิดเงิน และไม่ติดไปกับออเดอร์ ถึงจะเผลอเลือกไว้ก็ตาม)
   */
  const visibilityView = useMemo(() => {
    let view = effective;
    for (const opt of product.options) {
      if (!opt.collapsible || !isMultiOption(opt) || !openAddOns[opt.label] || view[opt.label]) continue;
      if (view === effective) view = { ...effective };
      view[opt.label] = opt.choices[0]?.name ?? "";
    }
    return view;
  }, [effective, openAddOns, product.options]);
  const visibleOptions = product.options.filter(
    (opt) => !isMadeToOrderOption(opt) && optionVisible(opt, visibilityView) && !areaDriver(opt)
  );
  /**
   * 🧩 จับกลุ่มที่อยู่ "ชุดเดียวกัน" (ProductOption.section) และต่อกันมา ให้เรนเดอร์ในกรอบเดียว
   * กลุ่มที่ไม่ได้ตั้งชุดไว้ ยังเรียงเรียบ ๆ ทีละกลุ่มเหมือนเดิม (สินค้าเดิมทั้งเว็บไม่กระทบ)
   * ติด index เดิมของแต่ละกลุ่มไปด้วย เพื่อให้แผงเรทยังแทรกถูกตำแหน่ง
   */
  /**
   * 🧩 กรอบ "ชุดตัวเลือก" ที่ลูกค้าหุบไว้ (คีย์ = ชื่อชุด) — เริ่มต้นกางทุกชุด
   * หุบแล้วหัวชุดยังบอกค่าที่เลือกไว้ครบ · ค่าที่เลือกไม่ได้หายไปไหน แค่ซ่อนการแสดงผล
   */
  const [closedSections, setClosedSections] = useState<Record<string, boolean>>({});
  const optionBlocks = useMemo(() => {
    const blocks: { section?: string; inputs?: boolean; items: { opt: ProductOption; i: number }[] }[] = [];
    visibleOptions.forEach((opt, i) => {
      const last = blocks[blocks.length - 1];
      // ✍️ ช่องกรอกที่ต่อกันมา (กว้าง+ยาว) = เรื่องเดียวกัน อยู่ในกรอบเดียวกัน
      // (กรอบละช่องทำให้ดูเหมือนคนละเรื่อง · กลุ่มที่ตั้ง "ชุดตัวเลือก" ไว้ใช้กรอบชุดตามเดิม)
      const inputs = isInputOption(opt) && !opt.section;
      if (last && opt.section && last.section === opt.section) last.items.push({ opt, i });
      else if (last && inputs && last.inputs) last.items.push({ opt, i });
      else blocks.push({ section: opt.section, inputs, items: [{ opt, i }] });
    });
    return blocks;
  }, [visibleOptions]);
  /**
   * แผงเรทไปแทรกใต้กลุ่มลำดับที่เท่าไหร่ (product.rateAfterOption) · -1 = ไม่แทรก ใช้ตำแหน่งบน/ล่างตามเดิม
   * นับกลุ่มที่ "ขึ้นกับกลุ่มนั้น" ที่ต่อท้ายกันมาเป็นพวกเดียวกันด้วย — เช่น ผิวเนื้อขาว ที่โผล่เมื่อเลือก
   * เนื้อขาว ต้องอยู่ติดกับเนื้อสติ๊กเกอร์ ไม่ใช่โดนแผงเรทมาคั่นกลาง
   */
  const ratePickerAfterIdx = (() => {
    if (!product.rateAfterOption) return -1;
    const at = visibleOptions.findIndex((o) => o.label === product.rateAfterOption);
    if (at < 0) return -1; // ชื่อไม่ตรง/กลุ่มถูกซ่อนอยู่ — อย่าให้แผงเรทหายไปทั้งอัน
    let last = at;
    while (
      last + 1 < visibleOptions.length &&
      [visibleOptions[last + 1].showWhen?.label, visibleOptions[last + 1].showWhenAlso?.label].includes(
        product.rateAfterOption
      )
    )
      last++;
    return last;
  })();
  /** วิธีคิดราคาจากขนาดที่ลูกค้ากรอก (null = ยังกรอกไม่ครบ) — โชว์ให้ลูกค้าเห็นว่าราคามาจากไหน */
  const areaBreakdown = useMemo(
    () => areaPriceBreakdown(product, effective, qty),
    [product, effective, qty]
  );

  /**
   * 📐 กล่องงานสั่งทำมาก่อนกลุ่มตัวเลือกไหม — ยึดลำดับที่แอดมินเรียงกลุ่มไว้
   * ช่องกรอกอยู่เหนือกลุ่มตัวเลือกอื่นในรายการ = ลูกค้าควรกรอกก่อน (อาร์มปัก: ราคาคิดจากขนาดลาย
   * เลือกสีผ้า/สีไหมก่อนแล้วราคายังไม่นิ่ง) · เรียงไว้ท้ายเหมือนเดิม = อยู่ใต้กลุ่มตัวเลือกตามเดิม
   * (กลุ่มแกนตารางราคาแบบพื้นที่ถูกซ่อนจากหน้าร้านอยู่แล้ว ไม่ถูกนับเป็นกลุ่มแรก)
   */
  const mtoFirst = (() => {
    // ยึดลำดับที่ "ตั้งไว้" ทั้งหมด ไม่ใช่เฉพาะกลุ่มที่โผล่อยู่ตอนนี้ — ไม่งั้นกล่องเด้งขึ้น-ลง
    // เวลากลุ่มที่ตั้ง "แสดงเมื่อ" ไว้ถูกซ่อน
    const first = product.options.findIndex((o) => isMadeToOrderOption(o));
    if (first < 0) return false;
    const firstPlain = product.options.findIndex((o) => !isMadeToOrderOption(o) && !areaDriver(o));
    return firstPlain >= 0 && first < firstPlain;
  })();

  /**
   * 📐 กล่องงานสั่งทำ — รวมทุกอย่างที่ลูกค้าต้อง "ระบุเอง" ไว้ที่เดียว
   * โผล่เมื่อมีอะไรให้กรอกจริง ๆ (เช่น เลือกแบบที่ 3 แล้วช่องขนาดถึงจะขึ้น)
   * เรียกจาก JSX ตำแหน่งเดียวเท่านั้น (บนหรือล่างกลุ่มตัวเลือก ตาม mtoFirst)
   */
  function mtoBoxUI() {
    if (mtoVisible.length === 0) return null;
    return (
      <div className={`${mtoFirst ? "mt-4" : "mt-5"} rounded-2xl bg-sky-50/60 p-4 ring-1 ring-sky-200`}>
        {/*
          สินค้าที่ไม่มีขนาดมาตรฐาน (mtoAlways) ไม่ต้องให้ติ๊ก — ช่องกรอกกางรอเลย
          (ติ๊กแล้วเขียนว่า "ไม่ติ๊ก = ใช้ขนาดมาตรฐาน" ทั้งที่ไม่มีขนาดมาตรฐาน = ลูกค้าไม่ติ๊ก แล้วออเดอร์เข้ามาไม่มีขนาด)
        */}
        {product.mtoAlways ? (
          <div>
            <span className="text-sm font-bold text-stone-700">📐 ระบุขนาดที่ต้องการ</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-stone-500">
              {areaOn
                ? "งานนี้คิดราคาตามพื้นที่ลาย — กรอกขนาดมาให้ครบ ระบบคำนวณราคาให้ทันที ไม่ต้องรอสอบถาม"
                : "งานนี้ทำตามขนาดที่ลูกค้ากำหนด — กรอกขนาดมาให้ครบ แล้วแอดมินจะตีราคาให้"}
            </span>
          </div>
        ) : (
          /* ติ๊กก่อนถึงกางช่องกรอก — ไม่ติ๊ก = ใช้ขนาดมาตรฐาน ราคายังคิดเองได้ตามตารางปกติ */
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={mtoOn}
              onChange={(e) =>
                setSelections((sel) => {
                  const next: Record<string, string> = { ...sel, [MTO_LABEL]: e.target.checked ? MTO_ON : "" };
                  // เอาติ๊กออก = ล้างค่าที่กรอกไว้ด้วย ไม่งั้นค่าเก่าค้างแล้วติดไปกับออเดอร์
                  if (!e.target.checked)
                    for (const o of product.options) if (isMadeToOrderOption(o)) next[o.label] = "";
                  return next;
                })
              }
              className="mt-0.5 h-4 w-4 shrink-0 accent-sky-600"
            />
            <span>
              <span className="text-sm font-bold text-stone-700">📐 ต้องการสั่งทำ — กำหนดขนาด/รายละเอียดเอง</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-stone-500">
                ไม่ติ๊ก = ใช้ขนาดมาตรฐานของแบบนี้ ราคาตามตารางปกติ · ติ๊กแล้วระบุขนาดที่ต้องการได้
                แล้วแอดมินจะตีราคาให้
              </span>
            </span>
          </label>
        )}
        {mtoOn && (
          <>
            <div className="mt-3 space-y-3 border-t border-dashed border-sky-200 pt-3">
              {mtoVisible.map((opt) => optionGroupUI(opt, false))}
            </div>
          </>
        )}
        {/* 📐 โชว์วิธีคิดราคาจากขนาดที่กรอก — ลูกค้าเห็นเองว่าราคามาจากไหน ไม่ต้องทักถามแอดมิน */}
        {mtoOn && areaBreakdown && (
          <div className="mt-3 border-t border-dashed border-sky-200 pt-3">
            <p className="text-xs font-bold text-sky-800">
              🧮 พื้นที่ลาย {areaBreakdown.width} × {areaBreakdown.height} ={" "}
              {Math.round(areaBreakdown.area * 100) / 100} ตร.ซม.
            </p>
            <ul className="mt-1.5 space-y-0.5 text-[11px] leading-relaxed text-stone-600">
              <li>
                · {areaBreakdown.baseArea} ตร.ซม. แรก = {formatPrice(areaBreakdown.basePrice)}
              </li>
              {areaBreakdown.extraArea > 0 && (
                <li>
                  · อีก {Math.round(areaBreakdown.extraArea * 100) / 100} ตร.ซม. ×{" "}
                  {formatPrice(areaBreakdown.stepPrice)} = {formatPrice(areaBreakdown.extraPrice)}
                </li>
              )}
              <li className="font-bold text-stone-700">
                · รวม {formatPrice(areaBreakdown.unitPrice)} / ชิ้น
                {qty > 1 && <> × {qty} ชิ้น = {formatPrice(areaBreakdown.unitPrice * qty)}</>}
              </li>
            </ul>
            <p className="mt-1.5 text-[10px] text-stone-400">
              เรทเปลี่ยนตามช่วงจำนวนที่สั่ง — สั่งเยอะขึ้น ราคาต่อชิ้นลดเองอัตโนมัติ
            </p>
          </div>
        )}
        {mtoOn && askQuote && (
          <div className="mt-3 border-t border-dashed border-sky-200 pt-3">
            <p className="text-xs font-bold text-sky-800">
              💬 อยากรู้ราคาก่อนสั่ง ทักมาถามได้เลย
            </p>
            <a
              href={LINE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#06C755] px-4 py-2 text-xs font-bold text-white transition hover:brightness-95"
            >
              💬 ทักไลน์สอบถามราคาก่อน
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="homebg">
      {/* พื้นหลัง + เมฆลอย ชุดเดียวกับหน้าแรก (ครอบเฉพาะพื้นหลัง ไม่แตะดีไซน์เดิมของหน้านี้) */}
      <div className="homebg-sky" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="c1" src="/landing/cloud.webp" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="c2" src="/landing/cloud.webp" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="c3" src="/landing/cloud.webp" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="c4" src="/landing/cloud.webp" alt="" />
      </div>
      <div className="homebg-in mx-auto max-w-6xl px-4 pt-6">
      {/* แผ่นขาวรองเนื้อหา — เหลือฟ้า+เมฆเป็นกรอบรอบนอก */}
      <div className="homebg-sheet">
      {/* สินค้าที่ปิดการมองเห็นไว้ — ลูกค้าเปิดไม่ได้ (404) หน้านี้เห็นเฉพาะทีมงานที่ล็อกอิน */}
      {preview && (
        <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 ring-1 ring-rose-200">
          🚫 สินค้านี้ <span className="underline">ปิดการมองเห็น</span> อยู่ — ลูกค้าไม่เห็นในหน้ารายการ/ค้นหา และเปิดลิงก์ตรงก็ไม่เจอ
          <span className="font-semibold"> (คุณเห็นหน้านี้เพราะล็อกอินหลังบ้านอยู่)</span>
        </div>
      )}
      {jsonLd.map((obj, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }}
        />
      ))}

      {/* ปุ่มลัดไปแก้ไขสินค้านี้ในหลังบ้าน (เฉพาะแอดมิน) */}
      {/* breadcrumb */}
      <nav className="flex items-center gap-1 overflow-hidden whitespace-nowrap text-[11px] text-stone-400">
        <Link href="/" className="shrink-0 hover:text-amber-600">หน้าแรก</Link>
        <span className="shrink-0">›</span>
        <Link href={`/products?category=${category.id}`} className="shrink-0 hover:text-amber-600">
          {category.name}
        </Link>
        <span className="shrink-0">›</span>
        <span className="truncate text-stone-600">{product.name}</span>
      </nav>

      {/* ═══ โครง 3 คอลัมน์: รูป | รายละเอียด | แผงสั่งซื้อ (ติดหนึบ)
           ฝั่งซ้าย (รูป+รายละเอียด) เป็นบล็อกเดียวกัน — ข้อมูลประกอบจึงไหลต่อขึ้นมาเติมได้
           แทนที่จะทิ้งช่องขาวยาว ๆ ไว้ข้างแผงสั่งซื้อ ═══ */}
      <div className="mt-4 grid gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
        <div className="grid min-w-0 gap-6 sm:grid-cols-2 sm:items-start lg:col-span-8 lg:gap-8">
        {/* ── ซ้าย: รูปสินค้า ── */}
        <div className="min-w-0">
          {/* รูปสินค้า — ติดหนึบตอนเลื่อนอ่านตัวเลือกยาว ๆ (จอใหญ่)
              สินค้าที่ยังไม่ใส่รูปเลย = ใช้อีโมจิ+พื้นสีของสินค้าแทน (กันหน้าพังตอนแอดมินเพิ่งสร้างสินค้า) */}
          {(() => {
            const gallery = galleryImages.length
              ? galleryImages
              : [{ emoji: product.emoji, gradient: product.gradient, label: "" }];
            const at = Math.min(imageIndex, gallery.length - 1);
            const shown = gallery[at];
            /**
             * เลื่อนรูปแบบวน — อยู่รูปสุดท้ายกดขวาต่อได้เลย ไม่ต้องย้อนกลับทีละรูป
             * คิดจากค่าก่อนหน้าใน setState (ไม่ใช่ at ที่ค้างอยู่ในรอบ render นี้)
             * ไม่งั้นกดรัว ๆ หลายทีก่อน render รอบใหม่ จะขยับแค่ทีเดียว
             */
            const step = (d: number) =>
              setImageIndex((i) => (gallery.length + Math.min(i, gallery.length - 1) + d) % gallery.length);
            return (
          <div className="lg:sticky lg:top-24">
            {/* group + relative: ปุ่มลูกศรซ่อนไว้ โผล่ตอนเอาเมาส์ชี้รูป (จอเล็กไม่มี hover จึงโชว์ค้างไว้) */}
            <div className="pgal-wrap group relative">
              {(() => {
                const shownSrc = shown.src ?? (at === 0 ? product.imageSrc : undefined);
                /**
                 * ช่องที่เป็นคลิป — เล่นในกรอบเดียวกับรูป (โปสเตอร์คือ src ของช่องนั้น)
                 * คลิปงานจริงของร้านเป็นแนวตั้ง กรอบเป็นจัตุรัส จึงใช้ object-contain บนพื้นเข้ม
                 * ไม่ให้ครอปหัว-ท้ายทิ้ง · ปิดเสียงไว้ก่อนเพื่อให้เบราว์เซอร์ยอมเล่นเองตอนกดสลับมา
                 */
                if (shown.videoSrc)
                  return (
                    <video
                      key={shown.videoSrc}
                      src={shown.videoSrc}
                      poster={shownSrc}
                      controls
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      aria-label={`${product.name} — ${shown.label}`}
                      className="pgal-main aspect-square w-full bg-[#0E2545] object-contain"
                    />
                  );
                const visual = (
                  <ProductVisual
                    emoji={shown.emoji}
                    gradient={shown.gradient}
                    src={shownSrc}
                    alt={`${product.name} — ${shown.label}`}
                    size="text-[8rem]"
                    eager
                    className="pgal-main aspect-square w-full"
                  />
                );
                // มีไฟล์รูปจริงเท่านั้นถึงกดขยายได้ (สินค้าอีโมจิล้วนไม่มีอะไรให้ซูม)
                return shownSrc ? (
                  <button
                    type="button"
                    onClick={() => setZoomSrc(shownSrc)}
                    aria-label="ดูรูปขนาดใหญ่"
                    className="block w-full cursor-zoom-in"
                  >
                    {visual}
                    {/* บอกว่ากดรูปแล้วขยายได้ — เดิมไม่มีอะไรบอก ลูกค้าไม่รู้ว่ากดได้ */}
                    <span className="pgal-zoom" aria-hidden="true">
                      ⤢ กดเพื่อขยาย
                    </span>
                  </button>
                ) : (
                  visual
                );
              })()}
              {gallery.length > 1 && (
                <>
                  {([
                    { d: -1, side: "prev", glyph: "‹", label: "ดูรูปก่อนหน้า" },
                    { d: 1, side: "next", glyph: "›", label: "ดูรูปถัดไป" },
                  ] as const).map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => step(a.d)}
                      aria-label={a.label}
                      className={`pgal-nav ${a.side}`}
                    >
                      {a.glyph}
                    </button>
                  ))}
                  {/* บอกว่าดูอยู่รูปที่เท่าไหร่จากทั้งหมด — โผล่พร้อมลูกศร */}
                  <span className="pgal-count">
                    {at + 1}/{gallery.length}
                  </span>
                </>
              )}
            </div>
            {/* แถบรูปย่อ — เลื่อนทีละชุดด้วยปุ่มลูกศร (ดู GalleryThumbs) */}
            <GalleryThumbs gallery={gallery} at={at} onPick={setImageIndex} coverSrc={product.imageSrc} />
            {shown.label && (
              <p className="pgal-cap">
                มุมมอง: <b>{shown.label}</b>
              </p>
            )}
          </div>
            );
          })()}
        </div>

        {/* ── กลาง: ชื่อ · รายละเอียด · ข้อควรทราบ ── */}
        {/* min-w-0: เป็น grid item ที่ min-width:auto ถ้าไม่ปลด เนื้อหายาว ๆ จะดันคอลัมน์กว้างเกินจอมือถือ */}
        <div className="min-w-0">
          <span className="text-xs font-semibold text-amber-500">
            {category.emoji} {category.name}
          </span>
          <h1 className="mt-1 text-base font-extrabold leading-snug text-stone-900 md:text-xl">
            {product.name}
          </h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-stone-500">
            <span>⭐ {product.rating}</span>
            <span>·</span>
            <span>ขายแล้ว {product.sold.toLocaleString("th-TH")} ชิ้น</span>
          </div>

          <p className="mt-3 text-[13px] leading-relaxed text-stone-600">{product.description}</p>

          {/* ═══ ข้อควรทราบ / เงื่อนไขงาน — อ่านก่อนสั่ง (แอดมินตั้งต่อสินค้าในหลังบ้าน) ═══ */}
          {product.terms?.trim() && (
            <div className="mt-4 overflow-hidden rounded-2xl border-2 border-rose-200 bg-rose-50/60 shadow-sm">
              <div className="flex items-center gap-2 bg-rose-500 px-4 py-2">
                <span className="text-base leading-none">⚠️</span>
                <p className="text-xs font-extrabold tracking-tight text-white">ข้อควรทราบก่อนสั่ง — รบกวนอ่านก่อนนะครับ</p>
              </div>
              <ul className="space-y-2 px-4 py-3">
                {termLines(product.terms).map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-[3px] shrink-0 text-[9px] leading-none text-rose-500">🔴</span>
                    <span className="whitespace-pre-line text-[11px] font-medium leading-relaxed text-rose-950">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ═══ 📐 เทมเพลตไฟล์งาน — โหลดไปวางลายก่อนส่งกลับมาให้ร้าน (ไม่ต้องล็อกอิน) ═══ */}
          {tplItems.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-2xl border-2 border-sky-200 bg-sky-50/60 shadow-sm">
              {/* หัวกล่อง = ปุ่มพับ/กางเมื่อมีเทมเพลตหลายรุ่น (ไม่กี่ไฟล์ = กางไว้เฉย ๆ ไม่ต้องกด) */}
              {(() => {
                const head = (
                  <>
                    <span className="text-base leading-none">📐</span>
                    <p className="min-w-0 flex-1 text-left text-xs font-extrabold tracking-tight text-white">
                      {studioMode ? "ไฟล์เทมเพลต — สำหรับคนที่ทำแบบเองในโปรแกรม" : "เทมเพลตไฟล์งาน — โหลดไปวางลายได้เลย"}
                    </p>
                    {tplCollapsible && (
                      <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white">
                        {tplItems.length} แบบ
                      </span>
                    )}
                  </>
                );
                return tplCollapsible ? (
                  <button
                    type="button"
                    onClick={() => setTplOpen((v) => !v)}
                    aria-expanded={tplOpen}
                    className="flex w-full items-center gap-2 bg-sky-600 px-4 py-2 text-left transition hover:bg-sky-700"
                  >
                    {head}
                    <span className={`shrink-0 text-[10px] text-white transition ${tplOpen ? "rotate-180" : ""}`}>▼</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 bg-sky-600 px-4 py-2">{head}</div>
                );
              })()}

              {/* ยุบอยู่แล้วยังไม่มีรายการที่ตรงกับตัวเลือก → บอกสั้น ๆ ว่ากดดูได้ (ไม่กินที่) */}
              {tplCollapsible && !tplOpen && tplShown.length === 0 ? (
                <p className="px-4 py-2.5 text-[11px] font-semibold text-sky-800">
                  มีไฟล์เทมเพลต {tplItems.length} แบบให้โหลด — กดที่แถบด้านบนเพื่อดูทั้งหมด
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-2 px-3 py-3 sm:grid-cols-3">
                  {tplShown.map((f) => (
                    <li
                      key={f.key}
                      className={`flex flex-col rounded-xl bg-white p-2 ring-1 ${
                        f.matched ? "ring-2 ring-sky-400" : "ring-sky-100"
                      }`}
                    >
                      {/* รูปของไฟล์นั้นมาก่อน (แต่ละรุ่นหน้าตาไม่เหมือนกัน) ไม่มีค่อยใช้รูปปกของชุด */}
                      {f.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={f.preview}
                          alt={`ตัวอย่างเทมเพลต ${f.name}${f.choice ? ` ${f.choice}` : ""}`}
                          className="mx-auto h-14 w-full rounded-lg bg-white object-contain"
                        />
                      ) : (
                        <span className="grid h-14 w-full place-items-center rounded-lg bg-sky-50 text-xl">📐</span>
                      )}
                      <span className="mt-1 block truncate text-[12px] font-bold text-stone-800" title={f.name}>
                        {f.name}
                        {f.choice && <span className="ml-1 font-semibold text-sky-700">· {f.choice}</span>}
                      </span>
                      {f.note && <span className="block truncate text-[10px] text-stone-500">{f.note}</span>}
                      <span className="block truncate text-[10px] text-stone-400">
                        {f.outside ? "เปิดลิงก์ไฟล์" : f.fileName || "ไฟล์เทมเพลต"}
                        {f.fileSize ? ` · ${formatFileSize(f.fileSize)}` : ""}
                      </span>
                      {f.matched && (
                        <span className="mt-0.5 block text-[10px] font-bold text-sky-700">✓ ตรงกับที่คุณเลือก</span>
                      )}
                      {f.anyNote && <span className="mt-0.5 block text-[10px] text-stone-400">{f.anyNote}</span>}
                      {/* ที่นี่มีแค่ปุ่มโหลดไฟล์ — การวางลายบนเว็บใช้ปุ่ม "เริ่มสร้าง" ในกล่องสั่งซื้อ */}
                      <a
                        href={f.href}
                        {...(f.outside
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : { download: f.fileName || "" })}
                        className="mt-1.5 rounded-full bg-sky-600 px-2 py-1.5 text-center text-[11px] font-bold text-white shadow transition hover:bg-sky-700"
                      >
                        {f.outside ? "🔗 เปิดลิงก์" : "⬇️ ดาวน์โหลด"}
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              {/* ยุบได้และกางอยู่ → ปุ่มพับกลับที่ท้ายรายการ (ไม่ต้องเลื่อนขึ้นไปหาหัวกล่อง) */}
              {tplCollapsible && tplOpen && (
                <button
                  type="button"
                  onClick={() => setTplOpen(false)}
                  className="mx-3 mb-2 block rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200 transition hover:bg-sky-50"
                >
                  ▲ ย่อรายการเทมเพลต
                </button>
              )}

              {/* แอดมินปิดปุ่ม "เริ่มสร้าง" ไว้ = ไม่ชวนให้กดปุ่มที่ไม่มีบนหน้า */}
              {!studioOff && (
                <p className="px-4 pb-3 text-[10px] leading-relaxed text-sky-800">
                  วิธีที่ง่ายที่สุดคือกดปุ่ม <strong>&ldquo;🎨 เริ่มสร้าง&rdquo;</strong> แล้ววางรูปของคุณบนแบบได้เลย
                  ระบบจัดขนาด/ตำแหน่งให้ตรงกับที่ผลิตจริง · ส่วนไฟล์ .ai ตรงนี้มีไว้ให้คนที่อยากทำแบบเองในโปรแกรมกราฟฟิก
                </p>
              )}
            </div>
          )}

          {/* ═══ ความมั่นใจก่อนกดสั่ง ═══ */}
          <ul className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-semibold text-stone-500">
            <li className="rounded-xl bg-white px-2.5 py-2 text-center ring-1 ring-stone-100">🖼️ ส่งแบบให้ตรวจ<br />ก่อนผลิตทุกงาน</li>
            <li className="rounded-xl bg-white px-2.5 py-2 text-center ring-1 ring-stone-100">✅ แก้แบบได้<br />จนกว่าจะพอใจ</li>
            <li className="rounded-xl bg-white px-2.5 py-2 text-center ring-1 ring-stone-100">🚚 ส่งไว<br />ทั่วไทย</li>
            <li className="rounded-xl bg-white px-2.5 py-2 text-center ring-1 ring-stone-100">💬 ทักไลน์<br />ปรึกษาฟรี</li>
          </ul>
        </div>

      {/* ═══ ข้อมูลประกอบ — ไหลต่อจากรูป/รายละเอียด (เดิมอยู่ท้ายหน้า ทำให้ตรงนี้เป็นช่องขาว) ═══ */}
      <div className="grid gap-6 sm:col-span-2 lg:grid-cols-2">
        <div className="relative">
          {/* ใช้ขนาดกำหนดเองอยู่ — คลุมตารางไว้ กันเข้าใจผิดว่าราคาอิงเรทขนาดปกติ
              (โหมด "ระบุขนาด" ไม่ต้องคลุม เพราะราคายังคิดจากตารางนี้จริง ๆ) */}
          {useCustom && !customUsesMatrix && (
            <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-white/70">
              <p className="rounded-full bg-sky-600 px-4 py-2 text-center text-xs font-bold text-white shadow-lg">
                📐 ใช้ขนาดกำหนดเองอยู่ — ราคาไม่อิงตารางนี้
              </p>
            </div>
          )}
          {/* งานสั่งทำ (แบบที่แอดมินตั้งให้ตีราคา) — ตารางนี้ไม่ใช่ราคาของงานนี้ คลุมไว้กันเข้าใจผิด */}
          {askQuote && !useCustom && (
            <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-white/70">
              <p className="rounded-full bg-sky-600 px-4 py-2 text-center text-xs font-bold text-white shadow-lg">
                💬 งานสั่งทำ — ราคาไม่อิงตารางนี้ แอดมินตีราคาให้
              </p>
            </div>
          )}
          <p className="text-sm font-bold text-stone-700">
            💰 ราคาต่อหน่วยตามจำนวน
            {rate && <span className="ml-1 font-semibold text-teal-700">· {rate.label}</span>}
          </p>
          {/* ตารางราคาขั้นบันได (rate card) — หลายคอลัมน์ = โชว์ทีละแบบตามที่เลือกอยู่ (กดเทียบทุกแบบได้) */}
          {matrix &&
            (() => {
              const allKeys = Object.keys(matrix.cells);
              /**
               * 📐 กำหนดขนาดเองในกลุ่มแกนราคา — ตัวเลือกนี้ไม่มีคอลัมน์ของตัวเองในตาราง
               * ต้องเกาะแถวเดียวกับที่ใช้คิดเงิน (12.5 → คอลัมน์ 12cm) ไม่งั้น selectedKey หาไม่เจอ
               * แล้วตารางกางทั้งหมดแทนที่จะโชว์แบบที่เลือกอยู่
               */
              const tableSizePlan = sizeInputPlan(product, effective);
              const selectedKey = priceMatrixKey(
                matrix,
                tableSizePlan?.choice ? { ...effective, [tableSizePlan.label]: tableSizePlan.choice } : effective
              );
              const manyCols = allKeys.length > 1;
              const only = allKeys.filter((k) => k === selectedKey);
              // ตัวเลือกที่เลือกอยู่ไม่มีราคาในตาราง (แอดมินเว้นช่องไว้) → กางทั้งหมดแทนตารางเปล่า
              // ยกเว้นตอน "รอแอดมินตีราคา" (เช่น กำหนดขนาดเองเกินตาราง) — มี overlay คลุมอยู่แล้ว
              // กางทั้ง 258 คอลัมน์ข้างหลังมีแต่ทำให้ตารางยืดเปล่า ๆ
              const cols =
                !manyCols || priceAllCols ? allKeys : only.length ? only : askQuote ? [allKeys[0]] : allKeys;
              /**
               * ราคาที่โชว์ = ช่องตาราง + ตัวเลือกเสริมที่เลือกอยู่ของช่วงจำนวนแถวนั้น (เช่น ค่าฐานสแตนดี้)
               * — โชว์ช่องตารางดิบแล้วไม่เท่ากับ "ราคา/ชิ้น" ในกล่องราคา ลูกค้านึกว่าเว็บคิดเงินผิด
               *   (ผู้ใช้ทัก 2 ก.ย. 69 สองรอบ — รอบแรกใส่แค่หมายเหตุใต้ตาราง ยังไม่พอ)
               * จำนวนตัวแทนของแถว: แถวที่เลือกอยู่ใช้ feeQty จริง (ตรงกับกล่องราคาแม้ +฿ เปลี่ยนกลางช่วง)
               * แถวแรกของเรทขั้นต่ำสูง (เช่น ไม่คละดีเทล 50+) ใช้ minQty ของเรท ไม่ใช่ 1 — ไม่งั้นได้ +฿ ฝั่งปลีก
               * คอลัมน์เทียบทุกแบบ: ทับค่าแกนตารางตามคอลัมน์ก่อนคิด กัน +฿ ที่ผูกกับขนาด (sizeFee) หยิบขนาดผิด
               */
              const tierRep = (ti: number) => {
                if (ti === currentTier) return feeQty;
                if (ti === 0)
                  return rate?.minQty && rate.minQty <= (matrix.tiers[0].upTo ?? Infinity) ? rate.minQty : 1;
                return (matrix.tiers[ti - 1].upTo ?? 0) + 1;
              };
              const shownPrice = (col: string, ti: number) => {
                const sel = { ...effectiveWithDesigns };
                col.split("│").forEach((v, i) => {
                  const l = matrix.driverLabels[i];
                  if (l) sel[l] = v;
                });
                const addOn = unitAddOnBreakdown(product, sel, tierRep(ti)).reduce((n, f) => n + f.amount, 0);
                return matrix.cells[col][ti] + addOn;
              };
              return (
                <div className="mt-2 overflow-hidden rounded-2xl ring-1 ring-stone-200">
                  {manyCols && (
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-stone-50 px-3 py-1.5">
                      <p className="text-[11px] text-stone-500">
                        {cols.length > 1
                          ? `💡 เทียบราคาทั้ง ${allKeys.length} แบบ`
                          : `💡 ราคาของ “${shortComboParts(selectedKey).join(" · ")}” — เปลี่ยนตัวเลือกด้านบนเพื่อดูแบบอื่น`}
                      </p>
                      <button
                        type="button"
                        onClick={() => setPriceAllCols((v) => !v)}
                        className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200 transition hover:bg-sky-50"
                      >
                        {cols.length > 1 ? "แสดงเฉพาะแบบที่เลือก" : `⇄ เทียบทุกแบบ (${allKeys.length})`}
                      </button>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-sky-100 text-sky-900">
                        <th className="whitespace-nowrap px-3 py-2 text-left font-bold">จำนวน ({matrix.unit})</th>
                        {/* ชื่อคู่ตัวเลือกยาวมาก (4 กลุ่ม) — แยกบรรทัดละส่วนและย่อคำในวงเล็บ ให้หัวตารางไม่ยืดจนล้น */}
                        {cols.map((col) => (
                          <th
                            key={col}
                            title={col.split("│").join(" · ")}
                            /**
                             * หลายคอลัมน์ = ชิดซ้าย เพื่อให้ขีดนำหน้าแต่ละบรรทัดเรียงตรงกัน (ตรงกลางจะดูรุ่งริ่ง)
                             * คอลัมน์เดียว = จัดกลางให้ตรงกับตัวเลขในช่อง (ไม่งั้นหัวตารางเยื้องไปคนละทางกับราคา)
                             */
                            className={`px-3 py-2 font-bold leading-tight ${cols.length === 1 ? "text-center" : "text-left"}`}
                          >
                            {/* ตารางคอลัมน์เดียวหัวจะว่าง — ใช้ชื่อที่แอดมินตั้ง (colLabel) แทน เช่น "กรอบเขย่า" */}
                            {(shortComboParts(col).length
                              ? shortComboParts(col)
                              : matrix.colLabel
                                ? [matrix.colLabel]
                                : []
                            ).map((part, i) => (
                              <span key={i} className="block whitespace-nowrap">
                                {cols.length > 1 && <span className="mr-1 text-sky-400">•</span>}
                                {part}
                              </span>
                            ))}
                          </th>
                        ))}
                        {/* 📝 คอลัมน์หมายเหตุต่อช่วงจำนวน (เช่น ค่าตัวน้อยเขย่าต่อตัวของแต่ละช่วง) */}
                        {matrix.noteCol && (
                          <th className="px-3 py-2 text-center font-bold leading-tight">
                            {matrix.noteCol.label.split("\n").map((part, i) => (
                              <span key={i} className="block whitespace-nowrap">
                                {part}
                              </span>
                            ))}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.tiers.map((tier, ti) => {
                        const active = ti === currentTier;
                        return (
                          <tr
                            key={tier.label}
                            className={active ? "bg-stone-100 font-bold text-stone-900" : "odd:bg-white even:bg-stone-50"}
                          >
                            <td className="whitespace-nowrap px-3 py-2">
                              {active && "▶ "}
                              {tier.label}
                            </td>
                            {cols.map((col) => {
                              const isChosen = active && selectedKey === col;
                              return (
                                <td key={col} className={`px-3 py-2 text-center ${isChosen ? "text-amber-700" : ""}`}>
                                  {formatPrice(shownPrice(col, ti))}
                                </td>
                              );
                            })}
                            {matrix.noteCol && (
                              <td className={`whitespace-nowrap px-3 py-2 text-center ${active ? "" : "text-stone-500"}`}>
                                {matrix.noteCol.values[ti] ?? ""}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              );
            })()}
          {/* 💡 ตารางบวกตัวเลือกเสริมที่เลือกอยู่เข้าไปในทุกช่องแล้ว (ดู shownPrice) — บรรทัดนี้บอกว่ามีอะไรรวมอยู่
            * จะได้ไม่งงว่าทำไมเลขไม่ตรงกับตารางหน้าราคาของร้าน (ผู้ใช้ทัก 2 ก.ย. 69 สองรอบ) */}
          {matrix && !askQuote && !(useCustom && !customUsesMatrix) && unitAddOnTotal > 0 && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 ring-1 ring-amber-100">
              💡 ราคาในตารางรวมตัวเลือกเสริมที่เลือกอยู่ให้แล้ว —{" "}
              {unitAddOns.map((f, i) => (
                <span key={`${f.label}-${i}`}>
                  {i > 0 ? " + " : ""}
                  <strong className="font-bold">{f.label}</strong> {formatPrice(f.amount)}
                </span>
              ))}
              /{matrix.unit} ตามช่วงจำนวนของแต่ละแถว
            </p>
          )}
          {rate?.minPerDesign != null && rate.minPerDesign > 0 && (
            <p className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-800 ring-1 ring-sky-100">
              🎨 เรทนี้คละลายขั้นต่ำลายละ {rate.minPerDesign.toLocaleString("th-TH")} {pieceUnit}
              {/* สินค้าทั่วไป: ตัวเลขนี้คือ "เรทนี้เริ่มใช้ที่เท่าไหร่" ไม่ใช่ห้ามสั่งน้อยกว่า
                  (สั่งน้อยกว่านี้ระบบสลับไปเรทที่ถูกต้องให้เอง) — แต่สินค้า hardMinQty ขั้นต่ำเป็นของจริง */}
              {rate.minQty && rate.minQty > 1
                ? product.hardMinQty
                  ? ` · สั่งขั้นต่ำ ${rate.minQty.toLocaleString("th-TH")} ${matrix?.unit ?? "ชิ้น"}ขึ้นไป`
                  : ` · เรทนี้เริ่มใช้ที่ ${rate.minQty.toLocaleString("th-TH")} ${matrix?.unit ?? "ชิ้น"}ขึ้นไป (สั่งน้อยกว่านี้ได้ ระบบคิดราคาตามช่วงจำนวนให้)`
                : ""}
            </p>
          )}
        </div>
        <div>
          <p className="text-sm font-bold text-stone-700">✨ จุดเด่นของงานนี้</p>
          {/* จุดเด่น */}
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {product.highlights.map((h) => (
              <li
                key={h}
                className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm text-stone-600 ring-1 ring-amber-100"
              >
                <span className="text-amber-500">✔</span> {h}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/**
        * 📦 การ์ด "วิธีสั่งสินค้านี้" — เฉพาะสินค้าที่ขั้นต่ำนับทั้งล็อต (minQtyScope: "lot")
        * เกิดจากพื้นที่ว่างยาว ๆ ฝั่งซ้ายตรงข้ามแผงสั่งซื้อ + ลูกค้าไม่เข้าใจว่าคละอะไรได้บ้าง
        * ตัวเลข/ชื่อกลุ่มดึงจากข้อมูลสินค้าจริง ไม่ฮาร์ดโค้ดชื่อสติ๊กเกอร์
        */}
      {lotMinRate && (
        <section className="sm:col-span-2">
          {/* โครงเดียวกับกล่อง "⚠️ ข้อควรทราบก่อนสั่ง" ของหน้านี้ — แถบหัวสีทึบ + กรอบ border-2 สีอ่อน
              (ระบบดีไซน์หน้าสินค้าไม่ใช้ gradient เลย ใช้สีทึบ + ริง/กรอบอ่อนล้วน) */}
          <div className="overflow-hidden rounded-2xl border-2 border-amber-200 bg-white shadow-sm">
            {/**
              * แถบหัว — ตามภาษาสีของหน้าแรก (landing.css)
              * ⚠️ หน้าแรก "ไม่ใช้บล็อกสีเข้มขนาดใหญ่" เลย — --navy ใช้แค่ปุ่มเล็ก (.btn-primary) กับตัวหนังสือ
              *    ส่วนพื้นของแถบ/เซ็กชันใหญ่เป็นฟ้าอ่อนไล่ลง (.top-stack)
              *      linear-gradient(168deg, --sky-200 → --sky-100 → --sky-50)
              *    เดิมทำเป็นพื้น navy เข้มตัวหนังสือขาว = สลับบทบาทสีผิด และเข้มเกินหน้าอื่น
              * โทเคนที่ใช้: sky-200 #C6E8FB · sky-100 #E2F3FE · sky-50 #F2FAFF
              *              navy #173A6B (หัวข้อ) · navy-soft #4A6A96 (ตัวรอง) · yolk #FFD447 (เน้น)
              * เขียน hex ตรงเพราะตัวแปรเหล่านี้อยู่ใต้ :root ของ landing.css ที่ครอบด้วย .dl
              */}
            <div
              className="relative overflow-hidden px-4 py-4 sm:px-5"
              style={{ background: "linear-gradient(168deg,#C6E8FB 0%,#E2F3FE 42%,#F2FAFF 100%)" }}
            >
              <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/50" />
              <span aria-hidden className="pointer-events-none absolute -bottom-14 right-24 h-28 w-28 rounded-full bg-white/35" />
              <div className="relative flex items-start gap-3">
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-2xl"
                  style={{ background: "#fff", boxShadow: "0 2px 8px rgba(44,129,196,.16)" }}
                >
                  📦
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-extrabold leading-snug" style={{ color: "#173A6B" }}>
                    สั่งขั้นต่ำ{" "}
                    <span
                      className="inline-block rounded-lg px-1.5 py-0.5"
                      style={{ background: "#FFD447", color: "#173A6B" }}
                    >
                      {(lotMinRate.minQty ?? 1).toLocaleString("th-TH")} {lotMinRate.pricing.unit}
                    </span>
                    {product.lotKeyOptions?.length ? ` ต่อ${product.lotKeyOptions[0]} 1 แบบ` : ""}
                  </p>
                  <p className="mt-1.5 text-[12.5px] font-semibold leading-relaxed" style={{ color: "#4A6A96" }}>
                    <strong style={{ color: "#173A6B" }}>
                      ไม่ต้องสั่งเหมือนกันทั้ง {(lotMinRate.minQty ?? 1).toLocaleString("th-TH")} {lotMinRate.pricing.unit}
                    </strong>{" "}
                    — แต่ละแผ่นเลือกไดคัทและขนาดของตัวเองได้
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-5">
              {/* ── ภาพประกอบ: 3 แผ่นคนละแบบ แยกสีให้เห็นชัดว่าเป็นคนละสเปค ── */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { n: 1, title: "ไดคัท 50%", sub: "ขนาดตัด A4", art: "half", box: "bg-sky-50 ring-sky-200", pill: "bg-sky-500", ink: "text-sky-900", fill: "#bae6fd", line: "#0284c7" },
                  { n: 2, title: "ไดคัท 100%", sub: "ไดคัท 5×5 ซม.", art: "dots", box: "bg-emerald-50 ring-emerald-200", pill: "bg-emerald-500", ink: "text-emerald-900", fill: "#a7f3d0", line: "#059669" },
                  { n: 3, title: "ไดคัท 50%", sub: "ขนาดตัด A6", art: "grid", box: "bg-violet-50 ring-violet-200", pill: "bg-violet-500", ink: "text-violet-900", fill: "#ddd6fe", line: "#7c3aed" },
                ].map((sh) => (
                  <div key={sh.n} className={`rounded-2xl p-2 text-center ring-1 sm:p-2.5 ${sh.box}`}>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10.5px] font-extrabold text-white ${sh.pill}`}>
                      แผ่นที่ {sh.n}
                    </span>
                    <svg viewBox="0 0 60 42" className="mx-auto mt-1.5 w-full max-w-[110px]" role="img" aria-label={`ตัวอย่างแผ่นที่ ${sh.n}`}>
                      <rect x="1" y="1" width="58" height="40" rx="3" fill="#fff" stroke={sh.line} strokeWidth="1.5" opacity="0.9" />
                      {sh.art === "half" && (
                        <>
                          <rect x="6" y="6" width="22" height="30" rx="2" fill={sh.fill} />
                          <rect x="32" y="6" width="22" height="30" rx="2" fill={sh.fill} />
                          <line x1="30" y1="4" x2="30" y2="38" stroke={sh.line} strokeWidth="1.2" strokeDasharray="2 2" />
                        </>
                      )}
                      {sh.art === "dots" &&
                        [8, 21, 34, 47].map((x) =>
                          [14, 28].map((y) => (
                            <circle key={`${x}-${y}`} cx={x} cy={y} r="5.4" fill={sh.fill} stroke={sh.line} strokeWidth="1.1" strokeDasharray="1.6 1.6" />
                          ))
                        )}
                      {sh.art === "grid" &&
                        [0, 1, 2, 3].map((c) =>
                          [0, 1].map((r) => (
                            <rect key={`${c}-${r}`} x={5 + c * 13} y={6 + r * 16} width="11" height="14" rx="1.5" fill={sh.fill} stroke={sh.line} strokeWidth="0.8" />
                          ))
                        )}
                    </svg>
                    <p className={`mt-1.5 text-[11.5px] font-extrabold leading-tight ${sh.ink}`}>{sh.title}</p>
                    <p className="text-[11px] font-semibold leading-tight text-stone-400">{sh.sub}</p>
                  </div>
                ))}
              </div>
              {product.lotKeyOptions?.length ? (
                <p className="mt-2.5 flex items-center justify-center gap-2 rounded-2xl bg-yellow-50 px-3 py-2.5 text-center text-[12px] font-bold leading-relaxed text-amber-950 ring-1 ring-yellow-300">
                  <span className="text-base leading-none">🔒</span>
                  <span>
                    แต่ทั้ง {(lotMinRate.minQty ?? 1).toLocaleString("th-TH")} {lotMinRate.pricing.unit} ต้องเป็น
                    <strong className="mx-1 rounded-md bg-yellow-300 px-1.5 py-0.5">{product.lotKeyOptions[0]}ชนิดเดียวกัน</strong>
                    เพราะพิมพ์รอบเดียวกัน
                  </span>
                </p>
              ) : null}

              {/* ── อะไรต่างกันได้ / อะไรทำไม่ได้ ── */}
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                <div className="rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
                  <p className="flex items-center gap-2 text-[12.5px] font-extrabold text-emerald-800">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-[13px] text-white">✓</span>
                    แต่ละแผ่นต่างกันได้
                  </p>
                  <ul className="mt-2 grid gap-1.5 text-[12px] font-semibold leading-relaxed text-emerald-900">
                    <li>🔀 <strong>แบบไดคัท</strong> — 50% กับ 100% ปนกันในออเดอร์เดียวได้</li>
                    <li>📐 <strong>ขนาด</strong> — แต่ละแผ่นคนละขนาดได้</li>
                    <li>🖼 <strong>ลาย</strong> — แต่ละแผ่นใช้ลายของตัวเอง</li>
                  </ul>
                </div>
                <div className="rounded-2xl bg-rose-50 p-3 ring-1 ring-rose-200">
                  <p className="flex items-center gap-2 text-[12.5px] font-extrabold text-rose-700">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-rose-500 text-[13px] text-white">✕</span>
                    ทำไม่ได้
                  </p>
                  <ul className="mt-2 grid gap-1.5 text-[12px] font-semibold leading-relaxed text-rose-900">
                    {product.lotKeyOptions?.length ? (
                      <li>
                        🎞 <strong>{product.lotKeyOptions[0]}</strong> — ต้องชนิดเดียวกันทั้งออเดอร์
                        <br />
                        <span className="text-rose-500">
                          อยากได้ 2 ชนิด = สั่งชนิดละ {(lotMinRate.minQty ?? 1).toLocaleString("th-TH")}{" "}
                          {lotMinRate.pricing.unit}
                        </span>
                      </li>
                    ) : null}
                    <li>
                      🧾 <strong>ยืนยันคำสั่งซื้อทั้งที่ยังไม่ครบ</strong>
                      <br />
                      <span className="text-rose-500">
                        เพิ่มลงตะกร้าได้เลย แต่กด “ยืนยันการสั่งซื้อ” ไม่ได้จนกว่าจะครบ{" "}
                        {(lotMinRate.minQty ?? 1).toLocaleString("th-TH")} {lotMinRate.pricing.unit}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* ── 3 ขั้นตอนสั่ง ── */}
              <p className="mt-4 flex items-center gap-2 text-[13px] font-extrabold text-stone-700">
                <span className="text-base leading-none">🛒</span> สั่งยังไง — ทำ 3 สเต็ป
              </p>
              <ol className="mt-2 grid gap-2">
                {[
                  {
                    t: `ตั้งค่า${lotWord}แรก แล้วกด “🛒 เพิ่มลงตะกร้า”`,
                    d: "เลือกแบบไดคัท · ขนาด · จำนวน แล้วอัปโหลดภาพลาย (อัปกี่รูป = กี่ลาย)",
                    tone: "bg-sky-50 ring-sky-200",
                    pill: "bg-sky-500",
                  },
                  {
                    t: `อยากได้อีก${lotWord} — เปลี่ยนตัวเลือกแล้วกดเพิ่มอีกครั้ง`,
                    d: `แต่ละ${lotWord}เป็นคนละรายการในตะกร้า แนบลายของตัวเองได้ · ราคาคิดจากยอดรวมทุก${lotWord} ยิ่งเยอะยิ่งถูก`,
                    tone: "bg-emerald-50 ring-emerald-200",
                    pill: "bg-emerald-500",
                  },
                  {
                    t: `ครบ ${(lotMinRate.minQty ?? 1).toLocaleString("th-TH")} ${lotMinRate.pricing.unit} แล้วไปที่ตะกร้า กด “✅ ยืนยันการสั่งซื้อ”`,
                    d: "ยังไม่ครบจะกดยืนยันไม่ได้ — ตะกร้าจะบอกว่าขาดอีกเท่าไหร่ พร้อมปุ่มพากลับมาเลือกเพิ่ม",
                    tone: "bg-violet-50 ring-violet-200",
                    pill: "bg-violet-500",
                  },
                ].map((st, i) => (
                  <li key={st.t} className={`flex gap-2.5 rounded-2xl px-3 py-2.5 ring-1 ${st.tone}`}>
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-extrabold text-white ${st.pill}`}>
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-extrabold leading-snug text-stone-800">{st.t}</span>
                      <span className="block text-[12px] font-semibold leading-relaxed text-stone-500">{st.d}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-2.5 grid gap-1.5 rounded-xl bg-stone-50 px-3 py-2 text-[11.5px] font-semibold leading-relaxed text-stone-500">
                <p>
                  💡 อยากได้ทั้ง {(lotMinRate.minQty ?? 1).toLocaleString("th-TH")} {lotMinRate.pricing.unit}{" "}
                  เหมือนกันหมด ก็กดจำนวนเป็น {(lotMinRate.minQty ?? 1).toLocaleString("th-TH")} แล้วเพิ่มลงตะกร้าครั้งเดียวจบ
                </p>
                <p>
                  🛒 ไม่ต้องสั่งครบในรอบเดียว — <strong>เพิ่มลงตะกร้าไว้ก่อนได้</strong> แล้วค่อยกลับมาเติมทีหลัง
                  ระบบนับรวมกับที่อยู่ในตะกร้าแล้วให้ (ขอเป็น{product.lotKeyOptions?.[0] ?? "สเปคหลัก"}เดียวกัน)
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* รายละเอียดสินค้า โซน "ข้างแผงสั่งซื้อ" — ท่อนที่แอดมินตั้ง slot: side ไว้ */}
      {bodyOf("side").length > 0 && (
        <div className="sm:col-span-2">{detailsSection("side", "mt-2")}</div>
      )}
        </div>

        {/* ── ขวา: แผงสั่งซื้อ ติดหนึบตอนเลื่อน ── */}
        <div className="lg:col-span-4 lg:sticky lg:top-24">
          <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-amber-100">
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">ราคา</p>
            <div className="mt-4 flex items-baseline gap-2">
              {useCustom && customAsk ? (
                // ขนาดกำหนดเอง (โหมดตีราคา/คุยกับแอดมิน) — ไม่โชว์ ฿0 ให้งง
                <span className="text-xl font-extrabold text-sky-700">
                  {customChat ? "💬 คุยรายละเอียดกับแอดมิน" : "💬 รอแอดมินตีราคา"}
                </span>
              ) : askQuote ? (
                // งานสั่งทำตามตัวเลือกที่เลือก — ราคายังไม่มี ไม่โชว์ ฿0 ให้งง
                <span className="text-xl font-extrabold text-sky-700">💬 รอแอดมินตีราคา</span>
              ) : (
                <>
                  <span className="text-2xl font-extrabold text-amber-600">{formatPrice(unitPrice)}</span>
                  {matrix ? (
                    <span className="text-sm font-semibold text-stone-500">/ {matrix.unit}</span>
                  ) : (
                    product.oldPrice && (
                      <span className="text-base text-stone-400 line-through">
                        {formatPrice(product.oldPrice)}
                      </span>
                    )
                  )}
                </>
              )}
            </div>
            {/* 🧮 สินค้าหลายชิ้นต่อหน่วย (พวงละหลายชิ้น) — บอกยอดชิ้นรวม + ย้ำว่าช่วงราคาคิดตามจำนวนหน่วยขาย */}
            {product.pieceCountLabel && unitPieceCountOf(product, effective) > 1 && !askQuote && (
              <p className="mt-1.5 text-xs leading-relaxed text-stone-500">
                🧮 {matrix?.unit ?? "พวง"}ละ {unitPieceCountOf(product, effective)} ชิ้น ×{" "}
                {qty.toLocaleString("th-TH")} {matrix?.unit ?? "พวง"} ={" "}
                <strong className="font-bold text-stone-600">
                  {(unitPieceCountOf(product, effective) * qty).toLocaleString("th-TH")} ชิ้นรวม
                </strong>{" "}
                — ช่วงราคาคิดตามจำนวน{matrix?.unit ?? "พวง"}ที่สั่ง
              </p>
            )}
            {/* 🧮 มีสินค้านี้ในตะกร้าแล้ว — บอกก่อนกดสั่งว่าจะรวมล็อตคิดเรทตามยอดรวม */}
            {lotPreview && !askQuote && (
              <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800 ring-1 ring-emerald-100">
                🧮 <strong className="font-bold">ในตะกร้ามีสินค้านี้อยู่แล้ว {lotPreview.cartQty.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"}</strong>
                {lotPreview.retailLine ? (
                  // จำนวนที่เลือกยังอยู่ช่วงราคาปลีกคละอิสระ — บรรทัดนี้คิดแยก แต่บอกเกณฑ์เริ่มรวมให้รู้
                  <>
                    {" — "}จำนวน 1-{((lotPreview.mergeFromQty ?? 1) - 1).toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"}เป็นราคาปลีก คิดแยก
                    {" · "}สั่งตั้งแต่ <strong className="font-bold">{(lotPreview.mergeFromQty ?? 1).toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"}ขึ้นไป</strong>
                    จะคิดรวมล็อตกับตะกร้า (รวม {lotPreview.combinedQty.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"} ≈{" "}
                    <strong className="font-bold">{formatPrice(lotPreview.unitPrice)}/{matrix?.unit ?? "ชิ้น"}</strong>)
                  </>
                ) : (
                  <>
                    {" — "}สั่งเพิ่ม {qty.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"}นี้จะคิดรวมเป็นล็อตเดียว{" "}
                    <strong className="font-bold">
                      {lotPreview.combinedQty.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"} {lotPreview.totalDesigns.toLocaleString("th-TH")} ลาย
                    </strong>
                    {lotPreview.rateLabel ? <> · {lotPreview.rateLabel}</> : null}
                    {lotPreview.unitPrice < unitPrice ? (
                      <>
                        {" → "}สเปคนี้เหลือ{" "}
                        <strong className="font-bold">
                          {formatPrice(lotPreview.unitPrice)}/{matrix?.unit ?? "ชิ้น"}
                        </strong>{" "}
                        <span className="text-stone-400 line-through">{formatPrice(unitPrice)}</span> (ราคาสุทธิคิดให้ในตะกร้า)
                      </>
                    ) : (
                      <> — ราคาต่อ{matrix?.unit ?? "ชิ้น"}คิดตามยอดรวมให้อัตโนมัติในตะกร้า</>
                    )}
                  </>
                )}
              </div>
            )}
            {askQuote && !useCustom ? (
              <div className="mt-1.5 rounded-xl bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800 ring-1 ring-sky-100">
                <p>
                  💬 <strong className="font-bold">งานสั่งทำ — สั่งเข้ามาได้เลย ยังไม่ต้องโอน</strong> กรอกรายละเอียดให้ครบ
                  แล้วกดสั่ง จากนั้นส่งลิงก์ออเดอร์ให้แอดมินทางไลน์เพื่อตีราคา แล้วหน้าแจ้งโอนถึงจะเปิดให้โอน
                </p>
                <a
                  href={LINE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#06C755] px-4 py-2 text-xs font-bold text-white transition hover:brightness-95"
                >
                  💬 ทักไลน์สอบถามราคาก่อน
                </a>
              </div>
            ) : useCustom ? (
              customAsk ? (
                // สั้น ๆ: สั่งเลย → copy ลิงก์ออเดอร์ส่งแอดมินให้ใส่ราคา → ค่อยโอน
                <p className="mt-1.5 rounded-xl bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800 ring-1 ring-sky-100">
                  {customChat ? "💬 " : "📐 "}
                  <strong className="font-bold">สั่งเข้ามาได้เลย ยังไม่ต้องโอน</strong> — หลังสั่งเสร็จ
                  กด <strong className="font-bold">คัดลอก (copy) ลิงก์ออเดอร์ส่งให้แอดมินทางไลน์</strong>{" "}
                  เพื่อให้ใส่ราคาก่อน แล้วหน้าแจ้งโอนถึงจะเปิดให้โอนได้
                </p>
              ) : (
                <p className="mt-1 text-xs text-sky-700">
                  {custom?.mode === "longest"
                    ? "📐 กำหนดขนาดเองอยู่ — ราคาคิดจากด้านที่ยาวที่สุด ตามตารางเรทปกติ"
                    : customUsesMatrix
                      ? "📐 ระบุขนาดเองอยู่ — ราคายังคิดตามตารางเรทปกติ"
                      : "📐 ใช้ขนาดกำหนดเองอยู่ — ราคาไม่อิงตัวเลือก/ตารางเรทปกติ"}
                </p>
              )
            ) : /* ตารางช่วงเดียว (ทุกจำนวนราคาเดียว) ไม่ได้ "ยิ่งสั่งเยอะยิ่งถูก" — ตกไปใช้ข้อความตามตัวเลือกด้านล่าง */
            matrix && matrix.tiers.length > 1 ? (
              <p className="mt-1 text-xs text-stone-400">
                💡 เรทราคา {formatPriceRange(product)} ต่อ{matrix.unit} — ยิ่งสั่งเยอะ ยิ่งถูก (ราคาปรับตามจำนวน)
              </p>
            ) : (
              priceRange(product).max > priceRange(product).min && (
                <p className="mt-1 text-xs text-stone-400">
                  💡 เรทราคา {formatPriceRange(product)} ขึ้นกับตัวเลือกที่เลือก
                </p>
              )
            )}
          </div>

          {/* เลือกเรทราคา — ค่าเริ่มต้นอยู่เหนือกลุ่มตัวเลือก
              (rateAfterOption = แทรกใต้กลุ่มที่ระบุ · rateAfterOptions = ใต้กลุ่มทั้งหมด) */}
          {!product.rateAfterOptions && ratePickerAfterIdx < 0 && ratePickerUI}

          {/* ตัวเลือกสินค้า (กรอง/ล็อกตามกฎเงื่อนไข)
              ใช้ขนาดกำหนดเองอยู่ = ปิดเฉพาะกลุ่มที่แอดมินไม่ได้ตั้งให้ "ยังเลือกได้" (custom.keepOptions) */}
          {useCustom && (
            <p className="mt-5 rounded-xl bg-sky-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-sky-800 ring-1 ring-sky-200">
              📐 กำลังใช้ &ldquo;{custom?.label ?? "กำหนดขนาดเอง"}&rdquo;
              {custom?.mode === "longest"
                ? " — ราคาอิงด้านที่ยาวที่สุด ตามตารางเรทปกติ"
                : customUsesMatrix
                  ? ""
                  : " — ราคาไม่อิงตารางเรทปกติ"}
              {/* ไล่ชื่อจากกลุ่มจริงของสินค้า ไม่ใช่จาก keepOptions ตรง ๆ — ชื่อที่ค้างอยู่แต่ไม่มีกลุ่มแล้วจะได้ไม่โผล่ */}
              {(() => {
                const kept = product.options.filter((o) => customKeepsOption(custom, o.label)).map((o) => o.label);
                return kept.length
                  ? ` · ยังเลือก ${kept.join(" / ")} ได้ตามปกติ ส่วนกลุ่มอื่นถูกปิดไว้`
                  : " ตัวเลือกด้านล่างถูกปิดไว้";
              })()}{" "}
              (เอาติ๊กออกเพื่อกลับมาเลือกทั้งหมด)
            </p>
          )}
          {/**
            * 📄 หัว "แผ่นที่ N" — โชว์ตั้งแต่แผ่นแรกเลย ไม่ใช่เฉพาะตอนกด ➕ แล้ว
            * เพราะหัวใจของความเข้าใจคือ "ตัวเลขนี้เปลี่ยนจาก 1 เป็น 2" ตอนกดปุ่ม —
            * ถ้าโชว์เฉพาะหลังกด ลูกค้าจะไม่รู้ว่าฟอร์มข้างล่างคือของแผ่นไหน
            */}
          {lotMinScope && !designDone && lotDone > 0 && (
            <div
              id="sheet-head"
              className={`mt-4 rounded-2xl px-3.5 py-2.5 ring-1 ${
                lotDone ? "bg-emerald-50 ring-emerald-200" : "bg-stone-50 ring-stone-200"
              }`}
            >
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className={`text-[15px] font-extrabold ${lotDone ? "text-emerald-800" : "text-stone-800"}`}>
                  {lotEmoji} {lotWord}ที่ {(lotDone + 1).toLocaleString("th-TH")}
                </span>
                {lotDone > 0 && (
                  <span className="text-[12px] font-bold text-emerald-700">
                    · {lotWord}ที่ 1{lotDone > 1 ? `–${lotDone}` : ""}{" "}
                    {lotToCart ? "อยู่ในตะกร้าแล้ว" : "เก็บไว้แล้ว"} ✓
                  </span>
                )}
              </p>
              {/* ⛔ ไม่ต้องมีบรรทัด "ยังขาด …" ตรงนี้ — ปุ่ม ➕/🛒 แถวปุ่มสั่งบอกอยู่แล้วว่าติดตรงไหน
                  (ผู้ใช้สั่งเอาออก 30 ส.ค. 69 — ซ้ำซ้อน อ่านสองที่) */}
              {lotLockedLabels.length > 0 && (
                <p className="mt-1 text-[11px] font-bold text-emerald-700">
                  🔒 {lotLockedLabels.join(" · ")} ล็อกไว้แล้ว — ทุก{lotWord}ในออเดอร์นี้ต้องเป็นแบบเดียวกัน
                </p>
              )}
            </div>
          )}
          {mtoFirst && mtoBoxUI()}
          <div id="opt-groups" className="mt-4 space-y-3">
            {/* กลุ่มที่ตั้ง "แสดงเมื่อ" ไว้ และเงื่อนไขยังไม่ตรง → ไม่ต้องโชว์ (เช่น สีตะขอของแบบที่ไม่ได้เลือก)
                🧩 กลุ่มที่ตั้ง "ชุดตัวเลือก" (section) ชื่อเดียวกันและอยู่ติดกัน → ใส่กรอบเดียวมีหัวชุด
                (สินค้าหลายชิ้นต่อหน่วยมีกลุ่มหน้าตาซ้ำกันทุกชิ้น เรียงแบนแล้วลูกค้าแยกไม่ออกว่าอันไหนของชิ้นไหน) */}
            {optionBlocks.map((blk) => (
              <Fragment key={`blk-${blk.section ?? blk.items[0].opt.label}`}>
                {blk.section ? (
                  (() => {
                    /* 🧩 ชุดตัวเลือก = กรอบเดียวที่กด "หัวชุด" หุบ/กางได้ (สินค้าหลายชิ้นมีได้ถึง 10 ชุด
                       กางหมดพร้อมกันแล้วเลื่อนหาชิ้นที่จะแก้ไม่เจอ) · หุบไว้ยังอ่านค่าที่เลือกได้ทุกกลุ่ม
                       ⚠️ หุบ = ซ่อนการแสดงผลเท่านั้น ค่าที่เลือกไว้ยังคิดราคา/ติดไปกับตะกร้าตามเดิม */
                    const sec = blk.section as string;
                    const closed = !!closedSections[sec];
                    const summary = blk.items.map(({ opt }) => effective[opt.label]).filter(Boolean).join(" · ");
                    return (
                      <section className="rounded-2xl bg-white p-3 ring-1 ring-stone-200">
                        <button
                          type="button"
                          onClick={() => setClosedSections((cur) => ({ ...cur, [sec]: !closed }))}
                          aria-expanded={!closed}
                          className={`flex min-h-[44px] w-full items-center gap-2 text-left ${
                            closed ? "" : "mb-2.5 border-b border-dashed border-stone-200 pb-2"
                          }`}
                        >
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-stone-800 text-[11px] font-bold tabular-nums text-white">
                            {sec.match(/\d+/)?.[0] ?? "•"}
                          </span>
                          <span className="shrink-0 text-[13px] font-bold text-stone-700">{sec}</span>
                          {closed && summary && (
                            <span className="min-w-0 flex-1 truncate text-[11px] text-stone-500">{summary}</span>
                          )}
                          <span className="ml-auto shrink-0 pl-1 text-[11px] font-semibold text-stone-400">
                            {closed ? "กาง ▾" : "หุบ ▴"}
                          </span>
                        </button>
                        {/* ✍️ ชุดที่มีแต่ช่องกรอก (กว้าง+สูง) — กรอบชุดครอบให้แล้ว ไม่ต้องมีกรอบซ้อนอีกชั้น
                            คั่นด้วยเส้นประเหมือนช่องกรอกที่ต่อกันมานอกชุด (ชุดที่ปนปุ่มยังใส่กรอบตามเดิม) */}
                        {!closed &&
                          (blk.items.every(({ opt }) => isInputOption(opt)) ? (
                            <div className="divide-y divide-dashed divide-stone-200 [&>*:not(:last-child)]:pb-3 [&>*+*]:pt-3">
                              {blk.items.map(({ opt }) => optionGroupUI(opt, false))}
                            </div>
                          ) : (
                            <div className="space-y-3">{blk.items.map(({ opt }) => optionGroupUI(opt))}</div>
                          ))}
                      </section>
                    );
                  })()
                ) : blk.inputs ? (
                  /* ✍️ ช่องกรอกที่ต่อกันมา — กรอบเดียวครอบทั้งชุด คั่นแต่ละช่องด้วยเส้นประ */
                  <div className="rounded-2xl bg-white/60 p-2.5 ring-1 ring-stone-200">
                    <div className="divide-y divide-dashed divide-stone-200 [&>*:not(:last-child)]:pb-3 [&>*+*]:pt-3">
                      {blk.items.map(({ opt }) => optionGroupUI(opt, false))}
                    </div>
                  </div>
                ) : (
                  blk.items.map(({ opt }) => optionGroupUI(opt))
                )}
                {/* 💬 เลือกตัวเลือกที่ต้องคุยกับแอดมิน = บอกตรงนั้นเลย (กล่องยืนยันตัวจริงอยู่ท้ายหน้า) */}
                {blk.items.some(({ opt }) => consultTriggers.includes(opt.label)) && consultInlineUI}
                {/* แผงเรทแทรกกลางกลุ่มตัวเลือก — กลุ่มที่อยู่ถัดไปถึงจะขึ้นกับเรทที่เพิ่งเลือกได้ */}
                {blk.items.some(({ i }) => i === ratePickerAfterIdx) && ratePickerUI}
              </Fragment>
            ))}
          </div>

          {/* สินค้าที่ให้เลือกของก่อน แล้วค่อยเลือกวิธีขาย — แผงเรทมาต่อท้ายกลุ่มตัวเลือก */}
          {product.rateAfterOptions && ratePickerAfterIdx < 0 && ratePickerUI}

          {/* 📐 กล่องงานสั่งทำ — ปกติต่อท้ายกลุ่มตัวเลือก (mtoFirst = ยกขึ้นไปไว้ก่อนแล้ว) */}
          {!mtoFirst && mtoBoxUI()}

          {/* งานกำหนดขนาดเอง แบบเดิม (custom) — ช่องกว้าง × ยาว ชุดเดียว */}
          {custom && (
            <div className="mt-5 rounded-2xl bg-amber-50/60 p-4 ring-1 ring-amber-200">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={useCustom}
                  onChange={(e) => setUseCustom(e.target.checked)}
                  className="h-4 w-4 accent-amber-500"
                />
                <span className="text-sm font-bold text-stone-700">📐 {custom.label}</span>
              </label>
              {custom.note && <p className="mt-1.5 pl-7 text-[11px] text-stone-500">{custom.note}</p>}
              {useCustom && customChat && (
                // โหมดคุยกับแอดมิน — ไม่มีอะไรให้กรอก มีแค่ทางลัดไปแชท
                <div className="mt-3 pl-7">
                  <p className="text-sm text-sky-800">
                    💬 งานแบบนี้ขอคุยรายละเอียดกับแอดมินก่อนนะครับ — แจ้งขนาด/แบบที่ต้องการทางไลน์ได้เลย
                  </p>
                  <a
                    href={LINE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-[#06C755] px-4 py-2 text-xs font-bold text-white transition hover:brightness-95"
                  >
                    💬 ทักไลน์คุยกับแอดมิน
                  </a>
                  <p className="mt-1.5 text-[11px] text-stone-500">
                    หรือกดสั่งไว้ก่อนก็ได้ — แอดมินจะตีราคาให้หลังคุยกันเสร็จ
                  </p>
                </div>
              )}
              {useCustom && !customChat && (
                <div className="mt-3 pl-7">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs font-semibold text-stone-600">
                      กว้าง
                      <input
                        type="text"
                        inputMode="decimal"
                        value={customW}
                        onChange={(e) => setCustomW(e.target.value.replace(/[^\d.]/g, ""))}
                        placeholder="0"
                        className="mt-1 block w-24 rounded-xl bg-white px-3 py-2 text-sm font-semibold ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </label>
                    <span className="pb-2 text-stone-400">×</span>
                    <label className="text-xs font-semibold text-stone-600">
                      ยาว
                      <input
                        type="text"
                        inputMode="decimal"
                        value={customH}
                        onChange={(e) => setCustomH(e.target.value.replace(/[^\d.]/g, ""))}
                        placeholder="0"
                        className="mt-1 block w-24 rounded-xl bg-white px-3 py-2 text-sm font-semibold ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </label>
                    <span className="pb-2 text-xs font-semibold text-stone-500">{custom.unit}</span>
                  </div>
                  <p className="mt-2 text-sm">
                    {!customValid ? (
                      <span className="text-stone-400">
                        {customUsesMatrix ? "กรอกกว้าง × ยาว ที่ต้องการ" : "กรอกกว้าง × ยาว เพื่อคิดราคา"}
                      </span>
                    ) : customSizeErr ? (
                      <span className="font-semibold text-rose-600">⚠️ {customSizeErr} — ปรับขนาดก่อนถึงจะสั่งได้</span>
                    ) : custom.mode === "longest" && longestPlan ? (
                      <span className="text-stone-600">
                        📐 {cW}×{cH} {custom.unit} → คิดราคาตามด้านที่ยาวที่สุด{" "}
                        <span className="font-bold">
                          {longestPlan.overCm > 0
                            ? `${longestPlan.choice} + ${longestPlan.overCm} ${custom.unit}`
                            : longestPlan.choice}
                        </span>{" "}
                        = <span className="font-extrabold text-amber-600">{formatPrice(unitPrice)}</span> / ชิ้น
                        {longestPlan.overCm > 0 && (
                          <span className="text-stone-400">
                            {" "}
                            (ฐาน {longestPlan.choice} + ส่วนเกิน {longestPlan.overCm} × {formatPrice(longestPlan.overRate)})
                          </span>
                        )}
                      </span>
                    ) : custom.mode === "size" ? (
                      <span className="text-stone-600">
                        📐 ระบุขนาด <span className="font-bold">{cW}×{cH} {custom.unit}</span> — ราคาคิดตามตารางราคาปกติ
                      </span>
                    ) : custom.mode === "area" ? (
                      <>
                        ราคา/ชิ้น <span className="font-extrabold text-amber-600">{formatPrice(customPrice)}</span>
                        <span className="text-stone-400"> · {cW}×{cH} {custom.unit}</span>
                      </>
                    ) : (
                      <span className="font-semibold text-amber-600">💬 สอบถามราคา — แอดมินจะตีราคาให้หลังสั่ง</span>
                    )}
                  </p>
                  {/* งานตีราคา: ลูกค้าส่วนใหญ่อยากรู้ราคาก่อนกดสั่ง — เปิดทางทักไลน์ไว้ตรงนี้เลย */}
                  {custom.mode === "quote" && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <a
                        href={LINE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#06C755] px-4 py-2 text-xs font-bold text-white transition hover:brightness-95"
                      >
                        💬 ทักไลน์สอบถามราคา
                      </a>
                      <span className="text-[11px] text-stone-500">
                        {customValid
                          ? `ส่งขนาด ${cW}×${cH} ${custom.unit} ให้แอดมินดูก่อนได้`
                          : "อยากรู้ราคาก่อนสั่ง ทักมาถามได้เลย"}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══ สั่งจำนวนมาก → ชวนเช็คสต๊อกก่อน (ไม่บล็อกการสั่ง) ═══ */}
          {bulkAsk && (
            <div className="mt-5 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
              <p className="text-sm font-extrabold text-amber-900">
                📦 สั่ง {qty.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"} — รบกวนเช็คสต๊อกกับแอดมินก่อนนะครับ
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">
                จำนวนนี้อาจต้องสั่งวัสดุเพิ่มหรือจองคิวผลิต — ทักไลน์เช็คของกับรอบผลิตก่อนได้เลย
                หรือ<strong>กดสั่งไว้ก่อนก็ได้</strong> ทางร้านจะรีบยืนยันจำนวน/วันส่งให้ทางแชท (ยังไม่ต้องโอนจนกว่าจะยืนยัน)
              </p>
              <a
                href={LINE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-[#06C755] px-4 py-2 text-xs font-bold text-white transition hover:brightness-95"
              >
                💬 ทักไลน์เช็คสต๊อก
              </a>
            </div>
          )}

          {/* ═══ กล่องสั่งซื้อ — จำนวน + ยอด + ปุ่ม (ติดกับตัวเลือก ไม่ให้ของไม่บังคับมาคั่น) ═══ */}
          <div ref={orderBoxRef} className="mt-5 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-amber-100">
            {/* ✏️ มาจากปุ่ม "แก้ไข" ในตะกร้า — ต้องบอกให้ชัดว่ากดบันทึกแล้วทับบรรทัดเดิม ไม่ใช่เพิ่มใบใหม่ */}
            {editing && (
              <div className="mb-3 rounded-2xl bg-sky-50 p-2.5 ring-1 ring-sky-200">
                <p className="text-[12px] font-extrabold text-sky-900">✏️ กำลังแก้ไขรายการในตะกร้า</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-sky-800">
                  ตัวเลือก จำนวน และลายที่แนบไว้ ถูกติ๊กกลับมาให้แล้ว — ปรับตรงไหนก็ได้ แล้วกด “💾 บันทึกการแก้ไข”
                  ระบบจะแทนที่บรรทัดเดิมในตะกร้าให้ (ไม่เพิ่มเป็นรายการใหม่)
                </p>
                <Link href="/cart" className="mt-1.5 inline-block text-[11px] font-bold text-sky-700 underline">
                  ← ยกเลิก กลับไปตะกร้าโดยไม่แก้
                </Link>
              </div>
            )}
            {/* 🧾 เปิดมาจากลิงก์ราคาที่ร้านส่งให้ — บอกลูกค้าว่าของที่ติ๊กไว้มาจากไหน จะได้ไม่นึกว่าเว็บสุ่มมาให้ */}
            {fromPriceLink && (
              <div className="mb-3 rounded-2xl bg-amber-50 p-2.5 ring-1 ring-amber-200">
                <p className="text-[12px] font-extrabold text-amber-900">🧾 ราคานี้ทางร้านจัดสเปคไว้ให้แล้ว</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
                  ตัวเลือกกับจำนวนถูกติ๊กไว้ตามที่คุยกันไว้ — กดเพิ่มลงตะกร้าได้เลย หรือปรับเปลี่ยนเองก็ได้ ราคาจะขยับตามให้อัตโนมัติ
                </p>
              </div>
            )}
            {/* ═══ สลับโหมดสั่งของ (เห็นเฉพาะพนักงานที่ล็อกอินหลังบ้าน) ═══
                 โหมดลูกค้า = เห็นหน้าเหมือนลูกค้าเป๊ะ ๆ · โหมดแอดมิน = สั่งแทนลูกค้า ข้ามขั้นวางลาย */}
            {isAdmin && (
              <div className="mb-3 rounded-2xl bg-sky-50 p-2 ring-1 ring-sky-200">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 px-1 text-[11px] font-extrabold text-sky-900">โหมดสั่งของ</span>
                  <div className="ml-auto flex rounded-full bg-white p-0.5 ring-1 ring-sky-200">
                    <button
                      type="button"
                      onClick={() => switchAdminMode(false)}
                      aria-pressed={!adminMode}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                        adminMode ? "text-stone-500 hover:bg-sky-50" : "bg-sky-600 text-white"
                      }`}
                    >
                      👤 ลูกค้า
                    </button>
                    <button
                      type="button"
                      onClick={() => switchAdminMode(true)}
                      aria-pressed={adminMode}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                        adminMode ? "bg-sky-600 text-white" : "text-stone-500 hover:bg-sky-50"
                      }`}
                    >
                      🧑‍💼 แอดมิน
                    </button>
                  </div>
                </div>
                <p className="mt-1.5 px-1 text-[10.5px] leading-relaxed text-sky-800">
                  {adminMode
                    ? "🧑‍💼 สั่งแทนลูกค้า — หยิบใส่ตะกร้าได้เลย ไม่ต้องวางลาย/แนบไฟล์ (ติ๊ก “สั่งแทนลูกค้า” อีกทีตอนชำระเงิน)"
                    : "👤 เห็นหน้าเหมือนลูกค้าทุกอย่าง — สลับเป็นแอดมินเมื่อจะสั่งแทนลูกค้า"}
                </p>

                {/* 🔗 ส่งราคานี้ให้ลูกค้า — คัดลอกสเปค+ราคา+ลิงก์ที่ติ๊กไว้ให้แล้ว ไปวางในไลน์ได้เลย
                     (แทนการ screenshot: ลูกค้ากดเข้าไปสั่งต่อได้ทันที ไม่ต้องเลือกตัวเลือกเองใหม่) */}
                <div className="mt-2 border-t border-sky-200 pt-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void copyPriceLink()}
                      disabled={priceBusy}
                      className="rounded-full bg-sky-600 px-3.5 py-1.5 text-[11px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                    >
                      {priceBusy ? "⏳ กำลังสร้างลิงก์…" : "🔗 คัดลอกลิงก์ราคา"}
                    </button>
                    {priceCopied === "err" ? (
                      <span className="text-[11px] font-bold text-rose-600">คัดลอกไม่ได้ — กดค้างเลือกคัดลอกเอง</span>
                    ) : priceCopied === "long" ? (
                      <span className="text-[11px] font-bold text-amber-700">
                        ✓ คัดลอกแล้ว (ลิงก์ยาว — ยังไม่ได้รัน price-links.sql)
                      </span>
                    ) : priceCopied ? (
                      <span className="text-[11px] font-bold text-emerald-600">✓ คัดลอกแล้ว วางในไลน์ได้เลย</span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 px-1 text-[10.5px] leading-relaxed text-sky-800">
                    วางในไลน์แล้วเด้งเป็นการ์ดราคาให้เอง (สเปค+ราคาอยู่ในการ์ด ไม่ต้องพิมพ์ซ้ำ) ·
                    ลูกค้ากดเข้าไปสั่งตามสเปคนี้ได้เลย · ยืนราคา 7 วัน ·
                    ดูว่าลูกค้าเปิดหรือยังที่{" "}
                    <Link href="/admin/price-links" className="font-bold underline">
                      ลิงก์ราคา
                    </Link>
                  </p>
                </div>
              </div>
            )}

            {/**
              * 🛒 โหมดหย่อนลงตะกร้าทันที — ของที่ใส่ไปแล้วอยู่ในตะกร้า ไม่ได้ค้างในหน้านี้
              * สรุปสั้น ๆ ว่าใส่ไปกี่{lotWord}/กี่ชิ้นแล้ว พร้อมทางไปแก้จำนวนที่ตะกร้า
              */}
            {lotToCart && cartLot.lines > 0 && !designDone && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-200">
                <p className="text-[12.5px] font-extrabold text-emerald-800">
                  🛒 ในตะกร้าแล้ว {cartLot.lines.toLocaleString("th-TH")} {lotWord} · รวม{" "}
                  {cartLot.qty.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"}
                  <span className="block text-[11px] font-semibold text-emerald-700">
                    ราคาขั้นบันไดคิดจากยอดรวมในตะกร้า — เพิ่ม{lotWord}ต่อได้เรื่อย ๆ
                  </span>
                </p>
                <Link
                  href="/cart"
                  className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-[11.5px] font-bold text-emerald-700 ring-1 ring-emerald-300 transition hover:bg-emerald-100"
                >
                  ดู/แก้จำนวนในตะกร้า →
                </Link>
              </div>
            )}

            {/**
              * 📄 รายการแผ่นที่จะสั่งรอบนี้ — พูดเป็น "แผ่นที่ 1 / 2 / 3" ให้ตรงกับหัวฟอร์มด้านบน
              * ลูกค้าจะได้เชื่อมได้ว่า "ที่กำลังกรอกอยู่ = แผ่นสุดท้ายในลิสต์นี้"
              */}
            {sheetRoll && (
              <div className="mb-3 rounded-2xl bg-white p-3 ring-1 ring-amber-200">
                <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-[13px] font-extrabold text-stone-800">
                  <span>{lotEmoji} {lotWord}ที่จะสั่งรอบนี้</span>
                  <span className={lotShortNeed > 0 ? "text-amber-700" : "text-emerald-700"}>
                    รวม {sheetRoll.qty.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"}
                    {rateMinQty > 1 &&
                      (lotShortNeed > 0
                        ? ` · ขาดอีก ${lotShortNeed.toLocaleString("th-TH")}`
                        : ` · ครบขั้นต่ำแล้ว ✓`)}
                  </span>
                </p>
                <ul className="mt-2 grid gap-1.5">
                  {sheets.map((sh, i) => (
                    <li key={sh.id} className="flex items-center gap-2 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-[12px] ring-1 ring-emerald-100">
                      <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-extrabold text-white">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-stone-800">
                          {sheetSpecText(sh.selections) || "ตามตัวเลือกที่เลือก"}
                        </span>
                        <span className="block text-[11px] font-semibold text-stone-500">
                          {sh.qty.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"} ×{" "}
                          {formatPrice(sheetRoll.rows[i].unitPrice)}
                          {sheetRoll.rows[i].extraFee > 0 && <> + ค่าคละลาย {formatPrice(sheetRoll.rows[i].extraFee)}</>}
                          {/* ลายของแผ่นนี้ — ยืนยันให้เห็นว่าแต่ละแผ่นมีลายของตัวเองแล้ว */}
                          {(() => {
                            const imgs = (sh.selections["ภาพลายที่แนบ"] ?? "").split(" | ").filter(Boolean).length;
                            const link = (sh.selections["ลิงก์ไฟล์ลาย/อีเมล"] ?? "").trim();
                            if (!imgs && !link) return null;
                            return (
                              <span className="ml-1.5 text-emerald-700">
                                · 🖼 {imgs ? `ลาย ${imgs.toLocaleString("th-TH")} รูป` : "ลายทางลิงก์"}
                              </span>
                            );
                          })()}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setSheets((cur) => [...cur, { ...sh, id: `${sh.id}-c${cur.length}` }])}
                        className="shrink-0 rounded-full px-2 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200 transition hover:bg-sky-50"
                        aria-label={`สั่ง${lotWord}ที่ ${i + 1} ซ้ำอีก${lotWord}`}
                      >
                        ⧉ ซ้ำ
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheets((cur) => cur.filter((x) => x.id !== sh.id))}
                        className="shrink-0 rounded-full px-2 py-1 text-[11px] font-bold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50"
                        aria-label={`เอา${lotWord}ที่ ${i + 1} ออก`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                  {/* แผ่นที่กำลังกรอกอยู่ตอนนี้ = แถวสุดท้าย · ยังกรอกไม่ครบก็บอกตรง ๆ ว่ายังไม่นับ */}
                  <li
                    className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[12px] ring-1 ${
                      sheetRoll.withCurrent ? "bg-amber-50 ring-amber-200" : "bg-stone-50 ring-stone-200"
                    }`}
                  >
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white ${
                        sheetRoll.withCurrent ? "bg-amber-500" : "bg-stone-300"
                      }`}
                    >
                      {sheets.length + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block font-bold ${sheetRoll.withCurrent ? "text-amber-900" : "text-stone-500"}`}>
                        {sheetSpecText(pricingSelections) || "ตามตัวเลือกที่เลือก"}
                      </span>
                      <span className={`block text-[11px] font-semibold ${sheetRoll.withCurrent ? "text-amber-700" : "text-stone-400"}`}>
                        {sheetRoll.withCurrent
                          ? `${qty.toLocaleString("th-TH")} ${matrix?.unit ?? "ชิ้น"} · ⬆ กำลังกรอก${lotWord}นี้อยู่`
                          : `⬆ กำลังกรอก${lotWord}นี้อยู่ — ยังไม่ครบ เลยยังไม่นับรวม`}
                      </span>
                    </span>
                  </li>
                </ul>
                <p className="mt-2 flex items-center justify-between text-[13px] font-extrabold text-stone-800">
                  <span>รวมรอบนี้</span>
                  <span className="text-amber-600">{formatPrice(sheetRoll.total)}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setSheets([])}
                  className="mt-1.5 text-[11px] font-bold text-stone-400 underline decoration-stone-300 underline-offset-4 transition hover:text-stone-600"
                >
                  ↺ เริ่มใหม่ทั้งหมด (ปลดล็อก{(product.lotKeyOptions ?? []).join(" · ") || "ตัวเลือกหลัก"})
                </button>
              </div>
            )}

            {/* จำนวน + เพิ่มลงตะกร้า */}
            <div>
              {matrix && !designDone && (
                <label className="mb-1 flex flex-wrap items-baseline gap-x-1.5 text-[13px] font-bold text-stone-700">
                  <span>จำนวน ({matrix.unit})</span>
                  {/* กำกับขั้นต่ำไว้ตรงนี้ เพราะช่องจำนวนเริ่มที่ 1 แล้ว ต้องบอกตั้งแต่ก่อนกด */}
                  {lotMinScope && rateMinQty > 1 && (
                    <span className="text-[11.5px] font-bold text-amber-700">
                      · สั่งขั้นต่ำ {rateMinQty.toLocaleString("th-TH")} {matrix.unit}
                      {product.lotKeyOptions?.length ? ` ต่อ${product.lotKeyOptions[0]} 1 แบบ` : ""}
                    </span>
                  )}
                </label>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {/* มีลายแล้ว = คุมจำนวนที่ลายแต่ละอันแทน (กันตัวเลขสองที่ไม่ตรงกัน) */}
                {!designDone && (
                <div className="flex items-center rounded-full bg-white ring-1 ring-amber-200">
                  <button
                    type="button"
                    // ลดได้ถึง 1 เสมอ — ถ้าต่ำกว่าขั้นต่ำของเรทที่เลือกไว้ ระบบจะสลับลงเรทที่เหมาะเอง
                    // (สินค้าที่ตั้ง hardMinQty ลดได้แค่ถึงขั้นต่ำจริงของเรท เช่น 3 แผ่น A3)
                    onClick={() => {
                      if (areaQty != null) return; // 📐 จำนวนล็อกตามขนาดที่กรอก
                      setQtyTouched(true);
                      setQty((q) => Math.max(qtyFloor, q - 1));
                    }}
                    aria-disabled={areaQty != null || qty <= qtyFloor}
                    className={`h-10 w-10 rounded-l-full text-base font-bold ${areaQty != null ? "cursor-not-allowed text-stone-300" : "text-stone-600 hover:bg-amber-50"}`}
                    aria-label="ลดจำนวน"
                  >
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={qtyText}
                    readOnly={areaQty != null}
                    onChange={(e) => {
                      if (areaQty != null) return; // 📐 จำนวนล็อกตามขนาดที่กรอก
                      // ปล่อยให้ลบจนว่างได้ระหว่างพิมพ์ (เดิมยัด 1 กลับทันที ลบแล้วพิมพ์ใหม่ไม่ได้)
                      setQtyTouched(true);
                      const raw = e.target.value.replace(/\D/g, "").slice(0, 5);
                      setQtyText(raw);
                      const n = parseInt(raw, 10);
                      if (Number.isFinite(n) && n > 0) setQty(Math.min(n, 99999));
                    }}
                    // พิมพ์ต่ำกว่าขั้นต่ำได้ระหว่างแก้ — ออกจากช่องแล้วค่อยดันขึ้นให้ถึงขั้นต่ำ
                    onBlur={() => {
                      if (areaQty != null) return;
                      const fixed = Math.max(qtyFloor, qty);
                      setQty(fixed);
                      setQtyText(String(fixed));
                    }}
                    className="w-14 bg-transparent text-center text-sm font-bold focus:outline-none"
                    aria-label="จำนวน"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (areaQty != null) return; // 📐 จำนวนล็อกตามขนาดที่กรอก
                      setQtyTouched(true);
                      setQty((q) => Math.min(matrix ? 99999 : 99, q + 1));
                    }}
                    aria-disabled={areaQty != null}
                    className={`h-10 w-10 rounded-r-full text-base font-bold ${areaQty != null ? "cursor-not-allowed text-stone-300" : "text-stone-600 hover:bg-amber-50"}`}
                    aria-label="เพิ่มจำนวน"
                  >
                    +
                  </button>
                </div>
                )}

                {/* โหมดออกแบบบนเว็บ: ปุ่มแรกคือ "เริ่มสร้าง" · วางลายเสร็จแล้วค่อยกลายเป็นปุ่มใส่ตะกร้า */}
                {studioNeedsDesign && (
                  <button
                    type="button"
                    onClick={() => openStudio(null)}
                    className="flex-1 rounded-full bg-sky-600 px-5 py-3 text-[13px] font-bold text-white shadow-lg transition hover:scale-105 hover:bg-sky-700 sm:flex-none sm:px-8"
                  >
                    🎨 เริ่มสร้าง — วางลาย{lotDone > 0 ? `บน${lotWord}นี้` : "บนสินค้า"}
                  </button>
                )}
                {/**
                  * ปุ่มสั่ง — โผล่เมื่อวางลายเสร็จแล้ว หรือ (โหมดสั่งหลายสเปค) มีของพักไว้แล้ว
                  * ⚠️ ที่ต้องโผล่คู่กับ "เริ่มสร้าง": พักรุ่นที่ 1 ไว้แล้วระบบล้างลายทิ้งเพื่อรับรุ่นถัดไป
                  *    ถ้าไม่มีปุ่มนี้ ลูกค้าที่พอแล้วจะไม่มีทางสั่งของที่เก็บไว้ นอกจากวางลายรุ่นถัดไปให้จบก่อน
                  */}
                {(!studioNeedsDesign || sheets.length > 0) && (
                  <button
                    type="button"
                    onClick={handleAdd}
                    // ขนาดกำหนดเอง = ราคาไม่อิงเรทปกติ → ไม่ติดขั้นต่ำของเรทด้วย (สั่งกี่ชิ้นก็ได้ แอดมินตีราคาตามจริง)
                    // ยังไม่ถึงขั้นต่ำรอบผลิต = ยังเพิ่มลงตะกร้าได้ (แค่เตือน) · ไปบล็อกที่ปุ่มยืนยันในตะกร้าแทน
                    disabled={
                      !sheets.length &&
                      ((useCustom && !customValid) || !!customSizeErr || artBlocked || inputErrors.length > 0 || belowMin || belowMinQty)
                    }
                    className={`flex-1 rounded-full px-5 py-3 text-[13px] font-bold shadow-lg transition sm:flex-none sm:px-8 ${
                      added
                        ? "bg-emerald-500 text-white"
                        : "bg-amber-400 text-white hover:scale-105 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                    }`}
                  >
                    {added
                      ? editing
                        ? "✓ บันทึกแล้ว!"
                        : "✓ เพิ่มลงตะกร้าแล้ว!"
                      : sheetRoll && !sheetRoll.withCurrent
                        ? `🛒 สั่ง ${sheetRoll.qty.toLocaleString("th-TH")} ${matrix?.unit ?? "ชิ้น"} ที่เก็บไว้ — ${formatPrice(sheetRoll.total)}`
                      : inputHardError || inputErrors.length > 0
                        ? inputBlockLabel()
                      : consultBlocked
                        ? "💬 คุยลายกับแอดมินก่อนถึงจะสั่งได้"
                        : artBlocked
                        ? "🎨 แนบลายก่อน — อัปโหลดรูป หรือใส่ลิงก์ไฟล์"
                        : belowMin
                        ? `⚠ ขั้นต่ำ ${hardMin} ชิ้นต่อลาย — สั่งอย่างน้อย ${hardMinNeed.toLocaleString("th-TH")} ชิ้น`
                        : belowMinQty
                        ? `⚠ เรทนี้เริ่มขายที่ ${rateMinQty.toLocaleString("th-TH")} ${matrix?.unit ?? "ชิ้น"}`
                        // ⚠️ ต้องอยู่ "หลัง" ช่องกรอก/แนบลาย ให้ตรงลำดับที่ readyToAdd() ตรวจจริง
                        //    เคยวางไว้หัวบันได ปุ่มเลยฟ้องเรื่องจำนวนลายทั้งที่ยังไม่ได้กรอกช่องด้านบน
                        : needDesignsChoice && !designsOk
                        ? "⚠ ระบุก่อนว่ามีกี่ลาย"
                        // ✏️ โหมดแก้ไข — ป้ายต้องบอกว่า "บันทึกทับ" ไม่ใช่ "เพิ่มลงตะกร้า" (อยู่หลังด่านตรวจทุกอัน)
                        : editing
                        ? `💾 บันทึกการแก้ไข — ${formatPrice(unitPrice * qty + designFee)}`
                        : (useCustom && customAsk) || askQuote
                        ? "🛒 สั่งเลย — แอดมินตีราคาแล้วแจ้งกลับ"
                        : sheetRoll
                          ? `🛒 สั่งทั้งหมด ${sheetRoll.qty.toLocaleString("th-TH")} ${matrix?.unit ?? "ชิ้น"} — ${formatPrice(sheetRoll.total)}`
                        // โหมดปุ่มเดียว: ใส่ไปแล้วกี่รุ่นก็นับต่อบนปุ่มเลย ลูกค้าจะได้รู้ว่ากดซ้ำได้เรื่อย ๆ
                        : lotToCart && lotDone > 0
                          ? `🛒 เพิ่ม${lotWord}ที่ ${(lotDone + 1).toLocaleString("th-TH")} ลงตะกร้า — ${formatPrice(unitPrice * qty + designFee)}`
                          : `🛒 เพิ่มลงตะกร้า — ${formatPrice(unitPrice * qty + designFee)}`}
                    {/* ครบขั้นต่ำเพราะรวมกับของในตะกร้า — ต้องพูดออกมา ไม่ให้ดูเหมือนขั้นต่ำไม่ทำงาน */}
                    {!added && lotMetWithCart && (
                      <span className="mt-0.5 block text-[11px] font-bold text-white/90">
                        ✓ รวมกับในตะกร้าเป็น{" "}
                        {((lotPreview?.cartQty ?? 0) + lotAddingQty).toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"} —
                        ครบขั้นต่ำแล้ว
                      </span>
                    )}
                  </button>
                )}

                {/* ➕ สั่งหลายสเปคในครั้งเดียว — พักสเปคนี้ไว้ แล้วตั้งค่าอันถัดไปต่อ (ยังไม่ลงตะกร้า)
                  * โผล่เฉพาะสินค้าที่เปิดโหมดล็อต — สินค้าอื่นสเปคเดียวจบ ไม่ต้องมีปุ่มนี้มากวน
                  * ⛔ สินค้าที่เปิด lotToCart (เคสมือถือ) ไม่มีปุ่มนี้ — ปุ่ม "🛒 เพิ่มลงตะกร้า" ทำงานเดียวกันเป๊ะ
                  *    (กดแล้วรุ่นนั้นลงตะกร้า ฟอร์มพร้อมรับรุ่นถัดไป) มีสองปุ่มทำเรื่องเดียวกันแค่ชวนงง
                  *    — ผู้ใช้สั่งเอาออก 31 ส.ค. 69
                  * สินค้าที่ออกแบบบนเว็บได้ ต้องวางลายให้เสร็จก่อน ปุ่มถึงจะโผล่ */}
                {lotMinScope && !lotToCart && !studioNeedsDesign && (
                  <button
                    type="button"
                    onClick={stageSheet}
                    className={`shrink-0 rounded-full px-4 py-2.5 text-[12px] font-bold ring-1 transition ${
                      staged
                        ? "bg-emerald-500 text-white ring-emerald-500"
                        : sheetTodoLeft.length
                          ? "bg-white text-stone-500 ring-stone-200 hover:bg-stone-50"
                          : "bg-white text-amber-700 ring-amber-300 hover:bg-amber-50"
                    }`}
                  >
                    {/* ⚠️ ชื่อปุ่มต้องอยู่เสมอ — เคยเอาข้อความเตือนไปแทนที่ชื่อ แล้วลูกค้าหาปุ่มไม่เจอ
                        เหตุผลที่กดไม่ได้ไปอยู่บรรทัดที่สองในปุ่มแทน */}
                    {staged ? (
                      `✓ เก็บ${lotWord}ที่ ${lotDone.toLocaleString("th-TH")} แล้ว — ตั้งค่า${lotWord}ที่ ${(lotDone + 1).toLocaleString("th-TH")} ต่อ`
                    ) : (
                      // ⛔ ไม่ต้องมีบรรทัดเตือนซ้ำตรงนี้ — ปุ่มสั่งหลักข้าง ๆ บอกอยู่แล้วว่าติดตรงไหน
                      //    และมีปุ่ม "👆 ไปที่…/ไปแนบลาย" พาไปให้ด้วย (ผู้ใช้สั่งเอาออก 31 ส.ค. 69)
                      `➕ เพิ่มอีก${lotWord} (คนละแบบ)`
                    )}
                  </button>
                )}

                {/* ติดช่องกรอก — พาไปที่ช่องนั้นเลย (ปุ่มสั่งกดไม่ได้ ลูกค้าจะได้ไม่ต้องไล่หาเอง) */}
                {(inputHardError || (inputErrors.length > 0 && !artBlocked && !consultBlocked)) && (
                  <button
                    type="button"
                    onClick={jumpToInputError}
                    className="shrink-0 rounded-full bg-white px-4 py-2 text-[12px] font-bold text-rose-700 ring-1 ring-rose-300 transition hover:bg-rose-50"
                  >
                    👆 ไปที่ “{(inputHardError ?? inputErrors[0]).label}”
                  </button>
                )}
                {/* ติดที่ยังไม่แนบลาย — เดิมบอกแค่ "แนบลายก่อน" แต่ไม่มีทางไป ลูกค้าต้องไล่หากล่องเอง
                    (ปุ่ม ➕ มีตัวพาไปอยู่แล้ว ปุ่มสั่งหลักควรมีเหมือนกัน) */}
                {artBlocked && !inputHardError && !consultBlocked && (
                  <button
                    type="button"
                    onClick={jumpToArt}
                    className="shrink-0 rounded-full bg-white px-4 py-2 text-[12px] font-bold text-rose-700 ring-1 ring-rose-300 transition hover:bg-rose-50"
                  >
                    👆 ไปแนบลาย
                  </button>
                )}
                {(belowMin || belowMinQty) && (
                  <button
                    type="button"
                    onClick={() => {
                      const need = belowMin ? hardMinNeed : rateMinQty;
                      setQty(need);
                      setQtyText(String(need));
                    }}
                    className="shrink-0 rounded-full bg-white px-4 py-2 text-[12px] font-bold text-amber-700 ring-1 ring-amber-300 transition hover:bg-amber-50"
                  >
                    ปรับเป็น {(belowMin ? hardMinNeed : rateMinQty).toLocaleString("th-TH")}{" "}
                    {belowMin ? "ชิ้น" : (matrix?.unit ?? "ชิ้น")}
                  </button>
                )}
                {/* โหมดแอดมินยังเปิดจอวางลายเองได้ ถ้าลูกค้าอยากให้จัดลายให้ตรงนี้เลย */}
                {staffOrdering && studioTarget && !designDone && (
                  <button
                    type="button"
                    onClick={() => openStudio(null)}
                    className="shrink-0 rounded-full bg-white px-4 py-2 text-[12px] font-bold text-sky-700 ring-1 ring-sky-300 transition hover:bg-sky-50"
                  >
                    🎨 วางลายเอง
                  </button>
                )}
              </div>
              {/* 📦 ขั้นต่ำแบบนับทั้งล็อต — เพิ่มลงตะกร้าได้ตั้งแต่ชิ้นแรก แค่เตือน
                  ประตูจริงอยู่ที่ปุ่ม "ยืนยันการสั่งซื้อ" ในตะกร้า (ผู้ใช้สั่ง 31 ส.ค. 69) */}
              {lotShortNeed > 0 && !designDone && (
                <div className="mt-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-900 ring-1 ring-amber-200">
                  <p className="font-extrabold">
                    📦 ขั้นต่ำ {rateMinQty.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"}
                    {product.lotKeyOptions?.length ? ` ต่อ${product.lotKeyOptions[0]} 1 แบบ` : ""} · ยังขาดอีก{" "}
                    {lotShortNeed.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"}
                  </p>
                  {/* บอกให้ชัดว่า "เพิ่มได้ แต่ยังยืนยันไม่ได้" ไม่งั้นลูกค้าไปตกใจตอนกดยืนยันในตะกร้า */}
                  <p className="mt-1 font-semibold">
                    เพิ่มลงตะกร้าได้เลย แล้วค่อยเติมให้ครบ —{" "}
                    <strong className="text-rose-600">ยังกด “ยืนยันการสั่งซื้อ” ไม่ได้จนกว่าจะครบ</strong>
                  </p>
                </div>
              )}

              {/* 🎁 สินค้านี้ร่วมโปรของแถม — ป้าย+ความคืบหน้า (อัปเดตเองหลังกดเพิ่มลงตะกร้า) */}
              <GiftPromoBadge product={product} />
              {/* 📐 สินค้าขายเป็นพื้นที่ — กางวิธีคิดให้เห็น: ขนาดที่กรอก → (ดันขั้นต่ำต่อด้าน) → พื้นที่ → ปัดขึ้นเต็มหน่วยขาย */}
              {areaQty != null && !designDone && (
                <p className="mt-2 rounded-2xl bg-teal-50 px-3 py-2 text-[12px] font-bold leading-relaxed text-teal-900 ring-1 ring-teal-200">
                  📐 ขนาด {areaQty.width.toLocaleString("th-TH")}×{areaQty.height.toLocaleString("th-TH")} ซม.
                  {/* ด้านที่สั้นกว่าขั้นต่ำถูกดันขึ้น — โชว์ขนาดที่ใช้คิดเงินให้ลูกค้าเห็นที่มา (เช่น 50×200 → คิด 100×200) */}
                  {(areaQty.billedWidth !== areaQty.width || areaQty.billedHeight !== areaQty.height) && (
                    <> → คิดขั้นต่ำด้านละ {(product.qtyFromArea!.minSide ?? 0).toLocaleString("th-TH")} ซม. ={" "}
                    {areaQty.billedWidth.toLocaleString("th-TH")}×{areaQty.billedHeight.toLocaleString("th-TH")} ซม.</>
                  )}{" "}
                  = {(Math.round(areaQty.area * 100) / 100).toLocaleString("th-TH")} {matrix?.unit ?? "ตร.ม."} →{" "}
                  <span className="text-[13px] font-extrabold">
                    คิด {areaQty.qty.toLocaleString("th-TH")} {matrix?.unit ?? "ตร.ม."}
                  </span>
                  <span className="font-semibold text-teal-700"> (ปัดขึ้นเต็ม {matrix?.unit ?? "ตร.ม."} — จำนวนล็อกตามขนาดที่กรอก)</span>
                </p>
              )}
              {/*
                * 📐 สรุปงานแบ่งแผ่น/ไดคัทตามขนาด — ลูกค้าสั่งเป็น "แผ่น A3" แต่อยากรู้ว่าได้งานกี่ชิ้น
                * (สั่ง 10 แผ่น A3 ขนาดตัด A5 = 40 ชิ้น) · ไม่โชว์ตอนวางลายเอง เพราะจำนวนคุมที่ลายแต่ละอัน
                */}
              {yieldTotal != null && !designDone && (
                <p className="mt-2 rounded-2xl bg-teal-50 px-3 py-2 text-[12px] font-bold leading-relaxed text-teal-900 ring-1 ring-teal-200">
                  📐 สั่ง {qty.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"} · {unitYield!.label}{" "}
                  {unitYield!.size} ={" "}
                  <span className="text-[13px] font-extrabold">
                    ได้{unitYield!.approx ? "ประมาณ " : " "}
                    {yieldTotal.toLocaleString("th-TH")} ชิ้น
                  </span>
                  {/* สั่ง 1 หน่วย: "(2 ชิ้น ต่อ 1 แผ่น A3)" ซ้ำกับ "= ได้ 2 ชิ้น" ที่อยู่หน้ามันเป๊ะ — ตัดทิ้ง */}
                  <span className={`font-semibold text-teal-700 ${qty <= 1 && !unitYield!.via ? "hidden" : ""}`}>
                    {" "}
                    ({unitYield!.per.toLocaleString("th-TH")} ชิ้น ต่อ 1 {matrix?.unit ?? "ชิ้น"}
                    {/* เรทตารางเมตร: กางตัวคูณให้เห็นว่า 320 ชิ้น/ตร.ม. มาจาก 40 ชิ้น/แผ่น × 8 แผ่น */}
                    {unitYield!.via
                      ? ` = ${unitYield!.via.perSheet.toLocaleString("th-TH")} ชิ้น ต่อ 1 ${
                          unitYield!.via.sheetName
                        } × ${unitYield!.via.sheets} ${unitYield!.via.sheetName}`
                      : ""}
                    {unitYield!.approx ? " — จำนวนจริงขึ้นกับรูปทรงลาย" : ""})
                  </span>
                </p>
              )}
              {/* แบบที่ลูกค้าวางเอง — สั่งหลายลายในรายการเดียวได้ กำหนดจำนวนแยกแต่ละลาย */}
              {designDone && (
                <div className="mt-3 rounded-2xl bg-sky-50 p-2.5 ring-1 ring-sky-200">
                  <p className="mb-2 flex items-center gap-2 px-1 text-[12px] font-extrabold text-sky-900">
                    ✓ แบบพร้อมผลิต {placed.length} ลาย
                    <span className="font-bold text-sky-700">· รวม {designTotalQty.toLocaleString("th-TH")} ชิ้น</span>
                  </p>
                  <div className="space-y-1.5">
                    {placed.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-sky-100">
                        {/* งานหลายด้าน = โชว์ทุกด้าน จะได้เห็นว่าใส่ครบแล้วจริง */}
                        {(d.sides?.length ? d.sides : d.artUrl ? [{ name: "", artUrl: d.artUrl, dpi: d.dpi }] : []).map((sd, k) => (
                          <span key={k} className="shrink-0 text-center">
                            <img
                              src={sd.artUrl}
                              alt={sd.name || `แบบที่ ${i + 1}`}
                              className="h-12 w-12 rounded-lg object-cover ring-1 ring-sky-200"
                            />
                            {sd.name && <span className="mt-0.5 block text-[9px] font-bold text-stone-400">{sd.name}</span>}
                          </span>
                        ))}
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] font-bold text-stone-800">ลายที่ {i + 1}</span>
                          <span className="block truncate text-[10px] text-stone-400">{d.summary}</span>
                        </span>
                        {/* จำนวนของลายนี้ — ทีมผลิตอ่านจากตรงนี้ว่าลายไหนกี่ชิ้น */}
                        <span className="flex shrink-0 items-center rounded-full bg-amber-50 ring-1 ring-amber-200">
                          <button
                            type="button"
                            onClick={() => bumpDesignQty(i, -1)}
                            className="h-8 w-8 rounded-l-full text-sm font-bold text-stone-600 hover:bg-amber-100"
                            aria-label={`ลดจำนวนลายที่ ${i + 1}`}
                          >
                            −
                          </button>
                          <input
                            value={d.qty}
                            onChange={(e) => setDesignQty(i, parseInt(e.target.value.replace(/\D/g, ""), 10) || 1)}
                            inputMode="numeric"
                            className="w-9 bg-transparent text-center text-xs font-bold focus:outline-none"
                            aria-label={`จำนวนลายที่ ${i + 1}`}
                          />
                          <button
                            type="button"
                            onClick={() => bumpDesignQty(i, 1)}
                            className="h-8 w-8 rounded-r-full text-sm font-bold text-stone-600 hover:bg-amber-100"
                            aria-label={`เพิ่มจำนวนลายที่ ${i + 1}`}
                          >
                            +
                          </button>
                        </span>
                        <button
                          type="button"
                          onClick={() => openStudio(i)}
                          title="แก้ไขแบบนี้"
                          className="shrink-0 rounded-full bg-white px-2 py-1.5 text-[11px] font-bold text-sky-700 ring-1 ring-sky-300 transition hover:bg-sky-100"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => removeDesign(i)}
                          title="ลบลายนี้"
                          className="shrink-0 rounded-full px-2 py-1.5 text-[11px] font-bold text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => openStudio(null)}
                    className="mt-2 w-full rounded-xl border-2 border-dashed border-sky-300 bg-white px-3 py-2 text-[12px] font-bold text-sky-700 transition hover:bg-sky-100"
                  >
                    ＋ เพิ่มลายอีกแบบ — เป็นสินค้าชิ้นใหม่ ไม่ใช่ด้านหลัง
                  </button>
                  {/*
                    กันเข้าใจผิดที่แพงที่สุดของหน้านี้ — จำนวนที่สั่ง = ผลรวมของทุกลาย
                    ลูกค้าที่คิดว่า "ลายที่ 2 คือด้านหลัง" จะได้ของมาสองเท่าโดยไม่รู้ตัว
                  */}
                  <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-stone-500">
                    แต่ละลาย = สินค้าคนละชิ้น จำนวนที่สั่งคือผลรวมของทุกลาย
                    {multiSide && (
                      <span className="mt-1 block font-bold text-amber-700">
                        ⚠️ งานหลายด้านที่เลือกไว้ ให้ใส่ทุกด้านอยู่ใน “ลายเดียวกัน” (ช่องด้านหน้า/ด้านหลังในจอวางลาย)
                        ถ้าแยกเป็นคนละลาย จำนวนที่ผลิตจะกลายเป็นสองเท่า
                      </span>
                    )}
                  </p>
                </div>
              )}
              {consultBlocked && (
                <button
                  type="button"
                  onClick={() => {
                    setConsultWarn(true);
                    document.getElementById("consult-box")?.scrollIntoView({ block: "center", behavior: "smooth" });
                  }}
                  className="mt-2 w-full rounded-xl bg-emerald-50 px-3 py-2 text-left text-xs font-bold text-emerald-800 ring-1 ring-emerald-200 transition hover:bg-emerald-100"
                >
                  💬 งานนี้ต้องคุยลายกับแอดมินก่อน — แตะเพื่อไปที่ขั้นตอนทักไลน์
                </button>
              )}
              {/* เพิ่งเพิ่มลงตะกร้าสำเร็จ (added) = เพิ่งล้าง artFiles ทิ้งเพื่อเตรียมรายการถัดไป
                  อย่าเด้งป้าย "ต้องแนบลาย" กลับมาทันที ไม่งั้นดูเหมือนระบบฟ้องทั้งที่เพิ่งสั่งสำเร็จ */}
              {artBlocked && !added && (
                <button
                  type="button"
                  onClick={() => {
                    setArtTouched(false);
                    setExtraOpen("art");
                    document.getElementById("art-link")?.scrollIntoView({ block: "center", behavior: "smooth" });
                  }}
                  className="mt-2 w-full rounded-xl bg-rose-50 px-3 py-2 text-left text-xs font-bold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
                >
                  🎨 ต้องแนบลายก่อนสั่ง — แตะเพื่ออัปโหลดรูป หรือใส่ลิงก์
                </button>
              )}
              {useCustom && customAsk ? (
                <p className="mt-2 text-sm font-semibold text-sky-700">
                  💬 สั่งได้เลย — แอดมินจะตีราคา
                  {customChat ? "ให้หลังคุยรายละเอียด" : `ขนาด ${customValid ? `${cW}×${cH} ${custom!.unit}` : "ที่ระบุ"} ให้หลังสั่ง`}
                  {" · "}
                  <a
                    href={LINE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-[#06C755] underline decoration-dotted underline-offset-2 hover:brightness-90"
                  >
                    หรือทักไลน์ถามราคาก่อน
                  </a>
                </p>
              ) : askQuote ? (
                <p className="mt-2 text-sm font-semibold text-sky-700">
                  💬 สั่งได้เลย — แอดมินจะตีราคาให้หลังเห็นรายละเอียดที่กรอก
                  {" · "}
                  <a
                    href={LINE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-[#06C755] underline decoration-dotted underline-offset-2 hover:brightness-90"
                  >
                    หรือทักไลน์ถามราคาก่อน
                  </a>
                </p>
              ) : matrix ? (
                <>
                  <p className="mt-2 text-sm text-stone-500">
                    {formatPrice(unitPrice)} / {matrix.unit} × {qty.toLocaleString("th-TH")}
                    {designFee > 0 && <> + Add on {formatPrice(designFee)}</>} ={" "}
                    <span className="font-extrabold text-amber-600">{formatPrice(unitPrice * qty + designFee)}</span>
                  </p>
                  {/* Add on ที่รวมอยู่ในราคาต่อหน่วยแล้ว — บอกว่าราคาต่อหน่วยที่เห็นมีอะไรบวกอยู่ข้างใน
                    * ⚠️ ต้องเขียนให้ชัดว่า "ไม่ต้องบวกเพิ่ม" — เขียนแบบ "รวม Add on ฿20 × 15 = ฿300" เฉย ๆ
                    *    ลูกค้าอ่านแล้วนึกว่ายอดข้างบนยังไม่ได้นับ Add on (ผู้ใช้ทัก 1 ก.ย. 69)
                    * เขียนเป็นประโยคเดียว "ราคานี้รวม X ฿n/ชิ้น (= ฿N ใน q ชิ้น) ไว้แล้ว ไม่ต้องบวกเพิ่ม"
                    * — ของเดิมบอกยอดรวมก่อนแล้วค่อยแจกแจง ทำให้พูดซ้ำสองรอบและมีวลี "ยอดด้านบน" ที่ไม่รู้ว่ายอดไหน
                    *   (ผู้ใช้เลือกสำนวนนี้ 2 ก.ย. 69) */}
                  {unitAddOnTotal > 0 && (
                    <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                      ราคานี้รวม{" "}
                      {unitAddOns.map((f, i) => (
                        <span key={`${f.label}-${i}`}>
                          {i > 0 ? " + " : ""}
                          <strong className="font-bold text-stone-600">{f.label}</strong> {formatPrice(f.amount)}
                        </span>
                      ))}
                      {/* หลายรายการ = ปิดท้ายด้วยยอดรวมต่อหน่วย ไม่งั้นลูกค้าต้องบวกเลขเอง */}
                      {unitAddOns.length > 1 && (
                        <> = <strong className="font-bold text-stone-600">{formatPrice(unitAddOnTotal)}</strong></>
                      )}
                      /{matrix.unit}
                      {/* สั่งหลายหน่วย = กางยอดรวมให้เทียบกับยอดจริงด้านบนได้ */}
                      {qty > 1 && (
                        <>
                          {" "}
                          (= {formatPrice(unitAddOnTotal * qty)} ใน {qty.toLocaleString("th-TH")} {matrix.unit})
                        </>
                      )}{" "}
                      ไว้แล้ว ไม่ต้องบวกเพิ่ม
                    </p>
                  )}
                  {/* แจกแจงค่าเพิ่มสั้น ๆ — ลูกค้าจะได้รู้ว่ายอดที่บวกมาเป็นค่าอะไร ไม่ต้องเดา */}
                  {designFee > 0 && feeLines.length > 0 && (
                    <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                      Add on ={" "}
                      {feeLines.map((f, i) => (
                        <span key={`${f.label}-${i}`}>
                          {i > 0 ? " + " : ""}
                          <strong className="font-bold text-stone-600">{f.label}</strong> {formatPrice(f.amount)}
                          {f.note ? ` (${f.note})` : ""}
                        </span>
                      ))}
                    </p>
                  )}
                </>
              ) : null}
              {/* จำนวนลายที่คละ — ต้องระบุก่อนสั่ง (แตะปุ่ม/พิมพ์เลข หรือแนบรูปให้ระบบนับอัตโนมัติ) */}
              {needDesignsChoice && (
                <div
                  id="designs-box"
                  className={`mt-2 rounded-xl px-3 py-2.5 ring-2 transition ${
                    designsSet
                      ? "bg-teal-50 ring-teal-200"
                      : designsWarn
                        ? "bg-rose-50 ring-rose-400"
                        : "bg-amber-50 ring-amber-300"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-extrabold text-teal-900">🎨 คละกี่ลาย:</span>
                    {!designsSet && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white ${designsWarn ? "bg-rose-500" : "bg-amber-500"}`}
                      >
                        ต้องระบุก่อนสั่ง *
                      </span>
                    )}
                    <div className="flex items-center rounded-full bg-white shadow-sm ring-1 ring-teal-200">
                      <button
                        type="button"
                        onClick={() => {
                          setDesignsTouched(true);
                          setDesignsDraft(null);
                          setDesigns((d) => Math.max(1, d - 1));
                        }}
                        disabled={designsSet && designs <= 1}
                        className="h-8 w-8 rounded-l-full text-sm font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-30"
                        aria-label="ลดจำนวนลาย"
                      >
                        −
                      </button>
                      {/* พิมพ์เลขเองได้ — ระหว่างพิมพ์ปล่อยช่องว่างได้ (ลบทิ้งแล้วพิมพ์ใหม่) ออกจากช่องค่อยปรับเป็นค่าที่ใช้จริง */}
                      <input
                        value={designsDraft ?? String(designs)}
                        onChange={(e) => {
                          setDesignsTouched(true);
                          const raw = e.target.value.replace(/\D/g, "").slice(0, 5);
                          setDesignsDraft(raw);
                          const n = parseInt(raw, 10);
                          if (Number.isFinite(n) && n >= 1) setDesigns(Math.min(n, Math.max(1, maxDesigns)));
                        }}
                        onBlur={() => setDesignsDraft(null)}
                        onFocus={(e) => {
                          // แตะที่ตัวเลขก็นับเป็น "ระบุแล้ว" — ลูกค้าลายเดียวยืนยันได้โดยไม่ต้องกดปุ่ม
                          setDesignsTouched(true);
                          e.target.select();
                        }}
                        inputMode="numeric"
                        aria-label="จำนวนลายที่คละ (พิมพ์เลขได้)"
                        className="w-12 bg-transparent text-center text-sm font-extrabold text-teal-900 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setDesignsTouched(true);
                          setDesignsDraft(null);
                          setDesigns((d) => Math.min(maxDesigns, d + 1));
                        }}
                        disabled={designs >= maxDesigns}
                        className="h-8 w-8 rounded-r-full text-sm font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-30"
                        aria-label="เพิ่มจำนวนลาย"
                      >
                        +
                      </button>
                    </div>
                    {artFiles.length > 0 && designs === artFiles.length && (
                      <span className="rounded-full bg-teal-600/10 px-2 py-0.5 text-[10px] font-bold text-teal-700" title="นับตามรูปลายที่แนบ — กด +/− เพื่อปรับเอง">
                        ✨ นับตามรูปที่แนบ
                      </span>
                    )}
                    {/* ไม่ต้องมีป้าย +฿ ตรงนี้ — บรรทัดสรุปด้านบนกับคำอธิบายใต้กล่องบอกยอดค่าคละอยู่แล้ว */}
                  </div>
                  {!designsSet && (
                    <p className={`mt-1 text-[10px] font-bold leading-snug ${designsWarn ? "text-rose-600" : "text-amber-700"}`}>
                      👉 กด + / − หรือแตะที่ตัวเลขเพื่อระบุจำนวนลายที่จะคละ — แนบรูปลายแล้วระบบจะนับให้อัตโนมัติ
                    </p>
                  )}
                  {mixRule ? (
                    /* กติกาคละแบบคิดต่อหน่วย — กางให้เห็นว่าคิดยังไง ลูกค้าจะได้ตัดสินใจเองได้ว่าคุ้มไหม */
                    (() => {
                      const unit = matrix?.unit ?? "ชิ้น";
                      const mt = mixTierFor(mixRule, qty);
                      const capped = Number.isFinite(mixMaxDesigns(mixRule, qty));
                      /* กระจายลายด้วยตัวเดียวกับที่คิดเงิน (mixSpread เลือกวิธีที่ถูกสุดให้ลูกค้า) — ยอดกางต้องตรงยอดเก็บ */
                      const spread = mixSpread(mixRule, designs, Math.max(1, qty));
                      const groups = [...new Set(spread)]
                        .sort((a, b) => b - a)
                        .map((n) => ({ n, units: spread.filter((x) => x === n).length, fee: mixUnitFee(mixRule, n, qty) }));
                      const total = designFee;
                      /*
                        กติกาแบบง่าย = ไม่มีค่าเหมา + รวม 1 ลาย/หน่วย → ราคาขึ้นกับ "ลายที่เกินจำนวนที่สั่ง" ตรง ๆ
                        แบ่งลงแผ่นยังไงราคาก็เท่ากัน จึงไม่ต้องกางรายแผ่นให้รก พูดตรง ๆ ไปเลย
                      */
                      const simple = mt.baseFee === 0 && mt.includedDesigns === 1;
                      const over = Math.max(0, designs - qty);
                      return (
                        <div className="mt-1 space-y-1 text-[11px] leading-relaxed text-teal-800">
                          {/* เพดานจากจำนวนชิ้นที่ใส่ได้จริงต่อแผ่น — บอกเหตุผลไว้ ไม่งั้นลูกค้างงว่าทำไมกด + ไม่ขึ้น */}
                          {unitCap ? (
                            <p className="text-teal-700">
                              📐 ขนาดที่เลือกได้ <strong className="font-bold">{unitCap.toLocaleString("th-TH")} ชิ้น</strong> ต่อ 1{" "}
                              {unit} — สั่ง {qty.toLocaleString("th-TH")} {unit} จึงคละได้สูงสุด{" "}
                              <strong className="font-bold">{capByPieces.toLocaleString("th-TH")} ลาย</strong>
                              {designs >= capByPieces ? " (ตอนนี้เต็มแล้ว — อยากคละมากกว่านี้ ต้องเพิ่มจำนวนแผ่นหรือลดขนาด)" : ""}
                            </p>
                          ) : null}
                          {simple ? (
                            <p>
                              💡 {qty.toLocaleString("th-TH")} {unit} = คละได้ {qty.toLocaleString("th-TH")} ลายโดยไม่คิดเพิ่ม
                              (ลายละ 1 {unit}) · ลายที่เกินคิดลายละ {formatPrice(mt.extraFee)}
                              {over > 0 ? (
                                <>
                                  {" "}
                                  — ตอนนี้เกิน <strong className="font-bold">{over.toLocaleString("th-TH")} ลาย</strong> ={" "}
                                  {over.toLocaleString("th-TH")}×{formatPrice(mt.extraFee)} ={" "}
                                  <strong className="font-bold text-amber-700">{formatPrice(total)}</strong>
                                </>
                              ) : (
                                <> — ตอนนี้ยังไม่เกิน จึงไม่มีค่าคละ</>
                              )}
                            </p>
                          ) : designs <= 1 ? (
                            <p>
                              💡 ลายเดียวไม่มีค่าคละ · ค่าคละคิดจาก<strong className="font-bold">จำนวนลายต่อ 1 {unit}</strong> —
                              {mt.baseFee > 0
                                ? // โควตาเหมาคลุมแค่ 2 ลาย = ช่วง "2–2" ซึ่งอ่านแล้วงง — เขียนเป็นเลขเดียว
                                  ` คละ ${
                                    mt.includedDesigns <= 2 ? "2" : `2–${mt.includedDesigns.toLocaleString("th-TH")}`
                                  } ลาย/${unit} = ${formatPrice(mt.baseFee)}/${unit}`
                                : ` เกิน ${mt.includedDesigns.toLocaleString("th-TH")} ลาย/${unit}`}
                              {mt.extraFee > 0 ? ` · เกินจากนั้นลายละ ${formatPrice(mt.extraFee)}` : ""}
                            </p>
                          ) : (
                            <>
                              <p>
                                🎨 {designs.toLocaleString("th-TH")} ลาย บน {qty.toLocaleString("th-TH")} {unit} → เฉลี่ยเป็น{" "}
                                <strong className="font-bold">
                                  {groups.map((g) => `${g.units} ${unit} × ${g.n} ลาย`).join(" + ")}
                                </strong>
                              </p>
                              <p>
                                {groups
                                  .map((g) => `${g.units}×${formatPrice(g.fee)}`)
                                  .join(" + ")}{" "}
                                = <strong className="font-bold text-amber-700">{formatPrice(total)}</strong>
                                {total === 0 ? " (ลายละ 1 " + unit + " พอดี ไม่ถือว่าคละ)" : ""}
                              </p>
                            </>
                          )}
                          {(() => {
                            // จำนวนแรกที่เริ่มบังคับ 1 ลาย/หน่วย — อ่านจากตารางถ้ามี ไม่มีก็ใช้ค่าเดี่ยวแบบเดิม
                            const onePerFrom =
                              (mixRule.tiers ?? []).filter((t) => t.onePerUnit).sort((a, b) => a.fromQty - b.fromQty)[0]
                                ?.fromQty ?? mixRule.onePerUnitFromQty;
                            if (capped)
                              return (
                                <p className="text-teal-700">
                                  📐 สั่งตั้งแต่ {onePerFrom?.toLocaleString("th-TH")} {unit}ขึ้นไป ต้องมีอย่างน้อย 1 ลายต่อ 1 {unit}
                                  — สั่ง {qty.toLocaleString("th-TH")} {unit} จึงคละได้สูงสุด{" "}
                                  <strong className="font-bold">{qty.toLocaleString("th-TH")} ลาย</strong>
                                </p>
                              );
                            if (onePerFrom)
                              return (
                                <p className="text-teal-700">
                                  ✨ ช่วงนี้คละได้อิสระ หลายลายอยู่บน{unit}เดียวกันได้ · ตั้งแต่{" "}
                                  {onePerFrom.toLocaleString("th-TH")} {unit}ขึ้นไป ต้องมีอย่างน้อย 1 ลายต่อ 1 {unit}
                                </p>
                              );
                            return null;
                          })()}
                        </div>
                      );
                    })()
                  ) : rate?.underMinPieceFee && rate.minPerDesign && !freeMix && designs > included ? (
                    // กติกา "คละไม่ถึงขั้นต่ำ คิดส่วนต่างชิ้นละ N" (เคสมือถือ) — ราคายังคิดเรทยอดรวม บอกที่มาของค่าคละตรง ๆ
                    (() => {
                      const unit = matrix?.unit ?? "ชิ้น";
                      const under = underMinPieces(qty, designs, rate.minPerDesign);
                      return (
                        <p className="mt-1 text-[11px] leading-relaxed text-teal-800">
                          💡 สั่ง {qty.toLocaleString("th-TH")} {unit} คละ {designs.toLocaleString("th-TH")} ลาย — จะมี{" "}
                          {under.toLocaleString("th-TH")} {unit}ที่อยู่ในลายที่ไม่ถึงลายละ{" "}
                          {rate.minPerDesign.toLocaleString("th-TH")} {unit} คิดส่วนต่าง{unit}ละ{" "}
                          {formatPrice(rate.underMinPieceFee)} ={" "}
                          <strong className="font-bold">+{formatPrice(under * rate.underMinPieceFee)}</strong> ·
                          ราคาต่อ{unit}ยังคิดเรทตามยอดรวมเหมือนเดิม
                        </p>
                      );
                    })()
                  ) : tierByDesign && rate?.minPerDesign && !freeMix && designs > included ? (
                    // คละเกินโควตาของเรท — ไม่บล็อก แต่ราคาตกไปคิดตามชิ้นต่อลาย (บอกลูกค้าตรง ๆ ว่าจ่ายเรทไหน)
                    (() => {
                      const unit = matrix?.unit ?? "ชิ้น";
                      const perDesign = Math.max(1, Math.floor(qty / Math.max(1, designs)));
                      const tierLabel = matrix ? matrix.tiers[tierIndex(matrix, perDesign)]?.label?.trim() : "";
                      return (
                        <p className="mt-1 text-[11px] leading-relaxed text-teal-800">
                          💡 คละ {designs.toLocaleString("th-TH")} ลาย เกินโควตาเรทนี้ (รวมในราคา {included.toLocaleString("th-TH")} ลาย ·
                          ขั้นต่ำลายละ {rate.minPerDesign.toLocaleString("th-TH")} {unit}) — ราคาจึงคิดตามชิ้นต่อลาย:
                          ตกลายละ {perDesign.toLocaleString("th-TH")} {unit} → ใช้เรท{" "}
                          <strong className="font-bold">
                            &ldquo;{tierLabel || `${perDesign.toLocaleString("th-TH")} ${unit}`}&rdquo;
                          </strong>{" "}
                          · ลดเหลือ {included.toLocaleString("th-TH")} ลาย (หรือเพิ่มจำนวนสั่ง) เมื่อไหร่ กลับไปเรทยอดรวมทันที
                        </p>
                      );
                    })()
                  ) : tierByDesign && !rate?.minPerDesign ? (
                    // สินค้าคิดเรทตามชิ้นต่อลาย — โชว์วิธีคิด + เรียกชื่อเรท/ช่วงตามที่แอดมินตั้งไว้ในตารางราคา
                    (() => {
                      const unit = matrix?.unit ?? "ชิ้น";
                      const perDesign = Math.max(1, Math.floor(qty / Math.max(1, designs)));
                      const tierLabel = matrix ? matrix.tiers[tierIndex(matrix, perDesign)]?.label?.trim() : "";
                      return (
                        <p className="mt-1 text-[11px] leading-relaxed text-teal-800">
                          💡 สั่ง {qty.toLocaleString("th-TH")} {unit} คละ {designs.toLocaleString("th-TH")} ลาย
                          = ตกลายละ {perDesign.toLocaleString("th-TH")} {unit} ราคาจึงคิดตามเรท{" "}
                          <strong className="font-bold">
                            &ldquo;{tierLabel || `${perDesign.toLocaleString("th-TH")} ${unit}`}&rdquo;
                          </strong>
                          {rate?.label ? ` ของ${rate.label}` : ""}
                          {designs > 1 ? " — อยากได้ราคาถูกลง ลองลดจำนวนลาย หรือเพิ่มจำนวนสั่งดูนะครับ" : ""}
                        </p>
                      );
                    })()
                  ) : freeMix && rate?.minPerDesign ? (
                    <p className="mt-1 text-[11px] leading-relaxed text-teal-800">
                      {/* เพดานลาย = จำนวน "ชิ้น" ไม่ใช่จำนวนหน่วยสั่ง — สินค้าขายเป็นเซ็ต (เซ็ตละ N ชิ้น) คละได้ตามชิ้น */}
                      ✨ ช่วงราคาปลีกคละลายได้อิสระ — ลายละกี่ชิ้นก็ได้ ไม่คิดเพิ่ม (สูงสุด {maxDesigns.toLocaleString("th-TH")} ลาย)
                      {rate.freeMixBelowQty
                        ? ` · สั่งตั้งแต่ ${rate.freeMixBelowQty.toLocaleString("th-TH")} ${pieceUnit}ขึ้นไป ขั้นต่ำลายละ ${rate.minPerDesign.toLocaleString("th-TH")}` +
                          (rate.underMinPieceFee
                            ? ` (ไม่ถึงคิดส่วนต่าง${pieceUnit}ละ +${formatPrice(rate.underMinPieceFee)})`
                            : "")
                        : ""}
                    </p>
                  ) : rate?.minPerDesign ? (
                  <p className="mt-1 text-[11px] leading-relaxed text-teal-800">
                    รวมในราคา {included.toLocaleString("th-TH")} ลาย (ขั้นต่ำลายละ {rate.minPerDesign.toLocaleString("th-TH")} {pieceUnit})
                    {rate.underMinPieceFee
                      ? /* กติกาเคสมือถือ — คละไม่ถึงขั้นต่ำได้ จ่ายส่วนต่างต่อชิ้นแทน */
                        ` · ลายไหนไม่ถึงลายละ ${rate.minPerDesign.toLocaleString("th-TH")} ${pieceUnit} คิดส่วนต่าง${pieceUnit}ละ +${formatPrice(rate.underMinPieceFee)}`
                      : rate.extraDesignFee
                      ? ` · คละเกินได้ ลายละ +${formatPrice(rate.extraDesignFee)}`
                      : hardMaxDesigns
                        ? /* โควตาล็อกไว้ — บอกเพดานตรง ๆ ว่าคละได้ถึงไหน และต้องทำยังไงถึงจะคละได้มากกว่านี้ */
                          ` · สั่ง ${qty.toLocaleString("th-TH")} ${matrix?.unit ?? "ชิ้น"} คละได้สูงสุด ${maxDesigns.toLocaleString("th-TH")} ลาย — อยากคละมากกว่านี้ ต้องเพิ่มจำนวนสั่ง (เพิ่มลายละ ${rate.minPerDesign.toLocaleString("th-TH")} ${pieceUnit})`
                        : tierByDesign
                          ? " · คละเกินได้เลย — ราคาจะปรับเป็นเรทตามชิ้นต่อลาย"
                          : " · เพิ่มลายได้ด้วยการเพิ่มจำนวนสั่ง"}
                  </p>
                  ) : null}
                  {/* แนบภาพลายมากกว่าจำนวนลายที่นับไว้ → เตือน (ราคา/เงื่อนไขคิดตามจำนวนลาย) */}
                  {artFiles.length > designs &&
                    (designs >= maxDesigns ? (
                      <p className="mt-1.5 rounded-xl bg-amber-100/80 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-900 ring-1 ring-amber-300">
                        ⚠️ แนบภาพลายมา {artFiles.length} รูป แต่จำนวน {qty.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"}{" "}
                        เรทนี้คละได้สูงสุด {maxDesigns.toLocaleString("th-TH")} ลาย —
                        ถ้าเป็นลายคนละแบบ เพิ่มจำนวนสั่งเพื่อคละได้มากขึ้น (หรือแอดมินจะทักยืนยันก่อนเริ่มงาน)
                      </p>
                    ) : (
                      <p className="mt-1.5 rounded-xl bg-amber-100/80 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-900 ring-1 ring-amber-300">
                        ⚠️ คุณแนบภาพลายมา {artFiles.length} รูป แต่เลือกคละ {designs} ลาย —
                        ถ้าเป็นลายคนละแบบ กด + เพิ่ม &ldquo;คละกี่ลาย&rdquo; ให้ตรงด้วยนะครับ
                        (ทางร้านนับจำนวนลายจริงจากไฟล์ ถ้าไม่ตรงแอดมินจะทักยืนยันก่อนเริ่มงาน)
                      </p>
                    ))}
                </div>
              )}
              {/*
                🔄 คละกี่ลาย "ด้านหลัง" — งานพิมพ์ 2 ด้าน (สินค้าที่ตั้ง backDesign ไว้)
                ใช้กติกา/เพดานชุดเดียวกับด้านหน้าเป๊ะ ๆ แค่คิดค่าคละเพิ่มอีกชุด
                ไม่บังคับให้ระบุ — ปกติด้านหลังใช้ลายเดียวกันทั้งหมด (= 1 ลาย ไม่มีค่าคละ)
              */}
              {needDesignsChoice && backOn && (
                <div id="back-designs-box" className="mt-2 rounded-xl bg-sky-50 px-3 py-2.5 ring-2 ring-sky-200">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-extrabold text-sky-900">🔄 ด้านหลังคละกี่ลาย:</span>
                    <div className="flex items-center rounded-full bg-white shadow-sm ring-1 ring-sky-200">
                      <button
                        type="button"
                        onClick={() => {
                          setBackDesignsDraft(null);
                          setBackDesigns((d) => Math.max(1, d - 1));
                        }}
                        disabled={backDesigns <= 1}
                        className="h-8 w-8 rounded-l-full text-sm font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-30"
                        aria-label="ลดจำนวนลายด้านหลัง"
                      >
                        −
                      </button>
                      <input
                        value={backDesignsDraft ?? String(backDesigns)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, "").slice(0, 5);
                          setBackDesignsDraft(raw);
                          const n = parseInt(raw, 10);
                          if (Number.isFinite(n) && n >= 1) setBackDesigns(Math.min(n, Math.max(1, maxDesigns)));
                        }}
                        onBlur={() => setBackDesignsDraft(null)}
                        onFocus={(e) => e.target.select()}
                        inputMode="numeric"
                        aria-label="จำนวนลายที่คละด้านหลัง (พิมพ์เลขได้)"
                        className="w-12 bg-transparent text-center text-sm font-extrabold text-sky-900 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setBackDesignsDraft(null);
                          setBackDesigns((d) => Math.min(maxDesigns, d + 1));
                        }}
                        disabled={backDesigns >= maxDesigns}
                        className="h-8 w-8 rounded-r-full text-sm font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-30"
                        aria-label="เพิ่มจำนวนลายด้านหลัง"
                      >
                        +
                      </button>
                    </div>
                    {/* ไม่ติดป้าย +฿ ตรงนี้ — บรรทัด "Add on = …" ด้านบนกางยอดค่าคละหน้า/หลังให้แล้ว (เหมือนกล่องด้านหน้า) */}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-sky-800">
                    {backMix
                      ? /* ด้านหลังมีกติกาของตัวเอง (ลายละ N บาท) — บอกราคาตรง ๆ ไม่ต้องให้ลูกค้าไปเทียบกับด้านหน้า */
                        (() => {
                          const t = mixTierFor(backMix, Math.max(1, qty));
                          const free = Math.max(1, t.includedDesigns);
                          return `ด้านหลังคิดค่าคละแยกจากด้านหน้าอีกชุดหนึ่ง — ${
                            free > 1 ? `คละ ${free.toLocaleString("th-TH")} ลายแรก ${formatPrice(t.baseFee)} · ลายถัดไป` : "ลายแรกไม่คิด · ลายถัดไป"
                          }ลายละ ${formatPrice(t.extraFee)} · `;
                        })()
                      : "ด้านหลังใช้เงื่อนไขคละลายชุดเดียวกับด้านหน้า — คิดค่าคละแยกอีกชุดหนึ่ง · "}
                    หลังเป็นลายเดียวกันทั้งหมดปล่อยไว้ที่ 1 ลาย (ไม่มีค่าคละ) ·
                    หลังเป็นคนละลายกี่แบบ กด + ให้ตรงด้วยนะครับ
                  </p>
                </div>
              )}
            </div>
          </div>

          {/*
            ═══ เพิ่มเติม (ไม่บังคับ) — ยุบไว้ ไม่ให้บังปุ่มซื้อ · โยนรูปลงหน้าไหนก็เปิดให้เอง ═══
            สินค้าที่ออกแบบบนเว็บได้ (มีเทมเพลต) ข้ามช่อง "แนบลายของคุณ" ไปเลย —
            ลายมาจากแบบที่ลูกค้าวางเองในจอสร้างงาน ไม่ต้องให้อัปไฟล์ซ้ำอีกทาง
          */}
          {/*
            ═══ 💬 คุยลายกับแอดมินก่อนสั่ง — งานปัก/งานตีลาย ═══
            งานที่ต้องเห็นแบบตรงกันก่อนเริ่มผลิต (ปักต้องแปลงไฟล์/ตีลายให้ดูก่อน)
            ทักไลน์ → คุยจบ → ติ๊กยืนยัน → ถึงจะกดสั่งได้ (แอดมินตั้งเป็น "แค่แนะนำ" ก็ได้)
            อยู่เหนือกล่องแนบลาย เพราะเป็นขั้นตอนแรกของงานประเภทนี้
          */}
          {consult && !studioMode && (
            <div
              id="consult-box"
              className={`mt-4 rounded-3xl p-4 ring-1 transition ${
                consultOk
                  ? "bg-emerald-50/70 ring-emerald-300"
                  : consultWarn
                    ? "bg-rose-50 ring-2 ring-rose-300"
                    : "bg-emerald-50/60 ring-emerald-200"
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg leading-none">💬</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-stone-700">
                    คุยลายกับแอดมินก่อนสั่ง
                    {consultOk ? (
                      <span className="ml-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">คุยแล้ว ✓</span>
                    ) : consultGate ? (
                      <span className="ml-2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">ต้องคุยก่อน *</span>
                    ) : (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">แนะนำ</span>
                    )}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-stone-600">{consult.note?.trim() || CONSULT_NOTE_DEFAULT}</p>
                </div>
              </div>

              <a
                href={LINE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#06C755] px-4 py-2 text-xs font-bold text-white transition hover:brightness-95"
              >
                💬 ทักไลน์ส่งลายให้แอดมินดู
              </a>

              <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-2xl bg-white/80 p-3 ring-1 ring-emerald-200">
                <input
                  type="checkbox"
                  checked={consultOk}
                  onChange={(e) => {
                    setConsultOk(e.target.checked);
                    if (e.target.checked) setConsultWarn(false);
                  }}
                  className="mt-0.5 h-4 w-4 accent-emerald-500"
                />
                <span className="text-xs">
                  <span className="block font-bold text-stone-700">คุยกับแอดมินเรียบร้อยแล้ว — ตกลงลายกันแล้ว</span>
                  <span className="block text-stone-500">ติ๊กช่องนี้แล้วกดสั่งได้เลย ทางร้านจะเริ่มงานตามลายที่ตกลงกันไว้</span>
                </span>
              </label>

              {consultOk && (
                <input
                  type="text"
                  value={consultRef}
                  onChange={(e) => setConsultRef(e.target.value.slice(0, 120))}
                  placeholder="ชื่อไลน์ที่ใช้คุย / เลขอ้างอิงที่แอดมินให้ไว้ (ไม่บังคับ)"
                  className="mt-2 w-full rounded-xl bg-white px-3.5 py-2 text-sm text-stone-700 ring-1 ring-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              )}

              {consultWarn && !consultOk && (
                <p className="mt-2 text-[11px] font-bold text-rose-600">
                  ⚠️ งานนี้ต้องคุยลายกับแอดมินก่อนนะครับ — ทักไลน์คุยให้จบ แล้วกลับมาติ๊กช่องด้านบน
                </p>
              )}
            </div>
          )}

          <div id="art-box" className="mt-4 overflow-hidden rounded-3xl bg-white ring-1 ring-stone-200">
            <button
              type="button"
              onClick={() => {
                setArtTouched(true);
                setExtraOpen((o) => (o === "art" ? null : "art"));
              }}
              aria-expanded={extraOpen === "art"}
              className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-sky-50/60"
            >
              <span className="text-lg leading-none">🎨</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-stone-700">
                  {/* สั่งหลายแผ่น: บอกให้ชัดว่าลายนี้เป็นของแผ่นไหน — แต่ละแผ่นใช้ลายของตัวเอง */}
                  {lotMinScope ? `แนบลายของ${lotWord}ที่ ${(sheets.length + 1).toLocaleString("th-TH")}` : "แนบลายของคุณ"}
                  {artProvided ? (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      {artFiles.length > 0 ? `แนบแล้ว ${artFiles.length} รูป` : "ใส่ลิงก์แล้ว"}
                    </span>
                  ) : artRequired && !staffOrdering ? (
                    /* โหมดแอดมินไม่บังคับแนบ — ลายมาทางไลน์/อีเมลอยู่แล้ว */
                    <span className="ml-2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">จำเป็น *</span>
                  ) : (
                    <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">แนะนำ</span>
                  )}
                </span>
                <span className="block text-[11px] text-stone-400">
                  {studioMode
                    ? "ทำไฟล์ลายมาเองแล้ว? ส่งไฟล์ตรงนี้ได้เลย ไม่ต้องกดเริ่มสร้าง"
                    : "อัปโหลดรูป (ลากมาวางได้) · หรือแนบลิงก์ไฟล์ / อีเมล"}
                </span>
              </span>
              <span className={`shrink-0 text-stone-400 transition ${extraOpen === "art" ? "rotate-180" : ""}`}>⌄</span>
            </button>
            {(extraOpen === "art" || (artBlocked && !artTouched)) && <div className="px-4 pb-4">
              {/* ── ลายของลูกค้า: อัปโหลดภาพตัวอย่าง + ลิงก์ไฟล์ต้นฉบับ ── */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setArtDrag(true);
                }}
                onDragLeave={(e) => {
                  // ออกจากกล่องจริง ๆ เท่านั้น (ไม่ใช่แค่ย้ายข้ามลูกใน)
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setArtDrag(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setArtDrag(false);
                  void uploadArtwork(e.dataTransfer.files);
                }}
                className={`mt-3 rounded-2xl p-3.5 transition ${
                  artDrag ? "bg-sky-100 ring-2 ring-dashed ring-sky-400" : "bg-sky-50/70 ring-1 ring-sky-200"
                }`}
              >
                {/* 1) อัปโหลดภาพ — หัวข้อใหญ่ซ้ำกับแถบพับด้านบน จึงตัดออก เข้าเรื่องเป็นขั้นตอนเลย */}
                <div className="flex items-center gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-600 text-[11px] font-bold text-white">1</span>
                  <p className="text-xs font-bold text-stone-700">
                    อัปโหลดภาพตัวอย่าง <span className="font-normal text-stone-400">— ใช้เป็นแนวทางให้กราฟฟิก</span>
                  </p>
                </div>

                {artFiles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {artFiles.map((f, i) => (
                      <div key={f.url} className="relative">
                        <a href={f.url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={f.preview ?? f.url}
                            alt={f.name}
                            className="h-20 w-20 rounded-xl object-cover ring-1 ring-sky-200"
                          />
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            if (f.preview) URL.revokeObjectURL(f.preview);
                            setArtFiles((cur) => cur.filter((_, j) => j !== i));
                          }}
                          className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow"
                          aria-label="ลบภาพนี้"
                        >
                          ✕
                        </button>
                        {f.w > 0 && (
                          <p className={`mt-0.5 w-20 text-center text-[9px] leading-tight ${Math.max(f.w, f.h) < 1500 ? "font-bold text-amber-600" : "text-stone-400"}`}>
                            {f.w}×{f.h}
                            {Math.max(f.w, f.h) < 1500 ? " · ภาพเล็ก" : ""}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {artFiles.some((f) => f.w > 0 && Math.max(f.w, f.h) < 1500) && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-700 ring-1 ring-amber-200">
                    ⚠️ มีภาพความละเอียดต่ำ — พิมพ์ออกมาอาจแตก/ไม่คม รบกวนแนบไฟล์ต้นฉบับเป็นลิงก์ในข้อ 2 ด้วยครับ
                  </p>
                )}

                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setArtDrag(true);
                  }}
                  onDrop={(e) => {
                    // หยุด bubble — กล่องนอกก็เป็น dropzone ถ้าไม่หยุดจะอัปซ้ำ 2 รอบ
                    e.preventDefault();
                    e.stopPropagation();
                    setArtDrag(false);
                    void uploadArtwork(e.dataTransfer.files);
                  }}
                  className={`mt-2 flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed px-3 py-3 text-center transition ${
                    artDrag ? "border-sky-500 bg-sky-100" : "border-sky-300 bg-white hover:border-sky-400 hover:bg-sky-50"
                  }`}
                >
                  {artBusy ? (
                    <span className="text-xs font-bold text-sky-700">กำลังอัปโหลด…</span>
                  ) : artDrag ? (
                    <span className="text-sm font-extrabold text-sky-700">⬇️ ปล่อยไฟล์ตรงนี้ได้เลย</span>
                  ) : (
                    <>
                      <span className="text-xs font-extrabold text-sky-700">🖼️ แตะเลือกไฟล์ · ลากมาวาง · ⌘/Ctrl+V</span>
                      <span className="text-[10px] font-normal text-stone-400">JPG / PNG / WEBP · ใส่ได้ไม่จำกัดจำนวน · ไฟล์ละไม่เกิน 15MB</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    disabled={artBusy}
                    onChange={(e) => {
                      void uploadArtwork(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                {artErr && <p className="mt-1.5 text-[11px] font-semibold text-rose-600">⚠️ {artErr}</p>}

                {/* 2) ลิงก์ไฟล์ต้นฉบับ */}
                <div className="mt-3.5 flex items-center gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-600 text-[11px] font-bold text-white">2</span>
                  <label htmlFor="art-link" className="text-xs font-bold text-stone-700">
                    ลิงก์ไฟล์งานจริง / อีเมล <span className="font-semibold text-sky-700">(แนะนำ — ได้ไฟล์คุณภาพเต็ม)</span>
                  </label>
                </div>
                <input
                  id="art-link"
                  type="text"
                  value={artLink}
                  onChange={(e) => {
                    setArtLink(e.target.value.slice(0, 500));
                    // ⚠️ กล่องนี้กางอัตโนมัติตอน artBlocked — พอพิมพ์ลิงก์ครบ artBlocked เป็น false
                    //    กล่องจะหุบทันทีต่อหน้าลูกค้า เหมือนสิ่งที่พิมพ์หายไป · ตรึงให้เปิดค้างไว้
                    setArtTouched(true);
                    setExtraOpen("art");
                  }}
                  placeholder="เช่น https://drive.google.com/…  หรือ  yourmail@gmail.com"
                  className="mt-1.5 w-full rounded-xl bg-white px-3.5 py-2 text-sm text-stone-700 ring-1 ring-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
                <p className="mt-1 text-[10px] leading-relaxed text-stone-400">
                  Google Drive / Dropbox / OneDrive หรืออีเมลที่ส่งไฟล์ไว้ — เราดึงไฟล์ต้นฉบับไปใช้ผลิต
                </p>
              </div>
            </div>}

            {/*
              หมายเหตุถึงร้าน — กางไว้ตลอด ไม่ต้องกดเปิด
              เดิมเป็นแถบพับที่หัวข้อเขียน "หมายเหตุถึงร้าน" ซ้ำกับป้ายในช่องอีกที
              ลูกค้าพิมพ์ช่องนี้บ่อย (สี/ข้อความบนงาน) ซ่อนไว้แล้วหาไม่เจอ → เหลือหัวข้อเดียว ช่องพร้อมพิมพ์เลย
            */}
            <div className="border-t border-stone-100 px-4 py-3.5">
              <label htmlFor="order-note" className="flex cursor-text items-center gap-2">
                <span className="text-lg leading-none">📝</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-stone-700">
                    หมายเหตุถึงร้าน <span className="font-semibold text-stone-400">(ไม่บังคับ)</span>
                  </span>
                  <span className="block text-[11px] text-stone-400">สีที่ต้องการ · ข้อความที่อยากให้ใส่ · รายละเอียดเพิ่มเติม</span>
                </span>
              </label>
              <textarea
                id="order-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="พิมพ์สิ่งที่อยากบอกร้านได้เลย — เช่น อยากได้สีเข้มกว่าในภาพ · ใส่ชื่อ “iDucky” ใต้โลโก้"
                className="mt-2 w-full resize-y rounded-2xl bg-white px-4 py-2.5 text-sm leading-relaxed text-stone-700 ring-1 ring-amber-200 transition placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
              {/* ตัวนับโผล่เมื่อเริ่มพิมพ์ · ใกล้เต็มเปลี่ยนเป็นแดงเตือนก่อนโดนตัดที่ 500
                  (ใช้ rose ไม่ใช่ amber — amber ถูกรีแมปเป็นฟ้าแบรนด์ใน globals.css แล้ว ไม่อ่านเป็นคำเตือน) */}
              {note.length > 0 && (
                <p
                  className={`mt-1 text-right text-[11px] tabular-nums ${
                    note.length >= 450 ? "font-bold text-rose-500" : "text-stone-400"
                  }`}
                >
                  {note.length}/500
                </p>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* รายละเอียดสินค้า โซน "ด้านล่าง" — เต็มความกว้าง (ค่าเริ่มต้นของทุกท่อนที่ไม่ได้ตั้ง slot) */}
      {detailsSection("wide", "mt-16")}

      {/* ═══ แท็บข้อมูลสินค้า — รายละเอียดเพิ่มเติม / วิธีสั่งงาน / การรับประกัน (แบบหน้า pricelist เว็บเดิม) ═══ */}
      {(product.tabs?.length ?? 0) > 0 && (
        <section className="mt-14">
          {/* ป้ายหัวโซน + แท็บเม็ดยา — โทน/ฟอนต์ชุดเดียวกับหน้าแรกและหน้าบัญชี (.acd-ttab) */}
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-3">
            {/* ป้ายหัวโซน — เดิมเป็นเม็ดยาสีกรมท่า ไปยืนคู่กับแท็บที่เลือกอยู่
                เลยดูเหมือนมีแท็บถูกเลือก 2 อัน */}
            <span className="ptab-secname">
              <i aria-hidden="true">📋</i>ข้อมูลสินค้าเพิ่มเติม
            </span>
            <div className="flex gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
              {product.tabs!.map((t, i) => {
                const on = i === Math.min(tabIndex, product.tabs!.length - 1);
                return (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    onClick={() => setTabIndex(i)}
                    aria-selected={on}
                    className={`whitespace-nowrap rounded-full px-[18px] py-2 font-display text-[.88rem] transition duration-200 ${
                      on
                        ? "bg-[var(--blue-deep)] text-white shadow-[0_6px_14px_rgba(44,129,196,.28)]"
                        : "bg-[var(--sky-50)] text-[var(--navy-soft)] ring-1 ring-[var(--sky-100)] hover:bg-[var(--sky-100)] hover:text-[var(--navy)]"
                    }`}
                  >
                    {t.title}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="ptab-panel">
            <ProductTabText tab={product.tabs![Math.min(tabIndex, product.tabs!.length - 1)]} />
          </div>
        </section>
      )}

      {/* คำถามที่พบบ่อย (AEO) */}
      {faqs.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-5 text-xl font-extrabold text-amber-950">❓ คำถามที่พบบ่อย</h2>
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <details key={i} className="group rounded-2xl border border-amber-100 bg-white p-4 open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between font-bold text-amber-950">
                  {f.q}
                  <span className="ml-3 text-amber-400 transition group-open:rotate-45">＋</span>
                </summary>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-600">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* สินค้าใกล้เคียง — แถบเลื่อนซ้าย-ขวา ดูได้มากกว่าที่จอแสดงพอดี */}
      {related.length > 0 && (
        <RelatedCarousel
          title={`${category.emoji} สินค้าอื่นในหมวด${category.name}`}
          products={related}
        />
      )}

      {/* ═══ แถบซื้อลอยล่างจอ (มือถือ) — ราคาปัจจุบัน + ปุ่มสั่ง ไม่ต้องเลื่อนกลับขึ้นไป ═══ */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-amber-100 bg-white/95 px-4 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur transition-transform duration-200 lg:hidden ${
          showBuyBar ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] text-stone-400">
              {/* 📦 สั่งหลายแผ่นในครั้งเดียว — แถบล่างมือถือบอกยอดรวมทั้งรอบ ไม่ใช่แค่แผ่นที่กำลังตั้งค่า */}
              {sheetRoll
                ? `${sheetRoll.qty.toLocaleString("th-TH")} ${matrix?.unit ?? "ชิ้น"} · ${(sheets.length + 1).toLocaleString("th-TH")} รายการ`
                : `${qty.toLocaleString("th-TH")} ${matrix?.unit ?? "ชิ้น"}`}
              {artFiles.length > 0 ? ` · แนบลาย ${artFiles.length} รูป` : ""}
            </p>
            {askQuote || (useCustom && customAsk) ? (
              <p className="text-sm font-extrabold leading-tight text-sky-700">💬 รอแอดมินตีราคา</p>
            ) : (
              <>
                <p className="text-lg font-extrabold leading-tight text-amber-600">
                  {formatPrice(sheetRoll ? sheetRoll.total : unitPrice * qty + designFee)}
                </p>
                {/* 📦 ยังไม่ครบขั้นต่ำของรอบผลิต — บอกตรงแถบล่างด้วย ลูกค้ามือถือไม่ต้องเลื่อนหา */}
                {lotShortNeed > 0 && (
                  <p className="truncate text-[10px] font-bold text-amber-700">
                    📦 ขาดอีก {lotShortNeed.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"} — เพิ่มได้ แต่ยังยืนยันคำสั่งซื้อไม่ได้
                  </p>
                )}
                {/* 🧮 แถบล่างมือถือ — บอกสั้น ๆ ว่าจะรวมล็อตกับของในตะกร้า (ช่วงปลีกยังไม่รวม ไม่ต้องโชว์) */}
                {lotPreview && !lotPreview.retailLine && (
                  <p className="truncate text-[10px] font-semibold text-emerald-700">
                    🧮 รวมกับในตะกร้าเป็น {lotPreview.combinedQty.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"}
                    {lotPreview.unitPrice < unitPrice && <> → {formatPrice(lotPreview.unitPrice)}/{matrix?.unit ?? "ชิ้น"}</>}
                  </p>
                )}
              </>
            )}
          </div>
          {/* แถบล่างมือถือ — ยังไม่วางลาย = ปุ่มเริ่มสร้าง · มีสเปคพักไว้แล้วก็ต้องสั่งของที่เก็บไว้ได้ด้วย */}
          {studioNeedsDesign && (
            <button
              type="button"
              onClick={() => openStudio(null)}
              className="ml-auto shrink-0 rounded-full bg-sky-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-sky-700"
            >
              🎨 เริ่มสร้าง
            </button>
          )}
          {(!studioNeedsDesign || sheets.length > 0) && (
            <button
              type="button"
              onClick={handleAdd}
              disabled={
                !sheets.length &&
                ((useCustom && !customValid) || !!customSizeErr || artBlocked || inputErrors.length > 0 || belowMin)
              }
              className={`ml-auto shrink-0 rounded-full px-6 py-3 text-sm font-bold text-white shadow-lg transition ${
                added ? "bg-emerald-500" : "bg-amber-400 hover:bg-amber-500 disabled:opacity-40"
              }`}
            >
              {added
                ? "✓ เพิ่มแล้ว!"
                : sheetRoll
                  ? `🛒 สั่ง ${sheetRoll.qty.toLocaleString("th-TH")} ${matrix?.unit ?? "ชิ้น"}`
                : inputHardError || inputErrors.length > 0
                  ? `⚠ ติดที่ “${(inputHardError ?? inputErrors[0]).label}”`
                : consultBlocked
                  ? "💬 คุยลายก่อน"
                  : artBlocked
                    ? "🎨 อัปโหลดรูป/ใส่ลิงก์ลาย"
                      : belowMin
                        ? `⚠ ขั้นต่ำ ${hardMinNeed.toLocaleString("th-TH")} ชิ้น`
                        : "🛒 เพิ่มลงตะกร้า"}
            </button>
          )}
        </div>
      </div>
      {/* กันแถบลอยบังเนื้อหาท้ายหน้า */}
      <div className="h-20 lg:hidden" aria-hidden />

      {/* 🔒 เรทนี้ยังใช้ไม่ได้ — บอกเหตุผล + ปรับจำนวนให้ถึงขั้นต่ำในคลิกเดียว */}
      {rateLock && (() => {
        const need = rateLock.minQty ?? 1;
        const unit = rateLock.pricing.unit;
        const short = Math.max(0, need - qty);
        // ราคาต่อหน่วย "ถ้าสั่งครบขั้นต่ำ" ของเรทที่กด เทียบกับเรทที่ใช้อยู่ตอนนี้ (ที่จำนวนเดียวกัน)
        const atNeed = unitPriceFor(product, { ...effective, [RATE_LABEL]: rateLock.label }, need);
        const curAtNeed = rate ? unitPriceFor(product, { ...effective, [RATE_LABEL]: rate.label }, need) : 0;
        const save = atNeed > 0 && curAtNeed > atNeed ? curAtNeed - atNeed : 0;
        return (
          <div
            className="fixed inset-0 z-[90] flex items-end justify-center bg-stone-900/50 p-4 backdrop-blur-sm sm:items-center"
            onClick={() => setRateLock(null)}
            role="dialog"
            aria-modal="true"
            aria-label={`${rateLock.label} ยังใช้ไม่ได้`}
          >
            <div
              className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl ring-1 ring-stone-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-50 text-xl ring-1 ring-amber-200">
                  🔒
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-extrabold leading-snug text-stone-800">
                    “{rateLock.label}” ยังใช้ไม่ได้ตอนนี้
                  </h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-stone-600">
                    เรทนี้ต้องสั่งรวมอย่างน้อย{" "}
                    <strong className="text-stone-800">
                      {need.toLocaleString("th-TH")} {unit}
                    </strong>{" "}
                    — ตอนนี้คุณสั่ง {qty.toLocaleString("th-TH")} {unit}
                    {short > 0 && (
                      <>
                        {" "}ยังขาดอีก{" "}
                        <strong className="text-amber-700">
                          {short.toLocaleString("th-TH")} {unit}
                        </strong>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {rateLock.desc && (
                <p className="mt-3 rounded-2xl bg-stone-50 px-3 py-2 text-[12px] leading-relaxed text-stone-600 ring-1 ring-stone-100">
                  {rateLock.desc}
                </p>
              )}

              {save > 0 && (
                <p className="mt-2 rounded-2xl bg-teal-50 px-3 py-2 text-[12px] font-bold leading-relaxed text-teal-800 ring-1 ring-teal-100">
                  ✨ สั่งครบ {need.toLocaleString("th-TH")} {unit} จะได้ {formatPrice(atNeed)}/{unit} — ถูกกว่าเรทที่ใช้อยู่{" "}
                  {formatPrice(save)}/{unit}
                </p>
              )}

              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setQty(need);
                    setQtyText(String(need));
                    setRateTouched(true);
                    setRateLabel(rateLock.label);
                    setAutoRateNote("");
                    jumpToImage(rateLock.imageSrc);
                    setRateLock(null);
                  }}
                  className="rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-amber-600"
                >
                  ปรับเป็น {need.toLocaleString("th-TH")} {unit} แล้วใช้เรทนี้
                </button>
                <button
                  type="button"
                  onClick={() => setRateLock(null)}
                  className="rounded-2xl px-4 py-2 text-sm font-bold text-stone-500 transition hover:bg-stone-100 hover:text-stone-700"
                >
                  ไว้ก่อน ใช้เรทเดิม
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 🔍 ดูรูปขนาดใหญ่ (กดพื้นหลัง/ปุ่มปิด/Esc เพื่อออก · ลูกศรซ้ายขวาเลื่อนรูป) */}
      {zoomSrc && (() => {
        const zi = zoomList.indexOf(zoomSrc);
        const canFlip = zi !== -1 && zoomList.length > 1;
        return (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setZoomSrc("")}
          role="dialog"
          aria-modal="true"
          aria-label="ดูรูปขนาดใหญ่"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomSrc}
            alt=""
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {canFlip && (
            <>
              {([
                { d: -1, side: "left-3", glyph: "‹", label: "ดูรูปก่อนหน้า" },
                { d: 1, side: "right-3", glyph: "›", label: "ดูรูปถัดไป" },
              ] as const).map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    zoomStep(a.d);
                  }}
                  aria-label={a.label}
                  className={`absolute ${a.side} top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/90 pb-1 text-3xl font-bold leading-none text-stone-600 shadow-lg transition hover:bg-white hover:text-amber-600`}
                >
                  {a.glyph}
                </button>
              ))}
              <span className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs font-bold tabular-nums text-stone-700 shadow-lg">
                {zi + 1}/{zoomList.length}
              </span>
            </>
          )}
          <button
            type="button"
            onClick={() => setZoomSrc("")}
            className="absolute right-4 top-4 rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-stone-700 shadow-lg transition hover:bg-white"
          >
            ✕ ปิด
          </button>
        </div>
        );
      })()}

      {/* 🧩 จอวางรูปแบบมีช่อง (Theme) — ใช้เมื่อเทมเพลตกำหนดช่องไว้ */}
      {slotStudio && studioTarget?.anySlots ? (
        <SlotStudio
          open
          onClose={() => {
            setSlotStudio(false);
            setEditIndex(null);
          }}
          title={studioTarget.title}
          sides={studioTarget.sides}
          requireAll={studioTarget.slotsRequired}
          perSheet={studioTarget.perSheet}
          initial={editIndex !== null ? placed[editIndex]?.slotShots : undefined}
          uploadSource={uploadOne}
          onApply={applySlots}
        />
      ) : null}

      {/* 🖼 จอวางลายบนเทมเพลต — เปิดจากการ์ดเทมเพลตด้านบน */}
      {studio && (
        <TemplateStudio
          open
          onClose={() => setStudio(null)}
          title={studio.title}
          frame={studio.frame}
          guideUrl={studio.guideUrl}
          skinUrl={studio.skinUrl}
          tplUrl={studio.tplUrl}
          perSheet={studio.perSheet}
          initial={studio.initial}
          onApply={applyStudio}
        />
      )}
      </div>
      </div>
    </div>
  );
}

/**
 * สินค้าอื่นในหมวดเดียวกัน — แถบเลื่อนซ้าย-ขวา (มือถือปัดนิ้ว · จอใหญ่มีปุ่มลูกศร)
 * การ์ดกว้างคงที่ให้ตัวถัดไปโผล่ครึ่งใบ ลูกค้ารู้เองว่าเลื่อนต่อได้
 */
function RelatedCarousel({ title, products }: { title: string; products: Product[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  // ปุ่มลูกศรโชว์เฉพาะฝั่งที่ยังเลื่อนต่อได้ (สุดขอบแล้วจางหาย)
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const update = () => {
      setCanLeft(el.scrollLeft > 8);
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [products.length]);

  const nudge = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section className="mt-14">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold text-amber-950">{title}</h2>
        {products.length > 2 && (
          <span className="shrink-0 text-xs font-semibold text-stone-400 md:hidden">เลื่อนดูเพิ่ม →</span>
        )}
      </div>
      <div className="relative">
        <div
          ref={railRef}
          className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] md:mx-0 md:scroll-px-0 md:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {products.map((p) => (
            <div key={p.id} className="w-[45vw] max-w-[224px] shrink-0 snap-start sm:w-52 md:w-56 [&>a]:h-full">
              <ProductCard product={p} />
            </div>
          ))}
        </div>
        {canLeft && (
          <button
            type="button"
            aria-label="เลื่อนดูสินค้าก่อนหน้า"
            onClick={() => nudge(-1)}
            className="absolute -left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-lg font-bold text-amber-600 shadow-lg ring-1 ring-amber-100 transition hover:bg-amber-50 md:flex"
          >
            ‹
          </button>
        )}
        {canRight && (
          <button
            type="button"
            aria-label="เลื่อนดูสินค้าถัดไป"
            onClick={() => nudge(1)}
            className="absolute -right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-lg font-bold text-amber-600 shadow-lg ring-1 ring-amber-100 transition hover:bg-amber-50 md:flex"
          >
            ›
          </button>
        )}
      </div>
    </section>
  );
}
