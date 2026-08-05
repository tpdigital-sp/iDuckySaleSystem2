"use client";

import Link from "next/link";
import type { NavTile, TileSize } from "@/lib/home-nav";

/**
 * การ์ดนำทางหน้าแรก — เรียงเป็นบล็อกบนตาราง 12 ช่อง
 *   ใหญ่ (big)  = 3 ช่อง × 2 แถว  → เกือบสี่เหลี่ยมจัตุรัส อยู่ซ้าย
 *   กว้าง (wide) = 9 ช่อง × 1 แถว  → แถบยาวด้านบนขวา
 *   เล็ก (small) = 3 ช่อง × 1 แถว  → เรียงต่อกันใต้แถบกว้าง
 *
 * ⚠️ คลาส Tailwind ต้องเขียนเป็นข้อความเต็ม ๆ (ต่อสตริงเองแล้ว build จะไม่เห็น)
 *
 * ใช้ทั้งหน้าร้านจริงและหน้าตัวอย่างในหลังบ้าน — แอดมินจึงเห็นตรงกับที่ลูกค้าเห็นเป๊ะ
 */

const SPAN: Record<TileSize, string> = {
  big: "col-span-2 row-span-2 md:col-span-3",
  wide: "col-span-2 md:col-span-9",
  small: "col-span-1 md:col-span-3",
};

/** ตัวอักษรโตตามขนาดการ์ด */
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
  // มีรูปที่ออกแบบมาแล้ว = ใช้รูปเต็มใบ (ตัวหนังสืออยู่ในรูปอยู่แล้ว)
  // ข้อความยังอยู่ให้โปรแกรมอ่านหน้าจอ/ตอนรูปโหลดไม่ขึ้น
  if (t.image) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={t.image}
          alt={`${t.title} ${t.subtitle}`.trim()}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
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

export default function NavTiles({ tiles, preview = false }: { tiles: NavTile[]; preview?: boolean }) {
  if (!tiles.length) return null;

  return (
    <div className="grid auto-rows-[7rem] grid-cols-2 gap-3 md:auto-rows-[8.5rem] md:grid-cols-12">
      {tiles.map((t) => {
        const cls = `group relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br ${t.gradient} ${SPAN[t.size]} shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg`;
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
}
