"use client";

/**
 * 📮 ช่วยเติม ตำบล/อำเภอ/จังหวัด จากรหัสไปรษณีย์ — ใต้ช่อง "ที่อยู่จัดส่ง" หน้า checkout (เจ้าของร้านอนุมัติ 12 ต.ค. 69)
 *
 * ที่อยู่ยังเก็บเป็นข้อความก้อนเดียวเหมือนเดิม (ใบปะหน้า · ปณ. · FlowAccount อ่านช่องนี้ช่องเดียว)
 * ตัวนี้แค่ "ต่อท้าย" บรรทัด "ต.… อ.… จ.… 12345" ให้ — ลูกค้าพิมพ์บ้านเลขที่/ถนนเองในช่องหลัก
 * เลือกใหม่ = แทนที่บรรทัดที่เติมไว้ครั้งก่อน (ไม่ต่อซ้ำ) · ลูกค้าแก้บรรทัดนั้นเองแล้ว = ต่อท้ายใหม่ ไม่ไปยุ่งของเดิม
 *
 * ข้อมูล: /data/th-postcodes.json (สร้างจาก npm thai-address-database@0.0.33 ไลเซนส์ ISC
 *   7,438 ตำบล · 956 รหัส · ~61 KB gzip) โหลดเฉพาะตอนพิมพ์รหัสครบ 5 หลักครั้งแรก
 * รูปแบบ: { p: [จังหวัด], a: [[อำเภอ, iจังหวัด]], z: { "10110": [[ตำบล, iอำเภอ], …] } }
 */

import { useRef, useState } from "react";

type PostcodeDb = { p: string[]; a: [string, number][]; z: Record<string, [string, number][]> };

let dbPromise: Promise<PostcodeDb> | null = null;
function loadDb(): Promise<PostcodeDb> {
  dbPromise ??= fetch("/data/th-postcodes.json")
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<PostcodeDb>;
    })
    .catch((e) => {
      dbPromise = null; // เน็ตหลุด — ให้ลองใหม่รอบหน้าได้
      throw e;
    });
  return dbPromise;
}

type Place = { district: string; amphoe: string; province: string };

/** กรุงเทพฯ ใช้ แขวง/เขต · ต่างจังหวัดใช้ ต./อ./จ. (รูปแบบที่ ปณ. ใช้) */
function placeLine(p: Place, zip: string): string {
  return p.province === "กรุงเทพมหานคร"
    ? `แขวง${p.district} เขต${p.amphoe} กรุงเทพมหานคร ${zip}`
    : `ต.${p.district} อ.${p.amphoe} จ.${p.province} ${zip}`;
}

export default function PostcodeHelper({
  address,
  setAddress,
  inputCls,
}: {
  address: string;
  setAddress: (v: string) => void;
  inputCls: string;
}) {
  const [zip, setZip] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "notfound" | "error">("idle");
  /** บรรทัดที่เติมให้ครั้งล่าสุด — เลือกใหม่จะแทนที่บรรทัดนี้ */
  const lastLine = useRef<string | null>(null);

  async function lookup(code: string) {
    setPlaces(null);
    if (code.length !== 5) {
      setState("idle");
      return;
    }
    setState("loading");
    try {
      const db = await loadDb();
      const hit = (db.z[code] ?? []).map(([d, ai]) => ({
        district: d,
        amphoe: db.a[ai][0],
        province: db.p[db.a[ai][1]],
      }));
      setPlaces(hit);
      setState(hit.length ? "idle" : "notfound");
    } catch {
      setState("error");
    }
  }

  function pick(p: Place) {
    const line = placeLine(p, zip);
    const prev = lastLine.current;
    const base = address.replace(/\s+$/, "");
    const next =
      prev && base.includes(prev) ? base.replace(prev, line) : base ? `${base}\n${line}` : line;
    lastLine.current = line;
    setAddress(next);
  }

  const chosen = (p: Place) => address.includes(placeLine(p, zip));

  return (
    <div className="mt-2 rounded-2xl bg-sky-50/70 p-3 ring-1 ring-sky-100">
      <label htmlFor="ship-zip" className="block text-[12px] font-bold text-sky-900">
        📮 พิมพ์รหัสไปรษณีย์ — เลือกตำบลแล้วระบบเติมตำบล/อำเภอ/จังหวัดให้
      </label>
      <input
        id="ship-zip"
        value={zip}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 5);
          setZip(v);
          void lookup(v);
        }}
        inputMode="numeric"
        autoComplete="postal-code"
        placeholder="เช่น 10110"
        className={`${inputCls} mt-1.5 max-w-[11rem] tracking-widest`}
      />
      {state === "loading" && <p className="mt-1.5 text-[11px] text-sky-700">กำลังค้นหา…</p>}
      {state === "notfound" && (
        <p className="mt-1.5 text-[11px] font-medium text-amber-700">
          ไม่พบรหัสไปรษณีย์ {zip} — พิมพ์ตำบล/อำเภอ/จังหวัดในช่องที่อยู่ด้านบนเองได้เลย
        </p>
      )}
      {state === "error" && (
        <p className="mt-1.5 text-[11px] font-medium text-amber-700">
          ค้นหาไม่ได้ตอนนี้ — พิมพ์ตำบล/อำเภอ/จังหวัดในช่องที่อยู่ด้านบนเองได้เลย
        </p>
      )}
      {places && places.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="listbox" aria-label="เลือกตำบล">
          {places.map((p) => {
            const on = chosen(p);
            return (
              <button
                key={`${p.district}|${p.amphoe}`}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => pick(p)}
                className={`rounded-full px-3 py-1.5 text-left text-[12px] font-semibold ring-1 transition ${
                  on
                    ? "bg-sky-600 text-white ring-sky-600"
                    : "bg-white text-stone-700 ring-sky-200 hover:bg-sky-100"
                }`}
              >
                {on ? "✓ " : ""}
                {p.district} · {p.amphoe}
                <span className={on ? "text-sky-100" : "text-stone-400"}> · {p.province}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
