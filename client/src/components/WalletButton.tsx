import { Button, Hourglass } from "react95";
import { useWallet } from "../lib/wallet-context";

export function WalletButton() {
  const { address, isConnecting, connect, disconnect } = useWallet();

  if (isConnecting) {
    return (
      <Button disabled size="sm">
        <Hourglass size={16} style={{ marginRight: 4 }} />
        Connecting...
      </Button>
    );
  }

  if (address) {
    return (
      <Button onClick={disconnect} size="sm">
        Disconnect ({address.slice(0, 6)}...)
      </Button>
    );
  }

  return (
    <Button onClick={connect} size="sm">
      Connect Wallet
    </Button>
  );
}
