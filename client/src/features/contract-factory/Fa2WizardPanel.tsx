import { useState } from "react";
import { Button, GroupBox, Select, Separator, TextInput } from "react95";
import styled from "styled-components";

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

type Fa2Template = "fixed_supply" | "mintable" | "fixed_supply_pausable" | "mintable_pausable";

interface WizardState {
  template: Fa2Template;
  name: string;
  symbol: string;
  adminAddress: string;
  initialSupply: string;
  metadataUri: string;
}

const TEMPLATE_OPTIONS: { value: Fa2Template; label: string }[] = [
  { value: "fixed_supply", label: "Fixed Supply (all tokens at origination)" },
  { value: "mintable", label: "Mintable (admin-controlled mint/burn)" },
  { value: "fixed_supply_pausable", label: "Fixed Supply + Pausable" },
  { value: "mintable_pausable", label: "Mintable + Pausable" },
];

function buildStorageStub(state: WizardState): string {
  const name = state.name || "My Token";
  const symbol = state.symbol || "MTK";
  const admin = state.adminAddress || "tz1YourAdminAddress";
  const metaUri = state.metadataUri || "ipfs://Qm...";

  if (state.template === "fixed_supply" || state.template === "fixed_supply_pausable") {
    const supply = parseInt(state.initialSupply, 10) || 100;
    return JSON.stringify(
      {
        admin,
        metadata: { "": "<hex-encoded TZIP-16 URI>" },
        token_metadata: {
          0: {
            token_id: 0,
            token_info: {
              name: btoa(name),
              symbol: btoa(symbol),
              decimals: btoa("0"),
              "": "<hex-encoded " + metaUri + ">",
            },
          },
        },
        initial_ledger: { [`{"owner":"${admin}","token_id":0}`]: supply },
        total_supply: { 0: supply },
        ...(state.template === "fixed_supply_pausable" ? { paused: false } : {}),
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      admin,
      metadata: { "": "<hex-encoded TZIP-16 URI>" },
      ledger: {},
      token_metadata: {},
      operators: {},
      total_supply: {},
      minters: {},
      next_token_id: 0,
      ...(state.template === "mintable_pausable" ? { paused: false } : {}),
    },
    null,
    2
  );
}

export function Fa2WizardPanel() {
  const [state, setState] = useState<WizardState>({
    template: "fixed_supply",
    name: "",
    symbol: "",
    adminAddress: "",
    initialSupply: "100",
    metadataUri: "",
  });

  const [copied, setCopied] = useState(false);

  function set<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  const storageStub = buildStorageStub(state);

  function handleCopy() {
    navigator.clipboard.writeText(storageStub).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Stack>
      <GroupBox label="FA2 Template Wizard">
        <Muted>
          Choose a template, fill in the parameters, then copy the generated
          initial-storage stub into the Contract Factory deploy panel.
        </Muted>

        <Separator style={{ margin: "8px 0" }} />

        <Row>
          <span style={{ fontSize: 12, minWidth: 110 }}>Template:</span>
          <Select
            options={TEMPLATE_OPTIONS}
            value={state.template}
            onChange={(opt: any) => set("template", opt.value as Fa2Template)}
            style={{ minWidth: 280 }}
          />
        </Row>

        <Row>
          <span style={{ fontSize: 12, minWidth: 110 }}>Token name:</span>
          <TextInput
            value={state.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              set("name", e.target.value)
            }
            placeholder="e.g. Skullzarmy Pass"
            style={{ flex: 1 }}
          />
        </Row>

        <Row>
          <span style={{ fontSize: 12, minWidth: 110 }}>Symbol:</span>
          <TextInput
            value={state.symbol}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              set("symbol", e.target.value)
            }
            placeholder="e.g. SKULL"
            style={{ width: 120 }}
          />
        </Row>

        <Row>
          <span style={{ fontSize: 12, minWidth: 110 }}>Admin address:</span>
          <TextInput
            value={state.adminAddress}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              set("adminAddress", e.target.value)
            }
            placeholder="tz1…"
            style={{ flex: 1 }}
          />
        </Row>

        {state.template === "fixed_supply" && (
          <Row>
            <span style={{ fontSize: 12, minWidth: 110 }}>Initial supply:</span>
            <TextInput
              value={state.initialSupply}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                set("initialSupply", e.target.value)
              }
              placeholder="100"
              style={{ width: 100 }}
            />
          </Row>
        )}

        <Row>
          <span style={{ fontSize: 12, minWidth: 110 }}>Metadata URI:</span>
          <TextInput
            value={state.metadataUri}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              set("metadataUri", e.target.value)
            }
            placeholder="ipfs://Qm…"
            style={{ flex: 1 }}
          />
        </Row>

        <Separator style={{ margin: "8px 0" }} />

        <Muted>Generated initial-storage stub:</Muted>
        <Pre>{storageStub}</Pre>

        <Row style={{ marginTop: 6 }}>
          <Button onClick={handleCopy}>
            {copied ? "Copied!" : "Copy to clipboard"}
          </Button>
          <Muted style={{ marginLeft: 8 }}>
            Paste into "Initial storage (Michelson / SmartPy)" in the Deploy
            tab.
          </Muted>
        </Row>
      </GroupBox>

      <GroupBox label="Template descriptions">
        <p style={{ fontSize: 11 }}>
          <strong>Fixed Supply</strong> — All tokens are minted at origination.
          No further minting is possible. Suitable for commemorative tokens,
          survival trophies, and achievement badges.
        </p>
        <p style={{ fontSize: 11, marginTop: 6 }}>
          <strong>Mintable</strong> — The admin can create token types and mint
          new supply at any time. Additional minter addresses may be granted.
          Token holders can burn their own balance. Suitable for open editions
          and reward tokens.
        </p>
        <p style={{ fontSize: 11, marginTop: 6 }}>
          Both templates are fully TZIP-12 (FA2) and TZIP-21 compliant and
          compatible with Objkt, Teia, and WTF marketplace contracts.
        </p>
      </GroupBox>
    </Stack>
  );
}
