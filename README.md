# StudyBattles

StudyBattles turns your study materials into a gamified "boss battle" experience. Upload lecture slides, Word docs, or a YouTube video and get an interactive prerequisite tree where you unlock parent topics by mastering their children first.

## How It Works

1. Upload a `.pptx`, `.docx`, or YouTube URL
2. The backend extracts the text and asks an LLM to build a topic hierarchy with prerequisites
3. Leaf nodes are unlocked by default — answer their exam-style questions to unlock parent nodes
4. An LLM evaluator marks your answers against a generated mark scheme and gives feedback
5. Complete all children to "defeat" the parent boss

## Tech Stack

| Layer               | Technology                        |
| ------------------- | --------------------------------- |
| Backend             | Python 3.12, FastAPI, Uvicorn     |
| Database            | MongoDB                           |
| LLM                 | OpenAI API                        |
| Document parsing    | python-pptx, python-docx          |
| YouTube transcripts | RapidAPI (youtube-transcripts)    |
| Frontend            | React 19, Vite 7, React Router v7 |
| Testing             | Vitest, React Testing Library     |

## Project Structure

```
StudyBattles/
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI app, CORS, route mounting
│   │   ├── config.py             # Pydantic settings (env vars)
│   │   ├── db.py                 # MongoDB client & collections
│   │   ├── dependencies.py       # Bearer token auth middleware
│   │   ├── models/               # Pydantic models (tree, node, session, attempt)
│   │   └── routes/
│   │       ├── auth.py           # POST /auth/verify
│   │       ├── upload.py         # POST /upload
│   │       ├── generate_tree.py  # POST /generate-tree
│   │       ├── generate_questions.py
│   │       ├── session.py        # Session lifecycle
│   │       └── evaluate.py       # POST /evaluate
│   ├── tests/                    # pytest test suite
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.jsx               # Password gate + routing
    │   ├── api.js                # Centralised fetch helper
    │   ├── components/
    │   │   ├── PasswordGate.jsx
    │   │   └── CollapsibleTree.jsx
    │   ├── pages/
    │   │   ├── Home.jsx          # Upload, tree display, session management
    │   │   └── QuestionScreen.jsx
    │   ├── tests/                # Vitest + React Testing Library
    │   └── utils/
    │       └── detectNewlyUnlocked.js
    └── package.json
```

## Local Setup

### Prerequisites

- Python 3.12+
- Node.js (LTS)
- MongoDB (local or Atlas)
- OpenAI API key
- RapidAPI key (for YouTube transcripts)

### Backend

1. Create `backend/app/.env`:

```env
mongodb_uri=mongodb+srv://<user>:<pass>@cluster.mongodb.net/?retryWrites=true&w=majority
openai_api_key=sk-...
rapidapi_key=...
rapidapi_host=youtube-transcripts.p.rapidapi.com
access_password=your-chosen-password
secret_key=random-secret-for-hmac-tokens
allowed_origins=http://localhost:5173
```

2. Install and run:

```bash
cd backend
pip install -r requirements.txt
cd app
uvicorn main:app --reload
# → http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

Create `frontend/.env.local` if you need to point at a non-default backend:

```env
VITE_API_BASE_URL=http://localhost:8000
```

The frontend defaults to `http://localhost:8000` when the variable is absent.

### Running Tests

```bash
# Frontend
cd frontend && npm test

# Backend
cd backend && pytest
```

## Authentication

Access is gated by a single shared password set via the `access_password` env var. On login, the server returns an HMAC-SHA256 Bearer token that is sent with every subsequent request.

## Data Model

| Collection  | Purpose                                                       |
| ----------- | ------------------------------------------------------------- |
| `documents` | Uploaded file metadata + extracted text                       |
| `trees`     | LLM-generated topic hierarchy (nested structure)              |
| `nodes`     | Per-node questions and mark schemes                           |
| `sessions`  | Per-user unlock status (`locked` / `available` / `completed`) |
| `attempts`  | Full history of submitted answers and marks                   |

## Key Features

- **Multi-format ingestion** — PPTX slides, DOCX paragraphs/tables, YouTube transcripts
- **Prerequisite-locked tree** — parent nodes unlock only after all children are beaten; maximum depth of 4 levels enforced
- **5 question types** — Definition, Cause & Effect, Application, Comparison, True/False
- **LLM marking** — accepts paraphrasing; marks per key point with targeted feedback
- **Session persistence** — tree and unlock state survive page reloads and navigation via localStorage
- **Question regeneration** — request a fresh question for any node without repeats
- **Error feedback** — upload failures, generation timeouts, and evaluation errors surface as user-facing messages rather than silent failures
- **Loading states** — Generate Tree, Refresh, and New Question actions disable their controls while in-flight
