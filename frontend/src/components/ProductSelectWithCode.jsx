import React, { useState, useEffect, useRef } from 'react';
import SearchableSelect from './SearchableSelect';
import { getProductByCode, normalizeProductCode } from '../utils/productLookup';

/**
 * ProductSelectWithCode — Unified product selector featuring a fast-entry Quick Code box
 * alongside a searchable product dropdown.
 *
 * Props:
 *   products          {Array}    List of finished products [{ id, name, code, ... }]
 *   value             {string}   Currently selected product ID
 *   onChange          {Function} Called with (productId, productObject)
 *   onNextFocus       {Function} Called when Enter/Tab matches a product (to advance focus to Quantity)
 *   placeholder       {string}   Placeholder for product dropdown
 *   searchPlaceholder {string}   Placeholder for dropdown search
 *   className         {string}   Extra classes for outer container
 *   disabled          {boolean}  Disable all inputs
 *   showCodeInput     {boolean}  Whether to render the companion Code box (default true)
 *   stockMap          {Object}   Optional map of { [productId]: stockCount }
 *   customOptions     {Array}    Optional custom options array for SearchableSelect
 */
const ProductSelectWithCode = ({
  products = [],
  value = '',
  onChange,
  onNextFocus = null,
  placeholder = 'Select Product...',
  searchPlaceholder = 'Search product or code...',
  className = '',
  disabled = false,
  showCodeInput = true,
  stockMap = null,
  customOptions = null
}) => {
  const [codeVal, setCodeVal] = useState('');
  const [errorTip, setErrorTip] = useState('');
  const codeInputRef = useRef(null);
  const errorTimerRef = useRef(null);

  // Sync the Code input whenever the selected value changes or products load
  useEffect(() => {
    if (!value) {
      setCodeVal('');
      return;
    }
    const current = products.find(p => String(p.id || p.value) === String(value));
    if (current && current.code) {
      setCodeVal(String(current.code).toUpperCase());
    } else {
      setCodeVal('');
    }
  }, [value, products]);

  // Clean up error timer
  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const triggerError = (msg) => {
    setErrorTip(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => {
      setErrorTip('');
    }, 3500);
  };

  const handleCodeKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      const trimmed = codeVal.trim();
      if (!trimmed) {
        if (e.key === 'Enter' && onNextFocus) {
          e.preventDefault();
          onNextFocus();
        }
        return;
      }

      const match = getProductByCode(trimmed, products);
      if (match) {
        e.preventDefault();
        setErrorTip('');
        const matchedId = match.id || match.value;
        onChange?.(matchedId, match);
        if (onNextFocus) {
          setTimeout(() => onNextFocus(), 50);
        }
      } else {
        e.preventDefault();
        triggerError(`No product with code "${trimmed}"`);
        codeInputRef.current?.focus();
        codeInputRef.current?.select();
      }
    }
  };

  // Build options for SearchableSelect
  const options = customOptions || products.map(fp => {
    const pId = fp.id || fp.value;
    const pName = fp.name || fp.rawName || fp.label || '';
    const pCode = fp.code ? normalizeProductCode(fp.code) : null;
    const hasStock = stockMap && stockMap[pId] !== undefined;
    const stockVal = hasStock ? stockMap[pId] : null;

    let badge = null;
    let badgeClassName = 'bg-slate-100 text-slate-600';
    if (hasStock) {
      badge = `${stockVal} in stock`;
      badgeClassName = stockVal > 0 
        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        : stockVal === 0
          ? 'bg-amber-50 text-amber-700 border border-amber-200'
          : 'bg-rose-50 text-rose-600 border border-rose-200';
    }

    return {
      value: pId,
      label: pCode ? `[${pCode}] ${pName}` : pName,
      rawName: pName,
      code: pCode,
      badge,
      badgeClassName,
      product: fp
    };
  });

  const handleDropdownChange = (val, opt) => {
    setErrorTip('');
    onChange?.(val, opt?.product || opt);
    if (onNextFocus) {
      setTimeout(() => onNextFocus(), 50);
    }
  };

  return (
    <div className={`flex items-start gap-2 w-full ${className}`}>
      {/* Quick Code input */}
      {showCodeInput && (
        <div className="w-24 md:w-28 shrink-0 relative">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs font-black pointer-events-none select-none">
              #
            </span>
            <input
              ref={codeInputRef}
              type="text"
              placeholder="Code"
              value={codeVal}
              onChange={(e) => {
                setCodeVal(e.target.value.toUpperCase());
                if (errorTip) setErrorTip('');
              }}
              onKeyDown={handleCodeKeyDown}
              disabled={disabled}
              className={`w-full h-11 pl-7 pr-2.5 text-center rounded-xl border font-mono font-bold text-xs uppercase tracking-wider outline-none transition-all ${
                errorTip
                  ? 'border-red-400 bg-red-50 text-red-700 ring-2 ring-red-200'
                  : codeVal
                    ? 'border-blue-400 bg-blue-50/70 text-blue-800 ring-2 ring-blue-100 font-black'
                    : 'border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/10'
              } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : ''}`}
              title="Type product quick code and press Enter or Tab"
            />
          </div>

          {errorTip && (
            <div className="absolute left-0 top-full mt-1.5 z-[99999] whitespace-nowrap bg-rose-600 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-xl animate-fade-in flex items-center gap-1 border border-rose-700">
              <span>⚠️</span> {errorTip}
            </div>
          )}
        </div>
      )}

      {/* Product Searchable Select */}
      <div className="flex-1 min-w-0">
        <SearchableSelect
          options={options}
          value={value}
          onChange={handleDropdownChange}
          placeholder={placeholder}
          searchPlaceholder={searchPlaceholder}
          disabled={disabled}
          onNextFocus={onNextFocus}
        />
      </div>
    </div>
  );
};

export default ProductSelectWithCode;
