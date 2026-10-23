"use client";

/**
 * 📮 ใบสรุปด้านหน้า/ด้านหลัง — งานพิมพ์ 2 ด้านจากจอออกแบบ (โปสการ์ด/ปฏิทินโฟโต้การ์ด/พัด ฯลฯ)
 * เจ้าของร้านแจ้ง 23 ต.ค. 69 (OD-261023-1997): ไฟล์ .pdf/.ai ไม่บอกว่าหน้าไหนด้านหน้า หน้าไหนด้านหลัง ฝ่ายผลิตดูไม่ออก
 * จับคู่ไฟล์ทีละหน้าเป็น "ใบ" จากชื่อหน้าในสเปค (sideSheetOf) · screen = หน้าออเดอร์ · print = ใบงาน (บรรทัดเดียว ไม่ดันใบเกิน 1 หน้า)
 */
import { sideSheetOf, type SideDesign } from "@/lib/print-sides";

type Item = Parameters<typeof sideSheetOf>[0] & { name?: string };

const cardName = (label: string, k: number) => label || `ใบที่ ${k + 1}`;

/** ข้อความหัวใบสรุป — ใช้ทั้งจอ ใบงาน และหน้าพิมพ์ */
function headline(designs: SideDesign[]) {
  const cards = designs.reduce((a, d) => a + d.cards.length, 0);
  return `พิมพ์ 2 ด้าน · ${cards} ใบ${designs.length > 1 ? ` (${designs.length} ลาย)` : ""}`;
}

const HOW = "ไฟล์ .pdf / .ai เรียงหน้า: ด้านหน้า → ด้านหลังของใบเดียวกัน แล้วต่อใบถัดไป (หน้าคี่ = ด้านหน้า · หน้าคู่ = ด้านหลัง)";

