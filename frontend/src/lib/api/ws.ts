import { getWebSocketBase } from './client';

export type WSEventHandler = (payload: any) => void;

class WebSocketClient {
	private socket: WebSocket | null = null;
	private handlers = new Map<string, Set<WSEventHandler>>();
	private reconnectTimer: any = null;
	private pingInterval: any = null;
	private isManualClose = false;
	private retryCount = 0;

	connect() {
		if (typeof window === 'undefined') return;

		const token = localStorage.getItem('vaani_token');
		if (!token) return;

		this.isManualClose = false;

		if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
			return;
		}

		const wsUrl = `${getWebSocketBase()}?token=${encodeURIComponent(token)}`;
		this.socket = new WebSocket(wsUrl);

		this.socket.onopen = () => {
			console.log('⚡ Connected to Vaani v2 WebSocket Gateway');
			this.retryCount = 0;
			this.startHeartbeat();
		};

		this.socket.onmessage = (event) => {
			if (!event.data || typeof event.data !== 'string') return;
			const lines = event.data.split('\n');
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				try {
					const data = JSON.parse(trimmed);
					if (data.type) {
						const listeners = this.handlers.get(data.type);
						if (listeners) {
							listeners.forEach((fn) => fn(data.payload));
						}
					}
				} catch (err) {
					console.error('WS parse error:', err);
				}
			}
		};

		this.socket.onclose = () => {
			this.stopHeartbeat();
			if (!this.isManualClose) {
				const delay = Math.min(1000 * Math.pow(1.5, this.retryCount), 10000) + Math.random() * 500;
				this.retryCount++;
				this.reconnectTimer = setTimeout(() => this.connect(), delay);
			}
		};

		this.socket.onerror = (err) => {
			console.warn('WS error:', err);
		};
	}

	disconnect() {
		this.isManualClose = true;
		this.retryCount = 0;
		this.stopHeartbeat();
		clearTimeout(this.reconnectTimer);
		if (this.socket) {
			this.socket.close();
			this.socket = null;
		}
	}

	on(eventType: string, handler: WSEventHandler) {
		if (!this.handlers.has(eventType)) {
			this.handlers.set(eventType, new Set());
		}
		this.handlers.get(eventType)!.add(handler);

		return () => {
			this.handlers.get(eventType)?.delete(handler);
		};
	}

	send(eventType: string, payload: any) {
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(
				JSON.stringify({
					type: eventType,
					payload,
					timestamp: Date.now()
				})
			);
		}
	}

	private startHeartbeat() {
		this.pingInterval = setInterval(() => {
			this.send('ping', {});
		}, 20000);
	}

	private stopHeartbeat() {
		clearInterval(this.pingInterval);
	}
}

export const wsClient = new WebSocketClient();
