import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone, type Contact, type ContactOrigin } from "@/lib/contacts";

/**
 * ซิงก์ "คนจากที่อื่น" เข้าคลังผู้ติดต่อให้เองอัตโนมัติ — ผู้ติดต่อคือที่เดียวที่ทุกคนอยู่
 *
 *  · สมาชิกที่สมัครเองจากเว็บ (Supabase Auth: อีเมล / LINE)             → origin "member"
 *  · ลูกค้าที่พนักงานกรอกให้ตอนสั่งแทน (ออเดอร์ที่มี placedBy)            → origin "admin-order"
 *  · ลูกค้าสั่งเองแบบไม่สมัคร (ออเดอร์ที่ไม่มี customerId และไม่มี placedBy) → origin "guest-order"
 *
 * จับคู่กับรายเดิม: memberId ก่อน → เบอร์โทร → (ไม่มีเบอร์) ชื่อตรงกัน · ไม่เจอค่อยสร้างใหม่ (รหัสต่อจากเดิม)
 * รายเดิมจะถูก "เติม" ไม่ใช่ "ทับ": ชื่อ/เบอร์/ที่อยู่ที่มีอยู่แล้วคงไว้ เติมเฉพาะช่องว่าง + สถิติออเดอร์ + ป้ายที่มา
 */

type OrderLite = { id: string; customer: string | null; phone: string | null; address: string | null; email: string | null; created_at: string | null; customerId: string | null; placedBy: string | null };

type Incoming = {
  origin: ContactOrigin;
  memberId?: string;
  channel?: "line" | "email";
  picture?: string;
  memberSince?: string;
  name: string;
  phone: string;
  address: string;
  email?: string;
  orders?: Contact["orders"];
};

/** กันซิงก์ถี่เกิน — หน้าผู้ติดต่อเรียกทุกครั้งที่เปิด แต่ทำจริงห่างกันอย่างน้อย 2 นาที (เว้นแต่ force) */
let lastSyncAt = 0;
const MIN_GAP_MS = 2 * 60 * 1000;

