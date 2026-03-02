const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DEFAULT_USERS_PATH = path.resolve(__dirname, "..", "..", "data", "users.json");
const NTU_STUDENT_DOMAIN = "@e.ntu.edu.sg";

function ensureUsersFile(usersPath) {
  const dir = path.dirname(usersPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(usersPath)) {
    fs.writeFileSync(usersPath, "[]", "utf8");
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeMobileNumber(mobileNumber) {
  return String(mobileNumber || "")
    .trim()
    .replace(/[ -]/g, "");
}

function validateNtuStudentEmail(email) {
  return normalizeEmail(email).endsWith(NTU_STUDENT_DOMAIN);
}

function validateSingaporeMobileNumber(mobileNumber) {
  const normalized = normalizeMobileNumber(mobileNumber);
  return /^(?:\+65)?[89]\d{7}$/.test(normalized);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const digest = crypto.pbkdf2Sync(String(password), salt, 100_000, 64, "sha512").toString("hex");
  return { salt, digest };
}

function compareDigests(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "hex");
  const rightBuffer = Buffer.from(String(right || ""), "hex");
  if (leftBuffer.length !== rightBuffer.length || leftBuffer.length === 0) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function validateSignupInput(payload) {
  const firstName = String(payload?.firstName || "").trim();
  const lastName = String(payload?.lastName || "").trim();
  const email = normalizeEmail(payload?.email);
  const mobileNumber = normalizeMobileNumber(payload?.mobileNumber);
  const password = String(payload?.password || "");

  if (!firstName) return "First name is required.";
  if (!lastName) return "Last name is required.";
  if (!email) return "Email is required.";
  if (!validateNtuStudentEmail(email)) {
    return "Signup is restricted to @e.ntu.edu.sg email addresses.";
  }
  if (!validateSingaporeMobileNumber(mobileNumber)) {
    return "Mobile number must be a valid Singapore number (for example +6591234567).";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return "";
}

function toPublicUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    mobileNumber: user.mobileNumber,
    createdAt: user.createdAt,
  };
}

function createAuthStore({ usersPath = DEFAULT_USERS_PATH } = {}) {
  function readUsers() {
    ensureUsersFile(usersPath);
    const raw = fs.readFileSync(usersPath, "utf8");
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeUsers(users) {
    ensureUsersFile(usersPath);
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), "utf8");
  }

  function createUser(payload) {
    const validationError = validateSignupInput(payload);
    if (validationError) {
      return { ok: false, error: validationError };
    }

    const users = readUsers();
    const email = normalizeEmail(payload.email);
    if (users.some((item) => normalizeEmail(item.email) === email)) {
      return { ok: false, error: "An account with this email already exists." };
    }

    const mobileNumber = normalizeMobileNumber(payload.mobileNumber);
    const passwordHash = hashPassword(payload.password);
    const user = {
      id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `user-${Date.now()}`,
      firstName: String(payload.firstName).trim(),
      lastName: String(payload.lastName).trim(),
      email,
      mobileNumber,
      passwordSalt: passwordHash.salt,
      passwordDigest: passwordHash.digest,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    writeUsers(users);
    return { ok: true, user: toPublicUser(user) };
  }

  function loginUser(payload) {
    const email = normalizeEmail(payload?.email);
    const password = String(payload?.password || "");
    if (!email || !password) {
      return { ok: false, error: "Email and password are required." };
    }

    const users = readUsers();
    const user = users.find((item) => normalizeEmail(item.email) === email);
    if (!user) {
      return { ok: false, error: "Invalid email or password." };
    }

    const computed = hashPassword(password, user.passwordSalt);
    if (!compareDigests(computed.digest, user.passwordDigest)) {
      return { ok: false, error: "Invalid email or password." };
    }

    return { ok: true, user: toPublicUser(user) };
  }

  return {
    readUsers,
    createUser,
    loginUser,
  };
}

const defaultStore = createAuthStore();

module.exports = {
  createAuthStore,
  validateNtuStudentEmail,
  validateSingaporeMobileNumber,
  normalizeEmail,
  normalizeMobileNumber,
  ...defaultStore,
};
