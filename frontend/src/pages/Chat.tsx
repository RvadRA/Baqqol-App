// pages/Chat.tsx - COMPLETE UPDATED VERSION
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
// After your existing imports
import { socket } from "../socket";
import { socketService } from "../socket";
import { useSocket } from "../context/SocketContext"; // Add this import
import { useNotification } from "../context/NotificationContext";
import { getInitial, formatLastSeen } from "../utils/ui";
import CallModal from "../components/CallModal";
// Add to your existing imports
import EmojiPicker from 'emoji-picker-react';
import type { EmojiClickData } from 'emoji-picker-react';

import {
  ArrowLeft,
  Send,
  Search,
  Smile,
  Check,
  CheckCheck,
  User,
  X,
  Pin,
  Trash2,
  Copy,
  Download,
  Eye,
  Bell,
  BellOff,
  Shield,
  Archive,
  Clock,
  Calendar,
  Video,
  MoreVertical,
  ChevronDown,
  Wifi,
  WifiOff,
  RefreshCw,
} from "lucide-react";

interface Message {
  _id: string;
  text: string;
  senderId: string;
  senderName: string;
  createdAt: string;
  read: boolean;
  readBy: string[];
  isMine: boolean;
  isSystemMessage: boolean;
  type?: "text";
  pending?: boolean;
  failed?: boolean;
  localId?: string;
  replyTo?: string;
  serverId?: string;
}

interface ChatSettings {
  isMuted: boolean;
  isArchived: boolean;
  isPinned: boolean;
  customNotification: boolean;
}

interface ChatInfo {
  debtId: string;
  otherParticipant: {
    identityId: string;
    name: string;
    localName?: string;
    phone: string;
    avatar?: string;
    status?: "online" | "offline" | "away";
    lastSeen?: string;
    isVerified?: boolean;
    isRegistered?: boolean;
  isOfflineFallback?: boolean; 
  };
  settings: ChatSettings;
}

// Local storage keys
const CHAT_CACHE_KEY = (debtId: string) => `chat_cache_${debtId}`;
const OFFLINE_MESSAGES_KEY = (debtId: string) => `chat_offline_${debtId}`;
const CHAT_INFO_CACHE_KEY = (debtId: string) => `chat_info_cache_${debtId}`;

export default function Chat() {
  const { debtId } = useParams<{ debtId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
   // Add socket context
  const { isConnected, isConnecting, connect } = useSocket();
  const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [otherIsTyping, setOtherIsTyping] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showCallModal, setShowCallModal] = useState(false);
  const [replyMessage, setReplyMessage] = useState<Message | null>(null);
  const [showMessageActions, setShowMessageActions] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [unreadMessages, setUnreadMessages] = useState<string[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const { updateMessageNotifications } = useNotification();
  const [, setChatInfoLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [longPressTimer, ] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [, setIsMobile] = useState(window.innerWidth < 768);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [page, setPage] = useState(1);
  const messagesPerPage = 150;
const [lastSocketMessage, setLastSocketMessage] = useState<string>('');
const [isInitialLoad, setIsInitialLoad] = useState(true); 
const [socketInitialized, setSocketInitialized] = useState(false);
// Add these useState and useRef declarations near your other state declarations
const [swipeData, setSwipeData] = useState<{ id: string | null; offset: number }>({ id: null, offset: 0 });
const touchStartX = useRef<number>(0);
const isSwiping = useRef<boolean>(false);
const [showEmojiPicker, setShowEmojiPicker] = useState(false);
// В Chat.tsx добавьте эту функцию:

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
// Updated handleEmojiClick
const handleEmojiClick = (emojiData: EmojiClickData) => {
  setNewMessage(prev => prev + emojiData.emoji);
  
  // Haptic feedback for mobile
  if (window.navigator.vibrate) {
    window.navigator.vibrate(10);
  }

  // We keep it open so users can pick multiple emojis. 
  // Focus remains on textarea for a seamless transition.
  textareaRef.current?.focus();
};
// Update the touch handler functions
const handleTouchStart = useCallback((e: React.TouchEvent, _msgId: string) => {
  touchStartX.current = e.touches[0].clientX;
  isSwiping.current = true;
}, []);

const handleTouchMove = useCallback((e: React.TouchEvent, msgId: string) => {
  if (!isSwiping.current) return;

  const touchCurrentX = e.touches[0].clientX;
  const diff = touchCurrentX - touchStartX.current;

  // Telegram style: Swipe right to reply
  if (diff > 0) {
    const elasticOffset = Math.min(diff * 0.5, 70); // Elastic drag effect
    setSwipeData({ id: msgId, offset: elasticOffset });
    
    if (elasticOffset >= 50 && swipeData.offset < 50 && window.navigator.vibrate) {
      window.navigator.vibrate(10); // Haptic feedback
    }
  }
}, [swipeData.offset]);

const handleTouchEnd = useCallback((msg: Message) => {
  if (swipeData.offset >= 50) {
    handleMessageAction(msg._id, 'reply');
  }
  isSwiping.current = false;
  setSwipeData({ id: null, offset: 0 });
}, [swipeData.offset]);
// Update your handleMessageClick to be cleaner for the menu toggle





// Добавьте в ваш socket useEffect в Chat.tsx

// В socket useEffect добавьте этот обработчик
// Функция дедупликации сообщений
// Update the deduplicateMessages function to be more aggressive
const deduplicateMessages = useCallback((messages: Message[]): Message[] => {
  console.log('🔄 Deduplicating', messages.length, 'messages');
  
  const seenServerIds = new Set<string>();
  const seenLocalIds = new Set<string>();
  const seenTexts = new Map<string, { timestamp: number, id: string }>();
  const result: Message[] = [];
  
  // Process in reverse chronological order (newest first)
  const sorted = [...messages].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  sorted.forEach(msg => {
    // Check by server ID
    if (msg._id && !msg._id.startsWith('local_')) {
      if (seenServerIds.has(msg._id)) {
        console.log('⚠️ Duplicate server message skipped:', msg._id);
        return;
      }
      seenServerIds.add(msg._id);
    }
    
    // Check by local ID
    if (msg.localId) {
      if (seenLocalIds.has(msg.localId)) {
        console.log('⚠️ Duplicate local message skipped:', msg.localId);
        return;
      }
      seenLocalIds.add(msg.localId);
    }
    
    // Additional check for text duplicates within 5 seconds
    if (msg.text && msg.senderId) {
      const key = `${msg.text}_${msg.senderId}`;
      const existing = seenTexts.get(key);
      const timestamp = new Date(msg.createdAt).getTime();
      
      if (existing) {
        // If same text from same sender within 5 seconds, consider it a duplicate
        if (Math.abs(timestamp - existing.timestamp) < 5000) {
          console.log('⚠️ Text duplicate skipped:', {
            text: msg.text,
            timestamp: msg.createdAt,
            localId: msg.localId,
            existingId: existing.id
          });
          return;
        }
      }
      seenTexts.set(key, { timestamp, id: msg.localId || msg._id });
    }
    
    result.push(msg);
  });
  
  // Sort back chronologically
  const finalResult = result.sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  
  console.log('✅ Deduplicated to', finalResult.length, 'messages');
  return finalResult;
}, []);

  // Mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Network status
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 App is online, syncing...');
      setIsOnline(true);
      syncOfflineMessages();
    };
    
    const handleOffline = () => {
      console.log('🔴 App is offline');
      setIsOnline(false);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);


// Add this useEffect after network status useEffect
useEffect(() => {
  console.log("🔌 Socket status:", { 
    isConnected, 
    isConnecting, 
    debtId,
    socketConnected: socket.connected 
  });
  
  if (!isConnected && !isConnecting && debtId && user?.globalIdentityId) {
    console.log("⚠️ Socket not connected, will try to connect");
    // You could add auto-retry logic here if needed
  }
}, [isConnected, isConnecting, debtId, user?.globalIdentityId]);
  // Cache functions
const saveChatInfoToCache = useCallback((debtId: string, chatInfo: ChatInfo) => {
  try {
    const infoToSave = {
      ...chatInfo,
      otherParticipant: {
        ...chatInfo.otherParticipant,
        localName: chatInfo.otherParticipant.localName || 
                  getCustomerLocalName(
                    chatInfo.otherParticipant.phone,
                    chatInfo.otherParticipant.identityId,
                    chatInfo.otherParticipant.name
                  )
      }
    };
    
    localStorage.setItem(CHAT_INFO_CACHE_KEY(debtId), JSON.stringify(infoToSave));
    console.log('💾 Saved chat info to cache');
  } catch (error) {
    console.error('Error saving chat info to cache:', error);
  }
}, [getCustomerLocalName]); // Добавьте зависимость
// Добавьте в ваш socket useEffect в Chat.tsx
const handleUserStatus = useCallback((data: { identityId: string; status: string; lastSeen: string }) => {
  if (data.identityId === chatInfo?.otherParticipant.identityId) {
    setChatInfo(prev => {
      if (!prev) return prev;
      
      const updatedInfo = {
        ...prev,
        otherParticipant: {
          ...prev.otherParticipant,
          status: data.status as "online" | "offline",
          lastSeen: data.lastSeen
        }
      };
      
      // Сохраняем в кэш
      saveChatInfoToCache(debtId!, updatedInfo);
      
      return updatedInfo;
    });
  }
}, [chatInfo?.otherParticipant.identityId, debtId, saveChatInfoToCache]);

// Добавьте этот эффект в Chat.tsx
useEffect(() => {
  // Обновляем имена при изменении кэша customers
  const updateChatInfoFromCustomersCache = () => {
    if (!chatInfo) return;
    
    const localName = getCustomerLocalName(
      chatInfo.otherParticipant.phone,
      chatInfo.otherParticipant.identityId,
      chatInfo.otherParticipant.name
    );
    
    // Если localName отличается от текущего имени, обновляем
    if (localName && localName !== chatInfo.otherParticipant.name) {
      const updatedChatInfo = {
        ...chatInfo,
        otherParticipant: {
          ...chatInfo.otherParticipant,
          name: localName,
          localName: localName
        }
      };
      
      setChatInfo(updatedChatInfo);
      saveChatInfoToCache(debtId!, updatedChatInfo);
    }
  };
  
  // Обновляем при монтировании
  updateChatInfoFromCustomersCache();
  
  // Слушаем изменения localStorage
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === 'customers_cache') {
      console.log('🔄 Customers cache updated, updating chat info');
      updateChatInfoFromCustomersCache();
    }
  };
  
  window.addEventListener('storage', handleStorageChange);
  
  return () => {
    window.removeEventListener('storage', handleStorageChange);
  };
}, [chatInfo?.debtId]); // Зависимость только от ID чата

// В Chat.tsx добавьте функцию:
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


// В socket useEffect добавьте этот обработчик
const loadChatInfoFromCache = useCallback((debtId: string): ChatInfo | null => {
  try {
    const cached = localStorage.getItem(CHAT_INFO_CACHE_KEY(debtId));
    if (cached) {
      const parsed = JSON.parse(cached);
      
      // Get local name from customer cache
      const localName = getCustomerLocalName(
        parsed.otherParticipant.phone,
        parsed.otherParticipant.identityId,
        parsed.otherParticipant.name
      );
      
      const enrichedChatInfo = {
        ...parsed,
        otherParticipant: {
          ...parsed.otherParticipant,
          name: localName || parsed.otherParticipant.name,
          localName: localName
        }
      };
      
      console.log('📦 Loaded chat info from cache:', enrichedChatInfo.otherParticipant.name);
      return enrichedChatInfo;
    }
  } catch (error) {
    console.error('Error loading chat info from cache:', error);
  }
  return null;
}, [getCustomerLocalName]); // Добавьте зависимость


