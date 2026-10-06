import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({ next: typeof search["next"] === "string" ? search["next"] : "/data-sources" }),
  head: () => ({
    meta: [
      { title: "Administrator Sign In | OpsMind AI" },
      { name: "description", content: "Secure administrator access to OpsMind AI company data source configuration." },
      { property: "og:title", content: "Administrator Sign In | OpsMind AI" },
      { property: "og:description", content: "Secure administrator access to OpsMind AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      const next = sessionStorage.getItem("opsmind-auth-next");
      sessionStorage.removeItem("opsmind-auth-next");
      void navigate({ to: next?.startsWith("/") && !next.startsWith("//") ? next : "/data-sources" });
    });
  }, [navigate]);

  async function signIn() {
    setBusy(true);
    const intended = new URLSearchParams(window.location.search).get("next");
    sessionStorage.setItem("opsmind-auth-next", intended?.startsWith("/") && !intended.startsWith("//") ? intended : "/data-sources");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth",
      extraParams: { prompt: "select_account" },
    });
    if (result.error) {
      toast.error(result.error.message);
      setBusy(false);
      return;
    }
    if (!result.redirected) {
      const next = sessionStorage.getItem("opsmind-auth-next") ?? "/data-sources";
      sessionStorage.removeItem("opsmind-auth-next");
      navigate({ to: next });
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-md rounded-md border border-border bg-surface p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Administrator access</h1>
            <p className="text-sm text-muted-foreground">OpsMind AI · Company data governance</p>
          </div>
        </div>
        <p className="mb-6 text-sm leading-6 text-muted-foreground">
          Sign in to connect company databases, review approved fields, and activate agent access.
        </p>
        <Button className="w-full" onClick={signIn} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Continue with Google
        </Button>
      </section>
    </main>
  );
}