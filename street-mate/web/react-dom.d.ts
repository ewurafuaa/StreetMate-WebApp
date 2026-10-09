// Types for the one react-dom function the web map shim uses (createPortal). This keeps
// TypeScript happy even when @types/react-dom is not installed; if it is installed, nothing
// changes, because this declaration only describes the same function.
declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react';
  export function createPortal(
    children: ReactNode,
    container: Element | DocumentFragment,
    key?: string | null
  ): ReactPortal;
}
