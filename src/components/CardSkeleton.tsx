/*
 * โครงการ์ดตอนกำลังโหลดสินค้า — ใช้คลาสชุดเดียวกับการ์ดจริง (.card/.thumb/.card-body ใน landing.css)
 * มีไว้แทน "การ์ดของเก่า" ที่เคยวาดจากข้อมูล static ในโค้ดระหว่างรอฐานข้อมูล
 * ขนาดเท่าการ์ดจริง หน้าจึงไม่กระตุกตอนของจริงมาแทนที่
 */
export default function CardSkeleton() {
  return (
    <div className="card sk" aria-hidden="true">
      <div className="thumb">
        <span className="sk-fill" />
      </div>
      <div className="card-body">
        <span className="sk-line sk-s" />
        <span className="sk-line sk-m" />
        <span className="sk-line sk-m2" />
        <div className="meta">
          <span className="sk-line sk-p" />
          <span className="sk-line sk-r" />
        </div>
      </div>
    </div>
  );
}
