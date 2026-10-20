import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DomainError } from '../src/domain/errors.js';
import {
  createStore,
  createEvent,
  addTier,
  publishEvent,
  listEventSummaries,
  bookTickets,
  seatsLeft,
} from '../src/domain/inventory.js';
import { mergeSort } from '../src/domain/sorting.js';
import { filterEvents, sortEvents, searchEvents } from '../src/domain/eventSearch.js';

// ---------- helpers ----------

function throwsCode(fn, code) {
  assert.throws(fn, (err) => err instanceof DomainError && err.code === code);
}

function makeEvent(store, overrides = {}) {
  return createEvent(store, {
    title: 'Lagos Tech Meetup',
    city: 'Lagos',
    venue: 'Yaba Hub',
    startsAt: '2026-12-01T18:00:00.000Z',
    organizerId: 'org-1',
    ...overrides,
  });
}

// A plain summary, for testing search and sort without a store.
function summary(overrides) {
  return {
    id: 'id',
    title: 'Event',
    city: 'Lagos',
    venue: '',
    startsAt: '2026-12-01T18:00:00.000Z',
    status: 'published',
    minPriceCents: 1000,
    seatsLeft: 10,
    ...overrides,
  };
}

// ---------- S02: create an event ----------

test('S02: a valid event is saved as a draft with a new id and is not on the public list', () => {
  const store = createStore();
  const event = makeEvent(store);
  assert.equal(event.status, 'draft');
  assert.ok(event.id);
  assert.equal(store.events.get(event.id), event);
  assert.deepEqual(listEventSummaries(store), []);
});

test('S02: two events get different ids', () => {
  const store = createStore();
  assert.notEqual(makeEvent(store).id, makeEvent(store).id);
});

test('S02: missing title, missing city or a bad date is VALIDATION and nothing is saved', () => {
  const store = createStore();
  throwsCode(() => makeEvent(store, { title: '' }), 'VALIDATION');
  throwsCode(() => makeEvent(store, { title: undefined }), 'VALIDATION');
  throwsCode(() => makeEvent(store, { city: '   ' }), 'VALIDATION');
  throwsCode(() => makeEvent(store, { startsAt: 'not a date' }), 'VALIDATION');
  assert.equal(store.events.size, 0);
});

// ---------- S03: add ticket tiers ----------

test('S03: a tier is saved with 0 sold and 100 seats left', () => {
  const store = createStore();
  const event = makeEvent(store);
  const tier = addTier(store, event.id, { name: 'General', priceCents: 500000, capacity: 100 });
  assert.equal(tier.sold, 0);
  assert.equal(seatsLeft(tier), 100);
  assert.equal(tier.priceCents, 500000);
  assert.deepEqual(event.tierIds, [tier.id]);
});

test('S03: a price that is not a whole number, or a capacity below 1, is VALIDATION', () => {
  const store = createStore();
  const event = makeEvent(store);
  throwsCode(() => addTier(store, event.id, { name: 'General', priceCents: 10.5, capacity: 10 }), 'VALIDATION');
  throwsCode(() => addTier(store, event.id, { name: 'General', priceCents: -1, capacity: 10 }), 'VALIDATION');
  throwsCode(() => addTier(store, event.id, { name: 'General', priceCents: 1000, capacity: 0 }), 'VALIDATION');
  throwsCode(() => addTier(store, event.id, { name: 'General', priceCents: 1000, capacity: 2.5 }), 'VALIDATION');
  assert.equal(store.tiers.size, 0);
});

test('S03: an event id that does not exist is NOT_FOUND', () => {
  const store = createStore();
  throwsCode(() => addTier(store, 'missing', { name: 'General', priceCents: 1000, capacity: 10 }), 'NOT_FOUND');
});

// ---------- S04: publish ----------

test('S04: a draft with a tier can be published and then appears on the public list', () => {
  const store = createStore();
  const event = makeEvent(store);
  addTier(store, event.id, { name: 'General', priceCents: 500000, capacity: 100 });
  publishEvent(store, event.id);
  assert.equal(event.status, 'published');
  const list = listEventSummaries(store);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, event.id);
});

