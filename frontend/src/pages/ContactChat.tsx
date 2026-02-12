// pages/ContactChat.tsx - COMPLETE FIXED VERSION
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import { socket } from "../socket";
import { getInitial, formatLastSeen } from "../utils/ui";
import { useNotification } from "../context/NotificationContext";
import CallModal from "../components/CallModal";
// Add to your existing imports
import EmojiPicker from 'emoji-picker-react';
import type { EmojiClickData } from 'emoji-picker-react';

import {
  ArrowLeft,
  Send,
 
  Smile,
  Check,
  CheckCheck,
  User,
  X,
  File,
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
  RefreshCw,
  WifiOff
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
  type: "text" | "image" | "file" | "voice";
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  replyTo?: string;
  pending?: boolean;
  failed?: boolean;
  localId?: string;
}

interface ChatInfo {
  chatId: string;
  otherParticipant: {
    identityId: string;
    name: string;
    localName?: string;
    phone: string;
    isRegistered: boolean;
    status?: "online" | "offline";
    lastSeen?: string;
  };
  settings: {
    isMuted: boolean;
    isArchived: boolean;
    isPinned: boolean;
  };
  lastMessage: string;
  lastMessageType?: string;
  lastAt: string;
}

// Local storage keys
const CHAT_CACHE_KEY = (chatId: string) => `contact_chat_cache_${chatId}`;
const OFFLINE_MESSAGES_KEY = (chatId: string) => `contact_chat_offline_${chatId}`;
const CHAT_INFO_CACHE_KEY = (chatId: string) => `contact_chat_info_${chatId}`;

