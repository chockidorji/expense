"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Receipt, PiggyBank, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, match: (p: string) => p === "/dashboard" },
  { href: "/transactions", label: "Txns", icon: Receipt, match: (p: string) => p.startsWith("/transactions") },
  { href: "/settings/budgets", label: "Budgets", icon: PiggyBank, match: (p: string) => p.startsWith("/settings/budgets") },
  { href: "/settings", label: "More", icon: Menu, match: (p: string) => p === "/settings" || p.startsWith("/settings/categories") || p === "/upload" },
];

export default function BottomNav() {
  const pathname = usePathname() ?? "";

  // Hide on auth screens
  if (pathname.startsWith("/auth")) return null;

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 md:hidden",
        "border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "pb-[env(safe-area-inset-bottom)]"
      )}
    >
      <ul className="grid grid-cols-4">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                aria-label={tab.label}
                className={cn(
                  "flex h-16 w-full flex-col items-center justify-center gap-1 text-xs cursor-pointer transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} aria-hidden />
                <span className={cn(active && "font-medium")}>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
