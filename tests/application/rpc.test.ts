import { assert, assertEquals, assertRejects } from "@std/assert"
import { createHttpClient, failure, InvalidArgumentError } from "@innis/nostr-core"
import type { RpcInput } from "../../src/application/rpc.ts"
import { createRpc } from "../../src/application/rpc.ts"
import type { RateLimits, RelayStats } from "../../src/domain/hubstr.ts"
import { isRelayStats } from "../../src/domain/hubstr.ts"
import { isAcknowledged } from "../../src/domain/nip86.ts"
import {
  createCapturingHttpClient,
  createFailingSigner,
  createFakeHttpClient,
  createFakeSigner,
  createFakeSuccessResponse,
} from "../_helpers/fakes.ts"
import { httpUrlFixture } from "@innis/nostr-core/testing"

const relayUrl = httpUrlFixture("https://relay.example/management")

Deno.test("createRpc - signs the request and returns the result value on success", async () => {
  const { client, requests } = createCapturingHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ result: ["banpubkey", "listblockedips"] })),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient: client })

  const result = await rpc({ relayUrl, method: "supportedmethods", params: [] })

  assert(result.success)
  assertEquals(result.value, ["banpubkey", "listblockedips"])
  assertEquals(requests.length, 1)
  const request = requests[0]
  assert(request)
  assertEquals(request.url, relayUrl)
  assertEquals(request.method, "POST")
  assertEquals(request.headers?.["Content-Type"], "application/nostr+json+rpc")
  assert(request.headers?.["Authorization"]?.startsWith("Nostr "))
  assertEquals(request.body, JSON.stringify({ method: "supportedmethods", params: [] }))
})

Deno.test("createRpc - signs an auth event bearing a NIP-98 expiration tag in the future", async () => {
  const { client, requests } = createCapturingHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ result: true })),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient: client })

  const result = await rpc({ relayUrl, method: "banpubkey", params: ["abc"] })

  assert(result.success)
  const header = requests[0]?.headers?.["Authorization"]
  assert(header)
  const event = JSON.parse(atob(header.slice("Nostr ".length)))
  const expiration = event.tags.find((tag: ReadonlyArray<string>) => tag[0] === "expiration")
  assert(expiration)
  assert(Number(expiration[1]) > event.created_at)
})

Deno.test("createRpc - forwards its signal to the http client", async () => {
  const { client, requests } = createCapturingHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ result: true })),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient: client })
  const controller = new AbortController()

  const result = await rpc({
    relayUrl,
    method: "banpubkey",
    params: ["abc"],
    signal: controller.signal,
  })

  assert(result.success)
  const request = requests[0]
  assert(request)
  assertEquals(request.signal, controller.signal)
})

Deno.test("createRpc - treats a null error field as absent and returns the result", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ result: true, error: null })),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "banpubkey", params: ["abc", "spam"] })

  assert(result.success)
  assertEquals(result.value, true)
})

Deno.test("createRpc - maps a JSON-RPC error response to an RpcFailure", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ error: "not authorised" })),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "banpubkey", params: ["abc", "spam"] })

  assert(!result.success)
  assertEquals(result.error, { type: "rpc", message: "not authorised" })
})

Deno.test("createRpc - refuses an envelope whose error is neither a string nor null (shared ADR-0037)", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ error: { code: 401, message: "nope" } })),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "banpubkey", params: ["abc"] })

  assertEquals(result, failure({ type: "rpc", message: "Invalid RPC response: error is neither a string nor null" }))
})

Deno.test("createRpc - reads an empty-string error beside a result as a success (shared ADR-0037)", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ result: true, error: "" })),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "banpubkey", params: ["abc"] })

  assertEquals(result, { success: true, value: true })
})

Deno.test("createRpc - refuses an envelope whose only error is the empty string, as it states no outcome (shared ADR-0037)", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ error: "" })),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "banpubkey", params: ["abc"] })

  assertEquals(result, failure({ type: "rpc", message: "Invalid RPC response: missing result and error" }))
})

