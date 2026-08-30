import { useEffect, useState } from "react";
import styled from "styled-components";
import { Button, Window, WindowContent, WindowHeader } from "react95";
import { useLocation } from "wouter";
import { useAuth } from "../lib/auth-context";
import { CLASSIC_TASK_WAYFINDER } from "../features/onboarding/classic-task-wayfinder";

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(0, 0, 0, 0.28);
`;

const WelcomeWindow = styled(Window)`
  width: min(560px, calc(100vw - 32px));
`;

const Body = styled.div`
  display: grid;
  gap: 12px;
  font-size: 13px;
  line-height: 1.45;
`;

const Title = styled.div`
  font-size: 18px;
  font-weight: 700;
`;

const Intro = styled.p`
  margin: 0;
`;

const TaskPrompt = styled.p`
  margin: 0;
  font-weight: 700;
`;

const TaskGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 620px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const TaskButton = styled(Button)`
  && {
    min-height: 78px;
    height: auto;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 4px;
    padding: 8px 4px;
    text-align: center;
    white-space: normal;
  }
`;

const TaskIcon = styled.span`
  font-size: 21px;
  line-height: 1;
`;

const HelpText = styled.p`
  margin: 0;
  color: #333;
  font-size: 12px;
`;

const GmFrame = styled.figure`
  margin: 0;
  display: grid;
  gap: 7px;
`;

const GmImage = styled.img`
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: contain;
  background: #fff;
  border: 2px inset #fff;
`;

const Caption = styled.figcaption`
  font-size: 12px;
  line-height: 1.35;

  a {
    color: #000080;
  }
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;

  button {
    max-width: 100%;
    white-space: normal;
  }
`;

const ErrorText = styled.p`
  margin: 0;
  color: #b00000;
  font-size: 12px;
`;

export function WelcomeMessage() {
  const { user, completeWelcome, completeGmWelcome } = useAuth();
  const [, setLocation] = useLocation();
  const [hiddenForUserId, setHiddenForUserId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    setSaving(false);
    setHiddenForUserId(null);
  }, [user?.id]);

  if (!user || hiddenForUserId === user.id) return null;

  const needsWtfWelcome = user.welcomedToWtfOs !== true;
  const gmWelcome = user.gmWelcome?.shouldShow ? user.gmWelcome : null;

  if (!needsWtfWelcome && !gmWelcome) return null;

  const chosenUsername = user.username;

  const acknowledge = async (route?: string) => {
    setSaving(true);
    setError("");
    try {
      if (needsWtfWelcome) {
        await completeWelcome();
      }
      if (gmWelcome) {
        await completeGmWelcome();
      }
      setHiddenForUserId(user.id);
      if (route) setLocation(route);
    } catch (err: any) {
      setError(err.message || "Could not save welcome state");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Backdrop role="dialog" aria-modal="true" aria-labelledby="wtf-welcome-title">
      <WelcomeWindow>
        <WindowHeader>
          <span>Welcome Event</span>
        </WindowHeader>
        <WindowContent>
          <Body>
            <Title id="wtf-welcome-title">
              {needsWtfWelcome
                ? `Welcome to wtfOS, ${chosenUsername}`
                : `GM, ${chosenUsername}`}
            </Title>
            {needsWtfWelcome && (
              <>
                <Intro>
                  This is your community desktop. Choose what you want to do first;
                  every destination is also available from the Start menu.
                </Intro>
                <TaskPrompt>What do you want to do?</TaskPrompt>
                <TaskGrid aria-label="Choose your first task">
                  {CLASSIC_TASK_WAYFINDER.map((task) => (
                    <TaskButton
                      key={task.id}
                      type="button"
                      title={task.description}
                      onClick={() => acknowledge(task.route)}
                      disabled={saving}
                    >
                      <TaskIcon aria-hidden="true">{task.icon}</TaskIcon>
                      <strong>{task.label}</strong>
                    </TaskButton>
                  ))}
                </TaskGrid>
                <HelpText>
                  Not sure yet? Open Help &amp; Start Here at any time, or personalize
                  your account from Profile.
                </HelpText>
              </>
            )}
            {gmWelcome && (
              <GmFrame>
                <GmImage
                  src={gmWelcome.asset.imageUrl}
                  alt={`${gmWelcome.asset.name} by ${gmWelcome.authorName}`}
                  width={gmWelcome.asset.width ?? 720}
                  height={gmWelcome.asset.height ?? 720}
                />
                <Caption>
                  {gmWelcome.asset.name} from{" "}
                  <a
                    href={gmWelcome.collectionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {gmWelcome.projectName}
                  </a>{" "}
                  by {gmWelcome.authorName}
                </Caption>
              </GmFrame>
            )}
            {error && <ErrorText>{error}</ErrorText>}
            <Footer>
              {needsWtfWelcome ? (
                <>
                  <Button type="button" onClick={() => acknowledge()} disabled={saving}>
                    {saving ? "Saving..." : "Explore Desktop"}
                  </Button>
                  <Button type="button" onClick={() => acknowledge("/faq")} disabled={saving}>
                    Help &amp; Start Here
                  </Button>
                  <Button type="button" onClick={() => acknowledge("/profile")} disabled={saving}>
                    Profile
                  </Button>
                </>
              ) : (
                <Button type="button" onClick={() => acknowledge()} disabled={saving}>
                  {saving ? "Saving..." : "Thanks, I got it"}
                </Button>
              )}
            </Footer>
          </Body>
        </WindowContent>
      </WelcomeWindow>
    </Backdrop>
  );
}
