"use client";

/**
 * 🎀🧊 โมเดล 3D ผ้าผูกผม (scarf) + Scrunchy ยางรัดผม (scrunchy) — ลายที่ลูกค้าออกแบบบนผ้าซาตินจริง ให้เห็นก่อนสั่ง
 * (เจ้าของร้านสั่ง 23 ต.ค. 69 "ช่วยทำ 3D ให้หน่อย")
 *
 * three.js โหลดตอนกดปุ่มเท่านั้น (import()) · โครงเดียวกับ ClipPouch3D (ลาก=หมุน · ล้อ/หยิก=ซูม · ปุ่มมุมมอง)
 * ผ้าผูกผม: ผืนพับครึ่งตามยาว = ริบบิ้นทรงสี่เหลี่ยมด้านขนาน (ปลายตัดเฉียงทั้งคู่) ยาว ~1 ม. ตรงเส้นเดียวตั้งตามยาว
 *   ด้าน A (หน้า) = ครึ่งบนของผืน · ด้าน B (หลัง) = ครึ่งล่าง (จุดเดียวกันบนผ้า = ผืน (x, H − y))
 *   ขอบเย็บ = สีไหมที่เลือก · (รอบแรกวางตัว S บนโต๊ะ — เจ้าของร้านส่งรูปจริง 23 ต.ค. 69 "ต้องการให้เหมือนของจริง")
 * Scrunchy: ผืนเย็บเป็นท่อ (รอบท่อ = ความสูงผืนในเส้นเย็บ) รูดบนยางวง → พองเป็นก้อนใหญ่ คอดลึก ลายต่อเนื่องตามผืน
 *   (รอบแรกจีบถี่เท่า ๆ กัน ผิวซ้อนกันจนลายดูขาด — เจ้าของร้านทัก "มันควรตรงกัน")
 * โซน/ขนาดวัดจากไฟล์ร้าน ดู lib/hair-mock
 */

import { useEffect, useRef, useState } from "react";
import ScrunchyPhoto from "@/components/ScrunchyPhoto";
import { HAIR_STYLE_TH, HAIR_VIEW_TH, SCARF_INSET_MM, SCARF_TIP_MM, SCRUNCHY_SEAM_MM, type HairMock, type HairView } from "@/lib/hair-mock";

/** มุมกล้อง — yaw รอบแกนตั้ง (ด้านหน้าหันไป +z) · pitch ก้ม/เงย (บวก = มองจากบน) */
const VIEW_CAM: Record<HairMock["style"], Partial<Record<HairView, { yaw: number; pitch: number }>>> = {
  // ผ้าผูกผมเส้นตรงตั้งตามยาว: หน้า = ด้าน A · หลัง = ด้าน B
  scarf: { front: { yaw: 0, pitch: 0.08 }, back: { yaw: Math.PI, pitch: 0.08 }, top: { yaw: 0, pitch: 1.1 } },
  scrunchy: { front: { yaw: 0, pitch: 0.5 }, side: { yaw: 0, pitch: 0.12 }, top: { yaw: 0, pitch: 1.3 } },
};
const PITCH_MAX = 1.35;

/**
 * ผิวซาตินเครป (normalMap ต่อกันไร้รอยต่อ) — ผิวย่นเป็นเกล็ดเล็ก ๆ ทั่วผืนแบบผ้าในรูปสินค้า
 * ความสูง = value noise ต่อขอบ (wrap) แบบสันเขา (ridged) 3 ชั้น ยืดตามแนวเส้นด้ายนิด ๆ → แปลงเป็น normal
 * (รอบแรก bumpMap จุดเบลอขนาด ~0.2 มม. ละเอียดเกินจนมองไม่เห็น — เจ้าของร้านส่งรูป "อยากได้ texture แบบในภาพ")
 */
