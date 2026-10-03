// Default data for the notification sound catalogue.
//
// Idempotent: every row is upserted by its `path`, which is unique, so running
// this repeatedly refreshes names/descriptions without duplicating rows or
// disturbing the ids users already reference from NotificationSettings.
//
// The audio files live on disk in backend/uploads/notifications and are served
// by the existing /uploads static mount. Only the relative path is stored — no
// binary is written to MySQL.

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const NOTIFICATION_SOUNDS = [
  {
    name: "Current Notification Sound",
    path: "/uploads/notifications/current.wav",
    description: "The original Taskora notification bell.",
    isDefault: true,
  },
  {
    name: "Doremon",
    path: "/uploads/notifications/doremon.mp3",
    description:
      "A playful voice notification that says 'Ang mahiwagang mensahe,' giving your alerts a fun and memorable touch.",
    isDefault: false,
  },
  {
    name: "Flute",
    path: "/uploads/notifications/flute.wav",
    description: "A soft, airy flute phrase. Easy on the ears.",
    isDefault: false,
  },
  {
    name: "Musical Alert",
    path: "/uploads/notifications/musical-alert.wav",
    description: "A brighter musical cue that cuts through background noise.",
    isDefault: false,
  },
  {
    name: "Musical",
    path: "/uploads/notifications/musical.wav",
    description: "A short melodic motif. Friendly without being loud.",
    isDefault: false,
  },
  {
    name: "Orchestral",
    path: "/uploads/notifications/orchestral.wav",
    description: "A fuller orchestral swell for when you want to really notice.",
    isDefault: false,
  },
];

async function main() {
  for (const sound of NOTIFICATION_SOUNDS) {
    const row = await prisma.notificationSound.upsert({
      where: { path: sound.path },
      create: sound,
      update: {
        name: sound.name,
        description: sound.description,
        isDefault: sound.isDefault,
      },
    });

    console.log(`notification sound "${row.name}" -> ${row.path}`);
  }

  const total = await prisma.notificationSound.count();
  console.log(`Notification sounds ready: ${total}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
