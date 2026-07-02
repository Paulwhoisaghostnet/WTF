import { useMemo, useState } from "react";
import styled from "styled-components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Checkbox, Hourglass, Panel, Separator, TextInput } from "react95";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { usePresentationShell } from "../lib/presentation-shell";

type DickswordConfig = {
  guildId: string;
  inviteUrl: string | null;
  oauthConfigured: boolean;
  claimTtlMs: number;
  avatarAssetBasePath: string;
  commands: string[];
};

type DiscordLayer = {
  id: number;
  key: string;
  label: string;
  layerType: "base" | "accessory";
  stackOrder: number;
  assetUrl: string;
  enabled: boolean;
};

type DiscordConflict = {
  id: number;
  layerId: number;
  conflictsWithLayerId: number;
  reason: string | null;
};

type DiscordActivity = {
  id: number;
  kind: string;
  action: string;
  xpAmount: number;
  xpAwardedAt: string | null;
  discordHandle: string | null;
  observedAt: string;
  externalRef: string | null;
};

type RoleMapping = {
  id: number;
  key: string;
  label: string;
  roleId: string;
  roleKind: string;
  protected: boolean;
  managed: boolean;
};

type DickswordMe = {
  user: {
    id: number;
    username: string;
    displayName: string | null;
    role: string;
    discordId: string | null;
    discordHandle: string | null;
    discordVerified: boolean;
    experiencePoints: number;
    xpTier: { label: string; key: string; nextTierMinXp: number | null };
  } | null;
  activeClaim: { id: number; expiresAt: string; createdAt: string } | null;
  activity: DiscordActivity[];
  avatar: {
    layers: DiscordLayer[];
    conflicts: DiscordConflict[];
    selections: Array<{ layerId: number }>;
  };
  roleMappings: RoleMapping[];
};

const gammaDickswordScope = `[data-dicksword-presentation-host="gamma"]`;

const Shell = styled.div`
  min-height: 100%;
  background: #c0c0c0;
  color: #101010;
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  padding: 8px;
  box-sizing: border-box;

  &[data-dicksword-presentation-host="gamma"] {
    background: #070706;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
`;

const Header = styled(Panel).attrs({ variant: "well" })`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
  padding: 10px;
  margin-bottom: 8px;

  ${gammaDickswordScope} & {
    background: #11110f;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    box-shadow: none;
    color: #f2ead9;
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const Title = styled.h1`
  margin: 0;
  font-size: clamp(24px, 5vw, 44px);
  letter-spacing: -0.04em;
  line-height: 0.9;
  color: #000080;

  ${gammaDickswordScope} & {
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }
`;

const Subtitle = styled.p`
  max-width: 720px;
  color: #202020;
  font-size: 13px;
  line-height: 1.5;
  margin: 10px 0 0;

  ${gammaDickswordScope} & {
    color: rgba(242, 234, 217, 0.72);
  }
`;

const StatusBlock = styled.div`
  min-width: 220px;
  padding: 8px;
  background: #ffffff;
  border: 2px inset #dfdfdf;
  font-size: 12px;
  line-height: 1.6;

  ${gammaDickswordScope} & {
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.22);
    border-radius: 6px;
    color: #f2ead9;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  }
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(300px, 420px) minmax(0, 1fr);
  gap: 8px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Section = styled(Panel).attrs({ variant: "well" })`
  padding: 10px;
  margin-bottom: 8px;

  ${gammaDickswordScope} & {
    background: #11110f;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    box-shadow: none;
    color: #f2ead9;
  }
`;

const SectionTitle = styled.h2`
  margin: 0 0 8px;
  font-size: 16px;
  color: #000080;

  ${gammaDickswordScope} & {
    color: #00d2ff;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    letter-spacing: 0;
    text-transform: uppercase;
  }
`;

const Muted = styled.p`
  margin: 0 0 10px;
  color: #404040;
  font-size: 12px;
  line-height: 1.5;

  ${gammaDickswordScope} & {
    color: rgba(242, 234, 217, 0.68);
  }
`;

const Command = styled.code`
  display: inline-block;
  background: #ffffff;
  border: 2px inset #dfdfdf;
  color: #000000;
  padding: 5px 7px;
  margin: 3px 0;
  font-size: 11px;

  ${gammaDickswordScope} & {
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.22);
    border-radius: 4px;
    color: #d6ff3f;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  }
`;

