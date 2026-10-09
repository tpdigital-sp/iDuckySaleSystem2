/**
 * 🗜 อ่านไฟล์ zip ในเบราว์เซอร์โดยไม่ต้องใช้ไลบรารี — central directory + DecompressionStream("deflate-raw")
 * (zip จาก LINE OA Manager ใหญ่ได้เป็นร้อย MB เกิน 4.5MB ที่ Netlify รับ จึงต้องอ่านฝั่งเครื่องผู้ใช้ · 9 ต.ค. 69)
 * รองรับ method 0 (เก็บเฉย ๆ) และ 8 (deflate) · zip64 (ไฟล์เกิน 65,535 รายการ/4GB) · ชื่อไฟล์ถอดเป็น UTF-8 เสมอ
 */
export type ZipEntry = { name: string; size: number; read: () => Promise<Uint8Array> };

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOC = 0x07064b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

async function slice(file: Blob, a: number, b: number): Promise<DataView> {
  return new DataView(await file.slice(a, Math.min(b, file.size)).arrayBuffer());
}
const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true));

export async function readZip(file: Blob): Promise<ZipEntry[]> {
  const tailLen = Math.min(file.size, 65_557);
  const tailStart = file.size - tailLen;
  const tail = await slice(file, tailStart, file.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ไม่ใช่ไฟล์ zip (หา end-of-central-directory ไม่เจอ)");
  let count = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOff = tail.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
    const loc = eocd - 20;
    if (loc >= 0 && tail.getUint32(loc, true) === SIG_EOCD64_LOC) {
      const rec64 = u64(tail, loc + 8);
      const r = await slice(file, rec64, rec64 + 56);
      if (r.getUint32(0, true) !== SIG_EOCD64) throw new Error("zip64 record เสีย");
      count = u64(r, 32);
      cdSize = u64(r, 40);
      cdOff = u64(r, 48);
    }
  }
  const cd = await slice(file, cdOff, cdOff + cdSize);
  const dec = new TextDecoder("utf-8");
  const out: ZipEntry[] = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.byteLength; i++) {
    if (cd.getUint32(p, true) !== SIG_CEN) break;
    const method = cd.getUint16(p + 10, true);
    let compSize = cd.getUint32(p + 20, true);
    let size = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    let off = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    // zip64 extra (id 0x0001): ค่าที่เป็น 0xFFFFFFFF ถูกย้ายมาเก็บที่นี่ตามลำดับ uncomp, comp, offset
    let e = p + 46 + nameLen;
    const eEnd = e + extraLen;
    while (e + 4 <= eEnd) {
      const id = cd.getUint16(e, true);
      const len = cd.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) {
          size = u64(cd, q);
          q += 8;
        }
        if (compSize === 0xffffffff) {
          compSize = u64(cd, q);
          q += 8;
        }
        if (off === 0xffffffff) off = u64(cd, q);
      }
      e += 4 + len;
    }
    const isDir = name.endsWith("/");
    if (!isDir) {
      const localOff = off;
      const cs = compSize;
      out.push({
        name,
        size,
        read: async () => {
          const lh = await slice(file, localOff, localOff + 30);
          if (lh.getUint32(0, true) !== SIG_LOC) throw new Error(`local header เสีย: ${name}`);
          const dataStart = localOff + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
          const raw = new Uint8Array(await file.slice(dataStart, dataStart + cs).arrayBuffer());
          if (method === 0) return raw;
          if (method !== 8) throw new Error(`วิธีบีบอัด ${method} ไม่รองรับ: ${name}`);
          const ds = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
          return new Uint8Array(await new Response(ds).arrayBuffer());
        },
      });
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
