// pages/ContactChatList.tsx
import { useEffect, useState, useRef,useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { socket } from "../socket";
import { getInitial } from "../utils/ui";
import ContactSearchModal from "../components/ContactSearchModal";
import { 
  Search, 
  MessageSquare, 
  Phone,
  Pin,
  Archive,
  BellOff,
  Filter,
  X,
  Users,
  UserPlus,
  ChevronRight,
  Shield,
  Wifi,
  WifiOff,
  RefreshCw,
  Database,
  CloudOff
} from "lucide-react";

interface ContactChatItem {
  chatId: string;
  otherParticipant: {
    identityId: string;
    name: string;
    localName?: string;
    phone: string;
    isRegistered: boolean;
  };
  lastMessage: string;
  lastMessageType?: "text" | "image" | "file" | "voice";
  lastAt: string;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  lastSynced?: string;
}

interface SyncQueueItem {
  type: 'update' | 'delete' | 'read';
  chatId: string;
  data: any;
  timestamp: number;
  retryCount: number;
}

export default function ContactChatList() {
  const navigate = useNavigate();
  const [chats, setChats] = useState<ContactChatItem[]>([]);
  const [filteredChats, setFilteredChats] = useState<ContactChatItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "pinned" | "archived">("all");
  const [loading, setLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([]);
  
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const syncRetryRef = useRef<NodeJS.Timeout | null>(null);

  // Инициализация и загрузка кэша
  useEffect(() => {
    // Загружаем кэш при монтировании
    loadCachedChats();
    
    // Проверяем онлайн статус
    const handleOnline = () => {
      console.log('🟢 App is online');
      setIsOnline(true);
      syncOfflineChanges();
    };
    
    const handleOffline = () => {
      console.log('🔴 App is offline');
      setIsOnline(false);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Загружаем свежие данные если онлайн
    if (navigator.onLine) {
      loadContactChats();
      loadSyncQueue();
    }
    
    // Настраиваем периодическую синхронизацию
    const syncInterval = setInterval(() => {
      if (navigator.onLine && syncQueue.length > 0) {
        syncOfflineChanges();
      }
    }, 30000); // Каждые 30 секунд
    
    setupSocketListeners();
    
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setShowFilterMenu(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(syncInterval);
      if (syncRetryRef.current) {
        clearTimeout(syncRetryRef.current);
      }
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
// В ContactChatList.tsx добавьте функцию:
const formatPhoneForDisplay = (phone: string) => {
  if (!phone) return "";
  
  // Если номер в формате +7XXXXXXXXXX
  if (phone.startsWith('+7') && phone.length === 12) {
    const digits = phone.substring(2); // убираем +7
    const match = digits.match(/^(\d{3})(\d{3})(\d{2})(\d{2})$/);
    if (match) {
      return `+7 ${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
    }
  }
  
  // Если номер в формате 7XXXXXXXXXX
  if (phone.startsWith('7') && phone.length === 11) {
    const match = phone.match(/^7(\d{3})(\d{3})(\d{2})(\d{2})$/);
    if (match) {
      return `+7 ${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
    }
  }
  
  // Если номер в формате 8XXXXXXXXXX
  if (phone.startsWith('8') && phone.length === 11) {
    const match = phone.match(/^8(\d{3})(\d{3})(\d{2})(\d{2})$/);
    if (match) {
      return `+7 ${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
    }
  }
  
  // Для других форматов
  return phone;
};

// Используйте в отображении:
// Добавьте этот эффект после других useEffect
useEffect(() => {
  // Обновляем имена при изменении кэша customers
  const updateNamesFromCustomersCache = () => {
    if (chats.length === 0) return;
    
    const updatedChats = chats.map(chat => {
      const localName = getCustomerLocalName(
        chat.otherParticipant.phone,
        chat.otherParticipant.identityId,
        chat.otherParticipant.name
      );
      
      // Если localName отличается от текущего имени, обновляем
      if (localName && localName !== chat.otherParticipant.name) {
        return {
          ...chat,
          otherParticipant: {
            ...chat.otherParticipant,
            name: localName,
            localName: localName
          }
        };
      }
      return chat;
    });
    
    setChats(updatedChats);
    saveToCache(updatedChats);
  };
  
  // Обновляем при монтировании
  updateNamesFromCustomersCache();
  
  // Слушаем изменения localStorage
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === 'customers_cache') {
      console.log('🔄 Customers cache updated, updating contact chat names');
      updateNamesFromCustomersCache();
    }
  };
  
  window.addEventListener('storage', handleStorageChange);
  
  return () => {
    window.removeEventListener('storage', handleStorageChange);
  };
}, [chats.length]); // Зависимость только от длины массива
  // Загрузка чатов из кэша
const loadCachedChats = () => {
  try {
    const cached = localStorage.getItem('contactChatsCache');
    const cachedTime = localStorage.getItem('contactChatsCacheTime');
    
    if (cached) {
      const parsedChats: ContactChatItem[] = JSON.parse(cached);
      console.log('📂 Loaded cached chats:', parsedChats.length);
      
      // Добавляем localName к кэшированным данным
      const enrichedChats = parsedChats.map(chat => {
        const localName = getCustomerLocalName(
          chat.otherParticipant.phone,
          chat.otherParticipant.identityId,
          chat.otherParticipant.name
        );
        
        return {
          ...chat,
          otherParticipant: {
            ...chat.otherParticipant,
            name: localName || chat.otherParticipant.name,
            localName: localName
          }
        };
      });
      
      setChats(enrichedChats);
      
      if (cachedTime) {
        setLastSyncTime(new Date(cachedTime).toLocaleTimeString());
      }
      
      // Применяем фильтрацию к загруженным данным
      applyFiltersAndSearch(enrichedChats);
      
      return enrichedChats;
    }
  } catch (error) {
    console.error('Error loading cached chats:', error);
  }
  return [];
};

  // Применение фильтров и поиска
  const applyFiltersAndSearch = (chatsToFilter: ContactChatItem[]) => {
    let filtered = [...chatsToFilter];
    
    // Поиск
     if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(chat => {
      const nameMatch = chat.otherParticipant.name?.toLowerCase().includes(query) || false;
      const localNameMatch = chat.otherParticipant.localName?.toLowerCase().includes(query) || false;
      const phoneMatch = chat.otherParticipant.phone?.includes(searchQuery) || false;
      const messageMatch = chat.lastMessage?.toLowerCase().includes(query) || false;
      return nameMatch || localNameMatch || phoneMatch || messageMatch;
    });
  }
    
    // Фильтры
    switch (filter) {
      case "unread":
        filtered = filtered.filter(chat => chat.unreadCount > 0);
        break;
      case "pinned":
        filtered = filtered.filter(chat => chat.isPinned);
        break;
      case "archived":
        filtered = filtered.filter(chat => chat.isArchived);
        break;
      case "all":
      default:
        filtered = filtered.filter(chat => !chat.isArchived);
        break;
    }
    
    setFilteredChats(filtered);
  };

  // Эффект для фильтрации при изменении данных
  useEffect(() => {
    applyFiltersAndSearch(chats);
  }, [chats, searchQuery, filter]);

  // Сохранение чатов в кэш
  const saveToCache = (chatsData: ContactChatItem[]) => {
     try {
    // Убедимся, что localName сохраняется
    const chatsToSave = chatsData.map(chat => ({
      ...chat,
      otherParticipant: {
        ...chat.otherParticipant,
        localName: chat.otherParticipant.localName || 
                 getCustomerLocalName(
                   chat.otherParticipant.phone,
                   chat.otherParticipant.identityId,
                   chat.otherParticipant.name
                 )
      }
    }));
      localStorage.setItem('contactChatsCache', JSON.stringify(chatsToSave));
      localStorage.setItem('contactChatsCacheTime', new Date().toISOString());
      console.log('💾 Saved to cache:', chatsToSave.length, 'chats');
    } catch (error) {
      console.error('Error saving to cache:', error);
    }
  };

  // Загрузка очереди синхронизации
  const loadSyncQueue = () => {
    try {
      const queue = localStorage.getItem('contactChatsSyncQueue');
      if (queue) {
        const parsedQueue = JSON.parse(queue);
        setSyncQueue(parsedQueue);
        console.log('📋 Loaded sync queue:', parsedQueue.length, 'items');
      }
    } catch (error) {
      console.error('Error loading sync queue:', error);
    }
  };

  // Сохранение очереди синхронизации
  const saveSyncQueue = (queue: SyncQueueItem[]) => {
    try {
      localStorage.setItem('contactChatsSyncQueue', JSON.stringify(queue));
      setSyncQueue(queue);
    } catch (error) {
      console.error('Error saving sync queue:', error);
    }
  };

  // Добавление в очередь синхронизации
  const addToSyncQueue = (item: SyncQueueItem) => {
    const newQueue = [...syncQueue, { ...item, timestamp: Date.now(), retryCount: 0 }];
    saveSyncQueue(newQueue);
    
    // Если онлайн, сразу пытаемся синхронизировать
    if (isOnline) {
      syncOfflineChanges();
    }
  };

  // Синхронизация оффлайн изменений
  const syncOfflineChanges = async () => {
    if (!isOnline || isSyncing || syncQueue.length === 0) return;
    
    setIsSyncing(true);
    console.log('🔄 Syncing offline changes...');
    
    const queueCopy = [...syncQueue];
    const failedItems: SyncQueueItem[] = [];
    
    for (const item of queueCopy) {
      try {
        // Ограничиваем количество попыток
        if (item.retryCount >= 3) {
          console.warn(`Max retries reached for item:`, item);
          continue;
        }
        
        switch (item.type) {
          case 'update':
            await api.put(`/contact-chats/${item.chatId}/sync`, item.data);
            break;
          case 'read':
            await api.post(`/contact-chats/${item.chatId}/mark-read`, item.data);
            break;
          case 'delete':
            await api.delete(`/contact-chats/${item.chatId}`);
            break;
        }
        
        console.log(`✅ Synced item: ${item.type} for chat ${item.chatId}`);
      } catch (error) {
        console.error(`❌ Failed to sync item:`, error);
        failedItems.push({ ...item, retryCount: item.retryCount + 1 });
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    saveSyncQueue(failedItems);
    
    if (failedItems.length < queueCopy.length) {
      await loadContactChats();
    }
    
    setIsSyncing(false);
    console.log('✅ Sync completed');
  };

  const loadContactChats = async () => {
    if (!isOnline) {
      console.log('📴 Offline mode, using cached data');
      return;
    }
    
    try {
      setLoading(true);
      console.log('🌐 Loading contact chats from server...');
      
      const response = await api.get("/contact-chats", {
        timeout: 10000,
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      const chatsData = response.data || [];
      console.log("Loaded chats from server:", chatsData.length);
      
         const updatedChats = chatsData.map((chat: ContactChatItem) => {
      const localName = getCustomerLocalName(
        chat.otherParticipant.phone,
        chat.otherParticipant.identityId,
        chat.otherParticipant.name
      );
      
      return {
        ...chat,
        otherParticipant: {
          ...chat.otherParticipant,
          name: localName || chat.otherParticipant.name,
          localName: localName
        },
        lastSynced: new Date().toISOString()
      };
    });
      
      const sortedChats = [...updatedChats].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime();
      });
      
      setChats(sortedChats);
      saveToCache(sortedChats);
      setLastSyncTime(new Date().toLocaleTimeString());
      
      await markAllAsReadIfNeeded(sortedChats);
      
    } catch (error: any) {
      console.error("Error loading contact chats:", error);
      
      if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        console.log('Using cached data due to network error');
        const cached = loadCachedChats();
         if (cached.length > 0) {
        const updatedCached = cached.map((chat: ContactChatItem) => {
          const localName = getCustomerLocalName(
            chat.otherParticipant.phone,
            chat.otherParticipant.identityId,
            chat.otherParticipant.name
          );
          
          return {
            ...chat,
            otherParticipant: {
              ...chat.otherParticipant,
              name: localName || chat.otherParticipant.name,
              localName: localName
            }
          };
        });
        
        setChats(updatedCached);
        applyFiltersAndSearch(updatedCached);
      }
    }
    } finally {
      setLoading(false);
    }
  };
// Вспомогательная функция для получения localName
const getCustomerLocalName = useCallback((phone?: string, id?: string, defaultName?: string) => {
  if (!phone && !id) return defaultName || "Без имени";
  
  try {
    const cached = localStorage.getItem('customers_cache');
    if (cached) {
      const customersData = JSON.parse(cached);
      const customers = customersData.customers || [];
      
      // Ищем по телефону
      if (phone) {
        const customer = customers.find((c: any) => c.phone === phone);
        if (customer?.localName) {
          return customer.localName;
        }
      }
      
      // Ищем по ID
      if (id) {
        const customer = customers.find((c: any) => 
          c._id === id || 
          c.targetIdentityId === id
        );
        if (customer?.localName) {
          return customer.localName;
        }
      }
    }
  } catch (error) {
    console.error('Error getting local name:', error);
  }
  
  return defaultName || "Без имени";
}, []);
 const markAllAsReadIfNeeded = async (chatsData: ContactChatItem[]) => {
  const unreadChats = chatsData.filter(chat => chat.unreadCount > 0);
  
  for (const chat of unreadChats) {
    try {
      if (isOnline) {
        // Используем существующий маршрут
        await api.post(`/contact-chats/${chat.chatId}/read`); // Изменено с mark-all-read на read
      } else {
        addToSyncQueue({
          type: 'read',
          chatId: chat.chatId,
          data: { readAt: new Date().toISOString() },
          timestamp: Date.now(),
          retryCount: 0
        });
      }
    } catch (error) {
      console.error(`Error marking chat ${chat.chatId} as read:`, error);
    }
  }
};
  const setupSocketListeners = () => {
    if (!socket.connected && isOnline) {
      socket.connect();
    }
    
    const handleChatListUpdated = (data: any) => {
      console.log('📬 Chat list updated via socket');
      if (isOnline) {
        loadContactChats();
      } else {
        const updatedChats = chats.map(chat => 
          chat.chatId === data.chatId ? { ...chat, ...data.updates } : chat
        );
        setChats(updatedChats);
        saveToCache(updatedChats);
      }
    };
    
    const handleNewContactMessage = (data: any) => {
      console.log('💬 New message via socket');
      if (isOnline) {
        loadContactChats();
      } else {
        const existingChatIndex = chats.findIndex(c => c.chatId === data.chatId);
        if (existingChatIndex >= 0) {
          const updatedChats = [...chats];
          updatedChats[existingChatIndex] = {
            ...updatedChats[existingChatIndex],
            lastMessage: data.message?.content || 'Новое сообщение',
            lastMessageType: data.message?.type || 'text',
            lastAt: data.message?.createdAt || new Date().toISOString(),
            unreadCount: updatedChats[existingChatIndex].unreadCount + 1
          };
          setChats(updatedChats);
          saveToCache(updatedChats);
        }
      }
    };
    
    if (socket.connected) {
      socket.on("contact-chat:list-updated", handleChatListUpdated);
      socket.on("contact-chat:new-message", handleNewContactMessage);
    }
    
    return () => {
      if (socket.connected) {
        socket.off("contact-chat:list-updated", handleChatListUpdated);
        socket.off("contact-chat:new-message", handleNewContactMessage);
      }
    };
  };

  const handleChatClick = (chat: ContactChatItem) => {
    if (!chat.chatId) {
      console.error("Chat has no chatId:", chat);
      return;
    }
    
    navigate(`/contact-chats/${chat.chatId}`);
  };

  const formatTime = (dateString: string) => {
    if (!dateString) return "недавно";
    
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      
      if (diffHours < 24) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      } else if (diffHours < 48) {
        return "вчера";
      } else {
        return date.toLocaleDateString('ru-RU', { 
          day: 'numeric', 
          month: 'short'
        });
      }
    } catch (error) {
      return "недавно";
    }
  };

  const handleRefresh = async () => {
    if (isOnline) {
      await loadContactChats();
    } else {
      console.log('Offline mode - cannot refresh');
    }
  };

  const getFilterIcon = () => {
    switch (filter) {
      case "unread": return <MessageSquare className="w-4 h-4" />;
      case "pinned": return <Pin className="w-4 h-4" />;
      case "archived": return <Archive className="w-4 h-4" />;
      default: return <Filter className="w-4 h-4" />;
    }
  };

  const getFilterLabel = () => {
    switch (filter) {
      case "unread": return "Непрочитанные";
      case "pinned": return "Закреплённые";
      case "archived": return "Архив";
      default: return "Все чаты";
    }
  };

  // Обработчик изменения поиска
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  // Обработчик очистки поиска
  const handleClearSearch = () => {
    setSearchQuery("");
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const displayChats = filteredChats.length > 0 ? filteredChats : [];
  const showLoading = loading && chats.length === 0 && isOnline;
  const hasCachedData = chats.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950 lg:pt-0 safe-area-inset-bottom">
      {/* Desktop Header with Status Bar */}
      <div className="hidden lg:pt-16 lg:block left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/50">
        {/* Status Bar */}
        <div className="px-6 py-2 bg-slate-900/80 border-b border-slate-800/50">
          <div className="max-w-6xl mx-auto flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${isOnline ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
                {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                <span>{isOnline ? 'Онлайн' : 'Оффлайн'}</span>
              </div>
              
              {lastSyncTime && (
                <div className="flex items-center gap-2 text-gray-400">
                  <Database className="w-4 h-4" />
                  <span>Обновлено: {lastSyncTime}</span>
                </div>
              )}
              
              {syncQueue.length > 0 && (
                <div className="flex items-center gap-2 text-yellow-400">
                  <CloudOff className="w-4 h-4" />
                  <span>{syncQueue.length} в очереди</span>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {isSyncing && (
                <div className="flex items-center gap-2 text-purple-400">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Синхронизация...</span>
                </div>
              )}
              
              <button
                onClick={handleRefresh}
                disabled={loading || isSyncing}
                className="p-2 rounded-lg hover:bg-slate-800/50 transition-colors disabled:opacity-50"
                title="Обновить"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Main Header */}
        <div className="px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <Users className="w-6 h-6 text-purple-400" />
                Контакты
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                {isOnline ? 'Общайтесь с любыми контактами в системе' : 'Оффлайн режим. Данные из кэша'}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {!isOnline && (
                <div className="px-4 py-2 bg-orange-500/20 text-orange-400 rounded-xl flex items-center gap-2">
                  <WifiOff className="w-4 h-4" />
                  <span>Оффлайн</span>
                </div>
              )}
              
              <button
                onClick={() => setShowSearchModal(true)}
                disabled={!isOnline}
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold
                  bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700
                  text-white shadow-lg shadow-purple-500/25 transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UserPlus className="w-4 h-4" />
                Новый чат
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-50 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/50">
        {/* Mobile Status Bar */}
        <div className="px-4 py-2 bg-slate-900/80 border-b border-slate-800/50">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${isOnline ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                <span className="text-xs">{isOnline ? 'Онлайн' : 'Оффлайн'}</span>
              </div>
              
              {syncQueue.length > 0 && (
                <div className="flex items-center gap-2 text-yellow-400 text-xs">
                  <CloudOff className="w-3 h-3" />
                  <span>{syncQueue.length} в очереди</span>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {isSyncing && (
                <div className="flex items-center gap-2 text-purple-400 text-xs">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Синхронизация...</span>
                </div>
              )}
              <button
                onClick={handleRefresh}
                disabled={loading || isSyncing}
                className="p-2 rounded-lg hover:bg-slate-800/50 transition-colors disabled:opacity-50"
                title="Обновить"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Main Header */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-bold text-white">Контакты</h1>
              <p className="text-xs text-gray-500">
                {chats.filter(c => c.unreadCount > 0).length} непрочитанных
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="p-2 rounded-lg hover:bg-slate-800/50 transition-colors"
            >
              <Search className="w-5 h-5 text-gray-400" />
            </button>
            <div className="relative" ref={filterMenuRef}>
              <button
                onClick={() => setShowFilterMenu(!showFilterMenu)}
                className="p-2 rounded-lg hover:bg-slate-800/50 transition-colors flex items-center gap-1"
              >
                {getFilterIcon()}
                <span className="text-xs text-gray-400 hidden sm:inline">{getFilterLabel()}</span>
              </button>
              
              {showFilterMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900/95 backdrop-blur-xl rounded-xl border border-slate-700/50 shadow-2xl py-2 z-50">
                  <button
                    onClick={() => {
                      setFilter("all");
                      setShowFilterMenu(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                  >
                    <span>Все чаты</span>
                    {filter === "all" && <ChevronRight className="w-4 h-4 text-purple-400" />}
                  </button>
                  <button
                    onClick={() => {
                      setFilter("unread");
                      setShowFilterMenu(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                  >
                    <span>Непрочитанные</span>
                    {filter === "unread" && <ChevronRight className="w-4 h-4 text-purple-400" />}
                  </button>
                  <button
                    onClick={() => {
                      setFilter("pinned");
                      setShowFilterMenu(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                  >
                    <span>Закреплённые</span>
                    {filter === "pinned" && <ChevronRight className="w-4 h-4 text-purple-400" />}
                  </button>
                  <button
                    onClick={() => {
                      setFilter("archived");
                      setShowFilterMenu(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                  >
                    <span>Архив</span>
                    {filter === "archived" && <ChevronRight className="w-4 h-4 text-purple-400" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Search Bar */}
        {showSearch && (
          <div className="px-4 py-3 border-t border-slate-800/50">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-500" />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Поиск по контактам..."
                className="w-full pl-10 pr-10 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <X className="h-4 w-4 text-gray-500 hover:text-gray-300" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6  lg:pb-6">
        {/* Desktop Search and Filters */}
        <div className="hidden lg:block mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-500" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Поиск по имени или телефону..."
                className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute inset-y-0 right-3 flex items-center hover:text-gray-300 transition-colors"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                  filter === "all"
                    ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/25"
                    : "bg-slate-800/50 text-gray-400 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                <Users className="w-4 h-4" />
                Все
              </button>
              <button
                onClick={() => setFilter("unread")}
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-all relative flex items-center gap-2 ${
                  filter === "unread"
                    ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/25"
                    : "bg-slate-800/50 text-gray-400 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                Непрочитанные
                {chats.filter(c => c.unreadCount > 0).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {chats.filter(c => c.unreadCount > 0).length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setFilter("pinned")}
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                  filter === "pinned"
                    ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/25"
                    : "bg-slate-800/50 text-gray-400 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                <Pin className="w-4 h-4" />
                Закреплённые
              </button>
              <button
                onClick={() => setFilter("archived")}
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                  filter === "archived"
                    ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/25"
                    : "bg-slate-800/50 text-gray-400 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                <Archive className="w-4 h-4" />
                Архив
              </button>
            </div>
          </div>
        </div>

        {/* Contact Chats List */}
        <div className="space-y-2 pb-20 lg:pb-6">
          {showLoading ? (
            <div className="text-center py-20">
              <div className="inline-block relative">
                <div className="w-12 h-12 border-3 border-transparent border-t-purple-500 border-r-blue-500 rounded-full animate-spin"></div>
              </div>
              <p className="mt-4 text-gray-400">Загрузка чатов...</p>
            </div>
          ) : displayChats.length === 0 && hasCachedData ? (
            <div className="text-center py-20">
              <div className="text-6xl mb-6 bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                {searchQuery ? "🔍" : "📁"}
              </div>
              <p className="text-gray-400 text-lg mb-2">
                {searchQuery ? "Контакты не найдены" : "Ничего не найдено для этого фильтра"}
              </p>
              <p className="text-gray-500 text-sm mb-4">
                {searchQuery 
                  ? "Попробуйте другой запрос" 
                  : `Попробуйте другой фильтр. Всего чатов: ${chats.filter(c => !c.isArchived).length}`}
              </p>
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="mt-6 px-6 py-3 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 text-gray-300 hover:text-white font-medium transition-all duration-300"
                >
                  Очистить поиск
                </button>
              )}
            </div>
          ) : displayChats.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-6xl mb-6 bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                👤
              </div>
              <p className="text-gray-400 text-lg mb-2">
                Чатов с контактами пока нет
              </p>
              <p className="text-gray-500 text-sm">
                Начните общение с новым контактом
              </p>
              {isOnline && (
                <button
                  onClick={() => setShowSearchModal(true)}
                  className="mt-6 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium transition-all duration-300 transform hover:-translate-y-0.5 shadow-lg shadow-purple-500/25"
                >
                  <UserPlus className="w-4 h-4 inline mr-2" />
                  Найти контакт
                </button>
              )}
            </div>
          ) : (
            displayChats.map((chat) => (
              <div
                key={chat.chatId}
                onClick={() => handleChatClick(chat)}
                className="group relative flex items-center gap-4 p-4 rounded-xl
                  bg-slate-900/50 hover:bg-slate-800/50 cursor-pointer transition-all duration-200
                  border border-slate-800/50 hover:border-slate-700/50 active:scale-[0.99]"
              >
                {/* Offline indicator */}
                {!isOnline && !chat.lastSynced && (
                  <div className="absolute top-2 right-2">
                    <CloudOff className="w-3 h-3 text-orange-400" />
                  </div>
                )}

                {/* Avatar with status */}
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                     {getInitial(
    chat.otherParticipant.localName || 
    chat.otherParticipant.name || 
    "A"
  )}
                    {chat.isPinned && (
                      <Pin className="absolute -top-1 -right-1 w-4 h-4 text-yellow-400" />
                    )}
                  </div>
                  
                  {/* Unread badge */}
                  {chat.unreadCount > 0 && (
                    <span className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                      {chat.unreadCount}
                    </span>
                  )}
                </div>

                {/* Chat Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-medium truncate">
                         {chat.otherParticipant.localName || chat.otherParticipant.name || "Без имени"}
                      </p>
                      {chat.otherParticipant.isRegistered && (
                        <Shield className="w-4 h-4 text-blue-400" />
                      )}
                      {chat.isMuted && (
                        <BellOff className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {chat.lastAt && (
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {formatTime(chat.lastAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-1">
                    <Phone className="w-3 h-3 text-gray-500" />
                    <p className="text-gray-400 text-sm truncate">
                        {formatPhoneForDisplay(chat.otherParticipant.phone)}
                    </p>
                    {!chat.otherParticipant.isRegistered && (
                      <span className="text-xs text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                        не зарегистрирован
                      </span>
                    )}
                  </div>

                  {/* Last Message Preview */}
                  <div className="flex items-center gap-2">
                    {chat.lastMessageType === "voice" && (
                      <div className="w-4 h-4 text-purple-400">
                        <svg fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3 9v6h4l5 5V4L7 9H3z"/>
                        </svg>
                      </div>
                    )}
                    {chat.lastMessageType === "image" && (
                      <div className="w-4 h-4 text-blue-400">
                        📷
                      </div>
                    )}
                    {chat.lastMessageType === "file" && (
                      <div className="w-4 h-4 text-green-400">
                        📎
                      </div>
                    )}
                    <p className="text-sm truncate text-gray-300">
                      {chat.lastMessage || "Нет сообщений"}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Stats Footer */}
        {hasCachedData && (
          <div className="mt-8 pt-6 border-t border-slate-800/50">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-sm text-gray-500">
              <div className="flex flex-wrap items-center gap-4 lg:gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  <span>Всего чатов: {chats.filter(c => !c.isArchived).length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span>Непрочитанных: {chats.filter(c => c.unreadCount > 0).length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <span>Закреплённых: {chats.filter(c => c.isPinned).length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <span>В архиве: {chats.filter(c => c.isArchived).length}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {!isOnline && (
                  <div className="flex items-center gap-2 text-orange-400">
                    <CloudOff className="w-4 h-4" />
                    <span>Оффлайн режим</span>
                  </div>
                )}
                <div className="text-sm text-gray-400">
                  {chats.filter(c => c.otherParticipant.isRegistered).length} зарегистрированных
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Floating Action Button */}
      {isOnline && (
        <button
          onClick={() => setShowSearchModal(true)}
          className="lg:hidden fixed bottom-24 right-4 z-50 p-4 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-2xl shadow-purple-500/30 hover:shadow-3xl hover:shadow-purple-500/40 transition-all duration-300 hover:scale-110"
        >
          <UserPlus className="w-6 h-6" />
        </button>
      )}

      {/* Mobile Bottom Navigation Placeholder */}
      <div className="lg:hidden h-16"></div>

      {/* Search Modal */}
      {showSearchModal && (
        <ContactSearchModal
          isOpen={showSearchModal}
          onClose={() => setShowSearchModal(false)}
        />
      )}
    </div>
  );
}