const ActivityRow = styled.div`
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #808080;
  font-size: 12px;

  ${gammaDickswordScope} & {
    border-bottom: 1px solid rgba(242, 234, 217, 0.12);
    color: #f2ead9;
  }
`;

const AvatarStage = styled.div`
  position: relative;
  width: min(340px, 100%);
  aspect-ratio: 1 / 1;
  background:
    linear-gradient(90deg, rgba(0,0,0,0.08) 1px, transparent 1px),
    linear-gradient(rgba(0,0,0,0.08) 1px, transparent 1px),
    #ffffff;
  background-size: 24px 24px;
  border: 2px inset #dfdfdf;
  overflow: hidden;

  ${gammaDickswordScope} & {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.22);
    border-radius: 6px;
  }
`;

const AvatarLayer = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: auto;
`;

const LayerGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  margin-top: 12px;
`;

const LayerToggle = styled.label<{ $disabled?: boolean }>`
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px;
  background: #d8d8d8;
  border: 2px outset #ffffff;
  opacity: ${(p) => (p.$disabled ? 0.45 : 1)};
  font-size: 12px;

  ${gammaDickswordScope} & {
    background: rgba(242, 234, 217, 0.06);
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    color: #f2ead9;
  }
`;

const AdminGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
`;

const Field = styled.label`
  display: grid;
  gap: 4px;
  color: #101010;
  font-size: 11px;

  ${gammaDickswordScope} & {
    color: #f2ead9;
  }

  ${gammaDickswordScope} & select {
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.22);
    border-radius: 5px;
    color: #f2ead9;
    min-height: 32px;
  }
`;

const Tiny = styled.span`
  color: #505050;
  font-size: 11px;

  ${gammaDickswordScope} & {
    color: rgba(242, 234, 217, 0.58);
  }
`;

const LoadingPanel = styled(Panel).attrs({ variant: "well" })`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;

  ${gammaDickswordScope} & {
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    box-shadow: none;
    color: #f2ead9;
  }
`;

const FormBreak = styled(Separator)`
  margin: 12px 0;
