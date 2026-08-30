"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const path = usePathname();
  const items = [
    { href: "/", label: "Daily preview" },
    { href: "/ingest", label: "Ingest reports" },
  ];
  return (
    <nav style={{ display: "flex", gap: 4, borderBottom: "0.5px solid var(--border)", marginBottom: "1.5rem" }}>
      {items.map((it) => {
        const active = path === it.href;
        return (
          <Link key={it.href} href={it.href} style={{
            fontSize: 14, textDecoration: "none", padding: "10px 14px",
            color: active ? "var(--text-primary)" : "var(--text-secondary)",
            fontWeight: active ? 500 : 400,
            borderBottom: active ? "2px solid var(--text-primary)" : "2px solid transparent",
            marginBottom: -1,
          }}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
