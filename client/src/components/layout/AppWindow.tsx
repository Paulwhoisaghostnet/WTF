import { type ReactNode } from "react";
import styled from "styled-components";
import {
  Window,
  WindowHeader,
  WindowContent,
  ScrollView,
} from "react95";

const FullWindow = styled(Window)`
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
`;

const StyledHeader = styled(WindowHeader)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
`;

const StyledContent = styled(WindowContent)`
  flex: 1;
  overflow: auto;
  padding: 8px;
`;

interface AppWindowProps {
  title: string;
  children: ReactNode;
  toolbar?: ReactNode;
}

export function AppWindow({ title, children, toolbar }: AppWindowProps) {
  return (
    <FullWindow>
      <StyledHeader>
        <span>{title}</span>
      </StyledHeader>
      {toolbar}
      <StyledContent>
        <ScrollView style={{ height: "100%" }}>{children}</ScrollView>
      </StyledContent>
    </FullWindow>
  );
}
