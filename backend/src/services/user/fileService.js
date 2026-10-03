const fs = require("fs");
const path = require("path");
const { uploadDir } = require("../../middleware/uploadMiddleware.js");
const AppError = require("../../utils/AppError.js");

const PUBLIC_PREFIX = "/uploads/";

class FileService {
  buildUrl(filename) {
    return `${PUBLIC_PREFIX}${filename}`;
  }

  isUploadUrl(value) {
    return typeof value === "string" && value.startsWith(PUBLIC_PREFIX);
  }

  resolvePath(value) {
    if (!this.isUploadUrl(value)) {
      throw new AppError("Invalid file URL", 400);
    }

    const basename = path.basename(value);
    const resolved = path.normalize(path.join(uploadDir, basename));

    if (!resolved.startsWith(uploadDir + path.sep)) {
      throw new AppError("Invalid file URL", 400);
    }

    return resolved;
  }

  async deleteByUrl(url) {
    if (!this.isUploadUrl(url)) return;

    const target = this.resolvePath(url);

    try {
      await fs.promises.unlink(target);
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.error("[FileService] Failed to delete file:", err.message);
      }
    }
  }
}

module.exports = FileService;