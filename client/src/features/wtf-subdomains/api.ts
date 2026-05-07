import type {
  WtfDomainChatConfig,
  WtfDomainsRegistrationPlan,
  WtfDomainsRegistrarStatus,
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

export function fetchWtfDomainChatConfig() {
  return api.get<WtfDomainChatConfig>("/api/wtf-subdomains/chat/config");
}
