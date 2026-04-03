import styled from "styled-components";
import { Button, GroupBox, Separator } from "react95";
import { useLocation } from "wouter";

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
    <Container>
      <Title>WTF GAMESHOW</Title>
      <Subtitle>What The Fork is a Gameshow?</Subtitle>

      <InfoBox label="About">
        <p>
          A survival-based challenge game on Tezos. Contestants compete in
          unpredictable challenges, earn WTF tokens, and collect exclusive
          survival NFTs.
        </p>
        <Separator />
        <p>
          <strong>Seasons & Rounds:</strong> Each season brings new
          contestants, challenges, and rewards. Survive rounds to advance.
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
  );
}
