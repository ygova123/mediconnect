import { createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth } from "./firebase.js";
import {
  subscribeCities, subscribeContentMeta, subscribeDietPlans, subscribeDietQuestions,
  subscribeHospitals, subscribePcosGuide, subscribePcosPlans, subscribeTags,
} from "./data.js";
import { renderIcons } from "./icons.js";
import { SAMPLE_DIET_PLANS, SAMPLE_PCOS_GUIDE, SAMPLE_PCOS_PLANS } from "./sample-content.js";

const $ = (selector) => document.querySelector(selector);
const state = {
  user: null, hospitals: [], cities: [], tags: [], dietPlans: [], dietPlansFromDb: [],
  dietQuestions: [], contentMeta: {}, pcosGuide: SAMPLE_PCOS_GUIDE, pcosPlans: [],
  pcosPlansFromDb: [],
  query: "", city: "", page: "home", mode: "login", stop: [],
  dietGoalFilter: "all", dietRecommendations: [],
};
const DIET_GOALS = [
  { value: "weight-management", label: "Gradual weight management", short: "Weight management", icon: "activity" },
  { value: "skin-support", label: "Skin-supportive nutrition", short: "Skin support", icon: "sparkles" },
  { value: "balanced-eating", label: "Balanced everyday eating", short: "Balanced eating", icon: "salad" },
];
const DIET_TYPES = [
  { value: "any", label: "Flexible / no preference" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "omnivore", label: "Includes meat / fish" },
];
const AVOID_OPTIONS = ["Milk", "Eggs", "Wheat", "Peanuts", "Tree nuts", "Soy", "Fish", "Shellfish", "Sesame"];
const DEFAULT_DIET_QUESTIONS = [
  { id: "goal", kind: "goal", label: "What would you like your meal ideas to focus on?" },
  { id: "dietType", kind: "dietType", label: "Which eating style would you prefer?" },
  { id: "avoidIngredients", kind: "avoidIngredients", label: "Are there ingredients you would like to filter out?" },
];
let toastTimer;

renderIcons();
bindAuth();
bindNavigation();
bindSearch();
bindUserMenu();
bindDietPlanner();

onAuthStateChanged(auth, (user) => {
  state.user = user;
  if (!user) {
    state.stop.forEach((stop) => stop());
    state.stop = [];
    $("#user-app").classList.add("hidden");
    $("#auth-screen").classList.remove("hidden");
    return;
  }
  $("#auth-screen").classList.add("hidden");
  $("#user-app").classList.remove("hidden");
  updateUserDetails(user);
  subscribeUserData();
});

function bindAuth() {
  $("#auth-switch").addEventListener("click", () => {
    state.mode = state.mode === "login" ? "signup" : "login";
    $("#auth-error").classList.add("hidden");
    $("#auth-kicker").textContent = state.mode === "login" ? "WELCOME BACK" : "GET STARTED";
    $("#auth-title").textContent = state.mode === "login" ? "Sign in to MediConnect" : "Create your account";
    $("#auth-description").textContent = state.mode === "login" ? "Your healthcare discovery journey starts here." : "Join us to find care that fits your needs.";
    $("#name-field").classList.toggle("hidden", state.mode !== "signup");
    $("#auth-name").required = state.mode === "signup";
    $("#auth-password").autocomplete = state.mode === "signup" ? "new-password" : "current-password";
    $("#email-submit").innerHTML = `${state.mode === "login" ? "Sign in" : "Create account"} <i data-icon="arrow-right"></i>`;
    $("#auth-switch-copy").textContent = state.mode === "login" ? "New to MediConnect?" : "Already have an account?";
    $("#auth-switch").textContent = state.mode === "login" ? "Create an account" : "Sign in";
    renderIcons($("#email-submit"));
  });

  $("#email-auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthBusy(true);
    showAuthError("");
    try {
      const email = $("#auth-email").value.trim();
      const password = $("#auth-password").value;
      if (state.mode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const displayName = $("#auth-name").value.trim();
        if (displayName) await updateProfile(credential.user, { displayName });
        updateUserDetails(credential.user);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      showAuthError(authMessage(error));
    } finally {
      setAuthBusy(false);
    }
  });

  $("#google-auth").addEventListener("click", async () => {
    setAuthBusy(true);
    showAuthError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      showAuthError(authMessage(error));
    } finally {
      setAuthBusy(false);
    }
  });

  $("#sign-out").addEventListener("click", () => signOut(auth).catch((error) => showToast(authMessage(error), true)));
  $("#profile-sign-out").addEventListener("click", () => signOut(auth).catch((error) => showToast(authMessage(error), true)));
}

