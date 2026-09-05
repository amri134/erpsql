import { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./inventory.css";
import "./connection.css";
import "./admin/users.css";
import { DatabaseSettings } from "./settings/DatabaseSettings";
import { AuthScreen } from "./auth/AuthScreen";
import { UserManagement } from "./admin/UserManagement";

type MenuKey = "dashboard" | "inventory" | "purchasing" | "ppic" | "quality" | "finance" | "reports" | "users" | "settings";
type CurrentUser = { userId: string; username: string; fullName: string; roles: string[]; permissions: string[] };

type ConnectionConfig = {
  server: string;
  port?: number;
  database: string;
  user: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
};

const navigation: { key: MenuKey; label: string; icon: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "⌂" },
  { key: "inventory", label: "Inventory", icon: "▣" },
  { key: "purchasing", label: "Purchasing", icon: "⌁" },
  { key: "ppic", label: "PPIC & Produksi", icon: "◫" },
  { key: "quality", label: "Quality Control", icon: "✓" },
  { key: "finance", label: "Finance", icon: "◈" },
  { key: "reports", label: "Laporan", icon: "▤" },
  { key: "users", label: "User & Akses", icon: "♙" },
  { key: "settings", label: "Pengaturan", icon: "⚙" }
];

const metrics = [
  { label: "Total Nilai Inventory", value: "Rp 842,6 jt", note: "+8,4% dari bulan lalu", tone: "blue", icon: "▣" },
  { label: "Stok Perlu Perhatian", value: "18 item", note: "6 item di bawah minimum", tone: "orange", icon: "!" },
  { label: "Purchase Order Aktif", value: "24", note: "Rp 318,2 jt nilai pesanan", tone: "violet", icon: "⌁" },
  { label: "Produksi Hari Ini", value: "87,4%", note: "Terhadap target harian", tone: "green", icon: "↗" }
];

