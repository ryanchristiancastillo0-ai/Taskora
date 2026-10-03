// Lightweight mock-prisma sanity tests for the community services.
// Run with: node tests/communityService.test.js
const assert = require("assert");
const AppError = require("../src/utils/AppError");
const FriendshipService = require("../src/services/user/friendshipService.js");
const ConversationService = require("../src/services/user/conversationService.js");
const MessageService = require("../src/services/user/messageService.js");

function createMockPrisma(overrides = {}) {
  const state = {
    friendRequests: [],
    friendships: [],
    conversations: [],
    members: [],
    messages: [],
    users: [],
    idSeq: 1,
  };

  const prisma = {
    $transaction: async (queries) => {
      const results = [];
      for (const q of queries) results.push(await q);
      return results;
    },
    friendRequest: {
      create: async ({ data, include }) => {
        const id = String(state.idSeq++);
        state.friendRequests.push({ id, ...data });
        const rec = { id, ...data };
        return include
          ? {
              ...rec,
              [include === { __proto__: null } ? "" : Object.keys(include)[0] || "receiver"]:
                "receiver",
            }
          : rec;
      },
      findFirst: async ({ where }) =>
        state.friendRequests.find((r) =>
          Object.entries(where).every(
            ([key, value]) => r[key] === value || (typeof value === "object" && value.in && value.in.includes(r[key]))
          )
        ) || null,
      findMany: async ({ where, select }) => {
        const matches = (row) =>
          Object.entries(where ?? {}).every(([key, value]) => {
            if (value && typeof value === "object" && Array.isArray(value.in)) {
              return value.in.includes(row[key]);
            }
            if (value && typeof value === "object" && value.in === undefined) {
              return false;
            }
            return row[key] === value;
          });

        return state.friendRequests
          .filter(matches)
          .map((r) =>
            select
              ? Object.fromEntries(
                  Object.keys(select).map((key) => [key, r[key]])
                )
              : { ...r }
          );
      },
      count: async ({ where }) => {
        const cond = where ? Object.entries(where) : [];
        return state.friendRequests.filter((r) =>
          cond.every(([key, value]) => r[key] === value)
        ).length;
      },
      update: async ({ where, data }) => {
        const idx = state.friendRequests.findIndex((r) => r.id === where.id);
        state.friendRequests[idx] = { ...state.friendRequests[idx], ...data };
        return state.friendRequests[idx];
      },
    },
    friendship: {
      findUnique: async ({ where }) =>
        state.friendships.find(
          (f) =>
            f.userAId === where.userAId_userBId.userAId &&
            f.userBId === where.userAId_userBId.userBId
        ) || null,
      findMany: async ({ where }) =>
        state.friendships
          .filter((f) => {
            if (!where) return true;
            if (where.OR) {
              return where.OR.some(
                (branch) =>
                  f.userAId === branch.userAId || f.userBId === branch.userBId
              );
            }
            return true;
          })
          .map((f) => ({
            ...f,
            userA: state.users.find((u) => u.id === f.userAId),
            userB: state.users.find((u) => u.id === f.userBId),
          })),
      count: async ({ where }) =>
        state.friendships.filter((f) => {
          if (!where) return true;
          if (where.OR) {
            return where.OR.some(
              (branch) =>
                f.userAId === branch.userAId || f.userBId === branch.userBId
            );
          }
          return true;
        }).length,
      create: async ({ data }) => {
        state.friendships.push({ ...data, createdAt: new Date() });
        return { ...data };
      },
      delete: async ({ where }) => {
        state.friendships = state.friendships.filter(
          (f) =>
            !(
              f.userAId === where.userAId_userBId.userAId &&
              f.userBId === where.userAId_userBId.userBId
            )
        );
        return { deleted: true };
      },
    },
    user: {
      findMany: async ({ where }) => {
        let rows = state.users;
        if (where) {
          if (where.id && Array.isArray(where.id.in)) {
            const wanted = new Set(where.id.in);
            rows = rows.filter((u) => wanted.has(u.id));
          }
          if (where.NOT && where.NOT.id) {
            rows = rows.filter((u) => u.id !== where.NOT.id);
          }
        }
        return rows;
      },
      findUnique: async ({ where }) =>
        state.users.find((u) => u.id === where.id) || null,
      count: async () => state.users.length,
    },
    conversation: {
      findUnique: async ({ where }) => {
        const c = state.conversations.find((x) => x.id === where.id);
        if (!c) return null;
        return {
          ...c,
          members: state.members
            .filter((m) => m.conversationId === c.id)
            .map((m) => ({
              userId: m.userId,
              role: m.role,
              lastReadAt: m.lastReadAt ?? null,
              user: state.users.find((u) => u.id === m.userId),
            })),
        };
      },
      create: async ({ data }) => {
        const id = String(state.idSeq++);
        const { members, ...rest } = data;
        state.conversations.push({
          id,
          ...rest,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: null,
        });
        if (members && Array.isArray(members.create)) {
          for (const member of members.create) {
            state.members.push({
              conversationId: id,
              userId: member.userId,
              role: member.role ?? "MEMBER",
              lastReadAt: null,
            });
          }
        }
        return {
          id,
          type: rest.type,
          name: rest.name ?? null,
          iconUrl: rest.iconUrl ?? null,
          createdById: rest.createdById ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: null,
        };
      },
      update: async ({ where, data }) => {
        const c = state.conversations.find((x) => x.id === where.id);
        if (c) Object.assign(c, data);
        return c;
      },
      delete: async ({ where }) => {
        state.conversations = state.conversations.filter((c) => c.id !== where.id);
        return { deleted: true };
      },
    },
    conversationMember: {
      findMany: async ({ where, orderBy }) => {
        let list = state.members.filter((m) => {
          if (!where) return true;
          return Object.entries(where).every(([key, value]) => {
            if (value && Array.isArray(value.in)) {
              return value.in.includes(m[key]);
            }
            if (value && typeof value === "object" && value.type) {
              const conversation = state.conversations.find(
                (c) => c.id === m.conversationId
              );
              return conversation && conversation.type === value.type;
            }
            return m[key] === value;
          });
        });
        if (orderBy) {
          const sortKey = Object.keys(orderBy)[0];
          const dir = orderBy[sortKey] === "desc" ? -1 : 1;
          list = list.slice().sort((a, b) => {
            const av = a[sortKey]?.conversation?.lastMessageAt;
            const bv = b[sortKey]?.conversation?.lastMessageAt;
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            return (av > bv ? 1 : av < bv ? -1 : 0) * dir;
          });
        }
        return list.map((m) => ({
          ...m,
          conversation: {
            ...state.conversations.find((c) => c.id === m.conversationId),
            messages: [],
            members: state.members
              .filter((mm) => mm.conversationId === m.conversationId)
              .map((mm) => ({
                userId: mm.userId,
                role: mm.role,
                lastReadAt: mm.lastReadAt ?? null,
                user: state.users.find((u) => u.id === mm.userId),
              })),
          },
        }));
      },
      findUnique: async ({ where }) =>
        state.members.find(
          (m) =>
            m.conversationId === where.conversationId_userId.conversationId &&
            m.userId === where.conversationId_userId.userId
        ) || null,
      findFirst: async ({ where }) =>
        state.members.find((m) =>
          Object.entries(where ?? {}).every(([key, value]) => {
            if (value && Array.isArray(value.in)) return value.in.includes(m[key]);
            return m[key] === value;
          })
        ) || null,
      create: async ({ data }) => {
        state.members.push({ ...data, role: data.role ?? "MEMBER" });
        return data;
      },
      update: async ({ where, data }) => {
        const m = state.members.find(
          (x) =>
            x.conversationId === where.conversationId_userId.conversationId &&
            x.userId === where.conversationId_userId.userId
        );
        if (m) Object.assign(m, data);
        return m;
      },
      delete: async ({ where }) => {
        state.members = state.members.filter(
          (m) =>
            !(
              m.conversationId === where.conversationId_userId.conversationId &&
              m.userId === where.conversationId_userId.userId
            )
        );
        return { deleted: true };
      },
      count: async ({ where }) =>
        state.members.filter((m) => m.conversationId === where.conversationId)
          .length,
    },
    message: {
      create: async ({ data, select }) => {
        const id = String(state.idSeq++);
        const record = {
          id,
          ...data,
          createdAt: new Date(),
          sender: state.users.find((u) => u.id === data.senderId),
        };
        state.messages.push(record);
        return record;
      },
      findMany: async () => state.messages,
      count: async ({ where }) =>
        state.messages.filter(
          (m) =>
            m.conversationId === where.conversationId &&
            (!where.createdAt || m.createdAt > where.createdAt.gt) &&
            (!where.senderId || m.senderId !== where.senderId.not)
        ).length,
    },
    ...overrides,
  };

  return { prisma, state };
}

