import express from "express";
import sql from "mssql";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { env, hasConfiguredDatabase, saveDatabaseConnection, setDatabaseConnection } from "./config/env.js";
import { runMigrations } from "./database/migrations.js";
import { activateDatabaseConnection, checkDatabaseConnection, closeDatabaseConnection, getDatabasePool } from "./database/sql-server.js";

export const app = express();

app.use(express.json());

type AuthenticatedUser = { userId: string; username: string; fullName: string; roles: string[]; permissions: string[] };
type AuthenticatedRequest = express.Request & { auth?: AuthenticatedUser };
async function requireAuth(request: AuthenticatedRequest, response: express.Response, next: express.NextFunction) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) { response.status(401).json({ message: "Silakan login terlebih dahulu." }); return; }
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as { userId?: string };
    if (!decoded.userId) throw new Error("INVALID_TOKEN");
    const connection = await getDatabasePool();
    const result = await connection.request().input("userId", sql.UniqueIdentifier, decoded.userId).query<{ userId: string; username: string; fullName: string; roles: string | null; permissions: string | null }>(`
      SELECT u.user_id AS userId,u.username,u.full_name AS fullName,
        (SELECT STRING_AGG(role_codes.code,',') FROM (SELECT DISTINCT r.code FROM dbo.user_roles ur JOIN dbo.roles r ON r.role_id=ur.role_id WHERE ur.user_id=u.user_id) role_codes) AS roles,
        (SELECT STRING_AGG(permission_codes.code,',') FROM (SELECT DISTINCT p.code FROM dbo.user_roles ur JOIN dbo.role_permissions rp ON rp.role_id=ur.role_id JOIN dbo.permissions p ON p.permission_id=rp.permission_id WHERE ur.user_id=u.user_id) permission_codes) AS permissions
      FROM dbo.users u WHERE u.user_id=@userId AND u.is_active=1;
    `);
    const user = result.recordset[0];
    if (!user) { response.status(401).json({ message: "Akun tidak aktif atau tidak ditemukan." }); return; }
    request.auth = { userId: user.userId, username: user.username, fullName: user.fullName, roles: user.roles?.split(",") ?? [], permissions: user.permissions?.split(",") ?? [] };
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError || (error instanceof Error && error.message === "INVALID_TOKEN")) {
      response.status(401).json({ message: "Sesi tidak valid atau sudah berakhir." });
      return;
    }
    console.error("Authentication check failed:", error);
    response.status(503).json({ message: "Sesi tidak dapat diverifikasi karena database tidak tersedia." });
  }
}

function requireAdministrator(request: AuthenticatedRequest, response: express.Response, next: express.NextFunction) {
  if (!request.auth?.roles.includes("administrator")) {
    response.status(403).json({ message: "Fitur ini hanya dapat diakses Administrator." });
    return;
  }
  next();
}

function requirePermission(permissionCode: string) {
  return async (request: AuthenticatedRequest, response: express.Response, next: express.NextFunction) => {
    if (request.auth?.roles.includes("administrator")) { next(); return; }
    try {
      const connection = await getDatabasePool();
      if (!request.auth?.permissions.includes(permissionCode)) { response.status(403).json({ message: "Anda tidak memiliki permission untuk fitur ini." }); return; }
      next();
    } catch (error) {
      console.error("Permission check failed:", error);
      response.status(503).json({ message: "Permission pengguna gagal diverifikasi." });
    }
  };
}

app.get("/api/auth/status", async (_request, response) => {
  try {
    const connection = await getDatabasePool();
    const result = await connection.request().query<{ userCount: number }>("SELECT COUNT(*) AS userCount FROM dbo.users;");
    response.json({ needsBootstrap: result.recordset[0].userCount === 0 });
  } catch { response.status(503).json({ message: "Jalankan migrasi database terlebih dahulu." }); }
});

app.post("/api/auth/bootstrap", async (request, response) => {
  const { username, fullName, password } = request.body ?? {};
  if (typeof username !== "string" || username.trim().length < 3 || typeof fullName !== "string" || fullName.trim().length < 3 || typeof password !== "string" || password.length < 8) { response.status(400).json({ message: "Nama dan username minimal 3 karakter; password minimal 8 karakter." }); return; }
  try {
    const connection = await getDatabasePool();
    const count = await connection.request().query<{ total: number }>("SELECT COUNT(*) AS total FROM dbo.users;");
    if (count.recordset[0].total > 0) { response.status(409).json({ message: "Administrator pertama sudah dibuat." }); return; }
    const hash = await bcrypt.hash(password, 12);
    const created = await connection.request().input("username", sql.NVarChar(50), username.trim()).input("fullName", sql.NVarChar(150), fullName.trim()).input("hash", sql.NVarChar(255), hash).query<{ userId: string }>(`
      DECLARE @newUsers TABLE(user_id UNIQUEIDENTIFIER); INSERT dbo.users(username,full_name,password_hash,department_id) OUTPUT inserted.user_id INTO @newUsers VALUES(@username,@fullName,@hash,(SELECT TOP 1 department_id FROM dbo.departments WHERE code=N'IT'));
      INSERT dbo.user_roles(user_id,role_id) SELECT user_id,(SELECT role_id FROM dbo.roles WHERE code=N'administrator') FROM @newUsers; SELECT user_id AS userId FROM @newUsers;
    `);
    const userId = created.recordset[0].userId;
    const token = jwt.sign({ userId }, env.jwtSecret, { expiresIn: "8h" });
    response.status(201).json({ token, user: { userId, username: username.trim(), fullName: fullName.trim(), roles: ["administrator"] } });
  } catch (error) { console.error("Bootstrap admin failed:", error); response.status(500).json({ message: "Administrator gagal dibuat." }); }
});

