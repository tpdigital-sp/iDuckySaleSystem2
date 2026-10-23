"use client";

/**
 * 🚪🧊 โมเดล 3D ป้ายแขวนประตู — ลายที่ลูกค้าออกแบบอยู่บนแผ่นจริง แขวนบนก้านมือจับประตู
 * (เจ้าของร้านสั่ง 23 ต.ค. 69 "เพิ่ม 3D ให้หน่อย")
 *
 * three.js โหลดตอนกดปุ่มเท่านั้น (import()) · โครงเดียวกับ Stand3D (RoomEnvironment · ไฟตามกล้อง · ลาก=หมุน · ล้อ/หยิก=ซูม)
 * แผ่น = ทรงตามเส้นไดคัทของเทมเพลต (cut · มม. พิกัดอาร์ตบอร์ด) อัดหนาตามวัสดุ (lib/door-hanger-mock) · ลายครอปตามเส้นนั้นเหมือนไฟล์งาน
 *   ด้านหลัง: งาน 2 ด้าน = ลายหน้า 2 (backSheet · วาดในพิกัด "มองจากด้านหลัง" แบบไกด์กลับข้างของจอออกแบบ)
 *             ด้านเดียว = เนื้อวัสดุเปล่า · อะคริลิคใสพิมพ์รองขาวใต้ลาย → หลังเห็นเงาขาวตามทรงลาย (เจ้าของร้านแจ้ง 23 ต.ค. 69)
 *             · PET ใสไม่มีรองขาวในโมเดล → มองทะลุเห็นลายด้านหน้ากลับด้าน
 * ช่องแขวน = จุดว่างที่ไกลขอบชิ้นงานที่สุดในครึ่งบน (ทรงตะขอ = วงใน · แคปซูล = รูกลม) → ก้านมือจับลอดช่องนั้น
 * ประตูซ่อนเองตอนกล้องอ้อมไปด้านหลัง จะได้เห็นด้านหลังป้าย
 */

import { useEffect, useRef, useState } from "react";
import type { TemplateCurve } from "@/lib/design-templates";
import { DOOR_HANGER_MAT, DOOR_HANGER_VIEW_TH, tintIsClear, type DoorHangerMock, type DoorHangerTint, type DoorHangerView } from "@/lib/door-hanger-mock";

/** มุมกล้อง (เรเดียน รอบแกนตั้ง) — ด้านหน้าป้ายหันไป +z */
const VIEW_YAW: Record<DoorHangerView, number> = { front: 0, right: Math.PI / 2, left: -Math.PI / 2, back: Math.PI };

/** ก้านมือจับ (มม.) — รัศมีก้าน · ยาวจากหน้าประตู · ระยะหน้าประตูถึงหลังป้าย */
const NECK_R = 8;
const NECK_L = 58;
const PLATE_Z = 18;

const tracePath = (ctx: CanvasRenderingContext2D, cut: TemplateCurve[], k: number) => {
  ctx.beginPath();
  for (const c of cut) {
    ctx.moveTo(c.s[0] * k, c.s[1] * k);
    for (const g of c.g) ctx.bezierCurveTo(g[0] * k, g[1] * k, g[2] * k, g[3] * k, g[4] * k, g[5] * k);
    ctx.closePath();
  }
};

/** ครอปลายตามเส้นไดคัท (นอกเส้น = โปร่ง) · k = พิกเซล/มม. */
function clipCanvas(src: HTMLCanvasElement, cut: TemplateCurve[], k: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  tracePath(ctx, cut, k);
  ctx.fillStyle = "#000";
  ctx.fill("evenodd");
  return out;
}

/** เส้นไดคัทกลับซ้าย-ขวา (มุมมองจากด้านหลัง) */
const mirrorCut = (cut: TemplateCurve[], W: number): TemplateCurve[] =>
  cut.map((c) => ({ s: [W - c.s[0], c.s[1]], g: c.g.map((g) => [W - g[0], g[1], W - g[2], g[3], W - g[4], g[5]] as TemplateCurve["g"][number]) }));

/**
 * ช่องแขวน — ระยะห่างถึงเนื้อชิ้นงาน (distance transform 1 ช่อง/มม.) สูงสุดในครึ่งบน ที่มีเนื้อชิ้นงานอยู่ทั้งเหนือและขวา
 * คืน { x, y (มม. y ลง), r } · หาไม่เจอ = กลางบน
 */
