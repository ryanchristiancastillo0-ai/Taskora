const AppError = require("../../../utils/AppError.js");
const GeminiProvider = require("./geminiProvider.js");
const OpenRouterProvider = require("./openRouterProvider.js");

// Centralized provider selection. Adding a provider = one new case.
class AIProviderFactory {
  static create(name) {
    switch (name) {
      case "GEMINI":
        return new GeminiProvider();
      case "OPENROUTER":
        return new OpenRouterProvider();
      default:
        throw new AppError(`Unknown AI provider: ${name}`, 400);
    }
  }

  static get(name) {
    if (!AIProviderFactory.instances) {
      AIProviderFactory.instances = new Map();
    }

    if (!AIProviderFactory.instances.has(name)) {
      AIProviderFactory.instances.set(name, AIProviderFactory.create(name));
    }

    return AIProviderFactory.instances.get(name);
  }

  /**
   * The provider to fall back to when `name` is unavailable.
   *
   * Only providers that are actually configured are considered, so a missing API
   * key produces "no fallback" instead of a second failure on top of the first
   * one. `visited` holds the providers already tried for this request and is
   * honoured so two exhausted providers cannot hand the work back and forth
   * forever.
   */
  static getFallbackFor(name, visited) {
    const order = { GEMINI: "OPENROUTER", OPENROUTER: "GEMINI" };
    const candidate = order[name];
    if (!candidate) return null;
    if (visited instanceof Set && visited.has(candidate)) {
      console.warn(
        `[AIProvider:${name}] already tried ${candidate}; no untried provider left`
      );
      return null;
    }

    const requiredKey =
      candidate === "GEMINI" ? "GEMINI_API_KEY" : "OPENROUTER_API_KEY";
    if (!process.env[requiredKey]) {
      console.warn(
        `[AIProvider:${name}] no fallback available (${requiredKey} not configured)`
      );
      return null;
    }

    try {
      return AIProviderFactory.get(candidate);
    } catch (error) {
      console.warn(`[AIProvider:${name}] fallback unavailable: ${error.message}`);
      return null;
    }
  }
}

module.exports = AIProviderFactory;