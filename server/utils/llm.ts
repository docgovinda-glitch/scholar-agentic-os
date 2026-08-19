import dotenv from 'dotenv';

dotenv.config();

/**
 * Calls an LLM with the specified system and user prompts and returns the parsed JSON response.
 * Primary: OpenRouter (if OPENROUTER_API_KEY is set)
 * Fallback: Google Gemini (if GEMINI_API_KEY is set)
 */
export async function callOpenRouterJSON(systemPrompt: string, userPrompt: string, model: string = "openrouter/auto"): Promise<any> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (openRouterKey) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterKey}`,
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
  } else if (geminiKey) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: { text: systemPrompt } },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    let content = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    
    // Gemini sometimes wraps JSON in markdown fences even with responseMimeType set
    content = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

    try {
      return JSON.parse(content);
    } catch (err) {
      console.error("Failed to parse Gemini JSON output:", content);
      throw new Error("Invalid JSON returned by LLM");
    }
  } else {
    throw new Error("API_KEYS_MISSING: You must configure either OPENROUTER_API_KEY or GEMINI_API_KEY in the environment.");
  }
}
