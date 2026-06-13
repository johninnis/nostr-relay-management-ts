import type { HttpClient, HttpRequest, HttpResponse } from "@innis/nostr-core"
import { createLocalSigner, failure, generateSecretKey, ok, ServerError, SigningError } from "@innis/nostr-core"
import type { RelayManagementSigner } from "../../src/application/ports.ts"
import { adaptSigner } from "../../src/infrastructure/signer-adapter.ts"

export const createFakeSigner = (): RelayManagementSigner => adaptSigner(createLocalSigner(generateSecretKey()))

export const createFailingSigner = (): RelayManagementSigner => ({
  sign: () => Promise.resolve(failure(new SigningError("Test signing failure"))),
})

export const createFakeSuccessResponse = (
  status: number,
  body: string,
  headers?: Record<string, string>,
): HttpResponse => ({
  status,
  headers: new Headers(headers),
  json: () => Promise.resolve(ok(JSON.parse(body))),
  blob: () => Promise.resolve(ok(new Blob([body]))),
  text: () => Promise.resolve(ok(body)),
})

export const createFakeHttpClient = (response: HttpResponse): HttpClient => ({
  request: async () => {
    if (response.status >= 400) {
      const textResult = await response.text()
      const reason = response.headers.get("x-reason") ?? (textResult.success ? textResult.value : "")
      return failure(new ServerError(response.status, reason))
    }
    return ok(response)
  },
})

export const createCapturingHttpClient = (
  response: HttpResponse,
): { readonly client: HttpClient; readonly requests: ReadonlyArray<HttpRequest> } => {
  const requests: HttpRequest[] = []
  const base = createFakeHttpClient(response)
  return {
    requests,
    client: {
      request: (input) => {
        requests.push(input)
        return base.request(input)
      },
    },
  }
}
