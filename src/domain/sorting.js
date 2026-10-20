// A merge sort we write ourselves. We never call Array.prototype.sort.
//
// Stable: when compare() says two items are equal, they keep their original order.
// Pure: it returns a NEW array and never touches the one it was given.
// Speed: O(n log n). The list is halved about log n times, and each level of
// halving does O(n) work to merge.

export function mergeSort(items, compare) {
  if (!Array.isArray(items)) throw new TypeError('mergeSort needs an array');
  if (typeof compare !== 'function') throw new TypeError('mergeSort needs a compare function');
  return sortPart(items.slice(), compare);
}

function sortPart(list, compare) {
  if (list.length <= 1) return list;
  const middle = Math.floor(list.length / 2);
  const left = sortPart(list.slice(0, middle), compare);
  const right = sortPart(list.slice(middle), compare);
  return merge(left, right, compare);
}

function merge(left, right, compare) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    // "<= 0" takes from the LEFT on a tie. That one character makes it stable.
    if (compare(left[i], right[j]) <= 0) {
      result.push(left[i]);
      i += 1;
    } else {
      result.push(right[j]);
      j += 1;
    }
  }
  while (i < left.length) result.push(left[i++]);
  while (j < right.length) result.push(right[j++]);
  return result;
}
