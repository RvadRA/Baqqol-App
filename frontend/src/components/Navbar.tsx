import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DebtNotifications } from '../components/DebtNotifications';
import {
  Users,
  MessageSquare,
  User,
  PlusCircle,
  LogOut,
  X,
  Bell,
  AlertTriangle,
  CreditCard,
  BarChart3,
  Briefcase,
   LayoutDashboard,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNotification } from "../context/NotificationContext";

// Create a fallback hook if notification context is not available
const useNotificationFallback = () => {
  return {
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    fetchNotifications: async () => {},
    markAsRead: async () => {},
    markAllAsRead: async () => {},
    deleteNotification: async () => {},
    clearAllNotifications: async () => {},
    subscribeToNotifications: () => {},
    unsubscribeFromNotifications: () => {},
  };
};

interface NotificationData {
  debtId?: string;
  chatId?: string;
  messageId?: string;
  amount?: number;
  fromUser?: string;
}

interface Notification {
  _id: string;
  type: string;
  title: string;
  message: string;
  data?: NotificationData;
  read: boolean;
  createdAt: string;
}

export default function Navbar() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showDebtNotifications, setShowDebtNotifications] = useState(false);

  // Use notification context with fallback
  let notificationContext;
  try {
    notificationContext = useNotification();
  } catch (error) {
    console.warn("Notification context not available, using fallback");
    notificationContext = useNotificationFallback();
  }
  
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    clearAllNotifications,
    fetchNotifications 
  } = notificationContext;

  // Теперь объявляем debtNotificationCount ПОСЛЕ получения notifications
  const debtNotificationCount = notifications.filter(n => 
    (n.type === 'debt_overdue' || n.type === 'reminder') && !n.read
  ).length;

  const notificationsRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileNotificationRef = useRef<HTMLDivElement>(null);
  const mobileNotificationButtonRef = useRef<HTMLButtonElement>(null);

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Handle click outside to close notifications and mobile menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      
      // Check if click is inside notification elements
      const isClickInsideNotification = 
        notificationsRef.current?.contains(target) ||
        mobileNotificationRef.current?.contains(target) ||
        mobileNotificationButtonRef.current?.contains(target);
      
      // Check if click is inside mobile menu
      const isClickInsideMobileMenu = 
        mobileMenuRef.current?.contains(target);
      
      // Close notifications if clicking outside
      if (showNotifications && !isClickInsideNotification) {
        setShowNotifications(false);
      }
      
      // Close mobile menu if clicking outside
      if (isMobileMenuOpen && !isClickInsideMobileMenu) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [showNotifications, isMobileMenuOpen]);

  // Prevent body scroll when mobile menu or notifications are open
  useEffect(() => {
  if (isMobileMenuOpen || showNotifications) {
    document.body.style.overflow = 'hidden';
    // Don't set position fixed as it causes layout shift
    // document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.touchAction = 'none';
  } else {
    document.body.style.overflow = 'unset';
    // document.body.style.position = 'static';
    document.body.style.touchAction = 'auto';
  }
  return () => {
    document.body.style.overflow = 'unset';
    // document.body.style.position = 'static';
    document.body.style.touchAction = 'auto';
  };
}, [isMobileMenuOpen, showNotifications]);

  // Close notifications when opening mobile menu and vice versa
  useEffect(() => {
    if (isMobileMenuOpen) {
      setShowNotifications(false);
    }
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (showNotifications) {
      setIsMobileMenuOpen(false);
    }
  }, [showNotifications]);

  // Fetch notifications on mount
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

