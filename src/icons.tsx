// Minimal inline SVG icon set (lucide-style, 1.5px stroke).
// Hand-written to keep the repo dependency-free; aria-hidden by default —
// icon buttons must carry their own accessible label via title/aria-label.

import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Icon({
  size = 16,
  children,
  ...rest
}: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const MarkIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 2 20 6.5v11L12 22 4 17.5v-11L12 2z" />
    <path d="M12 22v-9.5" />
    <path d="M4 6.5 12 12l8-5.5" />
  </Icon>
);

export const PlusIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const UploadIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 16V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M4 20h16" />
  </Icon>
);

export const KeyIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12 21 2" />
    <path d="m17 6 2 2" />
    <path d="m14 9 2 2" />
  </Icon>
);

export const ArchiveIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </Icon>
);

export const RestoreIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </Icon>
);

export const TrashIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7 7 20a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    <path d="M10 11v6M14 11v6" />
  </Icon>
);

export const BranchIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="6" cy="5" r="2.2" />
    <circle cx="6" cy="19" r="2.2" />
    <circle cx="18" cy="7" r="2.2" />
    <path d="M6 7.2v9.6" />
    <path d="M18 9.2a7 7 0 0 1-7 7H8.2" />
  </Icon>
);

export const CompareIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="4" width="8" height="16" rx="1.5" />
    <rect x="13" y="4" width="8" height="16" rx="1.5" />
    <path d="M7 4v16M17 4v16" />
  </Icon>
);

export const XIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const DownloadIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 4v11" />
    <path d="m7 11 5 5 5-5" />
    <path d="M4 20h16" />
  </Icon>
);

export const GripIcon = (p: P) => (
  <Icon {...p}>
    <path d="m9 6 3 3 3-3M9 18l3-3 3 3" />
  </Icon>
);

export const SparklesIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 4 13.5 9.5 19 11l-5.5 1.5L12 18l-1.5-5.5L5 11l5.5-1.5L12 4z" />
    <path d="M5 19 6 21M19 3l1 2M18 19l1.5 1.5" />
  </Icon>
);

export const DotsIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="4" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
  </Icon>
);
