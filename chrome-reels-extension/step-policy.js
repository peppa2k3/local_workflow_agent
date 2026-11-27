// Pure helpers shared by background.js (importScripts) and tests (require).
// No Chrome APIs here, so the retry/verification rules can be unit-tested.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StepPolicy = api;
})(typeof self !== 'undefined' ? self : globalThis, () => {
  const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    return value === undefined || value === null || value === '' || !Number.isFinite(number)
      ? fallback : Math.min(max, Math.max(min, Math.trunc(number)));
  };
  // Actions whose failure may be retried at all. openUrl/closeTab/scroll/downloadVideo never are.
  const RETRYABLE_ACTIONS = new Set(['click', 'type', 'setDate', 'setTime', 'waitFor', 'upload']);
  // Actions that can have an external side effect (post, start an upload). When one of these was
  // dispatched and success cannot be confirmed, the result is "unverified", never a definite failure.
  const UNVERIFIED_ACTIONS = new Set(['click', 'upload']);
  const FATAL_TYPES = new Set(['stopped', 'step_timeout', 'agent_unreachable', 'element_ambiguous', 'config']);

  function stepError(message, type, extra = {}) {
    return Object.assign(new Error(message), { type }, extra);
  }

  function retryConfig(step) {
    const retry = step?.retry && typeof step.retry === 'object' ? step.retry : {};
    // Default 0 extra attempts: scenarios without `retry` behave exactly as before.
    return { attempts: clamp(retry.attempts, 0, 5, 0), delayMs: clamp(retry.delayMs, 0, 60000, 1000) };
  }

  // Legacy behaviour: the completion wait used navigationTimeoutMs (default 30 s).
  function completionTimeout(step) {
    return clamp(step?.completion?.timeoutMs, 1000, 3600000, clamp(step?.navigationTimeoutMs, 1, 3600000, 30000));
  }

  function isIdempotent(step) {
    return ['waitFor', 'setDate', 'setTime'].includes(step.action) || (step.action === 'type' && step.clear !== false);
  }

  function errorType(error) {
    if (error?.type) return error.type;
    const message = String(error?.message || error);
    if (/^Stopped$/.test(message)) return 'stopped';
    if (/^Locator matches \d+ elements/.test(message)) return 'element_ambiguous';
    if (/Locator is empty|Role is empty|Unknown locator type/i.test(message)) return 'config';
    if (/did not finish loading|did not settle/.test(message)) return 'navigation_timeout';
    if (/Completion condition timed out/.test(message)) return 'completion_timeout';
    if (/Page is busy/.test(message)) return 'page_busy';
    if (/Page did not respond|Receiving end|message port|Could not establish/.test(message)) return 'page_unresponsive';
    return 'action_failed';
  }

  // `dispatched` = an input (click, text, file) may already have reached the page.
  function classify(error, step, dispatched) {
    const type = errorType(error);
    const retryable = !FATAL_TYPES.has(type) && RETRYABLE_ACTIONS.has(step.action) && (dispatched === false || isIdempotent(step));
    const unverified = UNVERIFIED_ACTIONS.has(step.action) && dispatched !== false && type !== 'stopped';
    return { type, retryable, unverified, dispatched: dispatched ?? null };
  }

  function stageFor(step, confirmed) {
    if (confirmed) return step.completion?.stage || 'completed';
    if (step.action === 'upload') return 'file_selected';
    if (step.action === 'click') return 'clicked';
    return 'done';
  }

  return { clamp, stepError, retryConfig, completionTimeout, isIdempotent, errorType, classify, stageFor, RETRYABLE_ACTIONS, UNVERIFIED_ACTIONS };
});
