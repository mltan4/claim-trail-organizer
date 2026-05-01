import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">Loading…</div>
    );
  }
  if (!user) return <Navigate to="/auth" state={{ from: loc }} replace />;
  return <>{children}</>;
}
