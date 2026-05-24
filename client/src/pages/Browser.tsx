import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Panel, TextInput } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";

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
`;

const Toolbar = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
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
`;

function initialUrlFromLocation() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("url") ?? "";
}

export function Browser() {
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

  return (
    <AppWindow title="Browser">
      <Shell>
        <GroupBox label="Link Chamber">
          <Toolbar>
            <TextInput
              value={draft}
              placeholder="https://objkt.com/..."
              onChange={(event: any) => setDraft(event.target.value)}
              style={{ flex: 1 }}
            />
            <Button onClick={() => setSubmitted(draft.trim())}>Open</Button>
          </Toolbar>
          <div style={{ marginTop: 6, fontSize: 11 }}>Allowed: {hosts}</div>
        </GroupBox>

        <Viewport>
          {policyQuery.isLoading ? (
            <Notice>
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
            <Notice>
              <div>
                <h3>Blocked</h3>
                <p>{policy?.reason || "This link is not approved for WTFOS browsing."}</p>
                {policy?.externalOpenAllowed ? (
                  <Button onClick={() => window.open(policy.url, "_blank", "noopener,noreferrer")}>
                    Open Outside WTFOS
                  </Button>
                ) : null}
              </div>
            </Notice>
          ) : (
            <Notice>
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
