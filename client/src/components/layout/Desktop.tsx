import { type ReactNode } from "react";
import styled from "styled-components";
import { Taskbar } from "./Taskbar";

const DesktopContainer = styled.div`
  width: 100vw;
  height: 100vh;
  background: #008080;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
`;

const ContentArea = styled.div`
  flex: 1;
  padding: 4px;
  overflow: auto;
  display: flex;
  flex-direction: column;
`;

export function Desktop({ children }: { children: ReactNode }) {
  return (
    <DesktopContainer>
      <ContentArea>{children}</ContentArea>
      <Taskbar />
    </DesktopContainer>
  );
}
