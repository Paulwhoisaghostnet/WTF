/**
 * Labeler policy (S2.8). Pure label definitions + builders for a self-hosted AT Protocol
 * labeler (Ozone-compatible label shape). No DB/network. The labeler DID signs and serves
 * these via com.atproto.label.* ; the kernel applies them with an audit trail (./labeler.ts).
 */

export interface LabelDefinition {
  /** Label value (NSID-ish token), e.g. "wtfos-ban". */
  val: string;
  /** Whether this label denies the subject access across wtfOS (a ban). */
  ban: boolean;
  /** Whether AppViews should blur/hide the subject by default. */
  hides: boolean;
  /** Human description for moderation surfaces. */
  description: string;
}

export const LABEL_DEFINITIONS: Record<string, LabelDefinition> = {
  "wtfos-ban": { val: "wtfos-ban", ban: true, hides: true, description: "Account banned from wtfOS." },
  "wtfos-suspend": { val: "wtfos-suspend", ban: true, hides: false, description: "Account temporarily suspended." },
  spam: { val: "spam", ban: false, hides: true, description: "Spam content." },
  abuse: { val: "abuse", ban: false, hides: true, description: "Abusive content." },
  nsfw: { val: "nsfw", ban: false, hides: true, description: "Sexual or adult content." },
  warn: { val: "warn", ban: false, hides: false, description: "Content flagged for review." },
};

export function knownLabelValues(): string[] {
  return Object.keys(LABEL_DEFINITIONS);
}

/** The labeler's signing DID (the label src). Defaults to did:web:mod.<network>. */
export function labelerDid(env: NodeJS.ProcessEnv = process.env): string {
  if (env.WTFOS_LABELER_DID) return env.WTFOS_LABELER_DID;
  const network = env.WTFOS_ATPROTO_NETWORK_DOMAIN || "wtfos.me";
  return `did:web:mod.${network}`;
}

export function isKnownLabel(val: string): boolean {
  return Object.prototype.hasOwnProperty.call(LABEL_DEFINITIONS, val);
}

export function isBanLabel(val: string): boolean {
  return LABEL_DEFINITIONS[val]?.ban ?? false;
}

export interface LabelInput {
  /** Labeler DID (the label source). */
  src: string;
  /** Subject: a DID (account label) or an at:// URI (record label). */
  uri: string;
  /** Optional CID for record-specific labels. */
  cid?: string;
  /** Label value; must be known. */
  val: string;
  /** Negation (un-label). */
  neg?: boolean;
  /** Created timestamp (defaults to now). */
  cts?: string;
  /** Optional expiry timestamp. */
  exp?: string;
}

export interface AtprotoLabel {
  src: string;
  uri: string;
  cid?: string;
  val: string;
  neg?: boolean;
  cts: string;
  exp?: string;
}

/** Build a com.atproto.label.label-shaped object. Throws on unknown value or bad subject. */
export function buildLabel(input: LabelInput): AtprotoLabel {
  if (!isKnownLabel(input.val)) {
    throw new Error(`unknown label value: ${input.val}`);
  }
  if (!input.uri || !(input.uri.startsWith("did:") || input.uri.startsWith("at://"))) {
    throw new Error(`label subject must be a DID or at:// URI: ${input.uri}`);
  }
  const label: AtprotoLabel = {
    src: input.src,
    uri: input.uri,
    val: input.val,
    cts: input.cts ?? new Date().toISOString(),
  };
  if (input.cid) label.cid = input.cid;
  if (input.neg) label.neg = true;
  if (input.exp) label.exp = input.exp;
  return label;
}
