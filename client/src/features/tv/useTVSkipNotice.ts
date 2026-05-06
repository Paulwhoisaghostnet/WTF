import { useCallback, useEffect, useRef, useState } from "react";

export function useTVSkipNotice() {
  const [skipNotice, setSkipNotice] = useState<string | null>(null);
  const skipNoticeTimerRef = useRef<number | null>(null);

  const flashSkipNotice = useCallback((message: string) => {
    setSkipNotice(message);
    if (skipNoticeTimerRef.current) {
      window.clearTimeout(skipNoticeTimerRef.current);
    }
    skipNoticeTimerRef.current = window.setTimeout(() => {
      setSkipNotice(null);
      skipNoticeTimerRef.current = null;
    }, 2600);
  }, []);

  useEffect(
    () => () => {
      if (skipNoticeTimerRef.current) {
        window.clearTimeout(skipNoticeTimerRef.current);
        skipNoticeTimerRef.current = null;
      }
    },
    []
  );

  return { skipNotice, flashSkipNotice };
}
