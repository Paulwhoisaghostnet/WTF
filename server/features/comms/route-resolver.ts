import { eq } from "drizzle-orm";
import { db } from "../../db";
import { communicationItems } from "@shared/schema";
import type { CommunicationRouteTarget } from "@shared/comms";
import { resolveBrowserUrlPolicy } from "../browser/policy";

export async function resolveCommunicationRouteTarget(
  itemId: number
): Promise<CommunicationRouteTarget> {
  const [item] = await db
    .select({
      id: communicationItems.id,
      title: communicationItems.title,
      routePath: communicationItems.routePath,
      originUrl: communicationItems.originUrl,
    })
    .from(communicationItems)
    .where(eq(communicationItems.id, itemId))
    .limit(1);

  if (!item) {
    return {
      itemId,
      mode: "missing",
      label: "Missing item",
      routePath: null,
      externalUrl: null,
      reason: "communication_item_not_found",
    };
  }

  if (item.routePath) {
    return {
      itemId,
      mode: "wtf_route",
      label: item.title,
      routePath: item.routePath,
      externalUrl: null,
    };
  }

  if (item.originUrl) {
    const policy = resolveBrowserUrlPolicy(item.originUrl);
    if (policy.allowed) {
      return {
        itemId,
        mode: "approved_external",
        label: item.title,
        routePath: `/browser?url=${encodeURIComponent(policy.url)}`,
        externalUrl: policy.url,
      };
    }
    return {
      itemId,
      mode: "blocked",
      label: item.title,
      routePath: null,
      externalUrl: null,
      reason: policy.reason ?? "browser_policy_blocked",
    };
  }

  return {
    itemId,
    mode: "blocked",
    label: item.title,
    routePath: null,
    externalUrl: null,
    reason: "no_route_or_origin",
  };
}
