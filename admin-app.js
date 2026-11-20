import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth } from "./firebase.js";
import {
  createHospitalId, deleteCatalogItem, deleteDietPlan, deleteHospital, deletePcosPlan,
  markSampleContentReady, saveCatalogItem, saveDietPlan, saveDietQuestion, saveHospital, savePcosGuide, savePcosPlan,
  seedSampleRecordsOnce, subscribeAdmin, subscribeCities, subscribeDietPlans,
  subscribeDietQuestions, subscribeHospitals, subscribePcosGuide, subscribePcosPlans, subscribeTags,
} from "./data.js";
import { checkImageCount, compressHospitalImage, validateImage } from "./image-processing.js";
import { renderIcons } from "./icons.js";
import { SAMPLE_DIET_PLANS, SAMPLE_PCOS_GUIDE, SAMPLE_PCOS_PLANS } from "./sample-content.js";

const $ = (selector) => document.querySelector(selector);
const state = {
  user: null, isAdmin: false, hospitals: [], cities: [], tags: [], dietPlans: [], dietQuestions: [],
  pcosGuide: SAMPLE_PCOS_GUIDE, pcosPlans: [], page: "dashboard", sampleSeedsStarted: {},
  editingTag: "", editingCity: "", selectedFiles: [], existingImages: [], originalImages: [],
  imageUrls: [], dataStops: [], adminStop: null,
};
const DEFAULT_DIET_QUESTIONS = [
  { kind: "goal", label: "What would you like your meal ideas to focus on?", options: "Gradual weight management · skin-supportive nutrition · balanced everyday eating" },
  { kind: "dietType", label: "Which eating style would you prefer?", options: "Flexible · vegetarian · vegan · includes meat or fish" },
  { kind: "avoidIngredients", label: "Are there ingredients you would like to filter out?", options: "Milk · eggs · wheat · peanuts · tree nuts · soy · fish · shellfish · sesame" },
];
let toastTimer;

renderIcons();
bindAdminNavigation();
bindHospitalForm();
bindCatalogForms();
bindDietManagement();
bindPcosManagement();
$("#admin-signout").addEventListener("click", () => signOut(auth).catch((error) => showToast(error.message, true)));
$("#guard-signout").addEventListener("click", () => signOut(auth).catch((error) => showToast(error.message, true)));
window.addEventListener("hashchange", () => showAdminPage(location.hash.slice(1) || "dashboard", false));

onAuthStateChanged(auth, (user) => {
  state.user = user;
  state.dataStops.forEach((stop) => stop());
  state.dataStops = [];
  if (state.adminStop) state.adminStop();
  state.adminStop = null;
  if (!user) {
    showGuard("Sign in to manage hospitals", "Sign in with an administrator account to open the MediConnect dashboard.", true, false);
    return;
  }
  $("#guard-title").textContent = "Checking administrator access";
  $("#guard-message").textContent = "Please wait while we verify your account.";
  $("#guard-login").classList.add("hidden");
  $("#guard-signout").classList.add("hidden");
  $("#guard-spinner").classList.remove("hidden");
  $("#admin-app").classList.add("hidden");
  $("#admin-guard").classList.remove("hidden");
  state.adminStop = subscribeAdmin(user.uid, (isAdmin) => {
    state.isAdmin = isAdmin;
    if (!isAdmin) {
      showGuard("Administrator access required", `This account (${user.email || user.uid}) is not authorized to manage MediConnect. Add its UID under /admins in the Firebase Realtime Database console.`, false, true);
      return;
    }
    $("#admin-guard").classList.add("hidden");
    $("#admin-app").classList.remove("hidden");
    $("#admin-user-label").textContent = user.email || user.uid;
    subscribeAdminData();
    showAdminPage(location.hash.slice(1) || "dashboard", false);
  }, (error) => showGuard("Could not verify access", error.message, false, true));
});

function showGuard(title, message, showLogin, showSignOut) {
  $("#admin-app").classList.add("hidden");
  $("#admin-guard").classList.remove("hidden");
  $("#guard-title").textContent = title;
  $("#guard-message").textContent = message;
  $("#guard-login").classList.toggle("hidden", !showLogin);
  $("#guard-signout").classList.toggle("hidden", !showSignOut);
  $("#guard-spinner").classList.add("hidden");
}

function subscribeAdminData() {
  const report = (error) => showAdminError(error?.message || "Unable to load administrator data.");
  state.dataStops = [
    subscribeHospitals((items) => { state.hospitals = items; updateDashboard(); renderHospitalTable(); hideAdminError(); }, report),
    subscribeCities((items) => { state.cities = items; renderCitiesList(); renderCityOptions(); renderHospitalTable(); }, report),
    subscribeTags((items) => { state.tags = items; renderTagsList(); renderTagChoices(); }, report),
    subscribeDietPlans((items) => {
      state.dietPlans = items;
      renderDietPlansAdmin();
      if (!items.length) seedAdminSamples("dietSamplesV1", "dietPlans", SAMPLE_DIET_PLANS, "diet");
      else markAdminSamplesReady("dietSamplesV1", "diet");
    }, (error) => showDietAdminError(error.message)),
    subscribeDietQuestions((items) => { state.dietQuestions = items; renderDietQuestionsAdmin(); }, (error) => showDietAdminError(error.message)),
    subscribePcosGuide((guide) => {
      state.pcosGuide = guide || SAMPLE_PCOS_GUIDE;
      renderPcosGuideForm();
      if (!guide) seedAdminSamples("pcosGuideV1", "pcosGuide", [SAMPLE_PCOS_GUIDE], "pcos");
      else markAdminSamplesReady("pcosGuideV1", "pcos");
    }, (error) => showPcosAdminError(error.message)),
    subscribePcosPlans((items) => {
      state.pcosPlans = items;
      renderPcosPlansAdmin();
      if (!items.length) seedAdminSamples("pcosPlansV1", "pcosPlans", SAMPLE_PCOS_PLANS, "pcos");
      else markAdminSamplesReady("pcosPlansV1", "pcos");
    }, (error) => showPcosAdminError(error.message)),
  ];
}

