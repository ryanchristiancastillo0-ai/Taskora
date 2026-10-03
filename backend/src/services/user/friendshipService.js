const AppError = require("../../utils/AppError.js");
const { parseSchema } = require("../../utils/validate.js");
const { getPagination, buildMeta } = require("../../utils/pagination.js");
const { friendRequestSchema, respondSchema } = require("../../validators/user/friendRequestValidators.js");
const { assertFriendship } = require("./community/communityAccess.js");

const USER_PROFILE = {
  select: {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    avatarUrl: true,
    bio: true,
  },
};

function pairIds(a, b) {
  return [a, b].sort();
}

class FriendshipService {
  constructor(prisma, notificationService = null) {
    this.prisma = prisma;
    this.notificationService = notificationService;
  }

  async listFriends(userId, query = {}) {
    const { page, limit, skip, take } = getPagination(query);
    const where = { OR: [{ userAId: userId }, { userBId: userId }] };

    const [friendships, total] = await Promise.all([
      this.prisma.friendship.findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          userA: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatarUrl: true,
              bio: true,
            },
          },
          userB: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatarUrl: true,
              bio: true,
            },
          },
        },
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.friendship.count({ where }),
    ]);

    const items = friendships.map((friendship) => {
      const other =
        friendship.userA.id === userId ? friendship.userB : friendship.userA;
      return {
        friendshipId: friendship.id,
        user: other,
        createdAt: friendship.createdAt,
      };
    });

    return { items, pagination: buildMeta(page, limit, total), total };
  }

  async searchUsers(userId, query = {}) {
    const { page, limit, skip, take } = getPagination(query);
    const term = String(query.q || "").trim();

    if (!term) {
      return { items: [], pagination: buildMeta(page, limit, 0) };
    }

    const where = {
      OR: [
        { firstName: { contains: term } },
        { lastName: { contains: term } },
        { email: { contains: term } },
      ],
      NOT: { id: userId },
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: USER_PROFILE.select, skip, take }),
      this.prisma.user.count({ where }),
    ]);

    const [friends, sentRequests, receivedRequests] = await Promise.all([
      this.prisma.friendship.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        select: { userAId: true, userBId: true },
      }),
      this.prisma.friendRequest.findMany({
        where: { senderId: userId, status: "PENDING" },
        select: { receiverId: true },
      }),
      this.prisma.friendRequest.findMany({
        where: { receiverId: userId, status: "PENDING" },
        select: { senderId: true },
      }),
    ]);

    const friendIds = new Set(
      friends.flatMap((friendship) =>
        friendship.userAId === userId
          ? [friendship.userBId]
          : [friendship.userAId]
      )
    );
    const sentIds = new Set(sentRequests.map((request) => request.receiverId));
    const receivedIds = new Set(receivedRequests.map((request) => request.senderId));

    const items = users.map((user) => {
      let relationship = "NONE";
      if (friendIds.has(user.id)) relationship = "FRIEND";
      else if (sentIds.has(user.id)) relationship = "REQUEST_SENT";
      else if (receivedIds.has(user.id)) relationship = "REQUEST_RECEIVED";
      return { ...user, relationship };
    });

    return { items, pagination: buildMeta(page, limit, total) };
  }

  async listRequests(userId, query = {}) {
    const { page, limit, skip, take } = getPagination(query);
    const direction = query.direction === "sent" ? "sent" : "received";
    const status = query.status || "PENDING";

    const where =
      direction === "sent"
        ? { senderId: userId, status }
        : { receiverId: userId, status };

    const include =
      direction === "sent"
        ? { receiver: { select: USER_PROFILE.select } }
        : { sender: { select: USER_PROFILE.select } };

    const [items, total] = await Promise.all([
      this.prisma.friendRequest.findMany({
        where,
        include,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.friendRequest.count({ where }),
    ]);

    return { items, pagination: buildMeta(page, limit, total) };
  }

  async send(userId, receiverId) {
    const { receiverId: targetId } = parseSchema(friendRequestSchema, {
      receiverId,
    });

    if (userId === targetId) {
      throw new AppError("You cannot add yourself", 400);
    }

    const [lowId, highId] = pairIds(userId, targetId);
    const [existingFriendship, existingRequest] = await Promise.all([
      this.prisma.friendship.findUnique({
        where: { userAId_userBId: { userAId: lowId, userBId: highId } },
        select: { id: true },
      }),
      this.prisma.friendRequest.findFirst({
        where: {
          senderId: { in: [userId, targetId] },
          receiverId: { in: [userId, targetId] },
          status: "PENDING",
        },
        select: { id: true, senderId: true },
      }),
    ]);

    if (existingFriendship) {
      throw new AppError("You are already friends", 409);
    }
    if (existingRequest) {
      throw new AppError(
        existingRequest.senderId === userId
          ? "Friend request already sent"
          : "This user already sent you a request — accept it instead",
        409
      );
    }

    const request = await this.prisma.friendRequest.create({
      data: { senderId: userId, receiverId: targetId, status: "PENDING" },
      include: { receiver: { select: USER_PROFILE.select } },
    });

    if (this.notificationService) {
      const sender = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      const senderName = sender
        ? `${sender.firstName} ${sender.lastName ?? ""}`.trim()
        : "Someone";

      await this.notificationService.create(targetId, {
        title: "Friend request",
        message: `${senderName} sent you a friend request`,
        type: "FRIEND_REQUEST",
      });
    }

    return request;
  }

  async respond(userId, requestId, action) {
    const { action: acceptedAction } = parseSchema(respondSchema, {
      action,
    });

    const request = await this.prisma.friendRequest.findFirst({
      where: { id: requestId, receiverId: userId, status: "PENDING" },
    });

    if (!request) {
      throw new AppError("Request not found", 404);
    }

    const accept = acceptedAction === "accept";

    if (accept) {
      const [lowId, highId] = pairIds(request.senderId, userId);

      await this.prisma.$transaction([
        this.prisma.friendship.create({
          data: { userAId: lowId, userBId: highId },
        }),
        this.prisma.friendRequest.update({
          where: { id: requestId },
          data: { status: "ACCEPTED", respondedAt: new Date() },
        }),
      ]);

      if (this.notificationService) {
        const receiver = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, lastName: true },
        });
        const receiverName = receiver
          ? `${receiver.firstName} ${receiver.lastName ?? ""}`.trim()
          : "Someone";

        await this.notificationService.create(request.senderId, {
          title: "Friend request accepted",
          message: `${receiverName} accepted your friend request`,
          type: "FRIEND_REQUEST",
        });
      }

      return { id: requestId, status: "ACCEPTED" };
    }

    await this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: "DECLINED", respondedAt: new Date() },
    });

    return { id: requestId, status: "DECLINED" };
  }

  async cancel(userId, requestId) {
    const request = await this.prisma.friendRequest.findFirst({
      where: {
        id: requestId,
        senderId: userId,
        status: "PENDING",
      },
    });

    if (!request) {
      throw new AppError("Request not found", 404);
    }

    await this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: "CANCELLED", respondedAt: new Date() },
    });

    return { id: requestId, status: "CANCELLED" };
  }

  async removeFriend(userId, friendUserId) {
    await assertFriendship(this.prisma, userId, friendUserId);

    const [lowId, highId] = pairIds(userId, friendUserId);

    await this.prisma.friendship.delete({
      where: { userAId_userBId: { userAId: lowId, userBId: highId } },
    });

    return { removed: true };
  }
}

module.exports = FriendshipService;