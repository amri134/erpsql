import express from "express";
import sql from "mssql";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { env, saveDatabaseConnection } from "./config/env.js";
import { checkDatabaseConnection, closeDatabaseConnection, getDatabasePool, testDatabaseConnection } from "./database/sql-server.js";

export const app = express();

app.use(express.json());

type AuthenticatedRequest = express.Request & { auth?: { userId: string; username: string; roles: string[] } };
function requireAuth(request: AuthenticatedRequest, response: express.Response, next: express.NextFunction) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) { response.status(401).json({ message: "Silakan login terlebih dahulu." }); return; }
  try { request.auth = jwt.verify(token, env.jwtSecret) as AuthenticatedRequest["auth"]; next(); }
  catch { response.status(401).json({ message: "Sesi tidak valid atau sudah berakhir." }); }
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
      const result = await connection.request()
        .input("userId", sql.UniqueIdentifier, request.auth!.userId)
        .input("permissionCode", sql.NVarChar(100), permissionCode)
        .query("SELECT TOP 1 1 AS allowed FROM dbo.user_roles ur JOIN dbo.role_permissions rp ON rp.role_id=ur.role_id JOIN dbo.permissions p ON p.permission_id=rp.permission_id WHERE ur.user_id=@userId AND p.code=@permissionCode;");
      if (!result.recordset.length) { response.status(403).json({ message: "Anda tidak memiliki permission untuk fitur ini." }); return; }
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
    const token = jwt.sign({ userId, username: username.trim(), roles: ["administrator"] }, env.jwtSecret, { expiresIn: "8h" });
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
    const token = jwt.sign({ userId: user.userId, username: user.username, roles }, env.jwtSecret, { expiresIn: "8h" });
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
        u.is_active AS isActive, u.created_at AS createdAt,
        d.name AS departmentName,
        STRING_AGG(r.name, ', ') WITHIN GROUP (ORDER BY r.name) AS roles
      FROM dbo.users u
      LEFT JOIN dbo.departments d ON d.department_id=u.department_id
      LEFT JOIN dbo.user_roles ur ON ur.user_id=u.user_id
      LEFT JOIN dbo.roles r ON r.role_id=ur.role_id
      GROUP BY u.user_id,u.username,u.full_name,u.email,u.is_active,u.created_at,d.name
      ORDER BY u.created_at DESC;
    `);
    response.json({ users: result.recordset });
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
  const { server, database, user, password, encrypt, trustServerCertificate } = request.body ?? {};
  const serverMatch = typeof server === "string" ? server.trim().match(/^tcp:([^,\s]+),(\d{1,5})$/i) : null;
  const parsedPort = serverMatch ? Number(serverMatch[2]) : NaN;
  const parsedServer = serverMatch?.[1] ?? "";

  if (
    !serverMatch || !parsedServer ||
    typeof database !== "string" || !database.trim() ||
    typeof user !== "string" || !user.trim() ||
    typeof password !== "string" || !password ||
    !Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535
  ) {
    response.status(400).json({ message: "Isi host, port, database, username, dan password dengan benar." });
    return;
  }

  try {
    const submittedConnection = {
      server: parsedServer,
      port: parsedPort,
      database: database.trim(),
      user: user.trim(),
      password,
      encrypt: encrypt !== false,
      trustServerCertificate: trustServerCertificate === true
    };
    const connection = await testDatabaseConnection(submittedConnection);
    const saved = !process.env.DYNO;
    if (saved) await saveDatabaseConnection(submittedConnection);
    await closeDatabaseConnection();

    response.status(200).json({
      status: "connected",
      database: connection.databaseName,
      server: connection.serverName,
      saved,
      message: saved ? "Koneksi SQL Server berhasil diuji dan konfigurasi disimpan." : "Koneksi berhasil diuji. Di Heroku, simpan perubahan melalui Config Vars."
    });
  } catch (error) {
    console.error("Database connection test failed:", error);
    response.status(503).json({
      status: "unavailable",
      message: "Koneksi gagal. Periksa host, port, database, username, password, dan firewall."
    });
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
