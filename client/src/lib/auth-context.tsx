import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { canParticipate as roleCanParticipate, isAdmin as roleIsAdmin, type UserRole } from "@shared/types";

interface User {
  id: number;
  username: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  role: UserRole;
  experiencePoints?: number;
  bio?: string;
  twitterHandle?: string;
  twitterVerified?: boolean;
  twitterPublic?: boolean;
  discordHandle?: string;
  discordVerified?: boolean;
  discordPublic?: boolean;
  emailPublic?: boolean;
  pfpImageUrl?: string;
  pfpTokenContract?: string;
  pfpTokenId?: string;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  canParticipate: boolean;
  login: (username: string, password: string) => Promise<User>;
  register: (data: { username: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["auth", "user"],
    queryFn: async () => {
      try {
        return await api.get<User>("/api/auth/user");
      } catch {
        return null;
      }
    },
  });

  const loginMutation = useMutation({
    mutationFn: (creds: { username: string; password: string }) =>
      api.post<User>("/api/auth/login", creds),
    onSuccess: (data) => qc.setQueryData(["auth", "user"], data),
  });

  const registerMutation = useMutation({
    mutationFn: (data: { username: string; password: string }) =>
      api.post<User>("/api/auth/register", data),
    onSuccess: (data) => qc.setQueryData(["auth", "user"], data),
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.post("/api/auth/logout"),
    onSuccess: () => qc.setQueryData(["auth", "user"], null),
  });

  const value: AuthContextType = {
    user: user ?? null,
    isLoading,
    isAdmin: user ? roleIsAdmin(user.role) : false,
    canParticipate: user ? roleCanParticipate(user.role) : false,
    login: (username, password) =>
      loginMutation.mutateAsync({ username, password }),
    register: (data) => registerMutation.mutateAsync(data),
    logout: async () => { await logoutMutation.mutateAsync(); },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
