import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Remix Studio",
  description: "Remix videos that already work into ads for your product.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            Remix Studio
          </Link>
          <span className="tagline">Copy what's working. Swap in your product.</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
