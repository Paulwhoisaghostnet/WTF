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
import {
  readPersistedWalletSession,
  WALLET_SESSION_EVENT,
  WALLET_SESSION_KEY,
} from "./tezos";
import type { WalletConnectionResult } from "./tezos";

interface WalletContextType {
  address: string | null;
  isConnecting: boolean;
  providerName: string | null;
  connect: () => Promise<WalletConnectionResult>;
  disconnect: () => Promise<void>;
}

interface LinkedWalletRow {
  walletAddress: string;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  // Rehydrate synchronously from localStorage so the UI shows the connected
  // address immediately on page load — no Beacon/Octez init, no RPC call,
  // and crucially no signature prompt just because the user came back to the site.
  const initialSession = readPersistedWalletSession();
  const [address, setAddress] = useState<string | null>(initialSession?.address ?? null);
  const [providerName, setProviderName] = useState<string | null>(
    initialSession?.providerName ?? null,
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const connectInFlight = useRef<Promise<WalletConnectionResult> | null>(null);
  // Track which (user, wallet) pairs we've already attempted to link this session
  // so we don't keep retrying on every render once it's confirmed linked.
  const linkAttempted = useRef<Set<string>>(new Set());
  const { user } = useAuth();
  const qc = useQueryClient();

  // Keep our state synced with the persisted wallet session. This fires when:
  //   - connectWallet() / disconnectWallet() write to localStorage
  //   - another tab connects/disconnects the wallet (cross-tab via 'storage')
  useEffect(() => {
    const sync = () => {
      const session = readPersistedWalletSession();
      setAddress(session?.address ?? null);
      setProviderName(session?.providerName ?? null);
      if (!session) linkAttempted.current.clear();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === WALLET_SESSION_KEY) sync();
    };
    window.addEventListener(WALLET_SESSION_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(WALLET_SESSION_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const linkWalletToUser = useCallback(
    async (walletAddress: string) => {
      if (!user || !walletAddress) return;
      try {
        // First check whether this wallet is already linked to the current user.
        // GET /api/wallets is web2-only and cached by react-query, so this is cheap.
        // If it's already linked, we just refresh the portfolio — no signature prompt.
        const wallets = await qc.fetchQuery<LinkedWalletRow[]>({
          queryKey: ["wallets"],
          queryFn: () => api.get<LinkedWalletRow[]>("/api/wallets"),
        });
        const alreadyLinked = wallets.some(
          (w) => w.walletAddress === walletAddress,
        );

        if (alreadyLinked) {
          try {
            await api.post(
              `/api/wallets/${encodeURIComponent(walletAddress)}/sync`,
            );
          } catch (syncErr) {
            console.warn("Wallet portfolio sync failed:", syncErr);
          }
          qc.invalidateQueries({ queryKey: ["wtf-balance"] });
          return;
        }

        // Wallet is not yet linked to this account → this is a real linking event,
        // so a signature is genuinely required to prove ownership.
        const { nonce, message } = await api.post<{ nonce: string; message: string }>(
          "/api/wallets/challenge",
          { walletAddress },
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
          await api.post(
            `/api/wallets/${encodeURIComponent(walletAddress)}/sync`,
          );
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
    [qc, user],
  );

  // When the user becomes available AND we have a cached wallet address,
  // attempt to link it. linkWalletToUser will short-circuit (no signature)
  // if the wallet is already in the user's linked-wallets list, which is the
  // common case on every refresh.
  useEffect(() => {
    if (!user || !address) return;
    const key = `${user.id}:${address}`;
    if (linkAttempted.current.has(key)) return;
    linkAttempted.current.add(key);
    linkWalletToUser(address).catch((err) => {
      console.warn("[WTF] wallet link attempt failed:", err);
      // Allow another attempt later (e.g. after disconnect/reconnect).
      linkAttempted.current.delete(key);
    });
  }, [user, address, linkWalletToUser]);

  const connect = useCallback(async () => {
    if (connectInFlight.current) return connectInFlight.current;

    const task = (async (): Promise<WalletConnectionResult> => {
      setIsConnecting(true);
      try {
        const tezos = await import("./tezos");
        const result = await tezos.connectWallet();
        // connectWallet() persists the session itself; dispatched event will
        // also update our state, but set it eagerly so consumers see it now.
        setAddress(result.address);
        setProviderName(result.providerName);
        // Reset linking attempts so a fresh user-initiated connect always
        // re-validates linkage.
        linkAttempted.current.clear();
        await linkWalletToUser(result.address);
        return result;
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
    } catch (err) {
      console.error("Wallet disconnect failed:", err);
    } finally {
      // disconnectWallet() also clears persisted session + dispatches event,
      // but clear local state eagerly for snappier UI.
      setAddress(null);
      setProviderName(null);
      linkAttempted.current.clear();
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
