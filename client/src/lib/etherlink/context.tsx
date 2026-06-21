import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, isAuthSessionInvalidError } from "../api";
import { useAuth } from "../auth-context";
import {
  connectEtherlinkWallet,
  disconnectEtherlinkWallet,
  ETHERLINK_SESSION_EVENT,
  ETHERLINK_SESSION_KEY,
  readPersistedEtherlinkSession,
  signEtherlinkMessage,
  type EtherlinkWalletPreference,
} from "./wallet";

interface EtherlinkWalletContextType {
  address: string | null;
  chainId: number | null;
  network: string | null;
  providerName: string | null;
  isConnecting: boolean;
  connect: (preference?: EtherlinkWalletPreference) => Promise<void>;
  disconnect: () => Promise<void>;
  linkConnectedWallet: () => Promise<void>;
}

interface LinkedEtherlinkWalletRow {
  id: number;
  walletAddress: string;
  chainId: number;
}

const EtherlinkWalletContext = createContext<EtherlinkWalletContextType | null>(null);

export function EtherlinkWalletProvider({ children }: { children: ReactNode }) {
  const initialSession = readPersistedEtherlinkSession();
  const [address, setAddress] = useState<string | null>(initialSession?.address ?? null);
  const [chainId, setChainId] = useState<number | null>(initialSession?.chainId ?? null);
  const [network, setNetwork] = useState<string | null>(initialSession?.network ?? null);
  const [providerName, setProviderName] = useState<string | null>(
    initialSession?.providerName ?? null,
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const connectInFlight = useRef<Promise<void> | null>(null);
  const linkAttempted = useRef<Set<string>>(new Set());
  const qc = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    const sync = () => {
      const session = readPersistedEtherlinkSession();
      setAddress(session?.address ?? null);
      setChainId(session?.chainId ?? null);
      setNetwork(session?.network ?? null);
      setProviderName(session?.providerName ?? null);
      if (!session) linkAttempted.current.clear();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === ETHERLINK_SESSION_KEY) sync();
    };
    window.addEventListener(ETHERLINK_SESSION_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ETHERLINK_SESSION_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const linkWalletToUser = useCallback(
    async (walletAddress: string, activeChainId: number) => {
      if (!user || !walletAddress || !activeChainId) return;

      const wallets = await qc.fetchQuery<LinkedEtherlinkWalletRow[]>({
        queryKey: ["etherlink-wallets"],
        queryFn: () => api.get<LinkedEtherlinkWalletRow[]>("/api/etherlink/wallets"),
      });
      const existing = wallets.find(
        (wallet) =>
          wallet.chainId === activeChainId &&
          wallet.walletAddress.toLowerCase() === walletAddress.toLowerCase(),
      );
      if (existing) {
        await api.post(`/api/etherlink/wallets/${existing.id}/sync`).catch((err) => {
          console.warn("[WTF] Etherlink wallet sync failed:", err);
        });
        qc.invalidateQueries({ queryKey: ["etherlink-wallets"] });
        qc.invalidateQueries({ queryKey: ["etherlink-assets"] });
        return;
      }

      const challenge = await api.post<{
        nonce: string;
        message: string;
        chainId: number;
        network: string;
      }>("/api/etherlink/wallets/challenge", {
        walletAddress,
        chainId: activeChainId,
      });
      const signature = await signEtherlinkMessage(challenge.message, walletAddress);
      await api.post("/api/etherlink/wallets", {
        walletAddress,
        chainId: challenge.chainId,
        nonce: challenge.nonce,
        signature,
        providerKey: readPersistedEtherlinkSession()?.providerKey,
        providerName: readPersistedEtherlinkSession()?.providerName,
      });
      qc.invalidateQueries({ queryKey: ["etherlink-wallets"] });
      qc.invalidateQueries({ queryKey: ["etherlink-assets"] });
    },
    [qc, user],
  );

  useEffect(() => {
    if (!user) {
      linkAttempted.current.clear();
      return;
    }
    if (!address || !chainId) return;
    const key = `${user.id}:${chainId}:${address.toLowerCase()}`;
    if (linkAttempted.current.has(key)) return;
    linkAttempted.current.add(key);
    linkWalletToUser(address, chainId).catch((err) => {
      if (isAuthSessionInvalidError(err)) return;
      console.warn("[WTF] Etherlink wallet link attempt failed:", err);
      linkAttempted.current.delete(key);
    });
  }, [user, address, chainId, linkWalletToUser]);

  const connect = useCallback(
    async (preference: EtherlinkWalletPreference = "temple") => {
      if (connectInFlight.current) return connectInFlight.current;

      const task = (async () => {
        setIsConnecting(true);
        try {
          const result = await connectEtherlinkWallet(preference);
          setAddress(result.address);
          setChainId(result.chainId);
          setNetwork(result.network);
          setProviderName(result.providerName);
          linkAttempted.current.clear();
          await linkWalletToUser(result.address, result.chainId);
        } finally {
          setIsConnecting(false);
          connectInFlight.current = null;
        }
      })();

      connectInFlight.current = task;
      return task;
    },
    [linkWalletToUser],
  );

  const disconnect = useCallback(async () => {
    await disconnectEtherlinkWallet();
    setAddress(null);
    setChainId(null);
    setNetwork(null);
    setProviderName(null);
    linkAttempted.current.clear();
  }, []);

  const linkConnectedWallet = useCallback(async () => {
    if (!address || !chainId) throw new Error("Connect an Etherlink wallet first");
    await linkWalletToUser(address, chainId);
  }, [address, chainId, linkWalletToUser]);

  return (
    <EtherlinkWalletContext.Provider
      value={{
        address,
        chainId,
        network,
        providerName,
        isConnecting,
        connect,
        disconnect,
        linkConnectedWallet,
      }}
    >
      {children}
    </EtherlinkWalletContext.Provider>
  );
}

export function useEtherlinkWallet() {
  const ctx = useContext(EtherlinkWalletContext);
  if (!ctx) {
    throw new Error("useEtherlinkWallet must be used within EtherlinkWalletProvider");
  }
  return ctx;
}
