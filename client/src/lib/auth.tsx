import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { apiRequest, queryClient } from "./queryClient";
import { invalidateRecurringData } from "@/components/RecurringCostFormDialog";

async function generateRecurringExpenses() {
  try {
    await apiRequest("POST", "/api/recurring/generate");
    invalidateRecurringData();
  } catch {
    // Best-effort — the dashboard just reflects whatever was already
    // materialized if this fails (e.g. offline).
  }
}

interface User {
  id: string;
  username: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/auth/user", {
          credentials: "include",
        });
        if (response.ok) {
          setUser(await response.json());
          generateRecurringExpenses();
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function authPost(url: string, body: unknown): Promise<User> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Request failed" }));
      throw new Error(error.message || "Request failed");
    }
    return response.json();
  }

  const login = async (username: string, password: string) => {
    setUser(await authPost("/api/auth/login", { username, password }));
    generateRecurringExpenses();
  };

  const register = async (username: string, password: string) => {
    setUser(await authPost("/api/auth/register", { username, password }));
    generateRecurringExpenses();
  };

  const logout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export type { User, AuthContextType };
