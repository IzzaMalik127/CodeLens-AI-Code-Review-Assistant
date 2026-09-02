import os
import json
import asyncio

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from google import genai


# =========================================================
# LOAD ENVIRONMENT
# =========================================================

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError(
        "GEMINI_API_KEY is not set in the .env file"
    )


# =========================================================
# GEMINI CLIENT
# =========================================================

client = genai.Client(
    api_key=GEMINI_API_KEY
)


# =========================================================
# FASTAPI APP
# =========================================================

app = FastAPI(
    title="CodeLens AI Code Review Assistant",
    description="AI-powered code analysis using Gemini",
    version="1.0.0",
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # Local development
        "http://localhost:5173",
        "http://127.0.0.1:5173",

        # Production frontend
        "https://codelens-ai-code-review.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# REQUEST MODEL
# =========================================================

class CodeRequest(BaseModel):
    code: str
    language: str


# =========================================================
# HOME
# =========================================================

@app.get("/")
def home():
    return RedirectResponse(url="/docs")


# =========================================================
# PROMPT BUILDER
# =========================================================

def build_prompt(language: str, code: str) -> str:
    return f"""
Review this {language} code as a professional software engineer.

Analyze:

- bugs and runtime errors
- security problems
- performance problems
- code quality
- practical improvements

Important:

Analyze ONLY as {language}.

Do not assume another language.

Return ONLY valid JSON.

No Markdown.
No code fences.
No explanations outside JSON.

Keep descriptions short and beginner-friendly.

Use exactly this structure:

{{
  "overall": "Short overall assessment.",
  "health_score": 85,
  "bugs": [
    {{
      "description": "Short bug description.",
      "severity": "high"
    }}
  ],
  "security": [
    {{
      "description": "Short security description.",
      "severity": "medium"
    }}
  ],
  "performance": [
    {{
      "description": "Short performance description.",
      "severity": "low"
    }}
  ],
  "quality": [
    {{
      "description": "Short quality description.",
      "severity": "low"
    }}
  ],
  "suggestions": [
    "Short improvement suggestion."
  ]
}}

Rules:

health_score:

100 = excellent
90-99 = very good
75-89 = good
60-74 = needs attention
40-59 = significant problems
0-39 = critical problems

severity must be exactly:

"high", "medium", or "low"

If a category has no issues, return an empty array.

Do not invent issues.

Suggestions should be practical and relevant.

CODE:

{code}
"""


# =========================================================
# CLEAN AI RESPONSE
# =========================================================

def clean_response(response_text: str) -> str:
    response_text = response_text.strip()

    if response_text.startswith("```"):
        response_text = response_text.replace(
            "```json",
            "",
            1
        )

        if response_text.endswith("```"):
            response_text = response_text[:-3]

        response_text = response_text.strip()

    return response_text


# =========================================================
# NORMALIZE REVIEW
# =========================================================

def normalize_review(review_data: dict) -> dict:

    review_data.setdefault(
        "overall",
        "No overall assessment provided."
    )

    review_data.setdefault("bugs", [])
    review_data.setdefault("security", [])
    review_data.setdefault("performance", [])
    review_data.setdefault("quality", [])
    review_data.setdefault("suggestions", [])

    if "health_score" not in review_data:
        review_data["health_score"] = 75

    try:
        review_data["health_score"] = max(
            0,
            min(
                100,
                int(review_data["health_score"])
            )
        )

    except (ValueError, TypeError):
        review_data["health_score"] = 75

    return review_data


# =========================================================
# CODE REVIEW
# =========================================================

@app.post("/review")
async def review_code(request: CodeRequest):

    # -----------------------------------------------------
    # VALIDATE INPUT
    # -----------------------------------------------------

    code = request.code.strip()
    language = request.language.strip()

    if not code:
        raise HTTPException(
            status_code=400,
            detail="Code cannot be empty."
        )

    if not language:
        raise HTTPException(
            status_code=400,
            detail="Programming language is required."
        )

    # Prevent unnecessarily huge requests
    if len(code) > 20000:
        raise HTTPException(
            status_code=413,
            detail=(
                "Code is too large. "
                "Please submit less than 20,000 characters."
            )
        )

    # -----------------------------------------------------
    # BUILD PROMPT
    # -----------------------------------------------------

    prompt = build_prompt(
        language,
        code
    )

    # -----------------------------------------------------
    # GEMINI REQUEST
    # -----------------------------------------------------

    max_attempts = 2

    for attempt in range(max_attempts):

        try:

            print(
                f"Starting AI review "
                f"(attempt {attempt + 1}/{max_attempts})..."
            )

            # Run the synchronous Gemini SDK call
            # without blocking FastAPI's event loop.

            interaction = await asyncio.to_thread(
                client.interactions.create,
                model="gemini-3.6-flash",
                input=prompt,
            )

            response_text = interaction.output_text.strip()

            print(
                "Gemini response received successfully."
            )

            break

        except Exception as error:

            print(
                "Gemini API error:",
                error
            )

            if attempt < max_attempts - 1:

                print(
                    "Temporary failure. Retrying..."
                )

                await asyncio.sleep(1)

            else:

                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Gemini AI is temporarily unavailable. "
                        "Please try again."
                    )
                )

    # =====================================================
    # CLEAN RESPONSE
    # =====================================================

    response_text = clean_response(
        response_text
    )

    # =====================================================
    # PARSE JSON
    # =====================================================

    try:

        review_data = json.loads(
            response_text
        )

    except json.JSONDecodeError:

        print(
            "Gemini returned invalid JSON."
        )

        return {
            "message": (
                "AI code review completed "
                "with limited formatting."
            ),
            "review": {
                "overall": response_text,
                "health_score": 75,
                "bugs": [],
                "security": [],
                "performance": [],
                "quality": [],
                "suggestions": [
                    (
                        "Try reviewing the code again "
                        "for a structured analysis."
                    )
                ],
            },
        }

    # =====================================================
    # NORMALIZE RESULT
    # =====================================================

    review_data = normalize_review(
        review_data
    )

    # =====================================================
    # RETURN RESULT
    # =====================================================

    return {
        "message": "AI code review completed!",
        "review": review_data,
    }

