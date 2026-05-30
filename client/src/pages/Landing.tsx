import styled from "styled-components";
import { Button, GroupBox, Separator } from "react95";
import { useLocation } from "wouter";
import { AuthScreenShell } from "../components/layout/AuthScreenShell";
import { WTFOS_GAMESHOW_NAME, WTFOS_PLATFORM_NAME } from "@shared/platform-branding";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 24px;
  text-align: center;
  padding: 20px;
`;

const Title = styled.h1`
  font-size: 48px;
  color: white;
  text-shadow: 3px 3px 0 #000080, -1px -1px 0 #000;
  letter-spacing: 4px;
  margin: 0;

  @media (max-width: 480px) {
    font-size: 32px;
    letter-spacing: 2px;
  }
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: #c0ffc0;
  margin: 0;
`;

const InfoBox = styled(GroupBox)`
  max-width: 500px;
  width: 100%;
  text-align: left;
`;

export function Landing() {
  const [, setLocation] = useLocation();

  return (
    <AuthScreenShell documentTitle={WTFOS_PLATFORM_NAME}>
      <Container>
        <Title>{WTFOS_PLATFORM_NAME.toUpperCase()}</Title>
        <Subtitle>Tezos-connected creator platform</Subtitle>

        <InfoBox label="About">
          <p>
            {WTFOS_PLATFORM_NAME} brings the {WTFOS_GAMESHOW_NAME}, arcade,
            social tools, media, marketplace, and wallet-aware profile system
            into one desktop OS.
          </p>
          <Separator />
          <p>
            <strong>Get started:</strong> Sign in or register to open the
            desktop, link your wallet, and launch apps from the start menu.
          </p>
        </InfoBox>

        <div style={{ display: "flex", gap: 8 }}>
          <Button size="lg" onClick={() => setLocation("/login")}>
            Log In
          </Button>
          <Button size="lg" onClick={() => setLocation("/register")}>
            Register
          </Button>
          <Button onClick={() => setLocation("/leaderboard")}>
            Leaderboard
          </Button>
        </div>
      </Container>
    </AuthScreenShell>
  );
}
