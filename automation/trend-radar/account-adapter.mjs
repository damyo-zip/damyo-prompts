const animalLabels = { dog: "강아지", cat: "고양이", hamster: "햄스터" };

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

export { adaptConcept, adaptationFor, animalForAccount };
