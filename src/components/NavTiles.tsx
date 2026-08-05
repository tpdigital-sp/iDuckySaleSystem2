"use client";

import Link from "next/link";
import type { NavTile, TileSize } from "@/lib/home-nav";

/**
 * การ์ดนำทางหน้าแรก — วางแบบเดียวกับหน้าเว็บหลักของร้าน
 *
 *   ┌──────────┬────────────────────┐
 *   │          │   กว้าง (span 3)    │
 *   │  ใหญ่     ├──────┬──────┬──────┤
 *   │ (span 2) │ เล็ก │ เล็ก │ เล็ก │
 *   └──────────┴──────┴──────┴──────┘
 *
 * การ์ดที่ใส่รูปงานออกแบบไว้ = แสดงรูปตามสัดส่วนจริงของไฟล์ (ไม่ครอบ ไม่ยืด)
 * เพราะรูปพวกนี้มีกรอบ/ตัวหนังสือมาในภาพอยู่แล้ว
 *
 * ⚠️ คลาส Tailwind ต้องเขียนเป็นข้อความเต็ม ๆ (ต่อสตริงเองแล้ว build จะไม่เห็น)
 */

const SPAN: Record<TileSize, string> = {
  big: "col-span-2 row-span-2 md:col-span-2",
  wide: "col-span-2 md:col-span-3",
  small: "col-span-1",
};

/** ความสูงขั้นต่ำ — ใช้เฉพาะการ์ดที่ไม่ได้ใส่รูป (ไม่งั้นการ์ดจะแบน) */
const MIN_H: Record<TileSize, string> = {
  big: "min-h-56 md:min-h-72",
  wide: "min-h-28 md:min-h-32",
  small: "min-h-28 md:min-h-32",
};

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

  const grid = (
    <div className="grid grid-cols-2 items-start gap-3 md:grid-cols-5 md:gap-4">
      {tiles.map((t) => {
        // การ์ดที่มีรูปงานออกแบบ: ปล่อยรูปล้วน ๆ ไม่ใส่กรอบ/สีพื้น (รูปมีกรอบมาเองแล้ว)
        const cls = t.image
          ? `group block overflow-hidden ${SPAN[t.size]} transition hover:-translate-y-0.5`
          : `group relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br ${t.gradient} ${SPAN[t.size]} ${MIN_H[t.size]} shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg`;

        // หน้าตัวอย่างในหลังบ้าน — กดแล้วต้องไม่หลุดออกจากหน้าแก้ไข
        return preview ? (
          <div key={t.id} className={cls}>
            <TileFace t={t} />
          </div>
        ) : (
          <Link key={t.id} href={t.href} className={cls}>
            <TileFace t={t} />
          </Link>
        );
      })}
    </div>
  );

  if (!bg) return grid;

  return (
    <div>
      <div className="px-4 py-6 md:py-8" style={{ backgroundColor: bg }}>
        <div className="mx-auto max-w-6xl">{grid}</div>
      </div>
      {wave && (
        // ขอบหยักคลื่น — วาดด้วย CSS ครึ่งวงกลมเรียงกัน (ยืดตามความกว้างจอเอง)
        <div
          className="h-4 w-full md:h-6"
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
