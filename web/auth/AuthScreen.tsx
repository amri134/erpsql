import { FormEvent, useState } from "react";
import "./auth.css";

export function AuthScreen({ needsBootstrap, onAuthenticated }: { needsBootstrap: boolean | null; onAuthenticated: (token: string) => void }) {
  const [form, setForm] = useState({ fullName: "", username: "", password: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setLoading(true); setMessage(""); try { const response = await fetch(needsBootstrap ? "/api/auth/bootstrap" : "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const body = await response.json(); if (!response.ok) throw new Error(body.message); onAuthenticated(body.token); } catch (error) { setMessage(error instanceof Error ? error.message : "Autentikasi gagal."); } finally { setLoading(false); } }
  if (needsBootstrap === null) return <div className="auth-page"><div className="auth-card"><p>Memeriksa konfigurasi ERP...</p></div></div>;
  return <div className="auth-page"><div className="auth-brand"><span>E</span> ERP Nexus</div><form className="auth-card" onSubmit={submit}><div className="auth-icon">⌁</div><h1>{needsBootstrap ? "Buat Administrator" : "Masuk ke ERP"}</h1><p>{needsBootstrap ? "Siapkan akun pertama untuk mengelola sistem." : "Gunakan akun ERP Anda untuk melanjutkan."}</p>{needsBootstrap && <label>Nama lengkap<input value={form.fullName} onChange={(e)=>setForm({...form,fullName:e.target.value})} minLength={3} required /></label>}<label>Username<input value={form.username} onChange={(e)=>setForm({...form,username:e.target.value})} minLength={3} autoComplete="username" required /></label><label>Password<input type="password" value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})} minLength={8} autoComplete={needsBootstrap ? "new-password" : "current-password"} required /></label>{message && <div className="auth-error">{message}</div>}<button className="primary-button" disabled={loading}>{loading ? "Memproses..." : needsBootstrap ? "Buat akun & masuk" : "Masuk"}</button></form></div>;
}
