import axios from 'axios';

const cloudflareApiBaseUrl = 'https://kmps-bkend-fullstack-application.bitwizard.online/api';
const localApiBaseUrl = 'http://localhost:8000/api';

function getApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  if (window.location.hostname === 'kmps-fed-fullstack-application.bitwizard.online') {
    return cloudflareApiBaseUrl;
  }

  return localApiBaseUrl;
}

const api = axios.create({
  baseURL: getApiBaseUrl(),
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
