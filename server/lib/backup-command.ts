export function buildPgDumpArgs(filepath: string, dbUrl: string): string[] {
  return ["--format=custom", "--no-owner", `--file=${filepath}`, dbUrl];
}
