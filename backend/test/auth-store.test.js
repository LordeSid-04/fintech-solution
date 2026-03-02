const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createAuthStore,
  validateNtuStudentEmail,
  validateSingaporeMobileNumber,
} = require("../src/lib/auth-store");

test("email validation allows only NTU student domain", () => {
  assert.equal(validateNtuStudentEmail("student@e.ntu.edu.sg"), true);
  assert.equal(validateNtuStudentEmail("student@gmail.com"), false);
});

test("mobile validation allows Singapore format only", () => {
  assert.equal(validateSingaporeMobileNumber("+6591234567"), true);
  assert.equal(validateSingaporeMobileNumber("91234567"), true);
  assert.equal(validateSingaporeMobileNumber("+658123456"), false);
  assert.equal(validateSingaporeMobileNumber("+14155552671"), false);
});

test("signup stores user and login verifies password", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-store-"));
  const usersPath = path.join(tempDir, "users.json");
  const store = createAuthStore({ usersPath });

  const signup = store.createUser({
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@e.ntu.edu.sg",
    mobileNumber: "+6591234567",
    password: "secure-pass-123",
  });
  assert.equal(signup.ok, true);

  const loginOk = store.loginUser({ email: "ada@e.ntu.edu.sg", password: "secure-pass-123" });
  assert.equal(loginOk.ok, true);

  const loginBad = store.loginUser({ email: "ada@e.ntu.edu.sg", password: "wrong-password" });
  assert.equal(loginBad.ok, false);
});
