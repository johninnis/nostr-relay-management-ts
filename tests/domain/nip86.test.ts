import { assert, assertFalse } from "@std/assert"
import {
  isBlockedIp,
  isBlockedIpArray,
  isModeratedEvent,
  isModeratedEventArray,
  isModeratedPubkey,
  isModeratedPubkeyArray,
} from "../../src/domain/nip86.ts"

const pubkeyA = "a".repeat(64)
const pubkeyB = "b".repeat(64)
const eventId = "c".repeat(64)

Deno.test("isModeratedPubkey - accepts a pubkey/reason record", () => {
  assert(isModeratedPubkey({ pubkey: pubkeyA, reason: "spam" }))
})

Deno.test("isModeratedPubkey - rejects a record missing reason", () => {
  assertFalse(isModeratedPubkey({ pubkey: pubkeyA }))
})

Deno.test("isModeratedPubkey - rejects a record whose pubkey is not 64-char lowercase hex", () => {
  assertFalse(isModeratedPubkey({ pubkey: "abc", reason: "spam" }))
  assertFalse(isModeratedPubkey({ pubkey: pubkeyA.toUpperCase(), reason: "spam" }))
})

Deno.test("isModeratedPubkeyArray - accepts an array of pubkey/reason records", () => {
  assert(isModeratedPubkeyArray([{ pubkey: pubkeyA, reason: "spam" }, { pubkey: pubkeyB, reason: "" }]))
})

Deno.test("isModeratedPubkeyArray - rejects an array with a malformed entry", () => {
  assertFalse(isModeratedPubkeyArray([{ pubkey: pubkeyA, reason: "spam" }, { pubkey: pubkeyB }]))
})

Deno.test("isModeratedEvent - accepts an id/reason record", () => {
  assert(isModeratedEvent({ id: eventId, reason: "needs review" }))
})

Deno.test("isModeratedEvent - rejects a record missing id", () => {
  assertFalse(isModeratedEvent({ reason: "needs review" }))
})

Deno.test("isModeratedEvent - rejects a record whose id is not 64-char lowercase hex", () => {
  assertFalse(isModeratedEvent({ id: "ev1", reason: "needs review" }))
})

Deno.test("isModeratedEventArray - accepts an array of id/reason records", () => {
  assert(isModeratedEventArray([{ id: eventId, reason: "needs review" }]))
})

Deno.test("isModeratedEventArray - rejects a non-array", () => {
  assertFalse(isModeratedEventArray({ id: eventId, reason: "needs review" }))
})

Deno.test("isBlockedIp - accepts an ip/reason record", () => {
  assert(isBlockedIp({ ip: "192.0.2.1", reason: "spam" }))
})

Deno.test("isBlockedIp - rejects a record missing reason", () => {
  assertFalse(isBlockedIp({ ip: "192.0.2.1" }))
})

Deno.test("isBlockedIp - rejects non-records", () => {
  assertFalse(isBlockedIp(null))
  assertFalse(isBlockedIp("192.0.2.1"))
})

Deno.test("isBlockedIpArray - accepts an array of blocked ips", () => {
  assert(isBlockedIpArray([{ ip: "192.0.2.1", reason: "spam" }, { ip: "192.0.2.2", reason: "" }]))
})

Deno.test("isBlockedIpArray - accepts an empty array", () => {
  assert(isBlockedIpArray([]))
})

Deno.test("isBlockedIpArray - rejects an array with a malformed entry", () => {
  assertFalse(isBlockedIpArray([{ ip: "192.0.2.1", reason: "spam" }, { ip: "192.0.2.2" }]))
})

Deno.test("isBlockedIpArray - rejects non-arrays", () => {
  assertFalse(isBlockedIpArray({ ip: "192.0.2.1", reason: "spam" }))
})
