'use client';

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Lock, Mail, AlertCircle } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        router.push("/login?error=Credenciales inválidas");
      } else if (result?.ok) {
        router.push("/dashboard");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#040c05] via-[#0c1a0d] to-[#040c05]">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[#00A651] rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#00A651] rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
      </div>

      {/* Login Container */}
      <div className="relative w-full max-w-md mx-4 z-10">
        {/* Card */}
        <div className="bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-2xl shadow-2xl overflow-hidden">
          {/* Header with gradient */}
          <div className="h-2 bg-gradient-to-r from-[#00A651] to-[#00C65E]"></div>

          <div className="px-8 py-12">
            {/* Logo and Title */}
            <div className="mb-8 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-[#00A651] to-[#00C65E] mb-4">
                <span className="text-white font-bold text-lg">N</span>
              </div>
              <h1 className="text-3xl font-bold text-gray-100 tracking-tight">NexusOps</h1>
              <p className="text-gray-500 text-sm mt-2">Centro de Control eCommerce</p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-900/20 border border-red-700/50 text-red-300 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Error de autenticación</p>
                  <p className="text-sm mt-1">
                    {error === "CredentialsSignin"
                      ? "Email o contraseña incorrectos"
                      : error}
                  </p>
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    className="w-full pl-11 pr-4 py-3 bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-lg text-gray-100 placeholder-gray-600 focus:border-[#00A651] focus:ring-1 focus:ring-[#00A651] outline-none transition disabled:opacity-50"
                    placeholder="tu@email.com"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="w-full pl-11 pr-4 py-3 bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-lg text-gray-100 placeholder-gray-600 focus:border-[#00A651] focus:ring-1 focus:ring-[#00A651] outline-none transition disabled:opacity-50"
                    placeholder="Ingresa tu contraseña"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-8 px-4 py-3 bg-gradient-to-r from-[#00A651] to-[#00C65E] text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-[rgba(0,166,81,0.3)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Iniciando sesión...
                  </div>
                ) : (
                  "Iniciar sesión"
                )}
              </button>
            </form>

            {/* Test Credentials */}
            <div className="mt-8 p-4 bg-[#0c1a0d] border border-[rgba(0,166,81,0.1)] rounded-lg">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                📝 Credenciales de prueba
              </p>
              <div className="space-y-2 text-xs text-gray-500">
                <p>
                  <span className="text-gray-400">Email:</span>{" "}
                  <code className="text-[#00C65E] font-mono">admin@nexusops.local</code>
                </p>
                <p>
                  <span className="text-gray-400">Contraseña:</span>{" "}
                  <code className="text-[#00C65E] font-mono">Admin@123</code>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-gray-600 text-xs">
            © 2024 NexusOps • Universo Aventura
          </p>
          <p className="text-gray-700 text-xs mt-1">
            Protegido por autenticación de empresa
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#040c05] to-[#0c1a0d]">
          <div className="text-gray-400">Cargando...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
