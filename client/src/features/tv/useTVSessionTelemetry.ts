import { useEffect } from "react";
import { flushTvLog, tvLog } from "./telemetry";

type UseTVSessionTelemetryArgs = {
  powerOn: boolean;
  selectedChannelId: number | null;
};

export function useTVSessionTelemetry({
  powerOn,
  selectedChannelId,
}: UseTVSessionTelemetryArgs) {
  useEffect(() => {
    const interval = window.setInterval(() => {
      flushTvLog(false);
    }, 10_000);
    const onBeforeUnload = () => flushTvLog(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushTvLog(true);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    tvLog("session.power", { powerOn, channelId: selectedChannelId });
  }, [powerOn, selectedChannelId]);
}
