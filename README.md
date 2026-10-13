# TrackWise — AI-Powered Goal Tracker

TrackWise is a full-stack goal-tracking application that helps users turn long-term goals into actionable daily tasks, track their progress, and stay consistent through automated reminders.

The application combines goal management, AI-powered roadmap generation, daily task tracking, progress calculations, and a notification system in one platform.

## Features

- **Goal Management:** Create, view, update, and delete personal goals.
- **AI-Powered Roadmaps:** Generate structured roadmaps that break long-term goals into manageable tasks.
- **Daily Task Management:** View and complete tasks associated with your goals.
- **Progress Tracking:** Calculate progress based on completed tasks and their assigned weights.
- **Authentication:** User authentication with JWT-based tokens and HTTP cookies.
- **Automated Reminders:** Process scheduled reminders for unfinished tasks using background jobs.
- **In-App Notifications:** View notifications and manage their read status.
- **Email Notifications:** Send transactional emails, including password-reset emails and reminders.
- **Password Reset:** Request a password-reset link through email.

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, JavaScript, Vite, Tailwind CSS |
| Backend | Node.js, Express.js |
| Database | MongoDB, Mongoose |
| Authentication | JWT, HTTP cookies |
| AI Integration | OpenAI SDK and configured AI API |
| Background Jobs | BullMQ, Redis, ioredis |
| Email Delivery | Resend |
| Testing | Node.js test runner, Playwright |

## Architecture

TrackWise uses a client-server architecture with a separate frontend, backend API, database, and background worker.

```text
                    User
                      |
                      v
              React Frontend
                      |
                REST API / HTTP
                      |
                      v
              Express Backend
                /     |      \
               v      v       v
           MongoDB   AI API   Redis
                              |
                              v
                        BullMQ Worker
                              |
                              v
                      Email Notifications
```

### Frontend

The React frontend provides the interface for managing goals, viewing daily tasks, tracking progress, and interacting with AI-generated roadmaps.

### Backend API

The Express backend handles authentication, goal and task operations, progress calculations, AI integration, and notification APIs.

### Database

MongoDB stores application data, including user accounts, goals, task completion records, and notifications.

### AI Integration

The backend uses an AI API to generate structured roadmaps from user-defined goals. These roadmaps can then be used to organize work into actionable tasks.

### Background Processing

Redis and BullMQ support asynchronous notification processing. A separate Node.js worker processes queued jobs, keeping background work separate from the main API request-handling process.

### Email Service

Resend is used to deliver transactional emails, including password-reset messages and scheduled reminders.

## Progress Tracking

TrackWise helps users measure progress toward long-term goals through smaller daily actions.

- Goals have defined timelines.
- Tasks are associated with goals and can be completed individually.
- Task completion is recorded by date.
- Progress calculations account for the relative weights of tasks.
- Daily completion records help track progress over time.

## Project Structure

```text
trackwise/
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── ...
│
├── backend/
│   ├── models/
│   ├── routes/
│   ├── controllers/
│   ├── middlewares/
│   ├── services/
│   ├── worker.js
│   ├── server.js
│   └── package.json
│
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites

Install the following:

- Node.js and npm
- A MongoDB database, such as MongoDB Atlas
- Redis for background job processing
- Credentials for the configured AI provider
- A Resend API key for email delivery

### 1. Clone the Repository

```bash
git clone https://github.com/missVashisth/trackwise.git
cd trackwise
```

### 2. Configure the Backend

```bash
cd backend
npm install
```

Create a `.env` file in the backend directory and add the environment variables required by the application.

Example configuration template:

```dotenv
PORT=8000
MONGODB_URI=
JWT_SECRET=
FRONTEND_URL=
REDIS_URL=
RESEND_API_KEY=
EMAIL_FROM=
```

Add the AI provider credentials and any other variables your code requires. Verify the exact names in your backend configuration before running the application.

Start the backend development server:

```bash
npm run dev
```

### 3. Configure the Frontend

Open another terminal from the project root:

```bash
cd frontend
npm install
```

Configure the frontend API URL using the environment variable expected by your application. For example:

```dotenv
VITE_API_URL=http://localhost:8000
```

Start the frontend development server:

```bash
npm run dev
```

Vite will display the local URL in the terminal.

### 4. Start the Background Worker

Open another terminal:

```bash
cd backend
npm run worker
```

Ensure Redis is running and the worker has the required environment variables.

The worker is a separate process from the Express API and should be running for background notification jobs to be processed.

## Available Scripts

### Frontend

Run these commands from the `frontend` directory.

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Build the production frontend |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run Oxlint |
| `npm test` | Run frontend unit tests |
| `npm run test:e2e` | Run Playwright end-to-end tests |

### Backend

Run these commands from the `backend` directory.

| Command | Description |
|---|---|
| `npm run dev` | Start the Express server using Nodemon |
| `npm run worker` | Start the background worker |
| `npm test` | Run backend tests |
| `npm run verify:ai` | Run the AI roadmap verification script |

## Security

- Keep `.env` files and API credentials out of Git.
- Never expose database credentials, JWT secrets, Redis URLs, or private AI API keys in frontend code.
- Configure production CORS and cookie settings for the deployed domains.
- Use environment variables to manage configuration across development and production.
- Restrict database network access to trusted sources.

## Deployment

The application can be deployed using separate services:

| Component | Suggested Platform |
|---|---|
| Frontend | Vercel |
| Backend API | Render |
| Background Worker | Render background worker |
| Database | MongoDB Atlas |
| Queue | Redis hosting compatible with BullMQ |

Production deployment requires configuring the database connection, Redis connection, API base URL, CORS, authentication cookies, AI credentials, and email service credentials.

## Project Objective

TrackWise demonstrates the development of a full-stack application that integrates REST APIs, authentication, database modeling, AI-powered roadmap generation, progress calculations, and asynchronous background processing.

The goal is to help users turn long-term ambitions into actionable daily work while demonstrating practical full-stack development and third-party service integration.

## Repository

GitHub: https://github.com/missVashisth/trackwise

---

Built with React, Node.js, Express, MongoDB, and AI integration.
