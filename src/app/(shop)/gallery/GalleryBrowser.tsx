"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { LINE_URL } from "@/components/LineButton";
import { galleryImg, type GalleryAlbum, type GalleryCatId } from "@/lib/gallery";
import { useShopCatalog } from "@/lib/use-shop-catalog";
import { querySearch, type SearchHit } from "@/lib/site-search";

type Cat = { id: GalleryCatId; label: string; emoji: string; n: number };

const PAGE = 24;

/**
 * คำค้นสินค้าจากชื่ออัลบั้ม (ลองตามลำดับ ตัวแรกที่เจอสินค้า = ใช้ตัวนั้น)
 * ตัดคำนำ "รับทำ/รับผลิต…" วงเล็บ และ "ออกแบบลายเองได้" · ชื่อไทยเว้นวรรคคั่นคำพ้อง ("สมุดโน๊ต สมุดไดอารี่ …")
 * → ลองทั้งวลีก่อน แล้วไล่ทีละคำ · คำอังกฤษเดี่ยว ("frame") กว้างเกินจนได้สินค้ามั่ว → ไม่ใช้
 */
function productQueries(t: string): string[] {
  const clean = t
    .replace(/^(ร้าน)?(รับ)?(ทำ|ผลิต|สกรีน|พิมพ์)|^สั่งทำ/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/(สามารถ)?ออกแบบลายเองได้|สั่งทำได้/g, "")
    .trim();
  const words = clean.split(/\s+/).filter((w) => w.length >= 3 && !/^[a-z0-9]/i.test(w));
  return [...new Set([clean, ...words])].filter(Boolean);
}

/** สินค้าในร้านที่ตรงกับอัลบั้ม (สูงสุด 3) — ดัชนีเดียวกับช่องค้นหาบนแถบเมนู */
function useMatchedProducts(title: string): SearchHit[] {
  const { index } = useShopCatalog(true);
  return useMemo(() => {
    for (const q of productQueries(title)) {
      const hits = querySearch(index, q).filter((h) => h.kind === "product");
      if (hits.length) return hits.slice(0, 3);
    }
    return [];
  }, [index, title]);
}

/** เปิดอัลบั้มจากลิงก์ที่แชร์ (/gallery?a=5528) — อ่าน/เขียน URL เองไม่ผ่าน router ไม่ให้หน้าเลื่อน */
function setAlbumParam(id: number | null) {
  const u = new URL(window.location.href);
  if (id == null) u.searchParams.delete("a");
  else u.searchParams.set("a", String(id));
  window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
}

