const grid = document.querySelector("#promptGrid");
const dialog = document.querySelector("#promptDialog");
const searchInput = document.querySelector("#searchInput");
const filters = document.querySelector("#categoryFilters");
const emptyMessage = document.querySelector("#emptyMessage");
const closeButton = dialog.querySelector(".close-button");
const copyButton = document.querySelector("#copyButton");
const copySeriesButton = document.querySelector("#copySeriesButton");
const copyStatus = document.querySelector("#copyStatus");
const dialogImage = document.querySelector("#dialogImage");
const previousSlideButton = document.querySelector("#previousSlide");
const nextSlideButton = document.querySelector("#nextSlide");
const carouselCounter = document.querySelector("#carouselCounter");
const carouselThumbnails = document.querySelector("#carouselThumbnails");
const carouselViewport = document.querySelector("#carouselViewport");
const slideText = document.querySelector("#slideText");
const dialogSlideTitle = document.querySelector("#dialogSlideTitle");
const dialogSlideCaption = document.querySelector("#dialogSlideCaption");
const promptHeading = document.querySelector("#promptHeading");
const promptPosition = document.querySelector("#promptPosition");
const dialogPrompt = document.querySelector("#dialogPrompt");

let selectedCategory = "전체";
let currentPrompt = null;
let currentSlides = [];
let currentSlideIndex = 0;
let touchStartX = null;

for (const id of ["topStoreLink", "footerStoreLink", "dialogStoreLink"]) {
  document.getElementById(id).href = SITE_CONFIG.storeUrl;
}

const categories = ["전체", ...new Set(PROMPTS.map(item => item.category).filter(Boolean))];

function normalizeSlides(item) {
  if (Array.isArray(item.images) && item.images.length) {
    return item.images
      .map((image, index) => {
        if (typeof image === "string") {
          return { src: image, title: "", caption: "", prompt: "", index };
        }
        return {
          src: image.src || image.image || "",
          title: image.title || "",
          caption: image.caption || image.description || "",
          prompt: image.prompt || "",
          alt: image.alt || "",
          index
        };
      })
      .filter(image => image.src);
  }

  return item.image
    ? [{ src: item.image, title: "", caption: "", prompt: "", alt: item.title, index: 0 }]
    : [];
}

function getCover(item) {
  const slides = normalizeSlides(item);
  return item.cover || item.image || slides[0]?.src || "";
}

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
    const searchableText = [
      item.id,
      item.title,
      item.category,
      item.description,
      ...normalizeSlides(item).map(slide => `${slide.title} ${slide.caption}`)
    ].join(" ").toLowerCase();
    return categoryMatch && searchableText.includes(query);
  });

  grid.innerHTML = "";
  emptyMessage.hidden = visible.length > 0;

  visible.forEach(item => {
    const slides = normalizeSlides(item);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "prompt-card";
    card.innerHTML = `
      <span class="card-image-wrap">
        <img src="${escapeAttribute(getCover(item))}" alt="${escapeAttribute(item.title)}" loading="lazy">
        ${slides.length > 1 ? `<span class="multi-image-badge" aria-label="이미지 ${slides.length}장"><span aria-hidden="true">▱</span> ${slides.length}</span>` : ""}
      </span>
      <span class="card-meta">
        <span class="card-code">${escapeHtml(item.id)}</span>
        <span class="card-title">${escapeHtml(item.title)}</span>
      </span>
    `;
    card.addEventListener("click", () => openPrompt(item));
    grid.appendChild(card);
  });
}

function openPrompt(item, requestedSlide = 0) {
  currentPrompt = item;
  currentSlides = normalizeSlides(item);
  currentSlideIndex = clamp(requestedSlide, 0, Math.max(currentSlides.length - 1, 0));

  document.querySelector("#dialogCode").textContent = `${item.id} · ${item.category}`;
  document.querySelector("#dialogTitle").textContent = item.title;
  document.querySelector("#dialogDescription").textContent = item.description || "";

  renderThumbnails();
  renderSlide();
  resetCopyButtons();

  if (!dialog.open) dialog.showModal();
  updateUrl();
}

