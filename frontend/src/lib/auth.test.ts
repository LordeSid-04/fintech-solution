import { describe, expect, it } from "vitest";
import { isNtuStudentEmail, isSingaporeMobileNumber, validateSignupPayload } from "@/lib/auth";

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
});