export default function GalleryBrowser({ albums, cats }: { albums: GalleryAlbum[]; cats: Cat[] }) {
  const [cat, setCat] = useState<GalleryCatId | "all">("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<{ album: GalleryAlbum; i: number } | null>(null);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return albums.filter(
      (a) =>
        (cat === "all" || a.cat === cat) &&
        (!needle || a.t.toLowerCase().includes(needle) || (a.d ?? "").toLowerCase().includes(needle)),
    );
  }, [albums, cat, q]);

  useEffect(() => setShown(PAGE), [cat, q]);

  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("a"));
    const a = id ? albums.find((x) => x.id === id) : undefined;
    if (a) setOpen({ album: a, i: 0 });
  }, [albums]);

  const openAlbum = (album: GalleryAlbum) => {
    setOpen({ album, i: 0 });
    setAlbumParam(album.id);
  };
  const close = useCallback(() => {
    setOpen(null);
    setAlbumParam(null);
  }, []);

  return (
    <>
      <div className="head gl-head">
        <span className="kicker kicker-mint">
          <i>🖼️</i>เลือกดูตามหมวด
        </span>
        <h2>
          งานจริง<em>ทุกชิ้น</em>
        </h2>
        <p>แตะอัลบั้มเพื่อดูภาพทั้งหมด · ไม่เจอแบบที่ต้องการ ทักแอดมินได้เลย ทำได้อีกเยอะ</p>
      </div>

      <div className="gl-tools">
        <label className="gl-search">
          <span aria-hidden="true">🔎</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาผลงาน เช่น พวงกุญแจ, เคส, ปฏิทิน"
            aria-label="ค้นหาผลงาน"
          />
        </label>
        <div className="gl-chips" role="tablist" aria-label="หมวดผลงาน">
          <button type="button" role="tab" aria-selected={cat === "all"} className={cat === "all" ? "on" : ""} onClick={() => setCat("all")}>
            ทั้งหมด <small>{albums.length}</small>
          </button>
          {cats.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={cat === c.id}
              className={cat === c.id ? "on" : ""}
              onClick={() => setCat(c.id)}
            >
              <i aria-hidden="true">{c.emoji}</i>
              {c.label} <small>{c.n}</small>
            </button>
          ))}
        </div>
      </div>

      {list.length ? (
        <ul className="gl-grid">
          {list.slice(0, shown).map((a) => (
            <li key={a.id}>
              <button type="button" className="gl-card" onClick={() => openAlbum(a)}>
                <span className="gl-card-shot">
                  <img src={galleryImg(a.c, "thumb")} alt={a.t} loading="lazy" decoding="async" />
                  <span className="gl-count">📷 {a.p.length}</span>
                </span>
                <span className="gl-card-title">{a.t}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="gl-empty">
          <p>ไม่พบผลงานที่ตรงกับ “{q}”</p>
          <a className="btn btn-ghost" href={LINE_URL} target="_blank" rel="noopener noreferrer">
            ถามแอดมินว่าทำได้ไหม <span className="dot">💬</span>
          </a>
        </div>
      )}

      {shown < list.length && (
        <div className="gl-more">
          <button type="button" className="btn btn-ghost" onClick={() => setShown((n) => n + PAGE)}>
            ดูผลงานเพิ่ม ({list.length - shown} อัลบั้ม) <span className="dot">↓</span>
          </button>
        </div>
      )}

      {/* ย้ายไปท้าย <body> — ใน .dl-page มี stacking context ที่ต่ำกว่าแถบเมนู/ปุ่มลอย (z-index 1000 ไม่ช่วย)
          ครอบ .dl อีกชั้นให้ยังได้ token/สไตล์ของ landing.css */}
      {open &&
        createPortal(
          <div className="dl gl-portal">
            <Viewer album={open.album} start={open.i} onClose={close} />
          </div>,
          document.body,
        )}
    </>
  );
}

/** หน้าต่างดูภาพทั้งอัลบั้ม: ←/→ · ปัดซ้ายขวาบนมือถือ · Esc ปิด · แถบภาพย่อด้านล่าง */
function Viewer({ album, start, onClose }: { album: GalleryAlbum; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  // จำว่าภาพไหนโหลดเสร็จ (ไม่ใช้ธง true/false — ภาพจากแคชยิง onLoad ก่อน effect รีเซ็ตธง แล้วภาพค้างโปร่งใส)
  const [loadedSrc, setLoadedSrc] = useState("");
  const n = album.p.length;
  const src = galleryImg(album.p[i], "large");
  const loaded = loadedSrc === src;
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);
  const touchX = useRef<number | null>(null);
  const thumbs = useRef<HTMLDivElement>(null);
  const matched = useMatchedProducts(album.t);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onClose]);

  useEffect(() => {
    thumbs.current
      ?.querySelector<HTMLElement>(`[data-i="${i}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    // โหลดภาพถัดไปรอไว้ กดถัดไปแล้วขึ้นทันที
    if (n > 1) new Image().src = galleryImg(album.p[(i + 1) % n], "large");
  }, [i, n, album]);

  return (
    <div className="gl-viewer" role="dialog" aria-modal="true" aria-label={album.t} onClick={onClose}>
      <div className="gl-v-box" onClick={(e) => e.stopPropagation()}>
        <div className="gl-v-top">
          <div className="gl-v-title">
            <b>{album.t}</b>
            <span>
              ภาพ {i + 1} / {n}
            </span>
          </div>
          <button type="button" className="gl-v-close" onClick={onClose} aria-label="ปิด">
            ✕
          </button>
        </div>

        <div
          className="gl-v-stage"
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current == null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          }}
        >
          {!loaded && <span className="gl-v-spin" aria-hidden="true" />}
          <img
            key={src}
            src={src}
            alt={`${album.t} ภาพที่ ${i + 1}`}
            className={loaded ? "is-in" : ""}
            onLoad={() => setLoadedSrc(src)}
            onError={() => setLoadedSrc(src)}
          />
          {n > 1 && (
            <>
              <button type="button" className="gl-v-nav prev" onClick={() => go(-1)} aria-label="ภาพก่อนหน้า">
                ‹
              </button>
              <button type="button" className="gl-v-nav next" onClick={() => go(1)} aria-label="ภาพถัดไป">
                ›
              </button>
            </>
          )}
        </div>

        {n > 1 && (
          <div className="gl-v-thumbs" ref={thumbs}>
            {album.p.map((f, k) => (
              <button
                key={f + k}
                type="button"
                data-i={k}
                className={k === i ? "on" : ""}
                onClick={() => setI(k)}
                aria-label={`ภาพที่ ${k + 1}`}
              >
                <img src={galleryImg(f, "small")} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        )}

        <div className="gl-v-foot">
          {album.d && <p className="gl-v-desc">{album.d}</p>}
          <div className="gl-v-acts">
            {matched.length > 0 && (
              <div className="gl-v-prods">
                <span className="gl-v-prods-h">สั่งทำได้เลย</span>
                {matched.map((h) => (
                  <Link key={h.href} className="gl-v-prod" href={h.href}>
                    {h.photo ? <img src={h.photo} alt="" loading="lazy" /> : <i aria-hidden="true">{h.icon}</i>}
                    <span>
                      <b>{h.name}</b>
                      {h.price && <small>{h.price}</small>}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <a className="gl-v-btn line" href={LINE_URL} target="_blank" rel="noopener noreferrer">
              💬 อยากได้แบบนี้ ทัก LINE
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
