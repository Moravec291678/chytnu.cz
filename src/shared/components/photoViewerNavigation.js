export function focusPhotoOpener(event) {
  event.currentTarget.focus({ preventScroll: true });
}

export function swipePhotoDirection(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5 ? (dx < 0 ? 1 : -1) : 0;
}

export function advancePhoto(index, count, direction) {
  if (index < 0 || index >= count || count < 2 || !direction) return index;
  return (index + direction + count) % count;
}
