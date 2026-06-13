import { assert, assertEquals } from "@std/assert"
import { createRpc } from "../../src/application/rpc.ts"
import { RpcError } from "../../src/domain/errors.ts"
import { parseManagementUrl } from "../../src/domain/types.ts"
import {
  createCapturingHttpClient,
  createFailingSigner,
  createFakeHttpClient,
  createFakeSigner,
  createFakeSuccessResponse,
} from "../_helpers/fakes.ts"

const relayUrl = parseManagementUrl("https://relay.example/management")

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

Deno.test("createRpc - forwards timeoutMs and signal to the http client", async () => {
  const { client, requests } = createCapturingHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ result: true })),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient: client })
  const controller = new AbortController()

  const result = await rpc({
    relayUrl,
    method: "banpubkey",
    params: ["abc"],
    timeoutMs: 5000,
    signal: controller.signal,
  })

  assert(result.success)
  const request = requests[0]
  assert(request)
  assertEquals(request.timeoutMs, 5000)
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

Deno.test("createRpc - maps a JSON-RPC error response to a Failure(RpcError)", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ error: "not authorised" })),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "banpubkey", params: ["abc", "spam"] })

  assert(!result.success)
  assert(result.error instanceof RpcError)
  assertEquals(result.error.message, "not authorised")
})

Deno.test("createRpc - preserves a structured (non-string) error payload", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ error: { code: 401, message: "nope" } })),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "banpubkey", params: ["abc"] })

  assert(!result.success)
  assert(result.error instanceof RpcError)
  assertEquals(result.error.message, JSON.stringify({ code: 401, message: "nope" }))
  assertEquals(result.error.cause, { code: 401, message: "nope" })
})

Deno.test("createRpc - propagates a signing failure without making a request", async () => {
  const { client, requests } = createCapturingHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ result: true })),
  )
  const rpc = createRpc({ signer: createFailingSigner(), httpClient: client })

  const result = await rpc({ relayUrl, method: "banpubkey", params: ["abc"] })

  assert(!result.success)
  assertEquals(result.error.tag, "SigningError")
  assertEquals(requests.length, 0)
})

Deno.test("createRpc - fails when the response body is not an object", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, JSON.stringify("nope")))
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "supportedmethods", params: [] })

  assert(!result.success)
  assert(result.error instanceof RpcError)
  assertEquals(result.error.message, "Invalid RPC response: not an object")
})

Deno.test("createRpc - fails when the response carries only a null error", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, JSON.stringify({ error: null })))
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "supportedmethods", params: [] })

  assert(!result.success)
  assert(result.error instanceof RpcError)
  assertEquals(result.error.message, "Invalid RPC response: missing result and error")
})

Deno.test("createRpc - fails when the response has neither result nor error", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, JSON.stringify({})))
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "supportedmethods", params: [] })

  assert(!result.success)
  assert(result.error instanceof RpcError)
  assertEquals(result.error.message, "Invalid RPC response: missing result and error")
})

Deno.test("createRpc - fails with an RpcError when params cannot be serialised, without making a request", async () => {
  const { client, requests } = createCapturingHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ result: true })),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient: client })

  const result = await rpc({ relayUrl, method: "banpubkey", params: [10n] })

  assert(!result.success)
  assert(result.error instanceof RpcError)
  assertEquals(result.error.message, "Failed to serialise RPC request body")
  assertEquals(requests.length, 0)
})

Deno.test("createRpc - propagates a transport-layer failure", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(401, "", { "x-reason": "unauthorised" }),
  )
  const rpc = createRpc({ signer: createFakeSigner(), httpClient })

  const result = await rpc({ relayUrl, method: "banpubkey", params: ["abc"] })

  assert(!result.success)
  assertEquals(result.error.tag, "ServerError")
})
