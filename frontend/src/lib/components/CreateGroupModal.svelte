<script lang="ts">
	import { chatStore } from '#lib/stores/chat.svelte';
	import { authStore } from '#lib/stores/auth.svelte';
	import { X, Users, Search, Check, Plus } from 'lucide-svelte';

	interface Props {
		isOpen: boolean;
		usersList: any[];
		onClose: () => void;
	}

	let { isOpen, usersList, onClose }: Props = $props();

	let groupName = $state('');
	let memberSearch = $state('');
	let selectedUserIds = $state<string[]>([]);
	let isSubmitting = $state(false);

	let availableUsers = $derived(
		usersList.filter(
			(u) =>
				u.id !== authStore.user?.id &&
				u.username.toLowerCase().includes(memberSearch.toLowerCase())
		)
	);

	function toggleUser(id: string) {
		if (selectedUserIds.includes(id)) {
			selectedUserIds = selectedUserIds.filter((item) => item !== id);
		} else {
			selectedUserIds = [...selectedUserIds, id];
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!groupName.trim() || selectedUserIds.length === 0) return;

		isSubmitting = true;
		try {
			await chatStore.createGroup(groupName.trim(), selectedUserIds);
			groupName = '';
			selectedUserIds = [];
			memberSearch = '';
			onClose();
		} catch (err) {
			console.error('Failed to create group:', err);
		} finally {
			isSubmitting = false;
		}
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
		<div class="w-full max-w-md rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 shadow-2xl flex flex-col max-h-[85vh]">
			<!-- Modal Header -->
			<div class="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
						<Users class="h-5 w-5" />
					</div>
					<div>
						<h3 class="text-base font-bold text-neutral-900 dark:text-white">Create New Group</h3>
						<p class="text-xs text-neutral-500 dark:text-neutral-400">Multilingual collaboration space</p>
					</div>
				</div>
				<button
					onclick={onClose}
					class="p-2 rounded-xl text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Form -->
			<form onsubmit={handleSubmit} class="flex flex-col flex-1 overflow-hidden mt-4 gap-4">
				<!-- Group Name -->
				<div>
					<label for="group-name-input" class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">Group Name</label>
					<input
						id="group-name-input"
						type="text"
						bind:value={groupName}
						placeholder="e.g. Core Engineering, Product Sync..."
						class="w-full rounded-2xl bg-neutral-100 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-all"
						required
					/>
				</div>

				<!-- Member Search & Selection -->
				<div class="flex flex-col flex-1 min-h-0">
					<div class="flex items-center justify-between mb-2">
						<span class="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
							Select Members ({selectedUserIds.length} selected)
						</span>
					</div>

					<div class="relative mb-2">
						<Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
						<input
							type="text"
							bind:value={memberSearch}
							placeholder="Search colleagues..."
							class="w-full rounded-xl bg-neutral-100 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/40 py-2 pl-9 pr-3 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-all"
						/>
					</div>

					<!-- Member List -->
					<div class="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-56">
						{#if availableUsers.length === 0}
							<div class="py-6 text-center text-xs text-neutral-500">No users found</div>
						{:else}
							{#each availableUsers as user (user.id)}
								{@const isSelected = selectedUserIds.includes(user.id)}
								<button
									type="button"
									onclick={() => toggleUser(user.id)}
									class="w-full text-left flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all {isSelected ? 'bg-emerald-50 dark:bg-emerald-600/15 border border-emerald-500/40 text-neutral-900 dark:text-white' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800/50 text-neutral-800 dark:text-neutral-300'}"
								>
									<div class="flex items-center gap-3">
										<div class="h-8 w-8 rounded-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center font-bold text-xs text-emerald-600 dark:text-emerald-400">
											{user.username[0]?.toUpperCase()}
										</div>
										<div>
											<div class="text-xs font-semibold text-neutral-900 dark:text-white">{user.username}</div>
											<div class="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase font-mono">{user.preferred_language || 'en'}</div>
										</div>
									</div>

									<div class="flex h-5 w-5 items-center justify-center rounded-lg border {isSelected ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800/50 text-transparent'}">
										<Check class="h-3 w-3 stroke-[3]" />
									</div>
								</button>
							{/each}
						{/if}
					</div>
				</div>

				<!-- Footer Buttons -->
				<div class="flex items-center justify-end gap-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
					<button
						type="button"
						onclick={onClose}
						class="px-4 py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700 text-xs font-semibold transition-all"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={!groupName.trim() || selectedUserIds.length === 0 || isSubmitting}
						class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<Plus class="h-4 w-4" />
						<span>{isSubmitting ? 'Creating...' : 'Create Group'}</span>
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
