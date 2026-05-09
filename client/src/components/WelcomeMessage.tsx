import { useEffect, useState } from "react";
import styled from "styled-components";
import { Button, Window, WindowContent, WindowHeader } from "react95";
import { useAuth } from "../lib/auth-context";

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
  width: min(500px, calc(100vw - 32px));
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
`;

const ErrorText = styled.p`
  margin: 0;
  color: #b00000;
  font-size: 12px;
`;

export function WelcomeMessage() {
  const { user, completeWelcome, completeGmWelcome } = useAuth();
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

  const displayName = user.displayName || user.username;

  const acknowledge = async () => {
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
                ? `Welcome to WTF OS, ${displayName}`
                : `GM, ${displayName}`}
            </Title>
            {needsWtfWelcome && (
              <p>
                Your account is ready. Make yourself at home in the desktop,
                open your apps, and start making trouble in the official
                operating system of WTF.
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
              <Button type="button" onClick={acknowledge} disabled={saving}>
                {saving ? "Saving..." : "Enter WTF OS"}
              </Button>
            </Footer>
          </Body>
        </WindowContent>
      </WelcomeWindow>
    </Backdrop>
  );
}
