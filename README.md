# @innis/nostr-relay-management

[![CI](https://github.com/johninnis/nostr-relay-management-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/johninnis/nostr-relay-management-ts/actions/workflows/ci.yml)

Building blocks for talking to a Nostr relay's HTTP management surface: a signed NIP-86 RPC client. The kind 27235 auth event template lives in `@innis/nostr-core` (`buildNip98AuthEvent`) — this package consumes it. Concrete NIP-86 method-creator factories (`createBanPubkey`, `createListBlockedIps`, etc.) are **not** in this package — the lib exposes the primitives a caller composes them from. Pre-built data-shape types covering the most common NIP-86 / Hubstr-extension responses ship alongside.

The shape mirrors `@innis/nostr-blossom`: signer + HTTP client are injected, every operation returns `Result<T, RelayManagementError>`, no exceptions are thrown internally — a relay answering with the wrong shape is a returned `MalformedResultError`, not a throw.

## Install

```bash
deno add jsr:@innis/nostr-relay-management
```

## Public surface

### Domain — `src/domain/types.ts`, `src/domain/nip86.ts`, `src/domain/hubstr.ts` + `src/domain/errors.ts`

The data shapes are split by origin: standard NIP-86 spec payloads live in `nip86.ts`, the relay's non-standard extensions live in `hubstr.ts`, and transport-level primitives live in `types.ts`. Everything is re-exported flat from `mod.ts`.

- **Transport — `types.ts`**: `ManagementUrl` — branded `string` for an HTTP(S) management endpoint, built with `@innis/nostr-core`'s `createBrand` (same brand quad as `RelayUrl` / `PublicKey`). `parseManagementUrl(raw)` requires a URL-parseable `http:`/`https:` endpoint and throws `InvalidManagementUrlError` (a `TaggedError`) on rejection; `isValidManagementUrl(raw)` is the non-throwing type guard. Like `RelayUrl`, it canonicalises before branding — scheme and host are lowercased and a trailing slash is stripped, while path casing is preserved — so the same endpoint always brands to the same value and the signed NIP-98 `u` tag matches the request URL. Generic guards (`isArrayOf`, `isStringArray`, `isRecord`, …) live in `@innis/nostr-core` — import them from there; every array guard in this package is built on `isArrayOf`, and your own should be too.
- **Errors — `errors.ts`**: `RelayManagementError = SigningError | ServerError | NetworkError | RpcError | MalformedResultError`, discriminated by `tag`. Imported via `import type { RelayManagementError } from "@innis/nostr-relay-management"`. `SigningError`, `ServerError` and `NetworkError` come from `@innis/nostr-core`; `RpcError` (the relay answered with an `error`, or the envelope was malformed) and `MalformedResultError` (a guarded call's `result` failed its guard — carries `method` and the offending `result`) are local to this package.
- **NIP-86 spec shapes — `nip86.ts`**: the [NIP-86 spec](https://github.com/nostr-protocol/nips/blob/master/86.md) moderation-list methods return three distinct payload shapes — `ModeratedPubkey` (`{ pubkey, reason? }`, returned by both `listbannedpubkeys` and `listallowedpubkeys`), `ModeratedEvent` (`{ id, reason? }`, returned by both `listbannedevents` and `listeventsneedingmoderation`), and `BlockedIp` (`{ ip, reason? }`, returned by `listblockedips`). Each ships a guard pair: `isModeratedPubkey`/`isModeratedPubkeyArray`, `isModeratedEvent`/`isModeratedEventArray`, `isBlockedIp`/`isBlockedIpArray`. Every NIP-86 mutation (`banpubkey`, `allowpubkey`, `blockip`, …) answers `result: true`; `isAcknowledged` is its guard. (The ban/allow distinction lives in the method name, not the payload — the shapes are identical, so one type serves both.) `pubkey` and `id` are `@innis/nostr-core`'s branded `PublicKey` / `EventId` — the guards validate 64-char lowercase hex, so a passing value is immediately usable across the `@innis/*` stack with no re-parsing.
- **Hubstr-extension shapes — `hubstr.ts`**: `Connection`, `ConnectionSubscription`, `Subscription`, `RelayStats`, `KindCount`, `TenantCount`, `RateLimits`, `GuestPolicy` / `GuestReadPolicy` / `GuestWritePolicy` / `TagPrefixRule`, `ExplorePeriod`, `ExploreData`, `ExploreResult`, `HashtagEntry`, `PubkeyEntry`, `EventIdEntry` (+ guards `isConnection*`, `isSubscription`/`isSubscriptionArray`, `isRelayStats`, `isRateLimits`, `isGuestPolicy`, `isExploreResult`, and the `parseExplorePeriod` parser). These describe the relay's non-standard methods (`getstats`, `listconnections`, `listsubscriptions`, `getguestpolicy`/`setguestpolicy`, `getratelimits`/`setratelimits`, `explore`) — a vanilla NIP-86 relay rejects them. As in `nip86.ts`, pubkey-keyed and event-id-keyed fields (`TenantCount.pubkey`, `PubkeyEntry.pubkey`, `EventIdEntry.event_id`) are branded `PublicKey` / `EventId`.

Pass one of these guards as an `Rpc` call's `guard` and the call resolves to the typed shape (see below).

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

interface GuardedRpcInput<T> extends RpcInput {
  readonly guard: (value: unknown) => value is T
}

interface Rpc {
  <T>(input: GuardedRpcInput<T>): Promise<Result<T, RelayManagementError>>
  (input: RpcInput): Promise<Result<unknown, RelayManagementError>>
}

const rpc: Rpc = createRpc({ signer, httpClient })
```

Give a call a `guard` and it resolves to `Result<T, RelayManagementError>`: the `result` is run through the guard, and one the guard rejects comes back as `Failure(MalformedResultError)` naming the `method` and holding the offending `result` — never a throw. Without a `guard` the call resolves to `Result<unknown, RelayManagementError>` and the caller narrows the value itself. `T` is inferred from the guard; there is no way to assert a type without supplying one.

```ts
const stats = await rpc({ relayUrl, method: "getstats", params: [], guard: isRelayStats })
if (stats.success) render(stats.value) // RelayStats
```

`createRpc(deps)` is the single boundary every NIP-86 call goes through. It:

1. JSON-encodes `{ method, params }`.
2. SHA-256 hashes the request body.
3. Builds the kind 27235 auth event via `@innis/nostr-core`'s `buildNip98AuthEvent` — bounded with a NIP-98 `expiration` tag (`DEFAULT_AUTH_EXPIRATION_SECONDS` from now) — and signs it.
4. `POST`s `application/nostr+json+rpc` with the `Nostr <base64>` `Authorization` header, forwarding any `timeoutMs` / `signal` abort controls to the `HttpClient`.
5. Parses the JSON-RPC response — `{ result }` → `Success`, `{ error }` → `Failure(RpcError)`. A `null` error field counts as absent (some NIP-86 implementations serialise both fields on success).
6. When the call carries a `guard`, checks `result` against it — rejected → `Failure(MalformedResultError)`.

Direct `httpClient.request` calls bypass the signing path and should not be made from method factories — they exist as a building block, not a fallback.

## Writing a method factory

NIP-86 methods are not packaged as factories because the spec keeps adding methods and each consumer typically only needs a handful. The pattern is small:

Pass the method's guard and return the call — the guarded `Rpc` already resolves to the typed `Result`:

```ts
import type { PublicKey, Result } from "@innis/nostr-core"
import {
  type Connection,
  isAcknowledged,
  isConnectionArray,
  type ManagementUrl,
  type RelayManagementError,
  type Rpc,
} from "@innis/nostr-relay-management"

export const createBanPubkey = (rpc: Rpc) =>
  (relayUrl: ManagementUrl, pubkey: PublicKey, reason: string): Promise<Result<true, RelayManagementError>> =>
    rpc({ relayUrl, method: "banpubkey", params: [pubkey, reason], guard: isAcknowledged })

export const createListConnections = (rpc: Rpc) =>
  (relayUrl: ManagementUrl): Promise<Result<ReadonlyArray<Connection>, RelayManagementError>> =>
    rpc({ relayUrl, method: "listconnections", params: [], guard: isConnectionArray })
```

The exported type guards (`isAcknowledged`, `isConnectionArray`, `isRelayStats`, `isBlockedIpArray`, `isGuestPolicy`, …) are the sanctioned `guard` values. Your own guard works the same way — build array guards on `@innis/nostr-core`'s `isArrayOf`.

## Anti-patterns

- **Calling `httpClient.request` directly for NIP-86 operations.** Use `Rpc`. It centralises auth and response parsing.
- **Hand-rolling the kind 27235 template.** Use `buildNip98AuthEvent` from `@innis/nostr-core` — the tag layout is one place.
- **Assuming a relay supports a given method.** A vanilla NIP-86 relay rejects Hubstr-extension methods; surface the `RpcError` rather than treating an unknown-method failure as a bug.
- **Using a `wss://` URL as `ManagementUrl`.** It must be an HTTP(S) management endpoint — `parseManagementUrl` requires a URL-parseable `http:`/`https:` value and throws `InvalidManagementUrlError` otherwise.
- **Hand-rolling the `Signer` → `RelayManagementSigner` try/catch.** Use `adaptSigner` — it is the one sanctioned bridge from the throwing core signer.
- **Narrowing the result after the call.** Pass the guard as `guard` instead of calling it on an unguarded `unknown` result — the call is the one place a malformed result becomes a `MalformedResultError`.
- **Catching `RpcError` to retry blindly.** It carries the relay's actual error message; surface it. Retrying a `banpubkey` after an "unauthorised" failure will not change the answer.
