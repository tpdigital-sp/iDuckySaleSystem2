"use client";

/**
 * 🧩 ไฟล์ .ai รวมเทมเพลต + ลายลูกค้า
 *
 * เทมเพลตที่เซฟแบบ "Create PDF Compatible File" ฝังเลเยอร์มาในรูปแบบมาตรฐาน PDF
 * (OCG — Optional Content Group) · ตัวรวมนี้เพิ่ม OCG "ลายลูกค้า …" แล้วฝังภาพลาย
 * "วาดก่อน" เนื้อหาเดิมทั้งหมด (prepend content stream) → ลายอยู่ล่างสุด
 * เส้นไดคัท/ไกด์ของเทมเพลตลอยทับให้เห็น · ต้องถอด PieceInfo (ข้อมูลปิดของ Adobe)
 * ออกด้วย ไม่งั้น Illustrator เปิดจากข้อมูลปิดแทน = ไม่เห็นลายที่เพิ่ม
 *
 * ⚠️ เลเยอร์ OCG มีผลใน Acrobat/เครื่อง RIP แต่ "Illustrator เปิดแล้วรวมเป็น Layer 1
 *    ชั้นเดียวเสมอ" (พาเนล Layers ของ AI อ่านจากข้อมูลปิดที่เราถอดทิ้งเท่านั้น
 *    — พิสูจน์จากไฟล์จริง 4 ก.ย. 69) · แยกเลเยอร์ใน AI ต้องรันสคริปต์คู่กัน:
 *    ปุ่มโหลด .jsx จาก layerSplitJsx() ข้างล่าง เปิดไฟล์แล้ว File > Scripts > Other Script…
 *
 * ⚠️ ใช้ได้เฉพาะเทมเพลตที่เซฟแบบ PDF compatible เท่านั้น (ตัวที่ปิดไว้เปิดไม่ได้
 *    ตั้งแต่ชั้น PDFDocument.load แล้ว — โยน error ข้อความไทยให้ผู้เรียกเอาไปแจ้ง)
 */

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef } from "pdf-lib";

export interface TplMergeInput {
  /** ที่อยู่ไฟล์ .ai ต้นฉบับของเทมเพลต (จดไว้ในออเดอร์เป็น [ai:…|tpl:…]) */
  tplUrl: string;
  /** ภาพลายที่ประกอบแล้ว ขนาดเท่ากรอบงานรวมตัดตก (ระบบเซฟเป็น .jpg เสมอ) */
  imageUrl: string;
  /** ชื่อเลเยอร์ใหม่ในพาเนล Layers เช่น "ลายลูกค้า OD-xxx ลายที่ 1" */
  layerName: string;
  title?: string;
}

/** หยิบ dict ลูกออกมา (ตามอ้างอิงถ้าเป็น indirect) — ไม่มีก็สร้างใหม่ใส่ให้ */
function ensureDict(doc: PDFDocument, parent: PDFDict, key: string): PDFDict {
  const existing = parent.lookupMaybe(PDFName.of(key), PDFDict);
  if (existing) return existing;
  const created = doc.context.obj({}) as PDFDict;
  parent.set(PDFName.of(key), created);
  return created;
}

/** เหมือน ensureDict แต่เป็น array */
function ensureArray(doc: PDFDocument, parent: PDFDict, key: string): PDFArray {
  const existing = parent.lookupMaybe(PDFName.of(key), PDFArray);
  if (existing) return existing;
  const created = doc.context.obj([]) as PDFArray;
  parent.set(PDFName.of(key), created);
  return created;
}

