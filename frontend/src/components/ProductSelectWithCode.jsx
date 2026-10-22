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
  codeLabel = '',
  dropdownLabel = '',
  stockMap = null,
  customOptions = null
}) => {
  const [codeVal, setCodeVal] = useState('');
  const [errorTip, setErrorTip] = useState('');
  const codeInputRef = useRef(null);
  const errorTimerRef = useRef(null);
  const listIdRef = useRef(`code-list-${Math.random().toString(36).substring(2, 9)}`);

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

      const lookupList = customOptions && customOptions.length > 0 ? customOptions : products;
      const match = getProductByCode(trimmed, lookupList);
      if (match) {
        e.preventDefault();
        setErrorTip('');
        const matchedId = match.id || match.value;
        onChange?.(matchedId, match.product || match);
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

  const handleCodeBlur = () => {
    const trimmed = codeVal.trim();
    if (!trimmed) return;
    const lookupList = customOptions && customOptions.length > 0 ? customOptions : products;
    const match = getProductByCode(trimmed, lookupList);
    if (match) {
      setErrorTip('');
      const matchedId = match.id || match.value;
      if (String(matchedId) !== String(value)) {
        onChange?.(matchedId, match.product || match);
      }
    } else {
      triggerError(`No product with code "${trimmed}"`);
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
    <div className={`flex items-start gap-2.5 w-full ${className}`}>
      {/* Quick Code input */}
      {showCodeInput && (
        <div className="w-28 sm:w-36 shrink-0 relative">
          {codeLabel && (
            <label className="text-xs font-semibold text-slate-600 block mb-1">
              {codeLabel}
            </label>
          )}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs font-black pointer-events-none select-none">
              #
            </span>
            <input
              ref={codeInputRef}
              list={listIdRef.current}
              type="text"
              placeholder="Code"
              value={codeVal}
              onChange={(e) => {
                const val = e.target.value.toUpperCase();
                setCodeVal(val);
                if (errorTip) setErrorTip('');
                const lookupList = customOptions && customOptions.length > 0 ? customOptions : products;
                const match = getProductByCode(val.trim(), lookupList);
                if (match) {
                  const matchedId = match.id || match.value;
                  if (String(matchedId) !== String(value)) {
                    onChange?.(matchedId, match.product || match);
                  }
                }
              }}
              onKeyDown={handleCodeKeyDown}
              onBlur={handleCodeBlur}
              disabled={disabled}
              className={`w-full h-11 pl-7 pr-2.5 text-center rounded-xl border font-mono font-bold text-xs uppercase tracking-wider outline-none transition-all ${
                errorTip
                  ? 'border-red-400 bg-red-50 text-red-700 ring-2 ring-red-200'
                  : codeVal
                    ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 ring-2 ring-emerald-500/20 font-black'
                    : 'border-slate-200 bg-white text-slate-700 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10'
              } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : ''}`}
              title="Type or pick product quick code"
            />
            <datalist id={listIdRef.current}>
              {products.filter(p => p.code).map(p => (
                <option key={p.id || p.value} value={p.code}>
                  {p.name || p.label || ''}
                </option>
              ))}
            </datalist>
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
        {dropdownLabel && (
          <label className="text-xs font-semibold text-slate-600 block mb-1">
            {dropdownLabel}
          </label>
        )}
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
