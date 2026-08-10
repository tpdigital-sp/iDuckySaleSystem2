"use client";

/**
 * 🖨 ไฟล์ .ai พร้อมพิมพ์ จากลายที่ลูกค้าวางเองบนเว็บ
 *
 * ลูกค้าจัดวาง/ย่อ-ขยายเสร็จแล้ว ระบบประกอบเป็นภาพขนาดเท่างานจริง (รวมตัดตก) ที่ 300 DPI
 * ตัวนี้แค่ห่อภาพนั้นเป็นไฟล์ .ai หน้าเดียวขนาดเท่างานจริง → กราฟฟิกเปิดแล้วส่งพิมพ์ได้เลย
 * ไม่ต้องมาจัดหน้าใหม่ (ลูกค้าอนุมัติแบบมาแล้วตั้งแต่หน้าเว็บ)
 *
 * ไฟล์ .ai ตั้งแต่ v9 คือ PDF ที่ Illustrator เปิด/แก้ได้ตรง ๆ — เขียนเป็น PDF ได้เลย
 * ภาพ JPEG ฝังลงไปดิบ ๆ ด้วย /DCTDecode (ไม่ต้องแตกแล้วบีบใหม่ ไฟล์เล็กและเร็ว)
 */

const PT_PER_MM = 72 / 25.4;
const enc = new TextEncoder();

/** ตัวเขียน PDF — จำ byte offset ของแต่ละ object ไว้ทำตาราง xref */
class PdfWriter {
  private parts: Uint8Array[] = [];
  length = 0;
  offsets: number[] = [];

  push(chunk: string | Uint8Array) {
    const bytes = typeof chunk === "string" ? enc.encode(chunk) : chunk;
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  startObj(n: number) {
    this.offsets[n] = this.length;
    this.push(`${n} 0 obj\n`);
  }

  endObj() {
    this.push("endobj\n");
  }

  blob(type: string) {
    return new Blob(this.parts as BlobPart[], { type });
  }
}

/** ขนาดภาพ + จำนวนช่องสีจากส่วนหัว JPEG (ไม่ต้องพึ่ง DOM) */
function jpegInfo(b: Uint8Array): { w: number; h: number; comps: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    // มาร์กเกอร์ที่ไม่มีความยาวต่อท้าย
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    // SOFn (ยกเว้น DHT/JPG/DAC) = เฟรมจริง มีขนาดภาพอยู่ในนั้น
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9] };
    i += 2 + len;
  }
  return null;
}

