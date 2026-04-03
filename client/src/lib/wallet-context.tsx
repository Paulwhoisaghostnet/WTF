import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

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

  useEffect(() => {
    (async () => {
      try {
        const tezos = await import("./tezos");
        const account = await tezos.getActiveAccount();
        if (account) {
          setAddress(account.address);
          setProviderName(account.providerName);
        }
      } catch {
        // no active account
      }
    })();
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      const tezos = await import("./tezos");
      const result = await tezos.connectWallet();
      setAddress(result.address);
      setProviderName(result.providerName);
    } catch (err) {
      console.error("Wallet connection failed:", err);
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, []);

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
