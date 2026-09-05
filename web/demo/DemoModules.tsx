import { useMemo, useState } from "react";
import "./demo-modules.css";

const productionOrders = [
  { no: "WO-260901", product: "Sole Model A — Black", line: "Line Injection 1", target: 1200, actual: 1048, progress: 87, status: "Berjalan", due: "Hari ini, 16:00" },
  { no: "WO-260902", product: "Sole Model B — White", line: "Line Injection 2", target: 850, actual: 510, progress: 60, status: "Berjalan", due: "Hari ini, 18:30" },
  { no: "WO-260903", product: "Rubber Sheet 3 mm", line: "Mixing Line", target: 500, actual: 500, progress: 100, status: "Selesai", due: "Hari ini, 13:00" },
  { no: "WO-260904", product: "Sole Model C — Navy", line: "Line Injection 1", target: 900, actual: 0, progress: 0, status: "Terjadwal", due: "Besok, 08:00" }
];

const inspections = [
  { batch: "BTH-2609-014", product: "Sole Model A — Black", stage: "Final Inspection", sample: 80, defect: 2, inspector: "Rina P.", status: "Lulus" },
  { batch: "BTH-2609-015", product: "Sole Model B — White", stage: "In Process", sample: 50, defect: 6, inspector: "Dedi S.", status: "Ditahan" },
  { batch: "RM-2609-031", product: "EVA Resin Grade A", stage: "Incoming", sample: 20, defect: 0, inspector: "Ayu L.", status: "Lulus" },
  { batch: "BTH-2609-016", product: "Sole Model C — Navy", stage: "Final Inspection", sample: 75, defect: 0, inspector: "Belum ditugaskan", status: "Menunggu" }
];

const financeRows = [
  { date: "05 Sep 2026", no: "INV-2609-018", party: "PT Karya Alas", type: "Piutang", amount: 128500000, due: "19 Sep 2026", status: "Belum jatuh tempo" },
  { date: "04 Sep 2026", no: "BILL-2609-011", party: "CV Polimer Jaya", type: "Utang", amount: 76400000, due: "11 Sep 2026", status: "Perlu dibayar" },
  { date: "03 Sep 2026", no: "INV-2609-016", party: "PT Sepatu Prima", type: "Piutang", amount: 94250000, due: "03 Sep 2026", status: "Jatuh tempo" },
  { date: "01 Sep 2026", no: "PAY-2609-004", party: "PT Kimia Warna", type: "Pembayaran", amount: 45300000, due: "01 Sep 2026", status: "Lunas" }
];

function DemoBadge() { return <span className="demo-badge">DATA DEMO</span>; }
function Header({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="welcome module-welcome"><div><div className="title-line"><h2>{title}</h2><DemoBadge /></div><p>{description}</p></div>{action}</div>;
}
function Kpis({ items }: { items: { icon: string; tone: string; label: string; value: string; note: string }[] }) {
  return <div className="metric-grid">{items.map((item)=><article className="metric-card" key={item.label}><div className={`metric-icon ${item.tone}`}>{item.icon}</div><div><p>{item.label}</p><h3>{item.value}</h3><small className={item.tone}>{item.note}</small></div></article>)}</div>;
}
function DemoToast({ text }: { text: string }) { return text ? <div className="demo-toast">✓ {text} <small>Simulasi—tidak disimpan ke database</small></div> : null; }

function useDemoData<T extends Record<string, unknown>>(moduleCode: string, generated: T[], keyOf: (row:T)=>string) {
  const [rows,setRows]=useState<T[]>(generated); const [source,setSource]=useState<"generator"|"sql">("generator"); const [busy,setBusy]=useState(""); const [status,setStatus]=useState("Menampilkan data hasil generator.");
  async function requestSql(): Promise<T[]> {
    const token=localStorage.getItem("erp_token") ?? ""; const response=await fetch(`/api/demo/${moduleCode}`,{headers:{Authorization:`Bearer ${token}`}}); const body=await response.json(); if(!response.ok) throw new Error(body.message); return body.records as T[];
  }
  async function sync(){ setBusy("sync"); try { const token=localStorage.getItem("erp_token") ?? ""; const response=await fetch(`/api/demo/${moduleCode}/sync`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({records:generated.map((row)=>({key:keyOf(row),data:row}))})}); const body=await response.json(); if(!response.ok) throw new Error(body.message); const stored=await requestSql(); setRows(stored); setSource("sql"); setStatus(`${body.message} Data berhasil dibaca kembali.`); } catch(error){setStatus(error instanceof Error?error.message:"Sinkronisasi gagal.");} finally{setBusy("");} }
  async function load(){ setBusy("load"); try{const stored=await requestSql(); if(!stored.length) throw new Error("SQL belum berisi data modul ini. Klik Kirim ke SQL terlebih dahulu."); setRows(stored); setSource("sql"); setStatus(`${stored.length} baris berhasil dimuat dari SQL Server.`);}catch(error){setStatus(error instanceof Error?error.message:"Data SQL gagal dimuat.");}finally{setBusy("");} }
  async function exportFile(format:"pdf"|"xlsx"){ setBusy(format); try{const token=localStorage.getItem("erp_token")??""; const response=await fetch(`/api/demo/${moduleCode}/export/${format}`,{headers:{Authorization:`Bearer ${token}`}}); if(!response.ok){const body=await response.json();throw new Error(body.message);} const blob=await response.blob(); const url=URL.createObjectURL(blob); const link=document.createElement("a"); link.href=url; link.download=`erpjin-${moduleCode}.${format}`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); setStatus(`File ${format.toUpperCase()} berhasil dibuat dari data SQL.`);}catch(error){setStatus(error instanceof Error?error.message:"Ekspor gagal.");}finally{setBusy("");} }
  function generatedSource(){setRows(generated);setSource("generator");setStatus("Menampilkan kembali data hasil generator.");}
  return {rows,source,busy,status,sync,load,exportFile,generatedSource};
}

