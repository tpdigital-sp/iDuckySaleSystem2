import type { Metadata } from "next";
import AdminShell from "./AdminShell";
import NavProgress from "@/components/NavProgress";

export const metadata: Metadata = {
  title: { default: "หลังบ้าน", template: "%s | หลังบ้าน iDucky" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavProgress />
      <AdminShell>{children}</AdminShell>
    </>
  );
}
