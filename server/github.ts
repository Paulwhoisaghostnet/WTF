import { Octokit } from "@octokit/rest";

/**
 * Returns an Octokit client authenticated with the server's GitHub token
 * (GITHUB_TOKEN env var), or unauthenticated if the token is not set.
 *
 * Unauthenticated requests are rate-limited to 60/hour; authenticated
 * requests are allowed 5 000/hour.
 */
export function createOctokit(authToken?: string): Octokit {
  return new Octokit({
    auth: authToken ?? process.env.GITHUB_TOKEN,
  });
}

export const octokit = createOctokit();
