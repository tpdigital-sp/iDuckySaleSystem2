export type CategoryId =
  | "acrylic"
  | "acrylic-bending"
  | "standee"
  | "light"
  | "phone-gadget"
  | "mirror-magnet"
  | "sticker-paper"
  | "card-photo"
  | "banner"
  | "calendar-frame"
  | "home"
  | "bag"
  | "apparel"
  | "fabric"
  | "gifts";

export interface Category {
  id: CategoryId;
  name: string;
  nameEn: string;
  emoji: string;
  gradient: string;
  description: string;
}

export interface ProductOptionChoice {
  name: string;
  extra?: number;
  /**
   * ให้ลูกค้าระบุ "จำนวน" ของตัวเลือกนี้ (ใช้ได้เฉพาะกลุ่ม multi)
   * เช่น เพิ่มสาย 2 เส้น → +฿ ของตัวนี้คูณ 2 · ค่าที่เก็บเขียนเป็น "เพิ่มสาย ×2"
   * ไม่เปิด = ติ๊กแล้วนับเป็น 1 เสมอ · ตั้งแยกทีละตัวได้ (บางตัวระบุจำนวนได้ บางตัวติ๊กเฉย ๆ)
   */
  qty?: boolean;
  /** จำนวนสูงสุดของตัวเลือกนี้ (ไม่ตั้ง = 99) */
  qtyMax?: number;
  /**
   * หน่วยของ "จำนวน" ที่ลูกค้าระบุ เช่น "ซม." — ตัวเลือกที่คิดเป็นขนาด (เซนละ +฿8) จะได้เห็นชัดว่ากรอกกี่เซนติเมตร
   * มีผลกับหน้าสินค้าอย่างเดียว (ป้ายข้างช่องจำนวน/ยอดรวมของตัวเลือก) — ราคายังคิด +฿ × จำนวน เหมือนเดิม
   * ไม่ตั้ง = นับเป็น "จำนวนอัน" เฉย ๆ เหมือนก่อน
   */
  qtyUnit?: string;
  /**
   * เลือกตัวนี้แล้ว 1 หน่วยที่สั่งได้ของกี่ชิ้น
   * เช่น สติกเกอร์ขนาด 3cm ได้ 45 ชิ้นต่อแผ่น A3 · ขนาด 20cm ได้ 1 ชิ้น
   * ใช้เป็นเพดานจำนวนลายที่คละได้ — คละ 1 ลายต้องใช้อย่างน้อย 1 ชิ้น
   * จึงคละได้ไม่เกิน (ชิ้นต่อหน่วย × จำนวนหน่วยที่สั่ง)
   */
  perUnit?: number;
  /**
   * 🖼 ภาพประกอบของตัวเลือกนี้ (URL) — สินค้าที่มีหลายแบบให้ลูกค้าเห็นหน้าตาแต่ละแบบ
   * แสดงเป็นภาพย่อบนปุ่มตัวเลือก และกดเลือกแล้วแกลเลอรีสลับไปภาพนี้ (ถ้าอยู่ในแกลเลอรี)
   */
  imageSrc?: string;
  /**
   * ผูกกับ SKU ในคลังวัสดุ — ลูกค้าเลือกค่านี้แล้วออเดอร์ชำระเงิน ระบบตัดสต๊อกตัวนี้ให้อัตโนมัติ
   * ใส่ที่ "ตัวเลือก" ไม่ใช่ที่สินค้า เพราะสินค้าหนึ่งตัวใช้วัสดุต่างกันตามที่ลูกค้าเลือก
   * (ตั้งค่าที่ preset ครั้งเดียว = ทุกสินค้าที่ลิงก์คลังนั้นได้ตามไปด้วย)
   */
  stockItemId?: string;
  /** ใช้กี่หน่วยต่อสินค้า 1 ชิ้น (ไม่ตั้ง = 1) */
  stockQtyPer?: number;
  /**
   * 💬 เลือกตัวนี้แล้ว = งานสั่งทำ ราคาต้องให้แอดมินตีให้ (ไม่ใช้ตารางราคาปกติ)
   * เช่น "แบบที่ 3 (กำหนดขนาดเอง)" ในกลุ่มแบบ — ลูกค้ากรอกขนาดเองแล้วรอแอดมินตีราคา
   * ลูกค้ายัง "กดสั่งไว้ก่อน" ได้ตามปกติ ราคาขึ้นเป็น 0 จนกว่าแอดมินจะใส่ให้
   */
  askPrice?: boolean;
  /**
   * ⭐ แบบที่ลูกค้านิยมสั่ง — หน้าสินค้าโชว์ป้าย "นิยม" ท้ายชื่อ
   * เป็นป้ายบอกทางเฉย ๆ ไม่มีผลกับราคา ตารางราคา หรือการคิดเงินใด ๆ
   */
  popular?: boolean;
  /**
   * 🏷️ ป้ายสั้น ๆ ท้ายชื่อตัวเลือก เช่น "ฟรี!" · "แนะนำ" — บอกทางเฉย ๆ ไม่มีผลกับราคา
   * (ต่างจาก popular ตรงที่พิมพ์ข้อความเองได้ · ใส่ทั้งคู่ก็ได้ ป้ายจะขึ้นเรียงกัน)
   */
  badge?: string;
  /**
   * 📄 เลือกตัวนี้แล้ว วัสดุ 1 แผ่นทำได้กี่ชิ้น — เช่น สมุด A5 ได้ 4 เล่มต่อฟิล์ม A3 แผ่นหนึ่ง
   * ใช้คู่กับกลุ่มที่ตั้ง ProductOption.sheetFee (ค่าธรรมเนียมที่คิดต่อแผ่น ไม่ใช่ต่อชิ้น)
   * ไม่ตั้ง = 1 ชิ้นต่อแผ่น
   */
  perSheet?: number;
  /**
   * 💰 +฿ ของ "ช่วงสั่งน้อย" — ใช้เมื่อจำนวนยังไม่ถึง extraFromQty ของกลุ่ม
   * มีไว้สำหรับกลุ่มที่ช่วงปลีกกับช่วงส่งคิดคนละเรท เช่น สแตนดี้: ช่วงปลีกฐาน 7 ซม.ขึ้นไป
   * คิด ซม.ละ 5 บาท ส่วนช่วงส่ง (11 ชิ้นขึ้นไป) คิดตามตาราง extra ปกติ
   * ไม่ตั้ง = ช่วงที่ต่ำกว่าเกณฑ์ไม่คิดเพิ่ม (พฤติกรรมเดิม) · ไม่มีผลกับกลุ่ม extraPerDesign
   */
  extraBelow?: number;
}

export interface ProductOption {
  label: string;
  choices: ProductOptionChoice[];
  /**
   * กลุ่มนี้เป็น "วัสดุ" ที่กินสต๊อก — ไม่ใช่กระบวนการอย่าง "สกรีนกี่ด้าน" ที่ไม่มีของหายจากชั้น
   * ใช้กรองในหน้าแอดมินว่ากลุ่มไหนควรผูก SKU · ไม่ตั้ง = ยังไม่ได้จัดประเภท
   */
  stockBearing?: boolean;
  /**
   * ถ้ามี = กลุ่มนี้ "ลิงก์" กับคลังตัวเลือกกลาง (option preset) ตาม id นี้
   * ตอนอ่านข้อมูลจริง label+choices จะถูกแทนที่ด้วยของในคลัง (ดู resolveOptions)
   * choices ที่เก็บไว้เป็นสำเนาสำรอง (snapshot) เผื่อคลังถูกลบ · ไม่มี = กลุ่มอิสระ (พิมพ์เอง)
   */
  presetId?: string;
  /**
   * รูปแบบแสดงบนหน้าร้าน:
   * - ไม่ระบุ/'pills' = ปุ่มแยก (ค่าเริ่มต้น) — เลือกได้ 1 อย่าง
   * - 'dropdown' = เมนูเลือก (เหมาะกับตัวเลือกเยอะ) — เลือกได้ 1 อย่าง
   * - 'multi' = ติ๊กเลือกได้หลายอย่าง (เช่น อุปกรณ์เสริม/ลูกเล่นที่สั่งพร้อมกันได้) — เลือก 0 ถึงหลายอย่าง
   *   ค่าที่เลือกเก็บรวมเป็นข้อความเดียวคั่นด้วย MULTI_SEP · +฿ คิดรวมทุกตัวที่ติ๊ก
   * - 'input' = ช่องให้ลูกค้า "กรอกค่าเอง" (ไม่มีรายการให้เลือก) เช่น ขนาดงานสั่งทำ
   *   ตั้งรายละเอียดช่องที่ ProductOption.input · ค่าที่กรอกเก็บลง selections[label] เหมือนกลุ่มอื่น
   *   ไม่มีราคาในตัว (ไม่คิด +฿ ไม่เป็นแกนตารางราคา) — ใช้คู่กับ askPrice ให้แอดมินตีราคา
   */
  display?: "pills" | "dropdown" | "multi" | "input";
  /**
   * (ของเก่า) เคยเปิด "ระบุจำนวน" ทั้งกลุ่ม — ตอนนี้ตั้งรายตัวที่ ProductOptionChoice.qty แทน
   * ยังอ่านค่าเดิมอยู่เพื่อไม่ให้สินค้าที่ตั้งไว้ก่อนหน้าราคาเพี้ยน · หน้าแก้ไขสินค้าจะย้ายให้เองตอนเปิดครั้งถัดไป
   */
  qtyPerChoice?: boolean;
  /** (ของเก่า) จำนวนสูงสุดระดับกลุ่ม — ใช้เป็นค่าตั้งต้นให้ตัวเลือกที่ไม่ได้ตั้งเอง */
  qtyMax?: number;
  /**
   * "แสดงเมื่อ" — โชว์กลุ่มนี้เฉพาะตอนกลุ่มอื่นเลือกค่าที่กำหนด · ไม่ตรง = ซ่อนทั้งกลุ่ม
   * (ไม่ถามลูกค้า ไม่คิดเงิน ไม่ติดไปกับตะกร้า/ออเดอร์)
   * เช่น กลุ่ม "สีตะขอ C" แสดงเมื่อ ตะขอ = C เท่านั้น — ต่างจากกฎเงื่อนไขที่กรองได้แค่ "ตัวเลือกในกลุ่ม"
   * ไม่ตั้ง = แสดงตลอด
   */
  showWhen?: { label: string; choices: string[] };
  /**
   * เงื่อนไข "และ" ข้อที่สอง — ต้องตรงพร้อมกันกับ showWhen ถึงจะแสดงกลุ่มนี้
   * เช่น "FLEX ลงด้านไหน" แสดงเมื่อ เรทราคา = สกรีน 2 ด้าน และ FLEX = เลือกไว้แล้ว
   * (งานสกรีนด้านเดียวไม่ต้องถาม เพราะมีด้านเดียวอยู่แล้ว)
   */
  showWhenAlso?: { label: string; choices: string[] };
  /**
   * ราคาบวกเพิ่ม (+฿) ของกลุ่มนี้ มีผลเมื่อสั่งตั้งแต่กี่ชิ้นขึ้นไป
   * เช่น อะไหล่เข็มกลัด ตั้ง 11 = ช่วงปลีก 1-10 ชิ้น ราคารวมอะไหล่แล้ว (ไม่บวกเพิ่ม)
   * สั่ง 11 ชิ้นขึ้นไปค่อยคิดเพิ่มต่อชิ้นตามตัวเลือก · ไม่ตั้ง = บวกเพิ่มทุกจำนวน
   */
  extraFromQty?: number;
  /**
   * ค่าธรรมเนียม "ช่วงสั่งน้อย" ของกลุ่มนี้ — คิดเพิ่มต่อชิ้นเมื่อสั่งไม่เกินจำนวนที่กำหนด
   * เช่น พวงกุญแจ 3mm ช่วงปลีก 1-10 ชิ้น เลือกตะขอบวกชิ้นละ 10 บาท (ยกเว้นห่วงแถมฟรี Z1/Z2)
   * คิด "เพิ่มจาก" ราคาของตัวเลือกนั้นตามปกติ · ตัวเลือกใน freeChoices ไม่คิด
   */
  /**
   * "ฟรีเมื่อ" — ตัวเลือกที่ระบุไม่คิด +฿ เมื่อกลุ่มอื่นเลือกค่าที่กำหนด
   * เช่น ห่วง Z1/Z2 ฟรีเมื่อความหนา = 3mm · ความหนาอื่นคิด +฿ ตามปกติ
   */
  freeWhen?: {
    /** ตัวเลือกในกลุ่มนี้ที่ได้ฟรี */
    choices: string[];
    /** เงื่อนไขจากกลุ่มอื่น */
    when: { label: string; choices: string[] };
  };
  smallQtyFee?: {
    /** บวกเพิ่มต่อชิ้น (บาท) — ใส่ค่าติดลบได้ = ลดให้ต่อชิ้นในช่วงนั้นแทน */
    fee: number;
    /** คิดเมื่อสั่งไม่เกินกี่ชิ้น (เช่น 10 = คิดเฉพาะ 1-10 ชิ้น) */
    upToQty: number;
    /** ตัวเลือกที่ยกเว้น ไม่คิดค่าธรรมเนียมนี้ (เช่น ห่วงที่แถมฟรี) */
    freeChoices?: string[];
    /** จำกัดเฉพาะเมื่อกลุ่มอื่นเลือกค่าเหล่านี้ (เช่น ความหนาอะคริลิค = 3mm) — ไม่ตั้ง = ทุกกรณี */
    when?: { label: string; choices: string[] };
  };
  /**
   * รายละเอียดช่องกรอก — มีผลเฉพาะกลุ่มที่ตั้ง display: 'input'
   * (กลุ่มชนิดนี้ไม่มี choices ให้เลือก ลูกค้าพิมพ์ค่าเอง)
   */
  input?: OptionInput;
  /**
   * ✍️ ช่องกรอกนี้เป็น "ข้อมูลประกอบของงานปกติ" ไม่ใช่งานสั่งทำ — โชว์เรียงกับกลุ่มตัวเลือกปกติ
   * (ไม่เข้ากล่อง 📐 ไม่ต้องติ๊ก "สั่งทำ" ก่อน และตรวจว่ากรอกครบก่อนสั่งเสมอ)
   * เช่น ขนาดไดคัทของงานกระดาษ — ราคายังคิดตามตารางเดิม แค่ต้องรู้ขนาดไว้ผลิต
   * ใช้คู่กับ showWhen ได้ (ถามเฉพาะเรท/ตัวเลือกที่ต้องใช้) · มีผลเฉพาะกลุ่ม display 'input'
   */
  standardInput?: boolean;
  /**
   * 📐 โชว์ "จำนวนชิ้นโดยประมาณต่อแผ่นวัสดุ" ใต้ช่องกรอกของกลุ่มนี้ (กลุ่มนี้ = ด้านสูง)
   * อ่านด้านกว้างจากช่องกรอกกลุ่ม pairLabel — กรอกครบสองช่องแล้วคำนวณจากการเรียงแนวตรง
   * เลือกแนวตั้ง/แนวนอนที่ได้เยอะกว่า · เป็นตัวเลขบอกทางเฉย ๆ ไม่มีผลกับราคา/ตะกร้า
   */
  sheetYield?: SheetYield;
  /**
   * กลุ่มนี้เป็นส่วนของ "งานสั่งทำ" — มีผลแค่ในหน้าแก้ไขหลังบ้าน (ไปแก้ที่แผง 📐 แทนแผง 🎛️)
   * หน้าร้านแสดง/คิดราคาเหมือนกลุ่มอื่นทุกอย่าง · กลุ่มช่องกรอก (display 'input') ถือเป็นงานสั่งทำเสมอ
   * โดยไม่ต้องตั้งธงนี้
   */
  madeToOrder?: boolean;
  /**
   * 💬 ใช้กลุ่มนี้แล้ว = งานสั่งทำ ราคาต้องให้แอดมินตีให้
   * (กลุ่มช่องกรอกมักตั้งคู่กันเสมอ เพราะขนาดที่ลูกค้ากรอกเองไม่มีในตารางราคา)
   * ตั้งรายตัวเลือกก็ได้ที่ ProductOptionChoice.askPrice — เข้าข้อไหนข้อหนึ่งก็ถือว่าต้องตีราคา
   */
  askPrice?: boolean;
  /**
   * 🎁 "กี่ตัวแรกรวมในราคา" ของกลุ่มติ๊กหลายอย่าง — ตัวที่เกินจากนี้ถึงคิด +฿
   * เช่น สีไหม 3 สีแรกรวมในราคาแล้ว สีที่ 4 เป็นต้นไปคิดสีละ 10
   * นับตามลำดับที่แสดงในกลุ่ม (ตัวที่ระบุจำนวนได้ นับตามจำนวนที่ระบุ) · ไม่ตั้ง/0 = คิดทุกตัวตามปกติ
   */
  freeFirstN?: number;
  /**
   * 🎨 แสดงกลุ่มติ๊กหลายอย่างเป็น "ตารางสวอตช์สี" — วงกลมสี + ชื่อสั้นใต้ภาพ เรียงตาราง
   * ใช้กับกลุ่มที่ตัวเลือกเยอะมากและ "สี" คือสาระหลัก (เช่น สีไหมปัก 80 เบอร์)
   * รูปประจำตัวเลือกใช้เป็นสวอตช์บนปุ่มเท่านั้น — ไม่เข้าแกลเลอรี ไม่สลับภาพใหญ่ (ชิปเล็ก ขยายแล้วเบลอ)
   */
  swatchGrid?: boolean;
  /**
   * 🔍 รูป "ตารางสีเต็ม" ของกลุ่มสวอตช์ — ลูกค้ากดดูสีขยาย/เทียบทุกเบอร์ในรูปเดียว
   * (สวอตช์บนปุ่มเป็นชิปเล็ก ขยายแล้วเบลอ — รูปนี้คือไฟล์ความละเอียดเต็มไว้เปิด lightbox)
   */
  chartSrc?: string;
  /**
   * 📝 ข้อความกำกับใต้ชื่อกลุ่มบนหน้าสินค้า — สเปกที่ลูกค้าควรรู้ตอนกำลังเลือก
   * เช่น "ตัวภาพพิมพ์บนกระดาษอาร์ตการ์ด 260 แกรม" (ของที่ไม่มีให้เลือก แต่ต้องบอก)
   * เป็นข้อความอย่างเดียว ไม่มีผลกับราคา/ตะกร้า/ออเดอร์
   */
  note?: string;
  /**
   * 💰 +฿ ของกลุ่มนี้คิด "ต่อลาย" ไม่ใช่ต่อชิ้น — เช่น สีไหมเกิน 3 สี คิดสีละ 10 บาทต่อแบบ
   * (ค่าขึ้นบล็อค/ค่าสีเป็นงานครั้งเดียวต่อลาย ไม่ขึ้นกับจำนวนชิ้นที่ปัก)
   * เงินส่วนนี้ไปโผล่ใน designFeeFor (ค่าเพิ่มทั้งรายการ) แทนราคา/ชิ้น
   */
  extraPerDesign?: boolean;
  /**
   * 📄 +฿ ของกลุ่มนี้คิด "ต่อแผ่นวัสดุ" ไม่ใช่ต่อชิ้น — เช่น ค่าฟิล์มเคลือบพิเศษคิดต่อแผ่น A3
   * จำนวนแผ่น = ⌈จำนวนที่สั่ง ÷ ชิ้นต่อแผ่น⌉ · ชิ้นต่อแผ่นมาจาก perSheet ของตัวเลือกที่เลือกในกลุ่ม from
   * เช่น สมุด A5 (4 เล่ม/แผ่น) สั่ง 5 เล่ม = 2 แผ่น = ค่าฟิล์ม ×2
   * เงินส่วนนี้ไปโผล่ใน designFeeFor (ค่าเพิ่มทั้งรายการ) เหมือน extraPerDesign ไม่เข้าราคา/ชิ้น
   */
  sheetFee?: {
    /** กลุ่มที่บอกว่า 1 แผ่นได้กี่ชิ้น (อ่าน perSheet ของตัวเลือกที่เลือกในกลุ่มนั้น) */
    from: string;
    /** ชื่อ "แผ่น" ที่โชว์ให้ลูกค้า เช่น "แผ่น A3" (ไม่ตั้ง = "แผ่น") */
    unit?: string;
  };
}

/**
 * ช่องให้ลูกค้ากรอกค่าเอง (กลุ่มตัวเลือกชนิด 'input')
 * ใช้กับงานสั่งทำที่ขนาด/รายละเอียดมาจากลูกค้า เช่น สแตนดี้ที่ระบุความสูงตัวหน้า/ตัวหลัง/ฐานเอง
 * ค่าที่กรอกเก็บลง selections เป็นข้อความพร้อมหน่วย ("2.5 ซม.") — ตะกร้า/ใบงาน/ใบเสร็จอ่านได้ทันที
 */
export interface OptionInput {
  /** ชนิดค่าที่ให้กรอก — number = ตัวเลข (ตรวจช่วงได้) · text = ข้อความสั้น · textarea = ข้อความหลายบรรทัด */
  kind: "number" | "text" | "textarea";
  /** หน่วยต่อท้ายค่า เช่น "ซม." (มาจากคลังหน่วย) — เฉพาะ kind number */
  unit?: string;
  /** ค่าต่ำสุด/สูงสุดที่ยอมรับ (number) — กันลูกค้าพิมพ์ขนาดที่ทำไม่ได้ */
  min?: number;
  max?: number;
  /** รับเฉพาะจำนวนเต็ม (number) — เช่น ขนาดอาร์มปักไม่รับทศนิยม */
  integer?: boolean;
  /** ความยาวสูงสุด (text/textarea) — ไม่ตั้ง = 200 */
  maxLength?: number;
  /** ข้อความจาง ๆ ในช่อง เช่น "2.5" */
  placeholder?: string;
  /** คำอธิบายใต้ช่อง เช่น "วัดจากขอบล่างถึงปลายบนสุด" */
  hint?: string;
  /** ไม่กรอก = กดสั่งไม่ได้ (ไม่ตั้ง = ต้องกรอก) */
  required?: boolean;
}

/** กลุ่มนี้เป็น "ช่องกรอก" ไหม (ลูกค้าพิมพ์ค่าเอง ไม่ได้เลือกจากรายการ) */
export function isInputOption(opt: ProductOption): boolean {
  return opt.display === "input";
}

/** ความยาวข้อความสูงสุดของช่องกรอกแบบตัวอักษร */
export const INPUT_MAX_LEN = 200;

/**
 * เขียนค่าที่ลูกค้ากรอกให้เป็นข้อความที่เก็บลง selections — ต่อหน่วยให้ถ้ามี
 * ("2.5" + "ซม." → "2.5 ซม.") · ค่าว่าง = ยังไม่ได้กรอก คืนค่าว่าง
 */
export function formatInputValue(opt: ProductOption, raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  const unit = opt.input?.unit?.trim();
  return unit ? `${v} ${unit}` : v;
}

/** อ่านค่าที่ลูกค้ากรอกกลับจาก selections (ตัดหน่วยที่ต่อท้ายออก) */
export function parseInputValue(opt: ProductOption, stored: string | undefined): string {
  const v = (stored ?? "").trim();
  if (!v) return "";
  const unit = opt.input?.unit?.trim();
  return unit && v.endsWith(unit) ? v.slice(0, -unit.length).trim() : v;
}

/**
 * ตรวจค่าที่กรอกในกลุ่มนี้ — คืนข้อความบอกปัญหา หรือ null ถ้าผ่าน
 * ใช้ทั้งตอนกดสั่ง (บล็อก) และตอนแสดงคำเตือนใต้ช่อง จะได้เกณฑ์เดียวกันเสมอ
 */
export function inputError(opt: ProductOption, stored: string | undefined): string | null {
  const cfg = opt.input;
  if (!cfg) return null;
  const raw = parseInputValue(opt, stored);
  const required = cfg.required !== false;
  // ชื่อกลุ่มมักมีวงเล็บ ("(ตัวหน้า) ขนาด") — ครอบอัญประกาศไว้ ประโยคจะได้ไม่อ่านติดกันจนงง
  const name = `“${opt.label}”`;
  if (!raw) return required ? `กรอก${name}ด้วยนะครับ` : null;
  if (cfg.kind === "number") {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return `${name} ต้องเป็นตัวเลข`;
    if (cfg.integer && !Number.isInteger(n)) return `${name} ต้องเป็นจำนวนเต็ม (ไม่รับทศนิยม)`;
    const u = cfg.unit ? ` ${cfg.unit}` : "";
    if (cfg.min != null && n < cfg.min) return `${name} ต้องไม่ต่ำกว่า ${cfg.min}${u}`;
    if (cfg.max != null && n > cfg.max) return `${name} ต้องไม่เกิน ${cfg.max}${u}`;
    return null;
  }
  const max = cfg.maxLength ?? INPUT_MAX_LEN;
  if (raw.length > max) return `${name} ยาวเกิน ${max} ตัวอักษร`;
  return null;
}

/**
 * 📐 สเปกคำนวณ "จำนวนชิ้นโดยประมาณต่อแผ่นวัสดุ" ของคู่ช่องกรอกกว้าง×สูง (ดู ProductOption.sheetYield)
 * ขนาดเป็นหน่วยเดียวกับที่ลูกค้ากรอก (ซม.) — ตัวเลขและวิธีวางอิงโปรแกรมจัดวางจริงของร้าน
 * (Print-Fit บน Desktop): ชีท Dicut 100% 48.3×33 ซม. พื้นที่พิมพ์ 44.76×29.89 หักขอบเผื่อ 0.5
 * รอบด้าน → พื้นที่วางจริง 43.76×28.89 · ระยะห่างระหว่างชิ้น 0.5
 */
export interface SheetYield {
  /** ชื่อกลุ่มช่องกรอก "ด้านกว้าง" ที่ใช้คู่กัน (กลุ่มที่ตั้ง sheetYield เองคือด้านสูง) */
  pairLabel: string;
  /** พื้นที่วางชิ้นงานจริง ด้านกว้าง × ด้านยาว (หักขอบพื้นที่พิมพ์/ขอบเผื่อออกแล้ว) */
  sheetW: number;
  sheetH: number;
  /**
   * ระยะห่างระหว่างชิ้นงาน (หน่วยเดียวกับที่ลูกค้ากรอก) — งานไดคัทวางชิ้นติดกันไม่ได้
   * เช่น 0.5 = เว้น 5 มม. · คิดเฉพาะช่องไฟ "ระหว่าง" ชิ้น ไม่กินขอบแผ่น · ไม่ตั้ง = วางชิด
   */
  gap?: number;
  /** ชื่อแผ่นที่โชว์ให้ลูกค้า เช่น "แผ่น A3" (ไม่ตั้ง = "แผ่น") */
  sheetName?: string;
}

/**
 * วางชิ้นขนาดเดียวกันให้ได้มากที่สุดในกล่อง — พอร์ตจากโปรแกรมจัดวาง Print-Fit ของร้าน
 * (MaxRects: ชิ้นถูกบวกระยะห่างรอบตัว กล่องขยายด้วยระยะห่างหนึ่งข้าง จึงคิดช่องไฟเฉพาะระหว่างชิ้น
 *  หมุนได้รายชิ้น · ให้คะแนนช่องว่างแบบ Best Short Side Fit / Best Area Fit แล้วเอาค่าที่ดีกว่า)
 */
