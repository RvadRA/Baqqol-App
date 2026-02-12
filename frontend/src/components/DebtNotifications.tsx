import React, { useState,  } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import { formatMoneyRUB } from '../utils/formatMoney';
import { 
  Bell, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  CheckCircle, 
  X,
  ChevronRight,
  DollarSign
} from 'lucide-react';

interface DebtNotificationProps {
  onClose?: () => void;
}

export const DebtNotifications: React.FC<DebtNotificationProps> = ({ onClose }) => {
  const { notifications } = useNotification();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overdue' | 'reminders' | 'all'>('overdue');

  // Фильтруем уведомления о долгах
  const debtNotifications = notifications.filter(n => 
    n.type === 'debt_overdue' || n.type === 'reminder'
  );

  const overdueNotifications = debtNotifications.filter(n => n.type === 'debt_overdue');
  const reminderNotifications = debtNotifications.filter(n => n.type === 'reminder');

  // Группируем по дате
  const groupByDate = (notifs: any[]) => {
    const groups: Record<string, any[]> = {};
    
    notifs.forEach(notification => {
      const date = new Date(notification.createdAt).toLocaleDateString('ru-RU');
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(notification);
    });
    
    return groups;
  };

  const overdueGroups = groupByDate(overdueNotifications);
  const reminderGroups = groupByDate(reminderNotifications);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Только что';
    if (diffMins < 60) return `${diffMins} мин назад`;
    if (diffHours < 24) return `${diffHours} час назад`;
    if (diffDays === 1) return 'Вчера';
    return date.toLocaleDateString('ru-RU', { 
      day: 'numeric', 
      month: 'short' 
    });
  };

  const handleNotificationClick = (notification: any) => {
    if (notification.data?.debtId) {
      navigate(`/chats/${notification.data.debtId}`);
    }
    if (onClose) onClose();
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'debt_overdue':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'reminder':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      default:
        return <Bell className="w-5 h-5 text-blue-500" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'debt_overdue':
        return 'bg-red-500/10 border-red-500/20';
      case 'reminder':
        return 'bg-yellow-500/10 border-yellow-500/20';
      default:
        return 'bg-blue-500/10 border-blue-500/20';
    }
  };

  const NotificationItem = ({ notification }: { notification: any }) => (
    <div 
      onClick={() => handleNotificationClick(notification)}
      className={`p-4 rounded-xl border ${getNotificationColor(notification.type)} 
        hover:shadow-lg transition-all duration-200 cursor-pointer 
        ${notification.read ? 'opacity-70' : ''} group`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1 flex-shrink-0">
          {getNotificationIcon(notification.type)}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h4 className="font-semibold text-white group-hover:text-blue-300 transition-colors">
              {notification.title}
            </h4>
            <span className="text-xs text-gray-500">
              {formatTimeAgo(notification.createdAt)}
            </span>
          </div>
          
          <p className="text-sm text-gray-300 mb-2">
            {notification.message}
          </p>
          
          {notification.data?.amount && (
            <div className="flex items-center gap-2 mt-2">
              <DollarSign className="w-4 h-4 text-green-400" />
              <span className="text-green-400 font-semibold">
                {formatMoneyRUB(notification.data.amount)}
              </span>
            </div>
          )}
          
          {notification.data?.daysLeft !== undefined && (
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span className="text-blue-400 text-sm">
                Осталось дней: {notification.data.daysLeft}
              </span>
            </div>
          )}
          
          {!notification.read && (
            <div className="mt-2">
              <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            </div>
          )}
        </div>
        
        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors flex-shrink-0" />
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-r from-purple-600/20 to-blue-600/20">
              <Bell className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Уведомления о долгах</h2>
              <p className="text-gray-400 text-sm">
                {debtNotifications.filter(n => !n.read).length} непрочитанных
              </p>
            </div>
          </div>
          
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-800/50 transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('overdue')}
          className={`px-4 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'overdue'
              ? 'bg-gradient-to-r from-red-600/20 to-orange-600/20 text-red-400 border border-red-500/30'
              : 'bg-slate-800/50 text-gray-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Просроченные
          {overdueNotifications.length > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
              {overdueNotifications.length}
            </span>
          )}
        </button>
        
        <button
          onClick={() => setActiveTab('reminders')}
          className={`px-4 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'reminders'
              ? 'bg-gradient-to-r from-yellow-600/20 to-amber-600/20 text-yellow-400 border border-yellow-500/30'
              : 'bg-slate-800/50 text-gray-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          Напоминания
          {reminderNotifications.length > 0 && (
            <span className="bg-yellow-500 text-white text-xs px-2 py-0.5 rounded-full">
              {reminderNotifications.length}
            </span>
          )}
        </button>
        
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'all'
              ? 'bg-gradient-to-r from-blue-600/20 to-cyan-600/20 text-blue-400 border border-blue-500/30'
              : 'bg-slate-800/50 text-gray-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Bell className="w-4 h-4" />
          Все уведомления
          {debtNotifications.length > 0 && (
            <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
              {debtNotifications.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2">
        {activeTab === 'overdue' && (
          <>
            {Object.keys(overdueGroups).length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-16 h-16 text-green-500/30 mx-auto mb-4" />
                <p className="text-xl text-gray-400">Нет просроченных долгов</p>
                <p className="text-gray-500 text-sm mt-2">Все долги оплачены вовремя!</p>
              </div>
            ) : (
              Object.entries(overdueGroups).map(([date, notifs]) => (
                <div key={date} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-full h-px bg-gradient-to-r from-transparent via-red-500/20 to-transparent"></div>
                    <span className="text-sm text-gray-500 whitespace-nowrap">{date}</span>
                    <div className="w-full h-px bg-gradient-to-r from-transparent via-red-500/20 to-transparent"></div>
                  </div>
                  
                  {notifs.map(notification => (
                    <NotificationItem key={notification._id} notification={notification} />
                  ))}
                </div>
              ))
            )}
          </>
        )}

        {activeTab === 'reminders' && (
          <>
            {Object.keys(reminderGroups).length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-16 h-16 text-yellow-500/30 mx-auto mb-4" />
                <p className="text-xl text-gray-400">Нет напоминаний</p>
                <p className="text-gray-500 text-sm mt-2">Активных напоминаний нет</p>
              </div>
            ) : (
              Object.entries(reminderGroups).map(([date, notifs]) => (
                <div key={date} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-full h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent"></div>
                    <span className="text-sm text-gray-500 whitespace-nowrap">{date}</span>
                    <div className="w-full h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent"></div>
                  </div>
                  
                  {notifs.map(notification => (
                    <NotificationItem key={notification._id} notification={notification} />
                  ))}
                </div>
              ))
            )}
          </>
        )}

        {activeTab === 'all' && (
          <>
            {debtNotifications.length === 0 ? (
              <div className="text-center py-12">
                <Bell className="w-16 h-16 text-blue-500/30 mx-auto mb-4" />
                <p className="text-xl text-gray-400">Нет уведомлений</p>
                <p className="text-gray-500 text-sm mt-2">Все уведомления будут здесь</p>
              </div>
            ) : (
              Object.entries(groupByDate(debtNotifications)).map(([date, notifs]) => (
                <div key={date} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-full h-px bg-gradient-to-r from-transparent via-purple-500/20 to-transparent"></div>
                    <span className="text-sm text-gray-500 whitespace-nowrap">{date}</span>
                    <div className="w-full h-px bg-gradient-to-r from-transparent via-purple-500/20 to-transparent"></div>
                  </div>
                  
                  {notifs.map(notification => (
                    <NotificationItem key={notification._id} notification={notification} />
                  ))}
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* Stats Footer */}
      {debtNotifications.length > 0 && (
        <div className="mt-8 pt-6 border-t border-slate-800/50">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="text-center p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <div className="text-2xl font-bold text-red-400">{overdueNotifications.length}</div>
              <div className="text-gray-400">Просроченные</div>
            </div>
            
            <div className="text-center p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
              <div className="text-2xl font-bold text-yellow-400">{reminderNotifications.length}</div>
              <div className="text-gray-400">Напоминания</div>
            </div>
            
            <div className="text-center p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <div className="text-2xl font-bold text-blue-400">
                {debtNotifications.filter(n => !n.read).length}
              </div>
              <div className="text-gray-400">Непрочитанные</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};