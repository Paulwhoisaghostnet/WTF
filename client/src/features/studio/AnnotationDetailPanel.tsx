import { useState, type ChangeEvent } from "react";
import { Button, GroupBox, Separator, TextInput } from "react95";
import { isPaintMarkupKind, readMarkupData } from "./markup";
import type { Annotation } from "./types";
import { formatTimestamp } from "./utils";

interface AnnotationDetailPanelProps {
  annotation: Annotation | null;
  canAnnotate: boolean;
  onAddComment: (body: string) => void;
  onClose: () => void;
  onDelete: () => void;
  onToggleResolved: (resolved: boolean) => void;
}

export function AnnotationDetailPanel({
  annotation,
  canAnnotate,
  onAddComment,
  onClose,
  onDelete,
  onToggleResolved,
}: AnnotationDetailPanelProps) {
  const [draft, setDraft] = useState("");

  if (!annotation) return null;
  const markup = isPaintMarkupKind(annotation.kind)
    ? readMarkupData(
        annotation.data,
        annotation.kind === "highlight" ? "highlight" : "brush"
      )
    : null;
  const label = markup
    ? markup.tool === "highlight"
      ? "highlighter mark"
      : "brush mark"
    : `${annotation.kind} note`;

  return (
    <GroupBox label={label}>
      <div style={{ padding: 4, fontSize: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <strong>
            {annotation.authorDisplayName ?? "Someone"} ·{" "}
            {formatTimestamp(annotation.createdAt)}
          </strong>
          <div style={{ display: "flex", gap: 4 }}>
            <Button size="sm" onClick={onClose}>
              Close
            </Button>
            {canAnnotate ? (
              <>
                <Button
                  size="sm"
                  onClick={() => onToggleResolved(!annotation.resolved)}
                >
                  {annotation.resolved ? "Reopen" : "Resolve"}
                </Button>
                <Button size="sm" onClick={onDelete}>
                  Delete
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {markup ? (
          <div style={{ marginTop: 4, fontSize: 11, color: "#555" }}>
            {markup.points.length} point stroke · {markup.color} · {markup.width}px
          </div>
        ) : annotation.data?.body ? (
          <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
            {String(annotation.data.body)}
          </div>
        ) : (
          <div style={{ color: "#555" }}>No body.</div>
        )}

        <Separator />

        <div
          style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}
        >
          {annotation.comments.map((comment) => (
            <div key={comment.id} style={{ fontSize: 11 }}>
              <strong>{comment.authorDisplayName ?? "Someone"}:</strong>{" "}
              {comment.body}{" "}
              <span style={{ color: "#777" }}>
                · {formatTimestamp(comment.createdAt)}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          <TextInput
            placeholder="Reply"
            value={draft}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setDraft(event.target.value)
            }
            style={{ flex: 1 }}
          />
          <Button
            size="sm"
            onClick={() => {
              const body = draft.trim();
              if (!body) return;
              onAddComment(body);
              setDraft("");
            }}
          >
            Reply
          </Button>
        </div>
      </div>
    </GroupBox>
  );
}
