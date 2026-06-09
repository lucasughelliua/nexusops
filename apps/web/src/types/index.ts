import { Role } from "@prisma/client";

declare module "next-auth" {
  interface User {
    id: string;
    name: string;
    email: string;
    role: Role;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: Role;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}

export interface MetricValue {
  value: number;
  currency?: string;
  date: Date;
  dimensions?: Record<string, string | number>;
}

export interface SyncResult {
  platform: string;
  recordsCount: number;
  duration: number;
  status: "success" | "partial" | "error";
  error?: string;
}

export interface PlatformMetrics {
  [key: string]: MetricValue[];
}
