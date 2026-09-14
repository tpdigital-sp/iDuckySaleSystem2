"use client";

/**
 * 🆔 /admin/line-groups — หาเลขห้องแชท LINE เพื่อย้ายข้อความแจ้งเตือนของร้านเข้าไลน์กลุ่ม
 *
 * เจ้าของร้านสั่ง 14 ก.ย. 69: ข้อความ "ออเดอร์สั่งจำนวนมาก · ของใกล้หมด" เข้าไลน์ส่วนตัวคนเดียว
 * อยากให้เข้ากลุ่มพนักงาน — LINE ไม่มี API ให้ถามว่ากลุ่มไหนเลขอะไร ต้องรอ event จาก webhook
 * หน้านี้แค่ "อ่านกับคัดลอก" เลขที่ /api/line/webhook จดไว้ ไม่ได้ตั้งค่าอะไรเอง
 * (ค่าจริงอยู่ใน env LINE_STOCK_ALERT_TO บน Netlify ต้อง deploy ใหม่ถึงจะมีผล)
 */

import RequirePerm from "@/components/RequirePerm";
import { useCallback, useEffect, useState } from "react";
import { usePolling } from "@/lib/use-polling";
import { Banner, Btn, CopyChip, Empty, ListHead, PageHead, PageShell, Row, RowMain, RowSide, Rows, Tag } from "@/components/admin/ui";
import type { LineSource } from "@/lib/server/line-sources";

interface Env {
  channelSecret: boolean;
  accessToken: boolean;
  forward: boolean;
  /** ตัวอักษรแรกของปลายทางปัจจุบัน: C = กลุ่มแล้ว · U = ยังเป็นแชทเดี่ยว · ว่าง = ยังไม่ได้ตั้ง */
  alertTo: string;
}

const thTime = (iso: string) => {
  const d = new Date(iso);
  return isFinite(d.getTime())
    ? d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
};

const TYPE_LABEL: Record<LineSource["type"], string> = {
  group: "ไลน์กลุ่ม",
  room: "ห้องแชท (แบบเก่า)",
  user: "แชทเดี่ยว",
};

