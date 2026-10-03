const { assertConversationMember } = require("../services/user/community/communityAccess.js");

// Socket-level chat events (typing, read). Message delivery itself happens
// via REST + realtimeService emits, so clients get one canonical flow.
function registerChatSocket(socket, { prisma, realtimeService }) {
  const emitToOthers = async (conversationId, event, payload) => {
    await assertConversationMember(prisma, conversationId, socket.userId);

    const members = await prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });

    members
      .filter((member) => member.userId !== socket.userId)
      .forEach((member) => {
        realtimeService.emitToUser(member.userId, event, {
          conversationId,
          ...payload,
        });
      });
  };

  socket.on("chat:typing", async ({ conversationId, isTyping }, ack) => {
    try {
      await emitToOthers(conversationId, "chat:typing", {
        userId: socket.userId,
        isTyping: Boolean(isTyping),
      });
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      if (typeof ack === "function") ack({ ok: false, message: error.message });
    }
  });

  socket.on("chat:read", async ({ conversationId }, ack) => {
    try {
      const member = await assertConversationMember(
        prisma,
        conversationId,
        socket.userId
      );

      await prisma.conversationMember.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId: socket.userId,
          },
        },
        data: { lastReadAt: new Date() },
      });

      const members = await prisma.conversationMember.findMany({
        where: { conversationId },
        select: { userId: true },
      });

      members
        .filter((memberId) => memberId.userId !== socket.userId)
        .forEach((other) => {
          realtimeService.emitToUser(other.userId, "chat:read", {
            conversationId,
            userId: socket.userId,
          });
        });

      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      if (typeof ack === "function") ack({ ok: false, message: error.message });
    }
  });
}

module.exports = { registerChatSocket };