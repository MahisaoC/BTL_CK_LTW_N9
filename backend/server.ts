import dotenv from 'dotenv';
import { createApiApp } from './app.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 5000;
const app = createApiApp();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend REST API Server running on http://localhost:${PORT}`);
});
