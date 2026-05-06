import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect } from "react";
import { queueItemKey } from "../../lib/tv-playback";
import { tvLog } from "./telemetry";
import type { StreamQueueItem } from "./types";

type UseTVQueueCursorSyncArgs = {
  streamMatchesSelectedChannel: boolean;
  streamQueue: StreamQueueItem[] | null | undefined;
  clientQueueIdx: number;
  setClientQueueIdx: Dispatch<SetStateAction<number>>;
  playbackTargetKeyRef: MutableRefObject<string>;
  currentKeyRef: MutableRefObject<string>;
};

export function useTVQueueCursorSync({
  streamMatchesSelectedChannel,
  streamQueue,
  clientQueueIdx,
  setClientQueueIdx,
  playbackTargetKeyRef,
  currentKeyRef,
}: UseTVQueueCursorSyncArgs) {
  useEffect(() => {
    const queue = streamMatchesSelectedChannel ? streamQueue || [] : [];
    if (queue.length === 0) return;
    const playing = playbackTargetKeyRef.current || currentKeyRef.current;
    if (!playing) {
      setClientQueueIdx(0);
      return;
    }
    const matchIdx = queue.findIndex((q) => queueItemKey(q) === playing);
    if (matchIdx !== -1 && matchIdx !== clientQueueIdx) {
      tvLog("queue.sync.adjust", {
        fromIdx: clientQueueIdx,
        toIdx: matchIdx,
      });
      setClientQueueIdx(matchIdx);
    }
  }, [
    streamMatchesSelectedChannel,
    streamQueue,
    clientQueueIdx,
    setClientQueueIdx,
    playbackTargetKeyRef,
    currentKeyRef,
  ]);
}
