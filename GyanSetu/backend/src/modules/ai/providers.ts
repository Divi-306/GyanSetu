import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { HttpError } from '../../lib/errors';
import { logger } from '../../lib/logger';

export type CompletionRequest = {
  system: string;
  user: string;
  /** JSON Schema the reply must match. */
  schema: Record<string, unknown>;
};

export type CompletionResult =
  | { kind: 'json'; text: string; model: string; inputTokens: number | null; outputTokens: number | null }
  | { kind: 'refused'; model: string };

const busy = () => new HttpError(503, 'AI_BUSY', 'The AI tutor is busy. Try again in a minute.');
const unavailable = () => new HttpError(502, 'AI_UNAVAILABLE', 'The AI tutor is unavailable right now');

// ─────────────────────────── xAI (Grok) ───────────────────────────
// OpenAI-compatible chat completions with a strict JSON schema.
// Docs: https://docs.x.ai/developers/model-capabilities/text/structured-outputs

const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const XAI_DEFAULT_MODEL = 'grok-4.7';

async function completeWithXai(req: CompletionRequest): Promise<CompletionResult> {
  const model = env.AI_MODEL ?? XAI_DEFAULT_MODEL;
  let res: Response;
  try {
    res = await fetch(XAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.XAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'tutor_answer', strict: true, schema: req.schema },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    logger.error({ err }, 'xAI request failed');
    throw unavailable();
  }

  if (res.status === 429) throw busy();
  if (!res.ok) {
    // Log the provider's error for us; never pass it through to students.
    logger.error({ status: res.status, body: (await res.text().catch(() => '')).slice(0, 500) }, 'xAI API error');
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
    logger.error({ finishReason: choice?.finish_reason }, 'Unusable xAI response');
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
  const model = env.AI_MODEL ?? ANTHROPIC_DEFAULT_MODEL;
  let response;
  try {
    response = await anthropic.beta.messages.create({
      model,
      max_tokens: 16000,
      // If the model declines, the API re-runs the request on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: req.schema } },
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    });
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
  return env.AI_PROVIDER === 'xai' ? Boolean(env.XAI_API_KEY) : Boolean(env.ANTHROPIC_API_KEY);
}

export function complete(req: CompletionRequest): Promise<CompletionResult> {
  return env.AI_PROVIDER === 'xai' ? completeWithXai(req) : completeWithAnthropic(req);
}
