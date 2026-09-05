SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.departments', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.departments (
      department_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_departments PRIMARY KEY,
      code NVARCHAR(30) NOT NULL CONSTRAINT UQ_departments_code UNIQUE,
      name NVARCHAR(100) NOT NULL,
      description NVARCHAR(500) NULL,
      is_active BIT NOT NULL CONSTRAINT DF_departments_is_active DEFAULT (1),
      created_at DATETIME2(0) NOT NULL CONSTRAINT DF_departments_created_at DEFAULT (SYSUTCDATETIME()),
      updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_departments_updated_at DEFAULT (SYSUTCDATETIME())
    );
  END;

  IF OBJECT_ID(N'dbo.roles', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.roles (
      role_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_roles PRIMARY KEY,
      code NVARCHAR(50) NOT NULL CONSTRAINT UQ_roles_code UNIQUE,
      name NVARCHAR(100) NOT NULL,
      description NVARCHAR(500) NULL,
      is_system_role BIT NOT NULL CONSTRAINT DF_roles_is_system_role DEFAULT (0),
      created_at DATETIME2(0) NOT NULL CONSTRAINT DF_roles_created_at DEFAULT (SYSUTCDATETIME()),
      updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_roles_updated_at DEFAULT (SYSUTCDATETIME())
    );
  END;

  IF OBJECT_ID(N'dbo.permissions', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.permissions (
      permission_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_permissions PRIMARY KEY,
      code NVARCHAR(100) NOT NULL CONSTRAINT UQ_permissions_code UNIQUE,
      name NVARCHAR(150) NOT NULL,
      description NVARCHAR(500) NULL,
      created_at DATETIME2(0) NOT NULL CONSTRAINT DF_permissions_created_at DEFAULT (SYSUTCDATETIME())
    );
  END;

  IF OBJECT_ID(N'dbo.users', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.users (
      user_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_users PRIMARY KEY CONSTRAINT DF_users_id DEFAULT (NEWID()),
      username NVARCHAR(50) NOT NULL CONSTRAINT UQ_users_username UNIQUE,
      full_name NVARCHAR(150) NOT NULL,
      email NVARCHAR(254) NULL,
      password_hash NVARCHAR(255) NOT NULL,
      department_id INT NULL,
      is_active BIT NOT NULL CONSTRAINT DF_users_is_active DEFAULT (1),
      last_login_at DATETIME2(0) NULL,
      created_at DATETIME2(0) NOT NULL CONSTRAINT DF_users_created_at DEFAULT (SYSUTCDATETIME()),
      updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_users_updated_at DEFAULT (SYSUTCDATETIME()),
      CONSTRAINT UQ_users_email UNIQUE (email),
      CONSTRAINT FK_users_department FOREIGN KEY (department_id) REFERENCES dbo.departments(department_id)
    );
  END;

  IF OBJECT_ID(N'dbo.role_permissions', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.role_permissions (
      role_id INT NOT NULL,
      permission_id INT NOT NULL,
      created_at DATETIME2(0) NOT NULL CONSTRAINT DF_role_permissions_created_at DEFAULT (SYSUTCDATETIME()),
      CONSTRAINT PK_role_permissions PRIMARY KEY (role_id, permission_id),
      CONSTRAINT FK_role_permissions_role FOREIGN KEY (role_id) REFERENCES dbo.roles(role_id) ON DELETE CASCADE,
      CONSTRAINT FK_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES dbo.permissions(permission_id) ON DELETE CASCADE
    );
  END;

  IF OBJECT_ID(N'dbo.user_roles', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.user_roles (
      user_id UNIQUEIDENTIFIER NOT NULL,
      role_id INT NOT NULL,
      assigned_at DATETIME2(0) NOT NULL CONSTRAINT DF_user_roles_assigned_at DEFAULT (SYSUTCDATETIME()),
      assigned_by UNIQUEIDENTIFIER NULL,
      CONSTRAINT PK_user_roles PRIMARY KEY (user_id, role_id),
      CONSTRAINT FK_user_roles_user FOREIGN KEY (user_id) REFERENCES dbo.users(user_id) ON DELETE CASCADE,
      CONSTRAINT FK_user_roles_role FOREIGN KEY (role_id) REFERENCES dbo.roles(role_id) ON DELETE CASCADE,
      CONSTRAINT FK_user_roles_assigned_by FOREIGN KEY (assigned_by) REFERENCES dbo.users(user_id)
    );
  END;

  IF OBJECT_ID(N'dbo.audit_logs', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.audit_logs (
      audit_log_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_audit_logs PRIMARY KEY,
      user_id UNIQUEIDENTIFIER NULL,
      action NVARCHAR(100) NOT NULL,
      entity_type NVARCHAR(100) NOT NULL,
      entity_id NVARCHAR(100) NULL,
      previous_values NVARCHAR(MAX) NULL,
      current_values NVARCHAR(MAX) NULL,
      ip_address VARCHAR(45) NULL,
      created_at DATETIME2(0) NOT NULL CONSTRAINT DF_audit_logs_created_at DEFAULT (SYSUTCDATETIME()),
      CONSTRAINT FK_audit_logs_user FOREIGN KEY (user_id) REFERENCES dbo.users(user_id)
    );
  END;

  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_users_department_id' AND object_id = OBJECT_ID(N'dbo.users'))
    CREATE INDEX IX_users_department_id ON dbo.users(department_id);

  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_audit_logs_entity' AND object_id = OBJECT_ID(N'dbo.audit_logs'))
    CREATE INDEX IX_audit_logs_entity ON dbo.audit_logs(entity_type, entity_id, created_at DESC);

  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_audit_logs_user_created_at' AND object_id = OBJECT_ID(N'dbo.audit_logs'))
    CREATE INDEX IX_audit_logs_user_created_at ON dbo.audit_logs(user_id, created_at DESC);

  INSERT INTO dbo.departments (code, name)
  SELECT seed.code, seed.name
  FROM (VALUES
    (N'IT', N'Information Technology'),
    (N'WAREHOUSE', N'Warehouse'),
    (N'PPIC', N'PPIC'),
    (N'PRODUCTION', N'Production'),
    (N'QC', N'Quality Control'),
    (N'PURCHASING', N'Purchasing'),
    (N'FINANCE', N'Finance'),
    (N'MARKETING', N'Marketing'),
    (N'EXIM', N'Export Import'),
    (N'MANAGEMENT', N'Management')
  ) AS seed(code, name)
  WHERE NOT EXISTS (SELECT 1 FROM dbo.departments AS target WHERE target.code = seed.code);

  INSERT INTO dbo.roles (code, name, description, is_system_role)
  SELECT seed.code, seed.name, seed.description, 1
  FROM (VALUES
    (N'administrator', N'Administrator', N'Akses penuh pengelolaan ERP'),
    (N'manager', N'Manager', N'Akses laporan dan persetujuan'),
    (N'warehouse_staff', N'Warehouse Staff', N'Mengelola transaksi gudang'),
    (N'ppic_staff', N'PPIC Staff', N'Mengelola perencanaan produksi'),
    (N'finance_staff', N'Finance Staff', N'Mengelola transaksi keuangan'),
    (N'qc_staff', N'QC Staff', N'Mengelola inspeksi mutu')
  ) AS seed(code, name, description)
  WHERE NOT EXISTS (SELECT 1 FROM dbo.roles AS target WHERE target.code = seed.code);

  INSERT INTO dbo.permissions (code, name, description)
  SELECT seed.code, seed.name, seed.description
  FROM (VALUES
    (N'users.read', N'Lihat pengguna', N'Melihat data pengguna'),
    (N'users.manage', N'Kelola pengguna', N'Membuat dan mengubah pengguna'),
    (N'roles.read', N'Lihat role', N'Melihat role dan permission'),
    (N'roles.manage', N'Kelola role', N'Membuat dan mengubah role serta permission'),
    (N'departments.read', N'Lihat departemen', N'Melihat data departemen'),
    (N'departments.manage', N'Kelola departemen', N'Membuat dan mengubah departemen'),
    (N'audit_logs.read', N'Lihat audit log', N'Melihat riwayat aktivitas'),
    (N'inventory.read', N'Lihat inventory', N'Melihat stok dan transaksi inventory'),
    (N'inventory.manage', N'Kelola inventory', N'Membuat transaksi inventory')
  ) AS seed(code, name, description)
  WHERE NOT EXISTS (SELECT 1 FROM dbo.permissions AS target WHERE target.code = seed.code);

  INSERT INTO dbo.role_permissions (role_id, permission_id)
  SELECT roles.role_id, permissions.permission_id
  FROM dbo.roles
  CROSS JOIN dbo.permissions
  WHERE roles.code = N'administrator'
    AND NOT EXISTS (
      SELECT 1
      FROM dbo.role_permissions
      WHERE role_permissions.role_id = roles.role_id
        AND role_permissions.permission_id = permissions.permission_id
    );

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