export async function syncContacts(sb: SupabaseClient, opts?: { force?: boolean }): Promise<{ skipped?: true; created: number; updated: number; members: number; adminOrders: number; guestOrders: number }> {
  if (!opts?.force && Date.now() - lastSyncAt < MIN_GAP_MS) return { skipped: true, created: 0, updated: 0, members: 0, adminOrders: 0, guestOrders: 0 };
  lastSyncAt = Date.now();

  // ── ออเดอร์ทั้งหมดแบบเบา ──
  const { data: ords, error } = await sb
    .from("orders")
    .select("id:data->>id,customer:data->>customer,phone:data->>phone,address:data->>address,email:data->>email,created_at,customerId:data->>customerId,placedBy:data->>placedBy")
    .limit(20000);
  if (error) throw new Error(error.message);
  const orders = (ords ?? []) as unknown as OrderLite[];

  const statOf = (list: OrderLite[]): NonNullable<Contact["orders"]> => {
    const sorted = [...list].sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1));
    const by = [...new Set(sorted.map((o) => o.placedBy).filter(Boolean))] as string[];
    return {
      count: sorted.length,
      firstAt: sorted[0]?.created_at ?? undefined,
      lastAt: sorted.at(-1)?.created_at ?? undefined,
      lastId: sorted.at(-1)?.id,
      ...(by.length ? { placedBy: by.join(" · ") } : {}),
    };
  };

  const incoming: Incoming[] = [];

  // ── สมาชิกเว็บ ──
  const byMember = new Map<string, OrderLite[]>();
  for (const o of orders) if (o.customerId) byMember.set(o.customerId, [...(byMember.get(o.customerId) ?? []), o]);
  let members = 0;
  for (let page = 1; page <= 20; page++) {
    const { data, error: uErr } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (uErr) throw new Error(uErr.message);
    for (const u of data.users) {
      if ((u.email ?? "").endsWith("@staff.iducky.local")) continue; // บัญชีพนักงาน ไม่ใช่ลูกค้า
      const m = (u.user_metadata ?? {}) as { name?: string; phone?: string; address?: string; picture?: string; line_user_id?: string };
      const mine = byMember.get(u.id) ?? [];
      const latest = mine.length ? statOf(mine) : undefined;
      const lastOrder = mine.find((o) => o.id === latest?.lastId);
      members++;
      incoming.push({
        origin: "member",
        memberId: u.id,
        channel: m.line_user_id ? "line" : "email",
        picture: m.picture || undefined,
        memberSince: u.created_at,
        name: (m.name ?? "").trim() || (lastOrder?.customer ?? "").trim(),
        phone: normalizePhone(m.phone) || normalizePhone(lastOrder?.phone),
        address: (m.address ?? "").trim() || (lastOrder?.address ?? "").trim(),
        email: (u.email ?? "").endsWith("@line.iducky.local") ? undefined : u.email ?? undefined,
        orders: latest,
      });
    }
    if (data.users.length < 1000) break;
  }

  // ── ลูกค้าจากออเดอร์ที่ไม่ใช่สมาชิก — รวมตามเบอร์ (ไม่มีเบอร์ใช้ชื่อ) ──
  const group = (list: OrderLite[], origin: ContactOrigin) => {
    const map = new Map<string, OrderLite[]>();
    for (const o of list) {
      const phone = normalizePhone(o.phone);
      const name = (o.customer ?? "").trim();
      const key = phone || (name ? `n:${name.toLowerCase()}` : "");
      if (!key) continue;
      map.set(key, [...(map.get(key) ?? []), o]);
    }
    let n = 0;
    for (const mine of map.values()) {
      const st = statOf(mine);
      const last = mine.find((o) => o.id === st.lastId) ?? mine[0];
      n++;
      incoming.push({ origin, name: (last.customer ?? "").trim(), phone: normalizePhone(last.phone), address: (last.address ?? "").trim(), email: last.email || undefined, orders: st });
    }
    return n;
  };
  const adminOrders = group(orders.filter((o) => o.placedBy), "admin-order");
  const guestOrders = group(orders.filter((o) => !o.placedBy && !o.customerId), "guest-order");

  // ── หาคู่ในคลัง ──
  const memberIds = incoming.map((i) => i.memberId).filter(Boolean) as string[];
  const phones = [...new Set(incoming.map((i) => i.phone).filter(Boolean))];
  const names = [...new Set(incoming.filter((i) => !i.phone && i.name).map((i) => i.name))];
  const found = new Map<string, Contact>();
  const pull = async (col: string, vals: string[]) => {
    for (let i = 0; i < vals.length; i += 200) {
      const { data, error: e } = await sb.from("contacts").select("id,data").in(col, vals.slice(i, i + 200));
      if (e) throw new Error(e.message);
      for (const r of data ?? []) found.set(r.id as string, { ...(r.data as Contact), id: r.id as string });
    }
  };
  await pull("data->>memberId", memberIds);
  await pull("data->>phone", phones);
  await pull("data->>name", names);
  const byMemberId = new Map<string, Contact>();
  const byPhone = new Map<string, Contact>();
  const byName = new Map<string, Contact>();
  for (const c of found.values()) {
    if (c.memberId) byMemberId.set(c.memberId, c);
    if (c.phone && !byPhone.has(c.phone)) byPhone.set(c.phone, c);
    if (c.name && !byName.has(c.name)) byName.set(c.name, c);
  }

  // รหัสถัดไป
  const { data: mx } = await sb.from("contacts").select("num").not("num", "is", null).order("num", { ascending: false }).limit(1).maybeSingle();
  let nextNum = Number((mx as { num?: number } | null)?.num ?? 0) + 1;

  const now = new Date().toISOString();
  const writes = new Map<string, Contact>();
  let created = 0;
  let updated = 0;
  for (const inc of incoming) {
    const existing =
      (inc.memberId && byMemberId.get(inc.memberId)) ||
      (inc.phone && byPhone.get(inc.phone)) ||
      (!inc.phone && inc.name && byName.get(inc.name)) ||
      null;
    const base: Contact = existing ?? { id: String(nextNum++), name: "", phone: "", address: "", point: 0, source: "sync", origins: [] };
    const next: Contact = { ...base };
    // เติมเฉพาะช่องว่าง — ของที่มีอยู่แล้ว (โดยเฉพาะที่แก้ในระบบนี้) ไม่ทับ
    if (!next.name && inc.name) next.name = inc.name;
    if (!next.phone && inc.phone) next.phone = inc.phone;
    if (!next.address && inc.address) next.address = inc.address;
    if (!next.email && inc.email) next.email = inc.email;
    if (inc.memberId) {
      next.memberId = inc.memberId;
      next.channel = inc.channel;
      if (inc.picture) next.picture = inc.picture;
      if (inc.memberSince) next.memberSince = inc.memberSince;
    }
    if (inc.orders) {
      // รวมสถิติถ้าคนเดียวกันมาหลายทาง (เช่น สมาชิก + เคยสั่งแบบ guest)
      const prev = writes.get(next.id)?.orders;
      next.orders = prev && prev !== inc.orders ? { count: prev.count + inc.orders.count, firstAt: [prev.firstAt, inc.orders.firstAt].filter(Boolean).sort()[0], lastAt: [prev.lastAt, inc.orders.lastAt].filter(Boolean).sort().at(-1), lastId: (prev.lastAt ?? "") > (inc.orders.lastAt ?? "") ? prev.lastId : inc.orders.lastId, ...(prev.placedBy || inc.orders.placedBy ? { placedBy: [prev.placedBy, inc.orders.placedBy].filter(Boolean).join(" · ") } : {}) } : inc.orders;
    }
    next.origins = [...new Set([...(next.origins ?? []), inc.origin])];
    next.syncedAt = now;
    const changed = JSON.stringify({ ...next, syncedAt: 0 }) !== JSON.stringify({ ...(existing ?? {}), syncedAt: 0 });
    if (!existing) created++;
    else if (changed) updated++;
    if (!existing || changed) {
      writes.set(next.id, next);
      // ให้รายถัดไปที่เบอร์/ชื่อเดียวกันเจอรายที่เพิ่งสร้าง
      if (next.memberId) byMemberId.set(next.memberId, next);
      if (next.phone && !byPhone.has(next.phone)) byPhone.set(next.phone, next);
      if (next.name && !byName.has(next.name)) byName.set(next.name, next);
    }
  }

  const rows = [...writes.values()].map((c) => ({ id: c.id, data: c }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: upErr } = await sb.from("contacts").upsert(rows.slice(i, i + 500), { onConflict: "id" });
    if (upErr) throw new Error(upErr.message);
  }
  return { created, updated, members, adminOrders, guestOrders };
}
