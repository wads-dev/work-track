import type { View } from './calendar-utils';

export const PORTRAIT_MOBILE_QUERY =
  '(max-width: 767px) and (orientation: portrait)';

export function defaultCalendarView(isPortraitMobile: boolean): View {
  return isPortraitMobile ? 'day' : 'three-days';
}