function renderThumbnails() {
  carouselThumbnails.innerHTML = "";
  const isSeries = currentSlides.length > 1;
  carouselThumbnails.hidden = !isSeries;
  previousSlideButton.hidden = !isSeries;
  nextSlideButton.hidden = !isSeries;
  carouselCounter.hidden = !isSeries;
  copySeriesButton.hidden = true;

  if (!isSeries) return;

  currentSlides.forEach((slide, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "carousel-thumbnail" + (index === currentSlideIndex ? " active" : "");
    button.setAttribute("aria-label", `${index + 1}번째 이미지 보기`);
    button.innerHTML = `<img src="${escapeAttribute(slide.src)}" alt="" loading="lazy">`;
    button.addEventListener("click", () => goToSlide(index));
    carouselThumbnails.appendChild(button);
  });
}

function renderSlide() {
  const slide = currentSlides[currentSlideIndex];
  if (!slide) return;

  dialogImage.src = slide.src;
  dialogImage.alt = slide.alt || slide.title || `${currentPrompt.title} ${currentSlideIndex + 1}번째 이미지`;
  carouselCounter.textContent = `${currentSlideIndex + 1} / ${currentSlides.length}`;

  const hasSlideText = Boolean(slide.title || slide.caption);
  slideText.hidden = !hasSlideText;
  dialogSlideTitle.textContent = slide.title || "";
  dialogSlideTitle.hidden = !slide.title;
  dialogSlideCaption.textContent = slide.caption || "";
  dialogSlideCaption.hidden = !slide.caption;

  const promptText = buildCurrentPromptText();
  dialogPrompt.textContent = promptText || "등록된 프롬프트가 없습니다.";

  const hasScenePrompt = Boolean(slide.prompt);
  const isSeries = currentSlides.length > 1;
  promptHeading.textContent = isSeries ? (hasScenePrompt ? "현재 이미지 프롬프트" : "공통 프롬프트") : "프롬프트";
  promptPosition.textContent = isSeries ? `${currentSlideIndex + 1} / ${currentSlides.length}` : "";
  copyButton.textContent = isSeries ? "현재 이미지 프롬프트 복사" : "프롬프트 전체 복사";
  copyButton.disabled = !promptText;

  [...carouselThumbnails.children].forEach((button, index) => {
    button.classList.toggle("active", index === currentSlideIndex);
    button.setAttribute("aria-current", index === currentSlideIndex ? "true" : "false");
  });

  const activeThumbnail = carouselThumbnails.children[currentSlideIndex];
  activeThumbnail?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
}

function buildCurrentPromptText() {
  if (!currentPrompt) return "";
  const commonPrompt = (currentPrompt.prompt || "").trim();
  const scenePrompt = (currentSlides[currentSlideIndex]?.prompt || "").trim();

  if (commonPrompt && scenePrompt) {
    return `${commonPrompt}\n\n[${currentSlideIndex + 1}번 이미지]\n${scenePrompt}`;
  }
  return scenePrompt || commonPrompt;
}

function buildSeriesPromptText() {
  if (!currentPrompt) return "";

  const parts = [];
  const commonPrompt = (currentPrompt.prompt || "").trim();
  if (commonPrompt) parts.push(`[공통 프롬프트]\n${commonPrompt}`);

  currentSlides.forEach((slide, index) => {
    const scenePrompt = (slide.prompt || "").trim();
    if (!scenePrompt) return;
    const label = slide.title ? `${index + 1}번 이미지 · ${slide.title}` : `${index + 1}번 이미지`;
    parts.push(`[${label}]\n${scenePrompt}`);
  });

  if (!parts.length && commonPrompt) return commonPrompt;
  return parts.join("\n\n--------------------\n\n");
}

function goToSlide(index) {
  if (!currentSlides.length) return;
  currentSlideIndex = (index + currentSlides.length) % currentSlides.length;
  renderSlide();
  resetCopyButtons();
  updateUrl();
}

