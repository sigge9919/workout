import type { Metadata } from "next";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Innebandyanalys",
  description: "Videoanalys och taggning för innebandy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
