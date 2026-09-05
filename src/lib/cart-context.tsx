"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getProduct,
  migrateRenamedGroupKeys,
  repairRateFromOptions,
  repriceCartGroups,
  unitPriceFor,
  type Product,
  type UnitPriceAddOn,
} from "./products";
import { fetchProductsByIds, fetchProductsByIdsChecked } from "./product-repo";

export interface CartItem {
  key: string;
  productId: string;
  qty: number;
  /** ตัวเลือกที่ลูกค้าเลือก เช่น { "ขนาด": "M", "สีเสื้อ": "ขาว" } */
  selections: Record<string, string>;
  unitPrice: number;
  /** ค่าคละลายเกินโควตา (บาท ทั้งรายการ) — คำนวณใหม่ตามจำนวนเสมอ */
  extraFee?: number;
  /** ค่าตัวเลือกที่บวกอยู่ในราคาต่อชิ้น (เช่น ตะขอสปริง +฿10) — ไว้แจกแจงให้ลูกค้าเห็น */
  addOns?: UnitPriceAddOn[];
  /**
   * ถูกรวมกับบรรทัดอื่นในล็อตผลิตเดียวกันเพื่อคิดเรทตามจำนวนรวม (เช่น 25+25 = 50 ชิ้น 2 ลาย เรท 2)
   * ไว้โชว์ป้ายในตะกร้าให้ลูกค้ารู้ว่าทำไมราคาต่อชิ้นเปลี่ยน — undefined = คิดแบบบรรทัดเดี่ยวตามเดิม
   */
  merged?: { lines: number; totalQty: number; totalDesigns: number; rateLabel?: string };
}

interface CartState {
  items: CartItem[];
  /** อ่านของเดิมจาก localStorage เสร็จหรือยัง — ยังไม่เสร็จห้ามเขียนทับ (ไม่งั้นแท็บที่เพิ่งเปิดจะล้างตะกร้าแท็บอื่น) */
  hydrated: boolean;
}

type CartAction =
  | { type: "hydrate"; items: CartItem[] }
  | { type: "add"; item: CartItem }
  | { type: "remove"; key: string }
  | { type: "setQty"; key: string; qty: number }
  | { type: "setNote"; key: string; note: string }
  | { type: "clear" };

/**
 * 📝 หมายเหตุของลูกค้าต่อรายการ — เก็บเป็นคีย์ใน selections ตามธรรมเนียมเดียวกับที่แอดมิน
 * พิมพ์ "หมายเหตุ" ลงรายละเอียดออเดอร์ จึงติดไปกับออเดอร์/ใบงาน/โหมดแพ็คเองผ่าน SpecLines ทุกจอ
 * ⚠️ ไม่ใช่กลุ่มตัวเลือกของสินค้า และไม่อยู่ใน key ของบรรทัด (key แช่ตอน addItem — พิมพ์หมายเหตุทีหลัง
 * ไม่ทำให้บรรทัดแตก และกดสั่งสเปคเดิมซ้ำก็ยังรวมบรรทัดเดิมได้)
 */
export const CART_NOTE_LABEL = "หมายเหตุ";

const STORAGE_KEY = "iducky-cart-v1";

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "hydrate":
      return { items: action.items, hydrated: true };
    case "add": {
      const existing = state.items.find((i) => i.key === action.item.key);
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.key === action.item.key ? { ...i, qty: i.qty + action.item.qty } : i
          ),
        };
      }
      return { ...state, items: [...state.items, action.item] };
    }
    case "remove":
      return { ...state, items: state.items.filter((i) => i.key !== action.key) };
    case "setQty":
      if (action.qty < 1) return state;
      return {
        ...state,
        items: state.items.map((i) =>
          // เพดาน 99999 — สินค้าราคาขั้นบันได/หลายเรทสั่งกันหลักพันหลักหมื่นชิ้น (เดิม 99 ไว้กันพิมพ์ผิดของชิ้นเดี่ยว)
          i.key === action.key ? { ...i, qty: Math.min(action.qty, 99999) } : i
        ),
      };
    case "setNote":
      return {
        ...state,
        items: state.items.map((i) => {
          if (i.key !== action.key) return i;
          const selections = { ...i.selections };
          // ลบว่าง ๆ ทิ้ง — ไม่ให้บรรทัด "หมายเหตุ:" เปล่าติดไปกับออเดอร์
          if (action.note.trim()) selections[CART_NOTE_LABEL] = action.note;
          else delete selections[CART_NOTE_LABEL];
          return { ...i, selections };
        }),
      };
    case "clear":
      return { ...state, items: [] };
  }
}

export function computeUnitPrice(product: Product, selections: Record<string, string>): number {
  let price = product.price;
  for (const opt of product.options) {
    const chosen = opt.choices.find((c) => c.name === selections[opt.label]);
    if (chosen?.extra) price += chosen.extra;
  }
  return price;
}

