import styled from "styled-components";

export const MainLayout = styled.div`
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
    font-size: 11px;
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

export const Stack = styled.div`
  display: grid;
  gap: 8px;
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
  font-size: 12px;
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
  font-size: 12px;
`;

export const DialogOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: grid;
  place-items: center;
  z-index: 40;
  padding: 16px;
`;

export const DialogCard = styled.div`
  border: 2px outset #fff;
  background: #ececec;
  padding: 12px;
  width: min(420px, 100%);
  display: grid;
  gap: 8px;
`;