function crepeNormalCanvas(): HTMLCanvasElement {
  const N = 256;
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const layer = (gx: number, gy: number) => {
    const g = Array.from({ length: gx * gy }, rnd);
    return (x: number, y: number) => {
      const fx = (x / N) * gx;
      const fy = (y / N) * gy;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const v = (i: number, j: number) => g[(((j % gy) + gy) % gy) * gx + (((i % gx) + gx) % gx)];
      const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
      const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
      return a + (b - a) * sy;
    };
  };
  // ริ้วซาตินแปรงขน: ยาวตามแนวผ้า (x) สั้นตามขวาง (y) แบบผิวผ้าในรูปสินค้า — ไม่ใช่เกล็ดกลมเปลือกส้ม
  const L = [layer(6, 40), layer(12, 80), layer(24, 128)];
  const W8 = [0.55, 0.3, 0.15];
  const hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let h = 0;
      for (let k = 0; k < 3; k++) h += W8[k] * (1 - Math.abs(2 * L[k](x, y) - 1));
      hgt[y * N + x] = h;
    }
  const cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;
  const img = ctx.createImageData(N, N);
  const H = (x: number, y: number) => hgt[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
  const STR = 5;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const nx = -(H(x + 1, y) - H(x - 1, y)) * STR;
      const ny = -(H(x, y + 1) - H(x, y - 1)) * STR;
      const l = Math.hypot(nx, ny, 1);
      const o = (y * N + x) * 4;
      img.data[o] = Math.round(((nx / l) * 0.5 + 0.5) * 255);
      img.data[o + 1] = Math.round(((ny / l) * 0.5 + 0.5) * 255);
      img.data[o + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255);
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** Scrunchy 6 มุม + ผ้าผูกผม 4 มุม = ภาพ 2D บนรูปผ้าจริง (components/ScrunchyPhoto · เจ้าของร้าน 23 ต.ค. 69 "ทำเป็นภาพ 2D แทน") */
export default function HairTie3D(props: Parameters<typeof HairRibbon3D>[0]) {
  // ผ้าผูกผมก็เป็นภาพ 2D บนรูปผ้าขาวจริงแล้ว (เจ้าของร้านส่งรูป 23 ต.ค. 69) — HairRibbon3D เก็บไว้เผื่อกลับมาใช้
  return <ScrunchyPhoto {...props} />;
}

function HairRibbon3D({
  sheet,
  sheetMm,
  mock,
  title,
  onClose,
}: {
  /** ลายทั้งอาร์ตบอร์ด (วาดจากตัววาดจริงของจอออกแบบ) */
  sheet: HTMLCanvasElement;
  sheetMm: { w: number; h: number };
  mock: HairMock;
  title: string;
  onClose: () => void;
}) {
  const scarf = mock.style === "scarf";
  const views = Object.keys(VIEW_CAM[mock.style]) as HairView[];
  const boxRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [spin, setSpin] = useState(false);
  const [view, setView] = useState<HairView>("front");
  const [zoom, setZoomState] = useState(1);
  const clampZ = (z: number) => Math.max(0.6, Math.min(3.5, z));
  const cam = useRef({ yaw: scarf ? 0.12 : 0.32, pitch: scarf ? 0.1 : 0.5, zoom: 1, targetYaw: null as number | null, targetPitch: null as number | null, spin: false, dragging: false });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const setZoom = (fn: (z: number) => number) => {
    const z = clampZ(fn(cam.current.zoom));
    cam.current.zoom = z;
    setZoomState(z);
  };
  const goView = (v: HairView) => {
    const c = VIEW_CAM[mock.style][v];
    if (!c) return;
    setView(v);
    const cur = cam.current.yaw;
    let t = c.yaw;
    while (t - cur > Math.PI) t -= 2 * Math.PI;
    while (t - cur < -Math.PI) t += 2 * Math.PI;
    cam.current.targetYaw = t;
    cam.current.targetPitch = c.pitch;
    cam.current.spin = false;
    setSpin(false);
  };
  useEffect(() => {
    cam.current.spin = spin;
  }, [spin]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let dead = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      try {
        const THREE = await import("three");
        const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
        if (dead) return;
        const W = sheetMm.w;
        const H = sheetMm.h;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.NeutralToneMapping;
        renderer.toneMappingExposure = 1.2;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";
        box.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        const envTex = pmrem.fromScene(room, 0.04).texture;
        room.dispose();
        scene.environment = envTex;
        // Scrunchy: แสงสะท้อนรอบตัวแรงขึ้น → ประกายซาตินเป็นแถบสว่างตามโค้งก้อน (แบบรูปสินค้า)
        scene.environmentIntensity = scarf ? 0.3 : 0.5;

        const geos: { dispose(): void }[] = [];
        const mats: { dispose(): void }[] = [];
        const g = <T extends { dispose(): void }>(x: T) => (geos.push(x), x);
        const m = <T extends { dispose(): void }>(x: T) => (mats.push(x), x);

        /**
         * 🎨 ผ้าซาติน — สีลายเรืองเอง SELF + รับแสง LIT × แสงรวม (สูตรเดียวกับกระเป๋าต๊อบแต๊บที่วัดสีบนจอแล้ว)
         * ด้านหันหากล้อง ≈ สีลายที่ออกแบบ · ด้านเฉียง/จีบย่นมืดลงตามแสง + สีจุดยอด
         */
        // ผ้าผูกผม/Scrunchy เรืองเองน้อยกว่ากระเป๋า ให้เห็นเงาไล่ตามโค้งผ้า + ประกายซาติน (เรืองมากดูแบนเป็นสติกเกอร์)
        // 🧵 ซาตินเครปแบบรูปสินค้า: แสงจริงต้องทำงาน (เงาก้อน + ประกายเป็นแถบ) → เรืองเองน้อยลง รับแสงมากขึ้น
        const SELF = scarf ? 0.36 : 0.3;
        const LIT = 0.86;
        const tex = new THREE.CanvasTexture(sheet);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        mats.push(tex);
        const crepe = new THREE.CanvasTexture(crepeNormalCanvas());
        crepe.wrapS = crepe.wrapT = THREE.RepeatWrapping;
        crepe.anisotropy = renderer.capabilities.getMaxAnisotropy();
        // 1 แผ่นลาย = 11 มม. ของผ้า → เกล็ดย่น ~0.2–0.8 มม. (22 มม. + แรง 0.28 = หยาบเป็นเปลือกส้ม — เจ้าของร้านทัก)
        crepe.repeat.set(W / 11, H / 11);
        mats.push(crepe);
        const satin = m(
          new THREE.MeshPhysicalMaterial({
            map: tex,
            color: new THREE.Color(LIT, LIT, LIT),
            emissiveMap: tex,
            emissive: new THREE.Color(0xffffff),
            emissiveIntensity: SELF,
            toneMapped: false,
            metalness: 0,
            roughness: 0.2,
            specularIntensity: 1,
            // ประกายซาติน: เคลือบเงาบาง ๆ ให้แสงสะท้อนเป็นแถบสว่างตามโค้งก้อนผ้า (แบบรูปสินค้า)
            clearcoat: 0.55,
            clearcoatRoughness: 0.16,
            sheen: 0.7,
            sheenRoughness: 0.3,
            sheenColor: new THREE.Color(0xb8b8b8),
            envMapIntensity: 2.6,
            // ผิวซาตินเครป — ประกายแตกเป็นเกล็ดเล็ก ๆ ไม่เรียบเป็นพลาสติก/ลูกโป่ง
            normalMap: crepe,
            normalScale: new THREE.Vector2(0.12, 0.12),
            clearcoatNormalMap: crepe,
            clearcoatNormalScale: new THREE.Vector2(0.22, 0.22),
            vertexColors: true,
            side: THREE.DoubleSide,
          }),
        );

        /** ตาข่ายผิว (กริด nu × nv) จากฟังก์ชันจุด → ตำแหน่ง/uv/เฉดสี */
        const gridMesh = (nu: number, nv: number, at: (i: number, j: number) => { p: [number, number, number]; uv: [number, number]; shade: number }, mat: InstanceType<typeof THREE.Material>) => {
          const pos: number[] = [];
          const uv: number[] = [];
          const col: number[] = [];
          const idx: number[] = [];
          for (let i = 0; i <= nu; i++)
            for (let j = 0; j <= nv; j++) {
              const q = at(i, j);
              pos.push(...q.p);
              uv.push(...q.uv);
              col.push(q.shade, q.shade, q.shade);
            }
          for (let i = 0; i < nu; i++)
            for (let j = 0; j < nv; j++) {
              const a = i * (nv + 1) + j;
              const b = a + nv + 1;
              idx.push(a, b, a + 1, a + 1, b, b + 1);
            }
          const geo = g(new THREE.BufferGeometry());
          geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
          geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
          geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
          geo.setIndex(idx);
          geo.computeVertexNormals();
          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = true;
          return mesh;
        };

        const root = new THREE.Group();
        scene.add(root);
        /** รัศมีฉาก (มม.) — ตั้งกล้อง/เงา */
        let extent: number;
        let lookY: number;

        if (scarf) {
          // ── ผ้าผูกผม: ริบบิ้นตรงเส้นเดียว ตั้งตามยาว (เจ้าของร้านสั่ง 23 ต.ค. 69 "3D ทำเป็นเส้นตรงๆไปเลย") ──
          //   มองหน้า = ด้าน A (ครึ่งบนผืน) · หมุนไปหลัง = ด้าน B (ครึ่งล่างผืน · เห็นกลับหัวตามการพับ) · ปลายตัดเฉียงตามเส้นตัด
          //   (รอบก่อน ๆ: ตัว S / แขวนราว / วางพับตัว V — ไม่เอา)
          const I = SCARF_INSET_MM;
          const T = Math.min(SCARF_TIP_MM, (W - 2 * I) * 0.2);
          const HW = (H - 2 * I) / 2; // กว้างหลังพับครึ่ง
          const L0 = W - 2 * I - T; // ความยาวขอบเย็บ (ขอบบนผืน)
          const LP = W - 2 * I; // ความยาวตามแนวกลางทั้งหมด (รวมปลายเฉียง)
          const OFF = 0.45; // ครึ่งความหนาผ้า 2 ชั้น
          const LIFT = 18; // ลอยเหนือพื้นนิด ๆ ให้มีเงาใต้ผ้า
          /** จุดบนผ้า (s ตามยาว · h ข้ามกว้าง) → ตำแหน่ง 3D (ผืนตั้งในระนาบ xy หันหน้าไป +z) + ทิศตั้งฉากด้าน A */
          const place = (s: number, h: number) => ({
            p: [s - LP / 2, LIFT + HW / 2 - h, 0] as [number, number, number],
            nA: [0, 0, 1] as [number, number, number],
          });
          const NI = 640;
          const NW = 16;
          const at = (face: 1 | -1) => (i: number, j: number) => {
            const w = j / NW;
            const s = T * w + (L0 * i) / NI;
            const h = (w - 0.5) * HW;
            const pl = place(s, h);
            const o = face * OFF;
            const ySheet = I + w * HW;
            return {
              p: [pl.p[0] + pl.nA[0] * o, pl.p[1] + pl.nA[1] * o, pl.p[2] + pl.nA[2] * o] as [number, number, number],
              uv: [(I + s) / W, 1 - (face === 1 ? ySheet : H - ySheet) / H] as [number, number],
              shade: 0.92 + 0.08 * Math.sin(Math.PI * w),
            };
          };
          const fA = gridMesh(NI, NW, at(1), satin);
          const fB = gridMesh(NI, NW, at(-1), satin);
          fA.receiveShadow = fB.receiveShadow = true;
          root.add(fA, fB);
          // 🧵 ขอบเย็บ (ตะเข็บรวมขอบผ้า 2 ชั้น ด้าน w = 0) = สีไหมที่เลือก
          const threadMat = m(new THREE.MeshStandardMaterial({ color: mock.thread, roughness: 0.55, side: THREE.DoubleSide }));
          root.add(
            gridMesh(
              NI,
              1,
              (i, j) => {
                const pl = place((L0 * i) / NI, -HW / 2 - 0.2);
                const o = (j ? -1 : 1) * (OFF + 0.15);
                return { p: [pl.p[0] + pl.nA[0] * o, pl.p[1] + pl.nA[1] * o, pl.p[2] + pl.nA[2] * o], uv: [0, 0], shade: 1 };
              },
              threadMat,
            ),
          );
          // จัดกึ่งกลางฉาก
          const box = new THREE.Box3().setFromObject(root);
          const ctr = box.getCenter(new THREE.Vector3());
          root.position.x = -ctr.x;
          root.position.z = -ctr.z;
          const sz = box.getSize(new THREE.Vector3());
          extent = sz.x * 0.5 + 20;
          lookY = ctr.y;
        } else {
          // ── Scrunchy: ท่อผ้ารูดบนยางวง = พองเป็นก้อนใหญ่ ~7 ก้อน คอดลึกระหว่างก้อน (แบบรูปสินค้าจริง) ──
          //   ผ้ายาวกว่าวงยางราว 2 เท่า → ก้อนพองกินผ้ามาก · ตรงคอดผ้าถูกรูดแน่นมีรอยย่นตามแนวท่อ
          //   ลายวิ่งต่อเนื่องตามผืน (ระยะผ้าสะสม) · รอยต่อปลายผืน (เย็บต่อกัน) ซ่อนอยู่ในคอดที่ θ = 0
          const S = SCRUNCHY_SEAM_MM;
          const CW = W - 2 * S; // ความยาวผ้าในเส้นเย็บ (วิ่งรอบวง)
          const CHt = H - 2 * S; // รอบท่อ
          const r = CHt / (2 * Math.PI); // รัศมีท่อเมื่อไม่ถูกรูด
          const R0 = r + 20; // รัศมีกลางท่อ — ก้อนอวบล้นเข้ารูกลาง เหลือรูราว 1/5 ของวง (แบบรูปสินค้า)
          const M = 5; // จำนวนก้อนพอง (รูปสินค้า 5 ก้อนใหญ่ — 8 ก้อนดูเป็นกลีบดอกไม้)
          const NT = 900;
          const NP = 72;
          /** มุมก้อน ψ(θ): ไม่เท่ากันทุกก้อน (ไม่ลดลง — อนุพันธ์ M ± 2.25 > 0) · ψ(0) = 0 = คอด */
          const psi = (th: number) => M * th + 0.6 * Math.sin(2 * th) + 0.35 * Math.sin(3 * th + 1.9) - 0.35 * Math.sin(1.9);
          /** 0 = คอด · 1 = กลางก้อน */
          const puffOf = (th: number) => 1 - Math.pow(1 - (1 - Math.cos(psi(th))) / 2, 2.4); // ก้อนกว้าง · คอดโค้งนุ่ม (ไม่บากเป็นตัว V)
          // ระยะผ้าสะสมตามรอบวง: ก้อนพองกินผ้ามากกว่าคอด → ลายยืดบนก้อน หดในคอด (แบบผ้าที่ถูกรูดจริง)
          const cum = new Float64Array(NT + 1);
          for (let i = 1; i <= NT; i++) {
            const th = (2 * Math.PI * (i - 0.5)) / NT;
            cum[i] = cum[i - 1] + 0.3 + puffOf(th);
          }
          const at = (i: number, j: number) => {
            const th = (2 * Math.PI * i) / NT;
            const q = puffOf(th);
            const ps = psi(th);
            const pin = 1 - q;
            // กลางผืน (แนวสูง) อยู่ที่ขอบนอกวง — ส่วนที่คนเห็นมากสุด · ขอบเย็บยาว (ขอบบน/ล่างผืน) ไปบรรจบด้านในวง
            const ph = (2 * Math.PI * j) / NP + Math.PI;
            // ก้อนพองเอียงสลับนิด ๆ (หน้าตัดหมุน) + ขนาดแต่ละก้อนไม่เท่ากัน
            const phT = ph + 0.08 * Math.sin(ps) * (0.4 + 0.6 * q);
            const size = 1 + 0.13 * Math.sin(2 * th + 1.1) + 0.07 * Math.sin(5 * th + 0.3);
            // รอยย่นตามแนวท่อ: แรงสุดตรงคอด จาง ๆ บนก้อน
            //   + รอยย่นเฉียงบนก้อน (ผ้ากองตัวพาดข้ามท่อ) แบบรูปจริง
            //   ตรงคอด: จีบพับรวมเข้าหากันเป็นพัด (สันจีบตามแนวท่อ ลึกสุดที่คอด จางออกไปกลางก้อน) — แบบรูปสินค้าจริง
            //   จีบลามเข้าไปในก้อน (จางลง) + รอยพับใหญ่เฉียงบนก้อน 1–2 รอย (ผ้าไม่ตึงเป็นลูกโป่ง)
            const fan = Math.pow(pin, 0.9);
            const fold = Math.sin(2 * phT + 1.7 * ps + 0.4 * Math.sin(3 * th));
            const wr =
              (0.085 * fan + 0.006) * Math.sin(5 * phT + 1.3 * ps) +
              0.018 * fan * Math.sin(9 * phT - 2.1 * ps + 0.5) +
              0.045 * q * fold +
              0.012 * q * Math.sin(4 * phT - 2.6 * ps + 1.2);
            // รอยพับผ้าบนก้อน: ร่องแคบคม ๆ วิ่งเฉียงไหลเข้าหาคอด 1–2 เส้นต่อก้อน บนผิวที่เรียบตึง (แบบผ้าซาตินในรูปสินค้า)
            const crease = Math.pow(1 - Math.abs(Math.sin(1.4 * phT + 0.85 * ps + 0.7 * Math.sin(2 * ps + th))), 5) * q;
            const rr = r * size * (0.74 + 0.76 * q + wr - 0.1 * crease);
            const rc = R0 + 1.4 * Math.sin(2 * th + 0.4);
            const rad = rc + rr * Math.cos(phT);
            const yc = rr * 1.1 + 0.6 * Math.sin(3 * th); // ก้อนตั้งสูงกว่ากว้าง (ผ้าที่รูดดันตัวขึ้น แบบรูปสินค้า)
            return {
              // ทิศลาย: ด้านนอกวงมองจากหน้า = ผืนอ่านซ้าย→ขวา หัวขึ้น (z กลับด้าน + φ เดินลงจากขอบนอก)
              p: [rad * Math.cos(th), yc - rr * 1.1 * Math.sin(phT), -rad * Math.sin(th)] as [number, number, number],
              uv: [(S + (CW * cum[i]) / cum[NT]) / W, 1 - (S + (CHt * j) / NP) / H] as [number, number],
              // ร่องคอด/ร่องย่นมืดลง (ผ้าซ้อนบังแสง)
              shade: (0.66 + 0.34 * Math.pow(q, 0.6)) * (1 - 0.14 * fan * (0.5 + 0.5 * Math.sin(5 * phT + 1.3 * ps))) * (1 - 0.1 * q * Math.max(0, -fold)) * (1 - 0.3 * crease),
            };
          };
          // (ลองทรงจากการจำลองผ้า PBD แล้ว 23 ต.ค. 69 — ผ้าบิดเป็นเกลียว ลายแถบบิดตาม กลีบแหว่ง เจ้าของร้านว่า "แย่หนักกว่าเดิม" → ใช้ทรงสูตรนี้)
          root.add(gridMesh(NT, NP, at, satin));
          extent = R0 + r * 1.4;
          lookY = r * 0.8;
        }

        const ground = new THREE.Mesh(g(new THREE.PlaneGeometry(extent * 12, extent * 12)), m(new THREE.ShadowMaterial({ opacity: 0.18 })));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const camera = new THREE.PerspectiveCamera(28, 1, Math.max(1, extent * 0.02), extent * 40);
        const BASE_DIST = extent * (scarf ? 2.95 : 4.3);
        const sun = new THREE.DirectionalLight(0xffffff, 0.95);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const sh = extent * 1.5;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -sh;
        sun.shadow.camera.right = sun.shadow.camera.top = sh;
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = extent * 20;
        sun.shadow.bias = -0.0005;
        sun.shadow.radius = 8;
        scene.add(sun);
        scene.add(new THREE.AmbientLight(0xffffff, 0.3));
        const fill = new THREE.DirectionalLight(0xffffff, 0.3);
        scene.add(fill);

        const place = () => {
          const w = box.clientWidth || 1;
          const h = box.clientHeight || 1;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        place();
        const ro = new ResizeObserver(place);
        ro.observe(box);

        let raf = 0;
        let last = performance.now();
        const tick = (now: number) => {
          raf = requestAnimationFrame(tick);
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          const c = cam.current;
          if (c.targetYaw != null) {
            const d = c.targetYaw - c.yaw;
            if (Math.abs(d) < 0.004) {
              c.yaw = c.targetYaw;
              c.targetYaw = null;
            } else c.yaw += d * Math.min(1, dt * 7);
          } else if (c.spin && !c.dragging) c.yaw += dt * 0.55;
          if (c.targetPitch != null) {
            const d = c.targetPitch - c.pitch;
            if (Math.abs(d) < 0.004) {
              c.pitch = c.targetPitch;
              c.targetPitch = null;
            } else c.pitch += d * Math.min(1, dt * 7);
          }
          // ผืนยาวจอแคบ: ถอยกล้องตามสัดส่วนจอ ให้ทั้งตัว S อยู่ในกรอบ
          const dist = (BASE_DIST / c.zoom) * Math.max(1, 1.5 / Math.max(0.3, camera.aspect));
          const cp2 = Math.cos(c.pitch);
          camera.position.set(dist * Math.sin(c.yaw) * cp2, dist * Math.sin(c.pitch) + lookY, dist * Math.cos(c.yaw) * cp2);
          camera.lookAt(0, lookY, 0);
          fill.position.copy(camera.position);
          fill.target.position.set(0, lookY, 0);
          fill.target.updateMatrixWorld();
          sun.position.set(camera.position.x, 0, camera.position.z).normalize().multiplyScalar(BASE_DIST * 1.1);
          sun.position.y = BASE_DIST * 0.9;
          sun.position.x += BASE_DIST * 0.25 * Math.cos(c.yaw);
          sun.position.z -= BASE_DIST * 0.25 * Math.sin(c.yaw);
          renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(tick);
        setStatus("ready");

        cleanup = () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          geos.forEach((x) => x.dispose());
          mats.forEach((x) => x.dispose());
          envTex.dispose();
          pmrem.dispose();
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
        };
        if (dead) cleanup();
      } catch (e) {
        console.error("HairTie3D", e);
        if (!dead) setStatus("error");
      }
    })();
    return () => {
      dead = true;
      cleanup?.();
    };
    // สร้างฉากครั้งเดียวต่อการเปิด
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-900/55 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div className="relative flex w-full max-w-3xl flex-col rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-lg shadow-[0_4px_12px_rgba(139,92,246,.35)]">
            🎀
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold leading-tight text-stone-800">
              <span className="shrink-0">ดูแบบ 3D</span>
              <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-stone-700 ring-1 ring-sky-200">
                <span className="truncate">{HAIR_STYLE_TH[mock.style]}</span>
                {mock.label ? <span className="truncate text-stone-400">· {mock.label}</span> : null}
              </span>
            </p>
            <p className="truncate text-xs text-stone-500">
              {title} · ผ้าซาติน{scarf && mock.threadName ? ` · ไหม${mock.threadName}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>

        <div
          ref={boxRef}
          className="relative mx-3 h-[min(60vh,500px)] cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_50%_38%,#f8fafc_0%,#e2e8f0_55%,#cbd5e1_100%)] ring-1 ring-stone-200/70 active:cursor-grabbing"
          onWheel={(e) => setZoom((z) => z * Math.exp(-e.deltaY * 0.0015))}
          onDoubleClick={() => setZoom((z) => (z > 1.05 ? 1 : 2))}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pts.current.size === 2) {
              const [a, b] = [...pts.current.values()];
              pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.current.zoom };
              drag.current = null;
              cam.current.dragging = false;
              return;
            }
            drag.current = { x: e.clientX, y: e.clientY, yaw: cam.current.yaw, pitch: cam.current.pitch };
            cam.current.targetYaw = null;
            cam.current.targetPitch = null;
            cam.current.dragging = true;
          }}
          onPointerMove={(e) => {
            if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pinch.current && pts.current.size === 2) {
              const [a, b] = [...pts.current.values()];
              const p = pinch.current;
              setZoom(() => (p.z * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, p.d));
              return;
            }
            const d = drag.current;
            if (!d) return;
            cam.current.yaw = d.yaw + (e.clientX - d.x) * 0.011;
            cam.current.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, d.pitch + (e.clientY - d.y) * 0.006));
          }}
          onPointerUp={(e) => {
            pts.current.delete(e.pointerId);
            if (pts.current.size < 2) pinch.current = null;
            drag.current = null;
            cam.current.dragging = false;
          }}
          onPointerCancel={(e) => {
            pts.current.delete(e.pointerId);
            pinch.current = null;
            drag.current = null;
            cam.current.dragging = false;
          }}
        >
          {status !== "ready" && (
            <div className="absolute inset-0 z-20 grid place-items-center">
              {status === "loading" ? (
                <div className="flex flex-col items-center gap-2 text-stone-500">
                  <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-violet-200 border-t-violet-600" />
                  <span className="text-xs font-bold">กำลังสร้างโมเดล 3D…</span>
                </div>
              ) : (
                <p className="max-w-xs rounded-2xl bg-white/90 p-4 text-center text-xs font-bold text-rose-600 ring-1 ring-rose-200">
                  เบราว์เซอร์นี้แสดงภาพ 3D ไม่ได้ (ต้องรองรับ WebGL) — ลองเปิดใน Chrome/Safari รุ่นใหม่
                </p>
              )}
            </div>
          )}
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-170px)] items-center gap-2 rounded-full bg-white/90 py-1.5 pl-1.5 pr-3.5 shadow-sm ring-1 ring-stone-200 backdrop-blur">
            <span className="whitespace-nowrap rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-extrabold text-white">🎀 ผ้าซาติน</span>
            <span className="truncate text-xs font-bold text-stone-700">{spin ? "หมุนโชว์รอบตัว" : HAIR_VIEW_TH[view]}</span>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full bg-stone-900/70 px-3.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur">
            <span className="hidden sm:inline">↔ ลาก = หมุนดูรอบตัว</span>
            <span className="sm:hidden">↔ หมุน</span>
            <span className="h-3 w-px bg-white/30" />
            <span className="hidden sm:inline">↕ ลาก = เงย/ก้ม</span>
            <span className="sm:hidden">↕ เงย/ก้ม</span>
            <span className="h-3 w-px bg-white/30" />
            <span className="hidden sm:inline">🔍 ล้อเมาส์/หยิก = ซูม</span>
            <span className="sm:hidden">🔍 หยิก = ซูม</span>
          </div>
          <div
            className="absolute right-3 top-3 z-10 flex items-center rounded-full bg-white/90 p-0.5 shadow-sm ring-1 ring-stone-200 backdrop-blur"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => setZoom((z) => z / 1.25)} className="grid h-8 w-8 place-items-center rounded-full text-lg font-bold text-stone-600 hover:bg-stone-100" aria-label="ซูมออก">
              −
            </button>
            <button type="button" onClick={() => setZoom(() => 1)} className="min-w-[52px] rounded-full px-1 text-xs font-extrabold text-stone-700 hover:bg-stone-100" title="กลับขนาดปกติ">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" onClick={() => setZoom((z) => z * 1.25)} className="grid h-8 w-8 place-items-center rounded-full text-lg font-bold text-stone-600 hover:bg-stone-100" aria-label="ซูมเข้า">
              +
            </button>
          </div>
        </div>

        <div className="space-y-2.5 px-4 pb-4 pt-3">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <span className="flex items-center rounded-full bg-stone-100 p-0.5 ring-1 ring-stone-200/70" role="radiogroup" aria-label="มุมมอง">
              {views.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={!spin && view === v}
                  onClick={() => goView(v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${!spin && view === v ? "bg-sky-600 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                >
                  {v === "front" ? "👁 ด้านหน้า" : v === "top" ? "⬆ ด้านบน" : HAIR_VIEW_TH[v]}
                </button>
              ))}
            </span>
            <button
              type="button"
              aria-pressed={spin}
              onClick={() => setSpin((s) => !s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold ring-1 transition ${spin ? "bg-violet-600 text-white ring-violet-600 shadow-sm" : "bg-white text-violet-700 ring-violet-200 hover:bg-violet-50"}`}
            >
              {spin ? "⏸ หยุดหมุน" : "🔄 หมุนโชว์รอบตัว"}
            </button>
          </div>
          <p className="text-center text-[11px] text-stone-400">
            {scarf
              ? "ภาพจำลองโดยประมาณ — ผ้าพิมพ์ผืนเดียวพับครึ่งตามยาว: ด้านหน้า = ครึ่งบนของผืน · ด้านหลัง = ครึ่งล่าง (เห็นกลับหัวตามการพับ) · สีผ้าจริงอาจต่างจากหน้าจอเล็กน้อย"
              : "ภาพจำลองโดยประมาณ — ผ้าเย็บเป็นท่อแล้วรูดบนยางวง ลายยืด/ย่นตามก้อนผ้า ตำแหน่งจีบของจริงไม่ตายตัว · ส่วนเผื่อเย็บนอกเส้นประไม่เห็นในงานจริง · สีผ้าจริงอาจต่างจากหน้าจอเล็กน้อย"}
          </p>
        </div>
      </div>
    </div>
  );
}
