const API_URL = "https://jsonplaceholder.typicode.com/users";

const loadBtn = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusText = document.querySelector("#status");
const list = document.querySelector("#users-list");

// All users from the server are stored here, so filtering needs no new request
let allUsers = [];

// ---------- Draw any array of users ----------
function renderUsers(users) {
  list.replaceChildren();

  if (users.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No users match your filter.";
    list.appendChild(empty);
    return;
  }

  users.forEach((user) => {
    const li = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = user.name;

    const email = document.createElement("div");
    email.textContent = `Email: ${user.email}`;

    const city = document.createElement("div");
    city.textContent = `City: ${user.address.city}`;

    const company = document.createElement("div");
    company.textContent = `Company: ${user.company.name}`;

    li.append(name, email, city, company);
    list.appendChild(li);
  });
}

// ---------- Load users from the API ----------
async function loadUsers() {
  statusText.textContent = "Loading users...";
  loadBtn.disabled = true;
  list.replaceChildren();

  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`Status ${response.status}`);

    allUsers = await response.json();
    filterInput.value = "";
    renderUsers(allUsers);
    statusText.textContent = `Loaded ${allUsers.length} users.`;
  } catch (error) {
    statusText.textContent = "Could not load users. Please try again.";
    console.error(error);
  } finally {
    loadBtn.disabled = false;
  }
}

// ---------- Filter the stored array (no new request) ----------
function filterUsers() {
  if (allUsers.length === 0) return; // nothing loaded yet

  const search = filterInput.value.trim().toLowerCase();
  const matches = allUsers.filter((user) =>
    user.name.toLowerCase().includes(search)
  );
  renderUsers(matches);
}

loadBtn.addEventListener("click", loadUsers);
filterInput.addEventListener("input", filterUsers);