#!/usr/bin/env node
/**
 * 🎀🧵 จำลองผ้า Scrunchy (ยางรัดผมผ้าซาติน) → อบทรงเก็บเป็นไฟล์ให้ 3D หน้าเว็บโหลด (components/HairTie3D)
 * (เจ้าของร้านถาม 23 ต.ค. 69 "โมเดลไหนเก่งทำ 3D" → "หาวิธีให้หน่อย" · ไม่มี Blender → จำลองผ้าเองด้วย JS)
 *
 *   node scripts/scrunchy-cloth-sim.mjs            # จำลอง + เขียน public/mock/hair/scrunchy-sim.bin
 *   node scripts/scrunchy-cloth-sim.mjs --seed 5   # สุ่มรอยจีบชุดใหม่
 *
 * ผ้า = ท่อตามเทมเพลตยางมัดผม (ในเส้นเย็บ 9.7 มม.): ยาว 437.8 รอบวง · รอบท่อ 82.2 · กริด 2 มม.
 * จำลองแบบ PBD (position-based dynamics): ระยะห่างจุดผ้าคงที่ (ผ้าไม่ยืด) · ต้านการงอนิด ๆ · กันผ้าทะลุกันเอง
 *   ยางวงในท่อหดจากรอบผ้า (Ø139) เหลือ Ø42 → แกนท่อทุกหน้าตัดถูกดึงเข้าหารัศมียาง (เลื่อนรอบวงได้อิสระ → จีบรวมเป็นก้อนเอง)
 *   ท่อพองด้วยแรงดันอ่อน ๆ (ผ้าซาตินมีตัว) · แรงโน้มถ่วง + พื้น → วางบนโต๊ะ
 * ไฟล์ = หัว 16 ไบต์ (magic "SCR1", NU, NV, scale) + ตำแหน่ง Int16 ×3 ต่อจุด (หน่วย มม. × scale) เรียง i (รอบวง) × j (รอบท่อ)
 *   uv ไม่เก็บ — HairTie3D คิดจาก i/NU, j/NV แบบเดียวกับสูตรเดิม (กลางผืนอยู่ขอบนอกวง · อ่านซ้าย→ขวาจากด้านนอก)
 */
import { mkdirSync, writeFileSync } from "node:fs";

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const SEED = arg("--seed", 3);
const OUT = new URL("../public/mock/hair/scrunchy-sim.bin", import.meta.url).pathname;

// ── ขนาดผ้า (มม.) ──
const CW = 457.2 - 2 * 9.7; // ยาวรอบวง
const CH = 101.6 - 2 * 9.7; // รอบท่อ
const NU = 220;
const NV = 40;
const DU = CW / NU;
const DV = CH / NV;
const R_INIT = CW / (2 * Math.PI);
const R_TUBE = CH / (2 * Math.PI);
const R_ELASTIC = 27; // รัศมียางวงเมื่อหดสุด (แกนท่อ · รูกลางราว Ø24)
const N = NU * NV;

let seed = SEED * 9301 + 49297;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const idx = (i, j) => ((i + NU) % NU) * NV + ((j + NV) % NV);
const x = new Float64Array(N * 3);
const xp = new Float64Array(N * 3);
// ท่อตั้งต้น = ทอรัสรอบผ้าเต็ม (ไม่รูด) · ทิศเดียวกับสูตรใน HairTie3D (φ เริ่มที่ด้านในวง · z กลับด้าน · φ เดินลง)
for (let i = 0; i < NU; i++)
  for (let j = 0; j < NV; j++) {
    const th = (2 * Math.PI * i) / NU;
    const ph = (2 * Math.PI * j) / NV + Math.PI;
    const rad = R_INIT + R_TUBE * Math.cos(ph);
    const k = idx(i, j) * 3;
    x[k] = rad * Math.cos(th) + (rnd() - 0.5) * 0.3;
    x[k + 1] = R_TUBE + 0.5 - R_TUBE * Math.sin(ph) + (rnd() - 0.5) * 0.3;
    x[k + 2] = -rad * Math.sin(th) + (rnd() - 0.5) * 0.3;
  }
