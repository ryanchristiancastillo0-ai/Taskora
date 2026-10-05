const crypto = require("crypto");
const AppError = require("../../utils/AppError.js");
const { parseSchema, definedOnly } = require("../../utils/validate.js");
const {
  updateUserSchema,
  changePasswordSchema,
  changePasswordWithCodeSchema,
  requestEmailChangeSchema,
  verifyEmailChangeSchema,
} = require("../../validators/users/userValidators.js");

class UserService {
  constructor(prisma, passwordService, fileService, emailService = null) {
    this.prisma = prisma;
    this.passwordService = passwordService;
    this.fileService = fileService;
    this.emailService = emailService;
  }

  async getCurrentUser(userId) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { personalizationProfile: true },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    const { passwordHash, personalizationProfile, ...safeUser } = user;

    return {
      user: safeUser,
      profile: personalizationProfile,
      onboardingCompleted: personalizationProfile?.onboardingCompleted ?? false,
      onboardingStarted: personalizationProfile?.onboardingStarted ?? false,
      onboardingSkipped: personalizationProfile?.onboardingSkipped ?? false,
      isNew: !(personalizationProfile?.onboardingStarted || personalizationProfile?.onboardingSkipped || personalizationProfile?.onboardingCompleted),
    };
  }

  async updateUser({ userId, data }) {
    const parsed = parseSchema(updateUserSchema, data);
    const updateData = definedOnly(parsed);

    // Read before the write, and only when the avatar is being cleared: the
    // upload route deletes the file it replaces, so this is the other way a
    // photo leaves an account and it must not be orphaned on disk.
    const previousAvatar =
      updateData.avatarUrl === null
        ? await this.prisma.user.findUnique({
            where: { id: userId },
            select: { avatarUrl: true },
          })
        : null;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    if (previousAvatar?.avatarUrl) {
      await this.fileService.deleteByUrl(previousAvatar.avatarUrl);
    }

    const { passwordHash, ...safeUser } = updated;

    return safeUser;
  }

  async deleteUser(userId) {
    await this.prisma.user.delete({ where: { id: userId } });
  }

  async changePassword(userId, data) {
    const parsed = parseSchema(changePasswordSchema, data);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    const matches = await this.passwordService.compare(
      parsed.currentPassword,
      user.passwordHash
    );

    if (!matches) {
      throw new AppError("Current password is incorrect", 400);
    }

    const passwordHash = await this.passwordService.hash(parsed.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /**
   * Issues the emailed confirmation code for the signed-in change-password
   * flow. PasswordResetCode carries no purpose column, so requesting a code
   * retires every outstanding code for that user. That keeps exactly one usable
   * code alive at a time, so a code issued for one flow can never be replayed
   * after the other flow supersedes it.
   */
  async requestChangePasswordCode(userId) {
    if (!this.emailService) {
      throw new AppError("Email service is not configured", 503);
    }
    this.emailService.assertConfigured();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    await this.prisma.passwordResetCode.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = await this.passwordService.hash(code);

    const resetCode = await this.prisma.passwordResetCode.create({
      data: {
        userId,
        codeHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    try {
      await this.emailService.sendChangePasswordCode(user.email, code);
    } catch (error) {
      // Do not leave a live code behind when the mail never went out.
      await this.prisma.passwordResetCode.update({
        where: { id: resetCode.id },
        data: { usedAt: new Date() },
      });
      throw error;
    }

    return { message: "A verification code was sent to your email address." };
  }

  async changePasswordWithCode(userId, data) {
    const parsed = parseSchema(changePasswordWithCodeSchema, data);

    if (!this.emailService) {
      throw new AppError("Email service is not configured", 503);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    const resetCode = await this.prisma.passwordResetCode.findFirst({
      where: {
        userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!resetCode) {
      throw new AppError("Invalid or expired verification code", 400);
    }

    const codeMatches = await this.passwordService.compare(
      parsed.code,
      resetCode.codeHash
    );

    if (!codeMatches) {
      throw new AppError("Invalid or expired verification code", 400);
    }

    const sameAsCurrent = await this.passwordService.compare(
      parsed.newPassword,
      user.passwordHash
    );

    if (sameAsCurrent) {
      throw new AppError(
        "New password must be different from your current password",
        400
      );
    }

    const passwordHash = await this.passwordService.hash(parsed.newPassword);

    // Matches changePassword: a password change revokes every outstanding
    // refresh token, so a stolen session cannot outlive the new credential.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetCode.update({
        where: { id: resetCode.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /**
   * Step 1 of the email change. The code goes to the NEW address, so finishing
   * the flow is what proves the requester controls the mailbox being switched
   * to. Current password is re-checked here so an unattended session cannot
   * begin the move.
   *
   * Any outstanding request is retired first, so at most one address can ever be
   * pending and a code issued for an earlier attempt cannot be replayed.
   */
  async requestEmailChangeCode(userId, data) {
    const parsed = parseSchema(requestEmailChangeSchema, data);

    if (!this.emailService) {
      throw new AppError("Email service is not configured", 503);
    }
    this.emailService.assertConfigured();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    const newEmail = parsed.newEmail.toLowerCase();

    if (newEmail === user.email) {
      throw new AppError("That is already your current email address", 400);
    }

    const taken = await this.prisma.user.findUnique({
      where: { email: newEmail },
    });

    if (taken) {
      throw new AppError("Email is already in use", 409);
    }

    const passwordMatches = await this.passwordService.compare(
      parsed.currentPassword,
      user.passwordHash
    );

    if (!passwordMatches) {
      throw new AppError("Current password is incorrect", 400);
    }

    await this.prisma.emailChangeCode.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = await this.passwordService.hash(code);

    const changeCode = await this.prisma.emailChangeCode.create({
      data: {
        userId,
        newEmail,
        codeHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    try {
      await this.emailService.sendChangeEmailCode(newEmail, code, {
        newEmail,
        currentEmail: user.email,
      });
    } catch (error) {
      // Never leave a usable code behind when the mail never left the server.
      await this.prisma.emailChangeCode.update({
        where: { id: changeCode.id },
        data: { usedAt: new Date() },
      });
      throw error;
    }

    return { message: "A verification code was sent to your new email address." };
  }

  /**
   * Step 2. Matching the pending row on newEmail as well as userId stops a code
   * issued for one address from confirming a different one.
   */
  async verifyEmailChange(userId, data) {
    const parsed = parseSchema(verifyEmailChangeSchema, data);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    const newEmail = parsed.newEmail.toLowerCase();

    const changeCode = await this.prisma.emailChangeCode.findFirst({
      where: {
        userId,
        newEmail,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!changeCode) {
      throw new AppError("Invalid or expired verification code", 400);
    }

    const codeMatches = await this.passwordService.compare(
      parsed.code,
      changeCode.codeHash
    );

    if (!codeMatches) {
      throw new AppError("Invalid or expired verification code", 400);
    }

    // Re-check at commit time: the address could have been claimed by another
    // account between the request and the code arriving.
    const taken = await this.prisma.user.findUnique({
      where: { email: newEmail },
    });

    if (taken && taken.id !== userId) {
      throw new AppError("Email is already in use", 409);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.user.update({
        where: { id: userId },
        data: { email: newEmail },
      });

      await tx.emailChangeCode.update({
        where: { id: changeCode.id },
        data: { usedAt: new Date() },
      });

      return next;
    });

    // The old address no longer receives reset codes, so outstanding ones are
    // dead the moment the address moves.
    await this.prisma.passwordResetCode.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const { passwordHash, ...safeUser } = updated;

    return safeUser;
  }

  async setAvatar({ userId, filename }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    const url = this.fileService.buildUrl(filename);

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
    });

    if (user.avatarUrl && user.avatarUrl !== url) {
      await this.fileService.deleteByUrl(user.avatarUrl);
    }

    return url;
  }
}

module.exports = UserService;