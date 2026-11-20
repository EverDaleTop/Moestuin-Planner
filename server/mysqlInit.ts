import "dotenv/config";
import { MysqlStore } from "./mysqlStore.ts";

const store = await MysqlStore.openFromEnv();
if (!store) {
  console.error(
    "Geen MySQL-configuratie gevonden. Zet DATA_STORE=mysql, DB_HOST, DB_NAME, DB_USER en DB_PASSWORD in .env."
  );
  process.exit(1);
}
console.log(`MySQL-tabellen staan klaar in database ${process.env.DB_NAME}.`);
await store.close();
