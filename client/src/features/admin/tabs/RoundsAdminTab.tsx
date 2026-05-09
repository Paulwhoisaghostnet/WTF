import type { Dispatch, ReactElement, SetStateAction } from "react";
import { Button, GroupBox, TextInput, Select } from "react95";
import styled from "styled-components";
import { RoundInfoCard } from "../../../components/RoundInfoCard";
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

const ROUND_STATUS_OPTIONS = [
  { label: "Upcoming", value: "upcoming" },
  { label: "Active", value: "active" },
  { label: "Grading", value: "grading" },
  { label: "Completed", value: "completed" },
];

const EMPTY_JSON_ARRAY = "[]";

const ROUND_PLATFORM_OPTIONS = [
  "x",
  "objkt",
  "teia",
  "kukai",
  "fafo",
  "wtf-core",
  "wtf-tv",
  "wtf-studio",
  "wtf-gameshow",
  "wtf-marketplace",
  "wtf-boards",
  "wtf-messaging",
  "dicksword",
  "i-hate-telegram",
  "particle-painter",
  "industrializer",
  "pauls-particles-v1",
];

export const EMPTY_ROUND_FORM = {
  seasonId: "",
  name: "",
  number: "",
  description: "",
  rewardXp: "",
  rewardEscrowSlug: "",
  startDate: "",
  endDate: "",
  startingContestants: "",
  eliminatedAtEnd: "",
  requiredPlatforms: [] as string[],
  customPlatform: "",
  rules: "",
  prizesJson: EMPTY_JSON_ARRAY,
  previousWinnersJson: EMPTY_JSON_ARRAY,
  leaderboardJson: EMPTY_JSON_ARRAY,
  eliminatedContestantsJson: EMPTY_JSON_ARRAY,
};

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending: boolean;
};

type RoundForm = typeof EMPTY_ROUND_FORM;

type RoundsAdminTabProps = {
  allRounds: any[] | undefined;
  allSeasons: any[] | undefined;
  roundForm: RoundForm;
  setRoundForm: Dispatch<SetStateAction<RoundForm>>;
  editingRound: any;
  setEditingRound: Dispatch<SetStateAction<any>>;
  createRoundMutation: AdminMutation<Record<string, any>>;
  updateRoundMutation: AdminMutation<EntityUpdatePayload>;
  deleteRoundMutation: AdminMutation<number>;
  ConfirmButton: (props: {
    label: string;
    confirmLabel?: string;
    onConfirm: () => void;
    disabled?: boolean;
    size?: "sm" | "lg";
  }) => ReactElement;
};

function formatJsonArray(value: unknown): string {
  return JSON.stringify(Array.isArray(value) ? value : [], null, 2);
}

function parseJsonArrayInput(value: string, label: string): unknown[] | null {
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      window.alert(`${label} must be a JSON array.`);
      return null;
    }
    return parsed;
  } catch (err) {
    window.alert(`${label} is not valid JSON.`);
    return null;
  }
}

function toDateTimeLocalValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoOrNull(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseOptionalId(value: string | number | null | undefined): number | null {
  const parsed = typeof value === "number" ? value : parseInt(String(value || ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function seasonOptionLabel(season: any): string {
  return `Season ${season.number}: ${season.name}`;
}

function roundToFormState(round: any) {
  return {
    ...round,
    seasonId: round.seasonId ? String(round.seasonId) : "",
    number: String(round.number),
    rewardXp: String(round.rewardXp || 0),
    description: round.description || "",
    rewardEscrowSlug: round.rewardEscrowSlug || "",
    startDate: toDateTimeLocalValue(round.startDate),
    endDate: toDateTimeLocalValue(round.endDate),
    startingContestants: String(round.startingContestants || ""),
    eliminatedAtEnd: String(round.eliminatedAtEnd || ""),
    requiredPlatforms: Array.isArray(round.requiredPlatforms) ? round.requiredPlatforms : [],
    customPlatform: "",
    rules: round.rules || "",
    prizesJson: formatJsonArray(round.prizes),
    previousWinnersJson: formatJsonArray(round.previousWinners),
    leaderboardJson: formatJsonArray(round.leaderboard),
    eliminatedContestantsJson: formatJsonArray(round.eliminatedContestants),
  };
}

function buildRoundPayload(state: RoundForm) {
  const prizes = parseJsonArrayInput(state.prizesJson, "Prizes");
  const previousWinners = parseJsonArrayInput(state.previousWinnersJson, "Previous winners");
  const leaderboard = parseJsonArrayInput(state.leaderboardJson, "Leaderboard");
  const eliminatedContestants = parseJsonArrayInput(
    state.eliminatedContestantsJson,
    "Eliminated contestants"
  );
  if (!prizes || !previousWinners || !leaderboard || !eliminatedContestants) return null;

  return {
    seasonId: parseOptionalId(state.seasonId),
    name: state.name,
    number: parseInt(state.number),
    status: "status" in state ? (state as any).status : undefined,
    description: state.description,
    rewardXp: parseInt(state.rewardXp) || 0,
    rewardEscrowSlug: state.rewardEscrowSlug || null,
    startDate: toIsoOrNull(state.startDate),
    endDate: toIsoOrNull(state.endDate),
    startingContestants: parseInt(state.startingContestants) || 0,
    eliminatedAtEnd: parseInt(state.eliminatedAtEnd) || 0,
    requiredPlatforms: state.requiredPlatforms,
    rules: state.rules || null,
    prizes,
    previousWinners,
    leaderboard,
    eliminatedContestants,
  };
}

function PlatformChecklist({
  value,
  customValue,
  onToggle,
  onCustomChange,
  onAddCustom,
}: {
  value: string[];
  customValue: string;
  onToggle: (platform: string) => void;
  onCustomChange: (value: string) => void;
  onAddCustom: () => void;
}) {
  return (
    <Field>
      <label>Required platforms</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 4 }}>
        {ROUND_PLATFORM_OPTIONS.map((platform) => (
          <label key={platform} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={value.includes(platform)}
              onChange={() => onToggle(platform)}
            />
            {platform}
          </label>
        ))}
      </div>
      <ActionRow>
        <TextInput
          value={customValue}
          onChange={(e: any) => onCustomChange(e.target.value)}
          placeholder="custom platform"
        />
        <Button size="sm" onClick={onAddCustom}>
          Add custom
        </Button>
      </ActionRow>
    </Field>
  );
}

export function RoundsAdminTab({
  allRounds,
  allSeasons,
  roundForm,
  setRoundForm,
  editingRound,
  setEditingRound,
  createRoundMutation,
  updateRoundMutation,
  deleteRoundMutation,
  ConfirmButton,
}: RoundsAdminTabProps) {
  return (
    <>
      <h3>Round Library</h3>
      <p style={{ fontSize: 12, marginTop: 0 }}>
        Create rounds as reusable production cards, then attach them to a season and schedule the round window when ready.
      </p>

      {(allRounds || []).map((r: any) => {
        const season = (allSeasons || []).find((s: any) => s.id === r.seasonId);
        return (
          <RoundInfoCard
            key={r.id}
            round={r}
            seasonLabel={season ? `Season ${season.number}: ${season.name}` : undefined}
            action={
              <ActionRow>
                <Button
                  size="sm"
                  onClick={() =>
                    setEditingRound(editingRound?.id === r.id ? null : roundToFormState(r))
                  }
                >
                  {editingRound?.id === r.id ? "Cancel" : "Edit"}
                </Button>
                {!r.seasonId && (allSeasons || []).length > 0 && (
                  <Select
                    value={0}
                    onChange={(e: any) =>
                      e.value
                        ? updateRoundMutation.mutate({
                            id: r.id,
                            data: { seasonId: e.value },
                          })
                        : undefined
                    }
                    options={[
                      { label: "Attach...", value: 0 },
                      ...(allSeasons || []).map((s: any) => ({
                        label: seasonOptionLabel(s),
                        value: s.id,
                      })),
                    ]}
                    width={180}
                  />
                )}
                <ConfirmButton
                  label="Delete"
                  confirmLabel="Confirm"
                  onConfirm={() => deleteRoundMutation.mutate(r.id)}
                  disabled={deleteRoundMutation.isPending}
                />
              </ActionRow>
            }
          />
        );
      })}
      {(!allRounds || allRounds.length === 0) && <p>No rounds yet.</p>}

      {editingRound && (
        <GroupBox label={`Edit Round: ${editingRound.name}`} style={{ marginTop: 12 }}>
          <Field>
            <label>Season</label>
            <Select
              value={parseOptionalId(editingRound.seasonId) || 0}
              onChange={(e: any) => setEditingRound((p: any) => ({ ...p, seasonId: String(e.value) }))}
              options={[
                { label: "Unassigned library round", value: 0 },
                ...(allSeasons || []).map((s: any) => ({
                  label: seasonOptionLabel(s),
                  value: s.id,
                })),
              ]}
              width={300}
            />
          </Field>
          <Field>
            <label>Name</label>
            <TextInput value={editingRound.name} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, name: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Number</label>
            <TextInput value={editingRound.number} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, number: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Status</label>
            <Select value={editingRound.status} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, status: e.value }))} options={ROUND_STATUS_OPTIONS} width={200} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
            <Field>
              <label>Starts on calendar</label>
              <TextInput type="datetime-local" value={editingRound.startDate} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, startDate: e.target.value }))} fullWidth />
            </Field>
            <Field>
              <label>Ends on calendar</label>
              <TextInput type="datetime-local" value={editingRound.endDate} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, endDate: e.target.value }))} fullWidth />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
            <Field>
              <label>Starting contestants</label>
              <TextInput value={editingRound.startingContestants} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, startingContestants: e.target.value }))} fullWidth />
            </Field>
            <Field>
              <label>Eliminated at end</label>
              <TextInput value={editingRound.eliminatedAtEnd} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, eliminatedAtEnd: e.target.value }))} fullWidth />
            </Field>
          </div>
          <Field>
            <label>XP Reward</label>
            <TextInput value={editingRound.rewardXp} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, rewardXp: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Escrow Slug (optional)</label>
            <TextInput value={editingRound.rewardEscrowSlug} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, rewardEscrowSlug: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Description</label>
            <TextInput value={editingRound.description} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, description: e.target.value }))} multiline fullWidth />
          </Field>
          <Field>
            <label>Rules</label>
            <TextInput value={editingRound.rules} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, rules: e.target.value }))} multiline fullWidth />
          </Field>
          <PlatformChecklist
            value={editingRound.requiredPlatforms}
            customValue={editingRound.customPlatform}
            onToggle={(platform) =>
              setEditingRound((p: any) => ({
                ...p,
                requiredPlatforms: p.requiredPlatforms.includes(platform)
                  ? p.requiredPlatforms.filter((item: string) => item !== platform)
                  : [...p.requiredPlatforms, platform],
              }))
            }
            onCustomChange={(value) => setEditingRound((p: any) => ({ ...p, customPlatform: value }))}
            onAddCustom={() =>
              setEditingRound((p: any) => {
                const custom = p.customPlatform.trim();
                if (!custom || p.requiredPlatforms.includes(custom)) return p;
                return { ...p, requiredPlatforms: [...p.requiredPlatforms, custom], customPlatform: "" };
              })
            }
          />
          <Field>
            <label>Prizes JSON array</label>
            <TextInput value={editingRound.prizesJson} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, prizesJson: e.target.value }))} multiline fullWidth />
          </Field>
          <Field>
            <label>Previous winners JSON array</label>
            <TextInput value={editingRound.previousWinnersJson} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, previousWinnersJson: e.target.value }))} multiline fullWidth />
          </Field>
          <Field>
            <label>Leaderboard JSON array (top 10 shown)</label>
            <TextInput value={editingRound.leaderboardJson} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, leaderboardJson: e.target.value }))} multiline fullWidth />
          </Field>
          <Field>
            <label>Eliminated contestants JSON array</label>
            <TextInput value={editingRound.eliminatedContestantsJson} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, eliminatedContestantsJson: e.target.value }))} multiline fullWidth />
          </Field>
          <Button
            onClick={() => {
              const payload = buildRoundPayload(editingRound);
              if (!payload) return;
              updateRoundMutation.mutate({
                id: editingRound.id,
                data: {
                  ...payload,
                  status: editingRound.status,
                },
              });
            }}
            disabled={updateRoundMutation.isPending}
          >
            Save Changes
          </Button>
        </GroupBox>
      )}

      <GroupBox label="New Round" style={{ marginTop: 12 }}>
        <Field>
          <label>Season</label>
          <Select
            value={parseOptionalId(roundForm.seasonId) || 0}
            onChange={(e: any) => setRoundForm((f) => ({ ...f, seasonId: String(e.value) }))}
            options={[
              { label: "No season yet (library round)", value: 0 },
              ...(allSeasons || []).map((s: any) => ({
                label: seasonOptionLabel(s),
                value: s.id,
              })),
            ]}
            width={300}
          />
        </Field>
        <Field>
          <label>Name</label>
          <TextInput value={roundForm.name} onChange={(e: any) => setRoundForm((f) => ({ ...f, name: e.target.value }))} fullWidth />
        </Field>
        <Field>
          <label>Number</label>
          <TextInput value={roundForm.number} onChange={(e: any) => setRoundForm((f) => ({ ...f, number: e.target.value }))} fullWidth />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          <Field>
            <label>Starts on calendar</label>
            <TextInput type="datetime-local" value={roundForm.startDate} onChange={(e: any) => setRoundForm((f) => ({ ...f, startDate: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Ends on calendar</label>
            <TextInput type="datetime-local" value={roundForm.endDate} onChange={(e: any) => setRoundForm((f) => ({ ...f, endDate: e.target.value }))} fullWidth />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          <Field>
            <label>Starting contestants</label>
            <TextInput value={roundForm.startingContestants} onChange={(e: any) => setRoundForm((f) => ({ ...f, startingContestants: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Eliminated at end</label>
            <TextInput value={roundForm.eliminatedAtEnd} onChange={(e: any) => setRoundForm((f) => ({ ...f, eliminatedAtEnd: e.target.value }))} fullWidth />
          </Field>
        </div>
        <Field>
          <label>XP Reward</label>
          <TextInput value={roundForm.rewardXp} onChange={(e: any) => setRoundForm((f) => ({ ...f, rewardXp: e.target.value }))} fullWidth />
        </Field>
        <Field>
          <label>Escrow Slug (optional)</label>
          <TextInput value={roundForm.rewardEscrowSlug} onChange={(e: any) => setRoundForm((f) => ({ ...f, rewardEscrowSlug: e.target.value }))} fullWidth />
        </Field>
        <Field>
          <label>Description</label>
          <TextInput value={roundForm.description} onChange={(e: any) => setRoundForm((f) => ({ ...f, description: e.target.value }))} multiline fullWidth />
        </Field>
        <Field>
          <label>Rules</label>
          <TextInput value={roundForm.rules} onChange={(e: any) => setRoundForm((f) => ({ ...f, rules: e.target.value }))} multiline fullWidth />
        </Field>
        <PlatformChecklist
          value={roundForm.requiredPlatforms}
          customValue={roundForm.customPlatform}
          onToggle={(platform) =>
            setRoundForm((f) => ({
              ...f,
              requiredPlatforms: f.requiredPlatforms.includes(platform)
                ? f.requiredPlatforms.filter((item) => item !== platform)
                : [...f.requiredPlatforms, platform],
            }))
          }
          onCustomChange={(value) => setRoundForm((f) => ({ ...f, customPlatform: value }))}
          onAddCustom={() =>
            setRoundForm((f) => {
              const custom = f.customPlatform.trim();
              if (!custom || f.requiredPlatforms.includes(custom)) return f;
              return { ...f, requiredPlatforms: [...f.requiredPlatforms, custom], customPlatform: "" };
            })
          }
        />
        <Field>
          <label>Prizes JSON array</label>
          <TextInput value={roundForm.prizesJson} onChange={(e: any) => setRoundForm((f) => ({ ...f, prizesJson: e.target.value }))} multiline fullWidth />
        </Field>
        <Field>
          <label>Previous winners JSON array</label>
          <TextInput value={roundForm.previousWinnersJson} onChange={(e: any) => setRoundForm((f) => ({ ...f, previousWinnersJson: e.target.value }))} multiline fullWidth />
        </Field>
        <Field>
          <label>Leaderboard JSON array (top 10 shown)</label>
          <TextInput value={roundForm.leaderboardJson} onChange={(e: any) => setRoundForm((f) => ({ ...f, leaderboardJson: e.target.value }))} multiline fullWidth />
        </Field>
        <Field>
          <label>Eliminated contestants JSON array</label>
          <TextInput value={roundForm.eliminatedContestantsJson} onChange={(e: any) => setRoundForm((f) => ({ ...f, eliminatedContestantsJson: e.target.value }))} multiline fullWidth />
        </Field>
        <Button
          onClick={() => {
            const payload = buildRoundPayload(roundForm);
            if (payload) createRoundMutation.mutate(payload);
          }}
          disabled={createRoundMutation.isPending}
        >
          Create Round
        </Button>
      </GroupBox>
    </>
  );
}
