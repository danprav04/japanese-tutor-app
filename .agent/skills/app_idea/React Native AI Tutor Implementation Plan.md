Architectural Blueprint for an Autonomous, Local-First AI Japanese Tutor: A Comprehensive Implementation Strategy
1. Executive Summary and System Philosophy
The architectural design of an Intelligent Tutoring System (ITS) for Japanese language acquisition, constrained to a mobile-native, serverless environment, represents a paradigm shift in educational technology. The objective is to construct a fully autonomous application using React Native and Expo that functions without a developer-managed backend. This "Local-First" ideology necessitates that the mobile device serves not merely as a presentation layer, but as the primary computational node responsible for data persistence, cognitive modeling, and generative orchestration.
The proposed system integrates LangGraph for agentic workflow management, SQLite (specifically op-sqlite with vector extensions) as a hybrid relational-vector knowledge store, and scientifically validated pedagogical algorithms including Bayesian Knowledge Tracing (BKT) and the Free Spaced Repetition Scheduler (FSRS). By synthesizing these technologies, the application will emulate the capabilities of a human tutor: maintaining a theory of the learner's mind, understanding the structural dependencies of the Japanese language, and generating context-aware study tools dynamically.
This report provides an exhaustive technical blueprint, detailing the database schemata, algorithmic implementations, and integration strategies required to fulfill the user's specific requirements: a "Bring Your Own Key" (BYOK) model for Gemini, local document ingestion (RAG), ad-free monetization via RevenueCat, and a dynamic, AI-generated user interface for flashcards. The analysis confirms that while the "no backend" constraint introduces significant engineering challenges—particularly regarding JavaScript execution on the Hermes engine and state persistence—it offers unparalleled advantages in user privacy, data sovereignty, and operational scalability.
2. Core Data Infrastructure: The Hybrid Knowledge Store
In a serverless architecture, the local database must assume the roles traditionally distributed across cloud infrastructure: it must be the relational system of record, the vector database for semantic search, and the graph store for curriculum dependencies. The selection and optimization of this persistence layer are the single most critical engineering decisions for the project.
2.1. Selection of the Database Engine: The Case for op-sqlite
The standard expo-sqlite library, while reliable for basic CRUD operations, utilizes a serialized bridge to communicate between the JavaScript thread and the native SQLite binary. For an application requiring high-frequency vector operations—such as calculating cosine similarity for hundreds of text chunks during a RAG retrieval—this bridge introduces unacceptable latency.
The analysis indicates that op-sqlite (formerly react-native-quick-sqlite) is the requisite solution.1 By leveraging the JavaScript Interface (JSI), op-sqlite exposes C++ bindings directly to the JavaScript runtime. This allows for the synchronous execution of SQL commands and the direct passing of complex data structures (like Float32Array for vectors) without the serialization overhead of the React Native Bridge. Furthermore, op-sqlite supports the dynamic loading of extensions, which is essential for enabling sqlite-vec or libsql vector search capabilities directly on the device.3 This capability transforms the local SQLite instance into a vector database capable of supporting the "Upload material" requirement without external dependencies like Pinecone or Milvus.
2.2. Designing the Knowledge Graph Schema
To fulfill the requirement of "gradual progress," the system must model the Japanese language not as a flat list of words, but as a Directed Acyclic Graph (DAG) of dependencies. For instance, the concept of "Godan Verbs" (Node A) is a prerequisite for "TE-form" (Node B), which is in turn a prerequisite for "Present Progressive" (Node C).
While dedicated graph databases like Neo4j exist, they are not viable for a local-only mobile app. Instead, we employ a relational schema that models graph structures using adjacency lists, queryable via Recursive Common Table Expressions (CTEs). This allows the application to traverse complex dependency trees using standard SQL, enforcing pedagogical scaffolding.5
Table 1: curriculum_nodes Schema
Column
	Type
	Constraints
	Description
	node_id
	TEXT
	PRIMARY KEY
	UUID v4. Unique identifier for the concept.
	title
	TEXT
	NOT NULL
	Human-readable label (e.g., "Particle WA").
	type
	TEXT
	CHECK(type IN ('grammar', 'vocab', 'kanji'))
	Classification of the node.
	jlpt_level
	INTEGER
	CHECK(jlpt_level BETWEEN 1 AND 5)
	Standardized difficulty level.
	content_payload
	TEXT
	JSON
	Structured lesson content, rule definitions, and prompts.
	embedding
	BLOB
	

	Pre-computed vector embedding of the concept description.
	Table 2: node_dependencies Schema
