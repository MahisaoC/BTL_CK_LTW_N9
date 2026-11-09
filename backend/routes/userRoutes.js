const express = require('express');
const router = express.Router();
// const { getUsers, createUser } = require('../controllers/userController');

// GET /api/users
router.get('/', (req, res) => {
  res.json({ message: 'Danh sách users' });
});

module.exports = router;