function SqlDataToolbar({ source,busy,status,onGenerator,onSync,onLoad,onExport }:{source:"generator"|"sql";busy:string;status:string;onGenerator:()=>void;onSync:()=>void;onLoad:()=>void;onExport:(format:"pdf"|"xlsx")=>void}) {
  return <article className="panel sql-toolbar"><div><strong>Sumber: {source === "sql" ? "SQL Server" : "Generator demo"}</strong><p>{status}</p></div><div><button className="link-button" onClick={onGenerator} disabled={Boolean(busy)}>Data Generator</button><button className="outline-button" onClick={onLoad} disabled={Boolean(busy)}>{busy==="load"?"Memuat...":"Muat dari SQL"}</button><button className="primary-button" onClick={onSync} disabled={Boolean(busy)}>{busy==="sync"?"Mengirim...":"Kirim ke SQL"}</button><span className="toolbar-separator"/><button className="outline-button" onClick={()=>onExport("pdf")} disabled={Boolean(busy)||source!=="sql"}>PDF</button><button className="outline-button" onClick={()=>onExport("xlsx")} disabled={Boolean(busy)||source!=="sql"}>Excel</button></div></article>;
}

export function ProductionPage() {
  const [filter, setFilter] = useState("Semua"); const [message, setMessage] = useState("");
  const demo=useDemoData("ppic",productionOrders,(row)=>row.no); const rows = filter === "Semua" ? demo.rows : demo.rows.filter((row)=>row.status === filter);
  const target=demo.rows.reduce((sum,row)=>sum+row.target,0); const actual=demo.rows.reduce((sum,row)=>sum+row.actual,0); const achievement=target?Math.round(actual/target*1000)/10:0;
  return <><Header title="PPIC & Produksi" description="Rencana produksi, kapasitas line, dan pencapaian work order hari ini." action={<button className="primary-button" onClick={()=>setMessage("Form work order siap dikembangkan pada integrasi berikutnya.")}>＋ Work Order</button>} />
    <DemoToast text={message} /><SqlDataToolbar source={demo.source} busy={demo.busy} status={demo.status} onGenerator={demo.generatedSource} onSync={demo.sync} onLoad={demo.load} onExport={demo.exportFile}/><Kpis items={[{icon:"◎",tone:"blue",label:"Target Produksi",value:`${target.toLocaleString("id-ID")} PCS`,note:`${demo.rows.length} work order`},{icon:"↗",tone:"green",label:"Realisasi",value:`${actual.toLocaleString("id-ID")} PCS`,note:`${achievement}% dari target`},{icon:"◷",tone:"orange",label:"Work Order Berjalan",value:String(demo.rows.filter((row)=>row.status==="Berjalan").length),note:"Sedang diproduksi"},{icon:"✓",tone:"violet",label:"Work Order Selesai",value:String(demo.rows.filter((row)=>row.status==="Selesai").length),note:"Berdasarkan sumber aktif"}]} />
    <div className="operations-grid"><article className="panel"><div className="panel-header"><div><h3>Jadwal Produksi</h3><p>Work order berdasarkan prioritas dan tenggat.</p></div><select className="module-select" value={filter} onChange={(e)=>setFilter(e.target.value)}><option>Semua</option><option>Berjalan</option><option>Selesai</option><option>Terjadwal</option></select></div><div className="table-wrap"><table><thead><tr><th>WORK ORDER</th><th>PRODUK / LINE</th><th>TARGET</th><th>PROGRESS</th><th>STATUS</th><th>TENGGAT</th></tr></thead><tbody>{rows.map((row)=><tr key={row.no}><td className="code">{row.no}</td><td><strong>{row.product}</strong><small className="table-sub">{row.line}</small></td><td>{row.actual.toLocaleString("id-ID")} / {row.target.toLocaleString("id-ID")}</td><td><div className="progress"><i style={{width:`${row.progress}%`}} /></div><small>{row.progress}%</small></td><td><span className={`badge ${row.status === "Selesai" ? "green" : row.status === "Berjalan" ? "blue" : "orange"}`}>{row.status}</span></td><td>{row.due}</td></tr>)}</tbody></table></div></article>
      <article className="panel capacity-card"><div className="panel-header"><div><h3>Kapasitas Line</h3><p>Beban rencana hari ini</p></div></div>{[["Injection 1",92,"Tinggi"],["Injection 2",78,"Normal"],["Mixing",64,"Normal"],["Finishing",45,"Longgar"]].map(([name,value,label])=><div className="capacity" key={name as string}><div><strong>{name}</strong><span>{label}</span></div><div className="progress"><i style={{width:`${value}%`}} /></div><small>{value}%</small></div>)}</article></div></>;
}