function bindNavigation() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-page-link]");
    if (link) {
      event.preventDefault();
      showPage(link.dataset.pageLink);
      $("#user-menu").classList.add("hidden");
      $("#user-menu-button").setAttribute("aria-expanded", "false");
    }
  });
}

function bindSearch() {
  $("#hospital-search").addEventListener("submit", (event) => {
    event.preventDefault();
    state.query = $("#search-input").value.trim();
    renderHospitals();
    $("#hospital-grid").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#search-input").addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    $("#clear-search").classList.toggle("hidden", !state.query);
    $("#reset-filters").classList.toggle("hidden", !state.query && !state.city);
    renderHospitals();
  });
  $("#clear-search").addEventListener("click", () => {
    $("#search-input").value = "";
    state.query = "";
    $("#clear-search").classList.add("hidden");
    $("#reset-filters").classList.toggle("hidden", !state.city);
    renderHospitals();
  });
  $("#reset-filters").addEventListener("click", clearFilters);
}

function bindUserMenu() {
  $("#user-menu-button").addEventListener("click", () => {
    const isOpen = !$("#user-menu").classList.contains("hidden");
    $("#user-menu").classList.toggle("hidden", isOpen);
    $("#user-menu-button").setAttribute("aria-expanded", String(!isOpen));
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".user-menu-wrap")) {
      $("#user-menu").classList.add("hidden");
      $("#user-menu-button").setAttribute("aria-expanded", "false");
    }
  });
}

function subscribeUserData() {
  state.stop.forEach((stop) => stop());
  const report = (error) => showDataError(error?.message || "Unable to load hospital information.");
  state.stop = [
    subscribeHospitals((items) => { state.hospitals = items; hideDataError(); renderHospitals(); }, report),
    subscribeCities((items) => { state.cities = items; renderCities(); }, report),
    subscribeTags((items) => { state.tags = items; renderHospitals(); }, report),
    subscribeDietPlans((items) => { state.dietPlansFromDb = items; syncWellnessPlans(); hideDietError(); }, showDietError),
    subscribeDietQuestions((items) => { state.dietQuestions = items; hideDietError(); renderDietQuestions(); }, showDietError),
    subscribePcosGuide((guide) => { state.pcosGuide = guide || SAMPLE_PCOS_GUIDE; renderPcosContent(); hidePcosError(); }, showPcosError),
    subscribePcosPlans((items) => { state.pcosPlansFromDb = items; syncWellnessPlans(); hidePcosError(); }, showPcosError),
    subscribeContentMeta((meta) => { state.contentMeta = meta; syncWellnessPlans(); }, (error) => { showDietError(error); showPcosError(error); }),
  ];
}

function updateUserDetails(user) {
  const name = user.displayName || user.email?.split("@")[0] || "Member";
  $("#user-menu-name").textContent = name;
  $("#menu-user-name").textContent = name;
  $("#menu-user-email").textContent = user.email || "";
  setAvatar($("#user-avatar"), user);
  $("#profile-name").textContent = user.displayName || "MediConnect member";
  $("#profile-name-detail").textContent = user.displayName || "Not provided";
  $("#profile-email").textContent = user.email || "Not provided";
  $("#profile-verification").textContent = user.emailVerified ? "Email verified" : "Signed in";
  $("#profile-created").textContent = user.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "—";
  setAvatar($("#profile-avatar"), user);
}

