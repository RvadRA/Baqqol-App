import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from "../context/AuthContext";
import { formatMoneyRUB } from '../utils/formatMoney';
import { 
  AlertTriangle, 
  Clock, 
  Calendar, 
  TrendingUp, 
  DollarSign,
  Users,
  CreditCard,
  ChevronRight,
  RefreshCw,
  Wifi,
  WifiOff,
  Save,
  AlertCircle
} from 'lucide-react';

interface DebtStats {
  totalActiveDebts: number;
  totalOverdueDebts: number;
  totalAmount: number;
  overdueAmount: number;
  upcomingDue: number;
  recentReminders: number;
  lastUpdated: string;
}

// Ключи для localStorage
const DEBT_STATS_CACHE_KEY = "debt_stats_cache";
const DEBT_LAST_UPDATED_KEY = "debt_stats_last_updated";
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 минут

export const DebtDashboard: React.FC = () => {
  const navigate = useNavigate();
    const { user } = useAuth(); 
  const [stats, setStats] = useState<DebtStats>({
    totalActiveDebts: 0,
    totalOverdueDebts: 0,
    totalAmount: 0,
    overdueAmount: 0,
    upcomingDue: 0,
    recentReminders: 0,
    lastUpdated: new Date().toISOString()
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [cacheStatus, setCacheStatus] = useState<'fresh' | 'stale' | 'offline'>('fresh');
  // Добавьте вспомогательную функцию в компонент DebtDashboard

  // Используем useRef для хранения статуса, который не должен вызывать ререндер
  const syncInProgressRef = useRef(false);

  // Загрузка кэшированных данных
  const loadCachedStats = useCallback(() => {
    try {
      const cached = localStorage.getItem(DEBT_STATS_CACHE_KEY);
      const lastUpdated = localStorage.getItem(DEBT_LAST_UPDATED_KEY);
      
      if (cached) {
        const parsed = JSON.parse(cached);
        console.log('📦 Загружены кэшированные данные статистики долгов');
        
        setStats(parsed);
        
        if (lastUpdated) {
          setLastSyncTime(new Date(lastUpdated).toLocaleString('ru-RU'));
        }
        
        return true;
      }
    } catch (error) {
      console.error('Ошибка загрузки кэша статистики долгов:', error);
    }
    return false;
  }, []);

  // Сохранение данных в кэш
  const saveStatsToCache = useCallback((data: DebtStats) => {
    try {
      localStorage.setItem(DEBT_STATS_CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(DEBT_LAST_UPDATED_KEY, new Date().toISOString());
      console.log('💾 Статистика долгов сохранена в кэш');
    } catch (error) {
      console.error('Ошибка сохранения статистики долгов в кэш:', error);
    }
  }, []);

  // Проверка актуальности кэша
  const isCacheValid = useCallback(() => {
    const lastUpdated = localStorage.getItem(DEBT_LAST_UPDATED_KEY);
    if (!lastUpdated) return false;
    
    const lastUpdateTime = new Date(lastUpdated).getTime();
    const currentTime = Date.now();
    
    return (currentTime - lastUpdateTime) < CACHE_EXPIRY_MS;
  }, []);

  // Загрузка данных с сервера - вынесена отдельно без useCallback
 // В функции fetchStatsFromServer исправьте расчет:
const fetchStatsFromServer = useCallback(async () => {
  if (!isOnline || syncInProgressRef.current) {
    console.log('🌐 Нет подключения к интернету или синхронизация уже идет');
    return;
  }

  try {
    syncInProgressRef.current = true;
    setSyncing(true);
    
    const res = await api.get('/debts/my');
    const debts = res.data || [];

    const now = new Date();
    
    // Правильная фильтрация всех активных долгов
    const allActiveDebts = debts.filter((d: any) => 
      d.paymentStatus === 'active' && d.amountRemaining > 0
    );
    
    // Overdue debts (based on overdueStatus or dueDate)
    const overdueDebts = debts.filter((d: any) => 
      d.overdueStatus === 'overdue' || 
      (d.dueDate && new Date(d.dueDate) < now && d.paymentStatus === 'active' && d.amountRemaining > 0)
    );
    
    // Долги, срок которых скоро наступит (в течение 3 дней)
    const upcomingDue = debts.filter((d: any) => {
      if (!d.dueDate || d.paymentStatus !== 'active' || d.amountRemaining <= 0) return false;
      const dueDate = new Date(d.dueDate);
      const timeDiff = dueDate.getTime() - now.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
      return daysDiff <= 3 && daysDiff >= 0 && d.overdueStatus !== 'overdue';
    });

    // Total amount of all active debts (including overdue)
    const totalAmount = allActiveDebts.reduce((sum: number, d: any) => 
      sum + d.amountRemaining, 0);
    
    // Total amount of overdue debts
    const overdueAmount = overdueDebts.reduce((sum: number, d: any) => 
      sum + d.amountRemaining, 0);

    const newStats: DebtStats = {
      totalActiveDebts: allActiveDebts.length,
      totalOverdueDebts: overdueDebts.length,
      totalAmount,
      overdueAmount,
      upcomingDue: upcomingDue.length,
      recentReminders: 0,
      lastUpdated: new Date().toISOString()
    };

    console.log('📊 Статистика DebtDashboard:', newStats);

    setStats(newStats);
    setLastSyncTime(new Date().toLocaleString('ru-RU'));
    setCacheStatus('fresh');

    // Сохраняем в кэш
    saveStatsToCache(newStats);

  } catch (error) {
    console.error('Error loading debt stats:', error);
    
    // При ошибке загрузки с сервера, пробуем загрузить из кэша
    if (!loadCachedStats()) {
      console.log('❌ Не удалось загрузить данные статистики долгов');
      setCacheStatus('offline');
    } else {
      setCacheStatus('stale');
    }
  } finally {
    setLoading(false);
    setSyncing(false);
    syncInProgressRef.current = false;
  }
}, [isOnline, loadCachedStats, saveStatsToCache, user?.globalIdentityId]); // Добавьте user
  // Основная функция загрузки данных
  const loadDebtStats = useCallback(async (forceRefresh = false) => {
    // Если не онлайн, загружаем из кэша
    if (!isOnline && !forceRefresh) {
      console.log('📴 Оффлайн режим, загрузка статистики из кэша');
      loadCachedStats();
      setLoading(false);
      setCacheStatus('offline');
      return;
    }

    // Если онлайн и кэш валиден, не форсируем обновление
    if (isOnline && !forceRefresh && isCacheValid()) {
      console.log('⚡ Используем актуальный кэш статистики');
      if (!loadCachedStats()) {
        // Если кэш не загрузился, загружаем с сервера
        await fetchStatsFromServer();
      } else {
        setCacheStatus('fresh');
      }
      setLoading(false);
      return;
    }

    // Загружаем с сервера
    await fetchStatsFromServer();
  }, [isOnline, loadCachedStats, isCacheValid, fetchStatsFromServer]);

  // Инициализация и загрузка данных
  useEffect(() => {
    const loadData = async () => {
      await loadDebtStats();
    };
    loadData();
  }, []); // Пустой массив зависимостей - запускается только при монтировании

  // Обработчики сетевого статуса
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Подключение к сети восстановлено');
      setIsOnline(true);
      
      // Запускаем синхронизацию с задержкой
      setTimeout(async () => {
        if (cacheStatus === 'offline') {
          await loadDebtStats(true);
        }
      }, 1000);
    };

    const handleOffline = () => {
      console.log('📴 Потеряно подключение к сети');
      setIsOnline(false);
      setCacheStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [cacheStatus]); // Зависимость только от cacheStatus

  // Периодическая синхронизация
  useEffect(() => {
    if (!isOnline) return;

    const syncInterval = setInterval(() => {
      if (isCacheValid()) {
        console.log('⚡ Кэш актуален, пропускаем периодическую синхронизацию');
        return;
      }
      loadDebtStats(true);
    }, 300000); // Каждые 5 минут

    return () => clearInterval(syncInterval);
  }, [isOnline, loadDebtStats, isCacheValid]);

  // Функция принудительного сохранения кэша
  const handleForceSave = useCallback(() => {
    saveStatsToCache(stats);
    alert('Статистика долгов сохранена в кэш');
  }, [stats, saveStatsToCache]);

  // Функция принудительного обновления
  const handleForceRefresh = useCallback(async () => {
    await loadDebtStats(true);
  }, [loadDebtStats]);

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between animate-pulse">
          <div>
            <div className="h-8 w-48 bg-slate-800/50 rounded mb-2"></div>
            <div className="h-4 w-64 bg-slate-800/30 rounded"></div>
          </div>
          <div className="h-10 w-32 bg-slate-800/50 rounded-xl"></div>
        </div>

        {/* Stats Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-slate-800/50 rounded-2xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <CreditCard className="w-8 h-8 text-purple-400 flex-shrink-0" />
            <h2 className="text-2xl font-bold text-white">Статистика долгов</h2>
          </div>
          <p className="text-gray-400">Активные долги и напоминания</p>
          
          {/* Статус сети и синхронизации */}
          <div className="flex items-center gap-3 mt-3">
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
            
            {syncing && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Синхронизация...</span>
              </div>
            )}
            
            {cacheStatus === 'stale' && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-xs">
                <AlertCircle className="w-3 h-3" />
                <span>Устаревшие данные</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleForceRefresh}
            disabled={syncing}
            className="p-2 rounded-xl bg-slate-800/50 border border-slate-700 text-gray-300 hover:text-white hover:border-slate-600 transition-colors disabled:opacity-50"
            title="Обновить статистику"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
          
          <button
            onClick={handleForceSave}
            className="p-2 rounded-xl bg-slate-800/50 border border-slate-700 text-gray-300 hover:text-white hover:border-slate-600 transition-colors"
            title="Сохранить в кэш"
          >
            <Save className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => navigate('/all-chats')}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600/20 to-blue-600/20 text-purple-400 border border-purple-500/30 hover:border-purple-500/50 transition-colors flex items-center gap-2"
          >
            <Clock className="w-4 h-4" />
            <span className="hidden sm:inline">Все напоминания</span>
          </button>
        </div>
      </div>

      {/* Предупреждение о работе в оффлайн режиме */}
      {!isOnline && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-amber-800 dark:text-amber-200">
                Работа в оффлайн режиме
              </h3>
              <p className="text-sm text-amber-600 dark:text-amber-300 mt-1">
                Вы просматриваете кэшированные данные статистики долгов.
                {lastSyncTime && ` Последнее обновление: ${lastSyncTime}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Active Debts */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-900/20 to-blue-800/10 border border-blue-800/30 hover:border-blue-700/50 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-xl bg-blue-500/20">
              <Users className="w-6 h-6 text-blue-400" />
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">{stats.totalActiveDebts}</div>
              <div className="text-sm text-blue-300">Активные</div>
            </div>
          </div>
          <p className="text-gray-400 text-sm">Всего активных долгов</p>
          <div className="mt-3 h-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full"></div>
        </div>

        {/* Total Amount */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-900/20 to-purple-800/10 border border-purple-800/30 hover:border-purple-700/50 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-xl bg-purple-500/20">
              <DollarSign className="w-6 h-6 text-purple-400" />
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                {formatMoneyRUB(stats.totalAmount)}
              </div>
              <div className="text-sm text-purple-300">Общая сумма</div>
            </div>
          </div>
          <p className="text-gray-400 text-sm">Общая сумма активных долгов</p>
          <div className="mt-3 h-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"></div>
        </div>

        {/* Overdue Debts */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-red-900/20 to-red-800/10 border border-red-800/30 hover:border-red-700/50 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-xl bg-red-500/20">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">{stats.totalOverdueDebts}</div>
              <div className="text-sm text-red-300">Просроченные</div>
            </div>
          </div>
          <p className="text-gray-400 text-sm">Просроченные долги</p>
          <div className="mt-3 h-1 bg-gradient-to-r from-red-500 to-orange-500 rounded-full"></div>
        </div>
      </div>

      {/* Upcoming Payments */}
      {stats.upcomingDue > 0 && (
        <div className="p-5 rounded-2xl bg-gradient-to-br from-yellow-900/20 to-amber-800/10 border border-yellow-800/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-yellow-500/20">
                <Calendar className="w-6 h-6 text-yellow-400" />
              </div>
              <div>
                <h3 className="font-bold text-white">Ближайшие платежи</h3>
                <p className="text-sm text-yellow-300">Срок в течение 3 дней</p>
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-2xl font-bold text-white">{stats.upcomingDue}</div>
              <button
                onClick={() => navigate('/all-chats')}
                className="text-sm text-yellow-400 hover:text-yellow-300 underline mt-1"
              >
                Показать все
              </button>
            </div>
          </div>
          
          <div className="mt-4 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-yellow-400" />
              <p className="text-sm text-yellow-300">
                У вас {stats.upcomingDue} долг(а) со сроком оплаты в ближайшие дни.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Overdue Warning */}
      {stats.totalOverdueDebts > 0 && (
        <div className="p-5 rounded-2xl bg-gradient-to-br from-red-900/30 to-orange-900/20 border border-red-700/30 animate-pulse">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <AlertTriangle className="w-8 h-8 text-red-400" />
                <div className="absolute -inset-1 bg-red-500/20 rounded-full animate-ping"></div>
              </div>
              <div>
                <h3 className="font-bold text-white">⚠️ Срочное внимание!</h3>
                <p className="text-red-300">
                  У вас {stats.totalOverdueDebts} просроченных долга на сумму {formatMoneyRUB(stats.overdueAmount)}
                </p>
              </div>
            </div>
            
            <button
              onClick={() => navigate('/all-chats')}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 text-white font-medium hover:from-red-700 hover:to-orange-700 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              Проверить
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => navigate('/customers/new-debt')}
          className="p-4 rounded-2xl bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border border-blue-700/30 hover:border-blue-500/50 transition-colors text-left group"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 group-hover:scale-110 transition-transform">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="font-medium text-white">Новый долг</span>
          </div>
          <p className="text-sm text-gray-400">Создать новое обязательство</p>
        </button>
        
        <button
          onClick={() => navigate('/profile')}
          className="p-4 rounded-2xl bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-700/30 hover:border-purple-500/50 transition-colors text-left group"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 group-hover:scale-110 transition-transform">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <span className="font-medium text-white">Все долги</span>
          </div>
          <p className="text-sm text-gray-400">Посмотреть все активные долги</p>
        </button>
      </div>

      {/* Информация о кэше */}
      <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-4">
        <div className="flex items-center justify-center gap-2">
          <span>Статус данных:</span>
          <span className={`px-2 py-1 rounded-full ${
            cacheStatus === 'fresh' ? 'bg-emerald-500/20 text-emerald-400' :
            cacheStatus === 'stale' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {cacheStatus === 'fresh' ? 'Актуальные' :
             cacheStatus === 'stale' ? 'Устаревшие' :
             'Оффлайн'}
          </span>
        </div>
        <p className="mt-1">Кэш обновляется каждые 5 минут при наличии интернета</p>
      </div>
    </div>
  );
};