const navLinks = [
  { to: "/dashboard", label: "Главная", icon: BarChart3 }, // Четкая связь со статистикой
  { to: "/customers", label: "Мои клиенты", icon: Briefcase  }, // 👛 Прямая связь с финансами
  { to: "/all-chats", label: "Сообщения", icon: MessageSquare }, // Оставляем как есть
 { to: "/contact-chats", label: "Все контакты", icon: Users }, // Все остальные контакты
  { to: "/profile", label: "Профиль", icon: User  }, // Более детальная иконка
];

 

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleMarkAllAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      console.log("Marking all notifications as read...");
      await markAllAsRead();
      setShowNotifications(false);
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const handleClearAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      console.log("Clearing all notifications...");
      await clearAllNotifications();
      setShowNotifications(false);
    } catch (error) {
      console.error("Error clearing all notifications:", error);
    }
  };

  const handleNotificationClick = async (notificationId: string, read: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (!read) {
        await markAsRead(notificationId);
      }
      setShowNotifications(false);
    } catch (error) {
      console.error("Error handling notification click:", error);
    }
  };
 const shouldHideNavbar = () => {
    // Hide navbar on customer detail pages in mobile only
    const isMobile = window.innerWidth < 1024; // lg breakpoint
    return isMobile && location.pathname.includes('/customers/');
  };
  // Format notification time
  const formatNotificationTime = (createdAt: string) => {
    const date = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "только что";
    if (diffMins < 60) return `${diffMins} мин назад`;
    if (diffHours < 24) return `${diffHours} час назад`;
    if (diffDays === 1) return "вчера";
    if (diffDays < 7) return `${diffDays} дня назад`;
    return date.toLocaleDateString("ru-RU");
  };

  // Get notification icon based on type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "new_message":
        return <MessageSquare className="w-4 h-4 text-blue-400" />;
      case "payment_requested":
      case "payment_confirmed":
      case "payment_rejected":
        return <CreditCard className="w-4 h-4 text-green-400" />;
      case "debt_created":
        return <Users className="w-4 h-4 text-purple-400" />;
      default:
        return <Bell className="w-4 h-4 text-gray-400" />;
    }
  };

  // Mobile Notifications Bottom Sheet Component
