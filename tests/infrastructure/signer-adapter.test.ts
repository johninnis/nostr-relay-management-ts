import { assert, assertEquals } from "@std/assert"
import { createLocalSigner, generateSecretKey } from "@innis/nostr-core"
import { adaptSigner } from "../../src/infrastructure/signer-adapter.ts"

const unsigned = { kind: 27235, content: "", created_at: 0, tags: [] }

Deno.test("adaptSigner - wraps a successful signature in ok", async () => {
  const signer = adaptSigner(createLocalSigner(generateSecretKey()))

  const result = await signer.sign(unsigned)

  assert(result.success)
  assertEquals(result.value.kind, 27235)
})

Deno.test("adaptSigner - converts a thrown signing error into a SigningError failure", async () => {
  const signer = adaptSigner({
    ...createLocalSigner(generateSecretKey()),
    signEvent: () => Promise.reject(new Error("user rejected")),
  })

  const result = await signer.sign(unsigned)

  assert(!result.success)
  assertEquals(result.error.tag, "SigningError")
  assertEquals(result.error.message, "user rejected")
})

Deno.test("adaptSigner - falls back to a generic message for a non-Error throw", async () => {
  const signer = adaptSigner({
    ...createLocalSigner(generateSecretKey()),
    signEvent: () => Promise.reject("nope"),
  })

  const result = await signer.sign(unsigned)

  assert(!result.success)
  assertEquals(result.error.message, "Failed to sign event")
  assertEquals(result.error.cause, "nope")
})
