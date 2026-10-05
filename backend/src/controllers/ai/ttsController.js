const asyncHandler = require("../../utils/asyncHandler.js");

// HTTP layer only: validate/route the request, delegate to the TTS service,
// return the audio. No ElevenLabs logic lives here.
class TtsController {
  constructor(ttsService) {
    this.ttsService = ttsService;
  }

  listVoices = asyncHandler(async (req, res) => {
    const voices = this.ttsService.listVoices();
    return res.status(200).json({ success: true, data: { voices } });
  });

  speak = asyncHandler(async (req, res) => {
    const audio = await this.ttsService.synthesizeSpeech(req.body);

    res.status(200);
    res.set("Content-Type", "audio/mpeg");
    res.set("Content-Length", audio.length);
    return res.send(audio);
  });
}

module.exports = TtsController;