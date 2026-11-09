# BTL_CK_LTW - Nhóm 9

Dự án web với **Frontend** (React) và **Backend** (Node.js + Express + MongoDB).

## Cấu trúc thư mục

```
ck-ltw/
├── frontend/      # React App (Create React App)
│   ├── public/
│   ├── src/
│   └── package.json
├── backend/       # Node.js + Express + MongoDB
│   ├── models/
│   ├── routes/
│   ├── controllers/
│   ├── middleware/
│   ├── server.js
│   └── package.json
└── README.md
```

## Hướng dẫn chạy

### Backend
```bash
cd backend
cp .env.example .env   # Cấu hình biến môi trường
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm start
```

## Công nghệ sử dụng
- **Frontend:** React, Create React App
- **Backend:** Node.js, Express.js
- **Database:** MongoDB (Mongoose)
