#!/usr/bin/env node
/**
 * "พวงกุญแจ + อะไหล่จุกสีใส" — เปลี่ยนรูปแรกให้ตรงกับสินค้า + ใส่คลิปงานจริงของร้าน
 *
 *   node scripts/keyring-stopper-clear-media.mjs           # ดูก่อน (โหลดไฟล์มาเช็คขนาด ไม่อัป ไม่เขียน DB)
 *   node scripts/keyring-stopper-clear-media.mjs --write    # อัปไฟล์ขึ้น storage + บันทึกลง Supabase
 *
 * ทำไมต้องมีตัวนี้ (ไม่รัน add-keyring-stopper.ts ใหม่):
 *   สคริปต์ add-* เขียนสินค้าทั้งก้อนทับของเดิม — ตัวจริงใน DB ถูกแก้เพิ่มไปแล้ว (แท็บ 8 อัน · รูปในแท็บไม่ตรง)
 *   ตัวนี้แก้เฉพาะ 3 อย่าง: images[0] · imageSrc · html ของแท็บ "อะไหล่จุกสีใส" — อย่างอื่นคงเดิมทุกตัวอักษร
 *
 * ที่มาของไฟล์ (แกลเลอรีหน้าตารางราคาของร้านเอง — pro-gallery หน้า /pricestandy):
 *   รูป  959b83_ed49cabd… "อะคริลิคใสชิงช้าสวรรค์ + โซ่ไข่ปลา" เห็นจุกสีใสกลางชิ้นชัด
 *        (รูปเดิม photo-1 เป็นพวงกุญแจกลิตเตอร์ชมพู ไม่เห็นจุกสีใสเลย จึงไม่ตรงกับชื่อสินค้า)
 *   คลิป 959b83_085e8324… "dook-dik keychain" — โชว์จุกสีใสเชื่อมอะคริลิค 2 ชิ้นแล้วหมุนได้
 *        ลิงก์ที่ผู้ใช้ส่งมา: /pricestandy?pgid=lx1f4dev1-b89403d7-e582-4de4-8c6d-ce24eea651e3
 *        มีแค่ 480p (576×1024 · ~20 วินาที · ~2.9 MB) — 720p/1080p ทางเว็บไม่เปิดให้โหลด
 *   โปสเตอร์คลิปใช้เฟรมที่ Wix สร้างไว้ (…f003.jpg) — เป็นชิ้นงานเดียวกับรูปแรก ภาพต่อกันพอดี
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ไฟล์ชุดนี้เลยใช้ชื่อใหม่ทั้งหมด
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const WRITE = process.argv.includes("--write");

const ID = "keyring-clear-stopper";
const REV = "v3"; // รุ่นเดียวกับไฟล์ชุดเดิมของสินค้านี้ (ชื่อไฟล์ไม่ซ้ำของเดิมอยู่แล้ว)
const TAB_TITLE = "อะไหล่จุกสีใส";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const IMG = (name, ext = "jpg") =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}-${REV}.${ext}`;

const PHOTO = "photo-clear";
const CLIP = "clip-stopper";
const CLIP_POSTER = "clip-stopper-poster";

const SRC = {
  photo: "https://static.wixstatic.com/media/959b83_ed49cabdbfd34944a20bbd7ecd457adf~mv2.jpg",
  clip: "https://video.wixstatic.com/video/959b83_085e832495914938990cf3fe98379740/480p/mp4/file.mp4",
  poster: "https://static.wixstatic.com/media/959b83_085e832495914938990cf3fe98379740f003.jpg",
};

const grab = async (url) => {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`โหลดไม่ได้ (${res.status}) — ${url}`);
  return Buffer.from(await res.arrayBuffer());
};
const kb = (b) => `${Math.round(b.length / 1024)} KB`;

/* ── 1. เตรียมไฟล์ ─────────────────────────────────────────────── */
// ต้นฉบับเป็นแนวนอน 4951×3629 แต่แกลเลอรีหน้าสินค้าโชว์เป็นจัตุรัส (object-cover)
// ครอปเองให้ชิ้นงานอยู่ครบทั้งใบ — ถ้าปล่อยให้ CSS ครอปกลางภาพ ขอบขวาของการ์ดจะโดนกิน
const photo = await sharp(await grab(SRC.photo))
  .extract({ left: 827, top: 0, width: 3629, height: 3629 })
  .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
  .jpeg({ quality: 88 })
  .toBuffer();
console.log(`📷 ${PHOTO}-${REV}.jpg (${kb(photo)})`);

const clip = await grab(SRC.clip);
console.log(`🎬 ${CLIP}-${REV}.mp4 (${kb(clip)})`);

const poster = await sharp(await grab(SRC.poster))
  .resize(576, 1024, { fit: "inside", withoutEnlargement: true })
  .jpeg({ quality: 86 })
  .toBuffer();
console.log(`📷 ${CLIP_POSTER}-${REV}.jpg (${kb(poster)})`);

