"use client";

import { productAutoSeo } from "@/lib/auto-seo";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  activeMatrix,
  allowedChoices,
  customUnitPrice,
  DESIGN_LABEL,
  formatPrice,
  formatPriceRange,
  getCategory,
  includedDesigns,
  isFreeMix,
  matrixChoiceAvailable,
  maxDesignsFor,
  optionExtraApplies,
  optionVisible,
  priceMatrixKey,
  priceRange,
  PRODUCTS,
  RATE_LABEL,
  resolveSelections,
  choiceBadgeOf,
  shortComboParts,
  smallQtyFeeOf,
  groupAddOf,
  tierIndex,
  tierQtyFor,
  unitPriceFor,
  needsStockCheck,
  artworkIsRequired,
  isMultiOption,
  hasChoiceQty,
  choiceQtyMax,
  selectedPicks,
  formatMultiPick,
  joinMultiPicks,
  type MultiPick,
  type Product,
  type ProductOption,
} from "@/lib/products";
import { LINE_URL } from "@/components/LineButton";
import {
  fileHref,
  filesForSelections,
  formatFileSize,
  isMultiSide,
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
import { canAccessAdmin } from "@/lib/auth";
import { fetchProduct } from "@/lib/product-repo";
import ProductVisual from "@/components/ProductVisual";
import ProductCard from "@/components/ProductCard";

/**
 * แยก "ข้อควรทราบ" เป็นข้อ ๆ — บรรทัดที่ขึ้นต้นด้วย * / ** / *** = ข้อใหม่
 * บรรทัดถัดไปที่ไม่ได้ขึ้นต้นด้วย * ถือเป็นบรรทัดต่อของข้อเดิม (คงการขึ้นบรรทัดไว้)
 */
/**
 * เนื้อหาในแท็บข้อมูลสินค้า — บรรทัดขึ้นต้น "•" = รายการมีจุดนำ ·
 * บรรทัดที่ครอบ/ลงท้ายด้วย "::" = หัวข้อย่อยตัวหนา · บรรทัดว่าง = เว้นช่วง
 */
function ProductTabText({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-stone-600">
      {text.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="h-2" />;
        if (t.startsWith("•"))
          return (
            <p key={i} className="flex gap-2.5 pl-1">
              <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
              <span className="min-w-0 flex-1">{t.replace(/^•\s*/, "")}</span>
            </p>
          );
        if (/^::.*::$|::$/.test(t))
          return (
            <p key={i} className="pt-2 text-[15px] font-extrabold text-sky-800">
              {t.replace(/^::|::$/g, "").trim()}
            </p>
          );
        return <p key={i}>{t}</p>;
      })}
    </div>
  );
}

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
 * ตัวเลือกตั้งต้นตอนเปิดหน้าสินค้า — กลุ่มปกติเริ่มที่ตัวแรก
 * กลุ่ม "ติ๊กได้หลายอย่าง" เริ่มที่ยังไม่ติ๊กอะไรเลย (ของเสริม ไม่ควรบวกเงินให้เอง)
 */
function initialSelections(options: ProductOption[]): Record<string, string> {
  return Object.fromEntries(
    options.map((o) => [o.label, isMultiOption(o) ? "" : (o.choices[0]?.name ?? "")])
  );
}

