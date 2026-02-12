import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Clock, 
  AlertTriangle,
  CreditCard,
  Bell,
  Shield,
  CheckCircle,
  RefreshCw,
  ChevronRight,
  Plus,
  Activity,
  Wifi,
  WifiOff,
  Save,
  AlertCircle
} from "lucide-react";
import { DebtDashboard } from '../components/DebtDashboard';
import { UpcomingPayments } from '../components/UpcomingPayments';
import { useNotification } from "../context/NotificationContext";
import { RealTimeAlerts } from '../components/RealTimeAlerts';
import { TrustCircle } from "../components/TrustCircle";
import { formatMoneyRUB } from "../utils/formatMoney";

interface DashboardStats {
  totalDebt: number;
  totalOwed: number;
  activeDebtsIOwe: number;
  activeDebtsOwedToMe: number;
  totalActiveDebts: number;
  overdueDebts: number;
  upcomingDue: number;
  averageTrustScore: number;
  totalCustomers: number;
  recentActivity: number;
  lastUpdated: string;
}

interface RecentDebt {
  _id: string;
  amountRemaining: number;
    paymentStatus: string;
  otherPartyName: string;
  dueDate?: string;
  createdAt: string;
}

interface CustomerOverview {
  _id: string;
  localName: string;
  trustScore: number;
  totalActiveDebt: number;
  totalDebtToMe?: number;
  totalDebtIOwe?: number;
  isOwedToMe?: boolean;
  isIOwe?: boolean;
  overdueCount: number;
}

// Ключи для localStorage
const DASHBOARD_CACHE_KEY = "dashboard_cache";
const DASHBOARD_LAST_UPDATED_KEY = "dashboard_last_updated";
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 минут

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notifications } = useNotification();
  
  const [stats, setStats] = useState<DashboardStats>({
    totalDebt: 0,
    totalOwed: 0,
    activeDebtsIOwe: 0,
    activeDebtsOwedToMe: 0,
    totalActiveDebts: 0,
    overdueDebts: 0,
    upcomingDue: 0,
    averageTrustScore: 0,
    totalCustomers: 0,
    recentActivity: 0,
    lastUpdated: new Date().toISOString()
  });
  
  const [recentDebts, setRecentDebts] = useState<RecentDebt[]>([]);
  const [topCustomers, setTopCustomers] = useState<CustomerOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [cacheStatus, setCacheStatus] = useState<'fresh' | 'stale' | 'offline'>('fresh');
  
  
  // Функция для получения имени клиента

  // Используем useRef для предотвращения бесконечных ререндеров
  const syncInProgressRef = useRef(false);

