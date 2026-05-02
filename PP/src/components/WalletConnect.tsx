import { useState } from "react";
import { useStudioStore } from "../state/store";

export function WalletConnect() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const walletConnected = useStudioStore((s) => s.walletConnected);
  const walletAddress = useStudioStore((s) => s.walletAddress);
  const walletBalance = useStudioStore((s) => s.walletBalance);
  const setWalletConnected = useStudioStore((s) => s.setWalletConnected);
  const disconnectWalletStore = useStudioStore((s) => s.disconnectWallet);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      // Lazy load wallet service
      const { walletService } = await import("../services/walletService");
      
      console.log("[WalletConnect] Starting wallet connection...");
      
      const { address, balance } = await walletService.connectWallet();
      
      console.log("[WalletConnect] Wallet connected, address:", address);
      
      // Note: The authentication sign message has been removed from the initial connection flow
      // because it was causing UNKNOWN_ERROR issues due to timing/race conditions with
      // the Beacon SDK transport layer initialization. Message signing should be done
      // only when specifically needed (e.g., during minting or other sensitive operations)
      // after the connection has fully stabilized.
      
      // If authentication signing is required, it should be done in a separate user action
      // after the connection is confirmed, not immediately after connectWallet() returns.
      // The walletService now includes a stabilization delay and connection readiness check
      // that can be used for future signing operations.
      
      setWalletConnected(true, address, balance);
      console.log("[WalletConnect] Connection complete!");
    } catch (err) {
      console.error("Wallet connection failed:", err);
      setError(err instanceof Error ? err.message : "Failed to connect wallet");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      // Lazy load wallet service
      const { walletService } = await import("../services/walletService");
      await walletService.disconnectWallet();
      disconnectWalletStore();
    } catch (err) {
      console.error("Failed to disconnect:", err);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="walletConnect">
      {!walletConnected ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            className="btn btnPrimary"
            onClick={handleConnect}
            disabled={isConnecting}
            style={{ fontSize: 14 }}
          >
            {isConnecting ? "Connecting..." : "🔗 Connect Wallet"}
          </button>
          {error && (
            <div style={{ 
              fontSize: 11, 
              color: "#ff3d5a", 
              maxWidth: 200,
              wordBreak: "break-word"
            }}>
              {error}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            {walletAddress && formatAddress(walletAddress)}
          </div>
          <div style={{ fontSize: 10, opacity: 0.6 }}>
            {walletBalance.toFixed(2)} ꜩ
          </div>
          <button
            className="btn btnSm"
            onClick={handleDisconnect}
            style={{ fontSize: 11 }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
