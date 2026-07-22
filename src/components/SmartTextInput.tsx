"use client";

/**
 * SmartTextInput.tsx
 * ช่องกรอกข้อความที่ตรวจจับการพิมพ์ผิดภาษา (ลืมสลับ ไทย/อังกฤษ)
 * แล้วเสนอปุ่มแก้ให้ในคลิกเดียว + เตือนด้วย เสียง / สั่น / ไอคอนกะพริบ
 *
 * ใช้แทน <input> / <textarea> ปกติได้เลย เช่น:
 *   <SmartTextInput value={name} onChange={setName} placeholder="ชื่อสินค้า" />
 *
 * เปิด/ปิดการเตือนแต่ละแบบได้:
 *   <SmartTextInput ... sound vibrate blink />           // เปิดทั้งหมด (ค่าเริ่มต้น)
 *   <SmartTextInput ... sound={false} vibrate={false} /> // เอาแค่ไอคอนกะพริบ
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { detectWrongLanguage, fixWrongLanguage } from "@/lib/thai-eng-keyboard";

interface SmartTextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
  /** ตรวจทีละคำทั้งประโยค (เหมาะกับข้อความยาว) แทนการตรวจทั้งก้อน */
  perWord?: boolean;
  /** ความมั่นใจขั้นต่ำที่จะเตือน (0..1) ค่าเริ่มต้น 0.55 */
  minConfidence?: number;
  /** เสียงเตือน (ค่าเริ่มต้น: เปิด) */
  sound?: boolean;
  /** สั่นบนมือถือ (ค่าเริ่มต้น: เปิด) */
  vibrate?: boolean;
  /** ไอคอนกะพริบ (ค่าเริ่มต้น: เปิด) */
  blink?: boolean;
}

/* ---- เสียง beep สั้น ๆ ด้วย Web Audio (ไม่ต้องมีไฟล์เสียง) ---- */
let sharedCtx: AudioContext | null = null;
function playBeep() {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    sharedCtx = sharedCtx || new AC();
    if (sharedCtx.state === "suspended") sharedCtx.resume();
    const t = sharedCtx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = sharedCtx!.createOscillator();
      const g = sharedCtx!.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const s = t + i * 0.11;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.18, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09);
      o.connect(g).connect(sharedCtx!.destination);
      o.start(s);
      o.stop(s + 0.1);
    });
  } catch {
    /* เงียบไว้ถ้าเบราว์เซอร์ไม่รองรับ */
  }
}
function doVibrate() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate([90, 50, 90]);
  }
}

export default function SmartTextInput({
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 3,
  className = "",
  perWord = false,
  minConfidence = 0.55,
  sound = true,
  vibrate = true,
  blink = true,
}: SmartTextInputProps) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const lastAlert = useRef<string | null>(null);

  // ตรวจจับใหม่ทุกครั้งที่ค่าเปลี่ยน (memo กันคำนวณซ้ำ)
  const detection = useMemo(() => {
    if (!value.trim()) return null;

    if (perWord) {
      const fixed = fixWrongLanguage(value, { minConfidence });
      if (fixed !== value) return { suggestion: fixed, confidence: 1 };
      return null;
    }

    const r = detectWrongLanguage(value);
    if (r.suspicious && r.suggestion && r.confidence >= minConfidence) {
      return { suggestion: r.suggestion, confidence: r.confidence };
    }
    return null;
  }, [value, perWord, minConfidence]);

  const showWarning = detection && dismissed !== detection.suggestion;

  // ยิง เสียง/สั่น เฉพาะตอน "เจอคำผิดใหม่" เท่านั้น (ไม่ยิงซ้ำทุกคีย์)
  useEffect(() => {
    if (showWarning && detection) {
      if (detection.suggestion !== lastAlert.current) {
        if (sound) playBeep();
        if (vibrate) doVibrate();
        lastAlert.current = detection.suggestion;
      }
    } else {
      lastAlert.current = null;
    }
  }, [showWarning, detection, sound, vibrate]);

  const baseClass =
    "w-full rounded-lg border px-3 py-2 outline-none transition " +
    (showWarning
      ? "border-amber-400 focus:border-amber-500 bg-amber-50"
      : "border-gray-300 focus:border-blue-500");

  const commonProps = {
    value,
    placeholder,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
      onChange(e.target.value);
      setDismissed(null);
    },
    className: `${baseClass} ${className}`.trim(),
  };

  const applyFix = () => {
    if (detection?.suggestion) {
      onChange(detection.suggestion);
      setDismissed(null);
    }
  };

  return (
    <div className="w-full">
      {/* keyframes สำหรับไอคอนกะพริบ + แถบสั่น (ฝังในตัว ไม่ต้องแก้ config) */}
      <style>{`
        @keyframes sti-blink{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.25;transform:scale(1.35)}}
        @keyframes sti-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
        .sti-blink{display:inline-block;animation:sti-blink .7s ease-in-out infinite}
        .sti-shake{animation:sti-shake .35s ease}
      `}</style>

      {multiline ? (
        <textarea {...commonProps} rows={rows} />
      ) : (
        <input type="text" {...commonProps} />
      )}

      {showWarning && (
        <div
          key={detection!.suggestion}
          className="sti-shake mt-1 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-sm text-amber-800"
        >
          <span aria-hidden className={blink ? "sti-blink" : ""}>
            ⚠️
          </span>
          <span>
            เหมือนพิมพ์ผิดภาษา? น่าจะหมายถึง{" "}
            <b className="font-semibold">{detection!.suggestion}</b>
          </span>
          <button
            type="button"
            onClick={applyFix}
            className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-medium text-white hover:bg-amber-600"
          >
            แก้ให้ถูก
          </button>
          <button
            type="button"
            onClick={() => setDismissed(detection!.suggestion)}
            className="rounded-md px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            ไม่ใช่ / ปิด
          </button>
        </div>
      )}
    </div>
  );
}
