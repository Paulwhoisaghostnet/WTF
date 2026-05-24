import { useEffect, useState, type ReactElement } from "react";
import {
  Button,
  GroupBox,
  Hourglass,
  TextInput,
} from "react95";
import styled from "styled-components";
import { useWallet } from "../../lib/wallet-context";
import {
  useCommitWtfDomain,
  usePrepareWtfDomainRegistration,
  useWalletRegistrarStatus,
  useWtfDomainsRegistrarStatus,
} from "./hooks";

const Stack = styled.div`
  display: grid;
  gap: 12px;
`;

const ActionRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
`;

const Field = styled.label`
  display: grid;
  gap: 4px;
  font-size: 12px;
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
  font-size: 12px;
`;

export function CommitRevealPanel(): ReactElement {
  const { address } = useWallet();
  const [label, setLabel] = useState("");
  const [targetAddress, setTargetAddress] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [committedAt, setCommittedAt] = useState<number | null>(null);

  const registrarQuery = useWtfDomainsRegistrarStatus();
  const walletStatusQuery = useWalletRegistrarStatus(address);
  const commitMutation = useCommitWtfDomain();
  const prepareMutation = usePrepareWtfDomainRegistration();

  const status = registrarQuery.data;
  const config = status?.config;
  const walletStatus = walletStatusQuery.data;
  const minAge =
    walletStatus?.registrar.minCommitAgeSec ??
    status?.storage?.minCommitAgeSec ??
    30;

  useEffect(() => {
    if (address && !targetAddress) {
      setTargetAddress(address);
    }
  }, [address, targetAddress]);

  useEffect(() => {
    if (!committedAt) {
      setCountdown(0);
      return;
    }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - committedAt) / 1000);
      setCountdown(Math.max(0, minAge - elapsed));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [committedAt, minAge]);

  const plan = commitMutation.data ?? prepareMutation.data;
  const error =
    commitMutation.error instanceof Error
      ? commitMutation.error.message
      : prepareMutation.error instanceof Error
        ? prepareMutation.error.message
        : "";

  const canRegister = countdown <= 0 && committedAt !== null && !!address;

  return (
    <Stack>
      <GroupBox label="Commit-Reveal (.wtf.tez)">
        {!status ? (
          <Hourglass size={28} />
        ) : (
          <Stack>
            <StatusGrid>
              <div>
                <strong>Parent</strong>
                <div>{config?.parentDomain}</div>
              </div>
              <div>
                <strong>Network</strong>
                <div>{config?.network}</div>
              </div>
              <div>
                <strong>Wait</strong>
                <div>{minAge}s after commit</div>
              </div>
              <div>
                <strong>Your .wtf.tez</strong>
                <div>
                  {walletStatus?.wtfDomains.length
                    ? walletStatus.wtfDomains.join(", ")
                    : "none"}
                </div>
              </div>
            </StatusGrid>
            {walletStatus?.hackDomains.length ? (
              <p style={{ margin: 0, fontSize: 12 }}>
                Also own: {walletStatus.hackDomains.join(", ")}
              </p>
            ) : null}
          </Stack>
        )}
      </GroupBox>

      <GroupBox label="Step 1 — Commit">
        <Stack>
          <ActionRow>
            <Field>
              Label
              <TextInput
                value={label}
                placeholder="name"
                onChange={(event: { target: { value: string } }) =>
                  setLabel(String(event.target.value || "").toLowerCase())
                }
                style={{ width: 160 }}
              />
            </Field>
            <Field>
              Target
              <TextInput
                value={targetAddress}
                placeholder="tz1..."
                onChange={(event: { target: { value: string } }) =>
                  setTargetAddress(String(event.target.value || ""))
                }
                style={{ width: 280 }}
              />
            </Field>
            <Button
              disabled={
                !address ||
                commitMutation.isPending ||
                !label.trim() ||
                !targetAddress.trim()
              }
              onClick={() => {
                commitMutation.mutate(
                  { label: label.trim(), targetAddress: targetAddress.trim() },
                  {
                    onSuccess: () => {
                      setCommittedAt(Date.now());
                    },
                  }
                );
              }}
            >
              Prepare commit
            </Button>
          </ActionRow>
          {plan ? (
            <div style={{ fontSize: 12 }}>
              <strong>{plan.fullName}</strong>
              <div>Salt: <code>{"salt" in plan ? String(plan.salt) : "—"}</code></div>
              <div>
                Sign <code>commit</code> with your wallet, then wait {minAge}s.
              </div>
            </div>
          ) : null}
        </Stack>
      </GroupBox>

      <GroupBox label="Step 2 — Register">
        <Stack>
          <p style={{ margin: 0, fontSize: 12 }}>
            {committedAt
              ? countdown > 0
                ? `Reveal available in ${countdown}s…`
                : "Ready to sign register with your wallet."
              : "Complete step 1 first."}
          </p>
          <Button
            disabled={
              !canRegister ||
              prepareMutation.isPending ||
              !label.trim() ||
              !targetAddress.trim()
            }
            onClick={() =>
              prepareMutation.mutate({
                label: label.trim(),
                targetAddress: targetAddress.trim(),
              })
            }
          >
            Prepare register
          </Button>
          {prepareMutation.data ? (
            <div style={{ fontSize: 12 }}>
              Operations:{" "}
              {prepareMutation.data.operations.map((op) => op.entrypoint).join(" → ")}
            </div>
          ) : null}
        </Stack>
      </GroupBox>

      {error ? <p style={{ color: "#a00", margin: 0 }}>{error}</p> : null}
    </Stack>
  );
}
