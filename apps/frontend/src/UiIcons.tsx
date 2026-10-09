import { SvgIcon } from '@mui/material';
export function UiIcon({
  kind,
}: {
  kind:
    | 'detail'
    | 'bell'
    | 'rules'
    | 'projects'
    | 'home'
    | 'eye'
    | 'eyeoff'
    | 'sun'
    | 'moon'
    | 'refresh';
}) {
  const paths = {
    eye: 'M12 4C6 4 2 12 2 12s4 8 10 8 10-8 10-8-4-8-10-8m0 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6',
    eyeoff:
      'M3 2 22 21l-1 1-5-5c-6 4-12-2-14-5l4-5-4-4m6 4c6-4 12 2 14 5l-4 5-2-2 3-3c-2-3-5-5-9-3',
    sun: 'M11 1h2v4h-2m0 14h2v4h-2M1 11h4v2H1m18-2h4v2h-4M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12',
    moon: 'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11',
    refresh: 'M18 6V2l5 5-5 5V8a6 6 0 1 0 0 8l2 2A9 9 0 1 1 18 6',
    detail: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m-1 5h2v2h-2m0 2h2v6h-2',
    bell: 'M12 2a2 2 0 0 0-2 2v1c-3 1-4 3-4 6v5l-2 2h16l-2-2v-5c0-3-1-5-4-6V4a2 2 0 0 0-2-2m-2 18a2 2 0 0 0 4 0',
    rules: 'M5 3h14v18H5V3m3 4v2h8V7m-8 4v2h8v-2m-8 4v2h6v-2',
    projects: 'M3 5h7l2 2h9v13H3V5',
    home: 'M3 11l9-8 9 8v10h-6v-7H9v7H3V11',
  };
  return (
    <SvgIcon aria-hidden="true">
      <path d={paths[kind]} />
    </SvgIcon>
  );
}
