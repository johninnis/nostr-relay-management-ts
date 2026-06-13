# @innis/nostr-relay-management

[![CI](https://github.com/johninnis/nostr-relay-management-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/johninnis/nostr-relay-management-ts/actions/workflows/ci.yml)

Building blocks for talking to a Nostr relay's HTTP management surface: a signed NIP-86 RPC client. The kind 27235 auth event template lives in `@innis/nostr-core` (`buildNip98AuthEvent`) — this package consumes it. Concrete NIP-86 method-creator factories (`createBanPubkey`, `createListBlockedIps`, etc.) are **not** in this package — the lib exposes the primitives a caller composes them from. Pre-built data-shape types covering the most common NIP-86 / Hubstr-extension responses ship alongside.

The shape mirrors `@innis/nostr-blossom`: signer + HTTP client are injected, every operation returns `Result<T, RelayManagementError>`, no exceptions are thrown internally.

## Public surface

### Domain — `src/domain/types.ts`, `src/domain/nip86.ts`, `src/domain/hubstr.ts` + `src/domain/errors.ts`

The data shapes are split by origin: standard NIP-86 spec payloads live in `nip86.ts`, the relay's non-standard extensions live in `hubstr.ts`, and transport-level primitives live in `types.ts`. Everything is re-exported flat from `mod.ts`.

- **Transport — `types.ts`**: `ManagementUrl` — branded `string` for an HTTP(S) management endpoint, built with `@innis/nostr-core`'s `createBrand` (same brand quad as `RelayUrl` / `PublicKey`). `parseManagementUrl(raw)` requires a URL-parseable `http:`/`https:` endpoint and throws `InvalidManagementUrlError` (a `TaggedError`) on rejection; `isValidManagementUrl(raw)` is the non-throwing type guard. Like `RelayUrl`, it canonicalises before branding — scheme and host are lowercased and a trailing slash is stripped, while path casing is preserved — so the same endpoint always brands to the same value and the signed NIP-98 `u` tag matches the request URL. Generic guards (`isArrayOf`, `isStringArray`, `isRecord`, …) live in `@innis/nostr-core` — import them from there; every array guard in this package is built on `isArrayOf`, and your own should be too.
- **Errors — `errors.ts`**: `RelayManagementError = SigningError | ServerError | NetworkError | RpcError`. Imported via `import type { RelayManagementError } from "@innis/nostr-relay-management"`. `SigningError`, `ServerError` and `NetworkError` come from `@innis/nostr-core`; `RpcError` is local to this package.
- **NIP-86 spec shapes — `nip86.ts`**: the [NIP-86 spec](https://github.com/nostr-protocol/nips/blob/master/86.md) moderation-list methods return three distinct payload shapes — `ModeratedPubkey` (`{ pubkey, reason }`, returned by both `listbannedpubkeys` and `listallowedpubkeys`), `ModeratedEvent` (`{ id, reason }`, returned by both `listbannedevents` and `listeventsneedingmoderation`), and `BlockedIp` (`{ ip, reason }`, returned by `listblockedips`). Each ships a guard pair: `isModeratedPubkey`/`isModeratedPubkeyArray`, `isModeratedEvent`/`isModeratedEventArray`, `isBlockedIp`/`isBlockedIpArray`. (The ban/allow distinction lives in the method name, not the payload — the shapes are identical, so one type serves both.) `pubkey` and `id` are `@innis/nostr-core`'s branded `PublicKey` / `EventId` — the guards validate 64-char lowercase hex, so a passing value is immediately usable across the `@innis/*` stack with no re-parsing.
- **Hubstr-extension shapes — `hubstr.ts`**: `Connection`, `ConnectionSubscription`, `Subscription`, `RelayStats`, `KindCount`, `TenantCount`, `RateLimits`, `GuestPolicy` / `GuestReadPolicy` / `GuestWritePolicy`, `ExplorePeriod`, `ExploreData`, `ExploreResult`, `HashtagEntry`, `PubkeyEntry`, `EventIdEntry` (+ guards `isConnection*`, `isSubscription`/`isSubscriptionArray`, `isRelayStats`, `isRateLimits`, `isGuestPolicy`, `isExploreResult`, and the `parseExplorePeriod` parser). These describe the relay's non-standard methods (`getstats`, `listconnections`, `listsubscriptions`, `getguestpolicy`/`setguestpolicy`, `getratelimits`/`setratelimits`, `explore`) — a vanilla NIP-86 relay rejects them. As in `nip86.ts`, pubkey-keyed and event-id-keyed fields (`TenantCount.pubkey`, `PubkeyEntry.pubkey`, `EventIdEntry.event_id`) are branded `PublicKey` / `EventId`.

Because `Rpc` resolves to `Result<unknown, …>`, method factories narrow the `unknown` result against these shapes (via the exported type guards — `isConnection`, `isRelayStats`, `isBlockedIpArray`, etc. — or their own checks).

### Ports — `src/application/ports.ts`

```ts
interface RelayManagementSigner {
  readonly sign: (event: UnsignedEvent) => Promise<Result<NostrEvent, SigningError>>
}

interface RelayManagementDeps {
  readonly signer: RelayManagementSigner
  readonly httpClient: HttpClient
}
```

`RelayManagementSigner` is the Result-returning narrowing of `@innis/nostr-core`'s throwing `Signer`: the package never throws internally, so signing failures arrive as `Failure(SigningError)` rather than exceptions. It declares only `sign` because that is the single capability the RPC boundary uses. Build one from any core `Signer` with `adaptSigner` (`src/infrastructure/signer-adapter.ts`) — the package's single infrastructure boundary and the one place a thrown signing error becomes a `Failure(SigningError)`, mirroring `@innis/nostr-blossom`'s adapter:

```ts
const deps: RelayManagementDeps = { signer: adaptSigner(signer), httpClient }
```

`HttpClient` is the same shape as `@innis/nostr-blossom`'s — one fetch adapter satisfies both.

### RPC client — `src/application/rpc.ts`

```ts
interface RpcInput {
  readonly relayUrl: ManagementUrl
  readonly method: string
  readonly params: ReadonlyArray<unknown>
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

type Rpc = (input: RpcInput) => Promise<Result<unknown, RelayManagementError>>

const rpc: Rpc = createRpc({ signer, httpClient })
```

`Rpc` is **not** generic — it always resolves to `Result<unknown, RelayManagementError>`. The caller is responsible for narrowing the `unknown` result value (see the method-factory pattern below).

`createRpc(deps)` is the single boundary every NIP-86 call goes through. It:

1. JSON-encodes `{ method, params }`.
2. SHA-256 hashes the request body.
3. Builds the kind 27235 auth event via `@innis/nostr-core`'s `buildNip98AuthEvent` — bounded with a NIP-98 `expiration` tag (`DEFAULT_AUTH_EXPIRATION_SECONDS` from now) — and signs it.
4. `POST`s `application/nostr+json+rpc` with the `Nostr <base64>` `Authorization` header, forwarding any `timeoutMs` / `signal` abort controls to the `HttpClient`.
5. Parses the JSON-RPC response — `{ result }` → `Success`, `{ error }` → `Failure(RpcError)`. A `null` error field counts as absent (some NIP-86 implementations serialise both fields on success).

Direct `httpClient.request` calls bypass the signing path and should not be made from method factories — they exist as a building block, not a fallback.

## Writing a method factory

NIP-86 methods are not packaged as factories because the spec keeps adding methods and each consumer typically only needs a handful. The pattern is small:

`Rpc` is non-generic and resolves to `Result<unknown, …>`, so a factory narrows the result itself before returning a typed value:

```ts
import { failure, ok, type PublicKey, type Result } from "@innis/nostr-core"
import {
  isConnectionArray,
  type ManagementUrl,
  type RelayManagementError,
  RpcError,
  type Rpc,
  type Connection,
} from "@innis/nostr-relay-management"

export const createBanPubkey = (rpc: Rpc) =>
  async (relayUrl: ManagementUrl, pubkey: PublicKey, reason: string): Promise<Result<true, RelayManagementError>> => {
    const result = await rpc({ relayUrl, method: "banpubkey", params: [pubkey, reason] })
    if (!result.success) return result
    return ok(true)
  }

export const createListConnections = (rpc: Rpc) =>
  async (relayUrl: ManagementUrl): Promise<Result<ReadonlyArray<Connection>, RelayManagementError>> => {
    const result = await rpc({ relayUrl, method: "listconnections", params: [] })
    if (!result.success) return result
    if (!isConnectionArray(result.value)) return failure(new RpcError("Unexpected listconnections payload"))
    return ok(result.value)
  }
```

The exported type guards (`isConnectionArray`, `isRelayStats`, `isBlockedIpArray`, `isGuestPolicy`, …) are the sanctioned way to turn the `unknown` RPC value into a typed result.

## Anti-patterns

- **Calling `httpClient.request` directly for NIP-86 operations.** Use `Rpc`. It centralises auth and response parsing.
- **Hand-rolling the kind 27235 template.** Use `buildNip98AuthEvent` from `@innis/nostr-core` — the tag layout is one place.
- **Assuming a relay supports a given method.** A vanilla NIP-86 relay rejects Hubstr-extension methods; surface the `RpcError` rather than treating an unknown-method failure as a bug.
- **Using a `wss://` URL as `ManagementUrl`.** It must be an HTTP(S) management endpoint — `parseManagementUrl` requires a URL-parseable `http:`/`https:` value and throws `InvalidManagementUrlError` otherwise.
- **Hand-rolling the `Signer` → `RelayManagementSigner` try/catch.** Use `adaptSigner` — it is the one sanctioned bridge from the throwing core signer.
- **Catching `RpcError` to retry blindly.** It carries the relay's actual error message; surface it. Retrying a `banpubkey` after an "unauthorised" failure will not change the answer.
