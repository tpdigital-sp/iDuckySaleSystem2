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
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "รับเฉพาะไฟล์รูปภาพ" }, { status: 400 });
  try {
    const img = await uploadImage(folder, file.name || "image.jpg", Buffer.from(await file.arrayBuffer()), file.type);
    return NextResponse.json(img);
  } catch (e) {
    return NextResponse.json({ error: `อัปรูปไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 });
  }
}
