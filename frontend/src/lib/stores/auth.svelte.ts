import { api } from '#lib/api/client';
import { wsClient } from '#lib/api/ws';

export interface User {
	id: string;
	username: string;
	email: string;
	role: 'user' | 'admin' | 'superadmin';
	preferred_language: string;
	status: string;
}

class AuthStore {
	user = $state<User | null>(null);
	token = $state<string | null>(null);
	isLoading = $state<boolean>(true);

	isAuthenticated = $derived(!!this.token && !!this.user);
	isAdmin = $derived(this.user?.role === 'admin' || this.user?.role === 'superadmin');
	isSuperadmin = $derived(this.user?.role === 'superadmin');

	init() {
		if (typeof window === 'undefined') return;
		const savedToken = localStorage.getItem('vaani_token');
		if (savedToken) {
			this.token = savedToken;
			this.fetchMe();
		} else {
			this.isLoading = false;
		}
	}

	async fetchMe() {
		try {
			const res = await api.get('/auth/me');
			this.user = res.data;
			wsClient.connect();
		} catch (err) {
			this.logout();
		} finally {
			this.isLoading = false;
		}
	}

	async login(identifier: string, password: string) {
		const res = await api.post('/auth/login', { identifier, password });
		this.token = res.data.token;
		this.user = res.data.user;
		localStorage.setItem('vaani_token', res.data.token);
		wsClient.connect();
		return res.data;
	}

	async register(data: { username: string; email: string; password: string; preferred_language: string }) {
		const res = await api.post('/auth/register', data);
		this.token = res.data.token;
		this.user = res.data.user;
		localStorage.setItem('vaani_token', res.data.token);
		wsClient.connect();
		return res.data;
	}

	async updateLanguage(language: string) {
		if (!this.user) return;
		await api.put('/auth/language', { language });
		this.user.preferred_language = language;
	}

	logout() {
		this.user = null;
		this.token = null;
		localStorage.removeItem('vaani_token');
		wsClient.disconnect();
	}
}

export const authStore = new AuthStore();
