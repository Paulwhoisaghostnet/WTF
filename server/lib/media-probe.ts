import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface ProbeResult {
  durationSeconds: number;
  width?: number;
  height?: number;
  codec?: string;
}

export async function probeMediaDuration(filePath: string): Promise<ProbeResult | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath,
    ], { timeout: 10_000 });

    const data = JSON.parse(stdout);
    const duration = parseFloat(data?.format?.duration || "0");
    if (!duration || !Number.isFinite(duration)) return null;

    const videoStream = data?.streams?.find(
      (s: any) => s.codec_type === "video"
    );

    return {
      durationSeconds: Math.round(duration),
      width: videoStream?.width ?? undefined,
      height: videoStream?.height ?? undefined,
      codec: videoStream?.codec_name ?? data?.format?.format_name ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function ffprobeAvailable(): Promise<boolean> {
  try {
    await execFileAsync("ffprobe", ["-version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}
