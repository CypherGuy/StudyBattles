from fastapi import FastAPI
from routes import health, upload, generate_tree, generate_questions, session
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(upload.router)
app.include_router(generate_tree.router)
app.include_router(generate_questions.router)
app.include_router(session.router)
