// app.js - כולל ממשק ספקים, הצעת מחיר גלויה, כפתור עזיבה, קרדיט למשתמש, בחירת זמן קבוצה, חיפוש ויצירת קבוצות אם לא קיימות, וטיימר קבוצה
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import {
  getFirestore, collection, query, where, getDocs, addDoc, doc, updateDoc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getTrendingProductsFromAI } from './vertex.ai.js';

const firebaseConfig = {
  apiKey: "AIzaSyAJgKR4sLl9-TP9ralxMFy-_mJcNEsryX0",
  authDomain: "groopit-fc12a.firebaseapp.com",
  projectId: "groopit-fc12a",
  storageBucket: "groopit-fc12a.appspot.com",
  messagingSenderId: "321458941138",
  appId: "1:321458941138:web:2d6f8be69420a59d63110b"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth();

let currentUser = null;
let userBalance = 10000;

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  if (currentUser) {
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, { balance: userBalance });
    } else {
      userBalance = userSnap.data().balance || 10000;
    }
  }
  updateUserBalanceDisplay();
});

function updateUserBalanceDisplay() {
  const balanceElement = document.getElementById("userBalance");
  if (balanceElement) {
    balanceElement.textContent = `₪${userBalance.toLocaleString()}`;
  }
}

async function searchProduct() {
  const queryText = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!queryText) return;

  const groupsRef = collection(db, "groups");
  const q = query(groupsRef, where("name", "==", queryText));
  const querySnapshot = await getDocs(q);

  if (!querySnapshot.empty) {
    displayGroups(querySnapshot.docs);
  } else {
    const newGroupRef = await addDoc(groupsRef, {
      name: queryText,
      membersIds: [],
      membersCount: 0,
      offers: [],
      createdAt: serverTimestamp()
    });
    const newGroupSnap = await getDoc(newGroupRef);
    displayGroups([newGroupSnap]);
  }
}

