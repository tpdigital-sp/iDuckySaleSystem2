"use client";

/**
 * 🐶🧊 โมเดล 3D ตัวผ้าอย่างเดียว (ไม่มีหุ่นหมา) กางแบนเป็นสามเหลี่ยม — ปลอกคอสัตว์เลี้ยง แบบติดกระดุม / แบบใส่กับสาย
 * (23 ต.ค. 69 เจ้าของร้าน: "อันนี้ไม่ใช่แบบผูก แต่เป็นแบบกระดุม ฉันอยากให้มี 3D ผ้า ที่ไม่ใช่อยู่บนโมเดลหมา" → "กางผ้าเป็น 3 เหลี่ยมไปเลย"
 *  — รูปพุดเดิ้ล (components/Bandana3D) มีปมผูก ตรงแค่แบบผูก · 2 แบบนี้จึงโชว์ตัวผ้าแทน)
 *
 * three.js โหลดตอนกดปุ่มเท่านั้น (import()) · โครงเดียวกับ CanvasFrame3D (ลาก=หมุน · ล้อ/หยิก=ซูม · มุมมอง 4 ด้าน)
 * ผืนข้าวหลามตัดพับครึ่งตามเส้นประ = สามเหลี่ยม 2 ชั้นซ้อนกัน ตั้งในระนาบ x-y ลอยเหนือพื้น
 *   ชั้นหน้า (+z) = ครึ่งล่างของอาร์ตบอร์ด · ชั้นหลัง (−z) = ครึ่งบน กลับหัวตามการพับ · สันพับด้านบนปิดช่องระหว่างชั้น
 *   ผ้านุ่ม: ลอนพลิ้วเบา ๆ + ท้องผ้าโค้งออก · ตะเข็บโพ้งในเท็กซ์เจอร์ · sheen + bump ลายทอ
 *   button: กระดุมแป๊กพลาสติกสีขาวตามรูในเทมเพลต (ซ้าย 2 ตัวเมียบนชั้นหน้า · ขวา 1 ตัวผู้ด้านหลัง)
 *   strap: สายปลอกคอ (ไม่รวมในงาน) สอดในช่องพับ ยื่นพ้นผ้าสองข้าง + หัวเข็มขัด
 * (โค้ดผ้ายกมาจากรุ่น three.js เดิมของ Bandana3D — e6822bd)
 */

import { useEffect, useRef, useState } from "react";
import { BANDANA_STYLE_TH, BANDANA_VIEW_TH, type BandanaMock, type BandanaView } from "@/lib/bandana-mock";
import { ASSET, FRAMES, PH, PW, loadImg, renderBandanaFrame } from "@/lib/bandana-photo";

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