function bindAdminNavigation() {
  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-admin-page]");
    if (nav) {
      showAdminPage(nav.dataset.adminPage);
      return;
    }
    if (event.target.closest("[data-open-hospital-form]")) openHospitalForm();
  });
}

function showAdminPage(page, updateHash = true) {
  const valid = ["dashboard", "hospitals", "tags", "cities", "diet-plans", "pcos-content"];
  state.page = valid.includes(page) ? page : "dashboard";
  document.querySelectorAll(".admin-view").forEach((view) => view.classList.add("hidden"));
  $(`#admin-view-${state.page}`).classList.remove("hidden");
  document.querySelectorAll(".admin-nav-link").forEach((button) => button.classList.toggle("active", button.dataset.adminPage === state.page));
  if (updateHash && location.hash !== `#${state.page}`) history.replaceState(null, "", `#${state.page}`);
}

function updateDashboard() {
  $("#stat-hospitals").textContent = state.hospitals.length;
  $("#stat-cities").textContent = state.cities.length;
  $("#stat-tags").textContent = state.tags.length;
  const recent = [...state.hospitals].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 5);
  $("#recent-hospitals").innerHTML = recent.length ? recent.map((hospital) => `<div class="recent-row"><div><b>${escapeHtml(hospital.name || "Hospital")}</b><small>${escapeHtml([hospital.city, hospital.district].filter(Boolean).join(" · ") || "City not set")}</small></div><button class="recent-edit" data-edit-hospital="${escapeAttribute(hospital.id)}">Edit</button></div>`).join("") : `<div class="table-empty">No hospitals yet. Add your first listing to get started.</div>`;
}

function renderHospitalTable() {
  const term = $("#hospital-admin-search").value.trim().toLocaleLowerCase();
  const city = $("#hospital-city-filter").value;
  const filtered = state.hospitals.filter((hospital) => (!term || `${hospital.name || ""} ${hospital.city || ""} ${hospital.district || ""}`.toLocaleLowerCase().includes(term)) && (!city || hospital.city === city));
  $("#hospitals-table").innerHTML = filtered.map((hospital) => {
    const image = Array.isArray(hospital.images) && isSafeImageUrl(hospital.images[0]) ? `<img src="${escapeAttribute(hospital.images[0])}" alt="">` : `<span class="table-placeholder"><i data-icon="building-2"></i></span>`;
    const subline = [hospital.hospitalType, hospital.district || "District not set"].filter(Boolean).join(" · ");
    return `<tr><td><div class="hospital-cell">${image}<span><b>${escapeHtml(hospital.name || "Hospital")}</b><small>${escapeHtml(subline)}</small></span></div></td><td>${escapeHtml(hospital.city || "—")}</td><td><b>${Number(hospital.rating || 0).toFixed(1)}</b> / 5</td><td><span class="status-pill ${hospital.appointmentAvailable ? "" : "off"}">${hospital.appointmentAvailable ? "Available" : "Not available"}</span></td><td><div class="row-actions"><button class="icon-button" title="Edit hospital" aria-label="Edit ${escapeAttribute(hospital.name)}" data-edit-hospital="${escapeAttribute(hospital.id)}"><i data-icon="pencil"></i></button><button class="icon-button danger" title="Delete hospital" aria-label="Delete ${escapeAttribute(hospital.name)}" data-delete-hospital="${escapeAttribute(hospital.id)}"><i data-icon="trash-2"></i></button></div></td></tr>`;
  }).join("");
  $("#hospital-table-empty").classList.toggle("hidden", filtered.length > 0);
  $("#hospital-table-count").textContent = `Showing ${filtered.length} of ${state.hospitals.length} hospitals`;
  renderIcons($("#hospitals-table"));
  $("#hospitals-table").querySelectorAll("[data-edit-hospital]").forEach((button) => button.addEventListener("click", () => {
    const item = state.hospitals.find((hospital) => hospital.id === button.dataset.editHospital);
    if (item) openHospitalForm(item);
  }));
  $("#hospitals-table").querySelectorAll("[data-delete-hospital]").forEach((button) => button.addEventListener("click", () => {
    const item = state.hospitals.find((hospital) => hospital.id === button.dataset.deleteHospital);
    if (item) void removeHospital(item);
  }));
  document.querySelectorAll("#recent-hospitals [data-edit-hospital]").forEach((button) => button.addEventListener("click", () => {
    const item = state.hospitals.find((hospital) => hospital.id === button.dataset.editHospital);
    if (item) openHospitalForm(item);
  }));
}

function renderCityOptions(selected = "") {
  const options = `<option value="">Select a city</option>${state.cities.slice().sort((a,b) => String(a.name).localeCompare(String(b.name))).map((city) => `<option value="${escapeAttribute(city.name)}" ${city.name === selected ? "selected" : ""}>${escapeHtml(city.name)}</option>`).join("")}`;
  $("#hospital-city").innerHTML = options;
  const filter = $("#hospital-city-filter");
  const oldValue = filter.value;
  filter.innerHTML = `<option value="">All cities</option>${state.cities.map((city) => `<option value="${escapeAttribute(city.name)}">${escapeHtml(city.name)}</option>`).join("")}`;
  if (state.cities.some((city) => city.name === oldValue)) filter.value = oldValue;
}