function packSingleSize(itemW: number, itemH: number, binW: number, binH: number, gap: number): number {
  const w = itemW + gap;
  const h = itemH + gap;
  let best = 0;
  for (const heuristic of ["BSSF", "BAF"] as const) {
    const free: { x: number; y: number; w: number; h: number }[] = [
      { x: 0, y: 0, w: binW + gap, h: binH + gap },
    ];
    let count = 0;
    // เพดานกันลูป (ชิ้นเล็กสุด 1 ซม. วางได้ราวห้าร้อยกว่าชิ้น) — ถึงเพดานคือ "เยอะมาก" พอสำหรับตัวเลขบอกทาง
    while (count < 2000) {
      let fit = { score: Infinity, at: -1, rot: false };
      for (let i = 0; i < free.length; i++) {
        const r = free[i];
        if (w <= r.w && h <= r.h) {
          const score = heuristic === "BSSF" ? Math.min(r.w - w, r.h - h) : r.w * r.h - w * h;
          if (score < fit.score) fit = { score, at: i, rot: false };
        }
        if (h <= r.w && w <= r.h) {
          const score = heuristic === "BSSF" ? Math.min(r.w - h, r.h - w) : r.w * r.h - h * w;
          if (score < fit.score) fit = { score, at: i, rot: true };
        }
      }
      if (fit.at < 0) break;
      const target = free.splice(fit.at, 1)[0];
      const pw = fit.rot ? h : w;
      const ph = fit.rot ? w : h;
      count++;
      const contains = (a: (typeof free)[0], b: (typeof free)[0]) =>
        a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
      const placed = { x: target.x, y: target.y, w: pw, h: ph };
      for (let i = free.length - 1; i >= 0; i--) if (contains(free[i], placed)) free.splice(i, 1);
      if (ph < target.h) free.push({ x: target.x, y: target.y + ph, w: target.w, h: target.h - ph });
      if (pw < target.w) free.push({ x: target.x + pw, y: target.y, w: target.w - pw, h: ph });
      for (let i = free.length - 1; i >= 0; i--)
        for (let j = free.length - 1; j >= 0; j--)
          if (i !== j && contains(free[i], free[j])) {
            free.splice(i, 1);
            break;
          }
    }
    if (count > best) best = count;
  }
  return best;
}

/**
 * จำนวนชิ้นโดยประมาณต่อ 1 แผ่น จากค่าที่ลูกค้ากรอก (กว้างจากกลุ่ม pairLabel × สูงจากกลุ่มนี้)
 * จัดวางแบบเดียวกับโปรแกรม Print-Fit — null = ไม่ได้ตั้ง sheetYield หรือยังกรอกไม่ครบ · 0 = ใหญ่เกินแผ่น
 */
export function sheetYieldCount(
  product: Product,
  opt: ProductOption,
  selections: Record<string, string>
): number | null {
  const cfg = opt.sheetYield;
  if (!cfg) return null;
  const pair = product.options.find((o) => o.label === cfg.pairLabel);
  if (!pair) return null;
  const w = Number(parseInputValue(pair, selections[pair.label]));
  const h = Number(parseInputValue(opt, selections[opt.label]));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return packSingleSize(w, h, cfg.sheetW, cfg.sheetH, cfg.gap ?? 0);
}

/** ตัวคั่นค่าของกลุ่ม "เลือกได้หลายอย่าง" (display: 'multi') เมื่อเก็บลง selections */
export const MULTI_SEP = " + ";

/** กลุ่มนี้ให้ลูกค้าติ๊กเลือกได้หลายอย่างไหม */
export function isMultiOption(opt: ProductOption): boolean {
  return opt.display === "multi";
}

/**
 * ตัวเลือกนี้ให้ลูกค้าระบุจำนวนได้ไหม (เฉพาะกลุ่ม multi)
 * ตั้งรายตัวที่ choice.qty · กลุ่มที่ตั้งแบบเก่าไว้ทั้งกลุ่ม (qtyPerChoice) ยังใช้ได้เหมือนเดิม
 */
export function hasChoiceQty(opt: ProductOption, choiceName: string): boolean {
  if (!isMultiOption(opt)) return false;
  const c = opt.choices.find((x) => x.name === choiceName);
  return c?.qty ?? opt.qtyPerChoice === true;
}

/** กลุ่มนี้มีตัวเลือกที่ระบุจำนวนได้อย่างน้อยหนึ่งตัวไหม (ใช้ตัดสินใจว่าจะขึ้นป้ายบอกลูกค้าไหม) */
export function anyChoiceQty(opt: ProductOption): boolean {
  return isMultiOption(opt) && opt.choices.some((c) => hasChoiceQty(opt, c.name));
}

/**
 * หน่วยของจำนวนที่ลูกค้าระบุในตัวเลือกนี้ (เช่น "ซม.") — ไม่ตั้ง = ไม่มีหน่วย นับเป็นจำนวนอัน
 * ใช้แค่กับข้อความที่แสดง ไม่แตะการคิดราคา
 */
export function choiceQtyUnit(opt: ProductOption, choiceName: string): string {
  return opt.choices.find((x) => x.name === choiceName)?.qtyUnit?.trim() ?? "";
}

/** เพดานจำนวนต่อตัวเลือก */
export const MAX_CHOICE_QTY = 99;
export function choiceQtyMax(opt: ProductOption, choiceName: string): number {
  const c = opt.choices.find((x) => x.name === choiceName);
  const m = Math.floor(Number(c?.qtyMax ?? opt.qtyMax));
  return Number.isFinite(m) && m > 0 ? Math.min(m, MAX_CHOICE_QTY) : MAX_CHOICE_QTY;
}

/** ตัวเลือกที่ติ๊กไว้ 1 ตัว พร้อมจำนวนที่ลูกค้าระบุ (ไม่ระบุ = 1) */
export interface MultiPick {
  name: string;
  qty: number;
}

/**
 * จำนวนของตัวเลือกเขียนต่อท้ายชื่อว่า " ×N" (เว้นวรรคหน้า × เสมอ) — "เพิ่มสาย ×2"
 * ต้องมีเว้นวรรคหน้า × เพื่อไม่ให้ชื่อที่เป็นขนาด (เช่น "10×15 ซม.") ถูกอ่านเป็นจำนวน
 * และตอนอ่านยังเทียบกับรายชื่อตัวเลือกจริงอีกชั้น (ดู parseMultiEntry)
 */
const MULTI_QTY_RE = /^(.+?)\s+×\s*(\d+)$/;

/** เขียนตัวเลือก+จำนวนเป็นข้อความ (จำนวน 1 = ชื่อเปล่า ๆ เหมือนเดิม) */
export function formatMultiPick(name: string, qty: number): string {
  return qty > 1 ? `${name} ×${qty}` : name;
}

/**
 * อ่านข้อความตัวเลือก 1 ตัวกลับเป็นชื่อ+จำนวน
 * ส่ง choiceNames มาด้วยได้ (รายชื่อตัวเลือกจริงของกลุ่ม) — ชื่อที่ตรงเป๊ะจะไม่ถูกแยกจำนวน
 */
export function parseMultiEntry(entry: string, choiceNames?: string[]): MultiPick {
  const raw = entry.trim();
  if (choiceNames?.includes(raw)) return { name: raw, qty: 1 };
  const m = MULTI_QTY_RE.exec(raw);
  if (!m) return { name: raw, qty: 1 };
  const name = m[1].trim();
  // ชื่อที่แยกออกมาไม่ใช่ตัวเลือกจริง = ข้อความนั้นเป็นชื่อของมันเอง ไม่ใช่จำนวน
  if (choiceNames && !choiceNames.includes(name)) return { name: raw, qty: 1 };
  const qty = Math.floor(Number(m[2]));
  return { name, qty: qty > 1 ? Math.min(qty, MAX_CHOICE_QTY) : 1 };
}

/** แยกค่าที่เก็บรวมไว้กลับเป็นรายชื่อ+จำนวน ("ซิปใน + สายสะพาย ×2" → [{ซิปใน,1},{สายสะพาย,2}]) */
export function splitMultiPicks(value: string | undefined, choiceNames?: string[]): MultiPick[] {
  return (value ?? "")
    .split(MULTI_SEP)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseMultiEntry(s, choiceNames));
}

/** แยกค่าที่เก็บรวมไว้กลับเป็นรายชื่อตัวเลือก (ตัดจำนวนออก) */
export function splitMulti(value: string | undefined, choiceNames?: string[]): string[] {
  return splitMultiPicks(value, choiceNames).map((p) => p.name);
}

/** รวมรายชื่อตัวเลือกที่ติ๊กไว้เป็นข้อความเดียว (ว่าง = ไม่ได้เลือกอะไรเลย) */
export function joinMulti(names: string[]): string {
  return names.join(MULTI_SEP);
}

/** รวมตัวเลือก+จำนวนที่ติ๊กไว้เป็นข้อความเดียว */
export function joinMultiPicks(picks: MultiPick[]): string {
  return joinMulti(picks.map((p) => formatMultiPick(p.name, p.qty)));
}

/** ตัวเลือกที่เลือกอยู่ของกลุ่มนี้ พร้อมจำนวน — กลุ่มปกติได้ 1 ตัว · กลุ่ม multi ได้ 0 ถึงหลายตัว */
export function selectedPicks(opt: ProductOption, selections: Record<string, string>): MultiPick[] {
  const cur = selections[opt.label];
  if (!cur) return [];
  if (!isMultiOption(opt)) return [{ name: cur, qty: 1 }];
  const picks = splitMultiPicks(cur, opt.choices.map((c) => c.name));
  // ตัวที่ไม่ได้เปิดช่องจำนวน นับเป็น 1 เสมอ (กันข้อมูลเก่าที่เคยเปิดไว้ทำราคาเพี้ยน)
  return picks.map((p) =>
    hasChoiceQty(opt, p.name) ? { ...p, qty: Math.min(p.qty, choiceQtyMax(opt, p.name)) } : { ...p, qty: 1 }
  );
}

/** ตัวเลือกที่เลือกอยู่ของกลุ่มนี้ — กลุ่มปกติได้ 1 ตัว · กลุ่ม multi ได้ 0 ถึงหลายตัว */
export function selectedNames(opt: ProductOption, selections: Record<string, string>): string[] {
  return selectedPicks(opt, selections).map((p) => p.name);
}

/**
 * ค่าที่เลือกอยู่ของกลุ่มหนึ่ง เข้าเงื่อนไข "ต้องเป็นหนึ่งใน wanted" ไหม
 * รองรับกลุ่ม multi ด้วย — ติ๊กไว้หลายตัว ถ้ามีตัวใดตรงก็ถือว่าเข้าเงื่อนไข
 * (เช็คค่าตรง ๆ ก่อนเสมอ กันชื่อตัวเลือกที่มี " + " อยู่ในตัวถูกแยกผิด)
 */
function valueMatchesAny(current: string | undefined, wanted: string[]): boolean {
  if (!current) return false;
  if (wanted.includes(current)) return true;
  // เทียบทั้งข้อความดิบ (เผื่อชื่อตัวเลือกมี " ×N" อยู่ในตัว) และชื่อที่ตัดจำนวนออกแล้ว
  return current
    .split(MULTI_SEP)
    .map((s) => s.trim())
    .filter(Boolean)
    .some((raw) => wanted.includes(raw) || wanted.includes(parseMultiEntry(raw).name));
}

/**
 * กลุ่มนี้ต้องโชว์ให้ลูกค้าเลือกไหม ณ ตัวเลือกชุดนี้ (ดู ProductOption.showWhen)
 * ซ่อนอยู่ = ไม่แสดงในหน้าสินค้า ไม่คิดราคา และไม่ติดไปกับตะกร้า/ออเดอร์
 */
export function optionVisible(opt: ProductOption, selections: Record<string, string>): boolean {
  // ตั้งไม่ครบ (ไม่มีกลุ่ม หรือไม่ได้ติ๊กค่าไหนเลย) = ข้อนั้นไม่นับ · ตั้งครบทั้งสองข้อ = ต้องตรงทั้งคู่
  const pass = (s?: { label: string; choices: string[] }) =>
    !s?.label || !s.choices?.length || valueMatchesAny(selections[s.label], s.choices);
  return pass(opt.showWhen) && pass(opt.showWhenAlso);
}

/** ราคาบวกเพิ่มของกลุ่มนี้ใช้กับจำนวนนี้ไหม (ต่ำกว่าเกณฑ์ = รวมในราคาแล้ว) */
export function optionExtraApplies(opt: ProductOption, qty: number): boolean {
  return !opt.extraFromQty || qty >= opt.extraFromQty;
}

/**
 * ราคาบวกเพิ่ม (+฿) ของตัวเลือกที่เลือกในกลุ่มนี้ หลังหักเงื่อนไข "ฟรีเมื่อ"
 * ใช้ทั้งตอนคิดราคาและตอนแสดงป้าย +฿ บนหน้าร้าน จะได้ตรงกันเสมอ
 */
export function choiceExtraOf(
  opt: ProductOption,
  selections: Record<string, string>,
  choiceName: string
): number {
  const extra = opt.choices.find((c) => c.name === choiceName)?.extra ?? 0;
  if (!extra) return 0;
  const f = opt.freeWhen;
  if (f && f.choices.includes(choiceName) && valueMatchesAny(selections[f.when.label], f.when.choices)) return 0;
  return extra;
}

/**
 * +฿ รวมของกลุ่มนี้ตามที่ลูกค้าเลือกไว้ — กลุ่มปกติ = ตัวที่เลือก · กลุ่ม multi = บวกทุกตัวที่ติ๊ก
 * กลุ่มที่เปิดช่องจำนวน คูณตามจำนวนที่ลูกค้าระบุ (เพิ่มสาย 2 เส้น = +฿ ของสาย × 2)
 */
/**
 * +฿ ของตัวเลือกหนึ่ง ณ จำนวนที่สั่ง — ถึงเกณฑ์ extraFromQty ใช้ extra ปกติ
 * ยังไม่ถึงเกณฑ์ใช้ extraBelow (ไม่ตั้ง = ไม่คิดเพิ่ม เหมือนเดิม)
 */
export function choiceExtraAtQty(
  opt: ProductOption,
  selections: Record<string, string>,
  choiceName: string,
  qty: number
): number {
  if (optionExtraApplies(opt, qty)) return choiceExtraOf(opt, selections, choiceName);
  const below = opt.choices.find((c) => c.name === choiceName)?.extraBelow ?? 0;
  if (!below) return 0;
  const f = opt.freeWhen;
  if (f && f.choices.includes(choiceName) && valueMatchesAny(selections[f.when.label], f.when.choices)) return 0;
  return below;
}

/** +฿ รวมของกลุ่ม ณ จำนวนที่สั่ง (คู่กับ groupExtraOf แต่รู้จำนวน จึงเลือกเรทถูกช่วง) */
export function groupExtraAtQty(opt: ProductOption, selections: Record<string, string>, qty: number): number {
  let free = Math.max(0, Math.floor(opt.freeFirstN ?? 0));
  let sum = 0;
  for (const p of selectedPicks(opt, selections)) {
    const charged = Math.max(0, p.qty - free);
    free = Math.max(0, free - p.qty);
    sum += choiceExtraAtQty(opt, selections, p.name, qty) * charged;
  }
  return sum;
}

export function groupExtraOf(opt: ProductOption, selections: Record<string, string>): number {
  // 🎁 โควตา "รวมในราคาแล้ว" ถูกใช้ไปตามลำดับที่ติ๊ก — เหลือเท่าไหร่ค่อยคิดเงินส่วนที่เกิน
  let free = Math.max(0, Math.floor(opt.freeFirstN ?? 0));
  let sum = 0;
  for (const p of selectedPicks(opt, selections)) {
    const charged = Math.max(0, p.qty - free);
    free = Math.max(0, free - p.qty);
    sum += choiceExtraOf(opt, selections, p.name) * charged;
  }
  return sum;
}

/**
 * ค่าธรรมเนียมช่วงสั่งน้อยของกลุ่มนี้ ณ ตัวเลือก/จำนวนนี้ (บาทต่อชิ้น · 0 = ไม่คิด)
 * ค่าติดลบ = ลดให้ต่อชิ้นในช่วงนั้น (เช่น ช่วงปลีกเลือกแบบที่ทำง่ายกว่า ลดชิ้นละ 10)
 * เงื่อนไขครบทุกข้อถึงคิด: จำนวนไม่เกินเกณฑ์ · ตัวเลือกที่เลือกไม่อยู่ในรายการยกเว้น · ตรงกับเงื่อนไขกลุ่มอื่น (ถ้าตั้งไว้)
 */
export function smallQtyFeeOf(
  opt: ProductOption,
  selections: Record<string, string>,
  qty: number
): number {
  const f = opt.smallQtyFee;
  if (!f || !f.fee || !Number.isFinite(f.fee) || !(f.upToQty > 0) || qty > f.upToQty) return 0;
  const chosen = selectedNames(opt, selections);
  if (!chosen.length) return 0;
  // กลุ่มติ๊กหลายอย่าง: ติ๊กแต่ตัวที่ยกเว้นไว้ = ไม่คิด · มีตัวที่ไม่ยกเว้นแม้ตัวเดียว = คิดค่าธรรมเนียม
  if (chosen.every((n) => (f.freeChoices ?? []).includes(n))) return 0;
  if (f.when && !valueMatchesAny(selections[f.when.label], f.when.choices)) return 0;
  return f.fee;
}

/**
 * ราคาที่บวกจริงต่อชิ้นของ "ทั้งกลุ่ม" ณ ตัวเลือก/จำนวนนี้
 *
 * กติกาสำคัญ: ค่าธรรมเนียมช่วงสั่งน้อย (ค่าบวก) คิด **แทน** ราคาตัวเลือกในกลุ่มนั้น ไม่ใช่บวกซ้ำ
 * เช่น ช่วงปลีกเลือกตะขอคิดเหมาชิ้นละ 10 → ตะขอ C (+฿3) ก็คิด 10 ไม่ใช่ 13
 * ตัวที่ติ๊กยกเว้น (freeChoices) ไม่โดนค่าธรรมเนียม จึงคิดราคาตัวเลือกตามปกติ
 * ค่าธรรมเนียมติดลบ (= ส่วนลด) ไม่แทนที่ราคาตัวเลือก แต่ลดจากราคารวมของกลุ่ม
 */
export function groupAddOf(opt: ProductOption, selections: Record<string, string>, qty: number): number {
  const fee = smallQtyFeeOf(opt, selections, qty);
  if (fee > 0) return fee;
  // กลุ่มที่คิดต่อลาย/ต่อแผ่น: +฿ ไม่เข้าราคา/ชิ้น — ไปคิดรวมครั้งเดียวใน designFeeFor
  if (opt.extraPerDesign || opt.sheetFee) return fee;
  const extra = groupExtraAtQty(opt, selections, qty);
  return extra + fee; // fee ติดลบ = ลดให้
}

/**
 * ป้าย +฿ ที่ควรโชว์ข้างตัวเลือก (0 = ไม่ต้องโชว์)
 *
 * ตัวที่โดนค่าธรรมเนียมเหมาไม่ต้องโชว์ราคา — ในช่วงนั้นทุกตัวราคาเท่ากันหมด
 * ขึ้น "+฿10" ทุกบรรทัดรกเปล่า ๆ · ยอดเหมาบอกไว้ในบรรทัดสรุปใต้กลุ่มแล้ว
 * ส่วนตัวที่ติ๊กยกเว้น (ไม่โดนเหมา) ยังโชว์ราคาตัวเองตามปกติ
 */
export function choiceBadgeOf(
  opt: ProductOption,
  selections: Record<string, string>,
  choiceName: string,
  qty: number
): number {
  const view = { ...selections, [opt.label]: choiceName };
  if (!isMultiOption(opt) && smallQtyFeeOf(opt, view, qty) > 0) return 0;
  // ยังไม่เต็มโควตา "รวมในราคา" = ตัวนี้ยังไม่คิดเงิน อย่าขึ้นป้าย +฿ ให้ลูกค้าเข้าใจผิด
  const free = Math.max(0, Math.floor(opt.freeFirstN ?? 0));
  if (free > 0) {
    const picks = selectedPicks(opt, selections);
    const used = picks.filter((p) => p.name !== choiceName).reduce((n, p) => n + p.qty, 0);
    if (used < free) return 0;
  }
  return choiceExtraAtQty(opt, view, choiceName, qty);
}

export interface ProductImage {
  emoji: string;
  gradient: string;
  label: string;
  /** รูปจริงที่อัปโหลด (data URL) — ถ้ามีจะแสดงแทนอีโมจิ+สีพื้น */
  src?: string;
  /**
   * คลิปวิดีโอ (.mp4) — มีค่า = ช่องนี้ในแกลเลอรีเป็นคลิป กดแล้วเล่นในกรอบรูปเลย
   * src ของช่องนั้นทำหน้าที่เป็น "ภาพปก" ของคลิป (รูปย่อ · การ์ดหน้ารายการ · ตะกร้า ยังใช้ภาพนี้ตามปกติ)
   * ⚠️ อย่าใส่คลิปเป็นรูปแรก — รูปแรกถูกใช้เป็นภาพหน้าปกสินค้าในที่อื่นทั้งเว็บ
   */
  videoSrc?: string;
}

/**
 * ท่อนเนื้อหา "รายละเอียดสินค้า" (body) — หัวข้อ + ข้อความ + รูปประกอบ สลับซ้าย/ขวาได้
 * ขึ้นบรรทัดใหม่ในข้อความได้ และบรรทัดที่ขึ้นต้นด้วย "• " จะแสดงเป็นรายการ
 */
export interface BodySection {
  heading: string;
  text: string;
  /**
   * เนื้อหาแบบจัดรูปแบบ (HTML จากตัวเขียนหลังบ้าน — กรองแท็กอันตรายฝั่งเซิร์ฟเวอร์แล้ว)
   * มีค่า = ใช้แทน text · ไม่มี = ใช้ text แบบเดิม (ขึ้นบรรทัดใหม่ · "• " = รายการ)
   */
  html?: string;
  /** ไม่ใส่ = ท่อนข้อความอย่างเดียว */
  image?: ProductImage;
  /** ตำแหน่งรูป (ค่าเริ่มต้น: left) */
  align?: "left" | "right";
  /**
   * โซนที่ท่อนนี้ไปแสดงในหน้าสินค้า
   * "side" = ช่องข้าง ๆ แผงสั่งซื้อ (คอลัมน์ซ้าย) — ช่วยเติมช่องขาวที่เคยว่าง
   * ไม่ระบุ = ใต้แผงสั่งซื้อ เต็มความกว้าง (ค่าเริ่มต้นเดิม)
   */
  slot?: "side";
}

/**
 * แท็บข้อมูลสินค้า (แบบหน้า pricelist เว็บเดิม) — เช่น รายละเอียดเพิ่มเติม / วิธีสั่งงาน / การรับประกัน
 * text: ขึ้นบรรทัดใหม่ด้วย \n · บรรทัดขึ้นต้น "•" = รายการ · บรรทัดลงท้าย "::" = หัวข้อย่อยตัวหนา
 */
export interface ProductTab {
  title: string;
  text: string;
  /**
   * เนื้อหาแบบจัดรูปแบบ (HTML จากตัวเขียนหลังบ้าน — กรองแล้วฝั่งเซิร์ฟเวอร์)
   * มีค่า = ใช้แทน text · ไม่มี = ใช้ text แบบเดิม (• = รายการ · ::หัวข้อ:: = ตัวหนา)
   */
  html?: string;
  /** รูปประกอบในแท็บ (URL จาก Supabase Storage หรือ base64 ในโหมดเดโม) — เรียงตามลำดับในอาร์เรย์ */
  images?: string[];
  /** วางรูปไว้บนหรือใต้ข้อความ (ไม่ตั้ง = ใต้ข้อความ) */
  imagePos?: "top" | "bottom";
  /** ขนาดรูปในหน้าสินค้า: sm = 3 คอลัมน์ (ค่าเริ่มต้น) · md = 2 คอลัมน์ · lg = เต็มความกว้าง */
  imageSize?: "sm" | "md" | "lg";
  /** จัดวางรูปในแถว: ชิดซ้าย (ค่าเริ่มต้น) · กึ่งกลาง · ชิดขวา */
  imageAlign?: "left" | "center" | "right";
}

/**
 * กฎเงื่อนไขระหว่างตัวเลือก: เมื่อลูกค้าเลือก `when` แล้ว
 * กลุ่ม `limit.label` จะเหลือเฉพาะตัวเลือกใน `limit.allow`
 * เช่น เลือกกระดาษ Canvas → เคลือบ เหลือแค่ "ไม่เคลือบ"
 * ถ้ากลุ่มไหนเหลือตัวเลือกเดียว หน้าเว็บจะแสดงเป็นข้อความล็อกไว้ ลูกค้าสั่งผิดไม่ได้
 */
export interface OptionRule {
  /**
   * เงื่อนไข: กลุ่ม + ตัวเลือกที่ทำให้กฎทำงาน
   * choices (ใหม่) = หลายตัวเลือกในกฎเดียว เช่น สีพิเศษ 44 สี → ชนิดพิเศษ (กฎเดียวจบ)
   * choice (เดิม) = ตัวเดียว — ยังอ่านได้เพื่อข้อมูลเก่า
   */
  when: { label: string; choice: string; choices?: string[] };
  limit: { label: string; allow: string[] };
}

/** ตัวเลือกที่เลือกอยู่เข้าเงื่อนไขของกฎนี้ไหม (รองรับทั้งแบบตัวเดียวและหลายตัว) */
export function ruleWhenMatches(rule: OptionRule, selections: Record<string, string>): boolean {
  const cur = selections[rule.when.label];
  if (!cur) return false;
  return valueMatchesAny(cur, rule.when.choices?.length ? rule.when.choices : [rule.when.choice]);
}

/** ช่วงจำนวน (tier) สำหรับราคาขั้นบันได */
export interface PriceTier {
  /** จำนวนสูงสุดของช่วงนี้ (null = ช่วงสุดท้าย ขึ้นไปไม่จำกัด) */
  upTo: number | null;
  label: string;
}

/**
 * ตารางราคาแบบขั้นบันได (rate card): ราคา/หน่วย ขึ้นกับ (คอลัมน์ตัวเลือก × ช่วงจำนวน)
 * ยิ่งสั่งเยอะ ราคา/หน่วยยิ่งถูก · ถ้าสินค้าไม่มี pricing จะใช้ราคาเดียว (price + option.extra)
 */
export interface PriceMatrix {
  /** หน่วยนับ เช่น "แผ่น A3", "ชิ้น" */
  unit: string;
  /** กลุ่มตัวเลือกที่กำหนดคอลัมน์ (ค่าที่เลือกในกลุ่มเหล่านี้ = key ของคอลัมน์) */
  driverLabels: string[];
  tiers: PriceTier[];
  /** key = ค่าตัวเลือกของ driverLabels ต่อด้วย "│" → ราคา/หน่วยเรียงตาม tiers */
  cells: Record<string, number[]>;
}

/** 1 ขั้นของค่าส่งตามจำนวน — สั่งตั้งแต่ minQty ชิ้น → ค่าส่ง price บาท */
export interface ShipTier {
  minQty: number;
  price: number;
}

/**
 * ค่าส่งเฉพาะบางตัวเลือก — ของบางอย่าง "ขนาด" มีผลกับกล่อง/น้ำหนัก
 * เช่น สแตนดี้ A5 ส่งไปรษณีย์ได้ แต่ A2 ต้องกล่องใหญ่/ส่งแมส
 * เข้าเงื่อนไขข้อไหน = ใช้ค่าของข้อนั้นแทนค่ากลางของสินค้า (เข้าหลายข้อ = ใช้ข้อแรก)
 */
