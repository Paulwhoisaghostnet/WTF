import { Select, TextInput } from "react95";
import styled from "styled-components";
import { UiButton } from "../../../components/wtfos-ui";
import type { ChallengeBuilderState, ConditionDraft, TriggerDefinition } from "./types";
import { newConditionDraft } from "./builder-utils";
import { TriggerSelector } from "./TriggerSelector";

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--wtf-space-2, 8px);
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(230px, 1.4fr) minmax(130px, 0.8fr) repeat(3, minmax(100px, 0.7fr)) auto;
  gap: var(--wtf-space-2, 8px);
  align-items: end;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: var(--wtf-space-1, 4px);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  line-height: 1.3;
`;

const ActionRow = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
`;

const MatchLabel = styled.span`
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
`;

function updateCondition(
  state: ChallengeBuilderState,
  conditionId: string,
  patch: Partial<ConditionDraft>
): ChallengeBuilderState {
  return {
    ...state,
    conditions: state.conditions.map((condition) =>
      condition.id === conditionId ? { ...condition, ...patch } : condition
    ),
  };
}

function comparatorOptions(trigger?: TriggerDefinition) {
  const modes = trigger?.comparisonModes?.length
    ? trigger.comparisonModes
    : ["exists", "count_gte"];
  return modes.map((mode) => ({
    value: mode,
    label:
      mode === "count_gte"
        ? "count >="
        : mode === "count_eq"
          ? "count ="
          : mode === "count_lte"
            ? "count <="
            : mode.replace("_", " "),
  }));
}

export function ConditionBuilder({
  state,
  setState,
  triggers,
}: {
  state: ChallengeBuilderState;
  setState: (state: ChallengeBuilderState) => void;
  triggers: TriggerDefinition[];
}) {
  return (
    <Stack>
      <ActionRow>
        <MatchLabel>Match</MatchLabel>
        <Select
          value={state.groupOperator}
          onChange={(event: any) =>
            setState({ ...state, groupOperator: event.value === "any" ? "any" : "all" })
          }
          options={[
            { label: "ALL conditions", value: "all" },
            { label: "ANY condition", value: "any" },
          ]}
          width={180}
        />
        <UiButton
          compact
          onClick={() =>
            setState({ ...state, conditions: [...state.conditions, newConditionDraft()] })
          }
        >
          Add condition
        </UiButton>
      </ActionRow>

      {state.conditions.map((condition) => {
        const trigger = triggers.find((item) => item.key === condition.triggerKey);
        const isTezos = condition.triggerKey.startsWith("tezos.");
        return (
          <Row key={condition.id}>
            <Field>
              Trigger
              <TriggerSelector
                triggers={triggers}
                value={condition.triggerKey}
                onChange={(triggerKey) =>
                  setState(updateCondition(state, condition.id, { triggerKey }))
                }
              />
            </Field>
            {!isTezos && (
              <Field>
                Compare
                <Select
                  value={condition.comparator}
                  onChange={(event: any) =>
                    setState(
                      updateCondition(state, condition.id, {
                        comparator: String(event.value),
                      })
                    )
                  }
                  options={comparatorOptions(trigger)}
                  width={130}
                />
              </Field>
            )}
            {!isTezos && (
              <Field>
                Count
                <TextInput
                  value={condition.threshold}
                  onChange={(event: any) =>
                    setState(
                      updateCondition(state, condition.id, {
                        threshold: event.target.value,
                      })
                    )
                  }
                />
              </Field>
            )}
            {condition.triggerKey.includes("channel") && (
              <Field>
                Channel ID
                <TextInput
                  value={condition.channelId}
                  onChange={(event: any) =>
                    setState(
                      updateCondition(state, condition.id, {
                        channelId: event.target.value,
                      })
                    )
                  }
                />
              </Field>
            )}
            {condition.triggerKey === "desktop.pet.interacted" && (
              <Field>
                Action
                <TextInput
                  value={condition.action}
                  onChange={(event: any) =>
                    setState(
                      updateCondition(state, condition.id, {
                        action: event.target.value,
                      })
                    )
                  }
                />
              </Field>
            )}
            {condition.triggerKey === "desktop.object.clicked" && (
              <Field>
                Object ID
                <TextInput
                  value={condition.objectId}
                  onChange={(event: any) =>
                    setState(
                      updateCondition(state, condition.id, {
                        objectId: event.target.value,
                      })
                    )
                  }
                />
              </Field>
            )}
            {condition.triggerKey === "gameshow.round.joined" && (
              <Field>
                Round ID
                <TextInput
                  value={condition.roundId}
                  onChange={(event: any) =>
                    setState(
                      updateCondition(state, condition.id, {
                        roundId: event.target.value,
                      })
                    )
                  }
                />
              </Field>
            )}
            {trigger?.timingMode === "time_windowed" && (
              <Field>
                Window
                <ActionRow>
                  <TextInput
                    value={condition.windowAmount}
                    onChange={(event: any) =>
                      setState(
                        updateCondition(state, condition.id, {
                          windowAmount: event.target.value,
                        })
                      )
                    }
                    style={{ width: 72 }}
                  />
                  <Select
                    value={condition.windowUnit}
                    onChange={(event: any) =>
                      setState(
                        updateCondition(state, condition.id, {
                          windowUnit: event.value,
                        })
                      )
                    }
                    options={[
                      { label: "min", value: "minute" },
                      { label: "hour", value: "hour" },
                      { label: "day", value: "day" },
                    ]}
                    width={96}
                  />
                </ActionRow>
              </Field>
            )}
            {isTezos && (
              <>
                <Field>
                  Contract
                  <TextInput
                    value={condition.contractAddress}
                    onChange={(event: any) =>
                      setState(
                        updateCondition(state, condition.id, {
                          contractAddress: event.target.value,
                        })
                      )
                    }
                  />
                </Field>
                <Field>
                  Token ID
                  <TextInput
                    value={condition.tokenId}
                    onChange={(event: any) =>
                      setState(
                        updateCondition(state, condition.id, {
                          tokenId: event.target.value,
                        })
                      )
                    }
                  />
                </Field>
                <Field>
                  Min Qty
                  <TextInput
                    value={condition.minimumQuantity}
                    onChange={(event: any) =>
                      setState(
                        updateCondition(state, condition.id, {
                          minimumQuantity: event.target.value,
                        })
                      )
                    }
                  />
                </Field>
              </>
            )}
            <UiButton
              compact
              disabled={state.conditions.length <= 1}
              aria-label={`Remove condition ${condition.id}`}
              onClick={() =>
                setState({
                  ...state,
                  conditions: state.conditions.filter((item) => item.id !== condition.id),
                })
              }
            >
              Remove condition
            </UiButton>
          </Row>
        );
      })}
    </Stack>
  );
}
