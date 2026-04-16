# OAuth Google/Apple + Password Strength Indicator

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google and Apple OAuth sign-in to the login page, create the auth callback route, and add a password strength indicator to the register page.

**Architecture:** OAuth buttons on login page call `supabase.auth.signInWithOAuth()` which redirects to the provider, then back to `/auth/callback` which exchanges the code for a session via server-side Supabase client. Password strength is a pure client-side component showing a colored bar + criteria checklist.

**Tech Stack:** Next.js App Router, Supabase Auth (`@supabase/ssr`), Tailwind CSS, lucide-react icons.

---

### Task 1: Create the auth callback route handler

**Files:**
- Create: `src/app/auth/callback/route.ts`

This is needed FIRST because OAuth redirects here after provider login. Without it, OAuth buttons would fail silently.

- [ ] **Step 1: Create the callback route**

```ts
// src/app/auth/callback/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Auth error — redirect to login with error hint
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/auth/callback/route.ts
git commit -m "feat(auth): add OAuth callback route for code exchange"
```

---

### Task 2: Add OAuth buttons to the login page

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Add the OAuth handler and buttons to login page**

Add the `signInWithOAuth` handler and two buttons above the existing form. The full updated file:

```tsx
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
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  async function handleOAuth(provider: "google" | "apple") {
    setError(null);
    setOauthLoading(provider);
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
    // If no error, browser redirects to provider — no need to setLoading(false)
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
        <p className="text-sm text-font-secondary">Sign in to your account</p>
      </div>

      {/* OAuth buttons */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => handleOAuth("google")}
          disabled={oauthLoading !== null || loading}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-bg-card px-4 py-2.5 text-sm font-medium text-font-primary transition-colors hover:bg-bg-hover disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {oauthLoading === "google" ? "Redirecting…" : "Continue with Google"}
        </button>

        <button
          type="button"
          onClick={() => handleOAuth("apple")}
          disabled={oauthLoading !== null || loading}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-bg-card px-4 py-2.5 text-sm font-medium text-font-primary transition-colors hover:bg-bg-hover disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
          </svg>
          {oauthLoading === "apple" ? "Redirecting…" : "Continue with Apple"}
        </button>
      </div>

      {/* Divider */}
      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-font-muted">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Email/password form */}
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(auth)/login/page.tsx
git commit -m "feat(auth): add Google and Apple OAuth buttons to login page"
```

---

### Task 3: Add password strength indicator to the register page

**Files:**
- Create: `src/components/ui/PasswordStrength.tsx`
- Modify: `src/app/(auth)/register/page.tsx`

- [ ] **Step 1: Create the PasswordStrength component**

```tsx
// src/components/ui/PasswordStrength.tsx
"use client";

import { useMemo } from "react";
import { Check, X } from "lucide-react";

interface PasswordStrengthProps {
  password: string;
}

const criteria = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "Uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "Number", test: (p: string) => /\d/.test(p) },
  { label: "Special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const strengthLevels = [
  { label: "Weak", color: "bg-bg-red", textColor: "text-bg-red" },
  { label: "Fair", color: "bg-orange-500", textColor: "text-orange-500" },
  { label: "Good", color: "bg-yellow-500", textColor: "text-yellow-500" },
  { label: "Strong", color: "bg-bg-green", textColor: "text-bg-green" },
  { label: "Very strong", color: "bg-emerald-400", textColor: "text-emerald-400" },
];

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const passed = useMemo(
    () => criteria.filter((c) => c.test(password)),
    [password]
  );

  if (!password) return null;

  const level = strengthLevels[Math.min(passed.length, strengthLevels.length) - 1];
  const ratio = passed.length / criteria.length;

  return (
    <div className="flex flex-col gap-2">
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-bg-hover">
          <div
            className={`h-full rounded-full transition-all duration-300 ${level?.color ?? "bg-bg-hover"}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        {level && (
          <span className={`text-xs font-medium ${level.textColor}`}>
            {level.label}
          </span>
        )}
      </div>

      {/* Criteria checklist */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
        {criteria.map((c) => {
          const met = c.test(password);
          return (
            <li key={c.label} className="flex items-center gap-1.5 text-xs">
              {met ? (
                <Check className="h-3 w-3 text-bg-green" />
              ) : (
                <X className="h-3 w-3 text-font-muted" />
              )}
              <span className={met ? "text-font-secondary" : "text-font-muted"}>
                {c.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Add the PasswordStrength component to the register page**

In `src/app/(auth)/register/page.tsx`, add the import and render the component right after the password Input field (after line 103):

Add import at line 6:
```tsx
import { PasswordStrength } from "@/components/ui/PasswordStrength";
```

Add after the password Input (after the closing `/>` of the password Input on line 103):
```tsx
        <PasswordStrength password={password} />
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/PasswordStrength.tsx src/app/(auth)/register/page.tsx
git commit -m "feat(auth): add password strength indicator to register page"
```

---

### Task 4: Update MANUAL_STEPS.md with Supabase provider configuration

**Files:**
- Modify: `MANUAL_STEPS.md`

- [ ] **Step 1: Add the manual steps for configuring OAuth providers in Supabase**

```markdown
## [STEP] — Enable Google OAuth in Supabase

When: before testing Google sign-in
What to do:
1. Go to Google Cloud Console → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Set Authorized redirect URI to: `https://<YOUR_SUPABASE_PROJECT>.supabase.co/auth/v1/callback`
4. Copy Client ID and Client Secret
5. Go to Supabase Dashboard → Authentication → Providers → Google
6. Enable Google, paste Client ID and Client Secret
7. Save

## [STEP] — Enable Apple OAuth in Supabase

When: before testing Apple sign-in
What to do:
1. Go to Apple Developer → Certificates, Identifiers & Profiles
2. Register a new Service ID (enable "Sign In with Apple")
3. Configure the domain and return URL: `https://<YOUR_SUPABASE_PROJECT>.supabase.co/auth/v1/callback`
4. Create a key for Sign In with Apple, download the .p8 file
5. Go to Supabase Dashboard → Authentication → Providers → Apple
6. Enable Apple, paste Service ID, Team ID, Key ID, and the .p8 private key content
7. Save
```

- [ ] **Step 2: Commit**

```bash
git add MANUAL_STEPS.md
git commit -m "docs: add OAuth provider setup instructions to MANUAL_STEPS.md"
```

---

### Task 5: Verify build and test login flow

- [ ] **Step 1: Run TypeScript build check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Start dev server and visually verify**

```bash
npm run dev
```

Check in browser:
- `/login` shows Google and Apple buttons above email/password form with "or" divider
- `/register` shows password strength bar and criteria checklist that updates as you type
- OAuth buttons show "Redirecting…" state when clicked (will fail without provider config — that's expected)
- Existing email/password login still works

- [ ] **Step 3: Final commit if any fixes needed**
