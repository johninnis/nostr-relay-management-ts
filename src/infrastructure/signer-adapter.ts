import type { Signer } from "@innis/nostr-core"
import { failure, ok, SigningError } from "@innis/nostr-core"
import type { RelayManagementSigner } from "../application/ports.ts"

/** Adapt a throwing `@innis/nostr-core` `Signer` into the `Result`-returning {@link RelayManagementSigner} the RPC client expects. This is the library's single infrastructure boundary — the one place a thrown signing error becomes a `Failure(SigningError)`. */
export const adaptSigner = (signer: Signer): RelayManagementSigner => ({
  sign: async (event) => {
    try {
      return ok(await signer.signEvent(event))
    } catch (error) {
      return failure(new SigningError(error instanceof Error ? error.message : "Failed to sign event", error))
    }
  },
})
