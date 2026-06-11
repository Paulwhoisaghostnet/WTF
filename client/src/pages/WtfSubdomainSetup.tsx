import type { ReactElement } from "react";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { SubdomainSetupApplet } from "../features/wtf-subdomains/SubdomainSetupApplet";

const Shell = styled.main`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  min-height: 100%;
  min-width: 0;
`;

export function WtfSubdomainSetup(): ReactElement {
  const [, setLocation] = useLocation();

  return (
    <AppWindow title="Subdomain Setup">
      <Shell>
        <SubdomainSetupApplet onOpenDomains={() => setLocation("/wtf-subdomains")} />
      </Shell>
    </AppWindow>
  );
}
