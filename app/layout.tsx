import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TagioPay",
  description: "Onchain hashtag identity and payment routing on Robinhood Chain.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