`;

function fmtDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isStaffRole(role: string | undefined) {
  return role === "admin" || role === "host" || role === "cohost";
}

export function Dicksword() {
  const { user } = useAuth();
  const presentation = usePresentationShell();
  const qc = useQueryClient();
  const [claimCode, setClaimCode] = useState<string | null>(null);
  const [layerForm, setLayerForm] = useState({
    label: "",
    key: "",
    layerType: "accessory",
    stackOrder: 10,
    assetUrl: "",
    enabled: true,
  });
  const [roleForm, setRoleForm] = useState({
    label: "",
    key: "",
    roleId: "",
    roleKind: "custom",
    protected: false,
    managed: true,
  });
  const [conflictForm, setConflictForm] = useState({
    layerId: 0,
    conflictsWithLayerId: 0,
    reason: "",
  });

  const configQuery = useQuery({
    queryKey: ["dicksword", "config"],
    queryFn: () => api.get<DickswordConfig>("/api/dicksword/config"),
  });
  const meQuery = useQuery({
    queryKey: ["dicksword", "me"],
    queryFn: () => api.get<DickswordMe>("/api/dicksword/me"),
    refetchInterval: 10_000,
  });

  const selectedLayerIds = useMemo(
    () => new Set(meQuery.data?.avatar.selections.map((s) => s.layerId) ?? []),
    [meQuery.data?.avatar.selections]
  );

  const selectedLayers = useMemo(() => {
    const layers = meQuery.data?.avatar.layers ?? [];
    return layers
      .filter((layer) => selectedLayerIds.has(layer.id))
      .sort((a, b) => a.stackOrder - b.stackOrder || a.label.localeCompare(b.label));
  }, [meQuery.data?.avatar.layers, selectedLayerIds]);

  const blockedLayerIds = useMemo(() => {
    const blocked = new Set<number>();
    for (const conflict of meQuery.data?.avatar.conflicts ?? []) {
      if (selectedLayerIds.has(conflict.layerId)) blocked.add(conflict.conflictsWithLayerId);
      if (selectedLayerIds.has(conflict.conflictsWithLayerId)) blocked.add(conflict.layerId);
    }
    return blocked;
  }, [meQuery.data?.avatar.conflicts, selectedLayerIds]);

  const createClaim = useMutation({
    mutationFn: () =>
      api.post<{ code: string; expiresAt: string; command: string }>("/api/dicksword/claims"),
    onSuccess: (data) => {
      setClaimCode(data.code);
      qc.invalidateQueries({ queryKey: ["dicksword", "me"] });
    },
  });

  const saveSelection = useMutation({
    mutationFn: (layerIds: number[]) =>
      api.put("/api/dicksword/avatar/selection", { layerIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dicksword", "me"] }),
  });

  const createLayer = useMutation({
    mutationFn: () => api.post("/api/dicksword/admin/avatar-layers", layerForm),
    onSuccess: () => {
      setLayerForm({
        label: "",
        key: "",
        layerType: "accessory",
        stackOrder: 10,
        assetUrl: "",
        enabled: true,
      });
      qc.invalidateQueries({ queryKey: ["dicksword", "me"] });
    },
  });

  const createRole = useMutation({
    mutationFn: () => api.post("/api/dicksword/admin/role-mappings", roleForm),
    onSuccess: () => {
      setRoleForm({
        label: "",
        key: "",
        roleId: "",
        roleKind: "custom",
        protected: false,
        managed: true,
      });
      qc.invalidateQueries({ queryKey: ["dicksword", "me"] });
    },
  });
  const createConflict = useMutation({
    mutationFn: () =>
      api.post("/api/dicksword/admin/avatar-conflicts", {
        ...conflictForm,
        reason: conflictForm.reason || null,
      }),
    onSuccess: () => {
      setConflictForm({ layerId: 0, conflictsWithLayerId: 0, reason: "" });
      qc.invalidateQueries({ queryKey: ["dicksword", "me"] });
    },
  });

  const me = meQuery.data;
  const config = configQuery.data;
  const canAdmin = isStaffRole(user?.role);

  if (meQuery.isLoading) {
    return (
      <AppWindow title="Dicksword">
        <Shell
          data-dicksword-presentation-host={presentation.host}
          data-dicksword-surface="true"
        >
          <LoadingPanel>
            <Hourglass size={32} /> Loading Dicksword...
          </LoadingPanel>
        </Shell>
      </AppWindow>
    );
  }

  return (
    <AppWindow title="Dicksword">
      <Shell
        data-dicksword-presentation-host={presentation.host}
        data-dicksword-surface="true"
      >
        <Header data-dicksword-region="header">
          <div>
            <Title>Dicksword</Title>
            <Muted>
              Discord-native gameshow activity mirrored into WTF. Connect by OAuth
              when you want the easy path, or prove your account from Discord when
              you want to stay native.
            </Muted>
          </div>
          <StatusBlock data-dicksword-region="status">
            <div>Guild: {config?.guildId ?? "not configured"}</div>
            <div>
              Discord:{" "}
              {me?.user?.discordVerified
                ? `linked as ${me.user.discordHandle}`
                : "not linked"}
            </div>
            <div>
              XP: {me?.user?.experiencePoints ?? 0} ({me?.user?.xpTier.label ?? "Newcomer"})
            </div>
          </StatusBlock>
        </Header>

        <Layout>
          <div>
            <Section>
              <SectionTitle>Connect Identity</SectionTitle>
              <Muted>
                OAuth links your current browser session. Proof codes let a
                Discord user claim this WTF account without granting OAuth.
              </Muted>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button
                  disabled={!config?.oauthConfigured}
                  onClick={() => window.location.assign("/api/auth/discord")}
                >
                  Connect Discord OAuth
                </Button>
                <Button
                  disabled={createClaim.isPending}
                  onClick={() => createClaim.mutate()}
                >
                  Generate Proof Code
                </Button>
              </div>
              {claimCode && (
                <p>
                  Run <Command>/wtf prove {claimCode}</Command> in the WTF server.
                </p>
              )}
              {me?.activeClaim && !claimCode && (
                <Muted>
                  A proof code is already pending until {fmtDate(me.activeClaim.expiresAt)}.
                  Generate a new one if it was lost.
                </Muted>
              )}
              {config?.inviteUrl && (
                <p>
                  <Button onClick={() => window.open(config.inviteUrl!, "_blank")}>
                    Open WTF Discord
                  </Button>
                </p>
              )}
            </Section>

            <Section>
              <SectionTitle>Slash Commands</SectionTitle>
              {(config?.commands ?? []).map((cmd) => (
                <div key={cmd}>
                  <Command>{cmd}</Command>
                </div>
              ))}
            </Section>

            <Section>
              <SectionTitle>Role Sync Preview</SectionTitle>
              <Muted>
                Managed roles are additive and scoped. Protected mappings are
                documented here so the bot can skip admin, host, and moderation
                power without guessing.
              </Muted>
              {(me?.roleMappings ?? []).slice(0, 8).map((role) => (
                <ActivityRow key={role.id}>
                  <span>{role.roleKind}</span>
                  <span>{role.label}</span>
                  <Tiny>{role.protected ? "protected" : role.managed ? "managed" : "manual"}</Tiny>
                </ActivityRow>
              ))}
            </Section>
          </div>

          <div>
            <Section>
              <SectionTitle>Avatar Composer</SectionTitle>
              <Muted>
                Layers render by stack order. Conflicting accessories are blocked
                before saving so paper-doll combinations do not misprint.
              </Muted>
              <AvatarStage data-dicksword-region="avatar-stage">
                {selectedLayers.map((layer) => (
                  <AvatarLayer key={layer.id} src={layer.assetUrl} alt={layer.label} />
                ))}
              </AvatarStage>
              <LayerGrid>
                {(me?.avatar.layers ?? []).map((layer) => {
                  const checked = selectedLayerIds.has(layer.id);
                  const blocked = !checked && blockedLayerIds.has(layer.id);
                  return (
                    <LayerToggle key={layer.id} $disabled={!layer.enabled || blocked}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!layer.enabled || blocked || saveSelection.isPending}
                        onChange={() => {
                          const next = new Set(selectedLayerIds);
                          if (checked) next.delete(layer.id);
                          else next.add(layer.id);
                          saveSelection.mutate([...next]);
                        }}
                      />
                      <span>
                        {layer.label}
                        <br />
                        <Tiny>
                          {layer.layerType} / stack {layer.stackOrder}
                          {blocked ? " / conflict" : ""}
                        </Tiny>
                      </span>
                    </LayerToggle>
                  );
                })}
              </LayerGrid>
            </Section>

            <Section>
              <SectionTitle>Discord Activity</SectionTitle>
              {(me?.activity ?? []).length === 0 ? (
                <Muted>No mirrored Discord activity yet.</Muted>
              ) : (
                me!.activity.map((event) => (
                  <ActivityRow key={event.id}>
                    <span>{fmtDate(event.observedAt)}</span>
                    <span>
                      {event.kind}:{event.action}
                      {event.discordHandle ? ` by ${event.discordHandle}` : ""}
                    </span>
                    <Tiny>
                      {event.xpAmount > 0
                        ? event.xpAwardedAt
                          ? `+${event.xpAmount} XP`
                          : `${event.xpAmount} XP ready`
                        : "signal"}
                    </Tiny>
                  </ActivityRow>
                ))
              )}
            </Section>

            {canAdmin && (
              <Section>
                <SectionTitle>Admin Setup</SectionTitle>
                <Muted>
                  Add avatar layer metadata and role mappings here. Live Discord
                  server mutation remains a separate approved deploy step.
                </Muted>
                <Muted>
                  Asset skeleton: drop transparent PNGs into{" "}
                  <Command>{config?.avatarAssetBasePath ?? "/dicksword/avatar-assets"}</Command>{" "}
                  and register them below. Example URL:{" "}
                  <Command>
                    {(config?.avatarAssetBasePath ?? "/dicksword/avatar-assets") +
                      "/accessories/example-hat.png"}
                  </Command>
                </Muted>
                <AdminGrid>
                  <Field>
                    Layer label
                    <TextInput
                      value={layerForm.label}
                      onChange={(e: any) =>
                        setLayerForm((f) => ({ ...f, label: e.target.value }))
                      }
                    />
                  </Field>
                  <Field>
                    Optional key
                    <TextInput
                      value={layerForm.key}
                      onChange={(e: any) =>
                        setLayerForm((f) => ({ ...f, key: e.target.value }))
                      }
                    />
                  </Field>
                  <Field>
                    Layer type
                    <select
                      value={layerForm.layerType}
                      onChange={(e) =>
                        setLayerForm((f) => ({ ...f, layerType: e.target.value }))
                      }
                    >
                      <option value="base">base</option>
                      <option value="accessory">accessory</option>
                    </select>
                  </Field>
                  <Field>
                    Stack order
                    <TextInput
                      value={String(layerForm.stackOrder)}
                      onChange={(e: any) =>
                        setLayerForm((f) => ({
                          ...f,
                          stackOrder: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  </Field>
                  <Field style={{ gridColumn: "1 / -1" }}>
                    PNG asset URL
                    <TextInput
                      value={layerForm.assetUrl}
                      onChange={(e: any) =>
                        setLayerForm((f) => ({ ...f, assetUrl: e.target.value }))
                      }
                    />
                  </Field>
                  <Checkbox
                    label="Enabled"
                    checked={layerForm.enabled}
                    onChange={() =>
                      setLayerForm((f) => ({ ...f, enabled: !f.enabled }))
                    }
                  />
                </AdminGrid>
                <p>
                  <Button
                    disabled={!layerForm.label || !layerForm.assetUrl || createLayer.isPending}
                    onClick={() => createLayer.mutate()}
                  >
                    Add Avatar Layer
                  </Button>
                </p>

                <FormBreak />

                <AdminGrid>
                  <Field>
                    Conflict layer
                    <select
                      value={conflictForm.layerId}
                      onChange={(e) =>
                        setConflictForm((f) => ({
                          ...f,
                          layerId: Number(e.target.value),
                        }))
                      }
                    >
                      <option value={0}>Select layer</option>
                      {(me?.avatar.layers ?? []).map((layer) => (
                        <option key={layer.id} value={layer.id}>
                          {layer.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field>
                    Conflicts with
                    <select
                      value={conflictForm.conflictsWithLayerId}
                      onChange={(e) =>
                        setConflictForm((f) => ({
                          ...f,
                          conflictsWithLayerId: Number(e.target.value),
                        }))
                      }
                    >
                      <option value={0}>Select layer</option>
                      {(me?.avatar.layers ?? []).map((layer) => (
                        <option key={layer.id} value={layer.id}>
                          {layer.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field>
                    Reason
                    <TextInput
                      value={conflictForm.reason}
                      onChange={(e: any) =>
                        setConflictForm((f) => ({ ...f, reason: e.target.value }))
                      }
                    />
                  </Field>
                </AdminGrid>
                <p>
                  <Button
                    disabled={
                      !conflictForm.layerId ||
                      !conflictForm.conflictsWithLayerId ||
                      conflictForm.layerId === conflictForm.conflictsWithLayerId ||
                      createConflict.isPending
                    }
                    onClick={() => createConflict.mutate()}
                  >
                    Add Layer Conflict
                  </Button>
                </p>

                <FormBreak />

                <AdminGrid>
                  <Field>
                    Role label
                    <TextInput
                      value={roleForm.label}
                      onChange={(e: any) =>
                        setRoleForm((f) => ({ ...f, label: e.target.value }))
                      }
                    />
                  </Field>
                  <Field>
                    Role ID
                    <TextInput
                      value={roleForm.roleId}
                      onChange={(e: any) =>
                        setRoleForm((f) => ({ ...f, roleId: e.target.value }))
                      }
                    />
                  </Field>
                  <Field>
                    Kind
                    <TextInput
                      value={roleForm.roleKind}
                      onChange={(e: any) =>
                        setRoleForm((f) => ({ ...f, roleKind: e.target.value }))
                      }
                    />
                  </Field>
                  <Field>
                    Optional key
                    <TextInput
                      value={roleForm.key}
                      onChange={(e: any) =>
                        setRoleForm((f) => ({ ...f, key: e.target.value }))
                      }
                    />
                  </Field>
                  <Checkbox
                    label="Managed by bot"
                    checked={roleForm.managed}
                    onChange={() =>
                      setRoleForm((f) => ({ ...f, managed: !f.managed }))
                    }
                  />
                  <Checkbox
                    label="Protected role"
                    checked={roleForm.protected}
                    onChange={() =>
                      setRoleForm((f) => ({ ...f, protected: !f.protected }))
                    }
                  />
                </AdminGrid>
                <p>
                  <Button
                    disabled={!roleForm.label || !roleForm.roleId || createRole.isPending}
                    onClick={() => createRole.mutate()}
                  >
                    Add Role Mapping
                  </Button>
                </p>
              </Section>
            )}
          </div>
        </Layout>
      </Shell>
    </AppWindow>
  );
}
