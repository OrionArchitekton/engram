import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Engram - a memory engine for AI agents",
  description:
    "Typed memories, budget-bounded recall, source-aware decay, and contradiction adjudication. Built on Qwen Cloud.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0b0b12] text-zinc-200 antialiased">{children}</body>
    </html>
  );
}
