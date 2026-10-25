"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const items = [
  [
    "/",
    "Accounts",
    "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  ],
  ["/invoices", "Payments", "M4 5h16v14H4zM4 9h16M8 14h4"],
  ["/investment", "Investment plan", "M4 19V9m6 10V5m6 14v-7m4 7H2"],
  [
    "/rules",
    "Automation rules",
    "M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6zM9 12l2 2 4-4",
  ],
  [
    "/world-agents",
    "Agent connections",
    "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  ],
];
export function Navigation({ preview = false }: { preview?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation">
      {items.map(([href, title, icon]) => (
        <Link
          href={
            preview && href === "/world-agents" ? `${href}?preview=1` : href
          }
          key={href}
          aria-current={
            pathname === href ||
            (href !== "/" && pathname.startsWith(`${href}/`))
              ? "page"
              : undefined
          }
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={icon} />
          </svg>
          {title}
        </Link>
      ))}
    </nav>
  );
}