const USER_A = { id: "u-a", firstName: "Ada", lastName: "Lovelace", email: "ada@x.com", avatarUrl: null, bio: null };
const USER_B = { id: "u-b", firstName: "Bob", lastName: "Builder", email: "bob@x.com", avatarUrl: null, bio: null };
const USER_C = { id: "u-c", firstName: "Cat", lastName: "Woman", email: "cat@x.com", avatarUrl: null, bio: null };
const USER_D = { id: "u-d", firstName: "Dan", lastName: "Dundee", email: "dan@x.com", avatarUrl: null, bio: null };

function addFriends(prisma, state, a, b) {
  const [lo, hi] = [a, b].sort();
  state.friendships.push({ userAId: lo, userBId: hi, createdAt: new Date() });
}

async function run() {
  // ---------- friendship: send + duplicate + respond accept ----------
  {
    const { prisma, state } = createMockPrisma();
    state.users.push(USER_A, USER_B);
    const notificationService = {
      create: async () => { /* noop */ },
    };
    const svc = new FriendshipService(prisma, notificationService);

    const request = await svc.send("u-a", "u-b");
    assert.strictEqual(request.status, "PENDING");

    await assert.rejects(() => svc.send("u-a", "u-b"), (err) => err instanceof AppError && err.statusCode === 409);
    await assert.rejects(() => svc.send("u-a", "u-a"), (err) => err.statusCode === 400);
    await assert.rejects(() => svc.send("u-a", ""), (err) => err.statusCode === 400);

    const accepted = await svc.respond("u-b", request.id, "accept");
    assert.strictEqual(accepted.status, "ACCEPTED");
    assert.strictEqual(state.friendships.length, 1);
    assert.deepStrictEqual(
      [state.friendships[0].userAId, state.friendships[0].userBId].sort(),
      ["u-a", "u-b"]
    );

    // can search users (self excluded) and see relationship statuses
    state.users.push(USER_C, USER_D);
    addFriends(prisma, state, "u-a", "u-c");
    const { items: searchItems } = await svc.searchUsers("u-a", { q: "w" });
    assert.strictEqual(searchItems.find((u) => u.id === "u-a"), undefined);
    const relC = searchItems.find((u) => u.id === "u-c");
    const relD = searchItems.find((u) => u.id === "u-d");
    assert.ok(relC);
    assert.ok(relD);
    assert.strictEqual(relC.relationship, "FRIEND");
    assert.strictEqual(relD.relationship, "NONE");

    const friends = await svc.listFriends("u-a");
    assert.strictEqual(friends.items.length, 2);
    const friendIds = friends.items.map((f) => f.user.id).sort();
    assert.deepStrictEqual(friendIds, ["u-b", "u-c"]);

    const removed = await svc.removeFriend("u-a", "u-c");
    assert.strictEqual(removed.removed, true);
    assert.strictEqual(state.friendships.length, 1);
    await assert.rejects(() => svc.removeFriend("u-a", "u-c"), (err) => err.statusCode === 403);
    console.log("friendship service: OK");
  }

  // ---------- conversation: direct + group + unread + read ----------
  {
    const { prisma, state } = createMockPrisma();
    state.users.push(USER_A, USER_B, USER_C, USER_D);
    addFriends(prisma, state, "u-a", "u-b");
    addFriends(prisma, state, "u-a", "u-c");

    const realtime = {
      emitToUser: async () => { /* noop */ },
    };
    const svc = new ConversationService(prisma, realtime);

    // any registered user can be direct messaged, friends or not
    const directWithNonFriend = await svc.getOrCreateDirect("u-a", "u-d");
    assert.strictEqual(directWithNonFriend.type, "DIRECT");
    assert.strictEqual(directWithNonFriend.members.length, 2);

    // but not yourself, and not someone who does not exist
    await assert.rejects(
      () => svc.getOrCreateDirect("u-a", "u-a"),
      (err) => err.statusCode === 400
    );
    await assert.rejects(
      () => svc.getOrCreateDirect("u-a", "u-missing"),
      (err) => err.statusCode === 404
    );

    const direct = await svc.getOrCreateDirect("u-a", "u-b");
    assert.strictEqual(direct.type, "DIRECT");
    assert.strictEqual(direct.members.length, 2);

    // same direct returned (idempotent)
    const directAgain = await svc.getOrCreateDirect("u-b", "u-a");
    assert.strictEqual(directAgain.id, direct.id);

    const group = await svc.startGroup("u-a", {
      type: "GROUP",
      name: "Project X",
      memberIds: ["u-b", "u-c"],
    });
    assert.strictEqual(group.type, "GROUP");
    const admin = group.members.find((m) => m.id === "u-a");
    assert.strictEqual(admin.role, "ADMIN");

    // group update requires admin
    await assert.rejects(
      () => svc.updateGroup("u-b", group.id, { name: "Hacked" }),
      (err) => err.statusCode === 403
    );
    const renamed = await svc.updateGroup("u-a", group.id, { name: "Project Y" });
    assert.strictEqual(renamed.name, "Project Y");

    // a non-friend can be pulled into a group directly
    addFriends(prisma, state, "u-a", "u-d");
    const afterAdd = await svc.addMember("u-a", group.id, "u-d");
    assert.strictEqual(afterAdd.members.length, 4);

    // not yourself, not twice, not a user who does not exist, not as a non-admin
    await assert.rejects(
      () => svc.addMember("u-a", group.id, "u-a"),
      (err) => err.statusCode === 409
    );
    await assert.rejects(
      () => svc.addMember("u-a", group.id, "u-d"),
      (err) => err.statusCode === 409
    );
    await assert.rejects(
      () => svc.addMember("u-a", group.id, "u-missing"),
      (err) => err.statusCode === 400
    );
    await assert.rejects(
      () => svc.addMember("u-b", group.id, "u-c"),
      (err) => err.statusCode === 403
    );

    // removing a member (only by admin)
    await svc.removeMember("u-a", group.id, "u-d");
    assert.strictEqual(
      state.members.filter((m) => m.conversationId === group.id).length,
      3
    );

    const list = await svc.list("u-a");
    assert.strictEqual(list.items.length, 3); // direct w/ u-b, direct w/ u-d, group
    assert.strictEqual(list.unreadTotal, 0);

    const msgs = state.messages;
    msgs.push({ conversationId: group.id, senderId: "u-b", createdAt: new Date(), id: "m1" });
    msgs.push({ conversationId: group.id, senderId: "u-c", createdAt: new Date(), id: "m2" });

    const unreadList = await svc.list("u-a");
    const groupItem = unreadList.items.find((c) => c.id === group.id);
    assert.strictEqual(groupItem.unread, 2);

    await svc.markRead("u-a", group.id);
    const afterRead = await svc.list("u-a");
    const groupItem2 = afterRead.items.find((c) => c.id === group.id);
    assert.strictEqual(groupItem2.unread, 0);

    console.log("conversation service: OK");
  }

  // ---------- message: send text + image + notify/none ----------
  {
    const { prisma, state } = createMockPrisma();
    state.users.push(USER_A, USER_B);
    addFriends(prisma, state, "u-a", "u-b");
    state.conversations.push({
      id: "c-1",
      type: "DIRECT",
      name: null,
      iconUrl: null,
      createdById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: null,
    });
    state.members.push({ conversationId: "c-1", userId: "u-a", role: "MEMBER", lastReadAt: new Date(0) });
    state.members.push({ conversationId: "c-1", userId: "u-b", role: "MEMBER", lastReadAt: new Date(0) });

    const events = [];
    const realtime = { emitToUser: async (_u, evt, payload) => events.push([evt, payload]) };
    const notifications = [];
    const notificationService = { create: async (_u, notif) => notifications.push(notif) };
    const fileService = { buildUrl: (name) => `/uploads/${name}` };

    const svc = new MessageService(prisma, realtime, notificationService, fileService);

    const text = await svc.send("u-a", "c-1", { content: "hi bob" });
    assert.strictEqual(text.type, "TEXT");
    assert.strictEqual(events.length, 1); // emitted to the other member only
    assert.strictEqual(notifications.length, 1); // only the other member notified

    const image = await svc.send("u-b", "c-1", {}, {
      filename: "pic.png",
      originalname: "pic.png",
      mimetype: "image/png",
      size: 1024,
    });
    assert.strictEqual(image.type, "IMAGE");
    assert.strictEqual(image.attachmentUrl, "/uploads/pic.png");

    const file = await svc.send("u-a", "c-1", {}, {
      filename: "doc.pdf",
      originalname: "doc.pdf",
      mimetype: "application/pdf",
      size: 2048,
    });
    assert.strictEqual(file.type, "FILE");

    await assert.rejects(() => svc.send("u-a", "c-1", {}), (err) => err.statusCode === 400);

    const list = await svc.list("u-a", "c-1");
    assert.strictEqual(list.items.length, 3);

    assert.strictEqual(
      state.conversations.find((c) => c.id === "c-1").lastMessageAt != null,
      true
    );

    console.log("message service: OK");
  }

  console.log("All community service tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});