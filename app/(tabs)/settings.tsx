import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
  import { useState, useEffect, useCallback, useRef } from 'react';
  import * as DocumentPicker from 'expo-document-picker';
  import { useFocusEffect } from 'expo-router';
  import { useAppStore, type ModelType } from '../../src/store/app-store';
  import { MODEL_RATES } from '../../src/services/groq-client';
import { deleteAllCurriculum } from '../../src/services/curriculum-service';
import { seedStarterCurriculum } from '../../src/services/seed-service';

  import { processDocument, getUploadedDocuments, deleteDocument } from '../../src/services/document-service';
  import { resetProgress } from '../../src/services/progress-service';

  export default function SettingsScreen() {
    const {
      apiKeys,
      currentModel,
      addApiKey,
      removeApiKey,
      setCurrentModel,
    } = useAppStore();
  
    const [newKey, setNewKey] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [uploadedDocs, setUploadedDocs] = useState<Array<{ documentId: string; filename: string; processed: number }>>([]);
    const abortController = useRef<AbortController | null>(null);
  
    const loadDocuments = useCallback(async () => {
        try {
            const docs = await getUploadedDocuments();
            setUploadedDocs(docs);
        } catch {}
    }, []);

    // Load uploaded documents on focus
    useFocusEffect(
      useCallback(() => {
        loadDocuments();
      }, [loadDocuments])
    );
  
    const handleAddKey = () => {
      if (newKey.trim()) {
        addApiKey(newKey.trim());
        setNewKey('');
      }
    };
  
    const handleRemoveKey = (index: number) => {
      Alert.alert('Remove Key', 'Are you sure you want to remove this API key?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeApiKey(index),
        },
      ]);
    };
  
    const handleModelChange = (model: ModelType) => {
      setCurrentModel(model);
    };

    const handleCancelUpload = () => {
        if (abortController.current) {
            abortController.current.abort();
            abortController.current = null;
        }
    };

    const handleRemoveDocument = (documentId: string, filename: string) => {
        Alert.alert(
            'Delete Document',
            `Are you sure you want to delete "${filename}"? This will remove all vocabulary and grammar extracted from it.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteDocument(documentId);
                            loadDocuments(); // Refresh list
                        } catch (error) {
                            Alert.alert('Error', 'Failed to delete document.');
                        }
                    }
                }
            ]
        );
    };
  
    const handleUploadMaterial = async () => {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['application/pdf', 'text/plain', 'text/markdown'],
          copyToCacheDirectory: true,
        });
  
        if (!result.canceled && result.assets[0]) {
          const file = result.assets[0];
  
          if (!useAppStore.getState().isGeminiReady) {
            Alert.alert('API Key Required', 'Please add an API key first to process documents.');
            return;
          }
  
          Alert.alert(
            'Process File',
            `${file.name}\n\nThe AI will analyze this and add vocabulary, grammar, and kanji to your curriculum.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Process',
                onPress: async () => {
                  setIsProcessing(true);
                  setUploadProgress(0);
                  setProgressMessage('Initializing...');
                  abortController.current = new AbortController();

                  try {
                    const count = await processDocument(
                      file.uri,
                      file.name,
                      file.mimeType || 'text/plain',
                      {
                        signal: abortController.current.signal,
                        onProgress: (progress, message) => {
                            setUploadProgress(progress);
                            setProgressMessage(message);
                        }
                      }
                    );
                    Alert.alert('✅ Success', `Imported ${count} items from ${file.name}!`);
                    // Refresh doc list
                    const docs = await getUploadedDocuments();
                    setUploadedDocs(docs);
                  } catch (error) {
                    const msg = error instanceof Error ? error.message : 'Failed to process file.';
                    if (msg === 'Aborted' || msg === 'Process cancelled by user.') {
                        // Silent fail for abort
                    } else {
                        Alert.alert('Error', msg);
                    }
                  } finally {
                    setIsProcessing(false);
                    setUploadProgress(0);
                    setProgressMessage('');
                    abortController.current = null;
                  }
                },
              },
            ]
          );
        }
      } catch (error) {
        console.error('Document picker error:', error);
      }
    };

  const handleResetProgress = () => {
    Alert.alert(
      '⚠️ Reset Progress',
      'Are you sure? This will delete all your mastery scores and learning history. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetProgress();
              Alert.alert('Reset Complete', 'Your progress has been reset to zero.');
            } catch (error) {
              console.error('Failed to reset progress:', error);
              Alert.alert('Error', 'Failed to reset progress. Please try again.');
            }
          },
        },
      ]
    );
  };


  const handleDeleteAllCurriculum = () => {
    Alert.alert(
      '💣 Delete All Curriculum',
      'Are you sure? This will delete EVERYTHING: all lessons, vocabulary, flashcards, documents, and progress. The app will be reset to a fresh state.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsProcessing(true);
              await deleteAllCurriculum();
              Alert.alert('Reset Complete', 'All curriculum data has been deleted. You can seed the starter content again.');
            } catch (error) {
              console.error('Failed to delete curriculum:', error);
              Alert.alert('Error', 'Failed to delete curriculum.');
            } finally {
              setIsProcessing(false);
              loadDocuments(); // Refresh (should be empty)
            }
          },
        },
      ]
    );
  };

  const handleSeedCurriculum = () => {
    Alert.alert(
      '🌱 Seed Starter Curriculum',
      'This will add the default N5 vocabulary, grammar, and kanji to your curriculum.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Seed',
          onPress: async () => {
            try {
              setIsProcessing(true);
              await seedStarterCurriculum();
              Alert.alert('Success', 'Starter curriculum has been seeded.');
            } catch (error) {
              console.error('Failed to seed curriculum:', error);
              Alert.alert('Error', 'Failed to seed curriculum.');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleDonation = () => {
    Alert.alert(
      '❤️ Support Development',
      'Thank you for considering a donation! This helps keep the app free for everyone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: '☕ $3 Coffee', onPress: () => console.log('TODO: RevenueCat purchase') },
        { text: '🍱 $10 Meal', onPress: () => console.log('TODO: RevenueCat purchase') },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* API Keys Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔑 API Keys</Text>
          <Text style={styles.sectionSubtitle}>
            Add multiple keys for automatic rotation when rate limits are hit
          </Text>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Enter API key..."
              placeholderTextColor="#666"
              value={newKey}
              onChangeText={setNewKey}
              secureTextEntry
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.addButton} onPress={handleAddKey}>
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>

          {apiKeys.map((key, index) => (
            <View key={index} style={styles.keyItem}>
              <Text style={styles.keyText}>
                Key {index + 1}: ••••{key.slice(-8)}
              </Text>
              <TouchableOpacity onPress={() => handleRemoveKey(index)}>
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}

          {apiKeys.length === 0 && (
            <Text style={styles.noKeysText}>
              No API keys added. Get a key from your provider (e.g. Groq).
            </Text>
          )}
        </View>

        {/* Model Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🤖 Model</Text>

          <View style={styles.modelOptions}>
            {(Object.keys(MODEL_RATES) as ModelType[]).map((model) => {
               const rate = MODEL_RATES[model];
               const totalRpm = rate.rpm * (apiKeys.length || 1);
               const totalRpd = rate.rpd * (apiKeys.length || 1);
               const isSelected = currentModel === model;

               return (
                <TouchableOpacity
                  key={model}
                  style={[styles.modelOption, isSelected && styles.modelSelected]}
                  onPress={() => handleModelChange(model)}
                >
                  <View style={styles.modelHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.modelName}>{model}</Text>
                      {model === 'qwen/qwen3-32b' && (
                        <View style={styles.recommendedBadge}>
                          <Text style={styles.recommendedText}>Recommended</Text>
                        </View>
                      )}
                    </View>
                    {isSelected && <View style={styles.selectedBadge} />}
                  </View>
                  {apiKeys.length > 0 && (
                    <>
                      <Text style={styles.modelDesc}>
                        Limits: ~{totalRpm} RPM / ~{totalRpd.toLocaleString()} RPD
                      </Text>
                      <Text style={styles.modelSubDesc}>
                        ({apiKeys.length} key{apiKeys.length !== 1 ? 's' : ''} configured)
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
               );
            })}
          </View>

          {apiKeys.length === 0 && (
            <Text style={styles.freeTierWarning}>
              ⚠️ Using the public free tier. Complex requests or high traffic may cause rate limit errors or slow responses. Add an API key above to bypass this.
            </Text>
          )}
        </View>

        {/* Upload Materials */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📄 Upload Materials</Text>
          <Text style={styles.sectionSubtitle}>
            Upload PDFs, text files, or markdown to expand your curriculum.
            {'\n'}Note: This process uses the 'llama-3.3-70b-versatile' model to ensure highest extraction quality.
          </Text>

          {isProcessing ? (
            <View style={styles.processingContainer}>
              <View style={styles.progressRow}>
                <ActivityIndicator size="small" color="#6366f1" />
                <Text style={styles.progressText}>
                    {progressMessage || 'Processing...'} ({Math.round(uploadProgress * 100)}%)
                </Text>
              </View>
              
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${Math.round(uploadProgress * 100)}%` }]} />
              </View>
              
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancelUpload}>
                <Text style={styles.cancelButtonText}>Cancel Upload</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
                style={styles.uploadButton}
                onPress={handleUploadMaterial}
            >
                <Text style={styles.uploadButtonText}>📁 Choose File</Text>
            </TouchableOpacity>
          )}

          {/* Document list */}
          {uploadedDocs.length > 0 && (
            <View style={styles.docList}>
                <Text style={styles.subHeader}>Uploaded Documents</Text>
                {uploadedDocs.map((doc) => (
                    <View key={doc.documentId} style={styles.docItem}>
                        <View style={styles.docInfo}>
                            <Text style={styles.docName} numberOfLines={1}>{doc.filename}</Text>
                            <Text style={styles.docStatus}>
                                {doc.processed === -1 ? '❌ Failed' : 
                                 doc.processed === 0 ? '⏳ Processing' : 
                                 '✅ API Processed'}
                            </Text>
                        </View>
                        <TouchableOpacity 
                            onPress={() => handleRemoveDocument(doc.documentId, doc.filename)}
                            style={styles.deleteDocButton}
                        >
                            <Text style={styles.deleteDocText}>✕</Text>
                        </TouchableOpacity>
                    </View>
                ))}
            </View>
          )}

          {/* Document list hidden — managed via Curriculum tab */}
        </View>

        {/* Starter Content */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🌱 Starter Content</Text>
          <Text style={styles.sectionSubtitle}>
            Add the starter N5 curriculum to your database
          </Text>

          <TouchableOpacity 
            style={[styles.dangerButton, { borderColor: '#166534', backgroundColor: '#052e16' }]} 
            onPress={handleSeedCurriculum}
            disabled={isProcessing}
          >
            <Text style={[styles.dangerButtonText, { color: '#4ade80' }]}>Seed Starter Curriculum</Text>
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🚫 Danger Zone</Text>
          <TouchableOpacity style={styles.dangerButton} onPress={handleResetProgress}>
            <Text style={styles.dangerButtonText}>Reset Progress Only</Text>
          </TouchableOpacity>
          
          <View style={{ height: 12 }} />

          <TouchableOpacity style={styles.dangerButton} onPress={handleDeleteAllCurriculum}>
            <Text style={styles.dangerButtonText}>Delete All Curriculum</Text>
          </TouchableOpacity>
        </View>

        {/* Support */}
        {/* Support section hidden for now
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>❤️ Support</Text>
          <Text style={styles.sectionSubtitle}>
            This app is completely free. Donations help with development!
          </Text>

          <TouchableOpacity style={styles.donateButton} onPress={handleDonation}>
            <Text style={styles.donateButtonText}>Make a Donation</Text>
          </TouchableOpacity>
        </View>
        */}

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.versionText}>Japanese Tutor v1.0.0</Text>
          <Text style={styles.versionText}>
            {apiKeys.length} API key{apiKeys.length !== 1 ? 's' : ''} configured • {currentModel}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#666',
    fontSize: 14,
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 15,
  },
  addButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  keyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    marginTop: 10,
  },
  keyText: {
    color: '#fff',
    fontSize: 14,
  },
  removeText: {
    color: '#ef4444',
    fontSize: 14,
  },
  noKeysText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  modelOptions: {
    gap: 10,
  },
  modelOption: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 8,
  },
  modelSelected: {
    borderColor: '#6366f1',
    backgroundColor: '#232333',
  },
  modelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modelName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  selectedBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6366f1',
  },
  modelDesc: {
    color: '#aaa',
    fontSize: 13,
    marginTop: 2,
  },
  modelSubDesc: {
    color: '#666',
    fontSize: 12,
    marginTop: 1,
  },
  uploadButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderStyle: 'dashed',
  },
  uploadButtonText: {
    color: '#6366f1',
    fontSize: 16,
    fontWeight: '500',
  },
  uploadDisabled: {
    opacity: 0.6,
  },
  uploadProcessing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  docList: {
    marginTop: 12,
    gap: 8,
  },

  subHeader: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  docItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
  },
  docInfo: {
    flex: 1,
    marginRight: 10,
  },
  docName: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 4,
  },
  docStatus: {
    color: '#666',
    fontSize: 12,
  },
  deleteDocButton: {
    padding: 8,
    backgroundColor: '#2a1a1a',
    borderRadius: 8,
  },
  deleteDocText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: 'bold',
  },
  docStatusDone: {},
  docStatusFailed: {},
  donateButton: {
    backgroundColor: '#4a1d7e',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  donateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  versionText: {
    color: '#444',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  dangerButton: {
    backgroundColor: '#3f1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  freeTierWarning: {
    color: '#fbbf24',
    fontSize: 13,
    marginTop: 12,
    lineHeight: 18,
    backgroundColor: '#451a03',
    padding: 12,
    borderRadius: 8,
  },
  dangerButtonText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
  processingContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  progressText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 3,
  },
  cancelButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '500',
  },
  recommendedBadge: {
    backgroundColor: '#064e3b',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#059669',
  },
  recommendedText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
