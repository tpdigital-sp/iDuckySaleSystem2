"use client";

import { productAutoSeo } from "@/lib/auto-seo";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  allowedChoices,
  customUnitPrice,
  formatPrice,
  formatPriceRange,
  getCategory,
  priceMatrixKey,
  priceRange,
  PRODUCTS,
  resolveSelections,
  tierIndex,
  unitPriceFor,
  type Product,
} from "@/lib/products";
import { useCart } from "@/lib/cart-context";
import { canAccessAdmin } from "@/lib/auth";
import { fetchProduct } from "@/lib/product-repo";
import ProductVisual from "@/components/ProductVisual";
import ProductCard from "@/components/ProductCard";

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
  const effective = useMemo(
    () => resolveSelections(product, selections),
    [product, selections]
  );

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

  // tier ปัจจุบันของราคาขั้นบันได (ถ้ามี)
  const currentTier = useMemo(() => {
    if (!product.pricing) return null;
    return tierIndex(product.pricing, qty);
  }, [product, qty]);

  const related = PRODUCTS.filter(
    (p) => p.category === product.category && p.id !== product.id
  ).slice(0, 4);

  // แสดงปุ่มลัดไปหลังบ้านเฉพาะแอดมิน (โหมดเดโม = เห็นเสมอ, โหมดจริง = ต้องล็อกอิน)
  useEffect(() => {
    canAccessAdmin().then(setIsAdmin);
  }, []);

  // โยนไฟล์พลาดนอกกรอบ = เบราว์เซอร์จะเปิดไฟล์นั้นแทนหน้าเว็บ → กันไว้ทั้งหน้า
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);

  // วางรูปจากคลิปบอร์ดได้เลย (ก๊อปจากแชท/โปรแกรมแต่งรูปแล้ว ⌘/Ctrl+V)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
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

  function handleAdd() {
    // แนบข้อมูลเพิ่มไปกับรายการ (ไม่กระทบราคา): ลิงก์ไฟล์ลาย/อีเมล + หมายเหตุ
    const extra: Record<string, string> = {};
    if (artLink.trim()) extra["ลิงก์ไฟล์ลาย/อีเมล"] = artLink.trim();
    if (artFiles.length) extra["ภาพลายที่แนบ"] = artFiles.map((f) => f.url).join(" | ");
    if (note.trim()) extra["หมายเหตุ"] = note.trim();
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
      <nav className="text-xs text-stone-400">
        <Link href="/" className="hover:text-amber-600">หน้าแรก</Link>
        {" › "}
        <Link href={`/products?category=${category.id}`} className="hover:text-amber-600">
          {category.name}
        </Link>
        {" › "}
        <span className="text-stone-600">{product.name}</span>
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        {/* รูปสินค้า */}
        <div>
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

        {/* ข้อมูลสินค้า */}
        <div>
          <span className="text-xs font-semibold text-amber-500">
            {category.emoji} {category.name}
          </span>
          <h1 className="mt-1 text-2xl font-extrabold text-stone-900 md:text-3xl">
            {product.name}
          </h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-stone-500">
            <span>⭐ {product.rating}</span>
            <span>·</span>
            <span>ขายแล้ว {product.sold.toLocaleString("th-TH")} ชิ้น</span>
          </div>

          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-amber-600">{formatPrice(unitPrice)}</span>
            {product.pricing ? (
              <span className="text-sm font-semibold text-stone-500">/ {product.pricing.unit}</span>
            ) : (
              product.oldPrice && (
                <span className="text-base text-stone-400 line-through">
                  {formatPrice(product.oldPrice)}
                </span>
              )
            )}
          </div>
          {product.pricing ? (
            <p className="mt-1 text-xs text-stone-400">
              💡 เรทราคา {formatPriceRange(product)} ต่อ{product.pricing.unit} — ยิ่งสั่งเยอะ ยิ่งถูก (ราคาปรับตามจำนวน)
            </p>
          ) : (
            priceRange(product).max > priceRange(product).min && (
              <p className="mt-1 text-xs text-stone-400">
                💡 เรทราคา {formatPriceRange(product)} ขึ้นกับตัวเลือกที่เลือก
              </p>
            )
          )}

          <p className="mt-4 text-sm leading-relaxed text-stone-600">{product.description}</p>

          {/* ตัวเลือกสินค้า (กรอง/ล็อกตามกฎเงื่อนไข) */}
          <div className="mt-5 space-y-4">
            {product.options.map((opt) => {
              const allowed = allowedChoices(product, effective, opt.label);
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
              🎨 แนบลายของคุณ <span className="font-normal text-stone-400">(ไม่บังคับ)</span>
            </p>

            {/* 1) อัปโหลดภาพ */}
            <p className="mt-2 text-[11px] font-bold text-stone-600">1) อัปโหลดภาพตัวอย่าง (JPG / PNG)</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">
              ระบบเก็บไฟล์<strong className="text-stone-700">ตามต้นฉบับที่คุณเลือก ไม่บีบอัดซ้ำ</strong> — แต่ภาพที่ส่งต่อมาจากแชท/มือถือมักถูกลดคุณภาพมาตั้งแต่ต้นทาง
              ภาพตรงนี้จึงใช้ <strong className="text-sky-700">ให้กราฟฟิกดูเป็นแนวทางในการทำแบบเท่านั้น</strong> · ไฟล์งานพิมพ์คุณภาพเต็ม รบกวนแนบเป็นลิงก์ในช่องข้อ 2 ครับ
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
                    <span className="text-xs font-extrabold text-sky-700">ลากรูปมาวางตรงนี้ · แตะเพื่อเลือกไฟล์ · หรือกด ⌘/Ctrl+V วางรูปที่ก๊อปไว้</span>
                    <span className="text-[11px] font-normal text-stone-400">JPG / PNG / WEBP · สูงสุด 5 รูป · ไฟล์ละไม่เกิน 15MB</span>
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
              2) แนบลิงก์ไฟล์ลาย หรือ อีเมล <span className="font-normal text-sky-700">(แนะนำ — ได้ไฟล์ต้นฉบับคุณภาพเต็ม)</span>
            </label>
            <p className="mt-0.5 mb-2 text-[11px] leading-relaxed text-stone-500">
              วางลิงก์ไฟล์ (Google Drive / Dropbox / OneDrive) หรืออีเมลที่ส่งไฟล์ไว้ — เราจะดึงไฟล์ต้นฉบับไปใช้ผลิต (ไม่ผ่านการบีบอัดของเว็บ/แชท)
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

          {/* จำนวน + เพิ่มลงตะกร้า */}
          <div className="mt-6">
            {product.pricing && (
              <label className="mb-1.5 block text-sm font-bold text-stone-700">
                จำนวน ({product.pricing.unit})
              </label>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center rounded-full bg-white ring-1 ring-amber-200">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
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
                  onClick={() => setQty((q) => Math.min(product.pricing ? 99999 : 99, q + 1))}
                  className="h-12 w-12 rounded-r-full text-lg font-bold text-stone-600 hover:bg-amber-50"
                  aria-label="เพิ่มจำนวน"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={handleAdd}
                disabled={useCustom && !customValid}
                className={`flex-1 rounded-full px-6 py-3.5 text-sm font-bold shadow-lg transition sm:flex-none sm:px-10 ${
                  added
                    ? "bg-emerald-500 text-white"
                    : "bg-amber-400 text-white hover:scale-105 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                }`}
              >
                {added
                  ? "✓ เพิ่มลงตะกร้าแล้ว!"
                  : useCustom && custom?.mode === "quote"
                    ? "🛒 เพิ่มลงตะกร้า (รอตีราคา)"
                    : `🛒 เพิ่มลงตะกร้า — ${formatPrice(unitPrice * qty)}`}
              </button>
            </div>
            {product.pricing && (
              <p className="mt-2 text-sm text-stone-500">
                {formatPrice(unitPrice)} / {product.pricing.unit} × {qty.toLocaleString("th-TH")} ={" "}
                <span className="font-extrabold text-amber-600">{formatPrice(unitPrice * qty)}</span>
              </p>
            )}
          </div>

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

          {/* ตารางราคาขั้นบันได (rate card) — คอลัมน์เยอะโชว์เฉพาะที่เลือกอยู่ */}
          {product.pricing &&
            (() => {
              const allKeys = Object.keys(product.pricing.cells);
              const selectedKey = priceMatrixKey(product.pricing, effective);
              const cols = allKeys.length <= 6 ? allKeys : allKeys.filter((k) => k === selectedKey);
              const fmtCol = (k: string) => k.split("│").join(" · ");
              return (
                <div className="mt-4 overflow-x-auto rounded-2xl ring-1 ring-stone-200">
                  {allKeys.length > 6 && (
                    <p className="bg-stone-50 px-3 py-1.5 text-[11px] text-stone-500">
                      💡 เรทราคาของตัวเลือกที่คุณเลือก — เปลี่ยนตัวเลือกด้านบนเพื่อดูราคาชนิดอื่น
                    </p>
                  )}
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-sky-100 text-sky-900">
                        <th className="whitespace-nowrap px-3 py-2 text-left font-bold">จำนวน ({product.pricing.unit})</th>
                        {cols.map((col) => (
                          <th key={col} className="whitespace-nowrap px-3 py-2 text-center font-bold">
                            {fmtCol(col)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {product.pricing.tiers.map((tier, ti) => {
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
                                  {formatPrice(product.pricing!.cells[col][ti])}
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

          <p className="mt-3 rounded-2xl bg-sky-50 px-4 py-3 text-xs leading-relaxed text-sky-800 ring-1 ring-sky-100">
            🎨 <strong>อยากใส่ลายของตัวเอง?</strong> ระบบอัปโหลดลายพร้อมพรีวิวบนสินค้ากำลังจะเปิดให้ใช้เร็ว ๆ นี้
            — ตอนนี้สั่งซื้อก่อนแล้วส่งไฟล์ลายให้แอดมินทาง LINE ได้เลย
          </p>

          {/* จุดเด่น */}
          <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
    </div>
  );
}