test('S04: publishing a draft with no tiers is INVALID_STATE and it stays a draft', () => {
  const store = createStore();
  const event = makeEvent(store);
  throwsCode(() => publishEvent(store, event.id), 'INVALID_STATE');
  assert.equal(event.status, 'draft');
  assert.deepEqual(listEventSummaries(store), []);
});

test('S04: publishing an event id that does not exist is NOT_FOUND', () => {
  throwsCode(() => publishEvent(createStore(), 'missing'), 'NOT_FOUND');
});

test('S04: drafts are shown only when publishedOnly is false', () => {
  const store = createStore();
  makeEvent(store);
  assert.equal(listEventSummaries(store, { publishedOnly: false }).length, 1);
  assert.equal(listEventSummaries(store).length, 0);
});

test('S04: a summary shows the cheapest price and the total seats left', () => {
  const store = createStore();
  const event = makeEvent(store);
  addTier(store, event.id, { name: 'VIP', priceCents: 900000, capacity: 5 });
  const general = addTier(store, event.id, { name: 'General', priceCents: 500000, capacity: 100 });
  publishEvent(store, event.id);
  bookTickets(store, general.id, 'u1', 4);
  const [s] = listEventSummaries(store);
  assert.equal(s.minPriceCents, 500000);
  assert.equal(s.seatsLeft, 101);
});

// ---------- S05: search, filter, sort ----------

test('S05: searching for "JAZZ" returns only Abuja Jazz Night', () => {
  const list = [
    summary({ id: 'a', title: 'Lagos Tech Meetup' }),
    summary({ id: 'b', title: 'Abuja Jazz Night', city: 'Abuja' }),
  ];
  const result = filterEvents(list, { q: 'JAZZ' });
  assert.deepEqual(result.map((e) => e.id), ['b']);
});

test('S05: search also matches the venue', () => {
  const list = [
    summary({ id: 'a', venue: 'Eko Hotel' }),
    summary({ id: 'b', venue: 'Yaba Hub' }),
  ];
  assert.deepEqual(filterEvents(list, { q: 'eko' }).map((e) => e.id), ['a']);
});

test('S05: filtering by city "lagos" returns only Lagos events, whatever the capitals', () => {
  const list = [
    summary({ id: 'a', city: 'Lagos' }),
    summary({ id: 'b', city: 'Abuja' }),
    summary({ id: 'c', city: 'LAGOS' }),
  ];
  assert.deepEqual(filterEvents(list, { city: 'lagos' }).map((e) => e.id), ['a', 'c']);
});

test('S05: max price and sort by price gives cheapest first and leaves out events with no tiers', () => {
  const list = [
    summary({ id: 'a', title: 'A', minPriceCents: 8000 }),
    summary({ id: 'b', title: 'B', minPriceCents: 2000 }),
    summary({ id: 'c', title: 'C', minPriceCents: null }),
    summary({ id: 'd', title: 'D', minPriceCents: 5000 }),
    summary({ id: 'e', title: 'E', minPriceCents: 20000 }),
  ];
  const result = searchEvents(list, { maxPriceCents: 8000 }, 'price');
  assert.deepEqual(result.map((e) => e.id), ['b', 'd', 'a']);
});

test('S05: sorting by date puts the earlier event first, and the same day stays in title order', () => {
  const list = [
    summary({ id: '1', title: 'Zebra Fest', startsAt: '2026-12-05T10:00:00.000Z' }),
    summary({ id: '2', title: 'Alpha Night', startsAt: '2026-12-05T10:00:00.000Z' }),
    summary({ id: '3', title: 'Early Bird', startsAt: '2026-11-30T10:00:00.000Z' }),
  ];
  const result = sortEvents(list, 'date');
  assert.deepEqual(result.map((e) => e.title), ['Early Bird', 'Alpha Night', 'Zebra Fest']);
});

test('S05: an event at 5 PM on 5 December is included when filtering up to 2026-12-05', () => {
  const list = [
    summary({ id: 'a', startsAt: '2026-12-05T17:00:00.000Z' }),
    summary({ id: 'b', startsAt: '2026-12-06T00:00:00.000Z' }),
  ];
  assert.deepEqual(filterEvents(list, { to: '2026-12-05' }).map((e) => e.id), ['a']);
});

