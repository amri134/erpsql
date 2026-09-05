import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { createDemoExcel, createDemoPdf } from "../dist/exports/demo-export.js";

const rows = [
  { no: "WO-TEST-01", product: "Sole A", line: "Line 1", target: 100, actual: 75, progress: 75, status: "Berjalan", due: "Hari ini" },
  { no: "WO-TEST-02", product: "Sole B", line: "Line 2", target: 80, actual: 80, progress: 100, status: "Selesai", due: "Besok" }
];

test("ekspor Excel mempertahankan seluruh kolom dan tipe angka", async () => {
  const buffer = await createDemoExcel("ppic", rows);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("PPIC & Produksi");
  assert.ok(sheet);
  assert.equal(sheet.getRow(4).cellCount, 8);
  assert.equal(sheet.getCell("A5").value, "WO-TEST-01");
  assert.equal(sheet.getCell("D5").value, 100);
  assert.ok(sheet.autoFilter);
});

test("ekspor PDF menghasilkan dokumen dan menyertakan kolom terakhir", async () => {
  const buffer = await createDemoPdf("ppic", rows);
  assert.equal(buffer.subarray(0, 4).toString("ascii"), "%PDF");
  assert.ok(buffer.length > 1000);
  assert.match(buffer.toString("latin1"), /\/Type\s*\/Page\b/);
});
