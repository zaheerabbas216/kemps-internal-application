import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const GoodsHistory = () => {
  const navigate = useNavigate();

  // Data states
  const [history, setHistory] = useState([]);
  const [totalDays, setTotalDays] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 10;
  const [loading, setLoading] = useState(true);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [singleDate, setSingleDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Drilldown modal states
  const [isDrillOpen, setIsDrillOpen] = useState(false);
  const [drillData, setDrillData] = useState({
    date: '',
    productName: '',
    categoryName: '',
    unit: 'BOXES',
    type: '',
    transactions: []
  });
  const [loadingDrill, setLoadingDrill] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, [currentPage, startDate, endDate, singleDate, searchQuery]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsDrillOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await api.get('/goods-ledger/history', {
        params: {
          page: currentPage,
          limit,
          startDate,
          endDate,
          date: singleDate,
          search: searchQuery
        }
      });
      if (res.data.ok) {
        setHistory(res.data.history || []);
        setTotalDays(res.data.total || 0);
        setTotalPages(res.data.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to load finished goods history:', err);
      alert(err.response?.data?.error || 'Failed to load goods ledger history.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSingleDate('');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const getCategoryEmoji = (categoryName) => {
    const name = String(categoryName || '').toLowerCase();
    if (name.includes('water')) return '🍼';
    if (name.includes('juice') || name.includes('mango')) return '🥭';
    if (name.includes('soft') || name.includes('soda') || name.includes('drink')) return '🥤';
    return '📦';
  };

  // Helper: Extract product size / prefix group to visually separate sizes (e.g. 2L, 1L, 500ml, 300ml, 250ml, 20L)
  const getProductSizeGroup = (name) => {
    if (!name) return '';
    const trimmed = name.trim();
    const match = trimmed.match(/^(\d+(?:\.\d+)?\s*(?:l|ltr|litre|litres|ml|gm|kg|gal)?)\b/i);
    if (match && match[1]) {
      return match[1].toLowerCase().replace(/\s+/g, '').replace('ltr', 'l').replace('litre', 'l');
    }
    const words = trimmed.split(' ');
    return words[0].toLowerCase();
  };

  // Group items by category for a specific day
  const groupDayItems = (items) => {
    const groups = {};
    (items || []).forEach(item => {
      const cat = (item.category_name || 'Others').toUpperCase();
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(item);
    });
    return groups;
  };

  const calculateGroupTotals = (groupItems) => {
    let opening = 0;
    let stockIn = 0;
    let stockOut = 0;
    let stockReturn = 0;
    let closing = 0;
    groupItems.forEach(item => {
      opening += item.opening_stock || 0;
      stockIn += item.stock_in || 0;
      stockOut += item.stock_out || 0;
      stockReturn += item.stock_return || 0;
      closing += item.closing_stock || 0;
    });
    return { opening, stockIn, stockOut, stockReturn, closing };
  };

  const calculateDayGrandTotals = (items) => {
    let opening = 0;
    let stockIn = 0;
    let stockOut = 0;
    let stockReturn = 0;
    let closing = 0;
    (items || []).forEach(item => {
      opening += item.opening_stock || 0;
      stockIn += item.stock_in || 0;
      stockOut += item.stock_out || 0;
      stockReturn += item.stock_return || 0;
      closing += item.closing_stock || 0;
    });
    return { opening, stockIn, stockOut, stockReturn, closing };
  };

  // Open drilldown modal
  const handleDrilldown = async (dayDate, item, type) => {
    setLoadingDrill(true);
    setIsDrillOpen(true);
    setDrillData({
      date: dayDate,
      productName: item.product_name,
      categoryName: item.category_name,
      unit: 'BOXES',
      type,
      transactions: []
    });

    try {
      const res = await api.get('/goods-ledger/drilldown', {
        params: {
          date: dayDate,
          finishedProductId: item.finished_product_id,
          type
        }
      });
      if (res.data.ok) {
        setDrillData(prev => ({
          ...prev,
          transactions: res.data.transactions || []
        }));
      }
    } catch (err) {
      console.error('Failed to load drilldown transactions:', err);
    } finally {
      setLoadingDrill(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-12">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/goods-ledger')}
            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            ← Back to Ledger
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
              GOODS CLOSING HISTORY
            </h1>
            <p className="text-slate-500 text-xs font-semibold mt-0.5">
              Permanent archive of all automatically closed daily finished goods ledgers and snapshots
            </p>
          </div>
        </div>
        <div>
          <button
            onClick={fetchHistory}
            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* FILTER CONTROLS CARD */}
      <div className="card-premium space-y-4">
        <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center justify-between">
          <span>🔍 FILTER HISTORICAL CLOSINGS</span>
          {(startDate || endDate || singleDate || searchQuery) && (
            <button
              onClick={handleClearFilters}
              className="text-[10px] font-bold text-red-500 hover:underline cursor-pointer uppercase"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Specific Date */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-450 block uppercase tracking-wider">
              Exact Date
            </label>
            <input
              type="date"
              value={singleDate}
              onChange={(e) => {
                setSingleDate(e.target.value);
                setStartDate('');
                setEndDate('');
              }}
              className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-semibold"
            />
          </div>

          {/* Date Range: From */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-450 block uppercase tracking-wider">
              Date From
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setSingleDate('');
              }}
              className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-semibold"
            />
          </div>

          {/* Date Range: To */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-450 block uppercase tracking-wider">
              Date To
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setSingleDate('');
              }}
              className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-semibold"
            />
          </div>

          {/* Search Item */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-450 block uppercase tracking-wider">
              Search Product
            </label>
            <input
              type="text"
              placeholder="Search product / category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-semibold"
            />
          </div>
        </div>
      </div>

      {/* HISTORY CONTENT LIST */}
      {loading ? (
        <div className="card-premium py-20 text-center text-slate-400">
          <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
          Loading historical closing records...
        </div>
      ) : history.length === 0 ? (
        <div className="card-premium py-20 text-center text-slate-400 italic">
          No historical closing records found matching the selected filters.
        </div>
      ) : (
        <div className="space-y-6">
          {history.map((dayRecord) => {
            const dayGroups = groupDayItems(dayRecord.items);
            const grandTotals = calculateDayGrandTotals(dayRecord.items);

            return (
              <div 
                key={dayRecord.ledger_date}
                className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6"
              >
                {/* DAY HEADER */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white font-black text-sm tracking-wide">
                        📅 {formatDateDDMMYYYY(dayRecord.ledger_date)}
                      </span>
                      <span className="text-xs bg-emerald-50 text-emerald-700 font-bold px-3 py-1 rounded-lg border border-emerald-100 flex items-center gap-1">
                        🔒 Automatically Closed by {dayRecord.closed_by} on {dayRecord.closed_at}
                      </span>
                    </div>
                  </div>

                  {/* Summary Metric Badges */}
                  <div className="flex flex-wrap gap-4 text-xs font-bold">
                    <div className="bg-emerald-50/60 px-3 py-1.5 rounded-xl border border-emerald-100">
                      <span className="text-emerald-600 uppercase text-[9px] block">Stock IN (Prod)</span>
                      <span className="text-emerald-700 font-black">
                        +{(dayRecord.summary?.totalStockInToday || 0).toLocaleString('en-IN')} Boxes
                      </span>
                    </div>
                    <div className="bg-rose-50/60 px-3 py-1.5 rounded-xl border border-rose-100">
                      <span className="text-rose-500 uppercase text-[9px] block">Stock OUT (Load)</span>
                      <span className="text-rose-700 font-black">
                        -{(dayRecord.summary?.totalStockOutToday || 0).toLocaleString('en-IN')} Boxes
                      </span>
                    </div>
                    <div className="bg-amber-50/60 px-3 py-1.5 rounded-xl border border-amber-100">
                      <span className="text-amber-600 uppercase text-[9px] block">Return</span>
                      <span className="text-amber-700 font-black">
                        +{(dayRecord.summary?.totalStockReturnToday || 0).toLocaleString('en-IN')} Boxes
                      </span>
                    </div>
                    <div className="bg-blue-50/60 px-3 py-1.5 rounded-xl border border-blue-100">
                      <span className="text-blue-600 uppercase text-[9px] block">Closing Stock</span>
                      <span className="text-blue-800 font-black">
                        {(dayRecord.summary?.totalClosingStock || 0).toLocaleString('en-IN')} Boxes
                      </span>
                    </div>
                  </div>
                </div>

                {/* CATEGORIES ACCORDION / TABLES */}
                <div className="space-y-4">
                  {Object.keys(dayGroups).map((catName) => {
                    const groupItems = dayGroups[catName] || [];
                    const groupTotals = calculateGroupTotals(groupItems);

                    return (
                      <details
                        key={`${dayRecord.ledger_date}-${catName}`}
                        className="collapse collapse-arrow bg-[#fcfdfe] border border-slate-100 rounded-2xl"
                      >
                        <summary className="collapse-title text-xs font-black text-slate-700 uppercase tracking-wider py-3.5 px-5 cursor-pointer flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <span>{getCategoryEmoji(catName)}</span> {catName}{' '}
                            <span className="text-[11px] text-slate-400 font-semibold">
                              ({groupItems.length} {groupItems.length === 1 ? 'Item' : 'Items'})
                            </span>
                          </span>
                        </summary>

                        <div className="collapse-content px-5 pb-5 overflow-x-auto text-xs">
                          <div className="overflow-x-auto rounded-xl border border-slate-100 mt-2 bg-white">
                            <table className="table w-full">
                              <thead>
                                <tr className="bg-slate-50 text-slate-500 text-[10px] font-extrabold uppercase tracking-wider border-b border-slate-100">
                                  <th className="py-2.5 px-4 text-left w-1/3">Finished Product</th>
                                  <th className="py-2.5 px-4 text-center w-1/12">Unit</th>
                                  <th className="py-2.5 px-4 text-right">Opening</th>
                                  <th className="py-2.5 px-4 text-right text-emerald-600">+IN (Prod)</th>
                                  <th className="py-2.5 px-4 text-right text-rose-500">-OUT (Load)</th>
                                  <th className="py-2.5 px-4 text-right text-amber-600">+RETURN</th>
                                  <th className="py-2.5 px-4 text-right text-blue-600 bg-blue-50/20 w-1/6 border-l border-slate-100">=Closing</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50 font-medium">
                                {groupItems.map((item, idx) => {
                                  const currentGroup = getProductSizeGroup(item.product_name);
                                  const prevGroup = idx > 0 ? getProductSizeGroup(groupItems[idx - 1].product_name) : null;
                                  const isNewGroup = idx > 0 && currentGroup !== prevGroup;

                                  return (
                                    <React.Fragment key={idx}>
                                      {isNewGroup && (
                                        <tr className="bg-blue-50 border-y border-blue-200/80 h-3.5 select-none">
                                          <td colSpan={7} className="py-1 px-4 bg-blue-100/50"></td>
                                        </tr>
                                      )}
                                      <tr className="hover:bg-slate-50/40 transition-colors">
                                        <td className="py-2.5 px-4 text-slate-800 font-bold">
                                          {item.product_name}
                                        </td>
                                        <td className="py-2.5 px-4 text-center text-[10px] font-extrabold text-slate-400 uppercase">
                                          BOXES
                                        </td>
                                        <td 
                                          onClick={() => handleDrilldown(dayRecord.ledger_date, item, 'OPENING')}
                                          className="py-2.5 px-4 text-right font-semibold text-slate-600 hover:text-blue-600 hover:underline cursor-pointer"
                                        >
                                          {item.opening_stock.toLocaleString('en-IN')}
                                        </td>
                                        <td 
                                          onClick={() => handleDrilldown(dayRecord.ledger_date, item, 'IN')}
                                          className="py-2.5 px-4 text-right font-semibold hover:text-blue-600 hover:underline cursor-pointer"
                                        >
                                          {item.stock_in === 0 ? (
                                            <span className="text-emerald-500 font-bold">—</span>
                                          ) : (
                                            <span className="text-emerald-600">+{item.stock_in.toLocaleString('en-IN')}</span>
                                          )}
                                        </td>
                                        <td 
                                          onClick={() => handleDrilldown(dayRecord.ledger_date, item, 'OUT')}
                                          className="py-2.5 px-4 text-right font-semibold hover:text-blue-600 hover:underline cursor-pointer"
                                        >
                                          {item.stock_out === 0 ? (
                                            <span className="text-rose-500 font-bold">—</span>
                                          ) : (
                                            <span className="text-rose-500">-{item.stock_out.toLocaleString('en-IN')}</span>
                                          )}
                                        </td>
                                        <td 
                                          onClick={() => handleDrilldown(dayRecord.ledger_date, item, 'RETURN')}
                                          className="py-2.5 px-4 text-right font-semibold hover:text-blue-600 hover:underline cursor-pointer"
                                        >
                                          {item.stock_return === 0 ? (
                                            <span className="text-amber-500 font-bold">—</span>
                                          ) : (
                                            <span className="text-amber-600">+{item.stock_return.toLocaleString('en-IN')}</span>
                                          )}
                                        </td>
                                        <td 
                                          onClick={() => handleDrilldown(dayRecord.ledger_date, item, 'CLOSING')}
                                          className="py-2.5 px-4 text-right font-extrabold text-slate-800 bg-blue-50/20 border-l border-slate-100 hover:text-blue-600 hover:underline cursor-pointer"
                                        >
                                          {item.closing_stock.toLocaleString('en-IN')}
                                        </td>
                                      </tr>
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="bg-[#f8fafc] border-t border-slate-200 text-slate-700 font-extrabold text-[11px]">
                                  <td className="py-2.5 px-4">Category Total</td>
                                  <td className="py-2.5 px-4"></td>
                                  <td className="py-2.5 px-4 text-right font-black">
                                    {groupTotals.opening.toLocaleString('en-IN')}
                                  </td>
                                  <td className="py-2.5 px-4 text-right text-emerald-700 font-black">
                                    {groupTotals.stockIn === 0 ? '—' : `+${groupTotals.stockIn.toLocaleString('en-IN')}`}
                                  </td>
                                  <td className="py-2.5 px-4 text-right text-rose-700 font-black">
                                    {groupTotals.stockOut === 0 ? '—' : `-${groupTotals.stockOut.toLocaleString('en-IN')}`}
                                  </td>
                                  <td className="py-2.5 px-4 text-right text-amber-700 font-black">
                                    {groupTotals.stockReturn === 0 ? '—' : `+${groupTotals.stockReturn.toLocaleString('en-IN')}`}
                                  </td>
                                  <td className="py-2.5 px-4 text-right text-slate-800 bg-blue-50/30 border-l border-slate-200 font-black">
                                    {groupTotals.closing.toLocaleString('en-IN')}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      </details>
                    );
                  })}
                </div>

                {/* DAY GRAND TOTAL FOOTER */}
                <div className="bg-[#0b1329] text-white py-3 px-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  <span className="font-heading font-black tracking-wider uppercase">
                    {formatDateDDMMYYYY(dayRecord.ledger_date)} Total Movements (Boxes)
                  </span>
                  <div className="flex flex-wrap gap-6 text-right justify-end">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Opening</span>
                      <span className="font-black">{grandTotals.opening.toLocaleString('en-IN')}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest block">Stock IN</span>
                      <span className="font-black text-emerald-400">+{grandTotals.stockIn.toLocaleString('en-IN')}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-rose-400 uppercase tracking-widest block">Stock OUT</span>
                      <span className="font-black text-rose-400">-{grandTotals.stockOut.toLocaleString('en-IN')}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest block">Return</span>
                      <span className="font-black text-amber-400">+{grandTotals.stockReturn.toLocaleString('en-IN')}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-blue-300 uppercase tracking-widest block">Closing</span>
                      <span className="font-black text-blue-300">{grandTotals.closing.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* PAGINATION CONTROLS */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-slate-200">
              <span className="text-xs text-slate-500 font-semibold">
                Showing page {currentPage} of {totalPages} ({totalDays} closed days archived)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  ← Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCurrentPage(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      currentPage === p
                        ? 'bg-primary border-primary text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DRILL DOWN AUDIT TRAIL MODAL */}
      {isDrillOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto"
          onClick={() => setIsDrillOpen(false)}
        >
          <div 
            className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[750px] h-[520px] p-8 flex flex-col overflow-hidden pointer-events-auto relative animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsDrillOpen(false)}
              className="absolute right-6 top-6 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-sm text-slate-500 transition-colors"
            >
              ✕
            </button>
            <h3 className="text-xl font-heading font-black text-slate-800 mb-1 uppercase tracking-tight">
              🔍 Finished Goods Movement Audit Trail
            </h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-6">
              {drillData.categoryName} — {drillData.productName} ({drillData.unit}) | Type: {drillData.type} on {formatDateDDMMYYYY(drillData.date)}
            </p>

            <div className="flex-1 overflow-y-auto border border-slate-100 rounded-2xl">
              {loadingDrill ? (
                <div className="py-20 text-center text-slate-400">
                  <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
                  Loading contributing transactions...
                </div>
              ) : drillData.transactions.length === 0 ? (
                <div className="py-20 text-center text-slate-400 font-semibold italic">
                  No transactions recorded on this day.
                </div>
              ) : (
                <table className="table table-zebra table-compact w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                    <tr className="text-slate-555 font-black uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4 text-left">Date</th>
                      <th className="py-3 px-4 text-left">Ref Number</th>
                      <th className="py-3 px-4 text-left">Type</th>
                      <th className="py-3 px-4 text-left">Module Source</th>
                      <th className="py-3 px-4 text-right">Quantity</th>
                      <th className="py-3 px-4 text-center">User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillData.transactions.map((tx, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-550">
                          {formatDateDDMMYYYY(tx.date.toString().split('T')[0])}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-primary">
                          {tx.reference}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                            tx.type === 'Stock IN' || tx.type === 'Opening Baseline' || tx.type === 'Stock RETURN'
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-rose-50 text-rose-500'
                          }`}>
                            {tx.type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-semibold">
                          {tx.source}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-slate-800">
                          {tx.type === 'Stock OUT' ? '-' : ''}
                          {parseFloat(tx.quantity).toLocaleString('en-IN')} {drillData.unit}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-500 font-semibold">
                          {tx.user}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Total Footer inside modal */}
            {!loadingDrill && drillData.transactions.length > 0 && (
              <div className="bg-[#f8fafc] border border-slate-100 rounded-2xl p-4 mt-6 flex justify-between items-center text-xs font-bold shrink-0">
                <span className="text-slate-550 uppercase tracking-wider">Summary Balance:</span>
                <span className="font-black text-sm text-slate-800">
                  {drillData.transactions.reduce((sum, tx) => {
                    const q = parseFloat(tx.quantity) || 0;
                    return tx.type === 'Stock OUT' ? sum - q : sum + q;
                  }, 0).toLocaleString('en-IN')} {drillData.unit}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GoodsHistory;
