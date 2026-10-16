# RasoiOS — End-to-End Kitchen Intelligence System
**The Voice-First, Self-Correcting Household Kitchen Operating System.** Built for Renaissance 2026.

RasoiOS answers the daily question:
> **"What should our household cook today, given who is eating, what is available, dietary restrictions, time, and changing circumstances?"**

Unlike a recipe chatbot, RasoiOS maintains persistent household state, understands Hindi/English/Hinglish kitchen speech, requests explicit user confirmation for proposed changes, commits atomic state updates, and **automatically replans affected meals when kitchen reality changes**.

---

## 🌟 Key Capabilities

1. **Voice-First Input with Groq Whisper & WebSpeech**:
   - High-accuracy speech-to-text using Groq `whisper-large-v3-turbo`.
   - Browser WebSpeech API fallback + manual typing fallback.
   - Code-mixed Hindi, English, and Hinglish understanding without forced restrictive language parameters.
2. **Resilient AI Command Interpretation**:
   - Primary: Gemini `gemini-3.1-flash-lite` server-side extraction.
   - Secondary: Groq `openai/gpt-oss-20b` automatic fallback on Gemini rate limits, 503 overloads, or service disruptions.
   - Strict Zod schema validation over all AI outputs; LLMs never write directly to the database.
   - Distinguishes between available stock (*"palak aadha kilo bacha hai"*) and requirements/wishes (*"palak chahiye"*).
3. **Transparent Human Confirmation**:
   - Plain-language preview of interpreted kitchen actions before any mutation.
   - Edit, discard, or confirm individual proposals with idempotent transaction tokens (`idempotencyKey`).
4. **Self-Correcting Meal Replanning**:
   - Confirmed changes (e.g., *"Paneer khatam ho gaya"*) atomically update inventory availability and recalculate affected meals.
   - Deterministic TypeScript meal solver detects now-infeasible dishes, marks old plans stale/rejected, and finds viable alternatives with explanations.
5. **Cook Mode with Multilingual TTS**:
   - Hands-free cooking view with step-by-step navigation, dynamic serving scaling, and ingredient checklists.
   - Browser `SpeechSynthesis` read-aloud support for Hindi, English, and Marathi.
   - Direct supplementary YouTube recipe search query generator without requiring YouTube API keys or web scraping.
6. **Grocery Gap Aggregator**:
   - Compares planned meal requirements against current stock to highlight missing ingredients, shortfalls, and affected recipes.

---

## 🚀 Quickstart & Setup

### Prerequisites
- Node.js 22.12+ (Node 24 LTS recommended)
- npm

### 1. Clone & Install
```bash
git checkout feature/phase3-ai-integration
npm install
```

### 2. Configure Environment Variables
Copy or configure `.env.local` with your API keys:
```env
DATABASE_URL="file:./prisma/dev.db"
GEMINI_API_KEY="your-gemini-api-key"
GROQ_API_KEY="your-groq-api-key"
```
*(Note: Both AI providers run strictly server-side. No API keys are bundled to client-side code).*

### 3. Setup Database & Seed
```powershell
npm run db:setup
```
This runs SQLite migrations and seeds the database with a realistic multi-generational Indian household (including vegetarian, Jain, and fasting members), canonical ingredients, and 15 authentic recipes.

### 4. Run the Application
```powershell
npm run dev
```
Open **http://127.0.0.1:3000** in your browser.

---

## 🧪 Automated Verification & Tests

To execute the test suite (58 tests covering Phase 1, Phase 2, Phase 3 voice validation, mutations, and replanning):
```powershell
npm test
```

To run TypeScript compiler verification:
```powershell
npx tsc --noEmit
```

To run Next.js production build:
```powershell
npm run build
```

---

## 🎙️ The 6 End-to-End Demo Scenarios

### Scenario A — Initial Meal Planning
1. Navigate to **Meal Planner** (`/meal-planner`).
2. Select lunch for all participating household members.
3. Click **Find Menus**.
4. The deterministic solver evaluates inventory, fasting status, cooking time, and dietary constraints, outputting recommended menus with complete constraint explanations.

### Scenario B — Ingredient Becomes Unavailable & Auto-Replanning
1. Navigate to **Voice Assistant** (`/voice`).
2. Speak or type: `"Paneer khatam ho gaya."`
3. Click **Interpret Kitchen Voice**.
4. Review the interpreted proposal: `Mark paneer as UNAVAILABLE`.
5. Click **Confirm & Apply to Kitchen**.
6. RasoiOS updates inventory to `UNAVAILABLE`, detects that today's lunch (e.g. *Palak Paneer*) is no longer feasible, rejects the old plan, searches for a viable alternative (e.g. *Aloo Palak* or *Dal Tadka*), and refreshes cooking instructions.

### Scenario C — Quantity Update with Unit Conversion
1. In the Voice Assistant, speak or type: `"Palak aadha kilo bacha hai."`
2. Interpret: Proposals show `Set spinach quantity to 500 g`.
3. Confirm: The database updates the stock. View the update in **Kitchen Inventory** (`/inventory`).

### Scenario D — Fasting Status Adaptation
1. In the Voice Assistant, speak or type: `"Aaj dadi ka vrat hai."`
2. Interpret: Maps `"dadi"` to member *Sushila* and sets fasting active.
3. Confirm: Sushila's fasting rules are activated. Any planned meals are checked against fasting constraints, ensuring grains/onions/garlic are excluded for her.

### Scenario E — Provider Fallback Simulation
1. If Gemini encounters rate limiting or 503 overload, the system seamlessly falls back to Groq `openai/gpt-oss-20b`.
2. The user experience remains uninterrupted, and the provider metadata reflects which engine served the request.

### Scenario F — Voice Fallback to Typing
1. If microphone permission is denied or the user is in a noisy environment, use the manual text entry field.
2. The exact same interpretation, validation, confirmation, and replanning pipeline executes.

---

## 📡 API Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/voice/transcribe` | `POST` | Groq Whisper speech-to-text with code-mixed support |
| `/api/voice/interpret` | `POST` | Gemini -> Groq command interpreter with Zod validation |
| `/api/voice/confirm` | `POST` | Atomic mutation executor with idempotency & auto-replanning |
| `/api/groceries/gaps` | `GET` | Aggregated shortages for upcoming scheduled meals |
| `/api/household` | `GET` | Household profiles, members, and inventory state |
| `/api/recipes` | `GET` | Recipe catalog with ingredients and steps |
| `/api/meals/recommend` | `POST` | Deterministic meal solver recommendations |
| `/api/meals` | `GET, POST` | Retrieve or persist approved meal plans |
| `/api/activity` | `GET` | Audit log with timestamps and state versions |

---

## 🔒 Security & Reliability Guarantees
- **No Direct LLM Writes**: All AI interpretations are validated against strict Zod schemas before being shown to the user.
- **Human-in-the-Loop Confirmation**: No inventory or member state changes occur without explicit user review.
- **Idempotent Mutations**: Batches use an `idempotencyKey` preventing double submissions or race conditions.
- **Zero Hallucinated Recipes**: Recommendations are strictly resolved from verified household recipe templates and real pantry stock.
- **No Leaked Secrets**: All API keys remain server-side.
