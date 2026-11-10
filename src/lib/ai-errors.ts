export class AiError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = 'AiError';
  }
}

// SDK errors can contain request data or credentials. Only static messages leave the server.
export function aiProviderError(error: unknown): AiError {
  const value = error as { status?: unknown; message?: unknown; name?: unknown } | null;
  const status = typeof value?.status === 'number' ? value.status : undefined;
  const message = typeof value?.message === 'string' ? value.message : '';
  if (status === 401 || (status === 400 && /API_KEY_INVALID|API key not valid|API_KEY_EXPIRED/i.test(message))) {
    return new AiError('Gemini authentication failed. Check GEMINI_API_KEY on the server, then restart the app.', 503);
  }
  if (status === 403) return new AiError('Gemini access was denied. Check the API key restrictions and Google project permissions.', 503);
  if (status === 429) return new AiError('Gemini quota or rate limit reached. Check your Google AI project quota and billing, or wait before trying again.', 429);
  if (status === 404) return new AiError('The Gemini model is unavailable for this project. Check access to gemini-3.5-flash.', 503);
  if (status === 400) return new AiError('Gemini rejected the request. Check the API key and model configuration.', 502);
  if (status === 408 || status === 504 || value?.name === 'AbortError' || value?.name === 'TimeoutError' || /timeout|timed out|aborted/i.test(message)) {
    return new AiError('Gemini took too long to respond. Try again with a shorter description.', 504);
  }
  if (status === undefined || /fetch failed|network|ECONN|ENOTFOUND/i.test(message)) {
    return new AiError('Could not connect to Gemini. Check the server network connection and try again.', 503);
  }
  return new AiError('Gemini is temporarily unavailable. Try again later.', 502);
}
