import styled from "styled-components";

type TezosIntelRegionAttrs = {
  "data-tezos-intel-region": string;
};

export function tezosIntelRegionAttrs(region: string): TezosIntelRegionAttrs {
  return { "data-tezos-intel-region": region };
}

export const PanelGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(260px, 360px) minmax(0, 1fr);
  gap: 12px;
  min-height: 100%;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

export const PanelStack = styled.div.attrs<TezosIntelRegionAttrs>(
  tezosIntelRegionAttrs("panel-stack")
)`
  display: grid;
  gap: 12px;
  align-content: start;
`;

export const Panel = styled.section.attrs<TezosIntelRegionAttrs>(
  tezosIntelRegionAttrs("panel")
)`
  border: 2px inset #dfdfdf;
  background: #c0c0c0;
  padding: 10px;
  display: grid;
  gap: 8px;
`;

export const PanelTitle = styled.h3.attrs<TezosIntelRegionAttrs>(
  tezosIntelRegionAttrs("panel-title")
)`
  margin: 0;
  padding: 4px 6px;
  background: #000080;
  color: #fff;
  font-size: 12px;
`;

export const MetricGrid = styled.div.attrs<TezosIntelRegionAttrs>(
  tezosIntelRegionAttrs("metric-grid")
)`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 6px;
`;

export const Metric = styled.div.attrs<TezosIntelRegionAttrs>(
  tezosIntelRegionAttrs("metric")
)`
  border: 2px inset #dfdfdf;
  background: #fff;
  padding: 6px;
  min-height: 46px;
`;

export const MetricLabel = styled.div.attrs<TezosIntelRegionAttrs>(
  tezosIntelRegionAttrs("metric-label")
)`
  font-size: 10px;
  color: #555;
`;

export const MetricValue = styled.div.attrs<TezosIntelRegionAttrs>(
  tezosIntelRegionAttrs("metric-value")
)`
  font-weight: 700;
  font-size: 16px;
`;

export const TextInput = styled.input.attrs<TezosIntelRegionAttrs>(
  tezosIntelRegionAttrs("input")
)`
  font-family: var(--wtf-ui-font);
  font-size: 12px;
  padding: 5px 6px;
  border: 2px inset #dfdfdf;
`;

export const TextArea = styled.textarea.attrs<TezosIntelRegionAttrs>(
  tezosIntelRegionAttrs("textarea")
)`
  font-family: var(--wtf-ui-font);
  font-size: 12px;
  padding: 5px 6px;
  border: 2px inset #dfdfdf;
  min-height: 74px;
  resize: vertical;
`;

export const Muted = styled.p.attrs<TezosIntelRegionAttrs>(
  tezosIntelRegionAttrs("muted")
)`
  margin: 0;
  font-size: 11px;
  color: #444;
`;

export function formatXtz(mutez: number) {
  return `${(mutez / 1_000_000).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} XTZ`;
}