const loadChatInfo = useCallback(async (debtId: string) => {
  console.log('🔍 Loading chat info for debt:', debtId);
  
    const cachedInfo = loadChatInfoFromCache(debtId);
  if (cachedInfo) {
    console.log('📦 Setting initial chat info from cache for instant display');
    setChatInfo(cachedInfo);
  }
  // 1. FIRST try server if online (priority for fresh data)
  if (isOnline) {
    try {
      console.log('🌐 Fetching chat info from API...');
      
      let response;
      try {
        response = await api.get(`/chats/${debtId}/info`);
        console.log('✅ /chats/${debtId}/info response:', response.data);
      } catch (infoError) {
        console.log('⚠️ /chats/${debtId}/info not found, trying main endpoint');
        response = await api.get(`/chats/${debtId}?page=1&limit=1`);
        console.log('✅ /chats/${debtId} response:', response.data);
      }
      
      let chatInfoFromServer: ChatInfo;
      
      if (response.data.chat) {
        const chatData = response.data.chat;

     // В функции loadChatInfo, после получения данных с сервера:
const localName = getCustomerLocalName(
  chatData.otherParticipant?.phone,
  chatData.otherParticipant?.identityId,
  chatData.otherParticipant?.name || "Неизвестный пользователь"
);

chatInfoFromServer = {
  debtId: chatData.debtId || debtId,
  otherParticipant: {
    identityId: chatData.otherParticipant?.identityId || 'unknown',
    name: localName, // Используем localName
    localName: localName, // Сохраняем localName
    phone: chatData.otherParticipant?.phone || "Неизвестен",
    avatar: chatData.otherParticipant?.avatar,
    status: chatData.otherParticipant?.status,
    lastSeen: chatData.otherParticipant?.lastSeen,
    isVerified: chatData.otherParticipant?.isVerified,
    isRegistered: chatData.otherParticipant?.isRegistered || false,
  },
  settings: chatData.settings || {
    isMuted: false,
    isArchived: false,
    isPinned: false,
    customNotification: false
  }
};
      } else if (response.data.otherParticipant) {
          const localName = getCustomerLocalName(
          response.data.otherParticipant?.phone,
          response.data.otherParticipant?.identityId,
          response.data.otherParticipant?.name || "Неизвестный пользователь"
        );
        chatInfoFromServer = {
          
          debtId: response.data.debtId || debtId,
          otherParticipant: {
            identityId: response.data.otherParticipant?.identityId || 'unknown',
            name: localName,
            localName: localName,
            phone: response.data.otherParticipant?.phone || "Неизвестен",
            avatar: response.data.otherParticipant?.avatar,
            status: response.data.otherParticipant?.status,
            lastSeen: response.data.otherParticipant?.lastSeen,
            isVerified: response.data.otherParticipant?.isVerified,
            isRegistered: response.data.otherParticipant?.isRegistered || false,
          },
          settings: response.data.settings || {
            isMuted: false,
            isArchived: false,
            isPinned: false,
            customNotification: false
          }
        };
      } else {
        throw new Error('No chat info in response');
      }
      
      console.log('✅ Parsed chat info:', chatInfoFromServer);
      
      // Save to cache and update state
      saveChatInfoToCache(debtId, chatInfoFromServer);
      setChatInfo(chatInfoFromServer);
      setChatInfoLoading(false);
      return chatInfoFromServer;
      
    } catch (error: any) {
      console.error('❌ Error loading chat info from server:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      // If server fails, fall back to cache
      const cachedInfo = loadChatInfoFromCache(debtId);
      if (cachedInfo) {
        console.log('📦 Falling back to cached chat info');
        setChatInfo(cachedInfo);
        setChatInfoLoading(false);
        return cachedInfo;
      }
    }
  } else {
    // Offline mode: try cache first
    const cachedInfo = loadChatInfoFromCache(debtId);
    if (cachedInfo) {
      console.log('📦 Using cached chat info (offline)');
      setChatInfo(cachedInfo);
      setChatInfoLoading(false);
      return cachedInfo;
    }
  }
  
  // Ultimate fallback - only if nothing else worked
  console.log('⚠️ Creating fallback chat info');
 const defaultChatInfo: ChatInfo = {
  debtId,
  otherParticipant: {
    identityId: 'unknown',
    name: "Без имени",
    localName: getCustomerLocalName(undefined, undefined, "Без имени"), // Добавьте localName
    phone: "Неизвестен",
    isRegistered: false,
    isOfflineFallback: true
  },
  settings: {
    isMuted: false,
    isArchived: false,
    isPinned: false,
    customNotification: false
  }
};
  
  saveChatInfoToCache(debtId, defaultChatInfo);
  setChatInfo(defaultChatInfo);
  setChatInfoLoading(false);
  return defaultChatInfo;
}, [isOnline, loadChatInfoFromCache, saveChatInfoToCache]);

const saveToCache = useCallback((debtId: string, messages: Message[]) => {
  try {
    const deduplicated = deduplicateMessages(messages);
    
    // CRITICAL: Filter out local messages from cache
    // Cache should only contain server-confirmed messages
    const serverMessagesOnly = deduplicated.filter(msg => 
      !msg.localId || !msg.localId.startsWith('local_')
    );
    
    console.log('💾 Saving to cache (server messages only):', {
      totalMessages: deduplicated.length,
      serverMessages: serverMessagesOnly.length,
      localMessages: deduplicated.length - serverMessagesOnly.length
    });
    
    // Sort from oldest to newest for storage
    const sorted = serverMessagesOnly.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    
    // Keep last 200 messages
    const toCache = sorted.slice(-200);
    
    localStorage.setItem(CHAT_CACHE_KEY(debtId), JSON.stringify(toCache));
    
  } catch (error) {
    console.error('Error saving to cache:', error);
  }
}, [deduplicateMessages]);

const getOfflineMessages = useCallback((debtId: string): Message[] => {
  try {
    const offlineKey = OFFLINE_MESSAGES_KEY(debtId);
    const offlineData = localStorage.getItem(offlineKey);
    
    if (!offlineData) {
      console.log('📭 No offline storage for:', offlineKey);
      return [];
    }
    
    let messages: any[] = [];
    try {
      messages = JSON.parse(offlineData);
    } catch (e) {
      console.error('❌ Failed to parse offline storage:', e);
      return [];
    }
    
    // Filter and format messages
    const validMessages = messages
      .filter((msg: any) => {
        // Must have localId starting with 'local_'
        if (!msg.localId || !msg.localId.startsWith('local_')) {
          console.log('⚠️ Skipping offline message without valid localId:', msg);
          return false;
        }
        
        // Must have text
        if (!msg.text || msg.text.trim() === '') {
          console.log('⚠️ Skipping offline message without text:', msg.localId);
          return false;
        }
        
        return true;
      })
      .map((msg: any) => ({
        _id: msg._id || msg.localId,
        text: msg.text || '',
        senderId: msg.senderId || '',
        senderName: msg.senderName || '',
        createdAt: msg.createdAt || new Date().toISOString(),
        read: !!msg.read,
        readBy: Array.isArray(msg.readBy) ? msg.readBy : [],
        isMine: !!msg.isMine,
        isSystemMessage: !!msg.isSystemMessage,
        type: msg.type || "text",
        replyTo: msg.replyTo,
        // CRITICAL: Ensure pending is properly set
        pending: msg.pending !== undefined ? msg.pending : true,
        failed: msg.failed !== undefined ? msg.failed : false,
        localId: msg.localId,
        _source: 'offline'
      }));
    
    console.log('📱 Loaded offline messages:', {
      total: validMessages.length,
      key: offlineKey,
      messages: validMessages.map(m => ({
        localId: m.localId,
        text: m.text?.substring(0, 20),
        pending: m.pending
      }))
    });
    
    return validMessages;
    
  } catch (error) {
    console.error('❌ Error getting offline messages:', error);
    return [];
  }
}, []);


const loadCachedMessages = useCallback((debtId: string): Message[] => {
  try {
    const cacheKey = CHAT_CACHE_KEY(debtId);
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      console.log('📭 No cache found for key:', cacheKey);
      return [];
    }
    
    const cachedMessages: Message[] = JSON.parse(cached);
    
    console.log('📦 Loaded ALL messages from cache:', {
      key: cacheKey,
      total: cachedMessages.length,
      localMessages: cachedMessages.filter(m => m.localId?.startsWith('local_')).map(m => ({
        text: m.text,
        pending: m.pending,
        failed: m.failed
      }))
    });
    
    // Return ALL messages AS IS
    return cachedMessages.sort((a: Message, b: Message) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    
  } catch (error) {
    console.error('❌ Error loading cached messages:', error);
    return [];
  }
}, []);
const cleanupStorageDuplicates = useCallback((debtId: string) => {
  try {
    console.log('🧹 Cleaning storage duplicates for:', debtId);
    
    // 1. Load current data
    const cacheKey = CHAT_CACHE_KEY(debtId);
    const offlineKey = OFFLINE_MESSAGES_KEY(debtId);
    
    const cacheData = localStorage.getItem(cacheKey);
    const offlineData = localStorage.getItem(offlineKey);
    
    if (!cacheData && !offlineData) return;
    
    const cachedMessages: Message[] = cacheData ? JSON.parse(cacheData) : [];
    const offlineMessages: Message[] = offlineData ? JSON.parse(offlineData) : [];
    
    // 2. Find duplicates
    const cachedLocalIds = new Set(
      cachedMessages
        .map(m => m.localId)
        .filter((id): id is string => !!id && id.startsWith('local_'))
    );
    
    const cachedServerIds = new Set(
      cachedMessages
        .map(m => m._id)
        .filter((id): id is string => !!id && !id.startsWith('local_'))
    );
    
    // 3. Clean offline storage
    const cleanedOffline = offlineMessages.filter(msg => {
      // Remove if exists in cache with same localId
      if (msg.localId && cachedLocalIds.has(msg.localId)) {
        console.log('🗑️ Removing duplicate from offline (localId match):', msg.localId);
        return false;
      }
      
      // Remove if server message already in cache
      if (msg._id && cachedServerIds.has(msg._id)) {
        console.log('🗑️ Removing duplicate from offline (serverId match):', msg._id);
        return false;
      }
      
      return true;
    });
    
    // 4. Clean cache storage (remove local messages)
    const cleanedCache = cachedMessages.filter(msg => {
      // Keep server messages
      if (msg._id && !msg._id.startsWith('local_')) return true;
      
      // Remove local messages from cache (they should only be in offline storage)
      if (msg.localId && msg.localId.startsWith('local_')) {
        console.log('🗑️ Removing local message from cache:', msg.localId);
        return false;
      }
      
      return true;
    });
    
    // 5. Save cleaned data
    if (cleanedOffline.length !== offlineMessages.length) {
      localStorage.setItem(offlineKey, JSON.stringify(cleanedOffline));
      console.log('🧹 Cleaned offline storage:', {
        before: offlineMessages.length,
        after: cleanedOffline.length
      });
    }
    
    if (cleanedCache.length !== cachedMessages.length) {
      localStorage.setItem(cacheKey, JSON.stringify(cleanedCache));
      console.log('🧹 Cleaned cache storage:', {
        before: cachedMessages.length,
        after: cleanedCache.length
      });
    }
    
  } catch (error) {
    console.error('Error cleaning storage duplicates:', error);
  }
}, []);



const loadAllMessagesForDisplay = useCallback((debtId: string): Message[] => {
  console.log('🔄 Loading ALL messages for display');
  
  // 1. Load server messages from cache
  const cachedMessages = loadCachedMessages(debtId);
  
  // 2. Load offline messages
  const offlineMessages = getOfflineMessages(debtId);
  
  console.log('📊 Message sources:', {
    serverMessages: cachedMessages.length,
    offlineMessages: offlineMessages.length,
    offlinePending: offlineMessages.filter(m => m.pending).length
  });
  
  // 3. Create a combined array with offline messages first
  const combined = [...offlineMessages, ...cachedMessages];
  
  // 4. Deduplicate
  const seenIds = new Set<string>();
  const seenLocalIds = new Set<string>();
  const uniqueMessages: Message[] = [];
  
  // Process in reverse to keep the latest version
  const reversed = [...combined].reverse();
  
  reversed.forEach(msg => {
    // Check by server ID
    if (msg._id && !msg._id.startsWith('local_')) {
      if (seenIds.has(msg._id)) {
        console.log('⚠️ Skipping duplicate server message:', msg._id);
        return;
      }
      seenIds.add(msg._id);
    }
    
    // Check by local ID
    if (msg.localId) {
      if (seenLocalIds.has(msg.localId)) {
        console.log('⚠️ Skipping duplicate local message:', msg.localId);
        return;
      }
      seenLocalIds.add(msg.localId);
    }
    
    uniqueMessages.push(msg);
  });
  
  // 5. Sort chronologically
  const sorted = uniqueMessages.sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  
  console.log('✅ Final display messages:', {
    total: sorted.length,
    offline: offlineMessages.length,
    server: cachedMessages.length,
    pending: sorted.filter(m => m.pending).length
  });
  
  // Log pending messages
  const pendingMessages = sorted.filter(m => m.pending);
  if (pendingMessages.length > 0) {
    console.log('📋 Pending messages:', pendingMessages.map(m => ({
      localId: m.localId,
      text: m.text?.substring(0, 20),
      pending: m.pending
    })));
  }
  
  return sorted;
}, [loadCachedMessages, getOfflineMessages]);



const saveOfflineMessage = useCallback((debtId: string, message: Message) => {
  try {
    console.log('💾 Saving offline message:', {
      localId: message.localId,
      text: message.text?.substring(0, 20),
      pending: message.pending
    });

    const offlineKey = OFFLINE_MESSAGES_KEY(debtId);
    const currentOffline = localStorage.getItem(offlineKey);
    const offlineMessages = currentOffline ? JSON.parse(currentOffline) : [];

    // Ensure message has all required properties
    const messageToSave = {
      ...message,
      // CRITICAL: Always mark as pending when saving offline
      pending: true,
      failed: false,
      // Ensure localId exists
      localId: message.localId || `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      // Ensure createdAt is ISO string
      createdAt: message.createdAt || new Date().toISOString(),
      // Add save timestamp for debugging
      _offlineSavedAt: Date.now()
    };

    // Remove any existing message with same localId
    const filtered = offlineMessages.filter((m: Message) => 
      !m.localId || m.localId !== messageToSave.localId
    );

    // Add new message
    filtered.push(messageToSave);

    // Save back to localStorage
    localStorage.setItem(offlineKey, JSON.stringify(filtered));

    // Verify save
    setTimeout(() => {
      const verified = localStorage.getItem(offlineKey);
      const verifiedMessages = verified ? JSON.parse(verified) : [];
      const hasOurMessage = verifiedMessages.some((m: any) => 
        m.localId === messageToSave.localId
      );
      
      console.log('✅ Offline save verification:', {
        success: hasOurMessage,
        localId: messageToSave.localId,
        totalOffline: verifiedMessages.length
      });
    }, 0);

  } catch (error) {
    console.error('❌ Error saving offline message:', error);
    
    // Emergency save
    try {
      const emergencyData = [{
        ...message,
        pending: true,
        localId: message.localId || `emergency_${Date.now()}`,
        createdAt: message.createdAt || new Date().toISOString()
      }];
      localStorage.setItem(OFFLINE_MESSAGES_KEY(debtId), JSON.stringify(emergencyData));
      console.log('🆘 Emergency save completed');
    } catch (e) {
      console.error('❌ Emergency save failed:', e);
    }
  }
}, []);


// Add this function to clean up duplicates
const cleanupDuplicateMessages = useCallback((debtId: string) => {
  try {
    const cached = localStorage.getItem(CHAT_CACHE_KEY(debtId));
    const offline = localStorage.getItem(OFFLINE_MESSAGES_KEY(debtId));
    
    if (!cached || !offline) return;
    
    const cachedMessages: Message[] = JSON.parse(cached);
    const offlineMessages: Message[] = JSON.parse(offline);
    
    // Find messages that exist in both
    const duplicateLocalIds = new Set<string>();
    const cachedLocalIds = new Set(
      cachedMessages
        .map(m => m.localId)
        .filter((id): id is string => !!id)
    );
    
    offlineMessages.forEach(msg => {
      if (msg.localId && cachedLocalIds.has(msg.localId)) {
        duplicateLocalIds.add(msg.localId);
      }
    });
    
    // Remove duplicates from offline storage
    if (duplicateLocalIds.size > 0) {
      const cleanedOffline = offlineMessages.filter(msg => 
        !msg.localId || !duplicateLocalIds.has(msg.localId)
      );
      
      localStorage.setItem(OFFLINE_MESSAGES_KEY(debtId), JSON.stringify(cleanedOffline));
      console.log('🧹 Cleaned duplicates from offline storage:', duplicateLocalIds.size);
    }
    
  } catch (error) {
    console.error('Error cleaning duplicates:', error);
  }
}, []);

// Call this function when loading chat
useEffect(() => {
  if (debtId) {
    cleanupDuplicateMessages(debtId);
  }
}, [debtId, cleanupDuplicateMessages]);
  


const removeOfflineMessage = useCallback((debtId: string, localId: string) => {
  try {
    const offline = getOfflineMessages(debtId);
    const filtered = offline.filter(msg => msg.localId !== localId);
    
    const storageKey = OFFLINE_MESSAGES_KEY(debtId);
    localStorage.setItem(storageKey, JSON.stringify(filtered));
    
    console.log('🗑️ Removed from offline storage:', {
      debtId,
      localId,
      removed: offline.length - filtered.length,
      remaining: filtered.length
    });
  } catch (error) {
    console.error('Error removing offline message:', error);
  }
}, [getOfflineMessages]);

  // Scroll function
  const scrollToBottom = useCallback((instant = false) => {
  if (chatContainerRef.current) {
    const container = chatContainerRef.current;
    const scrollHeight = container.scrollHeight;
    
    console.log('⬇️ Scrolling to bottom:', {
      scrollHeight,
      clientHeight: container.clientHeight,
      scrollTop: container.scrollTop,
      instant
    });
    
    container.scrollTo({
      top: scrollHeight,
      behavior: instant ? 'auto' : 'smooth'
    });
    setShowScrollToBottom(false);
  }
}, []);

  // Sync offline messages
const syncOfflineMessages = useCallback(async () => {
  if (!debtId || !isOnline || isSyncing) {
    console.log('⏭️ Skip sync:', { debtId, isOnline, isSyncing });
    return;
  }
  
  console.log('🔄 Starting auto-sync of offline messages');
  
  setIsSyncing(true);
  
  try {
    const offlineMessages = getOfflineMessages(debtId);
    
    if (offlineMessages.length === 0) {
      console.log('📭 No offline messages to sync');
      setIsSyncing(false);
      return;
    }
    
    console.log('📝 Offline messages found:', offlineMessages.length);
    
    // Group messages by status
    const messagesToSync = {
      pending: offlineMessages.filter(m => m.pending && !m.failed),
      failed: offlineMessages.filter(m => !m.pending && m.failed),
      others: offlineMessages.filter(m => !m.pending && !m.failed)
    };
    
    console.log('📊 Messages to process:', {
      pending: messagesToSync.pending.length,
      failed: messagesToSync.failed.length,
      others: messagesToSync.others.length
    });
    
    // Show notification
    
    // Track processed messages to avoid duplicates
    const processedIds = new Set<string>();
    const results = [];
    
    // Process ALL messages (pending + failed)
    const allMessages = [...messagesToSync.pending, ...messagesToSync.failed];
    
    for (const msg of allMessages) {
      if (!msg.localId || processedIds.has(msg.localId)) {
        console.log('⏭️ Skipping already processed:', msg.localId);
        continue;
      }
      
      processedIds.add(msg.localId);
      
      try {
        console.log('🔄 Sending offline message:', {
          localId: msg.localId,
          text: msg.text?.substring(0, 30),
          pending: msg.pending,
          failed: msg.failed
        });
        
        // Update UI immediately
        setMessages(prev => prev.map(m => 
          m.localId === msg.localId 
            ? { ...m, pending: true, failed: false } 
            : m
        ));
        
        // Send to server
        const response = await api.post(`/chats/${debtId}/messages`, {
          text: msg.text,
          replyTo: msg.replyTo
        });
        
        const serverMessage: Message = {
          ...response.data,
          isMine: true,
          pending: false,
          failed: false,
          localId: undefined,
        };
        
        // Update state - replace local with server message
        setMessages(prev => {
          // Remove the local message
          const withoutLocal = prev.filter(m => m.localId !== msg.localId);
          
          // Add server message if not already present
          const alreadyExists = withoutLocal.some(m => m._id === serverMessage._id);
          let updated = withoutLocal;
          
          if (!alreadyExists) {
            updated = [...withoutLocal, serverMessage];
          }
          
          // Deduplicate and sort
          const deduplicated = deduplicateMessages(updated);
          const sorted = deduplicated.sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          
          // Save to cache (only server messages)
          saveToCache(debtId, sorted.filter(m => !m.localId?.startsWith('local_')));
          
          return sorted;
        });
        
        // Remove from offline storage
        removeOfflineMessage(debtId, msg.localId);
        
        results.push({ success: true, localId: msg.localId });
        console.log('✅ Successfully sent:', msg.localId);
        
      } catch (error) {
        console.error('❌ Failed to send:', msg.localId, error);
        
        // Mark as failed in UI
        setMessages(prev => prev.map(m => 
          m.localId === msg.localId 
            ? { ...m, pending: false, failed: true } 
            : m
        ));
        
        // Update offline storage with failed status
        const updatedMessage = {
          ...msg,
          pending: false,
          failed: true
        };
        saveOfflineMessage(debtId, updatedMessage);
        
        results.push({ success: false, localId: msg.localId });
      }
      
      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
  
    
    // // Show results
    // const successful = results.filter(r => r.success).length;
    // const failed = results.filter(r => !r.success).length;
    
    // if (successful > 0 || failed > 0) {
    //   setTimeout(() => {
    //     if (successful > 0) {
    //       const successNotification = document.createElement('div');
    //       successNotification.className = 'fixed top-20 right-4 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg z-[9999] animate-fade-in';
    //       successNotification.textContent = `✅ Отправлено ${successful} сообщений`;
    //       document.body.appendChild(successNotification);
          
    //       setTimeout(() => {
    //         successNotification.classList.add('animate-fade-out');
    //         setTimeout(() => {
    //           document.body.removeChild(successNotification);
    //         }, 300);
    //       }, 2000);
    //     }
        
    //     if (failed > 0) {
    //       const failNotification = document.createElement('div');
    //       failNotification.className = 'fixed top-20 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-[9999] animate-fade-in';
    //       failNotification.textContent = `❌ Не удалось отправить ${failed} сообщений`;
    //       document.body.appendChild(failNotification);
          
    //       setTimeout(() => {
    //         failNotification.classList.add('animate-fade-out');
    //         setTimeout(() => {
    //           document.body.removeChild(failNotification);
    //         }, 300);
    //       }, 2000);
    //     }
    //   }, 1500);
    // }
    
  } catch (error) {
    console.error('❌ Sync error:', error);
  } finally {
    setIsSyncing(false);
  }
}, [debtId, isOnline, isSyncing, getOfflineMessages, removeOfflineMessage, saveToCache, deduplicateMessages, saveOfflineMessage]);
 

// Format functions
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    }).replace(':', '.');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Сегодня';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Вчера';
    } else {
      return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      });
    }
  };

  // Get replied message
  const getRepliedMessage = useCallback((replyToId: string): Message | null => {
    if (!replyToId) return null;
    const repliedMessage = messages.find(m => m._id === replyToId);
    return repliedMessage || null;
  }, [messages]);

  // Handle socket messages
// Replace the handleNewMessage function with this updated version
const handleNewMessage = useCallback((data: any) => {
  if (data.debtId === debtId) {
    console.log('📨 Socket message received:', {
      id: data._id,
      isMine: data.senderId === user?.globalIdentityId,
      debtId: data.debtId
    });
     const messageKey = `${data._id}_${data.createdAt}`;
    
    // Skip if we just processed this message
    if (lastSocketMessage === messageKey) {
      console.log('⏭️ Skipping rapid duplicate:', data._id);
      return;
    }
    
    setLastSocketMessage(messageKey);
    // Check if this message already exists in our state
    const existingMessage = messages.find(msg => 
      msg._id === data._id || 
      (msg.localId && data.localId && msg.localId === data.localId)
    );
    
    if (existingMessage) {
      console.log('⚠️ Duplicate socket message, skipping:', data._id);
      return;
    }
    
    const newMsg: Message = {
      _id: data._id,
      text: data.text,
      senderId: data.senderId,
      senderName: data.senderName,
      createdAt: data.createdAt,
      read: data.read || false,
      readBy: data.readBy || [],
      isMine: data.senderId === user?.globalIdentityId,
      isSystemMessage: data.isSystemMessage || false,
      type: data.type || "text",
      replyTo: data.replyTo || undefined,
      pending: false,
      failed: false,
      localId: undefined,
    };
    
    setMessages(prev => {
      // Create a Set of existing message IDs for quick lookup
      const existingIds = new Set(prev.map(m => m._id));
      
      // Skip if already exists
      if (existingIds.has(newMsg._id)) {
        return prev;
      }
      
      // Check for local duplicates
      const filtered = prev.filter(msg => {
        // Keep server messages
        if (msg._id && !msg._id.startsWith('local_')) return true;
        
        // For local messages, check if they match the new server message
        if (msg.isMine && newMsg.isMine && msg.text === newMsg.text) {
          const timeDiff = Math.abs(
            new Date(msg.createdAt).getTime() - 
            new Date(newMsg.createdAt).getTime()
          );
          // If within 3 seconds and same text, it's a duplicate
          if (timeDiff < 3000) {
            console.log('🗑️ Removing local duplicate:', msg.localId);
            if (debtId && msg.localId) {
              removeOfflineMessage(debtId, msg.localId);
            }
            return false;
          }
        }
        return true;
      });
      
      const updated = [...filtered, newMsg];
      const deduplicated = deduplicateMessages(updated);
      const sorted = deduplicated.sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      
      if (debtId) {
        saveToCache(debtId, sorted);
      }
      return sorted;
    });
    
    if (!newMsg.isMine && !newMsg.read) {
      setUnreadMessages(prev => [...prev, newMsg._id]);
    }
    
    if (!newMsg.isMine) {
      setTimeout(() => scrollToBottom(), 100);
    }
  }
}, [debtId, user?.globalIdentityId, messages, deduplicateMessages, saveToCache, removeOfflineMessage, scrollToBottom, lastSocketMessage]);


const checkAndSyncOfflineMessages = useCallback(async () => {
  if (!debtId || !isOnline || isSyncing) {
    console.log('⏭️ Skipping sync check:', { debtId, isOnline, isSyncing });
    return;
  }
  
  console.log('🔍 Checking for offline messages to sync');
  
  const offlineMessages = getOfflineMessages(debtId);
  const pendingMessages = offlineMessages.filter(m => m.pending && !m.failed);
  
  if (pendingMessages.length === 0) {
    console.log('📭 No pending messages to sync');
    return;
  }
  
  console.log(`🔄 Found ${pendingMessages.length} pending messages, starting sync`);
  
  // Start sync
  await syncOfflineMessages();
}, [debtId, isOnline, isSyncing, getOfflineMessages, syncOfflineMessages]);

  // Socket message handlers
// Update handleMessageRead function
// Update handleMessageRead function to immediately update local state
// Обновите handleMessageRead чтобы предотвратить дублирование
// In Chat.tsx - Update handleMessageRead function
const handleMessageRead = useCallback((data: any) => {
  if (data.debtId === debtId) {
    // Create a unique event ID for deduplication
    const eventId = `${data.messageId}_${data.readerId}_${new Date(data.timestamp || Date.now()).getTime()}`;
    
    // Check if we already processed this event
    const processedEvents = sessionStorage.getItem('processedReadEvents') || '[]';
    const processedArray = JSON.parse(processedEvents);
    
    if (processedArray.includes(eventId)) {
      console.log('⏭️ Skipping duplicate read event:', eventId);
      return;
    }
    
    // Add to processed events (keep only last 50)
    processedArray.push(eventId);
    if (processedArray.length > 50) {
      processedArray.shift();
    }
    sessionStorage.setItem('processedReadEvents', JSON.stringify(processedArray));
    
    console.log('📖 Processing message read event:', {
      messageId: data.messageId,
      readerId: data.readerId,
      eventId
    });
    
    // Update messages state
    setMessages(prev => {
      const updated = prev.map(msg => {
        if (msg._id === data.messageId && !msg.isMine) {
          const alreadyReadBy = msg.readBy.includes(data.readerId);
          if (!alreadyReadBy) {
            return {
              ...msg,
              read: true,
              readBy: [...new Set([...msg.readBy, data.readerId])]
            };
          }
        }
        return msg;
      });
      
      // Save to cache
      if (debtId) {
        saveToCache(debtId, updated);
      }
      
      return updated;
    });
    
    // Remove from unread list
    setUnreadMessages(prev => prev.filter(id => id !== data.messageId));
  }
}, [debtId, saveToCache]);
// Update handleAllRead function
const handleAllRead = useCallback((data: any) => {
  if (data.debtId === debtId) {
    console.log('📖 All messages read event:', data);
    
    setMessages(prev => prev.map(msg => {
      if (!msg.isMine) {
        return {
          ...msg,
          read: true,
          readBy: [...new Set([...msg.readBy, data.readerId || user?.globalIdentityId || ''])]
        };
      }
      return msg;
    }));
    setUnreadMessages([]);
    
    setTimeout(() => {
      if (debtId) saveToCache(debtId, messages);
    }, 0);
  }
}, [debtId, user?.globalIdentityId, messages, saveToCache]);


 const handleMessageDeleted = useCallback((data: any) => {
  if (data.debtId === debtId) {
    setMessages(prev => {
      const updated = prev.filter(msg => msg._id !== data.messageId);
      if (debtId) {
        saveToCache(debtId, updated);
      }
      return updated;
    });
  }
}, [debtId, saveToCache]);

const handleChatCleared = useCallback((data: any) => {
  if (data.debtId === debtId && debtId) {
    setMessages([]);
    localStorage.removeItem(CHAT_CACHE_KEY(debtId));
    localStorage.removeItem(OFFLINE_MESSAGES_KEY(debtId));
  }
}, [debtId]);
 // Mark as read functions

// Add this socket handler for your own messages being read
// Добавьте эту функцию в Chat.tsx
// Обновите handleYourMessageRead функцию
const handleYourMessageRead = useCallback((data: any) => {
  if (data.debtId === debtId) {
    console.log('📖 Your message was read event received:', data);
    
    setMessages(prev => {
      const updated = prev.map(msg => {
        if (msg._id === data.messageId && msg.isMine) {
          const updatedReadBy = data.readBy 
            ? [...new Set([...msg.readBy, data.readBy])]
            : data.readerId 
              ? [...new Set([...msg.readBy, data.readerId])]
              : msg.readBy;
          
          return {
            ...msg,
            read: updatedReadBy.length > 0,
            readBy: updatedReadBy
          };
        }
        return msg;
      });
      
      // Сохраняем в кэш
      if (debtId) {
        saveToCache(debtId, updated);
      }
      
      return updated;
    });
  }
}, [debtId, saveToCache]);
// Добавьте в socket обработчики:
// Replace the current markAllAsRead function
// Update markAllAsRead function for immediate visual feedback
const markAllAsRead = useCallback(async () => {
  if (!debtId || !isOnline || messages.length === 0) return;
  
  // Check if there are any unread messages from others
  const unreadFromOthers = messages.filter(msg => 
    !msg.isMine && 
    !msg.read && 
    msg.senderId !== user?.globalIdentityId
  );
  
  if (unreadFromOthers.length === 0) return;
  
  console.log('👁️ Marking all messages as read:', unreadFromOthers.length);
  
  try {
    // Update locally first for instant feedback
    setMessages(prev => prev.map(msg => {
      if (!msg.isMine && msg.senderId !== user?.globalIdentityId) {
        return {
          ...msg,
          read: true,
          readBy: [...new Set([...msg.readBy, user?.globalIdentityId || ''])]
        };
      }
      return msg;
    }));
    
    // Clear unread messages immediately
    setUnreadMessages([]);
    
    // Update notifications
    updateMessageNotifications(debtId);
    
    // Save to cache immediately
    if (debtId) {
      saveToCache(debtId, messages.map(msg => {
        if (!msg.isMine && msg.senderId !== user?.globalIdentityId) {
          return { ...msg, read: true };
        }
        return msg;
      }));
    }
    
    // Send to server
    if (isOnline) {
      await api.post(`/chats/${debtId}/read`);
      
      // Emit socket event for all messages
      socket.emit("chat:mark-read", { 
        debtId, 
        messageIds: unreadFromOthers.map(m => m._id),
        readerId: user?.globalIdentityId,
        allRead: true
      });
      
      console.log('✅ All messages marked as read and notified server');
    }
    
  } catch (error) {
    console.error("Error marking as read:", error);
  }
}, [debtId, isOnline, messages, user?.globalIdentityId, saveToCache, updateMessageNotifications]); // Auto-mark as read on focus
 useEffect(() => {
  // Логируем все запросы к API
  const originalRequest = api.interceptors.request.use(
    (config) => {
      if (config.url?.includes('/read')) {
        console.log('📤 Sending read request:', {
          url: config.url,
          method: config.method,
          debtId
        });
      }
      return config;
    }
  );

  const originalResponse = api.interceptors.response.use(
    (response) => {
      if (response.config.url?.includes('/read')) {
        console.log('📥 Read response received:', {
          url: response.config.url,
          status: response.status,
          data: response.data
        });
      }
      return response;
    },
    (error) => {
      if (error.config?.url?.includes('/read')) {
        console.error('❌ Read request failed:', {
          url: error.config.url,
          status: error.response?.status,
          message: error.message
        });
      }
      return Promise.reject(error);
    }
  );

  return () => {
    api.interceptors.request.eject(originalRequest);
    api.interceptors.response.eject(originalResponse);
  };
}, [debtId]);
useEffect(() => {
  if (!debtId || !isOnline) return;
  
  const autoMarkAsRead = () => {
    const hasUnread = messages.some(msg => !msg.isMine && !msg.read);
    if (hasUnread) {
      console.log('👁️ Auto-marking messages as read');
      markAllAsRead();
    }
  };

  // При фокусе окна
  window.addEventListener('focus', autoMarkAsRead);
  
  // При изменении видимости
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      autoMarkAsRead();
    }
  });

  // Автоматически через 1 секунду после загрузки
  const timer = setTimeout(autoMarkAsRead, 1000);
  
  return () => {
    window.removeEventListener('focus', autoMarkAsRead);
    document.removeEventListener('visibilitychange', autoMarkAsRead);
    clearTimeout(timer);
  };
}, [debtId, isOnline, messages, markAllAsRead]);

// Chat.tsx - Обновите handleTyping
const handleTyping = useCallback(() => {
  if (!debtId || !isOnline || !socket.connected) return;

  // Clear any existing timeout
  if (typingTimeoutRef.current) {
    clearTimeout(typingTimeoutRef.current);
  }

  // Throttle typing events (don't send on every keystroke)
  if (typingTimeoutRef.current === undefined) {
    // Send typing start immediately
    socket.emit("chat:typing", { debtId, isTyping: true });
    socketService.sendTypingIndicator(debtId, true);
  }

  // Reset timeout for typing end
  typingTimeoutRef.current = setTimeout(() => {
    socket.emit("chat:typing", { debtId, isTyping: false });
    socketService.sendTypingIndicator(debtId, false);
    typingTimeoutRef.current = undefined; // Reset to allow next typing start
  }, 1500); // Increased to 1.5 seconds for better UX

  // Scroll to bottom
  setTimeout(() => scrollToBottom(), 100);
}, [debtId, isOnline, scrollToBottom]);
 
const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
  const value = e.target.value;
  setNewMessage(value);
  
  // Only send typing indicator if user is actually typing (not just deleting or pasting)
  if (value.length > 0 && isOnline && value.trim().length > 0) {
    handleTyping();
  }
}, [isOnline, handleTyping]);


// Socket connection
 // Replace the socket connection useEffect with this
// Replace the socket connection useEffect with this
// ЗАМЕНИТЕ весь ваш socket useEffect на этот
// Chat.tsx - Упрощенный socket useEffect
// Chat.tsx - УПРОЩЕННЫЙ socket useEffect
useEffect(() => {
  // Если нет нужных данных или сокет не подключен
  if (!debtId || !user?.globalIdentityId || !socket.connected) {
    console.log('🔌 Chat: Skipping socket setup - missing data or not connected');
    setSocketInitialized(false);
    return;
  }

  // Если уже инициализировали сокет для этого чата
  if (socketInitialized && socketService.getCurrentDebtId() === debtId) {
    console.log('🔌 Chat: Socket already initialized for this debt');
    return;
  }

  console.log('🔗 Chat: Setting up socket for debt:', debtId);

  // Используем сервис для присоединения к комнате
  socketService.joinDebtRoom(debtId);

  // Создаем именованные функции для обработчиков
  const onNewMessage = (data: any) => {
    if (data.debtId === debtId) {
      console.log('📨 Chat: New message via socket:', data._id);
      handleNewMessage(data);
    }
  };

  const onTyping = (data: any) => {
    if (data.debtId === debtId && data.identityId !== user?.globalIdentityId) {
      setOtherIsTyping(data.isTyping);
    }
  };

  const onMessageRead = (data: any) => {
    if (data.debtId === debtId) {
      console.log('📖 Chat: Message read event:', data.messageId);
      handleMessageRead(data);
    }
  };

  const onAllRead = (data: any) => {
    if (data.debtId === debtId) {
      console.log('📚 Chat: All messages read event');
      handleAllRead(data);
    }
  };

  const onMessageDeleted = (data: any) => {
    if (data.debtId === debtId) {
      handleMessageDeleted(data);
    }
  };

  const onChatCleared = (data: any) => {
    if (data.debtId === debtId) {
      handleChatCleared(data);
    }
  };

  const onYourMessageRead = (data: any) => {
    if (data.debtId === debtId) {
      console.log('📖 Chat: Your message was read:', data.messageId);
      handleYourMessageRead(data);
    }
  };

  const onUserStatusChanged = (data: any) => {
    if (data.identityId === chatInfo?.otherParticipant.identityId) {
      handleUserStatus(data);
    }
  };

  // Добавляем все слушатели
  socket.on("chat:new-message", onNewMessage);
  socket.on("chat:typing", onTyping);
  socket.on("chat:message-read", onMessageRead);
  socket.on("chat:all-read", onAllRead);
  socket.on("chat:message-deleted", onMessageDeleted);
  socket.on("chat:cleared", onChatCleared);
  socket.on("chat:your-message-read", onYourMessageRead);
  socket.on("user:status-changed", onUserStatusChanged);

  setSocketInitialized(true);

  // Очистка при размонтировании или изменении debtId
  return () => {
    console.log('🧹 Chat: Cleaning up socket listeners for debt:', debtId);
    
    // Удаляем все слушатели
    socket.off("chat:new-message", onNewMessage);
    socket.off("chat:typing", onTyping);
    socket.off("chat:message-read", onMessageRead);
    socket.off("chat:all-read", onAllRead);
    socket.off("chat:message-deleted", onMessageDeleted);
    socket.off("chat:cleared", onChatCleared);
    socket.off("chat:your-message-read", onYourMessageRead);
    socket.off("user:status-changed", onUserStatusChanged);
    
    // Покидаем комнату через сервис
    socketService.leaveDebtRoom(debtId);
    
    setSocketInitialized(false);
  };
}, [
  debtId, 
  user?.globalIdentityId,
  socket.connected, // Добавьте эту зависимость
  handleNewMessage,
  handleMessageRead,
  handleAllRead,
  handleMessageDeleted,
  handleChatCleared,
  handleYourMessageRead,
  handleUserStatus
]);

// Добавьте этот useEffect для обновления статуса сокета
useEffect(() => {
  const checkSocketStatus = () => {
    console.log('🔍 Chat: Socket status check:', {
      debtId,
      socketConnected: socket.connected,
      inRoom: socketService.getCurrentDebtId(),
      user: user?.globalIdentityId
    });
  };

  // Проверяем статус каждые 10 секунд (для отладки)
  const interval = setInterval(checkSocketStatus, 10000);
  
  return () => clearInterval(interval);
}, [debtId, user?.globalIdentityId]);

// Add this useEffect for socket reconnection

// Load chat data
// Replace the problematic section in loadChatData function:
// Update the loadChatData function to use the correct endpoint
// Replace the loadChatData function with this version:
const loadChatData = async (pageNum = 1, isLoadMore = false) => {
  if (!debtId || !user?.globalIdentityId) return;
    // Don't load if we're already loading the same page
  if (!isLoadMore && !isInitialLoad) {
    return;
  }
  try {
    // Load cached messages immediately for instant display
    if (!isLoadMore) {
      setLoading(true);
      setChatInfoLoading(true);

       await loadChatInfo(debtId!);
      // Load and display all messages (including offline)
      const displayMessages = loadAllMessagesForDisplay(debtId);
      console.log('📦 Setting initial messages from loadAllMessagesForDisplay:', displayMessages.length);
      setMessages(displayMessages);
      
      // Load chat info
      const cachedInfo = loadChatInfoFromCache(debtId);
      if (cachedInfo) {
        setChatInfo(cachedInfo);
      }
    }
    
    // Load fresh messages from server if online
    if (isOnline) {
      console.log('🌐 Loading fresh messages from server, page:', pageNum);
      const response = await api.get(`/chats/${debtId}?page=${pageNum}&limit=${messagesPerPage}`);
      
      const serverMessages: Message[] = response.data.messages.map((msg: any) => ({
        _id: msg._id,
        text: msg.text,
        senderId: msg.senderId,
        senderName: msg.senderName,
        createdAt: msg.createdAt,
        read: msg.read || false,
        readBy: msg.readBy || [],
        isMine: msg.senderId === user?.globalIdentityId,
        isSystemMessage: msg.isSystemMessage || false,
        type: msg.type || "text",
        replyTo: msg.replyTo || undefined,
        pending: false,
        failed: false,
        localId: undefined,
      }));
            // Обновляем информацию о чате из ответа сервера, если есть
      if (response.data.chatInfo) {
          const localName = getCustomerLocalName(
    response.data.chatInfo.otherParticipant.phone,
    response.data.chatInfo.otherParticipant.identityId,
    response.data.chatInfo.otherParticipant.name || "Неизвестный пользователь"
  );
      const serverChatInfo: ChatInfo = {
    debtId: response.data.chatInfo.debtId,
    otherParticipant: {
      identityId: response.data.chatInfo.otherParticipant.identityId,
      name: localName,
      localName: localName,
      phone: response.data.chatInfo.otherParticipant.phone || "Неизвестен",
      avatar: response.data.chatInfo.otherParticipant.avatar,
      status: response.data.chatInfo.otherParticipant.status,
      lastSeen: response.data.chatInfo.otherParticipant.lastSeen,
      isVerified: response.data.chatInfo.otherParticipant.isVerified,
      isRegistered: response.data.chatInfo.otherParticipant.isRegistered,
    },
    settings: response.data.chatInfo.settings
  };
        
        setChatInfo(serverChatInfo);
        saveChatInfoToCache(debtId, serverChatInfo);
      }

      console.log('📨 Fresh server messages loaded:', serverMessages.length);
      
      setMessages(prev => {
        // Keep offline messages
        const offlineMessages = prev.filter(msg => 
          msg.localId?.startsWith('local_')
        );
        
        console.log('📱 Preserving offline messages:', offlineMessages.length);
        
        if (isLoadMore) {
          // For load more, combine but preserve offline messages
          const merged = [...serverMessages, ...prev.filter(msg => !msg.localId?.startsWith('local_'))];
          const deduplicated = deduplicateMessages([...offlineMessages, ...merged]);
          const sorted = deduplicated.sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          
          if (debtId) {
            saveToCache(debtId, sorted);
          }
          return sorted;
        } else {
          // For initial load, combine server messages with offline messages
          const combined = [...offlineMessages, ...serverMessages];
          const deduplicated = deduplicateMessages(combined);
          const sorted = deduplicated.sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          
          if (debtId) {
            saveToCache(debtId, sorted);
          }
          return sorted;
        }
      });
      
      // Update pagination state
      setHasMoreMessages(response.data.pagination?.hasMore || false);
    }
   updateMessageNotifications(debtId);

  } catch (error: any) {
    console.error("❌ Error loading chat:", error);
    
    // In offline mode, ensure we have data
    if (!isOnline) {
      const displayMessages = loadAllMessagesForDisplay(debtId);
      if (displayMessages.length > 0 && messages.length === 0) {
        setMessages(displayMessages);
        console.log('📦 Using combined messages in offline mode:', displayMessages.length);
      }
      
      // Ensure chat info exists
      if (!chatInfo) {
        const defaultChatInfo = {
          debtId: debtId!,
          otherParticipant: {
            identityId: 'unknown',
            name: 'Оффлайн чат',
            phone: '',
            isRegistered: false,
            isOfflineFallback: true
          },
          settings: {
            isMuted: false,
            isArchived: false,
            isPinned: false,
            customNotification: false
          }
        };
        setChatInfo(defaultChatInfo);
        saveChatInfoToCache(debtId, defaultChatInfo);
      }
    }
  } finally {
    setLoading(false);
    setLoadingMore(false);
    setChatInfoLoading(false);
  }
};
  // Initial load
 // Update the initial load effect
// Update the initial load effect
// Update the initial load useEffect
useEffect(() => {
  if (debtId && isInitialLoad) {
    console.log('🚀 Initial load for chat:', debtId);
    setPage(1);
    setHasMoreMessages(true);
    
    // Step 1: Try to load from cache immediately
    const cachedMessages = loadAllMessagesForDisplay(debtId);
    const cachedChatInfo = loadChatInfoFromCache(debtId);
    
    // If we have cached data, show it immediately
    if (cachedMessages.length > 0 || cachedChatInfo) {
      console.log('📦 Showing cached data immediately');
      
      if (cachedMessages.length > 0) {
        setMessages(cachedMessages);
      }
      
      if (cachedChatInfo) {
        setChatInfo(cachedChatInfo);
      }
      
      setLoading(false);
      setChatInfoLoading(false);
      
      // Scroll to show newest messages
      setTimeout(() => {
        if (cachedMessages.length > 0) {
          scrollToBottom(true);
        }
      }, 100);
    }
    
    // Step 2: Always try to load fresh data from server
    const loadFreshData = async () => {
      try {
        await loadChatInfo(debtId);
        
        if (isOnline) {
          await loadChatData(1, false);
        } else {
          // If offline and no cached data, load default
          if (cachedMessages.length === 0 && !cachedChatInfo) {
            const defaultChatInfo: ChatInfo = {
              debtId,
              otherParticipant: {
                identityId: 'unknown',
                name: 'Оффлайн чат',
                localName: getCustomerLocalName(undefined, undefined, 'Оффлайн чат'),
                phone: '',
                isRegistered: false,
                isOfflineFallback: true
              },
              settings: {
                isMuted: false,
                isArchived: false,
                isPinned: false,
                customNotification: false
              }
            };
            setChatInfo(defaultChatInfo);
          }
        }
      } catch (error) {
        console.error('❌ Error loading fresh data:', error);
      } finally {
        setIsInitialLoad(false);
      }
    };
    
    // Small delay to allow UI to show cached data first
    setTimeout(loadFreshData, 100);
  }
}, [debtId, isInitialLoad, isOnline, loadChatData, loadAllMessagesForDisplay, scrollToBottom, loadChatInfo]);
// Add this useEffect to debug state updates
useEffect(() => {
  console.log('🔄 Messages state updated:', {
    total: messages.length,
    offline: messages.filter(m => m.localId?.startsWith('local_')).length,
    pending: messages.filter(m => m.pending).length,
    firstFew: messages.slice(0, 3).map(m => ({
      text: m.text?.substring(0, 20),
      pending: m.pending,
      localId: m.localId
    }))
  });
}, [messages]);

// Add this effect for background auto-sync when coming online
useEffect(() => {
  let syncTimeout: ReturnType<typeof setTimeout> | null = null;
  
  const performSync = () => {
    if (!debtId || !isOnline || isSyncing) return;
    
    const offlineMessages = getOfflineMessages(debtId);
    const needsSync = offlineMessages.some(m => m.pending && !m.failed) || 
                     offlineMessages.some(m => m.failed);
    
    if (needsSync) {
      console.log('🔄 Scheduled sync triggered');
      syncOfflineMessages();
    }
  };
  
  // Schedule sync when coming online
  if (isOnline && debtId) {
    syncTimeout = setTimeout(() => {
      performSync();
    }, 3000); // Wait 3 seconds after coming online
    
    // Periodic check every 30 seconds
    const interval = setInterval(performSync, 30000);
    
    return () => {
      if (syncTimeout) clearTimeout(syncTimeout);
      clearInterval(interval);
    };
  }
}, [debtId, isOnline, isSyncing, getOfflineMessages, syncOfflineMessages]);

// Add this effect after the network status effect
useEffect(() => {
  const handleOnline = () => {
    console.log('🌐 Network online detected');
    setIsOnline(true);
    
    // Debounce sync to avoid multiple calls
    if (debtId) {
      console.log('🔄 Scheduling sync after coming online');
      const syncTimer = setTimeout(() => {
        checkAndSyncOfflineMessages();
      }, 2000); // Wait 2 seconds for stable connection
      
      return () => clearTimeout(syncTimer);
    }
  };
  
  const handleOffline = () => {
    console.log('📴 Network offline detected');
    setIsOnline(false);
  };
  
  // Check initial state
  if (navigator.onLine !== isOnline) {
    setIsOnline(navigator.onLine);
  }
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}, [debtId, checkAndSyncOfflineMessages]);

useEffect(() => {
  if (!debtId || !isOnline) return;
  
  // Periodic sync every 30 seconds when online
  const interval = setInterval(() => {
    checkAndSyncOfflineMessages();
  }, 30000);
  
  return () => clearInterval(interval);
}, [debtId, isOnline, checkAndSyncOfflineMessages]);
// Reset isInitialLoad when debtId changes
useEffect(() => {
  setIsInitialLoad(true);
}, [debtId]);
  // Sync when coming online
  useEffect(() => {
    if (isOnline && debtId) {
      const timer = setTimeout(() => {
        syncOfflineMessages();
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [isOnline, debtId, syncOfflineMessages]);

  // Auto-scroll on load
// Fix the auto-scroll useEffect
// Fix the auto-scroll useEffect
useEffect(() => {
  if (!loading && messages.length > 0) {
    console.log('📜 Messages loaded, scrolling to bottom...', {
      total: messages.length,
      offline: messages.filter(m => m.localId?.startsWith('local_')).length,
      hasPending: messages.filter(m => m.pending).length > 0
    });
    
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      scrollToBottom(true); // Instant scroll
      
      // Double-check scroll position
      setTimeout(() => {
        if (chatContainerRef.current) {
          const container = chatContainerRef.current;
          const isAtBottom = 
            container.scrollHeight - container.scrollTop - container.clientHeight < 50;
          
          if (!isAtBottom) {
            console.log('⚠️ Not at bottom, forcing scroll...');
            scrollToBottom(true);
          }
        }
      }, 100);
    }, 300);
  }
}, [loading, messages.length, scrollToBottom]);


// Handle scroll events
  const handleScroll = useCallback(() => {
  if (showMessageActions) setShowMessageActions(null); 
  
  if (!chatContainerRef.current) return;
    
    const container = chatContainerRef.current;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollToBottom(!isAtBottom);
    
    if (scrollTop < 200 && hasMoreMessages && !loadingMore) {
      loadMoreMessages();
    }
  }, [showMessageActions, hasMoreMessages, loadingMore]);

  const loadMoreMessages = () => {
    if (!loadingMore && hasMoreMessages) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadChatData(nextPage, true);
    }
  };

  // Send message
const sendMessage = async () => {
  if (!newMessage.trim() || !debtId) return;

  const messageText = newMessage.trim();
  const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Clear input immediately
  setNewMessage("");
  setReplyMessage(null);
  
  const localMessage: Message = {
    _id: localId,
    text: messageText,
    senderId: user?.globalIdentityId || '',
    senderName: user?.name || 'Вы',
    createdAt: new Date().toISOString(),
    read: false,
    readBy: [],
    isMine: true,
    isSystemMessage: false,
    type: "text",
    pending: true, // Always pending initially
    localId,
    failed: false,
    replyTo: replyMessage?._id,
  };
  
  console.log('📝 Creating message:', {
    text: messageText.substring(0, 30),
    localId,
    isOnline
  });
  
  // CRITICAL: Save to offline storage FIRST
  console.log('💾 Saving to offline storage');
  saveOfflineMessage(debtId, localMessage);
  
  // Add to UI state
  setMessages(prev => {
    const updated = [...prev, localMessage];
    console.log('🔄 Added to UI state, total:', updated.length);
    
    // Save server messages to cache (but not local messages)
    saveToCache(debtId, updated.filter(m => !m.localId?.startsWith('local_')));
    
    return updated;
  });
  
  // Scroll to show new message
  setTimeout(() => scrollToBottom(), 100);
  
  // Try to send immediately if online
  if (isOnline) {
    console.log('🌐 Online, sending immediately');
    setTimeout(() => {
      sendPendingMessage(localMessage, localId);
    }, 100);
  } else {
    console.log('📱 Offline, message saved for later sync');
    
    // Show offline notification
    const notification = document.createElement('div');
    notification.className = 'fixed top-20 right-4 bg-amber-500 text-white px-4 py-2 rounded-lg shadow-lg z-[9999] animate-fade-in';
    notification.textContent = '📱 Сообщение сохранено оффлайн';
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('animate-fade-out');
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 2000);
  }
};

// Updated sendPendingMessage function with proper error handling
const sendPendingMessage = async (message: Message, localId: string) => {
  if (!debtId || !isOnline) return;
  
  try {
    console.log('🌐 Sending pending message:', localId);
    
    // Update message to show "sending" status
    setMessages(prev => prev.map(msg => 
      msg.localId === localId 
        ? { ...msg, pending: true, failed: false } 
        : msg
    ));
    
    const response = await api.post(`/chats/${debtId}/messages`, {
      text: message.text,
      replyTo: message.replyTo
    });
    
    const serverMessage: Message = {
      ...response.data,
      isMine: true,
      pending: false,
      failed: false,
      localId: undefined,
    };
    
    // Update state: replace local with server message
    setMessages(prev => {
      // Remove the local message
      const withoutLocal = prev.filter(msg => msg.localId !== localId);
      
      // Check if already exists
      const alreadyExists = withoutLocal.some(msg => msg._id === serverMessage._id);
      
      let finalMessages = withoutLocal;
      if (!alreadyExists) {
        finalMessages = [...withoutLocal, serverMessage];
      }
      
      const deduplicated = deduplicateMessages(finalMessages);
      const sorted = deduplicated.sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      
      saveToCache(debtId, sorted);
      return sorted;
    });
    
    // Remove from offline storage
    removeOfflineMessage(debtId, localId);
    
    console.log('✅ Pending message sent successfully');
    
  } catch (error) {
    console.error("❌ Error sending pending message:", error);
    
    // Update to failed ONLY for actual send errors
    setMessages(prev => prev.map(msg => 
      msg.localId === localId 
        ? { ...msg, pending: false, failed: true } 
        : msg
    ));
    
    // Update offline storage with failed status
    const updatedMessage = {
      ...message,
      pending: false,
      failed: true
    };
    saveOfflineMessage(debtId, updatedMessage);
  }
};
  // Message actions
  const handleMessageAction = async (messageId: string, action: string) => {
    const message = messages.find(m => m._id === messageId);
    if (!message) return;

    switch (action) {
      case 'copy':
        navigator.clipboard.writeText(message.text);
        showCopyNotification();
        break;
        
      case 'reply':
        setReplyMessage(message);
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 100);
        break;
        
      case 'delete':
        if (window.confirm('Удалить сообщение?')) {
          try {
            if (isOnline) {
              await api.delete(`/chats/${debtId}/messages/${messageId}`);
            }
            setMessages(prev => {
              const updated = prev.filter(m => m._id !== messageId);
              saveToCache(debtId!, updated);
              return updated;
            });
          } catch (error) {
            console.error("Error deleting message:", error);
          }
        }
        break;
        
      case 'retry':
  if (message.localId && message.failed) {
    console.log('🔄 Manual retry for failed message:', message.localId);
    
    // Update to pending
    setMessages(prev => prev.map(m => 
      m.localId === message.localId 
        ? { ...m, pending: true, failed: false } 
        : m
    ));
    
    // Update offline storage
    saveOfflineMessage(debtId!, {
      ...message,
      pending: true,
      failed: false
    });
    
    // Try to send immediately if online
    if (isOnline) {
      await sendPendingMessage(message, message.localId);
    }
  }
  break;
    }
    setShowMessageActions(null);
  };
// Add this effect to auto-retry when internet is restored
useEffect(() => {
  const handleOnline = async () => {
    console.log('🌐 Internet connection restored, checking for failed messages');
    
    if (!debtId) return;
    
    // Check for failed messages
    const offlineMessages = getOfflineMessages(debtId);
    const failedMessages = offlineMessages.filter(m => !m.pending && m.failed);
    
    if (failedMessages.length > 0) {
      console.log(`🔄 Found ${failedMessages.length} failed messages, auto-retrying...`);
      
      // Small delay before retry
      setTimeout(() => {
        syncOfflineMessages();
      }, 2000);
    }
  };
  
  window.addEventListener('online', handleOnline);
  
  return () => {
    window.removeEventListener('online', handleOnline);
  };
}, [debtId, getOfflineMessages, syncOfflineMessages]);
  // Notification functions
  const showCopyNotification = useCallback(() => {
    const notification = document.createElement('div');
    notification.className = 'fixed top-20 right-4 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg z-[9999] animate-fade-in';
    notification.textContent = 'Текст скопирован в буфер обмена';
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('animate-fade-out');
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 2000);
  }, []);

  const showCacheDeleteNotification = useCallback(() => {
    const notification = document.createElement('div');
    notification.className = 'fixed top-20 right-4 bg-orange-500 text-white px-4 py-2 rounded-lg shadow-lg z-[9999] animate-fade-in';
    notification.textContent = 'Локальный кэш очищен';
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('animate-fade-out');
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 2000);
  }, []);
// Add this function after other cache functions
const loadOfflineChatData = useCallback((debtId: string) => {
  console.log('📱 Loading offline chat data for:', debtId);
  
  // Load cached messages (already sent messages)
  const cachedMessages: Message[] = loadCachedMessages(debtId);
  
  // Load offline messages that need to be sent
  const offlineMessages: Message[] = getOfflineMessages(debtId);
  
  // Combine both, giving priority to offline messages (they should be more recent)
  const allMessages = [...cachedMessages, ...offlineMessages];
  
  if (allMessages.length > 0) {
    const deduplicated = deduplicateMessages(allMessages);
    const sorted = deduplicated.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    
    setMessages(sorted);
    console.log('📦 Loaded all messages (cached + offline):', sorted.length);
  }
  
  // Load cached chat info
  const cachedInfo: ChatInfo | null = loadChatInfoFromCache(debtId);
  if (cachedInfo) {
    setChatInfo(cachedInfo);
    console.log('📦 Loaded cached chat info');
  } else {
    // Create default offline chat info
    const defaultChatInfo: ChatInfo = {
      debtId,
      otherParticipant: {
        identityId: 'unknown',
        name: 'Оффлайн чат',
        phone: '',
        isRegistered: false,
        isOfflineFallback: true
      },
      settings: {
        isMuted: false,
        isArchived: false,
        isPinned: false,
        customNotification: false
      }
    };
    setChatInfo(defaultChatInfo);
    saveChatInfoToCache(debtId, defaultChatInfo);
  }
  
  // Mark that we're in offline mode
  setLoading(false);
  setChatInfoLoading(false);
}, [loadCachedMessages, loadChatInfoFromCache, saveChatInfoToCache, getOfflineMessages, deduplicateMessages]);
// Update the initial load effect to use this function
useEffect(() => {
  if (debtId && isInitialLoad) {
    console.log('🚀 Initial load for chat:', debtId);
    setPage(1);
    setHasMoreMessages(true);
    
    if (isOnline) {
      loadChatData(1, false);
    } else {
      // Load offline data immediately
      loadOfflineChatData(debtId);
      setLoading(false);
      setChatInfoLoading(false);
    }
    
    setIsInitialLoad(false);
  }
}, [debtId, isInitialLoad, isOnline, loadChatData, loadOfflineChatData]);
  // Group messages by date
  const groupedMessages = Object.entries(
    messages.reduce((groups: { [key: string]: Message[] }, message) => {
      const date = formatDate(message.createdAt);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
      return groups;
    }, {})
  );

  // Filter messages by search
  const filteredGroupedMessages = searchQuery 
    ? groupedMessages
        .map(([date, msgs]) => [
          date,
          msgs.filter((msg: Message) => 
            msg.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
            msg.senderName.toLowerCase().includes(searchQuery.toLowerCase())
          )
        ])
        .filter(([_, msgs]) => (msgs as Message[]).length > 0)
    : groupedMessages;


// In Chat.tsx - Update markMessageAsRead function
const markMessageAsRead = async (messageId: string) => {
  if (!debtId || !messageId || !isOnline) return;
  
  const message = messages.find(m => m._id === messageId);
  if (!message || message.isMine || message.read) return;

  try {
    // Create optimistic update ID for deduplication
    const optimisticId = `opt_${messageId}_${user?.globalIdentityId}_${Date.now()}`;
    
    // Update locally first
    setMessages(prev => prev.map(msg => 
      msg._id === messageId 
        ? { 
            ...msg, 
            read: true,
            readBy: [...new Set([...msg.readBy, user?.globalIdentityId || ''])]
          } 
        : msg
    ));
    
    // Remove from unread list
    setUnreadMessages(prev => prev.filter(id => id !== messageId));
    
    // Send to server
    if (isOnline) {
      const response = await api.post(`/chats/${debtId}/messages/${messageId}/read`);
      
      // Only emit socket event if server confirms
      if (response.data.success) {
        socket.emit("chat:message-read", { 
          debtId, 
          messageId,
          readerId: user?.globalIdentityId,
          timestamp: new Date().toISOString(),
          optimisticId // Include optimistic ID for deduplication
        });
      }
      
      console.log('✅ Message marked as read:', messageId);
    }
    
  } catch (error) {
    console.error("Error marking message as read:", error);
    
    // Revert optimistic update on error
    setMessages(prev => prev.map(msg => 
      msg._id === messageId 
        ? { 
            ...msg, 
            read: false,
            readBy: msg.readBy.filter(id => id !== user?.globalIdentityId)
          } 
        : msg
    ));
    
    setUnreadMessages(prev => [...prev, messageId]);
  }
};

  // Handle message click
// Update handleMessageClick
const handleMessageClick = useCallback((msg: Message, e: React.MouseEvent | React.TouchEvent) => {
  if (msg.isSystemMessage || msg.pending) return;
  
  // Prevent the chat container from handling this click
  e.stopPropagation();

  // If clicking the same message, hide it. Otherwise, show for this message.
  setShowMessageActions(prev => prev === msg._id ? null : msg._id);

  if (!msg.isMine && !msg.read && isOnline) {
    markMessageAsRead(msg._id);
  }
}, [isOnline]);
  // Typing indicator
 

  // Handle key press

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [newMessage]);

  // Chat settings actions
  const toggleMute = async () => {
    if (!chatInfo || !debtId) return;
    
    try {
      const response = await api.post(`/chats/${debtId}/settings`, {
        setting: 'isMuted',
        value: !chatInfo.settings.isMuted
      });
      
      setChatInfo(prev => prev ? {
        ...prev,
        settings: {
          ...prev.settings,
          isMuted: response.data.settings.isMuted
        }
      } : null);
    } catch (error) {
      console.error("Error toggling mute:", error);
    }
  };

  // Auto mark as read on load
  useEffect(() => {
    if (debtId && !loading && isOnline) {
      // Автоматически помечаем все сообщения как прочитанные через 1 секунду
      const timer = setTimeout(() => {
        markAllAsRead();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [debtId, loading, isOnline, messages.length]);

  // Auto mark as read after load
  useEffect(() => {
    if (!debtId || !isOnline || messages.length === 0) return;

    // Автоматически отмечаем все видимые сообщения как прочитанные
    const markVisibleMessagesAsRead = () => {
      const hasUnread = messages.some(msg => !msg.isMine && !msg.read);
      if (hasUnread) {
        markAllAsRead();
      }
    };

    // Запускаем через 2 секунды после загрузки
    const timer = setTimeout(markVisibleMessagesAsRead, 2000);
    
    return () => clearTimeout(timer);
  }, [debtId, isOnline, messages.length]);

// Call this when debugging:
// debugOfflineMessages();
  // Intersection observer for auto-read
// Add this useEffect for auto-reading visible messages
useEffect(() => {
  if (!chatContainerRef.current || !debtId || !isOnline) return;

  const observerCallback = (entries: IntersectionObserverEntry[]) => {
    const visibleUnreadMessages: string[] = [];
    
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const messageId = entry.target.getAttribute('data-message-id');
        const isMine = entry.target.getAttribute('data-is-mine') === 'true';
        
        if (messageId && !isMine) {
          const message = messages.find(m => m._id === messageId);
          if (message && !message.read) {
            visibleUnreadMessages.push(messageId);
          }
        }
      }
    });

    if (visibleUnreadMessages.length > 0) {
      // Mark visible messages as read
      setMessages(prev => prev.map(msg => 
        visibleUnreadMessages.includes(msg._id) 
          ? { 
              ...msg, 
              read: true,
              readBy: [...new Set([...msg.readBy, user?.globalIdentityId || ''])]
            } 
          : msg
      ));
      
      // Remove from unread list
      setUnreadMessages(prev => prev.filter(id => !visibleUnreadMessages.includes(id)));
      
      // Send to server
      visibleUnreadMessages.forEach(messageId => {
        if (isOnline) {
          api.post(`/chats/${debtId}/messages/${messageId}/read`)
            .catch(err => console.error('Error marking as read:', err));
          
          socket.emit("chat:message-read", { 
            debtId, 
            messageId,
            readerId: user?.globalIdentityId 
          });
          socketService.markMessageAsRead(debtId, messageId, user?.globalIdentityId || '');
        }
      });
    }
  };

  const observer = new IntersectionObserver(observerCallback, {
    root: chatContainerRef.current,
    threshold: 0.5, // 50% of message visible
  });

  // Observe all messages
  const messageElements = chatContainerRef.current.querySelectorAll('[data-message-id]');
  messageElements.forEach(el => observer.observe(el));

  return () => observer.disconnect();
}, [debtId, isOnline, messages, user?.globalIdentityId]);

const cleanupCacheDuplicates = useCallback((debtId: string) => {
  try {
    const cacheKey = CHAT_CACHE_KEY(debtId);
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) return;
    
    const cachedMessages: Message[] = JSON.parse(cached);
    
    // Remove any local messages from cache (they should only be in offline storage)
    const serverMessagesOnly = cachedMessages.filter(msg => 
      !msg.localId || !msg.localId.startsWith('local_')
    );
    
    if (serverMessagesOnly.length < cachedMessages.length) {
      localStorage.setItem(cacheKey, JSON.stringify(serverMessagesOnly));
      console.log('🧹 Removed local messages from cache:', {
        before: cachedMessages.length,
        after: serverMessagesOnly.length,
        removed: cachedMessages.length - serverMessagesOnly.length
      });
    }
  } catch (error) {
    console.error('Error cleaning cache duplicates:', error);
  }
}, []);


// Вызовите эту функцию при загрузке чата
useEffect(() => {
  if (debtId) {
    cleanupStorageDuplicates(debtId);
  }
}, [debtId, cleanupStorageDuplicates]);
// Call this in useEffect
useEffect(() => {
  if (debtId) {
    cleanupCacheDuplicates(debtId);
  }
}, [debtId, cleanupCacheDuplicates]); 



// Auto-retry failed messages every 30 seconds when online
useEffect(() => {
  if (!debtId || !isOnline) return;
  
  const interval = setInterval(() => {
    const offlineMessages = getOfflineMessages(debtId);
    const failedMessages = offlineMessages.filter(m => !m.pending && m.failed);
    
    if (failedMessages.length > 0 && !isSyncing) {
      console.log(`🔄 Periodic retry for ${failedMessages.length} failed messages`);
      syncOfflineMessages();
    }
  }, 30000); // 30 seconds
  
  return () => clearInterval(interval);
}, [debtId, isOnline, getOfflineMessages, syncOfflineMessages, isSyncing]);


// Add this useEffect near your other useEffects
useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const isEmojiButton = target.closest('button[title="Emoji"]');
    const isEmojiPicker = target.closest('.EmojiPickerReact');
    
    if (!isEmojiButton && !isEmojiPicker) {
      setShowEmojiPicker(false);
    }
  };

  document.addEventListener('mousedown', handleClickOutside);
  return () => {
    document.removeEventListener('mousedown', handleClickOutside);
  };
}, []);




// Add this useEffect to debug message state changes
useEffect(() => {
  console.log('🔍 DEBUG: Current messages state:', messages.map(m => ({
    text: m.text?.substring(0, 20),
    pending: m.pending,
    failed: m.failed,
    localId: m.localId
  })));
}, [messages]);

useEffect(() => {
  if (debtId && isInitialLoad) {
    console.log('🚀 Initial load for chat:', debtId);
    setPage(1);
    setHasMoreMessages(true);
    
    // Always load from combined sources first
    const displayMessages = loadAllMessagesForDisplay(debtId);
    setMessages(displayMessages);
    
    // Then load fresh data if online
    if (isOnline) {
      loadChatData(1, false);
    }
    
    setIsInitialLoad(false);
  }
}, [debtId, isInitialLoad, isOnline, loadChatData, loadAllMessagesForDisplay]);

const recoverOfflineMessages = useCallback((debtId: string) => {
  try {
    const cacheKey = CHAT_CACHE_KEY(debtId);
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) return;
    
    const cachedMessages: Message[] = JSON.parse(cached);
    
    // Find local messages in cache that should be in offline storage
    const localMessagesInCache = cachedMessages.filter(msg => 
      msg.localId && msg.localId.startsWith('local_')
    );
    
    if (localMessagesInCache.length > 0) {
      console.log('🆘 Found local messages in cache, moving to offline storage:', localMessagesInCache.length);
      
      // Save to offline storage
      const offlineKey = OFFLINE_MESSAGES_KEY(debtId);
      const currentOffline = getOfflineMessages(debtId);
      const combined = [...currentOffline, ...localMessagesInCache];
      
      // Deduplicate
      const unique = deduplicateMessages(combined);
      
      localStorage.setItem(offlineKey, JSON.stringify(unique));
      console.log('✅ Recovered offline messages:', unique.length);
    }
  } catch (error) {
    console.error('Error recovering offline messages:', error);
  }
}, [getOfflineMessages, deduplicateMessages]);

// Call this on mount
useEffect(() => {
  if (debtId) {
    recoverOfflineMessages(debtId);
  }
}, [debtId, recoverOfflineMessages]);

const togglePin = async () => {
    if (!chatInfo || !debtId) return;
    
    try {
      const response = await api.post(`/chats/${debtId}/settings`, {
        setting: 'isPinned',
        value: !chatInfo.settings.isPinned
      });
      
      setChatInfo(prev => prev ? {
        ...prev,
        settings: {
          ...prev.settings,
          isPinned: response.data.settings.isPinned
        }
      } : null);
    } catch (error) {
      console.error("Error toggling pin:", error);
    }
  };

  const toggleArchive = async () => {
    if (!chatInfo || !debtId) return;
    
    try {
      const response = await api.post(`/chats/${debtId}/settings`, {
        setting: 'isArchived',
        value: !chatInfo.settings.isArchived
      });
      
      setChatInfo(prev => prev ? {
        ...prev,
        settings: {
          ...prev.settings,
          isArchived: response.data.settings.isArchived
        }
      } : null);
      
      if (response.data.settings.isArchived) {
        navigate("/all-chats");
      }
    } catch (error) {
      console.error("Error toggling archive:", error);
    }
  };

  // Clear chat
  const clearChat = async () => {
    if (!debtId) return;
    
    if (!window.confirm('Очистить всю переписку?\n\n⚠️ ВНИМАНИЕ: Это действие:\n❌ Удалит все сообщения на сервере\n❌ Удалит локальный кэш\n❌ Не может быть отменено\n\nПродолжить?')) return;
    
    try {
      if (isOnline) {
        await api.delete(`/chats/${debtId}/messages`);
      }
      
      localStorage.removeItem(CHAT_CACHE_KEY(debtId));
      localStorage.removeItem(OFFLINE_MESSAGES_KEY(debtId));
      setMessages([]);
      socket.emit("chat:clear", { debtId });
      
      const notification = document.createElement('div');
      notification.className = 'fixed top-20 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-[9999] animate-fade-in';
      notification.textContent = 'Переписка очищена';
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.classList.add('animate-fade-out');
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 300);
      }, 2000);
      
    } catch (error) {
      console.error("Error clearing chat:", error);
    }
  };

  // Export chat
  const exportChat = async () => {
    try {
      const response = await api.get(`/chats/${debtId}/export`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `chat_${debtId}_${new Date().toISOString().split('T')[0]}.txt`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Error exporting chat:", error);
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
      
      if (debtId) {
        setMessages(prev => {
          const cleaned = prev.map(msg => 
            msg.pending || msg.failed 
              ? { ...msg, pending: false, failed: false }
              : msg
          );
          saveToCache(debtId, cleaned);
          return cleaned;
        });
      }
    };
  }, [debtId, longPressTimer, saveToCache]);

useEffect(() => { 
  if (debtId) {
    updateMessageNotifications(debtId);
  }
}, [debtId, updateMessageNotifications]);
  // Loading states
 // Change the initial loading check to allow showing cached messages
if (loading && messages.length === 0) {
  return (
    <div className={`flex flex-col h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950 relative safe-area-inset-bottom transition-all duration-300 ${showSidebar ? 'lg:pr-80' : 'pr-0'}`}>
      <div className="relative">
        <div className="w-16 h-16 lg:w-20 lg:h-20 border-4 border-transparent border-t-purple-500 border-r-blue-500 rounded-full animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 lg:w-12 lg:h-12 border-2 border-transparent border-b-emerald-400 border-l-pink-500 rounded-full animate-spin animation-delay-300"></div>
        </div>
        <div className="mt-6 text-center">
          <p className="text-gray-400 animate-pulse text-sm lg:text-base">Загрузка чата...</p>
        </div>
      </div>
    </div>
  );
}

// Remove or modify this condition to allow showing cached messages while loading
// Keep showing the chat even if loading is true but we have cached messages


  if (!chatInfo && messages.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950 flex flex-col items-center justify-center px-4 safe-area-inset-bottom">
        <div className="text-6xl lg:text-8xl mb-6 bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
          💬
        </div>
        <h2 className="text-xl lg:text-2xl font-bold text-white mb-2">Чат не найден</h2>
        <p className="text-gray-400 mb-8 text-center text-sm lg:text-base">Возможно, у вас нет доступа к этому чату или он был удалён</p>
        <button
          onClick={() => navigate("/all-chats")}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium transition-all duration-300 transform hover:-translate-y-0.5 shadow-lg shadow-purple-500/25 text-sm lg:text-base"
        >
          Вернуться к списку чатов
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col lg:flex-row h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950 relative safe-area-inset-bottom`}>
      {/* Call Modal */}
      {showCallModal && (
        <CallModal
          phoneNumber={chatInfo?.otherParticipant.phone || ""}
          contactName={chatInfo?.otherParticipant.name || ""}
          isOpen={showCallModal}
          onClose={() => setShowCallModal(false)}
        />
      )}

      {/* Header */}
      <div className={`bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/50 px-3 lg:px-4 py-3 flex items-center justify-between fixed top-0 left-0 right-0 z-50`} style={{ paddingTop: `calc(env(safe-area-inset-top) + 0.75rem)` }}>
        <div className="flex items-center gap-2 lg:gap-3">
          <button
            onClick={() => navigate("/all-chats")}
            className="p-2 rounded-xl hover:bg-slate-800/50 transition-all duration-200"
          >
            <ArrowLeft className="w-5 h-5 text-gray-300" />
          </button>
          
         <div className="flex items-center gap-2 lg:gap-3">
  <div className="relative">
    <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg">
      {/* ВСЕГДА показываем имя или инициалы, не показываем "..." */}
       {getInitial(chatInfo?.otherParticipant.localName || chatInfo?.otherParticipant.name || "A")}
      {chatInfo?.settings.isPinned && (
        <Pin className="absolute -top-1 -right-1 w-3 h-3 text-yellow-400" />
      )}
    </div>
    {chatInfo?.otherParticipant.isRegistered && chatInfo.otherParticipant.status === 'online' && (
      <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 lg:w-2.5 lg:h-2.5 bg-emerald-500 rounded-full border border-slate-900"></div>
    )}
  </div>
  
  <div>
    <div className="flex items-center gap-1">
      {/* ВСЕГДА показываем имя, не показываем "Загрузка..." */}
      <h2 className="text-sm lg:text-base font-semibold text-white">
        {chatInfo?.otherParticipant.localName || chatInfo?.otherParticipant.name || "Неизвестный пользователь"}
      </h2>
      {chatInfo && chatInfo.otherParticipant.isVerified && (
        <Shield className="w-3 h-3 text-blue-400" />
      )}
      {chatInfo?.settings.isMuted && (
        <BellOff className="w-3 h-3 text-gray-400" />
      )}
      {chatInfo && !chatInfo.otherParticipant.isRegistered && (
        <span className="bg-yellow-500/20 text-yellow-400 text-xs px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
          <User className="w-3 h-3" />
          не зарег.
        </span>
      )}
    </div>
    <div className="flex items-center gap-1 text-xs">
      {!isOnline && (
        <span className="text-amber-400 flex items-center gap-0.5">
          <WifiOff className="w-3 h-3" />
          оффлайн
        </span>
      )}
      {chatInfo?.otherParticipant.isRegistered && chatInfo.otherParticipant.status === 'online' ? (
        <span className="text-emerald-400 flex items-center gap-0.5">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
          онлайн
        </span>
      ) : chatInfo?.otherParticipant.lastSeen ? (
        <span className="text-gray-400 text-xs">
          был(а) {formatLastSeen(chatInfo.otherParticipant.lastSeen)}
        </span>
      ) : (
        <span className="text-gray-400 text-xs">
          {/* Если нет информации о статусе */}
          {!isOnline ? "оффлайн" : "не в сети"}
        </span>
      )}
      {unreadMessages.length > 0 && (
        <>
          <span className="text-gray-500">•</span>
          <span className="bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded-full">
            {unreadMessages.length}
          </span>
        </>
      )}
    </div>
  </div>
</div>
        </div>

        <div className="flex items-center gap-1">
 
          <button
            onClick={() => {
              if (searchQuery) setSearchQuery("");
              const searchInput = document.querySelector('input[placeholder="Поиск в чате..."]') as HTMLInputElement;
              searchInput?.focus();
            }}
            className="p-2 rounded-xl hover:bg-slate-800/50 transition-all duration-200"
          >
            <Search className="w-5 h-5 text-gray-300" />
          </button>

          {chatInfo?.otherParticipant.isRegistered ? (
            <button
              onClick={() => setShowCallModal(true)}
              className="p-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white transition-all duration-200 hover:shadow-lg hover:shadow-purple-500/25"
            >
              <Video className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => alert('Звонки доступны только для зарегистрированных пользователей')}
              className="p-2 rounded-xl bg-slate-800/50 text-gray-400 cursor-not-allowed"
              title="Звонки доступны только для зарегистрированных пользователей"
            >
              <Video className="w-5 h-5" />
            </button>
          )}

          <button 
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2 rounded-xl hover:bg-slate-800/50 transition-all duration-200"
          >
            <MoreVertical className="w-5 h-5 text-gray-300" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className={`${searchQuery ? 'block' : 'hidden'} px-3 lg:px-4 py-2 bg-slate-800/50 border-b border-slate-700/50 flex-shrink-0 sticky top-16 z-40`}>
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск в чате..."
            className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none text-sm"
            autoFocus
          />
          {searchQuery && (
            <>
              <span className="text-xs text-gray-400">
                {messages.filter(m => 
                  m.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  m.senderName.toLowerCase().includes(searchQuery.toLowerCase())
                ).length}
              </span>
              <button
                onClick={() => setSearchQuery("")}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Messages Container */}
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto px-2 lg:px-4 py-4 safe-area-inset-bottom"
        style={{ 
          marginTop: 'calc(env(safe-area-inset-top, 0px) + 64px)',
          marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)'
        }}
        onScroll={handleScroll}
        onClick={(e) => {
          const target = e.target as Element;
          const clickedOnMessage = target.closest('[data-message-id]');
          const clickedOnMenu = target.closest('.message-actions-menu');
          
          if (!clickedOnMessage && !clickedOnMenu) {
            setShowMessageActions(null);
          }
        }}
      >
        <div className="max-w-3xl mx-auto space-y-4 pb-4">
          {/* Network status */}
   
    
    {/* Show "updating messages" indicator when we have cache but still loading */}
   {loading && messages.length > 0 && (
  <div className="flex justify-center">
    <RefreshCw className="w-3 h-3 text-purple-400 animate-spin" />
  </div>
)}
          <div className="px-3 lg:px-4 mb-4">
 {/* Add socket status indicator */}
    {!isConnected && isOnline && (
    <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20 rounded-xl lg:rounded-2xl p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center">
            <WifiOff className="w-4 h-4 text-white" />
          </div>
          <div>
            <h4 className="font-semibold text-white text-sm">Realtime connection lost</h4>
            <p className="text-xs text-red-300">Messages may be delayed</p>
          </div>
        </div>
        <button
          onClick={() => {
            console.log('🔄 Manually reconnecting socket');
            connect(); // Используйте функцию connect из SocketContext
          }}
          disabled={isConnecting || isConnected}
          className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
        >
          {isConnecting ? (
            <>
              <RefreshCw className="w-3 h-3 animate-spin" />
              Connecting...
            </>
          ) : isConnected ? (
            <>
              <Wifi className="w-3 h-3" />
              Connected
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3" />
              Reconnect
            </>
          )}
        </button>
      </div>
    </div>
  )}            
{!isOnline ? (
  <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl lg:rounded-2xl p-3">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
          <WifiOff className="w-4 h-4 text-white" />
        </div>
        <div>
          <h4 className="font-semibold text-white text-sm">Оффлайн режим</h4>
           
          <p className="text-xs text-amber-300">
            {getOfflineMessages(debtId!).length > 0 
              ? `${getOfflineMessages(debtId!).length} сообщений ожидают отправки` 
              : 'Сообщения будут сохранены локально'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
        <span className="text-xs text-amber-400">оффлайн</span>
      </div>
    </div>
  </div>
            ) : isSyncing ? (
              <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-xl lg:rounded-2xl p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
                      <RefreshCw className="w-4 h-4 text-white animate-spin" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white text-sm">Синхронизация...</h4>
                      <p className="text-xs text-blue-300">Отправка сохранённых сообщений</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Registration status */}
          {chatInfo && (
            <div className="px-3 lg:px-4 mb-4">
              {!chatInfo.otherParticipant.isRegistered ? (
                <div className="bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border border-yellow-500/20 rounded-xl lg:rounded-2xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center text-white">
                      <User className="w-4 h-4 lg:w-5 lg:h-5" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-white text-sm lg:text-base">Пользователь не зарегистрирован</h4>
                      <p className="text-xs text-yellow-300">Доступны только базовые функции</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs lg:text-sm text-gray-300">🔹 Доступно: Отправка сообщений, просмотр истории</p>
                    <p className="text-xs lg:text-sm text-gray-300">🔸 Ограничено: Звонки, жалобы, блокировка</p>
                    <p className="text-xs text-yellow-400 mt-2">
                      После регистрации пользователя откроются все функции
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/20 rounded-xl lg:rounded-2xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white">
                      <Shield className="w-4 h-4 lg:w-5 lg:h-5" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-white text-sm lg:text-base">Пользователь зарегистрирован</h4>
                      <p className="text-xs lg:text-sm text-emerald-300">Доступны все функции чата</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loading more indicator */}
          {loadingMore && (
            <div className="text-center py-4">
              <div className="inline-flex items-center gap-2 text-gray-400">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="text-sm">Загрузка предыдущих сообщений...</span>
              </div>
            </div>
          )}
          
          {filteredGroupedMessages.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="text-6xl mb-4 bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                {searchQuery ? "🔍" : "💬"}
              </div>
              <p className="text-gray-400 text-sm lg:text-base">
                {searchQuery ? "Сообщения не найдены" : "Нет сообщений"}
              </p>
              <p className="text-gray-500 text-xs lg:text-sm mt-1">
                {searchQuery ? "Попробуйте другой запрос" : "Начните общение"}
              </p>
            </div>
          ) : (
            filteredGroupedMessages.map((group) => {
              const date = group[0] as string;
              const dateMessages = group[1] as Message[];
              
              return (
                <div key={date} className="space-y-3">
                  <div className="flex items-center justify-center">
                    <div className="px-3 py-1 backdrop-blur-sm rounded-full border border-slate-700/50 bg-slate-800/50 shadow">
                      <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {date}
                      </span>
                    </div>
                  </div>

          {dateMessages.map((msg: Message) => {
  // Проверяем дубликаты
  const messageIndex = dateMessages.findIndex(m => m._id === msg._id);
  const isDuplicate = messageIndex !== dateMessages.indexOf(msg);
  
  if (isDuplicate) {
    console.log('🚫 Пропускаем дубликат в рендере:', msg._id);
    return null;
  }
  
  const isBeingSwiped = swipeData.id === msg._id;
  const isReply = !!msg.replyTo;
  const repliedMessage = isReply && msg.replyTo ? getRepliedMessage(msg.replyTo) : null;
  
  // Генерируем уникальный ключ для каждого сообщения
  const generateMessageKey = (msg: Message): string => {
    if (msg._id && !msg._id.startsWith('local_') && !msg._id.startsWith('test_')) {
      return `server_${msg._id}_${new Date(msg.createdAt).getTime()}`;
    }
    
    if (msg.localId) {
      return `local_${msg.localId}_${new Date(msg.createdAt).getTime()}`;
    }
    
    if (msg._id && (msg._id.startsWith('local_') || msg._id.startsWith('test_'))) {
      return `local_id_${msg._id}_${new Date(msg.createdAt).getTime()}`;
    }
    
    const timestamp = new Date(msg.createdAt).getTime();
    const random = Math.random().toString(36).substr(2, 9);
    return `fallback_${msg.text?.substring(0, 10)}_${timestamp}_${msg.senderId}_${random}`;
  };
  
  const uniqueKey = generateMessageKey(msg);
  
  return (
    <div
      key={uniqueKey}
      data-message-id={msg._id}
      data-is-mine={msg.isMine.toString()}
      className={`flex ${msg.isMine ? 'justify-end' : 'justify-start'} group relative px-4`}
      onTouchStart={(e) => handleTouchStart(e, msg._id)}
      onTouchMove={(e) => handleTouchMove(e, msg._id)}
      onTouchEnd={() => handleTouchEnd(msg)}
    >
      {/* Премиум-эффект свайпа */}
      <div 
        className="absolute left-6 top-1/2 -translate-y-1/2 transition-all duration-300 ease-out"
        style={{ 
          opacity: isBeingSwiped ? Math.min(swipeData.offset / 40, 1) : 0,
          transform: `translateX(${isBeingSwiped ? -20 : 0}px) scale(${isBeingSwiped ? Math.min(swipeData.offset / 50, 1.1) : 0.8})`,
          filter: isBeingSwiped ? 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.3))' : 'none'
        }}
      >
        <div className="relative">
          <div className="bg-gradient-to-br from-purple-600/30 to-pink-600/20 p-3 rounded-2xl backdrop-blur-sm border border-purple-500/20 shadow-2xl shadow-purple-900/20">
            <div className="relative w-6 h-6">
              <svg className="w-full h-full text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-400 opacity-20 blur-sm"></div>
            </div>
          </div>
          {/* Эффект свечения */}
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 opacity-10 blur-xl -z-10"></div>
        </div>
      </div>
      
      {/* Контейнер сообщения */}
      <div 
        className={`max-w-[85%] lg:max-w-[70%] transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] relative isolate`}
        style={{ 
          transform: isBeingSwiped 
            ? `translateX(${swipeData.offset}px) scale(${1 - Math.abs(swipeData.offset) * 0.001})` 
            : 'translateX(0px) scale(1)',
          filter: isBeingSwiped ? `blur(${Math.abs(swipeData.offset) * 0.02}px)` : 'blur(0px)',
        }}
      >
        {/* Основной пузырь сообщения */}
        <div className="relative">
          <div
            onClick={(e) => handleMessageClick(msg, e)}
            className={`relative overflow-hidden rounded-2xl backdrop-blur-lg transition-all duration-500 ease-out active:scale-[0.98] ${
              msg.pending
                ? 'bg-gradient-to-br from-amber-900/40 to-amber-800/30 border border-amber-700/50 shadow-lg shadow-amber-900/20'
                : msg.failed
                ? 'bg-gradient-to-br from-red-900/40 to-rose-900/30 border border-red-700/50'
                : msg.isMine
                ? 'bg-gradient-to-br from-blue-600/90 via-indigo-600/90 to-purple-600/90 shadow-2xl shadow-blue-900/30'
                : 'bg-gradient-to-br from-slate-800/80 via-gray-800/80 to-slate-900/80 border border-slate-700/50 shadow-2xl shadow-purple-900/10'
            }`}
            style={{ 
              borderRadius: msg.isMine ? '20px 20px 6px 20px' : '20px 20px 20px 6px',
              cursor: 'pointer'
            }}
          >
            {/* Анимированный фоновый узор */}
            <div className="absolute inset-0 opacity-5">
              <div className="absolute inset-0" style={{
                backgroundImage: `radial-gradient(circle at 25% 25%, ${msg.isMine ? 'rgba(255,255,255,0.3)' : 'rgba(168,85,247,0.3)'} 2px, transparent 2px)`,
                backgroundSize: '20px 20px'
              }}></div>
            </div>
            
            {/* Имя отправителя для чужих сообщений */}
          
            
            {/* Превью ответа */}
            {isReply && (
              <div className="relative">
                {repliedMessage ? (
                  <div 
                    className={`px-4 pb-3 border-b border-white/10 group/reply cursor-pointer ${
                      !msg.isMine ? 'pt-2' : 'pt-4'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('🔗 Переходим к ответному сообщению:', repliedMessage._id);
                      
                      // Находим и прокручиваем к оригинальному сообщению
                      const originalMessage = document.querySelector(`[data-message-id="${msg.replyTo}"]`);
                      if (originalMessage) {
                        originalMessage.scrollIntoView({ 
                          behavior: 'smooth', 
                          block: 'center' 
                        });
                        
                        // Подсвечиваем оригинальное сообщение
                        originalMessage.classList.add('ring-2', 'ring-purple-500/50', 'animate-pulse');
                        setTimeout(() => {
                          originalMessage.classList.remove('ring-2', 'ring-purple-500/50', 'animate-pulse');
                        }, 2000);
                      }
                    }}
                  >
                    {/* Вертикальная акцентная линия */}
                    <div className="absolute left-4 top-4 bottom-3 w-0.5 bg-gradient-to-b from-purple-500/60 via-pink-500/60 to-transparent"></div>
                    
                    <div className="flex items-center gap-2 mb-1.5 ml-3">
                      {/* Иконка ответа */}
                      <svg className="w-3 h-3 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                      
                      {/* Имя отправителя оригинального сообщения */}
                      <div className={`w-2 h-2 rounded-full ${repliedMessage.isMine ? 'bg-gradient-to-r from-blue-400 to-cyan-400' : 'bg-gradient-to-r from-purple-400 to-pink-400'}`}></div>
                      <span className={`text-xs font-bold tracking-wider ${repliedMessage.isMine ? 'text-blue-300' : 'text-purple-300'}`}>
                        {repliedMessage.isMine ? 'Вы' : repliedMessage.senderName || 'Пользователь'}
                      </span>
                      <div className="flex-1 h-px bg-gradient-to-r from-current/20 to-transparent ml-2"></div>
                    </div>
                    
                    {/* Текст оригинального сообщения */}
                    <div className="ml-3 text-sm text-purple-200/90 leading-snug truncate">
                      {repliedMessage.text || "Сообщение..."}
                    </div>
                    
                    {/* Эффект при наведении на ответ */}
                    <div className="absolute inset-x-0 top-0 bottom-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover/reply:opacity-100 transition-opacity duration-300"></div>
                  </div>
                ) : (
                  // Плейсхолдер если сообщение еще не найдено
                  <div className={`px-4 pb-3 border-b border-slate-700/30 ${
                    !msg.isMine ? 'pt-2' : 'pt-4'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                      <div className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-400 to-pink-400"></div>
                      <p className="text-xs text-gray-400 font-medium">Загрузка сообщения...</p>
                    </div>
                    <div className="text-xs text-gray-500 italic ml-3">
                      <p>Загрузка оригинального сообщения...</p>
                      <p className="text-[10px] text-gray-600 mt-1">ID: {msg.replyTo?.substring(0, 8)}...</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Основное содержимое сообщения */}
            <div className={`p-4 ${isReply ? 'pt-3' : !msg.isMine ? 'pt-2' : 'pt-4'}`}>
              {/* Текстовое содержимое */}
              <p className="text-white leading-relaxed tracking-wide text-[15px] font-light whitespace-pre-wrap break-words">
                {msg.text}
              </p>
              
              {/* Премиум статус и время */}
              <div className={`flex items-center justify-end gap-2 mt-3 ${msg.isMine ? 'border-white/20' : 'border-white/10'}`}>
                {msg.isMine && (
                  <div className="flex items-center">
                    {msg.pending ? (
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-gradient-to-r from-amber-900/30 to-amber-800/20">
                        <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                      </div>
                    ) : msg.failed ? (
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-gradient-to-r from-rose-900/30 to-red-800/20">
                        <X className="w-3 h-3 text-red-400" />
                      </div>
                    ) : msg.read ? (
                      <div className="flex items-center gap-1">
                        <CheckCheck className="w-4 h-4 text-blue-300" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Check className="w-4 h-4 text-white/50" />
                      </div>
                    )}
                  </div>
                )}
                
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-white/40" />
                  <span className="text-xs font-medium text-white/60 tracking-wide">
                    {formatTime(msg.createdAt)}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Угловой акцент */}
            <div className={`absolute ${msg.isMine ? '-right-1 -top-1' : '-left-1 -top-1'} w-8 h-8`}>
              <div className={`absolute w-full h-full rounded-full bg-gradient-to-br ${
                msg.isMine 
                  ? 'from-blue-500/30 to-purple-500/30' 
                  : 'from-purple-500/20 to-pink-500/20'
              } blur-sm`}></div>
            </div>
          </div>
          
          {/* Премиум контекстное меню */}
          {showMessageActions === msg._id && (
            <>
              <div 
                className="fixed inset-0 z-[1000] backdrop-blur-sm bg-black/30" 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMessageActions(null);
                }} 
              />
              
              <div 
                className={`absolute z-[1010] min-w-[180px] bg-gradient-to-b from-slate-900/95 to-slate-900/90 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 rounded-2xl overflow-hidden animate-in fade-in zoom-in duration-200 ${
                  msg.isMine 
                    ? 'right-0 origin-top-right' 
                    : 'left-0 origin-top-left'
                }`}
                style={{ bottom: '100%', marginBottom: '8px' }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Заголовок меню */}
                <div className="px-4 py-3 border-b border-white/5">
                  <div className="text-xs font-medium text-white/60 tracking-wider uppercase">ДЕЙСТВИЯ</div>
                </div>
                
                <button
                  onClick={() => handleMessageAction(msg._id, 'reply')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 hover:bg-gradient-to-r hover:from-blue-500/10 hover:to-purple-500/10 transition-all duration-300 group/action"
                >
                  <div className="relative p-1.5 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 group-hover/action:from-blue-500/30 group-hover/action:to-purple-500/30">
                    <Send size={16} className="text-blue-300 -rotate-45" />
                  </div>
                  <span className="font-medium tracking-wide">Ответить</span>
                  <div className="ml-auto text-xs text-white/40">⌘R</div>
                </button>

                <button
                  onClick={() => handleMessageAction(msg._id, 'copy')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 hover:bg-gradient-to-r hover:from-purple-500/10 hover:to-pink-500/10 transition-all duration-300 group/action"
                >
                  <div className="relative p-1.5 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 group-hover/action:from-purple-500/30 group-hover/action:to-pink-500/30">
                    <Copy size={16} className="text-purple-300" />
                  </div>
                  <span className="font-medium tracking-wide">Копировать</span>
                  <div className="ml-auto text-xs text-white/40">⌘C</div>
                </button>

                {msg.isMine && (
                  <button
                    onClick={() => handleMessageAction(msg._id, 'delete')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-rose-200 hover:bg-gradient-to-r hover:from-rose-500/10 hover:to-red-500/10 transition-all duration-300 group/action"
                  >
                    <div className="relative p-1.5 rounded-lg bg-gradient-to-br from-rose-500/20 to-red-500/20 group-hover/action:from-rose-500/30 group-hover/action:to-red-500/30">
                      <Trash2 size={16} className="text-rose-300" />
                    </div>
                    <span className="font-medium tracking-wide">Удалить</span>
                    <div className="ml-auto text-xs text-rose-400/60">⌘⌫</div>
                  </button>
                )}
                
                {/* Подвал меню */}
                <div className="px-4 py-2 border-t border-white/5">
                  <div className="text-[10px] text-white/30 tracking-wider text-center">
                    Нажмите снаружи, чтобы закрыть
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
})}
                </div>
              );
            })
          )}

          {/* Typing Indicator */}
          {otherIsTyping && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 bg-slate-800/30 backdrop-blur-sm rounded-2xl rounded-bl-lg p-3 border border-slate-700/50">
                <div className="flex gap-0.5">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="text-xs text-gray-400 ml-1.5 mb-2">печатает...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Scroll to bottom button */}
      {showScrollToBottom && (
        <button
          onClick={() => scrollToBottom()}
          className="fixed bottom-24 right-4 z-50 p-3 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 transition-all duration-300 hover:scale-110 lg:bottom-6"
        >
          <ChevronDown className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Input Area */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/50 z-40">
        <div className="max-w-3xl mx-auto px-2 lg:px-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {replyMessage && (
            <div className="px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50 flex items-center justify-between mx-2 mt-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-300 truncate">Ответ на сообщение</p>
                <p className="text-xs text-gray-400 truncate">{replyMessage.text}</p>
              </div>
              <button
                onClick={() => setReplyMessage(null)}
                className="p-1 hover:bg-slate-700/50 rounded transition-colors flex-shrink-0 ml-2"
              >
                <X className="w-3 h-3 text-gray-400" />
              </button>
            </div>
          )}
{/* Emoji Picker */}
{/* Premium Emoji Picker Container */}
{showEmojiPicker && (
  <div className="absolute bottom-full left-0 right-0 mb-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
    <div className="max-w-md mx-auto px-2">
      <div className="relative p-1 bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl shadow-black/50 overflow-hidden">
        {/* Decorative Top Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-gradient-to-r from-transparent via-purple-500/50 to-transparent blur-sm"></div>
        
        <EmojiPicker
          onEmojiClick={handleEmojiClick}
          width="100%"
          height={380}
          skinTonesDisabled={false}
          autoFocusSearch={false}
          searchDisabled={false}
          lazyLoadEmojis={true}
          previewConfig={{ 
            showPreview: false 
          }}
          theme={'dark' as any}
          searchPlaceholder="Поиск..."
          // Custom styles for the internal picker components
          style={{
            '--epr-bg-color': 'transparent',
            '--epr-category-label-bg-color': 'rgba(15, 23, 42, 0.9)',
            '--epr-picker-border-color': 'transparent',
            '--epr-search-input-bg-color': 'rgba(30, 41, 59, 0.5)',
            '--epr-emoji-padding': '8px',
          } as React.CSSProperties}
        />
      </div>
    </div>
  </div>
)}
        <form
  onSubmit={(e) => {
    e.preventDefault();
    sendMessage();
  }}
  className="flex items-end gap-3 py-3 lg:py-4 px-3 relative"
>
  {/* Modernized Emoji Toggle */}
  <button
    type="button"
    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
    className={`p-3 rounded-2xl transition-all duration-300 flex-shrink-0 group relative overflow-hidden ${
      showEmojiPicker
        ? 'bg-gradient-to-br from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/20'
        : 'bg-slate-800/50 border border-slate-700/50 text-gray-400 hover:text-white hover:bg-slate-700/50'
    }`}
  >
    <Smile className={`w-5 h-5 transition-transform duration-300 ${showEmojiPicker ? 'scale-110' : 'group-hover:rotate-12'}`} />
    {showEmojiPicker && (
      <span className="absolute inset-0 bg-white/20 animate-pulse"></span>
    )}
  </button>

  <div className="flex-1 relative group">
    <textarea
      ref={textareaRef}
      value={newMessage}
     onChange={handleTextareaChange}
      placeholder={isOnline ? "Введите сообщение..." : "Введите сообщение (оффлайн)..."}
     
      className="w-full px-3 py-2.5 bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-transparent resize-none min-h-[44px] max-h-[120px] transition-all duration-200 pr-20 text-sm disabled:opacity-50"
  rows={1}
      onClick={() => setShowEmojiPicker(false)} // Close picker when clicking text area to type
    />
    
    {/* Dynamic Character Count */}
    {newMessage.length > 0 && (
      <div className="absolute right-3 -top-2 px-1.5 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-[10px] text-gray-500 tabular-nums">
        {newMessage.length}
      </div>
    )}
  </div>

  <button
    type="submit"
    disabled={!newMessage.trim()}
    className={`p-3 rounded-2xl transition-all duration-500 flex-shrink-0 group ${
      newMessage.trim()
        ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-[0_0_20px_rgba(147,51,234,0.3)]'
        : 'bg-slate-800/50 border border-slate-700/50 opacity-50 cursor-not-allowed'
    }`}
  >
    <Send className={`w-5 h-5 transition-all duration-300 ${newMessage.trim() ? 'text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5' : 'text-gray-600'}`} />
  </button>
</form>
        </div>
      </div>

      {/* Sidebar */}
      {/* Sidebar */}
<div className={`
  fixed inset-y-0 right-0 w-full sm:w-96 lg:w-80 bg-slate-900/95 backdrop-blur-xl border-l border-slate-800/50
  transform transition-all duration-300 ease-in-out z-[150]
  ${showSidebar 
    ? 'translate-x-0 opacity-100' 
    : 'translate-x-full opacity-0 pointer-events-none'
  }
  flex flex-col overflow-y-auto shadow-2xl
`}>
        <div className="p-4 lg:p-6 border-b border-slate-800/50 flex-shrink-0">
          <div className="flex items-center justify-between mb-6">
    <h3 className="text-lg font-semibold text-white">Информация о чате</h3>
    <button
      onClick={() => setShowSidebar(false)}
      className="p-2 hover:bg-slate-800/50 rounded-xl transition-colors group"
    >
      <X className="w-5 h-5 text-gray-400 group-hover:text-white" />
    </button>
  </div>

          <div className="text-center">
            <div className="relative w-20 h-20 lg:w-24 lg:h-24 mx-auto rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white text-2xl lg:text-3xl font-bold mb-4 shadow-lg">
             {getInitial(chatInfo?.otherParticipant.localName || chatInfo?.otherParticipant.name || "A")}
              {chatInfo?.settings.isPinned && (
                <Pin className="absolute -top-2 -right-2 w-6 h-6 text-yellow-400" />
              )}
              {chatInfo && !chatInfo.otherParticipant.isRegistered && (
                <div className="absolute -top-2 left-0 right-0 flex justify-center">
                  <div className="bg-yellow-500 text-white text-xs px-2 py-0.5 rounded-full">
                    не зарегистрирован
                  </div>
                </div>
              )}
            </div>
            <h4 className="text-lg lg:text-xl font-bold text-white mb-2">
  {chatInfo?.otherParticipant.localName || chatInfo?.otherParticipant.name}
</h4>
  {chatInfo?.otherParticipant.localName && 
   chatInfo.otherParticipant.localName !== chatInfo.otherParticipant.name && (
    <p className="text-gray-500 text-sm mb-2">
      Исходное имя: {chatInfo.otherParticipant.name}
    </p>
  )}
  
            <p className="text-gray-400 mb-4">
  {formatPhoneForDisplay(chatInfo?.otherParticipant.phone || "")}
</p>
            
            <div className={`mb-4 px-3 py-1.5 rounded-lg ${chatInfo?.otherParticipant.isRegistered ? 'bg-emerald-500/10 text-emerald-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
              <div className="flex items-center justify-center gap-2 text-sm">
                {chatInfo?.otherParticipant.isRegistered ? (
                  <>
                    <Shield className="w-5 h-5" />
                    <span>Зарегистрированный пользователь</span>
                  </>
                ) : (
                  <>
                    <User className="w-5 h-5" />
                    <span>Не зарегистрирован в системе</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-6 space-y-6">
            {/* Chat Stats */}
            <div>
              <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Статистика
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl">
                  <span className="text-gray-300">Всего сообщений</span>
                  <span className="text-white font-semibold">{messages.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl">
                  <span className="text-gray-300">Непрочитанные</span>
                  <span className="text-purple-400 font-semibold">{unreadMessages.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl">
                  <span className="text-gray-300">Создан</span>
                  <span className="text-gray-400 text-sm">
                    {messages[0] ? new Date(messages[0].createdAt).toLocaleDateString('ru-RU') : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="relative z-10">
              <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Быстрые действия
              </h4>
              <div className="space-y-2">
                {/* Call Button */}
                <button
                  onClick={() => {
                    if (chatInfo?.otherParticipant.isRegistered) {
                      setShowCallModal(true);
                      setShowSidebar(false);
                    } else {
                      alert('Звонки доступны только для зарегистрированных пользователей');
                    }
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${
                    chatInfo?.otherParticipant.isRegistered
                      ? 'hover:bg-slate-800/50 text-gray-300 hover:text-white'
                      : 'bg-slate-800/30 text-gray-500 cursor-not-allowed'
                  }`}
                  title={!chatInfo?.otherParticipant.isRegistered ? "Звонки доступны только для зарегистрированных пользователей" : "Видеозвонок"}
                  disabled={!chatInfo?.otherParticipant.isRegistered}
                >
                  {chatInfo?.otherParticipant.isRegistered ? (
                    <>
                      <Video className="w-5 h-5 text-emerald-400" />
                      <span className="flex-1 text-left">Видеозвонок</span>
                     {chatInfo?.otherParticipant.phone && (
  <span className="text-xs text-gray-500 bg-slate-800 px-2 py-1 rounded">
    {formatPhoneForDisplay(chatInfo.otherParticipant.phone)}
  </span>
)}
                    </>
                  ) : (
                    <>
                      <Video className="w-5 h-5" />
                      <span className="flex-1 text-left">Звонки недоступны</span>
                      <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">
                        Только для зарегистрированных
                      </span>
                    </>
                  )}
                </button>

                {/* Toggle Mute */}
                <button
                  onClick={toggleMute}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                >
                  {chatInfo?.settings.isMuted ? (
                    <>
                      <Bell className="w-5 h-5 text-yellow-400" />
                      <span className="flex-1 text-left">Включить уведомления</span>
                      <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded">
                        Выкл
                      </span>
                    </>
                  ) : (
                    <>
                      <BellOff className="w-5 h-5 text-gray-400" />
                      <span className="flex-1 text-left">Отключить уведомления</span>
                      <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">
                        Вкл
                      </span>
                    </>
                  )}
                </button>

                {/* Toggle Pin */}
                <button
                  onClick={togglePin}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                >
                  <Pin className={`w-5 h-5 ${chatInfo?.settings.isPinned ? 'text-yellow-400' : 'text-gray-400'}`} />
                  <span className="flex-1 text-left">
                    {chatInfo?.settings.isPinned ? 'Открепить чат' : 'Закрепить чат'}
                  </span>
                  {chatInfo?.settings.isPinned && (
                    <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded">
                      Закреплён
                    </span>
                  )}
                </button>

                {/* Export Chat */}
                <button
                  onClick={exportChat}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                >
                  <Download className="w-5 h-5 text-purple-400" />
                  <span>Экспорт переписки</span>
                </button>

                {/* Search in Chat */}
                <button
                  onClick={() => {
                    setSearchQuery("");
                    const searchInput = document.querySelector('input[placeholder="Поиск в чате..."]') as HTMLInputElement;
                    if (searchInput) {
                      searchInput.focus();
                    }
                    setShowSidebar(false);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                >
                  <Search className="w-5 h-5 text-gray-400" />
                  <span>Поиск в чате</span>
                </button>

                {/* Mark All as Read */}
                {unreadMessages.length > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors text-purple-400 hover:text-purple-300"
                  >
                    <Eye className="w-5 h-5" />
                    <span className="flex-1 text-left">Прочитать всё</span>
                    <span className="bg-purple-500 text-white text-xs px-2 py-1 rounded-full">
                      {unreadMessages.length}
                    </span>
                  </button>
                )}

                {/* Toggle Archive */}
                <button
                  onClick={toggleArchive}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                >
                  <Archive className="w-5 h-5 text-orange-400" />
                  <span className="flex-1 text-left">
                    {chatInfo?.settings.isArchived ? 'Восстановить чат' : 'Архивировать чат'}
                  </span>
                  {chatInfo?.settings.isArchived && (
                    <span className="text-xs text-orange-400 bg-orange-400/10 px-2 py-1 rounded">
                      В архиве
                    </span>
                  )}
                </button>
<button
  onClick={() => {
    if (chatInfo && debtId) {
      const localName = getCustomerLocalName(
        chatInfo.otherParticipant.phone,
        chatInfo.otherParticipant.identityId,
        chatInfo.otherParticipant.name
      );
      
      const updatedChatInfo = {
        ...chatInfo,
        otherParticipant: {
          ...chatInfo.otherParticipant,
          name: localName || chatInfo.otherParticipant.name,
          localName: localName
        }
      };
      
      setChatInfo(updatedChatInfo);
      saveChatInfoToCache(debtId, updatedChatInfo);
    }
  }}
  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
>
  <RefreshCw className="w-5 h-5 text-blue-400" />
  <span>Обновить имя из кэша</span>
</button>
              </div>
                  <button
                    onClick={() => {
                      if (window.confirm('Удалить кэш этого чата?\n\nЭто удалит: ✅ Локальную историю сообщений\n✅ Оффлайн сообщения\n✅ Кэш информации о чате\n\nСерверные сообщения останутся нетронутыми.')) {
                        if (debtId) {
                          localStorage.removeItem(CHAT_CACHE_KEY(debtId));
                          localStorage.removeItem(OFFLINE_MESSAGES_KEY(debtId));
                          localStorage.removeItem(CHAT_INFO_CACHE_KEY(debtId));
                          
                          showCacheDeleteNotification();
                          
                          setMessages(prev => {
                            const serverMessages = prev.filter(msg => !msg.localId && !msg.pending);
                            return serverMessages;
                          });
                          
                          if (isOnline) {
                            loadChatData(1, false);
                          }
                          
                          console.log('🗑️ Cache cleared for chat:', debtId);
                        }
                      }
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-orange-500/10 transition-colors text-orange-400 hover:text-orange-300 border border-orange-500/20"
                    title="Удалить локальный кэш сообщений"
                  >
                    <Trash2 className="w-5 h-5" />
                    <span>Очистить локальный кэш</span>
                    <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded">
                      Локально
                    </span>
                  </button>
            </div>

            {/* Dangerous Zone */}
            {chatInfo?.otherParticipant.isRegistered && (
              <div>
                <h4 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-3">
                  Опасная зона
                </h4>
                <div className="space-y-2">
                  
                  <button
                    onClick={() => {
                      if (window.confirm('Пожаловаться на пользователя?')) {
                        console.log('Report user:', chatInfo.otherParticipant.identityId);
                      }
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-500/10 transition-colors text-red-400 hover:text-red-300 border border-red-500/20"
                  >
                    <Shield className="w-5 h-5" />
                    <span>Пожаловаться</span>
                  </button>

                  <button
                    onClick={() => {
                      if (window.confirm(`Заблокировать ${chatInfo.otherParticipant.name}? Вы больше не будете получать сообщения от этого пользователя.`)) {
                        console.log('Block user:', chatInfo.otherParticipant.identityId);
                      }
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-500/10 transition-colors text-red-400 hover:text-red-300 border border-red-500/20"
                  >
                    <X className="w-5 h-5" />
                    <span>Заблокировать пользователя</span>
                  </button>

                  <button
                    onClick={clearChat}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-500/10 transition-colors text-red-400 hover:text-red-300 border border-red-500/20"
                  >
                    <Trash2 className="w-5 h-5" />
                    <span>Очистить переписку (на сервере)</span>
                    <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded">
                      Сервер
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    
      {/* Overlay for mobile sidebar */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[140] lg:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}
    </div>
  );
}