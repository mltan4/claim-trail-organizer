import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table2, Archive, Settings as SettingsIcon, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Sheet", icon: Table2, end: true },
  { to: "/vault", label: "Evidence vault", icon: Archive },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function AppLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="container max-w-[1400px] flex h-16 items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4 10-11"/></svg>
            </div>
            <div className="leading-tight">
              <div className="font-serif text-lg">ClaimTrail</div>
              <div className="text-[11px] text-muted-foreground -mt-0.5">Audit-ready job search records</div>
            </div>
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive ? "bg-primary-soft text-primary-deep font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-sm text-muted-foreground truncate max-w-[160px]">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-[1400px] animate-fade-up">
        <Outlet />
      </main>

      <nav className="md:hidden sticky bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
        <div className="grid grid-cols-3">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[10px]",
                  isActive ? "text-primary-deep" : "text-muted-foreground"
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <footer className="container max-w-[1400px] py-6 text-center text-xs text-muted-foreground">
        ClaimTrail helps you organize job search records. It does not submit unemployment claims or guarantee eligibility.
      </footer>
    </div>
  );
}