const movements = [
  ["BRG-001", "EVA Black", "Barang keluar", "-150 KG", "Produksi • 08:45", "red"],
  ["BRG-014", "Rubber Compound", "Barang masuk", "+500 KG", "Gudang Utama • 08:12", "green"],
  ["BRG-031", "Sole Model A", "Transfer stok", "240 PCS", "FG → Pengiriman • 07:56", "blue"],
  ["BRG-008", "Pigment Blue", "Stock adjustment", "+5 KG", "QC Warehouse • 07:32", "orange"]
];

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("erp_token") ?? "");
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [activeMenu, setActiveMenu] = useState<MenuKey>("dashboard");
  const [config, setConfig] = useState<ConnectionConfig>({
    server: "tcp:PUBLIC_IP,1433",
    database: "",
    user: "",
    encrypt: true,
    trustServerCertificate: true
  });
  const [password, setPassword] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/database/config", { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: ConnectionConfig) => setConfig(data))
      .catch(() => undefined);
  }, [token]);

  useEffect(() => { fetch("/api/auth/status").then((response) => response.json()).then((data) => setNeedsBootstrap(Boolean(data.needsBootstrap))).catch(() => setNeedsBootstrap(null)); }, []);

  useEffect(() => {
    if (!token) { setCurrentUser(null); return; }
    let active = true;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.message); return body.user as CurrentUser; })
      .then((user) => { if (active) setCurrentUser(user); })
      .catch(() => { if (active) { localStorage.removeItem("erp_token"); setToken(""); setCurrentUser(null); } });
    return () => { active = false; };
  }, [token]);

  const pageTitle = useMemo(() => navigation.find((item) => item.key === activeMenu)?.label ?? "Dashboard", [activeMenu]);

  async function testConnection(event: FormEvent) {
    event.preventDefault();
    setIsTesting(true);
    setConnectionResult(null);

    try {
      const response = await fetch("/api/database/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...config, password })
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.message);
      setConnectionResult({ kind: "success", message: `${data.message} Database: ${data.database}.` });
      setPassword("");
    } catch (error) {
      setConnectionResult({ kind: "error", message: error instanceof Error ? error.message : "Koneksi gagal diuji." });
    } finally {
      setIsTesting(false);
    }
  }

  function updateConfig<K extends keyof ConnectionConfig>(key: K, value: ConnectionConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function authenticated(newToken: string) { localStorage.setItem("erp_token", newToken); setToken(newToken); setNeedsBootstrap(false); }
  function logout() { localStorage.removeItem("erp_token"); setToken(""); setCurrentUser(null); }

  if (!token) return <AuthScreen needsBootstrap={needsBootstrap} onAuthenticated={authenticated} />;
  if (!currentUser) return <div className="auth-page"><div className="auth-card"><p>Memverifikasi sesi ERPJIN...</p></div></div>;

  const isAdministrator = currentUser.roles.includes("administrator");
  const canReadInventory = isAdministrator || currentUser.permissions.includes("inventory.read");
  const mainNavigation = navigation.slice(0, 7).filter((item) => item.key !== "inventory" || canReadInventory);
  const systemNavigation = navigation.slice(7).filter((item) => isAdministrator || !["users", "settings"].includes(item.key));
  const initials = currentUser.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const currentDate = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">E</span><span>ERP<span className="brand-accent">JIN</span></span></div>
        <div className="workspace"><span className="workspace-dot" /> PT Hajijin Amri <span className="chevron">⌄</span></div>
        <nav>
          <p className="nav-label">MENU UTAMA</p>
          {mainNavigation.map((item) => <button key={item.key} className={`nav-item ${activeMenu === item.key ? "active" : ""}`} onClick={() => setActiveMenu(item.key)}><span>{item.icon}</span>{item.label}</button>)}
          {systemNavigation.length > 0 && <><p className="nav-label nav-label-bottom">SISTEM</p>{systemNavigation.map((item) => <button key={item.key} className={`nav-item ${activeMenu === item.key ? "active" : ""}`} onClick={() => setActiveMenu(item.key)}><span>{item.icon}</span>{item.label}</button>)}</>}
        </nav>
        <button className="sidebar-footer logout" onClick={logout}><div className="avatar">{initials || "U"}</div><div><strong>{currentUser.fullName}</strong><small>{currentUser.roles.join(", ") || "Pengguna"} · Keluar</small></div><span className="dots">↗</span></button>
      </aside>

      <main>
        <header className="topbar"><div><p className="breadcrumb">ERPJIN / {pageTitle}</p><h1>{pageTitle}</h1></div><div className="top-actions"><button className="icon-button">⌕</button><button className="notification">♧<i /></button><span className="date">{currentDate}</span></div></header>
        <section className="content">
          {activeMenu === "dashboard" && <Dashboard name={currentUser.fullName} canAccessInventory={canReadInventory} onNavigate={setActiveMenu} />}
          {activeMenu === "inventory" && <InventoryPage token={token} />}
          {activeMenu === "users" && <UserManagement token={token} />}
          {activeMenu === "settings" && <DatabaseSettings config={config} password={password} testing={isTesting} result={connectionResult} onPassword={setPassword} onConfig={(key, value) => setConfig((current) => ({ ...current, [key]: value }))} onSubmit={testConnection} />}
          {activeMenu !== "dashboard" && activeMenu !== "settings" && activeMenu !== "inventory" && activeMenu !== "users" && <ModulePlaceholder title={pageTitle} />}
        </section>
      </main>
    </div>
  );
}