Column
	Type
	Constraints
	Description
	parent_id
	TEXT
	FOREIGN KEY
	ID of the prerequisite concept.
	child_id
	TEXT
	FOREIGN KEY
	ID of the dependent concept.
	dependency_type
	TEXT
	DEFAULT 'strict'
	'strict' (must master) or 'soft' (recommended).
	Recursive CTE for Prerequisite Resolution:
To generate a valid lesson plan, the system must identify all unsatisfied prerequisites for a target topic. The following SQL query utilizes a recursive CTE to traverse the dependency tree upwards from a target node:


SQL




WITH RECURSIVE prerequisites AS (
 -- Base Case: Direct parents of the target node
 SELECT parent_id, child_id, 1 as depth
 FROM node_dependencies
 WHERE child_id =? -- Target Concept ID
 
 UNION ALL
 
 -- Recursive Step: Parents of the parents
 SELECT d.parent_id, d.child_id, p.depth + 1
 FROM node_dependencies d
 JOIN prerequisites p ON d.child_id = p.parent_id
)
SELECT c.title, c.node_id, u.mastery_score
FROM prerequisites p
JOIN curriculum_nodes c ON p.parent_id = c.node_id
LEFT JOIN user_progress u ON c.node_id = u.node_id
ORDER BY depth DESC;

This query enables the agent to act as a "Curriculum Architect," denying access to advanced topics until the foundational nodes in the graph have reached a sufficient BKT mastery threshold.6
2.3. Vector Storage for Retrieval-Augmented Generation (RAG)
The "Upload material" feature requires the system to ingest unstructured text (PDFs) and make it semantically searchable. We utilize the sqlite-vec extension to create virtual tables optimized for vector similarity search.
Table 3: document_vectors (Virtual Table)


SQL




CREATE VIRTUAL TABLE document_vectors USING vec0(
 chunk_id INTEGER PRIMARY KEY AUTOINCREMENT,
 embedding FLOAT -- Dimension must match the Gemini Embedding model (e.g., text-embedding-004)
);

Table 4: document_metadata


SQL




CREATE TABLE document_metadata (
 chunk_id INTEGER PRIMARY KEY,
 document_id TEXT,
 content_text TEXT,
 page_number INTEGER,
 FOREIGN KEY(chunk_id) REFERENCES document_vectors(rowid)
);

