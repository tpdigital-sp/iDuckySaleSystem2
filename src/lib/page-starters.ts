/**
 * เนื้อหาตั้งต้นตอนกด "เขียนทับหน้านี้" — หน้าตาเหมือนหน้าสำเร็จรูปจริง
 * ใช้ inline style (สีตามแบรนด์ที่รีแมปแล้ว: ฟ้า #3fa1b6 ramp + เหลือง ducky #ffdb57)
 * เพื่อให้การ์ด/กล่องสีติดไปกับเนื้อหา แก้ในตัวเขียนได้ และผ่านตัวกรอง HTML
 *
 * ⚠️ ถ้าแก้เนื้อหาหน้าสำเร็จรูป (how-to-order/about) อย่าลืมอัปเดตไฟล์นี้ให้ตรงกัน
 */

/* ── ชิ้นส่วนสไตล์ (สีจริงหลังรีแมป amber→ฟ้า) ── */
const CARD = "background:#ffffff;border:1px solid #d6edf2;border-radius:24px;padding:20px;box-shadow:0 1px 2px rgba(15,23,42,.04);margin-top:12px";
const H2C = "text-align:center;color:#1a3843;margin-top:40px";

/** การ์ดขั้นตอน: เลข + อีโมจิบนพื้นเหลือง + เนื้อหา */
const step = (n: number, emoji: string, title: string, desc: string) => `
<div style="${CARD};display:flex;gap:16px;align-items:flex-start">
<div style="flex-shrink:0;width:48px;height:48px;background:#ffdb57;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:24px">${emoji}</div>
<div><p style="font-weight:800;color:#292524;margin:0"><span style="color:#3fa1b6">ขั้นที่ ${n}</span> · ${title}</p>
<p style="color:#78716c;font-size:14px;line-height:1.7;margin:4px 0 0">${desc}</p></div>
</div>`;

/** การ์ด "ทำเองได้หลังสั่ง": หัวข้อ + คำอธิบาย + กล่องเวลา ⏱ */
const after = (emoji: string, title: string, desc: string, when: string) => `
<div style="${CARD}">
<p style="font-weight:800;color:#292524;margin:0">${emoji} ${title}</p>
<p style="color:#78716c;font-size:14px;line-height:1.7;margin:6px 0 0">${desc}</p>
<p style="background:#fafaf9;border-radius:12px;padding:8px 12px;font-size:12px;color:#57534e;line-height:1.6;margin:10px 0 0">⏱ ${when}</p>
</div>`;

/** การ์ดคำถาม–คำตอบ */
const faq = (q: string, a: string) => `
<div style="${CARD};border-radius:20px;padding:16px 20px">
<p style="font-weight:800;color:#292524;margin:0">❓ ${q}</p>
<p style="color:#78716c;font-size:14px;line-height:1.7;margin:6px 0 0">${a}</p>
</div>`;

