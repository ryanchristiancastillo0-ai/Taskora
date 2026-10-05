const AppError = require("../../utils/AppError.js");
const {
  parseSchema,
  definedOnly,
  stringId,
} = require("../../utils/validate.js");
const { getPagination, buildMeta } = require("../../utils/pagination.js");
const {
  createConversationSchema,
  updateGroupSchema,
  addMemberSchema,
} = require("../../validators/community/conversationValidators.js");
const {
  assertUsersExist,
  assertCanStartDirect,
  assertConversationMember,
  assertConversationAdmin,
  isGroup,
} = require("./communityAccess.js");

const MEMBER_USER = {
  select: {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    avatarUrl: true,
  },
};

const DIRECT = "DIRECT";
const GROUP = "GROUP";

function pairIds(a, b) {
  return [a, b].sort();
}

class ConversationService {
  constructor(prisma, realtimeService = null, fileService = null) {
    this.prisma = prisma;
    this.realtimeService = realtimeService;
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

  async unreadTotal(userId) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true, lastReadAt: true },
    });

    if (memberships.length === 0) {
      return 0;
    }

    const messageCount = await this.prisma.$transaction(
      memberships.map((membership) =>
        this.prisma.message.count({
          where: {
            conversationId: membership.conversationId,
            createdAt: {
              gt: membership.lastReadAt ?? new Date(0),
            },
            senderId: { not: userId },
          },
        })
      )
    );

    return messageCount.reduce((sum, count) => sum + count, 0);
  }

  async list(userId, query = {}) {
    const { page, limit, skip, take } = getPagination(query);

    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      skip,
      take,
      orderBy: { conversation: { lastMessageAt: "desc" } },
      select: {
        lastReadAt: true,
        role: true,
        conversation: {
          select: {
            id: true,
            type: true,
            name: true,
            iconUrl: true,
            createdAt: true,
            updatedAt: true,
            lastMessageAt: true,
            members: {
              select: {
                userId: true,
                role: true,
                user: { select: MEMBER_USER.select },
              },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                type: true,
                content: true,
                attachmentUrl: true,
                fileName: true,
                senderId: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    const countQuery = { where: { userId } };
    const total = await this.prisma.conversationMember.count(countQuery);

    const items = await Promise.all(
      memberships.map(async (membership) => {
        const conversation = membership.conversation;
        const readAt = membership.lastReadAt ?? new Date(0);

        const unread = await this.prisma.message.count({
          where: {
            conversationId: conversation.id,
            createdAt: { gt: readAt },
            senderId: { not: userId },
          },
        });

        return {
          id: conversation.id,
          type: conversation.type,
          name: conversation.name,
          iconUrl: conversation.iconUrl,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          lastMessageAt: conversation.lastMessageAt,
          lastMessage: conversation.messages[0] ?? null,
          role: membership.role,
          unread,
          members: conversation.members.map((member) => ({
            ...member.user,
            role: member.role,
          })),
        };
      })
    );

    return { items, pagination: buildMeta(page, limit, total), unreadTotal: (await this.unreadTotal(userId)) };
  }

  async get(userId, conversationId) {
    await assertConversationMember(this.prisma, conversationId, userId);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        type: true,
        name: true,
        iconUrl: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
        lastMessageAt: true,
        members: {
          select: {
            userId: true,
            role: true,
            lastReadAt: true,
            user: { select: MEMBER_USER.select },
          },
        },
      },
    });

    const lastRead = conversation.members.find(
      (member) => member.userId === userId
    )?.lastReadAt;

    const unread = await this.prisma.message.count({
      where: {
        conversationId,
        createdAt: { gt: lastRead ?? new Date(0) },
        senderId: { not: userId },
      },
    });

    return {
      ...conversation,
      unread,
      members: conversation.members.map((member) => ({
        ...member.user,
        role: member.role,
      })),
    };
  }

  async getOrCreateDirect(userId, otherUserId) {
    if (!stringId.safeParse(otherUserId).success) {
      throw new AppError("Invalid user id", 400);
    }

    const targetId = otherUserId;

    await assertCanStartDirect(this.prisma, userId, targetId);

    const existing = await this.findDirectWith([
      userId,
      targetId,
    ]);

    if (existing) {
      return existing;
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        type: DIRECT,
        members: {
          create: [
            { userId: userId, role: "MEMBER" },
            { userId: targetId, role: "MEMBER" },
          ],
        },
      },
    });

    const withMembers = await this.decorate(this.prisma, conversation.id);

    this.emitToUsers([userId, targetId], "chat:conversation", withMembers);

    return withMembers;
  }

  async startGroup(userId, data, file = null) {
    const parsed = parseSchema(
      createConversationSchema,
      data
    );
    if (parsed.type !== GROUP) {
      throw new AppError("Invalid conversation type", 400);
    }

    const name = parsed.name || null;
    const requested = Array.from(
      new Set([userId, ...(parsed.memberIds ?? [])])
    );

    if (requested.length < 2) {
      throw new AppError("A group needs at least one more member", 400);
    }

    // Anyone with an account can join a group, so friendship is not required
    // here. We only confirm the picked users still exist, which also keeps a
    // stale id from surfacing as a raw foreign-key error.
    const memberIds = await assertUsersExist(this.prisma, requested);

    // An uploaded icon wins over any iconUrl sent as a text field, so a client
    // that posts multipart can set the logo in the same request that creates
    // the group.
    const iconUrl =
      file && this.fileService
        ? this.fileService.buildUrl(file.filename)
        : parsed.iconUrl ?? null;

    const conversation = await this.prisma.conversation.create({
      data: {
        type: GROUP,
        name,
        iconUrl,
        createdById: userId,
        members: {
          create: memberIds.map((memberId) => ({
            userId: memberId,
            role: memberId === userId ? "ADMIN" : "MEMBER",
          })),
        },
      },
    });

    const withMembers = await this.decorate(this.prisma, conversation.id);

    this.emitToUsers(memberIds, "chat:conversation", withMembers);

    return withMembers;
  }

  async updateGroup(userId, conversationId, data, file = null) {
    const member = await assertConversationAdmin(this.prisma, conversationId, userId);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!isGroup(conversation)) {
      throw new AppError("Group conversation required", 400);
    }

    let parsed = parseSchema(updateGroupSchema, data);

    if (file && this.fileService) {
      parsed = { ...parsed, iconUrl: this.fileService.buildUrl(file.filename) };
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: definedOnly(parsed),
    });

    const updated = await this.decorate(this.prisma, conversationId);
    const memberIds = updated.members.map((m) => m.id);

    this.emitToUsers(memberIds, "chat:conversation", updated);

    return updated;
  }

  async addMember(userId, conversationId, newUserId) {
    const { userId: targetId } = parseSchema(addMemberSchema, {
      userId: newUserId,
    });

    await assertConversationAdmin(this.prisma, conversationId, userId);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!isGroup(conversation)) {
      throw new AppError("Group conversation required", 400);
    }

    if (targetId === userId) {
      throw new AppError("You are already in this group", 409);
    }

    // Admins can pull any registered user into a group, friend or not, so this
    // only verifies the account exists.
    await assertUsersExist(this.prisma, [targetId]);

    const existing = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: targetId },
      },
    });
    if (existing) {
      throw new AppError("User is already in this group", 409);
    }

    await this.prisma.conversationMember.create({
      data: { conversationId, userId: targetId, role: "MEMBER" },
    });

    const updated = await this.decorate(this.prisma, conversationId);
    const memberIds = updated.members.map((m) => m.id);

    this.emitToUsers(memberIds, "chat:conversation", updated);

    return updated;
  }

  async removeMember(userId, conversationId, memberUserId) {
    const isSelf = memberUserId === userId;

    if (isSelf) {
      await assertConversationMember(this.prisma, conversationId, userId);
    } else {
      await assertConversationAdmin(this.prisma, conversationId, userId);
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!isGroup(conversation)) {
      throw new AppError("Group conversation required", 400);
    }

    await this.prisma.conversationMember.delete({
      where: {
        conversationId_userId: { conversationId, userId: memberUserId },
      },
    });

    const remaining = await this.prisma.conversationMember.count({
      where: { conversationId },
    });
    if (remaining === 0) {
      await this.prisma.conversation.delete({ where: { id: conversationId } });
    }

    const updated = await this.decorate(this.prisma, conversationId).catch(
      () => null
    );
    if (updated) {
      const memberIds = updated.members.map((m) => m.id);
      this.emitToUsers(memberIds, "chat:conversation", updated);
    }

    return { id: conversationId, removedUserId: memberUserId };
  }

  async markRead(userId, conversationId) {
    await assertConversationMember(this.prisma, conversationId, userId);

    await this.prisma.conversationMember.update({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      data: { lastReadAt: new Date() },
    });

    return { conversationId, readAt: new Date().toISOString() };
  }

  async findDirectWith([userAId, userBId]) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: {
        userId: userAId,
        conversation: { type: DIRECT },
      },
      select: { conversationId: true },
    });

    const ids = memberships.map((membership) => membership.conversationId);
    if (ids.length === 0) {
      return null;
    }

    const other = await this.prisma.conversationMember.findFirst({
      where: {
        conversationId: { in: ids },
        userId: userBId,
      },
      select: { conversationId: true },
    });

    if (!other) {
      return null;
    }

    return this.decorate(this.prisma, other.conversationId);
  }

  async decorate(prisma, conversationId) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        type: true,
        name: true,
        iconUrl: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
        lastMessageAt: true,
        members: {
          select: {
            userId: true,
            role: true,
            user: { select: MEMBER_USER.select },
          },
        },
      },
    });

    return {
      ...conversation,
      members: conversation.members.map((member) => ({
        ...member.user,
        role: member.role,
      })),
    };
  }
}

module.exports = ConversationService;