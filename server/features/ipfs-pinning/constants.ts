export const PIN_COLLECTOR_ROLE = "wtf_pin_collector";
export const PIN_COLLECTOR_PERMISSION = "use_wtfos_pinning";
export const PIN_COLLECTOR_SKU = "wtf-pin-collector-pass";
export const LEGACY_AUTOPIN_SKU = "wtf-autopin-membership";
export const HOSTED_PORCUPIN_PROVIDER_KEY = "wtfos-porcupin-hetzner";
export const IPFS_PINNING_SOURCE = "ipfs-pinning";
export const IPFS_PINNING_WORKER_JOB_NAME = "ipfs-pinning-manager";

export const PINNING_EVENTS = {
  policySaved: "ipfs_pinning.policy.saved",
  walletBackupEnabled: "ipfs_pinning.wallet_backup.enabled",
  storageStaged: "ipfs_pinning.storage.staged",
  pinCompleted: "ipfs_pinning.pin.completed",
  pdsRecordQueued: "ipfs_pinning.pds_record.queued",
  pdsRecordPublished: "ipfs_pinning.pds_record.published",
  subdomainRegistryLinked: "ipfs_pinning.subdomain_registry.linked",
  restoreProofCreated: "ipfs_pinning.restore_proof.created",
} as const;
