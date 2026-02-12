import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { 
  User, 
  Shield, 
  TrendingUp, 
  TrendingDown, 
  LogOut, 
  CreditCard,
  ChevronRight,
  DollarSign,
  BarChart3,
  CheckCircle,
  AlertCircle,
  Edit2,
  Save,
  X,
  Mail,
  MapPin,
  Calendar,
  Eye,
  EyeOff,
  Lock,
  Wifi,
  WifiOff,
  RefreshCw
} from "lucide-react";

// Константы для localStorage ключей
const CACHE_KEYS = {
  PROFILE: 'profile_cache',
  DEBTS: 'debts_cache',
  TIMESTAMP: 'profile_timestamp',
  LAST_UPDATE: 'profile_last_update'
} as const;

// Время жизни кэша (1 час)
const CACHE_TTL = 60 * 60 * 1000;

interface ProfileCache {
  data: any;
  timestamp: number;
}

export default function Profile() {
  const { logout, user, updateUser } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editMode, setEditMode] = useState<"basic" | "password" | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isOfflineData, setIsOfflineData] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Form states
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    bio: ""
  });
  
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  // Проверка онлайн статуса
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Загрузка данных из кэша или с сервера
  useEffect(() => {
    fetchProfile();
  }, []);
useEffect(() => {
  // Проверяем, есть ли сохраненный timestamp
  const lastUpdate = localStorage.getItem(CACHE_KEYS.LAST_UPDATE);
  const now = Date.now();
  
  // Если прошло больше часа или нет timestamp, загружаем заново
  if (!lastUpdate || now - parseInt(lastUpdate) > CACHE_TTL) {
    console.log('Кэш устарел или отсутствует, загружаем данные...');
    fetchProfile();
  } else {
    // Иначе сначала показываем кэш
    const cachedData = loadFromCache();
    if (cachedData) {
      setData(cachedData);
      setFormData({
        name: cachedData.identity?.registeredName || user?.name || "",
        email: cachedData.identity?.email || "",
        phone: cachedData.identity?.phone || user?.phone || "",
        address: cachedData.identity?.address || "",
        bio: cachedData.identity?.bio || ""
      });
      setLoading(false);
    }
    // Затем обновляем в фоне если онлайн
    if (isOnline) {
      setTimeout(() => fetchFreshData(), 1000);
    }
  }
}, []);
  // Сохранение данных в кэш
// Обновленная функция saveToCache
const saveToCache = (profileData: any, debtsData: any) => {
  try {
    const currentUserId = user?.globalIdentityId;
    const now = new Date();
    
    const allDebts = debtsData || [];
    
    // Пересчитываем статистику при сохранении
    const activeDebtsIOwe = allDebts.filter((d: any) => {
      const isReceiver = d.receiverIdentityId?._id === currentUserId;
      return d.paymentStatus === 'active' && 
             d.amountRemaining > 0 && 
             isReceiver;
    });
    
    const activeDebtsOwedToMe = allDebts.filter((d: any) => {
      const isSender = d.senderIdentityId?._id === currentUserId;
      return d.paymentStatus === 'active' && 
             d.amountRemaining > 0 && 
             isSender;
    });
    
    const overdueDebts = allDebts.filter((d: any) => {
      const isActive = d.paymentStatus === 'active';
      const isOverdue = d.overdueStatus === 'overdue';
      const isPastDue = d.dueDate && new Date(d.dueDate) < now;
      
      return isActive && d.amountRemaining > 0 && (isOverdue || isPastDue);
    });
    
    const totalOwed = activeDebtsOwedToMe
      .reduce((sum: number, d: any) => sum + d.amountRemaining, 0);
    
    const totalDebt = activeDebtsIOwe
      .reduce((sum: number, d: any) => sum + d.amountRemaining, 0);
    
    const activeDebts = allDebts.filter((d: any) => 
      d.paymentStatus === 'active' && d.amountRemaining > 0
    ).length;

    const cache: ProfileCache = {
      data: {
        ...profileData,
        stats: {
          ...profileData.stats,
          totalDebts: allDebts.length,
          activeDebts,
          overdueDebts: overdueDebts.length,
          totalOwed,
          totalDebt,
          sentDebtsCount: activeDebtsOwedToMe.length,
          receivedDebtsCount: activeDebtsIOwe.length,
          paidDebts: allDebts.filter((d: any) => d.paymentStatus === 'paid').length,
          pendingVerification: allDebts.filter((d: any) => d.paymentStatus === 'pending_verification').length
        }
      },
      timestamp: Date.now()
    };
    
    localStorage.setItem(CACHE_KEYS.PROFILE, JSON.stringify(cache));
    localStorage.setItem(CACHE_KEYS.DEBTS, JSON.stringify(debtsData));
    localStorage.setItem(CACHE_KEYS.TIMESTAMP, Date.now().toString());
    
    console.log('Данные сохранены в кэш');
  } catch (error) {
    console.error('Ошибка при сохранении в кэш:', error);
  }
};

  // Загрузка данных из кэша
