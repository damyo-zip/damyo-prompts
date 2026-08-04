const grid = document.querySelector("#promptGrid");
const dialog = document.querySelector("#promptDialog");
const searchInput = document.querySelector("#searchInput");
const animalFilters = document.querySelector("#animalFilters");
const categoryFilters = document.querySelector("#categoryFilters");
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
const usageText = document.querySelector("#usageText");
const dialogAffiliateLink = document.querySelector("#dialogAffiliateLink");

const DEFAULT_ANIMAL_CONFIGS = {
  cat: {
    label: "고양이",
    emoji: "🐱",
    eyebrow: "DAMYOZIPSA PROMPT ARCHIVE",
    title: "고양이 무료 프롬프트",
    intro: "인스타그램에서 본 고양이 이미지를 선택하고\n프롬프트를 한 번에 복사하세요.",
    searchPlaceholder: "고양이 프롬프트 제목이나 번호로 검색",
    usage: "내 고양이 사진을 첨부한 뒤, 복사한 프롬프트를 이미지 생성창에 붙여넣어 사용하세요.",
    footer: "고양이와 집사를 위한 작은 아이디어를 나눕니다."
  },
  dog: {
    label: "강아지",
    emoji: "🐶",
    eyebrow: "DOG PROMPT ARCHIVE",
    title: "강아지 무료 프롬프트",
    intro: "인스타그램에서 본 강아지 이미지를 선택하고\n프롬프트를 한 번에 복사하세요.",
    searchPlaceholder: "강아지 프롬프트 제목이나 번호로 검색",
    usage: "내 강아지 사진을 첨부한 뒤, 복사한 프롬프트를 이미지 생성창에 붙여넣어 사용하세요.",
    footer: "강아지와 보호자를 위한 작은 아이디어를 나눕니다."
  },
  small: {
    label: "햄스터",
    emoji: "🐹",
    eyebrow: "HAMSTER PROMPT ARCHIVE",
    title: "햄스터 무료 프롬프트",
    intro: "인스타그램에서 본 햄스터 이미지를 선택하고\n프롬프트를 한 번에 복사하세요.",
    searchPlaceholder: "햄스터 프롬프트 검색",
    usage: "내 햄스터 사진을 첨부한 뒤, 복사한 프롬프트를 이미지 생성창에 붙여넣어 사용하세요.",
    footer: "작고 사랑스러운 햄스터를 위한 아이디어를 나눕니다."
  }
};

const animalConfigs = { ...DEFAULT_ANIMAL_CONFIGS, ...(SITE_CONFIG.animals || {}) };
const animalKeys = Object.keys(animalConfigs);
const pageUrl = new URL(location.href);
const requestedAnimalValue = pageUrl.searchParams.get("animal");
const requestedAnimal = requestedAnimalValue === "hamster" ? "small" : requestedAnimalValue;
const lockedAnimal = animalKeys.includes(requestedAnimal) ? requestedAnimal : null;

let selectedAnimal = animalKeys.includes(requestedAnimal)
  ? requestedAnimal
  : (animalKeys.includes(SITE_CONFIG.defaultAnimal) ? SITE_CONFIG.defaultAnimal : animalKeys[0] || "cat");
let selectedCategory = "전체";
let currentPrompt = null;
let currentSlides = [];
let currentSlideIndex = 0;
let touchStartX = null;

function trackAnalyticsEvent(eventName, parameters = {}) {
  if (typeof window.trackEvent === "function") {
    window.trackEvent(eventName, parameters);
  }
}

function getArchiveAnalyticsParameters(source = "initial") {
  return {
    animal: selectedAnimal,
    animal_label: getAnimalConfig().label || selectedAnimal,
    access_mode: lockedAnimal ? "animal_link" : "combined_archive",
    archive_source: source
  };
}

