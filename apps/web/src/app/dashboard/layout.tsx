'use client';

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white shadow-lg">
        <div className="p-6">
          <h1 className="text-2xl font-bold">NexusOps</h1>
          <p className="text-gray-400 text-sm">Metrics Dashboard</p>
        </div>

        <nav className="mt-6 space-y-1 px-3">
          <Link
            href="/dashboard"
            className="block px-4 py-2 rounded-lg text-white hover:bg-gray-800 transition"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/accounts"
            className="block px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition"
          >
            Accounts
          </Link>
          <Link
            href="/dashboard/credentials"
            className="block px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition"
          >
            Integrations
          </Link>
          <Link
            href="/dashboard/metrics"
            className="block px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition"
          >
            Metrics
          </Link>
          <Link
            href="/dashboard/objectives"
            className="block px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition"
          >
            Objectives
          </Link>
          <Link
            href="/dashboard/settings"
            className="block px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition"
          >
            Settings
          </Link>
        </nav>

        <div className="absolute bottom-6 left-3 right-3">
          <div className="border-t border-gray-700 pt-4">
            <div className="mb-4">
              <p className="text-xs text-gray-500">Signed in as</p>
              <p className="text-sm font-medium">{session.user?.email}</p>
              <p className="text-xs text-gray-500 capitalize">
                Role: {session.user?.role}
              </p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-medium"
            >
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="bg-white shadow">
          <div className="px-6 py-4 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">
              Welcome, {session.user?.name}
            </h2>
          </div>
        </header>

        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
