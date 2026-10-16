/**
 * Utility helpers for Product Code (quick code) lookups and formatting.
 */

export function normalizeProductCode(code) {
  if (code === undefined || code === null) return '';
  return String(code).trim().toUpperCase();
}

/**
 * Finds a product by its quick code (case-insensitive, trimmed).
 * Accepts either an array of product objects ({ id, name, code }) or select options ({ value, label, code, rawName }).
 *
 * @param {string|number} code - The code to search for
 * @param {Array} products - List of products or option items
 * @returns {Object|null} The matching product/option or null
 */
export function getProductByCode(code, products = []) {
  const target = normalizeProductCode(code);
  if (!target) return null;

  return products.find(p => {
    const pCode = normalizeProductCode(p.code);
    return Boolean(pCode && pCode === target);
  }) || null;
}

/**
 * Formats a product's display name with its code prefix, e.g. "[1] 1ltr BOPP Kemps"
 *
 * @param {Object} product - Product object with name and optional code
 * @returns {string} Formatted string
 */
export function formatProductLabel(product) {
  if (!product) return '';
  const code = normalizeProductCode(product.code);
  const name = product.name || product.rawName || product.label || '';
  return code ? `[${code}] ${name}` : name;
}

/**
 * Standardizes building a SearchableSelect option for finished products
 *
 * @param {Object} fp - Finished product object
 * @param {Object} extra - Additional properties (e.g. stock, badge, etc.)
 * @returns {Object} Option object formatted for SearchableSelect
 */
export function buildProductOption(fp, extra = {}) {
  const code = normalizeProductCode(fp.code);
  const name = fp.name || '';
  const baseLabel = code ? `[${code}] ${name}` : name;

  return {
    value: fp.id,
    label: extra.stockLabel ? `${baseLabel} (${extra.stockLabel})` : baseLabel,
    rawName: name,
    code: code || null,
    product: fp,
    ...extra
  };
}
