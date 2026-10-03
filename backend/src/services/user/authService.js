const crypto = require("crypto");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
} = require("../../utils/jwt.js");
const AppError = require("../../utils/AppError.js");

class AuthService {
  constructor(
    prisma,
    passwordService,
    emailService,
    emailValidationService,
    supportService = null
  ) {
    this.prisma = prisma;
    this.passwordService = passwordService;
    this.emailService = emailService;
    this.emailValidationService = emailValidationService;

    // Only used to raise the "a new account was created" admin notification.
    // Optional so the existing four-argument construction still works — a caller
    // that does not pass it simply registers without the admin bell, rather than
    // crashing on an undefined method.
    this.supportService = supportService;
  }

  async register({ email, password, firstName, lastName }) {
    // Deliverability is settled before anything reaches the database, so a
    // rejected address costs no query and cannot leave a partial user behind.
    // The dependency is required rather than optional: if this wiring is ever
    // dropped, registration fails closed instead of quietly skipping the check.
    await this.emailValidationService.validate(email);

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new AppError("Email is already registered", 409);
    }

    const passwordHash = await this.passwordService.hash(password);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
      },
    });

    await this.prisma.personalizationProfile.create({
      data: { userId: user.id },
    });

    const tokens = await this.createTokens(user.id);

    // Last, and deliberately not awaited into the critical path's error handling:
    // the account and its tokens already exist, so this can only ever add a
    // notification. supportService swallows its own failures for the same
    // reason — a successful sign-up must not become a 500 because an
    // admin-facing bell could not be rung.
    if (this.supportService) {
      await this.supportService.notifyAdminsNewUser(user);
    }

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async login({ email, password, device, rememberMe }) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new AppError("Invalid email or password", 401);
    }

    const passwordMatches = await this.passwordService.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      throw new AppError("Invalid email or password", 401);
    }

    const tokens = await this.createTokens(user.id, device, { rememberMe });

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async refresh(refreshToken) {
    const payload = verifyRefreshToken(refreshToken);

    if (payload.type !== "refresh") {
      throw new AppError("Invalid refresh token", 401);
    }

    const tokenHash = hashRefreshToken(refreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!storedToken) {
      throw new AppError("Refresh token not found", 401);
    }

    if (storedToken.revokedAt) {
      throw new AppError("Refresh token has been revoked", 401);
    }

    if (storedToken.expiresAt < new Date()) {
      throw new AppError("Refresh token has expired", 401);
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    return await this.createTokens(payload.userId, {}, {
      rememberMe: payload.rememberMe === true,
    });
  }

  async logout(refreshToken) {
    const tokenHash = hashRefreshToken(refreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!storedToken) return;

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(email) {
    // Fail before the account lookup so a missing Brevo config produces the
    // same response for every address and cannot be used to probe which
    // emails have accounts.
    this.emailService.assertConfigured();

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // `matched` is deliberately not in the HTTP response — the caller reads it
      // and only passes it to the audit log, which admins read and the person
      // typing the address does not. That is the one place the distinction is
      // safe, and it is the signal that distinguishes one person resetting their
      // password from a sweep testing a list of addresses.
      return {
        message: "If the email exists, a reset code has been sent.",
        matched: false,
        userId: null,
      };
    }

    await this.prisma.passwordResetCode.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = await this.passwordService.hash(code);

    const resetCode = await this.prisma.passwordResetCode.create({
      data: {
        userId: user.id,
        codeHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    try {
      await this.emailService.sendPasswordResetCode(user.email, code);
    } catch (error) {
      // Never leave a usable code behind when the mail never left the server,
      // otherwise the user could still complete a reset they were told failed.
      await this.prisma.passwordResetCode.update({
        where: { id: resetCode.id },
        data: { usedAt: new Date() },
      });
      throw error;
    }

    return {
      message: "If the email exists, a reset code has been sent.",
      matched: true,
      userId: user.id,
    };
  }

  async verifyResetCode({ email, code }) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new AppError("Invalid or expired reset code", 400);
    }

    const resetCode = await this.prisma.passwordResetCode.findFirst({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!resetCode) {
      throw new AppError("Invalid or expired reset code", 400);
    }

    const codeMatches = await this.passwordService.compare(
      code,
      resetCode.codeHash
    );

    if (!codeMatches) {
      throw new AppError("Invalid or expired reset code", 400);
    }

    return { valid: true };
  }

  async resetPassword({ email, code, newPassword }) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new AppError("Invalid or expired reset code", 400);
    }

    const resetCode = await this.prisma.passwordResetCode.findFirst({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!resetCode) {
      throw new AppError("Invalid or expired reset code", 400);
    }

    const codeMatches = await this.passwordService.compare(
      code,
      resetCode.codeHash
    );

    if (!codeMatches) {
      throw new AppError("Invalid or expired reset code", 400);
    }

    const passwordHash = await this.passwordService.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),

      this.prisma.passwordResetCode.update({
        where: { id: resetCode.id },
        data: { usedAt: new Date() },
      }),

      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    // userId is returned for the audit log only, for the same reason
    // forgotPassword returns `matched`: the controller reads it, records it, and
    // sends back the same message either way.
    return { message: "Password has been reset successfully", userId: user.id };
  }

  async getCurrentUser(userId) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { personalizationProfile: true },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    const profile = user.personalizationProfile;

    return {
      user: this.sanitizeUser(user),
      profile,
      onboardingCompleted: profile?.onboardingCompleted ?? false,
      onboardingStarted: profile?.onboardingStarted ?? false,
      onboardingSkipped: profile?.onboardingSkipped ?? false,
      isNew: !(profile?.onboardingStarted || profile?.onboardingSkipped || profile?.onboardingCompleted),
    };
  }

  async createTokens(userId, device = {}, { rememberMe = false } = {}) {
    const accessToken = signAccessToken(userId);
    const refreshToken = signRefreshToken(userId, { rememberMe });
    const tokenHash = hashRefreshToken(refreshToken);

    // Must match the JWT lifetime, otherwise refresh() rejects a token the
    // cookie is still willing to present.
    const lifetimeMs = rememberMe
      ? 30 * 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        deviceId: device.deviceId?.toString() ?? null,
        deviceName: device.deviceName?.toString().slice(0, 100) ?? null,
        deviceType: device.deviceType?.toString().slice(0, 20) ?? null,
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + lifetimeMs),
      },
    });

    return { accessToken, refreshToken, rememberMe };
  }

  sanitizeUser(user) {
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }
}

module.exports = AuthService;