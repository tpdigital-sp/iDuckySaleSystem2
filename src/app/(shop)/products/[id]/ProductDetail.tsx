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
  matrixChoiceAvailable,
  priceMatrixKey,
  priceRange,
  PRODUCTS,
  RATE_LABEL,
  resolveSelections,
  tierIndex,
  unitPriceFor,
  needsStockCheck,
  artworkIsRequired,
  type Product,
} from "@/lib/products";
import { LINE_URL } from "@/components/LineButton";
import { useCart } from "@/lib/cart-context";
import { canAccessAdmin } from "@/lib/auth";
import { fetchProduct } from "@/lib/product-repo";
import ProductVisual from "@/components/ProductVisual";
import ProductCard from "@/components/ProductCard";

/**
 * แยก "ข้อควรทราบ" เป็นข้อ ๆ — บรรทัดที่ขึ้นต้นด้วย * / ** / *** = ข้อใหม่
 * บรรทัดถัดไปที่ไม่ได้ขึ้นต้นด้วย * ถือเป็นบรรทัดต่อของข้อเดิม (คงการขึ้นบรรทัดไว้)
 */
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

export default function ProductDetail({ product: initialProduct }: { product: Product }) {
  const [product, setProduct] = useState<Product>(initialProduct);
  const category = getCategory(product.category);
  const { addItem } = useCart();
  const [imageIndex, setImageIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialProduct.options.map((o) => [o.label, o.choices[0].name]))
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
  const [artFiles, setArtFiles] = useState<{ url: string; name: string; w: number; h: number }[]>([]);
  const [artBusy, setArtBusy] = useState(false);
  const [artErr, setArtErr] = useState("");
  const [artDrag, setArtDrag] = useState(false); // ลากไฟล์อยู่เหนือกล่องแนบลาย
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
        setSelections(Object.fromEntries(m.options.map((o) => [o.label, o.choices[0].name])));
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
  const effective = useMemo(
    () => (rate ? { ...resolved, [RATE_LABEL]: rate.label } : resolved),
    [resolved, rate]
  );
  const rateMinQty = rate?.minQty ?? 1;
  // เปลี่ยนเรทแล้วจำนวนต่ำกว่าขั้นต่ำของเรทใหม่ → ดันขึ้นให้ถึงขั้นต่ำ
  useEffect(() => {
    if (rateMinQty > 1) setQty((q) => Math.max(q, rateMinQty));
  }, [rateMinQty]);
  // ✨ จำนวนถึงขั้นต่ำของเรทไหน → สลับไปเรทนั้นให้อัตโนมัติ (เรทที่ขั้นต่ำสูงสุดที่จำนวนถึง)
  // จนกว่าลูกค้าจะกดเลือกเรทเอง
  useEffect(() => {
    if (rateTouched || rates.length < 2) return;
    const best = rates
      .filter((r) => qty >= (r.minQty ?? 1))
      .sort((a, b) => (b.minQty ?? 1) - (a.minQty ?? 1))[0];
    if (best) setRateLabel((cur) => (cur === best.label ? cur : best.label));
  }, [qty, rates, rateTouched]);

  // ── จำนวนลายที่คละ (เรทที่กำหนดขั้นต่ำต่อลาย) ──
  const [designs, setDesigns] = useState(1);
  // ลูกค้ากดปรับเองแล้ว = หยุดนับอัตโนมัติ (บางงานลาย 1 แบบแนบรูปหลายมุม)
  const [designsTouched, setDesignsTouched] = useState(false);
  // ลายที่รวมในราคาตามจำนวนที่สั่ง · เรทที่เปิด extraDesignFee คละเกินได้ (จ่ายเพิ่มต่อลาย ไม่เกินจำนวนชิ้น)
  const included = rate?.minPerDesign ? includedDesigns(rate, qty) : 0;
  const maxDesigns = rate?.minPerDesign ? (rate.extraDesignFee ? qty : included) : 0;
  useEffect(() => {
    if (maxDesigns > 0) setDesigns((d) => Math.min(Math.max(1, d), maxDesigns));
  }, [maxDesigns]);
  // ✨ นับจำนวนลายอัตโนมัติตามรูปลายที่แนบ (จนกว่าลูกค้าจะปรับเอง)
  useEffect(() => {
    if (designsTouched || maxDesigns < 1) return;
    setDesigns(Math.min(Math.max(artFiles.length, 1), maxDesigns));
  }, [artFiles.length, maxDesigns, designsTouched]);
  const extraDesigns = rate?.extraDesignFee ? Math.max(0, designs - included) : 0;
  const designFee = extraDesigns * (rate?.extraDesignFee ?? 0);

  const custom = product.custom?.enabled ? product.custom : null;
  const cW = parseFloat(customW), cH = parseFloat(customH);
  const customValid = useCustom && cW > 0 && cH > 0;
  // ราคา custom: area = คำนวณจากพื้นที่ · quote = ยังไม่รู้ราคา (ให้แอดมินตี)
  const customPrice = custom && customValid && custom.mode === "area" ? customUnitPrice(custom, cW, cH) : 0;

  const baseUnitPrice = useMemo(
    () => unitPriceFor(product, effective, qty),
    [product, effective, qty]
  );
  const unitPrice = useCustom ? customPrice : baseUnitPrice;

  // ตารางราคาที่ใช้อยู่ (ตามเรทที่เลือก — สินค้าเรทเดียวคือ pricing เดิม)
  const matrix = useMemo(() => activeMatrix(product, effective), [product, effective]);

  // ตัวเลือกที่แอดมินล้างราคาทิ้งในเรทนี้ (ไม่ขาย) → ถ้าลูกค้าค้างอยู่ที่ตัวนั้น สลับให้เป็นตัวแรกที่ขาย
  useEffect(() => {
    if (!matrix) return;
    setSelections((sel) => {
      let changed = false;
      const next = { ...sel };
      for (const opt of product.options) {
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

  // tier ปัจจุบันของราคาขั้นบันได (ถ้ามี)
  const currentTier = useMemo(() => {
    if (!matrix) return null;
    return tierIndex(matrix, qty);
  }, [matrix, qty]);

  const related = PRODUCTS.filter(
    (p) => p.category === product.category && p.id !== product.id
  ).slice(0, 4);

  // แสดงปุ่มลัดไปหลังบ้านเฉพาะแอดมิน (โหมดเดโม = เห็นเสมอ, โหมดจริง = ต้องล็อกอิน)
  useEffect(() => {
    canAccessAdmin().then(setIsAdmin);
  }, []);

  // แถบซื้อลอยล่างจอ: โชว์เมื่อกล่องสั่งซื้อหลักหลุดจอไปแล้ว
  useEffect(() => {
    const el = orderBoxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShowBuyBar(!e.isIntersecting), { rootMargin: "-80px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // โยนรูปลงตรงไหนของหน้าก็ได้ → เปิดกล่องแนบลายให้เองแล้วอัปโหลดทันที
  // (ถ้าไม่ใช่รูป ก็แค่กันเบราว์เซอร์เปิดไฟล์นั้นแทนหน้าเว็บ)
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
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

  /** อัปโหลดภาพลาย — ส่งไฟล์ต้นฉบับขึ้นเก็บ แล้วอ่านความละเอียดจริงไว้เตือนถ้าภาพเล็กเกินไป */
  async function uploadArtwork(files: FileList | null) {
    if (!files?.length) return;
    setArtErr("");
    setArtBusy(true);
    for (const f of Array.from(files).slice(0, 5 - artFiles.length)) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/orders/artwork", { method: "POST", body: fd });
        const j = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
        if (!res.ok || !j?.url) {
          setArtErr(j?.error ?? "อัปโหลดไม่สำเร็จ");
          break;
        }
        const dim = await new Promise<{ w: number; h: number }>((resolve) => {
          const img = new window.Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve({ w: 0, h: 0 });
          img.src = URL.createObjectURL(f);
        });
        setArtFiles((cur) => [...cur, { url: j.url!, name: f.name, ...dim }]);
      } catch {
        setArtErr("อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
        break;
      }
    }
    setArtBusy(false);
  }

  // สั่งถึงเกณฑ์จำนวนมากไหม (ตั้งต่อสินค้าได้ในหลังบ้าน)
  const bulkAsk = needsStockCheck(product, qty);

  // 🎨 ต้องแนบลายก่อนสั่งไหม — ต้องมีรูปอัปโหลด หรือ ลิงก์/อีเมล อย่างน้อยหนึ่งอย่าง
  const artRequired = artworkIsRequired(product);
  const artProvided = artFiles.length > 0 || artLink.trim().length > 0;
  const artBlocked = artRequired && !artProvided;

  function handleAdd() {
    if (artBlocked) {
      setArtTouched(false);
      setExtraOpen("art");
      return;
    }
    // แนบข้อมูลเพิ่มไปกับรายการ (ไม่กระทบราคา): ลิงก์ไฟล์ลาย/อีเมล + หมายเหตุ
    const extra: Record<string, string> = {};
    if (artLink.trim()) extra["ลิงก์ไฟล์ลาย/อีเมล"] = artLink.trim();
    if (artFiles.length) extra["ภาพลายที่แนบ"] = artFiles.map((f) => f.url).join(" | ");
    // สั่งจำนวนมาก → ติดธงให้ทีมเช็คสต๊อก/คิวผลิตแล้วยืนยันจำนวนกับลูกค้าก่อนเริ่มงาน
    if (bulkAsk) extra["รอเช็คสต๊อก"] = "สั่งจำนวนมาก — รอทีมงานยืนยันจำนวน";
    if (note.trim()) extra["หมายเหตุ"] = note.trim();
    // จำนวนลายที่คละ (เฉพาะเรทที่มีระบบลาย) — เก็บเป็นตัวเลือกให้เห็นในตะกร้า/ออเดอร์
    if (rate?.minPerDesign && designs >= 1) extra[DESIGN_LABEL] = `${designs} ลาย`;
    if (useCustom) {
      if (!custom || !customValid) return; // ต้องกรอกขนาดให้ครบก่อน
      // เก็บขนาดที่ระบุลง selections (เป็น key ของตะกร้า + ใช้คิดราคาซ้ำ)
      addItem(product.id, { [custom.label]: `${cW}×${cH} ${custom.unit}`, ...extra }, qty);
    } else {
      addItem(product.id, { ...effective, ...extra }, qty);
    }
    setNote("");
    setArtLink("");
    setArtFiles([]);
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

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
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
        <div className="grid gap-6 sm:grid-cols-2 sm:items-start lg:col-span-8 lg:gap-8">
        {/* ── ซ้าย: รูปสินค้า ── */}
        <div>
          {/* รูปสินค้า — ติดหนึบตอนเลื่อนอ่านตัวเลือกยาว ๆ (จอใหญ่) */}
          <div className="lg:sticky lg:top-24">
            <ProductVisual
              emoji={product.images[imageIndex].emoji}
              gradient={product.images[imageIndex].gradient}
              src={product.images[imageIndex].src ?? (imageIndex === 0 ? product.imageSrc : undefined)}
              alt={`${product.name} — ${product.images[imageIndex].label}`}
              size="text-[8rem]"
              eager
              className="aspect-square w-full rounded-[2rem] shadow-inner"
            />
            <div className="mt-3 flex gap-2">
              {product.images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setImageIndex(i)}
                  className={`overflow-hidden rounded-2xl transition ${
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
            {product.images[imageIndex].label && (
              <p className="mt-2 text-center text-xs text-stone-400">
                มุมมอง: {product.images[imageIndex].label}
              </p>
            )}
          </div>
        </div>

        {/* ── กลาง: ชื่อ · รายละเอียด · ข้อควรทราบ ── */}
        <div>
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
        <div>
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
              const fmtCol = (k: string) => k.split("│").join(" · ");
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
                        {cols.map((col) => (
                          <th key={col} className="whitespace-nowrap px-3 py-2 text-center font-bold">
                            {fmtCol(col)}
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
              {rate.minQty ? ` · สั่งรวมขั้นต่ำ ${rate.minQty.toLocaleString("th-TH")} ${matrix?.unit ?? "ชิ้น"}` : ""}
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
        </div>

        {/* ── ขวา: แผงสั่งซื้อ ติดหนึบตอนเลื่อน ── */}
        <div className="lg:col-span-4 lg:sticky lg:top-24">
          <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-amber-100">
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">ราคา</p>
            <div className="mt-4 flex items-baseline gap-2">
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
            </div>
            {matrix ? (
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

          {/* เลือกเรทราคา (สินค้าที่มีหลายเรท เช่น คละดีเทล / ไม่คละดีเทล) */}
          {rates.length > 1 && rate && (
            <div className="mt-5">
              <span className="mb-2 block text-sm font-bold text-stone-700">
                {RATE_LABEL}: <span className="font-semibold text-amber-600">{rate.label}</span>
              </span>
              <div className="grid gap-2">
                {rates.map((r) => {
                  const on = r.label === rate.label;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setRateTouched(true);
                        setRateLabel(r.label);
                      }}
                      className={`rounded-2xl px-4 py-3 text-left text-sm transition ${
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
                      {r.desc && <span className="mt-0.5 block pl-6 text-xs font-normal text-stone-500">{r.desc}</span>}
                      {(r.minQty || r.minPerDesign) && (
                        <span className="mt-0.5 block pl-6 text-[11px] font-semibold text-teal-700">
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
            </div>
          )}

          {/* ตัวเลือกสินค้า (กรอง/ล็อกตามกฎเงื่อนไข) */}
          <div className="mt-5 space-y-4">
            {product.options.map((opt) => {
              const allowedByRules = allowedChoices(product, effective, opt.label);
              // ตัดตัวที่ไม่มีราคาขายในเรทที่เลือกอยู่ (แอดมินล้างแถวทิ้ง) — ตัดหมดแล้วคงชุดเดิมไว้กันหน้าพัง
              const byRate = matrix ? allowedByRules.filter((n) => matrixChoiceAvailable(matrix, opt.label, n)) : allowedByRules;
              const allowed = byRate.length > 0 ? byRate : allowedByRules;
              const locked = allowed.length === 1;
              return (
                <div key={opt.label}>
                  <span className="mb-2 block text-sm font-bold text-stone-700">
                    {opt.label}:{" "}
                    <span className="font-semibold text-amber-600">{effective[opt.label]}</span>
                  </span>
                  {locked ? (
                    <div>
                      <span className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-500 ring-1 ring-stone-200">
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
                      className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                      aria-label={opt.label}
                    >
                      {opt.choices
                        .filter((c) => allowed.includes(c.name))
                        .map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                            {c.extra ? ` +${formatPrice(c.extra)}` : ""}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {opt.choices
                        .filter((c) => allowed.includes(c.name))
                        .map((c) => (
                          <button
                            key={c.name}
                            type="button"
                            onClick={() =>
                              setSelections((s) => ({ ...s, [opt.label]: c.name }))
                            }
                            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                              effective[opt.label] === c.name
                                ? "bg-amber-400 text-white shadow"
                                : "bg-white text-stone-600 ring-1 ring-amber-200 hover:bg-amber-50"
                            }`}
                          >
                            {c.name}
                            {c.extra ? ` +${formatPrice(c.extra)}` : ""}
                          </button>
                        ))}
                    </div>
                  )}
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
              {useCustom && (
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
                      <span className="text-stone-400">กรอกกว้าง × ยาว เพื่อคิดราคา</span>
                    ) : custom.mode === "area" ? (
                      <>
                        ราคา/ชิ้น <span className="font-extrabold text-amber-600">{formatPrice(customPrice)}</span>
                        <span className="text-stone-400"> · {cW}×{cH} {custom.unit}</span>
                      </>
                    ) : (
                      <span className="font-semibold text-amber-600">💬 สอบถามราคา — แอดมินจะตีราคาให้หลังสั่ง</span>
                    )}
                  </p>
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
          <div ref={orderBoxRef} className="mt-6 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-amber-100">
            {/* จำนวน + เพิ่มลงตะกร้า */}
            <div className="mt-6">
              {matrix && (
                <label className="mb-1.5 block text-sm font-bold text-stone-700">
                  จำนวน ({matrix.unit})
                </label>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center rounded-full bg-white ring-1 ring-amber-200">
                  <button
                    type="button"
                    // โหมดเด้งเรทอัตโนมัติ: ลดต่ำกว่าขั้นต่ำเรทปัจจุบันได้ ระบบจะสลับลงเรทที่เหมาะเอง
                    onClick={() => setQty((q) => Math.max(rateTouched ? rateMinQty : 1, q - 1))}
                    className="h-12 w-12 rounded-l-full text-lg font-bold text-stone-600 hover:bg-amber-50"
                    aria-label="ลดจำนวน"
                  >
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={qty}
                    onChange={(e) => {
                      const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                      setQty(Number.isFinite(n) && n > 0 ? Math.min(n, 99999) : 1);
                    }}
                    className="w-16 bg-transparent text-center text-sm font-bold focus:outline-none"
                    aria-label="จำนวน"
                  />
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.min(matrix ? 99999 : 99, q + 1))}
                    className="h-12 w-12 rounded-r-full text-lg font-bold text-stone-600 hover:bg-amber-50"
                    aria-label="เพิ่มจำนวน"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={(useCustom && !customValid) || artBlocked || qty < rateMinQty}
                  className={`flex-1 rounded-full px-6 py-3.5 text-sm font-bold shadow-lg transition sm:flex-none sm:px-10 ${
                    added
                      ? "bg-emerald-500 text-white"
                      : "bg-amber-400 text-white hover:scale-105 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                  }`}
                >
                  {added
                    ? "✓ เพิ่มลงตะกร้าแล้ว!"
                    : artBlocked
                      ? "🎨 แนบลายก่อนถึงจะสั่งได้"
                      : qty < rateMinQty
                      ? `เรทนี้สั่งขั้นต่ำ ${rateMinQty.toLocaleString("th-TH")} ${matrix?.unit ?? "ชิ้น"}`
                      : useCustom && custom?.mode === "quote"
                      ? "🛒 เพิ่มลงตะกร้า (รอตีราคา)"
                      : `🛒 เพิ่มลงตะกร้า — ${formatPrice(unitPrice * qty + designFee)}`}
                </button>
              </div>
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
              {matrix && (
                <p className="mt-2 text-sm text-stone-500">
                  {formatPrice(unitPrice)} / {matrix.unit} × {qty.toLocaleString("th-TH")}
                  {designFee > 0 && <> + ค่าคละลาย {formatPrice(designFee)}</>} ={" "}
                  <span className="font-extrabold text-amber-600">{formatPrice(unitPrice * qty + designFee)}</span>
                </p>
              )}
              {/* จำนวนลายที่คละ (เรทที่กำหนดขั้นต่ำต่อลาย) */}
              {rate?.minPerDesign != null && rate.minPerDesign > 0 && maxDesigns >= 1 && (
                <div className="mt-2 rounded-2xl bg-teal-50 px-3 py-2.5 ring-1 ring-teal-100">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-xs font-bold text-teal-900">🎨 คละกี่ลาย:</span>
                    <div className="flex items-center rounded-full bg-white ring-1 ring-teal-200">
                      <button
                        type="button"
                        onClick={() => {
                          setDesignsTouched(true);
                          setDesigns((d) => Math.max(1, d - 1));
                        }}
                        disabled={designs <= 1}
                        className="h-8 w-8 rounded-l-full text-sm font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-30"
                        aria-label="ลดจำนวนลาย"
                      >
                        −
                      </button>
                      <span className="w-10 text-center text-sm font-bold text-teal-900">{designs}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setDesignsTouched(true);
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
                  <p className="mt-1 text-[11px] leading-relaxed text-teal-800">
                    รวมในราคา {included.toLocaleString("th-TH")} ลาย (ขั้นต่ำลายละ {rate.minPerDesign.toLocaleString("th-TH")} {matrix?.unit ?? "ชิ้น"})
                    {rate.extraDesignFee
                      ? ` · คละเกินได้ ลายละ +${formatPrice(rate.extraDesignFee)}`
                      : " · เพิ่มลายได้ด้วยการเพิ่มจำนวนสั่ง"}
                  </p>
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

          {/* ═══ เพิ่มเติม (ไม่บังคับ) — ยุบไว้ ไม่ให้บังปุ่มซื้อ · โยนรูปลงหน้าไหนก็เปิดให้เอง ═══ */}
          <div className="mt-4 overflow-hidden rounded-3xl bg-white ring-1 ring-stone-200">
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
                className={`mt-5 rounded-2xl p-4 transition ${
                  artDrag ? "bg-sky-100 ring-2 ring-dashed ring-sky-400" : "bg-sky-50/70 ring-1 ring-sky-200"
                }`}
              >
                <p className="text-sm font-bold text-stone-700">
                  🎨 แนบลายของคุณ{" "}
                  {artRequired ? (
                    <span className="font-bold text-rose-600">(จำเป็น — ต้องแนบก่อนสั่ง)</span>
                  ) : (
                    <span className="font-normal text-stone-400">(ไม่บังคับ)</span>
                  )}
                </p>

                {/* 1) อัปโหลดภาพ */}
                <p className="mt-2 text-[11px] font-bold text-stone-600">1) อัปโหลดภาพตัวอย่าง (JPG / PNG)</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">
                  ใช้<strong className="text-sky-700">เป็นแนวทางให้กราฟฟิกเท่านั้น</strong> — ไฟล์งานพิมพ์คุณภาพเต็ม แนบเป็นลิงก์ในข้อ 2 ครับ
                </p>

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
                    className={`mt-2 flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${
                      artDrag ? "border-sky-500 bg-sky-100" : "border-sky-300 bg-white hover:border-sky-400 hover:bg-sky-50"
                    }`}
                  >
                    {artBusy ? (
                      <span className="text-xs font-bold text-sky-700">กำลังอัปโหลด…</span>
                    ) : artDrag ? (
                      <span className="text-sm font-extrabold text-sky-700">⬇️ ปล่อยไฟล์ตรงนี้ได้เลย</span>
                    ) : (
                      <>
                        <span className="text-2xl leading-none">🖼️</span>
                        <span className="text-xs font-extrabold text-sky-700">แตะเพื่อเลือกไฟล์ · ลากรูปมาวาง · หรือ ⌘/Ctrl+V</span>
                        <span className="text-[11px] font-normal text-stone-400">JPG / PNG / WEBP · สูงสุด 5 รูป · ไม่เกิน 15MB</span>
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
                <label htmlFor="art-link" className="mt-4 block text-[11px] font-bold text-stone-600">
                  2) แนบลิงก์ไฟล์ลาย หรือ อีเมล <span className="font-normal text-sky-700">(แนะนำ — ได้ไฟล์คุณภาพเต็ม)</span>
                </label>
                <p className="mt-0.5 mb-2 text-[11px] leading-relaxed text-stone-500">
                  Google Drive / Dropbox / OneDrive หรืออีเมลที่ส่งไฟล์ไว้ — เราดึงไฟล์ต้นฉบับไปใช้ผลิต
                </p>
                <input
                  id="art-link"
                  type="text"
                  value={artLink}
                  onChange={(e) => setArtLink(e.target.value.slice(0, 500))}
                  placeholder="เช่น https://drive.google.com/…  หรือ  yourmail@gmail.com"
                  className="w-full rounded-xl bg-white px-4 py-2.5 text-sm text-stone-700 ring-1 ring-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
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


      {/* รายละเอียดสินค้า (body) */}
      {(product.body ?? []).length > 0 && (
        <section className="mt-16">
          <h2 className="text-center text-2xl font-extrabold text-amber-950">
            รายละเอียดสินค้า {product.name}
          </h2>
          <div className="mt-8 space-y-12">
            {(product.body ?? []).map((sec, i) => (
              <div
                key={`${sec.heading}-${i}`}
                className={`grid items-center gap-6 md:gap-10 ${sec.image ? "md:grid-cols-2" : ""}`}
              >
                {sec.image && (
                  <ProductVisual
                    emoji={sec.image.emoji}
                    gradient={sec.image.gradient}
                    src={sec.image.src}
                    alt={sec.image.label || sec.heading}
                    size="text-[6rem]"
                    className={`aspect-[4/3] w-full rounded-[2rem] shadow-sm ${
                      sec.align === "right" ? "md:order-2" : ""
                    }`}
                  />
                )}
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
        </div>
      </div>
      {/* กันแถบลอยบังเนื้อหาท้ายหน้า */}
      <div className="h-20 lg:hidden" aria-hidden />
    </div>
  );
}