app.post("/api/auth/login", async (request, response) => {
  const { username, password } = request.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") { response.status(400).json({ message: "Username dan password wajib diisi." }); return; }
  try {
    const connection = await getDatabasePool();
    const result = await connection.request().input("username", sql.NVarChar(50), username.trim()).query<{ userId: string; username: string; fullName: string; passwordHash: string; roles: string | null }>(`
      SELECT u.user_id AS userId,u.username,u.full_name AS fullName,u.password_hash AS passwordHash,STRING_AGG(r.code,',') AS roles FROM dbo.users u LEFT JOIN dbo.user_roles ur ON ur.user_id=u.user_id LEFT JOIN dbo.roles r ON r.role_id=ur.role_id WHERE u.username=@username AND u.is_active=1 GROUP BY u.user_id,u.username,u.full_name,u.password_hash;
    `);
    const user = result.recordset[0];
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) { response.status(401).json({ message: "Username atau password ERP salah." }); return; }
    const roles = user.roles?.split(",") ?? [];
    await connection.request().input("userId", sql.UniqueIdentifier, user.userId)
      .query("UPDATE dbo.users SET last_login_at=SYSUTCDATETIME() WHERE user_id=@userId; INSERT dbo.audit_logs(user_id,action,entity_type,entity_id) VALUES(@userId,N'auth.login',N'user',CONVERT(NVARCHAR(100),@userId));");
    const token = jwt.sign({ userId: user.userId }, env.jwtSecret, { expiresIn: "8h" });
    response.json({ token, user: { userId: user.userId, username: user.username, fullName: user.fullName, roles } });
  } catch (error) {
    console.error("Login database connection failed:", error);
    response.status(503).json({ message: "Login belum dapat diproses karena SQL Server tidak dapat dihubungi." });
  }
});

app.get("/api/auth/me", requireAuth, (request: AuthenticatedRequest, response) => response.json({ user: request.auth }));

app.get("/api/admin/access-options", requireAuth, requireAdministrator, async (_request, response) => {
  try {
    const connection = await getDatabasePool();
    const [departments, roles] = await Promise.all([
      connection.request().query("SELECT department_id AS departmentId, code, name FROM dbo.departments WHERE is_active=1 ORDER BY name;"),
      connection.request().query("SELECT role_id AS roleId, code, name, description FROM dbo.roles ORDER BY name;")
    ]);
    response.json({ departments: departments.recordset, roles: roles.recordset });
  } catch (error) {
    console.error("Access options failed:", error);
    response.status(503).json({ message: "Data role dan departemen belum tersedia." });
  }
});

app.get("/api/admin/users", requireAuth, requireAdministrator, async (_request, response) => {
  try {
    const connection = await getDatabasePool();
    const result = await connection.request().query(`
      SELECT u.user_id AS userId, u.username, u.full_name AS fullName, u.email,
        u.is_active AS isActive, u.created_at AS createdAt, u.department_id AS departmentId,
        d.name AS departmentName,
        STRING_AGG(r.name, ', ') WITHIN GROUP (ORDER BY r.name) AS roles,
        STRING_AGG(CONVERT(NVARCHAR(20),r.role_id), ',') WITHIN GROUP (ORDER BY r.name) AS roleIds
      FROM dbo.users u
      LEFT JOIN dbo.departments d ON d.department_id=u.department_id
      LEFT JOIN dbo.user_roles ur ON ur.user_id=u.user_id
      LEFT JOIN dbo.roles r ON r.role_id=ur.role_id
      GROUP BY u.user_id,u.username,u.full_name,u.email,u.is_active,u.created_at,u.department_id,d.name
      ORDER BY u.created_at DESC;
    `);
    response.json({ users: result.recordset.map((user: Record<string, unknown> & { roleIds?: string | null }) => ({ ...user, roleIds: user.roleIds?.split(",").map(Number) ?? [] })) });
  } catch (error) {
    console.error("User list failed:", error);
    response.status(503).json({ message: "Daftar pengguna gagal dimuat." });
  }
});

app.get("/api/admin/roles", requireAuth, requireAdministrator, async (_request, response) => {
  try {
    const connection = await getDatabasePool();
    const [roles, permissions, assignments] = await Promise.all([
      connection.request().query("SELECT role_id AS roleId, code, name, description, is_system_role AS isSystemRole FROM dbo.roles ORDER BY name;"),
      connection.request().query("SELECT permission_id AS permissionId, code, name, description FROM dbo.permissions ORDER BY code;"),
      connection.request().query("SELECT role_id AS roleId, permission_id AS permissionId FROM dbo.role_permissions;")
    ]);
    const assignedByRole = new Map<number, number[]>();
    for (const assignment of assignments.recordset as { roleId: number; permissionId: number }[]) {
      assignedByRole.set(assignment.roleId, [...(assignedByRole.get(assignment.roleId) ?? []), assignment.permissionId]);
    }
    response.json({
      roles: (roles.recordset as Array<Record<string, unknown> & { roleId: number }>).map((role) => ({ ...role, permissionIds: assignedByRole.get(role.roleId) ?? [] })),
      permissions: permissions.recordset
    });
  } catch (error) {
    console.error("Role permission list failed:", error);
    response.status(503).json({ message: "Role dan permission gagal dimuat." });
  }
});

