import { useEffect, type ReactNode } from "react";
import styled from "styled-components";
import {
  WTFOS_PLATFORM_DOMAIN,
  WTFOS_PLATFORM_NAME,
} from "@shared/platform-branding";

const Shell = styled.div`
  --wtf-auth-font: var(
    --wtf-ui-font,
    "MEK Mono", "MS Sans Serif", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif
  );
  --wtf-auth-title-font: var(--wtf-titlebar-font, var(--wtf-auth-font));

  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  font-family: var(--wtf-auth-font);
  font-size: var(--wtf-type-body, 14px);
  line-height: 1.45;
  font-synthesis: none;
  -webkit-font-smoothing: none;
  text-rendering: optimizeSpeed;

  &&,
  && * {
    font-family: var(--wtf-auth-font);
    font-synthesis: none;
    letter-spacing: 0;
  }

  && input,
  && textarea,
  && button,
  && select {
    font-family: var(--wtf-auth-font);
    font-size: inherit;
  }
`;

const PlatformHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 16px 10px;
  color: #ffffff;
  text-shadow: none;
  user-select: none;
`;

const PlatformName = styled.div`
  font-family: var(--wtf-auth-title-font);
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
`;

const PlatformDomain = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  color: #e7ffff;
  line-height: 1.2;
  white-space: nowrap;
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
