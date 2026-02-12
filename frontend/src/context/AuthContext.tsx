import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/axios";

interface User {
  id: string;
  userId?: string;
  name: string; // ✅ O'zgartirildi: shopName → name
  phone: string;
  globalIdentityId?: string;
  // ❌ role YO'Q!
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  signup: (name: string, phone: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void; // Add this line
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");

    if (token && userData) {
      try {
        const parsedUser = JSON.parse(userData);
        
        // Normalize user data (PEER-TO-PEER)
        const normalizedUser: User = {
          id: parsedUser.id || parsedUser.userId || "",
          userId: parsedUser.userId || parsedUser.id || "",
          name: parsedUser.name || "", // ✅ O'zgartirildi
          phone: parsedUser.phone || "",
          globalIdentityId: parsedUser.globalIdentityId || "",
        };

        console.log("AuthContext loaded normalized user:", normalizedUser);
        setUser(normalizedUser);
        
        // Update localStorage with normalized data
        localStorage.setItem("user", JSON.stringify(normalizedUser));
      } catch (error) {
        console.error("Error parsing user data:", error);
        logout();
      }
    }

    setLoading(false);
  }, []);

  const login = async (phone: string, password: string) => {
    const res = await api.post("/auth/login", {
      phone,
      password,
    });

    console.log("Login response:", res.data);

    // Normalize the user data from backend (PEER-TO-PEER)
    const userData: User = {
      id: res.data.userId || res.data.id || "",
      userId: res.data.userId,
      name: res.data.name || "", // ✅ O'zgartirildi
      phone: res.data.phone,
      globalIdentityId: res.data.globalIdentityId,
    };

    localStorage.setItem("token", res.data.token);
    localStorage.setItem("user", JSON.stringify(userData));

    console.log("AuthContext setting user:", userData);
    setUser(userData);
  };

  const signup = async (
    name: string, // ✅ O'zgartirildi
    phone: string,
    password: string
  ) => {
    await api.post("/auth/signup", {
      name, // ✅ O'zgartirildi
      phone,
      password,
    });

    const res = await api.post("/auth/login", {
      phone,
      password,
    });

    const userData: User = {
      id: res.data.userId || res.data.id || "",
      userId: res.data.userId,
      name: res.data.name, // ✅ O'zgartirildi
      phone: res.data.phone,
      globalIdentityId: res.data.globalIdentityId,
    };

    localStorage.setItem("token", res.data.token);
    localStorage.setItem("user", JSON.stringify(userData));

    setUser(userData);
  };


  // Inside your AuthProvider component, add:
const updateUser = (updates: Partial<User>) => {
  if (user) {
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    localStorage.setItem("user", JSON.stringify(updatedUser));
  }
};

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, updateUser}}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);