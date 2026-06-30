import { useMarketPulse, useTezosIntelSources } from "./hooks";
import {
  formatXtz,
  Metric,
  MetricGrid,
  MetricLabel,
  MetricValue,
  Muted,
  Panel,
  PanelStack,
  PanelTitle,
} from "./IntelPanelChrome";

export function MarketPulsePanel() {
  const { data, isLoading, error } = useMarketPulse(30);
  const sources = useTezosIntelSources();
  const topMarketplaces = data?.topMarketplaces ?? [];
  const importedSources = sources.data?.sources ?? [];

  return (
    <PanelStack>
      <Panel data-tezos-intel-panel="market-pulse">
        <PanelTitle>Market Pulse</PanelTitle>
        {isLoading && <Muted>Loading pulse...</Muted>}
        {error && <Muted>{(error as Error).message}</Muted>}
        {data && (
          <>
            <MetricGrid>
              <Metric>
                <MetricLabel>30d Sales</MetricLabel>
                <MetricValue>{data.saleCount}</MetricValue>
              </Metric>
              <Metric>
                <MetricLabel>30d Volume</MetricLabel>
                <MetricValue>{formatXtz(data.volumeMutez)}</MetricValue>
              </Metric>
              <Metric>
                <MetricLabel>Active Listings</MetricLabel>
                <MetricValue>{data.activeListingCount}</MetricValue>
              </Metric>
              <Metric>
                <MetricLabel>Primary / Secondary</MetricLabel>
                <MetricValue>
                  {data.primarySaleCount} / {data.secondarySaleCount}
                </MetricValue>
              </Metric>
            </MetricGrid>
            {topMarketplaces.map((market) => (
              <Metric key={market.marketplace}>
                <MetricLabel>{market.marketplace}</MetricLabel>
                <MetricValue>{formatXtz(market.volumeMutez)}</MetricValue>
                <Muted>{market.saleCount} sale(s)</Muted>
              </Metric>
            ))}
          </>
        )}
      </Panel>

      <Panel data-tezos-intel-panel="sources">
        <PanelTitle>Imported Sources</PanelTitle>
        {importedSources.map((source) => (
          <Muted key={source.name}>
            <strong>{source.name}</strong>: {source.status}
          </Muted>
        ))}
      </Panel>
    </PanelStack>
  );
}