test('S05: "from" is inclusive and a full timestamp "to" is exact', () => {
  const list = [
    summary({ id: 'a', startsAt: '2026-12-01T00:00:00.000Z' }),
    summary({ id: 'b', startsAt: '2026-12-01T12:00:00.000Z' }),
    summary({ id: 'c', startsAt: '2026-11-30T23:59:59.000Z' }),
  ];
  assert.deepEqual(filterEvents(list, { from: '2026-12-01' }).map((e) => e.id), ['a', 'b']);
  assert.deepEqual(
    filterEvents(list, { from: '2026-12-01', to: '2026-12-01T00:00:00.000Z' }).map((e) => e.id),
    ['a'],
  );
});

test('S05: a bad date, a price that is not a whole number, or an unknown sort is VALIDATION', () => {
  const list = [summary({})];
  throwsCode(() => filterEvents(list, { from: 'tomorrow-ish' }), 'VALIDATION');
  throwsCode(() => filterEvents(list, { to: '2026-02-30' }), 'VALIDATION');
  throwsCode(() => filterEvents(list, { maxPriceCents: 10.5 }), 'VALIDATION');
  throwsCode(() => filterEvents(list, { maxPriceCents: -5 }), 'VALIDATION');
  throwsCode(() => sortEvents(list, 'colour'), 'VALIDATION');
  throwsCode(() => searchEvents(list, {}, 'colour'), 'VALIDATION');
});

test('S05: bad input is rejected even when the list is empty', () => {
  throwsCode(() => filterEvents([], { from: 'nope' }), 'VALIDATION');
  throwsCode(() => sortEvents([], 'nope'), 'VALIDATION');
});

test('S05: filtering and sorting never change the original list', () => {
  const list = [
    summary({ id: 'a', title: 'B', minPriceCents: 300, city: 'Lagos' }),
    summary({ id: 'b', title: 'A', minPriceCents: 100, city: 'Abuja' }),
    summary({ id: 'c', title: 'C', minPriceCents: 200, city: 'Lagos' }),
  ];
  const before = structuredClone(list);
  const copyOfOrder = list.slice();

  sortEvents(list, 'price');
  filterEvents(list, { city: 'lagos', q: 'b' });
  searchEvents(list, { maxPriceCents: 250 }, 'availability');

  assert.deepEqual(list, before);
  list.forEach((item, i) => assert.equal(item, copyOfOrder[i]));
});

test('S05: sorting by availability puts the most seats left first', () => {
  const list = [
    summary({ id: 'a', title: 'A', seatsLeft: 5 }),
    summary({ id: 'b', title: 'B', seatsLeft: 50 }),
    summary({ id: 'c', title: 'C', seatsLeft: 0 }),
  ];
  assert.deepEqual(sortEvents(list, 'availability').map((e) => e.id), ['b', 'a', 'c']);
});

test('S05: sorting by price puts events with no price last', () => {
  const list = [
    summary({ id: 'a', title: 'A', minPriceCents: null }),
    summary({ id: 'b', title: 'B', minPriceCents: 900 }),
    summary({ id: 'c', title: 'C', minPriceCents: 100 }),
  ];
  assert.deepEqual(sortEvents(list, 'price').map((e) => e.id), ['c', 'b', 'a']);
});

test('S05: the onlyAvailable filter drops sold-out events', () => {
  const list = [summary({ id: 'a', seatsLeft: 0 }), summary({ id: 'b', seatsLeft: 3 })];
  assert.deepEqual(filterEvents(list, { onlyAvailable: true }).map((e) => e.id), ['b']);
});

test('S05: an empty list gives an empty result', () => {
  assert.deepEqual(filterEvents([], { q: 'x' }), []);
  assert.deepEqual(sortEvents([], 'date'), []);
  assert.deepEqual(searchEvents([], {}, 'price'), []);
});

test('S05: ties on every field are broken by id, so the order is always the same', () => {
  const list = [
    summary({ id: 'z', title: 'Same' }),
    summary({ id: 'a', title: 'Same' }),
  ];
  assert.deepEqual(sortEvents(list, 'date').map((e) => e.id), ['a', 'z']);
});