xp.set(x);

// ── ข้อจำกัดระยะ: [a, b, ระยะพัก, ความแข็ง] ──
const cons = [];
const addC = (a, b, w) => {
  const dx = x[a * 3] - x[b * 3];
  const dy = x[a * 3 + 1] - x[b * 3 + 1];
  const dz = x[a * 3 + 2] - x[b * 3 + 2];
  // ระยะพักตามยาวผ้าจริง (ไม่ใช่ตอนเริ่ม — รอบในทอรัสสั้นกว่ารอบนอก)
  cons.push(a, b, w);
  return Math.hypot(dx, dy, dz);
};
const rest = [];
for (let i = 0; i < NU; i++)
  for (let j = 0; j < NV; j++) {
    const a = idx(i, j);
    addC(a, idx(i + 1, j), 1); rest.push(DU);
    addC(a, idx(i, j + 1), 1); rest.push(DV);
    addC(a, idx(i + 1, j + 1), 0.6); rest.push(Math.hypot(DU, DV));
    addC(idx(i + 1, j), idx(i, j + 1), 0.6); rest.push(Math.hypot(DU, DV));
    // ต้านงอ (ข้ามหนึ่งจุด) — ซาตินบางนิ่ม จีบได้แต่ไม่ยับเป็นกระดาษ
    addC(a, idx(i + 2, j), 0.3); rest.push(2 * DU);
    addC(a, idx(i, j + 2), 0.3); rest.push(2 * DV);
    // ต้านงอช่วงยาว (ข้าม 4 จุด) — จีบใหญ่นุ่มแบบซาติน ไม่ถี่ยับเป็นกระดาษพับ
    addC(a, idx(i + 4, j), 0.12); rest.push(4 * DU);
    addC(a, idx(i, j + 4), 0.1); rest.push(4 * DV);
  }
const NC = rest.length;

// ── ตารางแฮชกันทะลุ (ตัวเลขล้วน · counting sort ลงช่อง) ──
const CELL = 2.2;
const MIN_D = 1.1;
const TB = 1 << 16;
const MASK = TB - 1;
const cellOf = (ix, iy, iz) => ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) & MASK;
const cStart = new Int32Array(TB + 1);
const cItems = new Int32Array(N);
const pCell = new Int32Array(N);
function collide() {
  cStart.fill(0);
  for (let p = 0; p < N; p++) {
    const h = cellOf(Math.floor(x[p * 3] / CELL), Math.floor(x[p * 3 + 1] / CELL), Math.floor(x[p * 3 + 2] / CELL));
    pCell[p] = h;
    cStart[h + 1]++;
  }
  for (let h = 0; h < TB; h++) cStart[h + 1] += cStart[h];
  const fillAt = cStart.slice(0, TB);
  for (let p = 0; p < N; p++) cItems[fillAt[pCell[p]]++] = p;
  for (let p = 0; p < N; p++) {
    const cx = Math.floor(x[p * 3] / CELL);
    const cy = Math.floor(x[p * 3 + 1] / CELL);
    const cz = Math.floor(x[p * 3 + 2] / CELL);
    const pi = (p / NV) | 0;
    const pj = p % NV;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (let c = -1; c <= 1; c++) {
          const h = cellOf(cx + a, cy + b, cz + c);
          for (let t = cStart[h]; t < cStart[h + 1]; t++) {
            const q = cItems[t];
            if (q <= p) continue;
            const qi = (q / NV) | 0;
            const qj = q % NV;
            let di = Math.abs(pi - qi);
            di = Math.min(di, NU - di);
            let dj = Math.abs(pj - qj);
            dj = Math.min(dj, NV - dj);
            if (di <= 3 && dj <= 3) continue; // เพื่อนบ้านบนผืนเดียวกัน
            const dx = x[q * 3] - x[p * 3];
            const dy = x[q * 3 + 1] - x[p * 3 + 1];
            const dz = x[q * 3 + 2] - x[p * 3 + 2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= MIN_D * MIN_D || d2 < 1e-12) continue;
            const d = Math.sqrt(d2);
            const s = (0.5 * (MIN_D - d)) / d;
            x[p * 3] -= dx * s;
            x[p * 3 + 1] -= dy * s;
            x[p * 3 + 2] -= dz * s;
            x[q * 3] += dx * s;
            x[q * 3 + 1] += dy * s;
            x[q * 3 + 2] += dz * s;
          }
        }
  }
}

