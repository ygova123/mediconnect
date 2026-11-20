import {
  onValue, push, ref, remove, runTransaction, set, update,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { database } from "./firebase.js";

function subscribe(path, callback, onError = () => {}) {
  return onValue(ref(database, path), (snapshot) => {
    const value = snapshot.val();
    callback(value ? Object.entries(value).map(([id, fields]) => ({ id, ...fields })) : []);
  }, onError);
}

export const subscribeHospitals = (callback, onError) => subscribe("hospitals", callback, onError);
export const subscribeCities = (callback, onError) => subscribe("cities", callback, onError);
export const subscribeTags = (callback, onError) => subscribe("tags", callback, onError);
export const subscribeDietPlans = (callback, onError) => subscribe("dietPlans", callback, onError);
export const subscribeDietQuestions = (callback, onError) => subscribe("dietQuestions", callback, onError);
export const subscribePcosPlans = (callback, onError) => subscribe("pcosPlans", callback, onError);
export const subscribeAdmin = (uid, callback, onError) => onValue(ref(database, `admins/${uid}`), (snap) => callback(snap.val() === true), onError);
export const subscribePcosGuide = (callback, onError = () => {}) => onValue(ref(database, "pcosGuide/guide"), (snapshot) => callback(snapshot.val()), onError);
export const subscribeContentMeta = (callback, onError = () => {}) => onValue(ref(database, "contentMeta"), (snapshot) => callback(snapshot.val() || {}), onError);

export function createHospitalId() {
  const record = push(ref(database, "hospitals"));
  if (!record.key) throw new Error("Could not allocate a hospital ID.");
  return record.key;
}

export async function saveHospital(id, data) {
  const { id: ignoredId, ...record } = data;
  await set(ref(database, `hospitals/${id}`), {
    ...record,
    createdAt: data.createdAt || Date.now(),
    updatedAt: Date.now(),
  });
}

export function deleteHospital(id) {
  return remove(ref(database, `hospitals/${id}`));
}

export function saveCatalogItem(path, item) {
  return set(ref(database, `${path}/${item.id}`), {
    name: item.name,
    ...(path === "tags" ? { color: item.color || "#0f766e" } : {}),
    updatedAt: Date.now(),
  });
}

export function deleteCatalogItem(path, id) {
  return remove(ref(database, `${path}/${id}`));
}

export function saveDietPlan(id, plan) {
  const { id: ignoredId, ...record } = plan;
  return set(ref(database, `dietPlans/${id}`), {
    ...record,
    createdAt: plan.createdAt || Date.now(),
    updatedAt: Date.now(),
  });
}

export function deleteDietPlan(id) {
  return remove(ref(database, `dietPlans/${id}`));
}

export function saveDietQuestion(kind, question) {
  return set(ref(database, `dietQuestions/${kind}`), {
    kind,
    label: question.label,
    updatedAt: Date.now(),
  });
}

export function savePcosGuide(guide) {
  return set(ref(database, "pcosGuide/guide"), {
    title: guide.title,
    description: guide.description,
    foods: guide.foods,
    precautions: guide.precautions,
    updatedAt: Date.now(),
  });
}

export function savePcosPlan(id, plan) {
  const { id: ignoredId, ...record } = plan;
  return set(ref(database, `pcosPlans/${id}`), {
    ...record,
    createdAt: plan.createdAt || Date.now(),
    updatedAt: Date.now(),
  });
}

export function deletePcosPlan(id) {
  return remove(ref(database, `pcosPlans/${id}`));
}

export function markSampleContentReady(metaKey) {
  return set(ref(database, `contentMeta/${metaKey}`), true);
}

export async function seedSampleRecordsOnce(metaKey, path, records) {
  const marker = await runTransaction(ref(database, `contentMeta/${metaKey}`), (current) => (
    current === true ? undefined : "seeding"
  ), { applyLocally: false });
  if (marker.snapshot.val() === true) return false;

  await Promise.all(records.map((record) => {
    const { id, ...fields } = record;
    return runTransaction(ref(database, `${path}/${id}`), (current) => (
      current === null ? { ...fields, createdAt: Date.now(), updatedAt: Date.now() } : undefined
    ), { applyLocally: false });
  }));
  await set(ref(database, `contentMeta/${metaKey}`), true);
  return true;
}

export function patchHospital(id, changes) {
  return update(ref(database, `hospitals/${id}`), { ...changes, updatedAt: Date.now() });
}
