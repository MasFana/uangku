/**
 * Zero-dependency monotonic ULID generator.
 * Format: 26 characters (10 timestamp + 16 randomness) in Crockford's Base32.
 * Monotonicity: identical timestamp increments the 80-bit randomness lexicographically.
 */

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = 32;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

let lastTime = -1;
const lastRandom: number[] = new Array(RANDOM_LEN).fill(0);

function encodeTime(time: number, len: number): string {
	let str = '';
	for (let i = len - 1; i >= 0; i--) {
		const mod = time % ENCODING_LEN;
		str = ENCODING.charAt(mod) + str;
		time = Math.floor(time / ENCODING_LEN);
	}
	return str;
}

function encodeRandom(chars: number[]): string {
	let str = '';
	for (let i = 0; i < chars.length; i++) {
		str += ENCODING.charAt(chars[i] % ENCODING_LEN);
	}
	return str;
}

function seedRandom(): void {
	if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
		const buf = new Uint8Array(RANDOM_LEN);
		crypto.getRandomValues(buf);
		for (let i = 0; i < RANDOM_LEN; i++) {
			lastRandom[i] = buf[i] % ENCODING_LEN;
		}
	} else {
		for (let i = 0; i < RANDOM_LEN; i++) {
			lastRandom[i] = Math.floor(Math.random() * ENCODING_LEN);
		}
	}
}

function incrementRandom(): void {
	for (let i = RANDOM_LEN - 1; i >= 0; i--) {
		if (lastRandom[i] < ENCODING_LEN - 1) {
			lastRandom[i]++;
			return;
		}
		lastRandom[i] = 0;
	}
	// Rollover, re-seed
	seedRandom();
}

export function generateULID(now: number = Date.now()): string {
	if (now <= lastTime) {
		incrementRandom();
	} else {
		lastTime = now;
		seedRandom();
	}

	return encodeTime(now, TIME_LEN) + encodeRandom(lastRandom);
}

export function isValidULID(id: string): boolean {
	if (typeof id !== 'string' || id.length !== 26) return false;
	for (let i = 0; i < id.length; i++) {
		if (ENCODING.indexOf(id[i].toUpperCase()) === -1) return false;
	}
	return true;
}
