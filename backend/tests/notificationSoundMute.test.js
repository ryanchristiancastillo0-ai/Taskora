// Covers the notification sound mute switch end to end at the service layer:
// validation, persistence, and — most importantly — that muting never disturbs
// the selected clip, so unmuting restores it.
const assert = require("assert");

const {
  updateNotificationSettingsSchema,
} = require("../src/validators/user/settingsValidators.js");
const { parseSchema } = require("../src/utils/validate");
const SettingsService = require("../src/services/user/settingsService.js");
const NotificationSoundService = require("../src/services/user/notificationSoundService.js");

const SOUNDS = [
  { id: "s1", name: "Bell", path: "/uploads/notifications/current.wav", isDefault: true, createdAt: new Date(1) },
  { id: "s2", name: "Doremon", path: "/uploads/notifications/doremon.mp3", isDefault: false, createdAt: new Date(2) },
];

// Minimal stand-in for the prisma delegates SettingsService touches:
// notificationSettings, notificationSound and userSettings (getSettings reads
// all three).
function makePrisma() {
  const rows = new Map();
  const userRows = new Map();

  return {
    rows,
    notificationSound: {
      findMany: async () => [...SOUNDS],
      findFirst: async ({ where } = {}) => {
        const pool = where?.isDefault ? SOUNDS.filter((s) => s.isDefault) : SOUNDS;
        return pool[0] ?? null;
      },
      findUnique: async ({ where }) => SOUNDS.find((s) => s.id === where.id) ?? null,
    },
    notificationSettings: {
      findUnique: async ({ where }) => rows.get(where.userId) ?? null,
      create: async ({ data }) => {
        // Mirrors the schema defaults for a row created by ensureNotificationSettings.
        const row = { soundEnabled: false, notificationSoundId: null, ...data };
        rows.set(data.userId, row);
        return row;
      },
      upsert: async ({ where, create, update }) => {
        const existing = rows.get(where.userId);
        // Only the keys actually present in `update` are written, which is what
        // keeps an unrelated patch from clearing the sound selection.
        const next = existing
          ? { ...existing, ...update }
          : { soundEnabled: false, notificationSoundId: null, ...create };
        rows.set(where.userId, next);
        return next;
      },
    },
    userSettings: {
      findUnique: async ({ where }) => userRows.get(where.userId) ?? null,
      create: async ({ data }) => {
        userRows.set(data.userId, data);
        return data;
      },
      upsert: async ({ where, create, update }) => {
        const next = { ...(userRows.get(where.userId) || {}), ...update };
        userRows.set(where.userId, next);
        return next;
      },
    },
  };
}

function makeService(prisma) {
  return new SettingsService(prisma, new NotificationSoundService(prisma));
}

async function run() {
  // --- validation ---------------------------------------------------------
  {
    const parsed = parseSchema(updateNotificationSettingsSchema, { soundEnabled: false });
    assert.strictEqual(parsed.soundEnabled, false, "soundEnabled:false must validate");

    // parseSchema throws AppError("Validation failed") and carries the per-field
    // reason in `details`, so assert on the detail rather than the message.
    const rejects = (payload, field) => {
      assert.throws(
        () => parseSchema(updateNotificationSettingsSchema, payload),
        (error) => {
          assert.strictEqual(error.message, "Validation failed");
          const paths = (error.details || []).map((issue) => issue.path);
          assert.ok(
            paths.includes(field),
            `expected a validation issue on "${field}", got ${JSON.stringify(paths)}`
          );
          return true;
        },
        `${JSON.stringify(payload)} must be rejected`
      );
    };

    rejects({ soundEnabled: "nope" }, "soundEnabled");
    rejects({ soundMuted: true }, "");
    console.log("ok  soundEnabled validation");
  }

  // --- a new user is muted by default ---------------------------------------
  {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    const { notificationSettings } = await svc.getSettings("new-user");
    assert.strictEqual(notificationSettings.soundEnabled, false,
      "a user who never chose must start muted");
    console.log("ok  new users default to soundEnabled = false");
  }

  // --- muting persists and survives a re-read ------------------------------
  {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    const muted = await svc.updateNotificationSettings("u1", { soundEnabled: false });
    assert.strictEqual(muted.notificationSettings.soundEnabled, false);

    const reread = await svc.getSettings("u1");
    assert.strictEqual(reread.notificationSettings.soundEnabled, false,
      "mute must be readable back on the next settings load");
    console.log("ok  mute persists and reads back");
  }

  // --- muting must not touch the selected clip -----------------------------
  {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    await svc.updateNotificationSettings("u2", { notificationSoundId: "s2" });
    const muted = await svc.updateNotificationSettings("u2", { soundEnabled: false });
    assert.strictEqual(muted.notificationSettings.notificationSoundId, "s2",
      "muting must not clear the chosen sound");
    assert.strictEqual(muted.notificationSound.id, "s2",
      "the resolved sound must still be returned while muted");

    const unmuted = await svc.updateNotificationSettings("u2", { soundEnabled: true });
    assert.strictEqual(unmuted.notificationSettings.soundEnabled, true);
    assert.strictEqual(unmuted.notificationSound.id, "s2",
      "unmuting must restore the clip that was already selected");
    console.log("ok  mute and sound selection are independent");
  }

  // --- changing the sound while muted must not unmute ----------------------
  {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    await svc.updateNotificationSettings("u3", { soundEnabled: false });
    const after = await svc.updateNotificationSettings("u3", { notificationSoundId: "s1" });
    assert.strictEqual(after.notificationSettings.soundEnabled, false,
      "picking a sound must not silently unmute the user");
    console.log("ok  picking a sound while muted stays muted");
  }

  // --- muting is independent of the other toggles --------------------------
  {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    const result = await svc.updateNotificationSettings("u4", {
      soundEnabled: false,
      pushNotifications: false,
    });
    assert.strictEqual(result.notificationSettings.soundEnabled, false);
    assert.strictEqual(result.notificationSettings.pushNotifications, false);
    console.log("ok  mute coexists with the other notification toggles");
  }

  console.log("\nAll notification sound mute checks passed.");
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
