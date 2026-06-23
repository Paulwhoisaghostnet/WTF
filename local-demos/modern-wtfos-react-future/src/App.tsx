import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Command,
  ExternalLink,
  Menu,
  Search,
} from "lucide-react";
import {
  familyLabels,
  laneMeta,
  shellConcepts,
  shellConstraints,
  shellModules,
  statusMeta,
  type ConceptFamily,
  type ShellConcept,
  type ShellModule,
} from "./future-shell-data";

const families: ConceptFamily[] = ["pro", "indie", "mobile", "ops"];

function initialConceptId() {
  if (typeof window === "undefined") return shellConcepts[0].id;
  const hash = window.location.hash.replace(/^#/, "");
  return shellConcepts.find((concept) => concept.id === hash)?.id ?? shellConcepts[0].id;
}

function shellVars(concept: ShellConcept) {
  return {
    "--accent": concept.accent,
    "--accent-2": concept.accent2,
    "--surface": concept.surface,
    "--ink": concept.ink,
    "--canvas": concept.canvas,
  } as React.CSSProperties;
}

function useConceptModules(concept: ShellConcept) {
  return useMemo(
    () =>
      concept.modules
        .map((id) => shellModules.find((module) => module.id === id))
        .filter((module): module is ShellModule => Boolean(module)),
    [concept.modules]
  );
}

function StatusBadge({ status }: { status: ShellModule["status"] }) {
  const meta = statusMeta[status];
  const Icon = meta.icon;
  return (
    <span className={`status status-${status}`}>
      <Icon size={14} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function ModuleChip({
  module,
  active,
  onClick,
}: {
  module: ShellModule;
  active?: boolean;
  onClick?: () => void;
}) {
  const Icon = module.icon;
  return (
    <button
      type="button"
      className={`module-chip ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <Icon size={17} aria-hidden="true" />
      <span>
        <strong>{module.label}</strong>
        <small>{module.job}</small>
      </span>
      <StatusBadge status={module.status} />
    </button>
  );
}

function MiniModule({ module }: { module: ShellModule }) {
  const Icon = module.icon;
  return (
    <span className={`mini-module lane-${module.lane}`}>
      <Icon size={15} aria-hidden="true" />
      <strong>{module.label}</strong>
    </span>
  );
}

function ConceptPicker({
  activeFamily,
  setActiveFamily,
  selectedConcept,
  selectConcept,
}: {
  activeFamily: ConceptFamily;
  setActiveFamily: (family: ConceptFamily) => void;
  selectedConcept: ShellConcept;
  selectConcept: (concept: ShellConcept) => void;
}) {
  const visibleConcepts = shellConcepts.filter((concept) => concept.family === activeFamily);
  return (
    <aside className="chooser" aria-label="Concept picker">
      <div className="chooser-brand">
        <span>wtf</span>
        <div>
          <strong>Future shell studies</strong>
          <small>React-only. Structural concepts, not skins.</small>
        </div>
      </div>
      <div className="family-tabs" role="tablist" aria-label="Concept families">
        {families.map((family) => (
          <button
            key={family}
            type="button"
            role="tab"
            aria-selected={family === activeFamily}
            className={family === activeFamily ? "is-active" : ""}
            onClick={() => setActiveFamily(family)}
          >
            {familyLabels[family]}
          </button>
        ))}
      </div>
      <div className="concept-list">
        {visibleConcepts.map((concept) => (
          <button
            key={concept.id}
            type="button"
            className={`concept-card ${selectedConcept.id === concept.id ? "is-active" : ""}`}
            onClick={() => selectConcept(concept)}
          >
            <small>{concept.shortName}</small>
            <strong>{concept.name}</strong>
            <span>{concept.thesis}</span>
          </button>
        ))}
      </div>
      <div className="chooser-note">
        <strong>Correction</strong>
        <p>
          This pass changes structure: spatial map, cockpit, pipeline, community board, station desk,
          stack garden, phone dock, camera lens, wallet deck, command parser, repair harbor, and role lanes.
        </p>
      </div>
    </aside>
  );
}

function ShellHeader({ concept }: { concept: ShellConcept }) {
  return (
    <header className="study-header">
      <div>
        <span className="family-label">{familyLabels[concept.family]}</span>
        <h1>{concept.name}</h1>
        <p>{concept.thesis}</p>
      </div>
      <div className="study-actions">
        <button type="button">
          <Command size={16} aria-hidden="true" />
          Intent
        </button>
        <button type="button">
          <ExternalLink size={16} aria-hidden="true" />
          Handoff
        </button>
      </div>
    </header>
  );
}

function ProtocolHabitat({ concept, modules }: ConceptViewProps) {
  const center = modules[0];
  const satellites = modules.slice(1);
  return (
    <section className="study protocol-habitat" style={shellVars(concept)}>
      <ShellHeader concept={concept} />
      <div className="habitat-map">
        <div className="habitat-center">
          <strong>{center.label}</strong>
          <span>{concept.shellIdea}</span>
          <button type="button">{concept.primaryAction}</button>
        </div>
        {satellites.map((module, index) => {
          const Icon = module.icon;
          return (
            <button key={module.id} type="button" className={`orbit-node orbit-${index}`}>
              <Icon size={20} aria-hidden="true" />
              <strong>{module.label}</strong>
              <small>{laneMeta[module.lane].label}</small>
            </button>
          );
        })}
        <div className="route-thread route-a" />
        <div className="route-thread route-b" />
        <div className="route-thread route-c" />
      </div>
      <div className="habitat-footer">
        {modules.slice(0, 6).map((module) => (
          <MiniModule key={module.id} module={module} />
        ))}
      </div>
    </section>
  );
}

function Chainroom({ concept, modules }: ConceptViewProps) {
  return (
    <section className="study chainroom" style={shellVars(concept)}>
      <ShellHeader concept={concept} />
      <div className="chainroom-grid">
        <div className="readiness-board">
          <strong>Readiness waterfall</strong>
          {modules.slice(0, 6).map((module, index) => (
            <div key={module.id} className="readiness-row">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{module.label}</strong>
              <StatusBadge status={module.status} />
            </div>
          ))}
        </div>
        <div className="war-room-screen">
          <span>Network proof</span>
          <strong>Account, RPC, fee, route, event, receipt.</strong>
          <p>{concept.whyBetter}</p>
        </div>
        <div className="evidence-drawer">
          <strong>Evidence drawer</strong>
          {["Mainnet guard", "Wallet account", "PDS pointer", "Public URL", "Rollback path"].map((item) => (
            <span key={item}>
              <Check size={15} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function CreatorFoundry({ concept, modules }: ConceptViewProps) {
  const stages = ["Draft", "Assets", "Pin", "Contract", "Site", "Signal"];
  return (
    <section className="study creator-foundry" style={shellVars(concept)}>
      <ShellHeader concept={concept} />
      <div className="foundry-floor">
        <div className="release-ticket">
          <small>Release order</small>
          <strong>{concept.primaryAction}</strong>
          <p>{concept.shellIdea}</p>
        </div>
        <div className="conveyor">
          {stages.map((stage, index) => {
            const module = modules[index % modules.length];
            return (
              <article key={stage}>
                <span>{stage}</span>
                <MiniModule module={module} />
                <button type="button">Open stage</button>
              </article>
            );
          })}
        </div>
        <div className="foundry-proof">
          <strong>Launch proof</strong>
          <p>{concept.migrationPath}</p>
        </div>
      </div>
    </section>
  );
}

function NeighborhoodNet({ concept, modules }: ConceptViewProps) {
  return (
    <section className="study neighborhood-net" style={shellVars(concept)}>
      <ShellHeader concept={concept} />
      <div className="neighborhood-board">
        <div className="town-map">
          {modules.slice(0, 7).map((module, index) => (
            <button key={module.id} type="button" className={`building building-${index}`}>
              <MiniModule module={module} />
            </button>
          ))}
        </div>
        <div className="bulletin-stack">
          <strong>Community board</strong>
          {["Patch site", "Open room", "Share signal", "Pin artifact"].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <div className="guestbook">
          <strong>Guestbook pulse</strong>
          <p>{concept.weirdness}</p>
        </div>
      </div>
    </section>
  );
}

function PublicAccessStation({ concept, modules }: ConceptViewProps) {
  return (
    <section className="study public-station" style={shellVars(concept)}>
      <ShellHeader concept={concept} />
      <div className="station-console">
        <div className="broadcast-monitor">
          <span>ON AIR</span>
          <strong>{concept.primaryAction}</strong>
          <p>{concept.shellIdea}</p>
        </div>
        <div className="mixer">
          {modules.slice(0, 6).map((module) => (
            <label key={module.id}>
              <span>{module.label}</span>
              <input type="range" min={0} max={100} defaultValue={module.status === "ready" ? 82 : 48} />
            </label>
          ))}
        </div>
        <div className="caller-queue">
          <strong>Callers / queue</strong>
          {modules.slice(0, 5).map((module) => (
            <ModuleChip key={module.id} module={module} />
          ))}
        </div>
      </div>
    </section>
  );
}

function HyperstackGarden({ concept, modules }: ConceptViewProps) {
  return (
    <section className="study hyperstack" style={shellVars(concept)}>
      <ShellHeader concept={concept} />
      <div className="stack-garden">
        <div className="stack-column stack-left">
          {modules.slice(0, 4).map((module, index) => (
            <article key={module.id} style={{ "--tilt": `${index % 2 ? 2 : -2}deg` } as React.CSSProperties}>
              <MiniModule module={module} />
              <p>{module.job}</p>
            </article>
          ))}
        </div>
        <div className="backlink-orb">
          <strong>Backlinks</strong>
          <span>{concept.shellIdea}</span>
        </div>
        <div className="stack-column stack-right">
          {modules.slice(4, 8).map((module, index) => (
            <article key={module.id} style={{ "--tilt": `${index % 2 ? -3 : 1}deg` } as React.CSSProperties}>
              <MiniModule module={module} />
              <p>{module.job}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PocketDock({ concept, modules }: ConceptViewProps) {
  return (
    <section className="study pocket-dock" style={shellVars(concept)}>
      <ShellHeader concept={concept} />
      <PhoneShell concept={concept} modules={modules} variant="dock" />
    </section>
  );
}

function LiveLens({ concept, modules }: ConceptViewProps) {
  return (
    <section className="study live-lens" style={shellVars(concept)}>
      <ShellHeader concept={concept} />
      <div className="lens-stage">
        <div className="viewfinder">
          <span>LIVE LENS</span>
          <strong>{concept.primaryAction}</strong>
          <div className="focus-box" />
        </div>
        <div className="live-controls">
          {["Source", "Audience", "Room", "Record"].map((item) => (
            <button key={item} type="button">{item}</button>
          ))}
        </div>
        <div className="chat-ribbon">
          {modules.slice(0, 5).map((module) => (
            <MiniModule key={module.id} module={module} />
          ))}
        </div>
      </div>
    </section>
  );
}

function WalletDeck({ concept, modules }: ConceptViewProps) {
  return (
    <section className="study wallet-deck" style={shellVars(concept)}>
      <ShellHeader concept={concept} />
      <div className="deck-table">
        <div className="wallet-card-stack">
          {modules.slice(0, 5).map((module, index) => (
            <article key={module.id} style={{ "--offset": `${index * 18}px` } as React.CSSProperties}>
              <MiniModule module={module} />
              <strong>{module.count} proofs</strong>
              <StatusBadge status={module.status} />
            </article>
          ))}
        </div>
        <div className="receipt-ledger">
          <strong>Receipt ledger</strong>
          {["Network", "Account", "Cost", "Target", "Rollback"].map((item) => (
            <span key={item}>
              <Check size={15} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function IntentOS({ concept, modules }: ConceptViewProps) {
  return (
    <section className="study intent-os" style={shellVars(concept)}>
      <ShellHeader concept={concept} />
      <div className="intent-console">
        <div className="prompt-pane">
          <label>
            <Search size={18} aria-hidden="true" />
            <input aria-label="Intent prompt" defaultValue="publish airporters recap with chain proof" />
          </label>
          <pre>{`intent.publish({
  object: "recap",
  proof: "chain",
  owner: "current_user",
  gate: "route+role"
})`}</pre>
        </div>
        <div className="parse-tree">
          {modules.slice(0, 7).map((module, index) => (
            <div key={module.id} className={`parse-node depth-${index % 3}`}>
              <MiniModule module={module} />
            </div>
          ))}
        </div>
        <div className="result-card">
          <strong>Before action</strong>
          <p>{concept.risk}</p>
          <button type="button">{concept.primaryAction}</button>
        </div>
      </div>
    </section>
  );
}

function RecoveryHarbor({ concept, modules }: ConceptViewProps) {
  return (
    <section className="study recovery-harbor" style={shellVars(concept)}>
      <ShellHeader concept={concept} />
      <div className="harbor-grid">
        <div className="harbor-beacon">
          <strong>Harbor status</strong>
          <span>Calm enough to fix. Clear enough to trust.</span>
        </div>
        {modules.slice(0, 6).map((module) => (
          <article key={module.id} className={`repair-card status-${module.status}`}>
            <ModuleChip module={module} />
            <button type="button">Run safe fix</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function RoleRunbook({ concept, modules }: ConceptViewProps) {
  const roles = ["Creator", "Collector", "Host", "Admin", "Agent"];
  return (
    <section className="study role-runbook" style={shellVars(concept)}>
      <ShellHeader concept={concept} />
      <div className="role-lanes">
        {roles.map((role, laneIndex) => (
          <section key={role}>
            <header>{role}</header>
            {modules.slice(laneIndex, laneIndex + 4).map((module, index) => (
              <article key={`${role}-${module.id}`}>
                <span>{index + 1}</span>
                <MiniModule module={module} />
                <button type="button">Proof</button>
              </article>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}

function PhoneShell({
  concept,
  modules,
  variant,
}: {
  concept: ShellConcept;
  modules: ShellModule[];
  variant: "dock" | "cards";
}) {
  return (
    <div className={`phone-shell phone-${variant}`}>
      <div className="phone-top">
        <Menu size={18} aria-hidden="true" />
        <strong>{concept.shortName}</strong>
        <span>online</span>
      </div>
      <section className="phone-task">
        <small>Next useful action</small>
        <strong>{concept.primaryAction}</strong>
        <p>{concept.whyBetter}</p>
        <button type="button">{concept.secondaryAction}</button>
      </section>
      <div className="phone-cards">
        {modules.slice(0, 6).map((module) => (
          <ModuleChip key={module.id} module={module} />
        ))}
      </div>
      <nav aria-label="Phone dock">
        {modules.slice(0, 5).map((module) => {
          const Icon = module.icon;
          return (
            <button key={module.id} type="button" aria-label={module.label}>
              <Icon size={18} aria-hidden="true" />
            </button>
          );
        })}
      </nav>
    </div>
  );
}

interface ConceptViewProps {
  concept: ShellConcept;
  modules: ShellModule[];
}

function ConceptView({ concept, modules }: ConceptViewProps) {
  switch (concept.id) {
    case "protocol-habitat":
      return <ProtocolHabitat concept={concept} modules={modules} />;
    case "chainroom":
      return <Chainroom concept={concept} modules={modules} />;
    case "creator-foundry":
      return <CreatorFoundry concept={concept} modules={modules} />;
    case "neighborhood-net":
      return <NeighborhoodNet concept={concept} modules={modules} />;
    case "public-access-station":
      return <PublicAccessStation concept={concept} modules={modules} />;
    case "hyperstack-garden":
      return <HyperstackGarden concept={concept} modules={modules} />;
    case "pocket-dock":
      return <PocketDock concept={concept} modules={modules} />;
    case "live-lens":
      return <LiveLens concept={concept} modules={modules} />;
    case "wallet-deck":
      return <WalletDeck concept={concept} modules={modules} />;
    case "intent-os":
      return <IntentOS concept={concept} modules={modules} />;
    case "recovery-harbor":
      return <RecoveryHarbor concept={concept} modules={modules} />;
    case "role-runbook":
      return <RoleRunbook concept={concept} modules={modules} />;
    default:
      return <ProtocolHabitat concept={concept} modules={modules} />;
  }
}

function ConstraintFooter() {
  return (
    <section className="constraint-footer" aria-label="Design constraints">
      <div>
        <AlertTriangle size={17} aria-hidden="true" />
        <strong>Still real constraints</strong>
      </div>
      <div className="constraint-row">
        {shellConstraints.slice(0, 6).map((constraint) => (
          <article key={constraint.title}>
            <strong>{constraint.title}</strong>
            <p>{constraint.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function App() {
  const [selectedConceptId, setSelectedConceptId] = useState(initialConceptId);
  const [activeFamily, setActiveFamily] = useState<ConceptFamily>(() => {
    const current = shellConcepts.find((concept) => concept.id === initialConceptId());
    return current?.family ?? "pro";
  });

  useEffect(() => {
    const syncHashConcept = () => {
      const hash = window.location.hash.replace(/^#/, "");
      const hashConcept = shellConcepts.find((concept) => concept.id === hash);
      if (hashConcept) {
        setSelectedConceptId(hashConcept.id);
        setActiveFamily(hashConcept.family);
      }
    };

    window.addEventListener("hashchange", syncHashConcept);
    return () => window.removeEventListener("hashchange", syncHashConcept);
  }, []);

  const selectedConcept =
    shellConcepts.find((concept) => concept.id === selectedConceptId) ?? shellConcepts[0];
  const modules = useConceptModules(selectedConcept);

  const selectConcept = (concept: ShellConcept) => {
    setSelectedConceptId(concept.id);
    setActiveFamily(concept.family);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${concept.id}`);
    }
  };

  return (
    <main className="app">
      <ConceptPicker
        activeFamily={activeFamily}
        setActiveFamily={setActiveFamily}
        selectedConcept={selectedConcept}
        selectConcept={selectConcept}
      />
      <ConceptView concept={selectedConcept} modules={modules} />
      <ConstraintFooter />
    </main>
  );
}
