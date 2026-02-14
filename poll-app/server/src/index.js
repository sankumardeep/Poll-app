import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import db from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "..", "public")));

const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10
});

const voteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20
});

const getFingerprint = (req, pollId) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
  const ua = req.headers["user-agent"] || "";
  const data = `${pollId}|${ip}|${ua}`;
  return crypto.createHash("sha256").update(data).digest("hex");
};

const tallyResults = (pollId) =>
  new Promise((resolve, reject) => {
    db.all(
      "SELECT options.id as option_id, options.text as text, COUNT(votes.id) as count FROM options LEFT JOIN votes ON options.id = votes.option_id WHERE options.poll_id = ? GROUP BY options.id ORDER BY options.id",
      [pollId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });

io.on("connection", (socket) => {
  socket.on("join", async (pollId) => {
    socket.join(pollId);
    const results = await tallyResults(pollId).catch(() => []);
    io.to(pollId).emit("results", results);
  });
});

app.post("/api/polls", createLimiter, (req, res) => {
  const body = req.body || {};
  const allowMultipleVotes = Boolean(body?.settings?.allowMultipleVotes);
  const maxVotesPerQuestion = Number(body?.settings?.maxVotesPerQuestion || 1);
  let pollId = uuidv4();
  const createdAt = Date.now();
  if (Array.isArray(body.questions) && body.questions.length > 0) {
    const qs = body.questions.filter((q) => q?.question && Array.isArray(q?.options) && q.options.length >= 2);
    if (qs.length === 0) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    db.run(
      "INSERT INTO polls (id, question, created_at, allow_multiple_votes, max_votes_per_question) VALUES (?, ?, ?, ?, ?)",
      [pollId, qs[0].question, createdAt, allowMultipleVotes ? 1 : 0, Math.max(1, maxVotesPerQuestion)],
      (err) => {
        if (err) {
          res.status(500).json({ error: "Failed to create poll" });
          return;
        }
        const qStmt = db.prepare("INSERT INTO questions (id, poll_id, text) VALUES (?, ?, ?)");
        const oStmt = db.prepare("INSERT INTO q_options (id, question_id, text) VALUES (?, ?, ?)");
        qs.forEach((q) => {
          const qid = uuidv4();
          qStmt.run(qid, pollId, String(q.question).slice(0, 300));
          q.options.forEach((opt) => {
            oStmt.run(uuidv4(), qid, String(opt).slice(0, 200));
          });
        });
        qStmt.finalize(() => {
          oStmt.finalize(() => {
            res.json({ id: pollId, link: `/poll.html?id=${pollId}` });
          });
        });
      }
    );
  } else {
    const { question, options } = body;
    if (!question || !Array.isArray(options) || options.length < 2) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    db.run("INSERT INTO polls (id, question, created_at, allow_multiple_votes, max_votes_per_question) VALUES (?, ?, ?, ?, ?)", [pollId, question, createdAt, 0, 1], (err) => {
      if (err) {
        res.status(500).json({ error: "Failed to create poll" });
        return;
      }
      const optionIds = options.map(() => uuidv4());
      const stmt = db.prepare("INSERT INTO options (id, poll_id, text) VALUES (?, ?, ?)");
      optionIds.forEach((id, idx) => stmt.run(id, pollId, String(options[idx]).slice(0, 200)));
      stmt.finalize((e) => {
        if (e) {
          res.status(500).json({ error: "Failed to create options" });
          return;
        }
        res.json({ id: pollId, link: `/poll.html?id=${pollId}` });
      });
    });
  }
});

app.get("/api/polls/:id", (req, res) => {
  const pollId = req.params.id;
  db.get("SELECT id, question, created_at, allow_multiple_votes, max_votes_per_question FROM polls WHERE id = ?", [pollId], async (err, poll) => {
    if (err || !poll) {
      res.status(404).json({ error: "Poll not found" });
      return;
    }
    db.all("SELECT id, text FROM questions WHERE poll_id = ? ORDER BY id", [pollId], (eQ, questions) => {
      if (eQ) {
        res.status(500).json({ error: "Failed to load questions" });
        return;
      }
      const qids = questions.map((q) => q.id);
      if (qids.length === 0) {
        db.all("SELECT id, text FROM options WHERE poll_id = ? ORDER BY id", [pollId], async (err2, options) => {
          if (err2) {
            res.status(500).json({ error: "Failed to load options" });
            return;
          }
          const results = await tallyResults(pollId).catch(() => []);
          res.json({ poll, questions: [{ id: "single", text: poll.question, options }], results });
        });
        return;
      }
      db.all("SELECT id, question_id, text FROM q_options WHERE question_id IN (" + qids.map(() => "?").join(",") + ") ORDER BY id", qids, async (eO, options) => {
        if (eO) {
          res.status(500).json({ error: "Failed to load options" });
          return;
        }
        const grouped = {};
        questions.forEach((q) => grouped[q.id] = { id: q.id, text: q.text, options: [] });
        options.forEach((o) => grouped[o.question_id]?.options.push({ id: o.id, text: o.text }));
        const results = await new Promise((resolve, reject) => {
          db.all(
            "SELECT q_options.id as option_id, q_options.question_id as question_id, q_options.text as text, COUNT(votes.id) as count FROM q_options LEFT JOIN votes ON q_options.id = votes.option_id AND votes.question_id = q_options.question_id WHERE q_options.question_id IN (" + qids.map(() => "?").join(",") + ") GROUP BY q_options.id ORDER BY q_options.id",
            qids,
            (errR, rows) => errR ? reject(errR) : resolve(rows)
          );
        }).catch(() => []);
        res.json({ poll, questions: Object.values(grouped), results });
      });
    });
  });
});

app.post("/api/polls/:id/vote", voteLimiter, (req, res) => {
  const pollId = req.params.id;
  const { questionId, optionId } = req.body || {};
  if (!optionId) {
    res.status(400).json({ error: "Missing optionId" });
    return;
  }
  db.get("SELECT id, allow_multiple_votes, max_votes_per_question FROM polls WHERE id = ?", [pollId], (eP, poll) => {
    if (eP || !poll) {
      res.status(404).json({ error: "Poll not found" });
      return;
    }
    const useMulti = Boolean(poll.allow_multiple_votes);
    const maxPerQ = Number(poll.max_votes_per_question || 1);
    const cookieName = `pv_${pollId}`;
    let voterCookie = req.cookies[cookieName];
    if (!voterCookie) {
      voterCookie = crypto.randomBytes(16).toString("hex");
      res.cookie(cookieName, voterCookie, { httpOnly: true, sameSite: "lax", maxAge: 365 * 24 * 60 * 60 * 1000 });
    }
    const voterHash = getFingerprint(req, pollId);
    const checkAndInsert = (qid, optionCheckSQL, optionParams) => {
      db.get(optionCheckSQL, optionParams, (err, opt) => {
        if (err || !opt) {
          res.status(400).json({ error: "Invalid option" });
          return;
        }
        const baseSQL = "SELECT COUNT(*) as c FROM votes WHERE poll_id = ? AND question_id = ? AND (voter_cookie = ? OR voter_hash = ?)";
        db.get(baseSQL, [pollId, qid, voterCookie, voterHash], (e2, row) => {
          if (e2) {
            res.status(500).json({ error: "Vote check failed" });
            return;
          }
          const count = Number(row?.c || 0);
          if (!useMulti && count >= 1) {
            res.status(409).json({ error: "Already voted for this question" });
            return;
          }
          if (useMulti && count >= Math.max(1, maxPerQ)) {
            res.status(429).json({ error: "Vote limit reached for this question" });
            return;
          }
          const createdAt = Date.now();
          db.run(
            "INSERT INTO votes (poll_id, question_id, option_id, voter_cookie, voter_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [pollId, qid, optionId, voterCookie, voterHash, createdAt],
            async (e3) => {
              if (e3) {
                res.status(500).json({ error: "Failed to record vote" });
                return;
              }
              const results = await new Promise((resolve, reject) => {
                db.all(
                  "SELECT q_options.id as option_id, q_options.question_id as question_id, q_options.text as text, COUNT(votes.id) as count FROM q_options LEFT JOIN votes ON q_options.id = votes.option_id AND votes.question_id = q_options.question_id WHERE q_options.question_id IN (SELECT id FROM questions WHERE poll_id = ?) GROUP BY q_options.id ORDER BY q_options.id",
                  [pollId],
                  (errR, rows) => errR ? reject(errR) : resolve(rows)
                );
              }).catch(() => []);
              io.to(pollId).emit("results", results);
              res.json({ ok: true });
            }
          );
        });
      });
    };
    if (questionId) {
      checkAndInsert(questionId, "SELECT id FROM q_options WHERE id = ? AND question_id = ?", [optionId, questionId]);
    } else {
      db.get("SELECT id FROM options WHERE id = ? AND poll_id = ?", [optionId, pollId], (errOpt, opt) => {
        if (errOpt || !opt) {
          res.status(400).json({ error: "Invalid option" });
          return;
        }
        const qid = "single";
        const createdAt = Date.now();
        db.get(
          "SELECT COUNT(*) as c FROM votes WHERE poll_id = ? AND (voter_cookie = ? OR voter_hash = ?)",
          [pollId, voterCookie, voterHash],
          (e2, row) => {
            if (e2) {
              res.status(500).json({ error: "Vote check failed" });
              return;
            }
            if (Number(row?.c || 0) >= 1) {
              res.status(409).json({ error: "Already voted" });
              return;
            }
            db.run(
              "INSERT INTO votes (poll_id, option_id, voter_cookie, voter_hash, created_at) VALUES (?, ?, ?, ?, ?)",
              [pollId, optionId, voterCookie, voterHash, createdAt],
              async (e3) => {
                if (e3) {
                  res.status(500).json({ error: "Failed to record vote" });
                  return;
                }
                const results = await tallyResults(pollId).catch(() => []);
                io.to(pollId).emit("results", results);
                res.json({ ok: true });
              }
            );
          }
        );
      });
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`\n✓ Server running at http://localhost:${port}\n`);
});
