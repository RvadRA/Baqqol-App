import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [name, setShopName] = useState(""); // ✅ O'zgartirildi
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !phone || !password) {
      return setError("Iltimos, barcha maydonlarni to'ldiring");
    }

    try {
      setLoading(true);
      setError("");
      await signup(name, phone, password); // ✅ O'zgartirildi
      navigate("/customers");
    } catch (err: any) {
      setError(err.response?.data?.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-black p-4">
      <div className="w-full max-w-md bg-slate-900 rounded-2xl shadow-2xl p-8 border border-slate-800">
        <h1 className="text-3xl font-bold text-center text-white">
          Ro‘yxatdan o‘tish
        </h1>
        <p className="text-center text-slate-400 mb-6">
          Yangi profil yarating
        </p>

        {error && (
          <div className="bg-red-900/40 text-red-300 p-3 rounded-lg mb-4 text-sm border border-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <input
            className="w-full px-4 py-3 rounded-xl bg-slate-800 text-white outline-none border border-slate-700 focus:border-green-500 transition-colors"
            placeholder="👤 Ism"
            value={name}
            onChange={(e) => setShopName(e.target.value)}
          />

          <input
            type="tel"
            className="w-full px-4 py-3 rounded-xl bg-slate-800 text-white outline-none border border-slate-700 focus:border-green-500 transition-colors"
            placeholder="📞 Telefon raqam"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <input
            type="password"
            className="w-full px-4 py-3 rounded-xl bg-slate-800 text-white outline-none border border-slate-700 focus:border-green-500 transition-colors"
            placeholder="🔒 Parol"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold hover:opacity-90 transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {loading ? "Yaratilmoqda..." : "Ro‘yxatdan o‘tish"}
          </button>
        </form>

        <p className="text-center text-slate-400 text-sm mt-6">
          Akkount bormi?{" "}
          <Link to="/login" className="text-green-400 font-semibold hover:text-green-300">
            Kirish
          </Link>
        </p>
      </div>
    </div>
  );
}