"""
illustrator.py — ให้ Adobe Illustrator ในเครื่อง (macOS) แปลงไฟล์เป็น .ai แท้ที่แยกเลเยอร์

ขั้นตอน: แอพสร้างไฟล์ .ai (PDF) ไว้ในโฟลเดอร์ชั่วคราว -> สั่ง Illustrator ผ่าน AppleScript
         ให้เปิด ย้ายเส้น CutContour ไปเลเยอร์ของตัวเอง แล้ว Save As เป็น Illustrator แท้
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

BUNDLE_ID = "com.adobe.illustrator"
_LOCK = threading.Lock()  # Illustrator ทำงานทีละงาน
_AVAILABLE: bool | None = None

JSX_CORE = r"""
// แยกเลเยอร์ตามชื่อสีพิเศษ: Cut100 / Cut50 (เส้นตัด), White (รองขาว), ที่เหลือ = Artwork
var SPOT_LAYERS = ["Cut100", "Cut50", "White"], ART_LAYER = "Artwork";
function spotName(c){ try{ if(c && c.typename==="SpotColor"){ var n=c.spot.name;
  if(/cutcontour/i.test(n)) return "Cut100";
  for(var i=0;i<SPOT_LAYERS.length;i++){ if(n.toLowerCase()===SPOT_LAYERS[i].toLowerCase()) return SPOT_LAYERS[i]; } } }catch(e){} return null; }
function itemSpot(p){ try{ return (p.stroked && spotName(p.strokeColor)) || (p.filled && spotName(p.fillColor)) || null; }catch(e){ return null; } }
function getLayer(doc,name){ for(var i=0;i<doc.layers.length;i++){ if(doc.layers[i].name===name) return doc.layers[i]; }
  var l=doc.layers.add(); l.name=name; return l; }
