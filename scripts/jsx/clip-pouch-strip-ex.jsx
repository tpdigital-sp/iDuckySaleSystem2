var inDir = new Folder("<โฟลเดอร์สำเนา>/in"), outDir = "<โฟลเดอร์สำเนา>/out/";
var files = inDir.getFiles("*.ai"), log = [];
while (app.documents.length) app.documents[0].close(SaveOptions.DONOTSAVECHANGES);
app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
var TH = app.textFonts.getByName("Thonburi");
for (var i = 0; i < files.length; i++) {
  var doc = app.open(files[i]);
  var removed = 0, refont = 0;
  for (var j = doc.layers.length - 1; j >= 0; j--) {
    var L = doc.layers[j];
    if (L.name == "ex") { L.locked = false; L.visible = true; L.remove(); removed++; }
  }
  var st = [];
  function open_(ls) { for (var a = 0; a < ls.length; a++) { st.push([ls[a], ls[a].locked, ls[a].visible]); ls[a].locked = false; ls[a].visible = true; open_(ls[a].layers); } }
  open_(doc.layers);
  for (var k = 0; k < doc.textFrames.length; k++) {
    var tf = doc.textFrames[k];
    var ca = tf.textRange.characterAttributes;
    if (ca.textFont.name == "THSarabunPSK") { var wl = tf.locked, wh = tf.hidden; tf.locked = false; tf.hidden = false; var sz = ca.size; ca.textFont = TH; ca.size = sz * 0.72; tf.locked = wl; tf.hidden = wh; refont++; }
  }
  for (var b = st.length - 1; b >= 0; b--) { st[b][0].visible = st[b][2]; st[b][0].locked = st[b][1]; }
  var o = new IllustratorSaveOptions(); o.pdfCompatible = true; o.compressed = true; o.embedLinkedFiles = true;
  doc.saveAs(new File(outDir + files[i].name), o);
  doc.close(SaveOptions.DONOTSAVECHANGES);
  log.push(decodeURI(files[i].name) + " removed=" + removed + " refont=" + refont);
}
log.join("\n");