/** ไม่ใช่ JPEG (เช่น PNG) → วาดลงแคนวาสแล้วเข้ารหัสเป็น JPEG ก่อนฝัง */
async function toJpegBytes(blob: Blob): Promise<{ bytes: Uint8Array; w: number; h: number; comps: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("เปิดไฟล์ภาพไม่ได้"));
      im.src = url;
    });
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    const ctx = cv.getContext("2d");
    if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับ canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0);
    const jpg = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/jpeg", 0.94));
    if (!jpg) throw new Error("แปลงภาพเป็น JPEG ไม่สำเร็จ");
    return { bytes: new Uint8Array(await jpg.arrayBuffer()), w: cv.width, h: cv.height, comps: 3 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface PrintAiInput {
  /** ภาพงานที่ประกอบแล้ว (ขนาดเท่ากรอบงานพอดี รวมตัดตก) */
  imageUrl: string;
  /** ขนาดกรอบงานจริงเป็นมิลลิเมตร (รวมตัดตก) */
  widthMm: number;
  heightMm: number;
  /** ชื่องาน — เขียนลง metadata ให้รู้ว่ามาจากออเดอร์ไหน */
  title?: string;
  /**
   * ไฟล์ .ai ต้นฉบับของเทมเพลต — มีค่า = เอาลายไปวาง "ใต้" งานเดิมในไฟล์นั้น
   * เลเยอร์เส้นตัด/ไกด์/ข้อความกำกับของโรงพิมพ์เลยยังอยู่ครบ
   * โหลดไม่ได้/อ่านไม่ออก = ถอยไปสร้างไฟล์เปล่าที่มีแต่ลาย (ดีกว่าโหลดไม่ได้เลย)
   */
  templateUrl?: string;
}

/**
 * วางลายลงในไฟล์ .ai ต้นฉบับ — ลายอยู่ "ล่างสุด" งานเดิมของเทมเพลตทับอยู่ข้างบน
 *
 * ทำไมต้องล่างสุด: เส้นตัด เส้นพับ และไกด์ต่าง ๆ ในเทมเพลตต้องมองเห็นทับลาย
 * ถ้าวางลายทับไปข้างบนจะบังหมด กราฟฟิกก็ตัดงานไม่ได้
 *
 * ⚠️ ต้องตัด /PieceInfo (ข้อมูลส่วนตัวของ Illustrator) ทิ้งด้วย
 * เพราะถ้ายังอยู่ Illustrator จะ "สร้างเอกสารใหม่จากข้อมูลก้อนนั้น" แล้ว
 * ทิ้งเนื้อหา PDF ที่เราเพิ่งเติมลายเข้าไปทั้งหมด — เปิดมาก็เห็นแต่เทมเพลตเปล่า ๆ
 * (ข้อมูลก้อนนั้นเป็นรูปแบบปิดของ Adobe เขียนเพิ่มเองไม่ได้)
 * ตัดทิ้งแล้ว Illustrator จะอ่านแบบ PDF ปกติ — ได้ทั้งลาย เส้นเวกเตอร์ และเลเยอร์ครบ
 *
 * คืน null เมื่อทำไม่สำเร็จ (ผู้เรียกถอยไปใช้ไฟล์เปล่า)
 */
async function drawOnTemplate(
  templateUrl: string,
  jpeg: Uint8Array,
  title?: string,
): Promise<Blob | null> {
  try {
    const res = await fetch(templateUrl);
    if (!res.ok) return null;
    const tpl = new Uint8Array(await res.arrayBuffer());
    // .ai ที่เซฟแบบ "Create PDF Compatible File" คือ PDF — ไฟล์ที่ไม่ใช่ PDF อ่านไม่ได้
    if (String.fromCharCode(...tpl.slice(0, 5)) !== "%PDF-") return null;

    const { PDFDocument, PDFName, PDFArray, PDFDict, PDFHexString } = await import("pdf-lib");
    const doc = await PDFDocument.load(tpl, { ignoreEncryption: true, updateMetadata: false });
    const page = doc.getPages()[0];
    if (!page) return null;

    const img = await doc.embedJpg(jpeg);
    const box = page.getMediaBox();
    const xName = "IDuckyArtwork";
    page.node.setXObject(PDFName.of(xName), img.ref);

    /**
     * แยกเป็น 2 เลเยอร์ (OCG): "ลายลูกค้า" กับ "เทมเพลต"
     *
     * ⚠️ ทำไมได้แค่ 2 ไม่ใช่เลเยอร์เดิมของเทมเพลตทั้งหมด:
     * ไฟล์ .ai ประกาศชื่อเลเยอร์เดิมไว้ใน /OCProperties ก็จริง (เช่น "clip", "Layer 4")
     * แต่เนื้อหาในฝั่ง PDF **ไม่ได้ถูกแท็กว่าเส้นไหนอยู่เลเยอร์ไหนเลย** (ไม่มี /OC … BDC สักตัว)
     * ข้อมูลนั้นอยู่ในก้อนส่วนตัวของ Adobe ก้อนเดียว ซึ่งเป็นรูปแบบปิด อ่าน/เขียนไม่ได้
     * เราจึงแยกได้แค่ "ของเราเอง (ลาย)" กับ "ของเทมเพลตทั้งก้อน" — และต้องแท็กเองทั้งคู่
     */
    const oc = { art: "", tpl: "" };
    try {
      const mkOcg = (name: string) =>
        doc.context.register(doc.context.obj({ Type: "OCG", Name: PDFHexString.fromText(name) }));
      const artOcg = mkOcg("ลายลูกค้า (iDucky)");
      const tplOcg = mkOcg("เทมเพลต (เส้นตัด/ไกด์)");

      const resources = page.node.Resources();
      let props = resources?.lookup(PDFName.of("Properties"), PDFDict) ?? undefined;
      if (resources && !props) {
        resources.set(PDFName.of("Properties"), doc.context.obj({}));
        props = resources.lookup(PDFName.of("Properties"), PDFDict) ?? undefined;
      }
      if (props) {
        oc.art = "OCArt";
        oc.tpl = "OCTpl";
        props.set(PDFName.of(oc.art), artOcg);
        props.set(PDFName.of(oc.tpl), tplOcg);

        /**
         * เขียน /OCProperties ใหม่ทั้งก้อน — เก็บเฉพาะ 2 เลเยอร์ที่ "มีเนื้อหาแท็กไว้จริง"
         * ชื่อเลเยอร์เดิมที่ประกาศลอย ๆ ไว้แต่ไม่มีเนื้อหาผูก ถ้าปล่อยไว้จะกลายเป็นเลเยอร์ว่างเปล่า
         */
        const list = PDFArray.withContext(doc.context);
        list.push(tplOcg);
        list.push(artOcg);
        const order = PDFArray.withContext(doc.context);
        order.push(tplOcg); // บนสุดในพาเนล = วาดทีหลัง = เทมเพลตทับลาย
        order.push(artOcg);
        const on = PDFArray.withContext(doc.context);
        on.push(tplOcg);
        on.push(artOcg);
        const cfg = doc.context.obj({});
        cfg.set(PDFName.of("Order"), order);
        cfg.set(PDFName.of("ON"), on);
        const ocp = doc.context.obj({});
        ocp.set(PDFName.of("OCGs"), list);
        ocp.set(PDFName.of("D"), cfg);
        doc.catalog.set(PDFName.of("OCProperties"), ocp);
      }
    } catch {
      oc.art = "";
      oc.tpl = ""; // แยกเลเยอร์ไม่ได้ก็ยังได้ไฟล์ที่มีลาย+เทมเพลตครบ
    }

    // วาดเต็มหน้ากระดาษ (ภาพที่ประกอบมามีขนาดเท่ากรอบงานรวมตัดตกอยู่แล้ว)
    const draw = `q\n${box.width.toFixed(3)} 0 0 ${box.height.toFixed(3)} ${box.x.toFixed(3)} ${box.y.toFixed(3)} cm\n/${xName} Do\nQ\n`;
    const artRef = doc.context.register(doc.context.stream(oc.art ? `/OC /${oc.art} BDC\n${draw}EMC\n` : draw));

    /**
     * เรียงเนื้อหาใหม่: [ลาย] [เปิดแท็กเทมเพลต] [เนื้อหาเดิมของเทมเพลต] [ปิดแท็ก]
     * ลายอยู่หน้าสุด = วาดก่อน = อยู่ล่างสุด · เส้นตัด/ไกด์ของเทมเพลตทับอยู่ข้างบนตามเดิม
     * (PDF ต่อสายเนื้อหาทุกก้อนเป็นชิ้นเดียวก่อนตีความ BDC/EMC จึงคร่อมข้ามก้อนได้)
     */
    const contents = page.node.get(PDFName.of("Contents"));
    const next = PDFArray.withContext(doc.context);
    next.push(artRef);
    if (oc.tpl) next.push(doc.context.register(doc.context.stream(`/OC /${oc.tpl} BDC\n`)));
    if (contents instanceof PDFArray) contents.asArray().forEach((r) => next.push(r));
    else if (contents) next.push(contents);
    if (oc.tpl) next.push(doc.context.register(doc.context.stream("EMC\n")));
    page.node.set(PDFName.of("Contents"), next);

    // ตัดข้อมูลส่วนตัวของ Illustrator ทิ้ง (ดูเหตุผลในคอมเมนต์หัวฟังก์ชัน)
    for (const k of ["PieceInfo", "LastModified", "Thumb"]) page.node.delete(PDFName.of(k));

    if (title) doc.setTitle(title);
    doc.setProducer("iDucky Prints Studio");
    const out = await doc.save({ useObjectStreams: false });
    return new Blob([out as BlobPart], { type: "application/postscript" });
  } catch {
    return null;
  }
}

export async function buildPrintAi(input: PrintAiInput): Promise<Blob> {
  const res = await fetch(input.imageUrl);
  if (!res.ok) throw new Error(`โหลดภาพไม่สำเร็จ (${res.status})`);
  const blob = await res.blob();
  const raw = new Uint8Array(await blob.arrayBuffer());

  const info = jpegInfo(raw);
  const img = info ? { bytes: raw, ...info } : await toJpegBytes(blob);

  // มีไฟล์เทมเพลตต้นฉบับ → วางลายลงในไฟล์นั้นเลย (ได้เลเยอร์เส้นตัด/ไกด์มาด้วย)
  if (input.templateUrl) {
    const onTpl = await drawOnTemplate(input.templateUrl, img.bytes, input.title);
    if (onTpl) return onTpl;
  }

  // ภาพขาวดำล้วนใช้ DeviceGray · 4 ช่อง = CMYK · นอกนั้น RGB
  const colorSpace = img.comps === 1 ? "/DeviceGray" : img.comps === 4 ? "/DeviceCMYK" : "/DeviceRGB";

  const pageW = input.widthMm * PT_PER_MM;
  const pageH = input.heightMm * PT_PER_MM;
  const content = `q\n${pageW.toFixed(3)} 0 0 ${pageH.toFixed(3)} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBytes = enc.encode(content);

  const w = new PdfWriter();
  w.push("%PDF-1.5\n%\xE2\xE3\xCF\xD3\n");

  w.startObj(1);
  w.push("<< /Type /Catalog /Pages 2 0 R >>\n");
  w.endObj();

  w.startObj(2);
  w.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n");
  w.endObj();

  w.startObj(3);
  w.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(3)} ${pageH.toFixed(3)}] ` +
      `/TrimBox [0 0 ${pageW.toFixed(3)} ${pageH.toFixed(3)}] ` +
      "/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\n",
  );
  w.endObj();

  w.startObj(4);
  w.push(`<< /Length ${contentBytes.length} >>\nstream\n`);
  w.push(contentBytes);
  w.push("\nendstream\n");
  w.endObj();

  w.startObj(5);
  w.push(
    `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} ` +
      `/ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`,
  );
  w.push(img.bytes);
  w.push("\nendstream\n");
  w.endObj();

  w.startObj(6);
  const title = (input.title ?? "artwork").replace(/[()\\]/g, "");
  w.push(`<< /Title (${title}) /Creator (iDucky Prints Studio) /Producer (iDucky print-ai) >>\n`);
  w.endObj();

  const xrefAt = w.length;
  const count = 7; // object 0 + 1..6
  w.push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) w.push(`${String(w.offsets[i]).padStart(10, "0")} 00000 n \n`);
  w.push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  return w.blob("application/postscript");
}

/** สั่งเบราว์เซอร์ดาวน์โหลด blob เป็นชื่อไฟล์ที่กำหนด */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
