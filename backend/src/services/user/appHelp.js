// Authoritative reference for how THIS application works.
//
// The assistant is asked questions like "how do I change dark mode" or "how do
// I change my password". Answering those from the model's own knowledge is a
// reliable way to produce confident, wrong instructions, because it has never
// seen this codebase. This file is the single source of truth instead: the model
// quotes from it and is told to admit gaps rather than improvise.
//
// Every entry below was checked against the real app. When a feature moves or is
// added, update it here — nothing else needs to change.

// Navigation is one flat list, so "where do I find X" is answerable precisely.
const PAGES = [
  ["/", "Dashboard", "at-a-glance summary: tasks due today, in progress, overdue, completion rate, and the AI assistant."],
  ["/tasks", "Tasks", "all tasks, with filters, subtasks, attachments and tags."],
  ["/projects", "Projects", "group tasks into projects and track project progress."],
  ["/calendar", "Calendar", "day and month view of anything with a due date."],
  ["/notes", "Notes", "free-form notes."],
  ["/goals", "Goals", "longer-term goals with progress."],
  ["/habits", "Habits", "recurring habits and their completion history."],
  ["/ai", "AI Assistant", "full-screen chat with the assistant, including file attachments and reply playback."],
  ["/community", "Community", "friends, friend requests and group conversations."],
  ["/notifications", "Notifications", "notification inbox."],
  ["/profile", "Profile", "personalisation preferences and membership details."],
  ["/settings", "Settings", "appearance, notification preferences, and account deletion."],
];

const HOW_TO = [
  {
    topic: "Changing dark mode (or light mode)",
    steps: [
      "Open Settings (the /settings page).",
      "In the Appearance section, use the Theme control.",
      "Pick Light, Dark, or System. 'System' follows your operating system's own light/dark setting and updates automatically.",
    ],
    note: "The setting is saved to your account and applies on every device you sign in on.",
  },
  {
    topic: "Compact mode",
    steps: [
      "Open Settings.",
      "Turn on the Compact mode toggle in the Appearance section.",
      "This tightens row spacing and padding to fit more on screen.",
    ],
  },
  {
    topic: "Changing your password",
    steps: [
      "There is no 'change password' form inside the app.",
      "Go to the Login screen and choose 'Forgot password'.",
      "Enter your account email; a reset code is sent to that address.",
      "Follow the link/code and choose a new password.",
    ],
    note: "If the user believes they should be able to change it while signed in, say plainly that the app does not offer that yet and point them to the forgot-password flow. Do not invent an in-app path.",
  },
  {
    topic: "Changing the notification sound",
    steps: [
      "Open Settings.",
      "In the Notifications section, use the sound picker to choose a sound, and press the speaker button next to it to preview it.",
    ],
    note: "Previews still play when sounds are muted, so you can audition a sound before turning sound back on.",
  },
  {
    topic: "Muting notification sounds",
    steps: [
      "Open Settings.",
      "In the Notifications section, turn off the notification sound toggle.",
    ],
    note: "Muting is independent of which sound is selected, so turning sound back on restores your previous choice.",
  },
  {
    topic: "Choosing which notifications you get",
    steps: [
      "Open Settings.",
      "Use the toggles in the Notifications section to enable or disable individual alerts.",
    ],
  },
  {
    topic: "Changing what the assistant knows about you",
    steps: [
      "Open Profile (the /profile page).",
      "Use the Personalisation section to set your preferred name, work style, planning style, task organisation, most productive time, break preference, reminder preference, task detail level, AI response style, and which AI provider to use.",
      "The assistant reads these and adapts its suggestions and tone.",
    ],
  },
  {
    topic: "Switching AI provider",
    steps: [
      "Open Profile.",
      "Change the AI provider setting in the Personalisation section.",
      "Gemini and OpenRouter are supported.",
    ],
  },
  {
    topic: "Deleting your account",
    steps: [
      "Open Settings.",
      "Scroll to the Danger zone and use 'Delete account'.",
      "This permanently removes your account and its data, and asks you to confirm.",
    ],
  },
  {
    topic: "Attaching files to the assistant",
    steps: [
      "Open the AI Assistant (the /ai page).",
      "Use the attachment button in the composer to add up to 6 files (documents, images, archives and code files).",
    ],
    note: "Attachments are not available from the dashboard card; use the full AI Assistant page for that.",
  },
];

// The dashboard card is a genuinely different surface from the full assistant
// page, and users get confused when replies do not show up where they typed.
const SURFACE_NOTES = [
  "The dashboard has a compact AI card. Questions asked there are answered in the card itself, and the conversation is the same one stored under the AI Assistant page.",
  "Only the dashboard card is a short prompt box. File attachments, voice playback of replies, and conversation management live on the full AI Assistant page.",
  "The assistant reads your current open tasks, goals, habits, notes and counts on every question, so it can answer 'how many goals do I have' or 'what is due today' without you restating them.",
];

function buildAppHelp() {
  const lines = [];

  lines.push("Pages in this app:");
  for (const [path, label, description] of PAGES) {
    lines.push(`- ${label} (${path}): ${description}`);
  }

  lines.push("");
  lines.push("How to do common things (follow these steps exactly; do not improvise alternatives):");

  for (const entry of HOW_TO) {
    lines.push("");
    lines.push(`${entry.topic}:`);
    entry.steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
    if (entry.note) lines.push(`Note: ${entry.note}`);
  }

  lines.push("");
  lines.push("Notes on where the assistant lives:");
  for (const note of SURFACE_NOTES) lines.push(`- ${note}`);

  return lines.join("\n");
}

const APP_HELP = buildAppHelp();

module.exports = { APP_HELP, PAGES, HOW_TO, SURFACE_NOTES, buildAppHelp };
