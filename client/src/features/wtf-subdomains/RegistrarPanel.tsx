import { useState, type ReactElement } from "react";
import {
  Button,
  GroupBox,
  Hourglass,
  Table,
  TableBody,
  TableDataCell,
  TableHead,
  TableHeadCell,
  TableRow,
  TextInput,
} from "react95";
import styled from "styled-components";
import {
  useMyWtfSubdomainGrants,
  usePrepareWtfDomainRegistration,
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

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
  font-size: 12px;
`;

const Field = styled.label`
  display: grid;
  gap: 4px;
  font-size: 12px;
`;

export function RegistrarPanel(): ReactElement {
  const [label, setLabel] = useState("");
  const [targetAddress, setTargetAddress] = useState("");
  const grantsQuery = useMyWtfSubdomainGrants();
  const registrarQuery = useWtfDomainsRegistrarStatus();
  const prepareMutation = usePrepareWtfDomainRegistration();
  const status = registrarQuery.data;
  const config = status?.config;
  const plan = prepareMutation.data;
  const error = prepareMutation.error
    ? prepareMutation.error instanceof Error
      ? prepareMutation.error.message
      : String(prepareMutation.error)
    : "";

  return (
    <Stack>
      <GroupBox label="Registrar">
        {!status ? (
          <Hourglass size={28} />
        ) : (
          <Stack>
            <StatusGrid>
              <div>
                <strong>Mode</strong>
                <div>{config?.enabled ? "registrar" : "grant-only"}</div>
              </div>
              <div>
                <strong>Parent</strong>
                <div>{config?.parentDomain}</div>
              </div>
              <div>
                <strong>Network</strong>
                <div>{config?.network}</div>
              </div>
              <div>
                <strong>Contract</strong>
                <div>{config?.registrarAddress || "not set"}</div>
              </div>
            </StatusGrid>
            {config?.missingEnv.length ? (
              <p style={{ color: "#8a4b00", margin: 0 }}>
                Missing: {config.missingEnv.join(", ")}
              </p>
            ) : null}
            {status.error ? (
              <p style={{ color: "#a00", margin: 0 }}>{status.error}</p>
            ) : null}
          </Stack>
        )}
      </GroupBox>

      <GroupBox label="Prepare Registration">
        <Stack>
          <ActionRow>
            <Field>
              Label
              <TextInput
                value={label}
                placeholder="name"
                onChange={(event: any) =>
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
                onChange={(event: any) =>
                  setTargetAddress(String(event.target.value || ""))
                }
                style={{ width: 280 }}
              />
            </Field>
            <Button
              disabled={
                prepareMutation.isPending || !label.trim() || !targetAddress.trim()
              }
              onClick={() =>
                prepareMutation.mutate({
                  label: label.trim(),
                  targetAddress: targetAddress.trim(),
                })
              }
            >
              Prepare
            </Button>
          </ActionRow>
          {error ? <p style={{ color: "#a00", margin: 0 }}>{error}</p> : null}
          {plan ? (
            <div style={{ fontSize: 12 }}>
              <strong>{plan.fullName}</strong>
              <div>{plan.operations.map((op) => op.entrypoint).join(" -> ")}</div>
            </div>
          ) : null}
        </Stack>
      </GroupBox>

      <GroupBox label="My Grants">
        {!grantsQuery.data ? (
          <Hourglass size={28} />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>Name</TableHeadCell>
                <TableHeadCell>Status</TableHeadCell>
                <TableHeadCell>Wallet</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {grantsQuery.data.map((grant) => (
                <TableRow key={grant.id}>
                  <TableDataCell>{grant.fullName}</TableDataCell>
                  <TableDataCell>{grant.status}</TableDataCell>
                  <TableDataCell>{grant.walletAddress || "---"}</TableDataCell>
                </TableRow>
              ))}
              {grantsQuery.data.length === 0 ? (
                <TableRow>
                  <TableDataCell>No grants</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        )}
      </GroupBox>
    </Stack>
  );
}
