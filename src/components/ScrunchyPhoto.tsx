"use client";

/**
 * 🎀📸 ดูแบบเป็นภาพ 2D หลายมุม — ลายลูกค้าบนรูปผ้าซาตินขาวจริง (แบบงานปลอกคอหมา)
 *   Scrunchy 6 มุม (lib/scrunchy-photo · public/mock/scrunchy) · ผ้าผูกผม 4 มุม (lib/scarf-photo · public/mock/scarf)
 * (เจ้าของร้านสั่ง 23 ต.ค. 69 "ทำเป็นภาพ 2D แทน" — 3D ที่สร้างทรงเองดูไม่เป็นธรรมชาติ · ตามด้วยรูปผ้าผูกผมขาว)
 */

import { useEffect, useRef, useState } from "react";
import type { HairMock } from "@/lib/hair-mock";
import { SCRUNCHY_ASSET, SCRUNCHY_VIEWS, SCRUNCHY_VIEW_TH, loadImg, renderScrunchyView, type ViewInfo } from "@/lib/scrunchy-photo";
import { SCARF_ASSET, SCARF_VIEWS, SCARF_VIEW_TH, renderScarfView, type ScarfView } from "@/lib/scarf-photo";

/** ชุดรูปต่อสินค้า — มุม · ชื่อมุม · วิธีวาด (รูปผ้าขาว + มาสก์ → ภาพสำเร็จ) */
type Cfg = {
  name: string;
  asset: string;
  views: readonly string[];
  th: Record<string, string>;
  aspect: string;
  bg: string;
  draw: (k: string, photo: HTMLImageElement, mask: HTMLImageElement, sheet: HTMLCanvasElement, sheetMm: { w: number; h: number }, info: Record<string, ViewInfo> | null, lit: boolean) => HTMLCanvasElement;
  note: string;
};
const CFG: Record<HairMock["style"], Cfg> = {
  scrunchy: {
    name: "ยางรัดผม Scrunchy",
    asset: SCRUNCHY_ASSET,
    views: SCRUNCHY_VIEWS,
    th: SCRUNCHY_VIEW_TH,
    aspect: "aspect-[1018/890]",
    bg: "bg-[#d3d3d3]",
    draw: (k, photo, mask, sheet, mm, info, lit) => renderScrunchyView(k as (typeof SCRUNCHY_VIEWS)[number], info![k], photo, mask, sheet, mm, lit),
    note: "ภาพตัวอย่างโดยประมาณ — ลายวิ่งรอบวงตามผืน ตำแหน่งจีบของจริงไม่ตายตัว · ส่วนเผื่อเย็บนอกเส้นประไม่เห็นในงานจริง · สีผ้าจริงอาจต่างจากหน้าจอเล็กน้อย",
  },
  scarf: {
    name: "ผ้าผูกผม",
    asset: SCARF_ASSET,
    views: SCARF_VIEWS,
    th: SCARF_VIEW_TH,
    aspect: "aspect-[600/1096]",
    bg: "bg-[#d3d3d3]", // พื้นเทาแบบ Scrunchy (เจ้าของร้าน "พื้นหลังสีเทาดีกว่า" — เดิมเขียวมิ้นต์ตามรูป)
    draw: (k, photo, mask, sheet, mm, _info, lit) => renderScarfView(k as ScarfView, photo, mask, sheet, mm, lit),
    note: "ภาพตัวอย่างโดยประมาณ — ผ้าพิมพ์ผืนเดียวพับครึ่งตามยาว วางพับกลางผืน: ขาหนึ่งเห็นครึ่งบนของผืน อีกขาเห็นครึ่งล่าง (กลับหัวตามการพับ) · สีผ้าจริงอาจต่างจากหน้าจอเล็กน้อย",
  },
};

