(function () {
  "use strict";

  var STORAGE_KEY = "task-board.v1";
  var COLUMNS = ["todo", "doing", "done"];
  var COLUMN_LABEL = { todo: "To do", doing: "Doing", done: "Done" };
  var dateFmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  var state = {
    tasks: [],
    query: "",
    editingId: null,
  };

  var addForm = document.getElementById("add-form");
  var titleInput = document.getElementById("task-title");
  var dueInput = document.getElementById("task-due");
  var searchInput = document.getElementById("search");
  var filterStatus = document.getElementById("filter-status");
  var dragId = null;

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "t-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    var d = new Date();
    return toISODate(d);
  }

  function toISODate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function parseISODate(iso) {
    var parts = (iso || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some(function (n) { return !n; })) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function addDaysISO(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return toISODate(d);
  }

  function isOverdue(task) {
    if (!task.due || task.column === "done") return false;
    return task.due < todayISO();
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (t) {
        return t && typeof t.id === "string" && typeof t.title === "string" && COLUMNS.indexOf(t.column) !== -1;
      });
    } catch (e) {
      return [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function matchesQuery(task) {
    var q = state.query.trim().toLowerCase();
    if (!q) return true;
    return task.title.toLowerCase().indexOf(q) !== -1;
  }

  function neighbor(column, dir) {
    var i = COLUMNS.indexOf(column);
    return COLUMNS[i + dir] || null;
  }

  addForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var title = titleInput.value.trim();
    if (!title) {
      titleInput.focus();
      return;
    }
    var due = dueInput.value || "";
    if (due && !parseISODate(due)) {
      dueInput.focus();
      return;
    }
    state.tasks.push({
      id: uid(),
      title: title,
      due: due,
      column: "todo",
      createdAt: Date.now(),
    });
    save();
    addForm.reset();
    titleInput.focus();
    render();
  });

  searchInput.addEventListener("input", function () {
    state.query = searchInput.value;
    render();
  });

  document.getElementById("load-sample").addEventListener("click", function () {
    if (state.tasks.length && !window.confirm("Replace your current board with sample tasks?")) return;
    state.tasks = sampleData();
    state.editingId = null;
    save();
    render();
  });

  document.getElementById("clear-all").addEventListener("click", function () {
    if (!state.tasks.length) return;
    if (!window.confirm("Delete every task on this board? This cannot be undone.")) return;
    state.tasks = [];
    state.editingId = null;
    save();
    render();
  });

  document.getElementById("board").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-action]");
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    var task = state.tasks.find(function (t) { return t.id === id; });
    if (!task) return;
    var action = btn.getAttribute("data-action");
    if (action === "left" || action === "right") {
      var next = neighbor(task.column, action === "left" ? -1 : 1);
      if (next) moveTask(id, next);
    } else if (action === "delete") {
      if (window.confirm("Delete “" + task.title + "”?")) {
        state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
        if (state.editingId === id) state.editingId = null;
        save();
        render();
      }
    } else if (action === "edit") {
      state.editingId = id;
      render();
      var field = document.getElementById("edit-title-" + id);
      if (field) field.focus();
    } else if (action === "save-edit") {
      var titleField = document.getElementById("edit-title-" + id);
      var dueField = document.getElementById("edit-due-" + id);
      var nextTitle = titleField.value.trim();
      if (!nextTitle) {
        titleField.focus();
        return;
      }
      task.title = nextTitle;
      task.due = dueField.value || "";
      state.editingId = null;
      save();
      render();
    } else if (action === "cancel-edit") {
      state.editingId = null;
      render();
    }
  });

  function moveTask(id, column, beforeId) {
    var task = state.tasks.find(function (t) { return t.id === id; });
    if (!task || COLUMNS.indexOf(column) === -1) return;
    var others = state.tasks.filter(function (t) { return t.id !== id; });
    task.column = column;
    var same = others.filter(function (t) { return t.column === column; });
    var rest = others.filter(function (t) { return t.column !== column; });
    var insertAt = same.length;
    if (beforeId) {
      var idx = same.findIndex(function (t) { return t.id === beforeId; });
      if (idx !== -1) insertAt = idx;
    }
    same.splice(insertAt, 0, task);
    state.tasks = rest.concat(same);
    save();
    render();
  }

  function cardEl(task) {
    var li = document.createElement("li");
    li.className = "task" + (isOverdue(task) ? " is-overdue" : "");
    li.setAttribute("data-id", task.id);
    li.setAttribute("draggable", state.editingId === task.id ? "false" : "true");
    li.setAttribute("tabindex", "0");

    var dueLabel = "";
    if (task.due) {
      var d = parseISODate(task.due);
      dueLabel = d ? dateFmt.format(d) : task.due;
    }

    var left = neighbor(task.column, -1);
    var right = neighbor(task.column, 1);
    var editing = state.editingId === task.id;

    var dueHtml = task.due
      ? '<span class="due-badge">' + (isOverdue(task) ? "Overdue · " : "Due ") + escapeHtml(dueLabel) + "</span>"
      : '<span>No due date</span>';

    if (editing) {
      li.innerHTML =
        '<div class="edit-fields">' +
          '<label class="visually-hidden" for="edit-title-' + task.id + '">Title</label>' +
          '<input id="edit-title-' + task.id + '" type="text" maxlength="160" value="' + escapeHtml(task.title) + '">' +
          '<label class="visually-hidden" for="edit-due-' + task.id + '">Due date</label>' +
          '<input id="edit-due-' + task.id + '" type="date" value="' + escapeHtml(task.due || "") + '">' +
        "</div>" +
        '<div class="task-actions">' +
          '<button type="button" class="btn btn-primary btn-small" data-action="save-edit" data-id="' + task.id + '">Save</button>' +
          '<button type="button" class="btn btn-ghost btn-small" data-action="cancel-edit" data-id="' + task.id + '">Cancel</button>' +
        "</div>";
    } else {
      li.innerHTML =
        '<p class="task-title">' + escapeHtml(task.title) + "</p>" +
        '<div class="task-meta">' + dueHtml + "</div>" +
        '<div class="task-actions">' +
          (left
            ? '<button type="button" class="btn btn-ghost btn-small" data-action="left" data-id="' + task.id + '">Move to ' + COLUMN_LABEL[left] + "</button>"
            : "") +
          (right
            ? '<button type="button" class="btn btn-ghost btn-small" data-action="right" data-id="' + task.id + '">Move to ' + COLUMN_LABEL[right] + "</button>"
            : "") +
          '<button type="button" class="btn btn-ghost btn-small" data-action="edit" data-id="' + task.id + '">Edit</button>' +
          '<button type="button" class="btn btn-danger btn-small" data-action="delete" data-id="' + task.id + '">Delete</button>' +
        "</div>";
    }

    li.addEventListener("dragstart", function (e) {
      if (state.editingId === task.id) {
        e.preventDefault();
        return;
      }
      dragId = task.id;
      li.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", task.id);
    });
    li.addEventListener("dragend", function () {
      dragId = null;
      li.classList.remove("dragging");
      document.querySelectorAll(".column.is-over").forEach(function (c) { c.classList.remove("is-over"); });
    });

    return li;
  }

  function bindDropZones() {
    document.querySelectorAll(".column").forEach(function (col) {
      col.addEventListener("dragover", function (e) {
        if (!dragId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        col.classList.add("is-over");
      });
      col.addEventListener("dragleave", function (e) {
        if (!col.contains(e.relatedTarget)) col.classList.remove("is-over");
      });
      col.addEventListener("drop", function (e) {
        e.preventDefault();
        col.classList.remove("is-over");
        var id = dragId || e.dataTransfer.getData("text/plain");
        if (!id) return;
        var column = col.getAttribute("data-column");
        var after = e.target.closest(".task");
        var beforeId = after && after.getAttribute("data-id") !== id ? after.getAttribute("data-id") : null;
        moveTask(id, column, beforeId);
        dragId = null;
      });
    });
  }

  function render() {
    var visibleCount = 0;
    COLUMNS.forEach(function (col) {
      var list = document.querySelector('.task-list[data-column="' + col + '"]');
      var empty = document.querySelector('[data-empty="' + col + '"]');
      list.replaceChildren();
      var inColumn = state.tasks.filter(function (t) { return t.column === col; });
      var shown = inColumn.filter(matchesQuery);
      shown.forEach(function (t) { list.appendChild(cardEl(t)); });
      visibleCount += shown.length;
      document.getElementById("count-" + col).textContent = String(shown.length);
      empty.hidden = shown.length > 0;
    });

    var total = state.tasks.length;
    if (state.query.trim()) {
      filterStatus.textContent = "Showing " + visibleCount + " of " + total + " task" + (total === 1 ? "" : "s") + ".";
    } else {
      filterStatus.textContent = total ? total + " task" + (total === 1 ? "" : "s") + " on the board." : "The board is empty.";
    }
  }

  function sampleData() {
    return [
      { id: uid(), title: "Send invoice to River Co.", due: addDaysISO(-3), column: "todo", createdAt: 1 },
      { id: uid(), title: "Reorder packing supplies", due: addDaysISO(2), column: "todo", createdAt: 2 },
      { id: uid(), title: "Follow up on last week's quotes", due: addDaysISO(0), column: "todo", createdAt: 3 },
      { id: uid(), title: "Update product photos", due: addDaysISO(1), column: "doing", createdAt: 4 },
      { id: uid(), title: "Draft weekly sales summary", due: addDaysISO(4), column: "doing", createdAt: 5 },
      { id: uid(), title: "Set up the new landing page copy", due: addDaysISO(-1), column: "done", createdAt: 6 },
      { id: uid(), title: "Pay the domain renewal", due: addDaysISO(-10), column: "done", createdAt: 7 }
    ];
  }

  function maybeDemo() {
    var params = new URLSearchParams(location.search);
    if (params.get("demo") === "1" && state.tasks.length === 0) {
      state.tasks = sampleData();
      save();
    }
  }

  state.tasks = load();
  maybeDemo();
  bindDropZones();
  render();
})();
