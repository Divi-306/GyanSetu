import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { HttpError } from '../../lib/errors';
import { logger } from '../../lib/logger';

export type CompletionRequest = {
  system: string;
  user: string;
  /** JSON Schema the reply must match. */
  schema: Record<string, unknown>;
  /** Name for the schema (OpenAI-compatible providers require one). */
  schemaName?: string;
  /** Upper bound on reply length; short structured replies can use less. */
  maxTokens?: number;
  /** Model for this call; defaults to AI_MODEL, then the provider default. */
  model?: string;
  /** Request timeout. Long generations (learning packs) need more than the tutor's 60 s. */
  timeoutMs?: number;
};

export type CompletionResult =
  | { kind: 'json'; text: string; model: string; inputTokens: number | null; outputTokens: number | null }
  | { kind: 'refused'; model: string };

/**
 * `retryAfterMs`, when the provider gave one (its own measured time until it has
 * budget again), is carried on `details` so a caller that retries — like the
 * pack generator — can wait that long instead of guessing. Low-tier keys can have
 * a tokens-per-minute budget smaller than a single large reply, so an accurate
 * wait matters: a fixed short backoff just collides with the limit again.
 */
const busy = (retryAfterMs?: number) =>
  new HttpError(503, 'AI_BUSY', 'The AI tutor is busy. Try again in a minute.', retryAfterMs ? { retryAfterMs } : undefined);
const unavailable = () => new HttpError(502, 'AI_UNAVAILABLE', 'The AI tutor is unavailable right now');

/** Seconds (possibly fractional) → whole milliseconds, at least 1s. Undefined if missing/unparseable. */
function parseRetryAfterMs(header: string | null): number | undefined {
  const seconds = header ? Number(header) : NaN;
  return Number.isFinite(seconds) ? Math.max(1000, Math.ceil(seconds * 1000)) : undefined;
}

// ─────────────────── OpenAI-compatible providers (Groq, xAI) ───────────────────
// Chat completions with a strict JSON schema (response_format.json_schema).

type OpenAiCompatible = {
  name: string;
  url: string;
  apiKey: () => string | undefined;
  defaultModel: string;
  /** Provider-specific request fields. */
  extra: Record<string, unknown>;
  /** Which request field caps reply length for this provider. */
  maxTokensField: string;
  /**
   * Hard ceiling on the requested token field, regardless of what the caller asked for.
   * Groq's per-minute token budget is a single account-wide number shared by every
   * model (this key: 8,000 — confirmed from Groq's own x-ratelimit-limit-tokens header,
   * same for gpt-oss-120b, gpt-oss-20b and qwen). Groq rejects a request outright
   * (413 rate_limit_exceeded) the instant its OWN requested max tokens exceeds that
   * budget — before any work happens — so asking for 16,000 (a full module) or 8,000
   * (a 20-question quiz) always fails, no matter how many times it's retried. Clamping
   * here leaves ~2,000 tokens of headroom for the prompt itself, which also counts
   * against the same budget.
   */
  tokenCap?: number;
};

const GROQ: OpenAiCompatible = {
  // Docs: https://console.groq.com/docs/structured-outputs and /docs/reasoning
  name: 'Groq',
  url: 'https://api.groq.com/openai/v1/chat/completions',
  apiKey: () => env.GROQ_API_KEY,
  // Production model with strict json_schema support; fast and inexpensive.
  defaultModel: 'openai/gpt-oss-120b',
  // gpt-oss is a reasoning model: little reasoning suits short tutoring answers,
  // and the reasoning text itself isn't needed in the response.
  extra: { max_completion_tokens: 4000, reasoning_effort: 'low', include_reasoning: false },
  maxTokensField: 'max_completion_tokens',
  tokenCap: env.GROQ_MAX_TOKENS_PER_REQUEST,
};

const XAI: OpenAiCompatible = {
  // Docs: https://docs.x.ai/developers/model-capabilities/text/structured-outputs
  name: 'xAI',
  url: 'https://api.x.ai/v1/chat/completions',
  apiKey: () => env.XAI_API_KEY,
  defaultModel: 'grok-4.7',
  extra: { max_tokens: 4000 },
  maxTokensField: 'max_tokens',
};

