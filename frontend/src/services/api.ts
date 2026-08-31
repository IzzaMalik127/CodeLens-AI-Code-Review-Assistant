const API_URL = "http://127.0.0.1:8000";

export async function reviewCode(code: string) {
  const response = await fetch(`${API_URL}/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to review code");
  }

  return response.json();
}