function bindHospitalForm() {
  $("#hospital-admin-search").addEventListener("input", renderHospitalTable);
  $("#hospital-city-filter").addEventListener("change", renderHospitalTable);
  $("#hospital-rating").addEventListener("input", renderRatingStars);
  $("#hospital-no-reviews").addEventListener("change", (event) => {
    $("#hospital-reviews").disabled = event.target.checked;
    if (event.target.checked) $("#hospital-reviews").value = "0";
  });
  $("#hospital-images").addEventListener("change", (event) => {
    const files = Array.from(event.target.files || []);
    const problem = files.map(validateImage).find(Boolean) || checkImageCount(state.existingImages.length, state.selectedFiles.length + files.length);
    if (problem) {
      showFormError(problem);
    } else {
      state.selectedFiles.push(...files);
      showFormError("");
      renderImagePreviews();
    }
    event.target.value = "";
  });
  $("#hospital-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void submitHospital();
  });
  $("#close-hospital-form").addEventListener("click", closeHospitalForm);
  $("#cancel-hospital-form").addEventListener("click", closeHospitalForm);
  $("#hospital-dialog").addEventListener("click", (event) => {
    if (event.target === $("#hospital-dialog")) closeHospitalForm();
  });
  $("#rating-stars").addEventListener("click", (event) => {
    const star = event.target.closest("[data-rating]");
    if (!star) return;
    $("#hospital-rating").value = star.dataset.rating;
    renderRatingStars();
  });
  $("#hospital-image-previews").addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-image]");
    if (!removeButton) return;
    const index = Number(removeButton.dataset.index);
    if (removeButton.dataset.removeImage === "existing") state.existingImages.splice(index, 1);
    else state.selectedFiles.splice(index, 1);
    renderImagePreviews();
  });
  $("#hospital-tags-select").addEventListener("change", () => {});
}

function openHospitalForm(hospital = null) {
  $("#hospital-form").reset();
  $("#hospital-id").value = hospital?.id || "";
  $("#hospital-form-title").textContent = hospital ? "Edit hospital" : "Add hospital";
  $("#save-hospital").innerHTML = `<i data-icon="check"></i> ${hospital ? "Save changes" : "Save hospital"}`;
  $("#save-hospital").disabled = false;
  $("#hospital-name").value = hospital?.name || "";
  $("#hospital-district").value = hospital?.district || "";
  $("#hospital-address").value = hospital?.address || "";
  $("#hospital-type").value = hospital?.hospitalType || "";
  $("#hospital-specialties").value = Array.isArray(hospital?.specialties) ? hospital.specialties.join(", ") : (hospital?.specialties || "");
  $("#hospital-rating").value = Number(hospital?.rating || 0);
  $("#hospital-reviews").value = Number(hospital?.reviewsCount || 0);
  $("#hospital-no-reviews").checked = Boolean(hospital?.hasNoReviews);
  $("#hospital-reviews").disabled = Boolean(hospital?.hasNoReviews);
  $("#hospital-summary").value = hospital?.summarizedReview || "";
  $("#hospital-phone").value = hospital?.callPhoneNumber || "";
  $("#hospital-hours").value = hospital?.openingHours || "";
  $("#hospital-emergency").checked = Boolean(hospital?.emergencyAvailable);
  $("#hospital-appointments").checked = Boolean(hospital?.appointmentAvailable);
  renderCityOptions(hospital?.city || "");
  const selectedTags = new Set(hospital?.tagIds || []);
  renderTagChoices(selectedTags);
  state.originalImages = Array.isArray(hospital?.images) ? [...hospital.images] : [];
  state.existingImages = [...state.originalImages];
  state.selectedFiles = [];
  showFormError("");
  renderRatingStars();
  renderImagePreviews();
  renderIcons($("#hospital-dialog"));
  $("#hospital-dialog").showModal();
}

function closeHospitalForm() {
  if ($("#hospital-dialog").open) $("#hospital-dialog").close();
  state.selectedFiles = [];
  state.existingImages = [];
  state.originalImages = [];
  state.imageUrls.forEach((url) => URL.revokeObjectURL(url));
  state.imageUrls = [];
}

function renderRatingStars() {
  const rating = Math.min(5, Math.max(0, Number($("#hospital-rating").value || 0)));
  $("#rating-stars").innerHTML = Array.from({ length: 5 }, (_, i) => `<button type="button" data-rating="${i + 1}" aria-label="Set rating to ${i + 1}"><i data-icon="star" class="${i + 1 <= Math.round(rating) ? "filled" : ""}"></i></button>`).join("");
  renderIcons($("#rating-stars"));
}

function renderTagChoices(selected = new Set()) {
  if (!selected.size) {
    $("#hospital-tags-select").querySelectorAll('input[type="checkbox"]:checked').forEach((input) => selected.add(input.value));
  }
  $("#hospital-tags-select").innerHTML = state.tags.length ? state.tags.map((tag) => `<label class="tag-choice ${selected.has(tag.id) ? "selected" : ""}"><input type="checkbox" value="${escapeAttribute(tag.id)}" ${selected.has(tag.id) ? "checked" : ""}>${escapeHtml(tag.name)}</label>`).join("") : `<span class="muted">No tags yet. Add tags in the Tags section first.</span>`;
  $("#hospital-tags-select").querySelectorAll("input").forEach((input) => input.addEventListener("change", () => input.closest(".tag-choice").classList.toggle("selected", input.checked)));
}

