import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { LoginSignupForm } from "@/components/auth/login-signup-form";

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  component: LoginPage,
});

function sanitizeRedirect(raw?: string): string {
  if (!raw) return "/dashboard";
  try {
    // decodifica recursivamente para detectar redirects aninhados
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

function LoginPage() {
  const { redirect } = Route.useSearch();
  return (
    <LoginSignupForm initialMode="login" redirectTo={sanitizeRedirect(redirect)} />
  );
}