This separation of concerns allows for high-performance KNN (K-Nearest Neighbors) searches on the virtual table, followed by a JOIN to retrieve the actual text content. This architecture ensures that even with hundreds of pages of uploaded content, the retrieval latency remains sub-millisecond, adhering to the performance expectations of a native mobile app.2
3. The Cognitive Engine: Pedagogical Algorithms
A critical distinction between a chatbot and a tutor is the presence of a "Student Model"—a mathematical representation of the learner's knowledge state. To satisfy the requirements of "Progress" tracking and "Flash cards," we implement two complementary algorithms: Bayesian Knowledge Tracing (BKT) for measuring mastery and Free Spaced Repetition Scheduler (FSRS) for managing memory decay.
3.1. Modeling Mastery with Bayesian Knowledge Tracing (BKT)
BKT is a Hidden Markov Model (HMM) that assumes knowledge is a binary latent variable (Learned/Not Learned) that can only be inferred through observations (Correct/Incorrect answers). It is superior to simple percentage tracking because it accounts for "lucky guesses" and "careless slips," providing a robust probability of true mastery.7
Mathematical Formulation:
The model maintains a probability    that a skill is learned at time   . Upon an observation (attempt), the probability is updated.
1. Likelihood of Learning (  ):
   * If the user answers Correctly:
  
   * If the user answers Incorrectly:
  
   * Where    is the Slip Probability (user knows it but erred) and    is the Guess Probability (user doesn't know but guessed right).
      2. Transition (Learning Event):
      * The user may have learned the skill during the exercise itself.
  
      * Where    is the Transition Probability (likelihood of learning).
Implementation in TypeScript:
Since no native React Native library exists for BKT, we must implement a BKTModel class. The state (  ) is stored in the user_progress table.


TypeScript




// Core BKT Update Logic
export const updateMastery = (
 prior: number,
 isCorrect: boolean,
 params: { p_transit: number; p_guess: number; p_slip: number }
): number => {
 let likelihood: number;
 if (isCorrect) {
   const num = prior * (1 - params.p_slip);
   const denom = num + (1 - prior) * params.p_guess;
   likelihood = num / denom;
 } else {
   const num = prior * params.p_slip;
   const denom = num + (1 - prior) * (1 - params.p_guess);
   likelihood = num / denom;
 }
 return likelihood + (1 - likelihood) * params.p_transit;
};

This probability score (0.0 to 1.0) drives the "Progress" UI. A mastery score > 0.95 triggers the unlocking of dependent nodes in the curriculum graph.10
3.2. Optimizing Retention with FSRS
While BKT determines if a topic needs to be taught, FSRS determines when it needs to be reviewed. The Free Spaced Repetition Scheduler (FSRS) is a modern algorithm that outperforms the traditional SM-2 (Anki) algorithm by separately modeling memory Stability (how long until you forget) and Difficulty (how hard it is to remember).7
Implementation: We integrate the ts-fsrs library, which is fully compatible with JavaScript environments.12
         1. Card Entity: Each flashcard stored in SQLite corresponds to an FSRS Card object.
         2. Review Process:
         * User reviews a card and selects a rating: Again, Hard, Good, or Easy.
         * The app retrieves the card's current stability and difficulty from the DB.
         * ts-fsrs computes the new parameters and the next due_date.
         3. Scheduling: A SQL query selects cards where due_date <= NOW() for the daily review session.
Strategic Insight: By running FSRS locally, the app ensures that the user's review schedule is mathematically optimized for their specific memory retention curve, completely independent of server uptime or connectivity.13
4. Generative Intelligence & BYOK Architecture
The "Brain" of the tutor relies on Large Language Models (LLMs). The requirement for "Bring Your Own Key" (BYOK) with Gemini dictates a specific architectural pattern that balances security, cost, and functionality.
4.1. The "Choose Model" Strategy
The UI requirement to "Choose model" implies the user can select between different tiers of intelligence (e.g., Gemini 1.5 Flash for speed/cost, Gemini 1.5 Pro for reasoning).
Architectural Pattern: The Model Provider
We implement a ModelProvider class that abstracts the API interactions. This allows the app to switch models dynamically based on user settings without refactoring the core agent logic.


TypeScript




type ModelType = 'gemini-1.5-flash' | 'gemini-1.5-pro';

class GeminiClient {
 private apiKey: string;
 private model: ModelType;

 constructor(apiKey: string, model: ModelType) {
   this.apiKey = apiKey;
   this.model = model;
 }

 async generate(prompt: string, context?: string): Promise<string> {
   const modelName = this.model;
   // Initialize Google Gen AI SDK with specific model configuration
   const genAI = new GoogleGenerativeAI(this.apiKey);
   const generativeModel = genAI.getGenerativeModel({ model: modelName });
   // Execute generation...
 }
}

Implications for the User:
         * Gemini 1.5 Flash: Recommended for "Chat," "Flashcard Generation," and "Grammar Checking" due to low latency and cost efficiency.
         * Gemini 1.5 Pro: Recommended for "Deep Explanations" or "Complex PDF Analysis" where reasoning capability outweighs speed.
The "Settings" screen must allow users to toggle this preference, effectively giving them control over their own API usage costs.
4.2. Secure Key Storage
Implementing BYOK shifts the security burden to the client. We utilize expo-secure-store to encrypt the API key on the device's hardware-backed Keychain (iOS) or Keystore (Android).14
            * Lifecycle: The key is never persisted in Redux/Zustand state or AsyncStorage (which are unencrypted). It is retrieved from SecureStore asynchronously only at the moment of constructing the API request and cleared from memory when the session ends.
            * Context: While this protects against file-system extraction, the report must note that on a rooted/jailbroken device, memory dumping is theoretically possible. However, this is the industry-standard security posture for BYOK applications.14
5. Agentic Orchestration: LangGraph on Mobile
To create a tutor that can plan lessons, consult the database, and adapt to user mood, we require an agentic framework. LangGraph is selected for its ability to model interactions as cyclic state machines rather than linear chains.
5.1. The Supervisor-Worker Topology
The agent is architected as a graph of specialized nodes controlled by a Supervisor.
            1. Supervisor (Router): Analyzes the user's input to determine intent.
            * Intent: "Teach me X"    Route to Curriculum Agent.
            * Intent: "Review"    Route to FSRS Agent.
            * Intent: "What does this mean?"    Route to RAG Agent.
               2. Curriculum Agent: Queries the SQLite graph for prerequisites, checks BKT mastery, and generates a lesson plan.
               3. RAG Agent: Vector searches the user's PDFs and synthesizes an answer.
               4. Analyst Agent: Runs morphological analysis on user Japanese input to update BKT states.
5.2. Resolving the Hermes Compatibility Crisis
A major hurdle in this implementation is the incompatibility between LangChain/LangGraph and the Hermes JavaScript engine used by React Native. LangChain relies on Node.js/Web standard APIs like ReadableStream, TextEncoder, and AsyncGenerator which are not fully supported in Hermes.17
The Polyfill Strategy:
To prevent "locked stream" errors and runtime crashes, a rigorous polyfill injection is required at the application entry point (index.js).


JavaScript




// index.js - Critical Polyfills
import 'react-native-get-random-values'; // For UUID generation
import { polyfill as polyfillEncoding } from 'react-native-polyfill-globals/src/encoding';
import { polyfill as polyfillReadableStream } from 'react-native-polyfill-globals/src/readable-stream';
import 'core-js/proposals/async-iterator-helpers'; // For async generators

polyfillEncoding();
polyfillReadableStream();

Fallback Mechanism: Even with polyfills, streaming large responses can be unstable on Android. The implementation plan recommends a configuration flag to disable streaming (stream: false) for the LLM if stability issues persist, trading the "typing effect" for application reliability.17
5.3. Persistence via SQLite Checkpointer
LangGraph requires a "checkpointer" to save the state of the conversation graph (memory). Since there is no backend Redis, we implement a custom SQLite Checkpointer.18 This component serializes the graph state (messages, current context, tool outputs) into JSON and writes it to a checkpoints table in op-sqlite. This ensures that if the user closes the app, the "brain" freezes exactly in place and resumes seamlessly upon reopening.
6. Feature Implementation: Ingestion & RAG Pipeline
The "Upload material" feature differentiates this app from generic tutors. It requires a robust local pipeline to convert raw files into vector-searchable knowledge.
6.1. Native PDF Extraction
JavaScript-based PDF parsers (like pdf.js) are performant on the web but disastrous on mobile, blocking the JS thread and causing UI freezes. We utilize expo-pdf-text-extract, a library that bridges to native iOS (PDFKit) and Android (PdfBox) APIs.20 This offloads processing to the OS, enabling the extraction of text from hundreds of pages in milliseconds.
6.2. The Ingestion Logic Flow
               1. File Selection: User selects a file via expo-document-picker.
               2. Extraction: expo-pdf-text-extract returns the raw text string.
               3. Tokenization & Chunking:
               * Challenge: Japanese has no whitespace. Standard splitters fail.
               * Solution: We use the morphological analyzer (detailed in Section 8) to tokenize the text into words, then group them into chunks of ~500 tokens with 10% overlap to preserve context.
               4. Embedding: The chunks are sent to the Gemini API (using the BYOK key) to generate vector embeddings. (Note: On-device embedding models like ONNX are possible but add ~100MB to the bundle size; using the existing Gemini key is efficient for this architecture).
               5. Storage: The vectors and text chunks are inserted into the document_vectors and document_metadata tables in SQLite.
7. Feature Implementation: AI Tools & Dynamic UI
The requirement for "AI generated tools (Flash cards)" implies that the UI cannot be static. The agent must be able to "dream up" an interface structure which the app then renders. This is the Generative UI pattern.21
7.1. The JSON Schema Strategy
We define a strict JSON schema for flashcards that the LLM must adhere to.
Prompt Instruction:
"Generate 5 flashcards based on the user's uploaded PDF. Return only a JSON array matching this schema: [{ "front": string, "back": string, "type": "vocab" | "grammar" }]."
7.2. The Dynamic Renderer
We build a React Native component (FlashcardRenderer) that maps this JSON structure to UI components.
               * Data: [ { "front": "猫", "back": "Cat (Neko)", "type": "vocab" } ]
               * Render: The component iterates through this array, rendering a <Flashcard /> component for each entry.
               * Interactivity: The renderer automatically binds the FSRS rating buttons (Easy/Good/Hard/Again) to each generated card, connecting the ephemeral AI content to the persistent FSRS database.
8. Feature Implementation: Monetization & Settings
The user requires "Disable Ads" and "Donations" without a backend. This is achieved through RevenueCat, which acts as the backend-as-a-service for In-App Purchases (IAP).
8.1. "Disable Ads" (Non-Consumable)
This is a standard one-time purchase or subscription.
               * Setup: Create a "Pro" entitlement in RevenueCat linked to products in Apple/Google stores.
               * Logic:
TypeScript
const { customerInfo } = await Purchases.getCustomerInfo();
const isPro = typeof customerInfo.entitlements.active['pro_access']!== "undefined";

               * Ad Integration: We use react-native-google-mobile-ads. The BannerAd component is wrapped in a conditional check: {!isPro && <BannerAd... /> }.
8.2. "Donations" (Consumable)
Donations are best modeled as Consumable IAPs (e.g., "Buy me a coffee").
                  * Implementation: In RevenueCat, configure a product (e.g., donation_tier_1).
                  * Purchase Flow: When purchased, the app displays a "Thank You" animation. Since it's a donation, no persistent entitlement is strictly required, but tracking the total_donated amount locally in SQLite adds a gamification element ("Supporter Level").23
8.3. Client-Side Verification
Without a backend to verify receipts, we rely on RevenueCat's client-side caching. The RevenueCat SDK caches the user's entitlements locally. This ensures that even if the device goes offline, the "Disable Ads" status remains active, respecting the "Autonomous/Offline" ideology.25
9. Frontend Engineering: Navigation and Japanese UX
9.1. Specialized Japanese Input Analysis
To properly update the BKT model, the system must understand why a user's sentence is correct or incorrect. A string comparison is insufficient. We integrate react-native-japanese-text-analyzer.26
                  * Function: This library wraps native engines (MeCab on iOS, Kuromoji on Android) to tokenize Japanese text.
                  * Application: When a user replies to a prompt, the text is tokenized. The agent compares the token structure (e.g., "Verb-Stem" + "Mashita") against the expected grammar rule. This allows for precise feedback ("You used the dictionary form instead of the stem") rather than a generic "Wrong answer."
9.2. Pitch Accent Visualization
To address the visual nature of Japanese pitch accent, we implement a visualization component using react-native-svg.
                  * Data Source: A static SQLite table containing pitch accent data (e.g., word: hashi, pattern: L-H-H).
                  * Rendering: A custom component draws a line graph over the text characters—starting low, rising, and dropping based on the pattern. This visual aid is embedded dynamically into flashcards and chat bubbles, providing immediate pronunciation cues.27
9.3. Navigation and State
                  * Expo Router: Used for file-based routing, simplifying deep linking and navigation structure.
                  * State Management: Zustand is recommended over Redux for its minimal boilerplate and ease of use with async storage persistence. It manages transient UI state (e.g., "is typing"), while persistent data rests in SQLite.
10. Implementation Roadmap
Phase 1: Foundation (Weeks 1-4)
                  * Objective: Functional Chat UI with persistent memory.
                  * Tasks:
                  * Initialize Expo with dev-client (required for op-sqlite).
                  * Implement op-sqlite schema (Curriculum Graph, User Progress).
                  * Setup react-native-gifted-chat UI.
                  * Implement LangGraph with SQLite Checkpointer and Polyfills.
Phase 2: The Cognitive Core (Weeks 5-8)
                  * Objective: Intelligence and Tracking.
                  * Tasks:
                  * Implement BKTModel class and database triggers.
                  * Integrate ts-fsrs and create the Flashcard logic.
                  * Build ModelProvider for switching between Gemini variants.
                  * Securely integrate API keys via expo-secure-store.
Phase 3: Content & Specialization (Weeks 9-12)
                  * Objective: RAG and Japanese nuances.
                  * Tasks:
                  * Integrate expo-pdf-text-extract and the ingestion pipeline.
                  * Implement sqlite-vec for document storage.
                  * Integrate react-native-japanese-text-analyzer for input parsing.
                  * Build the SVG Pitch Accent visualizer.
Phase 4: Polish & Monetization (Weeks 13-16)
                  * Objective: Release readiness.
                  * Tasks:
                  * Integrate RevenueCat (Donations/Ads) and AdMob.
                  * Build the "Progress" screen with visualizations (Charts based on BKT data).
                  * Profile memory usage and optimize Hermes startup time.
                  * Final testing of Offline capabilities.
11. Conclusion
The architecture defined in this report demonstrates that the "no backend" constraint is not a limitation, but a design feature that enforces user privacy and app longevity. By leveraging the specific capabilities of op-sqlite for high-performance vector and graph operations, and adapting LangGraph for the mobile environment via robust polyfills, we can host a complex, autonomous tutor entirely on the user's device.
This system transcends simple chatbot interactions by integrating BKT and FSRS, effectively embedding a cognitive scientist into the application logic. The result is a Japanese tutor that plans, tracks, adapts, and grows with the learner, offering a premium, personalized educational experience while maintaining zero server overhead for the developer.
Works cited
                  1. Why not op-sqlite : r/reactnative - Reddit, accessed on February 9, 2026, https://www.reddit.com/r/reactnative/comments/1oso49s/why_not_opsqlite/
                  2. Building Vector Search and Personal Knowledge Graphs on Mobile with libSQL and React Native - Turso, accessed on February 9, 2026, https://turso.tech/blog/building-vector-search-and-personal-knowledge-graphs-on-mobile-with-libsql-and-react-native
                  3. sqliteai/sqlite-vector: SQLite-Vector is a cross-platform, ultra-efficient SQLite extension that brings vector search capabilities to your embedded database. - GitHub, accessed on February 9, 2026, https://github.com/sqliteai/sqlite-vector
                  4. asg017/sqlite-vec: A vector search SQLite extension that runs anywhere! - GitHub, accessed on February 9, 2026, https://github.com/asg017/sqlite-vec
                  5. 3. Recursive Common Table Expressions - SQLite, accessed on February 9, 2026, https://sqlite.org/lang_with.html
                  6. Avoiding recursive CTE materialisation - SQLite User Forum, accessed on February 9, 2026, https://sqlite.org/forum/forumpost/08c696f77a
                  7. Building an AI Japanese Tutor
                  8. How sqlite-vec Works for Storing and Querying Vector Embeddings | by Stephen Collins, accessed on February 9, 2026, https://medium.com/@stephenc211/how-sqlite-vec-works-for-storing-and-querying-vector-embeddings-165adeeeceea
                  9. Bayesian knowledge tracing - Wikipedia, accessed on February 9, 2026, https://en.wikipedia.org/wiki/Bayesian_knowledge_tracing
                  10. Optimizing Bayesian Knowledge Tracing with Neural Network Parameter Generation, accessed on February 9, 2026, https://jedm.educationaldatamining.org/index.php/JEDM/article/view/758
                  11. Standard Bayesian Knowledge Tracing Models, accessed on February 9, 2026, https://iedms.github.io/standard-bkt/
                  12. open-spaced-repetition/ts-fsrs: ts-fsrs is a versatile package written in TypeScript that supports ES modules, CommonJS, and UMD. - GitHub, accessed on February 9, 2026, https://github.com/open-spaced-repetition/ts-fsrs
                  13. I built a native FSRS algorithm for Obsidian with AI flashcard generation - Reddit, accessed on February 9, 2026, https://www.reddit.com/r/ObsidianMD/comments/1qcrj1s/i_built_a_native_fsrs_algorithm_for_obsidian_with/
                  14. 5 Ways to Store Sensitive Data Securely in Expo Apps | by The Fagbayibo - Medium, accessed on February 9, 2026, https://medium.com/codetodeploy/5-ways-to-store-sensitive-data-securely-in-expo-apps-855de1fd8d49
                  15. SecureStore - Expo Documentation, accessed on February 9, 2026, https://docs.expo.dev/versions/latest/sdk/securestore/
                  16. Security - React Native, accessed on February 9, 2026, https://reactnative.dev/docs/security
                  17. This stream has already been locked for exclusive reading by another reader · Issue #1302 · langchain-ai/langgraphjs - GitHub, accessed on February 9, 2026, https://github.com/langchain-ai/langgraphjs/issues/1302
                  18. Simple LangGraph Implementation with Memory AsyncSqliteSaver Checkpointer — FastAPI, accessed on February 9, 2026, https://medium.com/@devwithll/simple-langgraph-implementation-with-memory-asyncsqlitesaver-checkpointer-fastapi-54f4e4879a2e
                  19. langgraph/libs/checkpoint-sqlite/langgraph/checkpoint/sqlite/__init__.py at main · langchain-ai/langgraph - GitHub, accessed on February 9, 2026, https://github.com/langchain-ai/langgraph/blob/main/libs/checkpoint-sqlite/langgraph/checkpoint/sqlite/__init__.py
                  20. Native PDF Text Extraction for React Native & Expo | by Pathik Gandhi | Jan, 2026 | Medium, accessed on February 9, 2026, https://medium.com/@gr8pathik/introducing-expo-pdf-text-extract-native-pdf-text-extraction-for-react-native-expo-b0a414993e44
                  21. Building Dynamic Layouts in React with JSON-Based UI Schema: A Comprehensive Guide, accessed on February 9, 2026, https://medium.com/@niravkhetani333/building-dynamic-layouts-in-react-with-json-based-ui-schema-a-comprehensive-guide-713025b18d28
                  22. The Developer's Guide to Generative UI in 2026 | Blog - CopilotKit, accessed on February 9, 2026, https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026
                  23. Revenuecat for Remove Ads : r/FlutterFlow - Reddit, accessed on February 9, 2026, https://www.reddit.com/r/FlutterFlow/comments/1gynxo9/revenuecat_for_remove_ads/
                  24. Remove ads purchase best practices [flutter] - RevenueCat Community, accessed on February 9, 2026, https://community.revenuecat.com/general-questions-7/remove-ads-purchase-best-practices-flutter-864
                  25. Expo | In-App Subscriptions Made Easy - RevenueCat, accessed on February 9, 2026, https://www.revenuecat.com/docs/getting-started/installation/expo
                  26. A Japanese Text Morphological Analyzer for React Native using Kuromoji for Android and Mecab for iOS - GitHub, accessed on February 9, 2026, https://github.com/swkidd/react-native-japanese-text-analyzer
                  27. IllDepence/SVG_pitch: Japanese pitch accent annotations in simple SVG. - GitHub, accessed on February 9, 2026, https://github.com/IllDepence/SVG_pitch
                  28. opensiriusfox/jaPitchPlotter: A tool to produce SVGs of Japanese pitch accent patterns, accessed on February 9, 2026, https://github.com/opensiriusfox/jaPitchPlotter