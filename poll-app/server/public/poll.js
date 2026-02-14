const params = new URLSearchParams(window.location.search);
const pollId = params.get("id");
const titleEl = document.getElementById("title");
const questionsEl = document.getElementById("questions");

const socket = io();
socket.emit("join", pollId);
socket.on("results", (rows) => {
  const byQ = {};
  rows.forEach((r) => {
    const qid = r.question_id || "single";
    if (!byQ[qid]) byQ[qid] = [];
    byQ[qid].push(r);
  });
  Array.from(questionsEl.children).forEach((qBlock) => {
    const qid = qBlock.dataset.id || "single";
    const qRows = byQ[qid] || [];
    const total = qRows.reduce((acc, r) => acc + Number(r.count || 0), 0);
    Array.from(qBlock.querySelectorAll(".opt")).forEach((row) => {
      const oid = row.dataset.id;
      const match = qRows.find((r) => r.option_id === oid);
      const count = Number(match?.count || 0);
      const pct = total === 0 ? 0 : Math.round((count / total) * 100);
      row.querySelector(".fill").style.width = pct + "%";
      row.querySelector(".pct").textContent = pct + "%";
      row.querySelector(".count").textContent = count;
    });
  });
});

const renderQuestion = (q) => {
  const block = document.createElement("div");
  block.className = "q";
  block.dataset.id = q.id || "single";
  const h = document.createElement("h3");
  h.textContent = q.text;
  block.appendChild(h);
  q.options.forEach((o) => {
    const row = document.createElement("div");
    row.className = "opt";
    row.dataset.id = o.id;
    const btn = document.createElement("button");
    btn.textContent = "Vote";
    btn.addEventListener("click", async () => {
      const payload = q.id ? { questionId: q.id, optionId: o.id } : { optionId: o.id };
      const r = await fetch(`/api/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const t = await r.json().catch(() => ({}));
        alert(t.error || "Vote failed");
      }
    });
    const label = document.createElement("div");
    label.textContent = o.text;
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("div");
    fill.className = "fill";
    bar.appendChild(fill);
    const statsContainer = document.createElement("div");
    statsContainer.className = "stats-container";
    const stats = document.createElement("div");
    stats.className = "muted";
    stats.innerHTML = `<span class="pct">0%</span> • <span class="count">0</span> votes`;
    statsContainer.appendChild(stats);
    block.appendChild(row);
    row.appendChild(btn);
    row.appendChild(label);
    row.appendChild(bar);
    row.appendChild(statsContainer);
  });
  questionsEl.appendChild(block);
};

const load = async () => {
  const r = await fetch(`/api/polls/${pollId}`);
  if (!r.ok) {
    alert("Poll not found");
    return;
  }
  const data = await r.json();
  titleEl.textContent = data.poll.question;
  questionsEl.innerHTML = "";
  data.questions.forEach((q) => renderQuestion(q));
  socket.emit("join", pollId);
};

load();