function setAvatar(element, user) {
  if (user.photoURL) {
    element.innerHTML = "";
    element.style.backgroundImage = `url("${escapeAttribute(user.photoURL)}")`;
    element.style.backgroundSize = "cover";
    element.style.backgroundPosition = "center";
    element.textContent = "";
  } else {
    element.style.backgroundImage = "";
    element.textContent = (user.displayName || user.email || "M").slice(0, 1).toUpperCase();
  }
}

function showPage(name) {
  state.page = ["home", "diet", "pcos", "profile"].includes(name) ? name : "home";
  document.querySelectorAll(".page-section").forEach((section) => section.classList.add("hidden"));
  $(`#page-${state.page}`).classList.remove("hidden");
  document.querySelectorAll("[data-page-link]").forEach((link) => link.classList.toggle("active", link.dataset.pageLink === state.page));
  if (state.page === "diet") {
    renderDietQuestions();
    renderDietGoalFilters();
    renderDietPlans();
  }
  if (state.page === "pcos") renderPcosContent();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindDietPlanner() {
  $("#start-diet-quiz").addEventListener("click", () => {
    $("#diet-quiz").classList.remove("hidden");
    renderDietQuestions();
    $("#diet-quiz").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#close-diet-quiz").addEventListener("click", () => $("#diet-quiz").classList.add("hidden"));
  $("#edit-diet-answers").addEventListener("click", () => {
    $("#diet-quiz").classList.remove("hidden");
    $("#diet-quiz").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#diet-quiz-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const answers = new FormData(event.currentTarget);
    state.dietRecommendations = state.dietPlans.filter((plan) => matchesDietAnswers(plan, {
      goal: String(answers.get("goal") || ""),
      dietType: String(answers.get("dietType") || "any"),
      avoidIngredients: answers.getAll("avoidIngredients").map(String),
    }));
    renderDietRecommendations();
    $("#diet-recommendations").classList.remove("hidden");
    $("#diet-recommendations").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#diet-quiz-form").addEventListener("reset", () => {
    state.dietRecommendations = [];
    $("#diet-recommendations").classList.add("hidden");
  });
  $("#diet-goal-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-diet-goal]");
    if (!button) return;
    state.dietGoalFilter = button.dataset.dietGoal;
    renderDietGoalFilters();
    renderDietPlans();
  });
  $("#diet-plans-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-diet-plan]");
    if (button) showDietPlanDetails(button.dataset.openDietPlan, "diet");
  });
  $("#diet-recommended-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-diet-plan]");
    if (button) showDietPlanDetails(button.dataset.openDietPlan, "diet");
  });
  $("#pcos-plans-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-diet-plan]");
    if (button) showDietPlanDetails(button.dataset.openDietPlan, "pcos");
  });
  $("#close-diet-detail").addEventListener("click", closeDietPlanDetails);
  $("#diet-detail-dismiss").addEventListener("click", closeDietPlanDetails);
  $("#diet-plan-dialog").addEventListener("click", (event) => {
    if (event.target === $("#diet-plan-dialog")) closeDietPlanDetails();
  });
}

function syncWellnessPlans() {
  state.dietPlans = state.dietPlansFromDb.length
    ? state.dietPlansFromDb
    : state.contentMeta.dietSamplesV1 === true ? [] : SAMPLE_DIET_PLANS;
  state.pcosPlans = state.pcosPlansFromDb.length
    ? state.pcosPlansFromDb
    : state.contentMeta.pcosPlansV1 === true ? [] : SAMPLE_PCOS_PLANS;
  renderDietPlans();
  renderPcosContent();
}

