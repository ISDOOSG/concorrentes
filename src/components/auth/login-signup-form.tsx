import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { User, Lock, Mail } from "lucide-react";
import { toast } from "sonner";

import { getSession, signInWithPassword, signUp, ApiError } from "@/lib/api-client";
import {
  loginSchema,
  signupSchema,
  type LoginInput,
  type SignupInput,
} from "@/lib/schemas/auth";

import "./login-signup-form.css";

type Mode = "login" | "register";

type Props = {
  initialMode?: Mode;
  redirectTo?: string;
};

export function LoginSignupForm({
  initialMode = "login",
  redirectTo = "/dashboard",
}: Props) {
  const [isActive, setIsActive] = useState(initialMode === "register");
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    getSession().then((session) => {
      if (mounted && session) {
        navigate({ to: redirectTo, replace: true });
      }
    });
    return () => {
      mounted = false;
    };
  }, [navigate, redirectTo]);

  const loginForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signupForm = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", email: "", password: "" },
  });

  const submitLogin = loginForm.handleSubmit(async (values) => {
    try {
      await signInWithPassword(values.email, values.password);
    } catch {
      toast.error("E-mail ou senha incorretos");
      return;
    }
    toast.success("Bem-vindo de volta!");
    navigate({ to: redirectTo });
  });

  const submitSignup = signupForm.handleSubmit(async (values) => {
    try {
      await signUp(values.email, values.password, values.fullName?.trim() || undefined);
    } catch (e) {
      let msg = "Não foi possível criar a conta";
      if (e instanceof ApiError) {
        // 403 aqui e o bootstrap-only: so o primeiro usuario cadastra
        // direto, os demais entram por convite. Mensagem ja vem pronta
        // da API.
        msg = e.message || msg;
      }
      toast.error(msg);
      return;
    }
    toast.success("Conta criada! Você já está dentro.");
    navigate({ to: redirectTo });
  });

  return (
    <div className="auth-page">
      <div className={`auth-container${isActive ? " active" : ""}`}>
        <div className="auth-brand">
          <span className="auth-brand-mark">AC</span>
          <span>Análise de Concorrentes</span>
        </div>

        {/* Login Form */}
        <div className="auth-form-box login">
          <form className="auth-form-inner" onSubmit={submitLogin} noValidate>
            <h1>Entrar</h1>
            <p>Acesse sua conta para monitorar seus concorrentes</p>

            <div className="auth-input-box">
              <input
                type="email"
                autoComplete="email"
                placeholder="E-mail"
                disabled={loginForm.formState.isSubmitting}
                {...loginForm.register("email")}
              />
              <span className="auth-input-icon" aria-hidden="true">
                <Mail size={20} strokeWidth={1.75} />
              </span>
              {loginForm.formState.errors.email && (
                <div className="auth-error">
                  {loginForm.formState.errors.email.message}
                </div>
              )}
            </div>

            <div className="auth-input-box">
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Senha"
                disabled={loginForm.formState.isSubmitting}
                {...loginForm.register("password")}
              />
              <span className="auth-input-icon" aria-hidden="true">
                <Lock size={20} strokeWidth={1.75} />
              </span>
              {loginForm.formState.errors.password && (
                <div className="auth-error">
                  {loginForm.formState.errors.password.message}
                </div>
              )}
            </div>

            <div className="auth-forgot-link">
              <button
                type="button"
                onClick={() =>
                  toast.info("Recuperação de senha em breve")
                }
              >
                Esqueceu a senha?
              </button>
            </div>

            <button
              type="submit"
              className="auth-btn"
              disabled={loginForm.formState.isSubmitting}
            >
              {loginForm.formState.isSubmitting && (
                <span className="auth-btn-spinner" aria-hidden="true" />
              )}
              Entrar
            </button>
          </form>
        </div>

        {/* Register Form */}
        <div className="auth-form-box register">
          <form className="auth-form-inner" onSubmit={submitSignup} noValidate>
            <h1>Criar conta</h1>
            <p>Em poucos minutos você começa a monitorar concorrentes</p>

            <div className="auth-input-box">
              <input
                type="text"
                autoComplete="name"
                placeholder="Nome (opcional)"
                disabled={signupForm.formState.isSubmitting}
                {...signupForm.register("fullName")}
              />
              <span className="auth-input-icon" aria-hidden="true">
                <User size={20} strokeWidth={1.75} />
              </span>
              {signupForm.formState.errors.fullName && (
                <div className="auth-error">
                  {signupForm.formState.errors.fullName.message}
                </div>
              )}
            </div>

            <div className="auth-input-box">
              <input
                type="email"
                autoComplete="email"
                placeholder="E-mail"
                disabled={signupForm.formState.isSubmitting}
                {...signupForm.register("email")}
              />
              <span className="auth-input-icon" aria-hidden="true">
                <Mail size={20} strokeWidth={1.75} />
              </span>
              {signupForm.formState.errors.email && (
                <div className="auth-error">
                  {signupForm.formState.errors.email.message}
                </div>
              )}
            </div>

            <div className="auth-input-box">
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Senha (mín. 8 caracteres)"
                disabled={signupForm.formState.isSubmitting}
                {...signupForm.register("password")}
              />
              <span className="auth-input-icon" aria-hidden="true">
                <Lock size={20} strokeWidth={1.75} />
              </span>
              {signupForm.formState.errors.password && (
                <div className="auth-error">
                  {signupForm.formState.errors.password.message}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="auth-btn"
              disabled={signupForm.formState.isSubmitting}
            >
              {signupForm.formState.isSubmitting && (
                <span className="auth-btn-spinner" aria-hidden="true" />
              )}
              Criar conta
            </button>
          </form>
        </div>

        {/* Toggle Box */}
        <div className="auth-toggle-box">
          <div className="auth-toggle-panel toggle-left">
            <h1>Olá!</h1>
            <p>Ainda não tem conta? Cadastre-se em segundos.</p>
            <button
              type="button"
              className="auth-btn"
              onClick={() => setIsActive(true)}
            >
              Cadastrar
            </button>
          </div>
          <div className="auth-toggle-panel toggle-right">
            <h1>Já tem conta?</h1>
            <p>Acesse para ver o que mudou nos seus concorrentes.</p>
            <button
              type="button"
              className="auth-btn"
              onClick={() => setIsActive(false)}
            >
              Entrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginSignupForm;