async function fetchProductImage(query) {
  const url = `https://www.googleapis.com/customsearch/v1?key=AIzaSyCMfiMFgn_M_SkM9hfYn6fWytJk2_Q2TXI&cx=635dfc4bee33c4c70&searchType=image&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) return null;
    return data.items?.[0]?.link || null;
  } catch {
    return null;
  }
}

async function displayGroups(groupDocs) {
  const container = document.getElementById("groupsContainer");
  container.innerHTML = "";

  for (const docSnap of groupDocs) {
    const group = docSnap.data();
    const imageUrl = await fetchProductImage(group.name);
    const bestOffer = group.offers?.reduce((min, offer) => parseFloat(offer.price) < parseFloat(min.price) ? offer : min, group.offers?.[0]) || null;
    const alreadyJoined = group.membersIds?.includes(currentUser?.uid);

    const card = document.createElement("div");
    card.className = "group-card";
    card.innerHTML = `
      <h3>${group.name}</h3>
      <p>מספר מצטרפים: ${group.membersCount || 0}</p>
      ${bestOffer ? `<div class="price-box">הצעת מחיר: ₪${bestOffer.price}</div>` : ""}
      ${imageUrl ? `<img src="${imageUrl}" alt="${group.name}">` : ""}
      ${alreadyJoined ?
        `<button onclick="leaveGroup('${docSnap.id}')">עזוב קבוצה</button>` :
        `<button onclick="chooseDurationAndJoin('${docSnap.id}', '${group.name}', ${bestOffer ? bestOffer.price : 50})">הצטרף לקבוצה</button>`
      }
    `;
    container.appendChild(card);
  }
}

async function chooseDurationAndJoin(groupId, productName, price) {
  const duration = prompt("בחר זמן לקבוצה: 15s, 30s, 60s, 10h, 24h");
  if (!duration) return;
  let millis = 15000;
  if (duration === "30s") millis = 30000;
  else if (duration === "60s") millis = 60000;
  else if (duration === "10h") millis = 10 * 60 * 60 * 1000;
  else if (duration === "24h") millis = 24 * 60 * 60 * 1000;
  await joinGroup(groupId, productName, price, millis);
}

async function joinGroup(groupId, productName, price, durationMs) {
  if (!currentUser || userBalance < price) {
    alert("יש להתחבר או שאין מספיק קרדיט.");
    return;
  }
  const groupRef = doc(db, "groups", groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) return;

  const groupData = groupSnap.data();
  const members = groupData.membersIds || [];

  if (members.includes(currentUser.uid)) {
    alert("כבר הצטרפת.");
    return;
  }

  members.push(currentUser.uid);
  const endTime = Date.now() + durationMs;
  await updateDoc(groupRef, {
    membersIds: members,
    membersCount: members.length,
    [`joined_${currentUser.uid}`]: serverTimestamp(),
    [`endTime_${currentUser.uid}`]: endTime
  });

  userBalance -= price;
  updateUserBalanceDisplay();
  alert("הצטרפת!");
}

async function leaveGroup(groupId) {
  if (!currentUser) return;
  const groupRef = doc(db, "groups", groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) return;

  let members = groupSnap.data().membersIds || [];
  members = members.filter(id => id !== currentUser.uid);

  await updateDoc(groupRef, {
    membersIds: members,
    membersCount: members.length
  });
  alert("עזבת קבוצה.");
  showMyGroups();
}

async function showMyGroups() {
  if (!currentUser) {
    alert("יש להתחבר.");
    return;
  }
  const q = query(collection(db, "groups"), where("membersIds", "array-contains", currentUser.uid));
  const querySnapshot = await getDocs(q);
  displayGroups(querySnapshot.docs);
}

async function showHotGroups() {
  const groupsRef = collection(db, "groups");
  const querySnapshot = await getDocs(groupsRef);
  const sortedGroups = querySnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (b.membersCount || 0) - (a.membersCount || 0))
    .slice(0, 5);
  displayGroups(sortedGroups.map(g => ({ id: g.id, data: () => g })));
}

async function showAIHotGroups() {
  const container = document.getElementById("groupsContainer");
  container.innerHTML = `<div style="text-align:center; margin: 40px auto;"><div class="infinity-loader"></div><p>מחפש את הקבוצות החמות ביותר...</p></div>`;
  const trendingProducts = await getTrendingProductsFromAI();
  const querySnapshots = [];
  for (const name of trendingProducts) {
    const q = query(collection(db, "groups"), where("name", "==", name.toLowerCase()));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) querySnapshots.push(...snapshot.docs);
  }
  displayGroups(querySnapshots);
}

async function showSupplierArea() {
  const product = prompt("מה אתה מוכר?");
  if (!product) return;
  const price = prompt("מה המחיר שאתה מציע?");
  if (!price) return;

  const q = query(collection(db, "groups"), where("name", "==", product.toLowerCase()));
  const snapshot = await getDocs(q);

  snapshot.forEach(async (docSnap) => {
    const groupRef = doc(db, "groups", docSnap.id);
    const groupData = docSnap.data();
    const offers = groupData.offers || [];
    offers.push({ price, supplier: currentUser?.uid || "לא ידוע", createdAt: new Date() });
    await updateDoc(groupRef, { offers });
  });

  await setDoc(doc(db, "suppliers", currentUser.uid), { product, balance: 0 }, { merge: true });
  alert("נרשמת כספק!");
}

window.searchProduct = searchProduct;
window.showMyGroups = showMyGroups;
window.showHotGroups = showHotGroups;
window.showAIHotGroups = showAIHotGroups;
window.showSupplierArea = showSupplierArea;
window.chooseDurationAndJoin = chooseDurationAndJoin;
window.leaveGroup = leaveGroup;

window.addEventListener('DOMContentLoaded', updateUserBalanceDisplay);

async function startGroupTimers() {
  const groupsRef = collection(db, "groups");
  const querySnapshot = await getDocs(groupsRef);
  const now = Date.now();

  for (const docSnap of querySnapshot.docs) {
    const group = docSnap.data();
    for (const memberId of group.membersIds || []) {
      const endTime = group[`endTime_${memberId}`];
      if (endTime && now > endTime) {
        console.log(`סיום קבוצה עבור ${memberId}`);
      }
    }
  }
}

setInterval(startGroupTimers, 30000);
