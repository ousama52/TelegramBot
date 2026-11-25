import { neonConfig, Pool, type PoolClient } from "@neondatabase/serverless";
import WebSocket from "ws";
import { logError } from "./errors.js";

neonConfig.webSocketConstructor = WebSocket;

export class Database {
  readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString, max: 6, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000,
    });
    this.pool.on("error", (error: unknown) => logError("Idle database connection", error));
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let discard = false;
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        discard = true;
        logError("Database rollback", rollbackError);
      }
      throw error;
    } finally {
      client.release(discard);
    }
  }
}
