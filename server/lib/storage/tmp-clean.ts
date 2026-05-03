import path from "node:path";

export type TmpCleanupEntry = {
  path: string;
  mtimeMs: number;
  type: "file" | "directory";
};

export type TmpCleanupPlan = {
  remove: string[];
  skippedUnsafe: number;
  skippedYoung: number;
  skippedProtected: number;
};

const PROTECTED_SUFFIXES = [".lock", ".pid"];

function normalizeRoot(root: string): string {
  return path.resolve(root);
}

function isInsideRoot(filePath: string, roots: string[]): boolean {
  const resolved = path.resolve(filePath);
  return roots.some((root) => {
    const normalized = normalizeRoot(root);
    const rel = path.relative(normalized, resolved);
    return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
  });
}

function isProtectedName(filePath: string): boolean {
  return PROTECTED_SUFFIXES.some((suffix) => filePath.endsWith(suffix));
}

export function planTmpCleanup(input: {
  nowMs: number;
  minAgeMs: number;
  roots: string[];
  entries: TmpCleanupEntry[];
}): TmpCleanupPlan {
  const remove: string[] = [];
  let skippedUnsafe = 0;
  let skippedYoung = 0;
  let skippedProtected = 0;

  for (const entry of input.entries) {
    if (entry.type !== "file" || !isInsideRoot(entry.path, input.roots)) {
      skippedUnsafe += 1;
      continue;
    }
    if (isProtectedName(entry.path)) {
      skippedProtected += 1;
      continue;
    }
    if (input.nowMs - entry.mtimeMs < input.minAgeMs) {
      skippedYoung += 1;
      continue;
    }
    remove.push(path.resolve(entry.path));
  }

  return { remove, skippedUnsafe, skippedYoung, skippedProtected };
}

