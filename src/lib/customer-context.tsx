"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getCustomer, onAuthChange, type Customer } from "./customer-auth";

interface CustomerCtx {
  customer: Customer | null;
  loading: boolean;
  refresh: () => void;
}

const Ctx = createContext<CustomerCtx>({ customer: null, loading: true, refresh: () => {} });

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCustomer().then((c) => {
      setCustomer(c);
      setLoading(false);
    });
    return onAuthChange(setCustomer);
  }, []);

  const refresh = () => getCustomer().then(setCustomer);

  return <Ctx.Provider value={{ customer, loading, refresh }}>{children}</Ctx.Provider>;
}

export const useCustomer = () => useContext(Ctx);
