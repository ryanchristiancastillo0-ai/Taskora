// Chat notification copy + deep-link tests for MessageService.
// Run with: node tests/notificationCopy.test.js
const assert = require("assert");
const MessageService = require("../src/services/user/messageService.js");

const image = (fileName = "pic.png", fileType = "image/png") => ({
  kind: "IMAGE",
  fileName,
  fileType,
});
const file = (fileName = "doc.pdf", fileType = "application/pdf") => ({
  kind: "FILE",
  fileName,
  fileType,
});

// MessageService only reaches for these collaborators when notifying, so the
// notification payload can be asserted directly.
function buildService({ memberIds = ["u-b"], conversation = null } = {}) {
  const created = [];
  const prisma = {
    conversationMember: {
      findMany: async () => memberIds.map((userId) => ({ userId })),
    },
    conversation: {
      findUnique: async () => conversation,
    },
  };
  const notificationService = {
    create: async (userId, payload) => {
      created.push({ userId, ...payload });
      return payload;
    },
  };
  return {
    created,
    service: new MessageService(prisma, null, notificationService, null),
  };
}

async function notify(attachments, { content = null, conversation = null, memberIds } = {}) {
  const { service, created } = buildService({ conversation, memberIds });
  await service._notifyOthers("u-a", "c-1", {
    content,
    type: attachments?.length ? "FILE" : "TEXT",
    sender: { firstName: "User", lastName: "One" },
    attachments,
  });
  return created;
}

async function run() {
  // ---------- wording ----------
  {
    const [n] = await notify([image()]);
    assert.strictEqual(n.message, "Sent you a photo");
    assert.strictEqual(n.title, "User One");
  }

  {
    const [n] = await notify([image(), image("b.png"), image("c.png")]);
    assert.strictEqual(n.message, "Sent you 3 photos");
  }

  {
    const [n] = await notify([file("report.pdf")]);
    assert.strictEqual(n.message, "Sent you a file: report.pdf");
  }

  {
    const [n] = await notify([file("clip.mp4", "video/mp4")]);
    assert.strictEqual(n.message, "Sent you a video");
  }

  {
    const [n] = await notify([file("note.m4a", "audio/mp4")]);
    assert.strictEqual(n.message, "Sent you an audio file");
  }

  {
    const [n] = await notify([file("a.pdf"), file("b.pdf")]);
    assert.strictEqual(n.message, "Sent you 2 files");
  }

  {
    const [n] = await notify([image(), image("b.png"), file("a.pdf")]);
    assert.strictEqual(n.message, "Sent you 2 photos and a file: a.pdf");
  }

  {
    const [n] = await notify([image()], { content: "nice shot" });
    assert.strictEqual(n.message, "Sent you a photo: nice shot");
  }

  {
    const [n] = await notify([], { content: "just saying hi" });
    assert.strictEqual(n.message, "just saying hi");
  }

  {
    const [n] = await notify([], { content: "   " });
    assert.strictEqual(n.message, "Sent you a new message");
  }

  {
    const [n] = await notify(null, { content: "no attachment array" });
    assert.strictEqual(n.message, "no attachment array");
  }

  // Notification.message is VARCHAR(191), so long content must be clipped here
  // rather than overflowing the column.
  {
    const [n] = await notify([image()], { content: "x".repeat(500) });
    assert.ok(n.message.length <= 180, `too long: ${n.message.length}`);
    assert.ok(n.message.startsWith("Sent you a photo: "));
    assert.ok(n.message.endsWith("..."));
  }

  {
    const [n] = await notify([], { content: "y".repeat(500) });
    assert.ok(n.message.length <= 180);
  }

  // ---------- group wording ----------
  {
    const [n] = await notify([image()], {
      conversation: { name: "Study Group", type: "GROUP" },
    });
    assert.strictEqual(n.title, "User One in Study Group");
    assert.strictEqual(n.message, "Sent you a photo");
  }

  // ---------- deep link ----------
  {
    const [n] = await notify([image()]);
    assert.strictEqual(n.conversationId, "c-1");
    assert.strictEqual(n.type, "NEW_MESSAGE");
  }

  {
    const created = await notify([image()], { memberIds: ["u-b", "u-c"] });
    assert.strictEqual(created.length, 2);
    created.forEach((n) => assert.strictEqual(n.conversationId, "c-1"));
  }

  // ---------- no notification when nobody else is in the room ----------
  {
    const created = await notify([], { content: "hi", memberIds: [] });
    assert.strictEqual(created.length, 0);
  }

  console.log("notification copy: OK");
  console.log("All notification copy tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
