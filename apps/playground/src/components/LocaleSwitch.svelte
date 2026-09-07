<!-- Header control that flips the UI language (EN ⇄ 日本語); the choice is remembered in localStorage. -->
<script lang="ts">
	import { t, toggleLocale } from '../lib/i18n';
</script>

<button type="button" class="locale" title={$t('locale.switchTo')} aria-label={$t('locale.switchTo')} onclick={() => toggleLocale()}>
	{$t('locale.switchText')}
</button>

<style>
	.locale {
		appearance: none;
		cursor: pointer;
		font: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--muted);
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.15rem 0.5rem;
	}
	.locale:hover {
		color: var(--fg);
	}
</style>
