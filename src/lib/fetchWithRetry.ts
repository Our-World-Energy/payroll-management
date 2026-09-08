/**
 * Transparently retries a fetch on network failure or a 5xx/429 response —
 * covers the transient blips (cold starts, brief DB connection hiccups, a
 * flapping route to the database host) that would otherwise surface as a hard
 * error on first load. 4xx responses are returned as-is, since retrying won't
 * fix a bad request.
 *
 * Shared so the pages that poll the same APIs behave identically; it started as
 * a local helper in Attendance Management.
 */
export async function fetchWithRetry(input: string, init?: RequestInit, retries = 2): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(input, init);
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      lastError = new Error(`Request failed with status ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}
