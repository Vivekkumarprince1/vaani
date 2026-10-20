class ThemeStore {
	current = $state<'dark' | 'light'>('dark');

	init() {
		if (typeof window === 'undefined') return;

		const saved = localStorage.getItem('vaani_theme') as 'dark' | 'light' | null;
		if (saved === 'dark' || saved === 'light') {
			this.setTheme(saved);
		} else {
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			this.setTheme(prefersDark ? 'dark' : 'light');
		}
	}

	setTheme(theme: 'dark' | 'light') {
		this.current = theme;
		if (typeof window !== 'undefined') {
			localStorage.setItem('vaani_theme', theme);
			document.documentElement.setAttribute('data-theme', theme);
			if (theme === 'dark') {
				document.documentElement.classList.add('dark');
				document.documentElement.classList.remove('light');
			} else {
				document.documentElement.classList.remove('dark');
				document.documentElement.classList.add('light');
			}
		}
	}

	get theme(): 'dark' | 'light' {
		return this.current;
	}

	toggle() {
		this.setTheme(this.current === 'dark' ? 'light' : 'dark');
	}

	toggleTheme() {
		this.toggle();
	}
}

export const themeStore = new ThemeStore();
