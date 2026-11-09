import { LogIn, LogOut, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useAuth } from "react-oidc-context";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useNotifications } from "../hooks/use-notifications";
import { NotificationToasts } from "./notification-toasts";
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
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}

function UserMenu() {
  const auth = useAuth();

  if (auth.isLoading) {
    return null;
  }
  if (!auth.isAuthenticated) {
    return (
      <Button variant="outline" onClick={() => void auth.signinRedirect()}>
        <LogIn className="size-4" />
        Sign in
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">{auth.user?.profile.preferred_username}</span>
      <Button variant="outline" onClick={() => void auth.signoutRedirect()}>
        <LogOut className="size-4" />
        Sign out
      </Button>
    </div>
  );
}

export function Layout() {
  const { toasts, dismiss } = useNotifications();
  return (
    <div className="min-h-screen">
      <NotificationToasts toasts={toasts} onDismiss={dismiss} />
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-lg font-bold text-primary">
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
          <div className="flex items-center gap-2">
            <UserMenu />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
