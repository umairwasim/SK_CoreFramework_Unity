type IconName =
  | 'board'
  | 'list'
  | 'flag'
  | 'plus'
  | 'search'
  | 'close'
  | 'filter'
  | 'download'
  | 'upload'
  | 'trash'
  | 'copy'
  | 'image'
  | 'sidebar'
  | 'bug'
  | 'spark'
  | 'asset'
  | 'polish'
  | 'arrow'
  | 'circle'
  | 'square'
  | 'pen'
  | 'type'
  | 'undo'
  | 'check'

const paths: Record<IconName, string> = {
  board: 'M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  flag: 'M5 21V4m0 0h11l-1.5 4L16 12H5',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm6 2 3 3',
  close: 'M6 6l12 12M18 6 6 18',
  filter: 'M4 5h16l-6 7v6l-4 2v-8z',
  download: 'M12 4v10m0 0 4-4m-4 4-4-4M5 19h14',
  upload: 'M12 16V6m0 0 4 4m-4-4-4 4M5 19h14',
  trash: 'M5 7h14M9 7V5h6v2m-8 0 1 13h8l1-13',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  image: 'M4 6h16v12H4zM8 14l2.5-3 2 2.2L16 9l4 5',
  sidebar: 'M4 5h16v14H4zM9 5v14',
  bug: 'M8 9a4 4 0 0 1 8 0v2a4 4 0 0 1-8 0zM5 10h3M16 10h3M6 15l2-1M18 15l-2-1M9 19l1-2M15 19l-1-2',
  spark: 'M12 3l1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8z',
  asset: 'M4 16l6-8 4 5 2-2 4 5H4z',
  polish: 'M12 3l2 6 6 .5-4.7 3.8 1.6 6L12 16l-4.9 3.3 1.6-6L4 9.5 10 9z',
  arrow: 'M5 19 19 5M19 5H9M19 5v10',
  circle: 'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14z',
  square: 'M6 6h12v12H6z',
  pen: 'M4 20l4.2-1.1L19 8.1 15.9 5 5.1 15.8z',
  type: 'M5 6h14M12 6v12M8 18h8',
  undo: 'M8 8H4v4M4.5 9A8 8 0 1 1 6 17',
  check: 'M5 12.5 9.2 17 19 7',
}

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3.5 28.5 16 16 28.5 3.5 16Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="2.2" fill="currentColor" />
    </svg>
  )
}
