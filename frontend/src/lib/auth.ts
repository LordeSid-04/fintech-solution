export type AuthUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber: string;
  createdAt: string;
};

export type AuthSession = {
  token: string;
  issuedAt: string;
};

export type SignupPayload = {
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber: string;
  password: string;
};

export function isNtuStudentEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith("@e.ntu.edu.sg");
}

export function isSingaporeMobileNumber(mobileNumber: string): boolean {
  const normalized = mobileNumber.trim().replace(/[ -]/g, "");
  return /^(?:\+65)?[89]\d{7}$/.test(normalized);
}

export function validateSignupPayload(payload: SignupPayload): string {
  if (!payload.firstName.trim()) return "First name is required.";
  if (!payload.lastName.trim()) return "Last name is required.";
  if (!isNtuStudentEmail(payload.email)) {
    return "Use your NTU student email ending with @e.ntu.edu.sg.";
  }
  if (!isSingaporeMobileNumber(payload.mobileNumber)) {
    return "Enter a valid Singapore mobile number (for example +6591234567).";
  }
  if (payload.password.length < 8) return "Password must be at least 8 characters.";
  return "";
}

export async function signup(payload: SignupPayload): Promise<AuthUser> {
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as { user?: AuthUser; error?: string };
  if (!response.ok || !data.user) {
    throw new Error(data.error || "Signup failed.");
  }
  return data.user;
}

export async function login(email: string, password: string): Promise<{ user: AuthUser; session: AuthSession }> {
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await response.json()) as { user?: AuthUser; session?: AuthSession; error?: string };
  if (!response.ok || !data.user || !data.session) {
    throw new Error(data.error || "Login failed.");
  }
  return { user: data.user, session: data.session };
}

export function storeSession(user: AuthUser, session: AuthSession): void {
  localStorage.setItem("codexai.activeUser", user.email);
  localStorage.setItem("codexai.auth.session", JSON.stringify({ user, session }));
}

export function hasStoredSession(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(localStorage.getItem("codexai.auth.session"));
}
