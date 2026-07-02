import styled from "styled-components";

const gammaMarketplaceScope = `[data-marketplace-presentation-host="gamma"]`;

export const MarketplaceSurface = styled.div`
  &[data-marketplace-presentation-host="gamma"] {
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  &[data-marketplace-presentation-host="gamma"] [data-marketplace-region] {
    background-image: none !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  &[data-marketplace-presentation-host="gamma"] p,
  &[data-marketplace-presentation-host="gamma"] label,
  &[data-marketplace-presentation-host="gamma"] span {
    letter-spacing: 0;
  }

  &[data-marketplace-presentation-host="gamma"] a {
    color: #00d2ff;
  }

  &[data-marketplace-presentation-host="gamma"] [data-marketplace-region="tabs"] {
    border-bottom: 1px solid rgba(242, 234, 217, 0.16);
    margin-bottom: 12px;
    padding-bottom: 8px;
  }

  &[data-marketplace-presentation-host="gamma"] [data-marketplace-region="tabs"] button {
    background: #070706 !important;
    border: 1px solid rgba(242, 234, 217, 0.18) !important;
    border-radius: 4px !important;
    box-shadow: none !important;
    color: #f2ead9 !important;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif !important;
    min-height: 32px;
  }

  &[data-marketplace-presentation-host="gamma"] [data-marketplace-region="tabs"] button[aria-selected="true"] {
    border-color: rgba(0, 210, 255, 0.7) !important;
    color: #00d2ff !important;
  }
`;

export const MarketplaceSummaryBar = styled.div.attrs<{ "data-marketplace-region"?: string }>({
  "data-marketplace-region": "summary-bar",
})`
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;

  ${gammaMarketplaceScope} & {
    align-items: center;
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    color: #f2ead9;
    gap: 12px;
    padding: 10px 12px;
  }
`;

export const MarketplaceErrorLine = styled.p`
  color: red;
  font-size: 12px;
  margin-top: 10px;

  ${gammaMarketplaceScope} & {
    color: #ff6b5f;
    font-size: 12px;
    line-height: 1.45;
  }
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;

  ${gammaMarketplaceScope} & {
    gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
`;

export const TradeBoardSurface = styled.div.attrs<{ "data-marketplace-region"?: string }>({
  "data-marketplace-region": "trade-board-surface",
})`
  display: flex;
  flex-direction: column;
  gap: 12px;

  ${gammaMarketplaceScope} & {
    color: #f2ead9;
  }
`;

export const TradeBoardToolbar = styled.div.attrs<{ "data-marketplace-region"?: string }>({
  "data-marketplace-region": "trade-board-toolbar",
})`
  align-items: center;
  display: flex;
  gap: 8px;
  margin-bottom: 12px;

  ${gammaMarketplaceScope} & {
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    flex-wrap: wrap;
    margin-bottom: 0;
    padding: 8px;
  }

  ${gammaMarketplaceScope} & button {
    background: #070706 !important;
    border: 1px solid rgba(242, 234, 217, 0.2) !important;
    border-radius: 4px !important;
    box-shadow: none !important;
    color: #f2ead9 !important;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif !important;
    min-height: 32px;
  }

  ${gammaMarketplaceScope} & [data-marketplace-mode-active="true"] button {
    border-color: rgba(0, 210, 255, 0.72) !important;
    color: #00d2ff !important;
  }

  ${gammaMarketplaceScope} & input {
    background: #070706 !important;
    border: 1px solid rgba(242, 234, 217, 0.2) !important;
    border-radius: 4px !important;
    box-shadow: none !important;
    color: #f2ead9 !important;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif !important;
    min-height: 32px;
  }
`;

export const TradeBoardModeButton = styled.span.attrs<{ "data-marketplace-region"?: string }>({
  "data-marketplace-region": "trade-board-mode-button",
})`
  display: inline-flex;
`;

export const TradeBoardSearchWrap = styled.div.attrs<{ "data-marketplace-region"?: string }>({
  "data-marketplace-region": "trade-board-search",
})`
  flex: 1 1 260px;
  min-width: 220px;
`;

export const TradeBoardBarterSurface = styled.div.attrs<{ "data-marketplace-region"?: string }>({
  "data-marketplace-region": "trade-board-barter",
})`
  ${gammaMarketplaceScope} & {
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    padding: 10px;
  }
`;

export const TradeBoardGridWrap = styled.div.attrs<{ "data-marketplace-region"?: string }>({
  "data-marketplace-region": "trade-board-grid",
})`
  ${gammaMarketplaceScope} & {
    min-width: 0;
  }
`;

export const TradeBoardLoadingState = styled.div.attrs<{ "data-marketplace-region"?: string }>({
  "data-marketplace-region": "trade-board-loading",
})`
  padding: 16px;

  ${gammaMarketplaceScope} & {
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
  }
`;