Deno.test("createRpc - propagates a signing failure without making a request", async () => {
  const { client, requests } = createCapturingHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ result: true })),
  )
  const rpc = createRpc({ signer: createFailingSigner(), httpClient: client })

  const result = await rpc({ relayUrl, method: "banpubkey", params: ["abc"] })

  assert(!result.success)
  assertEquals(result.error, { type: "sign-failed", message: "Test signing failure" })
  assertEquals(requests.length, 0)
})

Deno.test("createRpc - a response body that is not JSON is an rpc failure, not a network one", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, "<html>bad gateway</html>"))
  const result = await createRpc({ signer: createFakeSigner(), httpClient })({
    relayUrl,
    method: "supportedmethods",
    params: [],
  })
  assertEquals(result, failure({ type: "rpc", message: "Invalid RPC response: not JSON" }))
})

Deno.test("createRpc - fails when the response body is not an object", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, JSON.stringify("nope")))
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "supportedmethods", params: [] })

  assert(!result.success)
  assertEquals(result.error, { type: "rpc", message: "Invalid RPC response: not an object" })
})

Deno.test("createRpc - refuses a response body that is a JSON list, not an object (shared ADR-0092)", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, JSON.stringify([{ result: true }])))
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "supportedmethods", params: [] })

  assertEquals(result, failure({ type: "rpc", message: "Invalid RPC response: not an object" }))
})

Deno.test("createRpc - throws when the method is empty, a programmer fault, without making a request", async () => {
  const { client, requests } = createCapturingHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ result: true })),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient: client })

  await assertRejects(() => rpc({ relayUrl, method: "", params: [] }), InvalidArgumentError)
  assertEquals(requests.length, 0)
})

Deno.test("createRpc - fails when the response carries only a null error", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, JSON.stringify({ error: null })))
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "supportedmethods", params: [] })

  assert(!result.success)
  assertEquals(result.error, { type: "rpc", message: "Invalid RPC response: missing result and error" })
})

Deno.test("createRpc - fails when the response has neither result nor error", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, JSON.stringify({})))
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "supportedmethods", params: [] })

  assert(!result.success)
  assertEquals(result.error, { type: "rpc", message: "Invalid RPC response: missing result and error" })
})

Deno.test("createRpc - refuses at compile time params that JSON cannot write", () => {
  // @ts-expect-error: a bigint has no JSON form
  const input: RpcInput<ReadonlyArray<bigint>> = { relayUrl, method: "banpubkey", params: [10n] }
  assertEquals(input.method, "banpubkey")
})

Deno.test("createRpc - sends params typed by an interface, as a NIP-86 object parameter", async () => {
  const { client, requests } = createCapturingHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ result: true })),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient: client })
  const limits: RateLimits = { events_per_minute: 60, subscriptions_per_minute: 30 }

  const result = await rpc({ relayUrl, method: "setratelimits", params: [limits], guard: isAcknowledged })

  assert(result.success)
  assertEquals(requests[0]?.body, JSON.stringify({ method: "setratelimits", params: [limits] }))
})

Deno.test("createRpc - throws when params are cyclic, a programmer fault, without making a request", async () => {
  interface Link {
    next: Link | null
  }
  const { client, requests } = createCapturingHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ result: true })),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient: client })
  const link: Link = { next: null }
  link.next = link

  await assertRejects(() => rpc({ relayUrl, method: "banpubkey", params: [link] }), TypeError)
  assertEquals(requests.length, 0)
})

Deno.test("createRpc - propagates a transport-layer failure", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(401, "", { "x-reason": "unauthorised" }),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "banpubkey", params: ["abc"] })

  assert(!result.success)
  assertEquals(result.error.type, "server")
})

const stats = {
  events: 1,
  tags: 2,
  follows: 3,
  mutes: 4,
  relays: 5,
  zaps: 6,
  known_pubkeys: 7,
  events_by_kind: [{ kind: 1, count: 1 }],
  events_by_tenant: [],
}

