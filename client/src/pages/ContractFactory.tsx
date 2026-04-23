import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  Hourglass,
  Select,
  Separator,
  TextInput,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";

// WTF Contract Factory — Phase 8 operator UI.
//
// Scope (matches server routes in routes/collection-factory.ts):
//   1. Pick a template (teia_one_of_one, open_edition, bonding_curve,
//      blind_mint, buyback).
//   2. Enter an initial-storage blob (Michelson-ish SmartPy expression
//      accepted by Kiln workflow).
//   3. Hit "Compile & simulate" to sanity-check via Kiln.
//   4. Hit "Deploy" to origin; we persist the resulting contract in
//      `collection_contracts` and show it in the registry table below.
//
// Mainnet requires an explicit `Confirm mainnet` checkbox plus the
// WTF_FACTORY_ALLOW_MAINNET=1 server env flag (rejected server-side
// otherwise).

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const Muted = styled.span`
  color: #555;
  font-size: 12px;
`;

const Pre = styled.pre`
  background: #0b0b0b;
  color: #d6d6d6;
  padding: 8px 10px;
  font-size: 11px;
  max-height: 220px;
  overflow: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  th,
  td {
    padding: 4px 6px;
    border-bottom: 1px solid #b0b0b0;
    text-align: left;
    vertical-align: top;
  }
`;

type TemplateKind =
  | "teia_one_of_one"
  | "open_edition"
  | "bonding_curve"
  | "blind_mint"
  | "buyback";

type Network = "ghostnet" | "shadownet" | "mainnet";

interface Template {
  id: number;
  kind: TemplateKind;
  label: string;
  summary: string | null;
  sourcePath: string;
}

interface ContractRow {
  id: number;
  templateKind: TemplateKind;
  name: string;
  address: string | null;
  network: Network;
  status:
    | "pending"
    | "originating"
    | "live"
    | "failed"
    | "retired";
  opHash: string | null;
  deployedAt: string | null;
  errorMessage: string | null;
}

interface TemplatesResponse {
  kilnUrl: string;
  templates: Template[];
}

interface ContractsResponse {
  contracts: ContractRow[];
}

const TEMPLATE_KIND_OPTIONS: { value: TemplateKind; label: string }[] = [
  { value: "teia_one_of_one", label: "Teia-style 1/1 (allowlist)" },
  { value: "open_edition", label: "Open Edition" },
  { value: "bonding_curve", label: "Bonding Curve" },
  { value: "blind_mint", label: "Blind Mint (commit-reveal)" },
  { value: "buyback", label: "WTF-for-XTZ Buyback" },
];

const NETWORK_OPTIONS: { value: Network; label: string }[] = [
  { value: "ghostnet", label: "Ghostnet (test)" },
  { value: "shadownet", label: "Shadownet (WTF local)" },
  { value: "mainnet", label: "Mainnet (requires confirmation)" },
];