function renderImagePreviews() {
  state.imageUrls.forEach((url) => URL.revokeObjectURL(url));
  state.imageUrls = state.selectedFiles.map((file) => URL.createObjectURL(file));
  const existing = state.existingImages.map((url, index) => `<div class="preview-tile"><img src="${escapeAttribute(url)}" alt="Hospital photo"><button class="preview-remove" type="button" data-remove-image="existing" data-index="${index}" aria-label="Remove photo"><i data-icon="x"></i></button></div>`);
  const fresh = state.selectedFiles.map((file, index) => `<div class="preview-tile"><img src="${state.imageUrls[index]}" alt="${escapeAttribute(file.name)}"><span class="preview-new">NEW</span><button class="preview-remove" type="button" data-remove-image="new" data-index="${index}" aria-label="Remove selected photo"><i data-icon="x"></i></button></div>`);
  $("#hospital-image-previews").innerHTML = [...existing, ...fresh].join("");
  renderIcons($("#hospital-image-previews"));
}

async function submitHospital() {
  const form = $("#hospital-form");
  if (!form.reportValidity()) return;
  const rating = Number($("#hospital-rating").value);
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) { showFormError("Rating must be between 0 and 5."); return; }
  if (!state.cities.some((city) => city.name === $("#hospital-city").value)) { showFormError("Select a city added in the Cities section."); return; }
  const id = $("#hospital-id").value || createHospitalId();
  const saveButton = $("#save-hospital");
  saveButton.disabled = true;
  saveButton.textContent = "Saving hospital...";
  showFormError("");
  try {
    const compressedImages = [];
    for (const file of state.selectedFiles) compressedImages.push(await compressHospitalImage(file));
    const record = {
      name: $("#hospital-name").value.trim(),
      district: $("#hospital-district").value.trim(),
      city: $("#hospital-city").value,
      address: $("#hospital-address").value.trim(),
      hospitalType: $("#hospital-type").value,
      specialties: $("#hospital-specialties").value.split(",").map((value) => value.trim()).filter(Boolean),
      rating,
      reviewsCount: $("#hospital-no-reviews").checked ? 0 : Number($("#hospital-reviews").value || 0),
      hasNoReviews: $("#hospital-no-reviews").checked,
      summarizedReview: $("#hospital-summary").value.trim(),
      images: [...state.existingImages, ...compressedImages],
      appointmentAvailable: $("#hospital-appointments").checked,
      callPhoneNumber: $("#hospital-phone").value.trim(),
      openingHours: $("#hospital-hours").value.trim(),
      emergencyAvailable: $("#hospital-emergency").checked,
      tagIds: Array.from($("#hospital-tags-select").querySelectorAll("input:checked")).map((input) => input.value),
      createdAt: state.hospitals.find((hospital) => hospital.id === id)?.createdAt || Date.now(),
    };
    await saveHospital(id, record);
    closeHospitalForm();
    showToast("Hospital saved successfully.");
  } catch (error) {
    showFormError(error?.message || "Could not save this hospital.");
  } finally {
    saveButton.disabled = false;
    saveButton.innerHTML = `<i data-icon="check"></i> ${$("#hospital-id").value ? "Save changes" : "Save hospital"}`;
    renderIcons(saveButton);
  }
}

async function removeHospital(hospital) {
  if (!window.confirm(`Delete "${hospital.name}"? This cannot be undone.`)) return;
  try {
    await deleteHospital(hospital.id);
    showToast("Hospital deleted.");
  } catch (error) {
    showToast(error?.message || "Could not delete hospital.", true);
  }
}

function bindCatalogForms() {
  $("#tag-form").addEventListener("submit", (event) => { event.preventDefault(); void saveCatalog("tags"); });
  $("#city-form").addEventListener("submit", (event) => { event.preventDefault(); void saveCatalog("cities"); });
  $("#tag-cancel").addEventListener("click", () => resetCatalogForm("tags"));
  $("#city-cancel").addEventListener("click", () => resetCatalogForm("cities"));
  $("#tags-list").addEventListener("click", (event) => catalogAction(event, "tags"));
  $("#cities-list").addEventListener("click", (event) => catalogAction(event, "cities"));
}

function bindDietManagement() {
  document.querySelectorAll("[data-diet-admin-tab]").forEach((button) => button.addEventListener("click", () => {
    const tab = button.dataset.dietAdminTab;
    document.querySelectorAll("[data-diet-admin-tab]").forEach((item) => item.classList.toggle("active", item === button));
    $("#diet-admin-plans").classList.toggle("hidden", tab !== "plans");
    $("#diet-admin-questions").classList.toggle("hidden", tab !== "questions");
  }));
  $("#diet-plan-form").addEventListener("submit", (event) => { event.preventDefault(); void submitDietPlan(); });
  $("#diet-plan-cancel").addEventListener("click", resetDietPlanForm);
  $("#diet-plan-list").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-diet-plan]");
    const remove = event.target.closest("[data-delete-diet-plan]");
    const plan = state.dietPlans.find((item) => item.id === (edit || remove)?.dataset.id);
    if (edit && plan) openDietPlanForm(plan);
    if (remove && plan) void removeDietPlanItem(plan);
  });
  $("#diet-question-kind").addEventListener("change", setDefaultQuestionPrompt);
  $("#diet-question-form").addEventListener("submit", (event) => { event.preventDefault(); void submitDietQuestion(); });
  $("#diet-question-reset").addEventListener("click", () => void resetDietQuestion());
  $("#diet-question-list").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-diet-question]");
    if (!edit) return;
    const question = DEFAULT_DIET_QUESTIONS.find((item) => item.kind === edit.dataset.kind);
    const saved = state.dietQuestions.find((item) => item.kind === edit.dataset.kind);
    if (!question) return;
    $("#diet-question-kind").value = question.kind;
    $("#diet-question-label").value = saved?.label || question.label;
    $("#diet-question-form-title").textContent = `Customize ${dietQuestionKindLabel(question.kind).toLowerCase()} question`;
    renderDietQuestionOptions();
  });
  setDefaultQuestionPrompt();
}

