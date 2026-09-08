"use client";

/**
 * ใบเสนอราคา /admin/quotes  (ดีไซน์ "รางเบนโตะกระจก")
 *
 * เสนอลูกค้าได้หลายใบ (หลายแบบ/หลายงบ) โดยไม่ไปโผล่ในคิวกราฟฟิก
 * พอลูกค้าตกลงใบไหน ค่อยกดแปลงเป็นออเดอร์ แล้วระบบปิดใบอื่นของลูกค้ารายนั้นให้อัตโนมัติ
 *
 * เรียง "ใกล้หมดวันยืนราคาขึ้นก่อน" — ใบที่เงียบเกินวันยืนราคาคือใบที่หลุดมือ
 * ของเดิมเรียงตามลำดับที่ได้มาจากฐานข้อมูล ซึ่งไม่ได้บอกว่าใบไหนต้องรีบโทรตาม
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import RequirePerm from "@/components/RequirePerm";
import NewCustomerDialog, { type NewCustomerDraft } from "@/components/admin/NewCustomerDialog";
import { formatPrice } from "@/lib/products";
import { awaitingOrder, daysToExpire, quoteStatusOf, quoteTotal, type Quote, type QuoteStatus } from "@/lib/quotes";
import {
  Banner,
  Btn,
  Empty,
  FChip,
  FilterCard,
  HeroStat,
  ListHead,
  PageHead,
  PageShell,
  Row,
  RowMain,
  RowSide,
  Rows,
  SearchBox,
  Stat,
  Stats,
  Tag,
  TabRow,
} from "@/components/admin/ui";

/** ใบที่ยังลุ้นอยู่ = ยังไม่ตกลง ไม่ปฏิเสธ ไม่หมดอายุ */
const OPEN: QuoteStatus[] = ["ร่าง", "ส่งให้ลูกค้าแล้ว"];

/** สีแถบซ้าย + ป้าย ตามสถานะใบเสนอราคา */
const TONE: Record<QuoteStatus, string> = {
  ร่าง: "var(--dk-yolk-deep)",
  ส่งให้ลูกค้าแล้ว: "var(--dk-blue)",
  ลูกค้าตกลง: "var(--dk-mint)",
  สร้างออเดอร์แล้ว: "var(--dk-lilac)",
  ไม่รับ: "var(--dk-quiet)",
  หมดอายุ: "var(--dk-quiet)",
};
const CHIP: Record<QuoteStatus, "yolk" | "sky" | "mint" | "lilac" | "quiet"> = {
  ร่าง: "yolk",
  ส่งให้ลูกค้าแล้ว: "sky",
  ลูกค้าตกลง: "mint",
  สร้างออเดอร์แล้ว: "lilac",
  ไม่รับ: "quiet",
  หมดอายุ: "quiet",
};

