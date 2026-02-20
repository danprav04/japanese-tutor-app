/**
 * ExerciseCard — Interactive quiz component for chat exercises.
 *
 * Renders differently based on exercise type:
 *  - choose: Tappable option buttons (A/B/C/D)
 *  - fill-blank: Text input with submit button
 *  - translate: Text input with submit button
 *
 * On answer submission, calls the onAnswer callback with the user's answer.
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  Dimensions,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import type { ParsedExercise } from '../services/tutor-agent';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface ExerciseCardProps {
  exercise: ParsedExercise;
  onAnswer: (answer: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  'fill-blank': '✏️ Fill in the Blank',
  translate: '🔄 Translate',
  choose: '🔘 Choose the Answer',
};

export default function ExerciseCard({ exercise, onAnswer }: ExerciseCardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (answer: string) => {
    if (submitted || !answer.trim()) return;
    setSubmitted(true);
    setSelected(answer);
    onAnswer(answer);
  };

  // Check if the answer is correct (simple comparison)
  const isCorrect = selected
    ? selected.trim().toLowerCase() === exercise.answer.trim().toLowerCase()
    : null;

  return (
    <View style={styles.container}>
      {/* Type header */}
      <Text style={styles.typeLabel}>
        {TYPE_LABELS[exercise.type] || exercise.type}
      </Text>

      {/* Question */}
      <View style={styles.markdownWrapper}>
        <Markdown
          style={markdownStyles}
          rules={{
            // Disable default paragraph margin to fit better in card
            paragraph: (node: any, children: any, parent: any, styles: any) => (
              <Text key={node.key} style={styles.paragraph}>
                {children}
              </Text>
            ),
          }}
        >
          {exercise.question}
        </Markdown>
      </View>

      {/* Hint */}
      {exercise.hint && (
        <Text style={styles.hint}>💡 {exercise.hint}</Text>
      )}

      {/* Multiple choice options */}
      {exercise.type === 'choose' && exercise.options && (
        <View style={styles.optionsContainer}>
          {exercise.options.map((option, i) => {
            const letter = ['A', 'B', 'C', 'D'][i] || String(i + 1);
            const isSelected = selected === option;
            const isCorrectOption =
              submitted && option.trim().toLowerCase() === exercise.answer.trim().toLowerCase();

            let optionStyle = styles.option;
            let textStyle = styles.optionText;

            if (submitted) {
              if (isCorrectOption) {
                // Strict match = Green
                optionStyle = { ...styles.option, ...styles.optionCorrect };
                textStyle = { ...styles.optionText, ...styles.optionTextCorrect };
              } else if (isSelected) {
                // Selected but not strict match = Neutral (Blue/Selected)
                // We do NOT mark it red/wrong, we let AI judge it.
                optionStyle = { ...styles.option, ...styles.optionSelected };
              }
            } else if (isSelected) {
              optionStyle = { ...styles.option, ...styles.optionSelected };
            }

            return (
              <TouchableOpacity
                key={i}
                style={optionStyle}
                onPress={() => handleSubmit(option)}
                disabled={submitted}
                activeOpacity={0.7}
              >
                <Text style={styles.optionLetter}>{letter}</Text>
                <Text style={textStyle}>{option}</Text>
                {submitted && isCorrectOption && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
                {/* Removed Crossmark for 'wrong' answers */}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Text input for fill-blank and translate */}
      {(exercise.type === 'fill-blank' || exercise.type === 'translate') && (
        <View style={styles.inputContainer}>
          {!submitted ? (
            <>
              <TextInput
                style={styles.input}
                value={inputValue}
                onChangeText={setInputValue}
                placeholder="Type the missing word..."
                placeholderTextColor="#666"
                editable={!submitted}
                onSubmitEditing={() => handleSubmit(inputValue)}
                returnKeyType="send"
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={[styles.submitBtn, !inputValue.trim() && styles.submitBtnDisabled]}
                onPress={() => handleSubmit(inputValue)}
                disabled={!inputValue.trim()}
              >
                <Text style={styles.submitBtnText}>Check</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.submittedRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.submittedAnswer}>Your answer: {selected}</Text>
                {isCorrect && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.submittedHint}>
                {isCorrect ? 'Perfect match! ✨' : 'Sensei is checking... ✨'}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 16,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  typeLabel: {
    color: '#a5b4fc',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  question: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 8,
    lineHeight: 26,
  },
  hint: {
    color: '#f59e0b',
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 12,
  },

  // Multiple choice
  optionsContainer: {
    marginTop: 8,
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d0d1a',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  optionSelected: {
    borderColor: '#6366f1',
    backgroundColor: '#6366f115',
  },
  optionCorrect: {
    borderColor: '#22c55e',
    backgroundColor: '#22c55e15',
  },
  optionWrong: {
    borderColor: '#ef4444',
    backgroundColor: '#ef444415',
  },
  optionLetter: {
    color: '#6366f1',
    fontSize: 14,
    fontWeight: '700',
    marginRight: 10,
    width: 20,
  },
  optionText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  optionTextCorrect: {
    color: '#22c55e',
  },
  optionTextWrong: {
    color: '#ef4444',
  },
  checkmark: {
    color: '#22c55e',
    fontSize: 18,
    fontWeight: '700',
  },
  crossmark: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: '700',
  },

  // Text input
  inputContainer: {
    marginTop: 12,
    gap: 10,
  },
  input: {
    backgroundColor: '#0d0d1a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    minHeight: 44,
  },
  inputCorrect: {
    borderColor: '#22c55e',
  },
  inputWrong: {
    borderColor: '#ef4444',
  },
  submitBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  // Submitted state
  submittedRow: {
    backgroundColor: '#0d0d1a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  submittedAnswer: {
    color: '#a5b4fc',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  submittedHint: {
    color: '#666',
    fontSize: 13,
    fontStyle: 'italic',
  },
  markdownWrapper: {
    marginBottom: 8,
  },
});

const markdownStyles = StyleSheet.create({
  body: {
    color: '#fff',
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    maxWidth: SCREEN_WIDTH * 0.8,
  },
  paragraph: {
    marginVertical: 0,
    flexWrap: 'wrap',
    flexDirection: 'row',
  },
  code_inline: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4,
    paddingHorizontal: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fence: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  strong: {
    fontWeight: 'bold',
    color: '#fff',
  },
  em: {
    fontStyle: 'italic',
  },
});
