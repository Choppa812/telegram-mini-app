const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// Reads are safe to repeat. Provider writes deliberately do not use this helper.
export async function fetchReadWithRetry(url, options, fetcher = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(12000) });
      if (!RETRYABLE_STATUS.has(response.status) || attempt === 2) return response;
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
    }
    await pause(400 * (attempt + 1));
  }
  throw lastError || new Error('READ_RETRY_EXHAUSTED');
}