// Загрузка кэшированных данных
// Загрузка кэшированных данных
const loadCachedData = useCallback(() => {
  try {
    const cached = localStorage.getItem(DASHBOARD_CACHE_KEY);
    const lastUpdated = localStorage.getItem(DASHBOARD_LAST_UPDATED_KEY);
    
    console.log('📦 Попытка загрузки кэша:', { cached: !!cached, lastUpdated });
    
    if (cached) {
      const parsed = JSON.parse(cached);
      console.log('📦 Загружены кэшированные данные дашборда');
      
      if (parsed.stats) setStats(parsed.stats);
      if (parsed.recentDebts) setRecentDebts(parsed.recentDebts);
      if (parsed.topCustomers) setTopCustomers(parsed.topCustomers);
      
      if (lastUpdated) {
        setLastSyncTime(new Date(lastUpdated).toLocaleString('ru-RU'));
      }
      
      return true;
    }
  } catch (error) {
    console.error('Ошибка загрузки кэша:', error);
  }
  
  console.log('📦 Кэш не найден или произошла ошибка');
  return false;
}, []);

  // Сохранение данных в кэш
  const saveToCache = useCallback((data: {
    stats: DashboardStats,
    recentDebts: RecentDebt[],
    topCustomers: CustomerOverview[]
  }) => {
    try {
      localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(DASHBOARD_LAST_UPDATED_KEY, new Date().toISOString());
      console.log('💾 Данные дашборда сохранены в кэш');
    } catch (error) {
      console.error('Ошибка сохранения в кэш:', error);
    }
  }, []);

  // Проверка актуальности кэша
  const isCacheValid = useCallback(() => {
    const lastUpdated = localStorage.getItem(DASHBOARD_LAST_UPDATED_KEY);
    if (!lastUpdated) return false;
    
    const lastUpdateTime = new Date(lastUpdated).getTime();
    const currentTime = Date.now();
    
    return (currentTime - lastUpdateTime) < CACHE_EXPIRY_MS;
  }, []);

  // Загрузка данных с сервера
  const fetchFromServer = useCallback(async () => {
    if (!isOnline || syncInProgressRef.current) {
      console.log('🌐 Нет подключения к интернету или синхронизация уже идет');
      return;
    }

    try {
      syncInProgressRef.current = true;
      setSyncing(true);
      
      const [debtsRes, customersRes, profileRes] = await Promise.all([
        api.get("/debts/my"),
        api.get("/customers"),
        api.get("/profile/me")
      ]);

      const debts = debtsRes.data || [];
      const customers = customersRes.data || [];
      const profile = profileRes.data || {};
      const currentUserId = user?.globalIdentityId;

      // Расчет статистики
      const activeDebtsIOwe = debts.filter((d: any) => {
        const isReceiver = d.receiverIdentityId?._id === currentUserId;
        return d.paymentStatus === 'active' && d.amountRemaining > 0 && isReceiver;
      });

      const activeDebtsOwedToMe = debts.filter((d: any) => {
        const isSender = d.senderIdentityId?._id === currentUserId;
        return d.paymentStatus === 'active' && d.amountRemaining > 0 && isSender;
      });

      const now = new Date();
      const overdueDebts = debts.filter((d: any) => 
        d.overdueStatus === 'overdue' || 
        (d.dueDate && new Date(d.dueDate) < now && d.paymentStatus === 'active' && d.amountRemaining > 0)
      );

      const totalDebt = activeDebtsIOwe
        .reduce((sum: number, d: any) => sum + d.amountRemaining, 0);

      const totalOwed = activeDebtsOwedToMe
        .reduce((sum: number, d: any) => sum + d.amountRemaining, 0);

      const totalActiveDebts = activeDebtsIOwe.length + activeDebtsOwedToMe.length;

      const upcomingDue = debts.filter((d: any) => {
        if (!d.dueDate || d.paymentStatus !== 'active' || d.amountRemaining <= 0) return false;
        const dueDate = new Date(d.dueDate);
        const timeDiff = dueDate.getTime() - now.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        return daysDiff <= 3 && daysDiff >= 0 && d.overdueStatus !== 'overdue';
      }).length;

      const averageTrustScore = customers.length > 0 
        ? Math.round(customers.reduce((sum: number, c: CustomerOverview) => 
            sum + (c.trustScore || 50), 0) / customers.length)
        : 0;

      // Получение последних долгов
     // Получение последних долгов
// Найдите этот блок кода и замените полностью:
const recent = debts
   .filter((d: any) => d.paymentStatus !== 'paid' && d.amountRemaining > 0)
  .sort((a: any, b: any) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
  .slice(0, 5)
  .map((d: any) => ({
    _id: d._id,
    amountRemaining: d.amountRemaining,
    paymentStatus: d.paymentStatus,
    otherPartyName: d.senderIdentityId?._id === currentUserId
      ? d.receiverIdentityId?.localName || 
        d.receiverIdentityId?.registeredName || 
        d.receiverIdentityId?.name || 
        "Клиент"
      : d.senderIdentityId?.localName || 
        d.senderIdentityId?.registeredName || 
        d.senderIdentityId?.name || 
        "Клиент",
    dueDate: d.dueDate,
    createdAt: d.createdAt
  }));

      // Получение топ клиентов
      const top = customers
        .map((c: any) => {
          const totalActiveDebt = c.totalActiveDebt || 0;
          // Исправляем получение имени клиента
    const customerName = c.localName || 
                   c.registeredName || 
                   c.name || 
                   c.otherPartyName || 
                   'Без имени';
          const customerDebtsToMe = debts.filter((d: any) => {
            const isSender = d.senderIdentityId?._id === currentUserId;
            const isCustomerReceiver = d.receiverIdentityId?._id === c.targetIdentityId?._id;
            return d.paymentStatus === 'active' && d.amountRemaining > 0 && isSender && isCustomerReceiver;
          });
          
          const customerDebtsIOwe = debts.filter((d: any) => {
            const isReceiver = d.receiverIdentityId?._id === currentUserId;
            const isCustomerSender = d.senderIdentityId?._id === c.targetIdentityId?._id;
            return d.paymentStatus === 'active' && d.amountRemaining > 0 && isReceiver && isCustomerSender;
          });
          
          const totalDebtToMe = customerDebtsToMe.reduce((sum: number, d: any) => 
            sum + (d.amountRemaining || 0), 0);
          
          const totalDebtIOwe = customerDebtsIOwe.reduce((sum: number, d: any) => 
            sum + (d.amountRemaining || 0), 0);
          
          const overdueCount = customerDebtsToMe.filter((d: any) => 
            d.overdueStatus === 'overdue').length;
          
          const isOwedToMe = totalDebtToMe > 0;
          const isIOwe = totalDebtIOwe > 0;
          
          return {
            ...c,
            totalActiveDebt: totalActiveDebt,
            totalDebtToMe: totalDebtToMe,
            totalDebtIOwe: totalDebtIOwe,
            isOwedToMe: isOwedToMe,
            isIOwe: isIOwe,
            overdueCount: overdueCount,
            trustScore: c.trustScore || 50,
            localName: customerName
          };
        })
        .sort((a: any, b: any) => {
          if (b.totalActiveDebt > a.totalActiveDebt) return 1;
          if (a.totalActiveDebt > b.totalActiveDebt) return -1;
          return (b.trustScore || 0) - (a.trustScore || 0);
        })
        .slice(0, 5);

      const newStats: DashboardStats = {
        totalDebt,
        totalOwed,
        activeDebtsIOwe: activeDebtsIOwe.length,
        activeDebtsOwedToMe: activeDebtsOwedToMe.length,
        totalActiveDebts,
        overdueDebts: overdueDebts.length,
        upcomingDue,
        averageTrustScore,
        totalCustomers: customers.length,
        recentActivity: profile.stats?.recentActivity || 0,
        lastUpdated: new Date().toISOString()
      };

      setStats(newStats);
      setRecentDebts(recent);
      setTopCustomers(top);
      setLastSyncTime(new Date().toLocaleString('ru-RU'));
      setCacheStatus('fresh');

      // Сохраняем в кэш
      saveToCache({
        stats: newStats,
        recentDebts: recent,
        topCustomers: top
      });

    } catch (error) {
      console.error("Ошибка загрузки данных дашборда:", error);
      
      // При ошибке загрузки с сервера, пробуем загрузить из кэша
      if (!loadCachedData()) {
        console.log('❌ Не удалось загрузить данные');
        setCacheStatus('offline');
      } else {
        setCacheStatus('stale');
      }
    } finally {
      setLoading(false);
      setSyncing(false);
      syncInProgressRef.current = false;
    }
  }, [isOnline, loadCachedData, saveToCache, user?.globalIdentityId]);

  // Основная функция загрузки данных
// Основная функция загрузки данных
// Основная функция загрузки данных
// Основная функция загрузки данных
const loadDashboardData = useCallback(async (forceRefresh = false) => {
  try {
    // Если не онлайн, загружаем из кэша
    if (!isOnline && !forceRefresh) {
      console.log('📴 Оффлайн режим, загрузка из кэша');
      const hasCache = loadCachedData();
      if (hasCache) {
        setCacheStatus('offline');
      } else {
        // Если кэша нет, показываем ошибку
        console.log('❌ Кэш не найден');
      }
      // ВАЖНО: немедленно останавливаем loading
      setLoading(false);
      return;
    }

    // Если онлайн и кэш валиден, не форсируем обновление
    if (isOnline && !forceRefresh && isCacheValid()) {
      console.log('⚡ Используем актуальный кэш');
      if (!loadCachedData()) {
        // Если кэш не загрузился, загружаем с сервера
        await fetchFromServer();
      } else {
        setCacheStatus('fresh');
        setLoading(false); // Останавливаем loading при успешной загрузке кэша
      }
      return;
    }

    // Загружаем с сервера
    await fetchFromServer();
  } catch (error) {
    console.error('Ошибка в loadDashboardData:', error);
    // При любой ошибке останавливаем loading
    setLoading(false);
  }
}, [isOnline, loadCachedData, isCacheValid, fetchFromServer]);
// Добавьте флаг для отслеживания первоначальной загрузки
const initialLoadDone = useRef(false);

useEffect(() => {
  const loadData = async () => {
    // Если это первый запуск
    if (!initialLoadDone.current) {
      await loadDashboardData();
      initialLoadDone.current = true;
    }
  };
  loadData();
}, [loadDashboardData]);

// Инициализация при монтировании
  useEffect(() => {
    const loadData = async () => {
      await loadDashboardData();
    };
    loadData();
  }, [loadDashboardData]); // Зависимость от loadDashboardData
// Фоновая синхронизация при появлении интернета
const syncInBackground = useCallback(async () => {
  if (!isOnline) return;
  
  try {
    console.log('🌐 Фоновая синхронизация...');
    setSyncing(true);
    await fetchFromServer();
    console.log('✅ Фоновая синхронизация завершена');
  } catch (error) {
    console.error('Ошибка фоновой синхронизации:', error);
  } finally {
    setSyncing(false);
  }
}, [isOnline, fetchFromServer]);

// Добавьте в useEffect обработчика сетевого статуса:

  // Обработчики сетевого статуса
 useEffect(() => {
  const handleOnline = () => {
    console.log('🌐 Подключение к сети восстановлено');
    setIsOnline(true);
    
    // Обновляем UI сразу, показываем кэшированные данные
    if (cacheStatus === 'offline' && stats.totalDebt === 0) {
      // Если данные пустые, показываем кэш
      loadCachedData();
    }
    
    // Запускаем фоновую синхронизацию
    setTimeout(() => {
      syncInBackground();
    }, 2000); // Даем пользователю время увидеть интерфейс
  };

  const handleOffline = () => {
    console.log('📴 Потеряно подключение к сети');
    setIsOnline(false);
    
    // Немедленно показываем кэшированные данные если их еще нет
    if (stats.totalDebt === 0) {
      loadCachedData();
    }
    
    setCacheStatus('offline');
    setLoading(false); // Останавливаем loading
  };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [cacheStatus, loadDashboardData ,syncInBackground, stats.totalDebt]);

  // Периодическая синхронизация
  useEffect(() => {
    if (!isOnline) return;

    const syncInterval = setInterval(() => {
      if (isCacheValid()) {
        console.log('⚡ Кэш актуален, пропускаем периодическую синхронизацию');
        return;
      }
      loadDashboardData(true);
    }, 300000); // Каждые 5 минут

    return () => clearInterval(syncInterval);
  }, [isOnline, loadDashboardData, isCacheValid]);

  // Функция принудительного обновления
  const handleForceRefresh = useCallback(async () => {
    await loadDashboardData(true);
  }, [loadDashboardData]);

  // Функция принудительного сохранения кэша
  const handleForceSave = useCallback(() => {
    saveToCache({ stats, recentDebts, topCustomers });
    alert('Дашборд сохранен в кэш');
  }, [stats, recentDebts, topCustomers, saveToCache]);

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'new-debt':
        navigate("/customers/new-debt");
        break;
      case 'all-customers':
        navigate("/customers");
        break;
      case 'all-chats':
        navigate("/all-chats");
        break;
      case 'profile':
        navigate("/profile");
        break;
    }
  };

 

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'active': return <Activity className="w-4 h-4 text-green-400" />;
    case 'overdue': return <AlertTriangle className="w-4 h-4 text-red-400" />;
    case 'pending_verification': return <Clock className="w-4 h-4 text-yellow-400" />;
    case 'paid': return <CheckCircle className="w-4 h-4 text-blue-400" />;
    default: return null;
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'active': return 'активный';
    case 'overdue': return 'просрочен';
    case 'pending_verification': return 'ожидает подтверждения';
    case 'paid': return 'оплачен';
    default: return status;
  }
};

 if (loading && !isOnline) {
  // Если мы оффлайн, показываем кэш вместо загрузки
  const hasCache = loadCachedData();
  if (hasCache) {
    setLoading(false);
  } else {
    // Если кэша нет, показываем ошибку вместо бесконечной загрузки
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <WifiOff className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Нет подключения к интернету
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Данные не загружены. Проверьте подключение.
              </p>
              <button
                onClick={loadCachedData}
                className="mt-4 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
              >
                Показать кэшированные данные
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

if (loading) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-blue-400 animate-pulse" />
            </div>
          </div>
          <p className="ml-4 text-gray-600 dark:text-gray-300">Загрузка дашборда...</p>
        </div>
      </div>
    </div>
  );
}

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Luxury Header */}
        <div className="mb-6 sm:mb-8 lg:mb-10 lg:pt-16">
          <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-4 mb-4 sm:mb-6">
            <div className="w-full xs:w-auto">
              <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 animate-pulse shadow-md sm:shadow-lg"></div>
                <h1 className="text-xl xs:text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Финансовый дашборд
                </h1>
              </div>
              <p className="text-xs xs:text-sm text-gray-500 dark:text-gray-400 font-light">
                Полный обзор ваших финансов и доверительных отношений
              </p>
              
              {/* Статус сети и синхронизации */}
              <div className="flex items-center gap-2 mt-3">
                <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                  isOnline 
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                    : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                }`}>
                  {isOnline ? (
                    <>
                      <Wifi className="w-3 h-3" />
                      <span>Онлайн</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3" />
                      <span>Оффлайн</span>
                    </>
                  )}
                </div>
                
                {lastSyncTime && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Обновлено: {lastSyncTime}
                  </div>
                )}
                
              {isOnline && syncing && (
  <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/90 text-white text-sm animate-pulse">
    <RefreshCw className="w-4 h-4 animate-spin" />
    <span>Фоновая синхронизация...</span>
  </div>
)}
                
                {!isOnline && cacheStatus === 'offline' && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-500/20 text-gray-600 dark:text-gray-400 text-xs">
                    <AlertCircle className="w-3 h-3" />
                    <span>Кэшированные данные</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={handleForceRefresh}
                disabled={syncing}
                className="p-2 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                title="Обновить данные"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              </button>
              
              <button
                onClick={handleForceSave}
                className="p-2 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                title="Сохранить в кэш"
              >
                <Save className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-800 to-transparent"></div>
        </div>

        {/* Предупреждение о работе в оффлайн режиме */}
        {!isOnline && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0" />
              <div>
                <h3 className="font-medium text-amber-800 dark:text-amber-200">
                  Работа в оффлайн режиме
                </h3>
                <p className="text-sm text-amber-600 dark:text-amber-300 mt-1">
                  Вы просматриваете кэшированные данные. 
                  {lastSyncTime && ` Последнее обновление: ${lastSyncTime}`}
                  <br />
                  При подключении к интернету данные автоматически синхронизируются.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Левая колонка - Статистика и Активность */}
          <div className="lg:col-span-2 space-y-8">
            {/* Карточки статистики */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Я должен */}
              <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl p-6 backdrop-blur-sm bg-gradient-to-br from-white/90 to-white/70 dark:from-gray-900/90 dark:to-gray-900/70">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20">
                    <TrendingDown className="w-6 h-6 text-red-400" />
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Активных</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {stats.activeDebtsIOwe}
                    </p>
                  </div>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">Я должен</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatMoneyRUB(stats.totalDebt)}
                </p>
                <div className="mt-3 h-1 bg-gradient-to-r from-red-500 to-orange-500 rounded-full"></div>
              </div>

              {/* Мне должны */}
              <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl p-6 backdrop-blur-sm bg-gradient-to-br from-white/90 to-white/70 dark:from-gray-900/90 dark:to-gray-900/70">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20">
                    <TrendingUp className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Активных</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {stats.activeDebtsOwedToMe}
                    </p>
                  </div>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">Мне должны</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatMoneyRUB(stats.totalOwed)}
                </p>
                <div className="mt-3 h-1 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full"></div>
              </div>

              {/* Средний рейтинг */}
              <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl p-6 backdrop-blur-sm bg-gradient-to-br from-white/90 to-white/70 dark:from-gray-900/90 dark:to-gray-900/70">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                    <Users className="w-6 h-6 text-purple-400" />
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Клиентов</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {stats.totalCustomers}
                    </p>
                  </div>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">Средний рейтинг</p>
                <div className="flex items-center gap-2">
                  <TrustCircle value={stats.averageTrustScore} size="sm" showLabel={false} />
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats.averageTrustScore}%
                  </p>
                </div>
                <div className="mt-3 h-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"></div>
              </div>
            </div>

            {/* Debt Dashboard Component */}
            <div>
              <DebtDashboard />
            </div>

            {/* Upcoming Payments - используем компактную версию */}
            <div className="mt-6">
              <UpcomingPayments compact />
            </div>

       {/* Recent Activity - объединяем с уведомлениями */}
{/* Recent Activity - объединяем с уведомлениями */}
<div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl p-6 backdrop-blur-sm bg-gradient-to-br from-white/90 to-white/70 dark:from-gray-900/90 dark:to-gray-900/70">
  {/* Recent Activity - объединяем с уведомлениями */}
  <div className="flex items-center justify-between mb-6">
    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"></div>
      Активность и уведомления
    </h3>
    <div className="flex gap-2">
      <button
        onClick={() => navigate("/profile")}
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
      >
        Все долги
        <ChevronRight className="w-4 h-4" />
      </button>
      <button
        onClick={() => navigate("/")}
        className="text-sm text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1"
      >
        Все уведомления
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  </div>
  
  {/* Отладочная информация */}
  <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800">
    <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 text-yellow-500" />
      Отладка уведомлений
    </h4>
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div>
        <span className="text-gray-500">Всего уведомлений:</span>
        <span className="font-medium ml-2">{notifications.length}</span>
      </div>
      <div>
        <span className="text-gray-500">Непрочитанных:</span>
        <span className="font-medium ml-2">{notifications.filter(n => !n.read).length}</span>
      </div>
      <div className="col-span-2">
        <span className="text-gray-500">Типы уведомлений:</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {Array.from(new Set(notifications.map(n => n.type || 'unknown'))).map((type: string) => (
            <span key={type} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs">
              {type}: {notifications.filter(n => n.type === type).length}
            </span>
          ))}
        </div>
      </div>
    </div>
  </div>
  
  {/* Уведомления - показываем ВСЕ типы */}
  <div className="mb-6">
    <div className="flex items-center gap-2 mb-4">
      <div className="relative">
        <Bell className="w-4 h-4 text-orange-500" />
        {notifications.filter(n => !n.read).length > 0 && (
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
        )}
      </div>
      <h4 className="font-medium text-gray-900 dark:text-white">Все уведомления</h4>
      <span className="ml-auto text-xs px-2 py-1 bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded-full">
        {notifications.filter(n => !n.read).length} новых
      </span>
    </div>
    
    <div className="space-y-3">
      {notifications
        .filter(n => !n.read) // Показываем только непрочитанные
        .slice(0, 5) // Ограничиваем 5 уведомлениями
        .map((notification, index) => {
          // Функция для получения цвета по типу уведомления
          const getNotificationColor = (type: string) => {
            switch (type) {
              case 'debt_overdue': return 'from-red-500 to-orange-500';
              case 'reminder': return 'from-yellow-500 to-amber-500';
              case 'payment_received': return 'from-emerald-500 to-green-500';
              case 'payment_made': return 'from-blue-500 to-cyan-500';
              case 'debt_created': return 'from-purple-500 to-pink-500';
              case 'trust_score_change': return 'from-indigo-500 to-violet-500';
              default: return 'from-gray-500 to-slate-500';
            }
          };

          // Функция для получения иконки по типу
          const getNotificationIcon = (type: string) => {
            switch (type) {
              case 'debt_overdue': return <AlertTriangle className="w-4 h-4 text-white" />;
              case 'reminder': return <Clock className="w-4 h-4 text-white" />;
              case 'payment_received': return <TrendingUp className="w-4 h-4 text-white" />;
              case 'payment_made': return <TrendingDown className="w-4 h-4 text-white" />;
              case 'debt_created': return <CreditCard className="w-4 h-4 text-white" />;
              case 'trust_score_change': return <Activity className="w-4 h-4 text-white" />;
              default: return <Bell className="w-4 h-4 text-white" />;
            }
          };

          // Функция для получения текста по типу
          const getNotificationTitle = (type: string) => {
            switch (type) {
              case 'debt_overdue': return 'Просрочен долг';
              case 'reminder': return 'Напоминание';
              case 'payment_received': return 'Получен платеж';
              case 'payment_made': return 'Совершен платеж';
              case 'debt_created': return 'Создан долг';
              case 'trust_score_change': return 'Изменен рейтинг';
              default: return 'Уведомление';
            }
          };

          return (
            <div
              key={notification._id || `notification-${index}`}
              onClick={() => {
                // Безопасная навигация с проверкой данных
                const data = notification.data as any;
                if (data?.debtId) {
                  navigate(`/chats/${data.debtId}`);
                } else if (data?.customerId) {
                  navigate(`/customers/${data.customerId}`);
                }
              }}
              className={`p-3 rounded-xl border cursor-pointer transition-all duration-300 hover:shadow-md bg-gradient-to-r ${
                notification.type === 'debt_overdue' 
                  ? 'from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700'
                  : notification.type === 'reminder'
                  ? 'from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-yellow-200 dark:border-yellow-800 hover:border-yellow-300 dark:hover:border-yellow-700'
                  : 'from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border-blue-200 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-gradient-to-br ${getNotificationColor(notification.type || 'default')}`}>
                  {getNotificationIcon(notification.type || 'default')}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {getNotificationTitle(notification.type || 'default')}
                    </p>
                    {notification.createdAt && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(notification.createdAt).toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'short'
                        })}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
                    {notification.message || 'Нет сообщения'}
                  </p>
                  {notification.type && (
                    <p className="text-xs text-gray-400 mt-1">
                      Тип: {notification.type}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })
      }
    </div>
    
    {notifications.filter(n => !n.read).length === 0 ? (
      <div className="text-center py-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
          <Bell className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 mb-2">Нет непрочитанных уведомлений</p>
        <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1">
          <p>Все уведомления будут показаны здесь</p>
          <p>Всего уведомлений в системе: {notifications.length}</p>
        </div>
      </div>
    ) : (
      <button
        onClick={() => navigate("/")}
        className="w-full mt-4 text-center text-sm text-blue-600 dark:text-blue-400 hover:underline py-2"
      >
        Показать все уведомления ({notifications.length})
      </button>
    )}
  </div>
  
  {/* Разделитель */}
  <div className="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent mb-6"></div>
  
  {/* Последние долги */}
 <div>
  <div className="flex items-center gap-2 mb-4">
    <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
      <CreditCard className="w-4 h-4 text-white" />
    </div>
    <h4 className="font-medium text-gray-900 dark:text-white">Последние долги</h4>
    <span className="ml-auto text-xs px-2 py-1 bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-full">
      {recentDebts.length} всего
    </span>
  </div>
  
  <div className="space-y-3">
    {recentDebts.length > 0 ? (
      recentDebts.map((debt, index) => {
        // Используем paymentStatus вместо status
        const status = debt.paymentStatus || 'active';
        const statusText = getStatusText(status);
        const statusColorClass = status === 'overdue' 
          ? 'text-red-600 dark:text-red-400' 
          : status === 'active' 
          ? 'text-emerald-600 dark:text-emerald-400'
          : status === 'pending_verification'
          ? 'text-yellow-600 dark:text-yellow-400'
          : status === 'paid'
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-gray-600 dark:text-gray-400';
        
        const statusBgClass = status === 'overdue'
          ? 'bg-red-500/20 text-red-600 dark:text-red-400'
          : status === 'active'
          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
          : status === 'pending_verification'
          ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400'
          : status === 'paid'
          ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
          : 'bg-gray-500/20 text-gray-600 dark:text-gray-400';
        
        // Также обновляем функцию getStatusIcon чтобы использовать paymentStatus
        return (
          <div
            key={debt._id || `debt-${index}`}
            onClick={() => navigate(`/chats/${debt._id}`)}
            className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-lg cursor-pointer transition-all duration-300 group"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                status === 'overdue' ? 'bg-gradient-to-br from-red-500 to-orange-500' :
                status === 'active' ? 'bg-gradient-to-br from-emerald-500 to-green-500' :
                status === 'pending_verification' ? 'bg-gradient-to-br from-yellow-500 to-amber-500' :
                status === 'paid' ? 'bg-gradient-to-br from-blue-500 to-cyan-500' :
                'bg-gradient-to-br from-gray-500 to-slate-500'
              }`}>
                {getStatusIcon(status) || <Activity className="w-4 h-4 text-white" />}
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {debt.otherPartyName || 'Неизвестный клиент'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusBgClass}`}>
                    {statusText}
                  </span>
                  {debt.dueDate && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(debt.dueDate).toLocaleDateString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      })}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-lg font-bold ${statusColorClass}`}>
                {formatMoneyRUB(debt.amountRemaining)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(debt.createdAt).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'short'
                })}
              </p>
            </div>
          </div>
        );
      })
    ) : (
      <div className="text-center py-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900/30 dark:to-cyan-900/30 flex items-center justify-center">
          <CreditCard className="w-6 h-6 text-blue-400" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 mb-2">Нет активных долгов</p>
        <button
          onClick={() => navigate("/customers/new-debt")}
          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline"
        >
          Создать первый долг →
        </button>
      </div>
    )}
  </div>
</div>
</div>

            {/* Top Customers */}
{/* Top Customers */}
<div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl p-6 backdrop-blur-sm bg-gradient-to-br from-white/90 to-white/70 dark:from-gray-900/90 dark:to-gray-900/70">
  <div className="flex items-center justify-between mb-6">
    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"></div>
      Топ клиентов по суммам долгов
    </h3>
    <button
      onClick={() => navigate("/customers")}
      className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
    >
      Все клиенты
      <ChevronRight className="w-4 h-4" />
    </button>
  </div>
  
  <div className="space-y-3">
    {topCustomers.length > 0 ? (
      topCustomers.map((customer) => {
        // Используем type assertion для доступа к новым свойствам
        const customerData = customer as any;
        const isOwedToMe = customerData.isOwedToMe;
        const isIOwe = customerData.isIOwe;
         // Исправляем отображение инициалов
        const getInitial = (name: string) => {
          if (!name) return 'К';
          return name.charAt(0).toUpperCase();
        };
          // Исправляем отображение долга
        return (
          <div
            key={customer._id}
            onClick={() => navigate(`/customers/${customer._id}/debts`)}
            className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 cursor-pointer transition-all duration-300 group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold">
                 {getInitial(customer.localName  || 'К')}
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                  {customer.localName || 'Без имени'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <TrustCircle value={customer.trustScore || 50} size="sm" showLabel={false} />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {customer.trustScore || 50}% доверия
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              {/* Отображаем сумму из API (totalActiveDebt) */}
              <p className={`text-lg font-bold ${
                isOwedToMe 
                  ? 'text-emerald-600 dark:text-emerald-400' 
                  : isIOwe
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}>
                {formatMoneyRUB(customer.totalActiveDebt || 0)}
              </p>
              {/* Статус */}
<div className="text-xs mt-1">
  {customer.overdueCount > 0 ? (
    <div className="text-red-400 flex items-center justify-end gap-1">
      <AlertTriangle className="w-3 h-3" />
      <span>{customer.overdueCount} просрочка</span>
    </div>
  ) : customer.totalActiveDebt > 0 ? (
    // Если есть активный долг, проверяем кто кому должен
    isOwedToMe ? (
      <div className="text-emerald-500 flex items-center justify-end gap-1">
        <TrendingUp className="w-3 h-3" />
        <span>Должен мне</span>
      </div>
    ) : isIOwe ? (
      <div className="text-red-500 flex items-center justify-end gap-1">
        <TrendingDown className="w-3 h-3" />
        <span>Я должен</span>
      </div>
    ) : (
      // Если есть долг, но не понятно кто кому должен
      <div className="text-blue-500 flex items-center justify-end gap-1">
        <Activity className="w-3 h-3" />
        <span>Активный долг</span>
      </div>
    )
  ) : (
    <div className="text-gray-400 flex items-center justify-end gap-1">
      <CheckCircle className="w-3 h-3" />
      <span>Нет долгов</span>
    </div>
  )}
</div>
            </div>
          </div>
        );
      })
    ) : (
      <div className="text-center py-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/20 dark:to-teal-900/20 flex items-center justify-center">
          <Users className="w-8 h-8 text-emerald-400" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 mb-2">
          {stats.totalCustomers === 0 ? "Нет добавленных клиентов" : "Все клиенты без активных долгов"}
        </p>
        <div className="space-y-2 mt-4">
          <button
            onClick={() => navigate("/customers")}
            className="block w-full text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline py-1"
          >
            Все клиенты ({stats.totalCustomers})
          </button>
          <button
            onClick={() => navigate("/customers/new-debt")}
            className="block w-full text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline py-1"
          >
            Добавить нового клиента →
          </button>
        </div>
      </div>
    )}
  </div>
