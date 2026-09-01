"use client";

/**
 * 🔗 ลิงก์ราคา /admin/price-links
 *
 * ลิงก์ที่แอดมินยิงให้ลูกค้าจากหน้าสินค้า (แทนการ screenshot ราคา)
 * หน้านี้ตอบคำถามเดียว: **ใบไหนส่งไปแล้วลูกค้ายังไม่เปิด / ใบไหนใกล้หมดอายุ** → ตามต่อให้ทัน
 * ใบที่ลูกค้าเปิดแล้วแต่ยังไม่สั่ง = คนที่สนใจจริง ตามแล้วปิดการขายได้ง่ายที่สุด
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { publicOrigin } from "@/lib/shop-info";
import { formatPrice } from "@/lib/products";
import { daysLeft, priceLinkStatus, type PriceLink } from "@/lib/price-links";
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
} from "@/components/admin/ui";

type Filter = "ทั้งหมด" | "ยังไม่เปิด" | "เปิดแล้ว" | "ปิดไปแล้ว";

const linkUrl = (code: string) => `${publicOrigin()}/p/${code}`;

/** วันที่+เวลาแบบที่ทีมใช้คุยกัน (พ.ศ.) */
function stamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("th-TH", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminPriceLinksPage() {
  const [links, setLinks] = useState<PriceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<Filter>("ทั้งหมด");
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/price-links", { cache: "no-store" });
      const j = (await res.json()) as { links?: PriceLink[]; needsSetup?: boolean; error?: string };
      setLinks(j.links ?? []);
      setNeedsSetup(!!j.needsSetup);
      setErr(j.error ?? "");
    } catch {
      setErr("โหลดไม่ได้ — เช็คเน็ตแล้วลองใหม่");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(code: string, action: "close" | "reopen" | "extend") {
    setBusy(code);
    try {
      const res = await fetch("/api/price-links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, action }),
      });
      const j = (await res.json()) as { link?: PriceLink; error?: string };
      if (j.link) setLinks((cur) => cur.map((l) => (l.code === code ? j.link! : l)));
      else setErr(j.error ?? "ทำรายการไม่สำเร็จ");
    } catch {
      setErr("ทำรายการไม่สำเร็จ — เช็คเน็ตแล้วลองใหม่");
    } finally {
      setBusy("");
    }
  }

  function copy(code: string) {
    navigator.clipboard
      ?.writeText(linkUrl(code))
      .then(() => {
        setCopied(code);
        window.setTimeout(() => setCopied(""), 1800);
      })
      .catch(() => setErr("คัดลอกไม่ได้ — กดค้างที่ลิงก์แล้วคัดลอกเอง"));
  }

  /** ตัวเลขสรุป — ทุกตัวมีตัวเทียบ ไม่งั้นไม่รู้ว่าควรกังวลไหม */
  const sum = useMemo(() => {
    const day = 86_400_000;
    const now = Date.now();
    const live = links.filter((l) => priceLinkStatus(l) === "ใช้ได้");
    const sent7 = links.filter((l) => now - new Date(l.createdAt).getTime() < 7 * day).length;
    const sentPrev7 = links.filter((l) => {
      const age = now - new Date(l.createdAt).getTime();
      return age >= 7 * day && age < 14 * day;
    }).length;
    return {
      live: live.length,
      unopened: live.filter((l) => !l.opened).length,
      opened: live.filter((l) => (l.opened ?? 0) > 0).length,
      soon: live.filter((l) => daysLeft(l) <= 2).length,
      sent7,
      sentPrev7,
    };
  }, [links]);

  const shown = useMemo(() => {
    const key = q.trim().toLowerCase();
    return links.filter((l) => {
      const st = priceLinkStatus(l);
      if (filter === "ยังไม่เปิด" && !(st === "ใช้ได้" && !l.opened)) return false;
      if (filter === "เปิดแล้ว" && !(st === "ใช้ได้" && (l.opened ?? 0) > 0)) return false;
      if (filter === "ปิดไปแล้ว" && st === "ใช้ได้") return false;
      if (!key) return true;
      return (
        l.code.toLowerCase().includes(key) ||
        l.productName.toLowerCase().includes(key) ||
        l.createdBy.toLowerCase().includes(key)
      );
    });
  }, [links, filter, q]);

  return (
    <PageShell>
      <PageHead
        group="งานขาย"
        title="ลิงก์ราคา"
        count={`${links.length} ใบ`}
        sub="ราคาที่ยิงให้ลูกค้าจากหน้าสินค้า — แช่ราคาไว้ ยืนราคา 7 วัน"
        live={
          sum.unopened
            ? { ok: false, text: `${sum.unopened} ใบที่ส่งไปแล้วลูกค้ายังไม่เปิด` }
            : { ok: true, text: "ลูกค้าเปิดดูครบทุกใบที่ยังไม่หมดอายุ" }
        }
        tools={
          <Btn onClick={() => void load()} small>
            รีเฟรช
          </Btn>
        }
      />

      {needsSetup && (
        <Banner
          tone="hot"
          title="ยังไม่ได้สร้างตารางในฐานข้อมูล"
          detail="เปิด Supabase → SQL Editor แล้วรันไฟล์ supabase/price-links.sql ครั้งเดียว · ระหว่างนี้ปุ่มที่หน้าสินค้ายังคัดลอกได้แต่จะได้ลิงก์ยาวแบบเดิม"
        />
      )}
      {err && !needsSetup && <Banner tone="warm" title={err} />}

      <Stats cols={4}>
        <HeroStat
          n={sum.unopened}
          label="ยังไม่เปิด"
          detail={
            sum.unopened
              ? "ส่งไปแล้วลูกค้ายังไม่กดดู — ทักย้ำในไลน์อีกที"
              : "ทุกใบที่ยังไม่หมดอายุ ลูกค้าเปิดดูแล้ว"
          }
          pct={sum.live ? (sum.unopened / sum.live) * 100 : 0}
        />
        <Stat
          label="เปิดแล้ว ยังไม่สั่ง"
          value={sum.opened}
          hint={sum.opened ? "ใบ — คนที่สนใจจริง ตามต่อได้เลย" : "ใบ"}
          tone={sum.opened ? "due" : undefined}
        />
        <Stat
          label="ใกล้หมดอายุ"
          value={sum.soon}
          hint={sum.soon ? "ใบ — เหลือไม่เกิน 2 วัน" : "ใบ"}
          tone={sum.soon ? "due" : undefined}
        />
        <Stat
          label="ส่ง 7 วันนี้"
          value={sum.sent7}
          hint={`7 วันก่อนหน้า ${sum.sentPrev7} ใบ · ${
            sum.sent7 === sum.sentPrev7 ? "เท่าเดิม" : sum.sent7 > sum.sentPrev7 ? "▲ มากขึ้น" : "▼ น้อยลง"
          }`}
        />
      </Stats>

      <FilterCard>
        <SearchBox value={q} onChange={setQ} placeholder="ค้นจากโค้ด / ชื่อสินค้า / คนเสนอ" />
        <div className="flex flex-wrap gap-2">
          {(["ทั้งหมด", "ยังไม่เปิด", "เปิดแล้ว", "ปิดไปแล้ว"] as Filter[]).map((f) => (
            <FChip key={f} on={filter === f} onClick={() => setFilter(f)} label={f} />
          ))}
        </div>
      </FilterCard>

      <ListHead title="ลิงก์ที่ส่งไปแล้ว" note={`${shown.length} ใบ`} />

      {loading ? (
        <p className="px-2 py-8 text-center text-sm" style={{ color: "var(--dk-faint)" }}>
          กำลังโหลด…
        </p>
      ) : shown.length === 0 ? (
        <Empty
          title={links.length ? "ไม่มีใบที่ตรงกับตัวกรองนี้" : "ยังไม่มีลิงก์ราคา"}
          body={
            links.length
              ? "ลองเปลี่ยนตัวกรองหรือล้างคำค้น"
              : "เปิดหน้าสินค้าที่หน้าร้าน เลือกตัวเลือก/จำนวนให้ลูกค้า แล้วกด “📤 คัดลอกราคา + ลิงก์” ในกล่องโหมดสั่งของ"
          }
        />
      ) : (
        <Rows>
          {shown.map((l) => {
            const st = priceLinkStatus(l);
            const left = daysLeft(l);
            const live = st === "ใช้ได้";
            const soon = live && left <= 2;
            const unopened = live && !l.opened;
            return (
              <Row
                key={l.code}
                tone={soon ? "var(--dk-coral-deep)" : unopened ? "var(--dk-yolk)" : "var(--dk-mint)"}
                done={!live}
              >
                <RowMain
                  name={l.productName}
                  href={l.productPath}
                  tags={
                    <>
                      {!live && <Tag tone="quiet">{st}</Tag>}
                      {unopened && <Tag tone="yolk">ลูกค้ายังไม่เปิด</Tag>}
                      {live && (l.opened ?? 0) > 0 && (
                        <Tag tone="mint" title={l.lastOpenedAt ? `ล่าสุด ${stamp(l.lastOpenedAt)}` : undefined}>
                          เปิดแล้ว {l.opened} ครั้ง
                        </Tag>
                      )}
                      {soon && <Tag tone="solid">{left <= 0 ? "หมดอายุวันนี้" : `เหลือ ${left} วัน`}</Tag>}
                    </>
                  }
                  meta={
                    <>
                      <span className="dkb-code">{l.code}</span>
                      <span>
                        {l.qty.toLocaleString("th-TH")} {l.unit}
                      </span>
                      <span title={l.lines.map(([k, v]) => `${k}: ${v}`).join(" · ")}>
                        {l.lines
                          .slice(0, 3)
                          .map(([, v]) => v)
                          .join(" · ")}
                      </span>
                      <span>โดย {l.createdBy}</span>
                      <span>{stamp(l.createdAt)}</span>
                    </>
                  }
                />
                <RowSide>
                  <span className="dkb-money">{l.askPrice ? "รอตีราคา" : formatPrice(l.total)}</span>
                  <span className="flex items-center gap-2">
                    <Btn small onClick={() => copy(l.code)}>
                      {copied === l.code ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
                    </Btn>
                    <Btn small href={`/p/${l.code}`}>
                      เปิดดู
                    </Btn>
                    {live ? (
                      <Btn small disabled={busy === l.code} onClick={() => void act(l.code, "close")}>
                        ปิดลิงก์
                      </Btn>
                    ) : (
                      <Btn small disabled={busy === l.code} onClick={() => void act(l.code, "extend")}>
                        ต่ออายุ 7 วัน
                      </Btn>
                    )}
                  </span>
                </RowSide>
              </Row>
            );
          })}
        </Rows>
      )}
    </PageShell>
  );
}