export async function buildTplMergedAi(input: TplMergeInput): Promise<Blob> {
  const [tplRes, artRes] = await Promise.all([fetch(input.tplUrl), fetch(input.imageUrl)]);
  if (!tplRes.ok) throw new Error(`โหลดไฟล์เทมเพลตไม่สำเร็จ (${tplRes.status})`);
  if (!artRes.ok) throw new Error(`โหลดภาพลายไม่สำเร็จ (${artRes.status})`);
  const [tplBytes, artBytes] = await Promise.all([tplRes.arrayBuffer(), artRes.arrayBuffer()]);

  const head = new Uint8Array(tplBytes.slice(0, 5));
  if (String.fromCharCode(...head) !== "%PDF-")
    throw new Error("เทมเพลตนี้ไม่ได้เซฟแบบ PDF compatible — รวมเลเยอร์ไม่ได้ ใช้ไฟล์พร้อมพิมพ์แบบลายล้วนแทน");

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(tplBytes, { ignoreEncryption: true });
  } catch {
    throw new Error("เปิดโครงไฟล์เทมเพลตไม่สำเร็จ — ใช้ไฟล์พร้อมพิมพ์แบบลายล้วนแทน");
  }
  const page = doc.getPage(0);
  const pw = page.getWidth();
  const ph = page.getHeight();

  // ภาพลาย: ระบบเซฟเป็น JPEG เสมอ แต่กันเหนียวรองรับ PNG ด้วย (ดูจาก magic bytes)
  const artHead = new Uint8Array(artBytes.slice(0, 2));
  const img =
    artHead[0] === 0x89 ? await doc.embedPng(artBytes) : await doc.embedJpg(artBytes);

  // ── 1) เลเยอร์ใหม่ (OCG) · ต่อท้าย /Order = อยู่ล่างสุดในพาเนล Layers ──
  const ocg = doc.context.obj({ Type: "OCG", Name: PDFHexString.fromText(input.layerName) }) as PDFDict;
  const ocgRef = doc.context.register(ocg);
  const ocp = ensureDict(doc, doc.catalog, "OCProperties");
  ensureArray(doc, ocp, "OCGs").push(ocgRef);
  const d = ensureDict(doc, ocp, "D");
  ensureArray(doc, d, "ON").push(ocgRef);
  ensureArray(doc, d, "Order").push(ocgRef);

  // ── 2) ลงทะเบียนภาพ + เลเยอร์ในทรัพยากรของหน้า ──
  const resources = ensureDict(doc, page.node, "Resources");
  ensureDict(doc, resources, "XObject").set(PDFName.of("ImArtOD"), img.ref);
  ensureDict(doc, resources, "Properties").set(PDFName.of("MCArtOD"), ocgRef);

  // ── 3) วาดลายเต็มหน้า "ก่อน" เนื้อหาเทมเพลต → เส้นไดคัท/ไกด์ทับลายให้เห็นเสมอ ──
  // แนวภาพไม่ตรงกับแนวหน้า (ออเดอร์ที่สลับแนวตอนวาง) → หมุน 90° ให้เต็มหน้าพอดี
  const mismatch = img.width > img.height !== pw > ph;
  const cm = mismatch
    ? `0 ${ph.toFixed(3)} ${(-pw).toFixed(3)} 0 ${pw.toFixed(3)} 0 cm`
    : `${pw.toFixed(3)} 0 0 ${ph.toFixed(3)} 0 0 cm`;
  const pre = doc.context.stream(`q\n/OC /MCArtOD BDC\n${cm}\n/ImArtOD Do\nEMC\nQ\n`);
  const preRef = doc.context.register(pre);
  const contents = page.node.get(PDFName.of("Contents"));
  if (contents instanceof PDFArray) contents.insert(0, preRef);
  else if (contents instanceof PDFRef) page.node.set(PDFName.of("Contents"), doc.context.obj([preRef, contents]));
  else throw new Error("หน้าเทมเพลตไม่มีเนื้อหาให้รวม");

  // ── 4) ถอดข้อมูลปิดของ Illustrator — ให้เปิดเป็น PDF ธรรมดาที่เห็นของที่รวมจริง ──
  page.node.delete(PDFName.of("PieceInfo"));
  doc.catalog.delete(PDFName.of("PieceInfo"));

  if (input.title) doc.setTitle(input.title);

  // ห้ามอัด object stream — Illustrator รุ่นเก่าบางตัวอ่านไม่ได้ เอาแบบชัวร์ไว้ก่อน
  const bytes = await doc.save({ useObjectStreams: false });
  return new Blob([bytes as unknown as BlobPart], { type: "application/postscript" });
}

/**
 * 📜 สคริปต์ ExtendScript (.jsx) คู่กับไฟล์รวม — แยกของใน Layer 1 เป็นเลเยอร์จริงของ AI
 * (Illustrator เปิดไฟล์รวมแล้วยุบทุกอย่างลง Layer 1 — ดูหมายเหตุหัวไฟล์)
 * โหมดทั้งโฟลเดอร์: รันใน Illustrator (File > Scripts > Other Script…) → เลือกโฟลเดอร์
 * → ไล่เปิดทุก .ai แยกเลเยอร์ แล้ว "เซฟทับไฟล์เดิม" ปิดเอง ไม่ค้างในโปรแกรม
 * กันรันซ้ำด้วยการดูข้างในไฟล์ (มีเลเยอร์ Details Cut แล้ว = ข้าม)
 * ชื่อเลเยอร์ลายตั้งตามชื่อไฟล์ ("ลายลูกค้า <ชื่อไฟล์>") — สคริปต์ตัวเดียวใช้ได้ทุกออเดอร์
 */