export default function ProductDetail({
  product: initialProduct,
  /** 📐 เทมเพลตไฟล์งานที่ลูกค้าโหลดไปวางลายได้ (ดึงมาให้แล้วจากเซิร์ฟเวอร์) */
  templates = [],
  /** เปิดดูสินค้าที่ "ปิดการมองเห็น" อยู่ (เฉพาะทีมงานที่ล็อกอิน) — ขึ้นแถบเตือนไว้กันเข้าใจผิด */
  preview = false,
}: {
  product: Product;
  templates?: DesignTemplate[];
  preview?: boolean;
}) {
  const [product, setProduct] = useState<Product>(initialProduct);
  const category = getCategory(product.category);
  const { addItem } = useCart();
  const [imageIndex, setImageIndex] = useState(0);
  // แท็บข้อมูลสินค้า (รายละเอียดเพิ่มเติม / วิธีสั่งงาน ฯลฯ)
  const [tabIndex, setTabIndex] = useState(0);
  const [qty, setQty] = useState(1);
  // 🔍 รูปที่กำลังเปิดดูขนาดใหญ่ (lightbox) — ว่าง = ปิดอยู่
  const [zoomSrc, setZoomSrc] = useState("");
  useEffect(() => {
    if (!zoomSrc) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoomSrc("");
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [zoomSrc]);
  // ข้อความในช่องจำนวนระหว่างพิมพ์ — แยกจาก qty เพื่อให้ลบจนว่างแล้วพิมพ์ใหม่ได้
  const [qtyText, setQtyText] = useState("1");
  useEffect(() => {
    // qty เปลี่ยนจากปุ่ม +/− หรือเด้งตามขั้นต่ำเรท → ปรับข้อความตาม (ตอนช่องว่างอยู่ = กำลังพิมพ์ ไม่ทับ)
    setQtyText((t) => (t === "" ? t : String(qty)));
  }, [qty]);
  const [added, setAdded] = useState(false);
  /** ล็อกกันกดปุ่ม "เพิ่มลงตะกร้า" รัว ๆ (แตะสองทีบนมือถือ = ได้สองรายการ) */
  const addLock = useRef(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>(() =>
    initialSelections(initialProduct.options)
  );
  // งานกำหนดขนาดเอง (custom)
  const [useCustom, setUseCustom] = useState(false);
  const [customW, setCustomW] = useState("");
  const [customH, setCustomH] = useState("");
  // หมายเหตุถึงร้าน (แนบไปกับรายการในตะกร้า)
  const [note, setNote] = useState("");
  // ลิงก์ไฟล์ลาย / อีเมล (ไม่อัปโหลดขึ้นเว็บ — กันไฟล์ถูกบีบอัด)
  const [artLink, setArtLink] = useState("");
  // ภาพลายที่ลูกค้าแนบขึ้นเว็บ (เก็บไฟล์ต้นฉบับ — ใช้เป็นแนวทางให้กราฟฟิก)
  const [artFiles, setArtFiles] = useState<{ url: string; name: string; w: number; h: number; hash?: string }[]>([]);
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
  // ส่วน "เพิ่มเติม" ยุบไว้ทีละอัน — ไม่ให้ฟอร์มที่ไม่บังคับดันปุ่มซื้อตกจอ
  const [extraOpen, setExtraOpen] = useState<"art" | "note" | null>(null);
  // สินค้าที่บังคับแนบลาย → เปิดกล่องค้างไว้จนกว่าลูกค้าจะแตะปิดเอง
  const [artTouched, setArtTouched] = useState(false);
  // แถบซื้อลอยล่างจอ (มือถือ) — โผล่เมื่อกล่องสั่งซื้อหลักเลื่อนพ้นจอ
  const orderBoxRef = useRef<HTMLDivElement>(null);
  const [showBuyBar, setShowBuyBar] = useState(false);

  // โหลดเวอร์ชันล่าสุด (Supabase หรือ localStorage) — ถ้ามีให้ใช้แทนข้อมูลตั้งต้น
  useEffect(() => {
    let active = true;
    fetchProduct(initialProduct.id).then((m) => {
      if (active && m) {
        setProduct(m);
        setSelections(initialSelections(m.options));
        setImageIndex(0);
      }
    });
    return () => {
      active = false;
    };
  }, [initialProduct]);

  // ปรับตามกฎเงื่อนไขเสมอ เช่น กระดาษที่เคลือบไม่ได้ → เคลือบถูกบังคับเป็น "ไม่เคลือบ"
  const resolved = useMemo(
    () => resolveSelections(product, selections),
    [product, selections]
  );

  // ── หลายเรทราคา (เช่น พิน: คละดีเทล / ไม่คละดีเทล) ──
  const rates = useMemo(() => product.priceRates ?? [], [product]);
  const [rateLabel, setRateLabel] = useState("");
  // ลูกค้ากดเลือกเรทเอง = หยุดสลับอัตโนมัติ (เช่น ตั้งใจอยู่เรท 1 เพื่อคละดีเทล)
  const [rateTouched, setRateTouched] = useState(false);
  const rate = rates.length ? (rates.find((r) => r.label === rateLabel) ?? rates[0]) : undefined;
  // เรทที่เลือกติดไปกับ selections → ตะกร้า/ออเดอร์เห็นเป็น "เรทราคา: …" และคิดราคาตามเรทนั้น
  // (จำนวนลายเติมทีหลังตรง effectiveWithDesigns — ต้องประกาศ designs ก่อน)
  const effective = useMemo(
    () => (rate ? { ...resolved, [RATE_LABEL]: rate.label } : resolved),
    [resolved, rate]
  );
  const rateMinQty = rate?.minQty ?? 1;
  /**
   * ร้านรับสั่งขั้นต่ำ 1 ชิ้นเสมอ — ห้ามบล็อกการสั่งเพราะ "เรทที่เลือกไว้" มีขั้นต่ำสูง
   * ลูกค้ากดเลือกเรทส่งเองแล้วลดจำนวนลงต่ำกว่าขั้นต่ำ → สลับลงเรทที่รับจำนวนนั้นได้ (ปกติคือเรทปลีก)
   * ราคาจึงถูกต้องเสมอ และปุ่มสั่งซื้อไม่ตายอีก
   */
  useEffect(() => {
    if (useCustom || rates.length === 0 || qty >= rateMinQty) return;
    const fit = [...rates]
      .filter((r) => (r.minQty ?? 1) <= qty)
      .sort((a, b) => (b.minQty ?? 1) - (a.minQty ?? 1))[0];
    if (fit && fit.label !== rate?.label) setRateLabel(fit.label);
  }, [qty, rateMinQty, useCustom, rates, rate]);

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
  // ลายที่รวมในราคาตามจำนวนที่สั่ง · เรทที่เปิด extraDesignFee คละเกินได้ (จ่ายเพิ่มต่อลาย ไม่เกินจำนวนชิ้น)
  const included = rate?.minPerDesign ? includedDesigns(rate, qty) : 0;
  // สินค้าที่คิดเรทตามชิ้นต่อลาย: คละได้ถึงจำนวนชิ้นเสมอ (เกินโควตาเรท = ราคาปรับเป็นเรทต่อลายเอง ไม่บล็อก)
  const maxDesigns = tierByDesign ? qty : rate?.minPerDesign ? maxDesignsFor(rate, qty) : 0;
  // "ระบุจำนวนลายแล้ว" = แตะ +/− หรือพิมพ์เลขเอง หรือแนบรูปให้ระบบนับ — สินค้าที่มีระบบลายต้องระบุก่อนสั่ง
  // ยกเว้นตอนคละได้แค่ลายเดียว (เช่น สั่ง 1 ชิ้น) — มีทางเลือกเดียวอยู่แล้ว ถือว่าระบุแล้ว ไม่ต้องให้กดยืนยัน
  const designsSet = designsTouched || artFiles.length > 0 || maxDesigns <= 1;
  /** สินค้านี้มีระบบจำนวนลาย → ลูกค้าต้องระบุจำนวนลายก่อนสั่ง */
  const needDesignsChoice = ((rate?.minPerDesign ?? 0) > 0 || tierByDesign) && maxDesigns >= 1;
  const freeMix = !!rate && rate.minPerDesign != null && isFreeMix(rate, qty);
  useEffect(() => {
    if (maxDesigns > 0) setDesigns((d) => Math.min(Math.max(1, d), maxDesigns));
  }, [maxDesigns]);
  // ✨ แนบรูปมากกว่าจำนวนที่สั่ง (สินค้าคิดเรทต่อลาย) → เพิ่มจำนวนชิ้นให้อัตโนมัติขั้นต่ำลายละ 1 ชิ้น
  // ไม่งั้นเพดานจำนวนลาย (= จำนวนชิ้น) จะกดไว้ ทำให้นับลายตามรูปไม่ได้ (แนบ 2 รูปแต่ค้าง 1 ลาย)
  useEffect(() => {
    if (!tierByDesign || artFiles.length < 1) return;
    setQty((q) => Math.max(q, artFiles.length));
  }, [artFiles.length, tierByDesign]);

  // ✨ นับจำนวนลายอัตโนมัติตามรูปลายที่แนบ
  // ยังไม่เคยปรับเอง = ตามจำนวนรูปเป๊ะ · เคยปรับเองแล้ว = ไม่ลดให้ แต่ถ้าแนบรูป "เกิน" ที่ตั้งไว้
  // ดันขึ้นตามรูปเสมอ (ทางร้านนับลายจากไฟล์จริง — ราคาต้องขยับตาม ไม่ใช่แค่ป้ายเตือน)
  useEffect(() => {
    if (maxDesigns < 1) return;
    setDesigns((d) => {
      const target = designsTouched ? Math.max(d, artFiles.length) : Math.max(artFiles.length, 1);
      const next = Math.min(Math.max(1, target), maxDesigns);
      if (next !== d) setDesignsDraft(null); // ค่าเปลี่ยนเพราะนับรูป — ล้างข้อความค้างในช่องให้โชว์ค่าจริง
      return next;
    });
  }, [artFiles.length, maxDesigns, designsTouched]);
  const extraDesigns = rate?.extraDesignFee ? Math.max(0, designs - included) : 0;
  const designFee = extraDesigns * (rate?.extraDesignFee ?? 0);
  // จำนวนลายติดไปกับ selections ตั้งแต่ตอนดูราคา → ราคาสด/ตะกร้า/ออเดอร์คิดเรทตามชิ้นต่อลายตรงกัน
  const effectiveWithDesigns = useMemo(
    () =>
      (rate?.minPerDesign || tierByDesign) && designs >= 1
        ? { ...effective, [DESIGN_LABEL]: `${designs} ลาย` }
        : effective,
    [effective, rate, tierByDesign, designs]
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
        return maxDesignsFor(r, qty) >= needDesigns;
      };
      /**
       * เรทนี้ยังขายตัวเลือกที่ลูกค้าเลือกอยู่ไหม (เช่น เรท 2 ไม่มีตาราง 1mm)
       * ถ้าไม่เช็ค ระบบจะเด้งไปเรทที่ไม่มีของ แล้วตัวเลือกที่เลือกไว้จะหายไปเฉย ๆ
       */
      const fitsSelections = (r: (typeof rates)[number]) =>
        r.pricing.driverLabels.every((label) => {
          const chosen = effective[label];
          return !chosen || matrixChoiceAvailable(r.pricing, label, chosen);
        });
      const qualified = rates.filter((r) => qty >= (r.minQty ?? 1));
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
  }, [qty, rates, rateTouched, designs, designsTouched, artFiles.length, rate, effective]);

  const custom = product.custom?.enabled ? product.custom : null;
  const cW = parseFloat(customW), cH = parseFloat(customH);
  /** โหมด "คุยกับแอดมิน" ไม่ต้องกรอกขนาด — โหมดอื่นต้องกรอกกว้าง×ยาวให้ครบ */
  const customChat = custom?.mode === "chat";
  /** โหมดที่ยังไม่รู้ราคาตอนสั่ง (แอดมินตีให้ทีหลัง) */
  const customAsk = custom?.mode === "quote" || customChat;
  const customValid = useCustom && (customChat || (cW > 0 && cH > 0));
  // ราคา custom: area = คำนวณจากพื้นที่ · quote/chat = ยังไม่รู้ราคา · size = ใช้ราคาตามตารางปกติ
  const customPrice = custom && customValid && custom.mode === "area" ? customUnitPrice(custom, cW, cH) : 0;

  const baseUnitPrice = useMemo(
    () => unitPriceFor(product, effectiveWithDesigns, qty),
    [product, effectiveWithDesigns, qty]
  );
  // โหมด "size" ลูกค้าแค่ระบุขนาด — ราคายังคิดจากตารางปกติ · โหมดอื่นใช้ราคาของงานกำหนดเอง
  const unitPrice = useCustom && custom?.mode !== "size" ? customPrice : baseUnitPrice;

  // ตารางราคาที่ใช้อยู่ (ตามเรทที่เลือก — สินค้าเรทเดียวคือ pricing เดิม)
  const matrix = useMemo(() => activeMatrix(product, effective), [product, effective]);

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
        if (cur && !matrixChoiceAvailable(matrix, opt.label, cur)) {
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
   * จำนวนที่ใช้เทียบ "ช่วงราคา" — สินค้าคิดเรทตามชิ้นต่อลายจะเป็น ⌊จำนวน ÷ ลาย⌋
   * ป้าย +฿ และข้อความค่าธรรมเนียมช่วงปลีกต้องอิงตัวเลขเดียวกับที่คิดราคาจริง (ดู unitPriceFor)
   */
  const feeQty = useMemo(
    () => tierQtyFor(product, effectiveWithDesigns, qty),
    [product, effectiveWithDesigns, qty]
  );

  // tier ปัจจุบันของราคาขั้นบันได (ถ้ามี) — สินค้าคิดเรทตามชิ้นต่อลาย ไฮไลต์เรทของ ⌊จำนวน ÷ ลาย⌋
  const currentTier = useMemo(() => (matrix ? tierIndex(matrix, feeQty) : null), [matrix, feeQty]);

  const related = PRODUCTS.filter(
    (p) => p.category === product.category && p.id !== product.id
  ).slice(0, 4);

  // แสดงปุ่มลัดไปหลังบ้านเฉพาะแอดมิน (โหมดเดโม = เห็นเสมอ, โหมดจริง = ต้องล็อกอิน)
  // ถามตอนเบราว์เซอร์ว่างแล้ว — ปุ่มนี้ไม่เร่งด่วน ลูกค้าทั่วไปไม่ควรต้องรอคำขอนี้ตอนเปิดหน้า
  useEffect(() => {
    const idle = window.requestIdleCallback?.bind(window) ?? ((fn: () => void) => setTimeout(fn, 1200));
    const id = idle(() => void canAccessAdmin().then(setIsAdmin));
    return () => window.cancelIdleCallback?.(id as number);
  }, []);

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
    for (const f of Array.from(files).slice(0, 5 - artFiles.length)) {
      // ① ชนิดไฟล์
      if (!/^image\/(jpeg|png|webp)$/i.test(f.type)) {
        skipped.push(`“${f.name}” ไม่ใช่ไฟล์รูป JPG/PNG`);
        continue;
      }
      // ② ขนาดไฟล์
      if (f.size > 15 * 1024 * 1024) {
        skipped.push(`“${f.name}” ใหญ่เกิน 15MB`);
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
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/orders/artwork", { method: "POST", body: fd });
        const j = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
        if (!res.ok || !j?.url) {
          setArtErr(j?.error ?? "อัปโหลดไม่สำเร็จ");
          break;
        }
        if (hash) seen.add(hash);
        // กันซ้ำอีกชั้นตอนบันทึกจริง — เผื่อวางรูปเดิมรัว ๆ ระหว่างไฟล์แรกยังอัปโหลดไม่เสร็จ
        setArtFiles((cur) =>
          hash && cur.some((x) => x.hash === hash)
            ? cur
            : [...cur, { url: j.url!, name: f.name, ...dim, ...(hash ? { hash } : {}) }]
        );
      } catch {
        setArtErr("อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
        break;
      }
    }
    if (skipped.length) setArtErr((cur) => [cur, ...skipped].filter(Boolean).join(" · "));
    setArtBusy(false);
  }

  /**
   * 🎨 สินค้าตัวนี้ "ออกแบบบนเว็บได้เลย" ไหม — มีเทมเพลตที่ถอดขนาดงานจริงได้ตามตัวเลือกที่เลือกอยู่
   * ถ้ามี: หน้าสินค้าเปลี่ยนเป็นโหมด "เริ่มสร้าง" (ไม่ต้องให้ลูกค้าแนบไฟล์ลายเอง)
   */
  const studioTarget = (() => {
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
        guideUrl: first.f.previewUrl || t.previewUrl,
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
          guideUrl: f.previewUrl || t.previewUrl,
          skinUrl: skinOf(t, f),
          tplUrl: f.fileUrl,
        })),
      };
    }
    return null;
  })();
  /** โหมดออกแบบบนเว็บ — ข้ามขั้นตอน "แนบลายของคุณ" ไปเลย */
  const studioMode = !!studioTarget;
  // (ดูคำอธิบาย noPageDropRef ด้านบน) — อัปเดตค่าให้ตัวรับ drop/paste ระดับหน้าเว็บใช้
  useEffect(() => {
    noPageDropRef.current = !!studio || studioMode;
  }, [studio, studioMode]);
  const designDone = placed.length > 0;

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
    if (!studioMode || placed.length === 0) return;
    setQty(designTotalQty);
  }, [studioMode, placed.length, designTotalQty]);

  /** อัปโหลดไฟล์เดียวแล้วคืน url (ใช้กับภาพที่ประกอบจากจอวางลาย) */
  async function uploadOne(f: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch("/api/orders/artwork", { method: "POST", body: fd });
    const j = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!res.ok || !j?.url) throw new Error(j?.error ?? "อัปโหลดไม่สำเร็จ");
    return j.url;
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

  // 🎨 ต้องแนบลายก่อนสั่งไหม — ต้องมีรูปอัปโหลด หรือ ลิงก์/อีเมล อย่างน้อยหนึ่งอย่าง
  const artRequired = artworkIsRequired(product);
  const artProvided = artFiles.length > 0 || artLink.trim().length > 0;
  // โหมดออกแบบบนเว็บ: "แบบที่ลูกค้าวางเอง" คือลายอยู่แล้ว ไม่ต้องมีช่องแนบไฟล์
  const artBlocked = studioMode ? false : artRequired && !artProvided;

  function handleAdd() {
    // 🔒 กันกดรัว/แตะซ้ำบนมือถือ — 1 คลิก = 1 รายการเสมอ
    // (กดครั้งแรกสำเร็จ ระบบเคลียร์ลาย/หมายเหตุทิ้ง ครั้งที่สองจึงกลายเป็น "อีกรายการ" คนละใบงาน)
    // ล็อกเฉพาะตอนที่เพิ่มเข้าตะกร้าได้จริง — โดนเตือนแล้วกดแก้ต่อได้ทันที ไม่ต้องรอ
    if (addLock.current) return;
    // โหมดออกแบบบนเว็บ: ต้องวางลายให้เสร็จก่อนถึงจะใส่ตะกร้าได้
    if (studioMode && !designDone) {
      openStudio();
      return;
    }
    if (artBlocked) {
      setArtTouched(false);
      setExtraOpen("art");
      return;
    }
    // สินค้าที่มีระบบลาย: ต้องระบุจำนวนลายก่อน (แตะ +/− พิมพ์เลข หรือแนบรูปให้นับอัตโนมัติ)
    if (needDesignsChoice && !designsSet) {
      setDesignsWarn(true);
      document.getElementById("designs-box")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
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
    if (note.trim()) extra["หมายเหตุ"] = note.trim();
    // จำนวนลายที่คละ (เรทที่มีระบบลาย / สินค้าคิดเรทตามชิ้นต่อลาย) — เก็บเป็นตัวเลือกให้เห็นในตะกร้า/ออเดอร์
    if ((rate?.minPerDesign || tierByDesign) && designs >= 1) extra[DESIGN_LABEL] = `${designs} ลาย`;
    if (useCustom) {
      if (!custom || !customValid) return; // ต้องกรอกขนาดให้ครบก่อน
      // เก็บขนาดที่ระบุลง selections (เป็น key ของตะกร้า + ใช้คิดราคาซ้ำ)
      // + กลุ่มตัวเลือกที่แอดมินเปิดให้เลือกต่อได้ (keepOptions) ติดไปกับออเดอร์ด้วย
      const kept = Object.fromEntries(
        Object.entries(effective).filter(([k]) => (custom.keepOptions ?? []).includes(k))
      );
      const customValue = customChat ? "คุยรายละเอียดกับแอดมิน" : `${cW}×${cH} ${custom.unit}`;
      addItem(product.id, { ...kept, [custom.label]: customValue, ...extra }, qty, product);
    } else {
      // กลุ่มที่ถูกซ่อนอยู่ (showWhen ไม่ตรง) ไม่ต้องติดไปกับตะกร้า/ออเดอร์ — ลูกค้าไม่ได้เลือกเอง
      const hidden = product.options.filter((o) => !optionVisible(o, effective)).map((o) => o.label);
      // ค่าว่าง = กลุ่มติ๊กหลายอย่างที่ลูกค้าไม่ได้ติ๊กอะไรเลย — ไม่ต้องโชว์เป็นบรรทัดเปล่าในตะกร้า/ออเดอร์
      const shown = Object.fromEntries(
        Object.entries(effectiveWithDesigns).filter(([k, v]) => !hidden.includes(k) && v !== "")
      );
      addItem(product.id, { ...shown, ...extra }, qty, product);
    }
    // เพิ่มสำเร็จแล้วค่อยล็อก — กันแตะซ้ำภายในไม่กี่ร้อยมิลลิวินาทีกลายเป็นสองใบงาน
    addLock.current = true;
    setTimeout(() => {
      addLock.current = false;
    }, 1200);
    setNote("");
    setArtLink("");
    setArtFiles([]);
    setPlaced([]);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
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
        ...(product.rating
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
  }, [product, faqs]);

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

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
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
      {isAdmin && (
        <Link
          href={`/admin/products/${product.id}`}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-stone-800 px-4 py-2.5 text-sm font-bold text-white shadow-lg ring-1 ring-black/10 transition hover:scale-105 hover:bg-stone-900"
          title="เปิดหน้าแก้ไขสินค้านี้ในระบบหลังบ้าน"
        >
          🔧 แก้ไขในหลังบ้าน
        </Link>
      )}
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
            const gallery = product.images.length
              ? product.images
              : [{ emoji: product.emoji, gradient: product.gradient, label: "" }];
            const shown = gallery[Math.min(imageIndex, gallery.length - 1)];
            return (
          <div className="lg:sticky lg:top-24">
            <ProductVisual
              emoji={shown.emoji}
              gradient={shown.gradient}
              src={shown.src ?? (imageIndex === 0 ? product.imageSrc : undefined)}
              alt={`${product.name} — ${shown.label}`}
              size="text-[8rem]"
              eager
              className="aspect-square w-full rounded-[2rem] shadow-inner"
            />
            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
              {gallery.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setImageIndex(i)}
                  className={`shrink-0 overflow-hidden rounded-2xl transition ${
                    i === imageIndex
                      ? "ring-3 ring-ducky"
                      : "opacity-60 ring-1 ring-amber-100 hover:opacity-100"
                  }`}
                  aria-label={`ดูรูป${img.label}`}
                >
                  <ProductVisual emoji={img.emoji} gradient={img.gradient} src={img.src ?? (i === 0 ? product.imageSrc : undefined)} alt={img.label} size="text-3xl" className="h-16 w-16" />
                </button>
              ))}
            </div>
            {shown.label && (
              <p className="mt-2 text-center text-xs text-stone-400">
                มุมมอง: {shown.label}
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
          {templates.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-2xl border-2 border-sky-200 bg-sky-50/60 shadow-sm">
              <div className="flex items-center gap-2 bg-sky-600 px-4 py-2">
                <span className="text-base leading-none">📐</span>
                <p className="text-xs font-extrabold tracking-tight text-white">
                  {studioMode ? "ไฟล์เทมเพลต — สำหรับคนที่ทำแบบเองในโปรแกรม" : "เทมเพลตไฟล์งาน — โหลดไปวางลายได้เลย"}
                </p>
              </div>
              <ul className="space-y-2 px-3 py-3">
                {templates.map((t) => {
                  // ชุดที่ผูกกับตัวเลือก (เช่น "รุ่น") → เอาเฉพาะไฟล์ของค่าที่ลูกค้าเลือกอยู่
                  const picked = filesForSelections(t, effective);
                  if (!picked.length) return null;
                  const optLabel = t.optionLabel?.trim();
                  const chosen = optLabel ? (effective[optLabel] ?? "").trim() : "";
                  return picked.map((f) => {
                    const href = fileHref(f);
                    if (!href) return null;
                    const outside = !f.fileUrl;
                    return (
                      <li key={f.id} className="flex items-center gap-3 rounded-xl bg-white p-2.5 ring-1 ring-sky-100">
                        {/* รูปของไฟล์นั้นมาก่อน (แต่ละรุ่นหน้าตาไม่เหมือนกัน) ไม่มีค่อยใช้รูปปกของชุด */}
                        {f.previewUrl || t.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={f.previewUrl || t.previewUrl}
                            alt={`ตัวอย่างเทมเพลต ${t.name}${f.choice ? ` ${f.choice}` : ""}`}
                            className="h-12 w-12 shrink-0 rounded-lg bg-white object-contain ring-1 ring-sky-100"
                          />
                        ) : (
                          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-sky-50 text-xl">📐</span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-bold text-stone-800">
                            {t.name}
                            {f.choice && (
                              <span className="ml-1 font-semibold text-sky-700">· {f.choice}</span>
                            )}
                          </span>
                          {t.note && <span className="block text-[11px] leading-snug text-stone-500">{t.note}</span>}
                          <span className="block text-[10px] text-stone-400">
                            {outside ? "เปิดลิงก์ไฟล์" : f.fileName ?? "ไฟล์เทมเพลต"}
                            {f.fileSize ? ` · ${formatFileSize(f.fileSize)}` : ""}
                            {/* ไม่มีไฟล์ตรงรุ่นที่เลือก → บอกตรง ๆ ว่าที่ให้โหลดเป็นไฟล์กลาง */}
                            {optLabel && chosen && !f.choice ? ` · ใช้ได้ทุก${optLabel}` : ""}
                          </span>
                        </span>
                        {/* ที่นี่มีแค่ปุ่มโหลดไฟล์ — การวางลายบนเว็บใช้ปุ่ม "เริ่มสร้าง" ในกล่องสั่งซื้อ */}
                        <a
                          href={href}
                          {...(outside
                            ? { target: "_blank", rel: "noopener noreferrer" }
                            : { download: f.fileName ?? "" })}
                          className="shrink-0 rounded-full bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-sky-700"
                        >
                          {outside ? "🔗 เปิดลิงก์" : "⬇️ ดาวน์โหลด"}
                        </a>
                      </li>
                    );
                  });
                })}
              </ul>
              <p className="px-4 pb-3 text-[10px] leading-relaxed text-sky-800">
                วิธีที่ง่ายที่สุดคือกดปุ่ม <strong>&ldquo;🎨 เริ่มสร้าง&rdquo;</strong> แล้ววางรูปของคุณบนแบบได้เลย
                ระบบจัดขนาด/ตำแหน่งให้ตรงกับที่ผลิตจริง · ส่วนไฟล์ .ai ตรงนี้มีไว้ให้คนที่อยากทำแบบเองในโปรแกรมกราฟฟิก
              </p>
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
          {useCustom && custom?.mode !== "size" && (
            <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-white/70">
              <p className="rounded-full bg-sky-600 px-4 py-2 text-center text-xs font-bold text-white shadow-lg">
                📐 ใช้ขนาดกำหนดเองอยู่ — ราคาไม่อิงตารางนี้
              </p>
            </div>
          )}
          <p className="text-sm font-bold text-stone-700">
            💰 ราคาต่อหน่วยตามจำนวน
            {rate && <span className="ml-1 font-semibold text-teal-700">· {rate.label}</span>}
          </p>
          {/* ตารางราคาขั้นบันได (rate card) — คอลัมน์เยอะโชว์เฉพาะที่เลือกอยู่ */}
          {matrix &&
            (() => {
              const allKeys = Object.keys(matrix.cells);
              const selectedKey = priceMatrixKey(matrix, effective);
              const cols = allKeys.length <= 6 ? allKeys : allKeys.filter((k) => k === selectedKey);
              return (
                <div className="mt-2 overflow-x-auto rounded-2xl ring-1 ring-stone-200">
                  {allKeys.length > 6 && (
                    <p className="bg-stone-50 px-3 py-1.5 text-[11px] text-stone-500">
                      💡 เรทราคาของตัวเลือกที่คุณเลือก — เปลี่ยนตัวเลือกด้านบนเพื่อดูราคาชนิดอื่น
                    </p>
                  )}
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-sky-100 text-sky-900">
                        <th className="whitespace-nowrap px-3 py-2 text-left font-bold">จำนวน ({matrix.unit})</th>
                        {/* ชื่อคู่ตัวเลือกยาวมาก (4 กลุ่ม) — แยกบรรทัดละส่วนและย่อคำในวงเล็บ ให้หัวตารางไม่ยืดจนล้น */}
                        {cols.map((col) => (
                          <th
                            key={col}
                            title={col.split("│").join(" · ")}
                            // ชิดซ้าย เพื่อให้ขีดนำหน้าแต่ละบรรทัดเรียงตรงกัน (ตรงกลางจะดูรุ่งริ่ง)
                            className="px-3 py-2 text-left font-bold leading-tight"
                          >
                            {shortComboParts(col).map((part, i) => (
                              <span key={i} className="block whitespace-nowrap">
                                <span className="mr-1 text-sky-400">•</span>
                                {part}
                              </span>
                            ))}
                          </th>
                        ))}
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
                                  {formatPrice(matrix.cells[col][ti])}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          {rate?.minPerDesign != null && rate.minPerDesign > 0 && (
            <p className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-800 ring-1 ring-sky-100">
              🎨 เรทนี้คละลายขั้นต่ำลายละ {rate.minPerDesign.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"}
              {/* ร้านรับสั่งขั้นต่ำ 1 ชิ้นเสมอ — ตัวเลขนี้คือ "เรทนี้เริ่มใช้ที่เท่าไหร่" ไม่ใช่ห้ามสั่งน้อยกว่า
                  (สั่งน้อยกว่านี้ระบบสลับไปเรทที่ถูกต้องให้เอง) */}
              {rate.minQty && rate.minQty > 1
                ? ` · เรทนี้เริ่มใช้ที่ ${rate.minQty.toLocaleString("th-TH")} ${matrix?.unit ?? "ชิ้น"}ขึ้นไป (สั่งน้อยกว่านี้ได้ ระบบคิดราคาตามช่วงจำนวนให้)`
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
            {useCustom ? (
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
                  {custom?.mode === "size"
                    ? "📐 ระบุขนาดเองอยู่ — ราคายังคิดตามตารางเรทปกติ"
                    : "📐 ใช้ขนาดกำหนดเองอยู่ — ราคาไม่อิงตัวเลือก/ตารางเรทปกติ"}
                </p>
              )
            ) : matrix ? (
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

          {/* เลือกเรทราคา (สินค้าที่มีหลายเรท เช่น คละดีเทล / ไม่คละดีเทล) — ใช้ขนาดกำหนดเองอยู่ = ปิดชั่วคราว */}
          {rates.length > 1 && rate && (
            <div className={`mt-5 ${useCustom ? "pointer-events-none select-none opacity-40" : ""}`} aria-disabled={useCustom}>
              <span className="mb-1.5 block text-[13px] font-bold text-stone-700">
                {RATE_LABEL}: <span className="font-semibold text-amber-600">{rate.label}</span>
              </span>
              <div className="grid gap-1.5">
                {rates.map((r) => {
                  const on = r.label === rate.label;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setRateTouched(true);
                        setRateLabel(r.label);
                        setAutoRateNote("");
                      }}
                      className={`rounded-xl px-3 py-2 text-left text-[13px] transition ${
                        on
                          ? "bg-amber-50 font-bold text-amber-900 ring-2 ring-amber-400"
                          : "bg-white text-stone-600 ring-1 ring-stone-200 hover:ring-amber-300"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${on ? "border-amber-500" : "border-stone-300"}`}>
                          {on && <span className="h-2 w-2 rounded-full bg-amber-500" />}
                        </span>
                        {r.label}
                      </span>
                      {r.desc && <span className="mt-0.5 block pl-6 text-[11px] font-normal leading-snug text-stone-500">{r.desc}</span>}
                      {(r.minQty || r.minPerDesign) && (
                        <span className="mt-0.5 block pl-6 text-[10px] font-semibold leading-snug text-teal-700">
                          {[
                            r.minQty ? `สั่งรวม ${r.minQty.toLocaleString("th-TH")} ${r.pricing.unit}ขึ้นไป` : "",
                            r.minPerDesign ? `คละลายขั้นต่ำลายละ ${r.minPerDesign.toLocaleString("th-TH")} ${r.pricing.unit}` : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
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
          )}

          {/* ตัวเลือกสินค้า (กรอง/ล็อกตามกฎเงื่อนไข)
              ใช้ขนาดกำหนดเองอยู่ = ปิดเฉพาะกลุ่มที่แอดมินไม่ได้ตั้งให้ "ยังเลือกได้" (custom.keepOptions) */}
          {useCustom && (
            <p className="mt-5 rounded-xl bg-sky-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-sky-800 ring-1 ring-sky-200">
              📐 กำลังใช้ &ldquo;{custom?.label ?? "กำหนดขนาดเอง"}&rdquo;{custom?.mode === "size" ? "" : " — ราคาไม่อิงตารางเรทปกติ"}
              {(custom?.keepOptions?.length ?? 0) > 0
                ? ` · ยังเลือก ${custom!.keepOptions!.join(" / ")} ได้ตามปกติ ส่วนกลุ่มอื่นถูกปิดไว้`
                : " ตัวเลือกด้านล่างถูกปิดไว้"}{" "}
              (เอาติ๊กออกเพื่อกลับมาเลือกทั้งหมด)
            </p>
          )}
          <div className="mt-4 space-y-3">
            {/* กลุ่มที่ตั้ง "แสดงเมื่อ" ไว้ และเงื่อนไขยังไม่ตรง → ไม่ต้องโชว์ (เช่น สีตะขอของแบบที่ไม่ได้เลือก) */}
            {product.options.filter((opt) => optionVisible(opt, effective)).map((opt) => {
              // ล็อกกลุ่มนี้เพราะใช้ขนาดกำหนดเองอยู่ และแอดมินไม่ได้เปิดให้เลือกต่อ
              const customLocked = useCustom && !(custom?.keepOptions ?? []).includes(opt.label);
              const allowedByRules = allowedChoices(product, effective, opt.label);
              // ตัดตัวที่ไม่มีราคาขายในเรทที่เลือกอยู่ (แอดมินล้างแถวทิ้ง) — ตัดหมดแล้วคงชุดเดิมไว้กันหน้าพัง
              const byRate = matrix ? allowedByRules.filter((n) => matrixChoiceAvailable(matrix, opt.label, n)) : allowedByRules;
              const allowed = byRate.length > 0 ? byRate : allowedByRules;
              const multi = isMultiOption(opt);
              // กลุ่มติ๊กหลายอย่างไม่ล็อกอัตโนมัติ — เหลือตัวเลือกเดียวก็ยังต้องให้ติ๊ก/ไม่ติ๊กเองได้
              const locked = !multi && allowed.length === 1;
              const picks: MultiPick[] = multi ? selectedPicks(opt, effective) : [];
              const picked = picks.map((p) => p.name);
              // กลุ่มที่เปิด "ระบุจำนวนต่อตัวเลือก" (เช่น เพิ่มสาย 2 เส้น) — +฿ คูณตามจำนวน
              const withQty = hasChoiceQty(opt);
              const qtyMax = choiceQtyMax(opt);
              /** เขียนตัวเลือกที่ติ๊กกลับลง selections — เรียงตามลำดับตัวเลือกในกลุ่มเสมอ */
              const writePicks = (make: (cur: MultiPick[]) => MultiPick[]) =>
                setSelections((s) => ({ ...s, [opt.label]: joinMultiPicks(make(selectedPicks(opt, s))) }));
              const setChoiceQty = (name: string, n: number) =>
                writePicks((cur) =>
                  cur.map((p) => (p.name === name ? { ...p, qty: Math.min(qtyMax, Math.max(1, n)) } : p))
                );
              return (
                <div
                  key={opt.label}
                  className={customLocked ? "pointer-events-none select-none opacity-40" : undefined}
                  aria-disabled={customLocked || undefined}
                >
                  <span className="mb-1 block text-[13px] font-bold text-stone-700">
                    {opt.label}:{" "}
                    <span className={multi && !picked.length ? "font-semibold text-stone-400" : "font-semibold text-amber-600"}>
                      {multi
                        ? picks.length
                          ? picks.map((p) => formatMultiPick(p.name, p.qty)).join(", ")
                          : "ไม่เลือก"
                        : effective[opt.label]}
                    </span>
                    {multi && (
                      <span className="ml-1 rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 ring-1 ring-teal-100">
                        ☑ เลือกได้หลายอย่าง{withQty ? " · ระบุจำนวนได้" : ""}
                      </span>
                    )}
                  </span>
                  {multi ? (
                    <div className="flex flex-wrap gap-1.5">
                      {opt.choices
                        .filter((c) => allowed.includes(c.name))
                        .map((c) => {
                          const on = picked.includes(c.name);
                          const cQty = picks.find((p) => p.name === c.name)?.qty ?? 1;
                          const unitAdd = choiceBadgeOf(opt, effective, c.name, feeQty);
                          return (
                            <span key={c.name} className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                onClick={() =>
                                  writePicks((cur) =>
                                    // เก็บตามลำดับตัวเลือกในกลุ่มเสมอ — ติ๊กสลับไปมาแล้วข้อความ (และ key ตะกร้า) ไม่เปลี่ยนตาม
                                    opt.choices
                                      .filter((x) => (x.name === c.name ? !on : cur.some((p) => p.name === x.name)))
                                      .map((x) => ({
                                        name: x.name,
                                        qty: cur.find((p) => p.name === x.name)?.qty ?? 1,
                                      }))
                                  )
                                }
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
                                {c.name}
                                {unitAdd > 0 ? ` +${formatPrice(unitAdd)}` : ""}
                              </button>
                              {/* ช่องจำนวนของตัวเลือกนี้ (เช่น เพิ่มสาย 2 เส้น) — โผล่เมื่อติ๊กแล้วเท่านั้น */}
                              {withQty && on && (
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
                                    aria-label={`จำนวน ${c.name}`}
                                    className="w-8 bg-transparent text-center text-[13px] font-extrabold text-amber-700 outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setChoiceQty(c.name, cQty + 1)}
                                    disabled={cQty >= qtyMax}
                                    aria-label={`เพิ่มจำนวน ${c.name}`}
                                    className="grid h-6 w-6 place-items-center rounded-full text-[13px] font-extrabold text-stone-500 hover:bg-amber-50 disabled:text-stone-300 disabled:hover:bg-transparent"
                                  >
                                    ＋
                                  </button>
                                </span>
                              )}
                              {/* จำนวนมากกว่า 1 บอกยอดรวมของตัวนี้ไปเลย จะได้ไม่ต้องคูณเอง */}
                              {withQty && on && cQty > 1 && unitAdd > 0 && (
                                <span className="text-[11px] font-bold text-amber-700">
                                  = +{formatPrice(unitAdd * cQty)}
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
                  ) : opt.display === "dropdown" ? (
                    <select
                      value={effective[opt.label]}
                      onChange={(e) => setSelections((s) => ({ ...s, [opt.label]: e.target.value }))}
                      className="w-full rounded-xl bg-white px-3 py-2 text-[13px] font-semibold text-stone-700 ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                      aria-label={opt.label}
                    >
                      {opt.choices
                        .filter((c) => allowed.includes(c.name))
                        .map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                            {choiceBadgeOf(opt, effective, c.name, feeQty) > 0
                              ? ` +${formatPrice(choiceBadgeOf(opt, effective, c.name, feeQty))}`
                              : ""}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {opt.choices
                        .filter((c) => allowed.includes(c.name))
                        .map((c) => (
                          <button
                            key={c.name}
                            type="button"
                            onClick={() =>
                              setSelections((s) => ({ ...s, [opt.label]: c.name }))
                            }
                            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                              effective[opt.label] === c.name
                                ? "bg-amber-400 text-white shadow"
                                : "bg-white text-stone-600 ring-1 ring-amber-200 hover:bg-amber-50"
                            }`}
                          >
                            {c.name}
                            {choiceBadgeOf(opt, effective, c.name, feeQty) > 0
                              ? ` +${formatPrice(choiceBadgeOf(opt, effective, c.name, feeQty))}`
                              : ""}
                          </button>
                        ))}
                    </div>
                  )}
                  {/* กลุ่มที่ระบุจำนวนได้ — สรุปยอดรวมของทั้งกลุ่มหลังคูณจำนวนแล้ว */}
                  {withQty && picks.length > 0 && groupAddOf(opt, effective, feeQty) > 0 && (
                    <p className="mt-1 text-[11px] font-semibold text-teal-700">
                      💡 {opt.label}ที่เลือกไว้ รวม +{formatPrice(groupAddOf(opt, effective, feeQty))} ต่อ
                      {matrix?.unit ?? "ชิ้น"} (คิดตามจำนวนที่ระบุ)
                    </p>
                  )}
                  {/* ค่าธรรมเนียมช่วงสั่งน้อย — บอกทั้งตอนอยู่ในช่วง (คิดเหมา) และตอนพ้นช่วงแล้ว (คิดตามตัวเลือก) */}
                  {opt.smallQtyFee != null && opt.smallQtyFee.upToQty > 0 && (() => {
                    const s = opt.smallQtyFee!;
                    const fee = smallQtyFeeOf(opt, effective, feeQty);
                    const unit = matrix?.unit ?? "ชิ้น";
                    // สินค้าที่คิดเรทตามชิ้นต่อลาย ช่วงราคานับ "ต่อลาย" ไม่ใช่ยอดรวม — ต้องบอกให้ตรง
                    const perDesign = tierByDesign || (rate?.minPerDesign ?? 0) > 0;
                    const unitTxt = perDesign ? `${unit}ต่อลาย` : unit;
                    const inRange = feeQty <= s.upToQty;
                    const exempt = (s.freeChoices ?? []).join(" / ");
                    if (inRange && fee !== 0) {
                      return (
                        <p className={`mt-1 text-[11px] font-semibold ${fee < 0 ? "text-emerald-700" : "text-amber-700"}`}>
                          {fee < 0 ? "🎉" : "💡"} ช่วงสั่งไม่เกิน {s.upToQty.toLocaleString("th-TH")} {unitTxt} · เลือก{opt.label}
                          {fee < 0
                            ? `ลดให้ ${formatPrice(-fee)}/${unit}`
                            : `คิดเหมา ${formatPrice(fee)}/${unit} (แทนราคา${opt.label}ปกติ ไม่บวกซ้ำ)`}
                          {exempt ? ` (ยกเว้น ${exempt}${fee < 0 ? " ไม่ลด" : " คิดราคาปกติ"})` : ""}
                        </p>
                      );
                    }
                    if (inRange) {
                      // อยู่ในช่วงแต่ตัวที่เลือกได้รับยกเว้น (เช่น ห่วงแถม) — คิดราคาตัวเลือกตามปกติ
                      return (
                        <p className="mt-1 text-[11px] font-semibold text-stone-500">
                          💡 ช่วงสั่งไม่เกิน {s.upToQty.toLocaleString("th-TH")} {unitTxt} · {opt.label}ที่เลือกอยู่ไม่คิดค่าเหมา ฿
                          {Math.abs(s.fee).toLocaleString("th-TH")} — คิดราคาตามตัวเลือกตามปกติ
                        </p>
                      );
                    }
                    // พ้นช่วงเหมาแล้ว — บอกว่าตอนนี้คิดตามราคาตัวเลือก และตัวที่เลือกอยู่บวกเท่าไร
                    const now = groupAddOf(opt, effective, feeQty);
                    return (
                      <p className="mt-1 text-[11px] font-semibold text-teal-700">
                        💡 สั่งตั้งแต่ {(s.upToQty + 1).toLocaleString("th-TH")} {unitTxt}ขึ้นไป · ไม่คิดค่าเหมา ฿
                        {Math.abs(s.fee).toLocaleString("th-TH")}/{unit} แล้ว — {opt.label}คิดตามราคาตัวเลือก{" "}
                        {now > 0 ? `(ตอนนี้ +${formatPrice(now)}/${unit})` : "(ตอนนี้ไม่คิดเพิ่ม)"}
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
                      const perDesign = tierByDesign || (rate?.minPerDesign ?? 0) > 0;
                      const unitTxt = perDesign ? `${unit}ต่อลาย` : unit;
                      const from = opt.extraFromQty!.toLocaleString("th-TH");
                      if (!optionExtraApplies(opt, feeQty)) {
                        return (
                          <p className="mt-1.5 text-[11px] text-stone-400">
                            💡 จำนวนนี้ราคารวม{opt.label}แล้ว · สั่งตั้งแต่ {from} {unitTxt}ขึ้นไปคิดเพิ่มตามตัวเลือก
                          </p>
                        );
                      }
                      const now = groupAddOf(opt, effective, feeQty);
                      return (
                        <p className="mt-1.5 text-[11px] font-semibold text-teal-700">
                          💡 สั่งตั้งแต่ {from} {unitTxt}ขึ้นไป · {opt.label}คิดเพิ่มตามตัวเลือก{" "}
                          {now > 0 ? `(ตอนนี้ +${formatPrice(now)}/${unit})` : "(ตอนนี้ไม่คิดเพิ่ม)"}
                        </p>
                      );
                    })()}
                </div>
              );
            })}
          </div>

          {/* งานกำหนดขนาดเอง (custom) */}
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
                        {custom.mode === "size" ? "กรอกกว้าง × ยาว ที่ต้องการ" : "กรอกกว้าง × ยาว เพื่อคิดราคา"}
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
            {/* จำนวน + เพิ่มลงตะกร้า */}
            <div>
              {matrix && !(studioMode && designDone) && (
                <label className="mb-1 block text-[13px] font-bold text-stone-700">
                  จำนวน ({matrix.unit})
                </label>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {/* มีลายแล้ว = คุมจำนวนที่ลายแต่ละอันแทน (กันตัวเลขสองที่ไม่ตรงกัน) */}
                {!(studioMode && designDone) && (
                <div className="flex items-center rounded-full bg-white ring-1 ring-amber-200">
                  <button
                    type="button"
                    // ลดได้ถึง 1 เสมอ — ถ้าต่ำกว่าขั้นต่ำของเรทที่เลือกไว้ ระบบจะสลับลงเรทที่เหมาะเอง
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="h-10 w-10 rounded-l-full text-base font-bold text-stone-600 hover:bg-amber-50"
                    aria-label="ลดจำนวน"
                  >
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={qtyText}
                    onChange={(e) => {
                      // ปล่อยให้ลบจนว่างได้ระหว่างพิมพ์ (เดิมยัด 1 กลับทันที ลบแล้วพิมพ์ใหม่ไม่ได้)
                      const raw = e.target.value.replace(/\D/g, "").slice(0, 5);
                      setQtyText(raw);
                      const n = parseInt(raw, 10);
                      if (Number.isFinite(n) && n > 0) setQty(Math.min(n, 99999));
                    }}
                    onBlur={() => setQtyText(String(qty))}
                    className="w-14 bg-transparent text-center text-sm font-bold focus:outline-none"
                    aria-label="จำนวน"
                  />
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.min(matrix ? 99999 : 99, q + 1))}
                    className="h-10 w-10 rounded-r-full text-base font-bold text-stone-600 hover:bg-amber-50"
                    aria-label="เพิ่มจำนวน"
                  >
                    +
                  </button>
                </div>
                )}

                {/* โหมดออกแบบบนเว็บ: ปุ่มแรกคือ "เริ่มสร้าง" · วางลายเสร็จแล้วค่อยกลายเป็นปุ่มใส่ตะกร้า */}
                {studioMode && !designDone ? (
                  <button
                    type="button"
                    onClick={() => openStudio(null)}
                    className="flex-1 rounded-full bg-sky-600 px-5 py-3 text-[13px] font-bold text-white shadow-lg transition hover:scale-105 hover:bg-sky-700 sm:flex-none sm:px-8"
                  >
                    🎨 เริ่มสร้าง — วางลายบนสินค้า
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleAdd}
                    // ขนาดกำหนดเอง = ราคาไม่อิงเรทปกติ → ไม่ติดขั้นต่ำของเรทด้วย (สั่งกี่ชิ้นก็ได้ แอดมินตีราคาตามจริง)
                    disabled={(useCustom && !customValid) || artBlocked}
                    className={`flex-1 rounded-full px-5 py-3 text-[13px] font-bold shadow-lg transition sm:flex-none sm:px-8 ${
                      added
                        ? "bg-emerald-500 text-white"
                        : "bg-amber-400 text-white hover:scale-105 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                    }`}
                  >
                    {added
                      ? "✓ เพิ่มลงตะกร้าแล้ว!"
                      : artBlocked
                        ? "🎨 แนบลายก่อนถึงจะสั่งได้"
                        : useCustom && customAsk
                        ? "🛒 สั่งเลย — แอดมินตีราคาแล้วแจ้งกลับ"
                        : `🛒 เพิ่มลงตะกร้า — ${formatPrice(unitPrice * qty + designFee)}`}
                  </button>
                )}
              </div>
              {/* แบบที่ลูกค้าวางเอง — สั่งหลายลายในรายการเดียวได้ กำหนดจำนวนแยกแต่ละลาย */}
              {studioMode && designDone && (
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
              {artBlocked && (
                <button
                  type="button"
                  onClick={() => {
                    setArtTouched(false);
                    setExtraOpen("art");
                    document.getElementById("art-link")?.scrollIntoView({ block: "center", behavior: "smooth" });
                  }}
                  className="mt-2 w-full rounded-xl bg-rose-50 px-3 py-2 text-left text-xs font-bold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
                >
                  🎨 สินค้านี้ต้องแนบลายก่อนสั่ง — แตะเพื่ออัปโหลดรูป หรือใส่ลิงก์ไฟล์/อีเมล
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
              ) : matrix ? (
                <p className="mt-2 text-sm text-stone-500">
                  {formatPrice(unitPrice)} / {matrix.unit} × {qty.toLocaleString("th-TH")}
                  {designFee > 0 && <> + ค่าคละลาย {formatPrice(designFee)}</>} ={" "}
                  <span className="font-extrabold text-amber-600">{formatPrice(unitPrice * qty + designFee)}</span>
                </p>
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
                    {!designsTouched && artFiles.length > 0 && (
                      <span className="rounded-full bg-teal-600/10 px-2 py-0.5 text-[10px] font-bold text-teal-700" title="นับตามรูปลายที่แนบ — กด +/− เพื่อปรับเอง">
                        ✨ นับตามรูปที่แนบ
                      </span>
                    )}
                    {designFee > 0 && (
                      <span className="text-xs font-bold text-amber-700">+{formatPrice(designFee)}</span>
                    )}
                  </div>
                  {!designsSet && (
                    <p className={`mt-1 text-[10px] font-bold leading-snug ${designsWarn ? "text-rose-600" : "text-amber-700"}`}>
                      👉 กด + / − หรือแตะที่ตัวเลขเพื่อระบุจำนวนลายที่จะคละ — แนบรูปลายแล้วระบบจะนับให้อัตโนมัติ
                    </p>
                  )}
                  {tierByDesign && rate?.minPerDesign && !freeMix && designs > included ? (
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
                      ✨ ช่วงราคาปลีกคละลายได้อิสระ — ลายละกี่ชิ้นก็ได้ ไม่คิดเพิ่ม (สูงสุด {qty.toLocaleString("th-TH")} ลาย)
                      {rate.freeMixBelowQty
                        ? ` · สั่งตั้งแต่ ${rate.freeMixBelowQty.toLocaleString("th-TH")} ${matrix?.unit ?? "ชิ้น"}ขึ้นไป ขั้นต่ำลายละ ${rate.minPerDesign.toLocaleString("th-TH")}`
                        : ""}
                    </p>
                  ) : rate?.minPerDesign ? (
                  <p className="mt-1 text-[11px] leading-relaxed text-teal-800">
                    รวมในราคา {included.toLocaleString("th-TH")} ลาย (ขั้นต่ำลายละ {rate.minPerDesign.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"})
                    {rate.extraDesignFee
                      ? ` · คละเกินได้ ลายละ +${formatPrice(rate.extraDesignFee)}`
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
            </div>
          </div>

          {/*
            ═══ เพิ่มเติม (ไม่บังคับ) — ยุบไว้ ไม่ให้บังปุ่มซื้อ · โยนรูปลงหน้าไหนก็เปิดให้เอง ═══
            สินค้าที่ออกแบบบนเว็บได้ (มีเทมเพลต) ข้ามช่อง "แนบลายของคุณ" ไปเลย —
            ลายมาจากแบบที่ลูกค้าวางเองในจอสร้างงาน ไม่ต้องให้อัปไฟล์ซ้ำอีกทาง
          */}
          <div className={`mt-4 overflow-hidden rounded-3xl bg-white ring-1 ring-stone-200 ${studioMode ? "hidden" : ""}`}>
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
                  แนบลายของคุณ
                  {artProvided ? (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      {artFiles.length > 0 ? `แนบแล้ว ${artFiles.length} รูป` : "ใส่ลิงก์แล้ว"}
                    </span>
                  ) : artRequired ? (
                    <span className="ml-2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">จำเป็น *</span>
                  ) : (
                    <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">แนะนำ</span>
                  )}
                </span>
                <span className="block text-[11px] text-stone-400">อัปโหลดรูป (ลากมาวางได้) · หรือแนบลิงก์ไฟล์ / อีเมล</span>
              </span>
              <span className={`shrink-0 text-stone-400 transition ${extraOpen === "art" ? "rotate-180" : ""}`}>⌄</span>
            </button>
            {(extraOpen === "art" || (artBlocked && !artTouched)) && <div className="px-4 pb-4">
              {/* ── ลายของลูกค้า: อัปโหลดภาพตัวอย่าง + ลิงก์ไฟล์ต้นฉบับ ── */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (artFiles.length < 5) setArtDrag(true);
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
                          <img src={f.url} alt={f.name} className="h-20 w-20 rounded-xl object-cover ring-1 ring-sky-200" />
                        </a>
                        <button
                          type="button"
                          onClick={() => setArtFiles((cur) => cur.filter((_, j) => j !== i))}
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

                {artFiles.length < 5 && (
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
                        <span className="text-[10px] font-normal text-stone-400">JPG / PNG / WEBP · สูงสุด 5 รูป · ไม่เกิน 15MB</span>
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
                )}
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
                  onChange={(e) => setArtLink(e.target.value.slice(0, 500))}
                  placeholder="เช่น https://drive.google.com/…  หรือ  yourmail@gmail.com"
                  className="mt-1.5 w-full rounded-xl bg-white px-3.5 py-2 text-sm text-stone-700 ring-1 ring-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
                <p className="mt-1 text-[10px] leading-relaxed text-stone-400">
                  Google Drive / Dropbox / OneDrive หรืออีเมลที่ส่งไฟล์ไว้ — เราดึงไฟล์ต้นฉบับไปใช้ผลิต
                </p>
              </div>
            </div>}

            <div className="border-t border-stone-100">
              <button
                type="button"
                onClick={() => setExtraOpen((o) => (o === "note" ? null : "note"))}
                aria-expanded={extraOpen === "note"}
                className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-amber-50/60"
              >
                <span className="text-lg leading-none">📝</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-stone-700">
                    หมายเหตุถึงร้าน
                    {note.trim() && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">มีข้อความ</span>
                    )}
                  </span>
                  <span className="block text-[11px] text-stone-400">สีที่ต้องการ · ข้อความที่อยากให้ใส่ · รายละเอียดเพิ่มเติม</span>
                </span>
                <span className={`shrink-0 text-stone-400 transition ${extraOpen === "note" ? "rotate-180" : ""}`}>⌄</span>
              </button>
              {extraOpen === "note" && <div className="px-4 pb-4">
                {/* หมายเหตุถึงร้าน (อยู่ใต้จำนวน+เพิ่มลงตะกร้า) */}
                <div className="mt-5">
                  <label htmlFor="order-note" className="mb-1.5 block text-sm font-bold text-stone-700">
                    📝 หมายเหตุถึงร้าน <span className="font-normal text-stone-400">(ไม่บังคับ)</span>
                  </label>
                  <textarea
                    id="order-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 500))}
                    rows={2}
                    placeholder="เช่น สีที่ต้องการ · ข้อความที่อยากให้ใส่ · รายละเอียดเพิ่มเติม"
                    className="w-full resize-y rounded-2xl bg-white px-4 py-2.5 text-sm text-stone-700 ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                  {note.trim() && (
                    <p className="mt-1 text-right text-[11px] text-stone-400">{note.length}/500</p>
                  )}
                </div>
              </div>}
            </div>
          </div>

        </div>
      </div>

      {/* รายละเอียดสินค้า โซน "ด้านล่าง" — เต็มความกว้าง (ค่าเริ่มต้นของทุกท่อนที่ไม่ได้ตั้ง slot) */}
      {detailsSection("wide", "mt-16")}

      {/* ═══ แท็บข้อมูลสินค้า — รายละเอียดเพิ่มเติม / วิธีสั่งงาน / การรับประกัน (แบบหน้า pricelist เว็บเดิม) ═══ */}
      {(product.tabs?.length ?? 0) > 0 && (
        <section className="mt-14">
          <div className="flex overflow-x-auto rounded-t-2xl bg-[#8fb6d6] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {product.tabs!.map((t, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setTabIndex(i)}
                aria-selected={i === Math.min(tabIndex, product.tabs!.length - 1)}
                className={`flex-1 whitespace-nowrap px-5 py-3 text-center text-sm font-bold transition md:text-[15px] ${
                  i === Math.min(tabIndex, product.tabs!.length - 1)
                    ? "bg-[#b9d6ec] text-stone-800"
                    : "text-white hover:bg-white/15"
                }`}
              >
                {t.title}
              </button>
            ))}
          </div>
          <div className="rounded-b-2xl bg-white px-5 py-6 ring-1 ring-stone-200 md:px-8">
            <ProductTabText text={product.tabs![Math.min(tabIndex, product.tabs!.length - 1)].text} />
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

      {/* สินค้าใกล้เคียง */}
      {related.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-5 text-xl font-extrabold text-amber-950">
            {category.emoji} สินค้าอื่นในหมวด{category.name}
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
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
              {qty.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"}
              {artFiles.length > 0 ? ` · แนบลาย ${artFiles.length} รูป` : ""}
            </p>
            <p className="text-lg font-extrabold leading-tight text-amber-600">{formatPrice(unitPrice * qty + designFee)}</p>
          </div>
          {studioMode && !designDone ? (
            <button
              type="button"
              onClick={() => openStudio(null)}
              className="ml-auto shrink-0 rounded-full bg-sky-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-sky-700"
            >
              🎨 เริ่มสร้าง
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAdd}
              disabled={(useCustom && !customValid) || artBlocked}
              className={`ml-auto shrink-0 rounded-full px-6 py-3 text-sm font-bold text-white shadow-lg transition ${
                added ? "bg-emerald-500" : "bg-amber-400 hover:bg-amber-500 disabled:opacity-40"
              }`}
            >
              {added ? "✓ เพิ่มแล้ว!" : artBlocked ? "🎨 แนบลายก่อน" : "🛒 เพิ่มลงตะกร้า"}
            </button>
          )}
        </div>
      </div>
      {/* กันแถบลอยบังเนื้อหาท้ายหน้า */}
      <div className="h-20 lg:hidden" aria-hidden />

      {/* 🔍 ดูรูปขนาดใหญ่ (กดพื้นหลัง/ปุ่มปิด/Esc เพื่อออก) */}
      {zoomSrc && (
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
          <button
            type="button"
            onClick={() => setZoomSrc("")}
            className="absolute right-4 top-4 rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-stone-700 shadow-lg transition hover:bg-white"
          >
            ✕ ปิด
          </button>
        </div>
      )}

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
  );
}
