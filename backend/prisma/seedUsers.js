// Dummy development accounts: user1@gmail.com … user5@gmail.com, plus the
// administrator from seedAdmin.js.
//
//   npx prisma db seed        <- runs this, after seed.js
//   node prisma/seedUsers.js  <- same thing on its own
//
// Why this is not in seed.js: the seed owns reference data (the notification
// sound catalogue) and never creates logins, because a login with a committed
// password is not reference data. seedAdmin.js exists for the same reason, and
// this file calls into it rather than repeating the admin's credentials in a
// second place that could drift out of step with it.
//
// SECURITY: every password below is fixed and committed to the repository, and
// they all match the app's own 8-character minimum. That is fine for a local
// database and is the entire point of the file. Do not run it against a
// deployed environment, and do not treat any of these addresses as real
// mailboxes — registration is the only path that delivers a verification
// message, and these rows were inserted past that check entirely.
//
// Idempotent. Each account is matched by email and re-asserted on re-run, so a
// database can be seeded repeatedly without a unique-key failure, and a dummy
// account someone suspended from the console comes back usable.
//
// Emails, not usernames: this app signs in by email — authService.login matches
// on User.email and that column is the only unique identifier on the model — so
// "user1" has to arrive as an address. The address doubles as the display name
// in firstName for the same reason User.firstName cannot be left null.

const { PrismaClient } = require("@prisma/client");
const PasswordService = require("../src/services/user/passwordService.js");
const { seedAdmin, ADMIN_EMAIL, ADMIN_PASSWORD } = require("./seedAdmin.js");

const DUMMY_PASSWORD = "12345678";

const DUMMY_USERS = [
  { email: "user1@gmail.com", firstName: "User1" },
  { email: "user2@gmail.com", firstName: "User2" },
  { email: "user3@gmail.com", firstName: "User3" },
  { email: "user4@gmail.com", firstName: "User4" },
  { email: "user5@gmail.com", firstName: "User5" },
];

async function seedDummyUser(prisma, passwordService, { email, firstName }) {
  // findFirst rather than findUnique: MySQL's default collation already compares
  // the address case-insensitively, and a row written as User1@Gmail.com is the
  // same login as the lowercase one below.
  const existing = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true, firstName: true, role: true, status: true },
  });

  // Hash once per account and reuse it, so re-running the seed against an
  // unchanged account still costs a single bcrypt round.
  const passwordHash = await passwordService.hash(DUMMY_PASSWORD);

  const select = { id: true, email: true, firstName: true, role: true, status: true };

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        // Password and status are re-asserted so a re-seed is a reset you can
        // count on. `role` is deliberately left alone: promoting a dummy to
        // admin is a legitimate thing to do while testing the console, and a
        // re-run of the seed quietly undoing that would be surprising.
        //
        // firstName is not written either — the same reason seedAdmin.js leaves
        // names alone: a re-seed should not rename an account someone edited.
        data: { passwordHash, status: "ACTIVE" },
        select,
      })
    : await prisma.user.create({
        data: {
          email,
          passwordHash,
          // Non-nullable on the model. lastName is nullable and stays unset.
          firstName,
          role: "USER",
          status: "ACTIVE",
        },
        select,
      });

  // register() writes this row immediately after creating the user, and the
  // onboarding flow reads it, so the seed writes it too rather than leaving
  // every dummy to hit the create-on-read path in PersonalizationService.
  // createMany is not an option: PersonalizationProfile has no default id, so
  // the id has to come from the client either way.
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
    const created = [];
    const existing = [];

    for (const account of DUMMY_USERS) {
      const { user, created: isNew } = await seedDummyUser(prisma, passwordService, account);
      (isNew ? created : existing).push(user);
      console.log(`${isNew ? "created" : "updated"} ${user.email}`);
    }

    // The admin is the account the console is entered with, so it is part of
    // the same run. seedAdmin() enforces ADMIN + ACTIVE + the password above.
    const { user: admin, created: adminIsNew } = await seedAdmin(prisma, passwordService);
    console.log(`${adminIsNew ? "created" : "updated"} ${admin.email} (${admin.role})`);

    const total = created.length + existing.length + 1;
    console.log("");
    console.log(`Dummy accounts ready: ${total} (${created.length} new, ${existing.length} already present)`);
    console.log(`  ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}  (admin)`);
    for (const account of DUMMY_USERS) {
      console.log(`  ${account.email} / ${DUMMY_PASSWORD}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main, seedDummyUser, DUMMY_USERS, DUMMY_PASSWORD };
