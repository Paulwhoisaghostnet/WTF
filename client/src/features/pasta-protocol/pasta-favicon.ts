import { useEffect } from "react";

const PASTA_FAVICON_IDS = new Set([
  "pasta-suite",
  "ch-ease",
  "macaroni",
  "spaghetti",
  "gnocchi",
  "ravioli",
  "rotini",
  "penne",
  "lasagna",
]);

export function usePastaFavicon(appId: string | null | undefined) {
  useEffect(() => {
    if (typeof document === "undefined" || !appId || !PASTA_FAVICON_IDS.has(appId)) return;

    const selector = 'link[data-wtfos-pasta-favicon="true"]';
    const existing = document.head.querySelector<HTMLLinkElement>(selector);
    const link = existing ?? document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.dataset.wtfosPastaFavicon = "true";
    link.href = `/pasta-icons/sugo/${appId}.svg`;
    document.head.appendChild(link);

    return () => {
      if (link.dataset.wtfosPastaFavicon === "true") link.remove();
    };
  }, [appId]);
}
