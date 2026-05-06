import type { Dispatch, SetStateAction } from "react";
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
import { UserLink } from "../../../components/UserLink";
import type { ApproveCompletionPayload, EntityUpdatePayload } from "../types";

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

const SubSection = styled.div`
  margin-top: 12px;
  padding: 8px;
  border: 1px solid #888;
  background: #fff;
`;

const QUEST_STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
];

const AUTO_VERIFY_OPTIONS = [
  { label: "Manual (host reviews)", value: "manual" },
  { label: "Profile Avatar set", value: "profile_avatar" },
  { label: "Profile Bio set", value: "profile_bio" },
  { label: "Wallet Connected", value: "wallet_connected" },
  { label: "Twitter/X Linked", value: "social_twitter" },
  { label: "Discord Linked", value: "social_discord" },
  { label: "Posted in Message Board", value: "post_message" },
  { label: "Cockpit: any positive holding", value: "holds_positive_balance" },
  { label: "Cockpit: holds art/NFT (non-WTF FA2)", value: "holds_art_nft" },
  { label: "Cockpit: has indexed mint event", value: "has_mint_event" },
  { label: "Cockpit: listed on trade board", value: "listed_on_trade_board" },
];

export const EMPTY_QUEST_FORM = {
  title: "",
  description: "",
  criteria: "",
  rewardAmountWtf: "",
  rewardXp: "",
  rewardWtfSubdomain: false,
  rewardWtfSubdomainLabelTemplate: "",
  maxCompletions: "",
  deadline: "",
  status: "draft",
  persistent: false,
  autoVerifyType: "manual",
};

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending: boolean;
};

type QuestForm = typeof EMPTY_QUEST_FORM;

type SideQuestsAdminTabProps = {
  allSideQuests: any[] | undefined;
  expandedQuestData: any;
  questForm: QuestForm;
  setQuestForm: Dispatch<SetStateAction<QuestForm>>;
  editingQuest: any;
  setEditingQuest: Dispatch<SetStateAction<any>>;
  expandedQuest: number | null;
  setExpandedQuest: Dispatch<SetStateAction<number | null>>;
  createQuestMutation: AdminMutation<Record<string, any>>;
  updateQuestMutation: AdminMutation<EntityUpdatePayload>;
  approveCompletionMutation: AdminMutation<ApproveCompletionPayload>;
};

