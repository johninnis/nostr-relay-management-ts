import { assert, assertEquals, assertFalse } from "@std/assert"
import { isNonEmptyList, type NonEmptyList } from "../../src/domain/non-empty-list.ts"

Deno.test("isNonEmptyList - accepts a list holding one element", () => {
  assert(isNonEmptyList([1111]))
})

Deno.test("isNonEmptyList - refuses an empty list", () => {
  assertFalse(isNonEmptyList([]))
})

Deno.test("NonEmptyList - refuses at compile time a list with no element", () => {
  // @ts-expect-error: a non-empty list holds at least one element
  const list: NonEmptyList<number> = []
  assertEquals(list.length, 0)
})

Deno.test("NonEmptyList - reads its first element without a possibly-missing value", () => {
  const list: NonEmptyList<number> = [1111, 1]
  const first: number = list[0]
  assertEquals(first, 1111)
})
