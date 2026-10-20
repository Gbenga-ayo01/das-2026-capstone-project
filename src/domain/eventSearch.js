// Search, filter and sort events. Pure functions only:
// events go in, a NEW list comes out, and the input is never changed.
// These work on "summaries" (see listEventSummaries in inventory.js).

import { DomainError } from './errors.js';
import { mergeSort } from './sorting.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const SORT_OPTIONS = ['date', 'price', 'availability'];

// Turns "2026-12-05" or a full ISO string into milliseconds.
// Rejects anything that is not a real date (for example 2026-02-30).
function parseDate(value, field) {
  if (typeof value !== 'string') {
    throw new DomainError('VALIDATION', `${field} must be a date string`);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new DomainError('VALIDATION', `${field} is not a valid date`);
  }
  // Date.parse quietly turns 2026-02-30 into 2 March, so check it round-trips.
  if (DATE_ONLY.test(value) && new Date(ms).toISOString().slice(0, 10) !== value) {
    throw new DomainError('VALIDATION', `${field} is not a real calendar date`);
  }
  return ms;
}

export function filterEvents(summaries, criteria = {}) {
  const { q, city, from, to, maxPriceCents, onlyAvailable } = criteria;

  // Check every input first, so a bad one fails even when the list is empty.
  const fromMs = from === undefined ? undefined : parseDate(from, 'from');
  let toMs;
  if (to !== undefined) {
    toMs = parseDate(to, 'to');
    // A date-only "to" means that WHOLE day, so move the limit to the end of it.
    if (DATE_ONLY.test(to)) toMs += DAY_MS - 1;
  }
  if (maxPriceCents !== undefined && (!Number.isInteger(maxPriceCents) || maxPriceCents < 0)) {
    throw new DomainError('VALIDATION', 'maxPriceCents must be a whole number of at least 0');
  }
  const needle = typeof q === 'string' ? q.trim().toLowerCase() : '';
  const wantedCity = typeof city === 'string' ? city.trim().toLowerCase() : '';

  return summaries.filter((event) => {
    if (needle) {
      const text = `${event.title} ${event.venue ?? ''}`.toLowerCase();
      if (!text.includes(needle)) return false;
    }
    if (wantedCity && event.city.toLowerCase() !== wantedCity) return false;

    const startsMs = Date.parse(event.startsAt);
    if (fromMs !== undefined && startsMs < fromMs) return false;
    if (toMs !== undefined && startsMs > toMs) return false;

    if (maxPriceCents !== undefined) {
      // No tiers means no price, so the event is left out.
      if (event.minPriceCents === null || event.minPriceCents > maxPriceCents) return false;
    }
    if (onlyAvailable && event.seatsLeft < 1) return false;
    return true;
  });
}

function byTitleThenId(a, b) {
  const byTitle = a.title.localeCompare(b.title);
  if (byTitle !== 0) return byTitle;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

const COMPARATORS = {
  // earliest first
  date: (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  // cheapest first, events with no price go last
  price: (a, b) => {
    if (a.minPriceCents === null && b.minPriceCents === null) return 0;
    if (a.minPriceCents === null) return 1;
    if (b.minPriceCents === null) return -1;
    return a.minPriceCents - b.minPriceCents;
  },
  // most seats left first
  availability: (a, b) => b.seatsLeft - a.seatsLeft,
};

export function sortEvents(summaries, sortBy = 'date') {
  const main = COMPARATORS[sortBy];
  if (!SORT_OPTIONS.includes(sortBy) || !main) {
    throw new DomainError('VALIDATION', `sortBy must be one of: ${SORT_OPTIONS.join(', ')}`);
  }
  // Ties are broken by title, then id, so the order is always the same.
  return mergeSort(summaries, (a, b) => main(a, b) || byTitleThenId(a, b));
}

export function searchEvents(summaries, criteria = {}, sortBy = 'date') {
  return sortEvents(filterEvents(summaries, criteria), sortBy);
}