const PUFFS = 8;
/** ตำแหน่งแถวผ้าบนวงยาง: รูดไม่เท่ากัน (มีเฟสสุ่มนิด ๆ ให้ก้อนไม่เท่ากันทุกก้อน) · DEN = ความแน่นผ้า 0…1 */
const PH0 = rnd() * 6.283;
const TH = new Float64Array(NU);
const DEN = new Float64Array(NU);
for (let i = 0; i < NU; i++) {
  const u = i / NU;
  const a = 2 * Math.PI * PUFFS * u + 0.5 * Math.sin(2 * Math.PI * 2 * u + PH0);
  TH[i] = 2 * Math.PI * u - (0.55 / PUFFS) * Math.sin(a) - (0.3 / PUFFS) * Math.sin(2 * Math.PI * 3 * u + PH0 * 2) / 3;
  DEN[i] = 0.5 + 0.5 * Math.cos(a); // dθ/di น้อย = ผ้าแน่น
}
const STEPS = 1800;
const ITER = 10;
const G = 0.25 * 9810 * (1 / 600) ** 2; // มม./ขั้น² (เบาลง — ผ้าซาตินมีตัว ท่อไม่ยุบแบนแบบผ้าเปียก)
const DAMP = 0.97;
const t0 = Date.now();
for (let step = 0; step < STEPS; step++) {
  const t = step / STEPS;
  const sm = Math.min(1, t / 0.55);
  const Rt = R_INIT + (R_ELASTIC - R_INIT) * (sm * sm * (3 - 2 * sm));
  // ทำนายตำแหน่ง (Verlet + หน่วง)
  for (let k = 0; k < N * 3; k++) {
    const v = (x[k] - xp[k]) * DAMP;
    xp[k] = x[k];
    x[k] += v;
  }
  for (let p = 0; p < N; p++) x[p * 3 + 1] -= G;
  for (let it = 0; it < ITER; it++) {
    for (let c = 0; c < NC; c++) {
      const a = cons[c * 3];
      const b = cons[c * 3 + 1];
      const w = cons[c * 3 + 2];
      const dx = x[b * 3] - x[a * 3];
      const dy = x[b * 3 + 1] - x[a * 3 + 1];
      const dz = x[b * 3 + 2] - x[a * 3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
      const r0 = rest[c];
      // ด้ายงอ (bend) ต้านเฉพาะการหด ไม่ดึงยืด — ผ้าพับได้ง่าย
      if (w < 0.32 && d > r0) continue;
      const s = (0.5 * w * (d - r0)) / d;
      x[a * 3] += dx * s;
      x[a * 3 + 1] += dy * s;
      x[a * 3 + 2] += dz * s;
      x[b * 3] -= dx * s;
      x[b * 3 + 1] -= dy * s;
      x[b * 3 + 2] -= dz * s;
    }
    // ยางวง: แกนหน้าตัด (จุดกลางวงท่อ) ถูกดึงเข้าหารัศมียาง · แรงดันท่อ: จุดผ้าห่างแกนไม่น้อยกว่า ~0.85 รัศมีท่อ
    for (let i = 0; i < NU; i++) {
      let cx = 0, cy = 0, cz = 0;
      for (let j = 0; j < NV; j++) {
        const k = idx(i, j) * 3;
        cx += x[k];
        cy += x[k + 1];
        cz += x[k + 2];
      }
      cx /= NV;
      cy /= NV;
      cz /= NV;
      // แกนหน้าตัดดึงเข้าหาจุดบนวงยาง (กระจายตามวงเท่า ๆ กันแบบยางที่ผ้ารูดลื่นไปมา) + ความสูงกลางท่อ
      // ผ้ากองไม่เท่ากันตามวง → ก้อนพอง PUFFS ก้อน (ผ้าแน่น = ก้อนใหญ่ · ผ้าบาง = คอด)
      const th = TH[i];
      const tx = Rt * Math.cos(th);
      const tz = -Rt * Math.sin(th);
      const sx = 0.25 * (tx - cx);
      const sz = 0.25 * (tz - cz);
      const sy = 0.08 * (R_TUBE + 2 - cy);
      for (let j = 0; j < NV; j++) {
        const k = idx(i, j) * 3;
        x[k] += sx;
        x[k + 1] += sy;
        x[k + 2] += sz;
        // แรงดันท่อ: ผ้าอยู่ห่างแกนราว 1.15 รัศมีท่อ (ผ้าที่ถูกรูดกองพองออก) · อ่อน ๆ สองทาง ให้จีบ/ย่นได้
        const ox = x[k] - cx - sx;
        const oy = x[k + 1] - cy - sy;
        const oz = x[k + 2] - cz - sz;
        const od = Math.hypot(ox, oy, oz) || 1e-9;
        const want = R_TUBE * (0.8 + 0.55 * DEN[i]);
        const g2 = ((od < want ? 0.1 : 0.03) * (want - od)) / od;
        x[k] += ox * g2;
        x[k + 1] += oy * g2;
        x[k + 2] += oz * g2;
      }
    }
    if (it % 5 === 4) collide();
    for (let p = 0; p < N; p++) if (x[p * 3 + 1] < 0.6) x[p * 3 + 1] = 0.6;
  }
  if (step % 300 === 0) console.log(`  ขั้น ${step}/${STEPS} · รัศมียาง ${Rt.toFixed(1)} · ${((Date.now() - t0) / 1000).toFixed(0)} วิ`);
}

// ── เขียนไฟล์ ──
let minY = Infinity;
for (let p = 0; p < N; p++) minY = Math.min(minY, x[p * 3 + 1]);
const SCALE = 200; // 0.005 มม.
const buf = Buffer.alloc(16 + N * 6);
buf.write("SCR1", 0, "ascii");
buf.writeUInt32LE(NU, 4);
buf.writeUInt32LE(NV, 8);
buf.writeUInt32LE(SCALE, 12);
for (let p = 0; p < N; p++) {
  buf.writeInt16LE(Math.round(x[p * 3] * SCALE), 16 + p * 6);
  buf.writeInt16LE(Math.round((x[p * 3 + 1] - minY) * SCALE), 16 + p * 6 + 2);
  buf.writeInt16LE(Math.round(x[p * 3 + 2] * SCALE), 16 + p * 6 + 4);
}
mkdirSync(new URL("../public/mock/hair/", import.meta.url).pathname, { recursive: true });
writeFileSync(OUT, buf);
let maxR = 0, maxY = 0;
for (let p = 0; p < N; p++) {
  maxR = Math.max(maxR, Math.hypot(x[p * 3], x[p * 3 + 2]));
  maxY = Math.max(maxY, x[p * 3 + 1] - minY);
}
console.log(`✅ ${OUT} · ${(buf.length / 1024).toFixed(0)} KB · วงนอก Ø${(2 * maxR).toFixed(0)} มม. สูง ${maxY.toFixed(0)} มม. · ${((Date.now() - t0) / 1000).toFixed(0)} วิ`);
