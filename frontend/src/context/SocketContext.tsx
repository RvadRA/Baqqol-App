// context/SocketContext.tsx - ФИНАЛЬНАЯ УПРОЩЕННАЯ ВЕРСИЯ
import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { socket } from "../socket";
import { useAuth } from "./AuthContext";

interface SocketContextType {
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
}

const SocketContext = createContext<SocketContextType>({
  isConnected: false,
  isConnecting: false,
  connect: () => {},
  disconnect: () => {},
  reconnect: () => {},
});

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [isConnecting, setIsConnecting] = useState(false);
  const isConnectingRef = useRef(false);
  const connectionAttemptsRef = useRef(0);
  const maxConnectionAttempts = 3;
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Функция для подключения сокета
  const connectSocket = useCallback(() => {
    if (socket.connected || isConnectingRef.current) {
      console.log("⚠️ Socket already connected or connecting");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      console.error("🔴 No token found for socket connection");
      setIsConnecting(false);
      isConnectingRef.current = false;
      return;
    }

    console.log("🔌 Connecting socket...");
    setIsConnecting(true);
    isConnectingRef.current = true;
    connectionAttemptsRef.current++;

    // Устанавливаем auth токен
    socket.auth = { token };

    // Таймаут для подключения
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }

    connectionTimeoutRef.current = setTimeout(() => {
      if (isConnectingRef.current) {
        console.log("⏰ Socket connection timeout");
        setIsConnecting(false);
        isConnectingRef.current = false;
        
        if (connectionAttemptsRef.current < maxConnectionAttempts) {
          console.log(`🔄 Retrying connection (attempt ${connectionAttemptsRef.current + 1}/${maxConnectionAttempts})`);
          setTimeout(() => connectSocket(), 2000);
        } else {
          console.error("❌ Max connection attempts reached");
        }
      }
    }, 10000); // 10 секунд таймаут

    socket.connect();
  }, []);

  // Функция для отключения сокета
  const disconnectSocket = useCallback(() => {
    console.log("🔌 Disconnecting socket...");
    if (socket.connected) {
      socket.disconnect();
    }
    setIsConnected(false);
    setIsConnecting(false);
    isConnectingRef.current = false;
    connectionAttemptsRef.current = 0;
    
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  // Функция для переподключения
  const reconnectSocket = useCallback(() => {
    console.log("🔄 Manual reconnection requested");
    disconnectSocket();
    setTimeout(() => connectSocket(), 1000);
  }, [connectSocket, disconnectSocket]);

  // Основной эффект для управления подключением
  useEffect(() => {
    if (authLoading) {
      console.log("⏳ Socket: Waiting for auth to load...");
      return;
    }

    console.log("🔍 Socket: Auth state:", { 
      user: !!user, 
      authLoading, 
      socketConnected: socket.connected 
    });

    if (!user) {
      // Если нет пользователя - отключаем сокет
      console.log("👤 Socket: No user - disconnecting socket");
      disconnectSocket();
      return;
    }

    // Есть пользователь - проверяем токен
    const token = localStorage.getItem("token");
    if (!token) {
      console.error("🔴 Socket: No token found in localStorage");
      setIsConnecting(false);
      isConnectingRef.current = false;
      return;
    }

    // Подключаемся если не подключены и не пытаемся подключиться
    if (!socket.connected && !isConnectingRef.current) {
      connectSocket();
    }

    return () => {
      // Очистка при размонтировании
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
    };
  }, [user, authLoading, connectSocket, disconnectSocket]);

  // Слушатели событий сокета
  useEffect(() => {
    const onConnect = () => {
      console.log("✅ Socket: Connected successfully, ID:", socket.id);
      setIsConnected(true);
      setIsConnecting(false);
      isConnectingRef.current = false;
      connectionAttemptsRef.current = 0;
      
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      // Присоединяемся к персональной комнате пользователя
      if (user?.globalIdentityId) {
        console.log(`👤 Socket: Joining user room: user:${user.globalIdentityId}`);
        socket.emit("join-user", user.globalIdentityId);
      }
    };

    const onDisconnect = (reason: string) => {
      console.log(`❌ Socket: Disconnected - ${reason}`);
      setIsConnected(false);
      setIsConnecting(false);
      isConnectingRef.current = false;
      
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      // Автоматическое переподключение только для определенных причин
      if (reason === "io server disconnect" || reason === "transport close") {
        console.log("🔄 Socket: Will attempt to reconnect...");
        if (user && connectionAttemptsRef.current < maxConnectionAttempts) {
          setTimeout(() => {
            if (!socket.connected && !isConnectingRef.current) {
              console.log("🔄 Socket: Attempting reconnect...");
              connectSocket();
            }
          }, 2000);
        }
      }
    };

    const onConnectError = (err: Error) => {
      console.error("🔴 Socket: Connection error:", err.message);
      
      if (err.message.includes("401") || err.message.includes("Unauthorized")) {
        console.warn("🚫 Socket: Unauthorized - token may be invalid");
        // Не очищаем токен автоматически, оставляем это AuthContext
      }
      
      setIsConnected(false);
      setIsConnecting(false);
      isConnectingRef.current = false;
      
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
    };

    const onReconnectAttempt = (attemptNumber: number) => {
      console.log(`🔄 Socket: Reconnect attempt ${attemptNumber}`);
      setIsConnecting(true);
      isConnectingRef.current = true;
    };

    const onReconnect = (attemptNumber: number) => {
      console.log(`✅ Socket: Reconnected after ${attemptNumber} attempts`);
      setIsConnected(true);
      setIsConnecting(false);
      isConnectingRef.current = false;
      connectionAttemptsRef.current = 0;
    };

    const onReconnectFailed = () => {
      console.error("❌ Socket: Failed to reconnect");
      setIsConnected(false);
      setIsConnecting(false);
      isConnectingRef.current = false;
    };

    // Добавляем слушатели
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("reconnect_attempt", onReconnectAttempt);
    socket.on("reconnect", onReconnect);
    socket.on("reconnect_failed", onReconnectFailed);

    // Инициализация текущего состояния
    if (socket.connected) {
      setIsConnected(true);
      setIsConnecting(false);
      isConnectingRef.current = false;
    }

    // Очистка
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("reconnect_attempt", onReconnectAttempt);
      socket.off("reconnect", onReconnect);
      socket.off("reconnect_failed", onReconnectFailed);
      
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
    };
  }, [user, connectSocket]);

  return (
    <SocketContext.Provider value={{ 
      isConnected, 
      isConnecting, 
      connect: connectSocket,
      disconnect: disconnectSocket,
      reconnect: reconnectSocket
    }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within SocketProvider");
  }
  return context;
};