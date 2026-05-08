export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark-page-bg min-h-screen">
      {children}
    </div>
  );
}
