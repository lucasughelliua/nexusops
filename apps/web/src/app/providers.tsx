'use client';

import { SessionProvider } from "next-auth/react";
import { ColorProvider } from "@/lib/color-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ColorProvider>
        {children}
      </ColorProvider>
    </SessionProvider>
  );
}
