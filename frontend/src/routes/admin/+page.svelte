<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '#lib/api/client';
	import { authStore } from '#lib/stores/auth.svelte';
	import { themeStore } from '#lib/stores/theme.svelte';
	import ProvidersTab from '#lib/components/admin/ProvidersTab.svelte';
	import {
		Cpu,
		Sliders,
		Users,
		Activity,
		ToggleLeft,
		ToggleRight,
		Save,
		ArrowLeft,
		CheckCircle2,
		PhoneCall,
		PhoneOff,
		RefreshCw,
		Layers,
		Zap,
		Sun,
		Moon,
		Mic,
		MicOff,
		Video,
		VideoOff,
		Server,
		Radio,
		Globe,
		Clock
	} from 'lucide-svelte';

	let activeTab = $state<'providers' | 'rooms' | 'audio' | 'features' | 'users' | 'metrics'>('providers');
	let config = $state<any>(null);
	let metrics = $state<any>(null);
	let liveRooms = $state<any[]>([]);
	let sfuInfo = $state<any>(null);
	let usersList = $state<any[]>([]);
	let isSaving = $state(false);
	let saveSuccess = $state(false);
	let terminatingId = $state<string | null>(null);
	let pollInterval: any = null;

	onMount(() => {
		loadConfig();
		loadMetrics();
		loadLiveRooms();
		loadUsers();

		// Real-time dynamic sync for Live Calls & Metrics
		pollInterval = setInterval(() => {
			if (activeTab === 'rooms') {
				loadLiveRooms();
			} else if (activeTab === 'metrics') {
				loadMetrics();
			}
		}, 3000);

		return () => {
			if (pollInterval) clearInterval(pollInterval);
		};
	});

	async function loadConfig() {
		try {
			const res = await api.get('/admin/config');
			config = res.data;
		} catch (err) {
			console.error('Failed to load admin config:', err);
		}
	}

	async function loadMetrics() {
		try {
			const res = await api.get('/admin/metrics');
			metrics = res.data;
		} catch (err) {
			console.error('Failed to load metrics:', err);
		}
	}

	async function loadLiveRooms() {
		try {
			const res = await api.get('/admin/rooms');
			liveRooms = res.data.rooms || [];
			sfuInfo = res.data.sfu || null;
		} catch (err) {
			console.error('Failed to load live rooms:', err);
		}
	}

	async function loadUsers() {
		try {
			const res = await api.get('/admin/users');
			usersList = res.data;
		} catch (err) {
			console.error('Failed to load users:', err);
		}
	}

	async function saveCategory(category: string, data: any, activeKey: string = 'default') {
		isSaving = true;
		saveSuccess = false;
		try {
			await api.put(`/admin/config/${category}`, {
				active_key: activeKey,
				config: data
			});
			saveSuccess = true;
			setTimeout(() => (saveSuccess = false), 3000);
		} catch (err) {
			alert('Failed to save settings: ' + err);
		} finally {
			isSaving = false;
		}
	}

	async function toggleUserStatus(user: any) {
		const newStatus = !user.is_active;
		try {
			await api.patch(`/admin/users/${user.id}/status`, { isActive: newStatus });
			user.is_active = newStatus;
		} catch (err: any) {
			alert('Failed to update user status: ' + (err.response?.data?.error || err.message));
		}
	}

	async function updateUserRole(user: any, newRole: string) {
		try {
			await api.patch(`/admin/users/${user.id}/role`, { role: newRole });
			user.role = newRole;
		} catch (err: any) {
			alert('Failed to update role: ' + (err.response?.data?.error || err.message));
		}
	}

	async function terminateRoom(room: any) {
		const targetSlug = room.callRoomId || room.id;
		if (!confirm(`Are you sure you want to forcibly terminate live call room "${room.roomName || targetSlug}"?`)) return;
		terminatingId = room.id;
		try {
			await api.delete(`/admin/rooms/${targetSlug}`);
			liveRooms = liveRooms.filter((r) => r.id !== room.id && r.callRoomId !== targetSlug);
			await loadMetrics();
		} catch (err: any) {
			alert('Failed to terminate call: ' + (err.response?.data?.error || err.message));
		} finally {
			terminatingId = null;
		}
	}

	function formatDuration(sec: number): string {
		if (!sec || sec < 0) return '00:00';
		const m = Math.floor(sec / 60);
		const s = Math.floor(sec % 60);
		return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	}
