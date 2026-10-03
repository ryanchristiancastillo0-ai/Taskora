// Grants admin access to an account that already exists.
//
//   node prisma/promoteAdmin.js you@example.com
//
// Why this is a script and not part of seed.js: the seed owns reference data
// (notification sounds) and never creates users. Minting a user here to get an
// admin would mean inventing a login nobody asked for, and an admin row with a
// known password is worse than no admin row at all. This only promotes an
// account that a person has already signed up for.
//
// The role migration backfills every existing user to USER and there is no admin
// link anywhere in the user interface - the console is entered by URL - so this
// is the intended way in. Until it is run, adminGuard correctly denies every
// request to /api/admin, including for a real admin: it reads the role from the
// database rather than from the token.

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const email = String(process.argv[2] ?? "").trim().toLowerCase();

  if (!email) {
    console.error("Usage: node prisma/promoteAdmin.js <email>");
    console.error("Example: node prisma/promoteAdmin.js you@example.com");
    process.exit(1);
  }

  // Case-insensitive to match how the app looks users up: MySQL's default
  // collation already treats the column that way, and an exact match would fail
  // for an address someone typed in a different case than it was stored.
  const user = await prisma.user.findFirst({ where: { email } });

  if (!user) {
    console.error(`No account with the email "${email}".`);
    console.error("Sign up first, then run this again.");
    process.exit(1);
  }

  if (user.status === "SUSPENDED") {
    console.log(`${user.email} is suspended. Reactivate them from the console`);
    console.log("(or set status back to ACTIVE) before promoting, or they will");
    console.log("pass the role check and still be turned away.");
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: "ADMIN" },
    select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true },
  });

  console.log(`Promoted ${updated.email} to ADMIN.`);
  if (updated.status === "ACTIVE") {
    console.log("Sign out and back in so your next token is issued after the change.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
