// Logic checks for the notification sound feature using a fake prisma client,
// so nothing here touches a real database.
const assert = require("assert");

const NotificationSoundService = require("../src/services/user/notificationSoundService.js");
const SettingsService = require("../src/services/user/settingsService.js");

const SOUNDS = [
  { id: "s1", name: "Current Notification Sound", path: "/uploads/notifications/current.wav", isDefault: true, createdAt: new Date(1) },
  { id: "s2", name: "Doremon", path: "/uploads/notifications/doremon.mp3", isDefault: false, createdAt: new Date(2) },
  { id: "s3", name: "Orchestral", path: "/uploads/notifications/orchestral.wav", isDefault: false, createdAt: new Date(3) },
];

function makePrisma(seed = SOUNDS) {
  const state = {
    sounds: [...seed],
    // userId -> notificationSoundId | null
    selections: new Map(),
    settingsRows: new Map(),
  };

  return {
    state,
    notificationSound: {
      findMany: async () => [...state.sounds].sort((a, b) => a.createdAt - b.createdAt),
      findFirst: async ({ where, orderBy } = {}) => {
        const pool = where?.isDefault ? state.sounds.filter((s) => s.isDefault) : state.sounds;
        const sorted = [...pool].sort((a, b) => a.createdAt - b.createdAt);
        return sorted[0] ?? null;
      },
      findUnique: async ({ where }) => state.sounds.find((s) => s.id === where.id) ?? null,
    },
    notificationSettings: {
      findUnique: async ({ where }) => {
        const id = state.selections.get(where.userId);
        return id === undefined ? null : { notificationSoundId: id };
      },
      create: async ({ data }) => {
        // Mirrors the column default: a brand new row has no selection.
        state.selections.set(data.userId, null);
        return { userId: data.userId, notificationSoundId: null };
      },
      upsert: async ({ where, create, update }) => {
        const next = { ...(create || {}), ...(where.userId ? {} : {}), ...update };
        state.selections.set(where.userId, update.notificationSoundId);
        state.settingsRows.set(where.userId, next);
        return next;
      },
    },
    userSettings: {
      findUnique: async ({ where }) => state.settingsRows.get(where.userId) ?? { userId: where.userId },
      create: async ({ data }) => data,
    },
  };
}

async function run() {
  // --- default resolution -------------------------------------------------
  {
    const prisma = makePrisma();
    const svc = new NotificationSoundService(prisma);
    assert.strictEqual((await svc.getDefault()).id, "s1", "default should be the flagged row");
    assert.strictEqual((await svc.getSelectedSound("nobody")).id, "s1",
      "a user with no selection must get the default");
    assert.strictEqual((await svc.list()).length, 3);
    console.log("ok  default resolution for users with no selection");
  }

  // --- dangling id falls back instead of going silent ---------------------
  {
    const prisma = makePrisma();
    prisma.state.selections.set("ghost", "deleted-sound");
    const svc = new NotificationSoundService(prisma);
    assert.strictEqual((await svc.getSelectedSound("ghost")).id, "s1",
      "a dangling notificationSoundId must fall back to the default");
    console.log("ok  dangling sound id falls back to default");
  }

  // --- explicit selection wins --------------------------------------------
  {
    const prisma = makePrisma();
    const svc = new NotificationSoundService(prisma);
    const chosen = await svc.setSelectedSound("u1", "s3");
    assert.strictEqual(chosen.id, "s3");
    assert.strictEqual(prisma.state.selections.get("u1"), "s3",
      "only the id may be persisted, never the url");
    assert.strictEqual((await svc.getSelectedSound("u1")).id, "s3");
    console.log("ok  explicit selection is stored by id and resolved back");
  }

  // --- unknown id is a 404 ------------------------------------------------
  {
    const prisma = makePrisma();
    const svc = new NotificationSoundService(prisma);
    await assert.rejects(
      () => svc.assertExists("nope"),
      (error) => error.statusCode === 404 && /not found/i.test(error.message)
    );
    console.log("ok  unknown sound id rejected with the project 404 shape");
  }

  // --- empty catalogue does not throw -------------------------------------
  {
    const prisma = makePrisma([]);
    const svc = new NotificationSoundService(prisma);
    assert.strictEqual(await svc.getDefault(), null);
    assert.strictEqual(await svc.getSelectedSound("u1"), null);
    console.log("ok  empty catalogue returns null instead of throwing");
  }

  // --- settings service wiring --------------------------------------------
  {
    const prisma = makePrisma();
    const soundSvc = new NotificationSoundService(prisma);
    const settingsSvc = new SettingsService(prisma, soundSvc);

    const loaded = await settingsSvc.getSettings("u1");
    assert.ok(loaded.notificationSound, "getSettings must resolve a sound");
    assert.strictEqual(loaded.notificationSound.id, "s1");

    // Booleans only.
    const bools = await settingsSvc.updateNotificationSettings("u1", { dailySummary: false });
    assert.strictEqual(bools.notificationSettings.dailySummary, false);
    assert.strictEqual(bools.notificationSound.id, "s1", "unchanged selection still resolves");

    // Sound change rides the same endpoint.
    const swapped = await settingsSvc.updateNotificationSettings("u1", { notificationSoundId: "s2" });
    assert.strictEqual(swapped.notificationSound.id, "s2");
    assert.strictEqual(swapped.notificationSound.path, "/uploads/notifications/doremon.mp3");
    console.log("ok  settings service resolves + updates the selected sound");
  }

  // --- validator ----------------------------------------------------------
  {
    const svc = new SettingsService(makePrisma(), new NotificationSoundService(makePrisma()));

    // accepts a sound id
    await svc.updateNotificationSettings("u1", { notificationSoundId: "s2" });

    // accepts null (back to default)
    await svc.updateNotificationSettings("u1", { notificationSoundId: null });

    // rejects an unknown field, as .strict() requires
    let strictFailed = false;
    try {
      await svc.updateNotificationSettings("u1", { soundUrl: "/hack.mp3" });
    } catch (error) {
      strictFailed = error.statusCode === 400;
    }
    assert.ok(strictFailed, "unknown fields must still be rejected");

    // rejects a non-string id
    let typeFailed = false;
    try {
      await svc.updateNotificationSettings("u1", { notificationSoundId: 42 });
    } catch (error) {
      typeFailed = error.statusCode === 400;
    }
    assert.ok(typeFailed, "a numeric id must be rejected (ids are cuids)");

    // unknown id -> 404 before any write
    let notFound = false;
    try {
      await svc.updateNotificationSettings("u1", { notificationSoundId: "ghost" });
    } catch (error) {
      notFound = error.statusCode === 404;
    }
    assert.ok(notFound, "unknown id must 404");

    console.log("ok  validation, strict mode and 404 on unknown id");
  }

  console.log("\nAll notification sound service checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
