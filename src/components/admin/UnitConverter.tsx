"use client";

import { useMemo, useState } from "react";
import { CopyChip } from "@/components/admin/ui";

/**
 * 📐 แปลงหน่วยเป็นเซนติเมตร — ลูกค้าบอกขนาดมาเป็นนิ้ว/หลา/เมตร แอดมินต้องตอบเป็นซม. ทันที (เจ้าของร้านขอ 16 ก.ย. 69)
 * พิมพ์ตัวเลขเดียว หรือ "กว้างxสูง" (8.5x11 · 8.5 × 11 · 8.5*11) ได้ · เลือกหน่วยต้นทาง → ได้ซม. + มม. + นิ้ว
 */

const UNITS: { key: string; label: string; cm: number }[] = [
  { key: "in", label: "นิ้ว", cm: 2.54 },
  { key: "ft", label: "ฟุต", cm: 30.48 },
  { key: "yd", label: "หลา", cm: 91.44 },
  { key: "m", label: "เมตร", cm: 100 },
  { key: "mm", label: "มม.", cm: 0.1 },
  { key: "cm", label: "ซม.", cm: 1 },
];

/** "8.5x11" → [8.5, 11] · รับเศษส่วนแบบนิ้วด้วย "8 1/2" → 8.5 */
function parseNums(text: string): number[] {
  return text
    .split(/[x×*]/i)
    .map((part) => {
      const t = part.trim().replace(/,/g, "");
      const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t);
      if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
      const frac = /^(\d+)\/(\d+)$/.exec(t);
      if (frac) return Number(frac[1]) / Number(frac[2]);
      const n = Number(t);
      return Number.isFinite(n) && t !== "" ? n : NaN;
    })
    .filter((n) => Number.isFinite(n) && n >= 0);
}

const fmt = (n: number, d: number) => {
  const s = n.toFixed(d);
  return s.replace(/\.?0+$/, "");
};

export default function UnitConverter() {
  const [text, setText] = useState("");
  const [unit, setUnit] = useState("in");
  const u = UNITS.find((x) => x.key === unit) ?? UNITS[0];
  const nums = useMemo(() => parseNums(text), [text]);
  const cm = nums.map((n) => n * u.cm);
  const join = (arr: number[], d: number) => arr.map((n) => fmt(n, d)).join(" × ");
  const result = cm.length ? `${join(cm, 2)} ซม.` : "";
  const copyText = () => `${join(nums, 3)} ${u.label} = ${join(cm, 2)} ซม. (${join(cm.map((c) => c * 10), 1)} มม.)`;

  return (
    <div className="dkb-g flex flex-wrap items-center gap-2 p-3">
      <span className="dkb-h2 text-[0.95rem]">แปลงเป็นซม.</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        inputMode="decimal"
        placeholder="เช่น 8.5 หรือ 8.5x11"
        className="min-h-[40px] w-[160px] rounded-xl bg-white px-3 text-[15px] tabular-nums ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-[color:var(--dk-blue)]"
      />
      <select value={unit} onChange={(e) => setUnit(e.target.value)} className="min-h-[40px] rounded-xl bg-white px-2 text-[14px] ring-1 ring-slate-200">
        {UNITS.map((x) => (
          <option key={x.key} value={x.key}>
            {x.label}
          </option>
        ))}
      </select>
      {cm.length > 0 ? (
        <>
          <span className="tabular-nums">
            <b className="text-[1.15rem]">= {result}</b>{" "}
            <span className="text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
              {join(cm.map((c) => c * 10), 1)} มม.
              {unit !== "in" ? ` · ${join(cm.map((c) => c / 2.54), 2)} นิ้ว` : ""}
            </span>
          </span>
          <CopyChip label="คัดลอก" text={copyText} />
        </>
      ) : (
        <span className="text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
          พิมพ์ตัวเลขแล้วเลือกหน่วย · พิมพ์ กว้างxสูง ได้ · เศษส่วนนิ้ว "8 1/2" ก็ได้
        </span>
      )}
    </div>
  );
}
