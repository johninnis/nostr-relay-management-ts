// JSON.stringify is the only sanctioned JSON serialiser and signals failure (BigInt, cycles) by throwing;
// serialiseRpcBody catches that single throw and returns a Result, keeping the public RPC boundary throw-free.
// deno-lint-ignore-file innis/no-catch-in-layer

import type { HttpResponse, Result } from "@innis/nostr-core"
import { buildNip98AuthEvent, DEFAULT_AUTH_EXPIRATION_SECONDS, encodeAuthHeader, failure, ok } from "@innis/nostr-core"
import type { RelayManagementError } from "../domain/errors.ts"
import { MalformedResultError, RpcError } from "../domain/errors.ts"
import type { ManagementUrl } from "../domain/types.ts"
import type { RelayManagementDeps } from "./ports.ts"

/** Input to an {@link Rpc} call: the relay's {@link ManagementUrl}, the NIP-86 `method` name, its positional `params`, and optional abort controls forwarded verbatim to the `HttpClient` (`timeoutMs` caps the headers exchange; `signal` aborts the in-flight call). */
export interface RpcInput {
  readonly relayUrl: ManagementUrl
  readonly method: string
  readonly params: ReadonlyArray<unknown>
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

/** An {@link RpcInput} plus the `guard` that parses the call's untyped `result` into `T` — e.g. `isAcknowledged` for a mutation, `isRelayStats` for `getstats`. */
export interface GuardedRpcInput<T> extends RpcInput {
  readonly guard: (value: unknown) => value is T
}

/**
 * A signed NIP-86 management RPC. Given a {@link GuardedRpcInput}, resolves to the `result` narrowed to `T`, or a
 * {@link MalformedResultError} when the guard rejects it; given a plain {@link RpcInput}, resolves to the `unknown`
 * `result`. Every other failure is a {@link RelayManagementError}.
 */
export interface Rpc {
  <T>(input: GuardedRpcInput<T>): Promise<Result<T, RelayManagementError>>
  (input: RpcInput): Promise<Result<unknown, RelayManagementError>>
}

/** Build the NIP-86 RPC client: signs each call as a kind-27235 NIP-98 auth event and POSTs it as `application/nostr+json+rpc`, returning the response `result` (narrowed by the call's `guard`, when given) or a {@link RelayManagementError}. */
export const createRpc = (deps: RelayManagementDeps): Rpc => {
  const { signer, httpClient } = deps

  const send = async (input: RpcInput): Promise<Result<unknown, RelayManagementError>> => {
    const bodyResult = serialiseRpcBody(input.method, input.params)
    if (!bodyResult.success) return bodyResult
    const body = bodyResult.value

    const unsigned = await buildNip98AuthEvent({
      url: input.relayUrl,
      method: "POST",
      body,
      expiresInSeconds: DEFAULT_AUTH_EXPIRATION_SECONDS,
    })

    const signResult = await signer.sign(unsigned)
    if (!signResult.success) return signResult

    const response = await httpClient.request({
      url: input.relayUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/nostr+json+rpc",
        "Authorization": encodeAuthHeader(signResult.value),
      },
      body,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    })

    if (!response.success) return response

    return parseRpcResponse(response.value)
  }

  function rpc<T>(input: GuardedRpcInput<T>): Promise<Result<T, RelayManagementError>>
  function rpc(input: RpcInput): Promise<Result<unknown, RelayManagementError>>
  async function rpc(
    input: RpcInput & { readonly guard?: (value: unknown) => boolean },
  ): Promise<Result<unknown, RelayManagementError>> {
    const response = await send(input)
    if (!response.success || input.guard === undefined || input.guard(response.value)) return response
    return failure(new MalformedResultError(input.method, response.value))
  }

  return rpc
}

const serialiseRpcBody = (
  method: string,
  params: ReadonlyArray<unknown>,
): Result<string, RpcError> => {
  try {
    return ok(JSON.stringify({ method, params }))
  } catch (error) {
    return failure(new RpcError("Failed to serialise RPC request body", error))
  }
}

const parseRpcResponse = async (
  response: HttpResponse,
): Promise<Result<unknown, RelayManagementError>> => {
  const dataResult = await response.json()
  if (!dataResult.success) return dataResult
  const data = dataResult.value

  if (typeof data !== "object" || data === null) {
    return failure(new RpcError("Invalid RPC response: not an object"))
  }

  if ("error" in data && data.error !== undefined && data.error !== null) {
    const message = typeof data.error === "string" ? data.error : JSON.stringify(data.error)
    return failure(new RpcError(message, data.error))
  }

  if ("result" in data) {
    return ok(data.result)
  }

  return failure(new RpcError("Invalid RPC response: missing result and error"))
}
