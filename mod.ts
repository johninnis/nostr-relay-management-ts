export type { ManagementUrl } from "./src/domain/types.ts"
export {
  InvalidManagementUrlError,
  isValidManagementUrl,
  parseManagementUrl,
  tryParseManagementUrl,
} from "./src/domain/types.ts"

export type { BlockedIp, ModeratedEvent, ModeratedPubkey } from "./src/domain/nip86.ts"
export {
  isBlockedIp,
  isBlockedIpArray,
  isModeratedEvent,
  isModeratedEventArray,
  isModeratedPubkey,
  isModeratedPubkeyArray,
} from "./src/domain/nip86.ts"

export type {
  Connection,
  ConnectionSubscription,
  EventIdEntry,
  ExploreData,
  ExplorePeriod,
  ExploreResult,
  GuestPolicy,
  GuestReadPolicy,
  GuestWritePolicy,
  HashtagEntry,
  KindCount,
  PubkeyEntry,
  RateLimits,
  RelayStats,
  Subscription,
  TenantCount,
} from "./src/domain/hubstr.ts"
export {
  isConnection,
  isConnectionArray,
  isConnectionOrNull,
  isExploreResult,
  isGuestPolicy,
  isRateLimits,
  isRelayStats,
  isSubscription,
  isSubscriptionArray,
  parseExplorePeriod,
} from "./src/domain/hubstr.ts"

export type { RelayManagementError } from "./src/domain/errors.ts"
export { RpcError } from "./src/domain/errors.ts"

export type { RelayManagementDeps, RelayManagementSigner } from "./src/application/ports.ts"

export type { Rpc, RpcInput } from "./src/application/rpc.ts"
export { createRpc } from "./src/application/rpc.ts"

export { adaptSigner } from "./src/infrastructure/signer-adapter.ts"
