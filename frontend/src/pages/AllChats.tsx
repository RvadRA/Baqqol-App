// AllChats.tsx - Fixed to show cached data immediately
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { getInitial } from "../utils/ui";
import { socket } from "../socket";
import { 
  Search, 
  MessageSquare, 
  CheckCircle,
  CheckCheck,
  Phone,
  Pin,
  Archive,
  BellOff,
  Filter,
  Loader2,
  X,
  Wifi,
  WifiOff,
  RefreshCw,
  CloudOff,
  Check
} from "lucide-react";

interface ChatItem {
  debtId: string;
  chatId: string;
  otherParticipant: {
    identityId: string;
    name: string;
     localName?: string;
    phone: string;
    avatar?: string;
  };
  lastMessage: string;
  lastAt?: string;
  unreadCount: number;
  lastMessageType?: "text" | "image" | "file" | "voice";
  lastMessageSender?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  isMuted?: boolean;
  lastMessageStatus?: "sent" | "delivered" | "read";
  lastSynced?: string;
}

interface Notification {
  id: string;
  type: "new_message" | "message_read" | "chat_archived" | "chat_pinned";
  title: string;
  message: string;
  chatId: string;
  debtId: string;
  participantName: string;
  participantPhone: string;
  timestamp: string;
  read: boolean;
  data?: any;
}

interface SyncQueueItem {
  type: 'update' | 'delete' | 'read' | 'pin' | 'archive';
  chatId: string;
  debtId: string;
  data: any;
  timestamp: number;
  retryCount: number;
}

