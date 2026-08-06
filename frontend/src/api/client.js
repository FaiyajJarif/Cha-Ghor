import axios from "axios";

// Talks to the Spring Boot backend. All auth + API routes live under /api/v1.
const api = axios.create({ baseURL: "http://localhost:8080/api/v1" });

// Attach the JWT on every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on an expired / missing token (401). 403 (wrong role) is left
// for the calling component to handle so RBAC failures can be shown inline.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  },
);

export default api;