export default function ContactChat() {
  const { contactChatId, contactIdentityId } = useParams<{ 
    contactChatId: string; 
    contactIdentityId: string 
  }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
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
  const [searchQuery] = useState("");
  const [unreadMessages, setUnreadMessages] = useState<string[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [page, setPage] = useState(1);
  const messagesPerPage = 150;
  const { updateMessageNotifications } = useNotification();
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
const scrollPositionRef = useRef<number>(0);
const [swipeData, setSwipeData] = useState<{ id: string | null; offset: number }>({ id: null, offset: 0 });
const touchStartX = useRef<number>(0);
const isSwiping = useRef<boolean>(false); 
// Inside ContactChat component
const sendingInProgress = useRef<Set<string>>(new Set()); // CRITICAL: The Gatekeeper

const [showEmojiPicker, setShowEmojiPicker] = useState(false);
// В ContactChat.tsx добавьте эту функцию:

useEffect(() => { 
  if (chatInfo?.chatId) {
   updateMessageNotifications(chatInfo.chatId);
  }
}, [chatInfo?.chatId, updateMessageNotifications]);

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


const handleTouchStart = (e: React.TouchEvent, _msgId: string) => {
  touchStartX.current = e.touches[0].clientX;
  isSwiping.current = true;
};

const handleTouchMove = (e: React.TouchEvent, msgId: string) => {
  if (!isSwiping.current) return;

  const touchCurrentX = e.touches[0].clientX;
  const diff = touchCurrentX - touchStartX.current;

  // Only allow swiping to the right and cap it at 70px
  if (diff > 0) {
    const elasticOffset = Math.min(diff * 0.5, 70); // Elastic effect
    setSwipeData({ id: msgId, offset: elasticOffset });
    
    // Optional: Trigger a tiny haptic feedback when threshold reached
    if (elasticOffset >= 50 && swipeData.offset < 50 && window.navigator.vibrate) {
      window.navigator.vibrate(10);
    }
  }
};

const handleTouchEnd = (msg: Message) => {
  if (swipeData.offset >= 50) {
    handleMessageAction(msg._id, 'reply');
  }
  
  // Reset with a slight delay for animation
  isSwiping.current = false;
  setSwipeData({ id: null, offset: 0 });
};
// ==================== CACHE FUNCTIONS ====================
  
 const loadCachedChatInfo = useCallback((chatId: string): ChatInfo | null => {
  try {
    const cached = localStorage.getItem(CHAT_INFO_CACHE_KEY(chatId));
    if (cached) {
      const parsed = JSON.parse(cached);
      
      // Добавляем localName если его нет
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
      
      console.log('📦 Loaded cached chat info:', enrichedChatInfo.otherParticipant.name);
      return enrichedChatInfo;
    }
  } catch (error) {
    console.error('Error loading cached chat info:', error);
  }
  return null;
}, [getCustomerLocalName]); // Добавьте зависимость

 const saveChatInfoToCache = useCallback((chatId: string, chatInfo: ChatInfo) => {
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
    
    localStorage.setItem(CHAT_INFO_CACHE_KEY(chatId), JSON.stringify(infoToSave));
    console.log('💾 Saved chat info to cache:', infoToSave.otherParticipant.name);
  } catch (error) {
    console.error('Error saving chat info to cache:', error);
  }
}, [getCustomerLocalName]); // Добавьте зависимость

const loadCachedMessages = useCallback((chatId: string): Message[] => {
  try {
    const cacheKey = CHAT_CACHE_KEY(chatId);
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      console.log('📭 No cache found:', cacheKey);
      return [];
    }
    
    const parsed = JSON.parse(cached);
    
    if (!Array.isArray(parsed)) {
      console.error('❌ Cache is not an array:', typeof parsed);
      return [];
    }
    
    // Load ALL messages including pending and failed
    const formatted = parsed.map((msg: any) => ({
      _id: msg._id || msg.localId || `loaded_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: msg.text || '',
      senderId: msg.senderId || '',
      senderName: msg.senderName || '',
      createdAt: msg.createdAt || new Date().toISOString(),
      read: !!msg.read,
      readBy: Array.isArray(msg.readBy) ? msg.readBy : [],
      isMine: !!msg.isMine,
      type: msg.type || "text",
      fileUrl: msg.fileUrl,
      fileName: msg.fileName,
      fileSize: msg.fileSize,
      replyTo: msg.replyTo,
      // Preserve ALL status flags
      pending: msg.pending !== undefined ? msg.pending : false,
      failed: msg.failed !== undefined ? msg.failed : false,
      localId: msg.localId || (msg._id?.startsWith('local_') ? msg._id : undefined),
    }));
    
    const pendingCount = formatted.filter((m: Message) => m.pending).length;
    const failedCount = formatted.filter((m: Message) => m.failed).length;
    
    console.log('📦 Loaded cached messages:', {
      key: cacheKey,
      total: formatted.length,
      pending: pendingCount,
      failed: failedCount
    });
    
    // Log failed messages
    if (failedCount > 0) {
      console.log('⚠️ Failed messages in cache:', 
        formatted.filter((m: Message) => m.failed).map(m => ({
          id: m.localId || m._id,
          text: m.text?.substring(0, 20)
        }))
      );
    }
    
    return formatted;
    
  } catch (error) {
    console.error('❌ Error loading cached messages:', error);
    return [];
  }
}, []); // Add isOnline dependency

// ==================== CACHE FUNCTIONS ====================



// ==================== ADD A CLEANUP FUNCTION ====================

useEffect(() => {
  // Clean up undefined properties when component mounts
  if (contactChatId && messages.length > 0) {
    const hasUndefinedProps = messages.some(msg => 
      msg.pending === undefined || 
      msg.failed === undefined
    );
    
    if (hasUndefinedProps) {
      console.log('🧹 Cleaning up undefined properties');
      const cleanedMessages = messages.map(msg => ({
        ...msg,
        pending: msg.pending !== undefined ? msg.pending : false,
        failed: msg.failed !== undefined ? msg.failed : false,
        localId: msg.localId || (msg._id?.startsWith('local_') ? msg._id : undefined),
      }));
      
      setMessages(cleanedMessages);
      saveToCache(contactChatId, cleanedMessages);
    }
  }
}, [contactChatId, messages.length]);

const getOfflineMessages = useCallback((chatId: string): Message[] => {
  try {
    const offlineKey = OFFLINE_MESSAGES_KEY(chatId);
    const offline = localStorage.getItem(offlineKey);
    
    console.log('🔍 Getting offline messages for:', offlineKey);
    
    if (offline) {
      const messages = JSON.parse(offline);
      
      console.log('📊 Raw offline storage:', {
        total: messages.length,
        messages: messages.map((m: any, i: number) => ({
          index: i,
          localId: m.localId,
          text: m.text?.substring(0, 20),
          pending: m.pending,
          failed: m.failed
        }))
      });
      
      // FIX: Keep pending OR failed messages (we need to retry failed ones)
      const validMessages = messages.filter((msg: any) => {
        // Keep if pending OR failed (so we can retry)
        const shouldKeep = msg.pending === true || msg.failed === true;
        
        if (!shouldKeep && msg.localId) {
          console.log('🗑️ Filtering out offline message:', {
            localId: msg.localId,
            text: msg.text?.substring(0, 20),
            pending: msg.pending,
            failed: msg.failed,
            reason: 'Not pending and not failed'
          });
        }
        
        return shouldKeep;
      });
      
      // If we filtered some out, update storage
      if (validMessages.length !== messages.length) {
        localStorage.setItem(offlineKey, JSON.stringify(validMessages));
        console.log('🧹 Cleaned offline storage:', {
          before: messages.length,
          after: validMessages.length
        });
      }
      
      console.log('📱 Loaded valid offline messages:', {
        total: validMessages.length,
        pending: validMessages.filter((m: any) => m.pending).length,
        failed: validMessages.filter((m: any) => m.failed).length,
        key: offlineKey
      });
      
      return validMessages;
    } else {
      console.log('📭 No offline storage found for key:', offlineKey);
    }
  } catch (error) {
    console.error('❌ Error getting offline messages:', error);
  }
  
  return [];
}, []);



const saveOfflineMessage = useCallback((chatId: string, message: Message) => {
  try {
    console.log('💾 SAVING TO OFFLINE STORAGE:', {
      localId: message.localId,
      text: message.text?.substring(0, 20),
      pending: message.pending,
      failed: message.failed,
      chatId: chatId
    });
    
    // Get offline key
    const offlineKey = OFFLINE_MESSAGES_KEY(chatId);
    
    // Get current offline messages
    const currentRaw = localStorage.getItem(offlineKey);
    const currentMessages = currentRaw ? JSON.parse(currentRaw) : [];
    
    console.log('📁 Before save - offline storage:', {
      key: offlineKey,
      currentCount: currentMessages.length
    });
    
    // Check if message already exists
    const existingIndex = currentMessages.findIndex((m: any) => 
      m.localId === message.localId
    );
    
    let updatedMessages;
    if (existingIndex >= 0) {
      // Update existing
      currentMessages[existingIndex] = {
        ...message,
        _offlineSavedAt: Date.now()
      };
      updatedMessages = currentMessages;
      console.log('📝 Updated existing message at index:', existingIndex);
    } else {
      // Add new
      updatedMessages = [...currentMessages, {
        ...message,
        _offlineSavedAt: Date.now()
      }];
      console.log('➕ Added new message');
    }
    
    // Save to localStorage
    localStorage.setItem(offlineKey, JSON.stringify(updatedMessages));
    
    console.log('✅ Offline save complete:', {
      success: true,
      localId: message.localId,
      totalInStorage: updatedMessages.length
    });
    
  } catch (error) {
    console.error('❌ CRITICAL: Failed to save offline message:', error);
    
    // Last resort emergency save
    try {
      const emergencyKey = OFFLINE_MESSAGES_KEY(chatId);
      const emergencyData = [{
        ...message,
        _emergencySave: true,
        _timestamp: Date.now()
      }];
      localStorage.setItem(emergencyKey, JSON.stringify(emergencyData));
      console.log('🆘 Emergency save performed');
    } catch (e) {
      console.error('❌ Even emergency save failed:', e);
    }
  }
}, []);

const removeOfflineMessage = useCallback((chatId: string, localId: string) => {
  try {
    const offlineKey = OFFLINE_MESSAGES_KEY(chatId);
    const offline = getOfflineMessages(chatId);
    
    const beforeCount = offline.length;
    const filtered = offline.filter(msg => msg.localId !== localId);
    
    if (filtered.length !== beforeCount) {
      localStorage.setItem(offlineKey, JSON.stringify(filtered));
      console.log('🗑️ Removed offline message:', {
        localId,
        before: beforeCount,
        after: filtered.length,
        success: true
      });
    } else {
      console.log('⚠️ Offline message not found for removal:', localId);
    }
  } catch (error) {
    console.error('Error removing offline message:', error);
  }
}, [getOfflineMessages]);


// ==================== FILE AND MEDIA HANDLING ====================





// ==================== CHAT SETTINGS ACTIONS ====================

const toggleMute = async () => {
  if (!chatInfo || !chatInfo.chatId) return;
  
  try {
    const response = await api.post(`/contact-chats/${chatInfo.chatId}/settings`, {
      setting: 'isMuted',
      value: !chatInfo.settings.isMuted
    });
    
    setChatInfo(prev => {
      if (!prev) return prev;
      
      const updatedInfo = {
        ...prev,
        settings: {
          ...prev.settings,
          isMuted: response.data.chat.isMuted
        }
      };
      
      saveChatInfoToCache(updatedInfo.chatId, updatedInfo);
      
      return updatedInfo;
    });
  } catch (error) {
    console.error("Error toggling mute:", error);
  }
};

const togglePin = async () => {
  if (!chatInfo || !chatInfo.chatId) return;
  
  try {
    const response = await api.post(`/contact-chats/${chatInfo.chatId}/settings`, {
      setting: 'isPinned',
      value: !chatInfo.settings.isPinned
    });
    
    setChatInfo(prev => {
      if (!prev) return prev;
      
      const updatedInfo = {
        ...prev,
        settings: {
          ...prev.settings,
          isPinned: response.data.chat.isPinned
        }
      };
      
      saveChatInfoToCache(updatedInfo.chatId, updatedInfo);
      
      return updatedInfo;
    });
  } catch (error) {
    console.error("Error toggling pin:", error);
  }
};

const toggleArchive = async () => {
  if (!chatInfo || !chatInfo.chatId) return;
  
  try {
    const response = await api.post(`/contact-chats/${chatInfo.chatId}/settings`, {
      setting: 'isArchived',
      value: !chatInfo.settings.isArchived
    });
    
    setChatInfo(prev => {
      if (!prev) return prev;
      
      const updatedInfo = {
        ...prev,
        settings: {
          ...prev.settings,
          isArchived: response.data.chat.isArchived
        }
      };
      
      saveChatInfoToCache(updatedInfo.chatId, updatedInfo);
      
      return updatedInfo;
    });
    
    if (response.data.chat.isArchived) {
      navigate("/contact-chats");
    }
  } catch (error) {
    console.error("Error toggling archive:", error);
  }
};

const clearChat = async () => {
  if (!chatInfo?.chatId || !window.confirm('Очистить всю переписку?')) return;
  
  try {
    if (isOnline) {
      await api.delete(`/contact-chats/${chatInfo.chatId}/clear`);
    }
    setMessages([]);
    localStorage.removeItem(CHAT_CACHE_KEY(chatInfo.chatId));
    localStorage.removeItem(OFFLINE_MESSAGES_KEY(chatInfo.chatId));
    socket.emit("contact-chat:clear", { contactChatId: chatInfo.chatId });
  } catch (error) {
    console.error("Error clearing chat:", error);
  }
};

// ==================== MESSAGE CLICK HANDLING ====================

// Add this function to handle message click
const handleMessageClick = (msg: Message, e: React.MouseEvent) => {
  e.stopPropagation();

  if (msg.pending) return;

  // Toggle logic: If same message clicked, close it. If different, open new one.
  setShowMessageActions(prev => prev === msg._id ? null : msg._id);

  if (!msg.isMine && !msg.read && isOnline) {
    markMessageAsRead(msg._id);
  }
};

const markMessageAsRead = async (messageId: string) => {
  if (!chatInfo?.chatId || !messageId || !isOnline) return;
  
  const message = messages.find(m => m._id === messageId);
  if (!message || message.isMine || message.read) return;

  try {
    setMessages(prev => prev.map(msg => 
      msg._id === messageId ? { ...msg, read: true } : msg
    ));
    
    setUnreadMessages(prev => prev.filter(id => id !== messageId));
    updateMessageNotifications(chatInfo.chatId, messageId);
    
    if (isOnline) {
      await api.post(`/contact-chats/${chatInfo.chatId}/messages/${messageId}/read`);
      socket.emit("contact-chat:message-read", { 
        contactChatId: chatInfo.chatId,
        messageId,
        readBy: user?.globalIdentityId
      });
    }
    
  } catch (error) {
    console.error("Error marking message as read:", error);
  }
};

// Add this useEffect for auto-read
// Add this useEffect for auto-read
useEffect(() => {
  if (!chatInfo?.chatId || messages.length === 0 || !isOnline) return;
  
  const hasUnread = messages.some(msg => !msg.isMine && !msg.read);
  
  if (hasUnread) {
    const timer = setTimeout(() => {
      markAllAsRead();
    }, 1000);
    
    return () => clearTimeout(timer);
  }
}, [chatInfo?.chatId, messages.length, isOnline]);

// ==================== THROTTLE FUNCTION ====================


// ==================== TEXTAREA AUTO-RESIZE ====================

useEffect(() => {
  if (textareaRef.current) {
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
  }
}, [newMessage]);

// ==================== NAVBAR HIDING FOR MOBILE ====================

useEffect(() => {
  const hideNavbar = () => {
    const navbar = document.querySelector('nav');
    if (navbar && window.innerWidth < 1024) {
      navbar.style.display = 'none';
    }
  };

  const showNavbar = () => {
    const navbar = document.querySelector('nav');
    if (navbar) {
      navbar.style.display = 'flex';
    }
  };

  hideNavbar();

  return () => {
    showNavbar();
  };
}, []);

// ==================== ADD/REMOVE CHAT PAGE CLASS ====================

useEffect(() => {
  document.body.classList.add("in-chat-page");
  return () => {
    document.body.classList.remove("in-chat-page");
  };
}, []);

  // ==================== DEDUPLICATION FUNCTIONS ====================

const deduplicateMessages = useCallback((messages: Message[]): Message[] => {
  const seenServerIds = new Set<string>();
  const seenLocalIds = new Set<string>();
  const seenTexts = new Map<string, { timestamp: number, id: string }>();
  const result: Message[] = [];
  
  // Sort by newest first to process the most complete data first
  const sorted = [...messages].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  sorted.forEach(msg => {
    // 1. Check by server ID
    if (msg._id && !msg._id.startsWith('local_')) {
      if (seenServerIds.has(msg._id)) return;
      seenServerIds.add(msg._id);
    }
    
    // 2. Check by local ID
    if (msg.localId) {
      if (seenLocalIds.has(msg.localId)) return;
      seenLocalIds.add(msg.localId);
    }
    
    // 3. Fuzzy match: Same text + sender within 5 seconds
    if (msg.text && msg.senderId) {
      const key = `${msg.text}_${msg.senderId}`;
      const existing = seenTexts.get(key);
      const timestamp = new Date(msg.createdAt).getTime();
      
      if (existing && Math.abs(timestamp - existing.timestamp) < 5000) {
        return; // Skip as duplicate
      }
      seenTexts.set(key, { timestamp, id: msg.localId || msg._id });
    }
    
    result.push(msg);
  });
  
  return result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}, []);
// ==================== FIX CACHE SAVING - CRITICAL UPDATE ====================


const saveToCache = useCallback((chatId: string, messagesToSave: Message[]) => {
  try {
    console.log('💾 STARTING CACHE SAVE');
    
    // Get offline messages too
    const offlineMessages = getOfflineMessages(chatId);
    
    console.log('📊 Saving:', {
      stateMessages: messagesToSave.length,
      offlineMessages: offlineMessages.length,
      pendingInState: messagesToSave.filter((m: Message) => m.pending).length,
      pendingOffline: offlineMessages.filter((m: Message) => m.pending).length
    });
    
    // Combine state messages with offline messages
    const combinedMessages = [...messagesToSave];
    
    // Add offline messages that aren't already in state
    offlineMessages.forEach(offlineMsg => {
      const exists = messagesToSave.some(stateMsg => 
        stateMsg.localId === offlineMsg.localId || 
        stateMsg._id === offlineMsg.localId
      );
      
      if (!exists && offlineMsg.localId) {
        console.log('➕ Adding offline message to cache:', offlineMsg.localId);
        combinedMessages.push(offlineMsg);
      }
    });
    
    // Create a deep copy
    const messagesCopy = JSON.parse(JSON.stringify(combinedMessages));
    
    // Ensure all properties are preserved
    const messagesToCache = messagesCopy.map((msg: any) => ({
      _id: msg._id || msg.localId || `cache_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: msg.text || '',
      senderId: msg.senderId || '',
      senderName: msg.senderName || '',
      createdAt: msg.createdAt || new Date().toISOString(),
      read: !!msg.read,
      readBy: Array.isArray(msg.readBy) ? msg.readBy : [],
      isMine: !!msg.isMine,
      type: msg.type || "text",
      fileUrl: msg.fileUrl,
      fileName: msg.fileName,
      fileSize: msg.fileSize,
      replyTo: msg.replyTo,
      // CRITICAL: Preserve ALL status flags
      pending: msg.pending !== undefined ? msg.pending : false,
      failed: msg.failed !== undefined ? msg.failed : false,
      localId: msg.localId || (msg._id?.startsWith('local_') ? msg._id : undefined),
      _cacheTimestamp: Date.now(),
      _source: msg.localId?.startsWith('local_') ? 'offline' : 'server'
    }));

    // Sort chronologically
    const sorted = messagesToCache.sort((a: Message, b: Message) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Save to localStorage
    const cacheKey = CHAT_CACHE_KEY(chatId);
    localStorage.setItem(cacheKey, JSON.stringify(sorted));
    
    console.log('✅ CACHE SAVE COMPLETE:', {
      total: sorted.length,
      pending: sorted.filter((m: Message) => m.pending).length,
      failed: sorted.filter((m: Message) => m.failed).length,
      offlineIncluded: sorted.filter((m: any) => m._source === 'offline').length
    });

  } catch (error) {
    console.error('❌ CACHE SAVE ERROR:', error);
  }
}, [getOfflineMessages]); // Add dependency // Add isOnline to dependencies



  // ==================== MESSAGE LOADING FUNCTIONS ====================
// Update the loadAllMessagesForDisplay function
const loadAllMessagesForDisplay = useCallback((chatId: string): Message[] => {
  console.log('🔄 Loading all messages for display');
  
  // 1. Load from cache (server messages)
  const cachedMessages = loadCachedMessages(chatId);
  
  // 2. Load from offline storage (pending/failed messages)
  const offlineMessages = getOfflineMessages(chatId);
  
  console.log('📊 Sources:', {
    cache: cachedMessages.length,
    offline: offlineMessages.length,
    offlinePending: offlineMessages.filter((m: Message) => m.pending).length,
    offlineFailed: offlineMessages.filter((m: Message) => m.failed).length
  });
  
  // 3. Create a map to combine messages
  const messageMap = new Map<string, Message>();
  
  // Add cached messages first (server messages)
  cachedMessages.forEach(msg => {
    const key = msg._id || msg.localId || Math.random().toString();
    messageMap.set(key, msg);
  });
  
  // Add offline messages (override if newer or pending/failed)
  offlineMessages.forEach(offlineMsg => {
    const key = offlineMsg.localId || offlineMsg._id || Math.random().toString();
    const existing = messageMap.get(key);
    
    // Add offline messages if:
    // 1. Not already in map
    // 2. Is pending (needs to be sent)
    // 3. Is failed (needs retry)
    if (!existing || offlineMsg.pending || offlineMsg.failed) {
      messageMap.set(key, offlineMsg);
      console.log('➕ Added offline message to display:', {
        localId: offlineMsg.localId,
        pending: offlineMsg.pending,
        failed: offlineMsg.failed,
        text: offlineMsg.text?.substring(0, 20)
      });
    }
  });
  
  // Convert to array
  const allMessages = Array.from(messageMap.values());
  
  // Sort chronologically
  const sorted = allMessages.sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  
  console.log('✅ Final display messages:', {
    total: sorted.length,
    pending: sorted.filter((m: Message) => m.pending).length,
    failed: sorted.filter((m: Message) => m.failed).length,
    offlineIncluded: offlineMessages.length
  });
  
  return sorted;
}, [loadCachedMessages, getOfflineMessages]);


// ==================== NETWORK STATUS ====================


  // ==================== INITIAL LOAD ====================

 // Update your initial load useEffect
// Update your initial load useEffect
useEffect(() => {
  // In your initial load useEffect:
const loadInitialData = async () => {
  if (!contactChatId) return;
  
  console.log('🚀 Initial load for contact chat:', contactChatId);
  
  // Set online status
  setIsOnline(navigator.onLine);
  
  // Load chat info
  const cachedChatInfo = loadCachedChatInfo(contactChatId);
  if (cachedChatInfo) {
    setChatInfo(cachedChatInfo);
  }
  
  // Load messages including offline
  const displayMessages = loadAllMessagesForDisplay(contactChatId);
  
  console.log('⚡ Initial messages loaded:', {
    total: displayMessages.length,
    pending: displayMessages.filter((m: Message) => m.pending).length,
    failed: displayMessages.filter((m: Message) => m.failed).length
  });
  
  // Log pending messages
  const pendingMessages = displayMessages.filter((m: Message) => m.pending);
  if (pendingMessages.length > 0) {
    console.log('📋 Pending messages found:', 
      pendingMessages.map(m => ({
        localId: m.localId,
        text: m.text?.substring(0, 20),
        pending: m.pending
      }))
    );
  }
  
  setMessages(displayMessages);
  setInitialLoadComplete(true);
  
  // Scroll
  setTimeout(() => scrollToBottom(), 300);
  
  // Load from server if online
  if (navigator.onLine) {
    await loadChatData();
  } else {
    setLoading(false);
  }

 //
    
   
    
  


};
  
  loadInitialData();
}, [contactChatId], );

  // ==================== CHAT DATA LOADING ====================
// Add this function to get or create chat by contact ID

const loadChatData = async (pageNum = 1, isLoadMore = false) => {
  if (!contactChatId) return;
  
  try {
    if (!isLoadMore) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    
    // Always load from cache first for instant display
    if (!isLoadMore) {
      const cachedMessages = loadCachedMessages(contactChatId);
      const offlineMessages = getOfflineMessages(contactChatId);
      
      console.log('⚡ Initial cache load:', {
        cached: cachedMessages.length,
        offline: offlineMessages.length
      });
      
      // Combine and display immediately
      if (cachedMessages.length > 0 || offlineMessages.length > 0) {
        const combined = [...offlineMessages, ...cachedMessages];
        const deduplicated = deduplicateMessages(combined);
        const sorted = deduplicated.sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        
        console.log('🚀 Displaying cached messages immediately:', sorted.length);
        setMessages(sorted);
      }
    }
    
    // Load from server if online
    if (isOnline) {
      console.log('🌐 Loading from server, page:', pageNum);
      
      try {
        const response = await api.get(`/contact-chats/${contactChatId}?page=${pageNum}&limit=${messagesPerPage}`);
        
        if (response?.data) {
          // Update chat info
          const chatData = response.data.chat || response.data;
         // В функции loadChatData, после получения данных с сервера:
const formattedChatInfo: ChatInfo = {
  chatId: chatData.chatId || contactChatId || "",
  otherParticipant: {
    identityId: chatData.otherParticipant?.identityId || "",
    name: getCustomerLocalName(
      chatData.otherParticipant?.phone,
      chatData.otherParticipant?.identityId,
      chatData.otherParticipant?.name || "Без имени"
    ),
    localName: getCustomerLocalName(
      chatData.otherParticipant?.phone,
      chatData.otherParticipant?.identityId,
      chatData.otherParticipant?.name || "Без имени"
    ),
    phone: chatData.otherParticipant?.phone || "",
    isRegistered: chatData.otherParticipant?.isRegistered || false,
    status: 'offline',
    lastSeen: chatData.otherParticipant?.lastSeen || new Date().toISOString()
  },
  settings: chatData.settings || {
    isMuted: false,
    isArchived: false,
    isPinned: false
  },
  lastMessage: chatData.lastMessage || "",
  lastMessageType: chatData.lastMessageType,
  lastAt: chatData.lastAt || new Date().toISOString()
};
          
          saveChatInfoToCache(formattedChatInfo.chatId, formattedChatInfo);
          setChatInfo(formattedChatInfo);
          
          // Format server messages
          const serverMessages: Message[] = (response.data?.messages || []).map((msg: any) => ({
            _id: msg._id,
            text: msg.text,
            senderId: msg.senderId,
            senderName: msg.senderName,
            createdAt: msg.createdAt,
            read: msg.read || false,
            readBy: msg.readBy || [],
            isMine: msg.senderId === user?.globalIdentityId,
            type: msg.type || "text",
            fileUrl: msg.fileUrl,
            fileName: msg.fileName,
            fileSize: msg.fileSize,
            replyTo: msg.replyTo || undefined,
            pending: false,
            failed: false,
            localId: undefined,
          }));
          
          console.log('📥 Server messages received:', serverMessages.length);
          
          // Merge with existing messages
          setMessages(prev => {
            // Keep local/offline messages
            const localMessages = prev.filter(msg => 
              msg.localId?.startsWith('local_') || 
              msg._id?.startsWith('local_') || 
              msg.pending ||
              msg.failed
            );
            
            // Merge strategy: server messages + local messages
            const allMessages = [...prev, ...serverMessages];

            const deduplicated = deduplicateMessages(allMessages);
            const sorted = deduplicated.sort((a, b) => 
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
            
            // SAVE TO CACHE - CRITICAL!
            saveToCache(contactChatId, sorted);
            
            console.log('🔄 Merged result:', {
              server: serverMessages.length,
              local: localMessages.length,
              total: sorted.length,
              lastMessage: sorted[sorted.length - 1]?.text?.substring(0, 20)
            });
            
            return sorted;
          });
          
          // Update pagination
          setHasMoreMessages(response.data.pagination?.hasMore || false);
          
          // Update unread messages
          const unreadIds = serverMessages
            .filter((msg: Message) => !msg.isMine && !msg.read)
            .map((msg: Message) => msg._id);
          
          if (unreadIds.length > 0) {
            setUnreadMessages(prev => [...prev, ...unreadIds]);
          }
        }
      } catch (serverError) {
        console.error('❌ Server load error:', serverError);
        // Continue with cached data
      }
    }
    
  } catch (error: any) {
    console.error("Error loading chat:", error);
  } finally {
    setLoading(false);
    setLoadingMore(false);
  }
};


useEffect(() => {
  console.log('📊 Messages state updated:', {
    total: messages.length,
    localMessages: messages.filter(m => m.localId?.startsWith('local_') || m._id?.startsWith('local_')).length,
    serverMessages: messages.filter(m => !m.localId?.startsWith('local_') && !m._id?.startsWith('local_')).length,
    pending: messages.filter(m => m.pending).length,
    failed: messages.filter(m => m.failed).length
  });
}, [messages]);
useEffect(() => {
  console.log('🔍 DEBUG: Current messages state:', messages.map(m => ({
    text: m.text?.substring(0, 20),
    pending: m.pending,
    failed: m.failed,
    localId: m.localId
  })));
}, [messages]);
  // ==================== OFFLINE SYNC ====================



const syncOfflineToState = useCallback(() => {
  if (!chatInfo?.chatId) return;
  
  console.log('🔄 Syncing offline storage to state');
  
  const offlineMessages = getOfflineMessages(chatInfo.chatId);
  
  if (offlineMessages.length === 0) {
    console.log('📭 No offline messages to sync to state');
    return;
  }
  
  setMessages(prev => {
    const messageMap = new Map<string, Message>();
    
    // Add existing messages
    prev.forEach(msg => {
      const key = msg._id || msg.localId || Math.random().toString();
      messageMap.set(key, msg);
    });
    
    // Add/update with offline messages
    let addedCount = 0;
    offlineMessages.forEach(offlineMsg => {
      const key = offlineMsg.localId || offlineMsg._id || Math.random().toString();
      const existing = messageMap.get(key);
      
      // Add if not exists or if offline version is pending
      if (!existing || (offlineMsg.pending && !existing.pending)) {
        messageMap.set(key, offlineMsg);
        addedCount++;
        console.log('➕ Added offline message to state:', offlineMsg.localId);
      }
    });
    
    const allMessages = Array.from(messageMap.values());
    const sorted = allMessages.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    
    if (addedCount > 0) {
      console.log('✅ Added', addedCount, 'offline messages to state');
      saveToCache(chatInfo.chatId, sorted);
    }
    
    return sorted;
  });
}, [chatInfo?.chatId, getOfflineMessages, saveToCache]);

// Add this useEffect
useEffect(() => {
  if (initialLoadComplete && chatInfo?.chatId) {
    // Sync offline to state after initial load
    setTimeout(() => {
      syncOfflineToState();
    }, 1000);
    
    // Also sync periodically
    const interval = setInterval(() => {
      syncOfflineToState();
    }, 10000); // Every 10 seconds
    
    return () => clearInterval(interval);
  }
}, [initialLoadComplete, chatInfo?.chatId, syncOfflineToState]);

// Update your syncOfflineMessages function
const syncOfflineMessages = useCallback(async () => {
  if (!chatInfo?.chatId || !isOnline || isSyncing) {
    console.log('❌ Cannot sync:', { hasChatId: !!chatInfo?.chatId, isOnline, isSyncing });
    return;
  }

  const offlineMessages = getOfflineMessages(chatInfo.chatId);
  
  console.log('🔄 SYNC: Checking offline messages:', {
    total: offlineMessages.length,
    pending: offlineMessages.filter(m => m.pending).length,
    failed: offlineMessages.filter(m => m.failed).length,
    sendingInProgress: sendingInProgress.current.size
  });

  const pending = offlineMessages.filter(m => 
    (m.pending || m.failed) && 
    !sendingInProgress.current.has(m.localId!)
  );

  if (pending.length === 0) {
    console.log('📭 No messages to sync');
    return;
  }

  console.log(`🚀 Starting sync of ${pending.length} messages`);
  setIsSyncing(true);

  let sentCount = 0;
  for (const msg of pending) {
    console.log('📤 Syncing message:', {
      localId: msg.localId,
      text: msg.text?.substring(0, 20),
      pending: msg.pending,
      failed: msg.failed
    });
    
    try {
      await sendPendingMessage(msg, msg.localId!);
      sentCount++;
    } catch (error) {
      console.error('Failed to sync message:', error);
    }
    
    await new Promise(r => setTimeout(r, 300));
  }
  
  console.log('✅ Sync completed - sent', sentCount, 'messages');
  setIsSyncing(false);
  
  // **NEW**: Notify other users that sync is complete
  if (sentCount > 0) {
    socket.emit("contact-chat:sync-complete", {
      contactChatId: chatInfo.chatId,
      userId: user?.globalIdentityId,
      messageCount: sentCount,
      timestamp: new Date().toISOString()
    });
  }
  
  // Refresh messages after sync
  setTimeout(() => {
    loadChatData(1, false);
  }, 1000);
  
}, [chatInfo?.chatId, isOnline, isSyncing, getOfflineMessages]);


const updateOfflineMessageStatus = useCallback((chatId: string, localId: string, pending: boolean, failed: boolean) => {
  try {
    const offlineMessages = getOfflineMessages(chatId);
    const updated = offlineMessages.map(msg => 
      msg.localId === localId 
        ? { ...msg, pending, failed } 
        : msg
    );
    localStorage.setItem(OFFLINE_MESSAGES_KEY(chatId), JSON.stringify(updated));
    console.log('📝 Updated offline message status:', { localId, pending, failed });
  } catch (error) {
    console.error('Error updating offline message:', error);
  }
}, [getOfflineMessages]);

useEffect(() => {
  if (!chatInfo?.chatId || !isOnline) return;
  
  // Sync every 30 seconds when online
  const syncInterval = setInterval(() => {
    const offlineMessages = getOfflineMessages(chatInfo.chatId);
    if (offlineMessages.length > 0) {
      console.log('⏰ Periodic sync check:', offlineMessages.length);
      syncOfflineMessages();
    }
  }, 30000);
  
  return () => clearInterval(syncInterval);
}, [chatInfo?.chatId, isOnline, syncOfflineMessages, getOfflineMessages]);
// Update the network status useEffect to auto-sync
useEffect(() => {
  const handleOnline = () => {
    console.log('🌐 Network online');
    setIsOnline(true);
    
    // Auto-sync after 1 second delay
    setTimeout(() => {
      if (chatInfo?.chatId) {
        syncOfflineMessages();
      }
    }, 1000);
  };
  
  const handleOffline = () => {
    console.log('📴 Network offline');
    setIsOnline(false);
  };
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // Initial sync check
  if (navigator.onLine && chatInfo?.chatId) {
    setTimeout(() => {
      syncOfflineMessages();
    }, 2000);
  }
  
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}, [chatInfo?.chatId, syncOfflineMessages]);
  



// ==================== SENDING MESSAGES ====================
const debugOfflineMessages = () => {
  if (!chatInfo?.chatId) return;
  
  const offline = getOfflineMessages(chatInfo.chatId);
  const current = messages;
  
  console.log('🔍 DEBUG OFFLINE MESSAGES:', {
    offlineStorage: offline.length,
    offlineWithPending: offline.filter(m => m.pending).length,
    currentMessages: current.length,
    currentWithPending: current.filter(m => m.pending).length,
    currentPendingDetails: current.filter(m => m.pending).map(m => ({
      id: m._id,
      localId: m.localId,
      text: m.text?.substring(0, 20),
      pending: m.pending,
      failed: m.failed
    })),
    offlineDetails: offline.map(m => ({
      id: m._id,
      localId: m.localId,
      text: m.text?.substring(0, 20),
      pending: m.pending,
      failed: m.failed
    }))
  });
};



// Call it in useEffect or when needed
useEffect(() => {
  if (chatInfo?.chatId) {
    debugOfflineMessages();
  }
}, [chatInfo?.chatId, messages.length]);

const sendMessage = async () => {
  if (!newMessage.trim() || !chatInfo?.chatId) return;

  const actualIsOnline = navigator.onLine;
  const messageText = newMessage.trim();
  const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const shouldBePending = !actualIsOnline;

  // Get replyTo ID properly
  const replyToId = replyMessage?._id || replyMessage?.localId;
  
  console.log('📝 Creating reply message:', {
    text: messageText.substring(0, 30),
    replyToId,
    replyMessageExists: !!replyMessage,
    replyMessageId: replyMessage?._id,
    replyMessageLocalId: replyMessage?.localId
  });

  const localMessage: Message = {
    _id: localId,
    text: messageText,
    senderId: user?.globalIdentityId || '',
    senderName: user?.name || 'Вы',
    createdAt: new Date().toISOString(),
    read: false,
    readBy: [],
    isMine: true,
    type: "text",
    pending: shouldBePending,
    localId,
    failed: false,
    replyTo: replyToId, // Use the ID directly
  };

  // Clear input BUT DON'T clear replyMessage until we're sure it's saved
  setNewMessage("");

  // Always save to offline storage
  saveOfflineMessage(chatInfo.chatId, {
    ...localMessage,
    pending: true,
  });

  // Add to UI immediately
  setMessages(prev => {
    const updated = [...prev, {
      ...localMessage,
      pending: true,
    }];
    
    console.log('🔄 Adding reply message to state:', {
      total: updated.length,
      messagePending: true,
      replyTo: localMessage.replyTo,
      replyMessageExists: !!replyMessage
    });
    
    saveToCache(chatInfo.chatId, updated);
    return updated;
  });

  // Scroll to bottom
  setTimeout(() => scrollToBottom(), 50);

  // Clear reply message ONLY after it's saved in state
  setReplyMessage(null);

  // Try to send if online
  if (actualIsOnline) {
    console.log('🌐 Online - sending reply to server');
    sendPendingMessage(localMessage, localId);
  } else {
    console.log('📴 Offline - reply message saved for later sync');
    
    // Show offline notification
    
    
    ;
  }
};


const sendPendingMessage = async (message: Message, localId: string) => {
  if (!chatInfo?.chatId || !isOnline || sendingInProgress.current.has(localId)) return;

  sendingInProgress.current.add(localId);

  try {
    const response = await api.post(`/contact-chats/${chatInfo.chatId}/messages`, {
      text: message.text,
      replyTo: message.replyTo,
      localId: localId,
      type: "text"
    });

    const serverMessage: Message = {
      ...response.data,
      isMine: true,
      pending: false,
      failed: false,
      localId: undefined,
    };

    // **CRITICAL FIX**: Remove from OFFLINE storage when successfully sent
    removeOfflineMessage(chatInfo.chatId, localId);
    
    // **NEW**: Emit socket event so other users receive it immediately
    socket.emit("contact-chat:new-message", {
      contactChatId: chatInfo.chatId,
      ...serverMessage,
      senderId: user?.globalIdentityId,
      senderName: user?.name || 'Вы',
    });

    setMessages(prev => {
      const withoutLocal = prev.filter(m => m.localId !== localId && m._id !== localId);
      const updated = deduplicateMessages([...withoutLocal, serverMessage]);
      saveToCache(chatInfo.chatId, updated);
      return updated;
    });

  } catch (error) {
    console.error("❌ Send failed:", error);
    
    // **CRITICAL**: Mark as failed in OFFLINE storage
    setMessages(prev => prev.map(m => 
      m.localId === localId ? { ...m, pending: false, failed: true } : m
    ));
    
    // Update offline storage status
    updateOfflineMessageStatus(chatInfo.chatId, localId, false, true);
  } finally {
    sendingInProgress.current.delete(localId);
  }
};

useEffect(() => {
  const verifyCacheAfterLoad = () => {
    if (!contactChatId || messages.length === 0) return;
    
    setTimeout(() => {
      const cached = localStorage.getItem(CHAT_CACHE_KEY(contactChatId));
      const cachedMessages = cached ? JSON.parse(cached) : [];
      
      console.log('🔍 Cache verification after load:', {
        currentMessages: messages.length,
        cachedMessages: cachedMessages.length,
        match: messages.length === cachedMessages.length,
        currentLast: messages[messages.length - 1],
        cachedLast: cachedMessages[cachedMessages.length - 1]
      });
      
      // If mismatch, force save current messages
      if (messages.length !== cachedMessages.length) {
        console.log('⚠️ Cache mismatch detected, forcing save');
        saveToCache(contactChatId, messages);
      }
    }, 1000);
  };
  
  verifyCacheAfterLoad();
}, [messages.length, contactChatId]);





useEffect(() => {
  const handleBeforeUnload = () => {
    if (chatInfo?.chatId && messages.length > 0) {
      console.log('🔒 Saving cache before page unload');
      saveToCache(chatInfo.chatId, messages);
      
      // Force synchronous save
      localStorage.setItem('last_save_time', Date.now().toString());
    }
  };
  
  window.addEventListener('beforeunload', handleBeforeUnload);
  
  return () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}, [chatInfo?.chatId, messages.length]);
// ==================== ADD MESSAGE KEY GENERATOR ====================

// Add this function for generating unique message keys
const generateMessageKey = useCallback((msg: Message): string => {
  // Generate unique key for React rendering
  if (msg._id && !msg._id.startsWith('local_') && !msg._id.startsWith('test_')) {
    return `server_${msg._id}_${new Date(msg.createdAt).getTime()}`; // Add timestamp
  }
  
  if (msg.localId) {
    return `local_${msg.localId}_${new Date(msg.createdAt).getTime()}`;
  }
  
  if (msg._id && (msg._id.startsWith('local_') || msg._id.startsWith('test_'))) {
    return `local_id_${msg._id}_${new Date(msg.createdAt).getTime()}`;
  }
  
  // Fallback with more uniqueness
  const timestamp = new Date(msg.createdAt).getTime();
  const random = Math.random().toString(36).substr(2, 9);
  return `fallback_${msg.text?.substring(0, 10)}_${timestamp}_${msg.senderId}_${random}`;
}, []);
// ==================== ADD EMERGENCY RECOVERY FUNCTION ====================


useEffect(() => {
  const verifyCacheOnMount = () => {
    if (!contactChatId) return;
    
    setTimeout(() => {
      const cacheKey = CHAT_CACHE_KEY(contactChatId);
      const cached = localStorage.getItem(cacheKey);
      const cachedMessages = cached ? JSON.parse(cached) : [];
      
      console.log('🔍 Cache verification on mount:', {
        cacheKey,
        cachedMessages: cachedMessages.length,
        lastMessage: cachedMessages[cachedMessages.length - 1]?.text?.substring(0, 30)
      });
      
      // If cache is empty but we have messages, save them
      if (cachedMessages.length === 0 && messages.length > 0) {
        console.log('🔄 Cache empty, saving current messages');
        saveToCache(contactChatId, messages);
      }
    }, 1000);
  };
  
  verifyCacheOnMount();
}, [contactChatId, messages.length]);

useEffect(() => {
  if (!chatInfo?.chatId || messages.length === 0) return;
  
  const backupInterval = setInterval(() => {
    console.log('🔄 Periodic cache backup');
    saveToCache(chatInfo.chatId, messages);
  }, 30000); // Backup every 30 seconds
  
  return () => clearInterval(backupInterval);
}, [chatInfo?.chatId, messages]);
  // ==================== SOCKET CONNECTION ====================

  useEffect(() => {
    if (!chatInfo?.chatId || !user?.globalIdentityId) return;

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("join-contact-chat", chatInfo.chatId);

    const handleUserStatus = (data: { identityId: string; status: string; lastSeen: string }) => {
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
          
          saveChatInfoToCache(updatedInfo.chatId, updatedInfo);
          
          return updatedInfo;
        });
      }
    };

const handleNewMessage = (data: any) => {
  if (data.contactChatId === chatInfo?.chatId) {
    const isMyMessage = data.senderId === user?.globalIdentityId;

    setMessages(prev => {
      // 1. Check if we already have this exact server ID
      const alreadyHasServerId = prev.some(m => m._id === data._id);
      if (alreadyHasServerId) return prev;

      // 2. If it's my message, try to find the "pending" version by text matching
      // (Since your server isn't returning the localId)
      if (isMyMessage) {
        const pendingIndex = prev.findIndex(m => 
          m.pending === true && 
          m.text === data.text &&
          m.isMine === true
        );

        if (pendingIndex > -1) {
          // Found the local version! Replace it with the server version
          const updated = [...prev];
          updated[pendingIndex] = {
            ...data,
            isMine: true,
            pending: false,
            localId: prev[pendingIndex].localId // Keep localId for cache consistency
          };
          
          const sorted = updated.sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          saveToCache(chatInfo.chatId, sorted);
          return sorted;
        }
      }

      // 3. If no match found (or not my message), add as new
      const newMsg: Message = {
        ...data,
        isMine: isMyMessage,
        pending: false,
        failed: false,
      };

      const final = [...prev, newMsg].sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      
      saveToCache(chatInfo.chatId, final);
      return final;
    });
  }
};

    const handleTyping = (data: any) => {
      if (data.contactChatId === chatInfo.chatId && data.identityId !== user?.globalIdentityId) {
        setOtherIsTyping(data.isTyping);
      }
    };

    const handleMessageRead = (data: any) => {
      if (data.contactChatId === chatInfo?.chatId) {
        setMessages(prev => prev.map(msg => 
          msg._id === data.messageId 
            ? { 
                ...msg, 
                read: true, 
                readBy: data.readByUsers || [] 
              }
            : msg
        ));
        
        setUnreadMessages(prev => prev.filter(id => id !== data.messageId));
      }
    };

    const handleAllRead = (data: any) => {
      if (data.contactChatId === chatInfo?.chatId) {
        setMessages(prev => prev.map(msg => 
          !msg.isMine ? { ...msg, read: true } : msg
        ));
        setUnreadMessages([]);
      }
    };

    const handleMessageDeleted = (data: any) => {
      if (data.contactChatId === chatInfo.chatId) {
        setMessages(prev => {
          const updated = prev.filter(msg => msg._id !== data.messageId);
          saveToCache(chatInfo.chatId, updated);
          return updated;
        });
      }
    };

    const handleChatCleared = (data: any) => {
      if (data.contactChatId === chatInfo.chatId) {
        setMessages([]);
        localStorage.removeItem(CHAT_CACHE_KEY(chatInfo.chatId));
        localStorage.removeItem(OFFLINE_MESSAGES_KEY(chatInfo.chatId));
      }
    };

    socket.on("user:status-changed", handleUserStatus);
    socket.on("contact-chat:new-message", handleNewMessage);
    socket.on("contact-chat:typing", handleTyping);
    socket.on("contact-chat:message-read", handleMessageRead);
    socket.on("contact-chat:all-read", handleAllRead);
    socket.on("contact-chat:message-deleted", handleMessageDeleted);
    socket.on("contact-chat:cleared", handleChatCleared);

    return () => {
      socket.off("contact-chat:new-message", handleNewMessage);
      socket.off("contact-chat:typing", handleTyping);
      socket.off("contact-chat:message-read", handleMessageRead);
      socket.off("contact-chat:all-read", handleAllRead);
      socket.off("contact-chat:message-deleted", handleMessageDeleted);
      socket.off("contact-chat:cleared", handleChatCleared);
      socket.off("user:status-changed", handleUserStatus);
      socket.emit("leave-contact-chat", chatInfo.chatId);
    };
  }, [chatInfo, user, deduplicateMessages, saveToCache, saveChatInfoToCache]);

  // ==================== UTILITY FUNCTIONS ====================

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
// Add this function after the formatDate function
// Update the getRepliedMessage function with more debugging:
const getRepliedMessage = useCallback((replyToId: string): Message | null => {
  if (!replyToId) {
    console.log('❌ No replyToId provided');
    return null;
  }
  
  console.log('🔍 Looking for replied message with ID:', replyToId);
  console.log('📊 Total messages to search:', messages.length);
  
  // Log first few messages to see what we have
  messages.slice(0, 3).forEach((msg, i) => {
    console.log(`Message ${i}:`, {
      id: msg._id,
      localId: msg.localId,
      replyTo: msg.replyTo,
      text: msg.text?.substring(0, 20)
    });
  });
  
  const foundMessages: Message[] = [];
  
  messages.forEach((msg, index) => {
    // Exact match with _id
    if (msg._id === replyToId) {
      console.log(`✅ Found by _id at index ${index}:`, msg.text?.substring(0, 30));
      foundMessages.push(msg);
    }
    
    // Match with localId
    if (msg.localId === replyToId) {
      console.log(`✅ Found by localId at index ${index}:`, msg.text?.substring(0, 30));
      foundMessages.push(msg);
    }
    
    // Also check if the message has a replyTo that matches (nested replies)
    if (msg.replyTo === replyToId) {
      console.log(`🔗 Message at index ${index} replies to this ID`);
    }
  });
  
  console.log('🔍 Total found messages:', foundMessages.length);
  
  if (foundMessages.length > 0) {
    const latest = foundMessages.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    
    console.log('🎯 Selected latest message:', {
      text: latest.text?.substring(0, 30),
      id: latest._id,
      localId: latest.localId,
      isMine: latest.isMine,
      pending: latest.pending
    });
    
    return latest;
  }
  
  console.log('❌ No matching message found');
  
  // Check if it's a server message ID we haven't loaded yet
  if (replyToId && !replyToId.startsWith('local_') && !replyToId.startsWith('test_')) {
    console.log('⚠️ ReplyTo appears to be a server message ID, might not be loaded yet');
  }
  
  return null;
}, [messages]);

