/**
 * discord-commands.ts — Discovery Discord command stubs
 *
 * Defines the payload shape and handler stubs for Discord slash commands
 * served by the WTF Discord bot extension.  Commands defined here are
 * registered with Discord's application command API by the bot's boot
 * sequence; this module provides only the command metadata and handler logic
 * — it does NOT register with Discord directly.
 *
 * Commands:
 *   /wtf-stats     — posts a summary of WTF platform stats to the channel
 *   /wtf-discover  — posts a random artist + NFT discovery card
 */

export interface DiscordCommandDef {
  name: string;
  description: string;
}

export interface DiscordInteractionContext {
  userId: string;
  guildId: string | null;
  channelId: string;
}

export interface DiscordCommandResult {
  content: string;
  ephemeral?: boolean;
}

// ── Command definitions (register with Discord application commands API) ──

export const DISCOVERY_DISCORD_COMMANDS: DiscordCommandDef[] = [
  {
    name: "wtf-stats",
    description:
      "Show a summary of wtfOS platform stats (member count, mints, etc.)",
  },
  {
    name: "wtf-discover",
    description:
      "Discover a random Skullzarmy artist or NFT from the WTF collection ecosystem.",
  },
];

// ── Handler stubs ──────────────────────────────────────────────────────────

/**
 * Handle /wtf-stats
 *
 * Queries the WTF platform API and formats a brief stats summary.
 * `apiBase` should be the internal server origin, e.g. "http://localhost:3000".
 */
export async function handleWtfStats(
  _ctx: DiscordInteractionContext,
  apiBase: string
): Promise<DiscordCommandResult> {
  try {
    const resp = await fetch(`${apiBase}/api/health`, {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) throw new Error(`health check ${resp.status}`);
    const data = (await resp.json()) as {
      status?: string;
      version?: { packageVersion?: string };
      uptime?: number;
    };

    const version = data.version?.packageVersion ?? "?";
    const uptime = data.uptime
      ? `${Math.round(data.uptime / 3600)}h`
      : "?";

    return {
      content: [
        "**wtfOS Platform Stats**",
        `Status: \`${data.status ?? "unknown"}\``,
        `Version: \`${version}\``,
        `Uptime: ${uptime}`,
      ].join("\n"),
    };
  } catch (err) {
    return {
      content: `Could not fetch WTF stats: ${err instanceof Error ? err.message : String(err)}`,
      ephemeral: true,
    };
  }
}

/**
 * Handle /wtf-discover
 *
 * Fetches a random artist and NFT from the discovery API and formats them
 * as a Discord message.
 */
export async function handleWtfDiscover(
  _ctx: DiscordInteractionContext,
  apiBase: string
): Promise<DiscordCommandResult> {
  try {
    const [artistResp, nftResp] = await Promise.all([
      fetch(`${apiBase}/api/discovery/random-artist`, {
        headers: { Accept: "application/json" },
      }),
      fetch(`${apiBase}/api/discovery/random-nft`, {
        headers: { Accept: "application/json" },
      }),
    ]);

    const artist = artistResp.ok
      ? ((await artistResp.json()) as {
          address: string;
          domain?: string | null;
          displayName?: string | null;
          collectionCount?: number;
        })
      : null;

    const nft = nftResp.ok
      ? ((await nftResp.json()) as {
          contractAddress: string;
          tokenId: string;
          title?: string | null;
        })
      : null;

    const lines: string[] = ["**✦ WTF Discovery**"];

    if (artist) {
      const artistLabel =
        artist.displayName ?? artist.domain ?? `${artist.address.slice(0, 10)}…`;
      lines.push(`🎨 Artist: **${artistLabel}** (${artist.collectionCount ?? 0} collections)`);
      lines.push(`   \`${artist.address}\``);
    }

    if (nft) {
      lines.push(`🖼 NFT: **${nft.title ?? "Untitled"}** (token #${nft.tokenId})`);
      lines.push(
        `   https://objkt.com/tokens/${nft.contractAddress}/${nft.tokenId}`
      );
    }

    return { content: lines.join("\n") };
  } catch (err) {
    return {
      content: `Discovery error: ${err instanceof Error ? err.message : String(err)}`,
      ephemeral: true,
    };
  }
}

/**
 * Dispatch a command by name.  Returns null for unknown commands.
 */
export async function dispatchDiscoveryCommand(
  commandName: string,
  ctx: DiscordInteractionContext,
  apiBase: string
): Promise<DiscordCommandResult | null> {
  switch (commandName) {
    case "wtf-stats":
      return handleWtfStats(ctx, apiBase);
    case "wtf-discover":
      return handleWtfDiscover(ctx, apiBase);
    default:
      return null;
  }
}
