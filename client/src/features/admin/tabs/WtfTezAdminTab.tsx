import type { Dispatch, ReactElement, SetStateAction } from "react";
import {
  Hourglass,
  Select,
  Table,
  TableBody,
  TableDataCell,
  TableHead,
  TableHeadCell,
  TableRow,
  TextInput,
} from "react95";
import styled from "styled-components";
import { UserLink } from "../../../components/UserLink";
import { UiButton, UiNotice, UiPanel } from "../../../components/wtfos-ui";
import type {
  GrantWtfSubdomainPayload,
  UpdateWtfSubdomainStatusPayload,
} from "../types";
import type { WtfDomainsRegistrarStatus } from "@shared/wtf-subdomains";

const ActionRow = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
`;

const Intro = styled.p`
  margin: 0 0 var(--wtf-space-2, 8px);
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
`;

const TableWrap = styled.div`
  min-width: 0;
  overflow-x: auto;
`;

const DomainSuffix = styled.span`
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
`;

const MetaText = styled.div`
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
`;

const TruncateText = styled.span`
  display: block;
  max-width: 160px;
  overflow: hidden;
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

type UserOption = {
  id: number;
  username: string;
  displayName?: string | null;
};

type WtfSubdomainGrant = {
  id: number;
  fullName: string;
  username: string;
  displayName?: string | null;
  status: string;
  sourceType: string;
  sourceId?: number | string | null;
  walletAddress?: string | null;
  opHash?: string | null;
};

type SubdomainGrantForm = {
  userId: string;
  label: string;
  notes: string;
};

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending: boolean;
};

type AdminMutationWithError<TPayload> = AdminMutation<TPayload> & {
  error?: unknown;
};

type WtfTezAdminTabProps = {
  allUsers: UserOption[] | undefined;
  wtfSubdomainGrants: WtfSubdomainGrant[] | undefined;
  wtfDomainsRegistrar: WtfDomainsRegistrarStatus | undefined;
  subdomainGrantForm: SubdomainGrantForm;
  setSubdomainGrantForm: Dispatch<SetStateAction<SubdomainGrantForm>>;
  grantWtfSubdomainMutation: AdminMutationWithError<GrantWtfSubdomainPayload>;
  updateWtfSubdomainStatusMutation: AdminMutation<UpdateWtfSubdomainStatusPayload>;
  ConfirmButton: (props: {
    label: string;
    confirmLabel?: string;
    onConfirm: () => void;
    disabled?: boolean;
    size?: "sm" | "lg";
  }) => ReactElement;
};

