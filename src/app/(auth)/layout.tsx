export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-dark px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-bg-surface p-8 shadow-2xl">
        {children}
      </div>
    </div>
  );
}
