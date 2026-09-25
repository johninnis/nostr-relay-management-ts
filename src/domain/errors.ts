import type { NetworkError, ServerError, SigningError } from "@innis/nostr-core"
import { TaggedError } from "@innis/nostr-core"

/** A NIP-86 RPC call returned an `error`, or the response was malformed. Carries the `"RpcError"` tag and the original error payload as `cause`. */
export class RpcError extends TaggedError<"RpcError"> {
  constructor(message: string, cause?: unknown) {
    super("RpcError", message, cause)
  }
}

/** A NIP-86 RPC answered without an `error`, but its `result` failed the caller's guard. Carries the `"MalformedResultError"` tag, the `method` called and the offending `result`. */
export class MalformedResultError extends TaggedError<"MalformedResultError"> {
  readonly method: string
  readonly result: unknown

  constructor(method: string, result: unknown) {
    super("MalformedResultError", `Malformed ${method} result`)
    this.method = method
    this.result = result
  }
}

/** Every failure a relay-management RPC can return: a `SigningError`, an HTTP `>= 400` `ServerError`, an {@link RpcError}, a transport `NetworkError`, or a {@link MalformedResultError} when a guarded call's `result` has the wrong shape. Each carries a `tag` discriminant. */
export type RelayManagementError =
  | SigningError
  | ServerError
  | NetworkError
  | RpcError
  | MalformedResultError
