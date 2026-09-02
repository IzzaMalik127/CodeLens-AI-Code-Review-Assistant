const API_URL = "https://codelens-ai-code-review-backend.vercel.app";

export async function reviewCode(code: string, language: string) {
  const response = await fetch(`${API_URL}/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      code,
      language,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Backend error:", errorText);
    throw new Error("Failed to review code");
  }

  return response.json();
}

