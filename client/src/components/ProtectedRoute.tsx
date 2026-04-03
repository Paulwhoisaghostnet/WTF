import { type ReactNode } from "react";
import { Redirect } from "wouter";
import { Hourglass } from "react95";
import { useAuth } from "../lib/auth-context";
import type { UserRole } from "@shared/types";

interface ProtectedRouteProps {
  children: ReactNode;
  roles?: UserRole[];
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
        }}
      >
        <Hourglass size={32} />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Redirect to="/dashboard" />;
  }

  return <>{children}</>;
}
