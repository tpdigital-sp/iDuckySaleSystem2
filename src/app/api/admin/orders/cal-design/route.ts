import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type Order } from "@/lib/admin-data";
import { updateOrder } from "@/lib/server/order-write";
import { calEditUrlOf, PLACEMENT_LABEL, PLACEMENT_SPEC_LABEL } from "@/lib/design-templates";

export const runtime = "nodejs";

/**
 * 💾 แก้แบบปฏิทินที่ลูกค้าออกแบบบนเว็บ แล้ว "บันทึกกลับเข้าออเดอร์" (ผู้ใช้สั่ง 15 ต.ค. 69)
 * หลังบ้านกด ✏️ เปิดแบบนี้ในจอสร้างปฏิทิน → แก้ในจอ → ปุ่ม 💾 บันทึกกลับเข้า OD-… มาที่นี่
 *
 * เปลี่ยนเฉพาะ "ไฟล์แบบ" ของรายการเดิม: ภาพลายที่แนบ (หน้า/หลัง) + สเปคตำแหน่งลาย (ทีมผลิต) + บรรทัดวางบนเทมเพลต
 * จำนวน ราคา ตัวเลือกอื่นไม่แตะ → ยอดเงินไม่ขยับ ใช้ได้แม้ออเดอร์มีเงินเข้าแล้ว · ลงประวัติทุกครั้ง
 *
 * POST { id, index, productId, spec, placement, urls, back } → { ok }
 */
const URL_RE = /^https:\/\/[\w.-]+\.supabase\.co\/storage\/v1\/object\/public\//;

export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินหลังบ้านก่อน" }, { status: 401 });
  if (!can(actor, "orders.edit", await loadRolePerms())) return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ออเดอร์" }, { status: 403 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as {
    id?: string;
    index?: number;
    productId?: string;
    spec?: string;
    placement?: string;
    urls?: unknown;
    back?: unknown;
  };
  const id = b.id?.trim();
  const index = Number(b.index);
  const urls = Array.isArray(b.urls) ? b.urls.filter((u): u is string => typeof u === "string" && URL_RE.test(u)) : [];
  const back = Array.isArray(b.back) ? b.back.filter((u): u is string => typeof u === "string" && urls.includes(u)) : [];
  const spec = String(b.spec ?? "");
  if (!id || !Number.isInteger(index) || index < 0) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  if (!urls.length || urls.length > 80) return NextResponse.json({ error: "ไม่มีไฟล์แบบ" }, { status: 400 });
  if (!calEditUrlOf(spec)) return NextResponse.json({ error: "ไม่ใช่แบบปฏิทินจากจอสร้างปฏิทิน" }, { status: 400 });

  const { data } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
  const o = data?.data as Order | undefined;
  if (!o) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  const it = o.items[index];
  if (!it || it.productId !== b.productId) return NextResponse.json({ error: "รายการในออเดอร์ไม่ตรงกับสินค้านี้ (มีคนแก้ออเดอร์ระหว่างนี้?) — รีเฟรชหน้าออเดอร์แล้วกดเปิดแบบใหม่" }, { status: 409 });

  const placement = String(b.placement ?? "").trim();
  const sel = { ...(it.sel ?? {}), [PLACEMENT_SPEC_LABEL]: spec, ...(placement ? { [PLACEMENT_LABEL]: placement } : {}) };
  let selections = it.selections ?? "";
  if (placement) {
    const re = new RegExp(`(^|\\s·\\s)(${PLACEMENT_LABEL}:\\s*)([^·\\n]*)`);
    selections = re.test(selections) ? selections.replace(re, (_m, pre: string, head: string) => `${pre}${head}${placement}`) : selections;
  }
  const keep = <T,>(m?: Record<string, T>) => (m ? Object.fromEntries(Object.entries(m).filter(([u]) => urls.includes(u))) : undefined);
  const items = o.items.map((x, i) =>
    i === index
      ? {
          ...x,
          sel,
          selections,
          artworkUrls: urls,
          artworkBackUrls: back.length ? back : undefined,
          artworkQty: keep(x.artworkQty),
          artworkSize: keep(x.artworkSize),
        }
      : x,
  );
  const by = actor.name?.trim() || actor.username;
  // ออกแบบครั้งแรกให้รายการที่ลูกค้าแนบรูปมาเอง = ไฟล์แนบเดิมถูกแทน → จดลิงก์เดิมไว้ในประวัติ (เอากลับได้เสมอ)
  const first = !(it.sel?.[PLACEMENT_SPEC_LABEL] && calEditUrlOf(it.sel[PLACEMENT_SPEC_LABEL]));
  const gone = (it.artworkUrls ?? []).filter((u) => !urls.includes(u));
  const next = withLog(
    { ...o, items },
    by,
    first ? "🗓 ออกแบบบนเว็บให้ลูกค้า (จอสร้างปฏิทิน)" : "✏️ แก้แบบปฏิทิน (จอสร้างปฏิทิน)",
    `รายการที่ ${index + 1} ${it.name} · ไฟล์ ${it.artworkUrls?.length ?? 0} → ${urls.length} ไฟล์ (ยอดเงินไม่เปลี่ยน)` +
      (first && gone.length ? ` · ไฟล์แนบเดิมของลูกค้า: ${gone.join(" | ")}` : ""),
  );
  const { error } = await updateOrder(sb, next, { prev: o, by });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
