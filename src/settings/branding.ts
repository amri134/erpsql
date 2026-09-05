import sql from "mssql";

export type Branding = { appName: string; companyName: string };
export const defaultBranding: Branding = { appName: "ERPJIN", companyName: "PT Hajijin Amri" };

export function parseBranding(value: Record<string, unknown>): Branding | null {
  const appName=typeof value.appName==="string"?value.appName.trim():"";
  const companyName=typeof value.companyName==="string"?value.companyName.trim():"";
  if(appName.length<2 || appName.length>40 || companyName.length<2 || companyName.length>120 || /[\u0000-\u001f]/.test(appName+companyName)) return null;
  return {appName,companyName};
}

export async function readBranding(connection: sql.ConnectionPool): Promise<Branding> {
  const result=await connection.request().query<{settingKey:string;settingValue:string}>("SELECT setting_key AS settingKey,setting_value AS settingValue FROM dbo.application_settings WHERE setting_key IN(N'app_name',N'company_name');");
  const values=new Map(result.recordset.map((row)=>[row.settingKey,row.settingValue]));
  return {appName:values.get("app_name")||defaultBranding.appName,companyName:values.get("company_name")||defaultBranding.companyName};
}

export async function saveBranding(connection: sql.ConnectionPool, branding: Branding, userId: string | null): Promise<void> {
  for(const [key,value] of [["app_name",branding.appName],["company_name",branding.companyName]] as const){
    await connection.request().input("key",sql.NVarChar(50),key).input("value",sql.NVarChar(200),value).input("userId",sql.UniqueIdentifier,userId).query(`
      IF EXISTS(SELECT 1 FROM dbo.application_settings WITH(UPDLOCK,HOLDLOCK) WHERE setting_key=@key)
        UPDATE dbo.application_settings SET setting_value=@value,updated_by=@userId,updated_at=SYSUTCDATETIME() WHERE setting_key=@key;
      ELSE INSERT dbo.application_settings(setting_key,setting_value,updated_by) VALUES(@key,@value,@userId);
    `);
  }
}
