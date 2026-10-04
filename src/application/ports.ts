import type { HttpClient, Signer } from "@innis/nostr-core"

/** The signing port used by the RPC client: the one `Signer` capability it needs. Any `@innis/nostr-core` `Signer` satisfies it, and a `SignerFailure` it returns is passed through as the call's `RelayManagementFailure`. */
export type RelayManagementSigner = Pick<Signer, "signEvent">

/** The collaborators {@link createRpc} takes: a {@link RelayManagementSigner} and an `HttpClient` transport, which decides whether a relay at a private address is reached. */
export interface RelayManagementDeps {
  readonly signer: RelayManagementSigner
  readonly httpClient: HttpClient
}
