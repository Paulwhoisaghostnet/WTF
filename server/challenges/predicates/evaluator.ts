import { and, eq, gte, inArray, sql } from "drizzle-orm";
import {
  challengeAutomationCompletions,
  challengeSystemEvents,
  users,
} from "@shared/schema";
import { db } from "../../db";
import type {
  ConditionTree,
  EventConditionFilters,
  EventConditionNode,
  PredicateConditionNode,
} from "../events/types";
import { verifyTezosOwnership } from "./ownership";

export interface EvaluationContext {
  challengeId: number;
  userId: number;
  walletAddress?: string | null;
  challengeStartTime?: Date | null;
  challengeEndTime?: Date | null;
  now?: Date;
  completionKey?: string;
}

export interface EvaluationResult {
  satisfied: boolean;
  satisfiedConditionIds: string[];
  countedEvents: Record<string, number>;
  predicateResults: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function secondsForWindow(window?: EventConditionNode["window"]) {
  if (!window) return null;
  const amount = Number(window.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (window.unit === "minute") return amount * 60;
  if (window.unit === "hour") return amount * 60 * 60;
  if (window.unit === "day") return amount * 24 * 60 * 60;
  return null;
}

function eventTimeFloor(
  condition: EventConditionNode,
  context: EvaluationContext
) {
  const now = context.now ?? new Date();
  const floors = [context.challengeStartTime ?? null].filter(
    (value): value is Date => value instanceof Date
  );
  const windowSeconds = secondsForWindow(condition.window);
  if (windowSeconds) {
    floors.push(new Date(now.getTime() - windowSeconds * 1000));
  }
  if (floors.length === 0) return null;
  return new Date(Math.max(...floors.map((date) => date.getTime())));
}

function metadataFilterSql(filters?: EventConditionFilters) {
  if (!filters?.metadata) return [];
  return Object.entries(filters.metadata).map(([key, value]) => {
    if (value === null) {
      return sql`${challengeSystemEvents.metadata}->>${key} IS NULL`;
    }
    return sql`${challengeSystemEvents.metadata}->>${key} = ${String(value)}`;
  });
}

async function countMatchingEvents(
  condition: EventConditionNode,
  context: EvaluationContext
) {
  const filters = condition.filters ?? {};
  const where = [
    eq(challengeSystemEvents.userId, context.userId),
    inArray(challengeSystemEvents.eventType, condition.eventTypes),
    ...metadataFilterSql(filters),
  ];

  if (filters.source) where.push(eq(challengeSystemEvents.source, filters.source));
  if (filters.sourceModule) {
    where.push(eq(challengeSystemEvents.sourceModule, filters.sourceModule));
  }
  if (filters.walletAddress) {
    where.push(eq(challengeSystemEvents.walletAddress, filters.walletAddress));
  }
  if (filters.rawRefType) {
    where.push(eq(challengeSystemEvents.rawRefType, filters.rawRefType));
  }
  if (filters.rawRefId !== undefined && filters.rawRefId !== null) {
    where.push(eq(challengeSystemEvents.rawRefId, String(filters.rawRefId)));
  }

  const floor = eventTimeFloor(condition, context);
  if (floor) where.push(gte(challengeSystemEvents.occurredAt, floor));
  if (context.challengeEndTime) {
    where.push(sql`${challengeSystemEvents.occurredAt} <= ${context.challengeEndTime}`);
  }

  const [{ count = 0 } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(challengeSystemEvents)
    .where(and(...where));
  return Number(count) || 0;
}

function compareCount(condition: EventConditionNode, count: number) {
  const threshold = Math.max(0, Math.floor(Number(condition.threshold ?? 1)));
  switch (condition.comparator) {
    case "exists":
      return count > 0;
    case "not_exists":
      return count === 0;
    case "count_gte":
      return count >= threshold;
    case "count_eq":
      return count === threshold;
    case "count_lte":
      return count <= threshold;
    default:
      return false;
  }
}

async function evaluateEventCondition(
  condition: EventConditionNode,
  context: EvaluationContext
): Promise<EvaluationResult> {
  const count = await countMatchingEvents(condition, context);
  const satisfied = compareCount(condition, count);
  return {
    satisfied,
    satisfiedConditionIds: satisfied ? [condition.id] : [],
    countedEvents: { [condition.id]: count },
    predicateResults: {},
  };
}

async function evaluatePredicateCondition(
  condition: PredicateConditionNode,
  context: EvaluationContext
): Promise<EvaluationResult> {
  const params = isRecord(condition.params) ? condition.params : {};
  let satisfied = false;
  let detail: unknown = null;

  switch (condition.predicateKey) {
    case "tezos.owns_any_token_from_contract":
    case "tezos.owns_contract": {
      const result = await verifyTezosOwnership("any_from_contract", {
        userId: context.userId,
        walletAddress: context.walletAddress,
        contractAddress: String(params.contractAddress ?? ""),
        contractAddresses: Array.isArray(params.contractAddresses)
          ? params.contractAddresses.map(String)
          : undefined,
        minimumQuantity: params.minimumQuantity as string | number | null,
      });
      satisfied = result.satisfied;
      detail = result;
      break;
    }
    case "tezos.owns_specific_token_id": {
      const result = await verifyTezosOwnership("specific_token_id", {
        userId: context.userId,
        walletAddress: context.walletAddress,
        contractAddress: String(params.contractAddress ?? ""),
        tokenId: String(params.tokenId ?? ""),
        minimumQuantity: params.minimumQuantity as string | number | null,
      });
      satisfied = result.satisfied;
      detail = result;
      break;
    }
    case "tezos.owns_minimum_quantity": {
      const result = await verifyTezosOwnership("minimum_quantity", {
        userId: context.userId,
        walletAddress: context.walletAddress,
        contractAddress: String(params.contractAddress ?? ""),
        tokenId: String(params.tokenId ?? ""),
        minimumQuantity: params.minimumQuantity as string | number | null,
      });
      satisfied = result.satisfied;
      detail = result;
      break;
    }
    case "tezos.owns_one_of_contracts": {
      const result = await verifyTezosOwnership("one_of_contracts", {
        userId: context.userId,
        walletAddress: context.walletAddress,
        contractAddresses: Array.isArray(params.contractAddresses)
          ? params.contractAddresses.map(String)
          : [],
        minimumQuantity: params.minimumQuantity as string | number | null,
      });
      satisfied = result.satisfied;
      detail = result;
      break;
    }
    case "tezos.owns_one_of_token_ids": {
      const result = await verifyTezosOwnership("one_of_token_ids", {
        userId: context.userId,
        walletAddress: context.walletAddress,
        contractAddress: String(params.contractAddress ?? ""),
        tokenIds: Array.isArray(params.tokenIds) ? params.tokenIds.map(String) : [],
        minimumQuantity: params.minimumQuantity as string | number | null,
      });
      satisfied = result.satisfied;
      detail = result;
      break;
    }
    case "tezos.owns_all_token_ids": {
      const result = await verifyTezosOwnership("all_token_ids", {
        userId: context.userId,
        walletAddress: context.walletAddress,
        contractAddress: String(params.contractAddress ?? ""),
        tokenIds: Array.isArray(params.tokenIds) ? params.tokenIds.map(String) : [],
        minimumQuantity: params.minimumQuantity as string | number | null,
      });
      satisfied = result.satisfied;
      detail = result;
      break;
    }
    case "user.has_role": {
      const role = String(params.role ?? "");
      const [row] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, context.userId))
        .limit(1);
      satisfied = Boolean(row && row.role === role);
      detail = { role: row?.role ?? null, requiredRole: role };
      break;
    }
    case "user.is_contestant": {
      const [row] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, context.userId))
        .limit(1);
      satisfied = row?.role === "contestant";
      detail = { role: row?.role ?? null };
      break;
    }
    case "reward.not_already_claimed": {
      const key = context.completionKey ?? "default";
      const rows = await db
        .select({ id: challengeAutomationCompletions.id })
        .from(challengeAutomationCompletions)
        .where(
          and(
            eq(challengeAutomationCompletions.challengeId, context.challengeId),
            eq(challengeAutomationCompletions.userId, context.userId),
            eq(challengeAutomationCompletions.completionKey, key)
          )
        )
        .limit(1);
      satisfied = rows.length === 0;
      detail = { completionKey: key, alreadyClaimed: rows.length > 0 };
      break;
    }
    default:
      detail = { error: `Unknown predicate: ${condition.predicateKey}` };
      satisfied = false;
      break;
  }

  if (condition.comparator === "not_exists") {
    satisfied = !satisfied;
  }

  return {
    satisfied,
    satisfiedConditionIds: satisfied ? [condition.id] : [],
    countedEvents: {},
    predicateResults: { [condition.id]: detail },
  };
}

