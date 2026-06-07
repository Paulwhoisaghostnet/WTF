import { Select, TextInput } from "react95";
import styled from "styled-components";
import { UiButton } from "../../../components/wtfos-ui";
import type {
  ChallengeBuilderState,
  RewardActionDefinition,
  RewardActionDraft,
} from "./types";
import { newRewardActionDraft } from "./builder-utils";

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--wtf-space-2, 8px);
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(180px, 1fr) repeat(3, minmax(110px, 0.7fr)) auto;
  gap: var(--wtf-space-2, 8px);
  align-items: end;

  @media (max-width: 900px) {
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

function updateAction(
  state: ChallengeBuilderState,
  actionId: string,
  patch: Partial<RewardActionDraft>
): ChallengeBuilderState {
  return {
    ...state,
    rewardActions: state.rewardActions.map((action) =>
      action.id === actionId ? { ...action, ...patch } : action
    ),
  };
}

export function RewardActionBuilder({
  state,
  setState,
  rewardActions,
}: {
  state: ChallengeBuilderState;
  setState: (state: ChallengeBuilderState) => void;
  rewardActions: RewardActionDefinition[];
}) {
  return (
    <Stack>
      <div>
        <UiButton
          compact
          onClick={() =>
            setState({
              ...state,
              rewardActions: [...state.rewardActions, newRewardActionDraft()],
            })
          }
        >
          Add reward action
        </UiButton>
      </div>
      {state.rewardActions.map((action) => (
        <Row key={action.id}>
          <Field>
            Action
            <Select
              value={action.key}
              onChange={(event: any) =>
                setState(updateAction(state, action.id, { key: String(event.value) }))
              }
              options={rewardActions.map((rewardAction) => ({
                label: rewardAction.label,
                value: rewardAction.key,
              }))}
              width={220}
            />
          </Field>
          {action.key === "award_exp" && (
            <>
              <Field>
                EXP
                <TextInput
                  value={action.amount}
                  onChange={(event: any) =>
                    setState(updateAction(state, action.id, { amount: event.target.value }))
                  }
                />
              </Field>
              <Field>
                Reason
                <TextInput
                  value={action.reason}
                  onChange={(event: any) =>
                    setState(updateAction(state, action.id, { reason: event.target.value }))
                  }
                />
              </Field>
            </>
          )}
          {action.key === "queue_wtf_reward" && (
            <>
              <Field>
                WTF
                <TextInput
                  value={action.amountWtf}
                  onChange={(event: any) =>
                    setState(
                      updateAction(state, action.id, {
                        amountWtf: event.target.value,
                      })
                    )
                  }
                />
              </Field>
              <Field>
                Reason
                <TextInput
                  value={action.reason}
                  onChange={(event: any) =>
                    setState(updateAction(state, action.id, { reason: event.target.value }))
                  }
                />
              </Field>
            </>
          )}
          {action.key === "unlock_inventory_item" && (
            <>
              <Field>
                SKU
                <TextInput
                  value={action.sku}
                  onChange={(event: any) =>
                    setState(updateAction(state, action.id, { sku: event.target.value }))
                  }
                />
              </Field>
              <Field>
                Qty
                <TextInput
                  value={action.quantity}
                  onChange={(event: any) =>
                    setState(
                      updateAction(state, action.id, {
                        quantity: event.target.value,
                      })
                    )
                  }
                />
              </Field>
            </>
          )}
          {action.key === "create_notification" && (
            <>
              <Field>
                Title
                <TextInput
                  value={action.title}
                  onChange={(event: any) =>
                    setState(updateAction(state, action.id, { title: event.target.value }))
                  }
                />
              </Field>
              <Field>
                Body
                <TextInput
                  value={action.body}
                  onChange={(event: any) =>
                    setState(updateAction(state, action.id, { body: event.target.value }))
                  }
                />
              </Field>
            </>
          )}
          <UiButton
            compact
            disabled={state.rewardActions.length <= 1}
            aria-label={`Remove reward action ${action.id}`}
            onClick={() =>
              setState({
                ...state,
                rewardActions: state.rewardActions.filter((item) => item.id !== action.id),
              })
            }
          >
            Remove reward action
          </UiButton>
        </Row>
      ))}
    </Stack>
  );
}
