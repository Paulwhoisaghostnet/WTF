import type { Dispatch, SetStateAction } from "react";
import {
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
import { UserLink } from "../../../components/UserLink";
import { UiButton, UiPanel } from "../../../components/wtfos-ui";
import type {
  EntityUpdatePayload,
  GradeSubmissionPayload,
  SubmissionRewardPayload,
} from "../types";

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

const PanelStack = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  margin-top: var(--wtf-space-3, 12px);
`;

const TableWrap = styled.div`
  min-width: 0;
  overflow-x: auto;
`;

const TruncateText = styled.span`
  display: block;
  max-width: 220px;
  overflow: hidden;
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Hint = styled.small`
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
`;

const CHALLENGE_STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Grading", value: "grading" },
  { label: "Completed", value: "completed" },
];

const GRADE_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Pass", value: "pass" },
  { label: "Fail", value: "fail" },
  { label: "Bonus", value: "bonus" },
];

export const EMPTY_CHALLENGE_FORM = {
  roundId: "",
  title: "",
  description: "",
  criteria: "",
  rules: "",
  rewardAmountWtf: "",
  rewardXp: "",
  rewardEscrowSlug: "",
  rewardWtfSubdomain: false,
  rewardWtfSubdomainLabelTemplate: "",
  status: "draft",
  submissionContract: "",
  submissionTag: "",
  submissionCuration: "",
};

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending: boolean;
};

type ChallengeForm = typeof EMPTY_CHALLENGE_FORM;

type GradeForms = Record<number, { grade: string; feedback: string }>;

type ChallengesAdminTabProps = {
  allChallenges: any[] | undefined;
  allRounds: any[] | undefined;
  allSeasons: any[] | undefined;
  expandedChallengeData: any;
  challengeForm: ChallengeForm;
  setChallengeForm: Dispatch<SetStateAction<ChallengeForm>>;
  editingChallenge: any;
  setEditingChallenge: Dispatch<SetStateAction<any>>;
  expandedChallenge: number | null;
  setExpandedChallenge: Dispatch<SetStateAction<number | null>>;
  gradeForms: GradeForms;
  setGradeForms: Dispatch<SetStateAction<GradeForms>>;
  createChallengeMutation: AdminMutation<Record<string, any>>;
  updateChallengeMutation: AdminMutation<EntityUpdatePayload>;
  gradeSubmissionMutation: AdminMutation<GradeSubmissionPayload>;
  markRewardMutation: AdminMutation<SubmissionRewardPayload>;
};

function roundOptionLabel(round: any, seasons: any[] | undefined): string {
  const season = (seasons || []).find((s: any) => s.id === round.seasonId);
  const prefix = season ? `S${season.number} / ` : "Library / ";
  return `${prefix}R${round.number}: ${round.name}`;
}

