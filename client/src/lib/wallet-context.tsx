import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth-context";

interface WalletContextType {
  address: string | null;
  isConnecting: boolean;
  providerName: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [providerName, setProviderName] = useState<string | null>(null);
  const connectInFlight = useRef<Promise<void> | null>(null);
  const { user } = useAuth();
  const qc = useQueryClient();

  const linkWalletToUser = useCallback(
    async (walletAddress: string) => {
      if (!user || !walletAddress) return;
      try {
        const { nonce, message } = await api.post<{ nonce: string; message: string }>(
          "/api/wallets/challenge",
          { walletAddress }
        );

        const tezos = await import("./tezos");
        const { signature, publicKey } = await tezos.signPayload(message);

        await api.post("/api/wallets", {
          walletAddress,
          publicKey,
          signature,
          nonce,
        });
        try {
          await api.post(`/api/wallets/${encodeURIComponent(walletAddress)}/sync`);
        } catch (syncErr) {
          console.warn("Wallet linked, but sync failed:", syncErr);
        }
        qc.invalidateQueries({ queryKey: ["wallets"] });
        qc.invalidateQueries({ queryKey: ["wtf-balance"] });
      } catch (err: any) {
        const message = err?.message || "";
        if (
          /already linked/i.test(message) &&
          !/another account/i.test(message)
        ) {
          return;
        }
        throw err;
      }
    },
    [qc, user]
  );

  useEffect(() => {
    (async () => {
      try {
        const tezos = await import("./tezos");
        const account = await tezos.getActiveAccount();
        if (account) {
          setAddress(account.address);
          setProviderName(account.providerName);
          await linkWalletToUser(account.address);
        }
      } catch {
        // no active account
      }
    })();
  }, [linkWalletToUser]);

  const connect = useCallback(async () => {
    if (connectInFlight.current) return connectInFlight.current;

    const task = (async () => {
    setIsConnecting(true);
    try {
      const tezos = await import("./tezos");
      const result = await tezos.connectWallet();
      setAddress(result.address);
      setProviderName(result.providerName);
      await linkWalletToUser(result.address);
    } catch (err) {
      console.error("Wallet connection failed:", err);
      throw err;
    } finally {
      setIsConnecting(false);
      connectInFlight.current = null;
    }
    })();

    connectInFlight.current = task;
    return task;
  }, [linkWalletToUser]);

  const disconnect = useCallback(async () => {
    try {
      const tezos = await import("./tezos");
      await tezos.disconnectWallet();
      setAddress(null);
      setProviderName(null);
    } catch (err) {
      console.error("Wallet disconnect failed:", err);
    }
  }, []);

  return (
    <WalletContext.Provider
      value={{ address, isConnecting, providerName, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