// ---------- S06: book tickets ----------

function publishedEventWithGeneral(capacity) {
  const store = createStore();
  const event = makeEvent(store);
  const tier = addTier(store, event.id, { name: 'General', priceCents: 500000, capacity });
  publishEvent(store, event.id);
  return { store, tier };
}

test('S06: booking 2 of 3 seats makes a pending booking priced in whole cents and leaves 1 seat', () => {
  const { store, tier } = publishedEventWithGeneral(3);
  const booking = bookTickets(store, tier.id, 'u1', 2);
  assert.equal(booking.status, 'pending');
  assert.equal(booking.quantity, 2);
  assert.equal(booking.amountCents, 1000000);
  assert.ok(Number.isInteger(booking.amountCents));
  assert.equal(seatsLeft(tier), 1);
});

test('S06: asking for 2 when 1 is left is SOLD_OUT and nothing changes', () => {
  const { store, tier } = publishedEventWithGeneral(3);
  bookTickets(store, tier.id, 'u1', 2);
  const bookingsBefore = store.bookings.size;
  throwsCode(() => bookTickets(store, tier.id, 'u2', 2), 'SOLD_OUT');
  assert.equal(seatsLeft(tier), 1);
  assert.equal(store.bookings.size, bookingsBefore);
});

test('S06: a quantity of 0, negative, fractional or above 10 is VALIDATION', () => {
  const { store, tier } = publishedEventWithGeneral(100);
  for (const quantity of [0, -1, 1.5, 11]) {
    throwsCode(() => bookTickets(store, tier.id, 'u1', quantity), 'VALIDATION');
  }
  assert.equal(seatsLeft(tier), 100);
});

test('S06: booking from a tier that does not exist is NOT_FOUND', () => {
  throwsCode(() => bookTickets(createStore(), 'missing', 'u1', 1), 'NOT_FOUND');
});

// ---------- merge sort ----------

test('mergeSort: sorts numbers', () => {
  assert.deepEqual(mergeSort([5, 3, 9, 1, 7, 3], (a, b) => a - b), [1, 3, 3, 5, 7, 9]);
});

test('mergeSort: an empty list and a one-item list work', () => {
  assert.deepEqual(mergeSort([], (a, b) => a - b), []);
  assert.deepEqual(mergeSort([4], (a, b) => a - b), [4]);
});

test('mergeSort: returns a new array and leaves the original alone', () => {
  const original = [3, 1, 2];
  const result = mergeSort(original, (a, b) => a - b);
  assert.deepEqual(original, [3, 1, 2]);
  assert.notEqual(result, original);
});

test('mergeSort: is stable, so equal items keep their original order', () => {
  const items = [
    { k: 1, n: 'a' },
    { k: 0, n: 'b' },
    { k: 1, n: 'c' },
    { k: 0, n: 'd' },
    { k: 1, n: 'e' },
  ];
  const result = mergeSort(items, (x, y) => x.k - y.k);
  assert.deepEqual(result.map((x) => x.n), ['b', 'd', 'a', 'c', 'e']);
});

test('mergeSort: agrees with the built-in sort on 1000 random numbers', () => {
  const numbers = Array.from({ length: 1000 }, () => Math.floor(Math.random() * 100));
  const expected = numbers.slice().sort((a, b) => a - b);
  assert.deepEqual(mergeSort(numbers, (a, b) => a - b), expected);
});

test('mergeSort: bad arguments throw', () => {
  assert.throws(() => mergeSort('nope', (a, b) => a - b), TypeError);
  assert.throws(() => mergeSort([1, 2], undefined), TypeError);
});

// ---------- the sort file must not cheat ----------

test('sorting.js does not call Array.prototype.sort', async () => {
  const { readFile } = await import('node:fs/promises');
  const code = await readFile(new URL('../src/domain/sorting.js', import.meta.url), 'utf8');
  const withoutComments = code.replace(/\/\/.*$/gm, '');
  assert.equal(/\.sort\s*\(/.test(withoutComments), false);
});
