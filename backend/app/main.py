from fastapi import FastAPI, Depends
from routes import health, upload, generate_tree, generate_questions, session, evaluate
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from dependencies import make_rate_limiter


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "This is the StudyBattles API backend. The frontend is at https://study-battles.vercel.app"}

app.include_router(health.router)
app.include_router(upload.router,             dependencies=[Depends(make_rate_limiter(10, 3600))])
app.include_router(generate_tree.router,      dependencies=[Depends(make_rate_limiter(5, 3600))])
app.include_router(generate_questions.router, dependencies=[Depends(make_rate_limiter(30, 3600))])
app.include_router(session.router,            dependencies=[Depends(make_rate_limiter(60, 3600))])
app.include_router(evaluate.router,           dependencies=[Depends(make_rate_limiter(50, 3600))])
