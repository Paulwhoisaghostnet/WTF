/**
 * Free X/Twitter oEmbed — no API credits. Used to hydrate timeline rows
 * stored as tweet IDs only.
 *
 * @see https://publish.twitter.com/oembed
 */

const OEMBED_BASE = "https://publish.twitter.com/oembed";

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

/** Extract visible tweet text from oEmbed HTML (blockquote body). */
export function extractTweetTextFromOembedHtml(html: string): string {
  const m = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const raw = m ? m[1] : stripHtmlTags(html);
  return decodeHtmlEntities(raw).replace(/\s+/g, " ").trim();
}

export type XOEmbedResult = {
  html: string;
  authorName?: string;
  authorUrl?: string;
  width?: number;
  height?: number | null;
};

export async function fetchXOEmbedForTweetUrl(
  tweetUrl: string,
  timeoutMs = 8000
): Promise<XOEmbedResult | null> {
  const url = new URL(OEMBED_BASE);
  url.searchParams.set("url", tweetUrl.trim());
  url.searchParams.set("omit_script", "true");
  url.searchParams.set("dnt", "true");

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const html = typeof data.html === "string" ? data.html : "";
    if (!html) return null;
    return {
      html,
      authorName: typeof data.author_name === "string" ? data.author_name : undefined,
      authorUrl: typeof data.author_url === "string" ? data.author_url : undefined,
      width: typeof data.width === "number" ? data.width : undefined,
      height: typeof data.height === "number" || data.height === null ? (data.height as number | null) : undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
