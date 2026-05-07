export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing-root min-h-screen relative">
      <div className="absolute inset-0 grid-bg pointer-events-none" aria-hidden />
      {children}
    </div>
  );
}
