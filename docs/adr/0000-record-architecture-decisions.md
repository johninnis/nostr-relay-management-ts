# 0000. Record architecture decisions

## Status

Accepted

## Context

Parts of this client go beyond the text of NIP-86 on purpose: it validates the shape of every `result` it hands back, it reads the Hubstr extension's responses strictly, and it refuses at compile time a request it could not encode. Each was chosen and paid for. Without a record, a well-meaning refactor "simplifies" the code back to the specification's plain reading and the reasoning has to be rediscovered from the failure it reintroduces. User-facing documentation is the wrong home for that reasoning: a README explains how to use the package, is edited freely, and is not what a reviewer reads before judging the code.

## Decision

Architectural decisions are recorded in `docs/adr/`, one file per decision, numbered sequentially from `0001`, each with exactly the sections Status, Context, Decision and Consequences. An accepted record is never edited to change its decision: a new record supersedes it, restating the whole current decision, and the old record's status becomes `Superseded by ADR-NNNN`. A record holds one decision; aspects that could be revised independently get their own record. Where a deliberate choice would read like a mistake at the call site, a one-line `// Deliberate: … see ADR-NNNN` comment points at the record, backed by a test that fails if the design is undone.

Plain compliance with NIP-86 is not recorded: where the code does what the specification says, the specification is the record.

A record's filename is its four-digit number and a kebab-case slug of its title, at most 95 characters including the `.md` extension, the longest path component JSR accepts. A longer title is shortened in the filename, never in the record's heading.

## Consequences

- Reviewers read `docs/adr/` before judging the code, and a disagreement is resolved by a superseding record rather than a silent change.
- The README stays user documentation.
