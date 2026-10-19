"use client";
/**
 * 🧾 วาดข้อความ Flex ของ LINE (bubble / carousel) จาก JSON ตัวเดียวกับที่ส่งให้ลูกค้า (log.payload)
 *   เจ้าของร้าน 19 ต.ค. 69 "ช่วยทำให้ 2 ระบบนี้แสดงผลเหมือนกัน" — เดิมหน้าแชทวาดการ์ดย่อ (รูป · ชื่อ · ปุ่ม) จาก cards[]
 *   แต่ลูกค้าใน LINE เห็นการ์ดตารางราคาเต็ม (เรท · แบบ · ราคารวม) → แอดมินไม่รู้ว่าบอทบอกราคาอะไรไป
 *   รองรับเฉพาะชิ้นที่บอทใช้จริง: box · text (+span) · separator · button · image · icon · filler · spacer
 *   สี/ขนาดมาจาก JSON ของ LINE ตรง ๆ (ให้หน้าตาเหมือนในแอป LINE) — ค่าเริ่มต้นตามเอกสาร Flex Message
 */
import type { CSSProperties, ReactNode } from "react";

type Fx = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const arr = (v: unknown): Fx[] => (Array.isArray(v) ? v.filter((x): x is Fx => !!x && typeof x === "object") : []);

const TEXT_PX: Record<string, number> = { xxs: 11, xs: 13, sm: 14, md: 16, lg: 19, xl: 22, xxl: 29, "3xl": 35, "4xl": 48, "5xl": 74 };
const GAP_PX: Record<string, number> = { none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20 };
const IMG_PX: Record<string, number> = { xxs: 40, xs: 60, sm: 80, md: 100, lg: 120, xl: 140, xxl: 160, "3xl": 180, "4xl": 200, "5xl": 220 };
const BUBBLE_PX: Record<string, number> = { nano: 120, micro: 160, deca: 220, hecto: 241, kilo: 260, mega: 300, giga: 386 };

/** "md" / "12px" → px */
const len = (v: unknown, table = GAP_PX): number | string | undefined => {
  const s = str(v);
  if (!s) return undefined;
  if (s in table) return table[s];
  return /^\d+(\.\d+)?(px|%)$/.test(s) ? s : undefined;
};

function boxPadding(b: Fx): CSSProperties {
  const all = len(b.paddingAll);
  return {
    paddingTop: len(b.paddingTop) ?? all,
    paddingBottom: len(b.paddingBottom) ?? all,
    paddingLeft: len(b.paddingStart) ?? all,
    paddingRight: len(b.paddingEnd) ?? all,
  };
}

type Parent = "vertical" | "horizontal" | "baseline";
type Ctx = { onZoom?: (url: string) => void };

/** flex ของลูกในกล่องแนวนอน (ค่าเริ่ม 1) / แนวตั้ง (ค่าเริ่ม 0) + margin จาก parent */
function itemStyle(c: Fx, parent: Parent, first: boolean): CSSProperties {
  const horiz = parent !== "vertical";
  const f = num(c.flex) ?? (horiz ? 1 : 0);
  const m = first ? undefined : len(c.margin);
  return {
    flex: horiz ? (f === 0 ? "0 0 auto" : `${f} 1 0%`) : f === 0 ? "0 0 auto" : `${f} 1 auto`,
    minWidth: 0,
    ...(m !== undefined ? (horiz ? { marginLeft: m } : { marginTop: m }) : {}),
    ...(str(c.gravity) ? { alignSelf: c.gravity === "center" ? "center" : c.gravity === "bottom" ? "flex-end" : "flex-start" } : {}),
  };
}

