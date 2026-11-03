import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { logClientSystemEvent } from "../../lib/system-log";
import { useWallet } from "../../lib/wallet-context";
import { proveHorfGuestWallet, type HorfGuestChallenge, type HorfGuestSession, type HorfGuestVerification } from "./guest-wallet";

const EMPTY_SESSION: HorfGuestSession = { walletAddress: null, verified: false };
const HORF_WALLET_SESSION_EVENT = "horf:wallet-session-changed";

export function useHorfWallet() {
  const { user, isLoading: authLoading } = useAuth();
  const wallet = useWallet();
  const [guestSession, setGuestSession] = useState<HorfGuestSession>(EMPTY_SESSION);
  const [guestSessionLoading, setGuestSessionLoading] = useState(true);
  const [proofBusy, setProofBusy] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const sessionRequest = useRef(0);
  const isGuest = !user;

  const refreshGuestSession = useCallback(async () => {
    const requestId = ++sessionRequest.current;
    try {
      const session = await api.get<HorfGuestSession>("/api/horf/wallet/session");
      if (requestId === sessionRequest.current) setGuestSession(session?.verified && session.walletAddress ? session : EMPTY_SESSION);
    } catch {
      if (requestId === sessionRequest.current) setGuestSession(EMPTY_SESSION);
    } finally {
      if (requestId === sessionRequest.current) setGuestSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      sessionRequest.current += 1;
      setGuestSession(EMPTY_SESSION);
      setGuestSessionLoading(false);
      return;
    }
    setGuestSessionLoading(true);
    void refreshGuestSession();
    const onFocus = () => void refreshGuestSession();
    const onSessionChange = () => void refreshGuestSession();
    window.addEventListener("focus", onFocus);
    window.addEventListener(HORF_WALLET_SESSION_EVENT, onSessionChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(HORF_WALLET_SESSION_EVENT, onSessionChange);
    };
  }, [authLoading, refreshGuestSession, user]);

  const address = user ? wallet.address :
    guestSession.verified && guestSession.walletAddress === wallet.address ? wallet.address : null;
  const isConnecting = wallet.isConnecting || proofBusy || authLoading;

  async function connectWallet() {
    setWalletError(null);
    setProofBusy(true);
    try {
      const connected = await wallet.connect();
      if (!user) {
        const tezos = await import("../../lib/tezos");
        await proveHorfGuestWallet(connected.address, {
          challenge: (walletAddress) => api.post<HorfGuestChallenge>("/api/horf/wallet/challenge", { walletAddress }),
          sign: tezos.signAuthPayload,
          verify: (proof) => api.post<HorfGuestVerification>("/api/horf/wallet/verify", proof),
        });
        const session = await api.get<HorfGuestSession>("/api/horf/wallet/session");
        if (!session.verified || session.walletAddress !== connected.address) {
          throw new Error("Horf could not restore your verified wallet session. Try again.");
        }
        sessionRequest.current += 1;
        setGuestSession(session);
        window.dispatchEvent(new Event(HORF_WALLET_SESSION_EVENT));
        logClientSystemEvent({ eventType: "horf.wallet.verified", message: "Horf guest wallet proof verified", metadata: { address: connected.address } });
      }
      logClientSystemEvent({ eventType: "horf.wallet.selected", message: "Horf wallet selected", metadata: { address: connected.address } });
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Could not verify this wallet for Horf. Try again.");
    } finally {
      setProofBusy(false);
    }
  }

  async function disconnectWallet() {
    setWalletError(null);
    setProofBusy(true);
    try {
      if (!user) await api.post("/api/horf/wallet/disconnect");
      await wallet.disconnect();
      sessionRequest.current += 1;
      setGuestSession(EMPTY_SESSION);
      window.dispatchEvent(new Event(HORF_WALLET_SESSION_EVENT));
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Could not disconnect this Horf wallet. Try again.");
    } finally {
      setProofBusy(false);
    }
  }

  return {
    address,
    isGuest,
    isConnecting,
    walletError,
    guestSessionLoading,
    localWalletAddress: wallet.address,
    connectWallet,
    disconnectWallet,
  };
}
