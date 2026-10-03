const AppError = require("../../utils/AppError.js");
const { parseSchema } = require("../../utils/validate.js");
const { getPagination, buildMeta } = require("../../utils/pagination.js");
const {
  sendMessageSchema,
  setReactionSchema,
  MAX_ATTACHMENTS_PER_MESSAGE,
} = require("../../validators/user/messageValidators.js");
const { assertConversationMember } = require("./community/communityAccess.js");

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const REACTION_SELECT = {
  orderBy: { createdAt: "asc" },
  select: {
    id: true,
    userId: true,
    emoji: true,
    // The reactor's identity travels with the reaction so a client can answer
    // "who reacted?" on hover without a second lookup. The frontend cannot be
    // trusted to resolve this itself: its directory is the friends list, which
    // does not necessarily contain every member of a group conversation.
    user: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
      },
    },
  },
};

// Shared projection so the socket payload, the POST response and the history
// query always return the same shape for a message.
const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  type: true,
  content: true,
  attachmentUrl: true,
  fileName: true,
  fileType: true,
  fileSize: true,
  senderId: true,
  createdAt: true,
  sender: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
    },
  },
  attachments: {
    orderBy: { position: "asc" },
    select: {
      id: true,
      url: true,
      fileName: true,
      fileType: true,
      fileSize: true,
      kind: true,
      position: true,
    },
  },
  reactions: REACTION_SELECT,
};

class MessageService {
  constructor(prisma, realtimeService = null, notificationService = null, fileService = null) {
    this.prisma = prisma;
    this.realtimeService = realtimeService;
    this.notificationService = notificationService;
    this.fileService = fileService;
  }

  emitToUsers(userIds, event, payload) {
    if (!this.realtimeService) {
      return;
    }
    const unique = new Set(userIds);
    unique.forEach((userId) => {
      this.realtimeService.emitToUser(userId, event, payload);
    });
  }

