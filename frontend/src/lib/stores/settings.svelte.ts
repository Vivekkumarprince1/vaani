export interface UserPreferences {
	callTranslationMode: 'auto' | 'always' | 'disabled';
	autoTranslateChat: boolean;
	playCallSounds: boolean;
}

class SettingsStore {
	preferences = $state<UserPreferences>({
		callTranslationMode: 'auto',
		autoTranslateChat: true,
		playCallSounds: true
	});

	init() {
		if (typeof window === 'undefined') return;
		const saved = localStorage.getItem('vaani_user_preferences');
		if (saved) {
			try {
				this.preferences = { ...this.preferences, ...JSON.parse(saved) };
			} catch (e) {
				console.warn('Failed to parse saved preferences:', e);
			}
		}
	}

	updatePreferences(updates: Partial<UserPreferences>) {
		this.preferences = { ...this.preferences, ...updates };
		if (typeof window !== 'undefined') {
			localStorage.setItem('vaani_user_preferences', JSON.stringify(this.preferences));
		}
	}
}

export const settingsStore = new SettingsStore();