function hangSlot(cut: TemplateCurve[], W: number, H: number): { x: number; y: number; r: number } {
  const cw = Math.ceil(W);
  const ch = Math.ceil(H);
  const cv = document.createElement("canvas");
  cv.width = cw;
  cv.height = ch;
  const ctx = cv.getContext("2d");
  if (!ctx) return { x: W / 2, y: H * 0.15, r: 15 };
  tracePath(ctx, cut, 1);
  ctx.fillStyle = "#000";
  ctx.fill("evenodd");
  const a = ctx.getImageData(0, 0, cw, ch).data;
  const solid = (x: number, y: number) => a[(y * cw + x) * 4 + 3] > 127;
  const INF = 1e9;
  const d = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) d[y * cw + x] = solid(x, y) ? 0 : INF;
  const D2 = Math.SQRT2;
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y > 0) d[i] = Math.min(d[i], d[i - cw] + 1);
      if (x > 0 && y > 0) d[i] = Math.min(d[i], d[i - cw - 1] + D2);
      if (x < cw - 1 && y > 0) d[i] = Math.min(d[i], d[i - cw + 1] + D2);
    }
  for (let y = ch - 1; y >= 0; y--)
    for (let x = cw - 1; x >= 0; x--) {
      const i = y * cw + x;
      if (x < cw - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y < ch - 1) d[i] = Math.min(d[i], d[i + cw] + 1);
      if (x < cw - 1 && y < ch - 1) d[i] = Math.min(d[i], d[i + cw + 1] + D2);
      if (x > 0 && y < ch - 1) d[i] = Math.min(d[i], d[i + cw - 1] + D2);
    }
  const hasAbove = (x: number, y: number) => {
    for (let yy = y - 1; yy >= 0; yy--) if (solid(x, yy)) return true;
    return false;
  };
  const hasRight = (x: number, y: number) => {
    for (let xx = x + 1; xx < cw; xx++) if (solid(xx, y)) return true;
    return false;
  };
  let best = { x: W / 2, y: H * 0.15, r: 0 };
  for (let y = 1; y < ch * 0.5; y++)
    for (let x = 1; x < cw - 1; x++) {
      const v = d[y * cw + x];
      if (v === 0 || v >= INF || v <= best.r) continue;
      if (hasAbove(x, y) && hasRight(x, y)) best = { x, y, r: v };
    }
  return best.r > 0 ? best : { x: W / 2, y: H * 0.15, r: 15 };
}

/** ขนาดลายเกล็ด 1 แผ่นปู (มม.) — ปูซ้ำทั้งแผ่น · ความละเอียด 10 px/มม. */
const FLAKE_MM = 50;
const FLAKE_PX = 512;

/**
 * ✨ เกล็ด/อนุภาคในเนื้ออะคริลิค (ตามภาพตัวอย่างของร้าน)
 * sparkle/holo = พื้นโปร่ง (วางเป็นชั้นกลางแผ่นใส) · glitter = พื้นสีเฉด + เกล็ดแน่นสีอ่อน/เข้มกว่าพื้น
 */
