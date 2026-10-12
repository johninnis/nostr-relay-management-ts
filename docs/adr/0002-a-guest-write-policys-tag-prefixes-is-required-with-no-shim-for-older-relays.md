# 0002. A guest write policy's tag prefixes is required, with no shim for older relays

## Status

Superseded by ADR-0004

## Context

The Hubstr extension's `getguestpolicy` answers a write side with `kinds`, `tagged_to_tenant` and `tag_prefixes`, the list of tag-value prefix rules any one of which admits a guest write. Development builds of the relay from before the prefix rule sent no `tag_prefixes`. The relay reads an absent key as no requirement, so the client could read it the same way: an optional field, defaulted to an empty list wherever it is used.

That leniency is not free. An optional field is a question every reader of the policy has to answer again, each with its own default; a client that writes back a policy it read without the key cannot tell "no rules" from "rules it did not see". And reading a missing rule list as no requirement is the direction that widens what guests may write, which the relay itself refuses to guess when the list is submitted. Every tagged release of the relay sends the key, an empty list when no rule is configured.

## Decision

`GuestWritePolicy.tag_prefixes` is required. `isGuestPolicy` refuses a write side that does not carry it as a list of `{ tag, prefixes }` rules, so a response without it is a `malformed-result` failure (ADR-0001). An empty list is the stated absence of a requirement. There is no compatibility shim, default or migration for a relay that omits the key.

## Consequences

- A caller reads `write.tag_prefixes` directly; there is no `?? []` at any call site.
- A relay that predates the rule is reported as answering with the wrong shape, not silently read as unconstrained. It is upgraded, not accommodated.
- Do not make the field optional again to accept older relays. `hubstr.test.ts` pins the refusal of a write side without it.