app.put("/api/admin/roles/:roleId/permissions", requireAuth, requireAdministrator, async (request: AuthenticatedRequest, response) => {
  const roleId = Number(request.params.roleId);
  const permissionIds = Array.isArray(request.body?.permissionIds) ? [...new Set(request.body.permissionIds.map(Number))] : null;
  if (!Number.isInteger(roleId) || !permissionIds || permissionIds.some((id) => !Number.isInteger(id))) {
    response.status(400).json({ message: "Daftar permission tidak valid." });
    return;
  }
  const connection = await getDatabasePool();
  const transaction = new sql.Transaction(connection);
  try {
    await transaction.begin();
    const role = await new sql.Request(transaction).input("roleId", sql.Int, roleId)
      .query<{ code: string }>("SELECT code FROM dbo.roles WITH(UPDLOCK,HOLDLOCK) WHERE role_id=@roleId;");
    if (!role.recordset.length) throw new Error("ROLE_NOT_FOUND");
    if (role.recordset[0].code === "administrator") throw new Error("ADMIN_LOCKED");

    if (permissionIds.length) {
      const validationRequest = new sql.Request(transaction).input("permissionIds", sql.NVarChar(sql.MAX), JSON.stringify(permissionIds));
      const valid = await validationRequest.query<{ total: number }>("SELECT COUNT(*) AS total FROM dbo.permissions WHERE permission_id IN (SELECT TRY_CONVERT(INT,[value]) FROM OPENJSON(@permissionIds));");
      if (valid.recordset[0].total !== permissionIds.length) throw new Error("INVALID_PERMISSION");
    }

    await new sql.Request(transaction).input("roleId", sql.Int, roleId).query("DELETE dbo.role_permissions WHERE role_id=@roleId;");
    for (const permissionId of permissionIds) {
      await new sql.Request(transaction).input("roleId", sql.Int, roleId).input("permissionId", sql.Int, permissionId)
        .query("INSERT dbo.role_permissions(role_id,permission_id) VALUES(@roleId,@permissionId);");
    }
    await new sql.Request(transaction)
      .input("actorId", sql.UniqueIdentifier, request.auth!.userId)
      .input("entityId", sql.NVarChar(100), String(roleId))
      .input("values", sql.NVarChar(sql.MAX), JSON.stringify({ permissionIds }))
      .query("INSERT dbo.audit_logs(user_id,action,entity_type,entity_id,current_values) VALUES(@actorId,N'roles.permissions.update',N'role',@entityId,@values);");
    await transaction.commit();
    response.json({ message: "Permission role berhasil diperbarui." });
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    const code = error instanceof Error ? error.message : "";
    const status = code === "ROLE_NOT_FOUND" ? 404 : code === "ADMIN_LOCKED" ? 409 : 400;
    const message = code === "ROLE_NOT_FOUND" ? "Role tidak ditemukan." : code === "ADMIN_LOCKED" ? "Permission Administrator dikunci agar akses penuh tetap tersedia." : "Permission role gagal diperbarui.";
    response.status(status).json({ message });
  }
});

app.post("/api/admin/users", requireAuth, requireAdministrator, async (request: AuthenticatedRequest, response) => {
  const { username, fullName, email, password, departmentId, roleId } = request.body ?? {};
  const parsedDepartmentId = Number(departmentId);
  const parsedRoleId = Number(roleId);
  if (typeof username !== "string" || username.trim().length < 3 || typeof fullName !== "string" || fullName.trim().length < 3 || typeof password !== "string" || password.length < 8 || !Number.isInteger(parsedDepartmentId) || !Number.isInteger(parsedRoleId)) {
    response.status(400).json({ message: "Lengkapi nama, username, password minimal 8 karakter, departemen, dan role." });
    return;
  }
  const connection = await getDatabasePool();
  const transaction = new sql.Transaction(connection);
  try {
    const hash = await bcrypt.hash(password, 12);
    await transaction.begin();
    const created = await new sql.Request(transaction)
      .input("username", sql.NVarChar(50), username.trim())
      .input("fullName", sql.NVarChar(150), fullName.trim())
      .input("email", sql.NVarChar(254), typeof email === "string" && email.trim() ? email.trim() : null)
      .input("hash", sql.NVarChar(255), hash)
      .input("departmentId", sql.Int, parsedDepartmentId)
      .query<{ userId: string }>("INSERT dbo.users(username,full_name,email,password_hash,department_id) OUTPUT inserted.user_id AS userId VALUES(@username,@fullName,@email,@hash,@departmentId);");
    const userId = created.recordset[0].userId;
    await new sql.Request(transaction)
      .input("userId", sql.UniqueIdentifier, userId)
      .input("roleId", sql.Int, parsedRoleId)
      .input("assignedBy", sql.UniqueIdentifier, request.auth!.userId)
      .query("INSERT dbo.user_roles(user_id,role_id,assigned_by) VALUES(@userId,@roleId,@assignedBy);");
    await new sql.Request(transaction)
      .input("actorId", sql.UniqueIdentifier, request.auth!.userId)
      .input("entityId", sql.NVarChar(100), userId)
      .query("INSERT dbo.audit_logs(user_id,action,entity_type,entity_id) VALUES(@actorId,N'users.create',N'user',@entityId);");
    await transaction.commit();
    response.status(201).json({ message: "Pengguna berhasil dibuat." });
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    console.error("Create user failed:", error);
    response.status(409).json({ message: "Pengguna gagal dibuat. Pastikan username/email unik dan master data valid." });
  }
});

