import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080/api';
export const WS_BASE = import.meta.env.VITE_WS_BASE || 'ws://localhost:8080/ws';

export const api = axios.create({
	baseURL: API_BASE,
	headers: {
		'Content-Type': 'application/json'
	}
});

api.interceptors.request.use((config) => {
	if (typeof window !== 'undefined') {
		const token = localStorage.getItem('vaani_token');
		if (token) {
			config.headers.Authorization = `Bearer ${token}`;
		}
	}
	return config;
});

api.interceptors.response.use(
	(response) => response,
	(error) => {
		if (error.response?.status === 401 && typeof window !== 'undefined') {
			if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
				localStorage.removeItem('vaani_token');
				if (window.location.pathname.includes('/join/')) {
					sessionStorage.setItem('vaani_join_redirect', window.location.pathname);
				}
				window.location.href = '/login';
			}
		}
		return Promise.reject(error);
	}
);
