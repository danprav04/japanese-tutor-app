const { GoogleGenerativeAI } = require('@google/generative-ai');

// Use the key from the app (hardcoded here for the script, user needs to provide or I grab from env)
// I'll assume I can read the key from the app's secure store is hard in node.
// I'll ask the user strictly or... wait, I can just try to run it with a placeholder and ask user to set env?
// Better: I'll read the code to see where keys are.
// Actually, `gemini-client.ts` reads from `useAppStore`.
// I will just use a direct CURL command if I can get the key. 
// Or better, I'll create a script that imports the client? No, that's react native.

// I will create a simple script that asks for a key or just hardcodes one if I can find it in the logs (I shouldn't).
// I will assume the user has a key. I'll rely on the previous `check_limits.js` which might exist?
// `check_limits.js` was seen in the file list!

const apiKey = process.env.GEMINI_API_KEY || 'YOUR_API_KEY';

if (apiKey === 'YOUR_API_KEY') {
  console.error('Please set GEMINI_API_KEY env var');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
  try {
    const models = await genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }).apiKey; 
    // Wait, the SDK has a listModels method on the client?
    // Actually, looking at docs: `genAI.getGenerativeModel` returns a model.
    // There isn't a direct "list models" on the class instance in some versions?
    // Let's us fetch via REST.
    
    console.log('Fetching models...');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    if (data.models) {
        console.log('Available Models:');
        data.models.forEach(m => {
            console.log(`- ${m.name} (${m.displayName})`);
            console.log(`  Description: ${m.description}`);
            console.log('---');
        });
    } else {
        console.log('No models found or error:', data);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

listModels();
