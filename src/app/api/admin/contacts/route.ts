import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { normalizeContact, type Contact } from "@/lib/contacts";

export const runtime = "nodejs";

const CONTACT_TABLE = "contacts";
const PAGE_SIZE = 50;

const tableMissing = (msg: string, code?: string) =>
  code === "42P01" || code === "PGRST205" || /schema cache|find the table|relation .*does not exist/i.test(msg);

/** ตัดอักขระที่ PostgREST ใช้เป็นตัวคั่นใน .or() ออก — กันคำค้นทำ filter พัง */
function cleanQuery(q: string) {
  return q.replace(/[,()"'\\%*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * รายชื่อผู้ติดต่อ — ค้นหา + แบ่งหน้า (ค้นฝั่งเซิร์ฟเวอร์ เพราะมี ~28,000 ราย ส่งทั้งก้อนไม่ไหว)
 *   ?q=คำค้น (ชื่อ/เบอร์/ที่อยู่/รหัส) · ?origin=… · ?tierLevel=<id ระดับ> · ?page=1 · ?limit=50 · ?sort=id|name|phone|address|point|rankStatus|rankExpiry&dir=asc|desc · ?type=customer|dealer · ?has=phone|point
 * ตอบ { contacts, total, page, pageSize, stats?, needsSetup? }
 */
export async function GET(req: Request) {
  const gate = await requirePerm("orders.viewAll");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ contacts: [], total: 0, page: 1, pageSize: PAGE_SIZE });

  const url = new URL(req.url);
  const q = cleanQuery(url.searchParams.get("q") ?? "");
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const type = url.searchParams.get("type") ?? "";
  const has = url.searchParams.get("has") ?? "";
  const origin = url.searchParams.get("origin") ?? "";
  const tierLevel = url.searchParams.get("tierLevel") ?? "";
  const withStats = url.searchParams.get("stats") === "1";
  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit")) || PAGE_SIZE));
  const sort = url.searchParams.get("sort") ?? "id";
  const asc = url.searchParams.get("dir") === "asc";
  // ไม่ส่ง sort มา (ช่องค้นชื่อลูกค้าในหน้าออเดอร์/ใบเสนอราคา) + มีคำค้น = เรียงตาม "ตรงแค่ไหน" ไม่ใช่รหัสใหม่ก่อน
  // — เคส 10 ก.ย. 69: พิมพ์ "ออม" เจอ 27 ราย แต่ลิสต์โชว์ 10 รายแรกตามรหัสใหม่→เก่า ออม #652 ชื่อตรงเป๊ะกลับตกจากลิสต์
  const relevance = !!q && !url.searchParams.has("sort");

  let query = sb.from(CONTACT_TABLE).select("id,data", { count: "exact" });
  if (q) {
    const like = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    const parts = [`data->>name.ilike.${like}`, `data->>address.ilike.${like}`, `data->>email.ilike.${like}`, `data->>note.ilike.${like}`];
    if (digits) parts.push(`data->>phone.ilike.%${digits}%`, `id.eq.${digits}`);
    else parts.push(`data->>phone.ilike.${like}`);
    query = query.or(parts.join(","));
  }
  if (type === "dealer" || type === "customer") query = query.eq("data->>customerType", type);
  if (has === "phone") query = query.neq("data->>phone", "");
  if (has === "point") query = query.gt("data->point", 0);
  if (origin) query = query.contains("data", { origins: [origin] });
  // กรองตามระดับสมาชิกที่ล็อกอยู่ (status-lock)
  // ระดับเริ่มต้น "member" = ยังไม่ถึงระดับแรกในตาราง — รวมคนที่ยังไม่เคยซีดระดับ (tierLevel ว่าง) ด้วย
  if (tierLevel === "member") query = query.or("data->>tierLevel.eq.member,data->>tierLevel.is.null");
  else if (tierLevel) query = query.eq("data->>tierLevel", tierLevel);

  // เรียงตามหัวคอลัมน์ที่กด — ชื่อ/เบอร์/ที่อยู่ เรียงตามข้อความ · แต้ม เรียงตามตัวเลข · อื่น ๆ เรียงตามรหัส
  const SORT: Record<string, string> = { name: "data->>name", phone: "data->>phone", address: "data->>address", point: "data->point", rankExpiry: "data->>rankExpiry", rankStatus: "data->>rankStatus" };
  if (SORT[sort]) query = query.order(SORT[sort], { ascending: asc, nullsFirst: false });
  query = query.order("num", { ascending: SORT[sort] ? false : asc, nullsFirst: false }).order("id", { ascending: asc });

  const from = (page - 1) * limit;
  let contacts: Contact[];
  let count: number | null;
  if (relevance) {
    // ดึง 2 ก้อนพร้อมกัน: (ก) ชื่อขึ้นต้นด้วยคำค้น — รายเก่า ๆ ชื่อสั้นตรงเป๊ะจะได้ไม่หลุดจากหน้าต่าง (ข) ผลค้นทั่วไปตามรหัสใหม่ก่อน
    // แล้วรวม-ตัดซ้ำ-จัดอันดับในนี้ (คลัง ~28,000 ราย คำค้นหนึ่งเจอไม่กี่สิบ-ร้อยราย ก้อนละ 200 พอ)
    const WINDOW = 200;
    const nameQ = q.toLowerCase();
    const prefix = sb
      .from(CONTACT_TABLE)
      .select("id,data")
      .ilike("data->>name", `${q}%`)
      .order("num", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(WINDOW);
    const [pre, gen] = await Promise.all([prefix, query.range(0, WINDOW - 1)]);
    const error = gen.error ?? pre.error;
    if (error) {
      if (tableMissing(error.message, error.code)) return NextResponse.json({ contacts: [], total: 0, page, pageSize: limit, needsSetup: true });
      return NextResponse.json({ error: error.message, contacts: [], total: 0, page, pageSize: limit }, { status: 500 });
    }
    const seen = new Set<string>();
    const all: Contact[] = [];
    for (const r of [...(pre.data ?? []), ...(gen.data ?? [])]) {
      const id = String(r.id);
      if (seen.has(id)) continue;
      seen.add(id);
      all.push({ ...(r.data as Contact), id });
    }
    const digits = q.replace(/\D/g, "");
    // อันดับ: 0 ชื่อตรงเป๊ะ · 1 ชื่อขึ้นต้นด้วยคำค้น · 2 ชื่อมีคำค้น · 3 เบอร์/รหัสตรง · 4 ที่อยู่/อีเมล/โน้ต — อันดับเท่ากันเรียงรหัสใหม่ก่อน (ลำดับเดิม)
    const rankOf = (c: Contact) => {
      const n = (c.name ?? "").trim().toLowerCase();
      if (n === nameQ) return 0;
      if (n.startsWith(nameQ)) return 1;
      if (n.includes(nameQ)) return 2;
      if (digits && ((c.phone ?? "").includes(digits) || c.id === digits)) return 3;
      return 4;
    };
    const ranked = all.map((c, i) => ({ c, r: rankOf(c), i })).sort((a, b) => a.r - b.r || a.i - b.i);
    contacts = ranked.slice(from, from + limit).map((x) => x.c);
    count = Math.max(gen.count ?? 0, all.length);
  } else {
    const res = await query.range(from, from + limit - 1);
    if (res.error) {
      if (tableMissing(res.error.message, res.error.code)) return NextResponse.json({ contacts: [], total: 0, page, pageSize: limit, needsSetup: true });
      return NextResponse.json({ error: res.error.message, contacts: [], total: 0, page, pageSize: limit }, { status: 500 });
    }
    contacts = (res.data ?? []).map((r) => ({ ...(r.data as Contact), id: r.id as string }));
    count = res.count;
  }

  // สถิติภาพรวม — นับฝั่งฐานข้อมูล (head) ไม่ดึงข้อมูลมา
  let stats: { total: number; withPhone: number; withPoint: number; dealers: number; legacy: number; member: number; adminOrder: number; guestOrder: number } | undefined;
  if (withStats) {
    const head = () => sb.from(CONTACT_TABLE).select("id", { count: "exact", head: true });
    const [t, p, pt, d, l, m, a, g] = await Promise.all([
      head(),
      head().neq("data->>phone", ""),
      head().gt("data->point", 0),
      head().eq("data->>customerType", "dealer"),
      head().contains("data", { origins: ["legacy"] }),
      head().contains("data", { origins: ["member"] }),
      head().contains("data", { origins: ["admin-order"] }),
      head().contains("data", { origins: ["guest-order"] }),
    ]);
    stats = { total: t.count ?? 0, withPhone: p.count ?? 0, withPoint: pt.count ?? 0, dealers: d.count ?? 0, legacy: l.count ?? 0, member: m.count ?? 0, adminOrder: a.count ?? 0, guestOrder: g.count ?? 0 };
  }

  return NextResponse.json({ contacts, total: count ?? 0, page, pageSize: limit, stats });
}

/**
 * เพิ่ม/แก้ไขผู้ติดต่อทีละราย — body: { id?, name, phone, address, email?, note?, customerType?, point? }
 * ไม่ส่ง id = เพิ่มใหม่ (ต่อเลขจากรหัสสูงสุดที่มี ให้ต่อเนื่องกับระบบเดิม)
 */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  if (!name && !phone) return NextResponse.json({ error: "ใส่ชื่อหรือเบอร์โทรอย่างน้อยหนึ่งอย่าง" }, { status: 400 });

  const now = new Date().toISOString();
  const by = gate.actor.name || gate.actor.username;
  let id = String(body.id ?? "").trim();
  let prev: Contact | null = null;
  if (id) {
    const { data } = await sb.from(CONTACT_TABLE).select("data").eq("id", id).maybeSingle();
    if (!data) return NextResponse.json({ error: "ไม่พบผู้ติดต่อนี้" }, { status: 404 });
    prev = data.data as Contact;
  } else {
    const { data } = await sb.from(CONTACT_TABLE).select("num").not("num", "is", null).order("num", { ascending: false }).limit(1).maybeSingle();
    id = String(Number((data as { num?: number } | null)?.num ?? 0) + 1);
  }

  const next = normalizeContact({ ...(prev ?? {}), ...body, id }, {
    source: prev?.source ?? "admin",
    importedAt: prev?.importedAt,
    updatedAt: now,
    updatedBy: by,
  });

  if (!next) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  if (!prev) next.origins = ["legacy"]; // เพิ่มเองในหลังบ้าน = อยู่กลุ่มเดียวกับคลังหลัก
  // ฟิลด์ที่ผู้ใช้ตั้งใจล้างค่า ต้องหายจริง (normalizeContact ข้ามค่าว่าง แต่ spread prev อาจพาค่าเก่ากลับมา)
  for (const k of ["email", "note", "customerType"] as const) {
    if (k in body && !String(body[k] ?? "").trim()) delete next[k];
  }

  const { error } = await sb.from(CONTACT_TABLE).upsert({ id, data: next }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: next });
}

/** ลบผู้ติดต่อ ?id= */
export async function DELETE(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "ไม่รู้ว่ารายไหน" }, { status: 400 });
  const { error } = await sb.from(CONTACT_TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
