import styled from "styled-components";

const WTF_LIVE_CLASSIC_FONT_STACK = `"MS Sans Serif", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`;

export const MainLayout = styled.div`
  font-family: ${WTF_LIVE_CLASSIC_FONT_STACK};
  display: grid;
  grid-template-columns: minmax(168px, 210px) minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

export const Sidebar = styled.nav`
  border: 2px inset #fff;
  background: #ececec;
  padding: 8px;
  display: grid;
  gap: 6px;
`;

export const NavButton = styled.button<{ $active?: boolean }>`
  appearance: none;
  border: 2px ${({ $active }) => ($active ? "inset" : "outset")} #fff;
  background: ${({ $active }) => ($active ? "#b4002d" : "#f7f7f7")};
  color: ${({ $active }) => ($active ? "#fff" : "#050505")};
  padding: 6px 8px;
  text-align: left;
  cursor: pointer;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 6px;
  strong {
    display: block;
    font-size: 13px;
  }
  span {
    display: block;
    font-size: var(--wtf-type-caption, 13px);
    opacity: 0.8;
  }
`;

export const ContentPane = styled.div`
  min-width: 0;
  display: grid;
  gap: 8px;
`;

export const ContextBar = styled.div`
  border: 2px inset #fff;
  background: #fff8d6;
  padding: 6px 8px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
`;

export const Grid = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
`;

export const WideGrid = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(260px, 0.9fr) minmax(320px, 1.25fr);

  @media (max-width: 920px) {
    grid-template-columns: 1fr;
  }
`;

export const Stack = styled.div`
  display: grid;
  gap: 8px;
`;

export const SettingsField = styled.label`
  display: grid;
  gap: 4px;
  min-width: 0;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;

  input[type="file"] {
    min-width: 0;
    max-width: 100%;
  }
`;

export const InlineActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
`;

export const FeedList = styled.div`
  display: grid;
  gap: 6px;
  max-height: 280px;
  overflow: auto;
`;

export const FeedItem = styled.div`
  border: 2px inset #fff;
  background: #fff;
  padding: 8px;
  display: grid;
  gap: 4px;
  font-size: var(--wtf-type-caption, 13px);
`;

export const RoomDirectory = styled.div`
  display: grid;
  gap: 8px;
`;

export const RoomCard = styled.div`
  border: 2px inset #fff;
  background: #fff;
  padding: 8px;
  display: grid;
  gap: 7px;
  font-size: var(--wtf-type-caption, 13px);
`;

export const RoomMetaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
`;

export const RoomPresenceBadge = styled.span<{ $active?: boolean }>`
  width: max-content;
  border: 1px solid #222;
  background: ${({ $active }) => ($active ? "#041f12" : "#e8e8e8")};
  color: ${({ $active }) => ($active ? "#ccffd9" : "#333")};
  padding: 2px 5px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--wtf-type-caption, 13px);
  text-transform: uppercase;

  svg {
    flex: 0 0 auto;
  }
`;

export const RoomActivitySummary = styled.div<{ $active?: boolean }>`
  border: 2px inset #fff;
  background: ${({ $active }) => ($active ? "#e5ffe8" : "#f7f7f7")};
  padding: 7px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: var(--wtf-type-caption, 13px);

  strong {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  @media (max-width: 520px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

export const SplitActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

export const ActionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: 6px;

  button {
    min-width: 0;
  }
`;

export const ButtonLabel = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 0;
  white-space: nowrap;

  svg {
    flex: 0 0 auto;
  }
`;

export const ShareLink = styled.code`
  display: block;
  border: 2px inset #fff;
  background: #f7f7f7;
  padding: 5px;
  font-size: var(--wtf-type-caption, 13px);
  word-break: break-all;
`;

export const MutedText = styled.span`
  color: #4a4a4a;
  font-size: var(--wtf-type-caption, 13px);
`;

export const RoomBadge = styled.span<{ $closed?: boolean }>`
  width: max-content;
  border: 1px solid #222;
  background: ${({ $closed }) => ($closed ? "#ffd9d9" : "#dff7e8")};
  padding: 2px 5px;
  font-size: var(--wtf-type-caption, 13px);
  text-transform: uppercase;
`;

export const TextArea = styled.textarea`
  width: 100%;
  min-height: 72px;
  border: 2px inset #fff;
  padding: 6px;
  font: inherit;
  resize: vertical;
  box-sizing: border-box;
`;

export const NativeSelect = styled.select`
  width: 100%;
  border: 2px inset #fff;
  padding: 4px;
  font: inherit;
`;

export const QuoteCard = styled.div`
  border: 2px inset #fff;
  background: #f7f7f7;
  padding: 8px;
  font-size: var(--wtf-type-caption, 13px);
`;

export const DialogOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: grid;
  place-items: center;
  z-index: 40;
  padding: 16px;

  &[data-wtf-live-presentation-host="gamma"] {
    background: rgba(7, 7, 6, 0.82);
    color: #f2ead9;
  }
`;

export const DialogCard = styled.div`
  border: 2px outset #fff;
  background: #ececec;
  padding: 12px;
  width: min(420px, 100%);
  display: grid;
  gap: 8px;

  [data-wtf-live-presentation-host="gamma"] & {
    border: 1px solid rgba(242, 234, 217, 0.24);
    border-radius: 6px;
    background: #11110f;
    color: #f2ead9;
    box-shadow: none;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

    strong {
      color: #f2ead9;
      font-size: 15px;
      letter-spacing: 0;
    }
  }
`;
