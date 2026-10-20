<script lang="ts">
	import { callStore } from '#lib/stores/call.svelte';
	import { Languages } from 'lucide-svelte';

	// Get latest active subtitles (last 2 for clean readability)
	let activeSubtitles = $derived(callStore.subtitles.slice(-2));
</script>

{#if activeSubtitles.length > 0}
	<div class="pointer-events-none absolute bottom-24 inset-x-0 z-30 flex flex-col items-center gap-2 px-4">
		{#each activeSubtitles as sub (sub.id || sub.timestamp)}
			<div class="max-w-2xl rounded-2xl bg-black/80 border border-white/10 px-5 py-3 shadow-2xl backdrop-blur-md transition-all animate-fade-in text-center">
				<div class="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-400 mb-1">
					<Languages class="w-3.5 h-3.5" />
					<span>{sub.speakerName}</span>
					<span class="text-neutral-500">•</span>
					<span class="text-neutral-400 uppercase">{sub.language}</span>
				</div>
				<!-- Translated Primary Text -->
				<p class="text-base font-medium text-white leading-snug">
					{sub.translatedText || sub.originalText}
				</p>
				<!-- Original speech hint if translated -->
				{#if sub.translatedText && sub.originalText && sub.translatedText !== sub.originalText}
					<p class="text-xs text-neutral-400 mt-1 italic opacity-80">
						"{sub.originalText}"
					</p>
				{/if}
			</div>
		{/each}
	</div>
{/if}
