/**
 * Lightweight i18n (internationalization) support for WenShape frontend.
 *
 * Usage:
 *   import { t, setLocale, getLocale } from '../i18n';
 *   const label = t('session.start');  // => "开始写作" or "Start Writing"
 */

import zhCN from './locales/zh-CN';
import enUS from './locales/en-US';

const LOCALE_KEY = 'wenshape_locale';

const bundles = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

let currentLocale = localStorage.getItem(LOCALE_KEY) || 'zh-CN';
let currentBundle = bundles[currentLocale] || zhCN;

/**
 * Get translation by dot-path key.
 * Falls back to zh-CN, then returns the key itself.
 *
 * @param {string} key - Dot-separated key, e.g. "session.start"
 * @param {Object} [params] - Interpolation params, e.g. { count: 3 }
 * @returns {string}
 */
export function t(key, params) {
  let value = _resolve(currentBundle, key) ?? _resolve(zhCN, key) ?? key;
  if (params && typeof value === 'string') {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return value;
}

/**
 * Set the active locale.
 * @param {string} locale - e.g. "zh-CN" or "en-US"
 */
export function setLocale(locale) {
  if (!bundles[locale]) return;
  currentLocale = locale;
  currentBundle = bundles[locale];
  localStorage.setItem(LOCALE_KEY, locale);
}

/**
 * Get current locale identifier.
 * @returns {string}
 */
export function getLocale() {
  return currentLocale;
}

/**
 * Get list of supported locales.
 * @returns {string[]}
 */
export function getSupportedLocales() {
  return Object.keys(bundles);
}

// --- internal ---

function _resolve(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}
