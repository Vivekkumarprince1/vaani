<script lang="ts">
	import { chatStore, type Room, type RoomMember } from '$lib/stores/chat.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { X, Users, Globe, Shield, UserMinus, UserPlus, Trash2, LogOut, Edit2, Check } from 'lucide-svelte';

	interface Props {
		isOpen: boolean;
		usersList: any[];
		onClose: () => void;
	}

	let { isOpen, usersList, onClose }: Props = $props();

	let isAddingMember = $state(false);
	let selectedUserToAdd = $state('');
	let isEditingName = $state(false);
	let newGroupName = $state('');

	let activeRoom = $derived(chatStore.activeRoom);
	let members = $derived(chatStore.activeMembers);

	let isOwner = $derived(
		members.find((m) => m.user_id === authStore.user?.id)?.role === 'owner' ||
		activeRoom?.created_by === authStore.user?.id
	);

	let isAdminOrOwner = $derived(
		isOwner || members.find((m) => m.user_id === authStore.user?.id)?.role === 'admin'
	);

	let nonMembers = $derived(
		usersList.filter((u) => !members.some((m) => m.user_id === u.id))
	);

	async function handleAddMember() {
		if (!activeRoom || !selectedUserToAdd) return;
		await chatStore.addMembers(activeRoom.id, [selectedUserToAdd]);
		selectedUserToAdd = '';
		isAddingMember = false;
	}

	async function handleRemoveMember(userId: string) {
		if (!activeRoom) return;
		if (confirm('Are you sure you want to remove this member?')) {
			await chatStore.removeMember(activeRoom.id, userId);
		}
	}

	async function handleLeaveGroup() {
		if (!activeRoom || !authStore.user) return;
		if (confirm('Are you sure you want to leave this group?')) {
			await chatStore.removeMember(activeRoom.id, authStore.user.id);
			onClose();
		}
	}

	async function handleDeleteGroup() {
		if (!activeRoom) return;
		if (confirm('Are you sure you want to permanently disband and delete this group? All chat history will be removed.')) {
			await chatStore.deleteGroup(activeRoom.id);
			onClose();
		}
	}

	async function handleSaveName() {
		if (!activeRoom || !newGroupName.trim()) return;
		await chatStore.updateGroupName(activeRoom.id, newGroupName.trim());
		isEditingName = false;
	}

	function startEditName() {
		if (activeRoom) {
			newGroupName = activeRoom.name;
			isEditingName = true;
		}
	}
</script>

