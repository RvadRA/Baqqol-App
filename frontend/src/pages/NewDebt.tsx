import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useDebounce } from "../hooks/useDebounce";
import { formatMoneyRUB } from "../utils/formatMoney";
import { TrustCircle } from "../components/TrustCircle";
import { 
  Calendar, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  User, 
  Phone, 
  Wallet, 
  FileText, 
  ChevronLeft, 
  Search, 
  Loader2, 
  Sparkles,
  X,
  Shield,
  WifiOff,
  Save,
  UserPlus
} from "lucide-react";

interface Identity {
  _id: string;
  phone: string;
  registeredName?: string;
  trustScore: number;
  isRegistered?: boolean;
}

interface LocalName {
  localName: string;
  targetIdentityId: Identity;
}

export default function NewDebt() {
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get("customerId");
  const navigate = useNavigate();

  // Person
  const [phone, setPhone] = useState("+7");
  const [name, setName] = useState("");
  const debouncedPhone = useDebounce(phone, 500);
  
  // Debt
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [reminders, setReminders] = useState<boolean[]>([false, false, false]);
  
  // Search result
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [suggestions, setSuggestions] = useState<{
    identities: Identity[];
    locals: LocalName[];
  }>({ identities: [], locals: [] });
  
  const [, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCreateContact, setShowCreateContact] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Load customer data if customerId exists
  useEffect(() => {
    if (!customerId) return;

    api.get(`/customers/${customerId}`).then((res) => {
      const customer = res.data;
      setName(customer.localName);
      setPhone(customer.phone);
      setSuggestions({ identities: [], locals: [] });
      setIdentity(null);
    });
  }, [customerId]);

  // Check online status
  useEffect(() => {
    const handleOnline = () => {
      console.log('🟢 NewDebt: App is online');
      setIsOnline(true);
    };
    
    const handleOffline = () => {
      console.log('🔴 NewDebt: App is offline');
      setIsOnline(false);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Search by phone
  useEffect(() => {
    searchByPhone(debouncedPhone);
  }, [debouncedPhone]);

  // Нормализация телефона для поиска (как в ContactSearchModal)
  const normalizePhoneForSearch = (phone: string): string => {
    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.startsWith('8') && cleaned.length >= 11) {
      return '+7' + cleaned.substring(1);
    }
    
    if (cleaned.startsWith('7') && !phone.startsWith('+') && cleaned.length >= 11) {
      return '+' + cleaned;
    }
    
    if (phone.startsWith('+7')) {
      return phone.replace(/\D/g, '').replace(/^7/, '+7');
    }
    
    if (cleaned.length === 10) {
      return '+7' + cleaned;
    }
    
    if (phone.startsWith('+')) {
      return phone;
    }
    
    return '+' + cleaned;
  };

  const searchByPhone = async (value: string) => {
    const normalized = normalizePhoneForSearch(value);
    
    if (normalized.replace(/\D/g, '').length < 6) {
      setIdentity(null);
      setSuggestions({ identities: [], locals: [] });
      setNotFound(false);
      setShowCreateContact(false);
      return;
    }

    setLoading(true);
    setShowCreateContact(false);
    
    try {
      const res = await api.get(
        `/identities/search?q=${encodeURIComponent(normalized.replace('+', ''))}`
      );

      setSuggestions(res.data);

      const found =
        res.data.identities?.[0] ||
        res.data.locals?.[0]?.targetIdentityId;

      if (found) {
        setIdentity(found);
        setNotFound(false);
        // Автоматически заполняем имя если найден контакт
        if (res.data.locals?.[0]?.localName) {
          setName(res.data.locals[0].localName);
        } else if (found.registeredName) {
          setName(found.registeredName);
        }
      } else {
        setIdentity(null);
        setNotFound(true);
        // Показываем возможность создания контакта
        if (normalized.replace(/\D/g, '').length >= 7) {
          setShowCreateContact(true);
        }
      }
    } catch (error) {
      console.error("Search error:", error);
      // Если оффлайн, показываем создание контакта
      if (!isOnline && normalized.replace(/\D/g, '').length >= 7) {
        setShowCreateContact(true);
      }
    } finally {
      setLoading(false);
    }
  };

  // Create debt (PEER-TO-PEER)
 // Замените функцию createDebt на эту:

// Обновите функцию createDebt следующим образом:
const createDebt = async () => {
  const numericAmount = Number(amount.replace(/\D/g, ""));
  
  // Проверка валидации
  if (!phone || phone.length < 11) {
    alert("Введите корректный номер телефона (минимум 11 цифр)");
    return;
  }
  
  if (!name || name.trim().length < 2) {
    alert("Введите имя контакта (минимум 2 символа)");
    return;
  }
  
  if (numericAmount <= 0 || isNaN(numericAmount)) {
    alert("Введите корректную сумму долга");
    return;
  }

  setIsCreating(true);
  console.log('🚀 Начинаем создание долга...', { isOnline, phone, name, amount: numericAmount });

  try {
    // Если оффлайн - сразу сохраняем в очередь
    if (!isOnline) {
      console.log('📱 Оффлайн режим - сохраняем в очередь');
      saveDebtToQueue();
      return;
    }

    const debtData = {
      receiverPhone: normalizePhoneForSearch(phone),
      receiverName: name,
      amount: numericAmount,
      description: description || undefined,
      dueDate: dueDate || undefined,
      reminders: reminders.filter(Boolean),
    };

    console.log('📤 Отправляем запрос на сервер:', debtData);

    // Устанавливаем таймаут для запроса
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 секунд таймаут

    const response = await api.post("/debts", debtData, {
      signal: controller.signal,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-Offline-Mode': !isOnline ? 'true' : 'false'
      }
    });

    clearTimeout(timeoutId);
    
    console.log('✅ Долг успешно создан:', response.data);
    
    // Показываем уведомление
    alert("✅ Долг успешно создан!");
    
    // Сбрасываем форму
    resetForm();
    
    // Переходим к контактам
    setTimeout(() => {
      navigate("/customers");
    }, 1000);
    
  } catch (err: any) {
    console.error('❌ Ошибка при создании долга:', err);
    
    // Определяем тип ошибки
    const isNetworkError = 
      !isOnline ||
      err.code === 'ERR_NETWORK' || 
      err.message?.includes('Network Error') ||
      err.message?.includes('Failed to fetch') ||
      err.message?.includes('Network request failed') ||
      (err.response === undefined && err.request !== undefined);
    
    const isTimeoutError = 
      err.code === 'ECONNABORTED' || 
      err.message?.includes('timeout') || 
      err.message?.includes('Timeout');
    
    const isAbortError = err.name === 'AbortError';
    
    console.log('📊 Анализ ошибки:', {
      isNetworkError,
      isTimeoutError,
      isAbortError,
      message: err.message,
      code: err.code,
      response: err.response?.status,
      isOnline
    });
    
    if (isNetworkError || isTimeoutError) {
      // Если сетевая ошибка или таймаут - сохраняем в оффлайн очередь
      console.log('💾 Сохраняем долг в оффлайн очередь из-за сетевой ошибки');
      saveDebtToQueue();
    } else if (isAbortError) {
      alert('⏱️ Создание долга заняло слишком много времени. Попробуйте снова или сохраните в оффлайн очередь.');
    } else {
      // Другие ошибки (валидация, серверные и т.д.)
      const errorMessage = err.response?.data?.message || 
                          err.response?.data?.error || 
                          err.message || 
                          "Неизвестная ошибка при создании долга";
      
      console.log('⚠️ Другие ошибки:', errorMessage);
      alert(`Ошибка: ${errorMessage}`);
    }
  } finally {
    setIsCreating(false);
    console.log('🏁 Завершена обработка создания долга');
  }
};

// Также добавьте более надежную функцию saveDebtToQueue:
// Улучшенная функция saveDebtToQueue
const saveDebtToQueue = () => {
  try {
    const numericAmount = Number(amount.replace(/\D/g, ""));
    
    // Дополнительная проверка
    if (!phone || !name || numericAmount <= 0) {
      alert("Недостаточно данных для сохранения долга");
      setIsCreating(false);
      return;
    }

    // Получаем текущую очередь
    let pendingDebts = [];
    try {
      const stored = localStorage.getItem('pendingDebts');
      if (stored) {
        pendingDebts = JSON.parse(stored);
        if (!Array.isArray(pendingDebts)) {
          pendingDebts = [];
        }
      }
    } catch (parseError) {
      console.error('Ошибка при парсинге очереди:', parseError);
      pendingDebts = [];
    }

    // Создаем новый долг для очереди
    const newDebt = {
      id: `pending_debt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      receiverPhone: normalizePhoneForSearch(phone),
      receiverName: name,
      amount: numericAmount,
      description: description || '',
      dueDate: dueDate || null,
      reminders: reminders.filter(Boolean),
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      status: 'pending',
      syncAttempts: 0,
      lastSyncAttempt: null,
      isOffline: true
    };

    console.log('💾 Сохраняем в очередь:', newDebt);
    
    // Добавляем в очередь
    pendingDebts.push(newDebt);
    
    // Сохраняем обратно в localStorage
    localStorage.setItem('pendingDebts', JSON.stringify(pendingDebts));
    
    // Обновляем счетчик в UI
    const queueCount = pendingDebts.length;
    
    // Показываем уведомление
    alert(`✅ Долг сохранен в очередь!\n\n📊 Статус: Ожидает синхронизации\n📋 В очереди: ${queueCount} долгов\n\nДолг будет автоматически создан при восстановлении соединения.`);
    
    // Логируем в консоль
    console.log(`📈 Очередь обновлена. Всего долгов в очереди: ${queueCount}`);
    
    // Сбрасываем форму
    resetForm();
    
    // Переходим на страницу контактов
    setTimeout(() => {
      navigate("/customers");
    }, 1500);
    
  } catch (error) {
    console.error('❌ Критическая ошибка при сохранении в очередь:', error);
    alert(`❌ Ошибка сохранения: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    setIsCreating(false);
  }
};

// Добавьте эту функцию для проверки очереди при загрузке страницы
useEffect(() => {
  // Проверяем очередь при монтировании
  const checkPendingDebts = () => {
    try {
      const pendingDebts = JSON.parse(localStorage.getItem('pendingDebts') || '[]');
      console.log(`📋 При загрузке: ${pendingDebts.length} долгов в очереди`);
      
      if (pendingDebts.length > 0) {
        console.log('📊 Детали очереди:', pendingDebts);
      }
    } catch (error) {
      console.error('Ошибка при проверке очереди:', error);
    }
  };
  
  checkPendingDebts();
}, []);

// Добавьте функцию для обновления счетчика очереди
const updateOfflineQueueCount = () => {
  try {
    const pendingDebts = JSON.parse(localStorage.getItem('pendingDebts') || '[]');
    // Можно обновить состояние или сделать что-то еще
    console.log('Offline queue updated:', pendingDebts.length, 'debts');
  } catch (error) {
    console.error('Error updating queue count:', error);
  }
};

// Добавьте в useEffect мониторинг очереди:
useEffect(() => {
  // Проверяем очередь при монтировании
  updateOfflineQueueCount();
  
  // // Периодически проверяем интернет и синхронизируем если онлайн
  // const syncInterval = setInterval(() => {
  //   if (navigator.onLine) {
  //     syncPendingDebts();
  //   }
  // }, 30000); // Каждые 30 секунд
  
  // return () => clearInterval(syncInterval);
}, []);

// Добавьте функцию синхронизации



  // Сохранить долг в очередь для оффлайн
  

  // Сброс формы
  const resetForm = () => {
    setPhone("+7");
    setName("");
    setDescription("");
    setAmount("");
    setDueDate("");
    setReminders([false, false, false]);
    setIdentity(null);
    setShowCreateContact(false);
  };

  // Форматирование телефона при вводе (как в ContactSearchModal)
  const formatPhoneInput = (value: string) => {
    // Удаляем все нецифровые символы
    let cleaned = value.replace(/\D/g, '');
    
    // Если номер пустой, возвращаем базовое значение
    if (!cleaned) return '+7';
    
    // Если начинается с 8, заменяем на +7
    if (cleaned.startsWith('8') && cleaned.length >= 1) {
      cleaned = '7' + cleaned.substring(1);
    }
    
    // Если нет плюса и начинается с 7, добавляем +
    if (!value.startsWith('+') && cleaned.startsWith('7')) {
      cleaned = '7' + cleaned.substring(1);
    }
    
    // Ограничиваем длину (максимум 11 цифр: код страны + 10 цифр)
    if (cleaned.length > 11) {
      cleaned = cleaned.substring(0, 11);
    }
    
    // Форматирование с учетом различных длин
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

  // Форматирование телефона для отображения (как в ContactSearchModal)
  const formatPhoneNumberForDisplay = (phone: string) => {
    if (!phone) return "";
    
    // Если номер уже начинается с +7, форматируем красиво
    if (phone.startsWith('+7') && phone.length === 12) {
      const digits = phone.substring(2);
      const match = digits.match(/^(\d{3})(\d{3})(\d{2})(\d{2})$/);
      if (match) {
        return `+7 ${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
      }
    }
    
    // Если номер начинается с 7 (без плюса)
    if (phone.startsWith('7') && phone.length === 11) {
      const match = phone.match(/^7(\d{3})(\d{3})(\d{2})(\d{2})$/);
      if (match) {
        return `+7 ${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
      }
    }
    
    // Если номер начинается с 8
    if (phone.startsWith('8') && phone.length === 11) {
      const match = phone.match(/^8(\d{3})(\d{3})(\d{2})(\d{2})$/);
      if (match) {
        return `+7 ${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
      }
    }
    
    return phone;
  };

  // Обработчик изменения телефона
  const handlePhoneChange = (value: string) => {
    setPhone(formatPhoneInput(value));
  };

  // Обработчик изменения имени
  const handleNameChange = (value: string) => {
    const capitalized = value.charAt(0).toUpperCase() + value.slice(1);
    setName(capitalized);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4 md:p-8 lg:p-16">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate("/customers")}
              className="flex items-center gap-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all duration-300 group p-3 rounded-2xl hover:bg-white/50 dark:hover:bg-white/5 backdrop-blur-sm"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white to-gray-100 dark:from-gray-800 dark:to-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
                <ChevronLeft className="w-5 h-5" />
              </div>
              <span className="font-medium hidden md:block">Назад</span>
            </button>
            
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-3">
                <div className="w-3 h-3 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 animate-pulse shadow-lg"></div>
                <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Новый долг
                </h1>
                <Sparkles className="w-5 h-5 text-yellow-500" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-light">
                Создание финансового обязательства
              </p>
            </div>
            
            <div className="w-24 flex justify-end">
              {!isOnline && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20">
                  <WifiOff className="w-4 h-4 text-orange-400" />
                  <span className="text-xs text-orange-400">Оффлайн</span>
                </div>
              )}
            </div>
          
          </div>
          
          <div className="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-800 to-transparent"></div>
        </div>

        {/* Main Form Container */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Form */}
          <div className="lg:col-span-2">
            {/* Main Card */}
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-2xl p-6 md:p-8 mb-8 backdrop-blur-sm bg-gradient-to-br from-white/90 to-white/70 dark:from-gray-900/90 dark:to-gray-900/70">
              {/* Phone & Search Section */}
              <div className="mb-10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
                      <Phone className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        Контакт получателя
                      </h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Поиск по номеру телефона
                      </p>
                    </div>
                  </div>
                  
                  {identity && (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                        Найден в системе
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="relative mb-4">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2">
                    <Search className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    className="w-full pl-14 pr-12 py-4 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all duration-300 placeholder:text-gray-400"
                    value={phone}
                    disabled={!!customerId}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="+7 (XXX) XXX-XX-XX"
                  />
                  
                  {phone.length > 2 && (
                    <button
                      onClick={() => {
                        setPhone("+7");
                        setIdentity(null);
                        setName("");
                        setSuggestions({ identities: [], locals: [] });
                      }}
                      className="absolute right-5 top-1/2 -translate-y-1/2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full p-1 transition-colors"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  )}
                  
                  {loading && (
                    <div className="absolute right-12 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    </div>
                  )}
                </div>

                {/* Онлайн/Оффлайн статус */}
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm">
                    {!isOnline && (
                      <div className="flex items-center gap-2 text-orange-500">
                        <WifiOff className="w-4 h-4" />
                        <span>Оффлайн режим. Новые контакты будут сохранены в очередь.</span>
                      </div>
                    )}
                  </div>
                  
                  {showCreateContact && !identity && (
                    <button
                      onClick={() => setShowCreateContact(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:opacity-90 transition-opacity text-sm font-medium"
                    >
                      <UserPlus className="w-4 h-4" />
                      Создать контакт
                    </button>
                  )}
                </div>

                {/* Search Results */}
                {(suggestions.identities.length > 0 || suggestions.locals.length > 0) && (
                  <div className="mt-6 animate-fadeIn">
                    <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 shadow-lg">
                      {suggestions.identities.length > 0 && (
                        <div className="mb-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500"></div>
                            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                              Найденные профили
                            </p>
                            <div className="ml-auto px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800">
                              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                                {suggestions.identities.length} найдено
                              </span>
                            </div>
                          </div>
                          
                          <div className="space-y-3">
                            {suggestions.identities.map((i) => (
                              <div
                                key={i._id}
                                onClick={() => {
                                  setIdentity(i);
                                  setName(i.registeredName || "");
                                  setPhone(i.phone);
                                  setSuggestions({ identities: [], locals: [] });
                                  setShowCreateContact(false);
                                }}
                                className="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-lg cursor-pointer transition-all duration-300 group"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900/30 dark:to-cyan-900/30 flex items-center justify-center">
                                      <User className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                      <p className="text-gray-900 dark:text-white font-semibold group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                        {i.registeredName || "Без имени"}
                                      </p>
                                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        {formatPhoneNumberForDisplay(i.phone)}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <TrustCircle value={i.trustScore} size="sm" />
                                    {i.isRegistered && (
                                      <Shield className="w-4 h-4 text-blue-400" />
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {suggestions.locals.length > 0 && (
                        <div>
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-2 h-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"></div>
                            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                              Мои контакты
                            </p>
                            <div className="ml-auto px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800">
                              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                {suggestions.locals.length} сохранён
                              </span>
                            </div>
                          </div>
                          
                          <div className="space-y-3">
                            {suggestions.locals.map((l, idx) => (
                              <div
                                key={idx}
                                onClick={() => {
                                  setIdentity(l.targetIdentityId);
                                  setName(l.localName);
                                  setPhone(l.targetIdentityId.phone);
                                  setShowCreateContact(false);
                                }}
                                className="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-lg cursor-pointer transition-all duration-300 group"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 flex items-center justify-center">
                                      <User className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div>
                                      <p className="text-gray-900 dark:text-white font-semibold group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                        {l.localName}
                                      </p>
                                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        {formatPhoneNumberForDisplay(l.targetIdentityId.phone)}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <TrustCircle value={l.targetIdentityId.trustScore} size="sm" />
                                    <div className="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800">
                                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                        Контакт
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Создание нового контакта */}
                {showCreateContact && !identity && !loading && (
                  <div className="mt-6 animate-fadeIn">
                    <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border-2 border-dashed border-blue-200 dark:border-blue-800 rounded-2xl p-6">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                          {isOnline ? (
                            <UserPlus className="w-6 h-6 text-white" />
                          ) : (
                            <Save className="w-6 h-6 text-white" />
                          )}
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {isOnline ? 'Создать новый контакт' : 'Сохранить контакт'}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {isOnline 
                              ? 'Контакт не найден в системе' 
                              : 'Контакт будет создан при подключении к интернету'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Имя получателя
                          </label>
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => handleNameChange(e.target.value)}
                            placeholder="Введите имя контакта"
                            className="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-gray-900 dark:text-white placeholder-gray-400"
                          />
                          {!name && (
                            <p className="text-xs text-gray-500 mt-1">
                              Если оставить пустым, будет использовано: Контакт {formatPhoneNumberForDisplay(normalizePhoneForSearch(phone))}
                            </p>
                          )}
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Номер телефона
                          </label>
                          <div className="px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700">
                            <div className="flex items-center gap-2">
                              <Phone className="w-4 h-4 text-gray-400" />
                              <span className="text-gray-900 dark:text-white font-medium">
                                {formatPhoneNumberForDisplay(normalizePhoneForSearch(phone))}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Номер будет сохранен в международном формате
                          </p>
                        </div>
                        
                        <div className={`rounded-xl p-4 ${
                          isOnline 
                            ? 'bg-blue-100/50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' 
                            : 'bg-orange-100/50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800'
                        }`}>
                          <div className="flex items-start gap-3">
                            <AlertCircle className={`w-5 h-5 ${
                              isOnline ? 'text-blue-500' : 'text-orange-500'
                            } mt-0.5 flex-shrink-0`} />
                            <p className={`text-sm ${
                              isOnline ? 'text-blue-700 dark:text-blue-400' : 'text-orange-700 dark:text-orange-400'
                            }`}>
                              {isOnline 
                                ? 'Контакт будет добавлен в вашу адресную книгу и вы сможете создать долг.'
                                : 'Контакт и долг будут сохранены локально и автоматически созданы при восстановлении соединения.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Name Input */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Имя получателя
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <div className="relative">
                    <input
                      className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all duration-300 placeholder:text-gray-400"
                      placeholder="Введите полное имя"
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <User className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Amount Input */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Wallet className="w-4 h-4" />
                    Сумма долга (руб.)
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0 ₽"
                      value={amount}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        if (value.length <= 10) { // Ограничение на 10 цифр
                          setAmount(value);
                        }
                      }}
                      className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 focus:border-yellow-500 focus:ring-4 focus:ring-yellow-500/10 transition-all duration-300 placeholder:text-gray-400"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
                        <Wallet className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <span className="text-lg font-bold text-yellow-600 dark:text-yellow-400">₽</span>
                    </div>
                  </div>
                  {amount && (
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                      {formatMoneyRUB(amount)} рублей
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-3 mb-8">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Описание долга
                </label>
                <div className="relative">
                  <textarea
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 transition-all duration-300 min-h-[120px] resize-none placeholder:text-gray-400"
                    placeholder="Опишите причину долга, сроки возврата или дополнительные условия..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <div className="absolute left-4 top-4">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Advanced Options */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center justify-between w-full mb-6 p-4 rounded-2xl bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-900 dark:text-white">Дополнительные параметры</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Сроки и напоминания</p>
                  </div>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>
                  ▼
                </div>
              </button>

              {showAdvanced && (
                <div className="space-y-6 mb-8 animate-slideDown">
                  {/* Due Date */}
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Срок возврата
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all duration-300"
                      />
                      <div className="absolute left-4 top-1/2 -translate-y-1/2">
                        <Calendar className="w-5 h-5 text-gray-400" />
                      </div>
                    </div>
                  </div>

                  {/* Reminders */}
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Напоминания
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        { label: "За 3 дня", key: 0 },
                        { label: "За 1 день", key: 1 },
                        { label: "В день оплаты", key: 2 }
                      ].map((reminder, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            const newReminders = [...reminders];
                            newReminders[idx] = !newReminders[idx];
                            setReminders(newReminders);
                          }}
                          className={`p-4 rounded-2xl border-2 transition-all duration-300 flex items-center justify-center gap-2 ${
                            reminders[idx]
                              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                              : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-400 hover:border-emerald-300 dark:hover:border-emerald-700'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center ${
                            reminders[idx]
                              ? 'border-emerald-500 bg-emerald-500'
                              : 'border-gray-300 dark:border-gray-600'
                          }`}>
                            {reminders[idx] && (
                              <CheckCircle2 className="w-3 h-3 text-white" />
                            )}
                          </div>
                          <span className="font-medium">{reminder.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Create Button */}
             <button
  onClick={createDebt}
  disabled={isCreating || (!identity && !showCreateContact && normalizePhoneForSearch(phone).replace(/\D/g, '').length < 7)}
  className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 p-px hover:shadow-2xl hover:shadow-blue-500/30 transition-all duration-500 disabled:opacity-50 disabled:cursor-not-allowed"
>
  <div className="absolute inset-0 translate-y-[100%] rotate-45 transition-transform duration-700 group-hover:translate-y-[-100%] group-hover:rotate-90 bg-white/20"></div>
  <div className="relative rounded-[15px] bg-gradient-to-r from-gray-900 to-gray-950 p-5 transition-all duration-300 group-hover:from-gray-800 group-hover:to-gray-900">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        {isCreating ? (
          <>
            <Loader2 className="w-6 h-6 text-white animate-spin" />
            <div>
              <span className="text-lg font-bold text-white">
                {isOnline ? 'Создание...' : 'Сохранение...'}
              </span>
              <p className="text-xs text-blue-200 mt-1">
                {isOnline ? 'Отправка на сервер' : 'Сохранение в очередь'}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center">
              {isOnline ? (
                <Sparkles className="w-6 h-6 text-white" />
              ) : (
                <Save className="w-6 h-6 text-white" />
              )}
            </div>
            <div>
              <p className="text-lg font-bold text-white">
                {isOnline ? 'Создать долг' : 'Сохранить в очередь'}
              </p>
              <p className="text-sm text-blue-200">
                {isOnline ? 'Защищённая транзакция' : 'Создастся при подключении'}
              </p>
            </div>
          </>
        )}
      </div>
      <div className="text-right">
        <div className="text-2xl font-bold text-white">
          {amount ? `${formatMoneyRUB(amount)} ` : "0 ₽"}
        </div>
        {!isOnline && (
          <div className="text-xs text-orange-300 mt-1">
            Оффлайн режим
          </div>
        )}
      </div>
    </div>
  </div>
</button>
            </div>
          </div>

          {/* Right Column - Summary & Trust Info */}
          <div className="space-y-8">
            {/* Trust Summary Card */}
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl p-6 backdrop-blur-sm bg-gradient-to-br from-white/90 to-white/70 dark:from-gray-900/90 dark:to-gray-900/70">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500"></div>
                Статус доверия
              </h3>
              
              {identity ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-center">
                    <TrustCircle value={identity.trustScore} size="lg" />
                  </div>
                  
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-100 dark:border-blue-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Имя</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{identity.registeredName || name || "Не указано"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Телефон</span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {formatPhoneNumberForDisplay(identity.phone)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-100 dark:border-emerald-800">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Статус доверия</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          identity.trustScore > 75 
                            ? 'bg-emerald-500 text-white'
                            : identity.trustScore > 50 
                            ? 'bg-yellow-500 text-white'
                            : 'bg-red-500 text-white'
                        }`}>
                          {identity.trustScore > 75 ? 'Высокий' : identity.trustScore > 50 ? 'Средний' : 'Низкий'}
                        </span>
                      </div>
                    </div>
                    
                    {identity.isRegistered && (
                      <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-100 dark:border-purple-800">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Статус</span>
                          <span className="px-3 py-1 rounded-full bg-purple-500 text-white text-xs font-bold">
                            Зарегистрирован
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : showCreateContact ? (
                <div className="text-center py-8">
                  <div className={`w-20 h-20 mx-auto mb-4 rounded-2xl flex items-center justify-center ${
                    isOnline
                      ? 'bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900/30 dark:to-cyan-900/30'
                      : 'bg-gradient-to-br from-orange-100 to-yellow-100 dark:from-orange-900/30 dark:to-yellow-900/30'
                  }`}>
                    {isOnline ? (
                      <UserPlus className="w-10 h-10 text-blue-500 dark:text-blue-400" />
                    ) : (
                      <Save className="w-10 h-10 text-orange-500 dark:text-orange-400" />
                    )}
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 mb-2 font-medium">
                    {isOnline ? 'Новый контакт' : 'Сохранение в очередь'}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500">
                    {isOnline 
                      ? 'Контакт будет создан вместе с долгом'
                      : 'Контакт будет создан при подключении'}
                  </p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
                    <User className="w-10 h-10 text-gray-400" />
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 mb-2">Пользователь не найден</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500">Введите номер для проверки доверия</p>
                </div>
              )}
            </div>

            {/* Summary Card */}
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl p-6 backdrop-blur-sm bg-gradient-to-br from-white/90 to-white/70 dark:from-gray-900/90 dark:to-gray-900/70">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"></div>
                Сводка
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-gray-600 dark:text-gray-400">Сумма</span>
                  <span className="text-xl font-bold text-gray-900 dark:text-white">
                    {amount ? `${formatMoneyRUB(amount)} ₽` : "0 ₽"}
                  </span>
                </div>
                
                <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-gray-600 dark:text-gray-400">Получатель</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right">
                    {name || "Не указано"}
                  </span>
                </div>
                
                <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-gray-600 dark:text-gray-400">Телефон</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatPhoneNumberForDisplay(phone)}
                  </span>
                </div>
                
                {dueDate && (
                  <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
                    <span className="text-gray-600 dark:text-gray-400">Срок возврата</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      {new Date(dueDate).toLocaleDateString('ru-RU')}
                    </span>
                  </div>
                )}
                
                <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-gray-600 dark:text-gray-400">Напоминания</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {reminders.filter(Boolean).length} из 3
                  </span>
                </div>
                
                {description && (
                  <div className="py-3">
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Описание</div>
                    <p className="text-gray-700 dark:text-gray-300 line-clamp-3">{description}</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Status Info Card */}
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl p-6 backdrop-blur-sm bg-gradient-to-br from-white/90 to-white/70 dark:from-gray-900/90 dark:to-gray-900/70">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"></div>
                Статус системы
              </h3>
              
              <div className="space-y-3">
                <div className={`flex items-center justify-between p-3 rounded-xl ${
                  isOnline
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800'
                    : 'bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800'
                }`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      isOnline ? 'bg-emerald-500' : 'bg-orange-500 animate-pulse'
                    }`}></div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Соединение
                    </span>
                  </div>
                  <span className={`text-sm font-bold ${
                    isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-600 dark:text-orange-400'
                  }`}>
                    {isOnline ? 'Онлайн' : 'Оффлайн'}
                  </span>
                </div>
                
                <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Режим создания
                    </span>
                  </div>
                  <span className={`text-sm font-bold ${
                    identity ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'
                  }`}>
                    {identity ? 'Существующий контакт' : 'Новый контакт'}
                  </span>
                </div>
                
                {/* В Status Info Card добавьте: */}
<div className="p-3 text-xs text-gray-500 dark:text-gray-400 rounded-xl bg-gray-50 dark:bg-gray-800/50">
  <p className="mb-1">ℹ️ {isOnline ? 'Создание долга в реальном времени' : 'Долг будет создан при подключении'}</p>
  {!isOnline && (
    <div className="space-y-1 mt-2">
      <p className="flex items-center gap-1">
        <span className="text-orange-500">•</span>
        <span>Очередь синхронизации:</span>
        <span className="font-bold text-orange-600 dark:text-orange-400">
          {(() => {
            try {
              const pending = JSON.parse(localStorage.getItem('pendingDebts') || '[]');
              return pending.length;
            } catch {
              return 0;
            }
          })()} долгов
        </span>
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 italic">
        Долги будут отправлены автоматически при восстановлении соединения
      </p>
    </div>
  )}
</div>
              </div>
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  isOnline 
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 animate-pulse' 
                    : 'bg-gradient-to-r from-orange-500 to-yellow-500 animate-pulse'
                }`}></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {isOnline ? 'Система активна' : 'Оффлайн режим'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {identity ? 'Контакт найден' : 'Поиск контакта'}
                </span>
              </div>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Trust System v3.0 • Baqqol App
            </div>
          </div>
        </div>
      </div>

      {/* Add custom styles */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
            height: 0;
          }
          to {
            opacity: 1;
            transform: translateY(0);
            height: auto;
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        
        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }
        
        .line-clamp-3 {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(0.5);
          cursor: pointer;
        }
        
        .dark input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(1);
        }
      `}</style>
    </div>
  );
}