const scrollToBottom = useCallback(() => {
  if (chatContainerRef.current) {
    const container = chatContainerRef.current;
    
    // Calculate the exact scroll position
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    
    // Only scroll if we're not already at the bottom
    const currentScroll = container.scrollTop + clientHeight;
    const isAtBottom = Math.abs(scrollHeight - currentScroll) < 50;
    
    if (!isAtBottom) {
      container.scrollTo({
        top: scrollHeight,
        behavior: 'smooth'
      });
      console.log('📜 Scrolling to bottom, scrollHeight:', scrollHeight);
    }
  }
}, []);

// Update the handleScroll function
const handleScroll = useCallback(() => {
  if (showMessageActions) setShowMessageActions(null); 

  if (!chatContainerRef.current) return;
  
  const container = chatContainerRef.current;
  const scrollTop = container.scrollTop;
  
  // Save scroll position
  scrollPositionRef.current = scrollTop;
  
  const scrollHeight = container.scrollHeight;
  const clientHeight = container.clientHeight;
  
  // Show "scroll to bottom" button if we're not near bottom
  const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
  setShowScrollToBottom(!isAtBottom);
  
  // Load more messages when scrolling up
  if (scrollTop < 200 && hasMoreMessages && !loadingMore) {
    const nextPage = page + 1;
    setPage(nextPage);
    loadChatData(nextPage, true);
  }
}, [showMessageActions, hasMoreMessages, loadingMore, page, loadChatData]);

 
// Add this useEffect to restore scroll position
useEffect(() => {
  if (!initialLoadComplete || !chatContainerRef.current || messages.length === 0) return;
  
  const container = chatContainerRef.current;
  
  // Wait for DOM to update
  setTimeout(() => {
    if (scrollPositionRef.current > 0) {
      // Restore previous scroll position
      container.scrollTop = scrollPositionRef.current;
      console.log('📜 Restored scroll position:', scrollPositionRef.current);
    } else {
      // Scroll to bottom for new chat or initial load
      scrollToBottom();
      console.log('📜 Initial scroll to bottom');
    }
  }, 300);
  
}, [initialLoadComplete, messages.length, scrollToBottom]);
const checkForDuplicates = () => {
  if (!messages.length) return;
  
  const serverIds = new Set<string>();
  const duplicates: Message[] = [];
  
  messages.forEach(msg => {
    if (msg._id && !msg._id.startsWith('local_') && !msg._id.startsWith('test_')) {
      if (serverIds.has(msg._id)) {
        duplicates.push(msg);
      } else {
        serverIds.add(msg._id);
      }
    }
  });
  
  if (duplicates.length > 0) {
    console.error('❌ Found duplicate messages:', duplicates.map(d => ({
      id: d._id,
      text: d.text?.substring(0, 30),
      time: d.createdAt
    })));
    
    // Auto-clean duplicates
    const uniqueMessages = deduplicateMessages(messages);
    if (uniqueMessages.length !== messages.length) {
      console.log('🧹 Auto-cleaning duplicates');
      setMessages(uniqueMessages);
      saveToCache(chatInfo?.chatId || '', uniqueMessages);
    }
  }
};

