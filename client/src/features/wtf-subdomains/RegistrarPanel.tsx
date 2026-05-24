import { type ReactElement } from "react";
import {
  GroupBox,
  Hourglass,
  Table,
  TableBody,
  TableDataCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from "react95";
import styled from "styled-components";
import { useMyWtfSubdomainGrants, useWtfDomainsRegistrarStatus } from "./hooks";

const Stack = styled.div`
  display: grid;
  gap: 12px;
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
  font-size: 12px;
`;

export function RegistrarPanel(): ReactElement {
  const grantsQuery = useMyWtfSubdomainGrants();
  const registrarQuery = useWtfDomainsRegistrarStatus();
  const status = registrarQuery.data;
  const config = status?.config;
  const missingEnv = Array.isArray(config?.missingEnv) ? config.missingEnv : [];
  const grants = Array.isArray(grantsQuery.data) ? grantsQuery.data : [];

  return (
    <Stack>
      <GroupBox label="Registrar Status">
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
            {missingEnv.length ? (
              <p style={{ color: "#8a4b00", margin: 0 }}>
                Missing: {missingEnv.join(", ")}
              </p>
            ) : null}
            {status.error ? (
              <p style={{ color: "#a00", margin: 0 }}>{status.error}</p>
            ) : null}
          </Stack>
        )}
      </GroupBox>

      <GroupBox label="Admin Grants">
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
              {grants.map((grant) => (
                <TableRow key={grant.id}>
                  <TableDataCell>{grant.fullName}</TableDataCell>
                  <TableDataCell>{grant.status}</TableDataCell>
                  <TableDataCell>{grant.walletAddress || "---"}</TableDataCell>
                </TableRow>
              ))}
              {grants.length === 0 ? (
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