export const PAGE_STARTERS: Record<string, string> = {
  "page-how-to-order": `
<p style="text-align:center;font-size:44px;margin:0">📖</p>
<p style="text-align:center;color:#78716c;font-size:14px;margin:4px 0 0">สั่งของพิมพ์ลายกับ iDucky ง่ายมาก แค่ 7 ขั้นตอน 💛</p>

<div style="background:#eef7fa;border:1px solid #b3dfe8;border-radius:24px;padding:20px;margin-top:20px">
<p style="font-weight:800;color:#284e5d;margin:0;font-size:14px">💳 เรื่องการชำระเงิน — อ่านก่อนสั่ง</p>
<p style="color:#44403c;font-size:14px;line-height:1.8;margin:8px 0 0">• <b>โอนผ่านธนาคารเท่านั้น</b> — โอนเข้าบัญชีของร้าน แล้วแนบสลิปในหน้าออเดอร์<br>• <b style="color:#e11d48">ไม่รับบัตรเครดิต และไม่มีเก็บเงินปลายทาง (COD)</b><br>• ทางร้าน<b>เริ่มจัดทำงานหลังได้รับเงินแล้วเท่านั้น</b> — ยังไม่โอน งานจะยังไม่เข้าคิว</p>
</div>

${step(1, "🛍️", "เลือกสินค้า + ตัวเลือก", "เลือกสินค้าที่ต้องการ แล้วเลือกขนาด/วัสดุ/จำนวน — ราคาจะขยับให้เห็นทันที สั่งเยอะราคาต่อชิ้นถูกลงอัตโนมัติ")}
${step(2, "🎨", "แนบลายของคุณ", "อัปโหลดไฟล์ลายบนเว็บได้เลย (JPG / PNG) หรือจะใส่ลิงก์ไฟล์/อีเมลก็ได้ · สินค้าส่วนใหญ่ต้องแนบลายก่อนถึงจะกดใส่ตะกร้าได้ · แนะนำไฟล์ความละเอียดสูง")}
${step(3, "🛒", "ตรวจตะกร้า เลือกวิธีจัดส่ง", "เช็ครายการอีกครั้ง เลือกวิธีจัดส่ง และระบุวันที่ต้องใช้งานได้ถ้ามีกำหนด (ไม่บังคับ) — ระบบจะเลือกกล่องที่พอดีกับออเดอร์ให้เอง")}
${step(4, "📝", "กรอกที่อยู่ ยืนยันคำสั่งซื้อ", "กรอกชื่อผู้รับ เบอร์โทร ที่อยู่ และใส่โค้ดส่วนลดถ้ามี — ไม่ต้องสมัครสมาชิกก็สั่งได้ · ยืนยันแล้วจะได้ลิงก์ออเดอร์ของคุณเอง เก็บลิงก์นี้ไว้ใช้ทุกขั้นตอนถัดไป")}
${step(5, "💸", "โอนเงิน แล้วแนบสลิป", "โอนเข้าบัญชีธนาคารของร้าน แล้วแนบสลิปในหน้าออเดอร์ของคุณ — ระบบตรวจสลิปอัตโนมัติ ผ่านแล้วเริ่มงานให้ทันที · ทางร้านเริ่มจัดทำงานหลังได้รับเงินแล้วเท่านั้น")}
${step(6, "👀", "ตรวจแบบก่อนพิมพ์จริง", "ทีมกราฟฟิกทำแบบแล้วส่งให้ตรวจ คุณกด “อนุมัติ” หรือ “ขอแก้ไข” ได้เองในหน้าออเดอร์ ขอแก้ได้จนกว่าจะพอใจ")}
${step(7, "📦", "ผลิต แล้วจัดส่ง", "อนุมัติแบบแล้วเข้าสายผลิตทันที เสร็จแล้วแพ็คส่ง พร้อมเลขพัสดุที่กดติดตามได้เองในหน้าออเดอร์")}

<h2 style="${H2C}">✨ สั่งแล้วทำอะไรเองได้บ้าง</h2>
<p style="text-align:center;color:#78716c;font-size:14px;margin:4px 0 0">ทุกอย่างทำได้จาก<b style="color:#44403c">ลิงก์ออเดอร์ของคุณ</b> ไม่ต้องรอแอดมิน</p>
${after("🏠", "แก้ที่อยู่จัดส่งเอง", "เปิดลิงก์ออเดอร์ → กดแก้ที่ช่องที่อยู่ แก้ได้ทั้งชื่อผู้รับ เบอร์โทร และที่อยู่", "แก้ได้เรื่อย ๆ จนกว่าทางร้านจะปริ้นใบงาน (ปกติคือตอนใกล้จะแพ็ค) · หลังจากนั้นระบบจะล็อกไว้ ต้องทักแอดมินให้แก้ให้")}
${after("➕", "สั่งเพิ่มในออเดอร์เดิม", "เลื่อนลงล่างสุดของหน้าออเดอร์ → กด “สั่งเพิ่มในออเดอร์นี้” → เลือกสินค้าใส่ตะกร้าตามปกติ แล้วเลือกว่ารายการไหนจะรวมเข้าออเดอร์เดิม", "ทำได้ตราบใดที่งานยังไม่เข้าสายผลิต · รวมส่งกล่องเดียวกัน ไม่คิดค่าส่งเพิ่ม โอนแค่ส่วนต่างที่เพิ่มขึ้น")}
${after("🧾", "เปิดใบเสร็จเอง", "กดปุ่มใบเสร็จในหน้าออเดอร์ ดูและสั่งพิมพ์ได้เอง", "เปิดได้เมื่อชำระครบแล้ว")}
${after("🚚", "ติดตามพัสดุ", "พอทางร้านยิงเลขพัสดุ หน้าออเดอร์จะขึ้นสถานะให้ดูเอง ไม่ต้องทักถาม", "ดูได้ทันทีหลังสถานะเปลี่ยนเป็น “จัดส่งแล้ว”")}

<h2 style="${H2C}">❓ คำถามที่พบบ่อย</h2>
${faq("จ่ายเงินยังไงได้บ้าง?", "โอนผ่านธนาคารเข้าบัญชีของร้านเท่านั้น แล้วแนบสลิปในหน้าออเดอร์ · ทางร้านไม่รับบัตรเครดิต และไม่มีเก็บเงินปลายทาง (COD)")}
${faq("ต้องสมัครสมาชิกไหม?", "ไม่ต้องก็สั่งได้ · แต่ถ้าสมัครหรือล็อกอินด้วย LINE จะเก็บประวัติออเดอร์ให้ กดสั่งซ้ำได้ง่าย และได้ส่วนลดตามระดับสมาชิก")}
${faq("แก้ที่อยู่จัดส่งได้ถึงเมื่อไหร่?", "แก้เองได้ในหน้าออเดอร์ จนกว่าทางร้านจะปริ้นใบงาน — หลังจากนั้นที่อยู่จะถูกล็อกเพราะใบปะหน้าพัสดุออกไปแล้ว ถ้าจำเป็นต้องแก้จริง ๆ ทักแอดมินทางไลน์ได้เลย")}
${faq("สั่งเพิ่มทีหลังได้ไหม ต้องจ่ายค่าส่งอีกรอบหรือเปล่า?", "ได้ กด “สั่งเพิ่มในออเดอร์นี้” ที่ท้ายหน้าออเดอร์เดิม · รวมส่งกล่องเดียวกันจึงไม่คิดค่าส่งซ้ำ โอนเพิ่มแค่ส่วนต่าง · ทำได้ถ้างานยังไม่เข้าสายผลิต ถ้าเลยไปแล้วจะเป็นออเดอร์ใหม่")}
${faq("ขอมัดจำก่อนได้ไหม?", "ได้ ทักแอดมินแจ้งไว้ก่อน — จะเปิดโหมดมัดจำ 50% ให้ โอนครึ่งแรกแล้วเริ่มงานได้เลย ส่วนที่เหลือชำระก่อนจัดส่ง")}
${faq("ไฟล์ลายต้องความละเอียดเท่าไหร่?", "แนะนำอย่างน้อย 300 DPI ที่ขนาดพิมพ์จริง ถ้าไม่แน่ใจส่งไฟล์มาให้แอดมินเช็กให้ฟรี")}
${faq("สั่งขั้นต่ำกี่ชิ้น?", "เริ่มต้นแค่ 1 ชิ้นเท่านั้น! สั่งเยอะราคาต่อชิ้นถูกลงอัตโนมัติ")}
${faq("ใช้เวลาผลิตกี่วัน?", "ผลิต 1-3 วันทำการหลังอนุมัติแบบ + จัดส่ง 1-5 วันตามวิธีที่เลือก · ถ้ามีกำหนดใช้งานแน่นอน ระบุวันที่ต้องใช้ตอนสั่ง หรือทักแอดมินเช็กคิวก่อนได้")}
${faq("เปลี่ยน/คืนสินค้าได้ไหม?", "สินค้าพิมพ์ตามสั่งเปลี่ยนคืนได้เฉพาะกรณีพิมพ์ผิดหรือชำรุดจากการผลิต แจ้งภายใน 7 วันพร้อมรูปถ่าย เราจัดการให้ทันที")}
`.trim(),

  "page-about": `
<div style="background:linear-gradient(135deg,#eef7fa,#ffffff,#fff3c4);border:1px solid #d6edf2;border-radius:32px;padding:40px 24px;text-align:center">
<img src="/about/logo.png" alt="iDucky prints.studio" style="display:block;margin:0 auto;max-width:280px;width:100%">
<p style="color:#57534e;font-size:15px;margin:16px 0 0">ร้านพิมพ์ลายตามสั่ง 🐥 ของขวัญ ของแจก งานอีเวนต์ — <b style="color:#2b5c6e">ลายของคุณ ให้เราดูแล</b></p>
</div>

<div style="${CARD};margin-top:20px">
<p style="font-weight:800;color:#1a3843;font-size:18px;margin:0">📍 ที่อยู่ร้าน</p>
<p style="color:#78716c;font-size:14px;margin:8px 0 0">บริษัท ทีพีดิจิตอล</p>
<p style="color:#44403c;font-size:15px;line-height:1.7;margin:2px 0 0">663/8 ซอยฉลองกรุง1<br>แขวง/เขตลาดกระบัง กทม 10520</p>
<p style="color:#78716c;font-size:14px;margin:8px 0 0">🕘 เวลาทำการ : จันทร์-ศุกร์ 09.00 - 18.00 น.</p>
</div>

<div style="${CARD}">
<p style="font-weight:800;color:#1a3843;font-size:18px;margin:0">📞 ติดต่อสอบถามข้อมูล</p>
<p style="color:#78716c;font-size:14px;margin:10px 0 0">โทร <b style="color:#292524;font-size:16px">096-569-9414</b> (admin)</p>
<p style="color:#78716c;font-size:14px;margin:6px 0 0">Email : <a href="mailto:iduckyshop03@gmail.com" style="color:#0284c7;font-weight:700">iduckyshop03@gmail.com</a></p>
</div>

<div style="${CARD};text-align:center">
<p style="font-weight:800;color:#1a3843;font-size:18px;margin:0">💬 ทัก LINE ร้าน</p>
<p style="color:#78716c;font-size:12px;margin:4px 0 0">ช่องทางหลัก — สอบถาม/ส่งลาย/เช็คคิวงาน แอดมินตอบไวสุดทางนี้</p>
<img src="/about/line-qr.png" alt="QR LINE" style="display:block;margin:16px auto 0;width:190px;height:190px;border-radius:12px">
<p style="margin:16px 0 0"><a href="https://lin.ee/x8GkqGZ" style="display:inline-block;background:#06c755;color:#ffffff;font-weight:700;padding:12px 28px;border-radius:12px;text-decoration:none">LINE · เพิ่มเพื่อน</a></p>
<p style="color:#a8a29e;font-size:11px;margin:8px 0 0">สแกน QR หรือกดปุ่มจากมือถือได้เลย</p>
</div>

<div style="${CARD};text-align:center">
<p style="font-weight:800;color:#1a3843;font-size:18px;margin:0">🌐 โซเชียลของเรา</p>
<p style="margin:12px 0 0;line-height:2.2">
<a href="https://www.facebook.com/iduckyshop" style="background:#f5f5f4;border-radius:999px;padding:8px 16px;margin:0 4px;color:#57534e;font-weight:700;font-size:13px;text-decoration:none">👍 Facebook</a>
<a href="https://www.instagram.com/iduckyshop1" style="background:#f5f5f4;border-radius:999px;padding:8px 16px;margin:0 4px;color:#57534e;font-weight:700;font-size:13px;text-decoration:none">📸 Instagram</a>
<a href="https://www.tiktok.com/@iduckyofficial" style="background:#f5f5f4;border-radius:999px;padding:8px 16px;margin:0 4px;color:#57534e;font-weight:700;font-size:13px;text-decoration:none">🎵 TikTok</a>
<a href="https://x.com/iduckyshop" style="background:#f5f5f4;border-radius:999px;padding:8px 16px;margin:0 4px;color:#57534e;font-weight:700;font-size:13px;text-decoration:none">🐦 X</a>
</p>
</div>
`.trim(),
};
