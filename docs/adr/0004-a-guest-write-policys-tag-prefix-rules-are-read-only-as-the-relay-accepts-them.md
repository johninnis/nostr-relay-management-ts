# 0004. A guest write policy's tag prefix rules are read only as the relay accepts them, with no shim for older relays

## Status

Accepted

Supersedes ADR-0002. Carried forward unchanged: `GuestWritePolicy.tag_prefixes` is required, and a write side without it is a `malformed-result` failure; there is no compatibility shim, default or migration for a relay that omits it. Revised: a rule is read only in the shape the relay accepts one, a non-empty `tag`, at least one prefix with none of them empty, and at least one event kind in a required `kinds`, where ADR-0002 read any `{ tag, prefixes }`; a rule's `prefixes` and `kinds` are typed as non-empty lists; and an empty rule list states that no rule is configured, which is no requirement only while `tagged_to_tenant` is off, where ADR-0002 called it the absence of a requirement. This record holds the complete current decision.

## Context

The Hubstr extension's `getguestpolicy` answers a write side with `kinds`, `tagged_to_tenant` and `tag_prefixes`, the list of tag-value prefix rules any one of which admits a guest write. Each rule names a `tag`, its `prefixes` and the `kinds` it admits: a rule admits only events of its own kinds, so a rule meant for page comments does not admit a gift wrap or a zap receipt that happens to carry the page tag. `tagged_to_tenant` and the rules are alternatives. `tagged_to_tenant` covers every writable kind and a rule only its own, and only with `tagged_to_tenant` off and no rule is there no provenance requirement.

Development builds of the relay from before the prefix rule sent no `tag_prefixes`, and its releases from before a rule was scoped to kinds sent rules without `kinds`. The client could read either absence leniently: a missing rule list as no rule, which is how the relay itself reads a `setguestpolicy` submission that leaves the key out or sends `null`, and a rule without `kinds` as admitting every kind, which is how those older releases applied one.

That leniency is not free. An optional field is a question every reader of the policy has to answer again, each with its own default; a client that writes back a policy it read without the key cannot tell "no rules" from "rules it did not see". Both readings also widen what guests may write. The relay does not take that direction for a rule: `setguestpolicy` refuses with `400` a rule without a tag, without a prefix, with an empty prefix, which would match every value, or without a kind, and a relay holding a stored rule without kinds refuses to start. Every release of the relay this client supports answers `getguestpolicy` with the list, an empty one when no rule is configured, and with every rule in it carrying a tag, at least one non-empty prefix and at least one kind.

The relay takes a rule listing a kind more than once, and holds that kind once.

## Decision

- `GuestWritePolicy.tag_prefixes` is required. `isGuestPolicy` refuses a write side that does not carry it as a list, absent and `null` alike, so such a response is a `malformed-result` failure (ADR-0001). This is deliberately stricter than the relay's reading of a submission, where a missing or `null` list means no rule: a relay this client supports always answers with the list, so a response without it comes from one it does not.
- An empty list states that no rule is configured. It is no requirement only while `tagged_to_tenant` is off too.
- A rule is read only in the shape the relay accepts one: `tag` a non-empty string, `prefixes` a non-empty list of non-empty strings, and `kinds` a non-empty list of event kinds, integers from 0 to 65535. `isGuestPolicy` refuses a write side holding any other rule. An absent or empty `kinds` is never read as every kind, nor an empty prefix as a match for every value.
- `TagPrefixRule.prefixes` and `TagPrefixRule.kinds` are `NonEmptyList`s, `readonly [T, ...ReadonlyArray<T>]`, and `isGuestPolicy` narrows a rule to that type. A rule without a prefix or a kind does not compile, so a caller building a policy to send cannot write the empty list the relay refuses, and a caller reading one has a first prefix and a first kind without a check for a missing one. `isNonEmptyList` narrows a list the caller holds to the type.
- A rule listing a kind more than once is accepted, as the relay accepts it. The repetition admits nothing a single entry does not.
- There is no compatibility shim, default or migration for a relay that omits the list or a rule's kinds.

## Consequences

- A caller reads `write.tag_prefixes` and each rule's `kinds` directly; there is no `?? []` at any call site, and no caller checks a rule's tag, prefixes or kinds for emptiness again.
- A relay that predates the rule, or its kinds, is reported as answering with the wrong shape, not silently read as unconstrained. It is upgraded, not accommodated.
- A relay older than the kinds-scoped rule ignores a rule's `kinds` when a policy is saved to it, so each saved rule admits every writable kind carrying its tag, and its next `getguestpolicy` reads as a `malformed-result`. A relay is upgraded to hubstr-relay v0.3.0 before a client on this release administers its guest policy.
- Do not make either field optional again to accept older relays, do not read an absent or empty rule `kinds` as every kind, and do not accept a rule the relay would refuse. `hubstr.test.ts` pins the refusal of a write side without `tag_prefixes`, and of a rule without kinds, with none, with a kind that is not an integer from 0 to 65535, with no prefix or an empty one, or with an empty tag.
- A caller builds a rule's lists by narrowing what it parsed with `isNonEmptyList`, never by asserting the type. `hubstr.test.ts` pins the compile-time refusal of a rule with no prefix or no kind, and that the guard's narrowed rule has a first prefix and a first kind.
- `NonEmptyList` and `isNonEmptyList` are this package's own because `@innis/nostr-core` names no non-empty list; it writes the shape inline where it needs one. If it gains one, this one gives way to it.
- Do not refuse a repeated kind to mirror what the relay answers. The rule is to read what the relay accepts, and a repeated kind admits nothing more; `hubstr.test.ts` pins its acceptance.
- The relay's side is hubstr-relay's ADR-0044 (a tag prefix rule admits only the kinds it lists) and ADR-0019 (guest write provenance is a set of alternatives).
