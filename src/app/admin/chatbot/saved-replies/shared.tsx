/* eslint-disable @next/next/no-img-element */

/**
 * 💬 ชิ้นส่วนร่วมของข้อความตอบกลับ (LINE OA saved replies) — หน้า /admin/chatbot/saved-replies และตัวเลือกในหน้าแชท LINE
 * อิโมจิ LINE: ตัว "$" ใน text ที่ตำแหน่ง emojis[].index (UTF-16) = รูปอิโมจิ (productId/emojiId)
 */
export type Emoji = { index: number; productId: string; emojiId: string; altText?: string };
export type Msg = { type: string; text?: string; emojis?: Emoji[]; url?: string; previewUrl?: string };
export type Reply = { id: string; title: string; messages: Msg[]; favorite?: boolean; updatedAt?: string; editedAt?: string; editedBy?: string };

export const textOf = (r: Reply) =>
  r.messages
    .map((m) => m.text)
    .filter(Boolean)
    .join("\n\n");
export const emojiUrl = (e: Emoji) => `https://stickershop.line-scdn.net/sticonshop/v1/sticon/${e.productId}/iPhone/${e.emojiId}.png`;
/** อิโมจิ LINE ของข้อความแรก (ข้อความตอบกลับใน OA มีบับเบิลเดียว) */
export const emojisOf = (r: Reply | null) => r?.messages.find((m) => m.text)?.emojis ?? [];

/**
 * ข้อความ + อิโมจิ LINE — "$" ที่ตำแหน่ง index กลายเป็นรูป (แบบหน้า OA)
 * oneLine = แถวในตาราง (ยุบช่องว่าง · ตัดท้าย …)
 */
export function RichText({ text, emojis, oneLine }: { text: string; emojis: Emoji[]; oneLine?: boolean }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const e of emojis) {
    if (e.index < at || text[e.index] !== "$") continue;
    parts.push(text.slice(at, e.index));
    parts.push(<img key={e.index} src={emojiUrl(e)} alt={e.altText || "อิโมจิ"} title={e.altText} className="inline-block h-[1.25em] w-[1.25em] align-[-0.25em]" />);
    at = e.index + 1;
  }
  parts.push(text.slice(at));
  const out = oneLine ? parts.map((p) => (typeof p === "string" ? p.replace(/\s+/g, " ") : p)) : parts;
  return <>{out}</>;
}

/** หลังแก้ข้อความ: จับอิโมจิเดิมเข้ากับ "$" ในข้อความใหม่ตามลำดับ (ลบ "$" = อิโมจินั้นหาย · "$" เกิน = ตัวอักษรธรรมดา) */
export function realignEmojis(text: string, emojis: Emoji[]): Emoji[] {
  const pos: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] === "$") pos.push(i);
  return emojis.slice(0, pos.length).map((e, k) => ({ ...e, index: pos[k] }));
}

