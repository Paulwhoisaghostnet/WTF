import { useEffect, useState } from "react";
import styled from "styled-components";
import { Button, Window, WindowContent, WindowHeader } from "react95";
import { useLocation } from "wouter";
import { useAuth } from "../lib/auth-context";

const WELCOME_DIARY_COMPOSE_KEY = "wtf.dearDiary.compose";

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

  const acknowledge = async (action: "close" | "profile" | "diary" = "close") => {
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
      if (action === "profile") {
        setLocation("/profile");
      } else if (action === "diary") {
        window.sessionStorage.setItem(WELCOME_DIARY_COMPOSE_KEY, "tony-danza");
        setLocation("/dear-diary");
      }
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
              <p>
                Your account is ready. Link your wallet and set up your
                profile when you are ready for a more customized WTF
                experience.
              </p>
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
                  <Button type="button" onClick={() => acknowledge("close")} disabled={saving}>
                    {saving ? "Saving..." : "Thanks, I got it"}
                  </Button>
                  <Button type="button" onClick={() => acknowledge("profile")} disabled={saving}>
                    View Profile
                  </Button>
                  <Button type="button" onClick={() => acknowledge("diary")} disabled={saving}>
                    You can't tell me what to do, you arent my real dad!
                  </Button>
                </>
              ) : (
                <Button type="button" onClick={() => acknowledge("close")} disabled={saving}>
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
