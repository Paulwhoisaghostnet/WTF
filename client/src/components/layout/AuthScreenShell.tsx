import { useEffect, type ReactNode } from "react";
import styled from "styled-components";
import {
  WTFOS_PLATFORM_DOMAIN,
  WTFOS_PLATFORM_NAME,
} from "@shared/platform-branding";

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
`;

const PlatformHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 16px 10px;
  color: #ffffff;
  text-shadow: 1px 1px 0 #000080;
  user-select: none;
`;

const PlatformName = styled.div`
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 3px;
`;

const PlatformDomain = styled.div`
  font-size: 12px;
  opacity: 0.82;
  letter-spacing: 0.4px;
`;

const Body = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
`;

type AuthScreenShellProps = {
  children: ReactNode;
  documentTitle: string;
};

export function AuthScreenShell({ children, documentTitle }: AuthScreenShellProps) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = documentTitle;
    return () => {
      document.title = previousTitle;
    };
  }, [documentTitle]);

  return (
    <Shell>
      <PlatformHeader aria-label={`${WTFOS_PLATFORM_NAME} platform`}>
        <PlatformName>{WTFOS_PLATFORM_NAME}</PlatformName>
        <PlatformDomain>{WTFOS_PLATFORM_DOMAIN}</PlatformDomain>
      </PlatformHeader>
      <Body>{children}</Body>
    </Shell>
  );
}
