import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Inter, Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

// Same type as the Vawe website: Inter for the interface, DM Serif Display for a few big headings.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const serif = DM_Serif_Display({ subsets: ["latin"], weight: "400", variable: "--font-dm-serif" });
// Only for the "Powered by Lasan Labs" credit on the sign-in pages, as on the Vawe website.
const grotesk = Space_Grotesk({ subsets: ["latin"], weight: "600", variable: "--font-space-grotesk" });

export const metadata: Metadata = {
  title: { default: "Vawe OMS", template: "%s · Vawe OMS" },
  description: "Order management for Vawe Interio",
  icons: { icon: "/brand/vawe-mark.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f1ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The theme picked with the toggle, if any; without it the device setting decides (globals.css).
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = saved === "dark" || saved === "light" ? saved : undefined;
  return (
    <html lang="en" data-theme={theme} className={`${inter.variable} ${serif.variable} ${grotesk.variable}`}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
