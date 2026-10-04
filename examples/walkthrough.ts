/**
 * Walkthrough of the main features of @innis/nostr-relay-management.
 *
 * Run with: `deno run examples/walkthrough.ts` (no permissions required — the relay is a stub
 * `HttpClient` answering NIP-86, so everything runs locally). Each step asserts what it shows.
 *
 * @module
 */

import { assert, assertEquals } from "@std/assert"
import {
  createLocalSigner,
  generateSecretKey,
  isRecord,
  ok,
  parseAuthHeader,
  parseJson,
  parsePublicKey,
  parseRelayUrl,
  wsToHttp,
} from "@innis/nostr-core"
import type { HttpClient, HttpResponse, JsonValue } from "@innis/nostr-core"
import { createRpc, isAcknowledged, isModeratedPubkeyArray } from "../mod.ts"

const banned: Array<{ pubkey: string; reason: string }> = []

const answer = (payload: JsonValue): HttpResponse => ({
  status: 200,
  headers: new Headers({ "content-type": "application/json" }),
  json: () => Promise.resolve(ok(payload)),
  text: () => Promise.resolve(ok(JSON.stringify(payload))),
  blob: () => Promise.resolve(ok(new Blob([JSON.stringify(payload)]))),
})

const stubRelay: HttpClient = {
  request: (request) => {
    const auth = parseAuthHeader(request.headers?.["Authorization"] ?? "")
    assert(auth.success, "every call carries a NIP-98 Authorization header")
    const body = parseJson(typeof request.body === "string" ? request.body : "")
    assert(body.success && isRecord(body.value))
    const params = Array.isArray(body.value.params) ? body.value.params : []
    if (body.value.method === "banpubkey") banned.push({ pubkey: String(params[0]), reason: String(params[1] ?? "") })
    if (body.value.method === "listbannedpubkeys") return Promise.resolve(ok(answer({ result: banned })))
    if (body.value.method === "banpubkey") return Promise.resolve(ok(answer({ result: true })))
    return Promise.resolve(ok(answer({ error: `unsupported method ${String(body.value.method)}` })))
  },
}

const relay = parseRelayUrl("wss://relay.example")
assert(relay !== null)
const relayUrl = wsToHttp(relay)
const rpc = createRpc({ signer: createLocalSigner(generateSecretKey()), httpClient: stubRelay })

const spammer = parsePublicKey("b".repeat(64))
assert(spammer !== null)
const ban = await rpc({ relayUrl, method: "banpubkey", params: [spammer, "spam"], guard: isAcknowledged })
assertEquals(ban, ok(true))

const list = await rpc({ relayUrl, method: "listbannedpubkeys", params: [], guard: isModeratedPubkeyArray })
assertEquals(list.success && list.value.map((entry) => entry.pubkey), [spammer])

const unknown = await rpc({ relayUrl, method: "frobnicate", params: [] })
assertEquals(unknown.success ? null : unknown.error, { type: "rpc", message: "unsupported method frobnicate" })
