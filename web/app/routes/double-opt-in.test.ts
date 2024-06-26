import { before, test, describe } from "node:test";
import assert from "node:assert/strict";
import { isolate, migrate, outbox, testHandler } from "plainweb";
import { database } from "~/app/config/database";
import { GET } from "~/app/routes/double-opt-in";
import { createRequest } from "node-mocks-http";
import { contacts } from "~/app/config/schema";
import { eq } from "drizzle-orm";

describe("double opt in", () => {
  before(async () => await migrate(database));

  test("send email with correct token and email", async () => {
    await isolate(database, async (tx) => {
      await tx.insert(contacts).values({
        email: "walter@example.org",
        created: Date.now(),
        doubleOptInSent: Date.now(),
        doubleOptInToken: "123",
      });

      const req = createRequest({
        url: `/double-opt-in?token=123&email=walter@example.org`,
      });
      const res = await testHandler(GET, req, { database });
      const contact = await database.query.contacts.findFirst({
        where: eq(contacts.email, "walter@example.org"),
      });
      assert.equal(contact?.doubleOptInConfirmed! > 0, true);
      assert.equal(res._getStatusCode(), 200);
      assert.equal(res._getData().includes("Thanks for signing up"), true);
      assert.equal(outbox[0]!.message.includes("successfully"), true);
    });
  });

  test("send email with incorrect token", async () => {
    await isolate(database, async (tx) => {
      await tx.insert(contacts).values({
        email: "walter@example.org",
        created: Date.now(),
        doubleOptInToken: "123",
      });
      const req = createRequest({
        url: `/double-opt-in?token=abc&email=walter@example.org`,
      });
      const res = await testHandler(GET, req, { database });
      const contact = await database.query.contacts.findFirst({
        where: eq(contacts.email, "walter@example.org"),
      });
      console.log(contact);
      assert.equal(contact?.doubleOptInConfirmed === null, true);
      assert.equal(res._getStatusCode(), 200);
      assert.equal(res._getData().includes("Invalid"), true);
    });
  });
});
