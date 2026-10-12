import { assert, assertEquals, assertFalse } from "@std/assert"
import { eventIdFixture, publicKeyFixture } from "@innis/nostr-core/testing"
import {
  type Connection,
  type ExploreResult,
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
  type Subscription,
  type TagPrefixRule,
} from "../../src/domain/hubstr.ts"

const connection: Connection = {
  id: "conn-1",
  ip: "192.0.2.1",
  user_agent: "nostr-client/1.0",
  connected_at: 1700000000,
  events_received: 10,
  events_accepted: 9,
  events_sent: 42,
  subscriptions: [{ id: "sub-1", state: "active", filters: [{ kinds: [1] }] }],
}

const subscription: Subscription = {
  client_id: "conn-1",
  client_ip: "192.0.2.1",
  subscription_id: "sub-1",
  state: "active",
  filters: [{ kinds: [1] }],
}

const pageCommentRule = { tag: "I", prefixes: ["https://www.example.com/"], kinds: [1111] }

const policyWithRule = (rule: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> => ({
  read: { kinds: [1111], global_kinds: [], from_tenants_only: false },
  write: { kinds: [1111], tagged_to_tenant: false, tag_prefixes: [rule] },
})

const tenantPubkey = publicKeyFixture("a".repeat(64))
const zappedNoteId = eventIdFixture("b".repeat(64))

const exploreResult: ExploreResult = {
  period: "24h",
  data: {
    trending_hashtags: [{ hashtag: "nostr", count: 12 }],
    most_followed: [{ pubkey: tenantPubkey, count: 9 }],
    most_muted: [],
    most_zapped: [],
    most_zapped_by_sats: [],
    top_zappers: [],
    top_zappers_by_sats: [],
    most_reacted_to: [],
    most_reposted: [],
    most_zapped_notes: [{ event_id: zappedNoteId, count: 3 }],
  },
}

Deno.test("isGuestPolicy - accepts a well-formed policy", () => {
  assert(isGuestPolicy({
    read: { kinds: [0, 1], global_kinds: [24133], from_tenants_only: true },
    write: { kinds: [1], tagged_to_tenant: false, tag_prefixes: [] },
  }))
})

Deno.test("isGuestPolicy - rejects a policy listing a kind that is not a NIP-01 event kind", () => {
  assertFalse(isGuestPolicy({
    read: { kinds: [0, 1.5], global_kinds: [], from_tenants_only: true },
    write: { kinds: [1], tagged_to_tenant: false, tag_prefixes: [] },
  }))
})

Deno.test("isGuestPolicy - rejects a policy missing global_kinds", () => {
  assertFalse(isGuestPolicy({
    read: { kinds: [0, 1], from_tenants_only: true },
    write: { kinds: [1], tagged_to_tenant: false, tag_prefixes: [] },
  }))
})

Deno.test("isGuestPolicy - rejects a policy with a non-boolean flag", () => {
  assertFalse(isGuestPolicy({
    read: { kinds: [0, 1], global_kinds: [24133], from_tenants_only: "yes" },
    write: { kinds: [1], tagged_to_tenant: false, tag_prefixes: [] },
  }))
})

Deno.test("isGuestPolicy - rejects a policy missing the write side", () => {
  assertFalse(isGuestPolicy({ read: { kinds: [0], global_kinds: [24133], from_tenants_only: true } }))
})

Deno.test("isGuestPolicy - rejects a write side without tag_prefixes, with no default for an older relay (ADR-0004)", () => {
  assertFalse(isGuestPolicy({
    read: { kinds: [0], global_kinds: [], from_tenants_only: true },
    write: { kinds: [1], tagged_to_tenant: false },
  }))
})

Deno.test("isGuestPolicy - accepts a tag prefix rule", () => {
  assert(isGuestPolicy({
    read: { kinds: [1111], global_kinds: [], from_tenants_only: false },
    write: {
      kinds: [1111],
      tagged_to_tenant: false,
      tag_prefixes: [
        { tag: "I", prefixes: ["https://www.example.com/"], kinds: [1111] },
        { tag: "i", prefixes: ["https://www.example.com/"], kinds: [1, 17] },
      ],
    },
  }))
})

Deno.test("isGuestPolicy - rejects a tag prefix rule without kinds, with no default to every kind (ADR-0004)", () => {
  assertFalse(isGuestPolicy({
    read: { kinds: [1111], global_kinds: [], from_tenants_only: false },
    write: {
      kinds: [1111],
      tagged_to_tenant: false,
      tag_prefixes: [{ tag: "I", prefixes: ["https://www.example.com/"] }],
    },
  }))
})

Deno.test("isGuestPolicy - rejects a tag prefix rule with an empty kind list", () => {
  assertFalse(isGuestPolicy({
    read: { kinds: [1111], global_kinds: [], from_tenants_only: false },
    write: {
      kinds: [1111],
      tagged_to_tenant: false,
      tag_prefixes: [{ tag: "I", prefixes: ["https://www.example.com/"], kinds: [] }],
    },
  }))
})

Deno.test("isGuestPolicy - rejects a tag prefix rule listing a value that is not an event kind", () => {
  assertFalse(isGuestPolicy({
    read: { kinds: [1111], global_kinds: [], from_tenants_only: false },
    write: {
      kinds: [1111],
      tagged_to_tenant: false,
      tag_prefixes: [{ tag: "I", prefixes: ["https://www.example.com/"], kinds: ["1111"] }],
    },
  }))
})

Deno.test("isGuestPolicy - rejects a tag prefix rule listing a negative kind", () => {
  assertFalse(isGuestPolicy(policyWithRule({ ...pageCommentRule, kinds: [-1] })))
})

Deno.test("isGuestPolicy - rejects a tag prefix rule listing a kind above 65535", () => {
  assertFalse(isGuestPolicy(policyWithRule({ ...pageCommentRule, kinds: [65536] })))
})

Deno.test("isGuestPolicy - rejects a tag prefix rule listing a fractional kind", () => {
  assertFalse(isGuestPolicy(policyWithRule({ ...pageCommentRule, kinds: [1111.5] })))
})

Deno.test("isGuestPolicy - accepts a tag prefix rule listing a kind twice, as the relay accepts it (ADR-0004)", () => {
  assert(isGuestPolicy(policyWithRule({ ...pageCommentRule, kinds: [1111, 1111] })))
})

Deno.test("isGuestPolicy - rejects a tag prefix rule with no prefixes, as the relay holds none (ADR-0004)", () => {
  assertFalse(isGuestPolicy(policyWithRule({ ...pageCommentRule, prefixes: [] })))
})

Deno.test("isGuestPolicy - rejects a tag prefix rule with an empty prefix, which matches every value (ADR-0004)", () => {
  assertFalse(isGuestPolicy(policyWithRule({ ...pageCommentRule, prefixes: ["https://www.example.com/", ""] })))
})

Deno.test("isGuestPolicy - rejects a tag prefix rule with an empty tag, as the relay holds none (ADR-0004)", () => {
  assertFalse(isGuestPolicy(policyWithRule({ ...pageCommentRule, tag: "" })))
})

Deno.test("isGuestPolicy - narrows each rule's kinds to a list that has a first kind (ADR-0004)", () => {
  const value: unknown = policyWithRule(pageCommentRule)
  const firstKinds: ReadonlyArray<number> = isGuestPolicy(value)
    ? value.write.tag_prefixes.map((rule) => rule.kinds[0])
    : []
  assertEquals(firstKinds, [1111])
})

Deno.test("isGuestPolicy - narrows each rule's prefixes to a list that has a first prefix (ADR-0004)", () => {
  const value: unknown = policyWithRule(pageCommentRule)
  const firstPrefixes: ReadonlyArray<string> = isGuestPolicy(value)
    ? value.write.tag_prefixes.map((rule) => rule.prefixes[0])
    : []
  assertEquals(firstPrefixes, ["https://www.example.com/"])
})

Deno.test("TagPrefixRule - refuses at compile time a rule with no kinds (ADR-0004)", () => {
  // @ts-expect-error: a rule lists at least one kind
  const rule: TagPrefixRule = { tag: "I", prefixes: ["https://www.example.com/"], kinds: [] }
  assertEquals(rule.kinds.length, 0)
})

Deno.test("TagPrefixRule - refuses at compile time a rule with no prefixes (ADR-0004)", () => {
  // @ts-expect-error: a rule lists at least one prefix
  const rule: TagPrefixRule = { tag: "I", prefixes: [], kinds: [1111] }
  assertEquals(rule.prefixes.length, 0)
})

Deno.test("isGuestPolicy - accepts an empty tag prefix rule list", () => {
  assert(isGuestPolicy({
    read: { kinds: [1111], global_kinds: [], from_tenants_only: false },
    write: { kinds: [1111], tagged_to_tenant: false, tag_prefixes: [] },
  }))
})

Deno.test("isGuestPolicy - rejects a null tag prefix rule list", () => {
  assertFalse(isGuestPolicy({
    read: { kinds: [1111], global_kinds: [], from_tenants_only: false },
    write: { kinds: [1111], tagged_to_tenant: false, tag_prefixes: null },
  }))
})

Deno.test("isGuestPolicy - rejects a write policy without its tag prefix rule list", () => {
  assertFalse(isGuestPolicy({
    read: { kinds: [1111], global_kinds: [], from_tenants_only: false },
    write: { kinds: [1111], tagged_to_tenant: false },
  }))
})

Deno.test("isGuestPolicy - rejects a tag prefix rule with non-string prefixes", () => {
  assertFalse(isGuestPolicy({
    read: { kinds: [1111], global_kinds: [], from_tenants_only: false },
    write: { kinds: [1111], tagged_to_tenant: false, tag_prefixes: [{ tag: "I", prefixes: [42], kinds: [1111] }] },
  }))
})

Deno.test("isGuestPolicy - rejects a bare rule object where a list is expected", () => {
  assertFalse(isGuestPolicy({
    read: { kinds: [1111], global_kinds: [], from_tenants_only: false },
    write: {
      kinds: [1111],
      tagged_to_tenant: false,
      tag_prefixes: { tag: "I", prefixes: ["https://www.example.com/"], kinds: [1111] },
    },
  }))
})

Deno.test("isGuestPolicy - rejects a tag prefix rule with no tag", () => {
  assertFalse(isGuestPolicy({
    read: { kinds: [1111], global_kinds: [], from_tenants_only: false },
    write: {
      kinds: [1111],
      tagged_to_tenant: false,
      tag_prefixes: [{ prefixes: ["https://www.example.com/"], kinds: [1111] }],
    },
  }))
})

Deno.test("isRateLimits - accepts numeric limits", () => {
  assert(isRateLimits({ events_per_minute: 60, subscriptions_per_minute: 10 }))
})

Deno.test("isRateLimits - rejects non-numeric limits", () => {
  assertFalse(isRateLimits({ events_per_minute: "60", subscriptions_per_minute: 10 }))
})

Deno.test("isRelayStats - accepts a full stats payload", () => {
  assert(isRelayStats({
    events: 1,
    tags: 2,
    follows: 3,
    mutes: 4,
    relays: 5,
    zaps: 6,
    known_pubkeys: 7,
    events_by_kind: [{ kind: 1, count: 100 }],
    events_by_tenant: [{ pubkey: tenantPubkey, count: 50 }],
  }))
})

Deno.test("isRelayStats - rejects a tenant count whose pubkey is not 64-char lowercase hex", () => {
  assertFalse(isRelayStats({
    events: 1,
    tags: 2,
    follows: 3,
    mutes: 4,
    relays: 5,
    zaps: 6,
    known_pubkeys: 7,
    events_by_kind: [],
    events_by_tenant: [{ pubkey: "abc", count: 50 }],
  }))
})

Deno.test("isRelayStats - rejects a payload with a malformed kind count", () => {
  assertFalse(isRelayStats({
    events: 1,
    tags: 2,
    follows: 3,
    mutes: 4,
    relays: 5,
    zaps: 6,
    known_pubkeys: 7,
    events_by_kind: [{ kind: 1 }],
    events_by_tenant: [],
  }))
})

Deno.test("isRelayStats - rejects a kind count whose kind is not a NIP-01 event kind", () => {
  assertFalse(isRelayStats({
    events: 1,
    tags: 2,
    follows: 3,
    mutes: 4,
    relays: 5,
    zaps: 6,
    known_pubkeys: 7,
    events_by_kind: [{ kind: 65536, count: 1 }],
    events_by_tenant: [],
  }))
})

Deno.test("isRelayStats - rejects a payload missing a scalar field", () => {
  assertFalse(isRelayStats({
    events: 1,
    tags: 2,
    follows: 3,
    mutes: 4,
    relays: 5,
    zaps: 6,
    events_by_kind: [],
    events_by_tenant: [],
  }))
})

Deno.test("isConnection - accepts a well-formed connection", () => {
  assert(isConnection(connection))
})

Deno.test("isConnection - rejects a connection with a malformed subscription", () => {
  assertFalse(isConnection({ ...connection, subscriptions: [{ id: "sub-1", state: "active" }] }))
})

Deno.test("isConnection - rejects a connection with a non-numeric counter", () => {
  assertFalse(isConnection({ ...connection, events_sent: "42" }))
})

Deno.test("isConnectionArray - accepts an array of connections", () => {
  assert(isConnectionArray([connection]))
})

Deno.test("isConnectionArray - rejects a non-array", () => {
  assertFalse(isConnectionArray(connection))
})

Deno.test("isConnectionOrNull - accepts null", () => {
  assert(isConnectionOrNull(null))
})

Deno.test("isConnectionOrNull - accepts a connection", () => {
  assert(isConnectionOrNull(connection))
})

Deno.test("isConnectionOrNull - rejects a malformed value", () => {
  assertFalse(isConnectionOrNull({ id: "conn-1" }))
})

Deno.test("isSubscription - accepts a well-formed subscription record", () => {
  assert(isSubscription(subscription))
})

Deno.test("isSubscription - rejects a record with a non-record filter", () => {
  assertFalse(isSubscription({ ...subscription, filters: ["kinds"] }))
})

Deno.test("isSubscription - rejects a record missing the owning client", () => {
  const { client_id: _, ...withoutClientId } = subscription
  assertFalse(isSubscription(withoutClientId))
})

Deno.test("isSubscriptionArray - accepts an array of subscriptions", () => {
  assert(isSubscriptionArray([subscription]))
})

Deno.test("isSubscriptionArray - rejects a non-array", () => {
  assertFalse(isSubscriptionArray(subscription))
})

Deno.test("isExploreResult - accepts a full period/data payload", () => {
  assert(isExploreResult(exploreResult))
})

Deno.test("isExploreResult - rejects data missing a leaderboard", () => {
  assertFalse(isExploreResult({ period: "24h", data: {} }))
})

Deno.test("isExploreResult - rejects a malformed leaderboard entry", () => {
  assertFalse(isExploreResult({
    period: "24h",
    data: { ...exploreResult.data, most_followed: [{ pubkey: "abc" }] },
  }))
})

Deno.test("isExploreResult - rejects a malformed trending hashtag", () => {
  assertFalse(isExploreResult({
    period: "24h",
    data: { ...exploreResult.data, trending_hashtags: [{ hashtag: 1, count: 2 }] },
  }))
})

Deno.test("isExploreResult - rejects a malformed zapped-note entry", () => {
  assertFalse(isExploreResult({
    period: "24h",
    data: { ...exploreResult.data, most_zapped_notes: [{ event_id: "def" }] },
  }))
})

Deno.test("isExploreResult - rejects a record with non-record data", () => {
  assertFalse(isExploreResult({ period: "24h", data: [] }))
})

Deno.test("isExploreResult - rejects a record with an unknown period", () => {
  assertFalse(isExploreResult({ period: "12h", data: exploreResult.data }))
})

Deno.test("parseExplorePeriod - returns each known period verbatim", () => {
  assertEquals(parseExplorePeriod("24h"), "24h")
  assertEquals(parseExplorePeriod("7d"), "7d")
  assertEquals(parseExplorePeriod("30d"), "30d")
  assertEquals(parseExplorePeriod("all"), "all")
})

Deno.test("parseExplorePeriod - returns null for an unknown period", () => {
  assertEquals(parseExplorePeriod("12h"), null)
})
