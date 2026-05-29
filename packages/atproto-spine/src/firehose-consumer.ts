import { WebSocket, type RawData } from "ws";

export interface FirehoseFrame {
  /** Raw bytes for a binary (CBOR/CAR) frame, or the UTF-8 text for a JSON frame. */
  data: Uint8Array | string;
  binary: boolean;
}

export interface FirehoseConsumerOptions {
  /** Relay subscribeRepos URL, e.g. wss://relay.wtfos.me/xrpc/com.atproto.sync.subscribeRepos. */
  url: string;
  /** Return the last persisted cursor to resume from (appended as ?cursor=). */
  getCursor?: () => string | number | undefined | Promise<string | number | undefined>;
  /** Persist the latest cursor as frames are processed. */
  saveCursor?: (cursor: string) => void | Promise<void>;
  /** Called for each frame. Decoding of binary CBOR/CAR frames is the caller's job. */
  onFrame: (frame: FirehoseFrame) => void | Promise<void>;
  /** Reconnect backoff floor (ms). Default 1000. */
  reconnectBaseMs?: number;
  /** Reconnect backoff ceiling (ms). Default 30000. */
  reconnectMaxMs?: number;
  /** Optional error sink. */
  onError?: (error: unknown) => void;
}

/**
 * Resilient WebSocket consumer for an AT Protocol relay firehose. Generalized from TZAT's
 * firehose modules (which were producer-side); this is the consumer the echo router and
 * AppView indexer need. It only delivers frames — cursor bookkeeping is delegated to
 * callbacks and binary decoding is left to the caller (the AppView uses @atproto libs).
 */
export class FirehoseConsumer {
  private socket?: WebSocket;
  private stopped = false;
  private attempt = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly options: FirehoseConsumerOptions) {}

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.socket?.close();
    this.socket = undefined;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;

    const cursor = await this.options.getCursor?.();
    const url = new URL(this.options.url);
    if (cursor !== undefined && cursor !== null && `${cursor}`.length > 0) {
      url.searchParams.set("cursor", String(cursor));
    }

    const socket = new WebSocket(url.toString());
    this.socket = socket;

    socket.on("open", () => {
      this.attempt = 0;
    });

    socket.on("message", (data: RawData, isBinary: boolean) => {
      void this.deliver(data, isBinary);
    });

    socket.on("error", (error) => {
      this.options.onError?.(error);
    });

    socket.on("close", () => {
      if (this.stopped) return;
      this.scheduleReconnect();
    });
  }

  private async deliver(data: RawData, isBinary: boolean): Promise<void> {
    try {
      const frame: FirehoseFrame = isBinary
        ? { data: toUint8Array(data), binary: true }
        : { data: data.toString(), binary: false };
      await this.options.onFrame(frame);
    } catch (error) {
      this.options.onError?.(error);
    }
  }

  private scheduleReconnect(): void {
    const base = this.options.reconnectBaseMs ?? 1000;
    const max = this.options.reconnectMaxMs ?? 30_000;
    const delay = Math.min(max, base * 2 ** this.attempt);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, delay);
  }
}

function toUint8Array(data: RawData): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data as ArrayBuffer);
}
