"use client";

/**
 * 🐶🧊 โมเดล 3D ปลอกคอสัตว์เลี้ยง (ผ้าพันคอสามเหลี่ยม) — ผ้าพันรอบคอหุ่น ให้ลูกค้าเห็นลายตอนสวมจริงก่อนสั่ง
 * (เจ้าของร้านสั่ง 23 ต.ค. 69 "เพิ่ม 3D ให้หน่อย" — collar-animal · ทรงตามเทมเพลต 3 แบบ ดู lib/bandana-mock)
 *
 * three.js โหลดตอนกดปุ่มเท่านั้น (import()) · โครงเดียวกับ CanvasFrame3D (ลาก=หมุน · ล้อ/หยิก=ซูม · มุมมอง 4 ด้าน)
 * ผืนสามเหลี่ยม = ตาราง (แถว t: 0 = ขอบคอ → 1 = ยอด · คอลัมน์ s: ซ้าย→ขวา) แปะ UV ตรงจากอาร์ตบอร์ด
 *   ผ้าพันรอบหุ่นสุนัขผ้ากำมะหยี่ (หัว จมูก ตา หูตก · ลำตัว Lathe ตามรัศมีใต้ผ้า) · ใต้อกชายผ้าห้อยพ้นตัว
 *   ผ้าสมจริง: รอยพลิ้วลึกขึ้นทางยอด · MeshPhysical sheen + bump ลายทอ · เงาขอบพับ + ตะเข็บม้วนริม/โพ้งในเท็กซ์เจอร์
 *   tie   : ผ้า 1 ชั้น หลังผ้าเห็นลายซีดทะลุ (พิมพ์ด้านเดียว) · ปลายสองข้างมาชนท้ายทอย + ปมแบนเล็กสีมุมผ้า + ชายผ้าเรียว 2 เส้น
 *   button: 2 ชั้น (ครึ่งล่างอาร์ตบอร์ด = หน้า · ครึ่งบน = หลัง) · ปลายเกยกันท้ายทอย + กระดุมแป๊กโลหะ
 *   strap : 2 ชั้น คลุมด้านหน้า ~3/4 รอบ · สายปลอกคอ (ไม่รวมในงาน) อยู่ในช่องพับ + หัวเข็มขัดท้ายทอย
 *   ปุ่ม "ดูลายชั้นหลัง" (2 ชั้น) = พลิกชั้นที่พับออกมาด้านนอก
 * (ปรับรอบ 2 · 23 ต.ค. 69 เจ้าของร้าน "ตอนมัดมันดูเป็นปมไปหน่อย · หุ่นเป็นหัวหมา · ผ้าดูเป็นผ้ามากขึ้น · สัดส่วนแบบใส่กับสาย · เห็นลายชั้นหลัง · ให้มันดูสมจริงมากกว่านี้")
 */

import { useEffect, useRef, useState } from "react";
import { BANDANA_STYLE_TH, BANDANA_VIEW_TH, type BandanaMock, type BandanaView } from "@/lib/bandana-mock";

/** มุมกล้อง — yaw รอบแกนตั้ง (หน้าผ้าหันไป +z) · pitch ก้ม/เงย */
const VIEW_CAM: Record<BandanaView, { yaw: number; pitch: number }> = {
  front: { yaw: 0, pitch: 0.12 },
  right: { yaw: Math.PI / 2, pitch: 0.12 },
  left: { yaw: -Math.PI / 2, pitch: 0.12 },
  back: { yaw: Math.PI, pitch: 0.12 },
};
const PITCH_MAX = 1.2;

/** หดรูปหลายเหลี่ยมนูนเข้าด้านใน d มม. (ตะเข็บห่างขอบผ้า) */
function insetPoly(pts: [number, number][], d: number): [number, number][] {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  const sg = area > 0 ? 1 : -1;
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    // นอร์มัลชี้เข้าใน
    const nx = (-(q[1] - p[1]) / len) * sg;
    const ny = ((q[0] - p[0]) / len) * sg;
    return { p: [p[0] + nx * d, p[1] + ny * d], v: [q[0] - p[0], q[1] - p[1]] };
  });
  return lines.map((l, i) => {
    const k = lines[(i + n - 1) % n];
    const den = k.v[0] * l.v[1] - k.v[1] * l.v[0];
    const t = den ? ((l.p[0] - k.p[0]) * l.v[1] - (l.p[1] - k.p[1]) * l.v[0]) / den : 0;
    return [k.p[0] + k.v[0] * t, k.p[1] + k.v[1] * t] as [number, number];
  });
}