export function WtfTezAdminTab({
  allUsers,
  wtfSubdomainGrants,
  wtfDomainsRegistrar,
  subdomainGrantForm,
  setSubdomainGrantForm,
  grantWtfSubdomainMutation,
  updateWtfSubdomainStatusMutation,
  ConfirmButton,
}: WtfTezAdminTabProps): ReactElement {
  const grantErrorMessage = grantWtfSubdomainMutation.error
    ? grantWtfSubdomainMutation.error instanceof Error
      ? grantWtfSubdomainMutation.error.message
      : String(grantWtfSubdomainMutation.error)
    : "";
  const parentDomain =
    wtfDomainsRegistrar?.config?.parentDomain?.trim() || "wtf.tez";

  return (
    <>
      <h3>WTF.tez Subdomains</h3>
      <Intro>
        Reserve names for users under {parentDomain}, then mark them provisioned once the TED record is created.
        Challenge and side-quest rewards can also create reserved grants.
      </Intro>

      <UiPanel title="Grant wtf.tez subdomain" compact style={{ marginBottom: 12 }}>
        <ActionRow>
          <Select
            value={parseInt(subdomainGrantForm.userId) || undefined}
            onChange={(e: any) =>
              setSubdomainGrantForm((f) => ({ ...f, userId: String(e.value) }))
            }
            options={(allUsers || []).map((u) => ({
              label: u.displayName ? `${u.displayName} (${u.username})` : u.username,
              value: u.id,
            }))}
            width={240}
          />
          <TextInput
            aria-label="Subdomain label"
            placeholder="label"
            value={subdomainGrantForm.label}
            onChange={(e: any) =>
              setSubdomainGrantForm((f) => ({
                ...f,
                label: String(e.target.value || "").toLowerCase(),
              }))
            }
            style={{ width: 140 }}
          />
          <DomainSuffix>.{parentDomain}</DomainSuffix>
          <TextInput
            aria-label="Subdomain grant notes"
            placeholder="notes"
            value={subdomainGrantForm.notes}
            onChange={(e: any) =>
              setSubdomainGrantForm((f) => ({ ...f, notes: e.target.value }))
            }
            style={{ width: 220 }}
          />
          <UiButton
            compact
            disabled={
              grantWtfSubdomainMutation.isPending ||
              !subdomainGrantForm.userId ||
              !subdomainGrantForm.label
            }
            onClick={() =>
              grantWtfSubdomainMutation.mutate({
                userId: Number(subdomainGrantForm.userId),
                label: subdomainGrantForm.label,
                notes: subdomainGrantForm.notes || undefined,
              })
            }
          >
            Grant wtf.tez subdomain
          </UiButton>
        </ActionRow>
        {grantErrorMessage && (
          <UiNotice tone="danger" style={{ marginTop: 8 }}>
            {grantErrorMessage}
          </UiNotice>
        )}
      </UiPanel>

      {!wtfSubdomainGrants ? (
        <Hourglass size={32} />
      ) : (
        <TableWrap>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>Name</TableHeadCell>
                <TableHeadCell>User</TableHeadCell>
                <TableHeadCell>Status</TableHeadCell>
                <TableHeadCell>Source</TableHeadCell>
                <TableHeadCell>Wallet</TableHeadCell>
                <TableHeadCell>Actions</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {wtfSubdomainGrants.map((grant) => (
                <TableRow key={grant.id}>
                  <TableDataCell>
                    <strong>{grant.fullName}</strong>
                    {grant.opHash && (
                      <MetaText>
                        operation: {grant.opHash.slice(0, 10)}...
                      </MetaText>
                    )}
                  </TableDataCell>
                  <TableDataCell>
                    <UserLink username={grant.username} displayName={grant.displayName} />
                  </TableDataCell>
                  <TableDataCell>{grant.status}</TableDataCell>
                  <TableDataCell>
                    {grant.sourceType}
                    {grant.sourceId ? ` #${grant.sourceId}` : ""}
                  </TableDataCell>
                  <TableDataCell>
                    <TruncateText>{grant.walletAddress || "---"}</TruncateText>
                  </TableDataCell>
                  <TableDataCell>
                    <ActionRow>
                      <UiButton
                        compact
                        disabled={updateWtfSubdomainStatusMutation.isPending}
                        onClick={() =>
                          updateWtfSubdomainStatusMutation.mutate({
                            id: grant.id,
                            status:
                              grant.status === "provisioned"
                                ? "reserved"
                                : "provisioned",
                          })
                        }
                      >
                        {grant.status === "provisioned"
                          ? "Mark subdomain reserved"
                          : "Mark subdomain provisioned"}
                      </UiButton>
                      {grant.status !== "revoked" && (
                        <ConfirmButton
                          label="Revoke subdomain"
                          confirmLabel="Confirm revoke"
                          onConfirm={() =>
                            updateWtfSubdomainStatusMutation.mutate({
                              id: grant.id,
                              status: "revoked",
                            })
                          }
                          disabled={updateWtfSubdomainStatusMutation.isPending}
                        />
                      )}
                    </ActionRow>
                  </TableDataCell>
                </TableRow>
              ))}
              {wtfSubdomainGrants.length === 0 && (
                <TableRow>
                  <TableDataCell>No subdomain grants yet.</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
