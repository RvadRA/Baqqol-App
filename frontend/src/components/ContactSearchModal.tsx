
// components/ContactSearchModal.tsx
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { 
  Search, 
  Users, 
  Phone, 
  ChevronRight, 
  X, 
  Shield, 
  Loader2,
  UserPlus,
  AlertCircle,
  Clock,
  Save,
  WifiOff,
  
} from "lucide-react";

interface ContactSearchResult {
  type: "local" | "global";
  identityId: string;
  name: string;
  phone: string;
  trustScore?: number;
  isRegistered?: boolean;
  hasExistingChat: boolean;
}

interface ContactSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ContactSearchModal({ isOpen, onClose }: ContactSearchModalProps) {
  const navigate = useNavigate();
    const { user } = useAuth(); 

  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<ContactSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showCreateContact, setShowCreateContact] = useState(false);
  const [creatingContact, setCreatingContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [offlineResults, setOfflineResults] = useState<ContactSearchResult[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
    
    // Загружаем оффлайн кэш контактов
    if (isOpen) {
      loadOfflineContacts();
    }

    // Проверяем онлайн статус
    const handleOnline = () => {
      console.log('🟢 Search modal: App is online');
      setIsOnline(true);
    };
    
    const handleOffline = () => {
      console.log('🔴 Search modal: App is offline');
      setIsOnline(false);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isOpen]);

  // Загружаем контакты из оффлайн кэша
  const loadOfflineContacts = () => {
    try {
      const cached = localStorage.getItem('contactSearchCache');
      if (cached) {
        const cachedContacts = JSON.parse(cached);
        setOfflineResults(cachedContacts);
        console.log('📂 Loaded offline contacts:', cachedContacts.length);
      }
    } catch (error) {
      console.error('Error loading offline contacts:', error);
    }
  };

  // Сохраняем результаты поиска в кэш
  const saveToSearchCache = (contacts: ContactSearchResult[]) => {
    try {
      localStorage.setItem('contactSearchCache', JSON.stringify(contacts));
      console.log('💾 Saved to search cache:', contacts.length, 'contacts');
    } catch (error) {
      console.error('Error saving search cache:', error);
    }
  };

  // Нормализуем номер телефона для поиска
  // В ContactSearchModal.tsx обновите функцию normalizePhoneForSearch:
const normalizePhoneForSearch = (phone: string): string => {
  // Убираем все нецифровые символы, кроме плюса в начале
  const cleaned = phone.replace(/\D/g, '');
  
  // Если номер начинается с 8, заменяем на +7
  if (cleaned.startsWith('8') && cleaned.length >= 11) {
    return '+7' + cleaned.substring(1);
  }
  
  // Если номер начинается с 7 и нет плюса, добавляем +
  if (cleaned.startsWith('7') && !phone.startsWith('+') && cleaned.length >= 11) {
    return '+' + cleaned;
  }
  
  // Если номер начинается с +7, оставляем как есть
  if (phone.startsWith('+7')) {
    return phone.replace(/\D/g, '').replace(/^7/, '+7');
  }
  
  // Если номер короткий (без кода страны), добавляем +7
  if (cleaned.length === 10) {
    return '+7' + cleaned;
  }
  
  // Если уже начинается с плюса, оставляем
  if (phone.startsWith('+')) {
    return phone;
  }
  
  // Иначе просто добавляем плюс
  return '+' + cleaned;
};

  // Debounce search query
  useEffect(() => {
    if (!isOpen) return;
    
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, isOpen]);

  // Search contacts
  useEffect(() => {
    const searchContacts = async () => {
      // Check if query is valid for search
      const trimmedQuery = debouncedQuery.trim();
      
      // Если запрос пустой или слишком короткий
      if (!trimmedQuery || trimmedQuery.length < 2) {
        setResults([]);
        setError(null);
        setShowCreateContact(false);
        return;
      }

      // Если оффлайн, ищем в кэше
      if (!isOnline) {
        searchOffline(trimmedQuery);
        return;
      }

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      
      setLoading(true);
      setError(null);
      setShowCreateContact(false);
      
      try {
        // Нормализуем телефон для поиска
        const normalizedPhone = normalizePhoneForSearch(trimmedQuery);
        const nameSearch = trimmedQuery.replace(/[^\p{L}\s]/gu, '');
        
        // Определяем, что искать
        let searchQuery = nameSearch.length > 0 ? nameSearch : normalizedPhone;
        
        // Если поиск по телефону, проверяем длину
        if (nameSearch.length === 0 && normalizedPhone.length < 7) {
          setError("Для поиска по телефону нужно минимум 7 цифр");
          setResults([]);
          setLoading(false);
          return;
        }

        const response = await api.get(`/contact-chats/search`, {
          params: {
            q: searchQuery,
            limit: 20
          },
          signal: abortControllerRef.current.signal,
          timeout: 10000
        });
        // Filter out yourself from results
     const filteredResults = (response.data.contacts || []).filter((contact: ContactSearchResult) => {
      // Check if this contact is the current user
      // You need to get your own identityId somehow - either from auth context or API
      return contact.identityId !== user?.globalIdentityId; // or however you store your ID
    });
        // Remove duplicates based on identityId
  const uniqueResults = filteredResults.reduce((acc: ContactSearchResult[], current: ContactSearchResult) => {
      const exists = acc.find(item => item.identityId === current.identityId);
      if (!exists) {
        acc.push(current);
      }
      return acc;
    }, []);
        
        setResults(uniqueResults);
        
        // Сохраняем в кэш
        saveToSearchCache(uniqueResults);
        
        // Если контакты не найдены и есть телефон (цифры), показываем кнопку создания
        const phoneDigits = trimmedQuery.replace(/\D/g, '');
        if (uniqueResults.length === 0 && phoneDigits.length >= 7) {
          setShowCreateContact(true);
          if (nameSearch.length === 0) {
            // По умолчанию имя пустое, чтобы пользователь сам ввел
            setNewContactName("");
          } else {
            setNewContactName(nameSearch);
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return;
        }
        
        // Если ошибка сети, пробуем оффлайн поиск
        if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
          console.log('Network error, falling back to offline search');
          searchOffline(trimmedQuery);
        } else {
          const errorMsg = err.response?.data?.message || err.message || "Ошибка поиска";
          
          if (errorMsg.includes("Regular expression") || 
              errorMsg.includes("quantifier") || 
              errorMsg.includes("invalid regular expression")) {
            setError("Попробуйте использовать более простой запрос");
          } else if (errorMsg.includes("timeout") || errorMsg.includes("Timeout") || err.code === 'ECONNABORTED') {
            setError("Поиск занял слишком много времени");
          } else {
            setError(errorMsg.length > 100 ? "Произошла ошибка при поиске" : errorMsg);
          }
          
          setResults([]);
          setShowCreateContact(false);
        }
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      searchContacts();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [debouncedQuery, isOpen, isOnline]);

  // Оффлайн поиск в кэше
  const searchOffline = (query: string) => {
    setLoading(false);
    setError(null);
    setShowCreateContact(false);
    
    const normalizedQuery = normalizePhoneForSearch(query);
    
    const filtered = offlineResults.filter(contact => {
      const normalizedContactPhone = normalizePhoneForSearch(contact.phone);
      return contact.name.toLowerCase().includes(query.toLowerCase()) ||
             normalizedContactPhone.includes(normalizedQuery) ||
             contact.phone.includes(query);
    });
    
    setResults(filtered);
    
    // Если нет результатов и есть телефон, показываем создание (сохраняем в очередь)
    const phoneDigits = query.replace(/\D/g, '');
    if (filtered.length === 0 && phoneDigits.length >= 7) {
      setShowCreateContact(true);
      setNewContactName(query.replace(/\d/g, '').trim()); // По умолчанию пустое имя
    } else if (filtered.length === 0) {
      setError("Контакт не найден в оффлайн кэше");
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

const handleContactClick = async (contact: ContactSearchResult) => {
  try {
    console.log("Selected contact:", contact);
    
    // Проверяем оффлайн режим
    if (!isOnline && !contact.hasExistingChat) {
      alert('Создание нового чата недоступно в оффлайн режиме');
      onClose();
      return;
    }
    
    // **FIXED LOGIC**: If chat exists, navigate to chat page
    // If no chat exists, navigate to "by-contact" to create one
    if (contact.hasExistingChat) {
      // We need to get the actual chat ID first
      try {
        const response = await api.get(`/contact-chats/by-contact/${contact.identityId}`);
        navigate(`/contact-chats/${response.data.chat.chatId}`);
      } catch (error) {
        console.error("Error getting chat:", error);
        // Fallback: navigate to create chat route
        navigate(`/contact-chats/by-contact/${contact.identityId}`);
      }
    } else {
      // Navigate to create chat route
      navigate(`/contact-chats/by-contact/${contact.identityId}`);
    }
    
    onClose();
  } catch (error) {
    console.error("Error handling contact click:", error);
  }
};

  const createNewContact = async () => {
  if (!searchQuery.trim()) return;
  
  // Если оффлайн, сохраняем в очередь
  if (!isOnline) {
    saveContactToQueue();
    return;
  }
  
  try {
    setCreatingContact(true);
    
    // Извлекаем и нормализуем телефон
    const phoneDigits = searchQuery.replace(/\D/g, '');
    let normalizedPhone = normalizePhoneForSearch(phoneDigits);
    
    // Убедимся, что номер сохранен в формате +7XXXXXXXXXX
    if (normalizedPhone.startsWith('7') && !normalizedPhone.startsWith('+')) {
      normalizedPhone = '+' + normalizedPhone;
    } else if (normalizedPhone.startsWith('8')) {
      normalizedPhone = '+7' + normalizedPhone.substring(1);
    } else if (!normalizedPhone.startsWith('+')) {
      normalizedPhone = '+' + normalizedPhone;
    }
    
    // Если телефон слишком короткий
    if (normalizedPhone.replace(/\D/g, '').length < 11) {
      setError("Номер телефона должен содержать минимум 11 цифр");
      setCreatingContact(false);
      return;
    }
    
    // Проверяем имя контакта
    const contactName = newContactName.trim() || `Контакт ${formatPhoneNumberForDisplay(normalizedPhone)}`;
    
    console.log('Создание контакта:', {
      name: contactName,
      phone: normalizedPhone,
      original: searchQuery
    });
    
    // Создаем локальный контакт
    const response = await api.post('/customers', {
      name: contactName,
      phone: normalizedPhone // Сохраняем в формате +7XXXXXXXXXX
    });
    
    console.log('Ответ сервера:', response.data);
    
    // Создаем чат с новым контактом
    const contactId = response.data.targetIdentityId;
    const chatResponse = await api.get(`/contact-chats/by-contact/${contactId}`);
    
    navigate(`/contact-chats/${chatResponse.data.chat.chatId}`);
    onClose();
    
  } catch (error: any) {
    console.error("Error creating contact:", error);
    setError(error.response?.data?.message || "Ошибка при создании контакта");
  } finally {
    setCreatingContact(false);
  }
};

  // Сохраняем контакт в очередь для синхронизации
 const saveContactToQueue = () => {
  const phoneDigits = searchQuery.replace(/\D/g, '');
  let normalizedPhone = normalizePhoneForSearch(phoneDigits);
  
  // Убедимся, что номер сохранен в формате +7XXXXXXXXXX
  if (normalizedPhone.startsWith('7') && !normalizedPhone.startsWith('+')) {
    normalizedPhone = '+' + normalizedPhone;
  } else if (normalizedPhone.startsWith('8')) {
    normalizedPhone = '+7' + normalizedPhone.substring(1);
  } else if (!normalizedPhone.startsWith('+')) {
    normalizedPhone = '+' + normalizedPhone;
  }
  
  if (normalizedPhone.replace(/\D/g, '').length < 11) {
    setError("Номер телефона должен содержать минимум 11 цифр");
    return;
  }
  
  try {
    // Загружаем существующую очередь
    const pendingContacts = JSON.parse(localStorage.getItem('pendingContacts') || '[]');
    
    const contactName = newContactName.trim() || `Контакт ${formatPhoneNumberForDisplay(normalizedPhone)}`;
    
    const newContact = {
      name: contactName,
      phone: normalizedPhone, // Сохраняем в формате +7XXXXXXXXXX
      timestamp: new Date().toISOString(),
      id: `pending_${Date.now()}`
    };
    
    pendingContacts.push(newContact);
    localStorage.setItem('pendingContacts', JSON.stringify(pendingContacts));
    
    alert('Контакт сохранен в очередь и будет создан при подключении к интернету');
    onClose();
  } catch (error) {
    setError("Ошибка сохранения контакта");
  }
};

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    if (/^[\p{L}\d\s+()-]*$/u.test(value)) {
      setSearchQuery(value);
      setError(null);
      setShowCreateContact(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setResults([]);
    setError(null);
    setShowCreateContact(false);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (searchQuery) {
        handleClearSearch();
      } else {
        onClose();
      }
    }
    if (e.key === 'Enter' && showCreateContact && !loading) {
      createNewContact();
    }
  };

  // Format phone number for display
 // В ContactSearchModal.tsx обновите formatPhoneNumberForDisplay:
const formatPhoneNumberForDisplay = (phone: string) => {
  if (!phone) return "";
  
  // Если номер уже начинается с +7, форматируем красиво
  if (phone.startsWith('+7') && phone.length === 12) {
    const digits = phone.substring(2); // убираем +7
    const match = digits.match(/^(\d{3})(\d{3})(\d{2})(\d{2})$/);
    if (match) {
      return `+7 ${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
    }
  }
  
  // Если номер начинается с 7 (без плюса), добавляем плюс
  if (phone.startsWith('7') && phone.length === 11) {
    const match = phone.match(/^7(\d{3})(\d{3})(\d{2})(\d{2})$/);
    if (match) {
      return `+7 ${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
    }
  }
  
  // Если номер начинается с 8, заменяем на +7
  if (phone.startsWith('8') && phone.length === 11) {
    const match = phone.match(/^8(\d{3})(\d{3})(\d{2})(\d{2})$/);
    if (match) {
      return `+7 ${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
    }
  }
  
  // Для других форматов просто возвращаем как есть
  return phone;
};

  // Получить форматированный номер из searchQuery
  const getFormattedPhoneFromQuery = () => {
    const phoneDigits = searchQuery.replace(/\D/g, '');
    const normalizedPhone = normalizePhoneForSearch(phoneDigits);
    return formatPhoneNumberForDisplay(normalizedPhone);
  };

  // Проверить, есть ли в запросе цифры для создания контакта
  const hasPhoneDigits = searchQuery.replace(/\D/g, '').length >= 7;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200]">
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
        <div 
          ref={modalRef}
          className="w-full max-w-2xl bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 border-b border-slate-800/50">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6 text-purple-400" />
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    Найти контакт
                  </h2>
                  {!isOnline && (
                    <div className="flex items-center gap-2 mt-1">
                      <WifiOff className="w-4 h-4 text-orange-400" />
                      <span className="text-sm text-orange-400">Оффлайн режим</span>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-slate-800/50 transition-colors"
                aria-label="Закрыть поиск"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {/* Search Input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-500" />
              </div>
              <input
                ref={searchInputRef}
                type="tel"
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleKeyDown}
                placeholder={isOnline ? "Введите имя или номер телефона..." : "Поиск в оффлайн кэше..."}
                className="w-full pl-10 pr-10 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-transparent"
                autoFocus
                disabled={!isOnline && offlineResults.length === 0}
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center hover:text-gray-300 transition-colors"
                  aria-label="Очистить поиск"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              )}
            </div>
            
            {/* Search Info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-2 gap-2">
              <p className="text-sm text-gray-400">
                {searchQuery && debouncedQuery.length >= 2 && !loading && (
                  <>
                    {!isOnline && offlineResults.length > 0 && (
                      <span className="text-orange-400">Оффлайн • </span>
                    )}
                    Найдено: <span className="text-white font-medium">{results.length}</span> контактов
                  </>
                )}
                {searchQuery && searchQuery.length > 0 && searchQuery.length < 2 && (
                  <span className="text-amber-400">Введите минимум 2 символа</span>
                )}
                {!isOnline && offlineResults.length === 0 && (
                  <span className="text-orange-400">Оффлайн кэш пуст</span>
                )}
              </p>
              {loading && (
                <div className="flex items-center gap-2 text-sm text-purple-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Поиск...</span>
                </div>
              )}
            </div>
            
            {/* Error Display */}
            {error && (
              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-400 flex items-center gap-2">
                  <X className="w-4 h-4 flex-shrink-0" />
                  {error}
                </p>
              </div>
            )}
          </div>

          {/* Results */}
          <div className="overflow-y-auto max-h-[60vh]">
            {loading && results.length === 0 ? (
              <div className="p-12 text-center">
                <div className="inline-block relative">
                  <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
                </div>
                <p className="mt-4 text-gray-400">Поиск контактов...</p>
                <p className="text-sm text-gray-500 mt-2">Ищем по вашему запросу</p>
              </div>
            ) : error && results.length === 0 && searchQuery && debouncedQuery.length >= 2 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                  <X className="w-6 h-6 text-red-400" />
                </div>
                <p className="text-white font-medium mb-2">Ошибка поиска</p>
                <p className="text-gray-400 mb-4">{error}</p>
                <button
                  onClick={handleClearSearch}
                  className="px-4 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-gray-300 hover:text-white transition-colors text-sm"
                >
                  Очистить поиск
                </button>
              </div>
            ) : showCreateContact && !loading ? (
              <div className="p-6">
                <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6 mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      isOnline 
                        ? 'bg-gradient-to-br from-purple-600 to-blue-600' 
                        : 'bg-gradient-to-br from-orange-600 to-yellow-600'
                    }`}>
                      {isOnline ? (
                        <UserPlus className="w-6 h-6 text-white" />
                      ) : (
                        <Save className="w-6 h-6 text-white" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-white font-medium">
                        {isOnline ? 'Создать новый контакт' : 'Сохранить контакт'}
                      </h3>
                      <p className="text-sm text-gray-400">
                        {isOnline 
                          ? 'Контакт не найден в системе' 
                          : 'Контакт будет создан при подключении к интернету'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Имя контакта
                      </label>
                      <input
                        type="text"
                        value={newContactName}
                        onChange={(e) => {
      const input = e.target.value;
      const capitalized = input.charAt(0).toUpperCase() + input.slice(1);
      setNewContactName(capitalized);
    }}
                        placeholder="Введите имя (например: Иван)"
                        className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                      />
                      {!newContactName.trim() && (
                        <p className="text-xs text-gray-500 mt-1">
                          Если оставить пустым, будет использовано: Контакт {getFormattedPhoneFromQuery()}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Номер телефона
                      </label>
                      <div className="flex items-center gap-2 p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <span className="text-white font-medium">
                          {getFormattedPhoneFromQuery()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Номер будет сохранен в международном формате
                      </p>
                    </div>
                    
                    <div className={`rounded-lg p-3 ${
                      isOnline 
                        ? 'bg-blue-500/10 border border-blue-500/20' 
                        : 'bg-orange-500/10 border border-orange-500/20'
                    }`}>
                      <div className="flex items-start gap-2">
                        <AlertCircle className={`w-4 h-4 ${
                          isOnline ? 'text-blue-400' : 'text-orange-400'
                        } mt-0.5 flex-shrink-0`} />
                        <p className={`text-sm ${
                          isOnline ? 'text-blue-400' : 'text-orange-400'
                        }`}>
                          {isOnline 
                            ? 'Контакт будет добавлен в вашу адресную книгу. Вы сможете общаться в чате после создания.'
                            : 'Контакт сохранен в локальную очередь. Он будет автоматически создан при восстановлении соединения.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={onClose}
                    disabled={creatingContact}
                    className="flex-1 px-4 py-3 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 text-gray-300 hover:text-white transition-colors disabled:opacity-50"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={createNewContact}
                    disabled={creatingContact}
                    className={`flex-1 px-4 py-3 rounded-xl text-white font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                      isOnline
                        ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'
                        : 'bg-gradient-to-r from-orange-600 to-yellow-600 hover:from-orange-700 hover:to-yellow-700'
                    }`}
                  >
                    {creatingContact ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Создание...
                      </>
                    ) : (
                      <>
                        {isOnline ? <UserPlus className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        {isOnline ? 'Создать контакт и начать чат' : 'Сохранить в очередь'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : debouncedQuery.length >= 2 && results.length === 0 && !loading ? (
              <div className="p-8 text-center">
                <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${
                  isOnline 
                    ? 'bg-gradient-to-br from-purple-500/10 to-pink-500/10' 
                    : 'bg-gradient-to-br from-orange-500/10 to-yellow-500/10'
                }`}>
                  <Users className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-white font-medium mb-2">Контакты не найдены</p>
                <p className="text-gray-400 mb-3">По запросу "{debouncedQuery}" ничего не найдено</p>
                
                {/* Если в запросе есть телефон (цифры), показываем кнопку создания */}
                {hasPhoneDigits ? (
                  <div className="mt-6 max-w-md mx-auto">
                    <button
                      onClick={() => setShowCreateContact(true)}
                      className={`w-full px-4 py-3 rounded-xl text-white font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                        isOnline
                          ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'
                          : 'bg-gradient-to-r from-orange-600 to-yellow-600 hover:from-orange-700 hover:to-yellow-700'
                      }`}
                    >
                      {isOnline ? <UserPlus className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                      {isOnline ? 'Создать новый контакт' : 'Сохранить контакт'}
                    </button>
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      {isOnline 
                        ? 'Контакт будет добавлен в вашу адресную книгу' 
                        : 'Контакт будет создан при подключении к интернету'}
                    </p>
                  </div>
                ) : (
                  <div className="max-w-md mx-auto text-sm text-gray-500 space-y-2">
                    <p>Советы для поиска:</p>
                    <ul className="space-y-1 text-left pl-4">
                      <li className="flex items-center gap-2">
                        <span className="text-purple-400">•</span>
                        <span>Для телефонов используйте цифры (8 или +7)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-purple-400">•</span>
                        <span>Для имён используйте русские или английские буквы</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-purple-400">•</span>
                        <span>Для создания нового контакта введите номер телефона (минимум 7 цифр)</span>
                      </li>
                      {!isOnline && (
                        <li className="flex items-center gap-2">
                          <span className="text-orange-400">•</span>
                          <span>В оффлайн режиме поиск только по кэшированным данным</span>
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            ) : results.length > 0 ? (
              <div className="p-4 space-y-2">
                {results.map((contact) => (
                  <button
                    key={`${contact.type}-${contact.identityId}`}
                    onClick={() => handleContactClick(contact)}
                    className="w-full flex items-center gap-3 p-4 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/50 hover:border-slate-600/50 transition-all duration-200 group active:scale-[0.99]"
                    disabled={!isOnline && !contact.hasExistingChat}
                  >
                    <div className="relative flex-shrink-0">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold ${
                        !isOnline && !contact.hasExistingChat
                          ? 'bg-gradient-to-br from-gray-600 to-gray-700 opacity-70'
                          : 'bg-gradient-to-br from-purple-600 to-blue-600'
                      }`}>
                        {contact.name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      {contact.type === "local" && (
                        <Users className="absolute -bottom-1 -right-1 w-4 h-4 text-blue-400 bg-slate-900 rounded-full p-0.5" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-white font-medium truncate">
                          {contact.name || "Без имени"}
                        </p>
                        {contact.isRegistered && (
                          <Shield className="w-3 h-3 text-blue-400 flex-shrink-0" />
                        )}
                        {contact.hasExistingChat && (
                          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full flex-shrink-0">
                            есть чат
                          </span>
                        )}
                        {!isOnline && !contact.hasExistingChat && (
                          <span className="text-xs bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded-full flex-shrink-0">
                            оффлайн
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <p className="text-sm text-gray-400 truncate">
                          {formatPhoneNumberForDisplay(contact.phone)}
                        </p>
                      </div>
                      {contact.trustScore !== undefined && (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden flex-shrink-0">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${
                                contact.trustScore >= 70 ? 'bg-green-500' :
                                contact.trustScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(contact.trustScore, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {contact.trustScore}% доверия
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {isOnline || contact.hasExistingChat ? (
                      <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100" />
                    ) : (
                      <Clock className="w-5 h-5 text-gray-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${
                  isOnline 
                    ? 'bg-gradient-to-br from-purple-500/10 to-pink-500/10' 
                    : 'bg-gradient-to-br from-orange-500/10 to-yellow-500/10'
                }`}>
                  <Search className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-white font-medium mb-2">Начните поиск</p>
                <p className="text-gray-400 mb-4">
                  {isOnline 
                    ? 'Введите имя или телефон контакта для поиска' 
                    : 'Введите запрос для поиска в оффлайн кэше'}
                </p>
                <div className="max-w-md mx-auto space-y-3 text-sm text-gray-500">
                  <p>Примеры запросов:</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <span className="px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50">
                      Иван
                    </span>
                    <span className="px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50">
                      89631234567
                    </span>
                    <span className="px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50">
                      +7 963 123 45 67
                    </span>
                  </div>
                  <div className="pt-4 border-t border-slate-800/50">
                    <p className="text-gray-400 mb-2">📱 {isOnline ? 'Для создания нового контакта:' : 'В оффлайн режиме:'}</p>
                    <div className="text-xs space-y-1">
                      <p>• Введите номер телефона (минимум 7 цифр)</p>
                      <p>• {isOnline 
                          ? 'Если контакт не найден, сможете его создать' 
                          : 'Контакт сохранится в очередь для создания при подключении'}</p>
                      {!isOnline && (
                        <p>• Только поиск по ранее кэшированным контактам</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-slate-800/50">
            <div className="text-sm text-gray-400">
              <p className="flex items-center gap-2 mb-3">
                <span className={isOnline ? "text-purple-400" : "text-orange-400"}>💡</span>
                <span className="font-medium text-gray-300">
                  {isOnline ? 'Как работает поиск:' : 'Оффлайн режим:'}
                </span>
              </p>
              <ul className="space-y-2">
                {isOnline ? (
                  <>
                    <li className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0"></div>
                      <span>Поиск по <span className="text-blue-300">именам и фамилиям</span></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-400 mt-1.5 flex-shrink-0"></div>
                      <span>Поиск по <span className="text-green-300">номерам телефонов</span> (автоматическое преобразование форматов)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-purple-400 mt-1.5 flex-shrink-0"></div>
                      <span>Создание нового контакта, если не найден существующий</span>
                    </li>
                  </>
                ) : (
                  <>
                    <li className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-orange-400 mt-1.5 flex-shrink-0"></div>
                      <span>Поиск только по <span className="text-orange-300">ранее загруженным контактам</span></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-yellow-400 mt-1.5 flex-shrink-0"></div>
                      <span>Новые контакты сохраняются в <span className="text-yellow-300">очереди синхронизации</span></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-gray-400 mt-1.5 flex-shrink-0"></div>
                      <span>Открытие чатов доступно только для <span className="text-gray-300">существующих контактов</span></span>
                    </li>
                  </>
                )}
              </ul>
              <div className={`mt-4 p-3 rounded-lg ${
                isOnline 
                  ? 'bg-slate-800/30' 
                  : 'bg-orange-500/10 border border-orange-500/20'
              }`}>
                <p className={`text-xs mb-1 ${
                  isOnline ? 'text-gray-500' : 'text-orange-400'
                }`}>
                  {isOnline ? '💡 Важно:' : '⚠️ Ограничения оффлайн режима:'}
                </p>
                <p className={`text-xs ${
                  isOnline ? 'text-gray-400' : 'text-orange-400'
                }`}>
                  {isOnline 
                    ? 'Вы можете создать новый контакт, если его нет в системе. Контакт автоматически добавится в вашу адресную книгу.'
                    : 'Новые контакты будут созданы при восстановлении соединения. Открытие новых чатов недоступно.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}