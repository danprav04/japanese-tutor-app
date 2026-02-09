---
name: japanese_tutor_core
description: Core architecture and data infrastructure for the Japanese Tutor app, focusing on Local-First principles and op-sqlite.
---

# Japanese Tutor Core Architecture

## System Philosophy: "Local-First" Autonomous Tutor
The objective is a fully autonomous React Native and Expo application functioning without a developer-managed backend. The mobile device is the primary computational node for data persistence, cognitive modeling, and generative orchestration.

### Key Benefits
- User privacy and data sovereignty.
- Operational scalability (zero server overhead).
- Offline capability.

## Core Data Infrastructure: Hybrid Knowledge Store
The system uses `op-sqlite` for high-performance relational, vector, and graph operations.

### Selection: op-sqlite
- **Why**: Leverages JSI for C++ bindings directly to JavaScript, avoiding bridge latency.
- **Extensions**: Supports `sqlite-vec` or `libsql` for on-device vector search.

### Curriculum Knowledge Graph Schema
Model Japanese as a Directed Acyclic Graph (DAG) of dependencies using recursive CTEs.

#### Tables
- `curriculum_nodes`: Stores concepts (title, type, JLPT, content, embeddings).
- `node_dependencies`: Stores parent-child prerequisites.

### Vector Storage for RAG
- Virtual table `document_vectors` using `vec0`.
- `document_metadata` for mapping chunks to text and documents.
- Use sub-millisecond KNN searches for "Upload material" feature.

## Secure Key Storage (BYOK)
The "Bring Your Own Key" model requires secure client-side storage.
- **Tool**: `expo-secure-store`.
- **Practice**: Encrypt keys on hardware-backed Keychain (iOS) or Keystore (Android). Never persist keys in Redux, Zustand, or AsyncStorage. Retrieve asynchronously only at the moment of API request.

## Monetization (RevenueCat & Ads)
The app stays autonomous by using RevenueCat as a backend-as-a-service for IAP.
- **Disable Ads**: Non-consumable purchase. Check active entitlements via `getCustomerInfo()`.
- **Donations**: Consumable IAPs (e.g., "Buy me a coffee").
- **Ad Integration**: `react-native-google-mobile-ads`. Wrap `BannerAd` in a conditional check: `{!isPro && <BannerAd... /> }`.
- **Offline Respect**: Use RevenueCat's client-side caching to ensure "Pro" status persists offline.

## Implementation Guidelines
1. **Never use a backend**: All data must persist in `op-sqlite`.
2. **Synchronous SQL**: Use `op-sqlite`'s synchronous execution for performance-critical logic.
3. **Graph Mastery**: Ensure advanced topics are locked until prerequisites reach a BKT mastery threshold (>0.95).
