"use client";

import Portal from "@/components/Portal";
import { fallbackToOriginal, imgProps } from "@/lib/img";

/* eslint-disable @next/next/no-img-element */

/**
 * การ์ดพรีวิวลอย (รูป + ชื่อ + ราคา) — โผล่ข้างรายการที่ชี้ในเมกะเมนู / ผลค้นหาบนแถบเมนู
 * ต้นแบบใช้ #navMegaTip ตัวเดียวย้ายไปแขวนที่ <body> เพราะแผงเมนูมี transform (position:fixed จะอ้างอิงผิดจุด)
 * ของจริง: Portal ไป body แล้วครอบด้วย .dl.dl-contents ให้ CSS ชุด .dl ยังครอบถึง
 */
export interface TipState {
  name: string;
  price: string;
  img: string;
  emoji?: string;
  left: number;
  top: number;
  flip: boolean;
}

/** ขนาดการ์ด (ตรงกับ .nav-mega-tip ใน landing.css) — ใช้คำนวณตำแหน่งก่อนการ์ดถูกวาด */
export const TIP_W = 172;
export const TIP_H = 210;
export const TIP_GAP = 14;

/** ตำแหน่งการ์ดข้างแถวที่ชี้ — ไม่มีที่ทางฝั่งขวาพอ = พลิกไปโผล่ฝั่งซ้ายแทน */
export function tipPositionFor(el: HTMLElement): { left: number; top: number; flip: boolean } {
  const r = el.getBoundingClientRect();
  const flip = window.innerWidth - r.right < TIP_W + TIP_GAP + 16;
  const left = flip ? r.left - TIP_GAP - TIP_W : r.right + TIP_GAP;
  const top = Math.min(Math.max(r.top + r.height / 2, TIP_H / 2 + 10), window.innerHeight - TIP_H / 2 - 10);
  return { left, top, flip };
}

export default function PreviewTip({ tip }: { tip: TipState | null }) {
  return (
    <Portal>
      <div className="dl dl-contents">
        <div
          className={`nav-mega-tip${tip ? " show" : ""}${tip?.flip ? " flip" : ""}`}
          aria-hidden="true"
          style={tip ? { left: tip.left, top: tip.top } : undefined}
        >
          <div className="tip-img-wrap">
            {tip?.img ? (
              <img {...imgProps(tip.img, "172px", 256)} alt="" onError={fallbackToOriginal(tip.img)} />
            ) : (
              <em className="tip-emoji">{tip?.emoji || "🦆"}</em>
            )}
          </div>
          <b className="tip-name">{tip?.name}</b>
          <span className="tip-price">{tip?.price ?? ""}</span>
        </div>
      </div>
    </Portal>
  );
}
