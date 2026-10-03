// Seeds the administrator account the console is entered with.
//
//   node prisma/seedAdmin.js
//
// Why this is separate from seed.js: the seed owns reference data (notification
// sounds) and deliberately never creates users — a login nobody asked for is not
// reference data. promoteAdmin.js is the other half of that story: it grants
// admin to an account a person signed up for themselves, and refuses to invent
// credentials. This file is the third option — a KNOWN local admin, for
// development, created on request rather than left to chance.
//
// seedUsers.js requires the exported seedAdmin() to fold this account into
// `npx prisma db seed` without a second copy of the credentials drifting out of
// step with this one. The require.main guard below is what keeps that import
// from running the whole script as a side effect.
//
// SECURITY: the password below is a fixed, committed credential. That is
// acceptable for a local/dev database and is why this is a separate script
// rather than part of the seed: `node prisma/seed.js` is something you run
// anywhere, and this one is not. Do not run it against a deployed environment —
// or if you must, sign in and change the password immediately.
//
// Idempotent, so it is safe to re-run: it matches the account case-insensitively
// (MySQL's default collation already does this) and, when the account exists,
// enforces the three fields that make the console reachable at all — ADMIN role,
// ACTIVE status, and a password matching the value above — instead of failing on
// the unique email. Without the status write, an account suspended from the
// console would pass the role check and still be turned away by adminGuard.
// It also backfills the personalization profile, which is what keeps the client
// from crashing on a missing profile for an account that predates this.
//
// Names are NOT overwritten on update. firstName is required by the schema so it
// is set on create, but re-running this should not rename an administrator
// someone has since edited.

const { PrismaClient } = require("@prisma/client");
const PasswordService = require("../src/services/user/passwordService.js");

const ADMIN_EMAIL = "admin@gmail.com";
const ADMIN_PASSWORD = "12345678";

// Takes its Prisma client and password service rather than constructing them, so
// seedUsers.js can call it inside its own connection and its own run instead of
// opening a second client and exiting underneath it. Returns whether the account
// was created or re-asserted so the caller can report it; all logging lives in
// main() below.
async function seedAdmin(prisma, passwordService) {
  const existing = await prisma.user.findFirst({
    where: { email: ADMIN_EMAIL },
    select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true },
  });

  const passwordHash = await passwordService.hash(ADMIN_PASSWORD);

  const select = { id: true, email: true, firstName: true, lastName: true, role: true, status: true };

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, role: "ADMIN", status: "ACTIVE" },
        select,
      })
    : await prisma.user.create({
        data: {
          email: ADMIN_EMAIL,
          passwordHash,
          // User.firstName is non-nullable, so a display name is not optional
          // here. lastName is nullable and is left empty.
          firstName: "Admin",
          role: "ADMIN",
          status: "ACTIVE",
        },
        select,
      });

  // Registration pairs every account with a profile (authService.register), and
  // GET /auth/me hands that profile straight to the client, which reads it
  // unguarded. An admin without the row is therefore not a blank form but a
  // crashed app, so it is created here with the same bare shape registration uses.
  // The update branch is empty on purpose: re-running must not wipe answers
  // someone filled in at /onboarding.
  await prisma.personalizationProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });

  return { user, created: !existing };
}

async function main() {
  const prisma = new PrismaClient();
  const passwordService = new PasswordService();

  try {
    const { user, created } = await seedAdmin(prisma, passwordService);

    console.log(created ? `Created account ${user.email}` : `Updated existing account ${user.email}`);
    console.log(`  id:     ${user.id}`);
    console.log(`  name:   ${[user.firstName, user.lastName].filter(Boolean).join(" ")}`);
    console.log(`  role:   ${user.role}`);
    console.log(`  status: ${user.status}`);

    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    console.log(`Administrators on this database: ${admins}`);

    if (admins > 1) {
      console.log("");
      console.log("More than one administrator exists. The console's own guard blocks an");
      console.log("admin from demoting or suspending themselves, so the last active admin");
      console.log("cannot be locked out by accident — but two admins can still lock each");
      console.log("other out if both are suspended from a third session.");
    }

    console.log("");
    console.log(`Sign in with ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} at /admin.`);
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { seedAdmin, ADMIN_EMAIL, ADMIN_PASSWORD };

// require.main === module is true only when this file is the entry point. When
// seedUsers.js imports it, the module body above is evaluated and this is false,
// so the import does not create a client, seed anything, or kill the process.
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
