import { FormEvent, useState } from "react";
import "./setup.css";

type Branding={appName:string;companyName:string};
export function DatabaseSetup({ branding,onConnected }: {branding:Branding;onConnected: (needsBootstrap: boolean,branding:Branding) => void }) {
  const [form, setForm] = useState({ appName:branding.appName,companyName:branding.companyName,server: "tcp:PUBLIC_IP,1433", database: "erp", user: "sqlserver", password: "", encrypt: true, trustServerCertificate: true });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/setup/database", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      onConnected(Boolean(body.needsBootstrap),body.branding);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Koneksi SQL Server gagal."); }
    finally { setLoading(false); }
  }
  return <div className="setup-page"><div className="auth-brand"><span>{form.appName.charAt(0).toUpperCase()||"E"}</span> {form.appName}</div><form className="setup-card" onSubmit={submit}>
    <div className="setup-heading"><div className="auth-icon">▤</div><div><h1>Hubungkan SQL Server</h1><p>Koneksi harus aktif sebelum membuat akun atau login.</p></div></div>
    <div className="setup-grid"><label>Nama ERP<input value={form.appName} onChange={(e)=>setForm({...form,appName:e.target.value})} minLength={2} maxLength={40} required /></label><label>Nama Perusahaan<input value={form.companyName} onChange={(e)=>setForm({...form,companyName:e.target.value})} minLength={2} maxLength={120} required /></label></div>
    <div className="setup-command">sqlcmd -S "{form.server}" -d {form.database || "erp"} -U {form.user || "sqlserver"} -C</div>
    <label>Server (-S)<input value={form.server} onChange={(e)=>setForm({...form,server:e.target.value})} placeholder="tcp:PUBLIC_IP,1433" pattern="tcp:[^,]+,[0-9]+" required /></label>
    <div className="setup-grid"><label>Database (-d)<input value={form.database} onChange={(e)=>setForm({...form,database:e.target.value})} required /></label><label>Username (-U)<input value={form.user} onChange={(e)=>setForm({...form,user:e.target.value})} required /></label></div>
    <label>Password SQL Server<input type="password" value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})} autoComplete="current-password" required /></label>
    <div className="setup-options"><label><input type="checkbox" checked={form.encrypt} onChange={(e)=>setForm({...form,encrypt:e.target.checked})} /> Enkripsi koneksi</label><label><input type="checkbox" checked={form.trustServerCertificate} onChange={(e)=>setForm({...form,trustServerCertificate:e.target.checked})} /> Percayai sertifikat (-C)</label></div>
    {message && <div className="auth-error">{message}</div>}
    <button className="primary-button" disabled={loading}>{loading ? "Menghubungkan & menyiapkan schema..." : "Hubungkan SQL Server"}</button>
    <small className="setup-note">Setelah terhubung, {form.appName||"ERP"} menyiapkan schema lalu membuka pembuatan akun Administrator pada database ini.</small>
  </form></div>;
}
