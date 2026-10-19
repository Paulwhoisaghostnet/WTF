import styled from "styled-components";

export const ProductionPanel = styled.section`
  display: grid; gap: 16px; min-width: 0; line-height: 1.5;
  h2, h3, h4, p { margin: 0; }
  label { display: grid; gap: 4px; min-width: 0; }
  input, textarea, select { box-sizing: border-box; max-width: 100%; padding: 8px; font: inherit; color: inherit; background: var(--wtf-app-surface, #fff); }
  textarea { width: 100%; min-height: 90px; resize: vertical; }
  button { min-height: var(--wtf-control-min-height, 34px); white-space: normal; }
  :focus-visible { outline: 2px solid var(--wtf-app-info, #175cd3); outline-offset: 2px; }
  small { line-height: 1.5; }
  details { min-width: 0; }
  summary { cursor: pointer; font-weight: 700; padding: 6px 0; }
`;
export const ProductionActions = styled.div`display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-width: 0;`;
export const ProductionStack = styled.div`display: grid; gap: 12px; min-width: 0;`;
export const ProductionColumns = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 16px; min-width: 0;`;
export const ProductionCard = styled.div`padding: 12px; border: 1px solid var(--wtf-app-border, #808080); min-width: 0; overflow-wrap: anywhere;`;

export function downloadProductionFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}
