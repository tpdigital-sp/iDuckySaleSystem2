#!/usr/bin/env node
/**
 * คลิป "เคลือบเรซิ่น" ของ กริ๊บต๊อก (griptok-th) — แทนภาพนิ่ง resin-coat-v1.jpg เดิม
 *
 *   node scripts/griptok-th-resin-clip.mjs           # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/griptok-th-resin-clip.mjs --write   # อัปไฟล์ + เขียนสินค้า
 *
 * ที่มา (ผู้ใช้ส่งลิงก์ 25 ส.ค. 69): แกลเลอรีหน้า /griptok
 *   pgid=lspybsls-5bbfed7b-46e2-477e-8e1a-80194db163b7 → วิดีโอ VID_690491016_044139_656.mp4
 *   (640×1136 · ~9.5 วิ · ในคลิปมีป้าย "GRIPTOK UV | เคลือบนูนใส")
 *   ไฟล์: video.wixstatic.com/video/959b83_bd6ac4dc6a064a8188d578718f8df229/720p/mp4/file.mp4
 *   โปสเตอร์: static.wixstatic.com/media/959b83_bd6ac4dc6a064a8188d578718f8df229f000.jpg
 *   สำรองไว้ที่ .cache/griptok-th/resin-clip-{v1.mp4,poster-v1.jpg} (สคริปต์โหลดซ้ำให้ถ้าไม่มี)
 *
 * ⚠️ แกลเลอรีสินค้านี้เต็ม 5 ช่องพอดี (MAX_PHOTOS = 5) คลิปจึง "แทนที่" ช่องรูปนิ่ง
 *    5134ae24-….jpg (ช่องที่ 4 — ภาพติดบนมือถือระยะไกล ซ้ำกับช่องที่ 5 ที่เป็นระยะใกล้)
 *    ห้ามช่องแรก — รูปแรกเป็นหน้าปกทั้งเว็บ
 * ตัวเลือก "เคลือบเรซิ่น" ชี้ imageSrc → โปสเตอร์ตัวเดียวกับในแกลเลอรี — ติ๊กแล้ว
 * jumpToImage เด้งไปช่องคลิปให้เอง (src ต้องตรงกันเป๊ะ ดู memory iducky-option-images)
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "griptok-th";
const DIR = ".cache/griptok-th";
const V = "v1";
const GROUP = "เคลือบเรซิ่น (Add On)";
const CHOICE = "เคลือบเรซิ่น";
const REPLACE_RE = /\/5134ae24-c110-44c7-985d-622d4c76ab35\.jpg$/;

const WIX_MP4 = "https://video.wixstatic.com/video/959b83_bd6ac4dc6a064a8188d578718f8df229/720p/mp4/file.mp4";
const WIX_POSTER = "https://static.wixstatic.com/media/959b83_bd6ac4dc6a064a8188d578718f8df229f000.jpg";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/griptok-th`;
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
  label: "งานจริง — กริ๊บต๊อกเคลือบเรซิ่น ผิวนูนเงา สีเข้มขึ้น",
  src: POSTER_URL,
  videoSrc: CLIP_URL,
};

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
if (!/griptok|กริ๊บต๊อก/i.test(row.name)) throw new Error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
const d = structuredClone(row.data);

/* ── 1. แทนที่ช่องรูปนิ่ง (มือถือระยะไกล) ด้วยช่องคลิป ─────────────── */
const at = (d.images ?? []).findIndex((im) => REPLACE_RE.test(im.src ?? "") || im.videoSrc === CLIP_URL);
if (at < 0) throw new Error("ไม่เจอช่องรูปที่จะแทน (และยังไม่มีช่องคลิป) — โครงแกลเลอรีเปลี่ยน มาดูเองก่อน");
if (at === 0) throw new Error("ช่องที่จะแทนเป็นช่องแรก — รูปแรกคือหน้าปกสินค้า ห้ามเป็นคลิป");
const already = d.images[at].videoSrc === CLIP_URL;
d.images[at] = CLIP;
console.log(`แกลเลอรี ช่องที่ ${at + 1}: ${already ? "เป็นช่องคลิปอยู่แล้ว (เขียนทับด้วยค่าเดิม)" : "รูปมือถือระยะไกล → คลิปเคลือบเรซิ่น"} (รวม ${d.images.length} ช่อง)`);

/* ── 2. ตัวเลือก "เคลือบเรซิ่น" ชี้ภาพไปโปสเตอร์ (ติ๊กแล้วเด้งไปช่องคลิป) ── */
const grp = (d.options ?? []).find((o) => o.label === GROUP);
const choice = grp?.choices.find((c) => c.name === CHOICE);
if (!choice) throw new Error(`ไม่เจอตัวเลือก "${CHOICE}" ในกลุ่ม "${GROUP}"`);
console.log(`ตัวเลือก "${CHOICE}": imageSrc → resin-clip-poster-${V}.jpg (extra ${choice.extra}/${choice.extraBelow} คงเดิม)`);
choice.imageSrc = POSTER_URL;

if (!WRITE) {
  console.log("\n(ยังไม่อัป/ไม่เขียนฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}

for (const [path, buf, type] of [
  [`products/griptok-th/resin-clip-${V}.mp4`, clipBuf, "video/mp4"],
  [`products/griptok-th/resin-clip-poster-${V}.jpg`, posterBuf, "image/jpeg"],
]) {
  const { error: upErr } = await sb.storage.from("product-images").upload(path, buf, { contentType: type, upsert: false });
  if (upErr && !/already exists|Duplicate/i.test(upErr.message)) throw upErr;
  console.log(`⬆️  ${path.split("/").pop()} ${upErr ? "(มีอยู่แล้ว ใช้ของเดิม)" : "อัปแล้ว"}`);
}
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw saveErr;
console.log("\n✅ บันทึกแล้ว — ติ๊กเคลือบเรซิ่นแล้วแกลเลอรีเด้งไปคลิป");
