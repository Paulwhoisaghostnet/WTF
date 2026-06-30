import styled from "styled-components";

export type BumperCategory = "personal" | "community";

export type MediaBumperAssignment = {
  id: number;
  category: BumperCategory;
  mediaItemId?: number | null;
};

type BumperAssignmentTogglesProps = {
  mediaItemId: number;
  assignments: MediaBumperAssignment[];
  disabled?: boolean;
  pending?: boolean;
  error?: string | null;
  tone?: "light" | "dark";
  onToggle: (category: BumperCategory, enabled: boolean) => void;
};

const ToggleWrap = styled.div<{ $tone: "light" | "dark" }>`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border: 1px inset ${(p) => (p.$tone === "dark" ? "#446655" : "var(--wtf-app-border, #aaa)")};
  background: ${(p) =>
    p.$tone === "dark"
      ? "rgba(0, 20, 10, 0.45)"
      : "var(--wtf-app-surface-raised, #e0e0e0)"};

  [data-my-videos-presentation-host="gamma"] & {
    background: #0b0b0a;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    box-shadow: none;
    color: #f2ead9;
  }
`;

const ToggleRow = styled.label<{ $tone: "light" | "dark"; $disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  font-size: var(--wtf-type-caption, 13px);
  color: ${(p) => (p.$tone === "dark" ? "#d8ffe2" : "var(--wtf-app-text, #111)")};
  opacity: ${(p) => (p.$disabled ? 0.72 : 1)};
  cursor: ${(p) => (p.$disabled ? "not-allowed" : "pointer")};
  user-select: none;

  input {
    width: 28px;
    height: 18px;
    accent-color: #22aa55;
  }

  [data-my-videos-presentation-host="gamma"] & {
    color: rgba(242, 234, 217, 0.78);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  [data-my-videos-presentation-host="gamma"] & input {
    accent-color: #d6ff3f;
  }
`;

const ErrorText = styled.div<{ $tone: "light" | "dark" }>`
  color: ${(p) => (p.$tone === "dark" ? "#ff8877" : "#c00000")};
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.25;

  [data-my-videos-presentation-host="gamma"] & {
    color: #ff9d8c;
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
  }
`;

export function hasMediaBumperAssignment(
  assignments: MediaBumperAssignment[],
  mediaItemId: number,
  category: BumperCategory
): boolean {
  return assignments.some(
    (assignment) =>
      assignment.mediaItemId === mediaItemId && assignment.category === category
  );
}

export function BumperAssignmentToggles({
  mediaItemId,
  assignments,
  disabled = false,
  pending = false,
  error = null,
  tone = "light",
  onToggle,
}: BumperAssignmentTogglesProps) {
  const personal = hasMediaBumperAssignment(
    assignments,
    mediaItemId,
    "personal"
  );
  const community = hasMediaBumperAssignment(
    assignments,
    mediaItemId,
    "community"
  );
  const isDisabled = disabled || pending;

  return (
    <ToggleWrap $tone={tone} data-my-videos-region="bumper-toggle">
      <ToggleRow $tone={tone} $disabled={isDisabled}>
        <input
          type="checkbox"
          role="switch"
          aria-label="Assign to personal bumper pool"
          checked={personal}
          disabled={isDisabled}
          onChange={() => onToggle("personal", !personal)}
        />
        Bumper pool
      </ToggleRow>
      <ToggleRow $tone={tone} $disabled={isDisabled}>
        <input
          type="checkbox"
          role="switch"
          aria-label="Assign to community bumper pool"
          checked={community}
          disabled={isDisabled}
          onChange={() => onToggle("community", !community)}
        />
        Community bumper pool
      </ToggleRow>
      {error ? <ErrorText $tone={tone}>{error}</ErrorText> : null}
    </ToggleWrap>
  );
}