export interface ShipOptionRule {
  /** ชื่อกลุ่มตัวเลือก เช่น "ขนาด" */
  label: string;
  /** ค่าตัวเลือกที่เข้าเงื่อนไขนี้ (เลือกได้หลายค่า) */
  choices: string[];
  /** วิธีจัดส่งขั้นต่ำเมื่อเลือกตัวเลือกนี้ (ไม่ตั้ง = ใช้ shippingId ของสินค้า) */
  shippingId?: string;
  /** ตารางค่าส่งตามจำนวนชิ้นเฉพาะตัวเลือกนี้ (ไม่ตั้ง = ใช้ตารางกลางของสินค้า) */
  shipTiers?: ShipTier[];
  /** เกินขั้นสุดท้าย คิดเพิ่มชิ้นละกี่บาท (ใช้คู่กับ shipTiers ของข้อนี้) */
  shipTierExtra?: number;
  /** เกินขั้นสุดท้าย เปลี่ยนเป็นวิธีส่งนี้ (ใช้คู่กับ shipTiers ของข้อนี้) */
  shipTierMethodId?: string;
}

/**
 * เรทราคา 1 แบบของสินค้า — สินค้าบางตัวมีหลายเรท (เช่น พิน: เรทคละดีเทล / เรทไม่คละดีเทล)
 * แต่ละเรทมีตารางขั้นบันไดของตัวเอง (ช่วงจำนวนคนละชุดได้) + เงื่อนไขการสั่ง
 */
export interface PriceRate {
  id: string;
  /** ชื่อเรทที่ลูกค้าเห็น เช่น "เรทที่ 1 แบบคละดีเทล" */
  label: string;
  /** คำอธิบายสั้น ๆ ใต้ชื่อ เช่น "อะคริลิคใส / ขาวขุ่น C-02 (เงา 2 ด้าน)" */
  desc?: string;
  /** ยอดสั่งรวมขั้นต่ำของเรทนี้ เช่น เรท 2 ต้องสั่ง 50 ชิ้นขึ้นไป */
  minQty?: number;
  /** คละลายขั้นต่ำลายละกี่ชิ้น เช่น 25 → สั่ง 50 คละได้ 2 ลาย */
  minPerDesign?: number;
  /** คละลายเกินโควตาได้ โดยคิดเพิ่มลายละ (บาท) — ไม่ตั้ง = คละเกินโควตาไม่ได้ */
  extraDesignFee?: number;
  /**
   * สั่งต่ำกว่ากี่ชิ้น = คละลายได้อิสระ (ไม่ติดขั้นต่ำต่อลาย ไม่คิดค่าคละเพิ่ม)
   * เช่น ราคาปลีก 1-10 ชิ้น คละได้ทุกชิ้น · ตั้ง 11 = ต่ำกว่า 11 อิสระ ถึง 11 ค่อยใช้ minPerDesign
   */
  freeMixBelowQty?: number;
  /**
   * 🖼 ภาพประกอบของเรทนี้ (URL) — สินค้าที่ใช้เรทเป็น "แบบสินค้า" (เช่น สายคล้องหลายแบบ)
   * แสดงเป็นภาพย่อบนการ์ดเลือกเรท และกดเลือกแล้วแกลเลอรีสลับไปภาพนี้ (ถ้าอยู่ในแกลเลอรี)
   */
  imageSrc?: string;
  pricing: PriceMatrix;
}

/**
 * กติกาคละลายแบบ "คิดค่าคละเป็นเงินต่อหน่วย"
 *
 * ต่างจาก minPerDesign/extraDesignFee ของ PriceRate ตรงที่:
 *   - ของ PriceRate = โควตาลายต่อออเดอร์ คละเกินแล้วราคาตกไปเรทต่อลาย
 *   - ของตัวนี้ = ราคาเรทไม่เปลี่ยน แต่บวกค่าคละเป็นเงินตรง ๆ ต่อหน่วย
 * ใช้กับสินค้าอย่างสติกเกอร์ที่คละลายแล้วต้นทุนเพิ่มเป็นค่าจัดอาร์ต ไม่ใช่ค่าผลิตต่อชิ้น
 *
 * ตัวอย่าง Super Sticker: baseFee 20 · includedDesigns 4 · extraFee 5 · onePerUnitFromQty 11
 *   คละ 1 ลาย = 0 · 2-4 ลาย = 20 บาท/แผ่น · 6 ลาย = 20 + 2×5 = 30 บาท/แผ่น
 *   สั่ง 11 แผ่นขึ้นไป = คละได้ไม่เกินจำนวนแผ่น (ขั้นต่ำ 1 ลาย/แผ่น)
 */
export interface MixTier {
  /** ใช้กติกาแถวนี้เมื่อสั่งตั้งแต่จำนวนนี้ขึ้นไป (แถวแรกควรเป็น 1) */
  fromQty: number;
  /** คละตั้งแต่ 2 ลายขึ้นไป คิดเหมาต่อหน่วยเท่านี้ (0 = ช่วงนี้คละฟรี) */
  baseFee: number;
  /** จำนวนลายที่รวมอยู่ในค่าเหมาแล้ว (เกินกว่านี้คิด extraFee ต่อลาย) */
  includedDesigns: number;
  /** ลายที่เกินโควตา คิดเพิ่มต่อหน่วย ลายละเท่านี้ */
  extraFee: number;
  /** ช่วงนี้ต้องมีอย่างน้อย 1 ลาย/หน่วย → คละได้ไม่เกินจำนวนที่สั่ง */
  onePerUnit?: boolean;
}

export interface MixRule {
  /** คละตั้งแต่ 2 ลายขึ้นไป คิดเหมาต่อหน่วยเท่านี้ */
  baseFee: number;
  /** จำนวนลายที่รวมอยู่ในค่าเหมาแล้ว (เกินกว่านี้คิด extraFee ต่อลาย) */
  includedDesigns: number;
  /** ลายที่เกินโควตา คิดเพิ่มต่อหน่วย ลายละเท่านี้ */
  extraFee: number;
  /** สั่งตั้งแต่จำนวนนี้ขึ้นไป ต้องมีอย่างน้อย 1 ลาย/หน่วย → คละได้ไม่เกินจำนวนที่สั่ง */
  onePerUnitFromQty?: number;
  /**
   * ตารางค่าคละแยกตามช่วงจำนวน — มีแถวเมื่อไหร่ ใช้แทน 4 ค่าด้านบนทั้งหมด
   * ทำให้ตั้งกติกาต่างกันได้ในแต่ละช่วง เช่น 1-10 คิด 20 บาท · 11-50 คิด 15 บาท · 51+ ฟรี
   * (4 ค่าด้านบนยังอยู่เพื่อให้สินค้าที่ตั้งไว้แบบเดิมทำงานต่อได้)
   */
  tiers?: MixTier[];
}

/** กติกาที่มีผล ณ จำนวนนี้ — เลือกแถวที่ fromQty สูงสุดที่ยังไม่เกินจำนวนที่สั่ง */
export function mixTierFor(rule: MixRule, qty: number): MixTier {
  const rows = (rule.tiers ?? []).filter((t) => Number.isFinite(t.fromQty)).sort((a, b) => a.fromQty - b.fromQty);
  if (rows.length) {
    // ต่ำกว่าแถวแรก = ใช้แถวแรก (กันกรณีแอดมินเริ่มตารางที่ 5 แล้วลูกค้าสั่ง 2)
    let hit = rows[0];
    for (const r of rows) if (qty >= r.fromQty) hit = r;
    return hit;
  }
  // ไม่มีตาราง → ใช้ค่าเดี่ยวแบบเดิม
  return {
    fromQty: 1,
    baseFee: rule.baseFee,
    includedDesigns: rule.includedDesigns,
    extraFee: rule.extraFee,
    onePerUnit: !!rule.onePerUnitFromQty && qty >= rule.onePerUnitFromQty,
  };
}

/** ค่าคละของ "หนึ่งหน่วย" ที่มี n ลายอยู่บนหน่วยนั้น */
function feeOfUnit(t: MixTier, n: number): number {
  if (n <= 1) return 0; // หน่วยที่มีลายเดียว = ไม่ได้คละ ไม่คิด
  const extra = Math.max(0, n - Math.max(1, t.includedDesigns));
  return Math.max(0, t.baseFee) + extra * Math.max(0, t.extraFee);
}

/**
 * เฉลี่ยลายลงแต่ละหน่วยให้ใกล้เคียงที่สุด — คืน [จำนวนลายของแต่ละหน่วย]
 * เช่น 9 ลาย 2 แผ่น → [5,4] · 12 ลาย 11 แผ่น → [2,1,1,…]
 * (ตรงกับที่แอดมินคิดมือ: หารไม่ลงตัวก็แยกคิดเป็นคนละรายการ)
 */
export function spreadDesigns(designs: number, qty: number, cap = Infinity): number[] {
  if (qty <= 0) return [];
  // ลายน้อยกว่าหรือเท่าหน่วยที่สั่ง = ลายซ้ำกันข้ามหน่วย ทุกหน่วยมีลายเดียว (ไม่มีหน่วยไหน "คละ")
  // เช่น 10 แผ่น 4 ลาย → แผ่นละ 1 ลาย ไม่ใช่ 4 แผ่นมีลาย + 6 แผ่นว่าง
  if (designs <= qty) return Array.from({ length: qty }, () => 1);

  const c = Math.max(1, cap);
  if (designs <= c * qty) {
    /*
      ยังใส่ได้ในโควตา → "เติมให้เต็มโควตาต่อหน่วยก่อน แล้วค่อยขึ้นหน่วยใหม่"
      ไม่ใช่เฉลี่ยเท่า ๆ กัน เพราะเฉลี่ยแล้วจะไปโดนค่าคละหลายหน่วยโดยไม่จำเป็น
      เช่น 2 แผ่น 5 ลาย: เฉลี่ย [3,2] = คละ 2 แผ่น (40 บาท) · เติมเต็ม [4,1] = คละแผ่นเดียว (20 บาท)
      หน่วยที่เหลือได้ลายละ 1 (ลายซ้ำจากที่มีอยู่) จึงไม่ถือว่าคละ
    */
    const full = Math.floor(designs / c);
    const rest = designs - full * c;
    const out = Array.from({ length: full }, () => c);
    if (rest > 0) out.push(rest);
    while (out.length < qty) out.push(1);
    return out;
  }

  // ลายเกินโควตารวมแล้ว → เฉลี่ยส่วนที่เกินให้ทุกหน่วยเท่า ๆ กัน (เช่น 2 แผ่น 9 ลาย → [5,4])
  const base = Math.floor(designs / qty);
  const remainder = designs % qty;
  return Array.from({ length: qty }, (_, i) => (i < remainder ? base + 1 : base));
}

/**
 * ค่าคละลายทั้งรายการ
 *
 * ⚠️ คิดจาก "ลายต่อหน่วย" ไม่ใช่ "ลายทั้งออเดอร์" — จุดนี้เคยทำผิดมาก่อน
 *    สั่ง 2 แผ่น 2 ลาย = แผ่นละ 1 ลาย → ไม่ได้คละ ไม่คิดเงิน
 *    สั่ง 2 แผ่น 9 ลาย = [5,4] → 25 + 20 = 45 (ไม่ใช่คิดจากเลข 9 ตรง ๆ)
 */
export function mixFeeTotal(rule: MixRule, designs: number, qty: number): number {
  if (designs <= 1 || qty <= 0) return 0;
  const t = mixTierFor(rule, qty);
  return spreadDesigns(designs, qty, t.includedDesigns).reduce((sum, n) => sum + feeOfUnit(t, n), 0);
}

/**
 * ค่าคละของ "หนึ่งหน่วยที่มี n ลายอยู่บนนั้น" — ใช้กางรายละเอียดให้ลูกค้าเห็นทีละกลุ่ม
 * ⚠️ อย่าสับกับ mixFeeTotal: ตัวนี้ n = ลายบนหน่วยนั้นแล้ว ไม่ต้องเฉลี่ยซ้ำ
 */
export function mixUnitFee(rule: MixRule, designsOnUnit: number, qty: number): number {
  return feeOfUnit(mixTierFor(rule, qty), designsOnUnit);
}

/** ค่าคละของหน่วยที่มีลายมากที่สุด — ไว้โชว์ว่า "แผ่นที่แพงสุดแผ่นละเท่าไหร่" */
export function mixFeePerUnit(rule: MixRule, designs: number, qty = 1): number {
  if (designs <= 1 || qty <= 0) return 0;
  const t = mixTierFor(rule, qty);
  return feeOfUnit(t, Math.max(...spreadDesigns(designs, qty, t.includedDesigns)));
}

/**
 * เพดานจำนวนลายที่กติกานี้ยอมให้ — ไม่มีเพดาน = Infinity
 * (ช่วงที่ไม่ได้บังคับ 1 ลาย/หน่วย คละได้ไม่จำกัด เพราะหลายลายอยู่บนหน่วยเดียวกันได้)
 */
export function mixMaxDesigns(rule: MixRule | undefined, qty: number): number {
  if (!rule) return Infinity;
  return mixTierFor(rule, qty).onePerUnit ? qty : Infinity;
}

/**
 * จำนวนชิ้นที่ได้ต่อ 1 หน่วยสั่ง ตามตัวเลือกที่ลูกค้าเลือกอยู่ (ไม่มีตัวไหนตั้งไว้ = undefined)
 * มีหลายกลุ่มตั้งไว้ → ใช้ตัวที่น้อยที่สุด (เข้มที่สุดชนะ)
 */
export function perUnitCapacity(product: Product, selections: Record<string, string>): number | undefined {
  let cap: number | undefined;
  for (const o of product.options ?? []) {
    const picked = selections[o.label];
    if (!picked) continue;
    const c = o.choices.find((x) => x.name === picked);
    if (c?.perUnit && c.perUnit > 0) cap = cap === undefined ? c.perUnit : Math.min(cap, c.perUnit);
  }
  return cap;
}

/** ช่วงจำนวนนี้คละลายอิสระไหม (ช่วงราคาปลีก) */
export function isFreeMix(rate: PriceRate, qty: number): boolean {
  return !!rate.freeMixBelowQty && qty < rate.freeMixBelowQty;
}

/**
 * จำนวนลายสูงสุดที่คละได้ ณ จำนวนนี้ (รวมส่วนที่จ่ายเพิ่มได้)
 *
 * ⚠️ perUnit = ชิ้นที่ได้ต่อ 1 หน่วยสั่ง (สินค้าขายเป็นเซ็ต เช่น Jibbitz เซ็ตละ 5 ชิ้น)
 * เพดานจริงคือ "จำนวนชิ้น" ไม่ใช่จำนวนหน่วย เพราะคละ 1 ลายใช้อย่างน้อย 1 ชิ้น
 * — สั่ง 1 เซ็ต (5 ชิ้น) ต้องคละได้ 5 ลาย ไม่ใช่ 1 ลาย
 * สินค้าขายเป็นชิ้น (perUnit 1) ผลลัพธ์เท่าเดิมทุกประการ
 */
export function maxDesignsFor(rate: PriceRate, qty: number, perUnit = 1): number {
  const pieces = qty * Math.max(1, perUnit);
  if (!rate.minPerDesign || rate.minPerDesign <= 0) return pieces;
  if (isFreeMix(rate, qty)) return pieces;
  const included = Math.max(1, Math.floor(qty / rate.minPerDesign));
  return rate.extraDesignFee ? pieces : included;
}

/** ชื่อกลุ่มที่ใช้เก็บเรทที่ลูกค้าเลือกไว้ใน selections (แสดงในตะกร้า/ออเดอร์เหมือนตัวเลือกทั่วไป) */
export const RATE_LABEL = "เรทราคา";
/** ชื่อกลุ่มที่เก็บจำนวนลายที่ลูกค้าจะคละ เช่น "3 ลาย" */
export const DESIGN_LABEL = "จำนวนลาย";

/**
 * จำนวนลายที่ "รวมในราคา" ตามจำนวนที่สั่ง = ⌊จำนวน ÷ ขั้นต่ำต่อลาย⌋ (อย่างน้อย 1)
 * perUnit = ชิ้นต่อ 1 หน่วยสั่ง (ดู maxDesignsFor) — ช่วงคละอิสระต้องนับเป็นชิ้น
 * ไม่งั้นสินค้าเซ็ตจะโดนเก็บค่าคละตั้งแต่ช่วงปลีกที่ควรคละฟรี
 */
export function includedDesigns(rate: PriceRate, qty: number, perUnit = 1): number {
  if (!rate.minPerDesign || rate.minPerDesign <= 0) return 0;
  // ช่วงปลีกคละอิสระ — ทุกชิ้นเป็นคนละลายได้ ไม่คิดเพิ่ม
  if (isFreeMix(rate, qty)) return qty * Math.max(1, perUnit);
  return Math.max(1, Math.floor(qty / rate.minPerDesign));
}

