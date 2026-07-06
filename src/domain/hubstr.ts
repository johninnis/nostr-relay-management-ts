import type { EventId, PublicKey } from "@innis/nostr-core"
import { isArrayOf, isNumberArray, isRecord, isValidEventId, isValidPublicKey } from "@innis/nostr-core"

/** Hubstr guest read policy: which event `kinds` a non-tenant may read, which of those `global_kinds` are readable regardless of author (bypassing `from_tenants_only`), and whether the remaining reads are restricted to tenant-authored events. */
export interface GuestReadPolicy {
  readonly kinds: ReadonlyArray<number>
  readonly global_kinds: ReadonlyArray<number>
  readonly from_tenants_only: boolean
}

/** Hubstr guest write policy: which event `kinds` a non-tenant may publish, and whether each must be tagged to a tenant. */
export interface GuestWritePolicy {
  readonly kinds: ReadonlyArray<number>
  readonly tagged_to_tenant: boolean
}

/** Hubstr guest-access policy: the {@link GuestReadPolicy} and {@link GuestWritePolicy} applied to non-tenant clients. */
export interface GuestPolicy {
  readonly read: GuestReadPolicy
  readonly write: GuestWritePolicy
}

const isGuestReadPolicy = (value: unknown): value is GuestReadPolicy =>
  isRecord(value) && isNumberArray(value.kinds) && isNumberArray(value.global_kinds) &&
  typeof value.from_tenants_only === "boolean"

const isGuestWritePolicy = (value: unknown): value is GuestWritePolicy =>
  isRecord(value) && isNumberArray(value.kinds) && typeof value.tagged_to_tenant === "boolean"

/** Type guard for {@link GuestPolicy}. */
export const isGuestPolicy = (value: unknown): value is GuestPolicy =>
  isRecord(value) && isGuestReadPolicy(value.read) && isGuestWritePolicy(value.write)

/** Hubstr per-client rate limits: permitted events and subscriptions per minute. */
export interface RateLimits {
  readonly events_per_minute: number
  readonly subscriptions_per_minute: number
}

/** Type guard for {@link RateLimits}. */
export const isRateLimits = (value: unknown): value is RateLimits =>
  isRecord(value) &&
  typeof value.events_per_minute === "number" &&
  typeof value.subscriptions_per_minute === "number"

/** A count of stored events for a single event `kind`. */
export interface KindCount {
  readonly kind: number
  readonly count: number
}

const isKindCount = (value: unknown): value is KindCount =>
  isRecord(value) && typeof value.kind === "number" && typeof value.count === "number"

/** A count of stored events for a single tenant `PublicKey`. */
export interface TenantCount {
  readonly pubkey: PublicKey
  readonly count: number
}

const isTenantCount = (value: unknown): value is TenantCount =>
  isRecord(value) && isValidPublicKey(value.pubkey) && typeof value.count === "number"

/** Hubstr relay statistics: aggregate counts (events, tags, follows, …) plus per-kind and per-tenant breakdowns. */
export interface RelayStats {
  readonly events: number
  readonly tags: number
  readonly follows: number
  readonly mutes: number
  readonly relays: number
  readonly zaps: number
  readonly known_pubkeys: number
  readonly events_by_kind: ReadonlyArray<KindCount>
  readonly events_by_tenant: ReadonlyArray<TenantCount>
}

/** Type guard for {@link RelayStats}. */
export const isRelayStats = (value: unknown): value is RelayStats =>
  isRecord(value) &&
  typeof value.events === "number" &&
  typeof value.tags === "number" &&
  typeof value.follows === "number" &&
  typeof value.mutes === "number" &&
  typeof value.relays === "number" &&
  typeof value.zaps === "number" &&
  typeof value.known_pubkeys === "number" &&
  isArrayOf(value.events_by_kind, isKindCount) &&
  isArrayOf(value.events_by_tenant, isTenantCount)

/** An open subscription on a live {@link Connection}: its `id`, `state`, and active NIP-01 `filters`. */
export interface ConnectionSubscription {
  readonly id: string
  readonly state: string
  readonly filters: ReadonlyArray<Record<string, unknown>>
}

const isConnectionSubscription = (value: unknown): value is ConnectionSubscription =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.state === "string" &&
  isArrayOf(value.filters, isRecord)

/** A live Hubstr client connection: network/identity details plus traffic counters and its open {@link ConnectionSubscription}s. */
export interface Connection {
  readonly id: string
  readonly ip: string
  readonly user_agent: string
  readonly connected_at: number
  readonly events_received: number
  readonly events_accepted: number
  readonly events_sent: number
  readonly subscriptions: ReadonlyArray<ConnectionSubscription>
}

/** Type guard for {@link Connection}. */
export const isConnection = (value: unknown): value is Connection =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.ip === "string" &&
  typeof value.user_agent === "string" &&
  typeof value.connected_at === "number" &&
  typeof value.events_received === "number" &&
  typeof value.events_accepted === "number" &&
  typeof value.events_sent === "number" &&
  isArrayOf(value.subscriptions, isConnectionSubscription)

