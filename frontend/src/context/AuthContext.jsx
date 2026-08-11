import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });

  // Both sign-in routes end the same way, so the session handling lives in one
  // place. Splitting it produced two copies of "store token, store user, set
  // state" that could drift.
  const finish = (data) => {
    localStorage.setItem("token", data.token);
    const u = { username: data.username, role: data.role };
    localStorage.setItem("user", JSON.stringify(u));
    setUser(u);
    return u;
  };

  const login = async (username, password) => {
    const { data } = await api.post("/auth/login", { username, password });
    return finish(data);
  };

  // Workers sign in with their mobile number and a 4-digit PIN.
  //
  // The phone is required alongside the PIN, not for convenience but because a
  // PIN alone is 10,000 combinations shared across the estate — a bare-PIN
  // login would let a random guess land on somebody's account.
  const loginWithPin = async (phone, pin) => {
    const { data } = await api.post("/auth/login/pin", { phone, pin });
    return finish(data);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  // Merge partial profile fields (e.g. avatarUrl, displayName) into the current
  // user and persist them, so screens like the header update live when the
  // Settings page changes the profile.
  const updateUser = (patch) => {
    setUser((prev) => {
      const next = { ...(prev || {}), ...patch };
      localStorage.setItem("user", JSON.stringify(next));
      return next;
    });
  };

  // The login response only carries username + role, so hydrate the richer
  // profile fields (display name, avatar) from /me whenever a token exists.
  // This keeps the header avatar correct after a refresh or a fresh login.
  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get("/me");
        if (!alive) return;
        updateUser({
          displayName: data.displayName || "",
          avatarUrl: data.avatarUrl || "",
        });
      } catch {
        // ignore — keep whatever we already have
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const value = { user, login, loginWithPin, logout, updateUser };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
