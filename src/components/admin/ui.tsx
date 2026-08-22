"use client";

/**
 * ชุดเครื่องมือหน้าหลังบ้าน — ดีไซน์ "รางเบนโตะกระจก"
 *
 * ทุกหน้าที่แปลงมาใช้ดีไซน์นี้ประกอบจากชิ้นส่วนในไฟล์นี้ + คลาสใน dashboard.css
 * เขียนหน้าใหม่: import { PageShell, PageHead, ... } from "@/components/admin/ui"
 *
 * กติกาที่ชิ้นส่วนพวกนี้บังคับไว้ให้แล้ว (ไม่ต้องมานั่งจำทุกหน้า):
 *  · งานค้างเด่นกว่างานที่จบแล้ว — Row มี data-done ที่ทำให้แถวจางลง
 *  · แยกสถานะด้วยมากกว่าสี — Row มีแถบสีซ้ายสุดคู่กับป้าย
 *  · ทุกแถวกดได้ — Row เป็น <a> เมื่อส่ง href
 *  · ช่องว่างบอกว่าต้องทำอะไรต่อ — Empty บังคับให้ใส่คำอธิบาย
 *  · ตัวเลขอ่านจากระยะแขน — .dkb-num ใช้ Prompt + tabular
 *
 * ⚠️ ห้ามเขียน hex ตรง ๆ ในหน้าไหนก็ตาม — อ้าง var(--dk-*) เท่านั้น
 * ⚠️ ตัวเลขต้องใช้ Prompt ไม่ใช่ Mitr (เลข 0 ของ Mitr มีขีดทับ ฿0 อ่านเป็น ฿ø)
 */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import "./dashboard.css";

/** ครอบทั้งหน้า — พื้นเมชไล่สี + ดันขอบให้เต็มพื้นที่เนื้อหาของ AdminShell */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="dkb -mx-4 -my-6 min-h-[calc(100vh-1px)] px-4 py-6 md:-mx-8 md:-my-8 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1180px]">{children}</div>
    </div>
  );
}

/** หัวหน้า: หมวด → ชื่อหน้า → จำนวน → คำอธิบายสั้น ๆ · ปุ่มเครื่องมืออยู่ขวา */
export function PageHead({
  group,
  title,
  count,
  sub,
  live,
  tools,
}: {
  group: string;
  title: string;
  /** เช่น "38 ใบ" — ตัวเลขรวมของหน้านี้ */
  count?: string;
  sub?: ReactNode;
  /** แถบเล็กใต้ชื่อ เช่น "ออเดอร์จริง" (เขียว) หรือข้อความโหมดตัวอย่าง (เทา) */
  live?: { ok: boolean; text: string };
  tools?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 px-1">
      <div className="min-w-0">
        <p className="dkb-eyebrow" style={{ color: "var(--dk-faint)" }}>
          {group}
        </p>
        <h1 className="dkb-display mt-1 text-[1.6rem] leading-tight sm:text-[1.95rem]">
          {title}
          {count && (
            <span className="ml-2.5 text-[1.05rem] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>
              {count}
            </span>
          )}
        </h1>
        {sub && (
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
            {sub}
          </p>
        )}
        {live && (
          <p className="mt-0.5 text-[13px]">
            {live.ok ? (
              <span className="inline-flex items-center gap-1.5" style={{ color: "var(--dk-mint-ink)" }}>
                <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: "var(--dk-mint)" }} />
                {live.text}
              </span>
            ) : (
              <span style={{ color: "var(--dk-faint)" }}>{live.text}</span>
            )}
          </p>
        )}
      </div>
      {tools && <div className="flex flex-1 flex-wrap items-center gap-2.5 sm:justify-end">{tools}</div>}
    </div>
  );
}

/** ช่องค้นหาทรงแคปซูล — ทุกหน้าที่มีรายการควรมี */
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="dkb-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

type BtnTone = "navy" | "yolk" | "ghost";
const BTN: Record<BtnTone, string> = { navy: "dkb-btn-navy", yolk: "dkb-btn-yolk", ghost: "dkb-btn-ghost" };

/** ปุ่ม — navy = action หลัก · yolk = สร้างของใหม่ · ghost = รอง */
export function Btn({
  tone = "ghost",
  href,
  onClick,
  disabled,
  small,
  title,
  children,
}: {
  tone?: BtnTone;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
  title?: string;
  children: ReactNode;
}) {
  const cls = `dkb-btn ${BTN[tone]}${small ? " dkb-btn-sm" : ""}`;
  if (href) {
    return (
      <Link href={href} className={cls} title={title}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls} title={title}>
      {children}
    </button>
  );
}

