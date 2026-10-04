// ---------- Starting data ----------
let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const VALID_CATEGORIES = ["personal", "work", "study"];

// Lower-case, trim and collapse repeated spaces so comparisons are fair
function normalise(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

// 1. Search notes by word (ignores upper/lower case)
function searchNotes(word) {
  const search = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(search));
}

// 2. Note with the most characters (null if there are none)
function longestNote() {
  if (notes.length === 0) return null;
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

// 3. Count notes per category
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    if (counts[note.category] === undefined) {
      counts[note.category] = 1;
    } else {
      counts[note.category]++;
    }
  }
  return counts;
}

// 4. Summary sentence
function getSummary() {
  const total = notes.length;
  const counts = countByCategory();
  const word = total === 1 ? "note" : "notes";

  if (total === 0) return "0 notes.";

  const parts = [];
  for (const category of VALID_CATEGORIES) {
    if (counts[category] > 0) {
      parts.push(`${counts[category]} ${category}`);
    }
  }
  return `${total} ${word}: ${parts.join(", ")}.`;
}

// 5. Duplicate check (ignores case and extra spaces)
function isDuplicate(text) {
  const target = normalise(text);
  return notes.some((note) => normalise(note.text) === target);
}

// 6. Add a note if it passes every check
function addNote(text, category) {
  const cleaned = text.trim();

  if (cleaned.length < 1 || cleaned.length > 200) {
    console.log("❌ Rejected: text must be 1-200 characters.");
    return false;
  }
  if (!VALID_CATEGORIES.includes(category)) {
    console.log("❌ Rejected: category must be personal, work or study.");
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log("❌ Rejected: duplicate note.");
    return false;
  }

  notes.push({ id: Date.now(), text: cleaned, category: category });
  console.log(`✅ Added: "${cleaned}" (${category})`);
  return true;
}

// ---------- Tests ----------

// searchNotes
console.log(searchNotes("JAVASCRIPT"));
// Expected: array with one note, id 4 "Revise JavaScript arrays"
console.log(searchNotes("xyz"));
// Expected: [] (no results)

// longestNote
console.log(longestNote());
// Expected: { id: 3, text: "Email the project report to Grace", category: "work" }
const backup = notes;
notes = [];
console.log(longestNote());
// Expected: null (empty array)
notes = backup;

// countByCategory
console.log(countByCategory());
// Expected: { personal: 2, study: 2, work: 1 }
notes = [];
console.log(countByCategory());
// Expected: {} (empty object)
notes = backup;

// getSummary
console.log(getSummary());
// Expected: "5 notes: 2 personal, 1 work, 2 study."
notes = [{ id: 9, text: "Only one", category: "work" }];
console.log(getSummary());
// Expected: "1 note: 1 work."
notes = backup;

// isDuplicate
console.log(isDuplicate("  buy MILK   and bread "));
// Expected: true (same text, ignoring case and extra spaces)
console.log(isDuplicate("Walk the dog"));
// Expected: false

// addNote
console.log(addNote("Walk the dog", "personal"));
// Expected: logs ✅ Added, returns true
console.log(addNote("buy milk and bread", "personal"));
// Expected: logs ❌ duplicate, returns false
console.log(addNote("   ", "work"));
// Expected: logs ❌ length, returns false
console.log(addNote("Plan a holiday", "hobby"));
// Expected: logs ❌ category, returns false
console.log(addNote("x".repeat(201), "work"));
// Expected: logs ❌ length, returns false

// Final check after adding one note
console.log(getSummary());
// Expected: "6 notes: 3 personal, 1 work, 2 study."