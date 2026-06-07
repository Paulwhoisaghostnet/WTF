import styled from "styled-components";
import { WTFIAM_CATEGORIES } from "./catalog";
import type { WtfIamCategoryKey } from "./types";

const TabRail = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 6px;

  @media (max-width: 720px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const TabButton = styled.button<{ $active: boolean; $accent: string; $shadow: string }>`
  min-height: 52px;
  padding: 7px 8px;
  border: 2px solid ${(p) => (p.$active ? "#101010" : "#6c6c6c")};
  border-top-color: ${(p) => (p.$active ? "#ffffff" : "#dfdfdf")};
  border-left-color: ${(p) => (p.$active ? "#ffffff" : "#dfdfdf")};
  background:
    linear-gradient(90deg, ${(p) => p.$accent} 0 7px, transparent 7px),
    ${(p) => (p.$active ? "#f3f0d7" : "#c0c0c0")};
  color: #101010;
  text-align: left;
  box-shadow: ${(p) => (p.$active ? `inset 0 -3px 0 ${p.$shadow}` : "none")};
  display: grid;
  grid-template-columns: 42px 1fr;
  align-items: center;
  gap: 8px;
`;

const TabMark = styled.span<{ $accent: string; $shadow: string }>`
  width: 38px;
  height: 30px;
  border: 2px solid #101010;
  background: ${(p) => p.$accent};
  box-shadow: 2px 2px 0 ${(p) => p.$shadow};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 900;
`;

const TabText = styled.span`
  min-width: 0;
  font-weight: 700;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.15;
`;

type Props = {
  activeKey: WtfIamCategoryKey;
  onChange: (key: WtfIamCategoryKey) => void;
};

export function WtfIamTabs({ activeKey, onChange }: Props) {
  return (
    <TabRail role="tablist" aria-label="WTF In-App Marketplace categories">
      {WTFIAM_CATEGORIES.map((category) => (
        <TabButton
          key={category.key}
          role="tab"
          type="button"
          aria-selected={activeKey === category.key}
          $active={activeKey === category.key}
          $accent={category.accent}
          $shadow={category.shadow}
          onClick={() => onChange(category.key)}
        >
          <TabMark $accent={category.accent} $shadow={category.shadow}>
            {category.monogram}
          </TabMark>
          <TabText>{category.label}</TabText>
        </TabButton>
      ))}
    </TabRail>
  );
}