app.put("/api/admin/users/:userId/access", requireAuth, requireAdministrator, async (request: AuthenticatedRequest, response) => {
  const { userId } = request.params;
  const departmentId = Number(request.body?.departmentId);
  const roleIds = Array.isArray(request.body?.roleIds) ? [...new Set(request.body.roleIds.map(Number))] : null;
  if (!Number.isInteger(departmentId) || !roleIds?.length || roleIds.some((id) => !Number.isInteger(id))) {
    response.status(400).json({ message: "Departemen dan minimal satu role wajib dipilih." });
    return;
  }
  const connection = await getDatabasePool();
  const transaction = new sql.Transaction(connection);
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const target = await new sql.Request(transaction).input("userId", sql.UniqueIdentifier, userId).query<{ isActive: boolean; isAdministrator: boolean }>(`
      SELECT u.is_active AS isActive,IIF(EXISTS(SELECT 1 FROM dbo.user_roles ur JOIN dbo.roles r ON r.role_id=ur.role_id WHERE ur.user_id=u.user_id AND r.code=N'administrator'),1,0) AS isAdministrator
      FROM dbo.users u WITH(UPDLOCK,HOLDLOCK) WHERE u.user_id=@userId;
    `);
    if (!target.recordset.length) throw new Error("USER_NOT_FOUND");

    const validDepartment = await new sql.Request(transaction).input("departmentId", sql.Int, departmentId).query("SELECT 1 AS valid FROM dbo.departments WHERE department_id=@departmentId AND is_active=1;");
    const validRoles = await new sql.Request(transaction).input("roleIds", sql.NVarChar(sql.MAX), JSON.stringify(roleIds))
      .query<{ total: number; includesAdministrator: boolean }>("SELECT COUNT(*) AS total,CONVERT(BIT,MAX(IIF(code=N'administrator',1,0))) AS includesAdministrator FROM dbo.roles WHERE role_id IN (SELECT TRY_CONVERT(INT,[value]) FROM OPENJSON(@roleIds));");
    if (!validDepartment.recordset.length || validRoles.recordset[0].total !== roleIds.length) throw new Error("INVALID_ACCESS");

    if (target.recordset[0].isAdministrator && !validRoles.recordset[0].includesAdministrator) {
      const otherAdmins = await new sql.Request(transaction).input("userId", sql.UniqueIdentifier, userId).query<{ total: number }>(`
        SELECT COUNT(DISTINCT u.user_id) AS total FROM dbo.users u JOIN dbo.user_roles ur ON ur.user_id=u.user_id JOIN dbo.roles r ON r.role_id=ur.role_id WHERE u.is_active=1 AND r.code=N'administrator' AND u.user_id<>@userId;
      `);
      if (otherAdmins.recordset[0].total === 0) throw new Error("LAST_ADMIN");
    }

    await new sql.Request(transaction).input("userId", sql.UniqueIdentifier, userId).input("departmentId", sql.Int, departmentId)
      .query("UPDATE dbo.users SET department_id=@departmentId,updated_at=SYSUTCDATETIME() WHERE user_id=@userId; DELETE dbo.user_roles WHERE user_id=@userId;");
    for (const roleId of roleIds) {
      await new sql.Request(transaction).input("userId", sql.UniqueIdentifier, userId).input("roleId", sql.Int, roleId).input("assignedBy", sql.UniqueIdentifier, request.auth!.userId)
        .query("INSERT dbo.user_roles(user_id,role_id,assigned_by) VALUES(@userId,@roleId,@assignedBy);");
    }
    await new sql.Request(transaction).input("actorId", sql.UniqueIdentifier, request.auth!.userId).input("entityId", sql.NVarChar(100), userId).input("values", sql.NVarChar(sql.MAX), JSON.stringify({ departmentId, roleIds }))
      .query("INSERT dbo.audit_logs(user_id,action,entity_type,entity_id,current_values) VALUES(@actorId,N'users.access.update',N'user',@entityId,@values);");
    await transaction.commit();
    response.json({ message: "Departemen dan role pengguna berhasil diperbarui." });
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    const code = error instanceof Error ? error.message : "";
    const status = code === "USER_NOT_FOUND" ? 404 : code === "LAST_ADMIN" ? 409 : 400;
    const message = code === "USER_NOT_FOUND" ? "Pengguna tidak ditemukan." : code === "LAST_ADMIN" ? "Role Administrator terakhir tidak boleh dihapus." : "Akses pengguna gagal diperbarui.";
    response.status(status).json({ message });
  }
});