function flakeCanvas(tint: DoorHangerTint): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = FLAKE_PX;
  const x = c.getContext("2d");
  if (!x) return c;
  const R = Math.random;
  const mm = FLAKE_PX / FLAKE_MM;
  const hex = `#${tint.color.toString(16).padStart(6, "0")}`;
  const rainbow = (l = 62) => `hsl(${Math.floor(R() * 360)},95%,${l}%)`;
  const flakeColor = () =>
    tint.flake === "gold"
      ? `hsl(${40 + R() * 10},${85 + R() * 15}%,${45 + R() * 20}%)`
      : tint.flake === "silver"
        ? `hsl(220,6%,${70 + R() * 28}%)`
        : rainbow();
  // ทรงอนุภาค (กลางที่ 0,0 · ขนาด r px)
  const star = (r: number) => {
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    x.closePath();
    x.fill();
  };
  const heart = (r: number) => {
    x.beginPath();
    x.moveTo(0, r * 0.35);
    x.bezierCurveTo(-r * 1.1, -r * 0.35, -r * 0.45, -r * 1.05, 0, -r * 0.45);
    x.bezierCurveTo(r * 0.45, -r * 1.05, r * 1.1, -r * 0.35, 0, r * 0.35);
    x.lineWidth = Math.max(2, r * 0.15);
    x.stroke();
  };
  const snow = (r: number) => {
    x.lineWidth = Math.max(1.5, r * 0.08);
    x.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const ex = Math.cos(a) * r;
      const ey = Math.sin(a) * r;
      x.moveTo(0, 0);
      x.lineTo(ex, ey);
      for (const f of [0.55, 0.8]) {
        const bx = Math.cos(a) * r * f;
        const by = Math.sin(a) * r * f;
        x.moveTo(bx, by);
        x.lineTo(bx + Math.cos(a + 0.7) * r * 0.25, by + Math.sin(a + 0.7) * r * 0.25);
        x.moveTo(bx, by);
        x.lineTo(bx + Math.cos(a - 0.7) * r * 0.25, by + Math.sin(a - 0.7) * r * 0.25);
      }
    }
    x.stroke();
  };
  const shard = (r: number) => {
    x.beginPath();
    const n = 3 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + R() * 0.8;
      const rr = r * (0.5 + R() * 0.6);
      x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    x.closePath();
    x.fill();
  };
  const scatter = (n: number, draw: (r: number) => void, rMm: [number, number], color: () => string, alpha: [number, number] = [0.7, 1]) => {
    for (let i = 0; i < n; i++) {
      const r = (rMm[0] + R() * (rMm[1] - rMm[0])) * mm;
      x.save();
      x.translate(R() * FLAKE_PX, R() * FLAKE_PX);
      x.rotate(R() * Math.PI * 2);
      x.globalAlpha = alpha[0] + R() * (alpha[1] - alpha[0]);
      x.fillStyle = x.strokeStyle = color();
      draw(r);
      x.restore();
    }
  };
  const dot = (r: number) => {
    x.beginPath();
    x.arc(0, 0, r, 0, Math.PI * 2);
    x.fill();
  };
  const hexFlake = (r: number) => {
    x.beginPath();
    for (let i = 0; i < 6; i++) x.lineTo(Math.cos((Math.PI / 3) * i) * r, Math.sin((Math.PI / 3) * i) * r);
    x.closePath();
    x.fill();
  };
  if (tint.finish === "glitter") {
    // กากเพชรแน่น — พื้นเฉด + เกล็ดหกเหลี่ยมอ่อน/เข้มกว่าพื้นเต็มแผ่น
    x.fillStyle = hex;
    x.fillRect(0, 0, FLAKE_PX, FLAKE_PX);
    const shade = (k: number) => {
      const r0 = (tint.color >> 16) & 255;
      const g0 = (tint.color >> 8) & 255;
      const b0 = tint.color & 255;
      const f = (v: number) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
      return `rgb(${f(r0)},${f(g0)},${f(b0)})`;
    };
    scatter(5200, hexFlake, [0.12, 0.3], () => shade(R() * 1.3 - 0.45), [0.8, 1]);
    return c;
  }
  if (tint.finish === "sparkle") {
    // กลิตเตอร์โปรยในเนื้อใส — เกล็ดเล็ก ๆ ห่าง ๆ (ภาพตัวอย่าง: ใสมองทะลุ เห็นเกล็ดกระจาย)
    scatter(480, hexFlake, [0.25, 0.55], flakeColor);
    return c;
  }
  // 🌈 โฮโลแกรม — วาดอนุภาคเป็น "ขาว" (มาสก์) · สีรุ้งมาจาก holoSheen ที่เลื่อนตามมุมกล้อง (ภาพตัวอย่าง: สีไล่ต่อเนื่องเป็นแถบ ไม่ใช่สุ่มทีละเม็ด)
  //    ขนาด/ความแน่นเทียบภาพตัวอย่างร้าน (acrylic-colors/holo-*-v2.jpg) · film/rainbow = ฟิล์มทั้งแผ่น อนุภาคแค่ประกายจาง ๆ
  const W = () => "#ffffff";
  const ring = (r: number) => {
    x.lineWidth = Math.max(1.2, r * 0.16);
    x.beginPath();
    x.arc(0, 0, r, 0, Math.PI * 2);
    x.stroke();
  };
  const sparkle4 = (r: number) => {
    x.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      const rr = i % 2 ? r * 0.18 : i % 4 ? r * 0.55 : r;
      x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    x.closePath();
    x.fill();
  };
  switch (tint.pattern) {
    case "shards":
      scatter(36, shard, [2, 5], W, [0.55, 0.9]);
      scatter(200, dot, [0.05, 0.12], W, [0.3, 0.7]);
      break;
    case "dots":
      scatter(1500, hexFlake, [0.4, 0.65], W, [0.7, 1]);
      break;
    case "snow":
      scatter(4, snow, [6, 10], W);
      scatter(14, ring, [0.8, 2.2], W, [0.6, 0.9]);
      scatter(10, heart, [1.4, 2.4], W, [0.6, 0.9]);
      break;
    case "stars":
      scatter(26, sparkle4, [1.2, 3.2], W);
      scatter(30, star, [0.6, 1.4], W);
      scatter(500, dot, [0.05, 0.1], W, [0.3, 0.8]);
      break;
    case "stardust":
      scatter(5200, hexFlake, [0.1, 0.2], W, [0.5, 1]);
      scatter(10, star, [0.9, 1.5], W);
      break;
    case "dust":
      scatter(6000, hexFlake, [0.07, 0.14], W, [0.5, 1]);
      break;
    case "hearts":
      scatter(4, heart, [7, 11], W);
      scatter(10, heart, [1.6, 3], W, [0.5, 0.8]);
      scatter(160, dot, [0.06, 0.14], W, [0.3, 0.8]);
      break;
    default:
      scatter(140, dot, [0.05, 0.1], W, [0.2, 0.5]);
  }
  return c;
}

