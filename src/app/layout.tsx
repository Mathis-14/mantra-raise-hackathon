import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Mantra",
  description:
    "An autonomous agent that plays your prototype game like a real player, then closes the creative-testing loop.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
