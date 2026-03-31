from fastapi import FastAPI
from routes import health, upload, generate_tree, generate_questions, session, evaluate
from fastapi.middleware.cors import CORSMiddleware
from config import settings


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(upload.router)
app.include_router(generate_tree.router)
app.include_router(generate_questions.router)
app.include_router(session.router)
app.include_router(evaluate.router)
