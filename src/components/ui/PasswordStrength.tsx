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