app.patch("/api/admin/users/:userId/status", requireAuth, requireAdministrator, async (request: AuthenticatedRequest, response) => {
  const { userId } = request.params;
  const { isActive } = request.body ?? {};
  if (typeof isActive !== "boolean") { response.status(400).json({ message: "Status pengguna tidak valid." }); return; }
  if (userId === request.auth!.userId && !isActive) { response.status(409).json({ message: "Anda tidak dapat menonaktifkan akun sendiri." }); return; }
  try {
    const connection = await getDatabasePool();
    const result = await connection.request().input("userId", sql.UniqueIdentifier, userId).input("isActive", sql.Bit, isActive)
      .query("UPDATE dbo.users SET is_active=@isActive,updated_at=SYSUTCDATETIME() OUTPUT inserted.user_id WHERE user_id=@userId;");
    if (!result.recordset.length) { response.status(404).json({ message: "Pengguna tidak ditemukan." }); return; }
    await connection.request().input("actorId", sql.UniqueIdentifier, request.auth!.userId).input("entityId", sql.NVarChar(100), userId)
      .input("values", sql.NVarChar(sql.MAX), JSON.stringify({ isActive }))
      .query("INSERT dbo.audit_logs(user_id,action,entity_type,entity_id,current_values) VALUES(@actorId,N'users.status',N'user',@entityId,@values);");
    response.json({ message: `Pengguna berhasil ${isActive ? "diaktifkan" : "dinonaktifkan"}.` });
  } catch (error) {
    console.error("Update user status failed:", error);
    response.status(400).json({ message: "Status pengguna gagal diubah." });
  }
});

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.get("/health/db", async (_request, response) => {
  try {
    const database = await checkDatabaseConnection();

    response.status(200).json({
      status: "ok",
      database: database.databaseName,
      server: database.serverName
    });
  } catch (error) {
    console.error("Database health check failed:", error);
    response.status(503).json({
      status: "unavailable",
      message: "Database SQL Server tidak dapat dihubungi."
    });
  }
});

app.get("/api/setup/status", (_request, response) => {
  response.json({ databaseConfigured: hasConfiguredDatabase(), storage: process.env.DYNO ? "dyno-memory" : "local-env" });
});