// Добавьте этот эффект в ContactChat.tsx
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
      saveChatInfoToCache(updatedChatInfo.chatId, updatedChatInfo);
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
}, [chatInfo?.chatId]); // Зависимость только от ID чата
// В ContactChat.tsx добавьте функцию:
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
useEffect(() => {
  if (messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    console.log('📈 Message state updated:', {
      total: messages.length,
      pending: messages.filter(m => m.pending).length,
      myMessages: messages.filter(m => m.isMine).length,
      lastMessage: {
        text: lastMessage.text?.substring(0, 30),
        isMine: lastMessage.isMine,
        pending: lastMessage.pending,
        localId: lastMessage.localId
      }
    });
  }
}, [messages]);
// Call this after messages update
useEffect(() => {
  checkForDuplicates();
}, [messages]);
// Add cleanup to reset scroll position
useEffect(() => {
  return () => {
    // Save scroll position to localStorage before leaving
    if (chatInfo?.chatId && chatContainerRef.current) {
      const scrollTop = chatContainerRef.current.scrollTop;
      localStorage.setItem(`scroll_pos_${chatInfo.chatId}`, scrollTop.toString());
    }
  };
}, [chatInfo?.chatId]);
// ==================== MESSAGE ACTIONS ====================

 // Add this function for marking all messages as read
