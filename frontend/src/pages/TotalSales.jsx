import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axios';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getISTDateStr() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const ist = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = ist.getFullYear();
  const mm = String(ist.getMonth() + 1).padStart(2, '0');
  const dd = String(ist.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getFirstDayOfMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatINR(val) {
  const n = parseFloat(val) || 0;
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + ' Cr';
  if (n >= 100000)   return '₹' + (n / 100000).toFixed(2) + ' L';
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatINRFull(val) {
  const n = parseFloat(val) || 0;
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(s) {
  if (!s) return '—';
  const p = String(s).split('-');
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  return s;
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const COMPANY_COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4'];

// ─── Mini Bar Chart (SVG, no lib dependency) ───────────────────────────────────

function MiniBarChart({ data = [], valueKey = 'value', labelKey = 'label', color = '#3b82f6', height = 80 }) {
  if (!data.length) return <div style={{ height }} className="flex items-center justify-center text-slate-300 text-xs">No data</div>;
  const max = Math.max(...data.map(d => parseFloat(d[valueKey]) || 0), 1);
  const barW = Math.max(4, Math.floor(360 / data.length) - 3);
  const gap = 3;
  const totalW = data.length * (barW + gap);

  return (
    <svg width="100%" viewBox={`0 0 ${totalW} ${height}`} preserveAspectRatio="none" className="overflow-visible">
      {data.map((d, i) => {
        const val = parseFloat(d[valueKey]) || 0;
        const barH = Math.max(2, Math.round((val / max) * (height - 14)));
        const x = i * (barW + gap);
        const y = height - 12 - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={2} fill={color} opacity={0.85} className="transition-all duration-300"/>
            {data.length <= 12 && (
              <text x={x + barW / 2} y={height} textAnchor="middle" fontSize={8} fill="#94a3b8" fontWeight="600">
                {d[labelKey]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color = '#3b82f6', label = '', sublabel = '' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold text-slate-700">{label}</span>
        <span className="text-[11px] font-black" style={{ color }}>{sublabel}</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
        <div
          className="h-2 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ─── Donut Chart (SVG) ─────────────────────────────────────────────────────────

function DonutChart({ slices = [], size = 120 }) {
  // slices: [{label, value, color}]
  const total = slices.reduce((s, sl) => s + (parseFloat(sl.value) || 0), 0);
  if (!total) return <div style={{ width: size, height: size }} className="flex items-center justify-center text-slate-300 text-xs">No data</div>;

  const cx = size / 2, cy = size / 2, r = size * 0.38, inner = size * 0.24;
  let cumAngle = -Math.PI / 2;

  const paths = slices.map(sl => {
    const pct = (parseFloat(sl.value) || 0) / total;
    const startAngle = cumAngle;
    const sweep = pct * 2 * Math.PI;
    cumAngle += sweep;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(cumAngle);
    const y2 = cy + r * Math.sin(cumAngle);
    const xi1 = cx + inner * Math.cos(startAngle);
    const yi1 = cy + inner * Math.sin(startAngle);
    const xi2 = cx + inner * Math.cos(cumAngle);
    const yi2 = cy + inner * Math.sin(cumAngle);
    const large = sweep > Math.PI ? 1 : 0;

    return {
      d: `M ${xi1} ${yi1} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1} Z`,
      color: sl.color,
      pct: Math.round(pct * 100),
      label: sl.label
    };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.color} opacity={0.9} className="transition-all duration-300"/>
      ))}
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize={10} fontWeight="800" fill="#1e293b">Total</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize={8} fontWeight="600" fill="#64748b">collection</text>
    </svg>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color, bg, trend }) {
  return (
    <div className={`rounded-2xl border border-white shadow-sm p-5 ${bg} relative overflow-hidden`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl`} style={{ background: color + '22' }}>
          {icon}
        </div>
        {trend !== undefined && (
          <span className={`text-[10px] font-black px-2 py-1 rounded-full ${trend >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-black leading-tight" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 font-medium mt-1">{sub}</p>}
    </div>
  );
}

// ─── Tab Button ────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children, icon }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold transition-all duration-200 whitespace-nowrap ${
        active
          ? 'bg-primary text-white shadow-md shadow-primary/25'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
      }`}
    >
      <span>{icon}</span>
      {children}
    </button>
  );
}

// ─── Loading Spinner ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"/>
      <span className="text-xs text-slate-400 font-medium">Loading...</span>
    </div>
  );
}

// ─── Export helpers ────────────────────────────────────────────────────────────

function exportCSV(rows, filename) {
  if (!rows || !rows.length) return;
  const keys = Object.keys(rows[0]);
  const header = keys.join(',');
  const body = rows.map(r => keys.map(k => `"${(r[k] ?? '')}"`).join(',')).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function printTable(title, html) {
  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      h2 { color: #1e293b; }
      table { border-collapse: collapse; width: 100%; margin-top: 16px; }
      th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; font-size: 13px; }
      th { background: #f8fafc; font-weight: 700; color: #475569; }
      tr:nth-child(even) { background: #f8fafc; }
    </style></head>
    <body><h2>${title}</h2>${html}</body></html>
  `);
  w.document.close();
  setTimeout(() => { w.print(); }, 300);
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────

const TotalSales = () => {
  const today = getISTDateStr();
  const firstDay = getFirstDayOfMonth();

  // ── Filters ───────────────────────────────────────────────────────────────────
  const [startDate, setStartDate]   = useState(firstDay);
  const [endDate, setEndDate]       = useState(today);
  const [company, setCompany]       = useState('All');
  const [companies, setCompanies]   = useState([]);
  const [activeTab, setActiveTab]   = useState('overview');
  const [year, setYear]             = useState(new Date().getFullYear());

  // ── Data states ────────────────────────────────────────────────────────────────
  const [kpi, setKpi]               = useState(null);
  const [kpiCompanies, setKpiCompanies] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [products, setProducts]     = useState([]);
  const [customers, setCustomers]   = useState([]);
  const [custTotal, setCustTotal]   = useState(0);
  const [custPage, setCustPage]     = useState(1);
  const [custSearch, setCustSearch] = useState('');
  const [selectedCust, setSelectedCust] = useState(null);
  const [custInvoices, setCustInvoices] = useState([]);
  const [collection, setCollection] = useState(null);
  const [dailySales, setDailySales] = useState([]);
  const [companyComp, setCompanyComp] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);

  // ── Loading flags ──────────────────────────────────────────────────────────────
  const [loadingKpi, setLoadingKpi]       = useState(false);
  const [loadingTrend, setLoadingTrend]   = useState(false);
  const [loadingProd, setLoadingProd]     = useState(false);
  const [loadingCust, setLoadingCust]     = useState(false);
  const [loadingColl, setLoadingColl]     = useState(false);
  const [loadingComp, setLoadingComp]     = useState(false);
  const [loadingTop, setLoadingTop]       = useState(false);

  // ── Preset ranges ─────────────────────────────────────────────────────────────
  const presets = [
    { label: 'Today', start: today, end: today },
    { label: 'This Month', start: firstDay, end: today },
    {
      label: 'Last Month',
      start: (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,10); })(),
      end: (() => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0,10); })()
    },
    {
      label: 'Last 3 Months',
      start: (() => { const d = new Date(); d.setMonth(d.getMonth()-3); return d.toISOString().slice(0,10); })(),
      end: today
    },
    {
      label: 'This Year',
      start: `${new Date().getFullYear()}-01-01`,
      end: today
    }
  ];

  // ── Fetch companies list ───────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/sales-report/available-companies').then(res => {
      if (res.data.ok) setCompanies(res.data.companies);
    }).catch(() => {});
  }, []);

  // ── Fetch KPI ────────────────────────────────────────────────────────────────
  const fetchKpi = useCallback(async () => {
    setLoadingKpi(true);
    try {
      const res = await api.get('/sales-report/kpi', { params: { startDate, endDate, company } });
      if (res.data.ok) { setKpi(res.data.kpi); setKpiCompanies(res.data.companies); }
    } catch (_) {}
    setLoadingKpi(false);
  }, [startDate, endDate, company]);

  // ── Fetch Monthly Trend ───────────────────────────────────────────────────────
  const fetchTrend = useCallback(async () => {
    setLoadingTrend(true);
    try {
      const res = await api.get('/sales-report/monthly-trend', { params: { year, company } });
      if (res.data.ok) setMonthlyTrend(res.data.trend);
    } catch (_) {}
    setLoadingTrend(false);
  }, [year, company]);

  // ── Fetch Products ────────────────────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    setLoadingProd(true);
    try {
      const res = await api.get('/sales-report/product-wise', { params: { startDate, endDate, company, limit: 15 } });
      if (res.data.ok) setProducts(res.data.products);
    } catch (_) {}
    setLoadingProd(false);
  }, [startDate, endDate, company]);

  // ── Fetch Customers ───────────────────────────────────────────────────────────
  const fetchCustomers = useCallback(async () => {
    setLoadingCust(true);
    try {
      const res = await api.get('/sales-report/customer-wise', {
        params: { startDate, endDate, company, page: custPage, limit: 20, search: custSearch }
      });
      if (res.data.ok) { setCustomers(res.data.customers); setCustTotal(res.data.total); }
    } catch (_) {}
    setLoadingCust(false);
  }, [startDate, endDate, company, custPage, custSearch]);

  // ── Fetch Collection ──────────────────────────────────────────────────────────
  const fetchCollection = useCallback(async () => {
    setLoadingColl(true);
    try {
      const res = await api.get('/sales-report/collection', { params: { startDate, endDate, company } });
      if (res.data.ok) { setCollection(res.data.collection); setDailySales(res.data.daily); }
    } catch (_) {}
    setLoadingColl(false);
  }, [startDate, endDate, company]);

  // ── Fetch Company Comparison ──────────────────────────────────────────────────
  const fetchCompanyComp = useCallback(async () => {
    setLoadingComp(true);
    try {
      const res = await api.get('/sales-report/company-comparison', { params: { startDate, endDate } });
      if (res.data.ok) setCompanyComp(res.data.companies);
    } catch (_) {}
    setLoadingComp(false);
  }, [startDate, endDate]);

  // ── Fetch Top Customers ───────────────────────────────────────────────────────
  const fetchTopCustomers = useCallback(async () => {
    setLoadingTop(true);
    try {
      const res = await api.get('/sales-report/top-customers', { params: { startDate, endDate, company, limit: 10 } });
      if (res.data.ok) setTopCustomers(res.data.customers);
    } catch (_) {}
    setLoadingTop(false);
  }, [startDate, endDate, company]);

  // ── Fetch Customer Invoices (drill-down) ──────────────────────────────────────
  const fetchCustInvoices = async (phone) => {
    try {
      const res = await api.get(`/sales-report/customer-invoices/${phone}`, { params: { startDate, endDate, company } });
      if (res.data.ok) setCustInvoices(res.data.invoices);
    } catch (_) {}
  };

  // ── Initial load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchKpi();
    fetchTrend();
    fetchProducts();
    fetchCustomers();
    fetchCollection();
    fetchCompanyComp();
    fetchTopCustomers();
  }, []);  // eslint-disable-line

  // ── On filter apply ────────────────────────────────────────────────────────────
  const handleApply = () => {
    setSelectedCust(null);
    setCustPage(1);
    fetchKpi();
    fetchProducts();
    fetchCustomers();
    fetchCollection();
    fetchCompanyComp();
    fetchTopCustomers();
    if (activeTab === 'monthly') fetchTrend();
  };

  // Re-fetch when tab changes to monthly
  useEffect(() => {
    if (activeTab === 'monthly') fetchTrend();
  }, [activeTab, year, company]); // eslint-disable-line

  // Re-fetch customers on page/search change
  useEffect(() => {
    if (activeTab === 'customers') fetchCustomers();
  }, [custPage, custSearch]); // eslint-disable-line

  const handleCustDrilldown = (cust) => {
    setSelectedCust(cust);
    fetchCustInvoices(cust.customer_phone);
  };

  // ── Computed values ────────────────────────────────────────────────────────────
  const maxMonthSales = Math.max(...monthlyTrend.map(m => parseFloat(m.totalSales) || 0), 1);

  const collectionSlices = collection ? [
    { label: 'Cash', value: collection.cashTotal, color: '#10b981' },
    { label: 'UPI', value: collection.upiTotal, color: '#3b82f6' },
    { label: 'Bank', value: collection.bankTotal, color: '#8b5cf6' },
    { label: 'Credit Due', value: collection.creditTotal, color: '#f59e0b' },
  ].filter(s => parseFloat(s.value) > 0) : [];

  const maxCompSales = Math.max(...companyComp.map(c => parseFloat(c.sales) || 0), 1);
  const maxProductRev = Math.max(...products.map(p => parseFloat(p.totalRevenue) || 0), 1);
  const maxCustSales  = Math.max(...topCustomers.map(c => parseFloat(c.totalSales) || 0), 1);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in pb-16">

      {/* ── Page Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            📊 Total Sales Report
          </h1>
          <p className="text-slate-400 text-sm font-medium mt-1">
            Complete sales analytics — Finished Products only · Billing Module data
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {presets.map(p => (
            <button
              key={p.label}
              onClick={() => { setStartDate(p.start); setEndDate(p.end); }}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all ${
                startDate === p.start && endDate === p.end
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-primary/40 hover:text-primary'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all font-medium"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all font-medium"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Company</label>
            <select
              value={company}
              onChange={e => setCompany(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all font-medium"
            >
              <option value="All">All Companies</option>
              {companies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button
            onClick={handleApply}
            className="h-10 px-6 bg-primary text-white font-black text-sm rounded-xl hover:bg-blue-600 transition-colors shadow-md shadow-primary/25 flex items-center gap-2"
          >
            🔍 Apply
          </button>
          <button
            onClick={() => { setStartDate(firstDay); setEndDate(today); setCompany('All'); }}
            className="h-10 px-4 bg-slate-100 text-slate-600 font-bold text-sm rounded-xl hover:bg-slate-200 transition-colors"
          >
            Reset
          </button>
          <div className="ml-auto text-[11px] text-slate-400 font-medium hidden md:block">
            📅 {formatDate(startDate)} — {formatDate(endDate)} &nbsp;·&nbsp; {company === 'All' ? 'All Companies' : company}
          </div>
        </div>
      </div>

      {/* ── KPI CARDS ──────────────────────────────────────────────────────────── */}
      {loadingKpi ? <Spinner /> : kpi && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-4">
          <KpiCard
            icon="💰"
            label="Total Sales"
            value={formatINR(kpi.totalSales)}
            sub={`${parseInt(kpi.totalInvoices) || 0} invoices`}
            color="#3b82f6"
            bg="bg-blue-50"
          />
          <KpiCard
            icon="✅"
            label="Total Collection"
            value={formatINR(kpi.totalCollection)}
            sub={`${kpi.totalSales > 0 ? Math.round((kpi.totalCollection / kpi.totalSales) * 100) : 0}% collected`}
            color="#10b981"
            bg="bg-emerald-50"
          />
          <KpiCard
            icon="⏳"
            label="Credit Due"
            value={formatINR(kpi.totalCredit)}
            sub="Outstanding balance"
            color="#f59e0b"
            bg="bg-amber-50"
          />
          <KpiCard
            icon="👥"
            label="Unique Customers"
            value={parseInt(kpi.uniqueCustomers) || 0}
            sub={`${parseInt(kpi.totalInvoices) || 0} total invoices`}
            color="#8b5cf6"
            bg="bg-violet-50"
          />
        </div>
      )}

      {/* ── Collection Breakdown Row ────────────────────────────────────────────── */}
      {!loadingKpi && kpi && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-2xl border border-white shadow-sm p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center text-xl">💵</div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-green-600/70">Cash</p>
              <p className="text-xl font-black text-green-700">{formatINR(kpi.cashCollection)}</p>
            </div>
          </div>
          <div className="bg-blue-50 rounded-2xl border border-white shadow-sm p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-xl">📲</div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-600/70">UPI</p>
              <p className="text-xl font-black text-blue-700">{formatINR(kpi.upiCollection)}</p>
            </div>
          </div>
          <div className="bg-purple-50 rounded-2xl border border-white shadow-sm p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-xl">🏦</div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-purple-600/70">Bank</p>
              <p className="text-xl font-black text-purple-700">{formatINR(kpi.bankCollection)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── TABS ──────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        {/* Tab bar */}
        <div className="px-4 pt-4 border-b border-slate-100">
          <div className="flex gap-1 flex-wrap pb-3 overflow-x-auto">
            <TabBtn active={activeTab==='overview'}   onClick={() => setActiveTab('overview')}   icon="📈">Overview</TabBtn>
            <TabBtn active={activeTab==='monthly'}    onClick={() => setActiveTab('monthly')}    icon="📅">Monthly Trend</TabBtn>
            <TabBtn active={activeTab==='products'}   onClick={() => setActiveTab('products')}   icon="🏷️">Product-wise</TabBtn>
            <TabBtn active={activeTab==='customers'}  onClick={() => setActiveTab('customers')}  icon="👤">Customer-wise</TabBtn>
            <TabBtn active={activeTab==='collection'} onClick={() => setActiveTab('collection')} icon="💳">Collection</TabBtn>
            <TabBtn active={activeTab==='companies'}  onClick={() => setActiveTab('companies')}  icon="🏢">Company-wise</TabBtn>
            <TabBtn active={activeTab==='top'}        onClick={() => setActiveTab('top')}        icon="🏆">Top Customers</TabBtn>
          </div>
        </div>

        {/* ── TAB: OVERVIEW ────────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="p-6 space-y-6">
            {/* Company breakdown table */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide flex items-center gap-2">
                  <span>🏢</span> Company-wise Summary
                </h3>
                <button
                  onClick={() => exportCSV(kpiCompanies, `company-summary-${startDate}-to-${endDate}.csv`)}
                  className="text-[11px] font-bold text-primary bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  ↓ Export CSV
                </button>
              </div>
              {loadingKpi ? <Spinner /> : kpiCompanies.length === 0 ? (
                <p className="text-center text-slate-400 text-sm italic py-8">No data for selected period.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                        <th className="py-3 px-4 text-left">Company</th>
                        <th className="py-3 px-4 text-right">Sales</th>
                        <th className="py-3 px-4 text-right">Collected</th>
                        <th className="py-3 px-4 text-right">Credit Due</th>
                        <th className="py-3 px-4 text-right">Invoices</th>
                        <th className="py-3 px-4 text-left">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {kpiCompanies.map((c, i) => {
                        const total = kpiCompanies.reduce((s, cc) => s + (parseFloat(cc.sales)||0), 0);
                        const share = total > 0 ? ((parseFloat(c.sales)||0) / total * 100).toFixed(1) : 0;
                        return (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ background: COMPANY_COLORS[i % COMPANY_COLORS.length] }}/>
                                <span className="font-bold text-slate-800">{c.company}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-black text-primary">{formatINRFull(c.sales)}</td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-600">{formatINRFull(c.collected)}</td>
                            <td className="py-3 px-4 text-right font-bold text-amber-600">{formatINRFull(c.credit)}</td>
                            <td className="py-3 px-4 text-right text-slate-600 font-semibold">{c.invoices}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                  <div className="h-1.5 rounded-full" style={{ width: `${share}%`, background: COMPANY_COLORS[i % COMPANY_COLORS.length] }}/>
                                </div>
                                <span className="text-[10px] font-bold text-slate-500 w-8">{share}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Daily sales sparkline */}
            {dailySales.length > 0 && (
              <div>
                <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide flex items-center gap-2 mb-4">
                  <span>📉</span> Daily Sales Trend
                </h3>
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <MiniBarChart
                    data={dailySales}
                    valueKey="sales"
                    labelKey="date"
                    color="#3b82f6"
                    height={100}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: MONTHLY TREND ───────────────────────────────────────────────── */}
        {activeTab === 'monthly' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide flex items-center gap-2">
                <span>📅</span> Monthly Sales — {year}
              </h3>
              <div className="flex items-center gap-3">
                <select
                  value={year}
                  onChange={e => setYear(parseInt(e.target.value))}
                  className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 outline-none font-bold"
                >
                  {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button
                  onClick={() => exportCSV(monthlyTrend, `monthly-trend-${year}.csv`)}
                  className="text-[11px] font-bold text-primary bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  ↓ Export CSV
                </button>
              </div>
            </div>

            {loadingTrend ? <Spinner /> : (
              <>
                {/* Bar chart */}
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                  <MiniBarChart
                    data={monthlyTrend.map(m => ({ ...m, label: MONTH_SHORT[m.month-1] }))}
                    valueKey="totalSales"
                    labelKey="label"
                    color="#3b82f6"
                    height={120}
                  />
                </div>

                {/* Monthly table */}
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                        <th className="py-3 px-4 text-left">Month</th>
                        <th className="py-3 px-4 text-right">Sales</th>
                        <th className="py-3 px-4 text-right">Collection</th>
                        <th className="py-3 px-4 text-right">Credit</th>
                        <th className="py-3 px-4 text-right">Invoices</th>
                        <th className="py-3 px-4 text-left">Progress</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {monthlyTrend.map((m, i) => (
                        <tr key={i} className={`hover:bg-blue-50/30 transition-colors ${parseFloat(m.totalSales) === 0 ? 'opacity-40' : ''}`}>
                          <td className="py-3 px-4 font-bold text-slate-800">{m.month_name}</td>
                          <td className="py-3 px-4 text-right font-black text-primary">{formatINRFull(m.totalSales)}</td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-600">{formatINRFull(m.totalCollection)}</td>
                          <td className="py-3 px-4 text-right font-bold text-amber-600">{formatINRFull(m.totalCredit)}</td>
                          <td className="py-3 px-4 text-right text-slate-500 font-semibold">{m.invoices}</td>
                          <td className="py-3 px-4 w-40">
                            <div className="w-full bg-slate-100 rounded-full h-1.5">
                              <div
                                className="h-1.5 rounded-full bg-primary transition-all duration-700"
                                style={{ width: `${maxMonthSales > 0 ? ((parseFloat(m.totalSales)||0) / maxMonthSales * 100) : 0}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr className="font-black text-slate-800">
                        <td className="py-3 px-4">Total ({year})</td>
                        <td className="py-3 px-4 text-right text-primary">{formatINRFull(monthlyTrend.reduce((s, m) => s + (parseFloat(m.totalSales)||0), 0))}</td>
                        <td className="py-3 px-4 text-right text-emerald-600">{formatINRFull(monthlyTrend.reduce((s, m) => s + (parseFloat(m.totalCollection)||0), 0))}</td>
                        <td className="py-3 px-4 text-right text-amber-600">{formatINRFull(monthlyTrend.reduce((s, m) => s + (parseFloat(m.totalCredit)||0), 0))}</td>
                        <td className="py-3 px-4 text-right">{monthlyTrend.reduce((s, m) => s + (parseInt(m.invoices)||0), 0)}</td>
                        <td className="py-3 px-4"/>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAB: PRODUCT-WISE ─────────────────────────────────────────────────── */}
        {activeTab === 'products' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide flex items-center gap-2">
                <span>🏷️</span> Top Products by Revenue (Finished Products)
              </h3>
              <button
                onClick={() => exportCSV(products, `product-sales-${startDate}-to-${endDate}.csv`)}
                className="text-[11px] font-bold text-primary bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
              >
                ↓ Export CSV
              </button>
            </div>

            {loadingProd ? <Spinner /> : products.length === 0 ? (
              <p className="text-center text-slate-400 text-sm italic py-8">No product sales data for selected period.</p>
            ) : (
              <div className="space-y-3">
                {products.map((p, i) => (
                  <div key={i} className="bg-slate-50 rounded-2xl border border-slate-100 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">
                          #{i+1}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-sm truncate">{p.product_name}</p>
                          <p className="text-[11px] text-slate-400 font-medium">{parseInt(p.totalQty)} units · {p.invoiceCount} invoices · avg ₹{parseFloat(p.avgRate).toFixed(0)}/unit</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-black text-primary">{formatINRFull(p.totalRevenue)}</p>
                        <p className="text-[10px] text-slate-400">{((parseFloat(p.totalRevenue)||0) / maxProductRev * 100).toFixed(1)}% of top</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all duration-700"
                          style={{
                            width: `${(parseFloat(p.totalRevenue)||0) / maxProductRev * 100}%`,
                            background: COMPANY_COLORS[i % COMPANY_COLORS.length]
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: CUSTOMER-WISE ────────────────────────────────────────────────── */}
        {activeTab === 'customers' && (
          <div className="p-6 space-y-4">
            {selectedCust ? (
              // Drill-down view
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedCust(null)}
                    className="flex items-center gap-2 text-[12px] font-bold text-primary bg-blue-50 px-3 py-2 rounded-xl hover:bg-blue-100 transition-colors"
                  >
                    ← Back to customers
                  </button>
                  <div>
                    <p className="font-black text-slate-800">{selectedCust.customer_name}</p>
                    <p className="text-[11px] text-slate-400">{selectedCust.customer_phone} · {selectedCust.invoiceCount} invoices · {formatINRFull(selectedCust.totalSales)} total</p>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                        <th className="py-3 px-4 text-left">Bill ID</th>
                        <th className="py-3 px-4 text-left">Date</th>
                        <th className="py-3 px-4 text-left">Company</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                        <th className="py-3 px-4 text-right">Paid</th>
                        <th className="py-3 px-4 text-right">Due</th>
                        <th className="py-3 px-4 text-left">Mode</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {custInvoices.map((inv, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-4 font-bold text-primary text-xs">{inv.id}</td>
                          <td className="py-2.5 px-4 text-slate-600 font-medium">{formatDate(inv.billing_date)}</td>
                          <td className="py-2.5 px-4">
                            <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">{inv.company}</span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-black text-slate-800">{formatINRFull(inv.grand_total)}</td>
                          <td className="py-2.5 px-4 text-right font-bold text-emerald-600">{formatINRFull(inv.amount_paid)}</td>
                          <td className="py-2.5 px-4 text-right font-bold text-amber-600">{formatINRFull(inv.due_amount)}</td>
                          <td className="py-2.5 px-4 text-xs text-slate-500 font-medium">{inv.payment_mode}</td>
                        </tr>
                      ))}
                      {custInvoices.length === 0 && (
                        <tr><td colSpan="7" className="py-8 text-center text-slate-400 text-xs italic">No invoices found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              // Customer list
              <>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="Search customer name or phone..."
                    value={custSearch}
                    onChange={e => { setCustSearch(e.target.value); setCustPage(1); }}
                    className="flex-1 h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all"
                  />
                  <button
                    onClick={() => {
                      const html = `<table border="1" cellpadding="8"><tr><th>Name</th><th>Phone</th><th>Sales</th><th>Paid</th><th>Due</th><th>Invoices</th></tr>
                        ${customers.map(c => `<tr><td>${c.customer_name}</td><td>${c.customer_phone}</td><td>${formatINRFull(c.totalSales)}</td><td>${formatINRFull(c.totalPaid)}</td><td>${formatINRFull(c.totalDue)}</td><td>${c.invoiceCount}</td></tr>`).join('')}
                      </table>`;
                      printTable(`Customer-wise Sales Report — ${formatDate(startDate)} to ${formatDate(endDate)}`, html);
                    }}
                    className="text-[11px] font-bold text-slate-600 bg-slate-100 px-3 py-2 rounded-lg hover:bg-slate-200 transition-colors"
                  >🖨️ Print</button>
                  <button
                    onClick={() => exportCSV(customers, `customer-sales-${startDate}-to-${endDate}.csv`)}
                    className="text-[11px] font-bold text-primary bg-blue-50 border border-blue-100 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors"
                  >↓ CSV</button>
                </div>

                {loadingCust ? <Spinner /> : customers.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm italic py-8">No customer data found.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100">
                          <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                            <th className="py-3 px-4 text-left">#</th>
                            <th className="py-3 px-4 text-left">Customer</th>
                            <th className="py-3 px-4 text-right">Total Sales</th>
                            <th className="py-3 px-4 text-right">Paid</th>
                            <th className="py-3 px-4 text-right">Due</th>
                            <th className="py-3 px-4 text-right">Invoices</th>
                            <th className="py-3 px-4 text-left">Last Purchase</th>
                            <th className="py-3 px-4"/>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {customers.map((c, i) => (
                            <tr key={i} className="hover:bg-blue-50/30 transition-colors cursor-pointer" onClick={() => handleCustDrilldown(c)}>
                              <td className="py-2.5 px-4 text-slate-400 font-bold text-xs">{(custPage-1)*20 + i+1}</td>
                              <td className="py-2.5 px-4">
                                <p className="font-bold text-slate-800">{c.customer_name}</p>
                                <p className="text-[11px] text-slate-400 font-medium">{c.customer_phone}</p>
                              </td>
                              <td className="py-2.5 px-4 text-right font-black text-primary">{formatINRFull(c.totalSales)}</td>
                              <td className="py-2.5 px-4 text-right font-bold text-emerald-600">{formatINRFull(c.totalPaid)}</td>
                              <td className="py-2.5 px-4 text-right font-bold text-amber-600">{formatINRFull(c.totalDue)}</td>
                              <td className="py-2.5 px-4 text-right text-slate-500 font-semibold">{c.invoiceCount}</td>
                              <td className="py-2.5 px-4 text-slate-500 font-medium">{formatDate(c.lastPurchase)}</td>
                              <td className="py-2.5 px-4 text-right">
                                <span className="text-[10px] font-bold text-primary bg-blue-50 px-2 py-1 rounded-lg">View →</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Pagination */}
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-[12px] text-slate-500 font-medium">{custTotal} customers</p>
                      <div className="flex items-center gap-2">
                        <button
                          disabled={custPage <= 1}
                          onClick={() => setCustPage(p => p-1)}
                          className="h-8 px-3 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 disabled:opacity-40"
                        >
                          ← Prev
                        </button>
                        <span className="text-xs text-slate-500 font-medium">Page {custPage} of {Math.ceil(custTotal/20)}</span>
                        <button
                          disabled={custPage >= Math.ceil(custTotal/20)}
                          onClick={() => setCustPage(p => p+1)}
                          className="h-8 px-3 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 disabled:opacity-40"
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── TAB: COLLECTION ───────────────────────────────────────────────────── */}
        {activeTab === 'collection' && (
          <div className="p-6 space-y-6">
            {loadingColl ? <Spinner /> : !collection ? null : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Cash', icon: '💵', val: collection.cashTotal, color: '#10b981', bg: 'bg-emerald-50' },
                    { label: 'UPI', icon: '📲', val: collection.upiTotal, color: '#3b82f6', bg: 'bg-blue-50' },
                    { label: 'Bank Transfer', icon: '🏦', val: collection.bankTotal, color: '#8b5cf6', bg: 'bg-violet-50' },
                    { label: 'Credit Due', icon: '⏳', val: collection.creditTotal, color: '#f59e0b', bg: 'bg-amber-50' },
                  ].map((c, i) => (
                    <KpiCard key={i} icon={c.icon} label={c.label} value={formatINRFull(c.val)} color={c.color} bg={c.bg}
                      sub={`${collection.grandTotal > 0 ? ((parseFloat(c.val)||0) / parseFloat(collection.grandTotal) * 100).toFixed(1) : 0}% of total`}
                    />
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Donut */}
                  <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Payment Mode Breakdown</h4>
                    <div className="flex items-center gap-6">
                      <DonutChart slices={collectionSlices} size={130}/>
                      <div className="space-y-2.5 flex-1">
                        {collectionSlices.map((s, i) => (
                          <div key={i} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }}/>
                              <span className="text-[12px] font-bold text-slate-700">{s.label}</span>
                            </div>
                            <span className="text-[12px] font-black" style={{ color: s.color }}>{formatINRFull(s.value)}</span>
                          </div>
                        ))}
                        <div className="border-t border-slate-200 pt-2 mt-2 flex items-center justify-between">
                          <span className="text-[12px] font-black text-slate-700">Grand Total</span>
                          <span className="text-[12px] font-black text-primary">{formatINRFull(collection.grandTotal)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Daily trend */}
                  <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Daily Collection Trend</h4>
                    <MiniBarChart data={dailySales} valueKey="collected" labelKey="date" color="#10b981" height={100}/>
                  </div>
                </div>

                {/* Daily breakdown table */}
                {dailySales.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Day-wise Breakdown</h4>
                      <button
                        onClick={() => exportCSV(dailySales, `daily-collection-${startDate}-to-${endDate}.csv`)}
                        className="text-[11px] font-bold text-primary bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg"
                      >↓ Export</button>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-100 max-h-72">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                          <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                            <th className="py-3 px-4 text-left">Date</th>
                            <th className="py-3 px-4 text-right">Sales</th>
                            <th className="py-3 px-4 text-right">Collected</th>
                            <th className="py-3 px-4 text-right">Cash</th>
                            <th className="py-3 px-4 text-right">UPI</th>
                            <th className="py-3 px-4 text-right">Bank</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {dailySales.map((d, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="py-2.5 px-4 font-bold text-slate-700">{formatDate(d.date)}</td>
                              <td className="py-2.5 px-4 text-right font-black text-primary">{formatINRFull(d.sales)}</td>
                              <td className="py-2.5 px-4 text-right font-bold text-emerald-600">{formatINRFull(d.collected)}</td>
                              <td className="py-2.5 px-4 text-right text-slate-600 font-medium">{formatINRFull(d.cash)}</td>
                              <td className="py-2.5 px-4 text-right text-slate-600 font-medium">{formatINRFull(d.upi)}</td>
                              <td className="py-2.5 px-4 text-right text-slate-600 font-medium">{formatINRFull(d.bank)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── TAB: COMPANY-WISE ─────────────────────────────────────────────────── */}
        {activeTab === 'companies' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide flex items-center gap-2">
                <span>🏢</span> Company-wise Comparison
              </h3>
              <button
                onClick={() => exportCSV(companyComp, `company-comparison-${startDate}-to-${endDate}.csv`)}
                className="text-[11px] font-bold text-primary bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
              >↓ Export CSV</button>
            </div>

            {loadingComp ? <Spinner /> : companyComp.length === 0 ? (
              <p className="text-center text-slate-400 text-sm italic py-8">No data.</p>
            ) : (
              <>
                {/* Company cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {companyComp.map((c, i) => (
                    <div key={i} className="bg-slate-50 rounded-2xl border border-slate-100 p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ background: COMPANY_COLORS[i % COMPANY_COLORS.length] }}/>
                        <h4 className="font-black text-slate-800">{c.company}</h4>
                        <span className="ml-auto text-[10px] font-bold text-slate-400">{c.invoices} invoices</span>
                      </div>
                      <div className="space-y-1.5">
                        <ProgressBar
                          value={parseFloat(c.sales)||0}
                          max={maxCompSales}
                          color={COMPANY_COLORS[i % COMPANY_COLORS.length]}
                          label="Total Sales"
                          sublabel={formatINRFull(c.sales)}
                        />
                        <ProgressBar
                          value={parseFloat(c.collected)||0}
                          max={parseFloat(c.sales)||1}
                          color="#10b981"
                          label="Collected"
                          sublabel={formatINRFull(c.collected)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="bg-white rounded-xl p-2.5 border border-slate-100">
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Cash</p>
                          <p className="text-sm font-black text-emerald-600">{formatINR(c.cash)}</p>
                        </div>
                        <div className="bg-white rounded-xl p-2.5 border border-slate-100">
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">UPI</p>
                          <p className="text-sm font-black text-blue-600">{formatINR(c.upi)}</p>
                        </div>
                        <div className="bg-white rounded-xl p-2.5 border border-slate-100">
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Bank</p>
                          <p className="text-sm font-black text-purple-600">{formatINR(c.bank)}</p>
                        </div>
                        <div className="bg-white rounded-xl p-2.5 border border-slate-100">
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Customers</p>
                          <p className="text-sm font-black text-slate-700">{c.customers}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Comparison table */}
                <div className="overflow-x-auto rounded-xl border border-slate-100 mt-4">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                        <th className="py-3 px-4 text-left">Company</th>
                        <th className="py-3 px-4 text-right">Sales</th>
                        <th className="py-3 px-4 text-right">Collected</th>
                        <th className="py-3 px-4 text-right">Credit</th>
                        <th className="py-3 px-4 text-right">Cash</th>
                        <th className="py-3 px-4 text-right">UPI</th>
                        <th className="py-3 px-4 text-right">Bank</th>
                        <th className="py-3 px-4 text-right">Invoices</th>
                        <th className="py-3 px-4 text-right">Customers</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {companyComp.map((c, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ background: COMPANY_COLORS[i%COMPANY_COLORS.length] }}/>
                              <span className="font-bold text-slate-800">{c.company}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-black text-primary">{formatINRFull(c.sales)}</td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-600">{formatINRFull(c.collected)}</td>
                          <td className="py-3 px-4 text-right font-bold text-amber-600">{formatINRFull(c.credit)}</td>
                          <td className="py-3 px-4 text-right text-slate-600">{formatINRFull(c.cash)}</td>
                          <td className="py-3 px-4 text-right text-slate-600">{formatINRFull(c.upi)}</td>
                          <td className="py-3 px-4 text-right text-slate-600">{formatINRFull(c.bank)}</td>
                          <td className="py-3 px-4 text-right text-slate-600 font-semibold">{c.invoices}</td>
                          <td className="py-3 px-4 text-right text-slate-600 font-semibold">{c.customers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAB: TOP CUSTOMERS ────────────────────────────────────────────────── */}
        {activeTab === 'top' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide flex items-center gap-2">
                <span>🏆</span> Top 10 Customers by Sales
              </h3>
              <button
                onClick={() => exportCSV(topCustomers, `top-customers-${startDate}-to-${endDate}.csv`)}
                className="text-[11px] font-bold text-primary bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
              >↓ Export CSV</button>
            </div>

            {loadingTop ? <Spinner /> : topCustomers.length === 0 ? (
              <p className="text-center text-slate-400 text-sm italic py-8">No data.</p>
            ) : (
              <div className="space-y-2">
                {topCustomers.map((c, i) => (
                  <div key={i} className="bg-slate-50 rounded-2xl border border-slate-100 p-4 flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${
                      i === 0 ? 'bg-amber-100 text-amber-700' :
                      i === 1 ? 'bg-slate-200 text-slate-700' :
                      i === 2 ? 'bg-orange-100 text-orange-700' :
                      'bg-blue-50 text-primary'
                    }`}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 truncate">{c.customer_name}</p>
                      <p className="text-[11px] text-slate-400 font-medium">{c.customer_phone} · {c.invoiceCount} invoices</p>
                      <div className="mt-1.5 w-full bg-slate-200 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full transition-all duration-700"
                          style={{
                            width: `${(parseFloat(c.totalSales)||0) / maxCustSales * 100}%`,
                            background: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : COMPANY_COLORS[i % COMPANY_COLORS.length]
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black text-primary">{formatINRFull(c.totalSales)}</p>
                      <p className="text-[10px] text-emerald-600 font-bold">Paid: {formatINRFull(c.totalPaid)}</p>
                      {parseFloat(c.totalDue) > 0 && (
                        <p className="text-[10px] text-amber-600 font-bold">Due: {formatINRFull(c.totalDue)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Print Report button ─────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          onClick={() => {
            const content = `
              <h3>KPI Summary</h3>
              <table border="1" cellpadding="8">
                <tr><th>Metric</th><th>Value</th></tr>
                <tr><td>Total Sales</td><td>${formatINRFull(kpi?.totalSales)}</td></tr>
                <tr><td>Total Collection</td><td>${formatINRFull(kpi?.totalCollection)}</td></tr>
                <tr><td>Credit Due</td><td>${formatINRFull(kpi?.totalCredit)}</td></tr>
                <tr><td>Total Invoices</td><td>${kpi?.totalInvoices}</td></tr>
                <tr><td>Unique Customers</td><td>${kpi?.uniqueCustomers}</td></tr>
                <tr><td>Cash Collected</td><td>${formatINRFull(kpi?.cashCollection)}</td></tr>
                <tr><td>UPI Collected</td><td>${formatINRFull(kpi?.upiCollection)}</td></tr>
                <tr><td>Bank Collected</td><td>${formatINRFull(kpi?.bankCollection)}</td></tr>
              </table>
            `;
            printTable(`Total Sales Report — ${formatDate(startDate)} to ${formatDate(endDate)} — ${company === 'All' ? 'All Companies' : company}`, content);
          }}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white font-bold text-sm rounded-xl hover:bg-slate-700 transition-colors shadow-md"
        >
          🖨️ Print Report
        </button>
      </div>

    </div>
  );
};

export default TotalSales;
