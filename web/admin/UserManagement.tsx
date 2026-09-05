import { FormEvent, useEffect, useState } from "react";

type User = { userId: string; username: string; fullName: string; email: string | null; isActive: boolean; departmentId: number | null; departmentName: string | null; roles: string | null; roleIds: number[] };
type Option = { roleId?: number; departmentId?: number; code: string; name: string };
type Permission = { permissionId: number; code: string; name: string; description: string | null };
type ManagedRole = { roleId: number; code: string; name: string; description: string | null; isSystemRole: boolean; permissionIds: number[] };
type Form = { username: string; fullName: string; email: string; password: string; departmentId: string; roleId: string };

const emptyForm: Form = { username: "", fullName: "", email: "", password: "", departmentId: "", roleId: "" };

export function UserManagement({ token }: { token: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [roles, setRoles] = useState<Option[]>([]);
  const [managedRoles, setManagedRoles] = useState<ManagedRole[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>([]);
  const [section, setSection] = useState<"users" | "roles">("users");
  const [form, setForm] = useState<Form>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editDepartmentId, setEditDepartmentId] = useState("");
  const [editRoleIds, setEditRoleIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  async function load() {
    setLoading(true);
    try {
      const [usersResponse, optionsResponse, rolesResponse] = await Promise.all([
        fetch("/api/admin/users", { headers }),
        fetch("/api/admin/access-options", { headers }),
        fetch("/api/admin/roles", { headers })
      ]);
      const usersBody = await usersResponse.json();
      const optionsBody = await optionsResponse.json();
      const rolesBody = await rolesResponse.json();
      if (!usersResponse.ok) throw new Error(usersBody.message);
      if (!optionsResponse.ok) throw new Error(optionsBody.message);
      if (!rolesResponse.ok) throw new Error(rolesBody.message);
      setUsers(usersBody.users);
      setDepartments(optionsBody.departments);
      setRoles(optionsBody.roles);
      setManagedRoles(rolesBody.roles);
      setPermissions(rolesBody.permissions);
      const currentRoleId = selectedRoleId ?? rolesBody.roles[0]?.roleId ?? null;
      const currentRole = rolesBody.roles.find((role: ManagedRole) => role.roleId === currentRoleId);
      setSelectedRoleId(currentRoleId);
      setSelectedPermissionIds(currentRole?.permissionIds ?? []);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Data pengguna gagal dimuat.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/users", { method: "POST", headers, body: JSON.stringify(form) });
    const body = await response.json();
    setMessage(body.message);
    if (response.ok) { setForm(emptyForm); setShowForm(false); await load(); }
  }

  async function updateStatus(user: User) {
    const response = await fetch(`/api/admin/users/${user.userId}/status`, { method: "PATCH", headers, body: JSON.stringify({ isActive: !user.isActive }) });
    const body = await response.json();
    setMessage(body.message);
    if (response.ok) await load();
  }

  function beginAccessEdit(user: User) {
    setEditingUser(user);
    setEditDepartmentId(user.departmentId === null ? "" : String(user.departmentId));
    setEditRoleIds(user.roleIds);
    setMessage("");
  }

  function toggleUserRole(roleId: number) {
    setEditRoleIds((current) => current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId]);
  }

  async function saveUserAccess(event: FormEvent) {
    event.preventDefault();
    if (!editingUser) return;
    const response = await fetch(`/api/admin/users/${editingUser.userId}/access`, { method: "PUT", headers, body: JSON.stringify({ departmentId: editDepartmentId, roleIds: editRoleIds }) });
    const body = await response.json();
    setMessage(body.message);
    if (response.ok) { setEditingUser(null); await load(); }
  }

  function selectRole(roleId: number) {
    const role = managedRoles.find((item) => item.roleId === roleId);
    setSelectedRoleId(roleId);
    setSelectedPermissionIds(role?.permissionIds ?? []);
    setMessage("");
  }

  function togglePermission(permissionId: number) {
    setSelectedPermissionIds((current) => current.includes(permissionId) ? current.filter((id) => id !== permissionId) : [...current, permissionId]);
  }

  async function savePermissions() {
    if (selectedRoleId === null) return;
    const response = await fetch(`/api/admin/roles/${selectedRoleId}/permissions`, { method: "PUT", headers, body: JSON.stringify({ permissionIds: selectedPermissionIds }) });
    const body = await response.json();
    setMessage(body.message);
    if (response.ok) await load();
  }

  const update = (key: keyof Form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const selectedRole = managedRoles.find((role) => role.roleId === selectedRoleId);
  const administratorLocked = selectedRole?.code === "administrator";

  return <>
    <div className="welcome"><div><h2>User & Akses</h2><p>Kelola akun, departemen, role, dan permission ERP.</p></div>{section === "users" && <button className="primary-button" onClick={() => setShowForm((value) => !value)}>{showForm ? "Tutup Form" : "＋ Tambah Pengguna"}</button>}</div>
    <div className="access-tabs"><button className={section === "users" ? "active" : ""} onClick={() => setSection("users")}>Pengguna</button><button className={section === "roles" ? "active" : ""} onClick={() => setSection("roles")}>Role & Permission</button></div>
    {section === "users" && <>
    {editingUser && <form className="panel user-form access-edit-form" onSubmit={saveUserAccess}>
      <div className="panel-header"><div><h3>Atur Akses — {editingUser.fullName}</h3><p>Pilih departemen dan satu atau beberapa role.</p></div><button className="link-button" type="button" onClick={() => setEditingUser(null)}>Batal</button></div>
      <div className="form-grid"><label className="full">Departemen<select value={editDepartmentId} onChange={(event) => setEditDepartmentId(event.target.value)} required><option value="">Pilih departemen</option>{departments.map((item) => <option key={item.departmentId} value={item.departmentId}>{item.name}</option>)}</select></label></div>
      <div className="user-role-grid">{roles.map((role) => <label key={role.roleId}><input type="checkbox" checked={role.roleId !== undefined && editRoleIds.includes(role.roleId)} onChange={() => role.roleId !== undefined && toggleUserRole(role.roleId)} /><span>{role.name}</span></label>)}</div>
      <div className="form-actions"><p>Minimal satu role harus dipilih.</p><button className="primary-button" disabled={!editDepartmentId || !editRoleIds.length}>Simpan Akses</button></div>
    </form>}
    {showForm && <form className="panel user-form" onSubmit={submit}>
      <div className="panel-header"><div><h3>Pengguna Baru</h3><p>Password disimpan dalam bentuk hash bcrypt.</p></div></div>
      <div className="form-grid">
        <label>Nama Lengkap<input value={form.fullName} onChange={(event) => update("fullName", event.target.value)} required minLength={3} /></label>
        <label>Username<input value={form.username} onChange={(event) => update("username", event.target.value)} required minLength={3} /></label>
        <label>Email (opsional)<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></label>
        <label>Password Awal<input type="password" value={form.password} onChange={(event) => update("password", event.target.value)} required minLength={8} /></label>
        <label>Departemen<select value={form.departmentId} onChange={(event) => update("departmentId", event.target.value)} required><option value="">Pilih departemen</option>{departments.map((item) => <option key={item.departmentId} value={item.departmentId}>{item.name}</option>)}</select></label>
        <label>Role<select value={form.roleId} onChange={(event) => update("roleId", event.target.value)} required><option value="">Pilih role</option>{roles.map((item) => <option key={item.roleId} value={item.roleId}>{item.name}</option>)}</select></label>
      </div>
      <div className="form-actions"><p>Role menentukan akses awal pengguna.</p><button className="primary-button" type="submit">Simpan Pengguna</button></div>
    </form>}
    {message && <div className="connection-result user-message"><span>{message}</span></div>}
    <article className="panel"><div className="panel-header"><div><h3>Daftar Pengguna</h3><p>{users.length} akun terdaftar</p></div></div>
      {loading ? <p className="muted">Memuat pengguna...</p> : users.length ? <div className="table-wrap"><table><thead><tr><th>PENGGUNA</th><th>DEPARTEMEN</th><th>ROLE</th><th>STATUS</th><th>AKSI</th></tr></thead><tbody>{users.map((user) => <tr key={user.userId}><td><strong>{user.fullName}</strong><div className="muted">@{user.username}{user.email ? ` · ${user.email}` : ""}</div></td><td>{user.departmentName ?? "—"}</td><td>{user.roles ?? "Tanpa role"}</td><td><span className={`badge ${user.isActive ? "green" : "red"}`}>{user.isActive ? "Aktif" : "Nonaktif"}</span></td><td><div className="table-actions"><button className="link-button" onClick={() => beginAccessEdit(user)}>Atur akses</button><button className="link-button" onClick={() => updateStatus(user)}>{user.isActive ? "Nonaktifkan" : "Aktifkan"}</button></div></td></tr>)}</tbody></table></div> : <p className="muted">Belum ada pengguna.</p>}
    </article></>}
    {section === "roles" && <div className="role-layout">
      <aside className="panel role-list"><div className="panel-header"><div><h3>Daftar Role</h3><p>Pilih role untuk mengatur akses.</p></div></div>{managedRoles.map((role) => <button key={role.roleId} className={selectedRoleId === role.roleId ? "active" : ""} onClick={() => selectRole(role.roleId)}><strong>{role.name}</strong><small>{role.permissionIds.length} permission</small></button>)}</aside>
      <section className="panel permission-editor"><div className="panel-header"><div><h3>{selectedRole?.name ?? "Pilih role"}</h3><p>{selectedRole?.description ?? "Atur hak akses untuk role ini."}</p></div>{administratorLocked && <span className="badge blue">Akses penuh dikunci</span>}</div>
        <div className="permission-grid">{permissions.map((permission) => <label key={permission.permissionId} className={administratorLocked ? "locked" : ""}><input type="checkbox" checked={selectedPermissionIds.includes(permission.permissionId)} disabled={administratorLocked} onChange={() => togglePermission(permission.permissionId)} /><span><strong>{permission.name}</strong><small>{permission.code}</small><p>{permission.description}</p></span></label>)}</div>
        <div className="form-actions"><p>{administratorLocked ? "Administrator selalu memiliki seluruh permission." : `${selectedPermissionIds.length} permission dipilih.`}</p><button className="primary-button" type="button" disabled={!selectedRole || administratorLocked} onClick={savePermissions}>Simpan Permission</button></div>
      </section>
    </div>}
  </>;
}
