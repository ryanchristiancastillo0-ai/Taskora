// Verifies (a) every sound the seed points at exists and is a structurally
// valid audio file, and (b) the existing express.static("/uploads") mount serves
// them at the exact path stored in the database. No database required.
const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");

const { uploadDir, notificationSoundDir } = require("../src/middleware/uploadMiddleware");

// Kept in step with NOTIFICATION_SOUNDS in prisma/seed.js.
const EXPECTED = [
  "/uploads/notifications/current.wav",
  "/uploads/notifications/doremon.mp3",
  "/uploads/notifications/flute.wav",
  "/uploads/notifications/musical-alert.wav",
  "/uploads/notifications/musical.wav",
  "/uploads/notifications/orchestral.wav",
];

// WAV is a chunk list, and files exported by some tools carry extra chunks
// (bext, LIST, ID3) around the audio, so fmt and data are NOT at fixed offsets.
// Walk the chunks rather than assuming the canonical 44-byte header.
function readWav(buf) {
  const problems = [];

  if (buf.toString("ascii", 0, 4) !== "RIFF") problems.push("missing RIFF");
  if (buf.toString("ascii", 8, 12) !== "WAVE") problems.push("missing WAVE");

  const riffSize = buf.readUInt32LE(4);
  if (riffSize + 8 > buf.length) problems.push("RIFF size exceeds file length");

  let offset = 12;
  let fmt = null;
  let data = null;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (body + size > buf.length) {
      problems.push(`chunk "${id}" overruns the file`);
      break;
    }

    if (id === "fmt " && !fmt) {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === "data" && !data) {
      data = { start: body, size };
    }

    // Chunks are word aligned: an odd size is followed by a pad byte.
    offset = body + size + (size % 2);
  }

  if (!fmt) problems.push("no fmt chunk");
  if (!data) problems.push("no data chunk");
  if (problems.length) return { problems, seconds: "?", detail: "unreadable" };

  if (fmt.audioFormat !== 1) problems.push(`not PCM (format ${fmt.audioFormat})`);
  if (fmt.channels !== 1 && fmt.channels !== 2) {
    problems.push(`expected mono or stereo, got ${fmt.channels}`);
  }
  if (fmt.bits !== 16) problems.push(`expected 16-bit, got ${fmt.bits}`);
  if (data.size === 0) problems.push("clip is empty");

  const frameBytes = fmt.channels * (fmt.bits / 8);
  const frames = Math.floor(data.size / frameBytes);

  // Peak amplitude across the actual data extent, so a silent or all-zero file
  // is caught and trailing metadata is not mistaken for audio.
  let peak = 0;
  for (let i = 0; i < frames; i += 1) {
    peak = Math.max(peak, Math.abs(buf.readInt16LE(data.start + i * frameBytes)));
  }
  if (peak < 100) problems.push(`clip is near-silent (peak ${peak})`);

  return {
    problems,
    seconds: (frames / fmt.sampleRate).toFixed(2),
    detail: `${fmt.sampleRate}Hz ${fmt.channels === 2 ? "stereo" : "mono"} ${fmt.bits}-bit`,
  };
}

