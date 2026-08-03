import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isLikelyDriveLink,
  driveLinkType,
} from "./drive-url.ts";

test("isLikelyDriveLink: POSITIVE - a drive.google.com file link is accepted", () => {
  assert.equal(
    isLikelyDriveLink("https://drive.google.com/file/d/ABC123/view"),
    true
  );
});

test("isLikelyDriveLink: POSITIVE - a docs.google.com document link is accepted", () => {
  assert.equal(
    isLikelyDriveLink("https://docs.google.com/document/d/ABC123/edit"),
    true
  );
});

test("isLikelyDriveLink: POSITIVE - hostname match is case-insensitive", () => {
  assert.equal(
    isLikelyDriveLink("https://DRIVE.GOOGLE.COM/file/d/ABC/view"),
    true
  );
});

test("isLikelyDriveLink: NEGATIVE - plain http is rejected even on the right host", () => {
  assert.equal(
    isLikelyDriveLink("http://drive.google.com/file/d/ABC/view"),
    false
  );
});

test("isLikelyDriveLink: NEGATIVE - a lookalike domain is rejected (anchored origin check, not substring)", () => {
  assert.equal(
    isLikelyDriveLink("https://not-drive.google.com.evil.example/x"),
    false
  );
});

test("isLikelyDriveLink: NEGATIVE - an unrelated domain is rejected", () => {
  assert.equal(isLikelyDriveLink("https://example.com/whatever"), false);
});

test("isLikelyDriveLink: NEGATIVE - a non-URL string is rejected", () => {
  assert.equal(isLikelyDriveLink("nonsense"), false);
});

test("isLikelyDriveLink: NEGATIVE - an empty string is rejected", () => {
  assert.equal(isLikelyDriveLink(""), false);
});

test("driveLinkType: a Google Docs path is always 'other'", () => {
  assert.equal(
    driveLinkType("https://docs.google.com/document/d/ABC/edit"),
    "other"
  );
});

test("driveLinkType: an image extension is inferred as 'image'", () => {
  assert.equal(
    driveLinkType("https://drive.google.com/uc?id=ABC&x=1.png"),
    "image"
  );
});

test("driveLinkType: an opaque Drive file id with no extension falls back to 'other'", () => {
  assert.equal(
    driveLinkType("https://drive.google.com/file/d/ABC/view"),
    "other"
  );
});
