import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isClientActionAuthorized,
  isActiveLoginMatch,
} from "./client-access-authz.ts";

const CLIENT_A = "11111111-1111-1111-1111-111111111111";
const CLIENT_B = "22222222-2222-2222-2222-222222222222";

test("isClientActionAuthorized: NEGATIVE - out-of-scope PM is not authorized", () => {
  assert.equal(
    isClientActionAuthorized({
      isAdmin: false,
      assignedClientIds: [CLIENT_A],
      clientId: CLIENT_B,
    }),
    false
  );
});

test("isClientActionAuthorized: NEGATIVE - empty assignments is not authorized", () => {
  assert.equal(
    isClientActionAuthorized({
      isAdmin: false,
      assignedClientIds: [],
      clientId: CLIENT_B,
    }),
    false
  );
});

test("isClientActionAuthorized: POSITIVE - assigned PM is authorized", () => {
  assert.equal(
    isClientActionAuthorized({
      isAdmin: false,
      assignedClientIds: ["A"],
      clientId: "A",
    }),
    true
  );
});

test("isClientActionAuthorized: POSITIVE - admin is always authorized", () => {
  assert.equal(
    isClientActionAuthorized({
      isAdmin: true,
      assignedClientIds: [],
      clientId: "anything",
    }),
    true
  );
});

test("isActiveLoginMatch: NEGATIVE - mismatched userId is not a match", () => {
  assert.equal(isActiveLoginMatch({ userId: "user-a" }, "user-b"), false);
});

test("isActiveLoginMatch: NEGATIVE - null active login is not a match", () => {
  assert.equal(isActiveLoginMatch(null, "user-a"), false);
});

test("isActiveLoginMatch: POSITIVE - matching userId is a match", () => {
  assert.equal(isActiveLoginMatch({ userId: "user-a" }, "user-a"), true);
});
