import type {
  HackTezConfig,
  WtfDomainChatConfig,
  WtfDomainsCommitPlan,
  WtfDomainsRegistrationPlan,
  WtfDomainsRegistrarStatus,
  WtfDomainsWalletStatus,
  WtfSubdomainGrantDto,
} from "@shared/wtf-subdomains";
import { api } from "../../lib/api";

export type PrepareRegistrarPayload = {
  label: string;
  targetAddress: string;
};

export function fetchMyWtfSubdomainGrants() {
  return api.get<WtfSubdomainGrantDto[]>("/api/wtf-subdomains/my");
}

export function fetchWtfDomainsRegistrarStatus() {
  return api.get<WtfDomainsRegistrarStatus>(
    "/api/wtf-subdomains/registrar/config"
  );
}

export function prepareWtfDomainRegistration(payload: PrepareRegistrarPayload) {
  return api.post<WtfDomainsRegistrationPlan>(
    "/api/wtf-subdomains/registrar/prepare",
    payload
  );
}

export function commitWtfDomainRegistration(payload: PrepareRegistrarPayload) {
  return api.post<WtfDomainsCommitPlan>(
    "/api/wtf-subdomains/registrar/commit",
    payload
  );
}

export function fetchWalletRegistrarStatus(address: string) {
  return api.get<WtfDomainsWalletStatus>(
    `/api/wtf-subdomains/registrar/status/${encodeURIComponent(address)}`
  );
}

export function fetchHackTezConfig() {
  return api.get<HackTezConfig>("/api/wtf-subdomains/hack-tez/config");
}

export function fetchWtfDomainChatConfig() {
  return api.get<WtfDomainChatConfig>("/api/wtf-subdomains/chat/config");
}
