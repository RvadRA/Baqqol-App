import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
  try {
    setLoading(true);
    setError("");
    await login(phone, password);
    navigate("/customers", { replace: true });
  } catch (err: any) {
    setError(err.response?.data?.message || "Login failed");
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-black">

      <div className="w-full max-w-md bg-slate-900 rounded-2xl shadow-2xl p-8">
        <h1 className="text-3xl font-bold text-center text-white">
          Baqqol App
        </h1>
        <p className="text-center text-slate-400 mb-6">
          Hisobingizga kiring
        </p>

        {error && (
          <div className="bg-red-900/40 text-red-300 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <input
          className="w-full mb-3 px-4 py-3 rounded-xl bg-slate-800 text-white outline-none border border-slate-700 focus:border-green-500"
          placeholder="📞 Telefon raqam"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        <input
          type="password"
          className="w-full mb-4 px-4 py-3 rounded-xl bg-slate-800 text-white outline-none border border-slate-700 focus:border-green-500"
          placeholder="🔒 Parol"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold hover:opacity-90 transition disabled:opacity-60"
        >
          {loading ? "Kirish..." : "Kirish"}
        </button>

        <p className="text-center text-slate-400 text-sm mt-6">
          Akkount yo‘qmi?{" "}
          <Link to="/signup" className="text-green-400 font-semibold">
            Ro‘yxatdan o‘tish
          </Link>
        </p>
      </div>
    </div>
  );
}
