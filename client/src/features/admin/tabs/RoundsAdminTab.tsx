import type { Dispatch, ReactElement, SetStateAction } from "react";
import { TextInput, Select } from "react95";
import styled from "styled-components";
import { RoundInfoCard } from "../../../components/RoundInfoCard";
import { UiButton, UiEmptyState, UiPanel } from "../../../components/wtfos-ui";
import type { EntityUpdatePayload } from "../types";

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--wtf-space-1, 4px);
  margin-bottom: var(--wtf-space-2, 8px);

  label {
    color: var(--wtf-app-text, #111);
    font-size: var(--wtf-type-caption, 13px);
    font-weight: 700;
    line-height: 1.3;
  }
`;

const ActionRow = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
`;

const Intro = styled.p`
  margin: 0 0 var(--wtf-space-3, 12px);
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--wtf-space-2, 8px);
`;

const PlatformGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--wtf-space-1, 4px);
`;

const CheckLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: var(--wtf-space-1, 4px);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
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
      <PlatformGrid>
        {ROUND_PLATFORM_OPTIONS.map((platform) => (
          <CheckLabel key={platform}>
            <input
              type="checkbox"
              aria-label={`Require ${platform} platform`}
              checked={value.includes(platform)}
              onChange={() => onToggle(platform)}
            />
            {platform}
          </CheckLabel>
        ))}
      </PlatformGrid>
      <ActionRow>
        <TextInput
          aria-label="Custom required platform"
          value={customValue}
          onChange={(e: any) => onCustomChange(e.target.value)}
          placeholder="custom platform"
        />
        <UiButton compact onClick={onAddCustom}>
          Add custom platform
        </UiButton>
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
      <Intro>
        Create rounds as reusable production cards, then attach them to a season and schedule the round window when ready.
      </Intro>

      {(allRounds || []).map((r: any) => {
        const season = (allSeasons || []).find((s: any) => s.id === r.seasonId);
        return (
          <RoundInfoCard
            key={r.id}
            round={r}
            seasonLabel={season ? `Season ${season.number}: ${season.name}` : undefined}
            action={
              <ActionRow>
                <UiButton
                  compact
                  onClick={() =>
                    setEditingRound(editingRound?.id === r.id ? null : roundToFormState(r))
                  }
                >
                  {editingRound?.id === r.id ? "Cancel round edit" : "Edit round"}
                </UiButton>
                {!r.seasonId && (allSeasons || []).length > 0 && (
                  <Select
                    aria-label={`Attach ${r.name} to a season`}
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
                  label="Delete round"
                  confirmLabel="Confirm delete"
                  onConfirm={() => deleteRoundMutation.mutate(r.id)}
                  disabled={deleteRoundMutation.isPending}
                />
              </ActionRow>
            }
          />
        );
      })}
      {(!allRounds || allRounds.length === 0) && (
        <UiEmptyState title="No rounds yet">
          Create a library round, then attach it to a season when the schedule is ready.
        </UiEmptyState>
      )}

      {editingRound && (
        <UiPanel title={`Edit round: ${editingRound.name}`} compact style={{ marginTop: 12 }}>
          <Field>
            <label>Season</label>
            <Select
              aria-label="Edit round season"
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
            <TextInput aria-label="Edit round name" value={editingRound.name} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, name: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Number</label>
            <TextInput aria-label="Edit round number" value={editingRound.number} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, number: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Status</label>
            <Select aria-label="Edit round status" value={editingRound.status} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, status: e.value }))} options={ROUND_STATUS_OPTIONS} width={200} />
          </Field>
          <FormGrid>
            <Field>
              <label>Starts on calendar</label>
              <TextInput aria-label="Edit round start date" type="datetime-local" value={editingRound.startDate} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, startDate: e.target.value }))} fullWidth />
            </Field>
            <Field>
              <label>Ends on calendar</label>
              <TextInput aria-label="Edit round end date" type="datetime-local" value={editingRound.endDate} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, endDate: e.target.value }))} fullWidth />
            </Field>
          </FormGrid>
          <FormGrid>
            <Field>
              <label>Starting contestants</label>
              <TextInput aria-label="Edit round starting contestants" value={editingRound.startingContestants} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, startingContestants: e.target.value }))} fullWidth />
            </Field>
            <Field>
              <label>Eliminated at end</label>
              <TextInput aria-label="Edit round eliminated contestants count" value={editingRound.eliminatedAtEnd} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, eliminatedAtEnd: e.target.value }))} fullWidth />
            </Field>
          </FormGrid>
          <Field>
            <label>XP Reward</label>
            <TextInput aria-label="Edit round XP reward" value={editingRound.rewardXp} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, rewardXp: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Escrow Slug (optional)</label>
            <TextInput aria-label="Edit round escrow slug" value={editingRound.rewardEscrowSlug} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, rewardEscrowSlug: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Description</label>
            <TextInput aria-label="Edit round description" value={editingRound.description} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, description: e.target.value }))} multiline fullWidth />
          </Field>
          <Field>
            <label>Rules</label>
            <TextInput aria-label="Edit round rules" value={editingRound.rules} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, rules: e.target.value }))} multiline fullWidth />
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
            <TextInput aria-label="Edit round prizes JSON array" value={editingRound.prizesJson} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, prizesJson: e.target.value }))} multiline fullWidth />
          </Field>
          <Field>
            <label>Previous winners JSON array</label>
            <TextInput aria-label="Edit round previous winners JSON array" value={editingRound.previousWinnersJson} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, previousWinnersJson: e.target.value }))} multiline fullWidth />
          </Field>
          <Field>
            <label>Leaderboard JSON array (top 10 shown)</label>
            <TextInput aria-label="Edit round leaderboard JSON array" value={editingRound.leaderboardJson} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, leaderboardJson: e.target.value }))} multiline fullWidth />
          </Field>
          <Field>
            <label>Eliminated contestants JSON array</label>
            <TextInput aria-label="Edit round eliminated contestants JSON array" value={editingRound.eliminatedContestantsJson} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, eliminatedContestantsJson: e.target.value }))} multiline fullWidth />
          </Field>
          <UiButton
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
            Save round changes
          </UiButton>
        </UiPanel>
      )}

      <UiPanel title="New round" compact style={{ marginTop: 12 }}>
        <Field>
          <label>Season</label>
          <Select
            aria-label="New round season"
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
          <TextInput aria-label="New round name" value={roundForm.name} onChange={(e: any) => setRoundForm((f) => ({ ...f, name: e.target.value }))} fullWidth />
        </Field>
        <Field>
          <label>Number</label>
          <TextInput aria-label="New round number" value={roundForm.number} onChange={(e: any) => setRoundForm((f) => ({ ...f, number: e.target.value }))} fullWidth />
        </Field>
        <FormGrid>
          <Field>
            <label>Starts on calendar</label>
            <TextInput aria-label="New round start date" type="datetime-local" value={roundForm.startDate} onChange={(e: any) => setRoundForm((f) => ({ ...f, startDate: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Ends on calendar</label>
            <TextInput aria-label="New round end date" type="datetime-local" value={roundForm.endDate} onChange={(e: any) => setRoundForm((f) => ({ ...f, endDate: e.target.value }))} fullWidth />
          </Field>
        </FormGrid>
        <FormGrid>
          <Field>
            <label>Starting contestants</label>
            <TextInput aria-label="New round starting contestants" value={roundForm.startingContestants} onChange={(e: any) => setRoundForm((f) => ({ ...f, startingContestants: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Eliminated at end</label>
            <TextInput aria-label="New round eliminated contestants count" value={roundForm.eliminatedAtEnd} onChange={(e: any) => setRoundForm((f) => ({ ...f, eliminatedAtEnd: e.target.value }))} fullWidth />
          </Field>
        </FormGrid>
        <Field>
          <label>XP Reward</label>
          <TextInput aria-label="New round XP reward" value={roundForm.rewardXp} onChange={(e: any) => setRoundForm((f) => ({ ...f, rewardXp: e.target.value }))} fullWidth />
        </Field>
        <Field>
          <label>Escrow Slug (optional)</label>
          <TextInput aria-label="New round escrow slug" value={roundForm.rewardEscrowSlug} onChange={(e: any) => setRoundForm((f) => ({ ...f, rewardEscrowSlug: e.target.value }))} fullWidth />
        </Field>
        <Field>
          <label>Description</label>
          <TextInput aria-label="New round description" value={roundForm.description} onChange={(e: any) => setRoundForm((f) => ({ ...f, description: e.target.value }))} multiline fullWidth />
        </Field>
        <Field>
          <label>Rules</label>
          <TextInput aria-label="New round rules" value={roundForm.rules} onChange={(e: any) => setRoundForm((f) => ({ ...f, rules: e.target.value }))} multiline fullWidth />
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
          <TextInput aria-label="New round prizes JSON array" value={roundForm.prizesJson} onChange={(e: any) => setRoundForm((f) => ({ ...f, prizesJson: e.target.value }))} multiline fullWidth />
        </Field>
        <Field>
          <label>Previous winners JSON array</label>
          <TextInput aria-label="New round previous winners JSON array" value={roundForm.previousWinnersJson} onChange={(e: any) => setRoundForm((f) => ({ ...f, previousWinnersJson: e.target.value }))} multiline fullWidth />
        </Field>
        <Field>
          <label>Leaderboard JSON array (top 10 shown)</label>
          <TextInput aria-label="New round leaderboard JSON array" value={roundForm.leaderboardJson} onChange={(e: any) => setRoundForm((f) => ({ ...f, leaderboardJson: e.target.value }))} multiline fullWidth />
        </Field>
        <Field>
          <label>Eliminated contestants JSON array</label>
          <TextInput aria-label="New round eliminated contestants JSON array" value={roundForm.eliminatedContestantsJson} onChange={(e: any) => setRoundForm((f) => ({ ...f, eliminatedContestantsJson: e.target.value }))} multiline fullWidth />
        </Field>
        <UiButton
          onClick={() => {
            const payload = buildRoundPayload(roundForm);
            if (payload) createRoundMutation.mutate(payload);
          }}
          disabled={createRoundMutation.isPending}
        >
          Create round
        </UiButton>
      </UiPanel>
    </>
  );
}
