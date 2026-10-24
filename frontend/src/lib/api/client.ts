import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080/api';

const configuredWSBase = import.meta.env.VITE_WS_BASE || 'ws://localhost:8080/ws';

// Browsers block ws:// connections from an https:// page. Keep deployments
// resilient to a stale Vercel environment variable by upgrading the scheme
// at connection time; the canonical production value remains wss:// in Vercel.
export function getWebSocketBase(): string {
	const value = configuredWSBase;
	if (typeof window !== 'undefined' && window.location.protocol === 'https:' && value.startsWith('ws://')) {
		return `wss://${value.slice('ws://'.length)}`;
	}
	return value;
}

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
	if (config.data instanceof FormData) {
		delete config.headers['Content-Type'];
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
