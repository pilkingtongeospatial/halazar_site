(() => {
  const root = document.getElementById("calendar");
  const grid = root.querySelector(".calendar-grid");
  const label = root.querySelector("h2");
  const status = document.getElementById("calendar-status");
  const dialog = document.getElementById("event-dialog");
  const today = new Date();
  let shown = new Date(today.getFullYear(), today.getMonth(), 1);
  let events = [];

  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const fromIso = (value) => {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  function occursOn(ev, key, day) {
    if (key < ev.date) return false;
    if (ev.weekly) {
      return (!ev.until || key <= ev.until) && day.getDay() === fromIso(ev.date).getDay();
    }
    return key <= (ev.end || ev.date);
  }

  // The first date on or after today that the event happens, or null if it's over.
  function nextOccurrence(ev, todayKey) {
    if (ev.weekly) {
      const first = ev.date > todayKey ? fromIso(ev.date) : fromIso(todayKey);
      const gap = (fromIso(ev.date).getDay() - first.getDay() + 7) % 7;
      const key = iso(new Date(first.getFullYear(), first.getMonth(), first.getDate() + gap));
      return ev.until && key > ev.until ? null : key;
    }
    if ((ev.end || ev.date) < todayKey) return null;
    return ev.date > todayKey ? ev.date : todayKey;
  }

  function showNextEvent() {
    const todayKey = iso(today);
    let next = null;
    for (const ev of events) {
      if (ev.skipNext) continue;
      const key = nextOccurrence(ev, todayKey);
      if (key && (!next || key < next.key)) next = { ev, key };
    }
    if (!next) {
      status.textContent = "No upcoming events are scheduled yet.";
      status.hidden = false;
      return;
    }
    const day = fromIso(next.key);
    shown = new Date(day.getFullYear(), day.getMonth(), 1);
    render();
    openEvent(next.ev, next.key);
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    el.textContent = text || "";
    el.hidden = !text;
  }

  function openEvent(ev, key) {
    const long = { weekday: "long", month: "long", day: "numeric", year: "numeric" };
    let when = fromIso(key).toLocaleDateString("en-US", long);
    if (ev.end) when = `${fromIso(ev.date).toLocaleDateString("en-US", long)} to ${fromIso(ev.end).toLocaleDateString("en-US", long)}`;
    setText("event-title", ev.title);
    setText("event-when", ev.time ? `${when}, ${ev.time}` : when);
    setText("event-location", ev.location);
    setText("event-description", ev.description);
    const link = document.getElementById("event-link");
    link.hidden = !ev.url;
    if (ev.url) link.href = ev.url;
    dialog.showModal();
  }

  function render() {
    label.textContent = shown.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    grid.replaceChildren();
    for (const name of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      const head = document.createElement("div");
      head.className = "calendar-day-name";
      head.textContent = name;
      grid.append(head);
    }
    const offset = (shown.getDay() + 6) % 7;
    const start = new Date(shown.getFullYear(), shown.getMonth(), 1 - offset);
    for (let i = 0; i < 42; i++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (i === 35 && day.getMonth() !== shown.getMonth()) break;
      const key = iso(day);
      const cell = document.createElement("div");
      cell.className = "calendar-cell";
      if (day.getMonth() !== shown.getMonth()) cell.classList.add("outside");
      if (key === iso(today)) cell.classList.add("today");
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = day.getDate();
      cell.append(num);
      for (const ev of events) {
        if (!occursOn(ev, key, day)) continue;
        const item = document.createElement("button");
        item.type = "button";
        item.className = "calendar-event";
        item.textContent = ev.title;
        item.addEventListener("click", () => openEvent(ev, key));
        cell.append(item);
      }
      grid.append(cell);
    }
  }

  function move(months) {
    shown = new Date(shown.getFullYear(), shown.getMonth() + months, 1);
    render();
  }

  root.querySelector("[data-prev]").addEventListener("click", () => move(-1));
  root.querySelector("[data-next]").addEventListener("click", () => move(1));
  root.querySelector("[data-today]").addEventListener("click", () => {
    shown = new Date(today.getFullYear(), today.getMonth(), 1);
    render();
  });
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());

  render();
  fetch("/api/events")
    .then((r) => {
      if (!r.ok) throw new Error();
      return r.json();
    })
    .then((data) => {
      events = data;
      render();
      if (new URLSearchParams(location.search).has("next")) showNextEvent();
    })
    .catch(() => {
      status.hidden = false;
    });
})();