/** แถบประกาศสีเต็มใบ — บอก "ต้องทำอะไรต่อ" หรือ "อะไรถูกล็อกอยู่" */
export function Banner({ tone, title, detail, href }: { tone: "hot" | "warm"; title: string; detail?: string; href?: string }) {
  const inner = (
    <>
      <b>{title}</b>
      {detail && <span>{detail}</span>}
    </>
  );
  const cls = `dkb-g dkb-banner dkb-banner-${tone}`;
  return href ? (
    <Link href={href} className={`block ${cls}`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/* ── การ์ดสรุปแบบเบนโตะ ───────────────────────────────── */

export function Stats({ children, cols }: { children: ReactNode; cols?: 4 | 5 }) {
  return (
    <div className="dkb-stats mt-4" data-cols={cols === 4 ? "4" : undefined}>
      {children}
    </div>
  );
}

/** กล่องเด่นสุดของหน้า — ตัวเลขในวงแหวนสัดส่วน · ใช้กล่องนี้ได้กล่องเดียวต่อหน้า */
export function HeroStat({
  n,
  label,
  detail,
  pct,
  href,
}: {
  n: ReactNode;
  label: string;
  detail: string;
  /** สัดส่วนของวงแหวน 0–100 */
  pct: number;
  href?: string;
}) {
  const inner = (
    <>
      <span className="dkb-ring-sm">
        <i>
          <span className="dkb-num text-[1.55rem]">{n}</span>
        </i>
      </span>
      <span className="min-w-0">
        <span className="dkb-h2 block text-[1.02rem]">{label}</span>
        <span className="block text-[0.75rem]" style={{ color: "var(--dk-yolk-ink)" }}>
          {detail}
        </span>
      </span>
    </>
  );
  const style = { ["--dk-pct" as string]: `${Math.max(0, Math.min(100, pct))}%` } as CSSProperties;
  return href ? (
    <Link href={href} className="dkb-g dkb-stat dkb-stat-hero" style={style}>
      {inner}
    </Link>
  ) : (
    <div className="dkb-g dkb-stat dkb-stat-hero" style={style}>
      {inner}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  onClick,
  active,
  wide,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  /** due = โทนคอรัล ใช้กับตัวเลขที่ต้องตามเก็บ */
  tone?: "due";
  onClick?: () => void;
  active?: boolean;
  /** กินเต็มแถวบนจอแคบ */
  wide?: boolean;
}) {
  const cls = `dkb-g dkb-stat${tone === "due" ? " dkb-stat-due" : ""}${wide ? " dkb-stat-money" : ""}`;
  const inner = (
    <>
      <span className="dkb-stat-lb">{label}</span>
      <span className="dkb-num dkb-stat-v" style={tone === "due" ? { color: "var(--dk-coral-ink)" } : undefined}>
        {value}
      </span>
      {hint && <span className="dkb-stat-hint">{hint}</span>}
    </>
  );
  if (!onClick) return <div className={cls}>{inner}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={active} data-on={active ? "1" : undefined} className={cls}>
      {inner}
    </button>
  );
}

/* ── ตัวกรอง ──────────────────────────────────────────── */

export function FilterCard({ children }: { children: ReactNode }) {
  return <div className="dkb-g mt-4 px-3 py-3">{children}</div>;
}

export function TabRow({ children, divider }: { children: ReactNode; divider?: boolean }) {
  return (
    <div
      className={`dkb-scroll${divider ? " mt-2.5 border-t pt-2.5" : ""}`}
      style={divider ? { borderColor: "var(--dk-hair)" } : undefined}
    >
      {children}
    </div>
  );
}

export function Tab({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="dkb-tab">
      {label} {count !== undefined && <b>{count}</b>}
    </button>
  );
}

export function FChip({
  on,
  onClick,
  label,
  count,
  style,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  /** สีพื้น/ตัวอักษรตอนยังไม่ถูกเลือก (เช่นสีประจำสถานะ) */
  style?: CSSProperties;
}) {
  const zero = count === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      data-zero={zero ? "1" : undefined}
      className="dkb-fchip"
      style={on || zero ? undefined : style}
    >
      <i />
      {label} {count !== undefined && <b>{count}</b>}
    </button>
  );
}

/* ── รายการ ───────────────────────────────────────────── */

export function ListHead({ title, note }: { title: string; note?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-2 pb-2 pt-5">
      <h2 className="dkb-h2 text-[1.06rem]">{title}</h2>
      {note && (
        <span className="text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
          {note}
        </span>
      )}
    </div>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <div className="dkb-rows">{children}</div>;
}

/**
 * แถวรายการ — แถบสีซ้ายสุดบอกสถานะ · กดได้ทั้งแถวเมื่อส่ง href
 * ช่องลูก: <RowMain> (ซ้าย) · <RowProgress> (กลางบนจอกว้าง) · <RowSide> (ขวา)
 */
export function Row({
  tone,
  done,
  href,
  onClick,
  children,
}: {
  /** สี token เช่น "var(--dk-coral-deep)" */
  tone: string;
  /** งานจบแล้ว — แถวจะจางลงให้เอง */
  done?: boolean;
  href?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const style = { ["--dk-tone" as string]: tone } as CSSProperties;
  const cls = "dkb-g dkb-lrow";
  if (href) {
    return (
      <Link href={href} className={cls} data-done={done ? "1" : undefined} style={style}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} data-done={done ? "1" : undefined} style={style}>
        {children}
      </button>
    );
  }
  return (
    <div className={cls} data-done={done ? "1" : undefined} style={style}>
      {children}
    </div>
  );
}

/**
 * ช่องซ้ายของแถว: ชื่อ (+ป้าย) บรรทัดบน · รายละเอียดบรรทัดล่าง
 *
 * ⚠️ ถ้าแถวมีปุ่มอยู่ข้างใน ห้ามส่ง href ให้ <Row> (จะกลายเป็น <a> ซ้อน <a> ซึ่งผิด HTML)
 *    ให้ส่ง href มาที่นี่แทน — ชื่อจะกลายเป็นลิงก์ ส่วนปุ่มยังกดแยกได้
 */
export function RowMain({ name, href, tags, meta }: { name: ReactNode; href?: string; tags?: ReactNode; meta?: ReactNode }) {
  return (
    <span className="dkb-main">
      <span className="dkb-who">
        {href ? (
          <Link href={href} className="nm underline-offset-4 hover:underline">
            {name}
          </Link>
        ) : (
          <span className="nm">{name}</span>
        )}
        {tags}
      </span>
      {meta && <span className="dkb-meta">{meta}</span>}
    </span>
  );
}

export function RowSide({ children }: { children: ReactNode }) {
  return <span className="dkb-side">{children}</span>;
}

/** ป้ายเล็กในแถว — ใช้ข้อความ ไม่ใช้อีโมจิ จะได้อ่านออกโดยไม่ต้องเดา */
export function Tag({
  tone,
  children,
  title,
}: {
  tone: "yolk" | "coral" | "mint" | "lilac" | "sky" | "solid" | "quiet";
  children: ReactNode;
  title?: string;
}) {
  const S: Record<string, CSSProperties> = {
    yolk: { background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" },
    coral: { background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" },
    mint: { background: "var(--dk-mint-wash)", color: "var(--dk-mint-ink)" },
    lilac: { background: "var(--dk-lilac-wash)", color: "var(--dk-lilac-ink)" },
    sky: { background: "var(--dk-sky)", color: "var(--dk-blue-deep)" },
    solid: { background: "var(--dk-coral-deep)", color: "#fff" },
    quiet: { background: "transparent", color: "var(--dk-faint)" },
  };
  return (
    <span className="dkb-tag" style={S[tone]} title={title}>
      <i />
      {children}
    </span>
  );
}

/** ช่องว่าง — ต้องบอกว่าต้องทำอะไรต่อเสมอ */
export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="dkb-g dkb-empty">
      <b>{title}</b>
      <span>{body}</span>
    </div>
  );
}

/* ── ฟอร์ม ────────────────────────────────────────────── */

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  rows,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  rows?: number;
}) {
  return (
    <label className="dkb-g dkb-field">
      <span className="lb">{label}</span>
      {rows ? (
        <textarea rows={rows} value={value} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} />
      )}
    </label>
  );
}

export function Switch({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={on} className="dkb-g dkb-switch">
      <span className="tx">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className="dkb-sw" data-off={on ? undefined : "1"} />
    </button>
  );
}

export function KV({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="dkb-kv">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
}

/* ── แท็บแนวตั้ง (หน้าที่มีหลายหมวดตั้งค่า) ─────────────── */

export function VTabs({ items, active, onPick }: { items: { key: string; label: string }[]; active: string; onPick: (k: string) => void }) {
  return (
    <div className="dkb-g dkb-vtabs">
      {items.map((t) => (
        <button key={t.key} type="button" onClick={() => onPick(t.key)} aria-pressed={t.key === active} className="dkb-vtab">
          {t.label}
        </button>
      ))}
    </div>
  );
}
