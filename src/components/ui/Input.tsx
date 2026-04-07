import { type InputHTMLAttributes, type ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export function Input({
  label,
  error,
  icon,
  className = "",
  id,
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-font-secondary"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-font-muted">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          className={`w-full rounded-lg border border-border bg-bg-card px-3 py-2.5 text-sm text-font-primary placeholder:text-font-muted transition-colors focus:border-bg-accent focus:outline-none focus:ring-2 focus:ring-bg-accent/20 ${icon ? "pl-9" : ""} ${error ? "border-bg-red focus:border-bg-red focus:ring-bg-red/20" : ""} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-bg-red">{error}</p>}
    </div>
  );
}