function Dashboard({ name, canAccessInventory, onNavigate }: { name: string; canAccessInventory: boolean; onNavigate: (menu: MenuKey) => void }) {
  return <>
    <div className="welcome"><div><h2>Selamat datang, {name} <span>👋</span></h2><p>Berikut ringkasan aktivitas operasional perusahaan hari ini.</p></div>{canAccessInventory && <button className="primary-button" onClick={() => onNavigate("inventory")}>＋ Transaksi Baru</button>}</div>
    <div className="metric-grid">{metrics.map((metric) => <article className="metric-card" key={metric.label}><div className={`metric-icon ${metric.tone}`}>{metric.icon}</div><div><p>{metric.label}</p><h3>{metric.value}</h3><small className={metric.tone}>{metric.note}</small></div></article>)}</div>
    <div className="dashboard-grid">
      <article className="panel movement-panel"><div className="panel-header"><div><h3>Pergerakan Stok Terkini</h3><p>Aktivitas inventory hari ini</p></div><button className="link-button" onClick={() => onNavigate("inventory")}>Lihat semua →</button></div><div className="table-wrap"><table><thead><tr><th>KODE</th><th>BARANG</th><th>AKTIVITAS</th><th>QTY</th><th>WAKTU</th></tr></thead><tbody>{movements.map(([code, item, activity, quantity, date, color]) => <tr key={code}><td className="code">{code}</td><td><strong>{item}</strong></td><td><span className={`badge ${color}`}>{activity}</span></td><td className={color === "red" ? "qty-minus" : "qty-plus"}>{quantity}</td><td className="muted">{date}</td></tr>)}</tbody></table></div></article>
      <article className="panel alerts"><div className="panel-header"><div><h3>Perlu Perhatian</h3><p>Notifikasi operasional</p></div><span className="alert-count">4</span></div><Alert title="Stok minimum tercapai" description="EVA White tinggal 120 KG" type="warning" /><Alert title="PO menunggu persetujuan" description="3 purchase request perlu review" type="info" /><Alert title="Inspeksi QC belum selesai" description="Batch PRD-0264 masih dalam proses" type="purple" /><button className="outline-button">Buka pusat notifikasi</button></article>
    </div>
    <div className="panel quick-panel"><div className="panel-header"><div><h3>Akses Cepat</h3><p>Mulai aktivitas umum dalam satu klik</p></div></div><div className="quick-actions"><Quick icon="＋" title="Barang Masuk" tone="blue" /><Quick icon="−" title="Barang Keluar" tone="orange" /><Quick icon="⌁" title="Purchase Request" tone="violet" /><Quick icon="✓" title="Inspeksi QC" tone="green" /></div></div>
  </>;
}

function Settings({ config, password, testing, result, onPassword, onConfig, onSubmit }: { config: ConnectionConfig; password: string; testing: boolean; result: { kind: "success" | "error"; message: string } | null; onPassword: (value: string) => void; onConfig: <K extends keyof ConnectionConfig>(key: K, value: ConnectionConfig[K]) => void; onSubmit: (event: FormEvent) => void }) {
  return <div className="settings-layout"><section><div className="welcome compact"><div><h2>Pengaturan Sistem</h2><p>Kelola konfigurasi umum dan koneksi ERP Anda.</p></div></div><div className="settings-tabs"><button className="tab active">Koneksi Database</button><button className="tab">Profil Perusahaan</button><button className="tab">Notifikasi</button></div><form className="panel connection-panel" onSubmit={onSubmit}><div className="connection-heading"><div className="db-symbol">▤</div><div><h3>Microsoft SQL Server</h3><p>Uji koneksi sebelum konfigurasi disimpan.</p></div><span className="environment">ENVIRONMENT</span></div><div className="form-grid"><label>Host / Server<input value={config.server} onChange={(event) => onConfig("server", event.target.value)} placeholder="Contoh: 35.247.180.186" required /></label><label>Port<input type="number" value={config.port} onChange={(event) => onConfig("port", Number(event.target.value))} min="1" max="65535" required /></label><label>Nama Database<input value={config.database} onChange={(event) => onConfig("database", event.target.value)} placeholder="ERPDB" required /></label><label>Username<input value={config.user} onChange={(event) => onConfig("user", event.target.value)} placeholder="erp_admin" required /></label><label className="full">Password<input type="password" value={password} onChange={(event) => onPassword(event.target.value)} placeholder="Masukkan password SQL Server untuk menyimpan perubahan" autoComplete="current-password" required /></label></div><div className="switch-row"><label className="switch-label"><input type="checkbox" checked={config.encrypt} onChange={(event) => onConfig("encrypt", event.target.checked)} /><span className="switch" />Enkripsi koneksi</label><label className="switch-label"><input type="checkbox" checked={config.trustServerCertificate} onChange={(event) => onConfig("trustServerCertificate", event.target.checked)} /><span className="switch" />Percayai sertifikat server</label></div>{result && <div className={`connection-result ${result.kind}`}>{result.kind === "success" ? "✓" : "!"}<span>{result.message}</span></div>}<div className="form-actions"><p>🔒 Konfigurasi disimpan hanya jika uji koneksi berhasil.</p><button className="primary-button" type="submit" disabled={testing}>{testing ? "Menguji koneksi..." : "Uji & Simpan Koneksi"}</button></div></form></section><aside className="settings-side"><article className="panel"><h3>Petunjuk Koneksi</h3><ol><li>Isi atau ubah konfigurasi.</li><li>Masukkan password untuk validasi.</li><li>Klik Uji & Simpan.</li><li>Jika gagal, koreksi lalu coba kembali.</li></ol></article><article className="security-note"><span>⌁</span><div><strong>Konfigurasi tersimpan</strong><p>Host dan opsi koneksi dapat diedit kapan saja melalui halaman ini.</p></div></article></aside></div>;
}

