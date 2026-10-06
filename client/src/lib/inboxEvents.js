// The sidebar badge listens for this; pages that change inbox state (read, reply, fetch) fire it.
const EVENT = 'inbox-changed';

export const inboxChanged = () => window.dispatchEvent(new Event(EVENT));

/** Subscribe; returns the unsubscribe function. */
export function onInboxChanged(fn) {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
