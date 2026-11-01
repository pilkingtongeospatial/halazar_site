(() => {
  const loginSection = document.getElementById("login");
  const appSection = document.getElementById("app");
  const loginForm = document.getElementById("login-form");
  const loginMessage = document.getElementById("login-message");
  const form = document.getElementById("event-form");
  const formHeading = document.getElementById("form-heading");
  const formMessage = document.getElementById("form-message");
  const list = document.getElementById("event-list");
  const cancel = document.getElementById("cancel-edit");
  const fields = ["title", "date", "end", "time", "location", "description", "url", "until"];
  let editingId = null;

  async function api(path, method = "GET", body) {
    const options = { method, headers: {} };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const response = await fetch(path, options);
    const data = await response.json();
    if (response.status === 401 && path !== "/api/login") showLogin();
    if (!response.ok) throw new Error(data.error || "Something went wrong");
    return data;
  }

  function showLogin() {
    loginSection.hidden = false;
    appSection.hidden = true;
  }

  function resetForm() {
    editingId = null;
    form.reset();
    formHeading.textContent = "Add an event";
    cancel.hidden = true;
    syncRepeat();
  }

  function syncRepeat() {
    const weekly = form.elements.weekly.checked;
    form.elements.until.disabled = !weekly;
    form.elements.end.disabled = weekly;
  }

  function edit(ev) {
    editingId = ev.id;
    for (const name of fields) form.elements[name].value = ev[name] || "";
    form.elements.weekly.checked = Boolean(ev.weekly);
    form.elements.skipNext.checked = Boolean(ev.skipNext);
    formHeading.textContent = "Edit event";
    cancel.hidden = false;
    formMessage.textContent = "";
    syncRepeat();
    form.scrollIntoView();
  }

  async function remove(ev) {
    if (!confirm(`Delete "${ev.title}"?`)) return;
    try {
      await api(`/api/events/${ev.id}`, "DELETE");
      if (editingId === ev.id) resetForm();
      await refresh();
    } catch (error) {
      formMessage.textContent = error.message;
    }
  }

  function describe(ev) {
    let when = ev.date;
    if (ev.end) when += ` to ${ev.end}`;
    if (ev.weekly) when += ev.until ? `, weekly until ${ev.until}` : ", every week";
    if (ev.time) when += `, ${ev.time}`;
    if (ev.skipNext) when += " (not in Next Event link)";
    return when;
  }

  async function refresh() {
    const events = await api("/api/events");
    list.replaceChildren();
    if (!events.length) {
      const empty = document.createElement("li");
      empty.textContent = "No events yet.";
      list.append(empty);
    }
    for (const ev of events) {
      const item = document.createElement("li");
      const text = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = ev.title;
      const when = document.createElement("div");
      when.textContent = describe(ev);
      text.append(title, when);
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => edit(ev));
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => remove(ev));
      item.append(text, editButton, deleteButton);
      list.append(item);
    }
  }

  async function showApp() {
    loginSection.hidden = true;
    appSection.hidden = false;
    await refresh();
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginMessage.textContent = "";
    try {
      await api("/api/login", "POST", { password: loginForm.elements.password.value });
      loginForm.reset();
      await showApp();
    } catch (error) {
      loginMessage.textContent = error.message;
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formMessage.textContent = "";
    const body = { weekly: form.elements.weekly.checked, skipNext: form.elements.skipNext.checked };
    for (const name of fields) body[name] = form.elements[name].disabled ? "" : form.elements[name].value;
    try {
      if (editingId) await api(`/api/events/${editingId}`, "PUT", body);
      else await api("/api/events", "POST", body);
      resetForm();
      formMessage.textContent = "Saved.";
      await refresh();
    } catch (error) {
      formMessage.textContent = error.message;
    }
  });

  form.elements.weekly.addEventListener("change", syncRepeat);
  cancel.addEventListener("click", resetForm);
  document.getElementById("logout").addEventListener("click", async () => {
    await api("/api/logout", "POST");
    showLogin();
  });

  syncRepeat();
  api("/api/session")
    .then((session) => {
      if (!session.enabled) loginMessage.textContent = "Admin login is off. Set CALENDAR_PASSWORD on the server.";
      if (session.authenticated) return showApp();
      showLogin();
    })
    .catch(() => {
      loginMessage.textContent = "Can't reach the calendar server.";
    });
})();
