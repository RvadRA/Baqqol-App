import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Eye, EyeOff, Phone, Lock, User, Sparkles } from "lucide-react";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+7");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Format phone input (same as NewDebt component)
  const formatPhoneInput = (value: string) => {
    // Remove all non-digit characters
    let cleaned = value.replace(/\D/g, '');
    
    // If empty, return base value
    if (!cleaned) return '+7';
    
    // If starts with 8, replace with +7
    if (cleaned.startsWith('8') && cleaned.length >= 1) {
      cleaned = '7' + cleaned.substring(1);
    }
    
    // If no plus and starts with 7, add +
    if (!value.startsWith('+') && cleaned.startsWith('7')) {
      cleaned = '7' + cleaned.substring(1);
    }
    
    // Limit length (country code + 10 digits)
    if (cleaned.length > 11) {
      cleaned = cleaned.substring(0, 11);
    }
    
    // Format with different lengths
    if (cleaned.length === 1) {
      return '+' + cleaned;
    } else if (cleaned.length <= 4) {
      return '+' + cleaned.charAt(0) + ' (' + cleaned.substring(1);
    } else if (cleaned.length <= 7) {
      return '+' + cleaned.charAt(0) + ' (' + cleaned.substring(1, 4) + ') ' + cleaned.substring(4);
    } else if (cleaned.length <= 9) {
      return '+' + cleaned.charAt(0) + ' (' + cleaned.substring(1, 4) + ') ' + 
             cleaned.substring(4, 7) + '-' + cleaned.substring(7);
    } else {
      return '+' + cleaned.charAt(0) + ' (' + cleaned.substring(1, 4) + ') ' + 
             cleaned.substring(4, 7) + '-' + cleaned.substring(7, 9) + '-' + cleaned.substring(9, 11);
    }
  };

  // Normalize phone for API
  const normalizePhoneForAPI = (phone: string): string => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('8')) {
      return '+7' + cleaned.substring(1);
    }
    if (cleaned.startsWith('7')) {
      return '+' + cleaned;
    }
    return phone;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const normalizedPhone = normalizePhoneForAPI(phone);
    
    if (!name || !phone || phone.replace(/\D/g, '').length < 11 || !password) {
      return setError("Пожалуйста, заполните все поля и введите полный номер телефона");
    }

    if (password.length < 6) {
      return setError("Пароль должен содержать не менее 6 символов");
    }

    try {
      setLoading(true);
      setError("");
      await signup(name, normalizedPhone, password);
      navigate("/customers");
    } catch (err: any) {
      setError(err.response?.data?.message || "Ошибка при регистрации");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-gray-900 to-black p-4">
      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-slate-800">
        {/* Header with icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-center text-white mb-2">
          Регистрация
        </h1>
        <p className="text-center text-slate-400 mb-8">
          Создайте новый профиль и присоединяйтесь к системе доверия
        </p>

        {error && (
          <div className="bg-red-950/50 text-red-300 p-4 rounded-xl mb-6 text-sm border border-red-800/50 backdrop-blur-sm flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-red-900/50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-red-300 text-xs">!</span>
            </div>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-5">
          {/* Name Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <User className="w-4 h-4" />
              Имя
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2">
                <User className="w-5 h-5 text-slate-500" />
              </div>
              <input
                className="w-full pl-12 pr-4 py-4 rounded-xl bg-slate-800/80 text-white outline-none border border-slate-700 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all duration-300 placeholder:text-slate-500"
                placeholder="Введите ваше имя"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          {/* Phone Input - Formatted like NewDebt */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Номер телефона
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2">
                <Phone className="w-5 h-5 text-slate-500" />
              </div>
              <input
                type="tel"
                className="w-full pl-12 pr-4 py-4 rounded-xl bg-slate-800/80 text-white outline-none border border-slate-700 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all duration-300 placeholder:text-slate-500 font-mono"
                placeholder="+7 (___) ___-__-__"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
              />
              {phone.length > 2 && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                  {phone.replace(/\D/g, '').length}/11
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Формат: +7 (___) ___-__-__
            </p>
          </div>

          {/* Password Input with Eye Toggle */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Пароль
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2">
                <Lock className="w-5 h-5 text-slate-500" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                className="w-full pl-12 pr-12 py-4 rounded-xl bg-slate-800/80 text-white outline-none border border-slate-700 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all duration-300 placeholder:text-slate-500"
                placeholder="Минимум 6 символов"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
            {password && password.length < 6 && (
              <p className="text-xs text-yellow-500 mt-1">
                Пароль слишком короткий (минимум 6 символов)
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 mt-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold hover:opacity-90 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] relative overflow-hidden group"
          >
            <div className="absolute inset-0 translate-y-[100%] rotate-45 transition-transform duration-700 group-hover:translate-y-[-100%] group-hover:rotate-90 bg-white/20"></div>
            <span className="relative">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Создание...
                </span>
              ) : (
                "Зарегистрироваться"
              )}
            </span>
          </button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-4 bg-slate-900 text-slate-500">или</span>
          </div>
        </div>

        <p className="text-center text-slate-400 text-sm">
          Уже есть аккаунт?{" "}
          <Link 
            to="/login" 
            className="text-green-400 font-semibold hover:text-green-300 transition-colors hover:underline underline-offset-4"
          >
            Войти
          </Link>
        </p>
        
        <p className="text-center text-slate-600 text-xs mt-6">
          Регистрируясь, вы соглашаетесь с условиями использования
        </p>
      </div>
    </div>
  );
}