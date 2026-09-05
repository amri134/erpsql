import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

type DemoRow = Record<string, unknown>;
const moduleNames: Record<string,string> = { ppic: "PPIC & Produksi", quality: "Quality Control", finance: "Finance", reports: "Laporan" };

function label(key: string): string { return key.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/_/g," ").replace(/^./,(value)=>value.toUpperCase()); }
function display(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function createDemoExcel(moduleCode: string, rows: DemoRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERPJIN - PT Hajijin Amri";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(moduleNames[moduleCode] ?? moduleCode, { views: [{ state: "frozen", ySplit: 4 }] });
  const keys = [...new Set(rows.flatMap((row)=>Object.keys(row)))];
  sheet.mergeCells(1,1,1,Math.max(keys.length,1));
  const title = sheet.getCell(1,1); title.value = `ERPJIN - ${moduleNames[moduleCode] ?? moduleCode}`; title.font = { bold:true,size:18,color:{argb:"FFFFFFFF"} }; title.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF17315C"}}; title.alignment={vertical:"middle"};
  sheet.getRow(1).height=34;
  sheet.mergeCells(2,1,2,Math.max(keys.length,1)); sheet.getCell(2,1).value=`PT Hajijin Amri | Data demo dari SQL | ${new Date().toLocaleString("id-ID")}`; sheet.getCell(2,1).font={italic:true,color:{argb:"FF637087"}};
  const header = sheet.getRow(4); header.values=keys.map(label); header.font={bold:true,color:{argb:"FFFFFFFF"}}; header.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF2F6FD3"}};
  for (const row of rows) sheet.addRow(keys.map((key)=>row[key] instanceof Date ? row[key] : typeof row[key] === "number" ? row[key] : display(row[key])));
  keys.forEach((key,index)=>{ const column=sheet.getColumn(index+1); const max=Math.max(label(key).length,...rows.map((row)=>display(row[key]).length)); column.width=Math.min(Math.max(max+3,12),38); });
  sheet.autoFilter={from:{row:4,column:1},to:{row:Math.max(4,rows.length+4),column:Math.max(keys.length,1)}};
  sheet.eachRow((row,rowNumber)=>{ if(rowNumber>4){ row.alignment={vertical:"top",wrapText:true}; if(rowNumber%2===0) row.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF4F7FB"}}; }});
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function createDemoPdf(moduleCode: string, rows: DemoRow[]): Promise<Buffer> {
  const keys=[...new Set(rows.flatMap((row)=>Object.keys(row)))].slice(0,8);
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:"A4",layout:"landscape",margin:36,bufferPages:true}); const chunks:Buffer[]=[];
    doc.on("data",(chunk)=>chunks.push(Buffer.from(chunk))); doc.on("end",()=>resolve(Buffer.concat(chunks))); doc.on("error",reject);
    doc.rect(0,0,842,72).fill("#17315c"); doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text(`ERPJIN - ${moduleNames[moduleCode] ?? moduleCode}`,36,24);
    doc.fillColor("#65748b").font("Helvetica").fontSize(9).text(`PT Hajijin Amri | Data demo dari SQL | Dicetak ${new Date().toLocaleString("id-ID")}`,36,86);
    const startX=36, tableWidth=770, columnWidth=tableWidth/Math.max(keys.length,1); let y=112;
    const fontSize=keys.length>6?6.5:8;
    const header=()=>{ doc.rect(startX,y,tableWidth,24).fill("#2f6fd3"); doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(fontSize); keys.forEach((key,index)=>doc.text(label(key),startX+index*columnWidth+4,y+8,{width:columnWidth-8,ellipsis:true})); y+=24; };
    header();
    rows.forEach((row,rowIndex)=>{ if(y>530){ doc.addPage(); y=40; header(); } const height=34; if(rowIndex%2===1) doc.rect(startX,y,tableWidth,height).fill("#f4f7fb"); doc.fillColor("#26364d").font("Helvetica").fontSize(fontSize-.3); keys.forEach((key,index)=>doc.text(display(row[key]),startX+index*columnWidth+4,y+7,{width:columnWidth-8,height:22,ellipsis:true})); doc.moveTo(startX,y+height).lineTo(startX+tableWidth,y+height).strokeColor("#e1e7ef").stroke(); y+=height; });
    const pages=doc.bufferedPageRange(); for(let index=0;index<pages.count;index++){ doc.switchToPage(index); doc.fillColor("#8290a5").fontSize(8).text(`Halaman ${index+1} dari ${pages.count}`,700,540,{width:106,align:"right",lineBreak:false}); }
    doc.end();
  });
}
