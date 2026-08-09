import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { TEMPLATE_MAX_MB } from "@/lib/design-templates";

export const runtime = "nodejs";

/**
 * อัปโหลดไฟล์เทมเพลตงาน (.ai ฯลฯ) หรือรูปตัวอย่าง — เฉพาะทีมงานที่มีสิทธิ์จัดการสินค้า
 * ⚠️ เก็บไฟล์ตามต้นฉบับ ไม่แปลง ไม่บีบอัด (ลูกค้าต้องเปิดใน Illustrator ได้ตรง ๆ)
 */
const BUCKET = "design-templates";

/** นามสกุลไฟล์เทมเพลต → content-type (เบราว์เซอร์ส่ง type ของ .ai มาไม่ตรงกันเลยยึดนามสกุลแทน) */
const FILE_TYPES: Record<string, string> = {
  ai: "application/postscript",
  pdf: "application/pdf",
  eps: "application/postscript",
  svg: "image/svg+xml",
  psd: "image/vnd.adobe.photoshop",
  zip: "application/zip",
};
const PREVIEW_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** ไฟล์งานใหญ่ได้เท่าลิมิตกลางของ Supabase · รูปตัวอย่างพอแค่ 5MB (ใหญ่กว่านั้นใช้ลิงก์ Drive แทน) */
const MAX_FILE = TEMPLATE_MAX_MB * 1024 * 1024;
const MAX_PREVIEW = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("products.manage");
  if (gate.res) return gate.res;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น multipart)" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "ไม่มีไฟล์" }, { status: 400 });

  const preview = form.get("kind") === "preview";
  const table = preview ? PREVIEW_TYPES : FILE_TYPES;
  const max = preview ? MAX_PREVIEW : MAX_FILE;

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const contentType = table[ext];
  if (!contentType) {
    return NextResponse.json(
      {
        error: preview
          ? "รูปตัวอย่างรองรับ PNG / JPG / WEBP"
          : `ไฟล์เทมเพลตรองรับ ${Object.keys(FILE_TYPES).map((e) => "." + e).join(" / ")}`,
      },
      { status: 400 }
    );
  }
  if (file.size > max) {
    return NextResponse.json(
      {
        error: `ไฟล์ใหญ่เกิน ${max / 1024 / 1024}MB — ไฟล์ใหญ่กว่านี้ให้อัปขึ้น Google Drive แล้วใส่ลิงก์แทน`,
      },
      { status: 400 }
    );
  }

  // ชื่อไฟล์เดิมติดไปด้วย เพื่อให้ลูกค้าโหลดแล้วได้ชื่อที่อ่านรู้เรื่อง (ตัดอักขระที่ทำ URL พัง)
  const safe = file.name.replace(/\.[^.]+$/, "").replace(/[^\w฀-๿.-]+/g, "-").slice(0, 60) || "template";
  const path = `${preview ? "preview" : "file"}/${randomUUID().slice(0, 8)}-${safe}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer()); // ต้นฉบับล้วน

  const upload = () => sb.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
  let { error } = await upload();
  if (error && /bucket not found/i.test(error.message)) {
    // สร้าง bucket ให้อัตโนมัติครั้งแรก — ไม่ตั้ง fileSizeLimit เอง ให้ยึดลิมิตกลางของโปรเจกต์
    // (ตั้งเกินลิมิตกลาง Supabase ปฏิเสธด้วย "The object exceeded the maximum allowed size")
    const { error: mk } = await sb.storage.createBucket(BUCKET, { public: true });
    if (mk && !/already exists/i.test(mk.message)) {
      return NextResponse.json({ error: `สร้างที่เก็บไฟล์ไม่สำเร็จ: ${mk.message}` }, { status: 500 });
    }
    ({ error } = await upload());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl, name: file.name, size: file.size });
}