export function layerSplitJsx(): Blob {
  // ES3 เท่านั้น (ExtendScript ไม่รู้จัก let/arrow/template string)
  const js = `// Split ALL merged template .ai files in a folder - run inside Illustrator
// File > Scripts > Other Script... -> pick this file -> choose a folder
// Each .ai gets opened, split into layers, saved OVER the same file, then closed.
(function () {
  var oldLevel = app.userInteractionLevel;
  try {
    var folder = Folder.selectDialog("เลือกโฟลเดอร์ที่มีไฟล์รวมเทมเพลต (.ai)");
    if (!folder) return; // กดยกเลิก
    var files = folder.getFiles("*.ai");
    if (files.length === 0) { alert("ไม่พบไฟล์ .ai ในโฟลเดอร์นี้"); return; }

    // ปิดกล่องเตือนระหว่างแบตช์ (ฟอนต์หาย ฯลฯ) — ไม่งั้นค้างรอคนกดทุกไฟล์
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    function hasImage(it) {
      if (it.typename === "RasterItem" || it.typename === "PlacedItem") return true;
      if (it.typename === "GroupItem") {
        for (var j = 0; j < it.pageItems.length; j++) if (hasImage(it.pageItems[j])) return true;
      }
      return false;
    }
    // แยกของใน Layer 1: มีรูป -> เลเยอร์ลาย (ล่างสุด) · ที่เหลือ -> Details Cut (บนสุด)
    function splitLayers(doc, artName) {
      // เคยแยกแล้ว (มีเลเยอร์ Details Cut) -> ไม่ทำซ้ำ
      for (var d = 0; d < doc.layers.length; d++) {
        if (doc.layers[d].name === "Details Cut") return "already";
      }
      var src = null;
      for (var s = 0; s < doc.layers.length; s++) {
        if (doc.layers[s].pageItems.length > 0) { src = doc.layers[s]; break; }
      }
      if (!src) return "empty";
      src.locked = false;
      src.visible = true;
      // เฉพาะไอเท็มชั้นบนสุด (pageItems นับของในกลุ่มลึก ๆ ด้วย ย้ายทีละตัวกลุ่มจะแตก)
      var tops = [];
      for (var i = 0; i < src.pageItems.length; i++) {
        if (src.pageItems[i].parent === src) tops.push(src.pageItems[i]);
      }
      if (tops.length === 0) return "empty";
      var cut = doc.layers.add();
      cut.name = "Details Cut";
      var art = doc.layers.add();
      art.name = artName;
      for (var k = 0; k < tops.length; k++) {
        var it = tops[k];
        it.locked = false;
        it.hidden = false;
        it.move(hasImage(it) ? art : cut, ElementPlacement.PLACEATBEGINNING);
      }
      cut.move(doc.layers[0], ElementPlacement.PLACEBEFORE);
      art.move(doc.layers[doc.layers.length - 1], ElementPlacement.PLACEAFTER);
      if (src.pageItems.length === 0) src.remove();
      return "done";
    }

    var done = [], skipped = [], failed = [];
    for (var fi = 0; fi < files.length; fi++) {
      var f = files[fi];
      if (!(f instanceof File)) continue;
      var base = f.displayName.replace(/\\.ai$/i, "");
      var doc = null;
      try {
        doc = app.open(f);
        var r = splitLayers(doc, "ลายลูกค้า " + base);
        if (r === "done") {
          // เซฟทับไฟล์เดิม (คงชื่อ/ที่อยู่เดิมทุกอย่าง)
          var opts = new IllustratorSaveOptions();
          opts.pdfCompatible = true;
          doc.saveAs(f, opts);
          done.push(f.displayName);
        } else {
          skipped.push(f.displayName + (r === "already" ? " (แยกไว้แล้ว)" : " (ไม่มีอะไรให้แยก)"));
        }
        doc.close(SaveOptions.DONOTSAVECHANGES);
      } catch (e1) {
        failed.push(f.displayName + " — " + e1.message);
        try { if (doc) doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
      }
    }

    app.userInteractionLevel = oldLevel;
    var msg = "เสร็จแล้ว ✅ แยกเลเยอร์ทับไฟล์เดิม " + done.length + " ไฟล์";
    if (skipped.length > 0) msg += "\\nข้าม " + skipped.length + " ไฟล์: " + skipped.join(", ");
    if (failed.length > 0) msg += "\\nพลาด " + failed.length + " ไฟล์:\\n" + failed.join("\\n");
    alert(msg);
  } catch (e) {
    app.userInteractionLevel = oldLevel;
    alert("สคริปต์สะดุด: " + e.message + (e.line ? "\\nบรรทัด " + e.line : ""));
  }
})();
`;
  // BOM นำหน้า — Illustrator บางรุ่นอ่านไฟล์ไทยไม่มี BOM แล้วข้อความเพี้ยน
  return new Blob(["\uFEFF", js], { type: "text/javascript" });
}
