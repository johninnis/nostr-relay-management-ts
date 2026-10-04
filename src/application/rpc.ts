import type { HttpResponse, HttpUrl, JsonSerialisable, JsonValue, Result } from "@innis/nostr-core"
import {
  buildNip98AuthEvent,
  DEFAULT_TIMESTAMP_TOLERANCE_SECONDS,
  encodeAuthHeader,
  failure,
  InvalidArgumentError,
  ok,
} from "@innis/nostr-core"
import type { RelayManagementFailure } from "../domain/failure/relay-management-failure.ts"
import type { RelayManagementDeps } from "./ports.ts"

/**
 * Input to an {@link Rpc} call: the relay's management endpoint, an `HttpUrl` (`wsToHttp` of its relay URL), the NIP-86
 * `method` name, its positional `params`, and an optional `signal`, forwarded verbatim to the `HttpClient`, that aborts
 * the in-flight call (a deadline is a signal too: `AbortSignal.timeout(ms)`). `params` is a list `JSON.stringify` writes
 * as JSON, so a bigint, a function, `undefined` or an un-narrowed `unknown` among them does not compile.
 */
export interface RpcInput<P extends ReadonlyArray<unknown> = ReadonlyArray<JsonValue>> {
  readonly relayUrl: HttpUrl
  readonly method: string
  readonly params: P & JsonSerialisable<P>
  readonly signal?: AbortSignal
}

/** An {@link RpcInput} plus the `guard` that parses the call's untyped `result` into `T` — e.g. `isAcknowledged` for a mutation, `isRelayStats` for `getstats`. */
export interface GuardedRpcInput<T, P extends ReadonlyArray<unknown> = ReadonlyArray<JsonValue>> extends RpcInput<P> {
  readonly guard: (value: unknown) => value is T
}

/**
 * A signed NIP-86 management RPC. Given a {@link GuardedRpcInput}, resolves to the `result` narrowed to `T`, or a
 * {@link MalformedResultFailure} when the guard rejects it; given a plain {@link RpcInput}, resolves to the `result`
 * as the `JsonValue` it is. Every other failure is a {@link RelayManagementFailure}.
 */
export interface Rpc {
  <T, P extends ReadonlyArray<unknown>>(input: GuardedRpcInput<T, P>): Promise<Result<T, RelayManagementFailure>>
  <P extends ReadonlyArray<unknown>>(input: RpcInput<P>): Promise<Result<JsonValue, RelayManagementFailure>>
}

/**
 * Build the NIP-86 RPC client: signs each call as a kind-27235 NIP-98 auth event and POSTs it as
 * `application/nostr+json+rpc`, returning the response `result` (narrowed by the call's `guard`, when given) or a
 * {@link RelayManagementFailure}. The relay is the user's own, so give it a client that reaches a loopback or
 * private-network address (`createHttpClient("allow-private")`) to administer one there; a redirect is still refused
 * and the body ceiling is the client's default. A NIP-98 header longer than the 4096 characters a relay reads is an
 * `rpc` failure, and nothing is sent. An empty `method` throws `InvalidArgumentError`, and a cyclic `params` value throws
 * `JSON.stringify`'s `TypeError`: both are programmer faults, and nothing is sent.
 */
export const createRpc = (deps: RelayManagementDeps): Rpc => {
  const { signer, httpClient } = deps

  const send = async (input: RpcInput<ReadonlyArray<unknown>>): Promise<Result<JsonValue, RelayManagementFailure>> => {
    if (input.method === "") throw new InvalidArgumentError("A NIP-86 request names its method, not the empty string")
    const body = JSON.stringify({ method: input.method, params: input.params })

    const unsigned = buildNip98AuthEvent({
      url: input.relayUrl,
      method: "POST",
      body,
      expiresInSeconds: DEFAULT_TIMESTAMP_TOLERANCE_SECONDS,
    })

    const signResult = await signer.signEvent(unsigned)
    if (!signResult.success) return signResult
    const authorization = encodeAuthHeader(signResult.value)
    if (authorization === null) {
      return failure({ type: "rpc", message: "Invalid RPC request: its NIP-98 header is longer than a relay reads" })
    }

    const response = await httpClient.request({
      url: input.relayUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/nostr+json+rpc",
        "Authorization": authorization,
      },
      body,
      signal: input.signal,
    })

    if (!response.success) return response

    return parseRpcResponse(response.value)
  }

  function rpc<T, P extends ReadonlyArray<unknown>>(
    input: GuardedRpcInput<T, P>,
  ): Promise<Result<T, RelayManagementFailure>>
  function rpc<P extends ReadonlyArray<unknown>>(input: RpcInput<P>): Promise<Result<JsonValue, RelayManagementFailure>>
  async function rpc(
    input: RpcInput<ReadonlyArray<unknown>> & { readonly guard?: (value: JsonValue) => boolean },
  ): Promise<Result<JsonValue, RelayManagementFailure>> {
    const response = await send(input)
    if (!response.success || input.guard === undefined || input.guard(response.value)) return response
    return failure({ type: "malformed-result", method: input.method })
  }

  return rpc
}

const parseRpcResponse = async (
  response: HttpResponse,
): Promise<Result<JsonValue, RelayManagementFailure>> => {
  const dataResult = await response.json()
  if (!dataResult.success) {
    return dataResult.error.type === "malformed-body"
      ? failure({ type: "rpc", message: "Invalid RPC response: not JSON" })
      : failure(dataResult.error)
  }
  const data = dataResult.value

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return failure({ type: "rpc", message: "Invalid RPC response: not an object" })
  }

  const error = "error" in data ? data.error : undefined
  if (typeof error === "string" && error !== "") return failure({ type: "rpc", message: error })
  if (error !== undefined && error !== null) {
    return failure({ type: "rpc", message: "Invalid RPC response: error is not a non-empty string" })
  }

  if ("result" in data) {
    return ok(data.result)
  }

  return failure({ type: "rpc", message: "Invalid RPC response: missing result and error" })
}
