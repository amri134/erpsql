import { FormEvent, useEffect, useState } from "react";

type PurchaseRequest = { purchaseRequestId: string; requestNumber: string; supplier: string; requestedBy: string; status: "SUBMITTED" | "APPROVED" | "REJECTED"; expectedDate: string | null; createdAt: string; lineCount: number; totalValue: number };
type MasterData = { suppliers: { supplierId: number; code: string; name: string }[]; items: { itemId: string; code: string; name: string; unit: string }[] };
type RequestLine = { itemId: string; quantity: string; estimatedUnitPrice: string; notes: string };

const emptyLine = (): RequestLine => ({ itemId: "", quantity: "", estimatedUnitPrice: "0", notes: "" });
const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export function PurchasingPage({ token, canManage, canApprove }: { token: string; canManage: boolean; canApprove: boolean }) {
  const [data, setData] = useState<{ summary: { totalRequests: number; waitingApproval: number; approved: number; totalValue: number }; requests: PurchaseRequest[] } | null>(null);
  const [masters, setMasters] = useState<MasterData>({ suppliers: [], items: [] });
  const [mode, setMode] = useState<"request" | "supplier" | null>(null);
  const [message, setMessage] = useState("Memuat data Purchasing...");
  const [supplierForm, setSupplierForm] = useState({ code: "", name: "", contactPerson: "", phone: "", email: "", address: "" });
  const [requestForm, setRequestForm] = useState({ supplierId: "", expectedDate: "", notes: "", items: [emptyLine()] });
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  async function load() {
    try {
      const [overviewResponse, masterResponse] = await Promise.all([fetch("/api/purchasing/overview", { headers }), fetch("/api/purchasing/master-data", { headers })]);
      const overview = await overviewResponse.json(); const master = await masterResponse.json();
      if (!overviewResponse.ok) throw new Error(overview.message); if (!masterResponse.ok) throw new Error(master.message);
      setData(overview); setMasters(master); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Data Purchasing gagal dimuat."); }
  }

  useEffect(() => { void load(); }, [token]);

  function updateLine(index: number, key: keyof RequestLine, value: string) {
    setRequestForm((current) => ({ ...current, items: current.items.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line) }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const supplierMode = mode === "supplier";
    const response = await fetch(supplierMode ? "/api/purchasing/suppliers" : "/api/purchasing/requests", { method: "POST", headers, body: JSON.stringify(supplierMode ? supplierForm : requestForm) });
    const body = await response.json(); setMessage(body.message);
    if (response.ok) {
      setMode(null); setSupplierForm({ code: "", name: "", contactPerson: "", phone: "", email: "", address: "" }); setRequestForm({ supplierId: "", expectedDate: "", notes: "", items: [emptyLine()] }); await load();
    }
  }

  async function decide(request: PurchaseRequest, decision: "APPROVED" | "REJECTED") {
    const reason = decision === "REJECTED" ? window.prompt("Masukkan alasan penolakan:") : "";
    if (decision === "REJECTED" && !reason) return;
    const response = await fetch(`/api/purchasing/requests/${request.purchaseRequestId}/decision`, { method: "PATCH", headers, body: JSON.stringify({ decision, reason }) });
    const body = await response.json(); setMessage(body.message); if (response.ok) await load();
  }

  return <>
    <div className="welcome"><div><h2>Purchasing</h2><p>Kelola supplier, pengajuan pembelian, dan persetujuan.</p></div>{canManage && <div className="inventory-actions"><button className="outline-button" onClick={() => setMode("supplier")}>＋ Supplier</button><button className="primary-button" onClick={() => setMode("request")}>＋ Purchase Request</button></div>}</div>
    {mode && <form className="panel entry-form purchasing-form" onSubmit={submit}><div className="panel-header"><div><h3>{mode === "supplier" ? "Supplier Baru" : "Purchase Request Baru"}</h3><p>{mode === "supplier" ? "Tambahkan mitra pemasok aktif." : "Ajukan satu atau beberapa barang untuk persetujuan."}</p></div><button type="button" className="link-button" onClick={() => setMode(null)}>Tutup ×</button></div>
      {mode === "supplier" ? <div className="form-grid"><label>Kode<input value={supplierForm.code} onChange={(event) => setSupplierForm({...supplierForm,code:event.target.value})} required /></label><label>Nama Supplier<input value={supplierForm.name} onChange={(event) => setSupplierForm({...supplierForm,name:event.target.value})} required /></label><label>Contact Person<input value={supplierForm.contactPerson} onChange={(event) => setSupplierForm({...supplierForm,contactPerson:event.target.value})} /></label><label>Telepon<input value={supplierForm.phone} onChange={(event) => setSupplierForm({...supplierForm,phone:event.target.value})} /></label><label>Email<input type="email" value={supplierForm.email} onChange={(event) => setSupplierForm({...supplierForm,email:event.target.value})} /></label><label>Alamat<input value={supplierForm.address} onChange={(event) => setSupplierForm({...supplierForm,address:event.target.value})} /></label></div> : <><div className="form-grid"><label>Supplier<select value={requestForm.supplierId} onChange={(event) => setRequestForm({...requestForm,supplierId:event.target.value})} required><option value="">Pilih supplier</option>{masters.suppliers.map((supplier) => <option key={supplier.supplierId} value={supplier.supplierId}>{supplier.code} — {supplier.name}</option>)}</select></label><label>Tanggal Diharapkan<input type="date" value={requestForm.expectedDate} onChange={(event) => setRequestForm({...requestForm,expectedDate:event.target.value})} /></label><label>Catatan<input value={requestForm.notes} onChange={(event) => setRequestForm({...requestForm,notes:event.target.value})} /></label></div>
        <div className="request-lines"><div className="line-header"><strong>Detail Barang</strong><button type="button" className="link-button" onClick={() => setRequestForm((current) => ({...current,items:[...current.items,emptyLine()]}))}>＋ Tambah baris</button></div>{requestForm.items.map((line,index) => <div className="request-line" key={index}><select value={line.itemId} onChange={(event) => updateLine(index,"itemId",event.target.value)} required><option value="">Pilih barang</option>{masters.items.map((item) => <option key={item.itemId} value={item.itemId}>{item.code} — {item.name} ({item.unit})</option>)}</select><input type="number" min="0.001" step="0.001" placeholder="Qty" value={line.quantity} onChange={(event) => updateLine(index,"quantity",event.target.value)} required /><input type="number" min="0" step="0.01" placeholder="Estimasi harga" value={line.estimatedUnitPrice} onChange={(event) => updateLine(index,"estimatedUnitPrice",event.target.value)} required /><input placeholder="Catatan" value={line.notes} onChange={(event) => updateLine(index,"notes",event.target.value)} /><button type="button" className="line-remove" disabled={requestForm.items.length===1} onClick={() => setRequestForm((current) => ({...current,items:current.items.filter((_,lineIndex)=>lineIndex!==index)}))}>×</button></div>)}</div></>}
      <div className="form-submit"><span className="muted">{message}</span><button className="primary-button">{mode === "supplier" ? "Simpan Supplier" : "Ajukan Purchase Request"}</button></div>
    </form>}
    {message && <div className="connection-result user-message"><span>{message}</span></div>}
    <div className="metric-grid"><article className="metric-card"><div className="metric-icon blue">⌁</div><div><p>Total Purchase Request</p><h3>{data?.summary.totalRequests ?? "—"}</h3><small className="blue">Seluruh pengajuan</small></div></article><article className="metric-card"><div className="metric-icon orange">!</div><div><p>Menunggu Persetujuan</p><h3>{data?.summary.waitingApproval ?? "—"}</h3><small className="orange">Perlu keputusan</small></div></article><article className="metric-card"><div className="metric-icon green">✓</div><div><p>Disetujui</p><h3>{data?.summary.approved ?? "—"}</h3><small className="green">Purchase request</small></div></article><article className="metric-card"><div className="metric-icon violet">Rp</div><div><p>Nilai Disetujui</p><h3>{data ? currency.format(data.summary.totalValue) : "—"}</h3><small className="violet">Estimasi pembelian</small></div></article></div>
    <article className="panel"><div className="panel-header"><div><h3>Daftar Purchase Request</h3><p>Pengajuan terbaru dan status persetujuannya.</p></div></div>{data?.requests.length ? <div className="table-wrap"><table><thead><tr><th>NOMOR</th><th>SUPPLIER</th><th>PEMOHON</th><th>DETAIL</th><th>NILAI</th><th>STATUS</th><th>AKSI</th></tr></thead><tbody>{data.requests.map((request) => <tr key={request.purchaseRequestId}><td className="code">{request.requestNumber}</td><td><strong>{request.supplier}</strong><div className="muted">{request.expectedDate ? `Diharapkan ${new Date(request.expectedDate).toLocaleDateString("id-ID")}` : "Tanpa tanggal"}</div></td><td>{request.requestedBy}</td><td>{request.lineCount} barang</td><td>{currency.format(request.totalValue)}</td><td><span className={`badge ${request.status === "APPROVED" ? "green" : request.status === "REJECTED" ? "red" : "orange"}`}>{request.status}</span></td><td>{canApprove && request.status === "SUBMITTED" ? <div className="table-actions"><button className="link-button approve-link" onClick={() => decide(request,"APPROVED")}>Setujui</button><button className="link-button reject-link" onClick={() => decide(request,"REJECTED")}>Tolak</button></div> : <span className="muted">—</span>}</td></tr>)}</tbody></table></div> : <p className="muted">{message || "Belum ada Purchase Request."}</p>}</article>
  </>;
}
