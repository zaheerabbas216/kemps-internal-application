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
  emptyMessage = 'No options found'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const containerRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  // Derive the selected label for display
  const selectedOption = options.find(opt => String(opt.value) === String(value));
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  // Filter options based on search
  const filtered = search.trim()
    ? options.filter(opt =>
        String(opt.label).toLowerCase().includes(search.trim().toLowerCase())
      )
    : options;

  // Open dropdown and focus search input
  const openDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setSearch('');
    setHighlightIndex(-1);
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [disabled]);

  // Close dropdown
  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setSearch('');
    setHighlightIndex(-1);
  }, []);

  // Select an option
  const handleSelect = useCallback((opt) => {
    onChange?.(opt.value, opt);
    closeDropdown();
  }, [onChange, closeDropdown]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && filtered[highlightIndex]) {
        handleSelect(filtered[highlightIndex]);
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  }, [isOpen, filtered, highlightIndex, handleSelect, closeDropdown]);

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
          'w-full h-10 px-3 rounded-xl border bg-white text-sm text-left flex items-center justify-between gap-2 transition-all outline-none',
          isOpen
            ? 'border-primary ring-2 ring-primary/10 shadow-sm'
            : 'border-slate-200 hover:border-slate-300',
          disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'cursor-pointer',
          className
        ].join(' ')}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={`truncate font-medium ${selectedOption ? 'text-slate-800' : 'text-slate-400'}`}>
          {displayLabel}
        </span>
        <span
          className="text-slate-400 shrink-0 transition-transform duration-200"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▾
        </span>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          className="absolute z-[9999] left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-fade-in"
          style={{ top: '100%' }}
        >
          {/* Search input */}
          <div className="p-2 border-b border-slate-100">
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
                  setHighlightIndex(0);
                }}
                placeholder={searchPlaceholder}
                className="w-full h-8 pl-7 pr-7 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all font-medium"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setHighlightIndex(-1); searchRef.current?.focus(); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Options list */}
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-52 overflow-y-auto py-1"
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
                    onClick={() => handleSelect(opt)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={[
                      'px-3 py-2 text-sm cursor-pointer flex items-center justify-between gap-2 transition-colors',
                      isHighlighted && !isSelected ? 'bg-primary/5 text-primary' : '',
                      isSelected ? 'bg-primary/10 text-primary font-bold' : 'text-slate-700 font-medium',
                      !isSelected && !isHighlighted ? 'hover:bg-slate-50' : ''
                    ].join(' ')}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && (
                      <span className="text-primary text-xs shrink-0">✓</span>
                    )}
                  </li>
                );
              })
            )}
          </ul>

          {/* Footer: result count when searching */}
          {search && filtered.length > 0 && (
            <div className="px-3 py-1.5 border-t border-slate-100 text-[10px] text-slate-400 font-medium">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''} for &ldquo;{search}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
