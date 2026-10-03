const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const AppError = require("../utils/AppError");

const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

// Notification alert audio is kept in its own subdirectory so the whole set can
// be listed, replaced or re-seeded as one group instead of being mixed in with
// user uploads. Still local disk: the files are served by the existing
// `app.use("/uploads", express.static(uploadDir))` mount, and the database only
// ever stores the relative path.
const notificationSoundDir = path.join(uploadDir, "notifications");

fs.mkdirSync(notificationSoundDir, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Audio
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/vnd.wave",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
  // Documents
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Web / markup
  "text/html",
  "application/xhtml+xml",
  // Code / text source files
  "text/css",
  "text/javascript",
  "application/javascript",
  "application/x-javascript",
  "text/x-javascript",
  "text/x-python",
  "application/x-python",
  "text/x-python-source",
  "text/x-php",
  "application/x-httpd-php",
  "text/x-java-source",
  "text/x-c",
  "text/x-c++",
  "text/x-ruby",
  "text/x-go",
  "text/x-sh",
  "application/x-sh",
  "application/x-shellscript",
  "text/xml",
  "application/xml",
  "text/yaml",
  "text/x-yaml",
  "text/x-diff",
  "text/x-typescript",
  "text/x-jsonld",
  // Archives
  "application/zip",
  "application/gzip",
  "application/x-tar",
  // Fallback for anything reported as unknown by the browser
  "application/octet-stream",
]);

// Notification sounds only. Deliberately narrower than ALLOWED_MIME_TYPES so an
// image or an archive can never be written into uploads/notifications.
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/vnd.wave",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
]);

const MAX_FILE_SIZE = Number(
  process.env.MAX_FILE_SIZE_BYTES || 5 * 1024 * 1024
);

// Filenames are randomised so an upload can never overwrite an existing file or
// escape the destination directory via the client-supplied name.
function buildFilename(originalname) {
  const originalExt = path
    .extname(originalname || "")
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "")
    .slice(0, 10);

  return `${crypto.randomUUID()}${originalExt}`;
}

function createStorage(destination) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, destination),
    filename: (req, file, cb) => cb(null, buildFilename(file.originalname)),
  });
}

const storage = createStorage(uploadDir);

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(null, true);
  }

  cb(new AppError(`Unsupported file type: ${file.mimetype}`, 400));
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
});

// Reusable factory: build a multer middleware for any field name, number of
// files and size cap. Keeps the upload rules in one place (SOLID-friendly).
// Pass `destination` to write into a subdirectory of uploads/ instead of the
// shared root.
function createUpload({
  fieldName = "file",
  maxFiles = 1,
  maxSizeBytes = MAX_FILE_SIZE,
  allowedTypes = ALLOWED_MIME_TYPES,
  destination = null,
} = {}) {
  const instance = multer({
    storage: destination ? createStorage(destination) : storage,
    fileFilter: (req, file, cb) => {
      if (allowedTypes.has(file.mimetype)) {
        return cb(null, true);
      }
      cb(new AppError(`Unsupported file type: ${file.mimetype}`, 400));
    },
    limits: { fileSize: maxSizeBytes, files: maxFiles },
  });

  if (maxFiles > 1) {
    return instance.array(fieldName, maxFiles);
  }
  return instance.single(fieldName);
}

// Multer middleware for notification alert audio. Writes into
// uploads/notifications and accepts audio only, so wiring an upload route later
// is a one-liner. The public URL is derived from the stored file's basename,
// which the NotificationSound row keeps in its `path` column.
function createNotificationSoundUpload({
  fieldName = "file",
  maxSizeBytes = MAX_FILE_SIZE,
} = {}) {
  return createUpload({
    fieldName,
    allowedTypes: ALLOWED_AUDIO_MIME_TYPES,
    destination: notificationSoundDir,
    maxSizeBytes,
  });
}

module.exports = {
  uploadMiddleware: upload.single("file"),
  createUpload,
  createNotificationSoundUpload,
  uploadDir,
  notificationSoundDir,
  ALLOWED_MIME_TYPES,
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_FILE_SIZE,
};