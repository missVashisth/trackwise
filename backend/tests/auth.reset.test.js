const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const h = require("./helpers");

let base, User, Notification, service, rateLimit, deliveries;

before(async () => {
  await h.setupDb();
  base = await h.startServer();
  User = require("../src/models/user.model");
  Notification = require("../src/models/notification.model");
  service = require("../src/services/notifications/notification.service");
  rateLimit = require("../src/utils/rateLimit");
});
after(h.teardown);

beforeEach(async () => {
  await h.resetDb();
  rateLimit.resetRateLimits();
  deliveries = [];
  service.setEnqueueDelivery(async (notification, delivery) => deliveries.push({ notification, delivery }));
});

const tokenFrom = (url) => new URL(url).hash.replace("#token=", "");

async function requestResetToken(email) {
  const before = deliveries.length;
  const anon = h.createClient(base);
  const res = await anon.request("POST", "/auth/forgot-password", { email });
  assert.equal(res.status, 200);
  await h.waitFor(() => deliveries.length > before);
  return tokenFrom(deliveries[deliveries.length - 1].delivery.resetUrl);
}

test("the response is identical whether or not the account exists", async () => {
  await h.registerUser(h.createClient(base), "alice");
  const anon = h.createClient(base);
  const known = await anon.request("POST", "/auth/forgot-password", { email: "alice@example.com" });
  const unknown = await anon.request("POST", "/auth/forgot-password", { email: "nobody@example.com" });

  assert.equal(known.status, unknown.status);
  assert.equal(known.text, unknown.text);
  await h.waitFor(() => deliveries.length === 1);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(deliveries.length, 1, "only the real account gets an email");
  assert.equal(await Notification.countDocuments(), 1);
});

test("invalid email input is rejected without touching any account", async () => {
  const anon = h.createClient(base);
  for (const email of [undefined, "", "not-an-email", { $ne: null }, ["a@b.c"]]) {
    assert.equal((await anon.request("POST", "/auth/forgot-password", { email })).status, 400, JSON.stringify(email));
  }
});

test("only a hash of the token is stored, with an expiry; the link uses the URL fragment", async () => {
  await h.registerUser(h.createClient(base), "alice");
  const token = await requestResetToken("alice@example.com");

  assert.match(token, /^[a-f0-9]{64}$/);
  assert.ok(deliveries[0].delivery.resetUrl.startsWith("http://app.test/reset-password#token="));
  const stored = await User.findOne({ email: "alice@example.com" }).select("+passwordResetTokenHash +passwordResetExpiresAt").lean();
  assert.equal(stored.passwordResetTokenHash, crypto.createHash("sha256").update(token).digest("hex"));
  assert.ok(!JSON.stringify(stored).includes(token), "raw token not in the user document");
  const minutes = (new Date(stored.passwordResetExpiresAt) - Date.now()) / 60000;
  assert.ok(minutes > 29 && minutes <= 30, `expires in ~30 minutes, got ${minutes}`);
  assert.ok(!JSON.stringify(await Notification.find().lean()).includes(token), "raw token not in notifications");
});

test("reset works: new password logs in, old password fails, old sessions end, link is single-use", async () => {
  const alice = h.createClient(base);
  await h.registerUser(alice, "alice", "oldpass1");
  assert.equal((await alice.request("GET", "/goals")).status, 200);

  const token = await requestResetToken("alice@example.com");
  const anon = h.createClient(base);
  const reset = await anon.request("POST", "/auth/reset-password", { token, password: "newpass1" });
  assert.equal(reset.status, 200);

  assert.equal((await alice.request("GET", "/goals")).status, 401, "existing session is revoked");
  assert.equal((await anon.request("POST", "/auth/login", { email: "alice@example.com", password: "oldpass1" })).status, 400);
  assert.equal((await anon.request("POST", "/auth/login", { email: "alice@example.com", password: "newpass1" })).status, 200);
  assert.equal((await anon.request("GET", "/goals")).status, 200, "a fresh login after the reset works");

  const reuse = await h.createClient(base).request("POST", "/auth/reset-password", { token, password: "another1" });
  assert.equal(reuse.status, 400, "token cannot be reused");
  const stored = await User.findOne({ email: "alice@example.com" }).select("+passwordResetTokenHash").lean();
  assert.equal(stored.passwordResetTokenHash, undefined);
});

test("two simultaneous uses of the same token: exactly one succeeds", async () => {
  await h.registerUser(h.createClient(base), "alice");
  const token = await requestResetToken("alice@example.com");
  const results = await Promise.all(
    ["race-one1", "race-two2"].map((password) => h.createClient(base).request("POST", "/auth/reset-password", { token, password }))
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
});

test("an expired token fails", async () => {
  await h.registerUser(h.createClient(base), "alice");
  const token = await requestResetToken("alice@example.com");
  await User.updateOne({ email: "alice@example.com" }, { $set: { passwordResetExpiresAt: new Date(Date.now() - 1000) } });

  const res = await h.createClient(base).request("POST", "/auth/reset-password", { token, password: "newpass1" });
  assert.equal(res.status, 400);
  assert.equal((await h.createClient(base).request("POST", "/auth/login", { email: "alice@example.com", password: "secret1" })).status, 200);
});

test("invalid and malformed tokens fail", async () => {
  await h.registerUser(h.createClient(base), "alice");
  await requestResetToken("alice@example.com");
  const anon = h.createClient(base);
  for (const token of [crypto.randomBytes(32).toString("hex"), "abc", "", undefined, { $ne: null }, "G".repeat(64)]) {
    assert.equal((await anon.request("POST", "/auth/reset-password", { token, password: "newpass1" })).status, 400, JSON.stringify(token));
  }
});

test("a weak new password is rejected and the token stays usable", async () => {
  await h.registerUser(h.createClient(base), "alice");
  const token = await requestResetToken("alice@example.com");
  const anon = h.createClient(base);
  assert.equal((await anon.request("POST", "/auth/reset-password", { token, password: "123" })).status, 400);
  assert.equal((await anon.request("POST", "/auth/reset-password", { token, password: "goodpass" })).status, 200);
});

test("a newer reset request invalidates the older link", async () => {
  await h.registerUser(h.createClient(base), "alice");
  const first = await requestResetToken("alice@example.com");
  const second = await requestResetToken("alice@example.com");
  const anon = h.createClient(base);
  assert.equal((await anon.request("POST", "/auth/reset-password", { token: first, password: "newpass1" })).status, 400);
  assert.equal((await anon.request("POST", "/auth/reset-password", { token: second, password: "newpass1" })).status, 200);
});

test("reset requests are rate limited per email address", async () => {
  const anon = h.createClient(base);
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await anon.request("POST", "/auth/forgot-password", { email: "Victim@Example.com" })).status);
  assert.deepEqual(statuses, [200, 200, 200, 429]);
});

test("reset attempts are rate limited per client", async () => {
  const anon = h.createClient(base);
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    statuses.push((await anon.request("POST", "/auth/reset-password", { token: crypto.randomBytes(32).toString("hex"), password: "newpass1" })).status);
  }
  assert.equal(statuses.filter((s) => s === 400).length, 10);
  assert.equal(statuses[10], 429);
});
