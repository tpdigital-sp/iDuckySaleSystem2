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
import { formatPrice } from "@/lib/products";
import { daysToExpire, quoteStatusOf, quoteTotal, type Quote, type QuoteStatus } from "@/lib/quotes";
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
  ไม่รับ: "var(--dk-quiet)",
  หมดอายุ: "var(--dk-quiet)",
};
const CHIP: Record<QuoteStatus, "yolk" | "sky" | "mint" | "quiet"> = {
  ร่าง: "yolk",
  ส่งให้ลูกค้าแล้ว: "sky",
  ลูกค้าตกลง: "mint",
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

  async function createQuote() {
    setCreating(true);
    const res = await fetch("/api/admin/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const j = await res.json();
    setCreating(false);
    if (j.ok) router.push(`/admin/quotes/${j.id}`);
    else alert(j.error ?? "สร้างไม่สำเร็จ");
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
      if (filter === "open") return OPEN.includes(st);
      return st === filter;
    })
    .filter((qt) => (kw ? qt.id.toLowerCase().includes(kw) || qt.customer.toLowerCase().includes(kw) : true))
    // ใกล้หมดวันยืนราคาขึ้นก่อน — ใบที่เงียบเกินวันยืนราคาคือใบที่หลุดมือ
    .sort((a, b) => (daysToExpire(a) ?? 9999) - (daysToExpire(b) ?? 9999));

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
            <Btn tone="yolk" onClick={() => void createQuote()} disabled={creating}>
              {creating ? "กำลังสร้าง…" : "ใบเสนอราคาใหม่"}
            </Btn>
          </>
        }
      />

      {needsSetup && (
        <div className="mt-4">
          <Banner
            tone="warm"
            title="ยังไม่ได้สร้างตารางใบเสนอราคา"
            detail="เปิด Supabase → SQL Editor แล้วรันไฟล์ supabase/quotes.sql ครั้งเดียว จากนั้นรีเฟรชหน้านี้"
          />
        </div>
      )}

      <Stats cols={4}>
        <HeroStat
          n={counts.open}
          label="ยังรอลูกค้าตอบ"
          detail={expiring ? `ในนี้ยืนราคาเหลือไม่เกิน 3 วัน ${expiring} ใบ` : "ยังไม่มีใบไหนใกล้หมดวันยืนราคา"}
          pct={counts.all > 0 ? (counts.open / counts.all) * 100 : 0}
        />
        <Stat label="มูลค่าที่ลุ้นอยู่" value={formatPrice(openValue)} hint="รวมใบที่ยังไม่ปิด" />
        <Stat
          label="ใกล้หมดวันยืนราคา"
          value={expiring}
          hint={expiring ? "ใบ — ควรโทรตาม" : "ใบ"}
          tone={expiring ? "due" : undefined}
        />
      </Stats>

      <FilterCard>
        <TabRow>
          <FChip on={filter === "open"} onClick={() => setFilter("open")} label="ยังรอลูกค้า" count={counts.open} />
          <FChip on={filter === "all"} onClick={() => setFilter("all")} label="ทั้งหมด" count={counts.all} />
          <FChip
            on={filter === "ลูกค้าตกลง"}
            onClick={() => setFilter("ลูกค้าตกลง")}
            label="ตกลงแล้ว"
            count={counts["ลูกค้าตกลง"] ?? 0}
            style={{ background: "var(--dk-mint-wash)", color: "var(--dk-mint-ink)" }}
          />
          <FChip on={filter === "ไม่รับ"} onClick={() => setFilter("ไม่รับ")} label="ไม่รับ" count={counts["ไม่รับ"] ?? 0} />
          <FChip on={filter === "หมดอายุ"} onClick={() => setFilter("หมดอายุ")} label="หมดอายุ" count={counts["หมดอายุ"] ?? 0} />
        </TabRow>
      </FilterCard>

      <ListHead title="รายการ" note="ใกล้หมดวันยืนราคาขึ้นก่อน" />

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
            return (
              <Row
                key={qt.id}
                tone={hot ? "var(--dk-coral-deep)" : TONE[st]}
                done={!open}
                href={`/admin/quotes/${encodeURIComponent(qt.id)}`}
              >
                <RowMain
                  name={qt.customer || "ยังไม่ระบุชื่อ"}
                  tags={
                    <>
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