const markAllAsRead = async () => {
  if (!chatInfo?.chatId) return;
  
  try {
    setMessages(prev => prev.map(msg => 
      !msg.isMine ? { ...msg, read: true } : msg
    ));
    
    setUnreadMessages([]);
    updateMessageNotifications(chatInfo.chatId);
    
    if (isOnline) {
      await api.post(`/contact-chats/${chatInfo.chatId}/read`);
      socket.emit("contact-chat:all-read", { contactChatId: chatInfo.chatId });
    }
    
  } catch (error) {
    console.error("Error marking all as read:", error);
  }
};
// Add this useEffect to auto-scroll when new messages arrive
useEffect(() => {
  if (!messages.length || !chatContainerRef.current) return;
  
  const lastMessage = messages[messages.length - 1];
  const container = chatContainerRef.current;
  
  // Check if we're near the bottom
  const isNearBottom = 
    container.scrollHeight - container.scrollTop - container.clientHeight < 200;
  
  // Auto-scroll if:
  // 1. It's a new message from anyone AND we're near bottom
  // 2. OR it's our own message (always scroll)
  if (isNearBottom || lastMessage?.isMine) {
    setTimeout(() => {
      scrollToBottom();
    }, 100);
  }
}, [messages, scrollToBottom]);
useEffect(() => {
  const handleBeforeUnload = () => {
    if (chatInfo?.chatId && messages.length > 0) {
      console.log('🔒 Saving cache before page unload...');
      
      // Force synchronous save
      try {
        const cacheKey = CHAT_CACHE_KEY(chatInfo.chatId);
        localStorage.setItem(cacheKey, JSON.stringify(messages));
        localStorage.setItem('last_save', Date.now().toString());
        console.log('✅ Cache saved before unload');
      } catch (error) {
        console.error('❌ Failed to save before unload:', error);
      }
    }
  };
  
  window.addEventListener('beforeunload', handleBeforeUnload);
  
  return () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}, [chatInfo?.chatId, messages]);
  const handleMessageAction = async (messageId: string, action: string) => {
    const message = messages.find(m => m._id === messageId);
    if (!message) return;

    switch (action) {
      case 'copy':
        navigator.clipboard.writeText(message.text);
        break;
        
      case 'reply':
        setReplyMessage(message);
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 100);
        break;
        
      case 'delete':
        if (window.confirm('Удалить сообщение?') && chatInfo?.chatId) {
          try {
            if (isOnline) {
              await api.delete(`/contact-chats/${chatInfo.chatId}/messages/${messageId}`);
            }
            setMessages(prev => {
              const updated = prev.filter(m => m._id !== messageId);
              saveToCache(chatInfo.chatId, updated);
              return updated;
            });
          } catch (error) {
            console.error("Error deleting message:", error);
          }
        }
        break;
        
     case 'retry':
  if (message.localId && (message.failed || message.pending) && chatInfo?.chatId) {
    console.log('🔄 Manual retry for message:', {
      localId: message.localId,
      failed: message.failed,
      pending: message.pending,
      replyTo: message.replyTo // Log replyTo
    });
    
    // Update to pending
    setMessages(prev => prev.map(msg => 
      msg.localId === message.localId 
        ? { ...msg, pending: true, failed: false } 
        : msg
    ));
    
    // Update offline storage - preserve replyTo
    saveOfflineMessage(chatInfo.chatId, {
      ...message,
      pending: true,
      failed: false,
      replyTo: message.replyTo // Preserve replyTo
    });
    
    // Try to send immediately if online
    if (isOnline) {
      await sendPendingMessage({
        ...message,
        replyTo: message.replyTo // Pass replyTo
      }, message.localId);
    }
  }
  break;
    }
    setShowMessageActions(null);
  };

