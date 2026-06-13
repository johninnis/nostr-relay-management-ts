import type { HttpClient, NostrEvent, Result, SigningError, UnsignedEvent } from "@innis/nostr-core"

/** The `Result`-returning signing port used by the RPC client — a narrower view of `@innis/nostr-core`'s throwing `Signer` that keeps the call sites catch-free. Build one from a `Signer` via {@link adaptSigner}. */
export interface RelayManagementSigner {
  readonly sign: (event: UnsignedEvent) => Promise<Result<NostrEvent, SigningError>>
}

/** The dependency bundle {@link createRpc} takes: a {@link RelayManagementSigner} and an `HttpClient` transport. */
export interface RelayManagementDeps {
  readonly signer: RelayManagementSigner
  readonly httpClient: HttpClient
}
