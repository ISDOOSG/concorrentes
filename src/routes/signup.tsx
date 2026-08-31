import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { LoginSignupForm } from "@/components/auth/login-signup-form";

const signupSearchSchema = z.object({
  redirect: z.string().optional(),
});

function sanitizeRedirect(raw?: string): string {
  if (!raw) return "/dashboard";
  try {
    let decoded = raw;
    for (let i = 0; i < 5 && decoded !== decodeURIComponent(decoded); i++) {
      decoded = decodeURIComponent(decoded);
    }
    if (!decoded.startsWith("/")) return "/dashboard";
    if (decoded.startsWith("/login") || decoded.startsWith("/signup")) {
      return "/dashboard";
    }
    return decoded;
  } catch {
    return "/dashboard";
  }
}

export const Route = createFileRoute("/signup")({
  validateSearch: signupSearchSchema,
  component: SignupPage,
});

function SignupPage() {
  const { redirect } = Route.useSearch();
  return (
    <LoginSignupForm
      initialMode="register"
      redirectTo={sanitizeRedirect(redirect)}
    />
  );
}
