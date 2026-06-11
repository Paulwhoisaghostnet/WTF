import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Globe2, KeyRound, RefreshCcw } from "lucide-react";
import styled from "styled-components";
import { UiButton } from "../../components/wtfos-ui";
import { useWallet } from "../../lib/wallet-context";
import {
  useClaimWtfUserSite,
  useCommitWtfDomain,
  useMyWtfSubdomainGrants,
  useMyWtfUserSite,
  usePrepareWtfDomainRegistration,
  useWalletRegistrarStatus,
  useWtfDomainsRegistrarStatus,
} from "./hooks";

const Shell = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  min-width: 0;
`;

const LaneGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--wtf-space-2, 8px);
  min-width: 0;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const Lane = styled.section`
  display: grid;
  align-content: start;
  gap: var(--wtf-space-2, 8px);
  min-width: 0;
  padding: var(--wtf-space-2, 8px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #fff);
  color: var(--wtf-app-text, #111);
`;

const LaneHeader = styled.div`
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  min-width: 0;
`;

const IconBox = styled.div`
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-control-bg, #fff);
`;

const Title = styled.h3`
  margin: 0;
  font-size: var(--wtf-type-body, 15px);
  line-height: 1.25;
`;

const Meta = styled.div`
  margin-top: 2px;
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--wtf-space-2, 8px);

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const StatusCell = styled.div`
  min-width: 0;
  padding: var(--wtf-space-2, 8px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface, #f4f4f4);
`;

const StatusLabel = styled.div`
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  line-height: 1.25;
`;

const StatusValue = styled.div`
  margin-top: 3px;
  font-size: var(--wtf-type-body, 15px);
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
`;

const Notice = styled.div<{ $tone?: "warning" | "danger" | "success" }>`
  padding: var(--wtf-space-2, 8px);
  border: 1px solid
    ${(p) =>
      p.$tone === "danger"
        ? "var(--wtf-app-danger, #b42318)"
        : p.$tone === "success"
          ? "var(--wtf-app-success, #176b38)"
          : "var(--wtf-app-warning, #8a4b00)"};
  background: ${(p) =>
    p.$tone === "danger"
      ? "#ffd8d8"
      : p.$tone === "success"
        ? "#dff5df"
        : "#fff8d6"};
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--wtf-space-2, 8px);
  min-width: 0;
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(120px, 0.55fr) minmax(180px, 1fr);
  gap: var(--wtf-space-2, 8px);

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.label`
  display: grid;
  gap: 4px;
  min-width: 0;
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  line-height: 1.25;
`;

const Input = styled.input`
  width: 100%;
  min-height: 32px;
  min-width: 0;
  box-sizing: border-box;
  padding: 5px 7px;
  color: var(--wtf-app-text, #111);
  background: var(--wtf-app-control-bg, #fff);
  border: 1px solid var(--wtf-app-control-border, #808080);
  font: inherit;
`;

const GrantList = styled.div`
  display: grid;
  gap: 6px;
`;

const GrantRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface, #f4f4f4);
`;

const Badge = styled.span<{ $ready?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 2px 7px;
  border: 1px solid ${(p) => (p.$ready ? "var(--wtf-app-success, #176b38)" : "var(--wtf-app-border, #808080)")};
  background: ${(p) => (p.$ready ? "#dff5df" : "var(--wtf-app-control-bg, #fff)")};
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
`;

const OperationBox = styled.div`
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: var(--wtf-space-2, 8px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface, #f4f4f4);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

const iconStyle = { width: 14, height: 14, verticalAlign: "text-bottom" };

function mutationError(...errors: unknown[]): string {
  for (const err of errors) {
    if (err instanceof Error) return err.message;
  }
  return "";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "not published";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "published";
  return date.toLocaleString();
}

function fullNameForLabel(label: string, parentDomain: string | undefined): string {
  const cleanLabel = label.trim().toLowerCase();
  const parent = parentDomain || "wtf.tez";
  return cleanLabel ? `${cleanLabel}.${parent}` : parent;
}

type SubdomainSetupAppletProps = {
  onOpenDomains?: () => void;
};

export function SubdomainSetupApplet({
  onOpenDomains,
}: SubdomainSetupAppletProps): ReactElement {
  const queryClient = useQueryClient();
  const { address, connect, isConnecting } = useWallet();
  const siteQuery = useMyWtfUserSite();
  const claimMutation = useClaimWtfUserSite();
  const grantsQuery = useMyWtfSubdomainGrants();
  const registrarQuery = useWtfDomainsRegistrarStatus();
  const walletStatusQuery = useWalletRegistrarStatus(address);
  const commitMutation = useCommitWtfDomain();
  const registerMutation = usePrepareWtfDomainRegistration();
  const [label, setLabel] = useState("");
  const [labelSeeded, setLabelSeeded] = useState(false);
  const [targetAddress, setTargetAddress] = useState("");
  const [targetSeeded, setTargetSeeded] = useState(false);
  const [committedAt, setCommittedAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);

  const siteState = siteQuery.data;
  const site = siteState?.site ?? null;
  const eligibility = siteState?.eligibility;
  const registrarStatus = registrarQuery.data;
  const registrarConfig = registrarStatus?.config;
  const grants = Array.isArray(grantsQuery.data) ? grantsQuery.data : [];
  const walletStatus = walletStatusQuery.data;
  const minCommitAgeSec =
    walletStatus?.registrar.minCommitAgeSec ??
    registrarStatus?.storage?.minCommitAgeSec ??
    30;
  const selectedTezName = fullNameForLabel(label, registrarConfig?.parentDomain);
  const wtfosHost = site?.host ?? eligibility?.host ?? "not available";
  const wtfosReady = Boolean(site && site.status !== "suspended");
  const registrarReady = Boolean(
    registrarConfig?.enabled &&
      registrarConfig.registrarAddress &&
      (registrarConfig.missingEnv?.length ?? 0) === 0
  );
  const canBuildTezPlan = Boolean(
    address &&
      registrarReady &&
      label.trim().length > 0 &&
      targetAddress.trim().length > 0
  );
  const canBuildRegisterPlan = canBuildTezPlan && committedAt !== null && countdown <= 0;

  const tezDomains = useMemo(
    () => [
      ...new Set([
        ...grants.map((grant) => grant.fullName),
        ...(walletStatus?.wtfDomains ?? []),
      ]),
    ],
    [grants, walletStatus?.wtfDomains]
  );

  useEffect(() => {
    if (address && !targetSeeded) {
      setTargetAddress(address);
      setTargetSeeded(true);
    }
  }, [address, targetSeeded]);

  useEffect(() => {
    const suggested = site?.label ?? eligibility?.label;
    if (!labelSeeded && suggested) {
      setLabel(suggested);
      setLabelSeeded(true);
    }
  }, [eligibility?.label, labelSeeded, site?.label]);

  useEffect(() => {
    if (!committedAt) {
      setCountdown(0);
      return;
    }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - committedAt) / 1000);
      setCountdown(Math.max(0, minCommitAgeSec - elapsed));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [committedAt, minCommitAgeSec]);

  function handleLabelChange(value: string) {
    setLabelSeeded(true);
    setLabel(value.toLowerCase());
    setCommittedAt(null);
  }

  function handleTargetChange(value: string) {
    setTargetSeeded(true);
    setTargetAddress(value);
    setCommittedAt(null);
  }

  function applySiteState(data: unknown) {
    queryClient.setQueryData(["wtf-user-sites", "my"], data);
  }

  const error = mutationError(
    siteQuery.error,
    claimMutation.error,
    grantsQuery.error,
    registrarQuery.error,
    walletStatusQuery.error,
    commitMutation.error,
    registerMutation.error
  );
  const missingEnv = registrarConfig?.missingEnv ?? [];

  return (
    <Shell data-testid="subdomain-setup-applet">
      <LaneGrid>
        <Lane aria-label="wtfos.me subdomain setup">
          <LaneHeader>
            <IconBox>
              <Globe2 size={17} aria-hidden />
            </IconBox>
            <div>
              <Title>wtfos.me host</Title>
              <Meta>{wtfosHost}</Meta>
            </div>
          </LaneHeader>

          <StatusGrid>
            <StatusCell>
              <StatusLabel>Status</StatusLabel>
              <StatusValue>{site?.status ?? (eligibility?.canClaim ? "ready to claim" : "unclaimed")}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Macaroni</StatusLabel>
              <StatusValue>{wtfosReady ? "ready" : "claim required"}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>DID proof</StatusLabel>
              <StatusValue>{site?.activeDidSource ?? eligibility?.didTarget?.source ?? "missing"}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Published</StatusLabel>
              <StatusValue>{formatDate(site?.publishedAt)}</StatusValue>
            </StatusCell>
          </StatusGrid>

          {eligibility?.reasons.length ? (
            <Notice $tone="warning">{eligibility.reasons.join(" ")}</Notice>
          ) : null}
          {site?.status === "suspended" ? (
            <Notice $tone="danger">{site.suspendedReason || "Site suspended."}</Notice>
          ) : null}
          {wtfosReady ? (
            <Notice $tone="success">Macaroni can publish drop pages under this host.</Notice>
          ) : null}

          <ActionRow>
            {!site ? (
              <UiButton
                uiVariant="primary"
                disabled={!eligibility?.canClaim || claimMutation.isPending}
                onClick={() =>
                  claimMutation.mutate(undefined, {
                    onSuccess: applySiteState,
                  })
                }
              >
                <CheckCircle2 style={iconStyle} aria-hidden />
                Claim {eligibility?.host ?? "wtfos.me host"}
              </UiButton>
            ) : (
              <UiButton
                onClick={() => window.open(site.url, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink style={iconStyle} aria-hidden />
                Open {site.host}
              </UiButton>
            )}
            {onOpenDomains ? (
              <UiButton onClick={onOpenDomains}>
                <RefreshCcw style={iconStyle} aria-hidden />
                Open WTF Domains
              </UiButton>
            ) : null}
          </ActionRow>
        </Lane>

        <Lane aria-label="wtf.tez subdomain setup">
          <LaneHeader>
            <IconBox>
              <KeyRound size={17} aria-hidden />
            </IconBox>
            <div>
              <Title>wtf.tez name</Title>
              <Meta>{selectedTezName}</Meta>
            </div>
          </LaneHeader>

          <StatusGrid>
            <StatusCell>
              <StatusLabel>Registrar</StatusLabel>
              <StatusValue>{registrarReady ? "ready" : registrarConfig?.enabled ? "needs config" : "grant-only"}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Wallet</StatusLabel>
              <StatusValue>{address ?? "not connected"}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Parent</StatusLabel>
              <StatusValue>{registrarConfig?.parentDomain ?? "wtf.tez"}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Network</StatusLabel>
              <StatusValue>{registrarConfig?.network ?? "unknown"}</StatusValue>
            </StatusCell>
          </StatusGrid>

          {tezDomains.length ? (
            <GrantList aria-label="Claimed wtf.tez names">
              {tezDomains.map((name) => {
                const grant = grants.find((candidate) => candidate.fullName === name);
                return (
                  <GrantRow key={name}>
                    <StatusValue>{name}</StatusValue>
                    <Badge $ready={grant?.status === "provisioned" || !grant}>
                      {grant?.status ?? "wallet"}
                    </Badge>
                  </GrantRow>
                );
              })}
            </GrantList>
          ) : null}

          {missingEnv.length ? (
            <Notice $tone="warning">Registrar missing: {missingEnv.join(", ")}</Notice>
          ) : null}
          {registrarStatus?.error ? (
            <Notice $tone="warning">{registrarStatus.error}</Notice>
          ) : null}

          <FieldGrid>
            <Field>
              wtf.tez label
              <Input
                aria-label="wtf.tez label"
                value={label}
                placeholder="name"
                onChange={(event) => handleLabelChange(event.currentTarget.value)}
              />
            </Field>
            <Field>
              Target wallet
              <Input
                aria-label="wtf.tez target wallet"
                value={targetAddress}
                placeholder="tz1..."
                onChange={(event) => handleTargetChange(event.currentTarget.value)}
              />
            </Field>
          </FieldGrid>

          <ActionRow>
            {!address ? (
              <UiButton
                disabled={isConnecting}
                onClick={() => {
                  void connect().catch(() => undefined);
                }}
              >
                Connect wallet
              </UiButton>
            ) : null}
            <UiButton
              uiVariant="primary"
              disabled={!canBuildTezPlan || commitMutation.isPending}
              onClick={() =>
                commitMutation.mutate(
                  { label: label.trim(), targetAddress: targetAddress.trim() },
                  { onSuccess: () => setCommittedAt(Date.now()) }
                )
              }
            >
              Build commit plan
            </UiButton>
            <UiButton
              disabled={!canBuildRegisterPlan || registerMutation.isPending}
              onClick={() =>
                registerMutation.mutate({
                  label: label.trim(),
                  targetAddress: targetAddress.trim(),
                })
              }
            >
              Build register plan
            </UiButton>
          </ActionRow>

          {commitMutation.data ? (
            <OperationBox>
              <strong>{commitMutation.data.fullName}</strong>
              <span>Salt: {commitMutation.data.salt}</span>
              <span>Commit entrypoint: {commitMutation.data.operations[0]?.entrypoint ?? "commit"}</span>
              <span>
                Register {countdown > 0 ? `available in ${countdown}s` : "plan can be built now"}
              </span>
            </OperationBox>
          ) : null}
          {registerMutation.data ? (
            <OperationBox>
              <strong>Register operations</strong>
              <span>{registerMutation.data.operations.map((op) => op.entrypoint).join(" -> ")}</span>
              <span>Target: {registerMutation.data.targetAddress}</span>
            </OperationBox>
          ) : null}
        </Lane>
      </LaneGrid>

      {error ? <Notice $tone="danger">{error}</Notice> : null}
    </Shell>
  );
}
