import React from 'react';

/**
 * SearchInput — Reusable search bar component with consistent spacing, icon, and clear button.
 *
 * Props:
 *   value          {string}           Current search query
 *   onChange       {Function}         Callback fired on input change (receives e or val)
 *   placeholder    {string}           Placeholder text (default: "Search...")
 *   className      {string}           Custom classes for the container wrapper
 *   inputClassName {string}          Custom classes for the input field
 *   size           {'sm'|'md'|'lg'}   Size variant ('sm': h-9, 'md': h-11, 'lg': h-12)
 *   disabled       {boolean}          Disabled state
 *   autoFocus      {boolean}          Focus automatically on mount
 */
const SearchInput = ({
  value = '',
  onChange,
  placeholder = 'Search...',
  className = '',
  inputClassName = '',
  size = 'md',
  disabled = false,
  autoFocus = false,
  ...rest
}) => {
  const handleChange = (e) => {
    if (!onChange) return;
    onChange(e);
  };

  const handleClear = () => {
    if (!onChange) return;
    // Emit synthetic event so handlers expecting e.target.value work seamlessly
    const syntheticEvent = { target: { value: '' } };
    onChange(syntheticEvent);
  };

  // Size configurations
  const sizeClasses = {
    sm: 'h-9 text-xs',
    md: 'h-11 text-sm',
    lg: 'h-12 text-base'
  };

  const iconSizes = {
    sm: 'w-3.5 h-3.5 left-2.5',
    md: 'w-4 h-4 left-3.5',
    lg: 'w-5 h-5 left-4'
  };

  // Inline padding ensures absolute protection against global CSS rules overriding pl
  const paddingStyle = {
    paddingLeft: size === 'sm' ? '2.25rem' : size === 'lg' ? '2.75rem' : '2.5rem',
    paddingRight: value ? (size === 'sm' ? '2rem' : '2.25rem') : (size === 'sm' ? '0.75rem' : '1rem')
  };

  return (
    <div className={`relative flex items-center w-full ${className}`}>
      <span className={`absolute ${iconSizes[size] || iconSizes.md} text-slate-400 pointer-events-none flex items-center justify-center shrink-0 z-10`}>
        <svg
          className="w-full h-full fill-none stroke-current stroke-[2.2]"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m20 20-3.5-3.5" />
        </svg>
      </span>

      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        style={paddingStyle}
        className={[
          'w-full bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 font-medium transition-all duration-200 outline-none',
          'focus:border-primary focus:ring-4 focus:ring-primary/10 hover:border-slate-300',
          sizeClasses[size] || sizeClasses.md,
          disabled ? 'bg-slate-50 cursor-not-allowed opacity-60' : '',
          inputClassName
        ].join(' ')}
        {...rest}
      />

      {value && !disabled && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-all text-xs font-bold flex items-center justify-center z-10"
          title="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
};

export default SearchInput;