const loadFromCache = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEYS.PROFILE);
    
    // Если нет кэша, возвращаем null
    if (!cached) {
      console.log('Кэш не найден');
      return null;
    }
    
    const cache: ProfileCache = JSON.parse(cached);
    const now = Date.now();
    
    // Проверяем актуальность кэша
    if (now - cache.timestamp < CACHE_TTL) {
      console.log('Используем актуальные кэшированные данные');
      
      // Загружаем кэшированные долги для пересчета статистики
      const cachedDebts = localStorage.getItem(CACHE_KEYS.DEBTS);
      const allDebts = cachedDebts ? JSON.parse(cachedDebts) : [];
      
      // Если есть данные о долгах, пересчитываем статистику
      if (allDebts.length > 0) {
        const currentUserId = user?.globalIdentityId;
        const now = new Date();
        
        const activeDebtsIOwe = allDebts.filter((d: any) => {
          const isReceiver = d.receiverIdentityId?._id === currentUserId;
          return d.paymentStatus === 'active' && 
                 d.amountRemaining > 0 && 
                 isReceiver;
        });
        
        const activeDebtsOwedToMe = allDebts.filter((d: any) => {
          const isSender = d.senderIdentityId?._id === currentUserId;
          return d.paymentStatus === 'active' && 
                 d.amountRemaining > 0 && 
                 isSender;
        });
        
        const overdueDebts = allDebts.filter((d: any) => {
          const isActive = d.paymentStatus === 'active';
          const isOverdue = d.overdueStatus === 'overdue';
          const isPastDue = d.dueDate && new Date(d.dueDate) < now;
          
          return isActive && d.amountRemaining > 0 && (isOverdue || isPastDue);
        });
        
        const totalOwed = activeDebtsOwedToMe
          .reduce((sum: number, d: any) => sum + d.amountRemaining, 0);
        
        const totalDebt = activeDebtsIOwe
          .reduce((sum: number, d: any) => sum + d.amountRemaining, 0);
        
        const activeDebts = allDebts.filter((d: any) => 
          d.paymentStatus === 'active' && d.amountRemaining > 0
        ).length;

        // Возвращаем обновленные данные со статистикой
        return {
          ...cache.data,
          stats: {
            ...cache.data.stats,
            totalDebts: allDebts.length,
            activeDebts,
            overdueDebts: overdueDebts.length,
            totalOwed,
            totalDebt,
            sentDebtsCount: activeDebtsOwedToMe.length,
            receivedDebtsCount: activeDebtsIOwe.length,
            paidDebts: allDebts.filter((d: any) => d.paymentStatus === 'paid').length,
            pendingVerification: allDebts.filter((d: any) => d.paymentStatus === 'pending_verification').length
          }
        };
      }
      
      // Если долгов нет, возвращаем как есть
      return cache.data;
    } else {
      console.log('Кэш устарел');
      
      // Даже если кэш устарел, можно его показать в оффлайн режиме
      // но пометить как устаревший
      return {
        ...cache.data,
        _isStale: true
      };
    }
  } catch (error) {
    console.error('Ошибка при загрузке из кэша:', error);
    return null;
  }
};

