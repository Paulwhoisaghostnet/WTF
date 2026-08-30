import { useEffect } from "react";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { CREATION_TOOLS } from "../features/creation-tools/tool-registry";
import { logClientSystemEvent } from "../lib/system-log";

const OUTCOMES = [
  { title: "Make an image", description: "Paint, process, tile, or compose a finished still.", route: "/tools/pixalerce", action: "Open PixAlerce" },
  { title: "Make an animation", description: "Create particle loops, pixel motion, GIF, WebM, or MP4 work.", route: "/tools/particle-painter", action: "Open PArticle Painter" },
  { title: "Make 3D art", description: "Build a voxel/pixel scene and export its image, animation, or 3D package.", route: "/tools/pixalerce", action: "Open PixAlerce for 3D" },
  { title: "Build a game", description: "Start from a playable template, test it, and submit it to Arcade.", route: "/game-studio", action: "Open Game Studio" },
] as const;

const NEXT_STEPS = [
  { title: "Continue a project", description: "Return to collaboration rooms and release checklists.", route: "/studio", action: "Open Studio" },
  { title: "Preserve or export", description: "Find owned media, project bundles, downloads, and IPFS preservation.", route: "/file-manager", action: "Open File Manager" },
  { title: "Mint or publish", description: "Choose owned media first, then select HEN/Teia, an Objkt-ready collection, an associated contract, or a new Pasta contract.", route: "/my-photos", action: "Open mintable media" },
  { title: "Challenge minting", description: "Use Mint Portal when a Gameshow challenge specifically asks for a mint submission.", route: "/mint-portal", action: "Open Mint Portal" },
] as const;

function go(route: string) {
  window.history.pushState({}, "", route);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function Create() {
  useEffect(() => {
    logClientSystemEvent({
      eventType: "creation.runway.viewed",
      metadata: { toolCount: CREATION_TOOLS.length },
    });
  }, []);

  return (
    <AppWindow title="Create">
      <Page data-create-runway>
        <Hero>
          <Eyebrow>Artist runway</Eyebrow>
          <h1>What do you want to make?</h1>
          <p>Start with the result. Every tool below says what it makes and where the finished work can go before you open it.</p>
        </Hero>

        <Section aria-labelledby="create-outcomes-heading">
          <h2 id="create-outcomes-heading">Choose an outcome</h2>
          <OutcomeGrid>
            {OUTCOMES.map((item) => (
              <OutcomeCard key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <button type="button" onClick={() => go(item.route)}>{item.action}</button>
              </OutcomeCard>
            ))}
          </OutcomeGrid>
        </Section>

        <Section aria-labelledby="creator-next-heading">
          <h2 id="creator-next-heading">Continue, preserve, or publish</h2>
          <NextGrid>
            {NEXT_STEPS.map((item) => (
              <NextCard key={item.title}>
                <div><h3>{item.title}</h3><p>{item.description}</p></div>
                <button type="button" onClick={() => go(item.route)}>{item.action}</button>
              </NextCard>
            ))}
          </NextGrid>
        </Section>

        <Section aria-labelledby="all-creation-tools-heading">
          <SectionHeading>
            <div><h2 id="all-creation-tools-heading">All sixteen creation tools</h2><p>Browse by capability when you already know which specialist tool you want.</p></div>
            <Count aria-label={`${CREATION_TOOLS.length} creation tools`}>{CREATION_TOOLS.length}</Count>
          </SectionHeading>
          <ToolGrid>
            {CREATION_TOOLS.map((tool) => (
              <ToolCard key={tool.id} data-create-tool-card={tool.id}>
                <ToolDomain>{tool.domain.replaceAll("-", " ")}</ToolDomain>
                <h3>{tool.title}</h3>
                <p>{tool.subtitle}</p>
                <Definition><dt>Makes</dt><dd>{tool.makes}</dd><dt>Exports to</dt><dd>{tool.exportDestinations.join(" · ")}</dd></Definition>
                {"roles" in tool && <AccessNote>Creator access may be required. If this tool is locked, use Contact Admin; the other tools and device exports remain available.</AccessNote>}
                <button type="button" onClick={() => go(tool.routePath)}>Open {tool.title}</button>
              </ToolCard>
            ))}
          </ToolGrid>
        </Section>
      </Page>
    </AppWindow>
  );
}

const Page = styled.main`height:100%;overflow:auto;background:#c0c0c0;color:#111;padding:14px;display:grid;gap:18px;box-sizing:border-box;`;
const Hero = styled.header`padding:18px;border:2px inset #fff;background:linear-gradient(135deg,#000080,#3333a8);color:#fff;h1{margin:3px 0 8px;font-size:clamp(24px,4vw,38px);}p{max-width:72ch;margin:0;line-height:1.5;}`;
const Eyebrow = styled.div`font-size:11px;text-transform:uppercase;letter-spacing:.16em;color:#d7ddff;`;
const Section = styled.section`display:grid;gap:10px;h2{margin:0;font-size:20px;}button{min-height:38px;padding:7px 12px;border:2px outset #fff;background:#d8d8d8;font:inherit;font-weight:700;cursor:pointer;}button:active{border-style:inset;}`;
const OutcomeGrid = styled.div`display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;@media(max-width:900px){grid-template-columns:repeat(2,minmax(0,1fr));}@media(max-width:540px){grid-template-columns:1fr;}`;
const OutcomeCard = styled.article`display:grid;grid-template-rows:auto 1fr auto;gap:8px;padding:14px;background:#fff;border:2px outset #fff;h3,p{margin:0;}p{line-height:1.4;color:#333;}`;
const NextGrid = styled.div`display:grid;gap:8px;`;
const NextCard = styled.article`display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px;background:#e8e8e8;border:1px solid #777;h3,p{margin:0;}p{margin-top:4px;color:#333;line-height:1.4;}@media(max-width:620px){align-items:stretch;flex-direction:column;}`;
const SectionHeading = styled.div`display:flex;justify-content:space-between;gap:12px;align-items:end;p{margin:4px 0 0;color:#444;}`;
const Count = styled.div`min-width:42px;height:42px;display:grid;place-items:center;background:#000080;color:#fff;border:2px inset #fff;font-weight:700;font-size:18px;`;
const ToolGrid = styled.div`display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;@media(max-width:980px){grid-template-columns:repeat(2,minmax(0,1fr));}@media(max-width:620px){grid-template-columns:1fr;}`;
const ToolCard = styled.article`display:grid;grid-template-rows:auto auto auto 1fr auto auto;gap:7px;padding:12px;background:#efefef;border:2px outset #fff;h3,p{margin:0;}p{line-height:1.4;color:#333;}`;
const ToolDomain = styled.div`font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#000080;`;
const Definition = styled.dl`display:grid;grid-template-columns:max-content minmax(0,1fr);gap:5px 8px;margin:3px 0;padding:8px;background:#fff;border:1px solid #888;font-size:12px;dt{font-weight:700;}dd{margin:0;overflow-wrap:anywhere;}`;
const AccessNote = styled.div`padding:7px;background:#fff4cc;border:1px solid #8a5b00;font-size:11px;line-height:1.35;`;
