// Customers.tsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { RealTimeAlerts } from '../components/RealTimeAlerts';
import { TrustCircle } from "../components/TrustCircle";
import { 
  Search, 
  Plus, 
  AlertCircle, 
  User, 
  Phone, 
  Clock,
  DollarSign,
  Filter,
  RefreshCw,
  ChevronRight,
  Users,
  TrendingUp,
  CreditCard,
  Wifi,
  WifiOff,
  Save,
  AlertTriangle,

  Clock as ClockIcon,
  CloudOff,
  CloudUpload,
  Trash2
} from "lucide-react";
import { socket } from "../socket";

interface CustomerOverview {
  _id: string;
  localName: string;
  phone?: string;
  trustScore: number;
  totalActiveDebt: number;
  overdueCount: number;
  targetIdentityId?: string;
}

// Интерфейс для оффлайн долга
interface OfflineDebt {
  id: string;
  receiverPhone: string;
  receiverName: string;
  amount: number;
  description: string;
  dueDate: string | null;
  reminders: boolean[];
  timestamp: string;
  createdAt: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  syncAttempts: number;
  lastSyncAttempt: string | null;
  isOffline: boolean;
}

// Ключи для localStorage
const CUSTOMERS_CACHE_KEY = "customers_cache";
const CUSTOMERS_LAST_UPDATED_KEY = "customers_last_updated";
const PENDING_DEBTS_KEY = "pendingDebts";
const OFFLINE_CUSTOMERS_KEY = "offline_customers";
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 минут