function parseDatabaseConnection(body: Record<string, unknown>) {
  const { server, database, user, password, encrypt, trustServerCertificate } = body;
  const serverMatch = typeof server === "string" ? server.trim().match(/^tcp:([^,\s]+),(\d{1,5})$/i) : null;
  const port = serverMatch ? Number(serverMatch[2]) : NaN;
  if (!serverMatch || typeof database !== "string" || !database.trim() || typeof user !== "string" || !user.trim() || typeof password !== "string" || !password || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { server: serverMatch[1], port, database: database.trim(), user: user.trim(), password, encrypt: encrypt !== false, trustServerCertificate: trustServerCertificate === true };
}

async function connectAndPrepareDatabase(request: express.Request, response: express.Response) {
  const submittedConnection = parseDatabaseConnection(request.body ?? {});
  if (!submittedConnection) { response.status(400).json({ message: "Gunakan format tcp:HOST,PORT lalu isi database, username, dan password." }); return; }
  const previousConnection = { ...env.database };
  try {
    const active = await activateDatabaseConnection(submittedConnection);
    const migrations = await runMigrations(active.pool);
    const saved = !process.env.DYNO;
    if (saved) await saveDatabaseConnection(submittedConnection);
    const users = await active.pool.request().query<{ total: number }>("SELECT COUNT(*) AS total FROM dbo.users;");
    response.json({ status: "connected", database: active.databaseName, server: active.serverName, saved, migrations, needsBootstrap: users.recordset[0].total === 0,
      message: saved ? "Koneksi aktif dan tersimpan untuk lokal." : "Koneksi aktif pada dyno Heroku ini." });
  } catch (error) {
    await closeDatabaseConnection().catch(() => undefined);
    setDatabaseConnection(previousConnection);
    console.error("Database connection setup failed:", error);
    response.status(503).json({ status: "unavailable", message: "Koneksi atau persiapan schema gagal. Periksa kredensial, izin CREATE TABLE, firewall, dan nama database." });
  }
}

app.post("/api/setup/database", async (request, response) => {
  if (hasConfiguredDatabase()) { response.status(409).json({ message: "Database sudah aktif. Login sebagai Administrator untuk menggantinya." }); return; }
  await connectAndPrepareDatabase(request, response);
});

app.get("/api/database/config", requireAuth, requireAdministrator, (_request, response) => {
  response.status(200).json({
    server: `tcp:${env.database.server},${env.database.port}`,
    database: env.database.database,
    user: env.database.user,
    encrypt: env.database.encrypt,
    trustServerCertificate: env.database.trustServerCertificate
  });
});

app.post("/api/database/test-connection", requireAuth, requireAdministrator, async (request, response) => {
  await connectAndPrepareDatabase(request, response);
});

app.get("/api/purchasing/overview", requireAuth, requirePermission("purchasing.read"), async (_request, response) => {
  try {
    const connection = await getDatabasePool();
    const [summary, requests] = await Promise.all([
      connection.request().query<{ totalRequests: number; waitingApproval: number; approved: number; totalValue: number }>(`
        SELECT COUNT(*) AS totalRequests,ISNULL(SUM(IIF(pr.status=N'SUBMITTED',1,0)),0) AS waitingApproval,ISNULL(SUM(IIF(pr.status=N'APPROVED',1,0)),0) AS approved,
          ISNULL(SUM(IIF(pr.status=N'APPROVED',totals.total_value,0)),0) AS totalValue
        FROM dbo.purchase_requests pr OUTER APPLY(SELECT SUM(pri.quantity*pri.estimated_unit_price) AS total_value FROM dbo.purchase_request_items pri WHERE pri.purchase_request_id=pr.purchase_request_id) totals;
      `),
      connection.request().query(`
        SELECT TOP 50 pr.purchase_request_id AS purchaseRequestId,pr.request_number AS requestNumber,s.name AS supplier,u.full_name AS requestedBy,
          pr.status,pr.expected_date AS expectedDate,pr.created_at AS createdAt,COUNT(pri.purchase_request_item_id) AS lineCount,ISNULL(SUM(pri.quantity*pri.estimated_unit_price),0) AS totalValue
        FROM dbo.purchase_requests pr JOIN dbo.suppliers s ON s.supplier_id=pr.supplier_id JOIN dbo.users u ON u.user_id=pr.requested_by
        JOIN dbo.purchase_request_items pri ON pri.purchase_request_id=pr.purchase_request_id
        GROUP BY pr.purchase_request_id,pr.request_number,s.name,u.full_name,pr.status,pr.expected_date,pr.created_at ORDER BY pr.created_at DESC;
      `)
    ]);
    response.json({ summary: summary.recordset[0], requests: requests.recordset });
  } catch (error) {
    console.error("Purchasing overview failed:", error);
    response.status(503).json({ message: "Data Purchasing belum tersedia. Jalankan migration terbaru." });
  }
});

app.get("/api/purchasing/master-data", requireAuth, requirePermission("purchasing.read"), async (_request, response) => {
  try {
    const connection = await getDatabasePool();
    const [suppliers, items] = await Promise.all([
      connection.request().query("SELECT supplier_id AS supplierId,code,name,contact_person AS contactPerson FROM dbo.suppliers WHERE is_active=1 ORDER BY name;"),
      connection.request().query("SELECT i.item_id AS itemId,i.code,i.name,u.code AS unit FROM dbo.items i JOIN dbo.units u ON u.unit_id=i.unit_id WHERE i.is_active=1 ORDER BY i.name;")
    ]);
    response.json({ suppliers: suppliers.recordset, items: items.recordset });
  } catch (error) {
    console.error("Purchasing master data failed:", error);
    response.status(503).json({ message: "Master data Purchasing gagal dimuat." });
  }
});

app.post("/api/purchasing/suppliers", requireAuth, requirePermission("purchasing.manage"), async (request, response) => {
  const { code, name, contactPerson, phone, email, address } = request.body ?? {};
  if (typeof code !== "string" || !code.trim() || typeof name !== "string" || name.trim().length < 3) { response.status(400).json({ message: "Kode dan nama supplier wajib diisi." }); return; }
  try {
    const connection = await getDatabasePool();
    await connection.request().input("code", sql.NVarChar(30), code.trim().toUpperCase()).input("name", sql.NVarChar(150), name.trim())
      .input("contactPerson", sql.NVarChar(100), contactPerson?.trim() || null).input("phone", sql.NVarChar(30), phone?.trim() || null)
      .input("email", sql.NVarChar(254), email?.trim() || null).input("address", sql.NVarChar(500), address?.trim() || null)
      .query("INSERT dbo.suppliers(code,name,contact_person,phone,email,address) VALUES(@code,@name,@contactPerson,@phone,@email,@address);");
    response.status(201).json({ message: "Supplier berhasil ditambahkan." });
  } catch (error) {
    console.error("Create supplier failed:", error);
    response.status(409).json({ message: "Supplier gagal dibuat. Pastikan kode supplier unik." });
  }
});

app.post("/api/purchasing/requests", requireAuth, requirePermission("purchasing.manage"), async (request: AuthenticatedRequest, response) => {
  const supplierId = Number(request.body?.supplierId);
  const expectedDate = typeof request.body?.expectedDate === "string" && request.body.expectedDate ? request.body.expectedDate : null;
  const notes = typeof request.body?.notes === "string" ? request.body.notes.trim() : "";
  const items = Array.isArray(request.body?.items) ? request.body.items.map((item: Record<string, unknown>) => ({ itemId: item.itemId, quantity: Number(item.quantity), estimatedUnitPrice: Number(item.estimatedUnitPrice), notes: typeof item.notes === "string" ? item.notes.trim() : "" })) : [];
  if (!Number.isInteger(supplierId) || !items.length || items.some((item: { itemId: unknown; quantity: number; estimatedUnitPrice: number }) => typeof item.itemId !== "string" || !item.itemId || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.estimatedUnitPrice) || item.estimatedUnitPrice < 0)) {
    response.status(400).json({ message: "Supplier dan minimal satu detail barang yang valid wajib diisi." }); return;
  }
  const connection = await getDatabasePool();
  const transaction = new sql.Transaction(connection);
  try {
    await transaction.begin();
    const requestNumber = `PR-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${Date.now().toString().slice(-6)}`;
    const created = await new sql.Request(transaction).input("number", sql.NVarChar(50), requestNumber).input("supplierId", sql.Int, supplierId)
      .input("requestedBy", sql.UniqueIdentifier, request.auth!.userId).input("expectedDate", sql.Date, expectedDate).input("notes", sql.NVarChar(500), notes || null)
      .query<{ purchaseRequestId: string }>("INSERT dbo.purchase_requests(request_number,supplier_id,requested_by,expected_date,notes) OUTPUT inserted.purchase_request_id AS purchaseRequestId VALUES(@number,@supplierId,@requestedBy,@expectedDate,@notes);");
    const purchaseRequestId = created.recordset[0].purchaseRequestId;
    for (const item of items) {
      await new sql.Request(transaction).input("purchaseRequestId", sql.UniqueIdentifier, purchaseRequestId).input("itemId", sql.UniqueIdentifier, item.itemId)
        .input("quantity", sql.Decimal(18,3), item.quantity).input("price", sql.Decimal(18,2), item.estimatedUnitPrice).input("notes", sql.NVarChar(300), item.notes || null)
        .query("INSERT dbo.purchase_request_items(purchase_request_id,item_id,quantity,estimated_unit_price,notes) VALUES(@purchaseRequestId,@itemId,@quantity,@price,@notes);");
    }
    await new sql.Request(transaction).input("actorId", sql.UniqueIdentifier, request.auth!.userId).input("entityId", sql.NVarChar(100), purchaseRequestId)
      .query("INSERT dbo.audit_logs(user_id,action,entity_type,entity_id) VALUES(@actorId,N'purchasing.request.create',N'purchase_request',@entityId);");
    await transaction.commit();
    response.status(201).json({ message: "Purchase Request berhasil diajukan.", requestNumber });
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    console.error("Create purchase request failed:", error);
    response.status(400).json({ message: "Purchase Request gagal dibuat. Periksa supplier dan detail barang." });
  }
});

