import { useMemo, useState } from "react";
import { Button } from "react95";

import { useCreatorCompare } from "./hooks";
import {
  formatXtz,
  Metric,
  MetricGrid,
  MetricLabel,
  MetricValue,
  Muted,
  Panel,
  PanelTitle,
  TextArea,
} from "./IntelPanelChrome";

export function CreatorComparePanel() {
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState<string[]>([]);
  const addresses = useMemo(
    () => draft.split(/[\n,]/).map((line) => line.trim()).filter(Boolean),
    [draft]
  );
  const { data, isFetching, error } = useCreatorCompare(submitted);
  const creators = data?.creators ?? [];

  return (
    <Panel>
      <PanelTitle>Creator Compare</PanelTitle>
      <TextArea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="One creator address per line"
      />
      <Button onClick={() => setSubmitted(addresses)} disabled={addresses.length === 0}>
        Compare
      </Button>
      {isFetching && <Muted>Comparing creators...</Muted>}
      {error && <Muted>{(error as Error).message}</Muted>}
      {creators.map((creator) => (
        <Metric key={creator.creatorAddress}>
          <MetricLabel>{creator.creatorAddress}</MetricLabel>
          <MetricGrid>
            <div>
              <MetricLabel>Score</MetricLabel>
              <MetricValue>{creator.score}</MetricValue>
            </div>
            <div>
              <MetricLabel>Volume</MetricLabel>
              <MetricValue>{formatXtz(creator.totalVolumeMutez)}</MetricValue>
            </div>
            <div>
              <MetricLabel>Sales</MetricLabel>
              <MetricValue>{creator.saleCount}</MetricValue>
            </div>
          </MetricGrid>
        </Metric>
      ))}
    </Panel>
  );
}
