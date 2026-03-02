"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { login, signup, storeSession, validateSignupPayload } from "@/lib/auth";

type AuthMode = "login" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const title = useMemo(
    () => (mode === "signup" ? "Create your account" : "Login to Codex AI"),
    [mode]
  );

  const handleSubmit = async () => {
    setError("");
    setIsSubmitting(true);
    try {
      if (mode === "signup") {
        const validationError = validateSignupPayload({
          firstName,
          lastName,
          email,
          mobileNumber,
          password,
        });
        if (validationError) {
          setError(validationError);
          return;
        }

        await signup({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          mobileNumber: mobileNumber.trim(),
          password,
        });
      }

      const loggedIn = await login(email.trim(), password);
      storeSession(loggedIn.user, loggedIn.session);
      router.push("/confidence");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex w-full max-w-md flex-col px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="rounded-full border border-white/20 bg-white/[0.02] px-3 py-1 text-xs text-white/85 hover:bg-white/[0.08]"
          >
            Back
          </Link>
          <div className="text-xs tracking-[0.2em] text-white/70">CODEX AI</div>
        </div>

        <div className="rounded-2xl border border-white/12 bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-full border px-3 py-1 text-xs ${
                mode === "login"
                  ? "border-violet-300/35 bg-violet-300/12 text-violet-100"
                  : "border-white/20 text-white/75"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-full border px-3 py-1 text-xs ${
                mode === "signup"
                  ? "border-violet-300/35 bg-violet-300/12 text-violet-100"
                  : "border-white/20 text-white/75"
              }`}
            >
              Sign up
            </button>
          </div>

          <h1 className="text-xl font-semibold text-white">{title}</h1>
          <p className="mt-2 text-sm text-white/75">
            Signup is currently limited to NTU student emails ending with @e.ntu.edu.sg.
          </p>

          {mode === "signup" ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="First Name"
                className="rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none"
              />
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="Last Name"
                className="rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none"
              />
            </div>
          ) : null}

          <div className="mt-3 space-y-3">
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              type="email"
              className="w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none"
            />
            {mode === "signup" ? (
              <input
                value={mobileNumber}
                onChange={(event) => setMobileNumber(event.target.value)}
                placeholder="Mobile Number (+65...)"
                className="w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none"
              />
            ) : null}
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              type="password"
              className="w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none"
            />
          </div>

          {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              void handleSubmit();
            }}
            className="mt-5 w-full rounded-full border border-violet-300/35 bg-violet-300/12 px-4 py-2 text-sm font-medium text-violet-100 hover:bg-violet-300/20 disabled:opacity-60"
          >
            {isSubmitting ? "Please wait..." : mode === "signup" ? "Create account" : "Login"}
          </button>
        </div>
      </div>
    </main>
  );
}
