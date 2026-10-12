"use client";

/** ชิ้นส่วนหน้าตาที่ใช้ร่วมกันในหน้า /admin/diecut (แท็บเส้นไดคัท + แท็บตัดภาพ) */

/** เลขขั้นตอนในวงกลม */
export function StepNo({ n }: { n: number }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-bold text-white" style={{ background: "var(--dk-navy)" }}>
      {n}
    </span>
  );
}

/** การ์ดขั้นตอน — หัวเลข + ชื่อ */
export function Step({ n, title, note, children }: { n: number; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="dkb-g p-4">
      <div className="flex items-center gap-2.5">
        <StepNo n={n} />
        <h2 className="dkb-h2 text-[1.08rem]" style={{ color: "var(--dk-navy)" }}>{title}</h2>
        {note && <span className="ml-auto text-[12px]" style={{ color: "var(--dk-faint)" }}>{note}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** ปุ่มตัวเลือก (เลือกได้ทีละอัน) */
export function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-[40px] rounded-xl px-3 text-[12.5px] font-semibold transition ${
        on ? "bg-[color:var(--dk-navy)] text-white" : "bg-white/70 text-[color:var(--dk-navy-soft)] ring-1 ring-[color:var(--dk-hair)] hover:bg-white"
      }`}
    >
      {children}
    </button>
  );
}

export function Slider({
  label,
  hint,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-[12px] font-semibold tabular-nums" style={{ color: "var(--dk-navy-soft)" }}>
      {label}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-6 w-full" style={{ accentColor: "var(--dk-blue-deep)" }} />
      <span className="block text-[11.5px] font-normal" style={{ color: "var(--dk-faint)" }}>{hint}</span>
    </label>
  );
}

/** ส่วนพับเก็บ — ของที่นาน ๆ แตะที */
export function More({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group mt-4 rounded-xl" style={{ boxShadow: "inset 0 0 0 1px var(--dk-hair)" }}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3 text-[12.5px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>
        <span className="transition group-open:rotate-90">▸</span>
        {title}
      </summary>
      <div className="space-y-3 px-3 pb-3">{children}</div>
    </details>
  );
}
