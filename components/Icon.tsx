import React from 'react';

export type IconName =
  | 'arrow-left'
  | 'box'
  | 'camera'
  | 'check'
  | 'chevron-right'
  | 'close'
  | 'cube'
  | 'download'
  | 'edit'
  | 'eye'
  | 'folder'
  | 'grid'
  | 'headset'
  | 'image'
  | 'layers'
  | 'light'
  | 'menu'
  | 'minus'
  | 'more'
  | 'move'
  | 'plus'
  | 'rotate'
  | 'scan'
  | 'search'
  | 'share'
  | 'spark'
  | 'trash'
  | 'upload'
  | 'user'
  | 'warning';

const paths: Record<IconName, React.ReactNode> = {
  'arrow-left': <><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></>,
  box: <><path d="m21 8-9 5-9-5"/><path d="m3 8 9-5 9 5v8l-9 5-9-5Z"/><path d="M12 13v8"/></>,
  camera: <><path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3Z"/><circle cx="12" cy="13" r="3"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  'chevron-right': <path d="m9 18 6-6-6-6"/>,
  close: <><path d="m18 6-12 12"/><path d="m6 6 12 12"/></>,
  cube: <><path d="m21 16-9 5-9-5V8l9-5 9 5Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/></>,
  download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
  edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
  folder: <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  headset: <><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M18 19h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-1Zm-12 0H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1Z"/></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/></>,
  layers: <><path d="m12 2 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></>,
  light: <><path d="M9 18h6"/><path d="M10 22h4"/><path d="M8.2 14.5A7 7 0 1 1 15.8 14.5c-.8.7-.8 1.5-.8 2.5H9c0-1 0-1.8-.8-2.5Z"/></>,
  menu: <><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></>,
  minus: <path d="M5 12h14"/>,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
  move: <><path d="M12 2v20"/><path d="m8 6 4-4 4 4"/><path d="m8 18 4 4 4-4"/><path d="M2 12h20"/><path d="m6 8-4 4 4 4"/><path d="m18 8 4 4-4 4"/></>,
  plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
  rotate: <><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.2-2L20 12M4 12l2.7 5a7 7 0 0 0 11.2-2"/></>,
  scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M16 4h3a1 1 0 0 1 1 1v3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  share: <><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5"/><path d="m8 13 8 5"/></>,
  spark: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4Z"/><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/></>,
  trash: <><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m6 7 1 14h10l1-14"/><path d="M10 11v6M14 11v6"/></>,
  upload: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  warning: <><path d="M10.3 3.6 2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>,
};

export const Icon: React.FC<{ name: IconName; size?: number; className?: string }> = ({ name, size = 20, className }) => (
  <svg
    aria-hidden="true"
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {paths[name]}
  </svg>
);
