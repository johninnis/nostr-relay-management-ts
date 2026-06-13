import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert"
import {
  InvalidManagementUrlError,
  isValidManagementUrl,
  parseManagementUrl,
  tryParseManagementUrl,
} from "../../src/domain/types.ts"

Deno.test("parseManagementUrl - accepts https URL", () => {
  const url = parseManagementUrl("https://relay.example/management")
  assertEquals(typeof url, "string")
  assertEquals(url, "https://relay.example/management")
})

Deno.test("parseManagementUrl - accepts http URL", () => {
  const url = parseManagementUrl("http://localhost:8080")
  assertEquals(url, "http://localhost:8080")
})

Deno.test("parseManagementUrl - preserves path casing while lowercasing scheme and host", () => {
  const url = parseManagementUrl("HTTPS://Relay.EXAMPLE/Management")
  assertEquals(url, "https://relay.example/Management")
})

Deno.test("parseManagementUrl - strips a trailing slash", () => {
  assertEquals(parseManagementUrl("https://relay.example/management/"), "https://relay.example/management")
  assertEquals(parseManagementUrl("http://localhost:8080/"), "http://localhost:8080")
})

Deno.test("parseManagementUrl - throws on wss URL", () => {
  assertThrows(() => parseManagementUrl("wss://relay.example"), InvalidManagementUrlError)
})

Deno.test("parseManagementUrl - throws on malformed input", () => {
  assertThrows(() => parseManagementUrl("not-a-url"), InvalidManagementUrlError)
})

Deno.test("parseManagementUrl - throws on a scheme with no host", () => {
  assertThrows(() => parseManagementUrl("http://"), InvalidManagementUrlError)
})

Deno.test("parseManagementUrl - throws on an unparseable URL with an http prefix", () => {
  assertThrows(() => parseManagementUrl("http://exa mple.com"), InvalidManagementUrlError)
})

Deno.test("isValidManagementUrl - guards an http(s) endpoint", () => {
  assert(isValidManagementUrl("https://relay.example/management"))
  assertFalse(isValidManagementUrl("wss://relay.example"))
  assertFalse(isValidManagementUrl(42))
})

Deno.test("tryParseManagementUrl - canonicalises a valid URL", () => {
  assertEquals(tryParseManagementUrl("HTTPS://Relay.EXAMPLE/Management/"), "https://relay.example/Management")
})

Deno.test("tryParseManagementUrl - returns null for an invalid or absent URL", () => {
  assertEquals(tryParseManagementUrl("wss://relay.example"), null)
  assertEquals(tryParseManagementUrl(null), null)
  assertEquals(tryParseManagementUrl(undefined), null)
})
