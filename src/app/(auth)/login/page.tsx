"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Mail, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-bg-accent/10">
          <Sparkles className="h-7 w-7 text-font-accent" />
        </div>
        <h1 className="text-2xl font-bold text-font-primary">The Gathering</h1>
        <p className="text-sm text-font-secondary">
          Sign in to your account
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          icon={<Mail className="h-4 w-4" />}
          required
        />

        <Input
          label="Password"
          type="password"
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock className="h-4 w-4" />}
          required
        />

        {error && (
          <div className="rounded-lg bg-bg-red/10 px-4 py-3 text-sm text-bg-red">
            {error}
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-2">
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-font-secondary">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-medium text-font-accent hover:underline"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
