import os
import json

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from openai import OpenAI


# =========================================================
# LOAD ENVIRONMENT
# =========================================================

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

if not OPENROUTER_API_KEY:
    raise ValueError(
        "OPENROUTER_API_KEY is not set in the .env file"
    )


# =========================================================
# AI SETTINGS
# =========================================================

# Free model router. You can replace this with a specific
# model ID from openrouter.ai/models later.
MODEL_NAME = "openrouter/free"

# Maximum length of the AI answer (shorter = faster)
MAX_OUTPUT_TOKENS = 1500

# How many times to try before giving up
MAX_ATTEMPTS = 2


# =========================================================
# OPENROUTER CLIENT
# =========================================================

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
    timeout=25.0,      # give up on one attempt after 25 seconds
    max_retries=0,     # no hidden retries that add extra waiting
)


# =========================================================
# FASTAPI APP
# =========================================================

app = FastAPI(
    title="CodeLens AI Code Review Assistant",
    description="AI-powered code analysis using OpenRouter",
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
        "https://codelens-ai-ten.vercel.app",
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

Return at most 3 items per category.

Keep each description under 25 words.

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
    # OPENROUTER REQUEST (with time limit and 2 attempts)
    # -----------------------------------------------------

    response_text = None

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            print(
                f"Starting OpenRouter AI review "
                f"(attempt {attempt} of {MAX_ATTEMPTS})..."
            )

            response = client.chat.completions.create(
                model=MODEL_NAME,
                max_tokens=MAX_OUTPUT_TOKENS,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
            )

            content = response.choices[0].message.content

            if not content:
                raise ValueError(
                    "OpenRouter returned an empty response."
                )

            response_text = content.strip()

            print(
                "OpenRouter response received successfully."
            )

            break

        except Exception as error:
            print(
                f"OpenRouter API error (attempt {attempt}):",
                error
            )

    if response_text is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "OpenRouter AI is temporarily unavailable. "
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
            "OpenRouter returned invalid JSON."
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