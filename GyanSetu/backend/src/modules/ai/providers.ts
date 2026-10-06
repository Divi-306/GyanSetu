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

const busy = () => new HttpError(503, 'AI_BUSY', 'The AI tutor is busy. Try again in a minute.');
const unavailable = () => new HttpError(502, 'AI_UNAVAILABLE', 'The AI tutor is unavailable right now');

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
  let res: Response;
  try {
    res = await fetch(p.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p.apiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        ...p.extra,
        ...(req.maxTokens ? { [p.maxTokensField]: req.maxTokens } : {}),
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

  if (res.status === 429) throw busy();
  if (!res.ok) {
    // Log the provider's error for us; never pass it through to students.
    logger.error(
      { provider: p.name, status: res.status, body: (await res.text().catch(() => '')).slice(0, 500) },
      'AI API error',
    );
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

export function complete(req: CompletionRequest): Promise<CompletionResult> {
  switch (env.AI_PROVIDER) {
    case 'groq': return completeOpenAiCompatible(GROQ, req);
    case 'xai': return completeOpenAiCompatible(XAI, req);
    case 'anthropic': return completeWithAnthropic(req);
  }
}
