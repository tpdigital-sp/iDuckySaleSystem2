import {readdirSync,readFileSync} from "node:fs";
const DIR=".cache/pricelist-pages/";
const decode=(s)=>s.replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n));
const strip=(s)=>decode(String(s).replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim();
for(const f of readdirSync(DIR)){
  const html=readFileSync(DIR+f,"utf8");
  for(const t of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)){
    const rows=[...t[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(tr=>[...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c=>strip(c[1])));
    const head=(rows[0]||[]).join("|");
    if(/2cm\|3cm\|4cm|เพิ่มเติม/.test(head) && /10cm/.test(head)){
      console.log("\n=== ", decodeURIComponent(f));
      const before=strip(html.slice(Math.max(0,t.index-900),t.index)).slice(-200);
      console.log("BEFORE:", before);
      rows.forEach(r=>console.log("  | "+r.join(" | ")));
    }
  }
}
