import {
  buildWtfProjectBundleManifest,
  type WtfProjectBundleManifest,
} from "@shared/wtf-project-bundles";
import {
  buildWtfMediaServiceContract,
  type WtfMediaServiceContract,
} from "@shared/wtf-media-service";
import { buildWtfIpfsGatewayPolicy } from "@shared/ipfs-gateways";

export function asFileManagerArray<T>(value: T[] | unknown): T[] {
  return Array.isArray(value) ? value : [];
}

export function resolveProjectBundleManifest(
  value: WtfProjectBundleManifest | unknown
): WtfProjectBundleManifest {
  return value &&
    typeof value === "object" &&
    Array.isArray((value as WtfProjectBundleManifest).sections)
    ? (value as WtfProjectBundleManifest)
    : buildWtfProjectBundleManifest();
}

export function resolveMediaServiceContract(
  value: WtfMediaServiceContract | unknown
): WtfMediaServiceContract {
  return value &&
    typeof value === "object" &&
    Array.isArray((value as WtfMediaServiceContract).capabilities)
    ? (value as WtfMediaServiceContract)
    : buildWtfMediaServiceContract();
}

export function resolveIpfsGatewayPolicy(
  value: ReturnType<typeof buildWtfIpfsGatewayPolicy> | unknown
): ReturnType<typeof buildWtfIpfsGatewayPolicy> {
  return value &&
    typeof value === "object" &&
    Array.isArray((value as ReturnType<typeof buildWtfIpfsGatewayPolicy>).gateways)
    ? (value as ReturnType<typeof buildWtfIpfsGatewayPolicy>)
    : buildWtfIpfsGatewayPolicy();
}
