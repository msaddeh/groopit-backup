// app.js - כולל ממשק ספקים, הצעת מחיר גלויה, כפתור עזיבה, והצגה ללקוח
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import {
  getFirestore, collection, query, where, getDocs, addDoc, doc, updateDoc, getDoc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

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

const googleApiKey = "AIzaSyCMfiMFgn_M_SkM9hfYn6fWytJk2_Q2TXI";
const searchEngineId = "635dfc4bee33c4c70";

let currentUser = null;
onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
});

async function searchProduct() {
  const queryText = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!queryText) return;

  const groupsRef = collection(db, "groups");
  const q = query(groupsRef, where("name", "==", queryText));
  const querySnapshot = await getDocs(q);

  if (!querySnapshot.empty) {
    displayGroups(querySnapshot.docs);
  } else {
    await addDoc(groupsRef, {
      name: queryText,
      membersIds: currentUser ? [currentUser.uid] : [],
      membersCount: currentUser ? 1 : 0,
      createdAt: new Date(),
      offers: []
    });
    const updatedSnapshot = await getDocs(query(groupsRef, where("name", "==", queryText)));
    displayGroups(updatedSnapshot.docs);
  }
}

async function fetchProductImage(query) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${searchEngineId}&searchType=image&q=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.error("שגיאה מה-API של גוגל:", data.error);
      return null;
    }
    return data.items?.[0]?.link || null;
  } catch (err) {
    console.error("שגיאה בחיפוש תמונה בגוגל:", err);
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

    const card = document.createElement("div");
    card.className = "group-card";
    card.innerHTML = `
      <h3>${group.name}</h3>
      <p>מספר מצטרפים: ${group.membersCount || 0}</p>
      ${bestOffer ? `<div class="price-box">הצעת מחיר: ₪${bestOffer.price}</div>` : ""}
      ${imageUrl ? `<img src="${imageUrl}" alt="${group.name}">` : ""}
      <button onclick="joinGroup('${docSnap.id}')">הצטרף לקבוצה</button>
      <button onclick="leaveGroup('${docSnap.id}')">עזוב קבוצה</button>
    `;
    container.appendChild(card);
  }
}

async function joinGroup(groupId) {
  if (!currentUser) {
    alert("יש להתחבר כדי להצטרף לקבוצה.");
    return;
  }

  const groupRef = doc(db, "groups", groupId);
  const groupSnap = await getDoc(groupRef);

  if (groupSnap.exists()) {
    const groupData = groupSnap.data();
    const members = groupData.membersIds || [];

    if (!members.includes(currentUser.uid)) {
      members.push(currentUser.uid);
      await updateDoc(groupRef, {
        membersIds: members,
        membersCount: members.length
      });
      alert("הצטרפת בהצלחה!");
    } else {
      alert("אתה כבר חבר בקבוצה הזו.");
    }
    displayGroups([groupSnap]);
  }
}

async function leaveGroup(groupId) {
  if (!currentUser) return;
  const groupRef = doc(db, "groups", groupId);
  const groupSnap = await getDoc(groupRef);

  if (groupSnap.exists()) {
    const groupData = groupSnap.data();
    let members = groupData.membersIds || [];
    members = members.filter(id => id !== currentUser.uid);

    await updateDoc(groupRef, {
      membersIds: members,
      membersCount: members.length
    });
    alert("עזבת את הקבוצה.");
    const q = query(collection(db, "groups"), where("membersIds", "array-contains", currentUser.uid));
    const querySnapshot = await getDocs(q);
    displayGroups(querySnapshot.docs);
  }
}

async function showMyGroups() {
  if (!currentUser) {
    alert("יש להתחבר כדי לראות את הקבוצות שלך.");
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
  document.getElementById("supplierArea").style.display = "none";
}

async function showSupplierArea() {
  const product = prompt("מה אתה מוכר?");
  if (!product) return;

  const price = prompt("כמה אתה מציע?");
  if (!price) return;

  const q = query(collection(db, "groups"), where("name", "==", product.toLowerCase()));
  const snapshot = await getDocs(q);

  snapshot.forEach(async (docSnap) => {
    const groupRef = doc(db, "groups", docSnap.id);
    const groupData = docSnap.data();
    const offers = groupData.offers || [];

    offers.push({
      price,
      supplier: currentUser?.uid || "לא ידוע",
      createdAt: new Date()
    });

    await updateDoc(groupRef, { offers });
  });

  alert("הצעת המחיר נשמרה!");
}

window.searchProduct = searchProduct;
window.showMyGroups = showMyGroups;
window.showHotGroups = showHotGroups;
window.showSupplierArea = showSupplierArea;
window.joinGroup = joinGroup;
window.leaveGroup = leaveGroup;

window.addEventListener('DOMContentLoaded', () => {
  const navTabs = document.querySelector('.nav-tabs');
  if (navTabs) {
    navTabs.style.display = 'flex';
    navTabs.style.justifyContent = 'center';
    navTabs.style.flexWrap = 'wrap';
    navTabs.style.marginTop = '20px';
  }

  const searchInput = document.getElementById('searchInput');
  const searchButton = document.querySelector('button[onclick="searchProduct()"]');
  const parent = searchInput?.parentElement;

  if (searchInput && searchButton && parent) {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'center';
    wrapper.style.gap = '10px';
    wrapper.style.marginTop = '20px';
    parent.insertBefore(wrapper, searchInput);
    wrapper.appendChild(searchInput);
    wrapper.appendChild(searchButton);
  }
});