/** Type guard for a `ReadonlyArray<Connection>`. */
export const isConnectionArray = (value: unknown): value is ReadonlyArray<Connection> => isArrayOf(value, isConnection)

/** Type guard for {@link Connection} `| null` — for a lookup that may not find a matching connection. */
export const isConnectionOrNull = (value: unknown): value is Connection | null => value === null || isConnection(value)

/** A Hubstr subscription record: the owning client's id/ip, the `subscription_id`, its `state`, and its NIP-01 `filters`. */
export interface Subscription {
  readonly client_id: string
  readonly client_ip: string
  readonly subscription_id: string
  readonly state: string
  readonly filters: ReadonlyArray<Record<string, unknown>>
}

/** Type guard for {@link Subscription}. */
export const isSubscription = (value: unknown): value is Subscription =>
  isRecord(value) &&
  typeof value.client_id === "string" &&
  typeof value.client_ip === "string" &&
  typeof value.subscription_id === "string" &&
  typeof value.state === "string" &&
  isArrayOf(value.filters, isRecord)

/** Type guard for a `ReadonlyArray<Subscription>`. */
export const isSubscriptionArray = (value: unknown): value is ReadonlyArray<Subscription> =>
  isArrayOf(value, isSubscription)

/** The time window of an {@link ExploreResult}: `"24h"`, `"7d"`, `"30d"`, or `"all"`. */
export type ExplorePeriod = "24h" | "7d" | "30d" | "all"

/** Parse a raw string into an {@link ExplorePeriod}, or `null` when it is not one of the known windows. */
export const parseExplorePeriod = (raw: string): ExplorePeriod | null => {
  switch (raw) {
    case "24h":
    case "7d":
    case "30d":
    case "all":
      return raw
    default:
      return null
  }
}

/** A trending-hashtag entry: the `hashtag` and its occurrence `count`. */
export interface HashtagEntry {
  readonly hashtag: string
  readonly count: number
}

/** An explore-leaderboard entry keyed by `PublicKey` with its `count` (followers, zaps, reactions, etc.). */
export interface PubkeyEntry {
  readonly pubkey: PublicKey
  readonly count: number
}

/** An explore-leaderboard entry keyed by `EventId` with its `count`. */
export interface EventIdEntry {
  readonly event_id: EventId
  readonly count: number
}

/** Hubstr explore/trending data: leaderboards for hashtags, pubkeys, and notes over an {@link ExploreResult}'s period. */
export interface ExploreData {
  readonly trending_hashtags: ReadonlyArray<HashtagEntry>
  readonly most_followed: ReadonlyArray<PubkeyEntry>
  readonly most_muted: ReadonlyArray<PubkeyEntry>
  readonly most_zapped: ReadonlyArray<PubkeyEntry>
  readonly most_zapped_by_sats: ReadonlyArray<PubkeyEntry>
  readonly top_zappers: ReadonlyArray<PubkeyEntry>
  readonly top_zappers_by_sats: ReadonlyArray<PubkeyEntry>
  readonly most_reacted_to: ReadonlyArray<PubkeyEntry>
  readonly most_reposted: ReadonlyArray<PubkeyEntry>
  readonly most_zapped_notes: ReadonlyArray<EventIdEntry>
}

/** A Hubstr explore response: the {@link ExplorePeriod} it covers and its {@link ExploreData}. */
export interface ExploreResult {
  readonly period: ExplorePeriod
  readonly data: ExploreData
}

const isHashtagEntry = (value: unknown): value is HashtagEntry =>
  isRecord(value) && typeof value.hashtag === "string" && typeof value.count === "number"

const isPubkeyEntry = (value: unknown): value is PubkeyEntry =>
  isRecord(value) && isValidPublicKey(value.pubkey) && typeof value.count === "number"

const isEventIdEntry = (value: unknown): value is EventIdEntry =>
  isRecord(value) && isValidEventId(value.event_id) && typeof value.count === "number"

const pubkeyLeaderboardKeys = [
  "most_followed",
  "most_muted",
  "most_zapped",
  "most_zapped_by_sats",
  "top_zappers",
  "top_zappers_by_sats",
  "most_reacted_to",
  "most_reposted",
] as const satisfies ReadonlyArray<keyof ExploreData>

const isExploreData = (value: unknown): value is ExploreData =>
  isRecord(value) &&
  isArrayOf(value.trending_hashtags, isHashtagEntry) &&
  isArrayOf(value.most_zapped_notes, isEventIdEntry) &&
  pubkeyLeaderboardKeys.every((key) => isArrayOf(value[key], isPubkeyEntry))

/** Type guard for {@link ExploreResult} — validates the `period` and every leaderboard in `data`. */
export const isExploreResult = (value: unknown): value is ExploreResult =>
  isRecord(value) && typeof value.period === "string" && parseExplorePeriod(value.period) !== null &&
  isExploreData(value.data)