export function ContractFactory() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const templatesQuery = useQuery<TemplatesResponse>({
    queryKey: ["factory-templates"],
    queryFn: () => api.get<TemplatesResponse>("/api/factory/templates"),
    enabled: Boolean(user),
  });
  const contractsQuery = useQuery<ContractsResponse>({
    queryKey: ["factory-contracts"],
    queryFn: () => api.get<ContractsResponse>("/api/factory/contracts"),
    enabled: Boolean(user),
    refetchInterval: 20_000,
  });

  const [templateKind, setTemplateKind] =
    useState<TemplateKind>("teia_one_of_one");
  const [name, setName] = useState<string>("");
  const [network, setNetwork] = useState<Network>("ghostnet");
  const [initialStorage, setInitialStorage] = useState<string>("");
  const [wallet, setWallet] = useState<"A" | "B">("A");
  const [confirmMainnet, setConfirmMainnet] = useState<boolean>(false);
  const [compileOutput, setCompileOutput] = useState<unknown>(null);
  const [deployOutput, setDeployOutput] = useState<unknown>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const compileMutation = useMutation({
    mutationFn: () =>
      api.post<unknown>("/api/factory/compile", {
        templateKind,
        initialStorage,
      }),
    onSuccess: (result) => {
      setCompileOutput(result);
      setErrorMsg(null);
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const deployMutation = useMutation({
    mutationFn: () =>
      api.post<unknown>("/api/factory/deploy", {
        templateKind,
        name,
        network,
        initialStorage,
        wallet,
        autoClearance: true,
        confirmMainnet: network === "mainnet" ? confirmMainnet : undefined,
      }),
    onSuccess: (result) => {
      setDeployOutput(result);
      setErrorMsg(null);
      qc.invalidateQueries({ queryKey: ["factory-contracts"] });
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const retireMutation = useMutation({
    mutationFn: (id: number) =>
      api.post<unknown>(`/api/factory/contracts/${id}/retire`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["factory-contracts"] });
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const currentTemplate = useMemo(
    () =>
      templatesQuery.data?.templates.find((t) => t.kind === templateKind) ??
      null,
    [templatesQuery.data, templateKind]
  );

  if (!user) {
    return (
      <AppWindow title="Contract Factory">
        <Muted>Sign in to use the WTF Contract Factory.</Muted>
      </AppWindow>
    );
  }

  return (
    <AppWindow title="Contract Factory">
      <Stack>
        <Muted>
          Kiln endpoint:{" "}
          <code>{templatesQuery.data?.kilnUrl ?? "(loading)"}</code>
        </Muted>

        <GroupBox label="1. Template">
          <Row>
            <label style={{ fontSize: 12 }}>Kind</label>
            <Select
              options={TEMPLATE_KIND_OPTIONS}
              value={templateKind}
              onChange={(opt) =>
                setTemplateKind(opt.value as TemplateKind)
              }
              width={280}
            />
          </Row>
          {currentTemplate ? (
            <>
              <Muted>{currentTemplate.summary}</Muted>
              <Muted>
                Source: <code>{currentTemplate.sourcePath}</code>
              </Muted>
            </>
          ) : null}
        </GroupBox>

        <GroupBox label="2. Origination storage">
          <textarea
            value={initialStorage}
            onChange={(e) => setInitialStorage(e.target.value)}
            placeholder="Michelson or SmartPy initial-storage expression (Kiln parses it)"
            rows={8}
            style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
          />
          <Row>
            <Button
              onClick={() => compileMutation.mutate()}
              disabled={
                compileMutation.isPending || initialStorage.trim().length < 3
              }
            >
              {compileMutation.isPending
                ? "Compiling…"
                : "Compile & simulate via Kiln"}
            </Button>
            {compileMutation.isPending ? <Hourglass size={16} /> : null}
          </Row>
          {compileOutput ? (
            <Pre>{JSON.stringify(compileOutput, null, 2)}</Pre>
          ) : null}
        </GroupBox>

        <GroupBox label="3. Deploy">
          <Row>
            <label style={{ fontSize: 12 }}>Name</label>
            <TextInput
              value={name}
              onChange={(e) =>
                setName((e.target as HTMLInputElement).value.slice(0, 140))
              }
              placeholder="WTF Collection — Season 3 Sticker Design"
              style={{ width: 320 }}
            />
          </Row>
          <Row>
            <label style={{ fontSize: 12 }}>Network</label>
            <Select
              options={NETWORK_OPTIONS}
              value={network}
              onChange={(opt) => setNetwork(opt.value as Network)}
              width={240}
            />
            <label style={{ fontSize: 12 }}>Wallet</label>
            <Select
              options={[
                { value: "A", label: "Wallet A (bert)" },
                { value: "B", label: "Wallet B (ernie)" },
              ]}
              value={wallet}
              onChange={(opt) => setWallet(opt.value as "A" | "B")}
              width={140}
            />
          </Row>
          {network === "mainnet" ? (
            <Row>
              <input
                id="confirm-mainnet"
                type="checkbox"
                checked={confirmMainnet}
                onChange={(e) => setConfirmMainnet(e.target.checked)}
              />
              <label htmlFor="confirm-mainnet" style={{ fontSize: 12 }}>
                I confirm this is a mainnet origination. Server must also set
                <code> WTF_FACTORY_ALLOW_MAINNET=1</code>.
              </label>
            </Row>
          ) : null}
          <Row>
            <Button
              primary
              onClick={() => deployMutation.mutate()}
              disabled={
                deployMutation.isPending ||
                name.trim().length < 1 ||
                initialStorage.trim().length < 3 ||
                (network === "mainnet" && !confirmMainnet)
              }
            >
              {deployMutation.isPending ? "Deploying…" : "Deploy"}
            </Button>
            {deployMutation.isPending ? <Hourglass size={16} /> : null}
          </Row>
          {errorMsg ? (
            <Muted style={{ color: "#a00" }}>{errorMsg}</Muted>
          ) : null}
          {deployOutput ? (
            <Pre>{JSON.stringify(deployOutput, null, 2)}</Pre>
          ) : null}
        </GroupBox>

        <Separator />

        <GroupBox label="4. Deployed WTF contracts">
          {contractsQuery.isLoading ? (
            <Row>
              <Hourglass size={16} /> <Muted>Loading…</Muted>
            </Row>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Kind</th>
                  <th>Network</th>
                  <th>Status</th>
                  <th>Address</th>
                  <th>Deployed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {contractsQuery.data?.contracts.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.templateKind}</td>
                    <td>{row.network}</td>
                    <td>{row.status}</td>
                    <td>
                      {row.address ? (
                        <code style={{ fontSize: 11 }}>{row.address}</code>
                      ) : (
                        <Muted>—</Muted>
                      )}
                    </td>
                    <td>
                      {row.deployedAt
                        ? new Date(row.deployedAt).toLocaleString()
                        : "—"}
                    </td>
                    <td>
                      {row.status === "live" ? (
                        <Button
                          size="sm"
                          onClick={() => retireMutation.mutate(row.id)}
                          disabled={retireMutation.isPending}
                        >
                          Retire
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {contractsQuery.data?.contracts.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <Muted>
                        No WTF contracts originated yet. Deploy one from step
                        3.
                      </Muted>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          )}
        </GroupBox>
      </Stack>
    </AppWindow>
  );
}

export default ContractFactory;
