import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL + "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  
  // Debug uchun
  console.log("🔑 Request interceptor:", {
    url: config.url,
    method: config.method,
    hasToken: !!token,
    token: token ? `${token.substring(0, 20)}...` : null
  });
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    console.warn("⚠️ No token found in localStorage");
  }
  
  return config;
});

api.interceptors.response.use(
  (response) => {
    console.log("✅ Response:", {
      url: response.config.url,
      status: response.status,
      dataLength: Array.isArray(response.data) ? response.data.length : 'not array'
    });
    return response;
  },
  (error) => {
    console.error("❌ Axios error:", {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      message: error.response?.data?.message || error.message,
      headers: error.config?.headers
    });
    return Promise.reject(error);
  }
);

export default api;
