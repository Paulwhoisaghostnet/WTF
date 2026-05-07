import styled from "styled-components";

export const PanelGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(260px, 360px) minmax(0, 1fr);
  gap: 12px;
  min-height: 100%;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

export const PanelStack = styled.div`
  display: grid;
  gap: 12px;
  align-content: start;
`;

export const Panel = styled.section`
  border: 2px inset #dfdfdf;
  background: #c0c0c0;
  padding: 10px;
  display: grid;
  gap: 8px;
`;

export const PanelTitle = styled.h3`
  margin: 0;
  padding: 4px 6px;
  background: #000080;
  color: #fff;
  font-size: 12px;
`;

export const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 6px;
`;

export const Metric = styled.div`
  border: 2px inset #dfdfdf;
  background: #fff;
  padding: 6px;
  min-height: 46px;
`;

export const MetricLabel = styled.div`
  font-size: 10px;
  color: #555;
`;

export const MetricValue = styled.div`
  font-weight: 700;
  font-size: 16px;
`;

export const TextInput = styled.input`
  font-family: "MS Sans Serif", "Courier New", monospace;
  font-size: 12px;
  padding: 5px 6px;
  border: 2px inset #dfdfdf;
`;

export const TextArea = styled.textarea`
  font-family: "MS Sans Serif", "Courier New", monospace;
  font-size: 12px;
  padding: 5px 6px;
  border: 2px inset #dfdfdf;
  min-height: 74px;
  resize: vertical;
`;

export const Muted = styled.p`
  margin: 0;
  font-size: 11px;
  color: #444;
`;

export function formatXtz(mutez: number) {
  return `${(mutez / 1_000_000).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} XTZ`;
}