function ungroupAll(container,target){
  var changed=true, guard=0;
  while(changed && guard<50){ changed=false; guard++;
    for(var i=container.groupItems.length-1;i>=0;i--){
      var g=container.groupItems[i]; if(g.parent!==container) continue;
      if(g.clipped){
        for(var k=g.pathItems.length-1;k>=0;k--){ if(g.pathItems[k].clipping){ try{ g.pathItems[k].remove(); }catch(e){} } }
        for(var k2=g.compoundPathItems.length-1;k2>=0;k2--){ try{ var cp=g.compoundPathItems[k2];
          if(cp.pathItems.length && cp.pathItems[0].clipping) cp.remove(); }catch(e){} }
        try{ g.clipped=false; }catch(e){}
      }
      for(var j=g.pageItems.length-1;j>=0;j--){ g.pageItems[j].move(target, ElementPlacement.PLACEATBEGINNING); }
      try{ g.remove(); }catch(e){}
      changed=true;
    }
  }
}
function processDoc(doc){
  var art=getLayer(doc,ART_LAYER);
  for(var i=doc.layers.length-1;i>=0;i--){ var L=doc.layers[i];
    if(L===art) continue;
    var keep=false; for(var s=0;s<SPOT_LAYERS.length;s++){ if(L.name===SPOT_LAYERS[s]) keep=true; }
    L.locked=false; L.visible=true;
    if(keep) continue;
    for(var j=L.pageItems.length-1;j>=0;j--){ L.pageItems[j].move(art, ElementPlacement.PLACEATBEGINNING); }
    try{ L.remove(); }catch(e){}
  }
  art.locked=false; ungroupAll(art,art);
  var list=[], n, sp;
  for(n=0;n<art.compoundPathItems.length;n++){ var cp=art.compoundPathItems[n];
    if(cp.pathItems.length && (sp=itemSpot(cp.pathItems[0]))) list.push([cp, sp]); }
  for(n=0;n<art.pathItems.length;n++){ var p=art.pathItems[n];
    if(p.parent.typename!=="CompoundPathItem" && (sp=itemSpot(p))) list.push([p, sp]); }
  var used={};
  for(n=0;n<list.length;n++){ var L2=getLayer(doc,list[n][1]); list[n][0].move(L2, ElementPlacement.PLACEATBEGINNING); used[list[n][1]]=L2; }
  // ลำดับเลเยอร์: White ล่างสุด, Artwork, แล้วเส้นตัดไว้บนสุด
  if(used["White"]) used["White"].zOrder(ZOrderMethod.SENDTOBACK);
  if(used["Cut50"]) used["Cut50"].zOrder(ZOrderMethod.BRINGTOFRONT);
  if(used["Cut100"]) used["Cut100"].zOrder(ZOrderMethod.BRINGTOFRONT);
  for(var key in used){ if(key!=="White") used[key].locked=true; }
  return list.length;
}
"""

JSX_BATCH = r"""
(function(){
  var jobs = __JOBS__, out = [];
  var old = app.userInteractionLevel;
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  for(var i=0;i<jobs.length;i++){
    try{
      var doc = app.open(new File(jobs[i][0]));
      var m = processDoc(doc);
      var o = new IllustratorSaveOptions(); o.pdfCompatible = true;
      doc.saveAs(new File(jobs[i][1]), o);
      doc.close(SaveOptions.DONOTSAVECHANGES);
      out.push("OK:" + m);
    }catch(e){
      out.push("ERR:" + e.message);
      try{ app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); }catch(e2){}
    }
  }
  app.userInteractionLevel = old;
  return out.join("\n");
})();
"""


def available() -> bool:
    """มี Illustrator ในเครื่องนี้ไหม (เช็กครั้งเดียว ไม่เปิดโปรแกรม)"""
    global _AVAILABLE
    if _AVAILABLE is None:
        if sys.platform != "darwin" or not shutil.which("osascript"):
            _AVAILABLE = False
        else:
            try:
                r = subprocess.run(["mdfind", f"kMDItemCFBundleIdentifier == '{BUNDLE_ID}'"],
                                   capture_output=True, text=True, timeout=10)
                _AVAILABLE = bool(r.stdout.strip())
            except Exception:
                _AVAILABLE = False
    return _AVAILABLE


def layered(ai_files: list[bytes], timeout: int = 600) -> list[bytes]:
    """รับไฟล์ .ai (PDF) หลายไฟล์ คืนไฟล์ .ai แท้ที่แยกเลเยอร์แล้ว ลำดับเดียวกัน"""
    if not available():
        raise RuntimeError("ไม่พบ Adobe Illustrator ในเครื่องนี้")
    with _LOCK, tempfile.TemporaryDirectory(prefix="cutlayer_") as tmp:
        tmp = Path(tmp)
        jobs = []
        for i, data in enumerate(ai_files):
            src, dst = tmp / f"in_{i}.ai", tmp / f"out_{i}.ai"
            src.write_bytes(data)
            jobs.append([str(src), str(dst)])
        jsx = JSX_CORE + JSX_BATCH.replace("__JOBS__", json.dumps(jobs))
        (tmp / "run.jsx").write_text(jsx, encoding="utf-8")
        scpt = (f'with timeout of {timeout} seconds\n'
                f'  tell application id "{BUNDLE_ID}"\n'
                f'    do javascript (read POSIX file "{tmp / "run.jsx"}" as «class utf8»)\n'
                f'  end tell\n'
                f'end timeout\n')
        (tmp / "run.applescript").write_text(scpt, encoding="utf-8")
        r = subprocess.run(["osascript", str(tmp / "run.applescript")],
                           capture_output=True, text=True, timeout=timeout + 30)
        if r.returncode != 0:
            err = r.stderr.strip()
            if "-1743" in err or "Not authorized" in err:
                raise RuntimeError("macOS ยังไม่อนุญาตให้ควบคุม Illustrator: ไปที่ System Settings > "
                                   "Privacy & Security > Automation แล้วเปิดสิทธิ์ Terminal → Adobe Illustrator")
            raise RuntimeError(f"สั่ง Illustrator ไม่สำเร็จ: {err[:300]}")
        lines = [l for l in r.stdout.strip().splitlines() if l.strip()]
        out = []
        for i, (src, dst) in enumerate(jobs):
            st = lines[i] if i < len(lines) else "ERR:ไม่มีผลลัพธ์"
            if not st.startswith("OK") or not Path(dst).exists():
                raise RuntimeError(f"Illustrator แปลงไฟล์ที่ {i + 1} ไม่ได้: {st[4:]}")
            out.append(Path(dst).read_bytes())
        return out