const MobileNotificationsSheet = () => (
  <div className="lg:hidden fixed inset-0 z-[100]">
    {/* Overlay */}
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
      onClick={() => setShowNotifications(false)}
    />
    
    {/* Bottom Sheet - Updated with bottom animation */}
    <div 
      ref={mobileNotificationRef}
      className="fixed top-0 left-0 right-0 bottom-0 z-[110] bg-slate-900/95 backdrop-blur-xl flex flex-col animate-slide-up"
      onClick={(e) => e.stopPropagation()}
    >
        {/* Header */}
        <div className="px-4 py-4 border-b border-slate-700/50 flex items-center justify-between sticky top-0 bg-slate-900/95">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-purple-400" />
            <div>
              <h3 className="text-lg font-semibold text-white">Уведомления</h3>
              {unreadCount > 0 && (
                <p className="text-sm text-gray-400">{unreadCount} непрочитанных</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button 
                onClick={handleMarkAllAsRead}
                className="px-3 py-1.5 text-sm bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg transition-colors"
              >
                Прочитать все
              </button>
            )}
            <button 
              onClick={() => setShowNotifications(false)}
              className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-slate-800/50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto pb-16">
          {notifications.length > 0 ? (
            <div className="divide-y divide-slate-800/50">
              {notifications.map((notification: Notification) => (
                <div 
                  key={notification._id} 
                  onClick={(e) => handleNotificationClick(notification._id, notification.read, e)}
                  className={`px-4 py-4 hover:bg-slate-800/50 active:bg-slate-800/70 transition-colors cursor-pointer ${
                    notification.read ? '' : 'bg-purple-500/5'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex-shrink-0">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-sm font-medium text-white">{notification.title}</p>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0"></div>
                        )}
                      </div>
                      <p className="text-sm text-gray-300">{notification.message}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-500">
                          {formatNotificationTime(notification.createdAt)}
                        </span>
                        {notification.data?.debtId && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/chats/${notification.data?.debtId}`);
                              setShowNotifications(false);
                            }}
                            className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 hover:bg-blue-500/10 rounded-lg transition-colors"
                          >
                            Открыть
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center px-4 py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4">
                <Bell className="w-8 h-8 text-gray-500" />
              </div>
              <p className="text-lg font-medium text-gray-300 mb-2">Нет уведомлений</p>
              <p className="text-sm text-gray-500 max-w-xs">
                Здесь будут появляться уведомления о новых сообщениях, платежах и других событиях
              </p>
            </div>
          )}
        </div>
        
        {/* Clear All Button */}
        {notifications.length > 0 && (
          <div className="p-4 border-t border-slate-700/50 bg-slate-900/95 backdrop-blur-xl">
            <button 
              onClick={handleClearAll}
              className="w-full py-3 text-center text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl border border-red-500/20 transition-colors"
            >
              Очистить все уведомления
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Desktop Notifications Dropdown Component
  const DesktopNotificationsDropdown = () => (
    <div 
      ref={notificationsRef}
      className="absolute right-0 top-full mt-2 w-80 bg-slate-900/95 backdrop-blur-xl rounded-xl border border-slate-700/50 shadow-2xl py-2 z-50"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Уведомления</h3>
        <div className="flex gap-2">
          <button 
            onClick={handleMarkAllAsRead}
            disabled={notifications.length === 0 || unreadCount === 0}
            className={`text-xs transition-colors ${
              notifications.length === 0 || unreadCount === 0
                ? "text-gray-600 cursor-not-allowed"
                : "text-purple-400 hover:text-purple-300"
            }`}
          >
            Прочитать все
          </button>
          <button 
            onClick={handleClearAll}
            disabled={notifications.length === 0}
            className={`text-xs transition-colors ${
              notifications.length === 0
                ? "text-gray-600 cursor-not-allowed"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Очистить
          </button>
        </div>
      </div>
      
      {/* Notifications List */}
      <div className="max-h-80 overflow-y-auto">
        {notifications.length > 0 ? (
          notifications.map((notification: Notification) => (
            <div 
              key={notification._id} 
              onClick={(e) => handleNotificationClick(notification._id, notification.read, e)}
              className={`px-4 py-3 hover:bg-slate-800/50 transition-colors cursor-pointer border-l-2 ${
                notification.read ? 'border-transparent' : 'border-purple-500 bg-purple-500/5'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">{notification.title}</p>
                  <p className="text-sm text-gray-300 mt-1">{notification.message}</p>
                  {notification.data?.debtId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/chats/${notification.data?.debtId}`);
                        setShowNotifications(false);
                      }}
                      className="inline-block mt-1 px-2 py-0.5 text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-full transition-colors"
                    >
                      Перейти к чату
                    </button>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    {formatNotificationTime(notification.createdAt)}
                  </p>
                </div>
                {!notification.read && (
                  <div className="w-2 h-2 bg-purple-500 rounded-full mt-2"></div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="px-4 py-8 text-center">
            <Bell className="w-8 h-8 text-gray-500 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Нет новых уведомлений</p>
            <p className="text-xs text-gray-500 mt-1">Здесь будут появляться уведомления</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Navbar */}
    
   <header className={`hidden lg:block fixed top-0 left-0 right-0 z-50 h-16 transition-all duration-300 ${
  scrolled 
    ? "bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/50 shadow-2xl shadow-black/30" 
    : "bg-gradient-to-b from-slate-900 via-slate-900/95 to-transparent"
}`}>
  <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          
          {/* Logo */}
          <div className="flex items-center gap-8">
            <div
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
                  <span className="text-white font-bold text-lg">B</span>
                </div>
                <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl blur opacity-20 group-hover:opacity-30 transition-opacity"></div>
              </div>
              <div>
                <div className="text-xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  BaqqolApp
                </div>
                <div className="text-xs text-gray-500 -mt-1">Debt Collection</div>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="flex items-center gap-1">
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      isActive 
                        ? "text-white bg-gradient-to-r from-purple-600/20 to-blue-600/20" 
                        : "text-gray-400 hover:text-white hover:bg-slate-800/50"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <link.icon className={`w-4 h-4 ${isActive ? 'text-purple-400' : 'text-gray-400'}`} />
                      <span>{link.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-3">
            

            {/* Notifications */}
            <div className="relative">
              <button 
                ref={mobileNotificationButtonRef}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNotifications(!showNotifications);
                }}
                className="relative p-2 rounded-xl hover:bg-slate-800/50 transition-colors"
              >
                <Bell className="w-5 h-5 text-gray-400" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {/* Desktop Notifications Dropdown */}
              {showNotifications && <DesktopNotificationsDropdown />}
            </div>

            {/* Debt Notifications Button */}
            {debtNotificationCount > 0 && (
              <button
                onClick={() => {
                  setShowDebtNotifications(true);
                  setShowNotifications(false);
                }}
                className="relative p-2 rounded-xl hover:bg-slate-800/50 transition-colors group"
                title="Уведомления о долгах"
              >
                <AlertTriangle className="w-5 h-5 text-red-400 group-hover:text-red-300" />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center animate-pulse shadow-lg">
                  {debtNotificationCount}
                </span>
              </button>
            )}

            {/* New Debt Button */}
            <button
              onClick={() => navigate("/customers/new-debt")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700
                text-white shadow-lg shadow-purple-500/25 transition-all duration-300 transform hover:-translate-y-0.5"
            >
              <PlusCircle className="w-4 h-4" />
              Новый долг
            </button>

            {/* User Profile Dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-800/50 transition-colors">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                  {user?.name?.charAt(0) || "U"}
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium text-white">{user?.name || "User"}</div>
                  <div className="text-xs text-gray-500">Администратор</div>
                </div>
              </button>

              {/* Dropdown Menu */}
              <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900/95 backdrop-blur-xl rounded-xl border border-slate-700/50 shadow-2xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="px-4 py-3 border-b border-slate-700/50">
                  <div className="text-sm font-medium text-white">{user?.name}</div>
                  <div className="text-xs text-gray-500 truncate">{user?.phone}</div>
                </div>
                <button
  onClick={() => navigate("/dashboard")}
  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
>
  <LayoutDashboard className="w-4 h-4" />
  <span>Дашборд</span>
</button>
                <button
                  onClick={() => navigate("/profile")}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                >
                  <User className="w-4 h-4" />
                  <span>Профиль</span>
                </button>

                <button
                  onClick={() => navigate("/customers")}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                >
                  <Users className="w-4 h-4" />
                  <span>Клиенты</span>
                </button>

                <button
                  onClick={() => navigate("/all-chats")}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/50 transition-colors text-gray-300 hover:text-white"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Чаты</span>
                </button>

                <div className="border-t border-slate-700/50 my-2"></div>
                
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-500/10 transition-colors text-red-400 hover:text-red-300"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Выйти</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Top Bar */}
      {!shouldHideNavbar()  && (
      <div className="lg:hidden  fixed top-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/50">
        <div className="px-4 py-3 flex items-center justify-between">
          {/* Mobile Logo */}
          <div
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
              <span className="text-white font-bold">B</span>
            </div>
            <div className="text-lg font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              BaqqolApp
            </div>
          </div>

          {/* Mobile Notifications Button */}
          <div className="flex items-center gap-2">
            {debtNotificationCount > 0 && (
              <button
                onClick={() => {
                  setShowDebtNotifications(true);
                  setShowNotifications(false);
                }}
                className="relative p-2 rounded-lg hover:bg-slate-800/50"
                title="Уведомления о долгах"
              >
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center animate-pulse">
                  {debtNotificationCount}
                </span>
              </button>
            )}
            
            <button 
              ref={mobileNotificationButtonRef}
              onClick={(e) => {
                e.stopPropagation();
                setShowNotifications(!showNotifications);
                setIsMobileMenuOpen(false);
              }}
              className="relative p-2 rounded-lg hover:bg-slate-800/50"
            >
              <Bell className="w-5 h-5 text-gray-400" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center animate-pulse">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
)}
      {/* Mobile Bottom Navigation */}
{!location.pathname.includes('/chats/') &&   !shouldHideNavbar() &&  !location.pathname.includes('/contact-chats/') && (
  <div className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/50 shadow-2xl shadow-black/50 transition-transform duration-300 ${
    showNotifications || isMobileMenuOpen ? 'translate-y-full' : 'translate-y-0'
  }`}>
          <div className="flex items-center justify-around px-2 py-2">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.to || 
                             (link.to === "/customers" && location.pathname.startsWith("/customers")) ||
                  (link.to === "/dashboard" && location.pathname === "/");
              
              return (
                <button
                  key={link.to}
                  onClick={() => {
                    navigate(link.to);
                    setIsMobileMenuOpen(false);
                    setShowNotifications(false);
                  }}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-200 relative ${
                    isActive 
                      ? "text-purple-400" 
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <div className={`p-2 rounded-lg ${isActive ? 'bg-purple-600/20' : ''}`}>
                    <link.icon className={`w-5 h-5 ${isActive ? 'text-purple-400' : 'text-gray-400'}`} />
                  </div>
                  <span className={`text-xs mt-1 ${isActive ? 'text-purple-400 font-medium' : 'text-gray-400'}`}>
                    {link.label}
                  </span>
                  {isActive && (
                    <div className="absolute -top-1 w-8 h-1 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"></div>
                  )}
                </button>
              );
            })}

            {/* Mobile New Debt Button */}
            <div className="relative">
              <button
                onClick={() => {
                  navigate("/customers/new-debt");
                  setShowNotifications(false);
                }}
                className="relative -mt-8 p-4 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 
                  text-white shadow-lg shadow-purple-500/25 transition-all duration-300 
                  transform hover:-translate-y-1 active:scale-95"
              >
                <PlusCircle className="w-6 h-6" />
                <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl blur opacity-30"></div>
              </button>
              <span className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 text-xs text-gray-400 whitespace-nowrap">
                Новый долг
              </span>
            </div>

            
          </div>
        </div>
      )}

      {/* Mobile Notifications Sheet */}
      {showNotifications && <MobileNotificationsSheet />}

     

      {/* Debt Notifications Popup */}
      {showDebtNotifications && (
        <div className="fixed inset-0 z-[200]">
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowDebtNotifications(false)}
          />
          
          {/* Popup */}
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
            <div 
              className="w-full max-w-2xl bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <DebtNotifications onClose={() => setShowDebtNotifications(false)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Spacer for mobile navigation */}
      {!shouldHideNavbar()  && (
      <div className="lg:hidden h-14"></div>
      )}
    </>
  );
}