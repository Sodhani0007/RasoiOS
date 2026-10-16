"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  CookingPot,
  LayoutDashboard,
  Users,
  Package,
  BookOpen,
  CalendarDays,
  History,
  Leaf,
} from "lucide-react";
import { api, ErrorBox } from "../ui/shared";
const familyLinks = [
  ["/family", "Family dashboard", LayoutDashboard],
  ["/family/choose-meal", "Choose My Meal", CalendarDays],
  ["/family/my-meals", "My meals", BookOpen],
  ["/family/my-preferences", "My preferences", Users],
  ["/family/requests", "Coordinate meals", CalendarDays],
  ["/household", "Household profiles", Users],
  ["/inventory", "Kitchen inventory", Package],
  ["/recipes", "Recipe library", BookOpen],
  ["/meal-planner", "Meal planner", CalendarDays],
  ["/activity", "Activity history", History],
  ["/family/settings", "Household settings", Users],
] as const;
const cookLinks = [
  ["/cook", "Cooking dashboard", CookingPot],
  ["/cook/today", "Today's meals", CalendarDays],
  ["/cook/ingredients", "Ingredient checklist", Package],
  ["/cook/preparation", "Preparation board", CookingPot],
] as const;
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const cook = path.startsWith("/cook");
  const [households, setHouseholds] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [selected, setSelected] = useState("demo-household");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const saved = sessionStorage.getItem("rasoi-household") || "demo-household";
    setSelected(saved);
    setReady(true);
    api<typeof households>("households")
      .then(setHouseholds)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="app">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <CookingPot size={27} />
          </span>
          <span>
            Rasoi<span className="brand-light">OS</span>
            <small>A little less kitchen chaos.</small>
          </span>
        </Link>
        <div className="nav-caption">{cook ? "COOK VIEW" : "FAMILY VIEW"}</div>
        <nav>
          {(cook ? cookLinks : familyLinks).map(([href, label, Icon]) => (
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
          <h3>Your kitchen, together.</h3>
          <p>Different tastes. Shared meals. A kitchen that remembers.</p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <label className="household-select">
            Household{" "}
            <select
              aria-label="Select household"
              value={selected}
              onChange={(e) => {
                sessionStorage.setItem("rasoi-household", e.target.value);
                sessionStorage.removeItem("rasoi-member");
                setSelected(e.target.value);
              }}
            >
              {households.length ? (
                households.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))
              ) : (
                <option value={selected}>Your household</option>
              )}
            </select>
          </label>
          <nav className="view-switch" aria-label="Switch view">
            <Link
              href="/family"
              className={!cook ? "button primary" : "button secondary"}
            >
              Family View
            </Link>
            <Link
              href="/cook"
              className={cook ? "button primary" : "button secondary"}
            >
              Cook View
            </Link>
          </nav>
        </header>
        <main>
          <ErrorBox message={error} />
          {ready ? (
            <div key={selected}>{children}</div>
          ) : (
            <div className="empty">Opening your kitchen…</div>
          )}
        </main>
        <footer>
          RasoiOS · The Kitchen That Remembers, Decides & Coordinates.
        </footer>
      </div>
    </div>
  );
}
