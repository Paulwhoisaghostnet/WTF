import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hourglass, Select, Separator, TextInput } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import {
  UiButton,
  UiEmptyState,
  UiNotice,
  UiPanel,
  UiTabs,
} from "../components/wtfos-ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Fa2WizardPanel } from "../features/contract-factory/Fa2WizardPanel";

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
  gap: var(--wtf-space-3, 12px);
  min-width: 0;
`;

const Row = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
`;

const Muted = styled.span`
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

const Pre = styled.pre`
  background: #0b0b0b;
  color: #d6d6d6;
  padding: var(--wtf-space-3, 12px);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  max-height: 220px;
  overflow: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  th,
  td {
    padding: var(--wtf-space-2, 8px);
    border-bottom: 1px solid var(--wtf-app-border, #808080);
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
  }
`;

const TableWrap = styled.div`
  overflow: auto;
  min-width: 0;
`;

const ControlLabel = styled.label`
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-width: 0;
  padding: var(--wtf-space-2, 8px);
  color: var(--wtf-app-text, #111);
  background: var(--wtf-app-control-bg, #ffffff);
  border: 1px solid var(--wtf-app-control-border, #808080);
  font-family: var(--wtf-mono-font, monospace);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
`;

const StepCard = styled.div`
  display: grid;
  gap: var(--wtf-space-2, 8px);
  padding: var(--wtf-space-3, 12px);
  color: var(--wtf-app-text, #111);
  background: var(--wtf-app-surface-raised, #ffffff);
  border: 1px solid var(--wtf-app-border, #808080);
`;

const InlineCode = styled.code`
  font-size: var(--wtf-type-caption, 13px);
  overflow-wrap: anywhere;
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

type SimulationWallet = "bert" | "ernie" | "user";

interface SimulationStepDraft {
  id: number;
  wallet: SimulationWallet;
  entrypoint: string;
  argsJson: string;
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

const SIMULATION_WALLET_OPTIONS: { value: SimulationWallet; label: string }[] =
  [
    { value: "user", label: "User wallet" },
    { value: "bert", label: "Bert test wallet" },
    { value: "ernie", label: "Ernie test wallet" },
  ];

const DEFAULT_SIMULATION_ARGS = "{}";

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
  const [simulationSteps, setSimulationSteps] = useState<SimulationStepDraft[]>(
    [
      {
        id: 1,
        wallet: "user",
        entrypoint: "mint",
        argsJson: DEFAULT_SIMULATION_ARGS,
      },
    ]
  );
  const [compileOutput, setCompileOutput] = useState<unknown>(null);
  const [deployOutput, setDeployOutput] = useState<unknown>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"deploy" | "wizard">("deploy");

  function buildSimulationSteps() {
    return simulationSteps
      .filter((step) => step.entrypoint.trim().length > 0)
      .map((step, index) => {
        try {
          return {
            wallet: step.wallet,
            entrypoint: step.entrypoint.trim(),
            args: step.argsJson.trim()
              ? JSON.parse(step.argsJson)
              : {},
          };
        } catch {
          throw new Error(
            `Simulation step ${index + 1} has invalid JSON arguments.`
          );
        }
      });
  }

  const compileMutation = useMutation({
    mutationFn: () =>
      api.post<unknown>("/api/factory/compile", {
        templateKind,
        initialStorage,
        simulationSteps: buildSimulationSteps(),
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

  function updateSimulationStep(
    id: number,
    patch: Partial<Omit<SimulationStepDraft, "id">>
  ) {
    setSimulationSteps((steps) =>
      steps.map((step) => (step.id === id ? { ...step, ...patch } : step))
    );
  }

  function addSimulationStep() {
    setSimulationSteps((steps) => [
      ...steps,
      {
        id: Math.max(0, ...steps.map((step) => step.id)) + 1,
        wallet: "user",
        entrypoint: "",
        argsJson: DEFAULT_SIMULATION_ARGS,
      },
    ]);
  }

  function removeSimulationStep(id: number) {
    setSimulationSteps((steps) =>
      steps.length > 1 ? steps.filter((step) => step.id !== id) : steps
    );
  }

  if (!user) {
    return (
      <AppWindow title="Contract Factory">
        <UiPanel title="Contract Factory" compact>
          <Muted>Sign in to use the WTF Contract Factory.</Muted>
        </UiPanel>
      </AppWindow>
    );
  }

  return (
    <AppWindow title="Contract Factory">
      <Stack>
        <UiTabs
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as "deploy" | "wizard")}
          tabs={[
            { id: "deploy", label: "Deploy contract" },
            { id: "wizard", label: "FA2 Wizard" },
          ]}
        />

      {activeTab === "deploy" && (
      <>
        <Muted>
          Kiln endpoint:{" "}
          <InlineCode>{templatesQuery.data?.kilnUrl ?? "(loading)"}</InlineCode>
        </Muted>

        <UiPanel title="Template" compact>
          <Row>
            <ControlLabel>Kind</ControlLabel>
            <Select
              options={TEMPLATE_KIND_OPTIONS}
              value={templateKind}
              aria-label="Contract template kind"
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
                Source: <InlineCode>{currentTemplate.sourcePath}</InlineCode>
              </Muted>
            </>
          ) : null}
        </UiPanel>

        <UiPanel title="Origination storage" compact>
          <TextArea
            value={initialStorage}
            aria-label="Origination storage"
            onChange={(e) => setInitialStorage(e.target.value)}
            placeholder="Michelson or SmartPy initial-storage expression (Kiln parses it)"
            rows={8}
          />
        </UiPanel>

        <UiPanel title="Browser Kiln test" compact>
          <Stack>
            {simulationSteps.map((step, index) => (
              <StepCard key={step.id}>
                <Row>
                  <Muted>Step {index + 1}</Muted>
                  <ControlLabel>Wallet</ControlLabel>
                  <Select
                    options={SIMULATION_WALLET_OPTIONS}
                    value={step.wallet}
                    aria-label={`Simulation step ${index + 1} wallet`}
                    onChange={(opt) =>
                      updateSimulationStep(step.id, {
                        wallet: opt.value as SimulationWallet,
                      })
                    }
                    width={170}
                  />
                  <ControlLabel>Entrypoint</ControlLabel>
                  <TextInput
                    value={step.entrypoint}
                    aria-label={`Simulation step ${index + 1} entrypoint`}
                    onChange={(e) =>
                      updateSimulationStep(step.id, {
                        entrypoint: (e.target as HTMLInputElement).value.slice(
                          0,
                          120
                        ),
                      })
                    }
                    placeholder="mint"
                    style={{ width: 180 }}
                  />
                  <UiButton
                    compact
                    onClick={() => removeSimulationStep(step.id)}
                    disabled={simulationSteps.length < 2}
                  >
                    Remove step
                  </UiButton>
                </Row>
                <TextArea
                  value={step.argsJson}
                  onChange={(e) =>
                    updateSimulationStep(step.id, {
                      argsJson: e.target.value.slice(0, 10_000),
                    })
                  }
                  aria-label={`Simulation step ${index + 1} JSON arguments`}
                  rows={3}
                />
              </StepCard>
            ))}
            <Row>
              <UiButton onClick={addSimulationStep}>Add simulation step</UiButton>
              <UiButton
                onClick={() => compileMutation.mutate()}
                disabled={
                  compileMutation.isPending || initialStorage.trim().length < 3
                }
              >
                {compileMutation.isPending
                  ? "Testing…"
                  : "Compile and test in Kiln"}
              </UiButton>
              {compileMutation.isPending ? <Hourglass size={16} /> : null}
            </Row>
            {compileOutput ? (
              <Pre>{JSON.stringify(compileOutput, null, 2)}</Pre>
            ) : null}
          </Stack>
        </UiPanel>

        <UiPanel title="Deploy" compact>
          <Row>
            <ControlLabel>Name</ControlLabel>
            <TextInput
              value={name}
              aria-label="Contract name"
              onChange={(e) =>
                setName((e.target as HTMLInputElement).value.slice(0, 140))
              }
              placeholder="WTF Collection — Season 3 Sticker Design"
              style={{ width: 320 }}
            />
          </Row>
          <Row>
            <ControlLabel>Network</ControlLabel>
            <Select
              options={NETWORK_OPTIONS}
              value={network}
              aria-label="Deployment network"
              onChange={(opt) => setNetwork(opt.value as Network)}
              width={240}
            />
            <ControlLabel>Wallet</ControlLabel>
            <Select
              options={[
                { value: "A", label: "Wallet A (bert)" },
                { value: "B", label: "Wallet B (ernie)" },
              ]}
              value={wallet}
              aria-label="Deployment wallet"
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
              <ControlLabel htmlFor="confirm-mainnet">
                I confirm this is a mainnet origination. Server must also set
                <InlineCode> WTF_FACTORY_ALLOW_MAINNET=1</InlineCode>.
              </ControlLabel>
            </Row>
          ) : null}
          <Row>
            <UiButton
              uiVariant="primary"
              onClick={() => deployMutation.mutate()}
              disabled={
                deployMutation.isPending ||
                name.trim().length < 1 ||
                initialStorage.trim().length < 3 ||
                (network === "mainnet" && !confirmMainnet)
              }
            >
              {deployMutation.isPending ? "Deploying contract…" : "Deploy contract"}
            </UiButton>
            {deployMutation.isPending ? <Hourglass size={16} /> : null}
          </Row>
          {errorMsg ? (
            <UiNotice tone="danger">{errorMsg}</UiNotice>
          ) : null}
          {deployOutput ? (
            <Pre>{JSON.stringify(deployOutput, null, 2)}</Pre>
          ) : null}
        </UiPanel>

        <Separator />

        <UiPanel title="Deployed WTF contracts" compact>
          {contractsQuery.isLoading ? (
            <Row>
              <Hourglass size={16} /> <Muted>Loading…</Muted>
            </Row>
          ) : (
            <TableWrap>
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
                        <InlineCode>{row.address}</InlineCode>
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
                        <UiButton
                          compact
                          onClick={() => retireMutation.mutate(row.id)}
                          disabled={retireMutation.isPending}
                        >
                          Retire contract
                        </UiButton>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {contractsQuery.data?.contracts.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <UiEmptyState title="No deployed contracts">
                        Deploy a contract from this page to create the first factory registry row.
                      </UiEmptyState>
                    </td>
                  </tr>
                ) : null}
              </tbody>
              </Table>
            </TableWrap>
          )}
        </UiPanel>
      </>
      )}

      {activeTab === "wizard" && (
        <div style={{ padding: "8px 0" }}>
          <Fa2WizardPanel />
        </div>
      )}
      </Stack>
    </AppWindow>
  );
}

export default ContractFactory;