function getDietQuestions() {
  const saved = new Map(state.dietQuestions.map((question) => [question.kind || question.id, question]));
  return DEFAULT_DIET_QUESTIONS.map((question) => ({
    ...question,
    label: saved.get(question.kind)?.label || question.label,
  }));
}

function renderDietQuestions() {
  const container = $("#diet-question-list");
  if (!container) return;
  container.innerHTML = getDietQuestions().map((question, index) => {
    const heading = question.kind === "goal" ? "YOUR FOCUS" : question.kind === "dietType" ? "EATING STYLE" : "INGREDIENT FILTERS";
    if (question.kind === "avoidIngredients") {
      return `<fieldset class="diet-question"><legend><span class="question-number">0${index + 1}</span><span>${escapeHtml(question.label)}</span></legend><div class="diet-answer-grid avoid-answer-grid">${AVOID_OPTIONS.map((option) => `<label class="diet-answer-option diet-check-option"><input type="checkbox" name="avoidIngredients" value="${escapeAttribute(normalizeIngredient(option))}"><span>${escapeHtml(option)}</span></label>`).join("")}</div><small class="question-kind-label">${heading} · OPTIONAL</small></fieldset>`;
    }
    const options = question.kind === "goal" ? DIET_GOALS : DIET_TYPES;
    return `<fieldset class="diet-question"><legend><span class="question-number">0${index + 1}</span><span>${escapeHtml(question.label)}</span></legend><div class="diet-answer-grid">${options.map((option, optionIndex) => `<label class="diet-answer-option"><input type="radio" name="${question.kind}" value="${escapeAttribute(option.value)}" ${optionIndex === 0 ? "required" : ""}><span>${escapeHtml(option.label)}</span></label>`).join("")}</div><small class="question-kind-label">${heading}</small></fieldset>`;
  }).join("");
  renderIcons(container);
}

function renderDietGoalFilters() {
  const container = $("#diet-goal-filters");
  if (!container) return;
  const buttons = [
    { value: "all", label: "All plans" },
    ...DIET_GOALS.map((goal) => ({ value: goal.value, label: goal.short })),
  ];
  container.innerHTML = buttons.map((goal) => `<button type="button" class="diet-goal-chip ${state.dietGoalFilter === goal.value ? "active" : ""}" data-diet-goal="${goal.value}">${escapeHtml(goal.label)}</button>`).join("");
}

function renderDietPlans() {
  const container = $("#diet-plans-grid");
  if (!container) return;
  const plans = state.dietPlans.filter((plan) => state.dietGoalFilter === "all" || plan.goal === state.dietGoalFilter);
  container.innerHTML = plans.map((plan) => dietPlanCard(plan)).join("");
  const empty = plans.length === 0;
  $("#diet-empty-state").classList.toggle("hidden", !empty);
  $("#diet-empty-title").textContent = state.dietPlans.length ? "No plans in this category yet" : "No plans published yet";
  $("#diet-empty-copy").textContent = state.dietPlans.length ? "Try another goal category." : "Your admin can add plans in the Diet plans section.";
  renderIcons(container);
}

function renderDietRecommendations() {
  const container = $("#diet-recommended-grid");
  container.innerHTML = state.dietRecommendations.map((plan) => dietPlanCard(plan, true)).join("");
  $("#diet-recommendations").classList.toggle("hidden", state.dietRecommendations.length === 0);
  if (state.dietRecommendations.length) renderIcons(container);
  else {
    $("#diet-recommendations").classList.remove("hidden");
    container.innerHTML = `<div class="diet-no-match"><span class="empty-icon"><i data-icon="leaf"></i></span><h3>No matching plan found</h3><p>Try a different eating style or clear an ingredient filter. Your answers are not saved.</p></div>`;
    renderIcons(container);
  }
}

