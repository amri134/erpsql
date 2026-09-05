SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  INSERT INTO dbo.role_permissions (role_id, permission_id)
  SELECT roles.role_id, permissions.permission_id
  FROM (VALUES
    (N'manager', N'inventory.read'),
    (N'warehouse_staff', N'inventory.read'),
    (N'warehouse_staff', N'inventory.manage'),
    (N'ppic_staff', N'inventory.read'),
    (N'qc_staff', N'inventory.read'),
    (N'finance_staff', N'inventory.read')
  ) AS defaults(role_code, permission_code)
  JOIN dbo.roles ON roles.code = defaults.role_code
  JOIN dbo.permissions ON permissions.code = defaults.permission_code
  WHERE NOT EXISTS (
    SELECT 1 FROM dbo.role_permissions existing
    WHERE existing.role_id = roles.role_id
      AND existing.permission_id = permissions.permission_id
  );

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