export default function ScrunchyPhoto({
  sheet,
  sheetMm,
  mock,
  title,
  onClose,
}: {
  sheet: HTMLCanvasElement;
  sheetMm: { w: number; h: number };
  mock: HairMock;
  title: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const cfg = CFG[mock.style];
  const [view, setView] = useState<string>(mock.style === "scarf" ? "flatFront" : "front");
  const [urls, setUrls] = useState<Record<string, string>>({});
  /** 💡 แสงเงาผ้าจากรูปจริง — เปิดตลอด (ลองปิดเป็นสีตรงลาย 23 ต.ค. 69 แล้วเจ้าของร้านว่า "กลับไปแบบเดิมดีกว่า") */
  const lit = true;
  const made = useRef<string[]>([]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const info = mock.style === "scrunchy" ? ((await fetch(`${cfg.asset}/views.json`).then((r) => r.json())) as Record<string, ViewInfo>) : null;
        // มุมหน้าก่อน ที่เหลือทยอยวาด (จอไม่ค้าง)
        for (const k of cfg.views) {
          const [photo, mask] = await Promise.all([loadImg(`${cfg.asset}/${k}.webp`), loadImg(`${cfg.asset}/${k}-mask.png`)]);
          if (dead) return;
          const cv = cfg.draw(k, photo, mask, sheet, sheetMm, info, lit);
          const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, "image/png"));
          if (dead || !blob) return;
          const url = URL.createObjectURL(blob);
          made.current.push(url);
          setUrls((u) => ({ ...u, [k]: url }));
          if (k === "front") setStatus("ready");
          await new Promise((r) => setTimeout(r, 0));
        }
      } catch (e) {
        console.error("ScrunchyPhoto", e);
        if (!dead) setStatus("error");
      }
    })();
    return () => {
      dead = true;
      made.current.forEach((u) => URL.revokeObjectURL(u));
      made.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, sheetMm]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-900/55 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div className="relative flex max-h-full w-full max-w-3xl flex-col overflow-y-auto rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-lg shadow-[0_4px_12px_rgba(139,92,246,.35)]">🎀</span>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold leading-tight text-stone-800">
              <span className="shrink-0">ดูแบบ</span>
              <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-stone-700 ring-1 ring-sky-200">
                <span className="truncate">{cfg.name}</span>
                {mock.label ? <span className="truncate text-stone-400">· {mock.label}</span> : null}
              </span>
            </p>
            <p className="truncate text-xs text-stone-500">{title} · ผ้าซาติน</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-700" aria-label="ปิด">
            ✕
          </button>
        </div>

        <div className={`relative mx-3 grid max-h-[60vh] place-items-center overflow-hidden rounded-2xl ring-1 ring-stone-200/70 ${cfg.bg} ${mock.style === "scarf" ? "h-[60vh]" : cfg.aspect}`}>
          {status !== "ready" ? (
            status === "loading" ? (
              <div className="flex flex-col items-center gap-2 text-stone-500">
                <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-violet-200 border-t-violet-600" />
                <span className="text-xs font-bold">กำลังวางลายบนผ้า…</span>
              </div>
            ) : (
              <p className="max-w-xs rounded-2xl bg-white/90 p-4 text-center text-xs font-bold text-rose-600 ring-1 ring-rose-200">เตรียมภาพตัวอย่างไม่สำเร็จ — ลองปิดแล้วเปิดใหม่</p>
            )
          ) : (
            cfg.views.map((k) =>
              urls[k] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={k}
                  src={urls[k]}
                  alt={cfg.th[k]}
                  className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${view === k ? "opacity-100" : "opacity-0"}`}
                />
              ) : null,
            )
          )}
          <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-stone-700 shadow-sm ring-1 ring-stone-200">{cfg.th[view]}</span>
        </div>

        <div className="space-y-2.5 px-4 pb-4 pt-3">
          <div className={`grid gap-1.5 ${cfg.views.length > 6 ? "grid-cols-9" : "grid-cols-6"}`} role="radiogroup" aria-label="มุมมอง">
            {cfg.views.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={view === k}
                onClick={() => setView(k)}
                className={`flex flex-col items-center gap-1 rounded-xl p-1 text-[10px] font-bold transition sm:text-[11px] ${view === k ? "bg-sky-50 text-sky-700 ring-2 ring-sky-500" : "text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50"}`}
              >
                {/* ภาพย่อเต็มชิ้น (absolute) — รูปผ้าผูกผมแนวตั้งเคยล้นช่องโดนครอปเหลือครึ่งบน (เจ้าของร้าน "ให้แสดงภาพเต็ม") */}
                <span className={`relative grid aspect-square w-full place-items-center overflow-hidden rounded-lg ${cfg.bg}`}>
                  {urls[k] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[k]} alt="" className="absolute inset-0 h-full w-full object-contain p-1" />
                  ) : (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                  )}
                </span>
                <span className="truncate">{cfg.th[k]}</span>
              </button>
            ))}
          </div>
          <p className="text-center text-[11px] text-stone-400">{cfg.note}</p>
        </div>
      </div>
    </div>
  );
}
