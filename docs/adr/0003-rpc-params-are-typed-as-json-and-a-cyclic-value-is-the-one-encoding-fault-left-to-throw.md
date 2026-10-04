# 0003. RPC params are typed as JSON, and a cyclic value is the one encoding fault left to throw

## Status

Accepted

## Context

A NIP-86 request is the JSON text `{"method": …, "params": [...]}`, and the body is signed: its SHA-256 goes into the NIP-98 `payload` tag before anything is sent. Typed as a list of `unknown`, `params` accepts values JSON cannot write. A `bigint` or a function makes `JSON.stringify` throw; an `undefined` in the list is written as `null`, so the relay receives an argument the caller never meant. Each of these is a programmer fault, and each is known at the call site before the code runs.

## Decision

`RpcInput.params` is typed `P & JsonSerialisable<P>` from `@innis/nostr-core`, with `P` inferred from the call. A list of strings, numbers, booleans, `null`, and arrays or objects of those compiles, an `interface` such as `RateLimits` included; a `bigint`, a function, an `undefined` element or an un-narrowed `unknown` does not. The client keeps no runtime check of its own for what the type already refuses.

A cyclic value satisfies the type and cannot be written. It is a programmer fault: `JSON.stringify`'s `TypeError` propagates before anything is signed or sent.

## Consequences

- A request the client cannot encode faithfully fails to compile rather than at run time or, worse, as a silently altered argument on the wire.
- A caller holding an `unknown` narrows it before passing it as a param.
- `rpc.test.ts` pins the compile-time refusal of a `bigint` and the thrown `TypeError` of a cycle, with no request made.
