import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
});

// Request interceptor to attach JWT token to all API calls
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('kemps_auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (err) => {
    return Promise.reject(err);
  }
);

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // If the server returns 401 Unauthorized, clear session keys and redirect to login page
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('kemps_logged_in');
      localStorage.removeItem('kemps_username');
      localStorage.removeItem('kemps_auth_token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