function QuotesPageInner() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [filter, setFilter] = useState<QuoteStatus | "all" | "open">("open");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  /** กล่องถามชื่อลูกค้าก่อนสร้างจริง — ยังไม่พิมพ์อะไร = ยังไม่มีใบเปล่าไปค้างในระบบ */
  const [newOpen, setNewOpen] = useState(false);
  const [newErr, setNewErr] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/quotes", { cache: "no-store" });
    const j = await res.json();
    setNeedsSetup(Boolean(j.needsSetup));
    setQuotes(j.quotes ?? []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function createQuote(d: NewCustomerDraft) {
    setCreating(true);
    setNewErr("");
    const res = await fetch("/api/admin/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer: d.customer, phone: d.phone, address: d.address, contactId: d.contactId }),
    });
    const j = await res.json().catch(() => ({}));
    setCreating(false);
    if (res.ok && j.ok) {
      setNewOpen(false);
      router.push(`/admin/quotes/${j.id}`);
    } else setNewErr(j.error ?? "สร้างไม่สำเร็จ");
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: quotes.length, open: 0 };
    for (const qt of quotes) {
      const st = quoteStatusOf(qt);
      c[st] = (c[st] ?? 0) + 1;
      if (OPEN.includes(st)) c.open += 1;
    }
    return c;
  }, [quotes]);

  /** ลูกค้ากดตกลงจากลิงก์แล้ว แต่ยังไม่มีใครกดสร้างออเดอร์ — งานที่ต้องทำก่อนอย่างอื่นวันนี้ */
  const waiting = useMemo(() => quotes.filter(awaitingOrder), [quotes]);

  /** ใบที่ยืนราคาใกล้หมด — ตัวเลขที่บอกว่าวันนี้ต้องโทรหาใคร */
  const expiring = useMemo(
    () =>
      quotes.filter((qt) => {
        if (!OPEN.includes(quoteStatusOf(qt))) return false;
        const d = daysToExpire(qt);
        return d !== null && d >= 0 && d <= 3;
      }).length,
    [quotes]
  );
  const openValue = useMemo(
    () => quotes.filter((qt) => OPEN.includes(quoteStatusOf(qt))).reduce((s, qt) => s + quoteTotal(qt), 0),
    [quotes]
  );

  const kw = q.trim().toLowerCase();
  const shown = quotes
    .filter((qt) => {
      const st = quoteStatusOf(qt);
      if (filter === "all") return true;
      // แท็บแรก = "งานที่ยังไม่จบ" — รวมใบที่ลูกค้าตกลงแล้วแต่ยังไม่ได้เปิดงานด้วย
      // (ถ้าไม่รวม ใบที่ลูกค้ารออยู่จะไม่โผล่ในแท็บที่เปิดมาเจอเป็นอันแรก = ตกหล่นทั้งที่มีป้ายเตือน)
      if (filter === "open") return OPEN.includes(st) || awaitingOrder(qt);
      return st === filter;
    })
    .filter((qt) => (kw ? qt.id.toLowerCase().includes(kw) || qt.customer.toLowerCase().includes(kw) : true))
    // ใบที่ลูกค้าตกลงแล้วรอเปิดงานขึ้นก่อนสุด (ลูกค้ารออยู่จริง) แล้วค่อยใกล้หมดวันยืนราคา — ใบที่เงียบเกินวันยืนราคาคือใบที่หลุดมือ
    .sort(
      (a, b) =>
        Number(awaitingOrder(b)) - Number(awaitingOrder(a)) || (daysToExpire(a) ?? 9999) - (daysToExpire(b) ?? 9999)
    );

  // ลูกค้ารายไหนมีใบค้างหลายใบ — เตือนให้เลือกใบเดียว
  const openByPhone = useMemo(() => {
    const m: Record<string, number> = {};
    for (const qt of quotes) {
      if (!OPEN.includes(quoteStatusOf(qt))) continue;
      const k = (qt.phone ?? "").replace(/\D/g, "");
      if (k.length >= 8) m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [quotes]);

  return (
    <PageShell>
      <PageHead
        group="งานขาย"
        title="ใบเสนอราคา"
        count={`${counts.all} ใบ`}
        sub="เสนอได้หลายใบต่อลูกค้า 1 ราย — ไม่เข้าคิวกราฟฟิกจนกว่าลูกค้าจะตกลง"
        tools={
          <>
            <SearchBox value={q} onChange={setQ} placeholder="ค้นเลขใบ / ชื่อลูกค้า" />
            <Btn
              tone="yolk"
              onClick={() => {
                setNewErr("");
                setNewOpen(true);
              }}
            >
              ใบเสนอราคาใหม่
            </Btn>
          </>
        }
      />

      {/* 🔔 งานค้างขึ้นบนสุดเสมอ — ลูกค้ากดตกลงแล้ว รออยู่ว่าเมื่อไหร่ร้านจะเปิดงาน */}
      {waiting.length > 0 && (
        <div className="mt-4">
          <Banner
            tone="hot"
            title={`ลูกค้ากดตกลงแล้ว ${waiting.length} ใบ — ยังไม่ได้สร้างออเดอร์`}
            detail={`${waiting
              .slice(0, 3)
              .map((qt) => `${qt.id} · ${qt.customer || "ยังไม่ระบุชื่อ"}`)
              .join(" · ")}${waiting.length > 3 ? ` · และอีก ${waiting.length - 3} ใบ` : ""} — เปิดใบแล้วกด “ลูกค้าตกลง — สร้างออเดอร์”`}
          />
        </div>
      )}

      {needsSetup && (
        <div className="mt-4">
          <Banner
            tone="warm"
            title="ยังไม่ได้สร้างตารางใบเสนอราคา"
            detail="เปิด Supabase → SQL Editor แล้วรันไฟล์ supabase/quotes.sql ครั้งเดียว จากนั้นรีเฟรชหน้านี้"
          />
        </div>
      )}

      <Stats cols={5}>
        <HeroStat
          n={counts.open}
          label="ยังรอลูกค้าตอบ"
          detail={expiring ? `ในนี้ยืนราคาเหลือไม่เกิน 3 วัน ${expiring} ใบ` : "ยังไม่มีใบไหนใกล้หมดวันยืนราคา"}
          pct={counts.all > 0 ? (counts.open / counts.all) * 100 : 0}
        />
        <Stat label="มูลค่าที่ลุ้นอยู่" value={formatPrice(openValue)} hint="รวมใบที่ยังไม่ปิด" />
        <Stat
          label="ตกลงแล้ว รอสร้างออเดอร์"
          value={waiting.length}
          hint={waiting.length ? "ใบ — ทำก่อนเลย" : "ใบ"}
          tone={waiting.length ? "due" : undefined}
        />
        <Stat
          label="ใกล้หมดวันยืนราคา"
          value={expiring}
          hint={expiring ? "ใบ — ควรโทรตาม" : "ใบ"}
          tone={expiring ? "due" : undefined}
        />
      </Stats>

      <FilterCard>
        <TabRow>
          <FChip
            on={filter === "open"}
            onClick={() => setFilter("open")}
            label="ยังไม่จบ"
            count={counts.open + waiting.length}
          />
          <FChip on={filter === "all"} onClick={() => setFilter("all")} label="ทั้งหมด" count={counts.all} />
          <FChip
            on={filter === "ลูกค้าตกลง"}
            onClick={() => setFilter("ลูกค้าตกลง")}
            label="ตกลงแล้ว — รอสร้างออเดอร์"
            count={counts["ลูกค้าตกลง"] ?? 0}
            style={{ background: "var(--dk-mint-wash)", color: "var(--dk-mint-ink)" }}
          />
          <FChip
            on={filter === "สร้างออเดอร์แล้ว"}
            onClick={() => setFilter("สร้างออเดอร์แล้ว")}
            label="สร้างออเดอร์แล้ว"
            count={counts["สร้างออเดอร์แล้ว"] ?? 0}
            style={{ background: "var(--dk-lilac-wash)", color: "var(--dk-lilac-ink)" }}
          />
          <FChip on={filter === "ไม่รับ"} onClick={() => setFilter("ไม่รับ")} label="ไม่รับ" count={counts["ไม่รับ"] ?? 0} />
          <FChip on={filter === "หมดอายุ"} onClick={() => setFilter("หมดอายุ")} label="หมดอายุ" count={counts["หมดอายุ"] ?? 0} />
        </TabRow>
      </FilterCard>

      <ListHead title="รายการ" note="ใบที่ลูกค้าตกลงแล้วขึ้นก่อน · ตามด้วยใบที่ใกล้หมดวันยืนราคา" />

      {loading ? (
        <Empty title="กำลังโหลด…" body="ดึงใบเสนอราคาจากเซิร์ฟเวอร์" />
      ) : shown.length === 0 ? (
        <Empty
          title={kw ? `ไม่พบใบที่ตรงกับ “${q.trim()}”` : "ยังไม่มีใบเสนอราคาในหมวดนี้"}
          body={kw ? "ลองค้นด้วยเลขใบหรือชื่อลูกค้าแทน" : "กดปุ่ม “ใบเสนอราคาใหม่” มุมขวาบนเพื่อสร้างใบแรก"}
        />
      ) : (
        <Rows>
          {shown.map((qt) => {
            const st = quoteStatusOf(qt);
            const left = daysToExpire(qt);
            const dup = (openByPhone[(qt.phone ?? "").replace(/\D/g, "")] ?? 0) > 1;
            const open = OPEN.includes(st);
            const hot = open && left !== null && left <= 3;
            const wait = awaitingOrder(qt);
            return (
              <Row
                key={qt.id}
                tone={wait ? "var(--dk-mint)" : hot ? "var(--dk-coral-deep)" : TONE[st]}
                done={!open && !wait}
                href={`/admin/quotes/${encodeURIComponent(qt.id)}`}
              >
                <RowMain
                  name={qt.customer || "ยังไม่ระบุชื่อ"}
                  tags={
                    <>
                      {wait && <Tag tone="solid">ลูกค้าตกลงแล้ว — รอสร้างออเดอร์</Tag>}
                      {hot && (
                        <Tag tone="solid">{left! < 0 ? "หมดอายุแล้ว" : left === 0 ? "หมดอายุวันนี้" : `ยืนราคาเหลือ ${left} วัน`}</Tag>
                      )}
                      {dup && open && <Tag tone="yolk">ลูกค้ารายนี้มีใบค้างหลายใบ</Tag>}
                      {qt.orderId && <Tag tone="mint" title={`แปลงเป็นออเดอร์ ${qt.orderId} แล้ว`}>แปลงเป็นออเดอร์แล้ว</Tag>}
                    </>
                  }
                  meta={
                    <>
                      <span className="id">{qt.id}</span>
                      <span>{qt.date}</span>
                      <span>{qt.items.length} รายการ</span>
                      {qt.orderId && <span className="id">{qt.orderId}</span>}
                      {!hot && open && left !== null && <span>ยืนราคาอีก {left} วัน</span>}
                    </>
                  }
                />
                <RowSide>
                  <Tag tone={CHIP[st]}>{st}</Tag>
                  <span className="dkb-amt">{formatPrice(quoteTotal(qt))}</span>
                </RowSide>
              </Row>
            );
          })}
        </Rows>
      )}

      {newOpen && (
        <NewCustomerDialog
          icon="📄"
          title="ใบเสนอราคาใหม่"
          detail="ใส่ชื่อ (หรือเบอร์) ลูกค้าก่อน แล้วค่อยไปกรอกรายการ/ราคาในหน้าถัดไป — กดยกเลิกตอนนี้จะไม่มีใบเปล่าค้างในระบบ"
          confirmLabel="สร้างใบเสนอราคา"
          busy={creating}
          error={newErr}
          onCancel={() => setNewOpen(false)}
          onCreate={(d) => void createQuote(d)}
        />
      )}
    </PageShell>
  );
}

export default function AdminQuotesPage() {
  return (
    <RequirePerm perm="orders.edit">
      <QuotesPageInner />
    </RequirePerm>
  );
}
