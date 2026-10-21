import { api } from '#lib/api/client';
import { wsClient } from '#lib/api/ws';

export interface UserSummary {
	id: string;
	username: string;
	email: string;
	preferred_language: string;
	status: string;
	avatar_url?: string;
}

export interface Room {
	id: string;
	name: string;
	room_slug: string;
	type: 'direct' | 'group';
	role?: 'owner' | 'admin' | 'member';
	member_count?: number;
	created_by?: string;
	created_at: string;
	updated_at: string;
	last_message?: string;
	other_user?: UserSummary;
}

export interface RoomMember {
	room_id: string;
	user_id: string;
	username: string;
	email: string;
	role: 'owner' | 'admin' | 'member';
	preferred_language: string;
	status: string;
	avatar_url?: string;
	joined_at: string;
}

export interface Message {
	id: string;
	room_id: string;
	sender_id: string;
	sender_name: string;
	original_text: string;
	original_language: string;
	translations: Record<string, string>;
	media?: any;
	status: string;
	created_at: string;
}

class ChatStore {
	rooms = $state<Room[]>([]);
	activeRoom = $state<Room | null>(null);
	activeMembers = $state<RoomMember[]>([]);
	messages = $state<Message[]>([]);
	isLoading = $state<boolean>(false);
	isLoadingMembers = $state<boolean>(false);

	initListeners() {
		wsClient.on('presence_change', (presence: { user_id: string; status: string }) => {
			this.rooms = this.rooms.map((room) =>
				room.other_user?.id === presence.user_id
					? { ...room, other_user: { ...room.other_user, status: presence.status } }
					: room
			);
			this.activeMembers = this.activeMembers.map((member) =>
				member.user_id === presence.user_id ? { ...member, status: presence.status } : member
			);
		});

		wsClient.on('chat_message', (msg: Message) => {
			if (this.activeRoom && msg.room_id === this.activeRoom.id) {
				this.messages = [...this.messages, msg];
			}
			// Update last message in room list
			const target = this.rooms.find((r) => r.id === msg.room_id);
			if (target) {
				target.last_message = msg.original_text;
				target.updated_at = msg.created_at;
			}
		});

		wsClient.on('room_created', () => {
			this.fetchRooms();
		});

		wsClient.on('room_members_updated', (data: { room_id: string }) => {
			this.fetchRooms();
			if (this.activeRoom && this.activeRoom.id === data.room_id) {
				this.fetchMembers(this.activeRoom.id);
			}
		});

		wsClient.on('room_updated', (data: { room_id: string; name: string }) => {
			this.fetchRooms();
			if (this.activeRoom && this.activeRoom.id === data.room_id) {
				this.activeRoom.name = data.name;
			}
		});

		wsClient.on('room_deleted', (data: { room_id: string }) => {
			if (this.activeRoom && this.activeRoom.id === data.room_id) {
				this.activeRoom = null;
				this.messages = [];
				this.activeMembers = [];
			}
			this.fetchRooms();
		});

		wsClient.on('chat_message_translation', (data: { message_id: string; room_id: string; translations: Record<string, string> }) => {
			const idx = this.messages.findIndex((m) => m.id === data.message_id);
			if (idx !== -1) {
				this.messages[idx].translations = {
					...(this.messages[idx].translations || {}),
					...data.translations
				};
			}
		});
	}

	async fetchRooms() {
		try {
			const res = await api.get('/chat/rooms');
			this.rooms = res.data;
		} catch (err) {
			console.error('Failed to fetch rooms:', err);
		}
	}

	async selectRoom(room: Room) {
		this.activeRoom = room;
		this.isLoading = true;
		try {
			const res = await api.get(`/chat/rooms/${room.id}/messages`);
			this.messages = res.data.reverse();

			if (room.type === 'group') {
				await this.fetchMembers(room.id);
			} else {
				this.activeMembers = [];
			}
		} catch (err) {
			console.error('Failed to fetch messages:', err);
		} finally {
			this.isLoading = false;
		}
	}

	async fetchMembers(roomId: string) {
		this.isLoadingMembers = true;
		try {
			const res = await api.get(`/chat/rooms/${roomId}/members`);
			this.activeMembers = res.data;
		} catch (err) {
			console.error('Failed to fetch members:', err);
		} finally {
			this.isLoadingMembers = false;
		}
	}

	async createGroup(name: string, participantIds: string[]): Promise<Room | null> {
		try {
			const res = await api.post('/chat/rooms', {
				name,
				type: 'group',
				participant_ids: participantIds
			});
			await this.fetchRooms();
			const newRoom = this.rooms.find((r) => r.id === res.data.id) || res.data;
			this.selectRoom(newRoom);
			return newRoom;
		} catch (err) {
			console.error('Failed to create group:', err);
			return null;
		}
	}

	async addMembers(roomId: string, userIds: string[]) {
		try {
			await api.post(`/chat/rooms/${roomId}/members`, { user_ids: userIds });
			await this.fetchMembers(roomId);
			await this.fetchRooms();
		} catch (err) {
			console.error('Failed to add members:', err);
		}
	}

	async removeMember(roomId: string, userId: string) {
		try {
			await api.delete(`/chat/rooms/${roomId}/members/${userId}`);
			await this.fetchMembers(roomId);
			await this.fetchRooms();
		} catch (err) {
			console.error('Failed to remove member:', err);
		}
	}

	async updateGroupName(roomId: string, name: string) {
		try {
			await api.put(`/chat/rooms/${roomId}`, { name });
			if (this.activeRoom && this.activeRoom.id === roomId) {
				this.activeRoom.name = name;
			}
			await this.fetchRooms();
		} catch (err) {
			console.error('Failed to update group name:', err);
		}
	}

	async deleteGroup(roomId: string) {
		try {
			await api.delete(`/chat/rooms/${roomId}`);
			if (this.activeRoom && this.activeRoom.id === roomId) {
				this.activeRoom = null;
				this.messages = [];
				this.activeMembers = [];
			}
			await this.fetchRooms();
		} catch (err) {
			console.error('Failed to delete group:', err);
		}
	}

	async sendMessage(text: string, currentLanguage: string) {
		if (!this.activeRoom || !text.trim()) return;

		try {
			const res = await api.post(`/chat/rooms/${this.activeRoom.id}/messages`, {
				text,
				original_language: currentLanguage
			});
			this.messages = [...this.messages, res.data];
		} catch (err) {
			console.error('Failed to send message:', err);
		}
	}
}

export const chatStore = new ChatStore();
