<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { callStore } from '$lib/stores/call.svelte';
	import { api } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import {
		X,
		Video,
		Phone,
		Link as LinkIcon,
		Copy,
		Check,
		Sparkles,
		ArrowRight,
		Users,
		Calendar
	} from 'lucide-svelte';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
	}

	let { isOpen = false, onClose }: Props = $props();

	let activeTab = $state<'create' | 'join'>('create');
	let meetingName = $state('');
	let callType = $state<'video' | 'audio'>('video');
	let isCreating = $state(false);

	let createdMeeting = $state<{
		call_id: string;
		call_room_id: string;
		room_id: string;
		room_name: string;
		call_type: 'video' | 'audio';
		join_link: string;
	} | null>(null);

	let isCopied = $state(false);
	let joinInput = $state('');
	let joinError = $state<string | null>(null);

	function reset() {
		meetingName = '';
		callType = 'video';
		isCreating = false;
		createdMeeting = null;
		isCopied = false;
		joinInput = '';
		joinError = null;
		activeTab = 'create';
	}

	function handleClose() {
		reset();
		onClose();
	}

	async function handleCreateMeeting(e: Event) {
		e.preventDefault();
		isCreating = true;
		try {
			const res = await api.post('/calls/meeting/instant', {
				meeting_name: meetingName.trim() || undefined,
				call_type: callType
			});
			createdMeeting = res.data;
		} catch (err: any) {
			alert('Failed to create meeting: ' + (err.response?.data?.error || err.message));
		} finally {
			isCreating = false;
		}
	}

	function getFullJoinUrl(slug: string): string {
		if (typeof window === 'undefined') return `/join/${slug}`;
		return `${window.location.origin}/join/${slug}`;
	}

	async function copyLink() {
		if (!createdMeeting) return;
		const url = getFullJoinUrl(createdMeeting.call_room_id);
		try {
			await navigator.clipboard.writeText(url);
			isCopied = true;
			setTimeout(() => (isCopied = false), 2500);
		} catch {
			const el = document.createElement('textarea');
			el.value = url;
			document.body.appendChild(el);
			el.select();
			document.execCommand('copy');
			document.body.removeChild(el);
			isCopied = true;
			setTimeout(() => (isCopied = false), 2500);
		}
	}

	function startCreatedMeeting() {
		if (!createdMeeting) return;
		const m = createdMeeting;
		handleClose();
		callStore.startOutgoingCall(m.room_name, m.call_room_id, m.call_type);
	}

	function handleJoinInput(e: Event) {
		e.preventDefault();
		joinError = null;
		let input = joinInput.trim();
		if (!input) return;

		// Extract slug from URL if full URL was pasted
		if (input.includes('/join/')) {
			const parts = input.split('/join/');
			input = parts[parts.length - 1].split('?')[0].split('#')[0];
		}

		if (input.length < 3) {
			joinError = 'Please enter a valid meeting code or link.';
			return;
		}

		handleClose();
		goto(`/join/${input}`);
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
		<div
			class="w-full max-w-md rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col"
		>
			<!-- Modal Header -->
			<div class="flex items-center justify-between px-6 py-5 border-b border-neutral-200 dark:border-neutral-800">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-md shadow-emerald-500/20 text-white font-bold">
						<Sparkles class="h-5 w-5" />
					</div>
					<div>
						<h3 class="text-base font-bold text-neutral-900 dark:text-white">Vaani Meetings</h3>
						<p class="text-xs text-neutral-500 dark:text-neutral-400">Instant multilingual audio & video conferences</p>
					</div>
				</div>

				<button
					onclick={handleClose}
					class="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Tab Switcher (Create vs Join) -->
			{#if !createdMeeting}
				<div class="grid grid-cols-2 p-2 bg-neutral-100 dark:bg-neutral-950/60 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold">
					<button
						type="button"
						onclick={() => (activeTab = 'create')}
						class="flex items-center justify-center gap-2 py-2 rounded-xl transition-all {activeTab === 'create'
							? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm font-bold'
							: 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'}"
					>
						<Video class="h-3.5 w-3.5 text-emerald-500" />
						<span>New Meeting</span>
					</button>

					<button
						type="button"
						onclick={() => (activeTab = 'join')}
						class="flex items-center justify-center gap-2 py-2 rounded-xl transition-all {activeTab === 'join'
							? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm font-bold'
							: 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'}"
					>
						<LinkIcon class="h-3.5 w-3.5 text-indigo-500" />
						<span>Join with Code</span>
					</button>
				</div>
			{/if}

			<!-- Modal Body -->
			<div class="p-6 space-y-5">
				{#if createdMeeting}
					<!-- Step 2: Meeting Created successfully -->
					<div class="space-y-4 animate-fade-in text-center">
						<div class="flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 mx-auto">
							<Check class="h-7 w-7" />
						</div>

						<div>
							<h4 class="text-base font-bold text-neutral-900 dark:text-white">{createdMeeting.room_name}</h4>
							<p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
								Your meeting is ready! Share this link with participants to join.
							</p>
						</div>

						<!-- Shareable Link Box -->
						<div class="flex items-center gap-2 rounded-2xl bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-2.5 text-left">
							<div class="flex-1 min-w-0 px-2 font-mono text-xs text-neutral-700 dark:text-neutral-300 truncate select-all">
								{getFullJoinUrl(createdMeeting.call_room_id)}
							</div>
							<button
								type="button"
								onclick={copyLink}
								class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-all active:scale-95"
							>
								{#if isCopied}
									<Check class="h-3.5 w-3.5" />
									<span>Copied!</span>
								{:else}
									<Copy class="h-3.5 w-3.5" />
									<span>Copy</span>
								{/if}
							</button>
						</div>

						<div class="flex items-center justify-center gap-3 pt-2">
							<button
								type="button"
								onclick={startCreatedMeeting}
								class="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all active:scale-95"
							>
								<Video class="h-4 w-4" />
								<span>Start Meeting Now</span>
							</button>

							<button
								type="button"
								onclick={handleClose}
								class="px-4 py-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-xs font-semibold transition"
							>
								Done
							</button>
						</div>
					</div>
				{:else if activeTab === 'create'}
					<!-- Mode A: Create Instant Meeting -->
					<form onsubmit={handleCreateMeeting} class="space-y-4">
						<div>
							<label for="meeting-name-input" class="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide mb-1.5">
								Meeting Title (Optional)
							</label>
							<input
								id="meeting-name-input"
								type="text"
								bind:value={meetingName}
								placeholder="e.g. Weekly Standup, Product Demo..."
								class="w-full rounded-2xl bg-neutral-100 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-all"
							/>
						</div>

						<div>
							<div class="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide mb-2">
								Meeting Type
							</div>
							<div class="grid grid-cols-2 gap-3">
								<button
									type="button"
									onclick={() => (callType = 'video')}
									class="flex items-center justify-center gap-2 p-3 rounded-2xl border transition-all {callType === 'video'
										? 'bg-emerald-50 dark:bg-emerald-600/20 border-emerald-500 text-emerald-800 dark:text-white font-bold'
										: 'bg-neutral-50 dark:bg-neutral-800/40 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'}"
								>
									<Video class="h-4 w-4 text-emerald-500" />
									<span class="text-xs">Video Call</span>
								</button>

								<button
									type="button"
									onclick={() => (callType = 'audio')}
									class="flex items-center justify-center gap-2 p-3 rounded-2xl border transition-all {callType === 'audio'
										? 'bg-emerald-50 dark:bg-emerald-600/20 border-emerald-500 text-emerald-800 dark:text-white font-bold'
										: 'bg-neutral-50 dark:bg-neutral-800/40 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'}"
								>
									<Phone class="h-4 w-4 text-emerald-500" />
									<span class="text-xs">Audio Only</span>
								</button>
							</div>
						</div>

						<p class="text-[11px] text-neutral-500 dark:text-neutral-400">
							Anyone with the link can join directly without installation. Real-time language translation is automatically enabled.
						</p>

						<button
							type="submit"
							disabled={isCreating}
							class="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50 active:scale-95"
						>
							{#if isCreating}
								<span>Creating Room...</span>
							{:else}
								<Sparkles class="h-4 w-4" />
								<span>Create Instant Meeting</span>
							{/if}
						</button>
					</form>
				{:else}
					<!-- Mode B: Join with Link or Code -->
					<form onsubmit={handleJoinInput} class="space-y-4">
						<div>
							<label for="join-code-input" class="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide mb-1.5">
								Enter Meeting Code or Link
							</label>
							<div class="relative">
								<input
									id="join-code-input"
									type="text"
									bind:value={joinInput}
									placeholder="e.g. meet-8a9b2c3d or https://..."
									class="w-full rounded-2xl bg-neutral-100 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-all"
								/>
							</div>
							{#if joinError}
								<p class="text-xs text-rose-500 mt-1.5">{joinError}</p>
							{/if}
						</div>

						<p class="text-[11px] text-neutral-500 dark:text-neutral-400">
							Paste the invite link or meeting code shared by the host to enter the conference room.
						</p>

						<button
							type="submit"
							disabled={!joinInput.trim()}
							class="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50 active:scale-95"
						>
							<span>Join Meeting</span>
							<ArrowRight class="h-4 w-4" />
						</button>
					</form>
				{/if}
			</div>
		</div>
	</div>
{/if}
