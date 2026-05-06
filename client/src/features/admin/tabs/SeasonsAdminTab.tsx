import { useState, type Dispatch, type SetStateAction } from "react";
import {
  Button,
  GroupBox,
  TextInput,
  Select,
  Table,
  TableHead,
  TableRow,
  TableHeadCell,
  TableDataCell,
  TableBody,
} from "react95";
import styled from "styled-components";
import type { EntityUpdatePayload } from "../types";

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

const SEASON_STATUS_OPTIONS = [
  { label: "Upcoming", value: "upcoming" },
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
];

const EMPTY_JSON_OBJECT = "{}";

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending: boolean;
};

type SeasonForm = {
  name: string;
  number: string;
  description: string;
  mediaAssets: string;
};

type SeasonCreatePayload = {
  name: string;
  number: number;
  description: string;
  mediaAssets: Record<string, unknown>;
};

type SeasonsAdminTabProps = {
  allSeasons: any[] | undefined;
  editingSeason: any;
  setEditingSeason: Dispatch<SetStateAction<any>>;
  seasonForm: SeasonForm;
  setSeasonForm: Dispatch<SetStateAction<SeasonForm>>;
  createSeasonMutation: AdminMutation<SeasonCreatePayload>;
  updateSeasonMutation: AdminMutation<EntityUpdatePayload>;
  deleteSeasonMutation: AdminMutation<number>;
};

function formatJsonObject(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_JSON_OBJECT;
  }
  return JSON.stringify(value, null, 2);
}

function parseJsonObjectInput(
  value: string,
  label: string
): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      window.alert(`${label} must be a JSON object.`);
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    window.alert(`${label} is not valid JSON.`);
    return null;
  }
}

function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
  size = "sm",
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  size?: "sm" | "lg";
}) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <ActionRow>
        <Button size={size} onClick={onConfirm} disabled={disabled}>
          {confirmLabel || `Yes, ${label}`}
        </Button>
        <Button size={size} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </ActionRow>
    );
  }
  return (
    <Button size={size} onClick={() => setConfirming(true)} disabled={disabled}>
      {label}
    </Button>
  );
}

