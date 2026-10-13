const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const { errorEnvelope } = require("./middlewares/errorEnvelope.middleware");
const { allowedOrigins, trustProxySetting } = require("./config/runtime");

const app = express();

app.disable("x-powered-by");
// Behind a load balancer / PaaS proxy, req.ip (used by the rate limiters) must be the client's IP.
app.set("trust proxy", trustProxySetting());

app.use(errorEnvelope);
app.use((req, res, next) => {
    res.set({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store",
    });
    next();
});
app.use(express.json({ limit: "1mb" }));
// Express 5 leaves req.body undefined when a request has no JSON body; controllers destructure it.
app.use((req, res, next) => {
    if (req.body === undefined) req.body = {};
    next();
});
app.use(cookieParser());
app.use(cors({
    origin: allowedOrigins(),
    credentials: true,
}))

/** Liveness/readiness for the host: 200 only while the database connection is up. */
app.get("/api/health", (req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json(up ? { status: "ok" } : { message: "Database unavailable", code: "SERVICE_UNAVAILABLE" });
});

// importing routes
const authRouter = require("./routes/auth.routes");
const goalRouter = require("./routes/goal.routes");
const taskRouter = require("./routes/tasks.routes");
const taskCompletionRouter = require("./routes/taskCompletion.routes");
const dailyProgressRouter = require("./routes/dailyProgress.routes");
const overallProgressRouter = require("./routes/overallProgress.routes");
const lifeAreaRouter = require("./routes/lifeArea.routes");
const userTasksRouter = require("./routes/userTasks.routes");
const notificationRouter = require("./routes/notification.routes");
const roadmapRouter = require("./routes/roadmap.routes");
const habitRouter = require("./routes/habit.routes");
const insightsRouter = require("./routes/insights.routes");
const challengeRouter = require("./routes/challenge.routes");


// using routes
app.use("/api/auth", authRouter);
app.use("/api/life-areas", lifeAreaRouter);
app.use("/api/tasks", userTasksRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/roadmaps", roadmapRouter);
app.use("/api/habits", habitRouter);
app.use("/api/insights", insightsRouter);
app.use("/api/challenges", challengeRouter);
app.use("/api/goals", goalRouter);
app.use("/api/goals", taskRouter);
app.use("/api/goals", taskCompletionRouter);
app.use("/api/goals", dailyProgressRouter);
app.use("/api/goals", overallProgressRouter);

// Unknown API routes answer in the same JSON shape as every other error.
app.use("/api", (req, res) => {
    res.status(404).json({ message: "This API route does not exist." });
});

// Last-resort handler: anything a controller did not catch is answered as JSON. The error
// envelope sanitizes the message (5xx and library messages never reach the client) and logs it.
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ message: "Malformed JSON in request body" });
    }
    if (err.type === "entity.too.large") {
        return res.status(413).json({ message: "The request is too large." });
    }
    if (err.name === "ValidationError" || err.name === "CastError") {
        return res.status(400).json({ message: err.message });
    }
    const status = err.status >= 400 && err.status < 500 ? err.status : 500;
    return res.status(status).json({ message: err.message || "Internal server error", ...(err.name === "AiError" || err.name === "RoadmapError" ? { code: err.code } : {}) });
});


module.exports = app;