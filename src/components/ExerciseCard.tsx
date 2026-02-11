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
} from 'react-native';
import type { ParsedExercise } from '../services/tutor-agent';

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
      <Text style={styles.question}>{exercise.question}</Text>

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
                optionStyle = { ...styles.option, ...styles.optionCorrect };
                textStyle = { ...styles.optionText, ...styles.optionTextCorrect };
              } else if (isSelected && !isCorrectOption) {
                optionStyle = { ...styles.option, ...styles.optionWrong };
                textStyle = { ...styles.optionText, ...styles.optionTextWrong };
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
                {submitted && isSelected && !isCorrectOption && (
                  <Text style={styles.crossmark}>✗</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Text input for fill-blank and translate */}
      {(exercise.type === 'fill-blank' || exercise.type === 'translate') && (
        <View style={styles.inputContainer}>
          <TextInput
            style={[
              styles.input,
              submitted && isCorrect && styles.inputCorrect,
              submitted && isCorrect === false && styles.inputWrong,
            ]}
            value={inputValue}
            onChangeText={setInputValue}
            placeholder={
              exercise.type === 'fill-blank'
                ? 'Type the missing word...'
                : 'Type your translation...'
            }
            placeholderTextColor="#666"
            editable={!submitted}
            onSubmitEditing={() => handleSubmit(inputValue)}
            returnKeyType="send"
          />
          {!submitted ? (
            <TouchableOpacity
              style={[styles.submitBtn, !inputValue.trim() && styles.submitBtnDisabled]}
              onPress={() => handleSubmit(inputValue)}
              disabled={!inputValue.trim()}
            >
              <Text style={styles.submitBtnText}>Check</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.resultBadge}>
              <Text style={styles.resultText}>
                {isCorrect ? '✓' : '✗'}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Show correct answer if wrong */}
      {submitted && isCorrect === false && (
        <View style={styles.correctAnswerBox}>
          <Text style={styles.correctAnswerLabel}>Correct answer:</Text>
          <Text style={styles.correctAnswerText}>{exercise.answer}</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#0d0d1a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
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
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  resultBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultText: {
    fontSize: 22,
    fontWeight: '700',
  },

  // Correct answer reveal
  correctAnswerBox: {
    marginTop: 10,
    backgroundColor: '#22c55e10',
    borderRadius: 10,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#22c55e',
  },
  correctAnswerLabel: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  correctAnswerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});