/** 🌈 ช่วงสีโฮโลแกรม (แถบไล่ทแยง วนซ้ำ) — film = ฟิล์มเขียวน้ำทะเล-ม่วง (hologram-01) · อื่น ๆ = รุ้งเต็มวง */
const SHEEN_MM = 70;
function holoSheen(pattern?: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  if (!x) return c;
  // ไล่ตามแกน x อย่างเดียว + สีหัว = สีท้าย → ปูซ้ำไม่เห็นรอยต่อ (เอียงทแยงด้วย texture.rotation)
  const g = x.createLinearGradient(0, 0, 256, 0);
  const stops =
    pattern === "film"
      ? ["#bff5ff", "#4fd6d8", "#2a9fb8", "#9b8cff", "#e9d6ff", "#4fd6d8", "#bff5ff"]
      : ["#ff3b5c", "#ffb03b", "#f5f04a", "#3df59a", "#2fb8ff", "#7a5cff", "#ff4fd0", "#ff3b5c"];
  stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col));
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  return c;
}

export default function DoorHanger3D({
  sheet,
  backSheet,
  sheetMm,
  cut,
  mock,
  title,
  onClose,
}: {
  /** ลายด้านหน้าทั้งอาร์ตบอร์ด (วาดจากตัววาดจริงของจอออกแบบ · ยังไม่ครอป) */
  sheet: HTMLCanvasElement;
  /** ลายด้านหลัง (งาน 2 ด้าน · พิกัดมองจากด้านหลัง) · null = ด้านเดียว */
  backSheet?: HTMLCanvasElement | null;
  sheetMm: { w: number; h: number };
  /** เส้นไดคัทของเทมเพลต (มม. พิกัดอาร์ตบอร์ด) · ไม่มี = ใช้ทั้งสี่เหลี่ยม */
  cut?: TemplateCurve[] | null;
  mock: DoorHangerMock;
  title: string;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [spin, setSpin] = useState(false);
  const [view, setView] = useState<DoorHangerView>("front");
  const [zoom, setZoomState] = useState(1);
  const clampZ = (z: number) => Math.max(0.6, Math.min(3, z));
  const cam = useRef({ yaw: -0.35, pitch: 0.12, zoom: 1, targetYaw: null as number | null, spin: false, dragging: false });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const mat = DOOR_HANGER_MAT[mock.material];
  const setZoom = (fn: (z: number) => number) => {
    const z = clampZ(fn(cam.current.zoom));
    cam.current.zoom = z;
    setZoomState(z);
  };
  const goView = (v: DoorHangerView) => {
    setView(v);
    const cur = cam.current.yaw;
    let t = VIEW_YAW[v];
    while (t - cur > Math.PI) t -= 2 * Math.PI;
    while (t - cur < -Math.PI) t += 2 * Math.PI;
    cam.current.targetYaw = t;
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
        const k = sheet.width / W;
        const cutCs: TemplateCurve[] = cut?.length ? cut : [{ s: [0, 0], g: [[W, 0, W, 0, W, 0], [W, H, W, H, W, H], [0, H, 0, H, 0, H], [0, 0, 0, 0, 0, 0]] }];
        const backCs = mirrorCut(cutCs, W);
        const slot = hangSlot(cutCs, W, H);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.NeutralToneMapping;
        renderer.toneMappingExposure = 1;
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
        scene.environmentIntensity = 0.45;

        const camera = new THREE.PerspectiveCamera(28, 1, 1, 6000);
        const BASE_DIST = Math.max(W, H) * 2.7;

        const sun = new THREE.DirectionalLight(0xffffff, 1.1);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const sh = Math.max(W, H) * 1.4;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -sh;
        sun.shadow.camera.right = sun.shadow.camera.top = sh;
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = 3000;
        sun.shadow.bias = -0.0005;
        sun.shadow.radius = 4;
        scene.add(sun);
        scene.add(new THREE.AmbientLight(0xffffff, 1.0));

        const geos: { dispose(): void }[] = [];
        const mats: { dispose(): void }[] = [];
        const g = <T extends { dispose(): void }>(x: T) => (geos.push(x), x);
        const m = <T extends { dispose(): void }>(x: T) => (mats.push(x), x);

        /** ทรงแผ่นจากเส้นไดคัท (y กลับด้าน: อาร์ตบอร์ด y ลง → โลก y ขึ้น) · เส้นใหญ่สุด = ขอบนอก ที่เหลือ = รู */
        const toShape = (cs: TemplateCurve[]) => {
          const area = (c: TemplateCurve) => {
            let s = 0;
            let px = c.s[0];
            let py = c.s[1];
            for (const sg of c.g) {
              s += px * sg[5] - sg[4] * py;
              px = sg[4];
              py = sg[5];
            }
            return Math.abs(s / 2);
          };
          const sorted = [...cs].sort((a, b) => area(b) - area(a));
          const path = (c: TemplateCurve, p: InstanceType<typeof THREE.Path>) => {
            p.moveTo(c.s[0], H - c.s[1]);
            for (const sg of c.g) p.bezierCurveTo(sg[0], H - sg[1], sg[2], H - sg[3], sg[4], H - sg[5]);
            p.closePath();
          };
          const shape = new THREE.Shape();
          path(sorted[0], shape);
          for (const h of sorted.slice(1)) {
            const hp = new THREE.Path();
            path(h, hp);
            shape.holes.push(hp);
          }
          return shape;
        };
        const texOf = (cv: HTMLCanvasElement) => {
          const t = new THREE.CanvasTexture(cv);
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = renderer.capabilities.getMaxAnisotropy();
          t.repeat.set(1 / W, 1 / H); // uv ของ ShapeGeometry = พิกัดมม.
          mats.push(t);
          return t;
        };

        // ── แผ่นป้าย ──
        const T = mat.t;
        const plate = new THREE.Group();
        const shape = toShape(cutCs);
        // 🎨 อะคริลิคสีพิเศษ — เนื้อแผ่นตามเฉด/ผิวที่เลือก (เจ้าของร้านแจ้ง 23 ต.ค. 69 "แสดงสี และวัสดุตามอะคริลิคที่เลือก
        //    เช่น กลิสเตอร์ทอง จะเป็นอคริลิคใสผสมกลิสเตอร์ทอง") · sparkle/holo = แผ่นใส + ชั้นเกล็ดกลางแผ่น
        const tint = mock.tint;
        const clearBase = mat.clear || tintIsClear(tint);
        const flakeTex = (t: DoorHangerTint) => {
          const tx = new THREE.CanvasTexture(flakeCanvas(t));
          tx.colorSpace = THREE.SRGBColorSpace;
          tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
          tx.repeat.set(1 / FLAKE_MM, 1 / FLAKE_MM); // uv ของแผ่น = มม.
          tx.anisotropy = renderer.capabilities.getMaxAnisotropy();
          mats.push(tx);
          return tx;
        };
        const tintMat = () => {
          if (!tint || tintIsClear(tint)) return null;
          const base = { color: tint.color, metalness: 0, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 };
          if (tint.finish === "frost") return m(new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.55, clearcoat: 0.4, transparent: true, opacity: 0.88 }));
          if (tint.finish === "mirror") return m(new THREE.MeshPhysicalMaterial({ ...base, metalness: 1, roughness: 0.04, envMapIntensity: 1.6 }));
          if (tint.finish === "glitter") return m(new THREE.MeshPhysicalMaterial({ ...base, color: 0xffffff, map: flakeTex(tint), metalness: 0.55, roughness: 0.32 }));
          return m(new THREE.MeshPhysicalMaterial(base));
        };
        const tinted = tintMat();
        const holo = tint?.finish === "holo";
        const faceMat = tinted
          ? tinted
          : clearBase
          ? m(
              new THREE.MeshPhysicalMaterial({
                color: 0xe6f4f8,
                roughness: 0.05,
                metalness: holo ? 0.25 : 0,
                clearcoat: 1,
                clearcoatRoughness: 0.04,
                envMapIntensity: 1.8,
                transparent: true,
                // มีชั้นเกล็ดให้เห็นแผ่นอยู่แล้ว → ผิวใสบางลง ไม่กลบสีเกล็ด
                opacity: holo ? 0.2 : tintIsClear(tint) ? 0.12 : 0.35,
                depthWrite: false,
                // 🌈 ฟิล์มโฮโลแกรม — ผิวเหลือบสีรุ้งเปลี่ยนตามมุมมอง
                ...(holo ? { iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [150, 950] as [number, number] } : {}),
              }),
            )
          : m(new THREE.MeshPhysicalMaterial({ color: mat.face, roughness: mock.material === "mdf" ? 0.3 : 0.45, metalness: 0, clearcoat: mock.material.startsWith("acrylic") || mock.material === "mdf" ? 0.6 : 0.1 }));
        const edgeMat = tinted
          ? tinted
          : clearBase
          ? m(new THREE.MeshPhysicalMaterial({ color: DOOR_HANGER_MAT["acrylic-clear"].edge, roughness: 0.1, transparent: true, opacity: 0.9, clearcoat: 1 }))
          : m(new THREE.MeshStandardMaterial({ color: mat.edge, roughness: mock.material === "mdf" ? 0.9 : 0.5 }));
        const body = new THREE.Mesh(g(new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 32 })), [faceMat, edgeMat]);
        body.position.z = -T / 2;
        body.castShadow = !clearBase;
        plate.add(body);
        // ✨ ชั้นเกล็ดกลางเนื้อแผ่นใส (กลิตเตอร์/โฮโลแกรม) — มองเห็นได้ทั้งสองด้าน ประกายตามแสง
        // 🌈 โฮโลแกรม: แถบสีรุ้งเลื่อนตามมุมกล้อง (tick) — ใช้เป็นสีของอนุภาค + ฟิล์มเหลือบทั้งแผ่น
        let sheenTex: InstanceType<typeof THREE.CanvasTexture> | null = null;
        let filmMat: InstanceType<typeof THREE.MeshBasicMaterial> | null = null;
        let filmBase = 0;
        if (tint && holo) {
          sheenTex = new THREE.CanvasTexture(holoSheen(tint.pattern));
          sheenTex.colorSpace = THREE.SRGBColorSpace;
          sheenTex.wrapS = sheenTex.wrapT = THREE.RepeatWrapping;
          sheenTex.repeat.set(1 / SHEEN_MM, 1 / SHEEN_MM);
          sheenTex.rotation = Math.PI / 5; // แถบสีเอียงทแยงแบบแผ่นโฮโลแกรมจริง
          mats.push(sheenTex);
          // ฟิล์ม: hologram-01/รุ้ง = ทั้งแผ่นเหลือบชัด (ภาพตัวอย่าง) · ลายอนุภาค = แค่เหลือบจาง ๆ
          filmBase = tint.pattern === "rainbow" ? 0.55 : tint.pattern === "film" ? 0.42 : 0.1;
          filmMat = m(new THREE.MeshBasicMaterial({ map: sheenTex, transparent: true, opacity: filmBase, depthWrite: false, side: THREE.DoubleSide }));
          const film = new THREE.Mesh(g(new THREE.ShapeGeometry(shape, 32)), filmMat);
          film.position.z = -T * 0.15;
          plate.add(film);
        }
        if (tint && tintIsClear(tint)) {
          const ft = flakeTex(tint);
          const flakes = new THREE.Mesh(
            g(new THREE.ShapeGeometry(shape, 32)),
            m(
              new THREE.MeshPhysicalMaterial({
                map: ft,
                // เรืองสีตัวเองนิดหน่อย — เกล็ดโลหะสะท้อนแต่ห้องสีเทา สีทอง/รุ้งจะซีด
                // โฮโลแกรม: เกล็ดเป็นมาสก์ขาว สีมาจากแถบรุ้ง (sheenTex · uv คนละชุดกับ map) → สีไล่ต่อเนื่องและเลื่อนเมื่อหมุน
                emissiveMap: sheenTex ?? ft,
                emissive: 0xffffff,
                emissiveIntensity: sheenTex ? 0.95 : 0.7,
                ...(sheenTex ? { color: 0x9aa3ad } : {}),
                transparent: true,
                alphaTest: 0.08,
                side: THREE.DoubleSide,
                metalness: 0.45,
                roughness: 0.3,
                envMapIntensity: 2,
                ...(holo ? { iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [150, 950] as [number, number] } : {}),
              }),
            ),
          );
          plate.add(flakes);
        }
        const printTex = (src: HTMLCanvasElement, cs: TemplateCurve[]) => texOf(clipCanvas(src, cs, k));
        // ลายด้านหน้า · อะคริลิคใสงานด้านเดียว: มีรองขาวใต้ลาย → หลังเห็นขาวตามทรงลาย (ไม่ใช่ลายกลับด้าน)
        //   PET ใสงานด้านเดียว: ไม่มีรองขาว → เห็นลายกลับด้านทะลุมาจากหลังแผ่น (DoubleSide)
        const whiteBack = (mock.material === "acrylic-clear" || tintIsClear(tint)) && !backSheet;
        const seeThrough = clearBase && !backSheet && !whiteBack;
        const frontPrint = clipCanvas(sheet, cutCs, k);
        const front = new THREE.Mesh(
          g(new THREE.ShapeGeometry(shape, 32)),
          m(
            new THREE.MeshPhysicalMaterial({
              map: texOf(frontPrint),
              roughness: 0.45,
              metalness: 0,
              clearcoat: 0.3,
              clearcoatRoughness: 0.35,
              transparent: true,
              alphaTest: 0.02,
              side: seeThrough ? THREE.DoubleSide : THREE.FrontSide,
            }),
          ),
        );
        front.position.z = T / 2 + 0.05;
        front.castShadow = true;
        plate.add(front);
        if (whiteBack) {
          // ⬜ รองขาว = เนื้อลาย (alpha) ถมขาว · เรขาคณิตเดียวกับด้านหน้า แสดงฝั่งหลัง (BackSide) → มองจากหลังกลับด้านเองตามจริง
          const white = document.createElement("canvas");
          white.width = frontPrint.width;
          white.height = frontPrint.height;
          const wc = white.getContext("2d");
          if (wc) {
            wc.fillStyle = "#ffffff";
            wc.fillRect(0, 0, white.width, white.height);
            wc.globalCompositeOperation = "destination-in";
            wc.drawImage(frontPrint, 0, 0);
          }
          const under = new THREE.Mesh(
            g(new THREE.ShapeGeometry(shape, 32)),
            m(new THREE.MeshPhysicalMaterial({ map: texOf(white), roughness: 0.5, metalness: 0, transparent: true, alphaTest: 0.02, side: THREE.BackSide })),
          );
          under.position.z = -T / 2 - 0.05;
          plate.add(under);
        }
        // ลายด้านหลัง (งาน 2 ด้าน) — ผืนวาดแบบมองจากหลัง (x กลับ) → หมุน 180° รอบแกนตั้งแล้วเลื่อนกลับ x = W
        if (backSheet) {
          const bshape = toShape(backCs);
          const backMesh = new THREE.Mesh(
            g(new THREE.ShapeGeometry(bshape, 32)),
            m(new THREE.MeshPhysicalMaterial({ map: printTex(backSheet, backCs), roughness: 0.45, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.35, transparent: true, alphaTest: 0.02 })),
          );
          backMesh.rotation.y = Math.PI;
          backMesh.position.set(W, 0, -T / 2 - 0.05);
          plate.add(backMesh);
        }
        // แขวน: ขอบบนของช่องพาดก้านมือจับ (ก้านอยู่ที่ x=0, y=0)
        const slotTopUp = H - slot.y + slot.r;
        plate.position.set(-slot.x, NECK_R - slotTopUp, PLATE_Z + T / 2);
        scene.add(plate);

        // ── มือจับก้านโยก + ประตู ──
        const metal = m(new THREE.MeshPhysicalMaterial({ color: 0xc9ced4, metalness: 1, roughness: 0.28, clearcoat: 0.4 }));
        const neck = new THREE.Mesh(g(new THREE.CylinderGeometry(NECK_R, NECK_R, NECK_L, 40)), metal);
        neck.rotation.x = Math.PI / 2;
        neck.position.z = NECK_L / 2;
        neck.castShadow = true;
        scene.add(neck);
        const leverL = Math.max(110, W * 1.05);
        const lever = new THREE.Mesh(g(new THREE.CapsuleGeometry(NECK_R * 0.95, leverL, 8, 24)), metal);
        lever.rotation.z = Math.PI / 2;
        lever.position.set(leverL / 2 - NECK_R, 0, NECK_L);
        lever.castShadow = true;
        scene.add(lever);
        const door = new THREE.Group();
        const DW = Math.max(W * 12, 1200);
        const DH = H * 4.5;
        const panel = new THREE.Mesh(
          g(new THREE.BoxGeometry(DW, DH, 40)),
          m(new THREE.MeshStandardMaterial({ color: 0xefe7db, roughness: 0.85 })),
        );
        panel.position.set(-W * 0.4, -H * 1.2, -20);
        panel.receiveShadow = true;
        door.add(panel);
        const rose = new THREE.Mesh(g(new THREE.CylinderGeometry(26, 28, 10, 48)), metal);
        rose.rotation.x = Math.PI / 2;
        rose.position.z = 5;
        rose.castShadow = true;
        door.add(rose);
        scene.add(door);

        // กล้องมองกลางแผ่นป้าย
        const look = new THREE.Vector3(plate.position.x + W / 2, plate.position.y + H / 2, PLATE_Z);

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
          const dist = BASE_DIST / c.zoom;
          const cp = Math.cos(c.pitch);
          camera.position.set(look.x + dist * Math.sin(c.yaw) * cp, look.y + dist * Math.sin(c.pitch), look.z + dist * Math.cos(c.yaw) * cp);
          camera.lookAt(look);
          // อ้อมไปด้านหลัง → ซ่อนประตู (ไม่งั้นบังด้านหลังป้าย)
          door.visible = Math.cos(c.yaw) > -0.05;
          sun.position.set(camera.position.x, 0, camera.position.z).normalize().multiplyScalar(BASE_DIST * 1.1);
          sun.position.y = look.y + BASE_DIST * 0.8;
          sun.position.x += BASE_DIST * 0.25 * Math.cos(c.yaw);
          sun.position.z -= BASE_DIST * 0.25 * Math.sin(c.yaw);
          sun.target.position.copy(look);
          sun.target.updateMatrixWorld();
          if (sheenTex) {
            // 🌈 หมุน/เงย = แถบสีเลื่อน + ฟิล์มเหลือบแรงขึ้น-ลงตามมุม (ภาพตัวอย่างโฮโลแกรมเปลี่ยนสีตามมุมมอง)
            sheenTex.offset.set(c.yaw * 0.32 + c.pitch * 0.4, c.yaw * 0.12);
            if (filmMat) filmMat.opacity = filmBase * (0.55 + 0.45 * Math.abs(Math.sin(c.yaw * 1.4 + c.pitch * 2)));
          }
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
        console.error("DoorHanger3D", e);
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
            🚪
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold leading-tight text-stone-800">
              <span className="shrink-0">ดูแบบ 3D</span>
              <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-stone-700 ring-1 ring-sky-200">
                <span className="truncate">ป้ายแขวนประตู</span>
                <span className="truncate text-stone-400">· {mock.tint?.name ?? mat.th}</span>
              </span>
            </p>
            <p className="truncate text-xs text-stone-500">
              {title} · ลาย {Math.round(sheetMm.w) / 10}×{Math.round(sheetMm.h) / 10} ซม.
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
          className="relative mx-3 h-[min(60vh,520px)] cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_50%_38%,#ffffff_0%,#f1f5f9_55%,#e2e8f0_100%)] ring-1 ring-stone-200/70 active:cursor-grabbing"
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
            cam.current.pitch = Math.max(-0.6, Math.min(1.1, d.pitch + (e.clientY - d.y) * 0.006));
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
            <span className="whitespace-nowrap rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-extrabold text-white">{backSheet ? "🚪 พิมพ์ 2 ด้าน" : "🚪 พิมพ์ด้านเดียว"}</span>
            <span className="truncate text-xs font-bold text-stone-700">{spin ? "หมุนโชว์รอบตัว" : DOOR_HANGER_VIEW_TH[view]}</span>
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
              {(["left", "front", "right", "back"] as DoorHangerView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={!spin && view === v}
                  onClick={() => goView(v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${!spin && view === v ? "bg-sky-600 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                >
                  {v === "front" ? "👁 ด้านหน้า" : DOOR_HANGER_VIEW_TH[v]}
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
            ภาพจำลองโดยประมาณ — ป้ายทรงตามเทมเพลต แขวนบนก้านมือจับประตู{backSheet
              ? " · ด้านหลังเป็นลายที่ 2"
              : mock.material === "acrylic-clear" || tintIsClear(mock.tint)
                ? " · ด้านหลังเห็นสีขาวตามทรงลาย (พิมพ์รองขาว)"
                : mat.clear
                  ? " · วัสดุใส ด้านหลังเห็นลายกลับด้าน"
                  : " · ด้านหลังเป็นเนื้อวัสดุเปล่า"} · สีจริงอาจต่างจากหน้าจอเล็กน้อย
          </p>
        </div>
      </div>
    </div>
  );
}
