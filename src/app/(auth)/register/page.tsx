"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, Mail, Lock, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordStrength } from "@/components/ui/PasswordStrength";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-bg-green/10">
          <CheckCircle className="h-7 w-7 text-bg-green" />
        </div>
        <h2 className="text-xl font-bold text-font-primary">Check your email</h2>
        <p className="text-sm text-font-secondary">
          We&apos;ve sent a verification link to{" "}
          <span className="font-medium text-font-primary">{email}</span>.
          Please click the link to activate your account.
        </p>
        <Link
          href="/login"
          className="mt-4 text-sm font-medium text-font-accent hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-bg-accent/10">
          <Sparkles className="h-7 w-7 text-font-accent" />
        </div>
        <h1 className="text-2xl font-bold text-font-primary">The Gathering</h1>
        <p className="text-sm text-font-secondary">
          Create your account
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
          placeholder="At least 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock className="h-4 w-4" />}
          required
        />

        <PasswordStrength password={password} />

        <Input
          label="Confirm password"
          type="password"
          placeholder="Repeat your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          icon={<Lock className="h-4 w-4" />}
          required
        />

        {error && (
          <div className="rounded-lg bg-bg-red/10 px-4 py-3 text-sm text-bg-red">
            {error}
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-2">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-font-secondary">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-font-accent hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
