import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isNtuStudentEmail,
  isSingaporeMobileNumber,
  login,
  signup,
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

  it("falls back to localhost for public hosted domains without explicit backend URL", () => {
    expect(
      resolveBackendBaseUrl({
        hostname: "experiment-dlweek.vercel.app",
        protocol: "https:",
        origin: "https://experiment-dlweek.vercel.app",
      })
    ).toBe("http://localhost:4000");
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

describe("auth api parsing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns meaningful login error when response body is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500, headers: { "Content-Type": "application/json" } }))
    );
    await expect(login("ma0001th@e.ntu.edu.sg", "Siddhanth$04")).rejects.toThrow(
      "Login failed (status 500)."
    );
  });

  it("returns meaningful login error when response body is non-JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>upstream error</html>", { status: 502 }))
    );
    await expect(login("ma0001th@e.ntu.edu.sg", "Siddhanth$04")).rejects.toThrow(
      "Login failed (status 502)."
    );
  });

  it("parses signup response with immediate session payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            user: {
              id: "user-1",
              firstName: "Ada",
              lastName: "Lovelace",
              email: "ada@e.ntu.edu.sg",
              mobileNumber: "+6591234567",
              createdAt: new Date().toISOString(),
            },
            session: {
              token: "demo-session-1",
              issuedAt: new Date().toISOString(),
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const result = await signup({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@e.ntu.edu.sg",
      mobileNumber: "+6591234567",
      password: "password123",
    });
    expect(result.user.email).toBe("ada@e.ntu.edu.sg");
    expect(result.session?.token).toBe("demo-session-1");
  });
});
