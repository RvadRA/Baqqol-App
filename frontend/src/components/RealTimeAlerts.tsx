import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import { 
  X, 
  AlertTriangle, 
  Clock, 
  DollarSign,
  ExternalLink
} from 'lucide-react';
import { formatMoneyRUB } from '../utils/formatMoney';

export const RealTimeAlerts: React.FC = () => {
  const { notifications } = useNotification();
  const navigate = useNavigate();
  const [visibleAlerts, setVisibleAlerts] = useState<any[]>([]);

  useEffect(() => {
    // Получаем последние непрочитанные уведомления о долгах
    const newDebtAlerts = notifications
      .filter(n => (n.type === 'debt_overdue' || n.type === 'reminder') && !n.read)
      .slice(0, 3); // Показываем максимум 3 уведомления

    setVisibleAlerts(prev => {
      // Добавляем только новые уведомления
      const newAlerts = newDebtAlerts.filter(
        alert => !prev.some(p => p._id === alert._id)
      );
      return [...newAlerts, ...prev].slice(0, 3);
    });
  }, [notifications]);

  const removeAlert = (id: string) => {
    setVisibleAlerts(prev => prev.filter(alert => alert._id !== id));
  };

  const handleAlertClick = (alert: any) => {
    if (alert.data?.debtId) {
      navigate(`/chats/${alert.data.debtId}`);
    }
    removeAlert(alert._id);
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'debt_overdue':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'reminder':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      default:
        return null;
    }
  };

  const getAlertTitle = (alert: any) => {
    if (alert.type === 'debt_overdue') {
      return `⚠️ Долг просрочен!`;
    }
    if (alert.type === 'reminder' && alert.data?.daysLeft !== undefined) {
      const days = alert.data.daysLeft;
      if (days === 0) return `⏰ Оплата сегодня!`;
      if (days === 1) return `⏰ Напоминание: 1 день`;
      return `⏰ Напоминание: ${days} дня`;
    }
    return alert.title;
  };

  if (visibleAlerts.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 z-[100] space-y-3 w-96">
      {visibleAlerts.map(alert => (
        <div
          key={alert._id}
          className={`p-4 rounded-xl shadow-2xl backdrop-blur-xl border animate-slideInRight ${
            alert.type === 'debt_overdue'
              ? 'bg-gradient-to-r from-red-900/30 to-red-800/20 border-red-700/30'
              : 'bg-gradient-to-r from-yellow-900/30 to-amber-800/20 border-yellow-700/30'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-1">
              {getAlertIcon(alert.type)}
            </div>
            
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-white">
                  {getAlertTitle(alert)}
                </h4>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAlertClick(alert)}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                    title="Открыть чат"
                  >
                    <ExternalLink className="w-4 h-4 text-gray-300" />
                  </button>
                  
                  <button
                    onClick={() => removeAlert(alert._id)}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                    title="Закрыть"
                  >
                    <X className="w-4 h-4 text-gray-300" />
                  </button>
                </div>
              </div>
              
              <p className="text-sm text-gray-200 mb-2">
                {alert.message}
              </p>
              
              {alert.data?.amount && (
                <div className="flex items-center gap-2 mt-2">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  <span className="text-green-400 font-bold">
                    {formatMoneyRUB(alert.data.amount)}
                  </span>
                </div>
              )}
              
              <div className="flex items-center gap-4 mt-3 text-xs">
                <span className="text-gray-400">
                  {new Date(alert.createdAt).toLocaleTimeString('ru-RU', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
                
                {alert.data?.debtId && (
                  <button
                    onClick={() => handleAlertClick(alert)}
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Перейти к чату
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};