// src/components/auth/AuthGuard.tsx
import type { ReactNode } from 'react';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  return <>{children}</>;
}
