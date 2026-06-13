import type { EventId, PublicKey } from "@innis/nostr-core"
import { isArrayOf, isRecord, isValidEventId, isValidPublicKey } from "@innis/nostr-core"

/** A NIP-86 moderated pubkey: a `PublicKey` under moderation, with the `reason` it was actioned. */
export interface ModeratedPubkey {
  readonly pubkey: PublicKey
  readonly reason: string
}

/** Type guard for {@link ModeratedPubkey} — requires `pubkey` to be a valid 64-char lowercase-hex `PublicKey`. */
export const isModeratedPubkey = (value: unknown): value is ModeratedPubkey =>
  isRecord(value) && isValidPublicKey(value.pubkey) && typeof value.reason === "string"

/** Type guard for a `ReadonlyArray<ModeratedPubkey>`. */
export const isModeratedPubkeyArray = (value: unknown): value is ReadonlyArray<ModeratedPubkey> =>
  isArrayOf(value, isModeratedPubkey)

/** A NIP-86 moderated event: an `EventId` under moderation, with the `reason` it was actioned. */
export interface ModeratedEvent {
  readonly id: EventId
  readonly reason: string
}

/** Type guard for {@link ModeratedEvent} — requires `id` to be a valid 64-char lowercase-hex `EventId`. */
export const isModeratedEvent = (value: unknown): value is ModeratedEvent =>
  isRecord(value) && isValidEventId(value.id) && typeof value.reason === "string"

/** Type guard for a `ReadonlyArray<ModeratedEvent>`. */
export const isModeratedEventArray = (value: unknown): value is ReadonlyArray<ModeratedEvent> =>
  isArrayOf(value, isModeratedEvent)

/** A NIP-86 blocked IP: an `ip` address and the `reason` it was blocked. */
export interface BlockedIp {
  readonly ip: string
  readonly reason: string
}

/** Type guard for {@link BlockedIp}. */
export const isBlockedIp = (value: unknown): value is BlockedIp =>
  isRecord(value) && typeof value.ip === "string" && typeof value.reason === "string"

/** Type guard for a `ReadonlyArray<BlockedIp>`. */
export const isBlockedIpArray = (value: unknown): value is ReadonlyArray<BlockedIp> => isArrayOf(value, isBlockedIp)
