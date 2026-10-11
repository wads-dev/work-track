/** Literal Tailwind classes shared by page headers and query surfaces. */
export const layoutTokens = {
  wrapRow: 'flex min-w-0 flex-wrap items-center gap-2',
  stack: 'flex min-w-0 flex-col gap-2',
  controlHeight: 'h-11 sm:h-9',
  // Keep touch targets at 44px on mobile, with 36px controls on desktop.
  controls:
    '[&_input]:h-11 sm:[&_input]:h-9 [&_input]:text-sm [&_select]:h-11 sm:[&_select]:h-9 [&_select]:text-sm [&_button:not([role=checkbox]):not([role=option])]:h-11 [&_button:not([role=checkbox]):not([role=option])]:min-h-11 sm:[&_button:not([role=checkbox]):not([role=option])]:h-9 sm:[&_button:not([role=checkbox]):not([role=option])]:min-h-9 [&_button]:text-sm [&_[data-size^=icon]]:min-w-11 sm:[&_[data-size^=icon]]:min-w-9',
  field:
    'min-w-0 max-w-full shrink-0 [&>*]:w-full sm:[&>*]:w-full [&>*]:min-w-0',
  fieldWidths: {
    date: 'w-[calc(50%-4px)] sm:w-40',
    project: 'w-full sm:w-60',
    search: 'w-full sm:w-[260px]',
    standard: 'w-full sm:w-[180px]',
  },
  compactFieldWidths: {
    date: 'w-40',
    project: 'w-[200px]',
    search: 'w-[220px]',
    standard: 'w-auto min-w-[110px]',
  },
  // Never visually hide a label that wraps its control (including SelectTrigger).
  // Its caption remains accessible; control text and focus targets stay visible.
  compactFieldLabels:
    '[&>*]:space-y-0 [&_label:not(:has(input,button,select))]:sr-only [&_label:has(input,button,select)]:gap-0 [&_label:has(input,button,select)]:text-[0px] [&_label>span:not(:has(input,button,select))]:sr-only',
} as const;
