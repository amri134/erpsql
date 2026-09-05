SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.demo_module_records',N'U') IS NULL
  CREATE TABLE dbo.demo_module_records(
    module_code NVARCHAR(30) NOT NULL,
    record_key NVARCHAR(100) NOT NULL,
    payload NVARCHAR(MAX) NOT NULL,
    sort_order INT NOT NULL CONSTRAINT DF_demo_module_records_sort DEFAULT(0),
    synced_by UNIQUEIDENTIFIER NULL,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_demo_module_records_created DEFAULT(SYSUTCDATETIME()),
    updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_demo_module_records_updated DEFAULT(SYSUTCDATETIME()),
    CONSTRAINT PK_demo_module_records PRIMARY KEY(module_code,record_key),
    CONSTRAINT CK_demo_module_records_json CHECK(ISJSON(payload)=1),
    CONSTRAINT FK_demo_module_records_user FOREIGN KEY(synced_by) REFERENCES dbo.users(user_id)
  );

  IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name=N'IX_demo_module_records_updated' AND object_id=OBJECT_ID(N'dbo.demo_module_records'))
    CREATE INDEX IX_demo_module_records_updated ON dbo.demo_module_records(module_code,updated_at DESC);

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
