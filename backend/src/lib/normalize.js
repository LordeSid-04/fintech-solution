function toStringArray(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && typeof item.name === "string") return item.name;
      if (item && typeof item === "object" && typeof item.description === "string") {
        return item.description;
      }
      if (item === null || item === undefined) return "";
      return String(item);
    })
    .filter(Boolean);
}

function toString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function toStringRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") output[key] = raw;
    else if (raw && typeof raw === "object") output[key] = JSON.stringify(raw, null, 2);
    else output[key] = String(raw ?? "");
  }
  return output;
}

module.exports = {
  toStringArray,
  toString,
  toStringRecord,
};
