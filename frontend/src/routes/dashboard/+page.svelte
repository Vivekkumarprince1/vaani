<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '#lib/stores/auth.svelte';
	import { chatStore, type Room } from '#lib/stores/chat.svelte';
	import { callStore } from '#lib/stores/call.svelte';
	import { themeStore } from '#lib/stores/theme.svelte';
	import { settingsStore } from '#lib/stores/settings.svelte';
	import { api } from '#lib/api/client';
	import CreateGroupModal from '#lib/components/CreateGroupModal.svelte';
	import GroupInfoModal from '#lib/components/GroupInfoModal.svelte';
	import UserSettingsModal from '#lib/components/UserSettingsModal.svelte';
	import MeetingModal from '#lib/components/MeetingModal.svelte';
	import {
		Video,
		Phone,
		Send,
		ShieldAlert,
		LogOut,
		Plus,
		MessageSquare,
		Sparkles,
		Globe,
		Search,
		Users,
		Info,
		Hash,
		User as UserIcon,
		Sun,
		Moon,
		Sliders,
		Zap
	} from 'lucide-svelte';

	let messageText = $state('');
	let usersList = $state<any[]>([]);
	let searchQuery = $state('');
	let activeTab = $state<'chats' | 'direct' | 'groups' | 'people'>('chats');
	let messagesContainer = $state<HTMLDivElement | null>(null);

	let isCreateGroupOpen = $state(false);
	let isGroupInfoOpen = $state(false);
	let isSettingsOpen = $state(false);
	let isMeetingModalOpen = $state(false);

	$effect(() => {
		if (chatStore.messages.length && messagesContainer) {
			setTimeout(() => {
				if (messagesContainer) {
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
				}
			}, 30);
		}
	});

	onMount(async () => {
		await chatStore.fetchRooms();
		loadUsers();
	});

	async function loadUsers() {
		try {
			const res = await api.get('/auth/users');
			usersList = res.data;
		} catch (err) {
			console.error('Failed to load users:', err);
		}
	}

	async function handleSendMessage(e: Event) {
		e.preventDefault();
		if (!messageText.trim()) return;
		const text = messageText;
		messageText = '';
		await chatStore.sendMessage(text, authStore.user?.preferred_language || 'en');
	}

	async function startCall(callType: 'audio' | 'video' = 'video') {
		if (!chatStore.activeRoom) return;

		try {
			const res = await api.post('/calls/initiate', {
				room_id: chatStore.activeRoom.id,
				call_type: callType
			});
			const { call_room_id, is_group } = res.data;
			callStore.startOutgoingCall(
				chatStore.activeRoom.name,
				call_room_id,
				callType,
				is_group ?? (chatStore.activeRoom.type === 'group')
			);
		} catch (err) {
			console.error('Failed to initiate call:', err);
		}
	}

	async function startDirectCallToUser(targetUser: any, callType: 'audio' | 'video' = 'video') {
		try {
			const res = await api.post('/calls/initiate', {
				target_user_id: targetUser.id,
				call_type: callType
			});
			const { call_room_id } = res.data;
			callStore.startOutgoingCall(targetUser.username, call_room_id, callType);
		} catch (err) {
			console.error('Failed to initiate direct call:', err);
		}
	}

	async function createOrOpenDirectRoom(targetUser: any) {
		try {
			const res = await api.post('/chat/rooms', {
				name: targetUser.username,
				type: 'direct',
				participant_ids: [targetUser.id]
			});
			await chatStore.fetchRooms();
			const selected = chatStore.rooms.find((r) => r.id === res.data.id) || res.data;
			activeTab = 'direct';
			chatStore.selectRoom(selected);
		} catch (err) {
			console.error('Failed to open room:', err);
		}
	}

	function startInstantGroupCall() {
		const instantSlug = 'instant_' + Math.random().toString(36).substring(2, 9);
		callStore.startOutgoingCall('Instant Meeting', instantSlug, 'video');
	}

	// Filtered lists
	let filteredChats = $derived(
		chatStore.rooms.filter((r) =>
			(r.name || '').toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	let filteredDirectChats = $derived(
		chatStore.rooms.filter(
			(r) =>
				r.type === 'direct' &&
				(r.name || '').toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	let filteredGroups = $derived(
		chatStore.rooms.filter(
			(r) =>
				r.type === 'group' &&
				(r.name || '').toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	let filteredUsers = $derived(
		usersList.filter(
			(u) =>
				u.id !== authStore.user?.id &&
				(u.username || '').toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	let myLang = $derived(authStore.user?.preferred_language || 'en');
	let isSameLanguageAsOther = $derived.by(() => {
		if (chatStore.activeRoom?.type === 'direct') {
			const other = chatStore.activeRoom.other_user?.preferred_language;
			return Boolean(other && other.toLowerCase() === myLang.toLowerCase());
		}
		if (chatStore.activeMembers.length > 1) {
			return chatStore.activeMembers.every(
				(m) => (m.preferred_language || 'en').toLowerCase() === myLang.toLowerCase()
			);
		}
		return false;
	});
</script>

<div class="flex h-screen w-screen overflow-hidden bg-neutral-100 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 transition-colors">
	<!-- Left Navigation Sidebar -->
	<aside class="flex w-84 flex-col border-r border-neutral-200 dark:border-neutral-800/80 bg-white dark:bg-neutral-900/40 backdrop-blur-md">
		<!-- App Brand & User Header -->
		<div class="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800/80 p-5">
			<div class="flex items-center gap-3">
				<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-md shadow-emerald-500/20 text-white font-bold">
					<Sparkles class="h-5 w-5" />
				</div>
				<div>
					<h2 class="text-sm font-bold text-neutral-900 dark:text-white leading-tight">Vaani v2</h2>
					<p class="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Real-Time Multilingual</p>
				</div>
			</div>

			<div class="flex items-center gap-1.5">
				<!-- Theme Toggle -->
				<button
					onclick={() => themeStore.toggle()}
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all"
					title={themeStore.current === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
				>
					{#if themeStore.current === 'dark'}
						<Sun class="h-4 w-4 text-amber-400" />
					{:else}
						<Moon class="h-4 w-4 text-neutral-700" />
					{/if}
				</button>

				<!-- Settings -->
				<button
					onclick={() => (isSettingsOpen = true)}
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all"
					title="User Settings"
				>
					<Sliders class="h-4 w-4" />
				</button>

				{#if authStore.isAdmin}
					<a
						href="/admin"
						class="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all"
						title="Admin Control Room"
					>
						<ShieldAlert class="h-4 w-4" />
					</a>
				{/if}

				<button
					onclick={() => authStore.logout()}
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-rose-100 dark:hover:bg-rose-950/40 text-neutral-500 dark:text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 transition-all"
					title="Sign Out"
				>
					<LogOut class="h-4 w-4" />
				</button>
			</div>
		</div>

		<!-- User Profile Pill & Quick Actions -->
		<div class="p-4 border-b border-neutral-200 dark:border-neutral-800/40 flex items-center justify-between bg-neutral-50 dark:bg-neutral-900/20">
			<div class="flex items-center gap-3">
				<div class="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center font-bold text-emerald-700 dark:text-emerald-400 text-sm">
					{authStore.user?.username[0]?.toUpperCase() || 'U'}
				</div>
				<div>
					<div class="text-xs font-semibold text-neutral-900 dark:text-white">{authStore.user?.username}</div>
					<button
						onclick={() => (isSettingsOpen = true)}
						class="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-400 transition"
						title="Click to change language"
					>
						<Globe class="h-2.5 w-2.5 text-emerald-500" />
						<span class="uppercase font-mono font-bold">{authStore.user?.preferred_language || 'en'}</span>
						<span class="text-[9px] underline">Change</span>
					</button>
				</div>
			</div>

			<!-- Instant Meet Button -->
			<button
				onclick={() => (isMeetingModalOpen = true)}
				class="flex items-center gap-1.5 rounded-xl bg-emerald-600/10 dark:bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600/20 dark:hover:bg-emerald-600/30 transition-all cursor-pointer"
				title="Start or Join Instant Meeting"
			>
				<Plus class="h-3.5 w-3.5" />
				<span>Meet</span>
			</button>
		</div>

		<!-- Navigation Tabs: All | Direct | Groups | People -->
		<div class="grid grid-cols-4 p-1.5 bg-neutral-100 dark:bg-neutral-900/40 border-b border-neutral-200 dark:border-neutral-800/60 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
			<button
				onclick={() => (activeTab = 'chats')}
				class="flex items-center justify-center gap-1 py-1.5 rounded-xl transition-all {activeTab === 'chats' ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm font-bold' : 'hover:text-neutral-900 dark:hover:text-neutral-200'}"
			>
				<MessageSquare class="h-3 w-3" />
				<span>All</span>
			</button>
			<button
				onclick={() => (activeTab = 'direct')}
				class="flex items-center justify-center gap-1 py-1.5 rounded-xl transition-all {activeTab === 'direct' ? 'bg-white dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 shadow-sm font-bold' : 'hover:text-neutral-900 dark:hover:text-neutral-200'}"
			>
				<UserIcon class="h-3 w-3" />
				<span>Direct</span>
			</button>
			<button
				onclick={() => (activeTab = 'groups')}
				class="flex items-center justify-center gap-1 py-1.5 rounded-xl transition-all {activeTab === 'groups' ? 'bg-white dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 shadow-sm font-bold' : 'hover:text-neutral-900 dark:hover:text-neutral-200'}"
			>
				<Users class="h-3 w-3" />
				<span>Groups</span>
			</button>
			<button
				onclick={() => (activeTab = 'people')}
				class="flex items-center justify-center gap-1 py-1.5 rounded-xl transition-all {activeTab === 'people' ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm font-bold' : 'hover:text-neutral-900 dark:hover:text-neutral-200'}"
			>
				<Globe class="h-3 w-3" />
				<span>People</span>
			</button>
		</div>

		<!-- Search Input -->
		<div class="p-3">
			<div class="relative">
				<Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
				<input
					type="text"
					bind:value={searchQuery}
					placeholder={activeTab === 'groups' ? 'Search groups...' : activeTab === 'direct' ? 'Search personal chats...' : activeTab === 'people' ? 'Search directory...' : 'Search all conversations...'}
					class="w-full rounded-xl bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/50 py-2 pl-9 pr-3 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-all"
				/>
			</div>
		</div>

		<!-- Main Sidebar Content by Tab -->
		<div class="flex-1 overflow-y-auto px-2 space-y-1">
			<!-- TAB 1: ALL CHATS -->
			{#if activeTab === 'chats'}
				<div class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
					Recent Conversations ({filteredChats.length})
				</div>

				{#if filteredChats.length === 0}
					<div class="p-6 text-center text-xs text-neutral-500">
						No conversations yet.<br />
						Start one in Direct or Groups!
					</div>
				{:else}
					{#each filteredChats as room (room.id)}
						{@const isSelected = chatStore.activeRoom?.id === room.id}
						{@const isGroup = room.type === 'group'}
						<button
							type="button"
							onclick={() => chatStore.selectRoom(room)}
							class="w-full text-left group flex items-center justify-between rounded-2xl p-2.5 transition-all cursor-pointer {isSelected ? 'bg-emerald-50 dark:bg-emerald-600/15 border border-emerald-500/30' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800/50'}"
						>
							<div class="flex items-center gap-3 min-w-0">
								<div class="relative flex-shrink-0">
									{#if isGroup}
										<div class="h-10 w-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center font-bold text-xs text-emerald-700 dark:text-emerald-400">
											<Users class="h-4 w-4" />
										</div>
									{:else}
										<div class="h-10 w-10 rounded-2xl bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700/60 flex items-center justify-center font-bold text-xs text-neutral-800 dark:text-neutral-200">
											{room.name[0]?.toUpperCase() || 'U'}
										</div>
										{#if room.other_user}
											<span class="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full {room.other_user.status === 'online' ? 'bg-emerald-500' : 'bg-neutral-400'} border-2 border-white dark:border-neutral-900"></span>
										{/if}
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<div class="flex items-center justify-between">
										<h4 class="font-semibold text-xs text-neutral-900 dark:text-white truncate">{room.name}</h4>
										<span class="text-[10px] text-neutral-500 font-mono">
											{new Date(room.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
										</span>
									</div>
									<p class="text-[11px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
										{room.last_message || (isGroup ? 'Group channel' : 'Direct message')}
									</p>
								</div>
							</div>
						</button>
					{/each}
				{/if}

			<!-- TAB 2: DIRECT / PERSONAL MESSAGES -->
			{:else if activeTab === 'direct'}
				<div class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
					Personal Messages ({filteredDirectChats.length})
				</div>

				{#if filteredDirectChats.length === 0}
					<div class="p-6 text-center text-xs text-neutral-500">
						No direct chats yet.<br />
						Select a person in the <strong class="text-emerald-500 font-bold">People</strong> tab!
					</div>
				{:else}
					{#each filteredDirectChats as room (room.id)}
						{@const isSelected = chatStore.activeRoom?.id === room.id}
						<button
							type="button"
							onclick={() => chatStore.selectRoom(room)}
							class="w-full text-left group flex items-center justify-between rounded-2xl p-2.5 transition-all cursor-pointer {isSelected ? 'bg-emerald-50 dark:bg-emerald-600/15 border border-emerald-500/30' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800/50'}"
						>
							<div class="flex items-center gap-3 min-w-0">
								<div class="relative flex-shrink-0">
									<div class="h-10 w-10 rounded-2xl bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700/60 flex items-center justify-center font-bold text-xs text-neutral-800 dark:text-neutral-200">
										{room.name[0]?.toUpperCase() || 'U'}
									</div>
									{#if room.other_user}
										<span class="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full {room.other_user.status === 'online' ? 'bg-emerald-500' : 'bg-neutral-400'} border-2 border-white dark:border-neutral-900"></span>
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<div class="flex items-center justify-between">
										<h4 class="font-semibold text-xs text-neutral-900 dark:text-white truncate">{room.name}</h4>
										{#if room.other_user}
											<span class="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
												{room.other_user.preferred_language || 'en'}
											</span>
										{/if}
									</div>
									<p class="text-[11px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
										{room.last_message || 'Start private conversation...'}
									</p>
								</div>
							</div>
						</button>
					{/each}
				{/if}

			<!-- TAB 3: GROUPS -->
			{:else if activeTab === 'groups'}
				<div class="flex items-center justify-between px-3 py-1.5">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
						My Groups ({filteredGroups.length})
					</span>
					<button
						onclick={() => (isCreateGroupOpen = true)}
						class="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500"
					>
						<Plus class="h-3 w-3" />
						<span>New</span>
					</button>
				</div>

				{#if filteredGroups.length === 0}
					<div class="p-6 text-center text-xs text-neutral-500">
						No groups joined.<br />
						Create one using the button above!
					</div>
				{:else}
					{#each filteredGroups as group (group.id)}
						{@const isSelected = chatStore.activeRoom?.id === group.id}
						<button
							type="button"
							onclick={() => chatStore.selectRoom(group)}
							class="w-full text-left group flex items-center justify-between rounded-2xl p-2.5 transition-all cursor-pointer {isSelected ? 'bg-emerald-50 dark:bg-emerald-600/15 border border-emerald-500/30' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800/50'}"
						>
							<div class="flex items-center gap-3 min-w-0">
								<div class="h-10 w-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center font-bold text-xs text-emerald-700 dark:text-emerald-400">
									<Users class="h-4 w-4" />
								</div>
								<div class="min-w-0 flex-1">
									<div class="flex items-center justify-between">
										<h4 class="font-semibold text-xs text-neutral-900 dark:text-white truncate">{group.name}</h4>
										<span class="rounded-full bg-neutral-200 dark:bg-neutral-800 px-1.5 py-0.2 text-[9px] text-neutral-600 dark:text-neutral-400">
											{group.member_count || 1} members
										</span>
									</div>
									<p class="text-[11px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
										{group.last_message || 'Group channel'}
									</p>
								</div>
							</div>
						</button>
					{/each}
				{/if}

			<!-- TAB 4: PEOPLE / DIRECTORY -->
			{:else if activeTab === 'people'}
				<div class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
					Online Directory ({filteredUsers.length})
				</div>

				{#each filteredUsers as user (user.id)}
					<div
						class="group flex items-center justify-between rounded-2xl p-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-all cursor-pointer"
						role="button"
						tabindex="0"
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								createOrOpenDirectRoom(user);
							}
						}}
						onclick={() => createOrOpenDirectRoom(user)}
					>
						<div class="flex items-center gap-3">
							<div class="relative">
								<div class="h-9 w-9 rounded-2xl bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700/60 flex items-center justify-center text-xs font-semibold text-neutral-700 dark:text-neutral-300">
									{user.username[0]?.toUpperCase()}
								</div>
								<span class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full {user.status === 'online' ? 'bg-emerald-500' : 'bg-neutral-400'} border-2 border-white dark:border-neutral-900"></span>
							</div>
							<div>
								<div class="text-xs font-semibold text-neutral-900 dark:text-neutral-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">{user.username}</div>
								<div class="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase font-mono">{user.preferred_language || 'en'}</div>
							</div>
						</div>

						<!-- Quick Direct Call Buttons -->
						<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
							<button
								type="button"
								onclick={(e) => {
									e.stopPropagation();
									startDirectCallToUser(user, 'audio');
								}}
								class="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
								title="Audio Call"
							>
								<Phone class="h-3.5 w-3.5" />
							</button>
							<button
								type="button"
								onclick={(e) => {
									e.stopPropagation();
									startDirectCallToUser(user, 'video');
								}}
								class="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400"
								title="Video Call"
							>
								<Video class="h-3.5 w-3.5" />
							</button>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</aside>

	<!-- Main Chat & Interaction Area -->
	<main class="flex flex-1 flex-col bg-neutral-50 dark:bg-neutral-950">
		{#if chatStore.activeRoom}
			{@const isGroup = chatStore.activeRoom.type === 'group'}
			<!-- Chat Header -->
			<div class="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800/80 px-6 py-4 bg-white/80 dark:bg-neutral-900/30 backdrop-blur-md">
				<div class="flex items-center gap-3">
					<div class="relative">
						<div class="h-11 w-11 rounded-2xl {isGroup ? 'bg-emerald-100 dark:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30' : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-white border border-neutral-300 dark:border-neutral-700'} flex items-center justify-center font-bold text-sm">
							{#if isGroup}
								<Users class="h-5 w-5" />
							{:else}
								{chatStore.activeRoom.name[0]?.toUpperCase() || 'R'}
							{/if}
						</div>
					</div>

					<div>
						<div class="flex items-center gap-2">
							<h3 class="text-sm font-bold text-neutral-900 dark:text-white">{chatStore.activeRoom.name}</h3>
							{#if isGroup}
								<span class="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
									Group ({chatStore.activeMembers.length || chatStore.activeRoom.member_count || 1})
								</span>
							{:else}
								<span class="px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-[10px] font-bold text-neutral-600 dark:text-neutral-400 uppercase font-mono">
									Direct
								</span>
							{/if}
						</div>

						{#if isGroup}
							<button
								onclick={() => (isGroupInfoOpen = true)}
								class="text-[11px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 font-medium flex items-center gap-1 mt-0.5"
							>
								<Info class="h-3 w-3" />
								<span>View group members & languages</span>
							</button>
						{:else}
							<div class="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium flex items-center gap-2 mt-0.5">
								<span class="flex items-center gap-1">
									<Globe class="h-3 w-3 text-emerald-500 dark:text-emerald-400" />
									<span>Language: <strong class="uppercase font-mono text-emerald-600 dark:text-emerald-400">{chatStore.activeRoom.other_user?.preferred_language || 'en'}</strong></span>
								</span>
								<span>•</span>
								{#if isSameLanguageAsOther}
									<span class="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
										<Zap class="h-3 w-3" /> Same language (Native)
									</span>
								{:else}
									<span class="text-indigo-600 dark:text-indigo-400 font-semibold">
										Auto-translating to {myLang.toUpperCase()}
									</span>
								{/if}
							</div>
						{/if}
					</div>
				</div>

				<!-- Call Controls & Group Info -->
				<div class="flex items-center gap-3">
					{#if isGroup}
						<button
							onclick={() => (isGroupInfoOpen = true)}
							class="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm"
							title="Group Settings & Members"
						>
							<Users class="h-4 w-4" />
						</button>
					{/if}

					<button
						onclick={() => startCall('audio')}
						class="flex items-center gap-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 px-3.5 py-2.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 transition-all shadow-sm"
						title={isGroup ? 'Ring all group members (Audio)' : 'Audio Call'}
					>
						<Phone class="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
						<span>{isGroup ? 'Group Audio' : 'Audio Call'}</span>
					</button>

					<button
						onclick={() => startCall('video')}
						class="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-all shadow-md shadow-emerald-600/25 active:scale-95"
						title={isGroup ? 'Ring all group members (Video)' : 'Video Call'}
					>
						<Video class="h-4 w-4" />
						<span>{isGroup ? 'Start Group Call' : 'Video Call'}</span>
					</button>
				</div>
			</div>

			<!-- Messages Stream -->
			<div bind:this={messagesContainer} class="flex-1 overflow-y-auto p-6 space-y-4">
				{#if chatStore.messages.length === 0}
					<div class="flex flex-col items-center justify-center h-full text-center text-neutral-500">
						<MessageSquare class="h-10 w-10 mb-2 opacity-40 text-emerald-500" />
						<div class="text-sm font-bold text-neutral-700 dark:text-neutral-300">No messages yet</div>
						<div class="text-xs text-neutral-500">Send a message below. It will automatically translate into {chatStore.activeRoom.name}'s preferred language!</div>
					</div>
				{:else}
					{#each chatStore.messages as msg (msg.id)}
						{@const isSelf = msg.sender_id === authStore.user?.id}
						{@const translatedText = msg.translations?.[myLang] || Object.values(msg.translations || {})[0]}
						{@const hasTranslation = Boolean(translatedText && translatedText !== msg.original_text)}

						<div class="flex {isSelf ? 'justify-end' : 'justify-start'} animate-fade-in">
							<div class="max-w-[70%] rounded-2xl p-4 {isSelf ? 'bg-emerald-600 text-white rounded-br-none shadow-md shadow-emerald-600/10' : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 rounded-bl-none shadow-sm'}">
								{#if !isSelf}
									<div class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1.5">
										<span>{msg.sender_name}</span>
										<span class="text-[9px] uppercase font-mono text-neutral-400">({msg.original_language})</span>
									</div>
								{/if}

								<!-- Display translated or original text -->
								{#if !isSelf && hasTranslation && settingsStore.preferences.autoTranslateChat}
									<p class="text-sm font-medium leading-relaxed">{translatedText}</p>
									<div class="mt-2 pt-2 border-t border-neutral-200 dark:border-white/10 text-xs text-neutral-500 dark:text-neutral-400 italic flex items-start gap-1.5">
										<Globe class="h-3 w-3 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
										<span>Original ({msg.original_language.toUpperCase()}): "{msg.original_text}"</span>
									</div>
								{:else}
									<p class="text-sm leading-relaxed">{msg.original_text}</p>
									{#if hasTranslation}
										<div class="mt-2 pt-2 border-t border-neutral-200 dark:border-white/10 text-xs text-neutral-500 dark:text-neutral-300 italic flex items-start gap-1.5">
											<Globe class="h-3 w-3 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
											<span>Translated: {translatedText}</span>
										</div>
									{:else}
										<button
											onclick={async () => {
												const target = myLang === 'hi' ? 'hi' : 'en';
												try {
													const res = await api.post(`/chat/messages/${msg.id}/translate`, { target_language: target });
													if (res.data?.translated_text) {
														msg.translations = { ...(msg.translations || {}), [target]: res.data.translated_text };
													}
												} catch (e) {
													console.warn('On-demand translate error:', e);
												}
											}}
											class="mt-2 text-[11px] font-semibold text-emerald-500 dark:text-emerald-400 hover:underline flex items-center gap-1 opacity-85 hover:opacity-100 transition-all cursor-pointer"
										>
											<Globe class="h-3 w-3" />
											<span>Translate</span>
										</button>
									{/if}
								{/if}

								<div class="mt-1 text-[10px] text-right opacity-60">
									{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Message Composer Input -->
			<form onsubmit={handleSendMessage} class="border-t border-neutral-200 dark:border-neutral-800/80 p-4 bg-white dark:bg-neutral-900/30">
				<div class="flex items-center gap-3">
					<input
						type="text"
						bind:value={messageText}
						placeholder={isGroup ? `Message ${chatStore.activeRoom.name} in your language...` : `Type message in your language (auto-translates for ${chatStore.activeRoom.name})...`}
						class="flex-1 rounded-2xl bg-neutral-100 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-all"
					/>
					<button
						type="submit"
						class="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white hover:bg-emerald-500 transition-all shadow-md shadow-emerald-600/20 active:scale-95"
					>
						<Send class="h-4 w-4" />
					</button>
				</div>
			</form>
		{:else}
			<!-- Empty State -->
			<div class="flex flex-1 flex-col items-center justify-center p-8 text-center text-neutral-500">
				<div class="flex h-16 w-16 items-center justify-center rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-emerald-500 mb-4 shadow-xl">
					<MessageSquare class="h-8 w-8" />
				</div>
				<h3 class="text-base font-bold text-neutral-900 dark:text-white mb-1">Select a Conversation or Group</h3>
				<p class="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mb-6">
					Connect with colleagues across languages in 1-on-1 personal chats or collaborative groups. Live audio, video, and text translate in real time.
				</p>
				<div class="flex items-center gap-3">
					<button
						onclick={() => (isCreateGroupOpen = true)}
						class="flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-xs font-semibold text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-500 transition-all active:scale-95"
					>
						<Users class="h-4 w-4" />
						<span>Create Multilingual Group</span>
					</button>
					<button
						onclick={() => (isMeetingModalOpen = true)}
						class="flex items-center gap-2 rounded-2xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-5 py-3 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all active:scale-95 cursor-pointer"
					>
						<Video class="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
						<span>Instant Meeting</span>
					</button>
				</div>
			</div>
		{/if}
	</main>
</div>

<!-- Modals -->
<CreateGroupModal
	isOpen={isCreateGroupOpen}
	{usersList}
	onClose={() => (isCreateGroupOpen = false)}
/>

<GroupInfoModal
	isOpen={isGroupInfoOpen}
	{usersList}
	onClose={() => (isGroupInfoOpen = false)}
/>

<UserSettingsModal
	isOpen={isSettingsOpen}
	onClose={() => (isSettingsOpen = false)}
/>

<MeetingModal
	isOpen={isMeetingModalOpen}
	onClose={() => (isMeetingModalOpen = false)}
/>
