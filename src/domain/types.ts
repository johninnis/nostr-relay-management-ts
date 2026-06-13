import type { Brand, BrandTools } from "@innis/nostr-core"
import { createBrand } from "@innis/nostr-core"

declare const managementUrlBrand: unique symbol

/** A validated, canonical relay management-API endpoint (an http/https URL with lowercased scheme and host and no trailing slash; path casing is preserved). Construct via {@link parseManagementUrl}; never cast a raw string. */
export type ManagementUrl = Brand<typeof managementUrlBrand>

const isHttpUrl = (raw: string): boolean => {
  const url = URL.parse(raw)
  return url !== null && (url.protocol === "http:" || url.protocol === "https:")
}

const canonicaliseManagementUrl = (raw: string): string => {
  const url = URL.parse(raw)
  if (url === null) return raw.replace(/\/+$/, "")
  return url.toString().replace(/\/+$/, "")
}

const managementUrlTools: BrandTools<ManagementUrl, "InvalidManagementUrlError"> = createBrand({
  errorName: "InvalidManagementUrlError",
  errorPrefix: "Invalid management URL",
  validate: isHttpUrl,
  normalise: canonicaliseManagementUrl,
})

/** Validate and brand a raw string as a {@link ManagementUrl}, throwing {@link InvalidManagementUrlError} when it is not an http/https URL. */
export const parseManagementUrl = managementUrlTools.parse
/** Non-throwing sibling of {@link parseManagementUrl}: canonicalise and brand `raw`, or return `null` when it is not a valid http/https URL. Accepts `null`/`undefined` upstream of a chain. */
export const tryParseManagementUrl = managementUrlTools.tryParse
/** Type guard: `true` when `raw` is already a valid {@link ManagementUrl}. */
export const isValidManagementUrl = managementUrlTools.isValid
/** Thrown by {@link parseManagementUrl} when the input is not a valid http/https management URL. */
export const InvalidManagementUrlError = managementUrlTools.InvalidError
