import "./globals.css";
import type { ReactNode } from "react";
import Nav from "./nav";

export const metadata = {
  title: "Pulse — Amazon ads",
  description: "Amazon Sponsored Products ingestion and preview",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main style={{ maxWidth: 880, margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>
          <Nav />
          {children}
        </main>
      </body>
    </html>
  );
}
