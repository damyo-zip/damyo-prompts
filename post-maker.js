const form = document.querySelector("#postForm");
const pickFolderButton = document.querySelector("#pickFolderButton");
const folderStatus = document.querySelector("#folderStatus");
const titleInput = document.querySelector("#titleInput");
const categoryInput = document.querySelector("#categoryInput");
const descriptionInput = document.querySelector("#descriptionInput");
const commonPromptInput = document.querySelector("#commonPromptInput");
const imageInput = document.querySelector("#imageInput");
const imageList = document.querySelector("#imageList");
const imageEmpty = document.querySelector("#imageEmpty");
const imageCardTemplate = document.querySelector("#imageCardTemplate");
const dropZone = document.querySelector("#dropZone");
const nextIdBadge = document.querySelector("#nextIdBadge");
const categoryOptions = document.querySelector("#categoryOptions");
const saveButton = document.querySelector("#saveButton");
const downloadButton = document.querySelector("#downloadButton");
const saveStatus = document.querySelector("#saveStatus");

let projectDirectoryHandle = null;
let imageItems = [];
let draggedImageId = null;
let workingPrompts = PROMPTS.map(item => structuredCloneSafe(item));
let workingSiteConfig = structuredCloneSafe(SITE_CONFIG);

initialize();

function initialize() {
  renderCategoryOptions();
  updateNextId();
  updateImageList();

  if (!("showDirectoryPicker" in window)) {
    folderStatus.textContent = "이 브라우저는 폴더 직접 저장을 지원하지 않습니다. Chrome 또는 Edge를 사용하거나 수동 저장을 이용하세요.";
    pickFolderButton.disabled = true;
  }
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function renderCategoryOptions() {
  const categories = [...new Set(workingPrompts.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  categoryOptions.innerHTML = categories.map(category => `<option value="${escapeAttribute(category)}"></option>`).join("");
}

function getNextId() {
  const maxNumber = workingPrompts.reduce((max, item) => {
    const match = String(item.id || "").match(/(\d+)/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `P-${String(maxNumber + 1).padStart(3, "0")}`;
}

function updateNextId() {
  nextIdBadge.textContent = `다음 번호 ${getNextId()}`;
}

async function chooseProjectFolder() {
  clearStatus();
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "damyo-prompts-project" });
    await verifyProjectFolder(handle);
    await loadProjectData(handle);
    projectDirectoryHandle = handle;
    folderStatus.textContent = `연결됨: ${handle.name} · 게시글 ${workingPrompts.length}개` ;
    renderCategoryOptions();
    updateNextId();
    pickFolderButton.textContent = "다른 폴더 선택";
  } catch (error) {
    if (error?.name === "AbortError") return;
    showStatus(error.message || "사이트 폴더를 연결하지 못했습니다.", true);
  }
}

async function verifyProjectFolder(handle) {
  try {
    await handle.getFileHandle("index.html");
    await handle.getFileHandle("prompts.js");
    await handle.getDirectoryHandle("images");
  } catch {
    throw new Error("index.html, prompts.js, images 폴더가 들어 있는 사이트 최상위 폴더를 선택해 주세요.");
  }
}

async function loadProjectData(handle) {
  const promptsHandle = await handle.getFileHandle("prompts.js");
  const file = await promptsHandle.getFile();
  const source = await file.text();

  try {
    const parsed = new Function(`${source}\nreturn { SITE_CONFIG, PROMPTS };`)();
    if (!Array.isArray(parsed.PROMPTS)) throw new Error("PROMPTS 배열을 찾을 수 없습니다.");
    workingPrompts = parsed.PROMPTS.map(item => structuredCloneSafe(item));
    workingSiteConfig = structuredCloneSafe(parsed.SITE_CONFIG || SITE_CONFIG);
  } catch (error) {
    throw new Error(`선택한 폴더의 prompts.js를 읽지 못했습니다: ${error.message}`);
  }
}

function addFiles(files) {
  const validFiles = [...files].filter(file => file.type.startsWith("image/"));
  if (!validFiles.length) return;

  const newItems = validFiles.map(file => ({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    file,
    previewUrl: URL.createObjectURL(file),
    title: "",
    caption: "",
    prompt: ""
  }));

  imageItems.push(...newItems);
  imageInput.value = "";
  updateImageList();
}

function updateImageList() {
  imageList.innerHTML = "";
  imageEmpty.hidden = imageItems.length > 0;

  imageItems.forEach((item, index) => {
    const card = imageCardTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.id = item.id;
    card.querySelector(".image-preview").src = item.previewUrl;
    card.querySelector(".image-preview").alt = `${index + 1}번째 미리보기`;
    card.querySelector(".image-order").textContent = index + 1;
    card.querySelector(".image-file-name").textContent = item.file.name;

    const titleField = card.querySelector(".scene-title");
    const captionField = card.querySelector(".scene-caption");
    const promptField = card.querySelector(".scene-prompt");
    titleField.value = item.title;
    captionField.value = item.caption;
    promptField.value = item.prompt;

    titleField.addEventListener("input", event => item.title = event.target.value);
    captionField.addEventListener("input", event => item.caption = event.target.value);
    promptField.addEventListener("input", event => item.prompt = event.target.value);

    card.querySelector(".move-up").disabled = index === 0;
    card.querySelector(".move-down").disabled = index === imageItems.length - 1;
    card.querySelector(".move-up").addEventListener("click", () => moveItem(index, index - 1));
    card.querySelector(".move-down").addEventListener("click", () => moveItem(index, index + 1));
    card.querySelector(".remove-image").addEventListener("click", () => removeItem(item.id));

    card.addEventListener("dragstart", () => {
      draggedImageId = item.id;
      card.classList.add("drag-source");
    });
    card.addEventListener("dragend", () => {
      draggedImageId = null;
      card.classList.remove("drag-source");
      document.querySelectorAll(".image-card").forEach(element => element.classList.remove("drag-over"));
    });
    card.addEventListener("dragover", event => {
      event.preventDefault();
      if (draggedImageId && draggedImageId !== item.id) card.classList.add("drag-over");
    });
    card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
    card.addEventListener("drop", event => {
      event.preventDefault();
      card.classList.remove("drag-over");
      reorderById(draggedImageId, item.id);
    });

    imageList.appendChild(card);
  });
}

function moveItem(fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= imageItems.length) return;
  const [item] = imageItems.splice(fromIndex, 1);
  imageItems.splice(toIndex, 0, item);
  updateImageList();
}

function reorderById(sourceId, targetId) {
  if (!sourceId || sourceId === targetId) return;
  const sourceIndex = imageItems.findIndex(item => item.id === sourceId);
  const targetIndex = imageItems.findIndex(item => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  moveItem(sourceIndex, targetIndex);
}

function removeItem(id) {
  const index = imageItems.findIndex(item => item.id === id);
  if (index < 0) return;
  URL.revokeObjectURL(imageItems[index].previewUrl);
  imageItems.splice(index, 1);
  updateImageList();
}

function validatePost() {
  if (!titleInput.value.trim()) throw new Error("게시글 제목을 입력해 주세요.");
  if (!categoryInput.value.trim()) throw new Error("카테고리를 입력해 주세요.");
  if (!imageItems.length) throw new Error("이미지를 한 장 이상 추가해 주세요.");

  const hasAnyPrompt = commonPromptInput.value.trim() || imageItems.some(item => item.prompt.trim());
  if (!hasAnyPrompt) throw new Error("공통 프롬프트 또는 장면별 프롬프트를 하나 이상 입력해 주세요.");
}

function createPostData() {
  validatePost();
  const id = getNextId();
  const numericId = id.match(/\d+/)?.[0] || "000";
  const images = imageItems.map((item, index) => {
    const extension = detectExtension(item.file);
    const src = `images/p${numericId}-${String(index + 1).padStart(2, "0")}.${extension}`;
    return removeEmptyValues({
      src,
      title: item.title.trim(),
      caption: item.caption.trim(),
      prompt: item.prompt.trim()
    });
  });

  return removeEmptyValues({
    id,
    title: titleInput.value.trim(),
    category: categoryInput.value.trim(),
    cover: images[0].src,
    description: descriptionInput.value.trim(),
    prompt: commonPromptInput.value.trim(),
    images
  });
}

function detectExtension(file) {
  const byName = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (byName && ["jpg", "jpeg", "png", "webp", "avif"].includes(byName)) {
    return byName === "jpeg" ? "jpg" : byName;
  }
  return ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif"
  })[file.type] || "jpg";
}

function removeEmptyValues(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== "" && value !== null && value !== undefined;
  }));
}