function dietPlanCard(plan, recommended = false) {
  const goal = DIET_GOALS.find((item) => item.value === plan.goal);
  const mealPreview = [plan.breakfast, plan.lunch, plan.dinner].filter(Boolean).slice(0, 2);
  const dietType = DIET_TYPES.find((item) => item.value === plan.dietType)?.label || "Flexible";
  const image = safeMealImage(plan.image);
  return `<article class="diet-plan-card ${recommended ? "recommended" : ""}">
    ${image ? `<div class="diet-plan-photo"><img src="${image}" alt="${escapeAttribute(plan.title || "Meal idea")}" loading="lazy"></div>` : ""}
    <div class="diet-plan-card-top"><span class="diet-plan-icon"><i data-icon="${goal?.icon || "salad"}"></i></span><span class="diet-plan-goal">${escapeHtml(goal?.short || "Meal inspiration")}</span>${recommended ? `<span class="match-badge"><i data-icon="sparkles"></i> MATCH</span>` : ""}</div>
    <h3>${escapeHtml(plan.title || "Meal plan")}</h3>
    <p class="diet-plan-description">${escapeHtml(plan.description || "")}</p>
    <div class="diet-plan-type"><i data-icon="leaf"></i>${escapeHtml(dietType)}</div>
    ${mealPreview.length ? `<div class="diet-meal-preview">${mealPreview.map((meal, index) => `<div><span>${index === 0 ? "BREAKFAST" : "LUNCH"}</span><b>${escapeHtml(meal)}</b></div>`).join("")}</div>` : ""}
    <button class="diet-plan-open" type="button" data-open-diet-plan="${escapeAttribute(plan.id)}">View full plan <i data-icon="arrow-right"></i></button>
  </article>`;
}

function matchesDietAnswers(plan, answers) {
  if (plan.goal !== answers.goal) return false;
  const planType = plan.dietType || "any";
  if (answers.dietType !== "any" && planType !== "any" && planType !== answers.dietType) return false;
  const included = (Array.isArray(plan.ingredients) ? plan.ingredients : [])
    .map(normalizeIngredient);
  return !answers.avoidIngredients.some((ingredient) => included.includes(ingredient));
}

function showDietPlanDetails(id, source = "diet") {
  const plan = (source === "pcos" ? state.pcosPlans : state.dietPlans).find((item) => item.id === id);
  if (!plan) return;
  const goal = DIET_GOALS.find((item) => item.value === plan.goal);
  const type = DIET_TYPES.find((item) => item.value === plan.dietType)?.label || "Flexible / any";
  $("#diet-detail-goal").textContent = source === "pcos" ? `${plan.focus || "PCOD / PCOS"} · General meal inspiration` : goal?.label || "Meal inspiration";
  $("#diet-detail-title").textContent = plan.title || "Meal plan";
  $("#diet-detail-description").textContent = plan.description || "";
  $("#diet-detail-meta").innerHTML = `<span><i data-icon="leaf"></i>${escapeHtml(source === "pcos" ? "Flexible meal ideas" : type)}</span><span><i data-icon="sparkles"></i>General wellness</span>`;
  $("#diet-detail-breakfast").textContent = plan.breakfast || "Not provided";
  $("#diet-detail-lunch").textContent = plan.lunch || "Not provided";
  $("#diet-detail-dinner").textContent = plan.dinner || "Not provided";
  $("#diet-detail-snacks").textContent = plan.snacks || "No snack ideas listed";
  const ingredients = Array.isArray(plan.ingredients) ? plan.ingredients : [];
  $("#diet-detail-ingredients").textContent = ingredients.length ? `Ingredients listed for filtering: ${ingredients.join(", ")}. Please verify food labels yourself; this list is not a guarantee for allergies.` : "No ingredients were listed for filtering. Check all food labels for your own needs.";
  renderIcons($("#diet-plan-dialog"));
  $("#diet-plan-dialog").showModal();
}

