import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Checkbox, GroupBox, Panel, Select, TextInput, Toolbar } from "react95";
import { ROLE_LABELS, ROLE_ORDER, type UserRole } from "@shared/types";
import { api } from "../../lib/api";
import {
  FormRow,
  MsgActBtn,
  PermTable,
  RoleGrid,
  SettingsBody,
  SettingsOverlay,
  SettingsTitleBar,
  SettingsWin,
} from "./BoardChrome";
import type { Channel, PermRow, WebhookRow } from "./types";
import { toggleInList } from "./utils";

const roleOptions = [...ROLE_ORDER];

interface BoardChannelSettingsProps {
  channel: Channel & { canPost: boolean; canManage: boolean };
  onClose: () => void;
}

export function BoardChannelSettings({
  channel,
  onClose,
}: BoardChannelSettingsProps) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"general" | "perms" | "webhooks">("general");

  const [title, setTitle] = useState(channel.title);
  const [topic, setTopic] = useState(channel.topic || "");
  const [chType, setChType] = useState(channel.channelType);
  const [slowMode, setSlowMode] = useState(channel.slowModeSeconds);
  const [vRoles, setVRoles] = useState<UserRole[]>(channel.viewRoles);
  const [rRoles, setRRoles] = useState<UserRole[]>(channel.replyRoles);

  const saveMut = useMutation({
    mutationFn: (payload: any) => api.put(`/api/board/channels/${channel.id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board"] });
      onClose();
    },
  });

  const { data: perms } = useQuery({
    queryKey: ["board", "perms", channel.id],
    queryFn: () => api.get<PermRow[]>(`/api/board/channels/${channel.id}/permissions`),
    enabled: tab === "perms",
  });

  const [newPermType, setNewPermType] = useState<"role" | "user">("role");
  const [newPermRole, setNewPermRole] = useState<UserRole>("witness");
  const [newPermUserId, setNewPermUserId] = useState("");

  const addPermMut = useMutation({
    mutationFn: (payload: any) =>
      api.post(`/api/board/channels/${channel.id}/permissions`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", "perms", channel.id] }),
  });

  const delPermMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/board/permissions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", "perms", channel.id] }),
  });

  const updatePermMut = useMutation({
    mutationFn: ({ id, ...payload }: any) => api.put(`/api/board/permissions/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", "perms", channel.id] }),
  });

  const { data: webhooks } = useQuery({
    queryKey: ["board", "webhooks", channel.id],
    queryFn: () => api.get<WebhookRow[]>(`/api/board/channels/${channel.id}/webhooks`),
    enabled: tab === "webhooks",
  });

  const [whName, setWhName] = useState("");
  const addWhMut = useMutation({
    mutationFn: () => api.post(`/api/board/channels/${channel.id}/webhooks`, { name: whName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", "webhooks", channel.id] });
      setWhName("");
    },
  });

  const delWhMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/board/webhooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", "webhooks", channel.id] }),
  });

  return (
    <SettingsOverlay onClick={onClose}>
      <SettingsWin onClick={(event) => event.stopPropagation()}>
        <SettingsTitleBar>
          <span>Channel Settings — #{channel.title}</span>
          <Button size="sm" onClick={onClose} style={{ fontSize: 10, padding: "1px 6px" }}>
            ✕
          </Button>
        </SettingsTitleBar>
        <Toolbar style={{ padding: "4px 8px", gap: 4 }}>
          <Button size="sm" active={tab === "general"} onClick={() => setTab("general")}>
            General
          </Button>
          <Button size="sm" active={tab === "perms"} onClick={() => setTab("perms")}>
            Permissions
          </Button>
          <Button size="sm" active={tab === "webhooks"} onClick={() => setTab("webhooks")}>
            Webhooks
          </Button>
        </Toolbar>
        <SettingsBody>
          {tab === "general" && (
            <>
              <FormRow>
                <label>Name</label>
                <TextInput
                  aria-label="Channel name"
                  value={title}
                  onChange={(event: any) => setTitle(event.target.value)}
                  fullWidth
                />
              </FormRow>
              <FormRow>
                <label>Topic</label>
                <TextInput
                  aria-label="Channel topic"
                  value={topic}
                  onChange={(event: any) => setTopic(event.target.value)}
                  fullWidth
                />
              </FormRow>
              <FormRow>
                <label>Type</label>
                <Select
                  aria-label="Channel type"
                  value={chType}
                  onChange={(event: any) => setChType(event.value)}
                  options={[
                    { label: "Text", value: "text" },
                    { label: "Announcements", value: "announcements" },
                    { label: "Forum", value: "forum" },
                  ]}
                  width={160}
                />
              </FormRow>
              <FormRow>
                <label>Slow Mode</label>
                <TextInput
                  aria-label="Slow mode seconds"
                  type="number"
                  value={String(slowMode)}
                  onChange={(event: any) =>
                    setSlowMode(Math.max(0, Number(event.target.value)))
                  }
                  style={{ width: 80 }}
                />
                <span style={{ fontSize: 11 }}>seconds (0 = off)</span>
              </FormRow>
              <GroupBox label="View Roles">
                <RoleGrid>
                  {roleOptions.map((role) => (
                    <Checkbox
                      key={role}
                      aria-label={`Allow ${ROLE_LABELS[role]} to view channel`}
                      label={ROLE_LABELS[role]}
                      checked={vRoles.includes(role)}
                      onChange={() => setVRoles((previous) => toggleInList(previous, role))}
                    />
                  ))}
                </RoleGrid>
              </GroupBox>
              <GroupBox label="Post Roles">
                <RoleGrid>
                  {roleOptions.map((role) => (
                    <Checkbox
                      key={role}
                      aria-label={`Allow ${ROLE_LABELS[role]} to post in channel`}
                      label={ROLE_LABELS[role]}
                      checked={rRoles.includes(role)}
                      onChange={() => setRRoles((previous) => toggleInList(previous, role))}
                    />
                  ))}
                </RoleGrid>
              </GroupBox>
              <div>
                <Button
                  onClick={() =>
                    saveMut.mutate({
                      title,
                      topic,
                      channelType: chType,
                      slowModeSeconds: slowMode,
                      viewRoles: vRoles,
                      replyRoles: rRoles,
                    })
                  }
                  disabled={!title.trim() || saveMut.isPending}
                >
                  Save Changes
                </Button>
              </div>
            </>
          )}

          {tab === "perms" && (
            <>
              <div style={{ fontSize: 11, color: "#555" }}>
                Per-channel overrides. <code>null</code> = inherit default.
                User-level overrides beat role-level.
              </div>
              {perms && perms.length > 0 && (
                <PermTable>
                  <thead>
                    <tr>
                      <th>Target</th>
                      <th>View</th>
                      <th>Post</th>
                      <th>Manage</th>
                      <th>React</th>
                      <th>Attach</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {perms.map((perm) => (
                      <tr key={perm.id}>
                        <td>
                          {perm.targetType === "role"
                            ? `Role: ${ROLE_LABELS[perm.targetRole as UserRole] ?? perm.targetRole}`
                            : `User: ${perm.targetDisplayName || perm.targetUsername || perm.targetUserId}`}
                        </td>
                        {(["allowView", "allowPost", "allowManage", "allowReact", "allowAttach"] as const).map(
                          (field) => (
                            <td key={field}>
                              <select
                                aria-label={`Set ${field} permission for ${
                                  perm.targetType === "role"
                                    ? ROLE_LABELS[perm.targetRole as UserRole] ?? perm.targetRole
                                    : perm.targetDisplayName || perm.targetUsername || perm.targetUserId
                                }`}
                                value={String(perm[field] ?? "null")}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  updatePermMut.mutate({
                                    id: perm.id,
                                    [field]: value === "null" ? null : value === "true",
                                  });
                                }}
                                style={{ fontSize: 10 }}
                              >
                                <option value="null">—</option>
                                <option value="true">✅</option>
                                <option value="false">❌</option>
                              </select>
                            </td>
                          )
                        )}
                        <td>
                          <MsgActBtn
                            aria-label={`Delete permission override for ${
                              perm.targetType === "role"
                                ? ROLE_LABELS[perm.targetRole as UserRole] ?? perm.targetRole
                                : perm.targetDisplayName || perm.targetUsername || perm.targetUserId
                            }`}
                            onClick={() => delPermMut.mutate(perm.id)}
                          >
                            ✕
                          </MsgActBtn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </PermTable>
              )}
              <GroupBox label="Add Override">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <Select
                    aria-label="Permission override target type"
                    value={newPermType}
                    onChange={(event: any) => setNewPermType(event.value)}
                    options={[
                      { label: "Role", value: "role" },
                      { label: "User", value: "user" },
                    ]}
                    width={100}
                  />
                  {newPermType === "role" ? (
                    <Select
                      aria-label="Permission override role"
                      value={newPermRole}
                      onChange={(event: any) => setNewPermRole(event.value)}
                      options={roleOptions.map((role) => ({
                        label: ROLE_LABELS[role],
                        value: role,
                      }))}
                      width={160}
                    />
                  ) : (
                    <TextInput
                      aria-label="Permission override user ID"
                      value={newPermUserId}
                      onChange={(event: any) => setNewPermUserId(event.target.value)}
                      placeholder="User ID"
                      style={{ width: 100 }}
                    />
                  )}
                  <Button
                    size="sm"
                    onClick={() =>
                      addPermMut.mutate({
                        targetType: newPermType,
                        targetRole: newPermType === "role" ? newPermRole : undefined,
                        targetUserId:
                          newPermType === "user" ? Number(newPermUserId) : undefined,
                      })
                    }
                  >
                    Add
                  </Button>
                </div>
              </GroupBox>
            </>
          )}

          {tab === "webhooks" && (
            <>
              <div style={{ fontSize: 11, color: "#555" }}>
                Incoming webhooks let external services post to this channel.
              </div>
              {webhooks?.map((webhook) => (
                <Panel key={webhook.id} variant="well" style={{ padding: 6, fontSize: 11 }}>
                  <div>
                    <strong>{webhook.name}</strong> by {webhook.creatorUsername}
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 10, wordBreak: "break-all" }}>
                    POST /api/board/webhook/{webhook.token}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Button size="sm" onClick={() => delWhMut.mutate(webhook.id)}>
                      Delete
                    </Button>
                  </div>
                </Panel>
              ))}
              <GroupBox label="New Webhook">
                <div style={{ display: "flex", gap: 6 }}>
                  <TextInput
                    aria-label="Webhook name"
                    value={whName}
                    onChange={(event: any) => setWhName(event.target.value)}
                    placeholder="Webhook name"
                    fullWidth
                  />
                  <Button
                    disabled={!whName.trim() || addWhMut.isPending}
                    onClick={() => addWhMut.mutate()}
                  >
                    Create
                  </Button>
                </div>
              </GroupBox>
            </>
          )}
        </SettingsBody>
      </SettingsWin>
    </SettingsOverlay>
  );
}
