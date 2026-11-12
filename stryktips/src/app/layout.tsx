import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Stryktipsanalys",
  description: "Analys av veckans Stryktipskupong och förslag på system.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 16 }}>
        {children}
        <footer style={{ marginTop: 48, fontSize: 13, color: "#666" }}>
          Spel om pengar kan leda till problem. 18-årsgräns. Behöver du prata med någon?{" "}
          <a href="https://www.stodlinjen.se">Stödlinjen</a>, 020-81 91 00.
        </footer>
      </body>
    </html>
  );
}
