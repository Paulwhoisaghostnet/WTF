import type { Dispatch, ReactElement, SetStateAction } from "react";
import {
  Button,
  GroupBox,
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
import type {
  GrantWtfSubdomainPayload,
  UpdateWtfSubdomainStatusPayload,
} from "../types";
import type { WtfDomainsRegistrarStatus } from "@shared/wtf-subdomains";

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
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
      <p style={{ marginBottom: 8, fontSize: 12, color: "#444" }}>
        Reserve names for users under {parentDomain}, then mark them provisioned once the TED record is created.
        Challenge and side-quest rewards can also create reserved grants.
      </p>

      <GroupBox label="Grant Subdomain" style={{ marginBottom: 12 }}>
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
          <span style={{ fontSize: 12 }}>.{parentDomain}</span>
          <TextInput
            placeholder="notes"
            value={subdomainGrantForm.notes}
            onChange={(e: any) =>
              setSubdomainGrantForm((f) => ({ ...f, notes: e.target.value }))
            }
            style={{ width: 220 }}
          />
          <Button
            size="sm"
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
            Grant
          </Button>
        </ActionRow>
        {grantErrorMessage && (
          <p style={{ color: "#a00", fontSize: 11, marginTop: 6 }}>
            {grantErrorMessage}
          </p>
        )}
      </GroupBox>

      {!wtfSubdomainGrants ? (
        <Hourglass size={32} />
      ) : (
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
                    <div style={{ fontSize: 10, color: "#555" }}>
                      {grant.opHash.slice(0, 10)}...
                    </div>
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
                <TableDataCell
                  style={{
                    fontSize: 10,
                    maxWidth: 120,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {grant.walletAddress || "---"}
                </TableDataCell>
                <TableDataCell>
                  <ActionRow>
                    <Button
                      size="sm"
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
                      {grant.status === "provisioned" ? "Unmark" : "Provisioned"}
                    </Button>
                    {grant.status !== "revoked" && (
                      <ConfirmButton
                        label="Revoke"
                        confirmLabel="Confirm"
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
                <TableDataCell>No grants yet.</TableDataCell>
                <TableDataCell>---</TableDataCell>
                <TableDataCell>---</TableDataCell>
                <TableDataCell>---</TableDataCell>
                <TableDataCell>---</TableDataCell>
                <TableDataCell>---</TableDataCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </>
  );
}
