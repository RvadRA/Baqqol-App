import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, 
  Clock, 
  AlertTriangle, 
  CheckCircle,
  ChevronRight,
  RefreshCw,
  DollarSign,
  ExternalLink,
  Wifi,
  WifiOff,
  Save,
} from 'lucide-react';
import { formatMoneyRUB } from '../utils/formatMoney';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

interface UpcomingPayment {
  _id: string;
  amountRemaining: number;
  status: string;
  dueDate: string;
  otherPartyName: string;
  description: string;
  debtId: string;
  isMine: boolean;
}

interface UpcomingPaymentsProps {
  compact?: boolean;
}

// Ключи для localStorage
const UPCOMING_CACHE_KEY = "upcoming_payments_cache";
const UPCOMING_LAST_UPDATED_KEY = "upcoming_payments_last_updated";
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 минут

export const UpcomingPayments: React.FC<UpcomingPaymentsProps> = ({ compact = false }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [upcomingPayments, setUpcomingPayments] = useState<UpcomingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [cacheStatus, setCacheStatus] = useState<'fresh' | 'stale' | 'offline'>('fresh');
  const [error, setError] = useState<string | null>(null);
  
  const syncInProgressRef = useRef(false);

  // Загрузка кэшированных данных
  const loadCachedPayments = useCallback(() => {
    try {
      const cached = localStorage.getItem(UPCOMING_CACHE_KEY);
      const lastUpdated = localStorage.getItem(UPCOMING_LAST_UPDATED_KEY);
      
      if (cached) {
        const parsed = JSON.parse(cached);
        console.log('📦 Загружены кэшированные данные платежей');
        
        setUpcomingPayments(parsed);
        
        if (lastUpdated) {
          setLastSyncTime(new Date(lastUpdated).toLocaleString('ru-RU'));
        }
        
        return true;
      }
    } catch (error) {
      console.error('Ошибка загрузки кэша платежей:', error);
    }
    return false;
  }, []);

  // Сохранение данных в кэш
  const savePaymentsToCache = useCallback((payments: UpcomingPayment[]) => {
    try {
      localStorage.setItem(UPCOMING_CACHE_KEY, JSON.stringify(payments));
      localStorage.setItem(UPCOMING_LAST_UPDATED_KEY, new Date().toISOString());
      console.log('💾 Платежи сохранены в кэш');
    } catch (error) {
      console.error('Ошибка сохранения платежей в кэш:', error);
    }
  }, []);

  // Проверка актуальности кэша
  const isCacheValid = useCallback(() => {
    const lastUpdated = localStorage.getItem(UPCOMING_LAST_UPDATED_KEY);
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
      setError(null);
      
      const res = await api.get('/debts/my');
      const debts = res.data || [];
      
      const now = new Date();
      
      // Фильтруем долги, которые должны быть оплачены в ближайшие 7 дней
      const upcoming = debts
        .filter((debt: any) => {
          if (!debt.dueDate || debt.paymentStatus !== 'active') return false;
          const dueDate = new Date(debt.dueDate);
          const timeDiff = dueDate.getTime() - now.getTime();
          const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
          return daysDiff <= 7 && daysDiff >= 0;
        })
        .map((debt: any) => {
          const isSender = debt.senderIdentityId?._id === user?.globalIdentityId;
          
              const otherParty = isSender 
      ? debt.receiverIdentityId
      : debt.senderIdentityId;
          // Используем localName если есть, иначе registeredName
    const getDisplayName = (user: any): string => {
  if (!user) return "Клиент";
  
  // Приоритет: localName → registeredName → name
  if (user.localName && user.localName.trim() !== '') {
    return user.localName;
  }
  
  if (user.registeredName && user.registeredName.trim() !== '') {
    return user.registeredName;
  }
  
  if (user.name && user.name.trim() !== '') {
    return user.name;
  }
  
  return "Клиент";
};
const otherPartyName = getDisplayName(otherParty);
          return {
            _id: debt._id,
            amountRemaining: debt.amountRemaining || 0,
            status: debt.status,
            dueDate: debt.dueDate,
            otherPartyName: otherPartyName,
            description: debt.description || 'Долговое обязательство',
            debtId: debt._id,
            isMine: isSender
          };
        })
        .sort((a: UpcomingPayment, b: UpcomingPayment) => 
          new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        );
        
      setUpcomingPayments(upcoming);
      setLastSyncTime(new Date().toLocaleString('ru-RU'));
      setCacheStatus('fresh');

      // Сохраняем в кэш
      savePaymentsToCache(upcoming);

    } catch (err: any) {
      console.error('Error loading upcoming payments:', err);
      setError('Не удалось загрузить данные о платежах');
      
      // При ошибке загрузки с сервера, пробуем загрузить из кэша
      if (!loadCachedPayments()) {
        console.log('❌ Не удалось загрузить данные платежей');
        setCacheStatus('offline');
      } else {
        setCacheStatus('stale');
      }
    } finally {
      setLoading(false);
      setSyncing(false);
      syncInProgressRef.current = false;
    }
  }, [isOnline, loadCachedPayments, savePaymentsToCache, user?.globalIdentityId]);

  // Основная функция загрузки данных
  const loadUpcomingPayments = useCallback(async (forceRefresh = false) => {
    // Если не онлайн, загружаем из кэша
    if (!isOnline && !forceRefresh) {
      console.log('📴 Оффлайн режим, загрузка платежей из кэша');
      const hasCache = loadCachedPayments();
      if (hasCache) {
        setCacheStatus('offline');
      }
      setLoading(false);
      return;
    }

    // Если онлайн и кэш валиден, не форсируем обновление
    if (isOnline && !forceRefresh && isCacheValid()) {
      console.log('⚡ Используем актуальный кэш платежей');
      if (!loadCachedPayments()) {
        // Если кэш не загрузился, загружаем с сервера
        await fetchFromServer();
      } else {
        setCacheStatus('fresh');
      }
      setLoading(false);
      return;
    }

    // Загружаем с сервера
    await fetchFromServer();
  }, [isOnline, loadCachedPayments, isCacheValid, fetchFromServer]);

  // Инициализация при монтировании
  useEffect(() => {
    const loadData = async () => {
      await loadUpcomingPayments();
    };
    loadData();
  }, [loadUpcomingPayments]);

  // Обработчики сетевого статуса
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Подключение к сети восстановлено');
      setIsOnline(true);
      
      // Запускаем синхронизацию с задержкой
      setTimeout(async () => {
        if (cacheStatus === 'offline') {
          await loadUpcomingPayments(true);
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
  }, [cacheStatus, loadUpcomingPayments]);

  // Периодическая синхронизация
  useEffect(() => {
    if (!isOnline) return;

    const syncInterval = setInterval(() => {
      if (isCacheValid()) {
        console.log('⚡ Кэш актуален, пропускаем периодическую синхронизацию');
        return;
      }
      loadUpcomingPayments(true);
    }, 300000); // Каждые 5 минут

    return () => clearInterval(syncInterval);
  }, [isOnline, loadUpcomingPayments, isCacheValid]);

  // Функции для UI
  const getDaysLeft = (dueDate: string): string => {
    const now = new Date();
    const due = new Date(dueDate);
    const timeDiff = due.getTime() - now.getTime();
    const days = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Сегодня';
    if (days === 1) return 'Завтра';
    if (days === 2) return 'Послезавтра';
    return `Через ${days} дня`;
  };

  const getPaymentStatus = (dueDate: string) => {
    const now = new Date();
    const due = new Date(dueDate);
    const timeDiff = due.getTime() - now.getTime();
    const days = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'urgent';
    if (days <= 2) return 'soon';
    return 'upcoming';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'urgent': return 'text-red-400';
      case 'soon': return 'text-orange-400';
      default: return 'text-yellow-400';
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'urgent': return 'bg-red-500/10 border-red-500/30';
      case 'soon': return 'bg-orange-500/10 border-orange-500/30';
      default: return 'bg-yellow-500/10 border-yellow-500/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'urgent': return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case 'soon': return <Clock className="w-4 h-4 text-orange-400" />;
      default: return <Calendar className="w-4 h-4 text-yellow-400" />;
    }
  };

  const handlePaymentClick = (payment: UpcomingPayment) => {
    navigate(`/chats/${payment.debtId}`);
  };

  // Функция принудительного обновления
  const handleForceRefresh = useCallback(async () => {
    await loadUpcomingPayments(true);
  }, [loadUpcomingPayments]);

  // Функция принудительного сохранения кэша
  const handleForceSave = useCallback(() => {
    savePaymentsToCache(upcomingPayments);
    alert('Платежи сохранены в кэш');
  }, [upcomingPayments, savePaymentsToCache]);

  // Компактная версия (для Dashboard)
  if (compact) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl p-6 backdrop-blur-sm bg-gradient-to-br from-white/90 to-white/70 dark:from-gray-900/90 dark:to-gray-900/70">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gradient-to-r from-yellow-500 to-amber-500"></div>
            Ближайшие платежи
          </h3>
          
          <div className="flex items-center gap-2">
            {/* Статус сети */}
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
              isOnline 
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
            }`}>
              {isOnline ? (
                <>
                  <Wifi className="w-3 h-3" />
                  <span className="hidden sm:inline">Онлайн</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span className="hidden sm:inline">Оффлайн</span>
                </>
              )}
            </div>
            
            <button
              onClick={handleForceRefresh}
              disabled={syncing}
              className="p-1.5 rounded-xl hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
              title="Обновить"
            >
              <RefreshCw className={`w-4 h-4 text-yellow-400 ${syncing ? 'animate-spin' : ''}`} />
            </button>
            
            <button
              onClick={handleForceSave}
              className="p-1.5 rounded-xl hover:bg-yellow-500/20 transition-colors"
              title="Сохранить в кэш"
            >
              <Save className="w-4 h-4 text-yellow-400" />
            </button>
            
            <button
              onClick={() => navigate('/all-chats')}
              className="text-sm text-yellow-600 dark:text-yellow-400 hover:underline flex items-center gap-1"
            >
              Все
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Статус данных */}
        <div className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          {lastSyncTime ? `Обновлено: ${lastSyncTime}` : 'Нет данных'}
          {!isOnline && cacheStatus === 'offline' && (
            <span className="ml-2 text-amber-500">(кэшированные данные)</span>
          )}
        </div>
        
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse">
                <div className="h-20 bg-yellow-500/10 rounded-xl"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <AlertTriangle className="w-12 h-12 text-red-400/30 mx-auto mb-3" />
            <p className="text-red-500 dark:text-red-400">{error}</p>
            <button
              onClick={handleForceRefresh}
              className="mt-4 px-4 py-2 rounded-xl bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30 hover:border-yellow-500/50 transition-colors"
            >
              Попробовать снова
            </button>
          </div>
        ) : upcomingPayments.length > 0 ? (
          <div className="space-y-3">
            {upcomingPayments.slice(0, 3).map((payment) => {
              const status = getPaymentStatus(payment.dueDate);
              const daysLeft = getDaysLeft(payment.dueDate);
              
              return (
                <div
                  key={payment._id}
                  onClick={() => handlePaymentClick(payment)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 hover:scale-[1.02] ${getStatusBgColor(status)}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(status)}
                      <div>
                        <p className="font-medium text-white">
                          {payment.otherPartyName}
                        </p>
                        <p className="text-sm text-gray-300">{daysLeft}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <span className={`text-sm ${payment.isMine ? 'text-emerald-400' : 'text-red-400'}`}>
                          {payment.isMine ? '↓' : '↑'}
                        </span>
                        <p className="text-lg font-bold text-white">
                          {formatMoneyRUB(payment.amountRemaining)}
                        </p>
                      </div>
                      <p className="text-xs text-gray-400">
                        {payment.isMine ? 'Мне должны' : 'Я должен'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 text-yellow-400/30 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Нет ближайших платежей</p>
            <p className="text-sm text-gray-400 mt-1">
              Все платежи запланированы на более поздние даты
            </p>
          </div>
        )}
        
        {upcomingPayments.length > 3 && (
          <button
            onClick={() => navigate('/all-chats')}
            className="w-full mt-4 p-3 text-center text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10 rounded-xl transition-colors"
          >
            Показать все {upcomingPayments.length} платежей
          </button>
        )}
      </div>
    );
  }

  // Полная версия
  if (loading) {
    return (
      <div className="p-6 rounded-2xl bg-gradient-to-br from-yellow-900/20 to-amber-800/10 border border-yellow-800/30 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-yellow-500/20 animate-pulse">
              <Calendar className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <div className="h-6 w-48 bg-yellow-500/20 rounded-lg animate-pulse mb-2"></div>
              <div className="h-4 w-32 bg-yellow-500/10 rounded animate-pulse"></div>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-24 bg-gradient-to-r from-yellow-500/10 to-amber-500/10 rounded-xl border border-yellow-500/20"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl bg-gradient-to-br from-yellow-900/20 to-amber-800/10 border border-yellow-800/30 shadow-xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-yellow-500/30 to-amber-500/30">
            <Calendar className="w-6 h-6 text-yellow-300" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Ближайшие платежи</h3>
            <p className="text-sm text-yellow-300">Срок в течение 7 дней</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Статус сети */}
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
          
          <button
            onClick={handleForceRefresh}
            disabled={syncing}
            className="p-1.5 rounded-xl hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
            title="Обновить данные"
          >
            <RefreshCw className={`w-4 h-4 text-yellow-400 ${syncing ? 'animate-spin' : ''}`} />
          </button>
          
          <button
            onClick={handleForceSave}
            className="p-1.5 rounded-xl hover:bg-yellow-500/20 transition-colors"
            title="Сохранить в кэш"
          >
            <Save className="w-4 h-4 text-yellow-400" />
          </button>
        </div>
      </div>
      
      {/* Статус данных */}
      <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border border-yellow-500/20">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-300">Статус данных:</span>
            <span className={`px-2 py-0.5 rounded-full ${
              cacheStatus === 'fresh' ? 'bg-emerald-500/20 text-emerald-400' :
              cacheStatus === 'stale' ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-gray-500/20 text-gray-400'
            }`}>
              {cacheStatus === 'fresh' ? 'Актуальные' :
               cacheStatus === 'stale' ? 'Устаревшие' :
               'Кэшированные'}
            </span>
          </div>
          {lastSyncTime && (
            <span className="text-gray-400 text-xs">
              Обновлено: {lastSyncTime}
            </span>
          )}
        </div>
      </div>
      
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </div>
      )}
      
      <div className="space-y-4">
        {upcomingPayments.length > 0 ? (
          upcomingPayments.map((payment) => {
            const status = getPaymentStatus(payment.dueDate);
            const daysLeft = getDaysLeft(payment.dueDate);
            
            return (
              <div
                key={payment._id}
                onClick={() => handlePaymentClick(payment)}
                className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${getStatusBgColor(status)}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(status)}
                      <span className="font-semibold text-white truncate">
                        {payment.otherPartyName}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        payment.isMine 
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-red-500/20 text-red-300 border border-red-500/30'
                      }`}>
                        {payment.isMine ? 'Мне должны' : 'Я должен'}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-300 mb-3 line-clamp-2">
                      {payment.description}
                    </p>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-yellow-400" />
                          <span className={`text-sm font-medium ${getStatusColor(status)}`}>
                            {daysLeft}
                          </span>
                        </div>
                        
                        <div className="text-sm text-gray-400 hidden md:block">
                          {new Date(payment.dueDate).toLocaleDateString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-green-400" />
                          <div className="text-xl font-bold text-white">
                            {formatMoneyRUB(payment.amountRemaining)}
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {status === 'urgent' ? '🔥 СРОЧНО' : 
                           status === 'soon' ? '⏰ СКОРО' : '📅 ПЛАНИРУЕТСЯ'}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePaymentClick(payment);
                      }}
                      className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                      title="Открыть чат"
                    >
                      <ExternalLink className="w-4 h-4 text-gray-400" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 text-yellow-400/30 mx-auto mb-4" />
            <p className="text-xl text-gray-300">Нет ближайших платежей</p>
            <p className="text-gray-400 mt-2">
              Все платежи запланированы на более поздние даты
            </p>
            <button
              onClick={() => navigate('/all-chats')}
              className="mt-4 px-4 py-2 rounded-xl bg-gradient-to-r from-yellow-600/30 to-amber-600/30 text-yellow-400 border border-yellow-500/40 hover:border-yellow-500/60 transition-colors"
            >
              Посмотреть все долги
            </button>
          </div>
        )}
      </div>
      
      {upcomingPayments.length > 0 && (
        <div className="mt-6 pt-6 border-t border-yellow-500/20">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-gray-400">
              Всего: <span className="text-white font-medium">{upcomingPayments.length}</span> платеж(ей)
              <span className="ml-2 text-emerald-400">
                ({upcomingPayments.filter(p => p.isMine).length} мне должны)
              </span>
              <span className="ml-2 text-red-400">
                ({upcomingPayments.filter(p => !p.isMine).length} я должен)
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  <span className="text-gray-400">Срочно (сегодня)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  <span className="text-gray-400">Скоро (1-2 дня)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                  <span className="text-gray-400">Запланировано</span>
                </div>
              </div>
              
              <button
                onClick={() => navigate('/all-chats')}
                className="text-sm text-yellow-400 hover:text-yellow-300 underline flex items-center gap-1"
              >
                Показать все долги
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};