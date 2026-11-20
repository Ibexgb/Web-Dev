const loginPanel = document.querySelector("#login-panel");
const staffPanel = document.querySelector("#staff-panel");
const editorPanel = document.querySelector("#editor-panel");
const loginForm = document.querySelector("#login-form");
const projectForm = document.querySelector("#project-form");
const usernameInput = document.querySelector("#username");
const passwordInput = document.querySelector("#password");
const identity = document.querySelector("#identity");
const statusText = document.querySelector("#status");
const loginError = document.querySelector("#login-error");
const logoutButton = document.querySelector("#logout");
const projectsList = document.querySelector("#projects");

let csrfToken = null;
let currentUser = null;

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(csrfToken && options.method && options.method !== "GET"
        ? { "X-CSRF-Token": csrfToken }
        : {}),
      ...options.headers
    }
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.code ?? "REQUEST_FAILED");
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

function renderProjects(items) {
  if (items.length === 0) {
    const message = document.createElement("p");
    message.textContent = "No sample projects saved yet.";
    projectsList.replaceChildren(message);
    return;
  }
  projectsList.replaceChildren(...items.map(project => {
    const card = document.createElement("article");
    card.className = "project";
    card.append(
      Object.assign(document.createElement("h3"), { textContent: project.label }),
      Object.assign(document.createElement("p"), { textContent: `${project.serviceName} — ${project.status}` })
    );
    if (currentUser?.role === "editor") {
      const actions = document.createElement("div");
      actions.className = "actions";
      const review = document.createElement("button");
      review.type = "button";
      review.className = "secondary";
      review.textContent = "Mark reviewed";
      review.disabled = project.status === "reviewed";
      review.dataset.id = project.id;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary";
      remove.textContent = "Delete sample";
      remove.dataset.id = project.id;
      review.dataset.action = "review";
      remove.dataset.action = "delete";
      actions.append(review, remove);
      card.append(actions);
    }
    return card;
  }));
}

async function refreshProjects(message = "") {
  const data = await api("/api/projects");
  renderProjects(data.projects);
  statusText.textContent = message || `${data.projects.length} sample projects saved.`;
}

function focusWorkspace() {
  loginPanel.hidden = true;
  staffPanel.hidden = false;
  identity.textContent = `Signed in as ${currentUser.username} (${currentUser.role}).`;
  editorPanel.hidden = currentUser.role !== "editor";
  document.querySelector("#staff-title").focus();
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginError.textContent = "";
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username: usernameInput.value, password: passwordInput.value })
    });
    currentUser = data.user;
    csrfToken = data.csrfToken;
    passwordInput.value = "";
    focusWorkspace();
    await refreshProjects("Signed in.");
  } catch {
    loginError.textContent = "Unable to sign in with those credentials.";
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST", body: "null" });
  } finally {
    csrfToken = null;
    currentUser = null;
    staffPanel.hidden = true;
    loginPanel.hidden = false;
    usernameInput.focus();
    statusText.textContent = "Signed out.";
  }
});

projectForm.addEventListener("submit", async event => {
  event.preventDefault();
  statusText.textContent = "Saving sample project…";
  try {
    await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        serviceId: document.querySelector("#service").value,
        label: document.querySelector("#project-label").value.trim()
      })
    });
    document.querySelector("#project-label").value = "";
    await refreshProjects("Sample project saved.");
  } catch {
    statusText.textContent = "Unable to save the sample project.";
  }
});

projectsList.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  button.disabled = true;
  try {
    if (button.dataset.action === "review") {
      await api(`/api/projects/${button.dataset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "reviewed" })
      });
      await refreshProjects("Sample project marked reviewed.");
    }
    if (button.dataset.action === "delete") {
      await api(`/api/projects/${button.dataset.id}`, { method: "DELETE" });
      await refreshProjects("Sample project deleted.");
    }
  } catch {
    statusText.textContent = "Unable to complete the project action.";
    button.disabled = false;
  }
});

async function restoreSession() {
  try {
    const data = await api("/api/session");
    currentUser = data.user;
    csrfToken = data.csrfToken;
    focusWorkspace();
    await refreshProjects();
  } catch {
    // No active session; keep the sign-in form visible.
  }
}

restoreSession();