export default function AllChats() {
  const navigate = useNavigate();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [filteredChats, setFilteredChats] = useState<ChatItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "pinned" | "archived">("all");
  const [loading, setLoading] = useState(true); // Initial loading state
  const [refreshing, setRefreshing] = useState(false); // Separate state for refreshing
  const [loadingMarkAll, setLoadingMarkAll] = useState(false);
  const [, setNotifications] = useState<Notification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [, setLastSyncTime] = useState<string | null>(null);
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([]);
  const [, setHasError] = useState(false);
  const [hasCachedData, setHasCachedData] = useState(false); // Track if we have cached data
  
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const syncRetryRef = useRef<NodeJS.Timeout | null>(null);
  const socketSetupRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  // Initialize component
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      if (socket.connected) {
        socket.off("chat:list-updated");
        socket.off("chat:new-message");
        socket.off("chat:message-read");
      }
      if (syncRetryRef.current) {
        clearTimeout(syncRetryRef.current);
      }
    };
  }, []);

  // Load chats from cache first - UPDATED
  const loadCachedChats = useCallback(() => {
    try {
      const cached = localStorage.getItem('chatsCache');
      const cachedTime = localStorage.getItem('chatsCacheTime');
      
      if (cached) {
        const parsedChats = JSON.parse(cached);
        console.log('📂 Loaded cached chats:', parsedChats.length);
        
        // Set cached data immediately
        setChats(parsedChats);
        setHasCachedData(true);
        
        if (cachedTime) {
          setLastSyncTime(new Date(cachedTime).toLocaleTimeString());
        }
        
        return parsedChats;
      }
    } catch (error) {
      console.error('Error loading cached chats:', error);
    }
    setHasCachedData(false);
    return [];
  }, []);

  // Save chats to cache
  const saveToCache = useCallback((chatsData: ChatItem[]) => {
    try {
      localStorage.setItem('chatsCache', JSON.stringify(chatsData));
      localStorage.setItem('chatsCacheTime', new Date().toISOString());
      console.log('💾 Saved to cache:', chatsData.length, 'chats');
    } catch (error) {
      console.error('Error saving to cache:', error);
    }
  }, []);

  // Load sync queue
  const loadSyncQueue = useCallback(() => {
    try {
      const queue = localStorage.getItem('chatsSyncQueue');
      if (queue) {
        const parsedQueue = JSON.parse(queue);
        setSyncQueue(parsedQueue);
        console.log('📋 Loaded sync queue:', parsedQueue.length, 'items');
      }
    } catch (error) {
      console.error('Error loading sync queue:', error);
    }
  }, []);

  // Save sync queue
  const saveSyncQueue = useCallback((queue: SyncQueueItem[]) => {
    try {
      localStorage.setItem('chatsSyncQueue', JSON.stringify(queue));
      setSyncQueue(queue);
    } catch (error) {
      console.error('Error saving sync queue:', error);
    }
  }, []);

  // Add to sync queue
  const addToSyncQueue = useCallback((item: SyncQueueItem) => {
    setSyncQueue(prev => {
      const newQueue = [...prev, { ...item, timestamp: Date.now(), retryCount: 0 }];
      try {
        localStorage.setItem('chatsSyncQueue', JSON.stringify(newQueue));
      } catch (error) {
        console.error('Error saving sync queue:', error);
      }
      return newQueue;
    });
    
    if (isOnline) {
      syncOfflineChanges();
    }
  }, [isOnline]);

  // Sync offline changes
  const syncOfflineChanges = useCallback(async () => {
    if (!isOnline || isSyncing || syncQueue.length === 0) return;
    
    setIsSyncing(true);
    console.log('🔄 Syncing offline changes...');
    
    const queueCopy = [...syncQueue];
    const failedItems: SyncQueueItem[] = [];
    
    for (const item of queueCopy) {
      try {
        if (item.retryCount >= 3) {
          console.warn(`Max retries reached for item:`, item);
          continue;
        }
        
        switch (item.type) {
          case 'update':
            await api.put(`/chats/${item.chatId}/sync`, item.data);
            break;
          case 'read':
            await api.post(`/chats/${item.debtId}/read`, item.data);
            break;
          case 'pin':
            await api.post(`/chats/${item.debtId}/settings`, item.data);
            break;
          case 'archive':
            await api.post(`/chats/${item.debtId}/settings`, item.data);
            break;
          case 'delete':
            await api.delete(`/chats/${item.chatId}`);
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
    
    if (failedItems.length < queueCopy.length && isMountedRef.current) {
      await loadChats(false);
    }
    
    setIsSyncing(false);
    console.log('✅ Sync completed');
  }, [isOnline, isSyncing, syncQueue]);

  // Get message preview
  const getMessagePreview = useCallback((type: string) => {
    switch (type) {
      case 'image': return '📷 Изображение';
      case 'file': return '📎 Файл';
      case 'voice': return '🎤 Голосовое';
      default: return 'Новое сообщение';
    }
  }, []);

  // Main load chats function - UPDATED
  const loadChats = useCallback(async (isRefresh = false) => {
    if (!isMountedRef.current) return;
    
    if (isRefresh) {
      setRefreshing(true);
    } else if (!hasCachedData) {
      setLoading(true);
    }
    
    // If offline and no cached data, just stop
    if (!isOnline && !hasCachedData) {
      console.log('📴 Offline mode, no cached data');
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      return;
    }
    
    try {
      setHasError(false);
      
      // Only make API call if online
      if (isOnline) {
        console.log('🌐 Loading chats from server...');
        
        const response = await api.get("/chats", {
          timeout: 8000,
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        
        const chatsData = response.data || [];
        console.log("Loaded chats from server:", chatsData.length);
        
        const updatedChats = chatsData.map((chat: ChatItem) => ({
          ...chat,
          lastSynced: new Date().toISOString()
        }));
        
        const sortedChats = [...updatedChats].sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime();
        });
        
        if (isMountedRef.current) {
          setChats(sortedChats);
          saveToCache(sortedChats);
          setHasCachedData(true);
          setLastSyncTime(new Date().toLocaleTimeString());
        }
      }
      
    } catch (error: any) {
      console.error("Error loading chats:", error);
      
      if (isMountedRef.current) {
        setHasError(true);
        
        if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
          console.log('Using cached data due to network error');
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [isOnline, hasCachedData, saveToCache, isMountedRef]);

  // Setup socket listeners
  const setupSocketListeners = useCallback(() => {
    if (socketSetupRef.current) return;
    
    console.log('🔌 Setting up socket listeners');
    
    const handleChatListUpdated = (data: any) => {
      console.log('📬 Chat list updated via socket');
      if (isOnline) {
        loadChats(false);
      } else {
        setChats(prevChats => {
          const updatedChats = prevChats.map(chat => 
            chat.chatId === data.chatId ? { ...chat, ...data.updates, lastSynced: new Date().toISOString() } : chat
          );
          saveToCache(updatedChats);
          return updatedChats;
        });
      }
    };

const handleNewMessage = (data: any) => {
  console.log("💬 New message received via socket:", data);
  
  // ДОБАВЬТЕ: Функция для получения правильного имени отправителя
  const getSenderDisplayName = (messageData: any) => {
    // Сначала проверяем, есть ли localName в данных сообщения
    if (messageData.senderLocalName) {
      return messageData.senderLocalName;
    }
    
    // Ищем в кэше клиентов
    try {
      const cachedCustomers = localStorage.getItem('customers_cache');
      if (cachedCustomers) {
        const customersData = JSON.parse(cachedCustomers);
        const customers = customersData.customers || [];
        
        // Ищем по ID отправителя
        if (messageData.senderId) {
          const customer = customers.find((c: any) => 
            c._id === messageData.senderId || 
            c.targetIdentityId === messageData.senderId
          );
          if (customer?.localName) {
            return customer.localName;
          }
        }
        
        // Ищем по телефону отправителя
        if (messageData.senderPhone) {
          const customer = customers.find((c: any) => 
            c.phone === messageData.senderPhone
          );
          if (customer?.localName) {
            return customer.localName;
          }
        }
      }
    } catch (error) {
      console.error('Error getting sender name:', error);
    }
    
    // Если ничего не нашли, используем имя из сообщения
    return messageData.senderName || 'Клиент';
  };
  
  const senderDisplayName = getSenderDisplayName(data);
  
  setChats(prevChats => {
    const isFromCurrentUser = data.senderId === localStorage.getItem("userId");
    const updatedChats = prevChats.map(chat => {
      if (chat.debtId === data.debtId) {
        return {
          ...chat,
          lastMessage: data.text || getMessagePreview(data.type),
          lastMessageType: data.type || 'text',
          lastMessageSender: senderDisplayName, // Используем localName
          lastAt: new Date().toISOString(),
          unreadCount: isFromCurrentUser ? chat.unreadCount : chat.unreadCount + 1,
          lastSynced: new Date().toISOString()
        };
      }
      return chat;
    });
    
    const sortedChats = updatedChats.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime();
    });
    
    saveToCache(sortedChats);
    return sortedChats;
  });
  
  if (data.senderId !== localStorage.getItem("userId")) {
    const newNotification: Notification = {
      id: `msg_${Date.now()}`,
      type: "new_message",
      title: "Новое сообщение",
      message: data.text || getMessagePreview(data.type),
      chatId: data.chatId,
      debtId: data.debtId,
      participantName: senderDisplayName, // Используем localName
      participantPhone: data.senderPhone || "",
      timestamp: new Date().toISOString(),
      read: false,
      data: data
    };

    setNotifications(prev => [newNotification, ...prev.slice(0, 49)]);
    setUnreadNotificationCount(prev => prev + 1);
    
    if (Notification.permission === "granted") {
      new Notification(`Новое сообщение от ${senderDisplayName}`, {
        body: data.text || getMessagePreview(data.type),
        icon: "/favicon.ico",
        tag: `chat-${data.debtId}`
      });
    }
  }
};

    const handleMessageRead = (data: any) => {
      console.log("✓ Message read:", data);
      
      setChats(prevChats => {
        const updatedChats = prevChats.map(chat => {
          if (chat.debtId === data.debtId) {
            return {
              ...chat,
              unreadCount: Math.max(0, chat.unreadCount - 1),
              lastSynced: new Date().toISOString()
            };
          }
          return chat;
        });
        
        saveToCache(updatedChats);
        return updatedChats;
      });
    };

    socket.on("chat:list-updated", handleChatListUpdated);
    socket.on("chat:new-message", handleNewMessage);
    socket.on("chat:message-read", handleMessageRead);
    
    socketSetupRef.current = true;

    return () => {
      socket.off("chat:list-updated", handleChatListUpdated);
      socket.off("chat:new-message", handleNewMessage);
      socket.off("chat:message-read", handleMessageRead);
      socketSetupRef.current = false;
    };
  }, [isOnline, loadChats, getMessagePreview]);
// Добавьте эту функцию в начале компонента
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
  // Initial data loading - COMPLETELY REWRITTEN
  useEffect(() => {
    let isMounted = true;
    
    const initializeData = async () => {
      // Step 1: Load cached data immediately (instant UI)
      const cachedChats = loadCachedChats();
      
      // Step 2: Setup socket listeners
      setupSocketListeners();
      
      // Step 3: Load sync queue
      loadSyncQueue();
      
      // Step 4: Request notification permission
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(console.error);
      }
      
      // Step 5: If we have cached data AND online, load fresh data in background
      if (cachedChats.length > 0 && isOnline && isMounted) {
        console.log('🔄 Loading fresh data in background...');
        try {
          const response = await api.get("/chats", {
            timeout: 8000,
            headers: { 'Cache-Control': 'no-cache' }
          });
          
          const chatsData = response.data || [];
          console.log("Fresh chats loaded:", chatsData.length);
          
          const updatedChats = chatsData.map((chat: ChatItem) => ({
            ...chat,
            lastSynced: new Date().toISOString()
          }));
          
          const sortedChats = [...updatedChats].sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime();
          });
          
          if (isMounted) {
            setChats(sortedChats);
            saveToCache(sortedChats);
            setLastSyncTime(new Date().toLocaleTimeString());
          }
        } catch (error) {
          console.error("Error loading fresh data:", error);
          // Keep using cached data
        }
      } 
      // Step 6: If no cached data, load from server
      else if (cachedChats.length === 0 && isOnline && isMounted) {
        console.log('📭 No cached data, loading from server...');
        await loadChats(false);
      }
      
      // Step 7: Hide loading
      if (isMounted) {
        setLoading(false);
      }
    };

    initializeData();
    
    // Network status listeners
    const handleOnline = () => {
      console.log('🟢 App is online');
      setIsOnline(true);
      // If online and have cached data, refresh in background
      if (hasCachedData) {
        loadChats(false);
      }
      syncOfflineChanges();
    };
    
    const handleOffline = () => {
      console.log('🔴 App is offline');
      setIsOnline(false);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Periodic sync
    const syncInterval = setInterval(() => {
      if (isOnline && syncQueue.length > 0) {
        syncOfflineChanges();
      }
    }, 30000);

    // Click outside filter menu
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setShowFilterMenu(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(syncInterval);
      if (syncRetryRef.current) {
        clearTimeout(syncRetryRef.current);
      }
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []); // Empty dependency array

  // Focus search input when search is opened
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  // Filter chats based on search and filter
  useEffect(() => {
    let filtered = [...chats];

     if (searchQuery) {
    filtered = filtered.filter(chat => {
      // Используем localName если есть, иначе name
      const displayName = chat.otherParticipant.localName || chat.otherParticipant.name;
      return (
        displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chat.otherParticipant.phone.includes(searchQuery) ||
        chat.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }

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
  }, [chats, searchQuery, filter]);

  // Load notifications


  const handleChatClick = (debtId: string) => {
    navigate(`/chats/${debtId}`);
  };

  const markChatAsRead = async (debtId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const chat = chats.find(c => c.debtId === debtId);
    if (!chat) return;
    
    setChats(prev => {
      const updated = prev.map(c => 
        c.debtId === debtId ? { ...c, unreadCount: 0, lastSynced: new Date().toISOString() } : c
      );
      saveToCache(updated);
      return updated;
    });
    
    setNotifications(prev => prev.filter(n => n.debtId !== debtId || n.type !== "new_message"));
    setUnreadNotificationCount(prev => Math.max(0, prev - 1));
    
    try {
      if (isOnline) {
        await api.post(`/chats/${debtId}/read`);
      } else {
        addToSyncQueue({
          type: 'read',
          chatId: chat.chatId,
          debtId,
          data: { readAt: new Date().toISOString() },
          timestamp: Date.now(),
          retryCount: 0
        });
      }
    } catch (error) {
      console.error("Error marking chat as read:", error);
    }
  };

// Fix the togglePinChat function
const togglePinChat = async (debtId: string, e: React.MouseEvent) => {
  e.stopPropagation();
  
  const chat = chats.find(c => c.debtId === debtId);
  if (!chat) return;
  
  const newPinnedState = !chat.isPinned;
  
  setChats(prev => {
    const updated = prev.map(c => 
      c.debtId === debtId ? { ...c, isPinned: newPinnedState, lastSynced: new Date().toISOString() } : c
    );
    saveToCache(updated);
    return updated;
  });
  
  try {
    if (isOnline) {
      await api.post(`/chats/${debtId}/settings`, {  // Fixed: changed item.debtId to debtId
        setting: 'isPinned',
        value: newPinnedState
      });
    } else {
      addToSyncQueue({
        type: 'pin',
        chatId: chat.chatId,
        debtId,  // Fixed: changed item.debtId to debtId
        data: {
          setting: 'isPinned',
          value: newPinnedState
        },
        timestamp: Date.now(),
        retryCount: 0
      });
    }
  } catch (error) {
    console.error("Error toggling pin:", error);
  }
};

// Fix the toggleArchiveChat function
const toggleArchiveChat = async (debtId: string, e: React.MouseEvent) => {
  e.stopPropagation();
  
  const chat = chats.find(c => c.debtId === debtId);
  if (!chat) return;
  
  const newArchivedState = !chat.isArchived;
  
  setChats(prev => {
    const updated = prev.map(c => 
      c.debtId === debtId ? { ...c, isArchived: newArchivedState, lastSynced: new Date().toISOString() } : c
    );
    saveToCache(updated);
    return updated;
  });
  
  try {
    if (isOnline) {
      await api.post(`/chats/${debtId}/settings`, {  // Fixed: changed item.debtId to debtId
        setting: 'isArchived',
        value: newArchivedState
      });
    } else {
      addToSyncQueue({
        type: 'archive',
        chatId: chat.chatId,
        debtId,  // Fixed: changed item.debtId to debtId
        data: {
          setting: 'isArchived',
          value: newArchivedState
        },
        timestamp: Date.now(),
        retryCount: 0
      });
    }
  } catch (error) {
    console.error("Error toggling archive:", error);
  }
};

  const markAllAsRead = async () => {
    const unreadChats = chats.filter(c => c.unreadCount > 0);
    if (unreadChats.length === 0) return;
    
    try {
      setLoadingMarkAll(true);
      
      setChats(prev => {
        const updated = prev.map(chat => ({
          ...chat,
          unreadCount: 0,
          lastSynced: new Date().toISOString()
        }));
        saveToCache(updated);
        return updated;
      });
      
      setNotifications([]);
      setUnreadNotificationCount(0);
      localStorage.removeItem('notificationsCache');
      
      if (isOnline) {
        await api.post("/chats/read-all");
      } else {
        unreadChats.forEach(chat => {
          addToSyncQueue({
            type: 'read',
            chatId: chat.chatId,
            debtId: chat.debtId,
            data: { readAt: new Date().toISOString() },
            timestamp: Date.now(),
            retryCount: 0
          });
        });
      }
    } catch (error) {
      console.error("Error marking all chats as read:", error);
    } finally {
      setLoadingMarkAll(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadChats(true);
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      
      if (diffHours < 24) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      } else {
        return date.toLocaleDateString('ru-RU', { 
          day: 'numeric', 
          month: 'short',
          year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
      }
    } catch (error) {
      return "";
    }
  };

  const getFilterIcon = () => {
    switch (filter) {
      case "unread": return <CheckCircle className="w-4 h-4" />;
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

  // Only show loading if no cached data
  if (loading && !hasCachedData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-indigo-900 flex items-center justify-center">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-transparent border-t-purple-500 border-r-blue-500 rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-400 text-center">Загрузка чатов...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-indigo-900 lg:pt-16">
      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-40 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/50">
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
              {refreshing ? (
                <div className="p-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                </div>
              ) : (
                <button
                  onClick={handleRefresh}
                  disabled={!isOnline}
                  className="p-2 rounded-lg hover:bg-slate-800/50 transition-colors disabled:opacity-50"
                  title="Обновить"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-bold text-white">Чаты</h1>
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
                    {filter === "all" && <Check className="w-4 h-4 text-purple-400" />}
                  </button>
                  <button
                    onClick={() => {
                      setFilter("unread");
                      setShowFilterMenu(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                  >
                    <span>Непрочитанные</span>
                    {filter === "unread" && <Check className="w-4 h-4 text-purple-400" />}
                  </button>
                  <button
                    onClick={() => {
                      setFilter("pinned");
                      setShowFilterMenu(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                  >
                    <span>Закреплённые</span>
                    {filter === "pinned" && <Check className="w-4 h-4 text-purple-400" />}
                  </button>
                  <button
                    onClick={() => {
                      setFilter("archived");
                      setShowFilterMenu(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                  >
                    <span>Архив</span>
                    {filter === "archived" && <Check className="w-4 h-4 text-purple-400" />}
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
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по чатам..."
                className="w-full pl-10 pr-10 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <X className="h-4 w-4 text-gray-500 hover:text-gray-300" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Desktop Header */}
        <div className="hidden lg:block mb-8">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <MessageSquare className="w-8 h-8 text-purple-400" />
                Чаты
              </h1>
              <p className="text-gray-400 mt-2">
                Общайтесь с клиентами и управляйте перепиской
              </p>
            </div>
            
            <div className="flex flex-col items-end gap-3">
              <div className="flex items-center gap-3 bg-slate-800/40 px-4 py-2 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs ${isOnline ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
                  {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                  <span className="font-medium">{isOnline ? 'Онлайн' : 'Оффлайн'}</span>
                </div>
                
                {syncQueue.length > 0 && (
                  <div className="flex items-center gap-1.5 text-yellow-400 text-xs">
                    <CloudOff className="w-3.5 h-3.5" />
                    <span>{syncQueue.length} в очереди</span>
                  </div>
                )}

                {isSyncing && (
                  <RefreshCw className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                )}

                {refreshing ? (
                  <RefreshCw className="w-4 h-4 text-purple-400 animate-spin" />
                ) : (
                  <button
                    onClick={handleRefresh}
                    disabled={!isOnline}
                    className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors text-gray-400"
                    title="Обновить"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}
              </div>

              {unreadNotificationCount > 0 && (
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20">
                  <span className="text-red-400 text-sm font-bold animate-pulse">
                    {unreadNotificationCount} новых уведомлений
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-500" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по имени, телефону или сообщению..."
                className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-transparent"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                  filter === "all"
                    ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white"
                    : "bg-slate-800/50 text-gray-400 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                Все
              </button>
              <button
                onClick={() => setFilter("unread")}
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-all relative flex items-center gap-2 ${
                  filter === "unread"
                    ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white"
                    : "bg-slate-800/50 text-gray-400 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                <CheckCircle className="w-4 h-4" />
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
                    ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white"
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
                    ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white"
                    : "bg-slate-800/50 text-gray-400 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                <Archive className="w-4 h-4" />
                Архив
              </button>
            </div>
          </div>
        </div>

        {/* Chats List */}
        <div className="space-y-2 pb-20 lg:pb-6">
          {filteredChats.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-6xl mb-6 bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                {searchQuery ? "🔍" : "💬"}
              </div>
              <p className="text-gray-400 text-lg mb-2">
                {searchQuery ? "Чаты не найдены" : "Чатов пока нет"}
              </p>
              <p className="text-gray-500 text-sm">
                {searchQuery ? "Попробуйте другой запрос" : "Создайте долг чтобы начать общение"}
              </p>
            </div>
          ) : (
            filteredChats.map((chat) => (
              <div
                key={chat.debtId}
                onClick={() => handleChatClick(chat.debtId)}
                className="group relative flex items-center gap-4 p-4 rounded-xl
                  bg-slate-900/50 hover:bg-slate-800/50 cursor-pointer transition-all duration-200
                  border border-slate-800/50 hover:border-slate-700/50 active:scale-[0.99]"
              >
                {!isOnline && !chat.lastSynced && (
                  <div className="absolute top-2 right-2">
                    <CloudOff className="w-3 h-3 text-orange-400" />
                  </div>
                )}

                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                    {getInitial(
    getCustomerLocalName(
      chat.otherParticipant.phone,
      chat.otherParticipant.identityId,
      chat.otherParticipant.localName || chat.otherParticipant.name
    )
  )}
                    {chat.isPinned && (
                      <Pin className="absolute -top-1 -right-1 w-4 h-4 text-yellow-400" />
                    )}
                  </div>
                  
                  {chat.unreadCount > 0 && (
                    <span className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                      {chat.unreadCount}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                     <p className="text-white font-medium truncate">
  {getCustomerLocalName(
    chat.otherParticipant.phone,
    chat.otherParticipant.identityId,
    chat.otherParticipant.localName || chat.otherParticipant.name
  )}
</p>
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
                      {chat.lastMessageStatus === "read" && (
                        <CheckCheck className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-1">
                    <Phone className="w-3 h-3 text-gray-500" />
                    <p className="text-gray-400 text-sm truncate">
                      {chat.otherParticipant.phone}
                    </p>
                  </div>

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

                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  {chat.unreadCount > 0 && (
                    <button
                      onClick={(e) => markChatAsRead(chat.debtId, e)}
                      className="p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
                      title="Отметить как прочитанное"
                    >
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    </button>
                  )}
                  <button
                    onClick={(e) => togglePinChat(chat.debtId, e)}
                    className="p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
                    title={chat.isPinned ? "Открепить" : "Закрепить"}
                  >
                    <Pin className={`w-4 h-4 ${chat.isPinned ? 'text-yellow-400' : 'text-gray-400'}`} />
                  </button>
                  <button
                    onClick={(e) => toggleArchiveChat(chat.debtId, e)}
                    className="p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
                    title={chat.isArchived ? "Восстановить" : "Архивировать"}
                  >
                    <Archive className={`w-4 h-4 ${chat.isArchived ? 'text-orange-400' : 'text-gray-400'}`} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Stats Footer */}
        {chats.length > 0 && (
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
              
              <div className="flex pb-10 items-center gap-3">
                {!isOnline && (
                  <div className="flex items-center gap-2 text-orange-400">
                    <CloudOff className="w-4 h-4" />
                    <span>Оффлайн режим</span>
                  </div>
                )}
                
                <button
                  onClick={markAllAsRead}
                  disabled={loadingMarkAll || chats.filter(c => c.unreadCount > 0).length === 0}
                  className={`px-4 py-2 rounded-xl transition-colors flex items-center justify-center gap-2 min-w-[120px] ${
                    loadingMarkAll || chats.filter(c => c.unreadCount > 0).length === 0
                      ? "bg-slate-800/50 text-gray-500 cursor-not-allowed"
                      : "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                  }`}
                >
                  {loadingMarkAll ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Обработка...</span>
                    </>
                  ) : (
                    <>
                      <CheckCheck className="w-4 h-4" />
                      <span>Прочитать всё</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation Placeholder */}
      <div className="lg:hidden h-16"></div>
    </div>
  );
}