/* ── 2. อัปขึ้น storage ─────────────────────────────────────────── */
const upload = async (name, ext, body, contentType) => {
  const { error } = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${name}-${REV}.${ext}`, body, { contentType, upsert: true });
  if (error) throw new Error(`อัป ${name}: ${error.message}`);
  console.log(`⬆️  ${name}-${REV}.${ext}`);
};

if (WRITE) {
  await upload(PHOTO, "jpg", photo, "image/jpeg");
  // mp4 ต้องส่ง contentType ให้ถูก ไม่งั้นเบราว์เซอร์ไม่ยอมเล่นให้
  await upload(CLIP, "mp4", clip, "video/mp4");
  await upload(CLIP_POSTER, "jpg", poster, "image/jpeg");
}

/* ── 3. แก้ข้อมูลสินค้า ─────────────────────────────────────────── */
const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่ได้ — ${error.message}`);

const d = structuredClone(row.data);
const changes = [];

// 3.1 รูปแรกของแกลเลอรี + รูปหน้าปก (รูปเดิมไม่ได้หายไปไหน — เลื่อนลงไปเป็นรูปถัดไป)
const HERO = {
  emoji: "🔑",
  gradient: "from-teal-100 to-cyan-200",
  label: "งานจริง — อะคริลิคใส จุกสีใสอยู่กลางชิ้น",
  src: IMG(PHOTO),
};
d.images = [HERO, ...(d.images ?? []).filter((im) => im.src !== HERO.src)];
d.imageSrc = HERO.src;
changes.push(`รูปแรก → ${PHOTO}-${REV}.jpg (รูปเดิมเลื่อนลงเป็นรูปที่ 2 · รวม ${d.images.length} รูป)`);

// 3.2 คลิปงานจริงในแท็บ "อะไหล่จุกสีใส" — เนื้อหาเดิมเขียนซ้ำเป็น HTML แล้วต่อท้ายด้วยคลิป
//     (คงคีย์ text เดิมไว้ด้วย เผื่อทีมงานลบ html ทิ้งตอนแก้ในหลังบ้าน — ProductDetail จะกลับไปใช้ text ให้เอง)
const tab = (d.tabs ?? []).find((t) => t.title === TAB_TITLE);
if (!tab) throw new Error(`ไม่เจอแท็บ "${TAB_TITLE}" — สินค้าถูกแก้โครงไปแล้ว ตรวจก่อนรันทับ`);
if (tab.html?.trim() && !tab.html.includes(`${CLIP}-`)) {
  throw new Error(`แท็บ "${TAB_TITLE}" มี html ที่ทีมงานเขียนเองอยู่แล้ว — ไม่ทับให้ ตรวจก่อน`);
}

tab.html =
  `<p><strong>จุกสีใสคืออะไร</strong></p>` +
  `<ul>` +
  `<li>จุกยาง/ซิลิโคนใส สวมไว้ในรูเจาะของชิ้นงาน ก่อนคล้องห่วงหรือตะขอ</li>` +
  `<li>กันรูเจาะสึกหรือบิ่นจากการเสียดสีกับห่วงเหล็ก — ชิ้นงานทนกว่าเดิมเวลาห้อยกระเป๋า</li>` +
  `<li>ห้อยแล้วชิ้นงานหมุนได้ลื่น ไม่ฝืด · ใช้เชื่อมอะคริลิค 2 ชิ้นให้ขยับได้ก็ได้ (งานแบบ dook-dik)</li>` +
  `<li>เป็นสีใส จึงไม่บังลายและใช้ได้กับอะคริลิคทุกสี</li>` +
  `</ul>` +
  `<p><strong>ราคา</strong></p>` +
  `<ul>` +
  `<li>ค่าจุกสีใส 10 บาท/ชิ้น รวมอยู่ในราคาที่แสดงแล้ว (ไม่ต้องบวกเอง)</li>` +
  `<li>ราคาตัวชิ้นงานคิดตามตาราง "เรทที่ 1 (สั่งแบบคละดีเทล)" ของหน้าพวงกุญแจ</li>` +
  `</ul>` +
  `<p><strong>คลิปงานจริง</strong></p>` +
  `<video controls playsinline preload="metadata" poster="${IMG(CLIP_POSTER)}" ` +
  `style="width:100%;max-width:300px;border-radius:18px;background:#0f172a">` +
  `<source src="${IMG(CLIP, "mp4")}" type="video/mp4"/>` +
  `เบราว์เซอร์ไม่รองรับการเล่นวิดีโอ` +
  `</video>` +
  `<p style="font-size:13px;color:#64748b">คลิปจากหน้าตารางราคาของร้าน — จุกสีใสเชื่อมอะคริลิคแล้วหมุน/ขยับได้</p>`;
changes.push(`แท็บ "${TAB_TITLE}" → ใส่คลิป ${CLIP}-${REV}.mp4 ท้ายเนื้อหา`);

changes.forEach((c) => console.log(`   • ${c}`));

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write เพื่ออัปไฟล์ + เขียนลง Supabase)");
  process.exit(0);
}

const up = await sb.from("products").update({ data: d }).eq("id", ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log("\n✅ บันทึกแล้ว");
