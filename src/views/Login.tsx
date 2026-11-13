import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Eye, EyeOff, Moon, Sun } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { ClaudeMark } from "@/components/ClaudeMark";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const submitting = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const error = useAuthStore(s => s.error);
  const clearError = useAuthStore(s => s.clearError);

  useEffect(() => { clearError(); setTouched(false); }, [mode, clearError]);
  const emailError = touched && !EMAIL_RE.test(email.trim()) ? "请输入有效的邮箱地址" : null;
  const passwordError = touched && password.length < 6 ? "密码至少需要 6 个字符" : null;
  const nameError = touched && mode === "register" && !name.trim() ? "请输入昵称" : null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    setTouched(true);
    if (!EMAIL_RE.test(email.trim()) || password.length < 6 || (mode === "register" && !name.trim())) {
      if (!EMAIL_RE.test(email.trim())) emailRef.current?.focus();
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const auth = useAuthStore.getState();
      if (mode === "login") await auth.login(email.trim(), password);
      else await auth.register(email.trim(), password, name.trim());
    } catch { /* The auth store provides the visible error message. */ }
    finally { submitting.current = false; setBusy(false); }
  };
  return <main className="login-page" data-theme={theme}>
    <button type="button" className="login-theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={theme === "light" ? "切换为深色登录页" : "切换为浅色登录页"}>
      {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}<span>{theme === "light" ? "深色" : "浅色"}</span>
    </button>
    <div className="login-content">
      <div className="login-brand"><ClaudeMark className="h-12 w-12" /><h1>Megvii Code</h1><p>与你一起构建的编程伙伴</p></div>
      <section className="login-card" aria-label={mode === "login" ? "登录账户" : "注册账户"}>
        <div className="login-tabs" role="tablist" aria-label="账户操作">
          {(["login", "register"] as const).map(m => <button key={m} type="button" id={"auth-tab-" + m} role="tab" aria-selected={mode === m} aria-controls="auth-panel" tabIndex={mode === m ? 0 : -1} disabled={busy} onClick={() => setMode(m)} onKeyDown={e => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
              e.preventDefault();
              const next = e.key === "Home" ? "login" : e.key === "End" ? "register" : mode === "login" ? "register" : "login";
              setMode(next);
              document.getElementById("auth-tab-" + next)?.focus();
            }
          }}>{m === "login" ? "登录" : "注册"}</button>)}
        </div>
        <form id="auth-panel" role="tabpanel" aria-labelledby={"auth-tab-" + mode} noValidate onSubmit={submit}>
          <fieldset disabled={busy} className="login-fields">
            {mode === "register" && <label className="login-field" htmlFor="auth-name"><span>昵称</span><input id="auth-name" name="name" value={name} onChange={e => setName(e.target.value)} autoComplete="nickname" placeholder="怎么称呼你" aria-invalid={!!nameError} aria-describedby={nameError ? "auth-name-error" : undefined} />{nameError && <span id="auth-name-error" className="login-error">{nameError}</span>}</label>}
            <label className="login-field" htmlFor="auth-email"><span>邮箱</span><input ref={emailRef} id="auth-email" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" aria-invalid={!!emailError} aria-describedby={emailError ? "auth-email-error" : undefined} />{emailError && <span id="auth-email-error" className="login-error">{emailError}</span>}</label>
            <div className="login-field"><label htmlFor="auth-password">密码</label><div className="login-password"><input id="auth-password" name="password" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="至少 6 个字符" aria-invalid={!!passwordError} aria-describedby={passwordError ? "auth-password-error" : undefined} /><button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{passwordError && <span id="auth-password-error" className="login-error">{passwordError}</span>}</div>
            {error && <p role="alert" className="login-server-error">{error}</p>}
            <button type="submit" className="login-submit">{busy ? <><Loader2 size={16} className="animate-spin" />{mode === "login" ? "登录中…" : "注册中…"}</> : <>{mode === "login" ? "登录" : "创建账户"}<ArrowRight size={16} /></>}</button>
          </fieldset>
        </form>
      </section>
    </div>
  </main>;
}