app.patch("/api/purchasing/requests/:requestId/decision", requireAuth, requirePermission("purchasing.approve"), async (request: AuthenticatedRequest, response) => {
  const decision = String(request.body?.decision ?? "").toUpperCase();
  const reason = typeof request.body?.reason === "string" ? request.body.reason.trim() : "";
  if (!["APPROVED","REJECTED"].includes(decision) || (decision === "REJECTED" && !reason)) { response.status(400).json({ message: "Keputusan tidak valid; alasan wajib diisi untuk penolakan." }); return; }
  const connection = await getDatabasePool();
  const transaction = new sql.Transaction(connection);
  try {
    await transaction.begin();
    const result = await new sql.Request(transaction).input("requestId", sql.UniqueIdentifier, request.params.requestId).input("decision", sql.NVarChar(20), decision)
      .input("reason", sql.NVarChar(500), reason || null).input("approvedBy", sql.UniqueIdentifier, request.auth!.userId)
      .query("UPDATE dbo.purchase_requests SET status=@decision,approved_by=@approvedBy,approved_at=SYSUTCDATETIME(),rejection_reason=@reason,updated_at=SYSUTCDATETIME() OUTPUT inserted.request_number AS requestNumber WHERE purchase_request_id=@requestId AND status=N'SUBMITTED';");
    if (!result.recordset.length) { await transaction.rollback(); response.status(409).json({ message: "Purchase Request tidak ditemukan atau sudah diputuskan." }); return; }
    await new sql.Request(transaction).input("actorId", sql.UniqueIdentifier, request.auth!.userId).input("entityId", sql.NVarChar(100), request.params.requestId).input("decision", sql.NVarChar(20), decision)
      .query("INSERT dbo.audit_logs(user_id,action,entity_type,entity_id,current_values) VALUES(@actorId,N'purchasing.request.decision',N'purchase_request',@entityId,N'{\"status\":\"'+@decision+N'\"}');");
    await transaction.commit();
    response.json({ message: `Purchase Request berhasil ${decision === "APPROVED" ? "disetujui" : "ditolak"}.` });
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    console.error("Purchase request decision failed:", error);
    response.status(400).json({ message: "Keputusan Purchase Request gagal disimpan." });
  }
});

app.get("/api/inventory/overview", requireAuth, requirePermission("inventory.read"), async (_request, response) => {
  try {
    const connection = await getDatabasePool();
    const result = await connection.request().query<{ itemId: string; code: string; name: string; unit: string; currentStock: number; minimumStock: number }>(`
      WITH stock AS (SELECT item_id, SUM(CASE WHEN transaction_type = N'OUT' THEN -quantity ELSE quantity END) AS current_stock FROM dbo.inventory_transactions GROUP BY item_id)
      SELECT TOP 20 i.item_id AS itemId, i.code, i.name, u.code AS unit, ISNULL(s.current_stock, 0) AS currentStock, i.minimum_stock AS minimumStock
      FROM dbo.items i JOIN dbo.units u ON u.unit_id = i.unit_id LEFT JOIN stock s ON s.item_id = i.item_id
      WHERE i.is_active = 1 ORDER BY i.name;
    `);
    const totals = await connection.request().query<{ totalItems: number; lowStock: number }>(`
      WITH stock AS (SELECT item_id, SUM(CASE WHEN transaction_type = N'OUT' THEN -quantity ELSE quantity END) AS current_stock FROM dbo.inventory_transactions GROUP BY item_id)
      SELECT COUNT(*) AS totalItems, SUM(CASE WHEN ISNULL(s.current_stock,0) <= i.minimum_stock THEN 1 ELSE 0 END) AS lowStock
      FROM dbo.items i LEFT JOIN stock s ON s.item_id=i.item_id WHERE i.is_active=1;
    `);
    response.json({ summary: totals.recordset[0], items: result.recordset });
  } catch (error) {
    console.error("Inventory overview failed:", error);
    response.status(503).json({ message: "Data inventory belum tersedia. Jalankan npm run db:migrate terlebih dahulu." });
  }
});