function getPromptAnalyticsParameters(item = currentPrompt) {
  if (!item) return {};
  return {
    prompt_id: String(item.id || ""),
    prompt_title: String(item.title || ""),
    animal: getAnimalKey(item),
    category: String(item.category || ""),
    slide_count: normalizeSlides(item).length
  };
}

function trackInitialPageView() {
  trackAnalyticsEvent("page_view", {
    page_title: document.title,
    page_location: location.href,
    page_path: `${location.pathname}${location.search}`,
    ...getArchiveAnalyticsParameters("initial")
  });

  trackAnalyticsEvent("archive_view", getArchiveAnalyticsParameters("initial"));
}

function trackCopyEvent(copyScope) {
  trackAnalyticsEvent("copy_prompt", {
    ...getPromptAnalyticsParameters(),
    copy_scope: copyScope,
    slide_number: currentSlides.length ? currentSlideIndex + 1 : 1
  });
}

function getAnimalKey(item) {
  return animalKeys.includes(item?.animal) ? item.animal : "cat";
}

function getAnimalConfig(key = selectedAnimal) {
  return animalConfigs[key] || DEFAULT_ANIMAL_CONFIGS.cat;
}

function getChatgptUrl(key = selectedAnimal) {
  return getAnimalConfig(key).chatgptUrl || SITE_CONFIG.storeUrl || "https://chatgpt.com/download/";
}

function getPublicAnimalKey(key) {
  return key === "small" ? "hamster" : key;
}

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

function getAnimalPrompts() {
  return PROMPTS.filter(item => getAnimalKey(item) === selectedAnimal);
}

function getCategories() {
  return ["전체", ...new Set(getAnimalPrompts().map(item => item.category).filter(Boolean))];
}

function applyAnimalBranding() {
  const config = getAnimalConfig();
  document.documentElement.dataset.animal = selectedAnimal;
  document.title = `${config.title || config.label} 보관함`;
  document.querySelector("#siteEyebrow").textContent = config.eyebrow || "PET PROMPT ARCHIVE";
  document.querySelector("#siteTitle").textContent = config.title || "무료 프롬프트 보관함";
  document.querySelector("#siteIntro").innerHTML = escapeHtml(config.intro || "").replace(/\\n|\n/g, "<br>");
  document.querySelector("#footerText").textContent = config.footer || "반려동물을 위한 작은 아이디어를 나눕니다.";
  searchInput.placeholder = config.searchPlaceholder || "제목이나 번호로 검색";
  usageText.textContent = config.usage || DEFAULT_ANIMAL_CONFIGS.cat.usage;

  const chatgptUrl = getChatgptUrl();
  for (const id of ["topStoreLink", "footerStoreLink", "dialogStoreLink"]) {
    document.getElementById(id).href = chatgptUrl;
  }

  const affiliateUrl = config.affiliateUrl || "";
  dialogAffiliateLink.hidden = !affiliateUrl;
  dialogAffiliateLink.href = affiliateUrl || "#";
  dialogAffiliateLink.textContent = affiliateUrl ? `${config.affiliateLabel || "관련 상품 보러가기"} →` : "";
}

function renderAnimalFilters() {
  animalFilters.innerHTML = "";

  // 동물별 인스타 전용 링크(?animal=cat 등)에서는 다른 동물 탭을 숨깁니다.
  if (lockedAnimal) {
    animalFilters.hidden = true;
    return;
  }

  animalFilters.hidden = false;
  animalKeys.forEach(key => {
    const config = getAnimalConfig(key);
    const count = PROMPTS.filter(item => getAnimalKey(item) === key).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `animal-tab${key === selectedAnimal ? " active" : ""}`;
    button.setAttribute("aria-pressed", key === selectedAnimal ? "true" : "false");
    button.innerHTML = `<span class="animal-tab-emoji" aria-hidden="true">${escapeHtml(config.emoji || "")}</span><span>${escapeHtml(config.label || key)}</span><span class="animal-count">${count}</span>`;
    button.addEventListener("click", () => selectAnimal(key));
    animalFilters.appendChild(button);
  });
}