export function QualityPage() {
  const [status, setStatus] = useState("Semua"); const [message,setMessage]=useState("");
  const demo=useDemoData("quality",inspections,(row)=>row.batch); const rows = status === "Semua" ? demo.rows : demo.rows.filter((row)=>row.status === status);
  const totalSamples=demo.rows.reduce((sum,row)=>sum+row.sample,0); const totalDefects=demo.rows.reduce((sum,row)=>sum+row.defect,0); const passRate=demo.rows.length?Math.round(demo.rows.filter((row)=>row.status==="Lulus").length/demo.rows.length*1000)/10:0; const defectRate=totalSamples?Math.round(totalDefects/totalSamples*1000)/10:0;
  return <><Header title="Quality Control" description="Pantau inspeksi incoming, proses produksi, dan produk jadi." action={<button className="primary-button" onClick={()=>setMessage("Inspeksi demo baru berhasil disimulasikan.")}>＋ Inspeksi Baru</button>} /><DemoToast text={message} />
    <SqlDataToolbar source={demo.source} busy={demo.busy} status={demo.status} onGenerator={demo.generatedSource} onSync={demo.sync} onLoad={demo.load} onExport={demo.exportFile}/><Kpis items={[{icon:"✓",tone:"green",label:"Pass Rate",value:`${passRate}%`,note:"Dari seluruh inspeksi"},{icon:"!",tone:"orange",label:"Batch Ditahan",value:String(demo.rows.filter((row)=>row.status==="Ditahan").length),note:"Perlu tindakan korektif"},{icon:"⌕",tone:"blue",label:"Total Inspeksi",value:String(demo.rows.length),note:`${totalSamples} sampel diperiksa`},{icon:"×",tone:"violet",label:"Defect Rate",value:`${defectRate}%`,note:`${totalDefects} defect ditemukan`}]} />
    <article className="panel"><div className="panel-header"><div><h3>Daftar Inspeksi</h3><p>Sampel dan temuan kualitas terbaru.</p></div><select className="module-select" value={status} onChange={(e)=>setStatus(e.target.value)}><option>Semua</option><option>Lulus</option><option>Ditahan</option><option>Menunggu</option></select></div><div className="table-wrap"><table><thead><tr><th>BATCH</th><th>PRODUK</th><th>TAHAP</th><th>SAMPEL</th><th>DEFECT</th><th>INSPEKTOR</th><th>HASIL</th></tr></thead><tbody>{rows.map((row)=><tr key={row.batch}><td className="code">{row.batch}</td><td><strong>{row.product}</strong></td><td>{row.stage}</td><td>{row.sample} pcs</td><td className={row.defect ? "qty-minus" : "qty-plus"}>{row.defect}</td><td>{row.inspector}</td><td><span className={`badge ${row.status === "Lulus" ? "green" : row.status === "Ditahan" ? "red" : "orange"}`}>{row.status}</span></td></tr>)}</tbody></table></div></article>
    <div className="quality-grid"><article className="panel"><h3>Jenis Defect Teratas</h3>{[["Bercak warna",38],["Dimensi tidak sesuai",27],["Gelembung material",19],["Finishing kasar",16]].map(([label,value])=><div className="defect-row" key={label as string}><span>{label}</span><div className="progress"><i style={{width:`${value}%`}} /></div><strong>{value}%</strong></div>)}</article><article className="panel action-card"><span>!</span><div><h3>Tindakan Korektif</h3><strong>3 NCR masih terbuka</strong><p>1 tindakan melewati target penyelesaian.</p><button className="outline-button" onClick={()=>setMessage("Daftar NCR demo dibuka.")}>Lihat NCR</button></div></article></div></>;
}