function Comp({ c, parent, first, ctx }: { c: Fx; parent: Parent; first: boolean; ctx: Ctx }): ReactNode {
  const base = itemStyle(c, parent, first);
  switch (c.type) {
    case "box": {
      const layout = (str(c.layout) ?? "vertical") as Parent;
      const kids = arr(c.contents);
      const style: CSSProperties = {
        ...base,
        display: "flex",
        flexDirection: layout === "vertical" ? "column" : "row",
        alignItems: layout === "baseline" ? "baseline" : layout === "horizontal" ? "stretch" : undefined,
        gap: len(c.spacing),
        background: str(c.backgroundColor),
        borderRadius: len(c.cornerRadius, { none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20 }),
        border: str(c.borderColor) ? `${len(c.borderWidth, { none: 0, light: 0.5, normal: 1, medium: 2, "semi-bold": 3, bold: 4 }) ?? 1}px solid ${str(c.borderColor)}` : undefined,
        width: str(c.width),
        height: str(c.height),
        justifyContent: str(c.justifyContent),
        ...boxPadding(c),
      };
      const inner = kids.map((k, i) => <Comp key={i} c={k} parent={layout} first={i === 0} ctx={ctx} />);
      const uri = linkOf(c.action);
      return uri ? (
        <a href={uri} target="_blank" rel="noreferrer" style={{ ...style, color: "inherit", textDecoration: "none" }}>
          {inner}
        </a>
      ) : (
        <div style={style}>{inner}</div>
      );
    }
    case "text": {
      const spans = arr(c.contents).filter((s) => s.type === "span");
      const wrap = c.wrap === true;
      const maxLines = num(c.maxLines);
      const style: CSSProperties = {
        ...base,
        fontSize: TEXT_PX[str(c.size) ?? "md"] ?? 16,
        lineHeight: str(c.lineSpacing) ? undefined : 1.4,
        fontWeight: c.weight === "bold" ? 700 : 400,
        color: str(c.color) ?? "#111111",
        textAlign: c.align === "end" ? "right" : c.align === "center" ? "center" : "left",
        fontStyle: c.style === "italic" ? "italic" : undefined,
        textDecoration: c.decoration === "line-through" ? "line-through" : c.decoration === "underline" ? "underline" : undefined,
        whiteSpace: wrap ? "pre-wrap" : "nowrap",
        overflow: "hidden",
        textOverflow: wrap ? undefined : "ellipsis",
        wordBreak: wrap ? "break-word" : undefined,
        ...(wrap && maxLines ? { display: "-webkit-box", WebkitLineClamp: maxLines, WebkitBoxOrient: "vertical" as const } : {}),
      };
      return (
        <p style={style}>
          {spans.length
            ? spans.map((s, i) => (
                <span key={i} style={{ color: str(s.color), fontWeight: s.weight === "bold" ? 700 : undefined, fontSize: str(s.size) ? TEXT_PX[str(s.size) as string] : undefined, textDecoration: s.decoration === "line-through" ? "line-through" : undefined }}>
                  {str(s.text) ?? ""}
                </span>
              ))
            : str(c.text) ?? ""}
        </p>
      );
    }
    case "separator":
      return <div style={{ ...base, flex: "0 0 auto", ...(parent === "vertical" ? { borderTop: `1px solid ${str(c.color) ?? "#D4D6DA"}` } : { borderLeft: `1px solid ${str(c.color) ?? "#D4D6DA"}`, alignSelf: "stretch" }) }} />;
    case "filler":
    case "spacer":
      return <div style={{ ...base, flex: c.type === "filler" ? `${num(c.flex) ?? 1} 1 0%` : "0 0 auto", minHeight: c.type === "spacer" ? len(c.size) : undefined }} />;
    case "button": {
      const st = str(c.style) ?? "link";
      const label = str((c.action as Fx | undefined)?.label) ?? "";
      const uri = linkOf(c.action);
      const style: CSSProperties = {
        ...base,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: c.height === "sm" ? 40 : 52,
        borderRadius: 8,
        padding: "0 12px",
        fontSize: c.height === "sm" ? 14 : 16,
        fontWeight: st === "link" ? 400 : 700,
        textAlign: "center",
        textDecoration: "none",
        background: st === "primary" ? str(c.color) ?? "#17C950" : st === "secondary" ? str(c.color) ?? "#DCDFE5" : "transparent",
        color: st === "primary" ? "#FFFFFF" : st === "secondary" ? "#111111" : str(c.color) ?? "#42659A",
      };
      return uri ? (
        <a href={uri} target="_blank" rel="noreferrer" style={style}>
          {label}
        </a>
      ) : (
        <span style={style}>{label}</span>
      );
    }
    case "image":
    case "icon": {
      const url = str(c.url);
      if (!url) return null;
      const [w, h] = (str(c.aspectRatio) ?? (c.type === "icon" ? "1:1" : "1:1")).split(":").map(Number);
      const size = str(c.size) ?? (c.type === "icon" ? "md" : "md");
      const full = size === "full";
      const px = c.type === "icon" ? TEXT_PX[size] ?? 16 : IMG_PX[size] ?? (/^\d+px$/.test(size) ? parseInt(size, 10) : 100);
      const img = (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" style={{ display: "block", width: full ? "100%" : px, maxWidth: "100%", aspectRatio: w && h ? `${w} / ${h}` : undefined, objectFit: c.aspectMode === "fit" ? "contain" : "cover", background: str(c.backgroundColor) }} />
      );
      const wrapStyle: CSSProperties = { ...base, display: "flex", justifyContent: c.align === "start" ? "flex-start" : c.align === "end" ? "flex-end" : "center" };
      return ctx.onZoom && c.type === "image" ? (
        <button type="button" onClick={() => ctx.onZoom?.(url)} title="กดเพื่อดูรูปใหญ่" style={{ ...wrapStyle, padding: 0, border: 0, background: "none", cursor: "zoom-in" }}>
          {img}
        </button>
      ) : (
        <div style={wrapStyle}>{img}</div>
      );
    }
    default:
      return null;
  }
}

