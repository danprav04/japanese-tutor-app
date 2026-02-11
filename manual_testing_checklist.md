# Manual Testing Checklist: AI Tutor Enhancements

This document outlines manual verification steps for the features implemented across the last two development cycles.

## 1. Progress Tracking & Goals

### Daily Study Goals (New)
- [ ] **Launch App**: Verify the "Daily Goal" card appears on the Progress screen.
- [ ] **Initial State**: Confirm the default goal is 10 cards/day.
- [ ] **Adjust Goal**: Tap the goal options (5, 10, 15, 20, 25). Verify the UI updates immediately and persists after app restart.
- [ ] **Progress Ring**: Perform a review session. Verify the "Daily Goal" progress bar fills up.
- [ ] **Completion**: Complete the daily goal. Verify the card shows a "Great job!" or completion message.

### Detailed Analytics (Enhanced)
- [ ] **Streak Calendar**: Verify the weekly streak calendar shows activity dots for days you reviewed cards.
- [ ] **Mastery Distribution**: Check the "By Category" breakdown (Vocab/Grammar/Kanji). Verify numbers match your actual progress.
- [ ] **Recent Activity**: detailed list of recently modified items with their $\%$ mastery change.

## 2. Flashcards & Review

### Deleting Flashcards (New)
- [ ] **Open Flashcards**: Go to the Flashcards tab.
- [ ] **Flip Card**: Tap a card to flip it to the back.
- [ ] **Delete Button**: Locate the 🗑️ trash icon on the top-right of the back face.
- [ ] **Confirmation**: Tap delete. Verify an Alert dialog appears asking for confirmation.
- [ ] **Cancel**: Tap "Cancel". Verify the card remains.
- [ ] **Confirm Delete**: Tap "Delete". Verify the card is removed from the queue immediately and the next card appears (or session ends if empty).

### Study Session
- [ ] **Session Completion**: Complete a full review session. Verify the "Session Complete" summary screen appears with accurate stats (Correct/Wrong counts).

## 3. Chat & Interactive Exercises

### Interactive Exercises (New)
- [ ] **Generate Exercise**: Ask the tutor: "Give me a quiz on N5 verbs".
- [ ] **UI Rendering**: Verify exercises appear as interactive cards, NOT plain text.
    - **Multiple Choice**: Buttons for A, B, C, D.
    - **Fill-in-Blank/Translate**: Text input field with a "Check" button.
- [ ] **Interaction**:
    - **Select Option**: Tap an answer. Verify immediate visual feedback (Green for correct, Red for wrong).
    - **Submit Text**: Type an answer and tap "Check". Verify feedback.
- [ ] **Tutor Feedback**: Verify the tutor acknowledges your answer in the chat flow.

### Conversation Summarization (New Logic)
- [ ] **Long Conversation**: Have a long conversation (>20 messages).
- [ ] **Summarization Trigger**: Continue chatting. Verify that older messages are replaced by a summary (you might need to check logs or notice the context window shifting, but the chat should remain coherent).
- [ ] **Context Continuity**: Ask about something mentioned early in the conversation. The AI should still "remember" it via the summary.

### AI-Generated Titles (New)
- [ ] **New Chat**: Start a completely new conversation thread.
- [ ] **First Exchange**: Send a message and get a reply.
- [ ] **History List**: Open the chat history/sidebar.
- [ ] **Title Check**: Verify the thread has a relevant, short (3-5 word) title instead of just "New conversation" or a raw text preview.

## 4. Curriculum Management

### Curriculum Screen
- [ ] **List View**: Go to the Curriculum tab. Verify items are listed with their mastery status.
- [ ] **Filter/Search**: Test any filtering capabilities.
- [ ] **Edit/Delete**: (If implemented) Try editing or removing a curriculum item.

## 5. Technical / Persistence

- [ ] **App Restart**: Close and reopen the app.
    - [ ] Verify **Daily Goal** setting is remembered.
    - [ ] Verify **Conversation History** and **Titles** are preserved.
    - [ ] Verify **Flashcard Reviews** are persisted (due dates updated).