</div>
          </div>

          {/* Right Column - Summary Panels */}
          <div className="space-y-8">
            {/* Trust Summary Card */}
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl p-6 backdrop-blur-sm bg-gradient-to-br from-white/90 to-white/70 dark:from-gray-900/90 dark:to-gray-900/70">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500"></div>
                Ваш статус доверия
              </h3>
              
              <div className="space-y-6">
                <div className="flex items-center justify-center">
                  <TrustCircle value={stats.averageTrustScore} size="lg" />
                </div>
                
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-100 dark:border-blue-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Имя</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{user?.name || "Не указано"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Телефон</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{user?.phone || "Не указан"}</span>
                    </div>
                  </div>
                  
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-100 dark:border-emerald-800">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Общий рейтинг</span>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        stats.averageTrustScore > 75 
                          ? 'bg-emerald-500 text-white'
                          : stats.averageTrustScore > 50 
                          ? 'bg-yellow-500 text-white'
                          : 'bg-red-500 text-white'
                      }`}>
                        {stats.averageTrustScore > 75 ? 'Высокий' : stats.averageTrustScore > 50 ? 'Средний' : 'Низкий'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Card */}
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl p-6 backdrop-blur-sm bg-gradient-to-br from-white/90 to-white/70 dark:from-gray-900/90 dark:to-gray-900/70">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"></div>
                Финансовая сводка
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-gray-600 dark:text-gray-400">Мне должны</span>
                  <span className="text-xl font-bold text-gray-900 dark:text-white">
                    {formatMoneyRUB(stats.totalOwed)}
                  </span>
                </div>
                
                <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-gray-600 dark:text-gray-400">Я должен</span>
                  <span className="text-xl font-bold text-gray-900 dark:text-white">
                    {formatMoneyRUB(stats.totalDebt)}
                  </span>
                </div>
                
                <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-gray-600 dark:text-gray-400">Активных долгов</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {stats.totalActiveDebts}
                  </span>
                </div>
                
                <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-gray-600 dark:text-gray-400">Просрочено</span>
                  <span className="font-medium text-red-600 dark:text-red-400">
                    {stats.overdueDebts}
                  </span>
                </div>
                
                <div className="flex items-center justify-between py-3">
                  <span className="text-gray-600 dark:text-gray-400">Ближайшие платежи</span>
                  <span className="font-medium text-yellow-600 dark:text-yellow-400">
                    {stats.upcomingDue}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl p-6 backdrop-blur-sm bg-gradient-to-br from-white/90 to-white/70 dark:from-gray-900/90 dark:to-gray-900/70">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500"></div>
                Быстрые действия
              </h3>
              
              <div className="space-y-3">
                <button
                  onClick={() => handleQuickAction('new-debt')}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-100 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300 group"
                >
                  <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 group-hover:scale-110 transition-transform">
                    <Plus className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-900 dark:text-white">Новый долг</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Создать новое обязательство</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
                </button>

                <button
                  onClick={() => handleQuickAction('all-customers')}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-100 dark:border-emerald-800 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all duration-300 group"
                >
                  <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 group-hover:scale-110 transition-transform">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-900 dark:text-white">Все клиенты</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Просмотр всех контактов</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
                </button>

                <button
                  onClick={() => handleQuickAction('all-chats')}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-100 dark:border-purple-800 hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-300 group"
                >
                  <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 group-hover:scale-110 transition-transform">
                    <Bell className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-900 dark:text-white">Все чаты</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Перейти к сообщениям</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
                </button>

                <button
                  onClick={() => handleQuickAction('profile')}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/20 dark:to-slate-900/20 border border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-300 group"
                >
                  <div className="p-2 rounded-xl bg-gradient-to-br from-gray-500 to-slate-500 group-hover:scale-110 transition-transform">
                    <CreditCard className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-900 dark:text-white">Профиль</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Настройки аккаунта</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
                </button>
              </div>
            </div>

            {/* Security Info */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-950 rounded-3xl border border-gray-800 shadow-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Защита Baqqol</h3>
                  <p className="text-sm text-blue-200">Премиум безопасность</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-white/80">Шифрование TLS</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-white/80">Smart-контракт</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-white/80">Система доверия</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-white/80">Напоминания</span>
                </div>
              </div>
            </div>
          </div>
        </div>

       {/* Real-time Alerts */}
        <div className="mt-8">
          <RealTimeAlerts />
        </div>

        {/* Status Bar */}
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 pb-24 md:pb-6 lg:pb-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 animate-pulse' : 'bg-gradient-to-r from-amber-500 to-orange-500'}`}></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {isOnline ? 'Система активна' : 'Оффлайн режим'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {isOnline ? 'Защищённое соединение' : 'Локальное хранение'}
                </span>
              </div>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Trust System v3.0 • Baqqol App • {isOnline ? 'Онлайн' : 'Оффлайн'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}