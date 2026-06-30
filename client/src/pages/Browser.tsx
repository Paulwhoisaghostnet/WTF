import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Panel, TextInput } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { usePresentationShell } from "../lib/presentation-shell";

type BrowserPolicy = {
  allowed: boolean;
  url: string;
  host: string | null;
  reason: string | null;
  externalOpenAllowed: boolean;
};

const Shell = styled.div`
  display: grid;
  gap: 8px;

  &[data-gamma-utility-presentation-host="gamma"] {
    color: #f2ead9;
    font-family:
      Inter, "IBM Plex Sans", "Neue Haas Grotesk Text", Arial, sans-serif;
    font-size: 15px;
    line-height: 1.45;
  }

  &[data-gamma-utility-presentation-host="gamma"],
  &[data-gamma-utility-presentation-host="gamma"] * {
    box-sizing: border-box;
    letter-spacing: 0;
    text-shadow: none;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region] {
    background-image: none;
    box-shadow: none;
  }

  &[data-gamma-utility-presentation-host="gamma"]
    :where(button, input, p, span, strong, div, label, legend, fieldset) {
    font-family:
      Inter, "IBM Plex Sans", "Neue Haas Grotesk Text", Arial, sans-serif;
  }

  &[data-gamma-utility-presentation-host="gamma"] fieldset,
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="viewport"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="notice"] {
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    background: rgba(242, 234, 217, 0.035);
    color: #f2ead9;
  }

  &[data-gamma-utility-presentation-host="gamma"] legend,
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="allowed-hosts"] {
    color: #00d2ff;
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
  }

  &[data-gamma-utility-presentation-host="gamma"] :where(button, input) {
    border-radius: 4px;
  }

  &[data-gamma-utility-presentation-host="gamma"] button:not(:disabled) {
    color: #f2ead9;
  }
`;

const Toolbar = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;

  input {
    min-width: 220px;
  }

  button {
    min-height: 32px;
    font-size: var(--wtf-type-caption, 13px);
  }
`;

const Viewport = styled(Panel).attrs({ variant: "well" })`
  min-height: 520px;
  padding: 8px;
  overflow: hidden;
`;

const Frame = styled.iframe`
  width: 100%;
  min-height: 500px;
  border: 0;
  background: #fff;
`;

const Notice = styled.div`
  display: grid;
  place-items: center;
  min-height: 480px;
  text-align: center;
  padding: 24px;
  font-size: var(--wtf-type-body, 14px);
  line-height: 1.4;
`;

const AllowedHosts = styled.div`
  margin-top: 6px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted, #4b5563);
  overflow-wrap: anywhere;
`;

function initialUrlFromLocation() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("url") ?? "";
}

export function Browser() {
  const presentation = usePresentationShell();
  const [draft, setDraft] = useState(initialUrlFromLocation());
  const [submitted, setSubmitted] = useState(initialUrlFromLocation());
  const policyQuery = useQuery({
    queryKey: ["browser", "resolve", submitted],
    enabled: !!submitted.trim(),
    queryFn: () =>
      api.get<BrowserPolicy>(
        `/api/browser/resolve?url=${encodeURIComponent(submitted)}`
      ),
  });
  const allowlistQuery = useQuery({
    queryKey: ["browser", "allowlist"],
    queryFn: () => api.get<{ hosts: string[] }>("/api/browser/allowlist"),
  });
  const policy = policyQuery.data;
  const hosts = useMemo(
    () => allowlistQuery.data?.hosts.slice(0, 12).join(", ") ?? "",
    [allowlistQuery.data?.hosts]
  );
  const submitDraft = () => setSubmitted(draft.trim());

  return (
    <AppWindow title="Browser">
      <Shell
        data-gamma-utility-surface="browser"
        data-gamma-utility-presentation-host={presentation.host}
        data-gamma-utility-region="surface"
      >
        <GroupBox label="Link Chamber" data-gamma-utility-region="panel">
          <Toolbar data-gamma-utility-region="toolbar">
            <TextInput
              aria-label="Approved browser URL"
              value={draft}
              placeholder="https://objkt.com/..."
              onChange={(event: any) => setDraft(event.target.value)}
              onKeyDown={(event: any) => {
                if (event.key === "Enter") submitDraft();
              }}
              style={{ flex: 1 }}
            />
            <Button data-gamma-utility-region="button" onClick={submitDraft}>
              Open approved link
            </Button>
          </Toolbar>
          <AllowedHosts data-gamma-utility-region="allowed-hosts">
            Allowed hosts: {hosts || "loading allowlist..."}
          </AllowedHosts>
        </GroupBox>

        <Viewport data-gamma-utility-region="viewport">
          {policyQuery.isLoading ? (
            <Notice data-gamma-utility-region="notice">
              <Hourglass size={28} />
            </Notice>
          ) : policy?.allowed ? (
            <Frame
              key={policy.url}
              src={policy.url}
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin"
              referrerPolicy="no-referrer"
              title="WTF controlled browser"
            />
          ) : submitted ? (
            <Notice data-gamma-utility-region="notice">
              <div>
                <h3>Blocked</h3>
                <p>{policy?.reason || "This link is not approved for WTFOS browsing."}</p>
                {policy?.externalOpenAllowed ? (
                  <Button
                    data-gamma-utility-region="button"
                    onClick={() => window.open(policy.url, "_blank", "noopener,noreferrer")}
                  >
                    Open link outside WTF OS
                  </Button>
                ) : null}
              </div>
            </Notice>
          ) : (
            <Notice data-gamma-utility-region="notice">
              <div>
                <h3>Ready</h3>
                <p>Open approved WTFOS source links here.</p>
              </div>
            </Notice>
          )}
        </Viewport>
      </Shell>
    </AppWindow>
  );
}
