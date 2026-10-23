/**
 * สแตนดี้ฐานไฟ (id "1-3") — ค่าเพิ่มขนาดกำหนดเองปัดเศษแบบผ่อน .5 (SizeFee.roundSlack)
 * พนักงานแจ้ง 23 ต.ค. 69: "15.6-16.5 ซม คิดราคาเพิ่ม 1 เซน · 16.6-17.5 ซม คิดราคาพิ่ม 2 เซน"
 * (เดิม 16.5 ตกขั้น upTo 17 = +2 ซม. = ฿30 ของทรงกลม)
 *
 *   node --experimental-strip-types scripts/light-standee-round-slack.mts          (ดูก่อน)
 *   node --experimental-strip-types scripts/light-standee-round-slack.mts --write  (เขียน + อ่านกลับเทียบ)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { sizeFeeOf } from "../src/lib/products.ts";

const PRODUCT_ID = "1-3";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (error) throw error;
const data = row.data;
let n = 0;
for (const o of data.options ?? [])
  for (const c of o.choices ?? [])
    if (c.sizeFee) {
      c.sizeFee.roundSlack = 0.5;
      n++;
      const sf = c.sizeFee;
      const at = (v: number) =>
        sizeFeeOf(sf, {
          ...(sf.when ? { [sf.when.label]: sf.when.choices[0] } : {}),
          ...(sf.onlyWhen ? { [sf.onlyWhen.label]: sf.onlyWhen.choices[0] } : {}),
          [sf.widthLabel]: String(v),
          [sf.heightLabel]: "1",
        });
      console.log(`${o.label} / ${c.name} [${o.showWhen?.choices?.join(",") ?? ""}]`);
      console.log("  " + [15, 15.5, 15.6, 16, 16.5, 16.6, 17.5, 17.6, 30].map((v) => `${v}=฿${at(v)}`).join(" · "));
    }
if (n !== 2) throw new Error(`คาดว่าเจอ sizeFee 2 ตัว (ทรงกลม/สี่เหลี่ยม) แต่เจอ ${n}`);
if (!process.argv.includes("--write")) {
  console.log("\n(ยังไม่เขียน — ใส่ --write)");
  process.exit(0);
}
data.savedAt = new Date().toISOString();
const { error: wErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID);
if (wErr) throw wErr;
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = (back!.data.options ?? []).flatMap((o: any) => o.choices ?? []).filter((c: any) => c.sizeFee);
if (!got.every((c: any) => c.sizeFee.roundSlack === 0.5)) throw new Error("อ่านกลับไม่ตรง");
console.log(`✅ เขียน roundSlack 0.5 ครบ ${got.length} ตัว`);
