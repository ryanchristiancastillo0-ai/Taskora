const AppError = require("../../../utils/AppError.js");

// Shared, reusable guards used across the community services so permission
// rules live in one place (single responsibility).

async function assertFriendship(prisma, userAId, userBId) {
  if (userAId === userBId) {
    throw new AppError("You cannot be friends with yourself", 400);
  }

  const [lowId, highId] = [userAId, userBId].sort();

  const friendship = await prisma.friendship.findUnique({
    where: { userAId_userBId: { userAId: lowId, userBId: highId } },
    select: { id: true },
  });

  if (!friendship) {
    throw new AppError("You can only chat with your friends", 403);
  }

  return friendship;
}

// Group membership is open to any registered user, not only friends, so the
// guard here is existence rather than friendship. Batched so adding a member
// list costs one query regardless of how many people were picked.
async function assertUsersExist(prisma, userIds) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));

  if (ids.length === 0) {
    return [];
  }

  const found = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });

  if (found.length !== ids.length) {
    throw new AppError("One or more selected users no longer exist", 400);
  }

  return found.map((user) => user.id);
}

async function assertCanStartDirect(prisma, userAId, userBId) {
  if (userAId === userBId) {
    throw new AppError("You cannot message yourself", 400);
  }

  const target = await prisma.user.findUnique({
    where: { id: userBId },
    select: { id: true },
  });

  if (!target) {
    throw new AppError("User not found", 404);
  }

  return target;
}

async function assertConversationMember(prisma, conversationId, userId) {
  const member = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: { conversationId, userId },
    },
    select: { id: true, role: true, conversationId: true },
  });

  if (!member) {
    throw new AppError("Conversation not found", 404);
  }

  return member;
}

async function assertConversationAdmin(prisma, conversationId, userId) {
  const member = await assertConversationMember(prisma, conversationId, userId);

  if (member.role !== "ADMIN") {
    throw new AppError("Only group admins can do this", 403);
  }

  return member;
}

function isGroup(conversation) {
  return conversation.type === "GROUP";
}

module.exports = {
  assertFriendship,
  assertUsersExist,
  assertCanStartDirect,
  assertConversationMember,
  assertConversationAdmin,
  isGroup,
};