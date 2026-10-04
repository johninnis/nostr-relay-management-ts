# 0001. A response is validated by a guard carried into the one typed call, and a malformed result is a returned failure

## Status

Accepted

## Context

NIP-86 answers every method with `{ result }` or `{ error }`, and `result` is untyped: `true` for a mutation, a list of strings for one method, a list of `{ pubkey, reason? }` objects for another, and whatever a given relay actually sends. A caller needs a typed value, and the question is where the type is established and what happens when the relay's answer does not fit it.

Asserting the type at each call site leaves every caller one bad response away from reading `undefined`. Exposing an untyped call and a separate validator invites the caller to skip the second step. Throwing on a bad shape turns a relay's mistake into an unhandled rejection in a call that already returns every other failure as a value. Keying guards by method name inside the client would fix the set of methods, though NIP-86 keeps adding them and a relay may serve its own.

## Decision

`createRpc` builds the one call every NIP-86 method goes through. A call may carry a `guard`, a type predicate for the shape the method returns; the call then resolves to the `result` narrowed to that type when the guard accepts it, and to a returned `MalformedResultFailure` naming the `method` when it does not. The type is inferred from the guard, so there is no way to assert a result type without supplying one. A call without a guard resolves to the `result` as the `JsonValue` it is.

The package ships the guards for the NIP-86 and Hubstr-extension shapes; a caller's own guard is passed the same way. Method factories are not part of the package: a caller composes one from the call and a guard.

## Consequences

- A caller receives either a value of the type it asked for or a failure it can show. No caller needs a type assertion on a relay response.
- Supporting a new method means choosing a guard at the call. Changing what a relay returns means changing that one guard.
- Do not add a throwing variant, a method-keyed guard table, or a post-call validator beside the call: each reopens one of the gaps above. `rpc.test.ts` pins the returned `malformed-result` failure.
- Shared decisions: nostr-adrs ADR-0001 (an anticipated outcome is returned, a fault is thrown) and ADR-0037 (the NIP-86 envelope states exactly one outcome). Hubstr's client records the same split from the consumer's side in its ADR-0031.