function updateUrl() {
  if (!currentPrompt) return;
  const url = new URL(location.href);
  url.searchParams.set("prompt", currentPrompt.id);
  if (currentSlides.length > 1 && currentSlideIndex > 0) {
    url.searchParams.set("slide", String(currentSlideIndex + 1));
  } else {
    url.searchParams.delete("slide");
  }
  history.replaceState(null, "", url);
}

function closePrompt() {
  dialog.close();
  currentPrompt = null;
  currentSlides = [];
  const url = new URL(location.href);
  url.searchParams.delete("prompt");
  url.searchParams.delete("slide");
  history.replaceState(null, "", url);
}

async function copyText(text, button, successMessage) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    markCopied(button, successMessage);
  } catch (error) {
    fallbackCopy(text, button, successMessage);
  }
}

function fallbackCopy(text, button, successMessage) {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  try {
    document.execCommand("copy");
    markCopied(button, successMessage);
  } catch {
    copyStatus.textContent = "복사에 실패했습니다. 프롬프트를 길게 눌러 복사해 주세요.";
  }
  area.remove();
}

function markCopied(button, successMessage) {
  resetCopyButtons();
  button.textContent = "복사 완료 ✓";
  button.classList.add("copied");
  copyStatus.textContent = successMessage;
  if (navigator.vibrate) navigator.vibrate(35);
}

function resetCopyButtons() {
  copyButton.classList.remove("copied");
  copySeriesButton.classList.remove("copied");
  copyStatus.textContent = "";
  if (currentSlides.length > 1) {
    copyButton.textContent = "현재 이미지 프롬프트 복사";
    copySeriesButton.textContent = "시리즈 프롬프트 모두 복사";
  } else {
    copyButton.textContent = "프롬프트 전체 복사";
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

searchInput.addEventListener("input", renderCards);
copyButton.addEventListener("click", () => copyText(buildCurrentPromptText(), copyButton, "현재 이미지의 프롬프트를 복사했습니다."));
copySeriesButton.addEventListener("click", () => copyText(buildSeriesPromptText(), copySeriesButton, "시리즈의 모든 프롬프트를 복사했습니다."));
closeButton.addEventListener("click", closePrompt);
previousSlideButton.addEventListener("click", () => goToSlide(currentSlideIndex - 1));
nextSlideButton.addEventListener("click", () => goToSlide(currentSlideIndex + 1));

dialog.addEventListener("click", event => {
  if (event.target === dialog) closePrompt();
});

dialog.addEventListener("cancel", event => {
  event.preventDefault();
  closePrompt();
});

dialog.addEventListener("keydown", event => {
  if (currentSlides.length < 2) return;
  if (event.key === "ArrowLeft") goToSlide(currentSlideIndex - 1);
  if (event.key === "ArrowRight") goToSlide(currentSlideIndex + 1);
});

carouselViewport.addEventListener("touchstart", event => {
  touchStartX = event.changedTouches[0]?.clientX ?? null;
}, { passive: true });

carouselViewport.addEventListener("touchend", event => {
  if (touchStartX === null || currentSlides.length < 2) return;
  const endX = event.changedTouches[0]?.clientX ?? touchStartX;
  const distance = endX - touchStartX;
  touchStartX = null;
  if (Math.abs(distance) < 45) return;
  goToSlide(distance > 0 ? currentSlideIndex - 1 : currentSlideIndex + 1);
}, { passive: true });

renderFilters();
renderCards();

const pageUrl = new URL(location.href);
const promptFromUrl = pageUrl.searchParams.get("prompt");
const slideFromUrl = Math.max(0, Number(pageUrl.searchParams.get("slide")) - 1 || 0);
if (promptFromUrl) {
  const item = PROMPTS.find(prompt => prompt.id.toLowerCase() === promptFromUrl.toLowerCase());
  if (item) openPrompt(item, slideFromUrl);
}