function linkOf(a: unknown): string | undefined {
  const x = a && typeof a === "object" ? (a as Fx) : null;
  const uri = x && x.type === "uri" ? str(x.uri) : undefined;
  return uri && /^https?:\/\//.test(uri) ? uri : undefined;
}

function Section({ c, bg, pad, ctx }: { c: unknown; bg?: string; pad: string; ctx: Ctx }) {
  const x = c && typeof c === "object" ? (c as Fx) : null;
  if (!x) return null;
  // ส่วน hero/header/body/footer เป็น box หรือ image ก็ได้ · box ไม่กำหนด padding = ค่าเริ่มของ LINE
  const hasPad = ["paddingAll", "paddingTop", "paddingBottom", "paddingStart", "paddingEnd"].some((k) => k in x);
  return (
    <div style={{ background: bg ?? (str(x.backgroundColor) && x.type !== "box" ? str(x.backgroundColor) : undefined), padding: x.type === "box" && !hasPad ? pad : undefined }}>
      <Comp c={x} parent="vertical" first ctx={ctx} />
    </div>
  );
}

function Bubble({ b, ctx }: { b: Fx; ctx: Ctx }) {
  const styles = (b.styles && typeof b.styles === "object" ? b.styles : {}) as Record<string, Fx | undefined>;
  const width = BUBBLE_PX[str(b.size) ?? "mega"] ?? 300;
  return (
    <div className="shrink-0 overflow-hidden rounded-[17px] bg-white text-left shadow-sm" style={{ width, maxWidth: "100%", border: "1px solid rgba(0,0,0,.06)", scrollSnapAlign: "start" }}>
      <Section c={b.header} bg={str(styles.header?.backgroundColor)} pad="20px" ctx={ctx} />
      <Section c={b.hero} bg={str(styles.hero?.backgroundColor)} pad="0" ctx={ctx} />
      <Section c={b.body} bg={str(styles.body?.backgroundColor)} pad="20px" ctx={ctx} />
      <Section c={b.footer} bg={str(styles.footer?.backgroundColor)} pad="10px" ctx={ctx} />
    </div>
  );
}

/** contents ของข้อความ flex (bubble หรือ carousel) — หลายข้อความเรียงลงล่าง เหมือนใน LINE */
export default function FlexView({ items, onZoom }: { items: unknown[]; onZoom?: (url: string) => void }) {
  const ctx: Ctx = { onZoom };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {items.map((it, i) => {
        const x = it && typeof it === "object" ? (it as Fx) : null;
        if (!x) return null;
        if (x.type === "carousel") {
          return (
            <div key={i} className="flex max-w-full gap-2 overflow-x-auto pb-1" style={{ scrollSnapType: "x mandatory" }}>
              {arr(x.contents).map((b, k) => (
                <Bubble key={k} b={b} ctx={ctx} />
              ))}
            </div>
          );
        }
        return x.type === "bubble" ? <Bubble key={i} b={x} ctx={ctx} /> : null;
      })}
    </div>
  );
}
