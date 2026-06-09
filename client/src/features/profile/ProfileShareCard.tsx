import { GroupBox } from "react95";
import styled from "styled-components";
import { UiButton } from "../../components/wtfos-ui";
import { getCanvasFont } from "../appearance/get-canvas-font";

const SHARE_CARD_FONT = "var(--wtf-app-font)";
const SHARE_CARD_MONO = "var(--wtf-mono-font)";

const Card = styled.div`
  width: 320px;
  padding: 12px;
  background: var(--wtf-app-surface-raised, #ffffff);
  color: var(--wtf-app-text, #111111);
  border: 2px inset #c0c0c0;
  font-family: ${SHARE_CARD_FONT};
`;

type Props = {
  username: string;
  displayName?: string | null;
  tezosAddress?: string | null;
};

export function ProfileShareCard({ username, displayName, tezosAddress }: Props) {
  const title = displayName || username;

  function copyLink() {
    const url = `${window.location.origin}/user/${encodeURIComponent(username)}`;
    void navigator.clipboard.writeText(url);
  }

  function downloadCard() {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#f7f7f7";
    ctx.fillRect(0, 0, 640, 360);
    ctx.strokeStyle = "#008080";
    ctx.lineWidth = 8;
    ctx.strokeRect(16, 16, 608, 328);
    ctx.fillStyle = "#111";
    ctx.font = getCanvasFont("display", 36, { weight: "bold" });
    ctx.fillText(title, 32, 80);
    ctx.font = getCanvasFont("mono", 20);
    ctx.fillText(`@${username}`, 32, 120);
    if (tezosAddress) ctx.fillText(tezosAddress.slice(0, 20) + "…", 32, 160);
    ctx.font = getCanvasFont("mono", 16);
    ctx.fillText("wtfOS / skllzrmy share card", 32, 320);
    const a = document.createElement("a");
    a.download = `${username}-wtf-card.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }

  return (
    <GroupBox label="Share Card">
      <Card>
        <div style={{ fontSize: 16, fontWeight: "bold" }}>{title}</div>
        <div style={{ fontSize: "var(--wtf-type-caption, 13px)", opacity: 0.9 }}>@{username}</div>
        {tezosAddress ? (
          <div
            style={{
              fontSize: "var(--wtf-type-caption, 13px)",
              marginTop: 6,
              fontFamily: SHARE_CARD_MONO,
              overflowWrap: "anywhere",
            }}
          >
            {tezosAddress}
          </div>
        ) : null}
      </Card>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <UiButton size="sm" onClick={copyLink}>Copy profile link</UiButton>
        <UiButton size="sm" onClick={downloadCard}>Download card</UiButton>
      </div>
    </GroupBox>
  );
}
