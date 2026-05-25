import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import {
  canParticipate as roleCanParticipate,
  isAdmin as roleIsAdmin,
  type UserRole,
  type XpTierInfo,
} from "@shared/types";
import type { WtfCurseStatus } from "@shared/curses";

interface User {
  id: number;
  username: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  role: UserRole;
  roles?: UserRole[];
  curses?: WtfCurseStatus[];
  experiencePoints?: number;
  xpTier?: XpTierInfo;
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
  /** True when the account has a local password set (vs wallet/social only). */
  hasPassword?: boolean;
  welcomedToWtfOs?: boolean;
  welcomedToWtfOsAt?: string | null;
  gmWelcomeUtcDay?: string | null;
  gmWelcomeLastSeenAt?: string | null;
  gmWelcome?: {
    shouldShow: true;
    utcDay: string;
    projectId: number;
    projectName: string;
    collectionUrl: string;
    authorName: string;
    authorAddress: string;
    asset: {
      id: string;
      name: string;
      onChainId: number | null;
      iteration: number | null;
      imageUrl: string;
      mimeType?: string | null;
      width?: number | null;
      height?: number | null;
    };
  } | null;
  effectivePermissions?: Record<string, boolean>;
  wtfOsAccess?: {
    surfaceIds: string[];
    routePatterns: string[];
    adminPanelTabs: string[];
    automationHandles: string[];
  };
  createdAt: string;
}

interface WalletVerifyResult {
  action: "login" | "register";
  user?: User;
  walletAddress?: string;
  publicKey?: string;
}

interface WalletRegisterData {
  walletAddress: string;
  publicKey: string;
  signature: string;
  nonce: string;
  username: string;
  password?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  canParticipate: boolean;
  hasPermission: (key: string) => boolean;
  login: (username: string, password: string) => Promise<User>;
  register: (data: { username: string; password: string }) => Promise<User>;
  walletLogin: () => Promise<WalletVerifyResult>;
  walletRegister: (data: WalletRegisterData) => Promise<User>;
  completeWelcome: () => Promise<User>;
  completeGmWelcome: () => Promise<User>;
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

  const completeWelcomeMutation = useMutation({
    mutationFn: () => api.post<User>("/api/auth/welcome/complete"),
    onSuccess: (data) => qc.setQueryData(["auth", "user"], data),
  });

  const completeGmWelcomeMutation = useMutation({
    mutationFn: () => api.post<User>("/api/auth/gm-welcome/complete"),
    onSuccess: (data) => qc.setQueryData(["auth", "user"], data),
  });

  const walletLogin = async (): Promise<WalletVerifyResult> => {
    const tezos = await import("./tezos");
    const wallet = await tezos.connectWallet();

    const { nonce, message } = await api.post<{ nonce: string; message: string }>(
      "/api/auth/wallet/challenge",
      { walletAddress: wallet.address }
    );

    const { signature, publicKey } = await tezos.signPayload(message);

    const result = await api.post<WalletVerifyResult>(
      "/api/auth/wallet/verify",
      {
        walletAddress: wallet.address,
        publicKey,
        signature,
        nonce,
      }
    );

    if (result.action === "login" && result.user) {
      qc.setQueryData(["auth", "user"], result.user);
    }

    return result;
  };

  const walletRegister = async (data: WalletRegisterData): Promise<User> => {
    const result = await api.post<{ action: string; user: User }>(
      "/api/auth/wallet/register",
      data
    );
    qc.setQueryData(["auth", "user"], result.user);
    return result.user;
  };

  const value: AuthContextType = {
    user: user ?? null,
    isLoading,
    isAdmin: roleIsAdmin(user?.roles ?? user?.role),
    canParticipate: user ? roleCanParticipate(user.roles ?? user.role) : false,
    hasPermission: (key: string) =>
      user?.effectivePermissions?.[key] ?? false,
    login: (username, password) =>
      loginMutation.mutateAsync({ username, password }),
    register: (data) => registerMutation.mutateAsync(data),
    walletLogin,
    walletRegister,
    completeWelcome: () => completeWelcomeMutation.mutateAsync(),
    completeGmWelcome: () => completeGmWelcomeMutation.mutateAsync(),
    logout: async () => { await logoutMutation.mutateAsync(); },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
