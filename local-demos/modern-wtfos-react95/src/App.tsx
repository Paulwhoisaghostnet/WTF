import { useMemo, useState } from "react";
import { createGlobalStyle } from "styled-components";
import {
  AppBar,
  Button,
  Checkbox,
  Frame,
  GroupBox,
  MenuList,
  MenuListItem,
  Panel,
  ProgressBar,
  Separator,
  TextInput,
  Toolbar,
  Window,
  WindowContent,
  WindowHeader,
  styleReset,
} from "react95";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Circle,
  Menu,
  Monitor,
  X,
} from "lucide-react";
import {
  categoryLabels,
  demoVariants,
  featureCatalog,
  restrictions,
  statusIcon,
  utilityShortcuts,
  type DemoCategory,
  type DemoMood,
  type DemoVariant,
  type WtfFeature,
} from "./modern-wtfos-data";

const GlobalStyle = createGlobalStyle`
  ${styleReset}
`;

const categories: DemoCategory[] = ["pro", "indie", "mobile", "ops"];
const shortCategoryLabels: Record<DemoCategory, string> = {
  pro: "Pitch-grade",
  indie: "Indie web",
  mobile: "Mobile",
  ops: "Operation",
};

function getInitialVariantId() {
  if (typeof window === "undefined") return demoVariants[0].id;
  const hash = window.location.hash.replace(/^#/, "");
  return demoVariants.find((variant) => variant.id === hash)?.id ?? demoVariants[0].id;
}

function statusClass(status: WtfFeature["status"]) {
  return `is-${status}`;
}

function FeatureStatus({ feature }: { feature: WtfFeature }) {
  const Icon = statusIcon[feature.status];
  return (
    <span className={`feature-status ${statusClass(feature.status)}`}>
      <Icon size={14} aria-hidden="true" />
      {feature.status}
    </span>
  );
}

function CategoryPill({ category }: { category: DemoCategory }) {
  return <span className={`category-pill category-${category}`}>{categoryLabels[category]}</span>;
}

function VariantButton({
  variant,
  selected,
  onSelect,
}: {
  variant: DemoVariant;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`variant-button ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="variant-button-topline">
        <CategoryPill category={variant.category} />
        <span>{variant.shortName}</span>
      </span>
      <strong>{variant.name}</strong>
      <span>{variant.pitch}</span>
    </button>
  );
}

function RestrictionDock({ compact }: { compact?: boolean }) {
  const visible = compact ? restrictions.slice(0, 4) : restrictions;
  return (
    <Panel className="restriction-dock" variant="well">
      <div className="section-heading">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>Actual restrictions</span>
      </div>
      <div className="restriction-list">
        {visible.map((item) => (
          <div className="restriction-row" key={item.title}>
            <strong>{item.title}</strong>
            <span>{item.body}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function FeatureTile({
  feature,
  selected,
  onSelect,
}: {
  feature: WtfFeature;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = feature.icon;
  return (
    <button
      type="button"
      className={`feature-tile lane-${feature.lane} ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="feature-icon">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="feature-copy">
        <strong>{feature.label}</strong>
        <span>{feature.plain}</span>
      </span>
      <FeatureStatus feature={feature} />
    </button>
  );
}

function MetricStrip({ variant, selectedFeature }: { variant: DemoVariant; selectedFeature: WtfFeature }) {
  const metrics = [
    { label: "Surface", value: variant.shortName },
    { label: "Primary", value: variant.primaryAction },
    { label: "Selected", value: selectedFeature.metric },
    { label: "Binding", value: "React95" },
  ];

  return (
    <div className="metric-strip" aria-label="Demo metrics">
      {metrics.map((metric) => (
        <div className="metric" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </div>
      ))}
    </div>
  );
}

function CommandRail({
  query,
  setQuery,
  variant,
}: {
  query: string;
  setQuery: (value: string) => void;
  variant: DemoVariant;
}) {
  const shortcuts = utilityShortcuts.slice(0, 8);
  return (
    <Panel className="command-rail" variant="outside">
      <label className="field-label" htmlFor="demo-command">
        Command rail
      </label>
      <TextInput
        id="demo-command"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder="route, wallet, pin, recover..."
        fullWidth
      />
      <div className="command-result">
        <strong>{query ? `Run search for "${query}"` : variant.primaryAction}</strong>
        <span>{variant.usabilityRule}</span>
      </div>
      <div className="shortcut-grid">
        {shortcuts.map((shortcut) => {
          const Icon = shortcut.icon;
          return (
            <Button key={shortcut.label} className="icon-button" title={shortcut.label}>
              <Icon size={16} aria-hidden="true" />
              <span>{shortcut.label}</span>
            </Button>
          );
        })}
      </div>
    </Panel>
  );
}

function MiniWindow({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Window className={`mini-window ${className ?? ""}`}>
      <WindowHeader className="mini-window-header">
        <span>{title}</span>
        <span className="window-controls" aria-hidden="true">
          <Button size="sm">
            <Monitor size={12} />
          </Button>
          <Button size="sm">
            <X size={12} />
          </Button>
        </span>
      </WindowHeader>
      <WindowContent className="mini-window-content">{children}</WindowContent>
    </Window>
  );
}

function FeatureInspector({
  variant,
  selectedFeature,
  density,
}: {
  variant: DemoVariant;
  selectedFeature: WtfFeature;
  density: number;
}) {
  const Icon = selectedFeature.icon;
  const checklist = [
    "Route and owner app named",
    "Access gate visible",
    "Failure state has recovery",
    "Keyboard path preserved",
  ];

  return (
    <MiniWindow title={`${selectedFeature.label} inspector`} className="inspector-window">
      <div className="inspector-heading">
        <span className="inspector-icon">
          <Icon size={22} aria-hidden="true" />
        </span>
        <div>
          <strong>{selectedFeature.label}</strong>
          <span>{selectedFeature.plain}</span>
        </div>
      </div>
      <Separator />
      <div className="inspector-grid">
        <div>
          <span>Status</span>
          <FeatureStatus feature={selectedFeature} />
        </div>
        <div>
          <span>Design rule</span>
          <strong>{variant.usabilityRule}</strong>
        </div>
        <div>
          <span>Density</span>
          <ProgressBar value={density} />
        </div>
      </div>
      <div className="checklist">
        {checklist.map((item, index) => (
          <label key={item} className="check-row">
            <Checkbox checked={index < 3} readOnly />
            <span>{item}</span>
          </label>
        ))}
      </div>
    </MiniWindow>
  );
}

function WorkflowPanel({ variant }: { variant: DemoVariant }) {
  return (
    <Panel className="workflow-panel" variant="well">
      <div className="section-heading">
        <CheckCircle2 size={16} aria-hidden="true" />
        <span>Core workflow</span>
      </div>
      <ol className="workflow-list">
        {variant.workflow.map((step) => (
          <li key={step}>
            <Circle size={10} aria-hidden="true" />
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function ProfessionalStage({
  variant,
  features,
  selectedFeature,
  setSelectedFeature,
  density,
}: {
  variant: DemoVariant;
  features: WtfFeature[];
  selectedFeature: WtfFeature;
  setSelectedFeature: (feature: WtfFeature) => void;
  density: number;
}) {
  return (
    <div className="stage-grid professional-stage">
      <Panel className="feature-matrix" variant="outside">
        {features.map((feature) => (
          <FeatureTile
            key={feature.id}
            feature={feature}
            selected={selectedFeature.id === feature.id}
            onSelect={() => setSelectedFeature(feature)}
          />
        ))}
      </Panel>
      <div className="stage-stack">
        <MetricStrip variant={variant} selectedFeature={selectedFeature} />
        <FeatureInspector variant={variant} selectedFeature={selectedFeature} density={density} />
      </div>
      <div className="stage-side">
        <WorkflowPanel variant={variant} />
        <Panel className="risk-panel" variant="well">
          <div className="panel-stack">
            <strong>Design risk</strong>
            <span>{variant.risk}</span>
            <Button>{variant.secondaryAction}</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function IndieStage({
  variant,
  features,
  selectedFeature,
  setSelectedFeature,
  density,
}: {
  variant: DemoVariant;
  features: WtfFeature[];
  selectedFeature: WtfFeature;
  setSelectedFeature: (feature: WtfFeature) => void;
  density: number;
}) {
  return (
    <div className="indie-stage">
      <Panel className="sticker-wall" variant="outside">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <button
              type="button"
              key={feature.id}
              className={`sticker sticker-${index % 5} ${selectedFeature.id === feature.id ? "is-selected" : ""}`}
              onClick={() => setSelectedFeature(feature)}
            >
              <Icon size={20} aria-hidden="true" />
              <strong>{feature.label}</strong>
              <span>{feature.metric}</span>
            </button>
          );
        })}
      </Panel>
      <MiniWindow title="Public page desk" className="indie-window">
        <div className="zine-layout">
          <div className="zine-note">
            <strong>{variant.signature}</strong>
            <span>{variant.pitch}</span>
          </div>
          <FeatureInspector variant={variant} selectedFeature={selectedFeature} density={density} />
        </div>
      </MiniWindow>
      <WorkflowPanel variant={variant} />
    </div>
  );
}

function MobileStage({
  variant,
  features,
  selectedFeature,
  setSelectedFeature,
  density,
}: {
  variant: DemoVariant;
  features: WtfFeature[];
  selectedFeature: WtfFeature;
  setSelectedFeature: (feature: WtfFeature) => void;
  density: number;
}) {
  return (
    <div className="mobile-stage">
      <div className="phone-shell" role="img" aria-label={`${variant.name} mobile preview`}>
        <div className="phone-topbar">
          <Menu size={18} aria-hidden="true" />
          <strong>{variant.shortName}</strong>
          <span>95%</span>
        </div>
        <div className="phone-task">
          <span>Next task</span>
          <strong>{variant.primaryAction}</strong>
          <p>{variant.usabilityRule}</p>
          <Button fullWidth>{variant.secondaryAction}</Button>
        </div>
        <div className="phone-card-stack">
          {features.slice(0, 5).map((feature) => {
            const Icon = feature.icon;
            return (
              <button
                type="button"
                className={`phone-card ${selectedFeature.id === feature.id ? "is-selected" : ""}`}
                key={feature.id}
                onClick={() => setSelectedFeature(feature)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>
                  <strong>{feature.label}</strong>
                  <small>{feature.plain}</small>
                </span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <div className="bottom-nav">
          {features.slice(0, 4).map((feature) => {
            const Icon = feature.icon;
            return (
              <button
                type="button"
                key={feature.id}
                className={selectedFeature.id === feature.id ? "is-selected" : ""}
                onClick={() => setSelectedFeature(feature)}
                aria-label={feature.label}
              >
                <Icon size={18} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
      <div className="mobile-details">
        <FeatureInspector variant={variant} selectedFeature={selectedFeature} density={density} />
        <WorkflowPanel variant={variant} />
      </div>
    </div>
  );
}

function OpsStage({
  variant,
  features,
  selectedFeature,
  setSelectedFeature,
  density,
}: {
  variant: DemoVariant;
  features: WtfFeature[];
  selectedFeature: WtfFeature;
  setSelectedFeature: (feature: WtfFeature) => void;
  density: number;
}) {
  return (
    <div className="ops-stage">
      <Panel className="runbook-list" variant="outside">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <button
              type="button"
              key={feature.id}
              className={`runbook-row ${selectedFeature.id === feature.id ? "is-selected" : ""}`}
              onClick={() => setSelectedFeature(feature)}
            >
              <span className="runbook-index">{String(index + 1).padStart(2, "0")}</span>
              <Icon size={18} aria-hidden="true" />
              <span>
                <strong>{feature.label}</strong>
                <small>{feature.plain}</small>
              </span>
              <FeatureStatus feature={feature} />
            </button>
          );
        })}
      </Panel>
      <FeatureInspector variant={variant} selectedFeature={selectedFeature} density={density} />
      <div className="ops-side">
        <WorkflowPanel variant={variant} />
        <Panel className="risk-panel" variant="well">
          <div className="panel-stack">
            <strong>Operational risk</strong>
            <span>{variant.risk}</span>
            <Button>{variant.primaryAction}</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function DemoStage({
  variant,
  features,
  selectedFeature,
  setSelectedFeature,
  density,
}: {
  variant: DemoVariant;
  features: WtfFeature[];
  selectedFeature: WtfFeature;
  setSelectedFeature: (feature: WtfFeature) => void;
  density: number;
}) {
  if (variant.category === "indie") {
    return (
      <IndieStage
        variant={variant}
        features={features}
        selectedFeature={selectedFeature}
        setSelectedFeature={setSelectedFeature}
        density={density}
      />
    );
  }
  if (variant.category === "mobile") {
    return (
      <MobileStage
        variant={variant}
        features={features}
        selectedFeature={selectedFeature}
        setSelectedFeature={setSelectedFeature}
        density={density}
      />
    );
  }
  if (variant.category === "ops") {
    return (
      <OpsStage
        variant={variant}
        features={features}
        selectedFeature={selectedFeature}
        setSelectedFeature={setSelectedFeature}
        density={density}
      />
    );
  }
  return (
    <ProfessionalStage
      variant={variant}
      features={features}
      selectedFeature={selectedFeature}
      setSelectedFeature={setSelectedFeature}
      density={density}
    />
  );
}

function MoodChrome({
  variant,
  children,
}: {
  variant: DemoVariant;
  children: React.ReactNode;
}) {
  const style = {
    "--accent": variant.accent,
    "--accent-2": variant.accent2,
    "--ink": variant.ink,
    "--paper": variant.paper,
    "--chrome": variant.chrome,
  } as React.CSSProperties;

  return (
    <section className="demo-preview" data-mood={variant.mood satisfies DemoMood} style={style}>
      {children}
    </section>
  );
}

export function App() {
  const [selectedVariantId, setSelectedVariantId] = useState(getInitialVariantId);
  const [activeCategory, setActiveCategory] = useState<DemoCategory>("pro");
  const [query, setQuery] = useState("");
  const [density, setDensity] = useState(70);
  const [selectedFeatureId, setSelectedFeatureId] = useState("mission");

  const selectedVariant =
    demoVariants.find((variant) => variant.id === selectedVariantId) ?? demoVariants[0];
  const features = useMemo(
    () =>
      selectedVariant.features
        .map((id) => featureCatalog.find((feature) => feature.id === id))
        .filter((feature): feature is WtfFeature => Boolean(feature)),
    [selectedVariant.features]
  );
  const selectedFeature =
    features.find((feature) => feature.id === selectedFeatureId) ?? features[0] ?? featureCatalog[0];
  const visibleVariants = demoVariants.filter((variant) => variant.category === activeCategory);

  const selectVariant = (variant: DemoVariant) => {
    setSelectedVariantId(variant.id);
    setActiveCategory(variant.category);
    setSelectedFeatureId(variant.features[0] ?? "mission");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${variant.id}`);
    }
  };

  return (
    <>
      <GlobalStyle />
      <main className="app-shell">
        <AppBar position="static" className="demo-appbar">
          <Toolbar className="demo-toolbar">
            <div className="brand-lockup">
              <span className="brand-mark">wtf</span>
              <span>
                <strong>Modern wtfOS React95 demos</strong>
                <small>Local prototype host. No production route registration.</small>
              </span>
            </div>
            <div className="toolbar-actions">
              <Button onClick={() => setDensity((value) => Math.max(35, value - 10))}>Less dense</Button>
              <Button onClick={() => setDensity((value) => Math.min(100, value + 10))}>More dense</Button>
            </div>
          </Toolbar>
        </AppBar>

        <div className="workspace">
          <aside className="selector-pane" aria-label="Demo selector">
            <Window className="selector-window">
              <WindowHeader>Demo families</WindowHeader>
              <WindowContent>
                <div className="category-switcher" role="tablist" aria-label="Demo categories">
                  {categories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      role="tab"
                      className={activeCategory === category ? "is-selected" : ""}
                      aria-selected={activeCategory === category}
                      onClick={() => setActiveCategory(category)}
                    >
                      <span>{shortCategoryLabels[category]}</span>
                      <small>{categoryLabels[category]}</small>
                    </button>
                  ))}
                </div>
                <div className="selector-tab-body">
                  <div className="variant-list">
                    {visibleVariants.map((variant) => (
                      <VariantButton
                        key={variant.id}
                        variant={variant}
                        selected={selectedVariant.id === variant.id}
                        onSelect={() => selectVariant(variant)}
                      />
                    ))}
                  </div>
                </div>
                <Separator />
                <GroupBox label="Prototype boundary">
                  <p className="small-copy">
                    This app uses mocked state and root dependencies only. It does not add a wtfOS route,
                    desktop icon, server API, wallet action, SystemEvent, or live deploy path.
                  </p>
                </GroupBox>
              </WindowContent>
            </Window>
          </aside>

          <MoodChrome variant={selectedVariant}>
            <div className="preview-header">
              <div>
                <CategoryPill category={selectedVariant.category} />
                <h1>{selectedVariant.name}</h1>
                <p>{selectedVariant.pitch}</p>
              </div>
              <Panel className="sale-note" variant="well">
                <div className="panel-stack">
                  <strong>Pitch note</strong>
                  <span>{selectedVariant.saleNote}</span>
                </div>
              </Panel>
            </div>

            <div className="preview-body">
              <CommandRail query={query} setQuery={setQuery} variant={selectedVariant} />
              <Frame className="main-frame" variant="field">
                <div className="frame-toolbar">
                  <div>
                    <strong>{selectedVariant.signature}</strong>
                    <span>{selectedVariant.react95Binding}</span>
                  </div>
                  <MenuList className="mode-menu">
                    <MenuListItem>{selectedVariant.primaryAction}</MenuListItem>
                    <MenuListItem>{selectedVariant.secondaryAction}</MenuListItem>
                  </MenuList>
                </div>
                <DemoStage
                  variant={selectedVariant}
                  features={features}
                  selectedFeature={selectedFeature}
                  setSelectedFeature={(feature) => setSelectedFeatureId(feature.id)}
                  density={density}
                />
              </Frame>
            </div>
          </MoodChrome>
        </div>

        <RestrictionDock />
      </main>
    </>
  );
}
