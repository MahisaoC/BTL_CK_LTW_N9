import 'dotenv/config';
import { db } from './db.ts';
import { ensureMongoConnected, syncSnapshotToMongo } from './models/mongooseSchemas.ts';

async function runSeed() {
  const seeded = db.resetToSeed();

  const mongoReady = await ensureMongoConnected();
  if (mongoReady) {
    await syncSnapshotToMongo(seeded);
    console.log(
      'Đã kết nối MongoDB Atlas (database: travel_journal) và khởi tạo đủ 5 Collections: users, posts, comments, notifications, reports!'
    );
  }

  process.exit(0);
}

runSeed();
