/**
 * How to Deploy Your Serverless Groq Proxy
 * 
 * 1. Install Cloudflare Wrangler
 *    Run: npm install -g wrangler
 * 
 * 2. Go to the proxy folder and login to Cloudflare
 *    Run: cd cf-proxy
 *    Run: wrangler login
 * 
 * 3. Add your Groq API Key as a Secret
 *    Run: wrangler secret put GROQ_API_KEY
 *    (Paste your Groq API key when prompted)
 * 
 * 4. Deploy your Worker
 *    Run: wrangler deploy
 * 
 * 5. Update your app
 *    After deploying, Cloudflare will give you a URL like `https://ai-proxy.yourname.workers.dev`.
 *    Open `src/services/groq-client.ts` and replace `AI_PROXY_URL` with your brand new URL!
 */
