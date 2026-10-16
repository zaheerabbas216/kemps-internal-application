import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * SearchableSelect — A dropdown with a built-in search bar.
 *
 * Props:
 *   options           {Array}     Array of { value, label } objects
 *   value             {string}    Currently selected value
 *   onChange          {Function}  Called with (value, option) on selection
 *   placeholder       {string}    Text shown when no option is selected
 *   searchPlaceholder {string}    Placeholder for the search input
 *   className         {string}    Extra classes for the trigger button
 *   disabled          {boolean}   Disable the dropdown
 *   emptyMessage      {string}    Text shown when no options match the search
 */
const SearchableSelect = ({
  options = [],
  value = '',
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  className = '',
  disabled = false,
  emptyMessage = 'No options found',
  onNextFocus = null
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [searchError, setSearchError] = useState('');

  const containerRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  // Derive the selected label for display
  const selectedOption = options.find(opt => String(opt.value) === String(value));
  const displayLabel = selectedOption ? (selectedOption.rawName || selectedOption.label) : placeholder;

  // Filter options based on search (prioritizing exact code matches to the top)
  const filtered = search.trim()
    ? options
        .filter(opt => {
          const qLower = search.trim().toLowerCase();
          const qUpper = search.trim().toUpperCase();
          const optCode = opt.code ? String(opt.code).toUpperCase() : '';
          const optName = String(opt.rawName || opt.label || '').toLowerCase();
          const optBadge = opt.badge ? String(opt.badge).toLowerCase() : '';
          return optCode.includes(qUpper) || optName.includes(qLower) || optBadge.includes(qLower);
        })
        .sort((a, b) => {
          const qUpper = search.trim().toUpperCase();
          const aCode = a.code ? String(a.code).toUpperCase() : '';
          const bCode = b.code ? String(b.code).toUpperCase() : '';
          const aExact = aCode === qUpper;
          const bExact = bCode === qUpper;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          return 0;
        })
    : options;

  // Open dropdown and focus search input
  const openDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setSearch('');
    setSearchError('');
    setHighlightIndex(0);
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [disabled]);

  // Close dropdown
  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setSearch('');
    setSearchError('');
    setHighlightIndex(-1);
  }, []);

  // Select an option
  const handleSelect = useCallback((opt, triggerAdvance = false) => {
    onChange?.(opt.value, opt);
    closeDropdown();
    if (triggerAdvance && onNextFocus) {
      setTimeout(() => onNextFocus(), 50);
    }
  }, [onChange, closeDropdown, onNextFocus]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!isOpen) {
      // If closed and user presses alphanumeric key or Enter, open and handle
      if (e.key === 'Enter' || e.key === ' ' || (e.key.length === 1 && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        openDropdown();
        if (e.key.length === 1) {
          setSearch(e.key);
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      const trimmed = search.trim();
      if (trimmed) {
        // 1. Check exact code match
        const exactCodeMatch = options.find(
          opt => opt.code && String(opt.code).toUpperCase() === trimmed.toUpperCase()
        );
        if (exactCodeMatch) {
          e.preventDefault();
          handleSelect(exactCodeMatch, true);
          return;
        }

        // 2. Highlighted item or single filtered item
        if (highlightIndex >= 0 && filtered[highlightIndex]) {
          e.preventDefault();
          handleSelect(filtered[highlightIndex], true);
          return;
        } else if (filtered.length === 1) {
          e.preventDefault();
          handleSelect(filtered[0], true);
          return;
        } else if (filtered.length === 0) {
          e.preventDefault();
          setSearchError(`No product with code "${trimmed}"`);
          return;
        }
      } else if (highlightIndex >= 0 && filtered[highlightIndex]) {
        e.preventDefault();
        handleSelect(filtered[highlightIndex], true);
        return;
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  }, [isOpen, filtered, highlightIndex, handleSelect, closeDropdown, openDropdown, search, options]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-option]');
      if (items[highlightIndex]) {
        items[highlightIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightIndex]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        closeDropdown();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, closeDropdown]);

  return (
    <div ref={containerRef} className="relative w-full" onKeyDown={handleKeyDown}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => isOpen ? closeDropdown() : openDropdown()}
        disabled={disabled}
        className={[
          'w-full h-11 px-3 rounded-xl border bg-white text-sm text-left flex items-center justify-between gap-2 transition-all outline-none',
          isOpen
            ? 'border-primary ring-2 ring-primary/10 shadow-sm'
            : 'border-slate-200 hover:border-slate-300',
          disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'cursor-pointer',
          className
        ].join(' ')}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
          {selectedOption?.code && (
            <span className="font-mono text-[11px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-750 border border-blue-200 shrink-0">
              [{selectedOption.code}]
            </span>
          )}
          <span className={`truncate ${selectedOption ? 'text-slate-800 font-semibold' : 'text-slate-400 font-medium'}`}>
            {selectedOption ? (selectedOption.rawName || selectedOption.label) : displayLabel}
          </span>
        </div>
        {selectedOption?.badge && (
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md shrink-0 ${selectedOption.badgeClassName || 'bg-slate-100 text-slate-600'}`}>
            {selectedOption.badge}
          </span>
        )}
        <span
          className="text-slate-400 shrink-0 transition-transform duration-200 text-xs"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▾
        </span>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          className="absolute z-[9999] left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-fade-in"
          style={{ top: '100%' }}
        >
          {/* Search input */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">
                🔍
              </span>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setSearchError('');
                  setHighlightIndex(0);
                }}
                placeholder={searchPlaceholder}
                className="w-full h-8 pl-7 pr-7 text-xs rounded-lg border border-slate-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all font-medium"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setSearchError(''); setHighlightIndex(-1); searchRef.current?.focus(); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
            {searchError && (
              <div className="mt-1 text-[11px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100 animate-fade-in">
                ⚠️ {searchError}
              </div>
            )}
          </div>

          {/* Options list */}
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-56 overflow-y-auto py-1 divide-y divide-slate-50"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-slate-400 text-xs font-medium italic">
                {emptyMessage}
              </li>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = String(opt.value) === String(value);
                const isHighlighted = idx === highlightIndex;
                return (
                  <li
                    key={opt.value}
                    data-option
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(opt, true)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={[
                      'px-3 py-2 text-xs cursor-pointer flex items-center justify-between gap-2 transition-colors',
                      isHighlighted && !isSelected ? 'bg-primary/5 text-primary' : '',
                      isSelected ? 'bg-primary/10 text-primary font-bold' : 'text-slate-700 font-medium',
                      !isSelected && !isHighlighted ? 'hover:bg-slate-50' : ''
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                      {opt.code && (
                        <span className="font-mono text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                          [{opt.code}]
                        </span>
                      )}
                      <span className="truncate font-semibold">{opt.rawName || opt.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {opt.badge && (
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${opt.badgeClassName || 'bg-slate-100 text-slate-600'}`}>
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && (
                        <span className="text-primary text-xs font-black">✓</span>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>

          {/* Footer: result count when searching */}
          {search && filtered.length > 0 && (
            <div className="px-3 py-1.5 border-t border-slate-100 text-[10px] text-slate-400 font-medium bg-slate-50">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''} for &ldquo;{search}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