function renderPcosContent() {
  const guide = state.pcosGuide || SAMPLE_PCOS_GUIDE;
  $("#pcos-guide-title").textContent = guide.title || SAMPLE_PCOS_GUIDE.title;
  $("#pcos-guide-description").textContent = guide.description || SAMPLE_PCOS_GUIDE.description;
  const foods = Array.isArray(guide.foods) ? guide.foods.filter((item) => typeof item === "string" && item.trim()) : [];
  const foodImages = ["meal-colorful-plate.jpg", "meal-green-bowl.jpg", "meal-grain-bowl.jpg", "meal-breakfast.jpg"];
  $("#pcos-food-grid").innerHTML = foods.map((food, index) => `<article class="pcos-food-card"><div class="pcos-food-photo"><img src="${foodImages[index % foodImages.length]}" alt="" loading="lazy"><span class="pcos-food-count">0${index + 1}</span></div><div class="pcos-food-copy"><span>FOOD TO EXPLORE</span><p>${escapeHtml(food)}</p></div></article>`).join("");
  const precautions = Array.isArray(guide.precautions) ? guide.precautions.filter((item) => typeof item === "string" && item.trim()) : [];
  const precautionIcons = ["shield-check", "info", "heart-pulse", "calendar-heart"];
  $("#pcos-precaution-grid").innerHTML = precautions.map((item, index) => `<article class="pcos-precaution-card"><span class="pcos-precaution-icon"><i data-icon="${precautionIcons[index % precautionIcons.length]}"></i></span><p>${escapeHtml(item)}</p></article>`).join("");
  $("#pcos-plans-grid").innerHTML = state.pcosPlans.map(pcosPlanCard).join("");
  $("#pcos-plans-empty").classList.toggle("hidden", state.pcosPlans.length > 0);
  renderIcons($("#pcos-food-grid"));
  renderIcons($("#pcos-precaution-grid"));
  renderIcons($("#pcos-plans-grid"));
}

function pcosPlanCard(plan) {
  const image = safeMealImage(plan.image);
  const mealPreview = [plan.breakfast, plan.lunch, plan.dinner].filter(Boolean).slice(0, 2);
  return `<article class="diet-plan-card pcos-plan-card">
    ${image ? `<div class="diet-plan-photo"><img src="${image}" alt="${escapeAttribute(plan.title || "PCOD / PCOS meal idea")}" loading="lazy"></div>` : ""}
    <div class="diet-plan-card-top"><span class="diet-plan-icon"><i data-icon="heart-pulse"></i></span><span class="diet-plan-goal">${escapeHtml(plan.focus || "Meal inspiration")}</span></div>
    <h3>${escapeHtml(plan.title || "Meal plan")}</h3>
    <p class="diet-plan-description">${escapeHtml(plan.description || "")}</p>
    ${mealPreview.length ? `<div class="diet-meal-preview">${mealPreview.map((meal, index) => `<div><span>${index === 0 ? "BREAKFAST" : "LUNCH"}</span><b>${escapeHtml(meal)}</b></div>`).join("")}</div>` : ""}
    <button class="diet-plan-open" type="button" data-open-diet-plan="${escapeAttribute(plan.id)}">View full plan <i data-icon="arrow-right"></i></button>
  </article>`;
}

function safeMealImage(value) {
  return /^meal-[a-z0-9-]+\.jpg$/.test(value || "") ? value : "";
}

function closeDietPlanDetails() {
  if ($("#diet-plan-dialog").open) $("#diet-plan-dialog").close();
}

