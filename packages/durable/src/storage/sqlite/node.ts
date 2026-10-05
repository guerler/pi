import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { validateSqliteSchemaPrefix } from "./schema.ts";
import { SqliteStorage, type SqliteStorageOptions } from "./storage.ts";
import { SyncSqliteDatabase } from "./sync.ts";

/** Node SQLite connection settings for a durable storage file. */
export type NodeSqliteDatabaseOptions = {
	/** SQLite WAL auto-checkpoint threshold. SQLite and this adapter default to 1,000 pages; 0 disables it. */
	readonly walAutoCheckpointPages?: number;
	/** Time SQLite waits for a competing file lock. SQLite defaults to 0; this adapter defaults to 5,000 ms. */
	readonly busyTimeoutMs?: number;
};

/** Node SQLite connection settings plus durable storage options. */
export type NodeSqliteStorageOptions = NodeSqliteDatabaseOptions & SqliteStorageOptions;

const DEFAULT_WAL_AUTO_CHECKPOINT_PAGES = 1_000;
const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

/** `SqliteDatabase` adapter backed by Node's built-in `node:sqlite`. */
export class NodeSqliteDatabase extends SyncSqliteDatabase {
	protected override beforeClose(): void {
		this.database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
	}
}

/** Open and configure a Node-backed SQLite database facade. */
export async function openNodeSqliteDatabase(
	path: string,
	options: NodeSqliteDatabaseOptions = {},
): Promise<NodeSqliteDatabase> {
	const checkpointPages = options.walAutoCheckpointPages ?? DEFAULT_WAL_AUTO_CHECKPOINT_PAGES;
	const timeout = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
	if (path !== ":memory:") await mkdir(dirname(path), { recursive: true });
	const database = new DatabaseSync(path, { timeout });
	const adapter = new NodeSqliteDatabase(database);
	try {
		await adapter.exec("PRAGMA journal_mode = WAL");
		await adapter.exec("PRAGMA synchronous = NORMAL");
		await adapter.exec(`PRAGMA wal_autocheckpoint = ${checkpointPages}`);
		return adapter;
	} catch (error) {
		try {
			await adapter.close();
		} catch {
			// Preserve the configuration failure.
		}
		throw error;
	}
}

/** Open or create file-backed durable storage using Node's built-in SQLite, optionally under a table prefix. */
export async function openNodeSqliteStorage(
	path: string,
	options: NodeSqliteStorageOptions = {},
): Promise<SqliteStorage> {
	const { prefix, ...databaseOptions } = options;
	if (prefix !== undefined) validateSqliteSchemaPrefix(prefix);
	return SqliteStorage.open(await openNodeSqliteDatabase(path, databaseOptions), { prefix });
}
