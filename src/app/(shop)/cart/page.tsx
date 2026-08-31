"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LINE_URL } from "@/components/LineButton";
import {
  activeMatrix,
  activeRate,
  designCountOf,
  DESIGN_LABEL,
  formatPrice,
  isRetailRateLine,
  lotShortfalls,
  maxDesignsFor,
  perUnitCapacity,
  productPath,
  qtyFromAreaOf,
  RATE_LABEL,
} from "@/lib/products";
import {
  orderBoxFees,
  boxFeeTotal,
  boxFeesOf,
  fetchShopPayment,
  freeShippingMinOf,
  giftPromosOf,
  shippingOf,
  DEFAULT_SHIPPING,
  type BoxFee,
  type OrderBoxFee,
  type ShippingMethod,
} from "@/lib/shop-settings";
import {
  giftsFor,
  giftSizesOf,
  resolveGiftSize,
  splitGiftBySheet,
  readGiftSizes,
  writeGiftSizes,
  type GiftPromo,
} from "@/lib/gifts";
import GiftPanel from "@/components/GiftPanel";
import { useCart } from "@/lib/cart-context";
import { PLACEMENT_SPEC_LABEL } from "@/lib/design-templates";
import BoxFeeTag from "@/components/BoxFeeTag";
import ProductVisual from "@/components/ProductVisual";
import { SpecLines } from "@/components/SpecLines";
import { getAppendTarget, clearAppendTarget, type AppendTarget } from "@/lib/append-order";
import { getUnpicked, setUnpicked as saveUnpicked, clearUnpicked } from "@/lib/cart-select";
import { getQuoteTarget, clearQuoteTarget, type QuoteTarget } from "@/lib/append-quote";
import { cartQtyShipFee, pickShipping, shipProfileOf, shippingAllowed } from "@/lib/shipping-auto";

const USE_BY_KEY = "ducky-use-by-date";
/** วิธีจัดส่งที่ลูกค้ากดเลือกเอง (เก็บ "ลายเซ็นตะกร้า" ตอนที่กด — ตะกร้าเปลี่ยน = ให้ระบบคิดใหม่) */
const SHIP_PICK_KEY = "iducky-shipping-pick-v1";

