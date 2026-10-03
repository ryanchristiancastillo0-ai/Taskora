const AppError = require("../../../utils/AppError.js");
const AIProvider = require("./aiProvider.js");

const toOpenAiContent = (message) => {
  if (!message.parts?.length) {
    return message.content;
  }

  return message.parts.map((part) => {
    if (part.inlineData) {
      return {
        type: "image_url",
        image_url: {
          url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
        },
      };
    }
    return { type: "text", text: part.text || "" };
  });
};

// Without an explicit ceiling the provider applies its own default, which is how
// replies ended up cut off part-way through. 8192 tokens is far more than a
// normal reply needs while still bounding the worst case. Override with
// AI_MAX_OUTPUT_TOKENS.
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

function resolveMaxTokens() {
  const raw = Number(process.env.AI_MAX_OUTPUT_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_OUTPUT_TOKENS;
}

class OpenRouterProvider extends AIProvider {
  constructor(model = process.env.OPENROUTER_MODEL || "openrouter/auto") {
    super();
    this.name = "OPENROUTER";
    this.model = model;
    this.maxTokens = resolveMaxTokens();

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new AppError("OPENROUTER_API_KEY is not configured", 500);
    }

    this.apiKey = apiKey;
  }

  async generateText({ systemPrompt, messages }) {
    try {
      if (!messages || messages.length === 0) {
        throw new AppError("No messages provided for OpenRouter", 400);
      }

      const payload = {
        model: this.model,
        messages: [
          ...(systemPrompt
            ? [{ role: "system", content: systemPrompt }]
            : []),
          ...messages.map((message) => ({
            role: message.role === "assistant" ? "assistant" : "user",
            content: toOpenAiContent(message),
          })),
        ],
        max_tokens: this.maxTokens,
      };

      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const detail = await response
          .text()
          .catch(() => `${response.status} ${response.statusText}`);
        console.error("[AIProvider:OPENROUTER]", detail.slice(0, 500));
        throw new AppError("OpenRouter request failed", 502);
      }

      const json = await response.json();
      const choice = json?.choices?.[0];
      const text = choice?.message?.content;

      if (!text) {
        // finish_reason "length" means the ceiling was hit before the model
        // finished a sentence, which is the same symptom as the old VARCHAR cap
        // but for a different reason. Say so rather than reporting "empty".
        if (choice?.finish_reason === "length") {
          throw new AppError(
            "OpenRouter stopped at the output token limit before finishing its reply",
            502
          );
        }
        throw new AppError("OpenRouter returned an empty response", 502);
      }

      return { text };
    } catch (err) {
      if (err.isOperational) throw err;
      throw this.mapError(err);
    }
  }
}

module.exports = OpenRouterProvider;