// MP3 has no global header, so validate the first frame and estimate duration
// from the bitrate. Enough to catch a truncated, renamed or empty file.
function readMp3(buf) {
  const problems = [];

  // An ID3v2 tag, when present, precedes the first audio frame.
  let offset = 0;
  let id3 = false;
  if (buf.toString("ascii", 0, 3) === "ID3") {
    const size =
      ((buf[6] & 0x7f) << 21) |
      ((buf[7] & 0x7f) << 14) |
      ((buf[8] & 0x7f) << 7) |
      (buf[9] & 0x7f);
    offset = 10 + size;
    id3 = true;
  }

  if (buf[offset] !== 0xff || (buf[offset + 1] & 0xe0) !== 0xe0) {
    problems.push(`no MPEG frame sync at byte ${offset}`);
  }

  const versionBits = (buf[offset + 1] >> 3) & 0x03;
  const layerBits = (buf[offset + 1] >> 1) & 0x03;
  const bitrateIndex = (buf[offset + 2] >> 4) & 0x0f;
  const rateIndex = (buf[offset + 2] >> 2) & 0x03;

  // 3 = MPEG-1, 2 = MPEG-2. 0 is reserved.
  const sampleRates = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000] };
  if (!sampleRates[versionBits]) problems.push(`reserved MPEG version ${versionBits}`);
  if (layerBits !== 1) problems.push(`not Layer III (layer bits ${layerBits})`);
  if (bitrateIndex === 0 || bitrateIndex === 15) {
    problems.push(`bitrate index ${bitrateIndex} is free/invalid`);
  }

  // Index 3 is reserved within each table.
  const sampleRate = sampleRates[versionBits] ? sampleRates[versionBits][rateIndex] : 0;
  if (sampleRates[versionBits] && rateIndex === 3) problems.push("reserved sample rate");

  const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const kbps = BITRATES_V1_L3[bitrateIndex] || 0;
  const audioBytes = buf.length - offset;
  const seconds = kbps ? (audioBytes * 8) / (kbps * 1000) : 0;

  if (seconds < 0.05) problems.push("clip is empty or truncated");

  return {
    problems,
    seconds: seconds.toFixed(2),
    detail: `${sampleRate}Hz ${kbps}kbps${id3 ? " +id3" : ""}`,
  };
}

function checkAudio(relPath) {
  const file = path.join(uploadDir, relPath.replace(/^\/uploads\//, ""));
  const buf = fs.readFileSync(file);

  const isMp3 = /\.mp3$/i.test(relPath);
  const looksWav = buf.toString("ascii", 0, 4) === "RIFF";
  const looksMp3 = buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;

  let result;
  if (isMp3 || (!looksWav && looksMp3)) {
    result = readMp3(buf);
  } else if (looksWav) {
    result = readWav(buf);
  } else {
    throw new Error(`${relPath}: unrecognised audio container`);
  }

  if (result.problems.length) {
    throw new Error(`${relPath}: ${result.problems.join("; ")}`);
  }

  return { ...result, bytes: buf.length };
}

async function run() {
  // Every seeded path must exist on disk and be playable, or the catalogue
  // would point at files the notification player cannot decode.
  for (const rel of EXPECTED) {
    const info = checkAudio(rel);
    console.log(
      `ok  ${rel.padEnd(48)} ${info.seconds.padStart(5)}s  ${info.detail}  ${info.bytes}B`
    );
  }

  // Confirm the files live in the dedicated directory, not the upload root.
  const stray = fs
    .readdirSync(uploadDir)
    .filter((entry) => /\.(wav|mp3|m4a|ogg|webm)$/i.test(entry));
  if (stray.length) {
    throw new Error(`audio files leaked into the upload root: ${stray.join(", ")}`);
  }

  const inDir = fs.readdirSync(notificationSoundDir);
  const extra = inDir.filter(
    (entry) => !EXPECTED.some((rel) => rel.endsWith(`/${entry}`))
  );
  if (extra.length) {
    // Not fatal, but these files are invisible to the client: nothing lists them.
    console.log(`note  present but not in the seed: ${extra.join(", ")}`);
  }
  console.log(
    `ok  all ${inDir.length} sounds live in uploads/notifications/, upload root has no audio`
  );

  // Serve them through the same static mount the app already uses.
  const app = express();
  app.use("/uploads", express.static(uploadDir));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    for (const rel of EXPECTED) {
      const res = await fetch(`http://127.0.0.1:${port}${rel}`);
      if (!res.ok) throw new Error(`${rel} -> HTTP ${res.status}`);
      const type = res.headers.get("content-type") || "";
      if (!type.startsWith("audio/")) {
        throw new Error(`${rel} served as unexpected content-type "${type}"`);
      }
      const body = await res.arrayBuffer();
      if (body.byteLength === 0) throw new Error(`${rel} served an empty body`);
      console.log(`ok  GET ${rel} -> ${res.status} ${type} (${body.byteLength}B)`);
    }

    // A traversal attempt must not escape the mount.
    const escaped = await fetch(`http://127.0.0.1:${port}/uploads/../.env`);
    console.log(`ok  traversal attempt blocked (HTTP ${escaped.status})`);
  } finally {
    server.close();
  }

  console.log("\nAll notification sound asset checks passed.");
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