function mergeResults(results: EvaluationResult[], satisfied: boolean): EvaluationResult {
  return {
    satisfied,
    satisfiedConditionIds: results.flatMap((result) => result.satisfiedConditionIds),
    countedEvents: Object.assign({}, ...results.map((result) => result.countedEvents)),
    predicateResults: Object.assign(
      {},
      ...results.map((result) => result.predicateResults)
    ),
  };
}

export async function evaluateConditionTree(
  tree: unknown,
  context: EvaluationContext
): Promise<EvaluationResult> {
  if (!isRecord(tree)) {
    return {
      satisfied: false,
      satisfiedConditionIds: [],
      countedEvents: {},
      predicateResults: { root: { error: "Condition tree must be an object" } },
    };
  }

  const node = tree as unknown as ConditionTree;
  if (node.type === "group") {
    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length === 0) {
      return {
        satisfied: false,
        satisfiedConditionIds: [],
        countedEvents: {},
        predicateResults: {
          [node.id ?? "root"]: { error: "Group condition has no children" },
        },
      };
    }
    const results = [];
    for (const child of children) {
      results.push(await evaluateConditionTree(child, context));
    }
    const satisfied =
      node.operator === "any"
        ? results.some((result) => result.satisfied)
        : results.every((result) => result.satisfied);
    return mergeResults(results, satisfied);
  }

  if (node.type === "event") {
    if (!Array.isArray(node.eventTypes) || node.eventTypes.length === 0) {
      return {
        satisfied: false,
        satisfiedConditionIds: [],
        countedEvents: {},
        predicateResults: {
          [node.id]: { error: "Event condition must include eventTypes" },
        },
      };
    }
    return evaluateEventCondition(node, context);
  }

  if (node.type === "predicate") {
    return evaluatePredicateCondition(node, context);
  }

  return {
    satisfied: false,
    satisfiedConditionIds: [],
    countedEvents: {},
    predicateResults: { root: { error: "Unknown condition node type" } },
  };
}
