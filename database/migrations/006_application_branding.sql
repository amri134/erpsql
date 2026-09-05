SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.application_settings',N'U') IS NULL
  CREATE TABLE dbo.application_settings(
    setting_key NVARCHAR(50) NOT NULL CONSTRAINT PK_application_settings PRIMARY KEY,
    setting_value NVARCHAR(200) NOT NULL,
    updated_by UNIQUEIDENTIFIER NULL,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_application_settings_created DEFAULT(SYSUTCDATETIME()),
    updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_application_settings_updated DEFAULT(SYSUTCDATETIME()),
    CONSTRAINT FK_application_settings_user FOREIGN KEY(updated_by) REFERENCES dbo.users(user_id)
  );

  IF NOT EXISTS(SELECT 1 FROM dbo.application_settings WHERE setting_key=N'app_name')
    INSERT dbo.application_settings(setting_key,setting_value) VALUES(N'app_name',N'ERPJIN');

  IF NOT EXISTS(SELECT 1 FROM dbo.application_settings WHERE setting_key=N'company_name')
    INSERT dbo.application_settings(setting_key,setting_value) VALUES(N'company_name',N'PT Hajijin Amri');

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