export function cartItemKey(productId: string, selections: Record<string, string>): string {
  const parts = Object.entries(selections)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`);
  return [productId, ...parts].join("|");
}

interface CartContextValue {
  items: CartItem[];
  totalQty: number;
  subtotal: number;
  /** known = ตัวสินค้าเต็ม ๆ จากหน้าที่กดสั่ง (ส่งมาด้วยได้ ไม่ต้องให้ตะกร้าไปหาเอง) */
  addItem: (productId: string, selections: Record<string, string>, qty: number, known?: Product) => void;
  removeItem: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  /** พิมพ์หมายเหตุของลูกค้าลงรายการ (เก็บใน selections["หมายเหตุ"] — ว่าง = ลบทิ้ง) */
  setNote: (key: string, note: string) => void;
  clear: () => void;
  /** ค้นหาสินค้า (Supabase → static) — ใช้แสดงรายการในตะกร้าให้รองรับสินค้าที่นำเข้าฐานข้อมูล */
  productOf: (id: string) => Product | undefined;
  /**
   * สินค้านี้ "ถูกลบจากร้านแล้ว" ใช่ไหม — true เฉพาะเมื่อถามฐานข้อมูลสำเร็จแล้วยืนยันว่าไม่มีจริง
   * productOf คืน undefined + productGone=false = แค่ยังโหลดไม่เสร็จ (หน้าตะกร้าต้องโชว์ว่ากำลังโหลด ไม่ใช่ซ่อนทิ้ง)
   */
  productGone: (id: string) => boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { items: [], hydrated: false });
  /** JSON ล่าสุดที่ "ตรงกับ localStorage" — ใช้กันเขียน/อ่านวนซ้ำระหว่างแท็บ */
  const syncedRef = useRef<string>("[]");

  // แคตตาล็อกจาก Supabase (รองรับสินค้าที่นำเข้าฐานข้อมูล ไม่ใช่แค่ static array)
  const [catalog, setCatalog] = useState<Map<string, Product>>(new Map());
  const productOf = useMemo(
    () => (id: string): Product | undefined => catalog.get(id) ?? getProduct(id),
    [catalog]
  );

  /** อ่านตะกร้าจาก localStorage — คืน null ถ้าเหมือนเดิม (ไม่ต้อง re-render) */
  const readStored = useCallback((): CartItem[] | null => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      return null; // storage ถูกปิด
    }
    const text = raw ?? "[]";
    if (text === syncedRef.current) return null;
    try {
      const parsed = JSON.parse(text) as CartItem[];
      if (!Array.isArray(parsed)) return null;
      syncedRef.current = text;
      return parsed;
    } catch {
      // ข้อมูลในเครื่องเสียหาย — เริ่มตะกร้าว่างแทน
      syncedRef.current = "[]";
      return [];
    }
  }, []);

  useEffect(() => {
    dispatch({ type: "hydrate", items: readStored() ?? [] });
  }, [readStored]);

  useEffect(() => {
    // ยังไม่ได้อ่านของเดิม = ห้ามเขียน (ไม่งั้นแท็บที่เพิ่งเปิดจะเขียน [] ทับตะกร้าจริง)
    if (!state.hydrated) return;
    const text = JSON.stringify(state.items);
    if (text === syncedRef.current) return;
    syncedRef.current = text;
    try {
      localStorage.setItem(STORAGE_KEY, text);
    } catch {
      // storage เต็มหรือถูกปิด — ข้ามการบันทึก
    }
  }, [state.items, state.hydrated]);

  /**
   * ซิงก์ข้ามแท็บ — เปิดเว็บไว้หลายหน้า แล้วลบของในแท็บหนึ่ง แท็บอื่นต้องรู้ทันที
   * ไม่งั้นแท็บเก่าจะถือรายการเดิมไว้ในหน่วยความจำ แล้วเขียนทับตอนกดเพิ่มสินค้า (ของที่ลบไปแล้วกลับมา)
   * - storage event = แท็บอื่นเขียน (เบราว์เซอร์ไม่ยิงให้แท็บที่เขียนเอง)
   * - visibility/focus/pageshow = เผื่อแท็บโดนพัก (bfcache/มือถือ) แล้วพลาด event
   */
  useEffect(() => {
    const resync = () => {
      const items = readStored();
      if (items) dispatch({ type: "hydrate", items });
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== STORAGE_KEY) return;
      resync();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") resync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", resync);
    window.addEventListener("pageshow", resync);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", resync);
      window.removeEventListener("pageshow", resync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [readStored]);

  /** id ที่ถามฐานข้อมูลสำเร็จแล้วยืนยันว่า "ไม่มีสินค้านี้แล้ว" — เลิกถามซ้ำ ให้หน้าตะกร้าโชว์ป้ายบอกแทน */
  const [goneIds, setGoneIds] = useState<Set<string>>(new Set());

  /**
   * โหลด "เฉพาะสินค้าที่อยู่ในตะกร้า" ไว้คิดราคาใหม่ตามจำนวน
   * ตะกร้าว่าง = ไม่ยิงฐานข้อมูลเลย (เดิมดึงสินค้าทั้งร้าน ~1.4 MB ทุกหน้าที่เปิด แม้ไม่มีของในตะกร้า)
   * โหลดพลาด (เน็ตสะดุด/ฐานข้อมูลล่มแว๊บ) → ลองใหม่เองสูงสุด 5 รอบ — เดิมพลาดแล้วเงียบตลอดชีวิตหน้า
   * ทำให้ตะกร้า "ดูว่าง" ทั้งที่ของยังอยู่ครบใน localStorage (ลูกค้าเข้าใจว่าของหาย)
   */
  useEffect(() => {
    const missing = [...new Set(state.items.map((i) => i.productId))].filter(
      (id) => !catalog.has(id) && !goneIds.has(id)
    );
    if (missing.length === 0) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = (round: number) => {
      fetchProductsByIdsChecked(missing)
        .then(({ ok, products }) => {
          if (!active) return;
          if (products.length > 0) {
            setCatalog((prev) => {
              const next = new Map(prev);
              for (const p of products) next.set(p.id, p);
              return next;
            });
          }
          if (ok) {
            // ถามสำเร็จแล้วยังไม่ได้กลับมา = สินค้าถูกลบจากร้านจริง (ไม่ใช่โหลดพลาด)
            const found = new Set(products.map((p) => p.id));
            const gone = missing.filter((id) => !found.has(id));
            if (gone.length) setGoneIds((prev) => new Set([...prev, ...gone]));
          } else if (round < 5) {
            timer = setTimeout(() => attempt(round + 1), Math.min(1500 * 2 ** round, 10000));
          }
        })
        .catch(() => {
          if (active && round < 5) timer = setTimeout(() => attempt(round + 1), Math.min(1500 * 2 ** round, 10000));
        });
    };
    attempt(0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [state.items, catalog, goneIds]);

  const value = useMemo<CartContextValue>(() => {
    // คำนวณราคา/หน่วยใหม่ทุกครั้งตามจำนวนปัจจุบัน (รองรับราคาขั้นบันได)
    // + รวมบรรทัดสเปคเดียวกันเป็นกลุ่ม แล้วคิดเรทตามจำนวนรวม (25+25 = 50 ชิ้น 2 ลาย → เรท 2)
    const priced = repriceCartGroups(state.items, productOf);
    const items: CartItem[] = state.items.map((i, idx) => {
      const p = productOf(i.productId);
      if (!p) return i;
      const r = priced[idx];
      // 🩹 บรรทัดเก่าที่ฝัง "เรทราคา" ผิดไว้ (ขัดกับสเปคของตัวเอง) — ซ่อมค่าที่โชว์ให้ตรงกับราคาที่คิดจริง
      // ไม่งั้นตะกร้าจะคิดราคาถูกต้องแต่ยังโชว์ชื่อเรทเดิม ลูกค้าอ่านแล้วยิ่งงง (ดู repairRateFromOptions)
      // + ย้ายคีย์กลุ่มที่ถูกเปลี่ยนชื่อ ให้ที่โชว์/ที่ส่งเข้าออเดอร์ตรงกับชื่อกลุ่มปัจจุบัน (ดู migrateRenamedGroupKeys)
      const selections = repairRateFromOptions(p, migrateRenamedGroupKeys(p, i.selections));
      return { ...i, selections, unitPrice: r.unitPrice, extraFee: r.extraFee, addOns: r.addOns, merged: r.merged };
    });
    const totalQty = items.reduce((s, i) => s + i.qty, 0);
    const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice + (i.extraFee ?? 0), 0);
    return {
      items,
      totalQty,
      subtotal,
      addItem: (productId, selections, qty, known) => {
        const put = (p: Product) => {
          // จำสินค้าไว้ในแคตตาล็อก — ตะกร้าคิดราคาใหม่ได้ทันทีโดยไม่ต้องรอยิงฐานข้อมูลซ้ำ
          setCatalog((prev) => (prev.has(p.id) ? prev : new Map(prev).set(p.id, p)));
          dispatch({
            type: "add",
            item: {
              key: cartItemKey(productId, selections),
              productId,
              selections,
              qty,
              unitPrice: unitPriceFor(p, selections, qty),
            },
          });
        };
        // หน้าสินค้าส่งตัวสินค้ามาด้วย = ใส่ตะกร้าได้เลย
        // (แคตตาล็อกในตะกร้าโหลดเฉพาะของที่อยู่ในตะกร้าแล้ว — ตะกร้าว่างจะยังไม่รู้จักสินค้าฐานข้อมูล)
        const product = known ?? productOf(productId);
        if (product) {
          put(product);
          return;
        }
        // รู้แค่ id (เช่น กดสั่งซ้ำจากประวัติออเดอร์) → ดึงจากฐานข้อมูลก่อนค่อยใส่ตะกร้า
        fetchProductsByIds([productId]).then((ps) => {
          const p = ps.find((x) => x.id === productId);
          if (p) put(p);
        });
      },
      removeItem: (key) => dispatch({ type: "remove", key }),
      setQty: (key, qty) => dispatch({ type: "setQty", key, qty }),
      setNote: (key, note) => dispatch({ type: "setNote", key, note }),
      clear: () => dispatch({ type: "clear" }),
      productOf,
      productGone: (id) => goneIds.has(id),
    };
  }, [state.items, productOf, goneIds]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart ต้องใช้ภายใน <CartProvider>");
  return ctx;
}