function InventoryPage({ token }: { token: string }) {
  type Item = { itemId: string; code: string; name: string; unit: string; currentStock: number; minimumStock: number };
  const [data, setData] = useState<{ summary: { totalItems: number; lowStock: number }; items: Item[] } | null>(null);
  const [masters, setMasters] = useState<{ categories: { categoryId: number; name: string }[]; units: { unitId: number; code: string }[]; warehouses: { warehouseId: number; name: string }[] } | null>(null);
  const [mode, setMode] = useState<"item" | "transaction" | null>(null);
  const [message, setMessage] = useState("Memuat data inventory...");
  const [itemForm, setItemForm] = useState({ code: "", name: "", categoryId: "", unitId: "", minimumStock: "0" });
  const [transactionForm, setTransactionForm] = useState({ itemId: "", warehouseId: "", type: "IN", quantity: "", referenceNumber: "", notes: "" });
  const load = async () => { try { const headers = { Authorization: `Bearer ${token}` }; const [overviewResponse, masterResponse] = await Promise.all([fetch("/api/inventory/overview", { headers }), fetch("/api/inventory/master-data", { headers })]); const overview = await overviewResponse.json(); const master = await masterResponse.json(); if (!overviewResponse.ok) throw new Error(overview.message); if (!masterResponse.ok) throw new Error(master.message); setData(overview); setMasters(master); } catch (error) { setMessage(error instanceof Error ? error.message : "Data gagal dimuat."); } };
  useEffect(() => { void load(); }, []);
  const submit = async (event: FormEvent) => { event.preventDefault(); const endpoint = mode === "item" ? "/api/inventory/items" : "/api/inventory/transactions"; const payload = mode === "item" ? itemForm : transactionForm; const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) }); const body = await response.json(); setMessage(body.message); if (response.ok) { setMode(null); await load(); } };
  return <><div className="welcome"><div><h2>Inventory</h2><p>Master barang dan posisi stok berdasarkan histori transaksi.</p></div><div className="inventory-actions"><button className="outline-button" onClick={() => setMode("transaction")}>＋ Transaksi Stok</button><button className="primary-button" onClick={() => setMode("item")}>＋ Tambah Barang</button></div></div>
    {mode && <form className="panel entry-form" onSubmit={submit}><div className="panel-header"><div><h3>{mode === "item" ? "Tambah Master Barang" : "Barang Masuk / Keluar"}</h3><p>{mode === "item" ? "Lengkapi identitas dan batas minimum stok." : "Setiap transaksi akan tersimpan sebagai histori stok."}</p></div><button type="button" className="link-button" onClick={() => setMode(null)}>Tutup ×</button></div>{mode === "item" ? <div className="form-grid"><label>Kode Barang<input value={itemForm.code} onChange={(e) => setItemForm({...itemForm,code:e.target.value})} required /></label><label>Nama Barang<input value={itemForm.name} onChange={(e) => setItemForm({...itemForm,name:e.target.value})} required /></label><label>Kategori<select value={itemForm.categoryId} onChange={(e) => setItemForm({...itemForm,categoryId:e.target.value})} required><option value="">Pilih kategori</option>{masters?.categories.map(v=><option key={v.categoryId} value={v.categoryId}>{v.name}</option>)}</select></label><label>Satuan<select value={itemForm.unitId} onChange={(e) => setItemForm({...itemForm,unitId:e.target.value})} required><option value="">Pilih satuan</option>{masters?.units.map(v=><option key={v.unitId} value={v.unitId}>{v.code}</option>)}</select></label><label>Minimum Stok<input type="number" min="0" step="0.001" value={itemForm.minimumStock} onChange={(e) => setItemForm({...itemForm,minimumStock:e.target.value})} required /></label></div> : <div className="form-grid"><label>Barang<select value={transactionForm.itemId} onChange={(e) => setTransactionForm({...transactionForm,itemId:e.target.value})} required><option value="">Pilih barang</option>{data?.items.map(v=><option key={v.itemId} value={v.itemId}>{v.code} — {v.name}</option>)}</select></label><label>Gudang<select value={transactionForm.warehouseId} onChange={(e) => setTransactionForm({...transactionForm,warehouseId:e.target.value})} required><option value="">Pilih gudang</option>{masters?.warehouses.map(v=><option key={v.warehouseId} value={v.warehouseId}>{v.name}</option>)}</select></label><label>Jenis Transaksi<select value={transactionForm.type} onChange={(e) => setTransactionForm({...transactionForm,type:e.target.value})}><option value="IN">Barang Masuk</option><option value="OUT">Barang Keluar</option><option value="ADJUSTMENT">Penyesuaian Tambah</option></select></label><label>Jumlah<input type="number" min="0.001" step="0.001" value={transactionForm.quantity} onChange={(e) => setTransactionForm({...transactionForm,quantity:e.target.value})} required /></label><label>No. Referensi<input value={transactionForm.referenceNumber} onChange={(e) => setTransactionForm({...transactionForm,referenceNumber:e.target.value})} /></label><label>Catatan<input value={transactionForm.notes} onChange={(e) => setTransactionForm({...transactionForm,notes:e.target.value})} /></label></div>}<div className="form-submit"><span className="muted">{message}</span><button className="primary-button" type="submit">Simpan</button></div></form>}
    <div className="metric-grid"><article className="metric-card"><div className="metric-icon blue">▣</div><div><p>Total Barang Aktif</p><h3>{data?.summary.totalItems ?? "—"}</h3><small className="blue">Master inventory</small></div></article><article className="metric-card"><div className="metric-icon orange">!</div><div><p>Stok Perlu Perhatian</p><h3>{data?.summary.lowStock ?? "—"}</h3><small className="orange">Di bawah batas minimum</small></div></article></div><article className="panel"><div className="panel-header"><div><h3>Daftar Barang</h3><p>Stok dihitung dari seluruh transaksi inventory.</p></div></div>{data ? <div className="table-wrap"><table><thead><tr><th>KODE</th><th>BARANG</th><th>STOK SAAT INI</th><th>MINIMUM</th><th>STATUS</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.itemId}><td className="code">{item.code}</td><td><strong>{item.name}</strong></td><td>{item.currentStock} {item.unit}</td><td>{item.minimumStock} {item.unit}</td><td><span className={`badge ${item.currentStock <= item.minimumStock ? "red" : "green"}`}>{item.currentStock <= item.minimumStock ? "Perlu perhatian" : "Aman"}</span></td></tr>)}</tbody></table></div> : <p className="muted">{message}</p>}</article></>;
}

function ModulePlaceholder({ title }: { title: string }) { return <div className="module-placeholder panel"><div className="placeholder-icon">◫</div><h2>{title}</h2><p>Modul ini sudah disiapkan pada navigasi dashboard dan akan dikembangkan setelah fondasi akses pengguna selesai.</p><button className="primary-button">Lihat rencana modul</button></div>; }
function Alert({ title, description, type }: { title: string; description: string; type: string }) { return <div className="alert-item"><span className={`alert-icon ${type}`}>!</span><div><strong>{title}</strong><p>{description}</p></div><button>›</button></div>; }
function Quick({ icon, title, tone }: { icon: string; title: string; tone: string }) { return <button className="quick"><span className={`quick-icon ${tone}`}>{icon}</span><span>{title}</span><i>→</i></button>; }

createRoot(document.getElementById("root")!).render(<App />);
