import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Panel, Separator, TextInput } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { originateClubDuesContract, payClubMembership } from "../lib/tezos";
import { useWallet } from "../lib/wallet-context";
import { useWindowManager } from "../lib/window-context";

type Network = "shadownet" | "ghostnet" | "mainnet";
type MembershipAction = 0 | 1 | 2;

type DuesContract = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  network: Network;
  status: string;
  contractAddress: string | null;
  managerWalletId: string;
  treasuryAddress: string;
  adminAddress: string;
  monthlyDuesMutez: number;
  monthlyDuesTez: string;
  monthSeconds: number;
  utilityUnitsPerMonth: string;
  gracePeriodDays: number;
  arrearsWarningDays: number;
  membershipSymbol: string;
  metadataUri: string | null;
};

type Membership = {
  id: number;
  contractId: number;
  walletAddress: string;
  utilityUnits: string;
  paidThrough: string;
  status: string;
  warningsSent: number;
  contract: DuesContract;
};

type CompileResponse = {
  ok: boolean;
  code: unknown | null;
  init: unknown | null;
  workflow: unknown;
  initialStorage: string;
  sourcePath: string;
};

type PaymentIntent = {
  paymentRef: string;
  months: number;
  periods: number;
  tierId: number;
  action: MembershipAction;
  amountMutez: number;
  amountTez: string;
  contractAddress: string | null;
};

const Shell = styled.div`
  min-height: 100%;
  padding: 10px;
  color: #101010;
  background:
    linear-gradient(90deg, rgba(51, 136, 153, 0.24), transparent 32%),
    linear-gradient(180deg, #e9e4d2 0%, #cfc7a8 100%);
`;

const Header = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 10px;
  margin-bottom: 10px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const TitlePanel = styled(Panel).attrs({ variant: "well" })`
  padding: 12px;
  background: #fff8d4;
`;

const Title = styled.h2`
  margin: 0 0 4px;
  font-size: 22px;
  letter-spacing: 0;
`;

const Subline = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11px;
`;

const Badge = styled.span<{ $good?: boolean }>`
  padding: 2px 6px;
  border: 1px solid #101010;
  background: ${(p) => (p.$good ? "#9effb4" : "#ffd36e")};
  font-weight: 700;
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.7fr);
  gap: 10px;

  @media (max-width: 1020px) {
    grid-template-columns: 1fr;
  }
`;

const Stack = styled.div`
  display: grid;
  gap: 10px;
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
`;

const ActionChooser = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 8px;
`;

const ActionTile = styled.button<{ $selected?: boolean }>`
  min-height: 76px;
  padding: 8px;
  border: 2px solid ${(p) => (p.$selected ? "#000080" : "#303030")};
  background: ${(p) => (p.$selected ? "#dce9ff" : "#fffdf0")};
  box-shadow: ${(p) => (p.$selected ? "inset 1px 1px #ffffff, 2px 2px 0 #303030" : "1px 1px 0 #303030")};
  color: #101010;
  text-align: left;
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  cursor: pointer;

  strong {
    display: block;
    margin-bottom: 3px;
    font-size: 12px;
  }

  span {
    display: block;
    font-size: 11px;
    line-height: 1.35;
  }
`;

const Field = styled.label`
  display: grid;
  gap: 3px;
  min-width: 0;
  font-size: 11px;
`;

const Select = styled.select`
  height: 28px;
  min-width: 0;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 72px;
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  font-size: 12px;
`;

const ContractCard = styled(Panel).attrs({ variant: "well" })`
  padding: 10px;
  background: #f8f3d9;
`;

const ContractGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
`;

const Micro = styled.div`
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
`;

const Pre = styled.pre`
  max-height: 210px;
  overflow: auto;
  margin: 0;
  padding: 8px;
  background: #101010;
  color: #d6ffd8;
  font-size: 11px;
`;

const StatusLine = styled.div<{ $error?: boolean }>`
  min-height: 18px;
  color: ${(p) => (p.$error ? "#a10000" : "#174c1d")};
  font-size: 11px;
  overflow-wrap: anywhere;