function selectAnimal(key) {
  if (lockedAnimal || !animalKeys.includes(key) || key === selectedAnimal) return;
  if (dialog.open) closePrompt({ preserveAnimal: true });
  selectedAnimal = key;
  selectedCategory = "전체";
  searchInput.value = "";
  applyAnimalBranding();
  renderAnimalFilters();
  renderCategoryFilters();
  renderCards();
  updateListUrl();
  trackAnalyticsEvent("archive_view", getArchiveAnalyticsParameters("animal_tab"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderCategoryFilters() {
  const categories = getCategories();
  if (!categories.includes(selectedCategory)) selectedCategory = "전체";
  categoryFilters.innerHTML = "";

  categories.forEach(category => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-button${category === selectedCategory ? " active" : ""}`;
    button.textContent = category;
    button.addEventListener("click", () => {
      selectedCategory = category;
      renderCategoryFilters();
      renderCards();
    });
    categoryFilters.appendChild(button);
  });
}

function renderCards() {
  const query = searchInput.value.trim().toLowerCase();
  const visible = getAnimalPrompts().filter(item => {
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

  visible.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));

  grid.innerHTML = "";
  emptyMessage.hidden = visible.length > 0;
  emptyMessage.textContent = query
    ? "검색 조건에 맞는 프롬프트가 없습니다."
    : `${getAnimalConfig().label || "이 동물"} 프롬프트가 아직 없습니다.`;

  visible.forEach(item => {
    const slides = normalizeSlides(item);
    const card = document.createElement("button");
    card.type = "button";
    card.className = `prompt-card${item.pinned ? " pinned" : ""}`;
    card.innerHTML = `
      <span class="card-image-wrap">
        <img src="${escapeAttribute(getCover(item))}" alt="${escapeAttribute(item.title)}" loading="lazy">
        ${item.pinned ? `<span class="pinned-badge">고정</span>` : ""}
        ${slides.length > 1 ? `<span class="multi-image-badge" aria-label="이미지 ${slides.length}장"><span aria-hidden="true">▱</span> ${slides.length}</span>` : ""}
      </span>
      <span class="card-meta">
        <span class="card-code">${escapeHtml(item.id)}</span>
        <span class="card-title">${escapeHtml(item.title)}</span>
      </span>
    `;
    card.addEventListener("click", () => openPrompt(item, 0, "card"));
    grid.appendChild(card);
  });
}

function openPrompt(item, requestedSlide = 0, openSource = "card") {
  const animalKey = getAnimalKey(item);
  if (lockedAnimal && animalKey !== lockedAnimal) {
    updateListUrl();
    return;
  }
  if (animalKey !== selectedAnimal) {
    selectedAnimal = animalKey;
    selectedCategory = "전체";
    applyAnimalBranding();
    renderAnimalFilters();
    renderCategoryFilters();
    renderCards();
  }

  currentPrompt = item;
  currentSlides = normalizeSlides(item);
  currentSlideIndex = clamp(requestedSlide, 0, Math.max(currentSlides.length - 1, 0));

  const config = getAnimalConfig(animalKey);
  document.querySelector("#dialogCode").textContent = `${item.id} · ${config.label || animalKey} · ${item.category}`;
  document.querySelector("#dialogTitle").textContent = item.title;
  document.querySelector("#dialogDescription").textContent = item.description || "";
  usageText.textContent = config.usage || DEFAULT_ANIMAL_CONFIGS.cat.usage;

  renderThumbnails();
  renderSlide();
  resetCopyButtons();

  if (!dialog.open) dialog.showModal();
  updatePromptUrl();
  trackAnalyticsEvent("view_prompt", {
    ...getPromptAnalyticsParameters(item),
    open_source: openSource,
    first_slide_number: currentSlideIndex + 1
  });
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
    button.className = `carousel-thumbnail${index === currentSlideIndex ? " active" : ""}`;
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
  updatePromptUrl();
}

function updateListUrl() {
  const url = new URL(location.href);
  if (lockedAnimal) url.searchParams.set("animal", getPublicAnimalKey(lockedAnimal));
  else url.searchParams.delete("animal");
  url.searchParams.delete("prompt");
  url.searchParams.delete("slide");
  history.replaceState(null, "", url);
}

function updatePromptUrl() {
  if (!currentPrompt) return;
  const url = new URL(location.href);
  url.searchParams.set("animal", getPublicAnimalKey(lockedAnimal || getAnimalKey(currentPrompt)));
  url.searchParams.set("prompt", currentPrompt.id);
  if (currentSlides.length > 1 && currentSlideIndex > 0) {
    url.searchParams.set("slide", String(currentSlideIndex + 1));
  } else {
    url.searchParams.delete("slide");
  }
  history.replaceState(null, "", url);
}

function closePrompt(options = {}) {
  dialog.close();
  currentPrompt = null;
  currentSlides = [];
  if (!options.preserveAnimal) updateListUrl();
}

async function copyText(text, button, successMessage, copyScope) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    markCopied(button, successMessage, copyScope);
  } catch (error) {
    fallbackCopy(text, button, successMessage, copyScope);
  }
}

function fallbackCopy(text, button, successMessage, copyScope) {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  try {
    document.execCommand("copy");
    markCopied(button, successMessage, copyScope);
  } catch {
    copyStatus.textContent = "복사에 실패했습니다. 프롬프트를 길게 눌러 복사해 주세요.";
  }
  area.remove();
}

function markCopied(button, successMessage, copyScope) {
  resetCopyButtons();
  button.textContent = "복사 완료 ✓";
  button.classList.add("copied");
  copyStatus.textContent = successMessage;
  if (navigator.vibrate) navigator.vibrate(35);
  trackCopyEvent(copyScope);
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
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

searchInput.addEventListener("input", renderCards);
copyButton.addEventListener("click", () => {
  const copyScope = currentSlides.length > 1 ? "current_slide" : "single_prompt";
  copyText(buildCurrentPromptText(), copyButton, "현재 이미지의 프롬프트를 복사했습니다.", copyScope);
});
copySeriesButton.addEventListener("click", () => {
  copyText(buildSeriesPromptText(), copySeriesButton, "시리즈의 모든 프롬프트를 복사했습니다.", "full_series");
});
closeButton.addEventListener("click", () => closePrompt());
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

[
  ["topStoreLink", "header"],
  ["footerStoreLink", "footer"],
  ["dialogStoreLink", "prompt_dialog"]
].forEach(([id, linkPosition]) => {
  document.getElementById(id)?.addEventListener("click", event => {
    trackAnalyticsEvent("click_chatgpt", {
      ...getPromptAnalyticsParameters(),
      animal: currentPrompt ? getAnimalKey(currentPrompt) : selectedAnimal,
      link_position: linkPosition,
      link_url: event.currentTarget.href
    });
  });
});

dialogAffiliateLink.addEventListener("click", event => {
  trackAnalyticsEvent("click_affiliate", {
    ...getPromptAnalyticsParameters(),
    link_position: "prompt_dialog",
    link_url: event.currentTarget.href
  });
});

applyAnimalBranding();
renderAnimalFilters();
renderCategoryFilters();
renderCards();
trackInitialPageView();

const promptFromUrl = pageUrl.searchParams.get("prompt");
const slideFromUrl = Math.max(0, Number(pageUrl.searchParams.get("slide")) - 1 || 0);
if (promptFromUrl) {
  const item = PROMPTS.find(prompt => String(prompt.id).toLowerCase() === promptFromUrl.toLowerCase());
  if (item) openPrompt(item, slideFromUrl, "direct_link");
  else updateListUrl();
} else {
  updateListUrl();
}
