import type { ImgHTMLAttributes, SyntheticEvent } from "react";
import { extractIpfsPath } from "@shared/ipfs-gateways";
import {
  advanceResolvedMediaFallback,
  resolveTokenThumbnail,
} from "../lib/media-resolve";

type RecoverableIpfsImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
};

export function RecoverableIpfsImage({ src, onError, ...props }: RecoverableIpfsImageProps) {
  const resolved = extractIpfsPath(src)
    ? resolveTokenThumbnail({ thumbnail: src })
    : null;

  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    if (resolved && advanceResolvedMediaFallback(event.currentTarget, resolved)) return;
    onError?.(event);
  };

  return (
    <img
      key={src}
      {...props}
      src={resolved?.src || src}
      onError={handleError}
    />
  );
}
