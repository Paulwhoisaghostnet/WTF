import { AppWindow } from "../components/layout/AppWindow";
import { IpfsPinningManager } from "../features/ipfs-pinning/IpfsPinningManager";

export function IpfsPinning() {
  return (
    <AppWindow title="IPFS Pinning Manager">
      <IpfsPinningManager />
    </AppWindow>
  );
}
