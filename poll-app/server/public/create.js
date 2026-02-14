const container = document.getElementById("questions");
const addQuestion = () => {
  const q = document.createElement("div");
  q.className = "q";
  const qInput = document.createElement("input");
  qInput.type = "text";
  qInput.placeholder = "Question text";
  const options = document.createElement("div");
  options.className = "options";
  const label = document.createElement("label");
  label.textContent = "Options";
  options.appendChild(label);
  const list = document.createElement("div");
  list.className = "opt-list";
  const addOpt = () => {
    const div = document.createElement("div");
    div.className = "option";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Option ${list.children.length + 1}`;
    div.appendChild(input);
    list.appendChild(div);
  };
  addOpt();
  addOpt();
  const addBtn = document.createElement("button");
  addBtn.textContent = "+ Add Option";
  addBtn.className = "secondary";
  addBtn.addEventListener("click", addOpt);
  options.appendChild(list);
  options.appendChild(addBtn);
  q.appendChild(qInput);
  q.appendChild(options);
  container.appendChild(q);
};
document.getElementById("add-question").addEventListener("click", addQuestion);
addQuestion();

document.getElementById("create").addEventListener("click", async () => {
  const resEl = document.getElementById("result");
  resEl.style.display = "none";
  resEl.textContent = "";
  const questions = Array.from(container.children).map((q) => {
    const question = q.querySelector("input[type=text]").value.trim();
    const options = Array.from(q.querySelectorAll(".opt-list input"))
      .map((i) => i.value.trim())
      .filter((v) => v.length > 0);
    return { question, options };
  }).filter((q) => q.question && q.options.length >= 2);
  const allowMultipleVotes = document.getElementById("allowMulti").checked;
  const maxVotesPerQuestion = Number(document.getElementById("maxVotes").value || "1");
  const r = await fetch("/api/polls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questions, settings: { allowMultipleVotes, maxVotesPerQuestion } })
  });
  if (!r.ok) {
    resEl.style.display = "block";
    resEl.textContent = "Failed to create poll";
    return;
  }
  const data = await r.json();
  const link = new URL(window.location.origin + data.link);
  resEl.style.display = "block";
  resEl.innerHTML = `Share this link: <a href="${link.href}">${link.href}</a>`;
});
