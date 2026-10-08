import { SHOP, SITE_URL } from "@/lib/shop-info";

/**
 * ข้อมูลโครงสร้างของ "ตัวร้าน" (JSON-LD) ติดทุกหน้าร้าน — ให้ Google รู้จักร้านเป็นธุรกิจจริง
 * (ชื่อ · โลโก้ · ที่อยู่ · เบอร์ · เวลาทำการ · โซเชียล) และรู้จักเว็บ (ช่องค้นหาในผลค้นหา)
 *
 * ทำไมต้องมี: เดิมหน้าแรกไม่มีข้อมูลโครงสร้างเลย Google จึงรู้จักแค่ "หน้าสินค้า" ทีละหน้า
 * ไม่รู้ว่าทั้งหมดเป็นร้านเดียวกัน → ไม่ขึ้นแผงความรู้ (knowledge panel) / ไซต์ลิงก์
 *
 * ฝั่งเซิร์ฟเวอร์ล้วน ไม่มี state — ติดมากับ HTML แรกที่บอทเห็น
 */
const SAME_AS = [
  "https://www.facebook.com/iduckyshop",
  "https://www.instagram.com/iduckyshop1",
  "https://www.tiktok.com/@iduckyofficial",
  "https://x.com/iduckyshop",
];

export default function SiteJsonLd() {
  const orgId = `${SITE_URL}/#organization`;
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["Organization", "Store"],
        "@id": orgId,
        name: SHOP.name,
        legalName: SHOP.legalName,
        url: SITE_URL,
        logo: `${SITE_URL}/icon-512.png`,
        image: `${SITE_URL}/icon-512.png`,
        telephone: `+66${SHOP.phone.replace(/\D/g, "").replace(/^0/, "")}`,
        address: {
          "@type": "PostalAddress",
          streetAddress: SHOP.addressLines[0],
          addressLocality: "ลาดกระบัง",
          addressRegion: "กรุงเทพมหานคร",
          postalCode: "10520",
          addressCountry: "TH",
        },
        openingHoursSpecification: {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          opens: "09:00",
          closes: "18:00",
        },
        priceRange: "฿",
        currenciesAccepted: "THB",
        paymentAccepted: "Bank transfer, PromptPay",
        areaServed: { "@type": "Country", name: "Thailand" },
        sameAs: SAME_AS,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SHOP.name,
        inLanguage: "th",
        publisher: { "@id": orgId },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/products?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      // กัน </script> หลุดจากข้อความ — ทางเดียวกับหน้าสินค้า
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, "\\u003c") }}
    />
  );
}
