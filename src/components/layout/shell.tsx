"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../ui/shared";
import { usePathname } from "next/navigation";
import {
  CookingPot,
  LayoutDashboard,
  Users,
  Package,
  BookOpen,
  CalendarDays,
  History,
  ArrowUpRight,
  Leaf,
} from "lucide-react";
const links = [
  ["/dashboard", "Dashboard", LayoutDashboard],
  ["/household", "Household", Users],
  ["/inventory", "Kitchen Inventory", Package],
  ["/recipes", "Recipe Library", BookOpen],
  ["/meal-planner", "Meal Planner", CalendarDays],
  ["/activity", "Activity History", History],
] as const;
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [name, setName] = useState("Your household");
  useEffect(() => {
    api<{ name: string }>("household")
      .then((h) => setName(h.name))
      .catch(() => {});
  }, []);
  return (
    <div className="app">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand">
          <span className="brand-icon">
            <CookingPot size={27} />
          </span>
          <span>
            Rasoi<span className="brand-light">OS</span>
            <small>A little less kitchen chaos.</small>
          </span>
        </Link>
        <div className="nav-caption">YOUR KITCHEN, TOGETHER</div>
        <nav>
          {links.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              className={path === href ? "nav-link active" : "nav-link"}
            >
              <Icon size={19} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <Leaf size={24} />
          <h3>Made for your family.</h3>
          <p>Different tastes. Shared meals. A kitchen that remembers.</p>
          <span>
            RENAISSANCE 2026 <ArrowUpRight size={13} />
          </span>
        </div>
        <div className="household-chip">
          <div className="avatar">{name.slice(0, 1)}</div>
          <div>
            <strong>{name}</strong>
            <small>Single-household demo</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            <span className="status-dot" /> Your kitchen, in sync
          </span>
          <span className="demo-label">
            PHASE 02 <span>·</span> LOCAL DEMO
          </span>
        </header>
        <main>{children}</main>
        <footer>
          RasoiOS <span>·</span> The Kitchen That Remembers, Decides &
          Coordinates.
        </footer>
      </div>
    </div>
  );
}
