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
import { designFeeFor, getProduct, unitPriceFor, type Product } from "./products";
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
  addItem: (productId: string, selections: Record<string, string>, qty: number) => void;
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
    const items: CartItem[] = state.items.map((i) => {
      const product = productOf(i.productId);
      if (!product) return i;
      return {
        ...i,
        unitPrice: unitPriceFor(product, i.selections, i.qty),
        extraFee: designFeeFor(product, i.selections, i.qty),
      };
    });
    const totalQty = items.reduce((s, i) => s + i.qty, 0);
    const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice + (i.extraFee ?? 0), 0);
    return {
      items,
      totalQty,
      subtotal,
      addItem: (productId, selections, qty) => {
        const product = productOf(productId);
        if (!product) return;
        dispatch({
          type: "add",
          item: {
            key: cartItemKey(productId, selections),
            productId,
            selections,
            qty,
            unitPrice: unitPriceFor(product, selections, qty),
          },
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