</script>

<div class="min-h-screen bg-neutral-100 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 p-4 sm:p-8 transition-colors duration-200">
	<div class="max-w-6xl mx-auto space-y-6">
		<!-- Top Bar -->
		<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800/80 pb-6">
			<div class="flex items-center gap-4">
				<a
					href="/dashboard"
					class="flex h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-all shadow-xs shrink-0 cursor-pointer"
					title="Back to Dashboard"
				>
					<ArrowLeft class="h-5 w-5" />
				</a>
				<div>
					<div class="flex items-center gap-2">
						<h1 class="text-xl font-bold text-neutral-900 dark:text-white">Superadmin Control Room</h1>
						<span class="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
							Hot-Reload Engine
						</span>
					</div>
					<p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Manage AI providers, real-time SFU call channels, DSP tuning, and RBAC permissions</p>
				</div>
			</div>

			<div class="flex items-center gap-3">
				<!-- Theme Toggle Button -->
				<button
					onclick={() => themeStore.toggle()}
					class="flex h-10 px-3 items-center gap-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 transition-all shadow-xs text-xs font-semibold cursor-pointer"
					title={themeStore.current === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
				>
					{#if themeStore.current === 'dark'}
						<Sun class="h-4 w-4 text-amber-400" />
						<span class="hidden sm:inline">Light Mode</span>
					{:else}
						<Moon class="h-4 w-4 text-indigo-600" />
						<span class="hidden sm:inline">Dark Mode</span>
					{/if}
				</button>

				{#if saveSuccess}
					<div class="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 animate-fade-in shadow-xs">
						<CheckCircle2 class="h-4 w-4" />
						<span>Applied & Synced to Live Nodes</span>
					</div>
				{/if}
			</div>
		</div>

		<!-- Navigation Tabs -->
		<div class="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800/60 pb-3 overflow-x-auto">
			<button
				onclick={() => (activeTab = 'providers')}
				class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all {activeTab === 'providers' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'}"
			>
				<Cpu class="h-4 w-4" />
				<span>AI Providers & Models</span>
			</button>

			<button
				onclick={() => { activeTab = 'rooms'; loadLiveRooms(); }}
				class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all {activeTab === 'rooms' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'}"
			>
				<PhoneCall class="h-4 w-4" />
				<span>Live Calls & SFU ({liveRooms.length})</span>
				{#if liveRooms.length > 0}
					<span class="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
				{/if}
			</button>

			<button
				onclick={() => (activeTab = 'audio')}
				class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all {activeTab === 'audio' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'}"
			>
				<Sliders class="h-4 w-4" />
				<span>Audio & DSP Tuning</span>
			</button>

			<button
				onclick={() => (activeTab = 'features')}
				class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all {activeTab === 'features' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'}"
			>
				<ToggleRight class="h-4 w-4" />
				<span>Feature Flags</span>
			</button>

			<button
				onclick={() => { activeTab = 'users'; loadUsers(); }}
				class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all {activeTab === 'users' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'}"
			>
				<Users class="h-4 w-4" />
				<span>User Directory ({usersList.length})</span>
			</button>

			<button
				onclick={() => { activeTab = 'metrics'; loadMetrics(); }}
				class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all {activeTab === 'metrics' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'}"
			>
				<Activity class="h-4 w-4" />
				<span>Live Metrics</span>
			</button>
		</div>

		<!-- TAB 1: AI Providers & Models -->
		{#if activeTab === 'providers'}
			<ProvidersTab
				isSuperAdmin={authStore.user?.role === 'superadmin'}
				onConfigUpdated={() => loadMetrics()}
			/>
		{/if}

		<!-- TAB 2: Live Call Room Monitoring & Real-Time SFU Channels -->
		{#if activeTab === 'rooms'}
			<div class="space-y-6">
				<!-- SFU Cluster Status Card -->
				<div class="rounded-3xl bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 p-6 backdrop-blur-md shadow-xs space-y-4">
					<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
						<div class="flex items-center gap-3">
							<div class="h-10 w-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
								<Server class="h-5 w-5" />
							</div>
							<div>
								<div class="flex items-center gap-2">
									<h3 class="text-sm font-bold text-neutral-900 dark:text-white">Active SFU Cluster & Media Routing</h3>
									<span class="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
										<span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
										{sfuInfo?.status || 'Online'}
									</span>
								</div>
								<p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
									{sfuInfo?.cluster || 'LiveKit Cloud (Auto-Routed Selective Forwarding Unit)'}
								</p>
							</div>
						</div>

						<div class="flex items-center gap-3">
							<div class="flex items-center gap-1 text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
								<Clock class="w-3.5 h-3.5" />
								<span>Live Sync • auto 3s</span>
							</div>

							<button
								onclick={loadLiveRooms}
								class="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-semibold transition cursor-pointer"
							>
								<RefreshCw class="w-3.5 h-3.5" />
								<span>Refresh Now</span>
							</button>
						</div>
					</div>

					<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
						<div class="p-3 bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800/80 rounded-2xl text-center">
							<span class="text-[10px] uppercase font-bold text-neutral-500 dark:text-neutral-400">Active Channels</span>
							<div class="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{sfuInfo?.totalActiveRooms ?? liveRooms.length}</div>
						</div>

						<div class="p-3 bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800/80 rounded-2xl text-center">
							<span class="text-[10px] uppercase font-bold text-neutral-500 dark:text-neutral-400">Connected Peers</span>
							<div class="text-xl font-black text-indigo-600 dark:text-indigo-400 font-mono mt-0.5">{sfuInfo?.totalParticipants ?? liveRooms.reduce((acc, r) => acc + (r.numParticipants || 1), 0)}</div>
						</div>

						<div class="p-3 bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800/80 rounded-2xl text-center">
							<span class="text-[10px] uppercase font-bold text-neutral-500 dark:text-neutral-400">Audio/VAD Stream</span>
							<div class="text-xl font-black text-teal-600 dark:text-teal-400 font-mono mt-0.5">Active</div>
						</div>

						<div class="p-3 bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800/80 rounded-2xl text-center">
							<span class="text-[10px] uppercase font-bold text-neutral-500 dark:text-neutral-400">Target Latency</span>
							<div class="text-xl font-black text-neutral-900 dark:text-neutral-100 font-mono mt-0.5">&lt; 350ms</div>
						</div>
					</div>
				</div>

				<!-- Live Call Rooms List -->
				<div class="rounded-3xl bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 p-6 space-y-5 backdrop-blur-md shadow-xs">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
								<PhoneCall class="h-4 w-4 text-emerald-500" />
								<span>Live Call Sessions & SFU Routers</span>
							</h3>
							<p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Real-time inspection of active voice/video translation rooms and LiveKit SFU routers.</p>
						</div>
					</div>

					{#if liveRooms.length === 0}
						<div class="p-12 text-center border border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-2 bg-neutral-50/50 dark:bg-neutral-950/30">
							<div class="text-3xl">📡</div>
							<div class="text-xs font-bold text-neutral-700 dark:text-neutral-300">LiveKit SFU Ready — No Active Calls Right Now</div>
							<div class="text-[11px] text-neutral-500 max-w-sm mx-auto">
								Live call sessions will instantly populate here in real-time as users start direct or group audio/video calls.
							</div>
						</div>
					{:else}
						<div class="overflow-x-auto">
							<table class="w-full text-left text-xs">
								<thead class="bg-neutral-100 dark:bg-neutral-950/80 text-[10px] font-semibold uppercase text-neutral-600 dark:text-neutral-400 tracking-wider">
									<tr>
										<th class="p-3">Room Name / ID</th>
										<th class="p-3">Type</th>
										<th class="p-3">Initiator</th>
										<th class="p-3">Duration</th>
										<th class="p-3">Live Participants</th>
										<th class="p-3">Status</th>
										<th class="p-3 text-right">Emergency Control</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-neutral-200 dark:divide-neutral-800/40">
									{#each liveRooms as room (room.id)}
										<tr class="hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors">
											<td class="p-3">
												<div class="font-bold text-neutral-900 dark:text-white">{room.roomName || 'Direct Session'}</div>
												<div class="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">{room.callRoomId}</div>
											</td>

											<td class="p-3">
												<span class="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase {room.callType === 'video' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'}">
													{room.callType === 'video' ? '📹 Video' : '🎙️ Audio'}
												</span>
											</td>

											<td class="p-3 font-medium text-neutral-800 dark:text-neutral-200">
												{room.initiatorName}
											</td>

											<td class="p-3 font-mono text-neutral-600 dark:text-neutral-400">
												<div class="flex items-center gap-1">
													<Clock class="w-3 h-3 text-neutral-400" />
													<span>{formatDuration(room.durationSeconds)}</span>
												</div>
											</td>

											<td class="p-3">
												<div class="flex flex-wrap items-center gap-1.5">
													{#if room.participants && room.participants.length > 0}
														{#each room.participants as p}
															<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700" title="Participant: {p.name} ({p.language})">
																<span>{p.name}</span>
																<span class="text-[9px] uppercase px-1 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 font-bold">{p.language}</span>
																{#if p.isAudioPublished}
																	<Mic class="w-3 h-3 text-emerald-500" />
																{:else}
																	<MicOff class="w-3 h-3 text-neutral-400" />
																{/if}
																{#if p.isVideoPublished}
																	<Video class="w-3 h-3 text-indigo-500" />
																{/if}
															</span>
														{/each}
													{:else}
														<span class="text-[11px] text-neutral-500">
															{room.numParticipants} active peer{room.numParticipants > 1 ? 's' : ''}
														</span>
													{/if}
												</div>
											</td>

											<td class="p-3">
												<span class="inline-flex items-center gap-1.5 text-[11px] font-semibold {room.status === 'active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}">
													<span class="h-2 w-2 rounded-full {room.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}"></span>
													<span class="capitalize">{room.status}</span>
												</span>
											</td>

											<td class="p-3 text-right">
												<button
													onclick={() => terminateRoom(room)}
													disabled={terminatingId === room.id}
													class="px-3 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ml-auto disabled:opacity-50 cursor-pointer"
													title="Force disconnect all WebRTC peers and end session"
												>
													<PhoneOff class="w-3.5 h-3.5" />
													<span>{terminatingId === room.id ? 'Terminating...' : 'Terminate Call'}</span>
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- TAB 3: Audio & DSP Tuning -->
		{#if activeTab === 'audio' && config}
			<div class="rounded-3xl bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 p-6 space-y-6 backdrop-blur-md shadow-xs">
				<h3 class="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
					<Sliders class="h-4 w-4 text-emerald-500" />
					<span>Audio DSP & VAD Latency Tuning</span>
				</h3>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<!-- VAD Energy Threshold -->
					<div class="rounded-2xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800/80 p-5 space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">VAD Energy Threshold</span>
							<span class="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">{config.audio_dsp.vad_energy_threshold}</span>
						</div>
						<input
							type="range"
							min="50"
							max="500"
							bind:value={config.audio_dsp.vad_energy_threshold}
							class="w-full accent-emerald-500 cursor-pointer"
						/>
						<p class="text-[11px] text-neutral-500">Lower values capture softer whispers; higher values cut background room noise.</p>
					</div>

					<!-- Silence Duration -->
					<div class="rounded-2xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800/80 p-5 space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">Silence Pause Before Translate (ms)</span>
							<span class="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">{config.audio_dsp.silence_duration_ms} ms</span>
						</div>
						<input
							type="range"
							min="200"
							max="1000"
							step="50"
							bind:value={config.audio_dsp.silence_duration_ms}
							class="w-full accent-emerald-500 cursor-pointer"
						/>
						<p class="text-[11px] text-neutral-500">How long speaker must pause before sentence triggers STT and translation.</p>
					</div>

					<!-- Ducking Ratio -->
					<div class="rounded-2xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800/80 p-5 space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">Audio Ducking Ratio</span>
							<span class="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">{Math.round(config.audio_dsp.ducking_ratio * 100)}%</span>
						</div>
						<input
							type="range"
							min="0.05"
							max="0.5"
							step="0.05"
							bind:value={config.audio_dsp.ducking_ratio}
							class="w-full accent-emerald-500 cursor-pointer"
						/>
						<p class="text-[11px] text-neutral-500">Volume level to duck raw speaker audio to while translated voice is speaking.</p>
					</div>

					<!-- Preferred Sample Rate -->
					<div class="rounded-2xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800/80 p-5 space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">Audio Sample Rate</span>
							<span class="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">{config.audio_dsp.preferred_sample_rate} Hz</span>
						</div>
						<select
							bind:value={config.audio_dsp.preferred_sample_rate}
							class="w-full rounded-xl bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 p-2.5 text-xs text-neutral-900 dark:text-white focus:outline-none"
						>
							<option value={16000}>16,000 Hz (Optimal for AI STT)</option>
							<option value={48000}>48,000 Hz (High Definition Opus)</option>
						</select>
						<p class="text-[11px] text-neutral-500">16kHz matches Whisper/Azure raw input, reducing bandwidth by 66%.</p>
					</div>
				</div>

				<div class="flex justify-end pt-4 border-t border-neutral-200 dark:border-neutral-800/60">
					<button
						onclick={() => saveCategory('audio_dsp', config.audio_dsp)}
						disabled={isSaving}
						class="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
					>
						<Save class="h-4 w-4" />
						<span>Save Audio Settings</span>
					</button>
				</div>
			</div>
		{/if}

		<!-- TAB 4: Feature Flags -->
		{#if activeTab === 'features' && config}
			<div class="rounded-3xl bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 p-6 space-y-6 backdrop-blur-md shadow-xs">
				<h3 class="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
					<ToggleRight class="h-4 w-4 text-emerald-500" />
					<span>System Feature Flags</span>
				</h3>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					{#each Object.entries(config.feature_flags) as [key, val]}
						<div class="flex items-center justify-between rounded-2xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800/80 p-4">
							<div>
								<div class="text-xs font-bold text-neutral-900 dark:text-white capitalize">{key.replace(/_/g, ' ')}</div>
								<div class="text-[10px] text-neutral-500">Global system feature state</div>
							</div>
							<button
								onclick={() => (config.feature_flags[key] = !config.feature_flags[key])}
								class="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer {config.feature_flags[key] ? 'bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-500'}"
							>
								{#if config.feature_flags[key]}
									<ToggleRight class="h-4 w-4" />
									<span>Enabled</span>
								{:else}
									<ToggleLeft class="h-4 w-4" />
									<span>Disabled</span>
								{/if}
							</button>
						</div>
					{/each}
				</div>

				<div class="flex justify-end pt-4 border-t border-neutral-200 dark:border-neutral-800/60">
					<button
						onclick={() => saveCategory('feature_flags', config.feature_flags)}
						disabled={isSaving}
						class="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
					>
						<Save class="h-4 w-4" />
						<span>Update Feature Flags</span>
					</button>
				</div>
			</div>
		{/if}

		<!-- TAB 5: User Directory & RBAC -->
		{#if activeTab === 'users'}
			<div class="rounded-3xl bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 p-6 space-y-4 backdrop-blur-md shadow-xs">
				<h3 class="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
					<Users class="h-4 w-4 text-emerald-500" />
					<span>User Accounts & RBAC Roles</span>
				</h3>

				<div class="overflow-x-auto">
					<table class="w-full text-left text-xs">
						<thead class="bg-neutral-100 dark:bg-neutral-950/80 text-[10px] font-semibold uppercase text-neutral-600 dark:text-neutral-400 tracking-wider">
							<tr>
								<th class="p-3">User</th>
								<th class="p-3">Email</th>
								<th class="p-3">Language</th>
								<th class="p-3">Role</th>
								<th class="p-3">Status</th>
								<th class="p-3 text-right">Action</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-neutral-200 dark:divide-neutral-800/40">
							{#each usersList as u (u.id)}
								<tr class="hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors">
									<td class="p-3 font-medium text-neutral-900 dark:text-white">{u.username}</td>
									<td class="p-3 text-neutral-500 dark:text-neutral-400">{u.email}</td>
									<td class="p-3 uppercase font-mono text-emerald-600 dark:text-emerald-400">{u.preferred_language}</td>
									<td class="p-3">
										<select
											value={u.role}
											onchange={(e) => updateUserRole(u, (e.target as HTMLSelectElement).value)}
											class="rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 px-2 py-1 text-[11px] text-neutral-900 dark:text-white focus:outline-none"
										>
											<option value="user">User</option>
											<option value="admin">Admin</option>
											<option value="superadmin">Superadmin</option>
										</select>
									</td>
									<td class="p-3">
										<span class="rounded-full px-2 py-0.5 text-[10px] font-semibold {u.is_active ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}">
											{u.is_active ? 'Active' : 'Suspended'}
										</span>
									</td>
									<td class="p-3 text-right">
										<button
											onclick={() => toggleUserStatus(u)}
											class="text-xs font-semibold cursor-pointer {u.is_active ? 'text-rose-600 dark:text-rose-400 hover:underline' : 'text-emerald-600 dark:text-emerald-400 hover:underline'}"
										>
											{u.is_active ? 'Suspend' : 'Activate'}
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}

		<!-- TAB 6: Live Metrics -->
		{#if activeTab === 'metrics' && metrics}
			<div class="space-y-6">
				<!-- High-Level Numbers -->
				<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
					<div class="rounded-3xl bg-white dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 p-6 backdrop-blur-md shadow-xs">
						<div class="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Total Users</div>
						<div class="text-3xl font-black text-neutral-900 dark:text-white font-mono">{metrics.metrics?.totalUsers ?? 0}</div>
					</div>
					<div class="rounded-3xl bg-white dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 p-6 backdrop-blur-md shadow-xs">
						<div class="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Online Users</div>
						<div class="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{metrics.metrics?.onlineUsers ?? 0}</div>
					</div>
					<div class="rounded-3xl bg-white dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 p-6 backdrop-blur-md shadow-xs">
						<div class="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Active Call Rooms</div>
						<div class="text-3xl font-black text-teal-600 dark:text-teal-400 font-mono">{metrics.metrics?.activeCalls ?? 0}</div>
					</div>
					<div class="rounded-3xl bg-white dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 p-6 backdrop-blur-md shadow-xs">
						<div class="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Total Chat Messages</div>
						<div class="text-3xl font-black text-indigo-600 dark:text-indigo-400 font-mono">{metrics.metrics?.totalMessages ?? 0}</div>
					</div>
				</div>

				<!-- Active Provider Engine Badges -->
				{#if metrics.activeProviders}
					<div class="rounded-3xl bg-white dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 p-6 space-y-4 backdrop-blur-md shadow-xs">
						<div class="flex items-center justify-between">
							<h4 class="text-xs font-extrabold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
								<Activity class="w-4 h-4 text-emerald-500" />
								<span>Active Real-Time AI Pipeline Stack</span>
							</h4>
							<span class="text-[10px] font-mono text-neutral-500">Live Server State</span>
						</div>

						<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
							{#each Object.entries(metrics.activeProviders) as [stage, prov]: [string, any]}
								<div class="p-3 bg-neutral-50 dark:bg-neutral-950/70 border border-neutral-200 dark:border-neutral-800 rounded-2xl text-center space-y-1">
									<div class="text-[10px] uppercase font-bold text-neutral-500 dark:text-neutral-400 tracking-wider">{stage}</div>
									<div class="text-xs font-mono font-black text-emerald-600 dark:text-emerald-400 uppercase truncate">{prov}</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