export const TradeBoardEmptyState = styled.p.attrs<{ "data-marketplace-region"?: string }>({
  "data-marketplace-region": "trade-board-empty",
})`
  ${gammaMarketplaceScope} & {
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    color: rgba(242, 234, 217, 0.72);
    font-size: 13px;
    line-height: 1.45;
    margin: 0;
    padding: 12px;
  }
`;

export const ListingCard = styled.div.attrs<{ "data-marketplace-region"?: string }>({
  "data-marketplace-region": "listing-card",
})`
  background: #c0c0c0;
  border: 2px outset #dfdfdf;
  box-shadow: 1px 1px 0 #000;
  display: flex;
  flex-direction: column;
  cursor: pointer;

  &:hover {
    box-shadow: 1px 1px 0 #000080;
  }

  ${gammaMarketplaceScope} & {
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.2);
    border-radius: 6px;
    box-shadow: none;
    color: #f2ead9;
    min-width: 0;
    overflow: hidden;
  }

  ${gammaMarketplaceScope} &:hover {
    border-color: rgba(0, 210, 255, 0.6);
    box-shadow: none;
  }
`;

export const ListingTitleBar = styled.div.attrs<{ "data-marketplace-region"?: string }>({
  "data-marketplace-region": "listing-titlebar",
})`
  background: linear-gradient(90deg, #000080, #1084d0);
  color: #fff;
  font-weight: bold;
  font-size: 11px;
  padding: 3px 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 20px;

  ${gammaMarketplaceScope} & {
    background: #070706;
    background-image: none;
    border-bottom: 1px solid rgba(0, 210, 255, 0.32);
    color: #00d2ff;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 12px;
    min-height: 28px;
    padding: 6px 8px;
    text-transform: uppercase;
  }
`;

export const TokenImage = styled.div.attrs<{ "data-marketplace-region"?: string }>({
  "data-marketplace-region": "token-image",
})`
  width: 100%;
  min-height: 160px;
  max-height: 220px;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  border-top: 1px solid #808080;
  border-bottom: 1px solid #808080;

  img {
    max-width: 100%;
    max-height: 220px;
    object-fit: contain;
  }

  ${gammaMarketplaceScope} & {
    background: #070706;
    border-bottom: 1px solid rgba(242, 234, 217, 0.16);
    border-top: 0;
    min-height: 180px;
  }

  ${gammaMarketplaceScope} & span {
    color: rgba(242, 234, 217, 0.56) !important;
  }
`;

export const ListingBody = styled.div.attrs<{ "data-marketplace-region"?: string }>({
  "data-marketplace-region": "listing-body",
})`
  padding: 6px 8px;
  font-size: 11px;

  ${gammaMarketplaceScope} & {
    color: #f2ead9;
    font-size: 12px;
    line-height: 1.45;
    padding: 10px 12px;
  }

  ${gammaMarketplaceScope} & p {
    color: rgba(242, 234, 217, 0.72);
    line-height: 1.45;
    margin: 6px 0;
  }
`;

export const ListingActions = styled.div.attrs<{ "data-marketplace-region"?: string }>({
  "data-marketplace-region": "listing-actions",
})`
  display: flex;
  gap: 4px;
  padding: 4px 8px 6px;
  flex-wrap: wrap;
  align-items: center;
  border-top: 1px solid #808080;
  margin-top: auto;

  ${gammaMarketplaceScope} & {
    border-top: 1px solid rgba(242, 234, 217, 0.16);
    gap: 8px;
    padding: 10px 12px 12px;
  }

  ${gammaMarketplaceScope} & button,
  ${gammaMarketplaceScope} & input {
    background: #070706 !important;
    border: 1px solid rgba(242, 234, 217, 0.2) !important;
    border-radius: 4px !important;
    box-shadow: none !important;
    color: #f2ead9 !important;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif !important;
    min-height: 30px;
  }

  ${gammaMarketplaceScope} & button:hover {
    border-color: rgba(0, 210, 255, 0.64) !important;
    color: #00d2ff !important;
  }
`;

export const Price = styled.div`
  font-size: 18px;
  font-weight: bold;
  color: #000080;

  ${gammaMarketplaceScope} & {
    color: #00d2ff;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-size: 18px;
    letter-spacing: 0;
  }
`;

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;

  ${gammaMarketplaceScope} & {
    color: #f2ead9;
    gap: 6px;
  }

  ${gammaMarketplaceScope} & label {
    color: rgba(242, 234, 217, 0.76);
    font-size: 12px;
  }
`;

export const SelectedTokenPreview = styled.div.attrs<{ "data-marketplace-region"?: string }>({
  "data-marketplace-region": "selected-token-preview",
})`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: #dfdfdf;
  border: 2px inset #808080;
  margin-bottom: 8px;

  img {
    width: 64px;
    height: 64px;
    object-fit: contain;
    border: 1px solid #808080;
  }

  ${gammaMarketplaceScope} & {
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    box-shadow: none;
    color: #f2ead9;
    padding: 10px;
  }

  ${gammaMarketplaceScope} & img {
    border: 1px solid rgba(242, 234, 217, 0.2);
    border-radius: 4px;
  }
`;
