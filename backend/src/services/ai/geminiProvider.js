const { GoogleGenAI } = require("@google/genai");
const AppError = require("../../utils/AppError.js");
const AIProvider = require("./aiProvider.js");

// Without an explicit ceiling the model is free to run until the provider's own
// default stops it, which is how replies ended up cut off part-way through.
// 8192 tokens is far more than a normal reply needs while still bounding the
// worst case. Override with AI_MAX_OUTPUT_TOKENS.
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

function resolveMaxOutputTokens() {
  const raw = Number(process.env.AI_MAX_OUTPUT_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_OUTPUT_TOKENS;
}

// Gemini 3.x Flash reasons by default, and on measured workloads that thinking
// was 75% of the total token budget (1326 of 1769) while only ~14 tokens were
// left for the answer the user actually reads. It roughly tripled latency for a
// task assistant that mostly lists and prioritises. Budget 0 keeps the endpoint
// fast; raise it with AI_THINKING_BUDGET when a hard question genuinely needs
// reasoning. "auto" hands the decision back to the model.
function resolveThinkingBudget() {
  const raw = String(process.env.AI_THINKING_BUDGET ?? "0").trim().toLowerCase();
  if (raw === "" || raw === "auto") return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

class GeminiProvider extends AIProvider {
  constructor(model = process.env.GEMINI_MODEL || "gemini-3.8-flash") {
    super();
    this.name = "GEMINI";
    this.model = model;
    this.maxOutputTokens = resolveMaxOutputTokens();
    this.thinkingBudget = resolveThinkingBudget();

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new AppError("GEMINI_API_KEY is not configured", 500);
    }

    this.client = new GoogleGenAI({ apiKey });
  }

  // Shared request config so the streaming and non-streaming paths can never
  // drift apart.
  buildConfig(systemPrompt) {
    return {
      systemInstruction: systemPrompt || undefined,
      maxOutputTokens: this.maxOutputTokens,
      ...(this.thinkingBudget === undefined
        ? {}
        : { thinkingConfig: { thinkingBudget: this.thinkingBudget } }),
    };
  }

  buildContents(messages) {
    return messages.map((message) => {
      const parts = message.parts?.length
        ? message.parts
        : [{ text: message.content || "" }];

      return {
        role: message.role === "assistant" ? "model" : "user",
        parts,
      };
    });
  }

  assertUsable(response, mode) {
    const text = response?.text;

    if (!text) {
      // finishReason MAX_TOKENS means the ceiling was hit before the model
      // finished a sentence, which is the same symptom as the old VARCHAR cap
      // but for a different reason. Say so rather than reporting "empty".
      if (response?.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        throw new AppError(
          "Gemini stopped at the output token limit before finishing its reply",
          502
        );
      }
      throw new AppError(`Gemini returned an empty response${mode ? ` (${mode})` : ""}`, 502);
    }

    return { text };
  }

  /**
   * Streams the reply, invoking onChunk with the text delta as it arrives.
   * Used by the chat path so the user reads the answer as it is written instead
   * of staring at a blank composer for the whole generation.
   */
  async generateTextStreamed({ systemPrompt, messages, onChunk }) {
    try {
      const stream = await this.client.models.generateContentStream({
        model: this.model,
        contents: this.buildContents(messages),
        config: this.buildConfig(systemPrompt),
      });

      let text = "";
      let finishReason;
      let last;

      for await (const chunk of stream) {
        last = chunk;
        const delta = chunk?.text || "";
        if (!delta) continue;
        text += delta;
        if (onChunk) {
          try {
            onChunk(delta, text);
          } catch {
            // A slow or broken socket consumer must never abort the generation.
          }
        }
      }

      finishReason = last?.candidates?.[0]?.finishReason;
      return this.assertUsable({ text, candidates: [{ finishReason }] }, "stream");
    } catch (err) {
      if (err.isOperational) throw err;
      throw this.mapError(err);
    }
  }

  async generateText({ systemPrompt, messages }) {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: this.buildContents(messages),
        config: this.buildConfig(systemPrompt),
      });

      return this.assertUsable(response);
    } catch (err) {
      if (err.isOperational) throw err;
      throw this.mapError(err);
    }
  }
}

module.exports = GeminiProvider;