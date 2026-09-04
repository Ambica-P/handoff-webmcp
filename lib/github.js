/**
 * A thin, authenticated wrapper around the GitHub REST API. Every call
 * here runs server-side with the token decrypted from the session
 * cookie — the token itself never leaves this file's scope.
 */

const GITHUB_API = "https://api.github.com";

export async function githubRequest(token, path, { method = "GET", body } = {}) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "handoff-webmcp-app",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message = (data && (data.message || data.error_description)) || `GitHub API error (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

/** Reads owner/repo from a plain object (query params or a parsed JSON body). */
export function requireRepoParams(source) {
  const owner = source.owner;
  const repo = source.repo;
  if (!owner || !repo) {
    const err = new Error("owner and repo are required.");
    err.status = 400;
    throw err;
  }
  return { owner, repo };
}

export { GITHUB_API };
