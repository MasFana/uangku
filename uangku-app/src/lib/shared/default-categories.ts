import type { CategoryKind } from './sync-contract';

export interface DefaultCategory {
	name: string;
	kind: CategoryKind;
	color: string;
}

/**
 * Shared (client + server) list of starter categories. The client "isi kategori bawaan"
 * affordance creates these locally so the action works offline; the server seeds the same
 * list at signup. Keep this the single source of truth.
 */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
	// expense
	{ name: 'Makan & Minum', kind: 'expense', color: '#0f766e' },
	{ name: 'Belanja Harian', kind: 'expense', color: '#c2410c' },
	{ name: 'Transportasi', kind: 'expense', color: '#1d4ed8' },
	{ name: 'Tagihan & Utilitas', kind: 'expense', color: '#7c3aed' },
	{ name: 'Sewa & Cicilan', kind: 'expense', color: '#b91c1c' },
	{ name: 'Kesehatan', kind: 'expense', color: '#be123c' },
	{ name: 'Pendidikan', kind: 'expense', color: '#0369a1' },
	{ name: 'Hiburan', kind: 'expense', color: '#a21caf' },
	{ name: 'Rumah & Perawatan', kind: 'expense', color: '#4d7c0f' },
	{ name: 'Keluarga', kind: 'expense', color: '#c026d3' },
	{ name: 'Donasi & Zakat', kind: 'expense', color: '#15803d' },
	{ name: 'Lain-lain', kind: 'expense', color: '#525252' },

	// income
	{ name: 'Gaji', kind: 'income', color: '#0f766e' },
	{ name: 'Bonus & THR', kind: 'income', color: '#c2410c' },
	{ name: 'Usaha & Freelance', kind: 'income', color: '#1d4ed8' },
	{ name: 'Bunga & Investasi', kind: 'income', color: '#7c3aed' },
	{ name: 'Lain-lain', kind: 'income', color: '#525252' }
];
