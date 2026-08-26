const animalLabels = { dog: "강아지", cat: "고양이", hamster: "햄스터" };

const hamsterAdaptations = {
  "retro-direct-flash-dump": "아주 작은 햄스터가 미니 가방과 소품 사이에서 밤 외출을 즐기는 2000년대 디카 직광 photo dump",
  "scrapbook-carousel": "햄스터의 작은 하루와 볼주머니 디테일을 손으로 만든 미니 여행 저널 여러 페이지처럼 구성",
  "august-photo-grid": "한 마리 햄스터의 늦여름 하루를 작은 소품과 장소 변화가 이어지는 사진 기록으로 구성",
  "documentary-confession": "간식과 은신처에 집착하는 햄스터의 무심한 생활 장면을 작은 다큐멘터리 스틸처럼 연출",
  "paparazzi-chaos": "손바닥만 한 햄스터가 미니 레드카펫에 도착해 자기보다 큰 카메라 플래시를 받는 장면",
  "fashion-magazine-cover": "둥근 얼굴과 풍성한 볼살을 강조해 햄스터를 미니 패션잡지의 커버 스타처럼 촬영",
  "miniature-world": "본래 작은 햄스터가 더 작은 가게나 작업실에서 일하며 일상 사물과 극적인 이중 스케일 대비를 만드는 장면",
  "aura-farming-standoff": "아주 작은 햄스터가 거대한 빈 공간과 큰 생활 소품 사이에서 태연하게 시선을 장악하는 장면",
  "absurd-character-horror": "평범한 햄스터 방 사진 뒤 작은 터널 입구에 같은 햄스터가 한 번 더 등장하는 저예산 호러 코미디",
  "nostalgia-time-capsule": "햄스터의 어린 시절과 현재를 같은 손바닥 또는 작은 세트 구도로 비교하는 타임캡슐",
  "toy-scene-reenactment": "햄스터를 장난감보다 작은 영화 주연으로 두고 실제 미니 소품 세트에서 익숙한 장면을 재현",
  "cinematic-place-postcard": "햄스터의 작은 체구가 자연스럽게 읽히는 안전한 미니 여행 세트에서 목적지 인증사진을 촬영",
  "parallel-self-swap": "같은 햄스터의 왕실, 우주, 작은 직장인 버전을 볼살과 털무늬가 동일한 미니 가족사진으로 구성",
  "owner-pet-visual-comparison": "보호자의 얼굴·표정 또는 손바닥 위 포즈와 햄스터의 작은 얼굴·포즈를 의도적으로 직접 비교하는 관계형 초상",
  "cozy-hands-on-hobby": "햄스터가 앞발 크기에 맞는 아주 작은 공예 테이블에서 진지하게 손작업하는 생활 사진",
  "curated-clutter-maximalism": "햄스터가 자기보다 큰 수집품 사이의 작은 은신처에 파묻혀 스케일 대비가 살아나는 장면"
};

function withParticle(label, consonantForm, vowelForm) {
  const last = label.codePointAt(label.length - 1);
  const hasFinalConsonant = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `${label}${hasFinalConsonant ? consonantForm : vowelForm}`;
}

function animalForAccount(accountName = "") {
  const key = String(accountName).toLowerCase();
  if (["kongi", "콩이", "dog"].includes(key)) return "dog";
  if (["hamnimi", "햄님이", "hamster", "small"].includes(key)) return "hamster";
  if (["cat", "고양이"].includes(key)) return "cat";
  return "dog";
}

function adaptationFor(concept, animal) {
  if (animal === "hamster" && hamsterAdaptations[concept.concept_key]) {
    return hamsterAdaptations[concept.concept_key];
  }
  const label = animalLabels[animal] || "반려동물";
  return concept.adaptation
    .replaceAll("반려동물을", withParticle(label, "을", "를"))
    .replaceAll("반려동물이", withParticle(label, "이", "가"))
    .replaceAll("반려동물과", `${label}와`)
    .replaceAll("반려동물의", `${label}의`)
    .replaceAll("반려동물", label);
}

function adaptConcept(concept, accountName) {
  const animal = animalForAccount(accountName);
  return {
    ...concept,
    account_fit: concept.fit_scores?.[animal] ?? concept.baseline_scores.account_fit,
    dog_fit_score: concept.fit_scores?.dog ?? concept.baseline_scores.account_fit,
    cat_fit_score: concept.fit_scores?.cat ?? concept.baseline_scores.account_fit,
    hamster_fit_score: concept.fit_scores?.hamster ?? concept.baseline_scores.account_fit,
    dog_adaptation: adaptationFor(concept, "dog"),
    cat_adaptation: adaptationFor(concept, "cat"),
    hamster_adaptation: adaptationFor(concept, "hamster"),
    selected_account: String(accountName),
    selected_animal: animal
  };
}

export { adaptConcept, adaptationFor, animalForAccount, hamsterAdaptations };
