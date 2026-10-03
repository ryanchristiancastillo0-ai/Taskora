// TTS service unit tests with a mocked ElevenLabs API.
// Run with: node tests/ttsService.test.js
const assert = require("assert");
const TtsService = require("../src/services/user/ttsService.js");

async function run() {
  const originalFetch = global.fetch;

  // ---------- empty text -> validation error ----------
  {
    const service = new TtsService();
    await assert.rejects(
      () => service.synthesizeSpeech({ text: "   " }),
      (error) => error.isOperational && error.statusCode === 400
    );
    console.log("empty text rejected: OK");
  }

  // ---------- missing API key -> 500 ----------
  {
    const previous = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    const service = new TtsService();
    await assert.rejects(
      () => service.synthesizeSpeech({ text: "Hello world" }),
      (error) => error.isOperational && error.statusCode === 500
    );
    if (previous !== undefined) process.env.ELEVENLABS_API_KEY = previous;
    console.log("missing key rejected: OK");
  }

  // ---------- unresolved voice falls back to default (voice1) ----------
  {
    const service = new TtsService();
    const defaultVoice = service.listVoices()[0];
    assert.strictEqual(service.resolveVoice("not-a-real-voice"), defaultVoice.id);
    assert.strictEqual(service.resolveVoice(undefined), defaultVoice.id);
    assert.strictEqual(service.resolveVoice("voice1"), defaultVoice.id);
    assert.strictEqual(service.resolveVoice("4RLeKvASM0Zt73Htf5GF"), defaultVoice.id);
    console.log("voice fallback to default: OK");
  }

  // ---------- successful synthesis returns audio/mpeg buffer ----------
  {
    process.env.ELEVENLABS_API_KEY = "test-key";
    global.fetch = async (url, options) => {
      assert.strictEqual(url, `https://api.elevenlabs.io/v1/text-to-speech/${new TtsService().listVoices()[0].id}`);
      assert.ok(options.headers["xi-api-key"] === "test-key");
      assert.ok(options.headers["Content-Type"] === "application/json");
      assert.ok(!String(options.body).includes("test-key"), "API key must not be in the body");
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from([0, 1, 2, 3]),
      };
    };
    const service = new TtsService();
    const audio = await service.synthesizeSpeech({ text: "Hello world" });
    assert.ok(Buffer.isBuffer(audio));
    assert.strictEqual(audio.length, 4);
    console.log("successful synthesis returns audio buffer: OK");
  }

  // ---------- ElevenLabs non-2xx -> 502 ----------
  {
    process.env.ELEVENLABS_API_KEY = "test-key";
    global.fetch = async () => ({
      ok: false,
      status: 401,
      text: async () => `{"detail":"Unauthorized"}`,
    });
    const service = new TtsService();
    await assert.rejects(
      () => service.synthesizeSpeech({ text: "Hello world" }),
      (error) => error.isOperational && error.statusCode === 502
    );
    console.log("upstream error mapped to 502: OK");
  }

  // ---------- no audio in response -> 502 ----------
  {
    process.env.ELEVENLABS_API_KEY = "test-key";
    global.fetch = async () => ({ ok: true, arrayBuffer: async () => null });
    const service = new TtsService();
    await assert.rejects(
      () => service.synthesizeSpeech({ text: "Hello world" }),
      (error) => error.isOperational && error.statusCode === 502
    );
    console.log("empty audio mapped to 502: OK");
  }

  global.fetch = originalFetch;
  delete process.env.ELEVENLABS_API_KEY;
  console.log("\nAll TTS service tests passed.");
}

run().catch((error) => {
  console.error("Test run failed:", error);
  process.exit(1);
});