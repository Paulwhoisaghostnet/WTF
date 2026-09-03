import {
  Anchor as AnchorIcon,
  Archive,
  Check,
  ExternalLink,
  HardDriveDownload,
  Server,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { styled } from "styled-components";
import { useWindowManager } from "../../lib/window-context";
import { type AnchorDownload, useAnchorDownloads } from "./useAnchorDownloads";

export function AnchorDownloadCenter() {
  const downloadsQ = useAnchorDownloads();
  const wm = useWindowManager();
  const manifest = downloadsQ.data;

  return (
    <Shell data-anchor-surface="download-center">
      <Hero>
        <Brand>
          <AnchorMark aria-hidden="true" viewBox="0 0 200 200">
            <path d="M84 4 L6 193 L194 193 L116 4" />
          </AnchorMark>
          <BrandCopy>
            <Eyebrow>Independent preservation appliance</Eyebrow>
            <h1>Anchor</h1>
            <p>Permanent by design.</p>
          </BrandCopy>
        </Brand>
        <BetaBadge>Beta</BetaBadge>
      </Hero>

      <Intro>
        <p>
          Run your own collector-owned resilience node. Anchor discovers media referenced by public
          Ethereum, Base, and Tezos wallets, pins IPFS content on your hardware, archives Arweave data,
          and checks it again every day.
        </p>
        <TrustLine>
          <ShieldCheck size={18} aria-hidden="true" />
          <span>No wallet keys, signatures, funds, or wtfOS Pin Collector permission required.</span>
        </TrustLine>
        {manifest ? (
          <Attribution>
            <span>Built and maintained by {manifest.maintainers.join(" and ")}.</span>
            <a href={manifest.repositoryUrl} target="_blank" rel="noopener noreferrer">
              View the Anchor source on GitLab <ExternalLink size={14} aria-hidden="true" />
            </a>
            <span>Licensed {manifest.license}.</span>
          </Attribution>
        ) : null}
      </Intro>

      <ChoiceGrid aria-label="Choose a preservation service">
        <Choice $primary>
          <ChoiceIcon><AnchorIcon size={20} aria-hidden="true" /></ChoiceIcon>
          <ChoiceBody>
            <ChoiceKicker>Your hardware</ChoiceKicker>
            <h2>Anchor</h2>
            <p>Independent IPFS and Arweave preservation on a dedicated machine or virtual machine.</p>
            <MetaList>
              <span><Check size={14} aria-hidden="true" /> You own the node and storage</span>
              <span><Check size={14} aria-hidden="true" /> Ethereum, Base, and Tezos</span>
              <span><Check size={14} aria-hidden="true" /> Optional community replication</span>
            </MetaList>
          </ChoiceBody>
        </Choice>

        <Choice>
          <ChoiceIcon><Server size={20} aria-hidden="true" /></ChoiceIcon>
          <ChoiceBody>
            <ChoiceKicker>wtfOS managed</ChoiceKicker>
            <h2>Hosted Porcupin</h2>
            <p>Integrated hosted pinning, PDS records, recovery manifests, and wtfos.me publishing.</p>
            <MetaList>
              <span><Check size={14} aria-hidden="true" /> No appliance to operate</span>
              <span><Check size={14} aria-hidden="true" /> wtfOS backup workflows</span>
              <span><TriangleAlert size={14} aria-hidden="true" /> Requires Pin Collector access</span>
            </MetaList>
            <InlineButton type="button" onClick={() => wm.openPage("/ipfs-pinning")}>
              Open hosted pinning
            </InlineButton>
          </ChoiceBody>
        </Choice>
      </ChoiceGrid>

      {downloadsQ.isLoading ? (
        <State role="status">Loading verified Anchor downloads…</State>
      ) : downloadsQ.isError || !manifest ? (
        <State role="alert" $danger>
          The Anchor download manifest could not be loaded. Retry from the app or use the upstream repository.
        </State>
      ) : (
        <DownloadSection aria-labelledby="anchor-downloads-heading">
          <SectionHeading>
            <div>
              <Eyebrow>Release {manifest.version}</Eyebrow>
              <h2 id="anchor-downloads-heading">Download Anchor</h2>
            </div>
            <ReleaseLinks>
              <a href={manifest.repositoryUrl} target="_blank" rel="noopener noreferrer">
                Upstream source <ExternalLink size={14} aria-hidden="true" />
              </a>
            </ReleaseLinks>
          </SectionHeading>

          <SafetyNote>
            <TriangleAlert size={20} aria-hidden="true" />
            <div>
              <strong>Choose the target carefully.</strong>
              <span>
                The installer ISO is unattended and writes to its configured destination disk. Anchor is beta software;
                run it on hardware and a network you control, and keep another copy of anything irreplaceable.
              </span>
            </div>
          </SafetyNote>

          <DownloadGrid>
            {manifest.appliances.map((item) => (
              <DownloadCard key={item.key} item={item} />
            ))}
          </DownloadGrid>

          {!manifest.summary.applianceAvailable ? (
            <AvailabilityNote role="status">
              <HardDriveDownload size={18} aria-hidden="true" />
              <span>
                Bootable images are waiting for checksum-backed publication. wtfOS will reveal each image only when its
                HTTPS URL and matching SHA-256 are configured.
              </span>
            </AvailabilityNote>
          ) : null}

          <SourcePanel>
            <SourceCopy>
              <Archive size={22} aria-hidden="true" />
              <div>
                <ChoiceKicker>Available now</ChoiceKicker>
                <h3>{manifest.source.label}</h3>
                <p>{manifest.source.useCase}</p>
              </div>
            </SourceCopy>
            <DownloadActions>
              <DownloadLink
                href={manifest.source.url || undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Download ${manifest.source.label}`}
              >
                Download source
                <HardDriveDownload size={16} aria-hidden="true" />
              </DownloadLink>
              <Checksum>
                <span>SHA-256</span>
                <code>{manifest.source.sha256}</code>
              </Checksum>
            </DownloadActions>
          </SourcePanel>

          <BuildFacts>
            <div><span>Upstream tag</span><code>{manifest.upstreamTag}</code></div>
            <div><span>Source commit</span><code>{manifest.upstreamCommit.slice(0, 12)}</code></div>
            <div><span>Daemon image</span><code>{manifest.daemonImage}</code></div>
          </BuildFacts>
        </DownloadSection>
      )}
    </Shell>
  );
}

function DownloadCard({ item }: { item: AnchorDownload }) {
  return (
    <DownloadItem data-available={item.available ? "true" : "false"}>
      <DownloadItemHeader>
        <Format>{item.format}</Format>
        <Arch>{item.architecture}</Arch>
      </DownloadItemHeader>
      <h3>{item.label}</h3>
      <p>{item.useCase}</p>
      {item.available && item.url ? (
        <>
          <DownloadLink
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Download ${item.label}`}
          >
            Download image
            <HardDriveDownload size={16} aria-hidden="true" />
          </DownloadLink>
          <Checksum>
            <span>SHA-256</span>
            <code>{item.sha256}</code>
          </Checksum>
        </>
      ) : (
        <PendingLabel>Awaiting verified image</PendingLabel>
      )}
    </DownloadItem>
  );
}

const Shell = styled.main`
  min-height: 100%;
  padding: 24px;
  display: grid;
  align-content: start;
  gap: 24px;
  color: #0d0d0d;
  background: #f5f3ee;
  font-family: "Space Grotesk", Inter, ui-sans-serif, system-ui, sans-serif;

  * { box-sizing: border-box; }
  h1, h2, h3, p { margin: 0; }
  h1, h2, h3 { line-height: 1.12; letter-spacing: 0; }

  a:focus-visible,
  button:focus-visible {
    outline: 3px solid #0d0d0d;
    outline-offset: 3px;
  }

  @media (max-width: 680px) {
    padding: 16px;
    gap: 18px;
  }
`;

const Hero = styled.header`
  min-height: 168px;
  padding: 24px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  color: #fff;
  background: #0d0d0d;
  border: 1px solid #0d0d0d;
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 22px;
`;

const AnchorMark = styled.svg`
  width: 84px;
  height: 84px;
  flex: 0 0 auto;
  color: #fff;

  path {
    fill: none;
    stroke: currentColor;
    stroke-width: 6;
    stroke-linecap: square;
    stroke-linejoin: miter;
  }

  @media (max-width: 520px) {
    width: 56px;
    height: 56px;
  }
`;

const BrandCopy = styled.div`
  display: grid;
  gap: 5px;

  h1 { font-size: clamp(2.4rem, 8vw, 5rem); font-weight: 600; }
  p { color: #cbcac7; font-size: 1rem; }
`;

const Eyebrow = styled.span`
  display: block;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const BetaBadge = styled.span`
  padding: 7px 9px;
  border: 1px solid currentColor;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
`;

const Intro = styled.section`
  max-width: 920px;
  display: grid;
  gap: 14px;

  > p { font-size: clamp(1.05rem, 2vw, 1.32rem); line-height: 1.55; }
`;

const TrustLine = styled.div`
  width: fit-content;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 9px;
  border: 1px solid #77756f;
  font-size: 0.88rem;
  font-weight: 600;
`;

const Attribution = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px 12px;
  color: #4a4945;
  font-size: 0.82rem;

  a {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #0d0d0d;
    font-weight: 700;
    text-underline-offset: 3px;
  }
`;

const ChoiceGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid #0d0d0d;

  @media (max-width: 760px) { grid-template-columns: 1fr; }
`;

const Choice = styled.article<{ $primary?: boolean }>`
  min-width: 0;
  padding: 22px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 15px;
  background: ${({ $primary }) => ($primary ? "#fff" : "#ebe9e3")};

  & + & { border-left: 1px solid #0d0d0d; }

  @media (max-width: 760px) {
    & + & { border-left: 0; border-top: 1px solid #0d0d0d; }
  }
`;

const ChoiceIcon = styled.div`
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  color: #fff;
  background: #0d0d0d;
`;

const ChoiceBody = styled.div`
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 9px;

  h2 { font-size: 1.35rem; }
  p { color: #555; line-height: 1.5; }
`;

const ChoiceKicker = styled.span`
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #66645f;
`;

const MetaList = styled.div`
  display: grid;
  gap: 6px;
  font-size: 0.82rem;

  span { display: flex; align-items: center; gap: 7px; }
`;

const InlineButton = styled.button`
  width: fit-content;
  margin-top: 4px;
  padding: 8px 11px;
  border: 1px solid #0d0d0d;
  border-radius: 0;
  color: #0d0d0d;
  background: transparent;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;

  &:hover { color: #fff; background: #0d0d0d; }
`;

const State = styled.div<{ $danger?: boolean }>`
  padding: 18px;
  border: 1px solid ${({ $danger }) => ($danger ? "#8c1c13" : "#0d0d0d")};
  color: ${({ $danger }) => ($danger ? "#8c1c13" : "#0d0d0d")};
  background: #fff;
`;

const DownloadSection = styled.section`
  display: grid;
  gap: 16px;
`;

const SectionHeading = styled.div`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 12px;
  border-bottom: 2px solid #0d0d0d;

  > div { display: grid; gap: 4px; }
  h2 { font-size: clamp(1.6rem, 4vw, 2.4rem); }

  @media (max-width: 560px) { align-items: start; flex-direction: column; }
`;

const ReleaseLinks = styled.div`
  a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #0d0d0d;
    font-size: 0.86rem;
    font-weight: 700;
    text-underline-offset: 3px;
  }
`;

const SafetyNote = styled.div`
  padding: 14px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  border: 1px solid #9a6b00;
  background: #fff5ce;

  div { display: grid; gap: 4px; }
  span { color: #4a3b17; font-size: 0.88rem; line-height: 1.45; }
`;

const DownloadGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 235px), 1fr));
  border-top: 1px solid #0d0d0d;
  border-left: 1px solid #0d0d0d;
`;

const DownloadItem = styled.article`
  min-height: 220px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-right: 1px solid #0d0d0d;
  border-bottom: 1px solid #0d0d0d;
  background: #fff;

  &[data-available="false"] { background: #ebe9e3; }
  h3 { font-size: 1rem; }
  p { color: #555; font-size: 0.82rem; line-height: 1.45; }
`;

const DownloadItemHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`;

const Format = styled.span`
  padding: 4px 6px;
  color: #fff;
  background: #0d0d0d;
  font-size: 0.68rem;
  font-weight: 700;
`;

const Arch = styled.code`
  color: #555;
  font-size: 0.72rem;
`;

const DownloadLink = styled.a`
  min-height: 40px;
  margin-top: auto;
  padding: 9px 11px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #fff;
  background: #0d0d0d;
  border: 1px solid #0d0d0d;
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;

  &:hover { color: #0d0d0d; background: #fff; }
`;

const PendingLabel = styled.span`
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid #999;
  color: #555;
  font-size: 0.76rem;
  font-weight: 700;
  text-transform: uppercase;
`;

const Checksum = styled.div`
  min-width: 0;
  display: grid;
  gap: 3px;

  span { color: #66645f; font-size: 0.64rem; font-weight: 700; }
  code { overflow-wrap: anywhere; color: #343434; font-size: 0.65rem; }
`;

const AvailabilityNote = styled.div`
  padding: 12px 14px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px dashed #77756f;
  color: #45433f;
  font-size: 0.84rem;
  line-height: 1.45;
`;

const SourcePanel = styled.article`
  padding: 18px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 0.7fr);
  gap: 24px;
  color: #fff;
  background: #0d0d0d;

  @media (max-width: 760px) { grid-template-columns: 1fr; }
`;

const SourceCopy = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 13px;
  align-items: start;

  ${ChoiceKicker} { color: #cbcac7; }
  h3 { margin-top: 4px; font-size: 1.15rem; }
  p { margin-top: 7px; color: #cbcac7; font-size: 0.86rem; line-height: 1.45; }
`;

const DownloadActions = styled.div`
  min-width: 0;
  display: grid;
  gap: 9px;

  ${DownloadLink} { color: #0d0d0d; background: #fff; border-color: #fff; }
  ${DownloadLink}:hover { color: #fff; background: #0d0d0d; }
  ${Checksum} span, ${Checksum} code { color: #cbcac7; }
`;

const BuildFacts = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid #999;
  border-left: 1px solid #999;

  div {
    min-width: 0;
    padding: 10px;
    display: grid;
    gap: 4px;
    border-right: 1px solid #999;
    border-bottom: 1px solid #999;
  }

  span { color: #66645f; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; }
  code { overflow-wrap: anywhere; font-size: 0.7rem; }

  @media (max-width: 760px) { grid-template-columns: 1fr; }
`;
