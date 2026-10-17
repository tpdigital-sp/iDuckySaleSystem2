/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { SHOP } from "@/lib/shop-info";
import { LINE_URL } from "@/components/LineButton";
import { GALLERY_ALBUMS, GALLERY_CATS, GALLERY_PHOTO_COUNT, galleryImg } from "@/lib/gallery";
import GalleryBrowser from "./GalleryBrowser";
import "./gallery.css";

export const metadata: Metadata = {
  title: "ผลงานของเรา",
  description: `รวมผลงานจริงจาก ${SHOP.name} ${GALLERY_ALBUMS.length} แบบสินค้า กว่า ${Math.floor(GALLERY_PHOTO_COUNT / 100) * 100} ภาพ — พวงกุญแจ อะคริลิค สแตนดี้ เคสมือถือ สติ๊กเกอร์ ปฏิทิน เสื้อ กระเป๋า และของพิมพ์ลายตามสั่งอีกมากมาย`,
  alternates: { canonical: "/gallery" },
};

/** ภาพปกที่วางเป็นกองรูปในฮีโร่ — หยิบอัลบั้มต่างหมวดกัน ให้เห็นว่าทำได้หลายแบบ */
const HERO_PICKS = ["keychain", "case", "acrylic", "fabric"] as const;

/**
 * 📸 หน้าผลงาน (/gallery · เมนู "ผลงาน") — เจ้าของร้านสั่ง 17 ต.ค. 69 "เพิ่มหน้า ผลงาน โดยดึงภาพมาจากหน้า
 * https://www.iduckyofficial.com/gallery" · ข้อมูลอัลบั้ม = src/lib/gallery.ts (sync ด้วย scripts/gallery-sync.mjs)
 *
 * 🎨 ดีไซน์ภาษาเดียวกับ /why: ครอบ `.dl dl-page gl-page` ใช้ของกลาง landing.css (.btn/.kicker/.head/.chat-cta)
 * ⚠️ ห้ามใช้คลาส Tailwind ในหน้านี้ — `.dl *{margin:0;padding:0}` ล้างทิ้งหมด · สไตล์เฉพาะหน้า ./gallery.css prefix .gl-
 */
export default function GalleryPage() {
  const heroShots = HERO_PICKS.map((cat) => GALLERY_ALBUMS.find((a) => a.cat === cat)).filter(
    (a): a is (typeof GALLERY_ALBUMS)[number] => Boolean(a),
  );
  const cats = GALLERY_CATS.map((c) => ({
    id: c.id,
    label: c.label,
    emoji: c.emoji,
    n: GALLERY_ALBUMS.filter((a) => a.cat === c.id).length,
  }))
    .filter((c) => c.n)
    // ชิปรีวิว (อัลบั้มเดียว) ไว้ท้ายสุด — หมวดสินค้าขึ้นก่อน
    .sort((x, y) => Number(x.id === "review") - Number(y.id === "review"));

  return (
    <div className="dl dl-page gl-page">
      <div className="top-stack gl-stack">
        <img className="bg-cloud gl-c1" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud gl-c2" src="/landing/cloud.webp" alt="" aria-hidden="true" />

        <section className="gl-hero">
          <div className="gl-hero-txt">
            <span className="kicker kicker-yolk">
              <i>📸</i>ผลงานจริงจากร้าน
            </span>
            <h1>
              ผลงาน<span className="yolk-underline">ของเรา</span>
            </h1>
            <p className="gl-lead">
              ภาพงานจริงที่ผลิตให้ลูกค้า <b>ทุกชิ้นพิมพ์ลายตามสั่ง</b> — เลือกดูตามหมวด แล้วสั่งทำแบบของคุณเองได้เลย
            </p>
            <div className="gl-facts">
              <span className="gl-fact">
                <b>{GALLERY_ALBUMS.length}</b> แบบสินค้า
              </span>
              <span className="gl-fact yolk">
                <b>{GALLERY_PHOTO_COUNT.toLocaleString("th-TH")}</b> ภาพงานจริง
              </span>
              <span className="gl-fact mint">ไม่มีขั้นต่ำ เริ่ม 1 ชิ้น</span>
            </div>
            <div className="gl-hero-btns">
              <a className="btn btn-yolk" href="#works">
                ดูผลงานทั้งหมด <span className="dot">↓</span>
              </a>
              <a className="btn btn-ghost" href={LINE_URL} target="_blank" rel="noopener noreferrer">
                อยากได้แบบนี้ ทักแอดมิน <span className="dot">💬</span>
              </a>
            </div>
          </div>

          {/* กองรูปโพลารอยด์จากปกอัลบั้มจริง (ไม่ใช่ภาพประกอบ) */}
          <div className="gl-hero-art" aria-hidden="true">
            {heroShots.map((a, i) => (
              <figure key={a.id} className={`gl-polaroid gl-p${i + 1}`}>
                <img src={galleryImg(a.c, "thumb")} alt="" />
                <figcaption>{a.t}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      </div>

      <section className="gl-sec" id="works">
        <GalleryBrowser albums={GALLERY_ALBUMS} cats={cats} />
      </section>

      <div className="gl-cta-wrap">
        <div className="chat-cta">
          <div className="cc-text">
            <h3>เห็นแบบที่ชอบแล้วใช่ไหม?</h3>
            <p>ส่งภาพผลงานที่ชอบให้แอดมินดู แล้วบอกลายของคุณ เราช่วยแนะนำวัสดุและราคาให้</p>
          </div>
          <div className="cc-btns">
            <Link className="btn btn-yolk" href="/products">
              เลือกสินค้า <span className="dot">→</span>
            </Link>
            <a className="btn btn-line" href={LINE_URL} target="_blank" rel="noopener noreferrer">
              ทัก LINE <span className="dot">💬</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
