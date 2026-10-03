const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");

/**
 * Gate for the admin console. Always mounted AFTER authMiddleware, never
 * instead of it: on its own this has no idea who the caller is.
 *
 * The role is read from the database on every admin request rather than trusted
 * from the access token. Putting `role` in the JWT would be cheaper, but the
 * token lives 15 minutes, so demoting someone would leave them with admin
 * access until it expired. One indexed primary-key lookup per admin request is a
 * fair price for a permission that takes effect immediately.
 *
 * `status` is checked here too, so a suspended account is locked out of the
 * console even if it still holds a valid, unexpired access token. Suspending
 * also revokes that account's refresh tokens (see AdminService.updateUser),
 * which is what stops it from simply minting a new access token.
 */
function adminGuard(req, res, next) {
  Promise.resolve()
    .then(async () => {
      if (!req.user?.userId) {
        // Reached only if mounted without authMiddleware. Fail closed rather
        // than trusting an empty req.user.
        throw new AppError("Authentication required", 401);
      }

      const account = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, role: true, status: true },
      });

      if (!account) {
        throw new AppError("Account not found", 401);
      }

      if (account.status === "SUSPENDED") {
        throw new AppError("This account has been suspended", 403);
      }

      if (account.role !== "ADMIN") {
        throw new AppError("Administrator access required", 403);
      }

      // Hand the verified role to downstream handlers so a controller can tell
      // an admin apart from the JWT alone without querying again.
      req.user = { ...req.user, role: account.role };

      next();
    })
    .catch(next);
}

module.exports = adminGuard;
