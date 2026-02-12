// CustomerDebts.tsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { getInitial } from "../utils/ui";
import { formatMoneyRUB } from "../utils/formatMoney";
import { useAuth } from "../context/AuthContext";
import { socket } from "../socket";

// ==================== CONSTANTS & TYPES ====================

const CUSTOMER_DEBTS_CACHE_KEY = "customer_debts_cache_";
const CUSTOMER_DEBTS_LAST_UPDATED_KEY = "customer_debts_last_updated_";
const CUSTOMER_INFO_CACHE_KEY = "customer_info_cache_";
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 минут
const PENDING_DEBTS_KEY = "pendingDebts";

interface Debt {
  _id: string;
  amountRemaining: number;
  amountTotal: number;
  paymentStatus: "active" | "paid" | "pending_verification";
  overdueStatus: "on_time" | "overdue";
  senderIdentityId: {
    _id: string;
    registeredName?: string;
    phone?: string;
  };
  receiverIdentityId: {
    _id: string;
    registeredName?: string;
    phone?: string;
  };
  pendingPayment?: {
    amount: number;
    requestedBy: {
      _id: string;
      registeredName?: string;
    };
    paymentType: "receiver_to_sender" | "sender_to_receiver";
    isVerified?: boolean;
    requestedAt: string;
  };
  description?: string;
  dueDate?: string;
  createdAt: string;
}

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
  customerId?: string;
  paymentType?: "receiver_to_sender" | "sender_to_receiver";
  debtId?: string;
}

interface CustomerHeader {
  _id: string;
  localName: string;
  phone?: string;
  targetIdentityId?: {
    _id: string;
    registeredName?: string;
    phone?: string;
  };
}

interface PendingPayment {
  debtId: string;
  amount: number;
}

// ==================== HELPER FUNCTIONS ====================

const normalizeDebtStatus = (status: string): "active" | "paid" | "pending_verification" => {
  if (status === "active" || status === "paid" || status === "pending_verification") {
    return status;
  }
  return "active";
};

const normalizeDebt = (debt: any): Debt => ({
  ...debt,
  paymentStatus: normalizeDebtStatus(debt.paymentStatus),
  overdueStatus: debt.overdueStatus === "overdue" ? "overdue" : "on_time",
  senderIdentityId: debt.senderIdentityId || { _id: "" },
  receiverIdentityId: debt.receiverIdentityId || { _id: "" },
  pendingPayment: debt.pendingPayment ? {
    amount: debt.pendingPayment.amount,
    requestedBy: debt.pendingPayment.requestedBy || { _id: "" },
    paymentType: debt.pendingPayment.paymentType === "sender_to_receiver" 
      ? "sender_to_receiver" 
      : "receiver_to_sender",
    isVerified: debt.pendingPayment.isVerified,
    requestedAt: debt.pendingPayment.requestedAt
  } : undefined,
  description: debt.description || "",
  dueDate: debt.dueDate || undefined,
  createdAt: debt.createdAt
});

// ==================== MAIN COMPONENT ====================

