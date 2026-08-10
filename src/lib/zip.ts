/**
 * 🗜 ตัวสร้างไฟล์ ZIP เล็ก ๆ (เก็บแบบไม่บีบอัด)
 *
 * มีไว้แพ็กไฟล์ให้ทีมกราฟฟิกโหลดทีเดียวได้หลายไฟล์ — ไม่ต้องลง dependency เพิ่ม
 * ข้างในเป็น .ai / .png ที่บีบอัดมาแล้วทั้งคู่ บีบซ้ำก็ไม่เล็กลง เลยใช้โหมด "store" พอ
 */

/** ตาราง CRC-32 (มาตรฐาน ZIP) — สร้างครั้งเดียวตอนเรียกใช้ครั้งแรก */
let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** ชื่อไฟล์ในซิป (ภาษาไทยได้ — ตั้งธง UTF-8 ให้แล้ว) */
  name: string;
  data: Uint8Array | string;
}

/** รวมไฟล์เป็น .zip ไฟล์เดียว */
export function makeZip(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder();
  const files = entries.map((e) => ({
    nameBytes: enc.encode(e.name),
    data: typeof e.data === "string" ? enc.encode(e.data) : e.data,
  }));

  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
  const u32 = (v: number) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
  const join = (parts: Uint8Array[]) => {
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };

  for (const f of files) {
    const crc = crc32(f.data);
    // bit 11 = ชื่อไฟล์เป็น UTF-8 · วิธีบีบอัด 0 = store
    const head = join([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(f.data.length),
      u32(f.data.length),
      u16(f.nameBytes.length),
      u16(0),
      f.nameBytes,
    ]);
    chunks.push(head, f.data);
    central.push(
      join([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(f.data.length),
        u32(f.data.length),
        u16(f.nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        f.nameBytes,
      ]),
    );
    offset += head.length + f.data.length;
  }

  const dir = join(central);
  chunks.push(dir);
  chunks.push(join([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(dir.length), u32(offset), u16(0)]));

  return new Blob([join(chunks) as BlobPart], { type: "application/zip" });
}
