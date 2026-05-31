import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { Button, TextField } from "react95";
import {
  WTFOS_CLI_THEMES,
  type WtfOsCliEntry,
  type WtfOsCliThemeId,
} from "@shared/wtfos-cli";
import { useWtfOsCli, type UseWtfOsCliOptions } from "./use-wtfos-cli";

export type WtfOsCliPanelVariant = "embedded" | "fullscreen";

export interface WtfOsCliPanelViewProps {
  variant?: WtfOsCliPanelVariant;
  prompt?: string;
  testId?: string;
  showStatusBar?: boolean;
  entries: WtfOsCliEntry[];
  busy: boolean;
  themeId: WtfOsCliThemeId;
  commandCount: number;
  runRawCommand: (raw: string) => Promise<void>;
}

const Frame = styled.div<{ $themeId: WtfOsCliThemeId; $variant: WtfOsCliPanelVariant }>`
  display: grid;
  grid-template-rows: ${(p) => (p.$variant === "fullscreen" ? "auto 1fr auto" : "1fr auto")};
  gap: 6px;
  min-height: ${(p) => (p.$variant === "fullscreen" ? "100vh" : "260px")};
  padding: ${(p) => (p.$variant === "fullscreen" ? "12px" : "8px")};
  border: ${(p) => (p.$variant === "fullscreen" ? "0" : "2px inset #c0c0c0")};
  background: ${(p) => WTFOS_CLI_THEMES[p.$themeId].background};
  color: ${(p) => WTFOS_CLI_THEMES[p.$themeId].foreground};
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    monospace;
  font-size: ${(p) => (p.$variant === "fullscreen" ? "13px" : "12px")};
`;

const StatusBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 4px;
  border-bottom: 1px dashed currentColor;
  opacity: 0.92;
  font-size: 11px;
`;

const Output = styled.div`
  display: grid;
  gap: 4px;
  align-content: start;
  min-height: 0;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const Line = styled.div<{ $kind: WtfOsCliEntry["kind"]; $themeId: WtfOsCliThemeId }>`
  color: ${(p) => {
    const theme = WTFOS_CLI_THEMES[p.$themeId];
    if (p.$kind === "error") return theme.error;
    if (p.$kind === "input") return theme.input;
    if (p.$kind === "system") return theme.system;
    return theme.foreground;
  }};
`;

const Prompt = styled.form`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
`;

const PromptGlyph = styled.div<{ $themeId: WtfOsCliThemeId }>`
  color: ${(p) => WTFOS_CLI_THEMES[p.$themeId].prompt};
  font-weight: bold;
`;

const CommandInput = styled(TextField)<{ $themeId: WtfOsCliThemeId }>`
  input {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      monospace;
    background: ${(p) => WTFOS_CLI_THEMES[p.$themeId].background};
    color: ${(p) => WTFOS_CLI_THEMES[p.$themeId].foreground};
    border-color: ${(p) => WTFOS_CLI_THEMES[p.$themeId].prompt};
  }
`;

export function WtfOsCliPanelView({
  variant = "embedded",
  prompt = "wtf>",
  testId = "wtf-cli-panel",
  showStatusBar = variant === "fullscreen",
  entries,
  busy,
  themeId,
  commandCount,
  runRawCommand,
}: WtfOsCliPanelViewProps) {
  const [input, setInput] = useState("help");
  const outputRef = useRef<HTMLDivElement | null>(null);
  const theme = useMemo(() => WTFOS_CLI_THEMES[themeId], [themeId]);

  useEffect(() => {
    const node = outputRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [entries]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = input;
    setInput("");
    void runRawCommand(value);
  }

  return (
    <Frame $themeId={themeId} $variant={variant} data-testid={testId}>
      {showStatusBar ? (
        <StatusBar>
          <span>wtfOS CLI · safe mode · no shell</span>
          <span>
            theme={theme.label} · commands={commandCount}
          </span>
        </StatusBar>
      ) : null}

      <Output ref={outputRef} aria-live="polite">
        {entries.map((entry) => (
          <Line key={entry.id} $kind={entry.kind} $themeId={themeId}>
            {entry.text}
          </Line>
        ))}
      </Output>

      <Prompt onSubmit={submit}>
        <PromptGlyph $themeId={themeId}>{prompt}</PromptGlyph>
        <CommandInput
          $themeId={themeId}
          value={input}
          onChange={(event) => setInput(event.currentTarget.value)}
          disabled={busy}
          aria-label="CLI command"
          autoFocus={variant === "fullscreen"}
        />
        <Button type="submit" disabled={busy || input.trim().length === 0}>
          {busy ? "Run..." : "Run"}
        </Button>
      </Prompt>
    </Frame>
  );
}

export interface WtfOsCliPanelProps extends UseWtfOsCliOptions {
  variant?: WtfOsCliPanelVariant;
  prompt?: string;
  testId?: string;
  showStatusBar?: boolean;
  onViewed?: () => void;
}

export function WtfOsCliPanel({
  variant = "embedded",
  prompt = "wtf>",
  testId = "wtf-cli-panel",
  showStatusBar,
  onViewed,
  ...options
}: WtfOsCliPanelProps) {
  const cli = useWtfOsCli(options);

  useEffect(() => {
    onViewed?.();
  }, [onViewed]);

  return (
    <WtfOsCliPanelView
      variant={variant}
      prompt={prompt}
      testId={testId}
      showStatusBar={showStatusBar}
      entries={cli.entries}
      busy={cli.busy}
      themeId={cli.themeId}
      commandCount={cli.commandList.length}
      runRawCommand={cli.runRawCommand}
    />
  );
}
