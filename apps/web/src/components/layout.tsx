import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Button } from "./ui";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition ${
    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
  }`;

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  };

  return (
    <Button variant="ghost" onClick={toggle} aria-label="Toggle dark mode">
      {dark ? "Light" : "Dark"}
    </Button>
  );
}

export function Layout() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="bg-linear-to-r from-primary to-accent bg-clip-text text-lg font-bold text-transparent"
            >
              Mini YouTube
            </Link>
            <nav className="flex gap-4" aria-label="Main">
              <NavLink to="/" end className={navClass}>
                Videos
              </NavLink>
              <NavLink to="/upload" className={navClass}>
                Upload
              </NavLink>
            </nav>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
