const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect MongoDB
mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ck_ltw')
  .then(() => console.log('✅ Kết nối MongoDB thành công'))
  .catch((err) => console.error('❌ Lỗi kết nối MongoDB:', err));

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Backend API đang chạy 🚀' });
});

// Import routes (mở rộng thêm sau)
// const userRoutes = require('./routes/userRoutes');
// app.use('/api/users', userRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy trên cổng ${PORT}`);
});
