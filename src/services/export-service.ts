import { File, Paths } from 'expo-file-system';
import { getNodesWithProgress } from './curriculum-service';

/**
 * Escapes a string for CSV by wrapping in double quotes and doubling any existing double quotes.
 */
function escapeCSVField(field: unknown): string {
  if (field === null || field === undefined) {
    return '';
  }
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports the entire curriculum with user progress to a local CSV file.
 * Returns the URI of the generated file.
 */
export async function exportCurriculumToCSV(): Promise<string> {
  const nodes = await getNodesWithProgress();

  // Define headers
  const headers = [
    'Node ID',
    'Type',
    'JLPT Level',
    'Title',
    'Unlocked',
    'Mastery Score',
    'Attempts',
    'Summary',
    'Source File'
  ];

  // Map each node to a CSV row
  const rows = nodes.map(node => {
    const rowData = [
      node.nodeId,
      node.type,
      node.jlptLevel,
      node.title,
      node.unlocked ? 'Yes' : 'No',
      node.masteryScore,
      node.attempts,
      node.summary || '',
      node.sourceFile || ''
    ];

    return rowData.map(escapeCSVField).join(',');
  });

  // Combine headers and rows
  const csvContent = [headers.join(','), ...rows].join('\n');

  // Create file reference in the cache directory
  const file = new File(Paths.cache, 'curriculum_export.csv');

  // Write content to file
  file.write(csvContent, { encoding: 'utf8' });

  return file.uri;
}

