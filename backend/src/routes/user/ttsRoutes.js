const express = require("express");

const { ttsService } = require("../../config/container.js");
const TtsController = require("../../controllers/user/ttsController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");

const router = express.Router();

const ttsController = new TtsController(ttsService);

router.post("/speak", authMiddleware, ttsController.speak);
router.get("/voices", authMiddleware, ttsController.listVoices);

module.exports = router;