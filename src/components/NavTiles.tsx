"use client";

import Link from "next/link";
import { useState } from "react";
import type { NavTile, TileSize } from "@/lib/home-nav";

/**
 * การ์ดนำทางหน้าแรก — วางแบบเดียวกับแบนเนอร์เว็บหลักของร้าน
 *
 *   ╭────────────────────────────────╮  ← แถบสีมุมบนโค้ง
 *   │ ┌────────┐ ┌────────────────┐ │
 *   │ │        │ │  กว้าง (บนขวา)  │ │
 *   │ │  ใหญ่   │ ├────┬────┬────┤ │
 *   │ │        │ │เล็ก│เล็ก│เล็ก│ │  ← เล็กชิดขอบล่างเสมอกับใหญ่
 *   │ └────────┘ └────┴────┴────┘ │
 *   ╰◡◡◡◡◡◡◡◡◡◡◡◡◡◡◡◡◡◡◡◡◡◡╯  ← ขอบหยักคลื่น
 *
 * สัดส่วนซ้าย 36% / ขวา 64% อิงงานออกแบบต้นฉบับ — ใช้ไฟล์ชุดเดิมแล้วความสูงสองฝั่งจะพอดีกัน
 * การ์ดที่ใส่รูปงานออกแบบ = แสดงรูปตามสัดส่วนจริง (ไม่ครอบ ไม่ยืด) เพราะกรอบ/ตัวหนังสืออยู่ในภาพแล้ว
 *
 * ⚠️ คลาส Tailwind ต้องเขียนเป็นข้อความเต็ม ๆ (ต่อสตริงเองแล้ว build จะไม่เห็น)
 */

const TITLE: Record<TileSize, string> = {
  big: "text-2xl md:text-3xl",
  wide: "text-xl md:text-2xl",
  small: "text-base md:text-lg",
};
const EMOJI: Record<TileSize, string> = {
  big: "text-5xl md:text-6xl",
  wide: "text-4xl md:text-5xl",
  small: "text-3xl md:text-4xl",
};
/** ความสูงขั้นต่ำ — เฉพาะการ์ดที่ไม่ได้ใส่รูป (กันการ์ดแบน) */
const MIN_H: Record<TileSize, string> = {
  big: "min-h-56 md:min-h-72",
  wide: "min-h-24 md:min-h-32",
  small: "min-h-24 md:min-h-32",
};

function TileFace({ t }: { t: NavTile }) {
  if (t.image) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={t.image}
          alt={`${t.title} ${t.subtitle}`.trim()}
          className="block w-full transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <span className="sr-only">
          {t.title} {t.subtitle}
        </span>
      </>
    );
  }

  return (
    <div className="relative flex h-full flex-col justify-between p-4 md:p-5">
      <span className={`${EMOJI[t.size]} leading-none transition-transform duration-300 group-hover:scale-110`}>
        {t.emoji}
      </span>
      <span>
        <span className={`block font-extrabold leading-tight text-stone-800 ${TITLE[t.size]}`}>{t.title}</span>
        {t.subtitle && <span className="mt-0.5 block text-xs font-semibold text-stone-600 md:text-sm">{t.subtitle}</span>}
      </span>
    </div>
  );
}

function Tile({ t, preview, extra = "" }: { t: NavTile; preview: boolean; extra?: string }) {
  const cls = t.image
    ? `group block overflow-hidden transition hover:-translate-y-0.5 ${extra}`
    : `group relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br ${t.gradient} ${MIN_H[t.size]} shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg ${extra}`;
  // หน้าตัวอย่างในหลังบ้าน — กดแล้วต้องไม่หลุดออกจากหน้าแก้ไข
  return preview ? (
    <div className={cls}>
      <TileFace t={t} />
    </div>
  ) : (
    <Link href={t.href} className={cls}>
      <TileFace t={t} />
    </Link>
  );
}

/**
 * แถวการ์ดเล็กแบบรูปล้วน — ทุกใบใช้ "สเกลเดียวกัน" แบบงานต้นฉบับ
 * ความกว้างแบ่งตามขนาดจริงของไฟล์ (ใบไหนต้นฉบับกว้างกว่าก็ได้พื้นที่กว้างกว่า)
 * สูงไม่เท่ากันได้ แต่ชิดขอบล่างเสมอกัน — ตำแหน่ง/สัดส่วนจึงตรงกับงานออกแบบเป๊ะ
 */
