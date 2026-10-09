import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { uploadImage } from "@/lib/server/bot-kb";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * 🖼 อัปรูปของคลังความรู้ / ลิงก์ราคา ขึ้น Firebase Storage (ถังเดียวกับ AdminBuddy)
 * form-data: folder (เช่น "1773820356779" หรือ "kb-<docId>") + file
 * หน้าจอย่อรูปเหลือด้านยาว ≤1600px ก่อนส่ง — Netlify รับ body ได้ราว 4.5MB เท่านั้น
 */
export async function POST(req: Request) {
  // 9 ต.ค. 69 chat.reply = แนบรูปตอบลูกค้าจากหน้าแชท (โฟลเดอร์ chat-<userId>)
  const gate = await requirePerm(["orders.edit", "chat.reply"]);
  if (gate.res) return gate.res;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "ไฟล์ใหญ่เกินไปหรือรูปแบบไม่ถูกต้อง" }, { status: 400 });
  }
  const file = form.get("file");
  const folder = String(form.get("folder") ?? "").trim();
  if (!(file instanceof File) || !folder) return NextResponse.json({ error: "ไม่มีไฟล์หรือไม่ได้ระบุโฟลเดอร์" }, { status: 400 });
  // 📎 9 ต.ค. 69 19:00 เจ้าของร้าน "ควรรับไฟล์งานหลายนามสกุล" — kind=file รับไฟล์งาน (AI/PSD/PDF/ZIP/…) ≤ 4MB (เพดาน body ของ Netlify) ส่งหาลูกค้าเป็นลิงก์ดาวน์โหลด
  const kind = String(form.get("kind") ?? "image");
  if (kind === "file") {
    const ext = (file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "").toLowerCase();
    const OK = ["pdf", "ai", "psd", "eps", "svg", "cdr", "tif", "tiff", "zip", "rar", "7z", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "mp4", "mov", "png", "jpg", "jpeg", "gif", "webp", "heic"];
    if (!OK.includes(ext)) return NextResponse.json({ error: `ยังไม่รองรับไฟล์ .${ext || "?"} (รับ ${OK.slice(0, 12).join("/")} …)` }, { status: 400 });
    if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: `ไฟล์ ${(file.size / 1048576).toFixed(1)} MB ใหญ่เกิน 4 MB — ส่งผ่านหน้านี้ไม่ได้ ใช้ลิงก์ Drive/ส่งใน OA Manager แทน` }, { status: 413 });
    try {
      const up = await uploadImage(folder, file.name || `file.${ext}`, Buffer.from(await file.arrayBuffer()), file.type || "application/octet-stream");
      return NextResponse.json({ ...up, name: file.name, size: file.size, type: file.type });
    } catch (e) {
      return NextResponse.json({ error: `อัปไฟล์ไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 });
    }
  }
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "รับเฉพาะไฟล์รูปภาพ" }, { status: 400 });
  try {
    const img = await uploadImage(folder, file.name || "image.jpg", Buffer.from(await file.arrayBuffer()), file.type);
    return NextResponse.json(img);
  } catch (e) {
    return NextResponse.json({ error: `อัปรูปไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 });
  }
}