function LineGroupsInner() {
  const [rows, setRows] = useState<LineSource[] | null>(null);
  const [env, setEnv] = useState<Env | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/line-sources", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as { sources?: LineSource[]; env?: Env } | null;
      setRows(j?.sources ?? []);
      if (j?.env) setEnv(j.env);
    } catch {
      setRows((v) => v ?? []);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  // เปิดหน้านี้ค้างไว้แล้วไปพิมพ์ในกลุ่ม — เลขต้องโผล่เองไม่ต้องรีเฟรช
  usePolling(load, { intervalMs: 10_000 });

  async function clearAll() {
    if (busy || !window.confirm("ล้างรายการเลขห้องที่จดไว้ทั้งหมด?")) return;
    setBusy(true);
    try {
      await fetch("/api/admin/line-sources", { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (rows === null) {
    return (
      <PageShell>
        <Empty title="กำลังโหลด…" body="ดึงเลขห้องแชทที่ระบบจดไว้" />
      </PageShell>
    );
  }

  const groups = rows.filter((r) => r.type === "group");
  const already = env?.alertTo === "C";

  return (
    <PageShell>
      <PageHead
        group="ตั้งค่าระบบ"
        title="เลขห้องแชท LINE"
        count={groups.length ? `${groups.length} กลุ่ม` : undefined}
        sub="ใช้ย้ายข้อความแจ้งเตือนของร้าน (ออเดอร์สั่งจำนวนมาก · ของใกล้หมด · ใบสมัครตัวแทน) จากไลน์ส่วนตัวไปเข้าไลน์กลุ่ม"
      />

      {already && (
        <div className="mt-4">
          <Banner tone="warm" title="ตอนนี้แจ้งเข้ากลุ่มอยู่แล้ว" detail="ค่าปลายทางปัจจุบันขึ้นต้นด้วย C ซึ่งเป็นเลขของไลน์กลุ่ม" />
        </div>
      )}
      {env && !env.channelSecret && (
        <div className="mt-4">
          <Banner
            tone="warm"
            title="ยังตรวจลายเซ็นไม่ได้"
            detail="ยังไม่ได้ตั้ง LINE_MESSAGING_CHANNEL_SECRET — เลขที่จดได้จะขึ้นป้าย “ยังไม่ยืนยัน” ใช้งานได้แต่ควรตั้งให้ครบ"
          />
        </div>
      )}

      <div className="mt-4 rounded-xl border border-slate-200/70 bg-white p-4">
        <p className="text-[13px] font-bold text-slate-700">ทำตามนี้ทีละขั้น</p>
        <ol className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-slate-600">
          <li>
            <b>1.</b> LINE Official Account Manager → ตั้งค่า → การตอบกลับ → เปิด{" "}
            <b>“อนุญาตให้เข้าร่วมกลุ่มแชท”</b>
          </li>
          <li>
            <b>2.</b> ตั้ง Webhook URL ของ Messaging API เป็น{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11.5px]">
              https://iduckystore.com/api/line/webhook
            </code>{" "}
            แล้วเปิด Use webhook
          </li>
          <li>
            <b>3.</b> เชิญ OA ร้านเข้ากลุ่มพนักงาน แล้ว<b>พิมพ์อะไรก็ได้ในกลุ่มนั้น 1 ครั้ง</b> — เลขจะโผล่ข้างล่างเอง
          </li>
          <li>
            <b>4.</b> คัดลอกเลข → Netlify → Project configuration → Environment variables → ใส่ใน{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11.5px]">LINE_STOCK_ALERT_TO</code> →{" "}
            <b>deploy ใหม่ 1 รอบ</b>
          </li>
        </ol>
        <p className="mt-2.5 text-[12px] leading-relaxed text-slate-500">
          ⚠️ บอทตอบแชทลูกค้าทำงานที่ n8n — ถ้าเปลี่ยน Webhook URL มาที่เว็บนี้ ต้องตั้ง env{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11.5px]">LINE_FORWARD_WEBHOOK_URL</code>{" "}
          เป็น URL เดิมของ n8n ด้วย ระบบจะส่งต่อให้ทุกข้อความ บอทจึงตอบเหมือนเดิม
          {env && (env.forward ? " — ตอนนี้ตั้งไว้แล้ว" : " — ตอนนี้ยังไม่ได้ตั้ง")}
        </p>
      </div>

      <ListHead title="ห้องที่ OA ได้ยินล่าสุด" note="ใหม่สุดขึ้นก่อน · เก็บไว้ 8 ห้อง" />

      {rows.length === 0 ? (
        <Empty
          title="ยังไม่มีเลขห้อง"
          body="ทำขั้น 1–3 ด้านบนให้ครบ แล้วพิมพ์ในกลุ่ม 1 ครั้ง — หน้านี้เช็คให้เองทุก 10 วินาที ไม่ต้องรีเฟรช"
        />
      ) : (
        <Rows>
          {rows.map((r) => (
            <Row key={r.id} tone={r.type === "group" ? "var(--dk-mint)" : "var(--dk-quiet)"} done={r.type !== "group"}>
              <RowMain
                /* กลุ่มที่ถามชื่อจาก LINE ได้ = โชว์ชื่อกลุ่ม · ไม่ได้ชื่อ = โชว์เลขห้องเป็นหัวแถวไปเลย
                   (ไม่งั้นหัวแถวกับป้ายจะเป็นคำเดียวกัน อ่านแล้วไม่ได้อะไรเพิ่ม) */
                name={r.name || r.id}
                tags={
                  <>
                    <Tag tone={r.type === "group" ? "mint" : "quiet"}>{TYPE_LABEL[r.type]}</Tag>
                    {!r.verified && <Tag tone="quiet">ยังไม่ยืนยันลายเซ็น</Tag>}
                  </>
                }
                meta={
                  <>
                    {r.name && <span className="id">{r.id}</span>}
                    <span>ได้ยินเมื่อ {thTime(r.at)}</span>
                  </>
                }
              />
              <RowSide>
                <CopyChip label="คัดลอกเลขห้อง" text={() => r.id} />
              </RowSide>
            </Row>
          ))}
        </Rows>
      )}

      {rows.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Btn small disabled={busy} onClick={() => void clearAll()} title="คัดลอกไปใส่ Netlify แล้วล้างทิ้งได้">
            {busy ? "กำลังล้าง…" : "🧹 ล้างรายการ"}
          </Btn>
        </div>
      )}
    </PageShell>
  );
}

export default function LineGroupsPage() {
  return (
    <RequirePerm perm="settings.manage">
      <LineGroupsInner />
    </RequirePerm>
  );
}