export function FinancePage() {
  const [type,setType]=useState("Semua"); const [message,setMessage]=useState("");
  const demo=useDemoData("finance",financeRows,(row)=>row.no); const rows=type === "Semua" ? demo.rows : demo.rows.filter((row)=>row.type===type);
  const rupiah=(value:number)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value);
  const total=(type:string)=>demo.rows.filter((row)=>row.type===type).reduce((sum,row)=>sum+row.amount,0);
  return <><Header title="Finance" description="Ringkasan arus kas, piutang, utang, dan transaksi perusahaan." action={<button className="primary-button" onClick={()=>setMessage("Jurnal umum demo siap ditambahkan.")}>＋ Jurnal Umum</button>} /><DemoToast text={message} /><SqlDataToolbar source={demo.source} busy={demo.busy} status={demo.status} onGenerator={demo.generatedSource} onSync={demo.sync} onLoad={demo.load} onExport={demo.exportFile}/>
    <Kpis items={[{icon:"▤",tone:"green",label:"Total Dokumen",value:String(demo.rows.length),note:"Berdasarkan sumber aktif"},{icon:"⇢",tone:"blue",label:"Piutang Usaha",value:rupiah(total("Piutang")),note:"Dokumen piutang demo"},{icon:"⇠",tone:"orange",label:"Utang Usaha",value:rupiah(total("Utang")),note:"Dokumen utang demo"},{icon:"✓",tone:"violet",label:"Pembayaran",value:rupiah(total("Pembayaran")),note:"Transaksi lunas demo"}]} />
    <div className="finance-grid"><article className="panel"><div className="panel-header"><div><h3>Arus Kas 6 Bulan</h3><p>Perbandingan kas masuk dan keluar (juta rupiah).</p></div><span className="legend"><i /> Masuk <i /> Keluar</span></div><div className="cash-chart">{[["Apr",72,55],["Mei",84,61],["Jun",68,59],["Jul",91,70],["Agu",78,66],["Sep",96,63]].map(([month,income,outcome])=><div className="chart-column" key={month as string}><div><i className="income" style={{height:`${income}%`}}/><i className="outcome" style={{height:`${outcome}%`}}/></div><small>{month}</small></div>)}</div></article><article className="panel"><div className="panel-header"><div><h3>Komposisi Biaya</h3><p>Bulan September</p></div></div>{[["Bahan baku","46%","#3979df"],["Tenaga kerja","24%","#7d68d8"],["Overhead pabrik","18%","#e59132"],["Operasional","12%","#3ca77b"]].map(([name,value,color])=><div className="cost-row" key={name}><i style={{background:color}}/><span>{name}</span><strong>{value}</strong></div>)}</article></div>
    <article className="panel"><div className="panel-header"><div><h3>Transaksi Terbaru</h3><p>Dokumen keuangan dan status jatuh tempo.</p></div><select className="module-select" value={type} onChange={(e)=>setType(e.target.value)}><option>Semua</option><option>Piutang</option><option>Utang</option><option>Pembayaran</option></select></div><div className="table-wrap"><table><thead><tr><th>TANGGAL</th><th>DOKUMEN</th><th>MITRA</th><th>JENIS</th><th>NILAI</th><th>JATUH TEMPO</th><th>STATUS</th></tr></thead><tbody>{rows.map((row)=><tr key={row.no}><td>{row.date}</td><td className="code">{row.no}</td><td><strong>{row.party}</strong></td><td>{row.type}</td><td><strong>{rupiah(row.amount)}</strong></td><td>{row.due}</td><td><span className={`badge ${row.status==="Lunas"?"green":row.status==="Jatuh tempo"?"red":row.status==="Perlu dibayar"?"orange":"blue"}`}>{row.status}</span></td></tr>)}</tbody></table></div></article></>;
}

