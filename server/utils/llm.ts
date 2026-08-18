import dotenv from 'dotenv';

dotenv.config();

/**
 * Calls OpenRouter with the specified system and user prompts and returns the parsed JSON response.
 * We use 'openrouter/auto' to dynamically route to the best available model based on quota/availability.
 */
export async function callOpenRouterJSON(systemPrompt: string, userPrompt: string, model: string = "openrouter/auto"): Promise<any> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("WARNING: OPENROUTER_API_KEY is not set. Falling back to mocked JSON response for development.");
    throw new Error("OPENROUTER_API_KEY_MISSING");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://scholar-agentic-os.com", // Required by OpenRouter
      "X-Title": "Scholar Agentic OS"
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  try {
    return JSON.parse(content);
  } catch (err) {
    console.error("Failed to parse LLM JSON output:", content);
    throw new Error("Invalid JSON returned by LLM");
  }
}