function bindPcosManagement() {
  document.querySelectorAll("[data-pcos-admin-tab]").forEach((button) => button.addEventListener("click", () => {
    const tab = button.dataset.pcosAdminTab;
    document.querySelectorAll("[data-pcos-admin-tab]").forEach((item) => item.classList.toggle("active", item === button));
    $("#pcos-admin-guide").classList.toggle("hidden", tab !== "guide");
    $("#pcos-admin-plans").classList.toggle("hidden", tab !== "plans");
  }));
  $("#pcos-guide-form").addEventListener("submit", (event) => { event.preventDefault(); void submitPcosGuide(); });
  $("#pcos-guide-reset").addEventListener("click", () => renderPcosGuideForm(SAMPLE_PCOS_GUIDE));
  $("#pcos-plan-form").addEventListener("submit", (event) => { event.preventDefault(); void submitPcosPlan(); });
  $("#pcos-plan-cancel").addEventListener("click", resetPcosPlanForm);
  $("#pcos-plan-list").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-pcos-plan]");
    const remove = event.target.closest("[data-delete-pcos-plan]");
    const plan = state.pcosPlans.find((item) => item.id === (edit || remove)?.dataset.id);
    if (edit && plan) openPcosPlanForm(plan);
    if (remove && plan) void removePcosPlanItem(plan);
  });
}

function seedAdminSamples(metaKey, path, records, area) {
  if (state.sampleSeedsStarted[metaKey]) return;
  state.sampleSeedsStarted[metaKey] = true;
  void seedSampleRecordsOnce(metaKey, path, records).catch((error) => {
    state.sampleSeedsStarted[metaKey] = false;
    if (area === "diet") showDietAdminError(error?.message || "Could not publish sample diet plans.");
    else showPcosAdminError(error?.message || "Could not publish sample PCOD / PCOS content.");
  });
}

function markAdminSamplesReady(metaKey, area) {
  if (state.sampleSeedsStarted[metaKey]) return;
  state.sampleSeedsStarted[metaKey] = true;
  void markSampleContentReady(metaKey).catch((error) => {
    state.sampleSeedsStarted[metaKey] = false;
    if (area === "diet") showDietAdminError(error?.message || "Could not update sample content status.");
    else showPcosAdminError(error?.message || "Could not update sample content status.");
  });
}

function renderPcosGuideForm(guide = state.pcosGuide) {
  $("#pcos-guide-title").value = guide.title || "";
  $("#pcos-guide-description").value = guide.description || "";
  $("#pcos-guide-foods").value = Array.isArray(guide.foods) ? guide.foods.join("\n") : "";
  $("#pcos-guide-precautions").value = Array.isArray(guide.precautions) ? guide.precautions.join("\n") : "";
}

async function submitPcosGuide() {
  const form = $("#pcos-guide-form");
  if (!form.reportValidity()) return;
  const button = $("#pcos-guide-submit");
  button.disabled = true;
  clearPcosAdminError();
  try {
    const toLines = (value) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const guide = {
      title: $("#pcos-guide-title").value.trim(),
      description: $("#pcos-guide-description").value.trim(),
      foods: toLines($("#pcos-guide-foods").value),
      precautions: toLines($("#pcos-guide-precautions").value),
    };
    if (!guide.foods.length || !guide.precautions.length) {
      showPcosAdminError("Add at least one food suggestion and one precaution, each on its own line.");
      return;
    }
    await savePcosGuide(guide);
    showToast("PCOD / PCOS guide saved.");
  } catch (error) {
    showPcosAdminError(error?.message || "Could not save the guide.");
  } finally {
    button.disabled = false;
  }
}

function renderPcosPlansAdmin() {
  const container = $("#pcos-plan-list");
  if (!container) return;
  container.innerHTML = state.pcosPlans.length ? state.pcosPlans
    .slice()
    .sort((a, b) => String(a.title).localeCompare(String(b.title)))
    .map((plan) => `<article class="diet-admin-plan"><img class="diet-admin-plan-photo" src="${safeMealImage(plan.image)}" alt="" loading="lazy"><div><span class="diet-admin-plan-goal">${escapeHtml(plan.focus || "Meal inspiration")}</span><h3>${escapeHtml(plan.title || "Untitled plan")}</h3><p>${escapeHtml(plan.description || "")}</p><small>${escapeHtml([plan.breakfast, plan.lunch, plan.dinner].filter(Boolean).length + " meal ideas")}</small></div><div class="catalog-actions"><button type="button" data-edit-pcos-plan data-id="${escapeAttribute(plan.id)}" aria-label="Edit ${escapeAttribute(plan.title)}"><i data-icon="pencil"></i></button><button type="button" class="delete" data-delete-pcos-plan data-id="${escapeAttribute(plan.id)}" aria-label="Delete ${escapeAttribute(plan.title)}"><i data-icon="trash-2"></i></button></div></article>`)
    .join("") : `<div class="table-empty">No PCOD / PCOS plans yet. Add one with the form.</div>`;
  renderIcons(container);
}

function openPcosPlanForm(plan = null) {
  $("#pcos-plan-form").reset();
  $("#pcos-plan-id").value = plan?.id || "";
  $("#pcos-plan-title").value = plan?.title || "";
  $("#pcos-plan-focus").value = plan?.focus || "";
  $("#pcos-plan-description").value = plan?.description || "";
  $("#pcos-plan-image").value = safeMealImage(plan?.image) || "assets/meal-colorful-plate.jpg";
  $("#pcos-plan-ingredients").value = Array.isArray(plan?.ingredients) ? plan.ingredients.join(", ") : "";
  $("#pcos-plan-breakfast").value = plan?.breakfast || "";
  $("#pcos-plan-lunch").value = plan?.lunch || "";
  $("#pcos-plan-dinner").value = plan?.dinner || "";
  $("#pcos-plan-snacks").value = plan?.snacks || "";
  $("#pcos-plan-form-title").textContent = plan ? "Edit meal plan" : "Add a meal plan";
  $("#pcos-plan-submit").innerHTML = `<i data-icon="${plan ? "check" : "plus"}"></i> ${plan ? "Save changes" : "Add plan"}`;
  $("#pcos-plan-cancel").classList.toggle("hidden", !plan);
  renderIcons($("#pcos-plan-submit"));
}