  async list(userId, conversationId, query = {}) {
    await assertConversationMember(this.prisma, conversationId, userId);

    const { page, limit, skip, take } = getPagination(query, 30);

    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        skip,
        take,
        select: MESSAGE_SELECT,
      }),
      this.prisma.message.count({ where: { conversationId } }),
    ]);

    return { items, pagination: buildMeta(page, limit, total) };
  }

  // Multer hands back an array for `.array()` uploads, but stay tolerant of a
  // single object so a one-file message never depends on the count.
  _normalizeFiles(files) {
    if (!files) return [];
    return Array.isArray(files) ? files.filter(Boolean) : [files];
  }

  async send(userId, conversationId, body = {}, files = null) {
    await assertConversationMember(this.prisma, conversationId, userId);

    const parsed = parseSchema(sendMessageSchema, body ?? {});
    const incoming = this._normalizeFiles(files);

    if (incoming.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      throw new AppError(
        `You can attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} files per message`,
        400
      );
    }

    const content = parsed.content ?? null;

    if (!content && incoming.length === 0) {
      throw new AppError("Message content is required", 400);
    }

    const attachments = incoming.map((file) => ({
      url: this.fileService.buildUrl(file.filename),
      fileName: (file.originalname || "file").slice(0, 255),
      fileType: file.mimetype,
      fileSize: file.size,
      kind: IMAGE_MIME_TYPES.has(file.mimetype) ? "IMAGE" : "FILE",
    }));

    // TEXT with no files, IMAGE when every file is an image, otherwise FILE
    // (a mixed batch still has at least one non-image to open).
    let type = "TEXT";
    if (attachments.length > 0) {
      type = attachments.every((item) => item.kind === "IMAGE") ? "IMAGE" : "FILE";
    }

    // The legacy scalar columns mirror the first attachment so anything still
    // reading the old shape keeps working alongside the new rows.
    const [primary] = attachments;

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          type,
          content,
          attachmentUrl: primary?.url ?? null,
          fileName: primary?.fileName ?? null,
          fileType: primary?.fileType ?? null,
          fileSize: primary?.fileSize ?? null,
          attachments: {
            create: attachments.map((item, index) => ({ ...item, position: index })),
          },
        },
        select: MESSAGE_SELECT,
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    this.emitToUsers(
      await this._memberIds(userId, conversationId),
      "chat:message",
      message
    );

    if (this.notificationService) {
      await this._notifyOthers(userId, conversationId, message);
    }

    return message;
  }

  // One reaction per user per message. Re-sending the same emoji clears it,
  // sending a different one replaces it. That keeps counts honest (one user
  // can never contribute twice) and makes the picker idempotent.
  async setReaction(userId, conversationId, messageId, body = {}) {
    await assertConversationMember(this.prisma, conversationId, userId);

    const { emoji } = parseSchema(setReactionSchema, body ?? {});

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true },
    });

    if (!message) {
      throw new AppError("Message not found", 404);
    }

    const existing = await this.prisma.messageReaction.findUnique({
      where: { messageId_userId: { messageId, userId } },
      select: { id: true, emoji: true },
    });

    let action = "set";
    if (existing?.emoji === emoji) {
      await this.prisma.messageReaction.delete({ where: { id: existing.id } });
      action = "cleared";
    } else if (existing) {
      await this.prisma.messageReaction.update({
        where: { id: existing.id },
        data: { emoji },
      });
      action = "updated";
    } else {
      await this.prisma.messageReaction.create({
        data: { messageId, userId, emoji },
      });
    }

    // Re-read with the shared projection so the broadcast, the HTTP response
    // and a later history fetch all describe reactions identically.
    const reactions = await this.prisma.messageReaction.findMany({
      where: { messageId },
      ...REACTION_SELECT,
    });

    // Broadcast the whole reaction set rather than a delta: the payload is tiny
    // and a full list cannot drift out of sync on out-of-order delivery.
    this.emitToUsers(
      await this._memberIds(userId, conversationId),
      "chat:reaction",
      { conversationId, messageId, reactions }
    );

    return { messageId, reactions, action };
  }

  async _memberIds(actorId, conversationId) {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return members.map((member) => member.userId).filter((id) => id !== actorId);
  }

  // Describes what was sent in a sentence the recipient can read at a glance,
  // e.g. "Sent you a photo" or "Sent you 2 photos and a file: notes.pdf".
  _describeAttachments(attachments) {
    const list = Array.isArray(attachments) ? attachments : [];
    if (list.length === 0) {
      return null;
    }

    const images = list.filter((item) => item.kind === "IMAGE");
    const others = list.filter((item) => item.kind !== "IMAGE");

    // Built without the "Sent you" lead-in so mixed sends can be joined into a
    // single sentence rather than repeating it.
    const parts = [];
    if (images.length === 1) {
      parts.push("a photo");
    } else if (images.length > 1) {
      parts.push(`${images.length} photos`);
    }

    if (others.length === 1) {
      const file = others[0];
      const mime = file.fileType ?? "";
      if (mime.startsWith("video/")) {
        parts.push("a video");
      } else if (mime.startsWith("audio/")) {
        parts.push("an audio file");
      } else if (file.fileName) {
        parts.push(`a file: ${file.fileName}`);
      } else {
        parts.push("a file");
      }
    } else if (others.length > 1) {
      parts.push(`${others.length} files`);
    }

    return parts.length > 0 ? `Sent you ${parts.join(" and ")}` : null;
  }

  async _notifyOthers(actorId, conversationId, message) {
    const memberIds = await this._memberIds(actorId, conversationId);
    if (memberIds.length === 0) {
      return;
    }

    const caption = (message.content ?? "").trim();
    const described = this._describeAttachments(message.attachments);

    // The attachment description leads so a shared photo reads as "Sent you a
    // photo"; any caption trails it. Notification.message is TEXT, but a
    // notification is a summary rather than the message itself, so it is still
    // deliberately clipped here instead of dumping a wall of text into the bell.
    let body;
    if (described && caption) {
      body = `${described}: ${caption}`;
    } else {
      body = described ?? caption;
    }
    if (!body) {
      body = "Sent you a new message";
    }
    if (body.length > 180) {
      body = `${body.slice(0, 177).trimEnd()}...`;
    }

    const senderName = [message.sender?.firstName, message.sender?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { name: true, type: true },
    });

    const isGroup = conversation?.type === "GROUP";
    const title = isGroup
      ? `${senderName || "Someone"} in ${conversation?.name ?? "a group"}`
      : senderName || "New message";

    for (const memberId of memberIds) {
      await this.notificationService.create(memberId, {
        title,
        message: body,
        type: "NEW_MESSAGE",
        conversationId,
      });
    }
  }
}

module.exports = MessageService;