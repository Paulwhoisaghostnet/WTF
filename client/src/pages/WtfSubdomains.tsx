import type { ReactElement } from "react";
import styled from "styled-components";
import { CommitRevealPanel } from "../features/wtf-subdomains/CommitRevealPanel";
import { DomainChatPanel } from "../features/wtf-subdomains/DomainChatPanel";
import { HackTezPanel } from "../features/wtf-subdomains/HackTezPanel";
import { RegistrarPanel } from "../features/wtf-subdomains/RegistrarPanel";
import { UserSitesPanel } from "../features/wtf-subdomains/UserSitesPanel";

const Shell = styled.main`
  min-height: 100%;
  padding: 16px;
  background: #c0c0c0;
`;

const Inner = styled.div`
  display: grid;
  gap: 12px;
  max-width: 980px;
`;

export function WtfSubdomains(): ReactElement {
  return (
    <Shell>
      <Inner>
        <UserSitesPanel />
        <CommitRevealPanel />
        <HackTezPanel />
        <RegistrarPanel />
        <DomainChatPanel />
      </Inner>
    </Shell>
  );
}