function SmallImgRow({ tiles, preview }: { tiles: NavTile[]; preview: boolean }) {
  const [ratios, setRatios] = useState<Record<string, number>>({});
  return (
    <div className="flex items-end gap-2.5 md:gap-3">
      {tiles.map((t) => {
        // เก็บความกว้างจริงเมื่อรู้ขนาด — เช็คทั้งตอน mount (รูปมาจากแคช onLoad ไม่ยิง) และตอนโหลดเสร็จ
        const readRatio = (im: HTMLImageElement | null) => {
          if (!im || !im.complete || im.naturalHeight === 0) return;
          const ar = im.naturalWidth; // สเกลเท่ากันทุกใบ → กว้างตามขนาดไฟล์จริง
          setRatios((m) => (Math.abs((m[t.id] ?? 0) - ar) < 0.001 ? m : { ...m, [t.id]: ar }));
        };
        const inner = (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={t.image}
              alt={`${t.title} ${t.subtitle}`.trim()}
              ref={readRatio}
              onLoad={(e) => readRatio(e.currentTarget)}
              className="block w-full transition-transform duration-300 group-hover:scale-[1.03]"
            />
            <span className="sr-only">
              {t.title} {t.subtitle}
            </span>
          </>
        );
        const style = { flexGrow: ratios[t.id] ?? 700, flexBasis: 0, minWidth: 0 };
        return preview ? (
          <div key={t.id} style={style} className="group overflow-hidden transition hover:-translate-y-0.5">
            {inner}
          </div>
        ) : (
          <Link key={t.id} href={t.href} style={style} className="group overflow-hidden transition hover:-translate-y-0.5">
            {inner}
          </Link>
        );
      })}
    </div>
  );
}

/** จับ "เล็ก" ที่อยู่ติดกันมัดเป็นแถวละ 3 — ที่เหลือ (กว้าง) กินเต็มแถว */
function chunkRest(rest: NavTile[]): NavTile[][] {
  const out: NavTile[][] = [];
  for (const t of rest) {
    const last = out[out.length - 1];
    if (t.size === "small" && last && last[0].size === "small" && last.length < 3) last.push(t);
    else out.push([t]);
  }
  return out;
}

export default function NavTiles({
  tiles,
  preview = false,
  bg = "",
  wave = false,
}: {
  tiles: NavTile[];
  preview?: boolean;
  /** สีพื้นหลังแถบ (เว้นว่าง = ไม่มีแถบสี) */
  bg?: string;
  /** ขอบหยักคลื่นด้านล่างแถบ */
  wave?: boolean;
}) {
  if (!tiles.length) return null;

  const bigs = tiles.filter((t) => t.size === "big");
  const rest = tiles.filter((t) => t.size !== "big");
  const rows = chunkRest(rest);

  const grid = (
    <div className={bigs.length && rest.length ? "grid gap-3 md:grid-cols-[36%_1fr] md:gap-4" : "grid gap-3 md:gap-4"}>
      {bigs.length > 0 && (
        <div className="flex flex-col gap-3 md:gap-4">
          {bigs.map((t) => (
            <Tile key={t.id} t={t} preview={preview} />
          ))}
        </div>
      )}
      {rest.length > 0 && (
        // justify-between: แถบกว้างชิดบน · แถวเล็กชิดล่าง
        // pb 3.1% = ยกแถวเล็กให้เสมอ "ขอบขาวล่าง" ของการ์ดใหญ่ (ไฟล์ how-to มีสติกเกอร์ยื่นใต้การ์ด 5.6% ของสูงภาพ)
        <div className="flex flex-col justify-between gap-3 md:gap-4 md:pb-[3.1%]">
          {rows.map((row, ri) =>
            row[0].size === "small" ? (
              row.every((t) => t.image) ? (
                <SmallImgRow key={ri} tiles={row} preview={preview} />
              ) : (
                <div key={ri} className="grid grid-cols-3 gap-3 md:gap-4">
                  {row.map((t) => (
                    <Tile key={t.id} t={t} preview={preview} />
                  ))}
                </div>
              )
            ) : (
              // แถบกว้างแบบรูป: ไฟล์งานมีที่ว่างโปร่งใสด้านบนเผื่อสติกเกอร์ยื่น (~11.6% ของสูง)
              // ดันขึ้นให้ "แถบขาว" เสมอกับขอบบนการ์ดใหญ่ แบบเดียวกับ fix-position-img ของเว็บต้นฉบับ
              <Tile key={row[0].id} t={row[0]} preview={preview} extra={row[0].image ? "md:-mt-[3.2%]" : ""} />
            )
          )}
        </div>
      )}
    </div>
  );

  if (!bg) return grid;

  return (
    <div>
      {/* แถบสีมุมบนโค้ง อยู่ในความกว้างหน้าเหมือนแบนเนอร์ต้นฉบับ (ไม่กินเต็มจอ) */}
      <div className="rounded-t-[2rem] px-4 pb-6 pt-5 md:px-8 md:pb-8 md:pt-7" style={{ backgroundColor: bg }}>
        {grid}
      </div>
      {wave && (
        // ขอบหยักคลื่น — ครึ่งวงกลมเรียงกัน ยืดตามความกว้างเอง
        <div
          className="h-4 w-full md:h-5"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 0, ${bg} 0 50%, transparent 51%)`,
            backgroundSize: "2rem 100%",
            backgroundRepeat: "repeat-x",
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
