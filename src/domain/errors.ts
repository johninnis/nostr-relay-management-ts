import type { NetworkError, ServerError, SigningError } from "@innis/nostr-core"
import { TaggedError } from "@innis/nostr-core"

/** A NIP-86 RPC call returned an `error`, or the response was malformed. Carries the `"RpcError"` tag and the original error payload as `cause`. */
export class RpcError extends TaggedError<"RpcError"> {
  constructor(message: string, cause?: unknown) {
    super("RpcError", message, cause)
  }
}

/** Every failure a relay-management RPC can return: a `SigningError`, an HTTP `>= 400` `ServerError`, an {@link RpcError}, or a transport `NetworkError`. Each carries a `tag` discriminant. */
export type RelayManagementError =
  | SigningError
  | ServerError
  | NetworkError
  | RpcError