app.get("/api/inventory/master-data", requireAuth, requirePermission("inventory.read"), async (_request, response) => {
  try {
    const connection = await getDatabasePool();
    const [categories, units, warehouses] = await Promise.all([
      connection.request().query("SELECT category_id AS categoryId, code, name FROM dbo.item_categories WHERE is_active=1 ORDER BY name;"),
      connection.request().query("SELECT unit_id AS unitId, code, name FROM dbo.units ORDER BY name;"),
      connection.request().query("SELECT warehouse_id AS warehouseId, code, name FROM dbo.warehouses WHERE is_active=1 ORDER BY name;")
    ]);
    response.json({ categories: categories.recordset, units: units.recordset, warehouses: warehouses.recordset });
  } catch (error) {
    console.error("Inventory master data failed:", error);
    response.status(503).json({ message: "Master data inventory belum tersedia." });
  }
});

app.post("/api/inventory/items", requireAuth, requirePermission("inventory.manage"), async (request, response) => {
  const { code, name, categoryId, unitId, minimumStock } = request.body ?? {};
  if (typeof code !== "string" || !code.trim() || typeof name !== "string" || !name.trim() || !Number.isInteger(Number(categoryId)) || !Number.isInteger(Number(unitId)) || Number(minimumStock) < 0) {
    response.status(400).json({ message: "Data barang belum lengkap atau tidak valid." });
    return;
  }
  try {
    const connection = await getDatabasePool();
    const result = await connection.request()
      .input("code", sql.NVarChar(50), code.trim().toUpperCase())
      .input("name", sql.NVarChar(150), name.trim())
      .input("categoryId", sql.Int, Number(categoryId))
      .input("unitId", sql.Int, Number(unitId))
      .input("minimumStock", sql.Decimal(18, 3), Number(minimumStock || 0))
      .query("INSERT dbo.items(code,name,category_id,unit_id,minimum_stock) OUTPUT inserted.item_id AS itemId, inserted.code, inserted.name VALUES(@code,@name,@categoryId,@unitId,@minimumStock);");
    response.status(201).json({ message: "Barang berhasil ditambahkan.", item: result.recordset[0] });
  } catch (error) {
    console.error("Create inventory item failed:", error);
    response.status(409).json({ message: "Barang gagal dibuat. Pastikan kode unik dan master data valid." });
  }
});

app.post("/api/inventory/transactions", requireAuth, requirePermission("inventory.manage"), async (request, response) => {
  const { itemId, warehouseId, type, quantity, referenceNumber, notes } = request.body ?? {};
  const normalizedType = String(type ?? "").toUpperCase();
  const parsedQuantity = Number(quantity);
  if (typeof itemId !== "string" || !itemId || !Number.isInteger(Number(warehouseId)) || !["IN", "OUT", "ADJUSTMENT"].includes(normalizedType) || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
    response.status(400).json({ message: "Data transaksi belum lengkap atau tidak valid." });
    return;
  }
  const connection = await getDatabasePool();
  const transaction = new sql.Transaction(connection);
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const stock = await new sql.Request(transaction)
      .input("itemId", sql.UniqueIdentifier, itemId)
      .query<{ currentStock: number }>(`SELECT ISNULL(SUM(CASE WHEN t.transaction_type=N'OUT' THEN -t.quantity ELSE t.quantity END),0) AS currentStock FROM dbo.items i WITH(UPDLOCK,HOLDLOCK) LEFT JOIN dbo.inventory_transactions t ON t.item_id=i.item_id WHERE i.item_id=@itemId GROUP BY i.item_id;`);
    if (!stock.recordset.length) throw new Error("ITEM_NOT_FOUND");
    if (normalizedType === "OUT" && Number(stock.recordset[0].currentStock) < parsedQuantity) throw new Error("INSUFFICIENT_STOCK");
    const transactionNumber = `INV-${Date.now()}`;
    await new sql.Request(transaction)
      .input("number", sql.NVarChar(50), transactionNumber)
      .input("itemId", sql.UniqueIdentifier, itemId)
      .input("warehouseId", sql.Int, Number(warehouseId))
      .input("type", sql.NVarChar(20), normalizedType)
      .input("quantity", sql.Decimal(18, 3), parsedQuantity)
      .input("reference", sql.NVarChar(100), referenceNumber?.trim() || null)
      .input("notes", sql.NVarChar(500), notes?.trim() || null)
      .query("INSERT dbo.inventory_transactions(transaction_number,item_id,warehouse_id,transaction_type,quantity,reference_number,notes) VALUES(@number,@itemId,@warehouseId,@type,@quantity,@reference,@notes);");
    await transaction.commit();
    response.status(201).json({ message: "Transaksi inventory berhasil disimpan.", transactionNumber });
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    const code = error instanceof Error ? error.message : "";
    response.status(code === "INSUFFICIENT_STOCK" ? 409 : 400).json({ message: code === "INSUFFICIENT_STOCK" ? "Stok tidak mencukupi untuk barang keluar." : code === "ITEM_NOT_FOUND" ? "Barang tidak ditemukan." : "Transaksi inventory gagal disimpan." });
  }
});

const publicDirectory = resolve(process.cwd(), "dist", "public");
if (existsSync(publicDirectory)) {
  app.use(express.static(publicDirectory));
  app.get(/^(?!\/api(?:\/|$)|\/health(?:\/|$)).*/, (_request, response) => {
    response.sendFile(resolve(publicDirectory, "index.html"));
  });
}