function resetPcosPlanForm() {
  openPcosPlanForm();
}

async function submitPcosPlan() {
  const form = $("#pcos-plan-form");
  if (!form.reportValidity()) return;
  const title = $("#pcos-plan-title").value.trim();
  const currentId = $("#pcos-plan-id").value;
  const id = currentId || slug(title);
  if (!id) { showPcosAdminError("Use a plan title with letters or numbers."); return; }
  if (!currentId && state.pcosPlans.some((plan) => plan.id === id)) {
    showPcosAdminError("A plan already uses this title. Choose another title or edit that plan.");
    return;
  }
  const button = $("#pcos-plan-submit");
  button.disabled = true;
  clearPcosAdminError();
  try {
    const existing = state.pcosPlans.find((plan) => plan.id === id);
    await savePcosPlan(id, {
      id,
      title,
      focus: $("#pcos-plan-focus").value.trim(),
      description: $("#pcos-plan-description").value.trim(),
      image: safeMealImage($("#pcos-plan-image").value),
      ingredients: $("#pcos-plan-ingredients").value.split(",").map((value) => value.trim()).filter(Boolean),
      breakfast: $("#pcos-plan-breakfast").value.trim(),
      lunch: $("#pcos-plan-lunch").value.trim(),
      dinner: $("#pcos-plan-dinner").value.trim(),
      snacks: $("#pcos-plan-snacks").value.trim(),
      createdAt: existing?.createdAt || Date.now(),
    });
    resetPcosPlanForm();
    showToast("PCOD / PCOS meal plan saved.");
  } catch (error) {
    showPcosAdminError(error?.message || "Could not save meal plan.");
  } finally {
    button.disabled = false;
  }
}

async function removePcosPlanItem(plan) {
  if (!window.confirm(`Delete "${plan.title}"?`)) return;
  clearPcosAdminError();
  try {
    await deletePcosPlan(plan.id);
    showToast("PCOD / PCOS meal plan deleted.");
  } catch (error) {
    showPcosAdminError(error?.message || "Could not delete meal plan.");
  }
}

function renderDietPlansAdmin() {
  const container = $("#diet-plan-list");
  if (!container) return;
  const goalLabels = {
    "weight-management": "Gradual weight management",
    "skin-support": "Skin-supportive nutrition",
    "balanced-eating": "Balanced everyday eating",
  };
  container.innerHTML = state.dietPlans.length ? state.dietPlans
    .slice()
    .sort((a, b) => String(a.title).localeCompare(String(b.title)))
    .map((plan) => `<article class="diet-admin-plan"><img class="diet-admin-plan-photo" src="${safeMealImage(plan.image)}" alt="" loading="lazy"><div><span class="diet-admin-plan-goal">${escapeHtml(goalLabels[plan.goal] || "Meal inspiration")}</span><h3>${escapeHtml(plan.title || "Untitled plan")}</h3><p>${escapeHtml(plan.description || "")}</p><small>${escapeHtml(dietTypeLabel(plan.dietType))}${Array.isArray(plan.ingredients) && plan.ingredients.length ? ` · Includes: ${escapeHtml(plan.ingredients.join(", "))}` : ""}</small></div><div class="catalog-actions"><button type="button" data-edit-diet-plan data-id="${escapeAttribute(plan.id)}" aria-label="Edit ${escapeAttribute(plan.title)}"><i data-icon="pencil"></i></button><button type="button" class="delete" data-delete-diet-plan data-id="${escapeAttribute(plan.id)}" aria-label="Delete ${escapeAttribute(plan.title)}"><i data-icon="trash-2"></i></button></div></article>`)
    .join("") : `<div class="table-empty">No diet plans yet. Add one with the form.</div>`;
  renderIcons(container);
}

function renderDietQuestionsAdmin() {
  const container = $("#diet-question-list");
  if (!container) return;
  container.innerHTML = DEFAULT_DIET_QUESTIONS.map((question) => {
    const saved = state.dietQuestions.find((item) => item.kind === question.kind);
    return `<article class="diet-admin-question"><span class="diet-question-type">${escapeHtml(dietQuestionKindLabel(question.kind))}</span><p>${escapeHtml(saved?.label || question.label)}</p><small>${escapeHtml(question.options)}</small><button type="button" data-edit-diet-question data-kind="${question.kind}"><i data-icon="pencil"></i> Edit prompt</button></article>`;
  }).join("");
  renderIcons(container);
  setDefaultQuestionPrompt();
}

function renderDietQuestionOptions() {
  const question = DEFAULT_DIET_QUESTIONS.find((item) => item.kind === $("#diet-question-kind").value);
  $("#diet-question-options").textContent = question ? `User answer choices: ${question.options}. The answer choices are fixed for matching.` : "";
}

function setDefaultQuestionPrompt() {
  const kind = $("#diet-question-kind").value;
  const saved = state.dietQuestions.find((item) => item.kind === kind);
  const defaultQuestion = DEFAULT_DIET_QUESTIONS.find((item) => item.kind === kind);
  $("#diet-question-label").value = saved?.label || defaultQuestion?.label || "";
  $("#diet-question-form-title").textContent = `Customize ${dietQuestionKindLabel(kind).toLowerCase()} question`;
  renderDietQuestionOptions();
}

