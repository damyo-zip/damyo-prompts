const grid = document.querySelector("#promptGrid");
const dialog = document.querySelector("#promptDialog");
const searchInput = document.querySelector("#searchInput");
const filters = document.querySelector("#categoryFilters");
const emptyMessage = document.querySelector("#emptyMessage");
const closeButton = dialog.querySelector(".close-button");
const copyButton = document.querySelector("#copyButton");
const copyStatus = document.querySelector("#copyStatus");

let selectedCategory = "전체";
let currentPrompt = null;

for (const id of ["topStoreLink", "footerStoreLink", "dialogStoreLink"]) {
  document.getElementById(id).href = SITE_CONFIG.storeUrl;
}

const categories = ["전체", ...new Set(PROMPTS.map(item => item.category))];

function renderFilters() {
  filters.innerHTML = "";
  categories.forEach(category => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-button" + (category === selectedCategory ? " active" : "");
    button.textContent = category;
    button.addEventListener("click", () => {
      selectedCategory = category;
      renderFilters();
      renderCards();
    });
    filters.appendChild(button);
  });
}

function renderCards() {
  const query = searchInput.value.trim().toLowerCase();
  const visible = PROMPTS.filter(item => {
    const categoryMatch = selectedCategory === "전체" || item.category === selectedCategory;
    const textMatch = `${item.id} ${item.title} ${item.category}`.toLowerCase().includes(query);
    return categoryMatch && textMatch;
  });

  grid.innerHTML = "";
  emptyMessage.hidden = visible.length > 0;

  visible.forEach(item => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "prompt-card";
    card.innerHTML = `
      <img src="${item.image}" alt="${escapeHtml(item.title)}" loading="lazy">
      <span class="card-meta">
        <span class="card-code">${escapeHtml(item.id)}</span>
        <span class="card-title">${escapeHtml(item.title)}</span>
      </span>
    `;
    card.addEventListener("click", () => openPrompt(item));
    grid.appendChild(card);
  });
}

function openPrompt(item) {
  currentPrompt = item;
  document.querySelector("#dialogImage").src = item.image;
  document.querySelector("#dialogImage").alt = item.title;
  document.querySelector("#dialogCode").textContent = `${item.id} · ${item.category}`;
  document.querySelector("#dialogTitle").textContent = item.title;
  document.querySelector("#dialogDescription").textContent = item.description;
  document.querySelector("#dialogPrompt").textContent = item.prompt;
  resetCopyButton();
  dialog.showModal();

  const url = new URL(location.href);
  url.searchParams.set("prompt", item.id);
  history.replaceState(null, "", url);
}

function closePrompt() {
  dialog.close();
  const url = new URL(location.href);
  url.searchParams.delete("prompt");
  history.replaceState(null, "", url);
}

async function copyCurrentPrompt() {
  if (!currentPrompt) return;
  try {
    await navigator.clipboard.writeText(currentPrompt.prompt);
    copyButton.textContent = "복사 완료 ✓";
    copyButton.classList.add("copied");
    copyStatus.textContent = "클립보드에 복사되었습니다.";
    if (navigator.vibrate) navigator.vibrate(35);
  } catch (error) {
    fallbackCopy(currentPrompt.prompt);
  }
}

function fallbackCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  try {
    document.execCommand("copy");
    copyButton.textContent = "복사 완료 ✓";
    copyButton.classList.add("copied");
    copyStatus.textContent = "클립보드에 복사되었습니다.";
  } catch {
    copyStatus.textContent = "복사에 실패했습니다. 프롬프트를 길게 눌러 복사해 주세요.";
  }
  area.remove();
}

function resetCopyButton() {
  copyButton.textContent = "프롬프트 전체 복사";
  copyButton.classList.remove("copied");
  copyStatus.textContent = "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

searchInput.addEventListener("input", renderCards);
copyButton.addEventListener("click", copyCurrentPrompt);
closeButton.addEventListener("click", closePrompt);
dialog.addEventListener("click", event => {
  if (event.target === dialog) closePrompt();
});
dialog.addEventListener("cancel", event => {
  event.preventDefault();
  closePrompt();
});

renderFilters();
renderCards();

const promptFromUrl = new URL(location.href).searchParams.get("prompt");
if (promptFromUrl) {
  const item = PROMPTS.find(prompt => prompt.id.toLowerCase() === promptFromUrl.toLowerCase());
  if (item) openPrompt(item);
}
