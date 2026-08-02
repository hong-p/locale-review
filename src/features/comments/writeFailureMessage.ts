import { asGitHubApiError } from "../../api/client";
import { messages } from "../../messages/en";

/**
 * Turns a failed write into something the reviewer can act on.
 *
 * "It did not work" is the one answer that helps nobody. The normalized model
 * already knows whether GitHub refused the token, could not find the target,
 * or rate limited the request, and each points at a different fix.
 */
export function writeFailureMessage(error: unknown, fallback: string): string {
  const apiError = asGitHubApiError(error);
  if (!apiError) return fallback;

  switch (apiError.code) {
    case "permission-denied":
      // 401 is a rejected token; 403 is a token GitHub accepted but will not
      // let act here, which is the fine-grained case worth spelling out.
      return apiError.status === 401
        ? messages.loadErrors.tokenRejectedBody
        : messages.loadErrors.writeForbiddenBody;
    case "rate-limited":
    case "not-found":
    case "network-failure":
      return apiError.message;
    default:
      return fallback;
  }
}