export function ChallengesAdminTab({
  allChallenges,
  allRounds,
  allSeasons,
  expandedChallengeData,
  challengeForm,
  setChallengeForm,
  editingChallenge,
  setEditingChallenge,
  expandedChallenge,
  setExpandedChallenge,
  gradeForms,
  setGradeForms,
  createChallengeMutation,
  updateChallengeMutation,
  gradeSubmissionMutation,
  markRewardMutation,
}: ChallengesAdminTabProps) {
  return (
    <>
      <h3>Challenges</h3>

      <TableWrap>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeadCell>Title</TableHeadCell>
              <TableHeadCell>Round</TableHeadCell>
              <TableHeadCell>Status</TableHeadCell>
              <TableHeadCell>WTF / XP</TableHeadCell>
              <TableHeadCell>Actions</TableHeadCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(allChallenges || []).map((c: any) => {
              const round = (allRounds || []).find((r: any) => r.id === c.roundId);
              return (
                <TableRow key={c.id}>
                  <TableDataCell>
                    <TruncateText>{c.title}</TruncateText>
                  </TableDataCell>
                  <TableDataCell>{round ? `R${round.number}` : "---"}</TableDataCell>
                  <TableDataCell>{c.status}</TableDataCell>
                  <TableDataCell>{c.rewardAmountWtf || 0} / {c.rewardXp || 0}</TableDataCell>
                  <TableDataCell>
                    <ActionRow>
                      <UiButton
                        compact
                        onClick={() =>
                          setEditingChallenge(
                            editingChallenge?.id === c.id
                              ? null
                              : {
                                  ...c,
                                  roundId: String(c.roundId || ""),
                                  rewardAmountWtf: String(c.rewardAmountWtf || 0),
                                  rewardXp: String(c.rewardXp || 0),
                                  criteria: c.criteria || "",
                                  rules: c.rules || "",
                                  rewardEscrowSlug: c.rewardEscrowSlug || "",
                                  submissionContract: c.submissionContract || "",
                                  submissionTag: c.submissionTag || "",
                                  submissionCuration: c.submissionCuration || "",
                                  rewardWtfSubdomain: !!c.rewardWtfSubdomain,
                                  rewardWtfSubdomainLabelTemplate: c.rewardWtfSubdomainLabelTemplate || "",
                                }
                          )
                        }
                      >
                        {editingChallenge?.id === c.id ? "Cancel challenge edit" : "Edit challenge"}
                      </UiButton>
                      <UiButton
                        compact
                        onClick={() => setExpandedChallenge(expandedChallenge === c.id ? null : c.id)}
                      >
                        {expandedChallenge === c.id ? "Hide submissions" : "Review submissions"}
                      </UiButton>
                    </ActionRow>
                  </TableDataCell>
                </TableRow>
              );
            })}
            {(!allChallenges || allChallenges.length === 0) && (
              <TableRow>
                <TableDataCell>No challenges yet.</TableDataCell>
                <TableDataCell>---</TableDataCell>
                <TableDataCell>---</TableDataCell>
                <TableDataCell>---</TableDataCell>
                <TableDataCell>---</TableDataCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableWrap>

      {expandedChallenge !== null && expandedChallengeData?.submissions && (
        <UiPanel title={`Submissions for ${expandedChallengeData.title}`} compact style={{ marginTop: 12 }}>
          <TableWrap>
            <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>User</TableHeadCell>
                <TableHeadCell>Content</TableHeadCell>
                <TableHeadCell>Grade</TableHeadCell>
                <TableHeadCell>Rewarded</TableHeadCell>
                <TableHeadCell>Actions</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {expandedChallengeData.submissions.map((sub: any) => {
                const gf = gradeForms[sub.id] || { grade: sub.grade || "pending", feedback: sub.feedback || "" };
                return (
                  <TableRow key={sub.id}>
                    <TableDataCell><UserLink username={sub.username} displayName={sub.displayName} /></TableDataCell>
                    <TableDataCell>
                      <TruncateText>{sub.contentText || sub.contentUrl || "---"}</TruncateText>
                    </TableDataCell>
                    <TableDataCell>
                      <Select
                        aria-label={`Grade submission ${sub.id}`}
                        value={gf.grade}
                        onChange={(e: any) =>
                          setGradeForms((prev) => ({
                            ...prev,
                            [sub.id]: { ...gf, grade: e.value },
                          }))
                        }
                        options={GRADE_OPTIONS}
                        width={110}
                      />
                    </TableDataCell>
                    <TableDataCell>{sub.rewardDistributed ? "Yes" : "No"}</TableDataCell>
                    <TableDataCell>
                      <ActionRow>
                        <TextInput
                          aria-label={`Feedback for submission ${sub.id}`}
                          placeholder="Feedback"
                          value={gf.feedback}
                          onChange={(e: any) =>
                            setGradeForms((prev) => ({
                              ...prev,
                              [sub.id]: { ...gf, feedback: e.target.value },
                            }))
                          }
                          style={{ width: 100 }}
                        />
                        <UiButton
                          compact
                          onClick={() =>
                            gradeSubmissionMutation.mutate({
                              id: sub.id,
                              grade: gf.grade,
                              feedback: gf.feedback,
                            })
                          }
                          disabled={gradeSubmissionMutation.isPending}
                        >
                          Save submission grade
                        </UiButton>
                        {!sub.rewardDistributed && (sub.grade === "pass" || sub.grade === "bonus") && (
                          <UiButton
                            compact
                            onClick={() => markRewardMutation.mutate({ id: sub.id })}
                            disabled={markRewardMutation.isPending}
                          >
                            Mark submission rewarded
                          </UiButton>
                        )}
                      </ActionRow>
                    </TableDataCell>
                  </TableRow>
                );
              })}
              {expandedChallengeData.submissions.length === 0 && (
                <TableRow>
                  <TableDataCell>No submissions.</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                </TableRow>
              )}
            </TableBody>
            </Table>
          </TableWrap>
        </UiPanel>
      )}

      <PanelStack>
      {editingChallenge && (
        <UiPanel title={`Edit challenge: ${editingChallenge.title}`} compact>
          <Field>
            <label>Title</label>
            <TextInput aria-label="Edit challenge title" value={editingChallenge.title} onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, title: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Round</label>
            <Select
              aria-label="Edit challenge round"
              value={parseInt(editingChallenge.roundId) || undefined}
              onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, roundId: String(e.value) }))}
              options={[
                { label: "No round (challenge library)", value: 0 },
                ...(allRounds || []).map((r: any) => ({
                  label: roundOptionLabel(r, allSeasons),
                  value: r.id,
                })),
              ]}
              width={300}
            />
          </Field>
          <Field>
            <label>Status</label>
            <Select aria-label="Edit challenge status" value={editingChallenge.status} onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, status: e.value }))} options={CHALLENGE_STATUS_OPTIONS} width={200} />
          </Field>
          <Field>
            <label>Description</label>
            <TextInput aria-label="Edit challenge description" value={editingChallenge.description} onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, description: e.target.value }))} multiline fullWidth />
          </Field>
          <Field>
            <label>Criteria</label>
            <TextInput aria-label="Edit challenge criteria" value={editingChallenge.criteria} onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, criteria: e.target.value }))} multiline fullWidth />
          </Field>
          <Field>
            <label>Rules</label>
            <TextInput aria-label="Edit challenge rules" value={editingChallenge.rules} onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, rules: e.target.value }))} multiline fullWidth />
          </Field>
          <Field>
            <label>Reward WTF</label>
            <TextInput aria-label="Edit challenge WTF reward" value={editingChallenge.rewardAmountWtf} onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, rewardAmountWtf: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Reward XP</label>
            <TextInput aria-label="Edit challenge XP reward" value={editingChallenge.rewardXp} onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, rewardXp: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Submission Contract (optional)</label>
            <TextInput aria-label="Edit challenge submission contract" value={editingChallenge.submissionContract} onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, submissionContract: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Submission Tag (optional)</label>
            <TextInput aria-label="Edit challenge submission tag" value={editingChallenge.submissionTag} onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, submissionTag: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Submission Curation (optional)</label>
            <TextInput aria-label="Edit challenge submission curation" value={editingChallenge.submissionCuration} onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, submissionCuration: e.target.value }))} fullWidth />
            <Hint>These fields drive wallet/mint matching for tagged Tezos submissions.</Hint>
          </Field>
          <Field>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                aria-label="Edit challenge wtf.tez subdomain reward"
                checked={!!editingChallenge.rewardWtfSubdomain}
                onChange={(e) => setEditingChallenge((p: any) => ({ ...p, rewardWtfSubdomain: e.target.checked }))}
              />
              Grant wtf.tez subdomain on pass/bonus
            </label>
          </Field>
          {editingChallenge.rewardWtfSubdomain && (
            <Field>
              <label>Subdomain label template</label>
              <TextInput
                aria-label="Edit challenge subdomain label template"
                value={editingChallenge.rewardWtfSubdomainLabelTemplate}
                onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, rewardWtfSubdomainLabelTemplate: e.target.value }))}
                placeholder="{username}"
                fullWidth
              />
            </Field>
          )}
          <UiButton
            onClick={() =>
              updateChallengeMutation.mutate({
                id: editingChallenge.id,
                data: {
                  title: editingChallenge.title,
                  roundId: parseInt(editingChallenge.roundId) || null,
                  status: editingChallenge.status,
                  description: editingChallenge.description,
                  criteria: editingChallenge.criteria,
                  rules: editingChallenge.rules,
                  rewardAmountWtf: parseInt(editingChallenge.rewardAmountWtf) || 0,
                  rewardXp: parseInt(editingChallenge.rewardXp) || 0,
                  rewardEscrowSlug: editingChallenge.rewardEscrowSlug || null,
                  submissionContract: editingChallenge.submissionContract || null,
                  submissionTag: editingChallenge.submissionTag || null,
                  submissionCuration: editingChallenge.submissionCuration || null,
                  rewardWtfSubdomain: !!editingChallenge.rewardWtfSubdomain,
                  rewardWtfSubdomainLabelTemplate: editingChallenge.rewardWtfSubdomainLabelTemplate || null,
                },
              })
            }
            disabled={updateChallengeMutation.isPending}
          >
            Save challenge changes
          </UiButton>
        </UiPanel>
      )}

      <UiPanel title="New challenge" compact>
        <Field>
          <label>Round (optional)</label>
          <Select
            aria-label="New challenge round"
            value={parseInt(challengeForm.roundId) || undefined}
            onChange={(e: any) => setChallengeForm((f) => ({ ...f, roundId: String(e.value) }))}
            options={[
              { label: "No round (challenge library)", value: 0 },
              ...(allRounds || []).map((r: any) => ({
                label: roundOptionLabel(r, allSeasons),
                value: r.id,
              })),
            ]}
            width={300}
          />
        </Field>
        <Field>
          <label>Title</label>
          <TextInput aria-label="New challenge title" value={challengeForm.title} onChange={(e: any) => setChallengeForm((f) => ({ ...f, title: e.target.value }))} fullWidth />
        </Field>
        <Field>
          <label>Description</label>
          <TextInput aria-label="New challenge description" value={challengeForm.description} onChange={(e: any) => setChallengeForm((f) => ({ ...f, description: e.target.value }))} multiline fullWidth />
        </Field>
        <Field>
          <label>Criteria</label>
          <TextInput aria-label="New challenge criteria" value={challengeForm.criteria} onChange={(e: any) => setChallengeForm((f) => ({ ...f, criteria: e.target.value }))} multiline fullWidth />
        </Field>
        <Field>
          <label>Rules</label>
          <TextInput aria-label="New challenge rules" value={challengeForm.rules} onChange={(e: any) => setChallengeForm((f) => ({ ...f, rules: e.target.value }))} multiline fullWidth />
        </Field>
        <Field>
          <label>Reward WTF</label>
          <TextInput aria-label="New challenge WTF reward" value={challengeForm.rewardAmountWtf} onChange={(e: any) => setChallengeForm((f) => ({ ...f, rewardAmountWtf: e.target.value }))} fullWidth />
        </Field>
        <Field>
          <label>Reward XP</label>
          <TextInput aria-label="New challenge XP reward" value={challengeForm.rewardXp} onChange={(e: any) => setChallengeForm((f) => ({ ...f, rewardXp: e.target.value }))} fullWidth />
        </Field>
        <Field>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              aria-label="New challenge wtf.tez subdomain reward"
              checked={challengeForm.rewardWtfSubdomain}
              onChange={(e) => setChallengeForm((f) => ({ ...f, rewardWtfSubdomain: e.target.checked }))}
            />
            Grant wtf.tez subdomain on pass/bonus
          </label>
        </Field>
        {challengeForm.rewardWtfSubdomain && (
          <Field>
            <label>Subdomain label template</label>
            <TextInput
              aria-label="New challenge subdomain label template"
              value={challengeForm.rewardWtfSubdomainLabelTemplate}
              onChange={(e: any) => setChallengeForm((f) => ({ ...f, rewardWtfSubdomainLabelTemplate: e.target.value }))}
              placeholder="{username}"
              fullWidth
            />
          </Field>
        )}
        <Field>
          <label>Escrow Slug (optional)</label>
          <TextInput aria-label="New challenge escrow slug" value={challengeForm.rewardEscrowSlug} onChange={(e: any) => setChallengeForm((f) => ({ ...f, rewardEscrowSlug: e.target.value }))} fullWidth />
        </Field>
        <Field>
          <label>Submission Contract (optional)</label>
          <TextInput aria-label="New challenge submission contract" value={challengeForm.submissionContract} onChange={(e: any) => setChallengeForm((f) => ({ ...f, submissionContract: e.target.value }))} fullWidth />
        </Field>
        <Field>
          <label>Submission Tag (optional)</label>
          <TextInput aria-label="New challenge submission tag" value={challengeForm.submissionTag} onChange={(e: any) => setChallengeForm((f) => ({ ...f, submissionTag: e.target.value }))} fullWidth />
        </Field>
        <Field>
          <label>Submission Curation (optional)</label>
          <TextInput aria-label="New challenge submission curation" value={challengeForm.submissionCuration} onChange={(e: any) => setChallengeForm((f) => ({ ...f, submissionCuration: e.target.value }))} fullWidth />
          <Hint>Use these to pre-test wallet tracking for mint/tag/curation challenge formats.</Hint>
        </Field>
        <Field>
          <label>Status</label>
          <Select aria-label="New challenge status" value={challengeForm.status} onChange={(e: any) => setChallengeForm((f) => ({ ...f, status: e.value }))} options={CHALLENGE_STATUS_OPTIONS.slice(0, 2)} width={200} />
        </Field>
        <UiButton
          onClick={() =>
            createChallengeMutation.mutate({
              roundId: parseInt(challengeForm.roundId) || null,
              title: challengeForm.title,
              description: challengeForm.description,
              criteria: challengeForm.criteria,
              rules: challengeForm.rules,
              rewardAmountWtf: parseInt(challengeForm.rewardAmountWtf) || 0,
              rewardXp: parseInt(challengeForm.rewardXp) || 0,
              rewardWtfSubdomain: challengeForm.rewardWtfSubdomain,
              rewardWtfSubdomainLabelTemplate: challengeForm.rewardWtfSubdomainLabelTemplate || null,
              rewardEscrowSlug: challengeForm.rewardEscrowSlug || null,
              submissionContract: challengeForm.submissionContract || null,
              submissionTag: challengeForm.submissionTag || null,
              submissionCuration: challengeForm.submissionCuration || null,
              status: challengeForm.status,
            })
          }
          disabled={createChallengeMutation.isPending}
        >
          Create challenge
        </UiButton>
      </UiPanel>
      </PanelStack>
    </>
  );
}
