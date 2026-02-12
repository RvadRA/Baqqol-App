const verifyPayment = async (debtId: string, amount: number, isVerified: boolean) => {
  if (!isOnline) {
    alert("📴 Необходимо подключение к интернету для подтверждения платежа");
    return;
  }

  try {
    // ✅ ADD THIS API CALL
    const response = await api.post(`/debts/${debtId}/verify`, { 
      isVerified 
    });

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
