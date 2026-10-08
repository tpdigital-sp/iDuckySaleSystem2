"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";

/**
 * 🤖 ชิ้นส่วนร่วมของหมวด Chatbot — แท็บสลับหน้า · เรียก API · ย่อรูป · toast
 * หน้า: ผู้ช่วยตอบแชท / คลังความรู้ / ตารางราคา (ย้ายจาก AdminBuddy 3 ต.ค. 69) · หน้าลิงก์ราคา & รูป เอาออกแล้ว 3 ต.ค. 69 (ภาพในคำตอบดึงภาพปกสินค้าบนเว็บเอง)
 */

const TABS = [
  { href: "/admin/chatbot", label: "🤖 ผู้ช่วยตอบแชท" },
  { href: "/admin/chatbot/knowledge", label: "📚 คลังความรู้" },
  { href: "/admin/chatbot/pricing", label: "💰 ตารางราคา" },
  // 💸 แดชบอร์ดค่าใช้จ่าย AI สด (8 ต.ค. 69) — สิทธิ์ reports.view · คนที่ไม่มีสิทธิ์กดแล้วเจอหน้า "ไม่มีสิทธิ์" ของ RequirePerm
  { href: "/admin/chatbot/costs", label: "💸 ค่าใช้จ่าย" },
];

/** แถบแท็บใต้หัวหน้า — สลับ 4 หน้าของบอทได้ในคลิกเดียว */
export function ChatbotTabs({ inHead }: { inHead?: boolean } = {}) {
  const path = usePathname();
  return (
    <nav className={`dkb-scroll flex gap-1.5 ${inHead ? "" : "mt-3"}`} aria-label="หน้าในหมวด Chatbot">
      {TABS.map((t) => {
        const on = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className="min-h-[40px] shrink-0 rounded-full px-4 py-2 text-[13.5px] font-bold transition"
            style={on ? { background: "var(--dk-navy)", color: "white" } : { background: "white", color: "var(--dk-navy-soft)", border: "1px solid var(--dk-hair)" }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** เรียก API ของบอท — โยน Error ข้อความไทยที่แสดงได้เลย */
export async function botApi<T>(url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("ต่อเซิร์ฟเวอร์ไม่ได้ — เช็คเน็ตแล้วลองใหม่");
  }
  const d = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !d) throw new Error(d?.error || (res.status === 413 ? "ข้อมูล/รูปใหญ่เกินไป" : `เซิร์ฟเวอร์ตอบผิดพลาด (HTTP ${res.status})`));
  return d;
}

/**
 * ย่อรูปให้ด้านยาว ≤ max แล้วคืน JPEG — ส่งผ่าน Netlify ได้แค่ ~4.5MB ต่อคำขอ
 * (ส่งให้ AI อ่านใช้ 1280 พอ · เก็บถาวรใช้ 1600)
 */
export async function shrinkImage(file: File, max = 1600, quality = 0.86): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 1_500_000) return file;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise<Blob>((r) => c.toBlob((b) => r(b ?? file), "image/jpeg", quality));
}

export const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(b);
  });

/** อัปรูปขึ้น Storage (โฟลเดอร์ตามแบบเดิม) → { url, storagePath } */
export async function uploadBotImage(folder: string, file: File): Promise<{ url: string; storagePath: string }> {
  const blob = await shrinkImage(file);
  const fd = new FormData();
  fd.append("folder", folder);
  fd.append("file", blob, file.name.replace(/\.\w+$/, "") + (blob.type === "image/jpeg" && blob !== file ? ".jpg" : file.name.match(/\.\w+$/)?.[0] ?? ".jpg"));
  const res = await fetch("/api/admin/chatbot/upload", { method: "POST", body: fd });
  const d = (await res.json().catch(() => null)) as { url?: string; storagePath?: string; error?: string } | null;
  if (!res.ok || !d?.url) throw new Error(d?.error || `อัปรูปไม่สำเร็จ (HTTP ${res.status})`);
  return { url: d.url, storagePath: d.storagePath ?? "" };
}

/** แถบแจ้งผลมุมล่าง — ok = เขียว · bad = แดง (ค้างนานกว่า) */
export function useToast() {
  const [t, setT] = useState<{ text: string; bad?: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, bad = false) => {
    setT({ text, bad });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), bad ? 6000 : 2600);
  }, []);
  const node = t ? (
    <div
      role="status"
      className="fixed bottom-24 left-1/2 z-[120] max-w-[92vw] -translate-x-1/2 rounded-2xl px-4 py-3 text-[14px] font-bold shadow-xl lg:bottom-6"
      style={t.bad ? { background: "var(--dk-coral-ink)", color: "white" } : { background: "var(--dk-navy)", color: "white" }}
    >
      {t.text}
    </div>
  ) : null;
  return { toast: show, toastNode: node };
}

/** เวลาแบบ "3 ชม.ก่อน" (หน้าเดิมใช้ getTimeAgo) — เกิน 30 วันโชว์วันที่ พ.ศ. */
export function ago(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "เมื่อกี้";
  if (s < 3600) return `${Math.floor(s / 60)} นาทีก่อน`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.ก่อน`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} วันก่อน`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

/** เลขหน้า ← 1/5 → (ใช้ทั้ง 3 หน้า) */
export function Pager({ page, pages, onPage, total }: { page: number; pages: number; onPage: (p: number) => void; total: number }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-2 text-[13px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>
      <button type="button" className="dkb-btn dkb-btn-ghost dkb-btn-sm min-h-[40px]" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← ก่อนหน้า
      </button>
      <span className="tabular-nums">
        หน้า {page}/{pages} · {total.toLocaleString()} รายการ
      </span>
      <button type="button" className="dkb-btn dkb-btn-ghost dkb-btn-sm min-h-[40px]" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        ถัดไป →
      </button>
    </div>
  );
}

/** กรอบ modal ของระบบ (dkb-mwrap) — มือถือเป็นแผ่นเลื่อนขึ้นจากล่าง */
export function Modal({ title, sub, onClose, children, foot, wide }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; foot?: React.ReactNode; wide?: boolean }) {
  return (
    <div className="dkb-mwrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dkb-modal" style={wide ? { maxWidth: 860 } : undefined}>
        <div className="dkb-mhead">
          <div className="min-w-0 flex-1">
            <p className="ti">{title}</p>
            {sub && <p className="sub">{sub}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg hover:bg-[var(--dk-sky)]">
            ✕
          </button>
        </div>
        <div className="dkb-mbody">{children}</div>
        {foot && <div className="dkb-mfoot">{foot}</div>}
      </div>
    </div>
  );
}
