import { Button, GroupBox, Select, TextInput } from "react95";
import styled from "styled-components";
import type {
  ChallengeAutomationRegistry,
  ChallengeBuilderState,
} from "./types";
import { buildChallengePayload, emptyBuilderState } from "./builder-utils";
import { ChallengePreview } from "./ChallengePreview";
import { ConditionBuilder } from "./ConditionBuilder";
import { RewardActionBuilder } from "./RewardActionBuilder";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
`;

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

export function ChallengeBuilder({
  state,
  setState,
  registry,
  onSubmit,
  isPending,
}: {
  state: ChallengeBuilderState;
  setState: (state: ChallengeBuilderState) => void;
  registry: ChallengeAutomationRegistry;
  onSubmit: (payload: Record<string, unknown>, id?: number | null) => void;
  isPending: boolean;
}) {
  const save = (status: string) => {
    try {
      const nextState = { ...state, status };
      const payload = buildChallengePayload(nextState, registry.triggers);
      onSubmit(payload, state.id);
      setState(nextState);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Invalid challenge definition");
    }
  };

  return (
    <GroupBox label={state.id ? "Edit Automation Challenge" : "Create Automation Challenge"}>
      <Stack>
        <Grid>
          <Field>
            Title
            <TextInput
              value={state.title}
              onChange={(event: any) => setState({ ...state, title: event.target.value })}
              fullWidth
            />
          </Field>
          <Field>
            Status
            <Select
              value={state.status}
              onChange={(event: any) => setState({ ...state, status: String(event.value) })}
              options={[
                { label: "Draft", value: "draft" },
                { label: "Active", value: "active" },
                { label: "Paused", value: "paused" },
                { label: "Completed", value: "completed" },
                { label: "Archived", value: "archived" },
              ]}
              width={180}
            />
          </Field>
          <Field>
            Repeat
            <Select
              value={state.repeatabilityMode}
              onChange={(event: any) =>
                setState({ ...state, repeatabilityMode: event.value })
              }
              options={[
                { label: "Once", value: "once" },
                { label: "Daily", value: "daily" },
                { label: "Weekly", value: "weekly" },
                { label: "Per event", value: "per_event" },
              ]}
              width={180}
            />
          </Field>
          <Field>
            Per-user limit
            <TextInput
              value={state.perUserCompletionLimit}
              onChange={(event: any) =>
                setState({ ...state, perUserCompletionLimit: event.target.value })
              }
            />
          </Field>
          <Field>
            Global limit
            <TextInput
              value={state.globalCompletionLimit}
              onChange={(event: any) =>
                setState({ ...state, globalCompletionLimit: event.target.value })
              }
            />
          </Field>
          <Field>
            Start
            <TextInput
              type="datetime-local"
              value={state.startTime}
              onChange={(event: any) =>
                setState({ ...state, startTime: event.target.value })
              }
            />
          </Field>
          <Field>
            End
            <TextInput
              type="datetime-local"
              value={state.endTime}
              onChange={(event: any) =>
                setState({ ...state, endTime: event.target.value })
              }
            />
          </Field>
        </Grid>

        <Field>
          Description
          <TextInput
            value={state.description}
            onChange={(event: any) =>
              setState({ ...state, description: event.target.value })
            }
            fullWidth
          />
        </Field>

        <GroupBox label="Conditions">
          <ConditionBuilder
            state={state}
            setState={setState}
            triggers={registry.triggers}
          />
        </GroupBox>

        <GroupBox label="Reward Actions">
          <RewardActionBuilder
            state={state}
            setState={setState}
            rewardActions={registry.rewardActions}
          />
        </GroupBox>

        <ChallengePreview state={state} triggers={registry.triggers} />

        <ActionRow>
          <Button onClick={() => save("draft")} disabled={isPending}>
            Save Draft
          </Button>
          <Button onClick={() => save("active")} disabled={isPending}>
            Activate
          </Button>
          <Button onClick={() => setState(emptyBuilderState())} disabled={isPending}>
            Clear
          </Button>
        </ActionRow>
      </Stack>
    </GroupBox>
  );
}
