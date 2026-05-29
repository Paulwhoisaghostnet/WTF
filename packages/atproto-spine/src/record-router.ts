import type { AtprotoRecordWrite, SpineRoutingRule } from "./types";

/**
 * Route a record `$type` to logical domains by longest-prefix match. Replaces TZAT's
 * publisher/entity-router.ts (which routed by Tezos contract/marketplace/noun refs) with
 * a config-driven `$type`-prefix scheme. A type may match multiple rules (e.g. a broad
 * domain prefix plus a narrower subdomain prefix); all matches are returned, deduped.
 */
export function routeRecordToDomains(type: string, rules: SpineRoutingRule[]): string[] {
  const matched = rules
    .filter((rule) => type.startsWith(rule.typePrefix))
    .sort((a, b) => b.typePrefix.length - a.typePrefix.length);
  const domains: string[] = [];
  for (const rule of matched) {
    if (!domains.includes(rule.domain)) {
      domains.push(rule.domain);
    }
  }
  return domains;
}

/** The single best (most specific) domain for a type, or undefined when nothing matches. */
export function primaryDomainFor(type: string, rules: SpineRoutingRule[]): string | undefined {
  return routeRecordToDomains(type, rules)[0];
}

/** Group writes by destination domain for pointer-echo fan-out to domain PDSes. */
export function groupWritesByDomain(
  writes: AtprotoRecordWrite[],
  rules: SpineRoutingRule[],
): Map<string, AtprotoRecordWrite[]> {
  const groups = new Map<string, AtprotoRecordWrite[]>();
  for (const write of writes) {
    for (const domain of routeRecordToDomains(write.collection, rules)) {
      const list = groups.get(domain) ?? [];
      list.push(write);
      groups.set(domain, list);
    }
  }
  return groups;
}
