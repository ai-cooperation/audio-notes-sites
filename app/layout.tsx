import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "會議語音筆記",
  description: "保存錄音、校正逐字稿與整理會議摘要。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
