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
    <Panel>
      <PanelTitle>Creator Score</PanelTitle>
      <TextInput
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="tz1 creator address"
      />
      <Button onClick={() => setAddress(draft.trim())} disabled={!draft.trim()}>
        Score
      </Button>
      {isFetching && <Muted>Loading creator score...</Muted>}
      {error && <Muted>{(error as Error).message}</Muted>}
      {data && (
        <>
          <MetricGrid>
            <Metric>
              <MetricLabel>Score</MetricLabel>
              <MetricValue>{data.score}</MetricValue>
            </Metric>
            <Metric>
              <MetricLabel>Grade</MetricLabel>
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
        </>
      )}
    </Panel>
  );
}
