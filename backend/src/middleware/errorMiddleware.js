const multer = require("multer");
const AppError = require("../utils/AppError");

function isAppError(err) {
  return err instanceof AppError;
}

const errorMiddleware = (err, req, res, next) => {
  if (isAppError(err)) {
    const body = { success: false, message: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.statusCode).json(body);
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File is too large",
      });
    }

    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`,
    });
  }

  if (err && err.name === "ZodError") {
    const issues = Array.isArray(err.issues)
      ? err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }))
      : undefined;

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: issues,
    });
  }

  console.error("[Unhandled error]", err);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

const notFoundMiddleware = (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
};

module.exports = { errorMiddleware, notFoundMiddleware };