/** จำนวนลายที่เลือกไว้ใน selections — "3 ลาย" → 3 (ไม่ได้เลือก = 1 ลาย) */
export function designCountOf(selections: Record<string, string>): number {
  const n = parseInt(String(selections[DESIGN_LABEL] ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * จำนวนที่ใช้ "หาเรทราคา" ในตารางขั้นบันได
 * สินค้าที่ตั้ง tierByDesign = คิดเรทตามจำนวนชิ้นต่อลาย ⌊จำนวน ÷ ลาย⌋ (อย่างน้อย 1)
 * เช่น เคส 11 ชิ้นคละ 11 ลาย → 1 ชิ้น/ลาย → เรทราคาปลีก (ไม่ใช่เรท 11 ชิ้น)
 * ส่วน "ราคารวม" ยังคูณจำนวนชิ้นจริงทั้งหมดตามเดิม
 *
 * เรทที่ตั้ง "คละลายขั้นต่ำลายละ N" ไว้:
 * - คละอยู่ในโควตา (เช่น 12 ชิ้นลายละ 3 คละ 4 ลาย) = ทำตามเงื่อนไข → คิดเรทตามยอดรวมเต็ม ๆ
 * - คละ "เกิน" โควตา (เช่น 11 ชิ้นคละ 4 ลาย) = ไม่บล็อก แต่ราคาตกไปคิดตามชิ้นต่อลาย
 *   (ลูกค้าอยากคละเยอะยอมจ่ายราคาปลีกได้เอง — ระบบปรับเรทให้เห็นตรง ๆ ไม่ใช่แค่ป้ายเตือน)
 */
export function tierQtyFor(product: Product, selections: Record<string, string>, qty: number): number {
  // สินค้าที่คิดค่าคละเป็นเงินต่อหน่วยแล้ว (mixRule) ห้ามลดเรทซ้ำอีก
  // ไม่งั้นลูกค้าโดนสองเด้ง: จ่ายค่าคละ + ราคาตกไปเรทปลีก
  if (product.mixRule) return qty;
  if (!product.tierByDesign) return qty;
  const r = activeRate(product, selections);
  const d = designCountOf(selections);
  if (r?.minPerDesign) {
    if (isFreeMix(r, qty) || d <= includedDesigns(r, qty, perUnitCapacity(product, selections) ?? 1)) return qty;
    return Math.max(1, Math.floor(qty / d));
  }
  return Math.max(1, Math.floor(qty / d));
}

/**
 * ค่าคละลายเกินโควตา (บาท ทั้งรายการ) — ลูกค้าเลือกจำนวนลายมากกว่าที่รวมในราคา
 * และเรทนั้นเปิดให้คละเกินได้ (extraDesignFee) → ส่วนเกินคิดลายละ extraDesignFee
 */
/** 💰 ค่าเพิ่ม "ต่อลาย" จากกลุ่มตัวเลือก (เช่น สีไหมเกิน 3 สี สีละ 10) × จำนวนลายที่คละ */
export function perDesignExtraOf(product: Product, selections: Record<string, string>): number {
  let sum = 0;
  for (const opt of product.options ?? []) {
    if (!opt.extraPerDesign || !optionActive(opt, selections)) continue;
    sum += groupExtraOf(opt, selections); // หักโควตาฟรี (freeFirstN) ให้แล้ว
  }
  return sum * designCountOf(selections);
}

/**
 * 📄 ชิ้นต่อแผ่นวัสดุของกลุ่มที่ sheetFee อ้างถึง — เช่น กลุ่ม "ขนาด" เลือก A5 ไว้ → 4 เล่ม/แผ่น A3
 * อ่านไม่ได้/ไม่ได้ตั้ง = 1 ชิ้นต่อแผ่น (คิดค่าฟิล์มทุกชิ้น — ปลอดภัยกว่าคิดขาด)
 */
export function perSheetOf(product: Product, opt: ProductOption, selections: Record<string, string>): number {
  const src = product.options?.find((o) => o.label === opt.sheetFee?.from);
  const picked = src ? selections[src.label] : undefined;
  const n = src?.choices.find((c) => c.name === picked)?.perSheet;
  return Number.isFinite(n) && (n as number) >= 1 ? Math.floor(n as number) : 1;
}

/** 📄 จำนวนแผ่นวัสดุที่ต้องใช้ของกลุ่มนี้ — ⌈จำนวนที่สั่ง ÷ ชิ้นต่อแผ่น⌉ (อย่างน้อย 1 แผ่น) */
export function sheetCountOf(product: Product, opt: ProductOption, selections: Record<string, string>, qty: number): number {
  return Math.max(1, Math.ceil(Math.max(1, qty) / perSheetOf(product, opt, selections)));
}

/**
 * 💰 ค่าเพิ่ม "ต่อแผ่นวัสดุ" จากกลุ่มตัวเลือก (เช่น ค่าฟิล์มเคลือบพิเศษ ต่อแผ่น A3)
 * สั่งไม่ถึง 1 แผ่นก็คิด 1 แผ่น · เกินไปแผ่นที่ 2 ก็คิดเพิ่มอีกแผ่น
 */
export function sheetFeeTotalOf(product: Product, selections: Record<string, string>, qty: number): number {
  let sum = 0;
  for (const opt of product.options ?? []) {
    if (!opt.sheetFee || !optionActive(opt, selections)) continue;
    const fee = groupExtraOf(opt, selections); // +฿ ของตัวเลือกที่เลือกในกลุ่มนี้ (เคลือบเงา/ด้าน = 0)
    if (fee <= 0) continue;
    sum += fee * sheetCountOf(product, opt, selections, qty);
  }
  return sum;
}

export function designFeeFor(product: Product, selections: Record<string, string>, qty: number): number {
  // ค่าเพิ่มต่อลายจากตัวเลือก (สีไหมเกินโควตา ฯลฯ) — คิดครั้งเดียวต่อลาย ไม่คูณจำนวนชิ้น
  const optionFee = perDesignExtraOf(product, selections);
  // ค่าเพิ่มต่อแผ่นวัสดุ (ค่าฟิล์มเคลือบพิเศษ ฯลฯ) — คิดตามจำนวนแผ่นที่ใช้จริง
  const sheetFee = sheetFeeTotalOf(product, selections, qty);
  return optionFee + sheetFee + designFeeBase(product, selections, qty);
}

/** 1 บรรทัดของการแจกแจง "Add on" — ชื่อรายการ + ยอด + วิธีคิดสั้น ๆ */
export interface FeeLine {
  label: string;
  amount: number;
  /** วิธีคิด เช่น "฿40 × 2 แผ่น A3" (ไม่มี = ยอดตรง ๆ ไม่ต้องอธิบาย) */
  note?: string;
}

/**
 * 🧾 แจกแจงว่า designFeeFor() มาจากค่าอะไรบ้าง — ลูกค้าเห็นบรรทัด "+ Add on ฿100" แล้วต้องรู้ว่าคืออะไร
 * ไล่ตามลำดับเดียวกับ designFeeFor เป๊ะ ๆ (ต่อลาย → ต่อแผ่น → ค่าคละลาย) ยอดรวมของทุกบรรทัดจึงเท่ากันเสมอ
 */
export function feeBreakdown(product: Product, selections: Record<string, string>, qty: number): FeeLine[] {
  const lines: FeeLine[] = [];
  const designs = designCountOf(selections);
  for (const opt of product.options ?? []) {
    if (!optionActive(opt, selections)) continue;
    const picked = selections[opt.label];
    if (opt.extraPerDesign) {
      const per = groupExtraOf(opt, selections);
      if (per > 0)
        lines.push({
          label: picked ? `${opt.label}: ${picked}` : opt.label,
          amount: per * designs,
          note: `${formatPrice(per)} × ${designs.toLocaleString("th-TH")} ลาย`,
        });
    }
    if (opt.sheetFee) {
      const fee = groupExtraOf(opt, selections);
      if (fee > 0) {
        const sheets = sheetCountOf(product, opt, selections, qty);
        const unit = opt.sheetFee.unit ?? "แผ่น";
        lines.push({
          label: picked || opt.label,
          amount: fee * sheets,
          note: `${formatPrice(fee)} × ${sheets.toLocaleString("th-TH")} ${unit}`,
        });
      }
    }
  }
  const mix = designFeeBase(product, selections, qty);
  if (mix > 0) lines.push({ label: "ค่าคละลาย", amount: mix, note: `คละ ${designs.toLocaleString("th-TH")} ลาย` });
  return lines;
}

/**
 * 🧾 แจกแจง Add on ที่ "รวมอยู่ในราคาต่อหน่วยแล้ว" — คนละก้อนกับ feeBreakdown
 *
 * ต่างกันตรง:
 *   - feeBreakdown       = ค่าที่บวกท้ายบิล (ค่าวัสดุต่อแผ่น · ค่าต่อลาย · ค่าคละลาย) → โผล่เป็นบรรทัด "+ Add on"
 *   - ตัวนี้             = +฿ ต่อหน่วยธรรมดา (เช่น พิมพ์รองสีขาว +20/แผ่น) ซึ่งบวกเข้าไปในราคาต่อหน่วยไปแล้ว
 *
 * ไม่มีบรรทัดนี้ ลูกค้าเห็นแค่ "฿110 / แผ่น A3" แล้วไม่รู้ว่ามีค่าพิมพ์รองสีขาว 20 บาทรวมอยู่ข้างใน
 * ⚠️ อย่าเอายอดจากที่นี่ไปบวกกับราคารวม — มันถูกนับไปแล้วในราคาต่อหน่วย ที่นี่ทำหน้าที่ "อธิบาย" อย่างเดียว
 */
export function unitAddOnBreakdown(product: Product, selections: Record<string, string>, qty: number): FeeLine[] {
  const m = activeMatrix(product, selections);
  const lines: FeeLine[] = [];
  for (const opt of product.options ?? []) {
    if (!optionActive(opt, selections)) continue;
    // กลุ่มที่เป็นแกนตารางราคา — ราคาอยู่ในช่องตารางอยู่แล้ว ไม่ใช่ของแถมที่บวกทีหลัง
    if (m?.driverLabels.includes(opt.label)) continue;
    // สองชนิดนี้ไม่เข้าราคาต่อหน่วย (ไปโผล่ที่ feeBreakdown แทน) — ใส่ซ้ำจะกลายเป็นบอกสองรอบ
    if (opt.extraPerDesign || opt.sheetFee) continue;
    const add = groupAddOf(opt, selections, qty);
    if (add <= 0) continue;
    const picked = selections[opt.label];
    lines.push({ label: picked || opt.label, amount: add });
  }
  return lines;
}

function designFeeBase(product: Product, selections: Record<string, string>, qty: number): number {
  // กติกาคละแบบคิดต่อหน่วยมาก่อน — ค่าคละ = (ค่าต่อหน่วยตามจำนวนลาย) × จำนวนที่สั่ง
  if (product.mixRule) return mixFeeTotal(product.mixRule, designCountOf(selections), Math.max(0, qty));
  const r = activeRate(product, selections);
  if (!r?.minPerDesign || !r.extraDesignFee) return 0;
  const n = parseInt(String(selections[DESIGN_LABEL] ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const extra = n - includedDesigns(r, qty, perUnitCapacity(product, selections) ?? 1);
  return extra > 0 ? extra * r.extraDesignFee : 0;
}

export interface Product {
  id: string;
  /**
   * ลิงก์ตามชื่อ (slug) — ตั้งได้จากหลังบ้าน ให้ URL หน้าสินค้าอ่านรู้เรื่อง เช่น /products/ส่วนเสริม-ติ่งห้อย-2cm
   * ไม่ตั้ง = ใช้ id ตามเดิม · ลิงก์เก่าแบบ id ยังเปิดได้เสมอ (หน้าเซิร์ฟเวอร์ค้นทั้งสองแบบ)
   */
  slug?: string;
  name: string;
  category: CategoryId;
  price: number;
  oldPrice?: number;
  emoji: string;
  gradient: string;
  /** รูปหลักจริง (data URL) สำหรับการ์ดสินค้า — ถ้ามีจะแสดงแทนอีโมจิ+สีพื้น */
  imageSrc?: string;
  rating: number;
  sold: number;
  badge?: "ขายดี" | "ใหม่" | "ลดราคา";
  featured?: boolean;
  description: string;
  highlights: string[];
  options: ProductOption[];
  /** กฎจำกัดตัวเลือกข้ามกลุ่ม (ไม่มี = ทุกตัวเลือกใช้ร่วมกันได้หมด) */
  rules?: OptionRule[];
  images: ProductImage[];
  /** เนื้อหารายละเอียดสินค้าท้ายหน้า (แก้ได้จากหลังบ้าน) */
  body?: BodySection[];
  /** แท็บข้อมูลสินค้า (รายละเอียดเพิ่มเติม / วิธีสั่งงาน / การรับประกัน ฯลฯ) — แสดงเป็นแถบแท็บท้ายหน้า */
  tabs?: ProductTab[];
  /** ตารางราคาขั้นบันได (ไม่มี = ใช้ราคาเดียว price + option.extra) */
  pricing?: PriceMatrix;
  /**
   * หลายเรทราคา (เช่น พิน: เรทคละดีเทล / เรทไม่คละดีเทล) — มีเมื่อไหร่ใช้แทน pricing
   * เรทแรกคือค่าเริ่มต้น · pricing จะถูกตั้งเป็นตารางของเรทแรกไว้ด้วยเสมอ (ให้โค้ดเดิมทำงานต่อได้)
   */
  priceRates?: PriceRate[];
  /**
   * วางแผงเลือกเรทราคาไว้ "ใต้" กลุ่มตัวเลือก (ไม่ตั้ง = อยู่ด้านบนเหมือนเดิม)
   * ใช้กับสินค้าที่ต้องรู้ "ของอะไร" ก่อนถึงจะเลือก "ขายแบบไหน" ได้
   * เช่น สติ๊กเกอร์ UV — เลือกเนื้อสติ๊กเกอร์ก่อน แล้วค่อยเลือกขายแบบแผ่น A3 หรือแบบตารางเมตร
   */
  rateAfterOptions?: boolean;
  /**
   * คิดเรทราคาตามจำนวนชิ้น "ต่อลาย" ไม่ใช่ยอดรวม — สำหรับสินค้าที่คละลายแล้วต้นทุนไม่ลด
   * เช่น เคส 11 ชิ้นคละ 11 ลาย = ลายละ 1 ชิ้น → คิดเรทราคาปลีก (ราคารวมยังคูณ 11 ชิ้นตามเดิม)
   */
  tierByDesign?: boolean;
  /**
   * กติกาคละลายแบบคิดค่าคละเป็นเงินต่อหน่วย (ดู MixRule)
   * ตั้งอันนี้แล้วราคาเรทจะไม่ถูกลดตามจำนวนลายอีก — คิดค่าคละตรง ๆ แทน
   */
  mixRule?: MixRule;
  /** ข้อมูล SEO/AEO (ไม่มี = ใช้ค่าจากชื่อ/รายละเอียดอัตโนมัติ) */
  seo?: ProductSeo;
  /**
   * สั่งตั้งแต่กี่ชิ้นขึ้นไป = ต้องเช็คสต๊อก/คิวผลิตกับแอดมินก่อน (0 หรือไม่ตั้ง = ใช้ค่ากลาง BULK_ASK_DEFAULT)
   * ไม่ได้บล็อกการสั่ง — แค่เตือนลูกค้า + ติดธงให้แอดมินยืนยันจำนวนก่อนเริ่มงาน
   */
  bulkAskQty?: number;
  /**
   * วิธีจัดส่ง "ขั้นต่ำ" ของสินค้านี้ (id จากตั้งค่าระบบ → การจัดส่ง)
   * ใช้กับของชิ้นใหญ่ที่ยังไงก็ต้องกล่องใหญ่ — มีในตะกร้าเมื่อไหร่ ระบบยกระดับค่าส่งให้เอง
   * ไม่ตั้ง = ปล่อยให้คิดตามจำนวน/ยอดตามปกติ
   */
  shippingId?: string;
  /**
   * ค่าส่งขั้นบันไดตามจำนวนชิ้นของสินค้านี้ (ของหนัก เช่น แผ่นหินรองแก้ว)
   * แต่ละขั้น: สั่งตั้งแต่ minQty ชิ้น → ค่าส่ง price บาท (ใช้ขั้นสูงสุดที่จำนวนถึง)
   * ตอนคิดเงิน ระบบใช้ค่าที่แพงกว่าระหว่างวิธีส่งที่เลือกกับค่าตามจำนวนนี้
   */
  shipTiers?: ShipTier[];
  /** เกินขั้นสุดท้ายแล้ว คิดเพิ่มชิ้นละกี่บาท (ไม่ตั้ง = ใช้ราคาขั้นสุดท้ายไปเรื่อย ๆ) */
  shipTierExtra?: number;
  /**
   * เกินขั้นสุดท้ายแล้ว "เปลี่ยนเป็นวิธีส่งนี้" แทนการคิดตามตาราง (id จากตั้งค่าระบบ → การจัดส่ง)
   * ใช้กับของที่เกินจำนวนหนึ่งแล้วต้องส่งแมสเซนเจอร์ — ตั้งคู่กับ shipTierExtra ไม่ได้ (เลือกอย่างใดอย่างหนึ่ง)
   */
  shipTierMethodId?: string;
  /**
   * ค่าส่งที่ขึ้นกับ "ตัวเลือกที่ลูกค้าเลือก" (ขนาด/วัสดุมีผลกับกล่อง)
   * เข้าเงื่อนไขข้อไหน ใช้ค่าส่งขั้นต่ำ/ตารางตามจำนวนของข้อนั้นแทนค่ากลางด้านบน
   */
  shipRules?: ShipOptionRule[];
  /**
   * 📐 เทมเพลตไฟล์งานที่ให้ลูกค้าโหลด (id จากคลังเทมเพลต /admin/templates)
   * ไฟล์ .ai เก็บในคลังกลาง — สินค้าเก็บแค่ id เพื่อให้แก้ไฟล์ที่เดียวแล้วอัปเดตทุกสินค้า
   */
  templateIds?: string[];
  /**
   * ข้อควรทราบ / เงื่อนไขงานของสินค้านี้ (ข้อความหลายบรรทัด)
   * เช่น ขนาดยึดด้านไหน · ค่าคลาดเคลื่อนของงานสกรีน · ลักษณะธรรมชาติของวัสดุ
   * แสดงบนหน้าสินค้าให้ลูกค้าอ่านก่อนสั่ง — กันเข้าใจผิด/เคลมทีหลัง
   */
  terms?: string;
  /**
   * ต้องแนบลาย (รูป หรือ ลิงก์/อีเมล) ก่อนถึงจะสั่งได้ไหม
   * ไม่ระบุ = ต้องแนบ (ค่าเริ่มต้นของร้านงานพิมพ์ตามสั่ง) · ตั้ง false สำหรับของเปล่า/วัสดุที่ไม่ต้องใช้ลาย
   */
  artworkRequired?: boolean;
  /**
   * 💬 ต้องคุยเรื่องลาย/ไฟล์กับแอดมินก่อนสั่ง (งานปัก งานตีลาย งานที่ต้องดูตัวอย่างก่อน)
   * ไม่ระบุ = สั่งได้เลยตามปกติ
   */
  artworkConsult?: ArtworkConsult;
  /**
   * 📐 กล่องงานสั่งทำเปิดค้างไว้เสมอ — ไม่ต้องให้ลูกค้าติ๊ก "ต้องการสั่งทำ" ก่อน
   * ใช้กับสินค้าที่ "ไม่มีขนาดมาตรฐาน" ทุกออเดอร์ต้องระบุขนาดเองอยู่แล้ว (เช่น อาร์มปักที่คิดราคาตาม ตร.ซม.)
   * ไม่ตั้ง = ตามเดิม ลูกค้าต้องติ๊กก่อนถึงกางช่องกรอก (ไม่ติ๊ก = ใช้ขนาดมาตรฐาน ราคาตามตารางปกติ)
   */
  mtoAlways?: boolean;
  /**
   * 🔒 บังคับ "ขั้นต่ำต่อลาย" (minPerDesign ของเรท) แบบแข็ง — จำนวน ÷ ลาย ต่ำกว่าเกณฑ์ = กดสั่งไม่ได้
   * ค่าเริ่มต้นของระบบเป็นแบบนุ่ม (สั่งน้อยกว่าได้ แค่ราคาปรับ) — สินค้าที่โรงงานไม่รับผลิตต่ำกว่า
   * ขั้นต่ำจริง ๆ (เช่น อาร์มปัก 5 ชิ้น/ลาย) ตั้งธงนี้
   */
  hardMinPerDesign?: boolean;
  /**
   * 📐 คิดราคาจาก "พื้นที่ลาย" ที่ลูกค้ากรอก แทนราคาคอลัมน์เดียวในตาราง
   * ใช้กับงานที่ราคาผูกกับขนาด เช่น อาร์มปัก: 15 ตร.ซม. แรก ฿40 · ตร.ซม. ต่อไป ฿2
   */
  areaPricing?: AreaPricing;
  /** สถานะตรวจสอบหลังบ้าน — มีค่า = ทีมงานเช็คสินค้านี้แล้ว (ใช้กันเช็คซ้ำเมื่อหลายคนช่วยกัน) */
  reviewed?: ProductReview;
  /**
   * ช่วงราคาที่คำนวณไว้ตอนบันทึก (ต่ำสุด/สูงสุดจากตารางราคา) — เซิร์ฟเวอร์เขียนให้เอง
   * มีไว้ให้หน้ารายการ/หน้าแรกโชว์ราคาได้โดยไม่ต้องโหลดตารางราคาทั้งก้อน (หนัก ~320 KB รวมทุกสินค้า)
   */
  priceMin?: number;
  priceMax?: number;
  /**
   * สินค้านี้มีทางเลือกที่ต้องให้แอดมินตีราคาไหม (เซิร์ฟเวอร์เขียนให้เองตอนบันทึก)
   * มีไว้ให้การ์ดหน้ารายการ/หน้าแรกรู้ได้โดยไม่ต้องโหลด options ทั้งก้อน — โชว์ "เริ่มต้น ฿X" แทนช่วงราคา
   */
  quoteOption?: boolean;
  /**
   * ซ่อนจากหน้าร้าน — true = ลูกค้าไม่เห็นทั้งในหน้ารายการ/หน้าแรก/ค้นหา/sitemap
   * และเปิดลิงก์ตรงก็ไม่เจอ (ยกเว้นทีมงานที่ล็อกอินหลังบ้าน — เอาไว้พรีวิวก่อนเปิดขาย)
   * ไม่ตั้ง/false = ขายปกติ · ของที่ยังทำไม่เสร็จหรือเลิกขายชั่วคราว ใช้อันนี้แทนการลบ
   */
  hidden?: boolean;
  /**
   * เวลาที่บันทึกล่าสุด (เซิร์ฟเวอร์เขียนให้เอง) — ใช้กันแท็บที่เปิดค้างไว้บันทึกทับข้อมูลใหม่กว่า
   * หน้าแก้ไขส่งค่านี้กลับมาตอนบันทึก ถ้าไม่ตรงกับในฐานข้อมูล = มีคนแก้ไปแล้ว เซิร์ฟเวอร์จะปฏิเสธ
   */
  savedAt?: string;
  /** ตัวเลือก "กำหนดขนาด/สเปกเอง" (custom) สำหรับงานสั่งทำนอกเหนือขนาดมาตรฐาน */
  custom?: CustomOption;
}

/**
 * ตัวเลือกกำหนดเอง (custom) — ลูกค้าระบุขนาดเอง (กว้าง × ยาว) สำหรับงานสั่งทำ
 * คิดราคาพิเศษนอกเหนือจากตารางราคาปกติ:
 *  - mode "area"  = คิดอัตโนมัติจากพื้นที่ (baseFee + ตร.ม. × ratePerSqm, ไม่ต่ำกว่า minPrice)
 *  - mode "quote" = กรอกขนาดได้ แต่ไม่คิดราคาอัตโนมัติ ให้แอดมินตีราคา (ลูกค้าเห็น "สอบถามราคา")
 *  - mode "size"  = กรอกขนาดที่ต้องการ แต่ราคายังคิดตามตารางราคาปกติ (ขนาดติดไปกับออเดอร์ให้ทีมผลิต)
 *  - mode "chat"  = ไม่ต้องกรอกอะไร โชว์ปุ่มทักไลน์ให้คุยรายละเอียดกับแอดมินก่อน (ราคา = สอบถาม)
 */
export interface CustomOption {
  enabled: boolean;
  /** ป้ายกลุ่ม เช่น "กำหนดขนาดเอง" */
  label: string;
  mode: "area" | "quote" | "size" | "chat";
  /** หน่วยที่ลูกค้ากรอก (area) — ป้ายหน่วย เช่น "ซม." "หลา" (มาจากคลังหน่วย) */
  unit: string;
  /** ตัวแปลง 1 หน่วย → เมตร (area) เก็บติดสินค้าไว้ให้คิดพื้นที่ได้เองแม้คลังเปลี่ยน */
  unitToMeter?: number;
  /** ราคาต่อ 1 ตารางเมตร (area) */
  ratePerSqm?: number;
  /** ค่าธรรมเนียม/ค่าเริ่มต้นคงที่ บวกเพิ่มทุกชิ้น (area) */
  baseFee?: number;
  /** ราคาขั้นต่ำต่อชิ้น (area) */
  minPrice?: number;
  /** คำอธิบาย/เงื่อนไขให้ลูกค้าเห็น */
  note?: string;
  /**
   * กลุ่มตัวเลือกที่ "ยังให้ลูกค้าเลือกได้" ขณะติ๊กกำหนดขนาดเอง (เช่น เปิดสี แต่ปิดขนาด)
   * ไม่ตั้ง/ว่าง = ปิดทุกกลุ่ม
   */
  keepOptions?: string[];
}

/**
 * 📐 คิดราคาตาม "พื้นที่ลาย" — ราคาเหมาก้อนแรก + ส่วนที่เกินคิดต่อหน่วยพื้นที่
 *
 * ทั้งสองเรทดึงจากตารางราคาเดิม (คนละคอลัมน์) จึงเปลี่ยนตามช่วงจำนวนที่สั่งเองอัตโนมัติ
 * ตัวอย่างอาร์มปัก 150 ชิ้น ลาย 5×7 = 35 ตร.ซม.
 *   15 ตร.ซม. แรก ฿25 + (35−15) × ฿1.25 = ฿25 → รวม ฿50/ชิ้น
 *
 * ยังไม่กรอกขนาด = ตกกลับไปใช้ราคาคอลัมน์ตามปกติ (ลูกค้าเห็น "เริ่มต้น ฿X" ก่อนกรอก)
 */
export interface AreaPricing {
  enabled: boolean;
  /** ชื่อกลุ่มช่องกรอกด้านกว้าง/ยาว — พื้นที่ = กว้าง × ยาว (หน่วยเดียวกับที่ตั้งในช่องกรอก) */
  widthLabel: string;
  heightLabel: string;
  /** ชื่อคอลัมน์ในตารางราคาที่เป็น "ราคาเหมาก้อนแรก" (เช่น "15 ตร.ซม. แรก") */
  baseColumn: string;
  /** ชื่อคอลัมน์ที่เป็น "ราคาต่อ 1 หน่วยพื้นที่ที่เกินก้อนแรก" (เช่น "ตร.ซม. ต่อไป") */
  stepColumn: string;
  /** พื้นที่ที่รวมอยู่ในราคาก้อนแรกแล้ว (เช่น 15 ตร.ซม.) */
  baseArea: number;
  /** ปัดเศษราคาต่อชิ้น — ไม่ตั้ง = ปัดขึ้น (ร้านไม่ขาดทุนเศษสตางค์) */
  round?: "none" | "ceil" | "round";
}

/** ตัวเลขที่ลูกค้ากรอกในกลุ่มช่องกรอก (ตัดหน่วยท้ายออก) — ยังไม่กรอก/ไม่ใช่ตัวเลข = 0 */
function inputNumberOf(selections: Record<string, string>, label: string): number {
  const n = Number(String(selections[label] ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** รายละเอียดการคิดราคาตามพื้นที่ — ใช้ทั้งคิดเงินและโชว์วิธีคิดให้ลูกค้าอ่าน */
export interface AreaBreakdown {
  width: number;
  height: number;
  /** พื้นที่รวม (กว้าง × ยาว) */
  area: number;
  /** พื้นที่ที่รวมในราคาก้อนแรก */
  baseArea: number;
  /** ราคาก้อนแรกของช่วงจำนวนที่สั่งอยู่ */
  basePrice: number;
  /** ราคาต่อหน่วยพื้นที่ส่วนเกิน ของช่วงจำนวนที่สั่งอยู่ */
  stepPrice: number;
  /** พื้นที่ส่วนที่เกินก้อนแรก */
  extraArea: number;
  /** เงินของส่วนเกิน */
  extraPrice: number;
  /** ราคาต่อชิ้นสุทธิ (ปัดแล้ว) */
  unitPrice: number;
}

/**
 * คิดราคา/ชิ้น จากพื้นที่ที่ลูกค้ากรอก · คืน null เมื่อยังคิดไม่ได้
 * (ไม่ได้เปิดใช้ · ยังไม่กรอกขนาด · ไม่มีคอลัมน์ที่อ้างถึงในตาราง)
 */
export function areaPriceBreakdown(
  p: Product,
  selections: Record<string, string>,
  qty: number
): AreaBreakdown | null {
  const a = p.areaPricing;
  if (!a?.enabled) return null;
  const width = inputNumberOf(selections, a.widthLabel);
  const height = inputNumberOf(selections, a.heightLabel);
  if (!width || !height) return null;
  const m = activeMatrix(p, selections);
  if (!m) return null;
  const i = tierIndex(m, tierQtyFor(p, selections, qty));
  const basePrice = m.cells[a.baseColumn]?.[i];
  const stepPrice = m.cells[a.stepColumn]?.[i];
  if (typeof basePrice !== "number" || typeof stepPrice !== "number") return null;
  const area = width * height;
  const extraArea = Math.max(0, area - a.baseArea);
  const extraPrice = extraArea * stepPrice;
  const raw = basePrice + extraPrice;
  const unitPrice = a.round === "none" ? raw : a.round === "round" ? Math.round(raw) : Math.ceil(raw);
  return { width, height, area, baseArea: a.baseArea, basePrice, stepPrice, extraArea, extraPrice, unitPrice };
}

/**
 * 💬 คุยลายกับแอดมินก่อนสั่ง — งานที่ตกลงแบบกันก่อนถึงจะเริ่มได้
 * (งานปักต้องตีลาย/แปลงไฟล์ให้ดูก่อน · งานที่ลายต้องปรับให้เข้ากับวัสดุ)
 * ลูกค้าเห็นกล่องสีเขียว: ทักไลน์ → คุยกับแอดมิน → ติ๊กยืนยันว่าคุยแล้ว → ถึงจะกดสั่งได้
 */
export interface ArtworkConsult {
  enabled: boolean;
  /** เหตุผล/รายละเอียดที่แสดงให้ลูกค้าอ่าน (ไม่ใส่ = ใช้ข้อความกลางของระบบ) */
  note?: string;
  /**
   * ไม่ระบุ/true = สั่งไม่ได้จนกว่าจะติ๊กยืนยันว่าคุยกับแอดมินแล้ว
   * false = แค่แนะนำให้ทักก่อน (กดสั่งได้เลย)
   */
  block?: boolean;
}

/** ป้ายที่ติดไปกับรายการในตะกร้า/ออเดอร์เมื่อลูกค้ายืนยันว่าคุยลายกับแอดมินแล้ว */
export const CONSULT_LABEL = "คุยลายกับแอดมิน";

/** ข้อความกลางเมื่อแอดมินไม่ได้เขียนเหตุผลเอง */
export const CONSULT_NOTE_DEFAULT =
  "งานแบบนี้ต้องคุยเรื่องลายกับแอดมินก่อนนะครับ — ส่งไฟล์/แบบที่ต้องการมาทางไลน์ ทางร้านจะตีลายให้ดูก่อน ตกลงแบบกันเรียบร้อยแล้วค่อยกดสั่ง";

/** สินค้านี้ต้องคุยลายกับแอดมินก่อนไหม (คืน null ถ้าไม่ได้เปิดใช้) */
export function artworkConsultOf(p: Product): ArtworkConsult | null {
  return p.artworkConsult?.enabled ? p.artworkConsult : null;
}

/**
 * แปลงข้อความ (เช่น ชื่อสินค้า) เป็น slug สำหรับลิงก์ — คงภาษาไทยไว้
 * เว้นวรรค→ขีดกลาง · ตัดอักขระที่มีความหมายพิเศษใน URL ออก
 */
export function slugifyProductName(name: string): string {
  return name
    .trim()
    .replace(/[()[\]{}<>#%?&=+/\\'"`!,;:@^|~*$]/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * ย่อชื่อตัวเลือกสำหรับ "ป้ายกำกับ" (หัวตารางราคา / ชื่อแถวคู่ตัวเลือก)
 * — ตัดคำอธิบายในวงเล็บ เช่น "สีพิเศษ (โฮโลแกรม/กลิสเตอร์/สี)" → "สีพิเศษ"
 * — บีบช่องว่างรอบ "/" เช่น "ใส / ขาวขุ่น C-02" → "ใส/ขาวขุ่น C-02"
 * ชื่อเต็มยังใช้เป็นคีย์ราคาและแสดงในกลุ่มตัวเลือกตามเดิม (ย่อเฉพาะตอนแสดงผล)
 */
export function shortChoice(name: string): string {
  const s = name
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
  return s || name.trim();
}

/** ชิ้นส่วนของคีย์คู่ตัวเลือก (a│b│c) แบบย่อแล้ว — ใช้แสดงทีละบรรทัด ไม่ให้ป้ายยาวเป็นพืด */
export function shortComboParts(key: string): string[] {
  return key.split("│").filter(Boolean).map(shortChoice);
}

/** ลิงก์หน้าสินค้า — ใช้ slug (ลิงก์ตามชื่อ) ถ้าตั้งไว้ ไม่งั้นใช้ id ตามเดิม */
export function productPath(p: { id: string; slug?: string }): string {
  const s = (p.slug ?? "").trim();
  return `/products/${encodeURIComponent(s || p.id)}`;
}

/**
 * ลิงก์หน้าแก้ไขสินค้าในหลังบ้าน — ใช้ชื่อเดียวกับลิงก์หน้าร้าน (slug) เพื่อให้สองที่อ่านตรงกัน
 * เช่น หน้าร้าน /products/กระเป๋าผ้าแคนวาส → หลังบ้าน /admin/products/กระเป๋าผ้าแคนวาส
 * ลิงก์ด้วย id เดิมยังเปิดได้ตามปกติ (หน้าแก้ไขค้นด้วย id ก่อน ไม่เจอค่อยค้นด้วย slug)
 */
export function adminProductPath(p: { id: string; slug?: string }): string {
  const s = (p.slug ?? "").trim();
  return `/admin/products/${encodeURIComponent(s || p.id)}`;
}

/** ตัวแปลงหน่วยเดิม (backward-compat กับสินค้าที่บันทึกก่อนมีคลังหน่วย) */
const UNIT_TO_M: Record<string, number> = { cm: 0.01, inch: 0.0254, m: 1, "ซม.": 0.01, "นิ้ว": 0.0254, "เมตร": 1 };

/** ราคา/ชิ้น ของงานกำหนดขนาดเอง (area mode) จากกว้าง×ยาว ตามหน่วยที่ตั้งไว้ · โหมดอื่นคืน 0 */
export function customUnitPrice(c: CustomOption, width: number, height: number): number {
  if (c.mode !== "area" || !(width > 0) || !(height > 0)) return 0;
  const m = c.unitToMeter ?? UNIT_TO_M[c.unit] ?? 0.01;
  const areaSqm = width * m * (height * m);
  const raw = (c.baseFee ?? 0) + areaSqm * (c.ratePerSqm ?? 0);
  return Math.max(c.minPrice ?? 0, Math.round(raw));
}

/**
 * กลุ่มนี้ยังให้ลูกค้าเลือกได้ไหมขณะใช้ขนาดกำหนดเอง
 * เทียบชื่อแบบตัดช่องว่างหัว-ท้าย — ชื่อกลุ่มเก่าบางตัวเคยมีเว้นวรรคท้ายติดมา
 * พอชื่อกลุ่มถูก trim ทีหลัง keepOptions ที่เก็บชื่อเดิมไว้เลยไม่แมตช์ กลุ่มโดนล็อกทั้งที่แอดมินติ๊กเปิดไว้
 */
export function customKeepsOption(c: CustomOption | null | undefined, label: string): boolean {
  if (!c) return false;
  const want = label.trim();
  return (c.keepOptions ?? []).some((l) => l.trim() === want);
}

/** อ่านค่า กว้าง×ยาว จากข้อความที่เก็บใน selections (เช่น "200×150") */
export function parseCustomDims(raw?: string): { w: number; h: number } | null {
  const m = (raw ?? "").match(/(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)/);
  return m ? { w: +m[1], h: +m[2] } : null;
}

/** บันทึกว่าใคร "ตรวจแล้ว" เมื่อไหร่ — โชว์เป็นป้ายในหลังบ้านให้ทีมงานไม่ทำงานซ้ำกัน */
export interface ProductReview {
  /** ชื่อผู้ตรวจล่าสุด (โหมดเดโมที่ไม่มีชื่อ = "ทีมงาน") */
  by: string;
  /** เวลาที่ตรวจ (ISO string) */
  at: string;
}

/** ข้อมูลปรับแต่งการค้นหา — SEO (meta) + AEO (คำถาม-คำตอบให้ AI/answer engine ดึงไปตอบ) */
export interface ProductSeo {
  /** meta/OG title (เว้นว่าง = ใช้ชื่อสินค้า) */
  title?: string;
  /** meta description (เว้นว่าง = ใช้ description) */
  description?: string;
  /** คำค้น (keywords) */
  keywords?: string[];
  /** คำถามพบบ่อย — แสดงหน้าสินค้า + ฝัง FAQPage JSON-LD ให้ answer engine */
  faqs?: { q: string; a: string }[];
}

export const CATEGORIES: Category[] = [
  { id: "acrylic", name: "พวงกุญแจ / อะคริลิค", nameEn: "Acrylic", emoji: "🔑", gradient: "from-sky-200 to-cyan-300", description: "พวงกุญแจอะคริลิค Jibbitz บัคเคิ้ล เขย่า แจกัน กิ๊บ และงานอะคริลิคทั่วไป" },
  { id: "acrylic-bending", name: "Acrylic Bending", nameEn: "Acrylic Bending", emoji: "🪟", gradient: "from-cyan-200 to-sky-300", description: "อะคริลิคดัดง้อ ตั้งโต๊ะ ที่วางมือถือ ตามสั่ง" },
  { id: "standee", name: "สแตนดี้", nameEn: "Standee", emoji: "🧍", gradient: "from-indigo-200 to-blue-300", description: "สแตนดี้อะคริลิคทุกแบบ ตั้งโต๊ะ จิ๋ว ตั้งมือถือ ฐานเพลง โยกเยก หมุน" },
  { id: "light", name: "สแตนดี้ฐานไฟ / LIGHT", nameEn: "Light", emoji: "💡", gradient: "from-blue-200 to-indigo-300", description: "สแตนดี้ฐานไฟ กล่องไฟ แท่งไฟ งานเรืองแสง" },
  { id: "phone-gadget", name: "เคส / มือถือ / แก็ดเจ็ต", nameEn: "Phone & Gadget", emoji: "📱", gradient: "from-slate-200 to-blue-200", description: "เคสมือถือ Airpods สายคล้อง Griptok Magsafe นาฬิกา Power Bank" },
  { id: "mirror-magnet", name: "กระจก / แม่เหล็ก", nameEn: "Mirror & Magnet", emoji: "🪞", gradient: "from-cyan-200 to-teal-200", description: "กระจกอะคริลิค แม่เหล็กติดตู้เย็น เข็มกลัด" },
  { id: "sticker-paper", name: "สติกเกอร์ / กระดาษ", nameEn: "Sticker & Paper", emoji: "🏷️", gradient: "from-sky-200 to-blue-200", description: "สติกเกอร์ Die-Cut งานกระดาษ พิมพ์ตามสั่ง" },
  { id: "card-photo", name: "Photocard / การ์ด / Shikishi", nameEn: "Card & Photo", emoji: "🎴", gradient: "from-pink-200 to-rose-200", description: "โฟโต้การ์ด ชิกิชิ Card Board Name Tag ที่คั่นหนังสือ" },
  { id: "banner", name: "โปสเตอร์ / Banner / ป้าย", nameEn: "Banner & Poster", emoji: "📢", gradient: "from-amber-200 to-yellow-200", description: "โปสเตอร์แขวนผนัง ป้าย Banner ไวนิล ผ้าเชียร์ สโลแกน" },
  { id: "calendar-frame", name: "ปฏิทิน / กรอบรูป", nameEn: "Calendar & Frame", emoji: "🖼️", gradient: "from-orange-200 to-amber-200", description: "ปฏิทิน กรอบรูป Canvas Frame" },
  { id: "home", name: "ของแต่งบ้าน / แก้ว / เมาส์แพด", nameEn: "Home", emoji: "🏠", gradient: "from-teal-200 to-cyan-200", description: "แก้วน้ำ แผ่นรองแก้ว เมาส์แพด พรมเช็ดเท้า ฟองน้ำ" },
  { id: "bag", name: "กระเป๋า", nameEn: "Bag", emoji: "👜", gradient: "from-emerald-200 to-teal-200", description: "กระเป๋าผ้าดิบ กระเป๋าโฮโล Laptop Bag Candybag" },
  { id: "apparel", name: "เสื้อผ้า / หมวก / ร่ม", nameEn: "Apparel", emoji: "👕", gradient: "from-green-200 to-emerald-300", description: "เสื้อสกรีน/ปัก หมวก ร่ม ปลอกคอ/เสื้อสัตว์เลี้ยง" },
  { id: "fabric", name: "ผ้า / หมอน / ผ้าห่ม", nameEn: "Fabric", emoji: "🧶", gradient: "from-emerald-200 to-teal-300", description: "ปลอกหมอน ผ้าห่ม ผ้าขนหนู ยางรัดผม ผ้าหลา" },
  { id: "gifts", name: "ของขวัญ / ปัก / ตุ๊กตา", nameEn: "Gifts", emoji: "🧸", gradient: "from-rose-200 to-pink-300", description: "อาร์มปัก ตุ๊กตาปัก ของขวัญชิ้นเล็ก" },
];

/** ค่ากลาง: สั่งตั้งแต่เท่านี้ขึ้นไปให้ถามสต๊อกก่อน (สินค้าที่ไม่ได้ตั้งค่าเอง) */
export const BULK_ASK_DEFAULT = 100;

/** สินค้านี้บังคับแนบลายก่อนสั่งไหม (ไม่ระบุ = บังคับ) */
export function artworkIsRequired(p: Product): boolean {
  return p.artworkRequired !== false;
}

/** สั่งจำนวนนี้ต้องเช็คสต๊อกกับแอดมินก่อนไหม */
export function needsStockCheck(p: Product, qty: number): boolean {
  const limit = p.bulkAskQty && p.bulkAskQty > 0 ? p.bulkAskQty : BULK_ASK_DEFAULT;
  return qty >= limit;
}

/**
 * ข้อมูลหมวดจากชุดในโค้ด — ใช้กับป้าย/สีพื้นเวลาไม่ได้โหลดหมวดจากฐาน
 * แอดมินเพิ่มหมวดใหม่เองได้ (id นอกชุดนี้) → คืนค่ากลาง ๆ แทน undefined กันหน้าพัง
 */
export function getCategory(id: CategoryId): Category {
  return (
    CATEGORIES.find((c) => c.id === id) ?? {
      id,
      name: String(id),
      nameEn: String(id),
      emoji: "🏷️",
      gradient: "from-slate-100 to-slate-200",
      description: "",
    }
  );
}

// ── ชุดตัวเลือกร่วมของสินค้ากลุ่มกระดาษ (ดึงจาก iduckyprintsstudio.com จริง) ──
const PAPER_TYPES_POSTCARD: ProductOptionChoice[] = [
  { name: "กระดาษอาร์ตเกาหลี 300 แกรม" },
  { name: "Canvas Paper 260 แกรม" },
  { name: "100 Pound Paper 300 แกรม" },
  { name: "E-Photo Paper 290 แกรม" },
  { name: "Stardream Crystal Paper 285 แกรม" },
  { name: "Stardream Paper 285 แกรม" },
  { name: "Extra Paper 260 แกรม" },
];
const PAPER_TYPES_POSTER: ProductOptionChoice[] = [
  { name: "กระดาษอาร์ตเกาหลี 130 แกรม" },
  { name: "กระดาษอาร์ตเกาหลี 150 แกรม" },
  { name: "กระดาษอาร์ตเกาหลี 300 แกรม" },
  { name: "กระดาษอาร์ตเกาหลี 400 แกรม" },
  { name: "Canvas Paper 260 แกรม" },
  { name: "100 Pound Paper 300 แกรม" },
  { name: "E-Photo Paper 290 แกรม" },
  { name: "Stardream Crystal Paper 285 แกรม" },
  { name: "Stardream Paper 285 แกรม" },
  { name: "Extra Paper 260 แกรม" },
];
const COATINGS: ProductOptionChoice[] = [
  { name: "ไม่เคลือบ" },
  { name: "เคลือบด้าน" },
  { name: "เคลือบเงา" },
  { name: "Dot Hologram" },
  { name: "Crack Glass Hologram" },
  { name: "Rainbow Hologram" },
];
// กระดาษผิวพิเศษ/มีเท็กซ์เจอร์ เคลือบไม่ได้ → ล็อกเป็น "ไม่เคลือบ"
// (ยืนยันจริงกับ Canvas จากเว็บ; ที่เหลือเป็นการอนุมานตามชนิดกระดาษ — ปรับได้จากหลังบ้าน)
const NON_COATABLE_PAPERS = [
  "Canvas Paper 260 แกรม",
  "Stardream Crystal Paper 285 แกรม",
  "Stardream Paper 285 แกรม",
  "Extra Paper 260 แกรม",
];
const PAPER_COATING_RULES: OptionRule[] = NON_COATABLE_PAPERS.map((paper) => ({
  when: { label: "ชนิดกระดาษ", choice: paper },
  limit: { label: "เคลือบ (เฉพาะด้านหน้า)", allow: ["ไม่เคลือบ"] },
}));

/**
 * สร้างตารางราคาขั้นบันไดของสินค้ากลุ่มกระดาษจาก rate card จริง (per แผ่น A3)
 * คอลัมน์ = ชนิดกระดาษ × เคลือบ · ราคาอิงหมวดเคลือบ (ไม่เคลือบ / เงา-ด้าน / พิเศษ)
 * (ตัวเลขจากเรทจริงกระดาษ 300 แกรม — ปรับต่อชนิดกระดาษได้จากหลังบ้าน)
 */
function makePaperPricing(papers: ProductOptionChoice[], coatings: ProductOptionChoice[]): PriceMatrix {
  const tiers: PriceTier[] = [
    { upTo: 10, label: "1-10 แผ่น A3" },
    { upTo: 49, label: "11-49 แผ่น A3" },
    { upTo: 99, label: "50-99 แผ่น A3" },
    { upTo: 499, label: "100-499 แผ่น A3" },
    { upTo: 1999, label: "500-1999 แผ่น A3" },
    { upTo: 4999, label: "2000-4999 แผ่น A3" },
    { upTo: null, label: "5000 แผ่น A3 ขึ้นไป" },
  ];
  const none = [80, 60, 55, 50, 45, 40, 35];
  const gloss = [90, 70, 65, 60, 55, 50, 45];
  const special = [110, 90, 85, 80, 80, 80, 80];
  const priceOf = (coating: string) =>
    coating === "ไม่เคลือบ"
      ? none
      : /Hologram|โฮโลแกรม|กลิสเตอร์|Stardust|Dust|พิเศษ|Glitter/i.test(coating)
        ? special
        : gloss;
  const cells: Record<string, number[]> = {};
  for (const p of papers) for (const c of coatings) cells[`${p.name}│${c.name}`] = priceOf(c.name);
  return { unit: "แผ่น A3", driverLabels: ["ชนิดกระดาษ", "เคลือบ (เฉพาะด้านหน้า)"], tiers, cells };
}

export const PRODUCTS: Product[] = [
  // ═══ นำเข้าจาก iduckyprintsstudio.com — ข้อมูลจริง (ชื่อ/ราคา/ตัวเลือกยืนยันจากหน้าเว็บ) ═══
  {
    id: "postcard-th",
    name: "POSTCARD / โปสการ์ด",
    category: "card-photo",
    price: 90,
    emoji: "💌",
    gradient: "from-rose-100 to-pink-200",
    rating: 4.9,
    sold: 958,
    badge: "ใหม่",
    featured: true,
    description:
      "โปสการ์ดพิมพ์ลายคุณภาพสูง เลือกกระดาษได้หลายชนิด พิมพ์ระบบดิจิทัลสีคมชัด เก็บสะสมหรือทำแจกเป็นของขวัญ (กระดาษผิวพิเศษบางชนิดเคลือบไม่ได้ ระบบจะล็อกให้อัตโนมัติ)",
    highlights: ["กระดาษให้เลือก 8 ชนิด", "เคลือบได้หลายแบบ รวมโฮโลแกรม", "พิมพ์ดิจิทัลสีคมชัด", "ผลิต 2-3 วันทำการ"],
    options: [
      {
        label: "ขนาด",
        choices: [
          { name: "4\"x6\" | แนวนอน (8 แผ่น /1A3)" },
          { name: "5\"x7\" | แนวนอน (4 แผ่น /1A3)" },
        ],
      },
      { label: "ชนิดกระดาษ", choices: PAPER_TYPES_POSTCARD },
      { label: "เคลือบ (เฉพาะด้านหน้า)", choices: COATINGS },
      {
        label: "ตัวเลือก",
        choices: [{ name: "ลายเดียว" }, { name: "คละลาย" }],
      },
    ],
    rules: PAPER_COATING_RULES,
    pricing: makePaperPricing(PAPER_TYPES_POSTCARD, COATINGS),
    images: [
      { emoji: "💌", gradient: "from-rose-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "🖋️", gradient: "from-pink-100 to-rose-200", label: "ด้านหลัง" },
      { emoji: "🎁", gradient: "from-amber-100 to-orange-200", label: "แพ็กใส่ซอง" },
    ],
    body: [
      {
        heading: "โปสการ์ด (POSTCARD)",
        text: "โปสการ์ดกำลังเป็นที่นิยมสำหรับเก็บสะสม\nทำเป็นรูปที่ระลึก หรือ ทำแจกเป็นของขวัญในโอกาสสำคัญๆ\nออกแบบได้เองตามต้องการ พิมพ์ด้วยเครื่องพิมพ์คุณภาพสูง",
        image: { emoji: "🖼️", gradient: "from-rose-100 to-pink-200", label: "ตัวอย่างโปสการ์ด" },
        align: "left",
      },
      {
        heading: "ขนาดโปสการ์ด (POSTCARD)",
        text: "• ขนาด 4\"x6\" | แนวนอน (8 แผ่น /1A3)\n• ขนาด 5\"x7\" | แนวนอน (4 แผ่น /1A3)",
        image: { emoji: "📐", gradient: "from-sky-100 to-blue-200", label: "เทียบขนาด" },
        align: "right",
      },
      {
        heading: "วิธีการออกแบบสั่งซื้อ โปสการ์ด",
        text: "สั่งซื้อสินค้าที่คุณชื่นชอบผ่านเว็บไซต์ได้ง่ายๆ ในไม่กี่นาที เพียงดูวิดีโอแนะนำนี้ แล้วทำตามได้เลย!",
        image: { emoji: "▶️", gradient: "from-amber-100 to-yellow-200", label: "วิดีโอแนะนำ" },
        align: "left",
      },
    ],
  },
  {
    id: "poster-th",
    name: "POSTER / โปสเตอร์",
    category: "card-photo",
    price: 40,
    emoji: "🖼️",
    gradient: "from-sky-100 to-blue-200",
    rating: 4.8,
    sold: 512,
    description:
      "โปสเตอร์พิมพ์ลายขนาด A3 เลือกกระดาษได้หลากหลายตั้งแต่อาร์ตบางไปจนถึงกระดาษหนาพิเศษ พิมพ์สีคมชัด ติดผนังแต่งห้องได้สวย",
    highlights: ["ขนาด A3 แนวตั้ง/แนวนอน", "กระดาษให้เลือกถึง 11 ชนิด", "เคลือบ/โฮโลแกรมได้", "พิมพ์ระบบดิจิทัล"],
    options: [
      {
        label: "ขนาด",
        choices: [{ name: "A3 | แนวตั้ง" }, { name: "A3 | แนวนอน" }],
      },
      { label: "ชนิดกระดาษ", choices: PAPER_TYPES_POSTER },
      { label: "เคลือบ (เฉพาะด้านหน้า)", choices: COATINGS },
    ],
    rules: PAPER_COATING_RULES,
    pricing: makePaperPricing(PAPER_TYPES_POSTER, COATINGS),
    images: [
      { emoji: "🖼️", gradient: "from-sky-100 to-blue-200", label: "ด้านหน้า" },
      { emoji: "🧱", gradient: "from-blue-100 to-cyan-200", label: "ติดผนัง" },
    ],
  },
  {
    id: "mug-11oz",
    name: "MUG / แก้วมัค 11 oz",
    category: "home",
    price: 160,
    emoji: "☕",
    gradient: "from-sky-100 to-blue-200",
    rating: 4.9,
    sold: 1284,
    badge: "ขายดี",
    featured: true,
    description:
      "แก้วมัคเซรามิก 11 ออนซ์ พิมพ์ลายรอบใบด้วยระบบซับลิเมชัน สีสดไม่ลอก เข้าไมโครเวฟได้ เลือกเนื้อแก้วได้หลายแบบ",
    highlights: ["เซรามิกเกรดดี 11 oz", "พิมพ์รอบใบ 360°", "เข้าไมโครเวฟได้", "สีไม่ลอก ล้างได้ปกติ"],
    options: [
      {
        label: "ตัวเลือก",
        choices: [{ name: "สีใส" }, { name: "สีขาวเงา" }, { name: "สีขาวขุ่น" }],
      },
    ],
    images: [
      { emoji: "☕", gradient: "from-sky-100 to-blue-200", label: "ด้านหน้า" },
      { emoji: "🍵", gradient: "from-blue-100 to-indigo-200", label: "ด้านข้าง" },
    ],
  },
  {
    id: "tshirt-th",
    name: "T-SHIRT / เสื้อยืด",
    category: "fabric",
    price: 375,
    emoji: "👕",
    gradient: "from-emerald-100 to-teal-200",
    rating: 4.9,
    sold: 2431,
    featured: true,
    description:
      "เสื้อยืดเนื้อผ้าดี พิมพ์ลายคมชัดสีสด ใส่สบายระบายอากาศ มีไซซ์ให้เลือกครบตั้งแต่ S ถึง XXXL",
    highlights: ["เนื้อผ้านุ่มใส่สบาย", "พิมพ์ลายคมชัด ไม่ลอก", "มีไซซ์ S ถึง XXXL", "ซักเครื่องได้"],
    options: [
      {
        label: "ไซส์",
        choices: [{ name: "S" }, { name: "M" }, { name: "L" }, { name: "XL" }, { name: "XXL" }, { name: "XXXL" }],
      },
    ],
    images: [
      { emoji: "👕", gradient: "from-emerald-100 to-teal-200", label: "ด้านหน้า" },
      { emoji: "🧵", gradient: "from-teal-100 to-cyan-200", label: "เนื้อผ้า" },
    ],
  },
  {
    id: "casephone-clear",
    name: "CASE PHONE / เคสใสพรีเมี่ยม",
    category: "phone-gadget",
    price: 350,
    emoji: "📱",
    gradient: "from-violet-100 to-purple-200",
    rating: 4.8,
    sold: 1567,
    badge: "ขายดี",
    featured: true,
    description:
      "เคสใสพรีเมี่ยมพิมพ์ลายคมชัด สีสวยสดไม่ลอก รองรับไอโฟนหลายรุ่นตั้งแต่ iPhone 11 ถึง iPhone 16 Pro Max",
    highlights: ["เคสใสเนื้อพรีเมี่ยม", "รองรับ iPhone 21 รุ่น", "พิมพ์ลายคมชัด ไม่ลอก", "กันกระแทกรอบตัวเครื่อง"],
    options: [
      {
        label: "รุ่นเคสมือถือ",
        choices: [
          { name: "iPhone 11" }, { name: "iPhone 11 Pro" }, { name: "iPhone 12" }, { name: "iPhone 12 Mini" },
          { name: "iPhone 12 Pro Max" }, { name: "iPhone 13" }, { name: "iPhone 13 Mini" }, { name: "iPhone 13 Pro" },
          { name: "iPhone 13 Pro Max" }, { name: "iPhone 14" }, { name: "iPhone 14 Plus" }, { name: "iPhone 14 Pro" },
          { name: "iPhone 14 Pro Max" }, { name: "iPhone 15" }, { name: "iPhone 15 Plus" }, { name: "iPhone 15 Pro" },
          { name: "iPhone 15 Pro Max" }, { name: "iPhone 16" }, { name: "iPhone 16 Pro" }, { name: "iPhone 16 Plus" },
          { name: "iPhone 16 Pro Max" },
        ],
      },
    ],
    images: [
      { emoji: "📱", gradient: "from-violet-100 to-purple-200", label: "ด้านหลัง" },
      { emoji: "🌈", gradient: "from-pink-100 to-violet-200", label: "หลายลาย" },
    ],
  },
  {
    id: "canvasframe-th",
    name: "CANVAS FRAME / กรอบรูปแคนวาส",
    category: "home",
    price: 550,
    emoji: "🖼️",
    gradient: "from-orange-100 to-amber-200",
    rating: 4.9,
    sold: 876,
    featured: true,
    description:
      "กรอบรูปแคนวาสคุณภาพสูง พิมพ์ภาพคมชัด สีสด ไม่ซีดจาง ขึงบนเฟรมไม้อย่างดี แขวนได้ทันที",
    highlights: ["ผ้าใบแคนวาสเกรดแกลเลอรี", "มี 5 ขนาดให้เลือก", "พิมพ์ภาพคมชัดสีสด", "แขวนได้ทันที"],
    options: [
      {
        label: "ขนาด",
        choices: [
          { name: "30x30 | จตุรัส" }, { name: "30x40 | แนวตั้ง" },
          { name: "40x60 | แนวตั้ง" }, { name: "50x70 | แนวตั้ง" }, { name: "60x80 | แนวตั้ง" },
        ],
      },
    ],
    images: [
      { emoji: "🖼️", gradient: "from-orange-100 to-amber-200", label: "ด้านหน้า" },
      { emoji: "🛋️", gradient: "from-amber-100 to-yellow-200", label: "แขวนผนัง" },
    ],
  },
  {
    id: "broochbadge-th",
    name: "Brooch Badge / เข็มกลัดพลาสติก",
    category: "gifts",
    price: 270,
    emoji: "📍",
    gradient: "from-rose-100 to-pink-200",
    rating: 4.8,
    sold: 1876,
    featured: true,
    description:
      "เข็มกลัดพลาสติกพิมพ์ลาย เลือกทรงและการเคลือบได้หลากหลายแบบ รวมโฮโลแกรมและกลิตเตอร์ ขายเป็นชุด",
    highlights: ["ทรงกลม/หัวใจ หลายขนาด", "เคลือบให้เลือกถึง 12 แบบ", "ขายเป็นชุด 5-10 ชิ้น", "เข็มกลัดนิรภัยด้านหลัง"],
    options: [
      {
        label: "ขนาด & จำนวน",
        choices: [
          { name: "ทรงกลม 25 mm - ชุดละ 10 ชิ้น" },
          { name: "ทรงกลม 32 mm - ชุดละ 10 ชิ้น" },
          { name: "ทรงกลม 44 mm - ชุดละ 5 ชิ้น" },
          { name: "ทรงกลม 58 mm - ชุดละ 5 ชิ้น" },
          { name: "หัวใจ 57x53mm - ชุดละ 5 ชิ้น" },
        ],
      },
      {
        label: "การเคลือบ",
        choices: [
          { name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" },
          { name: "กลิสเตอร์" }, { name: "โฮโลแกรมดาว" }, { name: "เคลือบเหลี่ยม" },
          { name: "เคลือบหัวใจ" }, { name: "เคลือบรุ้ง" }, { name: "เคลือบจุด" },
          { name: "เคลือบทราย" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" },
        ],
      },
    ],
    images: [
      { emoji: "📍", gradient: "from-rose-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "🧷", gradient: "from-pink-100 to-fuchsia-200", label: "ด้านหลัง" },
    ],
  },
  {
    id: "tote-canvas",
    name: "TOTE / กระเป๋าผ้าดิบ",
    category: "fabric",
    price: 220,
    emoji: "👜",
    gradient: "from-teal-100 to-emerald-200",
    rating: 4.8,
    sold: 1103,
    featured: true,
    description:
      "กระเป๋าผ้าดิบพิมพ์ลาย มีหลายขนาด ทั้งแบบแบนและแบบมีก้น รับน้ำหนักได้ดี ใช้ซ้ำได้ทุกวัน",
    highlights: ["ผ้าดิบเนื้อหนา", "มี 5 ขนาดให้เลือก", "รองรับภาพไม่เกิน A4", "ซักได้ ใช้ซ้ำได้"],
    options: [
      {
        label: "ขนาด",
        choices: [
          { name: "35x40 cm (ภาพไม่เกิน A4)" },
          { name: "35x40x10 cm (ภาพไม่เกิน A4)" },
          { name: "40x30x10 cm (ภาพไม่เกิน A4)" },
          { name: "45x35x15 cm (ภาพไม่เกิน A4)" },
          { name: "46x37x12 cm (ภาพไม่เกิน A4)" },
        ],
      },
    ],
    images: [
      { emoji: "👜", gradient: "from-teal-100 to-emerald-200", label: "ด้านหน้า" },
      { emoji: "🌿", gradient: "from-emerald-100 to-green-200", label: "ตอนสะพาย" },
    ],
  },
  {
    id: "griptok-th",
    name: "GripTok & Magsafe Griptok",
    category: "phone-gadget",
    price: 80,
    emoji: "💍",
    gradient: "from-purple-100 to-fuchsia-200",
    rating: 4.7,
    sold: 528,
    badge: "ใหม่",
    description:
      "กริ๊บต๊อกติดหลังมือถือพิมพ์ลายของคุณ มีทั้งแบบธรรมดาและแบบ Magsafe ถือมือถนัดขึ้น ตั้งวางดูหนังได้",
    highlights: ["ทั้งแบบธรรมดา/Magsafe", "ถือมือถนัดขึ้น", "ใช้เป็นขาตั้งได้", "พิมพ์ลายคมชัด"],
    options: [
      {
        label: "ตัวเลือก",
        choices: [
          { name: "Griptok ทรงกลม ฐานสีดำ" },
          { name: "Griptok ทรงกลม ฐานสีขาว" },
          { name: "Griptok Magsafe ทรงกลม (A)" },
          { name: "Griptok Magsafe ทรงรี (A)" },
        ],
      },
    ],
    images: [
      { emoji: "💍", gradient: "from-purple-100 to-fuchsia-200", label: "ด้านหน้า" },
      { emoji: "📱", gradient: "from-fuchsia-100 to-pink-200", label: "ติดบนมือถือ" },
    ],
  },
  {
    id: "photocard-paper",
    name: "Photo Card / โฟโต้การ์ด",
    category: "card-photo",
    price: 130,
    emoji: "🎴",
    gradient: "from-pink-100 to-rose-200",
    rating: 4.8,
    sold: 640,
    description:
      "โฟโต้การ์ดกระดาษพิมพ์รูปคมชัด เลือกเคลือบได้หลายแบบรวมโฮโลแกรม พิมพ์ได้ทั้ง 1 และ 2 ด้าน สะสมหรือแลกกันสนุก",
    highlights: ["พิมพ์รูปคมชัดสีสด", "เคลือบได้ 6 แบบ รวมโฮโลแกรม", "พิมพ์ 1 หรือ 2 ด้าน"],
    options: [
      { label: "เคลือบ (เฉพาะด้านหน้า)", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "Dot Hologram" }, { name: "Hologram เหลี่ยม" }, { name: "Rainbow Hologram" }] },
      { label: "ตัวเลือก", choices: [{ name: "พิมพ์ 1 ด้าน" }, { name: "พิมพ์ 2 ด้าน" }] },
    ],
    images: [
      { emoji: "🎴", gradient: "from-pink-100 to-rose-200", label: "ด้านหน้า" },
      { emoji: "🌈", gradient: "from-fuchsia-100 to-pink-200", label: "โฮโลแกรม" },
    ],
  },
  {
    id: "shape-sticker",
    name: "SHAPE STICKER / สติ๊กเกอร์รูปทรง",
    category: "card-photo",
    price: 90,
    emoji: "✨",
    gradient: "from-cyan-100 to-sky-200",
    rating: 4.9,
    sold: 1420,
    badge: "ขายดี",
    description:
      "สติ๊กเกอร์ไดคัทรูปทรงต่างๆ ทั้งกลม หัวใจ ดาว ก้อนเมฆ ดอกไม้ กันน้ำ ติดทน เลือกเคลือบได้หลายแบบ",
    highlights: ["9 รูปทรงให้เลือก", "6 แผ่น/1A3", "เคลือบได้ 6 แบบ"],
    options: [
      { label: "ขนาด", choices: [
        { name: "ทรงกลม 5x5cm (4 ดวง) | 6 แผ่น/1A3" },
        { name: "ทรงกลม 3x3cm (9 ดวง) | 6 แผ่น/1A3" },
        { name: "ก้อนเมฆ 3.5x2.5cm (9 ดวง) | 6 แผ่น/1A3" },
        { name: "ดอกไม้ 5x5cm (4 ดวง) | 6 แผ่น/1A3" },
        { name: "กรอบรูป 3x3cm (9 ดวง) | 6 แผ่น/1A3" },
        { name: "หัวใจ 3.5x3.5cm (9 ดวง) | 6 แผ่น/1A3" },
        { name: "สี่เหลี่ยม 5x5cm (4 ดวง) | 6 แผ่น/1A3" },
        { name: "สี่เหลี่ยม 3x3cm (9 ดวง) | 6 แผ่น/1A3" },
        { name: "ดาว 5x4.78cm (4 ดวง) | 6 แผ่น/1A3" },
      ]},
      { label: "การเคลือบ", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "✨", gradient: "from-cyan-100 to-sky-200", label: "ตัวอย่าง" },
      { emoji: "💻", gradient: "from-slate-100 to-slate-200", label: "ติดใช้งาน" },
    ],
  },
  {
    id: "giveaway-sticker",
    name: "GIVEAWAY STICKER / สติ๊กเกอร์แจก",
    category: "card-photo",
    price: 90,
    emoji: "🎉",
    gradient: "from-sky-100 to-cyan-200",
    rating: 4.7,
    sold: 720,
    description:
      "สติ๊กเกอร์แจกจำนวนเยอะ 35 ดวง/แผ่น เหมาะทำของแถมงานอีเวนต์หรือแฟนคลับ เลือกรูปทรงและเคลือบได้",
    highlights: ["35 ดวง/แผ่น คุ้มมาก", "4 รูปทรงให้เลือก", "เคลือบได้ 6 แบบ"],
    options: [
      { label: "รูปแบบ", choices: [{ name: "ทรงกลม 4x4cm (35 ดวง)" }, { name: "หัวใจ 4x3.5cm (35 ดวง)" }, { name: "สี่เหลี่ยม 4x4cm (35 ดวง)" }, { name: "ดาว 4x4.2cm (35 ดวง)" }] },
      { label: "การเคลือบ", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "🎉", gradient: "from-sky-100 to-cyan-200", label: "ตัวอย่าง" },
      { emoji: "🎁", gradient: "from-cyan-100 to-teal-200", label: "ของแถม" },
    ],
  },
  {
    id: "polaroid-th",
    name: "POLAROID / โพลารอยด์",
    category: "card-photo",
    price: 90,
    emoji: "📷",
    gradient: "from-amber-100 to-yellow-200",
    rating: 4.8,
    sold: 830,
    description:
      "โพลารอยด์พิมพ์รูปสไตล์วินเทจ เลือกกระดาษได้หลายชนิด เคลือบสวยหลายแบบ เก็บความทรงจำน่ารักๆ",
    highlights: ["สไตล์โพลารอยด์วินเทจ", "กระดาษให้เลือก 8 ชนิด", "เคลือบสวยหลายแบบ"],
    options: [
      { label: "ชนิดกระดาษ", choices: PAPER_TYPES_POSTCARD },
      { label: "การเคลือบ", choices: [{ name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "📷", gradient: "from-amber-100 to-yellow-200", label: "ด้านหน้า" },
      { emoji: "🖼️", gradient: "from-yellow-100 to-orange-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "coaster-ceramic",
    name: "Coaster Ceramic / ที่รองแก้วหิน",
    category: "home",
    price: 120,
    emoji: "⭕",
    gradient: "from-stone-100 to-stone-200",
    rating: 4.7,
    sold: 410,
    description:
      "ที่รองแก้วแผ่นแร่หินธรรมชาติ ซึมซับน้ำดี พิมพ์ลายคมชัดสีไม่ซีด เลือกได้ 3 รูปทรง",
    highlights: ["แผ่นแร่หินซึมซับน้ำดี", "พิมพ์ลายคมชัด ไม่ซีด", "มี 3 รูปทรง"],
    options: [
      { label: "รูปทรง", choices: [{ name: "ทรงกลม" }, { name: "ทรงสี่เหลี่ยม" }, { name: "ทรงหกเหลี่ยม" }] },
    ],
    images: [
      { emoji: "⭕", gradient: "from-stone-100 to-stone-200", label: "ด้านหน้า" },
      { emoji: "☕", gradient: "from-amber-100 to-stone-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "blanket-th",
    name: "Blanket / ผ้าห่ม",
    category: "fabric",
    price: 340,
    emoji: "🧸",
    gradient: "from-green-100 to-emerald-200",
    rating: 4.9,
    sold: 507,
    badge: "ขายดี",
    featured: true,
    description:
      "ผ้าห่มพิมพ์ลายเต็มผืน เนื้อนุ่มอุ่นสบาย พิมพ์คมชัดสีติดทนไม่ซีด มีหลายขนาดตั้งแต่ผืนเล็กพกพาถึงขนาดเตียง",
    highlights: ["เนื้อนุ่มอุ่นสบาย", "พิมพ์เต็มผืน สีติดทน", "มี 4 ขนาด", "ซักเครื่องได้"],
    options: [
      { label: "ขนาด", choices: [{ name: "76x100 cm" }, { name: "100x100 cm" }, { name: "150x100 cm" }, { name: "150x200 cm" }] },
    ],
    images: [
      { emoji: "🧸", gradient: "from-green-100 to-emerald-200", label: "เต็มผืน" },
      { emoji: "🛌", gradient: "from-emerald-100 to-teal-200", label: "บนเตียง" },
    ],
  },
  {
    id: "round-mirror",
    name: "Round Mirror / กระจกทรงกลม",
    category: "gifts",
    price: 250,
    emoji: "🪞",
    gradient: "from-fuchsia-100 to-pink-200",
    rating: 4.7,
    sold: 445,
    description:
      "กระจกพกพาทรงกลมพิมพ์ลาย มีทั้งแบบพวงกุญแจและกระจกกลม ขายเป็นชุด เลือกเคลือบได้หลายแบบ",
    highlights: ["แบบพวงกุญแจ/กระจกกลม", "ขายเป็นชุด 5 ชิ้น", "เคลือบได้ 6 แบบ"],
    options: [
      { label: "ขนาด", choices: [{ name: "58mm (พวงกุญแจกระจก) - ชุดละ 5 ชิ้น" }, { name: "58mm (กระจกกลม) - ชุดละ 5 ชิ้น" }, { name: "75mm (กระจกกลม) - ชุดละ 5 ชิ้น" }] },
      { label: "การเคลือบ", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Starduct" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "🪞", gradient: "from-fuchsia-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "💄", gradient: "from-pink-100 to-rose-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "photocard-pet",
    name: "Photo Card PET / โฟโต้การ์ด PET",
    category: "card-photo",
    price: 240,
    emoji: "🎴",
    gradient: "from-cyan-100 to-sky-200",
    rating: 4.8,
    sold: 520,
    description:
      "โฟโต้การ์ดเนื้อพลาสติก PET กันน้ำ ทนทานกว่ากระดาษ เลือกพลาสติกขาว/ใส พิมพ์ได้ 1-2 ด้าน เหมาะทำการ์ดสะสม",
    highlights: ["เนื้อ PET กันน้ำ ทนทาน", "เลือกพลาสติกขาว/ใส", "พิมพ์ 1 หรือ 2 ด้าน"],
    options: [
      { label: "ชนิด PET", choices: [{ name: "พลาสติกขาว" }, { name: "พลาสติกใส" }] },
      { label: "ตัวเลือก", choices: [{ name: "พิมพ์ 1 ด้าน" }, { name: "พิมพ์ 2 ด้าน" }] },
    ],
    images: [
      { emoji: "🎴", gradient: "from-cyan-100 to-sky-200", label: "ด้านหน้า" },
      { emoji: "💧", gradient: "from-sky-100 to-blue-200", label: "กันน้ำ" },
    ],
  },
  {
    id: "photocard-pvc",
    name: "Photocard PVC / บัตรพลาสติก",
    category: "card-photo",
    price: 33,
    emoji: "💳",
    gradient: "from-blue-100 to-indigo-200",
    rating: 4.7,
    sold: 610,
    description:
      "โฟโต้การ์ด PVC เนื้อบัตรพลาสติกแข็งแรง เลือกบัตรขาวหรือใส วางได้ทั้งแนวตั้ง-นอน พิมพ์ 1-2 ด้าน",
    highlights: ["เนื้อบัตร PVC แข็งแรง", "เลือกขาว/ใส", "แนวตั้ง/แนวนอน · พิมพ์ 1-2 ด้าน"],
    options: [
      { label: "ชนิด PVC", choices: [{ name: "บัตรพลาสติกขาว" }, { name: "บัตรพลาสติกใส (สกรีนบน)" }] },
      { label: "ตำแหน่ง", choices: [{ name: "แนวตั้ง" }, { name: "แนวนอน" }] },
      { label: "ตัวเลือก", choices: [{ name: "พิมพ์ 1 ด้าน" }, { name: "พิมพ์ 2 ด้าน" }] },
    ],
    images: [
      { emoji: "💳", gradient: "from-blue-100 to-indigo-200", label: "ด้านหน้า" },
      { emoji: "🪪", gradient: "from-indigo-100 to-violet-200", label: "ด้านหลัง" },
    ],
  },
  {
    id: "photobooth-sticker",
    name: "PHOTO BOOTH (สติ๊กเกอร์)",
    category: "card-photo",
    price: 90,
    emoji: "📸",
    gradient: "from-pink-100 to-rose-200",
    rating: 4.8,
    sold: 480,
    description:
      "โฟโต้บูธสตริปส์แบบสติ๊กเกอร์ พิมพ์ภาพต่อเนื่องสไตล์ตู้ถ่ายรูป เลือกขนาดและเคลือบได้ ติดสะสมน่ารัก",
    highlights: ["สไตล์ตู้โฟโต้บูธ", "2 ขนาดให้เลือก", "เคลือบได้ 6 แบบ"],
    options: [
      { label: "ขนาด", choices: [{ name: "4.2x12cm | 20 ใบ" }, { name: "5x15.2cm | 12 ใบ" }] },
      { label: "การเคลือบ", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "📸", gradient: "from-pink-100 to-rose-200", label: "สติ๊กเกอร์" },
      { emoji: "🎞️", gradient: "from-rose-100 to-pink-200", label: "สตริปส์" },
    ],
  },
  {
    id: "photobooth-paper",
    name: "PHOTO BOOTH (กระดาษ)",
    category: "card-photo",
    price: 90,
    emoji: "📸",
    gradient: "from-amber-100 to-orange-200",
    rating: 4.8,
    sold: 430,
    description:
      "โฟโต้บูธสตริปส์แบบกระดาษ เลือกกระดาษได้หลายชนิด พิมพ์ภาพต่อเนื่องสไตล์ตู้ถ่ายรูป เคลือบสวยหลายแบบ",
    highlights: ["กระดาษให้เลือก 8 ชนิด", "2 ขนาดให้เลือก", "เคลือบสวยหลายแบบ"],
    options: [
      { label: "ขนาด", choices: [{ name: "4.2x12cm | 20 ใบ" }, { name: "5x15.2cm | 12 ใบ" }] },
      { label: "ชนิดกระดาษ", choices: PAPER_TYPES_POSTCARD },
      { label: "การเคลือบ", choices: [{ name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "📸", gradient: "from-amber-100 to-orange-200", label: "กระดาษ" },
      { emoji: "🎞️", gradient: "from-orange-100 to-amber-200", label: "สตริปส์" },
    ],
  },
  {
    id: "card-sticker",
    name: "CARD STICKER / สติ๊กเกอร์ติดบัตร",
    category: "card-photo",
    price: 90,
    emoji: "💳",
    gradient: "from-violet-100 to-purple-200",
    rating: 4.7,
    sold: 560,
    description:
      "สติ๊กเกอร์ติดบัตร (BTS/บัตรประชาชน) พิมพ์ลายคมชัด กันน้ำ เลือกการตัดมุมมน/เหลี่ยม และเคลือบได้หลายแบบ",
    highlights: ["ติดบัตรได้พอดี กันน้ำ", "ตัดมุมมน/มุมเหลี่ยม", "เคลือบได้ 6 แบบ"],
    options: [
      { label: "การตัด", choices: [{ name: "แบบมุมมน" }, { name: "แบบมุมเหลี่ยม" }] },
      { label: "การเคลือบ", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "💳", gradient: "from-violet-100 to-purple-200", label: "ด้านหน้า" },
      { emoji: "🏷️", gradient: "from-purple-100 to-fuchsia-200", label: "ติดบัตร" },
    ],
  },
  {
    id: "banner-th",
    name: "Banner / แบนเนอร์",
    category: "card-photo",
    price: 75,
    emoji: "🚩",
    gradient: "from-orange-100 to-red-100",
    rating: 4.6,
    sold: 240,
    description:
      "แบนเนอร์/สโลแกนพิมพ์กระดาษอาร์ตมัน สีคมชัด เลือกความหนากระดาษและเคลือบได้ เหมาะทำป้ายเชียร์หรือของแฟนคลับ",
    highlights: ["กระดาษอาร์ตมัน 3 ความหนา", "พิมพ์สีคมชัด", "เคลือบ/โฮโลแกรมได้"],
    options: [
      { label: "ชนิดกระดาษ", choices: [{ name: "อาร์ตมัน 157 แกรม" }, { name: "อาร์ตมัน 210 แกรม" }, { name: "อาร์ตมัน 300 แกรม" }] },
      { label: "เคลือบ (เฉพาะด้านหน้า)", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "กลิสเตอร์" }, { name: "โฮโลแกรมดาว" }, { name: "โฮโลแกรมจุด" }] },
    ],
    images: [
      { emoji: "🚩", gradient: "from-orange-100 to-red-100", label: "ด้านหน้า" },
      { emoji: "📣", gradient: "from-amber-100 to-orange-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "packaging-paper",
    name: "PACKAGING PAPER / กระดาษรองหลัง",
    category: "card-photo",
    price: 45,
    emoji: "📦",
    gradient: "from-stone-100 to-stone-200",
    rating: 4.6,
    sold: 190,
    description:
      "แพ็คเกจกระดาษรองหลังพิมพ์ลาย เลือกได้หลายขนาด เหมาะรองหลังการ์ด/สินค้าเพื่อเพิ่มความสวยงามและแบรนด์ดิ้ง",
    highlights: ["มี 7 ขนาดให้เลือก", "พิมพ์ลายคมชัด", "เพิ่มแบรนด์ดิ้งให้แพ็กเกจ"],
    options: [
      { label: "ขนาด", choices: [
        { name: "9x9cm (15 ใบ/1A3)" }, { name: "7x7cm (24 ใบ/1A3)" }, { name: "6.3x10.5cm (14 ใบ/1A3)" },
        { name: "7.5x10cm (12 ใบ/1A3)" }, { name: "9x15cm (6 ใบ/1A3)" }, { name: "10x15cm (5 ใบ/1A3)" },
        { name: "14x20.5cm (4 ใบ/1A3)" },
      ]},
    ],
    images: [
      { emoji: "📦", gradient: "from-stone-100 to-stone-200", label: "ตัวอย่าง" },
      { emoji: "🎀", gradient: "from-rose-100 to-pink-200", label: "รองหลังการ์ด" },
    ],
  },
  {
    id: "calendar-desktop",
    name: "CALENDAR DESKTOP / ปฏิทินตั้งโต๊ะ",
    category: "card-photo",
    price: 220,
    emoji: "📅",
    gradient: "from-sky-100 to-blue-200",
    rating: 4.8,
    sold: 690,
    badge: "ขายดี",
    featured: true,
    description:
      "ปฏิทินตั้งโต๊ะพิมพ์ลายของคุณ 14 หน้า เลือกปีและแนวตั้ง/นอนได้ พิมพ์คมชัด ของพรีเมียมสำหรับแจกหรือใช้เอง",
    highlights: ["14 หน้า 8 แผ่น", "เลือกแนวตั้ง/นอน", "เลือกปี ค.ศ. ได้", "เคลือบได้ 6 แบบ"],
    options: [
      { label: "ขนาด", choices: [{ name: "6x8 นิ้ว (แนวตั้ง) | 14 หน้า" }, { name: "6x8 นิ้ว (แนวนอน) | 14 หน้า" }] },
      { label: "เลือกปี (ค.ศ.)", choices: [{ name: "ปี ค.ศ. 2026" }, { name: "ปี ค.ศ. 2027" }] },
      { label: "การเคลือบ", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "📅", gradient: "from-sky-100 to-blue-200", label: "ตั้งโต๊ะ" },
      { emoji: "🗓️", gradient: "from-blue-100 to-indigo-200", label: "รายเดือน" },
    ],
  },
  {
    id: "calendar-canvas",
    name: "CANVAS CALENDAR / ปฏิทินผ้าแคนวาส",
    category: "card-photo",
    price: 200,
    emoji: "🗓️",
    gradient: "from-emerald-100 to-teal-200",
    rating: 4.7,
    sold: 310,
    description:
      "ปฏิทินผ้าแคนวาสพิมพ์ลาย เลือกระบบพิมพ์ Sublimation หรือ UV เลือกปีได้ถึง 5 ปี ของแต่งบ้านสไตล์พรีเมียม",
    highlights: ["ผ้าแคนวาสเนื้อดี", "พิมพ์ Sublimation/UV", "เลือกปีได้ถึง 5 ปี"],
    options: [
      { label: "การพิมพ์", choices: [{ name: "Sublimation" }, { name: "UV Printing" }] },
      { label: "เลือกปี (ค.ศ.)", choices: [{ name: "2026" }, { name: "2027" }, { name: "2028" }, { name: "2029" }, { name: "2030" }] },
    ],
    images: [
      { emoji: "🗓️", gradient: "from-emerald-100 to-teal-200", label: "ด้านหน้า" },
      { emoji: "🖼️", gradient: "from-teal-100 to-cyan-200", label: "แขวนผนัง" },
    ],
  },
  {
    id: "calendar-acrylic",
    name: "CALENDAR ACRYLIC / ปฏิทินอะคริลิค",
    category: "card-photo",
    price: 190,
    emoji: "📆",
    gradient: "from-violet-100 to-purple-200",
    rating: 4.7,
    sold: 280,
    badge: "ใหม่",
    description:
      "ปฏิทินอะคริลิคใสพรีเมียม เลือกขนาด A6/A5/A4 แนวตั้ง-นอน และปีได้ถึง 5 ปี วางโต๊ะสวยหรู",
    highlights: ["อะคริลิคใสพรีเมียม", "ขนาด A6/A5/A4", "แนวตั้ง/นอน · เลือกปีได้ 5 ปี"],
    options: [
      { label: "เลือกปี (ค.ศ.)", choices: [{ name: "2026" }, { name: "2027" }, { name: "2028" }, { name: "2029" }, { name: "2030" }] },
      { label: "ตำแหน่ง", choices: [{ name: "แนวตั้ง" }, { name: "แนวนอน" }] },
      { label: "ขนาด", choices: [{ name: "A6" }, { name: "A5" }, { name: "A4" }] },
    ],
    images: [
      { emoji: "📆", gradient: "from-violet-100 to-purple-200", label: "ด้านหน้า" },
      { emoji: "🪟", gradient: "from-purple-100 to-fuchsia-200", label: "อะคริลิคใส" },
    ],
  },
  {
    id: "calendar-postcard",
    name: "CALENDAR POSCARD / โปสการ์ดปฏิทิน",
    category: "card-photo",
    price: 90,
    emoji: "📅",
    gradient: "from-rose-100 to-pink-200",
    rating: 4.8,
    sold: 350,
    description:
      "โปสการ์ดปฏิทิน พิมพ์ปฏิทินบนโปสการ์ด เลือกรายปี/รายเดือน กระดาษหลายชนิด เคลือบได้ ทำแจกหรือสะสม",
    highlights: ["รายปี/รายเดือน", "กระดาษให้เลือก 8 ชนิด", "พิมพ์ 1-2 ด้าน · เคลือบได้"],
    options: [
      { label: "ปฏิทิน", choices: [{ name: "ปฏิทินรายปี" }, { name: "ปฏิทินรายเดือน" }] },
      { label: "ขนาด", choices: [{ name: "4\"x6\" | แนวนอน (8 ใบ/ชุด)" }, { name: "4\"x6\" | แนวตั้ง (8 ใบ/ชุด)" }] },
      { label: "เลือกปี (ค.ศ.)", choices: [{ name: "ปี ค.ศ. 2026" }, { name: "ปี ค.ศ. 2027" }] },
      { label: "ชนิดกระดาษ", choices: PAPER_TYPES_POSTCARD },
      { label: "การเคลือบ", choices: [{ name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
      { label: "ตัวเลือก", choices: [{ name: "พิมพ์ 1 ด้าน" }, { name: "พิมพ์ 2 ด้าน" }] },
    ],
    images: [
      { emoji: "📅", gradient: "from-rose-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "🖋️", gradient: "from-pink-100 to-rose-200", label: "ด้านหลัง" },
    ],
  },
  {
    id: "calendar-photocard",
    name: "CALENDAR PHOTOCARD / โฟโต้การ์ดปฏิทิน",
    category: "card-photo",
    price: 140,
    emoji: "🗓️",
    gradient: "from-cyan-100 to-sky-200",
    rating: 4.8,
    sold: 300,
    description:
      "โฟโต้การ์ดปฏิทิน พิมพ์ปฏิทินสไตล์การ์ดสะสม เลือกกระดาษหลายชนิดและเคลือบสวย เลือกปีเริ่มต้นได้",
    highlights: ["สไตล์การ์ดสะสม", "กระดาษให้เลือก 8 ชนิด", "เลือกปีเริ่มต้น · เคลือบได้"],
    options: [
      { label: "เริ่มต้นเดือน", choices: [{ name: "ปี ค.ศ. 2026" }, { name: "ปี ค.ศ. 2027" }] },
      { label: "ชนิดกระดาษ", choices: PAPER_TYPES_POSTCARD },
      { label: "การเคลือบ", choices: [{ name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "🗓️", gradient: "from-cyan-100 to-sky-200", label: "ด้านหน้า" },
      { emoji: "🎴", gradient: "from-sky-100 to-blue-200", label: "การ์ดสะสม" },
    ],
  },
  {
    id: "shikishi",
    name: "Shikishi / ชิกิชิ",
    category: "card-photo",
    price: 80,
    emoji: "🎨",
    gradient: "from-amber-100 to-yellow-200",
    rating: 4.7,
    sold: 340,
    description:
      "ชิกิชิ (การ์ดลายเซ็น/รูปวาด) พิมพ์ลายคุณภาพสูง มีหลายขนาด A7-A3 เลือกเคลือบได้ เหมาะสะสมหรือทำของแฟนคลับ",
    highlights: ["ขนาด A7 ถึง A3", "พิมพ์ลายคมชัด", "เคลือบได้ 6 แบบ"],
    options: [
      { label: "ขนาด", choices: [{ name: "A7" }, { name: "A6" }, { name: "A5" }, { name: "A4" }, { name: "A3" }] },
      { label: "การเคลือบ", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "🎨", gradient: "from-amber-100 to-yellow-200", label: "ด้านหน้า" },
      { emoji: "🖼️", gradient: "from-yellow-100 to-orange-200", label: "ตอนตั้งโชว์" },
    ],
  },
  {
    id: "cup-sleeve",
    name: "Cup Sleeve / ปลอกสวมแก้วกระดาษ",
    category: "card-photo",
    price: 45,
    emoji: "☕",
    gradient: "from-orange-100 to-amber-200",
    rating: 4.6,
    sold: 280,
    description:
      "ปลอกสวมแก้วกระดาษพิมพ์ลาย กันร้อน/เย็น มีหลายขนาด เหมาะทำของแบรนด์ร้านกาแฟหรือของแฟนคลับ",
    highlights: ["กันร้อน/เย็น", "มี 3 ขนาด", "พิมพ์ลายคมชัด ทนทาน"],
    options: [
      { label: "ขนาด", choices: [{ name: "27.7x7.6cm (6 ใบ/1A3)" }, { name: "35.2x7.8cm (4 ใบ/1A3)" }, { name: "42x9.3cm (3 ใบ/1A3)" }] },
    ],
    images: [
      { emoji: "☕", gradient: "from-orange-100 to-amber-200", label: "ตัวอย่าง" },
      { emoji: "🥤", gradient: "from-amber-100 to-yellow-200", label: "ตอนสวมแก้ว" },
    ],
  },
  {
    id: "notebook",
    name: "NOTEBOOK / สมุดโน๊ต",
    category: "card-photo",
    price: 99,
    emoji: "📓",
    gradient: "from-emerald-100 to-teal-200",
    rating: 4.7,
    sold: 410,
    description:
      "สมุดโน๊ตพิมพ์ปกลายของคุณ มีขนาด A5/A6/A7 เลือกเคลือบปกได้ ใช้เองหรือทำของขวัญ ของแจก",
    highlights: ["ขนาด A5/A6/A7", "พิมพ์ปกลายเอง", "เคลือบปกได้ 6 แบบ"],
    options: [
      { label: "ขนาด", choices: [{ name: "Notebook A5" }, { name: "Notebook A6" }, { name: "Notebook A7" }] },
      { label: "การเคลือบ", choices: [{ name: "ไม่เคลือบ" }, { name: "เคลือบด้าน" }, { name: "เคลือบเงา" }, { name: "เคลือบกลิสเตอร์" }, { name: "เคลือบ Stardust" }, { name: "เคลือบ Dust" }] },
    ],
    images: [
      { emoji: "📓", gradient: "from-emerald-100 to-teal-200", label: "ปกหน้า" },
      { emoji: "✏️", gradient: "from-teal-100 to-cyan-200", label: "ด้านใน" },
    ],
  },
  {
    id: "mini-folder",
    name: "MINI FOLDER / แฟ้มจิ๋ว",
    category: "card-photo",
    price: 59,
    emoji: "📁",
    gradient: "from-purple-100 to-fuchsia-200",
    rating: 4.6,
    sold: 260,
    badge: "ใหม่",
    description:
      "แฟ้มจิ๋วพลาสติกใสพิมพ์ลาย น่ารักพกพาสะดวก เก็บการ์ด/สติ๊กเกอร์ เลือกวัสดุใสหรือกลิตเตอร์ใส",
    highlights: ["พลาสติกใส/กลิตเตอร์ใส", "2 ขนาดให้เลือก", "เก็บการ์ด/สติ๊กเกอร์"],
    options: [
      { label: "ขนาด", choices: [{ name: "4.5x4.5x2cm" }, { name: "4.8x6.2x2cm" }] },
      { label: "วัสดุ", choices: [{ name: "พลาสติกใส" }, { name: "พลาสติกกลิสเตอร์ใส" }] },
    ],
    images: [
      { emoji: "📁", gradient: "from-purple-100 to-fuchsia-200", label: "ด้านหน้า" },
      { emoji: "✨", gradient: "from-fuchsia-100 to-pink-200", label: "กลิตเตอร์" },
    ],
  },
  {
    id: "wall-poster-hang",
    name: "Wall Poster Hang / โปสเตอร์แขวนผนัง",
    category: "card-photo",
    price: 300,
    emoji: "🖼️",
    gradient: "from-sky-100 to-blue-200",
    rating: 4.7,
    sold: 190,
    description:
      "โปสเตอร์แขวนผนังพร้อมราวแขวน พิมพ์ภาพคมชัด มีขนาดใหญ่ A3-A0 เลือกผิวเงา/ด้าน แต่งห้องสไตล์คาเฟ่",
    highlights: ["พร้อมราวแขวน", "ขนาด A3 ถึง A0", "ผิวเงา/ด้าน"],
    options: [
      { label: "ขนาด", choices: [{ name: "A3" }, { name: "A2" }, { name: "A1" }, { name: "A0" }] },
      { label: "ผิว", choices: [{ name: "ผิวเงา" }, { name: "ผิวด้าน" }] },
    ],
    images: [
      { emoji: "🖼️", gradient: "from-sky-100 to-blue-200", label: "ด้านหน้า" },
      { emoji: "🧱", gradient: "from-blue-100 to-cyan-200", label: "แขวนผนัง" },
    ],
  },
  {
    id: "folding-mirror",
    name: "Folding Mirror / กระจกพับ",
    category: "gifts",
    price: 100,
    emoji: "🪞",
    gradient: "from-fuchsia-100 to-pink-200",
    rating: 4.7,
    sold: 380,
    description:
      "กระจกพับพกพาพิมพ์ลาย มีทั้งทรงกลม หัวใจ สี่เหลี่ยม พิมพ์ได้ 1-2 ด้าน พกใส่กระเป๋าสะดวก",
    highlights: ["ทรงกลม/หัวใจ/สี่เหลี่ยม", "พิมพ์ 1 หรือ 2 ด้าน", "พกพาสะดวก"],
    options: [
      { label: "ขนาด", choices: [{ name: "70mm (ทรงกลม)" }, { name: "70x70mm (ทรงหัวใจ)" }, { name: "61x95mm (ทรงสี่เหลี่ยม)" }] },
      { label: "รูปแบบการพิมพ์", choices: [{ name: "พิมพ์ 1 ด้าน" }, { name: "พิมพ์ 2 ด้าน" }] },
    ],
    pricing: {
      unit: "ชิ้น",
      driverLabels: ["ขนาด"],
      tiers: [
        { upTo: 10, label: "1-10 ชิ้น" },
        { upTo: 29, label: "11-29 ชิ้น" },
        { upTo: 49, label: "30-49 ชิ้น" },
        { upTo: 99, label: "50-99 ชิ้น" },
        { upTo: 499, label: "100-499 ชิ้น" },
        { upTo: 999, label: "500-999 ชิ้น" },
        { upTo: 4999, label: "1000-4999 ชิ้น" },
        { upTo: null, label: "5000 ชิ้นขึ้นไป" },
      ],
      cells: {
        "70mm (ทรงกลม)": [80, 60, 55, 50, 40, 30, 25, 20],
        "70x70mm (ทรงหัวใจ)": [90, 65, 60, 55, 45, 35, 30, 25],
        "61x95mm (ทรงสี่เหลี่ยม)": [90, 65, 60, 55, 45, 35, 30, 25],
      },
    },
    images: [
      { emoji: "🪞", gradient: "from-fuchsia-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "💄", gradient: "from-pink-100 to-rose-200", label: "เปิดใช้งาน" },
    ],
  },
  {
    id: "handheld-mirror",
    name: "Mirror / กระจกถือ",
    category: "gifts",
    price: 350,
    emoji: "🪞",
    gradient: "from-rose-100 to-pink-200",
    rating: 4.7,
    sold: 210,
    description:
      "กระจกถือด้ามจับพิมพ์ลาย มีทรงสี่เหลี่ยมและหัวใจ งานพรีเมียม เหมาะเป็นของขวัญหรือของสะสม",
    highlights: ["ทรงสี่เหลี่ยม/หัวใจ", "ด้ามจับถือถนัด", "งานพรีเมียม"],
    options: [
      { label: "รูปแบบ", choices: [{ name: "ทรงสี่เหลี่ยม" }, { name: "ทรงหัวใจ" }] },
    ],
    images: [
      { emoji: "🪞", gradient: "from-rose-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "💖", gradient: "from-pink-100 to-fuchsia-200", label: "ด้านหลัง" },
    ],
  },
  {
    id: "door-hanger",
    name: "Door Hanger / ป้ายแขวนประตู",
    category: "gifts",
    price: 250,
    emoji: "🚪",
    gradient: "from-amber-100 to-orange-200",
    rating: 4.6,
    sold: 180,
    description:
      "ป้ายแขวนประตูพิมพ์ลาย เลือกวัสดุอะคริลิค MDF หรือกระดาษอาร์ต แขวนหน้าห้องเพิ่มสไตล์",
    highlights: ["อะคริลิค/MDF/กระดาษ", "พิมพ์ลายคมชัด", "แขวนตกแต่งหน้าห้อง"],
    options: [
      { label: "เลือกวัสดุ", choices: [{ name: "อะคริลิค สไตล์ 1" }, { name: "อะคริลิค สไตล์ 2" }, { name: "MDF" }, { name: "กระดาษอาร์ต 300 แกรม" }] },
    ],
    images: [
      { emoji: "🚪", gradient: "from-amber-100 to-orange-200", label: "ด้านหน้า" },
      { emoji: "🏠", gradient: "from-orange-100 to-amber-200", label: "แขวนประตู" },
    ],
  },
  {
    id: "scrunchy",
    name: "Scrunchy / ยางรัดผมผ้าซาติน",
    category: "gifts",
    price: 90,
    emoji: "💇",
    gradient: "from-pink-100 to-rose-200",
    rating: 4.7,
    sold: 320,
    description:
      "ยางรัดผมผ้าซาตินพิมพ์ลาย เนื้อนุ่มไม่ทำร้ายเส้นผม ของพรีเมียมน่ารัก ทำแจกหรือขายได้",
    highlights: ["ผ้าซาตินเนื้อนุ่ม", "พิมพ์ลายสวย", "ไม่ทำร้ายเส้นผม"],
    options: [],
    images: [
      { emoji: "💇", gradient: "from-pink-100 to-rose-200", label: "ด้านหน้า" },
      { emoji: "🎀", gradient: "from-rose-100 to-pink-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "clip-pouch",
    name: "CLIP POUCH / กระเป๋าต๊อบแต๊บ",
    category: "gifts",
    price: 89,
    emoji: "👝",
    gradient: "from-purple-100 to-fuchsia-200",
    rating: 4.7,
    sold: 410,
    description:
      "กระเป๋าคลิปต๊อบแต๊บพิมพ์ลาย เปิด-ปิดด้วยคลิปสปริง พกพาสะดวก มีหลายขนาด เก็บของจุกจิกน่ารัก",
    highlights: ["คลิปสปริงเปิด-ปิดง่าย", "มี 4 ขนาด", "พิมพ์ลายคมชัด"],
    options: [
      { label: "ขนาด", choices: [{ name: "9.5x9cm" }, { name: "11.5x10cm" }, { name: "14.5x10cm" }, { name: "17.5x14.5cm" }] },
    ],
    images: [
      { emoji: "👝", gradient: "from-purple-100 to-fuchsia-200", label: "ด้านหน้า" },
      { emoji: "✨", gradient: "from-fuchsia-100 to-pink-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "passport-case",
    name: "PASSPORT CASE / ปกพาสปอร์ต",
    category: "gifts",
    price: 150,
    emoji: "🛂",
    gradient: "from-blue-100 to-indigo-200",
    rating: 4.6,
    sold: 240,
    description:
      "ปกพาสปอร์ตพิมพ์ลาย ปกป้องเล่มพาสปอร์ต พกพาไปเที่ยวสวยเก๋ เป็นของขวัญนักเดินทางได้ดี",
    highlights: ["ปกป้องพาสปอร์ต", "พิมพ์ลายคมชัด", "ของขวัญนักเดินทาง"],
    options: [],
    images: [
      { emoji: "🛂", gradient: "from-blue-100 to-indigo-200", label: "ด้านหน้า" },
      { emoji: "✈️", gradient: "from-indigo-100 to-violet-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "sleep-mask",
    name: "SLEEP MASK / ผ้าปิดตา",
    category: "gifts",
    price: 109,
    emoji: "😴",
    gradient: "from-violet-100 to-purple-200",
    rating: 4.7,
    sold: 260,
    description:
      "ผ้าปิดตาพิมพ์ลาย ตัดแสงช่วยให้หลับลึก สัมผัสนุ่มไม่ระคายเคือง ของขวัญน่ารักสำหรับคนรักการนอน",
    highlights: ["ตัดแสง หลับลึก", "สัมผัสนุ่ม ไม่ระคายเคือง", "พิมพ์ลายน่ารัก"],
    options: [],
    images: [
      { emoji: "😴", gradient: "from-violet-100 to-purple-200", label: "ด้านหน้า" },
      { emoji: "🌙", gradient: "from-purple-100 to-indigo-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "drawstring-bag",
    name: "DRAWSTRING BAG / ถุงผ้าหูรูด",
    category: "gifts",
    price: 120,
    emoji: "🎒",
    gradient: "from-teal-100 to-emerald-200",
    rating: 4.7,
    sold: 300,
    description:
      "ถุงผ้าหูรูดพิมพ์ลาย ปิดด้วยเชือกหูรูด ใส่ของสะพายสะดวก ทำของแจกหรือของแฟนคลับได้ดี",
    highlights: ["เชือกหูรูดปิดง่าย", "พิมพ์ลายเต็มใบ", "สะพายสะดวก"],
    options: [],
    images: [
      { emoji: "🎒", gradient: "from-teal-100 to-emerald-200", label: "ด้านหน้า" },
      { emoji: "🎁", gradient: "from-emerald-100 to-green-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "hologram-bag",
    name: "HOLOGRAM BAG / กระเป๋าโฮโลแกรม",
    category: "gifts",
    price: 150,
    emoji: "🌈",
    gradient: "from-fuchsia-100 to-purple-200",
    rating: 4.7,
    sold: 280,
    badge: "ใหม่",
    description:
      "กระเป๋า PVC ใสโฮโลแกรมพิมพ์ลาย วิ้งสะท้อนรุ้งสวย เลือกสีซิปขาว/ดำ ใส่ของจุกจิกหรือเครื่องสำอาง",
    highlights: ["PVC ใสโฮโลแกรมวิ้ง", "เลือกซิปขาว/ดำ", "พิมพ์ลายคมชัด"],
    options: [
      { label: "ตัวเลือก", choices: [{ name: "ซิปสีขาว" }, { name: "ซิปสีดำ" }] },
    ],
    images: [
      { emoji: "🌈", gradient: "from-fuchsia-100 to-purple-200", label: "ด้านหน้า" },
      { emoji: "👛", gradient: "from-purple-100 to-fuchsia-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "phone-hanging",
    name: "Phone Hanging / สายคล้องมือถือ",
    category: "phone-gadget",
    price: 79,
    emoji: "📿",
    gradient: "from-violet-100 to-purple-200",
    rating: 4.7,
    sold: 640,
    description:
      "สายคล้องมือถือพิมพ์ลาย (1 เซ็ต 2 ชิ้น) ติดกับเคสคล้องคอ/สะพายได้ พกมือถือสะดวก มือว่างขึ้น",
    highlights: ["1 เซ็ต = 2 ชิ้น", "คล้องคอ/สะพายได้", "พิมพ์ลายคมชัด"],
    options: [
      { label: "ขนาดสินค้า", choices: [{ name: "4x5.4cm (2 ชิ้น/เซ็ต)" }, { name: "6x12.8cm (2 ชิ้น/เซ็ต)" }] },
    ],
    images: [
      { emoji: "📿", gradient: "from-violet-100 to-purple-200", label: "ด้านหน้า" },
      { emoji: "📱", gradient: "from-purple-100 to-fuchsia-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "cardholder-white",
    name: "CARDHOLDER (White) / การ์ดใส่บัตร (พลาสติกขาว)",
    category: "phone-gadget",
    price: 130,
    emoji: "💳",
    gradient: "from-blue-100 to-indigo-200",
    rating: 4.7,
    sold: 380,
    description:
      "การ์ดใส่บัตรพลาสติกขาวพิมพ์ลาย มีสายคล้อง เลือกสกรีนสายได้ พกบัตรสวยเก๋ ทนทาน",
    highlights: ["พลาสติกขาวทนทาน", "มีสายคล้อง", "เลือกสกรีนสายได้"],
    options: [
      { label: "รูปแบบการพิมพ์", choices: [{ name: "ไม่สกรีนสาย" }, { name: "สกรีนสาย" }] },
    ],
    images: [
      { emoji: "💳", gradient: "from-blue-100 to-indigo-200", label: "ด้านหน้า" },
      { emoji: "🎫", gradient: "from-indigo-100 to-violet-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "cardholder-clear",
    name: "CARD HOLDER / การ์ดโฮลเดอร์ (พลาสติกใส)",
    category: "phone-gadget",
    price: 100,
    emoji: "🪪",
    gradient: "from-cyan-100 to-sky-200",
    rating: 4.7,
    sold: 420,
    description:
      "การ์ดโฮลเดอร์พลาสติกใสพิมพ์ลาย ใสไม่ขุ่นมัว พิมพ์ได้ 1-2 ด้าน เก็บบัตรหรือโฟโต้การ์ดสวยใส",
    highlights: ["พลาสติกใสไม่ขุ่น", "พิมพ์ 1-2 ด้าน", "โชว์การ์ดสวย"],
    options: [
      { label: "รูปแบบการพิมพ์", choices: [{ name: "พิมพ์ 1 ด้าน" }, { name: "พิมพ์ 2 ด้าน" }] },
    ],
    images: [
      { emoji: "🪪", gradient: "from-cyan-100 to-sky-200", label: "ด้านหน้า" },
      { emoji: "🎴", gradient: "from-sky-100 to-blue-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "magsafe-wallet",
    name: "Magsafe Wallet / กระเป๋าใส่การ์ด Magsafe",
    category: "phone-gadget",
    price: 179,
    emoji: "👛",
    gradient: "from-purple-100 to-fuchsia-200",
    rating: 4.8,
    sold: 460,
    badge: "ขายดี",
    featured: true,
    description:
      "กระเป๋าใส่การ์ด Magsafe ติดหลังมือถือพิมพ์ลาย เลือกแบบ Card Holder หรือ Wallet มีขาตั้ง พกบัตรติดมือถือสะดวก",
    highlights: ["ติด Magsafe หลังมือถือ", "แบบมีขาตั้งได้", "พิมพ์ลายคมชัด"],
    options: [
      { label: "ตัวเลือกสินค้า", choices: [{ name: "Magsafe Card Holder" }, { name: "Magsafe Wallet (มีขาตั้ง)" }] },
    ],
    images: [
      { emoji: "👛", gradient: "from-purple-100 to-fuchsia-200", label: "ด้านหน้า" },
      { emoji: "📱", gradient: "from-fuchsia-100 to-pink-200", label: "ติดมือถือ" },
    ],
  },
  {
    id: "x-stand",
    name: "X-STAND / ROLL UP / ป้ายขาตั้ง",
    category: "card-photo",
    price: 529,
    emoji: "🎌",
    gradient: "from-sky-100 to-blue-200",
    rating: 4.6,
    sold: 90,
    description:
      "ป้ายไวนิลตั้งพื้น X-stand / Roll up ขนาด 60x160cm พิมพ์ภาพคมชัด เหมาะออกบูธ งานอีเวนต์ หน้าร้าน",
    highlights: ["X-stand / Roll up", "ขนาด 60x160 cm", "พิมพ์ไวนิลคมชัด"],
    options: [
      { label: "ขนาด", choices: [{ name: "X-stand 60x160 cm" }, { name: "Roll up 60x160 cm" }] },
    ],
    images: [
      { emoji: "🎌", gradient: "from-sky-100 to-blue-200", label: "ด้านหน้า" },
      { emoji: "🏬", gradient: "from-blue-100 to-cyan-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "frame-card",
    name: "FRAME CARD / การ์ดใส",
    category: "home",
    price: 49,
    emoji: "🖼️",
    gradient: "from-cyan-100 to-sky-200",
    rating: 4.7,
    sold: 520,
    description:
      "ซองการ์ดใสพิมพ์ลาย กันน้ำ ไม่ขุ่นมัว เลือกแบบเจาะรู/ไม่เจาะรู เก็บโฟโต้การ์ดหรือทำกรอบการ์ดสวยใส",
    highlights: ["ใสไม่ขุ่นมัว กันน้ำ", "เจาะรู/ไม่เจาะรู", "พิมพ์ลายคมชัด"],
    options: [
      { label: "ตัวเลือก", choices: [{ name: "(เจาะรู) Frame Card" }, { name: "(ไม่เจาะรู) Frame Card" }] },
    ],
    images: [
      { emoji: "🖼️", gradient: "from-cyan-100 to-sky-200", label: "ด้านหน้า" },
      { emoji: "🎴", gradient: "from-sky-100 to-blue-200", label: "ใส่การ์ด" },
    ],
  },
  {
    id: "coasters-glitter",
    name: "COASTERS GLITTER / ที่รองแก้วกลิตเตอร์",
    category: "home",
    price: 200,
    emoji: "✨",
    gradient: "from-fuchsia-100 to-pink-200",
    rating: 4.7,
    sold: 360,
    description:
      "ที่รองแก้วกลิตเตอร์วิ้งสวย พิมพ์ลายคมชัด เลือกได้หลายลวดลาย เพิ่มความหรูให้โต๊ะกาแฟ",
    highlights: ["กลิตเตอร์วิ้งสวย", "หลายลวดลายให้เลือก", "พิมพ์ลายคมชัด"],
    options: [
      { label: "รูปแบบ", choices: [{ name: "สีชมพู" }, { name: "สีทอง" }, { name: "ดอกซากุระ" }, { name: "สีม่วง" }] },
    ],
    images: [
      { emoji: "✨", gradient: "from-fuchsia-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "☕", gradient: "from-pink-100 to-rose-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "placemat",
    name: "PLACEMAT / ผ้ารองจาน",
    category: "home",
    price: 120,
    emoji: "🍽️",
    gradient: "from-amber-100 to-orange-200",
    rating: 4.6,
    sold: 210,
    description:
      "ผ้ารองจานพิมพ์ลาย ผลิตจากผ้าคุณภาพ สวยหรู ทนทาน แต่งโต๊ะอาหารให้ดูดีมีสไตล์",
    highlights: ["ผ้าคุณภาพ สวยหรู", "พิมพ์ลายคมชัด", "ทนทาน ซักได้"],
    options: [],
    images: [
      { emoji: "🍽️", gradient: "from-amber-100 to-orange-200", label: "ด้านหน้า" },
      { emoji: "🍴", gradient: "from-orange-100 to-amber-200", label: "บนโต๊ะ" },
    ],
  },
  {
    id: "doormat",
    name: "DOORMAT / พรมเช็ดเท้า",
    category: "home",
    price: 250,
    emoji: "🚪",
    gradient: "from-stone-100 to-stone-200",
    rating: 4.7,
    sold: 340,
    description:
      "พรมเช็ดเท้าพิมพ์ลาย เลือกทรงสี่เหลี่ยม/กลม หลายขนาด เนื้อหนานุ่ม ซับน้ำดี ต้อนรับหน้าบ้านสไตล์คุณ",
    highlights: ["ทรงสี่เหลี่ยม/กลม", "หลายขนาด", "เนื้อหนานุ่ม ซับน้ำดี"],
    options: [
      { label: "ขนาด", choices: [{ name: "60x40cm (สี่เหลี่ยม)" }, { name: "80x50cm (สี่เหลี่ยม)" }, { name: "60cm (กลม)" }, { name: "80cm (กลม)" }] },
    ],
    images: [
      { emoji: "🚪", gradient: "from-stone-100 to-stone-200", label: "ด้านหน้า" },
      { emoji: "🏠", gradient: "from-amber-100 to-stone-200", label: "หน้าบ้าน" },
    ],
  },
  {
    id: "cushion",
    name: "CUSHION / หมอนอิงยัดใย",
    category: "home",
    price: 245,
    emoji: "🛋️",
    gradient: "from-orange-100 to-amber-200",
    rating: 4.8,
    sold: 480,
    featured: true,
    description:
      "หมอนอิงพิมพ์ลาย เลือกแบบยัดใยพร้อมใช้หรือปลอกหมอนอย่างเดียว หลายขนาด นุ่มสบาย แต่งโซฟาให้น่ารัก",
    highlights: ["ยัดใย/ปลอกหมอน", "ขนาด 12-24 นิ้ว", "นุ่มสบาย ถอดซักได้"],
    options: [
      { label: "ตัวเลือก", choices: [{ name: "หมอนอิงยัดใย" }, { name: "ปลอกหมอนอิง" }] },
      { label: "ขนาด", choices: [{ name: "12 นิ้ว" }, { name: "14 นิ้ว" }, { name: "16 นิ้ว" }, { name: "24 นิ้ว" }] },
    ],
    images: [
      { emoji: "🛋️", gradient: "from-orange-100 to-amber-200", label: "ด้านหน้า" },
      { emoji: "🏡", gradient: "from-amber-100 to-orange-200", label: "บนโซฟา" },
    ],
  },
  {
    id: "pillowcase",
    name: "Pillow Case / ปลอกหมอน",
    category: "home",
    price: 399,
    emoji: "🛏️",
    gradient: "from-amber-100 to-yellow-200",
    rating: 4.7,
    sold: 260,
    description:
      "ปลอกหมอนพิมพ์ลายเต็มผืน เนื้อผ้านุ่มลื่น สีสดไม่ตก ถอดซักได้ แต่งเตียงให้เป็นสไตล์ของคุณ",
    highlights: ["พิมพ์เต็มผืน สีสด", "เนื้อผ้านุ่มลื่น", "ถอดซักได้"],
    options: [],
    images: [
      { emoji: "🛏️", gradient: "from-amber-100 to-yellow-200", label: "ด้านหน้า" },
      { emoji: "😴", gradient: "from-yellow-100 to-orange-200", label: "บนเตียง" },
    ],
  },
  {
    id: "puzzle-mini",
    name: "Puzzle / จิ๊กซอว์อะคริลิค",
    category: "home",
    price: 90,
    emoji: "🧩",
    gradient: "from-indigo-100 to-violet-200",
    rating: 4.7,
    sold: 380,
    description:
      "จิ๊กซอว์อะคริลิคชิ้นเล็กพิมพ์ลาย ต่อสนุก เก็บเป็นของที่ระลึกน่ารัก มีหลายขนาด",
    highlights: ["อะคริลิคพิมพ์ลาย", "ต่อสนุก เก็บสะสม", "มี 3 ขนาด"],
    options: [
      { label: "ขนาด", choices: [{ name: "9x7.5 cm" }, { name: "11x9 cm" }, { name: "13.5x11.5 cm" }] },
    ],
    images: [
      { emoji: "🧩", gradient: "from-indigo-100 to-violet-200", label: "ด้านหน้า" },
      { emoji: "🖼️", gradient: "from-violet-100 to-purple-200", label: "ต่อเสร็จ" },
    ],
  },
  {
    id: "jigsaw-frame",
    name: "JIGSAW & Photo Frame / กรอบรูปจิ๊กซอว์",
    category: "home",
    price: 160,
    emoji: "🧩",
    gradient: "from-violet-100 to-purple-200",
    rating: 4.8,
    sold: 420,
    description:
      "จิ๊กซอว์พร้อมกรอบรูป พิมพ์ภาพคมชัดสีสวยสด ต่อเสร็จใส่กรอบโชว์ได้เลย มีหลายขนาดตั้งแต่ A5 ถึงใหญ่",
    highlights: ["จิ๊กซอว์ + กรอบรูป", "พิมพ์ภาพคมชัด สีสด", "หลายขนาด (Sublimation/UV)"],
    options: [
      { label: "ขนาด", choices: [{ name: "A5 (Sublimation)" }, { name: "15x20cm (UV)" }, { name: "29.7x21cm (UV)" }, { name: "38x26cm (UV)" }, { name: "52x38cm (UV)" }] },
    ],
    images: [
      { emoji: "🧩", gradient: "from-violet-100 to-purple-200", label: "ด้านหน้า" },
      { emoji: "🖼️", gradient: "from-purple-100 to-fuchsia-200", label: "ใส่กรอบ" },
    ],
  },
  {
    id: "mousepad",
    name: "Mouse Pad / แผ่นรองเมาส์",
    category: "home",
    price: 150,
    emoji: "🖱️",
    gradient: "from-blue-100 to-cyan-200",
    rating: 4.7,
    sold: 456,
    description:
      "แผ่นรองเมาส์พิมพ์ลายเต็มแผ่น ผิวผ้าลื่นแม่นยำ ฐานยางกันลื่น มีหลายขนาดตั้งแต่เล็กถึงยาวเต็มโต๊ะ",
    highlights: ["ผิวผ้าลื่นแม่นยำ", "ฐานยางกันลื่น", "มี 6 ขนาด"],
    options: [
      { label: "ขนาด", choices: [{ name: "18x21cm" }, { name: "25x30cm" }, { name: "30x60cm" }, { name: "30x80cm" }, { name: "40x80cm" }, { name: "40x90cm" }] },
    ],
    images: [
      { emoji: "🖱️", gradient: "from-blue-100 to-cyan-200", label: "ด้านบน" },
      { emoji: "⌨️", gradient: "from-cyan-100 to-teal-200", label: "บนโต๊ะ" },
    ],
  },
  {
    id: "hand-fan",
    name: "HAND FAN / พัดพลาสติกใส",
    category: "home",
    price: 59,
    emoji: "🪭",
    gradient: "from-rose-100 to-pink-200",
    rating: 4.6,
    sold: 290,
    description:
      "พัดพลาสติกใสทรงกลมพิมพ์ลาย พิมพ์ได้ 1-2 ด้าน พกพาสะดวก ของแฟนคลับหรือของแจกน่ารัก",
    highlights: ["พลาสติกใสทรงกลม", "พิมพ์ 1-2 ด้าน", "พกพาสะดวก"],
    options: [
      { label: "ขนาด", choices: [{ name: "5 cm" }, { name: "16.4 cm" }] },
      { label: "รูปแบบการพิมพ์", choices: [{ name: "พิมพ์ 1 ด้าน" }, { name: "พิมพ์ 2 ด้าน" }] },
    ],
    images: [
      { emoji: "🪭", gradient: "from-rose-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "🎐", gradient: "from-pink-100 to-fuchsia-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "wall-cloth",
    name: "WALL CLOTH / ผ้าแขวนผนัง",
    category: "home",
    price: 175,
    emoji: "🧵",
    gradient: "from-emerald-100 to-teal-200",
    rating: 4.7,
    sold: 230,
    description:
      "ผ้าแขวนผนังพิมพ์ลายเต็มผืน แต่งห้องสไตล์คาเฟ่/มินิมอล เลือกได้ 2 ขนาด แขวนง่ายเปลี่ยนบรรยากาศห้อง",
    highlights: ["พิมพ์เต็มผืน สีสด", "2 ขนาดให้เลือก", "แต่งห้องสไตล์คาเฟ่"],
    options: [
      { label: "ขนาด", choices: [{ name: "50x50cm" }, { name: "100x100cm" }] },
    ],
    images: [
      { emoji: "🧵", gradient: "from-emerald-100 to-teal-200", label: "ด้านหน้า" },
      { emoji: "🖼️", gradient: "from-teal-100 to-cyan-200", label: "แขวนผนัง" },
    ],
  },
  {
    id: "towel",
    name: "TOWEL / ผ้าขนหนู",
    category: "fabric",
    price: 250,
    emoji: "🏖️",
    gradient: "from-cyan-100 to-teal-200",
    rating: 4.7,
    sold: 380,
    description:
      "ผ้าขนหนูพิมพ์ลายเต็มผืน ซับน้ำดี เนื้อนุ่ม มีหลายขนาดตั้งแต่ผ้าเช็ดหน้าจนถึงผ้าเช็ดตัวใหญ่",
    highlights: ["พิมพ์เต็มผืน สีสด", "ซับน้ำดี เนื้อนุ่ม", "มี 5 ขนาด"],
    options: [
      { label: "ขนาด", choices: [{ name: "30x60cm" }, { name: "38x76cm" }, { name: "50x100cm" }, { name: "70x150cm" }, { name: "78x180cm" }] },
    ],
    images: [
      { emoji: "🏖️", gradient: "from-cyan-100 to-teal-200", label: "เต็มผืน" },
      { emoji: "🌊", gradient: "from-sky-100 to-cyan-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "facecloth",
    name: "FACECLOTH / ผ้าเช็ดหน้า",
    category: "fabric",
    price: 120,
    emoji: "🧻",
    gradient: "from-teal-100 to-emerald-200",
    rating: 4.6,
    sold: 240,
    description:
      "ผ้าเช็ดหน้าพิมพ์ลายเต็มผืน เนื้อนุ่มซับน้ำดี อ่อนโยนต่อผิว ของพรีเมียมทำแจกหรือขายได้",
    highlights: ["เนื้อนุ่มอ่อนโยน", "ซับน้ำดี", "พิมพ์เต็มผืน สีสด"],
    options: [],
    images: [
      { emoji: "🧻", gradient: "from-teal-100 to-emerald-200", label: "ด้านหน้า" },
      { emoji: "🧼", gradient: "from-emerald-100 to-green-200", label: "ตอนใช้งาน" },
    ],
  },
  {
    id: "blanket-hoodie",
    name: "BLANKET HOODIE / ผ้าห่มมีฮู้ด",
    category: "fabric",
    price: 490,
    emoji: "🧥",
    gradient: "from-green-100 to-emerald-200",
    rating: 4.8,
    sold: 260,
    badge: "ใหม่",
    description:
      "ผ้าห่มมีฮู้ดสวมใส่ได้ พิมพ์ลายเต็มผืน อุ่นสบาย เหมาะคลุมกันหนาวในออฟฟิศ พับเก็บพกพาสะดวก",
    highlights: ["ผ้าห่ม + ฮู้ดสวมได้", "พิมพ์เต็มผืน อุ่นสบาย", "พับเก็บพกพาง่าย"],
    options: [
      { label: "ขนาด", choices: [{ name: "85x130cm (รวมฮู้ด)" }, { name: "125x150cm (รวมฮู้ด)" }] },
    ],
    images: [
      { emoji: "🧥", gradient: "from-green-100 to-emerald-200", label: "ด้านหน้า" },
      { emoji: "🛋️", gradient: "from-emerald-100 to-teal-200", label: "ตอนสวมใส่" },
    ],
  },
  {
    id: "scarf",
    name: "SCARF / ผ้าผูกผม",
    category: "fabric",
    price: 120,
    emoji: "🧣",
    gradient: "from-rose-100 to-pink-200",
    rating: 4.7,
    sold: 300,
    description:
      "ผ้าผูกผม/ผ้าพันกระเป๋าพิมพ์ลาย เนื้อผ้าลื่นสวย เพิ่มลุคน่ารักให้ผมหรือกระเป๋า ของแฟชั่นน่าสะสม",
    highlights: ["เนื้อผ้าลื่นสวย", "ผูกผม/พันกระเป๋า", "พิมพ์ลายคมชัด"],
    options: [],
    images: [
      { emoji: "🧣", gradient: "from-rose-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "👜", gradient: "from-pink-100 to-fuchsia-200", label: "พันกระเป๋า" },
    ],
  },
  {
    id: "shawl",
    name: "SHAWL / ผ้าคลุมไหล่",
    category: "fabric",
    price: 250,
    emoji: "🧣",
    gradient: "from-fuchsia-100 to-pink-200",
    rating: 4.7,
    sold: 210,
    description:
      "ผ้าคลุมไหล่พิมพ์ลายเต็มผืน เนื้อผ้าพลิ้วสวย มีหลายขนาด คลุมไหล่หรือพันคอเพิ่มสไตล์ ของพรีเมียม",
    highlights: ["เนื้อผ้าพลิ้วสวย", "มี 3 ขนาด", "พิมพ์เต็มผืน สีสด"],
    options: [
      { label: "ขนาด", choices: [{ name: "70x70 cm" }, { name: "100x100 cm" }, { name: "140x140 cm" }] },
    ],
    images: [
      { emoji: "🧣", gradient: "from-fuchsia-100 to-pink-200", label: "ด้านหน้า" },
      { emoji: "🧕", gradient: "from-pink-100 to-rose-200", label: "ตอนคลุม" },
    ],
  },
  {
    id: "collar-animal",
    name: "Collar Animal / ปลอกคอสัตว์เลี้ยง",
    category: "fabric",
    price: 109,
    emoji: "🐾",
    gradient: "from-emerald-100 to-teal-200",
    rating: 4.7,
    sold: 340,
    description:
      "ปลอกคอ/ผ้าพันคอสัตว์เลี้ยงพิมพ์ลาย ใส่สบาย มีไซซ์ XS-XXL เพิ่มความน่ารักให้น้องหมาน้องแมว",
    highlights: ["ไซซ์ XS ถึง XXL", "ใส่สบาย ไม่ระคายเคือง", "พิมพ์ลายคมชัด"],
    options: [
      { label: "ขนาด", choices: [{ name: "XS" }, { name: "S" }, { name: "M" }, { name: "L" }, { name: "XL" }, { name: "XXL" }] },
    ],
    images: [
      { emoji: "🐾", gradient: "from-emerald-100 to-teal-200", label: "ด้านหน้า" },
      { emoji: "🐶", gradient: "from-teal-100 to-cyan-200", label: "ตอนใส่" },
    ],
  },
];

export function getProduct(id: string): Product | undefined {
  // id ก่อน ไม่เจอค่อยลองลิงก์ตามชื่อ (slug) — ลิงก์แบบ /products/ชื่อไทย และ /admin/products/ชื่อไทย ใช้ตัวเดียวกัน
  return PRODUCTS.find((p) => p.id === id) ?? PRODUCTS.find((p) => (p.slug ?? "") === id);
}

export function formatPrice(n: number): string {
  return `฿${n.toLocaleString("th-TH")}`;
}

/** เรทที่ลูกค้าเลือกอยู่ (จาก selections) — ไม่เจอ/ไม่ได้เลือก = เรทแรก · สินค้าไม่มีหลายเรท = undefined */
export function activeRate(p: Product, selections: Record<string, string>): PriceRate | undefined {
  const rs = p.priceRates;
  if (!rs?.length) return undefined;
  return rs.find((r) => r.label === selections[RATE_LABEL]) ?? rs[0];
}

/** ตารางราคาที่ใช้จริงตามเรทที่เลือก — สินค้าเรทเดียวคืน pricing เดิม */
export function activeMatrix(p: Product, selections: Record<string, string>): PriceMatrix | undefined {
  return activeRate(p, selections)?.pricing ?? p.pricing;
}

/**
 * ตัวเลือกนี้มีราคาขายในตารางนี้ไหม — แถวที่แอดมินล้างราคาทิ้ง (ไม่ขายในเรทนั้น)
 * จะไม่มีคีย์ในตาราง → หน้าร้านซ่อนตัวเลือกนั้นเมื่อลูกค้าเลือกเรทนั้นอยู่
 */
export function matrixChoiceAvailable(m: PriceMatrix, label: string, choice: string): boolean {
  const di = m.driverLabels.indexOf(label);
  if (di < 0) return true; // กลุ่มที่ไม่ใช่แกนตาราง ไม่เกี่ยวกับตาราง
  return Object.keys(m.cells).some((k) => k.split("│")[di] === choice);
}

/**
 * ทุกกลุ่มที่เป็น "แกนตารางราคา" ของสินค้านี้ (รวมทุกเรท) — ค่าของกลุ่มพวกนี้คือกุญแจหาราคาในตาราง
 * ขาดไปแม้กลุ่มเดียว คีย์จะหาช่องไม่เจอ แล้วราคาหล่นไปใช้ราคาตั้งต้นของสินค้า
 * → ตะกร้า/ออเดอร์ต้องเก็บค่ากลุ่มพวกนี้ไว้เสมอ แม้กลุ่มนั้นจะถูกซ่อนจากหน้าร้าน (showWhen ไม่ตรง)
 */
export function priceDriverLabels(p: Product): string[] {
  const all = [p.pricing, ...(p.priceRates ?? []).map((r) => r.pricing)];
  return [...new Set(all.flatMap((m) => m?.driverLabels ?? []))];
}

/**
 * คีย์คอลัมน์ราคา ที่เติมค่าเริ่มต้นให้แกนตารางที่ "ไม่มีค่า" ใน selections
 * ใช้กับของที่อยู่ในตะกร้า/ออเดอร์เก่าซึ่งเคยถูกตัดกลุ่มที่ซ่อนไว้ออกไป — ราคาจะได้ตรงกับที่ลูกค้าเห็นตอนสั่ง
 * (ค่าเริ่มต้นเลือกแบบเดียวกับ resolveSelections: ตัวแรกที่กฎอนุญาตและมีราคาในตาราง)
 */
function matrixKeyFilled(product: Product, m: PriceMatrix, selections: Record<string, string>): string {
  const filled = { ...selections };
  for (const label of m.driverLabels) {
    if (filled[label]) continue;
    if (!product.options?.some((o) => o.label === label)) continue;
    const allowed = allowedChoices(product, filled, label);
    const priced = allowed.filter((n) => matrixChoiceAvailable(m, label, n));
    const pick = (priced.length > 0 ? priced : allowed)[0];
    if (pick) filled[label] = pick;
  }
  return priceMatrixKey(m, filled);
}

/** ช่วงราคาต่ำสุด–สูงสุดของสินค้า — ถ้ามีตารางราคาขั้นบันไดคิดจากทุกช่อง, ไม่งั้นคิดจากราคาตั้งต้น + option.extra */
export function priceRange(p: Product): { min: number; max: number } {
  /**
   * 📐 สินค้าคิดตามพื้นที่: คอลัมน์ "ต่อหน่วยพื้นที่" (เช่น ฿1/ตร.ซม.) ไม่ใช่ราคาต่อชิ้น
   * เอามารวมช่วงราคาจะได้ "฿1 – ฿40" ซึ่งอ่านผิดความหมาย — ใช้เฉพาะคอลัมน์ราคาก้อนแรก
   * (= ราคาต่อชิ้นของลายที่ไม่เกินพื้นที่ก้อนแรก คือราคาเริ่มต้นจริง ๆ ของงาน)
   */
  const ap = p.areaPricing;
  if (ap?.enabled) {
    const base = [
      ...(p.priceRates ?? []).flatMap((r) => r.pricing.cells[ap.baseColumn] ?? []),
      ...(p.pricing?.cells[ap.baseColumn] ?? []),
    ].filter((n) => n > 0);
    if (base.length) return { min: Math.min(...base), max: Math.max(...base) };
  }
  if (p.priceRates?.length) {
    const all = p.priceRates.flatMap((r) => Object.values(r.pricing.cells).flat()).filter((n) => n > 0);
    if (all.length) return { min: Math.min(...all), max: Math.max(...all) };
  }
  if (p.pricing) {
    const all = Object.values(p.pricing.cells).flat();
    if (all.length) return { min: Math.min(...all), max: Math.max(...all) };
  }
  // ข้อมูลแบบเบา (การ์ดหน้ารายการ) ไม่มีตารางราคามาด้วย → ใช้ช่วงที่คำนวณไว้ตอนบันทึก
  if (typeof p.priceMin === "number" && typeof p.priceMax === "number") {
    return { min: p.priceMin, max: p.priceMax };
  }
  let min = p.price;
  let max = p.price;
  for (const opt of p.options) {
    if (opt.choices.length === 0) continue;
    const extras = opt.choices.map((c) => c.extra ?? 0);
    if (isMultiOption(opt)) {
      // ติ๊กได้หลายอย่าง: ไม่ติ๊กเลย = ไม่บวก · ติ๊กครบ = บวกทุกตัว
      max += extras.reduce((s, e) => s + Math.max(0, e), 0);
      continue;
    }
    min += Math.min(...extras);
    max += Math.max(...extras);
  }
  return { min, max };
}

/** index ของ tier ที่จำนวน qty ตกอยู่ */
export function tierIndex(m: PriceMatrix, qty: number): number {
  for (let i = 0; i < m.tiers.length; i++) {
    const up = m.tiers[i].upTo;
    if (up == null || qty <= up) return i;
  }
  return Math.max(0, m.tiers.length - 1);
}

/** key ของคอลัมน์ในตารางราคา จากตัวเลือกที่เลือกอยู่ */
export function priceMatrixKey(m: PriceMatrix, selections: Record<string, string>): string {
  return m.driverLabels.map((l) => selections[l] ?? "").join("│");
}

/**
 * 📐 คีย์ในตัวเลือกที่บอกว่าลูกค้า "ติ๊กสั่งทำ" ไว้
 * เก็บเป็นตัวเลือกปกติ จะได้ติดไปกับตะกร้า/ออเดอร์/ใบงานเองว่าใบนี้เป็นงานสั่งทำ
 */
export const MTO_LABEL = "งานสั่งทำ";
export const MTO_ON = "กำหนดขนาด/รายละเอียดเอง";

/**
 * กลุ่มนี้เป็นของงานสั่งทำไหม — ช่องกรอกเป็นโดยธรรมชาติ · กลุ่มตัวเลือกปกติต้องถูกย้ายเข้ามา (madeToOrder)
 * ยกเว้นช่องกรอกที่ตั้ง standardInput = ข้อมูลประกอบของงานปกติ (เช่น ขนาดไดคัท) ไม่เข้ากล่อง 📐
 */
export function isMadeToOrderOption(o: ProductOption): boolean {
  return (isInputOption(o) && o.standardInput !== true) || o.madeToOrder === true;
}

/** ลูกค้าติ๊ก "สั่งทำ" ไว้ไหม */
export function madeToOrderOn(selections: Record<string, string>): boolean {
  return selections[MTO_LABEL] === MTO_ON;
}

/**
 * กลุ่มนี้ "มีผลจริง" กับลูกค้าตอนนี้ไหม — ต้องทั้งไม่ถูกซ่อนด้วย showWhen
 * และถ้าเป็นกลุ่มงานสั่งทำ ลูกค้าต้องติ๊กสั่งทำไว้ด้วย
 * ไม่เข้าเงื่อนไข = ไม่ถาม ไม่คิดเงิน ไม่ติดไปกับออเดอร์ (เหมือนกลุ่มที่ถูกซ่อน)
 */
export function optionActive(opt: ProductOption, selections: Record<string, string>): boolean {
  if (!optionVisible(opt, selections)) return false;
  return !isMadeToOrderOption(opt) || madeToOrderOn(selections);
}

/**
 * 💬 ตัวเลือกชุดนี้เป็น "งานสั่งทำที่ต้องให้แอดมินตีราคา" ไหม
 *
 * เข้าเงื่อนไขเมื่อกลุ่มที่แสดงอยู่ (ไม่ถูกซ่อนด้วย showWhen) เข้าข้อใดข้อหนึ่ง:
 *  - กลุ่มตั้ง askPrice ไว้ และลูกค้ากรอก/เลือกค่าแล้ว
 *  - ตัวเลือกที่เลือกอยู่ในกลุ่มนั้นตั้ง askPrice ไว้ (เช่น "แบบที่ 3")
 *
 * ผลคือราคา/หน่วย = 0 (หน้าร้านขึ้น "รอแอดมินตีราคา") แต่ลูกค้ายังกดสั่งได้ตามปกติ
 */
export function needsQuote(p: Product, selections: Record<string, string>): boolean {
  for (const opt of p.options) {
    if (!optionActive(opt, selections)) continue;
    const picked = selectedNames(opt, selections);
    // ช่องกรอกที่ตั้ง 💬 ไว้: แค่ "โผล่ให้กรอก" ก็ถือว่าเป็นงานสั่งทำแล้ว
    // (ไม่ต้องรอให้พิมพ์ก่อน ไม่งั้นราคาจะกระพริบจากราคาปกติ → รอตีราคา ตอนลูกค้าเริ่มพิมพ์)
    if (opt.askPrice && (isInputOption(opt) || picked.length)) return true;
    if (opt.choices.some((c) => c.askPrice && picked.includes(c.name))) return true;
  }
  return false;
}

/** สินค้านี้มีทางเลือกที่ต้องให้แอดมินตีราคาไหม (ใช้ตัดสินใจว่าจะโชว์ราคาเป็น "เริ่มต้น ฿X") */
export function hasQuoteOption(p: Product): boolean {
  return (p.options ?? []).some((o) => o.askPrice || o.choices.some((c) => c.askPrice));
}

/** ราคา/หน่วย ตามตัวเลือก + จำนวน — ใช้ตารางราคาถ้ามี, ไม่งั้น price + option.extra */
export function unitPriceFor(
  product: Product,
  selections: Record<string, string>,
  qty: number
): number {
  // 💬 งานสั่งทำที่ต้องให้แอดมินตีราคา — ยังไม่มีราคาจนกว่าแอดมินจะใส่ให้
  if (needsQuote(product, selections)) return 0;
  // งานกำหนดขนาดเอง (custom) มาก่อน — ราคาพิเศษแทนตารางปกติ
  const c = product.custom;
  if (c?.enabled) {
    // โหมด "chat" = คุยกับแอดมินก่อน ยังไม่มีราคา · โหมด "size" = ระบุขนาดเฉย ๆ ราคาคิดตามตารางปกติ
    if (c.mode === "chat" && selections[c.label]) return 0;
    const dims = parseCustomDims(selections[c.label]);
    if (dims && c.mode !== "size") return c.mode === "quote" ? 0 : customUnitPrice(c, dims.w, dims.h);
  }
  // จำนวนที่ใช้ "เทียบช่วงราคา" — สินค้าที่คิดเรทตามชิ้นต่อลายจะเป็น ⌊จำนวน ÷ ลาย⌋
  // เงื่อนไขที่ผูกกับช่วงราคา (ค่าธรรมเนียมช่วงปลีก · extraFromQty) ต้องใช้ตัวเลขเดียวกับที่เลือกช่วงราคา
  // ไม่งั้นจะกลายเป็น "ได้ราคาช่วงปลีก แต่ไม่โดนค่าธรรมเนียมช่วงปลีก" (สั่ง 11 ชิ้น คละ 3 ลาย = ตกลายละ 3)
  const tierQty = tierQtyFor(product, selections, qty);
  const m = activeMatrix(product, selections);
  if (m) {
    // หาช่องราคาไม่เจอเพราะแกนตารางบางกลุ่มไม่มีค่า (ของเก่าในตะกร้าที่ถูกตัดกลุ่มซ่อนออกไป)
    // → เติมค่าเริ่มต้นให้แกนที่ขาด แล้วหาใหม่ ก่อนจะยอมตกไปใช้ราคาตั้งต้นของสินค้า
    const cells =
      m.cells[priceMatrixKey(m, selections)] ??
      (m.driverLabels.some((l) => !selections[l]) ? m.cells[matrixKeyFilled(product, m, selections)] : undefined);
    let base = cells && cells.length ? (cells[tierIndex(m, tierQty)] ?? product.price) : product.price;
    // 📐 คิดตามพื้นที่ลาย — ราคาก้อนแรก + ส่วนเกินคูณเรทต่อหน่วยพื้นที่ (แทนราคาคอลัมน์เดียว)
    // ยังไม่กรอกขนาด = คืน null แล้วใช้ราคาคอลัมน์ตามเดิม (โชว์เป็นราคาเริ่มต้น)
    const areaBd = areaPriceBreakdown(product, selections, qty);
    if (areaBd) base = areaBd.unitPrice;
    // กลุ่มตัวเลือกที่ไม่ใช่แกนตาราง (เช่น อะไหล่พิเศษ) บวกเพิ่มต่อหน่วยตาม extra ของตัวที่เลือก
    // (กลุ่มที่ตั้ง extraFromQty ไว้ ต่ำกว่าเกณฑ์ = ราคารวมแล้ว ไม่บวก)
    for (const opt of product.options) {
      // กลุ่มที่ถูกซ่อน หรือกลุ่มงานสั่งทำที่ลูกค้ายังไม่ได้ติ๊ก = ไม่คิดเงิน
      if (!optionActive(opt, selections)) continue;
      // กลุ่มที่เป็นแกนตาราง ราคาอยู่ในช่องตารางแล้ว — เหลือแค่ค่าธรรมเนียมช่วงปลีกของกลุ่มนั้น
      if (m.driverLabels.includes(opt.label)) {
        base += smallQtyFeeOf(opt, selections, tierQty);
        continue;
      }
      base += groupAddOf(opt, selections, tierQty);
    }
    // ค่าธรรมเนียมช่วงปลีกใส่ค่าติดลบได้ (ลดให้) — กันหักจนราคาติดลบ
    return Math.max(0, base);
  }
  let price = product.price;
  for (const opt of product.options) {
    // กลุ่มที่ถูกซ่อน หรือกลุ่มงานสั่งทำที่ลูกค้ายังไม่ได้ติ๊ก = ไม่คิดเงิน
    if (!optionActive(opt, selections)) continue;
    price += groupAddOf(opt, selections, tierQty);
  }
  return Math.max(0, price);
}

/** ข้อความราคา: แสดงเป็นช่วง "฿ต่ำสุด – ฿สูงสุด" ถ้าตัวเลือกทำให้ราคาต่างกัน */
export function formatPriceRange(p: Product): string {
  const { min, max } = priceRange(p);
  return max > min ? `${formatPrice(min)} – ${formatPrice(max)}` : formatPrice(min);
}

/**
 * สินค้านี้มีแบบ "งานสั่งทำ ให้แอดมินตีราคา" อยู่ด้วยไหม
 * อ่านจากธงที่เซิร์ฟเวอร์เขียนไว้ก่อน (ข้อมูลแบบเบาของการ์ดไม่มี options) ไม่มีธงค่อยดูจาก options จริง
 */
export function isQuoteProduct(p: Product): boolean {
  return p.quoteOption === true || hasQuoteOption(p);
}

/**
 * ราคาที่โชว์บน "การ์ด/รายการสินค้า"
 * สินค้าที่มีแบบสั่งทำ ราคาสูงสุดไม่มีความหมาย (แล้วแต่งานที่ลูกค้าสั่ง) → บอกเป็น "เริ่มต้น ฿X"
 * หน้าสินค้ายังใช้ formatPriceRange ตามเดิม เพราะตรงนั้นรู้ว่าลูกค้าเลือกแบบไหนอยู่
 */
export function formatPriceLabel(p: Product): string {
  const { min } = priceRange(p);
  return isQuoteProduct(p) ? `เริ่มต้น ${formatPrice(min)}` : formatPriceRange(p);
}

/**
 * ตัวเลือกที่อนุญาตของกลุ่ม `label` ภายใต้สิ่งที่เลือกอยู่ตอนนี้
 * (ตัดตามกฎทุกข้อที่เงื่อนไข `when` ตรง — ถ้ากฎตัดจนหมดจะคืนทั้งกลุ่มไว้กันหน้าพัง)
 */
export function allowedChoices(
  product: Product,
  selections: Record<string, string>,
  label: string
): string[] {
  const group = product.options.find((o) => o.label === label);
  if (!group) return [];
  let allowed = group.choices.map((c) => c.name);
  for (const rule of product.rules ?? []) {
    if (rule.limit.label !== label) continue;
    if (ruleWhenMatches(rule, selections)) {
      allowed = allowed.filter((n) => rule.limit.allow.includes(n));
    }
  }
  return allowed.length > 0 ? allowed : group.choices.map((c) => c.name);
}

/**
 * ปรับสิ่งที่ลูกค้าเลือกให้ถูกกฎเสมอ: ไล่ตามลำดับกลุ่ม
 * ถ้าค่าที่เลือกไว้ใช้ไม่ได้แล้ว (เพราะกลุ่มก่อนหน้าเปลี่ยน) จะสลับเป็นตัวแรกที่อนุญาต
 */
export function resolveSelections(
  product: Product,
  selections: Record<string, string>
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const opt of product.options) {
    const view = { ...selections, ...resolved };
    const allowed = allowedChoices(product, view, opt.label);
    const current = selections[opt.label];
    // ช่องกรอก: ค่ามาจากลูกค้า ไม่มีรายการให้เทียบ/ไม่มีค่าเริ่มต้น — คงไว้ตามที่พิมพ์
    if (isInputOption(opt)) {
      resolved[opt.label] = current ?? "";
      continue;
    }
    if (isMultiOption(opt)) {
      // ติ๊กได้หลายอย่าง: เก็บเฉพาะตัวที่ยังอนุญาต · ไม่เหลือเลยก็ได้ (กลุ่มนี้ไม่บังคับเลือก)
      // ติ๊กได้หลายอย่าง: เก็บจำนวนที่ลูกค้าระบุไว้ด้วย (เช่น "เพิ่มสาย ×2")
      const names = opt.choices.map((c) => c.name);
      resolved[opt.label] = joinMultiPicks(
        splitMultiPicks(current, names).filter((p) => allowed.includes(p.name))
      );
      continue;
    }
    // ตัวที่ไม่มีราคาในตารางเรทนี้ หน้าร้านซ่อนไว้ (แถวราคาว่าง = ไม่ขายคู่นี้)
    // ค่าเริ่มต้นจึงต้องไม่ไปตกที่ตัวที่ถูกซ่อน ไม่งั้นหัวข้อจะโชว์ชื่อที่ลูกค้าเลือกซ้ำในเมนูไม่ได้
    // แถมราคาหล่นไปใช้ราคาตั้งต้นแทนราคาในตาราง · ไม่เหลือตัวที่มีราคาเลยค่อยคงชุดเดิมไว้กันหน้าพัง
    const m = activeMatrix(product, view);
    const priced = m ? allowed.filter((n) => matrixChoiceAvailable(m, opt.label, n)) : allowed;
    const pool = priced.length > 0 ? priced : allowed;
    resolved[opt.label] = current && pool.includes(current) ? current : pool[0];
  }
  return resolved;
}

/* ยอดส่งฟรีไม่เก็บไว้ตรงนี้แล้ว — แหล่งจริงคือค่าที่แอดมินตั้งที่ /admin/settings
   อ่านผ่าน freeShippingMinOf() ใน lib/shop-settings.ts */
export const SHIPPING_METHODS = [
  { id: "standard", name: "ส่งธรรมดา (3-5 วัน)", price: 50 },
  { id: "express", name: "ส่งด่วน (1-2 วัน)", price: 90 },
] as const;
