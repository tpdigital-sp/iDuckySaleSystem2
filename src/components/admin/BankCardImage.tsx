"use client";

/**
 * 🖼 ภาพเลขบัญชีส่งลูกค้า — ภาพออกแบบสำเร็จ public/payment/bank-card.webp (เป็ด iDucky + บัญชีกสิกร)
 * ภาพตายตัว: เปลี่ยนเลขบัญชีในหน้าตั้งค่าแล้วภาพไม่เปลี่ยนตาม → เตือนเมื่อเลขในตั้งค่าไม่ตรงกับเลขในภาพ
 * ดาวน์โหลด/คัดลอกเป็น PNG (คลิปบอร์ดรับแต่ PNG และแชท LINE วางได้)
 */
import { useState } from "react";
import type { BankAccount } from "@/lib/shop-settings";

const IMG = "/payment/bank-card.webp";
/** เลขบัญชีที่อยู่ในภาพ — เปลี่ยนภาพใหม่ต้องแก้ตรงนี้ด้วย */
const IMG_ACCOUNT_NO = "0278753328";
const digits = (s: string) => s.replace(/\D/g, "");

async function pngBlob(): Promise<Blob | null> {
  const im = new Image();
  im.src = IMG;
  await im.decode();
  const c = document.createElement("canvas");
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  c.getContext("2d")!.drawImage(im, 0, 0);
  return new Promise((r) => c.toBlob(r, "image/png"));
}

export default function BankCardImage({ banks, onClose }: { banks: BankAccount[]; onClose: () => void }) {
  const [msg, setMsg] = useState("");
  const nos = banks.map((b) => digits(b.accountNo)).filter(Boolean);
  const mismatch = nos.length > 0 && (nos.length > 1 || nos[0] !== IMG_ACCOUNT_NO);

  async function download() {
    const b = await pngBlob();
    if (!b) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "iducky-bank-account.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function copy() {
    try {
      // ส่ง promise เข้า ClipboardItem ตรง ๆ — Safari ต้องเรียก write ทันทีในจังหวะคลิก
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob().then((b) => b!) })]);
      setMsg("✓ คัดลอกภาพแล้ว — ไปวาง (⌘V) ในแชทได้เลย");
    } catch {
      setMsg("คัดลอกไม่ได้ในเบราว์เซอร์นี้ — ใช้ปุ่มดาวน์โหลดแทน");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-display text-[15px] font-semibold text-slate-800">🖼 ภาพเลขบัญชีส่งลูกค้า</h3>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-slate-50 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- ภาพเดียวในป๊อปอัป ไม่ต้องผ่าน next/image */}
          <img src={IMG} alt="ภาพเลขบัญชีธนาคารร้าน iDucky" className="mx-auto h-auto w-full rounded-2xl shadow-sm ring-1 ring-slate-200" />
        </div>
        <div className="space-y-2 border-t border-slate-100 px-5 py-3">
          {mismatch && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
              ⚠️ เลขบัญชีในตั้งค่าไม่ตรงกับในภาพ (ภาพเป็นกสิกร 027-8-75332-8) — ต้องทำภาพใหม่ก่อนส่งลูกค้า
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copy}
              className="flex-1 rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
            >
              📋 คัดลอกภาพ
            </button>
            <button
              type="button"
              onClick={download}
              className="flex-1 rounded-full bg-[#4A9BB5] px-4 py-2 text-xs font-bold text-white hover:bg-[#3E8AA3]"
            >
              ⬇️ ดาวน์โหลด PNG
            </button>
          </div>
          {msg && <p className="text-center text-[11px] font-semibold text-emerald-600">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
