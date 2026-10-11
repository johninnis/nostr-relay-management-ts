# @innis/nostr-relay-management

[![CI](https://github.com/johninnis/nostr-relay-management-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/johninnis/nostr-relay-management-ts/actions/workflows/ci.yml)

Building blocks for talking to a Nostr relay's HTTP management surface: a signed NIP-86 RPC client. The kind 27235 auth event template lives in `@innis/nostr-core` (`buildNip98AuthEvent`) — this package consumes it. Concrete NIP-86 method-creator factories (`createBanPubkey`, `createListBlockedIps`, etc.) are **not** in this package — the lib exposes the primitives a caller composes them from. Pre-built data-shape types covering the most common NIP-86 / Hubstr-extension responses ship alongside.

The shape mirrors `@innis/nostr-blossom`: signer + HTTP client are injected, every operation returns `Result<T, RelayManagementFailure>`, no anticipated outcome is thrown — a relay answering with the wrong shape is a returned `MalformedResultFailure`, not a throw. Only a programmer fault throws: an empty `method` (`InvalidArgumentError`), or a cyclic `params` value (`JSON.stringify`'s `TypeError`). `params` is typed with `@innis/nostr-core`'s `JsonSerialisable`, so a bigint, a function, `undefined` or an un-narrowed `unknown` does not compile.

## Install

```bash
deno add jsr:@innis/nostr-relay-management
```

## Public surface

### Domain — `src/domain/nip86.ts`, `src/domain/hubstr.ts` + `src/domain/failure/relay-management-failure.ts`

The data shapes are split by origin: standard NIP-86 spec payloads live in `nip86.ts` and the relay's non-standard extensions live in `hubstr.ts`. Everything is re-exported flat from `mod.ts`.

- **Endpoint**: a call names the relay's management endpoint as `@innis/nostr-core`'s `HttpUrl`, the one form the signed NIP-98 `u` tag and the request URL share. For a relay known by its `RelayUrl`, `wsToHttp(relay)` from `@innis/nostr-core` gives it (NIP-86 serves "on the same URI as the relay's websocket"); any other endpoint is parsed with `parseHttpUrl`, which returns `null` for anything but an `http` or `https` URL. Generic guards (`isArrayOf`, `isStringArray`, `isRecord`, …) live in `@innis/nostr-core` — import them from there; every array guard in this package is built on `isArrayOf`, and your own should be too.
- **Failures — `failure/relay-management-failure.ts`**: `RelayManagementFailure = SignerFailure | ServerFailure | NetworkFailure | RpcFailure | MalformedResultFailure`, plain data discriminated by `type` (the signer's own modes such as `"rejected"` or `"sign-failed"`, then `"server"`, `"network"`, `"rpc"`, `"malformed-result"`). Imported via `import type { RelayManagementFailure } from "@innis/nostr-relay-management"`. `SignerFailure` (the signer did not sign, with its `message`), `ServerFailure` and `NetworkFailure` come from `@innis/nostr-core`; `RpcFailure` (the relay answered with an `error`, or the envelope was malformed, with a `message`) and `MalformedResultFailure` (a guarded call's `result` failed its guard — carries `method`) are local to this package.
- **NIP-86 spec shapes — `nip86.ts`**: the [NIP-86 spec](https://github.com/nostr-protocol/nips/blob/master/86.md) moderation-list methods return three distinct payload shapes — `ModeratedPubkey` (`{ pubkey, reason? }`, returned by both `listbannedpubkeys` and `listallowedpubkeys`), `ModeratedEvent` (`{ id, reason? }`, returned by both `listbannedevents` and `listeventsneedingmoderation`), and `BlockedIp` (`{ ip, reason? }`, returned by `listblockedips`). Each ships a guard pair: `isModeratedPubkey`/`isModeratedPubkeyArray`, `isModeratedEvent`/`isModeratedEventArray`, `isBlockedIp`/`isBlockedIpArray`. Every NIP-86 mutation (`banpubkey`, `allowpubkey`, `blockip`, …) answers `result: true`; `isAcknowledged` is its guard. (The ban/allow distinction lives in the method name, not the payload — the shapes are identical, so one type serves both.) `pubkey` and `id` are `@innis/nostr-core`'s branded `PublicKey` / `EventId` — the guards validate 64-char lowercase hex, so a passing value is immediately usable across the `@innis/*` stack with no re-parsing.
- **Hubstr-extension shapes — `hubstr.ts`**: `Connection`, `ConnectionSubscription`, `Subscription`, `RelayStats`, `KindCount`, `TenantCount`, `RateLimits`, `GuestPolicy` / `GuestReadPolicy` / `GuestWritePolicy` / `TagPrefixRule`, `ExplorePeriod`, `ExploreData`, `ExploreResult`, `HashtagEntry`, `PubkeyEntry`, `EventIdEntry` (+ guards `isConnection*`, `isSubscription`/`isSubscriptionArray`, `isRelayStats`, `isRateLimits`, `isGuestPolicy`, `isExploreResult`, and the `parseExplorePeriod` parser). These describe the relay's non-standard methods (`getstats`, `listconnections`, `listsubscriptions`, `getguestpolicy`/`setguestpolicy`, `getratelimits`/`setratelimits`, `explore`) — a vanilla NIP-86 relay rejects them. As in `nip86.ts`, pubkey-keyed and event-id-keyed fields (`TenantCount.pubkey`, `PubkeyEntry.pubkey`, `EventIdEntry.event_id`) are branded `PublicKey` / `EventId`.

Pass one of these guards as an `Rpc` call's `guard` and the call resolves to the typed shape (see below).

### Ports — `src/application/ports.ts`

```ts
type RelayManagementSigner = Pick<Signer, "signEvent">

interface RelayManagementDeps {
  readonly signer: RelayManagementSigner
  readonly httpClient: HttpClient
}
```

`RelayManagementSigner` is the one `Signer` capability the RPC boundary uses, so any `@innis/nostr-core` `Signer` is passed in as it is, as with `@innis/nostr-blossom`. `signEvent` already returns a `Result`, and a `SignerFailure` it returns is passed through as the call's `RelayManagementFailure`, so a decline stays `rejected`:

```ts
const deps: RelayManagementDeps = { signer, httpClient }
```

`HttpClient` is the same shape as `@innis/nostr-blossom`'s — one fetch adapter satisfies both.

### RPC client — `src/application/rpc.ts`

```ts
interface RpcInput<P extends ReadonlyArray<unknown> = ReadonlyArray<JsonValue>> {
  readonly relayUrl: HttpUrl
  readonly method: string
  readonly params: P & JsonSerialisable<P>
  readonly signal?: AbortSignal
}

interface GuardedRpcInput<T, P extends ReadonlyArray<unknown> = ReadonlyArray<JsonValue>> extends RpcInput<P> {
  readonly guard: (value: unknown) => value is T
}

interface Rpc {
  <T, P extends ReadonlyArray<unknown>>(input: GuardedRpcInput<T, P>): Promise<Result<T, RelayManagementFailure>>
  <P extends ReadonlyArray<unknown>>(input: RpcInput<P>): Promise<Result<JsonValue, RelayManagementFailure>>
}

const rpc: Rpc = createRpc({ signer, httpClient })
```

Give a call a `guard` and it resolves to `Result<T, RelayManagementFailure>`: the `result` is run through the guard, and one the guard rejects comes back as `Failure(MalformedResultFailure)` naming the `method` — never a throw. Without a `guard` the call resolves to `Result<JsonValue, RelayManagementFailure>` and the caller narrows the value itself. `T` is inferred from the guard; there is no way to assert a type without supplying one.

```ts
const stats = await rpc({ relayUrl, method: "getstats", params: [], guard: isRelayStats })
if (stats.success) render(stats.value) // RelayStats
```

`createRpc(deps)` is the single boundary every NIP-86 call goes through. It:

1. JSON-encodes `{ method, params }`.
2. Builds the kind 27235 auth event via `@innis/nostr-core`'s `buildNip98AuthEvent`, which puts the body's SHA-256 in the `payload` tag NIP-86 requires — bounded with a NIP-98 `expiration` tag (`DEFAULT_TIMESTAMP_TOLERANCE_SECONDS` from now, so it lapses when a default NIP-98 validator would refuse it anyway) — and signs it.
3. `POST`s `application/nostr+json+rpc` with the `Nostr <base64>` `Authorization` header (one longer than the 4096 characters a relay reads is an `rpc` failure, and nothing is sent), forwarding any `signal` to the `HttpClient`. The relay being administered is the user's own and may run on `localhost` or their LAN, so give `createRpc` a client built with `createHttpClient("allow-private")`; the request follows no redirect and keeps the client's default body ceiling.
4. Parses the JSON-RPC response of a status below 400. A status of 400 or more, such as the 401 NIP-86 asks for when `Authorization` is missing or invalid, is the `HttpClient`'s `ServerFailure`, whose `message` is the relay's `x-reason` header, else its body text. Otherwise a body that is not JSON, or not a JSON object, is an `RpcFailure` (`Invalid RPC response: …`); `{ result }` → `Success`, `{ error }` with a non-empty string → `Failure(RpcFailure)` carrying it. An `error` that is `null` or the empty string counts as absent, since NIP-86's template shows both fields and some implementations serialise both on success: the response is a success when it carries `result`, and refused when it carries neither (shared ADR-0037). An `error` that is neither a string nor `null` states no outcome, so the envelope is refused as an `RpcFailure` (`Invalid RPC response: …`), never read as success or stringified.
5. When the call carries a `guard`, checks `result` against it — rejected → `Failure(MalformedResultFailure)`.

Direct `httpClient.request` calls bypass the signing path and should not be made from method factories — they exist as a building block, not a fallback.

## Writing a method factory

NIP-86 methods are not packaged as factories because the spec keeps adding methods and each consumer typically only needs a handful. The pattern is small:

Pass the method's guard and return the call — the guarded `Rpc` already resolves to the typed `Result`:

```ts
import type { HttpUrl, PublicKey, Result } from "@innis/nostr-core"
import {
  type Connection,
  isAcknowledged,
  isConnectionArray,
  type RelayManagementFailure,
  type Rpc,
} from "@innis/nostr-relay-management"

export const createBanPubkey = (rpc: Rpc) =>
  (relayUrl: HttpUrl, pubkey: PublicKey, reason: string): Promise<Result<true, RelayManagementFailure>> =>
    rpc({ relayUrl, method: "banpubkey", params: [pubkey, reason], guard: isAcknowledged })

export const createListConnections = (rpc: Rpc) =>
  (relayUrl: HttpUrl): Promise<Result<ReadonlyArray<Connection>, RelayManagementFailure>> =>
    rpc({ relayUrl, method: "listconnections", params: [], guard: isConnectionArray })
```

The exported type guards (`isAcknowledged`, `isConnectionArray`, `isRelayStats`, `isBlockedIpArray`, `isGuestPolicy`, …) are the sanctioned `guard` values. Your own guard works the same way — build array guards on `@innis/nostr-core`'s `isArrayOf`.

## Design decisions

The decisions that read like mistakes at the call site are recorded under [`docs/adr/`](docs/adr/). Read them before "simplifying" anything here.

- [0000. Record architecture decisions](docs/adr/0000-record-architecture-decisions.md)
- [0001. A response is validated by a guard carried into the one typed call, and a malformed result is a returned failure](docs/adr/0001-a-response-is-validated-by-a-guard-carried-into-the-one-typed-call-and-a-malformed.md)
- [0002. A guest write policy's tag prefixes is required, with no shim for older relays](docs/adr/0002-a-guest-write-policys-tag-prefixes-is-required-with-no-shim-for-older-relays.md)
- [0003. RPC params are typed as JSON, and a cyclic value is the one encoding fault left to throw](docs/adr/0003-rpc-params-are-typed-as-json-and-a-cyclic-value-is-the-one-encoding-fault-left-to-throw.md)

## Anti-patterns

- **Calling `httpClient.request` directly for NIP-86 operations.** Use `Rpc`. It centralises auth and response parsing.
- **Hand-rolling the kind 27235 template.** Use `buildNip98AuthEvent` from `@innis/nostr-core` — the tag layout is one place.
- **Assuming a relay supports a given method.** A vanilla NIP-86 relay rejects Hubstr-extension methods; surface the `RpcFailure` rather than treating an unknown-method failure as a bug.
- **Rewriting a `wss://` URL by hand.** Take the endpoint from `wsToHttp(relay)`, which keeps the relay's port and path; a hand-rewritten string is not an `HttpUrl` and does not type-check.
- **Narrowing the result after the call.** Pass the guard as `guard` instead of calling it on an unguarded `JsonValue` result — the call is the one place a malformed result becomes a `MalformedResultFailure`.
- **Retrying an `RpcFailure` blindly.** It carries the relay's actual error message; surface it. Retrying a `banpubkey` after an "unauthorised" failure will not change the answer.
