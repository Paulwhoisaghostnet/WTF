import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  TextInput,
  Select,
  Tabs,
  Tab,
  TabBody,
  Table,
  TableHead,
  TableRow,
  TableHeadCell,
  TableDataCell,
  TableBody,
  Hourglass,
  Separator,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
`;

const FormRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: flex-end;
`;

export function Admin() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);

  const { data: stats } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get<any>("/api/admin/stats"),
  });

  const { data: users } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.get<any[]>("/api/admin/users"),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      api.put(`/api/admin/users/${id}/role`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  // Season creation
  const [seasonForm, setSeasonForm] = useState({
    name: "",
    number: "",
    description: "",
  });
  const createSeasonMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/seasons", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seasons"] });
      setSeasonForm({ name: "", number: "", description: "" });
    },
  });

  // Round creation
  const [roundForm, setRoundForm] = useState({
    seasonId: "",
    name: "",
    number: "",
    description: "",
  });
  const { data: seasons } = useQuery({
    queryKey: ["seasons"],
    queryFn: () => api.get<any[]>("/api/seasons"),
  });
  const createRoundMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/rounds", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rounds"] }),
  });

  // Challenge creation
  const [challengeForm, setChallengeForm] = useState({
    roundId: "",
    title: "",
    description: "",
    criteria: "",
    rules: "",
    rewardAmountWtf: "",
    status: "draft",
  });
  const { data: rounds } = useQuery({
    queryKey: ["rounds"],
    queryFn: () => api.get<any[]>("/api/rounds"),
  });
  const createChallengeMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/challenges", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges"] });
      setChallengeForm({
        roundId: "",
        title: "",
        description: "",
        criteria: "",
        rules: "",
        rewardAmountWtf: "",
        status: "draft",
      });
    },
  });

  // Channel creation
  const [channelForm, setChannelForm] = useState({
    name: "",
    description: "",
    type: "async",
    accessLevel: "all",
  });
  const createChannelMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/channels", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
      setChannelForm({ name: "", description: "", type: "async", accessLevel: "all" });
    },
  });

  return (
    <AppWindow title="Admin Panel">
      {stats && (
        <GroupBox label="Overview" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 24 }}>
            <span>Users: <strong>{stats.users}</strong></span>
            <span>Seasons: <strong>{stats.seasons}</strong></span>
            <span>Rounds: <strong>{stats.rounds}</strong></span>
            <span>Challenges: <strong>{stats.challenges}</strong></span>
          </div>
        </GroupBox>
      )}

      <Tabs value={activeTab} onChange={(v: number) => setActiveTab(v)}>
        <Tab value={0}>Users</Tab>
        <Tab value={1}>Seasons</Tab>
        <Tab value={2}>Rounds</Tab>
        <Tab value={3}>Challenges</Tab>
        <Tab value={4}>Channels</Tab>
      </Tabs>

      <TabBody>
        {activeTab === 0 && (
          <>
            <h3>Manage Users</h3>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Username</TableHeadCell>
                  <TableHeadCell>Display Name</TableHeadCell>
                  <TableHeadCell>Role</TableHeadCell>
                  <TableHeadCell>Actions</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users?.map((u: any) => (
                  <TableRow key={u.id}>
                    <TableDataCell>{u.username}</TableDataCell>
                    <TableDataCell>{u.displayName || "---"}</TableDataCell>
                    <TableDataCell>{u.role}</TableDataCell>
                    <TableDataCell>
                      <Select
                        value={u.role}
                        onChange={(e: any) =>
                          updateRoleMutation.mutate({
                            id: u.id,
                            role: e.value,
                          })
                        }
                        options={[
                          { label: "Host", value: "host" },
                          { label: "Cohost", value: "cohost" },
                          { label: "Contestant", value: "contestant" },
                          { label: "Witness", value: "witness" },
                        ]}
                        width={130}
                      />
                    </TableDataCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}

        {activeTab === 1 && (
          <>
            <h3>Create Season</h3>
            <GroupBox label="New Season">
              <Field>
                <label>Name</label>
                <TextInput
                  value={seasonForm.name}
                  onChange={(e: any) =>
                    setSeasonForm((f) => ({ ...f, name: e.target.value }))
                  }
                  fullWidth
                />
              </Field>
              <Field>
                <label>Number</label>
                <TextInput
                  value={seasonForm.number}
                  onChange={(e: any) =>
                    setSeasonForm((f) => ({ ...f, number: e.target.value }))
                  }
                  fullWidth
                />
              </Field>
              <Field>
                <label>Description</label>
                <TextInput
                  value={seasonForm.description}
                  onChange={(e: any) =>
                    setSeasonForm((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                  multiline
                  fullWidth
                />
              </Field>
              <Button
                onClick={() =>
                  createSeasonMutation.mutate({
                    name: seasonForm.name,
                    number: parseInt(seasonForm.number),
                    description: seasonForm.description,
                  })
                }
                disabled={createSeasonMutation.isPending}
              >
                Create Season
              </Button>
            </GroupBox>
          </>
        )}

        {activeTab === 2 && (
          <>
            <h3>Create Round</h3>
            <GroupBox label="New Round">
              <Field>
                <label>Season</label>
                <Select
                  value={parseInt(roundForm.seasonId) || undefined}
                  onChange={(e: any) =>
                    setRoundForm((f) => ({
                      ...f,
                      seasonId: String(e.value),
                    }))
                  }
                  options={
                    seasons?.map((s: any) => ({
                      label: `Season ${s.number}: ${s.name}`,
                      value: s.id,
                    })) || []
                  }
                  width={300}
                />
              </Field>
              <Field>
                <label>Name</label>
                <TextInput
                  value={roundForm.name}
                  onChange={(e: any) =>
                    setRoundForm((f) => ({ ...f, name: e.target.value }))
                  }
                  fullWidth
                />
              </Field>
              <Field>
                <label>Number</label>
                <TextInput
                  value={roundForm.number}
                  onChange={(e: any) =>
                    setRoundForm((f) => ({ ...f, number: e.target.value }))
                  }
                  fullWidth
                />
              </Field>
              <Button
                onClick={() =>
                  createRoundMutation.mutate({
                    seasonId: parseInt(roundForm.seasonId),
                    name: roundForm.name,
                    number: parseInt(roundForm.number),
                    description: roundForm.description,
                  })
                }
                disabled={createRoundMutation.isPending}
              >
                Create Round
              </Button>
            </GroupBox>
          </>
        )}

        {activeTab === 3 && (
          <>
            <h3>Create Challenge</h3>
            <GroupBox label="New Challenge">
              <Field>
                <label>Round (optional)</label>
                <Select
                  value={parseInt(challengeForm.roundId) || undefined}
                  onChange={(e: any) =>
                    setChallengeForm((f) => ({
                      ...f,
                      roundId: String(e.value),
                    }))
                  }
                  options={[
                    { label: "No round", value: 0 },
                    ...(rounds?.map((r: any) => ({
                      label: `Round ${r.number}: ${r.name}`,
                      value: r.id,
                    })) || []),
                  ]}
                  width={300}
                />
              </Field>
              <Field>
                <label>Title</label>
                <TextInput
                  value={challengeForm.title}
                  onChange={(e: any) =>
                    setChallengeForm((f) => ({
                      ...f,
                      title: e.target.value,
                    }))
                  }
                  fullWidth
                />
              </Field>
              <Field>
                <label>Description</label>
                <TextInput
                  value={challengeForm.description}
                  onChange={(e: any) =>
                    setChallengeForm((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                  multiline
                  fullWidth
                />
              </Field>
              <Field>
                <label>Criteria</label>
                <TextInput
                  value={challengeForm.criteria}
                  onChange={(e: any) =>
                    setChallengeForm((f) => ({
                      ...f,
                      criteria: e.target.value,
                    }))
                  }
                  multiline
                  fullWidth
                />
              </Field>
              <Field>
                <label>Rules</label>
                <TextInput
                  value={challengeForm.rules}
                  onChange={(e: any) =>
                    setChallengeForm((f) => ({
                      ...f,
                      rules: e.target.value,
                    }))
                  }
                  multiline
                  fullWidth
                />
              </Field>
              <Field>
                <label>Reward (WTF)</label>
                <TextInput
                  value={challengeForm.rewardAmountWtf}
                  onChange={(e: any) =>
                    setChallengeForm((f) => ({
                      ...f,
                      rewardAmountWtf: e.target.value,
                    }))
                  }
                  fullWidth
                />
              </Field>
              <Field>
                <label>Status</label>
                <Select
                  value={challengeForm.status}
                  onChange={(e: any) =>
                    setChallengeForm((f) => ({ ...f, status: e.value }))
                  }
                  options={[
                    { label: "Draft", value: "draft" },
                    { label: "Active", value: "active" },
                  ]}
                  width={200}
                />
              </Field>
              <Button
                onClick={() =>
                  createChallengeMutation.mutate({
                    roundId: parseInt(challengeForm.roundId) || null,
                    title: challengeForm.title,
                    description: challengeForm.description,
                    criteria: challengeForm.criteria,
                    rules: challengeForm.rules,
                    rewardAmountWtf: parseInt(challengeForm.rewardAmountWtf) || 0,
                    status: challengeForm.status,
                  })
                }
                disabled={createChallengeMutation.isPending}
              >
                Create Challenge
              </Button>
            </GroupBox>
          </>
        )}

        {activeTab === 4 && (
          <>
            <h3>Create Channel</h3>
            <GroupBox label="New Channel">
              <Field>
                <label>Name</label>
                <TextInput
                  value={channelForm.name}
                  onChange={(e: any) =>
                    setChannelForm((f) => ({ ...f, name: e.target.value }))
                  }
                  fullWidth
                />
              </Field>
              <Field>
                <label>Description</label>
                <TextInput
                  value={channelForm.description}
                  onChange={(e: any) =>
                    setChannelForm((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                  fullWidth
                />
              </Field>
              <Field>
                <label>Type</label>
                <Select
                  value={channelForm.type}
                  onChange={(e: any) =>
                    setChannelForm((f) => ({ ...f, type: e.value }))
                  }
                  options={[
                    { label: "Async (Forum)", value: "async" },
                    { label: "Sync (Chat)", value: "sync" },
                  ]}
                  width={200}
                />
              </Field>
              <Field>
                <label>Access Level</label>
                <Select
                  value={channelForm.accessLevel}
                  onChange={(e: any) =>
                    setChannelForm((f) => ({ ...f, accessLevel: e.value }))
                  }
                  options={[
                    { label: "Everyone", value: "all" },
                    { label: "Contestants Only", value: "contestants" },
                    { label: "Hosts Only", value: "hosts" },
                  ]}
                  width={200}
                />
              </Field>
              <Button
                onClick={() => createChannelMutation.mutate(channelForm)}
                disabled={createChannelMutation.isPending}
              >
                Create Channel
              </Button>
            </GroupBox>
          </>
        )}
      </TabBody>
    </AppWindow>
  );
}