{#if isOpen && activeRoom}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
		<div class="w-full max-w-lg rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 shadow-2xl flex flex-col max-h-[85vh]">
			<!-- Header -->
			<div class="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
				<div class="flex items-center gap-3">
					<div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-lg font-bold">
						{activeRoom.name[0]?.toUpperCase() || 'G'}
					</div>
					<div>
						{#if isEditingName}
							<div class="flex items-center gap-2">
								<input
									type="text"
									bind:value={newGroupName}
									class="rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 px-3 py-1 text-sm text-neutral-900 dark:text-white focus:outline-none focus:border-emerald-500"
								/>
								<button
									onclick={handleSaveName}
									class="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
								>
									<Check class="h-4 w-4" />
								</button>
							</div>
						{:else}
							<div class="flex items-center gap-2">
								<h3 class="text-base font-bold text-neutral-900 dark:text-white">{activeRoom.name}</h3>
								{#if isAdminOrOwner}
									<button
										onclick={startEditName}
										class="p-1 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
										title="Rename Group"
									>
										<Edit2 class="h-3 w-3" />
									</button>
								{/if}
							</div>
						{/if}
						<p class="text-xs text-neutral-500 dark:text-neutral-400">
							{members.length} {members.length === 1 ? 'member' : 'members'} • Multilingual Group
						</p>
					</div>
				</div>

				<button
					onclick={onClose}
					class="p-2 rounded-xl text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Member List Section -->
			<div class="flex-1 overflow-y-auto mt-4 space-y-4">
				<div class="flex items-center justify-between">
					<h4 class="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
						Group Members ({members.length})
					</h4>
					{#if isAdminOrOwner && !isAddingMember && nonMembers.length > 0}
						<button
							onclick={() => (isAddingMember = true)}
							class="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 font-semibold"
						>
							<UserPlus class="h-3.5 w-3.5" />
							<span>Add Member</span>
						</button>
					{/if}
				</div>

				<!-- Add Member Inline Bar -->
				{#if isAddingMember}
					<div class="flex items-center gap-2 p-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60">
						<select
							bind:value={selectedUserToAdd}
							class="flex-1 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-xs text-neutral-900 dark:text-white focus:outline-none focus:border-emerald-500"
						>
							<option value="">Select a user to invite...</option>
							{#each nonMembers as u (u.id)}
								<option value={u.id}>{u.username} ({u.preferred_language || 'en'})</option>
							{/each}
						</select>
						<button
							onclick={handleAddMember}
							disabled={!selectedUserToAdd}
							class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50"
						>
							Add
						</button>
						<button
							onclick={() => (isAddingMember = false)}
							class="p-2 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
						>
							<X class="h-3.5 w-3.5" />
						</button>
					</div>
				{/if}

				<!-- Members List -->
				<div class="space-y-2">
					{#each members as member (member.user_id)}
						{@const isCurrentMemberSelf = member.user_id === authStore.user?.id}
						<div class="flex items-center justify-between p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800/80 hover:bg-neutral-100 dark:hover:bg-neutral-800/60 transition-all">
							<div class="flex items-center gap-3">
								<div class="relative">
									<div class="h-9 w-9 rounded-xl bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center font-bold text-xs text-emerald-600 dark:text-emerald-400 border border-neutral-300 dark:border-neutral-700">
										{member.username[0]?.toUpperCase()}
									</div>
									<span class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full {member.status === 'online' ? 'bg-emerald-500' : 'bg-neutral-400'} border-2 border-white dark:border-neutral-900"></span>
								</div>

								<div>
									<div class="flex items-center gap-2">
										<span class="text-xs font-bold text-neutral-900 dark:text-white">{member.username}</span>
										{#if isCurrentMemberSelf}
											<span class="text-[10px] text-neutral-500 dark:text-neutral-400 italic">(You)</span>
										{/if}
									</div>
									<div class="flex items-center gap-2 mt-0.5">
										<span class="inline-flex items-center gap-1 text-[10px] text-neutral-500 dark:text-neutral-400 uppercase font-mono">
											<Globe class="h-2.5 w-2.5 text-emerald-500 dark:text-emerald-400" />
											{member.preferred_language || 'en'}
										</span>
									</div>
								</div>
							</div>

							<div class="flex items-center gap-2">
								<!-- Role Badge -->
								{#if member.role === 'owner'}
									<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
										<Shield class="h-2.5 w-2.5" />
										Owner
									</span>
								{:else if member.role === 'admin'}
									<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-600 dark:text-amber-400">
										Admin
									</span>
								{:else}
									<span class="text-[10px] text-neutral-500 font-medium">Member</span>
								{/if}

								<!-- Remove Button -->
								{#if isAdminOrOwner && !isCurrentMemberSelf && member.role !== 'owner'}
									<button
										onclick={() => handleRemoveMember(member.user_id)}
										class="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all ml-1"
										title="Remove Member"
									>
										<UserMinus class="h-3.5 w-3.5" />
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Footer Danger Actions -->
			<div class="flex items-center justify-between pt-4 mt-4 border-t border-neutral-200 dark:border-neutral-800">
				<button
					onclick={handleLeaveGroup}
					class="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-neutral-700 dark:text-neutral-300 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-semibold transition-all"
				>
					<LogOut class="h-3.5 w-3.5" />
					<span>Leave Group</span>
				</button>

				{#if isOwner}
					<button
						onclick={handleDeleteGroup}
						class="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold transition-all"
					>
						<Trash2 class="h-3.5 w-3.5" />
						<span>Disband Group</span>
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
