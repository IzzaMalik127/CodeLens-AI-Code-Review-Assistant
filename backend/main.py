import os
import json
import asyncio

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from google import genai


# ---------------------------------------------------------
# Environment
# ---------------------------------------------------------

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY is not set in the .env file")


# ---------------------------------------------------------
# Gemini Client
# ---------------------------------------------------------

client = genai.Client(api_key=GEMINI_API_KEY)


# ---------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------

app = FastAPI(
    title="CodeLens AI Code Review Assistant",
    description="AI-powered code analysis using Gemini",
    version="1.0.0",
)


# ---------------------------------------------------------
# CORS
# ---------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://codelens-ai-ten.vercel.app",
        "https://codelens-ai-code-review.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "OPTIONS",
    ],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# Request Model
# ---------------------------------------------------------

class CodeRequest(BaseModel):
    code: str
    language: str


# ---------------------------------------------------------
# Home
# ---------------------------------------------------------

@app.get("/")
def home():
    return RedirectResponse(url="/docs")


# ---------------------------------------------------------
# Health Check
# ---------------------------------------------------------

@app.get("/health")
def health():
    return {
        "status": "ok",
        "message": "CodeLens AI backend is running!"
    }


# ---------------------------------------------------------
# Code Review
# ---------------------------------------------------------

@app.post("/review")
async def review_code(request: CodeRequest):

    if not request.code.strip():
        raise HTTPException(
            status_code=400,
            detail="Code cannot be empty."
        )

    prompt = f"""
You are CodeLens AI, a professional AI code review assistant.

Analyze the following {request.language} code carefully.

CODE:
```{request.language}
{request.code}