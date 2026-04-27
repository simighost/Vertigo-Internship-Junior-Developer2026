Here’s a **single clean copy-paste README** with your stack included:

---

# 📊 Prediction Market Web App

A full-stack web application that allows users to create, participate in, and resolve prediction markets in real time.

This project demonstrates building a complete, user-focused product with real-time updates, financial logic, and scalable architecture.

---

## 🚀 Overview

The application simulates a **prediction market platform** where users can:

* Create markets with multiple outcomes
* Place bets using a virtual balance
* Track dynamic odds based on activity
* View results and winnings after resolution

---

## ✨ Features

### 🧭 Dashboard

* View all active markets
* Display outcomes, odds, and total bets
* Sorting and filtering
* Pagination (20 items per page)
* Real-time updates without refresh

### 👤 User Profile

* Active bets with live odds
* History of resolved bets (win/loss)
* Independent pagination

### 📈 Market Details

* Outcome distribution visualization
* Live odds display
* Place bets with validation

### 🏆 Leaderboard

* Ranking by total winnings

### 🛠 Admin Features

* Resolve markets
* Archive markets
* Trigger payout distribution

### 💰 Balance System

* Initial user balance
* Real-time balance updates
* Proportional payout distribution

---

## 🧠 What This Project Shows

* Full-stack application development
* Real-time data handling
* Clean API design
* Business logic implementation (odds & payouts)
* Focus on usability and scalability

---

## 🛠 Tech Stack

* **Frontend:** React
* **Backend:** Bun + Elysia
* **Database:** SQLite
* **Real-time updates:** (polling / WebSockets / SSE)

---

## ⚙️ Getting Started

```bash
# Install dependencies
bun install

# Start backend
bun run dev
```

Frontend (if separate):

```bash
npm install
npm run dev
```

Or with Docker:

```bash
docker compose up
```

---

## 📌 Key Highlights

* Real-time updates for markets and bets
* Scalable pagination across all lists
* Fair and consistent payout system
* Simple and maintainable architecture

---

## 🎯 Future Improvements

* Authentication system
* API key access for automated betting
* Improved UI/UX
* Production deployment

---

## 📎 Demo

See the `./submission` folder for demo video or screenshots.

---

## 💡 Summary

This project reflects the ability to take a product from concept to implementation, focusing on functionality, clarity, and real-world usability.
