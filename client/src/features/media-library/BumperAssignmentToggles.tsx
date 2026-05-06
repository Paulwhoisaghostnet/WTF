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
  gap: 3px;
  padding: 4px;
  border: 1px inset ${(p) => (p.$tone === "dark" ? "#335544" : "#aaa")};
  background: ${(p) => (p.$tone === "dark" ? "rgba(0, 20, 10, 0.45)" : "#e0e0e0")};
`;

const ToggleRow = styled.label<{ $tone: "light" | "dark"; $disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 20px;
  font-size: 10px;
  color: ${(p) => (p.$tone === "dark" ? "#ccffdd" : "#111")};
  opacity: ${(p) => (p.$disabled ? 0.55 : 1)};
  cursor: ${(p) => (p.$disabled ? "not-allowed" : "pointer")};
  user-select: none;

  input {
    width: 24px;
    height: 14px;
    accent-color: #22aa55;
  }
`;

const ErrorText = styled.div<{ $tone: "light" | "dark" }>`
  color: ${(p) => (p.$tone === "dark" ? "#ff8877" : "#c00000")};
  font-size: 9px;
  line-height: 1.25;
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
    <ToggleWrap $tone={tone}>
      <ToggleRow $tone={tone} $disabled={isDisabled}>
        <input
          type="checkbox"
          role="switch"
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
