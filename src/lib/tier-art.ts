/**
 * 🏅 ภาพตรา + สีของระดับสมาชิก (ฝั่งหน้าร้าน) — ชุดเดียวที่ใช้ทุกหน้า
 *
 * ย้ายมาจาก /account (12 ต.ค. 69) เพื่อให้หน้า /member กับหน้าบัญชีใช้ตรา/สีชุดเดียวกัน
 * ตรา = ภาพจริงจากไฟล์ต้นแบบที่ /public/account/rank/<id>.webp (ตราเต็ม 220px) และ <id>-ico.webp (ไอคอน 200px)
 * ⚠️ คนละชุดกับ tierColor() ใน @/lib/tiers — อันนั้นเป็นโทนเข้ม (โลหะ/อัญมณี) ใช้หลังบ้าน/ป้ายเล็ก
 */
import { BASE_TIER_ID, type Tier } from "./tiers";

/** สีกรอบรูป/ป้าย/การ์ด ตามระดับ [อ่อน, เข้ม] — คีย์ด้วย id ระดับ (ไม่ตรงมาตรฐาน → วนตามลำดับ) */
export const TIER_RING: Record<string, [string, string]> = {
  bronze: ["#F2A97C", "#C4703F"],
  silver: ["#D3E6FB", "#8FA6CC"],
  gold: ["#FFD879", "#E8A22E"],
  platinum: ["#7EE8C0", "#1C9B74"],
  diamond: ["#8ED6FF", "#B49AF0"],
};
const RING_ORDER = Object.keys(TIER_RING);

export function tierRing(tier: Tier | null, index: number): [string, string] {
  if (!tier) return ["#57B6E8", "#2C81C4"];
  if (tier.id === BASE_TIER_ID) return ["#CBD5E1", "#94A3B8"]; // ระดับเริ่มต้น (ยังไม่ถึง Bronze) = เทากลาง
  return TIER_RING[tier.id] ?? TIER_RING[RING_ORDER[index % RING_ORDER.length]];
}

/** ระดับที่ตัวหนังสือบนพื้นสีอ่านยากถ้าเป็นขาว → ใช้กรมท่า */
export const DARK_TEXT_TIERS = new Set(["silver", "gold", BASE_TIER_ID]);

/** ตราระดับ (ภาพจริงจากไฟล์ต้นแบบ) — ครบทั้ง 5 ระดับ */
export const MEDAL_ART = ["bronze", "silver", "gold", "platinum", "diamond"] as const;
export type MedalArt = (typeof MEDAL_ART)[number];
const MEDAL_ID: Record<string, MedalArt> = {
  bronze: "bronze",
  silver: "silver",
  gold: "gold",
  platinum: "platinum",
  diamond: "diamond",
};

/** ชื่อไฟล์ตราของระดับ — ไม่รู้จัก id ก็เดาจากลำดับ · ระดับเริ่มต้นไม่มีตรา (คืน null ใช้อีโมจิแทน) */
export function medalArt(tier: Tier | null, index: number): MedalArt | null {
  if (!tier || tier.id === BASE_TIER_ID) return null;
  return MEDAL_ID[tier.id] ?? MEDAL_ART[Math.min(index, MEDAL_ART.length - 1)];
}

/** path ภาพตรา — size "full" = ตราเต็มมีกรอบ · "ico" = ไอคอนมงกุฎล้วน */
export const medalSrc = (art: MedalArt, size: "full" | "ico" = "full") => `/account/rank/${art}${size === "ico" ? "-ico" : ""}.webp`;
