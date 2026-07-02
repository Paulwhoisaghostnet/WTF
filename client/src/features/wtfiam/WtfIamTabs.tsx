import styled from "styled-components";
import { WTFIAM_CATEGORIES } from "./catalog";
import type { WtfIamCategoryKey } from "./types";

const gammaWtfIamScope = `[data-wtfiam-presentation-host="gamma"]`;

const TabRail = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 6px;

  ${gammaWtfIamScope} & {
    gap: 8px;
  }

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

  ${gammaWtfIamScope} & {
    background: ${(p) => (p.$active ? "rgba(0, 210, 255, 0.08)" : "#11110f")};
    background-image: none;
    border: 1px solid ${(p) => (p.$active ? "rgba(0, 210, 255, 0.72)" : "rgba(242, 234, 217, 0.16)")};
    border-radius: 6px;
    box-shadow: none;
    color: #f2ead9;
    min-height: 56px;
  }

  ${gammaWtfIamScope} &:hover {
    border-color: rgba(0, 210, 255, 0.52);
  }
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

  ${gammaWtfIamScope} & {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(0, 210, 255, 0.5);
    border-radius: 4px;
    box-shadow: none;
    color: #00d2ff;
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
  }
`;

const TabText = styled.span`
  min-width: 0;
  font-weight: 700;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.15;

  ${gammaWtfIamScope} & {
    font-size: 13px;
    line-height: 1.2;
  }
`;

type Props = {
  activeKey: WtfIamCategoryKey;
  onChange: (key: WtfIamCategoryKey) => void;
};

export function WtfIamTabs({ activeKey, onChange }: Props) {
  return (
    <TabRail role="tablist" aria-label="WTF In-App Marketplace categories" data-wtfiam-region="tabs">
      {WTFIAM_CATEGORIES.map((category) => (
        <TabButton
          key={category.key}
          role="tab"
          type="button"
          aria-selected={activeKey === category.key}
          data-wtfiam-category={category.key}
          data-wtfiam-region="tab-button"
          $active={activeKey === category.key}
          $accent={category.accent}
          $shadow={category.shadow}
          onClick={() => onChange(category.key)}
        >
          <TabMark $accent={category.accent} $shadow={category.shadow} data-wtfiam-region="tab-mark">
            {category.monogram}
          </TabMark>
          <TabText>{category.label}</TabText>
        </TabButton>
      ))}
    </TabRail>
  );
}