Deno.test("createRpc - returns the guard-narrowed result when the guard accepts it", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, JSON.stringify({ result: stats })))
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "getstats", params: [], guard: isRelayStats })

  assert(result.success)
  const typed: RelayStats = result.value
  assertEquals(typed, stats)
})

Deno.test("createRpc - fails with a MalformedResultFailure naming the method when the guard rejects the result", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, JSON.stringify({ result: 42 })))
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "getstats", params: [], guard: isRelayStats })

  assert(!result.success)
  assertEquals(result.error, { type: "malformed-result", method: "getstats" })
})

Deno.test("createRpc - a guarded call passes transport failures through unchanged", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, JSON.stringify({ error: "not authorised" })))
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "banpubkey", params: ["abc"], guard: isAcknowledged })

  assert(!result.success)
  assertEquals(result.error.type, "rpc")
})

Deno.test("createRpc - without a guard returns the result as an unvalidated JsonValue", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, JSON.stringify({ result: 42 })))
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "getstats", params: [] })

  assert(result.success)
  // @ts-expect-error an unguarded result is a `JsonValue` and must be narrowed before use
  const narrowed: number = result.value
  assertEquals(narrowed, 42)
})

const answeringFetch = (response: () => Response): { fetch: typeof globalThis.fetch; urls: Array<string> } => {
  const urls: Array<string> = []
  return {
    fetch: (input) => {
      urls.push(String(input))
      return Promise.resolve(response())
    },
    urls,
  }
}

Deno.test("createRpc - reaches a relay the user runs on a loopback address through a client that allows one", async () => {
  const stub = answeringFetch(() => new Response(JSON.stringify({ result: true })))
  const rpc = createRpc({ signer: createFakeSigner(), httpClient: createHttpClient("allow-private", stub.fetch) })

  const result = await rpc({ relayUrl: httpUrlFixture("http://127.0.0.1:7777"), method: "banpubkey", params: [] })

  assertEquals(result, { success: true, value: true })
})

Deno.test("createRpc - reaches a relay the user runs on a private network address through a client that allows one", async () => {
  const stub = answeringFetch(() => new Response(JSON.stringify({ result: true })))
  const rpc = createRpc({ signer: createFakeSigner(), httpClient: createHttpClient("allow-private", stub.fetch) })

  await rpc({ relayUrl: httpUrlFixture("http://192.168.1.20/admin"), method: "banpubkey", params: [] })

  assertEquals(stub.urls, ["http://192.168.1.20/admin"])
})

Deno.test("createRpc - still refuses to follow a redirect from the relay", async () => {
  const stub = answeringFetch(() =>
    new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } })
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient: createHttpClient("allow-private", stub.fetch) })

  const result = await rpc({ relayUrl: httpUrlFixture("http://localhost:7777"), method: "banpubkey", params: [] })

  assertEquals(result.success ? null : result.error.type, "server")
})

Deno.test("createRpc - leaves the response body ceiling at the client default", async () => {
  const { client, requests } = createCapturingHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ result: true })),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient: client })

  await rpc({ relayUrl, method: "banpubkey", params: [] })

  assertEquals(requests[0]?.maxBodyBytes, undefined)
})

Deno.test("createRpc - takes its params as a list, never a JSON object (shared ADR-0037, ADR-0092)", () => {
  // @ts-expect-error: NIP-86 params are a list, and an empty object is not an empty list
  const input: RpcInput = { relayUrl, method: "supportedmethods", params: {} }
  assertEquals(input.method, "supportedmethods")
})

Deno.test("createRpc - sends nothing and returns an rpc failure when the NIP-98 header is longer than a relay reads", async () => {
  const { client, requests } = createCapturingHttpClient(createFakeSuccessResponse(200, JSON.stringify({ result: [] })))
  const rpc = createRpc({
    signer: createFakeSigner(),
    httpClient: client,
  })
  const longUrl = httpUrlFixture(`https://relay.example/${"a".repeat(4096)}`)

  const result = await rpc({ relayUrl: longUrl, method: "supportedmethods", params: [] })

  assertEquals([result.success ? null : result.error.type, requests.length], ["rpc", 0])
})
