// components/ProtectedRoute.tsx - Updated
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { ReactNode } from "react";

export default function ProtectedRoute({
  children,
}: {
  children: ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950 flex items-center justify-center safe-area-inset-bottom">
        <div className="relative">
          <div className="w-20 h-20 border-4 border-transparent border-t-purple-500 border-r-blue-500 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 border-3 border-transparent border-b-emerald-400 border-l-pink-500 rounded-full animate-spin animation-delay-300"></div>
          </div>
          <div className="mt-8 text-center">
            <p className="text-gray-400 animate-pulse text-sm lg:text-base">Проверка доступа...</p>
          </div>
        </div>
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/login" replace />;
}