export default function Customers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerOverview[]>([]);
  const [offlineCustomers, setOfflineCustomers] = useState<CustomerOverview[]>([]);
  const [pendingDebts, setPendingDebts] = useState<OfflineDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [, setSyncingPendingDebts] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [cacheStatus, setCacheStatus] = useState<'fresh' | 'stale' | 'offline'>('fresh');
  const [showOfflineSection, setShowOfflineSection] = useState(false);
  const syncInProgressRef = useRef(false);
  const [autoSyncInProgress, setAutoSyncInProgress] = useState(false);
  const [stats, setStats] = useState({
    totalDebt: 0,
    averageScore: 0,
    activeCustomers: 0
  });

  // Загрузка оффлайн долгов из localStorage
  const loadPendingDebts = useCallback(() => {
    try {
      const stored = localStorage.getItem(PENDING_DEBTS_KEY);
      if (stored) {
        const debts = JSON.parse(stored);
        console.log('📊 Загружены оффлайн долги:', debts.length);
        setPendingDebts(debts);
        return debts;
      }
    } catch (error) {
      console.error('Ошибка загрузки оффлайн долгов:', error);
    }
    return [];
  }, []);

  // Создание оффлайн клиентов из оффлайн долгов
  const createOfflineCustomersFromDebts = useCallback((debts: OfflineDebt[]) => {
    const offlineCustomersMap = new Map<string, CustomerOverview>();
    
    debts.forEach(debt => {
      const phone = debt.receiverPhone;
      const existingCustomer = offlineCustomersMap.get(phone);
      
      if (existingCustomer) {
        // Обновляем существующего оффлайн клиента
        existingCustomer.totalActiveDebt += debt.amount;
      } else {
        // Создаем нового оффлайн клиента
        offlineCustomersMap.set(phone, {
          _id: `offline_${debt.id}`,
          localName: debt.receiverName,
          phone: debt.receiverPhone,
          trustScore: 50, // Стандартный рейтинг для оффлайн клиентов
          totalActiveDebt: debt.amount,
          overdueCount: 0,
          targetIdentityId: `offline_${debt.id}`
        });
      }
    });
    
    return Array.from(offlineCustomersMap.values());
  }, []);

  // Сохранение оффлайн клиентов в localStorage
  const saveOfflineCustomers = useCallback((offlineCustomers: CustomerOverview[]) => {
    try {
      localStorage.setItem(OFFLINE_CUSTOMERS_KEY, JSON.stringify(offlineCustomers));
      console.log('💾 Оффлайн клиенты сохранены:', offlineCustomers.length);
    } catch (error) {
      console.error('Ошибка сохранения оффлайн клиентов:', error);
    }
  }, []);

  // Загрузка оффлайн клиентов из localStorage
  const loadOfflineCustomers = useCallback(() => {
    try {
      const stored = localStorage.getItem(OFFLINE_CUSTOMERS_KEY);
      if (stored) {
        const customers = JSON.parse(stored);
        console.log('📊 Загружены оффлайн клиенты из кэша:', customers.length);
        return customers;
      }
    } catch (error) {
      console.error('Ошибка загрузки оффлайн клиентов:', error);
    }
    return [];
  }, []);

  // Объединение обычных и оффлайн клиентов
  const getAllCustomers = useMemo(() => {
    return [...customers, ...offlineCustomers];
  }, [customers, offlineCustomers]);

  // Загрузка кэшированных данных
  const loadCachedData = useCallback(() => {
    try {
      const cached = localStorage.getItem(CUSTOMERS_CACHE_KEY);
      const lastUpdated = localStorage.getItem(CUSTOMERS_LAST_UPDATED_KEY);
      
      console.log('📦 Попытка загрузки кэша клиентов:', { cached: !!cached });
      
      if (cached) {
        const parsed = JSON.parse(cached);
        console.log('📦 Загружены кэшированные данные клиентов');
        
        if (parsed.customers) setCustomers(parsed.customers);
        if (parsed.stats) setStats(parsed.stats);
        
        if (lastUpdated) {
          setLastSyncTime(new Date(lastUpdated).toLocaleString('ru-RU'));
        }
        
        // Загружаем оффлайн данные
        const offlineCustomersData = loadOfflineCustomers();
        const pendingDebtsData = loadPendingDebts();
        const offlineFromDebts = createOfflineCustomersFromDebts(pendingDebtsData);
        
        // Объединяем сохраненных оффлайн клиентов и клиентов из долгов
        const combinedOfflineCustomers = [
          ...offlineCustomersData,
          ...offlineFromDebts
        ].reduce((acc: CustomerOverview[], customer) => {
          // Убираем дубликаты по телефону
          const exists = acc.find(c => c.phone === customer.phone);
          if (!exists) {
            acc.push(customer);
          }
          return acc;
        }, []);
        
        setOfflineCustomers(combinedOfflineCustomers);
        
        // Сразу останавливаем loading при успешной загрузке кэша
        setLoading(false);
        return true;
      }
    } catch (error) {
      console.error('Ошибка загрузки кэша клиентов:', error);
    }
    
    console.log('📦 Кэш клиентов не найден или произошла ошибка');
    return false;
  }, [loadOfflineCustomers, loadPendingDebts, createOfflineCustomersFromDebts]);

  // Сохранение данных в кэш
  const saveToCache = useCallback((data: {
    customers: CustomerOverview[],
    stats: any,
    offlineCustomers?: CustomerOverview[]
  }) => {
    try {
      localStorage.setItem(CUSTOMERS_CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CUSTOMERS_LAST_UPDATED_KEY, new Date().toISOString());
      
      if (data.offlineCustomers) {
        saveOfflineCustomers(data.offlineCustomers);
      }
      
      console.log('💾 Данные клиентов сохранены в кэш');
    } catch (error) {
      console.error('Ошибка сохранения в кэш:', error);
    }
  }, [saveOfflineCustomers]);

  // Проверка актуальности кэша
  const isCacheValid = useCallback(() => {
    const lastUpdated = localStorage.getItem(CUSTOMERS_LAST_UPDATED_KEY);
    if (!lastUpdated) return false;
    
    const lastUpdateTime = new Date(lastUpdated).getTime();
    const currentTime = Date.now();
    
    return (currentTime - lastUpdateTime) < CACHE_EXPIRY_MS;
  }, []);

  // Загрузка данных с сервера
  const fetchFromServer = useCallback(async () => {
    if (syncInProgressRef.current) {
      console.log('🔄 Синхронизация уже идет');
      return;
    }

    if (!isOnline) {
      console.log('🌐 Нет подключения к интернету');
      setSyncing(false);
      syncInProgressRef.current = false;
      setError("Нет подключения к интернету");
      setCacheStatus('offline');
      return;
    }

    try {
      syncInProgressRef.current = true;
      setSyncing(true);
      setError(null);
      
      const res = await api.get("/customers");
      
      if (Array.isArray(res.data)) {
        const customersData = res.data;
        
        // Рассчитываем статистику
        const totalDebt = customersData.reduce((sum: number, c: CustomerOverview) => 
          sum + (c.totalActiveDebt || 0), 0);
        const averageScore = customersData.length > 0 
          ? customersData.reduce((sum: number, c: CustomerOverview) => 
              sum + (c.trustScore || 50), 0) / customersData.length 
          : 0;
        const activeCustomers = customersData.filter((c: CustomerOverview) => 
          (c.totalActiveDebt || 0) > 0).length;
        
        const newStats = {
          totalDebt,
          averageScore: Math.round(averageScore),
          activeCustomers
        };
        
        setCustomers(customersData);
        setStats(newStats);
        setLastSyncTime(new Date().toLocaleString('ru-RU'));
        setCacheStatus('fresh');

        // Сохраняем в кэш
        saveToCache({
          customers: customersData,
          stats: newStats
        });

      } else {
        setCustomers([]);
      }
    } catch (error: any) {
      console.error('Ошибка загрузки клиентов:', error);
      setError(error.response?.data?.message || error.message || "Неизвестная ошибка");
      
      if (!loadCachedData()) {
        console.log('❌ Не удалось загрузить данные клиентов');
        setCacheStatus('offline');
      } else {
        setCacheStatus('stale');
      }
    } finally {
      setLoading(false);
      setSyncing(false);
      syncInProgressRef.current = false;
    }
  }, [isOnline, loadCachedData, saveToCache]);

  // Синхронизация оффлайн долгов
  const syncPendingDebts = useCallback(async (silent = false) => {
    if (!isOnline) {
      if (!silent) alert('Нет подключения к интернету для синхронизации');
      return false;
    }

    const debts: OfflineDebt[] = loadPendingDebts();
    if (debts.length === 0) {
      if (!silent) alert('Нет оффлайн долгов для синхронизации');
      return false;
    }

    setSyncingPendingDebts(true);
    let result = false;
    
    try {
      console.log(`🔄 Начинаем синхронизацию ${debts.length} оффлайн долгов...`);
      
      if (!silent) {
        console.log('Начата автоматическая синхронизация оффлайн долгов');
      }
      
      const successfulSyncs: OfflineDebt[] = [];
      const failedSyncs: OfflineDebt[] = [];
      
      // Синхронизируем каждый долг
      for (const debt of debts) {
        try {
          const debtData = {
            receiverPhone: debt.receiverPhone,
            receiverName: debt.receiverName,
            amount: debt.amount,
            description: debt.description || undefined,
            dueDate: debt.dueDate || undefined,
            reminders: debt.reminders,
          };

          await api.post("/debts", debtData);
          console.log('✅ Долг синхронизирован:', debt.id);
          successfulSyncs.push(debt);
          
          // Небольшая задержка между запросами
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.error('❌ Ошибка синхронизации долга:', debt.id, error);
          failedSyncs.push(debt);
        }
      }
      
      // Обновляем очередь после синхронизации
      const updatedDebts: OfflineDebt[] = debts.filter(debt => 
        !successfulSyncs.some(success => success.id === debt.id)
      );
      
      // Обновляем статус оставшихся долгов
      updatedDebts.forEach(debt => {
        debt.syncAttempts += 1;
        debt.lastSyncAttempt = new Date().toISOString();
        if (debt.syncAttempts >= 3) {
          debt.status = 'failed';
        } else {
          debt.status = 'pending';
        }
      });
      
      localStorage.setItem(PENDING_DEBTS_KEY, JSON.stringify(updatedDebts));
      setPendingDebts(updatedDebts);
      
      // Обновляем оффлайн клиентов
      const updatedOfflineCustomers = createOfflineCustomersFromDebts(updatedDebts);
      setOfflineCustomers(updatedOfflineCustomers);
      saveOfflineCustomers(updatedOfflineCustomers);
      
      // Показываем результаты
      if (successfulSyncs.length > 0) {
        result = true;
        
        if (!silent) {
          alert(`✅ Успешно синхронизировано ${successfulSyncs.length} из ${debts.length} долгов`);
        } else {
          // Только логируем для автоматической синхронизации
          console.log(`✅ Автоматически синхронизировано ${successfulSyncs.length} долгов`);
        }
        
        // Обновляем список клиентов после успешной синхронизации
        if (isOnline) {
          await fetchFromServer();
        }
      }
      
      if (failedSyncs.length > 0 && !silent) {
        alert(`❌ Не удалось синхронизировать ${failedSyncs.length} долгов. Они останутся в очереди.`);
      } else if (failedSyncs.length > 0) {
        console.log(`❌ Не удалось синхронизировать ${failedSyncs.length} долгов`);
      }
      
    } catch (error) {
      console.error('Ошибка синхронизации оффлайн долгов:', error);
      if (!silent) {
        alert('Произошла ошибка при синхронизации');
      }
    } finally {
      setSyncingPendingDebts(false);
    }
    
    return result;
  }, [isOnline, loadPendingDebts, createOfflineCustomersFromDebts, saveOfflineCustomers, fetchFromServer]);

  // Удаление оффлайн долга
  const deletePendingDebt = useCallback((debtId: string) => {
    if (!confirm('Вы уверены, что хотите удалить этот оффлайн долг?')) {
      return;
    }
    
    try {
      const updatedDebts = pendingDebts.filter(debt => debt.id !== debtId);
      localStorage.setItem(PENDING_DEBTS_KEY, JSON.stringify(updatedDebts));
      setPendingDebts(updatedDebts);
      
      // Обновляем оффлайн клиентов
      const updatedOfflineCustomers = createOfflineCustomersFromDebts(updatedDebts);
      setOfflineCustomers(updatedOfflineCustomers);
      saveOfflineCustomers(updatedOfflineCustomers);
      
      alert('Оффлайн долг удален');
    } catch (error) {
      console.error('Ошибка удаления оффлайн долга:', error);
      alert('Не удалось удалить оффлайн долг');
    }
  }, [pendingDebts, createOfflineCustomersFromDebts, saveOfflineCustomers]);

  // Основная функция загрузки данных
  const loadCustomersData = useCallback(async (forceRefresh = false) => {
    // Сначала всегда показываем кэш если он есть (для мгновенного отображения)
    const hasCache = loadCachedData();
    
    // Если не онлайн, останавливаемся на кэше
    if (!isOnline && !forceRefresh) {
      console.log('📴 Оффлайн режим, показываем кэш');
      if (hasCache) {
        setCacheStatus('offline');
      }
      return;
    }

    // Если онлайн, пробуем обновить в фоне
    if (isOnline && (!forceRefresh || !isCacheValid())) {
      console.log('🌐 Онлайн, обновляем данные в фоне');
      await fetchFromServer();
    }
  }, [isOnline, loadCachedData, isCacheValid, fetchFromServer]);

  // Инициализация при монтировании
  useEffect(() => {
    const loadData = async () => {
      await loadCustomersData();
    };
    loadData();
  }, [loadCustomersData]);

  // Обработчики сетевого статуса
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Подключение к сети восстановлено');
      setIsOnline(true);
      
      // Автоматическая синхронизация при восстановлении соединения
      const autoSyncPendingDebts = async () => {
        const debts = loadPendingDebts();
        if (debts.length > 0 && !autoSyncInProgress) {
          console.log(`🔄 Автоматическая синхронизация ${debts.length} оффлайн долгов...`);
          setAutoSyncInProgress(true);
          
          try {
            await syncPendingDebts();
          } catch (error) {
            console.error('Ошибка автоматической синхронизации:', error);
          } finally {
            setAutoSyncInProgress(false);
          }
        }
      };
      
      // Запускаем автоматическую синхронизацию с небольшой задержкой
      setTimeout(async () => {
        if (cacheStatus === 'offline') {
          // Сначала синхронизируем долги, потом обновляем данные
          await autoSyncPendingDebts();
          await loadCustomersData(true);
        } else {
          // Если кэш актуален, просто синхронизируем долги
          await autoSyncPendingDebts();
        }
      }, 2000);
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
  }, [cacheStatus, loadCustomersData, pendingDebts.length, syncPendingDebts, autoSyncInProgress]);

  // Периодическая синхронизация
  useEffect(() => {
    if (!isOnline) return;

    const syncInterval = setInterval(async () => {
      console.log('⏰ Периодическая проверка синхронизации...');
      
      // Синхронизируем оффлайн долги если есть
      if (pendingDebts.length > 0) {
        console.log('⚡ Автоматическая синхронизация оффлайн долгов');
        try {
          await syncPendingDebts();
        } catch (error) {
          console.error('Ошибка периодической синхронизации:', error);
        }
      }
      
      // Обновляем данные клиентов если кэш устарел
      if (!isCacheValid()) {
        console.log('🔄 Кэш устарел, обновляем данные клиентов');
        await loadCustomersData(true);
      } else {
        console.log('⚡ Кэш актуален, пропускаем обновление');
      }
    }, 300000); // Каждые 5 минут

    return () => clearInterval(syncInterval);
  }, [isOnline, loadCustomersData, isCacheValid, pendingDebts.length, syncPendingDebts]);

  // Socket events для обновления данных при изменениях долгов
  useEffect(() => {
    if (!socket.connected) {
      const token = localStorage.getItem("token");
      if (token) {
        socket.auth = (cb) => cb({ token });
        socket.connect();
      }
    }

    // Listen for debt updates to refresh customer data
    const handleDebtUpdated = (_data: any) => {
      console.log("🔄 Customers: Debt updated, refreshing data...");
      setTimeout(() => {
        loadCustomersData(true);
      }, 1000);
    };

    const handlePaymentConfirmed = (_data: any) => {
      console.log("💸 Customers: Payment confirmed, refreshing data...");
      setTimeout(() => {
        loadCustomersData(true);
      }, 1000);
    };

    const handlePaymentRequested = (_data: any) => {
      console.log("💰 Customers: Payment requested, refreshing data...");
      setTimeout(() => {
        loadCustomersData(true);
      }, 1000);
    };

    const handlePaymentAccepted = (_data: any) => {
      console.log("✅ Customers: Payment accepted, refreshing data...");
      setTimeout(() => {
        loadCustomersData(true);
      }, 1000);
    };

    const handlePaymentRejected = (_data: any) => {
      console.log("❌ Customers: Payment rejected, refreshing data...");
      setTimeout(() => {
        loadCustomersData(true);
      }, 1000);
    };

    socket.on("debt:updated", handleDebtUpdated);
    socket.on("debt:payment-confirmed", handlePaymentConfirmed);
    socket.on("debt:payment-requested", handlePaymentRequested);
    socket.on("debt:payment-accepted", handlePaymentAccepted);
    socket.on("debt:payment-rejected", handlePaymentRejected);

    return () => {
      socket.off("debt:updated", handleDebtUpdated);
      socket.off("debt:payment-confirmed", handlePaymentConfirmed);
      socket.off("debt:payment-requested", handlePaymentRequested);
      socket.off("debt:payment-accepted", handlePaymentAccepted);
      socket.off("debt:payment-rejected", handlePaymentRejected);
    };
  }, [loadCustomersData]);

  // Функция принудительного обновления
  const handleForceRefresh = useCallback(async () => {
    if (!isOnline) {
      setError("Нет подключения к интернету. Проверьте подключение.");
      return;
    }
    
    await loadCustomersData(true);
  }, [isOnline, loadCustomersData]);

  // Функция принудительного сохранения кэша
  const handleForceSave = useCallback(() => {
    saveToCache({ customers, stats, offlineCustomers });
    alert('Данные клиентов сохранены в кэш');
  }, [customers, stats, offlineCustomers, saveToCache]);

  // Фильтрация клиентов
  const filtered = useMemo(() => {
    if (!search.trim()) return getAllCustomers;
    const q = search.toLowerCase();
    return getAllCustomers.filter(
      (c) =>
        c.localName.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q))
    );
  }, [search, getAllCustomers]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black p-4 pb-24 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 lg:pt-16">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl">
                  <Users className="w-6 h-6 text-blue-400" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                  Мои контакты
                </h1>
              </div>
              <p className="text-gray-400 text-sm md:text-base">
                Управляйте своими клиентами и отслеживайте финансовые обязательства
              </p>
              
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
                
                {!isOnline && cacheStatus === 'offline' && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-500/20 text-gray-600 dark:text-gray-400 text-xs">
                    <AlertCircle className="w-3 h-3" />
                    <span>Кэшированные данные</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {/* Кнопка оффлайн долгов */}
              {pendingDebts.length > 0 && (
                <button
                  onClick={() => setShowOfflineSection(!showOfflineSection)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors ${
                    showOfflineSection
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                  }`}
                >
                  <CloudOff className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    {pendingDebts.length} оффлайн
                  </span>
                </button>
              )}
              
              <div className="flex items-center gap-2">
                <button
                  onClick={handleForceRefresh}
                  disabled={syncing}
                  className={`p-2 rounded-xl border transition-colors ${
                    syncing 
                      ? 'bg-gray-800/50 border-gray-700 text-gray-300 opacity-50 cursor-not-allowed' 
                      : isOnline
                      ? 'bg-gray-800/50 border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 hover:bg-gray-700/50'
                      : 'bg-amber-800/30 border-amber-700/50 text-amber-300 hover:bg-amber-700/30 cursor-not-allowed'
                  }`}
                  title={isOnline ? "Обновить данные" : "Нет подключения к интернету"}
                >
                  <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                </button>
                
                <button
                  onClick={handleForceSave}
                  className="p-2 rounded-xl bg-gray-800/50 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
                  title="Сохранить в кэш"
                >
                  <Save className="w-4 h-4" />
                </button>
                
                <button
                  onClick={() => navigate("/customers/new-debt")}
                  className="group relative px-6 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white font-semibold hover:shadow-2xl hover:shadow-blue-500/30 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600/0 via-blue-500/0 to-cyan-500/0 group-hover:from-blue-600/20 group-hover:via-blue-500/20 group-hover:to-cyan-500/20 transition-all duration-300 rounded-2xl" />
                  <Plus className="w-5 h-5" />
                  <span>Новый долг</span>
                </button>
              </div>
            </div>
          </div>

          {/* Предупреждение о работе в оффлайн режиме */}
          {!isOnline && (
            <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
                <div>
                  <h3 className="font-medium text-amber-200 mb-1">
                    Работа в оффлайн режиме
                  </h3>
                  <p className="text-sm text-amber-300/80">
                    Вы просматриваете кэшированные данные клиентов.
                    {lastSyncTime && ` Последнее обновление: ${lastSyncTime}`}
                  </p>
                  {pendingDebts.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <ClockIcon className="w-4 h-4 text-amber-400" />
                      <span className="text-xs text-amber-400">
                        Есть {pendingDebts.length} оффлайн долг(ов) в очереди
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/30 backdrop-blur-xl border border-gray-800/50 rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Общий долг</p>
                  <p className="text-2xl font-bold text-white">
                    {stats.totalDebt.toLocaleString('ru-RU')} ₽
                  </p>
                </div>
                <div className="p-3 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-xl">
                  <DollarSign className="w-6 h-6 text-red-400" />
                </div>
              </div>
              <div className="mt-3 h-1 bg-gradient-to-r from-red-500 to-orange-500 rounded-full"></div>
            </div>

            <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/30 backdrop-blur-xl border border-gray-800/50 rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Средний рейтинг</p>
                  <p className="text-2xl font-bold text-white">
                    {stats.averageScore}%
                  </p>
                </div>
                <div className="p-3 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-xl">
                  <TrendingUp className="w-6 h-6 text-green-400" />
                </div>
              </div>
              <div className="mt-3 h-1 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full"></div>
            </div>

            <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/30 backdrop-blur-xl border border-gray-800/50 rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Активные клиенты</p>
                  <p className="text-2xl font-bold text-white">
                    {stats.activeCustomers + offlineCustomers.length}
                  </p>
                  {offlineCustomers.length > 0 && (
                    <p className="text-xs text-amber-400 mt-1">
                      +{offlineCustomers.length} оффлайн
                    </p>
                  )}
                </div>
                <div className="p-3 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl">
                  <CreditCard className="w-6 h-6 text-blue-400" />
                </div>
              </div>
              <div className="mt-3 h-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full"></div>
            </div>
          </div>
        </div>

        {/* Real-time Alerts */}
        <RealTimeAlerts />

        {/* Секция оффлайн долгов */}
        {showOfflineSection && pendingDebts.length > 0 && (
          <div className="mb-6">
            <div className="bg-gradient-to-br from-amber-900/20 to-orange-900/10 backdrop-blur-xl border border-amber-800/50 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <CloudOff className="w-6 h-6 text-amber-400" />
                  <div>
                    <h3 className="text-lg font-semibold text-amber-200">
                      Оффлайн долги в очереди
                    </h3>
                    <p className="text-sm text-amber-400">
                      {pendingDebts.length} долг(ов) ожидают синхронизации
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {autoSyncInProgress && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20 text-green-600 dark:text-green-400 text-xs">
                      <CloudUpload className="w-3 h-3 animate-pulse" />
                      <span>Синхронизация...</span>
                    </div>
                  )}
                  <button
                    onClick={() => setShowOfflineSection(false)}
                    className="p-2 rounded-xl bg-amber-800/20 border border-amber-700/50 text-amber-400 hover:bg-amber-700/30 transition-colors"
                  >
                    Скрыть
                  </button>
                </div>
              </div>
              
              <div className="space-y-3">
                {pendingDebts.map(debt => (
                  <div key={debt.id} className="p-4 rounded-xl bg-gradient-to-r from-amber-900/10 to-orange-900/5 border border-amber-800/30">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center">
                            <User className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="font-medium text-amber-200">{debt.receiverName}</p>
                            <p className="text-sm text-amber-400">{debt.receiverPhone}</p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                          <div>
                            <p className="text-xs text-amber-500 mb-1">Сумма</p>
                            <p className="text-lg font-bold text-white">
                              {debt.amount.toLocaleString('ru-RU')} ₽
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-xs text-amber-500 mb-1">Дата создания</p>
                            <p className="text-sm text-amber-300">
                              {new Date(debt.createdAt).toLocaleDateString('ru-RU')}
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-xs text-amber-500 mb-1">Статус</p>
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              debt.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                              debt.status === 'syncing' ? 'bg-blue-500/20 text-blue-400' :
                              debt.status === 'synced' ? 'bg-green-500/20 text-green-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {debt.status === 'pending' ? 'В очереди' :
                               debt.status === 'syncing' ? 'Синхронизация' :
                               debt.status === 'synced' ? 'Синхронизирован' :
                               'Ошибка'}
                            </span>
                          </div>
                          
                          <div>
                            <p className="text-xs text-amber-500 mb-1">Попыток</p>
                            <p className="text-sm text-amber-300">
                              {debt.syncAttempts} / 3
                            </p>
                          </div>
                        </div>
                        
                        {debt.description && (
                          <div className="mt-3">
                            <p className="text-xs text-amber-500 mb-1">Описание</p>
                            <p className="text-sm text-amber-300 line-clamp-2">
                              {debt.description}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      <div className="ml-4 flex flex-col gap-2">
                        <button
                          onClick={() => deletePendingDebt(debt.id)}
                          className="p-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 pt-4 border-t border-amber-800/30">
                <p className="text-xs text-amber-500 text-center">
                  💡 Оффлайн долги будут автоматически синхронизированы при восстановлении соединения
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Search and Filter Bar */}
        <div className="mb-6">
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
            <div className="relative flex items-center bg-gray-900/50 backdrop-blur-xl border border-gray-800/50 rounded-xl sm:rounded-2xl overflow-hidden">
              <div className="pl-3 sm:pl-4 pr-1 sm:pr-2">
                <Search className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
              </div>
              
              <input
                className="flex-1 px-3 sm:px-4 py-3 sm:py-4 bg-transparent text-white placeholder-gray-500 focus:outline-none text-sm sm:text-base"
                placeholder="Поиск по имени или телефону..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              
              <button className="px-3 py-1.5 sm:px-4 sm:py-2 m-1.5 sm:m-2 bg-gray-800/50 hover:bg-gray-700/50 rounded-lg sm:rounded-xl transition-colors flex items-center gap-1.5 sm:gap-2 active:scale-95 sm:active:scale-100">
                <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
                <span className="text-xs sm:text-sm text-gray-300">Фильтры</span>
              </button>
            </div>
          </div>
        </div>

        {/* Customer List */}
        <div className="bg-gradient-to-br from-gray-900/40 to-gray-800/20 backdrop-blur-xl border border-gray-800/50 rounded-3xl overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block relative">
                <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-blue-400 animate-pulse" />
                </div>
              </div>
              <p className="mt-6 text-gray-300 font-medium">
                {isOnline ? "Загрузка контактов..." : "Загрузка кэша..."}
              </p>
              <p className="text-gray-500 text-sm mt-2">
                {isOnline ? "Подождите, данные загружаются" : "Проверяем локальное хранилище"}
              </p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center">
                <AlertCircle className="w-10 h-10 text-red-400" />
              </div>
              <p className="text-xl font-semibold text-white mb-2">Ошибка загрузки</p>
              <p className="text-gray-400 mb-6 max-w-md mx-auto">{error}</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleForceRefresh}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-medium transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20"
                >
                  Попробовать снова
                </button>
                {!isOnline && (
                  <button
                    onClick={() => loadCachedData()}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-medium transition-all duration-300"
                  >
                    Загрузить кэш
                  </button>
                )}
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center ">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700/50 flex items-center justify-center">
                <User className="w-10 h-10 text-gray-400" />
              </div>
              <p className="text-xl font-semibold text-white mb-2">
                {search ? "Ничего не найдено" : "Контакты не найдены"}
              </p>
              <p className="text-gray-400 mb-6">
                {search ? "Попробуйте изменить поисковый запрос" : "Добавьте свой первый контакт"}
              </p>
              {!search && (
                <button
                  onClick={() => navigate("/customers/new-debt")}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-medium transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20 flex items-center gap-2 mx-auto"
                >
                  <Plus className="w-5 h-5" />
                  Добавить первый контакт
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Индикатор кэша для списка */}
              {!isOnline && (
                <div className="p-3 border-b border-gray-800/50 bg-gradient-to-r from-amber-500/5 to-orange-500/5">
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span className="text-amber-300">Оффлайн режим: показываем кэшированные данные</span>
                  </div>
                </div>
              )}
              
              <div className="p-4  md:p-6 ">
                <div className="grid gap-3">
                  {filtered.map((c) => {
                    const isOffline = c._id.startsWith('offline_');
                    
                    const customerData = {
                      id: c._id,
                      name: c.localName || "Без имени",
                      phone: c.phone || "—",
                      trustScore: c.trustScore || 50,
                      debt: c.totalActiveDebt || 0,
                      overdue: c.overdueCount || 0,
                      isOffline
                    };

                    return (
                      <div
                        key={customerData.id}
                        onClick={() => {
                          if (!customerData.isOffline) {
                            navigate(`/customers/${customerData.id}/debts`);
                          } else {
                            // Для оффлайн клиентов показываем информацию
                            setShowOfflineSection(true);
                          }
                        }}
                        className={`group relative cursor-pointer ${
                          customerData.isOffline ? 'cursor-default' : ''
                        }`}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/0 to-cyan-500/0 group-hover:from-blue-500/5 group-hover:via-blue-500/3 group-hover:to-cyan-500/5 rounded-2xl transition-all duration-300"></div>
                        
                        <div className={`relative backdrop-blur-sm border rounded-2xl p-4 transition-all duration-300 ${
                          customerData.isOffline 
                            ? 'bg-gradient-to-r from-amber-900/10 to-orange-900/5 border-amber-800/30 hover:border-amber-700/50 group-hover:scale-[1.002]' 
                            : 'bg-gray-900/30 border-gray-800/50 group-hover:border-blue-500/30 group-hover:scale-[1.002] group-active:scale-[0.998]'
                        }`}>
                          <div className="flex items-center gap-4">
                            {/* Avatar */}
                            <div className="relative shrink-0">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg ${
                                customerData.isOffline 
                                  ? 'bg-gradient-to-br from-amber-600 to-orange-500' 
                                  : 'bg-gradient-to-br from-blue-600 to-cyan-500'
                              }`}>
                                {customerData.name.charAt(0).toUpperCase()}
                              </div>
                              {customerData.overdue > 0 && !customerData.isOffline && (
                                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                                  <span className="text-xs font-bold text-white">!</span>
                                </div>
                              )}
                              {customerData.isOffline && (
                                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center">
                                  <CloudOff className="w-3 h-3 text-white" />
                                </div>
                              )}
                            </div>

                            {/* Customer Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-white font-semibold truncate flex items-center gap-2">
                                  {customerData.name}
                                  {customerData.isOffline && (
                                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs">
                                      оффлайн
                                    </span>
                                  )}
                                </h3>
                                {!customerData.isOffline && (
                                  <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-blue-400 transition-colors" />
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                {customerData.phone && customerData.phone !== "—" && (
                                  <div className="flex items-center gap-1.5 text-sm text-gray-400">
                                    <Phone className="w-3.5 h-3.5" />
                                    <span>{customerData.phone}</span>
                                  </div>
                                )}
                                {customerData.isOffline && (
                                  <div className="flex items-center gap-1.5 text-xs text-amber-400">
                                    <ClockIcon className="w-3 h-3" />
                                    <span>Ожидает синхронизации</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Trust Score */}
                            <div className="hidden md:block">
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <p className="text-gray-400 text-xs">Доверие</p>
                                  <p className="text-white font-bold">{customerData.trustScore}%</p>
                                </div>
                                <TrustCircle 
                                  value={customerData.trustScore} 
                                  size="sm" 
                                  showLabel={false}
                                />
                              </div>
                            </div>

                            {/* Debt Info */}
                            <div className="text-right">
                              <p className="text-gray-400 text-xs mb-1">Долг</p>
                              <p className={`text-lg font-bold ${
                                customerData.debt > 0 
                                  ? customerData.isOffline ? 'text-amber-300' : 'text-red-300'
                                  : 'text-green-300'
                              }`}>
                                {customerData.debt.toLocaleString('ru-RU')} ₽
                                {customerData.isOffline && (
                                  <span className="text-xs text-amber-400 block mt-1">
                                    (оффлайн)
                                  </span>
                                )}
                              </p>
                            </div>

                            {/* Overdue */}
                            <div className="text-right hidden md:block">
                              <p className="text-gray-400 text-xs mb-1">Просрочка</p>
                              {customerData.overdue > 0 ? (
                                <div className="flex items-center gap-1.5 text-red-300">
                                  <Clock className="w-4 h-4" />
                                  <span className="font-bold">{customerData.overdue}</span>
                                </div>
                              ) : (
                                <span className="text-gray-500">—</span>
                              )}
                            </div>
                          </div>

                          {/* Mobile Additional Info */}
                          <div className="md:hidden mt-3 pt-3 border-t border-gray-800/50 flex justify-between">
                            <div className="flex items-center gap-3">
                              <TrustCircle 
                                value={customerData.trustScore} 
                                size="sm" 
                                showLabel={false}
                              />
                              <span className="text-sm text-gray-400">
                                {customerData.trustScore}% доверия
                              </span>
                            </div>
                            {customerData.overdue > 0 && (
                              <div className="flex items-center gap-1.5 text-red-300">
                                <Clock className="w-4 h-4" />
                                <span className="text-sm font-medium">{customerData.overdue} просрочка</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer Stats */}
              <div className="px-6 py-4 border-t border-gray-800/50 bg-gradient-to-r from-gray-900/20 to-gray-800/10">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-400">
                      Всего контактов: <span className="text-white font-medium">{getAllCustomers.length}</span>
                      {offlineCustomers.length > 0 && (
                        <span className="text-amber-400 ml-2">
                          (+{offlineCustomers.length} оффлайн)
                        </span>
                      )}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3 text-sm">
                    {search && (
                      <div className="text-gray-400">
                        Найдено: <span className="text-white font-medium">{filtered.length}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">Статус данных:</span>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        cacheStatus === 'fresh' ? 'bg-emerald-500/20 text-emerald-400' :
                        cacheStatus === 'stale' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {cacheStatus === 'fresh' ? 'Актуальные' :
                         cacheStatus === 'stale' ? 'Устаревшие' :
                         'Оффлайн'}
                      </span>
                    </div>
                    
                    {pendingDebts.length > 0 && (
                      <button
                        onClick={() => setShowOfflineSection(!showOfflineSection)}
                        className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors text-xs"
                      >
                        <CloudOff className="w-3 h-3" />
                        <span>{pendingDebts.length} в очереди</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Информация о кэше внизу страницы */}
        <div className="mt-6 mb-6 text-xs text-gray-500 text-center">
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              <Wifi className="w-3 h-3" />
              <span>Автосинхронизация каждые 5 минут</span>
            </div>
            <div className="flex items-center gap-2">
              <Save className="w-3 h-3" />
              <span>Данные сохраняются локально</span>
            </div>
            {pendingDebts.length > 0 && (
              <div className="flex items-center gap-2">
                <CloudOff className="w-3 h-3 text-amber-400" />
                <span className="text-amber-400">{pendingDebts.length} оффлайн долгов</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}