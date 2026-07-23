import { Router } from "express";
import {
  DEFAULT_OBJKT_OPERATOR_SETTINGS,
  evaluateObjktCandidatePolicy,
  type ObjktCreatorReviewStatus,
  type ObjktOperatorSession,
  type ObjktOperatorSettings,
  type ObjktQueueStatus,
} from "@shared/objkt-operator";
import {
  isObjktOperatorOwner,
  requireObjktOperatorOwner,
} from "../features/objkt-operator/owner";
import {
  discoverObjktCreators,
  fetchObjktCreatorPortfolio,
  isObjktTezosAddress,
  scanObjktCreators,
} from "../features/objkt-operator/market";
import {
  appendOperatorEvent,
  loadObjktOperatorState,
  operatorEvent,
  patchObjktOperatorState,
} from "../features/objkt-operator/state";
import { listRolesForUserSnapshot } from "../lib/user-roles";

const router = Router();

// The shell uses this read-only probe to keep the private app out of other
// users' desktops without creating an operator state row as a side effect.
router.get("/api/objkt-operator/access", async (req, res) => {
  if (!req.isAuthenticated()) return res.json({ allowed: false });
  try {
    const user = req.user as { id?: number; username?: string | null };
    const roles = await listRolesForUserSnapshot(user as any);
    return res.json({ allowed: isObjktOperatorOwner(user, roles) });
  } catch (error) {
    console.error("[objkt-operator] access probe failed:", error);
    return res.json({ allowed: false });
  }
});

router.use("/api/objkt-operator", requireObjktOperatorOwner);

