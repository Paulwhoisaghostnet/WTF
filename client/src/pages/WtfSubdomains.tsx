import type { ReactElement } from "react";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { CommitRevealPanel } from "../features/wtf-subdomains/CommitRevealPanel";
import { DomainChatPanel } from "../features/wtf-subdomains/DomainChatPanel";
import { HackTezPanel } from "../features/wtf-subdomains/HackTezPanel";
import { RegistrarPanel } from "../features/wtf-subdomains/RegistrarPanel";
import { UserSitesPanel } from "../features/wtf-subdomains/UserSitesPanel";

const Shell = styled.main`
  min-height: 100%;
  min-width: 0;
`;

const Inner = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  max-width: 980px;
  min-width: 0;
`;

export function WtfSubdomains(): ReactElement {
  return (
    <AppWindow title="WTF Domains">
      <Shell>
        <Inner>
          <UserSitesPanel />
          <CommitRevealPanel />
          <HackTezPanel />
          <RegistrarPanel />
          <DomainChatPanel />
        </Inner>
      </Shell>
    </AppWindow>
  );
}