export function SeasonsAdminTab({
  allSeasons,
  editingSeason,
  setEditingSeason,
  seasonForm,
  setSeasonForm,
  createSeasonMutation,
  updateSeasonMutation,
  deleteSeasonMutation,
}: SeasonsAdminTabProps) {
  return (
    <>
      <h3>Seasons</h3>

      <Table>
        <TableHead>
          <TableRow>
            <TableHeadCell>#</TableHeadCell>
            <TableHeadCell>Name</TableHeadCell>
            <TableHeadCell>Status</TableHeadCell>
            <TableHeadCell>Description</TableHeadCell>
            <TableHeadCell>Media</TableHeadCell>
            <TableHeadCell>Actions</TableHeadCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(allSeasons || []).map((s: any) => (
            <TableRow key={s.id}>
              <TableDataCell>{s.number}</TableDataCell>
              <TableDataCell>{s.name}</TableDataCell>
              <TableDataCell>{s.status}</TableDataCell>
              <TableDataCell
                style={{
                  maxWidth: 200,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {s.description || "---"}
              </TableDataCell>
              <TableDataCell>
                {Object.keys(s.mediaAssets || {}).length} assets
              </TableDataCell>
              <TableDataCell>
                <ActionRow>
                  <Button
                    size="sm"
                    onClick={() =>
                      setEditingSeason(
                        editingSeason?.id === s.id
                          ? null
                          : {
                              ...s,
                              name: s.name,
                              number: String(s.number),
                              description: s.description || "",
                              status: s.status,
                              mediaAssets: formatJsonObject(s.mediaAssets),
                            }
                      )
                    }
                  >
                    {editingSeason?.id === s.id ? "Cancel" : "Edit"}
                  </Button>
                  <ConfirmButton
                    label="Delete"
                    confirmLabel="Confirm"
                    onConfirm={() => deleteSeasonMutation.mutate(s.id)}
                    disabled={deleteSeasonMutation.isPending}
                  />
                </ActionRow>
              </TableDataCell>
            </TableRow>
          ))}
          {(!allSeasons || allSeasons.length === 0) && (
            <TableRow>
              <TableDataCell>---</TableDataCell>
              <TableDataCell>No seasons yet.</TableDataCell>
              <TableDataCell>---</TableDataCell>
              <TableDataCell>---</TableDataCell>
              <TableDataCell>---</TableDataCell>
              <TableDataCell>---</TableDataCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {editingSeason && (
        <GroupBox
          label={`Edit Season #${editingSeason.number}`}
          style={{ marginTop: 12 }}
        >
          <Field>
            <label>Name</label>
            <TextInput
              value={editingSeason.name}
              onChange={(e: any) =>
                setEditingSeason((p: any) => ({ ...p, name: e.target.value }))
              }
              fullWidth
            />
          </Field>
          <Field>
            <label>Number</label>
            <TextInput
              value={editingSeason.number}
              onChange={(e: any) =>
                setEditingSeason((p: any) => ({
                  ...p,
                  number: e.target.value,
                }))
              }
              fullWidth
            />
          </Field>
          <Field>
            <label>Status</label>
            <Select
              value={editingSeason.status}
              onChange={(e: any) =>
                setEditingSeason((p: any) => ({ ...p, status: e.value }))
              }
              options={SEASON_STATUS_OPTIONS}
              width={200}
            />
          </Field>
          <Field>
            <label>Description</label>
            <TextInput
              value={editingSeason.description}
              onChange={(e: any) =>
                setEditingSeason((p: any) => ({
                  ...p,
                  description: e.target.value,
                }))
              }
              multiline
              fullWidth
            />
          </Field>
          <Field>
            <label>Media Assets JSON</label>
            <TextInput
              value={editingSeason.mediaAssets}
              onChange={(e: any) =>
                setEditingSeason((p: any) => ({
                  ...p,
                  mediaAssets: e.target.value,
                }))
              }
              multiline
              fullWidth
            />
            <small>
              Use keys like adminPfp, banner, iconSet, introVideo, and
              sponsorLogos with HTTPS, IPFS, or same-origin URLs.
            </small>
          </Field>
          <Button
            onClick={() => {
              const mediaAssets = parseJsonObjectInput(
                editingSeason.mediaAssets,
                "Season media assets"
              );
              if (!mediaAssets) return;
              updateSeasonMutation.mutate({
                id: editingSeason.id,
                data: {
                  name: editingSeason.name,
                  number: parseInt(editingSeason.number),
                  status: editingSeason.status,
                  description: editingSeason.description,
                  mediaAssets,
                },
              });
            }}
            disabled={updateSeasonMutation.isPending}
          >
            Save Changes
          </Button>
        </GroupBox>
      )}

      <GroupBox label="New Season" style={{ marginTop: 12 }}>
        <Field>
          <label>Name</label>
          <TextInput
            value={seasonForm.name}
            onChange={(e: any) =>
              setSeasonForm((f) => ({ ...f, name: e.target.value }))
            }
            fullWidth
          />
        </Field>
        <Field>
          <label>Number</label>
          <TextInput
            value={seasonForm.number}
            onChange={(e: any) =>
              setSeasonForm((f) => ({ ...f, number: e.target.value }))
            }
            fullWidth
          />
        </Field>
        <Field>
          <label>Description</label>
          <TextInput
            value={seasonForm.description}
            onChange={(e: any) =>
              setSeasonForm((f) => ({ ...f, description: e.target.value }))
            }
            multiline
            fullWidth
          />
        </Field>
        <Field>
          <label>Media Assets JSON</label>
          <TextInput
            value={seasonForm.mediaAssets}
            onChange={(e: any) =>
              setSeasonForm((f) => ({ ...f, mediaAssets: e.target.value }))
            }
            multiline
            fullWidth
          />
          <small>
            Example keys: adminPfp, banner, iconSet, introVideo, sponsorLogos.
          </small>
        </Field>
        <Button
          onClick={() => {
            const mediaAssets = parseJsonObjectInput(
              seasonForm.mediaAssets,
              "Season media assets"
            );
            if (!mediaAssets) return;
            createSeasonMutation.mutate({
              name: seasonForm.name,
              number: parseInt(seasonForm.number),
              description: seasonForm.description,
              mediaAssets,
            });
          }}
          disabled={createSeasonMutation.isPending}
        >
          Create Season
        </Button>
      </GroupBox>
    </>
  );
}
