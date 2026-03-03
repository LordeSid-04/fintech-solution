import { describe, expect, it } from "vitest";
import {
  isNtuStudentEmail,
  isSingaporeMobileNumber,
  resolveBackendBaseUrl,
  validateSignupPayload,
} from "@/lib/auth";

describe("auth validators", () => {
  it("accepts only NTU student emails", () => {
    expect(isNtuStudentEmail("user@e.ntu.edu.sg")).toBe(true);
    expect(isNtuStudentEmail("user@gmail.com")).toBe(false);
  });

  it("accepts Singapore mobile numbers only", () => {
    expect(isSingaporeMobileNumber("+6591234567")).toBe(true);
    expect(isSingaporeMobileNumber("91234567")).toBe(true);
    expect(isSingaporeMobileNumber("+14155552671")).toBe(false);
  });

  it("validates required signup fields", () => {
    expect(
      validateSignupPayload({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@gmail.com",
        mobileNumber: "+6591234567",
        password: "password123",
      })
    ).toContain("@e.ntu.edu.sg");
  });

  it("uses configured backend URL when provided", () => {
    expect(
      resolveBackendBaseUrl({
        configuredUrl: "https://api.example.com/",
        hostname: "client.example.com",
        protocol: "https:",
      })
    ).toBe("https://api.example.com");
  });

  it("derives LAN-friendly backend URL on non-local host", () => {
    expect(
      resolveBackendBaseUrl({
        hostname: "192.168.1.10",
        protocol: "http:",
      })
    ).toBe("http://192.168.1.10:4000");
  });

  it("falls back to localhost on local development host", () => {
    expect(
      resolveBackendBaseUrl({
        hostname: "localhost",
        protocol: "http:",
      })
    ).toBe("http://localhost:4000");
  });
});
