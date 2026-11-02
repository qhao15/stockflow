import { useState } from 'react';

// For dialogs and drawers opened by a value (the record being edited) and closed by clearing
// it. They keep fading out for a moment after closing, so render with this instead of the
// value itself: it holds on to the last one, and the content doesn't change during the fade.
export default function useLastValue(value) {
  const [last, setLast] = useState(value);
  if (value && value !== last) setLast(value);
  return value || last;
}
