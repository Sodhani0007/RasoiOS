import type { Metadata } from "next";
import { Shell } from "@/components/layout/shell";
import "./globals.css";
export const metadata: Metadata = {
  title: "RasoiOS · Your kitchen, together",
  description:
    "The Kitchen That Remembers, Decides & Coordinates. A local household kitchen companion.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