const cleanupOrphanedReplies = useCallback(() => {
  if (!chatInfo?.chatId) return;
  
  const messageIds = new Set(messages.map(m => m._id));
  const localIds = new Set(messages.map(m => m.localId).filter(Boolean));
  
  // Find messages with replyTo that don't exist
  const orphanedReplies = messages.filter(m => 
    m.replyTo && 
    !messageIds.has(m.replyTo) && 
    !localIds.has(m.replyTo)
  );
  
  if (orphanedReplies.length > 0) {
    console.log('🧹 Cleaning orphaned replies:', orphanedReplies.length);
    
    // Clear orphaned replyTo references
    setMessages(prev => prev.map(msg => 
      orphanedReplies.some(orphan => orphan._id === msg._id)
        ? { ...msg, replyTo: undefined }
        : msg
    ));
  }
}, [chatInfo?.chatId, messages]);
useEffect(() => {
  if (messages.length > 0) {
    cleanupOrphanedReplies();
  }
}, [messages.length, cleanupOrphanedReplies]);

useEffect(() => {
  if (!isOnline || !chatInfo?.chatId) return;
  
  // Check for failed messages to retry
  const offlineMessages = getOfflineMessages(chatInfo.chatId);
  const failedMessages = offlineMessages.filter(m => m.failed);
  
  if (failedMessages.length > 0) {
    console.log('🔄 Found failed messages to retry:', failedMessages.length);
    
    // Auto-retry failed messages after 5 seconds
    const timer = setTimeout(() => {
      syncOfflineMessages();
    }, 5000);
    
    return () => clearTimeout(timer);
  }
}, [isOnline, chatInfo?.chatId, getOfflineMessages, syncOfflineMessages]);
  // ==================== UI COMPONENTS ====================