async function completeOpenAiCompatible(p: OpenAiCompatible, req: CompletionRequest): Promise<CompletionResult> {
  const model = req.model ?? env.AI_MODEL ?? p.defaultModel;
  const requestedTokens = req.maxTokens ?? (p.extra[p.maxTokensField] as number | undefined);
  const effectiveTokens = p.tokenCap && requestedTokens ? Math.min(requestedTokens, p.tokenCap) : requestedTokens;
  if (p.tokenCap && requestedTokens && requestedTokens > p.tokenCap) {
    logger.warn({ provider: p.name, requestedTokens, tokenCap: p.tokenCap }, 'clamped AI request to the account token budget');
  }
  let res: Response;
  try {
    res = await fetch(p.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p.apiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        ...p.extra,
        ...(effectiveTokens ? { [p.maxTokensField]: effectiveTokens } : {}),
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: req.schemaName ?? 'tutor_answer', strict: true, schema: req.schema },
        },
      }),
      signal: AbortSignal.timeout(req.timeoutMs ?? 60_000),
    });
  } catch (err) {
    logger.error({ err, provider: p.name }, 'AI request failed');
    throw unavailable();
  }

  if (res.status === 429) throw busy(parseRetryAfterMs(res.headers.get('retry-after')));
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Groq uses 413 (not 429) for "this one request alone needs more than your per-minute
    // token budget" — e.g. a key with an 8,000 TPM cap and a ~9,000-token reply. It clears
    // the same way a 429 does (the budget is a rolling window), so treat it the same way,
    // but only when the body confirms it's that case and not a genuinely malformed request.
    if (res.status === 413 && /rate_limit_exceeded/i.test(body)) {
      logger.warn({ provider: p.name, body: body.slice(0, 300) }, 'AI request exceeds the per-minute token budget; retrying later');
      throw busy(parseRetryAfterMs(res.headers.get('retry-after')));
    }
    // Log the provider's error for us; never pass it through to students.
    logger.error({ provider: p.name, status: res.status, body: body.slice(0, 500) }, 'AI API error');
    throw unavailable();
  }

  const data = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = data.choices?.[0];
  if (choice?.message?.refusal) return { kind: 'refused', model: data.model ?? model };
  // A cut-off reply can't be valid JSON; treat it as unavailable rather than half an answer.
  if (!choice?.message?.content || choice.finish_reason === 'length') {
    logger.error({ provider: p.name, finishReason: choice?.finish_reason }, 'Unusable AI response');
    throw unavailable();
  }
  return {
    kind: 'json',
    text: choice.message.content,
    model: data.model ?? model,
    inputTokens: data.usage?.prompt_tokens ?? null,
    outputTokens: data.usage?.completion_tokens ?? null,
  };
}

// ─────────────────────────── Anthropic (Claude) ───────────────────────────

const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5';
let anthropic: Anthropic | null = null;

async function completeWithAnthropic(req: CompletionRequest): Promise<CompletionResult> {
  anthropic ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 });
  const model = req.model ?? env.AI_MODEL ?? ANTHROPIC_DEFAULT_MODEL;
  let response;
  try {
    response = await anthropic.beta.messages.create({
      model,
      max_tokens: req.maxTokens ?? 16000,
      // If the model declines, the API re-runs the request on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: req.schema } },
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    }, { timeout: req.timeoutMs ?? 60_000 });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw busy();
    if (err instanceof Anthropic.APIError) {
      logger.error({ status: err.status, message: err.message }, 'Claude API error');
      throw unavailable();
    }
    throw err;
  }

  if (response.stop_reason === 'refusal') return { kind: 'refused', model: response.model };
  const text = response.content.find((b) => b.type === 'text');
  if (response.stop_reason !== 'end_turn' || text?.type !== 'text') {
    logger.error({ stopReason: response.stop_reason }, 'Unusable Claude response');
    throw unavailable();
  }
  return {
    kind: 'json',
    text: text.text,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ─────────────────────────── Selection ───────────────────────────

/** True when the configured provider has its API key. */
export function aiConfigured(): boolean {
  switch (env.AI_PROVIDER) {
    case 'groq': return Boolean(env.GROQ_API_KEY);
    case 'xai': return Boolean(env.XAI_API_KEY);
    case 'anthropic': return Boolean(env.ANTHROPIC_API_KEY);
  }
}

function completeOnce(req: CompletionRequest): Promise<CompletionResult> {
  switch (env.AI_PROVIDER) {
    case 'groq': return completeOpenAiCompatible(GROQ, req);
    case 'xai': return completeOpenAiCompatible(XAI, req);
    case 'anthropic': return completeWithAnthropic(req);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, env.NODE_ENV === 'test' ? 0 : ms));
/** Cap on the one built-in retry wait: never make an interactive request (tutor, quiz, navigator) wait longer than this. */
const MAX_BUSY_RETRY_WAIT_MS = 5000;

/**
 * A transient rate-limit 429 is common on a shared low-tier key under concurrent load
 * (pack generation + tutor + navigator + quiz, all drawing on the same budget) and clears
 * within seconds. Pack generation already absorbs this with its own shared-clock retry
 * loop; every other caller (tutor, quiz generator, navigator, flashcards, insights) made a
 * single attempt and surfaced "AI tutor is busy" on the very first blip. One short, bounded
 * retry here fixes that for all of them at once, without changing any call site.
 */
export async function complete(req: CompletionRequest): Promise<CompletionResult> {
  try {
    return await completeOnce(req);
  } catch (err) {
    if (!(err instanceof HttpError) || err.code !== 'AI_BUSY') throw err;
    const retryAfterMs = (err.details as { retryAfterMs?: number } | undefined)?.retryAfterMs;
    await sleep(Math.min(retryAfterMs ?? 1500, MAX_BUSY_RETRY_WAIT_MS));
    return completeOnce(req);
  }
}
