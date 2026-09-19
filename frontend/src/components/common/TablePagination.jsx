import React from 'react';

/**
 * Helper utility to return tailwind padding & typography classes based on density selection
 * @param {string} density - 'compact' | 'medium' | 'relaxed' | 'high'
 * @param {boolean} isHeader - whether styling <th> or <td>
 * @returns {string} Tailwind class string
 */
export const getDensityClass = (density = 'medium', isHeader = false) => {
  const d = String(density || 'medium').toLowerCase();
  const isCompact = d === 'compact';
  const isHigh = d === 'relaxed' || d === 'high';

  if (isHeader) {
    if (isCompact) return 'py-2 px-3 text-[10px] tracking-wider';
    if (isHigh) return 'py-5 px-6 text-xs tracking-wider';
    return 'py-3.5 px-4 text-[11px] tracking-wider'; // medium default
  } else {
    if (isCompact) return 'py-2 px-3 text-xs';
    if (isHigh) return 'py-5 px-6 text-[14px]';
    return 'py-3.5 px-4 text-[13px]'; // medium default
  }
};

/**
 * Reusable Table Pagination & View Density Controls
 * Implements:
 * - Rows per page select dropdown (10, 25, 50, 100)
 * - Page number select dropdown (Jump to page) + Total Pages display
 * - Previous / Next navigation controls (‹ / ›)
 * - View Density / View-Mode selector (Compact, Medium, High/Spacious)
 */
const TablePagination = ({
  page = 1,
  setPage,
  onPageChange,
  limit = 10,
  setLimit,
  onLimitChange,
  total,
  totalItems,
  density = 'medium',
  setDensity,
  onDensityChange
}) => {
  const handlePageChange = onPageChange || setPage;
  const handleLimitChange = onLimitChange || setLimit;
  const handleDensityChange = onDensityChange || setDensity;
  const totalCount = total !== undefined ? total : (totalItems !== undefined ? totalItems : 0);

  const totalPages = Math.max(1, Math.ceil(totalCount / limit) || 1);

  // Map density value to select option ('high' -> 'relaxed' for backwards compatibility)
  const currentDensity = density === 'high' ? 'relaxed' : (density || 'medium');

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-slate-50/80 border-t border-slate-200/70 text-xs font-semibold text-slate-600 rounded-b-2xl">
      
      {/* Left: Rows per page & View Density */}
      <div className="flex flex-wrap items-center gap-4">
        
        {/* Rows per page selector */}
        {handleLimitChange && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rows per page:</span>
            <select
              value={limit}
              onChange={(e) => {
                handleLimitChange(Number(e.target.value));
                if (handlePageChange) handlePageChange(1);
              }}
              className="h-8 px-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer shadow-sm"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        )}

        {/* View Mode (Density) Selector */}
        {handleDensityChange && (
          <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">View Mode:</span>
            <select
              value={currentDensity}
              onChange={(e) => handleDensityChange(e.target.value)}
              className="h-8 px-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer shadow-sm"
            >
              <option value="compact">Compact</option>
              <option value="medium">Medium</option>
              <option value="relaxed">High</option>
            </select>
          </div>
        )}
      </div>

      {/* Right: Page Navigation (Page <Select> of <TotalPages> + Prev / Next Arrows) */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-500">Page</span>
          <select
            value={Math.min(page, totalPages)}
            onChange={(e) => handlePageChange && handlePageChange(Number(e.target.value))}
            className="h-8 px-2 rounded-xl border border-slate-200 bg-white text-primary font-black text-xs focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer shadow-sm"
          >
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <span className="text-xs font-bold text-slate-500">
            of <strong className="text-slate-800 font-black">{totalPages}</strong>
          </span>
          <span className="text-[11px] text-slate-400 font-medium ml-1">
            ({totalCount} entries total)
          </span>
        </div>

        {/* Prev / Next Arrows */}
        <div className="flex items-center gap-1.5 ml-2">
          <button
            type="button"
            onClick={() => handlePageChange && handlePageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="w-8 h-8 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 flex items-center justify-center font-bold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm active:scale-95"
            title="Previous Page"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => handlePageChange && handlePageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="w-8 h-8 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 flex items-center justify-center font-bold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm active:scale-95"
            title="Next Page"
          >
            ›
          </button>
        </div>
      </div>

    </div>
  );
};

export default TablePagination;
