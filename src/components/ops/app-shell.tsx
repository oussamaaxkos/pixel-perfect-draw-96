import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  BadgeCheck,
  BarChart3,
  BookOpen,
  Boxes,
  Brain,
  ClipboardList,
  Cpu,
  FileStack,
  GaugeCircle,
  Layers,
  Moon,
  ScrollText,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  Wrench,
  Database,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const NAV: Array<{ group: string; items: Array<{ to: string; label: string; icon: typeof Activity }> }> = [
  {
    group: "Operate",
    items: [
      { to: "/", label: "Dashboard", icon: GaugeCircle },
      { to: "/copilot", label: "AI Copilot", icon: Brain },
      { to: "/approvals", label: "Approvals", icon: BadgeCheck },
      { to: "/runs", label: "Agent Runs", icon: Activity },
    ],
  },
  {
    group: "Data",
    items: [
      { to: "/data-sources", label: "Data Sources", icon: Database },
      { to: "/customers", label: "Customers", icon: Users },
      { to: "/orders", label: "Orders", icon: Boxes },
      { to: "/knowledge", label: "Knowledge Base", icon: BookOpen },
      { to: "/ingestion", label: "Ingestion", icon: FileStack },
    ],
  },
  {
    group: "AI Engineering",
    items: [
      { to: "/evaluation", label: "Evaluation", icon: ClipboardList },
      { to: "/observability", label: "Observability", icon: BarChart3 },
      { to: "/prompts", label: "Prompts", icon: Layers },
      { to: "/models", label: "Models", icon: Cpu },
      { to: "/tools", label: "Tools & MCP", icon: Wrench },
    ],
  },
  {
    group: "Governance",
    items: [
      { to: "/audit", label: "Audit Logs", icon: ScrollText },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("opsmind-theme");
    const isDark = stored ? stored === "dark" : true;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  return (
    <button
      type="button"
      aria-label="Toggle colour theme"
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        localStorage.setItem("opsmind-theme", next ? "dark" : "light");
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [identity, setIdentity] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setIdentity(data.user?.email ?? null));
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">OpsMind AI</p>
            <p className="text-[11px] leading-tight text-muted-foreground">Agentic Operations</p>
          </div>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-2 pb-6">
          {NAV.map((section) => (
            <div key={section.group}>
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {section.group}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <Icon className={cn("h-4 w-4", active && "text-primary")} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border px-4 py-3 text-[11px] text-muted-foreground">
          <p>Environment: demo</p>
          <p>Region: eu-central</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">OpsMind AI</span>
          </div>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
            <span className="inline-flex h-2 w-2 rounded-full bg-success" />
            Agent runtime healthy
            <span className="text-border">|</span>
            Human-in-the-loop enforced for HIGH and CRITICAL actions
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {identity ? <div className="flex items-center gap-2"><span className="hidden max-w-44 truncate text-xs sm:block">{identity}</span><Button size="icon-sm" variant="ghost" title="Sign out" aria-label="Sign out" onClick={async () => { await supabase.auth.signOut(); window.location.assign("/"); }}><LogOut /></Button></div> : <Button asChild size="sm" variant="outline"><Link to="/auth" search={{ next: "/data-sources" }}>Admin sign in</Link></Button>}
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-3 py-2 lg:hidden">
          {NAV.flatMap((s) => s.items).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="whitespace-nowrap rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="flex-1 px-4 py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px] space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
