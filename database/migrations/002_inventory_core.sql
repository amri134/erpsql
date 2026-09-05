SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.item_categories', N'U') IS NULL
  CREATE TABLE dbo.item_categories (category_id INT IDENTITY(1,1) PRIMARY KEY, code NVARCHAR(30) NOT NULL UNIQUE, name NVARCHAR(100) NOT NULL, is_active BIT NOT NULL DEFAULT(1), created_at DATETIME2(0) NOT NULL DEFAULT(SYSUTCDATETIME()));
  IF OBJECT_ID(N'dbo.units', N'U') IS NULL
  CREATE TABLE dbo.units (unit_id INT IDENTITY(1,1) PRIMARY KEY, code NVARCHAR(15) NOT NULL UNIQUE, name NVARCHAR(50) NOT NULL, created_at DATETIME2(0) NOT NULL DEFAULT(SYSUTCDATETIME()));
  IF OBJECT_ID(N'dbo.warehouses', N'U') IS NULL
  CREATE TABLE dbo.warehouses (warehouse_id INT IDENTITY(1,1) PRIMARY KEY, code NVARCHAR(30) NOT NULL UNIQUE, name NVARCHAR(100) NOT NULL, location NVARCHAR(200) NULL, is_active BIT NOT NULL DEFAULT(1), created_at DATETIME2(0) NOT NULL DEFAULT(SYSUTCDATETIME()));
  IF OBJECT_ID(N'dbo.items', N'U') IS NULL
  CREATE TABLE dbo.items (item_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT(NEWID()), code NVARCHAR(50) NOT NULL UNIQUE, name NVARCHAR(150) NOT NULL, category_id INT NOT NULL, unit_id INT NOT NULL, minimum_stock DECIMAL(18,3) NOT NULL DEFAULT(0), is_active BIT NOT NULL DEFAULT(1), created_at DATETIME2(0) NOT NULL DEFAULT(SYSUTCDATETIME()), updated_at DATETIME2(0) NOT NULL DEFAULT(SYSUTCDATETIME()), FOREIGN KEY(category_id) REFERENCES dbo.item_categories(category_id), FOREIGN KEY(unit_id) REFERENCES dbo.units(unit_id));
  IF OBJECT_ID(N'dbo.inventory_transactions', N'U') IS NULL
  CREATE TABLE dbo.inventory_transactions (transaction_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT(NEWID()), transaction_number NVARCHAR(50) NOT NULL UNIQUE, item_id UNIQUEIDENTIFIER NOT NULL, warehouse_id INT NOT NULL, transaction_type NVARCHAR(20) NOT NULL CHECK(transaction_type IN(N'IN',N'OUT',N'ADJUSTMENT')), quantity DECIMAL(18,3) NOT NULL CHECK(quantity > 0), reference_number NVARCHAR(100) NULL, notes NVARCHAR(500) NULL, transacted_at DATETIME2(0) NOT NULL DEFAULT(SYSUTCDATETIME()), created_by UNIQUEIDENTIFIER NULL, created_at DATETIME2(0) NOT NULL DEFAULT(SYSUTCDATETIME()), FOREIGN KEY(item_id) REFERENCES dbo.items(item_id), FOREIGN KEY(warehouse_id) REFERENCES dbo.warehouses(warehouse_id), FOREIGN KEY(created_by) REFERENCES dbo.users(user_id));
  IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name=N'IX_inventory_transactions_item' AND object_id=OBJECT_ID(N'dbo.inventory_transactions')) CREATE INDEX IX_inventory_transactions_item ON dbo.inventory_transactions(item_id, transacted_at DESC);
  INSERT dbo.item_categories(code,name) SELECT v.code,v.name FROM (VALUES(N'RAW',N'Raw Material'),(N'FG',N'Finished Goods'),(N'PACK',N'Packaging'),(N'IT',N'IT Equipment'),(N'OFFICE',N'Office Supply'))v(code,name) WHERE NOT EXISTS(SELECT 1 FROM dbo.item_categories c WHERE c.code=v.code);
  INSERT dbo.units(code,name) SELECT v.code,v.name FROM (VALUES(N'PCS',N'Pieces'),(N'KG',N'Kilogram'),(N'LTR',N'Liter'),(N'BOX',N'Box'))v(code,name) WHERE NOT EXISTS(SELECT 1 FROM dbo.units u WHERE u.code=v.code);
  INSERT dbo.warehouses(code,name,location) SELECT v.code,v.name,v.location FROM (VALUES(N'WH-UTAMA',N'Gudang Utama',N'Area Produksi'),(N'WH-FG',N'Gudang Finished Goods',N'Area Pengiriman'))v(code,name,location) WHERE NOT EXISTS(SELECT 1 FROM dbo.warehouses w WHERE w.code=v.code);
  COMMIT;
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK; THROW; END CATCH;
