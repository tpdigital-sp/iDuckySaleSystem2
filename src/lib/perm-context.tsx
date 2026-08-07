"use client";

import { createContext, useContext } from "react";
import type { Perm } from "@/lib/permissions";

/**
 * สิทธิ์ของผู้ใช้ที่ล็อกอินอยู่ — AdminShell เป็นคนใส่ค่าให้ทุกหน้าใต้ /admin
 * ใช้ซ่อน/แสดงปุ่มเท่านั้น · การบังคับจริงอยู่ที่ API (requirePerm)
 */
const PermContext = createContext<{ perms: Perm[]; role: string; name: string; isAdministrator?: boolean }>({
  perms: [],
  role: "",
  name: "",
  isAdministrator: false,
});

export const PermProvider = PermContext.Provider;

/** ผู้ใช้คนนี้ทำสิ่งนี้ได้ไหม — ใช้ในคอมโพเนนต์หน้าจอ */
export function useCan(): (perm: Perm) => boolean {
  const { perms } = useContext(PermContext);
  return (perm: Perm) => perms.includes(perm);
}

/**
 * เป็น "ผู้ดูแลระบบ" (Administrator) ไหม — ใช้ซ่อนของที่อ่อนไหวกว่าสิทธิ์ปกติ
 * เช่น บัญชีรับเงินของร้าน · ตารางบทบาท · โค้ดเชื่อม Google
 */
export function useIsAdministrator(): boolean {
  return !!useContext(PermContext).isAdministrator;
}

/** ชื่อตำแหน่งไว้แสดง เช่น "พนักงาน · แพ็คของ" */
export function useRoleLabel(): string {
  return useContext(PermContext).role;
}

/** ชื่อผู้ทำสำหรับบันทึกประวัติ (audit log) — ชื่อจริง > ตำแหน่ง > "แอดมิน" */
export function useActor(): string {
  const { name, role } = useContext(PermContext);
  return name?.trim() || role || "แอดมิน";
}
