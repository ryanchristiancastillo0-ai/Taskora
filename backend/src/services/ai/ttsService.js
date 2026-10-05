const AppError = require("../../utils/AppError.js");
const { parseSchema } = require("../../utils/validate.js");
const { speakSchema } = require("../../validators/ai/aiValidators.js");

// ElevenLabs TTS lives here — THIS file is the single owner of every
// ElevenLabs-specific detail: available voices and the TTS model.
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";
const TTS_MODEL = "eleven_multilingual_v2";

// Voice IDs are configuration, not secrets. They live ONLY here (never in
// .env, controllers, routes or frontend code). Add future voices as new
// entries; the FIRST entry is the default.
const VOICES = [
  {
    name: "Voice 1",
    description: "Warm, expressive narrator — the default conversational voice.", // TODO: fill in the real ElevenLabs voice description
    id: "Oma5fJaT8akx1fqdiUKg",
  },
  {
    name: "Voice 2",
    description: "Add your second voice description here.",
    id: "b0UYzkk1EYOL1wmYYf7d",
  },
  // {
  //   name: "Voice 3",
  //   description: "Add your third voice description here.",
  //   id: "<THIRD_VOICE_ID>",
  // },
];

// Backward-compatible registry lookup by legacy key ("voice1" -> first
// entry, "voice2" -> second, ...) so saved conversations keep working.
const VOICES_BY_KEY = VOICES.reduce((map, voice, index) => {
  map[`voice${index + 1}`] = voice;
  return map;
}, {});

class TtsService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
  }

  listVoices() {
    return VOICES.map(({ name, description, id }) => ({ name, description, id }));
  }

  // Accepts either a Voice ID or a legacy registry key (e.g. "voice1");
  // unknown values fall back to the default (first) voice.
  resolveVoice(voiceId) {
    if (voiceId) {
      const byKey = VOICES_BY_KEY[voiceId];
      if (byKey) return byKey.id;
      const byId = VOICES.find((voice) => voice.id === voiceId);
      if (byId) return byId.id;
    }
    return VOICES[0].id;
  }

  async synthesizeSpeech(data) {
    const { text, voiceId } = parseSchema(speakSchema, data ?? {});
    const voice = this.resolveVoice(voiceId);

    if (!this.apiKey) {
      throw new AppError("ELEVENLABS_API_KEY is not configured", 500);
    }

    let response;
    try {
      response = await fetch(
        `${ELEVENLABS_API_URL}/text-to-speech/${voice}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": this.apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text,
            model_id: TTS_MODEL,
          }),
        }
      );
    } catch (error) {
      console.error("[TtsService] ElevenLabs request failed:", error.message);
      throw new AppError("Speech synthesis failed", 502);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(
        `[TtsService] ElevenLabs responded ${response.status}: ${body}`
      );
      throw new AppError("Speech synthesis failed", 502);
    }

    const arrayBuffer = await response.arrayBuffer().catch(() => null);
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new AppError("Speech synthesis returned no audio", 502);
    }

    return Buffer.from(arrayBuffer);
  }
}

module.exports = TtsService;