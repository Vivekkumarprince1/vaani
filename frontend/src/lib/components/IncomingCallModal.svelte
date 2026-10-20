<script lang="ts">
	import { callStore } from '$lib/stores/call.svelte';
	import { callSounds } from '$lib/utils/callSounds';
	import { api } from '$lib/api/client';
	import { Phone, PhoneOff, Video } from 'lucide-svelte';

	$effect(() => {
		if (callStore.incomingCall) {
			callSounds.playRingtone();
			return () => {
				callSounds.stopAll();
			};
		}
	});

	function handleAnswer() {
		callSounds.stopAll();
		callSounds.playConnect();
		if (callStore.incomingCall) {
			const { call_room_id, call_type, is_group } = callStore.incomingCall;
			callStore.joinCall(call_room_id, call_type, is_group ?? false);
		}
	}

	function handleDecline() {
		callSounds.stopAll();
		callSounds.playDisconnect();
		if (callStore.incomingCall) {
			if (!callStore.incomingCall.is_group) {
				api.post('/calls/end', { call_room_id: callStore.incomingCall.call_room_id }).catch(() => {});
			}
			callStore.incomingCall = null;
		}
		callStore.leaveCall();
	}
</script>

{#if callStore.incomingCall}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4">
		<div class="w-full max-w-sm rounded-3xl bg-neutral-900 border border-neutral-800 p-6 shadow-2xl text-center">
			<!-- Pulsing Ring Indicator -->
			<div class="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center">
				<div class="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping"></div>
				<div class="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-500/30">
					{#if callStore.incomingCall.call_type === 'video'}
						<Video class="w-9 h-9" />
					{:else}
						<Phone class="w-9 h-9" />
					{/if}
				</div>
			</div>

			{#if callStore.incomingCall.is_group}
				<div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold mb-3">
					Group Call
				</div>
				<h3 class="text-xl font-bold text-white mb-1">
					{callStore.incomingCall.room_name || 'Group Call'}
				</h3>
				<p class="text-xs text-neutral-400 mb-8">
					Started by <span class="text-emerald-400 font-semibold">{callStore.incomingCall.initiator_name}</span> ({callStore.incomingCall.call_type} call)
				</p>
			{:else}
				<h3 class="text-xl font-bold text-white mb-1">
					{callStore.incomingCall.initiator_name}
				</h3>
				<p class="text-sm text-neutral-400 mb-8 capitalize">
					Incoming {callStore.incomingCall.call_type} Call with Live Translation...
				</p>
			{/if}

			<!-- Action Buttons -->
			<div class="flex items-center justify-center gap-6">
				<!-- Decline -->
				<button
					onclick={handleDecline}
					class="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-500 active:scale-95 transition-all shadow-lg shadow-rose-600/30"
					title="Decline"
				>
					<PhoneOff class="w-6 h-6" />
				</button>

				<!-- Answer -->
				<button
					onclick={handleAnswer}
					class="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95 transition-all shadow-lg shadow-emerald-600/30"
					title="Answer"
				>
					<Phone class="w-6 h-6" />
				</button>
			</div>
		</div>
	</div>
{/if}