// Add this function to force refresh reply previews


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


const NetworkStatusIndicator = () => {
  const pendingOfflineCount = chatInfo?.chatId ? 
    getOfflineMessages(chatInfo.chatId).filter((m: Message) => m.pending && !m.failed).length : 0;
  
  // Count in current UI state
  const pendingInUI = messages.filter((m: Message) => m.pending && !m.failed).length;
  const failedInUI = messages.filter((m: Message) => m.failed).length;
  
  return (
    <div className="px-3 lg:px-4 mb-4">
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
                  {pendingInUI > 0 
                    ? `${pendingInUI} сообщений ожидают отправки` 
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
                <p className="text-xs text-blue-300">
                  Отправка {pendingOfflineCount} сообщений
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : pendingInUI > 0 || failedInUI > 0 ? (
        <div className="bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/20 rounded-xl lg:rounded-2xl p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
                <RefreshCw className="w-4 h-4 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-white text-sm">
                  {failedInUI > 0 ? 'Есть ошибки отправки' : 'Готово к синхронизации'}
                </h4>
                <p className="text-xs text-emerald-300">
                  {pendingInUI > 0 && `${pendingInUI} сообщений будут отправлены`}
                  {pendingInUI > 0 && failedInUI > 0 && ', '}
                  {failedInUI > 0 && `${failedInUI} сообщений с ошибками`}
                </p>
              </div>
            </div>
            <button
              onClick={syncOfflineMessages}
              className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              {failedInUI > 0 ? 'Повторить' : 'Синхронизировать'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

  // ==================== RENDER ====================

  if (loading && !initialLoadComplete && messages.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950 flex items-center justify-center safe-area-inset-bottom">
        <div className="relative">
          <div className="w-16 h-16 lg:w-20 lg:h-20 border-4 border-transparent border-t-purple-500 border-r-blue-500 rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (!chatInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950 flex flex-col items-center justify-center px-4 safe-area-inset-bottom">
        <div className="text-6xl lg:text-8xl mb-6 bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
          👤
        </div>
        <h2 className="text-xl lg:text-2xl font-bold text-white mb-2">Чат не найден</h2>
        <p className="text-gray-400 mb-4 text-center text-sm lg:text-base">
          ID: {contactChatId || contactIdentityId}
        </p>
        <div className="flex gap-4">
          <button
            onClick={() => navigate("/contact-chats")}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium transition-all duration-300 shadow-lg shadow-purple-500/25 text-sm lg:text-base"
          >
            К списку чатов
          </button>
          <button
            onClick={() => loadChatData()}
            className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-300 font-medium transition-all duration-300 text-sm lg:text-base"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

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

  return (
// Update this line
<div className={`flex flex-col h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950 relative safe-area-inset-bottom transition-all duration-300 ${showSidebar ? 'lg:pr-80' : 'pr-0'}`}>
      {/* Call Modal */}
      {showCallModal && (
        <CallModal
          phoneNumber={chatInfo.otherParticipant.phone}
          contactName={chatInfo.otherParticipant.name}
          isOpen={showCallModal}
          onClose={() => setShowCallModal(false)}
        />
      )}

      {/* Header */}
      <div className={`bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/50 px-3 lg:px-4 py-3 flex items-center justify-between fixed top-0 left-0 right-0 z-50`} style={{ paddingTop: `calc(env(safe-area-inset-top) + 0.75rem)` }}>
        <div className="flex items-center gap-2 lg:gap-3">
          <button
            onClick={() => navigate("/contact-chats")}
            className="p-2 rounded-xl hover:bg-slate-800/50 transition-all duration-200"
          >
            <ArrowLeft className="w-5 h-5 text-gray-300" />
          </button>
          
          <div className="flex items-center gap-2 lg:gap-3">
            <div className="relative">
              <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg">
                {getInitial(chatInfo.otherParticipant.name)}
                {chatInfo.settings.isPinned && (
                  <Pin className="absolute -top-1 -right-1 w-3 h-3 text-yellow-400" />
                )}
              </div>
              
              {chatInfo.otherParticipant.isRegistered && chatInfo.otherParticipant.status === 'online' && (
                <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 lg:w-2.5 lg:h-2.5 bg-emerald-500 rounded-full border border-slate-900"></div>
              )}
            </div>
            
            <div>
              <div className="flex items-center gap-1">
                <h2 className="text-sm lg:text-base font-semibold text-white">
                  {chatInfo.otherParticipant.localName || chatInfo.otherParticipant.name || "Без имени"}
                </h2>
                {chatInfo.otherParticipant.isRegistered && (
                  <Shield className="w-3 h-3 text-blue-400" />
                )}
                {chatInfo.settings.isMuted && (
                  <BellOff className="w-3 h-3 text-gray-400" />
                )}
                {!chatInfo.otherParticipant.isRegistered && (
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
                
                {chatInfo.otherParticipant.isRegistered && chatInfo.otherParticipant.status === 'online' ? (
                  <span className="text-emerald-400 flex items-center gap-0.5">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                    онлайн
                  </span>
                ) : chatInfo.otherParticipant.isRegistered ? (
                  <span className="text-gray-400 text-xs">
                    был(а) {formatLastSeen(chatInfo.otherParticipant.lastSeen)}
                  </span>
                ) : null}
                
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
            onClick={() => setShowCallModal(true)}
            className="p-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white transition-all duration-200 hover:shadow-lg hover:shadow-purple-500/25"
          >
            <Video className="w-5 h-5" />
          </button>

          <button 
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2 rounded-xl hover:bg-slate-800/50 transition-all duration-200"
          >
            <MoreVertical className="w-5 h-5 text-gray-300" />
          </button>
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
      >
        <div className="max-w-3xl mx-auto space-y-4 pb-10">
          <NetworkStatusIndicator />
          
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
                💬
              </div>
              <p className="text-gray-400 text-sm lg:text-base">
                Нет сообщений
              </p>
              <p className="text-gray-500 text-xs lg:text-sm mt-1">
                Начните общение
              </p>
            </div>
          ) : (
            filteredGroupedMessages.map((group) => {
              const date = group[0] as string;
              const dateMessages = group[1] as Message[];
              
              return (
                <div key={date} className="space-y-4">
                  <div className="flex items-center justify-center">
                    <div className="px-3 py-1 backdrop-blur-sm rounded-full border border-slate-700/50 bg-slate-800/50 shadow">
                      <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {date}
                      </span>
                    </div>
                  </div>

       {dateMessages.map((msg: Message) => {
  // Проверяем, является ли это сообщение дубликатом предыдущего
  const messageIndex = dateMessages.findIndex(m => m._id === msg._id);
  const isDuplicate = messageIndex !== dateMessages.indexOf(msg);
  
  if (isDuplicate) {
    console.log('🚫 Пропускаем дубликат в рендере:', msg._id);
    return null; // Пропускаем рендер дубликата
  }
  
  const isBeingSwiped = swipeData.id === msg._id;
  const isReply = !!msg.replyTo;
  const repliedMessage = isReply && msg.replyTo ? getRepliedMessage(msg.replyTo) : null;
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
        {/* Имя отправителя - вне пузыря */}
    
        
        {/* Основной пузырь сообщения с встроенным ответом */}
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
            
            {/* Встроенный превью ответа */}
            {isReply && repliedMessage && (
              <div 
                className="relative px-4 pt-4 pb-3 border-b border-white/10 group/reply cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  const targetEl = document.querySelector(`[data-message-id="${repliedMessage._id || repliedMessage.localId}"]`);
                  if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetEl.classList.add('ring-2', 'ring-purple-500/50', 'animate-pulse');
                    setTimeout(() => targetEl.classList.remove('ring-2', 'ring-purple-500/50', 'animate-pulse'), 2000);
                  }
                }}
              >
                {/* Вертикальная акцентная линия ТОЛЬКО для превью ответа */}
                <div className="absolute left-4 top-4 bottom-3 w-0.5 bg-gradient-to-b from-purple-500/60 via-pink-500/60 to-transparent"></div>
                
                <div className="flex items-center gap-2 mb-1.5 ml-3">
                    <svg className="w-3 h-3 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                      
                  <div className={`w-2 h-2 rounded-full ${repliedMessage.isMine ? 'bg-gradient-to-r from-blue-400 to-cyan-400' : 'bg-gradient-to-r from-purple-400 to-pink-400'}`}></div>
                  <span className={`text-xs font-bold tracking-wider ${repliedMessage.isMine ? 'text-blue-300' : 'text-purple-300'}`}>
                    {repliedMessage.isMine ? 'Вы' : repliedMessage.senderName}
                  </span>
                  <div className="flex-1 h-px bg-gradient-to-r from-current/20 to-transparent ml-2"></div>
                </div>
                
                <div className={`ml-3 text-sm ${repliedMessage.isMine ? 'text-blue-200/90' : 'text-purple-200/90'} leading-snug truncate`}>
                  {repliedMessage.type === 'voice' ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 animate-pulse"></div>
                      <span className="italic">Голосовое сообщение</span>
                    </div>
                  ) : repliedMessage.type === 'image' ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-gradient-to-br from-purple-500/30 to-pink-500/30 border border-purple-400/50"></div>
                      <span className="italic">Фото</span>
                    </div>
                  ) : repliedMessage.type === 'file' ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-gradient-to-br from-blue-500/30 to-cyan-500/30 border border-blue-400/50"></div>
                      <span className="italic truncate">{repliedMessage.fileName}</span>
                    </div>
                  ) : (
                    <p className="truncate italic">{repliedMessage.text}</p>
                  )}
                </div>
                
                {/* Эффект при наведении на ответ */}
                <div className="absolute inset-x-0 top-0 bottom-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover/reply:opacity-100 transition-opacity duration-300"></div>
              </div>
            )}
            
            {/* Основное содержимое сообщения */}
            <div className={`p-4 ${isReply ? 'pt-3' : 'pt-4'}`}>
              {/* Контент */}
              {msg.type === 'voice' ? (
                <div className="relative flex items-center gap-3 p-2">
                  <button className="relative p-3 rounded-full bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20 transition-all duration-300 group/voice">
                    <div className="relative z-10">
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                      </svg>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-pink-500/20 opacity-0 group-hover/voice:opacity-100 transition-opacity duration-300 rounded-full"></div>
                  </button>
                  
                  <div className="flex-1">
                    <div className="relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="absolute h-full bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 animate-shimmer rounded-full" style={{ 
                        width: '70%',
                        backgroundSize: '200% 100%',
                      }}></div>
                    </div>
                    <div className="flex justify-between mt-2">
                      <span className="text-xs text-white/60 tracking-wide">ГОЛОСОВОЕ СООБЩЕНИЕ</span>
                      <span className="text-xs font-medium text-white/80">0:24</span>
                    </div>
                  </div>
                </div>
              ) : msg.type === 'image' ? (
                <div className="relative space-y-3">
                  <div className="relative rounded-xl overflow-hidden border border-white/10">
                    <img 
                      src={msg.fileUrl || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000"} 
                      alt={msg.fileName}
                      className="w-full h-48 object-cover transition-transform duration-700 hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent"></div>
                  </div>
                  {msg.text && (
                    <p className="text-white leading-relaxed tracking-wide text-[15px] font-light whitespace-pre-wrap break-words">
                      {msg.text}
                    </p>
                  )}
                </div>
              ) : msg.type === 'file' ? (
                <div className="relative p-3 rounded-xl bg-gradient-to-r from-white/5 to-transparent border border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 backdrop-blur-sm">
                      <File className="w-5 h-5 text-cyan-300" />
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 blur-sm -z-10"></div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate text-sm tracking-wide">{msg.fileName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-white/60">{msg.fileSize}</span>
                        <div className="w-1 h-1 rounded-full bg-white/30"></div>
                        <span className="text-xs text-white/60">PDF</span>
                      </div>
                    </div>
                    
                    <button className="p-2 rounded-full bg-gradient-to-br from-white/10 to-white/5 hover:from-white/20 hover:to-white/10 transition-all duration-300 border border-white/10">
                      <Download className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-white leading-relaxed tracking-wide text-[15px] font-light whitespace-pre-wrap break-words">
                  {msg.text}
                </p>
              )}
              
              {/* Премиум статус и время */}
              <div className={`flex items-center justify-end gap-2 mt-3   ${msg.isMine ? 'border-white/20' : 'border-white/10'}`}>
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
                onPointerDown={(e) => {
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

          {otherIsTyping && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 bg-slate-800/30 backdrop-blur-sm rounded-2xl rounded-bl-lg p-3 border border-slate-700/50">
                <div className="flex gap-0.5">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="text-xs text-gray-400 ml-1.5">печатает...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {showScrollToBottom && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-24 right-4 z-50 p-3 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 transition-all duration-300 hover:scale-110 lg:bottom-6"
        >
          <ChevronDown className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Input Area */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/50 z-40">
        <div className="max-w-3xl mx-auto px-2 lg:px-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Telegram Style Reply Composition Bar */}
{replyMessage && (
  <div className="px-4 py-3 bg-slate-800/95 backdrop-blur-xl border-t border-white/5 flex items-center gap-3 animate-in slide-in-from-bottom-full duration-200 shadow-lg">
    {/* Left accent line - thicker like Telegram */}
    <div className="w-[4px] h-12 bg-purple-500 rounded-full flex-shrink-0" />
    
    <div className="flex-1 min-w-0 flex flex-col justify-center">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-purple-400 uppercase tracking-wide">
          Ответ на сообщение
        </span>
        <div className="h-3 w-px bg-white/20"></div>
        <span className={`text-xs ${replyMessage.isMine ? 'text-blue-300' : 'text-purple-300'} font-medium`}>
          {replyMessage.isMine ? 'Вы' : replyMessage.senderName}
        </span>
      </div>
      <p className="text-sm text-gray-300 truncate mt-1 pl-1">
        {replyMessage.type === 'voice' ? '🎤 Голосовое сообщение' : 
         replyMessage.type === 'image' ? '🖼️ Фото' : 
         replyMessage.type === 'file' ? '📎 Файл' : 
         replyMessage.text}
      </p>
    </div>

    {/* Close Button - Telegram style */}
    <button 
      onClick={() => setReplyMessage(null)} 
      className="p-2 rounded-full hover:bg-white/10 transition-colors group flex-shrink-0"
    >
      <div className="relative w-5 h-5">
        <div className="absolute inset-0 bg-gray-500 group-hover:bg-white rounded-full opacity-20 group-hover:opacity-30"></div>
        <X size={18} className="relative text-gray-400 group-hover:text-white transition-colors" />
      </div>
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
            className="flex items-end gap-2 py-3 lg:py-2 px-2 "
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
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  if (isOnline) {
                    if (typingTimeoutRef.current) {
                      clearTimeout(typingTimeoutRef.current);
                    }
                    socket.emit("contact-chat:typing", { contactChatId: chatInfo.chatId, isTyping: true });
                    typingTimeoutRef.current = setTimeout(() => {
                      socket.emit("contact-chat:typing", { contactChatId: chatInfo.chatId, isTyping: false });
                    }, 1000);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={isOnline ? "Введите сообщение..." : "Введите сообщение (оффлайн)..."}
                
                className="w-full px-3 py-2.5 bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-transparent resize-none min-h-[44px] max-h-[120px] transition-all duration-200 pr-20 text-sm disabled:opacity-50"
                rows={1}
                onClick={() => setShowEmojiPicker(false)}
              />
              {/* Dynamic Character Count */}
    {newMessage.length > 0 && (
      <div className="absolute right-3 -top-2 px-1.5 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-[10px] text-gray-500 tabular-nums">
        {newMessage.length}
      </div>
    )}
              <div className="absolute right-1.5 bottom-1.5 flex items-center gap-1">
                {!isOnline && (
                  <div className="text-xs text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                    <WifiOff className="w-3 h-3" />
                    оффлайн
                  </div>
                )}
                
                {newMessage.length > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    newMessage.length > 1000 
                      ? 'bg-red-500/20 text-red-400' 
                      : 'bg-slate-700/50 text-gray-400'
                  }`}>
                    {newMessage.length}/2000
                  </span>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={!newMessage.trim()}
              className={`p-2.5 rounded-xl transition-all duration-300 hover:-translate-y-0.5 disabled:hover:translate-y-0 flex-shrink-0 group ${
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
    {getInitial(chatInfo.otherParticipant.localName || chatInfo.otherParticipant.name)}
    {chatInfo.settings.isPinned && (
      <Pin className="absolute -top-2 -right-2 w-6 h-6 text-yellow-400" />
    )}
  </div>
  
  <h4 className="text-lg lg:text-xl font-bold text-white mb-2">
    {chatInfo.otherParticipant.localName || chatInfo.otherParticipant.name}
  </h4>
  
  {chatInfo.otherParticipant.localName && chatInfo.otherParticipant.localName !== chatInfo.otherParticipant.name && (
    <p className="text-gray-500 text-sm mb-2">
      Исходное имя: {chatInfo.otherParticipant.name}
    </p>
  )}
  
  <p className="text-gray-400 mb-4">{formatPhoneForDisplay(chatInfo.otherParticipant.phone)}</p>
            
            <div className={`mb-4 px-3 py-1.5 rounded-lg ${chatInfo.otherParticipant.isRegistered ? 'bg-emerald-500/10 text-emerald-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
              <div className="flex items-center justify-center gap-2 text-sm">
                {chatInfo.otherParticipant.isRegistered ? (
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
              </div>
            </div>

            {/* Quick Actions */}
            <div>
              <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Действия
              </h4>
              <div className="space-y-2">
                <button
                  onClick={() => setShowCallModal(true)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                >
                  <Video className="w-5 h-5 text-emerald-400" />
                  <span className="flex-1 text-left">Видеозвонок</span>
                </button>



                <button
                  onClick={toggleMute}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                >
                  {chatInfo.settings.isMuted ? (
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

                <button
                  onClick={togglePin}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                >
                  <Pin className={`w-5 h-5 ${chatInfo.settings.isPinned ? 'text-yellow-400' : 'text-gray-400'}`} />
                  <span className="flex-1 text-left">
                    {chatInfo.settings.isPinned ? 'Открепить чат' : 'Закрепить чат'}
                  </span>
                </button>
<button
  onClick={() => {
    if (chatInfo) {
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
      saveChatInfoToCache(updatedChatInfo.chatId, updatedChatInfo);
    }
  }}
  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
>
  <RefreshCw className="w-5 h-5 text-blue-400" />
  <span>Обновить имя из кэша</span>
</button>
                <button
                  onClick={() => {
                    markAllAsRead();
                    setShowSidebar(false);
                  }}
                  disabled={unreadMessages.length === 0}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    unreadMessages.length > 0
                      ? 'hover:bg-slate-800/50 text-purple-400 hover:text-purple-300'
                      : 'text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <Eye className="w-5 h-5" />
                  <span className="flex-1 text-left">Прочитать всё</span>
                  {unreadMessages.length > 0 && (
                    <span className="bg-purple-500 text-white text-xs px-2 py-1 rounded-full">
                      {unreadMessages.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={toggleArchive}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                >
                  <Archive className="w-5 h-5 text-orange-400" />
                  <span className="flex-1 text-left">
                    {chatInfo.settings.isArchived ? 'Восстановить чат' : 'Архивировать чат'}
                  </span>
                </button>
{/* Sidebar - Add this button in the Quick Actions section */}

<button
  onClick={() => {
    if (chatInfo?.chatId && window.confirm('Очистить локальный кэш этого чата?\nСообщения будут загружены с сервера при следующем открытии.')) {
      // Clear local cache for this chat
      localStorage.removeItem(CHAT_CACHE_KEY(chatInfo.chatId));
      localStorage.removeItem(OFFLINE_MESSAGES_KEY(chatInfo.chatId));
      localStorage.removeItem(CHAT_INFO_CACHE_KEY(chatInfo.chatId));
      
      // Reload messages from server
      setMessages([]);
      loadChatData(1, false);
      
      // Show confirmation
      alert('Локальный кэш очищен. Сообщения загружаются с сервера...');
    }
  }}
  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
>
  <Trash2 className="w-5 h-5 text-gray-400" />
  <span>Очистить локальный кэш</span>
</button>
                <button
                  onClick={clearChat}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-500/10 transition-colors text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-5 h-5" />
                  <span>Очистить переписку</span>
                </button>
              </div>
            </div>
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