import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from 'expo-router';
import { useAppStore, type ModelType } from '../../src/store/app-store';
import { processDocument, getUploadedDocuments } from '../../src/services/document-service';

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
  const [uploadedDocs, setUploadedDocs] = useState<Array<{ documentId: string; filename: string; processed: number }>>([]);

  // Load uploaded documents on focus
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const docs = await getUploadedDocuments();
          setUploadedDocs(docs);
        } catch {}
      })();
    }, [])
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

  const handleUploadMaterial = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain', 'text/markdown'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0];

        if (!useAppStore.getState().isGeminiReady) {
          Alert.alert('API Key Required', 'Please add a Gemini API key first to process documents.');
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
                try {
                  const count = await processDocument(
                    file.uri,
                    file.name,
                    file.mimeType || 'text/plain',
                  );
                  Alert.alert('✅ Success', `Imported ${count} items from ${file.name}!`);
                  // Refresh doc list
                  const docs = await getUploadedDocuments();
                  setUploadedDocs(docs);
                } catch (error) {
                  Alert.alert('Error', error instanceof Error ? error.message : 'Failed to process file.');
                } finally {
                  setIsProcessing(false);
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
          <Text style={styles.sectionTitle}>🔑 Gemini API Keys</Text>
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
              No API keys added. Get a free key from Google AI Studio.
            </Text>
          )}
        </View>

        {/* Model Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🤖 Model</Text>

          <View style={styles.modelOptions}>
            <TouchableOpacity
              style={[styles.modelOption, currentModel === 'gemini-3-flash-preview' && styles.modelSelected]}
              onPress={() => handleModelChange('gemini-3-flash-preview')}
            >
              <Text style={styles.modelName}>Gemini 3 Flash (Preview)</Text>
              <Text style={styles.modelDesc}>Fast, efficient, lower cost</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modelOption, currentModel === 'gemini-3-pro-preview' && styles.modelSelected]}
              onPress={() => handleModelChange('gemini-3-pro-preview')}
            >
              <Text style={styles.modelName}>Gemini 3 Pro (Preview)</Text>
              <Text style={styles.modelDesc}>Advanced reasoning</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Upload Materials */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📄 Upload Materials</Text>
          <Text style={styles.sectionSubtitle}>
            Upload PDFs, text files, or markdown to expand your curriculum
          </Text>

          <TouchableOpacity
            style={[styles.uploadButton, isProcessing && styles.uploadDisabled]}
            onPress={handleUploadMaterial}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <View style={styles.uploadProcessing}>
                <ActivityIndicator size="small" color="#6366f1" />
                <Text style={styles.uploadButtonText}>Processing...</Text>
              </View>
            ) : (
              <Text style={styles.uploadButtonText}>📁 Choose File</Text>
            )}
          </TouchableOpacity>

          {uploadedDocs.length > 0 && (
            <View style={styles.docList}>
              {uploadedDocs.map((doc) => (
                <View key={doc.documentId} style={styles.docItem}>
                  <Text style={styles.docName}>{doc.filename}</Text>
                  <Text style={[
                    styles.docStatus,
                    doc.processed === 1 && styles.docStatusDone,
                    doc.processed === -1 && styles.docStatusFailed,
                  ]}>
                    {doc.processed === 1 ? '✅' : doc.processed === -1 ? '❌' : '⏳'}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Support */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>❤️ Support</Text>
          <Text style={styles.sectionSubtitle}>
            This app is completely free. Donations help with development!
          </Text>

          <TouchableOpacity style={styles.donateButton} onPress={handleDonation}>
            <Text style={styles.donateButtonText}>Make a Donation</Text>
          </TouchableOpacity>
        </View>

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
  },
  modelSelected: {
    borderColor: '#6366f1',
  },
  modelName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modelDesc: {
    color: '#666',
    fontSize: 13,
    marginTop: 2,
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
  docItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
  },
  docName: {
    color: '#ccc',
    fontSize: 14,
    flex: 1,
  },
  docStatus: {
    fontSize: 16,
    marginLeft: 8,
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
});