export default function CartPage() {
  const { items, setQty, removeItem, addItem, clear, productOf } = useCart();
  const router = useRouter();
  // สั่งเป็นออเดอร์ใหม่ หรือเพิ่มเข้าออเดอร์เดิม (ลูกค้ากดมาจากหน้าออเดอร์)
  const [appendTo, setAppendTo] = useState<AppendTarget | null>(null);
  /** รายการที่ลูกค้าเอาติ๊กออก (คีย์ของ cart item) — ที่เหลือ = สั่งรอบนี้ · ของที่เพิ่งหยิบเข้ามาถือว่าเลือกไว้เสมอ */
  const [unpicked, setUnpicked] = useState<string[]>([]);
  // 📄 โหมดหยิบใส่ใบเสนอราคา (แอดมินกดมาจากหน้าใบเสนอราคา) — ของที่หยิบจะเข้าใบนั้น ไม่สร้างออเดอร์
  const [quoteTo, setQuoteTo] = useState<QuoteTarget | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteErr, setQuoteErr] = useState("");
  useEffect(() => {
    setAppendTo(getAppendTarget());
    setUnpicked(getUnpicked());
    setQuoteTo(getQuoteTarget());
  }, []);

  async function sendToQuote() {
    if (!quoteTo) return;
    setQuoteBusy(true);
    setQuoteErr("");
    const res = await fetch("/api/admin/quotes/append", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: quoteTo.id,
        items: pickedItems.map((i) => {
          // แยกภาพลาย/ธงเช็คสต๊อกออกจากข้อความตัวเลือก (เหมือนตอน checkout) ไม่งั้น URL ยาวจะรกใบเสนอราคา
          const { "ภาพลายที่แนบ": artRaw, "รอเช็คสต๊อก": _bulk, ...restSel } = i.selections;
          const artworkUrls = (artRaw ?? "").split(" | ").map((u) => u.trim()).filter(Boolean);
          return {
            productId: i.productId,
            name: productOf(i.productId)?.name ?? i.productId,
            selections: Object.entries(restSel)
              .filter(([k]) => k !== PLACEMENT_SPEC_LABEL)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · "),
            qty: i.qty,
            unitPrice: i.unitPrice,
            ...(artworkUrls.length ? { artworkUrls } : {}),
          };
        }),
      }),
    });
    const j = await res.json().catch(() => ({}));
    setQuoteBusy(false);
    if (!res.ok) return setQuoteErr(j.error ?? "เพิ่มเข้าใบเสนอราคาไม่สำเร็จ");
    // เอาเฉพาะที่โยนเข้าใบไปแล้วออกจากตะกร้า — ที่ไม่ได้ติ๊กยังอยู่ต่อ
    pickedItems.forEach((i) => removeItem(i.key));
    clearUnpicked();
    setUnpicked([]);
    clearQuoteTarget();
    router.push(`/admin/quotes/${encodeURIComponent(quoteTo.id)}`);
  }
  /* 📦 ค่ากล่อง/ค่าแพ็คที่ระบบบวกให้เอง (เช่น งานโปสเตอร์/ขนาด A3 +30)
     คิด "ครั้งเดียวต่อออเดอร์" ต่อกติกา — หลายรายการเข้าเงื่อนไขก็ใบเดียว
     ตั้งค่าที่ /admin/settings?tab=box — ยังไม่เคยตั้ง = ใช้กติกาเริ่มต้นในโค้ด */
  const [boxFees, setBoxFees] = useState<BoxFee[]>(boxFeesOf(null));

  // ✅ ติ๊กเลือกเฉพาะรายการที่จะสั่งรอบนี้ — ยอดรวม/ค่าส่ง/ปุ่มสั่งซื้อ คิดจากที่ติ๊กไว้เท่านั้น
  const isPicked = (key: string) => !unpicked.includes(key);
  const pickedItems = items.filter((i) => isPicked(i.key));
  const allPicked = pickedItems.length === items.length;
  /** ค่ากล่องของ "ออเดอร์รอบนี้" (เฉพาะที่ติ๊ก) — ป้ายราคาแขวนกับรายการแรกที่เข้าเงื่อนไข */
  const boxFeeRows = orderBoxFees(
    pickedItems.map((i) => ({
      productId: i.productId,
      category: productOf(i.productId)?.category,
      selections: i.selections,
      qty: i.qty,
    })),
    boxFees
  );
  const boxFeeSum = boxFeeTotal(boxFeeRows);
  /** ป้ายห้อยของแต่ละรายการ: primary = แขวนราคา · included = เข้าเงื่อนไขแต่ไม่คิดซ้ำ */
  const boxTagByKey = new Map<string, { primary: OrderBoxFee[]; included: BoxFee[] }>();
  for (const b of boxFeeRows) {
    b.matched.forEach((idx, j) => {
      const key = pickedItems[idx].key;
      const cur = boxTagByKey.get(key) ?? { primary: [], included: [] };
      if (j === 0) cur.primary.push(b);
      else cur.included.push(b.fee);
      boxTagByKey.set(key, cur);
    });
  }
  /**
   * 📦 ล็อตที่ยังไม่ถึงยอดสั่งขั้นต่ำ (เรทที่ตั้ง minQtyScope: "lot")
   * เช่น สติ๊กเกอร์ UV ขั้นต่ำ 3 แผ่น A3 ต่อเนื้อ 1 ชนิด — 3 แผ่นนั้นคละไดคัท/คละขนาดกันได้
   * (= คนละบรรทัด บรรทัดละ 1 แผ่น) หน้าสินค้าจึงไม่ล็อก มาบล็อกที่นี่แทนเมื่อยอดรวมยังไม่ถึง
   */
  const shortLots = lotShortfalls(
    pickedItems.map((i) => ({ productId: i.productId, selections: i.selections, qty: i.qty })),
    productOf
  );
  const subtotal =
    pickedItems.reduce((n, i) => n + i.unitPrice * i.qty + (i.extraFee ?? 0), 0) + boxFeeSum;
  const totalQty = pickedItems.reduce((n, i) => n + i.qty, 0);
  function commitUnpicked(next: string[]) {
    setUnpicked(next);
    saveUnpicked(next);
  }
  function togglePick(key: string) {
    commitUnpicked(unpicked.includes(key) ? unpicked.filter((k) => k !== key) : [...unpicked, key]);
  }
  /** ติ๊กทั้งหมด / เอาออกทั้งหมด */
  function togglePickAll() {
    commitUnpicked(allPicked ? items.map((i) => i.key) : []);
  }
  /**
   * ปรับจำนวนในตะกร้า — ร้านรับสั่งขั้นต่ำ 1 ชิ้นเสมอ ห้ามล็อกเพราะ "เรทที่เลือกไว้" มีขั้นต่ำสูง
   * ลดต่ำกว่าขั้นต่ำของเรท → สลับลงเรทที่รับจำนวนนั้นได้ (ปกติคือเรทปลีก) เหมือนหน้าสินค้า
   * ไม่งั้นลูกค้าจะได้ราคาเรทส่งทั้งที่สั่งไม่ถึงเกณฑ์
   */
  function changeQty(item: (typeof items)[number], next: number) {
    if (next < 1) return;
    const p = productOf(item.productId);
    // 📐 สินค้าขายเป็นพื้นที่ (qtyFromArea) — จำนวนล็อกตามขนาดที่กรอกไว้ตอนสั่ง ปรับในตะกร้าไม่ได้
    // ไม่งั้นเลี่ยงราคาได้: สั่ง 140×200 ซม. (คิด 3 ตร.ม.) แล้วมาลดเหลือ 1 ตร.ม. ที่นี่
    if (p && qtyFromAreaOf(p, item.selections) != null) return;
    const rates = p?.priceRates ?? [];
    let rate = p ? activeRate(p, item.selections) : undefined;
    let selections = item.selections;
    if (p && rates.length > 1 && rate && (rate.minQty ?? 1) > next) {
      const fit = [...rates]
        .filter((r) => (r.minQty ?? 1) <= next)
        .sort((a, b) => (b.minQty ?? 1) - (a.minQty ?? 1))[0];
      if (fit && fit.label !== rate.label) {
        selections = { ...selections, [RATE_LABEL]: fit.label };
        rate = fit;
      }
    }
    /*
     * 🔒 สินค้าที่ล็อกโควตาคละลาย (hardMaxDesigns) — ลดจำนวนในตะกร้าแล้วโควตาลายต้องหดตามด้วย
     * ไม่งั้นเลี่ยงกติกาได้: สั่ง 12 ชิ้นคละ 4 ลายที่หน้าสินค้า แล้วมาลดเหลือ 11 ชิ้นในตะกร้า
     */
    if (p?.hardMaxDesigns && rate?.minPerDesign) {
      const cap = maxDesignsFor(rate, next, perUnitCapacity(p, selections) ?? 1);
      if (designCountOf(selections) > cap) selections = { ...selections, [DESIGN_LABEL]: `${cap} ลาย` };
    }
    // เปลี่ยนตัวเลือก = คนละรายการในตะกร้า (key คิดจาก selections) จึงต้องถอดของเดิมแล้วใส่ใหม่
    if (selections !== item.selections) {
      removeItem(item.key);
      addItem(item.productId, selections, next, p);
      return;
    }
    setQty(item.key, next);
  }
  function removePicked() {
    pickedItems.forEach((i) => removeItem(i.key));
    commitUnpicked(unpicked.filter((k) => !pickedItems.some((i) => i.key === k)));
  }

  // วันที่ต้องใช้งาน — เก็บไว้ให้หน้า checkout ส่งเข้าออเดอร์
  const [useBy, setUseBy] = useState("");
  useEffect(() => {
    try {
      setUseBy(localStorage.getItem(USE_BY_KEY) ?? "");
    } catch {}
  }, []);
  function saveUseBy(v: string) {
    setUseBy(v);
    try {
      if (v) localStorage.setItem(USE_BY_KEY, v);
      else localStorage.removeItem(USE_BY_KEY);
    } catch {}
  }
  // 🎁 ของแถมฟรี — นับเฉพาะบรรทัดที่ลูกค้าติ๊กสั่งรอบนี้ ให้ตรงกับยอดรวมด้านล่าง
  //    (เซิร์ฟเวอร์คิดใหม่เองตอนสร้างออเดอร์ ตรงนี้เป็นแค่ป้ายบอกลูกค้า)

  // รูปแบบจัดส่ง + โปรส่งฟรี ดึงจากที่แอดมินตั้งค่าไว้ (ระหว่างโหลดใช้ค่าเริ่มต้นไปก่อน)
  const [methods, setMethods] = useState<ShippingMethod[]>(DEFAULT_SHIPPING);
  /** ดึงรายการวิธีส่งจริงของร้านมาแล้วหรือยัง (ก่อนหน้านั้นเป็นค่าเริ่มต้นในโค้ด ยังตัดสินใจแทนลูกค้าไม่ได้) */
  const [shipLoaded, setShipLoaded] = useState(false);
  const [freeMin, setFreeMin] = useState(0);
  // 🎁 โปรของแถมฟรี (แอดมินตั้งที่ /admin/settings?tab=gift)
  const [giftPromos, setGiftPromos] = useState<GiftPromo[]>([]);
  // 📐 ขนาดของแถมที่ลูกค้าเลือกไว้ ({ promoId: "9 × 9 cm" }) — หน้าชำระเงินอ่านต่อไปใส่ในออเดอร์
  const [giftSize, setGiftSize] = useState<Record<string, string>>({});
  useEffect(() => setGiftSize(readGiftSizes()), []);
  function pickGiftSize(promoId: string, label: string) {
    setGiftSize((cur) => {
      const next = { ...cur, [promoId]: label };
      writeGiftSizes(next);
      return next;
    });
  }
  const [shippingId, setShippingId] = useState<string>(DEFAULT_SHIPPING[0].id);
  /**
   * ✋ ลายเซ็นตะกร้าตอนที่ลูกค้า "กดเลือกวิธีส่งเอง"
   * ไม่ตรงกับตะกร้าตอนนี้ = ค่าที่จำไว้มาจากออเดอร์ก่อน → ระบบเลือกกล่องที่พอดีให้ใหม่
   * (กันเคส: ออเดอร์ก่อนยอดถึงเกณฑ์เลยเด้ง EMS 100 แล้วค้างมาทับออเดอร์ใหม่ที่ยอดไม่ถึง)
   */
  const [pickSig, setPickSig] = useState<string>("");

  useEffect(() => {
    fetchShopPayment().then((p) => {
      const list = shippingOf(p);
      setMethods(list);
      setFreeMin(freeShippingMinOf(p));
      setGiftPromos(giftPromosOf(p));
      setBoxFees(boxFeesOf(p));
      setShipLoaded(true);
      // ถ้าที่จำไว้ไม่มีในรายการแล้ว → กลับไปใช้ตัวแรก
      setShippingId((cur) => (list.some((m) => m.id === cur) ? cur : list[0].id));
    });
  }, []);

  // จำวิธีจัดส่งที่เลือก เพื่อส่งต่อไปหน้าแจ้งโอนเงิน
  useEffect(() => {
    const s = localStorage.getItem("iducky-shipping-v1");
    if (s) setShippingId(s);
    setPickSig(localStorage.getItem(SHIP_PICK_KEY) ?? "");
  }, []);
  useEffect(() => {
    localStorage.setItem("iducky-shipping-v1", shippingId);
  }, [shippingId]);

  // 📦 สินค้าที่ตั้ง "ค่าส่งตามจำนวนชิ้น" ไว้ (ของหนัก เช่น แผ่นหินรองแก้ว)
  // รวมจำนวนต่อสินค้า (สินค้าเดียวกันอาจอยู่หลายแถวเพราะเลือกตัวเลือกต่างกัน)
  // 🎛️ ขนาดที่แอดมินตั้งตารางค่าส่งของตัวเองไว้ = นับแยกกลุ่ม (คนละกล่อง คนละตาราง)
  const qtyShip = (() => {
    const groups = new Map<
      string,
      { name: string; qty: number; tiers?: ReturnType<typeof shipProfileOf>["tiers"]; extra?: number; overflowMethodId?: string }
    >();
    for (const i of pickedItems) {
      const p = productOf(i.productId);
      const prof = shipProfileOf(p, i.selections);
      const key = `${i.productId}|${prof.ruleKey}`;
      const cur = groups.get(key);
      if (cur) {
        cur.qty += i.qty;
        continue;
      }
      groups.set(key, {
        name: (p?.name ?? i.productId) + (prof.ruleKey ? ` (${prof.ruleLabel})` : ""),
        qty: i.qty,
        tiers: prof.tiers,
        extra: prof.extra,
        overflowMethodId: prof.overflowMethodId,
      });
    }
    return cartQtyShipFee([...groups.values()].filter((x) => x.tiers?.length), methods);
  })();

  // 🛍️ ทุกบรรทัดยังอยู่เรทปลีก (เช่น 1-10 ชิ้น) = ของไม่กี่ชิ้น กล่องเล็กใส่พอ
  // ยอดเงินถึงเกณฑ์กล่องใหญ่ก็ไม่ต้องเด้งค่าส่งแพงขึ้น (ของแพงไม่ได้แปลว่ากล่องใหญ่)
  const retailOnly = pickedItems.every((i) => {
    const p = productOf(i.productId);
    return !p || isRetailRateLine(p, i.selections, i.qty, i.merged?.rateLabel);
  });

  // 🚚 ระบบเลือกวิธีจัดส่งให้เอง — ของเยอะ/ของชิ้นใหญ่ ต้องกล่องใหญ่ ไม่ปล่อยให้ค้างที่กล่องเล็ก
  // รวมทั้งของที่เกินขั้นค่าส่งจนต้องเปลี่ยนวิธีส่ง (เช่น ส่งแมส)
  const auto = pickShipping(methods, {
    totalQty,
    subtotal,
    retailOnly,
    requiredIds: [
      // ค่าส่งขั้นต่ำ — เอาตามตัวเลือกที่เลือกจริง (ขนาดใหญ่บังคับกล่องใหญ่ได้)
      ...(pickedItems.map((i) => shipProfileOf(productOf(i.productId), i.selections).shippingId).filter(Boolean) as string[]),
      ...qtyShip.forceIds,
    ],
  });
  /** ตะกร้าชุดนี้เป็นยังไง — เปลี่ยนเมื่อไหร่ ค่าส่งที่ "เลือกเองไว้" ก็ถือว่าหมดอายุ */
  const cartSig = pickedItems.map((i) => `${i.key}:${i.qty}`).join("|");
  /** ลูกค้ากดเลือกวิธีส่งเอง — จำคู่กับตะกร้าชุดนี้ไว้ (ข้ามไปหน้า checkout แล้วกลับมาก็ยังอยู่) */
  function chooseShipping(id: string) {
    setShippingId(id);
    setPickSig(cartSig);
    localStorage.setItem(SHIP_PICK_KEY, cartSig);
  }
  // ลูกค้าเปลี่ยนเองได้ แต่ถ้าตะกร้าเปลี่ยนจนต้องใช้กล่องใหญ่ขึ้น ระบบยกระดับให้ทันที
  useEffect(() => {
    // ⏳ ยังไม่ได้รายการวิธีส่งจริง/ตะกร้ายังโหลดไม่เสร็จ = ยังตัดสินใจแทนลูกค้าไม่ได้
    // (เผลอทับตอนนี้ = "มารับเอง" ที่ลูกค้าเลือกไว้เด้งกลับเป็นส่งพัสดุทุกครั้งที่รีเฟรช)
    if (!shipLoaded || !methods.length || !auto.id || !pickedItems.length) return;
    const cur = methods.find((m) => m.id === shippingId);
    if (!cur || !shippingAllowed(cur, methods, auto)) {
      setShippingId(auto.id);
      return;
    }
    // ไม่ได้กดเลือกเองกับตะกร้าชุดนี้ + แพงกว่าที่ออเดอร์นี้ต้องใช้ → กลับมาที่กล่องที่พอดี
    // (มารับเอง/ส่งฟรี ราคา 0 ไม่เข้าเงื่อนไขนี้ ยังจำไว้เหมือนเดิม)
    const autoM = methods.find((m) => m.id === auto.id);
    if (pickSig !== cartSig && autoM && cur.price > autoM.price) setShippingId(auto.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipLoaded, auto.id, auto.floorId, methods.length, shippingId, pickSig, cartSig]);

  const shippingMethod = methods.find((s) => s.id === shippingId) ?? methods[0];
  const freeShipping = freeMin > 0 && subtotal >= freeMin;

  // 🚚 ค่ากล่องปกติถูกยกเว้นไหม — ส่งฟรีตามยอด / สั่งเพิ่มเข้าออเดอร์เดิม (ส่งรวมกล่องเดิม)
  const methodFree = !!appendTo || freeShipping;
  // 📦 ค่าส่งตามจำนวนชิ้น (ของหนัก) = ต้นทุนกล่อง/น้ำหนักจริง — โปรส่งฟรีและการสั่งเพิ่ม "ไม่ล้าง" ส่วนนี้
  // (ของหนักใส่กล่องเดิมไม่ได้/ค่าขนส่งจริงแพงกว่าพัสดุปกติมาก ร้านออกให้ไม่ไหว)
  // มารับเอง (ราคา 0) = ไม่มีพัสดุ ไม่คิดอะไรเลย
  const shippingCost =
    shippingMethod.price === 0 ? 0 : methodFree ? qtyShip.fee : Math.max(shippingMethod.price, qtyShip.fee);
  const qtyShipApplied = shippingMethod.price !== 0 && qtyShip.fee > 0;

  // 📦 มีค่าตามจำนวน → วิธีส่งที่ถูกกว่าค่านี้จ่ายเท่ากันหมด ยุบรวมเป็นแถวเดียวราคาตรงกับที่จ่ายจริง
  // (กันลูกค้างงว่าทำไมติ๊ก EMS 50 แต่โดนคิด 100) · วิธีที่แพงกว่า กับมารับเอง ยังแยกแถวปกติ
  const shipRows: { id: string; name: string; price: number; note?: string; covers?: string[] }[] = (() => {
    if (!qtyShipApplied) return methods;
    const paid = methods.filter((m) => m.price > 0);
    // ค่ากล่องปกติถูกยกเว้นอยู่แล้ว (ส่งฟรี/ส่งรวมกล่องเดิม) → ทุกวิธีจ่ายเท่ากันหมด = ค่าของหนักอย่างเดียว
    const covered = methodFree ? paid : paid.filter((m) => m.price <= qtyShip.fee);
    const rows: { id: string; name: string; price: number; note?: string; covers?: string[] }[] = [];
    if (covered.length) {
      // ตัวแทนแถวยุบ: ใช้วิธีที่ระบบเลือก (ถ้าอยู่ในกลุ่ม) ไม่งั้นตัวแพงสุดในกลุ่ม (กล่องใหญ่สุดที่คุ้มแล้ว)
      const rep = covered.find((m) => m.id === auto.id) ?? covered[covered.length - 1];
      rows.push({
        id: rep.id,
        name: "📦 ส่งพัสดุ (คิดตามจำนวนชิ้น)",
        price: qtyShip.fee,
        note: methodFree
          ? "ค่ากล่องปกติฟรีแล้ว — เหลือเฉพาะค่าน้ำหนักของชิ้นใหญ่"
          : "รวมค่ากล่อง/น้ำหนักของออเดอร์นี้แล้ว",
        covers: covered.map((m) => m.id),
      });
    }
    rows.push(...paid.filter((m) => !covered.includes(m)));
    rows.push(...methods.filter((m) => m.price === 0));
    return rows;
  })();
  const total = subtotal + shippingCost;
  // 🎁 ของแถมฟรีที่ออเดอร์นี้ได้ (คิดจากรายการที่ติ๊กไว้)
  const giftRows = giftsFor(
    pickedItems.map((i) => ({ productId: i.productId, qty: i.qty, selections: i.selections })),
    (id) => productOf(id)?.category,
    giftPromos
  );
  const remainForFree = freeMin - subtotal;

  /** เมฆพื้นหลัง — ชุดเดียวกับหน้าแรก */
  const sky = (
    <div className="shopp-sky" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="oc1" src="/landing/cloud.webp" alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="oc2" src="/landing/cloud.webp" alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="oc3" src="/landing/cloud.webp" alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="oc4" src="/landing/cloud.webp" alt="" />
    </div>
  );

  if (items.length === 0) {
    return (
      <div className="shopp">
        {sky}
        <div className="shopp-in" style={{ maxWidth: 540 }}>
          <div className="ord-card p-8 text-center sm:p-10">
            <span className="text-7xl">🛒</span>
            <h1 className="mt-4 text-2xl">ตะกร้ายังว่างอยู่เลย</h1>
            <p className="mt-2 text-sm t-soft">ไปเลือกสินค้าน่ารัก ๆ มาใส่ตะกร้ากันเถอะ 🐥</p>
            <Link href="/products" className="ord-btn yolk lg mt-6">
              🛍️ ไปช้อปเลย
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shopp">
      {sky}
      <div className="shopp-in">
        <div className="shopp-head">
          <h1 className="ord-title">🛒 ตะกร้าสินค้า</h1>
          <span className="ord-chip">
            {items.length} รายการ · เลือกสั่ง {pickedItems.length} รายการ {totalQty} ชิ้น
          </span>
        </div>

        {/* 📄 แอดมินกำลังหยิบของใส่ใบเสนอราคา — ไม่ต้องผ่านหน้าชำระเงิน โยนเข้าใบได้เลย */}
        {quoteTo && (
          <div className="ord-note ok mb-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="ord-title text-[.96rem]" style={{ color: "inherit" }}>
                  📄 กำลังหยิบใส่ใบเสนอราคา {quoteTo.id}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed">
                  ลูกค้า: {quoteTo.customer} · หยิบสินค้าให้ครบก่อน แล้วกดปุ่มขวาเพื่อโยนเข้าใบทีเดียว (ยังไม่สร้างออเดอร์)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void sendToQuote()} disabled={quoteBusy} className="ord-btn ok">
                  {quoteBusy ? "กำลังเพิ่ม…" : `➕ ใส่ในใบเสนอราคา (${pickedItems.length} รายการ)`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearQuoteTarget();
                    setQuoteTo(null);
                  }}
                  className="ord-btn quiet sm"
                >
                  ยกเลิกโหมดนี้
                </button>
              </div>
            </div>
            {quoteErr && <p className="mt-2 text-xs font-semibold t-danger">{quoteErr}</p>}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_366px] lg:items-start">
          {/* ───────── รายการสินค้า ───────── */}
          <div className="flex flex-col gap-3">
            {/* ✅ แถบเลือกรายการ — ติ๊กเฉพาะที่จะสั่งรอบนี้ ที่เหลือค้างไว้ในตะกร้า */}
            <div className="ord-card flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <label className="ord-title flex cursor-pointer items-center gap-2.5 text-[.86rem]">
                <input type="checkbox" checked={allPicked} onChange={togglePickAll} className="ord-check" />
                เลือกทั้งหมด
              </label>
              <span className="text-xs t-soft">
                เลือกแล้ว <strong className="t-blue">{pickedItems.length}</strong>/{items.length} รายการ · ที่ไม่ติ๊กจะยังอยู่ในตะกร้า สั่งทีหลังได้
              </span>
              {pickedItems.length > 0 && (
                <button type="button" onClick={removePicked} className="ord-btn quiet sm ml-auto">
                  🗑 ลบที่เลือก
                </button>
              )}
            </div>

            {items.map((item) => {
              const product = productOf(item.productId);
              if (!product) return null;
              const picked = isPicked(item.key);
              return (
                <div key={item.key} className={`ord-card cart-item${picked ? "" : " tint dim"}`}>
                  {/* ✅ ติ๊ก = สั่งรายการนี้รอบนี้ · เอาติ๊กออก = พักไว้ในตะกร้าก่อน */}
                  <label
                    className="flex shrink-0 cursor-pointer items-start pt-1"
                    title={appendTo ? "ติ๊ก = ส่งรายการนี้เข้าออเดอร์เดิม" : "ติ๊ก = สั่งรายการนี้"}
                  >
                    <input
                      type="checkbox"
                      checked={picked}
                      onChange={() => togglePick(item.key)}
                      className="ord-check"
                      aria-label={`เลือกสั่ง ${product.name}`}
                    />
                  </label>
                  {(() => {
                    // ลายที่ลูกค้าแนบ (เก็บมาในตัวเลือกเป็น url คั่นด้วย " | ") — โชว์ลายจริงแทนรูปสินค้า
                    const artUrls = String(item.selections["ภาพลายที่แนบ"] ?? "")
                      .split("|")
                      .map((u) => u.trim())
                      .filter(Boolean);
                    return (
                      <Link href={productPath(product)} className="cart-thumb">
                        {artUrls[0] ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={artUrls[0]} alt={`ลายที่แนบของ ${product.name}`} />
                            <span className="ord-proof-n">
                              🎨 ลายของคุณ{artUrls.length > 1 ? ` +${artUrls.length - 1}` : ""}
                            </span>
                          </>
                        ) : (
                          <ProductVisual
                            emoji={product.emoji}
                            gradient={product.gradient}
                            src={product.imageSrc}
                            alt={product.name}
                            size="text-4xl"
                            className="h-full w-full"
                          />
                        )}
                      </Link>
                    );
                  })()}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={productPath(product)} className="cart-name">
                        {product.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeItem(item.key)}
                        className="ord-btn quiet sm shrink-0"
                        style={{ padding: "5px 10px", fontSize: ".72rem" }}
                        aria-label={`ลบ ${product.name} ออกจากตะกร้า`}
                      >
                        ✕ ลบ
                      </button>
                    </div>
                    {(() => {
                      // ซ่อน url ลาย/ธงภายในระบบ — สรุปเป็นข้อความสั้นแทน
                      // (บรรทัดตัวเลขของทีมผลิตซ่อนอยู่แล้วใน SPEC_HIDE — ลูกค้าไม่ต้องอ่าน แต่ยังติดไปกับออเดอร์)
                      const artCount = String(item.selections["ภาพลายที่แนบ"] ?? "").split("|").filter((u) => u.trim()).length;
                      return (
                        <SpecLines
                          sel={item.selections}
                          className="mt-1 text-xs t-soft"
                          /* ป้าย +฿ ท้ายบรรทัดสเปค = "ค่าที่บวกเพิ่มจากราคาเรทจริง ๆ" เท่านั้น (เช่น ตะขอสปริง +฿8)
                             ตรงกับบรรทัดแจกแจงมุมขวาล่าง: ราคาเรท ฿45 + ตะขอ ฿8 = ฿53/ชิ้น
                             ⛔ ห้ามเอาส่วนต่างของ "แกนตารางเรท" (ความหนา/ขนาด/จำนวนด้านที่สกรีน) มาติดป้ายด้วย
                             ราคาพวกนั้นฝังอยู่ในช่องตารางแล้ว = อยู่ใน ฿45 · ติดป้ายไปลูกค้าจะบวกซ้ำเอง
                             (เคยทำแล้วโดนทักว่า "บวกแปลก ๆ" — 3mm +฿5 · 6cm +฿30 ทั้งที่รวมอยู่ในเรทแล้ว) */
                          extras={Object.fromEntries((item.addOns ?? []).map((a) => [a.label, a.amount]))}
                          after={artCount > 0 ? <p className="font-semibold t-blue">🎨 แนบลายแล้ว {artCount} รูป</p> : null}
                        />
                      );
                    })()}
                    {/* 🧮 บรรทัดนี้ถูกคิดรวมกับบรรทัดอื่นในล็อตเดียวกัน เพื่อให้ได้เรทตามจำนวนรวม (เช่น 25+25 = 50 ชิ้น 2 ลาย)
                        สเปคต่างกันก็รวมได้ (ตะขอคนละแบบ/สีอะคริลิคคนละสี) — ราคาฐานเท่ากัน ต่างกันแค่ค่าตัวเลือก */}
                    {item.merged && (
                      <p className="ord-note info mt-2 p-2 text-[11px] leading-relaxed t-soft">
                        🧮 คิดรวมกับอีก {item.merged.lines - 1} รายการในล็อตผลิตเดียวกัน →{" "}
                        <strong className="t-blue">
                          รวม {item.merged.totalQty.toLocaleString("th-TH")} ชิ้น {item.merged.totalDesigns.toLocaleString("th-TH")} ลาย
                        </strong>
                        {item.merged.rateLabel ? <> · {item.merged.rateLabel}</> : null} จึงได้ราคาต่อชิ้นนี้
                      </p>
                    )}
                    {/* ร้านรับสั่งขั้นต่ำ 1 ชิ้นทุกสินค้า — ลดต่ำกว่าขั้นต่ำของเรทได้ ระบบสลับเรทให้เอง */}
                    <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                      {/* 📐 สินค้าขายเป็นพื้นที่ — จำนวน (ตร.ม.) ล็อกตามขนาดที่กรอกไว้ตอนสั่ง แก้ได้ที่หน้าสินค้าเท่านั้น */}
                      {(() => {
                        const p = productOf(item.productId);
                        const areaLocked = p ? qtyFromAreaOf(p, item.selections) != null : false;
                        return (
                      <div className="ord-qty" title={areaLocked ? "จำนวนคำนวณจากขนาดที่กรอก — แก้ขนาดได้ที่หน้าสินค้า" : undefined}>
                        <button type="button" onClick={() => changeQty(item, item.qty - 1)} disabled={areaLocked || item.qty <= 1} aria-label="ลดจำนวน">
                          −
                        </button>
                        <span>{item.qty}</span>
                        <button type="button" onClick={() => changeQty(item, item.qty + 1)} disabled={areaLocked} aria-label="เพิ่มจำนวน">
                          +
                        </button>
                      </div>
                        );
                      })()}
                      <div className="text-right">
                        {item.unitPrice <= 0 ? (
                          <span className="ord-chip yolk">💬 รอตีราคา</span>
                        ) : (
                          <>
                            <span className="cart-price">{formatPrice(item.unitPrice * item.qty + (item.extraFee ?? 0))}</span>
                            {item.qty > 1 && (
                              <span className="block text-[11px] t-faint">
                                {/* หน่วยขายตามตารางเรทของสินค้า (พวง/แผ่น/ตร.ม.) — ไม่มีตาราง = ชิ้น */}
                                {formatPrice(item.unitPrice)} /{" "}
                                {(product ? activeMatrix(product, item.selections)?.unit : null) ?? "ชิ้น"}
                                {(item.extraFee ?? 0) > 0 && <> · 🎨 Add on +{formatPrice(item.extraFee!)}</>}
                              </span>
                            )}
                            {/* แจกแจงราคาต่อชิ้น — สองบรรทัดในล็อตเดียวกันราคาไม่เท่ากันได้ ถ้าเลือกตัวเลือกที่มีค่าเพิ่ม
                                (เช่น ตะขอสปริง +฿10 ขณะที่ห่วงกลมฟรี) ราคาฐานจากเรทรวมเท่ากันทั้งคู่ */}
                            {item.addOns && item.addOns.length > 0 && (
                              <span className="block text-[11px] t-faint">
                                ราคาเรท {formatPrice(item.unitPrice - item.addOns.reduce((s, a) => s + a.amount, 0))}
                                {item.addOns.map((a) => (
                                  <span key={a.label}>
                                    {" "}
                                    {a.amount < 0 ? "−" : "+"} {a.label} {formatPrice(Math.abs(a.amount))}
                                  </span>
                                ))}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {/* 📦 ค่ากล่อง/ค่าแพ็คอัตโนมัติ (ครั้งเดียวต่อออเดอร์) — ห้อยใต้รายการแรกที่เข้าเงื่อนไข
                        รายการอื่นที่เข้าเงื่อนไขได้ป้าย "ใช้กล่องเดียวกัน ไม่คิดเพิ่ม" */}
                    <BoxFeeTag
                      lines={boxTagByKey.get(item.key)?.primary}
                      included={boxTagByKey.get(item.key)?.included}
                      className="mt-2.5"
                    />
                  </div>
                </div>
              );
            })}

            {/* ── 🎁 ของแถมโปรโมชั่นที่ปลดล็อกแล้ว — แถวแสดงผลอย่างเดียว (แก้จำนวน/ลบไม่ได้ ระบบคิดให้เอง) ── */}
            {giftRows
              .filter((g) => g.earned > 0)
              .map((g) => (
                <div key={`gift-${g.promo.id}`} className="ord-card cart-item" style={{ borderColor: "rgba(18,135,106,.35)", background: "#F2FBF7" }}>
                  <div className="flex gap-3.5 p-3.5 sm:gap-4 sm:p-4">
                    {g.promo.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- รูปของแถมจากคลังรูปร้าน
                      <img src={g.promo.image} alt={g.promo.name} className="cart-thumb object-cover" />
                    ) : (
                      <span className="cart-thumb grid place-items-center bg-white text-4xl">🎁</span>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="ord-chip" style={{ background: "#DEF5EC", color: "#0E6B52" }}>🎁 ของแถมโปรโมชั่น</span>
                      </div>
                      <span className="cart-name mt-1" style={{ cursor: "default" }}>{g.promo.name}</span>
                      {g.promo.note && <span className="text-[11px] t-soft">{g.promo.note}</span>}
                      {g.promo.condition && (
                        <span className="mt-1 text-[11px] t-soft">📋 เงื่อนไข: {g.promo.condition}</span>
                      )}

                      {/* 📐 เลือกขนาดของแถม (แอดมินตั้งลิสต์ไว้ที่ /admin/settings?tab=gift) */}
                      {(() => {
                        const sizes = giftSizesOf(g.promo);
                        if (sizes.length === 0) return null;
                        const cur = resolveGiftSize(g.promo, giftSize[g.promo.id])!;
                        const sp = splitGiftBySheet(g.promo, cur, g.earned);
                        const rem = g.earned - sp.printed;
                        return (
                          <div className="mt-2">
                            <span className="ord-eyebrow block text-[11px]">
                              {g.promo.sizeLabel?.trim() || "ขนาด"}ที่ต้องการ
                              {sizes.length > 1 && <span className="t-faint"> (เลือกได้)</span>}
                            </span>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {sizes.map((sz) => {
                                const on = sz.label === cur.label;
                                return (
                                  <button
                                    key={sz.label}
                                    type="button"
                                    disabled={sizes.length === 1}
                                    onClick={() => pickGiftSize(g.promo.id, sz.label)}
                                    title={sz.note}
                                    className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold transition"
                                    style={{
                                      cursor: sizes.length === 1 ? "default" : "pointer",
                                      border: `1.5px solid ${on ? "rgba(18,135,106,.65)" : "var(--sky-200)"}`,
                                      background: on ? "#DEF5EC" : "#fff",
                                      color: on ? "#0E6B52" : "var(--ink-soft, #5A6B84)",
                                    }}
                                  >
                                    {sz.image && (
                                      // eslint-disable-next-line @next/next/no-img-element -- รูปของแถมจากคลังรูปร้าน
                                      <img src={sz.image} alt="" className="h-7 w-7 rounded-lg object-cover" />
                                    )}
                                    <span className="text-left">
                                      {sz.label}
                                      {(sz.perSheet ?? 0) > 0 && (
                                        <span className="block font-normal t-faint">{sz.perSheet} ใบ / แผ่น A3</span>
                                      )}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            {cur.note && <span className="mt-1 block text-[11px] t-soft">{cur.note}</span>}
                            {sp.fallback > 0 && (
                              <span className="mt-1.5 block rounded-lg px-2 py-1.5 text-[11px] leading-relaxed" style={{ background: "#FFF6E2", color: "#7A5A12" }}>
                                🧾 ได้ <strong>{g.promo.name} {sp.printed.toLocaleString("th-TH")} ชิ้น</strong> ({sp.sheets} แผ่น A3 เต็ม)
                                · อีก <strong>{sp.fallback.toLocaleString("th-TH")} ชิ้น</strong> ที่เหลือไม่เต็มครึ่งแผ่น
                                จะได้เป็น <strong>{sp.fallbackName}</strong> แทน
                                {sp.threshold > rem && (
                                  <span className="block">
                                    (เศษต้องครบ {sp.threshold.toLocaleString("th-TH")} ใบ — สั่งเพิ่มอีก{" "}
                                    {(sp.threshold - rem).toLocaleString("th-TH")} ชิ้น ได้พิมพ์ลายครบทุกชิ้น)
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                        <span className="text-xs t-soft">จำนวน {g.earned.toLocaleString("th-TH")} ชิ้น · ระบบเพิ่มให้อัตโนมัติ</span>
                        <span className="text-right">
                          {(g.promo.value ?? 0) > 0 && (
                            <s className="mr-1.5 text-[11px] t-faint">{formatPrice((g.promo.value ?? 0) * g.earned)}</s>
                          )}
                          <span className="cart-price t-ok">ฟรี</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

            <button type="button" onClick={clear} className="ord-btn quiet sm self-start">
              ล้างตะกร้าทั้งหมด
            </button>
          </div>

          {/* ───────── สรุปยอด ───────── */}
          <aside className="ord-card cart-sum h-fit p-5 sm:p-6">
            <h2 className="ord-title text-lg">สรุปคำสั่งซื้อ</h2>

            {/* ── ออเดอร์ใหม่ หรือ เพิ่มเข้าออเดอร์เดิม — เลือกให้ชัดก่อนไปหน้าชำระเงิน ── */}
            {appendTo && (
              <div className="ord-note info mt-3 space-y-2 p-3">
                <p className="ord-title text-[.8rem]" style={{ color: "inherit" }}>
                  สั่งซื้อแบบไหน?
                </p>
                <label className="ord-opt on" style={{ alignItems: "flex-start" }}>
                  <input type="radio" name="order-mode" checked readOnly className="mt-0.5" />
                  <span className="flex-1 text-xs leading-relaxed t-soft">
                    <strong className="ord-opt-name block text-[.86rem] t-ink">➕ เพิ่มเข้าออเดอร์เดิม {appendTo.id}</strong>
                    ใช้ชื่อ/ที่อยู่เดิม · <strong className="t-ok">ไม่คิดค่าส่งเพิ่ม</strong> เพราะส่งรวมกล่องเดียวกัน
                    <span className="mt-1 block font-semibold t-blue">
                      ติ๊กเลือกรายการที่จะส่งเข้าออเดอร์เดิมได้ — เลือกแล้ว {pickedItems.length}/{items.length} รายการ
                      <span className="block font-normal t-soft">รายการที่ไม่ติ๊กจะยังอยู่ในตะกร้า สั่งทีหลังได้</span>
                    </span>
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    clearAppendTarget();
                    clearUnpicked();
                    setAppendTo(null);
                    setUnpicked([]);
                  }}
                  className="ord-opt"
                  style={{ alignItems: "flex-start" }}
                >
                  <span className="mt-0.5 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full" style={{ border: "1.5px solid var(--sky-200)", background: "#fff" }} />
                  <span className="flex-1 text-xs leading-relaxed t-soft">
                    <strong className="ord-opt-name block text-[.86rem] t-ink">🆕 สั่งเป็นออเดอร์ใหม่</strong>
                    แยกออเดอร์ · คิดค่าส่งใหม่ · กรอกที่อยู่ใหม่ได้
                  </span>
                </button>
              </div>
            )}

            {!freeShipping && remainForFree > 0 && (
              <div className="ord-note warn mt-3 px-4 py-3 text-xs leading-relaxed">
                🚚 ซื้อเพิ่มอีก <strong>{formatPrice(remainForFree)}</strong> รับส่งฟรีเลย!
                <div className="ord-bar">
                  <i style={{ width: `${freeMin > 0 ? Math.min(100, (subtotal / freeMin) * 100) : 0}%` }} />
                </div>
              </div>
            )}
            {freeShipping && (
              <div className="ord-note ok mt-3 px-4 py-3 text-xs font-semibold">
                🎉 ยินดีด้วย! คุณได้รับสิทธิ์ส่งฟรี
                {qtyShipApplied && (
                  <span className="mt-1 block font-normal">
                    (ยกเว้นของชิ้นใหญ่/ของหนักที่ต้องคิดค่าขนส่งตามน้ำหนัก {formatPrice(qtyShip.fee)})
                  </span>
                )}
              </div>
            )}

            {/* 🎁 ของแถมฟรีตามจำนวนชิ้น (โปรร้าน) */}
            <GiftPanel rows={giftRows} sizes={giftSize} className="mt-3" />

            <div className="mt-5">
              <span className="ord-eyebrow mb-2 block">วิธีจัดส่ง</span>
              {auto.reason && (
                <p className="ord-note info mb-2 px-3 py-2 text-xs leading-relaxed">
                  🚚 ระบบเลือกกล่องที่พอดีกับออเดอร์นี้ให้แล้ว — {auto.reason}
                </p>
              )}
              {(qtyShipApplied || qtyShip.lines.some((l) => l.switchedTo)) && (
                <p className="ord-note warn mb-2 px-3 py-2 text-xs leading-relaxed">
                  📦 ออเดอร์นี้มีสินค้าที่<strong>คิดค่าส่งตามจำนวนชิ้น</strong> (ของมีน้ำหนัก):{" "}
                  {qtyShip.lines
                    .map((l) =>
                      l.switchedTo
                        ? `${l.name} ${l.qty} ชิ้น → เกินเกณฑ์ ต้องส่งแบบ "${l.switchedTo.name}"`
                        : `${l.name} ${l.qty} ชิ้น = ${formatPrice(l.fee)}`
                    )
                    .join(" · ")}
                  {qtyShip.fee > 0 && <> — เลือก &quot;มารับเอง&quot; ได้ ไม่คิดค่าส่งส่วนนี้</>}
                </p>
              )}
              <div className="flex flex-col gap-2">
                {shipRows.map((s) => {
                  const real = methods.find((m) => m.id === s.id);
                  const ok = !real || shippingAllowed(real, methods, auto);
                  const checked = s.covers ? s.covers.includes(shippingId) : shippingId === s.id;
                  return (
                    <label
                      key={s.covers ? "__qty__" : s.id}
                      title={ok ? undefined : "ออเดอร์นี้ของเยอะเกินกล่องนี้"}
                      className={`ord-opt${!ok ? " off" : checked ? " on" : ""}`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <input
                          type="radio"
                          name="shipping"
                          disabled={!ok}
                          checked={checked}
                          onChange={() => chooseShipping(s.id)}
                        />
                        <span className="min-w-0">
                          <span className="ord-opt-name">{s.name}</span>
                          {!ok && <span className="ml-1 text-[11px] t-faint">· ของใส่ไม่พอ</span>}
                          {s.note && <span className="ord-opt-note">{s.note}</span>}
                        </span>
                      </span>
                      {/* ขีดฆ่าเฉพาะตอนส่งฟรีล้วน ๆ — ถ้ามีค่าของหนัก แถวยุบโชว์ราคาที่จ่ายจริงอยู่แล้ว */}
                      <span className={`ord-opt-name shrink-0${freeShipping && ok && !qtyShipApplied ? " t-faint line-through" : ""}`}>
                        {formatPrice(s.price)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <dl className="mt-5 flex flex-col gap-2 pt-4 text-sm" style={{ borderTop: "1px dashed var(--sky-200)" }}>
              <div className="flex justify-between t-soft">
                <dt>ยอดรวมสินค้า ({totalQty} ชิ้น)</dt>
                <dd className="font-semibold t-ink">{formatPrice(subtotal)}</dd>
              </div>
              {boxFeeSum > 0 && (
                <div className="flex justify-between text-xs t-soft">
                  <dt>📦 รวมค่ากล่อง/แพ็ค (คิดอยู่ในยอดสินค้าแล้ว)</dt>
                  <dd className="font-semibold t-ink">{formatPrice(boxFeeSum)}</dd>
                </div>
              )}
              <div className="flex justify-between t-soft">
                <dt>
                  {qtyShipApplied && methodFree
                    ? "ค่าจัดส่ง (ของหนัก — กล่องเพิ่ม)"
                    : appendTo
                      ? "ค่าจัดส่ง (รวมกล่องเดิม)"
                      : "ค่าจัดส่ง"}
                </dt>
                <dd className="font-semibold t-ink">
                  {shippingCost === 0 ? <span className="t-ok">ฟรี!</span> : formatPrice(shippingCost)}
                </dd>
              </div>
              {giftRows
                .filter((g) => g.earned > 0)
                .map((g) => (
                  <div key={g.promo.id} className="flex justify-between t-soft">
                    <dt>
                      🎁 ของแถม — {g.promo.name}
                      {(() => {
                        const cur = resolveGiftSize(g.promo, giftSize[g.promo.id]);
                        return cur ? ` (${cur.label})` : "";
                      })()}{" "}
                      ×{g.earned}
                    </dt>
                    <dd className="font-semibold t-ok">ฟรี!</dd>
                  </div>
                ))}
              <div className="ord-title mt-1 flex justify-between pt-3 text-base" style={{ borderTop: "1px dashed var(--sky-200)" }}>
                <dt>ยอดชำระทั้งหมด</dt>
                <dd className="t-blue" style={{ fontWeight: 600 }}>
                  {formatPrice(total)}
                </dd>
              </div>
            </dl>

            {/* 📅 วันที่ต้องใช้งาน — ทักเช็คคิวงานกับแอดมินก่อน */}
            <div className="ord-sub mt-5 p-4">
              <label htmlFor="use-by" className="ord-title block text-[.86rem]">
                📅 ต้องใช้งานวันไหน? <span className="t-faint" style={{ fontFamily: "var(--body)", fontWeight: 400 }}>(ไม่บังคับ)</span>
              </label>
              <p className="mt-1 text-[11px] leading-relaxed t-soft">
                มีกำหนดใช้งาน (อีเวนต์ · วันเกิด · ของขวัญ) ระบุไว้ได้เลย —{" "}
                <strong className="t-blue">รบกวนทักแอดมินเช็คคิวงานก่อนนะครับ</strong> ทางร้านจะยืนยันว่าทันไหมก่อนเริ่มผลิต
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <input
                  id="use-by"
                  type="date"
                  value={useBy}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => saveUseBy(e.target.value)}
                  className="ord-input"
                  style={{ width: "auto" }}
                />
                {useBy && (
                  <button type="button" onClick={() => saveUseBy("")} className="ord-btn quiet sm">
                    ล้างวันที่
                  </button>
                )}
                <a href={LINE_URL} target="_blank" rel="noopener noreferrer" className="ord-btn line sm ml-auto">
                  💬 ทักเช็คคิวงาน
                </a>
              </div>
            </div>

            {/* ร้านรับสั่งขั้นต่ำ 1 ชิ้นทุกสินค้า — ขั้นต่ำของเรทไม่บล็อกการสั่งอีกต่อไป
                (จำนวนต่ำกว่าเกณฑ์เรท = ระบบสลับลงเรทที่เหมาะให้เอง ราคาถูกต้องตามช่วงจำนวน) */}
            {pickedItems.length === 0 && (
              <p className="ord-note warn mt-4 px-4 py-2.5 text-xs font-semibold leading-relaxed">
                ☑️ ยังไม่ได้ติ๊กเลือกรายการที่จะสั่ง — ติ๊กอย่างน้อย 1 รายการก่อนนะครับ
              </p>
            )}
            {/* 📦 ขั้นต่ำต่อรอบผลิต — บอกให้ชัดว่าขาดกลุ่มไหน อีกเท่าไหร่ พร้อมลิงก์กลับไปเลือกเพิ่ม */}
            {shortLots.map((s) => (
              <div key={s.key} className="ord-note warn mt-4 px-4 py-2.5 text-xs leading-relaxed">
                <p className="font-extrabold">
                  📦 {s.productName}
                  {s.groupLabel ? ` · ${s.groupLabel}` : ""} — ยังขาดอีก {s.short.toLocaleString("th-TH")} {s.unit}
                </p>
                <p className="mt-1 font-semibold">
                  สั่งขั้นต่ำ {s.need.toLocaleString("th-TH")} {s.unit} ต่อ 1 รอบผลิต (ตอนนี้มี{" "}
                  {s.have.toLocaleString("th-TH")} {s.unit}) — แต่ละชิ้นเลือกแบบและขนาดของตัวเองได้
                  {s.groupLabel ? " ขอแค่เป็นแบบเดียวกัน" : ""}
                </p>
                <Link href={productPath(productOf(s.productId) ?? { id: s.productId })} className="ord-btn quiet sm mt-2">
                  ← เลือกเพิ่มอีก {s.short.toLocaleString("th-TH")} {s.unit}
                </Link>
              </div>
            ))}
            <button
              type="button"
              onClick={() => router.push("/checkout")}
              disabled={pickedItems.length === 0 || shortLots.length > 0}
              className="ord-btn yolk block lg mt-5"
            >
              ✅ ยืนยันการสั่งซื้อ{allPicked ? "" : ` (${pickedItems.length} รายการ)`}
            </button>
            <p className="mt-2.5 text-center text-[11px] leading-relaxed t-soft">
              ตรวจสอบรายการ · ตัวเลือก · ลิงก์ไฟล์ลาย ให้ครบ แล้วไปหน้าแจ้งโอนเงิน
            </p>
            <Link href="/products" className="ord-btn ghost block mt-3">
              ← เลือกซื้อสินค้าต่อ
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
