"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import { getProduct, repriceCartGroups, unitPriceFor, type Product, type UnitPriceAddOn } from "./products";
import { fetchProductsByIds } from "./product-repo";

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
  /** ส่วนต่างของแกนตารางราคา (เช่น สกรีน 2 ด้าน +฿10) — ฝังในราคาเรทแล้ว แสดงอย่างเดียว ห้ามบวกซ้ำ */
  driverFees?: UnitPriceAddOn[];
  /**
   * ถูกรวมกับบรรทัดอื่นในล็อตผลิตเดียวกันเพื่อคิดเรทตามจำนวนรวม (เช่น 25+25 = 50 ชิ้น 2 ลาย เรท 2)
   * ไว้โชว์ป้ายในตะกร้าให้ลูกค้ารู้ว่าทำไมราคาต่อชิ้นเปลี่ยน — undefined = คิดแบบบรรทัดเดี่ยวตามเดิม
   */
  merged?: { lines: number; totalQty: number; totalDesigns: number; rateLabel?: string };
}

interface CartState {
  items: CartItem[];
}

type CartAction =
  | { type: "hydrate"; items: CartItem[] }
  | { type: "add"; item: CartItem }
  | { type: "remove"; key: string }
  | { type: "setQty"; key: string; qty: number }
  | { type: "clear" };

const STORAGE_KEY = "iducky-cart-v1";

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "hydrate":
      return { items: action.items };
    case "add": {
      const existing = state.items.find((i) => i.key === action.item.key);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.key === action.item.key ? { ...i, qty: i.qty + action.item.qty } : i
          ),
        };
      }
      return { items: [...state.items, action.item] };
    }
    case "remove":
      return { items: state.items.filter((i) => i.key !== action.key) };
    case "setQty":
      if (action.qty < 1) return state;
      return {
        items: state.items.map((i) =>
          // เพดาน 99999 — สินค้าราคาขั้นบันได/หลายเรทสั่งกันหลักพันหลักหมื่นชิ้น (เดิม 99 ไว้กันพิมพ์ผิดของชิ้นเดี่ยว)
          i.key === action.key ? { ...i, qty: Math.min(action.qty, 99999) } : i
        ),
      };
    case "clear":
      return { items: [] };
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
  clear: () => void;
  /** ค้นหาสินค้า (Supabase → static) — ใช้แสดงรายการในตะกร้าให้รองรับสินค้าที่นำเข้าฐานข้อมูล */
  productOf: (id: string) => Product | undefined;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { items: [] });

  // แคตตาล็อกจาก Supabase (รองรับสินค้าที่นำเข้าฐานข้อมูล ไม่ใช่แค่ static array)
  const [catalog, setCatalog] = useState<Map<string, Product>>(new Map());
  const productOf = useMemo(
    () => (id: string): Product | undefined => catalog.get(id) ?? getProduct(id),
    [catalog]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartItem[];
        if (Array.isArray(parsed)) {
          dispatch({ type: "hydrate", items: parsed });
        }
      }
    } catch {
      // ข้อมูลในเครื่องเสียหาย — เริ่มตะกร้าว่างแทน
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    } catch {
      // storage เต็มหรือถูกปิด — ข้ามการบันทึก
    }
  }, [state.items]);

  /**
   * โหลด "เฉพาะสินค้าที่อยู่ในตะกร้า" ไว้คิดราคาใหม่ตามจำนวน
   * ตะกร้าว่าง = ไม่ยิงฐานข้อมูลเลย (เดิมดึงสินค้าทั้งร้าน ~1.4 MB ทุกหน้าที่เปิด แม้ไม่มีของในตะกร้า)
   */
  useEffect(() => {
    const missing = [...new Set(state.items.map((i) => i.productId))].filter((id) => !catalog.has(id));
    if (missing.length === 0) return;
    let active = true;
    fetchProductsByIds(missing).then((ps) => {
      if (!active || ps.length === 0) return;
      setCatalog((prev) => {
        const next = new Map(prev);
        for (const p of ps) next.set(p.id, p);
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [state.items, catalog]);

  const value = useMemo<CartContextValue>(() => {
    // คำนวณราคา/หน่วยใหม่ทุกครั้งตามจำนวนปัจจุบัน (รองรับราคาขั้นบันได)
    // + รวมบรรทัดสเปคเดียวกันเป็นกลุ่ม แล้วคิดเรทตามจำนวนรวม (25+25 = 50 ชิ้น 2 ลาย → เรท 2)
    const priced = repriceCartGroups(state.items, productOf);
    const items: CartItem[] = state.items.map((i, idx) => {
      if (!productOf(i.productId)) return i;
      const r = priced[idx];
      return { ...i, unitPrice: r.unitPrice, extraFee: r.extraFee, addOns: r.addOns, driverFees: r.driverFees, merged: r.merged };
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
      clear: () => dispatch({ type: "clear" }),
      productOf,
    };
  }, [state.items, productOf]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart ต้องใช้ภายใน <CartProvider>");
  return ctx;
}
