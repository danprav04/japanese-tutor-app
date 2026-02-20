export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      // Handle CORS preflight
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Authenticate the request
    const appSecret = request.headers.get("x-app-secret");
    if (!appSecret || appSecret !== env.APP_SECRET) {
      return new Response("Unauthorized", { 
        status: 401,
        headers: { "Access-Control-Allow-Origin": "*" } 
      });
    }

    try {
      // The body comes from your app already formatted for the OpenAI spec
      // e.g. { model: "qwen-3-32b", messages: [...] }
      const requestBody = await request.text();

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      // Stream the response back to the client directly
      // This supports Server-Sent Events (SSE) streaming as well as normal responses
      const newResponse = new Response(response.body, response);
      
      // Add CORS to the final response
      newResponse.headers.set("Access-Control-Allow-Origin", "*");
      return newResponse;

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
      });
    }
  },
};
