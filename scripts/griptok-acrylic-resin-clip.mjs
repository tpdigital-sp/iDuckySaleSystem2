#!/usr/bin/env node
/**
 * คลิป "เคลือบนูน Resin" ของ "Griptok อะคริลิค (5-10cm)" (id 1-4)
 *
 *   node scripts/griptok-acrylic-resin-clip.mjs           # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/griptok-acrylic-resin-clip.mjs --write   # อัปไฟล์ + เขียนสินค้า
 *
 * ที่มา (ผู้ใช้ส่งลิงก์ 25 ส.ค. 69): แกลเลอรี "ตัวอย่าง Griptok อะคริลิค เรซิ่น (เคลือบนูน)" หน้า /griptok
 *   pgid=lssdmzqv-4f15cbad-a3e7-44d5-b7ce-07f0c6f24404 → วิดีโอ VID_666420409_120047_574.mp4 (720×1280 · ~7 วิ)
 *   ไฟล์: video.wixstatic.com/video/959b83_f99ab3b23274459d8ee477a354b8766e/720p/mp4/file.mp4
 *   โปสเตอร์: static.wixstatic.com/media/959b83_f99ab3b23274459d8ee477a354b8766ef003.jpg
 *   โหลดเก็บไว้ที่ .cache/griptok-acrylic/resin-clip-{v1.mp4,poster-v1.jpg} แล้ว (สคริปต์โหลดซ้ำให้ถ้าไม่มี)
 *
 * ช่องแกลเลอรีที่เป็นคลิป (ดู ProductImage): { src: <โปสเตอร์>, videoSrc: <คลิป .mp4> }
 * ⚠️ แกลเลอรีสินค้านี้เต็ม 5 ช่องพอดี (MAX_PHOTOS = 5 — เกินแล้วแอดมินกดบันทึกในหน้าแก้ไขจะโดนสไลซ์ทิ้งเงียบ ๆ)
 *    คลิปจึง "แทนที่" ช่องรูปนิ่ง resin-1.jpg เดิม (ช่องที่ 2 — ห้ามช่องแรก รูปแรกเป็นหน้าปกทั้งเว็บ)
 * ตัวเลือก "เคลือบนูน Resin" ชี้ imageSrc → โปสเตอร์ตัวเดียวกับในแกลเลอรี — กดเลือกแล้ว jumpToImage
 * เด้งไปช่องคลิปให้เอง (src ต้องตรงกันเป๊ะถึงจะเด้ง ดูเทคนิคใน memory iducky-option-images)
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "1-4";
const DIR = ".cache/griptok-acrylic";
const V = "v1";
const CHOICE = "เคลือบนูน Resin";

const WIX_MP4 = "https://video.wixstatic.com/video/959b83_f99ab3b23274459d8ee477a354b8766e/720p/mp4/file.mp4";
const WIX_POSTER = "https://static.wixstatic.com/media/959b83_f99ab3b23274459d8ee477a354b8766ef003.jpg";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/griptok-acrylic`;
const POSTER_URL = `${BASE}/resin-clip-poster-${V}.jpg`;
const CLIP_URL = `${BASE}/resin-clip-${V}.mp4`;

mkdirSync(DIR, { recursive: true });
async function fetchTo(path, url) {
  if (existsSync(path)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`โหลด ${url} ไม่ได้ — HTTP ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}
await fetchTo(`${DIR}/resin-clip-${V}.mp4`, WIX_MP4);
await fetchTo(`${DIR}/resin-clip-poster-${V}.jpg`, WIX_POSTER);
const clipBuf = readFileSync(`${DIR}/resin-clip-${V}.mp4`);
const posterBuf = readFileSync(`${DIR}/resin-clip-poster-${V}.jpg`);
console.log(`🎬 คลิป ${Math.round(clipBuf.length / 1024)} KB · โปสเตอร์ ${Math.round(posterBuf.length / 1024)} KB`);

const CLIP = {
  emoji: "🎬",
  gradient: "from-slate-100 to-blue-100",
  // ปุ่มรูปย่ออ่านออกเสียงว่า "ดูคลิป" + ชื่อนี้ต่อกัน — ตั้งชื่อให้ต่อแล้วเป็นประโยค
  label: "งานจริง — Griptok อะคริลิค เคลือบนูน Resin ผิวนูนเงา สีเข้มขึ้น",
  src: POSTER_URL,
  videoSrc: CLIP_URL,
};

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const d = structuredClone(row.data);

/* ── 1. แทนที่ช่องรูปนิ่ง resin-1.jpg ด้วยช่องคลิป ─────────────────── */
const at = (d.images ?? []).findIndex((im) => /\/resin-1\.jpg$/.test(im.src) || im.videoSrc === CLIP_URL);
if (at < 0) throw new Error("ไม่เจอช่อง resin-1.jpg ในแกลเลอรี (และยังไม่มีช่องคลิป) — โครงแกลเลอรีเปลี่ยน มาดูเองก่อน");
if (at === 0) throw new Error("ช่องที่จะแทนเป็นช่องแรก — รูปแรกคือหน้าปกสินค้า ห้ามเป็นคลิป");
const already = d.images[at].videoSrc === CLIP_URL;
d.images[at] = CLIP;
console.log(`แกลเลอรี ช่องที่ ${at + 1}: ${already ? "เป็นช่องคลิปอยู่แล้ว (เขียนทับด้วยค่าเดิม)" : "resin-1.jpg → คลิปเคลือบนูน"} (รวม ${d.images.length} ช่อง)`);

/* ── 2. ตัวเลือก "เคลือบนูน Resin" ชี้ภาพไปโปสเตอร์ (เด้งไปช่องคลิป) ── */
const coat = (d.options ?? []).find((o) => o.label === "เคลือบผิว");
const choice = coat?.choices.find((c) => c.name === CHOICE);
if (!choice) throw new Error(`ไม่เจอตัวเลือก "${CHOICE}" ในกลุ่ม "เคลือบผิว"`);
console.log(`ตัวเลือก "${CHOICE}": imageSrc → resin-clip-poster-${V}.jpg (extra ${choice.extra} คงเดิม)`);
choice.imageSrc = POSTER_URL;

if (!WRITE) {
  console.log("\n(ยังไม่อัป/ไม่เขียนฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}

for (const [path, buf, type] of [
  [`products/griptok-acrylic/resin-clip-${V}.mp4`, clipBuf, "video/mp4"],
  [`products/griptok-acrylic/resin-clip-poster-${V}.jpg`, posterBuf, "image/jpeg"],
]) {
  const { error: upErr } = await sb.storage.from("product-images").upload(path, buf, { contentType: type, upsert: false });
  if (upErr && !/already exists|Duplicate/i.test(upErr.message)) throw upErr;
  console.log(`⬆️  ${path.split("/").pop()} ${upErr ? "(มีอยู่แล้ว ใช้ของเดิม)" : "อัปแล้ว"}`);
}
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw saveErr;
console.log("\n✅ บันทึกแล้ว — เลือกเคลือบนูน Resin แล้วแกลเลอรีเด้งไปคลิป");