async function savePost(event) {
  event.preventDefault();
  clearStatus();

  try {
    if (!projectDirectoryHandle) {
      throw new Error("먼저 사이트 폴더를 선택해 주세요.");
    }

    saveButton.disabled = true;
    saveButton.textContent = "저장 중…";

    const post = createPostData();
    const imagesDirectory = await projectDirectoryHandle.getDirectoryHandle("images");

    for (let index = 0; index < imageItems.length; index += 1) {
      const fileName = post.images[index].src.replace(/^images\//, "");
      const fileHandle = await imagesDirectory.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(imageItems[index].file);
      await writable.close();
    }

    workingPrompts.unshift(post);
    await writePromptsFile(projectDirectoryHandle, workingPrompts);

    showStatus(`${post.id} 게시글과 이미지 ${imageItems.length}장을 저장했습니다. 이제 GitHub Desktop에서 변경사항을 Commit & Push 하세요.`);
    resetFormAfterSave();
  } catch (error) {
    showStatus(error.message || "저장 중 문제가 발생했습니다.", true);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "게시글 저장";
  }
}

async function writePromptsFile(directoryHandle, prompts) {
  const fileHandle = await directoryHandle.getFileHandle("prompts.js", { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(serializePromptsFile(prompts));
  await writable.close();
}

function serializePromptsFile(prompts) {
  return `/*\n게시글은 post-maker.html에서 추가하는 것을 권장합니다.\n기존 단일 이미지 형식(image)과 새 캐러셀 형식(images)을 모두 지원합니다.\n*/\n\nconst SITE_CONFIG = ${JSON.stringify(workingSiteConfig, null, 2)};\n\nconst PROMPTS = ${JSON.stringify(prompts, null, 2)};\n`;
}

function resetFormAfterSave() {
  form.reset();
  imageItems.forEach(item => URL.revokeObjectURL(item.previewUrl));
  imageItems = [];
  updateImageList();
  updateNextId();
  renderCategoryOptions();
}

async function downloadManualFiles() {
  clearStatus();
  try {
    const post = createPostData();
    const nextPrompts = [post, ...workingPrompts];

    downloadBlob(new Blob([serializePromptsFile(nextPrompts)], { type: "text/javascript;charset=utf-8" }), "prompts.js");

    imageItems.forEach((item, index) => {
      const fileName = post.images[index].src.replace(/^images\//, "");
      setTimeout(() => downloadBlob(item.file, fileName), 250 * (index + 1));
    });

    showStatus("파일을 내려받았습니다. prompts.js는 사이트 최상단에 덮어쓰고, 이미지들은 images 폴더에 넣으세요.");
  } catch (error) {
    showStatus(error.message || "파일을 만들지 못했습니다.", true);
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function showStatus(message, isError = false) {
  saveStatus.textContent = message;
  saveStatus.classList.toggle("error", isError);
}

function clearStatus() {
  saveStatus.textContent = "";
  saveStatus.classList.remove("error");
}

function escapeAttribute(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

pickFolderButton.addEventListener("click", chooseProjectFolder);
imageInput.addEventListener("change", event => addFiles(event.target.files));
form.addEventListener("submit", savePost);
downloadButton.addEventListener("click", downloadManualFiles);

dropZone.addEventListener("click", () => imageInput.click());
dropZone.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    imageInput.click();
  }
});

for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
}

dropZone.addEventListener("drop", event => addFiles(event.dataTransfer.files));
