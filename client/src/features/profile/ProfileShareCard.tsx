import { Button, GroupBox } from "react95";
import styled from "styled-components";

const Card = styled.div`
  width: 320px;
  padding: 12px;
  background: linear-gradient(135deg, #000080, #008080);
  color: #fff;
  border: 2px inset #c0c0c0;
  font-family: Tahoma, sans-serif;
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
    const grad = ctx.createLinearGradient(0, 0, 640, 360);
    grad.addColorStop(0, "#000080");
    grad.addColorStop(1, "#008080");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 36px Tahoma";
    ctx.fillText(title, 32, 80);
    ctx.font = "20px Tahoma";
    ctx.fillText(`@${username}`, 32, 120);
    if (tezosAddress) ctx.fillText(tezosAddress.slice(0, 20) + "…", 32, 160);
    ctx.font = "16px Tahoma";
    ctx.fillText("WTF Gameshow — skllzrmy share card", 32, 320);
    const a = document.createElement("a");
    a.download = `${username}-wtf-card.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }

  return (
    <GroupBox label="Share Card">
      <Card>
        <div style={{ fontSize: 16, fontWeight: "bold" }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.9 }}>@{username}</div>
        {tezosAddress ? (
          <div style={{ fontSize: 10, marginTop: 6, fontFamily: "monospace" }}>{tezosAddress}</div>
        ) : null}
      </Card>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <Button size="sm" onClick={copyLink}>Copy profile link</Button>
        <Button size="sm" onClick={downloadCard}>Download card</Button>
      </div>
    </GroupBox>
  );
}