function openDietPlanForm(plan = null) {
  $("#diet-plan-form").reset();
  $("#diet-plan-id").value = plan?.id || "";
  $("#diet-plan-title").value = plan?.title || "";
  $("#diet-plan-goal").value = plan?.goal || "";
  $("#diet-plan-type").value = plan?.dietType || "any";
  $("#diet-plan-description").value = plan?.description || "";
  $("#diet-plan-image").value = safeMealImage(plan?.image) || "assets/meal-colorful-plate.jpg";
  $("#diet-plan-ingredients").value = Array.isArray(plan?.ingredients) ? plan.ingredients.join(", ") : "";
  $("#diet-plan-breakfast").value = plan?.breakfast || "";
  $("#diet-plan-lunch").value = plan?.lunch || "";
  $("#diet-plan-dinner").value = plan?.dinner || "";
  $("#diet-plan-snacks").value = plan?.snacks || "";
  $("#diet-plan-form-title").textContent = plan ? "Edit diet plan" : "Add a diet plan";
  $("#diet-plan-submit").innerHTML = `<i data-icon="${plan ? "check" : "plus"}"></i> ${plan ? "Save changes" : "Add plan"}`;
  $("#diet-plan-cancel").classList.toggle("hidden", !plan);
  renderIcons($("#diet-plan-submit"));
}

function resetDietPlanForm() {
  openDietPlanForm();
}

async function submitDietPlan() {
  const form = $("#diet-plan-form");
  if (!form.reportValidity()) return;
  const title = $("#diet-plan-title").value.trim();
  const currentId = $("#diet-plan-id").value;
  const id = currentId || slug(title);
  if (!id) { showDietAdminError("Use a plan title with letters or numbers."); return; }
  if (!currentId && state.dietPlans.some((plan) => plan.id === id)) {
    showDietAdminError("A plan already uses this title. Choose another title or edit that plan.");
    return;
  }
  const button = $("#diet-plan-submit");
  button.disabled = true;
  clearDietAdminError();
  try {
    const existing = state.dietPlans.find((plan) => plan.id === id);
    const ingredients = $("#diet-plan-ingredients").value.split(",").map((value) => value.trim()).filter(Boolean);
    await saveDietPlan(id, {
      id,
      title,
      goal: $("#diet-plan-goal").value,
      dietType: $("#diet-plan-type").value,
      description: $("#diet-plan-description").value.trim(),
      image: safeMealImage($("#diet-plan-image").value),
      ingredients,
      breakfast: $("#diet-plan-breakfast").value.trim(),
      lunch: $("#diet-plan-lunch").value.trim(),
      dinner: $("#diet-plan-dinner").value.trim(),
      snacks: $("#diet-plan-snacks").value.trim(),
      createdAt: existing?.createdAt || Date.now(),
    });
    resetDietPlanForm();
    showToast("Diet plan saved.");
  } catch (error) {
    showDietAdminError(error?.message || "Could not save diet plan.");
  } finally {
    button.disabled = false;
  }
}

async function removeDietPlanItem(plan) {
  if (!window.confirm(`Delete "${plan.title}"?`)) return;
  clearDietAdminError();
  try {
    await deleteDietPlan(plan.id);
    showToast("Diet plan deleted.");
  } catch (error) {
    showDietAdminError(error?.message || "Could not delete diet plan.");
  }
}

async function submitDietQuestion() {
  const kind = $("#diet-question-kind").value;
  const label = $("#diet-question-label").value.trim();
  if (!label || !DEFAULT_DIET_QUESTIONS.some((question) => question.kind === kind)) return;
  const button = $("#diet-question-submit");
  button.disabled = true;
  clearDietAdminError();
  try {
    await saveDietQuestion(kind, { label });
    $("#diet-question-form-title").textContent = `Customize ${dietQuestionKindLabel(kind).toLowerCase()} question`;
    showToast("Question prompt saved.");
  } catch (error) {
    showDietAdminError(error?.message || "Could not save question prompt.");
  } finally {
    button.disabled = false;
  }
}

async function resetDietQuestion() {
  const kind = $("#diet-question-kind").value;
  clearDietAdminError();
  try {
    await deleteCatalogItem("dietQuestions", kind);
    setDefaultQuestionPrompt();
    showToast("Default question restored.");
  } catch (error) {
    showDietAdminError(error?.message || "Could not restore the default question.");
  }
}

function dietQuestionKindLabel(kind) {
  return {
    goal: "Food goal",
    dietType: "Eating style",
    avoidIngredients: "Foods to avoid",
  }[kind] || "Question";
}

function dietTypeLabel(value) {
  return {
    any: "Flexible / any eating style",
    vegetarian: "Vegetarian",
    vegan: "Vegan",
    omnivore: "Includes meat / fish",
  }[value] || "Flexible / any eating style";
}

function renderTagsList() {
  $("#tags-list").innerHTML = state.tags.length ? state.tags.slice().sort((a,b) => String(a.name).localeCompare(String(b.name))).map((tag) => `<div class="catalog-item"><span class="catalog-color" style="background:${safeColor(tag.color)}"></span><span>${escapeHtml(tag.name)}</span><div class="catalog-actions"><button type="button" data-edit-catalog="tags" data-id="${escapeAttribute(tag.id)}" aria-label="Edit ${escapeAttribute(tag.name)}"><i data-icon="pencil"></i></button><button class="delete" type="button" data-delete-catalog="tags" data-id="${escapeAttribute(tag.id)}" aria-label="Delete ${escapeAttribute(tag.name)}"><i data-icon="trash-2"></i></button></div></div>`).join("") : `<div class="table-empty">No tags yet. Add one using the form.</div>`;
  renderIcons($("#tags-list"));
}

