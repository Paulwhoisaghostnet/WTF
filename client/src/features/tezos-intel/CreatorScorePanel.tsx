import { useState } from "react";
import { Button } from "react95";

import { useCreatorScore } from "./hooks";
import {
  formatXtz,
  Metric,
  MetricGrid,
  MetricLabel,
  MetricValue,
  Muted,
  Panel,
  PanelTitle,
  TextInput,
} from "./IntelPanelChrome";

export function CreatorScorePanel() {
  const [draft, setDraft] = useState("");
  const [address, setAddress] = useState("");
  const { data, isFetching, error } = useCreatorScore(address);

  return (
    <Panel data-tezos-intel-panel="creator-score">
      <PanelTitle>Creator Market Signals</PanelTitle>
      <TextInput
        value={draft}
        data-tezos-intel-control="creator-input"
        onChange={(e) => setDraft(e.target.value)}
        placeholder="tz1 creator address"
      />
      <Button
        data-tezos-intel-control="analyze-button"
        onClick={() => setAddress(draft.trim())}
        disabled={!draft.trim()}
      >
        Analyze
      </Button>
      {isFetching && <Muted>Loading creator market signals...</Muted>}
      {error && <Muted>{(error as Error).message}</Muted>}
      {data && (
        <>
          <MetricGrid>
            <Metric>
              <MetricLabel>Market signal</MetricLabel>
              <MetricValue>{data.score}</MetricValue>
            </Metric>
            <Metric>
              <MetricLabel>Market band</MetricLabel>
              <MetricValue>{data.grade}</MetricValue>
            </Metric>
            <Metric>
              <MetricLabel>Tokens</MetricLabel>
              <MetricValue>{data.tokenCount}</MetricValue>
            </Metric>
            <Metric>
              <MetricLabel>Volume</MetricLabel>
              <MetricValue>{formatXtz(data.totalVolumeMutez)}</MetricValue>
            </Metric>
          </MetricGrid>
          <Muted>
            Sales {data.saleCount} · collectors {data.collectorCount} · active listings{" "}
            {data.activeListingCount}
          </Muted>
          <Muted>
            Market signals describe observed indexed activity, not creator
            quality.
          </Muted>
        </>
      )}
    </Panel>
  );
}
