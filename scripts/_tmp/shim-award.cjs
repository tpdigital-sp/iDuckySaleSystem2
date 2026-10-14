// ให้ไฟล์ที่ import "server-only" รันนอก Next ได้ (สคริปต์ครั้งเดียว)
const p = require.resolve("server-only");
require.cache[p] = { id: p, filename: p, loaded: true, exports: {} };