function normalizeIngredient(value) {
  return String(value || "").toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function renderCities() {
  const container = $("#city-chips");
  const cities = [...state.cities].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (state.city && !cities.some((city) => city.name === state.city)) state.city = "";
  container.innerHTML = [
    `<button class="city-chip ${state.city ? "" : "selected"}" data-city="">All cities</button>`,
    ...cities.map((city) => `<button class="city-chip ${state.city === city.name ? "selected" : ""}" data-city="${escapeAttribute(city.name)}">${escapeHtml(city.name)}</button>`),
  ].join("");
  container.querySelectorAll("[data-city]").forEach((button) => button.addEventListener("click", () => {
    state.city = button.dataset.city;
    renderCities();
    $("#reset-filters").classList.toggle("hidden", !state.query && !state.city);
    renderHospitals();
  }));
}

function renderHospitals() {
  const term = state.query.toLocaleLowerCase();
  const filtered = state.hospitals.filter((hospital) => {
    const matchesText = !term || String(hospital.name || "").toLocaleLowerCase().includes(term) || String(hospital.city || "").toLocaleLowerCase().includes(term);
    return matchesText && (!state.city || hospital.city === state.city);
  });
  $("#hospital-count").textContent = `(${filtered.length})`;
  $("#reset-filters").classList.toggle("hidden", !state.query && !state.city);
  $("#hospital-grid").innerHTML = filtered.map(hospitalCard).join("");
  $("#empty-state").classList.toggle("hidden", filtered.length > 0);
  $("#hospital-grid").classList.toggle("hidden", filtered.length === 0);
  $("#empty-title").textContent = state.hospitals.length ? "No hospitals found" : "No hospitals yet";
  $("#empty-copy").textContent = state.hospitals.length ? "Try a different search or city." : "Hospital listings will appear here once they are added.";
  renderIcons($("#hospital-grid"));
}

function hospitalCard(hospital) {
  const rating = Number(hospital.rating || 0);
  const ratingText = Number.isFinite(rating) ? rating.toFixed(1) : "0.0";
  const images = Array.isArray(hospital.images) ? hospital.images.filter(isSafeImageUrl) : [];
  const tags = state.tags.filter((tag) => Array.isArray(hospital.tagIds) && hospital.tagIds.includes(tag.id));
  const stars = Array.from({ length: 5 }, (_, i) => `<i data-icon="star" class="${i < Math.round(rating) ? "filled" : ""}"></i>`).join("");
  const phone = String(hospital.callPhoneNumber || "");
  const phoneHref = phone.replace(/[^\d+*#]/g, "");
  const location = hospital.address || [hospital.district, hospital.city].filter(Boolean).join(", ");
  const reviewLabel = hospital.hasNoReviews ? "No reviews yet" : `${Number(hospital.reviewsCount || 0)} reviews`;
  const specialtyValues = Array.isArray(hospital.specialties)
    ? hospital.specialties
    : String(hospital.specialties || "").split(",");
  const specialties = specialtyValues
    .filter((value) => typeof value === "string" && value.trim()).slice(0, 3);
  const hospitalType = String(hospital.hospitalType || "Hospital");
  const openingHours = String(hospital.openingHours || "");
  return `<article class="hospital-card">
    <div class="hospital-photo">${images[0] ? `<img loading="lazy" src="${escapeAttribute(images[0])}" alt="${escapeAttribute(hospital.name || "Hospital")}">` : `<div class="photo-fallback"><img src="hospital-corridor.jpg" alt="" loading="lazy"><span><i data-icon="building-2"></i></span><small>Representative hospital photo</small></div>`}<span class="photo-type"><i data-icon="stethoscope"></i>${escapeHtml(hospitalType)}</span>${images.length > 1 ? `<span class="photo-count"><i data-icon="image-plus"></i>${images.length} photos</span>` : ""}</div>
    <div class="hospital-info">
      <div class="hospital-top"><div class="hospital-title"><h3>${escapeHtml(hospital.name || "Hospital")}</h3><div class="hospital-place"><i data-icon="map-pin"></i>${escapeHtml([hospital.district, hospital.city].filter(Boolean).join(", "))}</div></div><div class="rating-badge"><div class="rating-line"><span class="rating-stars">${stars}</span><b>${escapeHtml(ratingText)}</b></div><div class="review-count">${escapeHtml(reviewLabel)}</div></div></div>
      <p class="hospital-summary">${escapeHtml(hospital.summarizedReview || "Hospital details and care information are available. Contact the hospital to learn more.")}</p>
      ${specialties.length ? `<div class="hospital-specialties"><span class="detail-label"><i data-icon="stethoscope"></i> SPECIALTIES</span><div class="specialty-list">${specialties.map((item) => `<span class="specialty-pill">${escapeHtml(item)}</span>`).join("")}</div></div>` : ""}
      <div class="hospital-facts">
        ${openingHours ? `<span class="hospital-fact"><i data-icon="clock-3"></i><span><small>HOURS</small><b>${escapeHtml(openingHours)}</b></span></span>` : ""}
        <span class="hospital-fact ${hospital.emergencyAvailable ? "emergency-on" : "emergency-off"}"><i data-icon="ambulance"></i><span><small>EMERGENCY</small><b>${hospital.emergencyAvailable ? "Ambulance available" : "Not available"}</b></span></span>
      </div>
      <div class="hospital-meta"><span class="hospital-location"><i data-icon="map-pin"></i><span>${escapeHtml(location || hospital.city || "Location not provided")}</span></span><span class="appointment-status ${hospital.appointmentAvailable ? "available" : ""}"><i data-icon="calendar-check"></i>Appointments ${hospital.appointmentAvailable ? "available" : "not available"}</span></div>
      ${tags.length ? `<div class="hospital-tags">${tags.map((tag) => `<span class="tag-pill" style="--tag-color:${safeColor(tag.color)}">${escapeHtml(tag.name)}</span>`).join("")}</div>` : ""}
      ${phoneHref ? `<a class="call-link" href="tel:${escapeAttribute(phoneHref)}"><i data-icon="phone-call"></i>Call Now <span class="call-number">${escapeHtml(phone)}</span></a>` : ""}
    </div>
  </article>`;
}

function clearFilters() {
  state.query = "";
  state.city = "";
  $("#search-input").value = "";
  $("#clear-search").classList.add("hidden");
  renderCities();
  renderHospitals();
}

function showAuthError(message) {
  const element = $("#auth-error");
  element.textContent = message;
  element.classList.toggle("hidden", !message);
}

function setAuthBusy(busy) {
  $("#email-submit").disabled = busy;
  $("#google-auth").disabled = busy;
  $("#email-submit").classList.toggle("is-loading", busy);
  $("#email-submit").setAttribute("aria-busy", String(busy));
}

function authMessage(error) {
  const code = error?.code || "";
  const messages = {
    "auth/invalid-email": "Enter a valid email address.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/user-not-found": "No account exists for this email.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/email-already-in-use": "An account already uses this email. Try signing in.",
    "auth/weak-password": "Use a password with at least 6 characters.",
    "auth/popup-closed-by-user": "The Google sign-in window was closed before completion.",
    "auth/unauthorized-domain": "This domain is not authorized in Firebase Authentication settings.",
    "auth/network-request-failed": "Network connection failed. Check your connection and try again.",
  };
  return messages[code] || error?.message || "Authentication failed. Please try again.";
}

function showDataError(message) {
  const element = $("#user-data-error");
  element.textContent = `Could not load hospital information: ${message}`;
  element.classList.remove("hidden");
}

function showDietError(error) {
  const element = $("#diet-data-error");
  element.textContent = `Could not load diet plans: ${error?.message || error || "Please try again later."}`;
  element.classList.remove("hidden");
}

function hideDietError() {
  $("#diet-data-error").classList.add("hidden");
}

function showPcosError(error) {
  const element = $("#pcos-data-error");
  element.textContent = `Could not load PCOD / PCOS content: ${error?.message || error || "Please try again later."}`;
  element.classList.remove("hidden");
}

function hidePcosError() {
  $("#pcos-data-error").classList.add("hidden");
}

function hideDataError() {
  $("#user-data-error").classList.add("hidden");
}

function showToast(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function isSafeImageUrl(value) {
  if (/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value || "")) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#0f766e";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