export function SideQuestsAdminTab({
  allSideQuests,
  expandedQuestData,
  questForm,
  setQuestForm,
  editingQuest,
  setEditingQuest,
  expandedQuest,
  setExpandedQuest,
  createQuestMutation,
  updateQuestMutation,
  approveCompletionMutation,
}: SideQuestsAdminTabProps) {
  return (
    <>
      <h3>Side Quests</h3>

      <Table>
        <TableHead>
          <TableRow>
            <TableHeadCell>Title</TableHeadCell>
            <TableHeadCell>Status</TableHeadCell>
            <TableHeadCell>Reward</TableHeadCell>
            <TableHeadCell>Max</TableHeadCell>
            <TableHeadCell>Actions</TableHeadCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(allSideQuests || []).map((sq: any) => (
            <TableRow key={sq.id}>
              <TableDataCell style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {sq.title}
              </TableDataCell>
              <TableDataCell>{sq.status}</TableDataCell>
              <TableDataCell>{sq.rewardAmountWtf || 0} WTF / {sq.rewardXp || 0} XP</TableDataCell>
              <TableDataCell>
                {sq.maxCompletions ?? "∞"}
                {sq.persistent && " [P]"}
                {sq.autoVerifyType !== "manual" && ` [${sq.autoVerifyType}]`}
              </TableDataCell>
              <TableDataCell>
                <ActionRow>
                  <Button
                    size="sm"
                    onClick={() =>
                      setEditingQuest(
                        editingQuest?.id === sq.id
                          ? null
                          : {
                              ...sq,
                              rewardAmountWtf: String(sq.rewardAmountWtf || 0),
                              rewardXp: String(sq.rewardXp || 0),
                              rewardWtfSubdomain: !!sq.rewardWtfSubdomain,
                              rewardWtfSubdomainLabelTemplate: sq.rewardWtfSubdomainLabelTemplate || "",
                              maxCompletions: String(sq.maxCompletions || ""),
                              criteria: sq.criteria || "",
                              deadline: sq.deadline || "",
                              persistent: !!sq.persistent,
                              autoVerifyType: sq.autoVerifyType || "manual",
                            }
                      )
                    }
                  >
                    {editingQuest?.id === sq.id ? "Cancel" : "Edit"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setExpandedQuest(expandedQuest === sq.id ? null : sq.id)}
                  >
                    {expandedQuest === sq.id ? "Hide" : "Completions"}
                  </Button>
                </ActionRow>
              </TableDataCell>
            </TableRow>
          ))}
          {(!allSideQuests || allSideQuests.length === 0) && (
            <TableRow>
              <TableDataCell>No side quests yet.</TableDataCell>
              <TableDataCell>---</TableDataCell>
              <TableDataCell>---</TableDataCell>
              <TableDataCell>---</TableDataCell>
              <TableDataCell>---</TableDataCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Completions sub-panel */}
      {expandedQuest !== null && expandedQuestData?.completions && (
        <SubSection>
          <h4>Completions for: {expandedQuestData.title}</h4>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>User</TableHeadCell>
                <TableHeadCell>Proof</TableHeadCell>
                <TableHeadCell>Date</TableHeadCell>
                <TableHeadCell>Approved</TableHeadCell>
                <TableHeadCell>Actions</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {expandedQuestData.completions.map((comp: any) => (
                <TableRow key={comp.id}>
                  <TableDataCell><UserLink username={comp.username} displayName={comp.displayName} /></TableDataCell>
                  <TableDataCell style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {comp.proofText || comp.proofUrl || "---"}
                  </TableDataCell>
                  <TableDataCell>{new Date(comp.completedAt).toLocaleDateString()}</TableDataCell>
                  <TableDataCell>
                    {comp.approved === true ? "Approved" : comp.approved === false ? "Rejected" : "Pending"}
                    {comp.xpAwarded > 0 && ` (+${comp.xpAwarded} XP)`}
                  </TableDataCell>
                  <TableDataCell>
                    {comp.approved === null && (
                      <ActionRow>
                        <Button
                          size="sm"
                          onClick={() => approveCompletionMutation.mutate({ id: comp.id, approved: true })}
                          disabled={approveCompletionMutation.isPending}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => approveCompletionMutation.mutate({ id: comp.id, approved: false })}
                          disabled={approveCompletionMutation.isPending}
                        >
                          Reject
                        </Button>
                      </ActionRow>
                    )}
                    {comp.approved !== null && <span>---</span>}
                  </TableDataCell>
                </TableRow>
              ))}
              {expandedQuestData.completions.length === 0 && (
                <TableRow>
                  <TableDataCell>No completions.</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </SubSection>
      )}

      {/* Edit quest */}
      {editingQuest && (
        <GroupBox label={`Edit: ${editingQuest.title}`} style={{ marginTop: 12 }}>
          <Field>
            <label>Title</label>
            <TextInput value={editingQuest.title} onChange={(e: any) => setEditingQuest((p: any) => ({ ...p, title: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Status</label>
            <Select value={editingQuest.status} onChange={(e: any) => setEditingQuest((p: any) => ({ ...p, status: e.value }))} options={QUEST_STATUS_OPTIONS} width={200} />
          </Field>
          <Field>
            <label>Description</label>
            <TextInput value={editingQuest.description} onChange={(e: any) => setEditingQuest((p: any) => ({ ...p, description: e.target.value }))} multiline fullWidth />
          </Field>
          <Field>
            <label>Criteria</label>
            <TextInput value={editingQuest.criteria} onChange={(e: any) => setEditingQuest((p: any) => ({ ...p, criteria: e.target.value }))} multiline fullWidth />
          </Field>
          <Field>
            <label>Reward WTF</label>
            <TextInput value={editingQuest.rewardAmountWtf} onChange={(e: any) => setEditingQuest((p: any) => ({ ...p, rewardAmountWtf: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Reward XP</label>
            <TextInput value={editingQuest.rewardXp} onChange={(e: any) => setEditingQuest((p: any) => ({ ...p, rewardXp: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={!!editingQuest.rewardWtfSubdomain}
                onChange={(e) => setEditingQuest((p: any) => ({ ...p, rewardWtfSubdomain: e.target.checked }))}
              />
              Grant wtf.tez subdomain when approved
            </label>
          </Field>
          {editingQuest.rewardWtfSubdomain && (
            <Field>
              <label>Subdomain label template</label>
              <TextInput
                value={editingQuest.rewardWtfSubdomainLabelTemplate}
                onChange={(e: any) => setEditingQuest((p: any) => ({ ...p, rewardWtfSubdomainLabelTemplate: e.target.value }))}
                placeholder="{username}"
                fullWidth
              />
            </Field>
          )}
          <Field>
            <label>Max Completions</label>
            <TextInput value={editingQuest.maxCompletions} onChange={(e: any) => setEditingQuest((p: any) => ({ ...p, maxCompletions: e.target.value }))} fullWidth />
          </Field>
          <Field>
            <label>Auto-Verify Type</label>
            <Select
              value={editingQuest.autoVerifyType}
              onChange={(e: any) => setEditingQuest((p: any) => ({ ...p, autoVerifyType: e.value }))}
              options={AUTO_VERIFY_OPTIONS}
              width={250}
            />
          </Field>
          <Field>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={editingQuest.persistent}
                onChange={(e) => setEditingQuest((p: any) => ({ ...p, persistent: e.target.checked }))}
              />
              Persistent (always available, completable once per user)
            </label>
          </Field>
          <Button
            onClick={() =>
              updateQuestMutation.mutate({
                id: editingQuest.id,
                data: {
                  title: editingQuest.title,
                  status: editingQuest.status,
                  description: editingQuest.description,
                  criteria: editingQuest.criteria,
                  rewardAmountWtf: parseInt(editingQuest.rewardAmountWtf) || 0,
                  rewardXp: parseInt(editingQuest.rewardXp) || 0,
                  rewardWtfSubdomain: !!editingQuest.rewardWtfSubdomain,
                  rewardWtfSubdomainLabelTemplate: editingQuest.rewardWtfSubdomainLabelTemplate || null,
                  maxCompletions: parseInt(editingQuest.maxCompletions) || null,
                  persistent: editingQuest.persistent,
                  autoVerifyType: editingQuest.autoVerifyType,
                },
              })
            }
            disabled={updateQuestMutation.isPending}
          >
            Save Changes
          </Button>
        </GroupBox>
      )}

      {/* Create quest */}
      <GroupBox label="New Side Quest" style={{ marginTop: 12 }}>
        <Field>
          <label>Title</label>
          <TextInput value={questForm.title} onChange={(e: any) => setQuestForm((f) => ({ ...f, title: e.target.value }))} fullWidth />
        </Field>
        <Field>
          <label>Description</label>
          <TextInput value={questForm.description} onChange={(e: any) => setQuestForm((f) => ({ ...f, description: e.target.value }))} multiline fullWidth />
        </Field>
        <Field>
          <label>Criteria</label>
          <TextInput value={questForm.criteria} onChange={(e: any) => setQuestForm((f) => ({ ...f, criteria: e.target.value }))} multiline fullWidth />
        </Field>
        <Field>
          <label>Reward WTF</label>
          <TextInput value={questForm.rewardAmountWtf} onChange={(e: any) => setQuestForm((f) => ({ ...f, rewardAmountWtf: e.target.value }))} fullWidth />
        </Field>
        <Field>
          <label>Reward XP</label>
          <TextInput value={questForm.rewardXp} onChange={(e: any) => setQuestForm((f) => ({ ...f, rewardXp: e.target.value }))} fullWidth />
        </Field>
        <Field>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={questForm.rewardWtfSubdomain}
              onChange={(e) => setQuestForm((f) => ({ ...f, rewardWtfSubdomain: e.target.checked }))}
            />
            Grant wtf.tez subdomain when approved
          </label>
        </Field>
        {questForm.rewardWtfSubdomain && (
          <Field>
            <label>Subdomain label template</label>
            <TextInput
              value={questForm.rewardWtfSubdomainLabelTemplate}
              onChange={(e: any) => setQuestForm((f) => ({ ...f, rewardWtfSubdomainLabelTemplate: e.target.value }))}
              placeholder="{username}"
              fullWidth
            />
          </Field>
        )}
        <Field>
          <label>Max Completions</label>
          <TextInput value={questForm.maxCompletions} onChange={(e: any) => setQuestForm((f) => ({ ...f, maxCompletions: e.target.value }))} fullWidth />
        </Field>
        <Field>
          <label>Auto-Verify Type</label>
          <Select
            value={questForm.autoVerifyType}
            onChange={(e: any) => setQuestForm((f) => ({ ...f, autoVerifyType: e.value }))}
            options={AUTO_VERIFY_OPTIONS}
            width={250}
          />
        </Field>
        <Field>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={questForm.persistent}
              onChange={(e) => setQuestForm((f) => ({ ...f, persistent: e.target.checked }))}
            />
            Persistent (always available, completable once per user)
          </label>
        </Field>
        <Field>
          <label>Status</label>
          <Select value={questForm.status} onChange={(e: any) => setQuestForm((f) => ({ ...f, status: e.value }))} options={QUEST_STATUS_OPTIONS.slice(0, 2)} width={200} />
        </Field>
        <Button
          onClick={() =>
            createQuestMutation.mutate({
              title: questForm.title,
              description: questForm.description,
              criteria: questForm.criteria,
              rewardAmountWtf: parseInt(questForm.rewardAmountWtf) || 0,
              rewardXp: parseInt(questForm.rewardXp) || 0,
              rewardWtfSubdomain: questForm.rewardWtfSubdomain,
              rewardWtfSubdomainLabelTemplate: questForm.rewardWtfSubdomainLabelTemplate || null,
              maxCompletions: parseInt(questForm.maxCompletions) || null,
              persistent: questForm.persistent,
              autoVerifyType: questForm.autoVerifyType,
              status: questForm.status,
            })
          }
          disabled={createQuestMutation.isPending}
        >
          Create Side Quest
        </Button>
      </GroupBox>
    </>
  );
}
