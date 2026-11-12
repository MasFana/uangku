import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

function findLocalD1Sqlite(baseDir: string): string {
	const d1Dir = resolve(baseDir, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
	const entries = readdirSync(d1Dir);
	const target = entries.find((e) => e.endsWith('.sqlite') && e !== 'metadata.sqlite');
	if (!target) {
		throw new Error(`Local D1 sqlite database not found in ${d1Dir}`);
	}
	return join(d1Dir, target);
}

export function runLocalSeed(projectRoot = process.cwd()) {
	const dbPath = findLocalD1Sqlite(projectRoot);
	const db = new DatabaseSync(dbPath);

	const now = new Date();
	const nowIso = now.toISOString();
	const nowEpoch = Math.floor(now.getTime() / 1000);

	const DEMO_USER_ID = 'demo-user-id-uangku';
	const DEMO_USER_EMAIL = 'demo@uangku.app';

	db.exec('BEGIN TRANSACTION;');

	try {
		// Clean existing demo user data (cascade manually in sqlite if foreign_keys off)
		db.prepare('DELETE FROM transactions WHERE user_id = ?').run(DEMO_USER_ID);
		db.prepare('DELETE FROM categories WHERE user_id = ?').run(DEMO_USER_ID);
		db.prepare('DELETE FROM wallets WHERE user_id = ?').run(DEMO_USER_ID);
		db.prepare('DELETE FROM account WHERE user_id = ?').run(DEMO_USER_ID);
		db.prepare('DELETE FROM session WHERE user_id = ?').run(DEMO_USER_ID);
		db.prepare('DELETE FROM user WHERE id = ?').run(DEMO_USER_ID);

		// Insert Demo User
		db.prepare(`
			INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at)
			VALUES (?, ?, ?, 1, NULL, ?, ?);
		`).run(DEMO_USER_ID, 'Demo Pengguna', DEMO_USER_EMAIL, nowEpoch, nowEpoch);

		// Insert Account
		db.prepare(`
			INSERT INTO account (id, user_id, account_id, provider_id, password, created_at, updated_at)
			VALUES (?, ?, ?, 'credential', 'demo-password-hash', ?, ?);
		`).run('demo-account-id', DEMO_USER_ID, DEMO_USER_EMAIL, nowEpoch, nowEpoch);

		// Insert Wallets
		const insertWallet = db.prepare(`
			INSERT INTO wallets (id, user_id, name, type, initial_balance, icon, archived, created_at)
			VALUES (?, ?, ?, ?, ?, ?, 0, ?);
		`);
		insertWallet.run('wallet-cash', DEMO_USER_ID, 'Dompet Tunai', 'cash', 500000, 'wallet', nowIso);
		insertWallet.run('wallet-bca', DEMO_USER_ID, 'BCA Utama', 'bank', 5000000, 'landmark', nowIso);
		insertWallet.run('wallet-gopay', DEMO_USER_ID, 'GoPay', 'ewallet', 250000, 'smartphone', nowIso);

		// Insert Categories
		const insertCat = db.prepare(`
			INSERT INTO categories (id, user_id, name, kind, icon, color, archived, created_at)
			VALUES (?, ?, ?, ?, ?, ?, 0, ?);
		`);
		insertCat.run('cat-makan', DEMO_USER_ID, 'Makan & Minum', 'expense', 'utensils', '#ef4444', nowIso);
		insertCat.run('cat-transport', DEMO_USER_ID, 'Transportasi', 'expense', 'bus', '#f97316', nowIso);
		insertCat.run('cat-belanja', DEMO_USER_ID, 'Belanja', 'expense', 'shopping-bag', '#eab308', nowIso);
		insertCat.run('cat-tagihan', DEMO_USER_ID, 'Tagihan & Utilitas', 'expense', 'receipt', '#6366f1', nowIso);
		insertCat.run('cat-hiburan', DEMO_USER_ID, 'Hiburan', 'expense', 'film', '#ec4899', nowIso);
		insertCat.run('cat-gaji', DEMO_USER_ID, 'Gaji Bulanan', 'income', 'banknote', '#22c55e', nowIso);
		insertCat.run('cat-bonus', DEMO_USER_ID, 'Bonus & Side Job', 'income', 'sparkles', '#10b981', nowIso);

		// Insert Transactions
		const insertTx = db.prepare(`
			INSERT INTO transactions (id, user_id, wallet_id, category_id, type, amount, transfer_wallet_id, note, occurred_at, receipt_key, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?);
		`);

		const year = now.getUTCFullYear();
		const month = now.getUTCMonth();
		let count = 0;

		const sampleExpenses = [
			{ name: 'Makan Siang Nasi Padang', amount: 35000, cat: 'cat-makan', wallet: 'wallet-cash' },
			{ name: 'Kopi Susu Senja', amount: 25000, cat: 'cat-makan', wallet: 'wallet-gopay' },
			{ name: 'Bensin Motor', amount: 45000, cat: 'cat-transport', wallet: 'wallet-cash' },
			{ name: 'MRT Pulang Pergi', amount: 28000, cat: 'cat-transport', wallet: 'wallet-gopay' },
			{ name: 'Supermarket Mingguan', amount: 320000, cat: 'cat-belanja', wallet: 'wallet-bca' },
			{ name: 'Token Listrik PLN', amount: 200000, cat: 'cat-tagihan', wallet: 'wallet-bca' },
			{ name: 'Internet Rumah & WiFi', amount: 350000, cat: 'cat-tagihan', wallet: 'wallet-bca' },
			{ name: 'Bioskop Akhir Pekan', amount: 90000, cat: 'cat-hiburan', wallet: 'wallet-gopay' },
			{ name: 'Langganan Streaming', amount: 65000, cat: 'cat-hiburan', wallet: 'wallet-bca' }
		];

		for (let offset = 2; offset >= 0; offset--) {
			const targetMonth = month - offset;
			// 1st: Gaji
			const salaryDate = new Date(Date.UTC(year, targetMonth, 1, 9, 0, 0)).toISOString();
			insertTx.run(`tx-seed-${++count}`, DEMO_USER_ID, 'wallet-bca', 'cat-gaji', 'income', 8000000, null, 'Gaji Bulanan Masuk', salaryDate, salaryDate, salaryDate);

			// 3rd: Transfer BCA -> Cash
			const atmDate = new Date(Date.UTC(year, targetMonth, 3, 10, 0, 0)).toISOString();
			insertTx.run(`tx-seed-${++count}`, DEMO_USER_ID, 'wallet-bca', null, 'transfer', 500000, 'wallet-cash', 'Tarik Tunai ATM BCA', atmDate, atmDate, atmDate);

			// 5th: Transfer BCA -> GoPay
			const topupDate = new Date(Date.UTC(year, targetMonth, 5, 11, 0, 0)).toISOString();
			insertTx.run(`tx-seed-${++count}`, DEMO_USER_ID, 'wallet-bca', null, 'transfer', 300000, 'wallet-gopay', 'Top Up GoPay', topupDate, topupDate, topupDate);

			// 15th: Bonus
			if (offset < 2) {
				const bonusDate = new Date(Date.UTC(year, targetMonth, 15, 14, 0, 0)).toISOString();
				insertTx.run(`tx-seed-${++count}`, DEMO_USER_ID, 'wallet-bca', 'cat-bonus', 'income', 1500000, null, 'Project Sampingan Web', bonusDate, bonusDate, bonusDate);
			}

			// Expenses
			for (let i = 0; i < sampleExpenses.length; i++) {
				const item = sampleExpenses[i];
				const day = 4 + (i * 3) % 24;
				const expDate = new Date(Date.UTC(year, targetMonth, day, 12, i * 4, 0)).toISOString();
				insertTx.run(`tx-seed-${++count}`, DEMO_USER_ID, item.wallet, item.cat, 'expense', item.amount, null, item.name, expDate, expDate, expDate);
			}
		}

		db.exec('COMMIT;');
		db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
		return { wallets: 3, categories: 7, transactions: count };
	} catch (err) {
		db.exec('ROLLBACK;');
		db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
		throw err;
	} finally {
		db.close();
	}
}

// CLI runner when executed directly
if (process.argv[1]?.endsWith('seed.ts')) {
	const res = runLocalSeed();
	console.log(`[seed] Sukses isi demo data: ${res.wallets} dompet, ${res.categories} kategori, ${res.transactions} transaksi.`);
}
