SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE code=N'purchasing_staff')
    INSERT dbo.roles(code,name,description,is_system_role) VALUES(N'purchasing_staff',N'Purchasing Staff',N'Mengelola supplier dan purchase request',1);

  INSERT dbo.permissions(code,name,description)
  SELECT seed.code,seed.name,seed.description FROM (VALUES
    (N'purchasing.read',N'Lihat purchasing',N'Melihat supplier dan purchase request'),
    (N'purchasing.manage',N'Kelola purchasing',N'Membuat supplier dan purchase request'),
    (N'purchasing.approve',N'Persetujuan purchasing',N'Menyetujui atau menolak purchase request')
  ) seed(code,name,description)
  WHERE NOT EXISTS(SELECT 1 FROM dbo.permissions target WHERE target.code=seed.code);

  INSERT dbo.role_permissions(role_id,permission_id)
  SELECT r.role_id,p.permission_id FROM dbo.roles r CROSS JOIN dbo.permissions p
  WHERE r.code=N'administrator' AND NOT EXISTS(SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id=r.role_id AND rp.permission_id=p.permission_id);

  INSERT dbo.role_permissions(role_id,permission_id)
  SELECT r.role_id,p.permission_id FROM (VALUES
    (N'purchasing_staff',N'purchasing.read'),
    (N'purchasing_staff',N'purchasing.manage'),
    (N'manager',N'purchasing.read'),
    (N'manager',N'purchasing.approve')
  ) defaults(role_code,permission_code)
  JOIN dbo.roles r ON r.code=defaults.role_code JOIN dbo.permissions p ON p.code=defaults.permission_code
  WHERE NOT EXISTS(SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id=r.role_id AND rp.permission_id=p.permission_id);

  IF OBJECT_ID(N'dbo.suppliers',N'U') IS NULL
  CREATE TABLE dbo.suppliers(
    supplier_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_suppliers PRIMARY KEY,
    code NVARCHAR(30) NOT NULL CONSTRAINT UQ_suppliers_code UNIQUE,
    name NVARCHAR(150) NOT NULL,
    contact_person NVARCHAR(100) NULL,
    phone NVARCHAR(30) NULL,
    email NVARCHAR(254) NULL,
    address NVARCHAR(500) NULL,
    is_active BIT NOT NULL CONSTRAINT DF_suppliers_is_active DEFAULT(1),
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_suppliers_created_at DEFAULT(SYSUTCDATETIME()),
    updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_suppliers_updated_at DEFAULT(SYSUTCDATETIME())
  );

  IF OBJECT_ID(N'dbo.purchase_requests',N'U') IS NULL
  CREATE TABLE dbo.purchase_requests(
    purchase_request_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_purchase_requests PRIMARY KEY CONSTRAINT DF_purchase_requests_id DEFAULT(NEWID()),
    request_number NVARCHAR(50) NOT NULL CONSTRAINT UQ_purchase_requests_number UNIQUE,
    supplier_id INT NOT NULL,
    requested_by UNIQUEIDENTIFIER NOT NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_purchase_requests_status DEFAULT(N'SUBMITTED'),
    expected_date DATE NULL,
    notes NVARCHAR(500) NULL,
    approved_by UNIQUEIDENTIFIER NULL,
    approved_at DATETIME2(0) NULL,
    rejection_reason NVARCHAR(500) NULL,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_purchase_requests_created_at DEFAULT(SYSUTCDATETIME()),
    updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_purchase_requests_updated_at DEFAULT(SYSUTCDATETIME()),
    CONSTRAINT CK_purchase_requests_status CHECK(status IN(N'SUBMITTED',N'APPROVED',N'REJECTED')),
    CONSTRAINT FK_purchase_requests_supplier FOREIGN KEY(supplier_id) REFERENCES dbo.suppliers(supplier_id),
    CONSTRAINT FK_purchase_requests_requested_by FOREIGN KEY(requested_by) REFERENCES dbo.users(user_id),
    CONSTRAINT FK_purchase_requests_approved_by FOREIGN KEY(approved_by) REFERENCES dbo.users(user_id)
  );

  IF OBJECT_ID(N'dbo.purchase_request_items',N'U') IS NULL
  CREATE TABLE dbo.purchase_request_items(
    purchase_request_item_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_purchase_request_items PRIMARY KEY,
    purchase_request_id UNIQUEIDENTIFIER NOT NULL,
    item_id UNIQUEIDENTIFIER NOT NULL,
    quantity DECIMAL(18,3) NOT NULL,
    estimated_unit_price DECIMAL(18,2) NOT NULL CONSTRAINT DF_purchase_request_items_price DEFAULT(0),
    notes NVARCHAR(300) NULL,
    CONSTRAINT CK_purchase_request_items_quantity CHECK(quantity>0),
    CONSTRAINT CK_purchase_request_items_price CHECK(estimated_unit_price>=0),
    CONSTRAINT FK_purchase_request_items_request FOREIGN KEY(purchase_request_id) REFERENCES dbo.purchase_requests(purchase_request_id) ON DELETE CASCADE,
    CONSTRAINT FK_purchase_request_items_item FOREIGN KEY(item_id) REFERENCES dbo.items(item_id)
  );

  IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name=N'IX_purchase_requests_status_created' AND object_id=OBJECT_ID(N'dbo.purchase_requests'))
    CREATE INDEX IX_purchase_requests_status_created ON dbo.purchase_requests(status,created_at DESC);
  IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name=N'IX_purchase_request_items_request' AND object_id=OBJECT_ID(N'dbo.purchase_request_items'))
    CREATE INDEX IX_purchase_request_items_request ON dbo.purchase_request_items(purchase_request_id);

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