function renderCitiesList() {
  $("#cities-list").innerHTML = state.cities.length ? state.cities.slice().sort((a,b) => String(a.name).localeCompare(String(b.name))).map((city) => `<div class="catalog-item"><i data-icon="map-pin"></i><span>${escapeHtml(city.name)}</span><div class="catalog-actions"><button type="button" data-edit-catalog="cities" data-id="${escapeAttribute(city.id)}" aria-label="Edit ${escapeAttribute(city.name)}"><i data-icon="pencil"></i></button><button class="delete" type="button" data-delete-catalog="cities" data-id="${escapeAttribute(city.id)}" aria-label="Delete ${escapeAttribute(city.name)}"><i data-icon="trash-2"></i></button></div></div>`).join("") : `<div class="table-empty">No cities yet. Add one using the form.</div>`;
  renderIcons($("#cities-list"));
}

async function saveCatalog(path) {
  const isTag = path === "tags";
  const input = $(isTag ? "#tag-name" : "#city-name");
  const editingId = isTag ? state.editingTag : state.editingCity;
  const name = input.value.trim();
  if (!name) return;
  const list = isTag ? state.tags : state.cities;
  const id = editingId || slug(name);
  if (!id) { showToast("Use a name with letters or numbers.", true); return; }
  if (list.some((item) => item.name.toLowerCase() === name.toLowerCase() && item.id !== editingId)) { showToast(`A ${isTag ? "tag" : "city"} with this name already exists.`, true); return; }
  if (!editingId && list.some((item) => item.id === id)) { showToast("This name conflicts with an existing item. Choose a different name.", true); return; }
  const button = $(isTag ? "#tag-submit" : "#city-submit");
  button.disabled = true;
  try {
    await saveCatalogItem(path, { id, name, color: isTag ? $("#tag-color").value : undefined });
    resetCatalogForm(path);
    showToast(`${isTag ? "Tag" : "City"} saved.`);
  } catch (error) {
    showToast(error?.message || `Could not save ${isTag ? "tag" : "city"}.`, true);
  } finally {
    button.disabled = false;
  }
}

function catalogAction(event, path) {
  const deleteButton = event.target.closest("[data-delete-catalog]");
  const editButton = event.target.closest("[data-edit-catalog]");
  const list = path === "tags" ? state.tags : state.cities;
  if (deleteButton) {
    const item = list.find((entry) => entry.id === deleteButton.dataset.id);
    if (item && window.confirm(`Delete "${item.name}"?`)) {
      deleteCatalogItem(path, item.id).then(() => showToast(`${path === "tags" ? "Tag" : "City"} deleted.`)).catch((error) => showToast(error.message, true));
    }
  }
  if (editButton) {
    const item = list.find((entry) => entry.id === editButton.dataset.id);
    if (!item) return;
    if (path === "tags") {
      state.editingTag = item.id;
      $("#tag-name").value = item.name;
      $("#tag-color").value = safeColor(item.color);
      $("#tag-form-title").textContent = "Edit tag";
      $("#tag-submit").innerHTML = `<i data-icon="check"></i> Save changes`;
      $("#tag-cancel").classList.remove("hidden");
      renderIcons($("#tag-submit"));
    } else {
      state.editingCity = item.id;
      $("#city-name").value = item.name;
      $("#city-form-title").textContent = "Edit city";
      $("#city-submit").innerHTML = `<i data-icon="check"></i> Save changes`;
      $("#city-cancel").classList.remove("hidden");
      renderIcons($("#city-submit"));
    }
  }
}

function resetCatalogForm(path) {
  if (path === "tags") {
    state.editingTag = "";
    $("#tag-form").reset();
    $("#tag-color").value = "#0f766e";
    $("#tag-form-title").textContent = "Add a tag";
    $("#tag-submit").innerHTML = `<i data-icon="plus"></i> Add tag`;
    $("#tag-cancel").classList.add("hidden");
    renderIcons($("#tag-submit"));
  } else {
    state.editingCity = "";
    $("#city-form").reset();
    $("#city-form-title").textContent = "Add a city";
    $("#city-submit").innerHTML = `<i data-icon="plus"></i> Add city`;
    $("#city-cancel").classList.add("hidden");
    renderIcons($("#city-submit"));
  }
}

function showAdminError(message) {
  $("#admin-error").textContent = `Could not load directory data: ${message}`;
  $("#admin-error").classList.remove("hidden");
}
function hideAdminError() { $("#admin-error").classList.add("hidden"); }
function showDietAdminError(message) {
  const element = $("#diet-admin-error");
  element.textContent = `Diet planner: ${message}`;
  element.classList.remove("hidden");
}
function clearDietAdminError() { $("#diet-admin-error").classList.add("hidden"); }
function showPcosAdminError(message) {
  const element = $("#pcos-admin-error");
  element.textContent = `PCOD / PCOS content: ${message}`;
  element.classList.remove("hidden");
}
function clearPcosAdminError() { $("#pcos-admin-error").classList.add("hidden"); }
function showFormError(message) {
  $("#hospital-form-error").textContent = message;
  $("#hospital-form-error").classList.toggle("hidden", !message);
}
function showToast(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3300);
}
function isSafeImageUrl(value) {
  if (/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value || "")) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}
function safeColor(value) { return /^#[\da-f]{6}$/i.test(value || "") ? value : "#0f766e"; }
function slug(value) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function safeMealImage(value) {
  return /^assets\/meal-[a-z0-9-]+\.jpg$/.test(value || "") ? value : "assets/meal-colorful-plate.jpg";
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }
