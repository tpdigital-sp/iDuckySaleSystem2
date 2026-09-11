"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 📷 สแกนบาร์โค้ด/QR ด้วยกล้องมือถือของพนักงานเอง — ไม่ต้องมีเครื่องยิง
 *
 * ใช้ที่: สถานีแพ็ค–ส่ง (ยิงเลขออเดอร์ → เลขพัสดุ) และโหมดแพ็คในหน้าออเดอร์ (เลขพัสดุ / ใบถัดไป)
 *
 * ตัวอ่าน 2 ชั้น:
 *  1. BarcodeDetector ของเบราว์เซอร์ (Chrome Android) — เร็ว ไม่กินแบต
 *  2. @zxing/browser (iPhone Safari และเบราว์เซอร์ที่ไม่มีข้อ 1) — โหลดเฉพาะตอนเปิดกล้อง
 * ทางสำรอง: เลือกรูป/ถ่ายรูปบาร์โค้ดจากแกลเลอรี (กรณีกล้องสดถูกปิดสิทธิ์) และพิมพ์เอง
 *
 * รูปแบบที่อ่าน: QR (ใบงาน/ลิงก์) · CODE128 (ใบปะหน้า + เลขพัสดุไปรษณีย์ไทย) · CODE39 · EAN13
 * อ่านได้แล้ว = สั่น + ส่งค่าให้ onResult แล้วปิดตัวเอง (พ่อแม่ตัดสินใจเองว่าจะเปิดสแกนต่อไหม)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type NativeDetector = { detect(src: ImageBitmapSource): Promise<{ rawValue: string }[]> };
type NativeDetectorCtor = new (opts: { formats: string[] }) => NativeDetector;
const NATIVE_FORMATS = ["qr_code", "code_128", "code_39", "ean_13"];

function nativeDetector(): NativeDetector | null {
  const w = window as any;
  if (typeof w.BarcodeDetector !== "function") return null;
  try {
    return new (w.BarcodeDetector as NativeDetectorCtor)({ formats: NATIVE_FORMATS });
  } catch {
    return null;
  }
}

/** ตัวอ่าน zxing (โหลดขี้เกียจ) — ตั้งให้อ่านเฉพาะรูปแบบที่ร้านใช้ จะได้ไม่เดามั่วจากลายกระดาษ */
async function zxingReader() {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 800 });
}

export default function CameraScanner({
  open,
  title,
  hint,
  onResult,
  onClose,
  footer,
}: {
  open: boolean;
  /** หัวเรื่องบอกว่ากำลังสแกนอะไร เช่น "สแกนบาร์โค้ดเลขออเดอร์" */
  title: string;
  hint?: string;
  onResult: (text: string) => void;
  onClose: () => void;
  /** แผงของพ่อแม่ใต้ภาพกล้อง (เช่น ชุดใบที่สแกนสะสมตอนสแกนกองใบงาน) — กล้องยังเปิดอยู่ตราบใดที่ open ยังเป็น true */
  footer?: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [engine, setEngine] = useState<"native" | "zxing" | null>(null);
  const [torch, setTorch] = useState<{ on: boolean; set: (v: boolean) => Promise<void> } | null>(null);
  const [manual, setManual] = useState("");
  const [decodingFile, setDecodingFile] = useState(false);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  /** ส่งผลลัพธ์ — กันอ่านซ้ำเฟรมติดกัน (โค้ดเดิมภายใน 2 วิ ไม่นับ) */
  const emit = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    const now = Date.now();
    if (lastRef.current.text === t && now - lastRef.current.at < 2000) return;
    lastRef.current = { text: t, at: now };
    try {
      navigator.vibrate?.(80);
    } catch {
      /* บางเครื่องไม่มี */
    }
    onResultRef.current(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    let controls: { stop(): void; switchTorch?: (on: boolean) => Promise<void> } | null = null;
    setErr(null);
    setEngine(null);
    setTorch(null);
    lastRef.current = { text: "", at: 0 };

    const video = videoRef.current;
    if (!video) return;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr("เบราว์เซอร์นี้เปิดกล้องไม่ได้ — ต้องเปิดผ่าน https หรือใช้ปุ่มเลือกรูปด้านล่างแทน");
        return;
      }
      const det = nativeDetector();
      try {
        if (det) {
          // ── ทาง 1: BarcodeDetector ของเบราว์เซอร์ ──
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
          if (stopped) return;
          video!.srcObject = stream;
          await video!.play();
          setEngine("native");
          const track = stream.getVideoTracks()[0];
          const caps = (track.getCapabilities?.() ?? {}) as any;
          if (caps.torch) {
            setTorch({
              on: false,
              set: async (v) => {
                await track.applyConstraints({ advanced: [{ torch: v } as any] });
                setTorch((t) => (t ? { ...t, on: v } : t));
              },
            });
          }
          let busy = false;
          const tick = async () => {
            if (stopped) return;
            if (!busy && video!.readyState >= 2) {
              busy = true;
              try {
                const codes = await det.detect(video!);
                if (codes.length) emit(codes[0].rawValue);
              } catch {
                /* เฟรมนี้อ่านไม่ได้ ข้าม */
              }
              busy = false;
            }
            raf = window.setTimeout(tick, 150);
          };
          tick();
        } else {
          // ── ทาง 2: zxing (iPhone) ──
          const reader = await zxingReader();
          if (stopped) return;
          controls = await reader.decodeFromVideoDevice(undefined, video!, (result) => {
            if (result) emit(result.getText());
          });
          if (stopped) {
            controls.stop();
            return;
          }
          setEngine("zxing");
          if (controls.switchTorch) {
            const sw = controls.switchTorch;
            setTorch({
              on: false,
              set: async (v) => {
                await sw(v);
                setTorch((t) => (t ? { ...t, on: v } : t));
              },
            });
          }
        }
      } catch (e: any) {
        if (stopped) return;
        const name = e?.name ?? "";
        setErr(
          name === "NotAllowedError"
            ? "ไม่ได้รับอนุญาตให้ใช้กล้อง — เปิดสิทธิ์กล้องให้เว็บนี้ในการตั้งค่าเบราว์เซอร์ หรือใช้ปุ่มเลือกรูปด้านล่าง"
            : name === "NotFoundError"
              ? "ไม่พบกล้องในเครื่องนี้ — ใช้ปุ่มเลือกรูป หรือพิมพ์เลขเองด้านล่าง"
              : `เปิดกล้องไม่สำเร็จ (${name || e?.message || "ไม่ทราบสาเหตุ"}) — ใช้ปุ่มเลือกรูป หรือพิมพ์เลขเอง`
        );
      }
    }
    void start();

    return () => {
      stopped = true;
      window.clearTimeout(raf);
      try {
        controls?.stop();
      } catch {
        /* ปิดไปแล้ว */
      }
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, [open, emit]);

  /** ทางสำรอง: อ่านจากรูปที่เลือก/ถ่าย (ใช้ตัวอ่านเดียวกัน) */
  async function decodeFile(f: File | null | undefined) {
    if (!f) return;
    setDecodingFile(true);
    setErr(null);
    const url = URL.createObjectURL(f);
    try {
      const det = nativeDetector();
      if (det) {
        const bmp = await createImageBitmap(f);
        const codes = await det.detect(bmp);
        if (codes.length) {
          emit(codes[0].rawValue);
          return;
        }
      }
      const reader = await zxingReader();
      const r = await reader.decodeFromImageUrl(url);
      emit(r.getText());
    } catch {
      setErr("อ่านบาร์โค้ดจากรูปนี้ไม่ได้ — ถ่ายใหม่ให้บาร์โค้ดเต็มกรอบ ชัด ไม่สะท้อนแสง");
    } finally {
      URL.revokeObjectURL(url);
      setDecodingFile(false);
    }
  }

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[120] flex flex-col bg-black text-white">
      {/* หัว */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-extrabold">📷 {title}</p>
          <p className="truncate text-xs text-white/70">{hint ?? "จ่อกล้องให้บาร์โค้ดอยู่ในกรอบ อ่านได้จะสั่นแล้วไปต่อเอง"}</p>
        </div>
        {torch && (
          <button
            type="button"
            onClick={() => void torch.set(!torch.on)}
            className={`rounded-full px-3 py-1.5 text-sm font-bold ${torch.on ? "bg-amber-400 text-black" : "bg-white/15"}`}
          >
            🔦 {torch.on ? "ปิดไฟ" : "เปิดไฟ"}
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold">
          ✕ ปิด
        </button>
      </div>

      {/* กล้อง */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
        {/* กรอบเล็ง — แค่บอกตำแหน่ง ตัวอ่านดูทั้งภาพ */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-40 w-[82%] max-w-sm rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
        {!engine && !err && (
          <p className="absolute inset-x-0 bottom-4 text-center text-sm font-bold text-white/80">กำลังเปิดกล้อง…</p>
        )}
        {err && (
          <div className="absolute inset-x-4 top-4 rounded-xl bg-rose-600/95 px-4 py-3 text-sm font-bold leading-snug">{err}</div>
        )}
      </div>

      {footer}

      {/* ทางสำรอง */}
      <div className="space-y-2 bg-slate-900 p-3">
        <div className="flex gap-2">
          <label className="flex flex-1 cursor-pointer items-center justify-center rounded-xl bg-white/10 px-3 py-3 text-sm font-bold">
            {decodingFile ? "กำลังอ่านรูป…" : "🖼️ ถ่าย/เลือกรูปบาร์โค้ด"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={decodingFile}
              onChange={(e) => {
                void decodeFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) {
              emit(manual);
              setManual("");
            }
          }}
        >
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="หรือพิมพ์เลขเอง"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2.5 font-mono text-sm font-bold text-slate-900"
          />
          <button type="submit" disabled={!manual.trim()} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-40">
            ตกลง
          </button>
        </form>
        <p className="text-center text-[11px] text-white/50">
          {engine === "native" ? "ตัวอ่านของเบราว์เซอร์" : engine === "zxing" ? "ตัวอ่าน zxing" : ""}
          {engine ? " · " : ""}อ่าน QR ใบงาน · บาร์โค้ดใบปะหน้า · บาร์โค้ดเลขพัสดุ
        </p>
      </div>
    </div>
  );
}