export default function CustomerDebts() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // ==================== STATE MANAGEMENT ====================
  
  const [debts, setDebts] = useState<Debt[]>([]);
  const [customer, setCustomer] = useState<CustomerHeader | null>(null);
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({});
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setVerifyingPayment] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [cacheStatus, setCacheStatus] = useState<'fresh' | 'stale' | 'offline'>('fresh');
  const [, setLastSyncTime] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  const [offlineDebts, setOfflineDebts] = useState<OfflineDebt[]>([]);
  const [processingQuickPay, setProcessingQuickPay] = useState(false);
  
  // Quick payment states
  const [quickPayOweAmount, setQuickPayOweAmount] = useState<string>("");
  const [quickPayOwedAmount, setQuickPayOwedAmount] = useState<string>("");
  
  const syncInProgressRef = useRef(false);

  // ==================== OFFLINE DEBT MANAGEMENT ====================

  const loadOfflineDebts = useCallback(() => {
    try {
      const stored = localStorage.getItem(PENDING_DEBTS_KEY);
      if (stored) {
        const debts = JSON.parse(stored);
        setOfflineDebts(debts);
        return debts;
      }
    } catch (error) {
      console.error('❌ Ошибка загрузки оффлайн долгов:', error);
    }
    return [];
  }, []);

  const saveOfflineDebts = useCallback((debts: OfflineDebt[]) => {
    try {
      localStorage.setItem(PENDING_DEBTS_KEY, JSON.stringify(debts));
      setOfflineDebts(debts);
      console.log('💾 Оффлайн долги сохранены:', debts.length);
    } catch (error) {
      console.error('❌ Ошибка сохранения оффлайн долгов:', error);
    }
  }, []);

  const createOfflineDebt = useCallback((data: {
    receiverPhone: string;
    receiverName: string;
    amount: number;
    description?: string;
    dueDate?: string;
    paymentType: "receiver_to_sender" | "sender_to_receiver";
    debtId: string;
  }): OfflineDebt => {
    return {
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      receiverPhone: data.receiverPhone,
      receiverName: data.receiverName,
      amount: data.amount,
      description: data.description || '',
      dueDate: data.dueDate || null,
      reminders: [true, true, true],
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      status: 'pending',
      syncAttempts: 0,
      lastSyncAttempt: null,
      isOffline: true,
      customerId: customerId,
      paymentType: data.paymentType,
      debtId: data.debtId
    };
  }, [customerId]);

  // ==================== CACHE MANAGEMENT ====================

  const loadCachedData = useCallback(() => {
    if (!customerId) return false;
    
    try {
      const cacheKey = `${CUSTOMER_DEBTS_CACHE_KEY}${customerId}`;
      const lastUpdatedKey = `${CUSTOMER_DEBTS_LAST_UPDATED_KEY}${customerId}`;
      const customerInfoKey = `${CUSTOMER_INFO_CACHE_KEY}${customerId}`;
      
      const cachedDebts = localStorage.getItem(cacheKey);
      const lastUpdated = localStorage.getItem(lastUpdatedKey);
      const cachedCustomer = localStorage.getItem(customerInfoKey);
      
      let hasData = false;
      
      if (cachedDebts) {
        const parsedDebts = JSON.parse(cachedDebts);
        const normalizedDebts = parsedDebts.map(normalizeDebt);
        setDebts(normalizedDebts);
        hasData = true;
      }
      
      if (cachedCustomer) {
        const parsedCustomer = JSON.parse(cachedCustomer);
        setCustomer(parsedCustomer);
        hasData = true;
      }
      
      if (lastUpdated) {
        setLastSyncTime(new Date(lastUpdated).toLocaleString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
          day: 'numeric',
          month: 'numeric'
        }));
      }
      
      return hasData;
    } catch (error) {
      console.error('❌ Ошибка загрузки кэша:', error);
      return false;
    }
  }, [customerId]);

  const saveToCache = useCallback((data: {
    debts: Debt[],
    customer: CustomerHeader | null
  }) => {
    if (!customerId) return;
    
    try {
      const cacheKey = `${CUSTOMER_DEBTS_CACHE_KEY}${customerId}`;
      const lastUpdatedKey = `${CUSTOMER_DEBTS_LAST_UPDATED_KEY}${customerId}`;
      const customerInfoKey = `${CUSTOMER_INFO_CACHE_KEY}${customerId}`;
      
      localStorage.setItem(cacheKey, JSON.stringify(data.debts));
      localStorage.setItem(customerInfoKey, JSON.stringify(data.customer));
      localStorage.setItem(lastUpdatedKey, new Date().toISOString());
    } catch (error) {
      console.error('❌ Ошибка сохранения в кэш:', error);
    }
  }, [customerId]);

  const isCacheValid = useCallback(() => {
    if (!customerId) return false;
    
    const lastUpdatedKey = `${CUSTOMER_DEBTS_LAST_UPDATED_KEY}${customerId}`;
    const lastUpdated = localStorage.getItem(lastUpdatedKey);
    
    if (!lastUpdated) return false;
    
    const lastUpdateTime = new Date(lastUpdated).getTime();
    const currentTime = Date.now();
    
    return (currentTime - lastUpdateTime) < CACHE_EXPIRY_MS;
  }, [customerId]);

  // ==================== SOCKET SUBSCRIPTIONS ====================

  useEffect(() => {
    if (!customerId || !user?.globalIdentityId) return;
    
    debts.forEach(debt => {
      if (debt._id) {
        socket.emit("debt:subscribe", debt._id);
        socket.emit("join-debt", debt._id);
      }
    });
    
    return () => {
      debts.forEach(debt => {
        if (debt._id) {
          socket.emit("leave-debt", debt._id);
        }
      });
    };
  }, [debts, customerId, user?.globalIdentityId]);

  // ==================== API CALLS ====================

  const fetchFromServer = useCallback(async () => {
    if (!customerId || !user?.globalIdentityId) {
      return;
    }
    
    if (!isOnline) {
      setCacheStatus('offline');
      return;
    }

    if (syncInProgressRef.current) {
      return;
    }

    try {
      syncInProgressRef.current = true;
      setSyncing(true);
      setError(null);
      
      const customerRes = await api.get(`/customers/${customerId}`);
      setCustomer(customerRes.data);
      
      const debtsRes = await api.get(`/debts/my`);
      const customerIdentityId = customerRes.data.targetIdentityId?._id;
      const currentUserIdentityId = user.globalIdentityId;
      
      const filteredDebts = debtsRes.data
        .filter((debt: any) => {
          const isSenderToCustomer = 
            debt.senderIdentityId?._id === currentUserIdentityId &&
            debt.receiverIdentityId?._id === customerIdentityId;
          
          const isReceiverFromCustomer = 
            debt.receiverIdentityId?._id === currentUserIdentityId &&
            debt.senderIdentityId?._id === customerIdentityId;
          
          return isSenderToCustomer || isReceiverFromCustomer;
        })
        .map(normalizeDebt);
      
      setDebts(filteredDebts);
      setLastSyncTime(new Date().toLocaleString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        day: 'numeric',
        month: 'numeric'
      }));
      setCacheStatus('fresh');
      
      saveToCache({
        debts: filteredDebts,
        customer: customerRes.data
      });
      
    } catch (error: any) {
      console.error('❌ Ошибка загрузки долгов:', error);
      setError(error.response?.data?.message || error.message || "Неизвестная ошибка");
      
      if (!loadCachedData()) {
        setCacheStatus('offline');
      } else {
        setCacheStatus('stale');
      }
    } finally {
      setSyncing(false);
      syncInProgressRef.current = false;
    }
  }, [customerId, user, isOnline, loadCachedData, saveToCache]);

  // ==================== MAIN DATA LOADER ====================

  const loadCustomerData = useCallback(async (forceRefresh = false) => {
    if (!customerId) {
      navigate("/customers");
      return;
    }
    
    const hasCache = loadCachedData();
    loadOfflineDebts();
    
    if (!isOnline && !forceRefresh) {
      if (hasCache) {
        setCacheStatus('offline');
      } else {
        setError("📴 Нет подключения к интернету и кэш не найден");
      }
      setLoading(false);
      return;
    }
    
    if (isOnline) {
      if (forceRefresh || !isCacheValid() || !hasCache) {
        await fetchFromServer();
      } else {
        setCacheStatus('fresh');
      }
    }
    
    setLoading(false);
  }, [customerId, navigate, isOnline, loadCachedData, loadOfflineDebts, isCacheValid, fetchFromServer]);

  // ==================== INITIALIZATION ====================

  useEffect(() => {
    loadCustomerData();
  }, []);

  // ==================== NETWORK STATUS HANDLERS ====================

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (cacheStatus === 'offline') {
        setTimeout(() => {
          loadCustomerData(true);
        }, 1000);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setCacheStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [cacheStatus, loadCustomerData]);

  // ==================== DEBT DIRECTION LOGIC ====================

  const getDebtDirection = (debt: Debt) => {
    const currentUserId = user?.globalIdentityId;
    const isSender = debt.senderIdentityId._id === currentUserId;
    
    if (isSender) {
      return {
        role: "sender",
        direction: "Вы → Клиенту",
        description: "Вы дали в долг",
        iAmOwed: true,
        iShouldPay: false,
        iAmReceiver: false,
        iAmCreditor: true,
        paymentLabel: "Принять оплату",
        paymentHint: "Клиент вернул вам деньги",
        verificationHint: "Подтвердите получение денег",
        badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        borderColor: "border-emerald-900/30",
        buttonColor: "bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700",
        icon: "👤",
        gradientFrom: "from-emerald-600",
        gradientTo: "to-teal-600"
      };
    } else {
      return {
        role: "receiver",
        direction: "Клиент → Вам",
        description: "Вы получили в долг",
        iAmOwed: false,
        iShouldPay: true,
        iAmReceiver: true,
        iAmCreditor: false,
        paymentLabel: "Вернуть долг",
        paymentHint: "Вы возвращаете деньги клиенту",
        verificationHint: "Ожидает подтверждения",
        badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/30",
        borderColor: "border-rose-900/30",
        buttonColor: "bg-rose-600 hover:bg-rose-500 active:bg-rose-700",
        icon: "💳",
        gradientFrom: "from-rose-600",
        gradientTo: "to-pink-600"
      };
    }
  };

  // ==================== PAYMENT HANDLERS ====================

  const customerPaid = async (debtId: string, amount: number) => {
    if (!amount || amount <= 0) {
      alert("⚠️ Введите корректную сумму");
      return;
    }

    if (!isOnline) {
      const debt = debts.find(d => d._id === debtId);
      const direction = getDebtDirection(debt!);
      await offlineMakePayment(debtId, amount, direction, customer!);
      return;
    }

    try {

      setPayAmounts((prev) => {
        const copy = { ...prev };
        delete copy[debtId];
        return copy;
      });

      const updatedDebts = debts.map(debt => {
        if (debt._id === debtId) {
          const newRemaining = Math.max(0, debt.amountRemaining - amount);
          return normalizeDebt({
            ...debt,
            amountRemaining: newRemaining,
            paymentStatus: newRemaining === 0 ? "paid" : "active",
            pendingPayment: undefined
          });
        }
        return debt;
      });
      
      setDebts(updatedDebts);
      saveToCache({ debts: updatedDebts, customer });

      if (socket.connected) {
        socket.emit("debt:payment-confirmed", {
          debtId,
          amount,
          confirmerId: user?.globalIdentityId
        });
      }

      alert("✅ Оплата принята успешно!");
      setTimeout(() => loadCustomerData(true), 500);
    } catch (error: any) {
      console.error("❌ Ошибка при принятии оплаты:", error);
      alert(error.response?.data?.message || "Ошибка при принятии оплаты");
    }
  };

  const makePayment = async (debtId: string, amount: number) => {
    if (!amount || amount <= 0) {
      alert("⚠️ Введите корректную сумму");
      return;
    }

    if (!isOnline) {
      const debt = debts.find(d => d._id === debtId);
      const direction = getDebtDirection(debt!);
      await offlineMakePayment(debtId, amount, direction, customer!);
      return;
    }

    try {
      const response = await api.post(`/debts/${debtId}/pay`, { 
        amount 
      });

      setPayAmounts((prev) => {
        const copy = { ...prev };
        delete copy[debtId];
        return copy;
      });

      setPendingPayments(prev => [...prev, { debtId, amount }]);

      const updatedDebts = debts.map(debt => 
        debt._id === debtId 
          ? normalizeDebt({
              ...debt,
              paymentStatus: "pending_verification",
              pendingPayment: response.data.debt?.pendingPayment
            })
          : debt
      );
      
      setDebts(updatedDebts);
      saveToCache({ debts: updatedDebts, customer });

      if (socket.connected) {
        socket.emit("debt:payment-requested", {
          debtId,
          amount,
          senderId: user?.globalIdentityId
        });
      }

      alert("💸 Оплата отправлена. Ожидайте подтверждения от кредитора.");
      setTimeout(() => loadCustomerData(true), 500);
    } catch (error: any) {
      console.error("❌ Ошибка при возврате долга:", error);
      alert(error.response?.data?.message || "Ошибка при возврате долга");
    }
  };

  const verifyPayment = async (debtId: string, amount: number, isVerified: boolean) => {
    if (!isOnline) {
      alert("📴 Необходимо подключение к интернету для подтверждения платежа");
      return;
    }

    try {

      setPendingPayments(prev => prev.filter(p => p.debtId !== debtId));
      setVerifyingPayment(null);

      const updatedDebts = debts.map(debt => {
        if (debt._id === debtId) {
          if (isVerified) {
            const newRemaining = Math.max(0, debt.amountRemaining - amount);
            return normalizeDebt({
              ...debt,
              amountRemaining: newRemaining,
              paymentStatus: newRemaining === 0 ? "paid" : "active",
              pendingPayment: undefined
            });
          } else {
            return normalizeDebt({
              ...debt,
              paymentStatus: "active",
              pendingPayment: undefined
            });
          }
        }
        return debt;
      });
      
      setDebts(updatedDebts);
      saveToCache({ debts: updatedDebts, customer });

      if (socket.connected) {
        if (isVerified) {
          socket.emit("debt:payment-accepted", {
            debtId,
            amount,
            acceptorId: user?.globalIdentityId
          });
        } else {
          socket.emit("debt:payment-rejected", {
            debtId,
            amount,
            rejectorId: user?.globalIdentityId
          });
        }
      }

      alert(isVerified ? "✅ Оплата успешно подтверждена!" : "❌ Оплата отклонена.");
      setTimeout(() => loadCustomerData(true), 500);
    } catch (error: any) {
      console.error("❌ Ошибка при подтверждении оплаты:", error);
      alert(error.response?.data?.message || "Ошибка при подтверждении оплаты");
    }
  };

  const handlePayment = (debt: Debt, amountStr: string) => {
    const amount = Number(amountStr);
    if (!amount || amount <= 0) {
      alert("⚠️ Введите корректную сумму");
      return;
    }

    if (amount > debt.amountRemaining) {
      alert(`⚠️ Сумма оплаты не может превышать остаток долга (${formatMoneyRUB(debt.amountRemaining)})`);
      return;
    }

    const direction = getDebtDirection(debt);
    
    if (direction.role === "sender") {
      customerPaid(debt._id, amount);
    } else {
      makePayment(debt._id, amount);
    }
  };

  const handleQuickPayFIFO = async (amount: number, isOwed: boolean) => {
    if (!amount || amount <= 0) {
      alert("⚠️ Введите корректную сумму");
      return;
    }

    const debtsForQuickPay = activeDebts
      .filter(d => {
        const direction = getDebtDirection(d);
        return isOwed ? direction.iAmOwed : !direction.iAmOwed;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (debtsForQuickPay.length === 0) {
      alert("⚠️ Нет долгов для оплаты");
      return;
    }

    let remainingAmount = amount;
    const totalDebt = debtsForQuickPay.reduce((sum, d) => sum + d.amountRemaining, 0);

    if (amount > totalDebt) {
      alert(`⚠️ Сумма превышает общий долг (${formatMoneyRUB(totalDebt)})`);
      return;
    }

    setProcessingQuickPay(true);
    let updatedDebts = [...debts];
    
    try {
      for (const debt of debtsForQuickPay) {
        if (remainingAmount <= 0) break;
        
        const payAmount = Math.min(remainingAmount, debt.amountRemaining);
        
        if (payAmount > 0) {
          if (isOwed) {
            if (isOnline) {
              await api.post(`/debts/${debt._id}/mark-paid`, { amount: payAmount });
            } else {
              await offlineMakePayment(debt._id, payAmount, getDebtDirection(debt), customer!);
            }
          } else {
            if (isOnline) {
              await api.post(`/debts/${debt._id}/pay`, { amount: payAmount });
            } else {
              await offlineMakePayment(debt._id, payAmount, getDebtDirection(debt), customer!);
            }
          }
          
          updatedDebts = updatedDebts.map(d => {
            if (d._id === debt._id) {
              const newRemaining = Math.max(0, d.amountRemaining - payAmount);
              return {
                ...d,
                amountRemaining: newRemaining,
                paymentStatus: newRemaining === 0 ? "paid" : "active"
              };
            }
            return d;
          });
          
          remainingAmount -= payAmount;
        }
      }
      
      setDebts(updatedDebts);
      saveToCache({ debts: updatedDebts, customer });
      
      if (isOwed) {
        setQuickPayOwedAmount("");
      } else {
        setQuickPayOweAmount("");
      }
      
      alert(`✅ Успешно обработано платежей на сумму ${formatMoneyRUB(amount - remainingAmount)}`);
      setTimeout(() => loadCustomerData(true), 1000);
      
    } catch (error: any) {
      console.error("❌ Ошибка при быстрой оплате:", error);
      alert(error.response?.data?.message || "Ошибка при обработке платежей");
    } finally {
      setProcessingQuickPay(false);
    }
  };

  const offlineMakePayment = useCallback(async (
    debtId: string, 
    amount: number, 
    direction: any,
    customerData: CustomerHeader
  ) => {
    if (!customerData) return;

    const offlineDebt = createOfflineDebt({
      receiverPhone: customerData.phone || '',
      receiverName: customerData.localName || '',
      amount: amount,
      description: `Оплата по долгу ${debtId}`,
      paymentType: direction.role === "sender" ? "receiver_to_sender" : "sender_to_receiver",
      debtId: debtId
    });

    const updatedOfflineDebts = [...offlineDebts, offlineDebt];
    saveOfflineDebts(updatedOfflineDebts);

    setDebts(prevDebts => 
      prevDebts.map(debt => {
        if (debt._id === debtId) {
          const newRemaining = Math.max(0, debt.amountRemaining - amount);
          return {
            ...debt,
            amountRemaining: newRemaining,
            paymentStatus: newRemaining === 0 ? "paid" : "active"
          };
        }
        return debt;
      })
    );

    setPendingPayments(prev => [...prev, { debtId, amount }]);
    
    setPayAmounts(prev => {
      const copy = { ...prev };
      delete copy[debtId];
      return copy;
    });

    saveToCache({ debts, customer: customerData });
    alert(`💰 Оффлайн платеж создан: ${formatMoneyRUB(amount)}. Будет синхронизирован при восстановлении соединения.`);
  }, [offlineDebts, saveOfflineDebts, createOfflineDebt, saveToCache, debts]);

  // ==================== SOCKET EVENT HANDLERS ====================

  useEffect(() => {
    if (!user?.globalIdentityId || !customerId) return;

    if (!socket.connected) {
      const token = localStorage.getItem("token");
      if (token) {
        socket.auth = (cb) => cb({ token });
        socket.connect();
      }
    }

    const handleDebtUpdated = (data: any) => {
      if (data.debt) {
        setDebts(prevDebts => {
          const index = prevDebts.findIndex(d => d._id === data.debtId);
          const normalizedDebt = normalizeDebt(data.debt);
          
          if (index !== -1) {
            const newDebts = [...prevDebts];
            newDebts[index] = normalizedDebt;
            return newDebts;
          } else {
            return [...prevDebts, normalizedDebt];
          }
        });
        
        setPendingPayments(prev => prev.filter(p => p.debtId !== data.debtId));
        
        setTimeout(() => {
          saveToCache({ debts, customer });
        }, 500);
      }
    };

    const handlePaymentRequested = (data: any) => {
      if (data.debtId) {
        setPendingPayments(prev => [...prev, {
          debtId: data.debtId,
          amount: data.amount
        }]);
        
        setDebts(prevDebts => 
          prevDebts.map(debt => 
            debt._id === data.debtId
              ? normalizeDebt({
                  ...debt,
                  paymentStatus: "pending_verification",
                  pendingPayment: {
                    amount: data.amount,
                    requestedBy: { _id: data.senderId },
                    paymentType: "receiver_to_sender",
                    requestedAt: new Date().toISOString()
                  }
                })
              : debt
          )
        );
        
        setTimeout(() => loadCustomerData(true), 500);
      }
    };

    const handlePaymentAccepted = (data: any) => {
      if (data.debtId) {
        setPendingPayments(prev => prev.filter(p => p.debtId !== data.debtId));
        
        setDebts(prevDebts => 
          prevDebts.map(debt => {
            if (debt._id === data.debtId) {
              const newRemaining = Math.max(0, debt.amountRemaining - data.amount);
              return normalizeDebt({
                ...debt,
                amountRemaining: newRemaining,
                paymentStatus: newRemaining === 0 ? "paid" : "active",
                pendingPayment: undefined
              });
            }
            return debt;
          })
        );
        
        setTimeout(() => {
          loadCustomerData(true);
          saveToCache({ debts, customer });
        }, 500);
      }
    };

    const handlePaymentRejected = (data: any) => {
      if (data.debtId) {
        setPendingPayments(prev => prev.filter(p => p.debtId !== data.debtId));
        
        setDebts(prevDebts => 
          prevDebts.map(debt => 
            debt._id === data.debtId
              ? normalizeDebt({
                  ...debt,
                  paymentStatus: "active",
                  pendingPayment: undefined
                })
              : debt
          )
        );
        
        setTimeout(() => {
          loadCustomerData(true);
          saveToCache({ debts, customer });
        }, 500);
      }
    };

    const handlePaymentConfirmed = (data: any) => {
      if (data.debtId) {
        setPendingPayments(prev => prev.filter(p => p.debtId !== data.debtId));
        
        setDebts(prevDebts => 
          prevDebts.map(debt => {
            if (debt._id === data.debtId) {
              const newRemaining = Math.max(0, debt.amountRemaining - data.amount);
              return normalizeDebt({
                ...debt,
                amountRemaining: newRemaining,
                paymentStatus: newRemaining === 0 ? "paid" : "active",
                pendingPayment: undefined
              });
            }
            return debt;
          })
        );
        
        setTimeout(() => {
          loadCustomerData(true);
          saveToCache({ debts, customer });
        }, 500);
      }
    };

    socket.on("debt:updated", handleDebtUpdated);
    socket.on("debt:payment-requested", handlePaymentRequested);
    socket.on("debt:payment-accepted", handlePaymentAccepted);
    socket.on("debt:payment-rejected", handlePaymentRejected);
    socket.on("debt:payment-confirmed", handlePaymentConfirmed);

    return () => {
      socket.off("debt:updated", handleDebtUpdated);
      socket.off("debt:payment-requested", handlePaymentRequested);
      socket.off("debt:payment-accepted", handlePaymentAccepted);
      socket.off("debt:payment-rejected", handlePaymentRejected);
      socket.off("debt:payment-confirmed", handlePaymentConfirmed);
    };
  }, [user, customerId, debts, customer, saveToCache, loadCustomerData]);

  // ==================== MEMOIZED COMPUTATIONS ====================

  const activeDebts = useMemo(
    () => debts.filter(d => 
      d.paymentStatus === "active" && 
      d.amountRemaining > 0 &&
      !pendingPayments.some(p => p.debtId === d._id)
    ),
    [debts, pendingPayments]
  );

  const pendingVerificationDebts = useMemo(
    () => debts.filter(d => {
      if (d.paymentStatus !== "pending_verification" || !d.pendingPayment) return false;
      const direction = getDebtDirection(d);
      return direction.role === "sender";
    }),
    [debts]
  );

  const myPendingPayments = useMemo(
    () => debts.filter(d => {
      if (d.paymentStatus !== "pending_verification" || !d.pendingPayment) return false;
      const direction = getDebtDirection(d);
      return direction.role === "receiver";
    }),
    [debts]
  );

  const paidDebts = useMemo(
    () => debts.filter(d => 
      d.paymentStatus === "paid" || 
      (d.paymentStatus === "active" && d.amountRemaining === 0)
    ),
    [debts]
  );

  const iOweTotal = useMemo(
    () => activeDebts
      .filter(d => {
        const direction = getDebtDirection(d);
        return !direction.iAmOwed;
      })
      .reduce((sum, d) => sum + d.amountRemaining, 0),
    [activeDebts]
  );

  const iAmOwedTotal = useMemo(
    () => activeDebts
      .filter(d => {
        const direction = getDebtDirection(d);
        return direction.iAmOwed;
      })
      .reduce((sum, d) => sum + d.amountRemaining, 0),
    [activeDebts]
  );

  const iOweDebtsSorted = useMemo(
    () => activeDebts
      .filter(d => {
        const direction = getDebtDirection(d);
        return !direction.iAmOwed;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [activeDebts]
  );

  const iAmOwedDebtsSorted = useMemo(
    () => activeDebts
      .filter(d => {
        const direction = getDebtDirection(d);
        return direction.iAmOwed;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [activeDebts]
  );

  // ==================== LOADING STATE ====================

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900">
        <div className="max-w-xl mx-auto px-4 pt-20">
          <div className="flex flex-col items-center justify-center gap-6">
            {/* Анимированный лоадер */}
            <div className="relative">
              <div className="w-20 h-20 border-4 border-slate-800 border-t-blue-500 border-r-emerald-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-full animate-pulse"></div>
              </div>
            </div>
            
            <div className="text-center space-y-2">
              <p className="text-slate-300 font-medium">
                {isOnline ? "Загрузка данных..." : "Загрузка кэша..."}
              </p>
              <p className="text-sm text-slate-500">
                {isOnline ? "Получаем актуальную информацию" : "Используем сохраненные данные"}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== MAIN RENDER ====================

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 pb-24 lg:pb-16">
      <div className="max-w-xl mx-auto px-4 pt-4 md:p-6 lg:pt-16">
        
        {/* ========== HEADER ========== */}
        <div className="flex items-center gap-3 sm:gap-4 mb-6">
          {/* Кнопка назад */}
          <button
            onClick={() => navigate(-1)}
            className="group p-2 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 transition-all duration-200 border border-slate-700/50 hover:border-slate-600/50 backdrop-blur-sm shrink-0"
            aria-label="Назад"
          >
            <svg className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Аватар */}
          <div className="relative shrink-0">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-emerald-600 flex items-center justify-center text-white font-bold text-lg sm:text-xl shadow-lg shadow-blue-900/30">
              {getInitial(customer?.localName || customer?.targetIdentityId?.registeredName)}
            </div>
            {!isOnline && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-amber-500 rounded-full border-2 border-slate-900 flex items-center justify-center">
                <span className="text-xs">📴</span>
              </div>
            )}
          </div>

          {/* Информация о клиенте */}
          <div className="flex-grow min-w-0">
            <h1 className="font-bold text-lg sm:text-xl text-white truncate">
              {customer?.localName || customer?.targetIdentityId?.registeredName || "Без имени"}
            </h1>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-400 truncate">
                {customer?.phone || customer?.targetIdentityId?.phone || "—"}
              </span>
            
            </div>
          </div>

          {/* Панель действий */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Статус кэша */}
            <div className={`
              px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl backdrop-blur-sm border text-xs sm:text-sm
              transition-all duration-300
              ${cacheStatus === 'fresh' 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-lg shadow-emerald-500/5' 
                : cacheStatus === 'stale'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 shadow-lg shadow-amber-500/5'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300 shadow-lg shadow-rose-500/5'
              }
            `}>
              <div className="flex items-center gap-1.5">
                <span className="text-base">
                  {cacheStatus === 'fresh' ? '✨' : cacheStatus === 'stale' ? '🔄' : '📴'}
                </span>
                <span className="hidden xs:inline font-medium">
                  {cacheStatus === 'fresh' ? 'Актуально' 
                   : cacheStatus === 'stale' ? 'Кэш'
                   : 'Оффлайн'}
                </span>
              </div>
            </div>

            {/* Кнопка обновления */}
            <button
              onClick={() => loadCustomerData(true)}
              disabled={!isOnline || syncing}
              className={`
                group p-2 rounded-xl border transition-all duration-200 relative
                ${isOnline && !syncing
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10' 
                  : 'bg-slate-800/50 border-slate-700/50 text-slate-500 cursor-not-allowed'
                }
              `}
              title={isOnline ? (syncing ? "Синхронизация..." : "Обновить данные") : "Нет подключения к интернету"}
            >
              <svg className={`w-5 h-5 ${syncing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            
            {/* Кнопка добавить долг */}
            <button
              onClick={() => navigate(`/new-debt?customerId=${customerId}`)}
              className="group p-2 sm:p-3 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 text-white shadow-lg shadow-blue-900/30 shrink-0 hover:shadow-xl hover:shadow-blue-900/40 hover:scale-105 active:scale-95 transition-all duration-200"
              title="Добавить новый долг"
            >
              <span className="text-xl sm:text-2xl group-hover:rotate-90 transition-transform duration-300">➕</span>
            </button>
          </div>
        </div>

        {/* ========== ОФФЛАЙН ИНДИКАТОР ========== */}
        {offlineDebts.length > 0 && (
          <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 to-amber-600/5 border border-amber-500/30 backdrop-blur-sm animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <span className="text-xl">📴</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-300">
                  {offlineDebts.length} оффлайн платеж{offlineDebts.length > 1 ? 'ей' : ''} ожидают синхронизации
                </p>
                <p className="text-xs text-amber-400/70 mt-0.5">
                  Будут отправлены при восстановлении соединения
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ========== СВОДКА ПО ДОЛГАМ ========== */}
        <div className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-sm rounded-3xl p-6 mb-6 border border-slate-700/50 shadow-xl">
          {/* Заголовок */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
              Общая сводка
            </h2>
            <span className="text-xs px-2 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              FIFO
            </span>
          </div>

          {/* Карточки с суммами */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Я должен */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500/10 to-rose-600/5 p-4 border border-rose-900/30">
              <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/5 rounded-full blur-2xl"></div>
              <div className="relative">
                <p className="text-slate-400 text-xs mb-1 flex items-center gap-1.5">
                  <span className="text-lg">💳</span>
                  Я должен
                </p>
                <p className="text-2xl font-bold text-rose-400">
                  {formatMoneyRUB(iOweTotal)}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-slate-500">
                    {iOweDebtsSorted.length} долгов
                  </p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
                    FIFO
                  </span>
                </div>
              </div>
            </div>
            
            {/* Мне должны */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-4 border border-emerald-900/30">
              <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full blur-2xl"></div>
              <div className="relative">
                <p className="text-slate-400 text-xs mb-1 flex items-center gap-1.5">
                  <span className="text-lg">💰</span>
                  Мне должны
                </p>
                <p className="text-2xl font-bold text-emerald-400">
                  {formatMoneyRUB(iAmOwedTotal)}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-slate-500">
                    {iAmOwedDebtsSorted.length} долгов
                  </p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                    FIFO
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ========== БЫСТРАЯ ОПЛАТА (FIFO) ========== */}
          
          {/* Я должен - быстрая оплата */}
          {iOweTotal > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <p className="text-xs text-slate-400 mb-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
                Быстрая оплата долгов (FIFO):
              </p>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Сумма"
                    value={quickPayOweAmount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      setQuickPayOweAmount(val);
                    }}
                    className="w-full px-4 py-3 rounded-xl bg-slate-800/50 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 border border-slate-700/50 focus:border-rose-500/50 transition-all text-base"
                  />
                  {quickPayOweAmount && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                      ₽
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleQuickPayFIFO(Number(quickPayOweAmount), false)}
                  disabled={!quickPayOweAmount || Number(quickPayOweAmount) <= 0 || Number(quickPayOweAmount) > iOweTotal || processingQuickPay}
                  className={`
                    px-6 py-3 rounded-xl font-medium transition-all duration-200
                    flex items-center gap-2
                    ${quickPayOweAmount && Number(quickPayOweAmount) > 0 && Number(quickPayOweAmount) <= iOweTotal && !processingQuickPay
                      ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-lg shadow-rose-900/30 hover:shadow-xl hover:shadow-rose-900/40 hover:scale-105 active:scale-95'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    }
                  `}
                >
                  <span>💸</span>
                  <span className="hidden sm:inline">Вернуть</span>
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                <span className="text-emerald-400">⏳</span>
                Доступно: {formatMoneyRUB(iOweTotal)}
              </p>
            </div>
          )}

          {/* Мне должны - быстрая оплата */}
          {iAmOwedTotal > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <p className="text-xs text-slate-400 mb-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                Быстрое принятие оплаты (FIFO):
              </p>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Сумма"
                    value={quickPayOwedAmount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      setQuickPayOwedAmount(val);
                    }}
                    className="w-full px-4 py-3 rounded-xl bg-slate-800/50 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 border border-slate-700/50 focus:border-emerald-500/50 transition-all text-base"
                  />
                  {quickPayOwedAmount && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                      ₽
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleQuickPayFIFO(Number(quickPayOwedAmount), true)}
                  disabled={!quickPayOwedAmount || Number(quickPayOwedAmount) <= 0 || Number(quickPayOwedAmount) > iAmOwedTotal || processingQuickPay}
                  className={`
                    px-6 py-3 rounded-xl font-medium transition-all duration-200
                    flex items-center gap-2
                    ${quickPayOwedAmount && Number(quickPayOwedAmount) > 0 && Number(quickPayOwedAmount) <= iAmOwedTotal && !processingQuickPay
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-900/30 hover:shadow-xl hover:shadow-emerald-900/40 hover:scale-105 active:scale-95'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    }
                  `}
                >
                  <span>💸</span>
                  <span className="hidden sm:inline">Принять</span>
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                <span className="text-amber-400">⚡</span>
                Ожидает: {formatMoneyRUB(iAmOwedTotal)}
              </p>
            </div>
          )}
        </div>

        {/* ========== СПИСОК ДОЛГОВ ========== */}
        <div className="space-y-8">
          
          {/* ===== ТРЕБУЕТ МОЕГО ПОДТВЕРЖДЕНИЯ ===== */}
          {pendingVerificationDebts.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent flex items-center gap-2">
                  <span>⚠️</span>
                  Требует подтверждения
                </h3>
                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30">
                  {pendingVerificationDebts.length}
                </span>
              </div>
              
              <div className="space-y-4">
                {pendingVerificationDebts.map((d) => {
                  const pendingPayment = d.pendingPayment;
                  
                  return (
                    <div
                      key={d._id}
                      className="group relative bg-gradient-to-br from-slate-900 to-slate-800/90 rounded-3xl p-5 border-2 border-orange-500/30 hover:border-orange-500/50 transition-all duration-300 shadow-lg shadow-orange-900/20"
                    >
                      {/* Фоновый градиент */}
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent rounded-3xl"></div>
                      
                      <div className="relative">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex flex-wrap gap-2 mb-3">
                              <span className="px-3 py-1.5 text-xs font-medium rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30">
                                ⚡ Вы → Клиенту
                              </span>
                              <span className="px-3 py-1.5 text-xs font-medium rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                                ОЖИДАЕТ ПОДТВЕРЖДЕНИЯ
                              </span>
                            </div>
                            
                            <p className="text-3xl font-bold text-white mb-2">
                              {formatMoneyRUB(d.amountRemaining)}
                              <span className="text-lg text-slate-500 font-normal ml-2">
                                / {formatMoneyRUB(d.amountTotal)}
                              </span>
                            </p>
                            
                            {pendingPayment && (
                              <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-orange-500/10 to-amber-500/5 border border-orange-500/20">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="text-2xl">💰</span>
                                  <div>
                                    <p className="text-orange-300 font-medium">
                                      Должник вернул: {formatMoneyRUB(pendingPayment.amount)}
                                    </p>
                                    <p className="text-sm text-slate-400 mt-0.5">
                                      Подтвердите получение денег
                                    </p>
                                  </div>
                                </div>
                                <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                                  <span>📅</span>
                                  {new Date(pendingPayment.requestedAt).toLocaleString('ru-RU', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    day: 'numeric',
                                    month: 'long'
                                  })}
                                </p>
                              </div>
                            )}
                          </div>
                          
                          <button
                            onClick={() => navigate(`/chats/${d._id}`)}
                            className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 transition-all duration-200 border border-slate-700/50 hover:border-slate-600/50 ml-2 group/chat"
                            title="Открыть чат"
                          >
                            <span className="text-2xl group-hover/chat:scale-110 transition-transform duration-200">💬</span>
                          </button>
                        </div>

                        <div className="flex flex-col xs:flex-row gap-3 mt-4">
                          <button
                            onClick={() => verifyPayment(d._id, pendingPayment?.amount || 0, true)}
                            disabled={!isOnline}
                            className={`
                              flex-1 px-4 py-3.5 rounded-xl font-medium transition-all duration-200
                              flex items-center justify-center gap-2 text-base
                              ${isOnline
                                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-900/30 hover:shadow-xl hover:shadow-emerald-900/40 hover:scale-[1.02] active:scale-95'
                                : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                              }
                            `}
                          >
                            <span className="text-xl">✅</span>
                            <span>Подтвердить</span>
                          </button>
                          
                          <button
                            onClick={() => verifyPayment(d._id, pendingPayment?.amount || 0, false)}
                            disabled={!isOnline}
                            className={`
                              flex-1 px-4 py-3.5 rounded-xl font-medium transition-all duration-200
                              flex items-center justify-center gap-2 text-base
                              ${isOnline
                                ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-lg shadow-rose-900/30 hover:shadow-xl hover:shadow-rose-900/40 hover:scale-[1.02] active:scale-95'
                                : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                              }
                            `}
                          >
                            <span className="text-xl">❌</span>
                            <span>Отклонить</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ===== МОИ ОЖИДАЮЩИЕ ПЛАТЕЖИ ===== */}
          {myPendingPayments.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-2">
                  <span>⏳</span>
                  Мои ожидающие платежи
                </h3>
                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {myPendingPayments.length}
                </span>
              </div>
              
              <div className="space-y-4">
                {myPendingPayments.map((d) => {
                  const pendingPayment = d.pendingPayment;
                  
                  return (
                    <div
                      key={d._id}
                      className="group relative bg-gradient-to-br from-slate-900 to-slate-800/90 rounded-3xl p-5 border-2 border-blue-500/30 hover:border-blue-500/50 transition-all duration-300 shadow-lg shadow-blue-900/20"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent rounded-3xl"></div>
                      
                      <div className="relative">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex flex-wrap gap-2 mb-3">
                              <span className="px-3 py-1.5 text-xs font-medium rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                💳 Клиент → Вам
                              </span>
                              <span className="px-3 py-1.5 text-xs font-medium rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                ОЖИДАЕТ ПОДТВЕРЖДЕНИЯ
                              </span>
                            </div>
                            
                            <p className="text-3xl font-bold text-white mb-2">
                              {formatMoneyRUB(d.amountRemaining)}
                              <span className="text-lg text-slate-500 font-normal ml-2">
                                / {formatMoneyRUB(d.amountTotal)}
                              </span>
                            </p>
                            
                            <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 to-cyan-500/5 border border-blue-500/20">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="text-2xl">⏳</span>
                                <div>
                                  <p className="text-blue-300 font-medium">
                                    Вы вернули: {formatMoneyRUB(pendingPayment?.amount || 0)}
                                  </p>
                                  <p className="text-sm text-slate-400 mt-0.5">
                                    Ожидает подтверждения от кредитора
                                  </p>
                                </div>
                              </div>
                              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                                <span>📅</span>
                                {new Date(pendingPayment?.requestedAt || "").toLocaleString('ru-RU', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  day: 'numeric',
                                  month: 'long'
                                })}
                              </p>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => navigate(`/chats/${d._id}`)}
                            className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 transition-all duration-200 border border-slate-700/50 hover:border-slate-600/50 ml-2 group/chat"
                            title="Открыть чат"
                          >
                            <span className="text-2xl group-hover/chat:scale-110 transition-transform duration-200">💬</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ===== АКТИВНЫЕ ДОЛГИ (FIFO) ===== */}
          {activeDebts.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold bg-gradient-to-r from-yellow-400 to-amber-400 bg-clip-text text-transparent flex items-center gap-2">
                  <span>⚡</span>
                  Активные долги
                </h3>
                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                  {activeDebts.length}
                </span>
              </div>
              
              <div className="space-y-4">
                {/* Сначала долги где я должен (от старых к новым) */}
                {iOweDebtsSorted.map((d) => {
                  const direction = getDebtDirection(d);
                  
                  return (
                    <DebtCard
                      key={d._id}
                      debt={d}
                      direction={direction}
                      payAmount={payAmounts[d._id] || ""}
                      onPayAmountChange={(value) => setPayAmounts(prev => ({ ...prev, [d._id]: value }))}
                      onPayment={handlePayment}
                      onChatClick={() => navigate(`/chats/${d._id}`)}
                      isOnline={isOnline}
                    />
                  );
                })}

                {/* Затем долги где мне должны (от старых к новым) */}
                {iAmOwedDebtsSorted.map((d) => {
                  const direction = getDebtDirection(d);
                  
                  return (
                    <DebtCard
                      key={d._id}
                      debt={d}
                      direction={direction}
                      payAmount={payAmounts[d._id] || ""}
                      onPayAmountChange={(value) => setPayAmounts(prev => ({ ...prev, [d._id]: value }))}
                      onPayment={handlePayment}
                      onChatClick={() => navigate(`/chats/${d._id}`)}
                      isOnline={isOnline}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* ===== ОПЛАЧЕННЫЕ ДОЛГИ ===== */}
          {paidDebts.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent flex items-center gap-2">
                  <span>✅</span>
                  Оплаченные долги
                </h3>
                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {paidDebts.length}
                </span>
              </div>
              
              <div className="space-y-3">
                {paidDebts.map((d) => {
                  const direction = getDebtDirection(d);
                  
                  return (
                    <div
                      key={d._id}
                      className="group relative bg-gradient-to-br from-slate-900 to-slate-800/90 rounded-2xl p-5 border border-emerald-900/30 hover:border-emerald-700/50 transition-all duration-300"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent rounded-2xl"></div>
                      
                      <div className="relative flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-3">
                            <span className={`
                              px-3 py-1.5 text-xs font-medium rounded-full
                              ${direction.role === "sender" 
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                                : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              }
                            `}>
                              {direction.direction}
                            </span>
                            <span className="px-3 py-1.5 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              ✅ ПОЛНОСТЬЮ ОПЛАЧЕНО
                            </span>
                          </div>
                          
                          <p className="text-2xl font-bold text-emerald-400 mb-2">
                            {formatMoneyRUB(d.amountTotal)}
                          </p>
                          
                          {d.description && (
                            <p className="text-sm text-slate-400 mb-2 flex items-center gap-1.5">
                              <span>📝</span>
                              {d.description}
                            </p>
                          )}
                          
                          <p className="text-xs text-slate-500 flex items-center gap-1.5">
                            <span>📅</span>
                            {new Date(d.createdAt).toLocaleDateString('ru-RU', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </p>
                        </div>

                        <button
                          onClick={() => navigate(`/chats/${d._id}`)}
                          className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 transition-all duration-200 border border-slate-700 hover:border-slate-600 group/chat"
                          title="Открыть чат"
                        >
                          <span className="text-2xl group-hover/chat:scale-110 transition-transform duration-200">💬</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ===== НЕТ ДОЛГОВ ===== */}
          {debts.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="relative mb-6">
                <div className="w-24 h-24 bg-gradient-to-br from-slate-800 to-slate-700 rounded-3xl flex items-center justify-center">
                  <span className="text-5xl">💰</span>
                </div>
                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center backdrop-blur-sm border border-emerald-500/30">
                  <span className="text-lg">✨</span>
                </div>
              </div>
              
              <h3 className="text-2xl font-bold text-white mb-2">
                Долгов пока нет
              </h3>
              <p className="text-slate-400 text-center mb-8 max-w-xs">
                Создайте первый долг и начните отслеживать взаиморасчеты с клиентом
              </p>
              
              <button
                onClick={() => navigate(`/new-debt?customerId=${customerId}`)}
                className="group px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-emerald-600 text-white font-medium shadow-lg shadow-blue-900/30 hover:shadow-xl hover:shadow-blue-900/40 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center gap-3"
              >
                <span className="text-2xl group-hover:rotate-90 transition-transform duration-300">➕</span>
                <span>Создать первый долг</span>
              </button>
            </div>
          )}

          {/* ===== ОШИБКА ===== */}
          {error && (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-20 h-20 bg-gradient-to-br from-rose-500/20 to-rose-600/20 rounded-3xl flex items-center justify-center mb-6 border border-rose-500/30">
                <span className="text-4xl">⚠️</span>
              </div>
              
              <h3 className="text-xl font-bold text-rose-400 mb-2">
                Ошибка загрузки
              </h3>
              <p className="text-slate-400 text-center mb-6 max-w-xs">
                {error}
              </p>
              
              <button
                onClick={() => loadCustomerData(true)}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium shadow-lg shadow-blue-900/30 hover:shadow-xl hover:shadow-blue-900/40 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center gap-2"
              >
                <span>🔄</span>
                <span>Попробовать снова</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== DEBT CARD COMPONENT ====================

interface DebtCardProps {
  debt: Debt;
  direction: any;
  payAmount: string;
  onPayAmountChange: (value: string) => void;
  onPayment: (debt: Debt, amount: string) => void;
  onChatClick: () => void;
  isOnline: boolean;
}

function DebtCard({
  debt,
  direction,
  payAmount,
  onPayAmountChange,
  onPayment,
  onChatClick,
  isOnline
}: DebtCardProps) {
  const progress = ((debt.amountTotal - debt.amountRemaining) / debt.amountTotal) * 100;
  
  return (
    <div className={`
      group relative bg-gradient-to-br from-slate-900 to-slate-800/90 rounded-3xl p-5 
      border-2 ${direction.borderColor} hover:border-opacity-50 
      transition-all duration-300 shadow-lg
    `}>
      {/* Фоновый градиент */}
      <div className={`absolute inset-0 bg-gradient-to-br ${direction.borderColor.replace('border', 'from')}/5 to-transparent rounded-3xl`}></div>
      
      <div className="relative">
        {/* Верхняя часть */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            {/* Бейджи */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={`
                px-3 py-1.5 text-xs font-medium rounded-full
                ${direction.badgeColor} border
              `}>
                <span className="mr-1.5">{direction.icon}</span>
                {direction.direction}
              </span>
              <span className="px-3 py-1.5 text-xs font-medium rounded-full bg-slate-700/80 text-slate-300 border border-slate-600/50">
                📅 {new Date(debt.createdAt).toLocaleDateString('ru-RU')}
              </span>
            </div>
            
            {/* Сумма долга */}
            <div className="mb-3">
              <p className="text-3xl font-bold text-white">
                {formatMoneyRUB(debt.amountRemaining)}
                <span className="text-lg text-slate-500 font-normal ml-2">
                  / {formatMoneyRUB(debt.amountTotal)}
                </span>
              </p>
              
              {/* Прогресс-бар */}
              <div className="w-full h-2 bg-slate-800 rounded-full mt-3 overflow-hidden">
                <div 
                  className={`
                    h-full rounded-full transition-all duration-500
                    ${direction.role === "sender" ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-rose-500 to-pink-500'}
                  `}
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-500 mt-1.5 text-right">
                Погашено: {progress.toFixed(0)}%
              </p>
            </div>
            
            {/* Описание */}
            {debt.description && (
              <p className="text-sm text-slate-300 mb-2 flex items-start gap-1.5 bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/50">
                <span className="text-lg">📝</span>
                <span>{debt.description}</span>
              </p>
            )}
          </div>
          
          {/* Кнопка чата */}
          <button
            onClick={onChatClick}
            className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 transition-all duration-200 border border-slate-700/50 hover:border-slate-600/50 ml-2 group/chat"
            title="Открыть чат"
          >
            <span className="text-2xl group-hover/chat:scale-110 transition-transform duration-200">💬</span>
          </button>
        </div>
        
        {/* Нижняя часть - оплата */}
        <div className="pt-4 border-t border-slate-800">
          <p className={`text-sm mb-3 flex items-center gap-1.5 ${
            direction.role === "sender" ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            <span className="text-lg">{direction.icon}</span>
            <span className="font-medium">{direction.paymentHint}</span>
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Сумма оплаты"
                value={payAmount}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  onPayAmountChange(val);
                }}
                className="w-full px-4 py-3.5 rounded-xl bg-slate-800/50 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 border border-slate-700/50 focus:border-blue-500/50 transition-all text-base"
              />
              {payAmount && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                  ₽
                </span>
              )}
            </div>

            <button
              onClick={() => onPayment(debt, payAmount)}
              disabled={!payAmount || Number(payAmount) <= 0}
              className={`
                px-6 py-3.5 rounded-xl font-medium transition-all duration-200
                flex items-center justify-center gap-2 text-base
                ${direction.buttonColor} 
                disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed disabled:border disabled:border-slate-700
                enabled:shadow-lg enabled:shadow-opacity-30 enabled:hover:shadow-xl enabled:hover:scale-[1.02] enabled:active:scale-95
              `}
            >
              <span className="text-xl">💸</span>
              <span>{direction.paymentLabel}</span>
            </button>
          </div>
          
          {/* Подсказка о статусе онлайн/оффлайн */}
          {!isOnline && (
            <p className="text-xs text-amber-400 mt-2 flex items-center gap-1.5">
              <span>📴</span>
              Оффлайн режим. Платеж будет сохранен и отправлен при восстановлении соединения.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}