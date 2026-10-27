import { createHash, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { CompanionServiceError } from "./project-service.mjs";

const OPERATION_HASH = /^o[1-9A-HJ-NP-Za-km-z]{50}$/;
const MAX_JSON_BODY_BYTES = 10 * 1024 * 1024; // 10 MB max payload size

function tokenDigest(value) {
  return createHash("sha256").update(value).digest();
}

function authorized(request, expectedDigest) {
  const header = String(request.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return false;
  return timingSafeEqual(tokenDigest(header.slice(7)), expectedDigest);
}

function assertSecretFree(value, location = "response") {
  if (typeof value === "string") {
    const publicUri = /\.(?:contractMetadataUri|publicCoverUri)$/.test(location);
    if ((!publicUri && /^ipfs:\/\//i.test(value)) || /\.enc(?:$|[?#])/i.test(value)) {
      throw new Error(`${location} contains private material`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSecretFree(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const expresslyPublic = normalized === "contractmetadatauri" || normalized === "publiccoveruri";
    if (!expresslyPublic && [
      "seed", "seedpreimage", "entropypreimage", "metadatanonce", "artifactcid", "metadatacid",
      "signerkey", "masterkey", "privatekey", "privatecid", "rawasset", "privateassetpath",
      "encryptedpath", "encryptedcarpath", "privatemanifestpath", "entropykeyringpath",
    ].some((part) => normalized.includes(part))) {
      throw new Error(`${location}.${key} is private`);
    }
    assertSecretFree(child, `${location}.${key}`);
  }
}

function responseHeaders(origin) {
  const headers = {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    vary: "Origin",
  };
  if (origin) headers["access-control-allow-origin"] = origin;
  return headers;
}

function writeJson(response, statusCode, payload, origin = null) {
  assertSecretFree(payload);
  response.writeHead(statusCode, responseHeaders(origin));
  response.end(JSON.stringify(payload));
}

async function readJson(request, maxBytes = MAX_JSON_BODY_BYTES) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.byteLength || chunk.length;
    if (totalBytes > maxBytes) {
      throw new CompanionServiceError("payload_too_large", "Request payload exceeds maximum allowed size", 413);
    }
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required");
    return parsed;
  } catch (error) {
    if (error instanceof CompanionServiceError) throw error;
    throw new CompanionServiceError("invalid_json", "Request body must be a JSON object");
  }
}

function decoded(match, index) {
  try {
    return decodeURIComponent(match[index]);
  } catch {
    throw new CompanionServiceError("invalid_path", "Request path is invalid");
  }
}

export async function createCompanionHttpServer({
  config,
  doctor,
  projectService,
  watcher,
  runtime,
  creatorSetup,
  logger = console,
}) {
  const adminToken = (await readFile(config.adminTokenFile, "utf8")).trim();
  const expectedAdminDigest = tokenDigest(adminToken);
  const instanceDigest = createHash("sha256").update(`macaroni-instance:${adminToken}`).digest("hex").slice(0, 16);
  const allowedOrigins = new Set(config.allowedOrigins);

  return http.createServer(async (request, response) => {
    const suppliedOrigin = typeof request.headers.origin === "string" ? request.headers.origin : null;
    const origin = suppliedOrigin && allowedOrigins.has(suppliedOrigin) ? suppliedOrigin : null;
    if (suppliedOrigin && !origin) {
      writeJson(response, 403, { error: "origin_not_allowed", message: "This static-site origin is not authorized by the Companion" });
      return;
    }
    if (request.method === "OPTIONS") {
      if (!origin) {
        writeJson(response, 403, { error: "origin_required", message: "CORS preflight requires an allowed origin" });
        return;
      }
      response.writeHead(204, {
        ...responseHeaders(origin),
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
      });
      response.end();
      return;
    }

    try {
      const url = new URL(request.url || "/", "http://companion.invalid");
      if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/status")) {
        writeJson(response, doctor.ready ? 200 : 503, {
          schema: "pasta.macaroni-companion-health.v1",
          running: true,
          fulfillmentReady: doctor.ready,
          state: doctor.ready ? "ready" : "setup_required",
          network: config.network,
          instanceDigest,
        }, origin);
        return;
      }

      const isAdmin = url.pathname.startsWith("/v1/admin/");
      if (isAdmin && !authorized(request, expectedAdminDigest)) {
        writeJson(response, 401, { error: "admin_authorization_required", message: "A valid local Companion admin token is required" }, origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/admin/readiness") {
        const collectorPublishing = projectService.collectorConfiguration();
        writeJson(response, 200, {
          schema: "pasta.macaroni-companion-admin-readiness.v1",
          ready: doctor.ready === true,
          network: config.network,
          assetStrategies: ["pin_on_claim", "public_prepin_private_manifest"],
          collectorPublishing,
        }, origin);
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/admin/projects") {
        writeJson(response, 201, await projectService.registerProject(await readJson(request)), origin);
        return;
      }

      let match = url.pathname.match(/^\/v1\/admin\/projects\/([^/]+)$/);
      if (request.method === "GET" && match) {
        writeJson(response, 200, projectService.adminProject(decoded(match, 1)), origin);
        return;
      }

      match = url.pathname.match(/^\/v1\/admin\/projects\/([^/]+)\/stuck-work$/);
      if (request.method === "GET" && match) {
        const dropRef = decoded(match, 1);
        const stuckItems = typeof projectService.listManualReviewWork === "function"
          ? projectService.listManualReviewWork(dropRef)
          : projectService.journal.listManualReviewWork(dropRef);
        writeJson(response, 200, {
          dropRef,
          stuckItems,
        }, origin);
        return;
      }

      match = url.pathname.match(/^\/v1\/admin\/projects\/([^/]+)\/stuck-work\/([0-9]+)\/reconcile$/);
      if (request.method === "POST" && match) {
        const dropRef = decoded(match, 1);
        const workId = decoded(match, 2);
        writeJson(response, 200, await projectService.reconcileStuckWork(dropRef, workId), origin);
        return;
      }

      match = url.pathname.match(/^\/v1\/admin\/projects\/([^/]+)\/uploads\/([^/]+)$/);
      if (request.method === "PUT" && match) {
        writeJson(response, 201, await projectService.uploadArtifact({
          dropRef: decoded(match, 1),
          uploadId: decoded(match, 2),
          source: request,
        }), origin);
        return;
      }

      match = url.pathname.match(/^\/v1\/admin\/projects\/([^/]+)\/tokens\/([0-9]+)$/);
      if (request.method === "POST" && match) {
        const body = await readJson(request);
        writeJson(response, 201, await projectService.stageToken({
          ...body,
          dropRef: decoded(match, 1),
          tokenId: Number(match[2]),
        }), origin);
        return;
      }

      match = url.pathname.match(/^\/v1\/admin\/projects\/([^/]+)\/public-contract-metadata$/);
      if (request.method === "POST" && match) {
        writeJson(response, 201, await projectService.pinPublicContractMetadata(decoded(match, 1), await readJson(request)), origin);
        return;
      }

      match = url.pathname.match(/^\/v1\/admin\/projects\/([^/]+)\/creator-actions\/(next|close)$/);
      if (request.method === "POST" && match) {
        const dropRef = decoded(match, 1);
        const body = await readJson(request);
        const result = await creatorSetup.getNext(dropRef, match[2] === "close" ? { requestPermanentClose: true } : body);
        writeJson(response, 200, result, origin);
        return;
      }

      match = url.pathname.match(/^\/v1\/admin\/projects\/([^/]+)\/creator-attempts\/([0-9]+)\/(prompt-started|prompt-aborted|rejected|submitted|reconcile)$/);
      if (request.method === "POST" && match) {
        const dropRef = decoded(match, 1);
        const attemptId = Number(match[2]);
        const action = match[3];
        const body = await readJson(request);
        const result = action === "prompt-started"
          ? await creatorSetup.promptStarted(dropRef, attemptId, body.requestId)
          : action === "prompt-aborted"
            ? creatorSetup.promptAborted(dropRef, attemptId, body)
          : action === "rejected"
          ? creatorSetup.reject(dropRef, attemptId, body.reason, body.confirmNoBroadcast)
          : action === "submitted"
            ? await creatorSetup.submitted(dropRef, attemptId, body.operationHash)
            : await creatorSetup.reconcile(dropRef, attemptId);
        writeJson(response, 200, result, origin);
        return;
      }

      match = url.pathname.match(/^\/v1\/admin\/projects\/([^/]+)\/contract$/);
      if (request.method === "POST" && match) {
        const body = await readJson(request);
        writeJson(response, 200, await projectService.attachContract(decoded(match, 1), body.contractAddress), origin);
        return;
      }

      match = url.pathname.match(/^\/v1\/admin\/projects\/([^/]+)\/(preflight|observe-activation|wake)$/);
      if (request.method === "POST" && match) {
        const dropRef = decoded(match, 1);
        const action = match[2];
        const result = action === "preflight"
          ? await projectService.preflight(dropRef).then(async (preflight) => {
              await runtime.wake();
              return { ...preflight, project: projectService.adminProject(dropRef) };
            })
          : action === "observe-activation"
            ? await projectService.activate(dropRef)
            : (await runtime.wake(), projectService.adminProject(dropRef));
        writeJson(response, 200, result, origin);
        return;
      }

      match = url.pathname.match(/^\/v1\/public\/projects\/([^/]+)\/status$/);
      if (request.method === "GET" && match) {
        writeJson(response, 200, projectService.publicProjectStatus(decoded(match, 1)), origin);
        return;
      }

      match = url.pathname.match(/^\/v1\/public\/projects\/([^/]+)\/static-manifest$/);
      if (request.method === "GET" && match) {
        writeJson(response, 200, await projectService.publicStaticManifest(decoded(match, 1)), origin);
        return;
      }

      match = url.pathname.match(/^\/v1\/public\/projects\/([^/]+)\/claims\/([0-9]+)$/);
      if (request.method === "GET" && match) {
        writeJson(response, 200, projectService.publicClaimStatus(decoded(match, 1), Number(match[2])), origin);
        return;
      }

      match = url.pathname.match(/^\/v1\/public\/projects\/([^/]+)\/purchases\/([^/]+)$/);
      if (request.method === "GET" && match) {
        const project = projectService.journal.getProject(decoded(match, 1));
        const operationHash = decoded(match, 2);
        if (!project?.contract_address) throw new CompanionServiceError("project_not_active", "Drop contract is not ready", 404);
        if (!OPERATION_HASH.test(operationHash)) throw new CompanionServiceError("invalid_operation_hash", "Purchase operation hash is invalid");
        writeJson(response, 200, await watcher.purchaseStatus({ contractAddress: project.contract_address, operationHash }), origin);
        return;
      }

      match = url.pathname.match(/^\/v1\/public\/projects\/([^/]+)\/wake$/);
      if (request.method === "POST" && match) {
        projectService.publicProjectStatus(decoded(match, 1));
        await runtime.wake();
        writeJson(response, 202, { accepted: true, state: "fulfillment_check_complete" }, origin);
        return;
      }

      writeJson(response, 404, { error: "not_found", message: "Companion endpoint was not found" }, origin);
    } catch (error) {
      if (error instanceof CompanionServiceError) {
        writeJson(response, error.statusCode, { error: error.code, message: error.message }, origin);
        return;
      }
      logger.error?.("Macaroni Companion request failed", error);
      writeJson(response, 500, { error: "internal_error", message: "The Companion stopped this request safely; check the local operator log" }, origin);
    }
  });
}