`;

const DEFAULT_FORM = {
  name: "WTF Club",
  slug: "wtf-club",
  description: "On-chain club dues, membership status, utility units, and access ledger.",
  network: "shadownet" as Network,
  treasuryAddress: "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt",
  adminAddress: "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt",
  monthlyDuesMutez: "1000000",
  monthSeconds: "2592000",
  utilityUnitsPerMonth: "1",
  gracePeriodDays: "7",
  arrearsWarningDays: "3",
  membershipSymbol: "DUES",
  metadataUri: "",
  managerWalletId: "club-dues-manager",
};

const PAYMENT_ACTIONS: Array<{
  id: MembershipAction;
  label: string;
  copy: string;
}> = [
  {
    id: 0,
    label: "Renew Existing",
    copy: "Extend the active token and keep its current art.",
  },
  {
    id: 1,
    label: "Mint Current Art",
    copy: "Retire the active token and mint the live drop.",
  },
  {
    id: 2,
    label: "Preserve + Mint",
    copy: "Pay the preserve fee, keep old art, and mint the live drop.",
  },
];

function asCustomization(form: typeof DEFAULT_FORM) {
  return {
    ...form,
    monthlyDuesMutez: Number(form.monthlyDuesMutez),
    monthSeconds: Number(form.monthSeconds),
    utilityUnitsPerMonth: Number(form.utilityUnitsPerMonth),
    gracePeriodDays: Number(form.gracePeriodDays),
    arrearsWarningDays: Number(form.arrearsWarningDays),
    metadataUri: form.metadataUri || null,
  };
}

function formatDate(value: string | null | undefined) {
  if (!value) return "none";
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DuesManager() {
  const { user, isAdmin } = useAuth();
  const wallet = useWallet();
  const wm = useWindowManager();
  const qc = useQueryClient();
  const [selectedSlug, setSelectedSlug] = useState("");
  const [months, setMonths] = useState(1);
  const [tierId, setTierId] = useState(0);
  const [membershipAction, setMembershipAction] = useState<MembershipAction>(0);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [compileOutput, setCompileOutput] = useState<CompileResponse | null>(null);
  const [externalDeploy, setExternalDeploy] = useState<{ opHash: string; contractAddress: string | null } | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const contractsQuery = useQuery({
    queryKey: ["club-dues", "contracts"],
    queryFn: () => api.get<{ contracts: DuesContract[] }>("/api/club-dues/contracts"),
    staleTime: 20_000,
  });

  const membershipsQuery = useQuery({
    queryKey: ["club-dues", "my"],
    queryFn: () => api.get<{ memberships: Membership[] }>("/api/club-dues/my"),
    enabled: Boolean(user),
    staleTime: 20_000,
  });

  const adminQuery = useQuery({
    queryKey: ["admin", "club-dues"],
    queryFn: () => api.get<any>("/api/admin/club-dues"),
    enabled: isAdmin,
    staleTime: 20_000,
  });

  const contracts = contractsQuery.data?.contracts ?? [];
  const selected = useMemo(
    () => contracts.find((contract) => contract.slug === selectedSlug) ?? contracts[0] ?? null,
    [contracts, selectedSlug]
  );

  const compileMutation = useMutation({
    mutationFn: () =>
      api.post<CompileResponse>("/api/club-dues/templates/compile", asCustomization(form)),
    onSuccess: (result) => {
      setCompileOutput(result);
      setStatus("Template compiled.");
      setError("");
    },
    onError: (err: Error) => setError(err.message),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<{ contract: DuesContract }>("/api/admin/club-dues/contracts", asCustomization(form)),
    onSuccess: (result) => {
      setSelectedSlug(result.contract.slug);
      setStatus("Dues contract saved as draft.");
      setError("");
      qc.invalidateQueries({ queryKey: ["club-dues"] });
      qc.invalidateQueries({ queryKey: ["admin", "club-dues"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const managerDeployMutation = useMutation({
    mutationFn: (contractId: number) =>
      api.post(`/api/admin/club-dues/contracts/${contractId}/deploy`, {
        confirmMainnet: true,
      }),
    onSuccess: () => {
      setStatus("Manager wallet deployment requested.");
      setError("");
      qc.invalidateQueries({ queryKey: ["club-dues"] });
      qc.invalidateQueries({ queryKey: ["admin", "club-dues"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick a dues contract first.");
      if (!user) throw new Error("Log in before creating a WTF dues ledger entry.");
      const connected = await wallet.connect();
      const response = await api.post<{ intent: PaymentIntent }>(
        `/api/club-dues/contracts/${selected.slug}/payment-intents`,
        { walletAddress: connected.address, months, tierId, action: membershipAction }
      );
      const opHash = await payClubMembership({
        walletAddress: connected.address,
        contractAddress: response.intent.contractAddress,
        paymentRef: response.intent.paymentRef,
        periods: response.intent.periods ?? response.intent.months,
        tierId: response.intent.tierId,
        action: response.intent.action,
        amountMutez: response.intent.amountMutez,
      });
      await api.post("/api/club-dues/payment-verify", { opHash });
      return opHash;
    },
    onSuccess: (opHash) => {
      setStatus(`Payment verified: ${opHash}`);
      setError("");
      qc.invalidateQueries({ queryKey: ["club-dues"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const externalDeployMutation = useMutation({
    mutationFn: async () => {
      const compiled =
        compileOutput ??
        (await api.post<CompileResponse>(
          "/api/club-dues/templates/compile",
          asCustomization(form)
        ));
      if (!compiled.code || !compiled.init) {
        throw new Error("Compiled template did not include code and init.");
      }
      const connected = await wallet.connect();
      return originateClubDuesContract({
        walletAddress: connected.address,
        code: compiled.code,
        init: compiled.init,
      });
    },
    onSuccess: (result) => {
      setExternalDeploy(result);
      setStatus("Wallet origination sent.");
      setError("");
    },
    onError: (err: Error) => setError(err.message),
  });

  const sweepMutation = useMutation({
    mutationFn: () => api.post("/api/admin/club-dues/arrears/sweep", { chainMark: false }),
    onSuccess: () => {
      setStatus("Arrears sweep completed.");
      setError("");
      qc.invalidateQueries({ queryKey: ["admin", "club-dues"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const setField = (key: keyof typeof DEFAULT_FORM, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <AppWindow title="Club Dues Manager">
      <Shell>
        <Header>
          <TitlePanel>
            <Title>Club Dues Manager</Title>
            <Subline>
              <Badge $good={Boolean(selected?.contractAddress)}>ON-CHAIN</Badge>
              <Badge $good={Boolean(user)}>WTF LEDGER</Badge>
              <Badge $good={isAdmin}>MANAGER WALLET</Badge>
              <span>dues.wtfgameshow.app</span>
            </Subline>
          </TitlePanel>
          <ContractCard>
            <Micro>Active contracts: {contracts.length}</Micro>
            <Micro>My memberships: {membershipsQuery.data?.memberships.length ?? 0}</Micro>
            <Micro>Admin arrears: {adminQuery.data?.totals?.arrears ?? "n/a"}</Micro>
            <Button size="sm" onClick={() => wm.openPage("/messages")}>Open Inbox</Button>
          </ContractCard>
        </Header>

        <Layout>
          <Stack>
            <GroupBox label="Pay or renew dues">
              <Stack>
                <ActionChooser>
                  {PAYMENT_ACTIONS.map((action) => (
                    <ActionTile
                      key={action.id}
                      type="button"
                      $selected={membershipAction === action.id}
                      onClick={() => setMembershipAction(action.id)}
                    >
                      <strong>{action.label}</strong>
                      <span>{action.copy}</span>
                    </ActionTile>
                  ))}
                </ActionChooser>
                <Row>
                  <Select
                    value={selected?.slug ?? ""}
                    onChange={(event) => setSelectedSlug(event.target.value)}
                  >
                    {contracts.map((contract) => (
                      <option key={contract.slug} value={contract.slug}>
                        {contract.name} ({contract.network})
                      </option>
                    ))}
                  </Select>
                  <Field style={{ maxWidth: 120 }}>
                    Months
                    <TextInput
                      value={String(months)}
                      onChange={(event) => setMonths(Math.max(1, Number(event.target.value) || 1))}
                    />
                  </Field>
                  <Field style={{ maxWidth: 120 }}>
                    Tier ID
                    <TextInput
                      value={String(tierId)}
                      onChange={(event) => setTierId(Math.max(0, Number(event.target.value) || 0))}
                    />
                  </Field>
                  <Button
                    onClick={() => payMutation.mutate()}
                    disabled={!selected || payMutation.isPending}
                  >
                    {payMutation.isPending ? "Working" : "Send Payment"}
                  </Button>
                </Row>
                {selected ? (
                  <Micro>
                    {selected.monthlyDuesTez} XTZ/period on default tier, preserve adds 1 XTZ,
                    paid into {selected.contractAddress ?? "pending deployment"}.
                  </Micro>
                ) : (
                  <Micro>No live dues contracts yet.</Micro>
                )}
                <ContractGrid>
                  {(membershipsQuery.data?.memberships ?? []).map((membership) => (
                    <ContractCard key={membership.id}>
                      <strong>{membership.contract.name}</strong>
                      <Micro>Status: {membership.status}</Micro>
                      <Micro>Paid through: {formatDate(membership.paidThrough)}</Micro>
                      <Micro>Utility units: {membership.utilityUnits}</Micro>
                      <Micro>Wallet: {membership.walletAddress}</Micro>
                    </ContractCard>
                  ))}
                </ContractGrid>
              </Stack>
            </GroupBox>

            <GroupBox label="Developer contract customization">
              <Stack>
                <Grid>
                  <Field>Name<TextInput value={form.name} onChange={(e) => setField("name", e.target.value)} /></Field>
                  <Field>Slug<TextInput value={form.slug} onChange={(e) => setField("slug", e.target.value)} /></Field>
                  <Field>Network
                    <Select value={form.network} onChange={(e) => setField("network", e.target.value)}>
                      <option value="shadownet">Shadownet</option>
                      <option value="ghostnet">Ghostnet</option>
                      <option value="mainnet">Mainnet</option>
                    </Select>
                  </Field>
                  <Field>Membership Symbol<TextInput value={form.membershipSymbol} onChange={(e) => setField("membershipSymbol", e.target.value)} /></Field>
                  <Field>Monthly Dues (mutez)<TextInput value={form.monthlyDuesMutez} onChange={(e) => setField("monthlyDuesMutez", e.target.value)} /></Field>
                  <Field>Month Seconds<TextInput value={form.monthSeconds} onChange={(e) => setField("monthSeconds", e.target.value)} /></Field>
                  <Field>Utility Units/Month<TextInput value={form.utilityUnitsPerMonth} onChange={(e) => setField("utilityUnitsPerMonth", e.target.value)} /></Field>
                  <Field>Grace Days<TextInput value={form.gracePeriodDays} onChange={(e) => setField("gracePeriodDays", e.target.value)} /></Field>
                  <Field>Warning Days<TextInput value={form.arrearsWarningDays} onChange={(e) => setField("arrearsWarningDays", e.target.value)} /></Field>
                  <Field>Manager Wallet ID<TextInput value={form.managerWalletId} onChange={(e) => setField("managerWalletId", e.target.value)} /></Field>
                  <Field>Treasury Address<TextInput value={form.treasuryAddress} onChange={(e) => setField("treasuryAddress", e.target.value)} /></Field>
                  <Field>Admin Address<TextInput value={form.adminAddress} onChange={(e) => setField("adminAddress", e.target.value)} /></Field>
                </Grid>
                <Field>Description<TextArea value={form.description} onChange={(e) => setField("description", e.target.value)} /></Field>
                <Field>Metadata URI<TextInput value={form.metadataUri} onChange={(e) => setField("metadataUri", e.target.value)} /></Field>
                <Row>
                  <Button onClick={() => compileMutation.mutate()} disabled={compileMutation.isPending}>
                    {compileMutation.isPending ? "Compiling" : "Compile Template"}
                  </Button>
                  <Button onClick={() => externalDeployMutation.mutate()} disabled={externalDeployMutation.isPending}>
                    {externalDeployMutation.isPending ? "Deploying" : "Deploy From My Wallet"}
                  </Button>
                  {isAdmin ? (
                    <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                      Save Admin Draft
                    </Button>
                  ) : null}
                </Row>
                {compileMutation.isPending || externalDeployMutation.isPending ? <Hourglass size={20} /> : null}
                {compileOutput ? <Pre>{JSON.stringify({ sourcePath: compileOutput.sourcePath, initialStorage: compileOutput.initialStorage, hasCode: Boolean(compileOutput.code), hasInit: Boolean(compileOutput.init) }, null, 2)}</Pre> : null}
                {externalDeploy ? <Pre>{JSON.stringify(externalDeploy, null, 2)}</Pre> : null}
              </Stack>
            </GroupBox>
          </Stack>

          <Stack>
            <GroupBox label="Contract registry">
              <Stack>
                {contractsQuery.isLoading ? <Hourglass size={24} /> : null}
                <ContractGrid>
                  {contracts.map((contract) => (
                    <ContractCard key={contract.id}>
                      <strong>{contract.name}</strong>
                      <Micro>{contract.slug} / {contract.network} / {contract.status}</Micro>
                      <Micro>Contract: {contract.contractAddress ?? "not deployed"}</Micro>
                      <Micro>Treasury: {contract.treasuryAddress}</Micro>
                      {isAdmin ? (
                        <Button
                          size="sm"
                          onClick={() => managerDeployMutation.mutate(contract.id)}
                          disabled={managerDeployMutation.isPending || contract.status === "live"}
                        >
                          Manager Deploy
                        </Button>
                      ) : null}
                    </ContractCard>
                  ))}
                </ContractGrid>
              </Stack>
            </GroupBox>

            {isAdmin ? (
              <GroupBox label="Admin operations">
                <Stack>
                  <Micro>Signer configured: {adminQuery.data?.signerConfigured ? "yes" : "no"}</Micro>
                  <Micro>Total members: {adminQuery.data?.totals?.members ?? 0}</Micro>
                  <Micro>Members in arrears: {adminQuery.data?.totals?.arrears ?? 0}</Micro>
                  <Row>
                    <Button onClick={() => sweepMutation.mutate()} disabled={sweepMutation.isPending}>
                      Sweep Arrears
                    </Button>
                    <Button onClick={() => wm.openPage("/operator-wallet")}>Operator Wallet</Button>
                  </Row>
                  <Separator />
                  <Pre>{JSON.stringify(adminQuery.data?.recentDeployments ?? [], null, 2)}</Pre>
                </Stack>
              </GroupBox>
            ) : null}

            <StatusLine $error={Boolean(error)}>{error || status || "Ready."}</StatusLine>
          </Stack>
        </Layout>
      </Shell>
    </AppWindow>
  );
}
