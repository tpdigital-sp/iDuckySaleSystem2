import "server-only";

/**
 * กรอง HTML ที่แอดมินพิมพ์เอง ก่อนขึ้นหน้าเว็บสาธารณะ — ตัด script, style, iframe,
 * on-handler และ javascript: (ยกเว้น iframe ฝังวิดีโอจาก YouTube)
 * ใช้ร่วมกันทั้งบทความและบล็อกโค้ดบนหน้าแรก
 */
const YT_IFRAME =
  /<iframe[^>]+src="https:\/\/(?:www\.)?(?:youtube\.com|youtube-nocookie\.com)\/embed\/[\w-]+[^"]*"[^>]*>\s*<\/iframe>/gi;

export function sanitizeHtml(h: string): string {
  const kept: string[] = [];
  const tag = `YTEMBED${Math.random().toString(36).slice(2, 10)}`;
  const out = h
    .replace(YT_IFRAME, (m) => {
      if (/\son\w+\s*=/i.test(m) || /srcdoc/i.test(m)) return ""; // กันยัด handler มากับแท็ก
      kept.push(m);
      return `[[${tag}:${kept.length - 1}]]`;
    })
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|link|meta)[^>]*\/?\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*(['"]?)\s*javascript:[^'">\s]*\2/gi, '$1="#"')
    .slice(0, 300000);
  return out.replace(new RegExp(`\\[\\[${tag}:(\\d+)\\]\\]`, "g"), (_, i) => kept[Number(i)] ?? "");
}
