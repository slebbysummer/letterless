import type { ReactNode } from 'react';

export function Stamp({ children, rotate = -6, size = 18, pad }: { children: ReactNode; rotate?: number; size?: number; pad?: string }) {
  return (
    <span className="stamp" style={{ transform: `rotate(${rotate}deg)`, fontSize: size, padding: pad }}>
      {children}
    </span>
  );
}
