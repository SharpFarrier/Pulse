import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Pulse — Amazon ads",
  description: "Amazon Sponsored Products ingestion and preview",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