const reportCatalog=[
  {icon:"▣",tone:"blue",title:"Nilai & Posisi Inventory",description:"Stok, valuasi, dan barang di bawah minimum.",updated:"Diperbarui hari ini"},
  {icon:"⌁",tone:"violet",title:"Kinerja Purchasing",description:"Purchase request, supplier, dan nilai pembelian.",updated:"Diperbarui hari ini"},
  {icon:"⚙",tone:"orange",title:"Pencapaian Produksi",description:"Target, output, downtime, dan utilisasi line.",updated:"Data demo September"},
  {icon:"✓",tone:"green",title:"Analisis Quality",description:"Pass rate, defect, batch hold, dan NCR.",updated:"Data demo September"},
  {icon:"◈",tone:"blue",title:"Ringkasan Keuangan",description:"Kas, piutang, utang, laba, dan arus kas.",updated:"Data demo September"},
  {icon:"♙",tone:"violet",title:"Aktivitas Pengguna",description:"Login, perubahan akses, dan audit aktivitas.",updated:"Tersedia setelah integrasi"}
];

export function ReportsPage() {
  const [period,setPeriod]=useState("September 2026"); const [query,setQuery]=useState(""); const [message,setMessage]=useState("");
  const demo=useDemoData("reports",reportCatalog,(row)=>row.title); const reports=useMemo(()=>demo.rows.filter((r)=>r.title.toLowerCase().includes(query.toLowerCase())),[query,demo.rows]);
  function exportCsv(title:string){ const csv=`Laporan,Periode,Status\r\n"${title}","${period}","Data demo"\r\n`; const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); const link=document.createElement("a"); link.href=url; link.download=`${title.toLowerCase().replace(/\W+/g,"-")}.csv`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); setMessage(`${title} diekspor sebagai CSV demo.`); }
  return <><Header title="Laporan" description="Pusat laporan lintas modul untuk kebutuhan operasional dan manajemen." /><DemoToast text={message} /><SqlDataToolbar source={demo.source} busy={demo.busy} status={demo.status} onGenerator={demo.generatedSource} onSync={demo.sync} onLoad={demo.load} onExport={demo.exportFile}/>
    <article className="panel report-toolbar"><label>Cari laporan<input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Cari nama laporan..." /></label><label>Periode<select value={period} onChange={(e)=>setPeriod(e.target.value)}><option>September 2026</option><option>Agustus 2026</option><option>Kuartal III 2026</option><option>Tahun 2026</option></select></label><button className="outline-button" onClick={()=>setMessage(`Ringkasan ${period} berhasil dibuat dalam mode demo.`)}>Buat Ringkasan</button></article>
    <div className="report-grid">{reports.map((report)=><article className="panel report-card" key={report.title}><div className={`metric-icon ${report.tone}`}>{report.icon}</div><h3>{report.title}</h3><p>{report.description}</p><small>{report.updated} · {period}</small><div><button className="link-button" onClick={()=>setMessage(`Pratinjau ${report.title} dibuka dalam mode demo.`)}>Pratinjau</button><button className="outline-button" onClick={()=>exportCsv(report.title)}>Ekspor CSV</button></div></article>)}</div>
    {!reports.length&&<div className="panel empty-report">Tidak ada laporan yang cocok dengan pencarian.</div>}</>;
}
