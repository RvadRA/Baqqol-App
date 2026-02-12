// App.tsx - Fixed version
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { RealTimeAlerts } from './components/RealTimeAlerts';
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import PWAInstallPrompt from './components/PWAInstallPrompt';

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Customers from "./pages/Customers";
import CustomerDebts from "./pages/CustomerDebts";
import NewDebt from "./pages/NewDebt";
import Profile from "./pages/Profile";
import Chat from "./pages/Chat";
import AllChats from "./pages/AllChats";
import Dashboard from "./pages/Dashboard";
import ContactChat from "./pages/ContactChat";
import ContactChatList from "./pages/ContactChatList";


export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PWAInstallPrompt />
        <Routes>
          {/* PUBLIC */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* PROTECTED - SocketProvider inside ProtectedRoute */}
          <Route
            element={
              <ProtectedRoute>
                <SocketProvider>
                  <AppLayout />
                  <RealTimeAlerts />
                </SocketProvider>
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/" element={<Dashboard />} />
            <Route path="/customers" element={<Customers />} />
            <Route
              path="/customers/:customerId/debts"
              element={<CustomerDebts />}
            />
            <Route path="/new-debt" element={<NewDebt />} />
            <Route path="/customers/new-debt" element={<NewDebt />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/all-chats" element={<AllChats />} />
            <Route path="/chats/:debtId" element={<Chat />} />

<Route path="/contact-chats" element={<ContactChatList />} />
<Route path="/contact-chats/:contactChatId" element={<ContactChat />} />
<Route path="/contact-chats/by-contact/:contactIdentityId" element={<ContactChat />} />

          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}