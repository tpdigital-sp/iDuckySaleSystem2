/*
  แยกเลเยอร์เส้นตัด.jsx  — สคริปต์ Adobe Illustrator

  แยกของในไฟล์ .ai จากแอพทำเส้นไดคัท ออกเป็นเลเยอร์ตามชื่อสีพิเศษ:
    Cut100 / Cut50 (เส้นตัด, อยู่บนสุดและล็อกไว้) · Artwork (ภาพ) · White (รองขาว, ล่างสุด)

  - มีไฟล์เปิดอยู่  -> แยกเลเยอร์ทุกไฟล์ที่เปิด (กด Cmd+S บันทึกเอง)
  - ไม่มีไฟล์เปิด   -> เลือกโฟลเดอร์ แยกทุกไฟล์ .ai แล้วบันทึกไว้ในโฟลเดอร์ย่อย "แยกเลเยอร์แล้ว"

  เปิดสคริปต์: Illustrator > File > Scripts > Other Script...
*/
#target illustrator

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
(function () {
    if (app.documents.length > 0) {
        var report = [];
        for (var d = 0; d < app.documents.length; d++) {
            var doc = app.documents[d];
            app.activeDocument = doc;
            var m = processDoc(doc);
            report.push(doc.name + " : " + (m ? "แยกแล้ว " + m + " ชิ้น" : "ไม่พบเส้น Cut100/Cut50/White"));
        }
        alert("เสร็จแล้ว\n\n" + report.join("\n") + "\n\nอย่าลืมกด Cmd+S บันทึกไฟล์");
        return;
    }
    var folder = Folder.selectDialog("เลือกโฟลเดอร์ที่มีไฟล์ .ai จากแอพทำเส้นไดคัท");
    if (!folder) return;
    var files = folder.getFiles(function (f) { return f instanceof File && /\.ai$/i.test(f.name); });
    if (!files.length) { alert("ไม่พบไฟล์ .ai ในโฟลเดอร์นี้"); return; }
    var outDir = new Folder(folder.fsName + "/แยกเลเยอร์แล้ว");
    if (!outDir.exists) outDir.create();
    var ok = 0, none = [], fail = [];
    var oldLevel = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    for (var i = 0; i < files.length; i++) {
        try {
            var doc2 = app.open(files[i]);
            var moved = processDoc(doc2);
            var opts = new IllustratorSaveOptions();
            opts.pdfCompatible = true;
            doc2.saveAs(new File(outDir.fsName + "/" + files[i].name), opts);
            doc2.close(SaveOptions.DONOTSAVECHANGES);
            if (moved) ok++; else none.push(decodeURI(files[i].name));
        } catch (e) {
            fail.push(decodeURI(files[i].name) + " (" + e.message + ")");
            try { app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
        }
    }
    app.userInteractionLevel = oldLevel;
    var msg = "เสร็จแล้ว " + ok + " ไฟล์\nบันทึกไว้ที่โฟลเดอร์: แยกเลเยอร์แล้ว";
    if (none.length) msg += "\n\nไม่พบเส้น:\n" + none.join("\n");
    if (fail.length) msg += "\n\nเปิดไม่ได้:\n" + fail.join("\n");
    alert(msg);
})();