function routeUserId(req: any) {
  const userId = Number(req.user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("Invalid authenticated user");
  return userId;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

export function normalizeObjktOperatorSettings(
  input: Partial<ObjktOperatorSettings> | null | undefined,
  current: ObjktOperatorSettings = DEFAULT_OBJKT_OPERATOR_SETTINGS,
): ObjktOperatorSettings {
  return {
    spendCapXtz: Number(boundedNumber(input?.spendCapXtz, current.spendCapXtz, 0.1, 10_000).toFixed(3)),
    maxItemPriceXtz: Number(boundedNumber(input?.maxItemPriceXtz, current.maxItemPriceXtz, 0.1, 1_000).toFixed(3)),
    perCreatorLimit: Math.round(boundedNumber(input?.perCreatorLimit, current.perCreatorLimit, 3, 50)),
    walletReserveXtz: Number(boundedNumber(input?.walletReserveXtz, current.walletReserveXtz, 0, 1_000).toFixed(3)),
    minCandidateScore: Math.round(boundedNumber(input?.minCandidateScore, current.minCandidateScore, 0, 100)),
    minResaleConfidence: Math.round(boundedNumber(input?.minResaleConfidence, current.minResaleConfidence, 0, 100)),
    minRecentSales180d: Math.round(boundedNumber(input?.minRecentSales180d, current.minRecentSales180d, 0, 100)),
    requireSaleReference: typeof input?.requireSaleReference === "boolean"
      ? input.requireSaleReference
      : current.requireSaleReference,
  };
}

const CREATOR_REVIEW_LIMIT = 25;

export function mergeDiscoveredCreators(
  existing: Awaited<ReturnType<typeof loadObjktOperatorState>>["creators"],
  discovered: Awaited<ReturnType<typeof discoverObjktCreators>>,
) {
  const reviews = new Map(existing.map((creator) => [creator.address, creator.reviewStatus]));
  const approved = existing.filter((creator) => creator.reviewStatus === "approved");
  const discoveredCreators = discovered
    .filter((creator) => !approved.some((approvedCreator) => approvedCreator.address === creator.address))
    .map((creator) => ({
    ...creator,
    reviewStatus: reviews.get(creator.address) || "pending",
    }));
  const pending = existing.filter((creator) => creator.reviewStatus === "pending");
  return [...approved, ...discoveredCreators, ...pending]
    .filter((creator, index, all) => all.findIndex((candidate) => candidate.address === creator.address) === index)
    .slice(0, Math.max(CREATOR_REVIEW_LIMIT, approved.length));
}

function normalizeSessionPatch(
  current: ObjktOperatorSession,
  input: Partial<ObjktOperatorSession>,
) {
  const next = { ...current };
  if (["not_started", "opened", "ready"].includes(String(input.kukaiStatus))) {
    next.kukaiStatus = input.kukaiStatus as ObjktOperatorSession["kukaiStatus"];
    if (next.kukaiStatus === "opened" && !next.kukaiTabOpenedAt) next.kukaiTabOpenedAt = new Date().toISOString();
    if (next.kukaiStatus === "ready") next.kukaiReadyAt = new Date().toISOString();
  }
  if (["not_started", "opened", "ready"].includes(String(input.objktAccountStatus))) {
    next.objktAccountStatus = input.objktAccountStatus as ObjktOperatorSession["objktAccountStatus"];
    if (next.objktAccountStatus === "opened" && !next.objktAccountOpenedAt) next.objktAccountOpenedAt = new Date().toISOString();
  }
  if (input.objktWalletAddress === null || typeof input.objktWalletAddress === "string") {
    const address = String(input.objktWalletAddress || "").trim();
    if (address && !isObjktTezosAddress(address)) throw new Error("Invalid Objkt wallet address");
    next.objktWalletAddress = address || null;
    next.objktWalletLinkedAt = address ? new Date().toISOString() : null;
  }
  if (typeof input.runArmed === "boolean") next.runArmed = input.runArmed;
  return next;
}

router.get("/api/objkt-operator/state", async (req, res) => {
  try {
    res.json({ state: await loadObjktOperatorState(routeUserId(req)) });
  } catch (error) {
    console.error("[objkt-operator] state read failed:", error);
    res.status(500).json({ error: "Failed to load Objkt Operator state" });
  }
});

router.patch("/api/objkt-operator/settings", async (req, res) => {
  try {
    const userId = routeUserId(req);
    const state = await loadObjktOperatorState(userId);
    const settings = normalizeObjktOperatorSettings(req.body, state.settings);
    if (settings.maxItemPriceXtz > settings.spendCapXtz) {
      return res.status(400).json({ error: "Maximum item price cannot exceed the spend cap" });
    }
    const event = operatorEvent("risk", "Updated Objkt buying policy and spend controls.");
    res.json({
      state: await patchObjktOperatorState(userId, {
        settings,
        scan: null,
        events: appendOperatorEvent(state, event),
      }),
    });
  } catch (error) {
    console.error("[objkt-operator] settings write failed:", error);
    res.status(500).json({ error: "Failed to save Objkt Operator settings" });
  }
});

router.patch("/api/objkt-operator/wallet", async (req, res) => {
  try {
    const userId = routeUserId(req);
    const state = await loadObjktOperatorState(userId);
    const raw = req.body?.walletAddress;
    const walletAddress = raw === null ? null : String(raw || "").trim();
    if (walletAddress && !isObjktTezosAddress(walletAddress)) {
      return res.status(400).json({ error: "A valid Tezos wallet address is required" });
    }
    const event = operatorEvent("wallet", walletAddress ? "Saved the operator wallet address." : "Cleared the operator wallet address.");
    res.json({
      state: await patchObjktOperatorState(userId, {
        walletAddress: walletAddress || null,
        events: appendOperatorEvent(state, event),
      }),
    });
  } catch (error) {
    console.error("[objkt-operator] wallet write failed:", error);
    res.status(500).json({ error: "Failed to save the operator wallet address" });
  }
});

router.patch("/api/objkt-operator/session", async (req, res) => {
  try {
    const userId = routeUserId(req);
    const state = await loadObjktOperatorState(userId);
    const session = normalizeSessionPatch(state.session, req.body || {});
    res.json({ state: await patchObjktOperatorState(userId, { session }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save operator session";
    res.status(/invalid/i.test(message) ? 400 : 500).json({ error: message });
  }
});

router.post("/api/objkt-operator/discover", async (req, res) => {
  try {
    const userId = routeUserId(req);
    const state = await loadObjktOperatorState(userId);
    const approvedCount = state.creators.filter((creator) => creator.reviewStatus === "approved").length;
    const discoveryLimit = Math.max(0, CREATOR_REVIEW_LIMIT - approvedCount);
    const discovered = discoveryLimit > 0
      ? await discoverObjktCreators(
        discoveryLimit,
        state.settings.maxItemPriceXtz,
        fetch,
        state.creators.map((creator) => creator.address),
      )
      : [];
    const creators = mergeDiscoveredCreators(state.creators, discovered);
    const event = operatorEvent("scan", `Kept ${approvedCount} approved creators and added ${discovered.length} new creators for owner review.`);
    res.json({
      state: await patchObjktOperatorState(userId, {
        creators,
        scan: null,
        events: appendOperatorEvent(state, event),
      }),
    });
  } catch (error) {
    console.error("[objkt-operator] creator discovery failed:", error);
    res.status(502).json({ error: error instanceof Error ? error.message : "Objkt creator discovery failed" });
  }
});

router.get("/api/objkt-operator/creators/:address/portfolio", async (req, res) => {
  try {
    const userId = routeUserId(req);
    const address = String(req.params.address || "").trim();
    if (!isObjktTezosAddress(address)) return res.status(400).json({ error: "Invalid creator address" });
    const state = await loadObjktOperatorState(userId);
    const creator = state.creators.find((candidate) => candidate.address === address);
    if (!creator) return res.status(404).json({ error: "Creator is not in the review set" });
    const works = await fetchObjktCreatorPortfolio(address, 12);
    res.json({ creator, works, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[objkt-operator] creator portfolio failed:", error);
    res.status(502).json({ error: error instanceof Error ? error.message : "Creator portfolio unavailable" });
  }
});

router.patch("/api/objkt-operator/creators/:address", async (req, res) => {
  try {
    const userId = routeUserId(req);
    const address = String(req.params.address || "").trim();
    const reviewStatus = String(req.body?.reviewStatus || "") as ObjktCreatorReviewStatus;
    if (!isObjktTezosAddress(address)) return res.status(400).json({ error: "Invalid creator address" });
    if (!(["pending", "approved", "rejected"] as string[]).includes(reviewStatus)) {
      return res.status(400).json({ error: "Invalid creator review status" });
    }
    const state = await loadObjktOperatorState(userId);
    if (!state.creators.some((creator) => creator.address === address)) {
      return res.status(404).json({ error: "Creator is not in the review set" });
    }
    const creators = state.creators.map((creator) => creator.address === address ? { ...creator, reviewStatus } : creator);
    const creator = creators.find((item) => item.address === address)!;
    const event = operatorEvent("scan", `${reviewStatus === "approved" ? "Approved" : reviewStatus === "rejected" ? "Rejected" : "Reset"} ${creator.alias || creator.address}.`);
    res.json({
      state: await patchObjktOperatorState(userId, {
        creators,
        scan: null,
        events: appendOperatorEvent(state, event),
      }),
    });
  } catch (error) {
    console.error("[objkt-operator] creator review failed:", error);
    res.status(500).json({ error: "Failed to save creator review" });
  }
});

router.post("/api/objkt-operator/scan", async (req, res) => {
  try {
    const userId = routeUserId(req);
    const state = await loadObjktOperatorState(userId);
    if (!state.creators.some((creator) => creator.reviewStatus === "approved")) {
      return res.status(409).json({ error: "Approve at least one creator before scanning" });
    }
    const scan = await scanObjktCreators({
      approvedCreators: state.creators,
      spendCapXtz: state.settings.spendCapXtz,
      maxItemPriceXtz: state.settings.maxItemPriceXtz,
      perCreatorLimit: state.settings.perCreatorLimit,
    });
    const event = operatorEvent("scan", `Scanned ${scan.summary.queriedCreators} approved creators and found ${scan.candidates.length} listings.`);
    res.json({
      state: await patchObjktOperatorState(userId, {
        scan,
        events: appendOperatorEvent(state, event),
      }),
    });
  } catch (error) {
    console.error("[objkt-operator] market scan failed:", error);
    res.status(502).json({ error: error instanceof Error ? error.message : "Objkt market scan failed" });
  }
});

router.post("/api/objkt-operator/queue", async (req, res) => {
  try {
    const userId = routeUserId(req);
    const state = await loadObjktOperatorState(userId);
    const candidateId = String(req.body?.candidateId || "");
    const candidate = state.scan?.candidates.find((item) => item.id === candidateId);
    if (!candidate) return res.status(404).json({ error: "Candidate is not in the latest persisted scan" });
    if (!state.creators.some((creator) => creator.address === candidate.creatorAddress && creator.reviewStatus === "approved")) {
      return res.status(409).json({ error: "Candidate creator is not approved" });
    }
    const quality = evaluateObjktCandidatePolicy(candidate, state.settings);
    if (!quality.eligible) {
      return res.status(409).json({ error: `Candidate is blocked by policy: ${quality.blockers.join(", ")}` });
    }
    const activeQueue = state.queue.filter((item) => !["skipped", "failed"].includes(item.status));
    if (activeQueue.some((item) => item.id === candidate.id)) {
      return res.status(409).json({ error: "Candidate is already active in the queue" });
    }
    const queuedSpend = activeQueue.reduce((sum, item) => sum + item.lowestAskXtz, 0);
    if (queuedSpend + candidate.lowestAskXtz > state.settings.spendCapXtz) {
      return res.status(409).json({ error: "Candidate would exceed the persisted spend cap" });
    }
    const queue = [...state.queue, { ...candidate, queuedAt: new Date().toISOString(), status: "queued" as const }];
    const event = operatorEvent("queue", `Queued ${candidate.name} at ${candidate.lowestAskXtz} XTZ.`, candidate.objktUrl);
    res.json({
      state: await patchObjktOperatorState(userId, {
        queue,
        events: appendOperatorEvent(state, event),
      }),
    });
  } catch (error) {
    console.error("[objkt-operator] queue write failed:", error);
    res.status(500).json({ error: "Failed to queue Objkt candidate" });
  }
});

const ALLOWED_QUEUE_TRANSITIONS: Record<ObjktQueueStatus, ObjktQueueStatus[]> = {
  queued: ["checkout", "skipped", "failed"],
  checkout: ["signing", "skipped", "failed"],
  signing: ["signed", "failed"],
  signed: ["failed"],
  verified: [],
  skipped: [],
  failed: [],
};

router.patch("/api/objkt-operator/queue", async (req, res) => {
  try {
    const userId = routeUserId(req);
    const id = String(req.body?.id || "");
    const status = String(req.body?.status || "") as ObjktQueueStatus;
    const operationHash = String(req.body?.operationHash || "").trim();
    const state = await loadObjktOperatorState(userId);
    const current = state.queue.find((item) => item.id === id);
    if (!current) return res.status(404).json({ error: "Queue item not found" });
    if (!ALLOWED_QUEUE_TRANSITIONS[current.status]?.includes(status)) {
      return res.status(409).json({ error: `Invalid queue transition: ${current.status} -> ${status}` });
    }
    if (status === "signed" && !/^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(operationHash)) {
      return res.status(400).json({ error: "A valid Tezos operation hash is required before marking signed" });
    }
    const now = new Date().toISOString();
    const queue = state.queue.map((item) => item.id === id ? {
      ...item,
      status,
      ...(status === "checkout" ? { openedAt: now } : {}),
      ...(status === "signing" ? { signingAt: now } : {}),
      ...(status === "signed" ? { signedAt: now, operationHash } : {}),
      ...(status === "failed" ? { failedAt: now } : {}),
    } : item);
    const event = operatorEvent(status === "signed" ? "purchase" : "queue", `${current.name} moved to ${status}.`, current.objktUrl);
    res.json({
      state: await patchObjktOperatorState(userId, {
        queue,
        events: appendOperatorEvent(state, event),
      }),
    });
  } catch (error) {
    console.error("[objkt-operator] queue transition failed:", error);
    res.status(500).json({ error: "Failed to update the Objkt queue" });
  }
});

export default router;