const fetchProfile = async (forceRefresh = false) => {
  setLoading(true);
  setError(null);
  
  try {
    // Пытаемся загрузить из кэша, если не принудительное обновление
    if (!forceRefresh) {
      const cachedData = loadFromCache();
      if (cachedData) {
        console.log('Загружаем данные из кэша:', cachedData);
        setData(cachedData);
        setIsOfflineData(!isOnline);
        
        // Загружаем форму из кэша
        setFormData({
          name: cachedData.identity?.registeredName || user?.name || "",
          email: cachedData.identity?.email || "",
          phone: cachedData.identity?.phone || user?.phone || "",
          address: cachedData.identity?.address || "",
          bio: cachedData.identity?.bio || ""
        });
        
        // Если онлайн и кэш устарел или принудительное обновление, обновляем в фоне
        if (isOnline && (cachedData._isStale || forceRefresh)) {
          console.log('Кэш устарел, загружаем свежие данные...');
          fetchFreshData(); // Без await, чтобы не блокировать UI
        }
        
        setLoading(false);
        return;
      }
    }

    // Если нет кэша или принудительное обновление, загружаем с сервера
    if (isOnline) {
      console.log('Загружаем свежие данные с сервера...');
      await fetchFreshData();
    } else {
      throw new Error("Нет подключения к интернету и нет кэшированных данных");
    }
    
  } catch (error) {
    console.error("Error fetching profile:", error);
    
    // Пытаемся загрузить из кэша в случае ошибки
    const cachedData = loadFromCache();
    if (cachedData) {
      console.log('Ошибка загрузки, используем кэш:', cachedData);
      setData(cachedData);
      setIsOfflineData(true);
      setFormData({
        name: cachedData.identity?.registeredName || user?.name || "",
        email: cachedData.identity?.email || "",
        phone: cachedData.identity?.phone || user?.phone || "",
        address: cachedData.identity?.address || "",
        bio: cachedData.identity?.bio || ""
      });
      setError(isOnline 
        ? "Ошибка загрузки свежих данных. Используются кэшированные." 
        : "Нет подключения к интернету. Используются кэшированные данные."
      );
    } else {
      console.log('Нет кэша для отображения');
      setError(isOnline 
        ? "Не удалось загрузить профиль" 
        : "Нет подключения к интернету и нет сохраненных данных"
      );
    }
  } finally {
    setLoading(false);
    setRefreshing(false);
  }
};

  const fetchFreshData = async () => {
    try {
      const [profileRes, debtsRes] = await Promise.all([
        api.get("/profile/me"),
        api.get("/debts/my")
      ]);
      
      const profileData = profileRes.data;
      const allDebts = debtsRes.data || [];
      const currentUserId = user?.globalIdentityId;
      const now = new Date();
      
      // Filter debts more accurately
      const activeDebtsIOwe = allDebts.filter((d: any) => {
        const isReceiver = d.receiverIdentityId?._id === currentUserId;
        return d.paymentStatus === 'active' && 
               d.amountRemaining > 0 && 
               isReceiver;
      });
      
      const activeDebtsOwedToMe = allDebts.filter((d: any) => {
        const isSender = d.senderIdentityId?._id === currentUserId;
        return d.paymentStatus === 'active' && 
               d.amountRemaining > 0 && 
               isSender;
      });
      
      // Overdue calculation
      const overdueDebts = allDebts.filter((d: any) => {
        const isActive = d.paymentStatus === 'active';
        const isOverdue = d.overdueStatus === 'overdue';
        const isPastDue = d.dueDate && new Date(d.dueDate) < now;
        
        return isActive && d.amountRemaining > 0 && (isOverdue || isPastDue);
      });
      
      // Calculate totals
      const totalOwed = activeDebtsOwedToMe
        .reduce((sum: number, d: any) => sum + d.amountRemaining, 0);
      
      const totalDebt = activeDebtsIOwe
        .reduce((sum: number, d: any) => sum + d.amountRemaining, 0);
      
      const activeDebts = allDebts.filter((d: any) => 
        d.paymentStatus === 'active' && d.amountRemaining > 0
      ).length;

      const finalData = {
        ...profileData,
        stats: {
          ...profileData.stats,
          totalDebts: allDebts.length,
          activeDebts,
          overdueDebts: overdueDebts.length,
          totalOwed,
          totalDebt,
          sentDebtsCount: activeDebtsOwedToMe.length,
          receivedDebtsCount: activeDebtsIOwe.length,
          paidDebts: allDebts.filter((d: any) => d.paymentStatus === 'paid').length,
          pendingVerification: allDebts.filter((d: any) => d.paymentStatus === 'pending_verification').length
        }
      };
      
      setData(finalData);
      setIsOfflineData(false);
      
      setFormData({
        name: profileData.identity?.registeredName || user?.name || "",
        email: profileData.identity?.email || "",
        phone: profileData.identity?.phone || user?.phone || "",
        address: profileData.identity?.address || "",
        bio: profileData.identity?.bio || ""
      });

      // Сохраняем в кэш
      saveToCache(profileData, allDebts);
      
    } catch (error) {
      console.error("Error fetching fresh data:", error);
      throw error;
    }
  };

  const handleBasicInfoSave = async () => {
    if (!formData.name.trim()) {
      setError("Имя обязательно для заполнения");
      return;
    }

    // В оффлайн режиме не разрешаем сохранение
    if (!isOnline) {
      setError("Нет подключения к интернету. Сохранение невозможно.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      
      const res = await api.put("/profile/update", formData);
      
      if (res.data.success) {
        const updatedData = {
          ...data,
          identity: { ...data.identity, ...formData }
        };
        
        setData(updatedData);
        
        if (formData.name !== user?.name) {
          updateUser({ name: formData.name });
        }
        
        // Обновляем кэш
        const cachedDebts = localStorage.getItem(CACHE_KEYS.DEBTS);
        const debts = cachedDebts ? JSON.parse(cachedDebts) : [];
        saveToCache(updatedData, debts);
        
        setEditMode(null);
        setSuccess("Профиль успешно обновлен!");
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (error: any) {
      console.error("Error updating profile:", error);
      const errorMessage = error.response?.data?.message || "Ошибка обновления профиля";
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setError(null);

    // В оффлайн режиме не разрешаем смену пароля
    if (!isOnline) {
      setError("Нет подключения к интернету. Смена пароля невозможна.");
      return;
    }

    if (!passwordData.currentPassword) {
      setError("Введите текущий пароль");
      return;
    }

    if (!passwordData.newPassword) {
      setError("Введите новый пароль");
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError("Новые пароли не совпадают");
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setError("Пароль должен содержать минимум 6 символов");
      return;
    }

    try {
      setSaving(true);
      
      const res = await api.put("/profile/change-password", {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });
      
      if (res.data.success) {
        setPasswordData({
          currentPassword: "",
          newPassword: "",
          confirmPassword: ""
        });
        setEditMode(null);
        setSuccess("Пароль успешно изменен!");
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (error: any) {
      console.error("Error changing password:", error);
      const errorMessage = error.response?.data?.message || "Ошибка изменения пароля";
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditMode(null);
    setEditing(false);
    setError(null);
    if (data) {
      setFormData({
        name: data.identity?.registeredName || user?.name || "",
        email: data.identity?.email || "",
        phone: data.identity?.phone || user?.phone || "",
        address: data.identity?.address || "",
        bio: data.identity?.bio || ""
      });
    }
  };

  const handleRefresh = async () => {
    if (!isOnline) {
      setError("Нет подключения к интернету. Обновление невозможно.");
      return;
    }
    
    setRefreshing(true);
    setError(null);
    await fetchProfile(true);
  };

  const clearCache = () => {
    localStorage.removeItem(CACHE_KEYS.PROFILE);
    localStorage.removeItem(CACHE_KEYS.DEBTS);
    localStorage.removeItem(CACHE_KEYS.TIMESTAMP);
    setData(null);
    fetchProfile(true);
    setSuccess("Кэш очищен. Загружаем свежие данные...");
    setTimeout(() => setSuccess(null), 3000);
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950/30 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
          <p className="text-gray-400">Загрузка профиля...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950/30 pb-20">
     

      {/* Success/Error Messages */}
      {success && (
        <div className="fixed top-16 right-4 z-50 animate-slide-in">
          <div className="px-6 py-3 rounded-xl bg-emerald-500/20 backdrop-blur-xl border border-emerald-500/30">
            <p className="text-emerald-400 font-medium">{success}</p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="fixed top-16 right-4 z-50 animate-slide-in">
          <div className="px-6 py-3 rounded-xl bg-rose-500/20 backdrop-blur-xl border border-rose-500/30">
            <p className="text-rose-400 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Luxury Header */}
      <div className="relative overflow-hidden lg:pt-12">
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/10 via-purple-500/10 to-transparent" />
        
        <div className="relative px-6 pt-16 pb-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">
                Профиль
              </h1>
              <p className="text-gray-400 mt-2">Ваш финансовый профиль</p>
             {/* Status Bar */}
      <div className="absolute top-20 left-4 right-24 z-40 flex justify-between items-center">
        <div className="flex items-center gap-2">
          {!isOnline && (
            <div className="px-3 py-1 rounded-full bg-amber-500/20 backdrop-blur-sm border border-amber-500/30 flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 text-xs font-medium">Оффлайн</span>
            </div>
          )}
          {isOfflineData && isOnline && (
            <div className="px-3 py-1 rounded-full bg-blue-500/20 backdrop-blur-sm border border-blue-500/30 flex items-center gap-2">
              <Wifi className="w-4 h-4 text-blue-400" />
              <span className="text-blue-400 text-xs font-medium">Кэш</span>
            </div>
          )}
        </div>
        
        {isOnline && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-1 rounded-full bg-cyan-500/20 backdrop-blur-sm border border-cyan-500/30 flex items-center gap-2  hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-cyan-400 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="text-cyan-400 text-xs font-medium">
              {refreshing ? 'Обновление...' : 'Обновить'}
            </span>
          </button>
        )}
      </div>
            </div>
            <button 
              onClick={() => {
                if (editing && editMode) {
                  handleCancelEdit();
                } else {
                  setEditing(!editing);
                  setEditMode(null);
                }
              }}
              className="p-3 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-110"
            >
              {editing ? (
                <X className="w-6 h-6 text-gray-300" />
              ) : (
                <Edit2 className="w-6 h-6 text-gray-300" />
              )}
            </button>
          </div>

          {/* Premium Identity Card */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500/30 via-purple-500/30 to-pink-500/30 rounded-3xl blur opacity-40 group-hover:opacity-60 transition-opacity duration-500" />
            
            <div className="relative p-6 rounded-3xl bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-950/80 backdrop-blur-xl border border-white/10">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  {/* Avatar with Gradient Ring */}
                  <div className="relative">
                    <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-2xl blur opacity-30 group-hover:opacity-50 transition-opacity duration-500" />
                    <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-xl">
                      <span className="text-white font-bold text-2xl">
                        {formData.name?.charAt(0).toUpperCase() || "?"}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex-1">
                    {editing && editMode === "basic" ? (
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full text-xl font-bold bg-transparent text-white border-b border-cyan-500/50 focus:outline-none focus:border-cyan-500 transition-colors"
                        placeholder="Введите имя"
                        disabled={!isOnline && !isOfflineData}
                      />
                    ) : (
                      <>
                        <h2 className="text-xl font-bold text-white mb-1 truncate">
                          {formData.name || "Без имени"}
                        </h2>
                        {!isOnline && isOfflineData && (
                          <div className="flex items-center gap-1 mt-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            <span className="text-xs text-amber-400">оффлайн данные</span>
                          </div>
                        )}
                      </>
                    )}
                    <p className="text-gray-400 text-sm">{formData.phone}</p>
                    
                    {/* Status Badge */}
                    <div className="flex items-center gap-2 mt-2">
                      <div className={`w-2 h-2 rounded-full ${data?.identity?.trustScore >= 70 ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                      <span className="text-xs font-medium text-gray-300">
                        {data?.identity?.trustScore >= 70 ? "Высокий рейтинг" : "Средний рейтинг"}
                      </span>
                    </div>
                  </div>
                </div>
                
                {editing && editMode === "basic" ? (
                  <button
                    onClick={handleBasicInfoSave}
                    disabled={saving || !isOnline}
                    className="p-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                  >
                    <Save className="w-5 h-5 text-emerald-400" />
                  </button>
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-cyan-400 transition-colors" />
                )}
              </div>

              {/* Trust Score Progress Bar */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm text-gray-300">Рейтинг доверия</span>
                  </div>
                  <span className={`text-lg font-bold ${
                    data?.identity?.trustScore >= 70 ? "text-emerald-400" :
                    data?.identity?.trustScore >= 40 ? "text-amber-400" : "text-rose-400"
                  }`}>
                    {data?.identity?.trustScore || 50}%
                  </span>
                </div>
                
                <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 opacity-20" />
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ${
                      data?.identity?.trustScore >= 70 ? "bg-gradient-to-r from-emerald-500 to-emerald-400" :
                      data?.identity?.trustScore >= 40 ? "bg-gradient-to-r from-amber-500 to-amber-400" : 
                      "bg-gradient-to-r from-rose-500 to-rose-400"
                    }`}
                    style={{ width: `${Math.min(data?.identity?.trustScore || 50, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 space-y-6">
        {/* Edit Mode Selection */}
        {editing && !editMode && (
          <div className="group relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 rounded-2xl blur opacity-30" />
            <div className="relative p-5 rounded-2xl bg-gradient-to-br from-slate-900/80 to-slate-950/80 backdrop-blur-xl border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-cyan-400" />
                Редактирование профиля
              </h3>
              
              <div className="space-y-3">
                <button
                  onClick={() => setEditMode("basic")}
                  disabled={!isOnline && !isOfflineData}
                  className="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors duration-300 disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10">
                      <User className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-white font-medium">Основная информация</p>
                      <p className="text-xs text-gray-400">Имя, email, адрес</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>

                <button
                  onClick={() => setEditMode("password")}
                  disabled={!isOnline}
                  className="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors duration-300 disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <Lock className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-white font-medium">Безопасность</p>
                      <p className="text-xs text-gray-400">Смена пароля</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              
              {!isOnline && (
                <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <p className="text-amber-400 text-sm">
                    {isOfflineData 
                      ? "Редактирование основной информации доступно только в онлайн режиме"
                      : "Редактирование недоступно в оффлайн режиме"
                    }
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Basic Info Edit Form */}
        {editing && editMode === "basic" && (
          <div className="group relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-2xl blur opacity-30" />
            <div className="relative p-5 rounded-2xl bg-gradient-to-br from-slate-900/80 to-slate-950/80 backdrop-blur-xl border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Основная информация</h3>
                <button
                  onClick={handleCancelEdit}
                  className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              
              {!isOnline && (
                <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <p className="text-amber-400 text-sm">
                    Изменения будут сохранены только при подключении к интернету
                  </p>
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Имя *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50 transition-all"
                    placeholder="Введите ваше имя"
                    required
                    disabled={!isOnline && !isOfflineData}
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50 transition-all"
                    placeholder="example@mail.com"
                    disabled={!isOnline && !isOfflineData}
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Адрес</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50 transition-all"
                    placeholder="Город, улица, дом"
                    disabled={!isOnline && !isOfflineData}
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">О себе</label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50 transition-all min-h-[100px]"
                    placeholder="Расскажите о себе..."
                    rows={3}
                    disabled={!isOnline && !isOfflineData}
                  />
                </div>

                <button
                  onClick={handleBasicInfoSave}
                  disabled={saving || !isOnline}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-semibold hover:opacity-90 transition-all duration-300 disabled:opacity-50"
                >
                  {saving ? "Сохранение..." : "Сохранить изменения"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Password Change Form */}
        {editing && editMode === "password" && (
          <div className="group relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-2xl blur opacity-30" />
            <div className="relative p-5 rounded-2xl bg-gradient-to-br from-slate-900/80 to-slate-950/80 backdrop-blur-xl border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Смена пароля</h3>
                <button
                  onClick={handleCancelEdit}
                  className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              
              {!isOnline && (
                <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <p className="text-rose-400 text-sm">
                    Смена пароля недоступна в оффлайн режиме
                  </p>
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Текущий пароль *</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                      className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50 transition-all pr-12"
                      placeholder="Введите текущий пароль"
                      required
                      disabled={!isOnline}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Новый пароль *</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                      className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50 transition-all pr-12"
                      placeholder="Введите новый пароль"
                      required
                      disabled={!isOnline}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Подтвердите пароль *</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50 transition-all pr-12"
                      placeholder="Повторите новый пароль"
                      required
                      disabled={!isOnline}
                    />
                  </div>
                </div>

                <button
                  onClick={handlePasswordChange}
                  disabled={saving || !isOnline}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:opacity-90 transition-all duration-300 disabled:opacity-50"
                >
                  {saving ? "Смена пароля..." : "Изменить пароль"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Financial Statistics Cards */}
        {!editing && (
          <>
            <div className="grid grid-cols-2 gap-4">
              {/* Money Owed */}
              <div className="group relative">
                <div className="absolute -inset-0.5 bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 rounded-2xl blur opacity-30 group-hover:opacity-50 transition-opacity duration-500" />
                <div className="relative p-5 rounded-2xl bg-gradient-to-br from-slate-900/80 to-slate-950/80 backdrop-blur-xl border border-emerald-500/20">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 rounded-xl bg-emerald-500/10">
                      <TrendingUp className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Активных</p>
                      <p className="text-sm font-semibold text-white">{data?.stats?.sentDebtsCount || 0}</p>
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">Мне должны</p>
                  <p className="text-2xl font-bold bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">
                    {data?.stats?.totalOwed || 0} ₽
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                    <span className="text-xs text-gray-400">Стабильный рост</span>
                  </div>
                </div>
              </div>

              {/* Money Debt */}
              <div className="group relative">
                <div className="absolute -inset-0.5 bg-gradient-to-br from-rose-500/20 to-pink-500/20 rounded-2xl blur opacity-30 group-hover:opacity-50 transition-opacity duration-500" />
                <div className="relative p-5 rounded-2xl bg-gradient-to-br from-slate-900/80 to-slate-950/80 backdrop-blur-xl border border-rose-500/20">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 rounded-xl bg-rose-500/10">
                      <TrendingDown className="w-5 h-5 text-rose-400" />
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Активных</p>
                      <p className="text-sm font-semibold text-white">{data?.stats?.receivedDebtsCount || 0}</p>
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">Я должен</p>
                  <p className="text-2xl font-bold bg-gradient-to-r from-rose-300 to-pink-300 bg-clip-text text-transparent">
                    {data?.stats?.totalDebt || 0} ₽
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <AlertCircle className="w-3 h-3 text-amber-400" />
                    <span className="text-xs text-gray-400">Требует внимания</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Account Information */}
            <div className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-slate-700/20 to-slate-800/20 rounded-2xl blur opacity-30 group-hover:opacity-50" />
              <div className="relative p-5 rounded-2xl bg-gradient-to-br from-slate-900/80 to-slate-950/80 backdrop-blur-xl border border-white/10">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-cyan-400" />
                  Информация об аккаунте
                </h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors duration-300">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-cyan-500/10">
                        <User className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Имя</p>
                        <p className="text-white font-medium">{formData.name || "Не указано"}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </div>

                  {formData.email && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors duration-300">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-500/10">
                          <Mail className="w-4 h-4 text-purple-400" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-400">Email</p>
                          <p className="text-white font-medium">{formData.email}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    </div>
                  )}

                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors duration-300">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/10">
                        <CreditCard className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Телефон</p>
                        <p className="text-white font-medium">{formData.phone || "Не указан"}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </div>

                  {formData.address && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors duration-300">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-amber-500/10">
                          <MapPin className="w-4 h-4 text-amber-400" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-400">Адрес</p>
                          <p className="text-white font-medium text-sm truncate max-w-[180px]">
                            {formData.address}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Additional Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900/50 to-slate-950/50 backdrop-blur-sm border border-white/5 text-center">
                <DollarSign className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">{data?.stats?.totalDebts || 0}</p>
                <p className="text-xs text-gray-400 mt-1">Всего долгов</p>
              </div>
              
              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900/50 to-slate-950/50 backdrop-blur-sm border border-white/5 text-center">
                <BarChart3 className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">
                  {data?.stats?.activeDebts || 0}
                </p>
                <p className="text-xs text-gray-400 mt-1">Активных</p>
              </div>
              
              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900/50 to-slate-950/50 backdrop-blur-sm border border-white/5 text-center">
                <Calendar className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">
                  {data?.identity?.createdAt ? 
                    new Date(data.identity.createdAt).getFullYear() : 
                    new Date().getFullYear()}
                </p>
                <p className="text-xs text-gray-400 mt-1">Год регистрации</p>
              </div>
            </div>

            {/* Cache Management */}
            {isOnline && (
              <div className="group relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-slate-600/20 to-slate-700/20 rounded-2xl blur opacity-30" />
                <div className="relative p-5 rounded-2xl bg-gradient-to-br from-slate-900/80 to-slate-950/80 backdrop-blur-xl border border-white/10">
                  <h3 className="text-lg font-semibold text-white mb-4">Управление кэшем</h3>
                  <div className="space-y-3">
                    <button
                      onClick={clearCache}
                      className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 transition-colors duration-300"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Очистить кэш и загрузить свежие данные
                    </button>
                    <p className="text-xs text-gray-400 text-center">
                      Кэш обновляется автоматически каждые 60 минут
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Logout Button */}
        <div className="pt-6 pb-6">
          <button
            onClick={logout}
            className="group relative w-full overflow-hidden rounded-2xl p-px transition-all duration-500 hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-red-500 via-rose-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative flex items-center justify-center gap-3 p-5 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-950/90 backdrop-blur-xl">
              <div className="p-2 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 shadow-lg">
                <LogOut className="w-6 h-6 text-white" />
              </div>
              
              <span className="text-lg font-semibold bg-gradient-to-r from-red-300 to-pink-300 bg-clip-text text-transparent">
                Выйти из аккаунта
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Bottom Gradient */}
      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
    </div>
  );
}