/**
 * ผ้า: พื้นขาว + ลาย + ขอบพับมีเงา + ตะเข็บตามแบบ + ลายทอจาง ๆ · wash = ทาขาวทับ (หลังผ้าพิมพ์ด้านเดียว เห็นลายซีดทะลุ)
 * outline = ทรงผ้าบนอาร์ตบอร์ด (มม.) · hem: "rolled" = เย็บม้วนริม (ตะเข็บตรงเส้นประ) · "overlock" = เย็บโพ้ง (ซิกแซกริมขอบ)
 */
function fabricCanvas(src: HTMLCanvasElement, kMm: number, wash: number, outline: [number, number][], hem: "rolled" | "overlock"): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);
  if (wash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${wash})`;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  const P = (pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * kMm, y * kMm) : ctx.moveTo(x * kMm, y * kMm)));
    ctx.closePath();
  };
  ctx.save();
  P(outline);
  ctx.clip();
  // ขอบม้วน/โพ้งหนากว่าตัวผ้า → เงาอ่อนชิดขอบ
  P(outline);
  ctx.strokeStyle = "rgba(40,30,20,0.16)";
  ctx.lineWidth = 7 * kMm;
  ctx.stroke();
  P(outline);
  ctx.strokeStyle = "rgba(40,30,20,0.10)";
  ctx.lineWidth = 3.5 * kMm;
  ctx.stroke();
  const thread = (draw: () => void, w: number) => {
    // ด้ายนูน: เงาเข้มเยื้องลง แล้วด้ายขาวนวลทับ
    ctx.save();
    ctx.translate(0.25 * kMm, 0.35 * kMm);
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = w * kMm;
    draw();
    ctx.restore();
    ctx.strokeStyle = "rgba(255,253,248,0.92)";
    ctx.lineWidth = w * kMm;
    draw();
  };
  if (hem === "rolled") {
    const inner = insetPoly(outline, 4);
    ctx.setLineDash([3 * kMm, 1.6 * kMm]);
    ctx.lineCap = "round";
    thread(() => {
      P(inner);
      ctx.stroke();
    }, 0.55);
    ctx.setLineDash([]);
  } else {
    const inner = insetPoly(outline, 1.6);
    thread(() => {
      ctx.beginPath();
      inner.forEach((a, i) => {
        const b = inner[(i + 1) % inner.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(2, Math.floor(len / 1.2));
        const nx = -(b[1] - a[1]) / len;
        const ny = (b[0] - a[0]) / len;
        for (let j = 0; j <= n; j++) {
          const u = j / n;
          const o = j % 2 ? 1.3 : -1.3;
          const x = (a[0] + (b[0] - a[0]) * u + nx * o) * kMm;
          const y = (a[1] + (b[1] - a[1]) * u + ny * o) * kMm;
          if (i === 0 && j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }, 0.4);
  }
  ctx.restore();
  const pitch = Math.max(2, 0.9 * kMm);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#1f1a14";
  for (let yy = 0; yy < out.height; yy += pitch) ctx.fillRect(0, yy, out.width, 1);
  for (let xx = 0; xx < out.width; xx += pitch) ctx.fillRect(xx, 0, 1, out.height);
  ctx.restore();
  return out;
}

/** แผ่นเนื้อผ้าทอ (ใช้เป็น bump) — เส้นยืน/เส้นพุ่งสลับขึ้นลง */
function weaveTile(): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const over = (i + j) % 2 === 0;
      const gr = ctx.createLinearGradient(i * 8, j * 8, over ? i * 8 + 8 : i * 8, over ? j * 8 : j * 8 + 8);
      gr.addColorStop(0, "#5a5a5a");
      gr.addColorStop(0.5, "#c8c8c8");
      gr.addColorStop(1, "#5a5a5a");
      ctx.fillStyle = gr;
      if (over) ctx.fillRect(i * 8, j * 8 + 1, 8, 6);
      else ctx.fillRect(i * 8 + 1, j * 8, 6, 8);
    }
  }
  return cv;
}

export default function Bandana3D({
  sheet,
  sheetMm,
  mock,
  title,
  onClose,
}: {
  /** ลายทั้งอาร์ตบอร์ด (วาดจากตัววาดจริงของจอออกแบบ) */
  sheet: HTMLCanvasElement;
  sheetMm: { w: number; h: number };
  mock: BandanaMock;
  title: string;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [spin, setSpin] = useState(false);
  const [view, setView] = useState<BandanaView>("front");
  const [zoom, setZoomState] = useState(1);
  /** 🔄 ดูลายชั้นหลัง (ผ้า 2 ชั้นพับ) — พลิกชั้นที่พับไว้ออกมาด้านนอก */
  const [inner, setInner] = useState(false);
  const innerOn = useRef(false);
  const innerRef = useRef<((on: boolean) => void) | null>(null);
  const clampZ = (z: number) => Math.max(0.6, Math.min(3, z));
  const cam = useRef({ yaw: 0.35, pitch: 0.12, zoom: 1, targetYaw: null as number | null, targetPitch: null as number | null, spin: false, dragging: false });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const setZoom = (fn: (z: number) => number) => {
    const z = clampZ(fn(cam.current.zoom));
    cam.current.zoom = z;
    setZoomState(z);
  };
  const goView = (v: BandanaView) => {
    setView(v);
    const cur = cam.current.yaw;
    let t = VIEW_CAM[v].yaw;
    while (t - cur > Math.PI) t -= 2 * Math.PI;
    while (t - cur < -Math.PI) t += 2 * Math.PI;
    cam.current.targetYaw = t;
    cam.current.targetPitch = VIEW_CAM[v].pitch;
    cam.current.spin = false;
    setSpin(false);
  };
  useEffect(() => {
    cam.current.spin = spin;
  }, [spin]);
  useEffect(() => {
    innerOn.current = inner;
    innerRef.current?.(inner);
  }, [inner]);

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
        const kMm = sheet.width / W;
        const style = mock.style;
        const folded = style !== "tie";
        // 📐 ผืนที่เห็น: ฐาน (ขอบคอ) กว้าง Wt · ลึกถึงยอด Dp
        const Wt = W;
        const Dp = folded ? H / 2 : H;
        // รัศมีคอ R: tie/button ขอบคอพันรอบพอดี (ปลายชน/เกยท้ายทอย) · strap คลุมด้านหน้าราว 3/4 รอบ
        //   (รอบแรก strap คลุมแค่ 0.56 รอบ คอหุ่นอ้วนเกินผ้า · 23 ต.ค. 69 "สัดส่วนแบบใส่กับสาย")
        const R = style === "strap" ? Math.min(Wt / (2 * Math.PI * 0.62), Dp * 0.42) : Wt / (2 * Math.PI * (style === "tie" ? 0.94 : 1.04));
        /** อกกว้างกว่าคอ: รัศมีลำตัวที่ T_CHEST = R + Dp × FLARE × T_CHEST · ใต้นั้นชายผ้าห้อยพ้นอก */
        const FLARE = 0.26;
        const T_CHEST = 0.62;
        /** ระยะผิวหุ่นถึงผ้า (ผ้า 2 ชั้นหนากว่า + สายสอดในช่องพับ) */
        const GAP = folded ? 3.5 : 2;
        const bodyR = (t: number) => R - GAP + Dp * FLARE * Math.min(t, T_CHEST);
        const yNeck = Dp * 1.18;
        // หัวหุ่น: คอสั้นหนาแบบสุนัขจริง (รอบแรกคอยาวเหมือนขวด) · หัวยื่นมาหน้านิด ๆ
        const neckLen = R * 0.35;
        const head = new THREE.Vector3(0, yNeck + neckLen + R * 0.78, -R * 0.62);
        const topY = head.y + R * 1.15;
        const bottomY = yNeck - Dp;
        const Ht = topY - bottomY;
        const span = Math.max(Ht, R * 3.2);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.NeutralToneMapping;
        renderer.toneMappingExposure = 1;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
        scene.environmentIntensity = 0.55;

        const camera = new THREE.PerspectiveCamera(28, 1, 1, 20000);
        const BASE_DIST = span * 2.55;

        const sun = new THREE.DirectionalLight(0xffffff, 1.1);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const sh = span * 0.9;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -sh;
        sun.shadow.camera.right = sun.shadow.camera.top = sh;
        sun.shadow.camera.near = 5;
        sun.shadow.camera.far = BASE_DIST * 4;
        sun.shadow.bias = -0.0004;
        sun.shadow.normalBias = 0.8;
        sun.shadow.radius = 5;
        scene.add(sun);
        scene.add(new THREE.HemisphereLight(0xffffff, 0xe8dccb, 0.75));
        const fill = new THREE.DirectionalLight(0xffffff, 0.35);
        scene.add(fill);

        const geos: { dispose(): void }[] = [];
        const mats: { dispose(): void }[] = [];
        const g = <T extends { dispose(): void }>(x: T) => (geos.push(x), x);
        const m = <T extends { dispose(): void }>(x: T) => (mats.push(x), x);

        const ground = new THREE.Mesh(g(new THREE.PlaneGeometry(span * 10, span * 10)), m(new THREE.ShadowMaterial({ opacity: 0.13 })));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const texOf = (cv: HTMLCanvasElement) => {
          const t = new THREE.CanvasTexture(cv);
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = renderer.capabilities.getMaxAnisotropy();
          mats.push(t);
          return t;
        };
        // 🧵 ผ้า: ขอบผ้าตามทรงเทมเพลต (มม.) — ใช้วาดเงาขอบพับ + ตะเข็บ
        const outline: [number, number][] = folded
          ? [[W / 2, 0], [W, H / 2], [W / 2, H], [0, H / 2]]
          : [[0, 0], [W, 0], [W / 2, H]];
        const printCv = fabricCanvas(sheet, kMm, 0, outline, folded ? "overlock" : "rolled");
        const printTex = texOf(printCv);
        // เนื้อผ้าทอ (bump) ซ้ำทุก ~3 มม. ให้แสงจับผิวผ้า ไม่เรียบเหมือนกระดาษ
        const weave = texOf(weaveTile());
        weave.colorSpace = THREE.NoColorSpace;
        weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
        weave.repeat.set(W / 3, H / 3);
        const cloth = (map: InstanceType<typeof THREE.Texture> | null, color: number, side: number) =>
          m(
            new THREE.MeshPhysicalMaterial({
              map,
              color,
              roughness: 0.88,
              metalness: 0,
              sheen: 0.9,
              sheenRoughness: 0.65,
              sheenColor: new THREE.Color(0xffffff),
              bumpMap: weave,
              bumpScale: 0.35,
              side: side as typeof THREE.FrontSide,
              shadowSide: THREE.DoubleSide,
            }),
          );
        const fabric = cloth(printTex, 0xffffff, THREE.FrontSide);
        // หลังผ้าชั้นเดียว (tie) = ลายซีดทะลุ
        const washed = cloth(texOf(fabricCanvas(sheet, kMm, 0.62, outline, "rolled")), 0xffffff, THREE.BackSide);
        // 🧸 หุ่นสุนัขผ้ากำมะหยี่สีครีม (เจ้าของร้านเลือก "หุ่นเป็นหัวหมา")
        const plush = m(new THREE.MeshPhysicalMaterial({ color: 0xf2e8da, roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xfff6e8) }));
        const plushDark = m(new THREE.MeshPhysicalMaterial({ color: 0xd9c2a2, roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xfff1dc) }));
        const glossy = m(new THREE.MeshPhysicalMaterial({ color: 0x1d1a18, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1 }));
        const metal = m(new THREE.MeshStandardMaterial({ color: 0xd4d7db, roughness: 0.28, metalness: 0.95 }));
        const strapMat = m(new THREE.MeshPhysicalMaterial({ color: 0x3f4a56, roughness: 0.7, metalness: 0, sheen: 0.6, sheenColor: new THREE.Color(0x9fb0c2), side: THREE.DoubleSide }));

        const root = new THREE.Group();
        scene.add(root);
        const add = (mesh: InstanceType<typeof THREE.Mesh>, shadow = true) => {
          mesh.castShadow = shadow;
          mesh.receiveShadow = true;
          root.add(mesh);
          return mesh;
        };

        /** รัศมีผ้าที่ความลึก t: แนบหุ่นจนถึงอก แล้วชายผ้าห้อยพ้นอกออกมาข้างหน้า */
        const rFab = (t: number) => R + Dp * FLARE * Math.min(t, T_CHEST) + (t > T_CHEST ? (t - T_CHEST) * Dp * 0.38 : 0);
        /** รอยพลิ้วผ้า: คลื่นตามแนวตั้ง ลึกขึ้นเมื่อลงไปทางยอด (ขอบคอตึงเรียบ) · ดันออกเสมอ ไม่จมเข้าหุ่น */
        const ripple = (s: number, t: number) => {
          const amp = Dp * 0.018 * Math.pow(t, 1.5);
          return amp * (1 + Math.sin(2 * Math.PI * s * 5 + 0.6 + t * 1.8)) * 0.5;
        };
        /**
         * จุดบนผ้า (s, t) → ตำแหน่ง 3D (มม.) · แกนคออยู่ที่ x = 0, z = −R (ผิวหน้าผ้ากลางคอ = z 0)
         * ผ้าพันรอบลำตัวทุกแถว (รอบแรกคลายเป็นแผ่นแบน ชายผ้ากางเหมือนปีก) · off = ถอยเข้าหาแกน (ชั้นหลังของผ้า 2 ชั้น)
         */
        const pos = (s: number, t: number, off = 0) => {
          const xf = (s - 0.5) * Wt * (1 - t);
          const r = rFab(t) + ripple(s, t) - off;
          const a = xf / r;
          return new THREE.Vector3(r * Math.sin(a), yNeck - t * Dp, -R + r * Math.cos(a));
        };
        /** อาร์ตบอร์ด (มม.) ของจุด (s, t) — back = ชั้นหลังของผืนพับ (ครึ่งบน) */
        const uvOf = (s: number, t: number, back = false) => {
          const xs = W / 2 + (s - 0.5) * Wt * (1 - t);
          const ys = !folded ? t * H : back ? H / 2 - (t * H) / 2 : H / 2 + (t * H) / 2;
          return [xs / W, 1 - ys / H];
        };

        const NR = 64;
        const NC = 128;
        /** uvBack = ใช้ลายครึ่งบน · inward = ผิวที่หันเข้าหาแกนเป็นด้านหน้า (ชั้นหลังที่พับไป ผิวพิมพ์หันออกด้านหลัง/เข้าตัว) */
        const sheetGeo = (uvBack: boolean, off: number, inward: boolean) => {
          const p: number[] = [];
          const uv: number[] = [];
          const idx: number[] = [];
          for (let i = 0; i <= NR; i++) {
            // ยอดจริงเป็นจุดเดียว — แถวสุดท้ายหยุดก่อนนิดเดียวกันสามเหลี่ยมแบน
            const t = Math.min(i / NR, 0.995);
            for (let j = 0; j <= NC; j++) {
              const s = j / NC;
              const v = pos(s, t, off);
              p.push(v.x, v.y, v.z);
              uv.push(...uvOf(s, t, uvBack));
            }
          }
          for (let i = 0; i < NR; i++) {
            for (let j = 0; j < NC; j++) {
              const a = i * (NC + 1) + j;
              const b = a + 1;
              const c = a + NC + 1;
              const d = c + 1;
              if (inward) idx.push(a, b, c, b, d, c);
              else idx.push(a, c, b, b, c, d);
            }
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
          geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
          geo.setIndex(idx);
          geo.computeVertexNormals();
          return g(geo);
        };

        const front = sheetGeo(false, 0, false);
        const frontMesh = add(new THREE.Mesh(front, fabric));
        let innerMesh: InstanceType<typeof THREE.Mesh> | null = null;
        if (folded) {
          // ชั้นหลัง (ครึ่งบนของแบบ) พับแนบตัว ถอยเข้า 1.6 มม.
          add(new THREE.Mesh(sheetGeo(true, 1.6, true), fabric));
          // 🔄 "ดูลายชั้นหลัง": ชั้นที่พับไว้พลิกออกมาด้านนอก (ครึ่งบนของแบบ กลับหัวตามการพับ) — สลับกับชั้นหน้าด้วยปุ่ม
          innerMesh = add(new THREE.Mesh(sheetGeo(true, 0, false), fabric));
          innerMesh.visible = false;
        } else {
          add(new THREE.Mesh(front, washed), false);
        }
        innerRef.current = (on: boolean) => {
          if (!innerMesh) return;
          innerMesh.visible = on;
          frontMesh.visible = !on;
        };
        innerRef.current(innerOn.current);

        // 🐶 หุ่นสุนัข: ลำตัว-คอ (Lathe ตามรัศมีใต้ผ้า) + หัว จมูก ตา หูตก
        {
          const yB = yNeck - T_CHEST * Dp;
          const rc = bodyR(T_CHEST);
          const prof: InstanceType<typeof THREE.Vector2>[] = [];
          for (let i = 0; i <= 12; i++) {
            const th = (i / 12) * (Math.PI / 2);
            prof.push(new THREE.Vector2(Math.max(0.01, rc * Math.sin(th)), yB - rc * 0.5 * Math.cos(th)));
          }
          for (let i = 1; i <= 16; i++) {
            const t = T_CHEST * (1 - i / 16);
            prof.push(new THREE.Vector2(bodyR(t), yNeck - t * Dp));
          }
          prof.push(new THREE.Vector2(R - GAP, yNeck + neckLen));
          // ปลายคอปิดเป็นโดมเล็กกว่าหัว (เดิมขอบคอแบนโผล่หลังหัว)
          prof.push(new THREE.Vector2((R - GAP) * 0.82, yNeck + neckLen + R * 0.45));
          prof.push(new THREE.Vector2((R - GAP) * 0.5, yNeck + neckLen + R * 0.75));
          prof.push(new THREE.Vector2(0.01, yNeck + neckLen + R * 0.88));
          const body = add(new THREE.Mesh(g(new THREE.LatheGeometry(prof, 72)), plush));
          body.position.set(0, 0, -R);

          const ball = (r: number, mat: typeof plush, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
            const b = add(new THREE.Mesh(g(new THREE.SphereGeometry(r, 48, 32)), mat));
            b.scale.set(sx, sy, sz);
            b.position.set(head.x + x, head.y + y, head.z + z);
            return b;
          };
          ball(R * 1.15, plush, 0, 0, 0, 1, 0.94, 1.02);
          ball(R * 0.62, plush, 0, -R * 0.4, R * 0.92, 0.88, 0.7, 1.08);
          ball(R * 0.16, glossy, 0, -R * 0.22, R * 1.58, 1.35, 0.9, 1);
          for (const sx of [-1, 1]) {
            ball(R * 0.12, glossy, sx * R * 0.42, R * 0.2, R * 0.99);
            const ear = ball(R * 0.52, plushDark, sx * R * 1.0, -R * 0.2, -R * 0.12, 0.55, 1.2, 0.24);
            ear.rotation.set(0.1, sx * -0.25, sx * 0.3);
          }

          // 🐕 ท่านั่ง: ขาหน้า 2 ข้าง + อุ้งเท้า · สะโพก/ต้นขาหลังด้านหลัง · หาง — ไม่งั้นเป็นหัวบนกรวยดูตลก (เจ้าของร้านทัก 23 ต.ค. 69 "มันดูตลก")
          const at = (geo: InstanceType<typeof THREE.SphereGeometry> | InstanceType<typeof THREE.CapsuleGeometry>, mat: typeof plush, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
            const b = add(new THREE.Mesh(g(geo), mat));
            b.scale.set(sx, sy, sz);
            b.position.set(x, y, z);
            return b;
          };
          const lr = rc * 0.24;
          const legTop = yB + rc * 0.15;
          for (const sx of [-1, 1]) {
            const lx = sx * rc * 0.42;
            const lz = -R + rc * 0.5;
            at(new THREE.CapsuleGeometry(lr, Math.max(1, legTop - lr * 2), 8, 24), plush, lx, legTop / 2 + lr * 0.4, lz);
            at(new THREE.SphereGeometry(lr * 1.08, 32, 16), plush, lx, lr * 0.62, lz + lr * 0.55, 1, 0.62, 1.35);
            // นิ้วเท้า 3 ร่องจาง ๆ = ลูกเล็กสีเข้มกว่านิดหน่อย
            for (const k of [-1, 0, 1]) at(new THREE.SphereGeometry(lr * 0.22, 16, 10), plushDark, lx + k * lr * 0.42, lr * 0.5, lz + lr * 1.85, 1, 0.7, 0.6);
          }
          // สะโพก + ต้นขาหลัง (นั่งพับขา) — อยู่หลังลำตัว ต่อจากใต้อก
          const hz = -R - rc * 1.05;
          at(new THREE.SphereGeometry(rc, 48, 32), plush, 0, rc * 0.92, hz, 1.12, 0.95, 1.25);
          // หลัง/ท้อง เชื่อมอกกับสะโพก (มองข้างไม่เป็นสองก้อนแยกกัน)
          at(new THREE.SphereGeometry(rc, 48, 32), plush, 0, (yB + rc * 0.92) / 2 + rc * 0.15, (-R + hz) / 2 - rc * 0.05, 0.98, 0.95, 1.15);
          for (const sx of [-1, 1]) {
            at(new THREE.SphereGeometry(rc * 0.62, 40, 24), plush, sx * rc * 0.82, rc * 0.62, hz + rc * 0.25, 0.75, 0.95, 1.2);
            at(new THREE.SphereGeometry(lr * 1.05, 32, 16), plush, sx * rc * 0.92, lr * 0.6, hz + rc * 0.95, 1, 0.6, 1.4);
          }
          // หางม้วนขึ้นสั้น ๆ
          const tail = at(new THREE.CapsuleGeometry(lr * 0.45, rc * 0.7, 6, 16), plushDark, 0, rc * 0.75, hz - rc * 1.3);
          tail.rotation.x = -0.9;
        }

        // 🎨 สีผ้าตรงมุมผ้า (ปม/ชายผ้าเป็นผ้าส่วนนี้) — ไม่แปะลายทั้งผืนบนลูกปม (รอบแรกเห็นตาเป็ดโผล่บนปม)
        const cornerColor = (() => {
          const ctx = printCv.getContext("2d");
          if (!ctx) return new THREE.Color(0xffffff);
          const px = (xMm: number, yMm: number) => ctx.getImageData(Math.round(xMm * kMm), Math.round(yMm * kMm), 1, 1).data;
          const ys = folded ? H / 2 : H * 0.012;
          const a = px(W * 0.03, ys);
          const b = px(W * 0.97, ys);
          return new THREE.Color(`rgb(${(a[0] + b[0]) >> 1},${(a[1] + b[1]) >> 1},${(a[2] + b[2]) >> 1})`);
        })();
        const cornerMat = cloth(null, cornerColor.getHex(), THREE.DoubleSide);
        const backY = yNeck - Dp * 0.04;
        const backZ = -2 * R - 1.5;

        if (style === "tie") {
          // 🎀 ปมผูกท้ายทอย: ปมแบนเล็ก ๆ + ชายผ้า 2 เส้นเรียวห้อยออกข้าง (ผ้าสีมุมผ้า)
          const kR = Math.max(6, Wt * 0.013);
          const knot = add(new THREE.Mesh(g(new THREE.TorusGeometry(kR, kR * 0.72, 16, 32)), cornerMat));
          knot.scale.set(1.25, 0.85, 0.55);
          knot.position.set(0, backY, backZ - kR * 0.3);
          // แกนปม (ไม่งั้นเห็นรูกลางวงเหมือนห่วง)
          const core = add(new THREE.Mesh(g(new THREE.SphereGeometry(kR * 0.95, 24, 16)), cornerMat));
          core.scale.set(1.15, 0.8, 0.55);
          core.position.set(0, backY, backZ - kR * 0.45);
          const tail = (sgn: number) => {
            const L = Wt * 0.085;
            const w0 = kR * 1.6;
            const N = 14;
            const p: number[] = [];
            const idx: number[] = [];
            for (let i = 0; i <= N; i++) {
              const u = i / N;
              const cx = sgn * (kR * 0.6 + L * 0.55 * u);
              const cy = -L * 0.85 * u + L * 0.25 * u * (1 - u);
              const cz = -kR * 0.4 - L * 0.12 * Math.sin(Math.PI * u);
              const w = w0 * (1 - u) + 1.2;
              // ความกว้างตั้งฉากกับทิศชาย (โดยประมาณ) + บิดนิดหน่อย
              const ang = Math.atan2(-L * 0.85, sgn * L * 0.55) + Math.PI / 2;
              const dx = (Math.cos(ang) * w) / 2;
              const dy = (Math.sin(ang) * w) / 2;
              const tw = Math.sin(u * Math.PI) * w * 0.25;
              p.push(cx - dx, cy - dy, cz - tw, cx + dx, cy + dy, cz + tw);
              if (i < N) {
                const a = i * 2;
                idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
              }
            }
            const geo = g(new THREE.BufferGeometry());
            geo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
            geo.setIndex(idx);
            geo.computeVertexNormals();
            const mesh = add(new THREE.Mesh(geo, cornerMat));
            mesh.position.set(0, backY, backZ);
          };
          tail(-1);
          tail(1);
        } else if (style === "button") {
          // 🔘 กระดุมแป๊กตรงที่ปลายผ้าเกยกันท้ายทอย (ฝาโลหะ + วงขอบ)
          const sr = Math.max(5, Wt * 0.013);
          const cap = add(new THREE.Mesh(g(new THREE.SphereGeometry(sr, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)), metal));
          cap.scale.set(1, 0.35, 1);
          cap.rotation.x = -Math.PI / 2;
          cap.position.set(0, backY - Dp * 0.02, backZ);
          const ring = add(new THREE.Mesh(g(new THREE.TorusGeometry(sr, sr * 0.14, 10, 32)), metal));
          ring.position.copy(cap.position);
        } else {
          // 🦮 สายปลอกคอเดิม (ไม่รวมในงาน) สอดอยู่ในช่องพับระหว่างผ้า 2 ชั้น (ด้านหน้ามองไม่เห็นสาย) + หัวเข็มขัดท้ายทอย
          const strapW = Math.max(12, Math.min(25, R * 0.3));
          const sy = yNeck - strapW * 0.62;
          const strap = add(new THREE.Mesh(g(new THREE.CylinderGeometry(R - 0.8, R - 0.8, strapW, 128, 1, true)), strapMat));
          strap.position.set(0, sy, -R);
          const bw = strapW * 1.45;
          const bh = strapW * 1.35;
          const bar = (w: number, h: number, x: number, y: number) => {
            const b = add(new THREE.Mesh(g(new THREE.BoxGeometry(w, h, 2.6)), metal));
            b.position.set(x, sy + y, -2 * R - 0.8 - 1.6);
          };
          bar(bw, 2.6, 0, bh / 2);
          bar(bw, 2.6, 0, -bh / 2);
          bar(2.6, bh, -bw / 2, 0);
          bar(2.6, bh, bw / 2, 0);
          bar(2, bh * 0.95, bw * 0.08, 0);
        }

        // เล็งต่ำกว่ากลางนิด — ปลายผ้าไม่จมใต้แถบคำแนะนำล่างจอ
        const lookY = (topY + bottomY) / 2 - Ht * 0.06;
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
          const dist = BASE_DIST / c.zoom;
          const cp2 = Math.cos(c.pitch);
          // หมุนรอบแกนคอ (z = −R) ไม่ใช่รอบผิวหน้าผ้า
          camera.position.set(dist * Math.sin(c.yaw) * cp2, dist * Math.sin(c.pitch) + lookY, dist * Math.cos(c.yaw) * cp2 - R);
          camera.lookAt(0, lookY, -R);
          sun.position.set(camera.position.x, 0, camera.position.z + R).normalize().multiplyScalar(BASE_DIST * 1.1);
          sun.position.y = BASE_DIST * 0.9;
          sun.position.x += BASE_DIST * 0.3 * Math.cos(c.yaw);
          sun.position.z -= BASE_DIST * 0.3 * Math.sin(c.yaw) + R;
          sun.target.position.set(0, lookY, -R);
          sun.target.updateMatrixWorld();
          fill.position.copy(camera.position);
          fill.target.position.set(0, lookY, -R);
          fill.target.updateMatrixWorld();
          fill.intensity = c.pitch < 0 ? 0.35 + Math.min(0.6, -c.pitch * 0.6) : 0.25;
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
        console.error("Bandana3D", e);
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

  const styleTh = BANDANA_STYLE_TH[mock.style];
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-900/55 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div className="relative flex w-full max-w-3xl flex-col rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-lg shadow-[0_4px_12px_rgba(139,92,246,.35)]">
            🐶
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold leading-tight text-stone-800">
              <span className="shrink-0">ดูแบบ 3D</span>
              <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-stone-700 ring-1 ring-sky-200">
                <span className="truncate">ปลอกคอ {styleTh}</span>
                {mock.label ? <span className="truncate text-stone-400">· {mock.label}</span> : null}
              </span>
            </p>
            <p className="truncate text-xs text-stone-500">
              {title} · {mock.style === "tie" ? "ผ้าชั้นเดียว ผูกปมท้ายทอย" : mock.style === "button" ? "ผ้า 2 ชั้นพับครึ่ง ติดกระดุมแป๊กท้ายทอย" : "ผ้า 2 ชั้นพับครึ่ง สอดกับสายปลอกคอเดิม"}
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
          className="relative mx-3 h-[min(60vh,500px)] cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_50%_38%,#ffffff_0%,#f1f5f9_55%,#e2e8f0_100%)] ring-1 ring-stone-200/70 active:cursor-grabbing"
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
            <span className="whitespace-nowrap rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-extrabold text-white">🐶 {styleTh}</span>
            <span className="truncate text-xs font-bold text-stone-700">{spin ? "หมุนโชว์รอบตัว" : BANDANA_VIEW_TH[view]}{inner ? " · ชั้นหลัง" : ""}</span>
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
              {(["left", "front", "right", "back"] as BandanaView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={!spin && view === v}
                  onClick={() => goView(v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${!spin && view === v ? "bg-sky-600 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                >
                  {v === "front" ? "👁 ด้านหน้า" : BANDANA_VIEW_TH[v]}
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
            {mock.style !== "tie" && (
              <button
                type="button"
                aria-pressed={inner}
                onClick={() => {
                  setInner((v) => !v);
                  goView("front");
                }}
                className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold ring-1 transition ${inner ? "bg-amber-500 text-white ring-amber-500 shadow-sm" : "bg-white text-amber-700 ring-amber-200 hover:bg-amber-50"}`}
              >
                {inner ? "👁 กลับเป็นชั้นหน้า" : "🔁 ดูลายชั้นหลัง"}
              </button>
            )}
          </div>
          <p className="text-center text-[11px] text-stone-400">
            {mock.style === "tie"
              ? "ภาพจำลองโดยประมาณ — ผ้าชั้นเดียวพิมพ์ด้านหน้า ด้านหลังเห็นลายซีดทะลุ · สีจริงอาจต่างจากหน้าจอเล็กน้อย"
              : inner
                ? "กำลังดูชั้นหลัง = ครึ่งบนของแบบ พลิกออกมาด้านนอก (ลายกลับหัวตามการพับ) · สีจริงอาจต่างจากหน้าจอเล็กน้อย"
                : "ภาพจำลองโดยประมาณ — ผืนพับครึ่งตามเส้นประแนวนอน ครึ่งบนของแบบอยู่ชั้นหลัง กด “ดูลายชั้นหลัง” เพื่อพลิกดู · สีจริงอาจต่างจากหน้าจอเล็กน้อย"}
          </p>
        </div>
      </div>
    </div>
  );
}
