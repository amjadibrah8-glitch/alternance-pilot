"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Tableau de bord" },
  { href: "/opportunites", label: "Opportunités" },
  { href: "/envois", label: "Candidatures" },
  { href: "/parametres", label: "Paramètres" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {ITEMS.map((i) => {
        const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${
              active ? "bg-surface font-medium text-ink shadow-[inset_0_0_0_1px_var(--line)]" : "text-muted hover:text-ink"
            }`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
