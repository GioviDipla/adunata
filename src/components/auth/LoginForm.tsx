"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginForm() {
  const router = useRouter();
  const next = "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  async function handleOAuth(provider: "google") {
    setError(null);
    setOauthLoading(provider);
    sessionStorage.setItem("login_next", next);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setOauthLoading(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-font-white/10 bg-bg-surface/40 p-6 backdrop-blur-xl sm:p-8"
      style={{ boxShadow: "0 20px 50px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)" }}
    >
      {/* Google OAuth */}
      <button
        type="button"
        onClick={() => handleOAuth("google")}
        disabled={oauthLoading !== null || loading}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-font-white/12 bg-white/8 px-5 py-3 text-sm font-medium text-font-primary backdrop-blur-sm transition-all hover:bg-white/12 hover:border-font-white/20 active:scale-[0.98] disabled:opacity-50"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        {oauthLoading === "google" ? "Reindirizzamento…" : "Accedi con Google"}
      </button>

      {/* Divider */}
      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-font-white/8" />
        <span className="text-xs text-font-muted">oppure email</span>
        <div className="h-px flex-1 bg-font-white/8" />
      </div>

      {/* Email/Password */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          icon={<Mail className="h-4 w-4" />}
          required
        />

        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock className="h-4 w-4" />}
          required
        />

        {error && (
          <div className="rounded-lg bg-bg-red/10 px-4 py-2.5 text-sm text-bg-red">
            {error}
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" loading={loading}>
          Accedi
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-font-secondary">
        Nessun account?{" "}
        <Link
          href="/register"
          className="font-medium text-font-accent hover:underline"
        >
          Creane uno gratis
        </Link>
      </p>
    </div>
  );
}