/** 🖨 เปิดหน้าต่างใบสรุปขนาด A4 แนวนอน แล้วสั่งพิมพ์ (ให้ฝ่ายผลิตแปะคู่กับไฟล์) */
function printSheet(designs: SideDesign[], title: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const fig = (side: "front" | "back", p?: { url: string; page: number }) =>
    p
      ? `<figure class="${side}"><img src="${esc(p.url)}"><figcaption><b>${side === "front" ? "ด้านหน้า" : "ด้านหลัง"}</b> หน้า ${p.page} ในไฟล์</figcaption></figure>`
      : `<figure class="${side} none"><div>ไม่มี${side === "front" ? "ด้านหน้า" : "ด้านหลัง"}</div></figure>`;
  const body = designs
    .map(
      (d) =>
        `${designs.length > 1 ? `<h2>ลายที่ ${d.no} · ไฟล์ ${d.pages} หน้า</h2>` : ""}${d.repeat ? `<p class="rep">${esc(d.repeat)}</p>` : ""}` +
        `<div class="grid">${d.cards
          .map((c, k) => `<div class="card"><h3>${esc(cardName(c.label, k))}</h3><div class="pair">${fig("front", c.front)}${fig("back", c.back)}</div></div>`)
          .join("")}</div>`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} · ใบสรุปหน้า-หลัง</title><style>
@page{size:A4 landscape;margin:10mm}
body{font-family:Thonburi,"Noto Sans Thai",sans-serif;color:#0f172a;margin:0}
h1{font-size:18pt;margin:0 0 1.5mm} h2{font-size:12pt;margin:4mm 0 1.5mm} .sub{color:#334155;font-size:10pt;margin:0 0 3mm}
.rep{background:#fef3c7;color:#78350f;border-radius:2mm;padding:1.5mm 3mm;font-weight:700;font-size:10.5pt;margin:0 0 3mm}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:3.5mm}
.card{border:.4mm solid #cbd5e1;border-radius:2.5mm;padding:2mm;break-inside:avoid}
h3{margin:0 0 1.5mm;font-size:11.5pt} .pair{display:grid;grid-template-columns:1fr 1fr;gap:1.5mm}
figure{margin:0} img{width:100%;display:block;border:.9mm solid}
.front img{border-color:#0284c7} .back img{border-color:#ea580c}
.none div{border:.4mm dashed #94a3b8;color:#94a3b8;font-size:8pt;padding:4mm 1mm;text-align:center}
figcaption{font-size:8pt;color:#64748b;margin-top:.8mm}
figcaption b{color:#fff;border-radius:1.2mm;padding:0 1.2mm;margin-right:.8mm}
.front b{background:#0284c7} .back b{background:#ea580c}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style></head><body><h1>📮 ใบสรุปด้านหน้า / ด้านหลัง · ${esc(title)}</h1><p class="sub">${esc(headline(designs))} — ${esc(HOW)}</p>${body}
<script>Promise.all([...document.images].map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r}))).then(()=>setTimeout(()=>print(),150))</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) {
    window.alert("เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาตป๊อปอัปของเว็บนี้แล้วกดอีกครั้ง");
    return;
  }
  w.document.write(html);
  w.document.close();
}

/** 🖥 หน้าออเดอร์ — การ์ดทีละใบ (ด้านหน้า | ด้านหลัง) + ปุ่มพิมพ์ใบสรุป · จากไฟล์ทีละหน้าของรายการ */
export function SideSheet({ it, title, onOpen }: { it: Item; title: string; onOpen?: (url: string, caption: string) => void }) {
  const designs = sideSheetOf(it);
  if (!designs) return null;
  return <SideCardsView designs={designs} title={title} onOpen={onOpen} />;
}

/**
 * การ์ดทีละใบ (ด้านหน้า | ด้านหลัง) — ใช้ทั้งใบสรุปจากไฟล์ และกล่อง "แบบที่เราส่งให้ตรวจ" ของงาน 2 ด้านที่ลูกค้าออกแบบเอง
 * @param badgeOf ป้ายผลตรวจของรูป (✔ อนุมัติ / ✏️ ขอแก้ไข) · @param unit คำเรียก "หน้า" ใต้รูป (แบบงาน = "รูปที่")
 */
export function SideCardsView({
  designs,
  title,
  onOpen,
  badgeOf,
  unit = "หน้า",
  note,
}: {
  designs: SideDesign[];
  title: string;
  onOpen?: (url: string, caption: string) => void;
  badgeOf?: (url: string) => "อนุมัติ" | "ขอแก้ไข" | undefined;
  unit?: string;
  note?: string;
}) {
  const thumb = (side: "front" | "back", label: string, p?: { url: string; page: number }) => {
    const sideTh = side === "front" ? "ด้านหน้า" : "ด้านหลัง";
    const tone = side === "front" ? "bg-sky-600 ring-sky-500" : "bg-orange-600 ring-orange-500";
    if (!p)
      return (
        <div className="flex aspect-[3/2] items-center justify-center rounded-md border border-dashed border-slate-300 text-[10px] font-semibold text-slate-400">
          ไม่มี{sideTh}
        </div>
      );
    return (
      <button
        type="button"
        onClick={() => onOpen?.(p.url, `${label} · ${sideTh} (${unit} ${p.page})`)}
        className="relative block w-full text-left"
        title={`${label} · ${sideTh} — กดดูภาพใหญ่`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.url} alt={`${label} ${sideTh}`} loading="lazy" className={`w-full rounded-md object-contain ring-2 ${tone.split(" ")[1]}`} />
        {badgeOf?.(p.url) && (
          <span
            className={`absolute right-0.5 top-0.5 rounded-full px-1 text-[9px] font-bold ring-1 ${
              badgeOf(p.url) === "อนุมัติ" ? "bg-teal-50 text-teal-700 ring-teal-200" : "bg-rose-50 text-rose-700 ring-rose-200"
            }`}
          >
            {badgeOf(p.url) === "อนุมัติ" ? "✔" : "✏️ ขอแก้"}
          </span>
        )}
        <span className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
          <span className={`rounded px-1 font-bold text-white ${tone.split(" ")[0]}`}>{sideTh}</span>
          {unit} {p.page}
        </span>
      </button>
    );
  };
  return (
    <div className="rounded-lg bg-white p-2 ring-1 ring-violet-200">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-bold text-violet-900">📮 ใบสรุปด้านหน้า / ด้านหลัง — {headline(designs)}</p>
        <button
          type="button"
          onClick={() => printSheet(designs, title)}
          className="ml-auto rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-violet-800 ring-1 ring-violet-300 hover:bg-violet-50"
          title="เปิดใบสรุปขนาด A4 แนวนอน แล้วพิมพ์/เซฟเป็น PDF ส่งคู่กับไฟล์งาน"
        >
          🖨 พิมพ์ใบสรุป
        </button>
      </div>
      <p className="mt-0.5 text-[10.5px] leading-snug text-slate-500">{note ?? HOW}</p>
      {designs.map((d) => (
        <div key={d.no} className="mt-1.5">
          {designs.length > 1 && <p className="text-[11px] font-bold text-slate-700">ลายที่ {d.no} · ไฟล์ {d.pages} หน้า</p>}
          {d.repeat && <p className="mb-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-900">{d.repeat}</p>}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
            {d.cards.map((c, k) => {
              const label = cardName(c.label, k);
              return (
                <div key={k} className="rounded-md p-1 ring-1 ring-slate-200">
                  <p className="mb-0.5 text-[10.5px] font-bold text-slate-700">{label}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {thumb("front", label, c.front)}
                    {thumb("back", label, c.back)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 🖨 ใบงาน — บรรทัดสั้น + รูปย่อคู่ หน้า|หลัง (ใบงานต้องไม่เกิน 1 หน้า) */
export function SideSheetLine({ it }: { it: Item }) {
  const designs = sideSheetOf(it);
  if (!designs) return null;
  return (
    <div className="mt-1 rounded border border-slate-900 px-2 py-1">
      <p className="text-xs font-extrabold">📮 {headline(designs)} — หน้าคี่ในไฟล์ = ด้านหน้า · หน้าคู่ = ด้านหลัง</p>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
        {designs.flatMap((d) =>
          d.cards.map((c, k) => (
            <span key={`${d.no}-${k}`} className="flex items-center gap-0.5 text-[9px] font-bold leading-none">
              <span className="mr-0.5">{designs.length > 1 ? `${d.no}/` : ""}{k + 1}</span>
              {(["front", "back"] as const).map((s) =>
                c[s] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={s} src={c[s]!.url} alt={s === "front" ? "หน้า" : "หลัง"} className={`h-7 rounded-sm border ${s === "front" ? "border-slate-900" : "border-dashed border-slate-900"}`} />
                ) : null,
              )}
            </span>
          )),
        )}
      </div>
      <p className="mt-0.5 text-[9px] text-slate-600">กรอบทึบ = ด้านหน้า · กรอบประ = ด้านหลัง · ใบสรุปเต็มอยู่ในหน้าออเดอร์ (🖨 พิมพ์ใบสรุป)</p>
    </div>
  );
}
