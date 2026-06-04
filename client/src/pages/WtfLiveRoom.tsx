import { WtfLivePublicRoom } from "../features/wtf-live/WtfLivePublicRoom";

export function WtfLiveRoom({ roomId }: { roomId: string }) {
  return <WtfLivePublicRoom roomId={roomId} />;
}
