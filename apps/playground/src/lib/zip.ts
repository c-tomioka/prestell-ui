// Minimal ZIP writer (stored entries, no compression) for exporting a project
// from the browser without a dependency. Text is small and images are already
// compressed, so "store" is good enough. UTF-8 names (general-purpose flag
// bit 11), no ZIP64: fine for the project size limits.

export interface ZipEntry {
	path: string;
	data: Uint8Array;
	/** Modification time; defaults to now. */
	mtime?: Date;
}

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

export function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
	const year = Math.max(1980, date.getFullYear());
	return {
		time:
			(date.getHours() << 11) |
			(date.getMinutes() << 5) |
			Math.floor(date.getSeconds() / 2),
		date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
	};
}

class ByteWriter {
	#chunks: Uint8Array[] = [];
	#length = 0;

	get length(): number {
		return this.#length;
	}

	bytes(data: Uint8Array): void {
		this.#chunks.push(data);
		this.#length += data.length;
	}

	u16(value: number): void {
		this.bytes(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
	}

	u32(value: number): void {
		this.bytes(
			new Uint8Array([
				value & 0xff,
				(value >>> 8) & 0xff,
				(value >>> 16) & 0xff,
				(value >>> 24) & 0xff,
			]),
		);
	}

	toUint8Array(): Uint8Array {
		const out = new Uint8Array(this.#length);
		let offset = 0;
		for (const chunk of this.#chunks) {
			out.set(chunk, offset);
			offset += chunk.length;
		}
		return out;
	}
}

/** Build a ZIP archive (stored entries) from the given files. */
export function createZip(entries: readonly ZipEntry[]): Uint8Array {
	const encoder = new TextEncoder();
	const out = new ByteWriter();
	const central = new ByteWriter();
	const now = new Date();

	for (const entry of entries) {
		const name = encoder.encode(entry.path);
		const crc = crc32(entry.data);
		const { time, date } = dosDateTime(entry.mtime ?? now);
		const offset = out.length;

		// Local file header
		out.u32(0x04034b50);
		out.u16(20); // version needed
		out.u16(0x0800); // flags: UTF-8 names
		out.u16(0); // method: store
		out.u16(time);
		out.u16(date);
		out.u32(crc);
		out.u32(entry.data.length);
		out.u32(entry.data.length);
		out.u16(name.length);
		out.u16(0); // extra length
		out.bytes(name);
		out.bytes(entry.data);

		// Central directory header
		central.u32(0x02014b50);
		central.u16(20); // version made by
		central.u16(20); // version needed
		central.u16(0x0800);
		central.u16(0);
		central.u16(time);
		central.u16(date);
		central.u32(crc);
		central.u32(entry.data.length);
		central.u32(entry.data.length);
		central.u16(name.length);
		central.u16(0); // extra
		central.u16(0); // comment
		central.u16(0); // disk
		central.u16(0); // internal attrs
		central.u32(0); // external attrs
		central.u32(offset);
		central.bytes(name);
	}

	const centralOffset = out.length;
	const centralBytes = central.toUint8Array();
	out.bytes(centralBytes);

	// End of central directory
	out.u32(0x06054b50);
	out.u16(0);
	out.u16(0);
	out.u16(entries.length);
	out.u16(entries.length);
	out.u32(centralBytes.length);
	out.u32(centralOffset);
	out.u16(0);

	return out.toUint8Array();
}
