import type { NetworkFailure, ServerFailure, SignerFailure } from "@innis/nostr-core"

/** A NIP-86 RPC answered with an `error`, or its request or response envelope was malformed (a NIP-98 header too long to be read among them); `message` is the relay's error or the defect. */
export interface RpcFailure {
  readonly type: "rpc"
  readonly message: string
}

/** A NIP-86 RPC answered without an `error`, but its `result` failed the caller's guard; `method` names the call. */
export interface MalformedResultFailure {
  readonly type: "malformed-result"
  readonly method: string
}

/** Every failure a relay-management RPC can return: the `SignerFailure` of a signer that did not sign the NIP-98 auth event, a `ServerFailure` (HTTP status `>= 400` or a refused redirect), a transport `NetworkFailure`, an {@link RpcFailure}, or a {@link MalformedResultFailure} when a guarded call's `result` has the wrong shape. Discriminate on `type`. */
export type RelayManagementFailure =
  | SignerFailure
  | ServerFailure
  | NetworkFailure
  | RpcFailure
  | MalformedResultFailure