export default function BandanaFabric3D({
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
  /**
   * 🐶 แผงหมาข้างผ้า 3D (เจ้าของร้านสั่ง 23 ต.ค. 69 "อยากให้มีโมเดลหมาข้าง ๆ ด้วย · ฉันหมายถึง 3D ด้วย")
   * รูปพุดเดิ้ลมุมหน้าใส่ผ้าลายลูกค้า (lib/bandana-photo · ชั้นหน้าของผืนพับ) — มุมหน้าไม่เห็นปมผูก จึงใช้กับแบบกระดุม/สายได้
   */
  const dogRef = useRef<HTMLCanvasElement>(null);
  const [dogReady, setDogReady] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [spin, setSpin] = useState(false);
  const [view, setView] = useState<BandanaView>("front");
  const [zoom, setZoomState] = useState(1);
  /** 🔄 ดูลายชั้นหลัง (ผ้า 2 ชั้นพับ) — พลิกชั้นที่พับไว้ออกมาด้านนอก */
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
    let dead = false;
    Promise.all([loadImg(`${ASSET}/poodle360-front.webp`), loadImg(`${ASSET}/poodle360-front-mask.png`)])
      .then(([front, mask]) => {
        const cv = dogRef.current;
        if (dead || !cv) return;
        const frame = renderBandanaFrame(FRAMES[0], { front, "front-mask": mask }, sheet, sheetMm, mock.style);
        cv.width = PW;
        cv.height = PH;
        cv.getContext("2d")?.drawImage(frame, 0, 0);
        setDogReady(true);
      })
      .catch((e) => console.error("BandanaFabric3D dog", e));
    return () => {
      dead = true;
    };
  }, [sheet, sheetMm, mock.style]);

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
        // 📐 กางแบนเป็นสามเหลี่ยม (เจ้าของร้านสั่ง 23 ต.ค. 69 "กางผ้าเป็น 3 เหลี่ยมไปเลย"): ขอบพับ (บน) กว้าง Wt · ลึกถึงยอด Dp
        //   ผ้า 2 ชั้นซ้อนกันห่าง LAYER มม. — ชั้นหน้า = ครึ่งล่างของแบบ · ชั้นหลัง = ครึ่งบน (หันออกด้านหลัง กลับหัวตามการพับ)
        const Wt = W;
        const Dp = folded ? H / 2 : H;
        const LAYER = 1.6;
        /**
         * 🦮 แบบใส่กับสาย: ช่องสอดสายตามแนวพับ — ผ้า 2 ชั้นโป่งออกข้างละ TUN มม. ช่วงความสูงสาย ให้สายมุดอยู่ระหว่างชั้นจริง
         * (เจ้าของร้านสั่ง 23 ต.ค. 69 "ให้สายสอดไปในปลอกคอ" — เดิมช่องห่าง 1.6 มม. ความลึกกล้องแยกไม่ทัน สายดูแปะทับหน้าผ้า)
         */
        const strapW = Math.max(12, Math.min(25, Dp * 0.12));
        const STRAP_T = 2.2;
        const TUN = style === "strap" ? STRAP_T / 2 + 1.4 : 0;
        const tTun = (strapW * 1.4) / Dp;
        /** ขอบพับลอยเหนือพื้น — ยอดผ้าสูงจากพื้น 25% ของความลึก */
        const yTop = Dp * 1.25;
        const topY = yTop;
        const bottomY = yTop - Dp;
        const Ht = topY - bottomY;
        // แบบใส่กับสาย: สาย + หัวเข็มขัดยื่นพ้นผ้าสองข้าง ต้องเผื่อความกว้าง
        const span = Math.max(Ht * 1.2, Wt * (style === "strap" ? 0.85 : 0.62));

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

        const camera = new THREE.PerspectiveCamera(28, 1, 5, 20000);
        const BASE_DIST = span * 2.6;

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
        const metal = m(new THREE.MeshStandardMaterial({ color: 0xd4d7db, roughness: 0.28, metalness: 0.95 }));
        // ⚪ กระดุมแป๊กพลาสติกสีขาวเงา (เจ้าของร้านสั่ง 23 ต.ค. 69 "ต้องเป็นกระดุมสีขาว")
        const snapMat = m(new THREE.MeshPhysicalMaterial({ color: 0xfbfbf8, roughness: 0.32, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
        const snapHole = m(new THREE.MeshStandardMaterial({ color: 0xe4e2dc, roughness: 0.5, metalness: 0 }));
        const strapMat = m(new THREE.MeshPhysicalMaterial({ color: 0x3f4a56, roughness: 0.7, metalness: 0, sheen: 0.6, sheenColor: new THREE.Color(0x9fb0c2), side: THREE.DoubleSide }));

        const root = new THREE.Group();
        scene.add(root);
        const add = (mesh: InstanceType<typeof THREE.Mesh>, shadow = true) => {
          mesh.castShadow = shadow;
          mesh.receiveShadow = true;
          root.add(mesh);
          return mesh;
        };

        /**
         * จุดบนผ้า (s, t) → ตำแหน่ง 3D (มม.) · ผืนอยู่ในระนาบ x-y หันหน้าไป +z
         * ผ้านุ่ม: ลอนพลิ้วเบา ๆ ตามแนวตั้ง (ลึกขึ้นทางยอด ขอบพับตึงเรียบ) + ท้องผ้าโค้งออกหน้านิดหน่อย · off = ชั้นหลังถอยไป −z
         */
        const pos = (s: number, t: number, off = 0) => {
          const x = (s - 0.5) * Wt * (1 - t);
          // ท้องผ้าโค้งออกเริ่มใต้ช่องสาย (แบบใส่กับสาย) — ไม่งั้นผ้าเลื่อนออกหน้าแต่สายตรง ขอบสายทะลุชั้นหลัง
          const tb = TUN ? tTun * 1.3 : 0;
          const tt = Math.max(0, (t - tb) / (1 - tb));
          const z = Dp * 0.012 * Math.pow(tt, 1.3) * Math.sin(2 * Math.PI * s * 3 + t * 2) + Dp * 0.05 * Math.sin(Math.PI * tt * 0.9);
          // ช่องสอดสาย: โป่งออกเต็มที่ช่วงสาย แล้วค่อย ๆ แนบกลับใต้สาย (ชั้นหน้าออก +z · ชั้นหลังออก −z)
          const k = Math.min(1, Math.max(0, (t - tTun * 0.85) / (tTun * 0.6)));
          const bulge = TUN * (1 - k * k * (3 - 2 * k));
          return new THREE.Vector3(x, yTop - t * Dp, z - off + (off > 0 ? -bulge : bulge));
        };
        /** อาร์ตบอร์ด (มม.) ของจุด (s, t) — back = ชั้นหลังของผืนพับ (ครึ่งบน) */
        const uvOf = (s: number, t: number, back = false) => {
          const xs = W / 2 + (s - 0.5) * Wt * (1 - t);
          const ys = !folded ? t * H : back ? H / 2 - (t * H) / 2 : H / 2 + (t * H) / 2;
          return [xs / W, 1 - ys / H];
        };
        /** (s,t) ของจุดบนอาร์ตบอร์ดฝั่งครึ่งล่าง xMm (ตามแนวกว้าง) ห่างเส้นพับ dMm */
        const stAt = (xMm: number, dMm: number): [number, number] => {
          const t = dMm / Dp;
          return [0.5 + (xMm - W / 2) / (Wt * (1 - t)), t];
        };

        const NR = 64;
        const NC = 128;
        /** uvBack = ใช้ลายครึ่งบน · inward = ผิวที่หัน −z เป็นด้านหน้า (ชั้นหลัง ผิวพิมพ์หันออกด้านหลัง) */
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

        add(new THREE.Mesh(sheetGeo(false, 0, false), fabric));
        add(new THREE.Mesh(sheetGeo(true, LAYER, true), fabric));
        // 🧵 สันพับด้านบน: ผ้าโค้งปิดระหว่าง 2 ชั้น (ไม่งั้นมองจากบนเห็นช่องว่าง) — สีผ้าตรงเส้นพับ
        const foldColor = (() => {
          const ctx = printCv.getContext("2d");
          if (!ctx) return 0xffffff;
          const d = ctx.getImageData(Math.round((W / 2) * kMm), Math.round((H / 2) * kMm), 1, 1).data;
          return new THREE.Color(`rgb(${d[0]},${d[1]},${d[2]})`).getHex();
        })();
        {
          const fr = LAYER / 2 + TUN + 0.2;
          const fold = add(new THREE.Mesh(g(new THREE.CylinderGeometry(fr, fr, Wt, 16, 1, true)), cloth(null, foldColor, THREE.DoubleSide)), false);
          fold.rotation.z = Math.PI / 2;
          fold.position.set(0, yTop, -LAYER / 2);
        }

        if (style === "button") {
          // 🔘 กระดุมแป๊กตามรูในเทมเพลต (ห่างเส้นพับ ~3% ของความสูงผืน): ซ้าย 2 เม็ด = ตัวเมียบนชั้นหน้า (ปรับได้ 2 ระดับ) · ขวา 1 เม็ด = ตัวผู้ด้านหลัง
          const sr = Math.max(4, W * 0.014);
          const dFold = H * 0.014;
          const socket = (xFrac: number) => {
            const v = pos(...stAt(W * xFrac, dFold));
            const ring = add(new THREE.Mesh(g(new THREE.TorusGeometry(sr, sr * 0.22, 12, 32)), snapMat));
            ring.position.set(v.x, v.y, v.z + 0.6);
            const hole = add(new THREE.Mesh(g(new THREE.CylinderGeometry(sr * 0.55, sr * 0.55, 0.8, 24)), snapHole));
            hole.rotation.x = Math.PI / 2;
            hole.position.set(v.x, v.y, v.z + 0.3);
          };
          socket(0.1);
          socket(0.17);
          const v = pos(...stAt(W * 0.9, dFold), LAYER);
          const cap = add(new THREE.Mesh(g(new THREE.SphereGeometry(sr, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)), snapMat));
          cap.scale.set(1, 0.35, 1);
          cap.rotation.x = -Math.PI / 2;
          cap.position.set(v.x, v.y, v.z - 0.3);
          // ปลายขวาด้านหน้า: ฝากระดุมตัวผู้ (หมุดทะลุ 2 ชั้น) ให้เห็นว่าปลายนี้ติดกระดุม (เจ้าของร้านชี้ 23 ต.ค. 69 "ตรงนี้ต้องมีกระดุมเพื่อติดด้วย")
          const vf = pos(...stAt(W * 0.9, dFold));
          const capF = add(new THREE.Mesh(g(new THREE.SphereGeometry(sr, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)), snapMat));
          capF.scale.set(1, 0.35, 1);
          capF.rotation.x = Math.PI / 2;
          capF.position.set(vf.x, vf.y, vf.z + 0.3);
          const rimF = add(new THREE.Mesh(g(new THREE.TorusGeometry(sr, sr * 0.12, 10, 32)), snapMat));
          rimF.position.set(vf.x, vf.y, vf.z + 0.35);
        } else {
          // 🦮 สายปลอกคอเดิม (ไม่รวมในงาน) สอดอยู่ในช่องพับระหว่างผ้า 2 ชั้น ยื่นพ้นผ้าสองข้าง + หัวเข็มขัดปลายซ้าย
          const sy = yTop - strapW * 0.62;
          const len = Wt * 1.35;
          const strap = add(new THREE.Mesh(g(new THREE.BoxGeometry(len, strapW, STRAP_T)), strapMat));
          strap.position.set(0, sy, -LAYER / 2);
          const bw = strapW * 1.35;
          const bh = strapW * 1.45;
          const bx = -len / 2 - bw / 2 + 2;
          const bar = (w: number, h: number, x: number, y: number) => {
            const b = add(new THREE.Mesh(g(new THREE.BoxGeometry(w, h, 2.6)), metal));
            b.position.set(bx + x, sy + y, -LAYER / 2);
          };
          bar(bw, 2.6, 0, bh / 2);
          bar(bw, 2.6, 0, -bh / 2);
          bar(2.6, bh, -bw / 2, 0);
          bar(2.6, bh, bw / 2, 0);
          bar(2, bh * 0.95, bw * 0.1, 0);
        }

        const lookY = bottomY + Ht * 0.5;
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
          // กล่องแคบ (มีแผงหมาข้าง ๆ / จอมือถือ) ถอยกล้องให้ผืนกว้างยังอยู่ในกรอบ
          const dist = (BASE_DIST / c.zoom) * Math.max(1, 1.5 / camera.aspect);
          const cp2 = Math.cos(c.pitch);
          // หมุนรอบแกนคอ (z = −R) ไม่ใช่รอบผิวหน้าผ้า
          camera.position.set(dist * Math.sin(c.yaw) * cp2, dist * Math.sin(c.pitch) + lookY, dist * Math.cos(c.yaw) * cp2);
          camera.lookAt(0, lookY, 0);
          sun.position.set(camera.position.x, 0, camera.position.z).normalize().multiplyScalar(BASE_DIST * 1.1);
          sun.position.y = BASE_DIST * 0.9;
          sun.position.x += BASE_DIST * 0.3 * Math.cos(c.yaw);
          sun.position.z -= BASE_DIST * 0.3 * Math.sin(c.yaw);
          sun.target.position.set(0, lookY, 0);
          sun.target.updateMatrixWorld();
          fill.position.copy(camera.position);
          fill.target.position.set(0, lookY, 0);
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
      <div className="relative flex w-full max-w-4xl flex-col rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
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

        <div className="mx-3 flex flex-col gap-2 sm:flex-row">
        <div
          ref={boxRef}
          className="relative h-[min(52vh,480px)] min-w-0 cursor-grab sm:flex-1 touch-none select-none overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_50%_38%,#ffffff_0%,#f1f5f9_55%,#e2e8f0_100%)] ring-1 ring-stone-200/70 active:cursor-grabbing"
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
            <span className="truncate text-xs font-bold text-stone-700">{spin ? "หมุนโชว์รอบตัว" : BANDANA_VIEW_TH[view]}</span>
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
        <div className="relative h-[220px] shrink-0 overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_50%_38%,#ffffff_0%,#f1f5f9_55%,#e2e8f0_100%)] ring-1 ring-stone-200/70 sm:h-[min(52vh,480px)] sm:w-[34%]">
          <canvas ref={dogRef} className={`h-full w-full object-contain transition-opacity ${dogReady ? "opacity-100" : "opacity-0"}`} />
          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-extrabold text-stone-700 shadow-sm ring-1 ring-stone-200">
            🐶 ตอนใส่จริง · ด้านหน้า
          </span>
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
          </div>
          <p className="text-center text-[11px] text-stone-400">
            ภาพจำลองโดยประมาณ — ผืนพับครึ่งตามเส้นประแนวนอน ด้านหน้า = ครึ่งล่างของแบบ · หมุนไปด้านหลังเห็นครึ่งบน (กลับหัวตามการพับ)
            {mock.style === "button" ? " · กระดุมแป๊กตามรูในเทมเพลต" : " · สายปลอกคอไม่รวมในงาน"} · สีจริงอาจต่างจากหน้าจอเล็กน้อย
          </p>
        </div>
      </div>
    </div>
  );
}
